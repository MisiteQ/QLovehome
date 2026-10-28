"""QLovehome 家庭仪表盘集成.

功能:
- 侧边栏注册 iframe 面板
- 托管前端静态文件 (custom_components/qlovehome/www)
- 配置持久化到「集成自身目录」custom_components/qlovehome/qlh/qlh-config.json
  → 换电脑 / 换浏览器 / 换手机，打开 HA 都是同一份配置
- 接口有两套（内容完全一致，读写同一个文件）：
  * WebSocket: qlovehome/get_config / qlovehome/save_config
               qlovehome/get_ui     / qlovehome/save_ui
               qlovehome/get_timers / qlovehome/set_timer / qlovehome/clear_timer
               qlovehome/service_call   ← 设备操控（走后端记审计日志）
               qlovehome/get_audit      ← 读取操作记录（最近动态）
  * REST     : GET/POST /api/qlh/config, GET/POST /api/qlh/ui
               GET/POST/DELETE /api/qlh/timer
               POST /api/qlh/service, GET /api/qlh/audit
  WebSocket 只在集成「已添加」时前端才拿得到 hass，所以 REST 作为兜底，
  保证仅仅是丢个文件夹进 custom_components 也能存住配置。
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.helpers.event import async_track_point_in_utc_time
from homeassistant.util import dt as dt_util

from .const import (
    AUDIT_FILE,
    AUDIT_MAX_BYTES,
    AUDIT_MAX_ENTRIES,
    API_AUDIT_URL,
    API_SERVICE_URL,
    API_TIMER_URL,
    API_UI_URL,
    API_URL,
    DATA_DIR_NAME,
    DATA_FILE,
    DOMAIN,
    INTEGRATION_NAME,
    LEGACY_CONFIG_FILE,
    LEGACY_STORAGE_DIR,
    PANEL_PATH,
    PANEL_URL,
    TIMER_CATCHUP_SECONDS,
    TIMER_EVENT,
    TIMER_KEY,
)

_LOGGER = logging.getLogger(__name__)

WS_GET_CONFIG = "qlovehome/get_config"
WS_SAVE_CONFIG = "qlovehome/save_config"
WS_GET_UI = "qlovehome/get_ui"
WS_SAVE_UI = "qlovehome/save_ui"
WS_GET_TIMERS = "qlovehome/get_timers"
WS_SET_TIMER = "qlovehome/set_timer"
WS_CLEAR_TIMER = "qlovehome/clear_timer"
WS_SERVICE_CALL = "qlovehome/service_call"   # 设备操控（走后端记审计）
WS_GET_AUDIT = "qlovehome/get_audit"         # 读取操作记录


# ── 存储路径 ────────────────────────────────────────────────
def _data_path() -> Path:
    """配置文件路径 = 集成目录/qlh/qlh-config.json."""
    return Path(__file__).parent / DATA_DIR_NAME / DATA_FILE


def _mirror_path(hass: HomeAssistant) -> Path:
    """镜像路径 = /config/qlh/qlh-config.json.

    集成目录在 HACS 升级时可能被整个替换，留一份镜像，升级后自动恢复。
    """
    return Path(hass.config.path(DATA_DIR_NAME)) / DATA_FILE


def _legacy_path(hass: HomeAssistant) -> Path:
    return Path(hass.config.path(LEGACY_STORAGE_DIR)) / LEGACY_CONFIG_FILE


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _read_version() -> str:
    """从 manifest.json 读版本号（关于页显示用，和前端保持实时同步）."""
    try:
        mf = Path(__file__).parent / "manifest.json"
        if mf.exists():
            data = json.loads(mf.read_text(encoding="utf-8"))
            v = data.get("version", "0.0.0")
            return str(v)
    except (OSError, ValueError):
        pass
    return "0.0.0"


# ── 审计日志（操作记录 / 最近动态）────────────────────────
# 存 JSONL（每行一条 JSON），和配置同目录
def _audit_path() -> Path:
    return _data_path().parent / AUDIT_FILE


def _audit_rotate() -> None:
    """超过 AUDIT_MAX_BYTES → 把 .log 重命名为 .log.1，继续写新文件."""
    p = _audit_path()
    if not p.exists():
        return
    try:
        if p.stat().st_size >= AUDIT_MAX_BYTES:
            rotated = p.with_suffix(p.suffix + ".1")
            if rotated.exists():
                rotated.unlink()
            p.rename(rotated)
            _LOGGER.debug("QLovehome 审计日志已轮转: %s", rotated)
    except OSError:
        _LOGGER.exception("审计日志轮转失败")


def _audit_write(event: str, **detail) -> None:
    """写一条审计记录（线程安全：每次独立打开文件追加）."""
    _audit_rotate()
    entry = {
        "time": datetime.now(timezone.utc).isoformat(),
        "event": event,
    }
    if detail:
        entry.update(detail)
    try:
        p = _audit_path()
        _ensure_parent(p)
        with p.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        _LOGGER.exception("写入审计日志失败")


def _audit_read_recent(limit: int, event: str | None = None) -> list[dict]:
    """逆序读取审计日志，返回最近 N 条（可选按 event 过滤）."""
    limit = min(max(limit, 1), AUDIT_MAX_ENTRIES)
    result: list[dict] = []
    for log_file in (_audit_path(), _audit_path().with_suffix(AUDIT_FILE + ".1")):
        if not log_file.exists():
            continue
        try:
            lines = log_file.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        # 从后往前扫，直到凑够 limit
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            if event and entry.get("event") != event:
                continue
            result.append(entry)
            if len(result) >= limit:
                return result
    return result


def _read(hass: HomeAssistant) -> dict:
    """读配置：集成目录 → /config/qlh 镜像 → 旧版 /config/lovehome."""
    path = _data_path()
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            _LOGGER.exception("读取 QLovehome 配置失败: %s", path)
            return {}

    # 集成目录被 HACS 升级清空 → 从镜像恢复
    mirror = _mirror_path(hass)
    if mirror.exists():
        try:
            data = json.loads(mirror.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data:
                _write(hass, data)
                _LOGGER.info("已从镜像恢复配置: %s", mirror)
                return data
        except (OSError, ValueError):
            _LOGGER.exception("读取镜像配置失败: %s", mirror)

    legacy = _legacy_path(hass)
    if legacy.exists():
        try:
            data = json.loads(legacy.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data:
                _write(hass, data)
                _LOGGER.info("已把旧配置迁移到 %s", path)
                return data
        except (OSError, ValueError):
            _LOGGER.exception("迁移旧配置失败: %s", legacy)
    return {}


def _write(hass: HomeAssistant, data: dict) -> None:
    """写集成目录（主）+ /config/qlh（镜像，升级不丢）."""
    text = json.dumps(data, ensure_ascii=False, indent=2)
    for path in (_data_path(), _mirror_path(hass)):
        try:
            _ensure_parent(path)
            tmp = path.with_suffix(".json.tmp")
            tmp.write_text(text, encoding="utf-8")
            tmp.replace(path)
        except OSError:
            _LOGGER.exception("写入 QLovehome 配置失败: %s", path)
    _LOGGER.debug("QLovehome 配置已保存")


def _read_ui(hass: HomeAssistant) -> dict:
    ui = _read(hass).get("ui")
    return ui if isinstance(ui, dict) else {}


def _write_ui(hass: HomeAssistant, ui: dict) -> dict:
    """只更新 ui 段，其它配置原样保留（避免和编辑器互相覆盖）."""
    data = _read(hass)
    merged = data.get("ui")
    merged = merged if isinstance(merged, dict) else {}
    merged.update(ui or {})
    data["ui"] = merged
    _write(hass, data)
    return merged


# ── 定时 / 倒计时持久化 ─────────────────────────────────────
# 存在配置文件顶层 timers 段（和 ui / 编辑器配置同一个文件，换电脑跟着走）
# 结构: { "light.xxx": {"end": 毫秒时间戳, "act": "on"/"off", "n": "名字"} }
def _read_timers(hass: HomeAssistant) -> dict:
    timers = _read(hass).get(TIMER_KEY)
    return timers if isinstance(timers, dict) else {}


def _write_timers(hass: HomeAssistant, timers: dict) -> dict:
    data = _read(hass)
    data[TIMER_KEY] = timers
    _write(hass, data)
    return timers


def _save_config_keep_timers(hass: HomeAssistant, cfg: dict) -> dict:
    """整份保存配置时，timers 段一律以服务器上的实时值为准.

    定时只通过 set_timer / clear_timer 修改；前端保存配置时可能带着一份旧快照，
    直接照抄会把新设的定时丢掉、或把已执行的又写回来。
    """
    merged = dict(cfg)
    old = _read(hass).get(TIMER_KEY)
    if isinstance(old, dict) and old:
        merged[TIMER_KEY] = old
    else:
        merged.pop(TIMER_KEY, None)
    return merged


# ── 装机流程 ────────────────────────────────────────────────
async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """YAML 层初始化：静态目录 / 接口 / 面板全部在这里就绪。

    这样即便用户只是把文件夹丢进 custom_components（没有在 UI 里「添加集成」），
    配置依然能存到 HA 服务器上，不会退回浏览器缓存。
    """
    _ensure_parent(_data_path())
    await _async_register_static(hass)
    _async_register_api(hass)
    _async_register_ws(hass)
    _async_register_panel_later(hass)
    _async_register_timers_later(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """通过 UI 添加集成时执行（幂等，重复注册有保护）."""
    await _async_register_static(hass)
    _async_register_api(hass)
    _async_register_ws(hass)
    _async_register_timers_later(hass)
    await _async_register_panel(hass)
    _LOGGER.info("QLovehome 集成已就绪，配置存放于 %s", _data_path())
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """卸载集成：摘掉侧边栏面板（配置文件保留，重装后自动接上）."""
    store = hass.data.get(DOMAIN) or {}
    try:
        if store.get("panel") and hass.panels.get(PANEL_PATH):
            hass.panels.async_unregister(PANEL_PATH)
            store["panel"] = False
    except Exception:  # noqa: BLE001
        _LOGGER.debug("面板卸载失败", exc_info=True)
    return True


async def _async_register_static(hass: HomeAssistant) -> None:
    """托管前端静态文件（只注册一次）."""
    store = hass.data.setdefault(DOMAIN, {})
    if store.get("static"):
        return
    www_dir = Path(__file__).parent / "www"
    try:
        if hasattr(hass.http, "async_register_static_paths"):
            from homeassistant.components.http import StaticPathConfig

            await hass.http.async_register_static_paths(
                [StaticPathConfig(PANEL_URL, str(www_dir), cache_headers=False)]
            )
        else:  # 兼容旧版 HA
            hass.http.register_static_path(PANEL_URL, str(www_dir), cache_headers=False)
        store["static"] = True
    except Exception as exc:  # noqa: BLE001 - 静态目录失败不该拖垮整个集成
        _LOGGER.warning("前端静态目录注册失败: %s", exc)


@callback
def _async_register_ws(hass: HomeAssistant) -> None:
    store = hass.data.setdefault(DOMAIN, {})
    if store.get("ws"):
        return
    for cmd in (
        ws_get_config,
        ws_save_config,
        ws_get_ui,
        ws_save_ui,
        ws_get_timers,
        ws_set_timer,
        ws_clear_timer,
        ws_service_call,
        ws_get_audit,
    ):
        websocket_api.async_register_command(hass, cmd)
    store["ws"] = True


@callback
def _async_register_api(hass: HomeAssistant) -> None:
    store = hass.data.setdefault(DOMAIN, {})
    if store.get("api"):
        return
    views = [QlhConfigView(hass), QlhUiView(hass), QlhTimerView(hass),
             QlhAuditView(hass), QlhServiceView(hass)]
    for view in views:
        hass.http.register_view(view)
    store["api"] = True


@callback
def _async_register_panel_later(hass: HomeAssistant) -> None:
    """面板依赖 frontend，等 HA 启动完成再注册；已添加集成时立即注册."""

    async def _when_started(_event) -> None:
        await _async_register_panel(hass)

    if hass.is_running:
        hass.async_create_task(_async_register_panel(hass))
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _when_started)


async def _async_register_panel(hass: HomeAssistant) -> None:
    store = hass.data.setdefault(DOMAIN, {})
    if store.get("panel"):
        return
    try:
        frontend.async_register_built_in_panel(
            hass,
            component_name="iframe",
            sidebar_title=INTEGRATION_NAME,
            sidebar_icon="mdi:home-heart",
            frontend_url_path=PANEL_PATH,
            config={"url": f"{PANEL_URL}/index.html"},
            require_admin=False,
        )
        store["panel"] = True
        _LOGGER.info("QLovehome 侧边栏面板已注册")
    except Exception as exc:  # noqa: BLE001 - 面板注册失败不影响核心功能
        _LOGGER.warning("侧边栏面板注册失败（不影响使用）: %s", exc)
        _LOGGER.warning(
            "可手动添加仪表盘 → 网页卡片 iframe → 地址: %s/index.html", PANEL_URL
        )


# ── 定时调度（跑在 HA 服务器上，关面板 / 退出账号照常执行）──
@callback
def _async_register_timers_later(hass: HomeAssistant) -> None:
    """HA 启动完成后恢复所有定时任务（只挂一次）."""
    store = hass.data.setdefault(DOMAIN, {})
    if store.get("timers_hook"):
        return
    store["timers_hook"] = True

    async def _restore(_event=None) -> None:
        try:
            await _async_restore_timers(hass)
        except Exception:  # noqa: BLE001 - 恢复失败不该拖垮集成
            _LOGGER.exception("恢复 QLovehome 定时任务失败")

    if hass.is_running:
        hass.async_create_task(_restore())
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _restore)


@callback
def _schedule_timer(hass: HomeAssistant, entity_id: str, item: dict) -> None:
    """把一条定时挂到事件循环（同一实体只保留一个）."""
    store = hass.data.setdefault(DOMAIN, {})
    unsubs = store.setdefault("timer_unsub", {})
    _cancel_timer(hass, entity_id)

    try:
        end = float(item.get("end")) / 1000.0
    except (TypeError, ValueError):
        return

    @callback
    def _on_time(_now) -> None:
        unsubs.pop(entity_id, None)
        hass.async_create_task(_async_fire_timer(hass, entity_id, dict(item)))

    unsubs[entity_id] = async_track_point_in_utc_time(
        hass, _on_time, dt_util.utc_from_timestamp(end)
    )


@callback
def _cancel_timer(hass: HomeAssistant, entity_id: str) -> None:
    store = hass.data.get(DOMAIN) or {}
    unsubs = store.get("timer_unsub") or {}
    unsub = unsubs.pop(entity_id, None)
    if unsub:
        unsub()


async def _async_fire_timer(hass: HomeAssistant, entity_id: str, item: dict) -> None:
    """到点执行：调 turn_on / turn_off，然后把任务从服务器配置里删掉."""
    act = item.get("act") or "off"
    name = item.get("n") or entity_id
    state = hass.states.get(entity_id)
    already = bool(state and (
        (act == "off" and state.state in ("off", "closed"))
        or (act == "on" and state.state in ("on", "open"))
    ))
    fired = False
    if not already:
        domain, service = entity_id.split(".", 1)[0], "turn_on" if act == "on" else "turn_off"
        if not hass.services.has_service(domain, service):
            domain, service = "homeassistant", service
        try:
            await hass.services.async_call(
                domain, service, {"entity_id": entity_id}, blocking=False
            )
            _LOGGER.info("QLovehome 定时执行: %s · %s", name, "开启" if act == "on" else "关闭")
            fired = True
        except Exception:  # noqa: BLE001 - 单条失败不影响调度
            _LOGGER.exception("QLovehome 定时执行失败: %s", entity_id)

    def _drop() -> dict:
        timers = _read_timers(hass)
        timers.pop(entity_id, None)
        return _write_timers(hass, timers)

    try:
        await hass.async_add_executor_job(_drop)
    except Exception:  # noqa: BLE001
        _LOGGER.exception("清理已执行的定时失败: %s", entity_id)

    hass.bus.async_fire(
        TIMER_EVENT, {"entity_id": entity_id, "act": act, "name": name}
    )

    # 审计：定时到点自动触发
    await hass.async_add_executor_job(
        _audit_write, "timer_fired",
        entity_id=entity_id, act=act, name=name, fired=fired,
    )


async def _async_restore_timers(hass: HomeAssistant) -> None:
    """HA 启动 / 集成加载时把存下来的定时重新挂上.

    HA 停机期间已经到点的：12 小时内补执行（免得重启丢掉），更久的丢弃。
    """
    timers = await hass.async_add_executor_job(_read_timers, hass)
    if not timers:
        return

    now = dt_util.utcnow().timestamp()
    keep: dict = {}
    for entity_id, item in list(timers.items()):
        if not isinstance(item, dict):
            continue
        try:
            end = float(item.get("end")) / 1000.0
        except (TypeError, ValueError):
            continue
        if end <= now:
            if now - end <= TIMER_CATCHUP_SECONDS:
                await _async_fire_timer(hass, entity_id, dict(item))
            else:
                _LOGGER.info("QLovehome 定时早已过期，丢弃: %s", entity_id)
            continue
        keep[entity_id] = item
        _schedule_timer(hass, entity_id, item)

    def _sync() -> None:
        _write_timers(hass, keep)

    await hass.async_add_executor_job(_sync)
    if keep:
        _LOGGER.info("QLovehome 已恢复 %s 个定时任务", len(keep))


# ── WebSocket API ───────────────────────────────────────────
@websocket_api.websocket_command({vol.Required("type"): WS_GET_CONFIG})
@websocket_api.async_response
async def ws_get_config(hass, connection, msg):
    """前端拉取完整配置（附带集成版本号）."""
    data = await hass.async_add_executor_job(_read, hass)
    version = await hass.async_add_executor_job(_read_version)
    connection.send_result(msg["id"], {"config": data, "version": version})


@websocket_api.websocket_command(
    {vol.Required("type"): WS_SAVE_CONFIG, vol.Required("config"): dict}
)
@websocket_api.async_response
async def ws_save_config(hass, connection, msg):
    """前端保存完整配置（保留服务器上正在跑的定时）."""
    cfg = _save_config_keep_timers(hass, msg["config"])
    await hass.async_add_executor_job(_write, hass, cfg)
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): WS_GET_UI})
@websocket_api.async_response
async def ws_get_ui(hass, connection, msg):
    """前端拉取界面设置."""
    ui = await hass.async_add_executor_job(_read_ui, hass)
    connection.send_result(msg["id"], {"ui": ui})


@websocket_api.websocket_command(
    {vol.Required("type"): WS_SAVE_UI, vol.Required("ui"): dict}
)
@websocket_api.async_response
async def ws_save_ui(hass, connection, msg):
    """前端保存界面设置（只更新 ui 段）."""
    merged = await hass.async_add_executor_job(_write_ui, hass, msg["ui"])
    connection.send_result(msg["id"], {"ui": merged})


@websocket_api.websocket_command({vol.Required("type"): WS_GET_TIMERS})
@websocket_api.async_response
async def ws_get_timers(hass, connection, msg):
    """前端拉取服务器上的定时任务."""
    timers = await hass.async_add_executor_job(_read_timers, hass)
    connection.send_result(msg["id"], {"timers": timers})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_SET_TIMER,
        vol.Required("entity_id"): str,
        vol.Required("end"): vol.Coerce(float),
        vol.Required("act"): vol.In(["on", "off"]),
        vol.Optional("name", default=""): str,
    }
)
@websocket_api.async_response
async def ws_set_timer(hass, connection, msg):
    """设置 / 覆盖一条定时（存服务器 + 立即挂调度）."""
    entity_id = msg["entity_id"]
    item = {
        "end": int(msg["end"]),
        "act": msg["act"],
        "n": msg.get("name") or "",
    }

    def _save() -> dict:
        timers = _read_timers(hass)
        timers[entity_id] = item
        return _write_timers(hass, timers)

    timers = await hass.async_add_executor_job(_save)
    _schedule_timer(hass, entity_id, item)
    hass.bus.async_fire(TIMER_EVENT, {"entity_id": entity_id, **item})
    # 审计日志
    await hass.async_add_executor_job(
        _audit_write, "timer_set",
        entity_id=entity_id, act=item["act"], name=item["n"],
        mins=round((item["end"] - int(datetime.now(timezone.utc).timestamp() * 1000)) / 60000),
    )
    connection.send_result(msg["id"], {"timers": timers})


@websocket_api.websocket_command(
    {vol.Required("type"): WS_CLEAR_TIMER, vol.Required("entity_id"): str}
)
@websocket_api.async_response
async def ws_clear_timer(hass, connection, msg):
    """取消一条定时."""
    entity_id = msg["entity_id"]

    def _drop() -> dict:
        timers = _read_timers(hass)
        timers.pop(entity_id, None)
        return _write_timers(hass, timers)

    timers = await hass.async_add_executor_job(_drop)
    _cancel_timer(hass, entity_id)
    hass.bus.async_fire(TIMER_EVENT, {"entity_id": entity_id, "act": None})
    await hass.async_add_executor_job(
        _audit_write, "timer_clear", entity_id=entity_id,
    )
    connection.send_result(msg["id"], {"timers": timers})


@websocket_api.websocket_command({vol.Required("type"): WS_SERVICE_CALL})
@websocket_api.async_response
async def ws_service_call(hass, connection, msg):
    """设备操控（走后端，自动记审计日志）.

    参数:
      domain:      服务域（如 climate / light / cover）
      service:     服务名（如 set_temperature / turn_on / turn_off）
      service_data: 传给服务的 dict（必含 entity_id）
      label:       可选，人类可读的操作描述（写进审计里）
    """
    domain = msg.get("domain", "")
    service = msg.get("service", "")
    service_data = msg.get("service_data") or {}
    if not isinstance(service_data, dict):
        connection.send_result(msg["id"], {"ok": False, "error": "service_data must be object"})
        return
    entity_id = service_data.get("entity_id", "")

    try:
        await hass.services.async_call(
            domain, service, service_data, blocking=False
        )
    except Exception as exc:  # noqa: BLE001
        _LOGGER.warning("QLovehome 服务调用失败 %s.%s: %s", domain, service, exc)
        connection.send_result(msg["id"], {"ok": False, "error": str(exc)})
        return

    # 记审计日志
    try:
        await hass.async_add_executor_job(
            _audit_write, "service_call",
            entity_id=entity_id, domain=domain, service=service,
            label=msg.get("label") or "",
            data={k: v for k, v in service_data.items() if k != "entity_id"},
        )
    except Exception:  # noqa: BLE001 - 审计写失败不影响主流程
        _LOGGER.exception("写审计日志失败")

    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({vol.Required("type"): WS_GET_AUDIT})
@websocket_api.async_response
async def ws_get_audit(hass, connection, msg):
    """读取最近操作记录（审计日志）.

    参数:
      limit:  最多返回几条（默认 50，最大 AUDIT_MAX_ENTRIES）
      event:  可选，只返回某类事件（如 "service_call" 只看设备操控）
    """
    limit = int(msg.get("limit") or 50)
    event = msg.get("event") or None
    entries = await hass.async_add_executor_job(_audit_read_recent, limit, event)
    connection.send_result(msg["id"], {"entries": entries})
class _QlhBaseView(HomeAssistantView):
    """读写集成目录里的配置文件."""

    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def _body(self, request) -> dict:
        try:
            body = await request.json()
        except (ValueError, TypeError):
            return {}
        return body if isinstance(body, dict) else {}


class QlhConfigView(_QlhBaseView):
    url = API_URL
    name = "api:qlh:config"
    cors_allowed = True

    async def get(self, request):
        data = await self.hass.async_add_executor_job(_read, self.hass)
        version = await self.hass.async_add_executor_job(_read_version)
        return self.json({"config": data, "version": version})

    async def post(self, request):
        body = await self._body(request)
        cfg = body.get("config")
        if not isinstance(cfg, dict):
            return self.json({"error": "config must be an object"}, status_code=400)
        cfg = _save_config_keep_timers(self.hass, cfg)
        await self.hass.async_add_executor_job(_write, self.hass, cfg)
        return self.json({"ok": True})


class QlhUiView(_QlhBaseView):
    url = API_UI_URL
    name = "api:qlh:ui"
    cors_allowed = True

    async def get(self, request):
        ui = await self.hass.async_add_executor_job(_read_ui, self.hass)
        return self.json({"ui": ui})

    async def post(self, request):
        body = await self._body(request)
        ui = body.get("ui")
        if not isinstance(ui, dict):
            return self.json({"error": "ui must be an object"}, status_code=400)
        merged = await self.hass.async_add_executor_job(_write_ui, self.hass, ui)
        return self.json({"ok": True, "ui": merged})


class QlhTimerView(_QlhBaseView):
    """定时 / 倒计时的 REST 兜底（前端拿不到 hass 对象时用）."""

    url = API_TIMER_URL
    name = "api:qlh:timer"
    cors_allowed = True

    async def get(self, request):
        timers = await self.hass.async_add_executor_job(_read_timers, self.hass)
        return self.json({"timers": timers})

    async def post(self, request):
        body = await self._body(request)
        entity_id = body.get("entity_id")
        if not isinstance(entity_id, str) or "." not in entity_id:
            return self.json({"error": "entity_id required"}, status_code=400)
        act = body.get("act")
        if act not in ("on", "off"):
            return self.json({"error": "act must be on/off"}, status_code=400)
        try:
            end = int(float(body.get("end")))
        except (TypeError, ValueError):
            return self.json({"error": "end must be epoch ms"}, status_code=400)
        item = {"end": end, "act": act, "n": str(body.get("name") or "")}

        def _save() -> dict:
            timers = _read_timers(self.hass)
            timers[entity_id] = item
            return _write_timers(self.hass, timers)

        timers = await self.hass.async_add_executor_job(_save)
        _schedule_timer(self.hass, entity_id, item)
        self.hass.bus.async_fire(TIMER_EVENT, {"entity_id": entity_id, **item})
        await self.hass.async_add_executor_job(
            _audit_write, "timer_set",
            entity_id=entity_id, act=item["act"], name=item["n"],
            mins=round((item["end"] - int(datetime.now(timezone.utc).timestamp() * 1000)) / 60000),
        )
        return self.json({"ok": True, "timers": timers})

    async def delete(self, request):
        entity_id = (request.query.get("entity_id") or "").strip()
        if "." not in entity_id:
            return self.json({"error": "entity_id required"}, status_code=400)

        def _drop() -> dict:
            timers = _read_timers(self.hass)
            timers.pop(entity_id, None)
            return _write_timers(self.hass, timers)

        timers = await self.hass.async_add_executor_job(_drop)
        _cancel_timer(self.hass, entity_id)
        self.hass.bus.async_fire(TIMER_EVENT, {"entity_id": entity_id, "act": None})
        await self.hass.async_add_executor_job(
            _audit_write, "timer_clear", entity_id=entity_id,
        )
        return self.json({"ok": True, "timers": timers})


class QlhAuditView(_QlhBaseView):
    """读取操作记录（审计日志）."""

    url = API_AUDIT_URL
    name = "api:qlh:audit"
    cors_allowed = True

    async def get(self, request):
        try:
            limit = int(request.query.get("limit") or 50)
        except ValueError:
            limit = 50
        event = request.query.get("event") or None
        entries = await self.hass.async_add_executor_job(_audit_read_recent, limit, event)
        return self.json({"entries": entries})


class QlhServiceView(_QlhBaseView):
    """设备操控 REST 兜底（前端拿不到 hass 对象时用）."""

    url = API_SERVICE_URL
    name = "api:qlh:service"
    cors_allowed = True

    async def post(self, request):
        body = await self._body(request)
        domain = body.get("domain", "")
        service = body.get("service", "")
        service_data = body.get("service_data") or {}
        if not isinstance(service_data, dict):
            return self.json({"error": "service_data must be object"}, status_code=400)
        entity_id = service_data.get("entity_id", "")

        try:
            await self.hass.services.async_call(
                domain, service, service_data, blocking=False
            )
        except Exception as exc:  # noqa: BLE001
            _LOGGER.warning("QLovehome REST 服务调用失败 %s.%s: %s", domain, service, exc)
            return self.json({"ok": False, "error": str(exc)})

        try:
            await self.hass.async_add_executor_job(
                _audit_write, "service_call",
                entity_id=entity_id, domain=domain, service=service,
                label=body.get("label") or "",
                data={k: v for k, v in service_data.items() if k != "entity_id"},
            )
        except Exception:  # noqa: BLE001
            _LOGGER.exception("REST 审计写失败")

        return self.json({"ok": True})

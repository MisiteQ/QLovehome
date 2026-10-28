"""QLovehome 家庭仪表盘集成.

功能:
- 侧边栏注册 iframe 面板
- 托管前端静态文件 (custom_components/qlovehome/www)
- 配置持久化到「集成自身目录」custom_components/qlovehome/qlh/qlh-config.json
  → 换电脑 / 换浏览器 / 换手机，打开 HA 都是同一份配置
- 接口有两套（内容完全一致，读写同一个文件）：
  * WebSocket: qlovehome/get_config / qlovehome/save_config
               qlovehome/get_ui     / qlovehome/save_ui
  * REST     : GET/POST /api/qlh/config, GET/POST /api/qlh/ui
  WebSocket 只在集成「已添加」时前端才拿得到 hass，所以 REST 作为兜底，
  保证仅仅是丢个文件夹进 custom_components 也能存住配置。
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED

from .const import (
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
)

_LOGGER = logging.getLogger(__name__)

WS_GET_CONFIG = "qlovehome/get_config"
WS_SAVE_CONFIG = "qlovehome/save_config"
WS_GET_UI = "qlovehome/get_ui"
WS_SAVE_UI = "qlovehome/save_ui"


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
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """通过 UI 添加集成时执行（幂等，重复注册有保护）."""
    await _async_register_static(hass)
    _async_register_api(hass)
    _async_register_ws(hass)
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
    for cmd in (ws_get_config, ws_save_config, ws_get_ui, ws_save_ui):
        websocket_api.async_register_command(hass, cmd)
    store["ws"] = True


@callback
def _async_register_api(hass: HomeAssistant) -> None:
    store = hass.data.setdefault(DOMAIN, {})
    if store.get("api"):
        return
    views = [QlhConfigView(hass), QlhUiView(hass)]
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


# ── WebSocket API ───────────────────────────────────────────
@websocket_api.websocket_command({vol.Required("type"): WS_GET_CONFIG})
@websocket_api.async_response
async def ws_get_config(hass, connection, msg):
    """前端拉取完整配置."""
    data = await hass.async_add_executor_job(_read, hass)
    connection.send_result(msg["id"], {"config": data})


@websocket_api.websocket_command(
    {vol.Required("type"): WS_SAVE_CONFIG, vol.Required("config"): dict}
)
@websocket_api.async_response
async def ws_save_config(hass, connection, msg):
    """前端保存完整配置."""
    await hass.async_add_executor_job(_write, hass, msg["config"])
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


# ── REST 兜底（前端拿不到 hass 对象时用）────────────────────
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
        return self.json({"config": data})

    async def post(self, request):
        body = await self._body(request)
        cfg = body.get("config")
        if not isinstance(cfg, dict):
            return self.json({"error": "config must be an object"}, status_code=400)
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

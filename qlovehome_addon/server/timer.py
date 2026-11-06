"""QLovehome Add-on — 独立 asyncio 定时调度.

替代 integration 模式依赖的 `async_track_point_in_utc_time`，
用原生 asyncio.call_later 实现。和 HA WebSocket 连接层配合使用。
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Awaitable, Callable

from . import store

log = logging.getLogger(__name__)

TIMER_CATCHUP_SECONDS = 12 * 3600
CONNECT_WAIT_SECONDS = 90

# {entity_id: asyncio.Handle}
_handles: dict[str, asyncio.Handle] = {}
_ha_ref = None
_on_fire: Callable[[str, dict, bool], Awaitable[None]] | None = None

# 各域「开 / 关」对应的服务名：cover / valve 没有 turn_on / turn_off
_TURN_SERVICE = {
    "cover": ("open_cover", "close_cover"),
    "valve": ("open_valve", "close_valve"),
}


def init_timers(ha, on_fire=None) -> None:
    global _ha_ref, _on_fire
    _ha_ref = ha
    _on_fire = on_fire


def _service_for(entity_id: str, act: str) -> tuple[str, str]:
    """(domain, service)：按域挑服务，避免对 cover 发 turn_on."""
    domain = entity_id.split(".", 1)[0]
    on, off = _TURN_SERVICE.get(domain, ("turn_on", "turn_off"))
    return domain, (on if act == "on" else off)


def schedule(entity_id: str, item: dict) -> None:
    cancel(entity_id)
    try:
        end = float(item.get("end")) / 1000.0
    except (TypeError, ValueError):
        return
    loop = asyncio.get_running_loop()
    now_ts = datetime.now(timezone.utc).timestamp()
    delay_s = max(end - now_ts, 0)

    def _on_time() -> None:
        _handles.pop(entity_id, None)
        asyncio.create_task(_fire(entity_id, item))

    _handles[entity_id] = loop.call_later(delay_s, _on_time)


def cancel(entity_id: str) -> None:
    h = _handles.pop(entity_id, None)
    if h and not h.cancelled():
        h.cancel()


async def _call(entity_id: str, act: str) -> bool:
    """下发一次开/关；域不支持时退回 homeassistant.turn_on / turn_off."""
    if _ha_ref is None:
        return False
    domain, service = _service_for(entity_id, act)
    try:
        await _ha_ref.call_service(domain, service, entity_id, {"entity_id": entity_id})
        return True
    except Exception as exc:  # noqa: BLE001 - 换域再试一次
        log.debug("定时 %s.%s 失败（%s），回退 homeassistant", domain, service, exc)
    try:
        await _ha_ref.call_service(
            "homeassistant", "turn_on" if act == "on" else "turn_off",
            entity_id, {"entity_id": entity_id},
        )
        return True
    except Exception:  # noqa: BLE001
        log.exception("QLovehome 定时执行失败: %s", entity_id)
        return False


async def _fire(entity_id: str, item: dict) -> None:
    act = item.get("act") or "off"
    name = item.get("n") or entity_id

    # 读当前状态（从 HA 连接层缓存）
    state_now = None
    if _ha_ref:
        st = _ha_ref.states.get(entity_id)
        state_now = st.get("state") if st else None

    already = bool(state_now and (
        (act == "off" and state_now in ("off", "closed"))
        or (act == "on" and state_now in ("on", "open"))
    ))
    fired = False

    if not already:
        fired = await _call(entity_id, act)
        if fired:
            log.info("QLovehome 定时执行: %s · %s", name, "开启" if act == "on" else "关闭")

    # 从存储里删掉
    timers = store.read_timers()
    timers.pop(entity_id, None)
    store.write_timers(timers)

    # 审计
    store.audit_write("timer_fired", entity_id=entity_id, act=act, name=name, fired=fired)

    if _on_fire:
        try:
            await _on_fire(entity_id, item, fired)
        except Exception:  # noqa: BLE001
            log.exception("定时回调异常")


async def restore() -> None:
    """启动时恢复所有定时（并补执行过期 12h 内的）."""
    timers = store.read_timers()
    if not timers:
        return
    now_ts = datetime.now(timezone.utc).timestamp()
    keep: dict = {}
    for entity_id, item in list(timers.items()):
        if not isinstance(item, dict):
            continue
        try:
            end = float(item.get("end")) / 1000.0
        except (TypeError, ValueError):
            continue
        if end <= now_ts:
            if now_ts - end <= TIMER_CATCHUP_SECONDS:
                await _fire(entity_id, dict(item))
            else:
                log.info("QLovehome 定时早已过期，丢弃: %s", entity_id)
            continue
        keep[entity_id] = item
        schedule(entity_id, item)
    store.write_timers(keep)
    if keep:
        log.info("QLovehome 已恢复 %s 个定时任务", len(keep))


async def restore_when_ready() -> None:
    """等 HA WebSocket 连上再恢复定时.

    否则启动瞬间的「补执行」会因为连不上 HA 而失败，任务却已经被删掉了。
    """
    for _ in range(CONNECT_WAIT_SECONDS):
        if _ha_ref is not None and getattr(_ha_ref, "is_connected", False):
            break
        await asyncio.sleep(1)
    else:
        log.warning("HA 在 %s 秒内未连上，仍尝试恢复定时", CONNECT_WAIT_SECONDS)
    try:
        await restore()
    except Exception:  # noqa: BLE001 - 恢复失败不该拖垮进程
        log.exception("恢复定时任务失败")


def shutdown() -> None:
    for h in list(_handles.values()):
        if not h.cancelled():
            h.cancel()
    _handles.clear()

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

# {entity_id: asyncio.Handle}
_handles: dict[str, asyncio.Handle] = {}
_ha_ref: "HaUpstream | None" = None  # type: ignore[name-defined]
_on_fire: Callable[[str, dict, bool], Awaitable[None]] | None = None


def init_timers(ha, on_fire=None) -> None:
    global _ha_ref, _on_fire
    _ha_ref = ha
    _on_fire = on_fire


def schedule(entity_id: str, item: dict) -> None:
    cancel(entity_id)
    try:
        end = float(item.get("end")) / 1000.0
    except (TypeError, ValueError):
        return
    loop = asyncio.get_event_loop()
    delay = end - loop.time() + (loop.time() - asyncio.get_event_loop().time())  # 占位
    # 直接算 epoch → 相对延迟
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

    if not already and _ha_ref:
        domain = entity_id.split(".", 1)[0]
        service = "turn_on" if act == "on" else "turn_off"
        try:
            await _ha_ref.call_service(domain, service, entity_id, {"entity_id": entity_id})
            log.info("QLovehome 定时执行: %s · %s", name, "开启" if act == "on" else "关闭")
            fired = True
        except Exception:
            log.exception("QLovehome 定时执行失败: %s", entity_id)

    # 从存储里删掉
    timers = store.read_timers()
    timers.pop(entity_id, None)
    store.write_timers(timers)

    # 审计
    store.audit_write("timer_fired", entity_id=entity_id, act=act, name=name, fired=fired)

    if _on_fire:
        try:
            await _on_fire(entity_id, item, fired)
        except Exception:
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


def shutdown() -> None:
    for h in list(_handles.values()):
        if not h.cancelled():
            h.cancel()
    _handles.clear()

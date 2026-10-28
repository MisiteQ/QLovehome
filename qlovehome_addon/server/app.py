"""QLovehome Add-on — aiohttp 主入口.

提供和 integration 版完全一致的 REST API：
  GET/POST    /api/qlh/config     — 读写配置（附带版本号）
  GET/POST    /api/qlh/ui          — 读写界面设置
  GET/POST/DELETE /api/qlh/timer   — 定时/倒计时（走独立 asyncio 调度）
  GET         /api/qlh/audit       — 读取最近操作记录
  POST        /api/qlh/service     — 设备操控（走 HA WebSocket，自动记审计）

以及静态文件托管 / → www/index.html（Ingress 挂载）
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from aiohttp import web

from . import store, timer
from .ha import HaUpstream, supervisor_ha_url, supervisor_token

log = logging.getLogger(__name__)

STATIC_DIR = Path(os.environ.get("QLH_STATIC", Path(__file__).resolve().parent.parent / "www"))


def create_app() -> web.Application:
    app = web.Application()
    app["ha"] = HaUpstream()
    app.router.add_routes([
        web.get("/api/qlh/config",          handle_get_config),
        web.post("/api/qlh/config",         handle_post_config),
        web.get("/api/qlh/ui",              handle_get_ui),
        web.post("/api/qlh/ui",             handle_post_ui),
        web.get("/api/qlh/timer",           handle_get_timers),
        web.post("/api/qlh/timer",          handle_post_timer),
        web.delete("/api/qlh/timer",        handle_delete_timer),
        web.get("/api/qlh/audit",           handle_get_audit),
        web.post("/api/qlh/service",        handle_service_call),
        # 静态文件（前端 www/ 目录）
        web.static("/", str(STATIC_DIR), show_index=False, follow_symlinks=True),
    ])
    app.on_startup.append(_on_startup)
    app.on_cleanup.append(_on_cleanup)
    return app


async def _on_startup(app: web.Application) -> None:
    ha: HaUpstream = app["ha"]
    # 连接 HA（Supervisor 自动注入令牌）
    url = supervisor_ha_url()
    token = supervisor_token()
    enabled = bool(url and token)
    if enabled:
        log.info("连接 HA: %s (Supervisor 模式)" if supervisor_token() else "连接 HA: %s", url)
    else:
        log.warning("未检测到 SUPERVISOR_TOKEN，HA 操控功能不可用（独立运行模式）")
    await ha.configure(url, token, enabled=enabled)
    # 恢复定时任务
    timer.init_timers(ha)
    await timer.restore()


async def _on_cleanup(app: web.Application) -> None:
    timer.shutdown()
    await app["ha"].stop()


# ── 工具 ────────────────────────────────────────────────────
async def _json_body(request: web.Request) -> dict:
    try:
        body = await request.json()
    except (ValueError, Exception):
        return {}
    return body if isinstance(body, dict) else {}


# ── REST handlers（和 integration 版一一对应）─────────────
async def handle_get_config(request: web.Request) -> web.Response:
    data = store.read_config()
    return web.json_response({"config": data, "version": store.read_version()})


async def handle_post_config(request: web.Request) -> web.Response:
    body = await _json_body(request)
    cfg = body.get("config")
    if not isinstance(cfg, dict):
        return web.json_response({"error": "config must be object"}, status=400)
    merged = store.save_config_keep_timers(cfg)
    store.write_config(merged)
    return web.json_response({"ok": True})


async def handle_get_ui(request: web.Request) -> web.Response:
    return web.json_response({"ui": store.read_ui()})


async def handle_post_ui(request: web.Request) -> web.Response:
    body = await _json_body(request)
    ui = body.get("ui")
    if not isinstance(ui, dict):
        return web.json_response({"error": "ui must be object"}, status=400)
    merged = store.write_ui(ui)
    return web.json_response({"ok": True, "ui": merged})


async def handle_get_timers(request: web.Request) -> web.Response:
    return web.json_response({"timers": store.read_timers()})


async def handle_post_timer(request: web.Request) -> web.Response:
    body = await _json_body(request)
    entity_id = body.get("entity_id")
    if not isinstance(entity_id, str) or "." not in entity_id:
        return web.json_response({"error": "entity_id required"}, status=400)
    act = body.get("act")
    if act not in ("on", "off"):
        return web.json_response({"error": "act must be on/off"}, status=400)
    try:
        end = int(float(body.get("end")))
    except (TypeError, ValueError):
        return web.json_response({"error": "end must be epoch ms"}, status=400)
    item = {"end": end, "act": act, "n": str(body.get("name") or "")}
    timers = store.read_timers()
    timers[entity_id] = item
    store.write_timers(timers)
    timer.schedule(entity_id, item)
    store.audit_write(
        "timer_set", entity_id=entity_id, act=act, name=item["n"],
        mins=round((end - int(datetime.now(timezone.utc).timestamp() * 1000)) / 60000),
    )
    return web.json_response({"ok": True, "timers": timers})


async def handle_delete_timer(request: web.Request) -> web.Response:
    entity_id = (request.query.get("entity_id") or "").strip()
    if "." not in entity_id:
        return web.json_response({"error": "entity_id required"}, status=400)
    timers = store.read_timers()
    timers.pop(entity_id, None)
    store.write_timers(timers)
    timer.cancel(entity_id)
    store.audit_write("timer_clear", entity_id=entity_id)
    return web.json_response({"ok": True, "timers": timers})


async def handle_get_audit(request: web.Request) -> web.Response:
    try:
        limit = int(request.query.get("limit") or 50)
    except ValueError:
        limit = 50
    event = request.query.get("event") or None
    return web.json_response({"entries": store.audit_read_recent(limit, event)})


async def handle_service_call(request: web.Request) -> web.Response:
    """设备操控（走 HA WebSocket，自动记审计日志）."""
    body = await _json_body(request)
    domain = body.get("domain", "")
    service = body.get("service", "")
    service_data = body.get("service_data") or {}
    if not isinstance(service_data, dict):
        return web.json_response({"error": "service_data must be object"}, status=400)
    entity_id = service_data.get("entity_id", "")

    ha: HaUpstream = request.app["ha"]
    try:
        await ha.call_service(domain, service, entity_id, service_data)
    except Exception as exc:  # noqa: BLE001
        log.warning("Add-on 服务调用失败 %s.%s: %s", domain, service, exc)
        return web.json_response({"ok": False, "error": str(exc)})

    store.audit_write(
        "service_call",
        entity_id=entity_id, domain=domain, service=service,
        label=body.get("label") or "",
        data={k: v for k, v in service_data.items() if k != "entity_id"},
    )
    return web.json_response({"ok": True})

"""QLovehome Add-on — aiohttp 主入口.

提供和 integration 版完全一致的 REST API：
  GET/POST    /api/qlh/config     — 读写配置（附带版本号）
  GET/POST    /api/qlh/ui          — 读写界面设置
  GET/POST/DELETE /api/qlh/timer   — 定时/倒计时（走独立 asyncio 调度）
  GET         /api/qlh/audit       — 读取最近操作记录
  POST        /api/qlh/service     — 设备操控（走 HA WebSocket，自动记审计）
  GET         /api/qlh/health      — 存活探针（Supervisor watchdog 用）
  GET         /api/qlh/status      — HA 连接状态（面板/排错用）

以及静态文件托管 / → www/index.html（Ingress 挂载）

安全：默认只接受 Supervisor Ingress 过来的请求（带 X-Ingress-Path）和本机回环。
     如果把 8765 端口映射到局域网，需要显式设置 QLH_API_TOKEN 或
     QLH_ALLOW_DIRECT=1，否则一律 403。
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from aiohttp import web

from . import store, timer
from .ha import HaUpstream, supervisor_ha_url, supervisor_token

log = logging.getLogger(__name__)

STATIC_DIR = Path(os.environ.get("QLH_STATIC", Path(__file__).resolve().parent.parent / "www"))

# 直连（非 Ingress）放行开关
ALLOW_DIRECT = os.environ.get("QLH_ALLOW_DIRECT", "").strip().lower() in ("1", "true", "yes", "on")
API_TOKEN = os.environ.get("QLH_API_TOKEN", "").strip()

# HA 连接状态（由 HaUpstream 回调写入，/api/qlh/status 读）
HA_STATUS: dict = {"kind": "starting"}
_LOOPBACK = ("127.0.0.1", "::1", "localhost")


@web.middleware
async def _auth_middleware(request: web.Request, handler):
    """Ingress 之外来的请求默认拒绝.

    正常使用走 Supervisor Ingress（带 X-Ingress-Path），鉴权由 Home Assistant 完成。
    这把锁只是防止有人把 8765 端口映射到局域网后，整台房子的设备被任何人操控。
    """
    if request.path == "/api/qlh/health":
        return await handler(request)
    if request.headers.get("X-Ingress-Path") or request.remote in _LOOPBACK:
        return await handler(request)
    if API_TOKEN and request.headers.get("Authorization", "") == "Bearer " + API_TOKEN:
        return await handler(request)
    if ALLOW_DIRECT:
        return await handler(request)
    return web.json_response(
        {"error": "只允许通过 Home Assistant 侧边栏（Ingress）访问；"
                  "如需直连请设置 QLH_API_TOKEN 或 QLH_ALLOW_DIRECT=1"},
        status=403,
    )


def create_app() -> web.Application:
    app = web.Application(middlewares=[_auth_middleware])
    app["ha"] = HaUpstream(on_status=_on_ha_status)
    app["restore_task"] = None
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
        web.get("/api/qlh/health",          handle_health),
        web.get("/api/qlh/status",          handle_status),
        # 根路径返回 index.html（HA Ingress 面板打开的是 "/"，不带 index.html）
        web.get("/", handle_index),
        # 静态文件（前端 www/ 目录）
        web.static("/", str(STATIC_DIR), show_index=False, follow_symlinks=True),
    ])
    app.on_startup.append(_on_startup)
    app.on_cleanup.append(_on_cleanup)
    return app


async def handle_index(request: web.Request) -> web.StreamResponse:
    """HA 侧边栏 Ingress 打开的是 / 根路径，直接吐 index.html。"""
    index = STATIC_DIR / "index.html"
    if not index.exists():
        return web.Response(status=404, text="index.html 不存在，请检查镜像内 /app/www 是否完整")
    return web.FileResponse(index)


async def _on_ha_status(status: dict) -> None:
    HA_STATUS.clear()
    HA_STATUS.update(status or {})
    if status.get("kind") == "connected":
        log.info("已连接 Home Assistant %s", status.get("version") or "")


async def _on_startup(app: web.Application) -> None:
    ha: HaUpstream = app["ha"]
    # 连接 HA（Supervisor 自动注入令牌）
    url = supervisor_ha_url()
    token = supervisor_token()
    enabled = bool(url and token)
    if enabled:
        log.info("连接 HA: %s（Supervisor 令牌）", url)
    else:
        log.warning("未检测到 SUPERVISOR_TOKEN，HA 操控功能不可用（独立运行模式）")
    await ha.configure(url, token, enabled=enabled)
    # 恢复定时任务：等 WebSocket 真正连上再补执行，否则补执行会失败并被删掉
    timer.init_timers(ha)
    app["restore_task"] = asyncio.create_task(timer.restore_when_ready())


async def _on_cleanup(app: web.Application) -> None:
    task = app.get("restore_task")
    if task:
        task.cancel()
    timer.shutdown()
    await app["ha"].stop()


# ── 工具 ────────────────────────────────────────────────────
async def _json_body(request: web.Request) -> dict:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 - 不是 JSON 就当空对象
        return {}
    return body if isinstance(body, dict) else {}


# ── REST handlers（和 integration 版一一对应）─────────────
async def handle_get_config(request: web.Request) -> web.Response:
    data = await asyncio.to_thread(store.read_config)
    version = await asyncio.to_thread(store.read_version)
    return web.json_response({"config": data, "version": version})


async def handle_post_config(request: web.Request) -> web.Response:
    body = await _json_body(request)
    cfg = body.get("config")
    if not isinstance(cfg, dict):
        return web.json_response({"error": "config must be object"}, status=400)
    await asyncio.to_thread(store.save_config_file, cfg)
    return web.json_response({"ok": True})


async def handle_get_ui(request: web.Request) -> web.Response:
    ui = await asyncio.to_thread(store.read_ui)
    return web.json_response({"ui": ui})


async def handle_post_ui(request: web.Request) -> web.Response:
    body = await _json_body(request)
    ui = body.get("ui")
    if not isinstance(ui, dict):
        return web.json_response({"error": "ui must be object"}, status=400)
    merged = await asyncio.to_thread(store.write_ui, ui)
    return web.json_response({"ok": True, "ui": merged})


async def handle_get_timers(request: web.Request) -> web.Response:
    timers = await asyncio.to_thread(store.read_timers)
    return web.json_response({"timers": timers})


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
    timers = await asyncio.to_thread(store.read_timers)
    timers[entity_id] = item
    timers = await asyncio.to_thread(store.write_timers, timers)
    timer.schedule(entity_id, item)
    mins = round((end - int(datetime.now(timezone.utc).timestamp() * 1000)) / 60000)
    await asyncio.to_thread(
        store.audit_write, "timer_set", entity_id=entity_id, act=act,
        name=item["n"], mins=mins,
    )
    return web.json_response({"ok": True, "timers": timers})


async def handle_delete_timer(request: web.Request) -> web.Response:
    entity_id = (request.query.get("entity_id") or "").strip()
    if "." not in entity_id:
        return web.json_response({"error": "entity_id required"}, status=400)
    timers = await asyncio.to_thread(store.read_timers)
    timers.pop(entity_id, None)
    timers = await asyncio.to_thread(store.write_timers, timers)
    timer.cancel(entity_id)
    await asyncio.to_thread(store.audit_write, "timer_clear", entity_id=entity_id)
    return web.json_response({"ok": True, "timers": timers})


async def handle_get_audit(request: web.Request) -> web.Response:
    try:
        limit = int(request.query.get("limit") or 50)
    except (TypeError, ValueError):
        limit = 50
    event = request.query.get("event") or None
    entries = await asyncio.to_thread(store.audit_read_recent, limit, event)
    return web.json_response({"entries": entries})


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

    await asyncio.to_thread(
        store.audit_write,
        "service_call",
        entity_id=entity_id, domain=domain, service=service,
        label=body.get("label") or "",
        data={k: v for k, v in service_data.items() if k != "entity_id"},
    )
    return web.json_response({"ok": True})


async def handle_health(request: web.Request) -> web.Response:
    """存活探针：只要进程还在就 200（Supervisor watchdog 靠它拉起挂掉的进程）."""
    return web.json_response({"ok": True})


async def handle_status(request: web.Request) -> web.Response:
    """HA 连接状态：面板连不上设备时，先看这里判断是后端还是浏览器的问题."""
    ha: HaUpstream = request.app["ha"]
    version = await asyncio.to_thread(store.read_version)
    return web.json_response({
        "ok": True,
        "version": version,
        "ha": dict(HA_STATUS),
        "connected": ha.is_connected,
        "states": len(ha.states),
        "timers": len(await asyncio.to_thread(store.read_timers)),
    })

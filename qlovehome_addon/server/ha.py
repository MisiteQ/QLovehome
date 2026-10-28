"""QLovehome Add-on — HA WebSocket 连接层.

独立 Python 进程通过 HA WebSocket API 连接 Home Assistant，
替代 integration 模式下直接依赖 hass 对象的做法。

协议见 https://developers.home-assistant.io/docs/api/websocket/
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from typing import Any, Awaitable, Callable
from urllib.parse import urlsplit, urlunsplit

import aiohttp

log = logging.getLogger(__name__)

RETRY_DELAYS = [1, 2, 5, 10, 30]
CALL_TIMEOUT = 10

Status = dict[str, Any]
States = dict[str, dict[str, Any]]


def supervisor_ha_url() -> str:
    """HAOS Add-on 环境下：Supervisor 自动暴露的 HA Core URL."""
    if os.environ.get("SUPERVISOR_TOKEN"):
        return "http://supervisor/core"
    # 本地 Docker 或独立运行
    return os.environ.get("QLH_HA_URL", "http://homeassistant.local:8123")


def supervisor_token() -> str:
    return os.environ.get("SUPERVISOR_TOKEN", "")


def websocket_url(ha_url: str) -> str:
    parts = urlsplit(ha_url)
    scheme = "wss" if parts.scheme == "https" else "ws"
    return urlunsplit((scheme, parts.netloc, parts.path.rstrip("/") + "/api/websocket", "", ""))


class HaAuthError(Exception):
    pass


class HaUpstream:
    """HA WebSocket 单连接管理器.

    用法:
        ha = HaUpstream(on_state_change, on_status)
        await ha.configure(url, token, enabled=True)
        await ha.call_service("climate", "turn_on", "climate.living_ac", {})
        state = ha.states.get("light.xxx")
    """

    def __init__(
        self,
        on_status: Callable[[Status], Awaitable[None]] | None = None,
    ) -> None:
        self._on_status = on_status or (lambda s: None)
        self._task: asyncio.Task[None] | None = None
        self._ws: aiohttp.ClientWebSocketResponse | None = None
        self._pending: dict[int, asyncio.Future[Any]] = {}
        self._next_id = 1
        self.states: States = {}
        self.status: Status = {"kind": "disabled"}

    async def configure(self, url: str, token: str, enabled: bool = True) -> None:
        await self.stop()
        if not enabled:
            self.status = {"kind": "disabled"}
            return
        if not url or not token:
            self.status = {"kind": "unconfigured"}
            return
        self._task = asyncio.create_task(self._run(url, token))

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        self._ws = None
        for f in self._pending.values():
            if not f.done():
                f.set_exception(ConnectionError("HA 连接已断开"))
        self._pending.clear()

    async def call_service(self, domain: str, service: str, entity_id: str, data: dict[str, Any]) -> None:
        """调用 HA 服务（设备操控用）."""
        payload: dict[str, Any] = {
            "type": "call_service",
            "domain": domain,
            "service": service,
            "service_data": data,
        }
        if entity_id:
            payload["target"] = {"entity_id": entity_id}
        await self._send(payload)

    async def get_states(self) -> States:
        """拉全量实体状态（启动时用）."""
        return await self._send({"type": "get_states"})

    async def _set_status(self, status: Status) -> None:
        self.status = status
        try:
            await self._on_status(status)
        except Exception:  # noqa: BLE001
            log.exception("HA 状态回调异常")

    async def _run(self, url: str, token: str) -> None:
        attempt = 0
        async with aiohttp.ClientSession() as session:
            while True:
                await self._set_status({"kind": "connecting"})
                try:
                    await self._connect_once(session, url, token)
                    message = "连接已断开"
                except HaAuthError as e:
                    await self._set_status({"kind": "auth_failed", "message": str(e)})
                    return
                except asyncio.CancelledError:
                    raise
                except Exception as e:  # 网络/地址错误
                    message = str(e) or e.__class__.__name__
                    log.warning("HA 连接失败: %s", message)
                finally:
                    self._ws = None
                    for f in self._pending.values():
                        if not f.done():
                            f.set_exception(ConnectionError("HA 连接已断开"))
                    self._pending.clear()

                delay = RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)]
                attempt = 0 if self.status.get("kind") == "connected" else attempt + 1
                await self._set_status({"kind": "disconnected", "message": message, "retryInSeconds": delay})
                await asyncio.sleep(delay)

    async def _connect_once(self, session: aiohttp.ClientSession, url: str, token: str) -> None:
        async with session.ws_connect(
            websocket_url(url), heartbeat=30, max_msg_size=16 * 1024 * 1024
        ) as ws:
            first = await ws.receive_json(timeout=10)
            if first.get("type") != "auth_required":
                raise ConnectionError("不是 Home Assistant WebSocket 接口")
            await ws.send_json({"type": "auth", "access_token": token})
            reply = await ws.receive_json(timeout=10)
            if reply.get("type") == "auth_invalid":
                raise HaAuthError(str(reply.get("message") or "令牌无效"))
            if reply.get("type") != "auth_ok":
                raise ConnectionError("认证未完成")
            self._ws = ws

            # 订阅全量实体（压缩格式）
            sub_id = self._next_id
            self._next_id += 1
            await ws.send_json({"id": sub_id, "type": "subscribe_entities"})

            # 先拉一份全量状态
            try:
                full = await self._send({"type": "get_states"})
                self.states = {s["entity_id"]: s for s in full}
            except Exception:  # 订阅也能拿到，忽略
                pass

            await self._set_status({"kind": "connected", "version": reply.get("ha_version")})

            async for message in ws:
                if message.type != aiohttp.WSMsgType.TEXT:
                    break
                await self._handle(message.json(), sub_id)

    async def _handle(self, msg: dict[str, Any], sub_id: int) -> None:
        if msg.get("type") == "event" and msg.get("id") == sub_id:
            await self._apply(msg.get("event") or {})
        elif msg.get("type") == "result":
            future = self._pending.pop(int(msg.get("id", 0)), None)
            if future and not future.done():
                if msg.get("success"):
                    future.set_result(msg.get("result"))
                else:
                    err = msg.get("error") or {}
                    future.set_exception(RuntimeError(str(err.get("message") or "调用失败")))

    async def _apply(self, event: dict[str, Any]) -> None:
        """subscribe_entities 压缩格式：a 新增/全量，c 增量，r 移除."""
        for entity_id, compressed in (event.get("a") or {}).items():
            self.states[entity_id] = {"state": compressed.get("s"), "attributes": compressed.get("a") or {}}
        for entity_id, diff in (event.get("c") or {}).items():
            prev = self.states.get(entity_id)
            if not prev:
                continue
            plus = diff.get("+") or {}
            attrs = {**prev["attributes"], **(plus.get("a") or {})}
            for key in (diff.get("-") or {}).get("a") or []:
                attrs.pop(key, None)
            self.states[entity_id] = {"state": plus.get("s", prev["state"]), "attributes": attrs}
        for entity_id in event.get("r") or []:
            self.states.pop(entity_id, None)

    async def _send(self, payload: dict[str, Any]) -> Any:
        ws = self._ws
        if ws is None or ws.closed:
            raise ConnectionError("未连接 HA")
        msg_id = self._next_id
        self._next_id += 1
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self._pending[msg_id] = future
        await ws.send_json({"id": msg_id, **payload})
        try:
            return await asyncio.wait_for(future, CALL_TIMEOUT)
        except asyncio.TimeoutError as e:
            raise TimeoutError("HA 响应超时") from e
        finally:
            self._pending.pop(msg_id, None)

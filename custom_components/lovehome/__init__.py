"""LoveHome 家庭仪表盘集成.

功能:
- 侧边栏注册 iframe 面板 (panel_custom)
- 托管前端静态文件 (custom_components/lovehome/www)
- WebSocket API: lovehome/get_config / lovehome/save_config
- 配置持久化到 /config/lovehome/config.json —— 存在 HA 服务器上,
  任何浏览器 / 设备 / 账号打开 HA 都是同一份配置
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import panel_custom, websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import CONFIG_FILE, DOMAIN, PANEL_URL, STORAGE_DIR

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """YAML 层初始化（无需在 configuration.yaml 写任何东西）."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """通过 UI 添加集成时执行."""
    # 1) 托管前端文件
    www_dir = Path(__file__).parent / "www"
    if hasattr(hass.http, "async_register_static_paths"):
        # HA 2024.6+
        from homeassistant.components.http import StaticPathConfig

        await hass.http.async_register_static_paths(
            [StaticPathConfig(PANEL_URL, str(www_dir), cache_headers=False)]
        )
    else:  # 兼容旧版
        hass.http.register_static_path(PANEL_URL, str(www_dir), cache_headers=False)

    # 2) 准备配置目录 /config/lovehome/
    config_path = Path(hass.config.path(STORAGE_DIR)) / CONFIG_FILE
    await hass.async_add_executor_job(_ensure_dir, config_path)
    hass.data.setdefault(DOMAIN, {})["config_path"] = str(config_path)

    # 3) 注册 WebSocket API
    websocket_api.async_register_command(hass, ws_get_config)
    websocket_api.async_register_command(hass, ws_save_config)

    # 4) 注册侧边栏面板（iframe 方式, 不需要 web component）
    #    直接用 frontend 内置注册, embed_iframe=True 让 HA 加载我们的 HTML
    from homeassistant.components import frontend

    try:
        frontend.async_register_built_in_panel(
            hass,
            component_name="iframe",
            sidebar_title="LoveHome",
            sidebar_icon="mdi:home-heart",
            frontend_url_path="lovehome",
            config={"url": f"{PANEL_URL}/index.html"},
            require_admin=False,
        )
        _LOGGER.info("LoveHome 仪表盘已启用：侧边栏入口 LoveHome，配置文件 %s", config_path)
    except Exception as exc:
        # 兜底：panel_custom API 可能随 HA 版本变化, 只记日志不崩 setup
        _LOGGER.warning("侧边栏面板注册失败(不影响主功能): %s", exc)
        _LOGGER.warning("请手动在 Dashboard 添加【网页卡片 iframe】→ 地址: /local/lovehome/index.html")

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """卸载集成."""
    if hass.panels.get("lovehome"):
        hass.panels.async_unregister("lovehome")
    return True


def _ensure_dir(config_path: Path) -> None:
    config_path.parent.mkdir(parents=True, exist_ok=True)


def _read_config(hass: HomeAssistant) -> dict:
    path = Path(hass.data[DOMAIN]["config_path"])
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        _LOGGER.exception("读取 LoveHome 配置失败: %s", path)
        return {}


def _write_config(hass: HomeAssistant, data: dict) -> None:
    path = Path(hass.data[DOMAIN]["config_path"])
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)
    _LOGGER.info("LoveHome 配置已保存: %s", path)


@websocket_api.websocket_command({vol.Required("type"): "lovehome/get_config"})
async def ws_get_config(hass, connection, msg):
    """前端拉取配置."""
    data = await hass.async_add_executor_job(_read_config, hass)
    connection.send_result(msg["id"], {"config": data})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "lovehome/save_config",
        vol.Required("config"): dict,
    }
)
async def ws_save_config(hass, connection, msg):
    """前端保存配置."""
    await hass.async_add_executor_job(_write_config, hass, msg["config"])
    connection.send_result(msg["id"])

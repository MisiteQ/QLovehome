"""QLovehome 配置流程 —— 用户在 UI 上点一下「提交」即完成安装."""
from homeassistant import config_entries

from .const import DOMAIN, INTEGRATION_NAME


class QLovehomeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """QLovehome 集成配置流程."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """无需任何输入，直接创建配置条目."""
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")
        return self.async_create_entry(title=INTEGRATION_NAME, data={})

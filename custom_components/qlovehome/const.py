"""QLovehome 家庭仪表盘 - 常量."""

DOMAIN = "qlovehome"             # 集成 domain
INTEGRATION_NAME = "QLovehome"   # 显示名称

# ★ 配置保存在「本集成自身文件夹内」：custom_components/qlovehome/qlh/qlh-config.json
#   同时在 /config/qlh/qlh-config.json 留一份镜像，HACS 升级也不会丢
DATA_DIR_NAME = "qlh"
DATA_FILE = "qlh-config.json"

# 更早版本的位置（/config/lovehome/config.json）——首次读取时自动迁移过来
LEGACY_STORAGE_DIR = "lovehome"
LEGACY_CONFIG_FILE = "config.json"

PANEL_URL = "/qlovehome/www"     # 前端静态文件挂载路径
PANEL_PATH = "qlovehome"         # 侧边栏 URL 路径
API_URL = "/api/qlh/config"      # REST 兜底读写接口
API_UI_URL = "/api/qlh/ui"       # REST 兜底读写「界面设置」
API_TIMER_URL = "/api/qlh/timer" # REST 兜底读写「定时 / 倒计时」

# 定时任务在 HA 服务器上跑（关面板 / 退出账号也照常执行）
TIMER_KEY = "timers"                        # 配置文件里的段名
TIMER_EVENT = "qlovehome_timers_changed"    # 定时变化事件（前端刷新用）
# HA 停机期间到点的任务：12 小时内补执行，更久的直接丢弃
TIMER_CATCHUP_SECONDS = 12 * 3600

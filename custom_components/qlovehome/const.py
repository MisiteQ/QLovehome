"""QLovehome 家庭仪表盘 - 常量."""

DOMAIN = "qlovehome"             # 集成 domain
INTEGRATION_NAME = "QLovehome"   # 显示名称

# ★ 配置保存在「本集成自身文件夹内」：custom_components/qlovehome/qlh/qlh-config.json
#   同时在 /config/qlh/qlh-config.json 留一份镜像，HACS 升级也不会丢
DATA_DIR_NAME = "qlh"
DATA_FILE = "qlh-config.json"

# 审计日志（操作记录）—— JSONL 格式，和配置同目录
AUDIT_FILE = "qlh-audit.log"
AUDIT_MAX_BYTES = 1_000_000       # 超过 1MB 轮转：qlh-audit.log → qlh-audit.log.1
AUDIT_MAX_ENTRIES = 2000          # 读取接口最多返回最近 2000 条

# 更早版本的位置（/config/lovehome/config.json）——首次读取时自动迁移过来
LEGACY_STORAGE_DIR = "lovehome"
LEGACY_CONFIG_FILE = "config.json"

# 前端静态文件挂载路径
# 注意：绝对不能放在侧边栏面板路径（PANEL_PATH）下面，否则访问 /qlovehome/www/index.html
# 时会被 /qlovehome 面板路由先命中，面板在自己的 iframe 里再加载一次自己，无限嵌套。
PANEL_URL = "/qlh/www"
PANEL_PATH = "qlovehome"         # 侧边栏 URL 路径
API_URL = "/api/qlh/config"      # REST 兜底读写接口
API_UI_URL = "/api/qlh/ui"       # REST 兜底读写「界面设置」
API_TIMER_URL = "/api/qlh/timer" # REST 兜底读写「定时 / 倒计时」
API_AUDIT_URL = "/api/qlh/audit" # REST 兜底读取「操作记录」
API_SERVICE_URL = "/api/qlh/service"  # REST 兜底「设备操控（走后端记审计）」

# 配置文件里的「运行时段」：只由各自的接口写，整份保存配置时必须原样保留
UI_KEY = "ui"                               # 界面设置（主题 / 字号 / 待机 …）
TIMER_KEY = "timers"                        # 定时任务
TIMER_EVENT = "qlovehome_timers_changed"    # 定时变化事件（前端刷新用）
# HA 停机期间到点的任务：12 小时内补执行，更久的直接丢弃
TIMER_CATCHUP_SECONDS = 12 * 3600

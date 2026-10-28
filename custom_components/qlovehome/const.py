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

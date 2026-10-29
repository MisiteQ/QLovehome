# 🏠 QLovehome · 全屋大屏

面向门口 / 客厅平板的 **Home Assistant 全屋大屏面板**。

**零 YAML · 零 Webpack · 纯 iframe 嵌入 · 配置存在 HA 服务器上（换电脑不丢）**

---

## ✨ 功能亮点

| 功能 | 说明 |
|---|---|
| 🏠 户型图可视化 | 矢量 SVG · 矩形/多边形/圆形房间 · 墙体自动融合 |
| 🎛️ 中控操作 | 灯光 · 插座 · 空调（含扫风模式）· 风扇 · 窗帘 · 开关 + 调光调色温 |
| 📊 概览卡片 | 家人在线 · 用电 · 安防 · 温湿度 · 电池 · 摄像头 · 网络 · 系统 |
| 🌤️ 天气 | 读任意 `weather.*` 实体（Met.no / 和风 / OWM 等），体感优先用实体自带字段 |
| 📝 最近动态 | 自动记录设备操控 / 定时设置 / 定时到点执行（JSONL 存服务器） |
| ⏱️ 定时 / 倒计时 | 服务器端调度，关面板 / 退出账号照跑，HA 重启自动恢复 |
| 🔌 子设备绑定 | 热水器绑水量传感器、灯绑子灯组，子设备自动从户型图剔除 |
| 🎨 四季主题 | 深/浅色跟随日出日落 · 春夏秋冬自动切换 · 房间色块温度感知 |
| 😴 自动屏保 | 无操作进大屏时钟 · 待机时间可配置 · 触控唤醒 |
| 🛠️ 可视化编辑器 | 画房间 · 空格平移画布 · 滚轮缩放 · 拖标签定位 |
| 💾 配置随 HA 走 | 存在 Add-on `/data/qlh-config.json` 或集成 `qlh/qlh-config.json` |
| 📱 响应式 | 宽屏侧栏常驻 · 窄屏自动切弹层操作 |

---

## 🚀 安装

### ⭐ 推荐：HAOS Add-on（Supervisor）

> 如果你是 **HAOS 用户**（官方镜像 / OVA / 树莓派官方安装），强烈推荐这种方式：
> 独立进程 + 自动管理 + Ingress 侧边栏，比 HACS integration 更稳。

**Home Assistant → 设置 → 加载项 → 右上角 ⋮ → 添加加载项仓库**

URL：`https://github.com/MisiteQ/QLovehome`  
类别：**Home Assistant** → 列表里找到 **QLovehome** → **安装**

首次构建约 3-5 分钟，完成后侧边栏自动出现 QLovehome 🎉

### Integration 模式（HACS 本页）

> 如果你**不是 HAOS**（HassOS 旧版 / Docker / venv），继续用 HACS 集成方式：

1. 设置 → 设备与服务 → 添加集成 → **QLovehome**
2. 点「提交」，侧边栏自动出现入口
3. 如果没出现，Dashboard 手动加「网页卡片」→ `/qlovehome/www/index.html`

### 纯 iframe（最简）

```bash
# 前端文件复制到 HA www 目录
cp -r custom_components/qlovehome/www/ /config/www/qlovehome/
```

Dashboard → 网页卡片 → 地址：`/local/qlovehome/index.html`

---

## 🔌 接线

主界面左下角铅笔图标打开编辑器 → **设备 tab → 🔍 从 HA 批量导入**

- 按 domain 分组列出你 HA 里所有控制类实体
- 勾选你家的设备 → 导入 → 自动推断类型 + 取 friendly_name
- 继续配房间归属 + 户型图位置 → 保存

**不用改任何 Python 脚本！** 详细步骤见完整 README。

---

## 📚 文档

📖 [完整 README（功能/架构/更新日志）](https://github.com/MisiteQ/QLovehome/blob/main/README.md)  
📖 [Add-on 专用说明](https://github.com/MisiteQ/QLovehome/blob/main/qlovehome_addon/README.md)  
🐛 [问题反馈](https://github.com/MisiteQ/QLovehome/issues)  
💡 [讨论区](https://github.com/MisiteQ/QLovehome/discussions)

---

## 🏷️ 标签

`home-assistant` `hacs` `dashboard` `panel` `addon` `home-dashboard` `xiaomi` `smart-home` `lovelace`

---

## 📄 许可

MIT License · Made with ❤️ by [MisiteQ](https://github.com/MisiteQ)

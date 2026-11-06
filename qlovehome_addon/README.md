# QLovehome · HAOS Add-on

> 全屋大屏家庭仪表盘，以 **Home Assistant Supervisor Add-on** 方式运行。
> 独立 Python 进程通过 HA WebSocket API 连接本机 Home Assistant，自动注入令牌，无需手动配置。

## 功能一览

| 模块 | 说明 |
|---|---|
| 🏠 户型图 | 矢量 SVG，矩形 / 多边形 / 圆形房间，墙体自动融合 |
| 🎛️ 中控 | 灯光 · 插座 · 空调（含扫风模式）· 风扇 · 窗帘统一开关 + 调光调色温 |
| 📊 概览 | 家人在线 · 用电 · 安防 · 温湿度 · 电池 · 摄像头 · 网络 |
| 🎨 主题 | 深/浅色跟随日出日落 · 四季配色自动切换 |
| 😴 屏保 | 无操作自动进待机大屏时钟 |
| 🕐 定时 | 服务器端调度，关面板 / 退出账号也照常执行 |
| 📝 最近动态 | 自动记录所有设备操控、定时设置与到点执行 |
| 🌤️ 天气 | 读任意 `weather.*` 实体（Met.no / 和风 / OWM 等），体感优先用实体自带字段 |
| 🔌 子设备绑定 | 热水器绑水量传感器、灯绑子灯组，子设备自动从户型图剔除 |
| 🔧 编辑器 | 可视化画户型 · 从 HA 批量导入实体 · 空格平移 · 滚轮缩放 · 拖房间名字定位 |

## 安装步骤

### 1. 添加加载项仓库

**Home Assistant → 设置 → 加载项 → 右上角 ⋮ → 添加加载项仓库**

URL 填：
```
https://github.com/MisiteQ/QLovehome
```

点 **添加**。仓库根目录里的 `repository.yaml` 会被自动识别。

### 2. 安装 QLovehome

加载项列表里找到 **QLovehome** → 点 **安装**

- Supervisor 会自动构建 Docker 镜像（首次约 3-5 分钟）
- 安装完成后，侧边栏自动出现 **QLovehome** 入口
- 点开就是全屋大屏 🎉

### 3. 初始化接线

首次打开后：

1. 左下角铅笔图标打开编辑器
2. **设备 tab → 🔍 从 HA 批量导入**
3. 勾选你家的设备 → 导入 → 保存

详细接线说明见主仓库 [README.md](https://github.com/MisiteQ/QLovehome/blob/main/README.md)。

## 架构说明

```
┌─ QLovehome Add-on（独立进程） ────────────────────┐
│                                                    │
│  ┌─ aiohttp 后端 ─┐    ┌─ HA WebSocket 连接层 ─┐  │
│  │ /api/qlh/* REST │───▶│ subscribe_entities    │  │
│  │ 静态文件托管    │    │ call_service           │  │
│  └────────────────┘    │ 断线自动重连 [1,2,5,10,30] │  │
│                         └────────────────────────┘  │
│  数据持久化: /data/qlh-config.json + /data/qlh-audit.log   │
└────────────────────────────────────────────────────┘
         ↕ Ingress (Supervisor 自动挂载)
┌─ 前端 www/（纯 HTML+SVG+JS） ──────────────────────┐
│ 户型图 · 中控面板 · 概览 · 编辑器 · 最近动态        │
└────────────────────────────────────────────────────┘
         ↕
┌─ Home Assistant Core ──────────────────────────────┐
│ supervisor/core (SUPERVISOR_TOKEN 自动注入)        │
└────────────────────────────────────────────────────┘
```

## 两种运行模式

QLovehome 有两套后端实现，共用同一套前端和 API 接口：

| 模式 | 目录 | 适用场景 |
|---|---|---|
| ⭐ **Add-on**（推荐） | `qlovehome_addon/` | HAOS 上一键跑，Supervisor 自动管理 |
| **Integration** | `custom_components/qlovehome/` | HACS 安装，纯 Python integration |

两种模式**前端代码完全相同**，API 接口一致，选哪个都行。

## 数据存储

| 文件 | 路径 | 说明 |
|---|---|---|
| 配置 | `/data/qlh-config.json` | 户型、设备、主题、概览等全部设置 |
| 审计日志 | `/data/qlh-audit.log` | 设备操控、定时设置、定时到点执行（JSONL） |
| 日志轮转 | `/data/qlh-audit.log.1` | 超过 1MB 自动轮转 |

> Supervisor 会定期备份 `/data` 目录，HA 恢复后配置不丢。

## 接口与安全

| 接口 | 用途 |
|---|---|
| `GET /api/qlh/health` | 存活探针（Supervisor `watchdog` 靠它自动拉起挂掉的进程） |
| `GET /api/qlh/status` | HA WebSocket 连接状态 / 已缓存实体数 / 定时任务数（排错用） |
| `/api/qlh/config` · `/api/qlh/ui` · `/api/qlh/timer` · `/api/qlh/audit` · `/api/qlh/service` | 和集成版完全一致 |

**默认只允许 Supervisor Ingress（带 `X-Ingress-Path`）和本机回环访问。**
如果把 `8765/tcp` 端口映射到局域网，需要显式二选一：

- 设置环境变量 `QLH_API_TOKEN=<token>`，请求带 `Authorization: Bearer <token>`
- 或设置 `QLH_ALLOW_DIRECT=1`（不鉴权，仅建议在完全可信的内网使用）

> 这个限制是为了避免「端口暴露 = 整栋房子的灯和门锁谁都能控制」。

## 硬件架构

| 架构 | 支持 |
|---|---|
| `aarch64` | ✅ 树莓派 4/5 · HAOS Green |
| `amd64` | ✅ 家用 x86 主机 · 虚拟机 |

基础镜像：`ghcr.io/home-assistant/{arch}-base:3.22`（构建时由 Supervisor 按架构自动替换，与 Home Assistant Core 2026.x 所用 Alpine 版本一致）。运行时依赖仅 `python3` + `py3-aiohttp`（Alpine community 预编译包），无 pip 编译，构建快。

## 问题反馈

遇到问题？→ [GitHub Issues](https://github.com/MisiteQ/QLovehome/issues)

## 许可

MIT License · Made with ❤️ by [MisiteQ](https://github.com/MisiteQ)

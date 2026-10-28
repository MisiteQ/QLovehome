# QLoveHome · 使用帮助（详细版）

> **适用版本**：v1.4.0  
> **适用人群**：Home Assistant 2024.6+ 用户  
> **前置条件**：已安装 Home Assistant，有一台平板（门口 / 客厅常亮）

---

## 目录

1. [这套面板能做什么？](#1-这套面板能做什么)
2. [快速安装（10 分钟）](#2-快速安装10-分钟)
   - 方式 A：HAOS Add-on（推荐）
   - 方式 B：HACS Integration
   - 方式 C：纯 iframe（最简，但功能受限）
3. [接线：把你的设备接进来](#3-接线把你的设备接进来)
   - ⭐ 方式 A：编辑器批量导入（推荐）
   - 方式 B：改 gen_qlh_data.py（进阶）
   - 实体 ID 怎么找
4. [换户型](#4-换户型)
5. [主题与个性化](#5-主题与个性化)
6. [可视化编辑器](#6-可视化编辑器)
7. [最近动态（最近操作记录）](#7-最近动态最近操作记录)
8. [常见问题排错](#8-常见问题排错)

---

## 1. 这套面板能做什么

一张图看完你的家：

| 区域 | 内容 |
|---|---|
| **户型图** | 矢量渲染的房间布局，墙体自动融合；点房间看温湿度和中控 |
| **右栏** | 常用设备快捷开关 + 安防网关在线状态 |
| **概览面板** | 家人在线 · 用电 · 安防 · 各屋温湿度 · 电池电量 · 摄像头 · 网络 · 系统 |
| **家电页** | 按类型聚合，灯、插座、空调（含扫风）、风扇、窗帘统一开关调光 |
| **最近动态** | 自动记录设备操控 / 定时设置 / 定时到点执行，JSONL 存服务器 |
| **屏保** | 无操作自动进大屏时钟，触控 / 键盘 / 滚轮任意操作唤醒 |

**零 YAML、零 Lovelace 配置、零 Webpack。** 纯 HTML + SVG + JS iframe。

---

## 2. 快速安装（10 分钟）

### 方式 A：HAOS Add-on（推荐）

如果你跑的是 HAOS（官方镜像、OVA、树莓派官方安装），Supervisor 一键装：

1. **Home Assistant → 设置 → 加载项 → 右上角 ⋮ → 添加加载项仓库**
2. URL：`https://github.com/MisiteQ/QLovehome`
3. 类别：**Home Assistant** → 添加
4. 列表里找到 **QLovehome** → 点 **安装**（首次构建约 3-5 分钟）
5. 完成后侧边栏自动出现 **QLovehome** 🎉

> 💡 Add-on 后端是独立 Python 进程，通过 HA WebSocket API 连接本机 HA（令牌由 Supervisor 自动注入），配置和审计日志存在 `/data/` 目录。HA 重启后定时任务自动恢复。

### 方式 B：HACS Integration

如果你不是 HAOS（Docker / venv / core 单独跑），用 HACS：

1. **HACS → 集成 → 右上角 ⋮ → 自定义存储库**
2. URL：`https://github.com/MisiteQ/QLovehome`
3. 类别：**集成**
4. 搜索 "QLovehome" → **下载** → 完成后 **重载**
5. **设置 → 设备与服务 → 添加集成 → QLovehome** → 点「提交」
6. 侧边栏自动出现入口。如果没出现 → Dashboard 手动加 iframe 卡片 → `/qlovehome/www/index.html`

### 方式 C：纯 iframe（最简，但功能受限）

如果不想装任何后端组件，只想看效果：

```bash
# 把前端文件复制到 HA 的 www 目录
cp -r custom_components/qlovehome/www/ /config/www/qlovehome/
```

Dashboard → **网页卡片（iframe）** → 地址：
```
/local/qlovehome/index.html
```

> ⚠️ 这种方式**没有后端**，配置只存浏览器 localStorage（换浏览器/清缓存会丢），定时任务不会在后台执行。不推荐长期用。

---

## 3. 接线：把你的设备接进来

### ⭐ 方式 A：编辑器批量导入（推荐，v1.1.0+）

**不需要改任何代码！** 点几下就搞定。

#### 前提

- 已通过 HACS 或手动复制完整安装（纯 iframe 方式没有 HA 集成，编辑器功能受限）
- HA 里已经能看到你的设备（灯、空调、插座这些）

#### 步骤

1. **打开编辑器**：主界面左下角铅笔图标，或设置面板里的「打开编辑器」
2. **切到设备 tab**
3. 如果你之前用的模板数据、设备实体全是作者家的：先点 **全选 → 删除选中** 清掉
4. 点顶部大按钮 **🔍 从 HA 批量导入**
5. 弹窗里你会看到按 domain 分组的实体列表：

```
💡 灯光          8 个（已加 3）
  ☑ 客厅主灯      light.living_main_light        on
  ☑ 餐厅吊灯      light.living_dining_light       off
  ☐ 书房台灯      light.study_desk_lamp           on    ← 灰掉：已在面板里
🔌 开关/插座      5 个
  ☑ 阳台插座      switch.balcony_plug             off
❄️ 空调/采暖      2 个
  ☑ 客厅空调      climate.living_ac               cool
...
```

6. 勾选你家的设备 → 点右下角 **导入 →**
7. 系统自动做三件事：
   - **推断类型**：`light.xxx` → 灯图标，`climate.xxx` → 空调图标，`switch.xxx` → 插座图标
   - **取名字**：用 HA 里的 friendly_name（比如"客厅主灯"）
   - **落位置**：新设备默认位置为空，稍后在编辑器户型图 tab 里拖到对的地方
8. 保存 → 刷新主界面，设备列表全是你的了 🎉

#### 小贴士

- **还没绑定的实体**（灰色禁用的）表示已经在面板里了，导入时自动跳过避免重复
- **sensor / binary_sensor / script / scene** 这些不会出现在批量列表里——它们不是"可控制设备"，而是状态 / 自动化
- 导入后在设备 tab 里**每台设备右侧有实时状态徽章**：✅ on / 🔴 off / ⚠ 离线 / ❌ 不存在

### 方式 B：改 gen_lovehome_data.py（进阶）

适合：设备特别多想一次性生成、或者要自定义房间名 / 概览里的家人 / 用电等特殊实体。

```bash
# 1. 改 gen_lovehome_data.py 里的实体 ID 和房间
# 2. 生成数据层
python gen_lovehome_data.py

# 3. 把生成的 lovehome-data.js 传到 /config/www/lovehome/
# 4. index.html 里的 ?v=N 加 1（浏览器缓存）
```

### 实体 ID 怎么找？

**HA → 设置 → 实体**：

1. 列表里找到你的设备
2. 点进去，右边会显示「实体 ID」
3. 点旁边的**复制图标**就能拿到完整 ID（比如 `light.living_main_light`）

**常见 domain 对应表**：

| 你想接 | domain | 实体 ID 格式 |
|---|---|---|
| 灯 / 灯带 | `light` | `light.xxx_light` |
| 插座 / 开关 | `switch` 或 `light` | `switch.xxx_plug` |
| 空调 / 地暖 / 新风 | `climate` | `climate.xxx_ac` |
| 窗帘 / 晾衣架 | `cover` | `cover.xxx_curtain` |
| 风扇 | `fan` | `fan.xxx_fan` |
| 影音 / TV / 音箱 | `media_player` | `media_player.xxx_tv` |
| 门锁 | `lock` | `lock.xxx_lock` |
| 摄像头 | `camera` | `camera.xxx_doorbell` |
| 温湿度传感器 | `sensor` | `sensor.xxx_temperature` |
| 电池电量 | `sensor` | `sensor.xxx_battery_level` |
| 手机在线 | `device_tracker` | `device_tracker.xxx_phone` |
| 日用电量 | `sensor` | `sensor.xxx_daily_energy` |

---

## 4. 换户型

三种做法：

| 方式 | 命令 | 适合 |
|---|---|---|
| A. 直接用模板 | 什么都不改 | 先看效果 |
| B. 现实风照片底板 | 把你的户型照片存 `custom_components/lovehome/www/assets/plan-real.jpg`，跑 `python calib_real.py <原图路径>` | 想让照片当底板，上面叠设备图标 |
| C. 重新提取多边形 | `python extract_rooms.py 标注图.png 户型图.png` → 生成新 `rooms_poly.json` → 再跑 gen 脚本 | 户型完全不同，想自定义房间形状 |

`rooms_poly.json` 是**唯一几何源头**。墙体、房间色块、标签位置全由它推导。改了它之后跑 `gen_lovehome_data.py` 就重新生成一遍。

---

## 5. 主题与个性化

点设置按钮（齿轮图标）→ 面板：

| 设置项 | 说明 |
|---|---|
| **字体大小** | 85% ~ 125%，全局缩放 |
| **面板透明度** | 左栏 + 右侧面板的背景透明度，默认 75% |
| **主题（深/浅色）** | 默认跟随日出日落自动切换；可手动锁定 |
| **四季配色** | 默认按节气自动换（立春入春、立夏入夏...）；可手动锁定 |
| **待机时间** | 无操作后多久进屏保（1-60 分钟） |
| **关于** | 版本号 + 功能亮点 |

所有设置都存在**本机浏览器的 localStorage**，不上传服务器。换浏览器 / 清浏览器数据会重置。

---

## 6. 可视化编辑器

主界面左下角有个编辑图标（铅笔），点进去进入编辑器。

### 🆕 批量导入 HA 实体

设备 tab 顶部有个大按钮 **🔍 从 HA 批量导入**。这是最快的设备绑定方式——不用手敲 entity_id。

- 按 domain 分组列出你 HA 里所有**可控制实体**（灯、开关、空调、窗帘、风扇、影音、门锁、摄像头、热水器...）
- 每行显示：friendly_name · entity_id · 当前状态
- 勾选想要的 → 导入后自动推断设备类型 + 取 friendly_name 当名字
- 已在面板里的实体灰掉禁用，避免重复
- 传感器 / 自动化 / script / scene 等不进列表（不是可控制设备）

### 子设备绑定（v1.4.0+）

热水器、主灯组这类设备，编辑器设备对话框里有 **「子设备 / 附属实体」** 区域：

- 给热水器绑水量传感器 / 零冷水开关 → 这些传感器只在控制面板里展示，不单独出现在户型图
- 主灯绑子灯 → 子灯自动从户型图剔除，只在主灯面板显示
- 绑定规则：灯只绑灯、窗帘只绑窗帘、热水器可绑开关/传感器

### 设备 tab 实时状态

每台设备右侧会显示一枚小徽章：

| 徽章 | 含义 |
|---|---|
| ✅ `on` / `off` | 在线，当前状态 |
| ⚠ `离线` | 设备 unreachable / unavailable |
| ⚠ `⚠ 实体不存在` | 这个 entity_id 在你 HA 里找不到 |

超过 30% 的设备实体不存在时，tab 头部会出现黄色告警提示你重新绑定。

### 快捷键

| 操作 | 效果 |
|---|---|
| **空格 + 拖动** | 平移画布 |
| **鼠标滚轮** | 缩放（以鼠标位置为锚，0.3× ~ 5×） |
| **Ctrl/⌘ + 0** | 重置缩放和位置 |
| **矩形房间** | 按住鼠标从一角拖到对角 |
| **圆形房间** | 按住鼠标从圆心拖出半径 |
| **多边形** | 逐点点击画异形 |
| **双击房间** | 弹框改名 |
| **Delete / Backspace** | 删除选中 |
| **Ctrl/⌘ / Shift + 点击** | 多选 |
| **右键** | 取消当前操作 |
| **Esc** | 退出编辑器 |

### 房间名字拖拽

主界面上，每个房间名字（包括温度数字）都可以直接**按住鼠标拖到任意位置**，松开自动保存到浏览器。

---

## 7. 最近动态（最近操作记录）

底部 tab 栏新增 **「最近动态」** 按钮，点进去会看到自动记录的所有操作。

### 能看到什么

| 事件类型 | 含义 | 例子 |
|---|---|---|
| 🟦 **设备操控** | 你或自动化对设备的每次操作 | 客厅空调调到 26°、关灯、打开门锁 |
| 🟧 **定时已设** | 你在面板上设的定时 | 客厅主灯 30 分钟后关 |
| 🟥 **定时取消** | 你手动取消了定时 | — |
| 🟩 **定时到点** | 定时到点自动执行 | 空调自动关闭（已执行）|

### 怎么用

1. 底部 tab 栏点 **「最近动态」**
2. 顶部切换 tab：**全部 / 设备操控 / 定时相关**
3. 每 20 秒自动刷新，也可以点 ↻ 立即刷新
4. 每条记录显示相对时间（刚刚 / N 分钟前 / 今天 HH:mm / 昨天 / 更早）

### 存储方式

- 后端 JSONL 文件：Add-on 存 `/data/qlh-audit.log`，Integration 存 `qlh/qlh-audit.log`
- 每行一条 JSON，超过 1MB 自动轮转备份（`.log → .log.1`）
- Supervisor 定期备份 `/data/` 目录 → HA 恢复后历史记录不丢

### 关联逻辑

每条记录直接存 `entity_id` + `service` + `data`，前端通过 entity_id 在已加载的 HA 实体状态里查 friendly_name 显示。找不到就显示原始 entity_id，不会空。

---

## 8. 常见问题排错

| 现象 | 原因 | 解决 |
|---|---|---|
| 🆕 **Error setting up entry for lovehome** | v1.0.0 的 panel_custom API 签名在 HA 2024.6+ 不兼容 | 升级到 **v1.0.1**（已修复，改用 frontend.register_built_in_panel） |
| 侧边栏没出现 LoveHome | panel 注册可能失败（非致命） | Dashboard 手动加 iframe 卡片 → `/api/lovelace/lovehome/` |
| 页面空白 | iframe 地址写错 / 文件没传 | 确认 Dashboard 卡片 URL；确认 `/config/www/lovehome/` 下有 index.html |
| 全是「—」 | 实体 ID 没换成你的 | 打开开发者工具 → 控制台输 `LH.rooms.map(r=>r.lxs)` 看实际读的是什么 |
| 图标有但点不动 | 该设备的 HA 服务不存在 | HA → **开发者工具 → 服务** → 搜该设备 → 手动触发试试 |
| 改了没生效 | 浏览器缓存 | `?v=N` 加 1；还不行 Ctrl+Shift+R 硬刷新 |
| 手机上侧栏不见了 | 正常行为 | ≤900px 窄屏模式，侧栏自动切到顶部下拉 |
| 墙太厚 / 太薄 | 墙带 pad 值 | 编辑器里改房间形状后重新生成，或 Console 输 `LH.plan.wallW=10` |
| 待机时间想调长 | 设置面板限制 60 分钟 | 可以改 localStorage 里的 `lhStandby`，或手动设置后刷新 |
| 房间内部有灰色线 | 旧版本 room-shape 透明度不够 | 升级到最新版本 |
| 墙带和房间有缝隙 | unionPolys pad 偏差 | 升级到最新版本 |
| 季节性配色太浓 | room-shape fill 透明度 | 升级到最新版本（已调浅 35-45%） |
| 设置面板导航点击跳转中间 | offsetTop 在多层 div 不准 | 升级到最新版本 |

### 调试工具

打开 HA Dashboard → iframe 页面 → 按 F12 开 Console：

```js
LH.rooms           // 查看所有房间数据
LH.plan            // 查看户型参数
LH.overview        // 查看概览配置
localStorage        // 查看本地存储（待机时间、主题、标签位置）
```

---

## 目录结构速查（用户版 zip）

```
QLoveHome-v1.1.0/
├── custom_components/lovehome/          # ← 复制到 /config/custom_components/
│   ├── __init__.py
│   ├── config_flow.py
│   ├── const.py
│   ├── manifest.json
│   ├── strings.json
│   ├── translations/{en.json, zh-Hans.json}
│   └── www/                              # ← 已经包含在集成里，部署时自动加载
│       ├── index.html
│       ├── lovehome.js
│       ├── lovehome-editor.js
│       ├── lovehome.css
│       ├── lovehome-data.js
│       ├── QLovehome.png
│       └── assets/{bg-day.jpg, bg-night.jpg, plan-real.jpg}
│
├── gen_lovehome_data.py                  # ⭐ 改这个接你的设备
├── hacs.json
├── info.md
├── README.md
├── USER_GUIDE.md                         # 本文件
└── LICENSE
```

`lovehome/` 源码头、`rooms_poly.json`、`optional-patches/` 都在 GitHub 仓库里，用户版 zip 不包含——但这些对**运行**不是必需的。

---

**遇到问题？** → https://github.com/MisiteQ/QLovehome/issues

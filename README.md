# 🏠 QLoveHome · 全屋大屏

[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.6%2B-blue.svg)](https://www.home-assistant.io/)
[![HACS Custom](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://hacs.xyz/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/MisiteQ/QLovehome.svg)](https://github.com/MisiteQ/QLovehome/issues)
[![GitHub stars](https://img.shields.io/github/stars/MisiteQ/QLovehome.svg)](https://github.com/MisiteQ/QLovehome/stargazers)

面向门口 / 客厅平板的 **Home Assistant 全屋大屏面板**。
纯 iframe 嵌入，零 YAML，零 Webpack——HTML + SVG + JS，源码可读可改。

> **开发者**：MisiteQ · [github.com/MisiteQ](https://github.com/MisiteQ)
> **报告问题**：[GitHub Issues](https://github.com/MisiteQ/QLovehome/issues)

---

## ✨ 功能

| 模块 | 说明 |
|---|---|
| 🏠 **户型图** | 矢量 SVG，矩形 / 多边形 / 圆形房间，墙体自动融合一体 |
| 🎛️ **中控** | 灯光 · 插座 · 空调 · 风扇 · 窗帘统一开关 + 调光调色温 |
| 📊 **概览** | 家人在线 · 用电 · 安防 · 温湿度 · 电池 · 摄像头 · 网络 |
| 🎨 **主题** | 深/浅色跟随日出日落 · 四季配色自动切换 · 房间色块温度感知 |
| 😴 **屏保** | 无操作自动进待机大屏时钟 · 待机时间可配置 |
| 🛠️ **编辑器** | 可视化画户型 · 空格平移画布 · 滚轮缩放 · 拖房间名字定位 |
| 🔧 **个性化** | 字体大小 · 面板透明度 · 主题深浅 · 待机时间 · 全部 localStorage |

---

## 📸 截图

| 首页（浅色主题） | 概览面板 |
|:---:|:---:|
| ![home-light](screenshots/home-light.png) | ![overview](screenshots/overview.png) |

| 编辑器 · 户型绘制 | 设置面板 |
|:---:|:---:|
| ![editor](screenshots/editor.png) | ![settings](screenshots/settings.png) |

| 房间详情（空调中控） | |
|:---:|:---:|
| ![room-detail](screenshots/room-detail.png) | |

---

## 🚀 安装

### 方式一：HACS 自定义存储库（推荐）

1. **HACS → 集成 → 右上角 ⋮ → 自定义存储库**
2. URL 填：`https://github.com/MisiteQ/QLovehome`
3. 类别选：**集成**
4. 搜索 **QLoveHome** → 安装 → 重启 HA
5. **设置 → 设备与服务 → 添加集成 → QLoveHome** → 选 dashboard
6. Dashboard 添加 **网页卡片（iframe）** → 地址：
   ```
   /api/lovelace/lovehome/
   ```

### 方式二：纯 iframe（最简）

```bash
# 复制前端文件到 HA www 目录
cp -r custom_components/lovehome/www/ /config/www/lovehome/
```

Dashboard → 网页卡片（iframe）→ 地址：
```
/local/lovehome/index.html
```

### 方式三：手动复制集成

```bash
# 复制整个集成目录
cp -r custom_components/lovehome/ /config/custom_components/
# 重启 HA
```

---

## 🔌 接线

所有设备实体、房间坐标、家电清单、概览卡片都在 `gen_lovehome_data.py` 里定义。

```bash
# 1. 改 gen_lovehome_data.py 里的实体 ID
# 2. 生成数据层
python gen_lovehome_data.py

# 3. 把生成的 lovehome-data.js 传到 /config/www/lovehome/
# 4. index.html 里的 ?v=N 加 1（浏览器缓存）
```

> **实体 ID 对不上不会报错**，只会显示「—」。先按模板跑通看效果，再逐个替换成你的实体。

---

## 🗺️ 换户型

| 方式 | 怎么做 | 适合 |
|---|---|---|
| A. 直接用模板 | 什么都不改 | 先看效果 |
| B. 现实风照片底板 | 照片存 `assets/plan-real.jpg`，跑 `python calib_real.py` | 想让照片当底板 |
| C. 重新提取多边形 | `python extract_rooms.py 标注图.png 户型图.png` | 户型完全不同 |

`rooms_poly.json` 是**唯一几何源头**——墙体、房间色块、标签位置全由它推导。

---

## ⌨️ 编辑器快捷键

| 操作 | 效果 |
|---|---|
| <kbd>Space</kbd> + 拖动 | 平移画布 |
| 滚轮 | 缩放（以鼠标位置为锚，0.3× ~ 5×） |
| <kbd>Ctrl/⌘</kbd> + <kbd>0</kbd> | 重置缩放和位置 |
| 矩形房间 | 按住从一角拖到对角 |
| 圆形房间 | 按住从圆心拖出半径 |
| 多边形 | 逐点点击画异形 |
| 双击房间 | 改名 / 拖拽房间名字移动 |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | 删除选中 |
| <kbd>Ctrl/⌘</kbd> / <kbd>Shift</kbd> + 点击 | 多选 |
| 右键 | 取消当前操作 |

---

## 📂 项目结构

```
QLovehome/
├── .github/workflows/validate.yaml   # CI: HACS + Python + JS 语法校验
├── .gitignore                        # Git 忽略规则
├── .hacsignore                       # HACS 下载包过滤
│
├── custom_components/lovehome/       # ⭐ HA 自定义集成
│   ├── __init__.py                    # integration 注册
│   ├── config_flow.py                 # HA 配置向导
│   ├── const.py                       # 常量
│   ├── manifest.json                  # 集成元信息（version / domain）
│   ├── strings.json                   # 配置向导文案
│   ├── translations/                  # 多语言（en / zh-Hans）
│   └── www/                           # 前端静态文件（HACS 部署用）
│       ├── index.html
│       ├── lovehome.js                # 主界面 + 几何算法
│       ├── lovehome-editor.js         # 可视化编辑器
│       ├── lovehome.css               # 全部样式 + 四季主题
│       ├── lovehome-data.js           # 数据层（gen 脚本生成）
│       ├── QLovehome.png              # 项目图标
│       └── assets/                    # 背景图（bg-day / bg-night / plan-real）
│
├── lovehome/                          # 前端源码（开发用，同步到 www/）
│
├── gen_lovehome_data.py               # ⭐ 数据生成器（改实体 ID 跑这个）
├── extract_rooms.py                   # 从标注图提取房间多边形
├── calib_real.py                      # 现实风底板校准
├── calib_real.json                    # 校准输出
├── rooms_poly.json                    # 房间多边形坐标（唯一几何源头）
├── photo_outline.json                 # 户型外轮廓
├── missing_ents.json                  # 未接入设备清单（运行时读取）
├── templates.yaml                     # HA template sensor 示例
├── optional-patches/
│   └── patch_midea5.py                # 美的 AC LAN 兼容补丁（可选）
│
├── QLovehome.png                      # 项目图标（根目录）
├── hacs.json                          # HACS 自动发现配置
├── info.md                            # HACS 安装后展示页
├── LICENSE                            # MIT
└── README.md                          # 本文件
```

---

## 🛠️ 开发

```bash
# 本地静态服务器
py -m http.server 8765 --directory lovehome/

# 改完同步到 custom_components
copy lovehome\. custom_components\lovehome\www\ -Recurse

# CI 自动校验：Python 语法 · JS 语法 · manifest.json · HACS Action
```

### 核心几何算法

| 函数 | 作用 |
|---|---|
| `unionPolys()` | 多边形并集 + 扩张（扫描线 + Marching Squares） |
| `autoOutlineLoops()` | 户型自动外轮廓 |
| `traceLoops()` | 无方向端点连接串闭合环 |
| `scanlineFill()` | 每多边形独立扫描线填充 |
| `chaikin()` | Chaikin 算法平滑 |
| `roundPath()` | 带贝塞尔倒角的 SVG path |

---

## ❓ 常见问题

| 现象 | 原因 |
|---|---|
| 页面空白 | iframe 地址错 / 文件没传 / `?v=N` 没加 |
| 全是「—」 | 实体 ID 没换成你的 |
| 图标有但点不动 | 该设备的 HA 服务不存在，先去开发者工具试跑 |
| 改了没生效 | `?v=N` 缓存号没加 1 |
| 手机侧栏不见 | 正常：≤900px 窄屏模式自动隐藏 |
| 墙体太厚 | `LH.plan.wallW` 默认 3px，改大改小都行 |
| 待机时间想调 | 设置 → 待机时间面板 |

---

## 🤝 贡献

欢迎 PR！提交前请确保：
1. CI Actions 全绿（HACS validation + Python 语法 + JS 语法）
2. `manifest.json` 的 `version` 同步更新
3. 改了 `gen_lovehome_data.py` 要重新跑一遍确认没 break

---

## 📄 许可

[MIT License](LICENSE) · 可以随便改、随便用。

初始版本来自一套真实家庭面板（脱敏处理），布局与交互逻辑原样保留。

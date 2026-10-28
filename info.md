# 🏠 QLovehome · 全屋大屏

面向门口 / 客厅平板的 **Home Assistant 全屋大屏面板**。

**零 YAML · 零 Webpack · 纯 iframe 嵌入 · 配置存在 HA 服务器上（换电脑不丢）**

---

## ✨ 功能亮点

| 功能 | 说明 |
|---|---|
| 🏠 户型图可视化 | 矢量 SVG · 矩形/多边形/圆形房间 · 墙体自动融合 |
| 🎛️ 中控操作 | 灯光 · 插座 · 空调 · 风扇 · 窗帘 · 开关 + 调光调色温 |
| 📊 概览卡片 | 家人在线 · 用电 · 安防 · 温湿度 · 电池 · 摄像头 · 网络 · 系统 |
| 🎨 四季主题 | 深/浅色跟随日出日落 · 春夏秋冬自动切换 · 房间色块温度感知 |
| 😴 自动屏保 | 无操作进大屏时钟 · 待机时间可配置 · 触控唤醒 |
| 🛠️ 可视化编辑器 | 画房间 · 空格平移画布 · 滚轮缩放 · 拖标签定位 |
| 💾 配置随 HA 走 | 存在集成自身目录 `qlh/qlh-config.json`，换电脑 / 换浏览器自动还原 |
| 📱 响应式 | 宽屏侧栏常驻 · 窄屏自动切弹层操作 |

---

## 🚀 安装步骤

### 1️⃣ 安装集成

**HACS 用户**：HACS → 集成 → 搜 "QLovehome" → 安装 → 重启 HA

**手动复制**：
```bash
cp -r custom_components/qlovehome/ /config/custom_components/
```

### 2️⃣ 添加集成

- 设置 → 设备与服务 → 添加集成 → **QLovehome**
- 点一下「提交」即可，侧边栏自动出现 **QLovehome**

**方式 B：手动 iframe**
```bash
cp -r custom_components/qlovehome/www/ /config/www/qlovehome/
```
Dashboard → 网页卡片 → 地址填：
```
/local/qlovehome/index.html
```

### 3️⃣ 接线

所有设备实体、房间坐标都在 `gen_qlovehome_data.py` 里定义：

```bash
# 改完实体后
python gen_qlovehome_data.py
# 传生成的 qlovehome-data.js 到 /config/www/qlovehome/
```

> 实体 ID 对不上只会显示「—」，不会报错。先跑通再替换。
> 更推荐直接在可视化编辑器里「从 HA 批量导入」，不用碰 Python。

---

## ⌨️ 编辑器快捷键

| 操作 | 效果 |
|---|---|
| 空格 + 拖动 | 平移画布 |
| 滚轮 | 缩放（以鼠标为锚） |
| Ctrl/⌘ + 0 | 重置 |
| 双击房间 | 改名 / 拖标签移动 |
| Delete | 删除选中 |

---

## 📚 文档

📖 [完整 README](https://github.com/MisiteQ/QLovehome/blob/main/README.md)  
🐛 [问题反馈](https://github.com/MisiteQ/QLovehome/issues)  
💡 [讨论区](https://github.com/MisiteQ/QLovehome/discussions)

---

## 🏷️ 标签

`home-assistant` `hacs` `dashboard` `panel` `home-dashboard` `xiaomi` `smart-home` `lovelace`

---

## 📄 许可

MIT License · Made with ❤️ by [MisiteQ](https://github.com/MisiteQ)

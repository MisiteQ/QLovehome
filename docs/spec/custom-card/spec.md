# QLovehome · 房间/设备关联集成卡片或加载项面板

## 1. 背景与目标

现场：qfnplus（Q飞牛+）安装进 HAOS 后，自带两套 Lovelace 卡片
（`custom:qfnplus-device-card`、`custom:qfnplus-popup-card`），并由集成通过
`add_extra_js_url` 自动注入 HA 前端。

QLovehome 目前在设备面板里只能按 HA 实体自行拼装通用控件，无法复用集成已经
做好的界面与样式。用户诉求：

1. 户型编辑器里添加的**设备**可关联某个集成提供的卡片（如 qfnplus）；
2. 户型编辑器里添加的**房间**也可关联（房间级面板）；
3. 卡片配置可直接编辑 **YAML**；
4. 也能嵌入**加载项**页面（HAOS Add-on ingress）。

目标：在 QLovehome 内点设备/房间时，直接呈现集成原生卡片或加载项页面，而不是
只能看 QLovehome 的通用控件。

## 2. 关键技术结论（已核实）

- QLovehome 集成以 `component_name="iframe"` 注册侧边栏面板，前端运行在
  `/qlh/www/index.html` 的同源 iframe 中。
- `qlovehome.js` 已通过 `window.parent.document.querySelector('home-assistant').hass`
  取得父窗口 hass（同源可访问）。
- qfnplus 卡片由 `add_extra_js_url` 注入 **HA 父窗口**，其自定义元素注册在父窗口
  的 `customElements` 中，`ha-icon` / `ha-card` / HA 主题变量也只存在于父窗口。
- 因此卡片**必须渲染到父窗口 document**，不能塞进 QLovehome iframe：
  - iframe 有自己的 `customElements` 注册表，`ha-icon` 等不会升级；
  - Qfnplus 卡片派发的 `hass-more-info` 事件需要冒泡到 `home-assistant` 才能打开
    HA 详情弹窗，放进 iframe 会丢失。
- 渲染方式：优先 `window.parent.loadCardHelpers()` →
  `helpers.createCardElement(cardConfig)`；失败则按 `type` 从
  `window.parent.customElements.get(name)` 取构造函数 `new` 并 `setConfig`。
- 加载项页面可直接用 HA 内置 `iframe` 卡片：
  `{ type: "iframe", url: "/hassio/ingress/<addon-slug>" }`。

## 3. 数据模型（向后兼容，均可选）

设备对象新增：

```json
{
  "id": "d1",
  "room": "living",
  "name": "NAS",
  "entity": "sensor.qfnplus_cpu_usage",
  "x": 180,
  "y": 240,
  "card": {
    "type": "custom:qfnplus-device-card",
    "device_id": "xxxxxxxx"
  }
}
```

房间对象新增：

```json
{
  "id": "study",
  "name": "书房",
  "card": {
    "type": "iframe",
    "url": "/hassio/ingress/xxxx"
  }
}
```

- `card` 为普通对象，键名与 Lovelace 卡片 YAML 完全一致。
- 无 `card` 字段时行为与现在完全一致。
- `exportConfig()` / 服务器保存按整段配置透传，后端无需改动。

## 4. 运行时改动

### 4.1 `qlovehome/index.html`

1. 在 `qlovehome-data.js` 之前引入本地 YAML 解析器：
   `<script src="./assets/js-yaml.min.js?v=1"></script>`
2. 现有脚本 query 版本号 `?v=158` 统一改为 `?v=159`。

### 4.2 新增文件 `qlovehome/assets/js-yaml.min.js`

- 使用 js-yaml 4.1.0 官方 UMD 构建（MIT，约 39 KB），全局变量 `jsyaml`。
- 已确认可从 `https://unpkg.com/js-yaml@4.1.0/dist/js-yaml.min.js` 下载（HTTP 200）。
- 放在 `assets/` 下：`scripts/sync-www.ps1` 已递归复制 assets，
  `scripts/package.ps1` 递归复制 www，无需改这两个脚本的文件清单。

### 4.3 `qlovehome/qlovehome.js`

新增「自定义面板浮层」区块（放在 `showLayer` 附近，函数声明可被前面的
`openControl` / `openRoom` 提升调用）：

1. `hassCardHost()`：返回 `{ win: window.parent, doc: window.parent.document }`；
   不在 iframe 或跨域时返回 `null`。
2. `makeHassCard(card)`：返回 Promise<HTMLElement>
   - 优先 `win.loadCardHelpers()` → `helpers.createCardElement(card)`；
   - 异常时读取 `card.type`，去掉 `custom:` 前缀后从 `win.customElements.get(name)`
     取构造函数，`new` 后调用 `setConfig(card)`；
   - 两者都失败时抛错（由浮层显示错误说明）。
3. `openCardOverlay(title, sub, card, onNative)`：
   - 在父窗口 `document.body` 创建浮层：
     - 遮罩 `position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.45)`；
     - 面板 `width:min(940px,calc(100vw - 32px));height:min(88vh,1100px)`，
       背景/文字使用 HA 主题变量 `--ha-card-background`、`--primary-text-color`；
     - 头部：标题、副标题、「原生控制」按钮（仅设备且传入 `onNative` 时显示）、关闭按钮；
     - 主体：卡片容器，`overflow:auto`。
   - 创建成功后赋值 `el.hass = hass()`；开启 1000ms 定时器持续同步
     `el.hass = hass()`，保证状态实时刷新。
   - 关闭（× / 遮罩 / Esc）时移除浮层、清定时器、移除 keydown 监听。
   - 父窗口不可用或 `hass()` 为空时 `toast('自定义面板需在 Home Assistant 中打开')`。
   - 卡片创建失败时在主体内显示：
     `自定义卡片「<type>」未加载。请确认对应集成已启用，或在 HA 仪表盘资源中添加该卡片 JS。`
4. 设备入口：`openControl(d, forceNative)` 增加第二参数。
   - 函数开头（相机判断之前）：
     ```js
     if (!forceNative && d && d.card) {
       openCardOverlay(d.name, roomName(d.room) + ' · 自定义面板', d.card,
         () => openControl(d, true));
       return;
     }
     ```
   - 「原生控制」按钮关闭浮层后以 `forceNative = true` 重开原有面板。
5. 房间入口：`openRoom(id)` 中设置 `#rpCard` 按钮：
   - `#rpCard.hidden = !r.card`；
   - 点击 `openCardOverlay(r.name, '自定义面板', r.card)`。
6. 设备房间列表 `rpItem(d)`：当 `d.card` 存在时，在名称后追加一个小标记
   `· 自定义`（纯展示，不改变点击行为；点击设备仍直接进自定义面板）。

### 4.4 `qlovehome/index.html`（房间面板头部）

`#roomPanel` 头部改为：

```html
<div class="rp-head">
  <div><b id="rpName">客厅</b><span id="rpMeta">—</span></div>
  <button class="rp-card-btn" id="rpCard" type="button" hidden>自定义面板</button>
  <button class="close" id="rpClose" type="button">×</button>
</div>
```

### 4.5 `qlovehome/qlovehome.css`

新增：

```css
.rp-card-btn { ...与 .rp-head .close 同一行、次要按钮样式... }
.lh-yaml { width:100%; min-height:150px; resize:vertical; ...等宽字体... }
.lh-yaml-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:6px; }
.lh-yaml-err { color: var(--danger, #d9534f); font-size:12px; }
```

### 4.6 `qlovehome/qlovehome-editor.js`

新增通用辅助：

1. `cardToYaml(card)`：
   - `window.jsyaml` 存在时 `jsyaml.dump(card, { noRefs: true, lineWidth: -1 })`；
   - 否则 `JSON.stringify(card, null, 2)`（JSON 也是合法 YAML）。
2. `parseCardYaml(text)`：
   - `window.jsyaml.load(text)`；结果必须是普通对象且 `type` 为非空字符串；
   - 否则抛错，错误信息用于 `toastHint`。
3. `bindCardEditor(form, key, owner, presetDeviceId)`：
   - 绑定 `#${key}Yaml` 文本域的两个预设按钮；
   - 预设「Q飞牛+ 设备卡」写入：
     ```yaml
     type: custom:qfnplus-device-card
     device_id: <presetDeviceId 或空>
     ```
   - 预设「加载项页面」写入：
     ```yaml
     type: iframe
     url: /hassio/ingress/<addon-slug>
     aspect_ratio: 75%
     ```
4. `openDeviceEditor`：
   - 在「子设备」区块之后追加「自定义面板（可选）」：
     `<textarea id="dCardYaml" class="lh-yaml" spellcheck="false">` +
     两个预设按钮 + 提示「留空 = 使用 QLovehome 原生控制面板」。
   - 保存逻辑：
     ```js
     const ytxt = $('#dCardYaml', form).value.trim();
     if (ytxt) {
       try { d.card = parseCardYaml(ytxt); }
       catch (e) { toastHint('自定义面板 YAML 解析失败：' + e.message, 2600); return; }
     } else { delete d.card; }
     ```
     解析失败时**不关闭弹窗、不落盘**。
   - 新设备预设 device_id：仅当 `d.device_id` 已有值时预填，否则留空。
5. `openRoomEditor`：
   - 追加同样的 `#rCardYaml` 文本域 + 预设按钮。
   - 保存时同样解析到 `r.card` / `delete r.card`。
6. `buildRoomRow` / `buildDeviceRow`（若有）副标题追加 `· 自定义面板` 标记，便于列表识别。

### 4.7 版本号（CI 三处必须一致）

`1.4.9` → `1.5.0`：

- `custom_components/qlovehome/manifest.json`
- `qlovehome_addon/config.yaml`
- `qlovehome_addon/server/manifest.json`

## 5. 非目标

- 不做「集成列表 → 自动生成卡片配置」的向导（无法可靠推断 card 的必填参数）。
- 不修改 qfnplus 集成。
- 不把卡片渲染进 QLovehome iframe（技术不可行，见第 2 节）。
- 不改变现有通用控制面板的任何行为；`card` 只是可选覆盖层。

## 6. 验证

1. `node --check qlovehome/qlovehome.js`
2. `node --check qlovehome/qlovehome-editor.js`
3. `pwsh -File scripts/sync-www.ps1`，三份副本 SHA256 一致。
4. `pwsh -File scripts/package.ps1`（三份一致性校验通过才打包）。
5. 语法/配置：
   - `python -m py_compile` 三个 Python 文件；
   - `python -c "import json; json.load(open('custom_components/qlovehome/manifest.json'))"`；
   - YAML 文件可被 `yaml.safe_load`。
6. HAOS 手工验收（192.168.31.112）：
   - 打开 QLovehome → 编辑设备 → 填入 qfnplus 预设 YAML（含 device_id）→ 保存；
   - 点该设备 → 父窗口浮层显示 qfnplus 原生面板，图标/样式正常，
     点卡片内磁贴能弹出 HA 标准详情；
   - 点「原生控制」→ 回到 QLovehome 原控制面板；
   - 房间面板出现「自定义面板」按钮，点击可打开房间卡；
   - 加载项 iframe 卡片可显示 `/hassio/ingress/<slug>` 页面；
   - 清空 YAML 保存后恢复原生面板；
   - 直接单独打开 `/qlh/www/index.html`（非 iframe）时给出提示而非白屏。
7. 回归：
   - 无 `card` 的设备/房间行为不变；
   - 导出/导入 JSON 后 `card` 字段保留；
   - 撤销/重做可用（`markDirty()` 路径不变）。

## 7. 发布

- 同步三份前端 → 打包 → 部署到用户 HAOS（保留 `qlh/qlh-config.json`）→
  重启 `ha core restart` → 更新 GitHub Release 附件（两个 zip）。
- 版本 `1.5.0`。

## 8. 待确认

- 是否同意版本号定为 `1.5.0`。
- 是否同意「设备有 `card` 时默认进自定义面板，原生控制作为浮层里的次要入口」。
- 是否同意通过本地 vendoring js-yaml 来支持 YAML（约 39 KB，离线可用）。

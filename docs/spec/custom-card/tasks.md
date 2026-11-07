# 实施任务 · 房间/设备关联集成卡片或加载项面板

> 对应规格：`docs/spec/custom-card/spec.md`
> 目标版本：`1.5.0`

## T1 引入 YAML 解析器
- [x] 下载 `https://unpkg.com/js-yaml@4.1.0/dist/js-yaml.min.js` 到
      `qlovehome/assets/js-yaml.min.js`。
- [x] `qlovehome/index.html` 在 `qlovehome-data.js` 前加入
      `<script src="./assets/js-yaml.min.js?v=1"></script>`。
- [x] 同文件三处脚本 `?v=158` 改为 `?v=159`。

## T2 运行时自定义面板浮层（`qlovehome/qlovehome.js`）
- [x] 新增 `hassCardHost()`：取 `window.parent` / `document`，不可用返回 null。
- [x] 新增 `makeHassCard(card)`：
      `loadCardHelpers().createCardElement()` 优先；失败按 `custom:` 名称取
      `parent.customElements` 构造函数；都失败抛错。
- [x] 新增 `openCardOverlay(title, sub, card, onNative)`：
      父窗口浮层、HA 主题变量、标题/副标题/原生控制/关闭、Esc 与遮罩关闭、
      1000ms 同步 `el.hass = hass()`、错误提示文案。
- [x] `openControl(d, forceNative)`：`d.card && !forceNative` 时进浮层，
      「原生控制」以 `forceNative = true` 回退原面板。
- [x] `openRoom(id)`：根据 `r.card` 显示/隐藏 `#rpCard` 并绑定点击。
- [x] `rpItem(d)`：`d.card` 存在时名称后加 `· 自定义`。

## T3 房间面板按钮（`qlovehome/index.html` + `qlovehome/qlovehome.css`）
- [x] `#roomPanel` 头部加入 `#rpCard` 按钮（默认 hidden）。
- [x] 新增 `.rp-card-btn` 样式。
- [x] 新增 `.lh-yaml`、`.lh-yaml-actions`、`.lh-yaml-err` 样式。

## T4 编辑器 YAML 配置（`qlovehome/qlovehome-editor.js`）
- [x] 新增 `cardToYaml(card)`（jsyaml.dump，缺失则 JSON 缩进）。
- [x] 新增 `parseCardYaml(text)`（`jsyaml.load` + 必须是含 `type` 的对象）。
- [x] 新增 `bindCardEditor(form, key, owner, presetDeviceId)`，含两个预设按钮：
      qfnplus 设备卡、加载项 iframe。
- [x] `openDeviceEditor`：追加 `#dCardYaml` 区块；保存时解析到 `d.card`，
      失败不关闭弹窗；空值 `delete d.card`。
- [x] `openRoomEditor`：追加 `#rCardYaml` 区块；同样保存到 `r.card`。
- [x] 房间/设备列表行副标题标注「自定义面板」。

## T5 版本号
- [x] `custom_components/qlovehome/manifest.json` → `1.5.0`
- [x] `qlovehome_addon/config.yaml` → `1.5.0`
- [x] `qlovehome_addon/server/manifest.json` → `1.5.0`

## T6 同步与校验
- [x] `pwsh -File scripts/sync-www.ps1`
- [x] `node --check qlovehome/qlovehome.js`（本机无 node，改用 QuickJS 语法解析）
- [x] `node --check qlovehome/qlovehome-editor.js`（同上）
- [x] 三份前端 SHA256 一致（sync 脚本自带校验）

## T7 打包与部署
- [x] `pwsh -File scripts/package.ps1`
- [x] SSH 部署到 `root@192.168.31.112:22222`，保留 `qlh/qlh-config.json`
- [x] `ha core restart`，确认版本 `1.5.0`、配置未丢失

## T8 手工验收（见 spec 第 6 节）
- [x] 自定义面板浮层能在 QLovehome 内打开（用户截图确认）
- [ ] qfnplus 完整面板直接显示（本次 T8.1 修复后待用户重载确认）
- [ ] 原生控制回退可用
- [ ] 房间自定义面板可用
- [ ] 加载项 iframe 可用
- [ ] 非 iframe 独立打开有提示
- [ ] 导出/导入、撤销/重做回归

## T8.1 取消 Q飞牛+ 二级弹窗（用户反馈）
- [x] 运行时把 `custom:qfnplus-popup-card` 归一化为 `custom:qfnplus-device-card`，
      第一次弹出即显示完整面板。
- [x] 编辑器保存时自动转换并提示，预设改为「Q飞牛+ 完整面板」。
- [x] 前端 `?v=160` 已同步三份并上传 HAOS，SHA256 与本地一致。

## T9 发布
- [x] 提交并推送 `main`
- [x] CI `Validate` 通过（run 42362755054）
- [x] 更新 GitHub Release `v1.5.0` 两个 zip 附件

/* LoveHome 可视化编辑器 —— 在页面内直接配置房间、设备、户型图
 *
 * 加载时机：必须在 lovehome-data.js 和 lovehome.js 之后引入（index.html 末尾）。
 * 工作方式：
 *   1. 页面启动时，检查 localStorage 里有没有用户保存过的配置；
 *      有就覆盖 window.LH（lovehome.js 已经读取过一次了，所以我们在 LOVEHOME_READY
 *      事件里重新触发 boot 的渲染流程）。
 *   2. 设置面板里出现「编辑模式」按钮，点开进入编辑器模态框。
 *   3. 所有修改即时保存到 localStorage；支持导入/导出 JSON，支持一键重置回模板。
 */
(function () {
  'use strict';

  const LS_KEY = 'lovehome.config.v1';
  const EVT_READY = 'LOVEHOME_READY';
  const NS = 'http://www.w3.org/2000/svg';
  /* 编辑器面板尺寸记忆（用户拖右下角调整大小后，下次打开保持） */
  const SIZE_KEY = 'lovehome.editor.size.v1';

  /* ── 存储层 ─────────────────────────────────────── */
  const Store = {
    load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw);
        if (!v || typeof v !== 'object') return null;
        return v;
      } catch (e) { return null; }
    },
    save(cfg) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(cfg));
        return true;
      } catch (e) { return false; }
    },
    clear() { try { localStorage.removeItem(LS_KEY); } catch (e) {} }
  };

  /* 深度合并：把 saved 里的字段覆盖到 base 上，但保留 base 的默认值
     （saved 里没有的字段仍然用默认值；saved 里显式设成 null/undefined 的也跳过） */
  function deepMerge(base, saved) {
    if (!saved || typeof saved !== 'object') return base;
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const k of Object.keys(saved)) {
      const sv = saved[k];
      if (sv == null) continue;                 // null/undefined 跳过
      if (typeof sv === 'object' && !Array.isArray(sv)
          && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        out[k] = deepMerge(base[k], sv);
      } else {
        out[k] = sv;
      }
    }
    return out;
  }

  /* ── 编辑器状态 ──────────────────────────────────── */
  const editState = {
    open: false,
    tab: 'plan',              // plan | devices | rooms | appliances | overview | data
    dirty: false,
    /* 户型编辑器 */
    plan: {
      dragDevice: null,       // { id, offsetX, offsetY }
      dragRoomPoly: null,     // { roomId, vertexIdx }
      newRoomPts: null,       // 正在画的新房间点
      placeDev: false         // 「图上添加设备」模式：下一次画布点击 = 放设备
    }
  };

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  /* 当前户型图 Tab 的「结束绘制」回调（全局只挂一个 mouseup 监听，切换 tab 时替换） */
  let planEndDraw = null;
  /* 列表多选：按 tab 分开记（devices / rooms） */
  const multiSel = { devices: new Set(), rooms: new Set() };
  /* 户型图多选：'r:<roomId>' / 'd:<devId>' */
  let planMulti = new Set();

  /* ── 配置应用：把任意配置对象注入 window.LH ──────────── */
  const CONFIG_SECTIONS = ['config', 'plan', 'rooms', 'devices', 'readouts',
                           'scenes', 'filters', 'appliances', 'supplies', 'panel', 'missing'];

  function applyConfigObject(v) {
    if (!v || typeof v !== 'object') return false;
    for (const k of CONFIG_SECTIONS) if (v[k] != null) window.LH[k] = v[k];
    return true;
  }

  function applySavedConfig() {
    const saved = Store.load();
    if (!saved) return false;
    return applyConfigObject(saved);
  }

  /* ── HA 服务器存储（WebSocket API，配置存 /config/lovehome/config.json）
     装了 LoveHome 集成 → 所有设备/浏览器共享；没装 → 退回本浏览器 localStorage ── */
  let serverReady = false;      // LoveHome 集成的 WebSocket API 是否可用
  let storageMode = 'local';    // 'server' | 'local'

  function haHass() {
    try {
      const doc = window.parent && window.parent.document;
      if (!doc) return null;
      const ha = doc.querySelector('home-assistant');
      return ha && ha.hass ? ha.hass : null;
    } catch (e) { return null; }
  }

  function loadServerConfig() {
    const hass = haHass();
    if (!hass || typeof hass.callWS !== 'function') return Promise.resolve(undefined);
    return hass.callWS({ type: 'lovehome/get_config' }).then((res) => {
      serverReady = true;
      storageMode = 'server';
      const cfg = res && res.config;
      // null = 服务器已连接但还没有配置（用模板默认值）
      return (cfg && typeof cfg === 'object' && Object.keys(cfg).length) ? cfg : null;
    }).catch(() => undefined);   // 集成未安装 / 命令不存在
  }

  function saveServerConfig(cfg) {
    const hass = haHass();
    if (!hass || typeof hass.callWS !== 'function' || !serverReady) {
      return Promise.resolve(false);
    }
    return hass.callWS({ type: 'lovehome/save_config', config: cfg })
      .then(() => true).catch(() => false);
  }

  /* ── 格式归一化：把编辑器里可能改过的数据转回 lovehome.js 期望的格式
     (lovehome.js 对 room.pts 直接 .split(' ')，必须是字符串) ──────── */
  function normalizeConfig() {
    (window.LH.rooms || []).forEach((r) => {
      if (Array.isArray(r.pts)) {
        r.pts = r.pts.map((p) => p.join(',')).join(' ');
      }
    });
    // plan.walls / plan.outline / plan.photo.outline 也应该确保是字符串
    if (window.LH.plan && typeof window.LH.plan.walls !== 'string') window.LH.plan.walls = '';
  }

  /* 给用户导出的完整配置 JSON（把 window.LH 里所有可配置字段导出） */
  function exportConfig() {
    normalizeConfig();
    const out = {};
    for (const k of CONFIG_SECTIONS) if (window.LH[k] != null) out[k] = window.LH[k];
    return out;
  }

  /* 保存当前配置：本地镜像 + HA 服务器（若集成可用） */
  function persist() {
    const out = exportConfig();
    Store.save(out);                       // 本地镜像（缓存 / 未装集成时的唯一存储）
    if (serverReady) {
      saveServerConfig(out).then((ok) => {
        if (ok) { editState.dirty = false; }
        else toastHint('保存到 HA 服务器失败，当前仅保存在本浏览器');
      });
    } else {
      editState.dirty = false;
    }
    return true;
  }

  /* 修改后调用：标记 dirty 并即时保存 */
  function markDirty() {
    editState.dirty = true;
    persist();
  }

  /* ── 编辑器模态框：DOM 结构 ────────────────────────── */
  let editorRoot = null;

  function buildEditor() {
    if (editorRoot) return editorRoot;
    const root = el('div', 'lh-editor');
    root.innerHTML =
      '<div class="lh-ed-mask"></div>' +
      '<div class="lh-ed-panel">' +
        '<div class="lh-ed-head">' +
          '<div class="lh-ed-title"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>LoveHome 可视化编辑器' +
            '<span class="lh-ed-badge" id="lhEdStorageBadge"></span></div>' +
          '<div class="lh-ed-head-actions">' +
            '<button class="lh-ed-btn" id="lhEdExport" type="button">导出 JSON</button>' +
            '<button class="lh-ed-btn" id="lhEdImport" type="button">导入</button>' +
            '<button class="lh-ed-btn danger" id="lhEdReset" type="button">重置为模板</button>' +
            '<button class="lh-ed-btn primary" id="lhEdClose" type="button">完成</button>' +
            '<button class="lh-ed-x" id="lhEdX" type="button" title="关闭编辑器">×</button>' +
          '</div>' +
        '</div>' +
        '<nav class="lh-ed-tabs">' +
          '<button class="lh-ed-tab active" data-tab="plan" type="button">户型图</button>' +
          '<button class="lh-ed-tab" data-tab="devices" type="button">设备</button>' +
          '<button class="lh-ed-tab" data-tab="rooms" type="button">房间</button>' +
          '<button class="lh-ed-tab" data-tab="appliances" type="button">家电页</button>' +
          '<button class="lh-ed-tab" data-tab="overview" type="button">概览 · 家人 · 网关</button>' +
          '<button class="lh-ed-tab" data-tab="shell" type="button">侧栏 · 底栏</button>' +
          '<button class="lh-ed-tab" data-tab="data" type="button">数据备份</button>' +
        '</nav>' +
        '<div class="lh-ed-body" id="lhEdBody"></div>' +
      '</div>';
    document.body.appendChild(root);
    editorRoot = root;

    // 绑定头部按钮
    $('#lhEdClose', root).addEventListener('click', closeEditor);
    $('#lhEdX', root).addEventListener('click', closeEditor);
    $('#lhEdExport', root).addEventListener('click', doExport);
    $('#lhEdImport', root).addEventListener('click', doImport);
    $('#lhEdReset', root).addEventListener('click', doReset);
    $('.lh-ed-mask', root).addEventListener('click', closeEditor);

    // Tab 切换
    $$('.lh-ed-tab', root).forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    // 画房间时鼠标松手在画布外也要结束（全局只注册一次）
    document.addEventListener('mouseup', (e) => {
      if (planEndDraw) planEndDraw(e);
    });

    // 户型图快捷键：Delete/Backspace 批量删除选中，Esc 取消选择
    document.addEventListener('keydown', (e) => {
      if (!editState.open || editState.tab !== 'plan') return;
      const tag = (e.target && e.target.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!planMulti.size) return;
        e.preventDefault();
        deletePlanSelection();
      } else if (e.key === 'Escape') {
        if (editState.plan.newRoomPts != null || editState.plan.drawStart) return;
        if (!planMulti.size) return;
        planMulti.clear();
        selected = { type: null, id: null };
        refreshPlanSelection();
        updatePlanInfo();
      }
    });

    // 恢复上次调整过的面板尺寸
    const panel = $('.lh-ed-panel', root);
    try {
      const s = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
      if (s && s.w >= 420 && s.h >= 320) {
        panel.style.width = Math.min(s.w, window.innerWidth - 24) + 'px';
        panel.style.height = Math.min(s.h, window.innerHeight - 24) + 'px';
      }
    } catch (e) { /* ignore */ }
    // 拖右下角改尺寸 → 记住（防抖 400ms）
    let sizeTimer = null;
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        clearTimeout(sizeTimer);
        sizeTimer = setTimeout(() => {
          try {
            localStorage.setItem(SIZE_KEY, JSON.stringify({
              w: Math.round(panel.getBoundingClientRect().width),
              h: Math.round(panel.getBoundingClientRect().height)
            }));
          } catch (e) { /* ignore */ }
        }, 400);
      }).observe(panel);
    }

    // 存储模式徽章
    const badge = $('#lhEdStorageBadge', root);
    if (badge) {
      if (serverReady) { badge.textContent = '服务器同步 · 全设备'; badge.classList.add('ok'); }
      else { badge.textContent = '仅本机保存'; badge.classList.add('warn'); }
    }

    return root;
  }

  function openEditor() {
    buildEditor();
    editorRoot.classList.add('open');
    editState.open = true;
    switchTab('plan');
  }

  function closeEditor() {
    if (editState.dirty) persist();
    editorRoot.classList.remove('open');
    editState.open = false;
  }

  function switchTab(tab) {
    editState.tab = tab;
    $$('.lh-ed-tab', editorRoot).forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const body = $('#lhEdBody', editorRoot);
    body.innerHTML = '';
    body.appendChild(buildTabContent(tab));
  }

  /* ── 各 tab 的内容构建 ───────────────────────────────── */
  function buildTabContent(tab) {
    switch (tab) {
      case 'plan': return buildPlanTab();
      case 'devices': return buildDevicesTab();
      case 'rooms': return buildRoomsTab();
      case 'appliances': return buildAppliancesTab();
      case 'overview': return buildOverviewTab();
      case 'shell': return buildShellTab();
      case 'data': return buildDataTab();
    }
    return el('div', 'lh-ed-empty');
  }

  /* ══════════════════════════════════════════════════════
   * Tab: 户型图（plan）
   * ══════════════════════════════════════════════════════ */

  /* SVG 坐标换算：鼠标事件 → 画布坐标（限制在画布范围内，防止拖出边界）
     SVG 用的是 preserveAspectRatio="xMidYMid meet"：容器比例和 viewBox 比例不一致时
     四周会留白，直接按 rect 拉伸算会让落点整体偏移（画出来的房间不在鼠标位置）。
     所以先按「等比缩放 + 居中留白」反算。 */
  function svgPoint(svg, e) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const s = Math.min(rect.width / vb[2], rect.height / vb[3]) || 1;
    const offX = (rect.width - vb[2] * s) / 2;
    const offY = (rect.height - vb[3] * s) / 2;
    const x = (e.clientX - rect.left - offX) / s;
    const y = (e.clientY - rect.top - offY) / s;
    return {
      x: Math.round(Math.min(Math.max(x, 0), vb[2]) * 10) / 10,
      y: Math.round(Math.min(Math.max(y, 0), vb[3]) * 10) / 10
    };
  }

  /* 射线法：某个点落在哪个房间多边形里（用于"图上放设备自动归房间"） */
  function roomAtPoint(x, y) {
    for (const r of (window.LH.rooms || [])) {
      const pts = (typeof r.pts === 'string' ? r.pts.split(' ') : []).map((s) => s.split(',').map(Number));
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      if (inside) return r;
    }
    return null;
  }

  /* 底图栏：无底图 → 引导导入；有底图 → 位置/大小微调 */
  function buildPhotoBar() {
    const plan = window.LH.plan || {};
    const bar = el('div', 'lh-ed-photo-bar');
    if (!plan.photo) {
      bar.innerHTML = '<span class="hint">💡 先「导入底图」放一张户型照片 / 设计底版图，再画房间、放设备，位置就能精确对齐。底图在主页「现实」皮肤下显示。</span>';
      return bar;
    }
    const p = plan.photo;
    bar.innerHTML = '<b>底图</b>' +
      '<label>X<input type="number" id="phX" value="' + (p.x || 0) + '"></label>' +
      '<label>Y<input type="number" id="phY" value="' + (p.y || 0) + '"></label>' +
      '<label>宽<input type="number" id="phW" value="' + (p.w || plan.w) + '"></label>' +
      '<label>高<input type="number" id="phH" value="' + (p.h || plan.h) + '"></label>' +
      '<button class="lh-ed-btn" id="phFit" type="button">铺满画布</button>' +
      '<button class="lh-ed-btn danger" id="phDel" type="button">移除</button>';
    const apply = () => {
      p.x = parseFloat($('#phX', bar).value) || 0;
      p.y = parseFloat($('#phY', bar).value) || 0;
      p.w = parseFloat($('#phW', bar).value) || plan.w;
      p.h = parseFloat($('#phH', bar).value) || plan.h;
      markDirty();
      rerenderEditorTab();
      document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
    };
    ['phX', 'phY', 'phW', 'phH'].forEach((id) => $('#' + id, bar).addEventListener('change', apply));
    $('#phFit', bar).addEventListener('click', () => {
      p.x = 0; p.y = 0; p.w = plan.w; p.h = plan.h;
      markDirty(); rerenderEditorTab();
      document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
    });
    $('#phDel', bar).addEventListener('click', () => {
      if (!confirm('确定移除底图？')) return;
      delete plan.photo;
      markDirty(); rerenderEditorTab();
      document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
    });
    return bar;
  }

  function buildPlanTab() {
    const wrap = el('div', 'lh-ed-plan-wrap');
    wrap.innerHTML = '<div class="lh-ed-plan-left">' +
      '<div class="lh-ed-plan-tools">' +
      '<b>户型图</b>' +
      '<button class="lh-ed-btn primary" id="lhEdPlanAddDev" type="button">+ 添加设备</button>' +
      '<button class="lh-ed-btn" id="lhEdPlanDragRoom" type="button">▭ 矩形房间</button>' +
      '<button class="lh-ed-btn" id="lhEdPlanPolyRoom" type="button">⬡ 多边形</button>' +
      '<button class="lh-ed-btn" id="lhEdPlanCircleRoom" type="button">◯ 圆形房间</button>' +
      '<button class="lh-ed-btn" id="lhEdPlanImportImg" type="button">导入底图</button>' +
      '<button class="lh-ed-btn danger" id="lhEdPlanDelSel" type="button">删除选中</button>' +
      '<button class="lh-ed-btn" id="lhEdPlanFinish" type="button" style="display:none">✓ 完成绘制</button>' +
      '<div class="hint">矩形：按住鼠标从一角拖到对角直接成房<br>圆形：按住从圆心拖出半径<br>L形/T形/梯形等异形：用「多边形」逐点画<br>拖设备挪位置 · 双击房间改名<br>Ctrl/Shift+点击 多选 · Delete 批量删除 · 右键取消<br><b>按住空格键</b>可平移画布</div>' +
      '</div>' +
      '<div id="lhEdPhotoBarSlot"></div>' +
      '<div class="lh-ed-plan-info" id="lhEdPlanInfo">未选中</div>' +
      '</div>' +
      '<div class="lh-ed-plan-canvas" id="lhEdPlanCanvas"></div>';

    // 渲染 SVG 户型图
    const canvas = $('#lhEdPlanCanvas', wrap);
    const svg = buildPlanSvg();
    canvas.appendChild(svg);

    /* ── 画布变换：空格拖动平移 + 滚轮缩放 ── */
    let spaceHeld = false, panning = false;
    let cx = 0, cy = 0, tx = 0, ty = 0, scale = 1;
    const isInputFocused = () => {
      const el = document.activeElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const applyTransform = () => {
      svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    };
    const resetTransform = () => { cx = 0; cy = 0; tx = 0; ty = 0; scale = 1; applyTransform(); };
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !isInputFocused() && editorRoot.classList.contains('open')) {
        e.preventDefault();
        spaceHeld = true;
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        spaceHeld = false;
        if (panning) { panning = false; canvas.classList.remove('panning'); }
      }
      if (e.code === 'Key0' && (e.ctrlKey || e.metaKey)) { resetTransform(); }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!spaceHeld || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      panning = true; canvas.classList.add('panning');
      cx = e.clientX; cy = e.clientY;
    });
    document.addEventListener('mousemove', (e) => {
      if (!panning) return;
      tx += e.clientX - cx; ty += e.clientY - cy;
      cx = e.clientX; cy = e.clientY;
      applyTransform();
    });
    document.addEventListener('mouseup', () => {
      if (panning) { panning = false; canvas.classList.remove('panning'); }
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newScale = Math.max(0.3, Math.min(5, scale * factor));
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
      // 缩放以鼠标位置为锚点
      tx = mx - (mx - tx) * (newScale / scale);
      ty = my - (my - ty) * (newScale / scale);
      scale = newScale;
      applyTransform();
    }, { passive: false });
    // Ctrl+0 重置缩放：把函数暴露到 canvas 上
    canvas._resetTransform = resetTransform;

    // 底图栏
    $('#lhEdPhotoBarSlot', wrap).replaceWith(buildPhotoBar());

    /* ── 模式按钮 ── */
    const clearModes = () => {
      editState.plan.placeDev = false;
      editState.plan.newRoomPts = null;
      editState.plan.drawMode = null;
      canvas.classList.remove('placing', 'drawing');
    };
    $('#lhEdPlanDragRoom', wrap).addEventListener('click', () => {
      clearModes();
      editState.plan.drawMode = 'rect';
      canvas.classList.add('drawing');
      toastHint('拖拽画房间：在图上按住鼠标左键，从房间一角拖到对角，松手即成矩形房间');
    });
    $('#lhEdPlanCircleRoom', wrap).addEventListener('click', () => {
      clearModes();
      editState.plan.drawMode = 'circle';
      canvas.classList.add('drawing');
      toastHint('圆形房间：在圆心位置按住鼠标，向外拖出半径，松手成房');
    });
    $('#lhEdPlanPolyRoom', wrap).addEventListener('click', () => {
      clearModes();
      editState.plan.newRoomPts = [];
      toastHint('多边形房间（L形/T形/梯形/三角形等异形）：依次点击顶点（≥3 个，靠近已有角点会自动吸附），双击或点「✓ 完成绘制」结束，右键取消');
    });
    $('#lhEdPlanAddDev', wrap).addEventListener('click', () => {
      editState.plan.newRoomPts = null;
      editState.plan.placeDev = true;
      canvas.classList.add('placing');
      toastHint('在户型图上点一下 → 设备放到那里，并自动归入所在房间');
    });
    $('#lhEdPlanImportImg', wrap).addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return;
        if (f.size > 8 * 1024 * 1024) { toastHint('图片超过 8MB，请先压缩再导入'); return; }
        const r = new FileReader();
        r.onload = () => {
          const plan = window.LH.plan || (window.LH.plan = { w: 620, h: 692 });
          plan.photo = { src: r.result, x: 0, y: 0, w: plan.w, h: plan.h };
          // 自动切到「现实」皮肤，让底图在主页面立刻可见
          try { localStorage.setItem('lhSkin', 'real'); } catch (e) { /* ignore */ }
          markDirty();
          rerenderEditorTab();
          document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
          toastHint('底图已导入，主页自动切换到「现实」皮肤。用底图栏的 X/Y/宽/高 微调对位');
        };
        r.readAsDataURL(f);
      };
      inp.click();
    });
    $('#lhEdPlanDelSel', wrap).addEventListener('click', deletePlanSelection);
    $('#lhEdPlanFinish', wrap).addEventListener('click', () => finishNewRoom(svg));

    /* ── 画布交互 ── */
    svg.addEventListener('click', (e) => {
      // 模式一：图上添加设备
      if (editState.plan.placeDev) {
        editState.plan.placeDev = false;
        canvas.classList.remove('placing');
        const pt = svgPoint(svg, e);
        const room = roomAtPoint(pt.x, pt.y);
        openDeviceEditor(null, { x: pt.x, y: pt.y, roomId: room ? room.id : '' });
        if (room) toastHint('设备将放入房间「' + room.name + '」，保存后生效');
        return;
      }
      // 模式二：画新房间（收集顶点，靠近已有顶点时自动吸附）
      if (editState.plan.newRoomPts != null) {
        const raw = svgPoint(svg, e);
        const sn = snapPt(raw.x, raw.y);
        editState.plan.newRoomPts.push([sn.x, sn.y]);
        const preview = $('#lhNewRoomPreview', svg) ||
          (() => { const p = document.createElementNS(NS, 'polyline');
            p.id = 'lhNewRoomPreview';
            p.setAttribute('fill', 'rgba(212,163,115,.25)');
            p.setAttribute('stroke', '#d4a373');
            p.setAttribute('stroke-width', '2');
            p.setAttribute('stroke-dasharray', '4 3');
            svg.appendChild(p); return p; })();
        preview.setAttribute('points', editState.plan.newRoomPts.map((p) => p.join(',')).join(' '));
        $('#lhEdPlanFinish', wrap).style.display = '';
        if (sn.snapped) toastHint('顶点已吸附到相邻房间角点');
      }
    });
    svg.addEventListener('dblclick', () => {
      // 只有在画多边形房间时才结束绘制，否则双击空画布不该弹提示
      if (editState.plan.newRoomPts != null) finishNewRoom(svg);
    });
    svg.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      cancelDrawMode(svg, wrap);
    });

    /* ── 拖拽画房间（矩形 / 圆形）：按住拖动，松手成房 ── */
    svg.addEventListener('mousedown', (e) => {
      const mode = editState.plan.drawMode;
      if (!mode || (mode !== 'rect' && mode !== 'circle')) return;
      // 落在设备/标签/顶点上不画，让它们自己响应拖动
      if (e.target.closest && e.target.closest('.lh-ed-plan-dev, .lh-ed-plan-label, .lh-ed-plan-vertex')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      editState.plan.drawStart = svgPoint(svg, e);
    });
    svg.addEventListener('mousemove', (e) => {
      // 矩形/圆形预览
      const mode = editState.plan.drawMode;
      if ((mode === 'rect' || mode === 'circle') && editState.plan.drawStart) {
        const p2 = svgPoint(svg, e);
        drawShapePreview(svg, mode, editState.plan.drawStart, p2);
      }
    });
    const endDraw = (e) => {
      const mode = editState.plan.drawMode;
      if ((mode === 'rect' || mode === 'circle') && editState.plan.drawStart) {
        const a = editState.plan.drawStart;
        const b = svgPoint(svg, e);
        editState.plan.drawStart = null;
        removeShapePreview(svg);
        if (mode === 'rect') {
          const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
          const x2 = Math.max(a.x, b.x), y2 = Math.max(a.y, b.y);
          if (x2 - x1 < 12 || y2 - y1 < 12) { toastHint('拖得太小了，重新拖一个大一点的矩形'); return; }
          createRoomFromPts([[x1, y1], [x2, y1], [x2, y2], [x1, y2]]);
        } else {
          const r = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
          if (r < 12) { toastHint('半径太小了，从圆心往外多拖一些'); return; }
          // 圆形用 24 段多边形近似（房间数据结构是多边形）
          const pts = [];
          for (let i = 0; i < 24; i++) {
            const ang = (i / 24) * Math.PI * 2;
            pts.push([Math.round((a.x + r * Math.cos(ang)) * 10) / 10,
                      Math.round((a.y + r * Math.sin(ang)) * 10) / 10]);
          }
          createRoomFromPts(pts);
        }
        return;
      }
    };
    svg.addEventListener('mouseup', endDraw);
    // 松手点落在画布外也要结束绘制：交给全局唯一的 document 监听（避免每切一次 tab 就多挂一个）
    planEndDraw = endDraw;

    // 恢复之前的选中状态（重绘后高亮/信息栏要跟上）
    refreshPlanSelection();
    updatePlanInfo();

    return wrap;
  }

  /* 矩形/圆形绘制预览 */
  function drawShapePreview(svg, mode, a, b) {
    let pn = mode === 'rect' ? '#lhRectPreview' : '#lhCirclePreview';
    let n = $(pn, svg);
    if (!n) {
      n = document.createElementNS(NS, mode === 'rect' ? 'rect' : 'circle');
      n.id = pn.slice(1);
      n.setAttribute('class', 'lh-ed-shape-preview');
      svg.appendChild(n);
    }
    if (mode === 'rect') {
      n.setAttribute('x', Math.min(a.x, b.x));
      n.setAttribute('y', Math.min(a.y, b.y));
      n.setAttribute('width', Math.abs(b.x - a.x));
      n.setAttribute('height', Math.abs(b.y - a.y));
    } else {
      n.setAttribute('cx', a.x);
      n.setAttribute('cy', a.y);
      n.setAttribute('r', Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2));
    }
  }
  function removeShapePreview(svg) {
    ['#lhRectPreview', '#lhCirclePreview'].forEach((id) => {
      const n = $(id, svg);
      if (n) n.remove();
    });
  }
  /* 右键 / 取消一切绘制状态 */
  function cancelDrawMode(svg, wrap) {
    if (editState.plan.newRoomPts != null) {
      const p = $('#lhNewRoomPreview', svg);
      if (p) p.remove();
      editState.plan.newRoomPts = null;
      if (wrap) $('#lhEdPlanFinish', wrap).style.display = 'none';
      toastHint('已取消绘制房间');
    } else if (editState.plan.drawStart) {
      editState.plan.drawStart = null;
      removeShapePreview(svg);
      toastHint('已取消绘制');
    } else if (editState.plan.placeDev) {
      editState.plan.placeDev = false;
      const canvas = $('#lhEdPlanCanvas', editorRoot);
      if (canvas) canvas.classList.remove('placing');
      toastHint('已取消放置设备');
    } else if (editState.plan.drawMode) {
      editState.plan.drawMode = null;
      const canvas = $('#lhEdPlanCanvas', editorRoot);
      if (canvas) canvas.classList.remove('drawing');
    }
  }

  /* 画完房间后的收尾流程：轴对齐检测 → 弹命名框。
     无论中间经历了什么（重叠合并 / trim / split / 原样保留），
     只要房间最终还存在，就走这套流程给它命名。 */
  function postCreateRoom(room) {
    if (!room || !window.LH.rooms.find((r) => r.id === room.id)) return;
    const finalPts = ptsOf(room.pts);
    if (shouldAxisAlign(finalPts)) {
      askAxisAlign(finalPts, (aligned) => {
        if (aligned) {
          room.pts = aligned.map((p) => p.join(',')).join(' ');
          const b = polyBBox(aligned);
          room.lx = Math.round(((b[0] + b[2]) / 2) * 10) / 10;
          room.ly = Math.round(((b[1] + b[3]) / 2) * 10) / 10;
          markDirty(); rerenderEditorTab();
          document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
        }
        askRoomName(room);
      });
    } else {
      askRoomName(room);
    }
  }

  /* 三种画法共用：顶点数组 → 房间 */
  function createRoomFromPts(pts) {
    let finalPts = pts.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]);
    const cx = finalPts.reduce((s, p) => s + p[0], 0) / finalPts.length;
    const cy = finalPts.reduce((s, p) => s + p[1], 0) / finalPts.length;
    const newId = genId('room', window.LH.rooms);
    const newRoom = {
      id: newId, name: '新房间',
      lx: Math.round(cx * 10) / 10, ly: Math.round(cy * 10) / 10,
      mk: 'both', temp: '', hum: '',
      pts: finalPts.map((p) => p.join(',')).join(' ')
    };
    window.LH.rooms.push(newRoom);
    selected = { type: 'room', id: newId };
    markDirty();
    rerenderEditorTab();
    document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));

    /* 先看有没有重叠 —— 有重叠就让 applyOverlapAction 处理完后继续 postCreate；
       没重叠直接 postCreate */
    const hit = findOverlapRoom(newRoom);
    if (hit) {
      askRoomOverlap(newRoom, hit);
      // applyOverlapAction 里各分支会在处理完后自己调 postCreateRoom(room 或 other)
    } else {
      postCreateRoom(newRoom);
    }
    return newRoom;
  }

  /* ── 横平竖直检测 & 拉直 ──
     检测：遍历所有边，计算角度是否偏离 0/90/180/270 超过 4°；圆形(24)/三角(3)/4 顶点矩形(0 斜边)跳过 */
  function shouldAxisAlign(pts) {
    const n = pts.length;
    if (n === 3) return false;                    // 三角形保留
    if (n >= 20 && n <= 30) return false;         // 24 段圆形保留
    if (n < 4) return false;
    let slanted = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      const ang = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
      if (ang > 4 && ang < 86) slanted++;          // 4° < 偏角 < 86° → 明显斜边
    }
    if (!slanted) return false;
    /* 4 顶点如果全是 0°/90° 就不算（即用户画的矩形）；只有 ≥5 顶点且有斜边才提示 */
    if (n === 4 && slanted <= 1) return false;
    return true;
  }

  /* 把一条斜线段拉直：根据主方向（水平 / 垂直）把另一端投影回轴 */
  function axisAlignPts(pts) {
    if (!pts || pts.length < 3) return pts;
    /* 先算全局参考格：遍历所有边的 dx/dy，取"最常见的水平步长"和"最常见的垂直步长"
       这是最朴素的办法 —— 找出现次数最多的 dx 和 dy 绝对值 */
    const dxs = [], dys = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      dxs.push(Math.abs(b[0] - a[0]));
      dys.push(Math.abs(b[1] - a[1]));
    }
    dxs.sort((a, b) => a - b); dys.sort((a, b) => a - b);
    const refDx = dxs[Math.floor(dxs.length * 0.3)] || 10;   // 下 30% 分位当参考格
    const refDy = dys[Math.floor(dys.length * 0.3)] || 10;

    /* 第一步：先把所有顶点"吸到网格"（对齐到 refDx / refDy 的整数倍）
       但要保留房间整体质心 —— 先算质心平移到原点，吸格后再平移回来 */
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const snapped = pts.map(([x, y]) => [
      Math.round((x - cx) / refDx) * refDx + cx,
      Math.round((y - cy) / refDy) * refDy + cy
    ]);
    /* 第二步：把每个斜边投影回轴（主方向上的分量保留，次方向归零）
       但如果相邻两条斜边都是朝同一方向斜的（比如 L 形房间的对角线误判），别强行投影 */
    const out = snapped.slice();
    const n = out.length;
    for (let i = 0; i < n; i++) {
      const a = out[i], b = out[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      if (Math.abs(dx) < 0.3 || Math.abs(dy) < 0.3) continue;  // 本来就有一条是 0，已经对齐
      const mainIsX = Math.abs(dx) >= Math.abs(dy);
      if (mainIsX) out[(i + 1) % n][1] = a[1];  // 保留水平，归零垂直
      else         out[(i + 1) % n][0] = a[0];  // 保留垂直，归零水平
    }
    /* 去重（可能出现相邻顶点完全重合） */
    const dedup = [];
    for (const p of out) {
      const last = dedup[dedup.length - 1];
      if (!last || Math.abs(last[0] - p[0]) > 0.3 || Math.abs(last[1] - p[1]) > 0.3) dedup.push(p);
    }
    return dedup.length >= 3 ? dedup : out;
  }

  function askAxisAlign(pts, onDone) {
    const dlg = el('div', 'lh-ed-dialog');
    dlg.innerHTML =
      '<div class="lh-ed-dialog-title">检测到斜边</div>' +
      '<div class="lh-ed-dialog-body">新画的房间不是完全横平竖直的。' +
      '<div style="margin:8px 0 14px;color:#8e97a5;font-size:12px;">' +
      '「全部拉直」会把所有斜边投影回水平/垂直（最常用的选择）；' +
      '「跳过」保留你的手绘原样（例如想做梯形房 / 六边形房）。</div></div>' +
      '<div class="lh-ed-dialog-actions">' +
      '<button class="lh-ed-btn primary" data-act="axis">全部拉直</button>' +
      '<button class="lh-ed-btn" data-act="keep">跳过</button>' +
      '</div>';
    document.body.appendChild(dlg);
    $$('button', dlg).forEach((b) => b.addEventListener('click', () => {
      const act = b.dataset.act;
      dlg.remove();
      if (act === 'axis') onDone(axisAlignPts(pts));
      else onDone(null);
    }));
  }

  function askRoomName(room) {
    const dlg = el('div', 'lh-ed-dialog');
    const nextName = genRoomName(window.LH.rooms);
    dlg.innerHTML =
      '<div class="lh-ed-dialog-title">给房间起个名</div>' +
      '<div class="lh-ed-dialog-body"><input id="lhRoomNameInput" value="' + nextName + '" ' +
      'style="width:100%;padding:8px 10px;margin-top:10px;border:1px solid #d9dce2;border-radius:6px;' +
      'font-size:13px;outline:none;" placeholder="如：主卧 / 厨房 / 书房"></div>' +
      '<div class="lh-ed-dialog-actions">' +
      '<button class="lh-ed-btn primary" data-act="ok">确定</button>' +
      '<button class="lh-ed-btn" data-act="skip">以后再说</button>' +
      '</div>';
    document.body.appendChild(dlg);
    const input = $('#lhRoomNameInput', dlg);
    setTimeout(() => { input.focus(); input.select(); }, 30);
    const commit = () => {
      const v = (input.value || '').trim();
      if (v) { room.name = v; markDirty(); rerenderEditorTab(); document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER')); }
      dlg.remove();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') dlg.remove(); });
    $$('button', dlg).forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.act === 'ok') commit(); else dlg.remove();
    }));
  }

  function genRoomName(rooms) {
    const base = ['房间', '卧室', '客厅', '厨房', '书房', '卫生间', '阳台', '衣帽间', '玄关', '餐厅'];
    const used = new Set((rooms || []).map((r) => r.name));
    for (const n of base) { if (!used.has(n)) return n; }
    let i = 1; while (used.has('房间' + i)) i++; return '房间' + i;
  }

  /* ── 房间重叠：检测 + 让用户选择处理方式 ─────────────── */
  function ptsOf(p) {
    if (!p) return [];
    const s = typeof p === 'string' ? p
      : (Array.isArray(p) ? p.map((q) => q.join(',')).join(' ') : '');
    return s.split(' ').map((t) => t.split(',').map(Number))
      .filter((q) => isFinite(q[0]) && isFinite(q[1]));
  }
  function polyBBox(pts) {
    const a = [1e9, 1e9, -1e9, -1e9];
    pts.forEach(([x, y]) => {
      if (x < a[0]) a[0] = x; if (y < a[1]) a[1] = y;
      if (x > a[2]) a[2] = x; if (y > a[3]) a[3] = y;
    });
    return a;
  }
  function signedArea(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  }
  function isConvex(pts) {
    let sign = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cr) < 1e-9) continue;
      const s = cr > 0 ? 1 : -1;
      if (sign && s !== sign) return false;
      sign = s;
    }
    return true;
  }
  /* Sutherland–Hodgman：两个凸多边形求交（返回交集多边形） */
  function clipConvex(subject, clip) {
    let cl = clip.slice();
    if (signedArea(cl) < 0) cl.reverse();
    let out = subject.slice();
    for (let i = 0; i < cl.length && out.length; i++) {
      const A = cl[i], B = cl[(i + 1) % cl.length];
      const d = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
      const inp = out; out = [];
      for (let j = 0; j < inp.length; j++) {
        const P = inp[j], Q = inp[(j + 1) % inp.length];
        const dp = d(P), dq = d(Q);
        if (dp >= 0) out.push(P);
        if ((dp >= 0) !== (dq >= 0)) {
          const t = dp / (dp - dq);
          out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
        }
      }
    }
    return out;
  }
  function pointInPoly(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (((a[1] > pt[1]) !== (b[1] > pt[1]))
          && (pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0])) c = !c;
    }
    return c;
  }
  function overlapArea(a, b) {
    if (!isConvex(a) || !isConvex(b)) {
      /* 异形房间：只要有一方的顶点落进对方内部就算真的重叠（贴边不算） */
      return (a.some((p) => pointInPoly(p, b)) || b.some((p) => pointInPoly(p, a))) ? 999 : 0;
    }
    return Math.abs(signedArea(clipConvex(a, b)));
  }
  /* 找出和新房间重叠面积最大的已有房间（>12 平方单位才算重叠） */
  function findOverlapRoom(room) {
    const a = ptsOf(room.pts);
    let best = null, bestA = 12;
    (window.LH.rooms || []).forEach((r) => {
      if (!r.pts || r.id === room.id) return;
      const ar = overlapArea(a, ptsOf(r.pts));
      if (ar > bestA) { bestA = ar; best = r; }
    });
    return best;
  }

  function askRoomOverlap(room, other) {
    const dlg = el('div', 'lh-ed-dialog open');
    dlg.innerHTML =
      '<div class="lh-ed-dialog-mask"></div>' +
      '<div class="lh-ed-dialog-body">' +
        '<div class="lh-ed-dialog-head"><b>房间重叠了</b>' +
          '<button class="lh-ed-dialog-close" type="button">×</button></div>' +
        '<div class="lh-ed-dialog-form">' +
          `<p class="hint">新画的房间和「${other.name}」有重叠，要怎么处理？</p>` +
          '<div class="lh-ed-overlap-actions">' +
            '<button class="lh-ed-btn primary" data-act="merge" type="button">合并为一个房间</button>' +
            '<button class="lh-ed-btn" data-act="trim" type="button">删掉重叠部分</button>' +
            '<button class="lh-ed-btn" data-act="split" type="button">自动分开、贴近摆放</button>' +
            '<button class="lh-ed-btn" data-act="keep" type="button">保持原样（重叠）</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dlg);
    const close = () => dlg.remove();
    $('.lh-ed-dialog-mask', dlg).onclick = close;
    $('.lh-ed-dialog-close', dlg).onclick = close;
    $$('[data-act]', dlg).forEach((b) => {
      b.onclick = () => { close(); applyOverlapAction(b.dataset.act, room, other); };
    });
  }

  function applyOverlapAction(act, room, other) {
    const plan = window.LH.plan || { w: 620, h: 692 };
    const aPts = ptsOf(room.pts);
    const bPts = ptsOf(other.pts);
    const A = polyBBox(aPts), B = polyBBox(bPts);

    let roomToName = null;   // 处理完后需要弹命名的房间（新画的那个）

    if (act === 'merge') {
      let merged = window.LHGeo.unionPolys([aPts, bPts], 0);
      if (!merged) merged = window.LHGeo.convexHull(aPts.concat(bPts)) || aPts;
      other.pts = merged.map((p) => p.join(',')).join(' ');
      const c = polyBBox(merged);
      other.lx = Math.round(((c[0] + c[2]) / 2) * 10) / 10;
      other.ly = Math.round(((c[1] + c[3]) / 2) * 10) / 10;
      window.LH.rooms = window.LH.rooms.filter((r) => r.id !== room.id);
      selected = { type: 'room', id: other.id };
      toastHint('已合并为一个房间');
      // room 被删掉了，不需要弹命名；other 是旧房间，名字保留
    } else if (act === 'trim') {
      const ox = Math.min(A[2], B[2]) - Math.max(A[0], B[0]);
      const oy = Math.min(A[3], B[3]) - Math.max(A[1], B[1]);
      const cxA = (A[0] + A[2]) / 2, cxB = (B[0] + B[2]) / 2;
      const cyA = (A[1] + A[3]) / 2, cyB = (B[1] + B[3]) / 2;
      const cut = ox <= oy
        ? aPts.map(([x, y]) => [cxA < cxB ? Math.min(x, B[0] - 1) : Math.max(x, B[2] + 1), y])
        : aPts.map(([x, y]) => [x, cyA < cyB ? Math.min(y, B[1] - 1) : Math.max(y, B[3] + 1)]);
      const uniq = [];
      cut.forEach((p) => {
        if (!uniq.some((q) => Math.abs(q[0] - p[0]) < 0.5 && Math.abs(q[1] - p[1]) < 0.5)) uniq.push(p);
      });
      if (uniq.length < 3 || Math.abs(signedArea(uniq)) < 40) {
        window.LH.rooms = window.LH.rooms.filter((r) => r.id !== room.id);
        selected = { type: 'room', id: other.id };
        toastHint('重叠太大，已取消新画的房间');
      } else {
        room.pts = uniq.map((p) => p.join(',')).join(' ');
        const nb = polyBBox(uniq);
        room.lx = Math.round(((nb[0] + nb[2]) / 2) * 10) / 10;
        room.ly = Math.round(((nb[1] + nb[3]) / 2) * 10) / 10;
        selected = { type: 'room', id: room.id };
        toastHint('已删掉重叠部分');
        roomToName = room;
      }
    } else if (act === 'split') {
      const ox = Math.min(A[2], B[2]) - Math.max(A[0], B[0]);
      const oy = Math.min(A[3], B[3]) - Math.max(A[1], B[1]);
      let dx = 0, dy = 0;
      if (ox <= oy) dx = ((A[0] + A[2]) < (B[0] + B[2]) ? -(ox + 2) : (ox + 2));
      else dy = ((A[1] + A[3]) < (B[1] + B[3]) ? -(oy + 2) : (oy + 2));
      dx = Math.max(Math.min(dx, plan.w - A[2]), -A[0]);
      dy = Math.max(Math.min(dy, plan.h - A[3]), -A[1]);
      room.pts = aPts.map(([x, y]) =>
        [Math.round((x + dx) * 10) / 10, Math.round((y + dy) * 10) / 10]
          .join(',')).join(' ');
      room.lx = Math.round(((room.lx || 0) + dx) * 10) / 10;
      room.ly = Math.round(((room.ly || 0) + dy) * 10) / 10;
      selected = { type: 'room', id: room.id };
      toastHint('已把新房间挪到「' + other.name + '」旁边');
      roomToName = room;
    } else {
      selected = { type: 'room', id: room.id };
      roomToName = room;
    }

    markDirty();
    rerenderEditorTab();
    document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));

    /* 新画的房间处理完了（还有效）→ 继续走 postCreate：轴对齐检测 + 弹命名 */
    if (roomToName) postCreateRoom(roomToName);
  }

  function finishNewRoom(svg) {
    const pts = editState.plan.newRoomPts;
    if (!pts || pts.length < 3) {
      /* 不在多边形模式时，「✓ 完成绘制」= 退出矩形/圆形绘制或放设备模式，
         否则用户画完房间后一直停在绘制模式里，没法拖动房间 */
      if (editState.plan.drawMode || editState.plan.placeDev) {
        cancelDrawMode(svg);
        toastHint('已退出绘制模式，现在可以拖动房间了');
        return;
      }
      toastHint('至少需要 3 个顶点');
      return;
    }
    const p = $('#lhNewRoomPreview', svg);
    if (p) p.remove();
    editState.plan.newRoomPts = null;
    const fin = $('#lhEdPlanFinish', editorRoot);
    if (fin) fin.style.display = 'none';
    createRoomFromPts(pts);
  }

  /* 吸附：新画的顶点如果离某个已有房间顶点很近，就吸过去（房间更容易闭合） */
  function snapPt(x, y) {
    const TH = 14;
    for (const r of (window.LH.rooms || [])) {
      const pts = (typeof r.pts === 'string' ? r.pts.split(' ') : []).map((s) => s.split(',').map(Number));
      for (const p of pts) {
        if (Math.abs(p[0] - x) <= TH && Math.abs(p[1] - y) <= TH) return { x: p[0], y: p[1], snapped: true };
      }
    }
    return { x: x, y: y, snapped: false };
  }

  function buildPlanSvg() {
    const plan = window.LH.plan;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${plan.w} ${plan.h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('class', 'lh-ed-plan-svg');

    // 底图必须最先画（垫底），外轮廓和房间才盖在上面
    if (plan.photo) {
      const img = document.createElementNS(NS, 'image');
      img.setAttribute('href', plan.photo.src);
      img.setAttribute('x', plan.photo.x || 0);
      img.setAttribute('y', plan.photo.y || 0);
      img.setAttribute('width', plan.photo.w || plan.w);
      img.setAttribute('height', plan.photo.h || plan.h);
      img.setAttribute('preserveAspectRatio', 'none');
      img.setAttribute('class', 'lh-ed-plan-photo');
      svg.appendChild(img);
    }

    /* 绘制范围：画布边框（浅虚线），告诉用户坐标可用区域 */
    const bound = document.createElementNS(NS, 'rect');
    bound.setAttribute('x', 1.5);
    bound.setAttribute('y', 1.5);
    bound.setAttribute('width', plan.w - 3);
    bound.setAttribute('height', plan.h - 3);
    bound.setAttribute('rx', 18);
    bound.setAttribute('class', 'lh-ed-plan-bound');
    svg.appendChild(bound);

    /* 自动外轮廓：没有房间时画一个 plan.w/h 的默认占位框，
       不再 fallback 到模板写死的 plan.outline（那是原始户型坐标）*/
    const frameD = framePathString();
    const ring = document.createElementNS(NS, 'path');
    ring.setAttribute('class', 'lh-ed-plan-outline');
    if (frameD) {
      ring.setAttribute('d', frameD);
    } else if ((window.LH.rooms || []).length === 0) {
      ring.setAttribute('d', 'M0,0 L' + plan.w + ',0 L' + plan.w + ',' + plan.h + ' L0,' + plan.h + 'Z');
    }
    svg.appendChild(ring);

    /* 自动墙体：每间房描一圈（线宽两倍，内半边被房间色块盖住） */
    (window.LH.rooms || []).forEach((r) => {
      if (!r.pts) return;
      const w = document.createElementNS(NS, 'polygon');
      w.setAttribute('points', typeof r.pts === 'string' ? r.pts : r.pts.map((p) => p.join(',')).join(' '));
      w.setAttribute('class', 'lh-ed-plan-wall');
      w.setAttribute('stroke-width', (plan.wallW || 13) * 2);
      w.dataset.roomId = r.id;
      svg.appendChild(w);
    });

    // 房间多边形 + 名称标签（可拖动）+ 温湿度旁标
    (window.LH.rooms || []).forEach((r) => {
      const pts = typeof r.pts === 'string'
        ? r.pts.split(' ').map((s) => s.split(',').map(Number))
        : r.pts;
      const poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
      poly.setAttribute('class', 'lh-ed-plan-room');
      poly.dataset.roomId = r.id;
      poly.addEventListener('click', (e) => {
        if (poly._skipClick) { poly._skipClick = false; return; }
        selectRoom(r.id, e.ctrlKey || e.metaKey || e.shiftKey);
      });
      poly.addEventListener('dblclick', (e) => { e.stopPropagation(); openRoomEditor(r.id); });
      poly.addEventListener('mousedown', (e) => startDragRoomBody(e, r.id));
      svg.appendChild(poly);

      const states = haStates();
      const readout = [];
      if (r.temp && states && states[r.temp]) {
        const v = parseFloat(states[r.temp].state);
        if (Number.isFinite(v)) readout.push(v.toFixed(1) + '°C');
      }
      if (r.hum && states && states[r.hum]) {
        const v = parseFloat(states[r.hum].state);
        if (Number.isFinite(v)) readout.push(Math.round(v) + '%');
      }

      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'lh-ed-plan-label');
      g.dataset.roomId = r.id;
      g.setAttribute('transform', `translate(${r.lx} ${r.ly})`);
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('class', 'lh-ed-plan-room-name');
      txt.textContent = r.name;
      g.appendChild(txt);
      if (readout.length) {
        const sub = document.createElementNS(NS, 'text');
        sub.setAttribute('y', 15);
        sub.setAttribute('text-anchor', 'middle');
        sub.setAttribute('class', 'lh-ed-plan-room-readout');
        sub.textContent = readout.join(' · ');
        g.appendChild(sub);
      }
      g.addEventListener('click', (e) => { e.stopPropagation(); selectRoom(r.id, e.ctrlKey || e.metaKey || e.shiftKey); });
      g.addEventListener('dblclick', (e) => { e.stopPropagation(); openRoomEditor(r.id); });
      g.addEventListener('mousedown', (e) => startDragRoomLabel(e, r.id));
      svg.appendChild(g);
    });
    // 设备图标
    (window.LH.devices || []).filter((d) => d.x != null && d.y != null).forEach((d) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'lh-ed-plan-dev');
      g.setAttribute('transform', `translate(${d.x} ${d.y})`);
      g.dataset.devId = d.id;
      g.innerHTML = `<circle r="10" class="dot"></circle><text y="24" text-anchor="middle">${d.name}</text>`;
      g.addEventListener('mousedown', (e) => startDragDevice(e, d));
      g.addEventListener('click', (e) => { e.stopPropagation(); selectDevice(d.id, e.ctrlKey || e.metaKey || e.shiftKey); });
      svg.appendChild(g);
    });

    return svg;
  }

  /* 自动外轮廓路径：复用 lovehome.js 的几何工具（LHGeo），保证和主界面完全一致。
     轮廓是「房间并集外扩 18」后提取的贴合墙体的曲线，L 形/凹口都会跟着折弯。 */
  function framePathString() {
    const geo = window.LHGeo;
    if (!geo) return '';
    const loops = geo.autoOutlineLoops(18);
    return (loops && loops.length) ? loops.map(geo.loopPath).join(' ') : '';
  }

  /* 拖动房间时外轮廓要跟着变；重算比较重，拖动过程中限流到 ~9fps */
  let frameStamp = 0;
  function refreshPlanFrame(svg) {
    const now = Date.now();
    if (now - frameStamp < 110) return;
    frameStamp = now;
    const f = svg.querySelector('.lh-ed-plan-outline');
    const d = framePathString();
    if (f && d) f.setAttribute('d', d);
  }

  /* 房间整体拖动：按住房间内部拖动 → 多边形 + 名称标签 + 房里的设备一起平移 */
  function startDragRoomBody(e, roomId) {
    if (e.button !== 0) return;
    /* 绘制 / 放设备模式下不拖房间，让画布自己处理 */
    if (editState.plan.drawMode || editState.plan.newRoomPts != null || editState.plan.placeDev) return;
    const poly = e.currentTarget;
    const svg = poly.ownerSVGElement;
    const r = window.LH.rooms.find((x) => x.id === roomId);
    if (!r || !r.pts) return;
    e.preventDefault();
    e.stopPropagation();

    selectRoom(roomId, e.ctrlKey || e.metaKey || e.shiftKey);
    const p0 = svgPoint(svg, e);
    const pts0 = (typeof r.pts === 'string' ? r.pts : r.pts.map((p) => p.join(',')).join(' '))
      .split(' ').map((s) => s.split(',').map(Number));
    const lx0 = Number(r.lx) || 0;
    const ly0 = Number(r.ly) || 0;
    const devs = (window.LH.devices || [])
      .filter((d) => d.room === roomId && d.x != null && d.y != null)
      .map((d) => ({ d, x: d.x, y: d.y }));
    const wall = svg.querySelector(`.lh-ed-plan-wall[data-room-id="${roomId}"]`);
    const label = svg.querySelector(`.lh-ed-plan-label[data-room-id="${roomId}"]`);
    const devGs = devs.map(({ d }) => svg.querySelector(`.lh-ed-plan-dev[data-dev-id="${d.id}"]`));
    let moved = false;

    function move(ev) {
      const p = svgPoint(svg, ev);
      const dx = Math.round((p.x - p0.x) * 10) / 10;
      const dy = Math.round((p.y - p0.y) * 10) / 10;
      if (!dx && !dy) return;
      moved = true;
      const pts = pts0.map(([x, y]) =>
        [Math.round((x + dx) * 10) / 10, Math.round((y + dy) * 10) / 10]);
      r.pts = pts.map((q) => q.join(',')).join(' ');
      r.lx = Math.round((lx0 + dx) * 10) / 10;
      r.ly = Math.round((ly0 + dy) * 10) / 10;
      poly.setAttribute('points', r.pts);
      if (wall) wall.setAttribute('points', r.pts);
      if (label) label.setAttribute('transform', `translate(${r.lx} ${r.ly})`);
      devs.forEach((it, i) => {
        it.d.x = Math.round((it.x + dx) * 10) / 10;
        it.d.y = Math.round((it.y + dy) * 10) / 10;
        if (devGs[i]) devGs[i].setAttribute('transform', `translate(${it.d.x} ${it.d.y})`);
      });
      /* 绘制模式下别重算外轮廓：newRoomPts / drawStart 还没进 LH.rooms，
         重算出来的 outline 会比房间实际轮廓大或错位 */
      if (!editState.plan.drawMode && !editState.plan.newRoomPts && !editState.plan.drawStart) {
        refreshPlanFrame(svg);
      }
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (!moved) return;
      poly._skipClick = true;
      markDirty();
      rerenderEditorTab();
      document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  /* 房间名标签拖动：松手后把 lx/ly 存回房间 */
  function startDragRoomLabel(e, roomId) {
    e.preventDefault();
    const svg = e.currentTarget.ownerSVGElement;
    const r = window.LH.rooms.find((x) => x.id === roomId);
    if (!r) return;
    const p0 = svgPoint(svg, e);
    const ox = p0.x - (Number(r.lx) || 0);
    const oy = p0.y - (Number(r.ly) || 0);
    const g = svg.querySelector(`.lh-ed-plan-label[data-room-id="${roomId}"]`);
    function move(ev) {
      const p = svgPoint(svg, ev);
      r.lx = Math.round((p.x - ox) * 10) / 10;
      r.ly = Math.round((p.y - oy) * 10) / 10;
      if (g) g.setAttribute('transform', `translate(${r.lx} ${r.ly})`);
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      markDirty();
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  let selected = { type: null, id: null };

  /* 户型图上选中一项；additive=true 表示按住 Ctrl/Shift 追加或取消 */
  function pickPlanItem(type, id, additive) {
    const key = (type === 'room' ? 'r:' : 'd:') + id;
    if (additive) {
      if (planMulti.has(key)) planMulti.delete(key);
      else planMulti.add(key);
    } else {
      planMulti.clear();
      planMulti.add(key);
    }
    if (!planMulti.size) {
      selected = { type: null, id: null };
    } else if (planMulti.has(key)) {
      selected = { type, id };
    } else if (selected.id === id && selected.type === type) {
      // 取消的正好是当前主选中项 → 换成集合里剩下的最后一个
      const k = Array.from(planMulti).slice(-1)[0];
      selected = { type: k.charAt(0) === 'r' ? 'room' : 'device', id: k.slice(2) };
    }
    refreshPlanSelection();
    updatePlanInfo();
  }
  function selectRoom(id, additive) { pickPlanItem('room', id, additive); }
  function selectDevice(id, additive) { pickPlanItem('device', id, additive); }
  function refreshPlanSelection() {
    if (!editorRoot) return;
    $$('.lh-ed-plan-room, .lh-ed-plan-room-name, .lh-ed-plan-label', editorRoot).forEach((el) => {
      el.classList.toggle('sel', planMulti.has('r:' + el.dataset.roomId));
    });
    $$('.lh-ed-plan-dev', editorRoot).forEach((g) => {
      g.classList.toggle('sel', planMulti.has('d:' + g.dataset.devId));
    });
  }
  function updatePlanInfo() {
    const info = $('#lhEdPlanInfo', editorRoot);
    if (!info) return;
    // 多选状态
    if (planMulti.size > 1) {
      const nRoom = Array.from(planMulti).filter((k) => k.charAt(0) === 'r').length;
      const nDev = planMulti.size - nRoom;
      info.innerHTML = `<b>已选中 ${planMulti.size} 项</b>（房间 ${nRoom} · 设备 ${nDev}）` +
        '<button class="lh-ed-btn danger" id="btnDelMulti" type="button">删除选中</button>' +
        '<button class="lh-ed-btn" id="btnClearMulti" type="button">取消选择</button>';
      $('#btnDelMulti', info).addEventListener('click', deletePlanSelection);
      $('#btnClearMulti', info).addEventListener('click', () => {
        planMulti.clear();
        selected = { type: null, id: null };
        refreshPlanSelection();
        updatePlanInfo();
      });
      return;
    }
    if (selected.type === 'room') {
      const r = window.LH.rooms.find((x) => x.id === selected.id);
      info.innerHTML = `<b>房间 · ${r.name}</b>（${r.id}）<br>
        坐标：lx ${r.lx}, ly ${r.ly}<br>
        点数：${typeof r.pts === 'string' ? r.pts.split(' ').length : r.pts.length}<br>
        <button class="lh-ed-btn" id="btnEditRoom">编辑顶点</button>
        <button class="lh-ed-btn danger" id="btnDelRoom">删除此房间</button>`;
      $('#btnDelRoom', info).addEventListener('click', () => deleteRoom(r.id));
      $('#btnEditRoom', info).addEventListener('click', () => enterPolyEdit(r.id));
    } else if (selected.type === 'device') {
      const d = window.LH.devices.find((x) => x.id === selected.id);
      info.innerHTML = `<b>设备 · ${d.name}</b>（${d.id}）<br>
        实体：${d.entity || '—'}<br>
        kind：${d.kind || '—'}<br>
        位置：x ${d.x}, y ${d.y}<br>
        房间：${d.room || '—'}<br>
        <button class="lh-ed-btn danger" id="btnDelDev">删除此设备</button>`;
      $('#btnDelDev', info).addEventListener('click', () => deleteDevice(d.id));
    } else {
      info.textContent = '未选中：点击房间或设备图标来选择。拖动设备图标可移动位置。';
    }
  }

  /* ── 设备拖动 ─────────────────────────────────────── */
  function startDragDevice(e, d) {
    // 画房间/放设备模式下不拖设备
    if (editState.plan.placeDev || editState.plan.drawMode) return;
    e.preventDefault();
    const g = e.currentTarget;
    const svgEl = g.ownerSVGElement;
    if (!svgEl) return;
    const p0 = svgPoint(svgEl, e);
    const drag = {
      id: d.id,
      svg: svgEl,
      offsetX: p0.x - d.x,
      offsetY: p0.y - d.y
    };
    editState.plan.dragDevice = drag;
    g.classList.add('dragging');
    // 拖动过程挂在 document 上：鼠标拖出画布也不会丢
    const move = (ev) => moveDragDevice(ev, drag);
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      editState.plan.dragDevice = null;
      g.classList.remove('dragging');
      markDirty();
      document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function moveDragDevice(e, drag) {
    const svg = drag.svg;
    if (!svg) return;
    const p = svgPoint(svg, e);
    const x = p.x - drag.offsetX;
    const y = p.y - drag.offsetY;
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const d = window.LH.devices.find((v) => v.id === drag.id);
    if (!d) return;
    d.x = Math.round(Math.min(Math.max(x, 0), vb[2]) * 10) / 10;
    d.y = Math.round(Math.min(Math.max(y, 0), vb[3]) * 10) / 10;
    const g = svg.querySelector(`[data-dev-id="${drag.id}"]`);
    if (g) g.setAttribute('transform', `translate(${d.x} ${d.y})`);
  }

  /* ── 房间编辑：多边形顶点 ──────────────────────────── */
  function enterPolyEdit(roomId) {
    toastHint('顶点编辑中：拖动圆点调整位置。点空白处取消。');
    selected.polyEdit = true;
    // 在 SVG 上叠加点
    const svg = $('.lh-ed-plan-svg', editorRoot);
    const r = window.LH.rooms.find((x) => x.id === roomId);
    const pts = typeof r.pts === 'string'
      ? r.pts.split(' ').map((s) => s.split(',').map(Number))
      : r.pts;
    pts.forEach((p, i) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', p[0]);
      c.setAttribute('cy', p[1]);
      c.setAttribute('r', 5);
      c.setAttribute('class', 'lh-ed-plan-vertex');
      c.dataset.roomId = roomId;
      c.dataset.idx = i;
      c.addEventListener('mousedown', startDragVertex);
      svg.appendChild(c);
    });
  }

  function startDragVertex(e) {
    e.preventDefault();
    const c = e.currentTarget;
    const roomId = c.dataset.roomId;
    const idx = Number(c.dataset.idx);
    const svg = c.ownerSVGElement;
    const wall = svg.querySelector(`.lh-ed-plan-wall[data-room-id="${roomId}"]`);

    function move(ev) {
      const p = svgPoint(svg, ev);
      c.setAttribute('cx', p.x);
      c.setAttribute('cy', p.y);
      // 更新房间数据
      const r = window.LH.rooms.find((x) => x.id === roomId);
      const pts = typeof r.pts === 'string'
        ? r.pts.split(' ').map((s) => s.split(',').map(Number))
        : r.pts.slice();
      pts[idx] = [p.x, p.y];
      r.pts = pts;
      // 重绘 polygon（墙体同步）
      const poly = svg.querySelector(`.lh-ed-plan-room[data-room-id="${roomId}"]`);
      const str = pts.map((q) => q.join(',')).join(' ');
      if (poly) poly.setAttribute('points', str);
      if (wall) wall.setAttribute('points', str);
      refreshPlanFrame(svg);
    }
    function up() {
      markDirty();
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  /* ── 删除操作 ──────────────────────────────────────── */
  /* 批量删除户型图上选中的房间/设备 */
  function deletePlanSelection() {
    if (!planMulti.size) { toastHint('先选中要删除的项目'); return; }
    const roomIds = Array.from(planMulti).filter((k) => k.charAt(0) === 'r').map((k) => k.slice(2));
    const devIds = Array.from(planMulti).filter((k) => k.charAt(0) === 'd').map((k) => k.slice(2));
    const msg = '确定删除选中的 ' + planMulti.size + ' 项？' +
      (roomIds.length ? '\n其中 ' + roomIds.length + ' 个房间，房间内设备会变成无房间归属。' : '');
    if (!confirm(msg)) return;
    if (devIds.length) window.LH.devices = window.LH.devices.filter((d) => devIds.indexOf(d.id) < 0);
    if (roomIds.length) {
      window.LH.rooms = window.LH.rooms.filter((r) => roomIds.indexOf(r.id) < 0);
      (window.LH.devices || []).forEach((d) => { if (roomIds.indexOf(d.room) >= 0) d.room = ''; });
    }
    planMulti.clear();
    selected = { type: null, id: null };
    markDirty();
    rerenderEditorTab();
    document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
  }

  function deleteRoom(id) {
    if (!confirm(`确定删除房间 "${id}"？里面的设备也会变成无房间归属。`)) return;
    window.LH.rooms = window.LH.rooms.filter((r) => r.id !== id);
    markDirty();
    rerenderEditorTab();
    document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
  }
  function deleteDevice(id) {
    if (!confirm(`确定删除设备 "${id}"？`)) return;
    window.LH.devices = window.LH.devices.filter((d) => d.id !== id);
    markDirty();
    rerenderEditorTab();
    document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
  }

  /* 刷新当前 editor tab（户型图需要完全重绘） */
  function rerenderEditorTab() {
    switchTab(editState.tab);
  }

  /* ══════════════════════════════════════════════════════
   * HA 实体自动补全选择器
   * 从 hass().states 拉取实体，按 domain 分组，可搜索可过滤
   * 用法: createEntityPicker(inputEl, { domains: ['sensor','binary_sensor'], value: 'xxx' })
   * ══════════════════════════════════════════════════════ */
  function haStates() {
    if (haStates._cached) return haStates._cached;
    try {
      const h = window.parent && window.parent.document
        ? window.parent.document.querySelector('home-assistant')
        : null;
      if (h && h.hass && h.hass.states) {
        haStates._cached = h.hass.states;
        return haStates._cached;
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  // 每 10 秒清一次缓存（HA 可能重新连接）
  setInterval(() => { haStates._cached = null; }, 10000);

  function createEntityPicker(inputEl, opts) {
    opts = opts || {};
    const wrapper = el('div', 'lh-ent-picker');
    wrapper.innerHTML = `
      <input class="lh-ent-search" placeholder="${opts.placeholder || '搜索或选择实体...'}" autocomplete="off">
      <input type="hidden" class="lh-ent-value">
      <div class="lh-ent-status" hidden></div>`;
    const searchInp = wrapper.querySelector('.lh-ent-search');
    const hiddenInp = wrapper.querySelector('.lh-ent-value');
    const statusEl = wrapper.querySelector('.lh-ent-status');

    // 每个 picker 自己的 dropdown（不再全局共享，避免多个 picker 互相覆盖）
    const dropdown = el('div', 'lh-ent-dropdown');
    dropdown.hidden = true;
    document.body.appendChild(dropdown);

    // 替换原始 input 的位置
    inputEl.parentNode.insertBefore(wrapper, inputEl);
    inputEl.style.display = 'none';

    // 初始化值
    searchInp.value = inputEl.value || opts.value || '';
    hiddenInp.value = inputEl.value || opts.value || '';

    let allEntities = null;   // { recommended: [...], others: [...] }
    let searchTimer = null;
    let pickerOpen = false;

    // 动态定位 dropdown（position: fixed 方式）
    function positionDropdown() {
      const r = searchInp.getBoundingClientRect();
      dropdown.style.left = r.left + 'px';
      dropdown.style.top = (r.bottom + 4) + 'px';
      dropdown.style.width = Math.max(r.width, 320) + 'px';
      dropdown.style.maxHeight = '320px';
      dropdown.style.overflowY = 'auto';
      // 空间不足时翻到上面
      const spaceBelow = window.innerHeight - r.bottom - 8;
      if (spaceBelow < 120 && r.top > 120) {
        dropdown.style.top = Math.max(8, r.top - dropdown.offsetHeight - 4) + 'px';
      }
    }

    /* 读取 HA 全部真实实体（原始列表只缓存一次） */
    function loadEntities() {
      const states = haStates();
      if (!states) return null;
      const list = [];
      for (const eid of Object.keys(states)) {
        const s = states[eid];
        list.push({
          entity_id: eid,
          state: s.state,
          name: (s.attributes && s.attributes.friendly_name) || eid,
          domain: eid.split('.')[0]
        });
      }
      // 排序：推荐类型先，其他类型按 friendly_name 排序
      const rec = opts.domains || [];
      list.sort((a, b) => {
        const ra = rec.includes(a.domain) ? 0 : 1;
        const rb = rec.includes(b.domain) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return (a.name || '').localeCompare(b.name || '');
      });
      return list;
    }

    /* 实体状态条 */
    function updateStatus() {
      const eid = hiddenInp.value;
      const states = haStates();
      if (!eid || !states) { statusEl.hidden = true; return; }
      const s = states[eid];
      statusEl.hidden = false;
      if (s) {
        const name = (s.attributes && s.attributes.friendly_name) || '';
        statusEl.className = 'lh-ent-status ok';
        statusEl.textContent = '✓ ' + eid + (name ? ' · ' + name : '') + ' · ' + s.state;
      } else {
        statusEl.className = 'lh-ent-status bad';
        statusEl.textContent = '⚠ 实体 ' + eid + ' 不存在';
      }
    }

    function itemHtml(e) {
      const stClass = e.state === 'on' ? 'on' : (e.state === 'unavailable' ? 'unavailable' : '');
      return `<div class="lh-ent-item" data-eid="${e.entity_id}">
        <span class="lh-ent-name">${e.name}</span>
        <code class="lh-ent-id">${e.entity_id}</code>
        <span class="lh-ent-state ${stClass}">${e.state}</span>
      </div>`;
    }

    function renderDropdown(filter) {
      filter = (filter || '').trim().toLowerCase();
      const raw = allEntities || (allEntities = loadEntities());
      if (!raw) {
        dropdown.hidden = true;
        return;
      }
      const rec = opts.domains || [];
      const match = (e) => !filter ||
        e.entity_id.toLowerCase().includes(filter) ||
        (e.name || '').toLowerCase().includes(filter) ||
        e.domain.toLowerCase().includes(filter);

      const recList = raw.filter((e) => rec.includes(e.domain) && match(e));
      const otherList = raw.filter((e) => !rec.includes(e.domain) && match(e));

      let html = '';
      let count = 0;
      if (recList.length) {
        html += `<div class="lh-ent-group-title">推荐 ${rec.join(' / ')}</div>`;
        for (const e of recList.slice(0, 80)) { html += itemHtml(e); count++; }
      }
      if (otherList.length) {
        html += `<div class="lh-ent-group-title">全部实体（${otherList.length}）</div>`;
        for (const e of otherList.slice(0, 200)) { html += itemHtml(e); count++; }
      }
      if (!count) {
        html = `<div class="lh-ent-empty">没有匹配的实体 · 改个关键词或清空搜索框</div>`;
      }
      dropdown.innerHTML = html;
      dropdown.hidden = false;
      pickerOpen = true;
      requestAnimationFrame(positionDropdown);

      dropdown.querySelectorAll('.lh-ent-item').forEach((it) => {
        it.addEventListener('mousedown', (ev) => {
          ev.preventDefault();        // 阻止 blur
          ev.stopPropagation();
          setValue(it.dataset.eid);
          dropdown.hidden = true;
          pickerOpen = false;
        });
      });
    }

    function setValue(eid) {
      searchInp.value = eid;
      hiddenInp.value = eid;
      inputEl.value = eid;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      updateStatus();
      if (opts.onChange) opts.onChange(eid);
    }

    // 事件：focus → 打开 / 更新
    searchInp.addEventListener('focus', () => {
      // 重新加载（如果之前 HA 还没连上）
      if (!allEntities) allEntities = loadEntities();
      renderDropdown(searchInp.value);
    });
    searchInp.addEventListener('click', () => {
      if (dropdown.hidden) renderDropdown(searchInp.value);
    });

    // 事件：输入 → 防抖过滤
    searchInp.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderDropdown(searchInp.value), 150);
    });

    // 事件：blur → 延迟关闭（等 mousedown 先触发）
    searchInp.addEventListener('blur', () => {
      setTimeout(() => {
        // 如果用户点击了 dropdown 里的项，mousedown 先触发 setValue → 这里 dropdown 已经隐藏
        // 如果用户点了别处，也应该关闭
        if (!dropdown.hidden) {
          dropdown.hidden = true;
          pickerOpen = false;
        }
        // 如果用户直接输入了值，也接受
        const v = searchInp.value.trim();
        if (v && v !== hiddenInp.value) setValue(v);
      }, 200);
    });

    // 事件：Esc 关闭
    searchInp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { dropdown.hidden = true; pickerOpen = false; searchInp.blur(); }
      if (e.key === 'Enter' && !dropdown.hidden) {
        // Enter 选第一项
        const first = dropdown.querySelector('.lh-ent-item');
        if (first) { setValue(first.dataset.eid); dropdown.hidden = true; pickerOpen = false; }
      }
    });

    // 点击外部关闭
    document.addEventListener('mousedown', (e) => {
      if (!pickerOpen || dropdown.hidden) return;
      if (dropdown.contains(e.target)) return;        // 点在 dropdown 里 → 不关
      if (wrapper.contains(e.target)) return;         // 点在 input 里 → 不关（click 事件自己处理）
      dropdown.hidden = true;
      pickerOpen = false;
    });

    // resize / scroll 时重定位
    window.addEventListener('resize', () => { if (!dropdown.hidden) positionDropdown(); });

    // 初始值校验
    updateStatus();

    return {
      wrapper, setValue, searchInp, updateStatus,
      destroy() { dropdown.remove(); pickerOpen = false; }
    };
  }

  /* ══════════════════════════════════════════════════════
   * Tab: 设备列表（devices）
   * ══════════════════════════════════════════════════════ */
  function buildDevicesTab() {
    const wrap = el('div', 'lh-ed-list-wrap');
    const existing = (window.LH.devices || []);
    const states = haStates();
    let missing = 0, total = 0;
    existing.forEach((d) => { if (d.entity) { total++; if (states && !states[d.entity]) missing++; } });
    const hasHA = !!states;
    const warn = (!hasHA) ? '<span class="hint" style="color:var(--amber-2)">⚠ 未连接到 HA，实体选择器不可用</span>'
                : (total > 0 && missing / total > 0.3)
                  ? '<span class="hint" style="color:var(--amber-2)">⚠ ' + missing + '/' + total + ' 台设备实体不存在，建议重新绑定</span>' : '';

    wrap.innerHTML = '<div class="lh-ed-list-head">' +
      '<b>设备列表</b><span class="hint">共 ' + existing.length + ' 台</span>' + warn +
      '<div class="lh-ed-list-actions">' +
        (hasHA ? '<button class="lh-ed-btn primary" id="lhEdBulkImport" type="button" title="从 HA 实际实体中勾选批量添加">🔍 从 HA 批量导入</button>' : '') +
        '<label class="lh-ed-selall"><input type="checkbox" id="lhEdSelAll">全选</label>' +
        '<button class="lh-ed-btn danger" id="lhEdDelSel" type="button" disabled>删除选中 (0)</button>' +
        '<button class="lh-ed-btn" id="lhEdDevAdd" type="button">+ 单台添加</button>' +
      '</div></div><div class="lh-ed-list" id="lhEdDevList"></div>';

    const list = $('#lhEdDevList', wrap);
    existing.forEach((d) => list.appendChild(buildDevRow(d)));

    if (hasHA) $('#lhEdBulkImport', wrap).addEventListener('click', openBulkImport);
    $('#lhEdDevAdd', wrap).addEventListener('click', () => openDeviceEditor(null));
    setupMultiSelect('devices', wrap.querySelector('.lh-ed-list-head'), list, deleteDevices);

    return wrap;
  }

  /* 列表多选：表头「全选」+ 每行 checkbox + 「删除选中」。tabKey 对应 multiSel 里的集合 */
  function setupMultiSelect(tabKey, head, listBox, delFn) {
    const sel = multiSel[tabKey];
    const ids = $$('.lh-ed-row', listBox).map((r) => r.dataset.id);
    /* 换 tab / 重绘后清掉已经不存在的 id */
    Array.from(sel).forEach((id) => { if (ids.indexOf(id) < 0) sel.delete(id); });

    const cbAll = head.querySelector('#lhEdSelAll');
    const btnDel = head.querySelector('#lhEdDelSel');
    const paint = () => {
      $$('.lh-ed-row', listBox).forEach((r) => {
        const on = sel.has(r.dataset.id);
        r.classList.toggle('sel', on);
        const cb = r.querySelector('.lh-ed-cb');
        if (cb) cb.checked = on;
      });
      if (cbAll) cbAll.checked = ids.length > 0 && sel.size === ids.length;
      if (btnDel) {
        btnDel.textContent = '删除选中 (' + sel.size + ')';
        btnDel.disabled = !sel.size;
      }
    };

    if (cbAll) cbAll.onchange = () => {
      if (cbAll.checked) ids.forEach((id) => sel.add(id)); else sel.clear();
      paint();
    };
    if (btnDel) btnDel.onclick = () => delFn(Array.from(sel));

    $$('.lh-ed-row', listBox).forEach((r) => {
      const cb = el('input');
      cb.type = 'checkbox';
      cb.className = 'lh-ed-cb';
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.onchange = () => {
        if (cb.checked) sel.add(r.dataset.id); else sel.delete(r.dataset.id);
        paint();
      };
      r.insertBefore(cb, r.firstChild);
    });

    paint();
  }

  function deleteDevices(ids) {
    if (!ids.length) return;
    if (!confirm('确定删除选中的 ' + ids.length + ' 台设备？')) return;
    window.LH.devices = (window.LH.devices || []).filter((d) => ids.indexOf(d.id) < 0);
    multiSel.devices.clear();
    markDirty(); rerenderEditorTab();
    document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
  }

  /* ══════════════════════════════════════════════════════
   * 批量从 HA 导入：按「物理设备」分组，一台设备下面所有实体一起显示
   * 用户可以勾整台设备（全部实体一起导入），也可以只勾某个实体
   * ══════════════════════════════════════════════════════ */
  async function openBulkImport() {
    const states = haStates();
    if (!states) { alert('未连接到 Home Assistant'); return; }
    const hass = haHass();  // ★ 用 editor 自己的函数，比内联写更健壮

    // 已经绑定过的主实体 → 标记为 already
    const existingEntities = new Set((window.LH.devices || []).map((d) => d.entity).filter(Boolean));

    // 只排除真正没用的系统 domain
    const SKIP_DOMAINS = new Set(['history_stats', 'input_boolean', 'input_select',
                                  'input_number', 'input_datetime', 'input_text',
                                  'script', 'scene', 'automation', 'group', 'person',
                                  'zone', 'sun', 'timer', 'counter', 'proximity',
                                  'update', 'calendar', 'schedule', 'todo',
                                  'shopping_list', 'image_processing', 'stt', 'tts',
                                  'assist_satellite', 'conversation', 'notify',
                                  'logbook', 'persistent_notification', 'recorder']);

    // ★ 优先从 HA WS API 拿完整的 entity_registry（有 device_id）和 device_registry
    //    WS 失败就只靠 states 退化，不影响界面显示
    let entityList = [], deviceList = [], wsOk = false;
    if (hass && typeof hass.callWS === 'function') {
      try {
        const [ents, devs] = await Promise.all([
          hass.callWS({ type: 'config/entity_registry/list' }),
          hass.callWS({ type: 'config/device_registry/list' })
        ]);
        entityList = ents || [];
        deviceList = devs || [];
        wsOk = true;
      } catch (e) { wsOk = false; /* 退化到 states */ }
    }

    const DEV_MAP = {};  // device_id -> device object
    deviceList.forEach((d) => { DEV_MAP[d.id] = d; });

    // ★ 收集所有实体：entity_registry 里有就算数（不管 states 有没有）
    //   HA 刚注册的实体 states 可能还没推送过来，但注册表一定有
    const entities = [];
    entityList.forEach((e) => {
      if (e.disabled_by || e.hidden_by) return;
      const domain = e.entity_id.split('.')[0];
      if (SKIP_DOMAINS.has(domain)) return;
      const s = states[e.entity_id];
      const fname = (e.name || (s && s.attributes && s.attributes.friendly_name)) || e.entity_id;
      entities.push({
        eid: e.entity_id, domain,
        name: fname,
        state: (s && s.state) || 'unknown',
        device_id: e.device_id || null,
        platform: e.platform || ''
      });
    });
    // 补充：entity_registry 里没有的（比如 MQTT 自动发现的某些）
    for (const eid of Object.keys(states)) {
      const domain = eid.split('.')[0];
      if (SKIP_DOMAINS.has(domain)) continue;
      if (entityList.some((x) => x.entity_id === eid)) continue;
      const s = states[eid];
      const fname = (s.attributes && s.attributes.friendly_name) || eid;
      entities.push({
        eid, domain, name: fname, state: s.state,
        device_id: null, platform: ''
      });
    }

    // 按 device 分组
    const DEV_KIND = {
      'xiaomi_home': '米家', 'xiaomi_miot': '米家',
      'midea': '美的', 'dehumidifier': '美的',
      'aqara': '绿米', 'zha': 'Zigbee', 'zigbee2mqtt': 'Zigbee',
      'mqtt': 'MQTT', 'tuya': '涂鸦', 'homekit': 'HomeKit',
      'esphome': 'ESPHome', 'google_cast': 'Chromecast',
      'yeelight': 'Yeelight', 'philips_android_tv': '飞利浦',
      'media_player': '影音', 'switch': '开关', 'light': '灯',
      'climate': '空调', 'cover': '窗帘', 'fan': '风扇',
      'lock': '门锁', 'camera': '摄像头', 'water_heater': '热水器',
      'humidifier': '加湿器', 'vacuum': '扫地机', 'siren': '警报',
      'select': '选项', 'number': '数值', 'button': '按钮',
      'sensor': '传感器', 'binary_sensor': '状态传感器', 'remote': '遥控',
      'valve': '水阀', 'device_tracker': '定位', 'lawn_mower': '割草机'
    };

    // ★ 把实体按 device 聚合（有 device_id 就算一组，不管 device_registry 能不能查到）
    const deviceGroups = {};  // key=device_id
    const noDev = [];  // 没有 device_id 的散实体（MQTT 自动发现等）
    entities.forEach((e) => {
      if (e.device_id) {
        const dv = DEV_MAP[e.device_id];
        const key = e.device_id;
        if (!deviceGroups[key]) {
          const name = dv
            ? (dv.name_by_user || dv.name || e.name.split(' ')[0] || '未知设备')
            : (e.name.split(' ')[0] || '未知设备');
          const platform = dv
            ? (dv.manufacturer || dv.model || e.platform || '')
            : (e.platform || '');
          deviceGroups[key] = {
            key, name, platform, model: dv ? (dv.model || '') : '',
            ents: [],
            eids: [],      // ★ 存所有 entity_id 数组，bulkDo 直接用
            mainEntEid: '',  // 主实体 eid（MAIN_ENTITY_PRIORITY 选出来的）
            mainEntKind: '',
            domains: new Set(),
            alreadyEids: new Set()
          };
        }
        deviceGroups[key].ents.push(e);
        deviceGroups[key].eids.push(e.eid);
        deviceGroups[key].domains.add(e.domain);
        if (existingEntities.has(e.eid)) deviceGroups[key].alreadyEids.add(e.eid);
      } else {
        noDev.push(e);
      }
    });

    // ★ 选每台设备的「主实体」—— bulkDo 时作为面板 d.entity 存储
    const MAIN_ENTITY_PRIORITY = ['climate', 'light', 'media_player', 'lock', 'camera',
                                   'cover', 'fan', 'switch', 'water_heater', 'vacuum',
                                   'humidifier', 'siren', 'remote', 'valve', 'select',
                                   'button', 'number', 'sensor', 'binary_sensor'];
    Object.values(deviceGroups).forEach((dev) => {
      for (const dom of MAIN_ENTITY_PRIORITY) {
        const hit = dev.ents.find((e) => e.domain === dom);
        if (hit) { dev.mainEntEid = hit.eid; dev.mainEntKind = DOMAIN_KIND[hit.domain] || 'appliance'; return; }
      }
      // 退化：第一个实体
      dev.mainEntEid = dev.ents[0].eid;
      dev.mainEntKind = DOMAIN_KIND[dev.ents[0].domain] || 'appliance';
    });

    // 按实体数排序：多实体设备放前面
    const devArr = Object.values(deviceGroups).sort((a, b) => b.ents.length - a.ents.length);

    // ★ 诊断信息——让用户一眼看到数据状态
    const diagWs = wsOk ? '✅ WS' : '⚠ 仅 states（有些设备可能读不全）';
    const diagLine = `📡 数据来源：${diagWs} · 注册表 ${entityList.length} 实体 / ${deviceList.length} 台设备 · 共识别 <b>${devArr.length}</b> 台设备 · <b>${noDev.length}</b> 个散实体 · 已有 <b style="color:var(--amber-2)">${existingEntities.size}</b> 实体在面板中`;

    // 构建弹窗 HTML —— ★ 简化版：只有设备级 checkbox + 展开看实体详情
    const dlg = el('div', 'lh-ed-dialog bulk-import');
    let html = `<div class="lh-ed-dialog-mask"></div>
      <div class="lh-ed-dialog-body" style="max-width:860px;max-height:85vh;display:flex;flex-direction:column">
        <div class="lh-ed-dialog-head"><b>🔍 从 Home Assistant 批量导入</b>
          <button class="lh-ed-dialog-close" type="button">×</button></div>
        <div style="padding:6px 16px;color:var(--s3);font-size:12px;border-bottom:1px solid var(--bd2);background:var(--bg2,#f7f9fc)">
          ${diagLine}
        </div>
        <div style="padding:6px 12px;border-bottom:1px solid var(--bd2);display:flex;gap:12px;font-size:12px">
          <input type="text" id="bulkSearch" placeholder="🔎 搜索设备名 / domain..." style="flex:1;padding:4px 8px;border-radius:4px;border:1px solid var(--bd2);background:var(--bg2, #f7f9fc);color:inherit">
          <label style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="bulkHideAlready"> 隐藏已全部接入</label>
        </div>
        <div class="bulk-dev-list" id="bulkDevList" style="flex:1;overflow-y:auto;padding:8px">`;

    // ★ 设备卡片：只有设备级 checkbox，点击展开看有哪些实体（纯展示不可单独勾）
    devArr.forEach((dev) => {
      const allAlready = dev.ents.every((e) => existingEntities.has(e.eid));
      const someAlready = dev.ents.some((e) => existingEntities.has(e.eid));
      const doms = Array.from(dev.domains);
      const kind = DEV_KIND[dev.platform] || doms.map((d) => DEV_KIND[d]).filter(Boolean)[0] || '';
      html += `<div class="bulk-dev-card${allAlready ? ' all-already' : ''}" data-dev="${dev.key}">
        <div class="bulk-dev-head">
          <label class="bulk-dev-label">
            <input type="checkbox" class="bulk-dev-check" data-dev="${dev.key}" ${allAlready ? 'disabled' : ''}>
            <b class="bulk-dev-name">📱 ${dev.name}</b>
          </label>
          <span class="bulk-dev-meta">
            ${kind ? '<span class="bulk-dev-kind">' + kind + '</span>' : ''}
            <span class="bulk-dev-model">${dev.model || dev.platform || ''}</span>
            <span class="bulk-dev-count">${dev.ents.length} 实体 · 主: <code>${dev.mainEntEid}</code>${someAlready ? ' · 部分已接入' : ''}</span>
          </span>
          <button class="bulk-dev-toggle" type="button" title="展开/收起实体">▸</button>
        </div>
        <div class="bulk-dev-ents" style="display:none">`;
      dev.ents.forEach((e) => {
        const already = existingEntities.has(e.eid);
        html += `<div class="bulk-item${already ? ' already' : ''}">
          <span class="bulk-name">${e.name}</span>
          <code class="bulk-id">${e.eid}</code>
          <span class="bulk-state ${e.state === 'on' ? 'on' : (e.state === 'unavailable' ? 'unavailable' : '')}">${e.state}</span>
        </div>`;
      });
      html += '</div></div>';
    });

    // 没有 device_id 的散实体（仍然给 checkbox，因为没归属设备）
    if (noDev.length) {
      html += `<div class="bulk-dev-card"><div class="bulk-dev-head">
        <b class="bulk-dev-name">🔬 无归属设备的散实体</b>
        <span class="bulk-dev-meta"><span class="bulk-dev-count">${noDev.length} 个</span></span>
        <button class="bulk-dev-toggle" type="button">▸</button>
      </div><div class="bulk-dev-ents" style="display:none">`;
      noDev.forEach((e) => {
        const already = existingEntities.has(e.eid);
        html += `<label class="bulk-item${already ? ' already' : ''}">
          <input type="checkbox" class="bulk-ent-check" data-eid="${e.eid}" ${already ? 'disabled' : ''}>
          <span class="bulk-name">${e.name}</span>
          <code class="bulk-id">${e.eid}</code>
          <span class="bulk-state">${e.state}</span>
        </label>`;
      });
      html += '</div></div>';
    }

    html += `</div>
      <div class="lh-ed-dialog-foot" style="border-top:1px solid var(--bd2);padding:10px 16px">
        <button class="lh-ed-btn" id="bulkCancel" type="button">取消</button>
        <span class="hint" id="bulkCount" style="margin-left:12px">已勾选 0 台设备</span>
        <button class="lh-ed-btn primary" id="bulkDo" type="button" style="margin-left:auto">导入 →</button>
      </div>
    </div>`;
    dlg.innerHTML = html;
    document.body.appendChild(dlg);

    const closeIt = () => dlg.remove();
    setTimeout(() => dlg.classList.add('open'), 10);
    dlg.querySelector('.lh-ed-dialog-close').onclick = closeIt;
    dlg.querySelector('.lh-ed-dialog-mask').onclick = closeIt;
    dlg.querySelector('#bulkCancel').onclick = closeIt;

    // 展开/收起实体详情
    dlg.querySelectorAll('.bulk-dev-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const entsDiv = btn.closest('.bulk-dev-card').querySelector('.bulk-dev-ents');
        if (!entsDiv) return;
        const hidden = entsDiv.style.display === 'none';
        entsDiv.style.display = hidden ? '' : 'none';
        btn.textContent = hidden ? '▾' : '▸';
      });
    });

    // 搜索 + 隐藏已全部接入
    const searchInp = dlg.querySelector('#bulkSearch');
    const hideAlready = dlg.querySelector('#bulkHideAlready');
    const cards = dlg.querySelectorAll('.bulk-dev-card');
    function applyFilter() {
      const q = (searchInp.value || '').trim().toLowerCase();
      const hide = hideAlready.checked;
      cards.forEach((card) => {
        if (hide && card.classList.contains('all-already')) { card.style.display = 'none'; return; }
        if (!q) { card.style.display = ''; return; }
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(q) ? '' : 'none';
      });
    }
    let searchTimer = null;
    searchInp.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applyFilter, 120);
    });
    hideAlready.addEventListener('change', applyFilter);

    function refreshCount() {
      const devCount = dlg.querySelectorAll('.bulk-dev-check:checked').length;
      const entCount = dlg.querySelectorAll('.bulk-ent-check:checked').length;
      dlg.querySelector('#bulkCount').textContent =
        devCount + ' 台设备' + (entCount ? ' + ' + entCount + ' 散实体' : '');
    }
    dlg.addEventListener('change', refreshCount);

    dlg.querySelector('#bulkDo').onclick = () => {
      // ★ 简化：只收集设备级 checkbox + 散实体 checkbox
      const checkedDevs = new Set();   // device_id → 整台被勾
      const checkedEnts = new Set();   // eid → 散实体被勾
      dlg.querySelectorAll('.bulk-dev-check:checked').forEach((cb) => {
        if (cb.dataset.dev) checkedDevs.add(cb.dataset.dev);
      });
      dlg.querySelectorAll('.bulk-ent-check:checked').forEach((cb) => {
        if (cb.dataset.eid) checkedEnts.add(cb.dataset.eid);
      });
      if (!checkedDevs.size && !checkedEnts.size) { closeIt(); return; }

      const existing = window.LH.devices || [];
      const plan = window.LH.plan || { w: 620, h: 692 };
      const cx = Math.round(plan.w / 2), cy = Math.round(plan.h / 2);

      const toCreate = [];
      const seenMainEids = new Set();

      // 1) 被勾的设备 → 整台进来
      devArr.forEach((dev) => {
        if (!checkedDevs.has(dev.key)) return;
        if (dev.ents.every((e) => existingEntities.has(e.eid))) return;
        if (seenMainEids.has(dev.mainEntEid)) return;
        seenMainEids.add(dev.mainEntEid);
        toCreate.push({
          name: dev.name,
          kind: dev.mainEntKind,
          entity_id: dev.mainEntEid,
          entities: dev.eids.slice(),  // ★ 整台设备所有实体 eid 数组
          device_id: dev.key
        });
      });

      // 2) 被勾的散实体 → 单独建条目
      noDev.forEach((e) => {
        if (!checkedEnts.has(e.eid)) return;
        if (existingEntities.has(e.eid)) return;
        if (seenMainEids.has(e.eid)) return;
        seenMainEids.add(e.eid);
        toCreate.push({
          name: e.name,
          kind: DOMAIN_KIND[e.domain] || 'appliance',
          entity_id: e.eid,
          entities: [e.eid],  // ★ 单元素数组
          device_id: null
        });
      });

      if (!toCreate.length) { closeIt(); return; }

      toCreate.forEach((c, i) => {
        const idx = existing.length + i;
        const angle = (idx % 8) * (Math.PI / 4);
        const radius = 30 + Math.floor(idx / 8) * 30;
        const x = Math.max(30, Math.min(plan.w - 30, Math.round(cx + Math.cos(angle) * radius)));
        const y = Math.max(30, Math.min(plan.h - 30, Math.round(cy + Math.sin(angle) * radius)));
        existing.push({
          id: genId('d'), name: c.name, kind: c.kind,
          entity: c.entity_id,         // 主实体（控制/显示用）
          entities: c.entities,         // ★ 同设备所有实体（数组）
          room: '', x, y
        });
      });
      window.LH.devices = existing;
      markDirty();
      closeIt();
      rerenderEditorTab();
      document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
      toastHint('已导入 ' + toCreate.length + ' 台设备 · 编辑器里拖到对应房间');
    };
  }

  function buildDevRow(d) {
    const row = el('div', 'lh-ed-row');
    row.dataset.id = d.id;
    // 实体实时状态徽章（来自 HA 真实状态）
    let stBadge = '';
    const states = haStates();
    if (!d.entity) stBadge = '<span class="lh-st off">未绑实体</span>';
    else if (!states) stBadge = '';
    else if (!states[d.entity]) stBadge = '<span class="lh-st bad">⚠ 实体不存在</span>';
    else if (states[d.entity].state === 'unavailable' || states[d.entity].state === 'unknown')
      stBadge = '<span class="lh-st off">离线</span>';
    else stBadge = '<span class="lh-st ok">' + (states[d.entity].state || '') + '</span>';
    row.innerHTML = `<div class="lh-ed-row-main">
      <div class="lh-ed-row-title">${d.name || '(无名称)'}</div>
      <div class="lh-ed-row-sub">
        kind: <b>${d.kind || '—'}</b> · entity: <code>${d.entity || '—'}</code>
        ${d.room ? ' · 房间: <b>' + roomNameSafe(d.room) + '</b>' : ''}
      </div>
    </div>
    <div class="lh-ed-row-actions">${stBadge}
      <button class="lh-ed-btn" data-act="edit" type="button">编辑</button>
      <button class="lh-ed-btn danger" data-act="del" type="button">删除</button>
    </div>`;
    row.querySelector('[data-act="edit"]').addEventListener('click', () => openDeviceEditor(d.id));
    row.querySelector('[data-act="del"]').addEventListener('click', () => deleteDevice(d.id));
    return row;
  }

  function roomNameSafe(id) {
    const r = (window.LH.rooms || []).find((x) => x.id === id);
    return r ? r.name : id;
  }

  /* ══════════════════════════════════════════════════════
   * 设备/房间/家电 共用的弹窗编辑器
   * ══════════════════════════════════════════════════════ */
  let devDialog = null;
  function ensureDialog() {
    if (devDialog) return devDialog;
    devDialog = el('div', 'lh-ed-dialog');
    devDialog.innerHTML = `<div class="lh-ed-dialog-mask"></div>
      <div class="lh-ed-dialog-body" id="lhEdDevDialog">
        <div class="lh-ed-dialog-head"><b id="lhEdDevTitle">编辑</b>
          <button class="lh-ed-dialog-close" type="button">×</button></div>
        <div class="lh-ed-dialog-form" id="lhEdDevForm"></div>
        <div class="lh-ed-dialog-foot">
          <button class="lh-ed-btn" id="lhEdDevCancel" type="button">取消</button>
          <button class="lh-ed-btn primary" id="lhEdDevSave" type="button">保存</button>
        </div>
      </div>`;
    document.body.appendChild(devDialog);
    devDialog.querySelector('.lh-ed-dialog-close').addEventListener('click', () => devDialog.classList.remove('open'));
    devDialog.querySelector('.lh-ed-dialog-mask').addEventListener('click', () => devDialog.classList.remove('open'));
    devDialog.querySelector('#lhEdDevCancel').addEventListener('click', () => devDialog.classList.remove('open'));
    return devDialog;
  }

  /* ── 设备类型表：与 lovehome.js 的 ICON 一一对应 ──────────────
     kind 必须是主程序认识的键（图标才显示得出来），这里的中文标签
     和 <use> 图标让用户不用记英文单词 */
  const KIND_OPTIONS = [
    ['light', '灯'], ['ac', '空调'], ['heat', '地暖'], ['fresh', '新风'], ['fan', '风扇'],
    ['plug', '插座'], ['cover', '窗帘'], ['lock', '门锁'], ['cam', '摄像头'], ['toilet', '智能马桶'],
    ['appliance', '家电'], ['heater', '热水器'], ['cook', '烹饪'], ['flame', '燃气'],
    ['media', '影音'], ['hub', '网关'], ['sensor', '传感器'], ['panel', '面板'], ['bell', '门铃']
  ];
  const KIND_ICON = {
    light: 'i-bulb', ac: 'i-snow', heat: 'i-heat', fresh: 'i-wind', fan: 'i-fan',
    plug: 'i-plug', cover: 'i-cover', lock: 'i-lock', cam: 'i-cam', toilet: 'i-toilet',
    appliance: 'i-washer', heater: 'i-tap', cook: 'i-pot', flame: 'i-flame',
    media: 'i-media', hub: 'i-hub', sensor: 'i-wave', panel: 'i-panel', bell: 'i-bell'
  };
  /* 选实体时推荐这些 domain 的实体排在前面 */
  const KIND_DOMAINS = {
    light: ['light'], ac: ['climate'], heat: ['climate', 'switch'], fresh: ['fan', 'switch'],
    fan: ['fan'], plug: ['switch'], cover: ['cover'], lock: ['lock'], cam: ['camera'],
    toilet: ['switch', 'sensor'], appliance: ['switch', 'sensor', 'media_player'],
    heater: ['water_heater', 'climate', 'switch'], cook: ['switch'], flame: ['binary_sensor', 'sensor'],
    media: ['media_player'], hub: ['switch', 'binary_sensor'], sensor: ['sensor', 'binary_sensor'],
    panel: ['switch'], bell: ['binary_sensor']
  };
  /* 底部筛选 chip 可选图标（都是 index.html 里已有的 <symbol>） */
  const ICON_CHOICES = [
    ['i-all', '全部'], ['i-bulb', '灯'], ['i-snow', '空调'], ['i-heat', '采暖'], ['i-wind', '新风'],
    ['i-fan', '风扇'], ['i-plug', '插座'], ['i-cover', '窗帘'], ['i-lock', '门锁'], ['i-cam', '摄像'],
    ['i-toilet', '卫浴'], ['i-media', '影音'], ['i-washer', '家电'], ['i-tap', '热水器'],
    ['i-pot', '烹饪'], ['i-flame', '燃气'], ['i-hub', '网关'], ['i-wave', '传感器'],
    ['i-panel', '面板'], ['i-bell', '门铃'], ['i-bolt', '用电'], ['i-drop', '湿度'], ['i-user', '家人']
  ];

  function kindLabel(k) {
    const hit = KIND_OPTIONS.find((x) => x[0] === k);
    return hit ? hit[1] : k;
  }


  /* 反向：根据实体的 domain 自动推断 kind（Houseplan 式自动落位） */
  const DOMAIN_KIND = {
    light: 'light', climate: 'ac', cover: 'cover', lock: 'lock', camera: 'cam',
    media_player: 'media', fan: 'fan', water_heater: 'heater', humidifier: 'appliance',
    vacuum: 'appliance', siren: 'bell', switch: 'plug', sensor: 'sensor', binary_sensor: 'sensor',
    valve: 'appliance', remote: 'media', select: 'panel', number: 'sensor', button: 'panel',
    date: 'sensor', time: 'sensor', text: 'sensor', lawn_mower: 'appliance',
    event: 'panel'
  };

  function openDeviceEditor(id, preset) {
    preset = preset || {};
    const isNew = !id;
    const plan = window.LH.plan || { w: 620, h: 692 };
    // 新设备没给坐标时默认放画布中央（保证保存后能在户型图上看到它）
    const d = isNew
      ? { id: genId('d'), name: '新设备', kind: 'light', room: preset.roomId || '',
          entity: '', x: (preset.x != null ? preset.x : Math.round(plan.w / 2)),
          y: (preset.y != null ? preset.y : Math.round(plan.h / 2)) }
      : window.LH.devices.find((x) => x.id === id);
    if (!d) return;

    ensureDialog();

    $('#lhEdDevTitle', devDialog).textContent = isNew ? '添加设备' : '编辑设备';

    // 构建表单
    const form = $('#lhEdDevForm', devDialog);
    const roomOptions = (window.LH.rooms || []).map((r) => `<option value="${r.id}" ${d.room === r.id ? 'selected' : ''}>${r.name}</option>`).join('');

    /* 类型九宫格：图标 + 中文名，点选 */
    const kindGrid = KIND_OPTIONS.map(([k, label]) =>
      `<button type="button" class="kind-ico${d.kind === k ? ' on' : ''}" data-kind="${k}" title="${k}">
         <svg viewBox="0 0 24 24"><use href="#${KIND_ICON[k] || 'i-wave'}"></use></svg><span>${label}</span>
       </button>`).join('');

    form.innerHTML = `
      <label>HA 实体（从真实设备里选，选完自动定类型和名字）
        <input id="dEntity" value="${(d.entity || '').replace(/"/g, '&quot;')}" placeholder="点击输入框从 HA 实体列表选择">
      </label>
      <label>设备名称<input id="dName" value="${(d.name || '').replace(/"/g, '&quot;')}" placeholder="如：客厅主灯"></label>
      <label>图标类型<span class="hint" style="margin-left:.4em">决定显示哪个图标，选实体后一般会自动选好</span>
        <div class="kind-row" id="dKindRow">${kindGrid}</div>
        <input type="hidden" id="dKind" value="${d.kind || 'light'}">
      </label>
      <label>归属房间
        <select id="dRoom">
          <option value="">— 无 —</option>${roomOptions}
        </select>
      </label>
      <div class="form-row">
        <label>X 坐标<input id="dX" type="number" step="0.1" value="${d.x ?? ''}" placeholder="可选"></label>
        <label>Y 坐标<input id="dY" type="number" step="0.1" value="${d.y ?? ''}" placeholder="可选"></label>
      </div>
      <label class="hint">坐标是户型图上的相对位置（画布 ${window.LH.plan ? window.LH.plan.w : 620}×${window.LH.plan ? window.LH.plan.h : 692}）。在「户型图」tab 点「+ 图上添加设备」可以点哪放哪，平时直接拖图标微调。</label>`;

    // 实体选择器 + 自动落位（Houseplan 式：选实体 → 自动定类型/名字）
    const pickerOpts = {
      domains: (KIND_DOMAINS[d.kind] || []).slice(),
      placeholder: '从 HA 实体列表选择，或手动输入 entity_id',
      onChange: async (eid) => {
        if (entPicker.updateStatus) entPicker.updateStatus();
        const states = haStates();
        const s = states && states[eid];
        if (!s) return;
        const domain = eid.split('.')[0];
        if (DOMAIN_KIND[domain]) {
          d.kind = DOMAIN_KIND[domain];
          $('#dKind', form).value = d.kind;
          $$('.kind-ico', form).forEach((b) => b.classList.toggle('on', b.dataset.kind === d.kind));
          pickerOpts.domains = (KIND_DOMAINS[d.kind] || []).slice();
        }
        const fname = s.attributes && s.attributes.friendly_name;
        if (fname && isNew) $('#dName', form).value = fname;

        // ★ 自动关联：查 entity_registry 拿同 device_id 的所有实体
        d.device_id = null;
        d.entities = [eid];  // 默认只有自己
        const hass2 = haHass();
        if (hass2 && typeof hass2.callWS === 'function') {
          try {
            const ents = await hass2.callWS({ type: 'config/entity_registry/list' });
            const myEnt = (ents || []).find((x) => x.entity_id === eid);
            if (myEnt && myEnt.device_id) {
              d.device_id = myEnt.device_id;
              const siblings = (ents || [])
                .filter((x) => x.device_id === myEnt.device_id && !x.disabled_by && !x.hidden_by)
                .map((x) => x.entity_id);
              if (siblings.length > 1) {
                // ★ 让用户选：整台设备所有实体 or 仅当前这个
                const deviceName = (s.attributes && s.attributes.friendly_name) || eid;
                const isAll = confirm(
                  `检测到这个实体属于一台设备（共 ${siblings.length} 个实体）。\n\n` +
                  `点击【确定】→ 添加整台设备（所有功能都会在控制面板里出现）\n` +
                  `点击【取消】→ 仅添加当前这一个实体（只显示/控制这一个）\n\n` +
                  `当前实体：${deviceName}`);
                if (isAll) {
                  d.entities = siblings;
                  toastHint('✓ 已添加整台设备（' + siblings.length + ' 个实体）', 2200);
                } else {
                  d.entities = [eid];
                  toastHint('仅添加当前实体（' + siblings.length + ' 个兄弟实体已忽略）', 2200);
                }
              }
            }
          } catch (e) { /* 静默退化 */ }
        }
      }
    };
    const entPicker = createEntityPicker($('#dEntity', form), pickerOpts);

    // 类型九宫格点选
    $('#dKindRow', form).addEventListener('click', (e) => {
      const b = e.target.closest('.kind-ico');
      if (!b) return;
      d.kind = b.dataset.kind;
      $('#dKind', form).value = d.kind;
      $$('.kind-ico', form).forEach((x) => x.classList.toggle('on', x === b));
    });

    devDialog.classList.add('open');

    $('#lhEdDevSave', devDialog).onclick = () => {
      d.name = $('#dName', form).value.trim() || '未命名';
      d.kind = $('#dKind', form).value;
      d.room = $('#dRoom', form).value || '';
      d.entity = entPicker.searchInp.value.trim();
      const xv = $('#dX', form).value;
      const yv = $('#dY', form).value;
      if (xv !== '') d.x = parseFloat(xv); else delete d.x;
      if (yv !== '') d.y = parseFloat(yv); else delete d.y;

      // 保存校验：实体必须真实存在于 HA（用户要求设备都来自 HA）
      const states = haStates();
      if (d.entity && states && !states[d.entity]) {
        if (!confirm('实体 ' + d.entity + ' 在 HA 中不存在（可能是手输错了）。\n仍要保存吗？')) return;
      }
      if (!d.entity && !confirm('这台设备没有绑定 HA 实体，页面上不会显示实时状态，只能当装饰图标。\n仍要保存吗？')) return;

      if (isNew) window.LH.devices.push(d);
      markDirty();
      devDialog.classList.remove('open');
      rerenderEditorTab();
      document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
    };
  }

  /* ══════════════════════════════════════════════════════
   * Tab: 房间列表（rooms）
   * ══════════════════════════════════════════════════════ */
  function buildRoomsTab() {
    const wrap = el('div', 'lh-ed-list-wrap');
    wrap.innerHTML = '<div class="lh-ed-list-head">' +
      '<b>房间列表</b><span class="hint">共 ' + (window.LH.rooms || []).length + ' 个</span>' +
      '<div class="lh-ed-list-actions">' +
        '<label class="lh-ed-selall"><input type="checkbox" id="lhEdSelAll">全选</label>' +
        '<button class="lh-ed-btn danger" id="lhEdDelSel" type="button" disabled>删除选中 (0)</button>' +
      '</div></div><div class="lh-ed-list" id="lhEdRoomList"></div>';

    const list = $('#lhEdRoomList', wrap);
    (window.LH.rooms || []).forEach((r) => list.appendChild(buildRoomRow(r)));
    setupMultiSelect('rooms', wrap.querySelector('.lh-ed-list-head'), list, deleteRooms);
    return wrap;
  }

  function deleteRooms(ids) {
    if (!ids.length) return;
    if (!confirm('确定删除选中的 ' + ids.length + ' 个房间？里面的设备会变成无房间归属。')) return;
    window.LH.rooms = (window.LH.rooms || []).filter((r) => ids.indexOf(r.id) < 0);
    (window.LH.devices || []).forEach((d) => { if (ids.indexOf(d.room) >= 0) d.room = ''; });
    multiSel.rooms.clear();
    markDirty(); rerenderEditorTab();
    document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
  }

  function buildRoomRow(r) {
    const devCount = (window.LH.devices || []).filter((d) => d.room === r.id).length;
    const row = el('div', 'lh-ed-row');
    row.dataset.id = r.id;
    row.innerHTML = `<div class="lh-ed-row-main">
      <div class="lh-ed-row-title">${r.name} <span class="lh-ed-row-id">(${r.id})</span></div>
      <div class="lh-ed-row-sub">
        传感器：<code>${r.temp || '—'}</code> / <code>${r.hum || '—'}</code>
        · 设备数: <b>${devCount}</b>
        ${r.mirror ? ' · 镜像自: <b>' + r.mirror + '</b>' : ''}
      </div>
    </div>
    <div class="lh-ed-row-actions">
      <button class="lh-ed-btn" data-act="edit" type="button">编辑</button>
      <button class="lh-ed-btn danger" data-act="del" type="button">删除</button>
    </div>`;
    row.querySelector('[data-act="edit"]').onclick = () => openRoomEditor(r.id);
    row.querySelector('[data-act="del"]').onclick = () => {
      if (!confirm(`确定删除房间 "${r.name}"？里面的设备会变成无房间归属。`)) return;
      window.LH.rooms = window.LH.rooms.filter((x) => x.id !== r.id);
      markDirty(); rerenderEditorTab();
      document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
    };
    return row;
  }

  function openRoomEditor(id) {
    const r = window.LH.rooms.find((x) => x.id === id);
    if (!r) return;
    ensureDialog();

    $('#lhEdDevTitle', devDialog).textContent = '编辑房间';
    const form = $('#lhEdDevForm', devDialog);
    form.innerHTML = `
      <label>房间 ID (英文标识)
        <input id="rId" value="${r.id}" readonly></label>
      <label>显示名称<input id="rName" value="${(r.name || '').replace(/"/g, '&quot;')}"></label>
      <label>温度传感器实体<input id="rTemp" value="${r.temp || ''}" placeholder="如：sensor.living_temperature"></label>
      <label>湿度传感器实体<input id="rHum" value="${r.hum || ''}" placeholder="如：sensor.living_humidity"></label>
      <label>镜像自哪个房间（可选，没有独立传感器时填）
        <select id="rMirror">
          <option value="">— 无 —</option>
          ${(window.LH.rooms || []).filter((x) => x.id !== r.id).map((x) =>
            `<option value="${x.id}" ${r.mirror === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}
        </select>
      </label>
      <div class="form-row">
        <label>标签 X (lx)<input id="rLx" type="number" step="0.1" value="${r.lx ?? ''}"></label>
        <label>标签 Y (ly)<input id="rLy" type="number" step="0.1" value="${r.ly ?? ''}"></label>
      </div>
      <label class="hint">房间多边形坐标请在「户型图」tab 中直接编辑顶点。</label>`;

    createEntityPicker($('#rTemp', form), { domains: ['sensor', 'climate'], placeholder: '温度传感器' });
    createEntityPicker($('#rHum', form), { domains: ['sensor', 'climate'], placeholder: '湿度传感器' });

    devDialog.classList.add('open');
    $('#lhEdDevSave', devDialog).onclick = () => {
      r.name = $('#rName', form).value.trim() || r.id;
      r.temp = $('#rTemp', form).value.trim();
      r.hum = $('#rHum', form).value.trim();
      const mir = $('#rMirror', form).value;
      if (mir) { r.mirror = mir; } else { delete r.mirror; }
      const lxv = $('#rLx', form).value; if (lxv !== '') r.lx = parseFloat(lxv);
      const lyv = $('#rLy', form).value; if (lyv !== '') r.ly = parseFloat(lyv);

      // 传感器实体必须是 HA 里真实存在的
      const states = haStates();
      const bad = [r.temp, r.hum].filter((e) => e && states && !states[e]);
      if (bad.length && !confirm('这些实体在 HA 中不存在：\n' + bad.join('\n') + '\n\n仍要保存吗？')) return;

      markDirty();
      devDialog.classList.remove('open');
      rerenderEditorTab();
      document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
    };
  }

  /* ══════════════════════════════════════════════════════
   * Tab: 家电页（appliances）
   * ══════════════════════════════════════════════════════ */
  function buildAppliancesTab() {
    const wrap = el('div', 'lh-ed-list-wrap');
    const list = window.LH.appliances || [];
    wrap.innerHTML = '<div class="lh-ed-list-head">' +
      '<b>家电页</b><span class="hint">共 ' + list.length + ' 台</span>' +
      '<button class="lh-ed-btn primary" id="lhEdApAdd" type="button">+ 添加家电</button>' +
      '</div><div class="lh-ed-list" id="lhEdApList"></div>';

    const apList = $('#lhEdApList', wrap);
    list.forEach((a, i) => {
      const row = el('div', 'lh-ed-row');
      row.innerHTML = `<div class="lh-ed-row-main">
        <div class="lh-ed-row-title">${a.name || '(无名称)'}</div>
        <div class="lh-ed-row-sub">图标: <b>${a.icon || '—'}</b> · 房间: <b>${a.room || '—'}</b> · 条目: <b>${(a.rows || []).length}</b></div>
      </div>
      <div class="lh-ed-row-actions">
        <button class="lh-ed-btn" type="button" data-i="${i}" data-act="edit">编辑</button>
        <button class="lh-ed-btn danger" type="button" data-i="${i}" data-act="del">删除</button>
      </div>`;
      apList.appendChild(row);
      row.querySelector('[data-act="edit"]').onclick = () => openApplianceEditor(i);
      row.querySelector('[data-act="del"]').onclick = () => {
        if (!confirm(`确定删除 "${a.name}"？`)) return;
        window.LH.appliances.splice(i, 1);
        markDirty(); rerenderEditorTab();
      };
    });
    $('#lhEdApAdd', wrap).onclick = () => openApplianceEditor(-1);
    return wrap;
  }

  function openApplianceEditor(idx) {
    const isNew = idx < 0;
    const a = isNew ? { name: '新家电', icon: 'i-gear', room: '', rows: [], keys: [] }
                    : window.LH.appliances[idx];
    ensureDialog();

    $('#lhEdDevTitle', devDialog).textContent = isNew ? '添加家电' : '编辑家电';
    const form = $('#lhEdDevForm', devDialog);
    form.innerHTML = `
      <label>名称<input id="aName" value="${(a.name || '').replace(/"/g, '&quot;')}"></label>
      <label>图标 class<input id="aIcon" value="${(a.icon || '').replace(/"/g, '&quot;')}" placeholder="如：i-washer"></label>
      <label>房间<input id="aRoom" value="${(a.room || '').replace(/"/g, '&quot;')}" placeholder="如：阳台"></label>
      <label>底部说明 (hint)<input id="aHint" value="${((a.hint || '').replace(/"/g, '&quot;'))}" placeholder="可选"></label>
      <label class="hint">家电的详细 rows 结构较复杂（每行 = [标签, 实体, 状态映射?, 属性名?, 单位?]），建议直接导出 JSON 后手改，或从模板复制再调整。</label>`;
    devDialog.classList.add('open');
    $('#lhEdDevSave', devDialog).onclick = () => {
      a.name = $('#aName', form).value.trim();
      a.icon = $('#aIcon', form).value.trim();
      a.room = $('#aRoom', form).value.trim();
      const h = $('#aHint', form).value.trim();
      if (h) a.hint = h; else delete a.hint;
      if (isNew) {
        if (!window.LH.appliances) window.LH.appliances = [];
        window.LH.appliances.push(a);
      }
      markDirty();
      devDialog.classList.remove('open');
      rerenderEditorTab();
    };
  }

  /* ══════════════════════════════════════════════════════
   * Tab: 侧栏 · 底栏（左栏「全屋」统计 + 底部筛选 chip）
   * ══════════════════════════════════════════════════════ */
  function buildShellTab() {
    const wrap = el('div', 'lh-ed-overview');
    const cfg = window.LH.config || (window.LH.config = {});
    /* 当前生效的「全屋」统计行：没配过就用默认四类（和 lovehome.js 的兜底一致） */
    const rows = (Array.isArray(cfg.homeStats) && cfg.homeStats.length)
      ? cfg.homeStats.map((x) => ({ kind: x.kind, name: x.name || kindLabel(x.kind) }))
      : ['light', 'ac', 'heat', 'fresh'].map((k) => ({ kind: k, name: kindLabel(k) }));
    const flt = (window.LH.filters || []).map((f) => ({ id: f.id, name: f.name, icon: f.icon }));

    wrap.innerHTML = `
      <div class="lh-ed-section">
        <h4>左栏「全屋」统计</h4>
        <div class="hint">设备类型 + 显示名称，可增删和调顺序；数字由 HA 实体实时统计。</div>
        <div id="hsList" class="lh-ed-plist"></div>
        <button class="lh-ed-btn" id="hsAdd" type="button">+ 添加统计项</button>
      </div>
      <div class="lh-ed-section">
        <h4>底部筛选栏</h4>
        <div class="hint">「全部 / 灯光 …」这排 chip：名称、图标、对应类型、顺序都能改。
          「全部」固定在第一位，不能删。</div>
        <div id="fltList" class="lh-ed-plist"></div>
        <button class="lh-ed-btn" id="fltAdd" type="button">+ 添加筛选项</button>
      </div>`;

    /* 应用到 window.LH 并保存；live=true 时立刻重绘仪表盘 */
    function commit(live) {
      cfg.homeStats = rows.map((r) => ({ kind: r.kind, name: r.name || kindLabel(r.kind) }));
      window.LH.filters = flt.map((f) => ({ id: f.id, name: f.name, icon: f.icon }));
      markDirty();
      if (live) document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
    }
    const escq = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;');

    /* ── 「全屋」统计行 ── */
    function renderStats() {
      const box = $('#hsList', wrap);
      box.innerHTML = '';
      rows.forEach((r, i) => {
        const row = el('div', 'lh-ed-prow');
        row.innerHTML =
          `<select data-f="kind">${KIND_OPTIONS.map(([k, l]) =>
            `<option value="${k}"${k === r.kind ? ' selected' : ''}>${l}</option>`).join('')}</select>` +
          `<input data-f="name" value="${escq(r.name)}" placeholder="显示名称">` +
          '<button class="lh-ed-btn" data-mv="-1" type="button" title="上移">↑</button>' +
          '<button class="lh-ed-btn" data-mv="1" type="button" title="下移">↓</button>' +
          '<button class="lh-ed-btn danger" data-del="1" type="button" title="删除">×</button>';
        row.querySelector('[data-f="kind"]').onchange = (e) => {
          /* 名称还是「旧类型的默认名」时跟着新类型走；用户改过的名字保留 */
          const was = kindLabel(r.kind);
          r.kind = e.target.value;
          if (!r.name || r.name === was) r.name = e.target.selectedOptions[0].textContent;
          commit(true);
          renderStats();
        };
        const nameInp = row.querySelector('[data-f="name"]');
        nameInp.oninput = () => { r.name = nameInp.value; commit(false); };
        nameInp.onchange = () => commit(true);
        row.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => {
          const j = i + Number(b.dataset.mv);
          if (j < 0 || j >= rows.length) return;
          const t = rows[i]; rows[i] = rows[j]; rows[j] = t;
          commit(true); renderStats();
        });
        row.querySelector('[data-del]').onclick = () => {
          rows.splice(i, 1);
          commit(true); renderStats();
        };
        box.append(row);
      });
    }

    /* ── 底部筛选 chip ── */
    function renderFilters() {
      const box = $('#fltList', wrap);
      box.innerHTML = '';
      const typeOpts = KIND_OPTIONS.map(([k, l]) => [k, l]).concat([['other', '其它（未单独分类）']]);
      flt.forEach((f, i) => {
        const isAll = f.id === 'all';
        const row = el('div', 'lh-ed-prow');
        row.innerHTML =
          (isAll
            ? '<span class="lh-ed-fixed">全部</span>'
            : `<select data-f="id">${typeOpts.map(([k, l]) =>
                `<option value="${k}"${k === f.id ? ' selected' : ''}>${l}</option>`).join('')}</select>`) +
          `<input data-f="name" value="${escq(f.name)}" placeholder="显示名称">` +
          `<select data-f="icon">${ICON_CHOICES.map(([k, l]) =>
            `<option value="${k}"${k === f.icon ? ' selected' : ''}>${l}</option>`).join('')}</select>` +
          '<button class="lh-ed-btn" data-mv="-1" type="button" title="上移">↑</button>' +
          '<button class="lh-ed-btn" data-mv="1" type="button" title="下移">↓</button>' +
          (isAll ? '' : '<button class="lh-ed-btn danger" data-del="1" type="button" title="删除">×</button>');
        const idSel = row.querySelector('[data-f="id"]');
        if (idSel) idSel.onchange = (e) => {
          const was = kindLabel(f.id);
          f.id = e.target.value;
          if (!f.name || f.name === was) f.name = e.target.selectedOptions[0].textContent;
          commit(true);
          renderFilters();
        };
        const nameInp = row.querySelector('[data-f="name"]');
        nameInp.oninput = () => { f.name = nameInp.value; commit(false); };
        nameInp.onchange = () => commit(true);
        row.querySelector('[data-f="icon"]').onchange = (e) => { f.icon = e.target.value; commit(true); };
        row.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => {
          const j = i + Number(b.dataset.mv);
          if (j < 0 || j >= flt.length) return;
          const t = flt[i]; flt[i] = flt[j]; flt[j] = t;
          commit(true); renderFilters();
        });
        const del = row.querySelector('[data-del]');
        if (del) del.onclick = () => { flt.splice(i, 1); commit(true); renderFilters(); };
        box.append(row);
      });
    }

    $('#hsAdd', wrap).onclick = () => {
      const used = new Set(rows.map((r) => r.kind));
      const k = (KIND_OPTIONS.find((x) => !used.has(x[0])) || KIND_OPTIONS[0])[0];
      rows.push({ kind: k, name: kindLabel(k) });
      commit(true); renderStats();
    };
    $('#fltAdd', wrap).onclick = () => {
      const used = new Set(flt.map((f) => f.id));
      const k = (KIND_OPTIONS.find((x) => !used.has(x[0])) || KIND_OPTIONS[0])[0];
      flt.push({ id: k, name: kindLabel(k), icon: KIND_ICON[k] || 'i-plug' });
      commit(true); renderFilters();
    };

    renderStats();
    renderFilters();
    return wrap;
  }

  /* ══════════════════════════════════════════════════════
   * Tab: 概览 · 家人 · 网关
   * ══════════════════════════════════════════════════════ */
  function buildOverviewTab() {
    const wrap = el('div', 'lh-ed-overview');
    const cfg = window.LH.config || {};
    const w = cfg.weather || {};
    const ov = cfg.overview || {};

    wrap.innerHTML = `
      <div class="lh-ed-section">
        <h4>天气 <small class="lh-ed-hint">装 Met.no / 和风天气集成，这里填 weather.* 实体 ID；用电 kWh 填 sensor.*；温湿度可选</small></h4>
        <label>天气实体<input id="wEntity" value="${w.entity || ''}" placeholder="如：weather.forecast_home"></label>
        <label>室内温度传感器<input id="wTemp" value="${w.temp || ''}"></label>
        <label>室内湿度传感器<input id="wHum" value="${w.hum || ''}"></label>
        <label>今日用电传感器<input id="wKwh" value="${w.kwh || ''}" title="需要单位 kWh、device_class=energy 的累计递增 sensor"></label>
      </div>
      <div class="lh-ed-section">
        <h4>网络 <small class="lh-ed-hint">可选；sensor.* 网速实体，装路由器监控或 speedtestdotnet 集成</small></h4>
        <label>下载速度<input id="oDown" value="${ov.netDown || ''}"></label>
        <label>上传速度<input id="oUp" value="${ov.netUp || ''}"></label>
      </div>
      <div class="lh-ed-section">
        <h4>家人在线 <small class="lh-ed-hint">先在路由器绑手机固定 IP → HA 装 Ping 集成 → 这里填它生成的 binary_sensor.*</small></h4>
        <div id="peopleList">${(ov.people || []).map((p, i) => `
          <div class="lh-ed-person">
            <input value="${(p.name || '').replace(/"/g, '&quot;')}" data-pf="name" data-pi="${i}" placeholder="姓名">
            <input value="${(p.entity || '').replace(/"/g, '&quot;')}" data-pf="entity" data-pi="${i}" placeholder="binary_sensor 实体">
            <button type="button" class="lh-ed-btn danger" data-pdel="${i}">删</button>
          </div>`).join('')}</div>
        <button class="lh-ed-btn" id="peopleAdd" type="button">+ 添加家人</button>
      </div>
      <div class="lh-ed-section">
        <h4>摄像头 <small class="lh-ed-hint">camera / image 域实体；没接就跳过不填</small></h4>
        <div id="camList">${(cfg.cameras || []).map((c, i) => `
          <div class="lh-ed-person">
            <input value="${(c.name || '').replace(/"/g, '&quot;')}" data-cf="name" data-ci="${i}" placeholder="名称">
            <input value="${(c.entity || '').replace(/"/g, '&quot;')}" data-cf="entity" data-ci="${i}" placeholder="camera 实体">
            <button type="button" class="lh-ed-btn danger" data-cdel="${i}">删</button>
          </div>`).join('')}</div>
        <button class="lh-ed-btn" id="camAdd" type="button">+ 添加摄像头</button>
      </div>
      <div class="lh-ed-section">
        <h4>网关 / 在线设备</h4>
        <div id="gateList">${(cfg.gates || []).map((g, i) => `
          <div class="lh-ed-person">
            <input value="${(g.name || '').replace(/"/g, '&quot;')}" data-gf="name" data-gi="${i}" placeholder="名称">
            <input value="${(g.entity || '').replace(/"/g, '&quot;')}" data-gf="entity" data-gi="${i}" placeholder="实体">
            <button type="button" class="lh-ed-btn danger" data-gdel="${i}">删</button>
          </div>`).join('')}</div>
        <button class="lh-ed-btn" id="gateAdd" type="button">+ 添加网关</button>
      </div>
      <div class="lh-ed-foot-actions">
        <button class="lh-ed-btn primary" id="ovSave" type="button">保存概览设置</button>
      </div>`;

    // 给概览里所有实体 input 挂上 EntityPicker
    createEntityPicker($('#wEntity', wrap), { domains: ['weather'], placeholder: 'weather 实体' });
    createEntityPicker($('#wTemp', wrap), { domains: ['sensor', 'climate'], placeholder: '温度传感器' });
    createEntityPicker($('#wHum', wrap), { domains: ['sensor', 'climate'], placeholder: '湿度传感器' });
    createEntityPicker($('#wKwh', wrap), { domains: ['sensor'], placeholder: '用电传感器' });
    wrap.querySelectorAll('[data-pf="entity"]').forEach((inp) =>
      createEntityPicker(inp, { domains: ['binary_sensor', 'device_tracker'], placeholder: '家人存在检测' }));
    wrap.querySelectorAll('[data-cf="entity"]').forEach((inp) =>
      createEntityPicker(inp, { domains: ['camera', 'image'], placeholder: '摄像头实体' }));
    wrap.querySelectorAll('[data-gf="entity"]').forEach((inp) =>
      createEntityPicker(inp, { placeholder: '网关/设备在线状态实体' }));

    // 绑定保存
    $('#ovSave', wrap).onclick = () => {
      cfg.weather = Object.assign({}, w, {
        entity: $('#wEntity', wrap).value.trim(),
        temp: $('#wTemp', wrap).value.trim(),
        hum: $('#wHum', wrap).value.trim(),
        kwh: $('#wKwh', wrap).value.trim()
      });
      ov.netDown = $('#oDown', wrap).value.trim();
      ov.netUp = $('#oUp', wrap).value.trim();
      window.LH.config.weather = cfg.weather;
      window.LH.config.overview = ov;
      markDirty();
      toastHint('概览设置已保存');
      document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
    };

    // 家人
    $('#peopleAdd', wrap).onclick = () => {
      if (!ov.people) ov.people = [];
      ov.people.push({ name: '新家人', entity: '' });
      rerenderEditorTab();
    };
    wrap.querySelectorAll('[data-pf]').forEach((inp) => {
      inp.oninput = () => {
        const i = Number(inp.dataset.pi);
        if (!ov.people[i]) ov.people[i] = {};
        ov.people[i][inp.dataset.pf] = inp.value;
        markDirty();
      };
    });
    wrap.querySelectorAll('[data-pdel]').forEach((b) => b.onclick = () => {
      ov.people.splice(Number(b.dataset.pdel), 1);
      markDirty(); rerenderEditorTab();
    });

    // 摄像头
    $('#camAdd', wrap).onclick = () => {
      if (!cfg.cameras) cfg.cameras = [];
      cfg.cameras.push({ name: '新摄像头', entity: '' });
      rerenderEditorTab();
    };
    wrap.querySelectorAll('[data-cf]').forEach((inp) => {
      inp.oninput = () => {
        const i = Number(inp.dataset.ci);
        if (!cfg.cameras[i]) cfg.cameras[i] = {};
        cfg.cameras[i][inp.dataset.cf] = inp.value;
        markDirty();
      };
    });
    wrap.querySelectorAll('[data-cdel]').forEach((b) => b.onclick = () => {
      cfg.cameras.splice(Number(b.dataset.cdel), 1);
      markDirty(); rerenderEditorTab();
    });

    // 网关
    $('#gateAdd', wrap).onclick = () => {
      if (!cfg.gates) cfg.gates = [];
      cfg.gates.push({ name: '新网关', entity: '' });
      rerenderEditorTab();
    };
    wrap.querySelectorAll('[data-gf]').forEach((inp) => {
      inp.oninput = () => {
        const i = Number(inp.dataset.gi);
        if (!cfg.gates[i]) cfg.gates[i] = {};
        cfg.gates[i][inp.dataset.gf] = inp.value;
        markDirty();
      };
    });
    wrap.querySelectorAll('[data-gdel]').forEach((b) => b.onclick = () => {
      cfg.gates.splice(Number(b.dataset.gdel), 1);
      markDirty(); rerenderEditorTab();
    });

    return wrap;
  }

  /* ══════════════════════════════════════════════════════
   * Tab: 数据备份（导出/导入/重置）
   * ══════════════════════════════════════════════════════ */
  function buildDataTab() {
    const wrap = el('div', 'lh-ed-data');
    const storeTip = serverReady
      ? '<div class="lh-ed-store ok">✓ 已连接 LoveHome 集成：配置保存在 Home Assistant 服务器上（/config/lovehome/config.json）。<b>换电脑、换浏览器、手机打开 HA，看到的都是同一个家</b>。</div>'
      : '<div class="lh-ed-store warn">⚠ 未检测到 LoveHome 集成：当前配置仅保存在本浏览器，换设备会丢失。<br>在 HA「设置 → 设备与服务 → 添加集成」里安装 LoveHome 后，配置会自动存到 HA 服务器，全设备共享。</div>';
    wrap.innerHTML = `
      <h3>配置备份与恢复</h3>
      ${storeTip}
      <div class="lh-ed-section">
        <button class="lh-ed-btn primary" id="dbExport" type="button">⬇ 导出当前配置为 JSON 文件</button>
        <button class="lh-ed-btn" id="dbCopy" type="button">📋 复制到剪贴板</button>
        <p class="hint">导出的 JSON 可作为备份，或在未装集成的场合手动迁移配置。</p>
      </div>
      <div class="lh-ed-section">
        <button class="lh-ed-btn" id="dbImportBtn" type="button">⬆ 从 JSON 文件导入</button>
        <input type="file" id="dbImportFile" accept="application/json,.json" style="display:none">
      </div>
      <div class="lh-ed-section">
        <button class="lh-ed-btn danger" id="dbReset" type="button">⚠ 重置为模板默认值</button>
        <p class="hint">清除全部自定义配置（服务器模式下会同时清空 /config/lovehome/config.json），恢复到模板。</p>
      </div>
      <div class="lh-ed-section">
        <b>当前配置统计</b>
        <div id="dbStats"></div>
      </div>`;

    $('#dbExport', wrap).onclick = doExport;
    $('#dbCopy', wrap).onclick = () => {
      navigator.clipboard.writeText(JSON.stringify(exportConfig(), null, 2)).then(
        () => toastHint('已复制到剪贴板'),
        () => toastHint('复制失败，请用导出按钮')
      );
    };
    $('#dbImportBtn', wrap).onclick = () => $('#dbImportFile', wrap).click();
    $('#dbImportFile', wrap).onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const v = JSON.parse(r.result);
          if (!v || typeof v !== 'object') throw new Error('不是有效的 JSON 对象');
          importConfigObject(v);
        } catch (err) {
          alert('导入失败: ' + err.message);
        }
      };
      r.readAsText(f);
    };
    $('#dbReset', wrap).onclick = doReset;

    // 统计
    const c = exportConfig();
    $('#dbStats', wrap).innerHTML = `
      <div>房间: <b>${(c.rooms || []).length}</b></div>
      <div>设备: <b>${(c.devices || []).length}</b></div>
      <div>家电: <b>${(c.appliances || []).length}</b></div>
      <div>情景: <b>${(c.scenes || []).length}</b></div>
      <div>概览家人: <b>${((c.config || {}).overview || {}).people ? ((c.config || {}).overview.people).length : 0}</b></div>`;

    return wrap;
  }

  /* ── 导入导出重置的具体实现 ──────────────────────── */
  function doExport() {
    const cfg = exportConfig();
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lovehome-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toastHint('已下载 JSON 文件');
  }

  function doImport() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const v = JSON.parse(r.result);
          importConfigObject(v);
        } catch (err) { alert('导入失败: ' + err.message); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  function importConfigObject(v) {
    if (!v || typeof v !== 'object') { alert('导入失败：不是有效的配置对象'); return; }
    applyConfigObject(v);
    persist();
    toastHint(serverReady ? '导入成功，已保存到 HA 服务器（所有设备生效）' : '导入成功，已保存到本浏览器');
    rerenderEditorTab();
    document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
  }

  async function doReset() {
    if (!confirm('确定要清除所有自定义配置，恢复到模板默认值吗？此操作不可撤销！')) return;
    Store.clear();
    if (serverReady) {
      // 服务器模式下清空服务器配置（写入空对象 = 回到模板默认值）
      const ok = await saveServerConfig({});
      if (!ok) toastHint('服务器配置清除失败，请稍后重试');
    }
    // 重新加载页面才能恢复 lovehome-data.js 里的原始 window.LH
    if (confirm('需要刷新页面才能完全恢复。现在刷新吗？')) {
      location.reload();
    }
  }

  /* ── 工具：提示气泡 ──────────────────────────────── */
  let toastEl = null;
  function toastHint(msg, dur) {
    if (!toastEl) {
      toastEl = el('div', 'lh-ed-toast');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastHint._t);
    toastHint._t = setTimeout(() => toastEl.classList.remove('show'), dur || 2200);
  }

  function genId(prefix, collection) {
    collection = collection || (window.LH.devices || []);
    const exist = new Set(collection.map((d) => d.id));
    let n = collection.length + 1;
    while (exist.has(prefix + n)) n++;
    return prefix + n;
  }

  /* ── 注入编辑器入口（在 lovehome.js 加载完成后） ────────── */
  function injectEntry() {
    // 在设置齿轮 (#fnSet) 旁边加一个「编辑」按钮
    const fnSet = $('#fnSet');
    if (!fnSet) return false;     // 还没出现
    if ($('#fnEdit')) return true;   // 已注入
    const btn = el('button', 'fn-btn',
      '<svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>');
    btn.id = 'fnEdit';
    btn.title = 'LoveHome 可视化编辑器';
    btn.setAttribute('aria-label', '可视化编辑器');
    btn.addEventListener('click', openEditor);
    // 插到 fnSet 前面
    fnSet.parentNode.insertBefore(btn, fnSet);
    return true;
  }

  /* 轮询等 #fnSet 出现（boot 完成后才会注入），最多等 10s */
  function pollInject(tries) {
    if (injectEntry()) return;
    tries = (tries || 0) + 1;
    if (tries > 50) return;   // 放弃（10s）
    setTimeout(() => pollInject(tries), 200);
  }

  /* ══════════════════════════════════════════════════════
   * 初始化
   * 1) 优先从 HA 服务器读配置（装了 LoveHome 集成 → 全设备共享）
   * 2) 服务器不可用 → 退回本浏览器 localStorage
   * 3) 等 lovehome.js boot 完成后触发重绘 + 注入编辑入口
   * ══════════════════════════════════════════════════════ */
  function init() {
    loadServerConfig().then((srv) => {
      let applied = false;
      if (srv) {
        // 服务器有配置 → 直接用（跨设备一致）
        applyConfigObject(srv);
        applied = true;
      } else if (srv === undefined) {
        // 服务器不可用（未装集成）→ 用本浏览器缓存
        applied = applySavedConfig();
      }
      // srv === null → 服务器已连接但没有配置 → 用模板默认值
      if (applied) rerenderWhenReady();
    });
    // 注入编辑入口（轮询等 boot 跑完 #fnSet 出现）
    pollInject();
  }

  /* 等 lovehome.js boot 完成后再触发重绘（boot 会设置 window.LOVEHOME_BOOTED） */
  function rerenderWhenReady() {
    if (window.LOVEHOME_BOOTED) {
      document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
      return;
    }
    document.addEventListener('LOVEHOME_BOOTED', () => {
      document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
    }, { once: true });
    // 兜底：如果事件没等到（比如版本不匹配），30s 后强发一次
    setTimeout(() => document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER')), 30000);
  }

  document.addEventListener('DOMContentLoaded', init);

  /* 暴露少量 API 供外部调试 */
  window.LHEditor = { open: openEditor, close: closeEditor, persist, normalize: normalizeConfig,
    askRoomName, postCreateRoom, createRoomFromPts };

})();

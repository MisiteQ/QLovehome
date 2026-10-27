/* LoveHome · 交互层（无依赖，同源 iframe 直连 HA） */
(function () {
  'use strict';
  const LH = window.LH;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const pad = (n) => String(n).padStart(2, '0');
  const NS = 'http://www.w3.org/2000/svg';

  const state = {
    filter: 'all',
    room: null,
    page: 'home',
    layer: null,
    selDate: new Date(),
    calMonth: new Date(),
    idleTimer: null,
    online: false,
    /* 刚下发滑块值的静默期：这段时间内不拿实体旧值覆盖滑块 */
    holdUntil: 0,
    /* 浮层打开时刻 / 这一次按下是否落在浮层里（判断"点空白处关闭"用） */
    layerAt: 0,
    downInLayer: false,
    otherTimer: null,
    /* 无操作计时：先复位显示状态，再进待机（两个计时器，都从最后一次操作起算） */
    resetTimer: null,
    /* boot() 完成标记：编辑器的 LOVEHOME_RERENDER 必须等 boot 跑完 */
    booted: false
  };

  /* ── HA 会话：同源 iframe 直接取父窗口的 hass，不需要 token ── */
  function hass() {
    try {
      if (window.parent === window) return null;
      return window.parent.document.querySelector('home-assistant')?.hass || null;
    } catch (e) { return null; }
  }
  const live = () => !!(hass() && LH.config.live);
  function st(id) {
    const h = hass();
    return id && h ? h.states[id] || null : null;
  }
  function num(id, fallback) {
    const s = st(id);
    if (!s) return fallback;
    const v = parseFloat(s.state);
    return Number.isFinite(v) ? v : fallback;
  }
  function callService(domain, service, data) {
    const h = hass();
    if (!h) { toast('还没连上 HA'); return; }
    try { h.callService(domain, service, data || {}); }
    catch (e) { toast('下发失败：' + e.message); }
  }
  /* 控制下发：先说「已受理」，成功回读后再刷新；实体状态一直没变就如实提示 */
  /* HA 抛回来的服务错误又长又难读（「无法执行动作 … code=-9999, button.xxx, 名字」），翻成人话 */
  function friendlyErr(msg) {
    const s = String(msg || '');
    if (/-9999|未知错误|unknown error/i.test(s)) return '设备拒绝了这次操作，多半是当前状态不允许';
    if (/unavailable|不可用|not available/i.test(s)) return '设备当前离线，命令没发出去';
    if (/timeout|超时/i.test(s)) return '设备没响应，过一会儿再试';
    return s.replace(/\s+/g, ' ').slice(0, 48);
  }

  function sendControl(domain, service, data, label) {
    const h = hass();
    if (!h) { toast('还没连上 HA'); return; }
    const ent = (data || {}).entity_id;
    const before = ent ? st(ent) : null;
    let p = null;
    try { p = h.callService(domain, service, data || {}); }
    catch (e) { toast('下发失败 · ' + friendlyErr(e.message)); return; }
    const settle = () => {
      setTimeout(() => { paintMarkers(); paintGlow(); refreshRoom(); refreshControl(); }, 800);
      if (!before) return;
      setTimeout(() => {
        const now = st(ent);
        if (!now) return;
        const same = now.state === before.state &&
          JSON.stringify(now.attributes || {}) === JSON.stringify(before.attributes || {});
        if (same) toast(label + ' · 未观察到状态变化，执行结果未知');
      }, 5000);
    };
    if (p && typeof p.then === 'function') {
      toast(label + ' · 已受理');
      p.then(settle).catch((e) => toast('下发失败 · ' + friendlyErr((e && e.message) || '服务未响应')));
    } else {
      toast(label + ' · 已下发');
      settle();
    }
  }

  /* ── 定时 / 倒计时（v192）─────────────────────────────────────────
     米家的定时跑在云端（App 里的「智能场景」），HA 侧一个实体都没有 ——
     全量 775 个实体里只有浴霸有本地「关机延时」。所以这里自己实现：
     选方向（关 / 开）→ 选时长 → 记结束时间戳 → 到点调 turn_off / turn_on。
     时间戳存 localStorage，刷新能续上；页面关太久（过期超过 60s）的任务直接丢弃，
     免得隔天开面板突然把设备关掉。
     这张卡是**自动追加**的：凡 d.entity 能 turn_on/off 的设备（灯 / 插排 / 通断器 /
     风扇 / 浴霸 / 空调 / 洗衣机 …）都会带，不用在 gen 脚本里逐个配。 */
  const TKEY = 'lhTimers';
  const TDOMS = ['switch', 'light', 'fan', 'cover', 'media_player', 'climate',
                 'water_heater', 'humidifier', 'siren', 'valve'];
  const TOPTS = [15, 30, 60, 120];
  const THINT = '先选「关 / 开」，再选时长 → 到点自动执行。倒计时存在本机，刷新能续上；' +
                '关页面太久（超过 1 分钟）的过期任务会直接丢弃。';
  function timersOf() {
    try {
      const v = JSON.parse(localStorage.getItem(TKEY) || '{}');
      return (v && typeof v === 'object') ? v : {};
    } catch (e) { return {}; }
  }
  function saveTimers(t) { try { localStorage.setItem(TKEY, JSON.stringify(t)); } catch (e) {} }
  function timerDom(e) { return (e || '').split('.')[0]; }
  function timerOk(d) { return !!d && !!d.entity && TDOMS.indexOf(timerDom(d.entity)) >= 0; }
  function fmtMin(m) {
    return m < 60 ? m + ' 分钟' : (m % 60 ? (m / 60) + ' 小时' : (m / 60) + ' 小时');
  }
  function fmtLeft(ms) {
    const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60);
    return (m ? m + '分' : '') + (s % 60) + '秒';
  }
  function timerStart(e, act, min, name) {
    const t = timersOf();
    t[e] = { end: Date.now() + min * 60000, act: act, n: name || '' };
    saveTimers(t);
    toast((name || '定时') + ' · ' + fmtMin(min) + '后' + (act === 'off' ? '关闭' : '开启'));
    paintTimers();
  }
  function timerCancel(e) {
    const t = timersOf();
    if (!t[e]) return;
    delete t[e]; saveTimers(t);
    toast('已取消定时');
    paintTimers();
  }
  /** 每秒一次：刷新剩余时间，到点下发；已被手动关掉的就顺手清掉 */
  function tickTimers() {
    const t = timersOf(), keys = Object.keys(t);
    if (!keys.length) return;
    const now = Date.now();
    let dirty = false;
    keys.forEach((e) => {
      const it = t[e];
      if (now >= it.end) {
        delete t[e]; dirty = true;
        if (now - it.end > 60000) {
          toast((it.n || e) + ' · 定时任务已过期，已忽略');
          return;
        }
        sendControl(timerDom(e), it.act === 'off' ? 'turn_off' : 'turn_on', { entity_id: e },
          (it.n || '定时') + ' · ' + (it.act === 'off' ? '关闭' : '开启'));
        return;
      }
      const s = st(e);
      /* 目标已经达成（要关但已经关了）→ 清掉，免得白跑一趟还占着显示 */
      if (s && it.act === 'off' && (s.state === 'off' || s.state === 'closed')) {
        delete t[e]; dirty = true;
      }
    });
    if (dirty) saveTimers(t);
    paintTimers();
  }
  function paintTimers() {
    const t = timersOf();
    $$('.trun').forEach((n) => {
      const it = t[n.dataset.e];
      const val = n.querySelector('.tval');
      if (val) val.textContent = it ? fmtLeft(it.end - Date.now()) : '未设置';
      n.classList.toggle('on', !!it);
      $$('.tseg button', n).forEach((b) => b.classList.toggle('on', !!it && b.dataset.act === it.act));
      $$('.topt button', n).forEach((b) => b.classList.toggle('on', !!it));
    });
  }
  /** 弹窗末尾那张卡：一台设备一份，按 d.entity 走 */
  function timerCard(d) {
    if (!timerOk(d)) return null;
    const e = d.entity, t = timersOf()[e];
    const box = el('div', 'timercard');
    box.innerHTML =
      '<div class="tc-t">定时 · 倒计时</div>' +
      '<div class="tc-h">' + THINT + '</div>' +
      '<div class="trun' + (t ? ' on' : '') + '" data-e="' + e + '">' +
        '<div class="tseg">' +
          '<button type="button" data-act="off"' + (t && t.act === 'off' ? ' class="on"' : '') + '>关</button>' +
          '<button type="button" data-act="on"' + (t && t.act === 'on' ? ' class="on"' : '') + '>开</button>' +
        '</div>' +
        '<div class="topt">' + TOPTS.map((m) =>
          '<button type="button" data-min="' + m + '">' + fmtMin(m).replace(/\s/g, '') + '</button>').join('') +
        '</div>' +
        '<b class="tval">' + (t ? fmtLeft(t.end - Date.now()) : '未设置') + '</b>' +
        '<button type="button" class="tcx" title="取消定时">✕</button>' +
      '</div>';
    box.addEventListener('click', (ev) => {
      const run = box.querySelector('.trun');
      const b = ev.target.closest('button');
      if (!b || !run) return;
      if (b.classList.contains('tcx')) { timerCancel(e); return; }
      const cur = timersOf()[e];
      if (b.dataset.act) {
        const act = b.dataset.act;
        if (cur) {                     /* 已经在跑：直接改方向，时间不变 */
          const t2 = timersOf(); t2[e].act = act; saveTimers(t2);
          toast('定时改为到点' + (act === 'off' ? '关闭' : '开启'));
          paintTimers(); return;
        }
        $$('.tseg button', run).forEach((x) => x.classList.toggle('on', x.dataset.act === act));
        return;
      }
      if (b.dataset.min) {
        const onB = run.querySelector('.tseg button.on');
        const act = cur ? cur.act : ((onB && onB.dataset.act) || 'off');
        timerStart(e, act, Number(b.dataset.min), d.name);
      }
    });
    return box;
  }

  /* ── 文案 ── */
  const LABEL = {
    on: '开启', off: '关闭', unavailable: '离线', unknown: '未知', none: '—',
    idle: '待机', playing: '播放中', paused: '暂停', standby: '待机',
    closed: '已收起', open: '已展开', opening: '展开中', closing: '收起中',
    Locked: '已上锁', Unlocked: '已开锁', Jammed: '卡住',
    Idle: '待机', Ringing: '响铃中', Charging: '充电中',
    heating: '加热中', cooling: '制冷中', drying: '除湿中', fan: '送风中',
    sunny: '晴', clear: '晴', 'clear-night': '晴夜', cloudy: '多云', partlycloudy: '局部多云',
    rainy: '有雨', pouring: '大雨', snowy: '有雪', 'snowy-rainy': '雨夹雪',
    fog: '雾', hail: '冰雹', lightning: '雷雨', 'lightning-rainy': '雷阵雨',
    windy: '大风', 'windy-variant': '大风', exceptional: '异常'
  };
  const HVAC = { off: '已关闭', heat: '制热', cool: '制冷', dry: '除湿', fan_only: '送风', auto: '自动', unavailable: '离线', idle: '待机' };
  const PRESET = { none: '无', comfort: '舒适', eco: '节能', boost: '强劲', sleep: '睡眠', away: '离家', home: '在家', activity: '活动', posterior_wash: '臀洗', feminine_wash: '妇洗', air_dry: '烘干', stop: '停止', washing: '冲洗', drying: '烘干' };
  /* 通用翻译：任何 domain 的 select 选项查不到专用表时，退回这里 */
  const ALIAS_MAP = {
    posterior: '臀洗', posterior_wash: '臀洗', 'posterior wash': '臀洗',
    feminine: '妇洗', feminine_wash: '妇洗', 'feminine wash': '妇洗',
    bidet: '妇洗', bidet_wash: '妇洗',
    air_dry: '烘干', 'air dry': '烘干', drying: '烘干',
    wash: '冲洗', washing: '冲洗', stop: '停止',
    idle: '待机', standby: '待机',
    warm: '暖洗', cold: '冷洗',
    auto: '自动', manual: '手动',
    on: '开', off: '关', open: '开', closed: '关', close: '关',
    low: '低', medium: '中', mid: '中', high: '高', max: '最高', min: '最低',
    boost: '强力', eco: '节能', sleep: '睡眠', quiet: '静音', silent: '静音',
    comfort: '舒适', economy: '节能', performance: '强力',
    fan: '送风', cool: '制冷', heat: '制热', dry: '除湿',
    swing: '摆风', 'swing horizontal': '左右摆风', 'swing vertical': '上下摆风', swing_horizontal: '左右摆风', swing_vertical: '上下摆风',
    fresh: '新风', smart: '智能',
    speed_low: '低速', speed_medium: '中速', speed_high: '高速',
    heating_low: '加热低档', heating_high: '加热高档', '加热低挡': '加热低档', '加热高挡': '加热高档',
  };
  /* 各家集成给的值大小写不统一：米家/浴霸全小写，美的 midea_ac_lan 是首字母大写
     （Silent / Low / Medium / High / Full / Off），直接查表会全部落空、按钮变英文。
     所以查表统一降一级到小写再试，仍查不到才原样显示。
     ⚠️ 这里只影响「显示文字」；data-* 里存的始终是实体上报的原始值，下发不会被改坏 */
  const tr = (map, v) => map[v] || map[String(v).toLowerCase()] || v;
  /* 可下发指令的域；不在表里的走「只读详情」弹窗，绝不硬下发 */
  const ACT_DOM = {
    switch: 1, light: 1, climate: 1, cover: 1, media_player: 1, fan: 1, input_boolean: 1,
    humidifier: 1, water_heater: 1, lock: 1, vacuum: 1
  };

  function stateLabel(s) {
    if (!s) return '—';
    const v = s.state;
    return LABEL[v] || v;
  }
  /* ── 设备状态取源：主实体掉了，就看看备用源 ──────────────────────
     有的设备主实体会长期 unavailable，而同设备的另一颗实体还活着：比如某台相机
     的 camera 实体因集成云端取流故障一直 unavailable，可相机本身在线、也在录像，
     同设备的电源开关却一直读得到。fb 就是为这种情况准备的「备用状态源」，按顺序
     取第一个还活着的，只影响显示与图标发不发亮，不改变控制目标。
     返回 { s, fb }：fb 非空表示这次读到的不是主实体。 */
  function devState(d) {
    const s = st(d.entity);
    if (s && s.state !== 'unavailable' && s.state !== 'unknown') return { s, fb: null };
    for (const e of d.fb || []) {
      const f = st(e);
      if (f && f.state !== 'unavailable' && f.state !== 'unknown') return { s: f, fb: e };
    }
    return { s: s || null, fb: null };
  }
  /* 相机域的状态文字：idle 是在线待机，别跟「离线」混了 */
  const CAM_TEXT = { idle: '在线', streaming: '查看中', recording: '录像中' };

  /* ── 晾衣架 / 升降杆的位置 ──
     好太太这台只报三档（spec 2.3 current-position：0 中间、1 最高位、2 最低位），
     xiaomi_miot 把它映射成 50 / 0 / 100 再翻个方向，所以 HA 的 current_position
     只有 0（顶上）、100（到底）、50（**「中间」= 在动或没报准，不是真的 50%**）三种值，
     而且 50 时 HA 还会把 state 推成 open —— 直接念成「已放下 50%」就是撒谎。
     做法：运动态优先，其次两个确定位；报 50 时用上一次到位的记录兜底。 */
  const AIRER_KEY = 'lh.airer.at';
  function airerAt() { try { return localStorage.getItem(AIRER_KEY) || ''; } catch (e) { return ''; } }
  function airerSet(v) { try { if (airerAt() !== v) localStorage.setItem(AIRER_KEY, v); } catch (e) { /* 无痕模式忽略 */ } }
  function coverPos(s) {
    if (!s) return { text: '—' };
    if (s.state === 'unavailable') return { text: '离线' };
    const p = (s.attributes || {}).current_position;
    if (p === 0) { airerSet('up'); return { text: '已升到顶', p }; }
    if (p === 100) { airerSet('down'); return { text: '已放到底', p }; }
    if (s.state === 'opening') return { text: '下降中', p };
    if (s.state === 'closing') return { text: '上升中', p };
    const m = airerAt();
    if (m === 'up') return { text: '已升到顶', p, guess: true };
    if (m === 'down') return { text: '已放到底', p, guess: true };
    return { text: '位置不明', p };
  }
  /* 换个浏览器 / 清了缓存就没了「上次到位」，那格会一直写「位置不明」。
     开机时用一次 history 把最近一次 0 / 100 找回来（7 天，一条实体，量很小）。 */
  let airerSeed = 0;
  function seedAirer() {
    if (airerSeed) return;
    const h = hass();
    if (!h || !h.callApi) return;
    const d = (LH.devices || []).find((x) => x.entity && x.entity.split('.')[0] === 'cover');
    if (!d) return;
    airerSeed = 1;
    const t0 = new Date(Date.now() - 7 * 864e5).toISOString();
    h.callApi('GET', 'history/period/' + t0 + '?filter_entity_id=' + d.entity)
      .then((res) => {
        const rows = (res && res[0]) || [];
        for (let i = rows.length - 1; i >= 0; i--) {
          const p = (rows[i].attributes || {}).current_position;
          if (p === 0) { airerSet('up'); return; }
          if (p === 100) { airerSet('down'); return; }
        }
      })
      .catch(() => { airerSeed = 0; });
  }
  /* 房间面板 / 常驻栏右列那格实时状态 */
  function rvText(d) {
    const { s, fb } = devState(d);
    if (!s) return '—';
    if (fb) return '在线';
    const dom = d.entity.split('.')[0];
    if (dom === 'camera') return CAM_TEXT[s.state] || stateLabel(s);
    if (dom === 'cover') return coverPos(s).text;
    return stateLabel(s);
  }
  function devText(d) {
    /* 复合设备没有"一个状态"可言，标题行给它在 ctl.echo 里声明的那几项摘要 */
    if (d.ctl) return ctlEcho(d);
    const dom = d.entity.split('.')[0];
    if (dom === 'camera') {
      const { s: cs, fb } = devState(d);
      if (!cs) return '—';
      if (fb) return '在线';
      if (cs.state === 'unavailable' || cs.state === 'unknown') return '离线';
      return CAM_TEXT[cs.state] || stateLabel(cs);
    }
    const s = st(d.entity);
    if (!s) return '—';
    const a = s.attributes || {};
    if (dom === 'climate') {
      if (s.state === 'unavailable') return '离线 · 设备未响应';
      const parts = [tr(HVAC, s.state)];
      if (a.current_temperature != null) parts.push(a.current_temperature + '°');
      if (s.state !== 'off' && a.temperature != null) parts.push('设定 ' + a.temperature + '°');
      return parts.join(' · ');
    }
    if (dom === 'cover') return coverPos(s).text;
    if (dom === 'media_player') {
      const t = a.media_title;
      return t ? (stateLabel(s) + ' · ' + t) : stateLabel(s);
    }
    return stateLabel(s);
  }
  function isOn(d) {
    /* 面板 / 门铃 / 门锁这类复合设备是"在线可操作"，不该按开关态画成灰的 */
    if (d.ctl && d.ctl.always) return true;
    const dom = d.entity.split('.')[0];
    /* 相机主实体掉了就看看备用源：相机明明在录像，别算成"关着" */
    if (dom === 'camera') {
      const { s } = devState(d);
      return !!s && s.state !== 'unavailable';
    }
    const s = st(d.entity);
    if (!s) return false;
    if (dom === 'climate') return !['off', 'unavailable', 'unknown'].includes(s.state);    if (dom === 'cover') return s.state !== 'closed' && s.state !== 'unavailable';
    if (dom === 'media_player') return ['playing', 'paused', 'on', 'idle'].includes(s.state);
    return s.state === 'on' || s.state === 'open';
  }

  /* 图标「发亮」的判据 —— 跟 isOn() 是两回事，别合回来：
     isOn 是「开关态」，决定点图标时发「开」还是「关」（晾衣架停在半空也是"开"，
     点一下要收回去）；isGlow 是「这东西正在干活吗」，决定光环亮不亮。
     晾衣架停在 50% 并没在升降，中控面板息着屏也并没在用 —— 都不该发光。
     - 窗帘 / 晾衣架：只有 opening / closing 才算在动
     - 相机：在线就算在干活（idle 是在线待机、streaming 是正被人看、recording 是录像中）。
       早先只认 streaming / recording，结果两台好相机常年不亮，用户以为没在工作；
       真正该灭的只有 unavailable，主实体掉线的靠 fb 兜底
     - 音箱：只有 playing / paused 才算，idle 是待机
     - 复合设备可在 ctl.on 里指定「什么状态算在用」：
       vals＝白名单；not_vals＝黑名单（米家那些状态传感器没有 options，
       只能用「不在闲着列表里就算在用」）；attr＝读属性（热水器的 burning_state） */
  function isGlow(d) {
    if (d.ctl && d.ctl.on) {
      const s = st(d.ctl.on.e);
      if (!s) return false;
      const v = d.ctl.on.attr ? (s.attributes || {})[d.ctl.on.attr] : s.state;
      if (d.ctl.on.vals) return d.ctl.on.vals.map(String).includes(String(v));
      if (d.ctl.on.not_vals) return !d.ctl.on.not_vals.map(String).includes(String(v));
      return false;
    }
    const { s } = devState(d);
    if (!s) return false;
    const dom = d.entity.split('.')[0];
    if (dom === 'cover') return ['opening', 'closing'].includes(s.state);
    if (dom === 'camera') return !['unavailable', 'unknown', 'none'].includes(s.state);
    if (dom === 'media_player') return ['playing', 'paused'].includes(s.state);
    return isOn(d);
  }

  /* ── 农历 ── */
  const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function cnNum(n) {
    if (n <= 10) return CN_NUM[n];
    if (n < 20) return '十' + CN_NUM[n - 10];
    if (n === 20) return '二十';
    if (n < 30) return '廿' + CN_NUM[n - 20];
    return '三十';
  }
  const cnFmt = (() => {
    try { return new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch (e) { return null; }
  })();
  function parseDay(v) {
    if (!v) return 1;
    if (/^\d+$/.test(v)) return parseInt(v, 10);
    const map = { 初一: 1, 初二: 2, 初三: 3, 初四: 4, 初五: 5, 初六: 6, 初七: 7, 初八: 8, 初九: 9, 初十: 10 };
    return map[v] || 1;
  }
  function lunar(d) {
    if (!cnFmt) return { month: '', day: 1, dayLabel: '', yearName: '' };
    const p = cnFmt.formatToParts(d);
    const get = (t) => (p.find((x) => x.type === t) || {}).value || '';
    const month = get('month');
    const day = parseDay(get('day'));
    return { month, day, dayLabel: cnNum(day), yearName: get('yearName'), relatedYear: get('relatedYear') };
  }
  const GAN = '甲乙丙丁戊己庚辛壬癸';
  const ZHI = '子丑寅卯辰巳午未申酉戌亥';
  function ganzhi(year) { return GAN[(year - 4) % 10] + ZHI[(year - 4) % 12]; }
  const WK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* ── 七段数码管时间（左上角 + 待机屏共用）──
     字形直接取自开源字体 **DSEG7 Classic**（keshikan，SIL OFL 1.1）的 Bold Italic 字重：
     把 0-9 和 ':' 的真实轮廓抠成 path 内嵌，不再用参数化的七根棍子拼。
     为什么必须用真轮廓：DSEG 的每一段是"段与段融合后的复合多边形"——横段两端下侧有 45° 大斜切，
     竖段末端斜切后与横段错开，弯折处都有一块专门的斜面；用 segBar/segCol 那种统一几何去拼，
     不管怎么调都只会得到一根根两头尖的菱形棍（就是用户说的"并不是统一的一个长菱形"）。
     坐标：字体 upem=1000，y 已翻成 SVG 方向，字高就是 1000；字形自带 5° 倾斜，所以不再 skewX。 */
  const DSEG_G = {
    '0': 'M162 485L157 490L100 490L136 76L170 45L254 138L229 424ZM90 955L62 924L98 510L156 510L160 515L216 576L191 862ZM185 31L219 0L684 0L713 31L612 124L270 124ZM653 515L658 511L716 511L680 924L646 955L562 862L587 576ZM726 45L754 76L718 490L660 490L656 486L600 425L625 138ZM631 969L597 1000L132 1000L103 969L204 876L546 876Z',
    '1': 'M653 515L658 511L716 511L680 924L646 955L562 862L587 576ZM726 45L754 76L718 490L660 490L656 486L600 425L625 138Z',
    '2': 'M583 438L640 501L573 562L232 562L175 500L243 438ZM90 955L62 924L98 510L156 510L160 515L216 576L191 862ZM185 31L219 0L684 0L713 31L612 124L270 124ZM726 45L754 76L718 490L660 490L656 486L600 425L625 138ZM631 969L597 1000L132 1000L103 969L204 876L546 876Z',
    '3': 'M583 438L640 501L573 562L232 562L175 500L243 438ZM185 31L219 0L684 0L713 31L612 124L270 124ZM653 515L658 511L716 511L680 924L646 955L562 862L587 576ZM726 45L754 76L718 490L660 490L656 486L600 425L625 138ZM631 969L597 1000L132 1000L103 969L204 876L546 876Z',
    '4': 'M583 438L640 501L573 562L232 562L175 500L243 438ZM162 485L157 490L100 490L136 76L170 45L254 138L229 424ZM653 515L658 511L716 511L680 924L646 955L562 862L587 576ZM726 45L754 76L718 490L660 490L656 486L600 425L625 138Z',
    '5': 'M583 438L640 501L573 562L232 562L175 500L243 438ZM162 485L157 490L100 490L136 76L170 45L254 138L229 424ZM185 31L219 0L684 0L713 31L612 124L270 124ZM653 515L658 511L716 511L680 924L646 955L562 862L587 576ZM631 969L597 1000L132 1000L103 969L204 876L546 876Z',
    '6': 'M583 438L640 501L573 562L232 562L175 500L243 438ZM162 485L157 490L100 490L136 76L170 45L254 138L229 424ZM90 955L62 924L98 510L156 510L160 515L216 576L191 862ZM185 31L219 0L684 0L713 31L612 124L270 124ZM653 515L658 511L716 511L680 924L646 955L562 862L587 576ZM631 969L597 1000L132 1000L103 969L204 876L546 876Z',
    '7': 'M162 485L157 490L100 490L136 76L170 45L254 138L229 424ZM185 31L219 0L684 0L713 31L612 124L270 124ZM653 515L658 511L716 511L680 924L646 955L562 862L587 576ZM726 45L754 76L718 490L660 490L656 486L600 425L625 138Z',
    '8': 'M583 438L640 501L573 562L232 562L175 500L243 438ZM162 485L157 490L100 490L136 76L170 45L254 138L229 424ZM90 955L62 924L98 510L156 510L160 515L216 576L191 862ZM185 31L219 0L684 0L713 31L612 124L270 124ZM653 515L658 511L716 511L680 924L646 955L562 862L587 576ZM726 45L754 76L718 490L660 490L656 486L600 425L625 138ZM631 969L597 1000L132 1000L103 969L204 876L546 876Z',
    '9': 'M583 438L640 501L573 562L232 562L175 500L243 438ZM162 485L157 490L100 490L136 76L170 45L254 138L229 424ZM185 31L219 0L684 0L713 31L612 124L270 124ZM653 515L658 511L716 511L680 924L646 955L562 862L587 576ZM726 45L754 76L718 490L660 490L656 486L600 425L625 138ZM631 969L597 1000L132 1000L103 969L204 876L546 876Z',
    ':': 'M180 295L180 319L170 343L154 359L130 369L106 369L82 359L66 343L56 319L56 295L61 283L66 272L74 264L84 255L94 250L103 246L133 246L142 250L152 255L162 264L170 272L175 283ZM144 707L144 731L134 755L118 771L94 781L70 781L46 771L30 755L20 731L20 707L25 695L30 684L38 676L48 666L58 662L67 658L97 658L106 662L116 666L126 676L134 684L139 695Z',
  };
  const DSEG_ADV = { '0': 816, '1': 816, '2': 816, '3': 816, '4': 816, '5': 816, '6': 816, '7': 816, '8': 816, '9': 816, ':': 200 };
  const DSEG_X0 = { '0': 62, '1': 562, '2': 62, '3': 103, '4': 100, '5': 100, '6': 62, '7': 100, '8': 62, '9': 100, ':': 20 };
  const DSEG_X1 = { '0': 754, '1': 754, '2': 754, '3': 754, '4': 754, '5': 716, '6': 716, '7': 754, '8': 754, '9': 754, ':': 180 };
  const DSEG_TRACK = 700;        // 数字字距（字体原生 816；压到 700 是"不粘连"的下限，再紧字与字就贴住）
  const DSEG_COLON = 160;        // 冒号字距（原生 200）
  /* t 形如 "12:21:09"，返回一段 svg。宽度按字符数自动，CSS 只给高度。
     整串按**实际字形范围**归一化：DSEG 的字形在自己的字框里居中，而「1」只占右半边
     （七段管只有 b/c 两段），直接排下来左边会空出一大块，跟下面那行日期对不齐。
     取所有字形的最小 x 当 viewBox 左边界，最左的墨迹就贴住容器的左边缘。 */
  function segClockSvg(t) {
    const parts = [];
    let x = 0, minX = Infinity, maxX = -Infinity;
    for (const ch of String(t)) {
      const d = DSEG_G[ch];
      if (!d) continue;
      const adv = ch === ':' ? DSEG_COLON : DSEG_TRACK;
      const shift = (adv - DSEG_ADV[ch]) / 2;   // 压紧字距后，字形要按新字框重新居中
      parts.push({ d: d, dx: x + shift });
      minX = Math.min(minX, x + shift + DSEG_X0[ch]);
      maxX = Math.max(maxX, x + shift + DSEG_X1[ch]);
      x += adv;
    }
    if (!parts.length) return '';
    return `<svg viewBox="${Math.floor(minX)} 0 ${Math.ceil(maxX - minX)} 1000" ` +
      `preserveAspectRatio="xMinYMid meet" role="img" aria-hidden="true">` +
      `<g fill="currentColor" fill-rule="evenodd">` +
      parts.map((p) => `<path d="${p.d}" transform="translate(${p.dx.toFixed(1)} 0)"/>`).join('') +
      '</g></svg>';
  }
  /* 同一套字形给顶栏的天气 / 用电数字用。DSEG7 只抠了 0-9 和 ':'，
     小数点 / 减号 / 度数是自己按同笔画粗细补的（横段 104 单位、字高 1000），
     免得一个数字串里忽然混回普通字体。'.' 贴基线、'-' 在腰线、'°' 在顶部。
     ° 的原字框 x 是 274~526（adv 460），排在数字后面会空出 220 单位（≈0.22em），
     34px 下有 7~8px 的空隙，看着像「18 °」两个东西；整体左移 90 单位收到 ~130 单位。 */
  const DSEG_X = {
    '.': { d: 'M338 882L472 882L472 1000L338 1000Z', adv: 430, x0: 338, x1: 472 },
    '-': { d: 'M170 452L646 452L646 556L170 556Z', adv: 660, x0: 170, x1: 646 },
    '°': { d: 'M310 36A126 126 0 1 0 310.2 36ZM310 108A58 58 0 1 1 309.8 108Z', adv: 370, x0: 184, x1: 436 },
  };
  /** 任意数字串 → DSEG SVG。不支持的字符直接跳过（单位、% 这类交给普通文字）。 */
  function dsegNum(v) {
    const parts = [];
    let x = 0, minX = Infinity, maxX = -Infinity;
    for (const ch of String(v == null ? '' : v)) {
      const g = DSEG_G[ch];
      const ex = DSEG_X[ch];
      if (!g && !ex) continue;
      const d = g || ex.d;
      const adv = g ? (ch === ':' ? DSEG_COLON : DSEG_TRACK) : ex.adv;
      const x0 = g ? DSEG_X0[ch] : ex.x0;
      const x1 = g ? DSEG_X1[ch] : ex.x1;
      const shift = g ? (adv - DSEG_ADV[ch]) / 2 : 0;
      parts.push({ d: d, dx: x + shift });
      minX = Math.min(minX, x + shift + x0);
      maxX = Math.max(maxX, x + shift + x1);
      x += adv;
    }
    if (!parts.length) return '';
    return `<svg class="dsg" viewBox="${Math.floor(minX)} 0 ${Math.ceil(maxX - minX)} 1000"` +
      ` preserveAspectRatio="xMinYMid meet" role="img" aria-hidden="true">` +
      `<g fill="currentColor" fill-rule="evenodd">` +
      parts.map((p) => `<path d="${p.d}" transform="translate(${p.dx.toFixed(1)} 0)"/>`).join('') +
      '</g></svg>';
  }

  /* 左栏（全屋 + 房间两块卡）和左下角小条的宽度，都跟着顶栏那行日期走：
     三者左边界都是 10，右边界停在「农历…」的右边（季节小徽标不算，那是附加标签），
     也就是用户画的那条红线的位置。日期文字长短会变（月份、农历廿九/初一），所以运行时量，不能写死。 */
  function syncSideW() {
    const sc = $('#screen');
    const st = $('.stage');
    const anchor = $('#lunar') || $('.dateline');
    if (!sc || !st || !anchor) return;
    const padL = parseFloat(getComputedStyle(st).paddingLeft) || 10;
    const w = Math.round(anchor.getBoundingClientRect().right - padL);
    if (w > 0) sc.style.setProperty('--sidew', Math.max(150, w) + 'px');
  }

  function paintClock() {
    const now = new Date();
    const t = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    const l = lunar(now);
    /* 每秒都会进来一次：只在字符串变了才重画 SVG，免得每秒都重排整棵子树 */
    [['#clock', '当前时间 '], ['#sbClock', '待机时间 ']].forEach(([sel, aria]) => {
      const el = $(sel);
      if (!el) return;
      el.setAttribute('aria-label', aria + t);
      if (el.dataset.led !== t) {
        el.innerHTML = segClockSvg(t);
        el.dataset.led = t;
      }
    });
    const dateTxt = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${WK[now.getDay()]}`;
    const lunarTxt = `农历${l.month}${l.dayLabel}`;
    /* 日期行文字变了才重新量左栏宽度（getBoundingClientRect 会强制同步布局，别每秒都调） */
    const dlKey = dateTxt + lunarTxt;
    if (state.dlKey !== dlKey) {
      state.dlKey = dlKey;
      $('#date').textContent = dateTxt;
      $('#lunar').textContent = lunarTxt;
      paintSeasonTag();   // 真实季节跟着日历走，跟配色无关
      syncSideW();
    }
    $('#sbDate').textContent = dateTxt;
    $('#sbLunar').textContent = `${ganzhi(now.getFullYear())}年 · 农历${l.month}${l.dayLabel}`;
  }

  /* ── 户型 ── */
  const ROOM_GAP = 6;
  const ICON = {
    // 基础
    light: 'i-bulb', ac: 'i-snow', heat: 'i-heat', fresh: 'i-wind', fan: 'i-fan',
    plug: 'i-plug', media: 'i-media', cover: 'i-cover', lock: 'i-lock',
    cam: 'i-cam', toilet: 'i-toilet', appliance: 'i-washer', hub: 'i-hub', sensor: 'i-wave',
    heater: 'i-tap', cook: 'i-pot', flame: 'i-flame',
    panel: 'i-panel', bell: 'i-bell',
    // 清洁
    vacuum: 'i-vacuum', purifier: 'i-purifier', humidifier: 'i-humidifier', leak: 'i-leak',
    // 厨电
    airfry: 'i-airfry', oven: 'i-oven', fridge: 'i-fridge', water_dispenser: 'i-water', wine: 'i-wine',
    // 娱乐
    speaker: 'i-speaker', projector: 'i-projector',
    // 环境
    plant: 'i-plant', pet: 'i-pet', bed: 'i-bed', presence: 'i-presence',
    // 安防
    siren: 'i-siren',
  };
  const GLOW_KINDS = { light: 1 };
  const markers = () => LH.devices.filter((d) => d.x != null);

  /** 多边形转圆角路径：每个顶点按两侧边长取内切半径，用二次贝塞尔倒角。 */
  function roundPath(points, r) {
    const p = (typeof points === 'string'
      ? points.split(' ').map((s) => s.split(',').map(Number))
      : points);
    const n = p.length;
    let d = '';
    for (let i = 0; i < n; i++) {
      const cur = p[i];
      const pv = p[(i - 1 + n) % n];
      const nx = p[(i + 1) % n];
      const v1 = [pv[0] - cur[0], pv[1] - cur[1]];
      const v2 = [nx[0] - cur[0], nx[1] - cur[1]];
      const l1 = Math.hypot(v1[0], v1[1]) || 1;
      const l2 = Math.hypot(v2[0], v2[1]) || 1;
      const rr = Math.min(r, l1 / 2.2, l2 / 2.2);
      const a = [cur[0] + v1[0] / l1 * rr, cur[1] + v1[1] / l1 * rr];
      const b = [cur[0] + v2[0] / l2 * rr, cur[1] + v2[1] / l2 * rr];
      d += (i === 0 ? 'M' : 'L') + a[0].toFixed(1) + ' ' + a[1].toFixed(1);
      d += 'Q' + cur[0].toFixed(1) + ' ' + cur[1].toFixed(1) + ' ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1);
    }
    return d + 'Z';
  }

  let planVB = null; // { std, real }：扁平/现实两套 viewBox，皮肤切换时换用（现实风外框更大）

  /* ── 户型几何：外轮廓 / 墙体都按「用户画出来的房间」实时算 ──
     模板里写死的 outline/walls 只对示例户型成立，用户自己画完房间后要对得上，
     所以这里做三件事：取所有房间顶点 → 凸包 → 沿质心外扩一点 → 用二次曲线连成圆润的闭合轮廓。
     编辑器（lovehome-editor.js）复用同一套，保证「画的时候看到的框」=「主界面的框」。 */
  function roomPoints() {
    const out = [];
    (LH.rooms || []).forEach((r) => {
      if (!r.pts) return;
      String(r.pts).split(' ').forEach((s) => {
        const p = s.split(',').map(Number);
        if (isFinite(p[0]) && isFinite(p[1])) out.push(p);
      });
    });
    return out;
  }

  function convexHull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return null;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const q of p) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
      lower.push(q);
    }
    const upper = [];
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
      upper.push(q);
    }
    lower.pop(); upper.pop();
    const h = lower.concat(upper);
    return h.length >= 3 ? h : null;
  }

  function inflate(pts, pad) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return pts.map(([x, y]) => {
      const dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return [Math.round((x + (dx / len) * pad) * 10) / 10,
              Math.round((y + (dy / len) * pad) * 10) / 10];
    });
  }

  /* 平滑闭合曲线：每个顶点用二次贝塞尔，控制点取顶点、端点取相邻中点 */
  function smoothClosedPath(pts) {
    if (!pts || pts.length < 3) return '';
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let d = '';
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const m1 = mid(prev, p);
      const m2 = mid(p, next);
      if (i === 0) d += 'M' + m1[0].toFixed(1) + ',' + m1[1].toFixed(1);
      d += 'Q' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ' ' + m2[0].toFixed(1) + ',' + m2[1].toFixed(1);
    }
    return d + 'Z';
  }

  /* 解析 "x,y x,y …"（也兼容数组）→ [[x,y], …] */
  function parsePoly(p) {
    if (!p) return [];
    const s = typeof p === 'string' ? p
      : (Array.isArray(p) ? p.map((q) => q.join(',')).join(' ') : '');
    return s.split(' ').map((t) => t.split(',').map(Number))
      .filter((q) => isFinite(q[0]) && isFinite(q[1]));
  }

  /* Ramer–Douglas–Peucker：把 marching squares 出来的锯齿点列简化 */
  function rdp(pts, tol) {
    if (pts.length < 4) return pts;
    const sq = tol * tol;
    const dist2 = (p, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      if (!l2) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
      let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
    };
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop();
      let best = -1, bestD = sq;
      for (let k = i + 1; k < j; k++) {
        const d = dist2(pts[k], pts[i], pts[j]);
        if (d > bestD) { bestD = d; best = k; }
      }
      if (best > 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
    }
    return pts.filter((p, i) => keep[i]);
  }

  /* Chaikin 切角：折线 → 圆滑曲线（闭合点列） */
  function chaikin(pts, iter) {
    let cur = pts;
    for (let n = 0; n < (iter == null ? 2 : iter); n++) {
      const out = [];
      for (let i = 0; i < cur.length; i++) {
        const a = cur[i], b = cur[(i + 1) % cur.length];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      cur = out;
    }
    return cur;
  }

  /* 自动外轮廓（贴合墙体、支持凹口）：
       房间栅格化 → 向外膨胀 pad → marching squares 提边界 → 简化 + 切角平滑。
     所以 L 形 / 错层 / 缺角的户型，虚线会跟着墙折弯，而不是凸包套一个大圈。
     v246：多个房间相距较远时，一次膨胀可能出多个小环 —— 这时把 pad 翻倍重试，
     直到只剩一个统一大轮廓（或 pad 超上限），让虚线一次性包住整个户型。 */
  /* 扫描线填充：对**每个多边形单独**跑扫描线，然后 OR 到同一个 grid。
     这样两矩形重叠时：bigRect 先填 100~300，smallRect 再填 250~400，
     合起来就是 100~400 一整段。之前把所有多边形的交点合在一起排序，
     会导致 [100,250,300,400] 被配对成 (100,250)(300,400)，
     中间 250~300 漏掉，marching squares 在缺口处串出斜边 → 三角 / 梯形 / 歪形。
     左端点 floor、右端点 ceil-1，不留 gap。 */
  function scanlineFill(grid, polys, gw, gh, x0, y0, cell) {
    for (const poly of polys) {
      for (let row = 0; row < gh; row++) {
        const y = y0 + (row + 0.5) * cell;
        const xs = [];
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length];
          if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
            if (Math.abs(b[1] - a[1]) < 1e-6) continue;
            xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
          }
        }
        xs.sort((m, n) => m - n);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          let c1 = Math.floor((xs[k] - x0) / cell);
          let c2 = Math.ceil((xs[k + 1] - x0) / cell) - 1;
          if (c2 < 0 || c1 >= gw) continue;
          c1 = Math.max(0, c1); c2 = Math.min(gw - 1, c2);
          for (let c = c1; c <= c2; c++) grid[row * gw + c] = 1;
        }
      }
    }
  }

  function autoOutlineLoops(pad) {
    if (LH.plan && LH.plan.autoFrame === false) return null;
    const polys = (LH.rooms || []).map((r) => parsePoly(r.pts)).filter((p) => p.length >= 3);
    if (!polys.length) return null;

    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    polys.forEach((p) => p.forEach(([x, y]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }));

    const INITIAL_PAD = pad == null ? 18 : pad;
    const MAX_PAD = 220;
    let padOut = INITIAL_PAD;
    let loops = null;

    const MAX_TRIES = 5;
    let finalCell = 6;
    for (let tryNo = 0; tryNo < MAX_TRIES; tryNo++) {
      let cell = 6;
      const spanW = maxX - minX + padOut * 2 + 16;
      const spanH = maxY - minY + padOut * 2 + 16;
      if ((spanW / cell) * (spanH / cell) > 60000) {
        cell = Math.sqrt((spanW * spanH) / 60000);
      }
      finalCell = cell;
      const x0 = minX - padOut - cell * 2;
      const y0 = minY - padOut - cell * 2;
      const gw = Math.ceil(spanW / cell) + 4;
      const gh = Math.ceil(spanH / cell) + 4;
      if (gw < 4 || gh < 4) return null;

      const grid = new Uint8Array(gw * gh);
      scanlineFill(grid, polys, gw, gh, x0, y0, cell);

      /* 圆形核膨胀 padOut */
      const R = Math.max(1, Math.ceil(padOut / cell));
      const out = new Uint8Array(gw * gh);
      const r2 = R * R;
      for (let row = 0; row < gh; row++) {
        for (let col = 0; col < gw; col++) {
          if (!grid[row * gw + col]) continue;
          for (let dy = -R; dy <= R; dy++) {
            const rr = row + dy;
            if (rr < 0 || rr >= gh) continue;
            for (let dx = -R; dx <= R; dx++) {
              const cc = col + dx;
              if (cc < 0 || cc >= gw || dx * dx + dy * dy > r2) continue;
              out[rr * gw + cc] = 1;
            }
          }
        }
      }

      const segs = marchingSquaresSegs(out, gw, gh, x0, y0, cell);
      if (!segs.length) return null;
      loops = traceLoops(segs);

      if (loops.length === 1) break;
      if (loops.length === 0) return null;
      if (padOut >= MAX_PAD) break;
      padOut = Math.min(MAX_PAD, padOut * 2);
    }

    if (!loops || !loops.length) return null;
    if (loops.length > 1) {
      const areaOf = (l) => {
        let a = 0;
        for (let i = 0; i < l.length; i++) {
          const p1 = l[i], p2 = l[(i + 1) % l.length];
          a += p1[0] * p2[1] - p2[0] * p1[1];
        }
        return Math.abs(a) / 2;
      };
      loops = [loops.reduce((best, l) => areaOf(l) > areaOf(best) ? l : best, loops[0])];
    }

    return loops.map((loop) => {
      const closed = loop.concat([loop[0]]);
      const simp = rdp(closed, Math.max(1.2, finalCell * 0.5));
      if (simp.length > 1) simp.pop();
      return chaikin(simp, 2).map((p) =>
        [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
    });
  }

  /* marching squares：case 7 / case 14 是对角 2x2 格的歧义 case，
     正确做法是返回两段（像 case 5/10 那样），但要避免自我相交。
     这里用"如果歧义，走默认水平/垂直"策略（避免出现斜边串进外轮廓）。 */
  function marchingSquaresSegs(out, gw, gh, x0, y0, cell) {
    const segs = [];
    for (let row = 0; row < gh - 1; row++) {
      for (let col = 0; col < gw - 1; col++) {
        const b = (out[row * gw + col] ? 1 : 0)
          | (out[row * gw + col + 1] ? 2 : 0)
          | (out[(row + 1) * gw + col + 1] ? 4 : 0)
          | (out[(row + 1) * gw + col] ? 8 : 0);
        if (b === 0 || b === 15) continue;
        const cx = x0 + (col + 0.5) * cell, cy = y0 + (row + 0.5) * cell;
        const T = [cx, y0 + row * cell], Rg = [x0 + (col + 1) * cell, cy];
        const Bt = [cx, y0 + (row + 1) * cell], L = [x0 + col * cell, cy];
        switch (b) {
          case 1:  segs.push([L, T]); break;
          case 2:  segs.push([T, Rg]); break;
          case 3:  segs.push([L, Rg]); break;
          case 4:  segs.push([Rg, Bt]); break;
          case 5:  segs.push([L, T], [Rg, Bt]); break;
          case 6:  segs.push([T, Bt]); break;
          case 7:  segs.push([L, Bt]); break;
          case 8:  segs.push([Bt, L]); break;
          case 9:  segs.push([T, Bt]); break;
          case 10: segs.push([T, Rg], [Bt, L]); break;
          case 11: segs.push([Rg, Bt]); break;
          case 12: segs.push([Rg, L]); break;
          case 13: segs.push([T, Rg]); break;
          case 14: segs.push([L, T]); break;
          default: break;
        }
      }
    }
    return segs;
  }

  /* 串环：marching squares 输出的 seg 方向是任意的（case 表里每个 seg 的 a→b 方向不一定首尾相连）。
     所以不能假设"下一条 seg 的起点 = 当前 seg 的终点"。
     正确做法：每个 seg 存两个方向到 byEnd：端点 → [{seg, 从这个端点出发应走向另一个端点}]。
     串环时不管 seg 原始方向，只要端点接上就能串。单个矩形 200 条 seg → 完美串成 1 个闭合环。 */
  function traceLoops(segs) {
    const key = (p) => p[0].toFixed(2) + ',' + p[1].toFixed(2);
    const byEnd = new Map();   // key(端点) → [{seg, from, to}]，每个 seg 存正向+反向
    segs.forEach(([a, b], i) => {
      const ka = key(a), kb = key(b);
      if (!byEnd.has(ka)) byEnd.set(ka, []);
      if (!byEnd.has(kb)) byEnd.set(kb, []);
      byEnd.get(ka).push({ a, b, i, from: a, to: b });
      byEnd.get(kb).push({ a, b, i, from: b, to: a });
    });
    const used = new Set();
    const loops = [];
    for (let si = 0; si < segs.length; si++) {
      if (used.has(si)) continue;
      used.add(si);
      const [a0, b0] = segs[si];
      const loop = [a0, b0];
      let cur = b0;
      let guard = 0;
      while (guard++ < segs.length + 8) {
        if (key(cur) === key(a0)) break;      // 回到起点 = 闭环
        const cands = byEnd.get(key(cur)) || [];
        const next = cands.find((s) => !used.has(s.i));
        if (!next) break;                      // 端点没有未消耗的 seg = 断了
        used.add(next.i);
        cur = next.to;
        loop.push(cur);
      }
      // 如果断了（没回到 a0），但回到了某个已经在 loop 里的点——说明有 self-loop，跳过
      if (loop.length >= 12) loops.push(loop);
    }
    return loops.filter((l) => {
      let a = 0;
      for (let i = 0; i < l.length; i++) {
        const p1 = l[i], p2 = l[(i + 1) % l.length];
        a += p1[0] * p2[1] - p2[0] * p1[1];
      }
      return Math.abs(a) / 2 > 100;
    });
  }

  /* 多个多边形做并集：栅格 → Marching Squares → 一条闭合环。
     起点 pad=0（严格贴合原始边界）；如果两房间是分离的，marching squares 会出多条环，
     这时候逐步加大 pad 把它们粘起来（上限 40，再大就形状夸张了）。 */
  function unionPolys(polys, padHint) {
    const valid = (polys || []).filter((p) => Array.isArray(p) && p.length >= 3);
    if (!valid.length) return null;
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    valid.forEach((p) => p.forEach(([x, y]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }));
    let padOut = padHint != null ? padHint : 0;
    const MAX_PAD = 40;
    let finalLoop = null, finalCell = 4;

    for (let tryNo = 0; tryNo < 6; tryNo++) {
      let cell = 4;
      const spanW = maxX - minX + padOut * 2 + 24;
      const spanH = maxY - minY + padOut * 2 + 24;
      if ((spanW / cell) * (spanH / cell) > 25000) {
        cell = Math.sqrt((spanW * spanH) / 25000);
      }
      finalCell = cell;
      const x0 = minX - padOut - cell * 2, y0 = minY - padOut - cell * 2;
      const gw = Math.ceil(spanW / cell) + 4, gh = Math.ceil(spanH / cell) + 4;
      if (gw < 4 || gh < 4) return null;

      const grid = new Uint8Array(gw * gh);
      scanlineFill(grid, valid, gw, gh, x0, y0, cell);
      if (padOut > 0) {
        const R = Math.max(1, Math.ceil(padOut / cell));
        const out = new Uint8Array(gw * gh);
        const r2 = R * R;
        for (let row = 0; row < gh; row++) {
          for (let col = 0; col < gw; col++) {
            if (!grid[row * gw + col]) continue;
            for (let dy = -R; dy <= R; dy++) {
              const rr = row + dy;
              if (rr < 0 || rr >= gh) continue;
              for (let dx = -R; dx <= R; dx++) {
                const cc = col + dx;
                if (cc < 0 || cc >= gw || dx * dx + dy * dy > r2) continue;
                out[rr * gw + cc] = 1;
              }
            }
          }
        }
        for (let i = 0; i < out.length; i++) grid[i] = out[i];
      }

      const segs = marchingSquaresSegs(grid, gw, gh, x0, y0, cell);
      if (!segs.length) return null;
      const loops = traceLoops(segs);

      if (loops.length === 1) { finalLoop = loops[0]; break; }
      if (loops.length === 0) return null;
      if (padOut >= MAX_PAD) { finalLoop = loops.reduce((best, l) => l.length > best.length ? l : best, loops[0]); break; }
      padOut = Math.min(MAX_PAD, padOut + 4);
    }

    if (!finalLoop) return null;

    const closed = finalLoop.concat([finalLoop[0]]);
    /* rdp eps 不能太大 — traceLoops 串出来的 loop 锯齿振幅约 cell/2，
       eps 超过 cell 会把整个锯齿简化成几条直线，损失边界精度 */
    const simp = rdp(closed, Math.min(1.2, finalCell * 0.4));
    if (simp.length > 1) simp.pop();
    return chaikin(simp, 1).map((p) =>
      [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  }

  /* 点列 → path */
  function loopPath(pts) {
    if (!pts || pts.length < 3) return '';
    let d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (let i = 1; i < pts.length; i++) d += 'L' + pts[i][0] + ',' + pts[i][1];
    return d + 'Z';
  }

  window.LHGeo = { roomPoints, convexHull, inflate, smoothClosedPath, autoOutlineLoops, chaikin, rdp, loopPath, parsePoly, unionPolys };

  /* 把鼠标事件坐标转换成 SVG viewBox 坐标系中的点 */
  function svgPoint(svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const r = pt.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  }

  function buildPlan() {
    const { w, h } = LH.plan;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('class', 'plan');

    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML =
      '<radialGradient id="glow"><stop offset="0%" stop-color="#e7bd79" stop-opacity=".30"/><stop offset="52%" stop-color="#e7bd79" stop-opacity=".10"/><stop offset="100%" stop-color="#e7bd79" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="halo"><stop offset="0%" stop-color="#ffcf8e" stop-opacity=".62"/><stop offset="46%" stop-color="#e7bd79" stop-opacity=".24"/><stop offset="100%" stop-color="#e7bd79" stop-opacity="0"/></radialGradient>' +
      '<pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<line x1="0" y1="0" x2="0" y2="10" stroke="rgba(236,239,244,.085)" stroke-width="1.2"/></pattern>';
    svg.append(defs);

    /* 现实风格底板：铺在最底层，默认 display:none，
       由 CSS（.screen[data-skin=real]）负责显示/隐藏 —— 常规扁平皮肤完全不加载绘制 */
    if (LH.plan.photo) {
      const p = LH.plan.photo;
      const ph = document.createElementNS(NS, 'image');
      ph.setAttribute('x', p.x);
      ph.setAttribute('y', p.y);
      ph.setAttribute('width', p.w);
      ph.setAttribute('height', p.h);
      ph.setAttribute('href', p.src);
      ph.setAttribute('preserveAspectRatio', 'none');
      ph.setAttribute('class', 'plan-photo');
      svg.append(ph);
    }

    // 底纹与虚线外框：沿户型真实外轮廓走，既包住全部墙体也不会交叉
    /* 没有房间时 autoOutlineLoops 返回 null —— 不再 fallback 到模板里写死的 plan.outline
       （那是原始户型的坐标，用户删了房间之后不该再露出来）。
       改用 plan.w / plan.h 画一个默认正方形占位框。 */
    const autoLoops = LH.rooms.length ? autoOutlineLoops(20) : null;
    let ringPts;
    if (autoLoops) {
      ringPts = autoLoops.reduce((a, l) => a.concat(l), []);
    } else if (LH.rooms.length === 0) {
      ringPts = [[0, 0], [LH.plan.w, 0], [LH.plan.w, LH.plan.h], [0, LH.plan.h]];
    } else {
      ringPts = LH.plan.outline ? parsePoly(LH.plan.outline) : [];
    }
    const rb = ringPts.length
      ? ringPts.reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y),
        Math.max(a[2], x), Math.max(a[3], y)], [1e9, 1e9, -1e9, -1e9])
      : [0, 0, LH.plan.w, LH.plan.h];
    const PX = 2, PT = 5, PB = 4;
    const vbStd = `${rb[0] - PX} ${rb[1] - PT} ${rb[2] - rb[0] + PX * 2} ${rb[3] - rb[1] + PT + PB}`;
    svg.setAttribute('viewBox', vbStd);
    planVB = { std: vbStd, real: null };

    const ringD = autoLoops
      ? autoLoops.map(loopPath).join(' ')
      : ringPts.length ? roundPath(ringPts.map((p) => p.join(',')).join(' '), 16) : '';

    if (ringD) {
      const cp = document.createElementNS(NS, 'clipPath');
      cp.setAttribute('id', 'planclip');
      const cpp = document.createElementNS(NS, 'path');
      cpp.setAttribute('d', ringD);
      cp.append(cpp);
      defs.append(cp);
    }

    const hatch = document.createElementNS(NS, 'rect');
    hatch.setAttribute('x', rb[0]);
    hatch.setAttribute('y', rb[1]);
    hatch.setAttribute('width', rb[2] - rb[0]);
    hatch.setAttribute('height', rb[3] - rb[1]);
    hatch.setAttribute('fill', 'url(#hatch)');
    hatch.setAttribute('class', 'plan-hatch');
    if (ringD) hatch.setAttribute('clip-path', 'url(#planclip)');
    svg.append(hatch);

    if (ringD) {
      const frame = document.createElementNS(NS, 'path');
      frame.setAttribute('d', ringD);
      frame.setAttribute('class', 'plan-dash');
      svg.append(frame);
    }

    /* 现实风的虚线：沿底图外框单独画一条，扁平/现实二选一。
       关键：现实风 viewBox 必须和扁平风用**同一个坐标系**（rb 即 autoLoops / rooms 的 bbox），
       只加宽一点 padding 让照片完整露出来。以前用 photo.outline 的 bbox ——
       那是模板写死的一套坐标，用户一编辑户型，rooms 坐标系就和它错开了，
       切过去后整个户型图就会被挤到右上角或炸成三角。 */
    if (LH.plan.photo && LH.plan.photo.outline) {
      const pdp = document.createElementNS(NS, 'path');
      pdp.setAttribute('d', roundPath(LH.plan.photo.outline, 14));
      pdp.setAttribute('class', 'plan-dash plan-dash-photo');
      svg.append(pdp);
      /* real 和 std 同一个 rb，只每边多留 24 的呼吸位（照片描点一般比 room 外扩大一圈），
         如果 photo.outline 的 bbox 真比 rb 大（罕见），用两者的 max，保证不裁照片 */
      const pp = LH.plan.photo.outline.split(' ').map((s) => s.split(',').map(Number));
      const pb = pp.reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y),
        Math.max(a[2], x), Math.max(a[3], y)], [1e9, 1e9, -1e9, -1e9]);
      const mix = [Math.min(rb[0], pb[0]), Math.min(rb[1], pb[1]),
                   Math.max(rb[2], pb[2]), Math.max(rb[3], pb[3])];
      const PXR = 24, PTR = 24, PBR = 28;
      planVB.real = `${mix[0] - PXR} ${mix[1] - PTR} ${mix[2] - mix[0] + PXR * 2} ${mix[3] - mix[1] + PTR + PBR}`;
    }

    const TONE = { living: 't-warm', master: 't-warm', masterwc: 't-cool', guestwc: 't-cool', balcony: 't-cool' };

    /* 自动墙体：把所有房间 union 成整体形状，向外扩 wallW 得到墙带外边界；
       内边界直接用每个房间的原始轮廓（不 union，避免栅格化误差导致的缝隙）；
       fill-rule=evenodd 精确扣掉每个房间 → 得到无缝的灰色墙带。 */
    if (LH.plan.autoFrame !== false && LH.rooms.length) {
      const R = LH.plan.wallW || 3;
      const polys = LH.rooms.filter(r => r.pts).map(r => LHGeo.parsePoly(r.pts));
      if (polys.length >= 1) {
        const unionOuter = LHGeo.unionPolys(polys, R);
        if (unionOuter) {
          // 外边界：union 扩展后的整体轮廓（先 chaikin 圆滑，再 roundPath 倒角）
          const smoothOuter = LHGeo.chaikin(unionOuter, 2);
          let d = roundPath(smoothOuter, 16);
          // 内边界：每个房间自己的原始轮廓（不 union，零栅格误差）
          LH.rooms.forEach((r) => {
            if (r.pts) d += ' ' + roundPath(r.pts, 11);
          });
          const wallPath = document.createElementNS(NS, 'path');
          wallPath.setAttribute('d', d);
          wallPath.setAttribute('class', 'plan-wall-auto');
          wallPath.setAttribute('fill-rule', 'evenodd');
          svg.append(wallPath);
        }
      }
    }

    // 房间色块 + 光晕
    LH.rooms.forEach((r) => {
      const b = bbox(r.pts);
      const g = document.createElementNS(NS, 'g');
      g.dataset.room = r.id;

      // 开灯柔光：以每盏灯为圆心画光斑，再用房间轮廓裁掉溢出部分
      const cp = document.createElementNS(NS, 'clipPath');
      cp.setAttribute('id', 'rclip-' + r.id);
      const cpp = document.createElementNS(NS, 'path');
      cpp.setAttribute('d', roundPath(r.pts, 11));
      cp.append(cpp);
      defs.append(cp);

      const glow = document.createElementNS(NS, 'g');
      glow.setAttribute('class', 'room-glow');
      glow.setAttribute('clip-path', `url(#rclip-${r.id})`);
      glow.setAttribute('pointer-events', 'none');
      glow.dataset.room = r.id;
      LH.devices.filter((d) => d.room === r.id && GLOW_KINDS[d.kind] && d.x != null).forEach((d) => {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', d.x);
        c.setAttribute('cy', d.y);
        c.setAttribute('r', /射灯|氛围|灯带|画/.test(d.name) ? 44 : 70);
        c.setAttribute('fill', 'url(#glow)');
        c.setAttribute('class', 'lamp');
        c.dataset.dev = d.id;
        glow.append(c);
      });
      g.append(glow);

      const poly = document.createElementNS(NS, 'path');
      poly.setAttribute('d', roundPath(r.pts, 11));
      poly.setAttribute('class', 'room-shape' + (TONE[r.id] ? ' ' + TONE[r.id] : ''));
      poly.dataset.room = r.id;
      g.append(poly);

      svg.append(g);
    });

    // 墙体：只有显式关掉自动外框时才用模板里写死的 walls
    if (LH.plan.autoFrame === false && LH.plan.walls) {
      const R = LH.plan.wallW || 3;
      const wm = document.createElementNS(NS, 'mask');
      wm.setAttribute('id', 'wallmask');
      wm.setAttribute('maskUnits', 'userSpaceOnUse');
      wm.setAttribute('x', '-80'); wm.setAttribute('y', '-80');
      wm.setAttribute('width', w + 160); wm.setAttribute('height', h + 160);
      const mw = document.createElementNS(NS, 'rect');
      mw.setAttribute('x', '-80'); mw.setAttribute('y', '-80');
      mw.setAttribute('width', w + 160); mw.setAttribute('height', h + 160);
      mw.setAttribute('fill', '#fff');
      wm.append(mw);
      LH.rooms.forEach((r) => {
        const hole = document.createElementNS(NS, 'path');
        hole.setAttribute('d', roundPath(r.pts, 11));
        hole.setAttribute('fill', '#000');
        wm.append(hole);
      });
      defs.append(wm);

      const wp = document.createElementNS(NS, 'path');
      wp.setAttribute('d', LH.plan.walls.split('|').filter(Boolean)
        .map((s) => roundPath(s, 11 + R * 0.6)).join(' '));
      wp.setAttribute('class', 'plan-wall');
      wp.setAttribute('mask', 'url(#wallmask)');
      wp.setAttribute('fill-rule', 'nonzero');
      svg.append(wp);

      // 被墙围死的结构空腔（如次卧右侧的结构井）一并填成实心
      (LH.plan.solids || []).forEach((s) => {
        const rc = document.createElementNS(NS, 'rect');
        rc.setAttribute('x', s[0] - 0.6);
        rc.setAttribute('y', s[1] - 0.6);
        rc.setAttribute('width', s[2] - s[0] + 1.2);
        rc.setAttribute('height', s[3] - s[1] + 1.2);
        rc.setAttribute('class', 'plan-solid');
        svg.append(rc);
      });
    }

    // 房间标签：可拖拽的名字 + 温度
    LH.rooms.forEach((r) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'room-label-group');
      g.dataset.roomId = r.id;
      g.setAttribute('transform', `translate(${r.lx} ${r.ly})`);

      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', 0);
      label.setAttribute('y', 0);
      label.setAttribute('class', 'room-label');
      label.style.textAnchor = 'middle';
      label.textContent = r.name;
      g.append(label);

      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', 0);
      t.setAttribute('y', 15);
      t.setAttribute('class', 'room-temp');
      t.style.textAnchor = 'middle';
      t.dataset.metric = r.id;
      t.textContent = '—';
      g.append(t);

      svg.append(g);

      // 拖拽房间名字调整位置
      g.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const p0 = svgPoint(svg, e);
        const ox = p0.x - (Number(r.lx) || 0);
        const oy = p0.y - (Number(r.ly) || 0);
        g.style.cursor = 'grabbing';
        function move(ev) {
          const p = svgPoint(svg, ev);
          r.lx = Math.round((p.x - ox) * 10) / 10;
          r.ly = Math.round((p.y - oy) * 10) / 10;
          g.setAttribute('transform', `translate(${r.lx} ${r.ly})`);
        }
        function up() {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          g.style.cursor = '';
          // 保存到 localStorage，编辑器和主界面共享同一个 key
          try {
            const KEY = 'lovehome.config.v1';
            let cfg;
            const raw = localStorage.getItem(KEY);
            if (raw) {
              cfg = JSON.parse(raw);
            } else {
              // 没有已保存的配置，用当前 LH 初始化一份
              cfg = {};
              ['plan', 'rooms', 'devices', 'config', 'hass'].forEach((k) => {
                if (window.LH[k] != null) cfg[k] = window.LH[k];
              });
            }
            if (!cfg.rooms) cfg.rooms = [];
            const room = cfg.rooms.find((x) => x.id === r.id);
            if (room) { room.lx = r.lx; room.ly = r.ly; }
            else { cfg.rooms.push({ id: r.id, lx: r.lx, ly: r.ly }); }
            localStorage.setItem(KEY, JSON.stringify(cfg));
          } catch (e) { /* 无痕模式忽略 */ }
        }
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
    });

    /* 重绘时先把旧的户型图 SVG 摘掉：以前是直接 append，编辑一次就叠一层，
       后面的 paintValues/paintMarkers 又只认第一个 .plan（旧的），
       于是「编辑器里改了、仪表盘上没变」。 */
    const planWrap = $('#planWrap');
    planWrap.querySelectorAll('svg.plan').forEach((n) => n.remove());
    planWrap.append(svg);

    markers().forEach((d) => svg.append(marker(d)));

    svg.addEventListener('click', (e) => {
      if (e.target.closest('.marker')) return;
      const r = e.target.closest('[data-room]');
      if (r) openRoom(r.dataset.room);
    });
    return svg;
  }

  /* ── 左栏：全屋摘要 + 房间列表 ── */
  const KIND_NAME = { light: '灯光', ac: '空调', heat: '采暖', fresh: '净化' };

  /* 「全屋」下面那几行统计：可在编辑器里改（类型 / 名称 / 顺序 / 数量）。
     没配置过就用默认的四类，老配置不受影响。 */
  function homeStats() {
    const c = (LH.config && LH.config.homeStats) || null;
    if (Array.isArray(c) && c.length) {
      return c.filter((x) => x && x.kind)
        .map((x) => ({ kind: x.kind, name: x.name || KIND_NAME[x.kind] || x.kind }));
    }
    return ['light', 'ac', 'heat', 'fresh'].map((k) => ({ kind: k, name: KIND_NAME[k] }));
  }

  /* 没上户型图的设备（x/y 为空）：只能从「其他」里找到 */
  function looseDevs() {
    return LH.devices.filter((d) => d.x == null || d.y == null);
  }

  function buildSide() {
    const box = $('#side');
    if (!box) return;
    box.innerHTML = '';

    const sum = el('div', 'side-block');
    sum.innerHTML = '<div class="side-cap">全屋</div><div class="side-in" id="sideIn">—</div>';
    homeStats().forEach((s) => {
      const k = s.kind;
      const row = el('div', 'side-stat');
      row.dataset.kind = k;
      row.title = '查看全部' + s.name;
      row.innerHTML = `<span>${s.name}</span><b>0</b><em>/0</em>`;
      row.addEventListener('click', () => openKind(k));
      sum.append(row);
    });
    /* 「全屋」那行点开概览弹窗 */
    const inLine = sum.querySelector('.side-in');
    if (inLine) inLine.addEventListener('click', openOverview);
    box.append(sum);

    /* 房间卡片撑满整列：跟右侧房间面板同顶同底，左右两栏高度才统一 */
    const listBox = el('div', 'side-block grow');
    listBox.innerHTML = '<div class="side-cap">房间<i id="sideOnline">—</i></div>';
    const list = el('div', 'side-list');
    LH.rooms.forEach((r) => {
      const b = el('button', 'side-room');
      b.type = 'button';
      b.dataset.room = r.id;
      b.innerHTML = '<em></em><span>' + r.name + '</span><b>—</b>';
      b.addEventListener('click', () => openRoom(r.id));
      list.append(b);
    });
    /* 「其他」= 米家已入网但本页还没接入的设备（不再是「没上户型图的设备」） */
    const mb = el('button', 'side-room other');
    mb.type = 'button';
    mb.dataset.other = '1';
    mb.title = '米家已入网、本页还没接入的设备';
    mb.innerHTML = '<em></em><span>其他</span><b>' + (((state.missing || LH.missing) || []).length || '—') + '</b>';
    mb.addEventListener('click', () => openOther(true));
    list.append(mb);
    listBox.append(list);
    box.append(listBox);
    refreshSide();
  }

  function refreshSide() {
    const box = $('#side');
    if (!box) return;
    box.querySelectorAll('.side-stat').forEach((row) => {
      const k = row.dataset.kind;
      const all = LH.devices.filter((d) => d.kind === k);
      const on = all.filter(isOn).length;
      row.querySelector('b').textContent = on;
      row.querySelector('b').classList.toggle('on', on > 0);
      row.querySelector('em').textContent = '/' + all.length;
    });

    let reach = 0;
    box.querySelectorAll('.side-room').forEach((b) => {
      if (b.dataset.other) {
        const m = (state.missing || LH.missing) || [];
        b.querySelector('b').textContent = m.length || '—';
        b.querySelector('em').classList.toggle('warm', m.length > 0);
        return;
      }
      const r = LH.rooms.find((x) => x.id === b.dataset.room);
      if (!r) return;
      const tv = r.temp ? num(r.temp, null) : null;
      const hv = r.hum ? num(r.hum, null) : null;
      b.querySelector('b').textContent =
        tv == null ? (hv == null ? '—' : Math.round(hv) + '%') : tv.toFixed(1) + '°';
      const lit = LH.devices.some((d) => d.room === r.id && GLOW_KINDS[d.kind] && isOn(d));
      b.querySelector('em').classList.toggle('warm', lit);
      if (lit) reach += 1;
      b.classList.toggle('active', state.room === r.id);
    });
    const inp = $('#sideIn');
    if (inp) {
      const t = roomAvg('temp');
      const h = roomAvg('hum');
      inp.innerHTML = (t == null ? '—' : t.toFixed(1) + '°') +
        (h == null ? '' : '<em>' + Math.round(h) + '%</em>');
    }
    const tag = $('#sideOnline');
    if (tag) tag.textContent = reach + ' 处亮灯';
  }

  function bbox(pts) {
    const a = pts.split(' ').map((p) => p.split(',').map(Number));
    const xs = a.map((p) => p[0]); const ys = a.map((p) => p[1]);
    const x0 = Math.min(...xs); const x1 = Math.max(...xs);
    const y0 = Math.min(...ys); const y1 = Math.max(...ys);
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  function marker(d) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'marker' + (isGlow(d) ? '' : ' off'));
    g.dataset.dev = d.id;
    g.dataset.kind = d.kind;
    g.setAttribute('transform', `translate(${d.x} ${d.y})`);
    g.innerHTML =
      `<title>${d.name}</title>` +
      '<g class="mkin">' +
        '<circle class="halo" r="19"/>' +
        // cap：不透明底盘。关态的 dot 只有 10% 填充，房间色块会透过来，
        // 看着像图标陷在色块里、点在色块上，所以垫一层实心底把它托起来
        '<circle class="cap" r="12"/>' +
        // hit 半径不能太大：相邻设备中心距最小 26，超过 13 会让两个热区互相压住，
        // 变成「点 A 弹出 B」。14 略大于视觉半径 11.5，够用且不至于误伤
        '<circle class="hit" r="14"/>' +
        '<circle class="dot" r="11.5"/>' +
        `<use class="ico" href="#${ICON[d.kind] || 'i-wave'}" x="-7" y="-7" width="14" height="14"/>` +
      '</g>';
    g.addEventListener('click', (e) => { e.stopPropagation(); tapDevice(d); });
    return g;
  }

  function paintMarkers() {
    $$('.marker').forEach((g) => {
      const d = LH.devices.find((x) => x.id === g.dataset.dev);
      if (!d) return;
      g.classList.toggle('off', !isGlow(d));
      g.classList.toggle('dim', !matchFilter(d));
    });
    paintRoomMetrics();
  }

  function matchFilter(d) {
    const f = state.filter;
    if (f === 'all') return true;
    if (f === 'other') {
      /* 「其它」= 没有被某个筛选 chip 认领的类型；筛选条可在编辑器里增删，
         所以这里按当前 chip 反推，而不是写死四类 */
      const owned = (LH.filters || []).map((x) => x.id).filter((id) => id !== 'all' && id !== 'other');
      return !(owned.length ? owned : ['light', 'ac', 'heat', 'fresh']).includes(d.kind);
    }
    return d.kind === f;
  }

  function paintGlow() {
    const svg = $('.plan');
    if (!svg) return;
    LH.rooms.forEach((r) => {
      const g = svg.querySelector(`.room-glow[data-room="${r.id}"]`);
      if (!g) return;
      g.querySelectorAll('.lamp').forEach((c) => {
        const d = LH.devices.find((x) => x.id === c.dataset.dev);
        c.style.opacity = d && isOn(d) && matchFilter(d) ? '1' : '0';
      });
    });
  }

  function paintRoomMetrics() {
    LH.rooms.forEach((r) => {
      const t = $(`.room-temp[data-metric="${r.id}"]`);
      if (!t) return;
      const tv = r.temp ? num(r.temp, null) : null;
      const hv = r.hum ? num(r.hum, null) : null;
      const wantHum = r.mk !== 'temp';
      const parts = [];
      if (tv != null) parts.push(tv.toFixed(1) + '°');
      if (hv != null && (wantHum || tv == null)) parts.push(Math.round(hv) + '%');
      t.textContent = parts.length ? parts.join(' · ') : '—';
    });
  }

  /* ── 设备操作 ── */
  /* 点设备一律打开控制弹窗（相机走画面弹窗，只读实体走详情），不再直接翻转开关 */
  function tapDevice(d) { openControl(d); }

  /* ── 注意：v1.2.1 起，每个 d 可能有 d.entities[] 数组，包含同物理设备所有 entity_id。
     目前控制面板只用 d.entity（主实体）做显示和下发，d.entities[] 暂未使用。
     未来可以用它在控制面板上展示同设备的传感器读数（温湿度、电量等）。 */

  function toggle(d) {
    const s = st(d.entity);
    if (!s) { toast('实体未就绪 · ' + d.name); return; }
    const dom = d.entity.split('.')[0];
    const on = isOn(d);
    const label = (on ? '关闭' : '开启') + ' · ' + d.name;
    if (dom === 'climate') {
      sendControl('climate', on ? 'turn_off' : 'turn_on', { entity_id: d.entity }, label);
    } else if (dom === 'cover') {
      sendControl('cover', on ? 'close_cover' : 'open_cover', { entity_id: d.entity }, label);
    } else if (dom === 'media_player') {
      sendControl('media_player', on ? 'turn_off' : 'turn_on', { entity_id: d.entity }, label);
    } else {
      sendControl(dom, 'toggle', { entity_id: d.entity }, label);
    }
  }

  /* ── 情景（真实脚本） ── */
  /* 情景在本页里直接下发，不调用任何外部脚本实体 */
  function applyScene(id) {
    const sc = LH.scenes.find((s) => s.id === id);
    if (!sc) return;
    if (sc.refresh) {
      paintValues();
      paintMarkers();
      paintGlow();
      refreshRoom();
      const n = hass() ? Object.keys(hass().states).length : 0;
      toast('已刷新 · 读到 ' + n + ' 个实体');
      return;
    }
    const acts = sc.actions || [];
    if (!acts.length) { toast(sc.name + ' · 没有可下发的动作'); return; }
    acts.forEach((x) => {
      const dom = x.entity.split('.')[0];
      const data = { entity_id: x.entity };
      if (x.temperature != null) data.temperature = x.temperature;
      if (x.hvac_mode) data.hvac_mode = x.hvac_mode;
      callService(dom, x.service || 'turn_on', data);
    });
    toast('已下发 · ' + sc.name + '（' + acts.length + ' 项）');
    setTimeout(() => { paintMarkers(); paintGlow(); refreshRoom(); }, 1600);
  }

  /* ── 房间面板 ── */
  const GROUP_TITLE = {
    light: '灯光', ac: '空调', heat: '采暖', fresh: '净化 / 新风', fan: '风扇',
    cover: '晾衣 / 窗帘', plug: '插座 · 电源', media: '影音 · 面板', lock: '门锁',
    bell: '门铃', panel: '中控面板',
    toilet: '卫浴', cam: '摄像', appliance: '家电', hub: '网关',
    heater: '热水器', cook: '厨电', sensor: '传感器'
  };
  /* 这里少一个 kind，该类别在房间面板里就整个消失（加热水器/厨电前它们就点不到） */
  const GROUP_ORDER = ['light', 'ac', 'heat', 'fresh', 'fan', 'cover', 'toilet', 'plug',
    'panel', 'lock', 'bell', 'media', 'cam', 'hub', 'appliance', 'heater', 'cook', 'sensor'];

  function openRoom(id, keep) {
    const r = LH.rooms.find((x) => x.id === id);
    if (!r) return;
    state.room = id;
    const p = $('#roomPanel');
    p.hidden = false;
    /* 房间面板与右列常驻栏互斥：开房间面板就把它收掉，列宽不变 */
    const ap = $('#altPanel');
    if (ap) ap.hidden = true;
    const tv = r.temp ? num(r.temp, null) : null;
    const hv = r.hum ? num(r.hum, null) : null;
    const roomDevs = LH.devices.filter((d) => d.room === id);
    const roomRos = LH.readouts.filter((x) => x.room === id);
    /* 底部筛选同样作用于房间面板：只列当前类型的设备 */
    const list = state.filter === 'all' ? roomDevs : roomDevs.filter(matchFilter);
    const ros = state.filter === 'all' ? roomRos : [];
    const fname = (LH.filters.find((x) => x.id === state.filter) || {}).name || '';
    $('#rpName').textContent = r.name;
    $('#rpMeta').textContent =
      (tv == null ? '无温湿度计' : tv.toFixed(1) + '°C') +
      (hv == null ? '' : ' · 湿度 ' + Math.round(hv) + '%') +
      (state.filter === 'all'
        ? ` · ${roomDevs.length + roomRos.length} 个设备`
        : ` · ${fname} ${list.length}/${roomDevs.length}`);
    $$('.room-shape').forEach((s) => s.classList.toggle('active', s.dataset.room === id));
    $$('.side-room').forEach((b) => b.classList.toggle('active', b.dataset.room === id));

    const body = $('#rpBody');
    body.innerHTML = '';
    let count = 0;

    GROUP_ORDER.forEach((kind) => {
      const items = list.filter((d) => d.kind === kind);
      if (!items.length) return;
      count += items.length;
      body.append(el('div', 'rp-group', GROUP_TITLE[kind] || kind));
      items.forEach((d) => body.append(rpItem(d)));
    });

    if (ros.length) {
      body.append(el('div', 'rp-group', '运行状态'));
      ros.forEach((x) => body.append(roItem(x)));
    }
    if (!count && !ros.length) {
      body.append(el('div', 'rp-empty',
        state.filter === 'all' ? '这个房间还没配置设备。' : `这个房间没有${fname}设备。`));
    }
    /* 全部单列：跟左栏房间列表同一套行距与字号，左右看起来才是一套东西。
       设备多的房间交给面板自己滚动，不再拆双列（双列会把设备名挤成省略号） */
    if (!keep) p.scrollTop = 0;
  }

  function rpItem(d) {
    const dom = d.entity.split('.')[0];
    const on = isOn(d);
    const act = !!ACT_DOM[dom] && !d.ctl;
    const comp = !!d.ctl;
    const item = el('div', 'rp-item' + (comp ? ' solo' : ''));
    item.dataset.dev = d.id;
    /* 副标题只写「开关之外还有信息」的那种（模式/亮度/曲名/开度）。
       纯开关设备再写一句「关闭」跟右边的开关重复，而且把行高撑到 42，
       跟左栏房间列表（30px）对不齐 —— 这类就不写副标题了。 */
    const sub = devText(d);
    const subWorth = sub && sub !== '开启' && sub !== '关闭';
    item.innerHTML =
      `<span class="ri"><svg><use href="#${ICON[d.kind] || 'i-wave'}"/></svg></span>` +
      `<span class="rn">${d.name}${(act || comp) && subWorth ? `<i>${sub}</i>` : ''}</span>`;
    if (comp) {
      /* 复合设备：右侧给一个明晃晃的入口按钮，点条目任意位置也都进同一个弹窗 */
      const go = el('button', 'rgo');
      go.type = 'button';
      go.textContent = d.ctl.open || '设置';
      go.setAttribute('aria-label', d.name + ' ' + (d.ctl.open || '设置'));
      go.addEventListener('click', (e) => { e.stopPropagation(); openControl(d); });
      item.append(go);
    } else if (act) {
      const sw = el('button', 'sw' + (on ? ' on' : ''));
      sw.type = 'button';
      sw.setAttribute('aria-label', d.name);
      /* 开关按钮保留「点一下直接翻转」，点条目其余部分才开弹窗 */
      sw.addEventListener('click', (e) => { e.stopPropagation(); toggle(d); });
      item.append(sw);
    } else {
      item.append(el('span', 'rv', rvText(d)));
    }
    item.addEventListener('click', () => openControl(d));
    return item;
  }

  function fmtReadout(x) {
    const s = st(x.entity);
    if (!s) return '—';
    if (x.kind === 'cover') return coverPos(s).text;
    const v = s.state;
    if (x.map && x.map[v] != null) return x.map[v];
    if (v === 'unavailable') return '离线';
    if (v === 'unknown') return '未知';
    const n = parseFloat(v);
    if (Number.isFinite(n) && x.digits != null) {
      return n.toFixed(x.digits) + (x.unit ? ' ' + x.unit : '');
    }
    if (Number.isFinite(n) && x.unit) return v + ' ' + x.unit;
    return (LABEL[v] || v) + (x.unit ? ' ' + x.unit : '');
  }

  function roItem(x) {
    const item = el('div', 'rp-item ro');
    item.dataset.ro = x.entity;
    item.innerHTML =
      `<span class="ri"><svg><use href="#${ICON[x.kind] || 'i-wave'}"/></svg></span>` +
      `<span class="rn">${x.name}</span>` +
      `<span class="rv">${fmtReadout(x)}</span>`;
    return item;
  }

  /* 原地刷新房间面板，避免每 2 秒重建导致滚动被打断 */
  function refreshRoom() {
    if (!state.room) return;
    $$('#rpBody [data-dev]').forEach((item) => {
      const d = LH.devices.find((x) => x.id === item.dataset.dev);
      if (!d) return;
      const sub = item.querySelector('.rn i');
      if (sub) sub.textContent = devText(d);
      const rv = item.querySelector('.rv');
      if (rv) rv.textContent = rvText(d);
      const sw = item.querySelector('.sw');
      if (sw) sw.classList.toggle('on', isOn(d));
    });
    $$('#rpBody [data-ro]').forEach((item) => {
      const x = LH.readouts.find((r) => r.entity === item.dataset.ro);
      const v = item.querySelector('.rv');
      if (x && v) v.textContent = fmtReadout(x);
    });
  }

  function closeRoom() {
    state.room = null;
    $('#roomPanel').hidden = true;
    $$('.room-shape').forEach((s) => s.classList.remove('active'));
    syncAlt();
  }

  /* ── 右列常驻栏：常用设备 + 安防网关 ──
     第三列宽度恒定（--rpw），它和房间面板占同一个 grid 格、互斥显隐，
     所以怎么切列宽都不变，户型不会左右横移。
     这里最早放的是「天气 + 用电」占位卡（v166 已换成「常用设备 + 安防网关」常驻栏）；
     这块换成天天要点的东西：十来个常用灯/插座 + 网关与安防。
     偏好键从 alt 换成 pan：语义变了，让旧的「已关闭」不再生效，保证默认就是显示的。 */
  function altOn() { return uiPref().pan !== false; }
  /* 安防模块的只读行（网关在线），fmtReadout 要一整套字段，这里缓存住 */
  const ALT_ROS = [];
  function devByName(n) { return LH.devices.find((d) => d.name === n); }

  /* 一张模块卡：标题 + 可选的一句说明，内容由调用方往里塞行 */
  function altCard(title, note) {
    const c = el('div', 'alt-card');
    const h = el('div', 'alt-h');
    h.append(el('b', null, title));
    if (note) h.append(el('span', 'alt-note', note));
    c.append(h);
    return c;
  }
  function paintAlt() {
    const p = $('#altPanel'), body = $('#altBody');
    if (!p || !body) return;
    p.hidden = false;
    const cfg = LH.panel || {};
    body.innerHTML = '';
    ALT_ROS.length = 0;

    /* 模块一：常用设备。直接复用房间面板那一行（右侧小开关直控，点行开完整弹窗），
       所以行为和房间面板完全一致，不用另写一套。 */
    const q = altCard('常用设备', '点开关直控 · 点行看更多');
    ((cfg.quick) || []).map(devByName).filter(Boolean).forEach((d) => q.append(rpItem(d)));
    body.append(q);

    /* 模块二：安防网关。两台网关不在 LH.devices 里（只是在线状态镜像），走只读行；
       门锁 / 门铃 / 摄像头是设备，可点开对应弹窗（门锁门铃是复合弹窗，摄像头开画面）。 */
    const s = altCard('安防网关', '网关在线 · 安防设备');
    ((cfg.security) || []).forEach((it) => {
      if (it.e) {
        const ro = { entity: it.e, name: it.n, kind: it.k || 'sensor', map: it.map || null, unit: '' };
        ALT_ROS.push(ro);
        s.append(roItem(ro));
      } else {
        const d = devByName(it.n);
        if (d) s.append(rpItem(d));
      }
    });
    body.append(s);
  }
  /* 每 2 秒只改几个数值，不整块重建（否则滚动位置会被顶掉） */
  function refreshAlt() {
    const p = $('#altPanel');
    if (!p || p.hidden) return;
    $$('#altBody [data-dev]').forEach((item) => {
      const d = LH.devices.find((x) => x.id === item.dataset.dev);
      if (!d) return;
      const sub = item.querySelector('.rn i');
      if (sub) sub.textContent = devText(d);
      const rv = item.querySelector('.rv');
      if (rv) rv.textContent = rvText(d);
      const sw = item.querySelector('.sw');
      if (sw) sw.classList.toggle('on', isOn(d));
    });
    $$('#altBody [data-ro]').forEach((item) => {
      const x = ALT_ROS.find((r) => r.entity === item.dataset.ro);
      const v = item.querySelector('.rv');
      if (x && v) v.textContent = fmtReadout(x);
    });
  }
  /* 常驻栏要 320px 才装得下（见 .alt-panel）：≤900 由 CSS 整块撤掉，
     设备改走「点户型图图标 → 操作浮层」。这里同步一个判断，
     省掉窄屏上每 2 秒白跑一次 refreshAlt。
     ⚠️ 断点必须和 lovehome.css「@media (max-width: 900px)」里的 #altPanel 一致。 */
  const ALT_MIN_W = 900;
  function altWide() { return window.innerWidth > ALT_MIN_W; }
  /* 统一的显隐判定：开着 + 够宽 + 没开房间面板 + 在首页 才显示 */
  function syncAlt() {
    const p = $('#altPanel');
    if (!p) return;
    if (altWide() && altOn() && !state.room && state.page === 'home') paintAlt();
    else p.hidden = true;
  }

  /* ── 设备控制浮层：所有可操作设备都能开，控件按域 + 实体实际能力拼 ── */
  const FAN = { off: '关闭', auto: '自动', low: '低速', medium: '中速', high: '高速', turbo: '强劲', silent: '静音', quiet: '静音', middle: '中速', gentle: '柔风', full: '全速' };
  /* 域 → 控件构造函数；没列出的可操作域走 switchCtl（只有开关），只读域走 readOnlyCtl */
  const CTL = {
    climate: climateCtl, light: lightCtl, cover: coverCtl, fan: fanCtl,
    media_player: mediaCtl, humidifier: humidCtl, water_heater: heaterCtl,
    lock: lockCtl, vacuum: vacCtl
  };
  function roomName(id) { const r = LH.rooms.find((x) => x.id === id); return r ? r.name : ''; }

  /* ── 底部大按钮 power button 适用的 domain ── */
  const MAIN_SWITCHABLE = ['switch', 'light', 'cover', 'fan', 'media_player', 'water_heater', 'humidifier', 'lock', 'vacuum', 'valve', 'remote'];

  /* ── 设备模板库：按设备名关键字匹配，生成预配置 ctl
     ★ 所有模板严格参照用户提供的米家/中控面板设计图 ── */
  const DEVICE_TEMPLATES = {
    /* ✅ 浴霸（参考"主卫浴霸"设计图：顶部大状态 + 预设 tab + 运行模式 seg + 暖风/吹风/换气 sw + 加热档位 + 延时关机）*/
    '浴霸|bathroom_heater': (d, eids) => ({
      always: true, sub: '取暖 · 吹风 · 换气 · 延时', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '运行模式', hint: '自动交给浴霸预设程序，关机则整机停', items: [
          { k: 'seg', label: '运行模式', e: d.entity, domain: 'select' },
          { k: 'seg', label: '预设程序', e: eids.find((e) => /preset|program/i.test(e)) || d.entity },
          { k: 'btn', label: '停止工作', e: d.entity, svc: 'turn_off', text: '停止', dom: 'switch' },
        ] },
        { t: '暖风 · 吹风 · 换气', items: [
          { k: 'sw', label: '暖风', e: eids.find((e) => /heat|warm/i.test(e)) || '' },
          { k: 'sw', label: '吹风', e: eids.find((e) => /blow|fan/i.test(e) && !/speed/i.test(e)) || '' },
          { k: 'sw', label: '换气', e: eids.find((e) => /vent|exchange/i.test(e)) || '' },
          { k: 'seg', label: '加热档位', e: eids.find((e) => /level|gear/i.test(e)) || d.entity },
        ].filter((x) => x.e) },
        { t: '关机延时', hint: '洗完澡让它再吹一会儿把湿气排掉', items: [
          { k: 'sw', label: '延时关机', e: eids.find((e) => /delay/i.test(e)) || '' },
          { k: 'num', label: '延时时长', e: eids.find((e) => /delay_time|duration/i.test(e)) || '', unit: ' 分钟', min: 0, max: 120 },
        ].filter((x) => x.e) },
        { t: '照明', items: [
          { k: 'sw', label: '浴霸灯泡', e: eids.find((e) => /light|bulb/i.test(e)) || '' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),

    /* ✅ 马桶盖（参考马桶盖设计图：大状态 + 开机按钮 + 水温/座温/水流/风速 四合一 seg + 喷头位置 + 个性化/节能/夜灯/除臭 + 滤芯）*/
    '马桶|toilet|bidet': (d, eids) => ({
      always: true, sub: '冲洗 · 座圈 · 滤芯', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '运行', items: [
          { k: 'sw', label: '通断', e: d.entity },
          { k: 'ro', label: '水温', e: eids.find((e) => /water_temp/i.test(e)) || '', unit: '°C' },
          { k: 'ro', label: '座温', e: eids.find((e) => /seat_temp/i.test(e)) || '', unit: '°C' },
        ].filter((x) => x.e) },
        { t: '水温 · 座温 · 水流 · 风速', items: [
          { k: 'seg', label: '水温档', e: eids.find((e) => /water_temp/i.test(e)) || d.entity },
          { k: 'seg', label: '座温档', e: eids.find((e) => /seat_temp/i.test(e)) || '' },
          { k: 'seg', label: '水流大小', e: eids.find((e) => /flow|stream/i.test(e)) || '' },
          { k: 'seg', label: '风速', e: eids.find((e) => /dry|fan/i.test(e)) || '' },
        ].filter((x) => x.e) },
        { t: '喷头位置', items: [
          { k: 'seg', label: '喷嘴位置', e: eids.find((e) => /nozzle|position/i.test(e)) || d.entity },
        ] },
        { t: '个性化设置', items: [
          { k: 'ro', label: '个性化模式', e: eids.find((e) => /custom|personal/i.test(e)) || d.entity, unit: '' },
          { k: 'ro', label: '节能模式', e: eids.find((e) => /eco/i.test(e)) || '', unit: '' },
          { k: 'sw', label: '自动夜灯', e: eids.find((e) => /night|light/i.test(e)) || '' },
          { k: 'sw', label: '提示音', e: eids.find((e) => /sound|beep|voice/i.test(e)) || '' },
          { k: 'sw', label: '自动除臭', e: eids.find((e) => /deodor/i.test(e)) || '' },
        ].filter((x) => x.e) },
        { t: '滤芯', items: [
          { k: 'ro', label: '剩余寿命', e: eids.find((e) => /filter/i.test(e)) || '', unit: '%' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),

    /* ✅ 智能门锁（参考门锁设计图：只读为主，门状态/开锁方式/事件记录 三大块 + 🔒大状态头）*/
    '门锁|lock|smart_lock|door_lock|cadiz|kaadas|aqara.*lock|roci': (d, eids) => ({
      always: true, sub: '门锁 · 电量 · 告警', open: '查看', echo: [{ e: d.entity }],
      groups: [
        { t: '门状态', items: [
          { k: 'ro', label: '锁体状态', e: d.entity, unit: '' },
          { k: 'ro', label: '电量', e: eids.find((e) => /battery/i.test(e)) || '', unit: '%' },
          { k: 'ro', label: '布防', e: eids.find((e) => /armed|security/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '门磁状态', e: eids.find((e) => /door|contact/i.test(e) && e.startsWith('binary_sensor')) || '', unit: '' },
        ].filter((x) => x.e) },
        { t: '开锁方式 · 连接', items: [
          { k: 'ro', label: '连接方式', e: d.entity, unit: '', attr: 'connected' },
          { k: 'ro', label: '钥匙 ID', e: eids.find((e) => /key|rfid/i.test(e)) || '', unit: '' },
        ].filter((x) => x.e) },
        { t: '事件记录 · 告警', items: [
          { k: 'ro', label: '最后一次操作', e: eids.find((e) => /last|record/i.test(e)) || d.entity, unit: '' },
          { k: 'ro', label: '锁事件', e: eids.find((e) => /event|notify/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '门铃状态', e: eids.find((e) => /doorbell|ring/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '低电量告警', e: eids.find((e) => /low.*bat|alert/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '被撬告警', e: eids.find((e) => /pry|tamper/i.test(e)) || '', unit: '' },
        ].filter((x) => x.e) },
        { t: '应急操作', items: [
          { k: 'btn', label: '解锁', e: d.entity, svc: 'unlock', text: '🔓 远程解锁', dom: 'lock' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),

    /* ✅ 饮水机（参考饮水机设计图：出水/水质/滤芯/维护 四大块）*/
    '饮水机|净饮|water_dispenser|purifier': (d, eids) => ({
      always: true, sub: '出水 · 水质 · 滤芯', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '出水', items: [
          { k: 'ro', label: '工作状态', e: d.entity, unit: '' },
          { k: 'num', label: '出水温度设定', e: d.entity, unit: '°C' },
          { k: 'ro', label: '当前水温', e: eids.find((e) => /current.*temp|water_temp/i.test(e)) || '', unit: '°C' },
        ].filter((x) => x.e) },
        { t: '水质', items: [
          { k: 'ro', label: '进水 TDS', e: eids.find((e) => /tds_in|tds_inlet/i.test(e)) || '', unit: ' ppm' },
          { k: 'ro', label: '出水 TDS', e: eids.find((e) => /tds_out|tds_pure/i.test(e)) || '', unit: ' ppm' },
        ].filter((x) => x.e) },
        { t: '滤芯 · 寿命', items: [
          { k: 'ro', label: '剩余寿命', e: eids.find((e) => /filter|cartridge/i.test(e)) || '', unit: '%' },
          { k: 'ro', label: '剩余流量', e: eids.find((e) => /flow|volume/i.test(e)) || '', unit: ' L' },
          { k: 'ro', label: '已用流量', e: eids.find((e) => /used|total.*flow/i.test(e)) || '', unit: ' L' },
          { k: 'ro', label: '已用时长', e: eids.find((e) => /duration|hours/i.test(e)) || '', unit: ' 小时' },
        ].filter((x) => x.e) },
        { t: '维护 · 安全', items: [
          { k: 'sw', label: 'UV 杀菌', e: eids.find((e) => /uv/i.test(e)) || '' },
          { k: 'sw', label: '童锁', e: eids.find((e) => /child.*lock|lock/i.test(e)) || '' },
          { k: 'ro', label: '故障状态', e: eids.find((e) => /fault|error/i.test(e)) || '', unit: '' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),

    /* ✅ 燃气热水器（参考热水器设计图：通断/目标水温/燃烧状态 三大块）*/
    '热水器|water_heater': (d, eids) => ({
      always: true, sub: '燃气 · 温度', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '热水器', items: [
          { k: 'sw', label: '通断', e: d.entity },
          { k: 'num', label: '目标水温设定', e: d.entity, unit: '°C', min: 35, max: 65, aval: 'temperature', svc: 'water_heater.set_temperature' },
          { k: 'ro', label: '当前状态', e: d.entity, unit: '' },
        ] },
        { t: '燃烧状态', items: [
          { k: 'ro', label: '燃烧状态', e: eids.find((e) => /burn|flame/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '进水温度', e: eids.find((e) => /inlet.*temp|cold.*water/i.test(e)) || '', unit: '°C' },
          { k: 'ro', label: '设定水温', e: d.entity, unit: '°C', attr: 'temperature' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),

    /* ✅ 空气炸锅（参考空气炸锅设计图：烹饪/参数/状态 三大块）*/
    '空气炸|airfry|air_fryer': (d, eids) => ({
      always: true, sub: '温度 · 时间 · 烹饪', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '烹饪控制', hint: '先把温度和时间设好再开点开始；暂停只是保温等待', items: [
          { k: 'btn', label: '开始烹饪', e: d.entity, svc: 'turn_on', text: '▶ 开始', dom: 'switch' },
          { k: 'btn', label: '暂停', e: eids.find((e) => /pause/i.test(e)) || d.entity, svc: 'turn_off', text: '⏸ 暂停', dom: 'switch' },
          { k: 'btn', label: '停止烹饪', e: d.entity, svc: 'turn_off', text: '⏹ 停止', dom: 'switch' },
        ] },
        { t: '参数', items: [
          { k: 'num', label: '烹饪温度', e: eids.find((e) => /temp/i.test(e)) || '', unit: '°C', min: 40, max: 230 },
          { k: 'num', label: '烹饪时间', e: eids.find((e) => /time|duration/i.test(e)) || '', unit: ' 分钟', min: 1, max: 120 },
        ].filter((x) => x.e) },
        { t: '状态', items: [
          { k: 'ro', label: '工作状态', e: d.entity, unit: '' },
          { k: 'ro', label: '剩余时间', e: eids.find((e) => /remaining/i.test(e)) || '', unit: ' 分钟' },
          { k: 'ro', label: '故障状态', e: eids.find((e) => /fault|error/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '上次完成', e: eids.find((e) => /last|done/i.test(e)) || '', unit: '' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),

    /* ✅ 中控面板（参考中控面板设计图：屏幕/音箱/三路按键 三大块）*/
    '中控|central|smart_panel|hub': (d, eids) => ({
      always: true, sub: '屏幕 · 音箱 · 三路按键', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '屏幕', items: [
          { k: 'seg', label: '屏幕状态', e: eids.find((e) => /screen|display/i.test(e)) || d.entity },
          { k: 'num', label: '亮度', e: eids.find((e) => /brightness/i.test(e)) || '', unit: '%', min: 0, max: 100 },
          { k: 'sw', label: '自动息屏', e: eids.find((e) => /auto.*off|sleep/i.test(e)) || '' },
          { k: 'sw', label: '自动亮度', e: eids.find((e) => /auto.*bright/i.test(e)) || '' },
        ].filter((x) => x.e) },
        { t: '音箱', items: [
          { k: 'num', label: '音量', e: eids.find((e) => /volume/i.test(e)) || '', unit: '%', min: 0, max: 100 },
          { k: 'sw', label: '麦克风禁麦', e: eids.find((e) => /mute|mic/i.test(e)) || '' },
          { k: 'sw', label: '睡眠模式', e: eids.find((e) => /sleep/i.test(e)) || '' },
          { k: 'btn', label: '唤醒小爱', e: d.entity, svc: 'turn_on', text: '🎙 唤醒', dom: 'switch' },
        ].filter((x) => x.e) },
        { t: '三路继电器按键', items: [
          { k: 'ro', label: '左键', e: eids.find((e) => /left/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '中键', e: eids.find((e) => /middle|center/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '右键', e: eids.find((e) => /right/i.test(e)) || '', unit: '' },
          // 三个继电器通道独立开关
          ...eids.filter((e) => /relay|channel|switch_\d/i.test(e) && e.startsWith('switch')).map((e, i) => ({
            k: 'sw', label: `继电器${i + 1}`, e
          })),
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),

    /* ✅ 洗衣机（参考米家洗衣机 App 设计）*/
    '洗衣机|wash|laundry': (d, eids) => ({
      always: true, sub: '程序 · 状态 · 剩余时间', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '程序控制', items: [
          { k: 'sw', label: '通断', e: eids.find((e) => e.startsWith('switch')) || d.entity },
          { k: 'seg', label: '程序选择', e: eids.find((e) => /program|mode/i.test(e)) || d.entity },
          { k: 'btn', label: '开始', e: d.entity, svc: 'turn_on', text: '▶ 开始', dom: 'switch' },
          { k: 'btn', label: '暂停', e: eids.find((e) => /pause/i.test(e)) || '', svc: 'turn_off', text: '⏸ 暂停', dom: 'switch' },
        ].filter((x) => x.e) },
        { t: '参数', items: [
          { k: 'seg', label: '温度', e: eids.find((e) => /temp/i.test(e)) || '' },
          { k: 'seg', label: '转速', e: eids.find((e) => /spin|speed/i.test(e)) || '' },
          { k: 'seg', label: '用水量', e: eids.find((e) => /water|level/i.test(e)) || '' },
        ].filter((x) => x.e) },
        { t: '状态', items: [
          { k: 'ro', label: '剩余时间', e: eids.find((e) => /remaining|time_left/i.test(e)) || '', unit: ' 分钟' },
          { k: 'ro', label: '运行状态', e: eids.find((e) => /status|state/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '故障代码', e: eids.find((e) => /fault|error/i.test(e)) || '', unit: '' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* 旧饮水机/中控/热水器/马桶已在上面重写，这里只保留未重写的 */
    '插排|插座|plug|outlet|power_strip': (d, eids) => {
      const hasPower = eids.some((e) => /power|energy|kwh|current|voltage/i.test(e));
      const groups = [
        { t: '开关', items: [
          { k: 'sw', label: '通断', e: d.entity },
        ] },
      ];
      if (hasPower) {
        groups.push({ t: '计量', items: [
          { k: 'ro', label: '实时功率', e: eids.find((e) => /power(_?!=)|power$/i.test(e)) || '', unit: ' W' },
          { k: 'ro', label: '累计电量', e: eids.find((e) => /kwh|energy_total|energy|total_energy/i.test(e)) || '', unit: ' kWh' },
          { k: 'ro', label: '电压', e: eids.find((e) => /voltage/i.test(e)) || '', unit: ' V' },
          { k: 'ro', label: '电流', e: eids.find((e) => /current|ampere/i.test(e)) || '', unit: ' A' },
        ].filter((x) => x.e) });
        groups.push({ t: '状态 · 温度', items: [
          { k: 'ro', label: '插排温度', e: eids.find((e) => /temp/i.test(e)) || '', unit: '°C' },
        ].filter((x) => x.e) });
      }
      return { always: true, sub: hasPower ? '通断 · 计量' : '通断', open: '设置', echo: [{ e: d.entity }], groups };
    },
    /* ── 扫地机 / 扫拖一体 / 吸尘器 ── */
    '扫地|vacuum|robot.*vac|roborock|dreame|ilife|xiaomi.*vac|sweeper|扫拖': (d, eids) => ({
      always: true, sub: '清扫 · 回充 · 状态', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '清扫控制', items: [
          { k: 'sw', label: '开始清扫', e: d.entity },
          { k: 'btn', label: '回充', e: d.entity, svc: 'return_to_base', text: '🔋 回充', dom: 'vacuum' },
          { k: 'btn', label: '定位', e: d.entity, svc: 'locate', text: '📍 定位', dom: 'vacuum' },
          { k: 'btn', label: '暂停', e: d.entity, svc: 'pause', text: '⏸ 暂停', dom: 'vacuum' },
        ] },
        { t: '清扫模式', items: [
          { k: 'seg', label: '吸力', e: d.entity, domain: 'vacuum', opts_attr: 'fan_speed_list', field: 'fan_speed' },
        ].filter((x) => x.e) },
        { t: '状态', items: [
          { k: 'ro', label: '电量', e: d.entity, unit: '%', attr: 'battery_level' },
          { k: 'ro', label: '运行状态', e: d.entity, unit: '', attr: 'status' },
          { k: 'ro', label: '集尘袋', e: eids.find((e) => /dust|bag|bin/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '水箱', e: eids.find((e) => /water|tank/i.test(e)) || '', unit: '' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* ── 加湿器 ── */
    '加湿|humidifier|dehumidifier|除湿': (d, eids) => ({
      always: true, sub: '湿度 · 模式 · 水位', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '加湿器', items: [
          { k: 'sw', label: '通断', e: d.entity },
          { k: 'num', label: '目标湿度', e: d.entity, unit: '%', aval: 'humidity', min: 30, max: 70, svc: 'humidifier.set_humidity' },
        ] },
        { t: '模式', items: [
          { k: 'seg', label: '运行模式', e: d.entity, domain: 'humidifier', opts_attr: 'available_modes', field: 'mode' },
        ] },
        { t: '状态', items: [
          { k: 'ro', label: '当前湿度', e: d.entity, unit: '%', attr: 'current_humidity' },
          { k: 'ro', label: '水温', e: eids.find((e) => /temp/i.test(e)) || '', unit: '°C' },
          { k: 'ro', label: '水位/缺水上水', e: eids.find((e) => /water|level|tank/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '滤芯寿命', e: eids.find((e) => /filter/i.test(e)) || '', unit: '%' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* ── 净化器 ── */
    '净化|purifier|air.*purif|mi.*air': (d, eids) => ({
      always: true, sub: '模式 · 风速 · 空气质量', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '净化器', items: [
          { k: 'sw', label: '通断', e: d.entity },
          { k: 'seg', label: '模式', e: d.entity, domain: 'fan', opts_attr: 'preset_modes' },
          { k: 'seg', label: '风速', e: d.entity, domain: 'fan', opts_attr: 'speed_list' },
        ] },
        { t: '空气质量', items: [
          { k: 'ro', label: 'PM2.5', e: eids.find((e) => /pm25|pm2_5/i.test(e)) || '', unit: ' μg/m³' },
          { k: 'ro', label: '甲醛', e: eids.find((e) => /formaldehyde|hcho/i.test(e)) || '', unit: ' mg/m³' },
          { k: 'ro', label: 'TVOC', e: eids.find((e) => /tvoc/i.test(e)) || '', unit: ' mg/m³' },
          { k: 'ro', label: 'CO₂', e: eids.find((e) => /co2/i.test(e)) || '', unit: ' ppm' },
          { k: 'ro', label: '当前温湿度', e: eids.find((e) => /temp_humidity|temp.*humidity/i.test(e)) || '', unit: '' },
        ].filter((x) => x.e) },
        { t: '滤芯', items: [
          { k: 'ro', label: 'HEPA 寿命', e: eids.find((e) => /hepa|filter/i.test(e)) || '', unit: '%' },
          { k: 'ro', label: '活性炭寿命', e: eids.find((e) => /carbon/i.test(e)) || '', unit: '%' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* ── 窗帘 / 幕布 / 遮阳 ── */
    '窗帘|幕布|遮阳|cover|curtain|blind|shade': (d, eids) => ({
      always: true, sub: '开合 · 位置', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '窗帘', items: [
          { k: 'sw', label: '通断', e: d.entity },
          { k: 'num', label: '开合位置', e: d.entity, unit: '%', aval: 'current_position', min: 0, max: 100, svc: 'cover.set_cover_position' },
        ] },
      ]
    }),
    /* ── 音箱 / 电视 / 功放（media_player） ── */
    '音箱|音响|speaker|soundbox|soundbar|sound_bar|电视|television|tv|media_player': (d, eids) => ({
      always: true, sub: '播放 · 音量 · 音源', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '播放', items: [
          { k: 'sw', label: '通断', e: d.entity },
          { k: 'btn', label: '播放/暂停', e: d.entity, svc: 'media_player.toggle', text: '▶ 播放/暂停', dom: 'media_player' },
          { k: 'btn', label: '上一首', e: d.entity, svc: 'media_player.media_previous', text: '⏮ 上一首', dom: 'media_player' },
          { k: 'btn', label: '下一首', e: d.entity, svc: 'media_player.media_next', text: '⏭ 下一首', dom: 'media_player' },
        ] },
        { t: '音量', items: [
          { k: 'num', label: '音量', e: d.entity, unit: '%', aval: 'volume_level', min: 0, max: 1, svc: 'media_player.volume_set', mult: 100 },
        ] },
        { t: '音源', items: [
          { k: 'seg', label: '输入源', e: d.entity, domain: 'media_player', opts_attr: 'source_list', field: 'source' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* ── 摄像头（基础面板，video 在主界面显示） ── */
    '摄像头|camera|监控|webcam|doorbell|门铃': (d, eids) => ({
      always: true, sub: '画质 · 告警', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '摄像头', items: [
          { k: 'sw', label: '通断', e: d.entity },
        ] },
        { t: '状态', items: [
          { k: 'ro', label: '移动侦测', e: eids.find((e) => /motion/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '有人停留', e: eids.find((e) => /person/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '夜间模式', e: eids.find((e) => /night/i.test(e)) || '', unit: '' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* ── 电饭煲 / 电饭锅 / 电压力锅 ── */
    '电饭|饭煲|电饭堡|pressure_cooker|rice_cooker|电压力锅|炖锅': (d, eids) => ({
      always: true, sub: '烹饪 · 模式 · 保温', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '烹饪控制', items: [
          { k: 'sw', label: '通断', e: d.entity },
          { k: 'btn', label: '开始煮饭', e: d.entity, svc: 'turn_on', text: '🍚 开始', dom: 'switch' },
          { k: 'btn', label: '取消/保温', e: d.entity, svc: 'turn_off', text: '⏹ 取消', dom: 'switch' },
        ] },
        { t: '模式选择', items: [
          { k: 'seg', label: '烹饪模式', e: eids.find((e) => /mode|program/i.test(e)) || d.entity },
          { k: 'seg', label: '口感', e: eids.find((e) => /taste|texture/i.test(e)) || '' },
        ].filter((x) => x.e) },
        { t: '状态', items: [
          { k: 'ro', label: '当前状态', e: d.entity, unit: '' },
          { k: 'ro', label: '剩余时间', e: eids.find((e) => /remaining|time_left/i.test(e)) || '', unit: ' 分钟' },
          { k: 'ro', label: '内锅温度', e: eids.find((e) => /temp/i.test(e)) || '', unit: '°C' },
          { k: 'ro', label: '当前口感', e: eids.find((e) => /keep_warm|warm/i.test(e)) || '', unit: '' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* ── 烤箱 / 蒸箱 / 空气炸锅已在上面 ── */
    '烤箱|oven|蒸箱|steamer|roaster|kettle|电水壶': (d, eids) => ({
      always: true, sub: '温度 · 时间 · 模式', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '烹饪控制', items: [
          { k: 'sw', label: '通断', e: d.entity },
          { k: 'num', label: '设定温度', e: d.entity, unit: '°C' },
          { k: 'num', label: '烹饪时间', e: d.entity, unit: ' 分钟' },
        ] },
        { t: '模式', items: [
          { k: 'seg', label: '烹饪模式', e: d.entity },
        ] },
        { t: '状态', items: [
          { k: 'ro', label: '当前温度', e: eids.find((e) => /temp/i.test(e)) || d.entity, unit: '°C' },
          { k: 'ro', label: '剩余时间', e: eids.find((e) => /remaining/i.test(e)) || '', unit: ' 分钟' },
          { k: 'ro', label: '工作状态', e: eids.find((e) => /status/i.test(e)) || '', unit: '' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* ── 冰箱 ── */
    '冰箱|refrigerator|fridge|freezer|冷柜': (d, eids) => ({
      always: true, sub: '温度 · 模式 · 告警', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '冷藏室', items: [
          { k: 'num', label: '冷藏温度', e: eids.find((e) => /fridge|refrigerator|cool/i.test(e)) || d.entity, unit: '°C', aval: 'temperature', min: 2, max: 10 },
        ] },
        { t: '冷冻室', items: [
          { k: 'num', label: '冷冻温度', e: eids.find((e) => /freeze|freezer/i.test(e)) || '', unit: '°C', min: -24, max: -12 },
        ].filter((x) => x.e) },
        { t: '模式', items: [
          { k: 'seg', label: '运行模式', e: eids.find((e) => /mode|smart|eco/i.test(e)) || d.entity },
        ] },
        { t: '告警', items: [
          { k: 'ro', label: '门未关告警', e: eids.find((e) => /door/i.test(e)) || '', unit: '' },
          { k: 'ro', label: '高温度告警', e: eids.find((e) => /high.*temp|overheat/i.test(e)) || '', unit: '' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* ── 新风系统 / 全热交换 ── */
    '新风|fresh_air|ventilation|hrv|erv|热交换|换气': (d, eids) => ({
      always: true, sub: '风速 · 模式 · 空气质量', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '新风', items: [
          { k: 'sw', label: '通断', e: d.entity },
          { k: 'seg', label: '风速', e: d.entity, domain: 'fan', opts_attr: 'speed_list' },
          { k: 'seg', label: '模式', e: d.entity, domain: 'fan', opts_attr: 'preset_modes' },
        ] },
        { t: '空气质量', items: [
          { k: 'ro', label: '室内 CO₂', e: eids.find((e) => /co2/i.test(e)) || '', unit: ' ppm' },
          { k: 'ro', label: '室内 PM2.5', e: eids.find((e) => /pm25|pm2_5/i.test(e)) || '', unit: ' μg/m³' },
          { k: 'ro', label: '室内湿度', e: eids.find((e) => /humidity/i.test(e)) || '', unit: '%' },
        ].filter((x) => x.e) },
        { t: '滤芯', items: [
          { k: 'ro', label: 'HEPA 寿命', e: eids.find((e) => /hepa|filter/i.test(e)) || '', unit: '%' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* ── 投影仪 / 激光电视 ── */
    '投影|projector|激光电视|laser.*tv|beam': (d, eids) => ({
      always: true, sub: '电源 · 输入源 · 画质', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '投影', items: [
          { k: 'sw', label: '通断', e: d.entity },
          { k: 'seg', label: '输入源', e: d.entity, domain: 'media_player', opts_attr: 'source_list', field: 'source' },
        ] },
        { t: '画质 · 音频', items: [
          { k: 'num', label: '亮度', e: eids.find((e) => /brightness/i.test(e)) || '', unit: '%' },
          { k: 'num', label: '音量', e: d.entity, unit: '%', aval: 'volume_level', min: 0, max: 1 },
        ].filter((x) => x.e) },
        { t: '状态', items: [
          { k: 'ro', label: '运行时长', e: eids.find((e) => /runtime|hours/i.test(e)) || '', unit: ' 小时' },
          { k: 'ro', label: '灯泡/滤网寿命', e: eids.find((e) => /bulb|lamp|filter/i.test(e)) || '', unit: '%' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* ── 智能花盆 / 植物生长灯 ── */
    '花盆|plant|grow.*light|植物灯|种植|hydroponic': (d, eids) => ({
      always: true, sub: '光照 · 浇水 · 环境', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '光照', items: [
          { k: 'sw', label: '植物灯', e: eids.find((e) => /light|lamp/i.test(e)) || d.entity },
          { k: 'num', label: '光照强度', e: eids.find((e) => /brightness|light/i.test(e)) || '', unit: '%' },
        ].filter((x) => x.e) },
        { t: '浇水', items: [
          { k: 'btn', label: '手动浇水', e: eids.find((e) => /water|pump/i.test(e)) || '', svc: 'turn_on', text: '💧 浇水', dom: 'switch' },
        ].filter((x) => x.e) },
        { t: '环境读数', items: [
          { k: 'ro', label: '土壤湿度', e: eids.find((e) => /soil|moisture/i.test(e)) || '', unit: '%' },
          { k: 'ro', label: '温度', e: eids.find((e) => /temp/i.test(e)) || '', unit: '°C' },
          { k: 'ro', label: '光照值', e: eids.find((e) => /lux|illuminance/i.test(e)) || '', unit: ' lux' },
          { k: 'ro', label: '电量', e: eids.find((e) => /battery/i.test(e)) || '', unit: '%' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* ── 宠物喂食器 / 饮水机 ── */
    '喂食|feeder|宠物|pet|饮水机|water.*fountain': (d, eids) => ({
      always: true, sub: '喂食 · 水位 · 提醒', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '喂食器', items: [
          { k: 'sw', label: '通断', e: d.entity },
          { k: 'btn', label: '立即喂食', e: d.entity, svc: 'turn_on', text: '🍖 喂食', dom: 'switch' },
        ] },
        { t: '喂食计划', items: [
          { k: 'ro', label: '今日已喂', e: eids.find((e) => /fed|today/i.test(e)) || '', unit: ' 次' },
          { k: 'ro', label: '粮仓余量', e: eids.find((e) => /food|hopper|bin/i.test(e)) || '', unit: '%' },
        ].filter((x) => x.e) },
        { t: '饮水机', items: [
          { k: 'ro', label: '水箱水位', e: eids.find((e) => /water|tank|level/i.test(e)) || '', unit: '%' },
          { k: 'ro', label: '滤芯寿命', e: eids.find((e) => /filter/i.test(e)) || '', unit: '%' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* ── 电动床 / 智能床 ── */
    '电动床|智能床|bed|mattress|adjustable.*bed': (d, eids) => ({
      always: true, sub: '角度 · 按摩 · 闹钟', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '床头角度', items: [
          { k: 'num', label: '床头角度', e: d.entity, unit: '°', min: 0, max: 60 },
          { k: 'sw', label: '一键放平', e: eids.find((e) => /flat|zero/i.test(e)) || '' },
        ].filter((x) => x.e) },
        { t: '按摩', items: [
          { k: 'sw', label: '按摩', e: eids.find((e) => /massage/i.test(e)) || '' },
          { k: 'seg', label: '按摩模式', e: eids.find((e) => /massage.*mode/i.test(e)) || '' },
        ].filter((x) => x.e) },
        { t: '环境', items: [
          { k: 'ro', label: '床垫温度', e: eids.find((e) => /mattress.*temp|bed.*temp/i.test(e)) || '', unit: '°C' },
          { k: 'ro', label: '环境噪声', e: eids.find((e) => /noise|sound/i.test(e)) || '', unit: ' dB' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
    /* ── 地暖 / 暖气片 ── */
    '地暖|暖气片|供热|heating|radiator|floor.*heat': (d, eids) => ({
      always: true, sub: '目标温度 · 模式', open: '设置', echo: [{ e: d.entity }],
      groups: [
        { t: '温控', items: [
          { k: 'sw', label: '通断', e: d.entity },
          { k: 'num', label: '目标温度', e: d.entity, unit: '°C', min: 15, max: 30, aval: 'temperature', svc: 'climate.set_temperature' },
          { k: 'ro', label: '当前温度', e: d.entity, unit: '°C', attr: 'current_temperature' },
        ] },
        { t: '模式', items: [
          { k: 'seg', label: '运行模式', e: d.entity, domain: 'climate', opts_attr: 'preset_modes' },
        ] },
      ].filter((g) => g.items.length)
    }),
    /* ── 烟雾/燃气/水浸/人体 传感器面板（安全类） ── */
    '烟雾|smoke|燃气|gas|水浸|water.*leak|漏水|人体|motion| presence|入侵|intrusion': (d, eids) => ({
      always: true, sub: '状态 · 告警', open: '查看', echo: [{ e: d.entity }],
      groups: [
        { t: '传感器状态', items: [
          { k: 'ro', label: '当前状态', e: d.entity, unit: '' },
          { k: 'ro', label: '电池电量', e: eids.find((e) => /battery/i.test(e)) || '', unit: '%' },
          { k: 'ro', label: '信号强度', e: eids.find((e) => /rssi|signal/i.test(e)) || '', unit: ' dBm' },
        ].filter((x) => x.e) },
      ].filter((g) => g.items.length)
    }),
  };
  function matchDeviceTemplate(d, eids) {
    if (!d || !d.name) return null;
    for (const [pattern, fn] of Object.entries(DEVICE_TEMPLATES)) {
      const re = new RegExp(pattern, 'i');
      if (re.test(d.name)) { try { return fn(d, eids); } catch (e) { /* 退回通用 */ } }
    }
    return null;
  }

  /* ── 把一台设备的所有兄弟实体自动拼成 ctl 配置 ──
     批量导入进来的马桶/净化器等复合设备没有预配置 ctl，
     这里根据 d.entities[] 数组遍历生成控件组，效果和模板里的马桶尽量一致 */
  function autoBuildComposite(d) {
    const eids = (d.entities || []).filter((e) => e && e !== d.entity);  // 去掉主实体（主实体已在 d.entity）
    if (!eids.length) return null;
    const dom = d.entity.split('.')[0];

    // ★ 1. 先试 DEVICE_TEMPLATES 模板匹配（设备名关键字）
    const templated = matchDeviceTemplate(d, eids);
    if (templated && templated.groups && templated.groups.length) {
      templated.groups.forEach((g) => { g.items = g.items.filter((it) => it.e); });
      templated.groups = templated.groups.filter((g) => g.items.length);
      if (templated.groups.length) {
        if (MAIN_SWITCHABLE.includes(dom)) templated._powerEid = d.entity;
        return templated;
      }
    }

    const groups = [];
    // 更细的分组：主开关/模式 seg/温度滑块/按钮/读数
    const gMain  = { t: '总开关', items: [] };
    const gMode  = { t: '模式 · 分段', items: [] };
    const gSlider= { t: '滑块 · 数值', items: [] };
    const gBtn   = { t: '按钮 · 操作', items: [] };
    const gRead  = { t: '状态 · 读数', items: [] };

    // 关键字：名字里有 mode/模式/预设/风速/摆风 的 switch → 当 seg 处理
    const SKIP_DOMAINS = new Set(['camera', 'image', 'tts', 'notify']);

    eids.forEach((eid) => {
      const s = st(eid);
      if (!s) return;
      const dom = eid.split('.')[0];
      if (SKIP_DOMAINS.has(dom)) return;
      const at = s.attributes || {};
      let fname = at.friendly_name || eid.split('.')[1] || eid;
      // ★ 去掉设备名前缀：HA 的 friendly_name 常带 "设备名 - " / "设备名·" 开头
      // （比如 "米家智能浴霸 - 主卫 浴霸灯泡" → "浴霸灯泡"）
      const devName = (d && d.name) || '';
      if (devName && fname.startsWith(devName)) {
        fname = fname.slice(devName.length).replace(/^[\s\-_\.··:：]+/, '');
      }
      // 再去掉冗余前缀（比如 "主卫 浴霸" 重复出现两次）
      const shorter = fname.replace(new RegExp('^' + devName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\-_.·:：]+', 'i'), '');
      if (shorter.length && shorter.length < fname.length) fname = shorter;
      const label = fname.length > 16 ? fname.slice(0, 15) + '…' : fname;

      switch (dom) {
        case 'switch': case 'light':
        case 'cover': case 'fan':
        case 'media_player': case 'vacuum':
        case 'water_heater': case 'humidifier':
        case 'lock': case 'valve':
        case 'remote':
          gMain.items.push({ k: 'sw', label, e: eid }); break;
        case 'select': case 'input_select':
          gMode.items.push({ k: 'seg', label, e: eid }); break;
        case 'climate': {
          // climate 主实体：如果 entities 里没有单独的 switch，这里也做 sw
          gMain.items.push({ k: 'sw', label: label || '电源', e: eid }); break;
        }
        case 'number': case 'input_number': {
          const step = Number(at.step) || 1;
          const unit = at.unit_of_measurement || '';
          const mn = Number(at.min), mx = Number(at.max);
          gSlider.items.push({ k: 'num', label, e: eid, step, unit,
            ...(!isNaN(mn) ? { min: mn } : {}),
            ...(!isNaN(mx) ? { max: mx } : {}) }); break;
        }
        case 'cover':
        case 'fan': case 'media_player':
        case 'water_heater': case 'humidifier':
        case 'lock': case 'vacuum':
          gMain.items.push({ k: 'sw', label, e: eid }); break;
        case 'button': case 'script': case 'scene':
          gBtn.items.push({ k: 'btn', label, e: eid, text: fname.slice(-2) || '执行' }); break;
        case 'sensor': case 'binary_sensor': case 'input_text': case 'text': {
          const unit = at.unit_of_measurement || '';
          gRead.items.push({ k: 'ro', label, e: eid, unit }); break;
        }
        default:
          gRead.items.push({ k: 'ro', label, e: eid });
      }
    });

    [gMain, gMode, gSlider, gBtn, gRead].forEach((g) => {
      if (g.items.length) groups.push(g);
    });
    if (!groups.length) return null;

    // echo 行：取主实体 + 第一个模式实体的状态做副标
    const echo = [];
    const mainSt = st(d.entity);
    if (mainSt && mainSt.state) echo.push({ e: d.entity });
    const modeEid = [...gMode.items, ...gMain.items].find((it) =>
      eids.includes(it.e) && (it.k === 'seg' || /mode|模式/i.test(it.label)));
    if (modeEid) echo.push({ e: modeEid.e });

    const ctl = {
      always: true,
      sub: groups.filter((g) => g.items.some((i) => i.k !== 'ro')).length + ' 组可操作 · ' + gRead.items.length + ' 读数',
      open: '设置',
      echo, groups
    };
    // ★ 2. 通用生成的也加底部大按钮标记
    if (MAIN_SWITCHABLE.includes(dom)) ctl._powerEid = d.entity;
    return ctl;
  }

  function openControl(d) {
    const dom = d.entity.split('.')[0];
    if (d.kind === 'cam' || dom === 'camera') { openCamera(d.entity, d.name); return; }

    // ★ 如果这台设备有多个兄弟实体，自动构建 ctl 走复合面板渲染
    //    （让批量导入的马桶能像模板马桶一样显示所有功能）
    //    但！有专用 CTL 处理器的 domain（climate/light/cover 等）不能抢——
    //    它们有自己专业的面板（温度滑块/模式分段等），autoBuildComposite 会把面板搞砸
    const HAS_DEDICATED_CTL = !!CTL[dom];
    if (!d.ctl && !HAS_DEDICATED_CTL && d.entities && d.entities.length > 1) {
      d.ctl = autoBuildComposite(d);
      if (d.ctl) { openComposite(d); return; }
    }

    if (d.ctl) { openComposite(d); return; }
    const act = !!ACT_DOM[dom];
    state.ctl = d.id;
    state.rel = related(d);   /* 同设备读数只算一次，paintControl 每 2 秒复用 */
    showLayer(d.name, roomName(d.room) + ' · ' + (act ? '直接下发 HA 服务' : '只读实体 · 只展示不上报'));
    const body = $('#layerBody');
    body.innerHTML = '';
    body.append((CTL[dom] || (act ? switchCtl : readOnlyCtl))(d));
    /* 只读实体除了信息没有别的内容，直接展开 */
    body.append(infoCard(d, !act));
    const tc = timerCard(d);          /* v192：可控设备自动带一张定时卡 */
    if (tc) body.append(tc);
    paintControl();
    clearInterval(state.ctlTimer);
    state.ctlTimer = setInterval(paintControl, 2000);
  }
  function refreshControl() { if (state.ctl) paintControl(); }

  /* ── 复合设备（中控面板 / 门铃 / 门锁 / 净化器 / 厨电 …）：一枚图标 + 一个弹窗装下整台设备的全部功能 ──
     数据侧见 gen_lovehome_data.py 的 ctl 配置；这里只负责画和回填。 */
  /* 各域"算开着"的状态：switch/light 是 on，cover 是 open，water_heater 是 gas/electric … */
  const ON_STATES = ['on', 'open', 'gas', 'electric', 'heat', 'eco', 'performance', 'boost'];
  function ceText(it) {
    const s = st(it.e);
    if (!s) return '—';
    const a = s.attributes || {};
    if (s.state === 'unavailable') return '离线';
    let v = it.attr ? a[it.attr] : s.state;
    if (v == null || v === '' || v === 'unknown') return '—';
    if (it.fmt === 'ago') return String(v) === 'unknown' ? '—' : ago(v);
    v = String(v);
    if (it.map && it.map[v] != null) return it.map[v];
    // v174：src 把原始单位缩一档（插排的电压报 mV、电流报 mA，除 1000 才是 V/A）
    if (it.src && Number.isFinite(Number(v))) v = String(Math.round(Number(v) / it.src * 100) / 100);
    if (it.unit === '%' && Number.isFinite(Number(v))) return Math.round(Number(v)) + '%';
    return v + (it.suffix || it.unit || '');
  }
  function ctlEcho(d) {
    const c = d.ctl || {};
    let seen = false;
    const parts = (c.echo || []).map((it) => {
      const s = st(it.e);
      if (!s) return null;
      /* 离线时只留一句「离线」，不让它跟后面的读数拼成「离线 · 离线」 */
      if (s.state === 'unavailable') return seen ? null : ((seen = true), '离线');
      /* echo 也可以读属性（热水器当前水温就是 water_heater 的 temperature） */
      let v = it.attr ? (s.attributes || {})[it.attr] : s.state;
      if (v == null || v === '') return null;
      if (it.map && it.map[v] != null) v = it.map[v];
      return (it.pre || '') + v + (it.unit || '');
    }).filter((x) => x != null);
    return parts.length ? parts.join(' · ') : (c.sub || '');
  }

  function openComposite(d) {
    state.ctl = d.id;
    state.rel = [];
    state.ci = [];                       /* 扁平后的 item 表，data-ci 就是下标 */
    showLayer(d.name, roomName(d.room), true);
    const body = $('#layerBody');
    body.innerHTML = '';
    body.append(compositeCtl(d));
    body.append(el('div', 'ctl-note',
      '这台设备的功能都收在这一个弹窗里，户型图上只留一枚图标。' +
      (d.ctl.always ? '' : '')));
    const tc = timerCard(d);          /* v192：复合设备同样自动带定时卡 */
    if (tc) body.append(tc);
    paintControl();
    clearInterval(state.ctlTimer);
    state.ctlTimer = setInterval(paintControl, 2000);
  }

  function compositeCtl(d) {
    const box = el('div', 'ctl ctl-comp');
    let html = ctlHead(d) + (d.ctl.groups || []).map((g) => cgroup(g)).join('');
    // ★ 底部大 power button（如果 ctl 标记了 _powerEid）
    if (d.ctl._powerEid) {
      const s = st(d.ctl._powerEid);
      const on = !!s && ['on', 'open', 'unlocked', 'active'].includes(s.state);
      html += `<div class="ctl-foot"><button class="wide" id="ctlPower" type="button" data-e="${d.ctl._powerEid}">${on ? '关闭' : '开启'} · ${d.name}</button></div>`;
    }
    box.innerHTML = html;
    // 绑定 power button 点击
    const pb = box.querySelector('#ctlPower');
    if (pb) {
      pb.addEventListener('click', () => {
        const s = st(d.ctl._powerEid);
        const on = !!s && ['on', 'open', 'unlocked', 'active'].includes(s.state);
        const dom = d.ctl._powerEid.split('.')[0];
        const svcMap = { switch: 'turn_on', light: 'turn_on', cover: 'open_cover', lock: 'unlock', fan: 'turn_on', media_player: 'turn_on', water_heater: 'turn_on', humidifier: 'turn_on' };
        const svc = svcMap[dom] || 'turn_on';
        const offSvcMap = { switch: 'turn_off', light: 'turn_off', cover: 'close_cover', lock: 'lock', fan: 'turn_off', media_player: 'turn_off', water_heater: 'turn_off', humidifier: 'turn_off' };
        const offSvc = offSvcMap[dom] || 'turn_off';
        sendControl(dom, on ? offSvc : svc, { entity_id: d.ctl._powerEid },
          (on ? '关闭' : '开启') + ' · ' + d.name);
      });
    }
    return box;
  }

  function cgroup(g) {
    return '<div class="cgrp"><div class="cgrp-t">' + g.t + '</div>' +
      (g.hint ? '<div class="cgrp-h">' + g.hint + '</div>' : '') +
      (g.items || []).map((it) => crow(it)).join('') + '</div>';
  }

  /** 一个 item → 一行控件。data-ci 指回 state.ci 里的配置，paint 时按它回填。 */
  function crow(it) {
    const i = state.ci.push(it) - 1;
    const A = `data-ci="${i}"`;
    const lab = `<span class="clab">${it.label}</span>`;
    if (it.k === 'ro') return `<div class="crow ro">${lab}<b class="cval" ${A}>—</b></div>`;
    if (it.k === 'sw') return `<div class="crow">${lab}` +
      `<button class="csw" type="button" ${A} aria-label="${it.label}"><i></i></button></div>`;
    if (it.k === 'seg') {
      const s = st(it.e);
      const at = (s && s.attributes) || {};
      /* 常规 select 用自己的 options；climate 这类要从 preset_modes / hvac_modes 里取（it.opts_attr） */
      const opts = at.options || (it.opts_attr ? at[it.opts_attr] : null) || it.opts || [];
      const lbl = (o) => {
        if (it.map && it.map[o] != null) return it.map[o];
        if (it.domain === 'climate') return tr(HVAC, o);
        if (it.domain === 'fan') return tr(FAN, o);
        return tr(ALIAS_MAP, String(o).toLowerCase());
      };
      return `<div class="crow">${lab}<div class="cseg" ${A}>` +
        opts.map((o) => `<button type="button" data-opt="${o}">${lbl(o)}</button>`).join('') +
        '</div></div>';
    }
    if (it.k === 'sel') {
      const s = st(it.e);
      const opts = ((s && s.attributes && s.attributes.options) || it.opts || []);
      const lbl = (o) => (it.map && it.map[o]) || (o + (it.suffix || ''));
      return `<div class="crow">${lab}<select class="csel" ${A}>` +
        opts.map((o) => `<option value="${o}">${lbl(o)}</option>`).join('') +
        '</select></div>';
    }
    if (it.k === 'num') {
      const s = st(it.e) || { attributes: {} };
      const a = s.attributes || {};
      /* water_heater 这类域把量程放在 min_temp / max_temp / temperature 上，先按通用名取 */
      const lo = a.min != null ? a.min : (a.min_temp != null ? a.min_temp : (it.min != null ? it.min : 0));
      const hi = a.max != null ? a.max : (a.max_temp != null ? a.max_temp : (it.max != null ? it.max : 100));
      // 离线时 state 是 "unavailable"，直接塞进 value 会让浏览器把滑块落在量程中点（3601 这种鬼值）
      const cur = it.aval ? a[it.aval] : s.state;
      const cv = Number.isFinite(Number(cur)) ? cur : lo;
      return `<div class="crow">${lab}<input class="crng" type="range" ${A}` +
        ` min="${lo}" max="${hi}" step="${a.target_temp_step || a.step || 1}"` +
        ` value="${cv}">` +
        `<b class="cnum" data-cv="${i}">—</b></div>`;
    }
    if (it.k === 'btn') return `<div class="crow">${lab}` +
      `<button class="cbtn" type="button" ${A}>${it.text || '执行'}</button></div>`;
    if (it.k === 'cam') return `<div class="crow">${lab}` +
      `<button class="cbtn" type="button" ${A}>${it.text || '查看'}</button></div>`;
    if (it.k === 'say') return `<div class="crow say">` +
      `<input class="ctext" type="text" maxlength="40" placeholder="输入要朗读的文字">` +
      `<button class="cbtn" type="button" ${A}>${it.text || '朗读'}</button></div>`;
    if (it.k === 'lamp') {
      const s = st(it.mode);
      const opts = ((s && s.attributes && s.attributes.options) || []);
      return `<div class="crow ctlkey">${lab}<div class="cseg sm" ${A} data-mode-for="${it.mode}">` +
        opts.map((o) => `<button type="button" data-opt="${o}">` +
          String(o).replace(/开关$/, '') + '</button>').join('') +
        '</div>' +
        `<button class="csw" type="button" ${A} data-for="${it.e}" aria-label="${it.label}"><i></i></button>` +
        '</div>';
    }
    return `<div class="crow ro">${lab}<b class="cval">—</b></div>`;
  }

  function paintControl() {
    const d = state.ctl ? LH.devices.find((x) => x.id === state.ctl) : null;
    if (!d) return;
    if (d.ctl) { paintComposite(d); return; }
    const s = st(d.entity);
    const box = $('#layerBody');
    if (!s || !box) return;
    const a = s.attributes || {};
    const dead = s.state === 'unavailable' || s.state === 'unknown';
    const head = $('#ctlState', box);
    if (head) head.textContent = devText(d);
    const sub = $('#ctlRoom', box);
    if (sub) sub.textContent = ctlSub(s, a);
    /* 晾衣架的位置是推出来的（三档 + 上次到位），不能按 data-attr 念原始数字 */
    const cv = $('#covPos', box);
    if (cv) cv.textContent = coverPos(s).text;
    /* 数值回显：任何带 data-attr 的元素都跟着实体属性走 */
    $$('[data-attr]', box).forEach((n) => {
      if (n.tagName === 'INPUT') return;   /* 滑块的 data-attr 只用于取值，下面单独回填 */
      const v = a[n.dataset.attr];
      n.textContent = v == null ? '—'
        : (typeof v === 'number' ? Math.round(v * 100) / 100 : v) + (n.dataset.unit || '');
    });
    /* 滑块 = 实体属性的镜子：除非正在拖，或刚下发还没回报，否则一律按实际值回填 */
    if (!state.drag && Date.now() > (state.holdUntil || 0)) {
      $$('input[type=range]', box).forEach((r) => {
        const v = a[r.dataset.attr];
        if (v == null) return;
        const src = Number(r.dataset.src || 100);
        r.value = Math.round(Number(v) / src * 100);
        const o = $('#' + r.id + 'Val', box);
        if (o) o.textContent = r.value + (r.dataset.unit || '%');
      });
    }
    $$('[data-mode]', box).forEach((b) => b.classList.toggle('on', s.state === b.dataset.mode));
    $$('[data-fan]', box).forEach((b) => b.classList.toggle('on', a.fan_mode === b.dataset.fan));
    $$('[data-preset]', box).forEach((b) => b.classList.toggle('on', a.preset_mode === b.dataset.preset));
    $$('[data-src]', box).forEach((b) => b.classList.toggle('on', a.source === b.dataset.src));
    const pw = $('#ctlPower', box);
    if (pw) {
      const on = isOn(d);
      pw.disabled = dead;
      pw.textContent = dead ? '离线 · 暂不可控' : ((on ? '关闭' : '开启') + ' · ' + d.name);
    }
    const iv = $('#ctlInfoBody', box);
    if (iv) iv.innerHTML = infoRows(d, s, a);
  }
  /** 复合设备回填：每个 [data-ci] 按 state.ci 里那份配置去读各自实体 */
  function paintComposite(d) {
    const box = $('#layerBody');
    if (!box) return;
    const head = $('#ctlState', box);
    if (head) head.textContent = ctlEcho(d);
    const sub = $('#ctlRoom', box);
    if (sub) sub.textContent = d.ctl.sub || '合并在一个弹窗里操作';
    $$('[data-ci]', box).forEach((n) => {
      const it = state.ci && state.ci[+n.dataset.ci];
      if (!it) return;
      const e = n.dataset.for || n.dataset.modeFor || it.e;
      const s = st(e);
      const dead = !s || s.state === 'unavailable';
      /* 只读值 */
      if (n.classList.contains('cval')) {
        n.textContent = ceText(it);
        n.classList.toggle('dead', dead);
        return;
      }
      /* 开关：water_heater / humidifier 这类域的"开"不是一个 on，要把它们的工作态也算上 */
      if (n.classList.contains('csw')) {
        n.classList.toggle('on', !!s && (ON_STATES.includes(s.state) || !!it.onvals && it.onvals.includes(s.state)));
        n.disabled = dead;
        return;
      }
      /* 分段 / 下拉：默认比实体 state；aval 用来比属性（climate 的 preset_mode 就在属性里） */
      if (n.classList.contains('cseg')) {
        const cur = s ? (it.aval ? (s.attributes || {})[it.aval] : s.state) : null;
        n.querySelectorAll('button[data-opt]').forEach((b) => {
          b.classList.toggle('on', cur != null && String(cur) === String(b.dataset.opt));
          b.disabled = dead;
        });
        return;
      }
      if (n.classList.contains('csel')) {
        if (document.activeElement !== n && s) n.value = s.state;
        n.disabled = dead;
        return;
      }
      /* 滑块：默认就是实体自己的 state，water_heater 这类要看 temperature 属性（it.aval） */
      if (n.classList.contains('crng')) {
        n.disabled = dead;
        const raw = s ? (it.aval ? (s.attributes || {})[it.aval] : s.state) : null;
        if (!state.drag && Date.now() > (state.holdUntil || 0) && Number.isFinite(Number(raw))) {
          n.value = raw;
        }
        const o = $(`[data-cv="${n.dataset.ci}"]`, box);
        if (o) o.textContent = n.value + (it.unit || '');
        return;
      }
      /* 按钮类：离线时禁用 */
      if (n.classList.contains('cbtn')) n.disabled = dead;
    });
  }

  /* 复合设备的下发：整块 layerBody 一次委托，弹窗重建也不用重复绑定 */
  let compBound = false;
  function bindComposite() {
    const box = $('#layerBody');
    if (!box || compBound) return;
    compBound = true;
    const cfg = (n) => (state.ci && state.ci[+n.dataset.ci]) || null;
    const pick = (t) => (t.closest ? t.closest('[data-ci]') : null);
    box.addEventListener('click', (ev) => {
      const n = pick(ev.target);
      if (!n) return;
      const it = cfg(n);
      if (!it) return;
      /* 前置闸门：有些动作只在特定状态下被设备受理，否则云端直接返回 -9999
         （例：马桶盖「停止工作」在关机/待机时按下，米家云端报未知错误 code=-9999；
         洗衣机「开始」要先开电源，不然指令发下去机器理都不理）。
         拦在本地、说人话，比让 HA 弹一串红字好。guard 是数组，任一条件命中就不下发。
         开关行（csw）和按钮行（cbtn）都走这里 */
      if (it.guard && it.guard.length) {
        for (const g of it.guard) {
          const gs = st(g.e);
          if (!gs) continue;
          const gv = g.attr ? (gs.attributes || {})[g.attr] : gs.state;
          const hit = Array.isArray(g.skip_when)
            ? g.skip_when.some((x) => String(x) === String(gv))
            : String(gv) === String(g.skip_when);
          if (hit) { toast(g.msg || '当前状态不用执行这个操作'); return; }
        }
      }
      /* 分段控件的按钮 */
      if (n.classList.contains('cseg')) {
        const b = ev.target.closest('button[data-opt]');
        if (!b) return;
        const e = n.dataset.modeFor || it.e;
        /* 默认 select.select_option；climate 走 set_hvac_mode / set_preset_mode（it.dom+svc+field） */
        const dm = it.dom || 'select';
        const svc = it.svc || 'select_option';
        const fld = it.field || 'option';
        const data = { entity_id: e };
        data[fld] = b.dataset.opt;
        sendControl(dm, svc, data,
          (n.dataset.modeFor ? it.label + ' 模式' : it.label) + ' · ' +
          ((it.map && it.map[b.dataset.opt]) || b.dataset.opt));
        return;
      }
      if (n.classList.contains('csw')) {
        const e = n.dataset.for || it.e;
        const s = st(e);
        const on = !!s && (s.state === 'on' || s.state === 'open');
        /* 实体不一定在 switch 域（马桶夜灯就是 light）：按域挑服务，否则下发会被 HA 拒 */
        const dm = (e || '').split('.')[0];
        const svcDom = dm === 'light' ? 'light' : dm === 'cover' ? 'cover'
          : dm === 'fan' ? 'fan' : dm === 'media_player' ? 'media_player'
          : dm === 'climate' ? 'climate' : dm === 'water_heater' ? 'water_heater'
          : dm === 'humidifier' ? 'humidifier' : 'switch';
        sendControl(svcDom, on ? 'turn_off' : 'turn_on', { entity_id: e },
          (on ? '关闭' : '开启') + ' · ' + it.label);
        return;
      }
      if (n.classList.contains('cbtn')) {
        if (it.k === 'cam') { openCamera(it.e, it.label); return; }
        if (it.k === 'say') {
          const inp = n.parentNode.querySelector('.ctext');
          const msg = (inp && inp.value || '').trim();
          if (!msg) { toast('先输入要朗读的文字'); if (inp) inp.focus(); return; }
          sendControl('notify', 'send_message', { entity_id: it.e, message: msg }, '朗读 · ' + msg.slice(0, 12));
          if (inp) inp.value = '';
          return;
        }
        /* 前置闸门（guard）已在委托开头统一处理，这里直接下发 */
        sendControl(it.dom || 'button', it.svc || 'press', { entity_id: it.e }, it.label);
        return;
      }
    });
    box.addEventListener('change', (ev) => {
      const n = pick(ev.target);
      if (!n) return;
      const it = cfg(n);
      if (!it) return;
      if (n.classList.contains('csel')) {
        sendControl('select', 'select_option', { entity_id: it.e, option: n.value },
          it.label + ' · ' + n.value);
        return;
      }
      if (n.classList.contains('crng')) {
        state.drag = false;
        state.holdUntil = Date.now() + 2500;
        const v = Number(n.value);
        /* 默认 number.set_value；water_heater 是 set_temperature + temperature 字段 */
        const dm = it.dom || n.dataset.dom || 'number';
        const svc = it.svc || (dm === 'water_heater' ? 'set_temperature' : 'set_value');
        const fld = it.field || (dm === 'water_heater' ? 'temperature' : 'value');
        const data = { entity_id: it.e };
        data[fld] = v;
        sendControl(dm, svc, data, it.label + ' ' + v + (it.unit || ''));
      }
    });
    box.addEventListener('pointerdown', (ev) => {
      if (ev.target.classList && ev.target.classList.contains('crng')) state.drag = true;
    });
    box.addEventListener('pointerup', () => { state.drag = false; });
  }

  function ctlSub(s, a) {
    if (a.current_temperature != null) return '室温 ' + a.current_temperature + '°';
    /* 晾衣架：只报三档位置，副标题别复述「已放下 50%」这种假百分比 */
    if (a.current_position != null) return '只能升 / 停 / 降，不报精确高度';
    if (a.percentage != null) return '当前风速 ' + a.percentage + '%';
    if (a.volume_level != null) return '音量 ' + Math.round(a.volume_level * 100) + '%';
    if (a.humidity != null) return '目标湿度 ' + a.humidity + '%';
    if (a.media_title) return a.media_title;
    return '';
  }
  function ctlHead(d) {
    return '<div class="ctl-head">' +
      `<span class="ctl-ico"><svg><use href="#${ICON[d.kind] || 'i-wave'}"/></svg></span>` +
      '<div><b id="ctlState">—</b><span id="ctlRoom"></span></div></div>';
  }
  /** 通用滑块：data-src 只用于「属性值 → 0-100」的回显换算，data-send 决定真正下发的值 */
  function slider(o) {
    const src = Number(o.src || 100);
    const unit = o.unit || '%';
    const v = Math.round((Number(o.val) || 0) / src * 100);
    return `<div class="ctl-slide"><span>${o.label}</span>` +
      `<input id="${o.id}" type="range" min="0" max="100" step="1" value="${v}"` +
      ` data-attr="${o.attr}" data-src="${src}" data-svc="${o.svc}" data-field="${o.field}"` +
      ` data-send="${o.pct ? 'pct' : 'val'}" data-dec="${o.dec ? 1 : 0}" data-unit="${unit}" data-label="${o.label}">` +
      `<b id="${o.id}Val">${v}${unit}</b></div>`;
  }
  function bindSliders(box, d) {
    box.querySelectorAll('input[type=range]').forEach((r) => {
      r.addEventListener('pointerdown', () => { state.drag = true; });
      r.addEventListener('input', () => {
        const o = $('#' + r.id + 'Val', box);
        if (o) o.textContent = r.value + (r.dataset.unit || '%');
      });
      r.addEventListener('change', () => {
        state.drag = false;
        /* 刚下发的 2.5 秒内不拿实体旧值覆盖滑块，等它回报上来再对齐 */
        state.holdUntil = Date.now() + 2500;
        const src = Number(r.dataset.src || 100);
        const pct = Number(r.value);
        let v = pct / 100 * src;
        v = r.dataset.dec === '1' ? Math.round(v * 100) / 100 : Math.round(v);
        const send = r.dataset.send === 'pct' ? pct : v;
        const dm = (r.dataset.svc || '').split('.')[0];
        const svc = (r.dataset.svc || '').split('.')[1];
        if (!dm || !svc) return;
        const data = { entity_id: d.entity };
        data[r.dataset.field] = send;
        sendControl(dm, svc, data, (r.dataset.label || '调节') + ' ' + pct + '%');
      });
    });
  }
  function wireCtl(box, d) {
    const pw = $('#ctlPower', box);
    if (pw) pw.addEventListener('click', () => {
      const on = isOn(d);
      const dom = d.entity.split('.')[0];
      let svc = 'toggle';
      if (dom === 'climate') svc = on ? 'turn_off' : 'turn_on';
      else if (dom === 'cover') svc = on ? 'close_cover' : 'open_cover';
      else if (dom === 'media_player') svc = on ? 'turn_off' : 'turn_on';
      else if (dom === 'lock') svc = on ? 'lock' : 'unlock';
      else if (dom === 'vacuum') svc = on ? 'stop' : 'start';
      else if (dom === 'humidifier' || dom === 'water_heater') svc = on ? 'turn_off' : 'turn_on';
      sendControl(dom, svc, { entity_id: d.entity }, (on ? '关闭' : '开启') + ' · ' + d.name);
    });
    bindSliders(box, d);
  }

  /* 只有开关的设备（绝大多数 switch）：给一个大开关 + 说明 + 实体信息 */
  const KIND_NOTE = {
    light: '这一路上只有通断，面板没有调光能力，所以这里就一个大开关。',
    plug: '插排 / 插座通断。接在上面的设备会一起断电，关之前留意正在跑的家电。',
    fan: '风扇类负载通断，转速由设备自己的档位决定，这里只能开和关。',
    fresh: '净化 / 新风通断，工作模式在设备面板或 App 上选。',
    heat: '加热类通断。',
    heater: '热水器通断，温度在设备本机或配套 App 上设。',
    cook: '厨电通断，具体程序在设备本机选。',
    media: '面板功能开关（禁麦 / 睡眠模式等）。',
    hub: '网关类功能开关。',
    toilet: '卫浴通断。'
  };
  function switchCtl(d) {
    const a = (st(d.entity) || { attributes: {} }).attributes || {};
    const box = el('div', 'ctl');
    const extra = [];
    if (a.brightness != null) {
      extra.push(slider({ id: 'ctlBri', label: '亮度', attr: 'brightness', src: 255, pct: true,
        svc: 'light.turn_on', field: 'brightness_pct', val: a.brightness }));
    }
    box.innerHTML =
      ctlHead(d) + extra.join('') +
      '<div class="ctl-foot"><button class="wide" id="ctlPower" type="button">—</button></div>' +
      `<div class="ctl-note">${KIND_NOTE[d.kind] || '这个实体只上报开关状态，页面按 turn_on / turn_off 直接下发。'}</div>`;
    wireCtl(box, d);
    return box;
  }
  function readOnlyCtl(d) {
    const box = el('div', 'ctl');
    box.innerHTML = ctlHead(d) +
      '<div class="ctl-note">这是只读实体（' + d.entity.split('.')[0] +
      ' 域），页面不会给它下发任何指令。下面列出它当前上报的数值。</div>';
    return box;
  }

  function climateCtl(d) {
    const a = (st(d.entity) || { attributes: {} }).attributes || {};
    const step = a.target_temp_step || 0.5;
    const lo = a.min_temp != null ? a.min_temp : 16;
    const hi = a.max_temp != null ? a.max_temp : 30;
    /* 浴霸这类没有温度能力的，不给温度区，免得下发 set_temperature 失败 */
    const canTemp = a.temperature != null || a.target_temp_step != null;
    const modes = a.hvac_modes || [];
    const fans = a.fan_modes || [];
    const presets = a.preset_modes || [];
    const box = el('div', 'ctl');
    box.innerHTML =
      ctlHead(d) +
      (canTemp
        ? '<div class="ctl-temp">' +
          '<button class="round" data-t="-1" type="button" aria-label="降温">−</button>' +
          `<div class="tt"><b data-attr="temperature" data-unit="°">${a.temperature == null ? '—' : a.temperature}</b>` +
          `<span>设定温度 · ${step}° 一档</span></div>` +
          '<button class="round" data-t="1" type="button" aria-label="升温">＋</button>' +
          '</div>'
        : '<div class="ctl-note">这个实体不上报目标温度（没有 target_temp_step），所以不给温度调节，只留模式和开关。</div>') +
      (modes.length
        ? `<div class="ctl-row">${modes.map((m) => `<button data-mode="${m}" type="button">${tr(HVAC, m)}</button>`).join('')}</div>` : '') +
      (fans.length
        ? `<div class="ctl-row sub">${fans.map((m) => `<button data-fan="${m}" type="button">${tr(FAN, m)}</button>`).join('')}</div>` : '') +
      (presets.length
        ? `<div class="ctl-row sub">${presets.map((m) => `<button data-preset="${m}" type="button">${tr(PRESET, m)}</button>`).join('')}</div>` : '') +
      '<div class="ctl-foot"><button class="wide" id="ctlPower" type="button">开机 / 关机</button></div>' +
      (canTemp ? `<div class="ctl-note">温度范围 ${lo}–${hi}°，模式 / 风速 / 预设都取实体自己上报的清单，页面不硬凑选项。</div>` : '');
    box.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
      const a2 = (st(d.entity) || { attributes: {} }).attributes || {};
      const stp = a2.target_temp_step || step;
      let t = a2.temperature != null ? a2.temperature : (a2.current_temperature != null ? a2.current_temperature : 26);
      t = Math.round((t + Number(b.dataset.t) * stp) / stp) * stp;
      t = Math.min(hi, Math.max(lo, Math.round(t * 10) / 10));
      sendControl('climate', 'set_temperature', { entity_id: d.entity, temperature: t }, '设定 ' + t + '°');
    }));
    $$('[data-mode]', box).forEach((b) => b.addEventListener('click', () => {
      sendControl('climate', 'set_hvac_mode', { entity_id: d.entity, hvac_mode: b.dataset.mode }, tr(HVAC, b.dataset.mode) + '模式');
      $$('[data-mode]', box).forEach((x) => x.classList.toggle('on', x === b));
    }));
    $$('[data-fan]', box).forEach((b) => b.addEventListener('click', () => {
      sendControl('climate', 'set_fan_mode', { entity_id: d.entity, fan_mode: b.dataset.fan }, '风速 ' + tr(FAN, b.dataset.fan));
      $$('[data-fan]', box).forEach((x) => x.classList.toggle('on', x === b));
    }));
    $$('[data-preset]', box).forEach((b) => b.addEventListener('click', () => {
      sendControl('climate', 'set_preset_mode', { entity_id: d.entity, preset_mode: b.dataset.preset }, '预设 ' + tr(PRESET, b.dataset.preset));
      $$('[data-preset]', box).forEach((x) => x.classList.toggle('on', x === b));
    }));
    wireCtl(box, d);
    return box;
  }
  function lightCtl(d) {
    const a = (st(d.entity) || { attributes: {} }).attributes || {};
    const modes = a.supported_color_modes || [];
    const dim = modes.length ? modes.some((m) => m !== 'onoff') : a.brightness != null;
    const box = el('div', 'ctl');
    box.innerHTML =
      ctlHead(d) +
      (dim
        ? slider({ id: 'ctlBri', label: '亮度', attr: 'brightness', src: 255, pct: true,
          svc: 'light.turn_on', field: 'brightness_pct', val: a.brightness == null ? 255 : a.brightness })
        : '<div class="ctl-note">这盏灯只上报开关（supported_color_modes = onoff），没有调光能力，所以不给亮度滑块。</div>') +
      '<div class="ctl-foot"><button class="wide" id="ctlPower" type="button">开灯 / 关灯</button></div>';
    wireCtl(box, d);
    return box;
  }
  function coverCtl(d) {
    const box = el('div', 'ctl');
    box.innerHTML =
      ctlHead(d) +
      /* 这台晾衣架只有「升 / 停 / 降」，supported_features=11 里没有 SET_POSITION，
         原来的「升降位置」进度条每次拖都会 400（cover.set_cover_position 不被支持），
         而且 current_position 只有 0/50/100 三档 —— 别再让它假装百分比 */
      '<div class="crow ro"><span class="clab">升降位置</span><b class="cval" id="covPos">—</b></div>' +
      /* open_cover 让晾衣杆降下来，close_cover 收上去 —— 按钮名要跟动作对得上 */
      '<div class="ctl-row"><button data-cov="close_cover" type="button">升起</button>' +
      '<button data-cov="stop_cover" type="button">暂停</button>' +
      '<button data-cov="open_cover" type="button">放下</button></div>' +
      '<div class="ctl-note">这台只上报「顶上 / 到底 / 中间」三档，报「中间」时面板按上一次到位推断；' +
      '它没有「停在某个高度」的能力，想停半空请按「暂停」。</div>';
    $$('[data-cov]', box).forEach((b) => b.addEventListener('click', () => {
      const t = { open_cover: '放下', stop_cover: '暂停', close_cover: '升起' }[b.dataset.cov];
      sendControl('cover', b.dataset.cov, { entity_id: d.entity }, t + ' · ' + d.name);
    }));
    wireCtl(box, d);
    return box;
  }
  function fanCtl(d) {
    const a = (st(d.entity) || { attributes: {} }).attributes || {};
    const presets = a.preset_modes || [];
    const box = el('div', 'ctl');
    box.innerHTML =
      ctlHead(d) +
      (a.percentage != null
        ? slider({ id: 'ctlPct', label: '风速', attr: 'percentage', src: 100,
          svc: 'fan.set_percentage', field: 'percentage', val: a.percentage }) : '') +
      (presets.length
        ? `<div class="ctl-row sub">${presets.map((m) => `<button data-preset="${m}" type="button">${tr(FAN, m)}</button>`).join('')}</div>` : '') +
      '<div class="ctl-foot"><button class="wide" id="ctlPower" type="button">开机 / 关机</button></div>' +
      '<div class="ctl-note">风速按实体支持的百分比下发，档位由实体自己提供。</div>';
    $$('[data-preset]', box).forEach((b) => b.addEventListener('click', () => {
      sendControl('fan', 'set_preset_mode', { entity_id: d.entity, preset_mode: b.dataset.preset }, '档位 ' + tr(FAN, b.dataset.preset));
      $$('[data-preset]', box).forEach((x) => x.classList.toggle('on', x === b));
    }));
    wireCtl(box, d);
    return box;
  }
  function mediaCtl(d) {
    const a = (st(d.entity) || { attributes: {} }).attributes || {};
    const box = el('div', 'ctl');
    box.innerHTML =
      ctlHead(d) +
      (a.volume_level != null
        ? slider({ id: 'ctlVol', label: '音量', attr: 'volume_level', src: 1, dec: true,
          svc: 'media_player.volume_set', field: 'volume_level', val: a.volume_level }) : '') +
      '<div class="ctl-row">' +
      '<button data-mp="media_previous_track" type="button">上一首</button>' +
      '<button data-mp="media_play_pause" type="button">播放 / 暂停</button>' +
      '<button data-mp="media_next_track" type="button">下一首</button>' +
      '</div>' +
      '<div class="ctl-row sub">' +
      '<button data-mp="volume_mute" data-arg="is_volume_muted:true" type="button">静音</button>' +
      '<button data-mp="volume_mute" data-arg="is_volume_muted:false" type="button">取消静音</button>' +
      '</div>' +
      ((a.source_list || []).length
        ? `<div class="ctl-row sub">${a.source_list.map((s) => `<button data-src="${s}" type="button">${s}</button>`).join('')}</div>` : '') +
      '<div class="ctl-foot"><button class="wide" id="ctlPower" type="button">开机 / 关机</button></div>' +
      '<div class="ctl-note">音量按实体上报的 volume_level 下发，音源清单由实体自己提供。</div>';
    $$('[data-mp]', box).forEach((b) => b.addEventListener('click', () => {
      const data = { entity_id: d.entity };
      if (b.dataset.arg) {
        const p = b.dataset.arg.split(':');
        data[p[0]] = p[1] === 'true';
      }
      sendControl('media_player', b.dataset.mp, data, b.textContent.trim() + ' · ' + d.name);
    }));
    $$('[data-src]', box).forEach((b) => b.addEventListener('click', () => {
      sendControl('media_player', 'select_source', { entity_id: d.entity, source: b.dataset.src }, '音源 ' + b.dataset.src);
    }));
    wireCtl(box, d);
    return box;
  }
  function humidCtl(d) {
    const a = (st(d.entity) || { attributes: {} }).attributes || {};
    const box = el('div', 'ctl');
    box.innerHTML =
      ctlHead(d) +
      (a.humidity != null
        ? slider({ id: 'ctlHum', label: '湿度', attr: 'humidity', src: 100,
          svc: 'humidifier.set_humidity', field: 'humidity', val: a.humidity }) : '') +
      ((a.available_modes || []).length
        ? `<div class="ctl-row">${a.available_modes.map((m) => `<button data-mode="${m}" type="button">${m}</button>`).join('')}</div>` : '') +
      '<div class="ctl-foot"><button class="wide" id="ctlPower" type="button">开机 / 关机</button></div>';
    $$('[data-mode]', box).forEach((b) => b.addEventListener('click', () => {
      sendControl('humidifier', 'set_mode', { entity_id: d.entity, mode: b.dataset.mode }, '模式 ' + b.dataset.mode);
      $$('[data-mode]', box).forEach((x) => x.classList.toggle('on', x === b));
    }));
    wireCtl(box, d);
    return box;
  }
  function heaterCtl(d) {
    const a = (st(d.entity) || { attributes: {} }).attributes || {};
    const box = el('div', 'ctl');
    box.innerHTML =
      ctlHead(d) +
      '<div class="ctl-temp">' +
      '<button class="round" data-t="-1" type="button" aria-label="降温">−</button>' +
      `<div class="tt"><b data-attr="temperature" data-unit="°">${a.temperature == null ? '—' : a.temperature}</b>` +
      '<span>目标温度 · 1° 一档</span></div>' +
      '<button class="round" data-t="1" type="button" aria-label="升温">＋</button>' +
      '</div>' +
      ((a.operation_list || []).length
        ? `<div class="ctl-row">${a.operation_list.map((m) => `<button data-op="${m}" type="button">${m}</button>`).join('')}</div>` : '') +
      '<div class="ctl-foot"><button class="wide" id="ctlPower" type="button">开机 / 关机</button></div>';
    box.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
      const a2 = (st(d.entity) || { attributes: {} }).attributes || {};
      const lo = a2.min_temp != null ? a2.min_temp : 30;
      const hi = a2.max_temp != null ? a2.max_temp : 75;
      let t = a2.temperature != null ? a2.temperature : 45;
      t = Math.min(hi, Math.max(lo, t + Number(b.dataset.t)));
      sendControl('water_heater', 'set_temperature', { entity_id: d.entity, temperature: t }, '设定 ' + t + '°');
    }));
    $$('[data-op]', box).forEach((b) => b.addEventListener('click', () => {
      sendControl('water_heater', 'set_operation_mode', { entity_id: d.entity, operation_mode: b.dataset.op }, '模式 ' + b.dataset.op);
    }));
    wireCtl(box, d);
    return box;
  }
  function lockCtl(d) {
    const box = el('div', 'ctl');
    box.innerHTML =
      ctlHead(d) +
      '<div class="ctl-row"><button data-lk="lock" type="button">上锁</button>' +
      '<button data-lk="unlock" type="button">开锁</button></div>' +
      '<div class="ctl-note">门锁操作会直接下发，执行前确认门口情况。</div>';
    $$('[data-lk]', box).forEach((b) => b.addEventListener('click', () => {
      sendControl('lock', b.dataset.lk, { entity_id: d.entity }, (b.dataset.lk === 'lock' ? '上锁' : '开锁') + ' · ' + d.name);
    }));
    return box;
  }
  function vacCtl(d) {
    const box = el('div', 'ctl');
    box.innerHTML =
      ctlHead(d) +
      '<div class="ctl-row"><button data-vc="start" type="button">开始清扫</button>' +
      '<button data-vc="pause" type="button">暂停</button>' +
      '<button data-vc="return_to_base" type="button">回充</button></div>' +
      '<div class="ctl-row sub"><button data-vc="stop" type="button">停止</button>' +
      '<button data-vc="locate" type="button">定位</button></div>';
    $$('[data-vc]', box).forEach((b) => b.addEventListener('click', () => {
      const t = { start: '开始清扫', pause: '暂停', return_to_base: '回充', stop: '停止', locate: '定位' }[b.dataset.vc];
      sendControl('vacuum', b.dataset.vc, { entity_id: d.entity }, t + ' · ' + d.name);
    }));
    return box;
  }

  /* ── 弹窗底部的实体信息：便于核对设备到底挂到哪个实体 ── */
  const SKIP_ATTR = {
    friendly_name: 1, icon: 1, entity_picture: 1, supported_features: 1,
    device_class: 1, unit_of_measurement: 1, attribution: 1, restore_entity: 1,
    supported_color_modes: 1, effect_list: 1, sound_mode_list: 1, source_list: 1,
    hvac_modes: 1, fan_modes: 1, preset_modes: 1, operation_list: 1, available_modes: 1,
    min_temp: 1, max_temp: 1, target_temp_step: 1, options: 1,
    /* 已经由上方控件展示过的，不重复列 */
    volume_level: 1, brightness: 1, percentage: 1, current_position: 1,
    is_volume_muted: 1, media_content_type: 1, media_duration: 1, media_position: 1
  };
  const fmtNum = (v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const infoRow = (k, v) => `<div class="ci-r"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  function infoCard(d, open) {
    const box = el('div', 'ctl-info');
    box.innerHTML = '<button class="ci-h' + (open ? ' open' : '') + '" type="button" id="ciToggle">实体信息<i>▾</i></button>' +
      '<div class="ci-b" id="ctlInfoBody"' + (open ? '' : ' hidden') + '></div>';
    const btn = $('#ciToggle', box);
    const body = $('#ctlInfoBody', box);
    btn.addEventListener('click', () => {
      const show = body.hidden;
      body.hidden = !show;
      btn.classList.toggle('open', show);
    });
    return box;
  }
  function ago(iso) {
    const t = new Date(iso).getTime();
    if (!isFinite(t)) return '—';
    const sec = Math.max(0, (Date.now() - t) / 1000);
    if (sec < 60) return Math.round(sec) + ' 秒前';
    if (sec < 3600) return Math.round(sec / 60) + ' 分钟前';
    if (sec < 86400) return Math.round(sec / 3600) + ' 小时前';
    return Math.round(sec / 86400) + ' 天前';
  }
  /** 同一个物理设备的读数实体（米家 object_id 前 4 段相同），只读列出 */
  function related(d) {
    const h = hass();
    if (!h) return [];
    const id = d.entity.split('.')[1] || '';
    const key = id.split('_').slice(0, 4).join('_');
    if (key.length < 10) return [];
    const out = [];
    Object.keys(h.states).forEach((e) => {
      const dom = e.split('.')[0];
      if (!['sensor', 'binary_sensor', 'number'].includes(dom)) return;
      if (e === d.entity || !(e.split('.')[1] || '').startsWith(key)) return;
      const s = h.states[e];
      const a = s.attributes || {};
      const fn = a.friendly_name || e;
      /* 「XX 模式」这类是配置项不是读数，列出来只会干扰 */
      if (/(模式|指示灯|延时时间|Indicator)/i.test(fn)) return;
      out.push({ n: fn, v: s.state + (a.unit_of_measurement ? ' ' + a.unit_of_measurement : '') });
    });
    return out.slice(0, 6);
  }
  function infoRows(d, s, a) {
    const rows = [];
    rows.push(infoRow('实体 ID', d.entity));
    rows.push(infoRow('域 / 类型', d.entity.split('.')[0] + ' · ' + d.kind));
    rows.push(infoRow('房间', roomName(d.room)));
    rows.push(infoRow('当前状态', s.state));
    if (s.last_changed) rows.push(infoRow('最后变化', ago(s.last_changed)));
    Object.keys(a).sort().forEach((k) => {
      if (SKIP_ATTR[k]) return;
      let v = a[k];
      if (v == null) return;
      if (typeof v === 'object') {
        if (!Array.isArray(v)) return;
        v = v.join('、');
      }
      if (String(v).length > 40) return;
      rows.push(infoRow(k, fmtNum(v)));
    });
    const rel = state.rel || [];
    if (rel.length) rows.push(infoRow('同设备读数', rel.map((x) => x.n + ' ' + x.v).join(' · ')));
    return rows.join('');
  }

  /* ── 摄像机 ── */
  const camCache = {};
  function camUrl(entity) {
    const h = hass();
    if (!h) return Promise.reject(new Error('no hass'));
    const path = '/api/camera_proxy/' + entity + '?t=' + Date.now();
    if (h.fetchWithAuth) return h.fetchWithAuth(path).then((r) => (r.ok ? r.blob() : Promise.reject(r.status)));
    return fetch(path, { headers: { Authorization: 'Bearer ' + tok() } }).then((r) => (r.ok ? r.blob() : Promise.reject(r.status)));
  }
  function tok() {
    try { return JSON.parse(localStorage.hassTokens).access_token; } catch (e) { return ''; }
  }
  /* 取不到图 ≠ 相机离线：HA 的 camera_proxy 会因集成的取流链路坏了而返回 500
     （相机在录像，可 camera 实体一直 unavailable，正是这种情况）。
     所以先看实体状态再挑说法，别张口就「离线」 */
  const CAM_ERR = {
    dead: ['HA 取不到画面 · 该相机实体不可用', '取不到画面'],
    live: ['取图失败 · 稍候自动重试', '取图失败'],
  };
  function mountShot(box, entity) {
    camUrl(entity).then((b) => {
      const url = URL.createObjectURL(b);
      let img = box.querySelector('img');
      if (!img) {
        box.innerHTML = '';
        img = el('img');
        img.alt = '';
        box.append(img);
        box.classList.remove('empty');
      }
      img.src = url;
      if (camCache[entity]) URL.revokeObjectURL(camCache[entity]);
      camCache[entity] = url;
    }).catch(() => {
      if (box.querySelector('img')) return;
      box.classList.add('empty');
      const cs = st(entity);
      const dead = !cs || cs.state === 'unavailable' || cs.state === 'unknown';
      const msg = CAM_ERR[dead ? 'dead' : 'live'][box.classList.contains('cam-slot') ? 1 : 0];
      /* 概览小格：只换底部那行字，别把相机名字和布局一起抹掉 */
      const b = box.querySelector('b');
      if (b) { b.textContent = msg; return; }
      box.innerHTML = '<svg><use href="#i-cam"/></svg><b>' + msg + '</b>';
    });
  }
  function openCamera(entity, name) {
    /* 从复合弹窗里点「查看画面」进来：停掉那边的轮询，否则它会继续去找已经不在的 [data-ci] */
    state.ctl = null;
    state.ci = null;
    clearInterval(state.ctlTimer);
    showLayer(name, '实时抓图 · 每 9 秒刷新');
    $('#layerBody').innerHTML = '<div class="cam-big" id="camBig"><div class="cam-load">正在取图…</div></div>' +
      '<div class="cam-tip">抓图来自 HA 的 camera_proxy，不是持续视频流。要在面板里看直播，得给摄像头打开 RTSP 或 HLS。</div>';
    const box = $('#camBig');
    mountShot(box, entity);
    clearInterval(state.camTimer);
    state.camTimer = setInterval(() => { if (state.layer && $('#camBig')) mountShot($('#camBig'), entity); else clearInterval(state.camTimer); }, 9000);
  }

  /* ── 概览 ── */
  function card(title, icon, badge, bodyHtml, wide) {
    const c = el('div', 'card' + (wide ? ' wide' : ''));
    c.innerHTML = `<div class="card-head"><svg><use href="#${icon}"/></svg>${title}${badge ? `<span class="badge">${badge}</span>` : ''}</div>${bodyHtml}`;
    return c;
  }
  function mbps(id) {
    const v = num(id, null);
    return v == null ? null : (v * 8 / 1024);
  }
  /* ── 国网用电 ── */
  function pw() { return (LH.config.overview || {}).power || {}; }
  function pv(key) { return num(pw()[key], null); }
  function ptxt(key) {  // 日期/时间这类非数值状态
    const id = pw()[key];
    if (!id) return null;
    const s = st(id);
    return s && s.state && s.state !== 'unknown' ? s.state : null;
  }
  function fmtN(v, n) { return v == null ? '—' : v.toFixed(n == null ? 2 : n); }
  function paintPowerChip() {
    const node = $('#wKwh');
    if (!node) return;
    const id = LH.config.weather.kwh;
    if (!id) { node.hidden = true; return; }
    const k = num(id, null);
    const d = ptxt('dayDate');
    node.hidden = false;
    node.innerHTML = '<svg class="k-ico"><use href="#i-bolt"/></svg><b>' + dsegNum(fmtN(k)) +
      '</b><span>kWh' + (d ? ' · ' + dsegNum(d.slice(5)) : '') + '</span>';
  }

  /* ── 用电详情内容：弹窗和右侧占位卡共用同一段 ── */
  function powerDetailHtml() {
    const P = pw();
    const kwhM = pv('kwhMonth'), bill = pv('billMonth'), bal = pv('balance');
    const kwhY = pv('kwhYear'), costY = pv('costYear');
    const kwhD = pv('kwhDay'), dayD = ptxt('dayDate');
    const kwhL = pv('kwhLastMonth'), costL = pv('costLastMonth');
    const pD = pv('pDay'), vD = pv('vDay'), pM = pv('pMonth'), vM = pv('vMonth');

    let h =
      `<div class="pw-big"><b>${fmtN(kwhM)}</b><span>kWh · 本月累计</span></div>
       <div class="pwr">
         <div class="pwr-i"><em>本月电费</em><b>${fmtN(bill)} 元</b></div>
         <div class="pwr-i"><em>账户余额</em><b>${fmtN(bal)} 元</b></div>
         <div class="pwr-i"><em>年度电费</em><b>${fmtN(costY, 0)} 元</b></div>
       </div>`;

    if (pM != null || vM != null) {
      const tot = (pM || 0) + (vM || 0) || 1;
      h += '<div class="rp-group">本月峰谷</div><div class="pw-split">' +
        [['峰电', pM], ['谷电', vM]].map(([n, v]) =>
          `<div class="pw-seg"><em>${n}</em><b>${fmtN(v)} kWh</b>` +
          `<i><u style="width:${v == null ? 0 : Math.round(v / tot * 100)}%"></u></i>` +
          `<span>${v == null ? '—' : Math.round(v / tot * 100) + '%'}</span></div>`).join('') +
        '</div>';
    }

    const g = ((st(P.graph30) || {}).attributes || {}).graph || [];
    const last = g.slice(-7);
    if (last.length) {
      const mx = Math.max(...last.map((x) => Number(x.ele) || 0)) || 1;
      h += '<div class="rp-group">近 7 天（kWh）</div><div class="pw-chart">' +
        last.map((x) => {
          const v = Number(x.ele) || 0;
          const d = String(x.day || '');
          return `<div class="pw-col"><b>${v.toFixed(1)}</b>` +
            `<div class="pw-bar"><i style="height:${Math.max(2, Math.round(v / mx * 100))}%"></i></div>` +
            `<em>${d.length === 8 ? d.slice(4, 6) + '-' + d.slice(6) : d}</em></div>`;
        }).join('') + '</div>';
    }

    h += '<div class="rp-group">明细</div><div class="pw-rows">' + [
      ['取数日期', dayD || '—'],
      ['昨日用电', fmtN(kwhD) + ' kWh'],
      ['昨日峰 / 谷', fmtN(pD) + ' / ' + fmtN(vD) + ' kWh'],
      ['上月用电', (kwhL == null ? '—' : Math.round(kwhL)) + ' kWh'],
      ['上月电费', fmtN(costL, 0) + ' 元'],
      ['年度累计', (kwhY == null ? '—' : Math.round(kwhY)) + ' kWh']
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('') + '</div>';
    return h;
  }

  /* ── 用电详情：顶部电量行 / 左栏「全屋」都能打开 ── */
  function openPower() {
    const P = pw();
    if (!Object.keys(P).length) { toast('还没接电表'); return; }
    showLayer('用电', '网上国网 · 数据每天更新一次（T+1）');
    const body = $('#layerBody');
    body.innerHTML = '';
    const box = el('div', 'pw-detail');
    box.innerHTML = powerDetailHtml();
    body.append(box);
  }

  /* ── 类别列表：左栏「灯光 5/26」这类统计点进去看全部，开关直接下发 ── */
  function openKind(kind) {
    const all = LH.devices.filter((d) => d.kind === kind);
    if (!all.length) { toast('这个类别还没有上图设备'); return; }
    clearInterval(state.kindTimer);
    const sub = () => all.filter(isOn).length + ' / ' + all.length + ' 开启 · 点条目看详情';
    showLayer(KIND_NAME[kind] || kind, sub());
    const body = $('#layerBody');
    body.innerHTML = '';
    const wrap = el('div', 'klist');
    LH.rooms.forEach((r) => {
      const items = all.filter((d) => d.room === r.id);
      if (!items.length) return;
      wrap.append(el('div', 'rp-group', r.name));
      items.forEach((d) => wrap.append(rpItem(d)));
    });
    body.append(wrap);
    /* 只刷数值不重建 DOM，否则每 2 秒点一下就被重置 */
    state.kindTimer = setInterval(() => {
      if (!state.layer) { clearInterval(state.kindTimer); return; }
      $$('#layerBody [data-dev]').forEach((item) => {
        const d = LH.devices.find((x) => x.id === item.dataset.dev);
        if (!d) return;
        const s = item.querySelector('.rn i');
        if (s) s.textContent = devText(d);
        const rv = item.querySelector('.rv');
        if (rv) rv.textContent = rvText(d);
        const sw = item.querySelector('.sw');
        if (sw) sw.classList.toggle('on', isOn(d));
      });
      const t = $('#layerSub');
      if (t) t.textContent = sub();
    }, 2000);
  }
  /* ── 其他设备 = 米家已入网、但本页还没接进来的设备 ──────────────────
     判据：entity_registry 里 platform 属于 xiaomi_home / xiaomi_miot，
     且它所属 device 没有任何一个实体被本页引用。快照来自 gen_lovehome_data.py
     （missing_ents.json），打开时优先用 hass.callWS 实时重算。 */
  function usedEnts() {
    const s = new Set();
    (LH.devices || []).forEach((d) => {
      if (d.entity) s.add(d.entity);
      ((d.ctl && d.ctl.groups) || []).forEach((g) => {
        (g.items || []).forEach((it) => { if (it.e) s.add(it.e); });
      });
    });
    (LH.readouts || []).forEach((r) => { if (r.entity) s.add(r.entity); });
    ((LH.config && LH.config.cameras) || []).forEach((c) => { if (c.entity) s.add(c.entity); });
    ((LH.config && LH.config.gates) || []).forEach((g) => { if (g.entity) s.add(g.entity); });
    (LH.scenes || []).forEach((sc) => (sc.actions || []).forEach((a) => {
      const e = a.e || a.entity; if (e) s.add(e);
    }));
    /* v222：家人（含墨墨那块手表）已在这里展示，别再当成「未接入的米家设备」列一遍。
       手表 14 个实体里只用了 3 个，但「其他设备」是按 device_id 归并的 → 只要
       有一个实体被认领，整台设备就跳过。 */
    (((LH.config || {}).overview || {}).people || []).forEach((p) => {
      if (p.entity) s.add(p.entity);
      const w = p.watch;
      if (w) ['tracker', 'charge', 'place'].forEach((k) => { if (w[k]) s.add(w[k]); });
    });
    return s;
  }

  async function loadMissing(force) {
    if (state.missing && !force) return state.missing;
    const h = hass();
    if (!h || !h.callWS) return LH.missing || [];
    try {
      const [ents, devs] = await Promise.all([
        h.callWS({ type: 'config/entity_registry/list' }),
        h.callWS({ type: 'config/device_registry/list' }),
      ]);
      const used = usedEnts();
      const usedDev = new Set();
      (ents || []).forEach((e) => {
        if (used.has(e.entity_id) && e.device_id) usedDev.add(e.device_id);
      });
      const D = {};
      (devs || []).forEach((d) => { D[d.id] = d; });
      const agg = {};
      (ents || []).forEach((e) => {
        if (e.disabled_by || e.hidden_by) return;
        const plat = e.platform || '';
        /* 跳过这些纯辅助 / 状态域：不是设备控制实体 */
        const SKIP = ['update.', 'automation.', 'script.', 'scene.', 'sun.', 'zone.',
                      'calendar.', 'schedule.', 'todo.', 'shopping_list.', 'image_processing.',
                      'stt.', 'tts.', 'assist_satellite.', 'conversation.', 'notify.'];
        if (SKIP.some((x) => e.entity_id.indexOf(x) === 0)) return;
        const dv = D[e.device_id] || {};
        const nm = dv.name_by_user || dv.name || '';
        if (e.device_id && usedDev.has(e.device_id)) return;
        const k = e.device_id || e.entity_id;
        const a = agg[k] || (agg[k] = { name: nm || e.entity_id, model: dv.model || '', plat: plat, ents: [] });
        a.ents.push(e.entity_id);
      });
      const rows = Object.keys(agg).map((k) => {
        const v = agg[k];
        const sts = v.ents.map((x) => (st(x) || {}).state);
        return {
          name: v.name, model: v.model, plat: v.plat, n: v.ents.length,
          doms: Array.from(new Set(v.ents.map((x) => x.split('.')[0]))).sort(),
          unavail: !!sts.length && sts.every((x) => x === 'unavailable'),
          ents: v.ents.slice().sort(),
        };
      });
      rows.sort((a, b) => (a.unavail ? 1 : 0) - (b.unavail ? 1 : 0)
        || (a.plat < b.plat ? -1 : a.plat > b.plat ? 1 : 0) || b.n - a.n);
      state.missing = rows;
    } catch (err) {
      console.warn('[LoveHome] 未接入清单实时计算失败，用生成时的快照', err);
    }
    return state.missing || LH.missing || [];
  }

  const PLAT_NAME = { xiaomi_home: 'Xiaomi Home（官方集成）', xiaomi_miot: 'Xiaomi Miot（云/本地兼容）' };
  const DOM_NAME = {
    sensor: '读数', binary_sensor: '状态', switch: '开关', light: '灯', button: '动作',
    event: '事件', number: '数值', select: '选项', camera: '摄像', notify: '通知',
    device_tracker: '定位', update: '升级', text: '文本',
  };

  function renderMissing(rows) {
    const body = $('#layerBody');
    body.innerHTML = '';
    const note = el('div', 'miss-note');
    note.innerHTML = '这些是<b>米家 App 里已经入网</b>、但本页还没接进来的设备。' +
      '点一条可以看它有哪些实体，照着实体名就能接进来。';
    body.append(note);
    const loose = looseDevs();
    if (loose.length) {
      body.append(el('div', 'miss-grp', '没上户型图的设备'));
      const w = el('div', 'klist');
      loose.forEach((d) => w.append(rpItem(d)));
      body.append(w);
    }
    if (!rows.length) {
      body.append(el('div', 'miss-empty', '米家设备都已接入本页'));
      return;
    }
    const byPlat = {};
    rows.forEach((r, i) => { (byPlat[r.plat] || (byPlat[r.plat] = [])).push({ r: r, i: i }); });
    Object.keys(byPlat).sort().forEach((plat) => {
      body.append(el('div', 'miss-grp', (PLAT_NAME[plat] || plat) + ' · ' + byPlat[plat].length + ' 台'));
      byPlat[plat].forEach(({ r, i }) => {
        const it = el('button', 'miss-i' + (r.unavail ? ' dead' : ''));
        it.type = 'button';
        it.dataset.mi = i;
        it.innerHTML = '<span class="mi-n">' + r.name + '</span>' +
          '<span class="mi-m">' + (r.model || '未知型号') + '</span>' +
          '<b class="mi-b">' + r.n + ' 实体</b>' +
          (r.unavail ? '<b class="mi-b off">离线</b>' : '');
        body.append(it);
        const box = el('div', 'mi-ents');
        box.innerHTML = '<div class="mi-doms">' + r.doms.map((d) => (DOM_NAME[d] || d)).join(' · ') + '</div>' +
          r.ents.map((e) => '<code>' + e + '</code>').join('') +
          '<div class="mi-import"><button type="button" class="mi-import-btn" data-mi="' + i + '">➕ 导入到面板（选实体）</button></div>';
        box.hidden = true;
        body.append(box);
        it.addEventListener('click', () => { box.hidden = !box.hidden; it.classList.toggle('open', !box.hidden); });
        box.querySelector('.mi-import-btn').addEventListener('click', (ev) => {
          ev.stopPropagation();
          importMissingRow(r);
        });
      });
    });
  }

  /* 从「其他设备」里把一台未接入设备的某个实体导入到面板
     弹窗：列出该设备所有实体（带 domain / 状态 / friendly_name）→ 用户点一个 → 自动创建设备 */
  function importMissingRow(row) {
    const h = hass();
    if (!h) { alert('未连接到 HA'); return; }
    const DEVICE_KIND = {
      light: 'light', switch: 'plug', climate: 'ac', cover: 'cover',
      fan: 'fan', media_player: 'media', lock: 'lock', camera: 'cam',
      water_heater: 'heater', humidifier: 'appliance', vacuum: 'appliance',
      siren: 'appliance', valve: 'appliance', select: 'panel', button: 'panel',
      number: 'sensor', binary_sensor: 'sensor', sensor: 'sensor'
    };
    const ENTS_SKIP = new Set(['binary_sensor', 'sensor']);  // 纯状态类不建议当设备
    const ctrEnts = row.ents.filter((e) => !ENTS_SKIP.has(e.split('.')[0]));
    const rows = ctrEnts.length ? ctrEnts : row.ents;  // 全是状态类就全列出来

    let html = '<div class="mi-import-dialog"><b>从「' + row.name + '」选一个实体接入面板</b>' +
      '<div class="mi-import-list">';
    rows.forEach((eid) => {
      const s = h.states[eid] || {};
      const fname = (s.attributes && s.attributes.friendly_name) || eid;
      const domain = eid.split('.')[0];
      const state = s.state || '—';
      html += '<button type="button" class="mi-ent-pick" data-eid="' + eid + '">' +
        '<span class="mi-ent-fn">' + fname + '</span>' +
        '<code class="mi-ent-id">' + eid + '</code>' +
        '<span class="mi-ent-state">' + state + '</span>' +
        '</button>';
    });
    html += '</div><div class="mi-import-hint">选一个最有代表性的实体（比如这台空调的 climate.*），' +
      '面板会自动推断类型和图标。坐标空着也行，稍后在编辑器里拖到户型图上。</div></div>';

    const dlg = el('div', 'lh-ed-dialog');
    dlg.innerHTML = '<div class="lh-ed-dialog-mask"></div><div class="lh-ed-dialog-body" style="max-width:560px">' + html +
      '<div class="lh-ed-dialog-foot"><button type="button" class="mi-import-cancel">取消</button></div></div>';
    document.body.appendChild(dlg);
    setTimeout(() => dlg.classList.add('open'), 10);
    const closeIt = () => dlg.remove();
    dlg.querySelector('.lh-ed-dialog-mask').addEventListener('click', closeIt);
    dlg.querySelector('.mi-import-cancel').addEventListener('click', closeIt);
    dlg.querySelectorAll('.mi-ent-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        const eid = btn.dataset.eid;
        const domain = eid.split('.')[0];
        const kind = DEVICE_KIND[domain] || 'appliance';
        const s = h.states[eid] || {};
        const fname = (s.attributes && s.attributes.friendly_name) || eid;
        // 加到 LH.devices
        window.LH.devices = window.LH.devices || [];
        const newDev = {
          id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: fname, kind: kind, entity: eid, room: '', x: null, y: null
        };
        window.LH.devices.push(newDev);
        // 持久化
        if (window.LHEditor && window.LHEditor.saveConfig) window.LHEditor.saveConfig();
        closeIt();
        // 触发主界面重绘
        document.dispatchEvent(new CustomEvent('LOVEHOME_RERENDER'));
        // 刷新未接入清单
        state.missing = null;
        loadMissing(true).then(() => openOther(true));
        toastHint('已添加「' + fname + '」到面板 · 打开编辑器配房间/位置');
      });
    });
  }

  async function openOther(force) {
    if (state.otherBusy) return;
    state.otherBusy = true;
    clearInterval(state.otherTimer);
    showLayer('其他设备', '正在读取米家设备清单…');
    try {
      const rows = await loadMissing(!!force);
      const dead = rows.filter((r) => r.unavail).length;
      $('#layerSub').textContent = rows.length ? rows.length + ' 台未接入' +
        (dead ? ' · ' + dead + ' 台离线' : '') + ' · 点一条看实体' : '没有未接入的设备';
      renderMissing(rows);
    } finally {
      state.otherBusy = false;
    }
  }

  /* 概览 / 家电都走浮层：不再整屏盖住户型图，弹窗一关就回到原来那一屏 */
  function openOverview() {
    showLayer('家中概览', '家人 · 用电 · 安防 · 温湿度 · 电池 · 摄像头 · 网络 · 系统 · 其他设备', 'pop-wide');
    $('#layerBody').innerHTML = '<div class="cards layer-cards" id="overviewCards"></div>';
    buildOverview();
    clearInterval(state.pageTimer);
    state.pageTimer = setInterval(() => {
      if (!state.layer || !$('#overviewCards')) return clearInterval(state.pageTimer);
      buildOverview();
    }, 12000);
  }

  function buildOverview() {
    const box = $('#overviewCards');
    if (!box) return;
    box.innerHTML = '';
    const h = hass();
    const down = mbps(LH.config.overview.netDown);
    const up = mbps(LH.config.overview.netUp);
    /* 卡片顺序（v212 起，用户要求）：用电 · 安防 · 温湿度 · 电池耗材 · 摄像头 排前面，
       网络 / 系统 / 其他设备 这三张「运维向」的挪到最后面 —— 它们不是天天看的东西。
       三张卡的构造都留在函数末尾，变量（down/up/nEnt）照旧在上面算。
       v217：最前面加「家人」（ping 判在线，齐齐两台设备任一在线即算在家）。 */
    const PPL = (LH.config.overview || {}).people || [];
    if (PPL.length) {
      const homeN = PPL.filter((p) => { const s = st(p.entity); return !!(s && s.state === 'on'); }).length;
      let withWatch = 0;
      const ph = '<div class="ppl-grid">' + PPL.map((p, pi) => {
        const s = st(p.entity);
        const on = !!(s && s.state === 'on');
        /* v222：配了手表的（墨墨）名字下面多一行小字：电量 · 充电 · 在哪。
           位置只在出门时报（在家那行已经写着「在家」，再说一遍地址是废话） */
        const w = watchOf(p);
        const line = w ? watchLine(w) : '';
        if (line) withWatch++;
        const label = p.name || ('家人 ' + (pi + 1));
        return '<div class="ppl-i tap' + (on ? ' on' : '') + (line ? ' has-w' : '') +
          (w && w.batt != null && w.batt <= WATCH_LOW ? ' low' : '') + '"' +
          ' data-idx="' + pi + '">' +
          '<i class="d ' + (on ? 'ok' : 'no') + '"></i>' +
          '<div class="ppl-m"><span>' + label + '</span>' +
          (line ? '<em>' + line + '</em>' : '') + '</div>' +
          '<b>' + (on ? '在家' : '离家') + '</b></div>';
      }).join('') + '</div>' +
        '<div class="card-sub">按设备联网判定 · 手机休眠时可能短时显示离家'
        + ' · 点一行看详情</div>';
      const pc = card('家人', 'i-user', homeN + ' 人在家', ph);
      /* v225：每一行都可点 → 详情页 */
      pc.querySelectorAll('.ppl-i').forEach((row) => {
        row.addEventListener('click', () => {
          const idx = Number(row.dataset.idx);
          const p = PPL[idx];
          if (p) openPerson(p, idx);
        });
      });
      box.append(pc);
    }

    // 用电：配了国网实体就显示真实数据，没配就退回占位卡片
    const P = pw();
    const kwhM = pv('kwhMonth'), bill = pv('billMonth'), bal = pv('balance');
    const kwhY = pv('kwhYear'), costY = pv('costYear');
    const kwhD = pv('kwhDay'), dayD = ptxt('dayDate');
    const kwhL = pv('kwhLastMonth'), costL = pv('costLastMonth');
    if (Object.keys(P).length) {
      const c = card('用电', 'i-bolt', dayD ? dayD.slice(5) : '国网',
        `<div class="kv"><b>${fmtN(kwhM)}</b><span>kWh 本月累计</span></div>
         <div class="pwr">
           <div class="pwr-i"><em>本月电费</em><b>${fmtN(bill)} 元</b></div>
           <div class="pwr-i"><em>账户余额</em><b>${fmtN(bal)} 元</b></div>
           <div class="pwr-i"><em>年度累计</em><b>${kwhY == null ? '—' : Math.round(kwhY)} kWh</b></div>
         </div>
         <div class="card-sub">昨日 ${fmtN(kwhD)} kWh · 上月 ${kwhL == null ? '—' : Math.round(kwhL)} kWh（${fmtN(costL)} 元）· 年度电费 ${fmtN(costY, 0)} 元</div>
         <div class="card-sub">国网数据 T+1，每天更新一次 · 点开看峰谷与 7 天趋势</div>`);
      c.classList.add('tap');
      c.addEventListener('click', openPower);
      box.append(c);
    } else {
      box.append(card('本月电费', 'i-bolt', '待接入',
        `<div class="kv"><b>—</b><span>尚无电表数据</span></div>
         <div class="bars">${Array.from({ length: 7 }, () => '<i style="height:6%"></i>').join('')}</div>
         <div class="card-sub">要显示电费得装国网「网上国网」集成或加计量插座</div>`));
    }

    const nEnt = h ? Object.keys(h.states).length : 0;

    box.append(card('安防 · 网关', 'i-lock', '实时',
      `<div class="gate-list">${(LH.config.gates || []).map((g) => {
        const s = st(g.entity);
        const ok = s && !['unavailable', 'off', 'unknown'].includes(s.state) && s.state !== 'Unlocked';
        return `<div class="gate"><i class="${ok ? 'ok' : 'no'}"></i><span>${g.name}</span><b>${fmtGate(g.entity)}</b></div>`;
      }).join('')}</div>`));

    /* 各屋温湿度：数据就是房间面板那一套（rooms[].temp / rooms[].hum），
       哪个屋子没传感器就整行跳过；按温度降序，最热/最潮的排在最前面。 */
    const envs = LH.rooms.map((r) => {
      const t = r.temp ? num(r.temp, null) : null;
      const hh = r.hum ? num(r.hum, null) : null;
      return (t == null && hh == null) ? null : { n: r.name, t: t, h: hh };
    }).filter(Boolean);
    envs.sort((a, b) => (b.t == null ? -99 : b.t) - (a.t == null ? -99 : a.t));
    if (envs.length) {
      const avg = roomAvg('temp');
      const htm = '<div class="env-grid">' + envs.map((x) =>
        `<div class="env-i"><span>${x.n}</span>` +
        `<b>${x.t == null ? '—' : x.t.toFixed(1) + '°'}</b>` +
        `<em>${x.h == null ? '—' : Math.round(x.h) + '%'}</em></div>`).join('') + '</div>';
      box.append(card('各屋温湿度', 'i-temp',
        avg == null ? '实时' : '均温 ' + avg.toFixed(1) + '°', htm, true));
    }

    /* 电池 · 耗材：只列读得到数的（离线 / unknown 的实体整条跳过），
       按剩余量升序排 —— 快没电的、该换滤芯的自然排到最前面，一眼看得到。 */
    const SUP = LH.supplies || {};
    const supList = (arr) => (arr || [])
      .map((it) => {
        const v = num(it.e, null);
        return v == null ? null : { n: it.n, v: Math.round(v) };
      })
      .filter(Boolean)
      .sort((a, b) => a.v - b.v);
    const bats = supList(SUP.battery);
    const cons = supList(SUP.consume);
    if (bats.length || cons.length) {
      const LOW_B = 40, LOW_C = 20;      // 电池 ≤40% / 耗材 ≤20% 就算该留意了
      const lowN = bats.filter((x) => x.v <= LOW_B).length + cons.filter((x) => x.v <= LOW_C).length;
      const htm =
        (bats.length
          ? '<div class="sup-sec">电池</div><div class="sup-grid">' + bats.map((x) =>
            `<div class="sup-i${x.v <= LOW_B ? ' low' : ''}">` +
            `<i class="d${x.v <= LOW_B ? ' no' : (x.v <= 70 ? ' mid' : ' ok')}"></i>` +
            `<span>${x.n}</span><b>${x.v}%</b></div>`).join('') + '</div>'
          : '') +
        (cons.length
          ? '<div class="sup-sec">耗材（剩余寿命）</div><div class="sup-bars">' + cons.map((x) =>
            `<div class="sup-b${x.v <= LOW_C ? ' low' : ''}"><span>${x.n}</span>` +
            `<div class="sup-bar"><i style="width:${Math.max(2, Math.min(100, x.v))}%"></i></div>` +
            `<b>${x.v}%</b></div>`).join('') + '</div>'
          : '');
      // v174：条目最多的一张卡，跨两列排才装得下（窄屏 .card.wide 会自动退回单列）
      box.append(card('电池 · 耗材', 'i-batt', lowN ? lowN + ' 项待留意' : '全部正常', htm, true));
    }

    /* 其他设备 = 米家已入网但本页还没接进来的（概览里点开可看实体清单）—— 挪到末尾 */
    const missN = ((state.missing || LH.missing) || []).length;
    const oc = card('其他设备', 'i-plug', missN ? missN + ' 台未接入' : '全部已接入',
      `<div class="kv"><b>${missN || '—'}</b><span>台米家设备未接入</span></div>
       <div class="card-sub">${missN ? '点开看设备与实体名，照着名字就能接进本页' : '米家设备都已经在界面里了'}</div>`);
    oc.classList.add('tap');
    oc.addEventListener('click', () => openOther(true));

    const cams = LH.config.cameras || [];    const camCard = card('摄像头', 'i-cam', cams.length ? '实时抓图' : '待接入',
      `<div class="cam-slots">${cams.map((c) => `<div class="cam-slot" data-cam="${c.entity}"><svg><use href="#i-cam"/></svg><b>${c.name}</b></div>`).join('') || '<div class="cam-slot empty">未配置</div>'}</div>`, true);
    box.append(camCard);
    camCard.querySelectorAll('[data-cam]').forEach((b) => {
      b.addEventListener('click', () => openCamera(b.dataset.cam, (cams.find((c) => c.entity === b.dataset.cam) || {}).name || '摄像机'));
      mountShot(b, b.dataset.cam);
    });

    /* 末尾三张：网络 / 系统 / 其他设备 */
    box.append(card('网络', 'i-wifi', down == null ? '待接入' : '实时',
      `<div class="kv"><b>${down == null ? '—' : down.toFixed(1)}</b><span>Mb/s 下行</span></div>
       <div class="card-sub">上行 ${up == null ? '—' : up.toFixed(1)} Mb/s · 来源 小米路由器</div>`));
    box.append(card('系统', 'i-cog', h ? '在线' : '未连接',
      `<div class="kv"><b>${nEnt || '—'}</b><span>个实体</span></div>
       <div class="card-sub">HA ${h ? h.config.version : '—'} · ${LH.rooms.length} 个区域 · ${LH.devices.length} 个受控设备</div>`));
    box.append(oc);
  }
  function fmtGate(entity) {
    const s = st(entity);
    if (!s) return '—';
    const v = s.state;
    if (v === 'on') return '在线';
    if (v === 'off') return '离线';
    return LABEL[v] || v;
  }

  /* ── 家电 ── */
  function openAppliances() {
    const n = (LH.appliances || []).length;
    showLayer('家电设备', n ? n + ' 台家电的实时读数' : '还没有配置家电', 'pop-wide');
    $('#layerBody').innerHTML = '<div class="cards layer-cards" id="applianceCards"></div>';
    buildAppliances();
    clearInterval(state.pageTimer);
    state.pageTimer = setInterval(() => {
      if (!state.layer || !$('#applianceCards')) return clearInterval(state.pageTimer);
      buildAppliances();
    }, 12000);
  }

  /* 家电读数的一行。rows 项 = [标签, 实体, 状态映射, 属性名, 单位]：
     后两项可选，给了「属性名」就读 attributes（空调的室温/设定温度不在 state 里）。

     v229 起几点变了，都是为了让「显示的数字」和 HA 里的真值一致：
     · 单位没配就跟实体自己的 unit_of_measurement 走（以前漏一行就是一个裸数字）
     · 数值统一 Number 后再显示（26.0 → 26，5.0 → 5）
     · 布尔属性翻成中文（burning_state 之前会直接印 True / False）
     · unknown 显示「—」而不是「未知」（洗衣机洗完 remaining 就是 unknown） */
  function appNum(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || String(v).trim() === '') return null;
    return String(Math.round(n * 100) / 100);
  }
  function appRow(r) {
    const s = st(r[1]);
    if (!s) return `<div class="app-line"><span>${r[0]}</span><b>—</b></div>`;
    /* 晾衣架这类：位置是「三档 + 上次到位」推出来的，不能念 state/百分比，
       配置里用 {'@cover': true} 占住第 3 项就把这行交给 coverPos() */
    if (r[2] && r[2]['@cover']) {
      return `<div class="app-line"><span>${r[0]}</span><b>${coverPos(s).text}</b></div>`;
    }
    /* 单位：配置里常写成 ' °C' / ' 分钟'（带前导空格），统一 trim 掉，
       拼接时自己补一个空格 —— 否则会印成「50  °C」两个空格 */
    const uom = String(r[4] != null ? r[4] : (((s.attributes || {}).unit_of_measurement) || '')).trim();
    let v = '—', num = false;
    if (r[3]) {
      const av = (s.attributes || {})[r[3]];
      if (av == null || av === '' || av === 'unknown') {
        v = '—';
      } else if (typeof av === 'boolean') {
        v = (r[2] && (r[2][String(av)] || r[2][av ? 'on' : 'off'])) || (av ? '是' : '否');
      } else if (r[2] && r[2][String(av)] != null) {
        /* 枚举类属性（hvac_action 的 cooling/idle/off）也要过映射表，
           不然界面上会直接印个英文 off */
        v = r[2][String(av)];
      } else {
        const n = appNum(av);
        v = n == null ? String(av) : n;
        num = n != null;
      }
    } else if (s.state === 'unavailable') {
      v = '离线';
    } else if (s.state === 'unknown') {
      v = '—';
    } else if (r[2] && r[2][s.state] != null) {
      v = r[2][s.state];
    } else {
      const n = appNum(s.state);
      v = n == null ? (LABEL[s.state] || s.state) : n;
      num = n != null;
    }
    return `<div class="app-line"><span>${r[0]}</span><b>${v}${num && uom ? ' ' + uom : ''}</b></div>`;
  }
  function buildAppliances() {
    const box = $('#applianceCards');
    if (!box) return;
    box.innerHTML = '';
    (LH.appliances || []).forEach((a) => {
      const rows = a.rows.map(appRow).join('');
      const c = el('div', 'card app-card');
      c.innerHTML =
        `<div class="app-row"><span class="app-ico"><svg><use href="#${a.icon}"/></svg></span>
          <span class="app-name">${a.name}<i>${a.room}</i></span>
          <span class="badge">${hass() ? '实时' : '未连接'}</span></div>
         ${rows}` +
        `<div class="card-sub" style="margin-top:8px">点开看这台设备的全部读数</div>`;
      c.addEventListener('click', () => openAppliance(a));
      box.append(c);
    });
  }
  function applianceEntities(a) {
    const h = hass();
    if (!h) return [];
    const seen = {};
    (a.rows || []).forEach((r) => { seen[r[1]] = 1; });
    /* keys 缺省 → 按家电名自动收集相关实体（老行为）；
       给了空数组 → 一个都不收（美的空调那种自带十几个开关的，收上来反而像出错了）；
       给了片段 → 只按这些片段匹配友好名 */
    const keys = a.keys == null ? [a.name] : a.keys;
    const doms = { sensor: 1, binary_sensor: 1, switch: 1, number: 1, select: 1 };
    const out = [];
    Object.keys(h.states).forEach((id) => {
      if (seen[id] || !doms[id.split('.')[0]]) return;
      /* 镜像那些 mirror_* 是控制台镜像出来的模板实体，跟米家原始实体是同一个量的两份拷贝，
         并排放会出现「热水器通电 off」和「燃气热水器 Power on」这种自相矛盾的画面 → 跳过。
         （洗衣机卡片第一行用的 switch.mirror_washer_running 走 rows，不受影响） */
      if ((id.split('.')[1] || '').indexOf('mirror_') === 0) return;
      const e = h.states[id];
      const fn = (e.attributes && e.attributes.friendly_name) || '';
      if (!keys.some((k) => fn.indexOf(k) >= 0)) return;
      out.push({ name: fn, state: LABEL[e.state] != null ? LABEL[e.state] : e.state, unit: (e.attributes || {}).unit_of_measurement || '' });
    });
    return out.slice(0, 10);
  }
  function openAppliance(a) {
    state.appl = a;
    showLayer(a.name, (a.room || '') + ' · 实体读数');
    renderAppliance();
    clearInterval(state.applTimer);
    state.applTimer = setInterval(renderAppliance, 4000);
  }
  function renderAppliance() {
    const a = state.appl;
    const box = $('#layerBody');
    if (!a || !box) return;
    const rows = (a.rows || []).map(appRow).join('');
    const extra = applianceEntities(a).map((e) =>
      `<div class="app-line"><span>${e.name}</span><b>${e.state}${e.unit ? ' ' + e.unit : ''}</b></div>`).join('');
    box.innerHTML =
      '<div class="ctl-head"><span class="ctl-ico"><svg><use href="#' + a.icon + '"/></svg></span>' +
      `<div><b>${a.name}</b><span>${a.room || ''} · ${hass() ? '实时读数' : '未连接'}</span></div></div>` +
      `<div class="app-lines">${rows || '<div class="we-empty">这台家电还没配读数。</div>'}</div>` +
      (extra ? `<div class="we-sec">相关实体</div><div class="app-lines">${extra}</div>` : '') +
      (a.hint ? `<div class="ctl-note">${a.hint}</div>` : '') +
      '<div class="ctl-note">这里只展示读数。没有绑定真实实体的项目，页面不会假装它已接入。</div>';
  }

  /* ── 外观设置（右上角齿轮弹窗独用；说明页删掉后就只剩这一处） ── */
  function settingsHtml() {
    const ids = {
      rng: 'setPaneRng', val: 'setPaneVal', rst: 'setPaneReset', alt: 'setAltToggle',
      fsr: 'setFsRng', fsv: 'setFsVal', fsrst: 'setFsReset', fsn: 'setFsNote',
    };
    return `
      <h3>字体大小</h3>
      <ul>
        <li>整页文字统一缩放（顶栏、左栏、面板、弹窗、屏保时间都跟着变），默认 <b>100%</b>。</li>
        <li>图标和栅格尺寸不跟着变，所以放大后不会把布局挤歪；可调范围 <b>${FS_MIN}~${FS_MAX}%</b>，
            记在本机（<code>localStorage.lhUI</code>）。</li>
      </ul>
      <div class="pane-row">
        <input class="pane-rng" id="${ids.fsr}" data-fs-rng type="range"
               min="${FS_MIN}" max="${FS_MAX}" step="${FS_STEP}" value="${fsPct()}" aria-label="字体大小百分比">
        <b id="${ids.fsv}" data-fs-val>${fsPct()}%</b>
        <span class="fs-note" id="${ids.fsn}" data-fs-note></span>
        <button class="theme-btn" id="${ids.fsrst}" data-fs-reset type="button">默认 100%</button>
      </div>
      <h3>面板透明度</h3>
      <ul>
        <li>左栏（全屋摘要 / 房间列表）和右侧<b>房间面板</b>的底色透明度，默认 <b>75%</b>：只留一层雾面玻璃，背后的氛围光会透上来。</li>
        <li>拖动滑块实时生效，记在本机（<code>localStorage.lhUI</code>）；调太透如果觉得字飘，往左拉一点就行。</li>
      </ul>
      <div class="pane-row">
        <input class="pane-rng" id="${ids.rng}" data-pane-rng type="range" min="0" max="100" step="5"
               value="75" aria-label="面板透明度百分比">
        <b id="${ids.val}" data-pane-val>75%</b>
        <button class="theme-btn" id="${ids.rst}" data-pane-reset type="button">默认 75%</button>
      </div>
      <h3>主题（深 / 浅色）</h3>
      <ul>
        <li>默认<b>跟随日出日落</b>自动切深浅色（读 <code>sun.sun</code> 的太阳高度）；也可以手动固定。</li>
        <li>右上角最后一个按钮是同一个开关：<b>日出 → 日落 → 自动</b> 三态轮换，点一次换一档，和这里随时同步。</li>
      </ul>
      <div class="theme-row">
        <button class="theme-btn" data-theme="auto" type="button">跟随日出日落</button>
        <button class="theme-btn" data-theme="dark" type="button">一直深色</button>
        <button class="theme-btn" data-theme="light" type="button">一直浅色</button>
      </div>
      <h3>四季配色</h3>
      <ul>
        <li>季节只换<b>氛围光、底色冷暖、房间色块和外框</b>的色相；灯光本身还是暖金，所以文字对比度不受影响。</li>
        <li>默认<b>按节气</b>自动换季（立春入春、立夏入夏、立秋入秋、立冬入冬），也可以手动固定。</li>
      </ul>
      <div class="theme-row season">
        <button class="theme-btn" data-season="auto" type="button"><i class="sdot"></i>跟随节气</button>
        <button class="theme-btn" data-season="spring" type="button"><i class="sdot"></i>春</button>
        <button class="theme-btn" data-season="summer" type="button"><i class="sdot"></i>夏</button>
        <button class="theme-btn" data-season="autumn" type="button"><i class="sdot"></i>秋</button>
        <button class="theme-btn" data-season="winter" type="button"><i class="sdot"></i>冬</button>
      </div>
      <h3>右侧留白</h3>
      <ul>
        <li>没开房间面板时，右列整条是<b>常用设备 + 安防网关</b>常驻栏，默认显示。</li>
        <li>户型位置跟面板开合无关（右列宽度是固定的），这里怎么切户型都不会左右移动。</li>
      </ul>
      <div class="pane-row">
        <button class="theme-btn" id="${ids.alt}" data-alt-toggle type="button">右侧常用设备栏</button>
      </div>
      <h3>待机时间</h3>
      <ul>
        <li><b>自动复原</b>：无操作多少分钟后，把界面从子页面（房间详情 / 概览等）恢复到首页。</li>
        <li><b>进入屏保</b>：无操作多少分钟后，进入待机屏保界面（显示大屏时钟）。</li>
        <li>屏幕触控、键盘、滚轮任意操作都会重置计时。记在本机（<code>localStorage.lhStandby</code>）。</li>
      </ul>
      <div class="pane-row">
        <label class="pane-label">复原 <input id="setResetMin" type="number" min="1" max="30" step="1" value="2" aria-label="自动复原分钟"> 分钟</label>
        <b id="setResetVal">2 分钟</b>
      </div>
      <div class="pane-row">
        <label class="pane-label">屏保 <input id="setIdleMin" type="number" min="1" max="60" step="1" value="5" aria-label="屏保分钟"> 分钟</label>
        <b id="setIdleVal">5 分钟</b>
        <button class="theme-btn" id="setIdleSave" type="button">保存</button>
      </div>
      <h3>接入说明</h3>
      <p class="set-help-lead">下面三类数据不填也能用，只是对应卡片会显示「待接入 / 未配置」。
        点开看要装什么加载项（集成）、填哪个控件（实体）。</p>
      <div class="set-help-list">
        <details class="set-help" open>
          <summary>天气 · 用什么加载项、地址怎么填</summary>
          <ol>
            <li><b>加载项</b>：HA 自带的 <b>Met.no</b>（免 Key）；国内推荐<b>和风天气 QWeather</b>（注册免费 Key）、
              <b>OpenWeatherMap</b>、<b>AccuWeather</b>。装法：<code>设置 → 设备与服务 → 添加集成</code>。</li>
            <li><b>控件</b>：集成会生成一个 <code>weather.*</code> 实体，如 <code>weather.forecast_home</code>、
              <code>weather.hefeng</code>、<code>weather.openweathermap</code>。</li>
            <li><b>怎么填</b>：编辑器 →「概览 · 家人 · 网关」→ 天气 → <b>天气实体</b>，点输入框弹出实体选择器，
              选 <code>weather</code> 域那一条。<b>这里填实体 ID，不填网址、不填 Key</b>（Key 在添加集成时填）。</li>
            <li><b>室内温度 / 湿度</b>（可选）：留空就用天气实体自带的温度；填了 <code>sensor.*</code>
              （如 <code>sensor.living_temperature</code>）时，房间里配了温湿度设备就优先用房间平均值。</li>
          </ol>
          <ul>
            <li class="warn">填成 <code>sensor.xxx</code> → 天气卡仍是「待接入 · 天气实体未配置」。</li>
            <li class="warn">实体显示 <code>unavailable</code> 多半是集成掉线（和风 Key 过期 / 免费额度用完），
              去「设备与服务」看该集成有没有报错。</li>
            <li>没有小时预报的实体，天气弹窗只显示当前与多日。</li>
          </ul>
        </details>
        <details class="set-help">
          <summary>用电 · 需要什么控件、怎么设置</summary>
          <ol>
            <li><b>控件</b>：任意能读到 <b>kWh</b> 的 <code>sensor.*</code>，如
              <code>sensor.state_grid_your_state_grid_account_daily_ele_num</code>（网上国网集成）、
              <code>sensor.xxx_energy</code>（米家计量插座 / Sonoff POW / PZEM-004T / 智能电表）。</li>
            <li><b>要求</b>：单位 kWh、<code>device_class: energy</code>、<code>state_class: total_increasing</code>（累计递增）。
              本页读的是它 <code>state</code> 的数值。</li>
            <li><b>怎么填</b>：编辑器 →「概览」→ <b>今日用电传感器</b>，选 <code>sensor</code> 域那一条。</li>
            <li><b>只有功率没有电量</b>的插座：先在 HA 里建一个 <b>utility_meter</b>（或积分 <code>integration</code>）
              helper，把 W 累加成 kWh，再填这个 helper 的实体。</li>
            <li>不填 → 顶栏「用电」小条直接隐藏，不影响其它卡片。</li>
          </ol>
        </details>
        <details class="set-help">
          <summary>家人 · IP 地址怎么填（完整三步法）</summary>
          <ol>
            <li><b>本页不认 IP，只认实体</b>：LoveHome 只读 <code>binary_sensor.*</code>（on/off）或
              <code>device_tracker.*</code>；IP 是这些实体背后的东西，不在 LoveHome 里直接写。</li>
            <li><b>第一步：在路由器里把手机 IP 固定</b>
              <ol>
                <li>浏览器打开路由器后台（底标上的地址，常见 <code>192.168.1.1</code> 或 <code>192.168.0.1</code>）；</li>
                <li>找 <code>DHCP 静态分配</code> / <code>IP 地址绑定</code> / <code>Static IP Reservation</code>；</li>
                <li>在已连接设备里找到手机，记它的 <b>MAC 地址</b>：
                  iOS → <code>设置 → Wi-Fi → 点当前 Wi-Fi 后面的 ⓘ → 底部有「Wi-Fi 地址」</code>；
                  安卓 → <code>设置 → Wi-Fi → 点当前 Wi-Fi → 「IP 地址 / MAC 地址」</code>；</li>
                <li>绑一个固定 IP（比如 <code>192.168.1.23</code>）→ 保存。以后手机连自家 Wi-Fi 永远是这个 IP。</li>
                <li><b>手机必须关掉随机 MAC</b>：iOS 「设置 → Wi-Fi → 当前 Wi-Fi ⓘ → 配置 IP → DHCP」，
                  且把 <b>私有 Wi-Fi 地址</b> 关掉；安卓把「随机 MAC 地址」设为「已停用」。开着的话 MAC 每次变，
                  路由器绑不上、IP 跟着飘。</li>
              </ol></li>
            <li><b>第二步：在 HA 里把这个 IP 变成一个实体</b>（二选一）
              <ol>
                <li><b>Ping (ICMP) 集成</b>（最简单，推荐先试）：
                  HA <code>设置 → 设备与服务 → 添加集成</code>，搜 <b>Ping</b> → Host 填刚才绑的那个 IP → 名字起好
                  （如「家人手机 A」）→ 完成。HA 自动生成 <code>binary_sensor.192_168_1_23</code>，手机在线 = on，离线 = off。</li>
                <li><b>路由器集成</b>（ASUSWRT / OpenWrt ubus / 小米路由器 等在 HACS 里都有）：装上后每台连上 Wi-Fi 的设备
                  自动有一个 <code>device_tracker.*</code>，直接用也行，免手动一个个 Ping。</li>
              </ol></li>
            <li><b>第三步：回到 LoveHome 挂上这个实体</b>
              点左下角 <b>编辑</b>（铅笔图标）→ 切 <b>概览 · 家人 · 网关</b> tab →「家人在线」里找到（或新建）一行 →
              <b>实体</b> 那一栏点输入框 → 弹出实体选择器 → 选刚才那个 <code>binary_sensor.*</code> 或
              <code>device_tracker.*</code> → 顶部 <b>完成</b> 保存。</li>
          </ol>
          <ul>
            <li class="warn"><b>前提：HA 所在容器 / 主机必须和手机在同一局域网且能 ping 通该 IP。</b>
              <b>Docker 桥接网络 ping 不到局域网设备</b>，要用 host 网络或 macvlan；HAOS 装的免管——它直接跑在宿主机上。</li>
            <li class="warn">如果装了 Ping 集成但永远 unavailable，十有八九是容器网络问题。先在 HA 的
              <code>开发者工具 → 服务 → shell_command</code> 里 <code>ping -c 3 192.168.1.23</code> 手动测一下，
              能通再装 Ping 集成。</li>
            <li>「两台设备任一在线即算在家」这种多探针写在模板的 <code>probes</code> 里，
              目前编辑器没开放这一项，需要时在 <b>编辑器 → 数据备份 → 导出 JSON</b> 里改。</li>
            <li>手机休眠 / Wi-Fi 省电会短时不通，看到「离家」先等一轮，不要立刻判定 Ping 集成坏了。</li>
          </ul>
        </details>
      </div>
      <div class="pane-row">
        <button class="theme-btn" id="setOpenEditor" type="button">打开可视化编辑器</button>
        <span class="fs-note">天气 / 用电 / 家人都在「概览 · 家人 · 网关」页填写</span>
      </div>
      <h3>关于 QLoveHome</h3>
      <div class="about-box">
        <div class="about-logo"><img src="./QLovehome.png" alt="QLoveHome"></div>
        <div class="about-meta">
          <div class="about-name">QLoveHome · 全屋大屏</div>
          <div class="about-ver">版本 <b>1.0.0</b></div>
        </div>
      </div>
      <ul>
        <li>一个给 <b>Home Assistant</b> 用的家庭大屏面板，面向有米家设备、想在门口 / 客厅放一块平板的用户。</li>
        <li>核心能力：<b>户型图可视化 + 房间温湿度 + 灯光中控 + 安防状态 + 家电汇总 + 天气日历</b>。</li>
        <li>运行方式：Home Assistant 自定义集成（<code>custom_components/lovehome</code>），前端纯原生 HTML + SVG + JS，不走 Webpack，源码可读可改。</li>
        <li>所有个性化设置（字体大小、面板透明度、主题深浅、四季配色、待机时间、户型数据）都记在本机 <b>localStorage</b>，不上云、不回传。</li>
      </ul>
      <div class="about-grid">
        <div class="about-cell"><b>户型图</b><span>矢量 SVG 渲染，支持矩形 / 多边形 / 圆形房间，支持底图导入，墙体自动融合成一体</span></div>
        <div class="about-cell"><b>中控</b><span>灯光 / 插座 / 空调 / 风扇统一开关 + 调光调色温，实体选哪个开哪个</span></div>
        <div class="about-cell"><b>概览</b><span>家人在线、今日用电、安防、温湿度、电池、摄像头、网络、系统状态一页看完</span></div>
        <div class="about-cell"><b>主题</b><span>深 / 浅色自动跟随日出日落，四季配色自动切换，房间色块随温度冷暖变化</span></div>
        <div class="about-cell"><b>屏保</b><span>无操作自动进待机大屏时钟，触控 / 键盘 / 滚轮任意操作唤醒</span></div>
        <div class="about-cell"><b>编辑器</b><span>可视化画户型、拖房间、加设备、改名字，空格平移画布、滚轮缩放</span></div>
      </div>
      <p class="muted">感谢 Home Assistant 社区，感谢所有无私分享集成和实体名的朋友们。</p>
      <div class="about-foot">QLoveHome · Made with ❤️ for smart homes<br>
        开发者 MisiteQ · <a href="https://github.com/MisiteQ" target="_blank" rel="noopener">github.com/MisiteQ</a>
      </div>`;
  }
  function bindSettings(root) {
    if (!root) return;
    root.querySelectorAll('[data-pane-rng]').forEach((r) => {
      r.addEventListener('input', () => setPaneT(r.value));
      r.addEventListener('change', () => setPaneT(r.value));
    });
    root.querySelectorAll('[data-pane-reset]').forEach((b) =>
      b.addEventListener('click', () => setPaneT(PANE_DEF)));
    root.querySelectorAll('[data-fs-rng]').forEach((r) => {
      r.addEventListener('input', () => setFs(r.value));
      r.addEventListener('change', () => setFs(r.value));
    });
    root.querySelectorAll('[data-fs-reset]').forEach((b) =>
      b.addEventListener('click', () => setFs(FS_DEF)));
    root.querySelectorAll('.theme-btn[data-theme]').forEach((b) =>
      b.addEventListener('click', () => setThemeMode(b.dataset.theme)));
    root.querySelectorAll('.theme-btn[data-season]').forEach((b) =>
      b.addEventListener('click', () => setSeasonMode(b.dataset.season)));
    root.querySelectorAll('[data-alt-toggle]').forEach((b) => {
      const txt = () => {
        b.textContent = altOn()
          ? '右侧常用设备栏：已开启（点击关闭）'
          : '右侧常用设备栏：已关闭（点击开启）';
      };
      txt();
      b.addEventListener('click', () => { toggleUI('pan'); txt(); });
    });
    /* 待机时间设置 */
    const t = getStandbyTimers();
    const resetMin = Math.round(t.reset / 60000);
    const idleMin = Math.round(t.idle / 60000);
    const rInp = root.querySelector('#setResetMin');
    const rVal = root.querySelector('#setResetVal');
    const iInp = root.querySelector('#setIdleMin');
    const iVal = root.querySelector('#setIdleVal');
    if (rInp) {
      rInp.value = resetMin;
      rVal.textContent = resetMin + ' 分钟';
      rInp.addEventListener('input', () => { rVal.textContent = rInp.value + ' 分钟'; });
    }
    if (iInp) {
      iInp.value = idleMin;
      iVal.textContent = idleMin + ' 分钟';
      iInp.addEventListener('input', () => { iVal.textContent = iInp.value + ' 分钟'; });
    }
    const saveBtn = root.querySelector('#setIdleSave');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      const rm = Math.max(1, Math.min(30, parseInt(rInp?.value || '2', 10)));
      const im = Math.max(1, Math.min(60, parseInt(iInp?.value || '5', 10)));
      const newResetMs = rm * 60000;
      const newIdleMs = im * 60000;
      RESET_MS = newResetMs;
      IDLE_MS = newIdleMs;
      saveStandbyTimers({ reset: newResetMs, idle: newIdleMs });
      resetIdle();  // 重置计时
      toast('待机时间已保存：复原 ' + rm + ' 分钟，屏保 ' + im + ' 分钟');
    });
    /* 接入说明里的「打开可视化编辑器」：先收起设置浮层，再开编辑器 */
    const edBtn = root.querySelector('#setOpenEditor');
    if (edBtn) {
      edBtn.addEventListener('click', () => {
        if (!window.LHEditor || typeof window.LHEditor.open !== 'function') {
          toast('编辑器还没加载完，稍等一下再点');
          return;
        }
        closeLayer();
        window.LHEditor.open();
      });
    }
  }
  /* 设置弹窗开着时把两个齿轮入口都点亮（宽屏在左下角、窄屏在右上角） */
  function setGear(on) {
    ['#fnSet', '#ltSetN'].forEach((sel) => {
      const b = $(sel);
      if (b) b.classList.toggle('on', on);
    });
  }
  function openSettings() {
    showLayer('设置', '', 'pop-wide');
    setGear(true);
    const body = $('#layerBody');
    const raw = settingsHtml();
    // 把 settingsHtml() 里每个 <h3> 区块拆出来
    const secRegex = /<h3>([^<]+)<\/h3>/g;
    const h3Titles = [];
    let m;
    while ((m = secRegex.exec(raw)) !== null) h3Titles.push({ title: m[1], idx: m.index });
    // 生成 section HTML（每个 h3 区块独立）
    const sections = [];
    h3Titles.forEach((s, i) => {
      const startIdx = s.idx;
      const endIdx = i + 1 < h3Titles.length ? h3Titles[i + 1].idx : raw.length;
      sections.push({ title: s.title, html: raw.slice(startIdx, endIdx) });
    });
    // 左侧导航（序号 0~n-1，直接对应 sections 数组下标）
    const navHtml = sections.map((s, i) =>
      `<button class="set-nav-btn" data-idx="${i}" type="button">${s.title}</button>`
    ).join('');
    // 右侧内容
    const contentHtml = sections.map((s, i) =>
      `<div class="set-section" id="sec-${i}">${s.html}</div>`
    ).join('');
    body.innerHTML = `<div class="set-wrap">
      <nav class="set-nav" id="setNav">${navHtml}</nav>
      <div class="set-body-wrap" id="setBodyWrap"><div class="about-body set-body">${contentHtml}</div></div>
    </div>`;
    // 导航点击 → 滚动 + 高亮
    const nav = body.querySelector('#setNav');
    const contentWrap = body.querySelector('#setBodyWrap');
    const updateNavHighlight = (idx) => {
      nav.querySelectorAll('.set-nav-btn').forEach((b, i) => b.classList.toggle('on', i === idx));
    };
    let programmaticScroll = false;
    nav.querySelectorAll('.set-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        programmaticScroll = true;
        updateNavHighlight(idx);
        const target = body.querySelector(`#sec-${idx}`);
        if (target) {
          const wrapRect = contentWrap.getBoundingClientRect();
          const tgtRect = target.getBoundingClientRect();
          const relTop = tgtRect.top - wrapRect.top + contentWrap.scrollTop;
          contentWrap.scrollTo({ top: relTop - 4, behavior: 'smooth' });
          setTimeout(() => { programmaticScroll = false; }, 600);
        } else {
          programmaticScroll = false;
        }
      });
    });
    // 滚动时自动高亮导航项（用 IntersectionObserver 更可靠）
    const io = new IntersectionObserver((entries) => {
      if (programmaticScroll) return;  // 点击触发的平滑滚动期间不抢高亮
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) {
        const idx = parseInt(visible[0].target.id.replace('sec-', ''), 10);
        updateNavHighlight(idx);
      }
    }, { root: contentWrap, threshold: [0.2, 0.5] });
    body.querySelectorAll('.set-section').forEach((el) => io.observe(el));
    // 默认高亮第一个
    updateNavHighlight(0);
    bindSettings(body);
    applyTheme();
    applySeason();
    applyPane();
    applyFs();
  }

  /* ── 节气 / 干支 / 月相：本地算，不联网 ── */
  const TERMS = ['小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'];
  const SX = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
  const ZS = ['建', '除', '满', '平', '定', '执', '破', '危', '成', '收', '开', '闭'];
  const ZS_YI = ['出行 上任', '扫除 疗病', '祭祀 祈福', '修饰 铺路', '订盟 纳采', '捕捉 结网', '破屋 求医', '安床 祭祀', '开业 入学', '纳财 收购', '开市 动土', '筑堤 埋穴'];
  const ZS_JI = ['动土', '出行', '服药', '栽种', '诉讼', '开市', '嫁娶', '登高', '争执', '出行', '安葬', '开光'];
  const toJD = (ms) => ms / 86400000 + 2440587.5;
  const fromJD = (j) => new Date((j - 2440587.5) * 86400000 + 28800000);
  const norm360 = (a) => ((a % 360) + 540) % 360 - 180;
  function sunLon(j) {
    const T = (j - 2451545) / 36525;
    const L0 = 280.46646 + T * (36000.76983 + T * 0.0003032);
    const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * Math.PI / 180;
    const C = (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(M)
      + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
    return (L0 + C) % 360;
  }
  function termJD(y, n) {
    const target = (285 + n * 15) % 360;
    const month = Math.floor(n / 2) + 1;
    let j = toJD(Date.UTC(y, month - 1, 1)) - 4;
    const end = j + 42;
    let prev = norm360(sunLon(j) - target);
    while (j < end) {
      j += 0.25;
      const cur = norm360(sunLon(j) - target);
      if (prev < 0 && cur >= 0) {
        let lo = j - 0.25, hi = j;
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) / 2;
          if (norm360(sunLon(mid) - target) < 0) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
      }
      prev = cur;
    }
    return null;
  }
  const TERM_CACHE = {};
  function termsOfYear(y) {
    if (!TERM_CACHE[y]) {
      const out = [];
      for (let n = 0; n < 24; n++) {
        const j = termJD(y, n);
        if (!j) continue;
        const d = fromJD(j);
        out.push({ name: TERMS[n], date: new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) });
      }
      TERM_CACHE[y] = out;
    }
    return TERM_CACHE[y];
  }
  const dayKey = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  function termOf(date) {
    const hit = termsOfYear(date.getFullYear()).find((t) => dayKey(t.date) === dayKey(date));
    return hit ? hit.name : '';
  }
  function nextTerm(date) {
    const all = termsOfYear(date.getFullYear()).concat(termsOfYear(date.getFullYear() + 1));
    const now = dayKey(date);
    let best = null;
    all.forEach((t) => { if (dayKey(t.date) >= now && (!best || dayKey(t.date) < dayKey(best.date))) best = t; });
    return best;
  }
  function moonPhase(date) {
    const j = toJD(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 4));
    const age = (((j - 2451550.26) % 29.530588) + 29.530588) % 29.530588;
    const tbl = [[1.5, '新月'], [6.5, '蛾眉月'], [8.5, '上弦月'], [13.5, '盈凸月'], [16.5, '满月'], [21.5, '亏凸月'], [23.5, '下弦月'], [29.6, '残月']];
    const hit = tbl.find((t) => age < t[0]);
    return (hit ? hit[1] : '新月') + ' · 月龄 ' + age.toFixed(1) + ' 天';
  }
  function dayGanzhi(date) {
    const days = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(1900, 0, 1)) / 86400000);
    const i = (((days + 10) % 60) + 60) % 60;
    return { name: GAN[i % 10] + ZHI[i % 12], zhi: i % 12 };
  }
  function lunarMonthNum(s) {
    if (!s) return 1;
    s = s.replace('闰', '').replace('月', '');
    if (s === '正') return 1;
    if (s === '冬') return 11;
    if (s === '腊') return 12;
    if (s === '十') return 10;
    if (s.indexOf('十') === 0) return 10 + Math.max(0, CN_NUM.indexOf(s.slice(1)));
    return Math.max(1, CN_NUM.indexOf(s));
  }

  /* ── 万年历 ── */
  let calBound = false;
  function openCalendar() {
    state.calMonth = new Date(state.selDate.getFullYear(), state.selDate.getMonth(), 1);
    renderCalendar();
    showLayer('万年历', '农历 · 节气 · 干支 · 本地计算');
    const box = $('#layerBody');
    if (box && !calBound) {
      calBound = true;
      let sx = 0, sy = 0;
      box.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
      box.addEventListener('pointerup', (e) => {
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) < 45 && Math.abs(dy) < 45) return;
        shiftCalMonth(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : -1) : (dy < 0 ? 1 : -1));
      });
    }
  }
  function shiftCalMonth(n) {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + n, 1);
    renderCalendar();
  }
  function renderCalendar() {
    const box = $('#layerBody');
    const base = state.calMonth;
    const y = base.getFullYear(), m = base.getMonth();
    const now = new Date();
    const first = new Date(y, m, 1);
    const lead = first.getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const selKey = `${state.selDate.getFullYear()}-${state.selDate.getMonth()}-${state.selDate.getDate()}`;

    let html = `<div class="cal-top"><b>${y} 年 ${m + 1} 月</b>
      <div class="cal-nav">
        <select id="calYear" aria-label="选择年">${Array.from({ length: 201 }, (_, i) => `<option value="${1900 + i}"${1900 + i === y ? ' selected' : ''}>${1900 + i}</option>`).join('')}</select>
        <select id="calMonth" aria-label="选择月">${Array.from({ length: 12 }, (_, i) => `<option value="${i}"${i === m ? ' selected' : ''}>${i + 1} 月</option>`).join('')}</select>
        <button data-cal="-1" type="button">‹</button><button data-cal="today" type="button">今</button><button data-cal="1" type="button">›</button>
      </div></div>
      <div class="cal-grid">${WK.map((w) => `<div class="cal-wd">${w.replace('周', '')}</div>`).join('')}`;
    for (let i = 0; i < lead; i++) html += '<button class="cal-cell empty" tabindex="-1"></button>';
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d);
      const l = lunar(date);
      const tm = termOf(date);
      const isToday = date.toDateString() === now.toDateString();
      const isSel = `${y}-${m}-${d}` === selKey;
      const label = tm || (l.day === 1 ? l.month : l.dayLabel);
      html += `<button class="cal-cell${tm ? ' term' : ''}${isToday ? ' today' : ''}${isSel ? ' sel' : ''}" data-day="${d}" type="button">${d}<i>${label}</i></button>`;
    }
    html += '</div>';

    const l = lunar(state.selDate);
    const gy = state.selDate.getFullYear();
    const gz = ganzhi(gy);
    const dg = dayGanzhi(state.selDate);
    const tm = termOf(state.selDate);
    const nt = nextTerm(state.selDate);
    const mp = moonPhase(state.selDate);
    const zi = (dg.zhi - ((lunarMonthNum(l.month) + 1) % 12) + 12) % 12;
    html += `<div class="cal-foot">
      <b>${gy} 年 ${state.selDate.getMonth() + 1} 月 ${state.selDate.getDate()} 日</b> · ${WK[state.selDate.getDay()]}<br>
      农历 ${l.month}${l.dayLabel} · ${gz}年【${SX[(gy - 4) % 12]}】· ${dg.name}日<br>
      ${tm ? `<span class="cal-term">节气 · ${tm}</span>`
        : (nt ? `<span>下一个节气 ${nt.name} · ${nt.date.getMonth() + 1} 月 ${nt.date.getDate()} 日</span>` : '')}
      <span>${mp}</span>
      <div class="cal-yj"><em>宜</em>${ZS_YI[zi]}<em>忌</em>${ZS_JI[zi]}</div>
      <div class="cal-note">公历 1900–2100 年，可左右或上下滑动翻月。农历用浏览器中国历，节气按太阳视黄经本地求时刻。宜忌为传统黄历内容，只作查看，不作预测。</div>
    </div>`;
    box.innerHTML = html;

    box.querySelectorAll('[data-cal]').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.cal;
      if (v === 'today') {
        state.selDate = new Date();
        state.calMonth = new Date(state.selDate.getFullYear(), state.selDate.getMonth(), 1);
      } else {
        state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + Number(v), 1);
      }
      renderCalendar();
    }));
    box.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
      state.selDate = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth(), Number(b.dataset.day));
      renderCalendar();
    }));
    const cy = $('#calYear', box), cm = $('#calMonth', box);
    const jump = () => {
      state.calMonth = new Date(Number(cy.value), Number(cm.value), 1);
      renderCalendar();
    };
    if (cy) cy.addEventListener('change', jump);
    if (cm) cm.addEventListener('change', jump);
  }

  /* ── 浮层 ── */
  function showLayer(title, sub, wide) {
    state.layer = true;
    /* 记下打开时刻：点空白处关闭时要避开"这一下点击本身"（含从 A 设备直接切到 B 设备） */
    state.layerAt = Date.now();
    /* 换弹窗内容就停掉类别列表的轮询，避免它去改别的弹窗里的 DOM */
    clearInterval(state.kindTimer);
    clearInterval(state.otherTimer);
    $('#layerTitle').textContent = title;
    const subEl = $('#layerSub');
    subEl.textContent = sub || '';
    subEl.style.display = sub ? '' : 'none';
    /* 复合设备一屏要塞 20 来行，460 太窄；概览 / 家电是卡片两列，再宽一档 */
    const L = $('#layer');
    L.classList.remove('wide', 'pop-wide');
    if (wide === 'pop-wide') L.classList.add('pop-wide');
    else if (wide) L.classList.add('wide');
    L.hidden = false;
  }
  function closeLayer() {
    state.layer = null;
    state.ctl = null;
    state.appl = null;
    state.rel = null;
    clearInterval(state.pageTimer);
    clearInterval(state.ctlTimer);
    clearInterval(state.applTimer);
    clearInterval(state.kindTimer);
    clearInterval(state.otherTimer);
    clearInterval(state.camTimer);
    $('#layer').hidden = true;
    setGear(false);
    Object.keys(camCache).forEach((k) => { URL.revokeObjectURL(camCache[k]); delete camCache[k]; });
  }

  const hhmm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
  function forecast(type, cb) {
    const h = hass();
    const ent = LH.config.weather.entity;
    if (!h || !ent) { cb([]); return; }
    h.callWS({
      type: 'call_service', domain: 'weather', service: 'get_forecasts',
      service_data: { entity_id: ent, type: type }, return_response: true
    }).then((res) => cb(((res && res.response && res.response[ent]) || {}).forecast || []))
      .catch(() => cb([]));
  }
  function openWeather() {
    showLayer('天气', 'HA weather 实体 · 小时与多日预报');
    const s = st(LH.config.weather.entity);
    const a = (s && s.attributes) || {};
    const temp = a.temperature != null ? Math.round(a.temperature) : '—';
    const sunS = st('sun.sun');
    const sunA = (sunS && sunS.attributes) || {};
    const tags = [];
    const ap = apparent(a);
    if (ap != null) tags.push(['体感（估）', Math.round(ap) + '°']);
    if (a.humidity != null) tags.push(['湿度', Math.round(a.humidity) + '%']);
    if (a.wind_speed != null) tags.push(['风速', Math.round(a.wind_speed) + ' km/h']);
    if (a.pressure != null) tags.push(['气压', Math.round(a.pressure) + ' hPa']);
    if (sunA.next_rising) tags.push(['日出', hhmm(new Date(sunA.next_rising))]);
    if (sunA.next_setting) tags.push(['日落', hhmm(new Date(sunA.next_setting))]);
    const inT = $('#inTemp') ? $('#inTemp').textContent : '—';
    const inH = $('#inHum') ? $('#inHum').textContent : '—';
    $('#layerBody').innerHTML = `
      <div class="we-now"><b>${temp}<i>°</i></b>
        <span>${s ? (LABEL[s.state] || s.state) : '待接入'}${a.temperature != null ? ' · 室外' : ''}</span></div>
      <div class="we-tags">${tags.map((t) => `<span><i>${t[0]}</i>${t[1]}</span>`).join('')}</div>
      <div class="card-sub" style="margin:2px 0 14px">室内 ${inT}° · 湿度 ${inH}%${sunS ? ' · 太阳高度 ' + Math.round(sunA.elevation || 0) + '°' : ''}</div>
      <div class="we-sec">未来 24 小时</div>
      <div class="we-hours" id="weHours"><div class="we-empty">正在读取小时预报…</div></div>
      <div class="we-sec">未来 5 天</div>
      <div class="we-days" id="weDays"><div class="we-empty">正在读取多日预报…</div></div>
      <div class="we-note">数据来自 HA 的 weather 与 sun 实体，日出日落取 sun.sun 的实际时间；实体没给的字段就留空，不补零。</div>`;

    const rise = sunA.next_rising ? new Date(sunA.next_rising) : null;
    const set = sunA.next_setting ? new Date(sunA.next_setting) : null;
    forecast('hourly', (list) => {
      const box = $('#weHours');
      if (!box) return;
      if (!list.length) { box.innerHTML = '<div class="we-empty">这个 weather 实体没有小时预报。</div>'; return; }
      box.innerHTML = list.slice(0, 24).map((f, i) => {
        const d = new Date(f.datetime);
        let pre = '';
        if (i > 0) {
          const p = new Date(list[i - 1].datetime);
          if (rise && p < rise && d >= rise) pre += `<div class="we-hour sun"><span>${hhmm(rise)}</span><svg><use href="#i-sunrise"/></svg><b>日出</b></div>`;
          if (set && p < set && d >= set) pre += `<div class="we-hour sun"><span>${hhmm(set)}</span><svg><use href="#i-sunset"/></svg><b>日落</b></div>`;
        }
        const pop = f.precipitation_probability != null ? Math.round(f.precipitation_probability) + '%' : '';
        return pre + `<div class="we-hour"><span>${pad(d.getHours())}:00</span>` +
          `<em>${LABEL[f.condition] || f.condition || ''}</em>` +
          `<b>${Math.round(f.temperature)}°</b><span>${pop}</span></div>`;
      }).join('');
    });
    forecast('daily', (list) => {
      const box = $('#weDays');
      if (!box) return;
      if (!list.length) { box.innerHTML = '<div class="we-empty">这个 weather 实体没有多日预报。</div>'; return; }
      box.innerHTML = list.slice(0, 5).map((f, i) => {
        const d = new Date(f.datetime);
        const lo = f.templow != null ? Math.round(f.templow) : '—';
        const hi = f.temperature != null ? Math.round(f.temperature) : '—';
        return `<div class="we-day"><span>${i === 0 ? '今天' : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + WK[d.getDay()]}</span>` +
          `<em>${LABEL[f.condition] || f.condition || ''}</em><b>${hi}°</b><i>${lo}°</i></div>`;
      }).join('');
    });
  }

  /* ── 提示 ── */
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }

  /* ── 页面切换 ──
     说明页已删除；概览 / 家电改成浮层（见 openOverview / openAppliances），
     所以这里只剩「首页」一个真页面，留着是为了统一入口和以后加页。 */
  function showPage(id) {
    state.page = id;
    /* 切页面时把浮层收掉，否则弹窗会盖在新页面上 */
    if (state.layer) closeLayer();
    clearInterval(state.pageTimer);
    $$('.ptab').forEach((b) => b.classList.toggle('active', !b.dataset.pop && b.dataset.page === id));
    syncAlt();
    /* 筛选条只在户型图上才有意义；现在没有整屏子页，永远保持可用 */
    $('#filters').classList.remove('tabs-only');
    const chips = $('#filterChips');
    if (chips) chips.inert = false;
  }

  /* 右列常驻栏被手动收起（栏上右上角 × / 设置里的开关）后，
     回到首页要把它复原：复位的语义就是回到刚登录的样子，那时它是显示的。
     只改这一项偏好，主题、季节、透明度、侧栏顶栏那些仍然保持用户的设置。 */
  function restoreAlt() {
    if (altOn()) return false;
    const p = uiPref();
    p.pan = true;
    saveUI(p);
    /* 设置面板万一正开着，把开关文字一起改回「已开启」 */
    $$('[data-alt-toggle]').forEach((b) => {
      b.textContent = '右侧常用设备栏：已开启（点击关闭）';
    });
    return true;
  }

  /* ── 回到「刚进来的样子」──
     只复位显示状态：关掉所有浮层 / 房间面板 / 筛选，页面回到首页。
     刻意不碰两样：实体状态（不能顺手把灯和空调关掉）和外观偏好
     （主题 / 季节 / 面板透明度 / 侧栏顶栏显隐 都记在 localStorage，属于用户设置） */
  function resetView(quiet) {
    if (state.layer) closeLayer();
    const altBack = restoreAlt();      /* 手动收起的占位卡也复原，回到「刚登录就在」的样子 */
    closeRoom();                       /* 右列回到「常用设备 + 安防网关」 */
    state.filter = 'all';
    $$('#filterChips .filter').forEach((b) => b.classList.toggle('active', b.dataset.f === 'all'));
    paintMarkers();
    paintGlow();
    /* 万年历/天气这些弹窗再打开时从今天开始，不接着上次的月份 */
    state.selDate = new Date();
    state.calMonth = new Date();
    showPage('home');
    /* 右列那块从 v166 起是「常用设备 + 安防网关」常驻栏，不再叫天气用电占位卡 */
    if (!quiet) toast(altBack ? '已回到首页 · 常用设备栏已恢复' : '已回到首页');
  }

  /* ── 屏保 ──
     两段计时：无操作 X 分钟先把显示复位（回到首页状态），再等 Y 分钟进待机屏保。
     用户可在设置面板调整时间，记在 localStorage.standbyTimers。 */
  const DEFAULT_RESET_MS = 2 * 60 * 1000;
  const DEFAULT_IDLE_MS = 5 * 60 * 1000;
  function loadStandbyTimers() {
    try {
      const raw = localStorage.getItem('lhStandby');
      if (!raw) return { reset: DEFAULT_RESET_MS, idle: DEFAULT_IDLE_MS };
      const v = JSON.parse(raw);
      return {
        reset: (v.reset || DEFAULT_RESET_MS),
        idle: (v.idle || DEFAULT_IDLE_MS)
      };
    } catch (e) { return { reset: DEFAULT_RESET_MS, idle: DEFAULT_IDLE_MS }; }
  }
  function saveStandbyTimers(obj) {
    try { localStorage.setItem('lhStandby', JSON.stringify(obj)); } catch (e) {}
  }
  function getStandbyTimers() { return loadStandbyTimers(); }
  let RESET_MS, IDLE_MS;
  (function initTimers() {
    const t = loadStandbyTimers();
    RESET_MS = t.reset; IDLE_MS = t.idle;
  })();
  function wake() {
    const s = $('#standby');
    if (!s.hidden) s.hidden = true;
    resetIdle();
  }
  function resetIdle() {
    clearTimeout(state.resetTimer);
    clearTimeout(state.idleTimer);
    state.resetTimer = setTimeout(() => { if ($('#standby').hidden) resetView(true); }, RESET_MS);
    state.idleTimer = setTimeout(() => { $('#standby').hidden = false; }, IDLE_MS);
  }

  /* ── 数据刷新 ── */
  function roomAvg(key) {
    /* 镜像房间（主卫跟随主卧、客卫跟随客餐厅）只是借读数显示，
       算全屋均值时要去掉，否则同一支传感器会被计两次 */
    const arr = LH.rooms.filter((r) => !r.mirror)
      .map((r) => (r[key] ? num(r[key], null) : null)).filter((v) => v != null);
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  }

  function paintValues() {
    const t = roomAvg('temp') ?? num(LH.config.weather.temp, null);
    const h = roomAvg('hum') ?? num(LH.config.weather.hum, null);
    $('#inTemp').textContent = t == null ? '—' : t.toFixed(1);
    $('#inHum').textContent = h == null ? '—' : Math.round(h);

    const k = num(LH.config.weather.kwh, null);
    const kwhRow = $('#todayKwh') && $('#todayKwh').closest('.m');
    if (kwhRow) kwhRow.hidden = !LH.config.weather.kwh;
    $('#todayKwh').textContent = k == null ? '—' : k.toFixed(2);
    paintPowerChip();

    const we = st(LH.config.weather.entity);
    if (we) {
      const a = we.attributes || {};
      /* 数字统一走 DSEG 字形（跟左上角时间同一套轮廓），单位符号留普通字体 */
      $('#wTemp').innerHTML = a.temperature != null
        ? dsegNum(Math.round(a.temperature) + '°') : '—';
      $('#wDesc').textContent = LABEL[we.state] || we.state;
      /* 体感：met.no 那个实体压根没有 apparent_temperature 属性，一直显示「—」。
         所以自己按「气温 + 相对湿度 + 风速」估一个（澳大利亚气象局的简化式
         AT ≈ Ta + 0.33·e − 0.70·ws − 4.0，e 是水汽压 hPa，ws 是风速 m/s）。 */
      const ap = apparent(a);
      $('#wRange').innerHTML = '湿度 ' +
        (a.humidity != null ? dsegNum(a.humidity) + '<i class="u">%</i>' : '—') +
        ' · 体感 ' +
        (ap == null ? '—' : '<i class="u">≈</i>' + dsegNum(Math.round(ap) + '°'));
      /* ≈ 表示这是估算值（met.no 不直接给体感），鼠标悬停能看到说明 */
      $('#wRange').title = '湿度与风速来自 met.no；体感按「气温 + 湿度 + 风速」估算，非官方数据';
    } else {
      $('#wTemp').textContent = '—';
      $('#wDesc').textContent = '待接入';
      $('#wRange').innerHTML = '天气实体未配置'
        + ' <a class="w-goto" href="#" data-goto="settings" role="button" tabindex="0" aria-label="打开设置面板里的接入说明">去配置</a>';
    }

    $('#srcNote').textContent = live() ? '实时' : '未连上 HA';
    $('#demoTag').hidden = true;
    paintMarkers();
    paintGlow();
    refreshSide();
    refreshRoom();
    refreshAlt();
    paintPeople();
  }

  /* ── 儿童手表（v222）：墨墨的米兔手表只当「补充信息」，不参与在家判定、不下发任何服务 ──
     三样活数据：电量（挂在 device_tracker 的 battery_level 属性上）、充电状态、街道级地址。
     地址给的是「「XX省XX市XX区XX路(在XX小区附近)」」这种中文串；
     电池电压 / 故障 / 工作状态 / 开关那几个实体常年 unknown，别画到界面上。
     断网时 xiaomi_home 会把整台设备刷成 unavailable（实测一天里会有几次秒级抖动），
     这时一律按「没有读数」处理，不显示 0%。 */
  const CHARGE_CN = { Charging: '充电中', 'Not Charging': '未充电', 'Not Chargeable': '不可充' };
  const WATCH_LOW = 20;                        // ≤20% 点成琥珀色提醒
  /* 「…凤凰东路(在中骏·汇景城附近)」→「中骏·汇景城」；没有括号就用整条。
     太长时按机构后缀截断，而不是硬取后 12 字：
     「XX市第X实验小学」→「…第X实验小学」（认得出是哪就够）。 */
  const PLACE_ORG = ['幼儿园', '小学', '中学', '学校', '学院', '医院', '广场', '大厦',
    '公园', '小区', '超市', '商场', '中心', '车站', '家园', '花园', '公寓'];
  function placeShort(s) {
    if (!s) return '';
    const m = s.match(/[（(]在?(.{1,26}?)(?:附近)?[）)]/);
    let x = m ? m[1] : s;
    x = x.replace(/^.*?省/, '');
    /* 「第一人民医院(地铁站)」这种嵌套括号：外层被上面吃掉了，剩下的半个括号砍掉 */
    x = x.replace(/[（(].*$/, '').trim();
    if (x.length <= 12) return x;
    let cut = -1;
    PLACE_ORG.forEach((k) => { const i = x.lastIndexOf(k); if (i >= 0) cut = Math.max(cut, i); });
    /* 后缀前再带 5 个字（「大学路」+「实验学校」），否则只剩光秃秃的「学校」 */
    const start = cut > 0 ? Math.max(0, cut - 5) : Math.max(0, x.length - 12);
    return (start > 0 ? '…' : '') + x.slice(start, start + 12);
  }
  function watchOf(p) {
    const w = p && p.watch;
    if (!w) return null;
    const t = st(w.tracker), c = st(w.charge), pl = st(w.place);
    const bad = (s) => !s || s.state === 'unavailable' || s.state === 'unknown';
    const b = t && t.attributes ? Number(t.attributes.battery_level) : NaN;
    const place = bad(pl) ? '' : String(pl.state || '');
    return {
      cfg: w,                                  /* 详情弹窗要拿实体 id，原样带出去 */
      label: w.label || '手表',
      batt: bad(t) || !Number.isFinite(b) ? null : Math.round(b),
      charge: bad(c) ? '' : String(c.state || ''),
      place: place,
      short: placeShort(place),
      atHome: !!(w.home && place.indexOf(w.home) >= 0),
      ok: !bad(t),
    };
  }
  /* 家人卡那行的小字：在家时不重复地址（上一行已经写着「在家」），出门才报地点 */
  function watchLine(w) {
    const p = [];
    if (w.batt != null) p.push('手表 ' + w.batt + '%');
    if (w.charge && CHARGE_CN[w.charge]) p.push(CHARGE_CN[w.charge]);
    if (w.short && !w.atHome) p.push(w.short);
    return p.join(' · ');
  }

  /* ── 手表详情弹窗（v223）：点顶栏墨墨 chip / 家人卡墨墨那行 → 只讲手表这一台 ──
     不复用概览卡片：概览是「家里这一堆」的汇总，手表要的是电量 · 位置 · 这台设备本身。
     全程只读：14 个实体里能动的（开关 / 开始充电）语义都不明，不做下发。 */
  /* 一个可折叠的小节（和 infoCard 那套 ci-h / ci-b 同款，但不写死 id，
     一屏里可以叠好几块） */
  function wFold(title, inner, open) {
    const box = el('div', 'ctl-info');
    box.innerHTML = '<button class="ci-h' + (open ? ' open' : '') + '" type="button">' + title +
      '<i>▾</i></button><div class="ci-b"' + (open ? '' : ' hidden') + '>' + (inner || '') + '</div>';
    const b = box.querySelector('.ci-h'), bd = box.querySelector('.ci-b');
    b.addEventListener('click', () => {
      const show = bd.hidden;
      bd.hidden = !show;
      b.classList.toggle('open', show);
    });
    return box;
  }
  /* cls 用来给某几行换一套列宽：IP 当标签时 86px 放不下，会折成两行 */
  function watchRows(pairs, cls) {
    const c = 'ci-r' + (cls ? ' ' + cls : '');
    return (pairs || []).filter((x) => x && x.length > 1 && x[1] != null && x[1] !== '' && x[1] !== undefined)
      .map((x) => '<div class="' + c + '"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>').join('')
      || '<div class="' + c + '"><span>—</span><b>没有可显示的项</b></div>';
  }
  /* 这台手表的全部实体：14 个实体共用同一个 did 前缀（domain 各不相同），
     所以按 object_id 前 4 段（<厂商前缀>_<设备ID>）前缀捞，不按 domain 过滤 */
  function watchEnts(w) {
    const h = hass();
    if (!h || !w) return [];
    const oid = String((w.cfg && w.cfg.tracker) || '').split('.')[1] || '';
    const pre = oid.split('_').slice(0, 4).join('_');
    if (pre.length < 10) return [];
    const rows = Object.keys(h.states)
      .filter((e) => (e.split('.')[1] || '').indexOf(pre) === 0)
      .sort()
      .map((e) => {
        const s = h.states[e], a = s.attributes || {};
        let v = s.state === 'unknown' ? '未上报' : String(s.state);
        /* event.*：state 是「上一次触发的时刻」，event_type 才是「发生了什么」。
           米家那边留了个陈年 event_type（电量低）但 state 是 unknown —— 只认有真时间的，
           否则会在 95% 电量的手边上写一句「电量低」。 */
        if (e.indexOf('event.') === 0) {
          const ok = a.event_type && s.state && s.state !== 'unknown' && s.state !== 'unavailable';
          v = ok ? a.event_type + ' · ' + ago(s.state) : '未上报';
        } else if (e.indexOf('device_tracker.') === 0) {
          /* not_home 是「GPS 判定」，这条表更值得翻译成人话（家里那套 ping 才是准的） */
          if (v === 'not_home') v = '离家（GPS）';
          else if (v === 'home') v = '在家（GPS）';
        } else if (CHARGE_CN[v]) {
          v = CHARGE_CN[v];
        }
        return { n: a.friendly_name || e, v: v };
      });
    /* 14 行 friendly_name 全是「米兔儿童学习手表7  电池 开始充电」——
       设备名重复 14 遍，86px 标签列只剩三行高度。砍掉公共前缀，段间空格换「·」 */
    let cut = 0;
    if (rows.length > 1) {
      const base = rows[0].n;
      cut = base.length;
      rows.forEach((r) => {
        let i = 0;
        while (i < cut && i < r.n.length && r.n[i] === base[i]) i++;
        cut = i;
      });
      if (cut < 4) cut = 0;               // 短前缀（比如都只剩「电池」）就不砍
    }
    return rows.map((r) => {
      const n = (cut ? r.n.slice(cut).trim() : r.n) || r.n;
      return [n.replace(/\s{2,}/g, ' · ')
        /* 砍完设备名还剩「电池 电池状态改变」这种重复：前缀词和后半段开头一样就只留一份 */
        .replace(/^(电池|手表)\s+(?=\1)/, '')
        .replace(/\s+/g, ' '), r.v];
    });
  }
  /* 设备注册表里的型号 / 固件 / 区域：要等 WS 回来，先占一行「读取中」 */
  async function watchDevice(w) {
    try {
      const h = hass();
      if (!h || !h.callWS || !w) return null;
      const [devs, ents] = await Promise.all([
        h.callWS({ type: 'config/device_registry/list' }),
        h.callWS({ type: 'config/entity_registry/list' }),
      ]);
      const e = (ents || []).find((x) => x.entity_id === w.cfg.tracker);
      if (!e || !e.device_id) return null;
      return (devs || []).find((x) => x.id === e.device_id) || null;
    } catch (err) {
      return null;
    }
  }
  function watchAttrs(w) {
    const t = st(w.cfg && w.cfg.tracker);
    const a = (t && t.attributes) || {};
    const order = ['friendly_name', 'battery_level', 'source_type', 'gps_accuracy',
      'latitude', 'longitude', 'in_zones', 'tracking_type'];
    const rows = order.filter((k) => a[k] != null)
      .map((k) => [k, Array.isArray(a[k]) ? (a[k].join(', ') || '空') : String(a[k])]);
    Object.keys(a).sort().forEach((k) => {
      if (order.indexOf(k) < 0 && !/^(icon|device_class|unit_of_measurement|supported_features)$/.test(k)) {
        rows.push([k, String(a[k])]);
      }
    });
    return rows;
  }

  /* v225：每个人一页。齐齐 / 双双只有 ping（probes），墨墨多一块手表 ——
     卡片按「有没有」拼，没有手表的人就只剩在家状态 + 一句说明，先留好位置。 */
  function buildPerson(p) {
    const box = $('#personCards');
    if (!box) return;
    box.innerHTML = '';
    const home = st(p.entity);
    const on = !!(home && home.state === 'on');
    const known = !!home && home.state !== 'unavailable' && home.state !== 'unknown';

    /* ① 在家状态：人人都有的一块（大字在家/离家 + 探测明细） */
    const probes = (p.probes || []).map((x) => {
      const s = st(x.e);
      const v = !s ? '读不到' : s.state === 'on' ? '在线' : s.state === 'off' ? '离线' : s.state;
      return [x.n, v + (s && s.last_updated ? '（' + ago(s.last_updated) + '）' : '')];
    });
    const c1 = card('在家状态', 'i-home', '',
      '<div class="kv"><b>' + (known ? (on ? '在家' : '离家') : '检测中') + '</b><span>' +
      (known ? (on ? '设备连着家里 WiFi' : '设备都不在网里') : 'command_line 还没跑完第一轮') + '</span></div>' +
      '<div class="pwr">' +
        '<div class="pwr-i"><em>判定方式</em><b>WiFi ping</b></div>' +
        '<div class="pwr-i"><em>已持续</em><b>' + (home && home.last_changed ? ago(home.last_changed) : '—') + '</b></div>' +
        '<div class="pwr-i"><em>最新探测</em><b>' + (home && home.last_updated ? ago(home.last_updated) : '—') + '</b></div>' +
      '</div>' +
      '<div class="card-sub">' + (p.note ? p.note + ' · ' : '') +
      '容器每轮 ICMP ping 一次设备 IP；手机休眠 / Wi-Fi 省电会短时不通，看到「离家」先别急</div>');
    if (probes.length) {
      c1.append(wFold('探测明细（' + probes.length + ' 台）', watchRows(probes, 'ip'), true));
    }
    box.append(c1);

    const w = watchOf(p);
    if (!w) {
      /* ② 没接设备的人：把位置留出来，等哪天配了手表 / 定位就自己长出来 */
      box.append(card('设备', 'i-watch', '未接入',
        '<div class="card-sub">这位家人还没接可以定位的设备（儿童手表 / 手机定位那类），'
        + '所以这一页目前只有上面的在家判定。等接上了，这里会自动多出'
        + '「电量 · 位置 · 这台设备」三块 —— 跟接了手表的一样。</div>'));
      return;
    }
    buildWatchCards(box, p, w);
  }

  function buildWatchCards(box, p, w) {
    const t = st(w.cfg.tracker);
    const upd = t && t.last_updated ? ago(t.last_updated) : '—';
    const cn = (w.charge && CHARGE_CN[w.charge]) || '—';

    /* ① 电量：不放 badge —— 百分比已经是大字，充电状态在下面那排里，再来一个就三处重复 */
    box.append(card('电量', 'i-batt', '',
      '<div class="kv"><b>' + (w.batt == null ? '—' : w.batt) + '</b><span>' +
      (w.batt == null ? '手表这会儿没上报电量' : '% 手表剩余') + '</span></div>' +
      '<div class="pwr">' +
        /* 在家状态上面那张卡已经单独占一块了，这里只讲电池本身 */
        '<div class="pwr-i"><em>充电状态</em><b>' + cn + '</b></div>' +
        '<div class="pwr-i"><em>手表上报</em><b>' + upd + '</b></div>' +
        '<div class="pwr-i"><em>电量评价</em><b>' + (w.batt == null ? '—'
          : w.batt <= WATCH_LOW ? '该充电了' : w.batt <= 50 ? '够用' : '充足') + '</b></div>' +
      '</div>' +
      '<div class="card-sub">电量挂在 device_tracker 的 battery_level 属性上，米家云端拉一次才变；'
      + '≤' + WATCH_LOW + '% 时小字和顶栏小圆点会点成琥珀色</div>'));

    /* ② 位置 */
    const placeText = w.place || '手表这会儿没上报位置（米家云端刷新中，一天会有几次秒级 unavailable）';
    const c2 = card('位置', 'i-home', !w.place ? '读不到' : (w.atHome ? '在家附近' : '在外'),
      '<div class="card-sub">' + placeText + '</div>');
    c2.append(wFold('定位明细', watchRows([
      ['地点', w.short || null],
      ['定位方式', t && t.attributes ? t.attributes.source_type : null],
      ['精度', t && t.attributes && t.attributes.gps_accuracy != null
        ? t.attributes.gps_accuracy + ' m' : null],
      ['经纬度', t && t.attributes && t.attributes.latitude != null
        ? t.attributes.latitude + ', ' + t.attributes.longitude + '（手表只报到市一级）' : null],
      ['在家附近', w.cfg.home ? (w.atHome ? '是（地址含「' + w.cfg.home + '」）' : '否') : null],
      ['上报时间', upd],
    ]), true));
    box.append(c2);

    /* ③ 这台设备本身 */
    const ents = watchEnts(w);
    const c3 = card('这台手表', 'i-watch', ents.length ? ents.length + ' 个实体' : '',
      '<div class="card-sub">' + (w.label || '手表') + ' · 小米儿童手表全部走米家云端，读数抖一下很正常；'
      + '下面两块默认收起，点标题展开</div>' +
      /* 必须是 .ctl-info 容器：.ci-r 的 86px 两列栅格写的是 `.ctl-info .ci-r`，
         少了这层就是个裸 div，标签和值会挤成一行 */
      '<div class="ctl-info" id="watchDev"><div class="ci-b">' +
      '<div class="ci-r"><span>设备信息</span><b>读取中…</b></div></div></div>');
    watchDevice(w).then((d) => {
      const di = $('#watchDev');
      if (!di) return;
      di.innerHTML = '<div class="ci-b">' + (d ? watchRows([
        ['名称', d.name_by_user || d.name],
        ['型号', d.model],
        ['制造商', d.manufacturer],
        ['固件', d.sw_version],
        ['接入集成', 'xiaomi_home'],
        ['区域', d.area_id],
      ]) : watchRows([['设备信息', '读不到（需要 HA 的设备注册表权限）']])) + '</div>';
    });
    const dead = ents.filter((x) => x[1] === '未上报').length;
    c3.append(wFold('全部实体（' + ents.length + ' 个 · ' + dead + ' 个未上报）', watchRows(ents, 'ent'), false));
    c3.append(wFold('原始属性（device_tracker）', watchRows(watchAttrs(w), 'ent'), false));
    box.append(c3);
  }

  /* v225：家人详情弹窗 */
  function openPerson(p, idx) {
    const has = !!(p.watch && p.watch.tracker);
    const title = p.name || (idx != null ? ('家人 ' + (idx + 1)) : '家人详情');
    showLayer(title, has ? '在家状态 · ' + (p.watch.label || '手表') : '在家状态', 'pop-wide');
    $('#layerBody').innerHTML = '<div class="cards layer-cards" id="personCards"></div>';
    buildPerson(p);
    clearInterval(state.pageTimer);
    state.pageTimer = setInterval(() => {
      if (!state.layer || !$('#personCards')) return clearInterval(state.pageTimer);
      buildPerson(p);
    }, 6000);
  }

  /* 顶栏家人在线 chip（v218）：数据源与概览「家人」卡同一批（overview.people），
     这里只点灯。实体 unavailable/unknown（比如 command_line 还没跑完第一轮）时
     不亮，等下一轮扫描，不显示「离家」—— 分不清的事不乱说。
     v222：配了手表的（墨墨）title 里补电量 / 充电 / 在哪，电量 ≤20% 时小圆点变琥珀。 */
  function paintPeople() {
    const bar = $('#peopleBar');
    if (!bar) return;
    const PPL = (LH.config.overview || {}).people || [];
    PPL.forEach((p, pi) => {
      const chip = bar.querySelector('[data-ent="' + p.entity + '"]');
      if (!chip) return;
      const s = st(p.entity);
      const on = !!(s && s.state === 'on');
      const w = watchOf(p);
      chip.classList.toggle('on', on);
      chip.classList.toggle('low', !!(w && w.batt != null && w.batt <= WATCH_LOW));
      const line = w ? watchLine(w) : '';
      chip.title = '家人 ' + (pi + 1) + ' · ' + (on ? '在家'
        : s && s.state !== 'unavailable' && s.state !== 'unknown' ? '离家' : '检测中') +
        (line ? ' · ' + line : '') + ' · 点开看详情';
    });
  }

  /* 体感温度估算：weather 实体（met.no）没有 apparent_temperature，只能自己算。
     简化式 AT ≈ Ta + 0.33·e − 0.70·ws − 4.0（e 水汽压 hPa，ws 10m 高风速 m/s），
     高温时偏保守（不算日照），日常够用；缺湿度或气温就返回 null，界面显示「—」。 */
  function apparent(a) {
    const t = a.temperature, rh = a.humidity;
    if (t == null || rh == null) return null;
    let ws = 0;                                  // m/s
    if (a.wind_speed != null) {
      const u = (a.wind_speed_unit || 'km/h').toLowerCase();
      ws = u.indexOf('m/s') >= 0 ? a.wind_speed
        : u.indexOf('mph') >= 0 ? a.wind_speed * 0.447
          : a.wind_speed / 3.6;                  // 默认 km/h
    }
    const e = (rh / 100) * 6.105 * Math.exp(17.27 * t / (237.7 + t));
    return t + 0.33 * e - 0.70 * ws - 4.0;
  }

  /* ── 主题：默认跟随 sun.sun 的日出日落 ── */
  function themeMode() {
    try { return localStorage.getItem('lhTheme') || 'auto'; } catch (e) { return 'auto'; }
  }
  function setThemeMode(m) {
    try { localStorage.setItem('lhTheme', m); } catch (e) { /* 无痕模式忽略 */ }
    applyTheme();
  }
  function applyTheme() {
    const m = themeMode();
    let light = false;
    if (m === 'light') light = true;
    else if (m === 'dark') light = false;
    else {
      const s = st('sun.sun');
      const elv = s && s.attributes ? s.attributes.elevation : null;
      light = elv != null ? elv > 0 : (new Date().getHours() >= 7 && new Date().getHours() < 18);
    }
    const scr = $('#screen');
    if (!scr) return;
    if (light) scr.dataset.theme = 'light';
    else delete scr.dataset.theme;
    $$('.theme-btn[data-theme]').forEach((b) => b.classList.toggle('on', b.dataset.theme === m));
    syncSun(m);
    applyPane();
  }

  /* ── 现实风格底板（v235）：把户型色块/墙体换成手绘风照片，图标、光晕、标签照常 ──
     与昼夜主题、四季配色都正交：只改户型的画法，不动页面其它部分。
     存 localStorage.lhSkin（'flat' 默认 / 'real'），挂在 #screen[data-skin] 上给 CSS 用 */
  function skinOn() {
    try { return localStorage.getItem('lhSkin') === 'real'; } catch (e) { return false; }
  }
  function setSkin(on) {
    try { localStorage.setItem('lhSkin', on ? 'real' : 'flat'); } catch (e) { /* 无痕模式忽略 */ }
    applySkin();
  }
  function applySkin() {
    const scr = $('#screen');
    if (!scr) return;
    const on = skinOn();
    if (on) scr.dataset.skin = 'real';
    else delete scr.dataset.skin;
    /* viewBox 跟着皮肤走：现实风用底图外框那套（buildPlan 里算好存 planVB），
       照片和图标一起缩放，对位不受影响 */
    const svg = document.querySelector('.plan');
    if (svg && planVB) svg.setAttribute('viewBox', (on && planVB.real) ? planVB.real : planVB.std);
    const b = $('#skinBtn');
    if (b) {
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  /* ── 左栏 / 房间面板的雾面玻璃透明度 ──
     存的是「透明度百分比」（75 = 75% 透 → alpha 0.25），所以滑块越大越透。
     浅色主题底色本来就亮、和背景差得少，alpha 要多给 0.14 才看得出边界。 */
  const PANE_DEF = 75;
  function paneT() {
    const raw = uiPref().paneT;
    const v = Number(raw);
    if (raw === undefined || raw === null || !Number.isFinite(v)) return PANE_DEF;
    return Math.min(100, Math.max(0, v));
  }
  function applyPane() {
    const scr = $('#screen');
    if (!scr) return;
    const a = Math.min(1, (100 - paneT()) / 100 + (scr.dataset.theme === 'light' ? 0.14 : 0));
    scr.style.setProperty('--pane-a', a.toFixed(3));
    /* 说明页和设置弹窗里都有滑块（id 不同），按属性批量同步 */
    $$('[data-pane-rng]').forEach((r) => { if (Number(r.value) !== paneT()) r.value = String(paneT()); });
    $$('[data-pane-val]').forEach((v) => { v.textContent = paneT() + '%'; });
  }
  function setPaneT(v) {
    const p = uiPref();
    p.paneT = Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
    saveUI(p);
    applyPane();
  }

  /* ── 字体大小（总缩放）──
     存的是百分比（100 = 原大小），写进 #screen 的 --fsk，CSS 里所有字号都是 calc(Npx * var(--fsk))。
     范围只给 85~125：再大固定高度的格子（左栏行、底部筛选条、面板行高）会撑破，再小也没必要。 */
  const FS_DEF = 100, FS_MIN = 85, FS_MAX = 125, FS_STEP = 5;
  function fsPct() {
    const raw = uiPref().fs;
    const v = Number(raw);
    if (raw === undefined || raw === null || !Number.isFinite(v)) return FS_DEF;
    return Math.min(FS_MAX, Math.max(FS_MIN, Math.round(v)));
  }
  function applyFs() {
    const scr = $('#screen');
    const pct = fsPct();
    if (scr) scr.style.setProperty('--fsk', (pct / 100).toFixed(3));
    $$('[data-fs-rng]').forEach((r) => { if (Number(r.value) !== pct) r.value = String(pct); });
    $$('[data-fs-val]').forEach((v) => { v.textContent = pct + '%'; });
    $$('[data-fs-note]').forEach((n) => {
      n.textContent = pct === FS_DEF
        ? '当前：默认大小'
        : '当前：' + (pct > FS_DEF ? '放大 ' : '缩小 ') + Math.abs(pct - FS_DEF) + '%';
    });
    /* 字号变了日期行宽度也会变，左栏要跟着重量一次（等重排完成再量） */
    requestAnimationFrame(syncSideW);
  }
  function setFs(v) {
    const p = uiPref();
    p.fs = Math.min(FS_MAX, Math.max(FS_MIN, Math.round(Number(v) || FS_DEF)));
    saveUI(p);
    applyFs();
  }

  /* ── 右上角昼夜按钮：一个按钮三态轮换 日出(浅色) → 日落(深色) → 自动 ──
     和说明页那三个 theme-btn 共用 localStorage.lhTheme，改哪边另一边都会同步 */
  const SUN_MODE = { auto: 'auto', light: 'day', dark: 'night' };
  const SUN_NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
  const SUN_TEXT = {
    auto: '主题 · 跟随日出日落（点击→固定浅色）',
    day: '主题 · 固定浅色 / 日出（点击→固定深色）',
    night: '主题 · 固定深色 / 日落（点击→自动）',
  };
  function syncSun(m) {
    const b = $('#sunBtn');
    if (!b) return;
    const mode = SUN_MODE[m] || 'auto';
    b.dataset.mode = mode;
    const u = b.querySelector('use');
    if (u) u.setAttribute('href', mode === 'day' ? '#i-sun-up' : mode === 'night' ? '#i-night' : '#i-sunmoon');
    const t = SUN_TEXT[mode] || SUN_TEXT.auto;
    b.title = t;
    b.setAttribute('aria-label', t);
    b.setAttribute('aria-pressed', String(mode !== 'auto'));
  }
  function cycleSun() {
    const next = SUN_NEXT[themeMode()] || 'auto';
    setThemeMode(next);
    toast(next === 'auto' ? '主题 · 跟随日出日落' : next === 'light' ? '主题 · 固定浅色（日出）' : '主题 · 固定深色（日落）');
  }

  /* ── 四季配色：默认按节气（立春/立夏/立秋/立冬）自动换季，可手动固定 ── */
  const SEASON_NAME = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
  function monthSeason(d) {
    const m = d.getMonth() + 1;
    if (m === 12 || m <= 2) return 'winter';
    if (m <= 5) return 'spring';
    if (m <= 8) return 'summer';
    return 'autumn';
  }
  function seasonOf(date) {
    // 节气算不出来（老浏览器/异常）就退回按月份，保证一定有季节
    const hit = (yy, name) => (termsOfYear(yy) || []).find((t) => t.name === name);
    const y = date.getFullYear();
    const lc = hit(y, '立春'), lx = hit(y, '立夏'), lq = hit(y, '立秋'), ld = hit(y, '立冬');
    if (!lc || !lx || !lq || !ld) return monthSeason(date);
    const now = dayKey(date);
    const k = (t) => dayKey(t.date);
    if (now < k(lc)) return 'winter';
    if (now < k(lx)) return 'spring';
    if (now < k(lq)) return 'summer';
    if (now < k(ld)) return 'autumn';
    return 'winter';
  }
  function seasonMode() {
    try { return localStorage.getItem('lhSeason') || 'auto'; } catch (e) { return 'auto'; }
  }
  function setSeasonMode(m) {
    try { localStorage.setItem('lhSeason', m); } catch (e) { /* 无痕模式忽略 */ }
    applySeason();
  }
  function applySeason() {
    const m = seasonMode();
    const s = m && m !== 'auto' ? m : seasonOf(new Date());
    const scr = $('#screen');
    if (!scr) return;
    scr.dataset.season = s;
    $$('.theme-btn[data-season], .st-btn[data-season]').forEach((b) => {
      const on = b.dataset.season === m;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const tag = $('#seasonTag');
    if (tag) paintSeasonTag();
  }

  /* ── 日期旁的季节标签：只认「真实日期」（节气），跟主题配色选哪季无关 ──
     以前这里写的是配色所用的季节，手动固定「夏」配色时日期旁就会一直显示「夏」。
     seasonOf 每次要算 24 个节气，按天缓存一份就够。 */
  let seasonDayCache = { day: '', s: 'autumn' };
  function realSeason() {
    const now = new Date();
    const k = dayKey(now);
    if (seasonDayCache.day !== k) seasonDayCache = { day: k, s: seasonOf(now) };
    return seasonDayCache.s;
  }
  function paintSeasonTag() {
    const tag = $('#seasonTag');
    if (!tag) return;
    const s = realSeason();
    const txt = SEASON_NAME[s] || '';
    if (tag.textContent !== txt) tag.textContent = txt;
    const t = '季节 · ' + txt + '（按节气的真实季节，与配色无关）';
    if (tag.title !== t) tag.title = t;
  }

  /* 底部筛选 chip：可在编辑器里改名称 / 图标 / 类型 / 顺序，
     所以重绘时也要能整体重建，不能只在 wire() 里绑一次 */
  function buildFilterChips() {
    const box = $('#filterChips');
    if (!box) return;
    box.innerHTML = '';
    const list = LH.filters || [];
    /* 当前选中的筛选如果被删掉了，退回「全部」 */
    if (state.filter !== 'all' && !list.some((f) => f.id === state.filter)) state.filter = 'all';
    list.forEach((f) => {
      const b = el('button', 'filter' + (f.id === state.filter ? ' active' : ''));
      b.type = 'button';
      b.dataset.f = f.id;
      /* 名字必须包一层 span：窄屏（≤640）CSS 只留图标，靠 span{display:none} 收窄，
         纯文本节点没法单独隐藏；title 兜住「图标是什么」这件事 */
      b.title = f.name;
      b.innerHTML = (f.icon ? `<svg><use href="#${f.icon}"/></svg>` : '') + `<span>${f.name}</span>`;
      b.addEventListener('click', () => {
        state.filter = f.id;
        $$('.filter').forEach((x) => x.classList.toggle('active', x.dataset.f === f.id));
        paintMarkers();
        paintGlow();
        if (state.room) openRoom(state.room, true);
      });
      box.append(b);
    });
  }

  /* ── 启动 ── */
  function wire() {
    /* 滑块拖到外面松手时 pointerup 不落在 input 上，state.drag 会一直卡在 true，
       进度条从此不再跟随实体真实值 —— 在 window 上兜底释放 */
    ['pointerup', 'pointercancel'].forEach((t) =>
      window.addEventListener(t, () => { state.drag = false; }, true));

    const scenes = $('#scenes');
    LH.scenes.forEach((s) => {
      const b = el('button', 'pill');
      b.type = 'button';
      /* title 用情景自带的 hint：一眼能看出这一下会动多少设备（比如「打开全屋 25 盏灯」） */
      b.title = s.hint || s.name;
      b.innerHTML = `<svg><use href="#${s.icon}"/></svg><span>${s.name}</span>`;
      b.addEventListener('click', () => applyScene(s.id));
      scenes.append(b);
    });

    /* 家人在线（v218）：接在情景按钮后面的小 chip，不显示具体人名 */
    const pbar = $('#peopleBar');
    if (pbar) {
      const PPL = (LH.config.overview || {}).people || [];
      PPL.forEach((p, pi) => {
        const b = el('button', 'ppl-chip');
        b.type = 'button';
        b.dataset.ent = p.entity;
        b.title = '家人 ' + (pi + 1) + ' · 按设备联网判定，点开看详情';
        b.innerHTML = '<svg><use href="#' + (p.watch ? 'i-watch' : 'i-user') + '"/></svg>' +
          '<i class="d"></i>';
        b.addEventListener('click', () => openPerson(p, pi));
        pbar.append(b);
      });
      paintPeople();
    }

    buildFilterChips();

    $('#roomInfoBtn').addEventListener('click', () => {
      if (state.room) closeRoom();
      else openRoom('living');
    });

    /* 外观设置两个入口共用同一个 openSettings：左下角那条 + 窄屏时右上角补位的齿轮 */
    ['#fnSet', '#ltSetN'].forEach((sel) => {
      const b = $(sel);
      if (b) b.addEventListener('click', openSettings);
    });
    const bFull = $('#ltFull');
    if (bFull) bFull.addEventListener('click', toggleFull);
    syncFull();
    const bSide = $('#ltSide'), bTop = $('#ltTop');
    if (bSide) bSide.addEventListener('click', () => toggleUI('side'));
    if (bTop) bTop.addEventListener('click', () => toggleUI('top'));
    const bHaS = $('#ltHaSide'), bHaT = $('#ltHaTop');
    if (bHaS) bHaS.addEventListener('click', () => toggleUI('haSide'));
    if (bHaT) bHaT.addEventListener('click', () => toggleUI('haTop'));
    $('#rpClose').addEventListener('click', closeRoom);
    /* 常驻栏上的 ×：临时收起来（右上角齿轮里可以再打开，点「首页」也会复原） */
    $('#altClose').addEventListener('click', () => {
      toggleUI('pan');
      toast(altOn() ? '已显示常用设备栏' : '已收起 · 齿轮里可再打开');
    });
    $('#layerClose').addEventListener('click', closeLayer);
    $('#clockBtn').addEventListener('click', openCalendar);
    $('#weatherBtn').addEventListener('click', openWeather);
    $('#weatherBtn').addEventListener('keydown', (e) => { if (e.key === 'Enter') openWeather(); });
    /* 天气卡空态里的「去配置」按钮：先阻止冒泡（否则会连 openWeather 一起触发），
       再直接跳设置面板，用户能看到完整接入说明 */
    $('#weatherBtn').addEventListener('click', (e) => {
      const tgt = e.target.closest ? e.target.closest('.w-goto') : null;
      if (!tgt) return;
      e.preventDefault(); e.stopPropagation();
      openSettings();
    }, true);
    /* 电量行在天气卡内部，点它要自己吃掉冒泡，否则会连带打开天气 */
    const wK = $('#wKwh');
    if (wK) wK.addEventListener('click', (e) => { e.stopPropagation(); openPower(); });

    $$('[data-close]').forEach((b) => b.addEventListener('click', () => showPage('home')));
    /* 右上角主题色快捷按钮：跟说明页那排共用 setSeasonMode，选中态由 applySeason 统一刷 */
    $$('#seasonToggles .st-btn').forEach((b) => b.addEventListener('click', () => setSeasonMode(b.dataset.season)));
    /* 昼夜按钮：三态轮换，状态由 applyTheme → syncSun 统一回写 */
    const bSun = $('#sunBtn');
    if (bSun) bSun.addEventListener('click', cycleSun);
    /* 现实风格底板：一键开关，状态由 applySkin 统一回写 */
    const bSkin = $('#skinBtn');
    if (bSkin) bSkin.addEventListener('click', () => setSkin(!skinOn()));
    /* 底部一条：首页是页面切换，概览 / 家电改成弹窗 */
    $$('.ptab').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.pop === 'overview') openOverview();
      else if (b.dataset.pop === 'appliance') openAppliances();
      else resetView();          /* 首页 = 把显示状态复位到刚登录那样 */
    }));

    /* 点浮层外部即关：右上角布局按钮、主题色按钮属于常驻控件，点它们不算"点空白处" */
    document.addEventListener('pointerdown', (e) => {
      state.downInLayer = !!(state.layer && $('#layer').contains(e.target));
    }, true);
    document.addEventListener('click', (e) => {
      const fromLayer = state.downInLayer;
      state.downInLayer = false;
      if (!state.layer) return;
      if ($('#layer').contains(e.target)) return;
      /* 从浮层里按下、在浮层外松开（拖完滑块、选中文字）不算点空白处 */
      if (fromLayer) return;
      if (e.target.closest && e.target.closest('.layout-toggles, .season-toggles')) return;
      /* 刚打开的那一下点击本身不算，也支持点别的设备直接换弹窗 */
      if (Date.now() - (state.layerAt || 0) < 260) return;
      closeLayer();
    });
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Escape' || e.key === 'Esc') && state.layer) closeLayer();
    });

    $('#stage').addEventListener('click', (e) => {
      if (e.target.id === 'stage' || e.target.classList.contains('plan-wrap')) closeRoom();
    });

    resetIdle();
    ['pointerdown', 'keydown', 'wheel'].forEach((ev) => document.addEventListener(ev, () => {
      if ($('#standby').hidden) resetIdle();
    }, { passive: true }));
    $('#standby').addEventListener('click', (e) => { e.stopPropagation(); wake(); });
    /* 左下角「待机」：立刻进屏保，不用等闲置 5 分钟；轻触任意处回来 */
    const bIdle = $('#fnIdle');
    if (bIdle) bIdle.addEventListener('click', () => {
      if (state.layer) closeLayer();
      clearTimeout(state.resetTimer);
      clearTimeout(state.idleTimer);
      paintClock();               // 先补一次时间，别闪过上一轮的值
      $('#standby').hidden = false;
    });
  }

  /* ── 左栏 / 顶栏显隐（记在 localStorage，刷新后保持） ── */
  const UI_KEY = 'lhUI';
  function uiPref() {
    try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function applyUI() {
    const p = uiPref();
    const sc = $('#screen');
    if (!sc) return;
    const hideSide = p.side === false;
    const hideTop = p.top === false;
    sc.classList.toggle('hide-side', hideSide);
    sc.classList.toggle('hide-top', hideTop);
    const haSide = p.haSide === false, haTop = p.haTop === false;
    [['#ltSide', hideSide, '左栏'], ['#ltTop', hideTop, '顶栏'],
      ['#ltHaSide', haSide, 'HA 侧栏'], ['#ltHaTop', haTop, 'HA 顶栏']].forEach(([sel, off, nm]) => {
      const b = $(sel);
      if (!b) return;
      b.classList.toggle('off', off);
      b.title = (off ? '显示' : '隐藏') + nm;
      b.setAttribute('aria-label', b.title);
      b.setAttribute('aria-pressed', String(!off));
    });
    syncAlt();
  }
  /* ── 全屏（等同 F11）──
     iframe 与 HA 同源，所以能直接对父窗口的文档发请求，整扇浏览器窗口进全屏。
     必须发生在真实点击里：Fullscreen API 要 transient activation，脚本调用会被"Permissions check"拒。 */
  function fsDoc() {
    try { return (window.parent && window.parent.document) || document; } catch (e) { return document; }
  }
  const fsEl = () => fsDoc().fullscreenElement || document.fullscreenElement || null;

  async function toggleFull() {
    if (fsEl()) {
      try { await fsDoc().exitFullscreen(); } catch (e) { /* 忽略：Esc 也会自己退出 */ }
    } else {
      /* 优先整窗全屏（真 F11）；万一被拦，退而求其次只把 iframe 自己放大 */
      let done = false;
      try { await fsDoc().documentElement.requestFullscreen(); done = true; } catch (e) { /* 继续兜底 */ }
      if (!done) {
        try { await document.documentElement.requestFullscreen(); done = true; } catch (e) { /* 都被拒 */ }
      }
      if (!done) toast('浏览器拒绝了全屏请求 · 可手动按 F11');
    }
    syncFull();
  }
  function syncFull() {
    const b = $('#ltFull');
    const on = !!fsEl();
    if (b) {
      b.classList.toggle('on', on);
      b.title = on ? '退出全屏（Esc）· 还原 HA 侧栏与顶栏' : '进入全屏（F11）· 同时收起 HA 侧栏与顶栏';
      b.setAttribute('aria-pressed', String(on));
      const u = b.querySelector('use');
      if (u) u.setAttribute('href', on ? '#i-full-exit' : '#i-full');
    }
    fsLink(on);
  }

  /* ── 全屏联动：进全屏自动收起 HA 侧栏 + 顶栏，退出还原 ──
     只记进出那一瞬的值；若用户在全屏里又手动点了这两个按钮，就算他接管，
     退出时不再回滚（免得"我明明打开了，退出后被关掉"）。 */
  let fsSaved = null;      // { haSide, haTop }：进入全屏前的取值
  let fsTouched = false;   // 全屏期间是否被手动改过
  let fsOn = false;
  function saveUI(p) {
    try { localStorage.setItem(UI_KEY, JSON.stringify(p)); } catch (e) { /* 隐私模式忽略 */ }
  }
  function fsLink(on) {
    if (on === fsOn) return;
    fsOn = on;
    if (on) {
      const p = uiPref();
      fsSaved = { haSide: p.haSide !== false, haTop: p.haTop !== false };
      fsTouched = false;
      if (fsSaved.haSide || fsSaved.haTop) {
        p.haSide = false; p.haTop = false;
        saveUI(p); applyUI(); applyHaUI();
        toast('全屏 · 已自动收起 HA 侧栏与顶栏');
      }
    } else {
      if (fsSaved && !fsTouched) {
        const p = uiPref();
        p.haSide = fsSaved.haSide; p.haTop = fsSaved.haTop;
        saveUI(p); applyUI(); applyHaUI();
      }
      fsSaved = null;
    }
  }
  /* 监听父子两层的 fullscreenchange：Esc 退出、点 HA 其它地方退出都要同步按钮态 */
  ['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => {
    try { fsDoc().addEventListener(ev, syncFull); } catch (e) { /* noop */ }
    document.addEventListener(ev, syncFull);
  });

  function toggleUI(k) {
    const p = uiPref();
    p[k] = p[k] === false;
    saveUI(p);
    /* 全屏期间手动改 HA 侧栏/顶栏 → 用户接管，退出全屏不再回滚 */
    if (fsSaved && (k === 'haSide' || k === 'haTop')) fsTouched = true;
    applyUI();
    applyHaUI();
  }

  /* ── HA 外层框架显隐：左侧栏 / 顶部栏 ──
     iframe 与 HA 同源，可以直接进父窗口的 shadow DOM 注入样式。
     用注入 <style> 而不是改 element.style：HA 切面板会重建这些节点，
     规则留在 shadowRoot 里更稳；再配一个低频重试应对重建后宿主被换掉。 */
  function haShell() {
    try {
      const w = window.parent;
      if (!w || w === window) return null;
      const ha = w.document.querySelector('home-assistant');
      if (!ha || !ha.shadowRoot) return null;
      const main = ha.shadowRoot.querySelector('home-assistant-main');
      const msr = main && main.shadowRoot;
      if (!msr) return null;
      const drawer = msr.querySelector('ha-drawer');
      const drawerSR = drawer && drawer.shadowRoot;
      const panel = msr.querySelector('ha-panel-lovelace');
      let rootSR = null;
      if (panel && panel.shadowRoot) {
        const root = panel.shadowRoot.querySelector('hui-root');
        rootSR = root && root.shadowRoot;
      }
      return { msr, drawerSR, rootSR };
    } catch (e) { return null; }
  }
  function haInject(root, id, css, on) {
    if (!root) return;
    let s = root.getElementById(id);
    if (!s) {
      if (!on) return;
      s = document.createElement('style');
      s.id = id;
      root.appendChild(s);
    }
    const next = on ? css : '';
    if (s.textContent !== next) s.textContent = next;
  }
  function applyHaUI() {
    const p = uiPref();
    const h = haShell();
    if (!h) return false;
    // 光 display:none 不够：占位是 .app-content 的 padding-left 和
    // hui-view-container 的 padding-top，不清掉的话位置还空在那儿
    haInject(h.msr, 'lh-ha-side-css', 'ha-sidebar{display:none !important}', p.haSide === false);
    // sidebar-shell 是 ha-drawer 里包着 ha-sidebar 的空壳：position:fixed; width:256px; z-index:6。
    // ha-sidebar 设 display:none 只是把内容藏了，这层壳还留在最左侧，把 0~256px 的点击全部吃掉
    // （连 iframe 都收不到事件），必须一起干掉
    haInject(h.drawerSR, 'lh-ha-side-pad',
      '.app-content{padding-left:0 !important}.sidebar-shell{display:none !important}',
      p.haSide === false);
    haInject(h.rootSR, 'lh-ha-top-css', '.header{display:none !important}', p.haTop === false);
    haInject(h.rootSR, 'lh-ha-top-pad', 'hui-view-container{padding-top:0 !important}', p.haTop === false);
    return true;
  }

  /* 户型整体按「顶栏底下还剩多少空间」上移（最多 14px，顶上留 4px），不动大小和内部比例。
     背景：底栏位置不动的情况下，容器高度受限时（窗口宽 / 全屏 / 隐藏 HA 侧栏）
     虚线底边离底部筛选条只剩 4px，看着像粘在一起；宽度受限时上下本来就有几十 px 余量，
     room 大 → 上移满 14px。只做 translateY —— 缩放、房间比例、图标位置一个像素都不变。 */
  function liftPlan() {
    const svg = document.querySelector('svg.plan');
    if (!svg) return;
    svg.style.transform = '';
    const dash = svg.querySelector('.plan-dash');
    const top = document.querySelector('.topbar');
    if (!dash || !top) return;
    const d = dash.getBoundingClientRect(), t = top.getBoundingClientRect();
    const room = d.top - t.bottom;                    // 顶栏底边到虚线顶边
    const up = Math.max(0, Math.min(14, room - 4));
    if (up > 0.5) svg.style.transform = 'translateY(' + (-up).toFixed(1) + 'px)';
  }

  let tick = null;
  /* ★ 老设备实体迁移：给没有 entities 数组的设备补全 device_id + 兄弟实体
     升级到新版后自动跑一次，跑完写回 localStorage，让旧户型图也能匹配 DEVICE_TEMPLATES */
  function migrateDeviceEntities() {
    const hass = window.hass;
    if (!hass || typeof hass.callWS !== 'function') return;  // WS 还没连上，跳过
    const devs = window.LH && window.LH.devices;
    if (!Array.isArray(devs) || !devs.length) return;

    // 找出所有需要迁移的设备
    const needMigrate = devs.filter((d) => d && d.entity && !(d.entities && d.entities.length) && !d.ctl);
    if (!needMigrate.length) return;  // 全部迁移过了

    // 异步查 WS
    hass.callWS({ type: 'config/entity_registry/list' }).then((ents) => {
      if (!Array.isArray(ents)) return;
      let changed = false;
      for (const d of needMigrate) {
        const myEnt = ents.find((x) => x.entity_id === d.entity);
        if (myEnt && myEnt.device_id) {
          d.device_id = myEnt.device_id;
          const siblings = ents
            .filter((x) => x.device_id === myEnt.device_id && !x.disabled_by && !x.hidden_by)
            .map((x) => x.entity_id);
          d.entities = siblings.length > 1 ? siblings : [d.entity];
          changed = true;
        }
      }
      if (changed) {
        // 写回 localStorage（编辑器下次打开也能看到）
        try {
          const raw = localStorage.getItem('lovehome.config.v1');
          if (raw) {
            const cfg = JSON.parse(raw);
            cfg.devices = devs;
            localStorage.setItem('lovehome.config.v1', JSON.stringify(cfg));
            console.log('[LoveHome] ✓ 迁移了', needMigrate.filter((d) => d.entities && d.entities.length).length, '台老设备（补全 entities 数组）');
          }
        } catch (e) {}
      }
    }).catch(() => { /* WS 暂时不可用，静默跳过 */ });
  }

  function boot() {
    // ★ 关键：先读用户保存的配置覆盖模板
    // 编辑器 persist() 保存到 localStorage('lovehome.config.v1')
    // 主界面必须先读这个，否则刷新就回到模板（用户啥都白改）
    try {
      const raw = localStorage.getItem('lovehome.config.v1');
      if (raw) {
        const saved = JSON.parse(raw);
        const SECTIONS = ['config', 'plan', 'rooms', 'devices', 'readouts',
                          'scenes', 'filters', 'appliances', 'supplies', 'panel', 'missing'];
        for (const k of SECTIONS) if (saved[k] != null) window.LH[k] = saved[k];
      }
    } catch (e) { console.warn('[LoveHome] 读取保存配置失败', e); }

    // ★ 迁移：老设备没有 entities 数组的，异步补全 device_id + 兄弟实体
    //    （让升级到新版后，旧户型图里的设备也能匹配 DEVICE_TEMPLATES 走专业面板）
    try { migrateDeviceEntities(); } catch (e) {}

    buildPlan();
    buildSide();
    /* 刷新后默认收起房间面板，右列显示「天气 · 用电」——
       原来这里无条件 openRoom('living')，等于每次刷新都把餐客厅面板怼在常驻栏前面。
       想看房间面板点右侧把手（#roomInfoBtn）或户型里的房间即可。 */
    state.room = null;
    $('#roomPanel').hidden = true;
    bindComposite();
    wire();
    showPage(state.page || 'home');
    applyUI();
    applyHaUI();
    syncFull();   // 刷新时若已在全屏态，按钮图标与联动一起对齐
    // HA 切面板/重渲染会把这些 shadow 宿主换掉，低频补一次
    setInterval(applyHaUI, 2000);
    applyTheme();
    applySeason();
    applySkin();
    applyFs();
    requestAnimationFrame(liftPlan);   // 等布局定下来再量「顶栏底下还剩多少」
    // 主题每分钟重算（跟着日出日落走），季节每小时看一次就够（换季只在节气当天）
    setInterval(applyTheme, 60000);
    setInterval(applySeason, 3600000);
    paintClock();
    setInterval(paintClock, 1000);
    /* v192：倒计时每秒走一次（没任务时 tickTimers 自己会立刻返回，开销可忽略） */
    setInterval(tickTimers, 1000);
    /* 窗口宽度/字体变了，日期行宽度会变，左栏宽度要跟着重量；
       户型的上移量也要重量（缩放变了，顶上的余量跟着变）。
       v221：宽度跨过常驻栏断点（≤900 整块撤掉）时要补一次同步，
       否则从手机横回桌面，常驻栏要等下一次点「首页」才回来。 */
    let altFit = null;
    window.addEventListener('resize', () => {
      syncSideW();
      liftPlan();
      const fit = altWide();
      if (fit !== altFit) { altFit = fit; syncAlt(); }
    });
    state.online = live();
    seedAirer();
    paintValues();
    clearInterval(tick);
    tick = setInterval(() => {
      const nowLive = live();
      if (nowLive !== state.online) { state.online = nowLive; paintValues(); }
      else paintValues();
    }, LH.config.refreshMs || 2000);
    state.booted = true;
    /* 通知编辑器：boot 已完成，可以安全地触发重绘/注入入口 */
    window.LOVEHOME_BOOTED = true;
    document.dispatchEvent(new CustomEvent('LOVEHOME_BOOTED'));
  }

  /* ── 编辑器触发的整体重绘（不重启定时器、不重新绑事件） ── */
  function rerenderAll() {
    // boot() 还没跑完就别瞎重绘（编辑器可能比 boot 先 dispatch 事件）
    if (!state.booted) return;
    // 确保 lovehome.js 期望的数据格式（room.pts 必须是字符串）
    try {
      if (typeof window.LHEditor !== 'undefined' && typeof window.LHEditor.normalize === 'function') {
        window.LHEditor.normalize();
      }
    } catch (e) { /* ignore */ }
    // 1) 重建户型图（房间多边形、墙体、设备标记点全都重画）
    buildPlan();
    // 2) 重建左栏（全屋统计 + 房间列表）和底部筛选条
    buildSide();
    buildFilterChips();
    // 3) 如果当前正在看房间面板，也刷新一下
    if (state.room) {
      openRoom(state.room, true);
    } else if ($('#altPanel') && !$('#altPanel').hidden) {
      syncAlt();
    }
    // 4) 概览 / 家电浮层如果开着也重绘
    if ($('#overviewCards')) openOverview();
    else if ($('#applianceCards')) openAppliances();
    // 5) 应用主题/皮肤（如果可能变了）
    applyTheme();
    applySeason();
    applySkin();
    // 6) 立刻重刷一次数值（不用等下一个 2s tick）
    paintValues();
  }

  document.addEventListener('LOVEHOME_RERENDER', rerenderAll);

  document.addEventListener('DOMContentLoaded', () => {
    // 等父窗口的 hass 就绪（iframe 首次加载时可能还没注入）
    let tries = 0;
    (function wait() {
      if (hass() || window.parent === window || tries++ > 20) return boot();
      setTimeout(wait, 200);
    })();
  });
})();

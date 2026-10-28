#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成 QLovehome 数据层 (qlovehome-data.js)：把 HA 里已有的实体按房间接线。

只写静态配置；运行时的状态由 qlovehome.js 通过同源 iframe 的 hass 读取。
"""
# ═══════════════════════════════════════════════════════════════════
#  接手这个模板（完整步骤见同目录 README.md）：
#   ① 装好 HA + 需要的集成（xiaomi_miot / midea_ac_lan / state_grid 等）
#   ② 开发者工具 → 状态，查到你设备的真实实体 ID
#   ③ 把本文件的占位实体换成你的，共三处：
#      a) 设备常量：P / M / L / T / AP / FR / WA / HT / WM / SK* / GK* / PL* / PSV
#         （每行 = 一台设备在实体名里的那段厂商标识，如 washer）
#      b) ROOM_SENSOR：各房间温湿度计的两颗 sensor
#      c) 文件下部的 dev(...) 设备清单与 DATA 字典（相机 / 网关 / 耗材 / 家电）
#      d) SG_ACC：国网户号；没有 state_grid 集成就把 SG 开头的行全删掉
#   ④ 跑 python gen_qlovehome_data.py → 生成 qlovehome/qlovehome-data.js
#   ⑤ 把 qlovehome/ 传到 HA 的 /config/www/qlovehome/，建 iframe 面板指向
#      /local/qlovehome/index.html?v=1
#  占位实体命名规则：sensor.<房间或用途>_<读数>，例如 sensor.master_temperature。
#  没有的实体删掉对应行即可，页面会自动降级，不会报错。
# ═══════════════════════════════════════════════════════════════════

import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'qlovehome', 'qlovehome-data.js')

# ── 房间：多边形取自用户在标注图上圈出的范围，画布 620x692 ─────
# 坐标由 extract_rooms.py 从你标注好的户型图提取（rooms_poly.json）。
# 要改房间范围：改标注图 -> 跑 extract_rooms.py -> 再跑本脚本。
ROOM_SENSOR = {
    'closet': ('sensor.closet_temperature',
               'sensor.closet_humidity'),
    'study': ('sensor.study_temperature',
              'sensor.study_humidity'),
    'kitchen': ('sensor.kitchen_temperature',
                'sensor.kitchen_humidity'),
    'master': ('sensor.master_temperature',
               'sensor.master_humidity'),
    'living': ('sensor.living_temperature',
               'sensor.living_humidity'),
    'secondary': ('sensor.secondary_temperature',
                  'sensor.secondary_humidity'),
    'balcony': ('sensor.balcony_temperature',
                'sensor.balcony_humidity'),
}

# 房间在左栏列表里的展示顺序（用户指定，不再新增房间）
ROOM_ORDER = ['living', 'kitchen', 'master', 'secondary', 'study',
              'balcony', 'closet', 'guestwc', 'masterwc']
ROOM_RENAME = {'living': '客餐厅'}
# 没有独立温湿度计的房间：直接跟随隔壁房间的读数（只做展示，不参与全屋均值）
ROOM_MIRROR = {'masterwc': 'master', 'guestwc': 'living'}

_poly = json.load(open(os.path.join(HERE, 'rooms_poly.json'), encoding='utf-8'))
ROOMS = []
for _r in _poly['rooms']:
    _t, _h = ROOM_SENSOR.get(_r['id'], ('', ''))
    ROOMS.append({'id': _r['id'], 'name': _r['name'], 'lx': _r['lx'], 'ly': _r['ly'],
                  'pts': [(float(p[0]), float(p[1])) for p in _r['pts']],
                  't': _t, 'h': _h})

_by_id = {r['id']: r for r in ROOMS}
for _id, _src in ROOM_MIRROR.items():
    _a, _b = _by_id.get(_id), _by_id.get(_src)
    if not _a or not _b or not _b['t']:
        continue
    _a['t'], _a['h'] = _b['t'], _b['h']
    _a['mirror'] = _src


def _dedup(pts, eps=0.6):
    """去掉重合点与共线冗余点。"""
    out = []
    for p in pts:
        if out and math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) < eps:
            continue
        out.append(p)
    if len(out) > 2 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) < eps:
        out.pop()
    i = 0
    while i < len(out) and len(out) > 3:
        a, b, c = out[i - 1], out[i], out[(i + 1) % len(out)]
        cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(cr) < 1.2:                      # 近似共线 -> 中间点多余
            out.pop(i)
        else:
            i += 1
    return out


def ortho(max_deg=30.0):
    """房间轮廓正交化：把倾角小于 max_deg 的边拉成严格水平/垂直。

    标注图是手绘的，边会有 1~3px 的歪斜；圆角描边后这些歪斜会很明显。
    先判定每条边是 H/V/斜，再统一该边的 y(或 x)，最后由相邻边求交点重建顶点。
    """
    fixed = 0
    for r in ROOMS:
        pts = r['pts']
        n = len(pts)
        dirs, X, Y = [], [], []
        for i in range(n):
            ax, ay = pts[i]
            bx, by = pts[(i + 1) % n]
            dx, dy = bx - ax, by - ay
            ang = math.degrees(math.atan2(dy, dx)) % 180.0
            horiz = min(ang, 180.0 - ang) <= max_deg
            vert = abs(ang - 90.0) <= max_deg
            dirs.append('H' if horiz else ('V' if vert else 'X'))
            X.append((ax + bx) / 2.0 if dirs[-1] == 'V' else None)
            Y.append((ay + by) / 2.0 if dirs[-1] == 'H' else None)
        for _ in range(n):                          # 连续同向的边属同一直线，坐标统一
            for i in range(n):
                if dirs[i] == 'V' and dirs[i - 1] == 'V':
                    m = (X[i] + X[i - 1]) / 2.0
                    X[i] = X[i - 1] = m
                if dirs[i] == 'H' and dirs[i - 1] == 'H':
                    m = (Y[i] + Y[i - 1]) / 2.0
                    Y[i] = Y[i - 1] = m
        new = []
        for i in range(n):
            dp, dc = dirs[i - 1], dirs[i]
            if dp == 'X' or dc == 'X':
                new.append(tuple(pts[i]))
                continue
            xs, ys = [], []
            if dp == 'H':
                ys.append(Y[i - 1])
            else:
                xs.append(X[i - 1])
            if dc == 'H':
                ys.append(Y[i])
            else:
                xs.append(X[i])
            x = sum(xs) / len(xs) if xs else pts[i][0]
            y = sum(ys) / len(ys) if ys else pts[i][1]
            if abs(x - pts[i][0]) > 0.05 or abs(y - pts[i][1]) > 0.05:
                fixed += 1
            new.append((round(x, 1), round(y, 1)))
        r['pts'] = _dedup(new) or new
    return fixed


_ortho_n = ortho()


def _edges(pts):
    """返回多边形所有边：('V'|'H', 坐标, 起, 止, 边序号)。"""
    n = len(pts)
    out = []
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        if abs(a[0] - b[0]) < 0.6:
            out.append(('V', (a[0] + b[0]) / 2.0, min(a[1], b[1]), max(a[1], b[1]), i))
        elif abs(a[1] - b[1]) < 0.6:
            out.append(('H', (a[1] + b[1]) / 2.0, min(a[0], b[0]), max(a[0], b[0]), i))
    return out


def _ov(a0, a1, b0, b1):
    return min(a1, b1) - max(a0, b0)


def snap_axes(tol=3.5):
    """把同一条墙线上被拆成两段的边吸附到同一坐标。

    标注图取色块时，一条直边常被切成相差 1~3px 的两段（主卧左边界就是
    35.6 与 33.8 两段），圆角描边后看着就是"线没拉直"。这里按坐标聚类，
    组内统一到最长那段的坐标。
    """
    fixed = 0
    for axis in ('V', 'H'):
        allE = []
        for ri, r in enumerate(ROOMS):
            for e in _edges(r['pts']):
                if e[0] == axis:
                    allE.append([ri, e[4], e[1], e[2], e[3]])
        allE.sort(key=lambda e: e[2])
        used = set()
        for i in range(len(allE)):
            if i in used:
                continue
            grp = [i]
            for j in range(i + 1, len(allE)):
                if allE[j][2] - allE[grp[0]][2] > tol:
                    break
                if j in used:
                    continue
                # 区间错开（不在同一条直线段上重叠）才算同一面墙
                if all(_ov(allE[j][3], allE[j][4], allE[g][3], allE[g][4]) < 12 for g in grp):
                    grp.append(j)
            if len(grp) < 2:
                continue
            used.update(grp)
            ref = max(grp, key=lambda k: allE[k][4] - allE[k][3])
            for k in grp:
                if k == ref:
                    continue
                ri, ei, c0 = allE[k][0], allE[k][1], allE[k][2]
                tgt = allE[ref][2]
                if abs(tgt - c0) < 0.05:
                    continue
                pts = ROOMS[ri]['pts']
                n = len(pts)
                for vi in ((ei, (ei + 1) % n)):
                    p = pts[vi]
                    pts[vi] = (tgt, p[1]) if axis == 'V' else (p[0], tgt)
                fixed += 1
    return fixed


_snap_n = snap_axes(6.0)


def norm_gap(WALL=13.0, lo=1.0, hi=34.0, max_shift=6.5):
    """把相邻房间之间的间隙统一到墙厚 WALL。

    墙是"每个房间轮廓向外扩 WALL"再挖掉房间得到的，只有相邻房间的间隙
    ≤ 2*WALL 时两侧墙带才会融合成一条。间隙原本 7.7~24.2 参差不齐，
    画出来墙体就忽厚忽薄。这里对每对面对面的边各退/进一半，收敛到 WALL。
    """
    pairs = []
    for ai in range(len(ROOMS)):
        for bi in range(len(ROOMS)):
            if ai == bi:
                continue
            for ea in _edges(ROOMS[ai]['pts']):
                for eb in _edges(ROOMS[bi]['pts']):
                    if ea[0] != eb[0]:
                        continue
                    g = eb[1] - ea[1]
                    if not (lo < g < hi):
                        continue
                    ov = _ov(ea[2], ea[3], eb[2], eb[3])
                    if ov < 25:
                        continue
                    pairs.append((ov, ai, ea[4], bi, eb[4], g, ea[0], ea[1]))
    pairs.sort(reverse=True)

    want = {}
    for ov, ai, ei, bi, ej, g, axis, c in pairs:
        d = (g - WALL) / 2.0
        if abs(d) > max_shift:
            d = math.copysign(max_shift, d)
        want.setdefault((ai, ei, axis), []).append(d / 2.0 * 2)   # 每层只退一半
        want.setdefault((bi, ej, axis), []).append(-d / 2.0 * 2)
    deltas = {}
    for k, vs in want.items():
        deltas[k] = sum(vs) / len(vs)
    for (ri, ei, axis), d in deltas.items():
        if abs(d) < 0.05:
            continue
        pts = ROOMS[ri]['pts']
        n = len(pts)
        for vi in (ei, (ei + 1) % n):
            p = pts[vi]
            pts[vi] = (round(p[0] + d, 1), p[1]) if axis == 'V' else (p[0], round(p[1] + d, 1))
    for r in ROOMS:
        r['pts'] = _dedup(r['pts']) or r['pts']
    return len(deltas)


_gap_n = norm_gap() + norm_gap() + norm_gap()


def offset_poly(pts, d):
    """正交多边形向外偏移 d（每条边平移后由相邻边求交）。"""
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1]
               for i in range(n))
    cw = area > 0
    out = []
    for i in range(n):
        p, pv, nx = pts[i], pts[i - 1], pts[(i + 1) % n]
        v1 = (p[0] - pv[0], p[1] - pv[1])
        v2 = (nx[0] - p[0], nx[1] - p[1])
        l1 = math.hypot(*v1) or 1.0
        l2 = math.hypot(*v2) or 1.0
        v1 = (v1[0] / l1, v1[1] / l1)
        v2 = (v2[0] / l2, v2[1] / l2)
        if cw:
            n1, n2 = (v1[1], -v1[0]), (v2[1], -v2[0])
        else:
            n1, n2 = (-v1[1], v1[0]), (-v2[1], v2[0])
        out.append((round(p[0] + (n1[0] + n2[0]) * d, 1),
                    round(p[1] + (n1[1] + n2[1]) * d, 1)))
    return out


def solid_holes(d):
    """找出被墙完全围住、且不属于任何房间的空腔（次卧右侧那类结构井）。

    做法：把所有房间外扩 d 后的并集铺成网格，从边界灌水，剩下没被灌到
    的格子就是"内部空腔"。返回合并后的矩形列表（画成实心墙）。
    """
    polys = [offset_poly(r['pts'], d) for r in ROOMS]
    xs = sorted({round(p[0], 1) for po in polys for p in po})
    ys = sorted({round(p[1], 1) for po in polys for p in po})
    if len(xs) < 2 or len(ys) < 2:
        return []
    nx, ny = len(xs) - 1, len(ys) - 1

    def occ(i, j):
        x, y = (xs[i] + xs[i + 1]) / 2.0, (ys[j] + ys[j + 1]) / 2.0
        return any(inside(x, y, po) for po in polys)

    grid = [[occ(i, j) for j in range(ny)] for i in range(nx)]
    seen = [[False] * ny for _ in range(nx)]
    stack = []
    for i in range(nx):
        for j in (0, ny - 1):
            if not grid[i][j]:
                stack.append((i, j))
    for j in range(ny):
        for i in (0, nx - 1):
            if not grid[i][j]:
                stack.append((i, j))
    while stack:
        i, j = stack.pop()
        if not (0 <= i < nx and 0 <= j < ny) or seen[i][j] or grid[i][j]:
            continue
        seen[i][j] = True
        stack.extend(((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)))

    rects = []
    for j in range(ny):
        i = 0
        while i < nx:
            if grid[i][j] or seen[i][j]:
                i += 1
                continue
            k = i
            while k + 1 < nx and not grid[k + 1][j] and not seen[k + 1][j]:
                k += 1
            rects.append((xs[i], ys[j], xs[k + 1], ys[j + 1]))
            i = k + 1
    return rects


def outline_ring(d):
    """所有房间外扩 d 后的并集外轮廓（正交多边形，用于外框虚线与底纹裁剪）。

    直接在"顶点坐标网格"上判占用，再收集占用格与空格之间的边，沿首尾相接
    拼成闭环。因为网格线全部取自多边形顶点，结果严格横平竖直。
    """
    polys = [offset_poly(r['pts'], d) for r in ROOMS]
    xs = sorted({round(p[0], 1) for po in polys for p in po})
    ys = sorted({round(p[1], 1) for po in polys for p in po})
    nx, ny = len(xs) - 1, len(ys) - 1
    if nx < 1 or ny < 1:
        return []

    def occ(i, j):
        x, y = (xs[i] + xs[i + 1]) / 2.0, (ys[j] + ys[j + 1]) / 2.0
        return any(inside(x, y, po) for po in polys)

    G = [[occ(i, j) for j in range(ny)] for i in range(nx)]
    seg = []
    for i in range(nx):
        for j in range(ny):
            if not G[i][j]:
                continue
            if j == 0 or not G[i][j - 1]:
                seg.append(((xs[i], ys[j]), (xs[i + 1], ys[j])))
            if i == nx - 1 or not G[i + 1][j]:
                seg.append(((xs[i + 1], ys[j]), (xs[i + 1], ys[j + 1])))
            if j == ny - 1 or not G[i][j + 1]:
                seg.append(((xs[i + 1], ys[j + 1]), (xs[i], ys[j + 1])))
            if i == 0 or not G[i - 1][j]:
                seg.append(((xs[i], ys[j + 1]), (xs[i], ys[j])))

    nxt = {}
    for a, b in seg:
        nxt.setdefault(a, []).append(b)
    best = []
    used = set()
    for a, _ in seg:
        if a in used:
            continue
        ring, cur = [], a
        while cur in nxt and nxt[cur]:
            ring.append(cur)
            used.add(cur)
            nx_ = nxt[cur].pop(0)
            if nx_ == a:
                break
            cur = nx_
        if len(ring) > len(best):
            best = ring
    # 去掉共线中间点
    out = []
    n = len(best)
    for i in range(n):
        p, pv, nn = best[i], best[i - 1], best[(i + 1) % n]
        if abs(pv[0] - p[0]) < 0.01 and abs(p[0] - nn[0]) < 0.01:
            continue
        if abs(pv[1] - p[1]) < 0.01 and abs(p[1] - nn[1]) < 0.01:
            continue
        out.append(p)
    return out


# 每个房间最多在图上放几个标记（其余只在房间面板里出现）
LIMIT = {'living': 12, 'study': 9, 'master': 8, 'masterwc': 4,
         'secondary': 5, 'closet': 4, 'kitchen': 4, 'balcony': 4, 'guestwc': 2}


def inside(x, y, pts):
    """射线法判断点是否在多边形内。"""
    c = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def roomy(x, y, pts, m):
    """点四周 m 距离都在多边形内，保证标记不压边界。"""
    d = m * 0.71
    for dx, dy in ((m, 0), (-m, 0), (0, m), (0, -m),
                   (d, d), (-d, d), (d, -d), (-d, -d)):
        if not inside(x + dx, y + dy, pts):
            return False
    return True


def _pick(seq, k):
    """从有序序列里均匀取 k 个。"""
    if k >= len(seq):
        return list(seq)
    if k == 1:
        return [seq[len(seq) // 2]]
    return [seq[round(i * (len(seq) - 1) / (k - 1))] for i in range(k)]


def scan_row(pts, y, x0, x1, m, lx, ly, step=2.0):
    """某一行上离边界 >= m 且避开房间名标签的最长连续区间 (a, b)。"""
    best = None
    cur = None
    x = x0
    while x <= x1:
        ok = roomy(x, y, pts, m) and math.hypot(x - lx, y - ly) > 26
        if ok:
            if cur is None:
                cur = [x, x]
            else:
                cur[1] = x
        else:
            if cur is not None and (best is None or cur[1] - cur[0] > best[1] - best[0]):
                best = cur
            cur = None
        x += step
    if cur is not None and (best is None or cur[1] - cur[0] > best[1] - best[0]):
        best = cur
    return best


def place(room, n):
    """在房间多边形内部均匀放置 n 个标记。

    行/列数由房间实际尺寸推导：先按宽度定列数，行距不够时再加列；
    行内按可用宽度均分，保证标记之间至少 24px、行距至少 30px。
    """
    r = next((x for x in ROOMS if x['id'] == room), None)
    if r is None:
        return []
    pts = r['pts']
    xs = [q[0] for q in pts]
    ys = [q[1] for q in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    n = min(n, LIMIT.get(room, 4))
    lx, ly = r['lx'], r['ly']

    for m in (16, 12, 9, 6):
        cand = []
        y = y0
        while y <= y1:
            seg = scan_row(pts, y, x0, x1, m, lx, ly)
            if seg and seg[1] - seg[0] >= 34:
                cand.append((y, seg[0], seg[1]))
            y += 2.0
        if not cand:
            continue
        hspan = cand[-1][0] - cand[0][0]
        max_rows = max(1, int(hspan // 32) + 1)
        wmax = max(b - a for (_, a, b) in cand)
        # 列数从多到少试：优先更方正的排布，同时保证行距与列距都不挤
        cols = 1
        for c in (4, 3, 2, 1):
            if -(-n // c) > max_rows:
                continue
            gap = (wmax - 2 * min(9.0, wmax / 5)) / (c - 1) if c > 1 else 999
            if gap >= 30:
                cols = c
                break
        rows = -(-n // cols)
        if len(cand) < rows:
            continue

        lines = _pick(cand, rows)
        base, extra = divmod(n, len(lines))
        out = []
        ok = True
        for i, (yy, a, b) in enumerate(lines):
            cnt = base + (1 if i < extra else 0)
            if cnt <= 0:
                continue
            pad = min(9.0, (b - a) / 5)
            if cnt == 1:
                xx = [(a + b) / 2]
            else:
                span = b - a - 2 * pad
                if span / (cnt - 1) < 26:
                    ok = False
                    break
                xx = [a + pad + span * k / (cnt - 1) for k in range(cnt)]
            out.extend([(v, yy) for v in xx])
        if ok and len(out) >= n:
            return [(round(q[0], 1), round(q[1], 1)) for q in out[:n]]
    return []


# ── 可控设备 ──────────────────────────────────────────────────
# (房间, 名称, kind, 实体, x, y)  x/y 为 None 表示不进户型图、只在房间面板出现
D = []


def dev(room, name, kind, entity, x=None, y=None, note='', ctl=None, fb=None):
    """ctl 不为空 → 这是一台「复合设备」：界面上只有一枚图标，点开是一个装了它全部功能的弹窗。
       fb＝备用状态源（实体 id 列表，按顺序取第一个还活着的）：主实体 unavailable/unknown 时
       用它来显示状态、判图标发不发亮，不改变控制目标。厨房相机就是这么用的 ——
       它的 camera 实体在 HA 里长期 unavailable（xiaomi_miot 取流链路坏在云端），
       但相机本身在线、也在录像，同设备的两颗电源开关一直是 on。"""
    o = {'room': room, 'name': name, 'kind': kind, 'entity': entity,
         'x': x, 'y': y, 'note': note, 'ctl': ctl}
    if fb:
        o['fb'] = fb
    D.append(o)


# ── 复合设备的弹窗配置 ────────────────────────────────────────
# 结构：{'always':1（图标恒亮，不当成"关着"）, 'sub':副标题, 'open':列表按钮文案,
#        'echo':[{e,map,pre,unit}]（标题栏那行摘要）, 'groups':[{t,hint,items:[...]}]}
# item：k=seg|sel|num|sw|btn|lamp|ro|say|cam，其余字段见 qlovehome.js 的 crow()
# on：可选，指定「什么状态算这台设备正在用」，只影响户型图图标发不发亮（isGlow）。
#     不配就按主实体的开关态（isOn）—— 晾衣架那种停在半空的会被判成"开着"，
#     但拨过 on 就能说清"只有屏幕亮着才算在用"（中控面板）。
def _ctl(groups, echo=None, sub='', always=True, open_='设置', on=None):
    out = {'always': always, 'sub': sub, 'open': open_, 'echo': echo or [], 'groups': groups}
    if on:
        out['on'] = on
    return out


P = 'smart_panel'       # 中控面板
M = 'video_doorbell'    # 可视门铃
L = 'smart_lock'        # 智能门锁

IDLE_STATES = ['关机', '待机', '空闲', 'Idle', 'off', 'unavailable', 'unknown', '未知',
               '已完成', '完成', '预约']

LOCK_MAP = {'Locked': '已上锁', 'Unlocked': '已开锁', '已开锁': '已开锁',
            '门虚掩': '门虚掩', '门虚掩解除': '虚掩已解除', 'Jammed': '卡住'}
LOCK_ACT = {'outside_unlock': '室外开锁', 'inside_unlock': '室内开锁',
            'outside_lock': '室外上锁', 'inside_lock': '室内上锁',
            'lock': '上锁', 'unlock': '开锁', '': '—'}
LOCK_METHOD = {'bluetooth': '蓝牙', 'password': '密码', 'fingerprint': '指纹',
               'nfc': 'NFC 卡', 'key': '钥匙', 'temporary_password': '临时密码'}

PANEL_CTL = _ctl(
    sub='屏幕 · 音箱 · 三路按键',
    # 息屏的时候别发光：这块面板平时都黑着屏，恒亮看着像"正在运行"
    on={'e': 'select.%s_display_state_p_16_2' % P, 'vals': ['亮屏']},
    echo=[{'e': 'select.%s_display_state_p_16_2' % P},
          {'e': 'number.%s_volume_p_2_1' % P, 'pre': '音量 ', 'unit': '%'}],
    groups=[
        {'t': '屏幕', 'items': [
            {'k': 'seg', 'label': '屏幕状态', 'e': 'select.%s_display_state_p_16_2' % P},
            {'k': 'num', 'label': '亮度', 'e': 'number.%s_brightness_p_16_1' % P, 'unit': '%'},
            {'k': 'sw', 'label': '自动息屏', 'e': 'switch.%s_auto_screen_off_p_16_3' % P},
            {'k': 'sw', 'label': '自动亮度', 'e': 'switch.%s_auto_screen_brightness_p_16_4' % P},
        ]},
        {'t': '音箱', 'items': [
            {'k': 'num', 'label': '音量', 'e': 'number.%s_volume_p_2_1' % P, 'unit': '%'},
            {'k': 'sw', 'label': '麦克风禁麦', 'e': 'switch.%s_mute_p_4_1' % P},
            {'k': 'sw', 'label': '睡眠模式', 'e': 'switch.%s_sleep_mode_p_5_3' % P},
            {'k': 'say', 'label': '朗读文本', 'e': 'notify.%s_play_text_a_5_3' % P},
            {'k': 'btn', 'label': '唤醒小爱', 'e': 'button.%s_wake_up_a_5_1' % P, 'text': '唤醒'},
            {'k': 'btn', 'label': '停止闹钟', 'e': 'button.%s_stop_alarm_a_6_1' % P, 'text': '停止'},
        ]},
        {'t': '面板三键',
         'hint': '三路继电器当前都是「无线开关」模式：只改面板状态、不驱动回路。',
         'items': [
             {'k': 'lamp', 'label': '客厅大灯', 'e': 'switch.%s_on_p_10_1' % P,
              'mode': 'select.%s_mode_p_10_2' % P},
             {'k': 'lamp', 'label': '沙发射灯', 'e': 'switch.%s_on_p_11_1' % P,
              'mode': 'select.%s_mode_p_11_2' % P},
             {'k': 'lamp', 'label': '氛围灯带', 'e': 'switch.%s_on_p_12_1' % P,
              'mode': 'select.%s_mode_p_12_2' % P},
         ]},
        {'t': '最近按键', 'hint': '面板实体键被按下时上报（只读，可做自动化触发）', 'items': [
            {'k': 'ro', 'label': '左键', 'e': 'event.%s_click_e_13_1' % P, 'fmt': 'ago'},
            {'k': 'ro', 'label': '中键', 'e': 'event.%s_click_e_14_1' % P, 'fmt': 'ago'},
            {'k': 'ro', 'label': '右键', 'e': 'event.%s_click_e_15_1' % P, 'fmt': 'ago'},
        ]},
    ])

BELL_CTL = _ctl(
    sub='画面 · 提示音 · 侦测 · 夜视',
    # 待机不亮；响铃 / 呼叫中才亮（历史里只见过 Idle，具体响铃值未知，用黑名单兜）
    on={'e': 'sensor.%s_status_p_2_2' % M, 'not_vals': IDLE_STATES},
    echo=[{'e': 'sensor.%s_status_p_2_2' % M, 'map': {'Idle': '待机', 'Busy': '占用'}},
          {'e': 'sensor.%s_battery_level_p_8_1' % M, 'pre': '电量 ', 'unit': '%'}],
    groups=[
        {'t': '画面', 'items': [
            {'k': 'cam', 'label': '实时画面', 'e': 'camera.doorbell_control', 'text': '查看'},
            {'k': 'ro', 'label': '最近移动', 'e': 'camera.doorbell_control', 'attr': 'motion_video_time'},
            {'k': 'ro', 'label': '移动类型', 'e': 'camera.doorbell_control', 'attr': 'motion_video_type',
             'map': {'Stay': '有人停留', 'Pass': '有人经过'}},
        ]},
        {'t': '提示与省电', 'items': [
            {'k': 'sw', 'label': '提示音', 'e': 'switch.%s_alarm_p_7_1' % M},
            {'k': 'sw', 'label': 'ECO 节能', 'e': 'switch.%s_eco_p_2_6' % M},
            {'k': 'num', 'label': '铃声', 'e': 'number.%s_ringtone_p_2_7' % M, 'unit': ' 号'},
        ]},
        {'t': '移动侦测', 'items': [
            {'k': 'sel', 'label': '触发条件', 'e': 'select.%s_motion_detection_p_4_1' % M},
            {'k': 'seg', 'label': '灵敏度', 'e': 'select.%s_detection_sensitivity_p_4_3' % M,
             'map': {'Low': '低', 'Middle': '中', 'High': '高'}},
            {'k': 'sel', 'label': '报警间隔', 'e': 'select.%s_alarm_interval_p_4_2' % M,
             'map': {'0': '不限'}, 'suffix': ' 秒'},
        ]},
        {'t': '夜视', 'items': [
            {'k': 'seg', 'label': '夜视', 'e': 'select.%s_night_shot_p_2_3' % M,
             'map': {'Off': '关', 'On': '开', 'Auto': '自动'}},
        ]},
    ])

LOCK_CTL = _ctl(
    sub='门状态 · 开锁记录 · 告警',
    # 锁好是常态、不该发光；门没锁（开锁 / 虚掩 / 卡住）才亮一下提醒
    on={'e': 'sensor.%s_door_state_p_4_1021' % L, 'not_vals': ['Locked', 'unavailable', 'unknown']},
    echo=[{'e': 'sensor.%s_door_state_p_4_1021' % L, 'map': LOCK_MAP},
          {'e': 'sensor.%s_battery_level_p_5_1003' % L, 'pre': '电量 ', 'unit': '%'}],
    groups=[
        {'t': '门状态', 'items': [
            {'k': 'ro', 'label': '锁体', 'e': 'sensor.%s_door_state_p_4_1021' % L, 'map': LOCK_MAP},
            {'k': 'ro', 'label': '电量', 'e': 'sensor.%s_battery_level_p_5_1003' % L, 'unit': '%'},
            {'k': 'ro', 'label': '布防', 'e': 'binary_sensor.smart_lock_armed',
             'map': {'on': '已布防', 'off': '未布防'}},
        ]},
        {'t': '最后一次操作', 'hint': '来自 Xiaomi Miot 云端上报，可能滞后于锁体当前状态',
         'items': [
             {'k': 'ro', 'label': '开锁方式', 'e': 'sensor.smart_lock_connection_action', 'map': LOCK_ACT},
             {'k': 'ro', 'label': '连接方式', 'e': 'sensor.smart_lock_connection', 'map': LOCK_METHOD},
             {'k': 'ro', 'label': '钥匙 ID', 'e': 'sensor.smart_lock_connection_key_id'},
         ]},
        {'t': '事件记录', 'items': [
            {'k': 'ro', 'label': '锁事件', 'e': 'event.%s_lock_event_e_3_1020' % L, 'fmt': 'ago'},
            {'k': 'ro', 'label': '发生异常', 'e': 'event.%s_exception_occurred_e_3_1007' % L, 'fmt': 'ago'},
            {'k': 'ro', 'label': '门铃响了', 'e': 'event.%s_doorbell_ring_e_6_1006' % L, 'fmt': 'ago'},
            {'k': 'ro', 'label': '低电量告警', 'e': 'event.%s_low_battery_e_5_1001' % L, 'fmt': 'ago'},
        ]},
    ])

T = 'smart_toilet'      # 智能马桶盖
TOILET_MAP = {'Idle': '待机', 'Posterior Wash': '臀洗', 'Feminine Wash': '妇洗',
              'Air Dry': '暖风烘干'}
SEAT_MAP = {'on': '有人', 'off': '无人'}
TOILET_CTL = _ctl(
    sub='冲洗 · 座圈 · 夜灯 · 滤芯',
    # 待机 / 关机不亮；正在臀洗 / 妇洗 / 暖风烘干才亮（options 就这 4 个值）
    on={'e': 'select.%s_mode_p_2_7' % T,
        'vals': ['Posterior Wash', 'Feminine Wash', 'Air Dry']},
    echo=[{'e': 'switch.%s_on_p_2_1' % T, 'map': {'on': '已开机', 'off': '已关机'}},
          {'e': 'select.%s_mode_p_2_7' % T, 'map': TOILET_MAP}],
    groups=[
        {'t': '运行', 'hint': '「停止」只在冲洗 / 烘干进行中受理；关机或待机时按下会被设备拒绝（云端 code=-9999），这里已就地拦住', 'items': [
            {'k': 'sw', 'label': '总开关', 'e': 'switch.%s_on_p_2_1' % T},
            {'k': 'seg', 'label': '工作模式', 'e': 'select.%s_mode_p_2_7' % T, 'map': TOILET_MAP},
            {'k': 'btn', 'label': '停止工作', 'e': 'button.%s_stop_working_a_2_1' % T, 'text': '停止',
             # 前置闸门：关机 / 待机时不发这一枪。动作本身在规格里没有入参（in=[]），
             # 是设备固件按当前状态拒收，页面拦得住就拦
             'guard': [
                 {'e': 'switch.%s_on_p_2_1' % T, 'skip_when': ['off', 'unavailable', 'unknown'],
                  'msg': '马桶盖现在是关机状态，没有在冲洗或烘干，不用停'},
                 {'e': 'select.%s_mode_p_2_7' % T, 'skip_when': ['Idle'],
                  'msg': '现在是待机，没有在冲洗或烘干，不用停'},
             ]},
            {'k': 'ro', 'label': '着座感应', 'e': 'binary_sensor.%s_seating_state_p_2_2' % T,
             'map': SEAT_MAP},
        ]},
        {'t': '冲洗', 'items': [
            {'k': 'num', 'label': '冲洗强度', 'e': 'number.%s_washing_strength_p_2_4' % T, 'unit': ' 档'},
            {'k': 'num', 'label': '喷嘴位置', 'e': 'number.%s_nozzle_position_p_2_5' % T, 'unit': ' 档'},
        ]},
        {'t': '座圈 · 除臭', 'items': [
            {'k': 'sw', 'label': '座圈加热', 'e': 'switch.%s_heating_p_3_1' % T},
            {'k': 'num', 'label': '加热档位', 'e': 'number.%s_heat_level_p_3_2' % T, 'unit': ' 档'},
            {'k': 'sw', 'label': '除臭', 'e': 'switch.%s_deodorization_p_2_6' % T},
        ]},
        {'t': '夜灯 · 提示音', 'items': [
            {'k': 'sw', 'label': '夜灯', 'e': 'light.%s_s_4_night_light' % T},
            {'k': 'sw', 'label': '提示音', 'e': 'switch.%s_alarm_p_6_1' % T},
        ]},
        {'t': '滤芯', 'items': [
            {'k': 'ro', 'label': '剩余寿命', 'e': 'sensor.%s_filter_life_level_p_5_1' % T, 'unit': '%'},
            {'k': 'btn', 'label': '重置滤芯', 'e': 'button.%s_reset_filter_life_a_5_1' % T, 'text': '重置'},
        ]},
    ])

# ── 第二批复合设备：那些「米家里有一堆功能、页面上却只有一枚开关」的家电 ──
AP = 'air_purifier'     # 空气净化器
FR = 'air_fryer'        # 空气炸锅
WA = 'water_dispenser'  # 净饮机
HT = 'gas_water_heater' # 燃气热水器
WM = 'washer'           # 滚筒洗衣机

# 米家状态传感器的「闲着」取值：图标发亮判据（isGlow）里的黑名单。
# 这些传感器没有 options，没法列白名单，只能用「不在闲着列表里就算正在用」。
# 词表两层：米家集成统一翻的中文状态词 + HA 通用异常态。多列几个无害——
# 设备只会报自己的那套值，列不到的真·工作值（烹饪中 / 出水 / 响铃…）照样亮。
# 洗衣机进度：设备侧枚举就是这 9 个（midea/devices/db/device.py 的 progress 表），
# 之前概览里写的 Washing/Rinsing/Spinning/Finished 这套是照 0xDA 波轮洗衣机猜的，对不上
WASHER_PROG = {'Idle': '待机', 'Wash': '洗涤中', 'Pre-wash': '预洗中',
               'Rinse': '漂洗中', 'Spin': '脱水中', 'Hi-speed Spin': '高速脱水',
               'Dry': '烘干中', 'Weight': '称重中', 'Unknown': '未知'}

# 热水器的 state 是 patch_midea4.py **造出来的**合法枚举：通电就按 operation_list 挑一个
# （performance → high_demand → gas → …），所以 state='gas' 只代表「通着电、走燃气模式」，
# 不代表正在烧。真·燃烧看 binary_sensor.gas_water_heater_burning_state（device_class=running）。
HEATER_MODE = {'off': '待机', 'gas': '燃气', 'electric': '电加热',
               'performance': '增容', 'high_demand': '大流量',
               'heat_pump': '热泵', 'eco': '节能', 'unavailable': '离线'}
HEATER_BURNING = {'on': '燃烧中', 'off': '未燃烧', 'unavailable': '离线', 'unknown': '未上报'}

# 米家集成（midea_ac_lan）对 0xDB 滚筒洗衣机只建了 4 个实体：power / start 两个开关
# ＋ time_remaining / progress 两个传感器。**没有「洗衣程序」实体** —— 选程序只能在
# 机器面板或米家 App 上做，页面上画不出来，别假装有。
WASHER_CTL = _ctl(
    sub='电源 · 开始 / 暂停 · 剩余时间',
    echo=[{'e': 'switch.%s_power' % WM, 'map': {'on': '已通电', 'off': '已断电'}},
          {'e': 'sensor.%s_progress' % WM, 'map': WASHER_PROG}],
    always=False,
    groups=[
        {'t': '洗衣机', 'hint': '「开始 / 暂停」就是机器上那颗开始键：开着的时候点一下暂停，'
                               '暂停中再点一下继续。洗衣程序（快洗 / 羊毛 / 桶自洁…）'
                               '米家没有接入 HA，请在机器面板或米家 App 里选',
         'items': [
             {'k': 'sw', 'label': '电源', 'e': 'switch.%s_power' % WM},
             {'k': 'sw', 'label': '开始 / 暂停', 'e': 'switch.%s_start' % WM,
              'guard': [{'e': 'switch.%s_power' % WM, 'skip_when': ['off', 'unavailable'],
                         'msg': '洗衣机还没开机，先开电源再按开始'}]},
             {'k': 'ro', 'label': '当前阶段', 'e': 'sensor.%s_progress' % WM, 'map': WASHER_PROG},
             {'k': 'ro', 'label': '剩余时间', 'e': 'sensor.%s_time_remaining' % WM, 'unit': ' 分钟'},
         ]},
        {'t': '镜像实体', 'hint': '控制台镜像出来的运行状态，不依赖米家云', 'items': [
            {'k': 'ro', 'label': '运行状态', 'e': 'switch.washer_running',
             'map': {'on': '运行中', 'off': '待机'}},
        ]},
    ])

PURIFIER_CTL = _ctl(
    always=False,                          # 有真正的通断实体：关机时图标就该是灰的
    sub='开关 · 模式 · 滤芯 · 环境',
    echo=[{'e': 'switch.%s_on_p_2_1' % AP, 'map': {'on': '运行中', 'off': '已关机'}},
          {'e': 'select.%s_mode_p_2_4' % AP},
          {'e': 'sensor.%s_pm2_5_density_p_3_4' % AP, 'pre': 'PM2.5 '}],
    groups=[
        {'t': '运行', 'items': [
            {'k': 'sw', 'label': '开关', 'e': 'switch.%s_on_p_2_1' % AP},
            {'k': 'seg', 'label': '工作模式', 'e': 'select.%s_mode_p_2_4' % AP},
            {'k': 'btn', 'label': '切换开关', 'e': 'button.%s_toggle_a_2_1' % AP, 'text': '切换'},
        ]},
        {'t': '屏幕 · 声音 · 童锁', 'items': [
            {'k': 'seg', 'label': '显示屏', 'e': 'select.%s_brightness_p_13_2' % AP},
            {'k': 'sw', 'label': '提示音', 'e': 'switch.%s_alarm_p_6_1' % AP},
            {'k': 'sw', 'label': '物理控制锁', 'e': 'switch.%s_physical_controls_locked_p_8_1' % AP},
        ]},
        {'t': '环境', 'items': [
            {'k': 'ro', 'label': 'PM2.5', 'e': 'sensor.%s_pm2_5_density_p_3_4' % AP, 'unit': ' μg/m³'},
            {'k': 'ro', 'label': '温度', 'e': 'sensor.%s_temperature_p_3_7' % AP, 'unit': '°C'},
            {'k': 'ro', 'label': '湿度', 'e': 'sensor.%s_relative_humidity_p_3_1' % AP, 'unit': '%'},
            {'k': 'ro', 'label': '故障', 'e': 'sensor.%s_fault_p_2_2' % AP},
        ]},
        {'t': '滤芯', 'hint': '寿命见底后在米家 App 换滤芯，换完再点重置', 'items': [
            {'k': 'ro', 'label': '剩余寿命', 'e': 'sensor.%s_filter_life_level_p_4_1' % AP, 'unit': '%'},
            {'k': 'ro', 'label': '剩余时间', 'e': 'sensor.%s_filter_left_time_p_4_4' % AP, 'unit': ' 天'},
            {'k': 'ro', 'label': '已用时间', 'e': 'sensor.%s_filter_used_time_p_4_3' % AP, 'unit': ' 天'},
        ]},
    ])

FRYER_CTL = _ctl(
    sub='烹饪 · 温度 · 时间 · 状态',
    # 关机 / 待机 / 已完成都不亮；预热中、烹饪中、暂停（锅里还有货）亮
    on={'e': 'sensor.%s_status_p_2_1' % FR, 'not_vals': IDLE_STATES},
    echo=[{'e': 'sensor.%s_status_p_2_1' % FR},
          {'e': 'sensor.%s_left_time_p_2_5' % FR, 'pre': '剩余 ', 'unit': ' 分钟'}],
    groups=[
        {'t': '烹饪', 'hint': '先把温度和时间设好再点开始；暂停只是保温等待，不会结束程序',
         'items': [
             {'k': 'btn', 'label': '开始烹饪', 'e': 'button.%s_start_cook_a_2_1' % FR, 'text': '开始'},
             {'k': 'btn', 'label': '暂停', 'e': 'button.%s_pause_a_2_3' % FR, 'text': '暂停'},
             {'k': 'btn', 'label': '停止烹饪', 'e': 'button.%s_cancel_cooking_a_2_2' % FR, 'text': '停止'},
         ]},
        {'t': '参数', 'items': [
            {'k': 'num', 'label': '烹饪温度', 'e': 'number.%s_target_temperature_p_2_4' % FR, 'unit': '°C'},
            {'k': 'num', 'label': '烹饪时间', 'e': 'number.%s_target_time_p_2_3' % FR, 'unit': ' 分钟'},
        ]},
        {'t': '状态', 'items': [
            {'k': 'ro', 'label': '工作状态', 'e': 'sensor.%s_status_p_2_1' % FR},
            {'k': 'ro', 'label': '剩余时间', 'e': 'sensor.%s_left_time_p_2_5' % FR, 'unit': ' 分钟'},
            {'k': 'ro', 'label': '故障', 'e': 'sensor.%s_fault_p_2_2' % FR},
            {'k': 'ro', 'label': '上次完成', 'e': 'event.%s_cooking_finished_e_2_1' % FR, 'fmt': 'ago'},
        ]},
    ])

WATER_CTL = _ctl(
    sub='出水 · 水质 · 滤芯 · 维护',
    # 空闲不亮；出水 / 加热中亮（历史里见过 空闲、出水 两个值）
    on={'e': 'sensor.%s_status_p_2_3' % WA, 'not_vals': IDLE_STATES},
    echo=[{'e': 'sensor.%s_status_p_2_3' % WA},
          {'e': 'number.%s_target_temperature_p_2_6' % WA, 'pre': '设定 ', 'unit': '°C'}],
    groups=[
        {'t': '出水', 'items': [
            {'k': 'ro', 'label': '工作状态', 'e': 'sensor.%s_status_p_2_3' % WA},
            {'k': 'num', 'label': '出水温度', 'e': 'number.%s_target_temperature_p_2_6' % WA, 'unit': '°C'},
            {'k': 'ro', 'label': '当前水温', 'e': 'sensor.%s_temperature_p_2_5' % WA, 'unit': '°C'},
        ]},
        {'t': '水质', 'items': [
            {'k': 'ro', 'label': '进水 TDS', 'e': 'sensor.%s_tds_in_p_3_1' % WA, 'unit': ' ppm'},
            {'k': 'ro', 'label': '出水 TDS', 'e': 'sensor.%s_tds_out_p_3_2' % WA, 'unit': ' ppm'},
        ]},
        {'t': '滤芯', 'hint': '按出水流量折算寿命，换芯后点重置', 'items': [
            {'k': 'ro', 'label': '剩余寿命', 'e': 'sensor.%s_filter_life_level_p_5_1' % WA, 'unit': '%'},
            {'k': 'ro', 'label': '剩余流量', 'e': 'sensor.%s_filter_left_flow_p_5_5' % WA, 'unit': ' L'},
            {'k': 'ro', 'label': '已用流量', 'e': 'sensor.%s_filter_used_flow_p_5_4' % WA, 'unit': ' L'},
            {'k': 'ro', 'label': '已用时长', 'e': 'sensor.%s_filter_used_time_p_5_3' % WA, 'unit': ' 小时'},
            {'k': 'btn', 'label': '重置滤芯', 'e': 'button.%s_reset_filter_life_a_5_1' % WA, 'text': '重置'},
        ]},
        {'t': '维护 · 安全', 'items': [
            {'k': 'sw', 'label': 'UV 杀菌', 'e': 'switch.%s_uv_p_2_7' % WA},
            {'k': 'sw', 'label': '童锁', 'e': 'switch.%s_physical_controls_locked_p_4_1' % WA},
            {'k': 'ro', 'label': '故障', 'e': 'sensor.%s_fault_p_2_1' % WA},
        ]},
    ])

# 浴霸：climate 实体只暴露了 auto/off + 预设，真正会用到的吹风 / 暖风 / 换气 / 档位 / 延时
# 全在另外 8 个实体上 —— 一样收进同一枚图标的弹窗里
def bath_ctl(dev):
    return _ctl(
        always=False,                      # climate 的 hvac_mode 自己说了算：off 时图标就该是灰的
        sub='取暖 · 吹风 · 换气 · 延时',
        echo=[{'e': 'climate.%s' % dev, 'map': {'auto': '运行中', 'off': '已关机'}},
              {'e': 'climate.%s' % dev, 'attr': 'preset_mode', 'pre': '预设 '}],
        groups=[
            {'t': '浴霸', 'hint': '自动 = 交给浴霸跑预设程序，关机 = 整机停', 'items': [
                {'k': 'seg', 'label': '运行模式', 'e': 'climate.%s' % dev,
                 'opts': ['auto', 'off'], 'map': {'auto': '自动', 'off': '关机'},
                 'dom': 'climate', 'svc': 'set_hvac_mode', 'field': 'hvac_mode'},
                {'k': 'seg', 'label': '预设程序', 'e': 'climate.%s' % dev, 'aval': 'preset_mode',
                 'opts_attr': 'preset_modes',
                 'dom': 'climate', 'svc': 'set_preset_mode', 'field': 'preset_mode'},
                {'k': 'btn', 'label': '停止工作', 'e': 'button.%s_stop_working_a_3_1' % dev, 'text': '停止'},
            ]},
            {'t': '风暖', 'items': [
                {'k': 'sw', 'label': '暖风', 'e': 'switch.%s_heating_p_3_3' % dev},
                {'k': 'sw', 'label': '吹风', 'e': 'switch.%s_blow_p_3_2' % dev},
                {'k': 'sw', 'label': '换气', 'e': 'switch.%s_ventilation_p_3_4' % dev},
                {'k': 'seg', 'label': '加热档位', 'e': 'select.%s_heat_level_p_3_5' % dev,
                 'map': {'加热低挡': '低挡', '加热高挡': '高挡'}},
            ]},
            {'t': '关机延时', 'hint': '洗完澡让它再吹一会儿把湿气排掉', 'items': [
                {'k': 'sw', 'label': '延时关机', 'e': 'switch.%s_off_delay_p_3_6' % dev},
                {'k': 'num', 'label': '延时时长', 'e': 'number.%s_off_delay_time_p_3_7' % dev, 'unit': ' 分钟'},
            ]},
        ])


BATH_M_CTL = bath_ctl('masterwc_bath_heater')   # 主卫浴霸
BATH_G_CTL = bath_ctl('guestwc_bath_heater')   # 客卫浴霸

HEATER_MAP = {'unavailable': '离线', 'off': '已关机', 'gas': '燃气模式', 'electric': '电加热',
              'heat_pump': '热泵', 'high_demand': '大水量', 'eco': '节能', 'performance': '高性能',
              'heat': '加热中', 'unknown': '未知'}
# ⚠️ water_heater 的 state 在 HA 里只能取「运行模式」（off/gas/electric/eco/...），
#    不是「正在燃烧」。真正的燃烧状态看下面 镜像实体那一组的「燃烧」行，
#    别再把它写成「燃烧中」，否则没热水时页面也在喊燃烧。
HEATER_CTL = _ctl(
    sub='通断 · 目标水温 · 燃烧状态',
    # 别再看 water_heater 的 state 了：补丁兜底返回的 'gas' 只是"燃气模式"，
    # 实测没烧的时候也是 gas。真燃烧标志是属性 burning_state（镜像实体也读它）。
    on={'e': 'water_heater.%s_water_heater' % HT, 'attr': 'burning_state', 'vals': [True]},
    echo=[{'e': 'water_heater.%s_water_heater' % HT, 'map': HEATER_MAP},
          {'e': 'water_heater.%s_water_heater' % HT, 'attr': 'temperature', 'pre': '设定 ', 'unit': '°C'}],
    groups=[
        {'t': '热水器', 'hint': '这一组走 HA 的 water_heater 域（米家云上报），离线时下面几行会置灰',
         'items': [
             {'k': 'sw', 'label': '通断', 'e': 'water_heater.%s_water_heater' % HT},
             {'k': 'num', 'label': '目标水温', 'e': 'water_heater.%s_water_heater' % HT,
              'aval': 'temperature', 'unit': '°C', 'min': 35, 'max': 65},
             {'k': 'ro', 'label': '当前状态', 'e': 'water_heater.%s_water_heater' % HT, 'map': HEATER_MAP},
         ]},
        # 镜像实体组的「通电」开关已撤：模板写的是 is_state(water_heater,'on')，
        # 而 water_heater 的 state 只会是 gas/electric/off，永远不等于 on → 恒显「关」，
        # 点它也只是跑 script.mirror_sync，并不给热水器上电。通断走上面那组。
        {'t': '镜像实体', 'hint': '控制台镜像出来的燃烧 / 水温，不依赖米家云',
         'items': [
             {'k': 'ro', 'label': '燃烧', 'e': 'switch.heater_burning',
              'map': {'on': '燃烧中', 'off': '未燃烧', 'unavailable': '离线'}},
             {'k': 'ro', 'label': '水温', 'e': 'sensor.heater_water_temp', 'unit': '°C'},
             {'k': 'ro', 'label': '设定水温', 'e': 'sensor.heater_target_temp', 'unit': '°C'},
         ]},
    ])


# ── 第三批：射灯 / 插座这类「一枚开关 + 一堆米家设置项」的设备 ────────
# 米家给这些面板单独做了「工作方式 / 默认上电状态 / 指示灯 / 点动」等实体，
# 页面上原来只挂了通断那一个，剩下的全埋着。弹窗里按用途分组收进来。
SK1 = 'entrance_spot_lamp' # 进门射灯（单路灯具）
SK2 = 'painting_spot_lamp' # 迎门画射灯（单路灯具）
SK5 = 'triple_lamp'     # 三路灯具（三个回路）
GK1 = 'candle_lamp'     # 烛台
GK2 = 'small_spot_lamp' # 小射灯
GK3 = 'moving_spot_lamp' # 移动射灯
PL1 = 'bedroom_outlet'  # 卧室插座
PL2 = 'study_power_strip' # 书房插排
PL3 = 'study_outlet'    # 书房插座
PSV = 'metering_strip'  # 带计量的插排

POWER_ON_HINT = ('「默认上电状态」＝停电再来电时这路是开还是关；'
                 '「断电记忆」＝恢复停电前的样子')
# 米家把定时做在云端（App 的「智能场景」里），HA 侧一个实体都没有，
# 所以倒计时由页面自己实现：qlovehome.js 会给**每一台可控设备**自动追加一张「定时」卡
# （见 timerCard），不用在这里逐个设备配置。
TIMER_HINT = ('先选「关 / 开」，再选时长 → 到点自动执行。'
              '倒计时存在本机，刷新能续上；关页面太久（超过 1 分钟）的过期任务会直接丢弃')


def onekey_ctl(pfx):
    """dhkg01 单路射灯：通断 + 工作方式 + 指示灯 + 无线按键"""
    return _ctl(
        always=False,                      # 有真的通断实体：关着的时候图标就该是灰的
        sub='方式 · 指示灯 · 无线按键',
        echo=[{'e': 'switch.%s_on_p_2_1' % pfx, 'map': {'on': '亮着', 'off': '关着'}},
              {'e': 'select.%s_mode_p_2_2' % pfx}],
        groups=[
            {'t': '开关', 'items': [
                {'k': 'sw', 'label': '灯光', 'e': 'switch.%s_on_p_2_1' % pfx},
                {'k': 'sel', 'label': '工作方式', 'e': 'select.%s_mode_p_2_2' % pfx},
            ]},
            {'t': '面板', 'hint': '「有线和无线开关」＝墙上按键和 HA 都能控制；'
                                  '「无线模式」＝按键只发信号，不再直接驱动这一路',
             'items': [
                 {'k': 'sw', 'label': '指示灯', 'e': 'light.%s_s_10_indicator_light' % pfx},
             ]},
            {'t': '最近按键', 'hint': '墙上按键被按下时上报（只读，可做自动化触发）', 'items': [
                {'k': 'ro', 'label': '单击', 'e': 'event.%s_click_e_8_1' % pfx, 'fmt': 'ago'},
            ]},
        ])


# 三键面板 dhkg05：三个回路各有一个开关 + 一个「有线/无线」模式实体
STRIP_ROUTES = {2: ('餐边柜射灯', '左键'), 3: ('沙发射灯', '中键'), 4: ('氛围灯带', '右键')}
STRIP_KEY_EV = {2: 5, 3: 6, 4: 7}


def strip_lamp(pfx, i):
    return {'k': 'lamp', 'label': STRIP_ROUTES[i][0],
            'e': 'switch.%s_on_p_%d_1' % (pfx, i),
            'mode': 'select.%s_mode_p_%d_2' % (pfx, i)}


def strip_ctl(pfx, i):
    """三路合一：本路在前，同机另外两路在后（户型图上三枚图标仍在各自位置）"""
    nm = STRIP_ROUTES[i][0]
    return _ctl(
        always=False,
        sub='三路一体 · 本路 / 同机其它 / 指示灯',
        echo=[{'e': 'switch.%s_on_p_%d_1' % (pfx, i), 'map': {'on': '亮着', 'off': '关着'}},
              {'e': 'select.%s_mode_p_%d_2' % (pfx, i)}],
        groups=[
            {'t': '本路 · %s' % nm, 'items': [
                strip_lamp(pfx, i),
                {'k': 'btn', 'label': '状态翻转', 'e': 'button.%s_toggle_a_%d_1' % (pfx, i),
                 'text': '切换'},
            ]},
            {'t': '同机其它两路', 'hint': '同一台三键面板的另外两路，各自能切「有线开关 / 无线开关」',
             'items': [strip_lamp(pfx, j) for j in (2, 3, 4) if j != i]},
            {'t': '整机', 'items': [
                {'k': 'sw', 'label': '指示灯', 'e': 'light.%s_s_10_indicator_light' % pfx},
            ]},
            {'t': '最近按键', 'hint': '面板实体键被按下时上报（只读）', 'items': [
                {'k': 'ro', 'label': '左键', 'e': 'event.%s_click_e_5_1' % pfx, 'fmt': 'ago'},
                {'k': 'ro', 'label': '中键', 'e': 'event.%s_click_e_6_1' % pfx, 'fmt': 'ago'},
                {'k': 'ro', 'label': '右键', 'e': 'event.%s_click_e_7_1' % pfx, 'fmt': 'ago'},
            ]},
        ])


def giot_ctl(pfx):
    """绿米/领普这类单键面板：按键模式 + 上电状态 + 点动"""
    return _ctl(
        always=False,
        sub='模式 · 上电状态 · 点动',
        echo=[{'e': 'switch.%s_on_p_2_1' % pfx, 'map': {'on': '开着', 'off': '关着'}},
              {'e': 'select.%s_mode_p_2_2' % pfx}],
        groups=[
            {'t': '开关', 'items': [
                {'k': 'sw', 'label': '通断', 'e': 'switch.%s_on_p_2_1' % pfx},
                {'k': 'sel', 'label': '按键模式', 'e': 'select.%s_mode_p_2_2' % pfx},
                {'k': 'btn', 'label': '状态翻转', 'e': 'button.%s_toggle_a_2_1' % pfx,
                 'text': '切换'},
            ]},
            {'t': '上电行为', 'hint': POWER_ON_HINT, 'items': [
                {'k': 'sel', 'label': '默认上电状态',
                 'e': 'select.%s_default_power_on_state_p_2_3' % pfx},
                {'k': 'sw', 'label': '点动模式默认状态', 'e': 'switch.%s_on_p_11_1' % pfx},
                {'k': 'num', 'label': '按下持续时长', 'e': 'number.%s_mode_p_11_2' % pfx,
                 'unit': ' 秒'},
            ]},
            {'t': '最近按键', 'hint': '外接开关被按下时上报（只读）', 'items': [
                {'k': 'ro', 'label': '单击', 'e': 'event.%s_click_e_11_1' % pfx, 'fmt': 'ago'},
            ]},
        ])


def plug_ctl(pfx):
    """普通智能插座 / 插排（含三台 USB 通断器 —— 弱电箱 / 网络 / 服务器的风扇都接在这上面）
    HA 侧只有开关模式 + 默认上电状态两项设置；定时在米家云端，HA 拿不到实体，
    所以由页面自己实现（见 qlovehome.js 的 tickTimers）。"""
    return _ctl(
        always=False,
        sub='模式 · 上电状态 · 定时',
        echo=[{'e': 'switch.%s_on_p_2_1' % pfx, 'map': {'on': '通电', 'off': '断电'}},
              {'e': 'select.%s_mode_p_2_4' % pfx}],
        groups=[
            {'t': '开关', 'items': [
                {'k': 'sw', 'label': '通断', 'e': 'switch.%s_on_p_2_1' % pfx},
                {'k': 'sel', 'label': '开关模式', 'e': 'select.%s_mode_p_2_4' % pfx},
                {'k': 'btn', 'label': '状态翻转', 'e': 'button.%s_toggle_a_2_1' % pfx,
                 'text': '切换'},
            ]},
            {'t': '上电行为', 'hint': POWER_ON_HINT, 'items': [
                {'k': 'sel', 'label': '默认上电状态',
                 'e': 'select.%s_default_power_on_state_p_2_5' % pfx},
            ]},
        ])


def sixwgh_ctl(pfx):
    """文光汇 Mesh 插座（sixwgh ... v7icm）：这型号没有「开关模式 / 上电状态」，
    只有通断 + 面板按键的单击 / 双击 / 长按上报。事件是只读的（点了不会触发设备动作，
    是设备上的物理键被按时往 HA 推一条记录），所以放「最近按键」里看时间就行。"""
    return _ctl(
        always=False,
        sub='通断 · 按键记录',
        echo=[{'e': 'switch.%s_on_p_2_1' % pfx, 'map': {'on': '通电', 'off': '断电'}}],
        groups=[
            {'t': '开关', 'items': [
                {'k': 'sw', 'label': '通断', 'e': 'switch.%s_on_p_2_1' % pfx},
                {'k': 'btn', 'label': '状态翻转', 'e': 'button.%s_toggle_a_2_1' % pfx,
                 'text': '切换'},
            ]},
            {'t': '最近按键', 'hint': '插座上的物理键被按下时上报（只读）', 'items': [
                {'k': 'ro', 'label': '单击', 'e': 'event.%s_click_e_8_1' % pfx, 'fmt': 'ago'},
                {'k': 'ro', 'label': '双击', 'e': 'event.%s_double_click_e_8_2' % pfx, 'fmt': 'ago'},
                {'k': 'ro', 'label': '长按', 'e': 'event.%s_long_press_e_8_3' % pfx, 'fmt': 'ago'},
            ]},
        ])


PSV_CTL = _ctl(
    always=False,
    sub='通断 · 计量 · 温度',
    echo=[{'e': 'switch.%s_on_p_2_1' % PSV, 'map': {'on': '通电', 'off': '断电'}},
          {'e': 'sensor.%s_electric_power_p_3_2' % PSV, 'pre': '功率 ', 'unit': ' W'}],
    groups=[
        {'t': '开关', 'items': [
            {'k': 'sw', 'label': '通断', 'e': 'switch.%s_on_p_2_1' % PSV},
            {'k': 'btn', 'label': '状态翻转', 'e': 'button.%s_toggle_a_2_1' % PSV,
             'text': '切换'},
        ]},
        {'t': '计量', 'hint': '电压 / 电流米家报的是 mV / mA，这里已经换算成 V / A', 'items': [
            {'k': 'ro', 'label': '实时功率', 'e': 'sensor.%s_electric_power_p_3_2' % PSV,
             'unit': ' W'},
            {'k': 'ro', 'label': '累计电量', 'e': 'sensor.%s_power_consumption_p_3_1' % PSV,
             'unit': ' kWh'},
            {'k': 'ro', 'label': '电压', 'e': 'sensor.%s_voltage_p_3_3' % PSV,
             'src': 1000, 'unit': ' V'},
            {'k': 'ro', 'label': '电流', 'e': 'sensor.%s_electric_current_p_3_4' % PSV,
             'src': 1000, 'unit': ' A'},
        ]},
        {'t': '状态', 'hint': '「开关模式」米家只给 0 / 1，没写含义，改之前先记下原值', 'items': [
            {'k': 'num', 'label': '开关模式', 'e': 'number.%s_mode_p_2_2' % PSV,
             'min': 0, 'max': 1},
            {'k': 'ro', 'label': '插排温度', 'e': 'sensor.%s_temperature_p_2_3' % PSV,
             'unit': '°C'},
            {'k': 'ro', 'label': '已工作时间', 'e': 'sensor.%s_working_time_p_2_4' % PSV,
             'unit': ' 分钟'},
        ]},
    ])


# 坐标全部来自 222222.png 用户手点标注（.workbuddy/extract_devices*.py 提取 -> devices_blue.json）
# 客厅
# 2026-10-24 用户核对户型图：这两盏灯原本标反了（客厅大灯画在餐桌上方、餐厅灯画在沙发上方），
# 坐标整对互换；relax 后落点为 (320.8, 466.8) 与 (320.8, 371.0)
dev('living', '客厅大灯', 'light', 'switch.living_main_light', 318.0, 471.0)
dev('living', '餐厅灯', 'light', 'switch.dining_light', 322.0, 371.0)
dev('living', '沙发氛围射灯', 'light', 'switch.sofa_ambient_light', 419.6, 415.5,
    ctl=strip_ctl(SK5, 3))
dev('living', '氛围灯带', 'light', 'switch.light_strip', 419.6, 489.3,
    ctl=strip_ctl(SK5, 4))
dev('living', '客厅空调', 'ac', 'climate.living_ac_climate', 322.3, 245.0)
dev('living', '客厅云台机', 'cam', 'camera.living_ptz_control', 253.1, 297.1)
dev('living', '智能门锁', 'lock', 'sensor.smart_lock_door_state',
    501.2, 245.0, ctl=LOCK_CTL)
# 这两盏单路射灯：工作方式 / 指示灯 / 无线按键都埋在别的实体上 → 收进弹窗
dev('living', '进门射灯', 'light', 'switch.entrance_spot_light', 452.2, 245.0,
    ctl=onekey_ctl(SK1))
dev('living', '迎门画射灯', 'light', 'switch.painting_spot_light', 186.2, 245.0,
    ctl=onekey_ctl(SK2))
# 灯带氛围射灯是三路一体的面板：三枚图标各管一路，弹窗里能顺手改同机另外两路
dev('living', '餐边柜射灯', 'light', 'switch.sideboard_spot_light', 253.1, 439.2,
    ctl=strip_ctl(SK5, 2))
dev('living', '网络降温风扇', 'fan', 'switch.network_fan', 254.0, 492.9,
    ctl=plug_ctl('network_fan'))
dev('living', '弱电箱风扇', 'fan', 'switch.weak_box_fan', 254.0, 465.6,
    ctl=plug_ctl('weak_box_fan'))
dev('living', '服务器降温风扇', 'fan', 'switch.server_fan', 254.0, 521.2,
    ctl=plug_ctl('server_fan'))
dev('living', '客厅插排', 'plug', 'switch.living_power_strip', 253.1, 326.2)
# 中控面板：原来禁麦 / 睡眠模式两枚图标，合并成一台复合设备（弹窗里装全部 21 个实体）
dev('living', '中控面板', 'panel', 'switch.smart_panel_mute',
    411.4, 371.0, ctl=PANEL_CTL)
# 可视门铃：节能开关升级为整机（画面 / 提示音 / 侦测 / 夜视 / 铃声）
dev('living', '可视门铃', 'bell', 'sensor.doorbell_status',
    511.2, 275.2, ctl=BELL_CTL)

# 厨房
dev('kitchen', '厨房主灯', 'light', 'switch.kitchen_main_light', 441.4, 131.2)
dev('kitchen', '厨房水池灯', 'light', 'switch.kitchen_sink_light', 438.4, 50.9)
# 小方的 camera 实体在 HA 里长期 unavailable（xiaomi_miot 的取流链路坏在云端，
# 日志里是「Device不存在 / api.io.mi.com 超时」），但相机本身在线、也在录像 ——
# 同设备读得到的那颗电源开关拿来当备用状态源，别在面板上写「离线」。
# 2026-10-25：这台相机被 xiaomi_home/xiaomi_miot 双注册，home 那份（<厂商前缀>_*）
# 是影子实体（状态轨迹与 26b4 逐点同步，已验证），整组已禁用，fb 只留 miot 这颗
CAM_FB = ['switch.kitchen_cam_status']
dev('kitchen', '厨房相机', 'cam', 'camera.kitchen_cam_control', 404.0, 41.3, fb=CAM_FB)
# 这三台在米家里功能很多，页面上原来只挂了一个开关实体 → 统一升级成复合设备
dev('kitchen', '饮水机', 'plug', 'sensor.water_dispenser_status',
    404.0, 131.9, ctl=WATER_CTL)
dev('kitchen', '燃气热水器', 'heater', 'water_heater.gas_water_heater_water_heater',
    404.0, 76.0, ctl=HEATER_CTL)
dev('kitchen', '空气炸锅', 'cook', 'sensor.air_fryer_status',
    404.0, 170.0, ctl=FRYER_CTL)

# 主卧
dev('master', '主卧吸顶灯', 'light', 'switch.master_ceiling_light', 118.6, 586.3)
dev('master', '主卧迎门灯', 'light', 'switch.master_hall_light', 186.2, 347.3)
dev('master', '主卧空调', 'ac', 'climate.master_ac_climate', 186.2, 586.3)
dev('master', '主卧氛围灯', 'light', 'switch.master_ambient_light', 118.6, 438.3)
dev('master', '烛台', 'light', 'switch.candle_lamp', 52.6, 438.3,
    ctl=giot_ctl(GK1))
dev('master', '主卧插座', 'plug', 'switch.master_outlet', 186.2, 521.2,
    ctl=plug_ctl(PL1))
dev('master', '主卧长插排', 'plug', 'switch.metering_strip_power', 85.6, 438.3,
    ctl=PSV_CTL)

# 次卧
dev('secondary', '次卧吸顶灯', 'light', 'switch.secondary_ceiling_light', 518.0, 495.0)
dev('secondary', '次卧迎门灯', 'light', 'switch.secondary_hall_light', 478.0, 355.0)
dev('secondary', '空气净化器', 'fresh', 'switch.air_purifier_power',
    478.0, 455.0, ctl=PURIFIER_CTL)
dev('secondary', '次卧空调', 'ac', 'climate.secondary_ac_climate', 558.0, 535.0)
dev('secondary', '次卧小射灯', 'light', 'switch.secondary_spot_light', 518.0, 535.0,
    ctl=giot_ctl(GK2))

# 书房
dev('study', '书房吸顶灯', 'light', 'switch.study_ceiling_light', 303.8, 126.2)
dev('study', '台灯', 'light', 'switch.desk_lamp', 364.1, 178.6)
dev('study', '书房空调', 'ac', 'climate.study_ac_climate', 240.2, 75.5)
dev('study', '书房氛围灯', 'light', 'switch.study_ambient_light', 232.0, 149.5)
dev('study', '驱蚊器', 'plug', 'switch.mosquito_repellent', 363.2, 78.4)
dev('study', '电脑通断器', 'plug', 'switch.pc_breaker', 363.2, 155.9)
dev('study', '书房插排', 'plug', 'switch.study_power_strip', 364.1, 101.2,
    ctl=plug_ctl(PL2))
dev('study', '书房插座', 'plug', 'switch.study_outlet', 232.0, 124.0,
    ctl=plug_ctl(PL3))
dev('study', '书房音箱', 'media', 'media_player.speaker_study', 363.5, 50.3)
dev('study', '小爱音箱 mini', 'media', 'media_player.speaker_mini', 365.2, 128.3)

# 主卫
dev('masterwc', '主卫浴霸', 'heat', 'climate.masterwc_bath_heater_climate', 86.6, 350.4,
    ctl=BATH_M_CTL)
dev('masterwc', '主卫灯', 'light', 'light.masterwc_light', 132.5, 343.5)
# 马桶盖：原先 4 枚图标散在「其他设备」里，合并成一枚上图（主卫右下角）
dev('masterwc', '智能马桶盖', 'toilet', 'switch.smart_toilet_power',
    110.5, 375.0, ctl=TOILET_CTL)

# 客卫
dev('guestwc', '客卫浴霸', 'heat', 'climate.guestwc_bath_heater_climate', 116.2, 242.8,
    ctl=BATH_G_CTL)
dev('guestwc', '客卫灯', 'light', 'light.guestwc_light', 114.0, 285.0)

# 衣帽间
dev('closet', '衣帽间吸顶灯', 'light', 'switch.closet_ceiling_light', 142.0, 126.2)
dev('closet', '移动射灯', 'light', 'switch.moving_spot_light', 106.0, 55.0,
    ctl=giot_ctl(GK3))
dev('closet', '衣帽间插排', 'plug', 'switch.closet_power_strip', 186.2, 160.0)
dev('closet', '衣帽间空调', 'ac', 'climate.closet_ac_climate', 186.2, 55.0)

# 阳台
dev('balcony', '晾衣架', 'cover', 'cover.clothes_airer', 475.1, 622.9)
dev('balcony', '阳台灯', 'light', 'switch.balcony_light', 315.7, 622.9)
dev('balcony', '晾衣架灯', 'light', 'light.clothes_airer_light', 508.1, 622.9)
# 洗衣机：阳台最左侧那个窄台（y 587.8~625 只有 37 高），进出都得居中
dev('balcony', '洗衣机', 'appliance', 'switch.washer_power', 247.0, 606.4,
    ctl=WASHER_CTL)
dev('living', '烘鞋器', 'plug', 'switch.shoe_dryer', 529.0, 201.0,
    ctl=sixwgh_ctl('shoe_dryer'))
# 电视台座：2026-10-24 新入网（第二台 sixwgh.plug.v7icm），客餐厅左列，餐边柜射灯正上方
dev('living', '电视台座', 'plug', 'switch.tv_stand_outlet', 253.1, 407.2,
    ctl=sixwgh_ctl('tv_stand_outlet'))

# ── 只读状态（房间面板「状态」组 / 概览 / 家电页）──────────────
# (房间, 名称, 实体, 单位, 小数位, 取值映射)
R = []


def RO(room, name, entity, unit='', digits=None, mp=None, kind='sensor'):
    R.append({'room': room, 'name': name, 'entity': entity, 'unit': unit,
              'digits': digits, 'map': mp, 'kind': kind})


RO('living', '门锁状态', 'sensor.smart_lock_door_state',
   mp={'Locked': '已上锁', 'Unlocked': '已开锁', 'Jammed': '卡住', 'unknown': '未知'})
RO('living', '门锁电量', 'sensor.smart_lock_battery', '%', 0)
RO('living', '可视门铃', 'sensor.doorbell_status',
   mp={'Idle': '在线 · 待机', 'Ringing': '响铃中', 'unavailable': '离线', 'unknown': '未知'})
RO('living', '门铃电量', 'sensor.doorbell_battery', '%', 0)
RO('living', '路由器下载', 'sensor.router_download_speed', 'KiB/s', 0)
RO('living', '路由器上传', 'sensor.router_upload_speed', 'KiB/s', 0)
RO('living', '中枢网关', 'switch.hub_online', mp={'on': '在线', 'off': '离线'})
RO('living', '客厅云台机', 'switch.living_cam_online', mp={'on': '在线', 'off': '离线'})

RO('kitchen', '炸锅状态', 'sensor.air_fryer_status')
RO('kitchen', '炸锅剩余', 'sensor.air_fryer_left_time', '分钟', 0)
RO('kitchen', '饮水机', 'sensor.water_dispenser_status')
RO('kitchen', '出水 TDS', 'sensor.water_tds', '', 0)
RO('kitchen', '滤芯剩余', 'sensor.water_filter_life', '%', 0)
RO('kitchen', '热水器水温', 'sensor.heater_water_temp', '°C', 1)
RO('kitchen', '热水器设定', 'sensor.heater_target_temp', '°C', 1)
RO('kitchen', '热水器燃烧', 'switch.heater_burning', mp={'on': '燃烧中', 'off': '未燃烧'})
RO('kitchen', '炸锅温度', 'number.air_fryer_target_temperature', '°C', 0)
# 热水器本体已改为读真实电源开关（device 里的 燃气热水器），这里不再重复列一条
RO('kitchen', '厨房相机在线', 'switch.kitchen_cam_online', mp={'on': '在线', 'off': '离线'})

RO('master', '主卧空调在线', 'climate.master_ac_climate',
   mp={'unavailable': '离线', 'off': '待机'})
RO('master', '长插排实时功率', 'sensor.metering_strip_power', 'W', 0)
RO('master', '长插排累计电量', 'sensor.metering_strip_energy', 'kWh', 2)

RO('secondary', 'PM2.5', 'sensor.air_purifier_pm25', 'μg/m³', 0)
RO('secondary', '净化器滤芯', 'sensor.air_purifier_filter_life', '%', 0)
RO('secondary', '滤芯可用', 'sensor.air_purifier_filter_left_days', '天', 0)
RO('secondary', '次卧空调在线', 'climate.secondary_ac_climate', mp={'unavailable': '离线'})

RO('study', '衣柜门', 'binary_sensor.wardrobe_door',
   mp={'on': '打开', 'off': '关闭'})
RO('study', '多模网关', 'switch.gateway_online', mp={'on': '在线', 'off': '离线'})
RO('study', '防蚊片余量', 'sensor.mosquito_repellent_left', '%', 0)
RO('study', '书房音箱', 'media_player.speaker_mini',
   mp={'idle': '待机', 'playing': '播放中', 'paused': '暂停', 'off': '关闭', 'unavailable': '离线'})

RO('masterwc', '马桶着座', 'binary_sensor.smart_toilet_seating',
   mp={'on': '有人', 'off': '无人'})
RO('masterwc', '马桶滤芯', 'sensor.smart_toilet_filter_life', '%', 0)

RO('balcony', '晾衣架位置', 'cover.clothes_airer', kind='cover')

DEVICES = []
_buckets = {}
for d in D:
    if d['x'] is None or d['y'] is None:
        _buckets.setdefault(d['room'], []).append(d)
_pos = {}
for room, lst in _buckets.items():
    for d, (px, py) in zip(lst, place(room, len(lst))):
        _pos[id(d)] = (px, py)
for i, d in enumerate(D, 1):
    if d['x'] is not None and d['x'] < 0:
        px, py = None, None
    elif d['x'] is not None and d['y'] is not None:
        px, py = d['x'], d['y']
    else:
        px, py = _pos.get(id(d), (None, None))
    DEVICES.append({
        'id': 'd%d' % i,
        'room': d['room'],
        'name': d['name'],
        'kind': d['kind'],
        'entity': d['entity'],
        'x': px,
        'y': py,
        **({'ctl': d['ctl']} if d.get('ctl') else {}),
        **({'fb': d['fb']} if d.get('fb') else {}),
    })

def _seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _nearest_edge(x, y, pts):
    """返回 (距离, 边上最近点)。"""
    n = len(pts)
    best = None
    for i in range(n):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % n]
        d = _seg_dist(x, y, ax, ay, bx, by)
        if best is None or d < best[0]:
            dx, dy = bx - ax, by - ay
            L2 = dx * dx + dy * dy or 1.0
            t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / L2))
            best = (d, ax + t * dx, ay + t * dy)
    return best


FREE_ENT = {'switch.shoe_dryer'}   # 门外设备：不参与房间内约束
EDGE_ENT = {'water_heater.gas_water_heater_water_heater',
            'sensor.air_fryer_status'}  # 允许贴墙摆放的设备
FIX_ENT = {   # 完全钉死，relax 不挪动（用户指定保持原位 / 手工排好网格的房间）
    'switch.painting_spot_light',   # 迎门画射灯
    'sensor.smart_lock_door_state',  # 智能门锁
    'sensor.doorbell_status',       # 可视门铃（与门锁同一面墙）
    'switch.smart_panel_mute',  # 中控面板（与餐厅灯同行）
    'switch.smart_toilet_power',      # 智能马桶盖（主卫右下角，单独一点）
    'climate.study_ac_climate',             # 书房空调（与驱蚊器同行）
    'switch.study_ceiling_light',   # 书房吸顶灯（与插座/小爱同行）
    # 主卧：上排三点 / 右列 / 底部一行，手工对齐
    'switch.candle_lamp',   # 烛台
    'switch.metering_strip_power',      # 主卧长插排
    'switch.master_ambient_light',   # 主卧氛围灯
    'switch.master_outlet',   # 主卧插座
    'climate.master_ac_climate',             # 主卧空调
    'switch.master_ceiling_light',   # 主卧吸顶灯
    'switch.master_hall_light',   # 主卧迎门灯
    # 次卧：3 列网格
    'switch.secondary_hall_light',   # 次卧迎门灯
    'switch.air_purifier_power',     # 空气净化器
    'switch.secondary_ceiling_light',   # 次卧吸顶灯
    'climate.secondary_ac_climate',             # 次卧空调
    'switch.secondary_spot_light',   # 次卧小射灯
    # 衣帽间：手工网格
    'switch.moving_spot_light',   # 移动射灯
    'climate.closet_ac_climate',             # 衣帽间空调
    'switch.closet_ceiling_light',   # 衣帽间吸顶灯
    'switch.closet_power_strip',          # 衣帽间插排
}
PIN_Y = {     # 只锁纵坐标：与迎门画灯/门锁同排
    'climate.living_ac_climate': 245.0,       # 客厅空调
    'switch.entrance_spot_light': 245.0,   # 进门射灯
}


def relax(gap=33.0, mg=17.0, iters=260):
    """松弛布局：图标不要太贴墙，彼此也不要挤在一块。

    两步交替：①距墙 < mg 的沿法向往房间内推一点；②同房间内间距 < gap 的互相推开。
    每轮结束把跑到多边形外的点拉回房间内。位移尽量小，保留用户标注的相对位置。
    """
    items = [v for v in DEVICES if v['x'] is not None]
    polys = {r['id']: r['pts'] for r in ROOMS}
    home = [(v['x'], v['y']) for v in items]

    def pull_in(v):
        pts = polys[v['room']]
        if inside(v['x'], v['y'], pts):
            return
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        for k in range(1, 80):
            t = k / 80.0
            nx = v['x'] + (cx - v['x']) * t
            ny = v['y'] + (cy - v['y']) * t
            if inside(nx, ny, pts):
                v['x'], v['y'] = nx, ny
                return

    for _ in range(iters):
        # ① 推离墙面（门外设备跳过）
        for v in items:
            if v['entity'] in FREE_ENT or v['entity'] in EDGE_ENT or v['entity'] in FIX_ENT:
                continue
            pts = polys[v['room']]
            d, qx, qy = _nearest_edge(v['x'], v['y'], pts)
            if d >= mg:
                continue
            ux, uy = v['x'] - qx, v['y'] - qy
            L = math.hypot(ux, uy)
            if L < 0.5:
                cx = sum(p[0] for p in pts) / len(pts)
                cy = sum(p[1] for p in pts) / len(pts)
                ux, uy = v['x'] - cx, v['y'] - cy
                L = math.hypot(ux, uy) or 1.0
            step = min(mg - d, 3.0) * 0.7
            v['x'] += ux / L * step
            v['y'] += uy / L * step
        # ② 互相推开
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                a, b = items[i], items[j]
                fa, fb = a['entity'] in FIX_ENT, b['entity'] in FIX_ENT
                if fa and fb:
                    continue
                dx, dy = b['x'] - a['x'], b['y'] - a['y']
                dd = math.hypot(dx, dy)
                G = gap if a['room'] == b['room'] else gap * 0.78
                if dd >= G:
                    continue
                if dd < 0.5:
                    dx, dy, dd = 1.0, 0.0, 1.0
                push = min((G - dd) / 2.0, 3.0) * 0.5
                k = 2.0 if (fa or fb) else 1.0     # 一端固定时另一端承担全部位移
                if not fa:
                    a['x'] -= dx / dd * push * k
                    a['y'] -= dy / dd * push * k
                if not fb:
                    b['x'] += dx / dd * push * k
                    b['y'] += dy / dd * push * k
        for v in items:
            if v['entity'] in FREE_ENT or v['entity'] in FIX_ENT:
                continue
            pull_in(v)
        # ④ 复原钉死坐标
        for v in items:
            if v['entity'] in PIN_Y:
                v['y'] = PIN_Y[v['entity']]
            if v['entity'] in FIX_ENT:
                v['x'], v['y'] = v['_fx'], v['_fy']

    return max(math.hypot(v['x'] - h[0], v['y'] - h[1]) for v, h in zip(items, home))


def tidy(tol=7):
    """把同一视觉列/行的标记吸附到同一 x/y，看起来更整齐（幅度 ≤tol）。"""
    byroom = {}
    for v in DEVICES:
        if v['x'] is not None:
            byroom.setdefault(v['room'], []).append(v)
    for lst in byroom.values():
        for _ in range(5):
            for axis, other in (('x', 'y'), ('y', 'x')):
                seen = set()
                for a in lst:
                    if id(a) in seen:
                        continue
                    grp = [a] + [b for b in lst if b is not a
                                 and abs(b[axis] - a[axis]) <= tol
                                 and abs(b[other] - a[other]) >= 20]
                    if len(grp) < 2:
                        continue
                    mv = sum(g[axis] for g in grp) / len(grp)
                    for g in grp:
                        g[axis] = round(mv, 1)
                        seen.add(id(g))


def align(tol=12.0, min_gap=26.0, cross_tol=4.2, max_move=4.5):
    """把"视觉上同一行/列但差几像素"的图标拉成完全齐平（横平竖直）。

    先房间内对齐，再跨房间对齐（相邻房间之间差几像素的行也要拉直）。
    只有吸附后仍满足「在房间内 / 离墙 ≥11 / 与其它图标 ≥min_gap」才接受，
    否则保持原样。手工钉死的房间（FIX_ENT）不动，其余对齐到它们。
    """
    polys = {r['id']: r['pts'] for r in ROOMS}
    items = [v for v in DEVICES if v['x'] is not None]

    def ok(v):
        pts = polys[v['room']]
        if not inside(v['x'], v['y'], pts):
            return False
        if v['entity'] not in FREE_ENT:
            d, _, _ = _nearest_edge(v['x'], v['y'], pts)
            if d < 11.0:
                return False
        for b in items:
            if b is v:
                continue
            G = min_gap if b['room'] == v['room'] else min_gap * 0.75
            if math.hypot(b['x'] - v['x'], b['y'] - v['y']) < G:
                return False
        return True

    def clusters(lst, axis, _tol):
        srt = sorted(lst, key=lambda v: v[axis])
        out, cur = [], [srt[0]]
        for v in srt[1:]:
            if v[axis] - cur[-1][axis] <= _tol:
                cur.append(v)
            else:
                out.append(cur)
                cur = [v]
        out.append(cur)
        res = []
        for c in out:                                   # 链太长就按中位数劈开
            lo, hi = min(v[axis] for v in c), max(v[axis] for v in c)
            if hi - lo > _tol * 1.7:
                mid = (lo + hi) / 2
                res.append([v for v in c if v[axis] <= mid])
                res.append([v for v in c if v[axis] > mid])
            else:
                res.append(c)
        return [c for c in res if len(c) > 1]

    def sweep(lst, _tol, _max):
        moved = 0
        for axis in ('y', 'x'):
            for cl in sorted(clusters(lst, axis, _tol), key=len, reverse=True):
                ref = [v for v in cl if v['entity'] in FIX_ENT
                       or (axis == 'y' and v['entity'] in PIN_Y)]
                tgt = (ref[0][axis] if ref
                       else round(sum(v[axis] for v in cl) / len(cl), 1))
                for v in cl:
                    if v['entity'] in FIX_ENT or (axis == 'y' and v['entity'] in PIN_Y):
                        continue
                    old = v[axis]
                    if abs(old - tgt) < 0.05 or abs(tgt - old) > _max:
                        continue
                    v[axis] = tgt
                    if ok(v):
                        moved += 1
                    else:
                        v[axis] = old
        return moved

    moved = 0
    for rid in polys:                                   # ① 房间内
        lst = [v for v in items if v['room'] == rid]
        if len(lst) < 2:
            continue
        moved += sweep(lst, tol, 1e9)
    moved += sweep(items, cross_tol, max_move)          # ② 跨房间（限幅）
    for rid in polys:                                   # ③ 收尾：房间内再校验
        lst = [v for v in items if v['room'] == rid]
        if len(lst) >= 2:
            moved += sweep(lst, tol, 1e9)
    return moved


def relabel():
    """房间标签靠角落：名称 + 温湿度两行，取离最近角落最近且不压图标的空位。

    窄房间只显示温度（mk='temp'），否则两行文字放不下会压到图标。
    """
    devs = [(v['x'], v['y']) for v in DEVICES if v['x'] is not None]
    for r in ROOMS:
        pts = r['pts']
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        r['mk'] = 'both' if (x1 - x0) >= 160 else 'temp'
        near = [p for p in devs if x0 - 40 <= p[0] <= x1 + 40 and y0 - 40 <= p[1] <= y1 + 40]
        wtext = max(len(r['name']) * 13, 76 if r['mk'] == 'both' else 40)
        corners = [(x0 + 7, y0 + 17, 1.0), (x1 - 7 - wtext, y0 + 17, 1.28),
                   (x0 + 7, y1 - 12, 1.34), (x1 - 7 - wtext, y1 - 12, 1.62)]
        best = None
        for need_d, max_out in ((11.0, 0), (8.0, 1), (5.0, 2)):
            y = y0 + 14
            while y <= y1 - 8:
                x = x0 + 5
                while x <= x1 - 5:
                    if roomy(x, y, pts, 7):
                        bx0, by0, bx1, by1 = x - 5, y - 15, x + wtext + 5, y + 23
                        dmin = 999.0
                        for dx, dy in near:
                            qx = min(max(dx, bx0), bx1)
                            qy = min(max(dy, by0), by1)
                            d = math.hypot(dx - qx, dy - qy)
                            if d < dmin:
                                dmin = d
                        out = 0
                        for px, py in ((bx0, by0), (bx1, by0), (bx0, by1), (bx1, by1),
                                       ((bx0 + bx1) / 2, by0), ((bx0 + bx1) / 2, by1)):
                            if not inside(px, py, pts):
                                out += 1
                        if dmin >= need_d and out <= max_out:
                            dist = min(math.hypot(x - cx, y - cy) * cw for cx, cy, cw in corners)
                            score = min(dmin, 26) * 0.9 - dist
                            if best is None or score > best[0]:
                                best = (score, x, y)
                    x += 3.0
                y += 3.0
            if best:
                break
        if best:
            r['lx'], r['ly'] = round(best[1], 1), round(best[2], 1)


for _v in DEVICES:
    if _v['entity'] in FIX_ENT and _v['x'] is not None:
        _v['_fx'], _v['_fy'] = _v['x'], _v['y']

def even_col(names, min_gap=30.0):
    """把一列图标按等距重排（首尾不动、中间均分）。

    户型图这一列在 tidy/relax/align 之后间距是 33/34/28/40 —— 一头挤一头松，
    看着像随手摆的。只改 y，已经拉齐的 x 不受影响；间距小于 min_gap 就不动。
    """
    vs = [v for v in DEVICES if v['name'] in names and v['x'] is not None]
    if len(vs) != len(names):
        print('  ! even_col 只匹配到 %d/%d 个' % (len(vs), len(names)))
    if len(vs) < 3:
        return
    vs.sort(key=lambda v: v['y'])
    y0, y1 = vs[0]['y'], vs[-1]['y']
    step = (y1 - y0) / (len(vs) - 1)
    if step < min_gap:
        print('  ! even_col 等距后只剩 %.1fpx，跳过（会叠在一起）' % step)
        return
    for i, v in enumerate(vs):
        v['y'] = round(y0 + step * i, 1)
    print('  列等距：%d 个，间距 %.1fpx' % (len(vs), step))


tidy()
_drift = relax()
_aligned = align()        # 松弛后把差几像素的行/列拉齐（横平竖直）
relabel()
# 客厅电视墙那一竖列（插头→灯泡→三台风扇）：等距，否则中间挤、底下空
even_col(['电视台座', '餐边柜射灯', '弱电箱风扇', '网络降温风扇', '服务器降温风扇'])
print('正交化 %d 顶点  吸附台阶 %d 处  间隙归一 %d 面  relax 最大位移 %.1fpx  对齐 %d 处'
      % (_ortho_n, _snap_n, _gap_n, _drift, _aligned))

# 遗留的单条墙体 path：autoFrame=true 时由 unionPolys 动态生成，不再使用
WALL_PATH = ''

# 现实风底图校准参数（calib_real.py 定稿，v240）+ 房屋外轮廓
# photo_outline.json 由 trace_photo_outline.py 从底图 alpha 通道描出（存图片像素），
# 这里换算成户型坐标：plan = (img - O) / S
REAL_SX, REAL_SY, REAL_OX, REAL_OY = 1.73, 1.85, -8, -45
_photo_outline = json.load(open(os.path.join(HERE, 'photo_outline.json'), encoding='utf-8'))
PHOTO_OUTLINE = ' '.join('%g,%g' % (round((ix - REAL_OX) / REAL_SX, 1),
                                    round((iy - REAL_OY) / REAL_SY, 1))
                         for ix, iy in _photo_outline)


def _page_ver():
    """从 index.html 里抠出 ?v=N，给 plan-real.jpg 当缓存击穿参数。"""
    import re
    idx = open(os.path.join(HERE, 'qlovehome', 'index.html'), encoding='utf-8').read()
    m = re.search(r'qlovehome\.css\?v=(\d+)', idx)
    return m.group(1) if m else '0'


# 墙体：每间房轮廓外扩一个墙厚，绘制时用 mask 挖掉房间内部 →
# 外墙厚 = WALL，内墙 = 两侧融合后的间隙 = WALL，全屋厚度一致。
WALL_W = 13.0
WALLS = '|'.join(' '.join('%g,%g' % p for p in offset_poly(r['pts'], WALL_W))
                 for r in ROOMS)
SOLIDS = solid_holes(WALL_W)
OUTLINE = outline_ring(WALL_W + 11)
print('墙体：%d 个房间外扩 %.0fpx，补实心空腔 %d 块，外轮廓 %d 点'
      % (len(ROOMS), WALL_W, len(SOLIDS), len(OUTLINE)))

# 几何算完再排展示顺序，避免影响墙体并集/外轮廓的点序
ROOMS.sort(key=lambda r: ROOM_ORDER.index(r['id']) if r['id'] in ROOM_ORDER else 99)
for _r in ROOMS:
    _r['name'] = ROOM_RENAME.get(_r['id'], _r['name'])

def scene_cfg():
    """情景由本页面自己逐条下发，不依赖其他面板的 script 实体。"""
    ent = {v['name']: v['entity'] for v in DEVICES}
    out = {}

    def add(bucket, name, service, **kw):
        e = ent.get(name)
        if not e:
            print('  ! 情景缺设备:', name)
            return
        act = {'entity': e, 'service': service}
        act.update({k: v for k, v in kw.items() if v is not None})
        out.setdefault(bucket, []).append(act)

    def lights(bucket, service, rooms=None):
        for v in DEVICES:
            if v['kind'] != 'light':
                continue
            if rooms and v['room'] not in rooms:
                continue
            out.setdefault(bucket, []).append({'entity': v['entity'], 'service': service})

    # 全屋打开：所有灯全开（不碰空调等其它设备）
    lights('quankai', 'turn_on')

    # 全屋关闭：只关灯，空调不跟着关（用户明确要「关闭全部的灯光」）
    lights('quanguan', 'turn_off')

    # 观影模式：全屋灯关掉，只留「氛围灯带」（其它氛围射灯也一并关掉）
    lights('guanying', 'turn_off')
    add('guanying', '氛围灯带', 'turn_on')

    n_all = len(out.get('quankai', []))
    return [
        {'id': 'quankai', 'name': '全屋打开', 'icon': 'i-bulb',
         'hint': '打开全屋 %d 盏灯' % n_all, 'actions': out.get('quankai', [])},
        {'id': 'quanguan', 'name': '全屋关闭', 'icon': 'i-power',
         'hint': '关闭全屋所有灯光（空调不动）', 'actions': out.get('quanguan', [])},
        {'id': 'guanying', 'name': '观影模式', 'icon': 'i-moon',
         'hint': '关掉全屋灯光，只留氛围灯带', 'actions': out.get('guanying', [])},
        {'id': 'shuaxin', 'name': '状态刷新', 'icon': 'i-refresh', 'hint': '重新读取 HA 实体并重绘',
         'refresh': True, 'actions': []},
    ]


# 国网用电（HA 的 state_grid 集成）：页面只认这一套，要换就改 SG_ACC。
# 没有这个集成：把下面 SG 开头的行全部删掉，页面会自动降级成占位卡片。
SG_ACC = 'your_state_grid_account'
SG = 'sensor.state_grid_%s_' % SG_ACC

# ── 家电页：5 台空调 ────────────────────────────────────────────
# 4 台美的（midea_ac_lan）读数齐全：自带室内温度 / 湿度 / 实时功率 / 电量计数器；
# 客厅那台是另一品牌（示例），米家只放了 climate + 一颗切换按钮 + 故障传感器，
# 所以它的详细读数靠 keys 按友好名自动收集（applianceEntities）。
AC_MODE = {'off': '已关闭', 'cool': '制冷', 'heat': '制热', 'dry': '除湿',
           'fan_only': '送风', 'auto': '自动', 'unavailable': '离线'}
# hvac_action：这一台到底在不在干活。米家（美的）不报这个属性，只有海尔那台有；
# 所以它单独占一行、没有就显示 —，不拿 state='cool' 去冒充「制冷中」。
AC_ACTION = {'cooling': '制冷中', 'heating': '制热中', 'drying': '除湿中',
             'fan': '送风中', 'idle': '待机（到温了）', 'off': '已停机',
             'unavailable': '离线', 'unknown': '未上报'}


def ac_app(name, room, eid, haier=False):
    """eid = 米家/美的那段设备号（climate.<eid>_climate）。haier 走另一套实体命名。"""
    if haier:
        return {'name': name, 'icon': 'i-snow', 'room': room, 'keys': [name],
                'rows': [['模式', 'climate.' + eid, AC_MODE],
                         ['正在运行', 'climate.' + eid, AC_ACTION, 'hvac_action'],
                         ['当前室温', 'climate.' + eid, None, 'current_temperature', ' °C'],
                         ['设定温度', 'climate.' + eid, None, 'temperature', ' °C'],
                         ['风速', 'climate.' + eid, None, 'fan_mode']],
                'hint': '海尔这台是 climate 一个实体兜全部读数，没有独立的功率 / 电量传感器，'
                        '所以看不到耗电；「正在运行」是 hvac_action，能看出是压缩机在转还是已经到温待机。'}
    return {'name': name, 'icon': 'i-snow', 'room': room, 'keys': [],
            'rows': [
                ['模式', 'climate.%s_climate' % eid, AC_MODE],
                ['当前室温', 'sensor.%s_indoor_temperature' % eid, None],
                ['设定温度', 'climate.%s_climate' % eid, None, 'temperature', ' °C'],
                ['实时功率', 'sensor.%s_realtime_power' % eid, None],
                ['本期电量', 'sensor.%s_current_energy_consumption' % eid, None],
                ['累计电量', 'sensor.%s_total_energy_consumption' % eid, None],
            ],
            'hint': '「模式」是设定的工作方式，不等于正在制冷；米家没把 hvac_action 报上来，'
                    '分不出「在制冷」还是「到温待机」。'
                    '「本期电量」是空调自己记的一段周期计数（会归零），不是实时功率；'
                    '「累计电量」是出厂至今的总和。「实时功率」关机时仍有 4~5 W 待机功耗。'}


AC_APPLIANCES = [
    ac_app('客厅空调', '客厅', 'living_ac', haier=True),
    ac_app('主卧空调', '主卧', 'master_ac'),
    ac_app('次卧空调', '次卧', 'secondary_ac'),
    ac_app('书房空调', '书房', 'study_ac'),
    ac_app('衣帽间空调', '衣帽间', 'closet_ac'),
]

# ── 未接入的米家设备：由设备/实体注册表对账生成，页面打开时会实时重算 ──────
# 页面打开「其他设备」时会尝试用 hass.callWS 实时重算，这个文件里的只是兜底快照。
MISS = os.path.join(HERE, 'missing_ents.json')
MISSING = []
if os.path.exists(MISS):
    try:
        with open(MISS, encoding='utf-8') as f:
            MISSING = json.load(f)
    except Exception as exc:
        print('  ! missing_ents.json 读取失败:', exc)

# 儿童手表（xiaomi_home）：实体前缀都是这个 did，只有三样活数据，见 people 注释
WATCH = 'your_watch_device_id'   # 儿童手表在实体名里的那段设备标识；没接手表就把 people 里那块 watch{} 整个删掉

DATA = {
    'config': {
        'live': True,
        'refreshMs': 2000,
        'weather': {
            'entity': 'weather.forecast_home',
            'temp': 'sensor.living_temperature',
            'hum': 'sensor.living_humidity',
            'kwh': SG + 'daily_ele_num',
        },
        'overview': {
            'netDown': 'sensor.router_download_speed',
            'netUp': 'sensor.router_upload_speed',
            # 家人：实体在 templates.yaml（模板 binary_sensor），底层是
            # configuration.yaml 里 command_line 走容器 ICMP ping 设备 IP。
            # 家人一 = 两台设备任一在线（手机 A / B）；家人二 = 手机 C；家人三 = 手机 D。
            'people': [
                # v225：每个人都有自己的详情页。probes 是 templates.yaml 里那几个模板
                # binary_sensor 的**底层实体**（command_line ping 设备 IP），
                # 详情页把它逐条列出来 —— 判定对不对，一眼能看出来是哪台设备没响应。
                {'name': '家人一', 'entity': 'binary_sensor.family_member_1',
                 'note': '两台设备任一在线即算在家',
                 'probes': [
                     {'n': '手机A（填你的IP）', 'e': 'binary_sensor.family_phone_a'},
                     {'n': '手机B（填你的IP）', 'e': 'binary_sensor.family_phone_b'}]},
                {'name': '家人二', 'entity': 'binary_sensor.family_member_2',
                 'probes': [{'n': '手机C（填你的IP）', 'e': 'binary_sensor.family_phone_c'}]},
                # v222：墨墨多一块儿童手表（xiaomi_home 集成，14 个实体）。
                # 只有三样是活的：电量（挂在 device_tracker 的 battery_level 属性上）、
                # 充电状态、街道级中文地址。经纬度只到市一级（34.0 / 117.0）→ 别拿它算距离；
                # 电压 / 故障 / 工作状态 / 开关全是 unknown 或无语义，一律不用，也不下发改动。
                # 定位靠 ping，手表只补「电量 · 充电 · 在哪」；地址里出现 home 片段
                # 就当在家附近（zone.home 半径 100m，手表那套坐标永远进不去，没用）。
                {'name': '家人三', 'entity': 'binary_sensor.family_member_3',
                 'probes': [{'n': '手机D（填你的IP）', 'e': 'binary_sensor.family_phone_d'}],
                 'watch': {
                     'label': '儿童手表',
                     'tracker': 'device_tracker.' + WATCH,
                     'charge': 'sensor.' + WATCH + '_charging_state_p_5_2',
                     'place': 'sensor.' + WATCH + '_current_address_p_2_6',
                     'home': '你的小区名',
                 }},
            ],
            'power': {
                'kwhDay': SG + 'daily_ele_num',
                'kwhMonth': SG + 'month_ele_num',
                'billMonth': SG + 'esti_amt',
                'balance': SG + 'balance',
                'kwhYear': SG + 'year_ele_num',
                'costYear': SG + 'year_ele_cost',
                'kwhLastMonth': SG + 'last_month_ele_num',
                'costLastMonth': SG + 'last_month_ele_cost',
                'dayDate': SG + 'daily_lasted_date',
                'refresh': SG + 'refresh_time',
                # 峰谷拆分与趋势图（电量详情弹窗用）
                'pDay': SG + 'daily_p_ele_num',
                'vDay': SG + 'daily_v_ele_num',
                'pMonth': SG + 'month_p_ele_num',
                'vMonth': SG + 'month_v_ele_num',
                'graph30': SG + 'recent_30_daily_ele_list',
                'graph12': SG + 'recent_12_monthly_ele_list',
            },
        },
        'cameras': [
            {'name': '客厅云台机', 'entity': 'camera.living_ptz_control'},
            {'name': '厨房相机', 'entity': 'camera.kitchen_cam_control'},
            # 门铃走 Xiaomi Miot 那套，实体名带 did 后缀，camera_proxy 能直接出截图
            {'name': '可视门铃', 'entity': 'camera.doorbell_control'},
        ],
        'gates': [
            {'name': '路由器', 'entity': 'switch.router_wan'},
            {'name': '中枢网关', 'entity': 'switch.hub_online'},
            {'name': '多模网关', 'entity': 'switch.gateway_online'},
            {'name': '智能门锁', 'entity': 'sensor.smart_lock_door_state'},
            {'name': '可视门铃', 'entity': 'sensor.doorbell_status'},
        ],
    },
    'plan': {'w': 620, 'h': 692, 'wall': WALL_PATH, 'walls': WALLS, 'wallW': WALL_W,
             'outline': ' '.join('%g,%g' % p for p in OUTLINE),
             'solids': [[round(v, 1) for v in s] for s in SOLIDS],
             # 现实风格底板（assets/plan-real.png = D:/HAOS/lovehome.png 原样拷贝，
             # **带透明通道** —— 透明处露出页面背景。v239 及之前转 JPG 把 alpha 丢了，
             # 透明区底下的灰色像素露出来，就是用户看到的「图片上没有的灰色色块」。
             # x/y/w/h 是「户型坐标系里这张图铺在哪」：由 calib_real.py 把房间多边形
             # 叠到原图上校准出来。这张 AI 插画房间比例不完全均匀，线性映射只能取折中
             # —— v240 按用户目测定稿：sx=1.73 sy=1.85 ox=0 oy=-45（比 v239 横向再收紧，
             # 红框区域整体左移）。换底图必须重新校准，不然图标会漂到隔壁房间。
             # photo.outline：房屋外轮廓（户型坐标），现实风虚线专走这条（用户要求
             # 虚线沿底图外框，和扁平主题的外轮廓虚线分开）。
             # src 带 index.html 里的 ?v=N：图片 URL 没有版本参数会被浏览器缓存，
             # 底图换了用户却看不到旧图 —— 跟页面版本联动击穿缓存。
             'photo': {'src': 'assets/plan-real.png?v=%s' % _page_ver(),
                       'x': round(-REAL_OX / REAL_SX, 2), 'y': round(-REAL_OY / REAL_SY, 2),
                       'w': round(1025 / REAL_SX, 2), 'h': round(1192 / REAL_SY, 2),
                       'outline': PHOTO_OUTLINE}},
    'rooms': [
        {'id': r['id'], 'name': r['name'], 'lx': r['lx'], 'ly': r['ly'],
         'mk': r.get('mk', 'both'),
         'pts': ' '.join('%g,%g' % p for p in r['pts']),
         'temp': r['t'], 'hum': r['h'], **({'mirror': r['mirror']} if r.get('mirror') else {})}
        for r in ROOMS
    ],
    'devices': DEVICES,
    'missing': MISSING,
    'readouts': R,
    'scenes': [
        *scene_cfg(),
    ],
    'filters': [
        {'id': 'all', 'name': '全部', 'icon': 'i-all'},
        {'id': 'light', 'name': '灯光', 'icon': 'i-bulb'},
        {'id': 'ac', 'name': '空调', 'icon': 'i-snow'},
        {'id': 'heat', 'name': '采暖', 'icon': 'i-heat'},
        {'id': 'fresh', 'name': '净化', 'icon': 'i-wind'},
        {'id': 'other', 'name': '其它', 'icon': 'i-plug'},
    ],
    # 右栏常驻内容：两个模块，不再是「天气/用电占位」。
    # 设备一律按「名字」引用（dN 是生成时的序号，插设备会漂移）；网关不是 LH.devices，走只读行。
    'panel': {
        'quick': ['客厅大灯', '餐厅灯', '厨房主灯', '阳台灯', '进门射灯', '迎门画射灯',
                  '客厅插排', '主卧吸顶灯', '次卧吸顶灯', '书房吸顶灯'],
        'security': [
            {'e': 'switch.hub_online', 'n': '中枢网关', 'k': 'hub',
             'map': {'on': '在线', 'off': '离线'}},
            {'e': 'switch.gateway_online', 'n': '多模网关', 'k': 'hub',
             'map': {'on': '在线', 'off': '离线'}},
            {'n': '智能门锁'}, {'n': '可视门铃'}, {'n': '客厅云台机'}, {'n': '厨房相机'},
        ],
    },
    # 概览里的「电池 · 耗材」：只放读得到数的实体（unavailable/unknown 在界面上自动跳过）
    'supplies': {
        'battery': [
            {'n': '智能门锁', 'e': 'sensor.smart_lock_battery'},
            {'n': '可视门铃', 'e': 'sensor.doorbell_battery'},
            {'n': 'NAS温湿度计', 'e': 'sensor.living_sensor_battery'},
            {'n': '主卧温湿度计', 'e': 'sensor.master_sensor_battery'},
            {'n': '次卧温湿度计', 'e': 'sensor.secondary_sensor_battery'},
            {'n': '书房温湿度计', 'e': 'sensor.study_sensor_battery'},
            {'n': '厨房温湿度计', 'e': 'sensor.kitchen_sensor_battery'},
            {'n': '阳台温湿度计', 'e': 'sensor.balcony_sensor_battery'},
            {'n': '衣帽间温湿度计', 'e': 'sensor.closet_sensor_battery'},
            {'n': '人体传感器', 'e': 'sensor.motion_sensor_battery'},
            {'n': '衣柜门传感器', 'e': 'sensor.wardrobe_door_battery'},
        ],
        'consume': [
            {'n': '马桶盖滤芯', 'e': 'sensor.smart_toilet_filter_life'},
            {'n': '净饮机滤芯', 'e': 'sensor.water_filter_life'},
            {'n': '净化器滤芯', 'e': 'sensor.air_purifier_filter_life'},
            {'n': '驱蚊片', 'e': 'sensor.mosquito_repellent_left'},
        ],
    },
    'appliances': [
        {'name': '洗衣机', 'icon': 'i-washer', 'room': '阳台',
         'rows': [['运行状态', 'switch.washer_running', {'on': '运行中', 'off': '待机'}],
                  ['电源', 'switch.%s_power' % WM, {'on': '已通电', 'off': '已断电'}],
                  ['当前阶段', 'sensor.%s_progress' % WM, WASHER_PROG],
                  ['剩余时间', 'sensor.%s_time_remaining' % WM, None, None, ' 分钟']],
         'hint': '滚筒洗衣机经米家接入：「运行状态」是模板镜像，电源 / 开始 / 阶段 / 剩余时间为真实实体；'
                 '洗衣程序没有接入 HA，只能在机器面板或米家 App 里选。'
                 '「剩余时间」只在洗的时候有数，洗完后 HA 给的是 unknown → 这里显示 —。'},
        {'name': '空气炸锅', 'icon': 'i-pot', 'room': '厨房',
         'rows': [['工作状态', 'sensor.air_fryer_status', None],
                  ['剩余时间', 'sensor.air_fryer_left_time', None, None, ' 分钟'],
                  ['设定温度', 'number.air_fryer_target_temperature', None]],
         'hint': '「剩余时间」「设定温度」是机器上最后一次设的值，关机也不会归零。'},
        {'name': '净饮机', 'icon': 'i-tap', 'room': '厨房',
         'rows': [['工作状态', 'sensor.water_dispenser_status', None],
                  ['出水 TDS', 'sensor.water_tds', None, None, ' ppm'],
                  ['滤芯剩余', 'sensor.water_filter_life', None]]},
        {'name': '空气净化器', 'icon': 'i-wind', 'room': '次卧',
         'rows': [['开关', 'switch.air_purifier_power', {'on': '开启', 'off': '关闭'}],
                  ['PM2.5', 'sensor.air_purifier_pm25', None],
                  ['滤芯剩余', 'sensor.air_purifier_filter_life', None]]},
        {'name': '晾衣架', 'icon': 'i-cover', 'room': '阳台',
         'rows': [['位置', 'cover.clothes_airer', {'@cover': True}],
                  ['照明', 'light.clothes_airer_light', {'on': '开启', 'off': '关闭'}]]},
        # 原来这一行读 water_heater 的 state，把 'gas' 映射成「燃烧中」—— 是错的：
        # 那个 state 是 patch_midea4.py 造出来的合法枚举（通电即 gas），烧不烧跟它没关系。
        # 现在拆成「模式」+「正在燃烧」（binary_sensor 真值）+ 两个水温。
        {'name': '热水器', 'icon': 'i-flame', 'room': '厨房',
         'rows': [['模式', 'water_heater.gas_water_heater_water_heater', HEATER_MODE],
                  ['正在燃烧', 'binary_sensor.gas_water_heater_burning_state', HEATER_BURNING],
                  ['当前水温', 'sensor.gas_water_heater_current_temperature', None],
                  ['设定水温', 'water_heater.gas_water_heater_water_heater', None, 'temperature', ' °C'],
                  ['电源', 'switch.gas_water_heater_power', {'on': '已通电', 'off': '已断电'}],
                  ['防护', 'binary_sensor.gas_water_heater_protection', {'on': '正常', 'off': '已触发'}]],
         'hint': '「模式」只说明走哪套燃烧方式，通着电就有，不代表正在烧；真在烧看「正在燃烧」。'
                 '水温与设定温度由米家云端拉取，1~2 度的回差是正常的。'},
    ] + AC_APPLIANCES,
}

head = """/* QLovehome 数据层 · 由 .workbuddy/gen_qlovehome_data.py 生成，勿手改
 * 实体均来自 HA 现有设备（按区域归属整理）；状态由 qlovehome.js 同源读取 hass。
 */
"""
body = 'window.LH = ' + json.dumps(DATA, ensure_ascii=False, indent=1) + ';\n'
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write(head + body)

# 右栏常驻栏引用的名字必须真实存在，否则界面上会静默少一行
_names = {d['name'] for d in DEVICES}
for _n in DATA['panel']['quick']:
    if _n not in _names:
        print('  ! 常用设备找不到：', _n)
for _it in DATA['panel']['security']:
    if 'n' in _it and 'e' not in _it and _it['n'] not in _names:
        print('  ! 安防设备找不到：', _it['n'])

print('rooms', len(DATA['rooms']), 'devices', len(DEVICES), 'missing', len(MISSING),
      'markers', sum(1 for d in DEVICES if d['x'] is not None),
      'readouts', len(R), 'bytes', len((head + body).encode('utf-8')))

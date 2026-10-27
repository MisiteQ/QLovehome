#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""从标注图提取房间多边形，输出 rooms_poly.json（参考实现）。

流程：
1. ORB 把标注图对齐到原始户型图
2. 按颜色取出每个房间的色块 mask
3. 腐蚀留出间隙 -> 轮廓 -> 简化 -> 映射到画布坐标 620x692
4. 标签位置取多边形内最大内切点（保证落在房间内）
"""
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ANN = sys.argv[1] if len(sys.argv) > 1 else 'annotated.png'   # 标注图（房间用不同颜色圈好）
SRC = sys.argv[2] if len(sys.argv) > 2 else 'floorplan.png'   # 原始户型图
OUT = os.path.join(HERE, 'rooms_poly.json')

# 画布尺寸（与 lovehome-data.js 的 plan.w/h 一致）
CW, CH = 620, 692
# 原图裁剪框（墙体 bbox）
OX0, OY0, OX1, OY1 = 630, 227, 1692, 1373

# 颜色 -> 房间。order 取第几块；by='x' 按横向位置排序（书房/厨房两色极近，需按位置区分）
SPEC = [
    ('closet',    '衣帽间',      (123, 205, 235), 0, 'x'),
    ('study',     '书房',        (27, 139, 132),  0, 'x'),
    ('kitchen',   '厨房',        (27, 139, 93),   1, 'x'),
    ('guestwc',   '客卫',        (42, 115, 13),   0, 'x'),
    ('masterwc',  '主卫',        (106, 189, 16),  0, 'x'),
    ('master',    '主卧',        (189, 16, 106),  0, 'x'),
    ('living',    '客厅 · 餐厅', (209, 219, 47),  0, 'x'),
    ('secondary', '次卧',        (16, 189, 94),   0, 'x'),
    ('balcony',   '阳台',        (126, 16, 189),  0, 'x'),
]


def affine():
    """标注图 -> 原图裁剪坐标 的仿射矩阵。"""
    src = cv2.imdecode(np.fromfile(SRC, np.uint8), cv2.IMREAD_COLOR)
    A = cv2.cvtColor(src[OY0:OY1, OX0:OX1], cv2.COLOR_BGR2GRAY)

    ann = cv2.imdecode(np.fromfile(ANN, np.uint8), cv2.IMREAD_UNCHANGED)
    rgb = cv2.cvtColor(ann[:, :, :3], cv2.COLOR_BGR2RGB).astype(np.int16)
    sat = rgb.max(2) - rgb.min(2)
    B = np.where(sat > 40, 221, rgb.mean(2)).astype(np.uint8)  # 彩色涂背景，只留线稿

    orb = cv2.ORB_create(6000, edgeThreshold=3, patchSize=31)
    ka, da = orb.detectAndCompute(A, None)
    kb, db = orb.detectAndCompute(B, None)
    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    pairs = [m for m, n in bf.knnMatch(db, da, k=2) if m.distance < 0.75 * n.distance]
    if len(pairs) < 12:
        raise SystemExit('特征匹配不足: %d' % len(pairs))
    pb = np.float32([kb[m.queryIdx].pt for m in pairs])
    pa = np.float32([ka[m.trainIdx].pt for m in pairs])
    M, inl = cv2.estimateAffinePartial2D(pb, pa, method=cv2.RANSAC, ransacReprojThreshold=3.0)
    pred = (M[:, :2] @ pb.T).T + M[:, 2]
    res = np.linalg.norm(pred - pa, axis=1)
    print('affine inliers %d/%d  residual %.2f px' % (int(inl.sum()), len(pairs),
                                                      np.median(res[inl.ravel() > 0])))
    return M


def to_canvas(M):
    """返回 标注图像素 -> 画布坐标 的线性系数 (ax+b, ay+b)。"""
    sx = CW / (OX1 - OX0)
    sy = CH / (OY1 - OY0)
    return (M[0, 0] * sx, M[0, 2] * sx, M[1, 1] * sy, M[1, 2] * sy)


def mask_of(rgb, color, tol=45):
    t = np.array(color, np.int16)
    d = np.abs(rgb.astype(np.int16) - t).sum(2)
    m = (d < tol).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
    return m


def select_comp(m, order=0, by='area'):
    """按面积或横向位置取第 order 个连通域。"""
    n, lab, stats, cent = cv2.connectedComponentsWithStats(m, 8)
    comps = [j for j in range(1, n) if stats[j, 4] > 500]
    if by == 'x':
        comps.sort(key=lambda j: cent[j, 0])
    else:
        comps.sort(key=lambda j: -stats[j, 4])
    if len(comps) <= order:
        return None
    return (lab == comps[order]).astype(np.uint8)


def main():
    M = affine()
    ax, bx, ay, by = to_canvas(M)
    print('canvas map: x=%.5f*px%+.2f  y=%.5f*px%+.2f' % (ax, bx, ay, by))

    ann = cv2.imdecode(np.fromfile(ANN, np.uint8), cv2.IMREAD_UNCHANGED)
    rgb = cv2.cvtColor(ann[:, :, :3], cv2.COLOR_BGR2RGB)

    rooms = []
    taken = np.zeros(rgb.shape[:2], np.uint8)  # 已占用区域，避免相邻色块互相压盖
    for rid, name, color, order, pick_by in SPEC:
        m = mask_of(rgb, color)
        comp = select_comp(m, order, pick_by)
        if comp is None:
            print('!! %s 未找到色块' % rid)
            continue
        # 让出已分配房间的地盘（用户手绘块之间有少量重叠）
        comp[cv2.dilate(taken, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))) > 0] = 0
        comp = select_comp(comp, 0, 'area') if (comp > 0).sum() > 500 else comp
        # 腐蚀留出房间之间的缝
        er = cv2.erode(comp, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)), iterations=1)
        if (er > 0).sum() < 0.55 * (comp > 0).sum():
            er = cv2.erode(comp, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)), iterations=1)
        taken[er > 0] = 1
        cnts, _ = cv2.findContours(er, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        c = max(cnts, key=cv2.contourArea)
        ap = cv2.approxPolyDP(c, 1.2, True).reshape(-1, 2)
        pts = [(round(p[0] * ax + bx, 1), round(p[1] * ay + by, 1)) for p in ap]

        # 标签位置：多边形内最"宽"处的质心（取接近最大内切距的一片点求平均）
        dt = cv2.distanceTransform(er, cv2.DIST_L2, 5)
        mx = dt.max()
        ys2, xs2 = np.where(dt >= max(mx * 0.9, 1))
        lx, ly = round(xs2.mean() * ax + bx, 1), round(ys2.mean() * ay + by, 1)

        area = (er > 0).sum() * ax * ay
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        print('%-10s area=%7.0f  verts=%d  bbox %.0f,%.0f - %.0f,%.0f  label %.0f,%.0f'
              % (rid, area, len(pts), min(xs), min(ys), max(xs), max(ys), lx, ly))
        rooms.append({'id': rid, 'name': name, 'pts': pts, 'lx': lx, 'ly': ly})

    json.dump({'canvas': [CW, CH], 'rooms': rooms},
              open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('written', OUT)


if __name__ == '__main__':
    main()

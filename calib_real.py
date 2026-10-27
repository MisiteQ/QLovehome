#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把户型多边形叠到你的户型底图上，校准「户型坐标 -> 图片像素」映射。
用法：python calib_real.py sx sy ox oy   （scale 和 offset，单位：图片像素）
不传参用上次结果（存在 calib_real.json）。"""
import json, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
POLY = os.path.join(HERE, 'rooms_poly.json')
IMG = sys.argv[1] if len(sys.argv) > 1 else 'floorplan.png'
OUT = os.path.join(HERE, 'shots', 'calib_overlay.png')
SAVE = os.path.join(HERE, 'calib_real.json')

d = json.load(open(POLY, encoding='utf-8'))
im = Image.open(IMG).convert('RGB')
dr = ImageDraw.Draw(im)

if len(sys.argv) >= 5:
    sx, sy, ox, oy = map(float, sys.argv[1:5])
else:
    sx, sy, ox, oy = (1.935, 1.795, 45, 55)  # 初值：按 1240/620*0.97 估
if os.path.exists(SAVE) and len(sys.argv) < 5:
    j = json.load(open(SAVE))
    sx, sy, ox, oy = j['sx'], j['sy'], j['ox'], j['oy']

COLORS = {'closet':'#e91e63','study':'#9c27b0','kitchen':'#f44336','guestwc':'#00bcd4',
          'masterwc':'#3f51b5','master':'#ff9800','living':'#4caf50','secondary':'#795548',
          'balcony':'#2196f3'}
for r in d['rooms']:
    pts = [(p[0]*sx+ox, p[1]*sy+oy) for p in r['pts']]
    c = COLORS.get(r['id'], '#000')
    dr.polygon(pts, outline=c, width=4)
    cx = sum(p[0] for p in pts)/len(pts); cy = sum(p[1] for p in pts)/len(pts)
    dr.text((cx-20, cy-10), r['name'], fill=c)

print('sx=%.4f sy=%.4f ox=%.1f oy=%.1f' % (sx, sy, ox, oy))
print('plan(0,0)->img(%.0f,%.0f)  plan(620,692)->img(%.0f,%.0f)' % (ox, oy, 620*sx+ox, 692*sy+oy))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
im.save(OUT)
json.dump({'sx': sx, 'sy': sy, 'ox': ox, 'oy': oy}, open(SAVE, 'w'))
print('saved ->', OUT)

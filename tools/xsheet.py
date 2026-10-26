"""Junta as fotos do xsheet.cjs: cada linha é uma sala, Performance à esquerda e EXTREME à direita.
uso: python3 tools/xsheet.py [pasta] [salas por folha]"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

d = sys.argv[1] if len(sys.argv) > 1 else 'shots/sheet'
per = int(sys.argv[2]) if len(sys.argv) > 2 else 4
rooms = []
for f in sorted(os.listdir(d), key=lambda f: os.path.getmtime(os.path.join(d, f))):
    if f.endswith('-performance.png'):
        r = f[:-len('-performance.png')]
        if os.path.exists(os.path.join(d, f'{r}-extreme.png')):
            rooms.append(r)
W, H = 640, 360


def lum(im):
    x = np.asarray(im, np.float32) / 255
    return (x @ np.array([0.299, 0.587, 0.114])).mean()


for k in range(0, len(rooms), per):
    chunk = rooms[k:k + per]
    out = Image.new('RGB', (W * 2 + 8, (H + 18) * len(chunk)), (20, 20, 20))
    dr = ImageDraw.Draw(out)
    for i, r in enumerate(chunk):
        a = Image.open(os.path.join(d, f'{r}-performance.png')).convert('RGB')
        b = Image.open(os.path.join(d, f'{r}-extreme.png')).convert('RGB')
        y = i * (H + 18)
        dr.text((4, y + 3), f'{r}  performance {lum(a):.3f}   extreme {lum(b):.3f}', fill=(230, 230, 230))
        out.paste(a.resize((W, H)), (0, y + 18))
        out.paste(b.resize((W, H)), (W + 8, y + 18))
    path = os.path.join(d, f'folha-{k // per + 1}.png')
    out.save(path)
    print(path, ', '.join(chunk))

"""Compara fotos Performance x EXTREME: brilho médio, contraste e um recorte lado a lado.
uso: python3 tools/xcmp.py <pasta> <sala> [x0,y0,x1,y1]"""
import sys
import numpy as np
from PIL import Image
d, room = sys.argv[1], sys.argv[2]
box = tuple(int(v) for v in sys.argv[3].split(',')) if len(sys.argv) > 3 else None
a = Image.open(f'{d}/{room}-performance.png').convert('RGB')
b = Image.open(f'{d}/{room}-extreme.png').convert('RGB')
for name, im in (('performance', a), ('extreme', b)):
    x = np.asarray(im, np.float32) / 255
    l = x @ np.array([0.299, 0.587, 0.114])
    print(f'{name:12s} brilho {l.mean():.3f}  contraste {l.std():.3f}  escuro<0.05 {(l < 0.05).mean():.2f}')
if box:
    ca, cb = a.crop(box), b.crop(box)
    w, h = ca.size
    out = Image.new('RGB', (w * 2 + 6, h), (255, 255, 255))
    out.paste(ca, (0, 0))
    out.paste(cb, (w + 6, 0))
    out.save(f'{d}/{room}-cmp.png')
    print('recorte', f'{d}/{room}-cmp.png')

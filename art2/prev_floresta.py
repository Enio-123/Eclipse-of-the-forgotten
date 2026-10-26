"""Prévia de uma sala da floresta: céu em degradê, a camada dos pinheiros e o terreno (1x), ampliada.
uso: python3 prev_floresta.py <sala> <saida.png> [x0 y0 x1 y1 em tiles] [--2x]"""
import sys
import numpy as np
from PIL import Image
args = [a for a in sys.argv[1:] if not a.startswith('--')]
name, out = args[0], args[1]
two = '--2x' in sys.argv
suf = '-2x' if two else ''
ter = Image.open(f'hd_floresta/terreno-{name}{suf}.png').convert('RGBA')
pin = Image.open(f'hd_floresta/pinhos-{name}{suf}.png').convert('RGBA')
W, H = ter.size
k = 32 if two else 16
yy = np.linspace(0, 1, H)[:, None, None]
sky = (np.array([0x8f, 0xa6, 0xc0]) * (1 - yy) + np.array([0xdf, 0xe8, 0xf2]) * yy).astype(np.uint8)
sky = np.broadcast_to(sky, (H, W, 3))
img = Image.fromarray(np.dstack([sky, np.full((H, W), 255, np.uint8)]), 'RGBA')
img.alpha_composite(pin)
img.alpha_composite(ter)
if len(args) >= 6:
    x0, y0, x1, y1 = [int(float(v) * k) for v in args[2:6]]
    img = img.crop((x0, y0, x1, y1))
if not two:
    img = img.resize((img.width * 2, img.height * 2), Image.NEAREST)
img.convert('RGB').save(out)
print(out, img.size)

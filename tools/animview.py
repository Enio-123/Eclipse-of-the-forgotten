"""Quadros de animações de um atlas lado a lado, com a linha do chão: para conferir poses no olho.
uso: python3 tools/animview.py <atlas.json> <saida.png> anim1,anim2,... [escala]"""
import json, os, sys
from PIL import Image, ImageDraw

path, outp, names = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
S = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
m = json.load(open(path))
im = Image.open(os.path.join(os.path.dirname(path), m['meta']['image']))
sc = float(m.get('scale', 1))
W, H = int(m['frameWidth'] * sc), int(m['frameHeight'] * sc)
oy = m['originY']
rows = []
for n in names:
    a = m['anims'][n]
    cells = []
    for i in range(a['start'], a['start'] + a['count']):
        f = m['frames'][str(i)]
        cell = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        fr = f['frame']
        cell.alpha_composite(im.crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h'])), (f['spriteSourceSize']['x'], f['spriteSourceSize']['y']))
        cells.append(cell)
    rows.append((n, a, cells))
cols = max(len(c) for _, _, c in rows)
out = Image.new('RGBA', (int(cols * W * S), int(len(rows) * H * S)), (26, 30, 44, 255))
d = ImageDraw.Draw(out)
for r, (n, a, cells) in enumerate(rows):
    for i, c in enumerate(cells):
        cc = c.resize((int(W * S), int(H * S)), Image.LANCZOS) if S != 1 else c
        out.alpha_composite(cc, (int(i * W * S), int(r * H * S)))
        gy = int((oy * H) * S + r * H * S)
        d.line([(int(i * W * S), gy), (int((i + 1) * W * S) - 1, gy)], fill=(80, 90, 120, 255))
    d.text((4, int(r * H * S) + 4), f"{n} {a['count']}q {a['fps']}fps", fill=(210, 210, 220, 255))
out.save(outp)
print(out.size)

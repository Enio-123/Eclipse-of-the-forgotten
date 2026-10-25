"""Mostra animações escolhidas de uma folha: python3 sheetview.py out/knight-scythe saida.png anim1,anim2 [escala]"""
import json, sys
from PIL import Image, ImageDraw
base, outp, names = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
S = int(sys.argv[4]) if len(sys.argv) > 4 else 3
sheet = Image.open(base + '.png'); meta = json.load(open(base + '.json'))
W, H, cols = meta['frameWidth'], meta['frameHeight'], meta['columns']
maxn = max(meta['anims'][n]['count'] for n in names)
out = Image.new('RGBA', (maxn * W * S, len(names) * H * S), (24, 28, 42, 255))
d = ImageDraw.Draw(out)
for r, n in enumerate(names):
    a = meta['anims'][n]
    for i in range(a['count']):
        idx = a['start'] + i
        fr = sheet.crop(((idx % cols) * W, (idx // cols) * H, (idx % cols + 1) * W, (idx // cols + 1) * H))
        out.alpha_composite(fr.resize((W * S, H * S), Image.NEAREST), (i * W * S, r * H * S))
        # linha do chão
        gy = int(meta['originY'] * H) * S + r * H * S
        d.line([(i * W * S, gy), ((i + 1) * W * S - 1, gy)], fill=(70, 80, 110, 255))
    d.text((4, r * H * S + 4), n, fill=(200, 200, 210, 255))
out.save(outp)
print(out.size)

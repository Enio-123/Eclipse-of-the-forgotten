# monta cada sala inteira (cada foto no seu lugar do mundo, 1 px por px do mundo) e corta em folhas de
# até 1920x1080 para olhar uma a uma; GAMA=0.6 clareia (salas escuras)
import json, sys, os
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
only = sys.argv[3].split(',') if len(sys.argv) > 3 and sys.argv[3] else None
gama = float(os.environ.get('GAMA', '1'))
os.makedirs(out, exist_ok=True)
idx = json.load(open(os.path.join(src, 'index.json')))
SW, SH = 1920, 1080
lut = [round(255 * (i / 255) ** gama) for i in range(256)] * 3
for room, d in idx.items():
    if only and room not in only: continue
    W, H = int(d['bw']), int(d['bh'])
    full = Image.new('RGB', (W, H), (0, 0, 0))
    for c in d['cells']:
        im = Image.open(os.path.join(src, c['file'])).resize((int(d['vw']), int(d['vh'])), Image.LANCZOS)
        full.paste(im, (int(c['x'] - d['bx']), int(c['y'] - d['by'])))
    if gama != 1: full = full.point(lut)
    full.save(os.path.join(out, f"{room}.jpg"), quality=90)
    nx = max(1, -(-W // SW)); ny = max(1, -(-H // SH))
    n = 0
    for j in range(ny):
        for i in range(nx):
            x0 = 0 if nx == 1 else round(i * (W - SW) / (nx - 1)); y0 = 0 if ny == 1 else round(j * (H - SH) / (ny - 1))
            box = (x0, y0, min(W, x0 + SW), min(H, y0 + SH))
            full.crop(box).save(os.path.join(out, f"{room}-{n}.jpg"), quality=88)
            print(f"{room}-{n}.jpg: tiles x {box[0]//16}..{box[2]//16}, y {box[1]//16}..{box[3]//16}")
            n += 1

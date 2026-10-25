import json, sys
from PIL import Image
sheet = Image.open('knight.png'); meta = json.load(open('knight.json'))
W, H, cols = meta['frameWidth'], meta['frameHeight'], meta['columns']
sel = [a.split(':') for a in sys.argv[2].split(',')]
S = int(sys.argv[3]) if len(sys.argv) > 3 else 4
per = 6
rows = (len(sel) + per - 1) // per
cw, ch = 72, 72  # recorte
out = Image.new('RGBA', (per * cw * S, rows * ch * S), (24, 28, 42, 255))
for k, (name, i) in enumerate(sel):
    a = meta['anims'][name]
    idx = a['start'] + int(i)
    fx, fy = (idx % cols) * W, (idx // cols) * H
    fr = sheet.crop((fx + (W - cw) // 2, fy + H - ch - 4, fx + (W + cw) // 2, fy + H - 4))
    out.alpha_composite(fr.resize((cw * S, ch * S), Image.NEAREST), ((k % per) * cw * S, (k // per) * ch * S))
out.save(sys.argv[1])

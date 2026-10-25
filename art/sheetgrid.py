"""Prévia compacta de uma folha: todos os quadros lado a lado em grade, ampliados."""
import json, sys
from PIL import Image, ImageDraw
name, out = sys.argv[1], sys.argv[2]
scale = int(sys.argv[3]) if len(sys.argv) > 3 else 3
per = int(sys.argv[4]) if len(sys.argv) > 4 else 8
sheet = Image.open(name + '.png').convert('RGBA')
meta = json.load(open(name + '.json'))
fw, fh, cols = meta['frameWidth'], meta['frameHeight'], meta['columns']
frames = []
for an, a in meta['anims'].items():
    for i in range(a['count']):
        idx = a['start'] + i
        fr = sheet.crop(((idx % cols) * fw, (idx // cols) * fh, (idx % cols + 1) * fw, (idx // cols + 1) * fh))
        frames.append((f'{an}{i}', fr))
rows = (len(frames) + per - 1) // per
img = Image.new('RGBA', (per * fw * scale, rows * (fh * scale + 12)), (40, 44, 60, 255))
d = ImageDraw.Draw(img)
for k, (lab, fr) in enumerate(frames):
    x, y = (k % per) * fw * scale, (k // per) * (fh * scale + 12)
    bg = Image.new('RGBA', fr.size, (88, 96, 120, 255) if (k % 2) else (78, 86, 110, 255))
    bg.alpha_composite(fr)
    img.paste(bg.resize((fw * scale, fh * scale), Image.NEAREST), (x, y + 12))
    d.text((x + 3, y), lab, fill=(255, 255, 255, 255))
img.save(out)
print(len(frames), 'quadros')

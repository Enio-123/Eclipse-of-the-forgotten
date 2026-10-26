# junta as capturas das magias numa folha (mira e três instantes por linha)
import os, sys
from PIL import Image, ImageDraw
D = sys.argv[1]
OUT = sys.argv[2]
rows = sys.argv[3].split(',')
cols = ['mira', '0.12', '0.15', '0.3']
W, H = 400, 200
sheet = Image.new('RGB', (W * 4, H * len(rows)), (0, 0, 0))
for r, name in enumerate(rows):
    for c, t in enumerate(cols):
        f = f'{D}/{name}-{t}.png'
        if os.path.exists(f):
            sheet.paste(Image.open(f).convert('RGB').resize((W, H)), (c * W, r * H))
    ImageDraw.Draw(sheet).text((6, r * H + 4), name, fill=(255, 255, 0))
sheet.save(OUT)

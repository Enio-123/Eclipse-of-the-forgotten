import sys
sys.path.insert(0, '.')
from puppet import render, to_image
from knight import build, W, H
from PIL import Image
prims, decals = build({})
px, _ = render(prims, decals, W, H)
img = to_image(px, W, H)
img.save('knight_idle.png')
bg = Image.new('RGBA', (W, H), (29, 34, 50, 255))
bg.alpha_composite(img)
bg.resize((W * 6, H * 6), Image.NEAREST).save('knight_idle_x6.png')

# pré-visualização rápida de alguns quadros da Sombra (traço liso), numa folha de contato
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import ink, sombra
names = sys.argv[2:] or ['idle', 'cleavewind', 'cleave', 'roar']
out = sys.argv[1]
ims = []
for n in names:
    poses = sombra.ANIMS[n][0]
    for p in poses:
        prims, decals = sombra.build(p)
        a = ink.render_frame(prims, decals, sombra.W, sombra.H, style=ink.HK)
        ims.append((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
cols = 6
h, w = ims[0].shape[:2]
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGBA', (cols * w, rows * h), (52, 44, 66, 255))
for j, im in enumerate(ims):
    sheet.alpha_composite(Image.fromarray(im, 'RGBA'), ((j % cols) * w, (j // cols) * h))
sheet.convert('RGB').save(out)
print(len(ims), 'quadros')

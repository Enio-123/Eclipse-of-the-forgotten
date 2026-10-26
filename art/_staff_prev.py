import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import ink, knight, anims
OUT = sys.argv[1]
picks = [('idle', 0), ('run', 2), ('jump', 0), ('attack', None), ('attack_up', None), ('cast_aim', 0), ('cast', None), ('dash', 0)]
for w in anims.STAFFS:
    A = anims.anims_for(w)
    tiles = []
    for name, i in picks:
        poses = A[name][0]
        if i is None:
            i = len(poses) // 2
        prims, decals = knight.build(poses[i], w)
        a = ink.render_frame(prims, decals, knight.W, knight.H, pixel=ink.KNIGHT_PIXEL, style=ink.HK)
        im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        tiles.append(im)
    tw, th = tiles[0].size
    sheet = Image.new('RGBA', (tw * len(tiles), th), (34, 30, 44, 255))
    for j, t in enumerate(tiles):
        sheet.alpha_composite(t, (j * tw, 0))
    sheet = sheet.resize((sheet.width * 2, sheet.height * 2), Image.LANCZOS)
    sheet.save(f'{OUT}/{w}.png')
    print(w, sheet.size, flush=True)

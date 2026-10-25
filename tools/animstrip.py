"""Tira de quadros de uma animação (antes e depois), para comparar no olho.
uso: python3 tools/animstrip.py <atlas_antigo.json> <atlas_novo.json> <anim> <saida.png>"""
import json, os, sys
from PIL import Image


def frames(path, anim):
    m = json.load(open(path))
    im = Image.open(os.path.join(os.path.dirname(path), m['meta']['image']))
    a = m['anims'][anim]
    W, H = m['frameWidth'] * m['scale'], m['frameHeight'] * m['scale']
    out = []
    for i in range(a['start'], a['start'] + a['count']):
        f = m['frames'][str(i)]
        cell = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        fr = f['frame']
        cell.alpha_composite(im.crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h'])), (f['spriteSourceSize']['x'], f['spriteSourceSize']['y']))
        out.append(cell)
    return out, a['fps']


old, fo = frames(sys.argv[1], sys.argv[3])
new, fn = frames(sys.argv[2], sys.argv[3])
W, H = new[0].size
# cada coluna é um instante de tempo igual (o quadro antigo se repete enquanto dura)
cols = len(new)
strip = Image.new('RGBA', (cols * W // 2, H), (26, 30, 44, 255))
strip2 = Image.new('RGBA', (cols * W // 2, H), (26, 30, 44, 255))
for j in range(cols):
    t = j / fn
    k = min(len(old) - 1, int(t * fo + 1e-6))
    strip.alpha_composite(old[k].resize((W // 2, H // 2)), (j * W // 2, 0))
    strip2.alpha_composite(new[j].resize((W // 2, H // 2)), (j * W // 2, 0))
outp = Image.new('RGBA', (cols * W // 2, H), (26, 30, 44, 255))
outp.alpha_composite(strip.crop((0, 0, cols * W // 2, H // 2)), (0, 0))
outp.alpha_composite(strip2.crop((0, 0, cols * W // 2, H // 2)), (0, H // 2))
outp.convert('RGB').save(sys.argv[4])
print(len(old), fo, '->', len(new), fn)

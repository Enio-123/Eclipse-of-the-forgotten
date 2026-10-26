# desenha os mapas ASCII de um arquivo maps.ts em PNG (para conferir as salas)
import re, sys
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
names = sys.argv[3].split(',')
s = open(src).read()
COL = {'#': (70, 76, 92), '-': (160, 120, 70), '^': (230, 230, 255), '~': (40, 90, 160), '_': (170, 210, 235), ';': (120, 170, 210),
       '+': (150, 200, 230), '|': (200, 60, 60), 'T': (30, 110, 60), 't': (60, 150, 80), 'd': (220, 80, 40), 'e': (240, 200, 60),
       'm': (255, 230, 120), 'r': (255, 160, 220), 'R': (255, 120, 0), '$': (255, 215, 0), 'o': (255, 255, 255), '{': (255, 0, 0),
       'X': (255, 0, 255), '@': (255, 166, 60), 's': (150, 140, 130)}
K = 6
for n in names:
    m = re.search(r"export const MAP_%s = \[\n(.*?)\];" % n.upper(), s, re.S)
    rows = re.findall(r"'(.*)'", m.group(1))
    h, w = len(rows), len(rows[0])
    im = Image.new('RGB', (w * K, h * K), (18, 20, 28))
    d = ImageDraw.Draw(im)
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == '.':
                continue
            col = COL.get(c, (200, 200, 200) if c.isdigit() else (255, 255, 255))
            d.rectangle([x * K, y * K, x * K + K - 1, y * K + K - 1], fill=col)
            if c.isdigit():
                d.text((x * K, y * K - 10), c, fill=(255, 255, 0))
    # troncos dos pinheiros: do pé até o alto da sala
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c in 'Ts':
                col = (30, 110, 60) if c == 'T' else (150, 140, 130)
                d.rectangle([x * K + 1, 0, x * K + K - 2, y * K + K - 1], fill=col)
    for x in range(0, w, 10):
        d.line([(x * K, 0), (x * K, 3)], fill=(255, 255, 255))
    im.save(f'{out}/map-{n}.png')
    print(n, w, h)

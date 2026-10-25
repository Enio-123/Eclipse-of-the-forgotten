"""Conjuntos de tiles 16x16 por região (mesma ordem de índices do jogo).

0 = plataforma atravessável, 1 = espinhos, 2.. = bloco sólido: 2 + máscara*3 + variante
máscara: 1 = ar em cima, 2 = ar à direita, 4 = ar embaixo, 8 = ar à esquerda

uso: python3 tiles.py <pasta_saida>
"""
import random, sys
from PIL import Image

T = 16
VARIANTS = 3
COUNT = 2 + 16 * VARIANTS


def rgb(c):
    return ((c >> 16) & 255, (c >> 8) & 255, c & 255, 255)


THEMES = {
    'bridge': dict(
        stone=[0x141824, 0x1e2433, 0x2a3245, 0x384259, 0x48546d, 0x5d6a85],
        hi=0x8592ad, wet=0xa9b6cf, ink=0x07080d,
        moss=[0x1a2a1e, 0x26402a, 0x365a35, 0x4c7642, 0x6a9150],
        course=8, brick=16, mossy=0.55, drip=0.5,
        plank=[0x1d140f, 0x30221a, 0x483325, 0x634834, 0x7f6045], iron=[0x15171d, 0x272a33, 0x40444f, 0x6a6f7c],
    ),
    'catacomb': dict(
        stone=[0x101416, 0x1a2125, 0x252f32, 0x323e40, 0x435152, 0x5a6a68],
        hi=0x75877f, wet=0x9ab3aa, ink=0x050708,
        moss=[0x1a2d1b, 0x24442a, 0x356236, 0x4d8443, 0x6fa653],
        course=8, brick=8, mossy=0.9, drip=0.85,
        plank=[0x1a1410, 0x2a2018, 0x3d2f22, 0x54412f, 0x6c563e], iron=[0x121417, 0x23262b, 0x3a3e45, 0x60656e],
    ),
    'memory': dict(
        stone=[0x3a2416, 0x4d321f, 0x63432a, 0x7a5634, 0x936a40, 0xab8150],
        hi=0xc49a62, wet=0xd8b47a, ink=0x22140c,
        moss=[0x2c5a25, 0x3f7a31, 0x5a9b3d, 0x7fbd4c, 0xaedb69],
        course=0, brick=0, mossy=1.0, drip=0.0,
        plank=[0x3f2716, 0x5a3a21, 0x77502e, 0x96693c, 0xb4844f], iron=[0x4a3a2a, 0x66533e, 0x857057, 0xa99173],
    ),
}


class Tile:
    def __init__(self, img, ox):
        self.img, self.ox = img, ox

    def set(self, x, y, c):
        if 0 <= x < T and 0 <= y < T:
            self.img.putpixel((self.ox + x, y), rgb(c) if isinstance(c, int) else c)

    def clear(self, x, y):
        if 0 <= x < T and 0 <= y < T:
            self.img.putpixel((self.ox + x, y), (0, 0, 0, 0))


def stone_body(t, th, rnd, mask):
    S = th['stone']
    if th['course']:
        course = th['course']
        for row in range(T // course):
            y0 = row * course
            # juntas verticais desta fiada (blocos de larguras variadas)
            if th['brick'] >= 16:
                joints = [rnd.randrange(16)]
            else:
                a = rnd.randrange(0, 6)
                joints = sorted({a, (a + rnd.randrange(5, 8)) % 16, (a + rnd.randrange(10, 13)) % 16})
            for x in range(T):
                for yy in range(course):
                    y = y0 + yy
                    if x in joints or yy == course - 1:
                        c = S[0]
                    else:
                        # posição dentro do bloco para o chanfro
                        left = (x - 1) in joints or (x == 0 and 15 in joints)
                        right = (x + 1) in joints or (x == 15 and 0 in joints)
                        if yy == 0:
                            c = S[4]
                        elif yy == course - 2:
                            c = S[1] if rnd.random() < 0.6 else S[2]
                        elif left:
                            c = S[4] if rnd.random() < 0.7 else S[3]
                        elif right:
                            c = S[2]
                        else:
                            r = rnd.random()
                            c = S[3] if r < 0.72 else S[2] if r < 0.9 else S[4]
                    t.set(x, y, c)
        # lascas e rachaduras
        if rnd.random() < 0.55:
            x, y = rnd.randrange(3, 13), rnd.randrange(1, 6)
            for _ in range(rnd.randrange(3, 7)):
                t.set(x, y, S[1])
                y += 1
                x += rnd.choice((-1, 0, 0, 1))
        for _ in range(rnd.randrange(0, 3)):
            x, y = rnd.randrange(1, 15), rnd.randrange(1, 15)
            t.set(x, y, S[5])
    else:
        # terra das memórias: camadas quentes com pedrinhas e raízes
        for y in range(T):
            for x in range(T):
                r = rnd.random()
                c = S[3] if r < 0.62 else S[2] if r < 0.9 else S[4]
                if y > 10 and r < 0.2:
                    c = S[2]
                t.set(x, y, c)
        for _ in range(3):
            x, y = rnd.randrange(1, 14), rnd.randrange(5, 14)
            t.set(x, y, S[5]); t.set(x + 1, y, S[4]); t.set(x, y + 1, S[1]); t.set(x + 1, y + 1, S[1])
        if rnd.random() < 0.6:
            x, y = rnd.randrange(2, 14), 0
            for _ in range(rnd.randrange(5, 12)):
                t.set(x, y, S[1])
                y += 1
                x += rnd.choice((-1, 0, 1))


def moss_top(t, th, rnd, strength):
    M = th['moss']
    depth = [0] * T
    base = 2 if th['course'] else 4
    for x in range(T):
        if rnd.random() < strength or not th['course']:
            depth[x] = base + rnd.randrange(0, 3)
    # suaviza os tufos
    for _ in range(2):
        depth = [max(depth[x], (depth[x - 1] + depth[(x + 1) % T]) // 2 - 1) if 0 < x < T - 1 else depth[x] for x in range(T)]
    for x in range(T):
        d = depth[x]
        for y in range(d):
            k = y / max(1, d)
            c = M[4] if y == 0 else M[3] if k < 0.35 else M[2] if k < 0.75 else M[1]
            if y == 0 and rnd.random() < 0.25:
                c = M[3]
            t.set(x, y, c)
        if d and d < T:
            t.set(x, d, M[0])
    # flores nas memórias
    if not th['course']:
        for _ in range(rnd.randrange(0, 3)):
            x = rnd.randrange(1, 15)
            col = rnd.choice([0xf4a7c4, 0xfff2dc, 0xffd65e, 0xb7c9ff])
            t.set(x, 1, col)


def wet_edge(t, th, rnd):
    for x in range(T):
        if rnd.random() < 0.3:
            t.set(x, 0, th['wet'])


def draw_solid(img, ox, mask, v, th, theme):
    rnd = random.Random(1000 * (hash(theme) % 997) + mask * 31 + v * 7)
    t = Tile(img, ox)
    stone_body(t, th, rnd, mask)
    S = th['stone']
    top, right, bottom, left = mask & 1, mask & 2, mask & 4, mask & 8
    if top:
        if th['course']:
            for x in range(T):
                t.set(x, 0, th['hi'])
                t.set(x, 1, S[5] if rnd.random() < 0.5 else S[4])
            wet_edge(t, th, rnd)
        if rnd.random() < th['mossy'] or not th['course']:
            moss_top(t, th, rnd, 0.65 if v != 1 else 0.35)
    if bottom:
        for x in range(T):
            t.set(x, 15, th['ink'])
            t.set(x, 14, S[0])
            t.set(x, 13, S[1] if rnd.random() < 0.7 else S[2])
        if th['course'] and rnd.random() < th['drip']:
            M = th['moss']
            for _ in range(rnd.randrange(1, 4)):
                x = rnd.randrange(1, 15)
                ln = rnd.randrange(1, 3)
                for y in range(13 - ln, 15):
                    t.set(x, y, M[1] if y < 14 else M[2])
        if not th['course']:
            for _ in range(rnd.randrange(1, 3)):
                x = rnd.randrange(1, 15)
                for y in range(11, 15):
                    t.set(x, y, S[1])
    if left:
        for y in range(T):
            t.set(0, y, th['ink'])
            t.set(1, y, S[1])
    if right:
        for y in range(T):
            t.set(15, y, th['ink'])
            t.set(14, y, S[2] if y % 3 else S[4])
    if top and left:
        t.clear(0, 0); t.set(1, 0, th['ink']); t.set(0, 1, th['ink'])
    if top and right:
        t.clear(15, 0); t.set(14, 0, th['ink']); t.set(15, 1, th['ink'])
    if bottom and left:
        t.clear(0, 15); t.set(1, 15, th['ink']); t.set(0, 14, th['ink'])
    if bottom and right:
        t.clear(15, 15); t.set(14, 15, th['ink']); t.set(15, 14, th['ink'])


def draw_oneway(img, ox, th, theme):
    t = Tile(img, ox)
    P, I = th['plank'], th['iron']
    if theme == 'catacomb':
        S = th['stone']
        for x in range(T):
            t.set(x, 0, th['hi']); t.set(x, 1, S[4]); t.set(x, 2, S[3]); t.set(x, 3, S[2]); t.set(x, 4, S[1]); t.set(x, 5, th['ink'])
        for x in (3, 10):
            t.set(x, 2, S[1]); t.set(x, 3, S[1])
        M = th['moss']
        for x in (1, 2, 7, 12, 13):
            t.set(x, 0, M[3])
        t.set(12, 1, M[2])
        return
    # tábuas com cintas de ferro
    for x in range(T):
        t.set(x, 0, P[4]); t.set(x, 1, P[3]); t.set(x, 2, P[3] if x % 5 else P[2]); t.set(x, 3, P[2]); t.set(x, 4, P[1]); t.set(x, 5, th['ink'])
    for x in (0, 8):
        for y in range(0, 5):
            t.set(x, y, P[1] if y else P[2])
    for x in (4, 12):
        t.set(x, 2, I[3]); t.set(x, 3, I[1])
    if theme == 'memory':
        M = th['moss']
        for x in (2, 3, 9, 14):
            t.set(x, 0, M[3])


def draw_spikes(img, ox, th, theme):
    t = Tile(img, ox)
    if theme == 'memory':
        # espinheiro
        G = [0x2a3a1c, 0x3f5527, 0x587434, 0x7a9446]
        rnd = random.Random(5)
        for k in range(5):
            x0 = 1 + k * 3
            h = 8 + rnd.randrange(4)
            for y in range(16 - h, 16):
                t.set(x0, y, G[1] if (y + k) % 2 else G[2])
            t.set(x0, 16 - h, G[3])
            t.set(x0 - 1, 16 - h + 3, G[2]); t.set(x0 + 1, 16 - h + 5, G[2])
        for x in range(T):
            t.set(x, 15, G[0])
        return
    light, dark, tip = (0x8c93a8, 0x3a3f52, 0xc4c9d6) if theme == 'bridge' else (0x9c9587, 0x4a443b, 0xd8d0bf)
    for k in range(4):
        bx = k * 4
        h = 11 if k % 2 == 0 else 9
        for row in range(h):
            y = 15 - row
            half = 2 if row < h * 0.35 else 1 if row < h * 0.75 else 0.5
            if half >= 2:
                t.set(bx, y, light); t.set(bx + 1, y, light); t.set(bx + 2, y, dark); t.set(bx + 3, y, dark)
            elif half >= 1:
                t.set(bx + 1, y, light); t.set(bx + 2, y, dark)
            else:
                t.set(bx + 1, y, tip if row == h - 1 else light)
    for x in range(T):
        t.set(x, 15, th['ink'])
    if theme == 'bridge':
        # ferrugem
        for (x, y) in [(1, 13), (5, 12), (9, 14), (13, 13)]:
            t.set(x, y, 0x6b3b26)


def build(theme):
    th = THEMES[theme]
    img = Image.new('RGBA', (COUNT * T, T), (0, 0, 0, 0))
    draw_oneway(img, 0, th, theme)
    draw_spikes(img, T, th, theme)
    for mask in range(16):
        for v in range(VARIANTS):
            draw_solid(img, (2 + mask * VARIANTS + v) * T, mask, v, th, theme)
    return img


def preview(theme, img, path):
    # um pequeno terreno de exemplo
    rows = [
        '..........................',
        '..........................',
        '......-----...............',
        '..........................',
        '...........#####..........',
        '..####.....#####....^^^...',
        '..####.....#####..#######.',
        '##########################',
        '##########################',
    ]
    h, w = len(rows), len(rows[0])
    out = Image.new('RGBA', (w * T, h * T), (24, 28, 42, 255) if theme != 'memory' else (150, 200, 235, 255))
    solid = lambda x, y: x < 0 or y < 0 or x >= w or y >= h or rows[y][x] == '#'
    for y in range(h):
        for x in range(w):
            c = rows[y][x]
            if c == '#':
                m = (0 if solid(x, y - 1) else 1) | (0 if solid(x + 1, y) else 2) | (0 if solid(x, y + 1) else 4) | (0 if solid(x - 1, y) else 8)
                idx = 2 + m * VARIANTS + (x * 7 + y) % VARIANTS
            elif c == '-':
                idx = 0
            elif c == '^':
                idx = 1
            else:
                continue
            out.alpha_composite(img.crop((idx * T, 0, idx * T + T, T)), (x * T, y * T))
    out.resize((out.width * 3, out.height * 3), Image.NEAREST).save(path)


if __name__ == '__main__':
    out = sys.argv[1]
    for theme in THEMES:
        img = build(theme)
        img.save(f'{out}/tiles-{theme}.png')
        preview(theme, img, f'tiles-preview-{theme}.png')
    print('ok')

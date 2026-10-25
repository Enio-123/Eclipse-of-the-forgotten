"""Objetos de cenário: postes, estátua, cadafalso, portão, velas, correntes, musgo, espelho, árvores e a figura de capa vermelha.

uso: python3 deco.py <pasta_saida>
"""
import sys, json, math, random
import numpy as np
from PIL import Image
sys.path.insert(0, '.')
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, render, to_image
from paint import Layer, banded, fbm, rgb, quantize_alpha

puppet.RAMPS['statue'] = [0x141823, 0x222836, 0x323a4d, 0x465068, 0x5f6b86]
puppet.RAMPS['scarlet'] = [0x3a0b12, 0x6b1420, 0x9e2230, 0xcc3a3e, 0xeb6356]
# linho mais quente do vestido da figura (nome próprio: 'linen' é o dos outros bonecos)
puppet.RAMPS['dress'] = [0x6b5f55, 0x9c8f80, 0xc8bba6, 0xe6dccb, 0xfaf3e6]
puppet.RAMPS['skin'] = [0x6e4436, 0x9c6450, 0xc98a6e, 0xe5ad8e, 0xf6cdb0]
puppet.RAMPS['hair'] = [0x22150f, 0x3a2418, 0x573823, 0x744d30, 0x92653f]
puppet.RIM_MATS |= {'statue', 'scarlet'}


def C(c, a=255):
    return ((c >> 16) & 255, (c >> 8) & 255, c & 255, a)


class Px:
    def __init__(self, w, h):
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.w, self.h = w, h

    def set(self, x, y, c, a=255):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.im.putpixel((x, y), C(c, a))

    def rect(self, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1)):
            for x in range(int(x0), int(x1)):
                self.set(x, y, c)

    def line(self, x0, y0, x1, y1, c):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / max(1, n)
            self.set(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), c)

    def save(self, p):
        self.im.save(p)


IRON = [0x111318, 0x1c1f27, 0x2c303b, 0x454a57, 0x676d7c]
WOOD = [0x1a110c, 0x2b1d15, 0x41301f, 0x5a432c, 0x765a3c]
STONE = [0x141823, 0x222836, 0x323a4d, 0x465068, 0x5f6b86, 0x7d89a3]


def lamp(out):
    p = Px(14, 48)
    # base
    p.rect(3, 44, 11, 48, IRON[1]); p.rect(3, 44, 11, 45, IRON[3]); p.rect(4, 42, 10, 44, IRON[2])
    # haste
    p.rect(6, 12, 8, 42, IRON[1]); p.rect(7, 12, 8, 42, IRON[3])
    for y in (20, 30):
        p.rect(5, y, 9, y + 1, IRON[2])
    # braço e lanterna
    p.rect(4, 10, 10, 12, IRON[2])
    p.rect(2, 2, 12, 3, IRON[1]); p.rect(3, 0, 11, 2, IRON[2]); p.set(7, 0, IRON[4])
    for x in (2, 11):
        p.rect(x, 3, x + 1, 10, IRON[1])
    p.rect(3, 3, 11, 10, 0xf2a03f); p.rect(4, 4, 10, 9, 0xffc96b); p.rect(6, 5, 8, 8, 0xffe9b8)
    p.rect(7, 3, 8, 10, IRON[1])
    p.rect(2, 10, 12, 11, IRON[1])
    p.save(f'{out}/deco-lamp.png')


def lamp_dark(out):
    # poste apagado e torto (luz morta)
    p = Px(14, 48)
    p.rect(3, 44, 11, 48, IRON[1]); p.rect(3, 44, 11, 45, IRON[3]); p.rect(4, 42, 10, 44, IRON[2])
    p.rect(6, 12, 8, 42, IRON[1]); p.rect(7, 12, 8, 42, IRON[3])
    p.rect(4, 10, 10, 12, IRON[2])
    p.rect(2, 2, 12, 3, IRON[1]); p.rect(3, 0, 11, 2, IRON[2])
    for x in (2, 11):
        p.rect(x, 3, x + 1, 10, IRON[1])
    p.rect(3, 3, 11, 10, 0x1b1d26); p.rect(4, 4, 7, 8, 0x2a2e3a)
    p.line(3, 3, 10, 9, 0x3d4250)
    p.rect(2, 10, 12, 11, IRON[1])
    p.save(f'{out}/deco-lamp-off.png')


def statue(out):
    W, H = 34, 70
    prims, decals = [], []
    cx = 17
    # pedestal
    prims.append(Poly('ped', 'statue', 1.0, [(4, 58), (30, 58), (30, 70), (4, 70)], nf=lambda x, y: norm((-0.4 if x < 17 else 0.2, -0.3, 0.85))))
    prims.append(Poly('pedtop', 'statue', 1.2, [(2, 54), (32, 54), (31, 58), (3, 58)], nf=lambda x, y: norm((0, -0.9, 0.5))))
    # manto
    robe = [(cx - 4, 22), (cx + 4, 22), (cx + 9, 40), (cx + 11, 54), (cx - 11, 54), (cx - 9, 40)]
    prims.append(Poly('robe', 'statue', 2.0, robe, nf=lambda x, y: norm(((x - cx) / 14 + 0.25 * math.sin(x * 1.3), -0.3, 0.8))))
    # cabeça e coroa
    prims.append(Ellipse('head', 'statue', 3.0, (cx, 16), 4.4, 5.0))
    for k, dx in enumerate((-3.5, -1.2, 1.2, 3.5)):
        prims.append(Poly('crown', 'statue', 3.2, [(cx + dx - 1, 12), (cx + dx, 7 - (k % 2) * 2), (cx + dx + 1, 12)], nf=lambda x, y: norm((-0.3, -0.6, 0.7))))
    # braço erguido segurando uma máscara diante do rosto
    prims.append(Capsule('arm', 'statue', 3.4, (cx + 4, 25), (cx + 7, 18), 1.7, 1.5))
    prims.append(Ellipse('mask', 'bone', 3.6, (cx + 5.5, 15.5), 3.2, 4.0))

    def mdec(x, y, cur):
        if 13.4 < y < 14.6 and (cx + 3.6 < x < cx + 5 or cx + 6.2 < x < cx + 7.6):
            return ('void', 1)
        return None

    decals.append(Decal('mask', mdec))
    px, _ = render(prims, decals, W, H)
    im = to_image(px, W, H, outline_col=0x07080d)
    im.save(f'{out}/deco-statue.png')


def scaffold(out):
    p = Px(92, 64)
    D = 30  # altura do tablado
    # estacas e travessas
    for x in (10, 36, 62, 86):
        p.rect(x, D + 4, x + 4, 64, WOOD[1]); p.rect(x, D + 4, x + 1, 64, WOOD[3])
    for k in range(3):
        x0, x1 = 12 + k * 26, 38 + k * 26
        p.line(x0, D + 6, x1, 62, WOOD[2]); p.line(x0, 62, x1, D + 6, WOOD[1])
    # tablado
    p.rect(6, D, 92, D + 5, WOOD[2]); p.rect(6, D, 92, D + 1, WOOD[4]); p.rect(6, D + 4, 92, D + 5, WOOD[0])
    for x in range(6, 92, 9):
        p.rect(x, D, x + 1, D + 4, WOOD[1])
    # escada
    for s in range(5):
        y = D + 6 + s * 6
        x = 6 - s * 3
        p.rect(x - 6, y, x + 2, y + 2, WOOD[3]); p.rect(x - 6, y + 2, x + 2, y + 3, WOOD[0])
    # forca: poste, viga, reforço e corda
    p.rect(80, 0, 84, D, WOOD[2]); p.rect(80, 0, 81, D, WOOD[4])
    p.rect(54, 0, 84, 4, WOOD[2]); p.rect(54, 0, 84, 1, WOOD[4])
    p.line(70, 4, 80, 14, WOOD[3]); p.line(71, 4, 80, 13, WOOD[1])
    for y in range(4, 16):
        p.set(60, y, 0x8a7a5c if y % 2 else 0x6d6048)
    for (x, y) in [(59, 16), (61, 16), (58, 17), (62, 17), (58, 18), (62, 18), (59, 19), (61, 19), (60, 20)]:
        p.set(x, y, 0x8a7a5c)
    # cepo do carrasco
    p.rect(30, D - 7, 44, D, WOOD[1]); p.rect(30, D - 7, 44, D - 6, WOOD[3]); p.rect(35, D - 7, 39, D - 5, WOOD[0])
    p.save(f'{out}/deco-scaffold.png')


def gate(out):
    W, H = 120, 136
    p = Px(W, H)
    cx = W // 2
    # moldura de pedra em ogiva
    for y in range(H):
        for x in range(W):
            dx = abs(x + 0.5 - cx)
            R = 64
            yc = 64
            if y >= yc:
                inner = dx < 34
                outer = dx < 50
            else:
                a = math.hypot(x + 0.5 - (cx - (R - 34)), y + 0.5 - yc) <= R - 0
                b = math.hypot(x + 0.5 - (cx + (R - 34)), y + 0.5 - yc) <= R - 0
                inner = a and b and y > 8
                a2 = math.hypot(x + 0.5 - (cx - (R - 50)), y + 0.5 - yc) <= R + 2
                b2 = math.hypot(x + 0.5 - (cx + (R - 50)), y + 0.5 - yc) <= R + 2
                outer = a2 and b2
            if outer and not inner:
                ang = math.atan2(y - yc, x - cx)
                v = (math.floor(ang * 7) % 2 == 0) if y < yc else ((y // 12) % 2 == 0)
                c = STONE[3] if v else STONE[2]
                if dx > 47 or (y < yc and not (math.hypot(x + 0.5 - (cx - 14), y + 0.5 - yc) <= R + 0 and math.hypot(x + 0.5 - (cx + 14), y + 0.5 - yc) <= R + 0)):
                    c = STONE[1]
                p.set(x, y, c)
    # grade levadiça meio erguida
    for x in range(cx - 33, cx + 34, 6):
        for y in range(10, 46):
            p.set(x, y, IRON[2] if (x // 6) % 2 else IRON[1])
            p.set(x + 1, y, IRON[1])
    for y in range(14, 46, 8):
        for x in range(cx - 33, cx + 34):
            p.set(x, y, IRON[2])
    for x in range(cx - 33, cx + 34, 6):
        p.set(x, 46, IRON[3]); p.set(x, 47, IRON[3]); p.set(x, 48, IRON[2])
    # tochas
    for tx in (cx - 46, cx + 45):
        p.rect(tx - 1, 74, tx + 2, 88, IRON[1])
        p.rect(tx - 3, 70, tx + 4, 74, IRON[2])
        p.rect(tx - 2, 64, tx + 3, 70, 0xf2a03f); p.rect(tx - 1, 62, tx + 2, 68, 0xffc96b); p.set(tx, 61, 0xffe9b8)
    p.save(f'{out}/deco-gate.png')


def candles(out):
    sheet = Image.new('RGBA', (32, 14), (0, 0, 0, 0))
    for f in range(2):
        p = Px(16, 14)
        for (x, h) in ((3, 6), (7, 9), (11, 5)):
            p.rect(x, 14 - h, x + 2, 14, 0xd8cfb8); p.rect(x + 1, 14 - h, x + 2, 14, 0xb8ad94)
            p.set(x, 14 - h + 2, 0xefe7d2)
            fl = 1 if (f + x) % 2 else 0
            p.set(x + fl, 14 - h - 1, 0xffc96b); p.set(x + fl, 14 - h - 2, 0xffe9b8)
            p.set(x + 1 - fl, 14 - h - 1, 0xf2a03f)
        p.rect(1, 13, 15, 14, 0x6c6150)
        sheet.alpha_composite(p.im, (f * 16, 0))
    sheet.save(f'{out}/deco-candles.png')


def supports(out):
    # corrente (repete na vertical)
    p = Px(5, 8)
    for y in range(0, 5):
        p.set(1, y, IRON[3]); p.set(3, y, IRON[2])
    p.set(2, 0, IRON[3]); p.set(2, 4, IRON[2])
    for y in range(4, 8):
        p.set(2, y, IRON[3] if y % 2 else IRON[4])
    p.save(f'{out}/deco-chain.png')
    # viga de madeira (repete na vertical)
    p = Px(6, 16)
    for y in range(16):
        p.set(0, y, WOOD[0]); p.set(1, y, WOOD[3]); p.set(2, y, WOOD[2]); p.set(3, y, WOOD[2] if y % 5 else WOOD[1]); p.set(4, y, WOOD[1]); p.set(5, y, WOOD[0])
    p.rect(0, 6, 6, 8, IRON[2]); p.rect(0, 6, 6, 7, IRON[3])
    p.save(f'{out}/deco-post.png')
    # mão-francesa (escora diagonal da parede até a plataforma), apontando para a direita
    p = Px(16, 16)
    for i in range(16):
        y = i
        x = i
        p.set(x, 15 - y, WOOD[3]); p.set(x + 1, 15 - y, WOOD[2]); p.set(x, 15 - y + 1, WOOD[1])
    p.rect(0, 0, 3, 16, WOOD[2]); p.rect(0, 0, 1, 16, WOOD[3])
    p.rect(0, 0, 16, 2, WOOD[2]); p.rect(0, 0, 16, 1, WOOD[4])
    p.save(f'{out}/deco-bracket.png')
    # gancho/argola no teto
    p = Px(7, 4)
    p.rect(0, 0, 7, 2, IRON[2]); p.rect(2, 2, 5, 4, IRON[3]); p.set(3, 3, IRON[1])
    p.save(f'{out}/deco-anchor.png')


def balustrade(out):
    # balaustrada de pedra da ponte (repete na horizontal)
    p = Px(16, 14)
    p.rect(0, 0, 16, 3, STONE[3]); p.rect(0, 0, 16, 1, STONE[5]); p.rect(0, 2, 16, 3, STONE[1])
    p.rect(0, 12, 16, 14, STONE[2]); p.rect(0, 12, 16, 13, STONE[4])
    for bx in (2, 10):
        for y in range(3, 12):
            w = 2 if y in (3, 4, 10, 11) else 3 if y in (6, 7, 8) else 2
            for x in range(bx, bx + w + 1):
                p.set(x, y, STONE[3] if x == bx else STONE[2])
            p.set(bx + w + 1, y, STONE[1])
    p.save(f'{out}/deco-balustrade.png')
    # trecho quebrado
    q = Px(16, 14)
    q.rect(0, 12, 16, 14, STONE[2]); q.rect(0, 12, 16, 13, STONE[4])
    for y in range(6, 12):
        for x in range(2, 5):
            q.set(x, y, STONE[2] if x > 2 else STONE[3])
    q.rect(0, 4, 6, 6, STONE[3]); q.set(6, 5, STONE[2])
    q.save(f'{out}/deco-balustrade-broken.png')


def moss_strands(out):
    # 12 fios de musgo de comprimentos variados (quadros de 4x30)
    rs = random.Random(3)
    sheet = Image.new('RGBA', (48, 30), (0, 0, 0, 0))
    M = [0x1a2d1b, 0x24442a, 0x356236, 0x4d8443, 0x6fa653]
    for k in range(12):
        ln = rs.randint(6, 29)
        x = k * 4 + 1
        for y in range(ln):
            t = y / ln
            c = M[3] if y < 2 else M[2] if t < 0.5 else M[1]
            sheet.putpixel((x, y), C(c))
            if y < ln * 0.6 and rs.random() < 0.35:
                sheet.putpixel((x + rs.choice((-1, 1)), y), C(M[2]))
        sheet.putpixel((x, ln - 1), C(M[0]))
    sheet.save(f'{out}/deco-moss.png')


def tufts(out):
    # tufos de capim/samambaia por região (6 quadros 12x8)
    themes = {
        'bridge': ([0x1c2a20, 0x2a3e2c, 0x3d5636, 0x557046], None),
        'catacomb': ([0x17291a, 0x234027, 0x335c33, 0x4b7f42], 0x7fd6c9),
        'memory': ([0x3f7a31, 0x5a9b3d, 0x7fbd4c, 0xaedb69], 0xf4a7c4),
    }
    for name, (G, flower) in themes.items():
        rs = random.Random(len(name))
        sheet = Image.new('RGBA', (72, 8), (0, 0, 0, 0))
        for f in range(6):
            for b in range(rs.randint(4, 8)):
                x = rs.randint(1, 10)
                h = rs.randint(2, 7)
                lean = rs.choice((-1, 0, 1))
                for y in range(h):
                    xx = x + (lean if y > h * 0.6 else 0)
                    c = G[3] if y == h - 1 else G[2] if y > h / 2 else G[1]
                    sheet.putpixel((f * 12 + xx, 7 - y), C(c))
            if flower and rs.random() < 0.6:
                fx = f * 12 + rs.randint(2, 9)
                fy = rs.randint(1, 3)
                sheet.putpixel((fx, fy), C(flower))
                if name == 'catacomb':
                    sheet.putpixel((fx, fy + 1), C(0xcfe9e2))
        sheet.save(f'{out}/deco-tufts-{name}.png')


def mirror(out):
    W, H = 48, 80
    p = Px(W, H)
    cx = W // 2
    GOLD = [0x543913, 0x936622, 0xd29f45, 0xf2cd78, 0xfff1c2]
    # pedestal
    p.rect(8, 68, 40, 80, STONE[2]); p.rect(8, 68, 40, 69, STONE[4]); p.rect(12, 64, 36, 68, STONE[3]); p.rect(12, 64, 36, 65, STONE[5])
    # moldura dourada em arco
    for y in range(0, 64):
        for x in range(W):
            dx = x + 0.5 - cx
            top = 20
            if y >= top:
                o = abs(dx) < 19
                i = abs(dx) < 15
            else:
                o = math.hypot(dx, (y + 0.5 - top) * 1.0) < 19
                i = math.hypot(dx, (y + 0.5 - top) * 1.0) < 15
            if o and not i:
                k = 3 if dx < -12 or y < 6 else 2 if dx < 12 else 1
                p.set(x, y, GOLD[k])
            elif i:
                # vidro: brilho de memória (dourado e verde-claro)
                t = (y / 64)
                c = [0xfff1c2, 0xf6e7b5, 0xdfe9c0, 0xbfdfc3, 0x9fcfc4][min(4, int(t * 5))]
                if (x + y) % 7 == 0:
                    c = 0xffffff
                p.set(x, y, c)
    # rachaduras douradas no vidro (kintsugi)
    rs = random.Random(9)
    for start in ((cx - 2, 14), (cx + 4, 30), (cx - 6, 44)):
        x, y = start
        for i in range(rs.randint(10, 18)):
            p.set(x, y, GOLD[1])
            x += rs.choice((-1, 0, 1))
            y += 1
    for (x, y) in ((cx - 8, 22), (cx + 6, 40)):
        for i in range(8):
            p.set(x + i, y + (i % 3 == 0), GOLD[1])
    # ornamentos
    for (x, y) in ((cx, 0), (cx - 19, 62), (cx + 18, 62)):
        p.rect(x - 2, y, x + 3, y + 3, GOLD[3]); p.set(x, y, GOLD[4])
    p.save(f'{out}/deco-mirror.png')


def trees(out):
    from areas_bg import tree
    for name, (w, h, r, pink, seed) in {
        'tree-big': (132, 128, 28, True, 4),
        'tree-pink': (64, 64, 13, True, 7),
        'tree-green': (64, 64, 13, False, 8),
    }.items():
        L = Layer(w, h)
        rs = np.random.RandomState(seed)
        # copa maior: várias árvores sobrepostas formam uma só
        tree(L, w // 2, h - 2, r, pink, rs)
        if name == 'tree-big':
            tree(L, w // 2 - 22, h - 30, int(r * 0.7), pink, rs)
            tree(L, w // 2 + 24, h - 34, int(r * 0.65), pink, rs)
            L.put(L.mask_rect(w // 2 - 3, h - 46, w // 2 + 3, h), 0x6b4a32)
            L.put(L.mask_rect(w // 2 - 3, h - 46, w // 2 - 1, h), 0x8a6444)
            L.put(L.mask_poly([(w // 2 - 8, h), (w // 2 - 3, h - 10), (w // 2 + 3, h - 10), (w // 2 + 9, h)]), 0x5a3c28)
        L.save(f'{out}/deco-{name}.png')


FIGURE_W, FIGURE_H = 36, 52
FIGURE_FEET = (18, 50)


def figure_build(p):
    """A pessoa amada: pequena figura de capa vermelha (capuz escondendo o rosto)."""
    prims, decals = [], []
    hx, hy = 18 + p.get('hx', 0), 21 + p.get('hy', 0)
    sway = p.get('sway', 0)
    # botas e vestido
    prims.append(Capsule('boot', 'leather', 1.0, (15, 46), (16, 50), 1.6, 1.4))
    prims.append(Capsule('boot', 'leather', 1.5, (20, 46), (21, 50), 1.6, 1.4))
    prims.append(Poly('dress', 'dress', 2.0, [(14, 32), (22, 32), (24, 47), (12, 47)], nf=lambda x, y: norm(((x - 18) / 12, -0.2, 0.9))))
    # capa longa
    cape = [(13, 26), (23, 26), (26 + sway * 0.5, 40), (27 + sway, 48), (22, 47), (18, 48.5), (13, 47), (9 + sway * 0.5, 48), (10, 38)]
    prims.append(Poly('cape', 'scarlet', 3.0, cape, nf=lambda x, y: norm(((x - 18) / 14 + 0.3 * math.sin(x * 1.1 + y * 0.2), -0.15, 0.85))))
    # braço (aceno)
    arm = p.get('arm')
    if arm:
        sh = (21, 28)
        el = (sh[0] + arm[0], sh[1] + arm[1])
        hd = (el[0] + arm[2], el[1] + arm[3])
        prims.append(Capsule('sleeve', 'scarlet', 3.5, sh, el, 1.6, 1.4))
        prims.append(Capsule('forearm', 'dress', 3.6, el, hd, 1.3, 1.2))
        prims.append(Ellipse('hand', 'skin', 3.7, hd, 1.4, 1.4))
    # capuz e rosto na sombra
    prims.append(Ellipse('hood', 'scarlet', 4.0, (hx, hy), 7.2, 7.6, bulge=0.9))
    prims.append(Poly('hoodtip', 'scarlet', 3.9, [(hx - 5, hy - 5), (hx - 9, hy + 1), (hx - 10 - sway * 0.3, hy + 6), (hx - 5, hy + 3)],
                      nf=lambda x, y: norm((-0.4, -0.5, 0.75))))
    face = p.get('face', 1)
    fx = hx + 3.0 * face
    prims.append(Ellipse('face', 'void', 4.1, (fx, hy + 1.5), 3.8, 4.6, flat=1))
    prims.append(Ellipse('cheek', 'skin', 4.2, (fx + 1.2 * face, hy + 3.6), 2.2, 1.8))
    prims.append(Ellipse('hair', 'hair', 4.15, (fx - 0.6 * face, hy - 0.8), 3.2, 1.8))
    return prims, decals


FIGURE_FRAMES = {
    'idle': [dict(), dict(hy=0.6, sway=1)],
    'turn': [dict(face=0.3, hx=-0.5), dict(face=-1, hx=-1)],
    'wave': [dict(face=-1, hx=-1, arm=(-1, -5, -1, -5)), dict(face=-1, hx=-1, arm=(-1, -5, -3, -4)), dict(face=-1, hx=-1, arm=(-1, -5, 1, -5))],
}
FIGURE_FPS = {'idle': 2, 'turn': 6, 'wave': 6}
# no formato das outras folhas: nome -> (poses, fps, repete)
FIGURE_ANIMS = {k: (v, FIGURE_FPS[k], k != 'turn') for k, v in FIGURE_FRAMES.items()}


def figure(out):
    W, H = FIGURE_W, FIGURE_H
    FE = FIGURE_FEET
    frames = FIGURE_FRAMES
    cols = 3
    sheet = Image.new('RGBA', (cols * W, len(frames) * H), (0, 0, 0, 0))
    meta = {'frameWidth': W, 'frameHeight': H, 'originX': FE[0] / W, 'originY': FE[1] / H, 'columns': cols, 'anims': {}}
    for row, (name, poses) in enumerate(frames.items()):
        for i, pz in enumerate(poses):
            prims, decals = figure_build(pz)
            px, _ = render(prims, decals, W, H)
            sheet.alpha_composite(to_image(px, W, H, outline_col=0x2a0c10), (i * W, row * H))
        meta['anims'][name] = {'start': row * cols, 'count': len(poses), 'fps': {'idle': 2, 'turn': 6, 'wave': 6}[name], 'loop': name != 'turn'}
    sheet.save(f'{out}/figure.png')
    json.dump(meta, open(f'{out}/figure.json', 'w'), indent=1)


if __name__ == '__main__':
    out = sys.argv[1]
    lamp(out); lamp_dark(out); statue(out); scaffold(out); gate(out); candles(out); supports(out)
    balustrade(out); moss_strands(out); tufts(out); mirror(out); trees(out); figure(out)
    # prévia
    import glob, os
    files = sorted(glob.glob(f'{out}/deco-*.png')) + [f'{out}/figure.png']
    ims = [Image.open(f) for f in files]
    Wp = sum(i.width for i in ims) + 4 * len(ims)
    Hp = max(i.height for i in ims)
    prev = Image.new('RGBA', (Wp, Hp + 4), (40, 46, 66, 255))
    x = 2
    for im in ims:
        prev.alpha_composite(im, (x, 2))
        x += im.width + 4
    prev.resize((prev.width * 2, prev.height * 2), Image.NEAREST).save('deco-preview.png')
    print('ok', len(files))

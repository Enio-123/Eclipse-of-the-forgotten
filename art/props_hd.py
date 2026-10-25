"""Enfeites da Cidade-Catedral no traço liso (ink.py): a porta, o sino da freira, o cofre do dízimo
(fechado e arrombado), a página do diário, o cadafalso da praça, a fonte do claustro e o altar.

Cada função devolve (prims, decals, W, H) em pixels do mundo; ink_sheets.py desenha com 2 pixels
por pixel do mundo e lista as imagens em hd.json. As origens são as que o jogo usa (Fixtures.ts):
porta, cofre, cadafalso, fonte e altar pelos pés; o sino pela argola (ele balança em volta dela);
a página pelo meio.

uso: python3 props_hd.py <pasta_prévia>
"""
import math
import sys
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm

puppet.RAMPS.setdefault('stone', [0x15171f, 0x262a36, 0x3b4152, 0x565e73, 0x7b849a])
puppet.RAMPS.setdefault('parchment', [0x4a3c2a, 0x7c6748, 0xad966e, 0xd6c39a, 0xf1e5c4])
puppet.RAMPS.setdefault('water', [0x0e1e33, 0x1d3e5e, 0x3a6c8e, 0x6fa3bf, 0xb8dcea])
puppet.RAMPS.setdefault('bronze', [0x2e1f10, 0x5a3a18, 0x8a5c26, 0xb98a3e, 0xe4bd72])
puppet.RAMPS.setdefault('rope', [0x33261a, 0x56432c, 0x7c6644, 0xa48e66, 0xc9b78e])
puppet.RAMPS.setdefault('vest', [0x140b19, 0x24132c, 0x381d44, 0x512a60, 0x6e3c7f])
puppet.RAMPS.setdefault('marble', [0x4a4650, 0x726d78, 0x9c97a2, 0xc5c1ca, 0xe8e5ec])
puppet.RAMPS.setdefault('wax', [0x6a5a44, 0x9c8868, 0xc9b690, 0xe6d6b2, 0xfaf0d6])
puppet.RAMPS.setdefault('ember', [0x5a1606, 0xa8340c, 0xe4691a, 0xffa94a, 0xffe2a0])
puppet.SHINY.setdefault('bronze', (0.5, 9))
puppet.RIM_MATS |= {'stone', 'marble', 'bronze', 'vest'}


def flat(nx=0.0, ny=0.0):
    n = norm((nx, ny, 1.0))
    return lambda x, y: n


def arch_pts(x0, x1, y_spring, y_top, y_bot, n=10, point=0.0):
    """Contorno de um vão em arco (de baixo à esquerda, subindo, e descendo à direita)."""
    cx = (x0 + x1) / 2
    rx = (x1 - x0) / 2
    pts = [(x0, y_bot), (x0, y_spring)]
    for i in range(1, n):
        a = math.pi - math.pi * i / n
        px = cx + math.cos(a) * rx
        # arco quebrado: as duas metades sobem até uma ponta
        py = y_spring - math.sin(a) * (y_spring - y_top) - point * (1 - abs(math.cos(a))) * 0
        pts.append((px, py))
    pts += [(x1, y_spring), (x1, y_bot)]
    return pts


def ring(prims, name, mat, z, c, rx, ry, r, n=14, ang0=0.0):
    """Argola de corda ou de ferro: gomos pequenos em volta de uma elipse (o meio fica vazado)."""
    pts = [(c[0] + math.cos(ang0 + i / n * 2 * math.pi) * rx, c[1] + math.sin(ang0 + i / n * 2 * math.pi) * ry) for i in range(n + 1)]
    for a, b in zip(pts, pts[1:]):
        prims.append(Capsule(name, mat, z, a, b, r, r))


# ---------------------------------------------------------------- porta (32x56, pés no meio)
def door():
    W, H = 32, 56
    prims, decals = [], []
    # moldura de pedra em arco
    frame = arch_pts(0.5, 31.5, 15.0, 0.6, 56.0, n=14)
    prims.append(Poly('frame', 'stone', 0.5, frame, nf=lambda x, y: norm(((x - 16) / 40, -0.25, 0.95))))
    # folha de madeira (tábuas em pé)
    leaf = arch_pts(4.2, 27.8, 16.0, 4.6, 56.0, n=14)
    prims.append(Poly('leaf', 'wood', 1.0, leaf, nf=lambda x, y: norm((0.35 * math.sin((x - 4.2) / 5.9 * math.pi), -0.1, 0.9))))

    def planks(x, y, cur):
        # junta escura entre as tábuas e veio mais claro no meio de cada uma
        u = (x - 4.2) / 5.9
        f = u - math.floor(u)
        if f < 0.09 and y > 6:
            return ('wood', 0)
        if abs(f - 0.55) < 0.05 and int(y * 0.7) % 5 == 0:
            return ('wood', 3)
        return None
    decals.append(Decal('leaf', planks))
    # aduelas da moldura: juntas entre as pedras do arco
    def joints(x, y, cur):
        dx, dy = x - 16, y - 15
        r = math.hypot(dx, dy)
        if y < 15 and r > 12.2:
            a = math.atan2(dy, dx)
            k = (a + math.pi) / math.pi * 7
            if abs(k - round(k)) < 0.07:
                return ('stone', 0)
        if y >= 15 and (x < 4 or x > 28) and int(y) % 9 == 0:
            return ('stone', 1)
        return None
    decals.append(Decal('frame', joints))
    # ferragens: duas faixas com cravos, argola e espelho da fechadura
    for yb in (24.0, 43.0):
        prims.append(Capsule('band', 'steel', 2.0, (4.6, yb), (27.4, yb), 1.05, 1.05, flat=2))
        for xb in (7.0, 13.0, 19.0, 25.0):
            prims.append(Ellipse('nail', 'steel', 2.1, (xb, yb), 0.75, 0.75))
    prims.append(Poly('plate', 'steel', 2.0, [(19.4, 29.0), (23.2, 29.0), (23.6, 35.0), (19.0, 35.0)], nf=lambda x, y: norm((0.2, -0.4, 0.9))))
    prims.append(Ellipse('keyhole', 'void', 2.2, (21.3, 31.0), 0.65, 0.85))
    prims.append(Capsule('keyhole', 'void', 2.2, (21.3, 31.4), (21.3, 33.2), 0.35, 0.35))
    ring(prims, 'pull', 'steel', 2.3, (21.3, 38.3), 2.2, 2.6, 0.55, n=12, ang0=-math.pi / 2)
    # degrau
    prims.append(Capsule('step', 'stone', 2.5, (1.6, 55.0), (30.4, 55.0), 1.1, 1.1, flat=3))
    return prims, decals, W, H


# ---------------------------------------------------------------- sino (26x28, argola em cima)
def bell():
    import sineiro
    W, H = 26, 28
    prims, decals = [], []
    sineiro.bell(prims, decals, 'bell', (13.0, 15.0), 0.0, 0.8, 1.0, slit=False)
    return prims, decals, W, H


# ---------------------------------------------------------------- cofre do dízimo (24x18, pés)
def cache(open_=False):
    W, H = 24, 18
    prims, decals = [], []
    body = [(1.4, 7.0), (22.6, 7.0), (22.0, 17.6), (2.0, 17.6)]
    prims.append(Poly('box', 'wood', 1.0, body, nf=lambda x, y: norm(((x - 12) / 30, 0.1, 0.95))))
    if open_:
        # tampa arrombada caída para trás e a boca vazia
        prims.append(Poly('lid', 'wood', 0.6, [(2.6, 7.4), (21.4, 7.4), (19.6, 1.6), (4.8, 0.6)], nf=lambda x, y: norm((0.0, -0.8, 0.6)), shade=0.8))
        prims.append(Capsule('hinge', 'gold', 0.7, (6.0, 7.2), (18.0, 7.2), 0.55, 0.55))
        prims.append(Poly('mouth', 'void', 1.5, [(2.6, 7.0), (21.4, 7.0), (20.6, 9.6), (3.4, 9.6)], nf=flat()))
        prims.append(Ellipse('coin', 'gold', 1.6, (15.2, 9.2), 1.5, 0.7))
    else:
        lid = [(0.8, 7.4), (23.2, 7.4), (22.4, 3.6), (18.0, 1.6), (6.0, 1.6), (1.6, 3.6)]
        prims.append(Poly('lid', 'wood', 1.2, lid, nf=lambda x, y: norm(((x - 12) / 26, -0.7, 0.7))))
        prims.append(Capsule('slot', 'void', 1.4, (9.6, 3.2), (14.4, 3.2), 0.45, 0.45))
        prims.append(Poly('lock', 'gold', 2.0, [(10.0, 7.0), (14.0, 7.0), (14.4, 12.4), (12.0, 13.6), (9.6, 12.4)], nf=lambda x, y: norm((0.1, -0.3, 0.95))))
        prims.append(Ellipse('keyhole', 'void', 2.1, (12.0, 9.6), 0.6, 0.8))
    for xb in (5.0, 19.0):
        prims.append(Capsule('band', 'gold', 1.9, (xb, 7.6 if open_ else 2.2), (xb, 17.2), 0.95, 0.95, flat=2))
    prims.append(Capsule('rim', 'gold', 1.8, (1.6, 7.2), (22.4, 7.2), 0.7, 0.7, flat=2))

    def grain(x, y, cur):
        if cur and cur[0] == 'wood' and int(y * 1.3 + x * 0.12) % 4 == 0 and y > 8.5:
            return ('wood', max(0, cur[1] - 1))
        return None
    decals.append(Decal('box', grain))
    return prims, decals, W, H


# ---------------------------------------------------------------- página do diário (10x12, meio)
def page():
    W, H = 10, 12
    prims, decals = [], []
    sheet = [(0.8, 0.8), (8.0, 0.6), (9.3, 2.2), (9.0, 11.2), (1.2, 11.4), (0.5, 6.0)]
    prims.append(Poly('page', 'parchment', 1.0, sheet, nf=lambda x, y: norm((0.25 * math.sin(y * 0.6), -0.3, 0.9))))
    # ponta dobrada
    prims.append(Poly('fold', 'parchment', 1.2, [(8.0, 0.6), (9.3, 2.2), (7.8, 2.4)], nf=lambda x, y: norm((0.6, 0.4, 0.7)), shade=0.8))

    def lines(x, y, cur):
        for k, (y0, x1) in enumerate(((3.4, 7.2), (5.4, 6.6), (7.4, 7.4), (9.2, 5.2))):
            if abs(y - y0 - 0.15 * math.sin(x * 2.1 + k)) < 0.38 and 2.0 < x < x1:
                return ('parchment', 0 if k else 1)
        return None
    decals.append(Decal('page', lines))
    return prims, decals, W, H


# ---------------------------------------------------------------- cadafalso (160x136, pés no meio)
def gallows():
    """O cadafalso da praça: duas traves altas que saem do tablado (o tablado é a plataforma da
    sala), a viga em cima, mãos-francesas e a corda com o laço, longe do santuário do meio."""
    W, H = 160, 136
    cx = W / 2
    deck = H - 49        # altura do tablado (a plataforma fica 3 tiles acima do chão)
    prims, decals = [], []

    def post_n(x0):
        return lambda x, y: norm(((x - x0) / 4.2 * 0.8, 0.0, 0.7))
    for dx in (-60.0, 60.0):
        x = cx + dx
        prims.append(Poly('post', 'wood', 1.0, [(x - 3.4, deck + 2), (x - 3.0, 12), (x + 3.0, 12), (x + 3.4, deck + 2)], nf=post_n(x)))
        # cunhas no pé, presas no tablado
        prims.append(Poly('wedge', 'wood', 1.1, [(x - 7.5, deck + 2), (x - 3.2, deck - 8), (x - 3.2, deck + 2)], nf=lambda xx, yy: norm((-0.6, -0.6, 0.6))))
        prims.append(Poly('wedge', 'wood', 1.1, [(x + 7.5, deck + 2), (x + 3.2, deck - 8), (x + 3.2, deck + 2)], nf=lambda xx, yy: norm((0.6, -0.6, 0.6))))
        # mão-francesa entre a trave e a viga
        sgn = 1 if dx < 0 else -1
        prims.append(Capsule('brace', 'wood', 0.9, (x + sgn * 2.0, 34.0), (x + sgn * 20.0, 15.0), 1.7, 1.7))
    # viga de cima, um pouco mais comprida que as traves
    prims.append(Poly('beam', 'wood', 1.5, [(cx - 70, 9.0), (cx + 70, 9.0), (cx + 71.5, 16.0), (cx - 71.5, 16.0)], nf=lambda x, y: norm((0.0, (y - 12.5) / 6, 0.8))))
    for dx in (-60.0, 60.0):
        for yy in (11.0, 14.2):
            prims.append(Ellipse('peg', 'steel', 1.7, (cx + dx - 1.6 + (yy - 11) * 0.9, yy), 0.7, 0.7))

    def grain(x, y, cur):
        if cur is None or cur[0] != 'wood':
            return None
        if int(x * 0.9 + math.sin(y * 0.21) * 2.4) % 7 == 0 and cur[1] > 0:
            return ('wood', cur[1] - 1)
        return None
    decals.append(Decal('post', grain))
    decals.append(Decal('beam', lambda x, y, cur: ('wood', max(0, cur[1] - 1)) if cur and int(y * 1.4 + math.sin(x * 0.11) * 2) % 5 == 0 else None))
    # corda: desce da viga, enrola no nó e fecha o laço
    rx = cx + 38
    prims.append(Capsule('rope', 'rope', 2.0, (rx, 15.0), (rx + 0.4, 46.0), 0.75, 0.75))
    for i in range(5):
        prims.append(Ellipse('knot', 'rope', 2.2, (rx + 0.3, 44.0 + i * 1.6), 1.7, 1.0))
    ring(prims, 'noose', 'rope', 2.1, (rx + 0.6, 57.0), 4.4, 6.2, 0.7, n=16, ang0=-math.pi / 2)
    return prims, decals, W, H


# ---------------------------------------------------------------- fonte do claustro (96x72, pés)
def fountain():
    """Fonte octogonal do jardim das irmãs: bacia larga de pedra, coluna com uma taça em cima e a
    água caindo em fios da taça para a bacia."""
    W, H = 96, 72
    cx = W / 2
    prims, decals = [], []
    # bacia de baixo: frente, borda e a água dentro
    prims.append(Poly('basin', 'stone', 1.0, [(6, 50), (90, 50), (86, 71.5), (10, 71.5)], nf=lambda x, y: norm(((x - cx) / 60, 0.15, 0.95))))
    prims.append(Ellipse('water', 'water', 0.8, (cx, 49.5), 40.0, 4.6, flat=2))
    prims.append(Capsule('lip', 'marble', 1.4, (5.0, 50.0), (91.0, 50.0), 2.1, 2.1, flat=3))
    # painéis da bacia (as faces do octógono)
    def panels(x, y, cur):
        for px in (26.0, 48.0, 70.0):
            if abs(x - px - (y - 60) * (px - cx) / 120) < 0.6 and y > 53:
                return ('stone', 1)
        if abs(y - 68.2) < 0.55:
            return ('stone', 1)
        return None
    decals.append(Decal('basin', panels))
    # coluna e taça
    prims.append(Poly('column', 'marble', 0.6, [(cx - 3.6, 49.0), (cx - 2.8, 22.0), (cx + 2.8, 22.0), (cx + 3.6, 49.0)], nf=lambda x, y: norm(((x - cx) / 4.0 * 0.85, 0.0, 0.6))))
    prims.append(Ellipse('knob', 'marble', 0.7, (cx, 36.0), 4.4, 2.2))
    prims.append(Poly('cup', 'marble', 1.2, [(cx - 15, 16.5), (cx + 15, 16.5), (cx + 8.0, 22.5), (cx - 8.0, 22.5)], nf=lambda x, y: norm(((x - cx) / 22, 0.45, 0.85))))
    prims.append(Capsule('cuplip', 'marble', 1.3, (cx - 15.5, 16.2), (cx + 15.5, 16.2), 1.4, 1.4, flat=3))
    prims.append(Ellipse('cupwater', 'water', 1.25, (cx, 15.6), 13.0, 1.6, flat=2))
    # bico e jorro em cima, fios de água caindo da taça
    prims.append(Ellipse('spout', 'marble', 1.3, (cx, 12.6), 2.2, 2.6))
    prims.append(Capsule('jet', 'water', 1.4, (cx, 11.0), (cx, 3.2), 0.9, 0.55))
    for side in (-1, 1):
        for k, (dx, sag) in enumerate(((13.5, 0.0), (10.0, 1.4))):
            a = (cx + side * dx, 17.4)
            pts = [a]
            for i in range(1, 7):
                t = i / 6
                pts.append((a[0] + side * (3.5 + k) * t, a[1] + (48.0 - a[1] + sag) * t * t))
            for p, q in zip(pts, pts[1:]):
                prims.append(Capsule('fall', 'water', 1.5 + k * 0.01, p, q, 0.6, 0.5))
    return prims, decals, W, H


# ---------------------------------------------------------------- altar do dízimo (72x48, pés)
def altar():
    """Altar de pedra com o pano roxo do Arcebispo, a bandeja das moedas no meio e duas velas."""
    W, H = 72, 48
    cx = W / 2
    prims, decals = [], []
    # degrau e a mesa de pedra
    prims.append(Poly('step', 'stone', 0.5, [(0.6, 41.0), (71.4, 41.0), (71.4, 47.8), (0.6, 47.8)], nf=lambda x, y: norm((0.0, -0.4 if y < 43 else 0.2, 0.9))))
    prims.append(Poly('table', 'marble', 1.0, [(7, 20), (65, 20), (63, 41.5), (9, 41.5)], nf=lambda x, y: norm(((x - cx) / 50, 0.1, 0.95))))
    prims.append(Capsule('top', 'marble', 1.3, (4.5, 19.6), (67.5, 19.6), 2.0, 2.0, flat=3))
    # pano roxo caindo na frente, com a barra de ouro
    cloth = [(18, 19.0), (54, 19.0), (55.5, 33.0), (50.0, 35.5), (36.0, 34.0), (22.0, 35.5), (16.5, 33.0)]
    prims.append(Poly('cloth', 'vest', 1.6, cloth, nf=lambda x, y: norm((0.3 * math.sin((x - 18) / 6.0), 0.05, 0.9))))

    def trim(x, y, cur):
        if 29.5 < y < 31.0 and 17.5 < x < 55:
            return ('gold', 2)
        # cruz bordada no meio
        if abs(x - cx) < 0.8 and 21.5 < y < 28.5:
            return ('gold', 3)
        if abs(y - 23.8) < 0.8 and abs(x - cx) < 3.2:
            return ('gold', 3)
        return None
    decals.append(Decal('cloth', trim))
    # bandeja das moedas e o cálice
    prims.append(Ellipse('tray', 'gold', 2.0, (cx - 9.0, 17.0), 7.4, 1.8, flat=2))
    for i, (dx, dy) in enumerate(((-11.5, -0.6), (-8.0, -1.2), (-5.5, -0.4), (-9.2, -2.4))):
        prims.append(Ellipse('coin', 'gold', 2.1 + i * 0.01, (cx + dx, 16.0 + dy), 1.6, 0.8))
    prims.append(Poly('cup', 'gold', 2.0, [(cx + 6.2, 6.0), (cx + 13.8, 6.0), (cx + 11.6, 11.4), (cx + 8.4, 11.4)], nf=lambda x, y: norm(((x - cx - 10) / 6, 0.2, 0.9))))
    prims.append(Capsule('stem', 'gold', 2.0, (cx + 10.0, 11.2), (cx + 10.0, 16.0), 0.7, 0.7))
    prims.append(Ellipse('foot', 'gold', 2.1, (cx + 10.0, 17.0), 3.2, 1.0, flat=2))
    # velas nas pontas (a chama de verdade é o brilho que o jogo põe por cima)
    for x in (9.5, 62.5):
        prims.append(Capsule('candle', 'wax', 2.0, (x, 17.4), (x, 7.0), 1.6, 1.5, flat=1))
        prims.append(Ellipse('drip', 'wax', 2.05, (x + 0.8, 10.6), 0.8, 1.6))
        prims.append(Ellipse('flame', 'ember', 2.3, (x, 4.6), 1.1, 2.2))
        prims.append(Ellipse('holder', 'gold', 2.2, (x, 17.8), 3.0, 1.1, flat=2))
    return prims, decals, W, H


# nome da imagem no jogo -> desenho
PROPS = {
    'deco-door': door,
    'deco-bell': bell,
    'deco-cache': cache,
    'deco-cache-open': lambda: cache(True),
    'deco-page': page,
    'deco-gallows': gallows,
    'deco-fountain': fountain,
    'deco-altar': altar,
}


if __name__ == '__main__':
    import numpy as np
    from PIL import Image
    import ink
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    only = sys.argv[2:]
    for k, fn in PROPS.items():
        if only and k not in only:
            continue
        prims, decals, W, H = fn()
        a = ink.render_frame(prims, decals, W, H, style=ink.HK)
        im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        bg = Image.new('RGBA', im.size, (30, 34, 48, 255))
        bg.alpha_composite(im)
        z = max(1, 320 // max(W, H))
        bg.resize((im.width * z, im.height * z), Image.LANCZOS).save(f'{out}/{k}.png')
        print(k, im.size)

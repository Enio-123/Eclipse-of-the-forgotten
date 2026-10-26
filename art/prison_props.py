"""Objetos da Prisão Subterrânea no traço liso (ink.py): a alavanca (base e cabo), a folha do
alçapão, a grade de cela (repete na vertical), a argola do gancho, o molho de chaves, a bigorna com
a máscara em brasa, a gaiola que cai do teto, a relíquia do gancho, a Corrente da Carcereira e o
Elo partido.

Cada função devolve (prims, decals, W, H) em pixels do mundo; ink_sheets.py desenha com 2 pixels
por pixel do mundo e lista as imagens em hd.json. As origens são as que o jogo usa (Fixtures.ts):
base da alavanca, bigorna e gaiola pelos pés; o cabo da alavanca pelo pino (embaixo, no meio); o
resto pelo meio. A grade e o alçapão cobrem um tile inteiro.

uso: python3 prison_props.py <pasta_prévia>
"""
import math
import sys
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm

puppet.RAMPS.setdefault('stone', [0x15171f, 0x262a36, 0x3b4152, 0x565e73, 0x7b849a])
puppet.RAMPS['rust'] = [0x1a1311, 0x302220, 0x4a3329, 0x684834, 0x8a6446]
puppet.RAMPS['iron'] = [0x101218, 0x1d2029, 0x30343f, 0x4b505e, 0x737a8b]
puppet.RAMPS['hotmetal'] = [0x4a1206, 0x8c2a08, 0xd85a14, 0xffa040, 0xfff0b8]
puppet.RAMPS.setdefault('keybrass', [0x3a2a10, 0x5e4419, 0x8a6a2a, 0xb8923f, 0xdcc070])
puppet.SHINY.setdefault('iron', (0.45, 12))
puppet.RIM_MATS |= {'stone', 'rust', 'iron'}


def flat(nx=0.0, ny=0.0):
    n = norm((nx, ny, 1.0))
    return lambda x, y: n


def ring(prims, name, mat, z, c, rx, ry, r, n=16, ang0=0.0, gap=None, shade=1.0):
    """Argola: gomos pequenos em volta de uma elipse (o meio fica vazado). gap = (a0, a1) em
    radianos deixa um trecho aberto (elo partido)."""
    pts = []
    for i in range(n + 1):
        a = ang0 + i / n * 2 * math.pi
        pts.append((a, (c[0] + math.cos(a) * rx, c[1] + math.sin(a) * ry)))
    for (a0, p), (a1, q) in zip(pts, pts[1:]):
        if gap and gap[0] <= (a0 + a1) / 2 % (2 * math.pi) <= gap[1]:
            continue
        prims.append(Capsule(name, mat, z, p, q, r, r, shade=shade))


def rod(x0, y0, x1, y1, w):
    """Barra reta de ponta quadrada (Poly) com normal de cilindro: sem as pontas redondas, para
    repetir de um tile para o outro sem emenda."""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1.0
    sx, sy = -dy / L * w, dx / L * w
    pts = [(x0 + sx, y0 + sy), (x1 + sx, y1 + sy), (x1 - sx, y1 - sy), (x0 - sx, y0 - sy)]

    def nf(x, y):
        t = ((x - x0) * -dy / L + (y - y0) * dx / L) / w
        t = max(-1.0, min(1.0, t))
        return norm((t * -dy / L, t * dx / L, math.sqrt(max(0.0, 1 - t * t)) + 0.15))

    return pts, nf


def chain(prims, pts, z, big=1.0, mat='iron'):
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        c = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if i % 2:
            prims.append(Ellipse('link', mat, z, c, 1.7 * big, 0.95 * big, ang=ang, flat=3))
        else:
            prims.append(Ellipse('link', mat, z, c, 1.35 * big, 0.65 * big, ang=ang, flat=1))


def hook(prims, at, d, z, s=1.0, mat='iron'):
    side = (-d[1], d[0])
    if side[0] < 0:
        side = (-side[0], -side[1])
    tip = (at[0] + d[0] * 5.0 * s, at[1] + d[1] * 5.0 * s)
    prims.append(Capsule('hshaft', mat, z, at, tip, 1.2 * s, 1.0 * s))
    bend = (tip[0] + side[0] * 3.2 * s - d[0] * 1.0 * s, tip[1] + side[1] * 3.2 * s - d[1] * 1.0 * s)
    prims.append(Capsule('hbend', mat, z + 0.02, tip, bend, 1.0 * s, 0.85 * s))
    barb = (bend[0] + side[0] * 0.5 * s - d[0] * 3.0 * s, bend[1] + side[1] * 0.5 * s - d[1] * 3.0 * s)
    prims.append(Capsule('hbarb', mat, z + 0.03, bend, barb, 0.85 * s, 0.35 * s))
    prims.append(Ellipse('hring', mat, z - 0.02, at, 1.5 * s, 1.5 * s))


# ---------------------------------------------------------------- alavanca
def lever_base():
    """Base de ferro chumbada no chão (20x10, pés no meio); o pino do cabo fica a 5 px do chão."""
    W, H = 20, 10
    prims, decals = [], []
    plate = [(0.6, 10.0), (19.4, 10.0), (16.6, 6.2), (3.4, 6.2)]
    prims.append(Poly('plate', 'iron', 1.0, plate, nf=lambda x, y: norm(((x - 10) / 30, -0.5, 0.85))))
    for x in (3.4, 16.6):
        prims.append(Ellipse('bolt', 'iron', 1.1, (x, 8.4), 1.0, 0.9, shade=1.2))
    prims.append(Ellipse('hub', 'rust', 1.2, (10.0, 5.0), 3.9, 3.9, bulge=0.7))
    prims.append(Ellipse('pin', 'iron', 1.3, (10.0, 5.0), 1.5, 1.5, shade=1.25))
    return prims, decals, W, H


def lever_handle():
    """Cabo da alavanca (6x26): o pino embaixo no meio (o jogo gira em volta dele)."""
    W, H = 6, 26
    prims, decals = [], []
    pts, nf = rod(3.0, 26.0, 3.0, 6.0, 0.95)
    prims.append(Poly('rod', 'iron', 1.0, pts, nf=nf))
    prims.append(Ellipse('collar', 'rust', 1.1, (3.0, 7.0), 1.9, 1.0))
    prims.append(Capsule('grip', 'wood', 1.2, (3.0, 6.2), (3.0, 1.6), 2.2, 2.0))
    prims.append(Ellipse('cap', 'iron', 1.3, (3.0, 1.4), 1.6, 1.1))
    return prims, decals, W, H


# ---------------------------------------------------------------- alçapão
def trapdoor():
    """Folha do alçapão vista de lado (16x16, a dobradiça à esquerda): tábuas grossas presas por
    duas cintas de ferro."""
    W, H = 16, 16
    prims, decals = [], []
    board = [(0.0, 1.0), (16.0, 1.0), (16.0, 15.0), (0.0, 15.0)]
    prims.append(Poly('board', 'wood', 1.0, board, nf=lambda x, y: norm((0.0, 0.45 * math.sin((y - 1) / 4.6 * math.pi), 0.9))))

    def planks(x, y, cur):
        f = ((y - 1.0) / 4.67) % 1.0
        if f < 0.12:
            return ('wood', 0)
        if abs(f - 0.6) < 0.06 and int(x * 0.8) % 4 == 0:
            return ('wood', 3)
        return None

    decals.append(Decal('board', planks))
    for y in (3.6, 12.4):
        pts, nf = rod(0.0, y, 16.0, y, 1.1)
        prims.append(Poly('strap', 'iron', 1.1, pts, nf=nf))
        for x in (3.0, 9.0, 14.6):
            prims.append(Ellipse('rivet', 'iron', 1.15, (x, y), 0.7, 0.7, shade=1.3))
    # dobradiça na borda de fora
    prims.append(Capsule('hinge', 'rust', 1.2, (0.4, 2.0), (0.4, 14.0), 1.3, 1.3))
    return prims, decals, W, H


# ---------------------------------------------------------------- grade de cela
def cellbars():
    """Um tile de grade de cela (16x16, repete na vertical): duas barras e a travessa no meio."""
    W, H = 16, 16
    prims, decals = [], []
    for x in (4.0, 12.0):
        pts, nf = rod(x, -0.5, x, 16.5, 1.35)
        prims.append(Poly('bar', 'iron', 1.0, pts, nf=nf))

    def pits(x, y, cur):
        # ferrugem escorrendo nas barras
        if (int(y * 1.7 + x * 3) % 7 == 0) and abs(x - round(x / 8) * 8 + 4) < 0.7:
            return ('rust', 2)
        return None

    decals.append(Decal('bar', pits))
    pts, nf = rod(-0.5, 8.0, 16.5, 8.0, 1.0)
    prims.append(Poly('cross', 'rust', 1.1, pts, nf=nf))
    for x in (4.0, 12.0):
        prims.append(Ellipse('knot', 'iron', 1.2, (x, 8.0), 1.8, 1.5, shade=1.15))
    return prims, decals, W, H


# ---------------------------------------------------------------- argola do gancho
def hookring():
    """Argola grossa presa na parede por uma chapa (18x18, pelo meio)."""
    W, H = 18, 18
    prims, decals = [], []
    prims.append(Poly('plate', 'iron', 0.5, [(5.0, 0.5), (13.0, 0.5), (13.4, 5.6), (4.6, 5.6)], nf=flat(0.0, -0.3)))
    for x in (6.4, 11.6):
        prims.append(Ellipse('bolt', 'iron', 0.6, (x, 2.6), 0.8, 0.8, shade=1.3))
    prims.append(Capsule('staple', 'rust', 0.7, (9.0, 3.0), (9.0, 5.8), 1.4, 1.2))
    ring(prims, 'ring', 'iron', 1.0, (9.0, 10.8), 6.2, 6.0, 1.35, n=20)
    return prims, decals, W, H


# ---------------------------------------------------------------- chaves
def keys():
    """Molho de chaves da guarita (20x22, pelo meio): o aro em cima e quatro chaves abertas."""
    W, H = 20, 22
    prims, decals = [], []
    ring(prims, 'kring', 'keybrass', 1.0, (10.0, 5.6), 4.6, 4.2, 0.7, n=18)
    spec = ((-3.0, 11.5, 34), (0.0, 13.5, 2), (3.0, 11.0, -32))
    for i, (dx, ln, a) in enumerate(spec):
        r = math.radians(a)
        d = (math.sin(r), math.cos(r))
        top = (10.0 + dx, 8.6)
        bow = (top[0] + d[0] * 1.8, top[1] + d[1] * 1.8)
        z = 1.1 + i * 0.01
        prims.append(Ellipse('bow%d' % i, 'keybrass', z, bow, 1.9, 1.9, shade=0.9 + 0.1 * (i % 2)))
        prims.append(Ellipse('bowh%d' % i, 'iron', z + 0.001, bow, 0.7, 0.7, shade=0.3))
        bot = (top[0] + d[0] * ln, top[1] + d[1] * ln)
        prims.append(Capsule('shaft%d' % i, 'keybrass', z, (top[0] + d[0] * 3.4, top[1] + d[1] * 3.4), bot, 0.55, 0.5))
        side = (d[1], -d[0]) if a <= 0 else (-d[1], d[0])
        for k, w in ((1.2, 2.2), (3.4, 1.4)):
            b0 = (bot[0] - d[0] * k, bot[1] - d[1] * k)
            prims.append(Capsule('bit%d' % i, 'keybrass', z, b0, (b0[0] + side[0] * w, b0[1] + side[1] * w), 0.7, 0.7))
    return prims, decals, W, H


# ---------------------------------------------------------------- bigorna
def anvil():
    """A bigorna da forja das máscaras num toco de madeira (40x28, pés no meio): o tampo fica a
    22 px do chão e em cima dele a máscara de um condenado, ainda em brasa."""
    W, H = 40, 28
    prims, decals = [], []
    stump = [(10.5, 28.0), (29.5, 28.0), (28.0, 16.5), (12.0, 16.5)]
    prims.append(Poly('stump', 'wood', 0.5, stump, nf=lambda x, y: norm(((x - 20) / 14, -0.15, 0.9))))

    def rings(x, y, cur):
        if abs((x - 20) * 0.35 + math.sin(y * 0.9) * 0.6) < 0.35:
            return ('wood', 1)
        return None

    decals.append(Decal('stump', rings))
    prims.append(Ellipse('stumptop', 'wood', 0.55, (20.0, 16.6), 8.2, 1.4, shade=1.15))
    # corpo da bigorna: pé largo, cintura fina, tampo comprido e o chifre para a direita
    body = [(13.0, 16.8), (27.0, 16.8), (25.6, 14.6), (23.4, 12.6), (23.6, 10.0), (31.0, 9.0), (37.6, 7.4), (31.4, 6.0),
            (6.0, 6.0), (4.0, 7.6), (6.6, 10.0), (16.4, 10.2), (16.6, 12.6), (14.4, 14.6)]
    prims.append(Poly('anvil', 'iron', 1.0, body, nf=lambda x, y: norm(((x - 20) / 50, -0.6 if y < 7.5 else 0.15, 0.8))))

    def face(x, y, cur):
        # o tampo gasto, mais claro, e o furo quadrado da ferramenta
        if y < 6.9 and 6.5 < x < 31.0:
            return ('iron', 4) if int(x) % 6 else ('iron', 3)
        if 8.0 < x < 9.6 and 6.0 <= y < 7.6:
            return ('iron', 0)
        return None

    decals.append(Decal('anvil', face))
    # a máscara em cima: meia casca de ferro com as duas fendas dos olhos, as bordas em brasa
    mask = Ellipse('mask', 'hotmetal', 1.5, (19.0, 4.6), 5.4, 2.8, bulge=0.8)
    prims.append(mask)

    def mask_dec(x, y, cur):
        lx, ly = mask.local(x, y)
        if ly > 1.6:
            return None
        for ex in (-2.1, 2.1):
            if abs(lx - ex) < 1.1 and abs(ly + 0.4) < 0.45:
                return ('iron', 0)
        r = math.hypot(lx / 5.4, ly / 2.8)
        if r < 0.55:
            return ('rust', 2)
        if r < 0.8:
            return ('hotmetal', 1)
        return None

    decals.append(Decal('mask', mask_dec))
    return prims, decals, W, H


# ---------------------------------------------------------------- gaiola
def cage():
    """Gaiola de ferro pendurada (30x36, pés no meio): argola em cima, domo, barras e o fundo."""
    W, H = 30, 36
    prims, decals = [], []
    ring(prims, 'top', 'iron', 1.0, (15.0, 2.6), 2.2, 2.2, 0.8, n=12)
    dome = []
    for i in range(13):
        a = math.pi + math.pi * i / 12
        dome.append((15.0 + math.cos(a) * 14.0, 11.0 + math.sin(a) * 6.4))
    dome += [(29.0, 12.6), (1.0, 12.6)]
    prims.append(Poly('dome', 'iron', 1.0, dome, nf=lambda x, y: norm(((x - 15) / 16, -0.55, 0.8))))
    for x in (4.0, 9.4, 15.0, 20.6, 26.0):
        pts, nf = rod(x, 12.0, x, 33.0, 1.05)
        prims.append(Poly('bar', 'iron', 0.9 + (0.1 if x in (9.4, 20.6) else 0.0), pts, nf=nf))
    for y in (22.6,):
        pts, nf = rod(1.4, y, 28.6, y, 0.8)
        prims.append(Poly('band', 'rust', 1.1, pts, nf=nf))
    base = [(0.6, 32.6), (29.4, 32.6), (28.4, 36.0), (1.6, 36.0)]
    prims.append(Poly('base', 'rust', 1.2, base, nf=lambda x, y: norm(((x - 15) / 30, 0.2, 0.9))))
    return prims, decals, W, H


# ---------------------------------------------------------------- relíquia: gancho de corrente
def relic_hook():
    """A relíquia do Gancho de Corrente (18x18, pelo meio): uma volta de corrente e o gancho."""
    W, H = 18, 18
    prims, decals = [], []
    pts = []
    for i in range(15):
        a = -math.pi * 0.6 + i / 14 * 2 * math.pi * 0.9
        pts.append((8.0 + math.cos(a) * 5.4, 7.0 + math.sin(a) * 4.6))
    chain(prims, pts, 1.0, big=0.85, mat='iron')
    tail = [pts[-1], (12.4, 9.6), (13.0, 11.8)]
    chain(prims, tail, 1.05, big=0.85, mat='iron')
    hook(prims, (13.0, 12.0), (0.0, 1.0), 1.1, s=0.85, mat='iron')
    return prims, decals, W, H


# ---------------------------------------------------------------- relíquia: Esporas do Carrasco
def relic_dash():
    """A relíquia do dash (18x18, pelo meio): o par de esporas de ferro de um carrasco antigo, com a
    roseta em forma de sol eclipsado (raios de latão em volta de um disco escuro) e a correia de couro
    com a fivela. Uma na frente e a outra atrás, mais escura."""
    W, H = 18, 18
    prims, decals = [], []

    def spur(ox, oy, z, shade):
        # a ferradura do calcanhar: meio anel aberto para a frente (onde entra a bota)
        ring(prims, 'heel', 'iron', z, (ox + 5.6, oy + 7.4), 4.4, 3.2, 0.95, n=20, ang0=0.0,
             gap=(math.pi * 0.62, math.pi * 1.38), shade=shade)
        # o pescoço indo para trás, um pouco para baixo, até a roseta
        pts, nf = rod(ox + 9.8, oy + 7.6, ox + 12.8, oy + 9.0, 0.65)
        prims.append(Poly('neck', 'iron', z + 0.05, pts, nf=nf, shade=shade))
        c = (ox + 13.9, oy + 9.5)
        for i in range(8):
            a = i / 8 * 2 * math.pi + 0.2
            tip = (c[0] + math.cos(a) * 3.1, c[1] + math.sin(a) * 3.1)
            prims.append(Capsule('ray', 'keybrass', z + 0.1, c, tip, 0.7, 0.18, shade=shade))
        prims.append(Ellipse('disc', 'keybrass', z + 0.12, c, 1.55, 1.55, flat=3, shade=shade))
        prims.append(Ellipse('eclipse', 'void', z + 0.14, (c[0] + 0.35, c[1] - 0.25), 1.1, 1.1, flat=1))
        # a correia que passa por cima do pé, com a fivela
        pts, nf = rod(ox + 1.4, oy + 5.0, ox + 9.4, oy + 4.4, 0.75)
        prims.append(Poly('strap', 'leather', z + 0.2, pts, nf=nf, shade=shade))
        prims.append(Ellipse('buckle', 'keybrass', z + 0.25, (ox + 4.6, oy + 4.8), 1.0, 0.9, flat=3, shade=shade))
        prims.append(Capsule('tongue', 'iron', z + 0.26, (ox + 4.6, oy + 4.2), (ox + 4.6, oy + 5.4), 0.25, 0.25, flat=2, shade=shade))

    spur(1.6, 0.6, 1.0, 0.7)
    spur(0.0, 3.8, 2.0, 1.0)
    return prims, decals, W, H


# ---------------------------------------------------------------- arma: Corrente da Carcereira
def corrente():
    """A Corrente da Carcereira no chão (32x32, pelo meio): enrolada em duas voltas e o gancho
    grande pendurado."""
    W, H = 32, 32
    prims, decals = [], []
    for r, z in ((10.5, 1.0), (6.6, 1.1)):
        pts = []
        n = int(2 * math.pi * r / 2.6)
        for i in range(n + 1):
            a = -math.pi / 2 + i / n * 2 * math.pi
            pts.append((15.0 + math.cos(a) * r, 14.0 + math.sin(a) * r * 0.86))
        chain(prims, pts, z, big=1.05, mat='iron')
    tail = [(23.6, 19.4), (24.8, 22.0), (25.4, 24.6)]
    chain(prims, tail, 1.2, big=1.05)
    hook(prims, (25.4, 24.8), (0.0, 1.0), 1.25, s=1.05)
    return prims, decals, W, H


# ---------------------------------------------------------------- Elo do Condenado
def elo():
    """Um elo de corrente grosso, partido em cima (20x24, pelo meio)."""
    W, H = 20, 24
    prims, decals = [], []
    ring(prims, 'elo', 'iron', 1.0, (10.0, 12.0), 5.6, 9.2, 1.9, n=26, ang0=-math.pi / 2, gap=(4.55, 5.75))
    # as duas pontas partidas, mais claras e um pouco desencontradas
    for a, dy in ((4.5, -0.6), (5.8, 0.6)):
        c = (10.0 + math.cos(a) * 5.6, 12.0 + math.sin(a) * 9.2 + dy)
        prims.append(Ellipse('broke', 'iron', 1.1, c, 1.6, 1.6, shade=1.35))
    return prims, decals, W, H


PROPS = {
    'deco-lever-base': lever_base,
    'deco-lever-handle': lever_handle,
    'deco-trapdoor': trapdoor,
    'deco-cellbars': cellbars,
    'deco-ring': hookring,
    'item-keys': keys,
    'deco-anvil': anvil,
    'cage': cage,
    'relic-hook': relic_hook,
    'relic-dash': relic_dash,
    'item-corrente': corrente,
    'item-elo': elo,
}


if __name__ == '__main__':
    import ink
    from PIL import Image
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    tiles = []
    for k, fn in PROPS.items():
        prims, decals, W, H = fn()
        a = ink.render_frame(prims, decals, W, H, style=ink.HK)
        im = Image.fromarray((a.clip(0, 1) * 255 + 0.5).astype('uint8'), 'RGBA')
        im.save(f'{out}/{k}.png')
        tiles.append((k, im))
    S = 3
    wsum = sum(im.width * S + 12 for _, im in tiles)
    hmax = max(im.height * S for _, im in tiles) + 12
    sheet = Image.new('RGBA', (wsum, hmax), (36, 42, 52, 255))
    x = 0
    for k, im in tiles:
        sheet.alpha_composite(im.resize((im.width * S, im.height * S), Image.NEAREST), (x + 6, 6))
        x += im.width * S + 12
    sheet.save(f'{out}/prison-props.png')
    print(sheet.size)

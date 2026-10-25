"""A Carcereira: a terceira chefe, a guardiã da Prisão Subterrânea. Alta e larga, de vestido longo
de lã cor de sangue velho até o chão, avental de couro de ferreiro por cima e as mangas
arregaçadas nos braços fortes. O rosto fica atrás de uma grade de ferro presa ao capuz, com duas
brasas no lugar dos olhos; uma trança grisalha desce pelas costas, presa por argolas. No quadril,
o aro enorme com as chaves de todos; atravessada no peito, uma corrente de reserva. A corrente da
luta enrola no braço da frente e termina num gancho. Na forja, ela martela com o malho e, quando
acorda, pendura o malho no cinto.

uso: python3 ink_sheets.py <pasta_assets> carcereira
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot
from rig import rotate_all

puppet.RAMPS['gown'] = [0x140c0c, 0x241414, 0x381f1e, 0x4f2c29, 0x6b3d37]
puppet.RAMPS['hood'] = [0x0c0c10, 0x16161c, 0x23232c, 0x33333f, 0x474755]
puppet.RAMPS['smith'] = [0x1c130d, 0x312218, 0x4d3826, 0x6c5036, 0x8e6c4a]
puppet.RAMPS['ash'] = [0x2a2a30, 0x4a4a52, 0x6f6f78, 0x9898a2, 0xc2c2cc]
puppet.RAMPS['eyeember'] = [0x3a1206, 0x7a2a0c, 0xc8521a, 0xf2913a, 0xffd38a]
puppet.RAMPS['keybrass'] = [0x3a2a10, 0x5e4419, 0x8a6a2a, 0xb8923f, 0xdcc070]
puppet.RIM_MATS |= {'gown', 'hood', 'smith', 'ash'}

W, H = 240, 200
BASE_HIP = (100.0, 150.0)
FEET = (100, 196)
FLOOR = 195.5
# a bigorna fica na frente dela na sala (o jogo solta as faíscas aqui)
ANVIL = (132.0, 174.0)

DEFAULT = dict(
    hip=(0.0, 0.0), lean=0.0, tilt=0.0, hem=0.0, pool=0.0,
    armF=(22.0, 36.0), armB=(-14.0, 30.0),
    # corrente da luta pendurada da mão da frente: ângulo (0 = para baixo) e comprimento; 0 = o jogo desenha
    ca=4.0, cl=70.0,
    # malho: None = pendurado no cinto; um ângulo = na mão da frente (0 = cabo para baixo)
    hammer=None, tongs=False,
    # trança: balanço (graus, + para trás)
    braid=0.0,
    # pés que aparecem na barra do vestido ao andar: (frente, trás) em px para a frente do quadril
    feet=None,
    glow=False, dead=False, drop=False, keysAt=None, rot=0.0, pivot=None, off=(0.0, 0.0),
)
HAND_LEN = (16.0, 15.0)


def P(d):
    p = dict(DEFAULT)
    p.update(d)
    return p


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def dirv(deg):
    a = math.radians(deg)
    return (math.sin(a), math.cos(a))


def unit(v):
    L = math.hypot(*v) or 1e-6
    return (v[0] / L, v[1] / L)


def skeleton(p):
    hip = add(BASE_HIP, p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))
    f = (math.cos(lean), math.sin(lean))
    neck = add(hip, u, 38.0)
    shF = add(add(neck, f, 5.0), u, -4.0)
    shB = add(add(neck, f, -6.5), u, -4.0)
    head = add(add(neck, u, 9.0), f, 2.5)
    up, el = p['armF']
    elbowF = add(shF, dirv(up), HAND_LEN[0])
    handF = add(elbowF, dirv(up + el), HAND_LEN[1])
    upB, elB = p['armB']
    elbowB = add(shB, dirv(upB), HAND_LEN[0])
    handB = add(elbowB, dirv(upB + elB), HAND_LEN[1])
    return dict(hip=hip, lean=lean, u=u, f=f, neck=neck, shF=shF, shB=shB, head=head,
                elbowF=elbowF, handF=handF, elbowB=elbowB, handB=handB)


def turn(p, pt):
    """O ponto já com o giro do corpo inteiro (queda da morte), relativo aos pés."""
    x, y = pt
    if p['rot']:
        piv = p['pivot'] or FEET
        a = math.radians(p['rot'])
        dx, dy = x - piv[0], y - piv[1]
        x = piv[0] + dx * math.cos(a) - dy * math.sin(a) + p['off'][0]
        y = piv[1] + dx * math.sin(a) + dy * math.cos(a) + p['off'][1]
    return [round(x - FEET[0], 1), round(y - FEET[1], 1)]


def points(pose):
    p = P(pose)
    return {'hand': turn(p, skeleton(p)['handF'])}


# ---------- corrente, gancho, chaves e malho ----------
def links(prims, pts, z, big=1.0):
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        c = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if i % 2:
            prims.append(Ellipse('link', 'steel', z, c, 1.9 * big, 1.0 * big, ang=ang, flat=3))
        else:
            prims.append(Ellipse('link', 'steel', z, c, 1.5 * big, 0.7 * big, ang=ang, flat=1))


def hook(prims, at, d, z, s=1.0):
    """Gancho de ferro na ponta: a haste, a curva virada para trás e a argola."""
    side = (-d[1], d[0])
    if side[1] > 0:
        side = (-side[0], -side[1])
    tip = add(at, d, 5.5 * s)
    prims.append(Capsule('hookshaft', 'steel', z, at, tip, 1.3 * s, 1.1 * s))
    bend = add(add(tip, side, 3.4 * s), d, -1.2 * s)
    prims.append(Capsule('hookbend', 'steel', z + 0.02, tip, bend, 1.1 * s, 0.9 * s))
    barb = add(add(bend, side, 0.6 * s), d, -3.0 * s)
    prims.append(Capsule('hookbarb', 'steel', z + 0.03, bend, barb, 0.9 * s, 0.4 * s))
    prims.append(Ellipse('hookring', 'steel', z - 0.02, at, 1.6 * s, 1.6 * s))


def hanging(prims, a, ang, length, z):
    """Corrente pendurada da mão: desce reta na direção do ângulo e, se chega ao chão, deita e
    segue rente até acabar, com o gancho na ponta."""
    d = dirv(ang)
    floor = FLOOR - 1.3
    run = 1.0 if d[0] >= -0.05 else -1.0
    pts = [a]
    x, y = a
    step = 2.6
    rem = length
    while rem > 0:
        if y >= floor - 0.01 or y + d[1] * step >= floor:
            if y < floor:
                # o elo que encosta no chão
                k = (floor - y) / max(d[1], 1e-3)
                x, y = x + d[0] * k, floor
            else:
                x += run * step
        else:
            x, y = x + d[0] * step, y + d[1] * step
        rem -= step
        pts.append((x, y))
    links(prims, pts, z)
    dd = unit((pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1]))
    hook(prims, pts[-1], dd, z + 0.02)


def straight(a, b, n=None):
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    n = n or max(2, int(L / 2.6))
    return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]


def keyring(prims, c, z, loose=False):
    """O aro de latão com as chaves de todos: um anel fino e as chaves abertas em leque."""
    R = 5.6
    prev = None
    for i in range(17):
        a = 2 * math.pi * i / 16
        q = (c[0] + math.cos(a) * R, c[1] + math.sin(a) * R * 0.92)
        if prev is not None:
            prims.append(Capsule('ring', 'keybrass', z, prev, q, 0.6, 0.6, shade=0.9))
        prev = q
    keys = ((-4.6, 10.0, 34), (-2.0, 12.0, 14), (0.6, 11.0, -4), (3.0, 12.5, -20), (5.0, 9.5, -38))
    for i, (dx, ln, a) in enumerate(keys):
        if loose:
            a = 90 + (i * 47) % 70 - 35
        top = (c[0] + dx * 0.8, c[1] + R * 0.75)
        d = dirv(a)
        bot = add(top, d, ln)
        z2 = z + 0.01 + i * 0.004
        sh = 0.8 + (i % 2) * 0.2
        bow = add(top, d, 1.6)
        prims.append(Ellipse('keybow', 'keybrass', z2, bow, 1.6, 1.6, shade=sh))
        prims.append(Ellipse('keybowh', 'void', z2 + 0.001, bow, 0.6, 0.6))
        prims.append(Capsule('key', 'keybrass', z2, add(top, d, 3.0), bot, 0.55, 0.5, shade=sh))
        side = (d[1], -d[0]) if a <= 0 else (-d[1], d[0])
        prims.append(Capsule('bit', 'keybrass', z2, add(bot, d, -1.4), add(add(bot, d, -1.4), side, 2.0), 0.6, 0.6, shade=sh))
        prims.append(Capsule('bit', 'keybrass', z2, add(bot, d, -3.4), add(add(bot, d, -3.4), side, 1.4), 0.5, 0.5, shade=sh))


def hammer_prims(prims, hand, ang, z):
    """Malho de forja: cabo de madeira e cabeça de ferro atravessada na ponta."""
    d = dirv(ang)
    end = add(hand, d, 15.0)
    prims.append(Capsule('handle', 'wood', z, add(hand, d, -2.0), end, 1.0, 1.1))
    side = (-d[1], d[0])
    head_c = add(end, d, 1.6)
    prims.append(Capsule('mallet', 'steel', z + 0.02, add(head_c, side, -4.6), add(head_c, side, 4.2), 2.9, 2.6))
    prims.append(Ellipse('malletface', 'steel', z + 0.03, add(head_c, side, 4.6), 1.4, 2.6, ang=math.atan2(d[1], d[0]), shade=1.1))


# ---------- o corpo ----------
def build(pose):
    p = P(pose)
    k = skeleton(p)
    hip, u, f, neck, shF, shB, head, lean = (k[n] for n in ('hip', 'u', 'f', 'neck', 'shF', 'shB', 'head', 'lean'))
    elbowF, handF, elbowB, handB = k['elbowF'], k['handF'], k['elbowB'], k['handB']
    prims, decals = [], []
    loose = []

    def at(a, b):
        q = add(add(hip, f, a), u, b)
        return (q[0], min(q[1], FLOOR))

    # ---------- braço de trás (fica atrás de tudo) ----------
    def arm(sh, elbow, hand, z, shade, tag):
        prims.append(Capsule('sleeve' + tag, 'gown', z, sh, elbow, 4.6, 4.2, shade=shade))
        prims.append(Ellipse('cuff' + tag, 'gown', z + 0.02, elbow, 4.0, 3.6, shade=shade * 0.85))
        prims.append(Capsule('fore' + tag, 'flesh', z + 0.03, elbow, hand, 3.6, 2.8, shade=shade * 0.95))
        bra = add(elbow, (hand[0] - elbow[0], hand[1] - elbow[1]), 0.55)
        prims.append(Capsule('bracer' + tag, 'leather', z + 0.05, bra, add(hand, (elbow[0] - hand[0], elbow[1] - hand[1]), 0.12), 3.3, 3.0, shade=shade))
        prims.append(Ellipse('hand' + tag, 'flesh', z + 0.08, hand, 3.3, 3.0, shade=shade))

    arm(shB, elbowB, handB, 1.6, 0.7, 'B')
    if p['tongs']:
        # tenaz longa segurando a máscara na bigorna
        tip = (ANVIL[0] - 4.0, ANVIL[1] - 1.0)
        prims.append(Capsule('tongs', 'steel', 1.7, handB, tip, 0.8, 0.6, shade=0.75))
        prims.append(Capsule('tongs', 'steel', 1.72, add(handB, (1.2, -0.6)), add(tip, (2.6, 0.4)), 0.7, 0.5, shade=0.85))

    # ---------- trança grisalha pelas costas, com as argolas ----------
    nape = add(add(head, f, -6.0), u, -4.0)
    # a trança pende quase reta (a gravidade puxa mais que o corpo inclina)
    bang = lean * 0.35 + math.radians(-8.0 - p['braid'])
    bd = (math.sin(bang), math.cos(bang))
    bpts = [add(nape, bd, 4.2 * i) for i in range(9)]
    for i in range(len(bpts) - 1):
        c = ((bpts[i][0] + bpts[i + 1][0]) / 2, (bpts[i][1] + bpts[i + 1][1]) / 2)
        wv = 0.9 if i % 2 else -0.9
        r = 2.7 - i * 0.18
        prims.append(Ellipse('braid', 'ash', 4.4 + i * 0.002, add(c, (bd[1], -bd[0]), wv), r, 2.6, ang=math.atan2(bd[1], bd[0]) + (0.5 if i % 2 else -0.5),
                             shade=0.95 - 0.04 * i))
    for i in (3, 6):
        prims.append(Ellipse('braidring', 'steel', 4.45, bpts[i], 2.4, 1.3, ang=math.atan2(bd[1], bd[0]) + math.pi / 2, flat=2))
    prims.append(Ellipse('braidweight', 'steel', 4.46, bpts[-1], 1.8, 2.0))

    # ---------- vestido longo até o chão (a barra fica no chão mesmo inclinada) ----------
    hem, pool = p['hem'], p['pool']
    gown = [at(-12, 6), at(12, 6), at(16, -10), at(19, -30)]
    n = 10
    x0, x1 = hip[0] + 24 + hem + pool * 12, hip[0] - 24 + hem * 0.5 - pool * 13
    for i in range(n + 1):
        t = i / n
        gown.append((x0 + (x1 - x0) * t, FLOOR - (1.3 if i % 2 else 0.0) - math.sin(math.pi * t) * 0.8))
    gown += [at(-20, -30), at(-16, -10)]

    def gown_n(x, y):
        lx = x - hip[0]
        return norm((0.5 * math.sin(lx * 0.5 + y * 0.05) + lx / 55.0 - 0.1, -0.22, 0.85))

    prims.append(Poly('gown', 'gown', 3.0, gown, nf=gown_n))
    # pés: a ponta da bota aparece na barra quando ela dá o passo
    if p['feet']:
        for j, dx in enumerate(p['feet']):
            if dx is None:
                continue
            c = (hip[0] + dx, FLOOR - 2.2)
            prims.append(Ellipse('boot', 'leather', 3.05 + j * 0.01, c, 5.0, 2.6, shade=0.9 - j * 0.25))

    # ---------- tronco largo: corpete, ombros e a capa curta do capuz ----------
    prims.append(Capsule('torso', 'gown', 3.1, add(hip, u, 5.0), add(neck, u, -5.0), 12.0, 11.0))
    chest = add(add(neck, u, -9.0), f, 2.5)
    prims.append(Ellipse('chest', 'gown', 3.2, chest, 10.6, 9.0, ang=lean))

    # avental de couro de ferreiro: do peito até perto da barra
    apron = [at(-2, 31), at(9, 32), at(14, 20), at(16, 4), at(20, -22), at(22, -40), at(10, -42), at(1, -41), at(-3, -22), at(-4, 4), at(-4, 20)]

    def apron_n(x, y):
        lx, ly = rot((x - hip[0], y - hip[1]), -lean)
        return norm((0.28 * math.sin(lx * 0.45 - ly * 0.08) + lx / 40.0 - 0.05, -0.3, 0.9))

    prims.append(Poly('apron', 'smith', 3.6, apron, nf=apron_n))

    def apron_dec(x, y, cur):
        lx, ly = rot((x - hip[0], y - hip[1]), -lean)
        # costura atravessada, a bainha e as queimaduras de faísca
        if abs(-ly - 12.0 + 0.1 * lx) < 0.5:
            return ('smith', 1)
        if -ly < -38.6:
            return ('smith', 1)
        for cx, cy, r in ((9.0, -8.0, 1.6), (12.0, -24.0, 1.2), (4.0, -30.0, 1.0), (14.0, 2.0, 0.9)):
            if (lx - cx) ** 2 + (-ly - cy) ** 2 < r * r:
                return ('smith', 0)
        return None

    decals.append(Decal('apron', apron_dec))
    # alça do avental subindo para o pescoço
    prims.append(Capsule('strap', 'smith', 3.65, at(1, 31), add(neck, f, 1.0), 1.1, 1.0, shade=0.8))

    # corrente de reserva atravessada no peito, do ombro da frente ao quadril de trás
    links(prims, straight(add(add(neck, f, 6.0), u, -2.0), at(-11, 8)), 3.7, big=0.85)

    # cinto largo, a fivela e o malho pendurado nas costas
    belt = add(hip, u, 6.0)
    prims.append(Capsule('belt', 'leather', 3.8, add(belt, f, -12.4), add(belt, f, 12.6), 2.3, 2.3, shade=0.75))
    prims.append(Ellipse('buckle', 'steel', 3.85, add(belt, f, 7.0), 2.0, 1.9))
    prims.append(Ellipse('buckleh', 'leather', 3.86, add(belt, f, 7.0), 0.9, 0.8, shade=0.5))
    if p['hammer'] is None:
        # o malho pendurado de cabeça para baixo no quadril de trás
        hammer_prims(prims, add(add(belt, f, -9.0), u, 1.0), -math.degrees(lean) - 8.0, 3.75)

    # o aro das chaves no quadril da frente, por cima do avental
    if p['keysAt'] is None:
        keyring(prims, add(add(belt, f, 13.0), u, -4.0), 3.9)
    else:
        n0 = len(prims)
        keyring(prims, p['keysAt'], 0.5, loose=True)
        loose += prims[n0:]

    # ---------- cabeça: capuz de lã escura, a grade de ferro no rosto e os olhos de brasa ----------
    tilt = math.radians(p['tilt'])
    ha = lean + tilt
    hl = lambda q: add(head, rot(q, ha))
    prims.append(Capsule('mantle', 'hood', 4.6, add(add(neck, f, -9.5), u, -3.0), add(add(neck, f, 8.5), u, -3.5), 5.4, 5.0, shade=0.9))
    prims.append(Ellipse('mantleback', 'hood', 4.55, add(add(neck, f, -7.0), u, -9.0), 7.0, 7.5, ang=lean, shade=0.8))
    prims.append(Ellipse('cowl', 'hood', 5.0, hl((-0.6, -0.6)), 8.4, 9.4, ang=ha, bulge=0.85))
    prims.append(Ellipse('cowltop', 'hood', 4.98, hl((-3.2, -5.4)), 5.4, 5.6, ang=ha, shade=0.9))
    grille = Ellipse('grille', 'steel', 5.3, hl((3.6, 0.8)), 5.2, 6.8, ang=ha, bulge=0.35)
    prims.append(grille)
    eye_hi = p['glow']

    def grille_dec(x, y, cur):
        lx, ly = grille.local(x, y)
        # faixa de cima com os rebites e a barra do queixo
        if ly < -4.2:
            if abs((lx + 5) % 2.6 - 1.3) < 0.45 and ly > -5.6:
                return ('steel', 4)
            return None
        if ly > 4.6:
            return None
        # olhos: duas brasas atrás da grade
        for ex in (3.0, 0.2):
            dd = (lx - ex) ** 2 / 1.5 + (ly + 1.3) ** 2 / 0.7
            if dd < 1.0:
                if p['dead']:
                    return ('void', 0)
                return ('eyeember', 4) if eye_hi else ('eyeember', 2)
            if eye_hi and dd < 2.6:
                return ('eyeember', 2)
        # barras verticais e o rosto escuro entre elas
        if abs((lx + 6.0) % 2.2 - 1.1) < 0.55:
            return None
        return ('void', 1)

    decals.append(Decal('grille', grille_dec))

    # ---------- braço da frente com a corrente enrolada, o gancho e o malho ----------
    zF = 6.0
    arm(shF, elbowF, handF, zF, 1.0, 'F')
    fore = unit((handF[0] - elbowF[0], handF[1] - elbowF[1]))
    for i in range(3):
        c = add(elbowF, fore, 3.0 + i * 2.6)
        prims.append(Ellipse('coil', 'steel', zF + 0.06 + i * 0.01, c, 1.3, 4.0, ang=math.atan2(fore[1], fore[0]), flat=3 if i % 2 else 2))
    if p['hammer'] is not None:
        hammer_prims(prims, handF, p['hammer'], zF + 0.1)
    elif p['drop']:
        # caída de vez: a corrente larga no chão na frente
        n0 = len(prims)
        pts = [(hip[0] + 14 + i * 2.6, FLOOR - 1.3 - (0.6 if i % 3 == 1 else 0.0)) for i in range(20)]
        links(prims, pts, 0.4)
        hook(prims, pts[-1], (1.0, 0.0), 0.42)
        loose += prims[n0:]
    elif p['cl']:
        hanging(prims, handF, p['ca'], p['cl'], zF + 0.12)
    # o punho por cima da corrente
    prims.append(Ellipse('fistF', 'flesh', zF + 0.2, handF, 3.3, 3.0))

    pivot = p['pivot'] or FEET
    if p['rot']:
        body = [q for q in prims if q not in loose]
        rb, rd = rotate_all(body, decals, pivot, p['rot'], p['off'])
        return rb + loose, rd
    return prims, decals


# ---------- animações ----------
def work():
    # de costas para a porta, martelando a máscara na bigorna; o primeiro quadro é a batida
    base = dict(lean=24, hip=(2, 4), tongs=True, armB=(34, 26), cl=0, braid=4)
    return [
        dict(base, armF=(20, 10), hammer=-20.0),
        dict(base, armF=(52, 28), hammer=40.0, braid=6),
        dict(base, armF=(140, 16), hammer=-70.0, lean=20, braid=2),
        dict(base, armF=(186, -16), hammer=-140.0, lean=16, tilt=-6, braid=0),
    ]


def rise():
    return [
        # endireita, o malho ainda na mão, e as brasas acendem
        dict(lean=8, hip=(0, 1), armF=(26, 30), hammer=10.0, cl=0, armB=(10, 30), tilt=-14, glow=True, braid=-6),
        # pendura o malho no cinto e solta a corrente do braço
        dict(lean=2, armF=(-10, 70), cl=0, armB=(-30, 70), tilt=-4, glow=True, braid=-2),
        # a corrente cai da mão até o chão
        dict(lean=-2, armF=(30, 34), ca=24, cl=70, armB=(-20, 30), tilt=-8, glow=True, braid=2),
    ]


def roar():
    # braços abertos, a corrente erguida no alto, o capuz para trás
    return [
        dict(armF=(150, 16), ca=160, cl=34, armB=(-150, -10), lean=-10, tilt=-20, hip=(-1, 0), glow=True, hem=-1, braid=12),
        dict(armF=(156, 18), ca=176, cl=34, armB=(-156, -12), lean=-13, tilt=-24, hip=(-2, -0.5), glow=True, hem=1, braid=16),
    ]


def idle():
    out = []
    for i, b in enumerate((0.0, 0.6, 1.2, 0.6)):
        out.append(dict(hip=(0, b), armF=(22, 36 - b * 2), ca=(-4, 2, 6, 2)[i], hem=(0, 0.6, 1.0, 0.4)[i], armB=(-14, 30 - b), braid=b))
    return out


def walk(n=6):
    # passos pesados: a barra balança, a bota aparece e a corrente arrasta no chão
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s = math.sin(ph)
        c = math.cos(ph)
        out.append(dict(hip=(0, -1.2 * abs(c) + 0.8), lean=6, hem=3.0 * s + 1.0, armF=(24 - 8 * s, 34), ca=-18 + 8 * c, cl=72,
                        armB=(-14 + 10 * s, 28), braid=4 + 4 * s, feet=(14 + 8 * s if s > -0.3 else None, -6 - 8 * s if s < 0.3 else None)))
    return out


def lash_windup():
    # a corrente roda para trás por cima do ombro; os olhos acendem
    return [
        dict(armF=(-130, 40), ca=-150, cl=30, armB=(30, 30), lean=-6, hip=(-1.5, 1), hem=-1, glow=True, tilt=-6, braid=8),
        dict(armF=(-160, 30), ca=-200, cl=32, armB=(40, 30), lean=-10, hip=(-2.5, 1.5), hem=-2, glow=True, tilt=-10, braid=12),
    ]


def lash():
    # o braço desce para a frente e a corrente estala reta (o jogo desenha ela)
    return [
        dict(armF=(64, 10), cl=0, armB=(-30, 30), lean=14, hip=(4, 4), hem=3, glow=True, braid=-6),
        dict(armF=(70, 6), cl=0, armB=(-34, 30), lean=16, hip=(5, 5), hem=3.5, glow=True, braid=-10),
    ]


def lash_recover():
    return [
        dict(armF=(46, 24), cl=0, armB=(-24, 30), lean=10, hip=(3, 3), hem=2, braid=-4),
        dict(armF=(30, 34), ca=30, cl=50, armB=(-18, 30), lean=5, hip=(1, 1), hem=1, braid=0),
    ]


def sweep_windup():
    # abaixa e leva a corrente para trás, rente ao chão
    return [
        dict(armF=(-40, 30), ca=-70, cl=50, armB=(30, 40), lean=16, hip=(-2, 8), pool=0.4, hem=-1, glow=True, braid=10),
        dict(armF=(-60, 30), ca=-84, cl=56, armB=(40, 40), lean=20, hip=(-3, 12), pool=0.7, hem=-2, glow=True, braid=14),
    ]


def sweep():
    # a varrida: o corpo lança para a frente e a mão passa baixa (o jogo desenha a corrente)
    return [
        dict(armF=(22, 10), cl=0, armB=(-40, 30), lean=28, hip=(6, 14), pool=0.8, hem=3, glow=True, braid=-8),
        dict(armF=(34, 4), cl=0, armB=(-46, 30), lean=30, hip=(8, 16), pool=1.0, hem=4, glow=True, braid=-12),
    ]


def sweep_recover():
    return [
        dict(armF=(30, 26), cl=0, armB=(-30, 30), lean=18, hip=(4, 8), pool=0.5, hem=2, braid=-6),
        dict(armF=(26, 34), ca=40, cl=56, armB=(-20, 30), lean=10, hip=(2, 4), pool=0.2, hem=1, braid=-2),
    ]


def hook_windup():
    # gira o gancho por cima da cabeça, a corrente curta zunindo
    return [
        dict(armF=(168, 8), ca=230, cl=18, armB=(-30, 40), lean=-6, tilt=-10, hip=(-1, 1), glow=True, braid=8),
        dict(armF=(174, 2), ca=120, cl=18, armB=(-34, 40), lean=-8, tilt=-12, hip=(-1.5, 1), glow=True, braid=10),
    ]


def hook_throw():
    # o braço estica na direção do cavaleiro (o jogo desenha o gancho voando)
    return [
        dict(armF=(100, -6), cl=0, armB=(-40, 30), lean=10, hip=(3, 2), hem=2, glow=True, braid=-6),
        dict(armF=(96, 0), cl=0, armB=(-36, 30), lean=8, hip=(2, 2), hem=1.5, glow=True, braid=-4),
    ]


def yank():
    # agarra as correntes do teto e puxa com o corpo todo (o jogo desenha a corrente até o teto)
    return [
        dict(armF=(176, 0), armB=(170, 6), cl=0, lean=-6, tilt=-16, hip=(0, 0), glow=True, braid=6),
        dict(armF=(140, 50), armB=(130, 60), cl=0, lean=8, tilt=4, hip=(0, 4), hem=1, glow=True, braid=-4),
        dict(armF=(70, 80), armB=(60, 90), cl=0, lean=14, tilt=10, hip=(1, 7), pool=0.3, hem=2, glow=True, braid=-8),
    ]


def stagger():
    # gancho rebatido: o braço voa para trás e ela cambaleia de peito aberto
    return [
        dict(armF=(-120, 30), ca=-150, cl=30, armB=(60, 20), lean=-16, hip=(-4, 2), tilt=-18, hem=-3, braid=18),
        dict(armF=(-104, 36), ca=-130, cl=34, armB=(50, 24), lean=-12, hip=(-3, 1.5), tilt=-10, hem=-2, braid=14),
    ]


def hurt():
    return [dict(armF=(50, 30), ca=-20, cl=60, armB=(-36, 30), lean=-9, hip=(-3, 1), tilt=-12, hem=-1.5, braid=10)]


def death():
    # cai de joelhos, solta a corrente, as chaves se espalham e ela se dobra até a testa quase
    # tocar o chão, as brasas apagando (o corpo fica assim na sala)
    keys = (152.0, 189.0)
    return [
        dict(armF=(60, 30), ca=-40, cl=60, armB=(-50, 30), lean=-12, hip=(-3, 2), tilt=-16, hem=-2, glow=True, braid=12),
        dict(armF=(30, 20), drop=True, armB=(10, 20), lean=8, hip=(2, 22), tilt=6, pool=0.8, hem=1, braid=-4),
        dict(armF=(10, 0), drop=True, armB=(0, 10), lean=28, hip=(2, 26), tilt=20, pool=1.0, hem=2, braid=-8, keysAt=keys),
        dict(armF=(-8, 10), drop=True, armB=(-14, 16), lean=48, hip=(1, 29), tilt=28, pool=1.0, hem=2, braid=6, keysAt=keys, dead=True),
        dict(armF=(-24, 20), drop=True, armB=(-30, 24), lean=60, hip=(0, 31), tilt=34, pool=1.0, hem=2, braid=10, keysAt=keys, dead=True),
    ]


ANIMS = {
    'work': (work(), 40 / 9, True),
    'rise': (rise(), 5, False),
    'roar': (roar(), 5, True),
    'idle': (idle(), 5, True),
    'walk': (walk(), 7, True),
    'lashwind': (lash_windup(), 5, False),
    'lash': (lash(), 14, False),
    'lashrec': (lash_recover(), 6, False),
    'sweepwind': (sweep_windup(), 5, False),
    'sweep': (sweep(), 14, False),
    'sweeprec': (sweep_recover(), 5, False),
    'hookwind': (hook_windup(), 8, True),
    'hook': (hook_throw(), 10, False),
    'yank': (yank(), 4, False),
    'stagger': (stagger(), 5, False),
    'hurt': (hurt(), 10, False),
    'death': (death(), 5, False),
}

"""Gente da Cidade-Catedral:
- Irmã Luzia, a freira cega: hábito escuro, touca branca, venda nos olhos e um terço dourado.
- Brás, o ferreiro: corpulento, avental de couro, a máscara da ordem rachada e colada com ouro
  (ele conserta até o que esquece), martelo na mão e a bigorna na frente.
- Os esquecidos: o povo da cidade, de máscara lisa sem expressão (dois tipos: xale e chapéu).

uso: python3 townsfolk.py <pasta_assets>
"""
import math
import sys
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot
from rig import rotate_all, build_sheet

puppet.RAMPS.setdefault('linen', [0x6b675f, 0x9d978b, 0xc6bfb0, 0xe3ddcf, 0xf7f2e6])
puppet.RAMPS.setdefault('wool', [0x1a1514, 0x2b2220, 0x41332e, 0x5a4840, 0x745e53])
puppet.RAMPS.setdefault('ember', [0x5a1606, 0xa8340c, 0xe4691a, 0xffa94a, 0xffe2a0])
puppet.RIM_MATS |= {'wool', 'linen'}


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def dirv(deg):
    a = math.radians(deg)
    return (math.sin(a), math.cos(a))


def arm(prims, root, ang, l1, l2, z, sleeve, hand, shade=1.0, r=(2.4, 2.1)):
    up, el = ang
    elbow = add(root, dirv(up), l1)
    h = add(elbow, dirv(up + el), l2)
    prims.append(Capsule('upper', sleeve, z, root, elbow, r[0], r[1], shade=shade))
    prims.append(Capsule('fore', sleeve, z + 0.05, elbow, h, r[1], r[1] * 0.9, shade=shade))
    prims.append(Ellipse('hand', hand, z + 0.1, h, 1.6, 1.6, shade=shade))
    return h


def gown(prims, name, mat, z, neck, hip, u, f, hem_w, hem_y, sway=0.0, shade=1.0, wide=7.0):
    """Roupa comprida até o chão (hábito, vestido, túnica) com dobras verticais."""
    pts = [add(neck, f, -3.8), add(add(neck, f, 4.4), u, -0.8), add(add(neck, f, wide * 0.95), u, -7.0), add(add(hip, f, wide), u, 2.0)]
    n = 7
    for i in range(n + 1):
        t = i / n
        x = hem_w + sway - t * (hem_w * 2 + sway * 0.4)
        y = hem_y + (0.8 if i % 2 else 0.0)
        pts.append(add(add(hip, f, x), u, y))
    pts += [add(add(hip, f, -wide * 1.02), u, 3.0), add(add(neck, f, -wide * 1.05), u, -6.0)]

    def nf(x, y):
        nx = -(x - hip[0]) / 15 + 0.3 * math.sin(x * 0.9 + y * 0.1)
        ny = -0.65 * max(0.0, 1 - (y - neck[1]) / 12)
        return norm((nx, ny, 0.8))

    prims.append(Poly(name, mat, z, pts, nf=nf, shade=shade))


# ======================= Irmã Luzia =======================
NUN_W, NUN_H = 64, 72
NUN_FEET = (30, 69)


def nun(pose):
    p = dict(hip=(0.0, 0.0), lean=4.0, tilt=0.0, beads=0, sway=0.0, talk=False)
    p.update(pose)
    prims, decals = [], []
    hip = add((30.0, 49.0), p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))
    f = (math.cos(lean), math.sin(lean))
    neck = add(hip, u, 14.5)
    head = add(add(neck, u, 5.6), f, 1.6)
    gown(prims, 'habit', 'shadowcloth', 3.0, neck, hip, u, f, 8.8, -19.6, p['sway'], wide=6.4)
    # escapulário (a faixa da frente) um tom acima
    sc = [add(add(neck, f, 0.6), u, -2.0), add(add(neck, f, 5.8), u, -2.0), add(add(hip, f, 6.6), u, -18.5), add(add(hip, f, 1.2), u, -18.5)]
    prims.append(Poly('scapular', 'shadowcloth', 3.2, sc, nf=lambda x, y: norm((0.1, -0.2, 0.97)), shade=1.12))
    # véu caindo atrás dos ombros
    veil = [add(add(head, f, -4.6), u, 2.4), add(add(head, f, 3.0), u, 4.8), add(add(head, f, 4.6), u, -1.0),
            add(add(neck, f, -1.0), u, -8.0), add(add(neck, f, -7.6), u, -10.0), add(add(neck, f, -6.4), u, -2.0)]
    prims.append(Poly('veil', 'shadowcloth', 4.6, veil, nf=lambda x, y: norm((-0.4, -0.35, 0.85))))
    tilt = math.radians(p['tilt'])
    hl = lambda q: add(head, rot(q, lean + tilt))
    # touca branca em volta do rosto e o peitilho
    prims.append(Ellipse('coif', 'linen', 4.8, hl((0.8, 0.4)), 4.4, 5.0, ang=lean + tilt, bulge=0.8))
    bib = [add(add(neck, f, -2.4), u, 1.6), add(add(neck, f, 5.2), u, 1.0), add(add(neck, f, 4.4), u, -4.6), add(add(neck, f, -1.6), u, -4.2)]
    prims.append(Poly('bib', 'linen', 4.7, bib, nf=lambda x, y: norm((0.15, -0.5, 0.85)), shade=0.95))
    face = Ellipse('face', 'flesh', 4.95, hl((2.2, 0.8)), 2.6, 3.4, ang=lean + tilt, bulge=0.75)
    prims.append(face)

    def face_decal(x, y, cur):
        lx, ly = face.local(x, y)
        # venda de linho sobre os olhos
        if -1.6 < ly < 0.0:
            return ('linen', 3 if ly < -0.8 else 2)
        if 1.7 < ly < 2.2 and -0.4 < lx < 1.4:
            return ('flesh', 1)
        return None

    decals.append(Decal('face', face_decal))
    # mãos juntas na frente com o terço
    sh = add(add(neck, f, 2.0), u, -2.6)
    hands = add(add(hip, f, 5.6), u, 6.0)
    for z, d in ((2.6, -1.6), (5.4, 0.0)):
        prims.append(Capsule('sleeve', 'shadowcloth', z, add(sh, f, d), add(hands, f, d * 0.5), 2.4, 2.6, shade=0.85 if z < 3 else 1.0))
    prims.append(Ellipse('hands', 'flesh', 5.6, hands, 2.2, 1.8))
    # terço: contas que descem das mãos, uma passando pelos dedos
    for i in range(7):
        a = math.radians(-40 + i * 32)
        bp = add(add(hands, f, 0.8 + math.sin(a) * 2.4), u, -2.4 - (1 - math.cos(a)) * 2.6 - i * 0.6)
        lit = 4 if i == p['beads'] % 7 else 2
        prims.append(Ellipse('bead', 'gold', 5.7, bp, 0.75, 0.75, flat=lit))
    cross = add(add(hands, f, 1.2), u, -10.2)
    prims.append(Capsule('cross', 'gold', 5.75, add(cross, u, 1.4), add(cross, u, -1.6), 0.5, 0.5, flat=3))
    prims.append(Capsule('crossbar', 'gold', 5.76, add(add(cross, u, 0.4), f, -1.1), add(add(cross, u, 0.4), f, 1.1), 0.45, 0.45, flat=3))
    # pés escondidos (só a ponta do sapato)
    prims.append(Capsule('shoe', 'leather', 2.0, add(add(hip, f, 2.0), u, -19.4), add(add(hip, f, 6.4), u, -19.4), 1.4, 1.2))
    return prims, decals


NUN_ANIMS = {
    'idle': ([dict(hip=(0, b), beads=i, sway=b * 0.3) for i, b in enumerate((0.0, 0.3, 0.6, 0.3))], 3, True),
    'talk': ([dict(tilt=-8, lean=2, beads=2), dict(tilt=-12, lean=1, beads=2, hip=(0, 0.3))], 3, True),
}


# ======================= Brás, o ferreiro =======================
SMITH_W, SMITH_H = 112, 84
SMITH_FEET = (44, 81)


def smith(pose):
    p = dict(hip=(0.0, 0.0), lean=6.0, arm=(150.0, -30.0), hammer=None, tilt=0.0, glow=1.0, spark=False)
    p.update(pose)
    prims, decals = [], []
    hip = add((44.0, 58.0), p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))
    f = (math.cos(lean), math.sin(lean))
    neck = add(hip, u, 16.0)
    head = add(add(neck, u, 6.0), f, 2.4)

    # bigorna no toco (fica parada na frente dele)
    prims.append(Poly('stump', 'wood', 1.0, [(70, 81), (86, 81), (85, 70), (71, 70)], nf=lambda x, y: norm((0.0, -0.1, 0.99))))
    anvil = [(66, 70), (91, 70), (89, 66), (95, 63.5), (95, 62), (62, 62), (64, 66)]
    prims.append(Poly('anvil', 'steel', 1.2, anvil, nf=lambda x, y: norm((-0.25, -0.75 if y < 63.5 else -0.1, 0.62))))
    # barra em brasa em cima da bigorna, segura pela tenaz
    prims.append(Capsule('bar', 'ember', 1.4, (70, 61.2), (84, 61.2), 1.2, 1.2, flat=int(round(2 + p['glow'] * 2))))

    # pernas firmes e afastadas
    def leg(root, th, kn, z, shade):
        knee = add(root, dirv(th), 10.0)
        ankle = add(knee, dirv(th - kn), 9.6)
        prims.append(Capsule('thigh', 'shadowcloth', z, root, knee, 3.8, 3.2, shade=shade))
        prims.append(Capsule('shin', 'shadowcloth', z + 0.05, knee, ankle, 3.0, 2.6, shade=shade))
        prims.append(Capsule('boot', 'leather', z + 0.06, add(ankle, (-1.6, 0)), add(ankle, (5.0, 0.6)), 2.6, 2.2, shade=shade))

    leg(add(hip, f, -3.0), -14, 4, 1.5, 0.65)
    leg(add(hip, f, 3.0), 18, 8, 4.0, 1.0)
    # tronco largo: camisa, avental de couro e cinto
    prims.append(Ellipse('belly', 'cloth', 3.0, add(add(hip, u, 7.0), f, 1.6), 8.2, 9.4, ang=lean))
    prims.append(Ellipse('chest', 'cloth', 3.1, add(add(neck, u, -4.6), f, 1.0), 8.2, 6.6, ang=lean))
    apron = [add(add(neck, f, 1.0), u, -3.0), add(add(neck, f, 7.8), u, -3.4), add(add(hip, f, 9.8), u, -14.0), add(add(hip, f, 1.6), u, -15.0),
             add(add(hip, f, -1.6), u, 2.0)]
    prims.append(Poly('apron', 'leather', 3.5, apron, nf=lambda x, y: norm((0.3 * math.sin(y * 0.7), -0.2, 0.93))))
    prims.append(Capsule('strap', 'leather', 3.55, add(add(neck, f, 1.6), u, -2.0), add(add(neck, f, -3.2), u, 0.4), 1.0, 1.0, shade=0.8))
    # braço de trás segura a tenaz na barra
    tong = (70.0, 61.0)
    shB = add(add(neck, f, -3.8), u, -2.6)
    eB = add(add(shB, f, 7.0), u, -8.0)
    prims.append(Capsule('armB', 'flesh', 2.2, shB, eB, 3.2, 2.8, shade=0.7))
    prims.append(Capsule('foreB', 'flesh', 2.25, eB, add(tong, (-8.0, 1.0)), 2.8, 2.4, shade=0.7))
    prims.append(Ellipse('handB', 'flesh', 2.3, add(tong, (-8.0, 1.0)), 2.2, 2.2, shade=0.7))
    prims.append(Capsule('tongs', 'steel', 2.0, add(tong, (-8.0, 1.0)), tong, 0.8, 0.7, flat=2))

    # cabeça: careca, barba cheia e a máscara rachada com ouro
    tilt = math.radians(p['tilt'])
    hl = lambda q: add(head, rot(q, lean + tilt))
    prims.append(Ellipse('skull', 'flesh', 5.0, head, 5.4, 5.8, ang=lean + tilt, bulge=0.9))
    beard = [hl((-1.0, 1.6)), hl((5.8, 1.2)), hl((5.4, 6.2)), hl((2.2, 9.6)), hl((-1.6, 6.4))]
    prims.append(Poly('beard', 'robe', 5.2, beard, nf=lambda x, y: norm((0.2 * math.sin(y * 1.4), -0.1, 0.95)), shade=1.15))
    mask = Ellipse('mask', 'porcelain', 5.1, hl((3.0, -0.6)), 3.2, 3.8, ang=lean + tilt, bulge=0.7)
    prims.append(mask)

    def mask_decal(x, y, cur):
        lx, ly = mask.local(x, y)
        if -1.6 < ly < -0.6 and (0.4 < lx < 2.2 or -2.2 < lx < -0.9):
            return ('void', 0)
        # rachadura colada com ouro, de cima até o queixo
        if abs(lx - (0.9 - ly * 0.45)) < 0.42 and ly > -3.6:
            return ('gold', 4)
        return None

    decals.append(Decal('mask', mask_decal))
    # braço do martelo
    shF = add(add(neck, f, 3.6), u, -2.4)
    up, el = p['arm']
    eF = add(shF, dirv(up), 8.8)
    hF = add(eF, dirv(up + el), 8.0)
    prims.append(Capsule('armF', 'flesh', 6.0, shF, eF, 3.4, 3.0))
    prims.append(Capsule('foreF', 'flesh', 6.05, eF, hF, 3.0, 2.6))
    prims.append(Ellipse('fist', 'flesh', 6.1, hF, 2.4, 2.4))
    hd = dirv(p['hammer'] if p['hammer'] is not None else up + el)
    hs = (hd[1], -hd[0])
    head_c = add(hF, hd, 9.0)
    prims.append(Capsule('handle', 'wood', 6.2, add(hF, hd, -1.8), head_c, 1.0, 1.0))
    prims.append(Capsule('hammer', 'steel', 6.3, add(head_c, hs, -3.4), add(head_c, hs, 3.4), 2.4, 2.4))
    if p['spark']:
        for i, (dx, dy) in enumerate(((-6, -5), (-2, -8), (3, -7), (7, -4), (10, -1), (-9, -2))):
            prims.append(Ellipse('spark', 'ember', 7.0, (78 + dx, 60 + dy), 0.8, 0.8, flat=4 if i % 2 else 3))
    return prims, decals


SMITH_ANIMS = {
    # trabalho: ergue, segura no alto, desce e bate (faísca), volta
    'work': ([
        dict(arm=(150, -40), hammer=150, lean=6, glow=0.9),
        dict(arm=(168, -24), hammer=180, lean=2, glow=0.9),
        dict(arm=(86, 8), hammer=96, lean=14, hip=(1, 1), glow=1.0, spark=True),
        dict(arm=(104, 0), hammer=112, lean=12, hip=(0.5, 0.6), glow=1.0),
    ], 6, True),
    'idle': ([dict(arm=(40, 30), hammer=10, lean=4, glow=0.8), dict(arm=(40, 30), hammer=10, lean=4, hip=(0, 0.4), glow=0.7)], 2, True),
    'talk': ([dict(arm=(40, 30), hammer=10, lean=0, tilt=-8, glow=0.7), dict(arm=(44, 34), hammer=14, lean=-1, tilt=-12, glow=0.7)], 3, True),
}


# ======================= os esquecidos =======================
FOLK_W, FOLK_H = 64, 76
FOLK_FEET = (30, 73)


def folk(pose):
    p = dict(hip=(0.0, 0.0), lean=6.0, tilt=0.0, kind='shawl', sway=0.0, armF=(20.0, 30.0))
    p.update(pose)
    prims, decals = [], []
    hip = add((30.0, 50.0), p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))
    f = (math.cos(lean), math.sin(lean))
    neck = add(hip, u, 15.0)
    head = add(add(neck, u, 5.8), f, 1.6)
    shawl = p['kind'] == 'shawl'
    gown(prims, 'dress', 'robe' if shawl else 'wool', 3.0, neck, hip, u, f, 8.0 if shawl else 6.6, -21.6, p['sway'], wide=6.0)
    if not shawl:
        # botas e as pernas da calça aparecendo embaixo da túnica
        for d, z in ((-2.4, 1.5), (2.6, 2.0)):
            prims.append(Capsule('leg', 'cloth', z, add(add(hip, f, d), u, -14.0), add(add(hip, f, d), u, -20.4), 2.4, 2.2, shade=0.8))
            prims.append(Capsule('boot', 'leather', z + 0.1, add(add(hip, f, d - 1.4), u, -21.6), add(add(hip, f, d + 3.6), u, -21.6), 1.9, 1.6))
    tilt = math.radians(p['tilt'])
    hl = lambda q: add(head, rot(q, lean + tilt))
    prims.append(Ellipse('head', 'wool' if shawl else 'flesh', 4.8, head, 4.8, 5.2, ang=lean + tilt, bulge=0.85))
    mask = Ellipse('mask', 'porcelain', 5.4, hl((2.4, 0.6)), 2.8, 3.8, ang=lean + tilt, bulge=0.6)
    prims.append(mask)

    def mask_decal(x, y, cur):
        lx, ly = mask.local(x, y)
        # máscara lisa: só dois furos rasos, sem boca
        if -1.4 < ly < -0.7 and (0.6 < lx < 1.6 or -1.8 < lx < -0.9):
            return ('porcelain', 1)
        return None

    decals.append(Decal('mask', mask_decal))
    if shawl:
        # xale de lã nos ombros (o lenço da cabeça emoldura a máscara)
        sh = [add(add(neck, f, -5.6), u, 1.0), add(add(neck, f, 5.0), u, 0.6), add(add(neck, f, 7.0), u, -6.0), add(add(neck, f, 0.4), u, -10.4),
              add(add(neck, f, -7.0), u, -8.4)]
        prims.append(Poly('shawl', 'wool', 5.2, sh, nf=lambda x, y: norm((-0.25, -0.45, 0.85)), shade=1.1))
    else:
        brim = [hl((-6.6, -3.0)), hl((7.6, -3.4)), hl((7.4, -2.0)), hl((-6.4, -1.6))]
        prims.append(Poly('brim', 'leather', 5.5, brim, nf=lambda x, y: norm((-0.2, -0.8, 0.55))))
        prims.append(Ellipse('crown', 'leather', 5.45, hl((0.4, -5.0)), 4.4, 2.8, ang=lean + tilt, shade=0.95))
    sh = add(add(neck, f, 2.4), u, -2.6)
    arm(prims, sh, p['armF'], 7.6, 7.0, 5.6, 'robe' if shawl else 'wool', 'flesh', r=(2.4, 2.0))
    return prims, decals


FOLK_ANIMS = {}
for k in ('shawl', 'hat'):
    FOLK_ANIMS[f'idle-{k}'] = ([dict(kind=k, hip=(0, b), sway=b * 0.4, tilt=b * 2) for b in (0.0, 0.4, 0.8, 0.4)], 3, True)
    FOLK_ANIMS[f'talk-{k}'] = ([dict(kind=k, tilt=-10, lean=3, armF=(50, 40)), dict(kind=k, tilt=-6, lean=4, armF=(60, 30), hip=(0, 0.3))], 3, True)



# ======================= Tomé, o preso =======================
# magro e curvado, túnica de linho rasgada até o joelho, calça puída, pés descalços, cabelo
# embaraçado caindo pelos ombros, a máscara lisa dos esquecidos rachada e os pulsos presos por
# algemas com um pedaço de corrente entre as mãos
PRISONER_W, PRISONER_H = 64, 76
PRISONER_FEET = (30, 73)


def prisoner(pose):
    p = dict(hip=(0.0, 0.0), lean=14.0, tilt=6.0, sway=0.0, armF=(34.0, 58.0), armB=(30.0, 62.0), chain=0.0)
    p.update(pose)
    prims, decals = [], []
    hip = add((30.0, 53.0), p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))
    f = (math.cos(lean), math.sin(lean))
    neck = add(hip, u, 13.0)
    head = add(add(neck, u, 4.8), f, 3.2)

    # pernas finas: calça puída até a canela, canela e pé descalços
    def leg(root, th, kn, z, shade):
        knee = add(root, dirv(th), 9.4)
        ankle = add(knee, dirv(th - kn), 9.2)
        torn = add(knee, dirv(th - kn), 4.6)
        prims.append(Capsule('thigh', 'wool', z, root, knee, 2.6, 2.2, shade=shade))
        prims.append(Capsule('pant', 'wool', z + 0.04, knee, torn, 2.2, 2.3, shade=shade))
        prims.append(Capsule('shin', 'flesh', z + 0.02, torn, ankle, 1.5, 1.3, shade=shade * 0.78))
        prims.append(Capsule('foot', 'flesh', z + 0.06, add(ankle, (-1.2, 0.4)), add(ankle, (3.8, 0.9)), 1.5, 1.1, shade=shade * 0.72))

    leg(add(hip, f, -1.8), -8, 6, 1.5, 0.62)
    leg(add(hip, f, 2.0), 10, 12, 2.0, 0.9)

    # túnica rasgada: barra irregular na altura do joelho
    sway = p['sway']
    top = [add(neck, f, -4.6), add(add(neck, f, 3.8), u, -0.4), add(add(neck, f, 6.6), u, -5.6), add(add(hip, f, 5.6), u, 2.0)]
    hem = []
    jag = [0.0, 2.6, 0.4, 3.4, 1.0, 2.2, 0.0, 3.0]
    for i in range(len(jag)):
        t = i / (len(jag) - 1)
        x = 6.2 + sway - t * (12.6 + sway * 0.4)
        hem.append(add(add(hip, f, x), u, -9.6 - jag[i]))
    back = [add(add(hip, f, -6.4), u, 2.4), add(add(neck, f, -6.0), u, -5.0)]

    def nf(x, y):
        nx = -(x - hip[0]) / 14 + 0.35 * math.sin(x * 1.1 + y * 0.2)
        ny = -0.6 * max(0.0, 1 - (y - neck[1]) / 12)
        return norm((nx, ny, 0.8))

    prims.append(Poly('tunic', 'linen', 3.0, top + hem + back, nf=nf, shade=0.6))
    # corda no lugar do cinto
    prims.append(Capsule('rope', 'string', 3.2, add(add(hip, f, -5.8), u, 2.2), add(add(hip, f, 5.8), u, 1.6), 0.9, 0.9, shade=0.9))

    # braço de trás (a mão encontra a da frente, presa na mesma corrente)
    def limb(root, ang, z, shade):
        up, el = ang
        elbow = add(root, dirv(up), 7.2)
        hand = add(elbow, dirv(up + el), 6.6)
        prims.append(Capsule('upper', 'linen', z, root, elbow, 2.1, 1.8, shade=shade * 0.72))
        prims.append(Capsule('fore', 'flesh', z + 0.05, elbow, hand, 1.6, 1.4, shade=shade * 0.8))
        prims.append(Ellipse('hand', 'flesh', z + 0.1, hand, 1.5, 1.5, shade=shade * 0.8))
        cuff = add(elbow, dirv(up + el), 5.0)
        prims.append(Ellipse('cuff', 'steel', z + 0.12, cuff, 2.0, 2.3, ang=math.radians(-(up + el)), shade=shade))
        return cuff

    cB = limb(add(add(neck, f, -2.6), u, -2.4), p['armB'], 2.6, 0.7)

    # cabelo embaraçado atrás da cabeça e caindo nos ombros
    tilt = math.radians(p['tilt'])
    hl = lambda q: add(head, rot(q, lean + tilt))
    hair = [hl((-5.8, -3.4)), hl((-1.0, -6.4)), hl((3.8, -5.6)), hl((5.6, -2.4)), hl((4.2, 1.2)), hl((2.6, 2.0)), hl((-1.8, 6.6)),
            hl((-4.4, 9.4)), hl((-6.6, 7.0)), hl((-7.4, 2.2))]
    prims.append(Poly('hair', 'wool', 4.6, hair, nf=lambda x, y: norm((0.35 * math.sin(y * 1.6 + x * 0.3), -0.35, 0.86)), shade=0.95))
    prims.append(Ellipse('head', 'flesh', 4.8, head, 4.4, 4.9, ang=lean + tilt, bulge=0.85, shade=0.8))
    # barba rala embaixo da máscara
    beard = [hl((0.6, 2.4)), hl((4.6, 2.0)), hl((3.6, 5.6)), hl((1.2, 6.4))]
    prims.append(Poly('beard', 'wool', 5.0, beard, nf=lambda x, y: norm((0.2 * math.sin(y * 1.8), -0.1, 0.95)), shade=1.1))
    mask = Ellipse('mask', 'porcelain', 5.3, hl((2.6, -0.4)), 2.7, 3.6, ang=lean + tilt, bulge=0.6, shade=0.86)
    prims.append(mask)

    def mask_decal(x, y, cur):
        lx, ly = mask.local(x, y)
        if -1.4 < ly < -0.6 and (0.5 < lx < 1.6 or -1.8 < lx < -0.9):
            return ('void', 0)
        # rachadura escura atravessando a máscara (sem ouro: ninguém consertou)
        if abs(lx - (-0.4 + ly * 0.55)) < 0.3 and -3.4 < ly < 1.6:
            return ('void', 1)
        return None

    decals.append(Decal('mask', mask_decal))
    # mechas na frente do ombro
    for k, (a, b) in enumerate((((-2.6, 1.2), (-3.4, 8.0)), ((-0.6, 2.2), (-1.0, 7.4)))):
        prims.append(Capsule('lock', 'wool', 5.4 + k * 0.01, hl(a), hl(b), 0.9, 0.6, shade=1.05))

    cF = limb(add(add(neck, f, 2.6), u, -2.6), p['armF'], 5.6, 1.0)
    # a corrente curta entre as algemas, com barriga
    n = 4
    for i in range(1, n):
        t = i / n
        x = cB[0] + (cF[0] - cB[0]) * t
        y = cB[1] + (cF[1] - cB[1]) * t + math.sin(t * math.pi) * (2.2 + p['chain'])
        prims.append(Ellipse('link', 'steel', 5.7, (x, y), 1.0, 0.8, ang=math.radians(40 * (i % 2)), shade=0.95))
    return prims, decals


PRISONER_ANIMS = {
    # respira curvado, a corrente balança um pouco entre as mãos
    'idle': ([dict(hip=(0, b), sway=b * 0.5, tilt=6 + b * 2, chain=b * 0.6, armF=(34 - b * 2, 58), armB=(30 - b * 2, 62)) for b in (0.0, 0.4, 0.8, 0.4)], 3, True),
    # falando: ergue as mãos presas e levanta o rosto
    'talk': ([dict(tilt=-8, lean=9, armF=(58, 44), armB=(52, 48), chain=0.4), dict(tilt=-4, lean=10, armF=(64, 38), armB=(58, 42), hip=(0, 0.3), chain=1.0)], 3, True),
}


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    s, _ = build_sheet('nun', NUN_ANIMS, nun, NUN_W, NUN_H, NUN_FEET, out, preview='nun_preview.png', scale=4)
    print('nun', s.size)
    s, _ = build_sheet('smith', SMITH_ANIMS, smith, SMITH_W, SMITH_H, SMITH_FEET, out, preview='smith_preview.png', scale=4)
    print('smith', s.size)
    s, _ = build_sheet('folk', FOLK_ANIMS, folk, FOLK_W, FOLK_H, FOLK_FEET, out, preview='folk_preview.png', scale=4)
    print('folk', s.size)
    s, _ = build_sheet('prisoner', PRISONER_ANIMS, prisoner, PRISONER_W, PRISONER_H, PRISONER_FEET, out, preview='prisoner_preview.png', scale=4)
    print('prisoner', s.size)

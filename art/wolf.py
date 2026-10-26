"""Lobo da Caça (Floresta Nevada): os cães da Casa Vhalor, que congelaram correndo atrás de alguém e
continuam correndo. Lobo magro e comprido, de pelo cinza-azulado, peito fundo e cintura fina; a geada
cobre as costas, o pescoço e o rabo como uma crosta branca com pingentes de gelo pendurados na barriga.
Coleira de couro com a placa de latão da Casa. Os olhos acendem azul-gelo quando ele acha a presa.

O boneco olha para a direita (+x). Pernas de dois ossos (a de trás com o jarrete), cabeça com o
focinho comprido, as orelhas em pé e a mandíbula que abre (uivo e mordida).

uso: python3 ink_sheets.py <pasta_assets> wolf
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm
from rig import rotate_all

puppet.RAMPS['wolffur'] = [0x181b23, 0x2b313d, 0x45505f, 0x667280, 0x8e99a8]
puppet.RAMPS['wolfbelly'] = [0x262931, 0x3d424c, 0x5c626d, 0x7f8590, 0xa6acb5]
puppet.RAMPS['frost'] = [0x4f5f74, 0x7d90a8, 0xa9bdd3, 0xd3e2f0, 0xf4f9ff]
puppet.RAMPS['iceeye'] = [0x1d3550, 0x2f5a85, 0x5a92c4, 0x9fd0f2, 0xe8f7ff]
puppet.RAMPS.setdefault('brass', [0x3a2a10, 0x5e4419, 0x8a6a2a, 0xb8923f, 0xdcc070])
puppet.SHINY.setdefault('brass', (0.6, 10))
puppet.SHINY['frost'] = (0.45, 12)
puppet.RIM_MATS |= {'wolffur'}

W, H = 88, 60
FEET = (42, 54)
FLOOR = 53.5

DEFAULT = dict(
    # tronco: deslocamento (x, y) e inclinação (graus, + levanta o peito)
    body=(0.0, 0.0), tilt=0.0,
    # pernas: (ângulo do osso de cima, ângulo do de baixo), em graus a partir da vertical (+ para a frente)
    fN=(4.0, -4.0), fF=(-4.0, 2.0), bN=(-6.0, 34.0), bF=(6.0, 30.0),
    # cabeça (graus, + para cima), boca aberta (graus) e o rabo (graus a partir da horizontal para trás, + para cima)
    head=0.0, jaw=0.0, tail=-28.0, tailbend=10.0, ears=0.0,
    glow=False, rot=0.0, off=(0.0, 0.0), pivot=None,
)

THIGH = 8.5
SHANK = 9.0
META = 6.0
UPPER = 8.5
LOWER = 8.5


def P(d):
    p = dict(DEFAULT)
    p.update(d)
    return p


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def down(deg):
    """Direção 'para baixo' girada deg graus para a frente (+x)."""
    a = math.radians(deg)
    return (math.sin(a), math.cos(a))


def dv(deg):
    a = math.radians(deg)
    return (math.cos(a), math.sin(a))


def build(pose):
    p = P(pose)
    prims, decals = [], []
    glow = p['glow']
    tl = math.radians(-p['tilt'])
    fwd = (math.cos(tl), math.sin(tl))
    up = (fwd[1], -fwd[0])
    base = add((FEET[0] - 2.0, FLOOR - 22.0), p['body'])
    hip = add(base, fwd, -10.0)
    chest = add(base, fwd, 8.5)
    shoulder = add(add(chest, up, -2.0), fwd, -1.0)
    neck0 = add(add(chest, up, 4.5), fwd, 2.5)

    # ---------- pernas ----------
    def front(root, ang, z, shade):
        a1, a2 = ang
        elbow = add(root, down(a1), UPPER)
        wrist = add(elbow, down(a1 + a2), LOWER)
        paw = add(wrist, down(a1 + a2 + 70), 2.6)
        prims.append(Capsule('fupper', 'wolffur', z, root, elbow, 3.8, 2.1, shade=shade))
        prims.append(Capsule('flower', 'wolffur', z + 0.02, elbow, wrist, 1.7, 1.25, shade=shade))
        prims.append(Ellipse('paw', 'wolffur', z + 0.03, paw, 2.6, 1.6, ang=math.radians(-(a1 + a2) * 0.3), shade=shade * 0.9))
        return wrist

    def back(root, ang, z, shade):
        a1, a2 = ang
        knee = add(root, down(a1 + 18), THIGH)
        hock = add(knee, down(a1 - a2), SHANK)
        foot = add(hock, down(a1 - a2 + a2 * 0.9 + 6), META)
        paw = add(foot, down(80), 2.0)
        prims.append(Capsule('thigh', 'wolffur', z, root, knee, 5.0, 2.6, shade=shade))
        prims.append(Capsule('shank', 'wolffur', z + 0.02, knee, hock, 2.3, 1.3, shade=shade))
        prims.append(Capsule('meta', 'wolffur', z + 0.03, hock, foot, 1.3, 1.2, shade=shade))
        prims.append(Ellipse('paw', 'wolffur', z + 0.04, paw, 2.6, 1.5, shade=shade * 0.9))
        return hock

    back(add(hip, fwd, 1.0), p['bF'], 1.0, 0.6)
    front(add(shoulder, fwd, -1.0), p['fF'], 1.2, 0.6)

    # ---------- rabo: grosso, peludo, com a ponta de geada ----------
    t0 = add(add(hip, fwd, -5.5), up, 2.5)
    pts_t = [t0]
    ang = 180 - p['tail']
    seg = 4.2
    for i in range(4):
        a = math.radians(ang + p['tailbend'] * i * (1 if p['tail'] < 0 else -1) * 0.6)
        pts_t.append(add(pts_t[-1], (math.cos(a), -math.sin(a)), seg))
    for i, (r0, r1) in enumerate(((2.6, 3.6), (3.6, 3.9), (3.9, 3.2), (3.2, 1.6))):
        prims.append(Capsule('tail', 'wolffur', 2.0 + i * 0.01, pts_t[i], pts_t[i + 1], r0, r1))
    prims.append(Capsule('tailfrost', 'frost', 2.05, pts_t[3], pts_t[4], 2.0, 1.2))

    # ---------- tronco: quadril, cintura fina e o peito fundo ----------
    prims.append(Ellipse('hip', 'wolffur', 3.0, hip, 7.6, 6.8, ang=tl))
    prims.append(Capsule('waist', 'wolffur', 3.05, hip, chest, 5.6, 6.0))
    chest_e = Ellipse('chest', 'wolffur', 3.1, add(chest, up, -0.5), 8.4, 8.2, ang=tl)
    prims.append(chest_e)
    belly = [add(add(hip, up, -3.5), fwd, 2.0), add(add(chest, up, -5.5), fwd, -2.0), add(add(chest, up, -8.0), fwd, 3.0),
             add(add(chest, up, -6.0), fwd, 6.0), add(add(chest, up, -2.0), fwd, 5.0), add(add(hip, up, -1.5), fwd, 3.0)]
    prims.append(Poly('belly', 'wolfbelly', 3.12, belly, nf=lambda x, y: norm((0.0, 0.4, 0.9)), shade=0.85))
    # a geada das costas: crosta branca do pescoço ao quadril, com a borda de baixo em franja
    crust = []
    for i in range(9):
        k = i / 8
        c = add(hip, fwd, -6.0 + k * 21.0)
        h = 6.2 + 2.0 * math.sin(k * math.pi)
        crust.append(add(c, up, h + (1.2 if i in (2, 5) else 0)))
    fringe = []
    for i in range(17):
        k = 1 - i / 16
        c = add(hip, fwd, -6.5 + k * 21.5)
        h = 3.0 + 1.4 * math.sin(k * math.pi) - ((2.2 if i % 4 == 1 else 1.3) if i % 2 else 0.0)
        fringe.append(add(c, up, h))
    prims.append(Poly('crust', 'frost', 3.2, crust + fringe, nf=lambda x, y: norm((0.0, -0.75, 0.66))))
    # pingentes de gelo pendurados na barriga e no peito
    for k, ln in ((0.25, 3.6), (0.45, 2.4), (0.62, 3.0), (0.8, 2.0)):
        c = add(add(hip, fwd, -2.0 + k * 20.0), up, -6.6 if k < 0.6 else -7.4)
        prims.append(Poly('icicle', 'frost', 3.15, [add(c, fwd, -0.9), add(c, fwd, 0.9), add(c, up, -ln)], nf=lambda x, y: norm((0.4, 0.0, 0.9))))

    # ---------- pescoço, coleira e cabeça ----------
    hd_ang = math.radians(-p['tilt'] - p['head'])
    hf = (math.cos(hd_ang), math.sin(hd_ang))
    hu = (hf[1], -hf[0])
    head_c = add(add(neck0, hf, 6.0), hu, 3.5)
    prims.append(Capsule('neck', 'wolffur', 3.3, neck0, add(head_c, hf, -2.0), 6.0, 4.6))
    # a juba de geada no cangote
    mane = [add(neck0, hu, 4.8), add(add(neck0, hf, 3.0), hu, 6.4), add(add(head_c, hf, -3.4), hu, 4.6),
            add(add(head_c, hf, -2.6), hu, 2.2), add(add(neck0, hf, 1.4), hu, 2.4), add(neck0, hu, 1.8)]
    prims.append(Poly('mane', 'frost', 3.35, mane, nf=lambda x, y: norm((0.1, -0.7, 0.7))))
    col_c = add(add(neck0, hf, 2.6), hu, 0.4)
    prims.append(Capsule('collar', 'leather', 3.4, add(col_c, hu, 5.0), add(col_c, hu, -4.2), 1.3, 1.3, shade=0.75))
    prims.append(Ellipse('tag', 'brass', 3.42, add(add(col_c, hu, -5.4), hf, 0.6), 1.5, 1.7))
    skull = Ellipse('skull', 'wolffur', 3.6, head_c, 5.4, 4.4, ang=hd_ang)
    prims.append(skull)
    # focinho comprido e a mandíbula de baixo (abre no uivo e na mordida)
    snout0 = add(add(head_c, hf, 3.0), hu, -0.6)
    snout1 = add(add(head_c, hf, 10.5), hu, -1.6)
    prims.append(Capsule('snout', 'wolffur', 3.65, snout0, snout1, 2.9, 1.9))
    jaw_a = math.radians(-p['tilt'] - p['head'] + p['jaw'])
    jf = (math.cos(jaw_a), math.sin(jaw_a))
    jaw0 = add(add(head_c, hf, 2.0), hu, -2.4)
    jaw1 = add(jaw0, jf, 7.8)
    if p['jaw'] > 6:
        # boca aberta: o escuro de dentro e os dentes
        mouth = [add(snout1, hu, -1.2), jaw1, jaw0, add(snout0, hu, -1.6)]
        prims.append(Poly('mouth', 'void', 3.62, mouth, flat=0))
        for k in (0.35, 0.75):
            tt = add(add(snout0, (snout1[0] - snout0[0], snout1[1] - snout0[1]), k), hu, -2.2)
            prims.append(Poly('fang', 'bone', 3.64, [add(tt, hf, -0.5), add(tt, hf, 0.5), add(tt, hu, -1.6)], nf=lambda x, y: norm((0.3, 0.0, 0.9))))
    prims.append(Capsule('jaw', 'wolfbelly', 3.63, jaw0, jaw1, 1.8, 1.1, shade=0.85))
    prims.append(Ellipse('nose', 'void', 3.7, add(snout1, hf, 0.9), 1.3, 1.1, flat=1))
    # orelhas em pé (para trás quando ele corre ou salta)
    ea = p['ears']
    for i, (dx_, z) in enumerate(((-1.2, 3.55), (0.8, 3.68))):
        b0 = add(add(head_c, hf, dx_ - 1.6), hu, 3.2)
        tip = add(add(b0, hu, 5.6 * math.cos(math.radians(ea))), hf, -5.6 * math.sin(math.radians(ea)) - 1.2)
        prims.append(Poly('ear', 'wolffur', z, [add(b0, hf, -1.8), add(b0, hf, 1.8), tip], nf=lambda x, y: norm((0.0, -0.5, 0.86)), shade=0.9 if i else 0.7))
    # geada na testa e no focinho
    prims.append(Capsule('browfrost', 'frost', 3.72, add(add(head_c, hf, -2.0), hu, 3.4), add(add(head_c, hf, 4.0), hu, 2.0), 1.1, 0.8))

    def eye(x, y, cur):
        lx, ly = skull.local(x, y)
        d = (lx - 2.6) ** 2 / 2.2 + (ly + 0.9) ** 2 / 0.7
        if d < 1.0:
            return ('iceeye', 4 if glow else 2)
        if glow and d < 2.4:
            return ('iceeye', 3)
        return None

    decals.append(Decal('skull', eye))

    # ---------- pernas da frente (as perto) ----------
    back(add(hip, fwd, -1.0), p['bN'], 4.0, 1.0)
    front(add(shoulder, fwd, 1.0), p['fN'], 4.2, 1.0)

    pivot = p['pivot'] or FEET
    return rotate_all(prims, decals, pivot, p['rot'], p['off'])


# ---------- animações ----------
def idle():
    out = []
    for b in (0.0, 0.4, 0.8, 0.4):
        out.append(dict(body=(0, b * 0.6), tail=-30 - b * 3, head=-4 + b * 2))
    return out


def trot(n=6):
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s, c = math.sin(ph), math.cos(ph)
        out.append(dict(
            body=(0.0, -abs(s) * 0.8 + 0.4), tilt=c * 1.2, head=-6 + s * 2, tail=-24 + c * 4,
            fN=(18 * s, -8 + 26 * max(0.0, -c)), fF=(-18 * s, -8 + 26 * max(0.0, c)),
            bN=(-6 - 16 * s, 22 + 18 * max(0.0, c)), bF=(-6 + 16 * s, 22 + 18 * max(0.0, -c)),
        ))
    return out


def run(n=6):
    # galope: as pernas da frente juntas e as de trás juntas, o corpo estica e encolhe
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s, c = math.sin(ph), math.cos(ph)
        out.append(dict(
            body=(1.0, -2.2 - s * 2.0), tilt=s * 7, head=-10 - s * 4, tail=-8 + s * 8, ears=40,
            fN=(30 * c + 6, -10 + 40 * max(0.0, -s)), fF=(30 * c - 4, -10 + 40 * max(0.0, -s)),
            bN=(-30 * c - 8, 18 + 30 * max(0.0, s)), bF=(-30 * c + 2, 18 + 30 * max(0.0, s)),
            glow=True,
        ))
    return out


def howl():
    # o focinho para o céu, as patas da frente firmes e o quadril baixo
    base = dict(body=(-1.0, 3.0), tilt=24, fN=(-22, 4), fF=(-26, 6), bN=(34, 70), bF=(40, 66), tail=-36)
    return [
        dict(base, head=20, jaw=10, glow=True),
        dict(base, head=36, jaw=26, glow=True, body=(-1.0, 3.4)),
        dict(base, head=38, jaw=30, glow=True, body=(-1.0, 3.6)),
    ]


def crouch():
    # agachado para o salto: o peito no chão, o quadril alto, a boca já abrindo
    return [
        dict(body=(-2.0, 5.0), tilt=-8, fN=(28, -60), fF=(24, -56), bN=(10, 50), bF=(16, 46), head=4, jaw=8, tail=-10, ears=50, glow=True),
        dict(body=(-3.0, 6.0), tilt=-10, fN=(32, -66), fF=(28, -62), bN=(14, 56), bF=(20, 52), head=6, jaw=12, tail=-6, ears=60, glow=True),
    ]


def pounce():
    # no ar, esticado: patas da frente para a frente, as de trás para trás, a boca aberta
    return [
        dict(body=(2.0, -6.0), tilt=8, fN=(70, -30), fF=(62, -20), bN=(-60, 10), bF=(-52, 16), head=4, jaw=32, tail=6, ears=70, glow=True),
        dict(body=(2.0, -5.0), tilt=-2, fN=(62, -12), fF=(54, -6), bN=(-56, 16), bF=(-48, 22), head=-4, jaw=36, tail=2, ears=70, glow=True),
    ]


def skid():
    # freando de lado: patas da frente fincadas na frente, o corpo jogado para trás
    return [
        dict(body=(-2.0, 2.4), tilt=10, fN=(36, -4), fF=(30, -2), bN=(30, 50), bF=(36, 46), head=4, jaw=6, tail=-14, ears=40),
        dict(body=(-2.0, 2.8), tilt=12, fN=(40, -6), fF=(34, -4), bN=(32, 54), bF=(38, 50), head=2, jaw=4, tail=-18, ears=36),
    ]


def hurt():
    return [dict(body=(-2.0, 1.0), tilt=14, fN=(20, -10), fF=(14, -6), bN=(4, 30), bF=(10, 26), head=18, jaw=20, tail=-40, ears=60)]


def death():
    # cai de lado no chão: as pernas cedem, o peito encosta na neve e a cabeça deita
    return [
        dict(body=(-2.0, 1.0), tilt=14, fN=(20, -10), fF=(14, -6), bN=(4, 30), bF=(10, 26), head=18, jaw=20, tail=-40, ears=60),
        dict(body=(-1.0, 7.0), tilt=-6, fN=(50, -70), fF=(44, -66), bN=(30, 80), bF=(36, 76), head=-12, jaw=10, tail=-30, ears=70),
        dict(body=(0.0, 12.0), tilt=-2, fN=(80, -10), fF=(74, -6), bN=(-70, 20), bF=(-64, 24), head=-24, jaw=6, tail=-6, ears=80),
    ]


ANIMS = {
    'idle': (idle(), 4, True),
    'trot': (trot(), 9, True),
    'run': (run(), 14, True),
    'howl': (howl(), 5, False),
    'crouch': (crouch(), 7, False),
    'pounce': (pounce(), 10, True),
    'skid': (skid(), 8, True),
    'hurt': (hurt(), 10, False),
    'death': (death(), 8, False),
}

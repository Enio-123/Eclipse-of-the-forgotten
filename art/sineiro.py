"""O Sineiro: o primeiro chefe. Um gigante corcunda de manto puído, a cabeça enfiada num sino
de bronze rachado (com um olho que acende pela fenda) e um martelo de sino enorme: cabo de
madeira e um sino de bronze na ponta. Pernas enroladas em faixas, pés descalços.

uso: python3 sineiro.py <pasta_assets>
"""
import math
import sys
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot
from rig import rotate_all, build_sheet

puppet.RAMPS['bronze'] = [0x2e1f10, 0x5a3a18, 0x8a5c26, 0xb98a3e, 0xe4bd72]
puppet.RAMPS['rag'] = [0x15120f, 0x241f1a, 0x363027, 0x4b4236, 0x635849]
puppet.SHINY['bronze'] = (0.5, 9)
puppet.RIM_MATS |= {'rag', 'bronze'}

W, H = 208, 150
S = 1.9
BASE_HIP = (96.0, 94.0)
FEET = (96, 146)

DEFAULT = dict(
    hip=(0.0, 0.0), lean=18.0, tilt=0.0,
    legF=(10.0, 8.0), legB=(-8.0, 8.0), footF=0.0, footB=0.0,
    armF=(30.0, -40.0), armB=(20.0, -30.0), wpn=150.0, grip=0.62, wpnFront=True,
    glow=False, rot=0.0, pivot=None, off=(0.0, 0.0), helm=None, noWpn=False, wpnDrop=None,
)


def P(d):
    p = dict(DEFAULT)
    p.update(d)
    return p


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def dirv(deg):
    a = math.radians(deg)
    return (math.sin(a), math.cos(a))


def bell(prims, decals, name, c, ang, sc, z, glow=False, slit=True):
    """Sino de igreja: cúpula, corpo que alarga para baixo, a borda grossa e a argola em cima.
    c é o centro do corpo; ang gira o sino (0 = boca para baixo)."""
    L = lambda x, y: add(c, rot((x * sc, y * sc), ang))
    up = rot((0.0, -1.0), ang)
    body = [L(-8.5, -8.0), L(8.5, -8.0), L(9.5, 2.0), L(12.5, 8.5), L(-12.5, 8.5), L(-9.5, 2.0)]
    cx, cy = c

    def bn(x, y):
        lx, ly = rot((x - cx, y - cy), -ang)
        return norm(rot((0.9 * lx / (11.0 * sc), -0.25), ang) + (0.75,))

    prims.append(Poly(name, 'bronze', z, body, nf=bn))
    prims.append(Ellipse(name + '-dome', 'bronze', z + 0.02, L(0.0, -8.0), 8.6 * sc, 6.2 * sc, ang=ang))
    prims.append(Capsule(name + '-lip', 'bronze', z + 0.05, L(-12.8, 8.6), L(12.8, 8.6), 1.9 * sc, 1.9 * sc))
    prims.append(Capsule(name + '-crown', 'bronze', z + 0.03, L(0.0, -13.0), L(0.0, -16.5), 1.6 * sc, 2.2 * sc))

    def dec(x, y, cur):
        lx, ly = rot((x - cx, y - cy), -ang)
        lx /= sc
        ly /= sc
        # faixa dourada, rachadura e (no elmo) a fenda com o olho
        if abs(ly - 1.0) < 0.7:
            return ('gold', 2 if lx < 0 else 1)
        if abs(lx + 3.0 - ly * 0.35) < 0.55 and -9 < ly < 7:
            return ('void', 1)
        if slit and 3.2 < ly < 5.6 and 1.0 < lx < 10.5:
            if glow and 4.0 < lx < 8.0:
                return ('gold', 4)
            return ('void', 0)
        return None

    decals.append(Decal(name, dec))
    return add(c, up, 17.0 * sc)


def build(pose):
    p = P(pose)
    prims, decals = [], []
    hip = add(BASE_HIP, p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))
    f = (math.cos(lean), math.sin(lean))
    neck = add(hip, u, 19.0 * S)
    shF = add(add(neck, f, 6.0), u, -5.0)
    shB = add(add(neck, f, -5.0), u, -5.0)
    head = add(add(neck, u, 6.0 * S), f, 9.0)

    # ---------- pernas enfaixadas ----------
    def leg(root, ang, z, shade, footang):
        th, kn = ang
        knee = add(root, dirv(th), 10.5 * S)
        ankle = add(knee, dirv(th - kn), 10.0 * S)
        fa = math.radians(footang)
        toe = add(ankle, (math.cos(fa), math.sin(fa)), 9.0)
        heel = add(ankle, (math.cos(fa), math.sin(fa)), -3.0)
        prims.append(Capsule('thigh', 'rag', z, root, knee, 7.6, 6.2, shade=shade))
        prims.append(Capsule('shin', 'leather', z + 0.05, knee, ankle, 5.4, 4.2, shade=shade))
        prims.append(Capsule('foot', 'husk', z + 0.04, heel, toe, 3.6, 2.8, shade=shade))
        return knee, ankle

    leg(add(hip, f, -5.0), p['legB'], 1.5, 0.6, p['footB'])
    leg(add(hip, f, 5.0), p['legF'], 4.0, 1.0, p['footF'])

    def wraps(x, y, cur):
        if cur and cur[0] == 'leather' and int(y * 0.8 + x * 0.3) % 3 == 0:
            return ('leather', max(0, cur[1] - 1))
        return None

    decals.append(Decal('shin', wraps))

    # ---------- manto com a corcunda (um contorno só, sem emenda) ----------
    def at(a, b):
        return add(add(hip, f, a), u, b)

    # contorno: barra da frente, peito, a corcunda por cima e por trás, e a barra rasgada embaixo
    robe = [at(24, -24), at(22, -4), at(20, 14), at(18, 28), at(13, 37), at(5, 45), at(-5, 51), at(-15, 51), at(-23, 46),
            at(-29, 36), at(-31, 22), at(-30, 6), at(-28, -10), at(-26, -22), at(-20, -27), at(-14, -23), at(-8, -29),
            at(-2, -23), at(4, -28), at(10, -22), at(17, -28)]

    def robe_n(x, y):
        lx, ly = rot((x - hip[0], y - hip[1]), -lean)
        return norm((0.35 * math.sin(lx * 0.45 + ly * 0.1) + lx / 70.0 - 0.15, -0.3 - 0.4 * max(0.0, -ly - 40) / 20.0, 0.85))

    prims.append(Poly('robe', 'rag', 3.0, robe, nf=robe_n))

    def robe_dec(x, y, cur):
        lx, ly = rot((x - hip[0], y - hip[1]), -lean)
        # corda com sininhos na cintura e a barra esfarrapada
        if abs(ly + 2.0) < 1.3:
            return ('wood', 2)
        if abs(ly + 5.5) < 2.4 and int(lx + 60) % 9 in (0, 1):
            return ('bronze', 3 if int(lx + 60) % 9 == 0 else 2)
        return None

    decals.append(Decal('robe', robe_dec))

    # ---------- cabeça: o sino de bronze ----------
    if p['helm'] is None:
        bell(prims, decals, 'helm', head, lean * 0.55 + math.radians(p['tilt']), 1.3, 6.0, glow=p['glow'])
        # barba de trapos saindo debaixo do sino
        prims.append(Ellipse('beard', 'rag', 5.5, add(add(head, u, -13.5), f, 2.0), 11.0, 4.6, ang=lean, shade=0.7))
    else:
        hc, ha = p['helm']
        bell(prims, decals, 'helm', hc, ha, 1.3, 0.5, slit=True)

    # ---------- braços e o badalo do grande sino ----------
    def arm(root, ang, z, shade):
        up, el = ang
        elbow = add(root, dirv(up), 11.5 * S)
        hand = add(elbow, dirv(up + el), 10.5 * S)
        prims.append(Capsule('upperarm', 'rag', z, root, elbow, 6.4, 5.4, shade=shade))
        prims.append(Capsule('forearm', 'leather', z + 0.05, elbow, hand, 5.2, 4.4, shade=shade))
        prims.append(Ellipse('hand', 'husk', z + 0.1, hand, 5.2, 4.6, shade=shade))
        return hand

    handB = arm(shB, p['armB'], 2.2, 0.75)
    zW = 7.5 if p['wpnFront'] else 2.0
    if not p['noWpn']:
        if p['wpnDrop'] is not None:
            base, wa = p['wpnDrop']
            sd = (math.sin(math.radians(wa)), math.cos(math.radians(wa)))
            zW = 0.8
        else:
            sd = dirv(p['wpn'])
            base = add(handB, sd, -p['grip'] * 50.0)
        tip = add(base, sd, 66.0)
        prims.append(Capsule('haft', 'steel', zW, base, tip, 2.8, 2.6, shade=0.8))
        prims.append(Ellipse('ring', 'steel', zW + 0.1, add(base, sd, -3.0), 4.2, 4.2, shade=0.8))
        prims.append(Ellipse('ringhole', 'void', zW + 0.15, add(base, sd, -3.0), 1.8, 1.8))
        prims.append(Capsule('collar', 'bronze', zW + 0.2, add(tip, sd, -5.0), add(tip, sd, 1.0), 4.4, 4.8))
        prims.append(Ellipse('ball', 'bronze', zW + 0.25, add(tip, sd, 11.0), 12.0, 12.0))
    arm(shF, p['armF'], 8.0 if p['wpnFront'] else 5.0, 1.0)
    prims.append(Ellipse('shoulderF', 'rag', 8.3 if p['wpnFront'] else 5.3, add(shF, u, 2.0), 8.5, 7.5, ang=lean))

    pivot = p['pivot'] or FEET
    return rotate_all(prims, decals, pivot, p['rot'], p['off'])


# ---------- animações ----------
def idle():
    return [dict(hip=(0, b), lean=18 + b, armF=(36, -50 + b * 2), armB=(30, -44 + b * 2), wpn=24 + b) for b in (0.0, 0.8, 1.6, 0.8)]


def walk(n=6):
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s = math.sin(ph)
        c = math.cos(ph)
        out.append(dict(
            hip=(0.0, -abs(c) * 1.6 + 0.8), lean=20,
            legF=(6 + 18 * s, 6 + max(0, -c) * 26 + max(0, s) * 4), footF=-6 * max(0, -c),
            legB=(-6 - 18 * s, 6 + max(0, c) * 26 + max(0, -s) * 4), footB=-6 * max(0, c),
            armF=(36 - 8 * s, -50), armB=(30 + 8 * s, -44), wpn=22 + 4 * s,
        ))
    return out


def slam_windup():
    # martelo sobe por trás da cabeça, com as duas mãos
    return [
        dict(lean=6, hip=(-3, -1), armF=(185, -50), armB=(190, -44), wpn=258, grip=0.5, legF=(16, 10), legB=(-14, 8), glow=True),
        dict(lean=-4, hip=(-5, -2), armF=(194, -46), armB=(198, -42), wpn=252, grip=0.5, legF=(18, 12), legB=(-16, 10), glow=True),
    ]


def slam():
    # o martelo desce e bate no chão na frente
    return [
        dict(lean=30, hip=(4, 3), armF=(104, -20), armB=(108, -16), wpn=84, grip=0.5, legF=(30, 22), legB=(-24, 10), wpnFront=True),
        dict(lean=40, hip=(6, 8), armF=(70, -14), armB=(75, -10), wpn=38, grip=0.5, legF=(36, 34), legB=(-28, 14), wpnFront=True),
    ]


def slam_recover():
    return [dict(lean=38, hip=(6, 7), armF=(72, -16), armB=(76, -12), wpn=40, grip=0.5, legF=(34, 30), legB=(-26, 14))]


def sweep_windup():
    return [dict(lean=10, hip=(-4, 2), armF=(150, 30), armB=(160, 34), wpn=250, grip=0.55, wpnFront=False, legF=(20, 16), legB=(-18, 10), glow=True)]


def sweep():
    # varredura na altura do peito do cavaleiro
    return [
        dict(lean=16, hip=(4, 3), armF=(80, 10), armB=(86, 8), wpn=86, grip=0.5, legF=(28, 16), legB=(-22, 8)),
        dict(lean=20, hip=(6, 3), armF=(56, 4), armB=(62, 2), wpn=58, grip=0.5, legF=(30, 16), legB=(-22, 8)),
    ]


def charge_windup():
    return [dict(lean=46, hip=(-4, 6), armF=(10, -40), armB=(-10, -30), wpn=-40, grip=0.4, wpnFront=False, legF=(30, 40), legB=(-20, 30), glow=True)]


def charge(n=4):
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s = math.sin(ph)
        c = math.cos(ph)
        out.append(dict(
            lean=52, hip=(2, 6 - abs(c) * 2), tilt=-6, glow=True,
            legF=(24 + 24 * s, 14 + max(0, -c) * 30), legB=(-14 - 24 * s, 14 + max(0, c) * 30), footB=-10,
            armF=(10 + 10 * s, -50), armB=(-12 - 10 * s, -30), wpn=-64 + 4 * s, grip=0.4, wpnFront=False,
        ))
    return out


def stun():
    return [
        dict(lean=4, hip=(-2, 4), tilt=10, armF=(10, -20), armB=(-6, -10), wpn=-20, grip=0.8, wpnFront=False, legF=(16, 18), legB=(-12, 16)),
        dict(lean=0, hip=(-3, 5), tilt=-8, armF=(4, -16), armB=(-10, -8), wpn=-26, grip=0.8, wpnFront=False, legF=(14, 20), legB=(-14, 18)),
    ]


def roar():
    return [
        dict(lean=-8, hip=(-2, -2), tilt=-14, armF=(120, 20), armB=(24, -40), wpn=-34, grip=0.6, glow=True, legF=(22, 8), legB=(-22, 8), wpnFront=False),
        dict(lean=-12, hip=(-3, -3), tilt=-18, armF=(134, 24), armB=(28, -44), wpn=-38, grip=0.6, glow=True, legF=(24, 8), legB=(-24, 8), wpnFront=False),
    ]


def kneel():
    return [dict(lean=34, hip=(0, 22), legF=(70, 110), legB=(-30, 120), footB=-60, armF=(60, -30), armB=(40, -20), wpn=62, grip=0.5, tilt=14)]


def rise():
    return [
        dict(lean=30, hip=(0, 16), legF=(60, 90), legB=(-24, 100), footB=-40, armF=(50, -30), armB=(36, -24), wpn=56, grip=0.55, tilt=8),
        dict(lean=24, hip=(0, 8), legF=(34, 50), legB=(-14, 50), armF=(40, -40), armB=(32, -34), wpn=40, tilt=2),
        dict(lean=20, hip=(0, 2), legF=(16, 16), legB=(-10, 14), armF=(36, -50), armB=(30, -44), wpn=26, glow=True),
    ]


def hurt():
    return [dict(lean=8, hip=(-3, 2), tilt=8, armF=(30, -46), armB=(24, -40), wpn=30, legF=(14, 10), legB=(-12, 10))]


def death():
    piv = (96.0, 144.0)
    return [
        dict(lean=6, hip=(-2, 6), tilt=12, armF=(10, -20), armB=(0, -10), wpn=-10, wpnFront=False, legF=(20, 30), legB=(-14, 24)),
        dict(lean=30, hip=(0, 22), legF=(70, 110), legB=(-30, 120), footB=-60, armF=(30, -20), armB=(10, -10), noWpn=False,
             wpnDrop=((44.0, 140.0), 100), tilt=20),
        dict(lean=40, hip=(0, 24), legF=(70, 110), legB=(-30, 120), footB=-60, armF=(20, -10), armB=(0, -6), tilt=30,
             wpnDrop=((44.0, 140.0), 100), helm=((150.0, 134.0), math.radians(100))),
        dict(rot=70, pivot=piv, off=(4, -6), lean=40, hip=(0, 24), legF=(70, 110), legB=(-30, 120), footB=-60, armF=(20, -10), armB=(0, -6),
             tilt=30, wpnDrop=((40.0, 140.0), 100), helm=((156.0, 134.0), math.radians(100))),
    ]


ANIMS = {
    'idle': (idle(), 5, True),
    'walk': (walk(), 7, True),
    'slamwind': (slam_windup(), 6, False),
    'slam': (slam(), 14, False),
    'slamrec': (slam_recover(), 4, False),
    'sweepwind': (sweep_windup(), 6, False),
    'sweep': (sweep(), 16, False),
    'chargewind': (charge_windup(), 6, False),
    'charge': (charge(), 12, True),
    'stun': (stun(), 4, True),
    'roar': (roar(), 6, True),
    'kneel': (kneel(), 2, True),
    'rise': (rise(), 5, False),
    'hurt': (hurt(), 10, False),
    'death': (death(), 5, False),
}

def bell_drop(out):
    """Sino pequeno que cai do teto na segunda fase (32x36)."""
    from puppet import render, to_image
    prims, decals = [], []
    bell(prims, decals, 'bell', (16.0, 21.0), 0.0, 0.95, 1.0, slit=False)
    prims.append(Capsule('rope', 'wood', 0.5, (16.0, 0.5), (16.0, 6.0), 0.9, 0.9))
    px, _ = render(prims, decals, 32, 36)
    to_image(px, 32, 36).save(f'{out}/bell-drop.png')


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    bell_drop(out)
    only = sys.argv[2:]
    anims = {k: v for k, v in ANIMS.items() if not only or k in only}
    sheet, meta = build_sheet('sineiro', anims, build, W, H, FEET, out, preview='sineiro_preview.png', scale=2)
    print('sineiro', sheet.size)

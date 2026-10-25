"""Penitente do incensário: carrega o incenso das procissões da Cidade-Catedral. Hábito cinza
comprido, capuz cônico alto e a máscara de porcelana da ordem. Segura com as duas mãos a
corrente de um incensário de latão, pesado como uma maça (os furos acendem quando ele ergue).

uso: python3 censer.py <pasta_assets>
"""
import json
import math
import sys
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot
from rig import rotate_all, build_sheet

W, H = 128, 96
BASE_HIP = (56.0, 64.0)
FEET = (56, 93)

DEFAULT = dict(
    hip=(0.0, 0.0), lean=0.0, tilt=0.0,
    legF=(8.0, 6.0), legB=(-7.0, 6.0), footF=0.0, footB=0.0, hem=0.0,
    armF=(40.0, 50.0),
    # corrente: ângulo (0 = pendurada para baixo, 90 = para a frente, 180 = para cima) e comprimento
    ca=0.0, cl=19.0, censerAt=None,
    glow=False, rot=0.0, pivot=None, off=(0.0, 0.0),
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


def ik(root, target, l1, l2, bend):
    dx, dy = target[0] - root[0], target[1] - root[1]
    d = math.hypot(dx, dy) or 1e-6
    reach = min(d, l1 + l2 - 0.05)
    a = math.atan2(dy, dx)
    c = (l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach)
    b = math.acos(max(-1.0, min(1.0, c)))
    ea = a + bend * b
    elbow = (root[0] + math.cos(ea) * l1, root[1] + math.sin(ea) * l1)
    hand = (root[0] + dx / d * reach, root[1] + dy / d * reach)
    return elbow, hand


def skeleton(p):
    hip = add(BASE_HIP, p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))
    f = (math.cos(lean), math.sin(lean))
    neck = add(hip, u, 20.0)
    shF = add(add(neck, f, 3.4), u, -3.0)
    shB = add(add(neck, f, -3.0), u, -3.0)
    head = add(add(neck, u, 7.2), f, 1.6)
    up, el = p['armF']
    elbowF = add(shF, dirv(up), 9.0)
    handF = add(elbowF, dirv(up + el), 8.0)
    if p['censerAt'] is not None:
        cc = p['censerAt']
    else:
        cc = add(handF, dirv(p['ca']), p['cl'])
    return dict(hip=hip, lean=lean, u=u, f=f, neck=neck, shF=shF, shB=shB, head=head, elbowF=elbowF, handF=handF, cc=cc)


def censer_point(pose):
    """Centro do incensário relativo aos pés, já com o giro do corpo (o jogo solta a fumaça dali)."""
    p = P(pose)
    k = skeleton(p)
    x, y = k['cc']
    if p['rot'] and p['censerAt'] is None:
        piv = p['pivot'] or FEET
        a = math.radians(p['rot'])
        dx, dy = x - piv[0], y - piv[1]
        x = piv[0] + dx * math.cos(a) - dy * math.sin(a) + p['off'][0]
        y = piv[1] + dx * math.sin(a) + dy * math.cos(a) + p['off'][1]
    return [round(x - FEET[0], 1), round(y - FEET[1], 1)]


def censer_prims(cc, axis, glow, z):
    """Incensário de latão: bola furada, tampa cônica e argola em cima (o eixo aponta para a corrente)."""
    prims, decals = [], []
    side = (-axis[1], axis[0])
    body = Ellipse('censer', 'gold', z, cc, 5.0, 5.0, bulge=0.95)
    prims.append(body)

    def holes(x, y, cur):
        lx = (x - cc[0]) * side[0] + (y - cc[1]) * side[1]
        ly = (x - cc[0]) * axis[0] + (y - cc[1]) * axis[1]
        if abs(ly + 0.3) < 1.0 and abs(lx) < 4.2 and int(lx + 10) % 2 == 0:
            return ('gold', 4) if glow else ('void', 0)
        if abs(ly - 2.6) < 0.5 and abs(lx) < 4.0:
            return ('gold', 1)
        return None

    decals.append(Decal('censer', holes))
    base = add(cc, axis, 3.0)
    lid = [add(base, side, -4.6), add(base, side, 4.6), add(add(cc, axis, 8.8), side, 0.8), add(add(cc, axis, 8.8), side, -0.8)]
    prims.append(Poly('lid', 'gold', z + 0.05, lid, nf=lambda x, y: norm((-0.35, -0.55, 0.75)), shade=0.92))
    prims.append(Ellipse('ring', 'gold', z + 0.1, add(cc, axis, 9.8), 1.3, 1.3))
    prims.append(Ellipse('foot', 'gold', z - 0.05, add(cc, axis, -4.6), 2.4, 1.3, ang=math.atan2(side[1], side[0]), shade=0.8))
    return prims, decals


def chain_prims(a, b, z, sag=0.0):
    """Elos de aço entre a mão e a argola (com barriga quando a corrente está frouxa)."""
    out = []
    L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1e-6
    n = max(2, int(L / 2.3))
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag)
    prev = a
    for i in range(1, n + 1):
        t = i / n
        x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * mid[0] + t * t * b[0]
        y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * mid[1] + t * t * b[1]
        ang = math.atan2(y - prev[1], x - prev[0])
        if i % 2:
            out.append(Ellipse('link', 'steel', z, ((prev[0] + x) / 2, (prev[1] + y) / 2), 1.5, 0.8, ang=ang, flat=3 if i % 4 == 1 else 2))
        else:
            out.append(Ellipse('link', 'steel', z, ((prev[0] + x) / 2, (prev[1] + y) / 2), 1.2, 0.55, ang=ang, flat=1))
        prev = (x, y)
    return out


def build(pose):
    p = P(pose)
    k = skeleton(p)
    hip, u, f, neck, shF, shB, head, lean = (k[n] for n in ('hip', 'u', 'f', 'neck', 'shF', 'shB', 'head', 'lean'))
    elbowF, handF, cc = k['elbowF'], k['handF'], k['cc']
    prims, decals = [], []

    # ---------- pernas descalças (só as canelas e os pés aparecem embaixo do hábito) ----------
    def leg(root, ang, z, shade, footang):
        th, kn = ang
        knee = add(root, dirv(th), 10.5)
        ankle = add(knee, dirv(th - kn), 10.0)
        fa = math.radians(footang)
        toe = add(ankle, (math.cos(fa), math.sin(fa)), 5.0)
        heel = add(ankle, (math.cos(fa), math.sin(fa)), -1.6)
        prims.append(Capsule('thigh', 'husk', z, root, knee, 3.0, 2.4, shade=shade * 0.8))
        prims.append(Capsule('shin', 'husk', z + 0.05, knee, ankle, 2.2, 1.8, shade=shade * 0.8))
        prims.append(Capsule('foot', 'husk', z + 0.04, heel, toe, 1.9, 1.6, shade=shade * 0.85))

    leg(add(hip, f, -2.0), p['legB'], 1.5, 0.6, p['footB'])
    leg(add(hip, f, 2.0), p['legF'], 1.8, 1.0, p['footF'])

    # ---------- hábito comprido com a barra rasgada ----------
    hem = p['hem']
    robe = [add(neck, f, -4.0), add(add(neck, f, 4.8), u, -1.0), add(add(neck, f, 7.6), u, -8.0), add(add(hip, f, 7.4), u, 2.0)]
    n = 8
    for i in range(n + 1):
        t = i / n
        x = 9.8 + hem - t * (19.0 + hem * 0.4)
        y = -21.2 + (1.6 if i % 2 else 0.0) - t * 0.6 + abs(hem) * 0.15 * (1 - t)
        robe.append(add(add(hip, f, x), u, y))
    robe += [add(add(hip, f, -7.8), u, 3.0), add(add(neck, f, -8.0), u, -6.0)]

    def robe_n(x, y):
        nx = -(x - hip[0]) / 16 + 0.34 * math.sin(x * 0.8 + y * 0.12)
        ny = -0.7 * max(0.0, 1 - (y - neck[1]) / 14)
        return norm((nx, ny, 0.78))

    prims.append(Poly('robe', 'robe', 3.0, robe, nf=robe_n))
    belt = add(hip, u, 2.0)
    prims.append(Capsule('rope', 'string', 3.6, add(belt, f, -7.4), add(belt, f, 7.6), 1.0, 1.0, shade=0.8))
    knot = add(belt, f, 4.4)
    prims.append(Capsule('ropeEnd', 'string', 3.65, knot, add(add(knot, u, -9.0), f, 0.8), 0.8, 0.7, shade=0.8))
    prims.append(Ellipse('ropeKnot', 'string', 3.7, add(add(knot, u, -9.4), f, 0.9), 1.1, 1.1, shade=0.8))

    # ---------- capuz cônico, pano do rosto e a máscara ----------
    tilt = math.radians(p['tilt'])
    hl = lambda q: add(head, rot(q, lean + tilt))
    prims.append(Ellipse('head', 'robe', 5.0, head, 5.4, 6.0, ang=lean + tilt, bulge=0.85))
    cone = [hl((-5.0, -1.5)), hl((5.2, -1.5)), hl((1.0, -10.0)), hl((-2.6, -16.5)), hl((-4.4, -9.0))]
    prims.append(Poly('cone', 'robe', 5.1, cone, nf=lambda x, y: norm((0.45 - 0.08 * (x - head[0]), -0.35, 0.8)), shade=0.9))
    drape = [hl((-5.0, 0.0)), hl((5.8, 0.0)), add(add(neck, f, 7.4), u, -7.0), add(add(neck, f, 1.0), u, -9.0), add(add(neck, f, -4.2), u, -5.0)]
    prims.append(Poly('drape', 'robe', 4.0, drape, nf=lambda x, y: norm((0.2 * math.sin(x * 1.3), -0.25, 0.92)), shade=0.85))
    em = add(add(neck, f, 3.4), u, -4.6)

    def drape_decal(x, y, cur):
        # moeda do olho do dízimo bordada no peito
        r = math.hypot(x - em[0], y - em[1])
        if r < 2.2:
            if r > 1.4:
                return ('gold', 2)
            return ('void', 0) if abs(y - em[1]) < 0.6 else ('gold', 3)
        return None

    decals.append(Decal('drape', drape_decal))
    mask = Ellipse('mask', 'porcelain', 5.2, hl((3.4, 0.4)), 2.7, 4.0, ang=lean + tilt, bulge=0.7)
    prims.append(mask)

    def mask_decal(x, y, cur):
        lx, ly = mask.local(x, y)
        if -1.6 < ly < -0.5 and (0.3 < lx < 1.8 or -2.0 < lx < -0.8):
            return ('gold', 4) if p['glow'] else ('void', 0)
        if 1.6 < ly < 2.3 and -0.6 < lx < 1.2:
            return ('porcelain', 1)
        return None

    decals.append(Decal('mask', mask_decal))

    # ---------- braços: a mão de trás segura a corrente junto da da frente ----------
    targetB = add(add(handF, f, -2.6), u, 0.6)
    elbowB, handB = ik(shB, targetB, 9.0, 8.0, 1 if f[0] >= 0 else -1)
    if elbowB[1] < shB[1] - 6 and handB[1] > shB[1]:
        elbowB, handB = ik(shB, targetB, 9.0, 8.0, -1 if f[0] >= 0 else 1)
    prims.append(Capsule('sleeveB', 'robe', 2.4, shB, elbowB, 2.6, 3.4, shade=0.75))
    prims.append(Capsule('foreB', 'husk', 2.45, elbowB, handB, 1.6, 1.3, shade=0.7))
    prims.append(Ellipse('handB', 'husk', 2.5, handB, 1.7, 1.7, shade=0.75))

    # corrente e incensário: atrás do corpo quando ele ergue para trás, na frente no resto
    back = cc[0] < hip[0] - 4 and p['censerAt'] is None
    zc = 2.2 if back else 6.6
    axis = ((handF[0] - cc[0]), (handF[1] - cc[1]))
    al = math.hypot(*axis) or 1.0
    axis = (axis[0] / al, axis[1] / al)
    ring = add(cc, axis, 9.8)
    sag = 6.0 if p['censerAt'] is not None else 0.0
    prims.extend(chain_prims(handF, ring, zc - 0.1, sag))
    cp, cd = censer_prims(cc, axis if p['censerAt'] is None else (0.0, -1.0), p['glow'], zc)
    prims.extend(cp)
    decals.extend(cd)

    prims.append(Capsule('sleeveF', 'robe', 6.0, shF, elbowF, 2.8, 3.6))
    prims.append(Capsule('foreF', 'husk', 6.05, elbowF, handF, 1.7, 1.4))
    prims.append(Ellipse('handF', 'husk', 6.7, handF, 1.9, 1.9))

    pivot = p['pivot'] or FEET
    if p['censerAt'] is not None and p['rot']:
        # o incensário caído não gira com o corpo
        body = [q for q in prims if q.name not in ('censer', 'lid', 'ring', 'foot', 'link')]
        loose = [q for q in prims if q.name in ('censer', 'lid', 'ring', 'foot', 'link')]
        bd = [d for d in decals if d.clip != 'censer']
        rb, rd = rotate_all(body, bd, pivot, p['rot'], p['off'])
        return rb + loose, rd + [d for d in decals if d.clip == 'censer']
    return rotate_all(prims, decals, pivot, p['rot'], p['off'])


# ---------- animações ----------
def idle():
    out = []
    for i, b in enumerate((0.0, 0.5, 1.0, 0.5)):
        out.append(dict(hip=(0, b), armF=(34, 56 - b * 2), ca=(-5, 2, 6, 1)[i], hem=b * 0.4))
    return out


def walk(n=6):
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s = math.sin(ph)
        c = math.cos(ph)
        out.append(dict(
            hip=(0.0, -abs(c) * 1.0 + 0.5),
            legF=(6 + 14 * s, 4 + max(0, -c) * 18), footF=-6 * max(0, -c),
            legB=(-4 - 14 * s, 4 + max(0, c) * 18), footB=-6 * max(0, c),
            armF=(34 + 3 * s, 54), ca=-14 * c + 4, hem=1.6 * s, lean=3,
        ))
    return out


def windup():
    return [
        dict(armF=(200, -10), ca=250, cl=19, lean=-8, hip=(-1, 0.5), legF=(16, 10), legB=(-14, 8), glow=True, tilt=-6, hem=-1),
        dict(armF=(212, -14), ca=214, cl=20, lean=-12, hip=(-2, 1), legF=(18, 12), legB=(-16, 10), glow=True, tilt=-10, hem=-1.5),
    ]


def swing():
    return [
        dict(armF=(168, 4), ca=160, cl=21, lean=0, hip=(1, 1), legF=(22, 12), legB=(-18, 8), glow=True),
        dict(armF=(118, 0), ca=104, cl=22, lean=10, hip=(3, 2), legF=(28, 14), legB=(-22, 6), glow=True, hem=2),
        dict(armF=(76, 4), ca=58, cl=22, lean=18, hip=(4, 3), legF=(30, 18), legB=(-24, 6), glow=True, hem=2.5),
    ]


def recover():
    ground = (98.0, 87.0)
    return [
        dict(armF=(60, 10), censerAt=ground, lean=22, hip=(4, 4), legF=(30, 20), legB=(-24, 8), hem=2),
        dict(armF=(50, 20), censerAt=(92.0, 87.0), lean=14, hip=(2, 3), legF=(22, 16), legB=(-18, 8), hem=1),
    ]


def stagger():
    return [
        dict(armF=(170, -30), ca=228, cl=18, lean=-16, hip=(-3, 1.5), legF=(14, 8), legB=(-18, 12), tilt=-16, hem=-2),
        dict(armF=(150, -40), ca=250, cl=18, lean=-12, hip=(-2, 1), legF=(12, 8), legB=(-16, 10), tilt=-10, hem=-1),
    ]


def hurt():
    return [dict(lean=-9, hip=(-2, 1), armF=(60, 40), ca=-30, legF=(12, 8), legB=(-14, 10), tilt=-10)]


def death():
    piv = (58.0, 91.0)
    return [
        dict(lean=-10, hip=(-2, 2), armF=(70, 40), ca=-40, tilt=-12),
        dict(hip=(0, 11), legF=(70, 120), legB=(-20, 110), lean=16, armF=(30, 20), ca=20, cl=14, tilt=14),
        dict(rot=36, pivot=piv, off=(0, -6), hip=(0, 11), legF=(70, 120), legB=(-20, 110), lean=18, armF=(20, 10), tilt=14,
             censerAt=(96.0, 87.0)),
        dict(rot=80, pivot=piv, off=(-6, -12), hip=(0, 11), legF=(60, 110), legB=(-10, 100), lean=18, armF=(10, 0), tilt=8,
             censerAt=(106.0, 87.0)),
    ]


ANIMS = {
    'idle': (idle(), 5, True),
    'walk': (walk(), 8, True),
    'windup': (windup(), 4, False),
    'swing': (swing(), 14, False),
    'recover': (recover(), 4, False),
    'stagger': (stagger(), 6, False),
    'hurt': (hurt(), 10, False),
    'death': (death(), 8, False),
}

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    sheet, meta = build_sheet('censer', ANIMS, build, W, H, FEET, out, preview='censer_preview.png')
    meta['points'] = {name: [censer_point(pose) for pose in poses] for name, (poses, _, _) in ANIMS.items()}
    json.dump(meta, open(f'{out}/censer.json', 'w'), indent=1)
    print('censer', sheet.size)

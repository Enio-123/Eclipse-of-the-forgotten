"""Guarda do Dízimo: armadura escura, tabardo cinza, elmo fechado e um escudo-torre com a moeda
de olho dourado na frente. O escudo fica na mão da frente (cobre o corpo todo de frente) e a
espada na mão de trás, por cima do escudo, para o golpe ser bem visível.

uso: python3 guard.py <pasta_assets>
"""
import math
import sys
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot
from rig import rotate_all, build_sheet

W, H = 128, 96
BASE_HIP = (56.0, 66.0)
FEET = (56, 92)

DEFAULT = dict(
    hip=(0.0, 0.0), lean=0.0, tilt=0.0,
    legF=(8.0, 6.0), legB=(-7.0, 6.0), footF=0.0, footB=0.0,
    armS=(28.0, 62.0), sAng=0.0, sLift=0.0,
    armW=(150.0, -40.0), wpn=118.0, swordFront=False,
    glow=False, rot=0.0, pivot=None, off=(0.0, 0.0), noShield=False, shieldDrop=None,
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


def build(pose):
    p = P(pose)
    prims, decals = [], []
    hip = add(BASE_HIP, p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))
    f = (math.cos(lean), math.sin(lean))
    neck = add(hip, u, 19.0)
    shF = add(add(neck, f, 3.0), u, -3.0)
    shB = add(add(neck, f, -2.5), u, -3.0)
    head = add(add(neck, u, 7.5), f, 1.5)

    # ---------- pernas (grevas de aço) ----------
    def leg(root, ang, z, shade, footang):
        th, kn = ang
        knee = add(root, dirv(th), 10.5)
        ankle = add(knee, dirv(th - kn), 10.0)
        fa = math.radians(footang)
        toe = add(ankle, (math.cos(fa), math.sin(fa)), 5.4)
        heel = add(ankle, (math.cos(fa), math.sin(fa)), -1.6)
        prims.append(Capsule('thigh', 'steel', z, root, knee, 3.8, 3.2, shade=shade))
        prims.append(Capsule('shin', 'steel', z + 0.05, knee, ankle, 3.1, 2.6, shade=shade))
        prims.append(Ellipse('knee', 'steel', z + 0.08, add(knee, f, 0.8), 2.8, 2.4, shade=shade))
        prims.append(Capsule('foot', 'leather', z + 0.04, heel, toe, 2.4, 2.0, shade=shade))

    leg(add(hip, f, -2.0), p['legB'], 1.5, 0.6, p['footB'])
    leg(add(hip, f, 2.0), p['legF'], 4.0, 1.0, p['footF'])

    # ---------- tronco: peitoral, tabardo e ombreiras ----------
    prims.append(Capsule('belly', 'cloth', 3.0, add(hip, u, 2.0), add(neck, u, -4.0), 6.2, 6.8))
    chest = add(add(neck, u, -6.5), f, 1.2)
    prims.append(Ellipse('chest', 'steel', 3.6, chest, 7.2, 7.4, ang=lean))
    tab = [add(add(neck, f, -5.0), u, -4.0), add(add(neck, f, 6.4), u, -4.0), add(add(hip, f, 7.6), u, -11.0),
           add(add(hip, f, 1.0), u, -9.0), add(add(hip, f, -6.8), u, -11.5)]

    def tab_n(x, y):
        return norm((0.25 * math.sin(x * 0.9), -0.2, 0.95))

    tabard = Poly('tabard', 'robe', 3.7, tab, nf=tab_n)
    prims.append(tabard)

    def tab_decal(x, y, cur):
        # barra dourada embaixo e a moeda do dízimo no peito
        d = abs((y - (hip[1] + 9.5)) - (x - hip[0]) * 0.12)
        if d < 0.9 and y > hip[1] + 4:
            return ('gold', 2)
        return None

    decals.append(Decal('tabard', tab_decal))
    belt = add(hip, u, 1.5)
    prims.append(Capsule('belt', 'leather', 3.8, add(belt, f, -6.6), add(belt, f, 6.8), 1.4, 1.4))
    prims.append(Ellipse('buckle', 'gold', 3.85, add(belt, f, 4.0), 1.3, 1.2))
    prims.append(Ellipse('pauldronB', 'steel', 2.2, add(shB, u, 1.0), 4.6, 3.8, ang=lean, shade=0.65))

    # ---------- elmo fechado ----------
    tilt = math.radians(p['tilt'])
    hl = lambda q: add(head, rot(q, tilt))
    helm = Ellipse('helm', 'steel', 5.0, head, 6.2, 7.4, ang=tilt, bulge=0.85)
    prims.append(helm)
    crest = [hl((-4.5, -6.8)), hl((-1.0, -9.6)), hl((3.0, -8.6)), hl((1.0, -6.8))]
    prims.append(Poly('crest', 'gold', 5.05, crest, nf=lambda x, y: norm((-0.3, -0.7, 0.6))))
    prims.append(Capsule('gorget', 'steel', 4.8, add(neck, u, 1.0), add(add(neck, u, 1.0), f, 3.0), 3.6, 3.4, shade=0.8))

    def helm_decal(x, y, cur):
        lx, ly = helm.local(x, y)
        # fenda dos olhos (brilha dourado quando ele prepara o golpe) e furos de respiro
        if -2.2 < ly < -0.9 and 0.5 < lx < 6.4:
            if p['glow'] and 3.0 < lx < 5.2:
                return ('gold', 4)
            return ('void', 0)
        if 1.8 < ly < 4.6 and 3.2 < lx < 6.2 and (int((ly + 10) * 1.2) % 2 == 0) and (int((lx + 10) * 1.3) % 2 == 0):
            return ('void', 1)
        if abs(lx - 0.2) < 0.45 and -7 < ly < 6:
            return ('steel', 1)
        return None

    decals.append(Decal('helm', helm_decal))

    # ---------- braço da espada (atrás) ----------
    def arm(root, ang, z, shade):
        up, el = ang
        elbow = add(root, dirv(up), 8.4)
        hand = add(elbow, dirv(up + el), 7.6)
        prims.append(Capsule('upperarm', 'cloth', z, root, elbow, 2.8, 2.5, shade=shade))
        prims.append(Capsule('forearm', 'steel', z + 0.05, elbow, hand, 2.7, 2.4, shade=shade))
        prims.append(Ellipse('gauntlet', 'steel', z + 0.1, hand, 2.4, 2.3, shade=shade))
        return hand, up + el

    zW = 7.6 if p['swordFront'] else 2.4
    handW, foreW = arm(shB, p['armW'], zW, 1.0 if p['swordFront'] else 0.8)
    sd = dirv(p['wpn'] if p['wpn'] is not None else foreW)
    sp = (sd[1], -sd[0])
    g0 = add(handW, sd, 2.0)
    prims.append(Capsule('blade', 'steel', zW + 0.2, add(handW, sd, 2.6), add(handW, sd, 31.0), 1.7, 0.7))
    prims.append(Capsule('fuller', 'steel', zW + 0.21, add(handW, sd, 4.0), add(handW, sd, 24.0), 0.45, 0.35, flat=4))
    prims.append(Capsule('guard', 'gold', zW + 0.25, add(g0, sp, -4.4), add(g0, sp, 4.4), 1.2, 1.2))
    prims.append(Ellipse('pommel', 'gold', zW + 0.25, add(handW, sd, -3.0), 1.6, 1.6))

    # ---------- braço do escudo (frente) ----------
    handS, _ = arm(shF, p['armS'], 6.0, 1.0)
    prims.append(Ellipse('pauldronF', 'steel', 6.4, add(shF, u, 1.2), 5.2, 4.2, ang=lean))
    if not p['noShield']:
        if p['shieldDrop'] is not None:
            sc, sa = p['shieldDrop']
            sz = 1.2
        else:
            sc = add(add(handS, f, 2.5), u, p['sLift'])
            sa = math.radians(p['sAng']) + lean * 0.5
            sz = 6.8
        hw, hh = 8.2, 17.5
        pts = []
        for i in range(24):
            t = i / 24 * 2 * math.pi
            # retângulo de cantos redondos, mais estreito embaixo (escudo-torre)
            cx, cy = math.cos(t), math.sin(t)
            k = 1.0 / max(abs(cx) ** 4 + abs(cy) ** 4, 1e-6) ** 0.25
            x, y = cx * k * hw * (0.86 if cy > 0 else 1.0), cy * k * hh
            pts.append(add(sc, rot((x, y), sa)))
        shield = Poly('shield', 'ebony', sz, pts, nf=lambda x, y: norm((0.25 - 0.06 * (x - sc[0]), -0.25 - 0.02 * (y - sc[1]), 0.92)))
        prims.append(shield)

        def shield_decal(x, y, cur):
            lx, ly = rot((x - sc[0], y - sc[1]), -sa)
            ex = abs(lx) / (hw * (0.86 if ly > 0 else 1.0))
            ey = abs(ly) / hh
            edge = (ex ** 4 + ey ** 4) ** 0.25
            if edge > 0.86:
                return ('steel', 3 if lx < 0 and ly < 0 else 2)
            if abs(lx) < 0.6 and edge > 0.3:
                return ('steel', 1)
            r = math.hypot(lx, ly + 2.0)
            if r < 4.6:
                if r > 3.6:
                    return ('gold', 3 if lx < 0 else 2)
                if abs(ly + 2.0) < 1.1 and abs(lx) < 2.4:
                    if abs(lx) < 0.7:
                        return ('void', 0)
                    return ('gold', 4 if p['glow'] else 3)
                return ('gold', 1)
            return None

        decals.append(Decal('shield', shield_decal))

    pivot = p['pivot'] or FEET
    return rotate_all(prims, decals, pivot, p['rot'], p['off'])


# ---------- animações ----------
def idle():
    return [dict(hip=(0, b), armS=(28, 62 - b), armW=(150, -40 + b * 2), wpn=118 - b) for b in (0.0, 0.5, 1.0, 0.5)]


def walk(n=6):
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s = math.sin(ph)
        c = math.cos(ph)
        out.append(dict(
            hip=(0.0, -abs(c) * 1.2 + 0.6),
            legF=(6 + 16 * s, 4 + max(0, -c) * 22 + max(0, s) * 4), footF=-8 * max(0, -c),
            legB=(-4 - 16 * s, 4 + max(0, c) * 22 + max(0, -s) * 4), footB=-8 * max(0, c),
            armS=(28 + 3 * s, 62), armW=(150, -40), wpn=118 + 3 * s, lean=2,
        ))
    return out


def turn():
    return [dict(armS=(10, 40), lean=-2, hip=(0, 1)), dict(armS=(4, 30), lean=-4, hip=(-1, 1.5))]


def block():
    return [dict(armS=(46, 46), lean=7, hip=(-1.5, 1.2), legF=(14, 14), legB=(-16, 10), sLift=1.5, armW=(160, -50), wpn=130)]


def slash_windup():
    return [
        dict(armW=(188, 10), wpn=205, lean=-6, hip=(-1, 0.5), armS=(20, 58), legF=(14, 10), legB=(-12, 8), glow=True),
        dict(armW=(200, 18), wpn=222, lean=-9, hip=(-2, 1), armS=(16, 56), legF=(16, 12), legB=(-14, 10), glow=True),
    ]


def slash_strike():
    return [
        dict(armW=(112, -6), wpn=96, swordFront=True, lean=10, hip=(3, 1.5), armS=(12, 40), legF=(26, 12), legB=(-20, 6)),
        dict(armW=(84, 6), wpn=74, swordFront=True, lean=13, hip=(4, 2), armS=(8, 34), legF=(28, 14), legB=(-22, 6)),
    ]


def slash_recover():
    return [dict(armW=(120, -10), wpn=100, lean=6, hip=(2, 1), armS=(20, 52), legF=(18, 10), legB=(-14, 6))]


def bash_windup():
    return [dict(armS=(16, 52), lean=12, hip=(-3, 4), legF=(24, 30), legB=(-18, 26), armW=(160, -60), wpn=140, glow=True)]


def bash_lunge():
    return [
        dict(armS=(62, 20), lean=18, hip=(6, 2.5), legF=(38, 10), legB=(-30, 4), footB=-10, armW=(150, -60), wpn=130, sLift=3),
        dict(armS=(70, 12), lean=20, hip=(9, 3), legF=(40, 8), legB=(-32, 2), footB=-12, armW=(150, -60), wpn=130, sLift=4),
    ]


def bash_recover():
    return [dict(armS=(34, 50), lean=8, hip=(4, 1.5), legF=(20, 10), legB=(-14, 6), armW=(150, -45), wpn=120)]


def trip():
    piv = (56.0, 90.0)
    return [
        dict(rot=-14, pivot=piv, legF=(50, 6), legB=(36, 10), footF=-30, armS=(40, 30), armW=(170, -30), wpn=170, lean=-4),
        dict(rot=-40, pivot=piv, off=(8, 0), legF=(64, 4), legB=(50, 8), footF=-40, armS=(70, 20), armW=(190, -10), wpn=200, lean=-6),
        dict(rot=-72, pivot=piv, off=(20, 0), legF=(70, 10), legB=(58, 14), footF=-40, armS=(90, 10), armW=(200, 0), wpn=210, lean=-6),
    ]


def down():
    piv = (56.0, 66.0)
    base = dict(rot=-88, pivot=piv, legF=(40, 50), legB=(30, 60), footF=-20, footB=-20, armW=(190, 10), wpn=200,
                noShield=True)
    return [dict(base, off=(4, 20)), dict(base, off=(4, 19.5), armS=(60, 30))]


def getup():
    piv = (56.0, 90.0)
    return [
        dict(rot=-50, pivot=piv, off=(12, 0), legF=(80, 100), legB=(60, 110), armS=(120, 10), armW=(200, 10), wpn=210),
        dict(rot=-18, pivot=piv, off=(-1, 3), hip=(0, 6), legF=(40, 80), legB=(-10, 70), armS=(60, 30), armW=(170, -20), wpn=160, lean=14),
        dict(hip=(0, 2), legF=(16, 24), legB=(-10, 20), armS=(30, 56), armW=(155, -40), wpn=122, lean=6),
    ]


def hurt():
    return [dict(lean=-9, hip=(-2, 1), armS=(16, 44), armW=(170, -60), wpn=150, legF=(12, 8), legB=(-14, 10))]


def death():
    piv = (56.0, 90.0)
    return [
        dict(lean=-10, hip=(-2, 2), armS=(10, 30), armW=(170, -60), wpn=150, glow=False),
        dict(hip=(0, 9), legF=(70, 120), legB=(-20, 110), lean=18, armS=(0, 20), armW=(60, 0), wpn=40),
        dict(rot=34, pivot=piv, off=(0, -8), hip=(0, 9), legF=(70, 120), legB=(-20, 110), lean=20, armS=(-10, 10), armW=(40, 0), wpn=20,
             shieldDrop=((82.0, 86.0), math.radians(80))),
        dict(rot=78, pivot=piv, off=(-6, -14), hip=(0, 9), legF=(60, 110), legB=(-10, 100), lean=20, armS=(-20, 10), armW=(30, 0), wpn=10,
             noShield=False, shieldDrop=((90.0, 88.0), math.radians(90))),
    ]


def stagger():
    # golpe aparado: a espada voa para trás, o escudo sobe e abre o peito, ele cambaleia
    return [
        dict(armW=(212, 34), wpn=236, lean=-15, hip=(-3, 1.5), armS=(140, 14), sAng=-48, legF=(10, 6), legB=(-24, 12), tilt=-16),
        dict(armW=(204, 26), wpn=222, lean=-11, hip=(-2.5, 1.2), armS=(128, 18), sAng=-40, legF=(12, 6), legB=(-20, 10), tilt=-11),
    ]


ANIMS = {
    'idle': (idle(), 5, True),
    'walk': (walk(), 9, True),
    'turn': (turn(), 12, False),
    'block': (block(), 10, False),
    'windup': (slash_windup(), 8, False),
    'strike': (slash_strike(), 16, False),
    'recover': (slash_recover(), 8, False),
    'bashwind': (bash_windup(), 8, False),
    'bash': (bash_lunge(), 14, False),
    'bashrec': (bash_recover(), 8, False),
    'trip': (trip(), 12, False),
    'down': (down(), 3, True),
    'getup': (getup(), 8, False),
    'hurt': (hurt(), 10, False),
    'death': (death(), 8, False),
    'stagger': (stagger(), 6, False),
}

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    sheet, meta = build_sheet('guard', ANIMS, build, W, H, FEET, out, preview='guard_preview.png')
    print('guard', sheet.size)

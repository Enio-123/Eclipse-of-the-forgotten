"""Carcereiro da Prisão Subterrânea: grandalhão de capuz de couro com dois furos, avental de couro
por cima da camisa escura, cinto largo com o molho de chaves de latão e a corrente enrolada no
antebraço da frente, com o gancho pendurado. O punho de trás é de ferro (a pancada no chão).

uso: python3 jailer.py <pasta_assets>
"""
import math
import sys
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot
from rig import rotate_all, build_sheet

# couro do capuz (mais claro que o das botas), camisa cor de ferrugem e o avental curtido: quentes,
# para ele destacar da pedra fria da prisão
puppet.RAMPS['hide'] = [0x1a1210, 0x2e201b, 0x4a3328, 0x6a4b38, 0x8d6a4e]
puppet.RAMPS['tunic'] = [0x1c0f0e, 0x341917, 0x512722, 0x703a2f, 0x91543f]
puppet.RAMPS['apron'] = [0x17110d, 0x2a1f18, 0x433224, 0x5f4832, 0x7d6243]

W, H = 128, 96
BASE_HIP = (56.0, 64.0)
FEET = (56, 92)

DEFAULT = dict(
    hip=(0.0, 0.0), lean=0.0, tilt=0.0,
    legF=(8.0, 6.0), legB=(-7.0, 6.0), footF=0.0, footB=0.0,
    # braço da frente (corrente) e de trás (punho de ferro): ângulo do ombro e do cotovelo
    armF=(24.0, 50.0), armB=(-10.0, 40.0),
    # corrente pendurada da mão da frente: ângulo (0 = para baixo) e comprimento; None = o jogo desenha
    ca=8.0, cl=16.0, glow=False, rot=0.0, pivot=None, off=(0.0, 0.0),
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


def skeleton(p):
    hip = add(BASE_HIP, p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))
    f = (math.cos(lean), math.sin(lean))
    neck = add(hip, u, 21.0)
    shF = add(add(neck, f, 4.0), u, -3.0)
    shB = add(add(neck, f, -4.0), u, -3.0)
    head = add(add(neck, u, 6.5), f, 2.0)
    up, el = p['armF']
    elbowF = add(shF, dirv(up), 9.0)
    handF = add(elbowF, dirv(up + el), 8.0)
    upB, elB = p['armB']
    elbowB = add(shB, dirv(upB), 9.0)
    handB = add(elbowB, dirv(upB + elB), 8.0)
    return dict(hip=hip, lean=lean, u=u, f=f, neck=neck, shF=shF, shB=shB, head=head, elbowF=elbowF, handF=handF, elbowB=elbowB, handB=handB)


def points(pose):
    """Onde fica a mão da corrente em cada quadro (relativo aos pés), já com o giro do corpo."""
    p = P(pose)
    k = skeleton(p)
    x, y = k['handF']
    if p['rot']:
        piv = p['pivot'] or FEET
        a = math.radians(p['rot'])
        dx, dy = x - piv[0], y - piv[1]
        x = piv[0] + dx * math.cos(a) - dy * math.sin(a) + p['off'][0]
        y = piv[1] + dx * math.sin(a) + dy * math.cos(a) + p['off'][1]
    return {'hand': [round(x - FEET[0], 1), round(y - FEET[1], 1)]}


def chain(prims, a, b, z, sag=0.0):
    L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1e-6
    n = max(2, int(L / 2.4))
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag)
    prev = a
    for i in range(1, n + 1):
        t = i / n
        x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * mid[0] + t * t * b[0]
        y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * mid[1] + t * t * b[1]
        ang = math.atan2(y - prev[1], x - prev[0])
        c = ((prev[0] + x) / 2, (prev[1] + y) / 2)
        prims.append(Ellipse('link', 'steel', z, c, 1.5 if i % 2 else 1.2, 0.8 if i % 2 else 0.55, ang=ang, flat=3 if i % 2 else 1))
        prev = (x, y)
    return prev


def hook(prims, at, d, z):
    """Gancho de ferro na ponta da corrente, virado para trás."""
    side = (-d[1], d[0])
    tip = add(at, d, 4.2)
    prims.append(Capsule('hookshaft', 'steel', z, at, tip, 1.0, 0.9))
    back = add(add(tip, side, 2.8), d, -2.4)
    prims.append(Capsule('hookbend', 'steel', z + 0.02, tip, back, 0.9, 0.6))
    prims.append(Ellipse('hookring', 'steel', z - 0.02, at, 1.2, 1.2))


def build(pose):
    p = P(pose)
    k = skeleton(p)
    hip, u, f, neck, shF, shB, head, lean = (k[n] for n in ('hip', 'u', 'f', 'neck', 'shF', 'shB', 'head', 'lean'))
    elbowF, handF, elbowB, handB = k['elbowF'], k['handF'], k['elbowB'], k['handB']
    prims, decals = [], []

    # ---------- pernas: calça escura e botas de couro ----------
    def leg(root, ang, z, shade, footang):
        th, kn = ang
        knee = add(root, dirv(th), 11.0)
        ankle = add(knee, dirv(th - kn), 10.5)
        fa = math.radians(footang)
        toe = add(ankle, (math.cos(fa), math.sin(fa)), 6.0)
        heel = add(ankle, (math.cos(fa), math.sin(fa)), -2.0)
        prims.append(Capsule('thigh', 'cloth', z, root, knee, 4.6, 3.8, shade=shade))
        prims.append(Capsule('boot', 'leather', z + 0.05, add(knee, dirv(th - kn), 2.0), ankle, 3.6, 3.1, shade=shade))
        prims.append(Capsule('foot', 'leather', z + 0.04, heel, toe, 2.8, 2.3, shade=shade))

    leg(add(hip, f, -3.0), p['legB'], 1.5, 0.6, p['footB'])
    leg(add(hip, f, 3.0), p['legF'], 4.0, 1.0, p['footF'])

    # ---------- tronco largo, barriga e o avental de couro ----------
    prims.append(Capsule('belly', 'tunic', 3.0, add(hip, u, 3.0), add(neck, u, -4.0), 9.6, 9.0))
    chest = add(add(neck, u, -6.0), f, 1.0)
    prims.append(Ellipse('chest', 'tunic', 3.2, chest, 9.4, 8.2, ang=lean))
    apron = [add(add(neck, f, -2.0), u, -5.0), add(add(neck, f, 8.0), u, -5.0), add(add(hip, f, 10.6), u, -14.0),
             add(add(hip, f, 2.0), u, -12.5), add(add(hip, f, -5.0), u, -14.5)]

    def apron_n(x, y):
        return norm((0.3 * math.sin(x * 0.7) + 0.1, -0.25, 0.92))

    prims.append(Poly('apron', 'apron', 3.6, apron, nf=apron_n))

    def apron_dec(x, y, cur):
        # costuras e manchas escuras do avental
        lx, ly = rot((x - hip[0], y - hip[1]), -lean)
        if abs(ly - 6.0 - 0.12 * lx) < 0.5:
            return ('apron', 1)
        if (lx - 3) ** 2 + (ly + 3) ** 2 < 4.0:
            return ('apron', 1)
        return None

    decals.append(Decal('apron', apron_dec))
    belt = add(hip, u, 2.0)
    prims.append(Capsule('belt', 'leather', 3.8, add(belt, f, -9.6), add(belt, f, 9.8), 1.9, 1.9, shade=0.7))
    prims.append(Ellipse('buckle', 'steel', 3.85, add(belt, f, 6.0), 1.6, 1.5))
    # molho de chaves pendurado no cinto, do lado de trás
    ring = add(add(belt, f, -6.5), u, -3.0)
    prims.append(Ellipse('keyring', 'gold', 3.9, ring, 2.6, 2.6, shade=0.75, flat=2))
    prims.append(Ellipse('keyhole', 'void', 3.92, ring, 1.5, 1.5))
    for i, (dx, ln) in enumerate(((-1.6, 6.0), (0.2, 7.0), (1.8, 5.4))):
        a = add(ring, (dx, 2.0))
        b = add(a, (dx * 0.4, ln))
        prims.append(Capsule('key', 'gold', 3.95 + i * 0.01, a, b, 0.55, 0.5, shade=0.7))
        prims.append(Capsule('bit', 'gold', 3.96 + i * 0.01, b, add(b, (1.4, 0)), 0.5, 0.5, shade=0.7))

    # ---------- braço de trás: punho de ferro ----------
    def arm(sh, elbow, hand, z, shade, fist):
        prims.append(Capsule('upperarm', 'tunic', z, sh, elbow, 3.8, 3.4, shade=shade))
        prims.append(Capsule('forearm', 'flesh', z + 0.03, elbow, hand, 3.3, 2.9, shade=shade * 0.9))
        prims.append(Ellipse('fist', 'steel' if fist else 'leather', z + 0.08, hand, 3.4 if fist else 2.8, 3.1 if fist else 2.6, shade=shade))

    arm(shB, elbowB, handB, 2.2, 0.7, True)

    # ---------- cabeça: capuz de couro com dois furos ----------
    tilt = math.radians(p['tilt'])
    ha = lean + tilt
    hood = Ellipse('hood', 'hide', 5.0, head, 7.0, 8.0, ang=ha, bulge=0.9)
    prims.append(hood)
    prims.append(Capsule('neckhood', 'hide', 4.8, add(neck, u, 1.0), add(add(neck, u, -2.0), f, -2.0), 6.2, 7.0, shade=0.8))
    prims.append(Capsule('shoulders', 'hide', 4.7, add(add(neck, f, -6.0), u, -2.0), add(add(neck, f, 7.0), u, -2.5), 4.0, 4.0, shade=0.85))

    def hood_dec(x, y, cur):
        lx, ly = hood.local(x, y)
        # os dois furos dos olhos: pretos, ou acesos quando ele prepara o golpe
        for ex in (2.2, 5.0):
            if (lx - ex) ** 2 / 1.4 + (ly + 1.2) ** 2 / 0.9 < 1.0:
                return ('porcelain', 4) if p['glow'] else ('void', 0)
        # costura do capuz no meio
        if abs(lx - 0.4) < 0.4 and ly < -1:
            return ('hide', 1)
        # corda amarrando o capuz no pescoço
        if 5.2 < ly < 6.4 and -5 < lx < 6:
            return ('wood', 2)
        return None

    decals.append(Decal('hood', hood_dec))

    # ---------- braço da frente com a corrente enrolada e o gancho ----------
    arm(shF, elbowF, handF, 6.0, 1.0, False)
    fore = (handF[0] - elbowF[0], handF[1] - elbowF[1])
    fl = math.hypot(*fore) or 1
    fd = (fore[0] / fl, fore[1] / fl)
    fs = (-fd[1], fd[0])
    for i in range(4):
        c = add(add(elbowF, fd, 1.6 + i * 1.6), fs, 0.0)
        prims.append(Ellipse('coil', 'steel', 6.2 + i * 0.01, c, 1.2, 3.6, ang=math.atan2(fd[1], fd[0]), flat=3 if i % 2 else 2))
    if p['cl']:
        d = dirv(p['ca'])
        end = add(handF, d, p['cl'])
        last = chain(prims, handF, end, 6.3, sag=0.0)
        hook(prims, last, d, 6.32)

    pivot = p['pivot'] or FEET
    return rotate_all(prims, decals, pivot, p['rot'], p['off'])


# ---------- animações ----------
def idle():
    return [dict(hip=(0, b), armF=(24, 50 - b * 2), armB=(-10, 40 + b), ca=6 - b * 3) for b in (0.0, 0.6, 1.2, 0.6)]


def walk(n=6):
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s = math.sin(ph)
        c = math.cos(ph)
        out.append(dict(
            hip=(0.0, -abs(c) * 1.4 + 0.7),
            legF=(6 + 15 * s, 4 + max(0, -c) * 20 + max(0, s) * 4), footF=-8 * max(0, -c),
            legB=(-4 - 15 * s, 4 + max(0, c) * 20 + max(0, -s) * 4), footB=-8 * max(0, c),
            armF=(24 - 10 * s, 46), armB=(-10 + 12 * s, 36), ca=-10 * s, lean=4,
        ))
    return out


def lash_windup():
    # a corrente vai para trás, rodando por cima do ombro; os furos do capuz acendem
    return [
        dict(armF=(-60, 60), ca=-120, cl=16, lean=-6, hip=(-1.5, 1), legF=(14, 10), legB=(-14, 8), glow=True, armB=(30, 30)),
        dict(armF=(-80, 50), ca=-160, cl=16, lean=-10, hip=(-2.5, 1.5), legF=(16, 12), legB=(-16, 10), glow=True, armB=(40, 30)),
    ]


def lash():
    # braço esticado para a frente: a corrente estala reta (o jogo desenha ela)
    return [
        dict(armF=(88, 2), cl=0, lean=12, hip=(3, 1.5), legF=(26, 12), legB=(-22, 6), armB=(-30, 30), glow=True),
        dict(armF=(92, -2), cl=0, lean=14, hip=(4, 2), legF=(28, 14), legB=(-22, 6), armB=(-34, 30), glow=True),
    ]


def lash_recover():
    return [dict(armF=(60, 20), cl=0, lean=8, hip=(2, 1), legF=(18, 10), legB=(-14, 6), armB=(-20, 34)),
            dict(armF=(40, 40), ca=60, cl=12, lean=4, hip=(1, 0.5), legF=(12, 8), legB=(-10, 6), armB=(-14, 38))]


def slam_windup():
    # os dois punhos sobem juntos por cima da cabeça
    return [
        dict(armF=(170, 10), armB=(176, 4), ca=170, cl=10, lean=-8, hip=(-1, 1.5), legF=(16, 16), legB=(-16, 14), tilt=-10, glow=True),
        dict(armF=(186, 8), armB=(190, 2), ca=186, cl=10, lean=-12, hip=(-2, 2.5), legF=(18, 20), legB=(-18, 18), tilt=-14, glow=True),
    ]


def slam():
    # desce com tudo: o corpo dobra e os punhos batem no chão na frente
    return [
        dict(armF=(80, 30), armB=(76, 34), ca=40, cl=10, lean=34, hip=(5, 9), legF=(34, 40), legB=(-26, 34), tilt=10, glow=True),
        dict(armF=(70, 36), armB=(66, 40), ca=30, cl=10, lean=38, hip=(6, 11), legF=(36, 46), legB=(-28, 40), tilt=12),
    ]


def slam_recover():
    return [dict(armF=(60, 40), armB=(50, 40), ca=20, cl=12, lean=24, hip=(4, 7), legF=(28, 34), legB=(-20, 30), tilt=6),
            dict(armF=(40, 46), armB=(20, 40), ca=12, cl=14, lean=12, hip=(2, 3), legF=(18, 18), legB=(-12, 14))]


def hurt():
    return [dict(lean=-10, hip=(-2, 1), armF=(10, 40), armB=(-30, 30), ca=-30, tilt=-12, legF=(12, 8), legB=(-14, 10))]


def stagger():
    # corrente aparada: o braço voa para trás e ele cambaleia de peito aberto
    return [
        dict(armF=(-120, 40), ca=-150, cl=16, lean=-16, hip=(-3, 1.5), armB=(60, 20), legF=(10, 6), legB=(-24, 12), tilt=-16),
        dict(armF=(-110, 44), ca=-140, cl=16, lean=-12, hip=(-2.5, 1.2), armB=(50, 24), legF=(12, 6), legB=(-20, 10), tilt=-11),
    ]


def death():
    piv = (56.0, 90.0)
    return [
        dict(lean=-12, hip=(-2, 2), armF=(0, 30), armB=(-40, 30), ca=-30, tilt=-14),
        dict(hip=(0, 10), legF=(70, 120), legB=(-20, 110), lean=20, armF=(40, 20), armB=(30, 20), ca=10, tilt=10),
        dict(rot=40, pivot=piv, off=(0, -8), hip=(0, 10), legF=(70, 120), legB=(-20, 110), lean=22, armF=(60, 10), armB=(50, 10), ca=60, tilt=14),
        dict(rot=84, pivot=piv, off=(-4, -14), hip=(0, 10), legF=(60, 110), legB=(-10, 100), lean=22, armF=(80, 0), armB=(70, 0), ca=90, tilt=16),
    ]


ANIMS = {
    'idle': (idle(), 5, True),
    'walk': (walk(), 8, True),
    'lashwind': (lash_windup(), 5, False),
    'lash': (lash(), 14, False),
    'lashrec': (lash_recover(), 6, False),
    'slamwind': (slam_windup(), 5, False),
    'slam': (slam(), 14, False),
    'slamrec': (slam_recover(), 5, False),
    'hurt': (hurt(), 10, False),
    'stagger': (stagger(), 6, False),
    'death': (death(), 8, False),
}

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    sheet, meta = build_sheet('jailer', ANIMS, build, W, H, FEET, out, preview='jailer_preview.png')
    print('jailer', sheet.size)

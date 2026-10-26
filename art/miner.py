"""Mineiro esquecido das Minas Abandonadas: magro e curvado de anos de túnel, capacete de couro com o
suporte de vela apagado na frente, camisa desbotada com suspensório, a picareta curta na mão da frente
e o Âmbar que cresceu nas costas dele (a pedra bebeu a memória e ficou). Os olhos acendem cor de
Âmbar quando ele vai pular.

uso: python3 ink_sheets.py <pasta_assets> miner
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot
from rig import rotate_all

# camisa de algodão desbotada pelo pó, calça de lona, couro do capacete e a pele acinzentada de quem
# não vê o sol faz tempo; o Âmbar brilha sozinho no miolo
puppet.RAMPS['mshirt'] = [0x17130f, 0x2b241b, 0x463a2a, 0x66563d, 0x8a7754]
puppet.RAMPS['canvas'] = [0x111113, 0x1e1e22, 0x313036, 0x47454c, 0x625f66]
puppet.RAMPS['ashen'] = [0x1b1615, 0x352b27, 0x56473f, 0x7a6a5e, 0xa08f80]
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
puppet.SHINY.setdefault('amber', (0.7, 16))

W, H = 96, 84
BASE_HIP = (44.0, 58.0)
FEET = (44, 80)

DEFAULT = dict(
    hip=(0.0, 0.0), lean=14.0, tilt=0.0,
    legF=(8.0, 10.0), legB=(-6.0, 10.0), footF=0.0, footB=0.0,
    # braço da frente (picareta) e de trás: ângulo do ombro e do cotovelo
    armF=(30.0, 50.0), armB=(-14.0, 40.0),
    # picareta: ângulo do cabo (0 = para baixo, 90 = para a frente, 180 = para cima)
    pick=40.0, glow=False, rot=0.0, pivot=None, off=(0.0, 0.0),
    # o mineiro que ficou (NPC): sem o Âmbar nas costas (só uma lasquinha no ombro), a vela do
    # capacete acesa, olhos de gente e o caixote onde ele senta
    npc=False, seat=False,
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
    neck = add(hip, u, 17.0)
    shF = add(add(neck, f, 3.0), u, -2.5)
    shB = add(add(neck, f, -3.0), u, -2.5)
    head = add(add(neck, u, 5.0), f, 3.0)
    up, el = p['armF']
    elbowF = add(shF, dirv(up), 8.0)
    handF = add(elbowF, dirv(up + el), 7.0)
    upB, elB = p['armB']
    elbowB = add(shB, dirv(upB), 8.0)
    handB = add(elbowB, dirv(upB + elB), 7.0)
    return dict(hip=hip, lean=lean, u=u, f=f, neck=neck, shF=shF, shB=shB, head=head, elbowF=elbowF, handF=handF, elbowB=elbowB, handB=handB)


def tip_point(pose):
    """A ponta da picareta (onde o golpe acerta), relativa aos pés, já com o giro do corpo."""
    p = P(pose)
    k = skeleton(p)
    d = dirv(p['pick'])
    x, y = add(k['handF'], d, 12.0)
    if p['rot']:
        piv = p['pivot'] or FEET
        a = math.radians(p['rot'])
        dx, dy = x - piv[0], y - piv[1]
        x = piv[0] + dx * math.cos(a) - dy * math.sin(a) + p['off'][0]
        y = piv[1] + dx * math.sin(a) + dy * math.cos(a) + p['off'][1]
    return {'tip': [round(x - FEET[0], 1), round(y - FEET[1], 1)]}


def pickaxe(prims, hand, d, z):
    """Picareta curta: cabo de madeira gasto, cabeça de ferro de través com a ponta curva."""
    LEN = 13.0
    butt = add(hand, d, -2.5)
    top = add(hand, d, LEN - 2.5)
    prims.append(Capsule('haft', 'wood', z, butt, top, 0.9, 0.8, shade=0.9))
    side = (d[1], -d[0])

    def H(a, b):
        return add(add(top, side, a), d, -b)

    outline = [H(-3.6, -0.8), H(-3.8, 1.6), H(-1.0, 1.3), H(2.0, 1.2), H(4.6, 2.0), H(6.8, 3.4), H(7.4, 3.1),
               H(5.2, 0.9), H(2.0, -1.1), H(-1.0, -1.4)]
    prims.append(Poly('phead', 'steel', z + 0.05, outline, nf=lambda x, y: norm((0.0, -0.6, 0.8)), shade=0.9))


def amber_shard(prims, base, ang, ln, wd, z, glow):
    """Lasca de Âmbar saindo do corpo: triângulo comprido com o miolo claro."""
    d = (math.cos(ang), math.sin(ang))
    n = (-d[1], d[0])
    tipp = add(base, d, ln)
    prims.append(Poly('shard', 'amber', z, [add(base, n, wd), tipp, add(base, n, -wd)],
                      nf=lambda x, y: norm((n[0] * 0.5, n[1] * 0.5 - 0.3, 0.8)), flat=4 if glow else None))
    prims.append(Capsule('shardcore', 'amber', z + 0.01, add(base, d, ln * 0.2), add(base, d, ln * 0.7), wd * 0.3, wd * 0.12, flat=4))


def build(pose):
    p = P(pose)
    k = skeleton(p)
    hip, u, f, neck, shF, shB, head, lean = (k[n] for n in ('hip', 'u', 'f', 'neck', 'shF', 'shB', 'head', 'lean'))
    elbowF, handF, elbowB, handB = k['elbowF'], k['handF'], k['elbowB'], k['handB']
    prims, decals = [], []

    # ---------- pernas: calça de lona e botinas gastas ----------
    def leg(root, ang, z, shade, footang):
        th, kn = ang
        knee = add(root, dirv(th), 9.0)
        ankle = add(knee, dirv(th - kn), 9.0)
        fa = math.radians(footang)
        toe = add(ankle, (math.cos(fa), math.sin(fa)), 5.0)
        heel = add(ankle, (math.cos(fa), math.sin(fa)), -1.6)
        prims.append(Capsule('thigh', 'canvas', z, root, knee, 3.2, 2.7, shade=shade))
        prims.append(Capsule('shin', 'canvas', z + 0.02, knee, ankle, 2.7, 2.3, shade=shade))
        prims.append(Capsule('boot', 'leather', z + 0.05, add(knee, dirv(th - kn), 5.0), ankle, 2.6, 2.4, shade=shade))
        prims.append(Capsule('foot', 'leather', z + 0.04, heel, toe, 2.1, 1.8, shade=shade))

    leg(add(hip, f, -2.0), p['legB'], 1.5, 0.6, p['footB'])
    leg(add(hip, f, 2.0), p['legF'], 4.0, 1.0, p['footF'])

    # ---------- tronco magro e curvado, camisa e suspensório ----------
    prims.append(Capsule('belly', 'mshirt', 3.0, add(hip, u, 2.0), add(neck, u, -3.0), 6.0, 6.4))
    chest = add(add(neck, u, -5.0), f, 1.0)
    prims.append(Ellipse('chest', 'mshirt', 3.2, chest, 6.6, 6.0, ang=lean))

    def shirt_dec(x, y, cur):
        lx, ly = rot((x - hip[0], y - hip[1]), -lean)
        # suspensório: duas tiras de couro do cinto aos ombros
        if abs(lx - 2.4 - ly * 0.06) < 0.7 and ly < -1:
            return ('leather', 1)
        # remendo e rasgão da camisa
        if (lx + 2.5) ** 2 + (ly + 9) ** 2 < 2.2:
            return ('mshirt', 1)
        return None

    decals.append(Decal('chest', shirt_dec))
    decals.append(Decal('belly', shirt_dec))
    belt = add(hip, u, 1.5)
    prims.append(Capsule('belt', 'leather', 3.8, add(belt, f, -6.4), add(belt, f, 6.6), 1.4, 1.4, shade=0.7))
    pouch = add(add(belt, f, -4.0), u, -2.6)
    prims.append(Ellipse('pouch', 'leather', 3.9, pouch, 2.0, 2.6, shade=0.8))

    # ---------- o Âmbar que cresceu nas costas ----------
    back = add(add(neck, f, -5.0), u, -6.0)
    # as lascas apontam para cima e para trás
    base_a = math.atan2(u[1] - f[1] * 0.7, u[0] - f[0] * 0.7)
    if p['npc']:
        # nele o Âmbar só começou: uma lasquinha no ombro de trás
        amber_shard(prims, add(shB, u, 1.0), base_a + 0.5, 3.6, 1.0, 2.6, False)
    else:
        for i, (dl, da, ln, wd) in enumerate(((0.0, 0.0, 11.0, 2.4), (-3.0, 0.38, 8.4, 2.0), (3.2, -0.32, 9.0, 2.0), (-6.0, 0.64, 6.0, 1.5))):
            amber_shard(prims, add(back, u, dl), base_a + da, ln, wd, 2.6 + i * 0.01, p['glow'])
        prims.append(Ellipse('amberbase', 'amber', 2.7, back, 3.6, 2.4, ang=lean, shade=0.7))
    if p['seat']:
        # o caixote virado onde ele senta (embaixo do quadril, nos pés da sala)
        sx = hip[0] - 3.0
        prims.append(Poly('crate', 'wood', 0.5, [(sx - 9.0, hip[1] + 1.0), (sx + 8.0, hip[1] + 1.0), (sx + 8.0, FEET[1] + 0.4), (sx - 9.0, FEET[1] + 0.4)],
                          nf=lambda x, y: norm((0.0, -0.1, 1.0)), shade=0.8))
        prims.append(Capsule('cratelid', 'wood', 0.52, (sx - 9.6, hip[1] + 1.2), (sx + 8.6, hip[1] + 1.2), 1.0, 1.0, shade=1.0))

        def crate_dec(x, y, cur, sx=sx, top=hip[1] + 1.0):
            if abs(((y - top) % 5.0) - 5.0) < 0.4 or ((y - top) % 5.0) < 0.3:
                return ('wood', 0)
            return None

        decals.append(Decal('crate', crate_dec))

    # ---------- braço de trás ----------
    def arm(sh, elbow, hand, z, shade):
        prims.append(Capsule('upperarm', 'mshirt', z, sh, elbow, 2.6, 2.3, shade=shade))
        prims.append(Capsule('forearm', 'ashen', z + 0.03, elbow, hand, 2.2, 1.9, shade=shade * 0.9))
        prims.append(Ellipse('hand', 'ashen', z + 0.08, hand, 2.0, 1.8, shade=shade))

    arm(shB, elbowB, handB, 2.2, 0.7)

    # ---------- cabeça: rosto magro, capacete de couro com o suporte da vela apagado ----------
    tilt = math.radians(p['tilt'])
    ha = lean + tilt
    face_e = Ellipse('face', 'ashen', 5.0, head, 4.6, 5.2, ang=ha, bulge=0.9)
    prims.append(face_e)
    prims.append(Capsule('neckm', 'ashen', 4.8, add(neck, u, 1.0), add(head, u, -3.0), 2.2, 2.4, shade=0.8))
    hd = (math.sin(ha), -math.cos(ha))
    hf = (math.cos(ha), math.sin(ha))
    cap_c = add(head, hd, 3.8)
    prims.append(Ellipse('helmet', 'leather', 5.2, cap_c, 5.0, 3.0, ang=ha, bulge=0.85))
    prims.append(Capsule('brim', 'leather', 5.25, add(add(cap_c, hd, -2.0), hf, -5.2), add(add(cap_c, hd, -1.8), hf, 6.2), 0.9, 0.9, shade=0.75))
    holder = add(add(cap_c, hd, 0.6), hf, 4.4)
    prims.append(Ellipse('holder', 'steel', 5.3, holder, 1.4, 1.2, shade=0.8))
    prims.append(Capsule('candle', 'bone', 5.32, add(holder, hd, 0.6), add(holder, hd, 2.6), 0.8, 0.7, shade=0.7))
    if p['npc']:
        # a vela do capacete acesa: é a única luz dele
        fl = add(holder, hd, 4.2)
        prims.append(Ellipse('flame', 'amber', 5.34, fl, 1.0, 1.7, ang=ha, flat=3))
        prims.append(Ellipse('flamec', 'amber', 5.35, add(fl, hd, -0.4), 0.5, 0.8, ang=ha, flat=4))

    def face_dec(x, y, cur):
        lx, ly = face_e.local(x, y)
        # olho fundo: escuro, ou aceso cor de Âmbar quando ele prepara o pulo
        if (lx - 2.4) ** 2 / 1.5 + (ly + 0.4) ** 2 / 0.9 < 1.0:
            if p['npc']:
                # olho de gente: claro com a pupila escura
                return ('void', 0) if (lx - 2.8) ** 2 + (ly + 0.4) ** 2 < 0.35 else ('bone', 3)
            return ('amber', 4) if p['glow'] else ('void', 0)
        # boca entreaberta e a barba rala
        if 2.4 < ly < 3.0 and 0.6 < lx < 3.4:
            return ('void', 0)
        if ly > 2.0 and lx < 1.5 and (int(lx * 3 + ly * 5) % 3 == 0):
            return ('bone', 2) if p['npc'] else ('ashen', 1)
        return None

    decals.append(Decal('face', face_dec))

    # ---------- braço da frente com a picareta ----------
    arm(shF, elbowF, handF, 6.0, 1.0)
    pickaxe(prims, handF, dirv(p['pick']), 6.3)

    pivot = p['pivot'] or FEET
    return rotate_all(prims, decals, pivot, p['rot'], p['off'])


# ---------- animações ----------
def idle():
    return [dict(hip=(0, b), armF=(30, 50 - b * 2), armB=(-14, 40 + b), pick=40 - b * 4, lean=14 + b) for b in (0.0, 0.5, 1.0, 0.5)]


def walk(n=6):
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s = math.sin(ph)
        c = math.cos(ph)
        out.append(dict(
            hip=(0.0, -abs(c) * 1.2 + 0.6),
            legF=(6 + 13 * s, 8 + max(0, -c) * 18 + max(0, s) * 4), footF=-8 * max(0, -c),
            legB=(-4 - 13 * s, 8 + max(0, c) * 18 + max(0, -s) * 4), footB=-8 * max(0, c),
            armF=(30 - 8 * s, 48), armB=(-14 + 12 * s, 36), pick=36 - 8 * s, lean=18,
        ))
    return out


def windup():
    # agacha para pular, a picareta sobe por cima do ombro e os olhos acendem
    return [
        dict(hip=(0, 4), legF=(20, 40), legB=(-16, 36), lean=26, armF=(150, 20), pick=200, armB=(30, 30), glow=True),
        dict(hip=(0, 6), legF=(24, 50), legB=(-18, 46), lean=30, armF=(168, 14), pick=220, armB=(40, 30), glow=True),
    ]


def leap():
    # no ar: o corpo estica, a picareta lá em cima
    return [
        dict(hip=(0, -4), legF=(30, 40), legB=(-30, 20), footF=20, lean=6, armF=(176, 6), pick=210, armB=(-40, 20), glow=True, tilt=-6),
        dict(hip=(0, -3), legF=(36, 50), legB=(-24, 30), footF=24, lean=10, armF=(170, 10), pick=200, armB=(-30, 24), glow=True, tilt=-4),
    ]


def strike():
    # desce com tudo: a ponta crava no chão na frente
    return [
        dict(hip=(0, 4), legF=(30, 36), legB=(-24, 30), lean=36, armF=(80, 20), pick=110, armB=(-10, 40), glow=True, tilt=8),
        dict(hip=(0, 6), legF=(32, 42), legB=(-26, 34), lean=42, armF=(60, 30), pick=150, armB=(-6, 40), glow=True, tilt=10),
    ]


def recover():
    return [dict(hip=(0, 4), legF=(26, 30), legB=(-20, 26), lean=34, armF=(60, 34), pick=140, armB=(-10, 40), tilt=8),
            dict(hip=(0, 2), legF=(14, 16), legB=(-10, 14), lean=22, armF=(40, 44), pick=80, armB=(-14, 40), tilt=4)]


def hurt():
    return [dict(lean=-4, hip=(-2, 1), armF=(10, 40), armB=(-34, 30), pick=10, tilt=-14, legF=(12, 12), legB=(-14, 14))]


def death():
    piv = (44.0, 78.0)
    return [
        dict(lean=-6, hip=(-2, 2), armF=(0, 30), armB=(-40, 30), pick=-20, tilt=-14),
        dict(hip=(0, 8), legF=(70, 110), legB=(-20, 100), lean=26, armF=(40, 20), armB=(30, 20), pick=60, tilt=10),
        dict(rot=40, pivot=piv, off=(0, -6), hip=(0, 8), legF=(70, 110), legB=(-20, 100), lean=28, armF=(60, 10), armB=(50, 10), pick=100, tilt=14),
        dict(rot=82, pivot=piv, off=(-3, -11), hip=(0, 8), legF=(60, 100), legB=(-10, 90), lean=28, armF=(80, 0), armB=(70, 0), pick=120, tilt=16),
    ]


def sit(b=0.0, talk=0.0):
    # sentado no caixote, as duas mãos no cabo da picareta em pé entre os joelhos; falando, a mão de
    # trás sobe um pouco
    return dict(npc=True, seat=True, hip=(-2.0, 9.0 + b * 0.4), legF=(84, 92), legB=(78, 88), footF=4, footB=2,
                lean=10 + b, tilt=-4 + talk * 6, armF=(64 - b * 2, 34), pick=176, armB=(36 + talk * 50, 60 - talk * 30))


NPC_ANIMS = {
    'idle': ([sit(b) for b in (0.0, 0.5, 1.0, 0.5)], 3, True),
    'talk': ([sit(0.3, 0.5), sit(0.6, 1.0), sit(0.3, 0.7), sit(0.0, 1.0)], 5, True),
}


ANIMS = {
    'idle': (idle(), 5, True),
    'walk': (walk(), 8, True),
    'windup': (windup(), 6, False),
    'leap': (leap(), 8, True),
    'strike': (strike(), 16, False),
    'recover': (recover(), 6, False),
    'hurt': (hurt(), 10, False),
    'death': (death(), 8, False),
}

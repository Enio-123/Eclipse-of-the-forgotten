"""Os Arquivados (Torres Rúnicas): gente cuja memória está nos frascos do Arquivo, só o corpo. A camisola
comprida e clara do Arquivo, os pés descalços, a pele cinza de quem não vê sol, os olhos fechados e a boca
mole. Na testa, a linha fina de Âmbar por onde a Casa tirou a lembrança (acende quando ele encosta e puxa
o Âmbar do cavaleiro). No peito, preso por um barbante no pescoço, o rótulo de papel com o número, como
o dos frascos. Anda devagar, arrastando os pés, com os dois braços estendidos para a frente.

Dois corpos: 0 de cabelo curto, 1 de cabelo comprido. Na Sala das Experiências eles ainda estão sentados
nas cadeiras (sit), com as mãos nos joelhos e a cabeça baixa, e levantam (getup) quando alguém chega perto.

O boneco olha para a direita (+x). As medidas estão em pixels do mundo.

uso: python3 ink_sheets.py <pasta_assets> archived
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot

puppet.RAMPS['archskin'] = [0x2b2c30, 0x4a4c52, 0x71747b, 0x9ea1a8, 0xc9cbd0]
puppet.RAMPS['archgown'] = [0x463f35, 0x6e6455, 0x9b8f7b, 0xc4b9a2, 0xe2d9c4]
puppet.RAMPS['archhair'] = [0x141110, 0x241e1b, 0x3a312b, 0x51453c, 0x6b5c50]
puppet.RAMPS.setdefault('paper', [0x3a3226, 0x6a5c46, 0x9c8b6c, 0xc9b892, 0xece0be])
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
puppet.RIM_MATS |= {'archgown', 'archhair'}

W, H = 72, 78
FEET = (32, 75)
BASE_HIP = (32.0, 55.0)

DEFAULT = dict(hip=(0.0, 0.0), lean=4.0, tilt=0.0, sway=0.0, legF=(6.0, 4.0), legB=(-5.0, 4.0),
               armF=(84.0, -2.0), armB=(86.0, -4.0), droop=20.0, glow=0, kind=0, sit=0)


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
    neck = add(hip, u, 14.0)
    head = add(add(neck, u, 5.2), f, 2.0)
    long_hair = p['kind'] == 1

    # ---------- pernas: as canelas e os pés descalços aparecem embaixo da camisola ----------
    def leg(root, ang, z, shade):
        th, kn = ang
        knee = add(root, dirv(th), 9.8)
        ankle = add(knee, dirv(th - kn), 9.4)
        prims.append(Capsule('shin', 'archskin', z, knee, ankle, 1.9, 1.4, shade=shade))
        prims.append(Capsule('foot', 'archskin', z + 0.05, add(ankle, (-1.2, 0.5)), add(ankle, (4.0, 0.9)), 1.6, 1.1, shade=shade * 0.9))

    leg(add(hip, f, -1.6), p['legB'], 1.5, 0.62)
    leg(add(hip, f, 1.8), p['legF'], 2.0, 0.9)

    # ---------- o braço de trás ----------
    def limb(root, ang, z, shade):
        up, el = ang
        elbow = add(root, dirv(up), 7.4)
        hand = add(elbow, dirv(up + el), 7.0)
        # a manga curta até o cotovelo, o antebraço de fora
        prims.append(Capsule('sleeve', 'archgown', z, root, add(root, dirv(up), 6.2), 2.2, 2.0, shade=shade))
        prims.append(Capsule('upper', 'archskin', z - 0.01, root, elbow, 1.6, 1.5, shade=shade * 0.9))
        prims.append(Capsule('fore', 'archskin', z + 0.05, elbow, hand, 1.5, 1.3, shade=shade * 0.9))
        # a mão aberta e mole: a palma e os dedos caídos para baixo
        a = math.radians(up + el)
        fd = dirv(up + el - p['droop'])
        prims.append(Ellipse('hand', 'archskin', z + 0.1, hand, 1.7, 1.4, ang=-a + math.pi / 2, shade=shade))
        prims.append(Capsule('fingers', 'archskin', z + 0.12, add(hand, fd, 0.8), add(hand, fd, 3.4), 1.1, 0.8, shade=shade))
        return hand

    shB = add(add(neck, f, -2.4), u, -2.2)
    shF = add(add(neck, f, 2.4), u, -2.4)
    limb(shB, p['armB'], 2.6, 0.7)

    # ---------- cabelo comprido caindo atrás ----------
    tilt = math.radians(p['tilt'])
    hl = lambda q: add(head, rot(q, lean + tilt))
    if long_hair:
        back = [hl((-5.0, -3.6)), hl((0.6, -6.0)), hl((-1.0, 2.0)), hl((-2.6, 10.6)), hl((-5.2, 12.4)), hl((-7.2, 9.0)), hl((-6.8, 1.0))]
        prims.append(Poly('hairback', 'archhair', 2.8, back, nf=lambda x, y: norm((0.3 * math.sin(y * 1.5 + x * 0.4), -0.3, 0.88)), shade=0.85))

    # ---------- a camisola comprida do Arquivo ----------
    sway = p['sway']
    top = [add(neck, f, -4.2), add(add(neck, f, 3.6), u, -0.4), add(add(neck, f, 6.0), u, -5.2), add(add(hip, f, 5.4), u, 2.0)]
    hem = []
    n = 7
    for i in range(n + 1):
        t = i / n
        x = 6.4 + sway - t * (13.2 + sway * 0.4)
        hem.append(add(add(hip, f, x), u, -12.6 - (0.7 if i % 2 else 0.0)))
    back = [add(add(hip, f, -6.6), u, 2.6), add(add(neck, f, -5.8), u, -4.6)]

    def nf(x, y):
        nx = -(x - hip[0]) / 14 + 0.32 * math.sin(x * 1.2 + y * 0.15)
        ny = -0.6 * max(0.0, 1 - (y - neck[1]) / 12)
        return norm((nx, ny, 0.8))

    if p['sit']:
        # sentado (e levantando): a camisola desce da barriga, deita por cima da coxa até o joelho e cai
        # pela frente da canela até perto do tornozelo; embaixo da coxa, até o assento
        td = dirv(p['legF'][0])
        tn = (td[1], -td[0])
        sd = dirv(p['legF'][0] - p['legF'][1])
        kF = add(add(hip, f, 1.8), td, 9.8)
        hem = [add(add(hip, td, 3.0), tn, 2.6), add(add(kF, tn, 2.4), td, 0.4), add(kF, td, 2.4),
               add(add(kF, td, 2.2), sd, 6.8), add(add(kF, sd, 7.6), td, -0.6), add(add(kF, sd, 7.0), td, -3.6),
               add(add(kF, td, -4.0), sd, 2.0), add(add(hip, f, -5.0), (0.0, 2.2))]
    gown = Poly('gown', 'archgown', 3.0, top + hem + back, nf=nf, shade=0.85)
    prims.append(gown)

    def gown_decal(x, y, cur):
        # a costura da cintura e a bainha mais escura
        d = abs((y - (hip[1] + 1.0)) - (x - hip[0]) * 0.08)
        if d < 0.45:
            return ('archgown', 1)
        return None

    decals.append(Decal('gown', gown_decal))

    # ---------- a cabeça: os olhos fechados, a boca mole e a linha de Âmbar na testa ----------
    face = Ellipse('head', 'archskin', 4.8, head, 4.3, 4.9, ang=lean + tilt, bulge=0.85)
    prims.append(face)
    glow = p['glow']

    def face_decal(x, y, cur):
        lx, ly = face.local(x, y)
        # o olho fechado: a pálpebra numa linha escura dentro da órbita funda
        if 1.2 < lx < 3.6 and abs(ly - (-0.4 + 0.14 * (lx - 2.4) ** 2)) < 0.42:
            return ('archskin', 0)
        if math.hypot((lx - 2.4) / 1.6, (ly + 0.5) / 1.1) < 1.0:
            return ('archskin', 1)
        # a orelha e a boca entreaberta
        if math.hypot((lx + 0.6) / 0.9, (ly - 0.4) / 1.4) < 1.0:
            return ('archskin', 1)
        if 2.6 < lx < 3.9 and 2.3 < ly < 3.1:
            return ('archskin', 0)
        # a rachadura de Âmbar na têmpora, por onde a lembrança saiu
        if abs(ly - (-2.6 + 0.5 * (lx - 1.0))) < (0.42 if glow else 0.3) and 0.0 < lx < 2.6:
            return ('amber', 2 + min(2, glow))
        return None

    decals.append(Decal('head', face_decal))
    if long_hair:
        hair = [hl((-4.8, -2.0)), hl((-3.4, -5.2)), hl((0.6, -6.2)), hl((3.8, -4.8)), hl((2.2, -3.6)), hl((-0.8, -3.6)), hl((-2.4, -1.0)),
                hl((-3.0, 5.0)), hl((-4.6, 6.2))]
    else:
        hair = [hl((-4.6, -1.2)), hl((-3.8, -4.6)), hl((0.2, -6.0)), hl((3.6, -5.0)), hl((3.0, -4.0)), hl((-0.2, -4.2)), hl((-2.6, -2.2)),
                hl((-3.4, 1.4))]
    prims.append(Poly('hair', 'archhair', 4.9, hair, nf=lambda x, y: norm((0.3 * math.sin(y * 1.8 + x * 0.5), -0.5, 0.8)), shade=0.95))

    # ---------- o rótulo do Arquivo no peito, preso no pescoço por um barbante ----------
    tag_c = add(add(neck, u, -6.0), f, 4.6)
    prims.append(Capsule('stringL', 'string', 5.0, add(add(neck, u, -0.6), f, 2.0), add(tag_c, u, 2.2), 0.4, 0.4, shade=0.9))
    tw, th_ = 2.4, 1.8
    corners = [add(add(tag_c, f, -tw), u, th_), add(add(tag_c, f, tw), u, th_), add(add(tag_c, f, tw), u, -th_), add(add(tag_c, f, -tw), u, -th_)]
    tag = Poly('tag', 'paper', 5.1, corners, nf=lambda x, y: norm((-0.1, -0.2, 0.97)))
    prims.append(tag)

    def tag_decal(x, y, cur):
        dx, dy = x - tag_c[0], y - tag_c[1]
        lx = dx * f[0] + dy * f[1]
        ly = -(dx * u[0] + dy * u[1])
        if abs(ly + 0.4) < 0.32 and -1.6 < lx < 1.4:
            return ('archhair', 1)
        if abs(ly - 0.8) < 0.3 and -1.6 < lx < 0.4:
            return ('archhair', 1)
        return None

    decals.append(Decal('tag', tag_decal))

    # ---------- o braço da frente ----------
    limb(shF, p['armF'], 5.6, 1.0)
    return prims, decals


def points(pose):
    """O alto da cabeça e o quadril em cada quadro (relativos aos pés): o jogo põe a coroa da cadeira em
    cima da cabeça de quem está sentado e o assento embaixo do quadril."""
    p = P(pose)
    hip = add(BASE_HIP, p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))
    f = (math.cos(lean), math.sin(lean))
    neck = add(hip, u, 14.0)
    head = add(add(neck, u, 5.2), f, 2.0)
    top = add(head, rot((0.6, -6.2), lean + math.radians(p['tilt'])))
    return {'head': [round(top[0] - FEET[0], 1), round(top[1] - FEET[1], 1)],
            'hip': [round(hip[0] - FEET[0], 1), round(hip[1] - FEET[1], 1)]}


def anims_for(k):
    def A(poses):
        return [dict(q, kind=k) for q in poses]

    idle = A([dict(hip=(0, b), sway=b * 0.5, tilt=4 + b * 3, armF=(70 - b * 2, 6), armB=(72 - b * 2, 4), droop=30) for b in (0.0, 0.5, 1.0, 0.5)])
    walk = []
    for i in range(8):
        ph = 2 * math.pi * i / 8
        s, c = math.sin(ph), math.cos(ph)
        walk.append(dict(hip=(0.0, -abs(c) * 0.8 + 0.4), lean=6 + 1.5 * abs(s), tilt=3 + 3 * s, sway=1.2 * s,
                         legF=(4 + 9 * s, 3 + max(0, -c) * 10), legB=(-3 - 9 * s, 3 + max(0, c) * 10),
                         armF=(84 + 3 * c, -2), armB=(86 - 3 * c, -4), droop=22 + 5 * c))
    walk = A(walk)
    reach = A([dict(lean=10, hip=(1, 0.5), legF=(14, 6), legB=(-10, 5), armF=(92, 0), armB=(94, -2), droop=10, tilt=-4),
               dict(lean=13, hip=(2, 1), legF=(18, 8), legB=(-12, 6), armF=(96, 0), armB=(98, -2), droop=6, tilt=-6, glow=1)])
    drain = A([dict(lean=12, hip=(1.5, 1), legF=(14, 8), legB=(-10, 6), armF=(94 - d * 3, 0), armB=(96 - d * 3, -2), droop=4,
                    tilt=-10 - d * 2, glow=2 if i % 2 == 0 else 1) for i, d in enumerate((0.0, 0.6, 1.0, 0.6))])
    hurt = A([dict(lean=-8, hip=(-1.5, 0.5), tilt=12, armF=(130, 20), armB=(124, 16), droop=40, legF=(10, 6), legB=(-10, 6))])
    death = A([
        dict(lean=-6, hip=(-1, 1), tilt=14, armF=(110, 20), armB=(104, 16), droop=40),
        dict(lean=8, hip=(0, 5), tilt=24, legF=(40, 70), legB=(-12, 60), armF=(40, 10), armB=(36, 8), droop=50, sway=1),
        dict(lean=16, hip=(0, 9), tilt=34, legF=(70, 120), legB=(-20, 110), armF=(20, 6), armB=(16, 6), droop=60, sway=1.5),
        dict(lean=20, hip=(0, 10), tilt=40, legF=(74, 128), legB=(-22, 116), armF=(10, 4), armB=(8, 4), droop=70, sway=1.5),
    ])
    # sentado na cadeira das Experiências: o pé da frente fica no mesmo lugar do de pé, para levantar sem
    # arrastar os pés (o quadril vai para a frente por cima deles)
    sit = A([dict(sit=1, hip=(-7.2, 9.75 + b * 0.25), lean=8 + b, tilt=18 + b * 2, legF=(90, 98), legB=(86, 96),
                  armF=(10, 60), armB=(22, 43), droop=30) for b in (0.0, 0.5, 1.0, 0.5)])
    getup = A([
        dict(sit=1, hip=(-7.4, 9.0), lean=20, tilt=10, legF=(88, 94), legB=(84, 92), armF=(30, 44), armB=(36, 36), droop=30),
        dict(sit=1, hip=(-5.5, 4.0), lean=26, tilt=4, legF=(58, 66), legB=(52, 62), armF=(58, 22), armB=(56, 24), droop=26),
        dict(sit=1, hip=(-2.6, 0.83), lean=14, tilt=2, legF=(28, 32), legB=(20, 28), armF=(76, 6), armB=(74, 4), droop=24),
        dict(hip=(0.0, 0.0), lean=6, tilt=3, legF=(6, 4), legB=(-5, 4), armF=(84, -2), armB=(86, -4), droop=20),
    ])
    return {
        f'sit-{k}': (sit, 2, True),
        f'getup-{k}': (getup, 6, False),
        f'idle-{k}': (idle, 4, True),
        f'walk-{k}': (walk, 6, True),
        f'reach-{k}': (reach, 8, False),
        f'drain-{k}': (drain, 6, True),
        f'hurt-{k}': (hurt, 10, False),
        f'death-{k}': (death, 6, False),
    }


ANIMS = {**anims_for(0), **anims_for(1)}

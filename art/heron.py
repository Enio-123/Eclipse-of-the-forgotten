"""Garça Cinzenta (Vale das Cachoeiras): garça grande, cinza de verdade, a única coisa sem cor dentro da
lembrança. Pernas compridas na água rasa, o corpo inclinado, as asas fechadas cobrindo o lado com as
penas de voo quase pretas, o pescoço branco em S com a fileira de pintas escuras na frente, a faixa
preta do olho que termina em duas plumas finas atrás da cabeça e o bico comprido, cor de palha.

Parada ela é uma estátua; o bote é o pescoço inteiro esticando de uma vez. Voando, o pescoço dobra
encolhido e as pernas vão esticadas para trás.

O boneco olha para a direita (+x). FEET é onde os dedos pisam (o fundo da água rasa).

uso: python3 ink_sheets.py <pasta_assets> heron
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm
from rig import rotate_all

puppet.RAMPS['herongrey'] = [0x262a32, 0x41464f, 0x666c78, 0x9197a4, 0xbfc4ce]
puppet.RAMPS['herondark'] = [0x0f1115, 0x1c1f25, 0x30343c, 0x494e58, 0x676d78]
puppet.RAMPS['heronwhite'] = [0x676b74, 0x9599a3, 0xc1c5cd, 0xe0e3e8, 0xf7f8fa]
puppet.RAMPS['heronbeak'] = [0x4c3410, 0x7e5a1c, 0xb48a34, 0xdcb658, 0xf6df98]
puppet.RAMPS['heronleg'] = [0x2e2616, 0x4c3f24, 0x716038, 0x978450, 0xbcab74]
puppet.SHINY['heronbeak'] = (0.45, 12)
puppet.RIM_MATS |= {'herongrey', 'herondark'}

# o desenho é feito numa escala maior (FD são os pés nela) e reduzido no fim para o tamanho do jogo: a garça
# de pé fica com uns 37 px até o alto da cabeça, um pouco menor que o cavaleiro
FD = (30, 58)
K = 0.84
W, H = 72, 56
FEET = (26, 51)
OFF = (FEET[0] - FD[0], FEET[1] - FD[1])

DEFAULT = dict(tilt=18.0, body=(0.0, 0.0), head=(3.0, -14.0), c1=(-3.5, -5.5), c2=(-4.0, 4.0), beak=6.0, crest=0.0,
               legs=0.0, near=None, far=None, spread=1.0, fold=1.0, fly=0, rot=0.0, off=(0.0, 0.0))


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def dv(deg):
    a = math.radians(deg)
    return (math.cos(a), math.sin(a))


def rot(v, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c)


def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return (u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
            u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1])


def P(pose):
    p = dict(DEFAULT)
    p.update(pose)
    return p


def skeleton(p):
    """Os pontos do boneco: o meio do corpo, a base do pescoço, a cabeça e a ponta do bico."""
    fx, fy = FD
    fly = p['fly']
    tilt = p['tilt']
    bc = add((fx - 1.0, fy - 27.0 + (6.0 if fly else 0.0)), p['body'])
    # a frente do corpo fica para cima (o corpo gira no sentido anti-horário)
    sh = add(bc, rot((6.6, -2.6), -tilt))
    hd = add(sh, p['head'])
    b = p['beak']
    tip = add(hd, dv(b), 12.4)
    return dict(bc=bc, sh=sh, hd=hd, tip=tip)


def wing_open(prims, root, ang, z, shade, spread=1.0, fold=1.0):
    """Asa aberta da garça: larga e funda, a ponta arredondada. As coberteiras cinza no braço, as
    primárias quase pretas abertas na ponta e as secundárias compridas na beira de trás."""
    arm = 13.5 * fold
    wrist = add(root, dv(ang), arm)
    prims.append(Capsule('wingarm', 'herongrey', z, root, wrist, 3.8, 2.8, shade=shade))
    for k in range(6):
        a = ang + (4 + k * 9) * spread
        ln = (18.0 - k * 1.0) * fold
        tip = add(wrist, dv(a), ln)
        prims.append(Capsule('primary', 'herondark', z - 0.01 * k, wrist, tip, 2.1, 1.0, shade=shade))
    for k in range(7):
        t = 0.06 + k * 0.14
        base = add(root, dv(ang), arm * t)
        a = ang + 62 * spread + k * 3
        ln = (13.0 - k * 0.4) * fold
        tip = add(base, dv(a), ln)
        prims.append(Capsule('secondary', 'herondark' if k > 1 else 'herongrey', z - 0.07 - 0.01 * k, base, tip, 2.7, 1.5, shade=shade * 0.92))
    # as coberteiras: uma faixa cinza mais clara por cima da base das penas
    cov = add(root, dv(ang), arm * 0.55)
    prims.append(Ellipse('coverts', 'herongrey', z + 0.02, add(cov, dv(ang + 50 * spread), 3.0), 6.0, 3.0, ang=math.radians(ang + 20), shade=shade * 1.05))


def build(pose):
    p = P(pose)
    k = skeleton(p)
    prims, decals = [], []
    fx, fy = FD
    fly = p['fly']
    tilt = p['tilt']
    bc, sh, hd, tip = k['bc'], k['sh'], k['hd'], k['tip']
    up = rot((0, -1), -tilt)
    fw = rot((1, 0), -tilt)
    if p['far'] is not None:
        wing_open(prims, add(bc, up, 2.6), p['far'], 0.6, 0.6, p['spread'], p['fold'])

    # ---------- as pernas ----------
    if fly:
        # voando: esticadas para trás, os dedos juntos
        hip = add(bc, fw, -3.0)
        for dz, sd in ((2.1, 1.0), (2.0, 0.78)):
            end = add(add(hip, fw, -17.0), up, -0.8 + (1.4 if sd < 1 else 0.0))
            prims.append(Capsule('leg', 'heronleg', dz, hip, end, 0.9, 0.7, shade=sd))
            prims.append(Capsule('toe', 'heronleg', dz + 0.01, end, add(end, fw, -3.6), 0.55, 0.4, shade=sd))
    else:
        bend = p['legs']
        for side, dz, sd in ((1.6, 2.2, 0.78), (-0.8, 2.3, 1.0)):
            foot = (fx + side, fy)
            hip = add(bc, (side * 0.6 - 0.6, 3.6))
            joint = (fx + side - 1.2 - bend * 2.0, fy - 12.0 + bend * 2.5)
            prims.append(Capsule('thigh', 'herongrey', dz - 0.05, hip, add(hip, (-0.3, 3.0)), 2.0, 1.3, shade=sd))
            prims.append(Capsule('leg', 'heronleg', dz, add(hip, (-0.3, 2.0)), joint, 0.95, 0.8, shade=sd))
            prims.append(Capsule('leg', 'heronleg', dz + 0.01, joint, foot, 0.85, 0.75, shade=sd))
            # três dedos para a frente, um para trás
            for a, ln in ((-8, 4.6), (12, 4.2), (32, 3.4), (186, 2.6)):
                prims.append(Capsule('toe', 'heronleg', dz + 0.02, foot, add(foot, dv(a), ln), 0.5, 0.35, shade=sd * 0.95))

    # ---------- o corpo, a asa fechada e as plumas do peito ----------
    body = Ellipse('body', 'herongrey', 3.0, bc, 8.6, 5.0, ang=math.radians(-tilt))
    prims.append(body)
    # as plumas compridas do peito, caindo na frente do corpo
    if not fly:
        for i in range(4):
            a0 = add(sh, (-1.0 + i * 0.6, 1.2 + i * 0.4))
            a1 = add(a0, (-1.8 - i * 0.5, 7.0 + i * 0.6))
            prims.append(Capsule('plume', 'heronwhite', 3.4 + i * 0.01, a0, a1, 1.1, 0.35, shade=0.9 - i * 0.04))
    if p['near'] is None:
        # a asa fechada: cobre o lado; as penas de voo, escuras, passam do rabo
        w0 = add(sh, fw, -1.6)
        wing = [add(w0, up, 1.4), add(add(bc, fw, 2.0), up, 4.0), add(add(bc, fw, -5.0), up, 4.2), add(add(bc, fw, -11.5), up, 1.6),
                add(add(bc, fw, -14.5), up, -0.8), add(add(bc, fw, -10.0), up, -2.6), add(add(bc, fw, -1.0), up, -3.6), add(w0, up, -2.0)]
        prims.append(Poly('fwing', 'herongrey', 3.3, wing, nf=lambda x, y: norm((0.15, -0.4, 0.9)), shade=1.0))

        def feathers(x, y, cur):
            # a ponta da asa (as primárias) quase preta e uma faixa escura na beira de cima
            lx = (x - bc[0]) * fw[0] + (y - bc[1]) * fw[1]
            ly = (x - bc[0]) * up[0] + (y - bc[1]) * up[1]
            if lx < -7.5:
                return ('herondark', 2 if (int(lx * 1.2 - ly) % 3) else 1)
            if ly > 2.6 and lx > -6:
                return ('herondark', 3)
            if lx < -4.5 and (int(lx * 1.5 - ly * 0.8) % 3) == 0:
                return ('herongrey', 1)
            return None
        decals.append(Decal('fwing', feathers))

    # ---------- o pescoço: um S de cápsulas, do ombro até a cabeça ----------
    c1 = add(sh, p['c1'])
    c2 = add(hd, p['c2'])
    n = 12
    pts = [bez(sh, c1, c2, hd, i / n) for i in range(n + 1)]
    for i in range(n):
        r0 = 2.5 - 1.1 * (i / n)
        r1 = 2.5 - 1.1 * ((i + 1) / n)
        prims.append(Capsule('neck', 'heronwhite', 3.5 + i * 0.002, pts[i], pts[i + 1], r0, r1, shade=0.98))
    # a fileira de pintas escuras na frente do pescoço (do lado de baixo/da frente da curva)
    for i in range(2, n - 1, 2):
        a, b = pts[i], pts[i + 1]
        tx, ty = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / ln, tx / ln
        if nx < 0:
            nx, ny = -nx, -ny
        r = 2.5 - 1.1 * (i / n)
        c = add(a, (nx, ny), r * 0.55)
        prims.append(Capsule('streak', 'herondark', 3.56, c, add(c, (tx / ln, ty / ln), 0.9), 0.38, 0.3, flat=1))

    # ---------- a cabeça, a faixa preta, as plumas e o bico ----------
    b = p['beak']
    head = Ellipse('head', 'heronwhite', 3.7, hd, 3.2, 2.4, ang=math.radians(b * 0.6))
    prims.append(head)

    def mask(x, y, cur):
        lx, ly = head.local(x, y)
        # a faixa preta: do olho para trás, por cima da cabeça
        if ly < -0.25 and lx < 1.6 and ly > -2.6:
            return ('herondark', 1)
        return None
    decals.append(Decal('head', mask))
    back = add(hd, dv(b + 180), 2.6)
    cr = p['crest']
    for i, (ln, dy) in enumerate(((8.5, -0.6), (6.5, 0.4))):
        e = add(add(back, dv(b + 180 + 8 - i * 6 + cr * 10), ln), (0, dy))
        prims.append(Capsule('crest', 'herondark', 3.68 - i * 0.01, add(back, (0, -0.8 + i * 0.5)), e, 0.55, 0.22, flat=1))
    eye = add(hd, rot((1.1, -0.5), b * 0.6))
    prims.append(Ellipse('eye', 'heronbeak', 3.8, eye, 0.75, 0.7, shade=1.15))
    prims.append(Ellipse('pupil', 'void', 3.81, add(eye, (0.25, 0.0)), 0.36, 0.38, flat=0))
    base = add(hd, dv(b), 2.3)
    side = dv(b + 90)
    beak = [add(base, side, -1.25), add(add(base, dv(b), 4.0), side, -0.9), tip, add(add(base, dv(b), 5.0), side, 0.75), add(base, side, 1.15)]
    prims.append(Poly('beak', 'heronbeak', 3.9, beak, nf=lambda x, y: norm((0.2, -0.5, 0.85))))

    def ridge(x, y, cur):
        # a quina de cima do bico, mais escura, e a linha da boca
        lx = (x - base[0]) * math.cos(math.radians(b)) + (y - base[1]) * math.sin(math.radians(b))
        ly = -(x - base[0]) * math.sin(math.radians(b)) + (y - base[1]) * math.cos(math.radians(b))
        if ly < -0.55:
            return ('heronbeak', 1)
        if abs(ly - 0.1) < 0.18 and lx < 8.5:
            return ('herondark', 2)
        return None
    decals.append(Decal('beak', ridge))

    if p['near'] is not None:
        wing_open(prims, add(bc, up, 2.2), p['near'], 5.0, 1.0, p['spread'], p['fold'])
    return rotate_all(prims, decals, FD, p['rot'], add(OFF, p['off'], K), scale=K)


def points(pose):
    """A ponta do bico em cada quadro (onde o bote acerta), em pixels do mundo em relação aos pés, já
    com o giro e a redução."""
    p = P(pose)
    x, y = skeleton(p)['tip']
    a = math.radians(p['rot'])
    dx, dy = x - FD[0], y - FD[1]
    x = (dx * math.cos(a) - dy * math.sin(a)) * K + p['off'][0] * K
    y = (dx * math.sin(a) + dy * math.cos(a)) * K + p['off'][1] * K
    return [round(x, 1), round(y, 1)]


# o pescoço: onde fica a cabeça (em relação ao ombro) e as duas alças da curva
STAND = dict(head=(3.0, -14.0), c1=(-3.5, -5.5), c2=(-4.0, 4.0), beak=6.0)
# o bote armado: a cabeça puxada para trás e para baixo, o pescoço num Z apertado, o bico mirando
COCK = dict(head=(-3.5, -8.0), c1=(7.0, -1.0), c2=(-8.5, 1.0), beak=6.0, tilt=10.0, legs=0.6, crest=-0.4)
# o bote: o pescoço inteiro esticado para a frente, a cabeça no fim e o corpo indo junto
STAB = dict(head=(20.0, 2.0), c1=(7.0, 0.5), c2=(-7.0, -0.5), beak=4.0, tilt=4.0, body=(2.0, 1.0), legs=0.3)
FLY = [dict(fly=1, tilt=0.0, head=(5.0, -2.0), c1=(-1.0, -4.0), c2=(-4.0, 1.0), beak=10.0, near=-120, far=-104, legs=0.0),
       dict(fly=1, tilt=0.0, head=(5.0, -2.5), c1=(-1.0, -4.0), c2=(-4.0, 1.0), beak=10.0, near=-160, far=-150, spread=0.9),
       dict(fly=1, tilt=0.0, head=(5.0, -1.5), c1=(-1.0, -4.0), c2=(-4.0, 1.0), beak=10.0, near=140, far=148, spread=0.8, fold=0.9),
       dict(fly=1, tilt=0.0, head=(5.0, -1.0), c1=(-1.0, -4.0), c2=(-4.0, 1.0), beak=10.0, near=176, far=184, fold=0.78, spread=0.7)]


def _p(base, **kw):
    d = dict(base)
    d.update(kw)
    return d


ANIMS = {
    # parada no raso, uma estátua: só o pescoço respira e as plumas da nuca mexem
    'stand': ([_p(STAND), _p(STAND, head=(3.2, -14.4), crest=0.4), _p(STAND, head=(3.0, -14.2), crest=0.2)], 2, True),
    # o pescoço encolhe num Z e o bico mira
    'cock': ([_p(STAND, head=(1.5, -12.0), c1=(1.0, -4.0), c2=(-5.0, 3.0)), _p(COCK)], 8, False),
    # o bote: estica de uma vez
    'stab': ([_p(STAB, head=(14.0, -1.0)), _p(STAB)], 22, False),
    # o bico fica lá na frente um instante (a hora de bater) e volta devagar
    'hold': ([_p(STAB, crest=0.6), _p(STAB, head=(19.0, 2.6), crest=0.8)], 6, True),
    'recover': ([_p(STAB, head=(12.0, -4.0), c1=(3.0, -3.0), c2=(-6.0, 2.0), tilt=10.0), _p(STAND)], 8, False),
    'fly': (FLY, 9, True),
    # sai do chão: as asas abrem para cima, as pernas empurram
    'takeoff': ([_p(STAND, near=-60, far=-50, spread=1.2, legs=1.0), dict(fly=1, tilt=-20.0, head=(5.0, -5.0), c1=(-1.0, -4.0), c2=(-4.0, 1.0), beak=-8.0, near=-150, far=-140, spread=1.0)], 10, False),
    # chegando: asas freando, as pernas para a frente
    'land': ([_p(STAND, near=-70, far=-58, spread=1.3, tilt=-6.0, head=(4.0, -12.0)), _p(STAND)], 8, False),
    'hurt': ([_p(STAND, head=(-3.0, -11.0), c1=(-4.0, -3.0), c2=(2.0, 3.0), beak=-24.0, near=-80, far=-66, spread=1.3, tilt=28.0, crest=1.0)], 10, False),
    # aparada: a cabeça tonta caindo para a frente, o pescoço mole
    'stun': ([_p(STAND, head=(8.0, -3.0), c1=(2.0, -6.0), c2=(-2.0, -4.0), beak=48.0, tilt=8.0, crest=-0.6),
              _p(STAND, head=(7.0, -4.5), c1=(2.0, -6.0), c2=(-2.0, -4.0), beak=38.0, tilt=10.0, crest=0.4)], 4, True),
    'death': ([_p(STAND, head=(-2.0, -10.0), beak=-20.0, near=-60, far=-50, spread=1.4, tilt=26.0),
               _p(STAND, head=(6.0, -4.0), c1=(2.0, -5.0), c2=(-2.0, -3.0), beak=40.0, near=150, far=120, spread=1.2, rot=52.0),
               _p(STAND, head=(8.0, 2.0), c1=(3.0, -2.0), c2=(-3.0, -1.0), beak=60.0, near=170, far=160, fold=0.8, rot=84.0, off=(-4.0, -5.0))], 8, False),
}

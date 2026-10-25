"""A Sombra do Carrasco: o chefe do fundo do Fosso dos Esquecidos. É tudo o que o carrasco não quis
lembrar, juntado numa tinta preta viva com a forma que ele tinha antes: o capuz pontudo de carrasco,
os ombros largos, o machado. Não tem pernas: o corpo sai de uma poça que respira e volta para ela.
Os olhos são dois rasgos lilás no capuz; onde a luz pega, a tinta brilha roxa; nas costas, três
tentáculos tateiam o ar e gotas pingam dos braços. O machado é de obsidiana, com o fio aceso em
magenta.

Tudo o que é corpo passa por T (preso no chão): `rise` encolhe o corpo para dentro da poça (e
alarga, como líquido) e `stretch` alonga na horizontal (a investida).

uso: python3 ink_sheets.py <pasta_assets> sombra
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot

# preto obsidiana com o roxo do abismo onde a luz pega; o lilás e o magenta só nos detalhes
puppet.RAMPS['abyss'] = [0x030205, 0x09070d, 0x150d22, 0x3b1d66, 0x7029b8]
puppet.RAMPS['abyssglow'] = [0x2a0f4a, 0x4b1d80, 0x7029b8, 0xb27fea, 0xd8b7ff]
puppet.RAMPS['abyssmag'] = [0x2c0a26, 0x5a1650, 0x8a2178, 0xb52a9b, 0xe486d6]
puppet.RAMPS['obsidian'] = [0x050408, 0x0b0910, 0x1a1429, 0x342a58, 0x5c4f96]
puppet.RIM_MATS |= {'abyss', 'obsidian'}
puppet.SHINY['obsidian'] = (0.5, 12)

W, H = 240, 236
FEET = (100, 232)
FLOOR = 231.5
BASE_HIP = (100.0, 182.0)

DEFAULT = dict(
    hip=(0.0, 0.0), lean=6.0, tilt=0.0,
    # quanto do corpo está fora da poça (0 = só a poça; acima de 1 = coluna alta e fina, o gêiser)
    rise=1.0,
    # alongado na horizontal (a investida líquida)
    stretch=0.0,
    # a poça: tamanho extra (-1 = sem poça) e deslocamento
    pool=0.0, poolx=0.0,
    armF=(30.0, 30.0), armB=(-20.0, 26.0),
    # direção do cabo do machado, da mão para a lâmina (0 = para baixo, 90 = para a frente, 180 = para cima)
    axe=150.0, noaxe=False,
    # machado largado no chão (morte): x da lâmina
    axeFloor=None,
    # tentáculos das costas: tamanho e fase da onda; fase da onda da coluna de tinta
    tent=1.0, tw=0.0, flow=0.0,
    glow=False, dead=False,
    # mão de trás aberta em garra (lança tinta, chama os tentáculos)
    claw=False,
    # gotas escorrendo dos braços (fase)
    drip=0.0,
)
ARM = (22.0, 21.0)


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


class Body:
    """Junta as partes já passadas pela transformação do líquido (presa no chão)."""

    def __init__(self, p):
        sy = max(0.04, p['rise'])
        self.sy = sy
        self.sx = (1.0 + (1.0 - sy) * 0.7) * (1.0 + p['stretch'])
        self.k = math.sqrt(self.sx * self.sy)
        self.prims = []
        self.decals = []

    def T(self, q):
        return (FEET[0] + (q[0] - FEET[0]) * self.sx, FLOOR - (FLOOR - q[1]) * self.sy)

    def E(self, name, mat, z, c, rx, ry, ang=0.0, **kw):
        e = Ellipse(name, mat, z, self.T(c), max(0.3, rx * self.sx), max(0.3, ry * self.sy), ang=ang, **kw)
        self.prims.append(e)
        return e

    def C(self, name, mat, z, a, b, ra, rb, **kw):
        c = Capsule(name, mat, z, self.T(a), self.T(b), max(0.3, ra * self.k), max(0.3, rb * self.k), **kw)
        self.prims.append(c)
        return c

    def Pl(self, name, mat, z, pts, nf=None, **kw):
        q = Poly(name, mat, z, [self.T(t) for t in pts], nf=nf, **kw)
        self.prims.append(q)
        return q


def skeleton(p):
    hip = add(BASE_HIP, p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))
    f = (math.cos(lean), math.sin(lean))
    neck = add(hip, u, 38.0)
    shF = add(add(neck, f, 12.0), u, -4.5)
    shB = add(add(neck, f, -11.0), u, -4.0)
    # o capuz pende para a frente, curvado como quem espera a sentença
    head = add(add(neck, u, 8.0), f, 6.0)
    up, el = p['armF']
    elbowF = add(shF, dirv(up), ARM[0])
    handF = add(elbowF, dirv(up + el), ARM[1])
    upB, elB = p['armB']
    elbowB = add(shB, dirv(upB), ARM[0])
    handB = add(elbowB, dirv(upB + elB), ARM[1])
    return dict(hip=hip, lean=lean, u=u, f=f, neck=neck, shF=shF, shB=shB, head=head,
                elbowF=elbowF, handF=handF, elbowB=elbowB, handB=handB)


def points(pose):
    """A mão do machado e a ponta da lâmina, relativas aos pés, já com a transformação do líquido
    (o jogo usa a ponta para o respingo da machadada)."""
    p = P(pose)
    k = skeleton(p)
    b = Body(p)
    d = dirv(p['axe'])
    hand = b.T(k['handF'])
    tip = add(hand, d, 52.0)
    return {'hand': [round(hand[0] - FEET[0], 1), round(hand[1] - FEET[1], 1)],
            'blade': [round(tip[0] - FEET[0], 1), round(tip[1] - FEET[1], 1)]}


# ---------- o machado de obsidiana ----------
def axe_prims(prims, decals, hand, d, z, tag=''):
    """Cabo de tinta endurecida e a lâmina larga de carrasco, com o fio aceso."""
    side = (-d[1], d[0])
    L = 52.0
    g = 1.3
    prims.append(Capsule('haft' + tag, 'abyss', z, add(hand, d, -9.0), add(hand, d, L + 2.0), 2.1, 1.9))
    # anéis de ferro no cabo
    for t in (L - 19.0, -6.0):
        c = add(hand, d, t)
        prims.append(Ellipse('band' + tag, 'obsidian', z + 0.01, c, 2.8, 1.4, ang=math.atan2(d[1], d[0]) + math.pi / 2, flat=3))
    base0 = add(hand, d, L - 13.0 * g)
    base1 = add(hand, d, L + 1.5)
    up_tip = add(add(base1, side, 12.0 * g), d, 5.0 * g)
    beard = add(add(base0, side, 14.0 * g), d, -7.0 * g)
    # o fio: curva de fora, do bico de cima até a barba de baixo
    edge = []
    for i in range(13):
        t = i / 12
        # bezier quadrática com o meio bem para fora
        mid = add(add(hand, d, L - 4.0 * g), side, 21.0 * g)
        a = (1 - t) ** 2
        b = 2 * (1 - t) * t
        c = t * t
        edge.append((up_tip[0] * a + mid[0] * b + beard[0] * c, up_tip[1] * a + mid[1] * b + beard[1] * c))
    neck_in = add(add(base0, side, 3.5), d, -1.0)
    pts = [base1, add(base1, side, 4.0)] + edge + [add(beard, side, -3.0), neck_in, base0]
    nrm = norm((side[0] * 0.25 - 0.1, side[1] * 0.25 - 0.35, 0.9))
    blade = Poly('blade' + tag, 'obsidian', z + 0.03, pts, nf=lambda x, y: nrm)
    prims.append(blade)
    # o espigão de trás
    sp0 = add(add(hand, d, L - 9.0 * g), side, -1.5)
    prims.append(Poly('spike' + tag, 'obsidian', z + 0.02, [add(sp0, d, 3.6), add(add(sp0, side, -9.5), d, -0.5), add(sp0, d, -3.6)],
                      nf=lambda x, y: norm((-side[0] * 0.3, -0.4, 0.86))))

    def blade_dec(x, y, cur):
        best = 1e9
        for q in edge:
            dd = (x - q[0]) ** 2 + (y - q[1]) ** 2
            if dd < best:
                best = dd
        r = math.sqrt(best)
        if r < 1.0:
            return ('abyssglow', 4)
        if r < 2.6:
            return ('abyssmag', 3)
        if r < 4.0:
            return ('abyssmag', 1)
        # uma rachadura roxa atravessando a lâmina
        lx = (x - base0[0]) * side[0] + (y - base0[1]) * side[1]
        ly = (x - base0[0]) * d[0] + (y - base0[1]) * d[1]
        if 5.0 < lx < 19.0 and abs(ly - 7.0 - 0.45 * lx - 1.6 * math.sin(lx * 0.9)) < 0.6:
            return ('abyssmag', 2)
        return None

    decals.append(Decal('blade' + tag, blade_dec))


def axe_floor(prims, decals, ax):
    d = dirv(-62.0)
    hand = (ax - d[0] * 54.0, FLOOR - 1.6 - d[1] * 54.0)
    axe_prims(prims, decals, hand, d, 0.6)


# ---------- o corpo ----------
def build(pose):
    p = P(pose)
    if p.get('bodyless'):
        prims, decals = [], []
        axe_floor(prims, decals, p['axeFloor'])
        return prims, decals
    k = skeleton(p)
    hip, u, f, neck, shF, shB, head, lean = (k[n] for n in ('hip', 'u', 'f', 'neck', 'shF', 'shB', 'head', 'lean'))
    elbowF, handF, elbowB, handB = k['elbowF'], k['handF'], k['elbowB'], k['handB']
    B = Body(p)
    T = B.T
    prims, decals = B.prims, B.decals
    fl = p['flow']

    # ---------- a poça (fica no chão, não encolhe com o corpo) ----------
    if p['pool'] > -1:
        grow = p['pool'] + (1.0 - min(1.0, B.sy)) * 1.1
        prx = 26.0 + 15.0 * grow
        pry = 3.2 + 1.4 * grow
        pc = (FEET[0] + p['poolx'], FLOOR - pry * 0.55)
        pool = Ellipse('pool', 'abyss', 3.6, pc, prx, pry, bulge=0.35)
        prims.append(pool)

        def pool_dec(x, y, cur):
            lx, ly = pool.local(x, y)
            u2 = (lx / prx) ** 2 + (ly / pry) ** 2
            # borda de cima acesa em roxo, o reflexo lilás e as bolhas
            if ly < 0 and u2 > 0.72:
                return ('abyssglow', 2) if lx < prx * 0.4 else ('abyss', 4)
            for bx, br in ((-0.55, 1.1), (0.42, 0.8), (0.1, 0.6)):
                if (lx - bx * prx) ** 2 + (ly + pry * 0.1) ** 2 < br * br:
                    return ('abyssglow', 3)
            if abs(ly + pry * 0.35) < 0.35 and -0.5 < lx / prx < -0.1:
                return ('abyssglow', 3)
            return None

        decals.append(Decal('pool', pool_dec))

    # ---------- tentáculos das costas (atrás de tudo) ----------
    if p['tent'] > 0 and B.sy > 0.3:
        roots = ((-8.0, 32.0, -128.0, 1.25), (-12.0, 25.0, -110.0, 1.05), (-7.0, 16.0, -94.0, 0.85))
        for j, (fx, ux, base, size) in enumerate(roots):
            root = add(add(hip, f, fx), u, ux)
            ang = base + math.degrees(lean) * 0.5
            pt = root
            n = 9
            seg = 6.0 * size * p['tent']
            for i in range(n):
                s = i / n
                ang -= 9.0 + 7.0 * math.sin(p['tw'] + j * 1.9 + i * 0.75)
                d = dirv(ang)
                q = add(pt, d, seg)
                r0 = (4.6 - 3.9 * s) * size
                r1 = (4.6 - 3.9 * (i + 1) / n) * size
                B.C(f'tent{j}', 'abyss', 1.2 - j * 0.05 + i * 0.001, pt, q, r0, max(0.5, r1))
                pt = q
            # a ponta acesa
            B.E(f'tenttip{j}', 'abyssglow', 1.25, pt, 0.9 * size, 0.9 * size, flat=2)

    # ---------- braço de trás ----------
    def arm(sh, elbow, hand, z, shade, tag, claw):
        B.C('upper' + tag, 'abyss', z, sh, elbow, 6.4, 5.0, shade=shade)
        B.C('fore' + tag, 'abyss', z + 0.02, elbow, hand, 5.2, 3.6, shade=shade)
        B.E('hand' + tag, 'abyss', z + 0.04, hand, 4.4, 4.0, shade=shade)
        d = unit((hand[0] - elbow[0], hand[1] - elbow[1]))
        spread = 34.0 if claw else 14.0
        for i, a in enumerate((-spread, 0.0, spread)):
            dd = rot(d, math.radians(a))
            tip = add(hand, dd, 10.0 if claw else 7.0)
            B.C('claw' + tag, 'abyss', z + 0.05 + i * 0.002, add(hand, dd, 2.2), tip, 1.6, 0.4, shade=shade * 1.1)
        # gota escorrendo do antebraço
        if B.sy > 0.5:
            t = (p['drip'] + (0.5 if tag == 'B' else 0.0)) % 1.0
            c = add(add(elbow, d, 10.0), (0.0, 4.6 + 5.0 * t))
            B.E('drip' + tag, 'abyss', z + 0.03, c, 1.7 - 0.4 * t, 2.3 + 0.8 * t, shade=shade)

    arm(shB, elbowB, handB, 2.0, 0.72, 'B', p['claw'])

    # ---------- a coluna de tinta: do quadril até a poça ----------
    n = 10
    left, right = [], []
    bot = (FEET[0] + p['poolx'] * 0.5, FLOOR - 1.0)
    for i in range(n + 1):
        t = i / n
        y = bot[1] + (hip[1] + 4.0 - bot[1]) * t
        cx = bot[0] + (hip[0] - bot[0]) * (t ** 1.4)
        w = 22.0 - 3.0 * t - 8.0 * math.sin(math.pi * t)
        wv = 1.8 * math.sin(t * 7.0 + fl)
        left.append((cx - w + wv, y))
        right.append((cx + w + wv * 0.6, y))
    col_pts = left + right[::-1]

    def col_n(x, y):
        # cilindro torto: a normal sai do meio da coluna naquela altura
        t = min(1.0, max(0.0, (FLOOR - y) / max(1.0, (FLOOR - T(hip)[1]))))
        cx = T(bot)[0] + (T(hip)[0] - T(bot)[0]) * (t ** 1.4)
        w = max(4.0, (22.0 - 3.0 * t - 8.0 * math.sin(math.pi * t)) * B.sx)
        nx = max(-1.0, min(1.0, (x - cx) / w))
        return norm((nx, -0.25, math.sqrt(max(0.0, 1.0 - nx * nx)) + 0.15))

    col = B.Pl('column', 'abyss', 3.0, col_pts, nf=col_n)

    def col_dec(x, y, cur):
        # veios roxos subindo pela coluna
        t = (FLOOR - y) / max(1.0, (FLOOR - T(hip)[1]))
        if t < 0.05 or t > 0.95:
            return None
        cx = T(bot)[0] + (T(hip)[0] - T(bot)[0]) * (t ** 1.4)
        lx = (x - cx) / B.sx
        if abs(lx - 3.0 * math.sin(t * 9.0 + fl * 1.3) + 4.0) < 0.45:
            return ('abyss', 4) if cur[1] >= 2 else ('abyss', 3)
        if abs(lx - 2.0 * math.sin(t * 6.0 - fl) - 6.5) < 0.35 and t > 0.35:
            return ('abyssmag', 2)
        return None

    decals.append(Decal('column', col_dec))

    # ---------- tronco, ombros e o manto rasgado que escorre ----------
    B.C('torso', 'abyss', 3.2, add(hip, u, 4.0), add(neck, u, -5.0), 17.0, 19.0)
    chest = add(add(neck, u, -11.0), f, 3.5)
    B.E('chest', 'abyss', 3.3, chest, 17.0, 13.5, ang=lean)
    mantle = [add(add(neck, f, -17.0), u, -1.0), add(add(neck, f, -8.0), u, 5.0), add(add(neck, f, 8.0), u, 4.5), add(add(neck, f, 18.0), u, -2.0)]
    # a barra do manto: pontas que pingam, compridas atrás e curtas na frente
    tips = ((19.5, -17.0), (15.0, -25.0), (10.0, -19.0), (4.5, -30.0), (-1.5, -22.0), (-7.0, -36.0), (-12.0, -26.0), (-17.0, -40.0), (-20.5, -29.0))
    for i, (tx, ty) in enumerate(tips):
        sw = 1.2 * math.sin(fl * 1.3 + i * 1.7)
        mantle.append(add(add(neck, f, tx + sw), u, ty - (1.5 if i % 2 else 0.0)))
        if i < len(tips) - 1:
            nx = (tx + tips[i + 1][0]) / 2
            ny = max(ty, tips[i + 1][1]) + 6.0
            mantle.append(add(add(neck, f, nx), u, ny))

    def mantle_n(x, y):
        c = T(add(neck, u, -8.0))
        dx = (x - c[0]) / 18.0
        return norm((dx, -0.35, 0.85))

    B.Pl('mantle', 'abyss', 3.9, mantle, nf=mantle_n)
    # gotas penduradas nas pontas mais compridas
    if B.sy > 0.5:
        for j, (tx, ty) in enumerate(((-17.0, -40.0), (4.5, -30.0), (-7.0, -36.0))):
            t = (p['drip'] + j * 0.37) % 1.0
            c = add(add(neck, f, tx), u, ty - 2.0 - 3.0 * t)
            B.E('mdrip', 'abyss', 3.95, c, 1.2 - 0.3 * t, 1.6 + 0.5 * t)

    # ---------- o capuz pontudo de carrasco, o rosto vazio e os olhos ----------
    tilt = math.radians(p['tilt'])
    ha = lean + tilt
    hl = lambda q: add(head, rot(q, ha))
    hood = [hl((q[0] * 1.25, q[1] * 1.25)) for q in ((-10.0, 7.0), (-11.0, -1.0), (-9.5, -9.0), (-7.5, -16.0), (-6.0, -22.0), (-6.5, -27.5), (-3.0, -24.0),
                                                     (1.5, -18.0), (6.0, -11.0), (9.0, -4.0), (10.0, 3.0), (8.0, 8.5), (0.0, 10.0))]

    def hood_n(x, y):
        c = T(hl((-1.0, -5.0)))
        dx, dy = rot(((x - c[0]) / (14.0 * B.sx), (y - c[1]) / (19.0 * B.sy)), -ha)
        dx, dy = rot((dx, dy), ha)
        return norm((dx, dy - 0.2, 0.75))

    B.Pl('hood', 'abyss', 5.0, hood, nf=hood_n)
    face = B.E('face', 'void', 5.2, hl((4.6, 1.4)), 6.0, 7.8, ang=ha, flat=1)
    dead = p['dead']
    hot = p['glow']

    def face_dec(x, y, cur):
        lx, ly = face.local(x, y)
        lx /= B.sx
        ly /= B.sy
        for ex, ey, a in ((0.8, -1.8, 0.32), (5.0, -1.3, -0.22)):
            dx, dy = rot((lx - ex, ly - ey), a)
            dd = dx * dx / 4.4 + dy * dy / 0.85
            if dd < 1.0:
                if dead:
                    return ('abyss', 1)
                return ('abyssglow', 4)
            if not dead and dd < (3.2 if hot else 2.0):
                return ('abyssglow', 2) if hot else ('abyssglow', 1)
        return None

    decals.append(Decal('face', face_dec))

    # ---------- braço da frente com o machado ----------
    zF = 6.0
    arm(shF, elbowF, handF, zF, 1.0, 'F', False)
    if p['axeFloor'] is not None:
        # caído: a cabeça no chão e o cabo inclinado para cima
        axe_floor(prims, decals, p['axeFloor'])
    elif not p['noaxe'] and B.sy > 0.55:
        hand = T(handF)
        d = dirv(p['axe'])
        axe_prims(prims, decals, hand, d, zF + 0.1)
    # o punho por cima do cabo
    B.E('fistF', 'abyss', zF + 0.2, handF, 4.4, 4.0)
    return prims, decals


# ---------- animações ----------
def pool():
    # só a poça; uma coisa embaixo respira
    return [dict(rise=r, tent=0, noaxe=True, armF=(20, 10), armB=(-20, 10), flow=i * 1.4) for i, r in enumerate((0.04, 0.07, 0.1, 0.07))]


def rise():
    return [
        dict(rise=0.18, noaxe=True, tent=0, armF=(10, 10), armB=(-10, 10), flow=0.5),
        dict(rise=0.42, noaxe=True, tent=0.3, armF=(150, -20), armB=(-150, 20), flow=1.4, glow=True),
        dict(rise=0.7, axe=10, tent=0.6, armF=(40, -10), armB=(-60, 30), flow=2.3, glow=True, lean=-6),
        dict(rise=0.92, axe=40, tent=0.9, armF=(30, 10), armB=(-30, 30), flow=3.0, glow=True, tilt=-8, lean=-4),
        dict(rise=1.0, axe=120, tent=1.0, armF=(40, 50), armB=(-24, 26), flow=3.6, glow=True),
    ]


def roar():
    # o machado no alto, os braços abertos e os tentáculos espalhados
    return [
        dict(armF=(160, 10), axe=172, armB=(-140, -10), lean=-10, tilt=-18, hip=(-1, 0), glow=True, tent=1.35, tw=0.0, flow=0.0, claw=True, pool=0.3),
        dict(armF=(166, 8), axe=178, armB=(-150, -14), lean=-13, tilt=-22, hip=(-2, -0.5), glow=True, tent=1.45, tw=1.4, flow=1.6, claw=True, pool=0.35),
    ]


def idle():
    out = []
    for i, b in enumerate((0.0, -1.2, -2.0, -1.2)):
        out.append(dict(hip=(0, b), armF=(34, 34 + b), axe=140 + b * 2, armB=(-22, 28 - b), tw=i * 1.57, flow=i * 1.57, drip=i * 0.25, tilt=b))
    return out


def glide():
    # desliza inclinado para a frente, a coluna escorrendo para trás
    out = []
    for i in range(4):
        ph = i * math.pi / 2
        out.append(dict(hip=(6, -1.5 + math.sin(ph)), lean=14, poolx=-8, armF=(50, 30), axe=110, armB=(-50, 30), tw=ph, flow=ph * 1.5, drip=i * 0.25, tent=1.1))
    return out


def cleave_windup():
    # o machado sobe por trás da cabeça; os olhos acendem
    return [
        dict(armF=(-170, 20), axe=-150, armB=(30, 30), lean=-8, hip=(-1.5, 1), glow=True, tilt=-8, tw=0.5, flow=0.4),
        dict(armF=(-178, 14), axe=-130, armB=(40, 30), lean=-12, hip=(-2.5, 0), glow=True, tilt=-12, tw=1.2, flow=0.9, tent=1.2),
    ]


def cleave():
    # desce com tudo na frente: o machado crava no chão
    return [
        dict(armF=(100, -6), axe=96, armB=(-40, 30), lean=16, hip=(5, 2), glow=True, tw=2.0, flow=1.6),
        dict(armF=(70, -10), axe=60, armB=(-46, 30), lean=24, hip=(8, 5), glow=True, tw=2.6, flow=2.0, pool=0.2),
    ]


def cleave_recover():
    return [
        dict(armF=(64, -6), axe=52, armB=(-40, 30), lean=22, hip=(7, 5), tw=3.0, flow=2.4, pool=0.2),
        dict(armF=(50, 20), axe=90, armB=(-30, 30), lean=10, hip=(3, 2), tw=3.5, flow=2.8),
    ]


def sink():
    # derrete para dentro da poça (a partir do segundo quadro já não dá para acertar)
    return [
        dict(rise=0.8, armF=(20, 20), axe=20, armB=(-20, 20), lean=6, flow=0.5, tent=0.8, glow=True),
        dict(rise=0.52, armF=(10, 10), axe=10, armB=(-10, 10), lean=4, flow=1.3, tent=0.5),
        dict(rise=0.28, noaxe=True, armF=(10, 0), armB=(-10, 0), flow=2.1, tent=0.0, pool=0.3),
        dict(rise=0.08, noaxe=True, armF=(10, 0), armB=(-10, 0), flow=2.9, tent=0.0, pool=0.4),
    ]


def geyser():
    # sai do chão numa coluna alta e fina, o machado subindo de baixo para cima
    return [
        dict(rise=1.3, armF=(160, 10), axe=160, armB=(-165, 0), lean=0, flow=0.0, tent=0.4, glow=True, pool=0.5),
        dict(rise=1.16, armF=(150, 14), axe=150, armB=(-155, 6), lean=-4, tilt=-10, flow=1.0, tent=0.9, glow=True, pool=0.4),
    ]


def emerge():
    # a tinta assenta e o corpo se refaz (aberto para golpes)
    return [
        dict(rise=0.9, armF=(60, 40), axe=40, armB=(-40, 40), lean=8, flow=2.0, tent=1.1, pool=0.3),
        dict(rise=1.04, armF=(40, 40), axe=100, armB=(-30, 30), lean=2, flow=2.8, tent=1.0, pool=0.1),
        dict(rise=1.0, armF=(34, 34), axe=136, armB=(-22, 28), flow=3.6, tent=1.0),
    ]


def rush_windup():
    # agacha, estica para a frente e leva o machado para trás
    return [
        dict(rise=0.82, stretch=0.12, lean=22, hip=(2, 2), armF=(-70, 30), axe=-100, armB=(-60, 30), glow=True, tent=1.2, tw=0.6, flow=0.6),
        dict(rise=0.72, stretch=0.22, lean=30, hip=(3, 3), armF=(-90, 20), axe=-96, armB=(-80, 20), glow=True, tent=1.3, tw=1.3, flow=1.2, pool=0.2),
    ]


def rush():
    # a investida: o corpo vira uma massa comprida, o capuz na frente
    return [
        dict(rise=0.56, stretch=0.4, lean=50, hip=(8, 4), poolx=-12, armF=(-80, 10), axe=-90, noaxe=True, armB=(-90, 10), glow=True, tent=0.8, tw=0.0, flow=0.0, pool=-0.4),
        dict(rise=0.54, stretch=0.45, lean=52, hip=(8, 4), poolx=-14, armF=(-84, 10), axe=-90, noaxe=True, armB=(-94, 10), glow=True, tent=0.85, tw=1.6, flow=1.8, pool=-0.4),
    ]


def summon():
    # enfia a garra no chão e os tentáculos respondem embaixo do cavaleiro
    return [
        dict(armB=(150, 20), claw=True, armF=(20, 30), axe=60, lean=-6, tilt=-10, glow=True, flow=0.4, tent=1.2),
        dict(armB=(60, 10), claw=True, armF=(20, 30), axe=50, lean=20, hip=(4, 4), glow=True, flow=1.2, tent=0.6, pool=0.3),
        dict(armB=(40, 4), claw=True, armF=(24, 30), axe=50, lean=26, hip=(6, 6), glow=True, flow=2.0, tent=0.4, pool=0.5),
    ]


def throw():
    # junta tinta na garra de trás e arremessa por cima do ombro
    return [
        dict(armB=(-150, 30), claw=True, armF=(40, 40), axe=120, lean=-10, tilt=-8, glow=True, flow=0.3, tent=1.2),
        dict(armB=(170, -30), claw=True, armF=(40, 40), axe=130, lean=4, glow=True, flow=1.1),
        dict(armB=(110, -10), claw=True, armF=(40, 40), axe=130, lean=12, hip=(3, 1), glow=True, flow=1.9),
    ]


def stagger():
    # aparado: o machado voa para trás e a tinta treme toda
    return [
        dict(armF=(-120, 30), axe=-110, armB=(60, 20), lean=-18, hip=(-4, 1), tilt=-20, flow=0.0, tent=1.4, tw=2.0, rise=0.94, stretch=0.06),
        dict(armF=(-104, 36), axe=-96, armB=(50, 24), lean=-14, hip=(-3, 1), tilt=-12, flow=1.7, tent=1.2, tw=2.9, rise=0.97),
    ]


def hurt():
    return [dict(armF=(50, 30), axe=100, armB=(-36, 30), lean=-9, hip=(-3, 1), tilt=-12, flow=0.8, rise=0.95)]


def death():
    # o machado cai, a tinta perde a forma e escorre para a poça; os olhos apagam por último
    return [
        dict(armF=(60, 30), axe=60, armB=(-50, 30), lean=-14, hip=(-3, 1), tilt=-18, glow=True, flow=0.0, tent=1.3),
        dict(rise=0.84, armF=(20, 20), axeFloor=158.0, armB=(-30, 30), lean=10, tilt=10, flow=0.9, tent=0.9, pool=0.2),
        dict(rise=0.62, armF=(10, 10), axeFloor=158.0, armB=(-14, 16), lean=22, tilt=20, flow=1.8, tent=0.6, pool=0.5),
        dict(rise=0.38, armF=(0, 0), axeFloor=158.0, armB=(-6, 6), lean=30, tilt=26, flow=2.7, tent=0.0, pool=0.8, dead=True),
        dict(rise=0.16, armF=(0, 0), axeFloor=158.0, armB=(0, 0), lean=30, flow=3.6, tent=0.0, pool=1.0, dead=True),
        dict(rise=0.05, armF=(0, 0), axeFloor=158.0, armB=(0, 0), flow=4.5, tent=0.0, pool=1.1, dead=True),
    ]


def gone():
    # depois que a tinta voltou para o cavaleiro: só o machado no chão e uma mancha rasa
    return [dict(bodyless=True, axeFloor=158.0)]


ANIMS = {
    'pool': (pool(), 3, True),
    'rise': (rise(), 6, False),
    'roar': (roar(), 5, True),
    'idle': (idle(), 6, True),
    'glide': (glide(), 8, True),
    'cleavewind': (cleave_windup(), 5, False),
    'cleave': (cleave(), 16, False),
    'cleaverec': (cleave_recover(), 4, False),
    'sink': (sink(), 10, False),
    'geyser': (geyser(), 10, False),
    'emerge': (emerge(), 6, False),
    'rushwind': (rush_windup(), 5, False),
    'rush': (rush(), 10, True),
    'summon': (summon(), 8, False),
    'throw': (throw(), 9, False),
    'stagger': (stagger(), 5, False),
    'hurt': (hurt(), 10, False),
    'death': (death(), 5, False),
    'gone': (gone(), 1, False),
}

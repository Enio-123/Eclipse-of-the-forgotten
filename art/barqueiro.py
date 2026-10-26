"""O Barqueiro: o sexto chefe (Vale das Cachoeiras). O barqueiro do vale, que levava rio abaixo quem
fugia de Vespera com a memória inteira. A Casa Vhalor o pegou e cobrou a memória dele; ele continua no
lago, empurrando o barco em roda, esperando passageiros.

Alto e curvado, de pé dentro de um barco estreito e comprido: as pernas entram nas tábuas do fundo
abaixo dos joelhos, como se o barco fosse o corpo dele (a madeira cresceu em volta). Capa comprida de
oleado verde-escuro, encharcada e brilhando, presa à borda do barco por algas. O chapéu largo de palha
pesa de tanta água e cai nas pontas, com fiapos soltos; embaixo dele o rosto comprido e cinza de
afogado, a barba rala e os olhos de Âmbar (é a memória cobrada que ficou nele). Nas costas curvadas
cresce Âmbar em cracas, cones com um furo no alto; mais cracas no casco, perto da linha d'água. A corda
de amarrar enrolada no ombro de trás, cruzando o peito até o gancho de ferro no quadril. Na proa, o
gancho com a lanterna das travessias de noite, apagada (acende quando ele senta, vencido).

A vara comprida não está na folha: o jogo desenha a vara solta (barqueiro-pole), passando pela mão da
frente, no ângulo de cada quadro (os pontos 'grip' e 'pole'). Assim a varrida acerta na altura certa de
onde o cavaleiro está, e a vara cai na água quando ele larga.

O boneco olha para a direita (+x). FEET é a linha d'água embaixo dele.

uso: python3 ink_sheets.py <pasta_assets> barqueiro
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm
from rig import rotate_all

puppet.RAMPS['oilcloth'] = [0x0a0f0d, 0x141c18, 0x202b25, 0x313f37, 0x46574c]
puppet.RAMPS['straw'] = [0x2a2111, 0x4a3b1e, 0x6f5b2d, 0x957d41, 0xb9a05b]
puppet.RAMPS['drowned'] = [0x232c29, 0x3a4641, 0x56645d, 0x76847b, 0x9aa79e]
puppet.RAMPS['hemp'] = [0x2b2113, 0x473821, 0x685534, 0x8a7349, 0xab9463]
puppet.RAMPS['hull'] = [0x110c09, 0x1f1712, 0x32251b, 0x473626, 0x604a34]
puppet.RAMPS['weed'] = [0x0b150e, 0x152518, 0x203824, 0x2f4f34, 0x426a47]
puppet.RAMPS['iron'] = [0x141519, 0x24262c, 0x383b43, 0x535761, 0x777c87]
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
puppet.RAMPS.setdefault('amberdim', [0x2a170b, 0x46280f, 0x683c17, 0x8c5422, 0xaa6e34])
puppet.RAMPS.setdefault('brass', [0x3a2a10, 0x5e4419, 0x8a6a2a, 0xb8923f, 0xdcc070])
puppet.SHINY['oilcloth'] = (0.32, 9)
puppet.SHINY['hull'] = (0.16, 8)
puppet.SHINY.setdefault('amber', (0.7, 16))
puppet.SHINY.setdefault('brass', (0.6, 10))
puppet.RIM_MATS |= {'oilcloth', 'hull', 'straw'}

W, H = 150, 146
FEET = (60, 124)
# a vara inteira (px do mundo), do pé (a ponta de cima, gasta) até a ponta de ferro
POLE = 172.0
ARM = (18.0, 17.0)
THIGH = 22.0

DEFAULT = dict(
    # o tronco: inclinação para a frente, a corcunda (a mais nos ombros e no pescoço) e o quadril
    lean=14.0, hunch=16.0, hip=(0.0, 0.0), sit=0.0,
    # a cabeça (+ olha para baixo) e o chapéu (em relação à cabeça)
    tilt=4.0, hat=0.0,
    # a mão da frente: alvo em relação ao ombro da frente; a de trás fica na vara ('grip' px para o pé
    # dela) ou, sem vara nas duas mãos (hB), num alvo em relação ao ombro de trás
    hF=(12.0, 12.0), hB=None, bendF=1, bendB=1,
    # a vara: ângulo na tela (0 = para a frente, 90 = para baixo), o encurtamento (1 = de lado inteira; a
    # varrida passa pela frente do corpo e ela encurta), do pé dela até a mão da frente; pole=None: largou
    pole=78.0, pf=1.0, along=46.0, grip=13.0,
    eyes=1.0, lamp=0, rope=1,
    # o barco: inclinação (+ a proa sobe) e o quanto ele afunda na água (px)
    rot=0.0, off=(0.0, 0.0),
)


def P(d):
    p = dict(DEFAULT)
    p.update(d)
    return p


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def unit(v):
    L = math.hypot(*v) or 1e-6
    return (v[0] / L, v[1] / L)


def up(deg):
    """Para cima inclinado para a frente (0 = reto para cima)."""
    a = math.radians(deg)
    return (math.sin(a), -math.cos(a))


def fwd(deg):
    a = math.radians(deg)
    return (math.cos(a), math.sin(a))


def ik(sh, target, l1, l2, bend):
    dx, dy = target[0] - sh[0], target[1] - sh[1]
    d = max(1e-3, min(math.hypot(dx, dy), l1 + l2 - 0.01))
    a = math.atan2(dy, dx)
    c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
    b = math.acos(max(-1.0, min(1.0, c)))
    e = a + b * bend
    elbow = (sh[0] + math.cos(e) * l1, sh[1] + math.sin(e) * l1)
    ang = math.atan2(target[1] - elbow[1], target[0] - elbow[0])
    hand = (elbow[0] + math.cos(ang) * l2, elbow[1] + math.sin(ang) * l2)
    return elbow, hand


# ---------- o barco ----------
# a borda (de popa a proa) e o fundo (de proa a popa), em relação à linha d'água embaixo dele
GUNWALE = [(-48, -17.0), (-40, -13.5), (-26, -11.6), (-8, -11.0), (12, -11.0), (30, -11.6), (44, -13.6), (54, -17.5),
           (61, -23.5), (65, -30.0), (67, -34.0)]
KEEL = [(67, -34.0), (66, -27.0), (63, -17.0), (58, -8.0), (50, -1.0), (38, 5.0), (20, 8.4), (0, 9.2), (-20, 8.6),
        (-34, 6.0), (-44, 1.0), (-49, -6.0), (-50, -17.0)]


def _interp(pts, x):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if (x0 - x) * (x1 - x) <= 0 and x0 != x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return pts[0][1] if abs(x - pts[0][0]) < abs(x - pts[-1][0]) else pts[-1][1]


def gun_y(x):
    return _interp(GUNWALE, x)


def keel_y(x):
    return _interp(sorted(KEEL[1:-1]), x)


def boat(prims, decals, o, p):
    """O casco (fundo escuro de tábuas, molhado embaixo da linha d'água), a borda de cima, o lado de
    dentro da borda de lá, a popa reta, a proa curva com o gancho e a lanterna e as cracas de Âmbar."""
    P_ = lambda q: add(o, q)
    # o lado de dentro da borda de lá: uma faixa escura logo acima da borda (o barco é visto de cima)
    inner = [P_((x, y - 2.6)) for x, y in GUNWALE[:8]] + [P_((x, y)) for x, y in GUNWALE[7::-1]]
    prims.append(Poly('hullin', 'hull', 1.2, inner, flat=0))
    hull = [P_(q) for q in GUNWALE] + [P_(q) for q in KEEL[1:]]

    def hull_n(x, y):
        lx = x - o[0]
        t0 = gun_y(min(60.0, max(-48.0, lx)))
        t1 = keel_y(min(62.0, max(-48.0, lx)))
        t = max(0.0, min(1.0, (y - o[1] - t0) / max(1.0, t1 - t0)))
        # bojudo: a borda olha para cima, o fundo para baixo; perto da proa vira para a frente
        bow = max(0.0, (lx - 40.0) / 26.0)
        return norm((0.55 * bow, -0.6 + 1.25 * t, 0.85))
    prims.append(Poly('hull', 'hull', 5.5, hull, nf=hull_n))

    def planks(x, y, cur):
        lx = x - o[0]
        ly = y - o[1]
        t0 = gun_y(min(60.0, max(-48.0, lx)))
        t1 = keel_y(min(62.0, max(-48.0, lx)))
        t = (ly - t0) / max(1.0, t1 - t0)
        # embaixo da linha d'água a madeira é mais escura (o jogo ainda passa a água por cima)
        if ly > 1.0:
            return ('hull', 0 if t > 0.8 else 1)
        # as costuras das tábuas, seguindo a curva do casco
        for k in (0.3, 0.56, 0.8):
            if abs(t - k) < 0.035:
                return ('hull', 0)
        # veios da madeira e manchas de limo verde perto da água
        if 0.6 < t and math.sin(lx * 0.7 + t * 9) > 0.86:
            return ('weed', 2)
        if math.sin(lx * 0.23 + t * 31) * math.sin(lx * 0.07) > 0.7:
            return ('hull', 2)
        return None
    decals.append(Decal('hull', planks))
    # a borda de cima: uma peça de madeira mais clara correndo de popa a proa
    for a, b in zip(GUNWALE, GUNWALE[1:]):
        prims.append(Capsule('rail', 'hull', 5.7, P_(a), P_(b), 1.5, 1.5, shade=1.15))
    # a popa reta e o poste da proa
    prims.append(Capsule('stern', 'hull', 5.65, P_((-49, -17)), P_((-50, -5)), 1.7, 1.5, shade=0.8))
    post0 = P_((66.5, -33.0))
    post1 = P_((67.5, -43.0))
    prims.append(Capsule('stem', 'hull', 5.75, post0, post1, 1.5, 1.2, shade=1.05))
    # o gancho de ferro saindo do poste e a lanterna pendurada nele
    arm = P_((73.0, -43.5))
    prims.append(Capsule('lhook', 'iron', 5.8, post1, arm, 0.7, 0.6))
    lan = P_((73.0, -40.0))
    prims.append(Capsule('lchain', 'iron', 5.81, arm, lan, 0.4, 0.4, flat=2))
    cage = [add(lan, (-2.4, 0.6)), add(lan, (2.4, 0.6)), add(lan, (3.2, 3.0)), add(lan, (3.2, 7.0)), add(lan, (2.2, 8.4)),
            add(lan, (-2.2, 8.4)), add(lan, (-3.2, 7.0)), add(lan, (-3.2, 3.0))]
    prims.append(Poly('lcage', 'brass', 5.82, cage, nf=lambda x, y: norm((0.0, -0.3, 0.95)), shade=0.85))
    lit = p['lamp']
    prims.append(Ellipse('lglass', 'amber' if lit else 'amberdim', 5.83, add(lan, (0, 4.7)), 2.1, 2.7, flat=4 if lit else 1))
    for s in (-1.1, 1.1):
        prims.append(Capsule('lbar', 'brass', 5.84, add(lan, (s, 2.2)), add(lan, (s, 7.4)), 0.35, 0.35, shade=0.7))
    # cracas de Âmbar no casco, perto da linha d'água
    for (x, y, r) in ((-36, -2.0, 1.9), (-31, 0.4, 1.4), (-22, -1.4, 1.6), (18, -0.8, 1.7), (24, 1.0, 1.2), (37, -2.6, 1.8), (46, -5.0, 1.3)):
        barnacle(prims, P_((x, y)), r, 5.9, 0.0)
    # as algas compridas penduradas no fundo ficam por conta do jogo (Barqueiro.drawWeed): balançam na água


def barnacle(prims, c, r, z, ang):
    """Craca de Âmbar: um cone baixo com o furo escuro no alto (gira com ang, em graus)."""
    u = up(ang)
    s = (-u[1], u[0])
    top = add(c, u, r * 1.5)
    pts = [add(c, s, -r), add(add(c, u, r * 0.9), s, -r * 0.55), add(top, s, -r * 0.35), add(top, s, r * 0.35),
           add(add(c, u, r * 0.9), s, r * 0.55), add(c, s, r)]
    prims.append(Poly('craca', 'amber', z, pts, nf=lambda x, y: norm((u[0] * 0.3 - 0.3, u[1] * 0.3 - 0.35, 0.85)), shade=1.1))
    prims.append(Ellipse('furo', 'amberdim', z + 0.005, add(top, u, -0.3), r * 0.36, r * 0.22, ang=math.radians(ang), flat=0))


# ---------- o esqueleto ----------
def skeleton(p):
    o = FEET
    sit = p['sit']
    # os joelhos ficam presos no fundo do barco (abaixo da borda); sentado, o quadril desce para trás
    kneeF = add(o, (4.0, -12.0))
    kneeB = add(o, (-6.0, -12.5))
    hip = add(add(o, (0.0 - 9.0 * sit, -34.0 + 13.0 * sit)), p['hip'])
    lean = p['lean']
    hunch = p['hunch']
    low = add(hip, up(lean), 16.0)
    chest = add(low, up(lean + hunch * 0.5), 14.0)
    neck = add(chest, up(lean + hunch), 10.0)
    f = fwd(lean + hunch * 0.6)
    u = up(lean + hunch * 0.6)
    shF = add(add(neck, f, 3.0), u, -4.5)
    shB = add(add(neck, f, -4.5), u, -4.0)
    # a cabeça vai para a frente com a corcunda, mas o rosto olha para a frente (o chapéu fica quase reto)
    hd = lean + hunch + 8.0
    head = add(add(neck, up(hd), 6.5), fwd(hd), 4.0)
    ha = (lean + hunch) * 0.3 + p['tilt']
    # a mão da frente e a vara
    elbowF, handF = ik(shF, add(shF, p['hF']), ARM[0], ARM[1], p['bendF'])
    pole = p['pole']
    pd = fwd(pole) if pole is not None else (0.0, 1.0)
    pf = p['pf']
    butt = add(handF, pd, -p['along'] * pf)
    tip = add(butt, pd, POLE * pf)
    if p['hB'] is None and pole is not None:
        elbowB, handB = ik(shB, add(handF, pd, -p['grip'] * pf), ARM[0], ARM[1], p['bendB'])
    else:
        elbowB, handB = ik(shB, add(shB, p['hB'] if p['hB'] is not None else (4.0, 30.0)), ARM[0], ARM[1], p['bendB'])
    return dict(o=o, kneeF=kneeF, kneeB=kneeB, hip=hip, low=low, chest=chest, neck=neck, f=f, u=u, shF=shF, shB=shB,
                head=head, ha=ha, elbowF=elbowF, handF=handF, elbowB=elbowB, handB=handB, pd=pd, butt=butt, tip=tip)


def turn(p, pt):
    a = math.radians(p['rot'])
    dx, dy = pt[0] - FEET[0], pt[1] - FEET[1]
    x = dx * math.cos(a) - dy * math.sin(a) + p['off'][0]
    y = dx * math.sin(a) + dy * math.cos(a) + p['off'][1]
    return [round(x, 1), round(y, 1)]


def points(pose):
    """Em pixels do mundo, em relação à linha d'água embaixo dele (já com o giro do barco): a mão da frente
    (por onde a vara passa), a vara [ângulo na tela, encurtamento, do pé dela até a mão] ou None (largou),
    a mão de trás (a da corda), a cabeça, o alto do chapéu e a lanterna da proa."""
    p = P(pose)
    k = skeleton(p)
    hat = add(k['head'], up(k['ha'] + p['hat']), 17.0)
    pole = None
    if p['pole'] is not None:
        pole = [round(p['pole'] + p['rot'], 1), round(p['pf'], 3), round(p['along'], 1)]
    return {'grip': turn(p, k['handF']), 'pole': pole, 'rope': turn(p, k['handB']), 'head': turn(p, k['head']),
            'hat': turn(p, hat), 'lamp': turn(p, add(FEET, (73.0, -35.3)))}


def build(pose):
    p = P(pose)
    k = skeleton(p)
    o = k['o']
    prims, decals = [], []
    hip, low, chest, neck, f, u = k['hip'], k['low'], k['chest'], k['neck'], k['f'], k['u']
    shF, shB, head, ha = k['shF'], k['shB'], k['head'], k['ha']
    lean = p['lean']

    # ---------- o braço de trás (atrás do corpo) ----------
    def arm(sh, elbow, hand, z, shade, back):
        prims.append(Capsule('sleeve', 'oilcloth', z, sh, elbow, 6.0, 5.0, shade=shade))
        fd = unit(sub(hand, elbow))
        cuff = add(hand, fd, -4.5)
        prims.append(Capsule('sleeve', 'oilcloth', z + 0.02, elbow, cuff, 5.0, 5.6, shade=shade * 0.96))
        prims.append(Capsule('wrist', 'drowned', z + 0.01, cuff, hand, 1.9, 1.7, shade=shade * 0.9))
        # a mão comprida: a palma e os dedos fechados (na vara) ou abertos
        prims.append(Ellipse('hand', 'drowned', z + 0.04, hand, 3.1, 2.6, ang=math.atan2(fd[1], fd[0]), shade=shade))
        for j in range(3):
            a = math.atan2(fd[1], fd[0]) + (j - 1) * 0.35
            tipf = add(hand, (math.cos(a), math.sin(a)), 4.8 if back == 'open' else 3.2)
            prims.append(Capsule('finger', 'drowned', z + 0.05 + j * 0.001, add(hand, (math.cos(a), math.sin(a)), 1.6), tipf, 0.8, 0.6, shade=shade * 0.95))

    open_hand = 'open' if (p['hB'] is not None and p['pole'] is not None) or p['pole'] is None else 'grip'
    arm(shB, k['elbowB'], k['handB'], 2.0, 0.66, open_hand)

    # ---------- as coxas (só aparece o que a capa não cobre) ----------
    for kn, z in ((k['kneeB'], 2.4), (k['kneeF'], 2.6)):
        prims.append(Capsule('thigh', 'oilcloth', z, add(hip, ((kn[0] - o[0]) * 0.4, 0.0)), kn, 5.4, 4.6, shade=0.7 if z < 2.5 else 0.85))

    # ---------- a capa comprida de oleado ----------
    hemY = o[1] - 11.0
    back_hump = add(add(chest, f, -11.5), u, 2.5)
    coat = [add(add(neck, f, 5.0), u, 1.5),               # a gola, na frente
            add(shF, f, 3.4),
            add(add(chest, f, 9.5), u, -1.0),
            add(add(low, f, 9.5), u, 0.0),
            add(hip, (10.5, 2.0)),
            (o[0] + 16.0 - 4.0 * p['sit'], hemY),             # a barra na frente, caindo na borda
            (o[0] + 4.0, hemY + 1.4),
            (o[0] - 8.0, hemY + 0.6),
            (o[0] - 19.0 - 3.0 * p['sit'], hemY - 0.6),       # a barra atrás, aberta
            add(hip, (-12.5, 1.0)),
            add(add(low, f, -12.0), u, -2.0),
            back_hump,
            add(add(neck, f, -8.5), u, 3.5),
            add(add(neck, f, -2.0), u, 6.0)]
    torso_c = add(chest, f, -1.0)

    def coat_n(x, y):
        # um cilindro curvado: a frente e as costas viram para os lados; o oleado é liso
        lx = (x - torso_c[0]) * f[0] + (y - torso_c[1]) * f[1]
        v = max(-1.0, min(1.0, lx / 11.0))
        return norm((v * 0.7 * f[0] - 0.25, v * 0.7 * f[1] - 0.35, math.sqrt(max(0.1, 1 - v * v))))
    prims.append(Poly('coat', 'oilcloth', 4.0, coat, nf=coat_n))

    def coat_dec(x, y, cur):
        lx = (x - hip[0]) * f[0] + (y - hip[1]) * f[1]
        ly = (x - hip[0]) * u[0] + (y - hip[1]) * u[1]
        # a abertura da capa na frente e as dobras compridas, que descem até a barra
        if abs(lx - 6.5 + ly * 0.05) < 0.45 and ly < 22.0:
            return ('oilcloth', 0)
        for (cx, w) in ((-4.0, 0.4), (1.0, 0.35), (-8.0, 0.35)):
            if abs(lx - cx - ly * 0.12) < w and ly < 14.0:
                return ('oilcloth', 1)
        # o brilho molhado escorrendo em fios
        if math.sin(lx * 1.3 + ly * 0.15) > 0.93 and ly > -10:
            return ('oilcloth', 4)
        # remendos de pano mais claro nas costas
        if -9.5 < lx < -5.0 and 6.0 < ly < 11.0:
            return ('oilcloth', 2)
        return None
    decals.append(Decal('coat', coat_dec))
    # a barra encharcada presa na borda por algas (o barco e ele são uma coisa só)
    for (x0, x1, ln) in ((-15.0, -9.0, 5.0), (-4.0, 1.0, 6.0), (6.0, 11.0, 4.5)):
        for j in range(3):
            xx = x0 + (x1 - x0) * j / 2
            a = (o[0] + xx, hemY - 1.0)
            b = (o[0] + xx + 0.8, hemY + ln - j * 0.6)
            prims.append(Capsule('drape', 'weed', 5.6 + j * 0.001, a, b, 0.9, 0.6, shade=0.85))
    # ---------- as cracas de Âmbar nas costas curvadas ----------
    for (t, r, a) in ((0.0, 2.6, -40.0), (0.25, 2.0, -62.0), (-0.3, 2.2, -28.0), (0.45, 1.6, -78.0), (-0.55, 1.7, -18.0), (0.12, 1.4, -50.0),
                      (0.65, 1.3, -86.0)):
        c = add(add(back_hump, f, 1.0 + t * 3.0), u, t * 6.0 - 7.0)
        barnacle(prims, c, r, 4.3 + t * 0.01, lean + a)

    # ---------- a corda enrolada no ombro de trás e cruzando o peito ----------
    if p['rope']:
        rc = add(add(shB, f, -1.5), u, -1.0)
        for i, (rx, ry, dy) in enumerate(((6.0, 9.5, 2.0), (5.4, 9.0, 3.4), (5.0, 8.4, 4.6))):
            c = add(rc, u, -dy + 3.0)
            for j in range(14):
                a0 = j / 14 * math.pi * 2
                a1 = (j + 1) / 14 * math.pi * 2
                q0 = add(c, (math.cos(a0) * rx, math.sin(a0) * ry))
                q1 = add(c, (math.cos(a1) * rx, math.sin(a1) * ry))
                # a metade de trás da volta passa por trás do corpo
                zr = 4.45 if math.cos(a0) < 0.2 else 1.9
                prims.append(Capsule('rope', 'hemp', zr + i * 0.002, q0, q1, 1.15, 1.15, shade=0.95 - i * 0.05))
        # a ponta que desce cruzando o peito até o quadril, com o gancho de ferro pendurado
        a = add(shB, u, -2.0)
        b = add(hip, (8.0, 3.0))
        prims.append(Capsule('rope', 'hemp', 4.5, a, add(chest, f, 4.0), 1.2, 1.2, shade=1.0))
        prims.append(Capsule('rope', 'hemp', 4.5, add(chest, f, 4.0), b, 1.2, 1.2, shade=1.0))
        prims.append(Ellipse('knot', 'hemp', 4.52, b, 2.4, 2.0, shade=0.9))
        hk = add(b, (2.0, 1.0))
        prims.append(Capsule('hookshaft', 'iron', 4.55, hk, add(hk, (2.6, 2.6)), 0.9, 0.8))
        prims.append(Capsule('hookbend', 'iron', 4.56, add(hk, (2.6, 2.6)), add(hk, (4.6, 0.6)), 0.8, 0.6))

    def rope_dec(x, y, cur):
        # o trançado da corda: riscos inclinados
        return ('hemp', 1) if (int(x * 1.4 + y * 1.4) % 3) == 0 else None
    decals.append(Decal('rope', rope_dec))

    # ---------- a cabeça: o rosto comprido de afogado, a barba rala e os olhos de Âmbar ----------
    hu = up(ha)
    hf = fwd(ha)
    prims.append(Capsule('neckm', 'drowned', 5.6, add(neck, u, -1.0), add(head, hu, -4.0), 3.2, 3.0, shade=0.7))
    face = Ellipse('face', 'drowned', 5.8, head, 4.6, 6.8, ang=math.radians(ha), bulge=0.85)
    prims.append(face)
    eyes = p['eyes']

    def face_dec(x, y, cur):
        lx, ly = face.local(x, y)
        # a sombra da aba larga cobre a testa e os olhos (menos o brilho deles)
        if (lx - 2.4) ** 2 / 2.4 + (ly + 0.4) ** 2 / 0.7 < 1.0:
            if eyes > 0.5:
                return ('amber', 4 if eyes > 0.9 else 3)
            if eyes > 0.05:
                return ('amberdim', 3)
            return ('drowned', 0)
        if ly < -1.2:
            return ('drowned', 0)
        # o nariz comprido e a boca funda
        if 3.6 < lx < 4.8 and -0.8 < ly < 2.2:
            return ('drowned', 2)
        if abs(ly - 3.6) < 0.35 and 0.5 < lx < 3.6:
            return ('drowned', 0)
        if lx < -1.5 and ly < 2.0:
            return ('drowned', 1)
        return None
    decals.append(Decal('face', face_dec))
    # a barba rala e comprida, em fios cinza-esverdeados (parece alga)
    for j, (dx, ln) in enumerate(((0.5, 9.0), (2.0, 11.0), (3.4, 8.0), (-1.0, 6.5))):
        a = add(add(head, hf, dx), hu, -4.6)
        b = add(add(a, hf, -1.2 - j * 0.3), hu, -ln)
        prims.append(Capsule('beard', 'weed', 5.85 + j * 0.001, a, b, 1.0, 0.4, shade=1.15))

    # ---------- o chapéu largo de palha, encharcado ----------
    hat_a = ha + p['hat']
    tu = up(hat_a)
    tf = fwd(hat_a)
    brim_c = add(head, tu, 5.8)
    # a aba: larga, caindo nas pontas (vista um pouco de baixo: o lado de baixo aparece escuro)
    brim = []
    n = 16
    for i in range(n + 1):
        t = -1.0 + 2.0 * i / n
        droop = 3.4 * t * t
        brim.append(add(add(brim_c, tf, t * 26.0), tu, -droop + 1.2))
    for i in range(n, -1, -1):
        t = -1.0 + 2.0 * i / n
        droop = 3.4 * t * t
        brim.append(add(add(brim_c, tf, t * 26.0), tu, -droop - 1.6 - 1.4 * (1 - t * t)))

    def brim_n(x, y):
        lx = (x - brim_c[0]) * tf[0] + (y - brim_c[1]) * tf[1]
        return norm((lx / 40.0, 0.25, 0.9))
    prims.append(Poly('brim', 'straw', 6.4, brim, nf=brim_n, shade=0.8))
    # a copa: um cone baixo e largo, amassado
    apex = add(add(brim_c, tu, 13.0), tf, 1.5)
    crown = [add(add(brim_c, tf, -11.0), tu, 0.4), add(add(brim_c, tf, -6.5), tu, 6.5), add(apex, tf, -2.0), add(apex, tf, 1.6),
             add(add(brim_c, tf, 7.0), tu, 6.0), add(add(brim_c, tf, 11.5), tu, 0.2)]

    def crown_n(x, y):
        lx = (x - brim_c[0]) * tf[0] + (y - brim_c[1]) * tf[1]
        return norm((lx / 14.0 - 0.2, -0.55, 0.8))
    prims.append(Poly('crown', 'straw', 6.5, crown, nf=crown_n))

    def straw(x, y, cur):
        lx = (x - brim_c[0]) * tf[0] + (y - brim_c[1]) * tf[1]
        ly = (x - brim_c[0]) * tu[0] + (y - brim_c[1]) * tu[1]
        # a palha trançada: anéis em volta da copa e riscos na aba; manchas escuras de água
        if cur and cur[0] == 'straw':
            if (int(math.hypot(lx, ly * 2.2) * 0.9) % 2) == 0 and math.sin(math.atan2(ly, lx) * 26) > 0.4:
                return ('straw', max(0, cur[1] - 1))
            if math.sin(lx * 0.5 + ly * 1.7) * math.sin(lx * 0.21) > 0.62:
                return ('straw', 0)
        return None
    decals.append(Decal('brim', straw))
    decals.append(Decal('crown', straw))
    # a fita escura em volta da copa e os fiapos soltos na beira da aba
    prims.append(Capsule('band', 'oilcloth', 6.52, add(add(brim_c, tf, -10.0), tu, 1.6), add(add(brim_c, tf, 10.5), tu, 1.4), 1.3, 1.3, shade=0.8))
    for t in (-0.95, -0.7, -0.4, 0.35, 0.62, 0.88, 1.0):
        droop = 3.4 * t * t
        a = add(add(brim_c, tf, t * 26.0), tu, -droop - 0.6)
        b = add(add(a, tf, t * 1.8), tu, -2.6 - abs(t) * 1.6)
        prims.append(Capsule('frayed', 'straw', 6.45, a, b, 0.45, 0.25, shade=0.7))

    # ---------- o barco (na frente das pernas) ----------
    boat(prims, decals, o, p)

    # ---------- o braço da frente (na frente de tudo; a vara o jogo põe por cima) ----------
    arm(shF, k['elbowF'], k['handF'], 7.0, 1.0, 'open' if p['pole'] is None else 'grip')
    return rotate_all(prims, decals, FEET, p['rot'], p['off'])


# ---------- animações ----------
def _p(**kw):
    return kw


def sweep(phis, height, lean, hip=(0.0, 0.0)):
    """A varrida: a vara gira em volta dele, na horizontal (phi: 180 = para trás, 90 = vindo para a frente
    do corpo, 0 = para a frente). Na tela a vara encurta quando aponta para quem olha e desce um pouco."""
    out = []
    for phi in phis:
        a = math.radians(phi)
        sx = math.cos(a)
        sy = math.sin(a) * 0.16 + height
        ang = math.degrees(math.atan2(sy, sx))
        pf = max(0.12, math.hypot(sx, sy))
        # as mãos giram junto, um pouco à frente do corpo
        hx = math.cos(a) * 12.0 + 8.0
        hy = 16.0 + math.sin(a) * 3.0 + height * 60.0
        out.append(dict(lean=lean, hunch=12.0, hip=hip, hF=(hx, hy), pole=ang, pf=pf, along=22.0, grip=12.0, tilt=-4.0))
    return out


IDLE = dict(hF=(12.0, 12.0), pole=78.0, along=46.0)
ANIMS = {
    # esperando passageiro: a vara em pé na água ao lado do barco, a cabeça baixa, os olhos quase apagados
    'sleep': ([_p(hF=(8.0, 4.0), pole=89.0, along=58.0, grip=14.0, tilt=22.0, eyes=0.12, lean=10.0),
               _p(hF=(8.0, 4.5), pole=89.0, along=58.0, grip=14.0, tilt=23.0, eyes=0.12, lean=10.5, hunch=16.6)], 1, True),
    # levanta a cabeça, os olhos acendem, e a mão de trás pede a passagem (a palma para cima)
    'wake': ([_p(hF=(8.0, 4.0), pole=89.0, along=58.0, grip=14.0, tilt=12.0, eyes=0.5, lean=8.0),
              _p(hF=(8.0, 3.0), pole=89.0, along=58.0, tilt=-2.0, eyes=1.0, lean=6.0, hB=(24.0, 18.0), bendB=-1),
              _p(hF=(8.0, 3.0), pole=89.0, along=58.0, tilt=-4.0, eyes=1.0, lean=6.0, hB=(30.0, 16.0), bendB=-1)], 3, False),
    'idle': ([_p(**IDLE), _p(**IDLE, hunch=16.8, hip=(0.0, 0.4)), _p(**IDLE, hunch=17.2, hip=(0.0, 0.6)), _p(**IDLE, hunch=16.6, hip=(0.0, 0.3))], 5, True),
    # empurrando o barco: a vara crava atrás, ele empurra inclinado, tira e leva para a frente de novo
    'pole': ([_p(hF=(16.0, -4.0), pole=100.0, along=62.0, lean=12.0),
              _p(hF=(4.0, 12.0), pole=114.0, along=50.0, lean=20.0, hunch=18.0),
              _p(hF=(-8.0, 22.0), pole=126.0, along=36.0, lean=26.0, hunch=19.0),
              _p(hF=(-2.0, 10.0), pole=104.0, along=48.0, lean=18.0),
              _p(hF=(10.0, 0.0), pole=76.0, along=56.0, lean=12.0),
              _p(hF=(16.0, -6.0), pole=88.0, along=62.0, lean=10.0)], 8, True),
    # varrida baixa: a ponta arrastando na água atrás, ele curvado
    'sweepwind-lo': ([_p(hF=(-6.0, 20.0), pole=168.0, along=22.0, lean=24.0, hunch=14.0, tilt=-6.0),
                      _p(hF=(-10.0, 22.0), pole=172.0, along=22.0, lean=28.0, hunch=14.0, tilt=-8.0, hip=(-1.5, 1.0))], 4, False),
    'sweep-lo': (sweep((150.0, 105.0, 55.0, 12.0), 0.14, 26.0), 14, False),
    # varrida alta: a vara para trás na altura da cabeça
    'sweepwind-hi': ([_p(hF=(-8.0, -8.0), pole=192.0, along=22.0, lean=4.0, hunch=12.0, tilt=-10.0),
                      _p(hF=(-11.0, -10.0), pole=196.0, along=22.0, lean=0.0, hunch=12.0, tilt=-12.0, hip=(-1.5, 0.0))], 4, False),
    'sweep-hi': (sweep((160.0, 112.0, 60.0, 8.0), -0.06, 10.0), 14, False),
    'sweeprec': ([_p(hF=(14.0, 8.0), pole=30.0, along=30.0, lean=16.0), _p(**IDLE)], 6, False),
    # a pancada: a vara em pé por cima da cabeça, a ponta lá em cima, e desce na frente
    'slamwind': ([_p(hF=(6.0, -26.0), pole=-86.0, along=30.0, lean=2.0, hunch=10.0, tilt=-14.0, bendF=-1),
                  _p(hF=(2.0, -30.0), pole=-96.0, along=30.0, lean=-4.0, hunch=8.0, tilt=-16.0, bendF=-1, hip=(-1.0, -0.5))], 4, False),
    'slam': ([_p(hF=(14.0, -18.0), pole=-40.0, along=30.0, lean=18.0, hunch=14.0, tilt=0.0, bendF=-1),
              _p(hF=(22.0, 2.0), pole=8.0, along=30.0, lean=30.0, hunch=16.0, tilt=6.0),
              _p(hF=(22.0, 8.0), pole=26.0, along=30.0, lean=32.0, hunch=16.0, tilt=8.0)], 14, False),
    'slamrec': ([_p(hF=(18.0, 6.0), pole=36.0, along=34.0, lean=26.0), _p(hF=(14.0, 8.0), pole=60.0, along=42.0, lean=18.0)], 4, False),
    # a corda: a vara fica em pé na mão da frente e a de trás gira a laçada por cima da cabeça
    'ropewind': ([_p(hF=(8.0, 4.0), pole=89.0, along=58.0, lean=6.0, hB=(6.0 + 7.0 * math.cos(a), -34.0 + 4.0 * math.sin(a)), bendB=-1, tilt=-6.0)
                  for a in (0.0, math.pi / 2, math.pi, 3 * math.pi / 2)], 10, True),
    'rope': ([_p(hF=(8.0, 4.0), pole=89.0, along=58.0, lean=14.0, hB=(22.0, -6.0), bendB=-1, tilt=-4.0),
              _p(hF=(8.0, 4.0), pole=89.0, along=58.0, lean=18.0, hB=(33.0, 9.0), bendB=-1, tilt=-2.0)], 10, False),
    # puxando a corda de volta, mão por mão
    'pull': ([_p(hF=(8.0, 4.0), pole=89.0, along=58.0, lean=6.0, hB=(26.0, 2.0), bendB=-1, tilt=-2.0),
              _p(hF=(8.0, 4.0), pole=89.0, along=58.0, lean=0.0, hB=(2.0, 16.0), bendB=1, tilt=-6.0, hip=(-1.5, 0.0))], 6, True),
    # a estocada curta quando a corda traz o cavaleiro
    'jab': ([_p(hF=(4.0, 10.0), pole=8.0, along=30.0, lean=8.0, tilt=-4.0), _p(hF=(28.0, 8.0), pole=6.0, along=30.0, lean=24.0, tilt=0.0)], 12, False),
    # aparado: a vara sobe, ele joga o corpo para trás
    'stagger': ([_p(hF=(6.0, -8.0), pole=-58.0, along=36.0, lean=-8.0, hunch=10.0, tilt=-16.0, bendF=-1),
                 _p(hF=(8.0, -4.0), pole=-50.0, along=36.0, lean=-4.0, hunch=12.0, tilt=-10.0, bendF=-1)], 5, False),
    # afundando com o barco: a vara em pé nas duas mãos, o barco inclinando de bico
    'sink': ([_p(hF=(8.0, -20.0), pole=-88.0, along=40.0, lean=4.0, tilt=-8.0, bendF=-1, rot=-4.0),
              _p(hF=(6.0, -26.0), pole=-90.0, along=40.0, lean=0.0, tilt=-14.0, bendF=-1, rot=-9.0)], 4, False),
    # subindo de baixo: a proa empinada, a vara para cima
    'surge': ([_p(hF=(8.0, -24.0), pole=-82.0, along=40.0, lean=-2.0, tilt=-12.0, bendF=-1, rot=14.0, hat=-8.0),
               _p(hF=(12.0, -16.0), pole=-70.0, along=40.0, lean=6.0, tilt=-6.0, bendF=-1, rot=6.0, hat=-4.0)], 10, False),
    # vencido: a vara escapa, ele senta no barco com a cabeça baixa; a lanterna da proa acende
    'death': ([_p(hF=(6.0, -6.0), pole=-64.0, along=40.0, lean=-6.0, tilt=-14.0, bendF=-1, eyes=0.8),
               _p(hF=(16.0, 10.0), pole=None, hB=(10.0, 20.0), lean=6.0, tilt=4.0, eyes=0.5, sit=0.3),
               _p(hF=(14.0, 18.0), pole=None, hB=(8.0, 22.0), lean=22.0, hunch=20.0, tilt=18.0, eyes=0.2, sit=0.8, lamp=1),
               _p(hF=(12.0, 20.0), pole=None, hB=(6.0, 24.0), lean=26.0, hunch=22.0, tilt=28.0, eyes=0.0, sit=1.0, lamp=1, hat=6.0)], 4, False),
}


# ---------- a vara solta e a mão por cima dela ----------
puppet.RAMPS['polewood'] = [0x1c1712, 0x312a21, 0x4a4033, 0x665a49, 0x857763]
POLE_W, POLE_H = int(POLE) + 6, 12
POLE_BUTT = 2.0


def pole_image():
    """A vara deitada, do pé (esquerda, em POLE_BUTT) até a ponta de ferro (direita): madeira cinza de
    tanto sol e água, as amarras de corda onde as mãos seguram, crosta de Âmbar no trecho que vive
    dentro d'água e, na ponta, o ferro com o gancho de barqueiro."""
    prims, decals = [], []
    cy = POLE_H / 2
    x0 = POLE_BUTT
    x1 = x0 + POLE
    shaft_end = x1 - 9.0
    # cilindro de frente: a luz no meio (a vara gira na tela, então a luz não tem lado)
    nf = lambda x, y: norm((0.0, (y - cy) / 2.2 * 0.8, 0.8))
    prims.append(Poly('shaft', 'polewood', 1.0, [(x0 + 1.0, cy - 1.8), (shaft_end, cy - 1.5), (shaft_end, cy + 1.5), (x0 + 1.0, cy + 1.8)], nf=nf))

    def grain(x, y, cur):
        if math.sin(x * 0.9 + math.sin(x * 0.13) * 3.0) > 0.9 and abs(y - cy) < 1.0:
            return ('polewood', 1)
        if math.sin(x * 0.31) * math.sin(x * 0.047 + 1.0) > 0.82 and y < cy:
            return ('polewood', 3)
        return None
    decals.append(Decal('shaft', grain))
    prims.append(Ellipse('knob', 'polewood', 1.1, (x0 + 1.4, cy), 2.0, 2.2, shade=0.9))
    for (a, b) in ((22.0, 30.0), (40.0, 45.0)):
        prims.append(Poly('wrap', 'hemp', 1.2, [(x0 + a, cy - 2.2), (x0 + b, cy - 2.2), (x0 + b, cy + 2.2), (x0 + a, cy + 2.2)], nf=nf))
    decals.append(Decal('wrap', lambda x, y, cur: ('hemp', 1) if (int(x * 1.6 + y * 1.2) % 3) == 0 else None))
    # a crosta de Âmbar no trecho de baixo
    for i, t in enumerate((0.7, 0.74, 0.79, 0.83, 0.88)):
        x = x0 + POLE * t
        side = -1 if i % 2 else 1
        prims.append(Ellipse('crust', 'amber', 1.3, (x, cy + side * 1.6), 1.6 - (i % 3) * 0.3, 1.0, shade=1.1))
    # o ferro da ponta: a luva, a ponta reta e o gancho virado para trás
    prims.append(Capsule('ferrule', 'iron', 1.4, (shaft_end - 2.0, cy), (shaft_end + 3.0, cy), 2.0, 1.8, shade=0.95))
    prims.append(Poly('spike', 'iron', 1.5, [(shaft_end + 3.0, cy - 1.3), (x1, cy), (shaft_end + 3.0, cy + 1.3)], nf=lambda x, y: norm((0.3, -0.4, 0.86))))
    prims.append(Capsule('hook', 'iron', 1.45, (shaft_end + 2.0, cy - 1.0), (shaft_end + 4.5, cy - 4.2), 0.8, 0.6))
    prims.append(Capsule('hook', 'iron', 1.46, (shaft_end + 4.5, cy - 4.2), (shaft_end + 1.4, cy - 5.2), 0.6, 0.45))
    return prims, decals, POLE_W, POLE_H


FIST_W, FIST_H = 12, 12


def fist_image():
    """A mão da frente fechada na vara (o jogo põe por cima dela, girada junto): os dedos passando por
    cima, os nós dos dedos e o polegar."""
    prims = []
    c = (FIST_W / 2, FIST_H / 2)
    prims.append(Ellipse('palm', 'drowned', 1.0, (c[0] - 0.4, c[1] + 0.2), 3.3, 3.0, shade=0.95))
    for j, dx in enumerate((-1.8, -0.2, 1.4)):
        prims.append(Capsule('finger', 'drowned', 1.1 + j * 0.01, (c[0] + dx, c[1] - 2.6), (c[0] + dx + 0.3, c[1] + 2.6), 0.95, 0.85, shade=1.0 - j * 0.04))
    prims.append(Capsule('thumb', 'drowned', 1.2, (c[0] + 2.6, c[1] + 1.8), (c[0] + 3.6, c[1] - 1.0), 0.9, 0.8, shade=0.9))
    prims.append(Capsule('cuff', 'oilcloth', 0.9, (c[0] - 5.4, c[1]), (c[0] - 2.8, c[1]), 2.6, 2.4, shade=0.9))
    return prims, [], FIST_W, FIST_H

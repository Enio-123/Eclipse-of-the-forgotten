"""O Mestre da Caça: o quinto chefe, o caçador-mor da Casa Vhalor. Trazia os fugitivos de volta pela
neve e os entregava ao carrasco no fim da trilha; congelou esperando uma presa que nunca voltou.

Alto e magro. Casaco comprido de peles de lobo, fechado no peito pelo brasão da Casa (um anel de
latão com uma gota de Âmbar no meio). Por cima, a pele inteira de um lobo: a cabeça do bicho é o
capuz (o focinho por cima da testa dele, as orelhas em pé) e as patas da frente caem amarradas no
peito. O rosto quase não aparece embaixo do capuz: pele cinza de frio, os olhos claros e a barba
comprida congelada, com pingentes de gelo. Botas enroladas em pele, luvas de couro. A trompa de
chifre presa no cinto, atrás. A lança de caça é longa, de freixo escuro com as tiras de couro do
punho, a lâmina de ferro em folha e as duas asas de travar logo atrás dela; na asa fica pendurada a
lanterna de latão com o vidro de Âmbar (é ela que mostra o rastro de quem lembra demais). Geada no
capuz, nos ombros, na barra do casaco e na lança.

O boneco olha para a direita (+x).

uso: python3 ink_sheets.py <pasta_assets> cacador
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot
from rig import rotate_all

puppet.RAMPS['peltgrey'] = [0x14161b, 0x252931, 0x3b414b, 0x58606c, 0x7c8592]
puppet.RAMPS['pelt'] = [0x17130f, 0x2b241c, 0x453a2d, 0x645542, 0x8a775d]
puppet.RAMPS['coldskin'] = [0x262d38, 0x434e5d, 0x667487, 0x8e9caf, 0xb9c5d4]
puppet.RAMPS['beard'] = [0x56616e, 0x808c9b, 0xabb7c5, 0xd3dde8, 0xf3f8fd]
puppet.RAMPS.setdefault('frost', [0x4f5f74, 0x7d90a8, 0xa9bdd3, 0xd3e2f0, 0xf4f9ff])
puppet.RAMPS.setdefault('iceeye', [0x1d3550, 0x2f5a85, 0x5a92c4, 0x9fd0f2, 0xe8f7ff])
puppet.RAMPS.setdefault('brass', [0x3a2a10, 0x5e4419, 0x8a6a2a, 0xb8923f, 0xdcc070])
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
puppet.RAMPS.setdefault('amberdim', [0x2a170b, 0x46280f, 0x683c17, 0x8c5422, 0xaa6e34])
puppet.SHINY.setdefault('frost', (0.45, 12))
puppet.SHINY.setdefault('brass', (0.6, 10))
puppet.SHINY.setdefault('amber', (0.7, 16))
puppet.RIM_MATS |= {'peltgrey', 'pelt'}

W, H = 300, 214
BASE_HIP = (132.0, 124.0)
FEET = (132, 166)
FLOOR = 165.5
ARM = (15.0, 14.0)
THIGH = 20.0
SHIN = 19.0
HAFT = 100.0

DEFAULT = dict(
    hip=(0.0, 0.0), lean=6.0, tilt=0.0,
    legF=(8.0, 12.0), legB=(-8.0, 12.0), footF=0.0, footB=0.0,
    # braço da frente: alvo da mão (relativo ao quadril) ou ângulos (0 = para baixo, 90 = para a frente)
    hF=None, bendF=1, armF=(30.0, 40.0),
    armB=(-10.0, 30.0), bendB=1,
    # a lança: direção do cabo a partir da mão (0 = para baixo, 90 = para a frente, 180 = para cima),
    # a distância da mão da frente até o pé do cabo e a mão de trás no cabo (atrás da da frente)
    spear=70.0, spos=34.0, grip=16.0,
    # a lanterna: o quanto ela balança (graus a partir da vertical)
    swing=0.0,
    horn=False, iced=False, eyes=True, glow=False, dim=False,
    # a lança largada (morte): onde fica o pé do cabo e o ângulo, sem mão
    drop=None,
    rot=0.0, pivot=None, off=(0.0, 0.0),
)


def P(d):
    p = dict(DEFAULT)
    p.update(d)
    return p


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def dirv(deg):
    a = math.radians(deg)
    return (math.sin(a), math.cos(a))


def unit(v):
    L = math.hypot(*v) or 1e-6
    return (v[0] / L, v[1] / L)


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


def skeleton(p):
    hip = add(BASE_HIP, p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))
    f = (math.cos(lean), math.sin(lean))
    neck = add(hip, u, 30.0)
    shF = add(add(neck, f, 3.5), u, -4.0)
    shB = add(add(neck, f, -4.5), u, -4.0)
    head = add(add(neck, u, 8.5), f, 3.0)
    if p['hF'] is not None:
        elbowF, handF = ik(shF, add(hip, p['hF']), ARM[0], ARM[1], p['bendF'])
    else:
        up, el = p['armF']
        elbowF = add(shF, dirv(up), ARM[0])
        handF = add(elbowF, dirv(up + el), ARM[1])
    sd = dirv(p['spear'])
    if p['drop'] is not None:
        butt = add(BASE_HIP, p['drop'][0])
        sd = dirv(p['drop'][1])
    else:
        butt = add(handF, sd, -p['spos'])
    tip = add(butt, sd, HAFT)
    if p['horn']:
        # a trompa na boca: a mão de trás segura o bocal na frente do rosto
        elbowB, handB = ik(shB, add(add(head, f, 5.0), u, -6.5), ARM[0], ARM[1], -1)
    elif p['grip'] and p['drop'] is None:
        elbowB, handB = ik(shB, add(handF, sd, -p['grip']), ARM[0], ARM[1], p['bendB'])
    else:
        upB, elB = p['armB']
        elbowB = add(shB, dirv(upB), ARM[0])
        handB = add(elbowB, dirv(upB + elB), ARM[1])
    # onde a lanterna pendura: na asa de travar, logo atrás da lâmina; ela cai reto (a corrente)
    hook = add(butt, sd, HAFT - 15.0)
    hang = dirv(p['swing'])
    lantern = add(hook, hang, 9.0)
    return dict(hip=hip, lean=lean, u=u, f=f, neck=neck, shF=shF, shB=shB, head=head,
                elbowF=elbowF, handF=handF, elbowB=elbowB, handB=handB, sd=sd, butt=butt, tip=tip,
                hook=hook, lantern=lantern, hang=hang)


def turn(p, pt):
    x, y = pt
    if p['rot']:
        piv = p['pivot'] or FEET
        a = math.radians(p['rot'])
        dx, dy = x - piv[0], y - piv[1]
        x = piv[0] + dx * math.cos(a) - dy * math.sin(a) + p['off'][0]
        y = piv[1] + dx * math.sin(a) + dy * math.cos(a) + p['off'][1]
    return [round(x - FEET[0], 1), round(y - FEET[1], 1)]


def points(pose):
    p = P(pose)
    k = skeleton(p)
    return {'tip': turn(p, k['tip']), 'lantern': turn(p, add(k['lantern'], k['hang'], 3.0)), 'hand': turn(p, k['handF'])}


def frostcap(prims, a, b, z, thick=1.4, drips=()):
    """Faixa de geada de a até b, com pingentes pendurados (t ao longo da faixa, comprimento)."""
    prims.append(Capsule('frostcap', 'frost', z, a, b, thick, thick * 0.8))
    d = unit(sub(b, a))
    for t, ln in drips:
        c = add(a, d, math.hypot(*sub(b, a)) * t)
        prims.append(Poly('icicle', 'frost', z + 0.005, [add(c, d, -0.8), add(c, d, 0.8), add(c, (0, 1), ln)],
                          nf=lambda x, y: norm((0.4, 0.0, 0.9))))


def spear(prims, decals, k, p, z):
    """A lança de caça: cabo de freixo com as tiras do punho, a lâmina em folha e as asas de travar;
    a lanterna de latão pendurada na asa."""
    sd, butt, tip = k['sd'], k['butt'], k['tip']
    side = (sd[1], -sd[0])
    shaft_end = add(butt, sd, HAFT - 13.0)
    prims.append(Capsule('haft', 'wood', z, butt, shaft_end, 1.35, 1.2, shade=0.85))
    prims.append(Ellipse('ferrule', 'steel', z + 0.01, add(butt, sd, 0.8), 1.6, 1.6, shade=0.8))
    # tiras de couro no punho (onde as mãos seguram)
    for t in (0.28, 0.33, 0.38, 0.43):
        c = add(butt, sd, HAFT * t)
        prims.append(Capsule('wrap', 'leather', z + 0.02, add(c, sd, -1.2), add(c, sd, 1.2), 1.7, 1.7, shade=0.75))
    # as asas de travar (atravessadas) e a lâmina em folha
    wing_c = add(butt, sd, HAFT - 14.0)
    prims.append(Capsule('lug', 'steel', z + 0.03, add(wing_c, side, -4.0), add(wing_c, side, 4.0), 1.1, 0.8, shade=0.9))
    socket = add(butt, sd, HAFT - 13.5)
    blade = [add(socket, side, -1.5), add(add(socket, sd, 4.0), side, -3.6), add(add(socket, sd, 9.0), side, -2.4), tip,
             add(add(socket, sd, 9.0), side, 2.4), add(add(socket, sd, 4.0), side, 3.6), add(socket, side, 1.5)]
    nb = norm((side[0] * 0.2, side[1] * 0.2 - 0.4, 0.88))
    prims.append(Poly('blade', 'steel', z + 0.04, blade, nf=lambda x, y: nb))
    prims.append(Capsule('ridge', 'steel', z + 0.05, add(socket, sd, 1.0), add(tip, sd, -1.5), 0.45, 0.3, flat=4))
    if p['iced'] or not p['dim']:
        # geada grudada no cabo
        for t in (0.55, 0.7) if not p['iced'] else (0.5, 0.6, 0.7, 0.8):
            c = add(butt, sd, HAFT * t)
            prims.append(Capsule('hfrost', 'frost', z + 0.025, add(c, sd, -2.5), add(c, sd, 2.0), 1.5, 1.3))
    # a lanterna: a corrente curta, a argola de cima, a gaiola de latão e o vidro de Âmbar
    hook, lan, hang = k['hook'], k['lantern'], k['hang']
    hs = (hang[1], -hang[0])
    prims.append(Capsule('lchain', 'steel', z + 0.06, hook, lan, 0.45, 0.45, flat=2))
    prims.append(Ellipse('lring', 'brass', z + 0.07, lan, 1.3, 1.3, shade=0.8))
    body_c = add(lan, hang, 5.0)
    cage = [add(add(lan, hang, 1.4), hs, -2.2), add(add(lan, hang, 1.4), hs, 2.2), add(add(lan, hang, 3.2), hs, 3.4),
            add(add(lan, hang, 7.6), hs, 3.4), add(add(lan, hang, 9.2), hs, 2.4), add(add(lan, hang, 9.2), hs, -2.4),
            add(add(lan, hang, 7.6), hs, -3.4), add(add(lan, hang, 3.2), hs, -3.4)]
    prims.append(Poly('lcage', 'brass', z + 0.08, cage, nf=lambda x, y: norm((0.0, -0.3, 0.95)), shade=0.95))
    glass = Ellipse('lglass', 'amberdim' if p['dim'] else 'amber', z + 0.09, body_c, 2.3, 2.9, flat=1 if p['dim'] else 4)
    prims.append(glass)
    for s in (-1.15, 1.15):
        prims.append(Capsule('lbar', 'brass', z + 0.1, add(add(lan, hang, 2.6), hs, s), add(add(lan, hang, 8.0), hs, s), 0.4, 0.4, shade=0.7))

    def flame(x, y, cur):
        lx, ly = glass.local(x, y)
        if p['dim']:
            return None
        if lx * lx / 1.2 + (ly - 0.4) ** 2 / 2.4 < 1.0:
            return ('amber', 4)
        return None

    decals.append(Decal('lglass', flame))


def build(pose):
    p = P(pose)
    k = skeleton(p)
    hip, u, f, neck, shF, shB, head, lean = (k[n] for n in ('hip', 'u', 'f', 'neck', 'shF', 'shB', 'head', 'lean'))
    elbowF, handF, elbowB, handB = k['elbowF'], k['handF'], k['elbowB'], k['handB']
    glow = p['glow'] and not p['dim']
    iced = p['iced']
    prims, decals = [], []
    knees = {}

    # ---------- pernas: calça escura, botas enroladas em pele ----------
    def leg(name, root, ang, z, shade, footang):
        th, kn = ang
        knee = add(root, dirv(th), THIGH)
        ankle = add(knee, dirv(th - kn), SHIN)
        knees[name] = (knee, ankle)
        fa = math.radians(footang)
        fd = (math.cos(fa), math.sin(fa))
        toe = add(ankle, fd, 8.5)
        heel = add(ankle, fd, -2.6)
        prims.append(Capsule('thigh', 'cloth', z, root, knee, 5.0, 4.0, shade=shade))
        prims.append(Capsule('shin', 'cloth', z + 0.02, knee, ankle, 3.8, 3.2, shade=shade))
        boot_top = add(knee, dirv(th - kn), SHIN * 0.42)
        prims.append(Capsule('boot', 'pelt', z + 0.04, boot_top, ankle, 4.6, 3.9, shade=shade))
        for t in (0.3, 0.62):
            c = add(boot_top, sub(ankle, boot_top), t)
            prims.append(Capsule('bootstrap', 'leather', z + 0.05, add(c, (1, 0), -4.2), add(c, (1, 0), 4.2), 0.7, 0.7, shade=shade * 0.7))
        prims.append(Capsule('foot', 'leather', z + 0.04, heel, toe, 3.4, 2.8, shade=shade))
        if iced:
            prims.append(Ellipse('bootfrost', 'frost', z + 0.06, add(add(toe, fd, -3.0), (0, -2.4)), 2.4, 1.1))

    leg('B', add(hip, f, -3.5), p['legB'], 1.5, 0.62, p['footB'])
    leg('F', add(hip, f, 3.5), p['legF'], 4.0, 1.0, p['footF'])

    # ---------- a pele de lobo nas costas (fica atrás do corpo) ----------
    back_top = add(add(neck, f, -6.0), u, 4.0)
    mantle = [back_top, add(add(neck, f, 2.0), u, 5.0), add(add(neck, f, 6.5), u, -1.0), add(add(neck, f, -2.0), u, -10.0),
              add(add(hip, f, -6.0), u, 8.0), add(add(hip, f, -7.0), u, -2.0), add(add(hip, f, -11.0), u, -5.0),
              add(add(hip, f, -12.5), u, -1.0), add(add(hip, f, -14.0), u, -6.0), add(add(hip, f, -12.5), u, 8.0),
              add(add(neck, f, -11.0), u, -8.0)]
    prims.append(Poly('mantle', 'pelt', 2.0, mantle, nf=lambda x, y: norm((-0.25, -0.3, 0.9)), shade=0.85))

    # ---------- braço de trás ----------
    def arm(sh, elbow, hand, z, shade):
        prims.append(Capsule('upperarm', 'peltgrey', z, sh, elbow, 5.0, 4.2, shade=shade))
        prims.append(Capsule('forearm', 'peltgrey', z + 0.03, elbow, hand, 4.0, 3.2, shade=shade * 0.95))
        fd = unit(sub(hand, elbow))
        prims.append(Capsule('cuff', 'pelt', z + 0.035, add(hand, fd, -5.0), add(hand, fd, -2.4), 4.2, 3.9, shade=shade * 0.9))
        prims.append(Ellipse('hand', 'leather', z + 0.08, hand, 3.2, 3.0, shade=shade))

    zB = 7.4 if p['horn'] else 2.2
    if p['horn']:
        arm(shB, elbowB, handB, zB, 0.9)
    else:
        arm(shB, elbowB, handB, zB, 0.66)

    # ---------- a trompa de chifre no cinto, atrás (ou na boca) ----------
    belt = add(hip, u, 4.0)
    if p['horn']:
        m = handB
        d1 = unit(add(f, u, 0.9))
        pts = [add(m, f, 1.0)]
        for i in range(5):
            a = math.atan2(d1[1], d1[0]) - i * 0.16
            pts.append(add(pts[-1], (math.cos(a), math.sin(a)), 3.6))
        for i in range(5):
            prims.append(Capsule('horn', 'bone', 7.5 + i * 0.01, pts[i], pts[i + 1], 0.9 + i * 0.45, 1.3 + i * 0.5, shade=0.95))
        prims.append(Capsule('hornband', 'brass', 7.56, add(pts[2], (0, 0), 0), add(pts[2], unit(sub(pts[3], pts[2])), 1.0), 2.4, 2.4))
        prims.append(Ellipse('hornbell', 'void', 7.57, pts[5], 1.2, 2.6, ang=math.atan2(pts[5][1] - pts[4][1], pts[5][0] - pts[4][0]), flat=0))
    else:
        # pendurada pelo cordão no cinto, de boca para baixo, junto do casaco
        h0 = add(add(belt, f, -7.5), u, -2.0)
        prims.append(Capsule('horncord', 'leather', 2.55, add(belt, f, -6.0), h0, 0.5, 0.5, flat=1))
        pts = [h0]
        for i in range(4):
            a = math.radians(96 - i * 16) + lean
            pts.append(add(pts[-1], (math.cos(a) * -0.35, math.sin(a)), 2.6))
        for i in range(4):
            prims.append(Capsule('horn', 'bone', 2.6 + i * 0.01, pts[i], pts[i + 1], 0.7 + i * 0.32, 0.95 + i * 0.36, shade=0.75))
        prims.append(Capsule('hornband', 'brass', 2.66, pts[1], add(pts[1], unit(sub(pts[2], pts[1])), 0.8), 1.3, 1.3, shade=0.8))

    # ---------- o casaco comprido de peles ----------
    kF, aF = knees['F']
    kB, aB = knees['B']
    hemB = add(add(kB, sub(aB, kB), 0.42), (-4.0, 0.0))
    hemF = add(add(kF, sub(aF, kF), 0.42), (4.0, 0.0))
    coat = [add(add(neck, f, -6.0), u, -1.5), add(shB, f, -2.0), add(add(hip, f, -8.5), u, 8.0), add(add(hip, f, -9.0), u, -2.0), hemB]
    # a barra peluda, de trás para a frente, em tufos
    n = 9
    for i in range(1, n):
        q = add(hemB, sub(hemF, hemB), i / n)
        coat.append(add(q, (0, 2.4 if i % 2 else -0.4)))
    coat += [hemF, add(add(hip, f, 8.0), u, -2.0), add(add(hip, f, 7.0), u, 10.0), add(add(neck, f, 7.0), u, -9.0), add(add(neck, f, 5.5), u, -1.0)]
    prims.append(Poly('coat', 'peltgrey', 4.5, coat, nf=lambda x, y: norm((0.1, -0.25, 0.95))))

    def coat_dec(x, y, cur):
        lx, ly = rot((x - hip[0], y - hip[1]), -lean)
        # a costura da frente (o casaco cruza) e riscos de pelo
        if abs(lx - 5.0 + ly * 0.08) < 0.45 and -26.0 < ly < 14.0:
            return ('peltgrey', 0)
        for (cx, cy, ln) in ((-4.0, 6.0, 5.0), (1.0, 12.0, 4.0), (-6.0, -14.0, 4.0), (2.0, -6.0, 3.0), (-2.0, 18.0, 4.0)):
            if abs(lx - cx - (ly - cy) * 0.25) < 0.35 and cy - ln < ly < cy:
                return ('peltgrey', 1)
        return None

    decals.append(Decal('coat', coat_dec))
    # o cinto, a fivela e as tiras de couro cruzadas no peito
    prims.append(Capsule('belt', 'leather', 4.8, add(belt, f, -9.5), add(belt, f, 9.0), 2.0, 2.0, shade=0.7))
    prims.append(Ellipse('buckle', 'brass', 4.85, add(belt, f, 4.5), 1.9, 1.8))
    prims.append(Capsule('strap', 'leather', 4.75, add(add(neck, f, -4.0), u, -2.0), add(belt, f, 5.0), 1.2, 1.2, shade=0.65))
    # a geada na barra e nos ombros
    # a geada grudada na barra: uma franja irregular e pingentes
    fr_top = [add(q, (0, -1.6 if iced else -1.0)) for q in coat[4:4 + n + 1]]
    fr_bot = []
    for i, q in enumerate(coat[4:4 + n + 1]):
        fr_bot.append(add(q, (0, 1.4 + (1.2 if i % 3 == 1 else 0.0))))
    prims.append(Poly('hemfrost', 'frost', 4.55, fr_top + fr_bot[::-1], nf=lambda x, y: norm((0.0, -0.4, 0.92))))
    for t, ln in (((0.15, 2.6), (0.4, 3.6), (0.62, 2.2), (0.85, 3.0)) if iced else ((0.3, 1.8), (0.72, 2.2))):
        c = add(add(hemB, sub(hemF, hemB), t), (0, 2.0))
        prims.append(Poly('icicle', 'frost', 4.56, [add(c, (1, 0), -0.8), add(c, (1, 0), 0.8), add(c, (0, 1), ln)], nf=lambda x, y: norm((0.4, 0.0, 0.9))))

    # ---------- as patas do lobo amarradas no peito e o brasão ----------
    brooch = add(add(neck, f, 5.0), u, -8.0)
    for dx in (-1.0, 1.0):
        p0 = add(add(neck, f, 2.0 + dx * 2.0), u, 2.0)
        prims.append(Capsule('paw', 'pelt', 6.2 + dx * 0.01, p0, add(brooch, f, dx * 1.4), 2.0, 1.6, shade=0.85))
    prims.append(Ellipse('crest', 'brass', 6.3, brooch, 2.6, 2.6))
    crest_in = Ellipse('crestamber', 'amberdim' if p['dim'] else 'amber', 6.32, brooch, 1.3, 1.6, flat=1 if p['dim'] else 3)
    prims.append(crest_in)

    # ---------- cabeça: o rosto de frio, a barba congelada e o capuz de cabeça de lobo ----------
    tilt = math.radians(p['tilt'])
    ha = lean + tilt
    hl = lambda q: add(head, rot(q, ha))
    hdv = (math.sin(ha), -math.cos(ha))
    hfv = (math.cos(ha), math.sin(ha))
    prims.append(Capsule('neckm', 'coldskin', 6.4, add(neck, u, 0.5), add(head, u, -3.0), 3.6, 3.8, shade=0.7))
    face_e = Ellipse('face', 'coldskin', 6.6, head, 5.4, 6.6, ang=ha, bulge=0.9)
    prims.append(face_e)
    # a barba comprida e congelada, com os pingentes
    bl = 13.0 if iced else 11.0
    beard = [hl((-1.6, 1.4)), hl((4.6, 1.8)), hl((6.2, 4.6)), hl((4.0, bl - 1.0)), hl((1.6, bl + 2.0)), hl((-0.6, bl - 0.6)), hl((-2.8, 5.0))]
    prims.append(Poly('beard', 'beard', 6.7, beard, nf=lambda x, y: norm((0.25, -0.15, 0.95))))
    for (a, b, ln) in ((0.4, bl + 1.4, 3.0), (2.6, bl - 0.4, 2.4), (4.2, bl - 2.4, 2.0)) + (((-1.2, bl - 1.0, 2.6),) if iced else ()):
        c = hl((a, b))
        prims.append(Poly('icicle', 'frost', 6.72, [add(c, hfv, -0.7), add(c, hfv, 0.7), add(c, (0, 1), ln)], nf=lambda x, y: norm((0.4, 0.0, 0.9))))

    def face_dec(x, y, cur):
        lx, ly = face_e.local(x, y)
        # sombra do capuz na testa
        if ly < -2.6:
            return ('coldskin', 0)
        # o olho: risco claro (aceso) ou fechado
        if (lx - 3.0) ** 2 / 3.0 + (ly + 1.0) ** 2 / 0.8 < 1.0:
            if not p['eyes'] or p['dim']:
                return ('coldskin', 0)
            return ('iceeye', 4 if glow else 3)
        if (lx - 3.0) ** 2 / 6.0 + (ly + 1.0) ** 2 / 2.0 < 1.0:
            return ('void', 0) if glow else ('coldskin', 0)
        # o nariz comprido de perfil
        if 4.6 < lx < 5.8 and -1.0 < ly < 1.6:
            return ('coldskin', 1)
        return None

    decals.append(Decal('face', face_dec))
    # o capuz: a cabeça do lobo por cima da dele, o focinho sobre a testa, as orelhas em pé
    skull_c = add(add(head, hdv, 5.2), hfv, 0.6)
    skull = Ellipse('wskull', 'pelt', 6.85, skull_c, 7.6, 5.2, ang=ha, bulge=0.9)
    prims.append(skull)
    sn0 = add(add(skull_c, hfv, 4.0), hdv, -0.4)
    sn1 = add(add(skull_c, hfv, 11.0), hdv, -2.2)
    prims.append(Capsule('wsnout', 'pelt', 6.88, sn0, sn1, 2.8, 1.7))
    prims.append(Ellipse('wnose', 'void', 6.9, add(sn1, hfv, 0.8), 1.2, 1.0, flat=1))
    for i, dx in enumerate((-3.6, -0.6)):
        b0 = add(add(skull_c, hfv, dx), hdv, 3.4)
        tipe = add(add(b0, hdv, 5.4), hfv, -2.6)
        prims.append(Poly('wear', 'pelt', 6.84 + i * 0.06, [add(b0, hfv, -2.0), add(b0, hfv, 2.0), tipe], nf=lambda x, y: norm((0.0, -0.5, 0.86)), shade=0.75 + i * 0.2))
    # as laterais do capuz caindo pelo rosto (a pele cobre a orelha dele)
    side = [add(add(skull_c, hfv, -6.0), hdv, 1.0), add(add(skull_c, hfv, -1.0), hdv, -2.0), add(add(head, hfv, -0.4), hdv, -3.4),
            add(add(head, hfv, -1.8), hdv, -7.0), add(add(head, hfv, -6.0), hdv, -7.6), add(add(head, hfv, -7.6), hdv, -1.0)]
    prims.append(Poly('hoodside', 'pelt', 6.8, side, nf=lambda x, y: norm((-0.3, -0.2, 0.93)), shade=0.85))

    def wolf_dec(x, y, cur):
        lx, ly = skull.local(x, y)
        # o olho vazio do lobo
        if (lx - 3.4) ** 2 / 1.4 + (ly + 0.6) ** 2 / 0.5 < 1.0:
            return ('void', 0)
        return None

    decals.append(Decal('wskull', wolf_dec))
    # geada no alto da cabeça do lobo (segue a curva) e no focinho
    top = [add(add(skull_c, hfv, -7.0), hdv, 2.0), add(add(skull_c, hfv, -4.0), hdv, 4.6), add(add(skull_c, hfv, 0.5), hdv, 5.4),
           add(add(skull_c, hfv, 4.8), hdv, 4.2), add(add(skull_c, hfv, 7.6), hdv, 1.6)]
    fr = 1.3 if iced else 0.9
    for i in range(len(top) - 1):
        prims.append(Capsule('frostcap', 'frost', 6.95 + i * 0.001, top[i], top[i + 1], fr, fr))
    prims.append(Capsule('frostcap', 'frost', 6.96, add(sn0, hdv, 2.0), add(sn1, hdv, 1.6), fr * 0.8, fr * 0.6))
    if iced:
        for t in (0.25, 0.6):
            c = add(top[1], sub(top[3], top[1]), t)
            prims.append(Poly('icicle', 'frost', 6.97, [add(c, hfv, -0.8), add(c, hfv, 0.8), add(c, hdv, 2.8)], nf=lambda x, y: norm((0.0, -0.6, 0.8))))
    frostcap(prims, add(add(shB, u, 3.0), f, -3.0), add(add(shF, u, 3.0), f, 3.0), 4.6, 1.6 if iced else 1.1)

    # ---------- a lança, o braço da frente e a mão de trás no cabo ----------
    zF = 6.0
    holding = p['drop'] is None
    spear(prims, decals, k, p, zF - 0.3 if holding else 1.0)
    arm(shF, elbowF, handF, zF, 1.0)
    if holding and p['grip'] and not p['horn']:
        prims.append(Ellipse('handB2', 'leather', zF + 0.5, handB, 3.1, 2.9, shade=0.75))

    pivot = p['pivot'] or FEET
    return rotate_all(prims, decals, pivot, p['rot'], p['off'])


# ---------- animações ----------
# a postura de caça: a lança baixa na frente, a lanterna perto da neve
def hunt(b=0.0, **kw):
    d = dict(hip=(0, b), lean=12 + b, hF=(22, -18 + b), spear=74, spos=36, grip=15, legF=(16, 16), legB=(-12, 10), tilt=-6 + b, swing=b * 4)
    d.update(kw)
    return d


def sleep():
    # congelado de pé, as duas mãos na lança fincada na frente, a cabeça baixa olhando a trilha
    return [dict(lean=4, hF=(14, -22), spear=178, spos=48, grip=-10, bendB=1, legF=(6, 6), legB=(-6, 6), tilt=14, iced=True, eyes=False, swing=0)]


def rise():
    return [
        dict(lean=2, hF=(14, -24), spear=178, spos=48, grip=-10, legF=(6, 6), legB=(-6, 6), tilt=4, iced=True, eyes=True, glow=True),
        dict(lean=-2, hF=(14, -26), spear=176, spos=48, grip=-10, legF=(8, 6), legB=(-8, 6), tilt=-10, iced=False, glow=True, swing=8),
    ]


def horn():
    # a lança fincada na mão da frente, a trompa na boca e a cabeça para trás
    return [
        dict(lean=-2, hF=(16, -24), spear=178, spos=48, grip=0, horn=True, tilt=-18, glow=True, legF=(10, 6), legB=(-10, 6), swing=6),
        dict(lean=-4, hF=(16, -25), spear=178, spos=48, grip=0, horn=True, tilt=-22, glow=True, legF=(10, 6), legB=(-10, 6), hip=(0, -0.5), swing=-4),
    ]


def idle():
    return [hunt(b) for b in (0.0, 0.5, 1.0, 0.5)]


def walk(n=6):
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s, c = math.sin(ph), math.cos(ph)
        out.append(hunt(0.0, hip=(0.0, -abs(c) * 1.6 + 0.8),
                        legF=(10 + 22 * s, 8 + max(0, -c) * 28 + max(0, s) * 6), footF=-10 * max(0, -c),
                        legB=(-8 - 22 * s, 8 + max(0, c) * 28 + max(0, -s) * 6), footB=-10 * max(0, c),
                        swing=8 * s))
    return out


def thrust_hi_wind():
    # a lança por cima do ombro, puxada para trás, a ponta já apontando para baixo e para a frente
    return [
        dict(lean=-2, hip=(-2, 2), hF=(4, -34), spear=98, spos=40, grip=16, legF=(20, 14), legB=(-18, 18), tilt=-4, glow=True, swing=-16),
        dict(lean=-6, hip=(-4, 3), hF=(-2, -36), spear=100, spos=42, grip=16, legF=(22, 16), legB=(-20, 20), tilt=-6, glow=True, swing=-24),
    ]


def thrust_hi():
    # estocada alta: o corpo vai junto, a perna da frente dobra, o braço estica todo
    return [
        dict(lean=18, hip=(6, 5), hF=(36, -24), spear=76, spos=34, grip=16, legF=(40, 34), legB=(-34, 4), footB=-10, tilt=4, glow=True, swing=20),
        dict(lean=20, hip=(8, 6), hF=(40, -22), spear=76, spos=32, grip=16, legF=(42, 36), legB=(-36, 2), footB=-12, tilt=6, glow=True, swing=28),
    ]


def thrust_lo_wind():
    # agachado, a lança na altura do quadril, a ponta baixa
    return [
        dict(lean=24, hip=(-3, 10), hF=(0, -8), spear=82, spos=40, grip=16, legF=(40, 56), legB=(-20, 40), tilt=6, glow=True, swing=-12),
        dict(lean=28, hip=(-5, 12), hF=(-6, -6), spear=84, spos=42, grip=16, legF=(44, 62), legB=(-22, 44), tilt=8, glow=True, swing=-20),
    ]


def thrust_lo():
    return [
        dict(lean=36, hip=(8, 14), hF=(38, 2), spear=84, spos=34, grip=16, legF=(56, 70), legB=(-40, 10), footB=-14, tilt=10, glow=True, swing=24),
        dict(lean=38, hip=(10, 15), hF=(42, 3), spear=84, spos=32, grip=16, legF=(58, 72), legB=(-42, 8), footB=-16, tilt=12, glow=True, swing=30),
    ]


def thrust_rec():
    return [
        dict(lean=16, hip=(4, 6), hF=(30, -14), spear=78, spos=36, grip=15, legF=(30, 28), legB=(-24, 10), tilt=0, swing=10),
        dict(lean=13, hip=(1, 2), hF=(24, -17), spear=75, spos=36, grip=15, legF=(18, 18), legB=(-14, 10), tilt=-4, swing=0),
    ]


def leap_wind():
    # agacha com a lança deitada por cima da cabeça, as duas mãos no cabo
    return [
        dict(lean=18, hip=(0, 10), hF=(8, -58), spear=100, spos=40, grip=16, legF=(40, 70), legB=(-10, 60), tilt=-10, glow=True, swing=-10),
        dict(lean=22, hip=(0, 13), hF=(6, -60), spear=102, spos=40, grip=16, legF=(44, 78), legB=(-8, 66), tilt=-12, glow=True, swing=-18),
    ]


def leap():
    # no ar: os joelhos dobrados, a lança virada para baixo nas duas mãos, a ponta embaixo dos pés
    return [
        dict(lean=8, hip=(0, -6), hF=(12, -34), spear=4, spos=26, grip=-12, bendB=-1, legF=(60, 90), legB=(20, 100), footF=30, footB=40, tilt=10, glow=True),
        dict(lean=10, hip=(0, -6), hF=(12, -33), spear=2, spos=26, grip=-12, bendB=-1, legF=(64, 96), legB=(24, 104), footF=34, footB=44, tilt=12, glow=True),
    ]


def land():
    # cravado: agachado, a lança enfiada na neve na frente (a ponta some no chão)
    return [
        dict(lean=34, hip=(2, 14), hF=(26, -6), spear=18, spos=64, grip=-12, bendB=-1, legF=(50, 74), legB=(-24, 50), tilt=14, glow=True),
        dict(lean=32, hip=(2, 13), hF=(26, -7), spear=18, spos=64, grip=-12, bendB=-1, legF=(48, 72), legB=(-24, 48), tilt=12),
    ]


def stagger():
    return [
        dict(lean=-14, hip=(-4, 2), hF=(10, -12), spear=110, spos=30, grip=0, armB=(-50, 30), legF=(24, 10), legB=(-20, 16), tilt=-18, swing=-30),
        dict(lean=-10, hip=(-3, 2), hF=(12, -14), spear=104, spos=30, grip=0, armB=(-44, 30), legF=(22, 10), legB=(-18, 16), tilt=-12, swing=-16),
    ]


def rush(high, n=4):
    # sai correndo da neve com a lança na frente
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s, c = math.sin(ph), math.cos(ph)
        base = dict(lean=22, hip=(2, 3 - abs(c) * 2), tilt=4, glow=True, spos=34, grip=16, swing=26,
                    legF=(20 + 30 * s, 16 + max(0, -c) * 44), footF=-12 * max(0, -c),
                    legB=(-14 - 30 * s, 16 + max(0, c) * 44), footB=-12 * max(0, c))
        if high:
            base.update(hF=(34, -24), spear=76)
        else:
            base.update(hF=(34, -2), spear=84, lean=32, hip=(4, 9 - abs(c) * 2))
        out.append(base)
    return out


def death():
    # a lanterna apaga, a lança cai da mão e ele fica de joelhos com a cabeça baixa
    return [
        dict(lean=-8, hip=(-2, 2), hF=(12, -14), spear=120, spos=30, grip=0, armB=(-40, 30), legF=(20, 10), legB=(-16, 14), tilt=-16, dim=True),
        dict(lean=10, hip=(0, 16), hF=(16, 0), spear=150, spos=30, grip=0, armB=(-10, 30), legF=(70, 100), legB=(-30, 120), footB=40, tilt=10, dim=True),
        dict(lean=18, hip=(0, 20), hF=(14, 6), drop=((-30, 40), 90), swing=90, grip=0, armB=(0, 20), legF=(80, 110), legB=(-20, 130), footB=60, tilt=22, dim=True),
        dict(lean=24, hip=(0, 21), hF=(12, 10), drop=((-30, 40), 90), swing=90, grip=0, armB=(6, 16), legF=(82, 112), legB=(-18, 132), footB=62, tilt=30, eyes=False, dim=True),
    ]


ANIMS = {
    'sleep': (sleep(), 1, True),
    'rise': (rise(), 3, False),
    'horn': (horn(), 4, True),
    'idle': (idle(), 5, True),
    'walk': (walk(), 8, True),
    'thrustwind-hi': (thrust_hi_wind(), 4, False),
    'thrust-hi': (thrust_hi(), 12, False),
    'thrustwind-lo': (thrust_lo_wind(), 4, False),
    'thrust-lo': (thrust_lo(), 12, False),
    'thrustrec': (thrust_rec(), 4, False),
    'leapwind': (leap_wind(), 5, False),
    'leap': (leap(), 6, True),
    'land': (land(), 4, False),
    'stagger': (stagger(), 5, False),
    'rush-hi': (rush(True), 12, True),
    'rush-lo': (rush(False), 12, True),
    'death': (death(), 4, False),
}

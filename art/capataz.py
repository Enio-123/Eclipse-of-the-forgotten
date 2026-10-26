"""O Capataz de Âmbar: o quarto chefe, o homem que tocava as prensas da Casa Vhalor e ficou na mina
depois do último turno. Grandão, de ombros largos e curvado, camisa de lã cor de tijolo com as
mangas arregaçadas, o avental grosso de couro de quem trabalhava perto das prensas e o cinto com as
fichas de latão dos turnos (cada uma, um dia pago com esquecimento). Capacete duro com a lamparina
acesa na frente e o apito do turno pendurado no pescoço. O Âmbar cresceu nele: um maciço de cristais
nas costas, uma ombreira de cristal no ombro da frente, crosta no antebraço de trás e uma barba de
Âmbar que cobre o queixo; um dos olhos acende cor de Âmbar. Luta com a picareta grande, de duas mãos.

uso: python3 ink_sheets.py <pasta_assets> capataz
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot
from rig import rotate_all

puppet.RAMPS['brick'] = [0x150c0a, 0x2a1511, 0x431f18, 0x5e2c21, 0x7c3d2d]
puppet.RAMPS['apron'] = [0x140e0b, 0x271b15, 0x3d2b20, 0x56402f, 0x735741]
puppet.RAMPS['capcanvas'] = [0x0d0d10, 0x17171b, 0x25242a, 0x37353c, 0x4d4a51]
puppet.RAMPS['ashen'] = [0x1b1615, 0x352b27, 0x56473f, 0x7a6a5e, 0xa08f80]
puppet.RAMPS['brass'] = [0x3a2a10, 0x5e4419, 0x8a6a2a, 0xb8923f, 0xdcc070]
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
# o Âmbar apagado da morte (a memória saiu dele)
puppet.RAMPS['amberdim'] = [0x2a170b, 0x46280f, 0x683c17, 0x8c5422, 0xaa6e34]
puppet.SHINY.setdefault('amber', (0.7, 16))
puppet.SHINY.setdefault('amberdim', (0.4, 10))
puppet.SHINY.setdefault('brass', (0.6, 10))
puppet.RIM_MATS |= {'brick', 'apron', 'capcanvas'}

W, H = 240, 200
BASE_HIP = (104.0, 148.0)
FEET = (104, 196)
FLOOR = 195.5
ARM = (17.0, 16.0)
HAFT = 50.0

DEFAULT = dict(
    hip=(0.0, 0.0), lean=12.0, tilt=0.0,
    # pernas: ângulo da coxa (0 = para baixo, + para a frente) e dobra do joelho
    legF=(10.0, 8.0), legB=(-8.0, 8.0), footF=0.0, footB=0.0,
    armF=(30.0, 50.0), armB=(-14.0, 40.0),
    # picareta: direção do cabo a partir da mão da frente (0 = para baixo, 90 = para a frente, 180 = para
    # cima); grip: a mão de trás também no cabo, a essa distância da mão da frente (0 = solta)
    pick=10.0, grip=0.0, bend=1,
    # mão de trás na boca, com o apito
    whistle=False,
    glow=False, dim=False, rot=0.0, pivot=None, off=(0.0, 0.0),
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


def unit(v):
    L = math.hypot(*v) or 1e-6
    return (v[0] / L, v[1] / L)


def ik(sh, target, l1, l2, bend):
    """Cotovelo de um braço de dois ossos que leva a mão até o alvo (ou o mais perto que der)."""
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
    neck = add(hip, u, 38.0)
    shF = add(add(neck, f, 7.0), u, -8.0)
    shB = add(add(neck, f, -9.0), u, -8.5)
    head = add(add(neck, u, 8.0), f, 11.0)
    up, el = p['armF']
    elbowF = add(shF, dirv(up), ARM[0])
    handF = add(elbowF, dirv(up + el), ARM[1])
    hdir = dirv(p['pick'])
    if p['grip']:
        elbowB, handB = ik(shB, add(handF, hdir, p['grip']), ARM[0], ARM[1], p['bend'])
    elif p['whistle']:
        elbowB, handB = ik(shB, add(add(head, f, 6.5), u, -5.0), ARM[0], ARM[1], -1)
    else:
        upB, elB = p['armB']
        elbowB = add(shB, dirv(upB), ARM[0])
        handB = add(elbowB, dirv(upB + elB), ARM[1])
    return dict(hip=hip, lean=lean, u=u, f=f, neck=neck, shF=shF, shB=shB, head=head,
                elbowF=elbowF, handF=handF, elbowB=elbowB, handB=handB, hdir=hdir)


def turn(p, pt):
    """O ponto já com o giro do corpo inteiro, relativo aos pés."""
    x, y = pt
    if p['rot']:
        piv = p['pivot'] or FEET
        a = math.radians(p['rot'])
        dx, dy = x - piv[0], y - piv[1]
        x = piv[0] + dx * math.cos(a) - dy * math.sin(a) + p['off'][0]
        y = piv[1] + dx * math.sin(a) + dy * math.cos(a) + p['off'][1]
    return [round(x - FEET[0], 1), round(y - FEET[1], 1)]


def pick_geo(hand, d):
    """Onde ficam o pé do cabo, a cabeça e as duas pontas (a ponta curva na frente, a pá atrás)."""
    butt = add(hand, d, -6.0)
    top = add(hand, d, HAFT - 6.0)
    # a ponta curva fica do lado para onde o golpe desce (na pancada ela crava primeiro)
    side = (-d[1], d[0])
    return butt, top, side


def points(pose):
    p = P(pose)
    k = skeleton(p)
    butt, top, side = pick_geo(k['handF'], k['hdir'])
    tip = add(add(top, side, 19.0), k['hdir'], -7.5)
    return {'tip': turn(p, tip), 'head': turn(p, top), 'hand': turn(p, k['handF'])}


def shard(prims, base, ang, ln, wd, z, glow, mat='amber'):
    d = (math.cos(ang), math.sin(ang))
    n = (-d[1], d[0])
    prims.append(Poly('shard', mat, z, [add(base, n, wd), add(add(base, d, ln * 0.55), n, wd * 0.55), add(base, d, ln),
                                        add(add(base, d, ln * 0.5), n, -wd * 0.75), add(base, n, -wd)],
                      nf=lambda x, y: norm((n[0] * 0.5, n[1] * 0.5 - 0.3, 0.8)), flat=4 if glow else None))
    prims.append(Capsule('shardcore', mat, z + 0.01, add(base, d, ln * 0.18), add(base, d, ln * 0.66), wd * 0.32, wd * 0.12, flat=4 if mat == 'amber' else 2))


def pickaxe(prims, hand, d, z, amb):
    """A picareta grande do Capataz: cabo comprido com as cintas de ferro, a cabeça de ferro com a
    ponta curva na frente e a pá larga atrás, e o Âmbar grudado no olho da cabeça."""
    butt, top, side = pick_geo(hand, d)
    prims.append(Capsule('haft', 'wood', z, butt, top, 2.0, 1.8, shade=0.9))
    for t in (0.12, 0.55, 0.9):
        c = add(butt, d, HAFT * t)
        prims.append(Capsule('band', 'steel', z + 0.02, add(c, d, -1.2), add(c, d, 1.2), 2.5, 2.5, shade=0.8))

    def Hh(a, b):
        return add(add(top, side, a * 1.25), d, -b * 1.25)

    # cabeça: a pá larga atrás (lado -) e a ponta curva na frente (lado +), um pouco caída para baixo
    outline = [Hh(-12.0, -2.4), Hh(-12.6, 3.6), Hh(-8.0, 3.2), Hh(-3.0, 2.8), Hh(2.0, 3.0), Hh(7.0, 3.8), Hh(11.6, 5.6),
               Hh(15.2, 8.4), Hh(15.8, 7.4), Hh(12.6, 2.6), Hh(7.0, -1.6), Hh(2.0, -2.8), Hh(-3.0, -3.0), Hh(-8.0, -2.8)]
    prims.append(Poly('phead', 'steel', z + 0.05, outline, nf=lambda x, y: norm((0.0, -0.6, 0.8)), shade=0.95))
    prims.append(Capsule('peye', 'steel', z + 0.07, Hh(0.0, -3.6), Hh(0.0, 3.6), 3.4, 3.4, shade=0.8))
    for (a, b, r) in ((-6.4, 0.8, 1.9), (5.0, 0.6, 1.7), (9.6, 3.2, 1.2), (-10.4, 1.4, 1.1)):
        prims.append(Ellipse('pamber', amb, z + 0.09, Hh(a, b), r * 1.2, r, flat=3))


def build(pose):
    p = P(pose)
    k = skeleton(p)
    hip, u, f, neck, shF, shB, head, lean = (k[n] for n in ('hip', 'u', 'f', 'neck', 'shF', 'shB', 'head', 'lean'))
    elbowF, handF, elbowB, handB = k['elbowF'], k['handF'], k['elbowB'], k['handB']
    glow = p['glow'] and not p['dim']
    amb = 'amberdim' if p['dim'] else 'amber'
    prims, decals = [], []

    # ---------- pernas: calça de lona grossa e botas de ponteira de ferro ----------
    def leg(root, ang, z, shade, footang):
        th, kn = ang
        knee = add(root, dirv(th), 22.0)
        ankle = add(knee, dirv(th - kn), 20.0)
        fa = math.radians(footang)
        fd = (math.cos(fa), math.sin(fa))
        toe = add(ankle, fd, 11.0)
        heel = add(ankle, fd, -3.4)
        prims.append(Capsule('thigh', 'capcanvas', z, root, knee, 7.8, 6.6, shade=shade))
        prims.append(Capsule('shin', 'capcanvas', z + 0.02, knee, ankle, 6.4, 5.6, shade=shade))
        prims.append(Capsule('boot', 'leather', z + 0.05, add(knee, dirv(th - kn), 9.0), ankle, 6.4, 6.0, shade=shade))
        prims.append(Capsule('foot', 'leather', z + 0.04, heel, toe, 4.6, 4.0, shade=shade))
        prims.append(Ellipse('toecap', 'steel', z + 0.06, add(toe, fd, -1.6), 3.2, 2.8, shade=shade * 0.8))

    leg(add(hip, f, -5.0), p['legB'], 1.5, 0.62, p['footB'])
    leg(add(hip, f, 5.0), p['legF'], 4.0, 1.0, p['footF'])

    # ---------- o maciço de Âmbar das costas (fica atrás do corpo) ----------
    back = add(add(neck, f, -11.0), u, -8.0)
    base_a = math.atan2(u[1] - f[1] * 0.75, u[0] - f[0] * 0.75)
    for i, (dl, dfw, da, ln, wd) in enumerate(((0.0, 0.0, 0.0, 34.0, 6.6), (-6.0, -2.0, 0.42, 26.0, 5.4), (5.0, 1.0, -0.3, 28.0, 5.6),
                                               (-12.0, -1.0, 0.8, 18.0, 4.2), (9.0, 3.0, -0.62, 18.0, 4.0), (-17.0, 0.0, 1.1, 12.0, 3.2),
                                               (2.0, -4.0, 0.2, 14.0, 3.6), (-4.0, 3.0, -0.15, 22.0, 4.6), (12.0, 4.0, -0.95, 12.0, 3.0))):
        shard(prims, add(add(back, u, dl), f, dfw), base_a + da, ln * 1.3, wd * 1.2, 1.2 + i * 0.01, glow, amb)
    prims.append(Ellipse('amberbase', amb, 1.3, back, 11.0, 7.0, ang=lean, shade=0.7))
    # e um veio de cristais descendo pelas costas até o quadril
    low = add(add(hip, f, -12.0), u, 14.0)
    for i, (dl, da, ln, wd) in enumerate(((0.0, 0.5, 12.0, 3.2), (-6.0, 0.9, 9.0, 2.6), (6.0, 0.2, 10.0, 2.8))):
        shard(prims, add(low, u, dl), base_a + da, ln, wd, 1.25 + i * 0.01, glow, amb)

    # ---------- braço de trás ----------
    def arm(sh, elbow, hand, z, shade, crust):
        prims.append(Capsule('upperarm', 'brick', z, sh, elbow, 6.6, 5.6, shade=shade))
        prims.append(Capsule('forearm', 'ashen', z + 0.03, elbow, hand, 5.4, 4.4, shade=shade * 0.9))
        prims.append(Capsule('cuff', 'brick', z + 0.035, elbow, add(elbow, unit((hand[0] - elbow[0], hand[1] - elbow[1])), 3.0), 6.0, 5.6, shade=shade * 0.85))
        prims.append(Ellipse('hand', 'ashen', z + 0.08, hand, 4.6, 4.2, shade=shade))
        if crust:
            # crosta de Âmbar no antebraço, nascendo do cotovelo para o punho
            fd = unit((hand[0] - elbow[0], hand[1] - elbow[1]))
            nn = (-fd[1], fd[0])
            for t, ln, a in ((0.25, 9.0, 0.9), (0.5, 7.0, 1.2), (0.72, 5.0, 0.7)):
                c = add(add(elbow, fd, ARM[1] * t), nn, -3.0)
                shard(prims, c, math.atan2(-nn[1], -nn[0]) + a * 0.4, ln, 2.2, z + 0.06, glow, amb)

    arm(shB, elbowB, handB, 7.2 if p['whistle'] else 2.2, 0.66 if not p['whistle'] else 0.9, True)

    # ---------- tronco: camisa de lã, avental de couro e o cinto com as fichas ----------
    prims.append(Capsule('belly', 'brick', 3.0, add(hip, u, 4.0), add(neck, u, -6.0), 15.0, 16.5))
    chest = add(add(neck, u, -9.0), f, 2.0)
    prims.append(Ellipse('chest', 'brick', 3.2, chest, 17.5, 13.5, ang=lean))
    # avental: do peito até abaixo dos joelhos, na frente do corpo
    at = lambda a, b: add(add(hip, f, a), u, b)
    apron = [at(-3.0, 30.0), at(9.5, 31.0), at(15.0, 12.0), at(15.5, -4.0), at(16.0, -26.0), at(11.0, -30.0), at(2.0, -31.0), at(-2.0, -27.0),
             at(0.0, -6.0), at(-4.0, 10.0)]
    prims.append(Poly('apron', 'apron', 3.6, apron, nf=lambda x, y: norm((0.15, -0.25, 0.95))))

    def apron_dec(x, y, cur):
        lx, ly = rot((x - hip[0], y - hip[1]), -lean)
        # costura da bolsa grande e a borda gasta
        if abs(ly - 2.0) < 0.5 and 2.0 < lx < 14.0:
            return ('apron', 0)
        if abs(lx - 2.6) < 0.45 and -6.0 < ly < 2.0 or abs(lx - 13.4) < 0.45 and -6.0 < ly < 2.0:
            return ('apron', 0)
        # manchas de Âmbar seco no couro
        for (cx, cy, r) in ((8.0, -16.0, 1.6), (11.0, 18.0, 1.2), (4.0, -22.0, 1.0)):
            if (lx - cx) ** 2 + (ly - cy) ** 2 < r * r:
                return (amb, 2)
        return None

    decals.append(Decal('apron', apron_dec))
    # alça do avental atrás do pescoço
    prims.append(Capsule('strap', 'apron', 3.62, at(-2.5, 29.0), add(add(neck, f, -3.5), u, -1.0), 1.4, 1.4, shade=0.7))
    prims.append(Capsule('strap', 'apron', 3.62, at(9.0, 30.0), add(add(neck, f, 5.0), u, -1.5), 1.4, 1.4, shade=0.9))
    belt = add(hip, u, 3.0)
    prims.append(Capsule('belt', 'leather', 3.8, add(belt, f, -16.0), add(belt, f, 16.0), 2.6, 2.6, shade=0.7))
    prims.append(Ellipse('buckle', 'brass', 3.85, add(belt, f, -1.0), 2.6, 2.4))
    # as fichas de latão dos turnos penduradas no cinto, de trás para a frente
    for i in range(6):
        c = add(add(belt, f, -14.0 + i * 2.6), u, -3.6 - (i % 2) * 1.2)
        prims.append(Ellipse('token', 'brass', 3.7 + i * 0.002, c, 1.5, 1.5, shade=0.8 + (i % 3) * 0.1))

    # ---------- a ombreira de cristal no ombro da frente ----------
    for i, (da, ln, wd) in enumerate(((-0.4, 16.0, 4.2), (0.2, 13.0, 3.6), (0.8, 9.0, 2.8), (-1.0, 9.0, 2.6))):
        shard(prims, add(add(shF, u, 2.5), f, -1.0), base_a + 0.3 + da, ln, wd, 5.5 + i * 0.01, glow, amb)

    # ---------- cabeça: capacete duro com a lamparina, o rosto cinza e a barba de Âmbar ----------
    tilt = math.radians(p['tilt'])
    ha = lean + tilt
    hl = lambda q: add(head, rot(q, ha))
    prims.append(Capsule('neckm', 'ashen', 6.5, add(neck, u, 1.0), add(head, u, -4.0), 6.0, 6.2, shade=0.8))
    face_e = Ellipse('face', 'ashen', 6.6, head, 8.4, 9.6, ang=ha, bulge=0.9)
    prims.append(face_e)
    # o Âmbar que cobre o queixo e a boca, como uma barba de pedra
    beard = [hl((-3.0, 1.6)), hl((3.0, 2.0)), hl((8.6, 3.4)), hl((9.2, 7.0)), hl((6.0, 11.6)), hl((1.0, 12.4)), hl((-3.6, 9.0))]
    prims.append(Poly('beard', amb, 6.7, beard, nf=lambda x, y: norm((0.3, -0.2, 0.9)), flat=4 if glow else None))
    for (a, b, ln, ang) in ((2.0, 11.0, 6.0, 1.9), (6.0, 10.0, 5.0, 1.2), (-1.4, 9.0, 4.0, 2.3)):
        shard(prims, hl((a, b)), ha + ang, ln, 1.8, 6.72, glow, amb)
    hdv = (math.sin(ha), -math.cos(ha))
    hfv = (math.cos(ha), math.sin(ha))
    cap_c = add(head, hdv, 5.6)
    prims.append(Ellipse('helmet', 'leather', 6.8, cap_c, 9.6, 5.6, ang=ha, bulge=0.85))
    prims.append(Capsule('brim', 'leather', 6.85, add(add(cap_c, hdv, -3.4), hfv, -10.0), add(add(cap_c, hdv, -3.0), hfv, 11.6), 1.8, 1.8, shade=0.75))
    prims.append(Capsule('helmband', 'brass', 6.86, add(add(cap_c, hdv, -1.4), hfv, -8.8), add(add(cap_c, hdv, -1.0), hfv, 8.4), 0.9, 0.9, shade=0.7))
    # uma lasca de Âmbar rompendo o capacete por trás
    shard(prims, add(add(cap_c, hdv, 3.0), hfv, -4.0), math.atan2(hdv[1] - hfv[1] * 0.6, hdv[0] - hfv[0] * 0.6), 10.0, 2.4, 6.84, glow, amb)
    lamp = add(add(cap_c, hdv, 0.4), hfv, 8.6)
    prims.append(Ellipse('lamp', 'brass', 6.9, lamp, 3.0, 2.8, shade=0.9))
    prims.append(Ellipse('lampglass', 'amber', 6.92, add(lamp, hfv, 1.4), 1.8, 1.9, flat=0 if p['dim'] else 4))

    def face_dec(x, y, cur):
        lx, ly = face_e.local(x, y)
        # o olho da frente aceso cor de Âmbar; o de trás fundo e escuro
        if (lx - 4.8) ** 2 / 3.2 + (ly + 1.0) ** 2 / 1.6 < 1.0:
            if p['dim']:
                return ('void', 0)
            return ('amber', 4) if glow else ('amber', 3)
        if (lx + 0.6) ** 2 / 2.4 + (ly + 1.0) ** 2 / 1.3 < 1.0:
            return ('void', 0)
        # sobrancelha grossa e a ruga da testa
        if -4.0 < ly < -3.0 and -2.4 < lx < 7.0:
            return ('ashen', 0)
        return None

    decals.append(Decal('face', face_dec))

    # o apito do turno: corrente no pescoço e o apito de latão no peito (ou na boca)
    if p['whistle']:
        wpos = add(handB, hfv, 1.0)
        prims.append(Capsule('whistle', 'brass', 7.4, add(wpos, hfv, -2.0), add(wpos, hfv, 4.0), 1.5, 1.3))
    else:
        wpos = add(add(neck, f, 5.0), u, -11.0)
        prims.append(Capsule('wchain', 'steel', 3.9, add(add(neck, f, -2.0), u, -1.0), wpos, 0.5, 0.5, shade=0.6, flat=2))
        prims.append(Capsule('wchain', 'steel', 3.9, add(add(neck, f, 7.5), u, -2.0), wpos, 0.5, 0.5, shade=0.6, flat=2))
        prims.append(Capsule('whistle', 'brass', 3.95, wpos, add(wpos, u, -4.0), 1.5, 1.3))

    # ---------- braço da frente com a picareta ----------
    zF = 6.0
    pickaxe(prims, handF, k['hdir'], zF + 0.4 if p['grip'] else zF - 0.3, amb)
    arm(shF, elbowF, handF, zF, 1.0, False)
    if p['grip']:
        # a mão de trás por cima do cabo
        prims.append(Ellipse('handB2', 'ashen', zF + 0.5, handB, 4.4, 4.0, shade=0.75))

    pivot = p['pivot'] or FEET
    return rotate_all(prims, decals, pivot, p['rot'], p['off'])


# ---------- animações ----------
def idle():
    # apoiado na picareta: a cabeça no chão na frente, as duas mãos no cabo
    out = []
    for b in (0.0, 0.6, 1.2, 0.6):
        out.append(dict(hip=(0, b), lean=14 + b, armF=(36, 30 - b * 2), pick=12 - b, grip=13.0, bend=1, tilt=-2 + b))
    return out


def walk(n=6):
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s = math.sin(ph)
        c = math.cos(ph)
        out.append(dict(
            hip=(0.0, -abs(c) * 2.0 + 1.0),
            legF=(8 + 20 * s, 6 + max(0, -c) * 26 + max(0, s) * 6), footF=-10 * max(0, -c),
            legB=(-6 - 20 * s, 6 + max(0, c) * 26 + max(0, -s) * 6), footB=-10 * max(0, c),
            armF=(34 - 6 * s, 54), pick=58 - 6 * s, armB=(-16 + 16 * s, 34), lean=18, tilt=-3,
        ))
    return out


def work():
    # de costas para a entrada, picando o cristal grande na frente; o primeiro quadro é a batida
    base = dict(legF=(22, 18), legB=(-14, 14), grip=12.0)
    return [
        dict(base, armF=(86, 28), pick=48, lean=38, hip=(2, 12)),
        dict(base, armF=(110, 30), pick=120, lean=24, hip=(2, 7)),
        dict(base, armF=(160, 16), pick=196, lean=10, tilt=-8, hip=(2, 4)),
        dict(base, armF=(176, -4), pick=214, lean=6, tilt=-10, hip=(1, 3)),
    ]


def rise():
    return [
        dict(lean=6, armF=(30, 40), pick=40, grip=0.0, armB=(-30, 40), tilt=-16, glow=True),
        dict(lean=2, armF=(40, 50), pick=70, armB=(-40, 60), tilt=-8, glow=True),
    ]


def roar():
    return [
        dict(armF=(160, 14), pick=200, armB=(-150, -10), lean=-8, tilt=-22, hip=(-1, 0), glow=True, legF=(16, 4), legB=(-16, 4)),
        dict(armF=(166, 16), pick=206, armB=(-156, -12), lean=-11, tilt=-26, hip=(-2, -0.5), glow=True, legF=(17, 4), legB=(-17, 4)),
    ]


def slam_windup():
    # as duas mãos erguem a picareta bem alto por cima da cabeça, o corpo jogado para trás
    return [
        dict(armF=(150, 16), pick=196, grip=14.0, lean=0, tilt=-10, hip=(0, 2), legF=(18, 10), legB=(-14, 10), glow=True),
        dict(armF=(172, 4), pick=214, grip=14.0, lean=-6, tilt=-14, hip=(0, 3), legF=(20, 12), legB=(-16, 12), glow=True),
    ]


def slam():
    # desce com tudo: a ponta crava no chão bem na frente
    return [
        dict(armF=(56, -14), pick=68, grip=14.0, lean=46, tilt=8, hip=(2, 8), legF=(32, 36), legB=(-22, 26), glow=True),
        dict(armF=(68, -20), pick=56, grip=14.0, lean=46, tilt=10, hip=(2, 12), legF=(34, 42), legB=(-24, 30), glow=True),
    ]


def slam_recover():
    return [
        dict(armF=(66, -16), pick=58, grip=14.0, lean=44, tilt=8, hip=(2, 11), legF=(32, 40), legB=(-22, 28)),
        dict(armF=(52, 20), pick=80, grip=14.0, lean=28, tilt=4, hip=(1, 5), legF=(20, 18), legB=(-14, 14)),
    ]


def throw_windup():
    # a picareta lá embaixo, atrás, para a varrida que joga as lascas para cima
    return [
        dict(armF=(-30, 30), pick=-56, grip=13.0, bend=-1, lean=30, hip=(-2, 6), legF=(28, 34), legB=(-18, 24), tilt=4, glow=True),
        dict(armF=(-44, 26), pick=-70, grip=13.0, bend=-1, lean=34, hip=(-3, 8), legF=(30, 40), legB=(-20, 28), tilt=6, glow=True),
    ]


def throw():
    return [
        dict(armF=(110, 20), pick=140, grip=13.0, lean=6, hip=(2, 2), legF=(22, 12), legB=(-18, 10), tilt=-8, glow=True),
        dict(armF=(150, 10), pick=172, grip=13.0, lean=-4, hip=(2, 0), legF=(18, 8), legB=(-20, 8), tilt=-12, glow=True),
    ]


def charge_windup():
    # abaixa o ombro de cristal, a picareta para trás, raspa o pé no chão
    return [
        dict(lean=42, hip=(-2, 8), legF=(30, 40), legB=(-30, 30), footB=-14, armF=(-40, 40), pick=-90, armB=(10, 60), tilt=10, glow=True),
        dict(lean=46, hip=(-3, 9), legF=(32, 44), legB=(-34, 34), footB=-20, armF=(-48, 44), pick=-96, armB=(14, 60), tilt=12, glow=True),
    ]


def charge(n=4):
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s = math.sin(ph)
        c = math.cos(ph)
        out.append(dict(
            lean=40, hip=(2, 6 - abs(c) * 2), tilt=10,
            legF=(20 + 30 * s, 20 + max(0, -c) * 40), footF=-12 * max(0, -c),
            legB=(-12 - 30 * s, 20 + max(0, c) * 40), footB=-12 * max(0, c),
            armF=(-40 - 8 * s, 40), pick=-92, armB=(20 + 10 * s, 60), glow=True,
        ))
    return out


def stun():
    # bateu na parede: tonto, curvado, a picareta arrastando no chão
    return [
        dict(lean=26, tilt=22, hip=(0, 6), legF=(18, 26), legB=(-14, 20), armF=(10, 10), pick=6, armB=(-6, 20)),
        dict(lean=30, tilt=14, hip=(1, 7), legF=(20, 28), legB=(-12, 22), armF=(14, 8), pick=10, armB=(-2, 16)),
    ]


def whistle():
    # a picareta apoiada no chão, a mão de trás leva o apito à boca
    return [
        dict(lean=4, tilt=-14, armF=(30, 30), pick=14, whistle=True, glow=True),
        dict(lean=2, tilt=-18, armF=(30, 28), pick=12, whistle=True, glow=True, hip=(0, -1)),
    ]


def stagger():
    return [
        dict(lean=-14, hip=(-4, 2), armF=(60, 60), pick=80, armB=(-60, 40), tilt=-20, legF=(24, 10), legB=(-20, 16)),
        dict(lean=-10, hip=(-3, 2), armF=(50, 60), pick=70, armB=(-50, 40), tilt=-14, legF=(22, 10), legB=(-18, 16)),
    ]


def hurt():
    return [dict(lean=-6, hip=(-2, 1), armF=(20, 50), pick=30, armB=(-40, 30), tilt=-16, legF=(14, 10), legB=(-14, 12))]


def death():
    piv = (100.0, 194.0)
    return [
        # o Âmbar apaga, ele cai de joelhos e depois de cara no chão, por cima da picareta
        dict(lean=-8, hip=(-2, 2), armF=(20, 40), pick=20, armB=(-40, 30), tilt=-16, dim=True),
        dict(hip=(0, 20), legF=(80, 120), legB=(-10, 110), footF=10, lean=20, armF=(40, 30), pick=40, armB=(20, 30), tilt=10, dim=True),
        dict(rot=36, pivot=piv, off=(0, -8), hip=(0, 20), legF=(80, 120), legB=(-10, 110), lean=24, armF=(70, 10), pick=90, armB=(60, 10), tilt=14, dim=True),
        dict(rot=78, pivot=piv, off=(-4, -14), hip=(0, 20), legF=(70, 110), legB=(-4, 100), lean=26, armF=(90, 0), pick=110, armB=(80, 0), tilt=16, dim=True),
    ]


ANIMS = {
    'work': (work(), 40 / 9, True),
    'rise': (rise(), 4, False),
    'roar': (roar(), 5, True),
    'idle': (idle(), 5, True),
    'walk': (walk(), 7, True),
    'slamwind': (slam_windup(), 4, False),
    'slam': (slam(), 14, False),
    'slamrec': (slam_recover(), 4, False),
    'throwwind': (throw_windup(), 5, False),
    'throw': (throw(), 14, False),
    'chargewind': (charge_windup(), 5, False),
    'charge': (charge(), 12, True),
    'stun': (stun(), 3, True),
    'whistle': (whistle(), 6, True),
    'stagger': (stagger(), 5, False),
    'hurt': (hurt(), 10, False),
    'death': (death(), 5, False),
}

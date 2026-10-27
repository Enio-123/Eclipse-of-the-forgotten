"""Guarda da Coroação (Torres Rúnicas): soldado da Casa Vhalor. Armadura de bronze inteira, o tabardo cor de
vinho quase preto com a barra de bronze, o elmo de bronze com a viseira em T e a coroa de três pontas de
runa em cima, o escudo redondo de bronze com a runa gravada em volta do umbo e a alabarda comprida (haste
de madeira, ponta de aço, lâmina em meia-lua e o gancho atrás).

Ele anda com o escudo alto, na altura do rosto, e a alabarda em pé na mão de trás. A estocada é longa:
recua a alabarda na altura do ombro (a viseira e a runa do escudo acendem) e estica tudo de uma vez. O
giro é baixo: agacha, leva a alabarda para trás rente ao chão e gira uma volta inteira em volta das
pernas (a haste encurta quando passa apontando para a frente ou para o fundo da tela).

O boneco olha para a direita (+x). As medidas estão em pixels do mundo.

uso: python3 ink_sheets.py <pasta_assets> crownguard
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot
from rig import rotate_all
from townsfolk import ik2

puppet.RAMPS['bronze'] = [0x2e1f10, 0x5a3a18, 0x8a5c26, 0xb98a3e, 0xe4bd72]
puppet.SHINY['bronze'] = (0.5, 9)
puppet.RAMPS['vhalor'] = [0x0f090b, 0x1d1115, 0x2f1b21, 0x45282e, 0x5d393c]
puppet.RAMPS['halwood'] = [0x1c120c, 0x332216, 0x4d3420, 0x6b4a2e, 0x8c6640]
puppet.RAMPS['mail'] = [0x121318, 0x22242b, 0x363941, 0x50545e, 0x6f7480]
puppet.RIM_MATS |= {'bronze', 'vhalor', 'mail'}

W, H = 184, 116
FEET = (88, 110)
BASE_HIP = (88.0, 84.0)
# a haste da alabarda (do conto até o alvado) e o quanto a ponta passa dele
POLE = 56.0
SPIKE = 13.0

DEFAULT = dict(
    hip=(0.0, 0.0), lean=0.0, tilt=0.0,
    legF=(8.0, 6.0), legB=(-7.0, 6.0), footF=0.0, footB=0.0,
    # a mão da alabarda (relativa ao quadril), o ângulo da haste (0 para baixo, 90 para a frente, 180 para
    # cima), onde a mão segura (px a partir do conto), o encurtamento e a camada
    hW=(9.0, -3.0), hal=180.0, grip=27.0, halK=1.0, halZ=2.2,
    # o centro do escudo (relativo ao quadril) e o giro dele
    hS=(9.0, -14.5), sAng=0.0,
    glow=False, rot=0.0, pivot=None, off=(0.0, 0.0),
    # na morte: a alabarda e o escudo caídos no chão (posição absoluta no quadro e ângulo)
    halDrop=None, shieldDrop=None,
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
    neck = add(hip, u, 19.0)
    shF = add(add(neck, f, 3.0), u, -3.0)
    shB = add(add(neck, f, -2.5), u, -3.0)
    head = add(add(neck, u, 7.5), f, 1.5)
    hand = add(hip, p['hW'])
    d = dirv(p['hal'])
    k = p['halK']
    butt = add(hand, d, -p['grip'] * k)
    top = add(butt, d, POLE * k)
    tip = add(top, d, SPIKE * k)
    return dict(hip=hip, u=u, f=f, neck=neck, shF=shF, shB=shB, head=head, hand=hand, d=d, butt=butt, top=top, tip=tip,
                sc=add(hip, p['hS']))


def rotp(p, pt):
    """O ponto depois do giro do corpo inteiro (as quedas)."""
    x, y = pt
    if p['rot']:
        piv = p['pivot'] or FEET
        a = math.radians(p['rot'])
        dx, dy = x - piv[0], y - piv[1]
        x = piv[0] + dx * math.cos(a) - dy * math.sin(a) + p['off'][0]
        y = piv[1] + dx * math.sin(a) + dy * math.cos(a) + p['off'][1]
    return x, y


def points(pose):
    """A ponta da alabarda e o meio da lâmina em cada quadro (relativos aos pés): o jogo mede a estocada
    e o aparo por elas."""
    p = P(pose)
    k = skeleton(p)
    tip = rotp(p, k['tip'])
    mid = rotp(p, add(k['top'], k['d'], -5.0 * p['halK']))
    return {'tip': [round(tip[0] - FEET[0], 1), round(tip[1] - FEET[1], 1)],
            'blade': [round(mid[0] - FEET[0], 1), round(mid[1] - FEET[1], 1)]}


def halberd(prims, decals, butt, d, k, z, glint, tag=''):
    """A alabarda a partir do conto, na direção d: a haste, o conto e o alvado de bronze, a ponta de aço,
    a lâmina em meia-lua (para o lado da frente quando ela está em pé) e o gancho do outro lado."""
    n = (-d[1], d[0])
    top = add(butt, d, POLE * k)
    L = lambda u, v: add(add(top, d, u * k), n, v * k)
    prims.append(Capsule('pole' + tag, 'halwood', z, butt, top, 1.15, 1.0))
    prims.append(Ellipse('ferrule' + tag, 'bronze', z + 0.02, add(butt, d, 1.0 * k), 1.4, 1.4))
    # as faixas de bronze na pegada
    for s in (0.42, 0.62):
        a = add(butt, d, POLE * k * s)
        prims.append(Capsule('band' + tag, 'bronze', z + 0.01, add(a, d, -0.8 * k), add(a, d, 0.8 * k), 1.45, 1.45))
    prims.append(Capsule('socket' + tag, 'bronze', z + 0.03, L(-15.0, 0.0), L(1.5, 0.0), 1.7, 1.4))
    spike = [L(1.0, -1.5), L(SPIKE - 3.0, -0.9), L(SPIKE, 0.0), L(SPIKE - 3.0, 0.9), L(1.0, 1.5)]
    prims.append(Poly('spike' + tag, 'steel', z + 0.05, spike, nf=lambda x, y: norm((-0.35, -0.6, 0.72))))
    blade = [L(0.5, 1.2), L(1.6, 5.0), L(-0.6, 9.2), L(-4.0, 10.6), L(-7.8, 10.4), L(-11.0, 8.8), L(-12.6, 6.2),
             L(-10.4, 5.0), L(-9.0, 3.0), L(-9.4, 1.2)]
    bl = Poly('blade' + tag, 'steel', z + 0.04, blade, nf=lambda x, y: norm((-0.25, -0.45, 0.86)))
    prims.append(bl)
    fluke = [L(-3.0, -1.2), L(-4.4, -5.6), L(-7.4, -8.4), L(-6.8, -5.4), L(-7.2, -1.2)]
    prims.append(Poly('fluke' + tag, 'steel', z + 0.04, fluke, nf=lambda x, y: norm((-0.3, -0.5, 0.8))))

    def blade_decal(x, y, cur):
        # o fio da lâmina (a parte de fora da meia-lua) mais claro; aceso no aviso
        dx, dy = x - top[0], y - top[1]
        uu = (dx * d[0] + dy * d[1]) / k
        vv = (dx * n[0] + dy * n[1]) / k
        edge = math.hypot((uu + 5.4) / 7.9, (vv - 2.6) / 7.9)
        if edge > 0.93:
            return ('gold', 4) if glint else ('steel', 4)
        if 3.6 < vv < 4.5 and -9.6 < uu < -1:
            return ('steel', 1)
        return None

    decals.append(Decal('blade' + tag, blade_decal))


def shield(prims, decals, sc, sa, glow, flat=False, tag=''):
    """O escudo redondo de bronze: a borda batida, o anel gravado com as quatro marcas de runa em volta do
    umbo (douradas quando ele acende) e o umbo no meio. Caído no chão ele fica achatado."""
    R = 9.4
    ry = R * 0.32 if flat else R
    sh = Ellipse('shield' + tag, 'bronze', 6.8, sc, R, ry, ang=sa, bulge=0.55)
    prims.append(sh)
    prims.append(Ellipse('boss' + tag, 'bronze', 6.85, sc, 2.4, 2.4 * (0.32 if flat else 1.0), ang=sa, bulge=1.0))

    def decal(x, y, cur):
        lx, ly = sh.local(x, y)
        r = math.hypot(lx / R, ly / ry)
        if r > 0.86:
            return ('bronze', 4 if lx + ly < 0 else 3)
        if 0.52 < r < 0.6:
            return ('gold', 4) if glow else ('bronze', 0)
        a = math.atan2(ly / ry, lx / R)
        q = (a / (math.pi / 2)) % 1.0
        if 0.62 < r < 0.8 and abs(q - 0.5) < 0.05:
            return ('gold', 4) if glow else ('bronze', 0)
        if 0.66 < r < 0.74 and abs(q - 0.5) < 0.16:
            return ('gold', 3) if glow else ('bronze', 1)
        return None

    decals.append(Decal('shield' + tag, decal))


def build(pose):
    p = P(pose)
    k = skeleton(p)
    prims, decals = [], []
    hip, u, f, neck, shF, shB, head = k['hip'], k['u'], k['f'], k['neck'], k['shF'], k['shB'], k['head']
    lean = math.radians(p['lean'])

    # ---------- pernas: grevas de bronze sobre a malha, botas de couro ----------
    def leg(root, ang, z, shade, footang):
        th, kn = ang
        knee = add(root, dirv(th), 10.5)
        ankle = add(knee, dirv(th - kn), 10.0)
        fa = math.radians(footang)
        toe = add(ankle, (math.cos(fa), math.sin(fa)), 5.6)
        heel = add(ankle, (math.cos(fa), math.sin(fa)), -1.8)
        prims.append(Capsule('thigh', 'mail', z, root, knee, 3.9, 3.3, shade=shade))
        prims.append(Capsule('greave', 'bronze', z + 0.05, knee, add(ankle, dirv(th - kn), -1.0), 3.2, 2.6, shade=shade))
        prims.append(Ellipse('knee', 'bronze', z + 0.08, add(knee, f, 0.9), 3.0, 2.6, shade=shade))
        prims.append(Capsule('foot', 'leather', z + 0.04, heel, toe, 2.5, 2.1, shade=shade))

    leg(add(hip, f, -2.0), p['legB'], 1.5, 0.6, p['footB'])
    leg(add(hip, f, 2.0), p['legF'], 4.0, 1.0, p['footF'])

    # ---------- a alabarda, quando ela vai atrás do corpo ----------
    hal_back = p['halDrop'] is None and p['halZ'] < 3.0
    if hal_back:
        halberd(prims, decals, k['butt'], k['d'], p['halK'], p['halZ'], p['glow'])

    # ---------- o braço da alabarda (o de trás) ----------
    def arm(root, target, z, shade, mat='bronze'):
        up, el = ik2(root, target, 8.4, 7.8)
        elbow = add(root, dirv(up), 8.4)
        hand = add(elbow, dirv(up + el), 7.8)
        prims.append(Capsule('upperarm', 'mail', z, root, elbow, 2.8, 2.5, shade=shade))
        prims.append(Capsule('forearm', mat, z + 0.05, elbow, hand, 2.8, 2.4, shade=shade))
        prims.append(Ellipse('gauntlet', 'bronze', z + 0.1, hand, 2.5, 2.4, shade=shade))
        return hand

    if p['halDrop'] is None:
        arm(shB, k['hand'], 2.4 if p['halZ'] < 3.0 else 7.4, 0.8 if p['halZ'] < 3.0 else 1.0)
    else:
        arm(shB, add(hip, (6.0, 2.0)), 2.4, 0.8)

    # ---------- tronco: a malha, o peitoral de bronze e o tabardo ----------
    prims.append(Capsule('belly', 'mail', 3.0, add(hip, u, 2.0), add(neck, u, -4.0), 6.2, 6.8))
    # a sobreveste cor de vinho por cima do peitoral (o bronze aparece no gorjal e nas bordas)
    chest = add(add(neck, u, -6.5), f, 1.2)
    breast = Ellipse('chest', 'vhalor', 3.6, chest, 7.4, 7.6, ang=lean)
    prims.append(breast)

    def chest_decal(x, y, cur):
        lx, ly = breast.local(x, y)
        # a barra de bronze que desce pela frente e a da cava
        if abs(lx - 4.2) < 0.7 and -6.5 < ly < 6:
            return ('bronze', 3)
        if math.hypot(lx / 7.4, ly / 7.6) > 0.9 and ly < -2:
            return ('bronze', 2)
        return None

    decals.append(Decal('chest', chest_decal))
    prims.append(Capsule('gorget', 'bronze', 3.9, add(neck, u, -1.2), add(add(neck, u, -1.2), f, 3.4), 3.4, 3.2))
    tab = [add(add(hip, f, -6.4), u, 3.5), add(add(hip, f, 6.8), u, 3.5), add(add(hip, f, 7.8), u, -11.5),
           add(add(hip, f, 3.0), u, -10.0), add(add(hip, f, 0.0), u, -11.8), add(add(hip, f, -3.0), u, -10.2),
           add(add(hip, f, -7.2), u, -12.0)]

    def tab_n(x, y):
        return norm((0.28 * math.sin(x * 0.95), -0.15, 0.95))

    prims.append(Poly('tabard', 'vhalor', 3.7, tab, nf=tab_n))

    def tab_decal(x, y, cur):
        # a barra de bronze embaixo
        d = abs((y - (hip[1] + 9.0)) - (x - hip[0]) * 0.1)
        if d < 0.9 and y > hip[1] + 4:
            return ('bronze', 3)
        return None

    decals.append(Decal('tabard', tab_decal))
    belt = add(hip, u, 2.6)
    prims.append(Capsule('belt', 'leather', 3.8, add(belt, f, -6.8), add(belt, f, 7.0), 1.5, 1.5))
    prims.append(Ellipse('buckle', 'bronze', 3.85, add(belt, f, 4.4), 1.4, 1.3))
    prims.append(Ellipse('pauldronB', 'bronze', 2.2, add(shB, u, 1.0), 4.8, 3.9, ang=lean, shade=0.65))

    # ---------- o elmo: bronze, a viseira em T e a coroa de três pontas ----------
    tilt = math.radians(p['tilt'])
    hl = lambda q: add(head, rot(q, lean * 0.5 + tilt))
    prims.append(Capsule('aventail', 'mail', 4.7, add(neck, u, 0.5), add(add(neck, u, 0.5), f, 3.2), 3.8, 3.6, shade=0.85))
    helm = Ellipse('helm', 'bronze', 5.0, head, 6.3, 7.5, ang=lean * 0.5 + tilt, bulge=0.85)
    prims.append(helm)
    for i, (x0, h) in enumerate(((-3.6, 3.6), (0.0, 5.2), (3.6, 3.6))):
        base = -6.6 + abs(x0) * 0.25
        spike = [hl((x0 - 1.6, base + 0.6)), hl((x0, base - h)), hl((x0 + 1.6, base + 0.6))]
        prims.append(Poly('crown', 'gold', 5.05 + i * 0.001, spike, nf=lambda x, y: norm((-0.4, -0.6, 0.7))))
    prims.append(Capsule('circlet', 'gold', 5.06, hl((-5.0, -5.6)), hl((5.2, -5.2)), 0.9, 0.9))

    def helm_decal(x, y, cur):
        lx, ly = helm.local(x, y)
        # a viseira em T: a fenda dos olhos e a do nariz para baixo (acesas no aviso)
        if -2.1 < ly < -0.9 and 0.6 < lx < 6.4:
            return ('gold', 4) if p['glow'] and lx > 2.4 else ('void', 0)
        if 3.0 < lx < 4.2 and -1.0 < ly < 3.8:
            return ('gold', 3) if p['glow'] else ('void', 0)
        # a aba da nuca e a crista do meio
        if lx < -4.4 and ly > 1.5:
            return ('bronze', 1)
        if abs(lx + 0.4) < 0.45 and -7 < ly < -2.5:
            return ('bronze', 4)
        return None

    decals.append(Decal('helm', helm_decal))

    # ---------- o braço do escudo (o da frente) e o escudo ----------
    sc = k['sc']
    if p['shieldDrop'] is None:
        arm(shF, add(sc, f, -2.0), 6.0, 1.0)
        prims.append(Ellipse('pauldronF', 'bronze', 6.4, add(shF, u, 1.2), 5.4, 4.3, ang=lean))
        shield(prims, decals, sc, math.radians(p['sAng']), p['glow'])
    else:
        arm(shF, add(hip, (8.0, 0.0)), 6.0, 1.0)
        prims.append(Ellipse('pauldronF', 'bronze', 6.4, add(shF, u, 1.2), 5.4, 4.3, ang=lean))

    # ---------- a alabarda, quando ela passa na frente ----------
    if p['halDrop'] is None and not hal_back:
        halberd(prims, decals, k['butt'], k['d'], p['halK'], p['halZ'], p['glow'])

    pivot = p['pivot'] or FEET
    prims, decals = rotate_all(prims, decals, pivot, p['rot'], p['off'])
    # o que caiu fica no chão, fora do giro do corpo
    if p['halDrop'] is not None:
        (bx, by), ang = p['halDrop']
        halberd(prims, decals, (bx, by), dirv(ang), 1.0, 0.5, False, tag='D')
    if p['shieldDrop'] is not None:
        shield(prims, decals, p['shieldDrop'], 0.0, False, flat=True, tag='D')
    return prims, decals


# ---------- animações ----------
def idle():
    return [dict(hip=(0, b), hS=(9, -14.5 + b * 0.6), hW=(9, -3 + b * 0.5), grip=27 + b * 0.5) for b in (0.0, 0.5, 1.0, 0.5)]


def walk(n=6):
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s = math.sin(ph)
        c = math.cos(ph)
        bob = -abs(c) * 1.2 + 0.6
        out.append(dict(
            hip=(0.0, bob),
            legF=(6 + 15 * s, 4 + max(0, -c) * 20 + max(0, s) * 4), footF=-8 * max(0, -c),
            legB=(-4 - 15 * s, 4 + max(0, c) * 20 + max(0, -s) * 4), footB=-8 * max(0, c),
            hS=(9.5, -14.5 + bob * 0.5), hW=(9 + 1.5 * s, -3 + bob * 0.4), grip=27 + bob, lean=2,
        ))
    return out


def turn():
    return [dict(hS=(5, -13), hW=(4, -2), lean=-2, hip=(0, 1)), dict(hS=(2, -12), hW=(1, -2), lean=-4, hip=(-1, 1.5))]


def block():
    return [dict(hS=(6.5, -14), sAng=-10, lean=-6, hip=(-1.5, 1.2), legF=(14, 12), legB=(-16, 10), hW=(6, -2), hal=184)]


def aim():
    # recua a alabarda na altura do ombro, a ponta para a frente e um pouco para baixo; o escudo desce um
    # pouco para a ponta passar por cima dele
    return [
        dict(lean=-5, hip=(-1.5, 1.0), legF=(16, 10), legB=(-14, 8), hW=(-2, -10), hal=86, grip=12, hS=(11, -13), sAng=-6, glow=True),
        dict(lean=-9, hip=(-3, 1.5), legF=(18, 12), legB=(-16, 10), hW=(-7, -10), hal=86, grip=9, hS=(11, -12), sAng=-8, glow=True),
    ]


def thrust():
    return [
        dict(lean=10, hip=(5, 1.5), legF=(30, 10), legB=(-24, 6), footB=-8, hW=(15, -9), hal=86, grip=7, hS=(12, -11), sAng=-12),
        dict(lean=13, hip=(7, 2), legF=(34, 10), legB=(-28, 4), footB=-10, hW=(19, -9), hal=86, grip=6, hS=(12, -10), sAng=-14),
    ]


def thrust_recover():
    return [dict(lean=5, hip=(3, 1), legF=(20, 10), legB=(-16, 6), hW=(9, -8), hal=86, grip=18, hS=(10, -14), sAng=-6),
            dict(lean=2, hip=(1, 0.5), legF=(12, 8), legB=(-10, 6), hW=(9, -5), hal=150, grip=24, hS=(9.5, -14.5))]


def spin_windup():
    # agacha e leva a alabarda para trás, rente ao chão (a ponta brilha)
    return [
        dict(lean=10, hip=(-1, 4), legF=(26, 36), legB=(-20, 30), hW=(-4, 9), hal=262, grip=22, halZ=1.0, hS=(11, -12), glow=True),
        dict(lean=14, hip=(-2, 6), legF=(30, 46), legB=(-22, 38), hW=(-7, 11), hal=266, grip=21, halZ=1.0, hS=(12, -11), glow=True),
    ]


def spin():
    # uma volta inteira em volta das pernas: atrás, cruzando na frente (encurtada), na frente, voltando
    # pelo fundo (encurtada) e atrás de novo
    base = dict(lean=14, hip=(-1, 6), legF=(30, 46), legB=(-22, 38), hS=(12, -11))
    return [
        dict(base, hW=(-7, 11), hal=268, grip=21, halZ=1.0),
        dict(base, hW=(-2, 12), hal=262, grip=21, halK=0.5, halZ=8.0),
        dict(base, hW=(2, 12), hal=200, grip=21, halK=0.2, halZ=8.0),
        dict(base, hW=(6, 12), hal=94, grip=21, halK=0.55, halZ=8.0),
        dict(base, hW=(10, 11), hal=92, grip=21, halZ=8.0),
        dict(base, hW=(6, 11), hal=96, grip=21, halK=0.5, halZ=1.0),
        dict(base, hW=(1, 11), hal=160, grip=21, halK=0.2, halZ=1.0),
        dict(base, hW=(-4, 11), hal=264, grip=21, halK=0.55, halZ=1.0),
    ]


def spin_recover():
    return [dict(lean=8, hip=(0, 3), legF=(18, 20), legB=(-14, 16), hW=(4, 2), hal=230, grip=24, halZ=1.0, hS=(10, -14)),
            dict(lean=3, hip=(0, 1), legF=(10, 8), legB=(-8, 6), hW=(8, -2), hal=178, grip=26, hS=(9.5, -14.5))]


def stagger():
    # a estocada aparada: a alabarda sobe para trás, o escudo abre para o lado e ele cambaleia
    return [
        dict(lean=-15, hip=(-3, 1.5), legF=(10, 6), legB=(-24, 12), tilt=-14, hW=(-3, -20), hal=148, grip=20, hS=(-1, -6), sAng=-40),
        dict(lean=-11, hip=(-2.5, 1.2), legF=(12, 6), legB=(-20, 10), tilt=-10, hW=(-1, -18), hal=156, grip=22, hS=(1, -7), sAng=-34),
    ]


def hurt():
    return [dict(lean=-9, hip=(-2, 1), hS=(5, -13), sAng=-8, hW=(6, -4), hal=188, legF=(12, 8), legB=(-14, 10), tilt=-6)]


def death():
    piv = (88.0, 108.0)
    return [
        dict(lean=-10, hip=(-2, 2), hS=(4, -11), sAng=-12, hW=(4, -4), hal=196, tilt=-8),
        dict(hip=(0, 10), legF=(70, 120), legB=(-20, 110), lean=18, hW=(10, 5), hal=132, grip=30, hS=(9, -6), sAng=10),
        dict(rot=34, pivot=piv, off=(0, -8), hip=(0, 10), legF=(70, 120), legB=(-20, 110), lean=20, hW=(10, 6), hal=118, grip=32,
             hS=(9, -4), sAng=20),
        dict(rot=80, pivot=piv, off=(-6, -14), hip=(0, 10), legF=(34, 40), legB=(10, 30), lean=20, hW=(6, 6),
             halDrop=((104.0, 107.0), 88.0), shieldDrop=(70.0, 108.0)),
    ]


ANIMS = {
    'idle': (idle(), 5, True),
    'walk': (walk(), 8, True),
    'turn': (turn(), 12, False),
    'block': (block(), 10, False),
    'aim': (aim(), 6, False),
    'thrust': (thrust(), 16, False),
    'thrustrec': (thrust_recover(), 8, False),
    'spinwind': (spin_windup(), 6, False),
    'spin': (spin(), 16, True),
    'spinrec': (spin_recover(), 8, False),
    'stagger': (stagger(), 6, False),
    'hurt': (hurt(), 10, False),
    'death': (death(), 7, False),
}

"""O Senhor de Vhalor: o chefe do meio das Torres Rúnicas (o Trono da Casa). O chefe da Casa Vhalor, que
pediu a Coroação. Na noite ele estava no trono, esperando o núcleo ligar; o Eclipse fez crescer nele o
Âmbar dos cabos que ligavam o trono ao núcleo, e ele ficou preso ali.

Um velho grande, sentado no trono: a roupa de cerimônia muito escura (quase preta, puxando para o roxo)
com os debruns de bronze na gola alta, no punho, na frente e na barra; o manto pesado nos ombros, caindo
atrás até o assento. O cabelo branco comprido, a barba branca até o peito, o rosto magro e cavado, o nariz
comprido e os olhos fundos (acendem em Âmbar quando ele comanda os cabos). Na cabeça, a coroa de runas da
Casa: o aro de bronze com as pontas altas e finas, cada uma com uma runa. Metade do corpo é Âmbar
cristalizado: o braço de trás preso no braço do trono dentro de um bloco de cristal, um cacho de cristais
no ombro de trás que sobe até o queixo e cristais crescendo no colo e na barra. Das costas saem três cabos
de Âmbar que entram no encosto do trono, e de baixo do assento dois descem para o chão; os do teto saem
dos ombros (o jogo desenha até o teto, a partir dos pontos 'cabos').

Na mão da frente, o Cetro de Vhalor: a maça de bronze com a runa na cabeça (o ponto 'cetro'), em pé, com o
pé no chão do estrado. Vencido, o Âmbar toma o corpo inteiro (ainda segurando o Cetro) e o jogo desfaz a
estátua em pó: o trono fica vazio, com a coroa no assento (o quadro 'empty'), e o Cetro cai no estrado.

O boneco olha para a direita (+x); o jogo vira para a esquerda. FEET é o chão do estrado embaixo dos pés;
as costas do trono ficam BACK px atrás (encostam no encosto alto de pedra da sala).

uso: python3 ink_sheets.py <pasta_assets> vhalor
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot

puppet.RAMPS['vhrobe'] = [0x0e0b14, 0x1b1526, 0x2b2139, 0x3e304f, 0x544268]
puppet.RAMPS['vhmantle'] = [0x16070c, 0x2a0d17, 0x431424, 0x5e1d32, 0x7a2a43]
puppet.RAMPS['vhskin'] = [0x3b2f2b, 0x6b5851, 0x9a837a, 0xc4ad9f, 0xe3d1c4]
puppet.RAMPS['vhhair'] = [0x4a4649, 0x7a7577, 0xa9a3a3, 0xd3cecb, 0xf2eeea]
puppet.RAMPS['throne'] = [0x140d0b, 0x24170f, 0x382417, 0x4f3420, 0x6a482d]
puppet.RAMPS['velvet'] = [0x1c070b, 0x330c14, 0x4f1420, 0x6c1e2c, 0x8a2b3a]
puppet.RAMPS['acable'] = [0x3a1a06, 0x6a3410, 0xa85a1c, 0xe08a32, 0xffc472]
puppet.RAMPS.setdefault('bronze', [0x2e1f10, 0x5a3a18, 0x8a5c26, 0xb98a3e, 0xe4bd72])
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
puppet.RAMPS.setdefault('amberdim', [0x2a170b, 0x46280f, 0x683c17, 0x8c5422, 0xaa6e34])
puppet.SHINY.setdefault('bronze', (0.5, 9))
puppet.SHINY.setdefault('amber', (0.7, 16))
puppet.SHINY['acable'] = (0.55, 12)
puppet.SHINY['throne'] = (0.18, 8)
puppet.RIM_MATS |= {'vhrobe', 'vhmantle', 'vhhair', 'throne'}

W, H = 104, 112
FEET = (50, 104)
FLOOR = 104.0
# as costas do trono (px atrás dos pés) e o assento
BACK = 38.0
SEAT = 84.0
ARM = (12.5, 11.5)
CETRO = 50.0

DEFAULT = dict(
    # o tronco (inclinação para a frente) e a cabeça (+ abaixa)
    hip=(0.0, 0.0), lean=4.0, tilt=8.0,
    # a mão da frente: alvo em relação ao ombro da frente
    hand=(13.5, 13.0), bend=1,
    # o Cetro: ângulo (0 = em pé, + para a frente), do pé dele até a mão; cetro=False: largou (no chão)
    cet=-10.0, grip=34.5, cetro=True,
    # brilho: a runa do Cetro, as runas da coroa e os olhos (0, 1, 2)
    rune=0, crown=0, eyes=0,
    # o Âmbar tomando o corpo (0: a metade de sempre; 1: o corpo inteiro, na morte)
    amber=0.0,
    # o trono vazio, com a coroa no assento
    empty=False,
)


def P(d):
    p = dict(DEFAULT)
    p.update(d)
    return p


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


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


def skeleton(p):
    hip = add((29.0, 79.0), p['hip'])
    lean = p['lean']
    u, f = up(lean), fwd(lean)
    chest = add(hip, u, 14.0)
    neck = add(hip, u, 27.0)
    shF = add(add(neck, u, -3.5), f, 1.0)
    shB = add(add(neck, u, -3.0), f, -2.5)
    hd = lean + p['tilt'] * 0.6
    head = add(add(neck, up(hd), 7.0), fwd(hd), 1.6)
    ha = math.radians(lean + p['tilt'])
    elbowF, handF = ik(shF, add(shF, p['hand']), ARM[0], ARM[1], p['bend'])
    cd = up(p['cet'])
    butt = add(handF, cd, -p['grip'])
    ctop = add(butt, cd, CETRO)
    # os joelhos e os pés ficam no lugar (sentado): o quadril só mexe um pouco
    kx = p['hip'][0] * 0.3
    kneeF = (46.0 + kx, 79.0 + p['hip'][1] * 0.3)
    kneeB = (43.5 + kx, 78.5 + p['hip'][1] * 0.3)
    return dict(hip=hip, u=u, f=f, chest=chest, neck=neck, shF=shF, shB=shB, head=head, hd=hd, ha=ha,
                elbowF=elbowF, handF=handF, cd=cd, butt=butt, ctop=ctop, kneeF=kneeF, kneeB=kneeB)


def rel(pt):
    return [round(pt[0] - FEET[0], 1), round(pt[1] - FEET[1], 1)]


def points(pose):
    """Em pixels do mundo, a partir dos pés: a cabeça do Cetro (a runa), o meio da coroa, os olhos e os
    dois pontos dos ombros de onde os cabos sobem até o teto."""
    p = P(pose)
    k = skeleton(p)
    ha = k['ha']
    hl = lambda q: add(k['head'], rot(q, ha))
    out = {'crown': rel(hl((0.0, -6.6))), 'eye': rel(hl((2.6, -1.0))),
           'cabos': [rel(add(add(k['shB'], k['u'], 2.6), k['f'], -1.5)), rel(add(add(k['neck'], k['u'], -2.0), k['f'], -5.6))]}
    out['cetro'] = rel(add(k['ctop'], k['cd'], -4.6)) if p['cetro'] and not p['empty'] else None
    return out


# ---------- o cristal de Âmbar: uma lasca comprida e facetada ----------
def shard(prims, base, ang, length, width, z, mat='amber'):
    """Lasca facetada saindo de base na direção ang (graus: 0 = para cima, + para a frente)."""
    d = up(ang)
    s = (-d[1], d[0])
    tip = add(base, d, length)
    mid = add(base, d, length * 0.62)
    pts = [add(base, s, -width * 0.7), add(mid, s, -width), tip, add(mid, s, width), add(base, s, width * 0.7)]
    lit = norm((-0.55 * s[0] - 0.2, -0.55 * s[1] - 0.5, 0.75))
    dark = norm((0.55 * s[0], 0.55 * s[1] + 0.2, 0.7))

    def nf(x, y, base=base, d=d, s=s):
        # a aresta do meio divide a lasca em duas faces: uma pega a luz, a outra não
        lx = (x - base[0]) * s[0] + (y - base[1]) * s[1]
        return lit if lx < 0 else dark

    prims.append(Poly('shard', mat, z, pts, nf=nf, shade=1.15))


def cluster(prims, base, spec, z, mat='amber'):
    for (dx, dy, ang, length, width) in spec:
        shard(prims, add(base, (dx, dy)), ang, length, width, z, mat)
        z += 0.002


def cable(prims, a, b, sag, r, z, mat='acable', rings=True):
    """Um cabo de Âmbar entre a e b, curvado para baixo (sag px), com as luvas de bronze."""
    n = 6
    prev = a
    for i in range(1, n + 1):
        t = i / n
        q = ((1 - t) * a[0] + t * b[0], (1 - t) * a[1] + t * b[1] + sag * 4 * t * (1 - t))
        prims.append(Capsule('cable', mat, z, prev, q, r, r, shade=0.95))
        if rings and i in (2, 4):
            prims.append(Capsule('cring', 'bronze', z + 0.01, add(q, (0.0, -r * 0.2)), add(q, (0.6, 0.0)), r + 0.35, r + 0.35, shade=0.9))
        prev = q


# ---------- o trono (sem o encosto alto, que é a parede de pedra da sala) ----------
def throne(prims, decals, p):
    bx = FEET[0] - BACK
    # o espaldar do trono: a tábua escura com o arco em ponta, o pomo de bronze, os aros e o medalhão
    panel = [(bx, FLOOR), (bx, 30.0), (bx + 4.0, 22.5), (bx + 8.0, 30.0), (bx + 8.0, FLOOR)]
    prims.append(Poly('panel', 'throne', 0.4, panel, nf=lambda x, y: norm((-0.25, -0.2, 0.95)), shade=0.9))
    prims.append(Ellipse('finial', 'bronze', 0.45, (bx + 4.0, 21.2), 1.7, 1.9))
    prims.append(Capsule('pedge', 'bronze', 0.42, (bx + 7.6, 31.0), (bx + 7.6, SEAT), 0.55, 0.55, shade=0.95))
    for y in (36.0, 60.0, SEAT - 1.0):
        prims.append(Capsule('pband', 'bronze', 0.43, (bx + 0.2, y), (bx + 7.8, y), 0.7, 0.7, shade=0.9))
    prims.append(Ellipse('medal', 'bronze', 0.44, (bx + 4.0, 47.0), 2.8, 3.2))

    def medal(x, y, cur, c=(bx + 4.0, 47.0), lit=p['crown']):
        dx, dy = x - c[0], y - c[1]
        # a runa da Casa: o risco do meio e os dois braços para cima
        if abs(dx) < 0.45 and -2.0 < dy < 2.2:
            return ('amber', 2 + min(2, lit))
        if abs(dy + 0.3 + abs(dx) * 0.9) < 0.42 and abs(dx) < 1.8:
            return ('amber', 2 + min(2, lit))
        return None

    decals.append(Decal('medal', medal))
    # o assento: a caixa de madeira escura com o friso de bronze e o painel entalhado do lado
    sx0, sx1 = bx + 6.0, FEET[0] - 6.0
    prims.append(Poly('seat', 'throne', 1.8, [(sx0, SEAT), (sx1, SEAT), (sx1, FLOOR), (sx0, FLOOR)],
                      nf=lambda x, y: norm((0.0, -0.15, 0.98)), shade=0.85))
    prims.append(Capsule('strim', 'bronze', 1.82, (sx0, SEAT + 0.8), (sx1, SEAT + 0.8), 0.8, 0.8, shade=0.95))
    prims.append(Capsule('btrim', 'bronze', 1.82, (sx0, FLOOR - 1.2), (sx1, FLOOR - 1.2), 0.9, 0.9, shade=0.8))

    def carve(x, y, cur, x0=sx0 + 3.0, x1=sx1 - 3.0, y0=SEAT + 4.0, y1=FLOOR - 4.5):
        if x0 < x < x1 and y0 < y < y1:
            edge = min(x - x0, x1 - x, y - y0, y1 - y)
            if edge < 0.8:
                return ('bronze', 2)
            if edge < 1.6:
                return ('throne', 0)
            # o brasão da Casa no meio do painel: o aro e a runa
            c = ((x0 + x1) / 2, (y0 + y1) / 2)
            r = math.hypot(x - c[0], (y - c[1]) * 1.2)
            if abs(r - 3.4) < 0.5:
                return ('bronze', 1)
            if abs(x - c[0]) < 0.45 and abs(y - c[1]) < 2.4:
                return ('amberdim', 3)
        return None

    decals.append(Decal('seat', carve))
    prims.append(Poly('cushion', 'velvet', 1.85, [(sx0 + 1.0, SEAT), (sx0 + 1.6, SEAT - 2.6), (sx1 - 2.0, SEAT - 2.4), (sx1, SEAT)],
                      nf=lambda x, y: norm((0.0, -0.7, 0.7)), shade=0.95))
    return sx0, sx1


def near_armrest(prims, z):
    bx = FEET[0] - BACK
    prims.append(Capsule('arest', 'throne', z, (bx + 8.5, 71.5), (FEET[0] - 8.5, 71.5), 1.7, 1.7, shade=1.0))
    prims.append(Capsule('apost', 'throne', z - 0.01, (FEET[0] - 10.0, 72.0), (FEET[0] - 10.0, SEAT), 1.4, 1.2, shade=0.85))
    prims.append(Ellipse('aknob', 'bronze', z + 0.01, (FEET[0] - 7.6, 71.0), 2.3, 2.3))
    prims.append(Capsule('aband', 'bronze', z + 0.005, (FEET[0] - 10.0, 76.0), (FEET[0] - 10.0, 76.8), 1.6, 1.6, shade=0.9))


def crown(prims, decals, c, ang, z, lit, name='crown'):
    """A coroa de runas da Casa: o aro de bronze e as cinco pontas finas (as do perfil), cada uma com
    uma runa acesa (lit) ou apagada."""
    R = lambda q: add(c, rot(q, ang))
    prims.append(Poly(name, 'bronze', z, [R((-5.6, 0.6)), R((5.2, 0.6)), R((5.0, -1.6)), R((-5.4, -1.6))],
                      nf=lambda x, y: norm((-0.2, -0.4, 0.9)), shade=1.0))
    for (x, h, w) in ((-4.6, 3.8, 1.0), (-2.3, 5.4, 1.1), (0.2, 6.6, 1.2), (2.6, 5.4, 1.1), (4.6, 3.8, 1.0)):
        tip = R((x + 0.25, -1.6 - h))
        prims.append(Poly(name + 'p', 'bronze', z - 0.01, [R((x - w, -1.4)), tip, R((x + w, -1.4))],
                          nf=lambda xx, yy, x=x: norm((-0.4 if x < 0 else 0.2, -0.5, 0.8)), shade=1.05))
        prims.append(Ellipse(name + 'g', 'amber' if lit else 'amberdim', z + 0.01, R((x + 0.1, -3.0)), 0.55, 0.75,
                             flat=2 + min(2, lit) if lit else 2))

    def band(x, y, cur):
        lx, ly = rot((x - c[0], y - c[1]), -ang)
        if abs(ly + 0.5) < 0.38 and int((lx + 8) * 0.9) % 3 == 0:
            return ('amber' if lit else 'amberdim', 3)
        return None

    decals.append(Decal(name, band))


# ---------- o Cetro de Vhalor ----------
def cetro(prims, decals, butt, d, length, z, rune, r=1.1, head=1.0):
    """A maça de bronze: o cabo de madeira escura com os anéis, o pé de bronze, a cabeça com as abas e a
    runa no meio, e a ponta em cima. d aponta do pé para a cabeça."""
    s = (-d[1], d[0])
    top = add(butt, d, length)
    hb = add(top, d, -9.5 * head)
    prims.append(Capsule('haft', 'throne', z, butt, hb, r, r * 0.95, shade=1.0))
    prims.append(Capsule('cbutt', 'bronze', z + 0.01, butt, add(butt, d, 2.2), r + 0.35, r + 0.25, shade=0.9))
    for t in (0.18, 0.5):
        q = add(butt, d, (length - 9.5 * head) * t)
        prims.append(Capsule('cring', 'bronze', z + 0.01, add(q, d, -0.6), add(q, d, 0.6), r + 0.4, r + 0.4, shade=0.95))
    prims.append(Capsule('ccollar', 'bronze', z + 0.02, add(hb, d, -1.2), add(hb, d, 1.0), r + 0.9, r + 1.1, shade=0.95))
    hc = add(top, d, -4.6 * head)
    # as abas: três de cada lado no perfil, pontudas
    for k, (a, l) in enumerate(((-2.6, 2.6), (0.0, 3.2), (2.6, 2.6))):
        for side in (-1, 1):
            b0 = add(add(hc, d, a * head), s, side * 2.6 * head)
            tip = add(add(hc, d, (a + 0.4) * head), s, side * (2.6 + l) * head)
            prims.append(Poly('flange', 'bronze', z + 0.03, [add(b0, d, -1.3 * head), tip, add(b0, d, 1.3 * head)],
                              nf=lambda x, y, side=side: norm((-0.3 * side, -0.55, 0.78)), shade=0.95))
    core = Ellipse('chead', 'bronze', z + 0.04, hc, 3.3 * head, 4.4 * head, ang=math.atan2(d[1], d[0]) + math.pi / 2)
    prims.append(core)
    prims.append(Poly('cspike', 'bronze', z + 0.035, [add(add(top, d, -0.4), s, -1.0 * head), add(top, d, 3.4 * head), add(add(top, d, -0.4), s, 1.0 * head)],
                      nf=lambda x, y: norm((-0.3, -0.6, 0.75)), shade=1.0))

    def glyph(x, y, cur, hc=hc, d=d, s=s):
        lx = (x - hc[0]) * s[0] + (y - hc[1]) * s[1]
        ly = (x - hc[0]) * d[0] + (y - hc[1]) * d[1]
        lx, ly = lx / head, ly / head
        # a runa: o risco do meio, o gancho em cima e o pé cruzado
        on = (abs(lx) < 0.42 and -2.6 < ly < 2.6) or (abs(ly - 1.4 - lx * 0.8) < 0.38 and 0 < lx < 1.6) or (abs(ly + 1.6) < 0.36 and abs(lx) < 1.4)
        if on:
            return ('amber', 2 + min(2, rune)) if rune else ('amberdim', 3)
        return None

    decals.append(Decal('chead', glyph))
    return hc


def build(pose):
    p = P(pose)
    prims, decals = [], []
    sx0, sx1 = throne(prims, decals, p)
    k = skeleton(p)
    hip, u, f, chest, neck, shF, shB, head = k['hip'], k['u'], k['f'], k['chest'], k['neck'], k['shF'], k['shB'], k['head']
    am = p['amber']
    # o Âmbar tomando tudo: as partes do corpo viram cristal escuro e depois aceso
    stone = am >= 0.75
    robe_m = 'amberdim' if stone else 'vhrobe'
    skin_m = 'amber' if am >= 0.95 else ('amberdim' if stone else 'vhskin')
    hair_m = 'amberdim' if stone else 'vhhair'

    if p['empty']:
        # o trono vazio: os cabos das costas soltos, caídos no assento, e a coroa da Casa no assento
        bx = FEET[0] - BACK
        for (y0, dy) in ((50.0, 0.0), (58.0, 1.5), (66.0, 3.0)):
            cable(prims, (bx + 8.0, y0), (bx + 16.0 + dy, SEAT - 2.0), 3.0, 1.5, 1.0, mat='amberdim', rings=False)
        cable(prims, (sx1 - 6.0, FLOOR - 1.0), (sx1 + 1.5, FLOOR - 0.5), -2.0, 1.4, 1.9, mat='amberdim', rings=False)
        crown(prims, decals, (sx0 + 13.0, SEAT - 3.8), math.radians(-14), 2.2, 0, name='ecrown')
        near_armrest(prims, 2.4)
        return prims, decals

    # ---------- atrás do corpo: os cabos das costas, o braço de trás preso no cristal, o manto ----------
    bx = FEET[0] - BACK
    back = add(chest, f, -6.0)
    for (i, y0) in enumerate((48.0, 57.0, 66.0)):
        src = add(add(back, u, 9.0 - i * 6.0), f, 0.8)
        cable(prims, src, (bx + 8.2, y0), 1.5 + i * 0.6, 1.5, 0.8)
        prims.append(Ellipse('csock', 'bronze', 0.85, (bx + 8.4, y0), 1.0, 2.0))
    # os dois de baixo do assento, entrando no chão do estrado
    cable(prims, (sx1 - 8.0, FLOOR - 3.0), (sx1 + 2.5, FLOOR + 0.5), -2.4, 1.5, 1.9)
    cable(prims, (sx1 - 14.0, FLOOR - 2.0), (sx1 - 3.0, FLOOR + 0.5), -1.8, 1.3, 1.88)

    # o braço de trás: do ombro até o braço do trono, dentro do bloco de cristal
    elbowB = add(add(shB, u, -10.5), f, 2.5)
    handB = (FEET[0] - 11.0, 70.0)
    prims.append(Capsule('armB', robe_m, 1.1, shB, elbowB, 3.2, 3.0, shade=0.6))
    prims.append(Capsule('foreB', robe_m, 1.12, elbowB, handB, 3.0, 2.4, shade=0.6))
    cluster(prims, add(elbowB, (1.0, 0.0)), [(-1.0, 0.0, -40, 8.0, 2.6), (2.0, -1.0, 10, 9.5, 2.8), (5.0, 0.5, 40, 7.5, 2.4),
                                             (8.0, 1.0, 70, 6.0, 2.0), (3.0, 2.0, 100, 5.0, 2.0)], 1.2)

    # o manto: dos ombros, caindo pelas costas até o assento
    mantle = [add(add(shF, u, 2.2), f, 1.5), add(add(neck, u, 1.0), f, -2.5), add(add(neck, u, -1.5), f, -6.0),
              add(chest, f, -9.6), add(add(hip, u, 3.0), f, -9.4), (sx0 + 1.2, SEAT - 0.5), add(add(hip, u, 2.0), f, -1.0),
              add(add(chest, f, 2.0), u, 3.0), add(add(shF, u, -6.0), f, 3.6)]

    def mantle_nf(x, y):
        nx = -(x - chest[0]) / 12.0 + 0.25 * math.sin(y * 0.9 + x * 0.2)
        return norm((nx, -0.25, 0.85))

    mantle_m = 'amberdim' if stone else 'vhmantle'
    prims.append(Poly('mantle', mantle_m, 2.0, mantle, nf=mantle_nf, shade=0.85))

    def mantle_decal(x, y, cur, a=mantle[-1], b=mantle[-2]):
        # o debrum de bronze na beirada da frente do manto, que desce do ombro
        vx, vy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(vx, vy) or 1.0
        d = abs((x - a[0]) * vy - (y - a[1]) * vx) / L
        return ('bronze', 2) if d < 0.7 else None

    decals.append(Decal('mantle', mantle_decal))

    # o cabelo branco comprido caindo atrás, por cima do manto
    ha = k['ha']
    hl = lambda q: add(head, rot(q, ha))
    hair = [hl((-4.6, -3.6)), hl((-0.5, -6.2)), hl((-1.0, 1.5)), hl((-1.6, 8.5)), add(shB, u, 1.0), hl((-7.0, 6.0)), hl((-6.4, -0.5))]
    prims.append(Poly('hair', hair_m, 2.9, hair, nf=lambda x, y: norm((0.35 * math.sin(y * 1.7 + x * 0.3) - 0.2, -0.3, 0.85)), shade=0.9))

    # ---------- as pernas debaixo da roupa: a de trás e a da frente, com o sapato de bronze ----------
    for (knee, ank, toe, z, sh) in ((k['kneeB'], (45.5, 100.5), (50.5, 103.0), 2.4, 0.6), (k['kneeF'], (48.0, 100.5), (54.0, 103.0), 3.4, 0.9)):
        prims.append(Capsule('shoe', 'vhrobe', z + 0.05, ank, toe, 1.8, 1.4, shade=sh))
        prims.append(Capsule('shoet', 'bronze', z + 0.06, add(toe, (-1.6, -0.6)), add(toe, (0.2, -0.2)), 1.0, 0.8, shade=sh))
        prims.append(Capsule('thigh', robe_m, z, add(hip, f, 2.0), knee, 4.6, 3.8, shade=sh))

    # ---------- o corpo: a roupa de cerimônia, do colarinho até o colo, e a frente caindo até a barra ----------
    kF = k['kneeF']
    robe = [add(add(neck, f, -3.6), u, 0.4), add(add(neck, f, 3.6), u, 0.2), add(add(chest, f, 8.4), u, 3.4), add(chest, f, 8.8),
            add(add(hip, u, 5.0), f, 8.6), add(kF, (-2.0, -4.6)), add(kF, (1.6, -4.0)), add(kF, (3.8, -1.0)), add(kF, (4.4, 3.0)),
            (51.4, 97.0), (51.2, 99.8), (43.4, 100.2), add(kF, (-3.6, 4.0)), (sx1 + 0.5, SEAT), add(add(hip, u, 0.0), f, -6.2),
            add(chest, f, -7.2), add(add(neck, f, -5.4), u, -3.0)]

    def robe_nf(x, y):
        # dobras: verticais na frente que cai, mais largas no corpo
        nx = -(x - chest[0]) / 14.0 + 0.28 * math.sin(x * 1.3 + y * 0.25)
        ny = -0.3 if y < kF[1] else 0.1
        return norm((nx, ny, 0.85))

    prims.append(Poly('robe', robe_m, 3.6, robe, nf=robe_nf, shade=0.9))
    front = (kF[0] + 4.1, kF[1] + 1.0)

    def robe_decal(x, y, cur):
        # o debrum de bronze na frente aberta (do colarinho à cintura) e na barra
        lx = (x - neck[0]) * f[0] + (y - neck[1]) * f[1]
        ly = -((x - neck[0]) * u[0] + (y - neck[1]) * u[1])
        if 0 < -ly < 22 and abs(lx - (3.6 + (-ly) * 0.14)) < 0.65:
            return ('bronze', 3)
        if y > 97.6 and x > 43.6:
            return ('bronze', 2 if y < 99 else 1)
        # o friso da barra que desce na frente da canela
        if y > kF[1] + 2 and abs(x - (front[0] + (y - front[1]) * 0.03)) < 0.6:
            return ('bronze', 2)
        # o medalhão da Casa no peito
        c = add(add(chest, f, 4.2), u, 4.0)
        if math.hypot(x - c[0], y - c[1]) < 1.9:
            return ('bronze', 3 if math.hypot(x - c[0] + 0.5, y - c[1] + 0.5) < 1.0 else 2)
        return None

    decals.append(Decal('robe', robe_decal))
    # o colarinho alto de bronze em volta do pescoço
    prims.append(Poly('collar', 'bronze', 3.9, [add(add(neck, f, -4.2), u, -1.0), add(add(neck, f, 3.8), u, -1.0),
                                                add(add(neck, f, 4.4), u, 3.6), add(add(neck, f, -4.8), u, 4.2)],
                      nf=lambda x, y: norm((-0.25, -0.35, 0.9)), shade=0.9))
    prims.append(Poly('collari', 'vhrobe', 3.95, [add(add(neck, f, -3.0), u, 0.0), add(add(neck, f, 2.6), u, 0.0),
                                                  add(add(neck, f, 3.0), u, 2.8), add(add(neck, f, -3.4), u, 3.2)],
                      nf=lambda x, y: norm((0.1, 0.2, 0.95)), shade=0.5))

    # ---------- o Âmbar no corpo: o cacho no ombro de trás até o queixo, o colo e a barra ----------
    cluster(prims, add(shB, u, 1.0), [(-2.0, 1.0, -70, 7.0, 2.2), (-1.0, -1.0, -35, 10.0, 2.8), (0.5, -2.0, -8, 8.5, 2.5),
                                      (2.0, -1.5, 18, 6.0, 2.0), (-3.0, 3.0, -100, 6.0, 2.0)], 4.35)
    cluster(prims, add(hip, f, 6.0), [(-2.0, -3.0, -18, 6.0, 1.9), (1.5, -3.6, 8, 7.5, 2.2), (5.0, -3.2, 28, 5.5, 1.8)], 3.7)
    cluster(prims, (46.0, 98.6), [(0.0, 0.0, 100, 3.6, 1.4), (2.6, -1.2, 72, 3.2, 1.3)], 3.72)
    if am > 0.2:
        cluster(prims, chest, [(2.0, -2.0, 30, 6.0 + am * 4, 2.0), (-2.0, 2.0, -30, 5.0 + am * 4, 1.8), (4.0, 4.0, 60, 4.0 + am * 3, 1.6)], 3.98)
    if am > 0.5:
        cluster(prims, kF, [(-2.0, -4.0, 0, 6.0, 2.0), (2.0, -2.0, 40, 7.0, 2.2)], 3.75)

    # ---------- o braço do trono (na frente do corpo) ----------
    near_armrest(prims, 4.2)

    # ---------- a cabeça: o rosto cavado, o nariz comprido, os olhos fundos; a barba e a coroa ----------
    face = Ellipse('head', skin_m, 4.5, head, 5.2, 6.2, ang=ha, bulge=0.8)
    prims.append(face)
    eyes = p['eyes']

    def face_decal(x, y, cur):
        lx, ly = face.local(x, y)
        # a órbita funda embaixo da sobrancelha pesada; acesa, a pupila de Âmbar
        if 1.0 < lx < 4.0 and -2.4 < ly < 0.2:
            if eyes and math.hypot(lx - 2.8, ly + 1.0) < 0.75:
                return ('amber', 2 + min(2, eyes))
            return (skin_m, 0) if abs(ly + 1.0) < 0.6 and lx > 1.8 else (skin_m, 1)
        if 0.6 < lx < 4.6 and -3.2 < ly < -2.4:
            return (hair_m, 3)
        # a maçã do rosto saltada e a bochecha funda
        if math.hypot((lx - 1.6) / 1.4, (ly - 2.0) / 1.0) < 1.0:
            return (skin_m, 1)
        # o Âmbar subindo pelo queixo, do lado de trás
        if am < 0.95 and math.hypot((lx + 2.4) / 1.8, (ly - 3.6) / 2.0) < 1.0:
            return ('amber', 2 if (lx + ly) % 2 < 1 else 3)
        return None

    decals.append(Decal('head', face_decal))
    # o nariz comprido, um pouco adunco
    prims.append(Poly('nose', skin_m, 4.55, [hl((4.0, -1.2)), hl((6.4, 1.8)), hl((5.8, 2.6)), hl((4.2, 2.2))],
                      nf=lambda x, y: norm((0.4, -0.3, 0.85)), shade=1.0))
    # a barba branca até o peito
    beard = [hl((-1.6, 2.4)), hl((1.0, 3.0)), hl((4.8, 3.0)), hl((5.0, 5.4)), add(add(chest, f, 6.4), u, 2.0),
             add(add(chest, f, 4.2), u, -1.4), add(add(chest, f, 2.4), u, 3.0), hl((-1.0, 6.4))]
    prims.append(Poly('beard', hair_m, 4.6, beard, nf=lambda x, y: norm((0.3 * math.sin(x * 2.0) - 0.1, -0.2, 0.9)), shade=0.95))
    # o cabelo por cima da testa, embaixo da coroa
    prims.append(Poly('hairtop', hair_m, 4.62, [hl((-4.8, -2.4)), hl((-3.0, -5.6)), hl((1.6, -6.0)), hl((3.6, -4.2)), hl((1.0, -4.0)), hl((-2.4, -2.6))],
                      nf=lambda x, y: norm((0.2, -0.6, 0.75)), shade=1.0))
    crown(prims, decals, hl((-0.4, -5.2)), ha, 4.7, p['crown'])

    # ---------- o braço da frente e o Cetro ----------
    elbowF, handF = k['elbowF'], k['handF']
    # cetro=False: o Cetro sai da folha (quem desenha é o jogo, a arma caída)
    if p['cetro']:
        cetro(prims, decals, k['butt'], k['cd'], CETRO, 5.0, p['rune'])
    prims.append(Capsule('sleeveF', robe_m, 5.2, shF, elbowF, 4.2, 3.7, shade=1.0))
    # do pulso para o cotovelo (a manga larga para dois px antes da mão, no punho de bronze)
    back = ((elbowF[0] - handF[0]) / ARM[1], (elbowF[1] - handF[1]) / ARM[1])
    prims.append(Capsule('foreF', robe_m, 5.22, elbowF, add(handF, back, 2.0), 3.6, 3.0, shade=1.0))
    cuff = add(handF, back, 2.4)
    prims.append(Ellipse('cuff', 'bronze', 5.24, cuff, 2.0, 2.9, ang=math.atan2(handF[1] - elbowF[1], handF[0] - elbowF[0])))
    prims.append(Ellipse('handF', skin_m, 5.3, handF, 2.1, 2.3, bulge=0.9))
    if am > 0.6:
        cluster(prims, elbowF, [(0.0, -2.0, -20, 5.0, 1.8), (2.0, 0.0, 40, 5.5, 1.8)], 5.26)
    return prims, decals


# ---------------- as animações ----------------
def sleep():
    # antes de a luta começar: a cabeça caída no peito, os olhos e a coroa apagados, o peito mal mexe
    return [dict(hip=(0.0, b * 0.4), lean=8 + b * 0.6, tilt=26 + b * 1.5, hand=(13.5, 13.2 + b * 0.3), grip=34.6 + b * 0.3) for b in (0.0, 1.0)]


def wake():
    # acorda: a cabeça sobe, os olhos e as runas da coroa acendem, ele ergue o Cetro e bate uma vez no estrado
    return [dict(lean=8, tilt=22, hand=(13.5, 13.2), grip=34.6, eyes=1),
            dict(lean=4, tilt=10, hand=(13.0, 8.0), cet=-6, grip=30.5, eyes=2, crown=1, rune=1),
            dict(lean=-2, tilt=-4, hand=(12.5, 3.0), cet=-4, grip=30.0, eyes=2, crown=2, rune=2),
            dict(lean=8, tilt=8, hand=(14.0, 13.2), cet=-6, grip=34.7, eyes=2, crown=2, rune=2),
            dict(lean=5, tilt=8, eyes=1, crown=1, rune=1)]


def idle():
    return [dict(hip=(0.0, b * 0.5), lean=4 + b, tilt=8 + b * 2, hand=(13.5, 13.0 + b * 0.4), grip=34.5 + b * 0.4) for b in (0.0, 0.5, 1.0, 0.5)]


def lash_wind():
    # ergue o Cetro bem alto, para trás: os cabos do teto respondem (os olhos acendem)
    return [dict(lean=-2, tilt=-2, hand=(8.0, -10.0), cet=-18, grip=20.0, rune=1, eyes=1),
            dict(lean=-6, tilt=-8, hand=(6.0, -16.0), cet=-28, grip=18.0, rune=2, eyes=2)]


def lash():
    # desce o Cetro apontando para onde o cabo vai bater
    return [dict(lean=10, tilt=6, hand=(20.0, 2.0), cet=70, grip=18.0, rune=2, eyes=2),
            dict(lean=12, tilt=8, hand=(21.0, 6.0), cet=96, grip=18.0, rune=1, eyes=1)]


def sweep_wind():
    # leva o Cetro para trás, cruzado no peito, baixo
    return [dict(lean=2, tilt=4, hand=(7.0, 6.0), cet=-32, grip=24.0, rune=1, eyes=1),
            dict(lean=-2, tilt=2, hand=(5.0, 4.0), cet=-44, grip=26.0, rune=2, eyes=2)]


def sweep():
    # varre para a frente, rente ao chão (o cabo de baixo do assento sai pelo chão)
    return [dict(lean=12, tilt=10, hand=(20.0, 12.0), cet=110, grip=20.0, rune=2, eyes=2),
            dict(lean=14, tilt=12, hand=(21.0, 14.0), cet=128, grip=20.0, rune=1, eyes=1)]


def rune_wind():
    # levanta o Cetro em pé, um palmo acima do chão, e a runa acende
    return [dict(lean=2, tilt=4, hand=(13.0, 2.0), cet=-4, grip=30.0, rune=1, crown=1),
            dict(lean=0, tilt=0, hand=(12.5, -2.0), cet=-2, grip=30.0, rune=2, crown=2, eyes=1)]


def rune_strike():
    # bate o pé do Cetro no estrado: as runas acendem no chão
    return [dict(lean=8, tilt=8, hand=(14.0, 13.0), cet=-6, grip=34.5, rune=2, crown=2, eyes=2),
            dict(lean=7, tilt=8, hand=(14.0, 13.4), cet=-6, grip=34.9, rune=2, crown=1, eyes=1)]


def summon():
    # aponta o Cetro para a sala, deitado; a coroa acende (os ecos dos guardas vêm)
    return [dict(lean=4, tilt=0, hand=(16.0, 2.0), cet=60, grip=22.0, rune=1, crown=1, eyes=1),
            dict(lean=6, tilt=-4, hand=(20.0, -2.0), cet=86, grip=22.0, rune=2, crown=2, eyes=2)]


def bash_wind():
    # o Cetro sobe pelo lado, para trás da cabeça (o aviso do golpe de perto)
    return [dict(lean=-4, tilt=-2, hand=(7.0, -8.0), cet=-14, grip=18.0, rune=1, eyes=1),
            dict(lean=-8, tilt=-6, hand=(5.0, -13.0), cet=-24, grip=18.0, rune=2, eyes=2)]


def bash():
    # a pancada para a frente e para baixo, na frente do trono
    return [dict(lean=14, tilt=10, hand=(21.0, 4.0), cet=96, grip=16.0, rune=2, eyes=2),
            dict(lean=16, tilt=12, hand=(21.5, 9.0), cet=124, grip=16.0, rune=1, eyes=1)]


def grip():
    # o trono subindo e parado lá em cima: firme no braço do trono, a cabeça baixa
    return [dict(lean=10, tilt=14, hand=(13.5, 13.0), cet=-14, grip=33.6, eyes=1),
            dict(lean=11, tilt=15, hand=(13.5, 13.4), cet=-14, grip=33.8, eyes=2)]


def slam():
    return [dict(hip=(0.0, 2.0), lean=18, tilt=20, hand=(14.0, 14.0), cet=-8, grip=31.0, rune=2, eyes=2),
            dict(hip=(0.0, 0.8), lean=10, tilt=12, hand=(13.5, 13.0), cet=-10, grip=33.5, rune=1, eyes=1)]


def hurt():
    return [dict(lean=-6, tilt=-12, hand=(12.0, 10.0), cet=4, grip=33.0, eyes=1)]


def stagger():
    # o golpe de perto aparado: o Cetro voa para trás, a cabeça vai junto
    return [dict(lean=-10, tilt=-16, hand=(6.0, -8.0), cet=-26, grip=20.0),
            dict(lean=-8, tilt=-12, hand=(7.0, -4.0), cet=-18, grip=22.0)]


def death():
    return [
        dict(lean=-6, tilt=-14, hand=(12.0, 8.0), cet=-4, grip=30.0, rune=2, crown=2, eyes=2, amber=0.3),
        dict(lean=6, tilt=16, hand=(16.0, 12.0), cet=30, grip=28.0, eyes=1, amber=0.6),
        dict(lean=14, tilt=30, hand=(17.0, 16.0), cet=60, grip=26.0, amber=0.8),
        dict(lean=16, tilt=34, hand=(17.0, 18.0), cet=64, grip=26.0, amber=0.95),
        dict(lean=16, tilt=34, hand=(17.0, 18.0), cet=64, grip=26.0, amber=1.0),
    ]


ANIMS = {
    'sleep': (sleep(), 1.5, True),
    'wake': (wake(), 6, False),
    'idle': (idle(), 3, True),
    'lashwind': (lash_wind(), 6, False),
    'lash': (lash(), 14, False),
    'sweepwind': (sweep_wind(), 6, False),
    'sweep': (sweep(), 14, False),
    'runewind': (rune_wind(), 6, False),
    'rune': (rune_strike(), 12, False),
    'summon': (summon(), 5, False),
    'bashwind': (bash_wind(), 7, False),
    'bash': (bash(), 14, False),
    'grip': (grip(), 3, True),
    'slam': (slam(), 10, False),
    'hurt': (hurt(), 10, False),
    'stagger': (stagger(), 6, False),
    'death': (death(), 5, False),
    'empty': ([dict(empty=True)], 1, False),
}

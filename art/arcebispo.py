"""O Arcebispo do Dízimo: o segundo chefe. Alto e magro, de túnica branca até o chão, casula roxa
bordada a ouro e a murça carmesim nos ombros. Na cabeça, a mitra alta; no rosto, uma moeda de
ouro no lugar da cara, com duas fendas que acendem. Numa mão, a corrente de um incensário de
ouro do tamanho de um sino; na outra, o báculo com uma moeda presa na volta.

uso: python3 arcebispo.py <pasta_assets> [animações...]
"""
import json
import math
import sys
from multiprocessing import Pool
from PIL import Image
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot, render, to_image
from rig import rotate_all

puppet.RAMPS['vest'] = [0x140b19, 0x24132c, 0x381d44, 0x512a60, 0x6e3c7f]
puppet.RAMPS.setdefault('linen', [0x6b675f, 0x9d978b, 0xc6bfb0, 0xe3ddcf, 0xf7f2e6])
puppet.RIM_MATS |= {'vest', 'linen'}

W, H = 240, 216
BASE_HIP = (100.0, 160.0)
FEET = (100, 212)
FLOOR = 211.5

DEFAULT = dict(
    hip=(0.0, 0.0), lean=0.0, tilt=0.0, hem=0.0, pool=0.0,
    armF=(30.0, 40.0), armB=(-46.0, 26.0),
    # corrente do incensário: ângulo (0 = pendurado, 90 = para a frente, 180 = para cima) e comprimento
    ca=0.0, cl=36.0, censerAt=None, noCenser=False,
    # báculo: inclinação (graus, + para a frente) e onde a mão segura (0 = pé, 1 = topo); staffAt: caído no chão
    sa=4.0, sg=0.5, staffAt=None,
    glow=False, mitre=None, rot=0.0, pivot=None, off=(0.0, 0.0),
)
STAFF_LEN = 92.0


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
    neck = add(hip, u, 44.0)
    shF = add(add(neck, f, 6.0), u, -4.0)
    shB = add(add(neck, f, -6.5), u, -4.0)
    head = add(add(neck, u, 10.0), f, 3.0)
    up, el = p['armF']
    elbowF = add(shF, dirv(up), 17.0)
    handF = add(elbowF, dirv(up + el), 15.0)
    upB, elB = p['armB']
    elbowB = add(shB, dirv(upB), 17.0)
    handB = add(elbowB, dirv(upB + elB), 15.0)
    cc = p['censerAt'] if p['censerAt'] is not None else add(handF, dirv(p['ca']), p['cl'])
    return dict(hip=hip, lean=lean, u=u, f=f, neck=neck, shF=shF, shB=shB, head=head,
                elbowF=elbowF, handF=handF, elbowB=elbowB, handB=handB, cc=cc)


def turn(p, pt):
    """O ponto já com o giro do corpo inteiro (queda da morte), relativo aos pés."""
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
    if p['censerAt'] is not None:
        cc = [round(p['censerAt'][0] - FEET[0], 1), round(p['censerAt'][1] - FEET[1], 1)]
    else:
        cc = turn(p, k['cc'])
    return {'censer': cc, 'hand': turn(p, k['handF'])}


# ---------- incensário grande, corrente e báculo ----------
def censer_prims(cc, axis, glow, z, s=1.5):
    """Incensário de ouro: bola furada, tampa cônica e argola (o eixo aponta para a corrente)."""
    prims, decals = [], []
    side = (-axis[1], axis[0])
    body = Ellipse('censer', 'gold', z, cc, 5.0 * s, 5.0 * s, bulge=0.95)
    prims.append(body)

    def holes(x, y, cur):
        lx = ((x - cc[0]) * side[0] + (y - cc[1]) * side[1]) / s
        ly = ((x - cc[0]) * axis[0] + (y - cc[1]) * axis[1]) / s
        if abs(ly + 0.3) < 1.0 and abs(lx) < 4.2 and int((lx + 10) * 1.2) % 2 == 0:
            return ('gold', 4) if glow else ('void', 0)
        if abs(ly - 2.7) < 0.45 and abs(lx) < 4.2:
            return ('gold', 1)
        if abs(ly + 2.8) < 0.4 and abs(lx) < 3.6:
            return ('gold', 1)
        return None

    decals.append(Decal('censer', holes))
    base = add(cc, axis, 3.0 * s)
    lid = [add(base, side, -4.6 * s), add(base, side, 4.6 * s), add(add(cc, axis, 8.6 * s), side, 0.9 * s), add(add(cc, axis, 8.6 * s), side, -0.9 * s)]
    prims.append(Poly('lid', 'gold', z + 0.05, lid, nf=lambda x, y: norm((-0.35, -0.55, 0.75)), shade=0.92))
    prims.append(Ellipse('ring', 'gold', z + 0.1, add(cc, axis, 9.8 * s), 1.5 * s, 1.5 * s))
    prims.append(Ellipse('ringhole', 'void', z + 0.12, add(cc, axis, 9.8 * s), 0.6 * s, 0.6 * s))
    prims.append(Ellipse('foot', 'gold', z - 0.05, add(cc, axis, -4.8 * s), 2.6 * s, 1.4 * s, ang=math.atan2(side[1], side[0]), shade=0.8))
    return prims, decals


def chain_prims(a, b, z, sag=0.0):
    """Elos de aço da mão até a argola, com barriga quando a corrente está frouxa."""
    out = []
    L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1e-6
    n = max(2, int(L / 2.8))
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag)
    prev = a
    for i in range(1, n + 1):
        t = i / n
        x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * mid[0] + t * t * b[0]
        y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * mid[1] + t * t * b[1]
        ang = math.atan2(y - prev[1], x - prev[0])
        c = ((prev[0] + x) / 2, (prev[1] + y) / 2)
        if i % 2:
            out.append(Ellipse('link', 'steel', z, c, 1.9, 1.0, ang=ang, flat=3 if i % 4 == 1 else 2))
        else:
            out.append(Ellipse('link', 'steel', z, c, 1.5, 0.7, ang=ang, flat=1))
        prev = (x, y)
    return out


def staff_prims(bottom, top, z, shade=1.0):
    """Báculo de ouro: a haste, o nó e a volta no alto com uma moeda presa dentro."""
    prims, decals = [], []
    d = (top[0] - bottom[0], top[1] - bottom[1])
    L = math.hypot(*d) or 1.0
    d = (d[0] / L, d[1] / L)
    fw = (-d[1], d[0]) if d[1] < 0 else (d[1], -d[0])
    # a volta abre para a frente do arcebispo (+x)
    if fw[0] < 0:
        fw = (-fw[0], -fw[1])
    prims.append(Capsule('staff', 'gold', z, bottom, top, 1.25, 1.35, shade=shade * 0.95))
    prims.append(Ellipse('knob', 'gold', z + 0.05, add(top, d, -2.0), 2.4, 2.4, shade=shade))
    prims.append(Ellipse('knob', 'gold', z + 0.05, add(bottom, d, 1.2), 1.6, 1.6, shade=shade * 0.9))
    # volta: arco que sobe, passa por cima e desce na frente, terminando numa ponta enrolada
    c = add(add(top, d, 6.0), fw, 6.2)
    R = 6.4
    a0 = math.atan2(top[1] + d[1] * 6.0 - c[1], top[0] + d[0] * 6.0 - c[0])
    prev = None
    for i in range(13):
        t = i / 12
        a = a0 + t * 4.4 * (1 if fw[0] > 0 else -1)
        r = R * (1 - 0.42 * t ** 1.6)
        q = (c[0] + math.cos(a) * r, c[1] + math.sin(a) * r)
        if prev is not None:
            prims.append(Capsule('crook', 'gold', z + 0.02, prev, q, 1.4 - 0.5 * t, 1.3 - 0.5 * t, shade=shade))
        prev = q
    coin = Ellipse('coin', 'gold', z + 0.04, c, 3.2, 3.2, bulge=0.3, shade=shade)
    prims.append(coin)

    def coin_ring(x, y, cur):
        r = math.hypot(x - c[0], y - c[1])
        if 2.2 < r < 3.0:
            return ('gold', 1)
        if r < 1.0:
            return ('gold', 4)
        return None

    decals.append(Decal('coin', coin_ring))
    return prims, decals


# ---------- o corpo ----------
def build(pose):
    p = P(pose)
    k = skeleton(p)
    hip, u, f, neck, shF, shB, head, lean = (k[n] for n in ('hip', 'u', 'f', 'neck', 'shF', 'shB', 'head', 'lean'))
    elbowF, handF, elbowB, handB, cc = k['elbowF'], k['handF'], k['elbowB'], k['handB'], k['cc']
    prims, decals = [], []

    def at(a, b):
        q = add(add(hip, f, a), u, b)
        return (q[0], min(q[1], FLOOR))

    # ---------- túnica branca até o chão (a barra fica no chão mesmo inclinado) ----------
    hem, pool = p['hem'], p['pool']
    alb = [at(-8, 42), at(8, 42), at(13, 30), at(15, 12), at(17, -6)]
    n = 9
    x0, x1 = hip[0] + 25 + hem + pool * 10, hip[0] - 24 + hem * 0.5 - pool * 12
    for i in range(n + 1):
        t = i / n
        alb.append((x0 + (x1 - x0) * t, FLOOR - (1.4 if i % 2 else 0.0) - math.sin(math.pi * t) * 0.8))
    alb += [at(-17, -6), at(-14, 14), at(-12, 32)]

    def alb_n(x, y):
        lx = x - hip[0]
        return norm((0.45 * math.sin(lx * 0.55 + y * 0.05) + lx / 60.0 - 0.1, -0.25, 0.86))

    prims.append(Poly('alb', 'linen', 3.0, alb, nf=alb_n, shade=0.92))

    # ---------- casula roxa até os joelhos, com a faixa de ouro e as moedas bordadas ----------
    cas = [at(-10, 42), at(10, 42), at(15, 28), at(18, 6), at(21, -21), at(14, -27), at(4, -29), at(-6, -28), at(-16, -25),
           at(-21, -19), at(-17, 6), at(-14, 28)]

    def cas_n(x, y):
        lx, ly = rot((x - hip[0], y - hip[1]), -lean)
        return norm((0.32 * math.sin(lx * 0.42 - ly * 0.06) + lx / 55.0 - 0.12, -0.35 + 0.004 * ly, 0.85))

    prims.append(Poly('casula', 'vest', 3.4, cas, nf=cas_n))

    def cas_dec(x, y, cur):
        lx, ly = rot((x - hip[0], y - hip[1]), -lean)
        # barra dourada embaixo
        lo = -27.5 + abs(lx) * 0.06
        if -ly < -lo and -ly > -lo - 2.0:
            return ('gold', 2 if int(lx + 40) % 3 else 3)
        return None

    decals.append(Decal('casula', cas_dec))
    orf = [at(6.0, 41), at(8.6, 41), at(15.6, -25), at(12.4, -26.5)]
    prims.append(Poly('orphrey', 'gold', 3.45, orf, nf=lambda x, y: norm((-0.25, -0.35, 0.9)), shade=0.78))
    coins = [at(7.3 + (41 - b) * 0.112, b) for b in (33, 19, 5, -9)]

    def orf_dec(x, y, cur):
        for c in coins:
            r = math.hypot(x - c[0], y - c[1])
            if r < 1.7:
                return ('gold', 4) if r < 0.7 else ('gold', 0)
        return None

    decals.append(Decal('orphrey', orf_dec))

    # ---------- murça carmesim nos ombros ----------
    moz = [at(-10, 46), at(9, 46.5), at(15, 37), at(14, 29), at(5, 26.5), at(-6, 27), at(-14, 31), at(-15, 38)]

    def moz_n(x, y):
        lx, ly = rot((x - hip[0], y - hip[1]), -lean)
        return norm((lx / 18.0 - 0.15, -0.5 + (46 + ly) * 0.0, 0.8))

    prims.append(Poly('murca', 'cloak', 4.2, moz, nf=moz_n))

    def moz_dec(x, y, cur):
        lx, ly = rot((x - hip[0], y - hip[1]), -lean)
        # bainha de ouro e os botõezinhos na frente
        if -ly < -26.5 and -ly > -28.6 - 0.02 * abs(lx):
            return ('gold', 2)
        if abs(lx - 11.0) < 0.9 and int(-ly) % 4 == 0 and -ly < -30:
            return ('gold', 3)
        return None

    decals.append(Decal('murca', moz_dec))

    # ---------- cabeça: capuz escuro, a moeda no rosto e a mitra ----------
    tilt = math.radians(p['tilt'])
    ha = lean + tilt
    hl = lambda q: add(head, rot(q, ha))
    hloc = lambda x, y: rot((x - head[0], y - head[1]), -ha)
    prims.append(Ellipse('cowl', 'shadowcloth', 5.0, hl((0.0, 0.5)), 7.6, 8.6, ang=ha, bulge=0.85))
    prims.append(Ellipse('neckcloth', 'shadowcloth', 4.6, add(neck, u, 2.0), 6.2, 4.4, ang=lean, shade=0.8))
    mask = Ellipse('mask', 'gold', 5.35, hl((3.4, 1.2)), 5.6, 6.6, ang=ha, bulge=0.32)
    prims.append(mask)

    def mask_dec(x, y, cur):
        lx, ly = mask.local(x, y)
        r = math.hypot(lx / 5.6, ly / 6.6)
        # borda serrilhada de moeda
        if r > 0.8:
            return ('gold', 1) if int(math.degrees(math.atan2(ly, lx)) / 30) % 2 else ('gold', 2)
        # as duas fendas dos olhos
        if -2.4 < ly < -1.2 and (0.4 < lx < 3.4 or -3.2 < lx < -0.9):
            return ('gold', 4) if p['glow'] else ('void', 0)
        # risco do nariz e a boca fechada da efígie
        if abs(lx - 0.6) < 0.45 and -1.0 < ly < 1.8:
            return ('gold', 1)
        if 3.0 < ly < 3.6 and -1.4 < lx < 2.2:
            return ('gold', 1)
        return None

    decals.append(Decal('mask', mask_dec))
    if p['mitre'] is None:
        mitre_prims(prims, decals, hl, hloc, 5.15)
    else:
        mc, ma = p['mitre']
        ml = lambda q: add(mc, rot(q, ma))
        mloc = lambda x, y: rot((x - mc[0], y - mc[1]), -ma)
        mitre_prims(prims, decals, ml, mloc, 0.9)

    # ---------- braço de trás e o báculo ----------
    def arm(sh, elbow, hand, z, shade):
        prims.append(Capsule('sleeve', 'vest', z, sh, add(elbow, (hand[0] - elbow[0], hand[1] - elbow[1]), 0.25), 4.0, 5.4, shade=shade))
        prims.append(Capsule('fore', 'linen', z - 0.02, elbow, hand, 2.0, 1.8, shade=shade * 0.9))
        prims.append(Ellipse('hand', 'linen', z + 0.08, hand, 2.6, 2.4, shade=shade))

    zB = 2.0
    arm(shB, elbowB, handB, zB, 0.72)
    if p['staffAt'] is not None:
        sb, st = p['staffAt']
        sp, sd = staff_prims(sb, st, 0.7, 0.8)
    else:
        sd_ = dirv(180 - p['sa'])
        bottom = add(handB, sd_, -STAFF_LEN * p['sg'])
        top = add(handB, sd_, STAFF_LEN * (1 - p['sg']))
        sp, sd = staff_prims(bottom, top, zB - 0.3, 0.8)
    prims.extend(sp)
    decals.extend(sd)

    # ---------- incensário: atrás quando ergue para trás, na frente no resto ----------
    if not p['noCenser']:
        back = cc[0] < hip[0] - 6 and p['censerAt'] is None
        zc = 2.4 if back else 6.6
        if p['censerAt'] is not None:
            axis = (0.0, -1.0)
        else:
            axis = (handF[0] - cc[0], handF[1] - cc[1])
            al = math.hypot(*axis) or 1.0
            axis = (axis[0] / al, axis[1] / al)
        ring = add(cc, axis, 9.8 * 1.5)
        sag = 10.0 if p['censerAt'] is not None else 0.0
        # caído de vez, a mão já soltou a corrente
        if p['mitre'] is None:
            prims.extend(chain_prims(handF, ring, zc - 0.1, sag))
        cp, cd = censer_prims(cc, axis, p['glow'], zc)
        prims.extend(cp)
        decals.extend(cd)

    # ---------- braço da frente ----------
    arm(shF, elbowF, handF, 6.0, 1.0)

    pivot = p['pivot'] or FEET
    if p['rot']:
        # o que já caiu no chão não gira com o corpo
        loose = set()
        if p['censerAt'] is not None:
            loose |= {'censer', 'lid', 'ring', 'ringhole', 'foot', 'link'}
        if p['staffAt'] is not None:
            loose |= {'staff', 'knob', 'crook', 'coin'}
        if p['mitre'] is not None:
            loose |= {'mitre', 'lappet'}
        keep = [q for q in prims if q.name in loose]
        body = [q for q in prims if q.name not in loose]
        kd = [d for d in decals if d.clip in loose]
        bd = [d for d in decals if d.clip not in loose]
        rb, rd = rotate_all(body, bd, pivot, p['rot'], p['off'])
        return rb + keep, rd + kd
    return prims, decals


def mitre_prims(prims, decals, hl, hloc, z):
    """Mitra alta de linho, com a faixa de ouro no meio, a moeda na frente e as fitas atrás."""
    pts = [hl((-6.8, -5.0)), hl((7.6, -5.0)), hl((7.4, -13.0)), hl((5.4, -22.0)), hl((1.6, -31.0)), hl((-0.6, -26.5)),
           hl((-4.6, -20.5)), hl((-7.2, -12.0))]

    def mn(x, y):
        lx, ly = hloc(x, y)
        return norm((0.1 * lx - 0.25, -0.35, 0.85))

    prims.append(Poly('mitre', 'linen', z, pts, nf=mn))

    def mdec(x, y, cur):
        lx, ly = hloc(x, y)
        if -8.2 < ly < -5.0:
            return ('gold', 2 if int(lx + 20) % 3 else 3)
        if abs(lx - 0.7 + (ly + 8) * 0.06) < 1.1 and ly < -8:
            return ('gold', 2)
        cxy = (0.6, -16.5)
        r = math.hypot(lx - cxy[0], ly - cxy[1])
        if r < 2.4:
            return ('gold', 4) if r < 1.0 else ('gold', 3)
        return None

    decals.append(Decal('mitre', mdec))
    prims.append(Capsule('lappet', 'vest', z - 0.4, hl((-5.6, -5.5)), hl((-9.0, 9.0)), 1.4, 1.6, shade=0.8))
    prims.append(Capsule('lappet', 'vest', z - 0.45, hl((-3.6, -5.5)), hl((-6.6, 11.0)), 1.3, 1.5, shade=0.7))


# ---------- animações ----------
def idle():
    out = []
    for i, b in enumerate((0.0, 0.6, 1.2, 0.6)):
        out.append(dict(hip=(0, b), armF=(30, 40 - b * 2), ca=(-6, 2, 8, 2)[i], hem=(0, 0.6, 1.0, 0.4)[i], sa=-4 + b, armB=(-46, 26 - b)))
    return out


def walk(n=6):
    # desliza: a barra ondula e o incensário balança, mas o corpo quase não sobe nem desce
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        s = math.sin(ph)
        c = math.cos(ph)
        out.append(dict(hip=(0, -0.6 * c + 0.4), lean=5, hem=2.8 * s + 1.0, armF=(34 + 3 * s, 38), ca=-16 * c - 4,
                        armB=(-46 + 4 * s, 26), sa=-2 + 2 * s))
    return out


def swing_windup():
    # o incensário sobe por trás da cabeça; a moeda do rosto acende
    return [
        dict(armF=(196, -14), ca=232, cl=37, lean=-8, hip=(-2, 1), hem=-1.5, glow=True, tilt=-6, armB=(-40, 30), sa=-4),
        dict(armF=(206, -18), ca=250, cl=38, lean=-12, hip=(-3, 1.5), hem=-2.5, glow=True, tilt=-10, armB=(-44, 30), sa=-8),
    ]


def swing():
    return [
        dict(armF=(168, 0), ca=160, cl=38, lean=2, hip=(2, 1), hem=1.0, glow=True, armB=(-30, 30)),
        dict(armF=(116, -4), ca=108, cl=39, lean=12, hip=(4, 2), hem=3.0, glow=True, armB=(-24, 34), sa=8),
        dict(armF=(78, 2), ca=62, cl=39, lean=19, hip=(5, 3), hem=3.5, glow=True, armB=(-20, 36), sa=12),
    ]


def swing_recover():
    return [
        dict(armF=(64, 12), censerAt=(194.0, FLOOR - 7.5), lean=22, hip=(5, 4), hem=3.0, armB=(-18, 36), sa=14),
        dict(armF=(52, 22), censerAt=(186.0, FLOOR - 7.5), lean=14, hip=(3, 3), hem=1.5, armB=(-22, 34), sa=10),
    ]


def toss_windup():
    # o incensário roda baixo ao lado do corpo antes de ser lançado rente ao chão
    return [
        dict(armF=(-36, 40), ca=-70, cl=36, lean=6, hip=(-2, 2), hem=-1.0, glow=True, armB=(-20, 30), tilt=4),
        dict(armF=(-48, 44), ca=-104, cl=36, lean=10, hip=(-3, 3), hem=-2.0, glow=True, armB=(-16, 30), tilt=6),
    ]


def toss():
    # braço estendido: o incensário voa sozinho (o jogo desenha ele e a corrente)
    return [
        dict(armF=(86, -6), noCenser=True, lean=16, hip=(4, 2), hem=3.0, glow=True, armB=(-24, 32), sa=10),
        dict(armF=(80, 0), noCenser=True, lean=10, hip=(2, 1), hem=1.5, glow=True, armB=(-26, 30), sa=6),
    ]


def tithe():
    # ergue o báculo: o dízimo cai do teto
    return [
        dict(armB=(150, 14), sg=0.3, sa=12, armF=(120, 30), ca=40, cl=34, lean=-6, tilt=-14, hip=(0, 0), glow=True, hem=-0.5),
        dict(armB=(156, 12), sg=0.3, sa=14, armF=(126, 30), ca=58, cl=34, lean=-8, tilt=-18, hip=(0, -0.5), glow=True, hem=0.5),
    ]


def stagger():
    return [
        dict(armF=(170, -40), ca=232, cl=34, lean=-16, hip=(-4, 2), tilt=-18, hem=-3, armB=(-60, 20), sa=-14),
        dict(armF=(150, -46), ca=250, cl=34, lean=-12, hip=(-3, 1.5), tilt=-10, hem=-2, armB=(-56, 24), sa=-10),
    ]


def hurt():
    return [dict(lean=-9, hip=(-3, 1), armF=(60, 30), ca=-30, tilt=-12, hem=-1.5, armB=(-36, 30), sa=-6)]


def kneel():
    # ajoelhado diante do altar, de costas para quem entra; o incensário descansa no chão
    out = []
    for b in (0.0, 0.8):
        out.append(dict(hip=(2, 30 + b), lean=16, tilt=22, pool=1.0, armF=(70, 60), armB=(70, 40), sg=0.55, sa=2,
                        censerAt=(150.0, FLOOR - 7.5), hem=1.0))
    return out


def rise():
    return [
        dict(hip=(1, 22), lean=12, tilt=14, pool=0.7, armF=(60, 50), armB=(56, 40), sg=0.5, sa=3, ca=10, cl=30, hem=0.5),
        dict(hip=(0, 10), lean=6, tilt=4, pool=0.3, armF=(44, 44), armB=(10, 34), sg=0.5, sa=4, ca=4, cl=34),
        dict(hip=(0, 1), lean=0, tilt=-2, armF=(32, 40), armB=(-20, 30), sa=4, ca=-2, glow=True),
    ]


def roar():
    # braços abertos, báculo no alto: a conta vai começar
    return [
        dict(armB=(160, 10), sg=0.32, sa=18, armF=(140, 20), ca=120, cl=34, lean=-10, tilt=-20, hip=(-1, 0), glow=True, hem=-1),
        dict(armB=(166, 8), sg=0.32, sa=22, armF=(146, 22), ca=132, cl=34, lean=-13, tilt=-24, hip=(-2, -0.5), glow=True, hem=1),
    ]


def death():
    # cai de joelhos, a mitra rola para a frente e ele tomba de costas, com a moeda virada para cima
    piv = (104.0, 210.0)
    staff_floor = ((112.0, FLOOR - 1.5), (198.0, FLOOR - 2.0))
    censer_floor = (214.0, FLOOR - 7.5)
    mitre_floor = ((156.0, FLOOR - 7.0), math.radians(100))
    return [
        dict(lean=-12, hip=(-3, 2), tilt=-16, armF=(70, 30), ca=-40, armB=(-50, 30), sa=-12, hem=-2, glow=True),
        dict(hip=(2, 26), lean=6, tilt=-6, pool=0.7, armF=(20, 10), ca=0, cl=30, armB=(-10, 20), sa=-20, hem=1),
        dict(hip=(2, 30), lean=-8, tilt=-30, pool=1.0, armF=(10, 0), censerAt=censer_floor, armB=(-20, 10), staffAt=staff_floor,
             mitre=mitre_floor),
        dict(rot=-34, pivot=piv, off=(4, -2), hip=(2, 30), lean=-8, tilt=-30, pool=1.0, armF=(40, 10), censerAt=censer_floor, armB=(-30, 0),
             staffAt=staff_floor, mitre=mitre_floor),
        dict(rot=-80, pivot=piv, off=(14, -8), hip=(2, 30), lean=-8, tilt=-24, pool=1.0, armF=(70, 0), censerAt=censer_floor, armB=(-10, 0),
             staffAt=staff_floor, mitre=mitre_floor),
    ]


ANIMS = {
    'idle': (idle(), 5, True),
    'walk': (walk(), 7, True),
    'swingwind': (swing_windup(), 4, False),
    'swing': (swing(), 14, False),
    'swingrec': (swing_recover(), 4, False),
    'tosswind': (toss_windup(), 5, False),
    'toss': (toss(), 6, False),
    'tithe': (tithe(), 3, True),
    'stagger': (stagger(), 5, False),
    'hurt': (hurt(), 10, False),
    'kneel': (kneel(), 2, True),
    'rise': (rise(), 5, False),
    'roar': (roar(), 5, True),
    'death': (death(), 5, False),
    # o corpo caído depois que o incensário sai do chão (vira a arma do cavaleiro)
    'corpse': ([dict(death()[-1], noCenser=True)], 1, False),
}


def render_one(job):
    name, i, pose = job
    prims, decals = build(pose)
    px, _ = render(prims, decals, W, H)
    return name, i, to_image(px, W, H).tobytes()


def censer_alone(out):
    """O incensário sozinho (o jogo usa no arremesso): 32x40, a argola em cima."""
    prims, decals = censer_prims((16.0, 22.0), (0.0, -1.0), True, 1.0)
    px, _ = render(prims, decals, 32, 40)
    to_image(px, 32, 40).save(f'{out}/arcebispo-censer.png')


def main(out, only):
    anims = {k: v for k, v in ANIMS.items() if not only or k in only}
    jobs = [(name, i, pose) for name, (poses, _, _) in anims.items() for i, pose in enumerate(poses)]
    with Pool(4) as pool:
        res = pool.map(render_one, jobs, chunksize=1)
    frames = {(name, i): Image.frombytes('RGBA', (W, H), data) for name, i, data in res}
    cols = max(len(f) for f, _, _ in anims.values())
    sheet = Image.new('RGBA', (cols * W, len(anims) * H), (0, 0, 0, 0))
    meta = {'frameWidth': W, 'frameHeight': H, 'originX': FEET[0] / W, 'originY': FEET[1] / H, 'columns': cols, 'anims': {}, 'points': {}}
    for row, (name, (poses, fps, loop)) in enumerate(anims.items()):
        for i in range(len(poses)):
            sheet.alpha_composite(frames[(name, i)], (i * W, row * H))
        meta['anims'][name] = {'start': row * cols, 'count': len(poses), 'fps': fps, 'loop': loop}
        meta['points'][name] = [points(pose) for pose in poses]
    prev = Image.new('RGBA', sheet.size, (24, 28, 42, 255))
    prev.alpha_composite(sheet)
    prev.save('arcebispo_preview.png')
    if not only:
        sheet.save(f'{out}/arcebispo.png', optimize=True)
        json.dump(meta, open(f'{out}/arcebispo.json', 'w'), indent=1)
        censer_alone(out)
    print('arcebispo', sheet.size)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.', sys.argv[2:])

"""Truta de Âmbar (Vale das Cachoeiras): truta de rio grande, o dorso verde-oliva escuro com pintas
pretas, a barriga clara e rosada e, nas escamas do flanco, cristais de Âmbar que cresceram nela (o
Âmbar das minas desceu o rio). Os cristais e o olho brilham no escuro da água.

O peixe olha para a direita (+x). FEET é o meio do corpo: o jogo gira o desenho pela velocidade no
salto, em volta desse ponto.

uso: python3 ink_sheets.py <pasta_assets> trout
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm
from rig import rotate_all

puppet.RAMPS['troutback'] = [0x121a0c, 0x223018, 0x384a26, 0x536838, 0x768d52]
puppet.RAMPS['troutbelly'] = [0x5e4c46, 0x8e7568, 0xbea08c, 0xe2c9b2, 0xf9ecdc]
puppet.RAMPS['troutfin'] = [0x1c1a14, 0x343024, 0x524a36, 0x76694c, 0x9c8c68]
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
puppet.SHINY.setdefault('amber', (0.7, 16))
puppet.SHINY['troutbelly'] = (0.3, 10)
puppet.RIM_MATS |= {'troutback', 'troutfin'}

W, H = 52, 32
CENTER = (26.0, 16.0)
FEET = (26, 16)
# do pé do rabo (x0) até o focinho (x1), no corpo parado
X0, X1 = CENTER[0] - 14.5, CENTER[0] + 15.0


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def dv(deg):
    a = math.radians(deg)
    return (math.cos(a), math.sin(a))


def build(pose):
    """pose: tail (graus do rabo, + para baixo), bend (curva do corpo: + arqueia o dorso), gape (boca
    aberta 0..1), glow (os cristais acesos), fins (barbatanas abertas 0..1)."""
    prims, decals = [], []
    cx, cy = CENTER
    tail_a = pose.get('tail', 0.0)
    bend = pose.get('bend', 0.0)
    gape = pose.get('gape', 0.0)
    glow = pose.get('glow', False)
    fins = pose.get('fins', 0.6)
    L = X1 - X0

    # a espinha: do rabo ao focinho; a curva do corpo e a batida do rabo entortam a parte de trás
    def spine(t):
        x = X0 + L * t
        y = cy - bend * 4.0 * t * (1 - t) * 1.6 + math.sin(math.radians(tail_a)) * 4.2 * max(0.0, 0.45 - t) ** 1.3 * 2.2
        return (x, y)

    def half(t):
        # meia altura do corpo: fino no rabo, mais alto no meio, afinando no focinho
        return 0.9 + 3.9 * math.sin(math.pi * min(1.0, t ** 0.72)) ** 0.85 * (1.0 - 0.12 * t)
    n = 26
    top, bot = [], []
    for i in range(n + 1):
        t = i / n
        p = spine(t)
        h = half(t)
        top.append((p[0], p[1] - h * 1.02))
        bot.append((p[0], p[1] + h * 0.94))
    body_pts = top + bot[::-1]

    def body_n(x, y):
        t = min(1.0, max(0.0, (x - X0) / L))
        p = spine(t)
        h = max(0.6, half(t))
        v = max(-1.0, min(1.0, (y - p[1]) / h))
        return norm((0.25 * (t - 0.5), v * 0.85, math.sqrt(max(0.05, 1 - v * v))))
    # o rabo em forquilha, preso no pé do corpo e virado pela batida
    tb = add(spine(0.0), (1.2, 0))
    ta = 180 + tail_a
    back = dv(ta)
    perp = dv(ta + 90)
    lobe_up = add(add(tb, back, 7.4), perp, -4.8)
    lobe_dn = add(add(tb, back, 7.4), perp, 4.8)
    notch = add(tb, back, 5.4)
    prims.append(Poly('tail', 'troutfin', 1.0, [add(tb, perp, -1.3), add(add(tb, back, 3.6), perp, -3.2), lobe_up, add(lobe_up, back, -0.6),
                                                  notch, add(lobe_dn, back, -0.6), lobe_dn, add(add(tb, back, 3.6), perp, 3.2), add(tb, perp, 1.3)],
                      nf=lambda x, y: norm((-0.3, 0.0, 0.9)), shade=0.9))

    def rays(x, y, cur):
        # os raios da barbatana do rabo, mais escuros
        d = math.hypot(x - tb[0], y - tb[1])
        a = math.atan2(y - tb[1], x - tb[0])
        return ('troutfin', 1) if d > 2.0 and math.sin(a * 22.0) > 0.55 else None
    decals.append(Decal('tail', rays))
    # a barbatana de cima (dorsal) e a pequena de trás (adiposa); embaixo, a anal e a pélvica
    d0 = spine(0.52)
    hd = half(0.52)
    dors = add(d0, (0, -hd + 0.4))
    prims.append(Poly('dorsal', 'troutfin', 1.05, [add(dors, (-3.6, 0.6)), add(dors, (-2.2, -2.8 * fins - 1.0)), add(dors, (1.0, -2.4 * fins - 0.8)), add(dors, (2.2, 0.6))],
                      nf=lambda x, y: norm((0.0, -0.4, 0.9)), shade=0.85))
    a0 = spine(0.2)
    prims.append(Ellipse('adipose', 'troutfin', 1.05, add(a0, (0, -half(0.2) - 0.6)), 1.4, 1.0, shade=0.8))
    an = spine(0.26)
    anal = add(an, (0, half(0.26) - 0.4))
    prims.append(Poly('anal', 'troutfin', 1.05, [add(anal, (-2.6, 0)), add(anal, (-1.6, 3.4 * fins + 0.8)), add(anal, (1.8, 2.6 * fins + 0.6)), add(anal, (2.2, 0))],
                      nf=lambda x, y: norm((0.0, 0.4, 0.9)), shade=0.8))
    pv = spine(0.46)
    pelv = add(pv, (0, half(0.46) - 0.6))
    prims.append(Poly('pelvic', 'troutfin', 1.05, [add(pelv, (-1.6, 0)), add(pelv, (-2.8, 2.8 * fins + 0.6)), add(pelv, (1.2, 0.2))],
                      nf=lambda x, y: norm((0.0, 0.4, 0.9)), shade=0.75))
    body = Poly('body', 'troutback', 2.0, body_pts, nf=body_n)
    prims.append(body)

    def skin(x, y, cur):
        t = min(1.0, max(0.0, (x - X0) / L))
        p = spine(t)
        h = max(0.6, half(t))
        v = (y - p[1]) / h
        # a barriga clara embaixo da linha do meio, com a faixa rosada da truta
        if v > 0.22:
            return ('troutbelly', 3 if v > 0.55 else 2)
        if -0.05 < v <= 0.22 and t > 0.12:
            return ('troutbelly', 1)
        # as pintas pretas do dorso
        k = math.sin(x * 1.9 + y * 0.7) * math.sin(x * 0.8 - y * 1.7)
        if v < -0.1 and k > 0.72:
            return ('troutback', 0)
        # as escamas: um xadrez de losangos bem fraco
        if v < 0.2 and (int(x * 1.1 + y * 0.9) + int(x * 1.1 - y * 0.9)) % 2 == 0 and t < 0.86:
            return ('troutback', 2)
        return None
    decals.append(Decal('body', skin))
    # a cabeça: o opérculo (a tampa da guelra) e o olho
    hc = spine(0.8)
    op = Ellipse('gill', 'troutback', 2.1, add(hc, (-0.6, 0.6)), 3.4, half(0.8) * 0.85, bulge=0.6, shade=0.92)
    prims.append(op)

    def gill(x, y, cur):
        lx, ly = op.local(x, y)
        # a borda do opérculo, uma curva escura atrás da cabeça
        if abs(math.hypot(lx / 3.4, ly / max(1.0, half(0.8) * 0.85)) - 0.92) < 0.12 and lx < 0:
            return ('troutback', 0)
        if ly > 0.6:
            return ('troutbelly', 2)
        return None
    decals.append(Decal('gill', gill))
    eye_c = add(spine(0.9), (0.4, -1.4))
    prims.append(Ellipse('eye', 'amber', 2.3, eye_c, 1.35, 1.3, shade=1.2 if glow else 0.95))
    prims.append(Ellipse('pupil', 'void', 2.35, add(eye_c, (0.35, 0.0)), 0.62, 0.66, flat=0))
    # a boca: o canto da boca e, aberta, a mandíbula descendo
    m0 = spine(0.99)
    if gape > 0.05:
        prims.append(Poly('mouth', 'void', 2.4, [add(m0, (-3.4, 0.6)), add(m0, (1.4, -0.6)), add(m0, (0.6, 1.2 + gape * 2.4)), add(m0, (-2.4, 1.6))], flat=0))
        prims.append(Capsule('jaw', 'troutbelly', 2.45, add(m0, (-3.0, 1.8 + gape * 1.2)), add(m0, (0.8, 1.6 + gape * 2.2)), 0.8, 0.6, shade=0.9))
    else:
        prims.append(Capsule('lip', 'void', 2.4, add(m0, (-3.2, 0.9)), add(m0, (0.4, 0.4)), 0.32, 0.28, flat=1))
    # a barbatana do peito, logo atrás da guelra
    pc = add(spine(0.68), (0, half(0.68) * 0.4))
    prims.append(Poly('pectoral', 'troutfin', 2.5, [add(pc, (0.6, -0.6)), add(pc, (-4.0 - 1.4 * fins, 2.4 + 1.4 * fins)), add(pc, (-1.4, 3.0)), add(pc, (1.2, 0.6))],
                      nf=lambda x, y: norm((-0.2, 0.3, 0.9)), shade=0.95))
    # os cristais de Âmbar que cresceram nas escamas do flanco: lascas finas em tufos, saindo para cima
    # e para trás (a água penteou)
    for (t, v, shards) in ((0.36, -0.5, ((2.8, -128), (2.0, -150))), (0.5, -0.62, ((3.4, -122), (2.4, -142), (1.6, -104))),
                           (0.63, -0.42, ((2.2, -132),))):
        p = spine(t)
        base = (p[0], p[1] + v * half(t))
        for ln, ang in shards:
            tip = add(base, dv(ang), ln)
            side = dv(ang + 90)
            prims.append(Poly('crystal', 'amber', 2.6, [add(base, side, 0.75), add(tip, side, 0.15), tip, add(tip, side, -0.15), add(base, side, -0.75)],
                              nf=lambda x, y, a=ang: norm((math.cos(math.radians(a + 60)) * 0.6, -0.5, 0.75)), shade=1.25 if glow else 1.05))
    return rotate_all(prims, decals, CENTER, pose.get('rot', 0.0), pose.get('off', (0.0, 0.0)))


SWIM = [dict(tail=t, bend=b) for t, b in ((-16, 0.05), (-4, 0.0), (14, -0.05), (4, 0.0))]
ANIMS = {
    # embaixo d'água, devagar: o rabo bate de um lado para o outro
    'swim': (SWIM, 7, True),
    # o salto: o dorso arqueado, a boca abrindo, as barbatanas abertas e os cristais acesos
    'leap': ([dict(tail=-22, bend=0.55, gape=0.6, glow=True, fins=1.0), dict(tail=18, bend=0.6, gape=0.9, glow=True, fins=1.0),
              dict(tail=-12, bend=0.5, gape=0.7, glow=True, fins=0.9)], 10, True),
    'hurt': ([dict(tail=30, bend=-0.6, gape=1.0, fins=1.0)], 10, False),
    # morta: vira de barriga para cima e afunda
    'death': ([dict(tail=24, bend=-0.4, gape=1.0, rot=60), dict(tail=10, bend=-0.2, gape=0.8, rot=130), dict(tail=0, bend=0.0, gape=0.6, rot=180)], 8, False),
}

"""Objetos das Minas Abandonadas no traço liso (ink.py).

Os cristais de Âmbar Mnêmico nascem da rocha (o jogo vira cada um para o lado da pedra) e acendem
a mina; as lamparinas dos mineiros ficam penduradas pelo gancho; o vagonete anda nos trilhos com as
rodas girando; as prensas da Casa Vhalor ficam em pé no chão, com a barra de bolas que gira o
fuso e a chapa que desce; as escoras de madeira seguram o teto dos túneis baixos; os registros são
o livro aberto em cima de um caixote; o bloco de Âmbar tapa passagens e só a Picareta quebra.

Cada função devolve (prims, decals, W, H, luzes) em pixels do mundo; as luzes (x, y, cor) ficam em
relação ao canto da imagem. Origens que o jogo usa: cristais, caixote, prensa e entulho pelo meio de
baixo; lamparina pelo gancho; chapa da prensa pelo meio de cima; o resto pelo meio.

uso: python3 mine_props.py <pasta_assets> [nomes...] [--preview=<pasta>]
"""
import json
import math
import os
import random
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm

puppet.RAMPS['iron'] = [0x101218, 0x1d2029, 0x30343f, 0x4b505e, 0x737a8b]
puppet.RAMPS['rust'] = [0x1a1311, 0x302220, 0x4a3329, 0x684834, 0x8a6446]
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
puppet.RAMPS['minerock'] = [0x110d0b, 0x221b17, 0x372c25, 0x514338, 0x716050]
puppet.RAMPS['oldwood'] = [0x1a110b, 0x2e1f14, 0x46301e, 0x634529, 0x84603a]
puppet.RAMPS['paper'] = [0x3a3226, 0x6a5c46, 0x9c8b6c, 0xc9b892, 0xece0be]
# o Âmbar polido do espelho: fundo e escuro, quase cor de chá
puppet.RAMPS['amberglass'] = [0x170a04, 0x261107, 0x3a1b0a, 0x55290f, 0x7a3e17]
puppet.RAMPS['lamp'] = [0x6a2e08, 0xb05a14, 0xf09a3a, 0xffd27a, 0xfff6dc]
puppet.SHINY.setdefault('iron', (0.45, 12))
puppet.SHINY.setdefault('amber', (0.7, 16))
puppet.RIM_MATS |= {'iron', 'rust', 'minerock', 'oldwood'}

AMBER = 0xffa63c
LAMP = 0xffb35a


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def dv(deg):
    a = math.radians(deg)
    return (math.cos(a), math.sin(a))


def const(n):
    n = norm(n)
    return lambda x, y: n


def rod(x0, y0, x1, y1, w):
    """Barra de ponta quadrada com normal de cilindro (repete sem emenda)."""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1.0
    sx, sy = -dy / L * w, dx / L * w
    pts = [(x0 + sx, y0 + sy), (x1 + sx, y1 + sy), (x1 - sx, y1 - sy), (x0 - sx, y0 - sy)]

    def nf(x, y):
        t = ((np.asarray(x, np.float32) - x0) * -dy / L + (np.asarray(y, np.float32) - y0) * dx / L) / w
        t = np.clip(t, -1.0, 1.0)
        return (t * -dy / L, t * dx / L, np.sqrt(np.maximum(0.0, 1 - t * t)) + 0.15)

    return pts, nf


# ---------------------------------------------------------------- cristais
def prism(P, base, ang, L, w, z, tipk=1.3, bright=1.0):
    """Cristal de seis lados visto de lado: três faces (a da esquerda pega a luz) que se juntam na
    ponta, o miolo aceso perto da raiz e o fio de luz na aresta."""
    d = dv(ang)
    n = (-d[1], d[0])
    tip = add(base, d, L)
    sh = add(base, d, L - w * tipk)
    k = 0.38
    faces = (
        ([add(base, n, -w), add(base, n, -w * k), add(sh, n, -w * k), tip, add(sh, n, -w)], (-n[0] * 0.75 - 0.2, -n[1] * 0.75 - 0.35, 0.6), 1.08),
        ([add(base, n, -w * k), add(base, n, w * k), add(sh, n, w * k), tip, add(sh, n, -w * k)], (d[0] * 0.15, d[1] * 0.15 - 0.2, 0.95), 1.0),
        ([add(base, n, w * k), add(base, n, w), add(sh, n, w), tip, add(sh, n, w * k)], (n[0] * 0.8, n[1] * 0.8 + 0.2, 0.55), 0.8),
    )
    for pts, nn, sh_ in faces:
        P.append(Poly('xface', 'amber', z, pts, nf=const(nn), shade=sh_ * bright))
    # o miolo que brilha sozinho e o fio de luz na aresta da esquerda
    P.append(Capsule('xcore', 'amber', z + 0.004, add(base, d, L * 0.12), add(base, d, L * 0.55), w * 0.42, w * 0.22, flat=3))
    P.append(Capsule('xedge', 'amber', z + 0.006, add(add(base, n, -w * k), d, L * 0.08), add(add(sh, n, -w * k), d, -0.2), 0.32, 0.26, flat=4))
    return tip


def crystal(seed, W, H, n, spread, lmax):
    rnd = random.Random(seed)
    cx = W / 2
    P = []
    roots = []
    for i in range(n):
        t = (i + 0.5) / n
        a = -90 + (t - 0.5) * 2 * spread + rnd.uniform(-8, 8)
        L = lmax * (1.0 - abs(t - 0.5) * 0.9) * rnd.uniform(0.75, 1.05)
        w = max(1.4, L * rnd.uniform(0.16, 0.22))
        bx = cx + (t - 0.5) * W * 0.5 + rnd.uniform(-1.2, 1.2)
        z = 1.0 + (1.0 - abs(t - 0.5)) * 0.4 + rnd.uniform(0, 0.05)
        roots.append((bx, z))
        prism(P, (bx, H - 1.6), a, L, w, z)
    # a rocha de onde ele nasce: pedras escuras na raiz, por cima das raízes dos cristais
    for i in range(5 if W > 20 else 3):
        x = cx + (i / max(1, (4 if W > 20 else 2)) - 0.5) * W * 0.62 + rnd.uniform(-1, 1)
        rx = rnd.uniform(2.6, 4.2) * (W / 26) ** 0.5
        P.append(Ellipse('xrock', 'minerock', 2.2 + i * 0.01, (x, H - 1.0), rx, rx * 0.55, ang=rnd.uniform(-0.3, 0.3)))
    P.append(Ellipse('xbed', 'minerock', 2.3, (cx, H - 0.2), W * 0.42, 1.2, flat=1))
    return P, [], W, H, [(cx, H * 0.45, AMBER)]


# ---------------------------------------------------------------- lamparina
def lamp():
    """Lamparina de mineiro: alça de arame com o gancho, chapéu de ferro, globo de vidro com a
    chama, três arames de proteção e o tanque de óleo embaixo. A origem é o gancho."""
    W, H = 14, 24
    cx = 7.0
    P = []
    P.append(Ellipse('hook', 'iron', 1.0, (cx, 1.5), 1.3, 1.3))
    P.append(Ellipse('hookin', 'void', 1.01, (cx, 1.5), 0.5, 0.5, flat=0))
    prev = None
    for i in range(9):
        a = math.pi + math.pi * i / 8
        q = (cx + math.cos(a) * 5.0, 7.4 + math.sin(a) * 4.6)
        if prev:
            P.append(Capsule('bail', 'iron', 1.02, prev, q, 0.36, 0.36))
        prev = q
    P.append(Poly('cap', 'iron', 1.1, [(cx - 1.4, 4.8), (cx + 1.4, 4.8), (cx + 4.4, 7.6), (cx + 4.4, 8.4), (cx - 4.4, 8.4), (cx - 4.4, 7.6)],
                  nf=lambda x, y: (np.clip((np.asarray(x, np.float32) - cx) / 6, -0.6, 0.6), -0.5 + 0 * np.asarray(y, np.float32), 0.8), shade=1.05))
    P.append(Ellipse('glass', 'lamp', 0.6, (cx, 12.6), 4.0, 4.4, flat=1))
    P.append(Ellipse('halo', 'lamp', 0.7, (cx, 12.8), 3.0, 3.4, flat=2))
    P.append(Ellipse('flame', 'lamp', 0.8, (cx, 13.0), 1.5, 2.6, flat=3))
    P.append(Ellipse('core', 'lamp', 0.81, (cx, 13.8), 0.9, 1.4, flat=4))
    for x in (cx - 3.4, cx, cx + 3.4):
        bend = 0.6 if x != cx else 0.0
        P.append(Capsule('guard', 'iron', 1.2, (x + (bend if x < cx else -bend), 8.6), (x - (bend if x < cx else -bend) * 0.0, 16.4), 0.34, 0.34))
    P.append(Capsule('band', 'iron', 1.21, (cx - 4.2, 12.6), (cx + 4.2, 12.6), 0.36, 0.36))
    P.append(Capsule('collar', 'iron', 1.25, (cx - 4.6, 17.0), (cx + 4.6, 17.0), 0.8, 0.8, shade=1.08))
    P.append(Ellipse('tank', 'rust', 1.22, (cx, 19.6), 5.0, 2.6))
    P.append(Ellipse('drop', 'iron', 1.23, (cx, 22.4), 1.0, 1.0))
    return P, [], W, H, [(cx, 12.8, LAMP)]


# ---------------------------------------------------------------- vagonete
CART_W, CART_H = 44, 26
CART_AXLES = ((11.0, 21.0), (33.0, 21.0))


def cart():
    """Caixa de tábuas com cintas de ferro, aro de ferro em cima, chassi e mancais; cheia de pedra
    com lascas de Âmbar (as rodas são outra imagem, para girar)."""
    W, H = CART_W, CART_H
    P = []
    # a carga: cascalho e lascas de Âmbar por cima da borda
    rnd = random.Random(4)
    for i in range(9):
        x = 5 + i * 4.2 + rnd.uniform(-1, 1)
        r = rnd.uniform(2.8, 4.0)
        P.append(Ellipse('load', 'minerock', 0.5 + i * 0.01, (x, 3.6 - rnd.uniform(0, 1.6)), r, r * 0.7, ang=rnd.uniform(-0.5, 0.5), shade=1.25))
    for (x, a, L) in ((12, -100, 6.0), (27, -76, 7.0), (33, -110, 4.4)):
        prism(P, (x, 5.4), a, L, L * 0.2, 0.7)
    box = [(1.0, 4.0), (43.0, 4.0), (39.0, 19.0), (5.0, 19.0)]
    P.append(Poly('box', 'oldwood', 1.0, box, nf=const((0.0, -0.15, 1.0))))

    def planks(x, y, cur):
        # tábuas deitadas e a fresta entre elas
        if abs(((y - 4.0) % 5.0) - 5.0) < 0.5 or ((y - 4.0) % 5.0) < 0.35:
            return ('oldwood', 0)
        if int(x * 1.7 + y * 0.3) % 9 == 0 and int(y) % 5 == 2:
            return ('oldwood', 1)
        return None
    for (xa, xb) in ((5.6, 8.6), (35.4, 38.4)):
        P.append(Poly('strap', 'iron', 1.1, [(xa - 1.2, 3.4), (xb - 1.2, 3.4), (xb + 0.2, 19.4), (xa + 0.2, 19.4)] if xa < 20 else
                      [(xa + 1.2, 3.4), (xb + 1.2, 3.4), (xb - 0.2, 19.4), (xa - 0.2, 19.4)], nf=const((0.0, 0.0, 1.0)), shade=0.95))
    P.append(Poly('strapm', 'iron', 1.1, [(20.6, 3.4), (23.4, 3.4), (23.4, 19.4), (20.6, 19.4)], nf=const((0.0, 0.0, 1.0)), shade=0.9))
    pts, nf = rod(0.4, 3.8, 43.6, 3.8, 1.3)
    P.append(Poly('rim', 'iron', 1.2, pts, nf=nf, shade=1.1))
    pts, nf = rod(4.0, 19.8, 40.0, 19.8, 1.5)
    P.append(Poly('chassis', 'iron', 1.15, pts, nf=nf))
    for (x, y) in CART_AXLES:
        P.append(Ellipse('bearing', 'iron', 1.3, (x, y), 2.6, 2.6))
        P.append(Ellipse('bearing2', 'iron', 1.31, (x, y), 1.0, 1.0, flat=1))
    # engates nas duas pontas
    for x0, x1 in ((3.6, 0.4), (40.4, 43.6)):
        P.append(Capsule('hitch', 'iron', 1.25, (x0, 15.0), (x1, 15.0), 0.8, 0.8))

    def rivets(x, y, cur):
        for xs in (7.1, 22.0, 36.9):
            for ys in (6.0, 11.0, 16.0):
                if (x - xs) ** 2 + (y - ys) ** 2 < 0.45:
                    return ('iron', 4)
        return None
    return P, [Decal('box', planks), Decal('strap', rivets), Decal('strapm', rivets)], W, H, [(27.0, 3.0, AMBER)]


def wheel():
    """Roda de ferro fundido com o friso, seis raios e o cubo (gira no jogo)."""
    W = H = 14
    c = (7.0, 7.0)
    P = [Ellipse('tyre', 'iron', 1.0, c, 6.4, 6.4), Ellipse('web', 'iron', 1.05, c, 5.0, 5.0, flat=0)]
    for i in range(6):
        a = i * math.pi / 3
        P.append(Capsule('spoke', 'iron', 1.1, add(c, (math.cos(a), math.sin(a)), 1.2), add(c, (math.cos(a), math.sin(a)), 4.8), 0.75, 0.55))
    P.append(Ellipse('hub', 'iron', 1.2, c, 1.8, 1.8))
    P.append(Ellipse('pin', 'iron', 1.21, c, 0.7, 0.7, flat=4))
    return P, [], W, H, []


# ---------------------------------------------------------------- trilho
def rail():
    """Um palmo de trilho (repete): o boleto de ferro, a alma e o patim pregados no dormente."""
    W, H = 16, 8
    P = []
    P.append(Poly('sleeper', 'oldwood', 0.8, [(2.5, 4.0), (13.5, 4.0), (13.0, 8.0), (3.0, 8.0)], nf=const((0.0, -0.2, 1.0)), shade=0.85))
    pts, nf = rod(-0.5, 1.2, 16.5, 1.2, 1.2)
    P.append(Poly('head', 'iron', 1.0, pts, nf=nf, shade=1.15))
    P.append(Poly('web', 'iron', 0.95, [(-0.5, 2.2), (16.5, 2.2), (16.5, 3.6), (-0.5, 3.6)], nf=const((0.0, 0.0, 1.0)), shade=0.7))
    pts, nf = rod(-0.5, 4.1, 16.5, 4.1, 0.6)
    P.append(Poly('foot', 'iron', 0.97, pts, nf=nf, shade=0.9))
    for x in (4.6, 11.4):
        P.append(Ellipse('spike', 'iron', 1.05, (x, 4.3), 0.7, 0.7))
    return P, [], W, H, []


# ---------------------------------------------------------------- prensa
PRESS_W, PRESS_H = 64, 120


def press():
    """A prensa da Casa Vhalor: dois pés de pedra, duas colunas de ferro rebitadas, a viga de cima
    com a porca do fuso e as mãos-francesas. O fuso, a chapa e a barra de bolas são outras imagens."""
    W, H = PRESS_W, PRESS_H
    P = []
    for x0 in (1.0, 49.0):
        P.append(Poly('foot', 'minerock', 1.0, [(x0, 110.0), (x0 + 14.0, 110.0), (x0 + 14.5, 120.0), (x0 - 0.5, 120.0)], nf=const((0.0, -0.3, 0.95))))
        P.append(Poly('foottop', 'minerock', 1.01, [(x0 + 0.5, 108.0), (x0 + 13.5, 108.0), (x0 + 14.0, 110.6), (x0, 110.6)], nf=const((0.0, -0.9, 0.4)), shade=1.1))
    for xc in (8.0, 56.0):
        pts, nf = rod(xc, 14.0, xc, 109.0, 3.4)
        P.append(Poly('column', 'iron', 1.2, pts, nf=nf))
        for y in (30.0, 62.0, 94.0):
            P.append(Capsule('collar', 'iron', 1.25, (xc - 4.0, y), (xc + 4.0, y), 1.1, 1.1, shade=1.05))
    # viga de cima, com a porca do fuso no meio
    pts, nf = rod(0.5, 10.0, 63.5, 10.0, 6.0)
    P.append(Poly('beam', 'iron', 1.3, pts, nf=nf))
    P.append(Poly('nut', 'iron', 1.35, [(25.0, 1.0), (39.0, 1.0), (40.5, 4.0), (40.5, 18.5), (23.5, 18.5), (23.5, 4.0)],
                  nf=lambda x, y: (np.clip((np.asarray(x, np.float32) - 32) / 9, -0.7, 0.7), -0.25 + 0 * np.asarray(y, np.float32), 0.75)))
    # mãos-francesas entre as colunas e a viga
    for (a, b) in (((11.5, 30.0), (22.0, 16.0)), ((52.5, 30.0), (42.0, 16.0))):
        P.append(Capsule('knee', 'iron', 1.22, a, b, 1.5, 1.5, shade=0.9))

    def rivets(x, y, cur):
        if 13.0 < y < 16.0 or 4.4 < y < 6.6:
            if abs(((x - 2.0) % 6.0) - 3.0) < 0.6:
                return ('iron', 4)
        return None

    def stains(x, y, cur):
        # escorridos de Âmbar seco na pedra dos pés e na base das colunas
        if y > 100 and abs(math.sin(x * 1.3) + math.sin(x * 0.37)) > 1.55 and (y - 100) < 6 + 4 * math.sin(x * 2.1):
            return ('amber', 1)
        return None
    return P, [Decal('beam', rivets), Decal('foot', stains), Decal('column', stains)], W, H, []


def press_plate():
    """A chapa que desce: um bloco de ferro com o chanfro embaixo, os parafusos e o Âmbar grudado
    na face de baixo (a memória espremida). A origem é o meio de cima."""
    W, H = 44, 18
    P = []
    P.append(Poly('plate', 'iron', 1.0, [(1.0, 2.0), (43.0, 2.0), (43.0, 12.0), (40.5, 15.0), (3.5, 15.0), (1.0, 12.0)],
                  nf=lambda x, y: (0 * np.asarray(x, np.float32), np.clip((np.asarray(y, np.float32) - 9) / 8, -0.6, 0.6), 0.85)))
    P.append(Poly('lip', 'iron', 1.02, [(16.0, 0.0), (28.0, 0.0), (29.0, 2.4), (15.0, 2.4)], nf=const((0.0, -0.8, 0.6)), shade=1.1))
    for x in (6.0, 15.0, 29.0, 38.0):
        P.append(Ellipse('bolt', 'iron', 1.05, (x, 6.6), 1.2, 1.2))
    rnd = random.Random(9)
    for i in range(7):
        x = 5.0 + i * 5.6 + rnd.uniform(-1, 1)
        P.append(Capsule('drip', 'amber', 1.1, (x, 14.2), (x + rnd.uniform(-0.3, 0.3), 15.4 + rnd.uniform(0.5, 2.4)), 1.0, 0.55, flat=3 if i % 2 else 2))
    P.append(Capsule('crust', 'amber', 1.08, (4.0, 14.6), (40.0, 14.6), 0.7, 0.7, flat=2))
    return P, [], W, H, [(22.0, 15.0, AMBER)]


def press_screw():
    """Um palmo do fuso (repete na vertical): rosca de ferro com os filetes inclinados."""
    W, H = 8, 8
    P = []
    pts, nf = rod(4.0, -0.5, 4.0, 8.5, 2.8)
    P.append(Poly('screw', 'iron', 1.0, pts, nf=nf))

    def thread(x, y, cur):
        t = (y - (x - 4.0) * 0.45) % 4.0
        if t < 1.0:
            return ('iron', 0)
        if t < 1.6:
            return ('iron', 4)
        return None
    return P, [Decal('screw', thread)], W, H, []


def press_bar():
    """A barra de cima com as duas bolas de ferro (vista de lado; o jogo achata em x para girar)."""
    W, H = 62, 12
    P = []
    pts, nf = rod(6.0, 6.0, 56.0, 6.0, 1.3)
    P.append(Poly('bar', 'iron', 1.0, pts, nf=nf))
    for x in (5.4, 56.6):
        P.append(Ellipse('ball', 'iron', 1.1, (x, 6.0), 5.0, 5.0))
    P.append(Poly('hubb', 'iron', 1.2, [(27.0, 1.0), (35.0, 1.0), (35.0, 11.0), (27.0, 11.0)], nf=const((0.0, -0.2, 1.0))))
    return P, [], W, H, []


def press_bed():
    """A mesa da prensa no chão: uma laje de pedra manchada de Âmbar."""
    W, H = 48, 8
    P = [Poly('bed', 'minerock', 1.0, [(1.0, 1.0), (47.0, 1.0), (48.0, 8.0), (0.0, 8.0)], nf=const((0.0, -0.4, 0.9)))]

    def stain(x, y, cur):
        f = math.sin(x * 0.53 + 1.3) * 1.4 + math.sin(x * 0.19 + 4.0) * 2.0 + math.sin(x * 1.31) * 0.6
        if y < 2.0 + max(0.0, f) * 0.9 and f > 0.4:
            return ('amber', 2 if (f > 2.2 and y < 2.6) else 1)
        return None
    return P, [Decal('bed', stain)], W, H, []


# ---------------------------------------------------------------- escoras
def timber():
    """Um palmo de viga de madeira velha (repete na horizontal; o jogo gira para os esteios)."""
    W, H = 16, 8
    P = []
    pts, nf = rod(-0.5, 4.0, 16.5, 4.0, 3.6)
    P.append(Poly('timber', 'oldwood', 1.0, pts, nf=lambda x, y: (0 * np.asarray(x, np.float32), np.clip((np.asarray(y, np.float32) - 4) / 4, -0.8, 0.8), 0.7)))

    def grain(x, y, cur):
        g = math.sin(x * 0.55 + math.sin(x * 0.21) * 2.0) * 0.6
        if abs(((y + g) % 2.6) - 1.3) < 0.18:
            return ('oldwood', 1)
        if (x - 11.0) ** 2 / 2.2 + (y - 3.6) ** 2 / 1.0 < 1.0:
            return ('oldwood', 0)
        return None
    return P, [Decal('timber', grain)], W, H, []


def knee():
    """Mão-francesa da escora: um toco de madeira na diagonal com as chapas de ferro nas pontas.
    Vai de baixo à esquerda (no esteio) a cima à direita (na viga)."""
    W = H = 16
    P = [Capsule('knee', 'oldwood', 1.0, (2.0, 14.0), (14.0, 2.0), 1.9, 1.9)]
    for (x, y) in ((3.0, 13.0), (13.0, 3.0)):
        P.append(Ellipse('plate', 'iron', 1.1, (x, y), 1.8, 1.8, ang=-0.78))
        P.append(Ellipse('nail', 'iron', 1.11, (x, y), 0.6, 0.6, flat=4))
    return P, [], W, H, []


# ---------------------------------------------------------------- registros
def ledger():
    """O registro: um livro grosso aberto em cima de um caixote, com a lasca de Âmbar que segura as
    folhas (é ela que brilha e chama o olho)."""
    W, H = 26, 22
    P = []
    P.append(Poly('crate', 'oldwood', 1.0, [(2.0, 10.0), (24.0, 10.0), (24.0, 22.0), (2.0, 22.0)], nf=const((0.0, -0.1, 1.0))))
    P.append(Poly('lid', 'oldwood', 1.01, [(1.4, 9.0), (24.6, 9.0), (24.6, 10.8), (1.4, 10.8)], nf=const((0.0, -0.8, 0.6)), shade=1.1))
    for x in (2.6, 23.4):
        P.append(Capsule('corner', 'iron', 1.05, (x, 10.4), (x, 21.6), 0.8, 0.8))

    def boards(x, y, cur):
        if abs(((y - 10.0) % 4.0) - 4.0) < 0.35 or ((y - 10.0) % 4.0) < 0.3:
            return ('oldwood', 0)
        if 0 < x - 2 < 22 and abs((x - 2) - (y - 10) * 1.8) < 0.7:
            return ('oldwood', 1)
        return None
    # o livro: capa de couro, as folhas em V e a letra miúda
    P.append(Poly('cover', 'leather', 1.2, [(4.0, 8.6), (22.0, 8.6), (22.6, 9.6), (3.4, 9.6)], nf=const((0.0, -0.4, 0.9))))
    P.append(Poly('pageL', 'paper', 1.25, [(4.4, 5.6), (13.0, 7.0), (13.0, 8.8), (4.2, 8.4)], nf=const((-0.3, -0.6, 0.75))))
    P.append(Poly('pageR', 'paper', 1.25, [(13.0, 7.0), (21.6, 5.6), (21.8, 8.4), (13.0, 8.8)], nf=const((0.3, -0.6, 0.75)), shade=0.92))

    def writing(x, y, cur):
        top = 5.6 + abs(x - 13.0) * -0.16 + 1.4
        if y > top - 0.9 and int((y - top) * 2.2) % 2 == 0 and abs(x - 13.0) > 1.0 and math.sin(x * 3.1 + y) > -0.4:
            return ('paper', 1)
        return None
    P.append(Capsule('spine', 'leather', 1.26, (13.0, 6.8), (13.0, 9.0), 0.45, 0.45))
    tip = prism(P, (18.0, 7.2), -70, 4.6, 1.2, 1.3)
    P.append(Ellipse('ink', 'iron', 1.27, (7.0, 8.6), 1.3, 1.0))
    return P, [Decal('crate', boards), Decal('pageL', writing), Decal('pageR', writing)], W, H, [(tip[0] - 1.0, tip[1] + 2.0, AMBER)]


# ---------------------------------------------------------------- bloco de Âmbar
def amber_block(seed):
    """Um bloco de Âmbar cortado (16x16, com os cantos lascados), aceso por dentro em anéis, com
    bolhas, os veios da resina e, às vezes, a mão de alguém presa dentro (a lembrança que ficou)."""
    rnd = random.Random(seed)
    W = H = 16
    j = lambda: rnd.uniform(-0.35, 0.35)
    outline = [(0.5, 1.7 + j()), (1.7 + j(), 0.5), (14.3 + j(), 0.5), (15.5, 1.7 + j()), (15.5, 14.3 + j()), (14.3 + j(), 15.5),
               (1.7 + j(), 15.5), (0.5, 14.3 + j())]
    P = [Poly('ablock', 'amber', 1.0, outline, nf=const((-0.3, -0.35, 0.88)), shade=0.4)]
    P.append(Poly('abevelT', 'amber', 1.01, [(1.7, 0.5), (14.3, 0.5), (13.5, 1.7), (2.5, 1.7)], nf=const((0.0, -0.9, 0.45)), shade=0.8))
    P.append(Poly('abevelB', 'amber', 1.01, [(2.5, 14.3), (13.5, 14.3), (14.3, 15.5), (1.7, 15.5)], nf=const((0.0, 0.9, 0.45)), shade=0.25))
    gc = (8.0 + rnd.uniform(-1.4, 1.4), 8.0 + rnd.uniform(-1.4, 1.4))
    bubbles = [(rnd.uniform(3.0, 13.0), rnd.uniform(3.0, 13.0), rnd.uniform(0.3, 0.65)) for _ in range(5)]
    ang = rnd.uniform(0, math.pi)
    trapped = seed % 3 == 1
    blobs = [(rnd.uniform(3.0, 13.0), rnd.uniform(3.0, 13.0), rnd.uniform(0.6, 1.2), rnd.uniform(0, 3)) for _ in range(3)]

    def inside(x, y, cur):
        for (bx, by, r) in bubbles:
            if (x - bx) ** 2 + (y - by) ** 2 < r * r:
                return ('amber', 4)
        u = (x - 8.0) * math.cos(ang) + (y - 8.0) * math.sin(ang)
        v = -(x - 8.0) * math.sin(ang) + (y - 8.0) * math.cos(ang)
        if abs(v - math.sin(u * 0.9) * 1.2) < 0.2 and abs(u) < 5.5:
            return ('amber', 0)
        if trapped:
            # a mão aberta de alguém, de dedos para cima, presa no Âmbar
            hx, hy = x - 8.4, y - 10.0
            if hx * hx / 4.4 + hy * hy / 3.0 < 1.0:
                return ('amber', 0)
            for k in range(4):
                fx = -1.65 + k * 1.1
                top = -4.8 + abs(k - 1.4) * 0.6
                if abs(hx - fx - (hy + 1.2) * 0.1 * (k - 1.5)) < 0.36 and top < hy < -0.8:
                    return ('amber', 0)
            if abs((hx + 2.3) - (hy + 0.2) * -0.9) < 0.38 and -1.8 < hy < 0.8:
                return ('amber', 0)
        # pedrinhas e lascas escuras presas na resina
        for (bx, by, r, a) in blobs:
            dx, dy = x - bx, y - by
            if (dx * math.cos(a) + dy * math.sin(a)) ** 2 / (r * r) + (-dx * math.sin(a) + dy * math.cos(a)) ** 2 / (r * r * 0.3) < 1.0:
                return ('amber', 0)
        # o miolo aceso
        if math.hypot(x - gc[0], (y - gc[1]) * 1.15) < 3.0:
            return ('amber', 3)
        return None
    return P, [Decal('ablock', inside)], W, H, [(gc[0], gc[1], AMBER)]


# ---------------------------------------------------------------- entulho do desabamento
def rubble():
    """O teto que desabou: pedras de vários tamanhos, uma tábua quebrada e o pó em volta. A origem é
    o meio de baixo."""
    rnd = random.Random(12)
    W, H = 48, 22
    P = []
    P.append(Capsule('board', 'oldwood', 0.9, (8.0, 18.0), (30.0, 6.0), 1.6, 1.4, shade=0.85))
    P.append(Poly('boardend', 'oldwood', 0.91, [(29.0, 5.0), (32.5, 3.8), (31.0, 7.4)], nf=const((0.2, -0.5, 0.8))))
    for i in range(22):
        t = rnd.random()
        x = 4 + t * 40
        hmax = 20 * (1 - abs(t - 0.45) * 1.7)
        y = H - rnd.uniform(1.5, max(2.0, hmax * 0.8))
        r = rnd.uniform(2.2, 5.6) * (1.0 if y > H - 8 else 0.75)
        P.append(Ellipse('stone', 'minerock', 1.0 + (y / H) * 0.5 + i * 0.002, (x, y), r, r * rnd.uniform(0.6, 0.85), ang=rnd.uniform(-0.6, 0.6),
                         shade=rnd.uniform(1.0, 1.3)))
    P.append(Ellipse('dust', 'minerock', 1.6, (W / 2, H - 0.4), W * 0.48, 1.4, flat=1))
    return P, [], W, H, []


# ---------------------------------------------------------------- a Picareta caída
def picareta():
    """A Picareta do Capataz deitada em diagonal (é o que ele deixa cair): cabo de madeira com as
    cintas, a cabeça de ferro com a ponta curva e a pá, e as lascas de Âmbar grudadas."""
    W = H = 32
    butt, top = (5.0, 27.0), (21.6, 10.4)
    sd = norm((top[0] - butt[0], top[1] - butt[1], 0.0))[:2]
    L = math.hypot(sd[0], sd[1])
    sd = (sd[0] / L, sd[1] / L)
    P = [Capsule('haft', 'wood', 1.0, butt, top, 1.3, 1.15)]
    for t in (0.2, 0.68):
        c = add(butt, sd, 23.5 * t)
        P.append(Capsule('band', 'steel', 1.05, add(c, sd, -0.8), add(c, sd, 0.8), 1.6, 1.6))
    side = (sd[1], -sd[0])
    hc = add(top, sd, -0.6)

    def Hh(a, b):
        return add(add(hc, side, a * 1.12), sd, -b * 1.12)
    outline = [Hh(-5.8, -1.2), Hh(-6.0, 2.2), Hh(-4.6, 2.0), Hh(-1.6, 1.7), Hh(2.6, 1.6), Hh(6.4, 2.6), Hh(9.6, 4.6),
               Hh(10.4, 4.4), Hh(7.4, 1.4), Hh(3.0, -1.5), Hh(-1.6, -1.9)]
    P.append(Poly('phead', 'steel', 2.0, outline, nf=const((0.0, -0.6, 0.8)), shade=0.95))
    P.append(Capsule('peye', 'steel', 2.05, Hh(-0.9, -2.0), Hh(-0.9, 2.0), 1.8, 1.8, shade=0.8))
    for (a, b, r) in ((-4.4, 0.6, 1.0), (4.6, 0.6, 0.9), (7.6, 2.4, 0.7)):
        P.append(Ellipse('pamber', 'amber', 2.1, Hh(a, b), r * 1.1, r * 0.9, flat=3))
    return P, [], W, H, []


# ---------------------------------------------------------------- o espelho de Âmbar da Câmara
def amber_mirror(broken=False):
    """A laje de Âmbar polido da Câmara de Âmbar, encaixada na parede dos fundos: moldura de rocha
    bruta com as marcas da talhadeira (alguém cortou a pedra em volta e poliu a face) e a face lisa,
    escura e funda, que devolve quem passa na frente. Quebrada: racha de cima a baixo a partir do
    ponto onde o reflexo caiu, com lascas faltando. A origem é o meio de baixo."""
    rnd = random.Random(31)
    W, H = 72, 150
    P = []
    # moldura de rocha: contorno irregular, mais larga embaixo
    frame = []
    n = 26
    for i in range(n):
        a = 2 * math.pi * i / n
        rx = 35.0 + rnd.uniform(-1.5, 1.0)
        ry = 74.0 + rnd.uniform(-1.5, 1.0)
        x = W / 2 + math.cos(a) * rx
        y = 76.0 + math.sin(a) * ry
        frame.append((x, min(H - 0.5, y)))
    P.append(Poly('mframe', 'minerock', 1.0, frame, nf=const((-0.2, -0.3, 0.9)), shade=1.05))

    def chisel(x, y, cur):
        # marcas da talhadeira: riscos curtos inclinados na moldura
        t = (x * 0.7 + y * 0.35) % 5.0
        if t < 0.5 and ((int(y / 6) + int(x / 9)) % 3 == 0):
            return ('minerock', 0)
        return None

    # a face polida: um oval alto, um pouco abaulado
    pane = []
    for i in range(30):
        a = 2 * math.pi * i / 30
        pane.append((W / 2 + math.cos(a) * 27.0, 78.0 + math.sin(a) * 64.0))
    sh = 0.85 if broken else 1.0

    def pane_n(x, y):
        X = (np.asarray(x, np.float32) - W / 2) / 27.0
        Y = (np.asarray(y, np.float32) - 78.0) / 64.0
        return (X * 0.35 - 0.1, Y * 0.25 - 0.2, 0.9 + 0 * X)

    P.append(Poly('mpane', 'amberglass', 1.1, pane, nf=pane_n, shade=sh))
    crack_from = (W / 2 + 3.0, 92.0)
    cracks = []
    if broken:
        for k in range(7):
            a = -math.pi / 2 + (k - 3) * 0.55 + rnd.uniform(-0.15, 0.15)
            pts = [crack_from]
            x, y = crack_from
            for j in range(6):
                L = rnd.uniform(6.0, 13.0)
                a += rnd.uniform(-0.35, 0.35)
                x, y = x + math.cos(a) * L, y + math.sin(a) * L
                pts.append((x, y))
            cracks.append(pts)
    holes = []

    def seg_d(px, py, a, b):
        ax, ay = a
        bx, by = b
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy + 1e-6)))
        return math.hypot(px - ax - dx * t, py - ay - dy * t)

    def pane_dec(x, y, cur):
        for (hx, hy, r) in holes:
            if (x - hx) ** 2 + (y - hy) ** 2 < r * r:
                return ('minerock', 1 if (x - hx) + (y - hy) < 0 else 0)
        for pts in cracks:
            for i in range(1, len(pts)):
                d = seg_d(x, y, pts[i - 1], pts[i])
                if d < 0.45:
                    return ('void', 0)
                if d < 0.9 and not broken:
                    return None
                if d < 1.0:
                    return ('amber', 2)
        # o brilho do polimento: uma faixa clara na borda da esquerda e dois reflexos em diagonal
        X = (x - W / 2) / 27.0
        Y = (y - 78.0) / 64.0
        r2 = X * X + Y * Y
        if 0.80 < r2 < 0.9 and X < -0.35 and Y < 0.2:
            return ('amber', 4 if not broken else 3)
        for (c0, wdt) in ((-0.5, 0.028), (-0.36, 0.014)):
            if abs((X + Y * 0.8) - c0) < wdt and -0.75 < Y < -0.05:
                return ('amber', 3 if not broken else 2)
        # o fundo do Âmbar: um brilho fundo no meio, como brasa atrás do vidro
        if r2 < 0.05:
            return ('amber', 1)
        if r2 < 0.16:
            return ('amberglass', 4)
        if broken and math.hypot(x - crack_from[0], y - crack_from[1]) < 3.0:
            return ('void', 0)
        return None

    # pedrinhas soltas na base e o pó de pedra polida no chão
    for i in range(6):
        x = W / 2 + (i / 5 - 0.5) * 60 + rnd.uniform(-2, 2)
        r = rnd.uniform(2.4, 4.4)
        P.append(Ellipse('mstone', 'minerock', 1.2 + i * 0.01, (x, H - 1.2), r, r * 0.55))
    if broken:
        for i in range(8):
            x = W / 2 + rnd.uniform(-26, 26)
            P.append(Poly('mshard', 'amber', 1.25 + i * 0.01, [(x - 2.0, H - 0.6), (x + rnd.uniform(-1.5, 1.5), H - rnd.uniform(3.0, 6.0)), (x + 2.2, H - 0.6)],
                          nf=const((-0.4, -0.5, 0.75)), shade=0.7))
    lights = [] if broken else [(W / 2, 78.0, AMBER)]
    return P, [Decal('mframe', chisel), Decal('mpane', pane_dec)], W, H, lights


# ---------------------------------------------------------------- a viga do teto e o carrinho da prensa
def ceiling_beam():
    """Um palmo da viga de ferro presa no teto da Galeria do Capataz (repete na horizontal): perfil
    em I com as abas de cima e de baixo e os rebites."""
    W, H = 16, 10
    P = []
    P.append(Poly('webb', 'iron', 1.0, [(-0.5, 2.6), (16.5, 2.6), (16.5, 7.4), (-0.5, 7.4)], nf=const((0.0, 0.0, 1.0)), shade=0.7))
    pts, nf = rod(-0.5, 1.3, 16.5, 1.3, 1.3)
    P.append(Poly('flangeT', 'iron', 1.1, pts, nf=nf))
    pts, nf = rod(-0.5, 8.7, 16.5, 8.7, 1.3)
    P.append(Poly('flangeB', 'iron', 1.1, pts, nf=nf, shade=1.1))
    for x in (4.0, 12.0):
        P.append(Ellipse('rivet', 'iron', 1.2, (x, 5.0), 0.9, 0.9))
    return P, [], W, H, []


def trolley():
    """O carrinho que corre na aba de baixo da viga: duas rodas de ferro, a armação e a roldana de
    onde desce a corrente da chapa. A origem é o meio de cima (no topo das rodas)."""
    W, H = 28, 18
    P = []
    for x in (7.0, 21.0):
        P.append(Ellipse('twheel', 'iron', 1.0, (x, 3.4), 3.2, 3.2))
        P.append(Ellipse('thub', 'iron', 1.05, (x, 3.4), 1.1, 1.1, shade=0.7))
    P.append(Poly('tframe', 'rust', 1.1, [(3.0, 5.0), (25.0, 5.0), (22.0, 10.0), (6.0, 10.0)], nf=const((0.0, -0.3, 0.95))))
    P.append(Capsule('tarm', 'rust', 1.12, (14.0, 9.0), (14.0, 13.0), 1.6, 1.4))
    P.append(Ellipse('pulley', 'iron', 1.2, (14.0, 14.4), 3.2, 3.2))
    P.append(Ellipse('pulleyh', 'iron', 1.22, (14.0, 14.4), 1.1, 1.1, shade=0.6))
    return P, [], W, H, []


PROPS = {
    'deco-crystal-0': lambda: crystal(3, 30, 30, 5, 34, 26),
    'deco-crystal-1': lambda: crystal(7, 20, 22, 3, 30, 19),
    'deco-crystal-2': lambda: crystal(11, 26, 16, 4, 52, 13),
    'deco-mine-lamp': lamp,
    'deco-cart': cart,
    'deco-cart-wheel': wheel,
    'deco-rail': rail,
    'deco-press': press,
    'deco-press-plate': press_plate,
    'deco-press-screw': press_screw,
    'deco-press-bar': press_bar,
    'deco-press-bed': press_bed,
    'deco-timber': timber,
    'deco-timber-knee': knee,
    'deco-ledger': ledger,
    'deco-amber-block-0': lambda: amber_block(0),
    'deco-amber-block-1': lambda: amber_block(1),
    'deco-amber-block-2': lambda: amber_block(2),
    'deco-rubble': rubble,
    'item-picareta': picareta,
    'deco-amber-mirror': amber_mirror,
    'deco-amber-mirror-broken': lambda: amber_mirror(True),
    'deco-ceiling-beam': ceiling_beam,
    'deco-trolley': trolley,
}


if __name__ == '__main__':
    import ink
    from PIL import Image
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = args[0] if args else '.'
    only = set(args[1:])
    prev = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
    if prev:
        os.makedirs(prev, exist_ok=True)
    made = {}
    lights = {}
    for k, fn in PROPS.items():
        if only and k not in only:
            continue
        prims, decals, W, H, L = fn()
        a = ink.render_frame(prims, decals, W, H, style=ink.HK)
        im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        im.save(f'{out}/{k}.png')
        made[k] = ink.S
        if L:
            lights[k] = [[round(x, 1), round(y, 1), c] for x, y, c in L]
        if prev:
            big = im.resize((im.width * 4, im.height * 4), Image.NEAREST)
            bg = Image.new('RGBA', big.size, (34, 26, 22, 255))
            bg.alpha_composite(big)
            bg.save(f'{prev}/{k}.png')
        print(k, im.size, len(prims), 'partes', flush=True)
    path = f'{out}/hd.json'
    hd = json.load(open(path)) if os.path.exists(path) else {}
    hd.update(made)
    json.dump(hd, open(path, 'w'), indent=1)
    lp = f'{out}/portal-lights.json'
    old = json.load(open(lp)) if os.path.exists(lp) else {}
    old.update(lights)
    json.dump(old, open(lp, 'w'), indent=1)

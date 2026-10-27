"""Objetos das Torres Rúnicas no traço liso (ink.py).

Cada função devolve (prims, decals, W, H, luzes) em pixels do mundo; as luzes (x, y, cor) ficam em
relação ao canto da imagem.

uso: python3 torres_props.py <pasta_assets> [nomes...] [--preview=<pasta>]
"""
import json
import math
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm

# o pergaminho grosso da Casa, a fita de bronze, a cera do selo e a pedra do estrado
puppet.RAMPS.setdefault('vellum', [0x4f402a, 0x86704c, 0xb9a177, 0xdccaa0, 0xf6ead0])
puppet.RAMPS.setdefault('bronze', [0x2e1f10, 0x5a3a18, 0x8a5c26, 0xb98a3e, 0xe4bd72])
puppet.RAMPS.setdefault('waxred', [0x330909, 0x5e1212, 0x8a1f1c, 0xb33a2c, 0xd8694f])
puppet.RAMPS.setdefault('iron', [0x101218, 0x1d2029, 0x30343f, 0x4b505e, 0x737a8b])
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
puppet.RAMPS.setdefault('throne', [0x140d0b, 0x24170f, 0x382417, 0x4f3420, 0x6a482d])
# a pedra escura das Torres, a madeira das mesas da Casa, as flores prensadas dela, o vidro das Experiências
puppet.RAMPS.setdefault('tstone', [0x131318, 0x22222a, 0x34333c, 0x4c4a54, 0x6a6772])
puppet.RAMPS.setdefault('desk', [0x170f0b, 0x2a1b12, 0x40291a, 0x5a3b25, 0x785133])
puppet.RAMPS.setdefault('flowerred', [0x3a0c12, 0x6e1622, 0xa52a33, 0xd04a4a, 0xf08a7a])
puppet.RAMPS.setdefault('flowerblue', [0x141c3a, 0x23326a, 0x3a5aa0, 0x5f86c8, 0x9bbbe8])
puppet.RAMPS.setdefault('stem', [0x0e1a0e, 0x1d331b, 0x2f4f2a, 0x46703c, 0x6a9458])
puppet.RAMPS.setdefault('glass', [0x15212b, 0x26404e, 0x41687a, 0x77a2b2, 0xc6e2ea])
puppet.SHINY.setdefault('glass', (0.8, 18))
puppet.SHINY.setdefault('iron', (0.45, 12))
puppet.RIM_MATS |= {'desk', 'tstone'}
puppet.SHINY.setdefault('amber', (0.7, 16))
puppet.SHINY.setdefault('throne', (0.18, 8))
puppet.SHINY.setdefault('bronze', (0.5, 9))
puppet.SHINY.setdefault('waxred', (0.35, 10))
puppet.SHINY.setdefault('vellum', (0.15, 6))
puppet.RIM_MATS |= {'vellum'}


def const(n):
    v = norm(n)
    return lambda x, y: v


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


# ---------------------------------------------------------------- o decreto da Coroação
def record_trono():
    """O decreto da Coroação (24x10), caído no estrado do trono: o pergaminho grosso meio desenrolado no
    chão, o rolo do resto para a direita com as duas voltas da fita de bronze (a ponta solta caindo na
    pedra), o cabeçalho grosso e as linhas de escrivão na parte aberta e o selo de cera da Casa embaixo
    delas, com a fita."""
    W, H = 24, 10
    P = []
    # a parte aberta, deitada no chão e vista de cima de leve; a ponta da esquerda enrola um pouco
    sheet = [(1.6, 4.6), (15.0, 3.8), (15.6, 8.4), (2.2, 9.4)]
    P.append(Poly('sheet', 'vellum', 1.0, sheet, nf=const((0.0, -0.7, 0.7)), shade=1.0))
    P.append(Capsule('curl', 'vellum', 1.02, (1.4, 4.8), (2.2, 9.2), 0.75, 0.8, shade=0.85))

    # o rolo do resto: o cilindro de pergaminho, mais escuro embaixo
    def roll_n(x, y):
        t = np.clip((np.asarray(y, np.float32) - 6.2) / 2.0, -1, 1)
        return (0 * t, t * 0.85, np.sqrt(np.maximum(0.1, 1 - (t * 0.85) ** 2)))
    P.append(Poly('roll', 'vellum', 1.05, [(14.4, 4.3), (22.6, 3.9), (23.0, 8.1), (14.8, 8.6)], nf=roll_n))
    P.append(Ellipse('rollend', 'vellum', 1.06, (22.8, 6.0), 0.9, 2.1, shade=0.8))
    # as duas voltas da fita de bronze e a ponta solta caindo na pedra
    for bx in (16.8, 20.2):
        P.append(Poly('band', 'bronze', 1.1, [(bx, 4.0), (bx + 1.0, 3.95), (bx + 1.15, 8.3), (bx + 0.1, 8.4)], nf=roll_n))
    P.append(Capsule('ribbon', 'bronze', 1.12, (17.4, 8.2), (19.4, 9.6), 0.42, 0.36, shade=0.9))
    P.append(Capsule('ribbon', 'bronze', 1.12, (19.4, 9.6), (21.6, 9.3), 0.36, 0.32, shade=0.8))
    # o selo de cera da Casa, com a fitinha
    P.append(Capsule('tie', 'waxred', 1.2, (11.2, 8.0), (10.6, 9.6), 0.36, 0.3, shade=0.8))
    P.append(Capsule('tie', 'waxred', 1.2, (12.0, 8.0), (12.8, 9.5), 0.36, 0.3, shade=0.8))
    P.append(Ellipse('seal', 'waxred', 1.25, (11.6, 7.6), 1.5, 1.05))

    def text(x, y, cur):
        # o cabeçalho grosso, as linhas de escrivão e o espaço da segunda assinatura (vazio)
        if 5.0 < y < 5.9 and 3.6 < x < 12.6 and int(x * 1.4) % 4 != 3:
            return ('vellum', 0)
        if 6.4 < y < 8.6 and 3.2 < x < 9.8:
            k = (y - 6.4) % 1.1
            if k < 0.42 and int(x * 2.2 + y) % 6 != 0:
                return ('vellum', 1)
        return None

    def seal(x, y, cur):
        r = math.hypot((x - 11.6) / 1.4, (y - 7.6))
        if 0.62 < r < 0.82:
            return ('waxred', 1)
        if r < 0.36:
            return ('waxred', 4)
        return None
    return P, [Decal('sheet', text), Decal('seal', seal)], W, H, []


# ---------------------------------------------------------------- o Cetro de Vhalor caído
def cetro_item():
    """O Cetro de Vhalor caído no estrado (32x32), deitado em diagonal: o pé de bronze embaixo, o cabo de
    madeira escura do trono com os dois anéis, a gola, a cabeça de bronze com as três abas pontudas de cada
    lado, a runa de Âmbar acesa no meio e a ponta em cima."""
    W = H = 32
    butt, top = (4.4, 28.4), (26.6, 6.0)
    d = (top[0] - butt[0], top[1] - butt[1])
    L = math.hypot(*d)
    sd = (d[0] / L, d[1] / L)
    side = (sd[1], -sd[0])
    HS = 0.95
    hb = add(top, sd, -9.5 * HS)
    P = [Capsule('haft', 'throne', 1.0, butt, hb, 1.15, 1.05, shade=1.0)]
    P.append(Capsule('cbutt', 'bronze', 1.01, add(butt, sd, -0.4), add(butt, sd, 1.9), 1.6, 1.4, shade=0.9))
    for t in (0.22, 0.62):
        q = add(butt, sd, (L - 9.5 * HS) * t)
        P.append(Capsule('cring', 'bronze', 1.02, add(q, sd, -0.6), add(q, sd, 0.6), 1.55, 1.55, shade=0.95))
    P.append(Capsule('ccollar', 'bronze', 1.03, add(hb, sd, -1.1), add(hb, sd, 1.0), 1.9, 2.2, shade=0.95))
    hc = add(top, sd, -4.6 * HS)
    for a, l in ((-2.6, 2.6), (0.0, 3.2), (2.6, 2.6)):
        for k in (-1, 1):
            b0 = add(add(hc, sd, a * HS), side, k * 2.6 * HS)
            tip = add(add(hc, sd, (a + 0.4) * HS), side, k * (2.6 + l) * HS)
            P.append(Poly('flange', 'bronze', 1.1, [add(b0, sd, -1.3 * HS), tip, add(b0, sd, 1.3 * HS)],
                          nf=const((0.35 * k * side[0], 0.35 * k * side[1] - 0.5, 0.78)), shade=0.95))
    P.append(Ellipse('chead', 'bronze', 1.15, hc, 3.3 * HS, 4.4 * HS, ang=math.atan2(sd[1], sd[0]) + math.pi / 2))
    P.append(Poly('cspike', 'bronze', 1.12, [add(add(top, sd, -0.4), side, -1.0 * HS), add(top, sd, 3.0 * HS), add(add(top, sd, -0.4), side, 1.0 * HS)],
                  nf=const((-0.3, -0.6, 0.75)), shade=1.0))

    def glyph(x, y, cur):
        lx = ((x - hc[0]) * side[0] + (y - hc[1]) * side[1]) / HS
        ly = ((x - hc[0]) * sd[0] + (y - hc[1]) * sd[1]) / HS
        if (abs(lx) < 0.5 and -2.6 < ly < 2.6) or (abs(ly - 1.4 - lx * 0.8) < 0.45 and 0 < lx < 1.6) or (abs(ly + 1.6) < 0.42 and abs(lx) < 1.4):
            return ('amber', 4)
        return None
    return P, [Decal('chead', glyph)], W, H, [(hc[0], hc[1], 0xffa63c)]


def cyl(cx, w, lean=0.0):
    """Normal de peça redonda em pé (poste, perna): os lados virando para fora."""
    def nf(x, y):
        t = np.clip((np.asarray(x, np.float32) - cx) / w, -1, 1) * 0.85
        return (t, lean + 0 * t, np.sqrt(np.maximum(0.1, 1 - t * t)))
    return nf


def lines(x0, x1, y0, y1, step=1.25, mat='vellum', k=1, skip=6, slope=0.0):
    """Linhas de escrita miúda entre x0 e x1, de y0 a y1 (slope: a folha inclinada)."""
    def fn(x, y, cur):
        yy = y - (x - x0) * slope
        if not (x0 < x < x1 and y0 < yy < y1):
            return None
        if (yy - y0) % step < 0.42 and int(x * 2.3 + yy * 1.7) % skip != 0:
            return (mat, k)
        return None
    return fn


# ---------------------------------------------------------------- o quadro da guarda (pátio)
def record_patio():
    """O quadro da guarda, na frente da grande porta (28x44): dois postes de ferro com a ponta de bronze
    fincados na base de pedra, a tábua escura presa neles pelas braçadeiras, a cobertura de bronze com a
    runa e a lista de quem podia subir pregada na tábua: o cabeçalho, os nomes em letra de escrivão e, no
    fim, a linha em outra letra, com o sinal dele na ponta. A runa da base está acesa."""
    W, H = 28, 44
    P = []
    # a base de pedra, com o degrau de cima
    P.append(Poly('base', 'tstone', 0.8, [(5.0, 39.4), (23.0, 39.4), (23.6, 44.0), (4.4, 44.0)], nf=const((0.0, -0.3, 0.95))))
    P.append(Poly('basecap', 'tstone', 0.82, [(4.6, 38.0), (23.4, 38.0), (23.0, 39.8), (5.0, 39.8)], nf=const((0.0, -0.85, 0.5))))
    # os postes, da base até em cima da tábua
    for cx in (8.0, 20.0):
        P.append(Poly('post', 'iron', 1.0, [(cx - 1.0, 38.4), (cx - 0.9, 5.4), (cx + 0.9, 5.4), (cx + 1.0, 38.4)], nf=cyl(cx, 1.0)))
        P.append(Ellipse('knob', 'bronze', 1.05, (cx, 5.0), 1.4, 1.1))
    # a tábua escura e a moldura de bronze
    P.append(Poly('board', 'desk', 1.1, [(6.4, 8.4), (21.6, 8.4), (21.6, 31.6), (6.4, 31.6)], nf=const((0.0, -0.1, 0.99))))
    P.append(Poly('frame', 'bronze', 1.12, [(5.8, 7.6), (22.2, 7.6), (22.2, 8.8), (5.8, 8.8)], nf=const((0.0, -0.8, 0.6))))
    P.append(Poly('frame', 'bronze', 1.12, [(5.8, 31.2), (22.2, 31.2), (22.2, 32.4), (5.8, 32.4)], nf=const((0.0, 0.3, 0.95))))
    # as braçadeiras que prendem a tábua nos postes
    for cx in (8.0, 20.0):
        for y in (10.6, 29.4):
            P.append(Poly('clamp', 'bronze', 1.14, [(cx - 1.5, y - 0.7), (cx + 1.5, y - 0.7), (cx + 1.5, y + 0.7), (cx - 1.5, y + 0.7)], nf=const((0.0, -0.4, 0.9))))
    # a cobertura de bronze, com a runa no meio
    P.append(Poly('roof', 'bronze', 1.2, [(4.4, 6.8), (14.0, 3.0), (23.6, 6.8), (22.8, 7.9), (14.0, 4.6), (5.2, 7.9)], nf=lambda x, y: (np.sign(np.asarray(x) - 14.0) * 0.4, -0.75 + 0 * np.asarray(y), 0.55 + 0 * np.asarray(x))))
    # a lista, um pouco ondulada
    def paper_n(x, y):
        w = np.sin((np.asarray(y, np.float32) - 10.0) * 0.6) * 0.1
        return (w, -0.1 + 0 * w, 0.99 + 0 * w)
    P.append(Poly('list', 'vellum', 1.3, [(8.6, 10.2), (19.4, 10.0), (19.7, 29.0), (18.6, 29.9), (9.2, 30.1), (8.4, 29.2)], nf=paper_n))
    for (x, y) in ((9.4, 10.9), (18.8, 10.7), (9.6, 29.2), (18.8, 29.0)):
        P.append(Ellipse('nail', 'bronze', 1.35, (x, y), 0.55, 0.55))
    names = lines(10.0, 18.2, 13.2, 25.2, step=1.2)

    def text(x, y, cur):
        # o cabeçalho grosso
        if 11.2 < y < 12.4 and 10.4 < x < 17.6 and int(x * 1.5) % 4 != 3:
            return ('vellum', 0)
        r = names(x, y, cur)
        if r:
            return r
        # a última linha, em outra letra (mais escura e torta), e o sinal dele na ponta
        if 26.0 < y - (x - 10.0) * 0.08 < 27.0 and 10.0 < x < 16.4 and math.sin(x * 2.7) > -0.5:
            return ('iron', 0)
        if 27.4 < y - (x - 10.0) * 0.08 < 28.2 and 10.0 < x < 13.6 and math.sin(x * 3.1) > -0.4:
            return ('iron', 0)
        if (abs(x - 17.0) < 0.35 and 25.6 < y < 28.0) or (abs(y - 27.8 + (x - 17.0) * 0.6) < 0.35 and 17.0 < x < 18.4):
            return ('iron', 0)
        return None

    def rune(x, y, cur):
        # a runa da Casa gravada na base, acesa: o traço do meio, o gancho e o pé cruzado
        lx, ly = x - 14.0, y - 41.8
        if (abs(lx) < 0.35 and -1.5 < ly < 1.5) or (abs(ly + 0.7 - lx * 0.8) < 0.32 and 0 < lx < 1.1) or (abs(ly - 1.0) < 0.3 and abs(lx) < 0.9):
            return ('amber', 4)
        return None

    def roof_rune(x, y, cur):
        lx, ly = x - 14.0, y - 5.4
        if (abs(lx) < 0.3 and -0.9 < ly < 0.9) or (abs(ly) < 0.28 and abs(lx) < 0.9):
            return ('amber', 3)
        return None
    return P, [Decal('list', text), Decal('base', rune), Decal('roof', roof_rune)], W, H, [(14.0, 41.8, 0xffa63c)]


# ---------------------------------------------------------------- a mesa dela (Arquivo)
def record_arquivo0():
    """A mesa dela no Arquivo (34x26): a escrivaninha escura de quatro pés com a gaveta, o caderno de
    índice aberto (as linhas e a coluna de "devolver"), as flores prensadas saindo entre as folhas, a caixa
    das fichas, o tinteiro com a pena e um frasco de Âmbar aceso no canto."""
    W, H = 34, 26
    P = []
    # os pés (os de trás mais escuros) e a travessa
    for (a, b, sh) in (((5.0, 25.8), (5.6, 15.4), 1.0), ((29.4, 25.8), (28.8, 14.4), 1.0), ((8.2, 24.6), (8.4, 15.0), 0.7), ((26.4, 24.6), (26.2, 14.2), 0.7)):
        P.append(Capsule('leg', 'desk', 0.9 if sh < 1 else 1.0, a, b, 0.9, 0.8, shade=sh))
    P.append(Capsule('rail', 'desk', 0.95, (5.4, 22.0), (29.0, 22.0), 0.6, 0.6, shade=0.75))
    # o tampo e a gaveta
    P.append(Poly('top', 'desk', 1.1, [(2.0, 13.6), (32.0, 12.0), (32.4, 14.4), (2.4, 16.0)], nf=const((0.1, -0.8, 0.58))))
    P.append(Poly('drawer', 'desk', 1.08, [(3.4, 16.0), (31.0, 14.5), (31.0, 18.2), (3.6, 19.6)], nf=const((0.0, 0.05, 1.0)), shade=0.9))
    P.append(Ellipse('knob', 'bronze', 1.12, (17.2, 17.3), 0.7, 0.6))
    # o caderno de índice aberto
    P.append(Poly('lpage', 'vellum', 1.2, [(8.0, 12.6), (17.0, 11.3), (17.2, 14.4), (8.4, 15.6)], nf=const((-0.12, -0.75, 0.65))))
    P.append(Poly('rpage', 'vellum', 1.2, [(17.0, 11.3), (25.4, 10.3), (25.8, 13.4), (17.2, 14.4)], nf=const((0.12, -0.78, 0.62)), shade=0.94))
    P.append(Capsule('spine', 'leather', 1.21, (17.0, 11.1), (17.2, 14.6), 0.3, 0.3))
    # as flores prensadas saindo entre as folhas (uma vermelha, uma azul) e o talo
    P.append(Capsule('stalk', 'stem', 1.22, (12.0, 15.4), (11.2, 17.2), 0.22, 0.18))
    for (c, mat) in (((11.0, 17.6), 'flowerred'), ((23.6, 13.8), 'flowerblue')):
        for k in range(5):
            a = k * 2 * math.pi / 5
            P.append(Ellipse('petal', mat, 1.23, (c[0] + math.cos(a) * 0.55, c[1] + math.sin(a) * 0.45), 0.5, 0.38, ang=a))
        P.append(Ellipse('heart', 'amber', 1.24, c, 0.25, 0.25))
    # a caixa das fichas, com as fichas em pé
    P.append(Poly('box', 'desk', 1.15, [(26.6, 10.6), (31.4, 10.0), (31.6, 12.6), (26.8, 13.2)], nf=const((0.0, -0.1, 1.0)), shade=0.85))
    for i, x in enumerate((27.4, 28.4, 29.4, 30.4)):
        P.append(Poly('card', 'vellum', 1.14, [(x, 10.7 - (i % 2) * 0.4), (x + 0.8, 10.6 - (i % 2) * 0.4), (x + 0.8, 8.4 - (i % 2) * 0.5), (x, 8.5 - (i % 2) * 0.5)], nf=const((0.0, -0.3, 0.95)), shade=0.95 - i * 0.03))
    # o tinteiro e a pena
    P.append(Ellipse('ink', 'iron', 1.3, (6.0, 13.0), 1.3, 0.9))
    P.append(Capsule('quill', 'vellum', 1.32, (6.2, 12.6), (9.0, 6.6), 0.4, 0.18, shade=1.05))
    # o frasco de Âmbar no canto, com a tampa de bronze
    P.append(Ellipse('jar', 'amber', 1.18, (3.8, 12.0), 1.5, 1.9))
    P.append(Capsule('lid', 'bronze', 1.19, (2.6, 10.2), (5.0, 10.2), 0.5, 0.5))
    ruled = lines(8.8, 16.4, 12.4, 15.0, step=0.95, slope=-0.14)

    def text(x, y, cur):
        r = ruled(x, y, cur)
        if r:
            return r
        # a coluna da direita: "devolver" ao lado de cada nome
        yy = y - (x - 17.4) * (-0.12)
        if 17.8 < x < 24.6 and 11.6 < yy < 13.8:
            if x > 22.0 and (yy - 11.6) % 0.95 < 0.4:
                return ('vellum', 1)
            if x < 21.4 and (yy - 11.6) % 0.95 < 0.36 and int(x * 2.6) % 5 != 0:
                return ('vellum', 1)
        return None
    return P, [Decal('lpage', text), Decal('rpage', text)], W, H, [(3.8, 12.0, 0xffa63c)]


# ---------------------------------------------------------------- a ficha dele (Arquivo, atrás da estante)
def record_arquivo1():
    """A ficha do carrasco atrás da estante falsa (24x16): a arca baixa de madeira escura com os cantos e a
    fechadura de bronze, e em cima a ficha grossa numa capa de couro, as folhas aparecendo na borda,
    amarrada com a fita vermelha e o selo da Casa."""
    W, H = 24, 16
    P = []
    # a arca: a frente, a tampa e os cantos de bronze
    P.append(Poly('chest', 'desk', 1.0, [(2.0, 7.4), (22.0, 7.4), (22.2, 16.0), (1.8, 16.0)], nf=const((0.0, 0.05, 1.0))))
    P.append(Poly('lid', 'desk', 1.02, [(1.4, 5.6), (22.6, 5.6), (22.0, 7.8), (2.0, 7.8)], nf=const((0.0, -0.85, 0.5))))
    for x in (1.8, 20.6):
        P.append(Poly('corner', 'bronze', 1.05, [(x, 6.4), (x + 1.6, 6.4), (x + 1.6, 16.0), (x, 16.0)], nf=const((0.0, -0.2, 0.98))))
    P.append(Poly('band', 'bronze', 1.04, [(1.8, 12.6), (22.2, 12.6), (22.2, 13.6), (1.8, 13.6)], nf=const((0.0, -0.3, 0.95)), shade=0.9))
    P.append(Poly('lockplate', 'bronze', 1.06, [(10.8, 8.4), (13.2, 8.4), (13.2, 11.4), (10.8, 11.4)], nf=const((0.0, -0.1, 1.0))))
    # a ficha: as folhas (a borda clara) e a capa de couro por cima
    P.append(Poly('pages', 'vellum', 1.1, [(4.6, 3.4), (19.2, 3.0), (19.6, 5.8), (4.2, 6.0)], nf=const((0.0, -0.1, 1.0)), shade=0.9))
    P.append(Poly('folder', 'leather', 1.12, [(4.2, 2.2), (19.4, 1.8), (19.8, 4.2), (4.0, 4.6)], nf=const((0.0, -0.8, 0.6))))
    # a fita vermelha em volta e o selo
    P.append(Poly('ribbon', 'waxred', 1.14, [(11.2, 1.9), (12.4, 1.9), (12.6, 6.0), (11.4, 6.0)], nf=const((0.0, -0.3, 0.95))))
    P.append(Ellipse('seal', 'waxred', 1.16, (11.9, 3.4), 1.3, 1.0))

    def seal(x, y, cur):
        r = math.hypot((x - 11.9) / 1.1, y - 3.4)
        if 0.6 < r < 0.8:
            return ('waxred', 1)
        return None

    def keyhole(x, y, cur):
        if abs(x - 12.0) < 0.3 and 9.4 < y < 10.8:
            return ('iron', 0)
        return None

    def page_edges(x, y, cur):
        # as folhas empilhadas, uma risca por folha
        if (y - 3.4) % 0.55 < 0.2:
            return ('vellum', 2)
        return None
    return P, [Decal('seal', seal), Decal('lockplate', keyhole), Decal('pages', page_edges)], W, H, []


# ---------------------------------------------------------------- a bancada das Experiências
def record_exp0():
    """A bancada das Experiências (36x26): o tampo pesado com a borda de bronze, as pernas de bronze e a
    prateleira de baixo com o rolo de cabo; em cima o caderno dos testes aberto, uma coroa de Âmbar de
    teste com o cabo descendo pela perna até o chão e um frasco de vidro com Âmbar no fundo."""
    W, H = 36, 26
    P = []
    # as pernas de bronze, a prateleira e o rolo de cabo
    for (x, sh) in ((4.0, 1.0), (32.0, 1.0), (7.0, 0.7), (29.0, 0.7)):
        P.append(Capsule('leg', 'bronze', 0.95 if sh < 1 else 1.0, (x, 25.8), (x, 13.0), 0.9, 0.9, shade=sh))
    P.append(Poly('shelf', 'desk', 0.97, [(3.4, 20.6), (32.6, 20.6), (32.6, 21.8), (3.4, 21.8)], nf=const((0.0, -0.7, 0.7)), shade=0.85))
    for k in range(3):
        P.append(Ellipse('coil', 'iron', 0.98 + k * 0.001, (20.0 + k * 0.4, 19.4 - k * 0.3), 3.0 - k * 0.6, 1.1 - k * 0.15, shade=0.85))
    # o tampo, a borda de bronze na frente
    P.append(Poly('top', 'desk', 1.1, [(1.4, 10.4), (34.6, 10.4), (34.6, 12.4), (1.4, 12.4)], nf=const((0.0, -0.85, 0.5))))
    P.append(Poly('edge', 'bronze', 1.12, [(1.2, 12.2), (34.8, 12.2), (34.8, 13.6), (1.2, 13.6)], nf=const((0.0, 0.1, 1.0))))
    # o caderno aberto
    P.append(Poly('lpage', 'vellum', 1.2, [(5.0, 10.6), (12.6, 9.6), (12.8, 11.6), (5.2, 12.0)], nf=const((-0.12, -0.8, 0.58))))
    P.append(Poly('rpage', 'vellum', 1.2, [(12.6, 9.6), (20.2, 9.0), (20.4, 11.4), (12.8, 11.6)], nf=const((0.12, -0.8, 0.58)), shade=0.94))
    P.append(Capsule('spine', 'leather', 1.21, (12.6, 9.5), (12.8, 11.7), 0.28, 0.28))
    # a coroa de teste: o aro de bronze e as pedras de Âmbar
    P.append(Ellipse('ring', 'bronze', 1.22, (26.4, 8.8), 3.4, 1.4))
    P.append(Ellipse('ringin', 'desk', 1.23, (26.4, 8.6), 2.4, 0.8, shade=0.6))
    for k, x in enumerate((23.6, 25.0, 26.4, 27.8, 29.2)):
        P.append(Poly('spike', 'amber', 1.24, [(x - 0.55, 8.6), (x, 5.6 - (k % 2) * 0.9), (x + 0.55, 8.6)], nf=const((0.2, -0.6, 0.78))))
    # o cabo: sai da coroa, cai pela ponta da bancada e desce pela perna até o chão
    P.append(Capsule('cable', 'iron', 1.25, (29.4, 9.4), (33.4, 10.6), 0.45, 0.45))
    P.append(Capsule('cable', 'iron', 1.18, (33.4, 10.6), (33.0, 25.4), 0.45, 0.45))
    P.append(Capsule('cable', 'iron', 1.17, (33.0, 25.4), (35.6, 25.6), 0.45, 0.4))
    # o frasco de vidro, com o Âmbar no fundo
    P.append(Ellipse('flask', 'glass', 1.21, (31.6, 8.4), 1.6, 1.9))
    P.append(Capsule('neck', 'glass', 1.215, (31.6, 6.8), (31.6, 5.0), 0.55, 0.5))
    P.append(Ellipse('amberin', 'amber', 1.216, (31.6, 9.4), 1.15, 0.7))
    ruled = lines(5.6, 19.8, 10.0, 11.6, step=0.75, slope=-0.08)

    def text(x, y, cur):
        return ruled(x, y, cur)
    return P, [Decal('lpage', text), Decal('rpage', text)], W, H, [(26.4, 7.0, 0xffa63c)]


# ---------------------------------------------------------------- a prancheta (planta do núcleo)
def record_exp1():
    """A prancheta do último andar das Experiências (28x40): o tripé de madeira, a prancha inclinada com o
    apoio do lápis e a planta do núcleo presa nela (a esfera presa por correntes no alto da torre, as cotas e,
    na margem, a conta a lápis dela), e uma folha caída no chão, no pé."""
    W, H = 28, 40
    P = []
    # a perna de trás (mais escura) e as duas da frente, abertas
    P.append(Capsule('backleg', 'desk', 0.9, (14.0, 39.6), (14.0, 14.0), 0.8, 0.7, shade=0.65))
    P.append(Capsule('leg', 'desk', 1.0, (5.0, 39.8), (10.6, 12.0), 0.95, 0.8))
    P.append(Capsule('leg', 'desk', 1.0, (23.0, 39.8), (17.4, 12.0), 0.95, 0.8))
    P.append(Capsule('brace', 'desk', 0.98, (7.4, 30.0), (20.6, 30.0), 0.55, 0.55, shade=0.85))
    # a prancha e o apoio do lápis
    P.append(Poly('board', 'desk', 1.1, [(3.6, 6.0), (24.4, 4.0), (25.0, 26.2), (4.0, 27.6)], nf=const((0.1, -0.35, 0.93))))
    P.append(Poly('ledge', 'desk', 1.14, [(3.2, 27.0), (25.4, 25.6), (25.6, 27.4), (3.4, 28.8)], nf=const((0.0, -0.8, 0.6))))
    P.append(Capsule('pencil', 'bronze', 1.16, (8.0, 27.0), (16.0, 26.4), 0.38, 0.3))
    # a planta, presa com quatro tachas
    P.append(Poly('plan', 'vellum', 1.2, [(5.6, 7.4), (22.6, 5.8), (23.0, 24.6), (6.0, 25.8)], nf=const((0.1, -0.35, 0.93))))
    for (x, y) in ((6.4, 8.2), (21.8, 6.7), (22.2, 23.8), (6.8, 25.0)):
        P.append(Ellipse('tack', 'bronze', 1.3, (x, y), 0.45, 0.45))
    # a folha caída no pé
    P.append(Poly('loose', 'vellum', 1.05, [(16.4, 38.8), (24.8, 38.2), (25.4, 39.8), (16.0, 40.0)], nf=const((0.0, -0.9, 0.4)), shade=0.9))

    def plan(x, y, cur):
        # a esfera do núcleo, presa por duas correntes que sobem até os cantos da torre
        cx, cy = 13.2, 13.0
        r = math.hypot(x - cx, (y - cy) * 1.05)
        if 2.9 < r < 3.35:
            return ('bronze', 1)
        if r < 2.9 and (x - cx + (y - cy) * 0.6) % 1.6 < 0.3:
            return ('vellum', 2)
        for (tx, ty) in ((8.4, 8.4), (18.0, 7.6)):
            # a corrente: um traço tracejado da esfera até o canto
            ax, ay = cx + (tx - cx) * 0.38, cy + (ty - cy) * 0.38
            vx, vy = tx - ax, ty - ay
            L = math.hypot(vx, vy)
            t = ((x - ax) * vx + (y - ay) * vy) / (L * L)
            if 0 < t < 1 and abs((x - ax) * vy - (y - ay) * vx) / L < 0.26 and int(t * 9) % 2 == 0:
                return ('bronze', 1)
        # o alto da torre embaixo da esfera
        if 8.6 < x < 17.8 and 18.2 < y < 18.6:
            return ('bronze', 1)
        if (abs(x - 9.4) < 0.24 or abs(x - 17.0) < 0.24) and 18.4 < y < 23.2:
            return ('bronze', 1)
        # as cotas e a conta a lápis dela, na margem da direita
        if 19.2 < x < 21.8 and 10.0 < y < 22.0 and (y - 10.0) % 1.1 < 0.34 and int(x * 3.1 + y) % 4 != 0:
            return ('iron', 3)
        if 7.0 < x < 11.0 and 22.4 < y < 24.0 and (y - 22.4) % 0.9 < 0.3:
            return ('vellum', 1)
        return None
    return P, [Decal('plan', plan)], W, H, []


PROPS = {
    'deco-record-trono-0': record_trono,
    'deco-record-patio-0': record_patio,
    'deco-record-arquivo-0': record_arquivo0,
    'deco-record-arquivo-1': record_arquivo1,
    'deco-record-experiencias-0': record_exp0,
    'deco-record-experiencias-1': record_exp1,
    'item-cetro': cetro_item,
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
    for k, fn in PROPS.items():
        if only and k not in only:
            continue
        prims, decals, W, H, L = fn()
        a = ink.render_frame(prims, decals, W, H, style=ink.HK)
        im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        im.save(f'{out}/{k}.png')
        made[k] = ink.S
        if prev:
            big = im.resize((im.width * 4, im.height * 4), Image.NEAREST)
            bg = Image.new('RGBA', big.size, (44, 52, 66, 255))
            bg.alpha_composite(big)
            bg.save(f'{prev}/{k}.png')
        print(k, im.size, len(prims), 'partes', flush=True)
    path = f'{out}/hd.json'
    hd = json.load(open(path)) if os.path.exists(path) else {}
    hd.update(made)
    json.dump(hd, open(path, 'w'), indent=1)

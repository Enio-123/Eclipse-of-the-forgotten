"""Objetos do Vale das Cachoeiras no traço liso (ink.py).

A Concha do Rio é a relíquia da área (nadar): uma concha em leque de rio, do tamanho da palma da mão,
com as costelas, as linhas de crescimento, o lodo perto da dobradiça e o furo que ela fez com um prego,
por onde passa o cordão.

Cada função devolve (prims, decals, W, H, luzes) em pixels do mundo; as luzes (x, y, cor) ficam em
relação ao canto da imagem. A relíquia usa o meio da imagem como origem, como as outras.

uso: python3 vale_props.py <pasta_assets> [nomes...] [--preview=<pasta>]
"""
import json
import math
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm

# a casca: creme de madrepérola por fora; o lodo de rio, verde-oliva, nas faixas velhas
puppet.RAMPS['shellcream'] = [0x4a4236, 0x82765f, 0xb8aa8c, 0xe0d4b8, 0xfbf3e0]
puppet.RAMPS['rivershell'] = [0x14130c, 0x2b2a18, 0x4a4626, 0x6f6638, 0x988a52]
puppet.RAMPS['nacre'] = [0x4c5262, 0x7c8498, 0xaeb6c8, 0xd8dfea, 0xf7faff]
# o furta-cor do madrepérola: um rosa e um verde-água quase brancos
puppet.RAMPS['nacrepink'] = [0x5a4a58, 0x8d7488, 0xbfa2b8, 0xe6cfe0, 0xfff2fa]
puppet.RAMPS['nacreteal'] = [0x44605e, 0x6f9290, 0xa0c4c0, 0xcfe9e4, 0xf1fffb]
puppet.RAMPS.setdefault('rope', [0x2e2418, 0x4d3d28, 0x705a3c, 0x967b54, 0xbca072])
puppet.SHINY['nacre'] = (0.75, 18)
puppet.SHINY['shellcream'] = (0.35, 12)
puppet.SHINY['nacrepink'] = (0.75, 18)
puppet.SHINY['nacreteal'] = (0.75, 18)
puppet.RIM_MATS |= {'rivershell', 'rope'}
# o remo e o livro de bordo do Barqueiro: madeira encharcada, o oleado verde, o papel amarelado, a
# alga e as cracas de Âmbar
puppet.RAMPS.setdefault('oarwood', [0x150e08, 0x2a1c11, 0x45301d, 0x664729, 0x8c6a40])
puppet.RAMPS.setdefault('oilcloth', [0x0c1410, 0x17251c, 0x24392a, 0x37533c, 0x557553])
puppet.RAMPS.setdefault('paper', [0x4a3f2c, 0x7d6c4c, 0xb0a07a, 0xd8caa2, 0xf2e8c8])
puppet.RAMPS.setdefault('weed', [0x0b150e, 0x152518, 0x203824, 0x2f4f34, 0x426a47])
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
puppet.SHINY.setdefault('oarwood', (0.35, 14))
puppet.SHINY.setdefault('oilcloth', (0.55, 16))
puppet.SHINY.setdefault('amber', (0.7, 16))
AMBER = 0xffa63c


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def const(n):
    v = norm(n)
    return lambda x, y: v


def shell():
    """A Concha do Rio (20x24, pelo meio): uma concha em leque de rio, a dobradiça em cima com as duas
    orelhas, as costelas abrindo para a borda recortada e as linhas de crescimento atravessando; cor de
    creme com faixas de lodo esverdeado perto da dobradiça e brilho de madrepérola nas costelas. O
    cordão faz uma alça em cima e passa pelo furo do prego, logo abaixo da dobradiça."""
    W, H = 20, 24
    P = []
    hx, hy = 10.0, 7.6
    R = 12.6
    ribs = 9
    a0, a1 = math.pi * 0.16, math.pi * 0.84
    # o cordão: a alça em cima e as duas pernas descendo até o furo
    P.append(Ellipse('loop', 'rope', 0.5, (10.0, 1.9), 2.5, 1.4, shade=0.95))
    P.append(Ellipse('loophole', 'void', 0.51, (10.0, 1.8), 1.5, 0.7, flat=0))
    P.append(Capsule('cordl', 'rope', 0.55, (7.8, 2.5), (9.5, 8.6), 0.42, 0.4, shade=0.9))
    P.append(Capsule('cordr', 'rope', 0.56, (12.2, 2.5), (10.5, 8.6), 0.42, 0.4, shade=0.82))
    # o leque: a borda de baixo recortada pelas costelas
    pts = [(hx - 2.6, hy - 0.4), (hx + 2.6, hy - 0.4)]
    n = 60
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        k = (a - a0) / (a1 - a0)
        r = R * (0.86 + 0.14 * math.sin(k * math.pi)) + 0.55 * abs(math.sin(k * ribs * math.pi))
        pts.append((hx + math.cos(a) * r, hy + math.sin(a) * r * 0.92))

    def fan_n(x, y):
        X = np.asarray(x, np.float32)
        Y = np.asarray(y, np.float32)
        a = np.arctan2(Y - hy, X - hx)
        r = np.hypot(X - hx, (Y - hy) / 0.92) / R
        k = (a - a0) / (a1 - a0)
        rib = np.sin(k * ribs * math.pi * 2.0)
        nx = np.cos(a) * 0.45 * r - np.sin(a) * rib * 0.42 * np.minimum(1.0, r * 2.0)
        ny = np.sin(a) * 0.45 * r + np.cos(a) * rib * 0.42 * np.minimum(1.0, r * 2.0)
        return (nx, ny, 0.8 + 0 * X)
    P.append(Poly('fan', 'shellcream', 1.0, pts, nf=fan_n))
    # as orelhas da dobradiça, dos dois lados do bico
    P.append(Poly('earl', 'shellcream', 1.05, [(hx - 0.6, hy - 1.2), (hx - 4.4, hy - 1.0), (hx - 4.0, hy + 1.4), (hx - 0.8, hy + 2.0)],
                  nf=lambda x, y: (-0.3, -0.3, 0.9), shade=0.92))
    P.append(Poly('earr', 'shellcream', 1.05, [(hx + 0.6, hy - 1.2), (hx + 4.4, hy - 1.0), (hx + 4.0, hy + 1.4), (hx + 0.8, hy + 2.0)],
                  nf=lambda x, y: (0.3, -0.3, 0.9), shade=0.86))
    P.append(Ellipse('umbo', 'shellcream', 1.1, (hx, hy + 0.4), 1.9, 1.5, bulge=0.9, shade=1.08))
    # o furo do prego, por onde o cordão passa
    P.append(Ellipse('hole', 'void', 1.2, (hx, hy + 1.3), 0.62, 0.58, flat=0))

    def fan_dec(x, y, cur):
        dx, dy = x - hx, (y - hy) / 0.92
        r = math.hypot(dx, dy) / R
        a = math.atan2(dy, dx)
        k = (a - a0) / (a1 - a0)
        # as linhas de crescimento: anéis em volta da dobradiça, mais juntos perto da borda
        ring = math.sin((r ** 0.8) * 34.0 + math.sin(k * 7.0) * 0.6)
        if r < 0.36:
            # o lodo esverdeado perto da dobradiça
            return ('rivershell', 2 if ring > 0.2 else 1)
        if ring > 0.86:
            return ('rivershell', 3)
        # o brilho de madrepérola no alto das costelas
        rib = math.sin(k * ribs * math.pi * 2.0)
        if rib > 0.82 and 0.45 < r < 0.95 and math.sin(r * 9.0 + k * 3.0) > 0.2:
            return ('nacrepink' if k < 0.5 else 'nacreteal', 4)
        return None
    return P, [Decal('fan', fan_dec)], W, H, []


# ---------------------------------------------------------------- o Remo do Barqueiro
def remo_item():
    """O Remo do Barqueiro deitado em diagonal (32x32): o cabo comprido de madeira encharcada, a corda
    enrolada no punho, a ponteira de ferro no pé e a pá larga em cima, gasta na borda, com duas cracas
    de Âmbar e um fio de alga; uma gota ainda escorrendo da ponta."""
    W = H = 32
    butt, neck = (3.2, 29.0), (19.6, 12.6)
    d = (neck[0] - butt[0], neck[1] - butt[1])
    L = math.hypot(*d)
    sd = (d[0] / L, d[1] / L)
    side = (sd[1], -sd[0])
    P = [Capsule('haft', 'oarwood', 1.0, butt, add(neck, sd, 1.0), 0.95, 0.85, shade=0.95)]
    P.append(Ellipse('ferrule', 'steel', 1.01, add(butt, sd, 0.6), 1.25, 1.25, shade=0.8))
    for t in (0.3, 0.36, 0.42, 0.48):
        c = add(butt, sd, L * t)
        P.append(Capsule('wrap', 'rope', 1.02, add(c, sd, -0.9), add(c, sd, 0.9), 1.3, 1.3, shade=0.85))

    def B(a, b):
        return add(add(neck, sd, a), side, b)
    blade = [B(-1.2, -0.9), B(2.0, -2.6), B(6.0, -3.3), B(10.0, -3.2), B(12.4, -2.3), B(13.3, -0.3),
             B(13.0, 1.4), B(11.4, 2.9), B(9.2, 2.6), B(8.4, 3.3), B(5.0, 3.3), B(2.0, 2.6), B(-1.2, 0.9)]
    nb = (side[0] * 0.2, side[1] * 0.2 - 0.35, 0.9)
    P.append(Poly('oblade', 'wood', 1.04, blade, nf=const(nb), shade=0.8))
    P.append(Capsule('orib', 'oarwood', 1.05, B(-0.6, 0.0), B(8.6, 0.0), 0.6, 0.35, shade=1.1))
    P.append(Capsule('oedge', 'wood', 1.06, B(11.8, -2.2), B(13.1, -0.2), 0.5, 0.45, shade=1.25))
    P.append(Ellipse('craca', 'amber', 1.07, B(7.2, 1.6), 0.95, 0.8, flat=3))
    P.append(Ellipse('craca', 'amber', 1.07, B(9.8, -1.8), 0.65, 0.55, flat=3))
    # o fio de alga preso no pescoço da pá, caindo pelo lado
    g0 = B(0.4, 1.6)
    prev = g0
    for k in range(1, 4):
        q = (g0[0] + math.sin(k * 1.6) * 0.6, g0[1] + 2.0 * k)
        P.append(Capsule('alga', 'weed', 1.03, prev, q, 0.55 - 0.1 * k, 0.45 - 0.1 * k, shade=0.9))
        prev = q
    # a gota na ponta da pá
    tip = B(13.4, 0.4)
    P.append(Ellipse('gota', 'nacreteal', 1.08, (tip[0] + 0.4, tip[1] + 1.8), 0.55, 0.75, flat=4))
    cx, cy = B(8.4, 1.6)
    return P, [], W, H, [(cx, cy, AMBER)]


# ---------------------------------------------------------------- o livro de bordo
def record_cais():
    """O livro de bordo do Barqueiro (20x12), deitado nas tábuas do cais: embrulhado no oleado verde
    escuro, amarrado em cruz com o barbante e o nó em cima; a ponta do oleado aberta mostra a borda das
    folhas amareladas e a fita de marcar página, caindo para fora."""
    W, H = 20, 12
    P = []
    # o livro (a lombada para cá), um pouco em perspectiva: a tampa de cima e a borda de frente
    top = [(2.0, 4.2), (16.6, 3.4), (18.4, 6.6), (3.4, 7.6)]
    front = [(3.4, 7.6), (18.4, 6.6), (18.4, 9.8), (3.4, 11.0)]
    P.append(Poly('front', 'oilcloth', 1.0, front, nf=const((0.0, 0.2, 0.95)), shade=0.8))
    P.append(Poly('top', 'oilcloth', 1.05, top, nf=const((0.0, -0.75, 0.6)), shade=1.0))
    # a ponta do oleado dobrada para trás no canto: aparece a borda das folhas
    pages = [(14.6, 7.0), (18.4, 6.6), (18.4, 9.8), (14.6, 10.2)]
    P.append(Poly('pages', 'paper', 1.1, pages, nf=const((0.2, 0.1, 0.95)), shade=0.95))
    P.append(Poly('flap', 'oilcloth', 1.12, [(14.2, 6.6), (17.6, 4.0), (19.2, 5.2), (16.4, 7.2)], nf=const((0.3, -0.6, 0.7)), shade=1.15))
    # o barbante em cruz e o nó
    P.append(Capsule('cordh', 'rope', 1.2, (2.8, 6.0), (17.6, 5.0), 0.38, 0.38, shade=0.9))
    P.append(Capsule('cordv', 'rope', 1.21, (9.6, 3.9), (10.4, 7.2), 0.38, 0.38, shade=0.95))
    P.append(Capsule('cordv2', 'rope', 1.22, (10.4, 7.2), (10.4, 10.5), 0.38, 0.38, shade=0.8))
    P.append(Ellipse('knot', 'rope', 1.25, (10.0, 5.6), 1.0, 0.8, shade=1.05))
    P.append(Capsule('end1', 'rope', 1.24, (10.0, 5.6), (12.2, 4.4), 0.32, 0.28, shade=1.0))
    P.append(Capsule('end2', 'rope', 1.24, (10.0, 5.6), (11.8, 6.8), 0.32, 0.28, shade=0.9))
    # a fita vermelha de marcar página, saindo pelas folhas
    P.append(Capsule('ribbon', 'nacrepink', 1.3, (16.2, 9.6), (15.4, 11.6), 0.4, 0.35, shade=0.7))

    def edges(x, y, cur):
        # as linhas das folhas na borda
        if 7.2 < y < 10.0 and 14.8 < x < 18.2 and int(y * 3.0) % 2 == 0:
            return ('paper', 2)
        return None

    def sheen(x, y, cur):
        # o oleado brilha molhado em riscos
        if abs(math.sin(x * 0.9 + y * 2.1)) < 0.12:
            return ('oilcloth', 4)
        return None
    return P, [Decal('pages', edges), Decal('top', sheen)], W, H, []


# ---------------------------------------------------------------- os registros do vale
# a lata, o pano encerado, o arenito da soleira, a tábua clara, as pedras de rio e o selo da Casa
puppet.RAMPS.setdefault('tin', [0x1b1d20, 0x32363b, 0x4d535a, 0x6e757e, 0x959ca6])
puppet.RAMPS.setdefault('tindark', [0x08090b, 0x111317, 0x1b1e23, 0x272b31, 0x353a42])
puppet.RAMPS.setdefault('waxcloth', [0x33260f, 0x5e4a1f, 0x8c7232, 0xb3974c, 0xd6bd70])
puppet.RAMPS.setdefault('burlap', [0x2a1f14, 0x4a3825, 0x6e5638, 0x917650, 0xb59a6c])
puppet.RAMPS.setdefault('valestone', [0x3a2420, 0x6e4438, 0x9c6450, 0xc58a66, 0xe2b08a])
puppet.RAMPS.setdefault('plank', [0x24221f, 0x423e38, 0x67615a, 0x8f887e, 0xb6aea2])
puppet.RAMPS.setdefault('oldwood', [0x1a110b, 0x2e1f14, 0x46301e, 0x634529, 0x84603a])
puppet.RAMPS.setdefault('iron', [0x101218, 0x1d2029, 0x30343f, 0x4b505e, 0x737a8b])
puppet.RAMPS.setdefault('waxred', [0x330909, 0x5e1212, 0x8a1f1c, 0xb33a2c, 0xd8694f])
puppet.RAMPS.setdefault('bronze', [0x2e1f10, 0x5a3a18, 0x8a5c26, 0xb98a3e, 0xe4bd72])
puppet.RAMPS.setdefault('riverstone', [0x1d2022, 0x363b3d, 0x545a5b, 0x777e7d, 0x9ba29f])
puppet.SHINY.setdefault('tin', (0.5, 12))
puppet.SHINY.setdefault('iron', (0.45, 12))
puppet.SHINY.setdefault('bronze', (0.5, 9))
puppet.SHINY.setdefault('waxred', (0.35, 10))
puppet.SHINY.setdefault('waxcloth', (0.3, 8))
puppet.RIM_MATS |= {'oldwood', 'valestone', 'plank', 'tin'}


def writing(x, y, x0, x1, y0, y1, step=1.6, ink=('iron', 1), skip=6):
    """Linhas de letra miúda num retângulo: cada linha um traço com falhas entre as palavras."""
    if not (x0 < x < x1 and y0 < y < y1):
        return None
    k = (y - y0) % step
    if k < 0.55 and int(x * 2.1 + y * 1.3) % skip != 0:
        return ink
    return None


def record_gruta():
    """A lista do que levar (26x14): a caixa de lata aberta em cima do pano encerado desembrulhado, na
    laje do bolsão de ar. Dentro, o maço das cópias dos registros amarrado em barbante e o saquinho
    das sementes; por cima de tudo, a lista dobrada em quatro. A tampa está encostada no lado da caixa,
    com o pé no pano; do outro lado, a corda enrolada."""
    W, H = 26, 14
    P = []
    # o pano encerado aberto no chão, com as pontas dobradas
    P.append(Poly('cloth', 'waxcloth', 0.7, [(0.4, 10.4), (12.0, 9.6), (25.6, 10.2), (25.9, 13.9), (0.1, 13.9)], nf=const((0.0, -0.7, 0.7)), shade=1.1))
    P.append(Poly('clothfold', 'waxcloth', 0.72, [(21.6, 10.6), (25.4, 10.8), (24.2, 12.0)], nf=const((0.4, -0.6, 0.7)), shade=1.2))
    # a corda enrolada à esquerda
    P.append(Ellipse('coil', 'rope', 0.9, (3.8, 11.9), 3.0, 1.6, shade=0.95))
    P.append(Ellipse('coilin', 'rope', 0.91, (3.8, 11.5), 1.9, 0.95, shade=0.7))
    P.append(Capsule('coilend', 'rope', 0.92, (5.8, 12.4), (7.6, 13.4), 0.4, 0.35))
    # a caixa: a frente, a boca aberta (o fundo escuro) e a borda dobrada da lata
    P.append(Poly('box', 'tin', 1.0, [(7.0, 6.4), (18.2, 6.0), (18.4, 13.3), (7.2, 13.6)], nf=const((0.0, 0.05, 1.0))))
    P.append(Poly('mouth', 'tindark', 1.01, [(7.2, 4.8), (18.0, 4.4), (18.2, 6.1), (7.0, 6.5)], nf=const((0.0, -0.9, 0.4))))
    P.append(Capsule('rim', 'tin', 1.03, (7.0, 6.4), (18.2, 6.0), 0.45, 0.45, shade=1.2))
    # o maço das cópias, amarrado em cruz, e o saquinho das sementes, saindo da boca da lata
    P.append(Poly('stack', 'paper', 1.02, [(8.2, 3.6), (14.6, 3.2), (14.8, 6.0), (8.4, 6.2)], nf=const((0.0, -0.5, 0.85)), shade=0.9))
    P.append(Capsule('string', 'rope', 1.025, (11.2, 3.4), (11.4, 6.0), 0.3, 0.3, shade=0.8))
    P.append(Ellipse('seeds', 'burlap', 1.022, (16.4, 4.6), 1.7, 1.5, shade=0.95))
    P.append(Capsule('seedtie', 'rope', 1.024, (15.6, 3.4), (17.0, 3.2), 0.3, 0.3))
    # a lista dobrada em quatro, por cima do maço, um pouco aberta
    P.append(Poly('list', 'paper', 1.04, [(9.0, 2.4), (14.0, 1.8), (14.4, 3.9), (9.2, 4.4)], nf=const((0.1, -0.6, 0.8)), shade=1.12))
    # a tampa encostada no lado da caixa, o pé no pano
    P.append(Poly('lid', 'tin', 1.05, [(18.3, 6.2), (20.4, 5.6), (24.6, 13.4), (22.4, 13.8)], nf=const((0.55, -0.2, 0.8)), shade=1.05))
    P.append(Capsule('lidrim', 'tin', 1.06, (20.4, 5.6), (24.6, 13.4), 0.4, 0.4, shade=1.3))

    def tin(x, y, cur):
        # as amassadas e a ferrugem da lata
        if math.hypot(x - 10.4, y - 10.2) < 1.1 or math.hypot(x - 15.8, y - 8.4) < 0.8:
            return ('tin', 1)
        if y > 12.4 and int(x * 1.7) % 3 == 0:
            return ('rope', 1)
        return None

    def note(x, y, cur):
        # a dobra no meio e a letra miúda dela
        if abs(x - 11.6) < 0.25:
            return ('paper', 2)
        return writing(x, y, 9.6, 13.8, 2.6, 4.0, step=1.1, ink=('iron', 2), skip=5)

    def folds(x, y, cur):
        if abs((x - 1.0) * 0.08 + (y - 11.0) - 1.5) < 0.18 and x < 7.0:
            return ('waxcloth', 1)
        return None
    return P, [Decal('box', tin), Decal('list', note), Decal('cloth', folds)], W, H, []


def record_prainha():
    """A planta da casa (28x24): a tábua lisa de pé na areia, encostada no bloco de canto da soleira
    (as primeiras pedras da casa, arenito do vale, uma em cima da outra). Na tábua, a planta riscada a
    carvão: dois cômodos, a porta para o rio, a janela para as cachoeiras e a prateleira comprida da
    parede do fundo, com a letra dela; no canto, a conta torta dele. O toco de carvão ficou na
    soleira."""
    W, H = 28, 24
    P = []
    # a soleira comprida e o bloco de canto em cima dela, à direita (pedra lavrada, cantos gastos)
    P.append(Poly('sill', 'valestone', 0.8, [(8.6, 20.0), (18.0, 19.7), (27.6, 19.9), (27.9, 23.9), (8.3, 23.9)], nf=const((0.0, -0.25, 0.97))))
    P.append(Poly('sillcap', 'valestone', 0.81, [(8.8, 19.0), (27.2, 18.8), (27.6, 19.9), (8.6, 20.1)], nf=const((0.0, -0.9, 0.4)), shade=1.12))
    P.append(Poly('block', 'valestone', 0.82, [(18.4, 10.6), (19.2, 9.9), (26.6, 9.7), (27.3, 10.5), (27.3, 18.9), (18.2, 19.1)], nf=const((0.2, -0.1, 0.97))))
    P.append(Poly('blockcap', 'valestone', 0.83, [(18.6, 9.4), (26.4, 9.1), (27.1, 9.9), (18.8, 10.4)], nf=const((0.0, -0.9, 0.4)), shade=1.15))
    # a tábua de pé, o topo encostado no bloco (um pouco tombada para ele)
    TOP, BOT, LEAN = 4.8, 23.9, 1.4
    P.append(Poly('plank', 'plank', 1.0, [(3.6 + LEAN, TOP), (16.8 + LEAN, TOP - 0.4), (17.2, BOT), (3.6, BOT)], nf=const((0.0, -0.3, 0.95))))
    P.append(Capsule('plankedge', 'plank', 1.01, (3.6 + LEAN, TOP), (16.8 + LEAN, TOP - 0.4), 0.45, 0.45, shade=1.25))
    # o toco de carvão em cima da soleira, ao pé do bloco
    P.append(Capsule('charcoal', 'iron', 1.1, (19.6, 18.7), (21.4, 18.6), 0.42, 0.38, shade=0.7))

    def plan(x, y, cur):
        # a tábua tomba um pouco: o desenho anda junto
        x = x - LEAN * (BOT - y) / (BOT - TOP)
        ink = ('iron', 2)
        x0, x1, y0, y1 = 5.4, 15.4, 7.4, 16.0
        th = 0.28
        wall = ((abs(x - x0) < th or abs(x - x1) < th) and y0 - th < y < y1 + th) or \
               ((abs(y - y0) < th or abs(y - y1) < th) and x0 - th < x < x1 + th) or \
               (abs(x - 10.6) < th and y0 < y < y1 and not 11.0 < y < 12.6)
        # a porta para o rio (embaixo, à esquerda) e a janela das cachoeiras (à direita)
        if abs(y - y1) < th and 7.0 < x < 8.8:
            wall = False
        if abs(x - x1) < th + 0.1 and 9.8 < y < 11.8:
            return ('iron', 3)
        if wall:
            return ink
        # a prateleira comprida da parede do fundo, com os riscos das divisões
        if abs(y - 8.4) < 0.2 and x0 + 0.5 < x < x1 - 0.5:
            return ('iron', 3)
        if 8.4 < y < 9.2 and x0 + 0.5 < x < x1 - 0.5 and int(x * 1.25) % 3 == 0:
            return ('iron', 3)
        # a letra dela, miúda, embaixo da casa
        w = writing(x, y, 5.2, 15.2, 17.4, 19.8, step=1.1, ink=('iron', 3), skip=5)
        if w:
            return w
        # a conta dele no canto de cima, grossa e torta, riscada e refeita
        if 5.6 < x < 9.4 and 5.4 < y < 6.9 and int(x * 1.2 + y * 0.7) % 3 != 0:
            return ('iron', 1)
        # os veios da tábua
        if abs(math.sin(x * 0.35 + y * 0.12) * 3.0 - (y % 6.0)) < 0.12:
            return ('plank', 2)
        return None

    def stone(x, y, cur):
        # as marcas do cinzel no arenito e a junta entre as pedras da soleira
        if abs(x - 22.6) < 0.25 and y > 20.0:
            return ('valestone', 0)
        if int(x * 0.9 + y * 2.3) % 7 == 0 and int(y * 1.5) % 2 == 0:
            return ('valestone', 1)
        return None
    return P, [Decal('plank', plan), Decal('sill', stone), Decal('block', stone)], W, H, []


def record_rio():
    """A ordem do aqueduto (18x36): o poste de aviso da Casa cravado na areia da ilha, ao pé do pilar,
    calçado com pedras de rio; a cinta de bronze em cima, como as juntas do aqueduto. A ordem pregada
    com quatro cravos, o cabeçalho grosso e o selo de cera vermelha embaixo; na margem, a lápis, a letra
    miúda dela."""
    W, H = 18, 36
    P = []

    def post_n(x, y):
        t = np.clip((np.asarray(x, np.float32) - 9.2) / 1.9, -1, 1)
        return (t * 0.8, -0.05 + 0 * t, np.sqrt(np.maximum(0.1, 1 - (t * 0.8) ** 2)))
    P.append(Poly('post', 'oldwood', 1.0, [(7.4, 35.9), (7.7, 3.4), (10.9, 2.6), (11.1, 35.9)], nf=post_n))
    # a cinta de bronze perto do topo
    P.append(Poly('band', 'bronze', 1.02, [(7.5, 5.0), (11.0, 4.6), (11.0, 6.4), (7.5, 6.8)], nf=post_n))
    for bx in (8.2, 10.3):
        P.append(Ellipse('rivet', 'bronze', 1.03, (bx, 5.7), 0.45, 0.45, shade=1.2))
    # as pedras de rio calçando o pé do poste
    for (sx, sy, rx, ry, k) in ((5.0, 34.4, 2.6, 1.7, 0.9), (13.4, 34.6, 2.9, 1.5, 0.95), (9.4, 35.0, 1.8, 1.1, 1.05), (2.2, 35.2, 1.6, 0.9, 0.85)):
        P.append(Ellipse('stone', 'riverstone', 1.06, (sx, sy), rx, ry, shade=k))
    # a ordem: papel grosso, ondulado de umidade, os cantos de baixo enrolando
    def paper_n(x, y):
        w = np.sin((np.asarray(y, np.float32) - 9.0) * 0.6) * 0.12
        return (w, -0.12 + 0 * w, 0.98 + 0 * w)
    P.append(Poly('order', 'paper', 1.2, [(2.0, 8.6), (16.0, 8.2), (16.3, 25.8), (14.8, 27.0), (3.2, 27.2), (1.8, 26.0)], nf=paper_n))

    def text(x, y, cur):
        # cabeçalho grosso, as linhas miúdas, o vão do selo e a nota a lápis na margem direita
        if 9.8 < y < 11.6 and 3.6 < x < 14.4 and int(x * 1.6) % 4 != 3:
            return ('paper', 0)
        if 12.6 < y < 20.8 and 3.4 < x < 12.6:
            k = (y - 12.6) % 1.6
            if k < 0.6 and int(x * 2.1 + y) % 6 != 0:
                return ('paper', 1)
        if 13.0 < x < 15.4 and 12.8 < y < 21.4 and int(y * 1.7) % 2 == 0 and int(x * 3.0 + y) % 4 != 0:
            return ('iron', 3)
        return None
    P.append(Capsule('ribbon', 'waxred', 1.25, (8.0, 24.4), (7.0, 29.2), 0.5, 0.42, shade=0.85))
    P.append(Capsule('ribbon', 'waxred', 1.25, (10.0, 24.4), (11.2, 28.8), 0.5, 0.42, shade=0.85))
    P.append(Ellipse('seal', 'waxred', 1.3, (9.0, 24.0), 2.2, 2.1))

    def seal(x, y, cur):
        r = math.hypot(x - 9.0, y - 24.0)
        if 1.35 < r < 1.7:
            return ('waxred', 1)
        if r < 0.8 and abs(x - 9.0) < 0.32:
            return ('waxred', 4)
        return None
    for (nx, ny) in ((3.0, 9.6), (15.0, 9.2), (3.8, 26.2), (15.0, 25.6)):
        P.append(Ellipse('nail', 'iron', 1.35, (nx, ny), 0.6, 0.6))
    return P, [Decal('order', text), Decal('seal', seal)], W, H, []


PROPS = {
    'relic-swim': shell,
    'item-remo': remo_item,
    'deco-record-cais-0': record_cais,
    'deco-record-gruta-0': record_gruta,
    'deco-record-prainha-0': record_prainha,
    'deco-record-rio-0': record_rio,
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

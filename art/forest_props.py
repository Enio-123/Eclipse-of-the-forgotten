"""Objetos da Floresta Nevada no traço liso (ink.py).

O retalho vermelho da capa dela fica pendurado pelo capuz numa alça de cordão, no prego ao lado da
porta da cabana; a paliçada é a grade da clareira (dois troncos afiados amarrados com corda, as pontas
para baixo, sobe para dentro da pedra); os registros são o bilhete na casca (uma tira de casca de
bétula amarrada numa estaca com a fita vermelha), o herbário aberto em cima do baú, a carta dobrada
em cima da mesa e o livro da caça aberto num toco; a Lança do Caçador é o que o Mestre deixa cair.

Cada função devolve (prims, decals, W, H, luzes) em pixels do mundo; as luzes (x, y, cor) ficam em
relação ao canto da imagem. Origens que o jogo usa: a capa pela alça (meio de cima), a paliçada pelo
canto de cima, os registros pelo meio de baixo, a lança pelo meio.

uso: python3 forest_props.py <pasta_assets> [nomes...] [--preview=<pasta>]
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

# as cores da capa são as mesmas do retalho que o jogo desenha nas costas dele (gfx/cape.ts)
puppet.RAMPS['redcape'] = [0x2a0709, 0x55101a, 0x8a1a24, 0xb4222b, 0xe2483f]
puppet.RAMPS['capelining'] = [0x1a0606, 0x2c0b0d, 0x401114, 0x58191b, 0x722424]
puppet.RAMPS['rope'] = [0x2e2418, 0x4d3d28, 0x705a3c, 0x967b54, 0xbca072]
puppet.RAMPS['birch'] = [0x3d3a36, 0x8a857c, 0xbdb6a8, 0xdfd8c9, 0xf6f1e6]
puppet.RAMPS['snow'] = [0x5d6c82, 0x8ea0b8, 0xbccbdd, 0xe2ebf5, 0xfafdff]
puppet.RAMPS['logbark'] = [0x15110f, 0x2a221d, 0x403429, 0x5a4a3a, 0x77644f]
puppet.RAMPS['heartwood'] = [0x4a3424, 0x70523a, 0x977356, 0xbb9773, 0xdcbf9a]
puppet.RAMPS['flower'] = [0x2a1030, 0x4a1d55, 0x6f3380, 0x9a55a8, 0xc58fd0]
puppet.RAMPS['dryleaf'] = [0x1d2416, 0x334026, 0x4c5c38, 0x687a4c, 0x8a9a68]
puppet.RAMPS.setdefault('frost', [0x4f5f74, 0x7d90a8, 0xa9bdd3, 0xd3e2f0, 0xf4f9ff])
puppet.RAMPS.setdefault('brass', [0x3a2a10, 0x5e4419, 0x8a6a2a, 0xb8923f, 0xdcc070])
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
puppet.RAMPS.setdefault('iron', [0x101218, 0x1d2029, 0x30343f, 0x4b505e, 0x737a8b])
puppet.RAMPS.setdefault('oldwood', [0x1a110b, 0x2e1f14, 0x46301e, 0x634529, 0x84603a])
puppet.RAMPS.setdefault('paper', [0x3a3226, 0x6a5c46, 0x9c8b6c, 0xc9b892, 0xece0be])
puppet.SHINY.setdefault('frost', (0.45, 12))
puppet.SHINY.setdefault('brass', (0.6, 10))
puppet.SHINY.setdefault('amber', (0.7, 16))
puppet.SHINY.setdefault('iron', (0.45, 12))
puppet.RIM_MATS |= {'redcape', 'logbark', 'oldwood', 'rope'}

AMBER = 0xffa63c
WARM = 0xffc27a


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def const(n):
    n = norm(n)
    return lambda x, y: n


def log_nf(cx, r, lean=0.0):
    """Normal de tronco em pé (cilindro vertical), com a luz pegando mais do lado esquerdo."""
    def nf(x, y):
        t = np.clip((np.asarray(x, np.float32) - cx - lean * (np.asarray(y, np.float32))) / r, -1.0, 1.0)
        return (t, -0.12 + 0 * t, np.sqrt(np.maximum(0.0, 1 - t * t)) + 0.12)
    return nf


# ---------------------------------------------------------------- a capa dela
def cape():
    """O retalho vermelho da capa dela, pendurado pelo capuz numa alça de cordão: o capuz dobrado em
    cima, os laços do pescoço, o pano caindo em pregas que abrem para baixo e a barra rasgada (foi
    arrancado de algo maior). Perto da barra, a florzinha bordada. A origem é a alça (meio de cima)."""
    W, H = 22, 32
    cx = 11.0
    rnd = random.Random(5)
    P = []
    # a alça de cordão em volta do prego (o prego está na pintura, atrás)
    P.append(Ellipse('loop', 'rope', 0.5, (cx, 1.5), 1.35, 1.15, shade=0.9))
    P.append(Ellipse('loophole', 'void', 0.51, (cx, 1.4), 0.55, 0.45, flat=0))
    P.append(Capsule('loopcord', 'rope', 0.6, (cx, 2.4), (cx, 4.2), 0.45, 0.45, shade=0.85))
    # o pano: do ombro (estreito, preso pelo capuz) até a barra larga e rasgada
    # a barra rasgada: pontas de tamanhos diferentes, uma tira comprida pendurada
    hem = []
    x = 21.0
    i = 0
    while x > 1.0:
        down = i % 2 == 0
        y = 28.0 + (rnd.uniform(1.0, 2.8) if down else rnd.uniform(-1.2, 0.2)) + math.sin(x * 0.4) * 0.5
        if down and 7.0 < x < 10.0:
            y += 1.6
        hem.append((x, min(H - 0.4, y)))
        x -= rnd.uniform(1.0, 2.6)
        i += 1
    hem.append((1.0, 28.6))
    body = [(cx - 4.2, 8.6), (cx + 4.2, 8.6), (cx + 6.4, 14.0), (cx + 8.6, 21.0), (21.0, 28.0)] + hem + [(1.0, 28.0), (cx - 8.4, 21.0), (cx - 6.4, 14.0)]

    def folds(x, y):
        X = np.asarray(x, np.float32)
        Y = np.asarray(y, np.float32)
        # as pregas saem do ombro e abrem para baixo: a fase depende de x dividido pela largura
        wdt = 4.2 + np.maximum(0.0, Y - 8.6) * 0.42
        ph = (X - cx) / wdt * 3.4
        nx = np.sin(ph * 1.6) * 0.55 + (X - cx) / 30.0
        return (nx, -0.1 + 0 * X, 0.82 + 0 * X)
    P.append(Poly('cloth', 'redcape', 1.0, body, nf=folds))
    # o forro escuro aparecendo na dobra de dentro (lado de trás do pano, embaixo à direita)
    P.append(Poly('back', 'capelining', 0.95, [(cx + 6.6, 15.0), (cx + 9.6, 21.5), (21.4, 28.6), (19.0, 29.6), (cx + 7.0, 22.0)],
                  nf=const((0.5, 0.0, 0.8))))
    # o capuz dobrado por cima do ombro: a ponta presa na alça e a boca do capuz aberta embaixo
    hood = [(cx, 3.6), (cx + 3.4, 5.6), (cx + 5.4, 9.6), (cx + 4.6, 12.0), (cx, 12.8), (cx - 4.6, 12.0), (cx - 5.4, 9.6), (cx - 3.4, 5.6)]

    def hood_n(x, y):
        X = (np.asarray(x, np.float32) - cx) / 5.4
        Y = (np.asarray(y, np.float32) - 8.4) / 4.6
        return (X * 0.7, Y * 0.35 - 0.2, 0.75 + 0 * X)
    P.append(Poly('hood', 'redcape', 1.2, hood, nf=hood_n, shade=1.05))
    P.append(Ellipse('hoodin', 'capelining', 1.25, (cx + 0.2, 10.9), 3.6, 1.6, shade=0.8))
    # os laços do pescoço, caindo da boca do capuz
    for (a, b, r) in (((cx - 1.0, 11.4), (cx - 2.2, 17.6), 0.42), ((cx + 1.0, 11.4), (cx + 1.6, 16.4), 0.42)):
        P.append(Capsule('tie', 'redcape', 1.3, a, b, r, r * 0.9, shade=1.15))
        P.append(Ellipse('tieend', 'redcape', 1.31, b, 0.75, 0.6, shade=1.0))
    P.append(Ellipse('knot', 'redcape', 1.32, (cx, 11.6), 1.0, 0.8, shade=1.1))

    def cloth_dec(x, y, cur):
        # a florzinha bordada perto da barra: cinco pétalas claras e o miolo dourado
        fx, fy = 6.6, 24.4
        dx, dy = x - fx, y - fy
        r = math.hypot(dx, dy)
        if r < 0.55:
            return ('gold', 3)
        if r < 1.7:
            a = math.atan2(dy, dx)
            if math.cos(a * 5.0) > 0.15 and r > 0.7:
                return ('bone', 3)
        # o caule bordado
        if 24.9 < y < 27.2 and abs(x - (fx + (y - 25.0) * 0.35)) < 0.35:
            return ('dryleaf', 3)
        # pontos de costura soltos na barra (um fio puxado)
        if y > 26.6 and int(x * 1.3) % 4 == 0 and int(y * 2) % 3 == 0 and x > 3:
            return ('redcape', 1)
        return None
    return P, [Decal('cloth', cloth_dec)], W, H, []


# ---------------------------------------------------------------- a paliçada
def palisade():
    """A grade da clareira: dois troncos de pinheiro descascados nas pontas, afiados a machado para
    baixo, amarrados com três voltas de corda em dois lugares; neve presa em cima das amarras. Fica com
    a ponta no chão e sobe para dentro da pedra quando abre (o topo some atrás da pintura)."""
    W, H = 16, 80
    P = []
    dec = []
    logs = ((4.1, 3.7, 79.6, 0.004, 0), (11.9, 3.8, 78.2, -0.003, 1))
    for (cx, r, tipy, lean, k) in logs:
        top = -1.0
        cut = tipy - 9.5
        pts = [(cx - r, top), (cx + r, top), (cx + r + lean * cut, cut), (cx + 0.6, tipy - 0.4), (cx - 0.2, tipy), (cx - r + lean * cut, cut - 1.2)]
        name = f'log{k}'
        P.append(Poly(name, 'logbark', 1.0 + k * 0.01, pts, nf=log_nf(cx, r, lean)))
        # as faces da ponta, cortadas a machado (madeira clara)
        P.append(Poly(f'cutL{k}', 'heartwood', 1.02 + k * 0.01, [(cx - r + 0.6, cut - 0.6), (cx - 0.3, cut + 1.2), (cx - 0.2, tipy - 0.2)],
                      nf=const((-0.55, 0.3, 0.75))))
        P.append(Poly(f'cutR{k}', 'heartwood', 1.02 + k * 0.01, [(cx - 0.3, cut + 1.2), (cx + r - 0.4, cut + 0.4), (cx + 0.5, tipy - 0.6)],
                      nf=const((0.45, 0.35, 0.8)), shade=0.85))
        rnd = random.Random(17 + k)
        knots = [(cx + rnd.uniform(-1.6, 1.6), rnd.uniform(6, 66)) for _ in range(3)]
        streaks = [rnd.uniform(-r, r) for _ in range(6)]

        def bark(x, y, cur, cx=cx, knots=knots, streaks=streaks):
            for (kx, ky) in knots:
                d = (x - kx) ** 2 / 1.2 + (y - ky) ** 2 / 0.7
                if d < 0.6:
                    return ('logbark', 0)
                if d < 1.4:
                    return ('heartwood', 1)
            # as fendas compridas da casca (verticais, com falhas)
            for s in streaks:
                if abs(x - cx - s - math.sin(y * 0.21 + s) * 0.5) < 0.28 and math.sin(y * 0.37 + s * 3.1) > -0.3:
                    return ('logbark', 0)
            return None
        dec.append(Decal(name, bark))
    # as amarras: três voltas de corda atravessando os dois troncos, e a neve presa em cima
    for y0 in (12.0, 46.0):
        for j in range(3):
            y = y0 + j * 2.1
            P.append(Capsule(f'rope{y0}{j}', 'rope', 1.2 + j * 0.001, (-0.6, y + 0.3), (16.6, y - 0.3), 1.15, 1.15))
        P.append(Capsule(f'ropeknot{y0}', 'rope', 1.21, (7.2, y0 + 1.0), (9.0, y0 + 3.6), 1.1, 0.9, shade=1.1))
        P.append(Capsule(f'ropeend{y0}', 'rope', 1.22, (8.6, y0 + 3.6), (9.6, y0 + 8.2), 0.55, 0.45, shade=0.95))
        P.append(Capsule(f'snowcap{y0}', 'snow', 1.25, (0.4, y0 - 1.25), (15.6, y0 - 1.55), 0.75, 0.6))
    # geada no lado esquerdo dos troncos, em manchas
    rnd = random.Random(9)
    for i in range(7):
        cx = 4.1 if i % 2 == 0 else 11.9
        y = rnd.uniform(4, 62)
        P.append(Capsule(f'frost{i}', 'frost', 1.1, (cx - 3.0, y), (cx - 2.6, y + rnd.uniform(2.5, 5.0)), 0.7, 0.5))
    return P, dec, W, H, []


# ---------------------------------------------------------------- o bilhete na casca
def note_bark():
    """Uma tira de casca de bétula enrolada numa estaca fincada na neve, presa com a fita vermelha;
    na casca, as marcas de tinta vermelha (uma seta e três riscos: siga as fitas)."""
    W, H = 16, 24
    P = []
    P.append(Capsule('stake', 'oldwood', 1.0, (8.4, 23.4), (7.5, 2.6), 1.15, 0.85))
    P.append(Ellipse('stakecap', 'snow', 1.01, (7.5, 2.3), 1.3, 0.8))
    # a tira de casca, um pouco enrolada nas pontas
    strip = [(3.0, 7.6), (12.8, 6.8), (13.4, 8.0), (13.0, 16.4), (12.2, 17.2), (3.6, 17.8), (2.8, 16.6), (2.6, 8.8)]

    def curl(x, y):
        X = (np.asarray(x, np.float32) - 8.0) / 5.4
        return (np.sign(X) * np.clip(np.abs(X) ** 3, 0, 0.8), -0.05 + 0 * X, 0.9 + 0 * X)
    P.append(Poly('bark', 'birch', 1.1, strip, nf=curl))

    def marks(x, y, cur):
        # os riscos escuros da bétula
        if int(y * 1.4 + x * 0.1) % 5 == 0 and math.sin(x * 2.3 + y) > 0.3:
            return ('birch', 0)
        # a seta vermelha apontando para a direita (para a serra) e os três riscos
        if 11.0 < y < 12.0 and 4.4 < x < 10.6:
            return ('redcape', 3)
        if abs((y - 11.5) - (x - 10.8)) < 0.55 and 8.6 < x < 11.2 and y < 11.5:
            return ('redcape', 3)
        if abs((y - 11.5) + (x - 10.8)) < 0.55 and 8.6 < x < 11.2 and y > 11.5:
            return ('redcape', 3)
        for xs in (5.2, 7.4, 9.6):
            if abs(x - xs) < 0.45 and 13.2 < y < 15.6:
                return ('redcape', 2)
        return None
    # a fita vermelha amarrada na estaca, por cima da casca, com as duas pontas soltas ao vento
    P.append(Capsule('ribbon', 'redcape', 1.2, (6.4, 7.6), (9.4, 7.3), 0.85, 0.85, shade=1.05))
    P.append(Ellipse('ribknot', 'redcape', 1.22, (8.0, 7.4), 1.15, 0.95, shade=1.1))
    P.append(Capsule('ribtail0', 'redcape', 1.21, (8.6, 7.0), (14.6, 4.4), 0.7, 0.5, shade=0.95))
    P.append(Capsule('ribtail1', 'redcape', 1.21, (8.6, 7.6), (13.8, 6.6), 0.6, 0.45, shade=0.85))
    # o montinho de neve em volta do pé da estaca
    P.append(Ellipse('mound', 'snow', 1.3, (8.2, 23.6), 6.8, 2.4))
    P.append(Ellipse('mound2', 'snow', 1.31, (5.2, 23.8), 3.0, 1.4, shade=1.05))
    return P, [Decal('bark', marks)], W, H, []


# ---------------------------------------------------------------- o herbário
def note_herbarium():
    """O herbário dela aberto em cima do baú de madeira: as páginas grossas com uma flor prensada
    (roxa) e uma folha; o baú com as cantoneiras de ferro e a fechadura; um raminho seco caído na
    tampa."""
    W, H = 26, 18
    P = []
    P.append(Poly('chest', 'oldwood', 1.0, [(3.0, 9.0), (23.0, 9.0), (23.0, 18.0), (3.0, 18.0)], nf=const((0.0, -0.1, 1.0))))
    P.append(Poly('chestlid', 'oldwood', 1.01, [(2.4, 7.6), (23.6, 7.6), (23.6, 9.6), (2.4, 9.6)], nf=const((0.0, -0.8, 0.6)), shade=1.12))
    for x in (3.5, 22.5):
        P.append(Capsule('ccorner', 'iron', 1.05, (x, 8.4), (x, 17.4), 0.8, 0.8))
    P.append(Poly('lockplate', 'iron', 1.06, [(11.6, 9.8), (14.4, 9.8), (14.4, 13.0), (13.0, 13.8), (11.6, 13.0)], nf=const((0.0, -0.2, 0.95))))
    P.append(Ellipse('keyhole', 'void', 1.07, (13.0, 11.4), 0.45, 0.6, flat=0))

    def boards(x, y, cur):
        if abs(((y - 9.0) % 3.0) - 3.0) < 0.3 or ((y - 9.0) % 3.0) < 0.25:
            return ('oldwood', 0)
        return None
    # o livro: capa de couro, as páginas em V e os desenhos
    P.append(Poly('hcover', 'leather', 1.2, [(4.4, 6.4), (21.6, 6.4), (22.2, 7.8), (3.8, 7.8)], nf=const((0.0, -0.4, 0.9))))
    P.append(Poly('hpageL', 'paper', 1.25, [(4.8, 3.4), (13.0, 4.8), (13.0, 6.8), (4.6, 6.4)], nf=const((-0.3, -0.6, 0.75))))
    P.append(Poly('hpageR', 'paper', 1.25, [(13.0, 4.8), (21.2, 3.4), (21.4, 6.4), (13.0, 6.8)], nf=const((0.3, -0.6, 0.75)), shade=0.94))
    P.append(Capsule('hspine', 'leather', 1.26, (13.0, 4.6), (13.0, 7.0), 0.4, 0.4))
    # a flor prensada na página da direita: caule, duas folhas e a corola roxa achatada
    P.append(Capsule('pstem', 'dryleaf', 1.3, (15.2, 6.2), (18.0, 4.4), 0.32, 0.28))
    P.append(Ellipse('pleaf0', 'dryleaf', 1.31, (16.0, 5.9), 0.9, 0.45, ang=-0.7))
    P.append(Ellipse('pleaf1', 'dryleaf', 1.31, (17.2, 5.0), 0.8, 0.4, ang=0.6))
    P.append(Ellipse('petals', 'flower', 1.32, (18.4, 4.2), 1.5, 1.0, ang=-0.4))
    P.append(Ellipse('pcore', 'gold', 1.33, (18.4, 4.2), 0.45, 0.4, flat=3))
    # na da esquerda: uma folha comprida prensada e a letra miúda embaixo
    P.append(Ellipse('pfern', 'dryleaf', 1.3, (8.2, 4.8), 2.2, 0.6, ang=0.18))

    def writing(x, y, cur):
        if 5.6 < y < 6.4 and 5.6 < x < 11.4 and int(x * 1.6) % 3 != 0:
            return ('paper', 1)
        return None
    # o raminho seco que caiu na tampa, pendurando pela borda
    P.append(Capsule('sprig', 'dryleaf', 1.4, (19.6, 7.5), (24.0, 9.6), 0.3, 0.25))
    for (x, y) in ((21.0, 7.9), (22.6, 8.8), (23.8, 9.4)):
        P.append(Ellipse('bud', 'flower', 1.41, (x, y), 0.7, 0.6))
    return P, [Decal('chest', boards), Decal('hpageL', writing)], W, H, []


# ---------------------------------------------------------------- a carta
def note_letter():
    """A carta dela dobrada em pé em cima da mesa, com o lacre vermelho e um raminho de flor seca
    atravessado na frente."""
    W, H = 16, 10
    P = []
    P.append(Poly('letterback', 'paper', 1.0, [(4.0, 1.6), (12.6, 2.4), (12.4, 8.0), (4.2, 8.0)], nf=const((0.2, -0.5, 0.8)), shade=0.85))
    P.append(Poly('letter', 'paper', 1.1, [(2.6, 2.6), (11.4, 2.0), (12.2, 9.4), (2.0, 9.4)], nf=const((-0.15, -0.25, 0.95))))

    def lines(x, y, cur):
        # as linhas escritas (ela escrevia apertado) e o vinco da dobra
        if 4.2 < y < 8.6 and 3.4 < x < 11.0 and int(y * 1.5) % 2 == 0 and math.sin(x * 2.7 + y) > -0.5:
            return ('paper', 1)
        if abs(x - 7.1 - (y - 5) * 0.03) < 0.25:
            return ('paper', 2)
        return None
    P.append(Ellipse('seal', 'redcape', 1.2, (7.2, 6.2), 1.5, 1.4))
    P.append(Ellipse('sealin', 'redcape', 1.21, (7.2, 6.2), 0.7, 0.65, shade=0.8))
    P.append(Capsule('lsprig', 'dryleaf', 1.3, (0.6, 9.4), (8.8, 7.8), 0.3, 0.25))
    for (x, y, r) in ((1.8, 9.0, 0.8), (3.4, 8.6, 0.7), (4.8, 8.6, 0.65)):
        P.append(Ellipse('lbud', 'flower', 1.31, (x, y), r, r * 0.85))
    return P, [Decal('letter', lines)], W, H, []


# ---------------------------------------------------------------- o livro da caça
def note_huntbook():
    """O livro da caça do Mestre aberto num toco de pinheiro, perto do abrigo: capa grossa de couro
    escuro, a lista em colunas, a correia com a fivela de latão caída pela borda do toco; neve na
    borda de trás do toco."""
    W, H = 26, 22
    P = []
    stump = [(4.0, 10.0), (22.0, 10.0), (22.6, 17.0), (24.8, 21.6), (1.2, 21.6), (3.4, 17.0)]
    P.append(Poly('stump', 'logbark', 1.0, stump, nf=log_nf(13.0, 10.0)))
    P.append(Ellipse('rings', 'heartwood', 1.01, (13.0, 10.2), 9.0, 1.9, bulge=0.2, shade=1.05))

    def rings(x, y, cur):
        dx, dy = (x - 13.0) / 9.0, (y - 10.2) / 1.9
        r = math.hypot(dx, dy)
        if int(r * 6.0) % 2 == 0 and r > 0.2:
            return ('heartwood', 2)
        return None

    def bark(x, y, cur):
        if abs(math.sin(x * 1.3 + y * 0.08)) < 0.18 and y > 11.5:
            return ('logbark', 0)
        return None
    P.append(Ellipse('stumpsnow', 'snow', 1.02, (16.4, 9.1), 5.6, 0.9))
    # o livro
    P.append(Poly('bcover', 'leather', 1.2, [(5.4, 8.0), (20.6, 8.0), (21.2, 9.6), (4.8, 9.6)], nf=const((0.0, -0.4, 0.9)), shade=0.85))
    P.append(Poly('bpageL', 'paper', 1.25, [(5.8, 4.8), (13.0, 6.2), (13.0, 8.4), (5.6, 8.0)], nf=const((-0.3, -0.6, 0.75)), shade=0.92))
    P.append(Poly('bpageR', 'paper', 1.25, [(13.0, 6.2), (20.2, 4.8), (20.4, 8.0), (13.0, 8.4)], nf=const((0.3, -0.6, 0.75)), shade=0.86))
    P.append(Capsule('bspine', 'leather', 1.26, (13.0, 6.0), (13.0, 8.6), 0.45, 0.45))

    def list_(x, y, cur):
        # a lista: nomes à esquerda, o ofício à direita, um traço riscando cada um
        top = 4.8 + abs(x - 13.0) * 0.19 + 0.9
        if y > top and int((y - top) * 2.4) % 2 == 0 and abs(x - 13.0) > 1.0:
            if abs(x - 13.0) < 3.4 or abs(x - 13.0) > 4.4:
                return ('paper', 1)
        return None
    # a correia com a fivela, caindo pela borda do toco
    P.append(Capsule('strap', 'leather', 1.3, (20.8, 9.0), (22.4, 15.4), 0.7, 0.7, shade=0.9))
    P.append(Poly('buckle', 'brass', 1.31, [(21.4, 14.6), (23.6, 14.6), (23.6, 16.8), (21.4, 16.8)], nf=const((0.0, -0.3, 0.9))))
    P.append(Ellipse('bucklein', 'logbark', 1.32, (22.5, 15.7), 0.55, 0.6, flat=1))
    # neve no pé do toco
    P.append(Ellipse('footsnow', 'snow', 1.4, (13.0, 21.7), 12.4, 1.5))
    return P, [Decal('rings', rings), Decal('stump', bark), Decal('bpageL', list_), Decal('bpageR', list_)], W, H, []


# ---------------------------------------------------------------- a Lança do Caçador
def lanca_item():
    """A Lança do Caçador deitada em diagonal, como ele deixa: cabo de freixo escuro com as tiras de
    couro, as asas de travar, a lâmina em folha e a lanterna de latão pendurada reta na asa, ainda
    acesa; geada no cabo."""
    W = H = 32
    butt, end = (3.0, 29.0), (23.4, 8.6)
    d = (end[0] - butt[0], end[1] - butt[1])
    L = math.hypot(*d)
    sd = (d[0] / L, d[1] / L)
    side = (sd[1], -sd[0])
    P = [Capsule('haft', 'wood', 1.0, butt, end, 1.05, 0.95, shade=0.85)]
    P.append(Ellipse('ferrule', 'steel', 1.01, add(butt, sd, 0.6), 1.3, 1.3, shade=0.8))
    for t in (0.36, 0.42, 0.48):
        c = add(butt, sd, L * t)
        P.append(Capsule('wrap', 'leather', 1.02, add(c, sd, -0.9), add(c, sd, 0.9), 1.35, 1.35, shade=0.75))
    for t in (0.62, 0.74):
        c = add(butt, sd, L * t)
        P.append(Capsule('hfrost', 'frost', 1.025, add(c, sd, -1.8), add(c, sd, 1.4), 1.2, 1.0))
    wing = add(end, sd, -0.6)
    P.append(Capsule('lug', 'steel', 1.03, add(wing, side, -3.0), add(wing, side, 3.0), 0.85, 0.65, shade=0.9))
    socket = add(end, sd, 0.2)
    tip = add(socket, sd, 9.0)
    blade = [add(socket, side, -1.2), add(add(socket, sd, 3.0), side, -2.8), add(add(socket, sd, 6.6), side, -1.8), tip,
             add(add(socket, sd, 6.6), side, 1.8), add(add(socket, sd, 3.0), side, 2.8), add(socket, side, 1.2)]
    nb = norm((side[0] * 0.2, side[1] * 0.2 - 0.4, 0.88))
    P.append(Poly('blade', 'steel', 1.04, blade, nf=lambda x, y: nb))
    P.append(Capsule('ridge', 'steel', 1.05, add(socket, sd, 0.8), add(tip, sd, -1.2), 0.38, 0.25, flat=4))
    # a lanterna pendurada na asa de baixo, caindo reto
    hook = add(wing, side, 2.4)
    lan = (hook[0], hook[1] + 3.2)
    P.append(Capsule('lchain', 'steel', 1.06, hook, lan, 0.35, 0.35, flat=2))
    P.append(Ellipse('lring', 'brass', 1.07, lan, 0.95, 0.95, shade=0.8))
    lx, ly = lan
    cage = [(lx - 1.6, ly + 1.0), (lx + 1.6, ly + 1.0), (lx + 2.5, ly + 2.4), (lx + 2.5, ly + 5.6), (lx + 1.8, ly + 6.8),
            (lx - 1.8, ly + 6.8), (lx - 2.5, ly + 5.6), (lx - 2.5, ly + 2.4)]
    P.append(Poly('lcage', 'brass', 1.08, cage, nf=const((0.0, -0.3, 0.95)), shade=0.95))
    glass = Ellipse('lglass', 'amber', 1.09, (lx, ly + 4.0), 1.7, 2.1, flat=4)
    P.append(glass)
    for s in (-0.85, 0.85):
        P.append(Capsule('lbar', 'brass', 1.1, (lx + s, ly + 1.8), (lx + s, ly + 6.0), 0.3, 0.3, shade=0.7))
    return P, [], W, H, [(lx, ly + 4.0, AMBER)]


PROPS = {
    'relic-cape': cape,
    'deco-palisade': palisade,
    'deco-note-pinhal-0': note_bark,
    'deco-note-cabana-0': note_herbarium,
    'deco-note-cabana-1': note_letter,
    'deco-note-clareira-0': note_huntbook,
    'item-lanca': lanca_item,
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

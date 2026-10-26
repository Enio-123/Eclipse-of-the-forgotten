"""Ícones dos achados das Minas Abandonadas no traço liso (ink.py): os seis itens e os dois espaços
escondidos atrás do Âmbar. Servem para o inventário (HTML, 96x96) e para o achado no chão (o jogo
reduz pela escala do hd.json).

- Flor prensada: a flor seca que A. deixou entre as folhas da ficha, em cima de um canto de papel.
- Capacete de mineiro: couro cozido e cinta de ferro, amassado de pedra, lamparina acesa na frente.
- Âmbar bruto: um naco de Âmbar em facetas, ainda preso na crosta de rocha, com bolhas dentro.
- Relógio do turno: relógio de bolso de latão, parado nas seis (o fim do turno), com a corrente.
- Apito do Capataz: o apito de latão escurecido, com a argola e o cordão de couro.
- Lasca do espelho: um caco do espelho de Âmbar da Câmara; dentro dele, a máscara refletida.
- Bornal de mineiro: bolsa de lona com aba de couro e fivela, com o Âmbar que escorreu por cima.
- Cinto de ferramentas: cinto de couro com fivela, um martelo e um formão nas argolas.

Cada função devolve a imagem 24x24 do desenho, com items.HD pixels por pixel (o padrão é 4).

uso: python3 mine_items.py <pasta_assets> [--preview=<pasta>] [nomes...]
"""
import math
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm
import items
import mine_props  # noqa: F401  (as rampas do Âmbar e da rocha da mina)

puppet.RAMPS['petal'] = [0x3a1a22, 0x642c38, 0x8e4650, 0xb86a6c, 0xdc9c90]
puppet.RAMPS['driedstem'] = [0x14140a, 0x262612, 0x3c3c1e, 0x58552c, 0x76703e]
puppet.RAMPS['canvas'] = [0x1c1812, 0x352d22, 0x524634, 0x726248, 0x94805e]
puppet.RAMPS['brass'] = [0x2a1e0c, 0x4e3816, 0x7a5a26, 0xa8823e, 0xd2b06a]
puppet.SHINY.setdefault('brass', (0.5, 10))
puppet.RIM_MATS |= {'canvas', 'brass'}

ICON_S = 4


def const(n):
    v = norm(n)
    return lambda x, y: v


def seg_d(x, y, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]
    L2 = vx * vx + vy * vy or 1e-6
    t = max(0.0, min(1.0, ((x - a[0]) * vx + (y - a[1]) * vy) / L2))
    return math.hypot(x - (a[0] + vx * t), y - (a[1] + vy * t))


def flower():
    P = []
    # o canto da ficha, torto, com duas linhas de letra apagada
    paper = [(2.6, 6.2), (19.8, 3.0), (22.0, 18.4), (4.6, 21.6)]
    P.append(Poly('paper', 'paper', 0.5, paper, nf=const((-0.05, -0.15, 0.95)), shade=0.92))
    # a flor prensada: haste, duas folhas e cinco pétalas chatas em volta do miolo
    head = (14.8, 9.4)
    P.append(Capsule('stem', 'driedstem', 1.0, (7.0, 19.2), (14.0, 10.6), 0.5, 0.42))
    P.append(Ellipse('leaf', 'driedstem', 1.05, (9.2, 16.2), 2.4, 0.95, ang=-0.95, bulge=0.4))
    P.append(Ellipse('leaf', 'driedstem', 1.05, (12.2, 13.2), 2.0, 0.85, ang=0.55, bulge=0.4))
    for k in range(5):
        a = -1.2 + k * (2 * math.pi / 5)
        c = (head[0] + math.cos(a) * 2.6, head[1] + math.sin(a) * 2.4)
        P.append(Ellipse('petal', 'petal', 1.2 + k * 0.01, c, 2.7, 1.35, ang=a, bulge=0.3, shade=1.05 - 0.08 * (k % 2)))
    P.append(Ellipse('core', 'gold', 1.4, head, 1.0, 0.95, bulge=0.6, shade=0.8))

    def ink_lines(x, y, cur):
        # a letra apagada da ficha (duas linhas por baixo da flor)
        for (ax, ay, bx, by) in ((5.6, 9.4, 11.0, 8.4), (6.4, 12.6, 9.4, 12.0), (15.6, 16.4, 20.0, 15.6), (8.4, 18.6, 18.8, 16.9)):
            if seg_d(x, y, (ax, ay), (bx, by)) < 0.32:
                return ('paper', 1)
        return None

    def veins(x, y, cur):
        # a nervura de cada pétala, mais escura, saindo do miolo
        dx, dy = x - head[0], y - head[1]
        a = math.atan2(dy, dx)
        r = math.hypot(dx, dy)
        for k in range(5):
            b = -1.2 + k * (2 * math.pi / 5)
            if 1.2 < r < 3.8 and abs(math.atan2(math.sin(a - b), math.cos(a - b))) < 0.12:
                return ('petal', 1)
        return None
    im = items.img(P, [Decal('paper', ink_lines), Decal('petal', veins)], 24, 24)
    return im


def helmet():
    P = []
    c = (11.2, 16.6)
    rx, ry = 7.0, 9.4
    # a copa: meia elipse de couro cozido (só a parte de cima da aba)
    dome = [(c[0] + math.cos(t) * rx, c[1] + math.sin(t) * ry) for t in [math.pi + i * math.pi / 18 for i in range(19)]]
    P.append(Poly('dome', 'leather', 1.0, dome, nf=lambda x, y: norm(((x - c[0]) / rx * 0.9, (y - c[1] - 1.5) / ry * 0.9, 0.7)), shade=1.05))
    # a aba, larga e mais escura embaixo
    P.append(Ellipse('brim', 'leather', 1.2, (c[0] + 0.6, c[1] + 0.2), 8.8, 2.0, bulge=0.6, shade=0.85))
    # a cinta de ferro por cima da copa, de trás para a frente, com rebites
    P.append(Capsule('band', 'iron', 1.3, (c[0] - 1.6, c[1] - ry + 0.6), (c[0] - 2.4, c[1] - 0.6), 1.0, 1.0))
    # a lamparina de latão presa na frente, com a chama acesa
    P.append(Capsule('bracket', 'iron', 1.4, (c[0] + 5.0, c[1] - 4.4), (c[0] + 7.2, c[1] - 6.0), 0.6, 0.6))
    P.append(Ellipse('reflector', 'brass', 1.45, (c[0] + 7.4, c[1] - 7.0), 2.3, 2.5, bulge=0.5, shade=0.8))
    P.append(Ellipse('lamp', 'brass', 1.5, (c[0] + 8.0, c[1] - 6.8), 1.6, 2.0, bulge=0.9))
    P.append(Ellipse('flame', 'lamp', 1.6, (c[0] + 9.0, c[1] - 9.8), 0.95, 1.7, bulge=0.9))

    def marks(x, y, cur):
        # o amassado da pedra (sombra com borda clara) e a costura do couro
        d = math.hypot((x - (c[0] + 2.2)) / 1.7, (y - (c[1] - 5.4)) / 1.2)
        if d < 0.75:
            return ('leather', 1)
        if d < 1.05 and y < c[1] - 5.4:
            return ('leather', 4)
        u = math.hypot((x - c[0]) / (rx - 1.3), (y - c[1]) / (ry - 1.3))
        if abs(u - 1.0) < 0.05 and int((math.atan2(y - c[1], x - c[0])) * 9) % 2 == 0:
            return ('leather', 3)
        return None

    def rivets(x, y, cur):
        for k in range(3):
            t = (k + 0.5) / 3
            px = c[0] - 1.6 + (-0.8) * t
            py = c[1] - ry + 0.6 + (ry - 1.2) * t
            if math.hypot(x - px, y - py) < 0.42:
                return ('iron', 4)
        return None
    im = items.img(P, [Decal('dome', marks), Decal('band', rivets)], 24, 24)
    items.sparks(im, [((int(c[0] + 9.0), int(c[1] - 10.6)), (255, 246, 210, 255))])
    return im


def rawamber():
    P = []
    cc = (12.8, 11.8)
    pts = [(5.8, 15.2), (7.4, 7.8), (12.0, 3.8), (17.8, 5.6), (20.0, 11.6), (17.6, 18.0), (11.0, 19.8)]

    def facets(x, y):
        # facetas: cada setor em volta do meio olha para um lado; o meio é a face de cima
        dx, dy = x - cc[0], y - cc[1]
        if math.hypot(dx * 1.1, dy) < 3.2:
            return norm((-0.12, -0.25, 1.0))
        a = math.atan2(dy, dx)
        k = round(a / (math.pi / 3))
        b = k * (math.pi / 3) + 0.25
        return norm((math.cos(b) * 0.62, math.sin(b) * 0.62, 0.78))
    P.append(Poly('chunk', 'amber', 1.0, pts, nf=facets, shade=1.0))
    # a crosta de rocha agarrada embaixo, à esquerda
    rock = [(3.6, 15.2), (7.8, 13.4), (11.4, 16.0), (12.2, 20.8), (7.2, 21.6), (3.2, 19.4)]
    P.append(Poly('rock', 'minerock', 1.3, rock, nf=lambda x, y: norm(((x - 7.6) / 6, (y - 17.6) / 5, 0.8)), shade=1.1))

    def inside(x, y, cur):
        # bolhas presas e o brilho que vem de dentro
        for (bx, by, r) in ((14.6, 9.2, 0.75), (16.4, 12.6, 0.5), (12.0, 13.8, 0.45)):
            d = math.hypot(x - bx, y - by)
            if d < r:
                return ('amber', 4)
            if d < r + 0.35:
                return ('amber', 1)
        if math.hypot(x - 13.4, y - 11.4) < 2.4 and cur and cur[1] < 4:
            return ('amber', min(4, cur[1] + 1))
        return None

    def grit(x, y, cur):
        h = (int(x * 7.1) * 31 + int(y * 5.3) * 17) % 11
        if h == 0:
            return ('minerock', 4)
        if h == 3:
            return ('minerock', 0)
        return None
    im = items.img(P, [Decal('chunk', inside), Decal('rock', grit)], 24, 24)
    items.sparks(im, [((11, 6), (255, 240, 200, 255)), ((18, 9), (255, 214, 150, 255))])
    return im


def watch():
    P = []
    c = (12.8, 14.0)
    # a corrente: elos que sobem da argola e saem para a esquerda
    links = [((11.0, 3.2), (9.2, 2.6)), ((8.4, 2.8), (6.8, 3.8)), ((6.0, 4.6), (5.0, 6.2)), ((4.6, 7.0), (4.2, 8.8))]
    for i, (a, b) in enumerate(links):
        P.append(Capsule('link', 'brass', 0.6 + i * 0.01, a, b, 0.55 if i % 2 else 0.7, 0.55 if i % 2 else 0.7, shade=0.9))
    P.append(Ellipse('bow', 'brass', 0.9, (c[0], 4.4), 1.9, 1.5, bulge=0.7))
    P.append(Capsule('stem', 'brass', 0.95, (c[0], 5.6), (c[0], 7.4), 1.0, 1.0))
    P.append(Ellipse('case', 'brass', 1.0, c, 7.0, 7.0, bulge=0.85))
    P.append(Ellipse('dial', 'bone', 1.1, c, 5.5, 5.5, bulge=0.25, shade=1.05))
    # parado nas seis: o ponteiro curto para baixo, o comprido para cima
    P.append(Capsule('hand', 'void', 1.3, c, (c[0], c[1] - 4.3), 0.36, 0.2))
    P.append(Capsule('hand', 'void', 1.3, c, (c[0], c[1] + 3.0), 0.5, 0.32))
    P.append(Ellipse('pin', 'brass', 1.4, c, 0.6, 0.6))

    def bow_hole(x, y, cur):
        if math.hypot((x - c[0]) / 1.0, (y - 4.4) / 0.75) < 1:
            return ('void', 0)
        return None

    def ticks(x, y, cur):
        dx, dy = x - c[0], y - c[1]
        r = math.hypot(dx, dy)
        a = math.atan2(dy, dx)
        k = round(a / (math.pi / 6))
        if 4.2 < r < 5.0 and abs(a - k * math.pi / 6) * r < 0.32:
            return ('void', 1)
        # a rachadura no vidro, de uma ponta a outra
        if seg_d(x, y, (c[0] + 1.4, c[1] - 5.2), (c[0] + 2.8, c[1] - 1.6)) < 0.18 or seg_d(x, y, (c[0] + 2.8, c[1] - 1.6), (c[0] + 4.6, c[1] + 0.6)) < 0.18:
            return ('bone', 4)
        return None
    im = items.img(P, [Decal('bow', bow_hole), Decal('dial', ticks)], 24, 24)
    items.sparks(im, [((8, 9), (255, 244, 210, 255))])
    return im


def whistle():
    P = []
    # o cordão de couro: sai da argola, dá a volta e some para cima
    cord = [(19.4, 9.0), (21.2, 6.0), (20.4, 2.8), (16.8, 1.6), (13.6, 2.6)]
    for a, b in zip(cord, cord[1:]):
        P.append(Capsule('cord', 'leather', 0.5, a, b, 0.55, 0.55))
    P.append(Ellipse('ring', 'iron', 0.8, (18.6, 9.8), 1.7, 1.7, bulge=0.6))
    # o corpo redondo do apito e o bocal chato para a esquerda
    P.append(Ellipse('barrel', 'brass', 1.0, (14.4, 14.2), 5.4, 4.6, bulge=0.9))
    P.append(Poly('mouth', 'brass', 1.1, [(3.0, 11.0), (11.4, 10.0), (12.2, 13.8), (3.4, 13.8)], nf=const((-0.1, -0.5, 0.85)), shade=1.0))
    P.append(Poly('mouthside', 'brass', 1.05, [(3.4, 13.8), (12.2, 13.8), (11.6, 15.2), (3.6, 15.0)], nf=const((0.0, 0.6, 0.8)), shade=0.75))

    def ring_hole(x, y, cur):
        if math.hypot(x - 18.6, y - 9.8) < 0.8:
            return ('void', 0)
        return None

    def wear(x, y, cur):
        # a boca do apito (o vão em cima, perto do corpo) e o latão escurecido nas beiras
        if 9.4 < x < 11.4 and 10.1 < y < 11.4:
            return ('void', 0)
        if (x * 3.1 + y * 2.3) % 4.0 < 0.5 and cur and cur[1] > 1:
            return ('brass', cur[1] - 1)
        return None

    def stamp(x, y, cur):
        # a marca do turno batida no corpo (um círculo com um traço) e o respingo de Âmbar
        d = math.hypot(x - 15.0, y - 14.6)
        if 2.0 < d < 2.5 or (abs(x - 15.0) < 0.3 and abs(y - 14.6) < 1.6):
            return ('brass', 1)
        if math.hypot((x - 11.6) / 1.2, (y - 17.0) / 0.8) < 1:
            return ('amber', 3)
        return None
    im = items.img(P, [Decal('ring', ring_hole), Decal('mouth', wear), Decal('barrel', stamp)], 24, 24)
    items.sparks(im, [((12, 11), (255, 240, 200, 255))])
    return im


def mirror():
    P = []
    pts = [(7.4, 2.8), (15.6, 5.6), (19.0, 13.0), (13.6, 21.2), (9.6, 18.6), (5.0, 10.4)]
    P.append(Poly('shard', 'amberglass', 1.0, pts, nf=const((-0.25, -0.3, 0.92)), shade=1.25))

    def glass(x, y, cur):
        # a borda polida pega a luz (as duas beiras de cima); dentro, a máscara dele refletida, de leve
        for a, b in ((pts[5], pts[0]), (pts[0], pts[1])):
            if seg_d(x, y, a, b) < 0.55:
                return ('amber', 4)
        for a, b in ((pts[1], pts[2]), (pts[4], pts[5])):
            if seg_d(x, y, a, b) < 0.4:
                return ('amber', 2)
        m = (12.0, 12.6)
        u = math.hypot((x - m[0]) / 3.6, (y - m[1]) / 4.6)
        if 0.86 < u < 1.0:
            return ('amberglass', 4)
        for ex in (-1.4, 1.5):
            if math.hypot((x - m[0] - ex) / 0.7, (y - m[1] + 0.6) / 0.45) < 1:
                return ('gold', 4)
        # o risco do reflexo, na diagonal
        if abs((x - 6.0) * 0.8 - (y - 4.0) * 0.6) < 0.3 and 7 < x < 14:
            return ('amber', 3)
        return None
    im = items.img(P, [Decal('shard', glass)], 24, 24)
    items.sparks(im, [((7, 3), (255, 248, 220, 255)), ((16, 6), (255, 220, 160, 255))])
    return im


def bornal():
    P = []
    # a alça: sobe de um lado, faz a curva e desce do outro
    strap = [(5.2, 10.0), (5.6, 5.6), (8.4, 2.6), (12.0, 2.0), (15.6, 2.6), (18.4, 5.6), (18.8, 10.0)]
    for a, b in zip(strap, strap[1:]):
        P.append(Capsule('strap', 'leather', 0.6, a, b, 0.8, 0.8))
    body = [(4.4, 10.0), (19.6, 10.0), (20.4, 18.0), (18.4, 21.0), (5.6, 21.0), (3.6, 18.0)]
    P.append(Poly('bag', 'canvas', 1.0, body, nf=lambda x, y: norm(((x - 12) / 14, (y - 15.5) / 12, 0.85)), shade=1.0))
    flap = [(4.0, 9.4), (20.0, 9.4), (19.0, 14.8), (12.0, 16.4), (5.0, 14.8)]
    P.append(Poly('flap', 'leather', 1.2, flap, nf=const((0.0, -0.35, 0.9)), shade=1.05))
    P.append(Capsule('tab', 'leather', 1.25, (12.0, 15.6), (12.0, 18.6), 1.0, 1.0, shade=0.9))
    P.append(Poly('buckle', 'iron', 1.3, [(10.6, 17.0), (13.4, 17.0), (13.4, 19.4), (10.6, 19.4)], nf=const((0.0, -0.2, 0.95))))

    def canvas(x, y, cur):
        # a trama da lona e o pó de pedra no fundo
        if (int(x * 2) + int(y * 2)) % 5 == 0 and cur and cur[1] > 0:
            return ('canvas', cur[1] - 1)
        if y > 19.2 and (int(x * 3.7) * 13 + int(y * 3.1) * 7) % 5 == 0:
            return ('canvas', 4)
        return None

    def flap_marks(x, y, cur):
        # a costura da aba e o Âmbar que escorreu por cima e secou
        if seg_d(x, y, (5.6, 10.6), (18.4, 10.6)) < 0.25 and int(x * 1.6) % 2 == 0:
            return ('leather', 4)
        if seg_d(x, y, (16.6, 9.4), (17.2, 13.6)) < 0.75 or math.hypot((x - 17.3) / 0.9, (y - 14.2) / 1.1) < 1:
            return ('amber', 3 if x < 17.2 else 2)
        return None

    def buckle_hole(x, y, cur):
        if 11.4 < x < 12.6 and 17.7 < y < 18.8:
            return ('void', 0)
        return None
    im = items.img(P, [Decal('bag', canvas), Decal('flap', flap_marks), Decal('buckle', buckle_hole)], 24, 24)
    items.sparks(im, [((16, 11), (255, 230, 170, 255))])
    return im


def cinto():
    P = []
    # o cinto como fica na cintura, visto de frente: a faixa larga de couro faz a curva para baixo no
    # meio, com a fivela de ferro; das argolas pendem um martelo pequeno e um formão
    arc = [(2.0 + i * 20.0 / 10, 7.4 + math.sin(i / 10 * math.pi) * 2.6) for i in range(11)]
    for a, b in zip(arc, arc[1:]):
        P.append(Capsule('belt', 'leather', 1.0, a, b, 2.0, 2.0, shade=1.05))
    bx, by = arc[5]
    P.append(Poly('buckle', 'iron', 1.3, [(bx - 2.0, by - 2.6), (bx + 2.0, by - 2.6), (bx + 2.0, by + 2.6), (bx - 2.0, by + 2.6)], nf=const((-0.2, -0.3, 0.92))))
    P.append(Capsule('tongue', 'iron', 1.35, (bx - 0.4, by), (bx + 1.4, by), 0.35, 0.35))
    # as argolas e o que elas seguram
    lx, ly = arc[2]
    rx, ry = arc[8]
    P.append(Capsule('loop', 'iron', 1.4, (lx, ly + 1.6), (lx, ly + 3.4), 0.55, 0.55))
    P.append(Capsule('loop', 'iron', 1.4, (rx, ry + 1.6), (rx, ry + 3.4), 0.55, 0.55))
    P.append(Capsule('handle', 'oldwood', 1.5, (lx + 0.2, ly + 3.0), (lx - 0.6, ly + 13.4), 0.62, 0.72))
    P.append(Capsule('head', 'iron', 1.6, (lx - 3.0, ly + 3.4), (lx + 3.2, ly + 3.0), 1.15, 1.0))
    P.append(Capsule('grip', 'oldwood', 1.5, (rx, ry + 3.0), (rx + 0.2, ry + 7.0), 0.85, 0.85))
    P.append(Poly('chisel', 'steel', 1.55, [(rx - 0.7, ry + 7.0), (rx + 1.0, ry + 7.0), (rx + 0.8, ry + 12.4), (rx + 0.1, ry + 13.2), (rx - 0.5, ry + 12.4)], nf=const((-0.3, 0.0, 0.95))))

    def holes(x, y, cur):
        # os furos do couro na ponta da direita, a costura das duas beiras
        for i in range(7, 10):
            px, py = arc[i][0], arc[i][1]
            if math.hypot(x - px, y - py) < 0.42:
                return ('void', 0)
        for a, b in zip(arc, arc[1:]):
            if abs(seg_d(x, y, a, b) - 1.45) < 0.12 and int(x * 1.5) % 2 == 0:
                return ('leather', 4)
        return None

    def buckle_hole(x, y, cur):
        if bx - 1.1 < x < bx + 1.1 and by - 1.7 < y < by + 1.7:
            return ('void', 0)
        return None
    im = items.img(P, [Decal('belt', holes), Decal('buckle', buckle_hole)], 24, 24)
    items.sparks(im, [((int(lx - 2), int(ly + 3)), (230, 236, 255, 255))])
    return im


ICONS = {
    'item-flower': flower, 'item-helmet': helmet, 'item-rawamber': rawamber, 'item-watch': watch,
    'item-whistle': whistle, 'item-mirror': mirror, 'item-bornal': bornal, 'item-cinto': cinto,
}


if __name__ == '__main__':
    from PIL import Image
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = args[0] if args else '.'
    only = set(args[1:])
    prev = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
    if prev:
        os.makedirs(prev, exist_ok=True)
    items.HD = ICON_S
    made = []
    for k, fn in ICONS.items():
        if only and k not in only:
            continue
        im = fn()
        im.save(f'{out}/{k}.png')
        made.append((k, im))
        print(k, im.size, flush=True)
    # no chão do jogo a imagem é reduzida pela escala (o inventário em HTML mostra direto)
    path = f'{out}/hd.json'
    if made and os.path.exists(path):
        import json
        hd = json.load(open(path))
        hd.update({k: ICON_S for k, _ in made})
        json.dump(hd, open(path, 'w'), indent=1)
    if prev and made:
        # uma prévia em fila, no fundo escuro do inventário, em 1x e no tamanho do jogo
        W = 104 * len(made)
        sheet = Image.new('RGBA', (W, 160), (22, 20, 28, 255))
        for i, (k, im) in enumerate(made):
            sheet.alpha_composite(im, (i * 104 + 4, 4))
            small = im.resize((48, 48), Image.LANCZOS)
            sheet.alpha_composite(small, (i * 104 + 28, 106))
        sheet.save(f'{prev}/mine_items.png')

"""Os objetos das salas novas da v18 no traço liso (ink.py): os registros (um por objeto do cenário)
e as peças grandes de cada sala.

Galeria dos Nichos: a lápide raspada encostada na parede, com o cinzel caído no pé, e o livro do
coveiro aberto na estante de madeira, com a pá encostada e a lamparina acesa.
Mercado do Dízimo: o édito da Casa Vhalor pregado no poste, a mesa de contar com a tabela do Dízimo,
a balança pública parada torta (o prato de baixo calçado, com o saco do último Dízimo) e o toldo das
bancas.
As Solitárias: o livro das sentenças aberto no cavalete do carcereiro e a laje riscada da última
cela, com a tigela virada no pé.
A Margem da Tinta: o caderno do copista encostado no caixote virado da margem e a prancha de assinar
da sacada, com a ordem em branco presa no clipe.

Cada função devolve (prims, decals, W, H, luzes) em pixels do mundo; as luzes (x, y, cor) ficam em
relação ao canto da imagem. O jogo põe cada registro pelo meio de baixo, em pé no chão.

uso: python3 record_props.py <pasta_assets> [nomes...] [--preview=<pasta>]
"""
import json
import math
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm

puppet.RAMPS.setdefault('tomb', [0x221f1d, 0x3d3833, 0x5e574e, 0x857c6e, 0xaba190])
puppet.RAMPS.setdefault('tombdark', [0x141211, 0x24211e, 0x37322d, 0x4d463f, 0x655d53])
puppet.RAMPS.setdefault('oldwood', [0x1a110b, 0x2e1f14, 0x46301e, 0x634529, 0x84603a])
puppet.RAMPS.setdefault('paper', [0x3a3226, 0x6a5c46, 0x9c8b6c, 0xc9b892, 0xece0be])
puppet.RAMPS.setdefault('iron', [0x101218, 0x1d2029, 0x30343f, 0x4b505e, 0x737a8b])
puppet.RAMPS.setdefault('brass', [0x3a2a10, 0x5e4419, 0x8a6a2a, 0xb8923f, 0xdcc070])
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
puppet.RAMPS.setdefault('wax', [0x5a4a36, 0x8c7656, 0xbca57c, 0xe0cfa4, 0xf8efd2])
puppet.RAMPS.setdefault('citystone', [0x241f1b, 0x433c34, 0x675e52, 0x8f8473, 0xb6aa94])
puppet.RAMPS.setdefault('burlap', [0x2a1f14, 0x4a3825, 0x6e5638, 0x917650, 0xb59a6c])
puppet.RAMPS.setdefault('waxred', [0x330909, 0x5e1212, 0x8a1f1c, 0xb33a2c, 0xd8694f])
puppet.RAMPS.setdefault('canvasred', [0x2e1010, 0x521c1a, 0x7a2e26, 0x9e4a38, 0xbd6c52])
puppet.RAMPS.setdefault('canvasochre', [0x33260f, 0x5a4419, 0x836628, 0xa98a40, 0xc9ab62])
puppet.RAMPS.setdefault('clay', [0x2c160e, 0x52281a, 0x7a3f28, 0x9e5c3c, 0xbf7d58])
puppet.RAMPS.setdefault('bronze', [0x2e1f10, 0x5a3a18, 0x8a5c26, 0xb98a3e, 0xe4bd72])
puppet.RAMPS.setdefault('apple', [0x2a0c0c, 0x4e1614, 0x74241c, 0x963c26, 0xb45a36])
puppet.RAMPS.setdefault('jailstone', [0x15181c, 0x262b31, 0x3c434b, 0x57606a, 0x79838e])
puppet.RAMPS.setdefault('tin', [0x1b1d20, 0x32363b, 0x4d535a, 0x6e757e, 0x959ca6])
puppet.RAMPS.setdefault('inkviolet', [0x0d0714, 0x1b0f28, 0x2c1a40, 0x44295e, 0x6b4590])
puppet.RAMPS.setdefault('rope', [0x33261a, 0x56432c, 0x7c6644, 0xa48e66, 0xc9b78e])
puppet.SHINY.setdefault('iron', (0.45, 12))
puppet.SHINY.setdefault('brass', (0.6, 10))
puppet.SHINY.setdefault('amber', (0.7, 16))
puppet.SHINY.setdefault('bronze', (0.5, 9))
puppet.SHINY.setdefault('waxred', (0.35, 10))
puppet.RIM_MATS |= {'oldwood', 'tomb', 'citystone', 'bronze', 'burlap'}

WARM = 0xffc27a


def const(n):
    n = norm(n)
    return lambda x, y: n


def slab_nf(cx, w):
    """Normal de laje de pedra: frente quase reta, as bordas dos lados viradas para fora."""
    def nf(x, y):
        t = np.clip((np.asarray(x, np.float32) - cx) / w, -1.0, 1.0)
        e = np.sign(t) * np.clip((np.abs(t) - 0.75) / 0.25, 0, 1) * 0.7
        return (e, -0.15 + 0 * t, np.sqrt(np.maximum(0.05, 1 - e * e)))
    return nf


# ---------------------------------------------------------------- a lápide raspada
def nichos_tomb():
    """A lápide de um nicho, solta e encostada na parede, um pouco torta: o topo arredondado, a
    moldura entalhada, e no meio o nome raspado com o cinzel (riscos fundos na mesma direção). Embaixo
    sobrou o fim de uma data. O cinzel e o lasco de pedra no chão; atrás, outra lápide mais escura,
    deitada."""
    W, H = 24, 26
    P = []
    # a de trás, deitada e escura
    P.append(Poly('back', 'tombdark', 0.9, [(13.0, 20.0), (23.4, 18.6), (23.6, 25.6), (12.6, 25.6)], nf=const((0.3, -0.6, 0.75))))
    # a lápide em pé: um pouco inclinada para a direita (encostada)
    lean = 0.08

    def tilt(px, py):
        return (px + (25.6 - py) * lean, py)
    pts = []
    for i in range(13):
        a = math.pi + math.pi * i / 12
        pts.append(tilt(10.0 + 7.2 * math.cos(a), 8.6 + 6.0 * math.sin(a)))
    pts += [tilt(17.2, 25.6), tilt(2.8, 25.6)]
    P.append(Poly('tomb', 'tomb', 1.0, pts, nf=slab_nf(10.0 + 1.2, 7.2)))

    def carve(x, y, cur):
        # volta a inclinação para desenhar na face da lápide
        u = x - (25.6 - y) * lean
        r = math.hypot((u - 10.0) / 6.0, (y - 8.6) / 5.0)
        # a moldura entalhada (um sulco a um pixel da borda)
        if y < 8.6 and 0.86 < r < 0.98:
            return ('tomb', 1)
        if y >= 8.6 and (abs(u - 4.0) < 0.45 or abs(u - 16.0) < 0.45) and y < 24.0:
            return ('tomb', 1)
        # o nome raspado: riscos fundos na diagonal, todos no mesmo sentido
        if 9.4 < y < 15.6 and 4.8 < u < 15.2:
            k = (u * 0.9 + y * 0.6) % 1.6
            if k < 0.42:
                return ('tomb', 0)
            if k < 0.7:
                return ('tomb', 3)
            return ('tomb', 2)
        # a data que sobrou embaixo: quatro algarismos miúdos
        if 18.2 < y < 19.6 and 6.4 < u < 13.6 and int(u * 1.3) % 3 != 2:
            return ('tomb', 1)
        # um traço do nome que o cinzel não pegou, na ponta
        if 15.6 <= y < 16.6 and 12.8 < u < 14.6:
            return ('tomb', 1)
        return None
    # o lasco que caiu do canto e o cinzel no chão
    P.append(Poly('chip', 'tomb', 1.1, [(17.6, 24.4), (20.4, 23.6), (21.2, 25.6), (17.4, 25.6)], nf=const((0.2, -0.7, 0.7))))
    P.append(Capsule('chisel', 'iron', 1.2, (1.0, 25.0), (6.4, 24.0), 0.55, 0.45, shade=0.95))
    P.append(Capsule('chiselhead', 'iron', 1.21, (0.6, 25.1), (1.6, 24.9), 0.85, 0.85, shade=0.8))
    # pó de pedra no pé
    P.append(Ellipse('dust', 'tombdark', 1.3, (8.0, 25.8), 6.0, 0.7, shade=1.1))
    return P, [Decal('tomb', carve)], W, H, []


# ---------------------------------------------------------------- o livro do coveiro
def nichos_ledger():
    """O livro do coveiro aberto em cima da estante de madeira: o tampo inclinado, a coluna e o pé em
    cruz; no livro, a lista de nomes riscados um por um. A pá de cavar encostada na estante e a
    lamparina de latão acesa pendurada no canto do tampo (a luz da casa dele)."""
    W, H = 28, 30
    P = []
    # a pá encostada atrás, à direita
    P.append(Capsule('spadehaft', 'oldwood', 0.8, (21.6, 28.8), (25.6, 4.0), 0.7, 0.6))
    P.append(Poly('spade', 'iron', 0.85, [(19.2, 26.0), (23.6, 26.4), (23.0, 29.8), (19.0, 29.6)], nf=const((-0.3, -0.3, 0.9))))
    P.append(Capsule('spadegrip', 'oldwood', 0.86, (24.4, 4.0), (26.8, 4.2), 0.55, 0.55))
    # a estante: pé em cruz, a coluna e o tampo inclinado
    P.append(Poly('foot', 'oldwood', 1.0, [(5.0, 27.6), (19.0, 27.6), (20.0, 29.8), (4.0, 29.8)], nf=const((0.0, -0.6, 0.8))))
    P.append(Capsule('post', 'oldwood', 1.05, (12.0, 28.0), (12.0, 13.0), 1.5, 1.2))
    P.append(Capsule('postring', 'oldwood', 1.06, (10.6, 20.0), (13.4, 20.0), 0.7, 0.7, shade=0.8))
    P.append(Poly('top', 'oldwood', 1.1, [(3.0, 11.0), (21.0, 7.4), (22.0, 10.2), (4.0, 13.6)], nf=const((0.2, -0.7, 0.65))))
    P.append(Poly('lip', 'oldwood', 1.11, [(3.4, 12.8), (4.2, 12.6), (4.6, 14.6), (3.6, 14.8)], nf=const((-0.4, 0.0, 0.9))))
    # o livro aberto em cima do tampo
    P.append(Poly('lpage', 'paper', 1.2, [(4.6, 9.0), (12.4, 7.2), (12.6, 10.6), (5.2, 12.2)], nf=const((-0.2, -0.7, 0.7))))
    P.append(Poly('rpage', 'paper', 1.2, [(12.4, 7.2), (20.0, 5.0), (20.6, 8.6), (12.6, 10.6)], nf=const((0.2, -0.75, 0.65)), shade=0.92))
    P.append(Capsule('lspine', 'leather', 1.21, (12.4, 7.0), (12.6, 10.8), 0.35, 0.35))

    def names(x, y, cur):
        # as linhas de nomes, cada uma com um risco por cima (apagado por ordem)
        if x < 12.5:
            base = 9.0 + (x - 4.6) * (-1.8 / 7.8)
        else:
            base = 7.2 + (x - 12.4) * (-2.2 / 7.6)
        d = y - base - 0.8
        if d < 0 or abs(x - 12.5) < 0.9:
            return None
        k = d % 1.15
        if k < 0.42:
            return ('paper', 1)
        if 0.42 <= k < 0.6 and int(x * 2.0) % 4 == 0:
            return ('paper', 2)
        return None
    # a lamparina pendurada no canto esquerdo do tampo
    P.append(Capsule('hook', 'iron', 1.3, (3.4, 11.4), (2.6, 14.6), 0.3, 0.3))
    lx, ly = 2.6, 17.0
    P.append(Poly('lampcap', 'brass', 1.31, [(1.0, 14.6), (4.2, 14.6), (3.6, 15.6), (1.6, 15.6)], nf=const((0.0, -0.8, 0.6))))
    P.append(Ellipse('lampglass', 'amber', 1.32, (lx, ly), 1.4, 1.6, flat=4))
    P.append(Poly('lampbase', 'brass', 1.33, [(1.0, 18.4), (4.2, 18.4), (3.8, 19.6), (1.4, 19.6)], nf=const((0.0, -0.3, 0.9))))
    # pingos de cera no pé da estante
    for (x, y, r) in ((7.0, 29.4, 0.9), (16.6, 29.5, 0.7)):
        P.append(Ellipse('wax', 'wax', 1.4, (x, y), r, r * 0.6))
    return P, [Decal('lpage', names), Decal('rpage', names)], W, H, [(lx, ly, WARM)]


# ---------------------------------------------------------------- o édito no poste
def mercado_edict():
    """O poste do édito, logo depois do arco da praça: a viga de madeira fincada na base de pedra, o
    telhadinho que protege o papel, o édito grande pregado com quatro cravos (o cabeçalho em letra
    grossa, o selo de cera vermelha da Casa embaixo), restos de éditos velhos rasgados atrás e o
    papelzinho riscado a carvão preso mais abaixo."""
    W, H = 26, 46
    P = []
    # base de pedra e o poste
    P.append(Poly('base', 'citystone', 0.8, [(7.0, 40.0), (19.0, 40.0), (20.0, 45.8), (6.0, 45.8)], nf=const((0.0, -0.45, 0.88))))
    P.append(Poly('basecap', 'citystone', 0.82, [(6.4, 38.6), (19.6, 38.6), (19.2, 40.4), (6.8, 40.4)], nf=const((0.0, -0.85, 0.5))))

    def post_n(x, y):
        t = np.clip((np.asarray(x, np.float32) - 13.0) / 2.6, -1, 1)
        return (t * 0.8, -0.05 + 0 * t, np.sqrt(np.maximum(0.1, 1 - (t * 0.8) ** 2)))
    P.append(Poly('post', 'oldwood', 1.0, [(10.6, 39.0), (10.9, 6.0), (15.1, 6.0), (15.4, 39.0)], nf=post_n))
    # telhadinho em cima
    P.append(Poly('cap', 'oldwood', 1.4, [(4.6, 7.4), (13.0, 1.4), (21.4, 7.4), (20.6, 8.8), (13.0, 3.6), (5.4, 8.8)], nf=lambda x, y: (np.sign(np.asarray(x) - 13.0) * 0.45, -0.7 + 0 * np.asarray(y), 0.55 + 0 * np.asarray(x))))
    # éditos velhos rasgados atrás (só as pontas aparecem)
    P.append(Poly('old', 'paper', 1.1, [(4.2, 9.6), (9.0, 9.2), (8.2, 13.0), (5.0, 14.4)], nf=const((-0.2, -0.3, 0.9)), shade=0.72))
    P.append(Poly('old', 'paper', 1.1, [(17.8, 28.6), (21.8, 29.0), (21.2, 32.6), (18.4, 31.8)], nf=const((0.2, -0.2, 0.9)), shade=0.68))
    # o édito: o papel um pouco ondulado, os cantos de baixo enrolando
    def paper_n(x, y):
        w = np.sin((np.asarray(y, np.float32) - 10.0) * 0.55) * 0.12
        return (w, -0.12 + 0 * w, 0.98 + 0 * w)
    P.append(Poly('edict', 'paper', 1.2, [(5.6, 10.4), (20.6, 10.0), (20.9, 28.4), (19.4, 29.6), (6.8, 29.8), (5.2, 28.6)], nf=paper_n))

    def text(x, y, cur):
        # cabeçalho grosso, depois as linhas miúdas, com um vão para o selo
        if 11.6 < y < 13.6 and 7.4 < x < 18.8 and int(x * 1.6) % 4 != 3:
            return ('paper', 0)
        if 14.6 < y < 25.0 and 7.0 < x < 19.2:
            k = (y - 14.6) % 1.75
            if k < 0.62 and int(x * 2.1 + y) % 6 != 0:
                return ('paper', 1)
        return None
    # o selo de cera da Casa e as fitas
    P.append(Capsule('ribbon', 'waxred', 1.25, (12.0, 26.6), (11.0, 31.4), 0.55, 0.45, shade=0.85))
    P.append(Capsule('ribbon', 'waxred', 1.25, (14.0, 26.6), (15.2, 31.0), 0.55, 0.45, shade=0.85))
    P.append(Ellipse('seal', 'waxred', 1.3, (13.0, 26.4), 2.4, 2.3))

    def seal(x, y, cur):
        # o brasão em relevo: um aro e uma marca no meio
        r = math.hypot(x - 13.0, y - 26.4)
        if 1.5 < r < 1.85:
            return ('waxred', 1)
        if r < 0.9 and abs(x - 13.0) < 0.35:
            return ('waxred', 4)
        return None
    # os cravos
    for (x, y) in ((6.6, 11.4), (19.6, 11.0), (7.4, 28.4), (19.4, 28.2)):
        P.append(Ellipse('nail', 'iron', 1.35, (x, y), 0.65, 0.65))
    # o papelzinho riscado a carvão, preso torto mais embaixo
    P.append(Poly('scrap', 'paper', 1.4, [(8.0, 31.2), (17.4, 30.6), (17.0, 36.0), (8.6, 36.4)], nf=const((0.1, -0.25, 0.95)), shade=0.9))

    def scribble(x, y, cur):
        k = (y - 31.8) % 1.5
        if 31.8 < y < 35.4 and 9.2 < x < 16.4 and k < 0.5 and math.sin(x * 2.3 + y) > -0.3:
            return ('iron', 0)
        return None
    P.append(Ellipse('nail', 'iron', 1.45, (12.6, 31.4), 0.6, 0.6))
    return P, [Decal('edict', text), Decal('seal', seal), Decal('scrap', scribble)], W, H, []


# ---------------------------------------------------------------- a mesa de contar
def mercado_desk():
    """A mesa de contar da Casa de Contagem: a escrivaninha inclinada em quatro pés, o livro grande
    aberto com as colunas da tabela, o tinteiro com a pena, as pilhas de moedas, a vela acesa no canto
    e os livros velhos empilhados embaixo."""
    W, H = 36, 32
    P = []
    # livros empilhados no chão, embaixo da mesa
    for i, (x0, x1, y0) in enumerate(((11.0, 25.0, 27.4), (12.0, 24.0, 24.8), (13.0, 23.4, 22.4))):
        P.append(Poly(f'books{i}', 'leather', 0.7 + i * 0.01, [(x0, y0), (x1, y0 - 0.3), (x1 + 0.2, y0 + 2.6), (x0 - 0.2, y0 + 2.6)], nf=const((0.0, -0.5, 0.85)), shade=0.85))
    # pés e travessa
    for (a, b) in (((6.0, 31.6), (7.2, 15.0)), ((30.0, 31.6), (28.8, 12.6))):
        P.append(Capsule('leg', 'oldwood', 1.0, a, b, 1.2, 1.0))
    P.append(Capsule('rail', 'oldwood', 0.95, (6.6, 26.0), (29.6, 26.0), 0.8, 0.8, shade=0.8))
    # o tampo inclinado e a régua da frente
    P.append(Poly('top', 'oldwood', 1.1, [(3.0, 15.4), (33.0, 11.4), (33.6, 14.0), (3.4, 18.0)], nf=const((0.15, -0.75, 0.62))))
    P.append(Poly('lip', 'oldwood', 1.12, [(3.0, 17.4), (4.4, 17.2), (4.8, 19.2), (3.2, 19.4)], nf=const((-0.4, 0.0, 0.9))))
    # o livro aberto: as duas páginas
    P.append(Poly('lpage', 'paper', 1.2, [(7.0, 13.4), (17.0, 11.6), (17.2, 15.0), (7.6, 16.6)], nf=const((-0.15, -0.72, 0.68))))
    P.append(Poly('rpage', 'paper', 1.2, [(17.0, 11.6), (26.6, 9.6), (27.2, 13.2), (17.2, 15.0)], nf=const((0.15, -0.75, 0.64)), shade=0.93))
    P.append(Capsule('spine', 'leather', 1.21, (17.0, 11.4), (17.2, 15.2), 0.35, 0.35))

    def table(x, y, cur):
        # a tabela: colunas verticais e linhas de lançamento
        if abs(x - 17.1) < 0.7:
            return None
        if x < 17.1:
            top = 13.4 + (x - 7.0) * (-1.8 / 10.0)
        else:
            top = 11.6 + (x - 17.0) * (-2.0 / 9.6)
        d = y - top
        if d < 0.6:
            return None
        if (x - 7.0) % 3.3 < 0.32:
            return ('paper', 1)
        if d % 0.95 < 0.34 and (x * 3.1) % 1.0 < 0.72:
            return ('paper', 2)
        return None
    # o tinteiro e a pena
    P.append(Ellipse('ink', 'iron', 1.3, (27.6, 9.8), 1.5, 1.1))
    P.append(Capsule('quill', 'paper', 1.32, (27.8, 9.4), (31.6, 2.4), 0.45, 0.2, shade=1.05))
    # as pilhas de moedas na ponta da mesa
    for (x, n) in ((30.4, 4), (32.0, 2)):
        for k in range(n):
            P.append(Ellipse('coin', 'bronze', 1.4 + k * 0.01, (x, 10.6 - k * 0.9), 1.3, 0.55))
    # a vela no canto esquerdo
    vx, vy = 4.6, 10.2
    P.append(Capsule('candle', 'wax', 1.3, (vx, 14.6), (vx, vy + 1.2), 0.9, 0.8))
    P.append(Ellipse('drip', 'wax', 1.31, (vx + 0.6, 13.6), 0.45, 0.9))
    P.append(Ellipse('flame', 'amber', 1.35, (vx, vy - 0.2), 0.75, 1.3, flat=4))
    return P, [Decal('lpage', table), Decal('rpage', table)], W, H, [(vx, vy - 0.2, WARM)]


# ---------------------------------------------------------------- a balança pública
def chain(P, name, a, b, z, mat='iron'):
    """Corrente de elos pequenos entre dois pontos, um de frente e um de lado, alternando."""
    n = max(2, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 2.6))
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    for i in range(n + 1):
        t = i / n
        x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        if i % 2 == 0:
            P.append(Ellipse(name, mat, z, (x, y), 1.6, 0.95, ang=ang))
        else:
            P.append(Ellipse(name, mat, z + 0.01, (x, y), 1.4, 0.45, ang=ang, shade=0.75))


def mercado_scale():
    """A balança pública do Mercado do Dízimo, parada torta: a base de pedra, o poste de madeira com
    as cintas de ferro e a placa de latão, o eixo com o remate em cima, o braço de ferro inclinado e os
    pratos de bronze nas correntes. O prato de baixo tem o saco do último Dízimo e está calçado num
    caixote com uma cunha (a tabela da Casa de Contagem conta por quê); o de cima ficou vazio.
    O topo de cada prato é a altura da plataforma da sala (o de baixo na linha 25, o de cima na 20)."""
    W, H = 256, 240
    P = []
    cx = 128.0
    # base de pedra
    P.append(Poly('plinth', 'citystone', 0.6, [(104.0, 216.0), (152.0, 216.0), (150.0, 222.0), (106.0, 222.0)], nf=const((0.0, -0.85, 0.5))))
    P.append(Poly('plinth', 'citystone', 0.58, [(108.0, 221.0), (148.0, 221.0), (150.0, 239.8), (106.0, 239.8)], nf=const((0.0, -0.3, 0.95))))
    # o poste

    def post_n(x, y):
        t = np.clip((np.asarray(x, np.float32) - cx) / 6.4, -1, 1)
        return (t * 0.85, -0.05 + 0 * t, np.sqrt(np.maximum(0.1, 1 - (t * 0.85) ** 2)))
    P.append(Poly('post', 'oldwood', 0.7, [(121.2, 217.0), (122.2, 70.0), (133.8, 70.0), (134.8, 217.0)], nf=post_n))
    for y in (92.0, 150.0, 204.0):
        P.append(Capsule('band', 'iron', 0.75, (121.0, y), (135.0, y), 1.5, 1.5))
        for x in (123.4, 132.6):
            P.append(Ellipse('rivet', 'iron', 0.76, (x, y), 0.8, 0.8))
    # a placa de latão no poste
    P.append(Poly('plaque', 'brass', 0.8, [(119.0, 118.0), (137.0, 118.0), (136.4, 132.0), (119.6, 132.0)], nf=const((0.0, -0.2, 0.97))))

    def engrave(x, y, cur):
        if 121.0 < x < 135.0 and 120.2 < y < 130.0 and (y - 120.2) % 2.6 < 0.7 and int(x * 1.7) % 5 != 0:
            return ('brass', 1)
        return None
    # o eixo e o remate
    piv = (cx, 64.0)
    P.append(Poly('finial', 'iron', 0.95, [(124.0, 60.0), (128.0, 40.0), (132.0, 60.0)], nf=lambda x, y: (np.clip((np.asarray(x) - cx) / 4.0, -1, 1) * 0.7, -0.3 + 0 * np.asarray(y), 0.65 + 0 * np.asarray(x))))
    P.append(Ellipse('finialball', 'brass', 0.96, (cx, 40.0), 2.6, 2.6))
    # o braço inclinado (o lado do saco embaixo)
    L, R = (56.0, 104.0), (200.0, 24.0)
    P.append(Capsule('beam', 'iron', 1.0, L, R, 3.4, 3.4))
    for e in (L, R):
        P.append(Ellipse('beamend', 'iron', 1.02, e, 4.6, 4.6))
    P.append(Ellipse('hub', 'iron', 1.05, piv, 7.4, 7.4))
    P.append(Ellipse('hubcap', 'brass', 1.06, piv, 3.2, 3.2))
    # as correntes e os pratos: o topo de cada prato é o chão da plataforma
    pans = ((L, 176.0, 18.0, 94.0), (R, 96.0, 162.0, 238.0))
    for (end, rim, x0, x1) in pans:
        for x in (x0 + 3.0, x1 - 3.0):
            chain(P, 'chain', (end[0], end[1] + 4.0), (x, rim - 0.5), 0.9)
        mid = (x0 + x1) / 2

        def pan_n(xx, yy, mid=mid, half=(x1 - x0) / 2):
            t = np.clip((np.asarray(xx, np.float32) - mid) / half, -1, 1)
            return (t * 0.5, 0.35 + 0 * t, 0.85 + 0 * t)
        P.append(Poly('pan', 'bronze', 1.1, [(x0, rim), (x1, rim), (x1 - 6.0, rim + 7.0), (mid + 14.0, rim + 11.0), (mid - 14.0, rim + 11.0), (x0 + 6.0, rim + 7.0)], nf=pan_n))
        P.append(Capsule('rim', 'bronze', 1.12, (x0, rim + 0.6), (x1, rim + 0.6), 1.2, 1.2, flat=3))
    # o calço embaixo do prato de baixo: dois caixotes e a cunha
    P.append(Poly('crate', 'oldwood', 0.5, [(34.0, 212.0), (78.0, 212.0), (78.0, 239.8), (34.0, 239.8)], nf=const((0.0, -0.2, 0.97))))
    P.append(Poly('crate2', 'oldwood', 0.52, [(40.0, 192.0), (72.0, 192.0), (72.0, 212.4), (40.0, 212.4)], nf=const((0.0, -0.2, 0.97)), shade=0.9))
    P.append(Poly('wedge', 'oldwood', 0.54, [(42.0, 187.6), (70.0, 186.4), (72.0, 192.4), (40.0, 192.4)], nf=const((0.1, -0.7, 0.7))))

    def boards(x, y, cur):
        # tábuas dos caixotes: frisos e as travessas em X
        if abs((x - 34.0) % 11.0) < 0.5:
            return ('oldwood', 0)
        if abs(y - 212.0) < 0.6 or abs(y - 239.0) < 0.6:
            return ('oldwood', 0)
        return None
    # o saco do último Dízimo, com o lacre
    P.append(Ellipse('sack', 'burlap', 1.3, (34.0, 163.0), 13.5, 13.8))
    P.append(Ellipse('sackfoot', 'burlap', 1.29, (34.0, 172.0), 15.0, 5.2, shade=0.9))
    P.append(Capsule('neck', 'burlap', 1.32, (33.0, 150.4), (35.0, 146.0), 3.2, 2.0))
    P.append(Capsule('tie', 'rope', 1.34, (29.6, 150.6), (38.4, 150.0), 1.1, 1.1))
    P.append(Capsule('tag', 'rope', 1.35, (37.6, 150.6), (42.6, 157.0), 0.45, 0.45))
    P.append(Ellipse('sackseal', 'waxred', 1.36, (43.0, 158.4), 2.2, 2.2))

    def weave(x, y, cur):
        if (int(x * 1.3) + int(y * 1.3)) % 2 == 0 and cur and cur[1] > 0 and math.sin(x * 0.9) > 0.2:
            return ('burlap', cur[1] - 1)
        return None
    return P, [Decal('plaque', engrave), Decal('crate', boards), Decal('crate2', boards), Decal('sack', weave)], W, H, []


# ---------------------------------------------------------------- o toldo das bancas
def mercado_awning():
    """O toldo de uma banca: as duas varas fincadas na rua dos lados do balcão de pedra, a trave de
    cima (é nela que o cavaleiro pisa) e o pano listrado desbotado com a barra recortada. Em cima do
    balcão, o que sobrou da feira: dois cestos, maçãs passadas, um jarro de barro e o saco aberto."""
    W, H = 136, 112
    P = []
    top = 16.0           # o topo da trave: a altura da plataforma (linha 23 da sala)
    counter = 80.0       # o topo do balcão (linha 27)
    for x in (7.0, 129.0):
        P.append(Capsule('pole', 'oldwood', 0.8, (x, 111.6), (x, top + 2.0), 1.6, 1.4))
    P.append(Poly('frame', 'oldwood', 1.0, [(3.0, top), (133.0, top), (133.0, top + 3.6), (3.0, top + 3.6)], nf=const((0.0, -0.6, 0.8))))
    # o pano: cai da trave para a frente, com a barra em ondas

    def cloth_n(x, y):
        yy = np.asarray(y, np.float32)
        t = np.clip((yy - top) / 18.0, 0, 1)
        return (0.0 * t, -0.65 + 0.9 * t, 0.75 - 0.2 * t)
    pts = [(2.0, top + 3.0), (134.0, top + 3.0)]
    n = 16
    for i in range(n + 1):
        x = 134.0 - i * (132.0 / n)
        y = top + 15.0 + (2.6 if i % 2 else 0.0)
        pts.append((x, y))
    P.append(Poly('cloth', 'canvasred', 1.1, pts, nf=cloth_n))

    def stripes(x, y, cur):
        if cur is None:
            return None
        k = (x - 2.0) % 16.5
        if k < 8.25:
            return ('canvasochre', cur[1])
        return None
    # o que sobrou na banca
    P.append(Ellipse('basket', 'oldwood', 1.2, (40.0, counter - 4.0), 9.0, 4.6, shade=0.95))
    P.append(Ellipse('basket', 'oldwood', 1.2, (88.0, counter - 3.6), 7.5, 4.0, shade=0.95))
    for (x, y) in ((36.0, counter - 7.6), (41.0, counter - 8.2), (45.0, counter - 7.0), (85.0, counter - 6.4), (90.0, counter - 6.8)):
        P.append(Ellipse('apple', 'apple', 1.25, (x, y), 2.1, 2.0))
    P.append(Ellipse('jar', 'clay', 1.22, (62.0, counter - 6.0), 4.6, 6.0))
    P.append(Capsule('jarneck', 'clay', 1.23, (62.0, counter - 11.6), (62.0, counter - 13.4), 2.0, 2.4))
    P.append(Ellipse('sack', 'burlap', 1.21, (108.0, counter - 4.6), 8.0, 4.8))
    for (x, y) in ((99.0, counter - 0.8), (101.6, counter - 0.6), (97.2, counter - 0.5)):
        P.append(Ellipse('grain', 'wax', 1.26, (x, y), 1.0, 0.5))

    def wicker(x, y, cur):
        if cur and (int(x * 1.6) + int(y * 1.6)) % 2 == 0 and cur[1] > 0:
            return ('oldwood', cur[1] - 1)
        return None
    return P, [Decal('cloth', stripes), Decal('basket', wicker)], W, H, []


# ---------------------------------------------------------------- as Solitárias
def solitarias_book():
    """O livro das sentenças na estante do carcereiro: o cavalete de ferro com o tampo inclinado, o
    livrão aberto virado para quem chega (as duas páginas de colunas), a pena atravessada, o tinteiro,
    o toco de vela e a argola de ferro pendurada na ponta."""
    W, H = 36, 34
    P = []
    # cavalete de ferro: dois pés em X e a travessa
    for (a, b) in (((5.0, 33.6), (12.0, 20.0)), ((12.0, 33.6), (5.6, 20.4)),
                   ((24.0, 33.6), (31.0, 20.0)), ((31.0, 33.6), (24.6, 20.4))):
        P.append(Capsule('leg', 'iron', 0.8, a, b, 1.0, 0.9, shade=0.9))
    P.append(Capsule('rail', 'iron', 0.82, (8.0, 28.0), (28.0, 28.0), 0.7, 0.7, shade=0.78))
    # o tampo inclinado da estante e a régua que segura o livro
    P.append(Poly('top', 'oldwood', 1.0, [(3.0, 20.6), (33.0, 19.4), (33.2, 22.6), (3.2, 24.0)], nf=const((0.08, -0.7, 0.71))))
    P.append(Poly('lip', 'oldwood', 1.06, [(3.0, 22.8), (33.2, 21.6), (33.2, 23.6), (3.0, 24.8)], nf=const((0.0, 0.35, 0.94)), shade=0.72))
    # o livro aberto, virado para a frente: capa de couro, duas páginas e os cantos de ferro
    P.append(Poly('cover', 'leather', 1.1, [(3.6, 6.2), (32.4, 5.0), (32.8, 22.4), (3.4, 23.2)], nf=const((0.0, -0.3, 0.95)), shade=0.72))
    P.append(Poly('lpage', 'paper', 1.2, [(5.0, 7.6), (17.6, 6.9), (17.8, 21.6), (5.0, 22.0)], nf=const((-0.3, -0.2, 0.93))))
    P.append(Poly('rpage', 'paper', 1.2, [(18.0, 6.9), (31.0, 6.2), (31.0, 21.2), (18.2, 21.6)], nf=const((0.3, -0.2, 0.93)), shade=0.93))
    P.append(Capsule('spine', 'leather', 1.22, (17.9, 6.6), (18.0, 21.8), 0.5, 0.5, shade=0.6))
    for (x, y) in ((4.4, 6.8), (31.8, 5.6)):
        P.append(Ellipse('corner', 'iron', 1.24, (x, y), 1.3, 0.9))

    def sentences(x, y, cur):
        # três colunas por página (número, data, pena) e as linhas de lançamento
        if abs(x - 17.9) < 0.9 or y < 8.4 or y > 20.6:
            return None
        if x < 17.9:
            if x < 5.6 or x > 17.2:
                return None
            u = (x - 5.6) / 11.6
        else:
            if x < 18.6 or x > 30.6:
                return None
            u = (x - 18.6) / 12.0
        if abs(u - 0.34) < 0.022 or abs(u - 0.63) < 0.022:
            return ('paper', 1)
        row = (y - 9.0) % 2.4
        if row > 0.9:
            return None
        # a última linha da página da direita está em branco (ninguém deu baixa)
        if x > 17.9 and y > 18.4:
            return None
        if u < 0.3 and (x * 1.5) % 1.0 < 0.72:
            return ('paper', 1)
        if 0.38 < u < 0.59 and (x * 1.3) % 1.0 < 0.66:
            return ('paper', 1)
        if u > 0.67 and (x * 1.1) % 1.0 < 0.78:
            return ('paper', 1)
        return None
    # a pena atravessada na página e o tinteiro na ponta do tampo
    P.append(Capsule('quill', 'paper', 1.3, (9.0, 20.2), (24.0, 12.0), 0.55, 0.24, shade=1.06))
    P.append(Ellipse('ink', 'iron', 1.28, (33.2, 18.6), 1.7, 1.3))
    # o toco de vela derretido na ponta
    vx, vy = 2.2, 16.6
    P.append(Capsule('stub', 'wax', 1.26, (vx, 20.4), (vx, vy + 1.0), 1.1, 0.9))
    P.append(Ellipse('drip', 'wax', 1.27, (vx + 0.8, 19.4), 0.5, 1.2))
    P.append(Ellipse('flame', 'amber', 1.32, (vx, vy - 0.4), 0.85, 1.5, flat=4))
    # a argola pendurada embaixo do tampo
    P.append(Ellipse('ring', 'iron', 1.05, (28.0, 26.0), 2.6, 2.6, flat=3))
    P.append(Ellipse('ringin', 'iron', 1.06, (28.0, 26.0), 1.4, 1.4, flat=3, shade=0.35))
    return P, [Decal('lpage', sentences), Decal('rpage', sentences)], W, H, [(vx, vy - 0.4, WARM)]


def solitarias_marks():
    """As marcas da parede da última solitária: a laje solta encostada na pedra, cheia de riscos de
    unha em grupos de quatro, o nome riscado por cima no meio, e no pé a tigela de lata virada e a
    ponta da corrente presa no chão."""
    W, H = 30, 40
    P = []
    # a laje, levemente inclinada
    P.append(Poly('slab', 'jailstone', 1.0, [(3.4, 3.2), (26.0, 2.0), (27.0, 35.0), (4.0, 35.6)], nf=const((-0.12, -0.1, 0.98))))
    P.append(Poly('edge', 'jailstone', 1.02, [(26.0, 2.0), (27.4, 2.6), (28.2, 35.2), (27.0, 35.0)], nf=const((0.8, 0.0, 0.6), ), shade=0.62))
    P.append(Poly('base', 'jailstone', 0.98, [(2.6, 34.4), (28.4, 33.8), (29.0, 37.0), (2.2, 37.6)], nf=const((0.0, -0.6, 0.8)), shade=0.72))

    def tally(x, y, cur):
        # riscos de unha em grupos de quatro, com o quinto atravessado; cada fileira para num ponto
        # diferente, e no meio há a faixa onde a mesma mão riscou um nome por cima
        if y < 5.0 or y > 31.0 or x < 5.2 or x > 25.0:
            return None
        if 16.8 < y < 21.6:
            d = (x * 1.7 + y * 2.3) % 3.1
            d2 = (x * 2.1 - y * 1.9) % 3.4
            if d < 1.0 or d2 < 0.9:
                return ('jailstone', 3)
            return None
        band = int((y - 5.0) // 4.3)
        ty = (y - 5.0) % 4.3
        if ty > 2.9:
            return None
        # quantos grupos esta fileira tem (a última fica pela metade)
        full = (3, 4, 4, 2, 4, 3, 4)[band % 7]
        g = (x - 5.2) % 4.9
        if int((x - 5.2) // 4.9) >= full:
            return None
        if g < 2.9 and (g + band * 0.3) % 0.78 < 0.26:
            return ('jailstone', 4)
        if 2.9 <= g < 4.2 and abs(ty - (g - 2.9) * 2.1) < 0.42:
            return ('jailstone', 4)
        return None
    # a tigela de lata virada e o elo da corrente
    P.append(Ellipse('bowl', 'tin', 1.2, (8.4, 36.4), 4.8, 2.1))
    P.append(Ellipse('bowlin', 'tin', 1.21, (8.4, 35.6), 3.4, 1.2, shade=0.55))
    chain(P, 'chain', (17.6, 37.6), (25.8, 35.4), 1.2)
    P.append(Ellipse('bolt', 'iron', 1.22, (26.2, 35.2), 2.0, 2.0, flat=3))
    return P, [Decal('slab', tally)], W, H, []



# ---------------------------------------------------------------- a margem da tinta
def margem_notebook():
    """O caderno do copista na margem: o caixote do carrinho virado na pedra, a roda quebrada atrás,
    e o caderno grande encostado no caixote, aberto, as folhas empenadas de tanta tinta (as contas em
    três colunas, e o pé da página da direita afogado num borrão). No chão, o frasco tombado e a poça
    de tinta escorrendo para a calha."""
    W, H = 34, 28
    P = []
    # a roda quebrada do carrinho, atrás do caixote
    P.append(Ellipse('wheel', 'oldwood', 0.84, (7.6, 17.4), 7.2, 7.2, flat=3))
    P.append(Ellipse('wheelin', 'oldwood', 0.86, (7.6, 17.4), 4.6, 4.6, flat=3, shade=0.3))
    for (a, b) in (((7.6, 10.6), (7.6, 24.2)), ((1.4, 15.4), (13.8, 19.4))):
        P.append(Capsule('spoke', 'oldwood', 0.88, a, b, 0.7, 0.7, shade=0.8))
    P.append(Ellipse('hub', 'iron', 0.9, (7.6, 17.4), 1.8, 1.8))
    # o caixote deitado: a tampa de cima e a frente, com as frestas das tábuas
    P.append(Poly('lid', 'oldwood', 0.98, [(1.8, 14.6), (16.8, 13.2), (18.2, 15.2), (2.6, 16.4)], nf=const((0.0, -0.9, 0.44)), shade=1.12))
    P.append(Poly('crate', 'oldwood', 1.0, [(2.6, 16.4), (18.2, 15.2), (18.8, 26.6), (3.2, 27.4)], nf=const((0.0, -0.18, 0.98))))
    for y in (19.4, 22.6):
        P.append(Capsule('seam', 'oldwood', 1.02, (3.0, y + 0.3), (18.5, y - 0.6), 0.34, 0.34, shade=0.56))
    P.append(Capsule('band', 'iron', 1.04, (10.4, 15.6), (11.0, 27.0), 0.6, 0.6, shade=0.78))
    # o caderno encostado no caixote, aberto de frente
    P.append(Poly('cover', 'leather', 1.1, [(16.8, 8.2), (31.4, 6.6), (32.2, 25.4), (17.6, 26.6)], nf=const((0.08, -0.26, 0.96)), shade=0.7))

    def page_n(x, y):
        # as folhas empenadas: ondula de cima para baixo
        w = np.sin((np.asarray(y, np.float32) - 9.0) * 0.5) * 0.16
        return (w, -0.1 + 0 * w, 0.98 + 0 * w)
    P.append(Poly('lpage', 'paper', 1.2, [(18.0, 9.4), (24.2, 8.7), (24.6, 24.4), (18.8, 25.2)], nf=page_n))
    P.append(Poly('rpage', 'paper', 1.2, [(24.6, 8.6), (30.4, 7.9), (30.6, 23.6), (25.0, 24.4)], nf=page_n, shade=0.93))
    P.append(Capsule('spine', 'leather', 1.22, (24.4, 8.6), (24.8, 25.0), 0.5, 0.5, shade=0.58))

    def accounts(x, y, cur):
        # três colunas (sentença, frascos, resto) e as linhas de lançamento
        left = x < 24.5
        if left:
            if x < 18.7 or x > 23.9 or y < 10.4 or y > 23.6:
                return None
            u = (x - 18.7) / 5.2
        else:
            if x < 25.2 or x > 30.2 or y < 9.6 or y > 22.8:
                return None
            u = (x - 25.2) / 5.0
        if abs(u - 0.46) < 0.035 or abs(u - 0.78) < 0.035:
            return ('paper', 1)
        if (y - (10.4 if left else 9.6)) % 2.0 > 0.78:
            return None
        if u < 0.42 and (x * 1.7) % 1.0 < 0.7:
            return ('paper', 1)
        if 0.5 < u < 0.74 and (x * 1.4) % 1.0 < 0.6:
            return ('paper', 1)
        if u > 0.82 and (x * 1.2) % 1.0 < 0.74:
            return ('paper', 1)
        return None
    def soaked(x, y, cur):
        # o pé da página da direita afogado no borrão, e o pingo que caiu na da esquerda
        for (bx, by, rx, ry, v) in ((27.6, 22.6, 3.0, 2.2, 1), (29.4, 20.2, 1.3, 1.0, 0), (20.8, 16.4, 1.0, 0.8, 0)):
            if ((x - bx) / rx) ** 2 + ((y - by) / ry) ** 2 < 1.0:
                return ('inkviolet', v + 2)
        return None
    # o frasco tombado e a poça escorrendo
    P.append(Capsule('flask', 'tin', 1.12, (5.6, 25.4), (10.4, 26.2), 2.0, 1.6))
    P.append(Capsule('neck', 'tin', 1.14, (10.4, 26.2), (12.6, 26.8), 0.8, 0.7, shade=0.86))
    P.append(Ellipse('pool', 'inkviolet', 1.3, (16.0, 27.2), 8.4, 1.5, flat=4))
    P.append(Ellipse('pool', 'inkviolet', 1.3, (25.0, 27.6), 4.6, 1.0, flat=4))
    return P, [Decal('lpage', accounts), Decal('rpage', accounts), Decal('lpage', soaked), Decal('rpage', soaked)], W, H, []


def margem_order():
    """A prancha de assinar da sacada dos copistas: o atril de ferro com a prancha inclinada, a ordem
    presa pelo clipe (número, data e pena preenchidos, o campo do crime em branco), os dois selos de
    cera da Casa e o lugar vazio do terceiro, o tinteiro seco com a pena dentro e o lacre pendurado
    no canto."""
    W, H = 30, 36
    P = []
    # o pé de ferro: a base, a coluna e a forquilha que segura a prancha
    P.append(Ellipse('foot', 'iron', 0.9, (15.0, 35.0), 8.2, 1.8, flat=4))
    P.append(Capsule('column', 'iron', 0.94, (15.0, 34.6), (15.0, 22.0), 1.3, 1.1))
    for dx in (-1, 1):
        P.append(Capsule('fork', 'iron', 0.96, (15.0, 23.4), (15.0 + dx * 6.0, 19.6), 0.8, 0.7, shade=0.84))
    # a prancha inclinada e a régua de baixo
    P.append(Poly('board', 'oldwood', 1.0, [(3.4, 6.2), (26.6, 4.8), (27.2, 22.0), (4.0, 23.4)], nf=const((0.0, -0.3, 0.95))))
    P.append(Poly('lip', 'oldwood', 1.06, [(3.8, 21.4), (27.0, 20.0), (27.2, 22.6), (4.0, 24.0)], nf=const((0.0, 0.4, 0.92)), shade=0.72))
    # a ordem presa na prancha
    def sheet_n(x, y):
        w = np.sin((np.asarray(y, np.float32) - 8.0) * 0.42) * 0.1
        return (w, -0.14 + 0 * w, 0.98 + 0 * w)
    P.append(Poly('sheet', 'paper', 1.14, [(5.6, 7.8), (24.6, 6.6), (25.0, 20.6), (6.0, 21.8)], nf=sheet_n))

    def order(x, y, cur):
        if x < 6.4 or x > 24.2:
            return None
        # cabeçalho grosso
        if 8.8 < y < 10.4 and 7.6 < x < 22.6 and int(x * 1.5) % 5 != 4:
            return ('paper', 0)
        # três campos preenchidos (número, data, pena) e o do crime em branco
        for i, yy in enumerate((11.8, 13.4, 15.0, 16.6)):
            if yy < y < yy + 0.9:
                if x < 12.0:
                    return ('paper', 1) if int(x * 2.0 + i) % 5 != 0 else None
                if i == 3:
                    return None
                return ('paper', 1) if int(x * 1.8 + i * 3) % 6 != 0 else None
        # as duas assinaturas e a terceira linha, vazia
        if 18.4 < y < 19.4 and (7.0 < x < 11.4 or 12.4 < x < 16.8) and int(x * 2.4 + y * 3) % 4 != 3:
            return ('paper', 1)
        if 19.8 < y < 20.2 and 17.8 < x < 23.4:
            return ('paper', 1)
        return None
    # o clipe de ferro que prende a folha
    P.append(Capsule('clip', 'iron', 1.2, (11.6, 7.0), (18.4, 6.5), 1.2, 1.2))
    # os dois selos de cera da Casa, e o lugar do terceiro vazio
    for (sx, sy) in ((8.6, 19.0), (14.0, 18.6)):
        P.append(Ellipse('seal', 'waxred', 1.22, (sx, sy), 2.3, 2.0, flat=3))
        P.append(Ellipse('sealin', 'waxred', 1.24, (sx - 0.4, sy - 0.4), 1.1, 0.9, flat=3, shade=1.2))
    # o tinteiro seco com a pena dentro, na ponta da prancha
    P.append(Ellipse('inkwell', 'iron', 1.1, (26.6, 25.4), 2.6, 2.1))
    P.append(Ellipse('inkdry', 'inkviolet', 1.12, (26.6, 24.4), 1.8, 0.8, flat=4))
    P.append(Capsule('quill', 'paper', 1.26, (26.4, 24.6), (21.6, 11.0), 0.55, 0.22, shade=1.06))
    # o lacre pendurado no canto da prancha
    P.append(Capsule('cord', 'rope', 1.08, (26.8, 22.2), (27.6, 28.6), 0.4, 0.4, shade=0.8))
    P.append(Ellipse('lead', 'brass', 1.1, (27.6, 29.4), 1.5, 1.3))
    return P, [Decal('sheet', order)], W, H, []


PROPS = {
    'deco-record-nichos-0': nichos_tomb,
    'deco-record-nichos-1': nichos_ledger,
    'deco-record-mercado-0': mercado_edict,
    'deco-record-mercado-1': mercado_desk,
    'deco-record-solitarias-0': solitarias_book,
    'deco-record-solitarias-1': solitarias_marks,
    'deco-record-margem-0': margem_notebook,
    'deco-record-margem-1': margem_order,
    'deco-balanca': mercado_scale,
    'deco-toldo': mercado_awning,
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
            lights[k] = [[x, y, c] for (x, y, c) in L]
        if prev:
            big = im.resize((im.width * 4, im.height * 4), Image.NEAREST)
            bg = Image.new('RGBA', big.size, (40, 38, 44, 255))
            bg.alpha_composite(big)
            bg.save(f'{prev}/{k}.png')
        print(k, im.size, len(prims), 'partes', flush=True)
    path = f'{out}/hd.json'
    hd = json.load(open(path)) if os.path.exists(path) else {}
    hd.update(made)
    json.dump(hd, open(path, 'w'), indent=1)

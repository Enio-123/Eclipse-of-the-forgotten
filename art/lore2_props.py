"""Os registros que a integração da lore pôs nas salas antigas da Cidade e da Prisão, no traço liso (ink.py).

O Claustro: a estante de pedra dos livros de oração no alto da arcada, com o registro que a noiva deixou
com a irmã Luzia (as flores prensadas entre as folhas e o bilhete dobrado) e a pilha de livros no pé.
O Altar do Dízimo: o livro grande da conta que o Arcebispo deixa cair, aberto no chão, com as moedas.
A Sala da Máscara: o livro de ofício da Carcereira, aberto no chão (os desenhos das máscaras e a ordem
da Casa colada na última página), com o compasso de medir rosto.
O Fosso dos Esquecidos: a pedra rachada na laje de pouso, com a folha dobrada enfiada na fresta.

Cada função devolve (prims, decals, W, H, luzes) em pixels do mundo, como em record_props.py. O jogo põe
cada registro pelo meio de baixo, em pé no chão.

uso: python3 lore2_props.py <pasta_assets> [nomes...] [--preview=<pasta>]
"""
import json
import math
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm

puppet.RAMPS.setdefault('paper', [0x3a3226, 0x6a5c46, 0x9c8b6c, 0xc9b892, 0xece0be])
puppet.RAMPS.setdefault('oldwood', [0x1a110b, 0x2e1f14, 0x46301e, 0x634529, 0x84603a])
puppet.RAMPS.setdefault('citystone', [0x241f1b, 0x433c34, 0x675e52, 0x8f8473, 0xb6aa94])
puppet.RAMPS.setdefault('jailstone', [0x15181c, 0x262b31, 0x3c434b, 0x57606a, 0x79838e])
puppet.RAMPS.setdefault('iron', [0x101218, 0x1d2029, 0x30343f, 0x4b505e, 0x737a8b])
puppet.RAMPS.setdefault('brass', [0x3a2a10, 0x5e4419, 0x8a6a2a, 0xb8923f, 0xdcc070])
puppet.RAMPS.setdefault('waxred', [0x330909, 0x5e1212, 0x8a1f1c, 0xb33a2c, 0xd8694f])
puppet.RAMPS.setdefault('canvasochre', [0x33260f, 0x5a4419, 0x836628, 0xa98a40, 0xc9ab62])
puppet.RAMPS.setdefault('flowerblue', [0x141c3a, 0x23326a, 0x3a5aa0, 0x5f86c8, 0x9bbbe8])
puppet.RAMPS.setdefault('stem', [0x0e1a0e, 0x1d331b, 0x2f4f2a, 0x46703c, 0x6a9458])
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
# as flores brancas do registro do claustro e a flor seca da fresta, já sem cor
puppet.RAMPS.setdefault('petal', [0x3e3a30, 0x6e6856, 0xa49c84, 0xd2cbb4, 0xf4f0e2])
puppet.RAMPS.setdefault('drypetal', [0x2a2830, 0x46424e, 0x67626f, 0x8c8794, 0xb2aeb8])
puppet.SHINY.setdefault('iron', (0.45, 12))
puppet.SHINY.setdefault('brass', (0.6, 10))
puppet.SHINY.setdefault('waxred', (0.35, 10))
puppet.RIM_MATS |= {'oldwood', 'citystone', 'jailstone'}


def const(n):
    n = norm(n)
    return lambda x, y: n


def slab_nf(cx, w):
    """Normal de laje de pedra: frente quase reta, as bordas dos lados viradas para fora."""
    def nf(x, y):
        t = np.clip((np.asarray(x, np.float32) - cx) / w, -1.0, 1.0)
        e = np.sign(t) * np.clip((np.abs(t) - 0.7) / 0.3, 0, 1) * 0.7
        return (e, -0.15 + 0 * t, np.sqrt(np.maximum(0.05, 1 - e * e)))
    return nf


def flower(P, c, mat, z, r=0.55, n=5, ang=0.0):
    """Uma flor prensada vista de frente: as pétalas em volta e o miolo."""
    for k in range(n):
        a = ang + k * 2 * math.pi / n
        P.append(Ellipse('petal', mat, z, (c[0] + math.cos(a) * r, c[1] + math.sin(a) * r * 0.82), r * 0.92, r * 0.66, ang=a))
    P.append(Ellipse('heart', 'amber', z + 0.01, c, r * 0.42, r * 0.42))


def written(x0, x1, y0, y1, step=1.1, slope=0.0, skip=5, mat='paper'):
    """Linhas de letra miúda numa página (slope: a página inclinada)."""
    def fn(x, y, cur):
        yy = y - (x - x0) * slope
        if not (x0 < x < x1 and y0 < yy < y1):
            return None
        if (yy - y0) % step < 0.4 and int(x * 2.2 + yy * 1.6) % skip != 0:
            return (mat, 1)
        return None
    return fn


# ---------------------------------------------------------------- o caderno guardado (claustro)
def claustro_lectern():
    """A estante dos livros de oração no alto da arcada: o pé e a coluna de pedra lavrada, o tampo de
    madeira inclinado com o registro aberto (as linhas de nomes, uma flor azul e uma branca prensadas
    saindo entre as folhas), o bilhete dobrado espetado na beira da página, e no chão a pilha de três
    livros de oração."""
    W, H = 30, 32
    P = []
    # o pé, a coluna e o capitel de pedra
    P.append(Poly('plinth', 'citystone', 0.95, [(7.6, 28.8), (20.4, 28.8), (21.4, 31.9), (6.6, 31.9)], nf=const((0.0, -0.45, 0.89))))
    P.append(Capsule('column', 'citystone', 0.96, (14.0, 29.2), (14.0, 16.4), 1.9, 1.5))
    for y in (20.0, 25.4):
        P.append(Capsule('ring', 'citystone', 0.97, (12.0, y), (16.0, y), 0.55, 0.55, shade=0.78))
    P.append(Poly('capital', 'citystone', 0.98, [(9.4, 15.4), (18.6, 14.8), (19.0, 17.0), (9.8, 17.6)], nf=const((0.0, -0.5, 0.86))))
    # o tampo inclinado e a régua que segura o livro
    P.append(Poly('top', 'oldwood', 1.0, [(2.6, 12.6), (25.4, 9.4), (26.2, 12.4), (3.4, 15.8)], nf=const((0.12, -0.74, 0.66))))
    P.append(Poly('lip', 'oldwood', 1.02, [(2.8, 15.0), (26.2, 11.6), (26.4, 13.0), (3.0, 16.6)], nf=const((0.0, 0.3, 0.95)), shade=0.72))
    # o registro aberto: duas páginas e a lombada
    P.append(Poly('lpage', 'paper', 1.1, [(4.4, 10.8), (14.4, 9.2), (14.6, 12.8), (5.0, 14.4)], nf=const((-0.18, -0.72, 0.67))))
    P.append(Poly('rpage', 'paper', 1.1, [(14.4, 9.2), (24.0, 7.7), (24.6, 11.3), (14.6, 12.8)], nf=const((0.18, -0.74, 0.65)), shade=0.93))
    P.append(Capsule('spine', 'leather', 1.11, (14.4, 9.0), (14.6, 13.0), 0.34, 0.34))
    # as flores saindo entre as folhas: a azul pendurada na beira de baixo, a branca no canto da direita
    P.append(Capsule('stalk', 'stem', 1.12, (9.4, 13.6), (8.8, 16.0), 0.2, 0.16))
    flower(P, (8.6, 16.6), 'flowerblue', 1.13, r=0.78)
    P.append(Capsule('stalk', 'stem', 1.12, (22.6, 10.6), (24.4, 12.4), 0.18, 0.15))
    flower(P, (24.9, 12.9), 'petal', 1.13, r=0.72, ang=0.4)
    # e uma terceira, azul, aparecendo pela beira de cima da página da esquerda
    P.append(Capsule('stalk', 'stem', 1.105, (7.6, 11.2), (6.8, 9.2), 0.16, 0.13))
    flower(P, (6.6, 8.7), 'flowerblue', 1.106, r=0.62, ang=0.9)
    # o bilhete dobrado espetado na beira de cima da página da direita
    P.append(Poly('note', 'paper', 1.16, [(17.4, 8.9), (21.2, 8.3), (20.8, 5.4), (17.0, 6.0)], nf=const((0.05, -0.2, 0.98)), shade=1.06))
    names = written(5.2, 13.8, 10.6, 13.8, step=0.95, slope=-0.16)
    names_r = written(15.2, 23.6, 9.4, 12.2, step=0.95, slope=-0.16)

    def note_fold(x, y, cur):
        # a dobra no meio do bilhete e duas linhas de letra
        u = (x - 17.2) / 3.8
        v = y - (8.6 - u * 0.6)
        if abs(v + 1.45) < 0.16:
            return ('paper', 2)
        if 0.15 < u < 0.85 and (abs(v + 0.7) < 0.14 or abs(v + 2.3) < 0.14):
            return ('paper', 1)
        return None
    # a pilha de livros de oração no pé da estante
    books = (((19.6, 29.0), (29.6, 28.5), 3.2, 'leather', 1.0), ((20.4, 26.2), (28.8, 25.8), 2.9, 'ebony', 1.0),
             ((21.2, 23.8), (27.8, 23.4), 2.5, 'canvasochre', 0.9))
    for i, (a, b, h, mat, sh) in enumerate(books):
        z = 1.2 + i * 0.02
        P.append(Poly('book', mat, z, [a, b, (b[0] + 0.2, b[1] + h), (a[0] + 0.1, a[1] + h)], nf=const((0.0, -0.2, 0.98)), shade=sh))
        # as folhas na beira da direita
        P.append(Poly('edge', 'paper', z + 0.005, [(b[0] - 1.6, b[1] + 0.5), (b[0] - 0.2, b[1] + 0.4), (b[0] - 0.1, b[1] + h - 0.4), (b[0] - 1.5, b[1] + h - 0.3)], nf=const((0.3, -0.1, 0.95)), shade=0.9))
    return P, [Decal('lpage', names), Decal('rpage', names_r), Decal('note', note_fold)], W, H, []


# ---------------------------------------------------------------- o livro do Dízimo (altar)
def altar_ledger():
    """O livro grande da conta caído aberto no chão, visto de cima de leve: a capa de couro escuro com os
    cantos de latão, as duas páginas largas com as colunas das remessas (frascos, peso e o selo da Casa
    no fim de cada linha), a fita de marcar e três moedas que rolaram."""
    W, H = 38, 14
    P = []
    # a capa aberta no chão (a beira de trás mais estreita)
    P.append(Poly('cover', 'leather', 1.0, [(5.0, 4.4), (33.0, 3.6), (35.6, 12.4), (2.4, 13.2)], nf=const((0.0, -0.85, 0.52)), shade=0.72))
    for (x, y) in ((5.4, 4.6), (32.6, 3.9), (35.0, 12.1), (3.0, 12.9)):
        P.append(Ellipse('corner', 'brass', 1.02, (x, y), 1.2, 0.8))
    # as páginas, um pouco levantadas junto da lombada
    P.append(Poly('lpage', 'paper', 1.1, [(6.0, 5.0), (18.8, 4.4), (19.0, 11.8), (4.0, 12.4)], nf=const((-0.12, -0.86, 0.5))))
    P.append(Poly('rpage', 'paper', 1.1, [(18.8, 4.4), (31.8, 4.0), (34.0, 11.4), (19.0, 11.8)], nf=const((0.12, -0.86, 0.5)), shade=0.94))
    P.append(Capsule('spine', 'leather', 1.12, (18.8, 4.2), (19.0, 12.0), 0.45, 0.45, shade=0.6))
    # a fita de marcar saindo da lombada pelo pé
    P.append(Capsule('ribbon', 'canvasochre', 1.13, (19.2, 11.8), (21.4, 13.6), 0.3, 0.26))

    def entries(x, y, cur):
        # três colunas por página e as linhas de lançamento; no fim de cada linha, o selo da Casa
        left = x < 18.9
        if abs(x - 18.9) < 0.7:
            return None
        # a página deitada: as linhas correm na largura e se apertam para o fundo
        t = (y - 4.4) / 7.4
        if t < 0.08 or t > 0.94:
            return None
        if left:
            x0, x1 = 6.0 - t * 1.9, 18.4
        else:
            x0, x1 = 19.4, 31.8 + t * 2.0
        if not (x0 < x < x1):
            return None
        u = (x - x0) / (x1 - x0)
        row = (t * 8.0) % 1.0
        if row > 0.42:
            return None
        if 0.9 < u < 0.97:
            return ('waxred', 2)
        if abs(u - 0.46) < 0.03 or abs(u - 0.74) < 0.03:
            return ('paper', 1)
        if u < 0.42 and (x * 1.6) % 1.0 < 0.7:
            return ('paper', 1)
        if 0.5 < u < 0.7 and (x * 1.3) % 1.0 < 0.6:
            return ('paper', 1)
        return None
    # as moedas no chão
    for (x, y, r) in ((36.6, 12.9, 0.9), (1.4, 13.2, 0.8), (31.0, 13.4, 0.75)):
        P.append(Ellipse('coin', 'gold', 1.2, (x, y), r, r * 0.55, flat=3))
    return P, [Decal('lpage', entries), Decal('rpage', entries)], W, H, []


# ---------------------------------------------------------------- o livro das máscaras (Sala da Máscara)
def mascara_book():
    """O livro de ofício da Carcereira caído aberto no chão: a capa de couro com os cantos e o fecho de
    ferro, as páginas com os desenhos das máscaras (o oval, os olhos e as medidas), a ordem da Casa colada
    por cima da última página com o selo, e o compasso de medir rosto ao lado."""
    W, H = 36, 14
    P = []
    P.append(Poly('cover', 'leather', 1.0, [(4.0, 4.8), (28.6, 4.0), (31.0, 12.6), (1.6, 13.2)], nf=const((0.0, -0.85, 0.52)), shade=0.6))
    for (x, y) in ((4.4, 5.0), (28.2, 4.3), (30.4, 12.3), (2.2, 12.9)):
        P.append(Ellipse('corner', 'iron', 1.02, (x, y), 1.2, 0.8))
    # o fecho de ferro aberto, caído da beira da direita
    P.append(Capsule('hasp', 'iron', 1.03, (30.0, 8.2), (32.4, 10.6), 0.55, 0.5))
    P.append(Ellipse('haspring', 'iron', 1.04, (32.6, 10.9), 0.7, 0.7, flat=3))
    P.append(Poly('lpage', 'paper', 1.1, [(5.0, 5.4), (16.2, 4.8), (16.4, 11.8), (3.4, 12.4)], nf=const((-0.12, -0.86, 0.5))))
    P.append(Poly('rpage', 'paper', 1.1, [(16.2, 4.8), (27.6, 4.4), (29.6, 11.4), (16.4, 11.8)], nf=const((0.12, -0.86, 0.5)), shade=0.94))
    P.append(Capsule('spine', 'leather', 1.12, (16.2, 4.6), (16.4, 12.0), 0.42, 0.42, shade=0.55))
    # a ordem colada por cima da página da direita, mais clara, com o selo da Casa no pé
    P.append(Poly('order', 'paper', 1.15, [(20.0, 5.6), (26.6, 5.3), (27.8, 10.4), (20.4, 10.8)], nf=const((0.05, -0.88, 0.47)), shade=1.08))
    P.append(Ellipse('seal', 'waxred', 1.16, (26.0, 10.2), 0.95, 0.6))

    def masks(x, y, cur):
        # os desenhos das máscaras: o oval do rosto, os dois olhos e a régua da medida ao lado
        for (cx, cy, rx, ry) in ((7.8, 8.6, 1.9, 2.6), (12.6, 8.4, 1.9, 2.6), (18.2, 8.2, 1.3, 2.4)):
            d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            if 0.72 < d < 1.0:
                return ('paper', 1)
            for ex in (cx - rx * 0.42, cx + rx * 0.42):
                if ((x - ex) / (rx * 0.24)) ** 2 + ((y - cy + ry * 0.18) / (ry * 0.13)) ** 2 < 1.0:
                    return ('paper', 1)
        # a régua: um traço com os dentes da medida, entre os dois desenhos da esquerda
        if abs(x - 10.2) < 0.14 and 6.0 < y < 11.2:
            return ('paper', 1)
        if 9.9 < x < 10.5 and (y - 6.0) % 0.9 < 0.18 and 6.0 < y < 11.2:
            return ('paper', 1)
        return None
    order_text = written(20.8, 26.6, 6.0, 9.4, step=0.85, slope=-0.04, skip=4)
    # o compasso de medir rosto, aberto no chão à direita
    P.append(Capsule('caliper', 'iron', 1.2, (31.6, 13.6), (34.6, 9.6), 0.42, 0.32))
    P.append(Capsule('caliper', 'iron', 1.21, (35.4, 13.6), (34.8, 9.6), 0.42, 0.32))
    P.append(Ellipse('pivot', 'iron', 1.22, (34.7, 9.4), 0.65, 0.65))
    return P, [Decal('lpage', masks), Decal('rpage', masks), Decal('order', order_text)], W, H, []


# ---------------------------------------------------------------- a lista de A. (Fosso)
def fosso_crack():
    """A pedra rachada na laje de pouso, contra a parede: a laje de pedra em pé, um pouco torta, a fresta
    de cima a baixo, a folha dobrada em quatro enfiada nela (a ponta para fora, com a dobra) e um talo de
    flor seca junto; embaixo, o cascalho que caiu da pedra."""
    W, H = 22, 26
    P = []
    pts = [(3.2, 25.8), (2.4, 15.0), (3.8, 7.6), (8.6, 3.0), (14.6, 3.2), (18.8, 8.4), (19.8, 17.6), (18.8, 25.8)]
    P.append(Poly('rock', 'jailstone', 1.0, pts, nf=slab_nf(11.0, 8.6)))
    crack = [(11.6, 3.4), (10.6, 7.0), (11.4, 10.4), (10.2, 14.2), (10.8, 18.6), (9.8, 22.4), (10.4, 25.6)]

    def split(x, y, cur):
        # a fresta: a linha quebrada funda e a quina clara do lado da luz
        best = 9.0
        for (ax, ay), (bx, by) in zip(crack, crack[1:]):
            if ay <= y <= by:
                t = (y - ay) / (by - ay)
                best = min(best, x - (ax + (bx - ax) * t))
        if -0.45 < best < 0.35:
            return ('jailstone', 0)
        if -0.9 < best <= -0.45:
            return ('jailstone', 3)
        # veios e lascas da pedra
        if (x * 0.7 + y * 1.3) % 6.0 < 0.22 and (x > 13.0 or x < 8.0):
            return ('jailstone', 1)
        return None
    # a folha enfiada na fresta: a ponta dobrada para fora
    P.append(Poly('sheet', 'paper', 1.1, [(10.2, 11.2), (15.2, 10.2), (15.6, 13.8), (10.6, 14.8)], nf=const((0.2, -0.25, 0.95))))

    def fold(x, y, cur):
        u = (x - 10.4) / 5.0
        v = y - (12.6 - u * 1.0)
        if abs(v) < 0.17:
            return ('paper', 2)
        if u > 0.82:
            return ('paper', 3)
        return None
    # o talo da flor seca, enfiado junto da folha
    P.append(Capsule('stalk', 'stem', 1.12, (11.4, 11.0), (13.2, 7.4), 0.18, 0.14, shade=0.8))
    flower(P, (13.5, 6.9), 'drypetal', 1.13, r=0.5, ang=0.3)
    # o cascalho no pé
    for (x, y, r) in ((5.6, 25.4, 1.2), (16.6, 25.5, 1.0), (20.4, 25.7, 0.8), (1.4, 25.7, 0.7)):
        P.append(Ellipse('gravel', 'jailstone', 1.2, (x, y), r, r * 0.6, shade=0.9))
    return P, [Decal('rock', split), Decal('sheet', fold)], W, H, []


PROPS = {
    'deco-record-claustro-0': claustro_lectern,
    'deco-record-altar-0': altar_ledger,
    'deco-record-mascara-0': mascara_book,
    'deco-record-fosso-0': fosso_crack,
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
            bg = Image.new('RGBA', big.size, (40, 38, 44, 255))
            bg.alpha_composite(big)
            bg.save(f'{prev}/{k}.png')
        print(k, im.size, len(prims), 'partes', flush=True)
    path = f'{out}/hd.json'
    hd = json.load(open(path)) if os.path.exists(path) else {}
    hd.update(made)
    json.dump(hd, open(path, 'w'), indent=1)

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


PROPS = {
    'relic-swim': shell,
    'item-remo': remo_item,
    'deco-record-cais-0': record_cais,
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

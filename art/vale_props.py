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


PROPS = {
    'relic-swim': shell,
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

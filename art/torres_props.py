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


PROPS = {
    'deco-record-trono-0': record_trono,
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

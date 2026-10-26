"""Os registros das salas novas da v18 no traço liso (ink.py), um por objeto do cenário.

Galeria dos Nichos: a lápide raspada encostada na parede, com o cinzel caído no pé, e o livro do
coveiro aberto na estante de madeira, com a pá encostada e a lamparina acesa.

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
puppet.SHINY.setdefault('iron', (0.45, 12))
puppet.SHINY.setdefault('brass', (0.6, 10))
puppet.SHINY.setdefault('amber', (0.7, 16))
puppet.RIM_MATS |= {'oldwood', 'tomb'}

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
        if cur == 'lpage':
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


PROPS = {
    'deco-record-nichos-0': nichos_tomb,
    'deco-record-nichos-1': nichos_ledger,
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

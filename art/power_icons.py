"""Ícones dos poderes de memória das Minas no traço liso (ink.py), para o inventário (HTML).

- Lembrança: uma gota de Âmbar com uma mariposa presa dentro, parada no meio do voo (o Âmbar guarda
  o instante).
- Eco: a máscara de porcelana do cavaleiro e, logo atrás, a cópia de tinta com a borda de ouro.
- Remendo: a tigela rachada e colada com ouro, como a mulher do mineiro remendava (o ouro ainda
  escorre da rachadura).

Cada função devolve (prims, decals, W, H) em pixels do desenho (32x32; a imagem sai com ink.S por pixel).

uso: python3 power_icons.py <pasta_assets> [--preview=<pasta>]
"""
import math
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm
import mine_props  # noqa: F401  (as rampas do Âmbar e da rocha)

puppet.RAMPS['inkcopy'] = [0x08060c, 0x120e1a, 0x1c1626, 0x2a2238, 0x3c3250]
puppet.RAMPS['moth'] = [0x1a0c04, 0x34190a, 0x55300f, 0x7a4818, 0x9c6426]
puppet.RIM_MATS |= {'inkcopy'}


def const(n):
    v = norm(n)
    return lambda x, y: v


def lembranca():
    W = H = 32
    P = []
    # a gota: redonda embaixo, afinando para a ponta em cima (escorreu de um tronco, há muito tempo)
    c = (16.0, 18.6)
    P.append(Ellipse('drop', 'amber', 1.0, c, 9.6, 9.0, bulge=0.9))
    P.append(Poly('droptip', 'amber', 1.01, [(10.6, 13.2), (21.4, 13.2), (17.2, 4.6), (16.0, 3.6), (14.8, 4.6)],
                  nf=const((0.0, -0.4, 0.9)), shade=1.05))
    # a mariposa presa no meio do voo, um pouco torta: asas da frente compridas, as de trás menores,
    # cada uma com a mancha clara de olho
    ang = -0.22
    ca, sa = math.cos(ang), math.sin(ang)

    def rot(dx, dy):
        return (c[0] + dx * ca - dy * sa, c[1] - 0.4 + dx * sa + dy * ca)
    for side in (-1, 1):
        P.append(Poly('wing', 'moth', 1.5, [rot(side * 0.6, -1.6), rot(side * 6.4, -4.4), rot(side * 7.2, -1.2), rot(side * 1.0, 0.6)],
                      nf=const((side * 0.2, -0.3, 0.9)), shade=1.25))
        P.append(Poly('wing2', 'moth', 1.45, [rot(side * 0.6, 0.2), rot(side * 5.0, 1.0), rot(side * 3.6, 4.2), rot(side * 0.8, 2.6)],
                      nf=const((side * 0.2, 0.2, 0.9)), shade=1.0))
        P.append(Ellipse('spot', 'paper', 1.55, rot(side * 4.6, -2.0), 0.9, 0.75))
    P.append(Capsule('mbody', 'moth', 1.6, rot(0, -2.6), rot(0, 3.2), 0.85, 0.55, shade=0.75))
    for side in (-1, 1):
        P.append(Capsule('antenna', 'moth', 1.62, rot(side * 0.3, -2.9), rot(side * 1.9, -5.4), 0.22, 0.18))

    # o brilho da resina por cima (a mariposa fica atrás do vidro)
    def shine(x, y, cur):
        d = math.hypot(x - 12.0, y - 14.0)
        if d < 1.6:
            return ('amber', 4)
        if abs(math.hypot(x - c[0], y - c[1]) - 7.4) < 0.5 and x < 13.5 and y > 18:
            return ('amber', 3)
        return None
    return P, [Decal('drop', shine)], W, H


def eco():
    W = H = 32
    P = []
    # a cópia de tinta, um passo atrás e mais alta: a mesma máscara, com os olhos acesos de ouro
    back = (20.2, 12.8)
    P.append(Ellipse('copy', 'inkcopy', 1.0, back, 6.6, 8.2, bulge=0.9))
    P.append(Ellipse('copyeye', 'gold', 1.1, (back[0] - 2.4, back[1] - 1.0), 1.4, 0.9, ang=0.25))
    P.append(Ellipse('copyeye', 'gold', 1.1, (back[0] + 2.6, back[1] - 1.0), 1.4, 0.9, ang=-0.25))
    # a máscara de porcelana na frente
    front = (12.2, 19.0)
    P.append(Ellipse('face', 'porcelain', 2.0, front, 7.0, 8.8, bulge=0.9))
    P.append(Ellipse('eye', 'void', 2.2, (front[0] - 2.6, front[1] - 1.2), 1.6, 1.1, ang=0.25))
    P.append(Ellipse('eye', 'void', 2.2, (front[0] + 2.8, front[1] - 1.2), 1.6, 1.1, ang=-0.25))
    P.append(Capsule('mouth', 'void', 2.2, (front[0] - 1.6, front[1] + 5.0), (front[0] + 1.6, front[1] + 5.0), 0.5, 0.5))

    # a borda de ouro da cópia, por onde ela não está escondida atrás da máscara
    def rim(x, y, cur):
        u = ((x - back[0]) / 6.6) ** 2 + ((y - back[1]) / 8.2) ** 2
        if 0.76 < u < 1.0:
            return ('gold', 3)
        return None

    # a rachadura da máscara, fechada a ouro
    crack = [(13.8, 10.6), (12.8, 13.2), (14.2, 15.4), (13.0, 18.8), (14.6, 21.0)]

    def seam(x, y, cur):
        for (ax, ay), (bx, by) in zip(crack, crack[1:]):
            vx, vy = bx - ax, by - ay
            t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)))
            if math.hypot(x - (ax + vx * t), y - (ay + vy * t)) < 0.45:
                return ('gold', 3)
        return None
    return P, [Decal('copy', rim), Decal('face', seam)], W, H


def remendo():
    W = H = 32
    P = []
    # a tigela de lado: boca larga, um pouco de cima, com o pé embaixo
    P.append(Poly('bowl', 'porcelain', 1.0, [(4.0, 13.2), (28.0, 13.2), (26.4, 19.6), (22.0, 24.0), (16.0, 25.4), (10.0, 24.0), (5.6, 19.6)],
                  nf=lambda x, y: norm(((x - 16.0) / 14.0, -0.3, 0.9)), shade=1.0))
    P.append(Ellipse('mouth', 'porcelain', 1.05, (16.0, 13.2), 12.0, 2.6, shade=0.72))
    P.append(Ellipse('inside', 'void', 1.06, (16.0, 13.5), 10.6, 1.8, shade=1.0))
    P.append(Poly('foot', 'porcelain', 0.95, [(11.6, 24.4), (20.4, 24.4), (21.2, 27.4), (10.8, 27.4)], nf=const((0.0, 0.2, 0.9)), shade=0.78))
    # a rachadura que desce da boca, fechada com ouro, e a gota de ouro que ainda escorre dela
    crack = [(12.4, 13.8), (14.0, 16.4), (12.8, 18.8), (15.0, 21.4), (14.4, 24.2)]
    branch = [(14.0, 16.4), (17.8, 17.4), (20.4, 20.2)]
    # a gota de ouro que ainda escorre da rachadura, por fora da tigela
    P.append(Ellipse('drip', 'gold', 1.2, (20.8, 22.0), 0.95, 1.3))
    P.append(Capsule('dripline', 'gold', 1.19, (20.4, 20.2), (20.8, 21.4), 0.4, 0.5))

    def seam(x, y, cur):
        for line, w in ((crack, 0.6), (branch, 0.45)):
            for (ax, ay), (bx, by) in zip(line, line[1:]):
                vx, vy = bx - ax, by - ay
                t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)))
                if math.hypot(x - (ax + vx * t), y - (ay + vy * t)) < w:
                    return ('gold', 4 if y < 17 else 3)
        return None
    return P, [Decal('bowl', seam), Decal('mouth', seam)], W, H


ICONS = {'power-lembranca': lembranca, 'power-eco': eco, 'power-remendo': remendo}


if __name__ == '__main__':
    import ink
    from PIL import Image
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = args[0] if args else '.'
    only = set(args[1:])
    prev = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
    if prev:
        os.makedirs(prev, exist_ok=True)
    for k, fn in ICONS.items():
        if only and k not in only:
            continue
        prims, decals, W, H = fn()
        a = ink.render_frame(prims, decals, W, H, style=ink.HK)
        im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        im.save(f'{out}/{k}.png')
        if prev:
            big = im.resize((im.width * 4, im.height * 4), Image.NEAREST)
            bg = Image.new('RGBA', big.size, (24, 22, 30, 255))
            bg.alpha_composite(big)
            bg.save(f'{prev}/{k}.png')
        print(k, im.size, len(prims), 'partes', flush=True)

"""Ícones do inventário (24x24) e o Badalo do Sineiro caído no chão (32x32).

Os ícones aparecem na tela de inventário, no mapa e na loja do Cobrador; o badalo é o que o
chefe deixa cair quando morre. Tudo em pixel art com o mesmo renderizador dos personagens.

uso: python3 items.py <pasta_assets> [preview.png]
"""
import math
import sys
from PIL import Image
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, render, to_image

puppet.RAMPS.setdefault('bronze', [0x2e1f10, 0x5a3a18, 0x8a5c26, 0xb98a3e, 0xe4bd72])
puppet.SHINY.setdefault('bronze', (0.5, 9))
puppet.RAMPS['mist'] = [0x1e2740, 0x3a4a6e, 0x6a7fae, 0xa8bce0, 0xe6eefa]
puppet.RAMPS['whet'] = [0x17191f, 0x2b2f39, 0x434957, 0x5f6676, 0x838b9c]
OUT = 0x06070c


def img(prims, decals, W, H, rim=True):
    px, _ = render(prims, decals, W, H)
    return to_image(px, W, H, outline_col=OUT, rim=rim)


def breath():
    """Fôlego: um sopro de névoa que se enrola numa espiral e sai num fiapo fino."""
    prims = []
    n = 34
    t0 = -0.3
    pts = []
    for i in range(n + 1):
        t = t0 + (1 - t0) * i / n
        a = 0.4 + t * math.pi * 3.3
        r = 9.0 - t * 7.4
        pts.append((t, (12 + math.cos(a) * r, 12.5 + math.sin(a) * r * 0.82)))
    for (t, a), (_, b) in zip(pts, pts[1:]):
        # mais grosso onde o fiapo vira espiral, afinando para as duas pontas
        ra = 0.5 + 1.8 * (t - t0) / -t0 if t < 0 else 2.3 - t * 1.4
        prims.append(Capsule('mist', 'mist', 1.0 + t, a, b, max(0.5, ra), max(0.5, ra - 0.06)))
    return img(prims, [], 24, 24, rim=False)


def mask():
    """Máscara remendada: a máscara de porcelana com a rachadura fechada a ouro."""
    prims = [
        Ellipse('face', 'porcelain', 1.0, (12, 12.4), 7.4, 9.2, bulge=0.9),
        Ellipse('eye', 'void', 2.0, (9.0, 10.6), 1.7, 1.15, ang=0.25),
        Ellipse('eye', 'void', 2.0, (15.0, 10.6), 1.7, 1.15, ang=-0.25),
        Capsule('mouth', 'void', 2.0, (10.4, 17.0), (13.6, 17.0), 0.55, 0.55),
    ]
    crack = [(13.2, 3.4), (12.2, 6.4), (13.6, 8.6), (12.4, 12.6), (14.0, 15.0), (13.0, 21.4)]

    def gold(x, y, cur):
        for (ax, ay), (bx, by) in zip(crack, crack[1:]):
            vx, vy = bx - ax, by - ay
            L2 = vx * vx + vy * vy
            t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / L2))
            d = math.hypot(x - (ax + vx * t), y - (ay + vy * t))
            if d < 0.62:
                return ('gold', 3 if x < 12.8 else 2)
        return None
    return img(prims, [Decal('face', gold)], 24, 24)


def blade():
    """Fio do carrasco: a lâmina larga de ponta reta da espada de execução."""
    ang = math.radians(-45)
    ax, ay = math.cos(ang), math.sin(ang)
    nx, ny = -ay, ax
    base = (8.6, 15.4)

    def at(u, v):
        return (base[0] + ax * u + nx * v, base[1] + ay * u + ny * v)
    blade_pts = [at(0, -3.1), at(13.2, -3.1), at(14.6, -1.6), at(14.6, 1.6), at(13.2, 3.1), at(0, 3.1)]

    def flat(x, y):
        # face chanfrada: um lado pega a luz, o outro fica na sombra
        u = (x - base[0]) * ax + (y - base[1]) * ay
        v = (x - base[0]) * nx + (y - base[1]) * ny
        return puppet.norm((nx * -0.55 if v < 0 else nx * 0.45, ny * -0.55 if v < 0 else ny * 0.45, 0.85))
    prims = [
        Poly('blade', 'steel', 1.0, blade_pts, nf=flat),
        Capsule('guard', 'steel', 2.0, at(-0.4, -5.2), at(-0.4, 5.2), 1.1, 1.1),
        Capsule('grip', 'leather', 1.5, at(-1.4, 0), at(-6.0, 0), 1.25, 1.25),
        Ellipse('pommel', 'gold', 2.5, at(-7.1, 0), 1.6, 1.6),
    ]

    def edge(x, y, cur):
        v = (x - base[0]) * nx + (y - base[1]) * ny
        u = (x - base[0]) * ax + (y - base[1]) * ay
        if v < -2.2 and u > 0.6:
            return ('steel', 4)
        if abs(v) < 0.45 and 1.5 < u < 10.5:
            return ('steel', 1)
        return None
    return img(prims, [Decal('blade', edge)], 24, 24)


def purse():
    """Bolsa do dízimo: saco de couro amarrado, com moedas aparecendo na boca."""
    prims = [
        Ellipse('bag', 'leather', 1.0, (12, 15.2), 7.6, 6.6, bulge=0.9),
        Capsule('neck', 'leather', 1.5, (9.4, 8.6), (14.6, 8.6), 2.0, 2.0),
        Capsule('tie', 'gold', 2.0, (8.6, 9.6), (15.4, 9.6), 0.6, 0.6),
        Capsule('lace', 'gold', 2.1, (15.0, 9.8), (17.4, 12.8), 0.5, 0.45),
        Ellipse('coin', 'gold', 0.8, (10.2, 5.6), 2.6, 2.2),
        Ellipse('coin', 'gold', 0.7, (13.8, 5.0), 2.5, 2.3),
    ]

    def stitch(x, y, cur):
        # costura no meio do saco e a marca do dízimo (um olho)
        d = math.hypot(x - 12, (y - 15.5) * 1.2)
        if 2.1 < d < 2.9:
            return ('gold', 2)
        if d < 0.9:
            return ('gold', 1)
        return None
    return img(prims, [Decal('bag', stitch)], 24, 24)


def shard():
    """Lasca de porcelana: um caco branco com a borda colada a ouro."""
    pts = [(6.0, 4.6), (16.6, 3.2), (19.6, 9.4), (15.4, 13.2), (17.4, 20.4), (8.4, 19.0), (4.6, 11.4)]

    def nf(x, y):
        return puppet.norm(((12 - x) * -0.03, (11 - y) * -0.03, 0.95))
    prims = [Poly('shard', 'porcelain', 1.0, pts, nf=nf)]
    seam = [(16.6, 3.2), (19.6, 9.4), (15.4, 13.2), (17.4, 20.4)]

    def gold(x, y, cur):
        for (ax, ay), (bx, by) in zip(seam, seam[1:]):
            vx, vy = bx - ax, by - ay
            L2 = vx * vx + vy * vy
            t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / L2))
            if math.hypot(x - (ax + vx * t), y - (ay + vy * t)) < 1.05:
                return ('gold', 3)
        # um risco fino do outro lado
        if abs((y - 6) - (x - 7) * 0.9) < 0.5 and 7 < x < 11:
            return ('porcelain', 1)
        return None
    return img(prims, [Decal('shard', gold)], 24, 24)


def whetstone():
    """Pedra de amolar: barra de pedra gasta, molhada no meio, com faísca de quem amolou."""
    prims = [Capsule('stone', 'whet', 1.0, (5.2, 16.8), (18.8, 7.6), 3.6, 3.6)]

    def wet(x, y, cur):
        u = ((x - 5.2) * 13.6 + (y - 16.8) * -9.2) / 16.4
        v = ((x - 5.2) * 9.2 + (y - 16.8) * 13.6) / 16.4
        if abs(v + 0.6) < 0.7 and 3.5 < u < 13:
            return ('whet', 4)
        if v > 1.6 and cur and cur[1] > 1:
            return ('whet', cur[1] - 1)
        return None
    im = img(prims, [Decal('stone', wet)], 24, 24)
    # faíscas
    for x, y in ((18, 15), (20, 13), (19, 18), (21, 16)):
        im.putpixel((x, y), (255, 226, 150, 255))
    im.putpixel((20, 15), (255, 250, 220, 255))
    return im


def badalo():
    """O Badalo do Sineiro deitado em diagonal: argola embaixo, haste de ferro e a bola de bronze."""
    W = H = 32
    butt, top = (6.6, 25.4), (19.6, 12.4)
    ball = (23.4, 8.6)
    prims = [
        Capsule('haft', 'steel', 1.0, butt, top, 1.35, 1.2),
        Ellipse('ring', 'steel', 0.9, (5.0, 27.0), 2.6, 2.6),
        Ellipse('hole', 'void', 1.9, (5.0, 27.0), 1.0, 1.0),
        Capsule('collar', 'bronze', 2.0, (18.4, 13.6), (20.6, 11.4), 2.3, 2.6),
        Ellipse('ball', 'bronze', 3.0, ball, 6.1, 6.1),
    ]

    def band(x, y, cur):
        # faixa escura em volta da bola e a rachadura de tanto bater
        d = ((x - ball[0]) * -0.707 + (y - ball[1]) * 0.707)
        if abs(d + 1.6) < 0.55:
            return ('bronze', 1)
        if abs((x - 25.5) + (y - 6.2) * 0.4) < 0.45 and 3.4 < y < 9.6:
            return ('void', 2)
        return None
    return img(prims, [Decal('ball', band)], W, H)


ICONS = {'breath': breath, 'mask': mask, 'blade': blade, 'purse': purse, 'shard': shard, 'whetstone': whetstone}


def main(out, preview=None):
    ims = {}
    for k, fn in ICONS.items():
        ims[k] = fn()
        ims[k].save(f'{out}/item-{k}.png')
    b = badalo()
    b.save(f'{out}/item-badalo.png')
    if preview:
        S = 8
        sheet = Image.new('RGBA', ((24 * 6 + 32 + 8 * 7) * S, 40 * S), (40, 38, 44, 255))
        x = 8
        for k in ICONS:
            sheet.alpha_composite(ims[k].resize((24 * S, 24 * S), Image.NEAREST), (x * S, 8 * S))
            x += 32
        sheet.alpha_composite(b.resize((32 * S, 32 * S), Image.NEAREST), (x * S, 4 * S))
        sheet.save(preview)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)

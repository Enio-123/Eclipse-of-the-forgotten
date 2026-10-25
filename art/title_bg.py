"""Tela de título: o castelo de Vespera na chuva, sob o eclipse.

uso: python3 title_bg.py <pasta_saida>
"""
import sys
import numpy as np
from PIL import Image
from paint import Layer, banded, fbm, ridge1d, edges, rgb, quantize_alpha
from castle import eclipse_sky, storm_clouds, vespera, rock_mass

W, H = 640, 360
ECX, ECY, ER = 500, 100, 25


def mountains(L, rim, y, amp, seed, col, rimc, cells=(160, 80, 40, 20, 10)):
    hs = ridge1d(L.w, y, amp, seed, cells=cells)
    yy = np.mgrid[0:L.h, 0:L.w][0]
    m = yy >= hs[None, :]
    L.put(m, col)
    L.put(edges(m, 0, -1), rimc)
    if rim is not None:
        rim.a[m] = 0
        rim.put(edges(m, 0, -1), 0x5a6488)
    return m


def bridge(L, rim, x0, x1, deck, pier_every=34, lamp_every=None, seed=1):
    """Ponte de arcos vista de lado."""
    m = L.mask_rect(x0, deck, x1, deck + 5)
    # balaustrada
    m |= L.mask_rect(x0, deck - 3, x1, deck - 2)
    for x in range(int(x0), int(x1), 4):
        m |= L.mask_rect(x, deck - 3, x + 1, deck)
    # pilares e arcos
    yy, xx = np.mgrid[0:L.h, 0:L.w]
    x = x0 + pier_every / 2
    while x < x1 - 4:
        m |= L.mask_rect(x - 3, deck + 5, x + 3, L.h)
        x += pier_every
    # preenche o tímpano entre arcos
    arch = np.zeros_like(m)
    x = x0 + pier_every / 2
    while x < x1 - pier_every / 2:
        cx = x + pier_every / 2
        r = pier_every / 2 - 3
        span = (xx >= x) & (xx <= x + pier_every) & (yy >= deck + 5) & (yy < deck + 5 + r + 3)
        hole = ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - (deck + 5 + r + 3)) ** 2) < r * r
        arch |= span & ~hole
        x += pier_every
    m |= arch
    L.put(m, 0x0c0e18)
    L.put(edges(m, 0, -1), 0x2a2c44)
    L.put(edges(m, 1, 0), 0x1d2034)
    if rim is not None:
        rim.a[m] = 0
        rim.put(edges(m, 0, -1), 0x8f9bc4)
    lamps = []
    if lamp_every:
        x = x0 + lamp_every / 2
        while x < x1:
            L.put(L.mask_rect(x, deck - 9, x + 1, deck - 3), 0x0c0e18)
            L.put(L.mask_rect(x - 1, deck - 11, x + 2, deck - 9), 0xffc96b)
            lamps.append((x + 0.5, deck - 10))
            x += lamp_every
    return m, lamps


def glow(L, pts, r, col, strength=0.55):
    yy, xx = np.mgrid[0:L.h, 0:L.w]
    acc = np.zeros((L.h, L.w))
    for (x, y) in pts:
        d = np.hypot(xx + 0.5 - x, yy + 0.5 - y)
        acc = np.maximum(acc, np.clip(1 - d / r, 0, 1) ** 2)
    a = quantize_alpha(acc * strength, (0, 0.18, 0.36, 0.55))
    L.rgb = L.rgb * (1 - a[..., None]) + rgb(col)[None, None] * a[..., None]
    L.a = np.maximum(L.a, a)


def main(out):
    # céu
    sky = eclipse_sky(W, H, ECX, ECY, ER)
    sky.save(f'{out}/title-sky.png', opaque=True)
    # nuvens (repetem na horizontal)
    cf = storm_clouds(1280, 170, 21, density=0.5, glow_x=ECX, glow_r=260)
    cf.save(f'{out}/clouds-far.png')
    cn = storm_clouds(1280, 150, 44, density=0.42, cols=[0x07080f, 0x0b0d17, 0x111421, 0x181c2c, 0x22253a, 0x34324a], glow_x=ECX, glow_r=200)
    cn.save(f'{out}/clouds-near.png')

    land = Layer(W, H)
    rim = Layer(W, H)
    mountains(land, rim, 232, 30, 5, 0x141829, 0x2a2e46)
    # névoa do abismo atrás de tudo
    yy, xx = np.mgrid[0:H, 0:W]
    mist = np.clip((yy - 250) / 110, 0, 1) * 0.85
    mq = quantize_alpha(mist, (0, 0.25, 0.5, 0.75))
    land.rgb = land.rgb * (1 - mq[..., None]) + rgb(0x1a1e31)[None, None] * mq[..., None]
    land.a = np.maximum(land.a, mq)
    mountains(land, rim, 258, 20, 9, 0x10131f, 0x232740, cells=(128, 64, 32, 16, 8))
    # rocha do castelo e a cidade baixa
    rockm = rock_mass(land, 318, 640, 262, 360, 12, col=0x0b0d17, rim=rim, rimc=0x2a2e48, jag=6)
    rs = np.random.RandomState(8)
    houses = np.zeros((H, W), bool)
    lights = []
    for k in range(70):
        hx = rs.randint(330, 636)
        hy = 268 + int((abs(hx - 470) / 170) ** 1.3 * 40) + rs.randint(0, 46)
        hw, hh = rs.randint(5, 10), rs.randint(4, 8)
        houses |= land.mask_rect(hx, hy - hh, hx + hw, hy)
        houses |= land.mask_poly([(hx - 1, hy - hh + 1), (hx + hw / 2, hy - hh - hw * 0.55), (hx + hw + 1, hy - hh + 1)])
        if rs.rand() < 0.45:
            lights.append((hx + rs.randint(1, max(2, hw - 1)), hy - rs.randint(1, max(2, hh - 1))))
    houses &= rockm
    land.put(houses, 0x11141f)
    land.put(edges(houses, 0, -1), 0x2c2f47)
    for (lx, ly) in lights:
        land.put(land.mask_rect(lx, ly, lx + 1, ly + 1), [0xf2a03f, 0xffc96b, 0xb8622a][rs.randint(0, 3)])
    c = vespera(land, rim, 456, 264, 1.0)
    c.paint(rimc=0x5a5077)
    m, lamps = bridge(land, rim, 92, 336, 250, pier_every=30, lamp_every=20)
    glow(land, lamps, 9, 0xf2a03f, 0.5)
    glow(land, [(456 - 9, 264 - 30 - 62)], 18, 0xf2a03f, 0.22)
    glow(land, lights, 5, 0xf2a03f, 0.3)
    # o abismo engole a base dos pilares
    fade = np.clip((yy - 300) / 60, 0, 1)
    fq = quantize_alpha(fade, (0, 0.3, 0.6, 0.9))
    sel = land.a > 0
    land.rgb[sel] = land.rgb[sel] * (1 - fq[sel][..., None]) + rgb(0x161a2b) * fq[sel][..., None]
    # primeiro plano: penhasco onde o cavaleiro está
    # contorno: topo quase plano que despenca à direita
    import math
    pts = [(-4, 360)]
    rsf = np.random.RandomState(77)
    for x in range(-4, 232, 2):
        if x < 150:
            y = 298 + math.sin(x * 0.07) * 1.5 + rsf.rand() * 2
        else:
            k = (x - 150) / 82
            y = 298 + k ** 1.6 * 40 + rsf.rand() * 3 + (6 if 186 < x < 196 else 0)
        pts.append((x, y))
    pts += [(232, 360)]
    fg = land.mask_poly(pts)
    land.put(fg, 0x05060a)
    land.put(edges(fg, 0, -1), 0x1f2234)
    land.put(edges(fg, 1, 0) & ~edges(fg, 0, -1), 0x161929)
    rim.a[fg] = 0
    rim.put(edges(fg, 0, -1) | edges(fg, 1, 0), 0x6c7699)
    # fendas na rocha
    for (fx, fy, ln) in [(60, 318, 22), (122, 312, 30), (176, 330, 18)]:
        x, y = fx, fy
        for i in range(ln):
            land.put(land.mask_rect(x, y, x + 1, y + 1), 0x10121c)
            y += 1
            x += rsf.choice([-1, 0, 0, 1])
    # pedras soltas e fendas
    for (x0, y0, x1, y1) in [(176, 300, 214, 360), (196, 312, 222, 360)]:
        pass
    rs2 = np.random.RandomState(4)
    top = np.argmax(fg, axis=0)
    for x in range(0, 220):
        if fg[:, x].any() and rs2.rand() < 0.6:
            ty = top[x]
            hgt = rs2.randint(1, 6)
            land.put(land.mask_rect(x, ty - hgt, x + 1, ty), 0x1f2234 if rs2.rand() < 0.5 else 0x2b2f44)
    # árvore morta à esquerda
    def branch(x, y, ang, ln, wdt, depth):
        import math
        if depth == 0 or ln < 2:
            return
        x2, y2 = x + math.cos(ang) * ln, y + math.sin(ang) * ln
        steps = int(ln * 2)
        for i in range(steps + 1):
            t = i / steps
            px, py = x + (x2 - x) * t, y + (y2 - y) * t
            ww = max(1, wdt * (1 - t * 0.4))
            land.put(land.mask_rect(px - ww / 2, py, px + ww / 2, py + 1), 0x05060a)
            rim.put(land.mask_rect(px - ww / 2, py, px - ww / 2 + 1, py + 1), 0x6c7699)
        branch(x2, y2, ang - 0.45 - rs2.rand() * 0.3, ln * 0.72, wdt * 0.65, depth - 1)
        branch(x2, y2, ang + 0.35 + rs2.rand() * 0.3, ln * 0.6, wdt * 0.6, depth - 1)
    branch(38, top[38] + 1, -1.68, 30, 4, 5)
    land.save(f'{out}/title-land.png')
    rim.a = np.where(rim.a > 0, 1.0, 0.0)
    rim.save(f'{out}/title-rim.png')

    # prévia composta
    prev = sky.image()
    prev.alpha_composite(cf.image().crop((300, 0, 940, 170)), (0, 150))
    prev.alpha_composite(land.image())
    prev.alpha_composite(cn.image().crop((0, 70, 640, 150)), (0, 0))
    prev.resize((W * 2, H * 2), Image.NEAREST).save('title-preview.png')
    lit = prev.copy()
    lit.alpha_composite(rim.image())
    lit.resize((W * 2, H * 2), Image.NEAREST).save('title-preview-lit.png')


if __name__ == '__main__':
    main(sys.argv[1])

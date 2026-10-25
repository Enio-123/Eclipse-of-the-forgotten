"""Fundos em camadas (parallax) da Ponte do Castelo, das Catacumbas e da Memória do Vale.

uso: python3 areas_bg.py <pasta_saida> [ponte,catacumbas,memoria]
"""
import sys, math
import numpy as np
from PIL import Image
from paint import Layer, banded, fbm, ridge1d, edges, rgb, quantize_alpha, bayer
from castle import vespera, rock_mass
from title_bg import mountains, bridge, glow


# ---------------------------------------------------------------- ponte
def ponte(out):
    W, H = 1100, 360
    far = Layer(W, H)
    rim = Layer(W, H)
    mountains(far, rim, 214, 40, 15, 0x141829, 0x2a2e46, cells=(220, 110, 55, 22, 11))
    yy, xx = np.mgrid[0:H, 0:W]
    mist = quantize_alpha(np.clip((yy - 236) / 120, 0, 1) * 0.85, (0, 0.25, 0.5, 0.75))
    far.rgb = far.rgb * (1 - mist[..., None]) + rgb(0x1a1e31)[None, None] * mist[..., None]
    far.a = np.maximum(far.a, mist)
    mountains(far, rim, 250, 24, 19, 0x10131f, 0x232740, cells=(160, 80, 40, 20, 10))
    rockm = rock_mass(far, 520, 1000, 258, 360, 13, col=0x0b0d17, rim=rim, rimc=0x2a2e48, jag=8)
    rs = np.random.RandomState(18)
    houses = np.zeros((H, W), bool)
    lights = []
    for k in range(110):
        hx = rs.randint(530, 990)
        hy = 266 + int((abs(hx - 760) / 240) ** 1.3 * 46) + rs.randint(0, 50)
        hw, hh = rs.randint(6, 12), rs.randint(5, 9)
        houses |= far.mask_rect(hx, hy - hh, hx + hw, hy)
        houses |= far.mask_poly([(hx - 1, hy - hh + 1), (hx + hw / 2, hy - hh - hw * 0.55), (hx + hw + 1, hy - hh + 1)])
        if rs.rand() < 0.45:
            lights.append((hx + rs.randint(1, max(2, hw - 1)), hy - rs.randint(1, max(2, hh - 1))))
    houses &= rockm
    far.put(houses, 0x11141f)
    far.put(edges(houses, 0, -1), 0x2c2f47)
    for (lx, ly) in lights:
        far.put(far.mask_rect(lx, ly, lx + 1, ly + 1), [0xf2a03f, 0xffc96b, 0xb8622a][rs.randint(0, 3)])
    c = vespera(far, rim, 760, 262, 1.3, seed=11)
    c.paint(rimc=0x5a5077)
    glow(far, lights, 5, 0xf2a03f, 0.3)
    glow(far, [(760 - 12, 262 - 39 - 80)], 22, 0xf2a03f, 0.2)
    fade = quantize_alpha(np.clip((yy - 296) / 64, 0, 1), (0, 0.3, 0.6, 0.9))
    sel = far.a > 0
    far.rgb[sel] = far.rgb[sel] * (1 - fade[sel][..., None]) + rgb(0x161a2b) * fade[sel][..., None]
    far.save(f'{out}/bridge-far.png')
    rim.a = np.where(rim.a > 0, 1.0, 0.0)
    rim.save(f'{out}/bridge-far-rim.png')

    # camada média: aqueduto em ruínas e árvores mortas na névoa (repete a cada 1024)
    W2 = 1024
    mid = Layer(W2, H)
    rim2 = Layer(W2, H)
    rs = np.random.RandomState(5)
    m = np.zeros((H, W2), bool)
    deck = 262
    # aqueduto quebrado em trechos
    x = 0
    while x < W2:
        seg = rs.randint(180, 300)
        if rs.rand() < 0.7:
            mm, _ = bridge(Layer(W2, H), None, x, min(W2, x + seg), deck + rs.randint(-6, 12), pier_every=40)
            # quebra no fim do trecho
            m |= mm
        x += seg + rs.randint(60, 140)
    # torres arruinadas
    for k in range(4):
        tx = rs.randint(0, W2)
        tw = rs.randint(14, 22)
        th = rs.randint(60, 100)
        pts = [(tx, H), (tx, H - th), (tx + tw * 0.3, H - th - rs.randint(6, 18)), (tx + tw * 0.55, H - th + 6),
               (tx + tw * 0.8, H - th - rs.randint(0, 10)), (tx + tw, H - th + 4), (tx + tw, H)]
        m |= mid.mask_poly(pts)
    mid.put(m, 0x0e111c)
    mid.put(edges(m, 0, -1), 0x262a42)
    rim2.put(edges(m, 0, -1), 0x7d88b0)
    # névoa engole a base
    fade = quantize_alpha(np.clip((yy[:, :W2] - 240) / 80, 0, 1), (0, 0.3, 0.6, 0.85))
    sel = mid.a > 0
    mid.rgb[sel] = mid.rgb[sel] * (1 - fade[sel][..., None]) + rgb(0x181c2d) * fade[sel][..., None]
    mid.save(f'{out}/bridge-mid.png')
    rim2.a = np.where(rim2.a > 0, 1.0, 0.0)
    rim2.save(f'{out}/bridge-mid-rim.png')
    return far, mid


# ---------------------------------------------------------------- catacumbas
def gothic_hole(xx, yy, cx, top, hw, h):
    """Abertura em ogiva: retângulo + arco apontado."""
    R = hw * 1.6
    body = (np.abs(xx + 0.5 - cx) <= hw) & (yy >= top + R * 0.8) & (yy < top + h)
    a = np.hypot(xx + 0.5 - (cx - (R - hw)), yy + 0.5 - (top + R * 0.8)) <= R
    b = np.hypot(xx + 0.5 - (cx + (R - hw)), yy + 0.5 - (top + R * 0.8)) <= R
    arc = a & b & (yy < top + R * 0.8) & (yy >= top - R * 0.2)
    return body | arc


def block_wall(W, H, seed, light, cols, course=14, wmin=18, wmax=34):
    """Parede de blocos com chanfro; light (h,w) 0..1 modula o tom."""
    rs = np.random.RandomState(seed)
    yy, xx = np.mgrid[0:H, 0:W]
    tone = np.zeros((H, W))
    mortar = np.zeros((H, W), bool)
    for row in range(H // course + 1):
        y0 = row * course
        x = -rs.randint(0, wmax)
        while x < W:
            bw = rs.randint(wmin, wmax)
            base = rs.rand() * 0.18 - 0.09
            x0, x1 = max(0, x), min(W, x + bw)
            if x1 > x0:
                ys = slice(y0, min(H, y0 + course))
                tone[ys, x0:x1] = base
                # chanfro: topo/esquerda claros, base/direita escuros
                tone[y0:min(H, y0 + 1), x0:x1] += 0.16
                tone[ys, x0:min(W, x0 + 1)] += 0.1
                tone[min(H - 1, y0 + course - 2):min(H, y0 + course - 1), x0:x1] -= 0.12
                tone[ys, max(0, x1 - 2):x1] -= 0.06
                mortar[min(H - 1, y0 + course - 1), x0:x1] = True
                mortar[ys, max(0, x1 - 1)] = True
            x += bw
    # repetição horizontal: copia a borda para casar
    n = fbm(W, H, 32, seed + 3, 3) - 0.5
    t = np.clip(light + tone + n * 0.12, 0, 1)
    out = banded(t, cols)
    out[mortar] = out[mortar] * 0.55
    return out, mortar


def catacumbas(out):
    W, H = 1024, 360
    yy, xx = np.mgrid[0:H, 0:W]
    far = Layer(W, H)
    # luz: faixas de raio vindas de grades no teto + brilho baixo da água
    shafts = np.zeros((H, W))
    for cx in (210, 466, 722, 978):
        off = (xx - cx) - (yy * 0.32)
        off = (off + W / 2) % W - W / 2
        shafts = np.maximum(shafts, np.clip(1 - np.abs(off) / 30, 0, 1) ** 1.5 * np.clip(1 - yy / 360, 0, 1))
    light = 0.2 + shafts * 0.32 - np.abs(yy / H - 0.5) * 0.16
    wall, mortar = block_wall(W, H, 4, light, [0x06090b, 0x0a0f12, 0x0f161a, 0x151e22, 0x1c282b, 0x253335, 0x31403f])
    far.rgb = wall
    far.a[:] = 1
    # grandes arcos em ogiva com aduelas
    for k in range(4):
        cx = 82 + k * 256
        hole = gothic_hole(xx, yy, cx, 64, 46, 400)
        frame = gothic_hole(xx, yy, cx, 56, 54, 400) & ~hole
        depth = np.clip((yy - 60) / 300, 0, 1)
        inner_t = 0.32 - depth * 0.25 + shafts * 0.18 + (fbm(W, H, 24, 11 + k, 3) - 0.5) * 0.12
        inner = banded(np.clip(inner_t, 0, 1), [0x020304, 0x05080a, 0x090e11, 0x0e1519, 0x141e22])
        far.rgb[hole] = inner[hole]
        # degraus e colunas lá no fundo
        for dx in (-26, 26):
            col = (np.abs(xx + 0.5 - (cx + dx)) < 4) & (yy > 140) & hole
            far.rgb[col] = rgb(0x0b1114)
            far.rgb[col & (np.abs(xx + 0.5 - (cx + dx - 3)) < 1)] = rgb(0x18221f)
        for s in range(5):
            st = (yy >= 300 + s * 8) & (yy < 302 + s * 8) & hole & (np.abs(xx + 0.5 - cx) < 46 - s * 2)
            far.rgb[st] = rgb(0x111a1d)
        # aduelas
        ang = np.arctan2(yy + 0.5 - 120, xx + 0.5 - cx)
        vous = (np.floor(ang * 9) % 2 == 0)
        fc = np.where(vous[..., None], rgb(0x2a383a), rgb(0x223033))
        far.rgb[frame] = fc[frame]
        far.rgb[edges(frame, 0, -1) | edges(frame, -1, 0)] = rgb(0x3b4c4b)
        far.rgb[edges(frame, 0, 1) | edges(frame, 1, 0)] = rgb(0x121a1c)
        # musgo pendendo do arco
        mossy = frame & (fbm(W, H, 10, 40 + k, 3) > 0.55) & (yy < 140)
        far.rgb[mossy] = rgb(0x2c4a2d)
        far.rgb[mossy & edges(mossy, 0, -1)] = rgb(0x46703f)
        rs = np.random.RandomState(70 + k)
        for s in range(14):
            sx = cx + rs.randint(-54, 55)
            sy0 = int(120 - np.sqrt(max(0, 54 ** 2 - (sx - cx) ** 2)) * 1.0) + 8
            ln = rs.randint(6, 26)
            strand = (np.abs(xx + 0.5 - sx) < 0.6) & (yy >= sy0) & (yy < sy0 + ln)
            far.rgb[strand & ~hole | strand & hole] = rgb(0x24402a)
        # ossuário: nichos com fileiras de caveiras
        nx = cx + 128
        for ny in (92, 168):
            niche = (np.abs(xx + 0.5 - nx) < 22) & (yy >= ny) & (yy < ny + 44)
            far.rgb[niche] = rgb(0x040607)
            far.rgb[edges(niche, 0, 1) & ~niche | (np.abs(xx + 0.5 - nx) < 24) & (yy >= ny + 44) & (yy < ny + 47)] = rgb(0x2a3838)
            SKULL = ['.##.', '#..#', '####', '.#.#']
            for row in range(4):
                sy = ny + 3 + row * 10
                tone = [0x7b7569, 0x6a6458, 0x5b564c, 0x4e4a42][row]
                if row % 2 == 0:
                    for col in range(7):
                        if rs.rand() < 0.1:
                            continue
                        sx = nx - 19 + col * 6
                        for j, line in enumerate(SKULL):
                            for i, ch in enumerate(line):
                                if ch == '#':
                                    far.rgb[sy + 2 + j, sx + i] = rgb(tone)
                        far.rgb[sy + 2, sx + 1] = rgb(min(0x9c968a, tone + 0x141414))
                else:
                    for k2 in range(2):
                        by = sy + 3 + k2 * 3
                        far.rgb[by, nx - 19:nx + 20] = rgb(tone)
                        for e in range(nx - 19, nx + 20, 13):
                            far.rgb[by - 1:by + 2, e] = rgb(tone)
                            far.rgb[by - 1:by + 2, e + 12] = rgb(tone)
            # vela acesa
            far.rgb[(np.abs(xx + 0.5 - (nx + 26)) < 1) & (yy >= ny + 38) & (yy < ny + 44)] = rgb(0xd8cfb8)
            far.rgb[(np.abs(xx + 0.5 - (nx + 26)) < 1) & (yy >= ny + 35) & (yy < ny + 38)] = rgb(0xffc96b)
            g = np.clip(1 - np.hypot(xx - (nx + 26), yy - (ny + 36)) / 16, 0, 1) ** 2
            gq = quantize_alpha(g * 0.5, (0, 0.15, 0.3, 0.45))
            far.rgb = far.rgb * (1 - gq[..., None]) + rgb(0xf2a03f)[None, None] * gq[..., None]
    # poeira nos raios
    rq = quantize_alpha(shafts * 0.3, (0, 0.1, 0.2, 0.3))
    far.rgb = far.rgb * (1 - rq[..., None]) + rgb(0x9cc2b4)[None, None] * rq[..., None]
    far.save(f'{out}/cat-far.png', opaque=True)

    # camada média: pilares próximos, correntes e raízes
    mid = Layer(W, H)
    m = np.zeros((H, W), bool)
    rs = np.random.RandomState(12)
    pillars = []
    for k in range(3):
        cx = 170 + k * 341
        pw = rs.randint(28, 36)
        pillars.append((cx, pw))
        m |= (np.abs(xx + 0.5 - cx) < pw / 2)
        m |= (np.abs(xx + 0.5 - cx) < pw / 2 + 5) & (np.abs(yy - 40) < 5)
        m |= (np.abs(xx + 0.5 - cx) < pw / 2 + 6) & (yy > H - 18)
    m |= yy < 10
    # arcos entre os pilares
    for k in range(3):
        a0 = pillars[k][0]
        a1 = pillars[(k + 1) % 3][0] + (W if k == 2 else 0)
        ac = (a0 + a1) / 2
        r = (a1 - a0) / 2
        for off in (0, -W):
            dd = np.hypot(xx + 0.5 - (ac + off), (yy + 0.5 - 70) * 1.6)
            m |= (dd > r - 10) & (dd < r + 2) & (yy < 70)
    mid.put(m, 0x05080a)
    shade = np.clip((xx % 341) / 341, 0, 1)
    mid.put(edges(m, -1, 0) | edges(m, -2, 0), 0x18221f)
    mid.put(edges(m, 0, -1), 0x22302d)
    # veios de musgo no lado escuro
    streak = m & (fbm(W, H, 6, 21, 2) > 0.58) & ((xx + 3) % 3 != 0)
    mid.put(streak & (fbm(W, H, 40, 23, 2) > 0.5), 0x13241a)
    # correntes penduradas
    for k in range(6):
        cx = rs.randint(0, W)
        ln = rs.randint(50, 160)
        for y in range(10, ln):
            if y % 5 < 4:
                ww = 1 if y % 5 in (1, 2) else 0
                mid.put(mid.mask_rect(cx - ww, y, cx + 1 + ww, y + 1), 0x0b1013)
        mid.put(mid.mask_rect(cx - 2, ln, cx + 3, ln + 3), 0x0b1013)
    for k in range(9):
        x = rs.randint(0, W)
        y = 10
        for i in range(rs.randint(20, 70)):
            mid.put(mid.mask_rect(x, y, x + 1, y + 1), 0x080b0d)
            y += 1
            x += rs.choice([-1, 0, 0, 0, 1])
    mid.save(f'{out}/cat-mid.png')
    return far, mid


# ---------------------------------------------------------------- memória
def tree(L, tx, ty, r, pink, rs, light=(-0.7, -0.7)):
    """Árvore pintada: tronco e copa de bolhas iluminadas pela esquerda."""
    H, W = L.h, L.w
    yy, xx = np.mgrid[0:H, 0:W]
    trunk_h = int(r * 1.1)
    L.put(L.mask_rect(tx - 1, ty - trunk_h, tx + 1, ty + 1), 0x6b4a32)
    L.put(L.mask_rect(tx - 1, ty - trunk_h, tx, ty + 1), 0x8a6444)
    cols = [0xb4507e, 0xcf6c96, 0xe58cb0, 0xf4abc7, 0xffd2e2] if pink else [0x2a6a34, 0x367f3c, 0x4b9746, 0x67b053, 0x8ccb68]
    blob = np.zeros((H, W), bool)
    shade = np.zeros((H, W))
    for b in range(6):
        bx = tx + rs.randint(-r // 2, r // 2 + 1)
        by = ty - trunk_h - rs.randint(0, r // 2 + 1)
        br = r * rs.uniform(0.5, 0.75)
        e = L.mask_ellipse(bx, by, br, br * 0.85)
        nx = (xx + 0.5 - bx) / br
        ny = (yy + 0.5 - by) / (br * 0.85)
        s = np.clip(0.55 - (nx * light[0] + ny * light[1]) * -0.45, 0, 1)
        shade = np.where(e, np.maximum(shade, s), shade)
        blob |= e
    n = fbm(W, H, 3, int(tx) + 5, 2)
    t = np.clip(shade + (n - 0.5) * 0.35, 0, 1)
    L.put(blob, banded(t, cols))
    # sombra embaixo da copa
    under = blob & ~np.roll(blob, -2, axis=0)
    L.put(under, cols[0])


def memoria(out):
    W, H = 640, 360
    yy, xx = np.mgrid[0:H, 0:W]
    sky = Layer(W, H)
    t = yy / H
    n = fbm(W, H, 80, 31, 4)
    sky.rgb = banded(np.clip(t * 1.08 + (n - 0.5) * 0.06, 0, 1),
                     [0x3d7bcf, 0x4f8ad7, 0x649ade, 0x7eabe3, 0x9cbfe8, 0xbcd2ea, 0xdedfe0, 0xf6e6cf, 0xffe1b2])
    sky.a[:] = 1
    sx, sy = 132, 168
    d = np.hypot(xx + 0.5 - sx, yy + 0.5 - sy)
    g = np.clip(1 - d / 260, 0, 1) ** 2.2
    gq = quantize_alpha(g, (0, 0.14, 0.28, 0.42, 0.56, 0.7))
    sky.rgb = sky.rgb * (1 - gq[..., None]) + rgb(0xfff3d6)[None, None] * gq[..., None]
    sky.rgb[d < 13] = rgb(0xfffcf2)
    # raios de sol
    ang = np.arctan2(yy + 0.5 - sy, xx + 0.5 - sx)
    rays = (np.sin(ang * 13) > 0.6) & (d > 20) & (d < 300) & (yy < sy)
    rq = quantize_alpha(rays * np.clip(1 - d / 300, 0, 1) * 0.35, (0, 0.12, 0.24))
    sky.rgb = sky.rgb * (1 - rq[..., None]) + rgb(0xfff6e0)[None, None] * rq[..., None]
    # nubladas espalhadas com borda dourada
    cl = fbm(W, H, 72, 46, 5, 0.55)
    band = np.exp(-((yy - 92) / 60.0) ** 2)
    v = cl * band
    cm = v > 0.42
    lightdir = np.roll(cl, 3, axis=1) - cl + (np.roll(cl, -3, axis=0) - cl)
    sh = np.clip((v - 0.42) * 3 + lightdir * 7 + 0.35, 0, 1)
    cc = banded(sh, [0xa9abd2, 0xc3c3e0, 0xdcd9ec, 0xf3eef2, 0xfff6e6, 0xffffff])
    sky.rgb[cm] = cc[cm]
    rimc = cm & ~np.roll(cm, 1, axis=1)
    sky.rgb[rimc] = rgb(0xffe8c2)
    sky.save(f'{out}/mem-sky.png', opaque=True)

    # ---- montanhas, penhascos e cachoeiras (repete a cada 1280)
    W2 = 1280
    yy2, xx2 = np.mgrid[0:H, 0:W2]
    far = Layer(W2, H)
    hs = ridge1d(W2, 182, 120, 52, cells=(320, 160, 80, 40, 20, 10), gains=(1, 0.55, 0.3, 0.16, 0.08, 0.04))
    mm = yy2 >= hs[None, :]
    slope = np.broadcast_to(np.gradient(hs)[None, :], (H, W2))
    rel = np.clip((yy2 - hs[None, :]) / 120, 0, 1)
    lt = np.clip(0.55 - slope * 0.12 - rel * 0.35 + (fbm(W2, H, 10, 3, 2) - 0.5) * 0.2, 0, 1)
    far.put(mm, banded(lt, [0x7d8fbc, 0x8b9dc6, 0x9aabd0, 0xaab9d9, 0xbccae3]))
    snowline = 158 + fbm(W2, H, 20, 61, 3) * 18
    snow = mm & (yy2 < snowline)
    sc = banded(np.clip(0.55 - slope * 0.2 + (fbm(W2, H, 5, 63, 2) - 0.5) * 0.4, 0, 1), [0xb9c6e2, 0xd5def0, 0xecf1f9, 0xffffff])
    far.rgb[snow] = sc[snow]
    # cadeia intermediária azul-esverdeada
    hs2 = ridge1d(W2, 214, 30, 57, cells=(256, 128, 64, 32, 16, 8), gains=(1, 0.55, 0.3, 0.16, 0.08, 0.04))
    m2 = yy2 >= hs2[None, :]
    slope2 = np.broadcast_to(np.gradient(hs2)[None, :], (H, W2))
    lt2 = np.clip(0.55 - slope2 * 0.14 - np.clip((yy2 - hs2[None, :]) / 80, 0, 1) * 0.35, 0, 1)
    far.put(m2, banded(lt2, [0x4f7d97, 0x5b8ca2, 0x6a9cae, 0x7eadbb, 0x95bfc7]))
    # penhascos com cachoeiras
    hs3 = ridge1d(W2, 232, 26, 59, cells=(160, 80, 40, 20, 10), gains=(1, 0.5, 0.25, 0.12, 0.06))
    m3 = yy2 >= hs3[None, :]
    stri = (fbm(W2, H, 3, 64, 1) - 0.5) * 0.5 + np.sin(xx2 * 0.9) * 0.08
    lt3 = np.clip(0.6 - np.clip((yy2 - hs3[None, :]) / 70, 0, 1) * 0.55 + stri, 0, 1)
    far.put(m3, banded(lt3, [0x3d6a60, 0x4a7a6c, 0x5a8b79, 0x6c9c87, 0x82ad97]))
    top3 = m3 & ~np.roll(m3, 1, axis=0)
    grass = m3 & (yy2 < hs3[None, :] + 3)
    far.rgb[grass] = rgb(0x7fb85a)
    far.rgb[top3] = rgb(0xa9d877)
    for fx in (210, 640, 1010):
        top = int(hs3[fx])
        w = 6 if fx != 640 else 9
        fall = (np.abs(xx2 + 0.5 - fx) < w) & (yy2 >= top) & (yy2 < 336)
        streak = ((xx2 * 3 + (yy2 // 2)) % 5 == 0)
        col = np.where(streak[..., None], rgb(0xffffff)[None, None], rgb(0xcde6f0)[None, None])
        far.rgb[fall] = col[fall]
        far.rgb[fall & (np.abs(xx2 + 0.5 - fx) > w - 1)] = rgb(0x9cc7da)
        spray = np.clip(1 - np.hypot(xx2 + 0.5 - fx, (yy2 + 0.5 - 334) * 1.8) / (w * 6), 0, 1)
        sq = quantize_alpha(spray, (0, 0.35, 0.7, 1.0))
        far.rgb = far.rgb * (1 - sq[..., None]) + rgb(0xf4fbfd)[None, None] * sq[..., None]
        far.a = np.maximum(far.a, sq)
    haze = quantize_alpha(np.clip((yy2 - 262) / 100, 0, 1) * 0.75, (0, 0.2, 0.4, 0.6))
    sel = far.a > 0
    far.rgb[sel] = far.rgb[sel] * (1 - haze[sel][..., None]) + rgb(0xeaf1e6) * haze[sel][..., None]
    far.save(f'{out}/mem-far.png')

    # ---- colinas, árvores e casinhas (repete a cada 1024)
    W3 = 1024
    yy3, xx3 = np.mgrid[0:H, 0:W3]
    mid = Layer(W3, H)
    rs = np.random.RandomState(9)
    specs = [(268, 18, 71, [0x5c9e4e, 0x6daf55, 0x82bf5f, 0x9bcf6c, 0xb5de7c]),
             (300, 16, 73, [0x3f8640, 0x4c9846, 0x5daa4d, 0x74bc57, 0x8fcd63])]
    for k, (base, amp, seed, cols) in enumerate(specs):
        hs = ridge1d(W3, base, amp, seed, cells=(256, 128, 64, 32))
        m = yy3 >= hs[None, :]
        slope = np.broadcast_to(np.gradient(hs)[None, :], (H, W3))
        lt = np.clip(0.62 - slope * 0.2 - np.clip((yy3 - hs[None, :]) / 50, 0, 1) * 0.45 + (fbm(W3, H, 6, seed, 2) - 0.5) * 0.25, 0, 1)
        mid.put(m, banded(lt, cols))
        mid.put(m & ~np.roll(m, 1, axis=0), 0xd2ef94)
        dark = m & (fbm(W3, H, 28, seed + 4, 3) > 0.6) & (yy3 > hs[None, :] + 3)
        mid.rgb[dark] = mid.rgb[dark] * 0.94
        rsf = np.random.RandomState(seed)
        for f in range(260 if k else 160):
            fx = rsf.randint(0, W3)
            fy = int(hs[fx]) + rsf.randint(2, 60 if k else 30)
            if fy < H:
                mid.rgb[fy, fx] = rgb([0xffffff, 0xffd65e, 0xf4a7c4, 0xc9b6ff][rsf.randint(0, 4)])
        if k == 0:
            # campos e casinhas na colina do fundo
            fields = m & (fbm(W3, H, 30, 77, 2) > 0.64) & (yy3 > hs[None, :] + 6)
            mid.rgb[fields] = mid.rgb[fields] * 0.92 + rgb(0xd7d36c) * 0.08
            for h in range(8):
                hx = rs.randint(20, W3 - 30)
                hy = int(hs[hx]) + rs.randint(5, 14)
                hw, hh = rs.randint(9, 14), rs.randint(6, 8)
                mid.put(mid.mask_rect(hx, hy - hh, hx + hw, hy), 0xf5ead4)
                mid.put(mid.mask_rect(hx + hw - 3, hy - hh, hx + hw, hy), 0xdccbad)
                roof = mid.mask_poly([(hx - 2, hy - hh + 1), (hx + hw / 2, hy - hh - hw * 0.5), (hx + hw + 2, hy - hh + 1)])
                mid.put(roof, 0xb8433b)
                mid.put(roof & ~np.roll(roof, 1, axis=1), 0xe2725c)
                mid.put(mid.mask_rect(hx + 3, hy - hh + 2, hx + 5, hy - hh + 5), 0x5a3a2a)
                mid.put(mid.mask_rect(hx + hw - 4, hy - 4, hx + hw - 2, hy), 0x7a4a30)
            for tr in range(14):
                tx = rs.randint(0, W3)
                tree(mid, tx, int(hs[tx]) + 2, rs.randint(5, 8), rs.rand() < 0.5, rs)
        else:
            # caminho de terra
            path = m & (np.abs(yy3 - (hs[None, :] + 10 + np.sin(xx3 / 70) * 5)) < 2)
            mid.rgb[path] = rgb(0xe8d6a6)
            for tr in range(11):
                tx = rs.randint(0, W3)
                tree(mid, tx, int(hs[tx]) + 2, rs.randint(9, 14), rs.rand() < 0.6, rs)
    mid.save(f'{out}/mem-mid.png')
    return sky, far, mid


if __name__ == '__main__':
    out = sys.argv[1]
    which = sys.argv[2].split(',') if len(sys.argv) > 2 else ['ponte', 'catacumbas', 'memoria']
    if 'ponte' in which:
        far, mid = ponte(out)
        sky = Image.open(f'{out}/title-sky.png').convert('RGBA')
        prev = sky.copy()
        prev.alpha_composite(Image.open(f'{out}/clouds-far.png').crop((0, 0, 640, 170)), (0, 150))
        prev.alpha_composite(far.image().crop((300, 0, 940, 360)))
        prev.alpha_composite(mid.image().crop((0, 0, 640, 360)))
        prev.resize((1280, 720), Image.NEAREST).save('prev-ponte.png')
    if 'catacumbas' in which:
        far, mid = catacumbas(out)
        prev = far.image().crop((0, 0, 640, 360))
        prev.alpha_composite(mid.image().crop((0, 0, 640, 360)))
        prev.resize((1280, 720), Image.NEAREST).save('prev-catacumbas.png')
    if 'memoria' in which:
        sky, far, mid = memoria(out)
        prev = sky.image()
        prev.alpha_composite(far.image().crop((0, 0, 640, 360)))
        prev.alpha_composite(mid.image().crop((0, 0, 640, 360)))
        prev.resize((1280, 720), Image.NEAREST).save('prev-memoria.png')
    print('ok')

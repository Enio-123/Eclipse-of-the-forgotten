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
    sx, sy = 112, 236
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
    hs = ridge1d(W2, 178, 58, 52, cells=(320, 160, 80, 40, 20, 10), gains=(1, 0.55, 0.3, 0.16, 0.08, 0.04))
    mm = yy2 >= hs[None, :]
    slope = np.broadcast_to(np.gradient(hs)[None, :], (H, W2))
    rel = np.clip((yy2 - hs[None, :]) / 120, 0, 1)
    lt = np.clip(0.55 - slope * 0.12 - rel * 0.35 + (fbm(W2, H, 10, 3, 2) - 0.5) * 0.2, 0, 1)
    far.put(mm, banded(lt, [0x7d8fbc, 0x8b9dc6, 0x9aabd0, 0xaab9d9, 0xbccae3]))
    snowline = 150 + fbm(W2, H, 20, 61, 3) * 16
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
    hs3 = ridge1d(W2, 246, 14, 59, cells=(160, 80, 40, 20, 10), gains=(1, 0.5, 0.25, 0.12, 0.06))
    m3 = yy2 >= hs3[None, :]
    stri = (fbm(W2, H, 3, 64, 1) - 0.5) * 0.5 + np.sin(xx2 * 0.9) * 0.08
    lt3 = np.clip(0.6 - np.clip((yy2 - hs3[None, :]) / 70, 0, 1) * 0.55 + stri, 0, 1)
    far.put(m3, banded(lt3, [0x2f5a52, 0x3a6a5e, 0x48796a, 0x5a8a77, 0x6f9c86]))
    top3 = m3 & ~np.roll(m3, 1, axis=0)
    grass = m3 & (yy2 < hs3[None, :] + 3)
    far.rgb[grass] = rgb(0x7fb85a)
    far.rgb[top3] = rgb(0xa9d877)
    for fx in (210, 640, 1010):
        top = int(hs3[fx])
        w = 4 if fx != 640 else 6
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
        if k == 0:
            # campos e casinhas na colina do fundo
            fields = m & (fbm(W3, H, 30, 77, 2) > 0.62) & (yy3 > hs[None, :] + 6)
            mid.rgb[fields & ((xx3 + yy3) % 3 == 0)] = rgb(0xd7d36c)
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



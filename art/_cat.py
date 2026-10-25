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
            for row in range(4):
                for col in range(7):
                    sx, sy = nx - 18 + col * 6, ny + 3 + row * 10
                    if rs.rand() < 0.12:
                        continue
                    sk = (np.abs(xx + 0.5 - sx) < 2.6) & (np.abs(yy + 0.5 - (sy + 3)) < 2.4)
                    tone = [0x8d877a, 0x777164, 0x5e594f][row % 3]
                    far.rgb[sk] = rgb(tone)
                    far.rgb[sk & (yy == sy + 3) & ((xx == sx - 1) | (xx == sx + 1))] = rgb(0x161410)
                    far.rgb[sk & (yy == sy + 1)] = rgb(min(0xa9a394, tone + 0x101010))
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



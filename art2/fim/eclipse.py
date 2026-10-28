"""Final II, plano 5: o novo Eclipse cobrindo Vespera (rascunho para finais.py, f_eclipse).

uso: python3 eclipse.py [ref]   -> dbg/eclipse-ref.png (e art7/out/eclipse.png sem 'ref')
"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('FIM_OUT', os.path.join(HERE, 'out'))
CACHE = os.path.join(HERE, 'cache')
os.makedirs(CACHE, exist_ok=True)
sys.path.insert(0, os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
from finais import *  # noqa

# ---------------------------------------------------------------- o novo Eclipse sobre Vespera
# O contraplano de "vespera" (Final I): da beira da cidade, o rio sobe até o morro das Torres. A câmera saiu do
# salão do trono e se afastou até aqui. As Torres ficam acima das nuvens, que se juntam em volta do alto do morro
# com a luz dourada das memórias por dentro; a janela do salão do trono é a única acesa nelas, e em cima da torre
# do meio, entre as duas agulhas, o núcleo pendurado nas correntes. Em cima de tudo, o novo Eclipse: o disco
# negro, o anel e a coroa. Em volta do horizonte, a faixa de crepúsculo de todo eclipse (longe dali, fora da
# sombra, ainda é dia); a cidade embaixo, na sombra, vai apagando as janelas, primeiro as do lado das Torres.
# Em metros: X para os lados (o meio do rio é 0), Y para cima, Z para longe.
EC_VX, EC_VY, EC_F, EC_CAMH = 640.0, 452.0, 1500.0, 52.0
EC_SUN = (640.0, 84.0)
EC_R = 50.0
EC_RIVER = 30.0
EC_BANK = 3.0
EC_ZT = 1800.0      # a frente do morro das Torres
EC_PLAT = 150.0     # o alto do morro (o pátio, no pé das três torres)
EC_CLOUD = 138.0    # o alto das nuvens em volta do morro


def ec_p(X, Y, Z=EC_ZT):
    return (EC_VX + X * EC_F / Z, EC_VY + (EC_CAMH - Y) * EC_F / Z)


def ec_hz(x):
    """A cor do ar longe (a névoa da sombra, mais quente para os lados, onde a sombra acaba)."""
    s = np.clip(np.abs(np.asarray(x, np.float32) - EC_VX) / 640.0, 0, 1)
    return mix(col(0x3a2436), col(0x5e3634), (s ** 1.5)[..., None])


def ec_sky(rng, yy, xx):
    """O céu do eclipse: escuro em cima, o roxo da sombra, a faixa de crepúsculo no horizonte; as nuvens altas
    finas com a beira virada para a coroa acesa."""
    SX, SY = EC_SUN
    d_e = np.hypot(xx - SX, yy - SY)
    t = np.clip(yy / EC_VY, 0, 1.3)
    ref = vgrad([(0.0, col(0x08070f)), (0.3, col(0x100d1d)), (0.55, col(0x1b1529)), (0.7, col(0x281c33)),
                 (0.8, col(0x3c2537)), (0.88, col(0x5c3036)), (0.94, col(0x84432f)), (0.985, col(0xa8622f)),
                 (1.0, col(0xbc7a3e)), (1.3, col(0xbc7a3e))], t)
    # a faixa do horizonte é mais forte longe do meio (a sombra é redonda: nas pontas ela acaba antes)
    side = np.clip(np.abs(xx - EC_VX) / 640.0, 0, 1)
    ref = mix(ref, col(0xd8944a), (sstep(0.8, 1.0, t) * side ** 1.5 * 0.35)[..., None])
    # o ar em volta da coroa: violeta largo, dourado perto
    ref = mix(ref, col(0x221a36), (np.exp(-(d_e / 420) ** 2) * 0.6)[..., None])
    ref = mix(ref, col(0x463656), (np.exp(-(d_e / 210) ** 2) * 0.55)[..., None])
    ref = mix(ref, col(0x9a7a6e), (np.exp(-(d_e / 110) ** 2) * 0.5)[..., None])
    # as nuvens altas: fios compridos, a barriga virada para a coroa acesa (ouro perto, lilás longe)
    n1 = stretched_noise(H, W, 46, 6.0, rng, 5)
    n2 = stretched_noise(H, W, 14, 4.0, rng, 3)
    band = sstep(0.56, 0.72, n1 * 0.8 + n2 * 0.2) * sstep(0.12, 0.26, t) * (1 - sstep(0.6, 0.78, t))
    band = band * (1 - np.exp(-(d_e / (EC_R + 16)) ** 6))
    near = np.exp(-(d_e / 320) ** 2)
    ref = mix(ref, mix(col(0x15111f), col(0x3a2c40), near[..., None]), (band * 0.7)[..., None])
    lit = facing_sun(ref, band, xx, yy, EC_SUN, 1.6)
    ref = mix(ref, mix(col(0x5e4a70), col(0xe8b47a), near[..., None]), (lit * (0.2 + 0.8 * near) * 0.9)[..., None])
    return ref, band, d_e


def ec_hills(ref, rng, yy, xx):
    """Os morros longe, dos dois lados do morro das Torres, contra a faixa do horizonte (a beira de cima pega o
    crepúsculo)."""
    xs = np.arange(W)
    hl = EC_VY - 8 - 16 * noise1d(W, 110, rng, 3) - 24 * np.exp(-((xs - 170) / 150.0) ** 2) - 30 * np.exp(-((xs - 1130) / 180.0) ** 2)
    hl = hl - 12 * np.exp(-((xs - 930) / 80.0) ** 2) - 10 * np.exp(-((xs - 330) / 70.0) ** 2)
    m = sstep(hl[None, :] - 0.8, hl[None, :] + 0.8, yy) * (yy < EC_VY + 60)
    ref = put(ref, mix(ec_hz(xx), col(0x24182a), 0.45), m)
    rim = np.clip(m - shifted(m, 0, 1.5), 0, 1)
    ref = put(ref, col(0xc07848), rim * 0.5)
    return ref, m


def ec_crag(ref, rng, yy, xx, tex):
    """O morro das Torres: paredões de pedra escura até o pátio, na névoa (de longe, já meio da cor do ar)."""
    prof = [(-340, 0), (-300, 24), (-276, 44), (-250, 52), (-226, 80), (-200, 92), (-182, 112), (-160, 120), (-146, 138),
            (-128, 146), (-112, EC_PLAT), (112, EC_PLAT), (124, 146), (138, 134), (156, 124), (170, 104), (196, 92),
            (214, 70), (240, 56), (272, 36), (310, 16), (350, 0)]
    pts = [ec_p(X + rng.uniform(-2, 2), Y + rng.uniform(-2, 2)) for X, Y in prof]
    pts = [ec_p(-380, -10)] + pts + [ec_p(380, -10)]
    m = Mask(W, H).poly(pts).array()
    # os paredões: listras de pedra em pé, as quinas um pouco mais claras
    streak = stretched_noise(H, W, 9, 0.16, rng, 3)
    rock = mix(col(0x140f1a), col(0x2a1f2e), streak[..., None] * 0.65 + tex[..., None] * 0.2)
    ref = put(ref, mix(rock, ec_hz(xx), 0.34), m)
    top = np.clip(m - shifted(m, 0, 1.6), 0, 1)
    ref = put(ref, col(0x9c7a8a), top * 0.4)
    return ref, m


def ec_aqueduct(ref, rng, solid):
    """A calha chegando ao pátio pela direita, em cima dos arcos, sumindo para o fundo (os pés dos pilares nas
    nuvens). Em contraluz: o lado de cá escuro, a beira de cima do parapeito acesa."""
    wall = Mask(W, H)
    hole = Mask(W, H)
    rimm = Mask(W, H)
    X0, Z0, X1, Z1 = 112.0, EC_ZT, 1500.0, 3800.0
    top, low = EC_PLAT + 1.0, EC_CLOUD - 80.0
    n = 64
    P = lambda u, Y: ec_p(X0 + (X1 - X0) * u, Y, Z0 + (Z1 - Z0) * u)
    wall.poly([P(0, top), P(1, top), P(1, low), P(0, low)])
    rimm.line([P(0, top), P(1, top)], 1.0)
    span_m = math.hypot(X1 - X0, Z1 - Z0) / n
    R = span_m * 0.42
    Ys = top - 9.0 - R
    for k in range(n):
        u0, u1 = (k + 0.16) / n, (k + 1) / n
        pts = [P(u0, low), P(u0, Ys)]
        for ang in np.linspace(math.pi, 0, 12):
            pts.append(P(u0 + (u1 - u0) * (0.5 - 0.5 * math.cos(ang)), Ys + R * math.sin(ang)))
        pts += [P(u1, Ys), P(u1, low)]
        hole.poly(pts)
    am = np.clip(wall.array() - hole.array(), 0, 1)
    ref = put(ref, col(0x1d1622), am)
    ref = put(ref, col(0xb08a8a), rimm.array() * 0.5)
    solid[:] = np.maximum(solid, am)
    return ref


def ec_tower(ref, rng, yy, xx, cx, hw, top, base, apex, solid, marks):
    """Uma torre de pedra escura e reta (a mesma da paz, de frente): as cintas de bronze, as runas no meio da
    cara, as frestas e, nas dos lados, o telhado em ponta com a haste de bronze. Embaixo o ouro das nuvens acende a
    pedra; em cima, as beiras pegam a coroa."""
    t = np.clip((yy - top) / max(base - top, 1), 0, 1)
    under = t ** 2.4
    stone = mix(col(0x14111e), col(0x4a3038), under[..., None])
    n = value_noise(H, W, 4, rng, 2)[..., None]
    q = patch([(cx - hw, base + 6), (cx - hw, top), (cx + hw, top), (cx + hw, base + 6)])
    if q is not None:
        a, sl = q
        ref[sl] = ref[sl] * (1 - a[..., None]) + (stone[sl] * (0.88 + 0.24 * n[sl])) * a[..., None]
        solid[sl] = np.maximum(solid[sl], a)
    y = top + 14
    k = 0
    while y < base - 4:
        bq = patch([(cx - hw - 0.8, y), (cx + hw + 0.8, y), (cx + hw + 0.8, y + 1.7), (cx - hw - 0.8, y + 1.7)])
        if bq is not None:
            a, sl = bq
            tt = (y - top) / (base - top)
            bc = mix(col(0x2e2016), col(0xc88a4c), min(1.0, tt ** 3 * 1.1))
            ref[sl] = ref[sl] * (1 - a[..., None]) + bc * a[..., None]
            marks['bands'][sl] = np.maximum(marks['bands'][sl], a)
        y += 22 + 3 * math.sin(k)
        k += 1
    for i, wy in enumerate(np.arange(top + 17, base - 22, 43)):
        wx = cx + (hw * 0.45 if i % 2 else -hw * 0.45)
        w = patch([(wx - 0.9, wy), (wx + 0.9, wy), (wx + 0.9, wy + 5), (wx - 0.9, wy + 5)])
        if w is not None:
            a, sl = w
            ref[sl] = ref[sl] * (1 - a[..., None]) + col(0x07050c) * a[..., None]
    if apex is not None:
        lf = patch([(cx - hw - 1.5, top + 0.8), (cx, apex), (cx, top + 0.8)])
        rf = patch([(cx, top + 0.8), (cx, apex), (cx + hw + 1.5, top + 0.8)])
        inner_left = cx > EC_VX
        for pq, lit in ((lf, inner_left), (rf, not inner_left)):
            if pq is not None:
                a, sl = pq
                c = col(0x2c2238) if lit else col(0x16111e)
                ref[sl] = ref[sl] * (1 - a[..., None]) + c * a[..., None]
                solid[sl] = np.maximum(solid[sl], a)
        fin = patch(edge_quad((cx, apex + 1), (cx, apex - 8), 1.1))
        if fin is not None:
            a, sl = fin
            ref[sl] = ref[sl] * (1 - a[..., None]) + col(0x8a6038) * a[..., None]
            solid[sl] = np.maximum(solid[sl], a)


def ec_towers(ref, rng, yy, xx, solid):
    """As três torres saindo das nuvens, como na paz (a mesma silhueta, de frente e mais perto): a do Arquivo e a
    das Experiências com o telhado em ponta, e a maior no meio, com o terraço, as duas agulhas rúnicas e o núcleo
    preso nas quatro correntes. Só a janela do salão do trono está acesa. Devolve as máscaras e o núcleo."""
    s = 0.75
    base = ec_p(0, EC_CLOUD)[1] - 4
    cx = EC_VX
    marks = dict(bands=np.zeros((H, W), np.float32))
    ec_tower(ref, rng, yy, xx, cx - 62 * s, 17 * s, base - 160 * s, base, base - 194 * s, solid, marks)
    ec_tower(ref, rng, yy, xx, cx + 58 * s, 15 * s, base - 144 * s, base, base - 172 * s, solid, marks)
    top = base - 230 * s
    ec_tower(ref, rng, yy, xx, cx, 24 * s, top, base, None, solid, marks)
    # o terraço: a cornija e as duas agulhas; o núcleo entre elas, nas quatro correntes
    nd = 23 * s
    parts = [([(cx - 29 * s, top + 2), (cx + 29 * s, top + 2), (cx + 29 * s, top - 8 * s), (cx - 29 * s, top - 8 * s)], col(0x241c2e))]
    for sx_ in (-1, 1):
        x0 = cx + sx_ * nd
        parts.append(([(x0 - 4 * s, top - 7 * s), (x0 + 4 * s, top - 7 * s), (x0 + 1 * s, top - 70 * s), (x0 - 1 * s, top - 70 * s)], col(0x1a1424)))
    for pts, c in parts:
        q = patch(pts)
        if q is not None:
            a, sl = q
            ref[sl] = ref[sl] * (1 - a[..., None]) + c * a[..., None]
            solid[sl] = np.maximum(solid[sl], a)
    core = (cx, top - 32 * s)
    chain = Mask(W, H)
    for (x0, y0) in ((cx - nd, top - 66 * s), (cx + nd, top - 66 * s), (cx - nd, top - 12 * s), (cx + nd, top - 12 * s)):
        pts = []
        for i in range(9):
            tt = i / 8
            pts.append((x0 + (core[0] - x0) * tt, y0 + (core[1] - y0) * tt + 2.2 * math.sin(math.pi * tt) * (1 if y0 < core[1] else -0.3)))
        chain.line(pts, 0.9)
    # a janela do salão do trono: uma lanceta acesa, a única de todas as Torres
    wins = Mask(W, H)
    wy0 = top + 62
    wins.poly([(cx - 1.4, wy0 + 13), (cx + 1.4, wy0 + 13), (cx + 1.4, wy0 + 3), (cx, wy0), (cx - 1.4, wy0 + 3)])
    # as runas no meio da cara de cada torre (fracas: as Torres estão quase apagadas)
    runes = Mask(W, H)
    for (tx, ttop, tb) in ((cx - 62 * s, base - 160 * s, base), (cx + 58 * s, base - 144 * s, base), (cx, top, base)):
        for i, ry in enumerate(np.arange(ttop + 26, tb - 14, 34)):
            if tx == cx and abs(ry - (wy0 + 6)) < 20:
                continue
            for a_, b_ in K.rune(i + int(tx) % 5, tx, ry, 7):
                runes.line([a_, b_], 0.8)
    return dict(bands=marks['bands'], runes=runes.array(), wins=wins.array(), chain=chain.array(), core=core, top=top, base=base)


def ec_clouds(ref, rng, yy, xx, tex):
    """O banco de nuvens em volta do alto do morro, em rolos pintados de trás para a frente: o alto de cada rolo
    pega a luz fria da coroa, a barriga tem o ouro das memórias por dentro (mais forte perto do morro), e as
    dobras entre um rolo e o da frente ficam na sombra. Para os lados ele afina e se desfaz; embaixo some na
    névoa."""
    y_cl = ec_p(0, EC_CLOUD)[1]
    dens = np.zeros((H, W), np.float32)
    warp = (value_noise(H, W, 9, rng, 3) - 0.5)
    puffs = []
    for row, (dy, scale, spread) in enumerate(((0.0, 1.0, 330.0), (14.0, 0.8, 430.0), (30.0, 0.62, 520.0))):
        x = 640.0 - spread - rng.uniform(0, 30)
        while x < 640.0 + spread:
            c = math.exp(-((x - 640) / (200.0 + 60 * row)) ** 2)
            big = rng.random() < 0.22
            r = (rng.uniform(5, 13) * (1.8 if big else 1.0) + 26 * c * rng.uniform(0.5, 1.2)) * scale
            cy = y_cl + dy - 9 * c + rng.uniform(-4, 6) + r * 0.7 + 18 * sstep(200.0, 520.0, abs(x - 640))
            puffs.append((cy, x, r * rng.uniform(1.1, 1.9), r, row))
            x += r * rng.uniform(0.7, 1.7)
    # dois rolos altos subindo junto das torres (o ar sobe pelo morro)
    for cx, r in ((600.0, 30.0), (692.0, 26.0)):
        puffs.append((y_cl - 8 + r * 0.7, cx, r * 1.25, r, 0))
    puffs.sort(key=lambda p: (p[4], p[0]))
    lav, shade, gold = col(0x76628a), col(0x241829), col(0xe0984c)
    for cy, cx, rx, ry, row in puffs:
        x0, x1 = int(max(0, cx - rx - 6)), int(min(W, cx + rx + 7))
        y0, y1 = int(max(0, cy - ry - 6)), int(min(H, cy + ry * 1.6 + 7))
        if x1 <= x0 or y1 <= y0:
            continue
        sl = (slice(y0, y1), slice(x0, x1))
        X, Y = xx[sl], yy[sl]
        wv = warp[sl] * 0.35
        # a forma: a metade de cima redonda, a de baixo achatada (a base da nuvem é reta)
        dyn = (Y - cy) / np.where(Y < cy, ry, ry * 1.5)
        d = np.sqrt(((X - cx) / rx) ** 2 + dyn ** 2) + wv
        m = sstep(1.0, 0.86, d) * math.exp(-((cx - 650) / 560.0) ** 6) * (0.55 + 0.45 * math.exp(-((cx - 640) / 380.0) ** 2))
        if m.max() <= 0:
            continue
        t = np.clip((Y - (cy - ry)) / (ry * 2.2), 0, 1)
        nx = (X - cx) / rx
        facing = np.clip(1 - t * 1.3 - nx * np.sign(cx - 640) * 0.15, 0, 1)
        near = math.exp(-((cx - 640) / 260.0) ** 2)
        c_ = mix(shade, lav * (0.7 + 0.3 * near), (facing ** 1.4)[..., None])
        c_ = c_ + gold * (sstep(0.3, 0.95, t) * (0.3 + 0.7 * near) * (0.9 - 0.2 * row))[..., None] * 0.85
        # a beira de cima, na luz
        edge = np.clip(m - sstep(1.0, 0.86, d + 0.07), 0, 1) * (1 - t)
        c_ = mix(c_, mix(col(0xa890b0), col(0xe8c090), near * 0.7), (edge * 0.75)[..., None])
        ref[sl] = ref[sl] * (1 - m[..., None]) + c_ * m[..., None]
        dens[sl] = np.maximum(dens[sl], m)
    # a névoa de baixo, onde os rolos assentam
    bot = ec_p(0, 72.0)[1]
    mist = sstep(y_cl + 24, y_cl + 44, yy) * sstep(bot + 30, bot - 6, yy) * np.exp(-((xx - 650) / 560.0) ** 6)
    ref = mix(ref, mix(col(0x3a2838), col(0x6a4a3a), np.exp(-((xx - 640) / 300.0) ** 2)[..., None]), (mist * 0.55)[..., None])
    dens = np.maximum(dens, mist * 0.55)
    return ref, dens


def ec_city(ref, rng, yy, xx, tex, solid):
    """A cidade dos dois lados do rio, de longe para perto: na sombra, as fachadas escuras, as cumeeiras com a
    beira que pega o crepúsculo do horizonte, as janelas acesas (poucas lá perto das Torres, mais aqui) e os
    lampiões do cais. Devolve as luzes (para o brilho depois do pincel)."""
    lights = []

    def tone(base, k, Zb, x_scr):
        fog = 1 - math.exp(-Zb / 1500.0)
        hz = np.asarray(ec_hz(np.array(x_scr)), np.float32).reshape(3)
        return mix(np.asarray(base, np.float32) * k, hz, fog * 0.9), fog

    def rim(p0, p1, k, fog, w=1.2):
        r = patch(edge_quad(p0, p1, w))
        if r is None:
            return
        a, sl = r
        a = a * k * 0.55 * (1 - fog * 0.4)
        c = mix(col(0x6a5470), col(0xb07a5a), fog)
        ref[sl] = ref[sl] * (1 - a[..., None]) + c * a[..., None]

    def fill_s(pts, color, k=1.0):
        fill(ref, pts, color, solid, k)

    def lit_p(Z):
        # a sombra vem das Torres: lá as janelas já apagaram; aqui ainda há gente acordada
        return 0.13 * math.exp(-max(Z - 300.0, 0.0) / 330.0) + 0.006

    walls = [col(0x5a5262), col(0x625650), col(0x5a4e5a), col(0x50546a), col(0x625a58)]
    roofs = [col(0x3a3848), col(0x4a3634), col(0x3e3846), col(0x503c3a)]
    items = []
    Z = 1720.0
    while Z > 150:
        dz = 12.0 + Z * 0.02
        for side in (-1, 1):
            X = EC_RIVER + 8.0 + rng.uniform(0, 4)
            row = []
            lim = 0.48 * Z + 60
            while X < lim:
                w_ = rng.uniform(8, 14) * (1 + Z / 3000)
                row.append((X, X + w_))
                X += w_ + (rng.uniform(4, 8) if rng.random() < 0.1 else rng.uniform(0, 1.0))
            for k, (a, b) in enumerate(row[::-1]):
                x0, x1 = (a, b) if side > 0 else (-b, -a)
                xm = (x0 + x1) / 2
                if 120 < xm < 200 and 900 < Z < 1080:
                    continue
                if -150 < xm < -112 and 700 < Z < 790:
                    continue
                if -60 < xm < 60 and 600 < Z < 640:
                    continue
                items.append(('house', Z + 1e-4 * (len(row) - k), Z + rng.uniform(-dz * 0.2, dz * 0.2), x0, x1, dz * rng.uniform(0.55, 0.8), side))
        Z -= dz
    items.append(('cathedral', 960.0))
    items.append(('tower', 740.0))
    items.append(('bridge', 620.0))
    items.sort(key=lambda it: -it[1])
    for it in items:
        kind = it[0]
        if kind == 'house':
            _, _, Z0, x0, x1, d, side = it
            Z1 = Z0 + d
            xm, zm = (x0 + x1) / 2, (Z0 + Z1) / 2
            gY = EC_BANK + 14.0 * math.exp(-((xm - 160.0) ** 2 + (zm - 990.0) ** 2) / 150.0 ** 2)
            hgt = rng.uniform(8, 15) if rng.random() > 0.06 else rng.uniform(18, 26)
            rise = rng.uniform(4, 7)
            wc, rc = walls[int(rng.integers(0, 5))], roofs[int(rng.integers(0, 4))]
            xs_ = ec_p(xm, gY, Z0)[0]
            cw, fog = tone(wc, 0.32, Z0, xs_)
            cs, _ = tone(wc, 0.24, Z0, xs_)
            cr, _ = tone(rc, 0.42, Z0, xs_)
            ridge_x = rng.random() < 0.55
            Y0, Y1 = gY, gY + hgt
            xe = x1 if side < 0 else x0
            fill_s([ec_p(xe, Y0, Z0), ec_p(xe, Y0, Z1), ec_p(xe, Y1, Z1), ec_p(xe, Y1, Z0)], cs)
            if ridge_x:
                fill_s([ec_p(xe, Y1, Z0), ec_p(xe, Y1, Z1), ec_p(xe, Y1 + rise, zm)], cs)
            fill_s([ec_p(x0, Y0, Z0), ec_p(x1, Y0, Z0), ec_p(x1, Y1, Z0), ec_p(x0, Y1, Z0)], cw)
            fw_ = x1 - x0
            nwin = max(1, int(fw_ / 3.6))
            for fl in np.arange(Y0 + 2.2, Y1 - 2.2, 3.4):
                for k in range(nwin):
                    wx0 = x0 + (k + 0.32) * fw_ / nwin
                    q = [ec_p(wx0, fl, Z0), ec_p(wx0 + 1.1, fl, Z0), ec_p(wx0 + 1.1, fl + 1.7, Z0), ec_p(wx0, fl + 1.7, Z0)]
                    if rng.random() < lit_p(Z0):
                        dim = rng.random() < 0.18
                        c = col(0xc8582a) if dim else col(0xffb466)
                        fill_s(q, mix(c, col(0xd8a080), fog * 0.4), k=0.95)
                        cx_, cy_ = sum(p[0] for p in q) / 4, sum(p[1] for p in q) / 4
                        if rng.random() < 0.5:
                            lights.append((cx_, cy_, (0.4 if dim else 0.8) * (1 - fog * 0.6), 1.1 * EC_F / Z0 / 3.0))
                    elif Z0 < 1200:
                        fill_s(q, mix(col(0x100c14), np.asarray(ec_hz(np.array(xs_)), np.float32).reshape(3), fog * 0.85), k=0.7)
            if ridge_x:
                fill_s([ec_p(x0 - 0.4, Y1, Z0 - 0.4), ec_p(x1 + 0.4, Y1, Z0 - 0.4), ec_p(x1 + 0.4, Y1 + rise, zm), ec_p(x0 - 0.4, Y1 + rise, zm)], cr)
                rim(ec_p(x0, Y1 + rise, zm), ec_p(x1, Y1 + rise, zm), 0.55, fog, max(1.0, 0.12 * EC_F / Z0))
            else:
                apex = ec_p(xm, Y1 + rise, Z0)
                fill_s([ec_p(x0, Y1, Z0), ec_p(x1, Y1, Z0), apex], cw)
                xe2 = x1 if side < 0 else x0
                fill_s([ec_p(xe2, Y1, Z0 - 0.3), apex, ec_p(xm, Y1 + rise, Z1), ec_p(xe2, Y1, Z1)], cr)
                rim(apex, ec_p(xm, Y1 + rise, Z1), 0.4, fog)
                rim(ec_p(x0 if xs_ < EC_VX else x1, Y1, Z0), apex, 0.25, fog)
            if rng.random() < 0.3 and Z0 < 1300:
                cxh = rng.uniform(x0 + 1, x1 - 2)
                fill_s([ec_p(cxh, Y1, zm), ec_p(cxh + 1.3, Y1, zm), ec_p(cxh + 1.3, Y1 + rise + 1.6, zm), ec_p(cxh, Y1 + rise + 1.6, zm)], cs)
                rim(ec_p(cxh, Y1 + rise + 1.6, zm), ec_p(cxh + 1.3, Y1 + rise + 1.6, zm), 0.45, fog)
        elif kind == 'cathedral':
            # no morro da margem direita: a fachada de frente para o rio, a rosácea apagada, as duas torres
            gY = EC_BANK + 14.0
            x0, x1, Z0, Z1 = 128.0, 184.0, 960.0, 1090.0
            xm = (x0 + x1) / 2
            xs_ = ec_p(xm, gY, Z0)[0]
            stone = col(0x6a6272)
            cw, fog = tone(stone, 0.34, Z0, xs_)
            cs, _ = tone(stone, 0.26, Z0, xs_)
            cr, _ = tone(col(0x3a3a4c), 0.5, Z0, xs_)
            hgt, rise = 30.0, 17.0
            fill_s([ec_p(x0, gY, Z0), ec_p(x0, gY, Z1), ec_p(x0, gY + hgt, Z1), ec_p(x0, gY + hgt, Z0)], cs)
            fill_s([ec_p(x0, gY + hgt, Z0), ec_p(xm, gY + hgt + rise, Z0), ec_p(xm, gY + hgt + rise, Z1), ec_p(x0, gY + hgt, Z1)], cr)
            rim(ec_p(xm, gY + hgt + rise, Z0), ec_p(xm, gY + hgt + rise, Z1), 0.8, fog, 1.4)
            fill_s([ec_p(x0, gY, Z0), ec_p(x1, gY, Z0), ec_p(x1, gY + hgt, Z0), ec_p(xm, gY + hgt + rise, Z0), ec_p(x0, gY + hgt, Z0)], cw)
            rcx, rcy = ec_p(xm, gY + 21, Z0)
            r_ = 6.5 * EC_F / Z0
            fill_s([(rcx + r_ * 0.8 * math.cos(a), rcy + r_ * 0.8 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 28, endpoint=False)], col(0x17121c))
            fill_s([ec_p(xm - 4, gY, Z0), ec_p(xm + 4, gY, Z0), ec_p(xm + 4, gY + 8, Z0), ec_p(xm, gY + 12, Z0), ec_p(xm - 4, gY + 8, Z0)], col(0x0e0a12))
            # uma vela acesa no portal (alguém ainda reza lá)
            px_, py_ = ec_p(xm, gY + 3.5, Z0 - 0.5)
            lights.append((px_, py_, 0.8, 1.6))
            for (tx0, tx1) in ((x0 - 4, x0 + 12), (x1 - 12, x1 + 4)):
                tz = Z0 - 6
                fill_s([ec_p(tx0, gY, tz), ec_p(tx1, gY, tz), ec_p(tx1, gY + 62, tz), ec_p(tx0, gY + 62, tz)], cw)
                for fl in (26.0, 44.0):
                    fill_s([ec_p(tx0 + 4, gY + fl, tz), ec_p(tx1 - 4, gY + fl, tz), ec_p(tx1 - 4, gY + fl + 9, tz), ec_p((tx0 + tx1) / 2, gY + fl + 12, tz), ec_p(tx0 + 4, gY + fl + 9, tz)], col(0x0e0a12))
                tip = ec_p((tx0 + tx1) / 2, gY + 104, tz + 8)
                fill_s([ec_p(tx0, gY + 62, tz), ec_p(tx1, gY + 62, tz), tip], cr)
                inner = tx0 if xs_ > EC_VX else tx1
                rim(ec_p(inner, gY + 62, tz), tip, 0.75, fog)
                rim(ec_p(tx0, gY + 62, tz), ec_p(tx1, gY + 62, tz), 0.45, fog)
        elif kind == 'tower':
            # a torre velha da margem esquerda
            x0, x1, Z0 = -146.0, -128.0, 740.0
            gY = EC_BANK
            xs_ = ec_p(x0, gY, Z0)[0]
            cw, fog = tone(col(0x625a6a), 0.32, Z0, xs_)
            cs, _ = tone(col(0x625a6a), 0.25, Z0, xs_)
            cr, _ = tone(col(0x3a3a4c), 0.5, Z0, xs_)
            fill_s([ec_p(x1, gY, Z0), ec_p(x1, gY, Z0 + 16), ec_p(x1, gY + 52, Z0 + 16), ec_p(x1, gY + 52, Z0)], cs)
            fill_s([ec_p(x0, gY, Z0), ec_p(x1, gY, Z0), ec_p(x1, gY + 52, Z0), ec_p(x0, gY + 52, Z0)], cw)
            for fl in (14.0, 26.0, 38.0):
                fill_s([ec_p(-137.6, gY + fl, Z0), ec_p(-136.4, gY + fl, Z0), ec_p(-136.4, gY + fl + 4, Z0), ec_p(-137.6, gY + fl + 4, Z0)], col(0x0e0a12))
            tip = ec_p(-137.0, gY + 70, Z0 + 8)
            fill_s([ec_p(x0 - 1, gY + 52, Z0), ec_p(x1 + 1, gY + 52, Z0), tip], cr)
            fill_s([ec_p(x1 + 1, gY + 52, Z0), ec_p(x1 + 1, gY + 52, Z0 + 16), tip], cs)
            rim(ec_p(x1 + 1, gY + 52, Z0), tip, 0.75, fog)
            rim(ec_p(x1, gY, Z0), ec_p(x1, gY + 52, Z0), 0.35, fog)
    return lights


def f_eclipse(rng):
    yy, xx = grid()
    SX, SY = EC_SUN
    tex = value_noise(H, W, 4, rng, 3)
    ref, band, d_e = ec_sky(rng, yy, xx)
    sky_ref = ref.copy()
    ref, hills = ec_hills(ref, rng, yy, xx)
    ref, crag = ec_crag(ref, rng, yy, xx, tex)
    solid = np.zeros((H, W), np.float32)
    ref = ec_aqueduct(ref, rng, solid)
    pre = solid.copy()
    tw = ec_towers(ref, rng, yy, xx, solid)
    body = np.clip(solid - pre, 0, 1)
    tw['body'] = body
    # as beiras de cima pegam a coroa; as de dentro das agulhas, o ouro do núcleo
    gb = blur(body, 1.0)
    upw = np.clip(np.gradient(gb)[0] * 4.0, 0, 1)
    rim = np.clip(facing_sun(ref, body, xx, yy, EC_SUN, 2.0) * 0.3 + upw * 1.5, 0, 1) * np.exp(-(d_e / 320) ** 2)
    ref = put(ref, col(0xc8a888), rim * 0.45)
    ccx, ccy = tw['core']
    dcore = np.hypot(xx - ccx, yy - ccy)
    top_m = body * (yy < tw['top'] + 2)
    inner = np.where(xx < ccx, rim_of(top_m, 1.6, 0, 0.6), rim_of(top_m, -1.6, 0, 0.6)) * np.exp(-(dcore / 45) ** 2)
    ref = put(ref, col(0xe8b070), inner * 0.8)
    ref = put(ref, col(0x5a4030), tw['chain'] * 0.9)
    ref = put(ref, col(0x9a6a34), tw['runes'] * body * 0.55)
    ref = put(ref, col(0xe8a05a), tw['wins'] * 0.95)
    ref, clouds = ec_clouds(ref, rng, yy, xx, tex)
    far = ref.copy()
    # ---------------- o chão: as ruas das margens, o cais e o rio (com o reflexo do que está longe)
    below = yy > EC_VY + 0.5
    Zw = np.where(below, EC_CAMH * EC_F / np.maximum(yy - EC_VY, 0.5), 1e5)
    Xw = (xx - EC_VX) * Zw / EC_F
    Zs = np.where(below, (EC_CAMH - EC_BANK) * EC_F / np.maximum(yy - EC_VY, 0.5), 1e5)
    Xs = (xx - EC_VX) * Zs / EC_F
    end = ec_p(0, 0, EC_ZT - 40)[1]
    water = (np.abs(Xw) < EC_RIVER) & below & (yy > end)
    quay = (np.abs(Xs) < EC_RIVER + 2.0) & ~water & below & (yy > end)
    street = (np.abs(Xs) >= EC_RIVER + 2.0) & below & (yy > end)
    fog_s = 1 - np.exp(-Zs / 1500.0)
    st = col(0x1a1520) * (1 + 0.3 * (tex[..., None] - 0.5))
    ref = put(ref, mix(st, ec_hz(xx), fog_s[..., None] * 0.85), street.astype(np.float32))
    ref = put(ref, mix(col(0x120e16), ec_hz(xx), (1 - np.exp(-Zw / 1500.0))[..., None] * 0.8), quay.astype(np.float32))
    rip = stretched_noise(H, W, 3, 10.0, rng, 2) - 0.5
    ym = np.clip(2 * EC_VY - yy + rip * 9, 0, H - 1)
    xm_ = np.clip(xx + rip * 5, 0, W - 1)
    refl = np.stack([ndi.map_coordinates(far[..., i], [ym, xm_], order=1) for i in range(3)], -1)
    wcol = refl * 0.7 + col(0x0c0a12) * 0.3
    # o rastro da coroa na água: uma coluna fraca de ouro quebrada pelas marolas, mais forte embaixo
    glit = np.exp(-((xx - SX) / (5 + 0.3 * (yy - EC_VY))) ** 2) * sstep(EC_VY + 30, H, yy)
    spark = sstep(0.6, 0.8, stretched_noise(H, W, 2, 9.0, rng, 2))
    wcol = mix(wcol, col(0xe0a868), (glit * (0.2 + 0.8 * spark) * 0.55)[..., None])
    ref = put(ref, wcol, water.astype(np.float32))
    # ---------------- as casas, a catedral, a torre velha e a ponte
    lights = ec_city(ref, rng, yy, xx, tex, solid)
    gm = np.exp(-((yy - (EC_VY + 42)) / 26.0) ** 2) * (0.7 + 0.3 * stretched_noise(H, W, 30, 5.0, rng, 3))
    ref = mix(ref, mix(col(0x2e2232), col(0x4a3236), np.exp(-((xx - 640) / 260.0) ** 2)[..., None]), (gm * 0.55)[..., None])
    zb = 620.0
    cw = mix(col(0x5a5262) * 0.3, ec_hz(np.array([EC_VX])).reshape(3), (1 - math.exp(-zb / 1500.0)) * 0.9)
    bm = Mask(W, H)
    bm.poly([ec_p(-44, EC_BANK, zb), ec_p(44, EC_BANK, zb), ec_p(44, 13.2, zb), ec_p(-44, 13.2, zb)])
    bm.poly([ec_p(-40, -1, zb), ec_p(40, -1, zb), ec_p(40, EC_BANK, zb), ec_p(-40, EC_BANK, zb)])
    om = Mask(W, H)
    for k in range(4):
        ax0 = -32 + k * 16.5
        pts = [ec_p(ax0, -1, zb)]
        for a in np.linspace(math.pi, 0, 14):
            pts.append(ec_p(ax0 + 6.75 + 6.75 * math.cos(a), 2.0 + 7.0 * math.sin(a), zb))
        pts.append(ec_p(ax0 + 13.5, -1, zb))
        om.poly(pts)
    bridge = np.clip(bm.array() - om.array(), 0, 1)
    wy = ec_p(0, 0, zb)[1]
    ys_ = np.clip(2 * wy - yy + rip * 4, 0, H - 1)
    refl_b = ndi.map_coordinates(bridge, [ys_, xx], order=1) * water * (yy > wy)
    ref = ref * (1 - (refl_b * 0.6)[..., None]) + col(0x120e18) * (refl_b * 0.6)[..., None]
    ref = put(ref, cw, bridge)
    solid = np.maximum(solid, bridge)
    p0, p1 = ec_p(-44, 13.2, zb), ec_p(44, 13.2, zb)
    r = patch(edge_quad(p0, p1, 1.3))
    if r is not None:
        a, sl = r
        ref[sl] = ref[sl] * (1 - a[..., None] * 0.5) + col(0x9a7a8a) * a[..., None] * 0.5
    # os lampiões do cais, dos dois lados (os de longe já apagados) e o reflexo deles
    for side in (-1, 1):
        for Zl in np.arange(330.0, 1700.0, 26.0):
            if rng.random() > 0.05 + 0.9 * math.exp(-max(Zl - 330.0, 0) / 380.0):
                continue
            lx, ly = ec_p(side * (EC_RIVER + 1.2), EC_BANK + 4.0, Zl)
            lights.append((lx, ly, 0.9, max(0.8, 2.4 * 330.0 / Zl)))
    info = dict(sky=sky_ref, band=band, d_e=d_e, solid=solid, tw=tw, clouds=clouds, tex=tex, lights=lights, water=water,
                rip=rip, body=body)
    return ref, info


def ec_final(rng, ref, info):
    yy, xx = grid()
    SX, SY = EC_SUN
    d_e = info['d_e']
    tw = info['tw']
    # ---------------- o pincel
    base = np.where(yy < EC_VY, (value_noise(H, W, 90, rng, 2) - 0.5) * 0.3, 0.0)
    flow = flow_of(ref, base, 0.9 * (1 - np.exp(-(d_e / 200) ** 2)))
    out, _ = painted(ref, rng, flow, ps=passes(0.85, dry=0.2, err=(0.0, 0.02, 0.035, 0.05), long=1.0))
    # as torres e a ponte com pincel menor (as quinas acesas não podem borrar)
    tm = np.clip(blur(np.clip(info['body'] + tw['chain'], 0, 1), 1.5) * 1.5, 0, 1)
    outt, _ = painted(ref, rng, flow, mask=tm, ps=passes(0.32, dry=0.12, err=(0.0, 0.015, 0.025, 0.035), long=0.9), base=1.0)
    out = out * (1 - tm[..., None]) + outt * tm[..., None]
    cm = np.clip(sstep(EC_VY + 20, EC_VY + 60, yy) * 1.0, 0, 1)
    outc, _ = painted(ref, rng, flow, mask=cm, ps=passes(0.5, dry=0.15, err=(0.0, 0.015, 0.03, 0.04), long=0.8), base=1.0)
    out = out * (1 - cm[..., None]) + outc * cm[..., None]
    out = out * 0.78 + ref * 0.22
    keep = np.clip(blur(tw['wins'] + tw['chain'] + tw['runes'] * 0.6, 0.6) * 1.2, 0, 0.85)
    out = out * (1 - keep[..., None]) + ref * keep[..., None]
    # ---------------- o Eclipse: a coroa em raios finos, o brilho, o anel e o disco negro (com o núcleo na
    # frente dele, pendurado entre as agulhas)
    cor = np.zeros((H, W), np.float32)
    m = Mask(W, H)
    for _ in range(320):
        a = rng.uniform(0, 2 * math.pi)
        r0 = EC_R + rng.uniform(1, 6)
        ln = rng.uniform(14, 90) * (0.4 + rng.random()) * (1.0 + 0.6 * abs(math.cos(a)))
        wid = rng.uniform(0.6, 1.8)
        p0 = (SX + math.cos(a) * r0, SY + math.sin(a) * r0)
        p1 = (SX + math.cos(a) * (r0 + ln), SY + math.sin(a) * (r0 + ln))
        m.line([p0, p1], wid, v=int(60 + 120 * rng.random() ** 2))
    rays = m.array()
    fade = np.exp(-np.clip(d_e - EC_R, 0, None) / 70.0)
    # a coroa fica atrás das torres e das nuvens altas (que passam na frente dela)
    occ = (1 - np.clip(blur(info['solid'], 0.6) * 1.3, 0, 1)) * (1 - np.clip(info['band'] * 0.7, 0, 0.7))
    cor = blur(rays, 0.6) * fade * occ
    out = add_light(out, col(0xf0c078), cor * 0.65)
    out = add_light(out, col(0xffd8a0), np.exp(-np.clip(d_e - EC_R, 0, None) / 10.0) * (d_e > EC_R - 1) * 0.5 * occ)
    out = add_light(out, col(0x9a70c0), np.exp(-np.clip(d_e - EC_R, 0, None) / 120.0) * (d_e > EC_R - 1) * 0.16 * occ)
    ring = sstep(EC_R + 4.5, EC_R + 1.0, d_e) * sstep(EC_R - 1.2, EC_R + 0.8, d_e)
    out = put(out, col(0xfff2d4), ring * 0.95)
    disk = sstep(EC_R + 0.6, EC_R - 0.8, d_e)
    out = put(out, col(0x050409), disk)
    # as proeminências: duas línguas vermelhas pequenas na beira do disco
    for ang, ln in ((2.35, 5.0), (-0.5, 3.5)):
        px_, py_ = SX + math.cos(ang) * EC_R, SY + math.sin(ang) * EC_R
        g = np.exp(-((xx - px_ - math.cos(ang) * ln * 0.5) ** 2 + (yy - py_ - math.sin(ang) * ln * 0.5) ** 2) / (ln * 0.6) ** 2)
        out = add_light(out, col(0xff5070), g * (d_e > EC_R) * 0.8)
    # ---------------- as estrelas e o planeta perto do disco (só no céu limpo)
    sky_free = (1 - np.clip(info['band'] * 1.5, 0, 1)) * (yy < EC_VY - 60) * (1 - info['solid'])
    st = np.zeros((H, W), np.float32)
    for _ in range(170):
        x_, y_ = rng.uniform(0, W), rng.uniform(0, 340)
        if math.hypot(x_ - SX, y_ - SY) < 170 or sky_free[int(y_), int(x_)] < 0.5:
            continue
        b = rng.random() ** 2.4
        r = 0.5 + b * 0.8
        x0, x1, y0, y1 = int(max(0, x_ - 4)), int(min(W, x_ + 5)), int(max(0, y_ - 4)), int(min(H, y_ + 5))
        st[y0:y1, x0:x1] = np.maximum(st[y0:y1, x0:x1], np.exp(-((xx[y0:y1, x0:x1] - x_) ** 2 + (yy[y0:y1, x0:x1] - y_) ** 2) / (r * r)) * (0.25 + 0.6 * b))
    out = add_light(out, col(0xc8d0f0), st * 0.9)
    pl = np.exp(-((xx - 478) ** 2 + (yy - 188) ** 2) / 1.4 ** 2)
    out = add_light(out, col(0xfff4e0), pl * 0.9 + blur(pl, 4) * 0.6)
    # ---------------- as luzes: o núcleo, a janela do salão do trono (com as memórias presas lá dentro), as
    # runas, as janelas e os lampiões da cidade (com o reflexo na água)
    cx_, cy_ = tw['core']
    dc = np.hypot(xx - cx_, yy - cy_)
    # o núcleo: a esfera de Âmbar acesa por dentro (mais fraca que na paz: o Eclipse já começou)
    out = put(out, mix(col(0xa8602a), col(0xffd890), sstep(10.5, 2.0, np.hypot(xx - cx_ + 2.0, yy - cy_ + 2.0))[..., None]), sstep(11.0, 9.8, dc))
    out = put(out, col(0xfff0d0), sstep(4.5, 2.5, np.hypot(xx - cx_ + 2.5, yy - cy_ + 2.5)) * 0.8)
    out = add_light(out, col(0xffb060), np.exp(-(dc / 16.0) ** 2) * 0.35 + np.exp(-(dc / 50.0) ** 2) * 0.16)
    out = add_light(out, col(0x9a70d0), np.exp(-(dc / 160.0) ** 2) * 0.06)
    wins = tw['wins']
    out = add_light(out, col(0xffb060), blur(wins, 1.2) * 0.45 + blur(wins, 6.0) * 0.5 + blur(wins, 16.0) * 0.35)
    out = add_light(out, col(0xc08040), blur(tw['runes'] * info['body'], 1.0) * 0.3 + blur(tw['runes'] * info['body'], 4.0) * 0.25)
    lm = np.zeros((H, W), np.float32)
    lg = np.zeros((H, W), np.float32)
    for (lx, ly, k, rad) in info['lights']:
        x0, x1, y0, y1 = int(max(0, lx - rad * 8)), int(min(W, lx + rad * 8 + 1)), int(max(0, ly - rad * 8)), int(min(H, ly + rad * 8 + 1))
        if x1 <= x0 or y1 <= y0:
            continue
        d2 = ((xx[y0:y1, x0:x1] - lx) ** 2 + (yy[y0:y1, x0:x1] - ly) ** 2)
        lm[y0:y1, x0:x1] = np.maximum(lm[y0:y1, x0:x1], np.exp(-d2 / max(rad * 0.6, 0.5) ** 2) * k)
        lg[y0:y1, x0:x1] += np.exp(-d2 / (rad * 3.0) ** 2) * k * 0.3
    out = add_light(out, col(0xffc078), lm * 0.6)
    out = add_light(out, col(0xff9a48), np.clip(lg, 0, 1) * 0.35)
    # o reflexo dos lampiões: riscos em pé na água, quebrados pelas marolas
    water = info['water']
    refl = np.zeros((H, W), np.float32)
    for (lx, ly, k, rad) in info['lights']:
        if abs(lx - EC_VX) > 0.6 * (ly - EC_VY) + 40 or ly < EC_VY:
            continue
        x0, x1 = int(max(0, lx - 3)), int(min(W, lx + 4))
        y0, y1 = int(ly + 2), int(min(H, ly + 2 + 22 * rad))
        if y1 <= y0:
            continue
        seg = np.exp(-((xx[y0:y1, x0:x1] - lx) / max(rad * 0.7, 0.6)) ** 2) * np.exp(-(yy[y0:y1, x0:x1] - ly) / (10 * rad))
        refl[y0:y1, x0:x1] = np.maximum(refl[y0:y1, x0:x1], seg * k)
    spark = sstep(0.45, 0.75, stretched_noise(H, W, 2, 6.0, rng, 2))
    out = add_light(out, col(0xffa860), refl * spark * water * 0.6)
    # as bordas do quadro no escuro
    vg = ((xx - 640) / 760) ** 2 + ((yy - 360) / 520) ** 2
    out = out * (1 - 0.35 * np.clip(vg, 0, 1.2) ** 1.4)[..., None]
    return finish(np.clip(out, 0, 1) ** 0.95)


def frame(rng):
    ref, info = f_eclipse(rng)
    return ec_final(rng, ref, info)


if __name__ == '__main__':
    import time
    rng = np.random.default_rng(1000 + sum(map(ord, 'eclipse')))
    t0 = time.time()
    ref, info = f_eclipse(rng)
    finish(ref).save(os.path.join(CACHE, 'eclipse-ref.png'))
    print('ref', round(time.time() - t0, 1))
    if 'ref' not in sys.argv:
        ec_final(rng, ref, info).save(os.path.join(OUT, 'eclipse.png'))
    print('ok', round(time.time() - t0, 1))

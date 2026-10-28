"""Final II, plano 1: a paz (rascunho para colar em finais.py)."""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('FIM_OUT', os.path.join(HERE, 'out'))
CACHE = os.path.join(HERE, 'cache')
os.makedirs(CACHE, exist_ok=True)
sys.path.insert(0, os.path.join(HERE, '..'))
from finais import *  # noqa
import finais as F  # noqa


# ======================================================================================
# Final II: O Rei do Eclipse
# ======================================================================================
# A paz: a serra de neve acima do mar de nuvens, de noite. As nuvens guardam a luz das memórias (douradas por
# dentro, mais perto das Torres) e as Torres saem delas no pico ao longe, com o núcleo aceso no alto da maior;
# o aqueduto atravessa as nuvens até o pico. Na beira da serra, de costas para nós e de frente para as Torres,
# as sombras ajoelhadas (o capuz em ponta, a base que escorre em poça), um Guarda da Coroação de joelho com a
# alabarda deitada na neve, dois lobos deitados e a coruja no pinheiro morto. A câmera fica 1,6 m acima da
# neve; a beira da serra a uns 10 m (y = PZ_HZ + PZ_EYE / z, z em metros).
PZ_HZ = 372.0
PZ_F = 900.0
PZ_EYE = 1.6 * PZ_F
PZ_CLOUD = 300.0        # o mar de nuvens: y = PZ_HZ + PZ_CLOUD / z (z nas unidades das nuvens)
PZ_CORE = (822.0, 98.0)
PZ_TX = 822.0


def pz_y(z):
    return PZ_HZ + PZ_EYE / z


def pz_h(m, z):
    return m * PZ_F / z


def pz_sky(rng, yy, xx):
    t = np.clip(yy / PZ_HZ, 0, 1.4)
    sky = vgrad([(0.0, col(0x07050e)), (0.3, col(0x140e28)), (0.62, col(0x2a1e4a)), (0.86, col(0x4f3769)), (1.0, col(0x76527e)), (1.4, col(0x76527e))], t)
    cx, cy = PZ_CORE
    d = np.hypot(xx - cx, (yy - cy) * 1.1)
    # a aura roxa do núcleo e o ouro perto dele
    sky = mix(sky, col(0x5c3f8e), (np.exp(-(d / 330) ** 2) * 0.5)[..., None])
    sky = mix(sky, col(0xc58a6a), (np.exp(-(d / 95) ** 2) * 0.55)[..., None])
    # o mar de nuvens acende o céu baixo por baixo, mais perto das Torres
    hz = np.exp(-((yy - PZ_HZ) / 70) ** 2) * (0.35 + 0.65 * np.exp(-((xx - PZ_TX) / 430) ** 2))
    sky = mix(sky, col(0xc48468), (hz * 0.5)[..., None])
    # nuvens altas e finas, em faixa; a barriga delas pega a luz de baixo perto das Torres
    n1 = stretched_noise(H, W, 34, 6.0, rng, 5)
    band = sstep(0.56, 0.8, n1) * sstep(120, 220, yy) * (1 - sstep(300, 352, yy))
    near = np.exp(-((xx - PZ_TX) / 380) ** 2)
    sky = mix(sky, mix(col(0x241a3a), col(0x5a3a5e), near[..., None]), (band * 0.8)[..., None])
    belly = np.clip(rim_of(band, 0, 4, 1.0) * 2.0, 0, 1)
    sky = mix(sky, mix(col(0x8a5a7a), col(0xf0b07a), near[..., None]), (belly * (0.25 + 0.6 * near))[..., None])
    return sky


def pz_sea(rng, yy, xx):
    """O mar de nuvens com a luz por dentro: os rolos largos (em perspectiva, achatados perto do horizonte), o
    alto de cada um pega o roxo do céu, onde a nuvem é fina sai o ouro das memórias (mais forte perto das Torres,
    onde elas se juntam)."""
    tex = noise_tex(rng, 512, 70, 5)
    tex2 = noise_tex(rng, 512, 22, 3)
    dz = np.maximum(yy - PZ_HZ, 0.6)
    z = PZ_CLOUD / dz
    X = (xx - PZ_TX) * z / PZ_F
    u, v = X * 210.0, z * 170.0
    hs = sample(tex, u, v) * 0.78 + sample(tex2, u * 2.6 + 17, v * 2.6 + 5) * 0.22
    # no longe a textura não cabe mais no pixel: vira faixas finas
    far = np.clip(1 - dz / 34, 0, 1) ** 1.5
    streak = stretched_noise(H, W, 3, 30.0, rng, 2)
    hs = hs * (1 - far) + (0.42 + 0.16 * streak) * far
    depth = np.clip(dz / 150, 0, 1)
    near_t = np.exp(-((xx - PZ_TX) / (260 + 520 * depth)) ** 2)
    G = 0.3 + 0.7 * near_t
    thin = sstep(0.6, 0.3, hs)
    top = vgrad([(0.0, col(0x8a6a8e)), (0.25, col(0x584676)), (1.0, col(0x2e2652))], depth)
    hot = mix(col(0xd47c50), col(0xffd28a), near_t[..., None])
    sea = mix(top, hot, (thin * G)[..., None])
    sea = screen(sea, col(0xffa860), near_t * (0.32 - 0.18 * depth))
    crest = np.clip((hs - shifted(hs, 0, 2.5)) * 5, 0, 1) * (1 - far)
    sea = mix(sea, mix(col(0xa090c8), col(0xffd8b0), near_t[..., None]), (crest * 0.4)[..., None])
    sea = mix(sea, mix(col(0xa47a90), col(0xf2be90), near_t[..., None]), ((1 - depth) ** 4 * 0.7)[..., None])
    return sea, hs, thin * G


def pz_tower(ref, rng, yy, xx, cx, hw, top, base, roof, side, light_k, solid):
    """Uma torre de pedra escura, quadrada, vista um pouco de lado: a face da frente e a do lado (`side` diz de
    que lado), as cintas de bronze, as runas, as frestas e o telhado em ponta. Embaixo o mar de nuvens acende a
    pedra; o lado virado para o núcleo pega o ouro dele."""
    sw = hw * 0.42
    fx0, fx1 = (cx - hw, cx + hw - sw) if side > 0 else (cx - hw + sw, cx + hw)
    sx0, sx1 = (fx1, cx + hw) if side > 0 else (cx - hw, fx0)
    front = patch([(fx0, base), (fx0, top), (fx1, top), (fx1, base)])
    sidep = patch([(sx0, base), (sx0, top + (2 if side > 0 else 2)), (sx1, top + 4), (sx1, base)])
    t = np.clip((yy - top) / max(base - top, 1), 0, 1)
    under = t ** 2.2
    stone_f = mix(col(0x1b1729), col(0x6a4650), under[..., None])
    stone_s = mix(col(0x120f1d), col(0x4a3040), under[..., None]) + col(0x7a5a60) * light_k * (1 - t[..., None]) * 0.35
    n = value_noise(H, W, 5, rng, 2)[..., None]
    for p, c in ((sidep, stone_s), (front, stone_f)):
        if p is None:
            continue
        a, sl = p
        ref[sl] = ref[sl] * (1 - a[..., None]) + (c[sl] * (0.9 + 0.2 * n[sl])) * a[..., None]
        solid[sl] = np.maximum(solid[sl], a)
    # as cintas de bronze, as runas e as frestas
    marks = np.zeros((H, W), np.float32)
    glowm = np.zeros((H, W), np.float32)
    y = top + 18
    k = 0
    while y < base - 6:
        b = patch([(cx - hw - 1, y), (cx + hw + 1, y), (cx + hw + 1, y + 2.2), (cx - hw - 1, y + 2.2)])
        if b is not None:
            a, sl = b
            tt = (y - top) / (base - top)
            bc = mix(col(0x34241a), col(0xd09050), min(1.0, tt ** 3 * 1.1 + light_k * 0.3 * (1 - tt) ** 5))
            ref[sl] = ref[sl] * (1 - a[..., None]) + bc * a[..., None]
        y += 30 + 4 * math.sin(k)
        k += 1
    rm = Mask(W, H)
    for i, ry in enumerate(np.arange(top + 32, base - 20, 46)):
        for a_, b_ in K.rune(i + int(cx) % 5, (fx0 + fx1) / 2, ry, 9):
            rm.line([a_, b_], 1.1)
    r = rm.array()
    ref = put(ref, col(0xffb860), r * 0.9)
    glowm = np.maximum(glowm, r)
    for i, wy in enumerate(np.arange(top + 22, base - 30, 58)):
        wx = (fx0 + fx1) / 2 + (hw * 0.45 if i % 2 else -hw * 0.45)
        lit = rng.random() < 0.35
        w = patch([(wx - 1.3, wy), (wx + 1.3, wy), (wx + 1.3, wy + 7), (wx - 1.3, wy + 7)])
        if w is not None:
            a, sl = w
            c = col(0xffc070) if lit else col(0x07050c)
            ref[sl] = ref[sl] * (1 - a[..., None]) + c * a[..., None]
            if lit:
                glowm[sl] = np.maximum(glowm[sl], a)
    if roof:
        apex = (cx + side * 1.5, roof)
        lf = patch([(cx - hw - 2, top + 1), apex, (cx + side * 1.5, top + 1)])
        rf = patch([(cx + side * 1.5, top + 1), apex, (cx + hw + 2, top + 1)])
        for p, c in ((lf, col(0x3a2c4c) if side < 0 else col(0x1a1424)), (rf, col(0x1a1424) if side < 0 else col(0x3a2c4c))):
            if p is not None:
                a, sl = p
                ref[sl] = ref[sl] * (1 - a[..., None]) + c * a[..., None]
                solid[sl] = np.maximum(solid[sl], a)
        fin = patch(edge_quad(apex, (apex[0], roof - 10), 1.4))
        if fin is not None:
            a, sl = fin
            ref[sl] = ref[sl] * (1 - a[..., None]) + col(0xc08850) * a[..., None]
    return ref, glowm


def pz_torres(ref, rng, yy, xx, solid):
    """O pico das Torres saindo das nuvens, as três torres e, no alto da maior, o terraço com as duas agulhas e o
    núcleo preso nas correntes."""
    peak = [(700, 400), (716, 386), (730, 371), (744, 362), (760, 357), (884, 356), (900, 360), (914, 368), (926, 382), (940, 400)]
    p = patch(peak)
    a, sl = p
    rock = mix(col(0x231a2a), col(0x7a5252), sstep(360, 398, yy[sl])[..., None])
    ref[sl] = ref[sl] * (1 - a[..., None]) + rock * a[..., None]
    solid[sl] = np.maximum(solid[sl], a)
    glow = np.zeros((H, W), np.float32)
    ref, g = pz_tower(ref, rng, yy, xx, 760.0, 17.0, 198.0, 358.0, 164.0, 1, 0.5, solid)
    glow = np.maximum(glow, g)
    ref, g = pz_tower(ref, rng, yy, xx, 880.0, 15.0, 214.0, 358.0, 186.0, -1, 0.5, solid)
    glow = np.maximum(glow, g)
    ref, g = pz_tower(ref, rng, yy, xx, 822.0, 24.0, 130.0, 360.0, None, 1, 0.8, solid)
    glow = np.maximum(glow, g)
    # o terraço da torre maior: a cornija e as duas agulhas; o núcleo entre elas, nas correntes
    for pts, c in (([(793, 132), (851, 132), (851, 122), (793, 122)], col(0x2a2034)),
                   ([(795, 123), (803, 123), (800, 60), (798, 60)], col(0x1c1626)),
                   ([(841, 123), (849, 123), (846, 60), (844, 60)], col(0x1c1626))):
        q = patch(pts)
        if q is not None:
            a, sl = q
            ref[sl] = ref[sl] * (1 - a[..., None]) + c * a[..., None]
            solid[sl] = np.maximum(solid[sl], a)
    cx, cy = PZ_CORE
    chain = Mask(W, H)
    for (x0, y0) in ((799, 64), (845, 64), (799, 118), (845, 118)):
        pts = []
        for i in range(9):
            t = i / 8
            pts.append((x0 + (cx - x0) * t, y0 + (cy - y0) * t + 3 * math.sin(math.pi * t) * (1 if y0 < cy else -0.3)))
        chain.line(pts, 1.1)
    ch = chain.array()
    ref = put(ref, col(0x6a4a30), ch)
    ref = put(ref, col(0xffd890), sstep(14.5, 12.5, np.hypot(xx - cx, yy - cy)))
    ref = put(ref, col(0xfff6dc), sstep(7.5, 5.5, np.hypot(xx - cx + 2, yy - cy + 2)))
    # as agulhas pegam o ouro do núcleo do lado de dentro
    top_m = solid * (yy < 134)
    inner = np.where(xx < cx, rim_of(top_m, 2.0, 0, 0.6), rim_of(top_m, -2.0, 0, 0.6)) * np.exp(-(np.hypot(xx - cx, yy - cy) / 60) ** 2)
    ref = put(ref, col(0xffc890), inner * 0.9)
    # o contorno das torres contra o céu: a borda de cima pega o roxo, as de dentro o ouro do núcleo
    rim = rim_of(solid, 0, -1.5, 0.6) * (yy < 356)
    ref = put(ref, col(0x9a7ab8), rim * 0.5)
    return ref, glow


def pz_aqueduct(ref, rng, yy, xx, solid):
    """O aqueduto (a calha) atravessando o mar de nuvens até o pico das Torres: os pilares somem nas nuvens, os
    arcos deixam ver o ouro de trás; dois vãos caíram e a água passa por canos de bronze que descem para dentro
    das nuvens e sobem do outro lado."""
    # em unidades das nuvens: a câmera a 1/3 acima delas, y = PZ_HZ + (1/3 - Y) * PZ_F / z
    hc = PZ_CLOUD / PZ_F

    def P(X, Y, z):
        return (640 + X * PZ_F / z, PZ_HZ + (hc - Y) * PZ_F / z)
    X0, z0 = -3.2, 4.2
    X1, z1 = (712 - 640) * 16.5 / PZ_F, 16.5
    deck, spring, crown = 0.21, 0.12, 0.175
    n = 26
    broken = {7, 8, 15}
    m = np.zeros((H, W), np.float32)
    pipes = Mask(W, H)
    pw = 0.06
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        Xa, za = X0 + (X1 - X0) * t0, z0 + (z1 - z0) * t0
        Xb, zb = X0 + (X1 - X0) * t1, z0 + (z1 - z0) * t1
        if i in broken:
            # o vão caído: a ponta fechada de pedra e os dois canos que descem para as nuvens
            for (Xp, zp, s) in ((Xa, za, 1), (Xb, zb, -1)):
                pts = [P(Xp + s * 0.02, deck - 0.05, zp)]
                for k in range(1, 7):
                    f = k / 6
                    pts.append(P(Xp + s * (0.02 + 0.12 * f), deck - 0.05 - 0.24 * f ** 1.5, zp + s * 0.1 * f))
                pipes.line(pts, max(1.0, 0.018 * PZ_F / zp))
            continue
        # a faixa do alto (o conduto) e o pilar da ponta
        q = patch([P(Xa, deck, za), P(Xb, deck, zb), P(Xb, -0.05, zb), P(Xa, -0.05, za)])
        if q is None:
            continue
        a, sl = q
        # o arco aberto: do alto do pilar de um lado ao do outro, em meia volta
        arch = []
        for k in range(13):
            ang = math.pi * k / 12
            f = 0.5 - 0.5 * math.cos(ang)
            Xk = Xa + (Xb - Xa) * (pw / 2 + (1 - pw) * f)
            zk = za + (zb - za) * (pw / 2 + (1 - pw) * f)
            arch.append(P(Xk, spring + (crown - spring) * math.sin(ang), zk))
        hole = [arch[0]] + arch[1:] + [P(Xb - (Xb - Xa) * (pw / 2), -0.05, zb - (zb - za) * (pw / 2)), P(Xa + (Xb - Xa) * (pw / 2), -0.05, za + (zb - za) * (pw / 2))]
        hq = patch(hole)
        if hq is not None:
            ha, hsl = hq
            full = np.zeros((H, W), np.float32)
            full[sl] = a
            full[hsl] = np.clip(full[hsl] - ha, 0, 1)
            m = np.maximum(m, full)
        else:
            m[sl] = np.maximum(m[sl], a)
    p = pipes.array()
    # a pedra: escura, a beira de cima pega o céu, embaixo o ouro das nuvens
    near = np.clip((yy - 372) / 60, 0, 1)
    stone = mix(col(0x1c1626), col(0x2e2232), near[..., None])
    ref = put(ref, stone, m)
    ref = put(ref, col(0x9a7ab0), rim_of(m, 0, -1.2, 0.5) * 0.6)
    ref = put(ref, col(0xe8a070), rim_of(m, 0, 1.6, 0.6) * 0.45)
    ref = put(ref, col(0x2e2018), p)
    ref = put(ref, col(0xc08050), rim_of(p, 0, 1.0, 0.5) * 0.4)
    solid = np.maximum(solid, np.maximum(m, p))
    return ref, solid


# ---------------------------------------------------------------- as figuras da beira
def pz_shadow(x, y, h, tip=(2, -104), bow=0.0, wide=1.0, seed=0):
    """Uma sombra ajoelhada vista de costas (a altura h em px): a barra da veste espalhada no chão, as costas
    curvadas, os ombros caídos, o manto do capuz e o capuz em ponta (a ponta torta para a frente quando ela curva
    a cabeça); a base escorre numa poça na neve e os tentáculos ficam largados no chão. Partes: 'body', 'mantle'
    (a borda do manto), 'pool', 'tendril'."""
    f = Figure(x, y, h / 100.0)
    rng = np.random.default_rng(seed)
    tx, ty = tip
    w = wide
    j = lambda: rng.uniform(-0.8, 0.8)
    R = [(31 * w, 2), (32 * w, -5), (29 * w, -16), (26 * w, -28), (22 * w, -40), (20 * w, -50), (21 * w, -58), (20 * w, -64),
         (16, -69 + bow * 2), (11.5, -72 + bow * 3), (12.5, -78 + bow * 4), (11.5, -84 + bow * 5), (8.5, -90 + bow * 5), (5, -96 + bow * 5)]
    Lf = [(-px + j() * (abs(py) > 10), py + j() * 0.5) for px, py in R]
    R = [(px + j() * (abs(py) > 10), py) for px, py in R]
    pts = [(0, 3)] + R + [(tx, ty + bow * 6)] + Lf[::-1]
    f.shape('body', pts, 6)
    # a borda do manto: cai dos ombros nas costas
    f.stroke('mantle', [(-20 * w, -56), (-10, -51), (0, -49 - bow), (10, -51), (20 * w, -56)], 1.8, 1.8)
    f.ell('pool', 0, 2, 44 * w, 5.0)
    for side in (-1, 1):
        if rng.random() < 0.75:
            a = rng.uniform(0.2, 0.7)
            q = [(side * 24 * w, 1), (side * (36 + 10 * a), 5 + 3 * a), (side * (50 + 20 * a), 10 + 4 * a), (side * (64 + 30 * a), 12 + 6 * a),
                 (side * (76 + 38 * a), 11 + 8 * a)]
            f.stroke('tendril', q, 6.5, 1.4)
    return f


def pz_guard(x, y, h):
    """O Guarda da Coroação de joelho (o direito no chão), de costas: o elmo redondo com a crista baixa de pontas,
    a proteção da nuca, as ombreiras de placas, o manto escuro até o chão e a sola da bota aparecendo embaixo; a
    alabarda deitada na neve à direita e o escudo redondo encostado do lado esquerdo."""
    f = Figure(x, y, h / 100.0)
    f.shape('cloth', [(-27, 2), (-28, -12), (-26, -30), (-23, -48), (-20, -58), (-11, -62), (11, -62), (20, -58), (23, -48), (26, -30),
                      (28, -12), (27, 2), (16, 3), (5, 1), (-6, 3), (-17, 1)], 5)
    for sx in (-1, 1):
        f.shape('gold', [(sx * 8, -65), (sx * 20, -68), (sx * 29, -63), (sx * 30, -55), (sx * 25, -51), (sx * 16, -55), (sx * 9, -59)], 4)
        f.shape('plate2', [(sx * 18, -57), (sx * 28, -54), (sx * 29, -48), (sx * 23, -45), (sx * 17, -49)], 3)
    f.shape('gold', [(-10, -70), (10, -70), (11, -63), (0, -61), (-11, -63)], 3)
    f.ell('gold', 0, -77, 9.5, 10.5)
    for k in range(5):
        a = math.radians(-32 + k * 16)
        L = 6.5 + 2.5 * math.cos(a * 2)
        bx, by = math.sin(a) * 8, -77 - math.cos(a) * 9.5
        tx, ty = bx + math.sin(a) * L, by - math.cos(a) * L
        nx, ny = math.cos(a) * 1.6, math.sin(a) * 1.6
        f.shape('gold', [(bx - nx, by - ny), (bx + nx, by + ny), (tx, ty)], 2)
    f.shape('sole', [(9, 1), (20, 0), (22, 6), (10, 7)], 3)
    f.ell('shield', -33, -17, 11, 17)
    f.ell('boss', -33.5, -17, 3.0, 4.6)
    f.stroke('shaft', [(24, 5), (74, 3), (120, -1)], 2.8, 2.4)
    # a lâmina em meia-lua deitada chapada na neve (vista quase de lado, fina) e a ponta de lança
    f.shape('blade', [(100, 1), (104, -3.5), (113, -5.5), (124, -5), (131, -2.5), (127, 0), (118, -1.5), (108, -0.5), (104, 2)], 5)
    f.shape('blade', [(119, -1), (139, -2), (120, 1.5)], 2)
    return f


def pz_wolf(x, y, L, facing=1):
    """Um lobo da caça deitado (a esfinge), de trás e um pouco de lado: a anca perto de nós com o rabo enrolado
    na neve, as costas, o pescoço grosso de pelo, a cabeça erguida olhando as Torres, as orelhas em pé e as patas
    da frente esticadas."""
    s = L / 100.0
    f = Figure(x, y, s)
    def M(pts):
        return [(px * facing, py) for px, py in pts]
    f.shape('fur', M([(-50, 2), (-54, -10), (-51, -23), (-41, -31), (-27, -33), (-11, -32), (4, -35), (14, -40), (21, -47), (27, -54),
                      (31, -59), (33, -62), (34, -72), (39.5, -64), (44, -64), (47.5, -73), (50, -62), (54, -58), (60, -54), (67, -51),
                      (68, -48), (62, -45), (56, -44), (54, -37), (51, -28), (48, -18), (49, -8), (53, -5), (71, -5), (74, -1), (71, 2),
                      (40, 2), (10, 3), (-30, 3)]), 6)
    f.stroke('fur', M([(-50, -10), (-58, -2), (-52, 6), (-34, 9), (-12, 9), (2, 7)]), 14, 7)
    f.stroke('stripe', M([(-46, -25), (-30, -31), (-10, -30), (6, -33), (16, -42), (26, -53), (33, -59)]), 6, 3.5)
    f.ell('ear', 37 * facing, -65, 1.5, 3.4)
    f.ell('ear', 47.5 * facing, -65, 1.5, 3.4)
    return f


def pz_owl(x, y, h):
    """A coruja de geada pousada, de costas: o corpo em ovo, as asas fechadas cruzando sobre o rabo, a cabeça larga
    virada de perfil para as Torres (o bico e um olho aceso), os tufos das orelhas."""
    f = Figure(x, y, h / 100.0)
    f.shape('owl', [(2, 16), (-6, 8), (-15, 0), (-22, -18), (-24, -40), (-23, -56), (-26, -66), (-26, -78), (-24, -86), (-25, -95),
                    (-18, -89), (-6, -91), (6, -91), (17, -93), (20, -86), (25, -80), (27, -73), (31, -69), (27, -65), (23, -59),
                    (22, -40), (20, -18), (14, 0), (8, 8)], 5)
    f.ell('eye', 19, -76, 2.0, 2.0)
    f.stroke('talon', [(-6, 6), (-5, 13)], 2.6, 2)
    f.stroke('talon', [(5, 6), (6, 13)], 2.6, 2)
    return f


def pz_pine(x, base, top, w):
    """O pinheiro morto da esquerda: o tronco que sai do quadro em cima, galhos secos quebrados (os de cima
    caídos) com neve em cima de cada um."""
    f = Figure(x, base, 1.0)
    f.shape('trunk', [(-w * 0.55, 0), (-w * 0.5, -120), (-w * 0.42, -300), (-w * 0.35, top + 60), (-w * 0.3, top), (w * 0.3, top),
                      (w * 0.35, top + 60), (w * 0.42, -300), (w * 0.5, -120), (w * 0.6, 0), (w * 0.9, 8), (-w * 0.9, 8)], 3)
    branches = [(-470, -1, 120, 0.25), (-370, 1, 170, 0.1), (-300, -1, 70, 0.5), (-250, 1, 60, 0.6), (-520, -1, 110, 0.2), (-560, 1, 70, 0.3),
                (-640, 1, 90, 0.35), (-700, -1, 80, 0.3)]
    snow = []
    for (by, side, L, droop) in branches:
        p0 = (side * w * 0.3, by)
        p1 = (side * (w * 0.3 + L * 0.5), by + L * droop * 0.4)
        p2 = (side * (w * 0.3 + L), by + L * droop + L * 0.06)
        f.stroke('trunk', [p0, p1, p2], 13 if L > 100 else 10, 2.5)
        snow.append([(p0[0], p0[1] - 5.5), (p1[0], p1[1] - 5), (p2[0] - side * 8, p2[1] - 2.5)])
    for sn in snow:
        f.stroke('snow', sn, 6, 2)
    return f


def f_paz(rng):
    yy, xx = grid()
    ref = pz_sky(rng, yy, xx)
    solid = np.zeros((H, W), np.float32)
    # os picos longe saindo das nuvens, quase sumidos na névoa
    sea_top = PZ_HZ + 2 + 3 * noise1d(W, 60, rng, 3)
    for (x0, x1, top, seed_amp) in ((-80, 420, 318, 22), (330, 640, 338, 14), (1010, 1360, 324, 20)):
        xs = np.arange(W)
        cx_ = (x0 + x1) / 2
        prof = top + (PZ_HZ + 6 - top) * np.clip(np.abs(xs - cx_) / ((x1 - x0) / 2), 0, 1) ** 1.4
        line = ridge(xs, rng, 0, seed_amp, 80, 6, 0.6) + prof
        m = sstep(line[None, :] - 0.8, line[None, :] + 0.8, yy) * ((xs >= x0) & (xs <= x1))[None, :] * (yy < PZ_HZ + 8)
        far = mix(col(0x3a2c52), col(0x8a6478), sstep(top, PZ_HZ + 4, yy)[..., None])
        ref = put(ref, far, m * 0.9)
    # o mar de nuvens
    under = sstep(sea_top[None, :] - 1.5, sea_top[None, :] + 1.5, yy)
    sea, hs, seaglow = pz_sea(rng, yy, xx)
    ref = put(ref, sea, under)
    # as Torres e o aqueduto
    ref, tglow = pz_torres(ref, rng, yy, xx, solid)
    ref, solid = pz_aqueduct(ref, rng, yy, xx, solid)
    # a névoa das nuvens lambe o pé do pico e dos pilares
    wisp = sstep(0.45, 0.75, value_noise(H, W, 24, rng, 3)) * np.exp(-((yy - 394) / 8) ** 2)
    ref = mix(ref, mix(col(0x9a7088), col(0xf0b07a), np.exp(-((xx - PZ_TX) / 200) ** 2)[..., None]), (wisp * 0.6)[..., None])
    # ---------------- a serra: a beira da neve a uns 10 m
    xs = np.arange(W, dtype=np.float32)
    edge = pz_y(10.4) + (noise1d(W, 70, rng, 4) - 0.5) * 14 - 40 * np.clip((240 - xs) / 240, 0, 1) ** 1.5
    for (rx, rw, rh) in ((640, 70, 16), (930, 50, 10), (1250, 90, 22), (196, 80, 30)):
        edge = edge - rh * np.clip(1 - ((xs - rx) / rw) ** 2, 0, 1) ** 0.7
    ledge = sstep(edge[None, :] - 1.2, edge[None, :] + 1.2, yy)
    zl = PZ_EYE / np.maximum(yy - PZ_HZ, 1.0)
    ul = (xx - 640) * zl / PZ_F
    tex = noise_tex(rng, 512, 60, 4)
    rip = sample(tex, ul * 60, zl * 18)
    rip2 = sample(tex, ul * 220 + 50, zl * 70 + 20)
    near = np.clip((yy - edge[None, :]) / (H - edge[None, :]), 0, 1)
    snow = vgrad([(0.0, col(0x6c5c86)), (0.25, col(0x4c4268)), (1.0, col(0x221d36))], near)
    snow = snow * (0.88 + 0.2 * rip[..., None] + 0.06 * rip2[..., None])
    # a beirada pega o ouro de baixo, mais perto das Torres
    lip = np.exp(-((yy - edge[None, :]) / 5) ** 2) * (0.35 + 0.65 * np.exp(-((xx - PZ_TX) / 380) ** 2))
    snow = mix(snow, col(0xf0b48a), (lip * 0.7)[..., None])
    ref = put(ref, snow, ledge)
    # pedras na beira com neve em cima (a quina de baixo escura, o alto com neve)
    rocks = np.zeros((H, W), np.float32)
    for (rx, rw, rh) in ((640, 70, 16), (930, 50, 10), (1250, 90, 22), (196, 80, 30)):
        base_y = edge[int(np.clip(rx, 0, W - 1))] + rh + 6
        pts = [(rx - rw * 0.8, base_y)]
        for k in range(9):
            a_ = math.pi * k / 8
            pts.append((rx - rw * 0.8 * math.cos(a_), base_y - (rh + 10) * math.sin(a_) * (0.8 + 0.3 * math.sin(k * 2.1))))
        q = patch(pts)
        if q is not None:
            a, sl = q
            rocks[sl] = np.maximum(rocks[sl], a)
    cap = np.clip(rocks - shifted(rocks, 0, 5), 0, 1) * blur(rocks, 1.0)
    ref = put(ref, mix(col(0x1a1424), col(0x3a2a3a), np.clip((yy - 440) / 120, 0, 1)[..., None]), rocks)
    ref = put(ref, col(0x6a5c88), cap * 0.9)
    ref = put(ref, col(0xf0b48a), rim_of(rocks, 0, -1.2, 0.5) * 0.6 * np.exp(-((xx - PZ_TX) / 500) ** 2))
    solid = np.maximum(solid, rocks)
    # ---------------- as figuras
    shadows = []
    for (x, z, tip, bow, wide, seed) in ((300, 7.6, (5, -104), 0.6, 1.0, 1), (500, 9.9, (-3, -103), 1.0, 0.95, 2),
                                         (968, 10.6, (4, -104), 0.2, 1.0, 3), (1062, 8.8, (-5, -101), 0.8, 1.05, 4), (1205, 6.7, (3, -104), 0.4, 1.1, 5)):
        shadows.append((pz_shadow(x, pz_y(z), pz_h(1.35, z), tip, bow, wide, seed), (x, pz_y(z))))
    gz = 8.3
    guard = pz_guard(612, pz_y(gz), pz_h(1.3, gz))
    w1 = pz_wolf(410, pz_y(8.6), pz_h(1.45, 8.6), 1)
    w2 = pz_wolf(1135, pz_y(6.9) + 4, pz_h(1.45, 6.9), -1)
    pine = pz_pine(112, pz_y(4.2), -800, 78)
    owl = pz_owl(205, 349, 88)
    zero = np.zeros((H, W), np.float32)
    # o escuro de contato embaixo de cada um e a sombra fraca do núcleo, comprida, vindo para cá
    shade = np.zeros((H, W), np.float32)
    contact = np.zeros((H, W), np.float32)
    every = shadows + [(guard, (612, pz_y(gz))), (w1, (410, pz_y(8.6))), (w2, (1135, pz_y(6.9) + 4))]
    for f, ft in every:
        sil = np.zeros((H, W), np.float32)
        for k, m in f.masks().items():
            if k not in ('pool', 'tendril', 'shaft', 'blade', 'mantle'):
                sil = np.maximum(sil, m)
        shade = np.maximum(shade, cast_shadow(sil, ft, PZ_CORE, 0.9, 6.0))
        ys, xs_ = np.nonzero(sil > 0.5)
        if len(xs_):
            w_ = (xs_.max() - xs_.min()) * 0.55
            contact = np.maximum(contact, np.exp(-(((xx - ft[0]) / max(w_, 4)) ** 2 + ((yy - ft[1] - 2) / (w_ * 0.09 + 2)) ** 2)))
    ref = ref * (1 - (np.clip(shade * 0.18 + contact * 0.55, 0, 0.7) * ledge)[..., None])
    # o pinheiro (na sombra, com a neve dos galhos pegando o céu)
    pm = pine.masks()
    trunk = pm['trunk']
    bark = col(0x120e18) * (0.85 + 0.3 * stretched_noise(H, W, 3, 0.15, rng, 2)[..., None])
    ref = put(ref, bark, trunk)
    ref = put(ref, col(0x6a5482), rim_of(trunk, 2.0, -1.0, 0.6) * 0.4)
    ref = put(ref, col(0x8a80b0), pm['snow'] * 0.95)
    ref = put(ref, col(0xc8b0c8), rim_of(pm['snow'], 0, -1.0, 0.5) * 0.5)
    ref = put(ref, col(0x2a2238), rim_of(pm['snow'], 0, 1.2, 0.5) * 0.5)
    # a coruja: o cinza da geada no escuro, a borda acesa e o olho que pega o ouro do núcleo
    om_ = owl.masks()
    om = np.maximum(om_['owl'], om_['talon'])
    ref = put(ref, col(0x26262f), om)
    ref = put(ref, col(0x3a3a4c), om_['owl'] * sstep(0.55, 0.85, stretched_noise(H, W, 2.0, 0.5, rng, 2)) * 0.35)
    ref = put(ref, col(0xb8b0d0), rim_of(om, 1.6, -1.2, 0.5) * 0.8)
    ref = put(ref, col(0xffc860), om_['eye'])
    # as sombras: escuro de tinta, a beira esfumada, a poça brilhando roxo, os tentáculos largados
    fig_all = np.zeros((H, W), np.float32)
    smoke = value_noise(H, W, 6, rng, 3)
    for f, ft in shadows:
        ms = f.masks()
        body = ms['body']
        soft = np.clip(blur(body, 2.0) * (0.7 + 0.6 * smoke), 0, 1)
        body = np.maximum(body * sstep(0.2, 0.6, blur(body, 1.0)), soft * 0.8)
        pool = ms['pool'] * (1 - body)
        ten = ms.get('tendril', zero)
        ref = put(ref, col(0x0b0811), pool * 0.88)
        ref = put(ref, col(0x9a6ae0), rim_of(ms['pool'], 0, 1.0, 0.5) * (1 - body) * 0.45)
        ref = put(ref, col(0x0d0a14), ten * 0.92)
        ref = put(ref, col(0x7a58b0), rim_of(ten, 0, -1.0, 0.5) * 0.4)
        ref = put(ref, mix(col(0x0c0913), col(0x1e1532), sstep(ft[1] - 10, ft[1] - 150, yy)[..., None]), body)
        ref = put(ref, col(0x050308), ms['mantle'] * body * 0.6)
        fig_all = np.maximum(fig_all, np.maximum(body, ten * 0.6))
    # o guarda: a tinta escura do manto, o ouro em contraluz (escuro no meio, a borda acesa)
    gm = guard.masks()
    gsil = np.zeros((H, W), np.float32)
    for k, m in gm.items():
        gsil = np.maximum(gsil, m)
    ref = put(ref, col(0x1e0e14), gm['cloth'])
    ref = put(ref, col(0x3a1c22), rim_of(gm['cloth'], 0, -1.0, 0.6) * 0.5)
    for k_, c_ in (('gold', 0x3e2c12), ('plate2', 0x4c3616), ('shield', 0x3a2a12)):
        ref = put(ref, col(c_), gm[k_])
    ref = put(ref, col(0x1a1208), gm['boss'])
    gold_all = np.maximum(np.maximum(gm['gold'], gm['plate2']), gm['shield'])
    ref = put(ref, col(0xffd080), rim_of(gold_all, 1.3, -1.3, 0.5) * 0.85)
    ref = put(ref, col(0xb08040), rim_of(gm['plate2'], 0, -1.0, 0.4) * 0.6)
    ref = put(ref, col(0x120a08), gm['sole'])
    ref = put(ref, col(0x241810), gm['shaft'])
    ref = put(ref, col(0xb07a48), rim_of(gm['shaft'], 0, -1.0, 0.4) * 0.6)
    ref = put(ref, col(0x30333f), gm['blade'])
    ref = put(ref, col(0xb8c0dc), rim_of(gm['blade'], 0, -1.2, 0.5) * 0.85)
    fig_all = np.maximum(fig_all, gsil)
    # os lobos: pelo escuro, a faixa clara do lombo, as orelhas de contraluz (vermelhas por dentro)
    for wf in (w1, w2):
        wm = wf.masks()
        fur = wm['fur']
        ref = put(ref, col(0x12141d), fur)
        ref = put(ref, col(0x232836), fur * sstep(0.5, 0.85, stretched_noise(H, W, 2.0, 5.0, rng, 2)) * 0.4)
        ref = put(ref, col(0x4a5068), wm['stripe'] * fur * 0.5)
        ref = put(ref, col(0x7a4038), wm['ear'] * 0.35)
        fig_all = np.maximum(fig_all, fur)
    # o contraluz de todos: o ouro das nuvens nas bordas de lado, o roxo do céu em cima
    rim_g = np.clip(np.where(xx < PZ_TX, rim_of(fig_all, 2.0, -0.6, 0.6), rim_of(fig_all, -2.0, -0.6, 0.6)), 0, 1)
    gl = 0.45 + 0.55 * np.exp(-((xx - PZ_TX) / 500) ** 2)
    ref = put(ref, col(0xf4bc8a), rim_g * 0.85 * gl)
    ref = put(ref, col(0xa088cc), rim_of(fig_all, 0, -2.0, 0.6) * 0.6)
    # o fio de fumaça que sobe da ponta de cada capuz
    wisp_m = Mask(W, H)
    for f, ft in shadows:
        tx, ty = f.T((3, -103))
        ph = rng.uniform(0, 6)
        pts = [(tx + math.sin(ph + k * 0.45) * k * 0.7, ty - k * 5.0) for k in range(16)]
        for a_, b_ in zip(pts[:-1], pts[1:]):
            wisp_m.line([a_, b_], 1.1)
    wm_ = blur(wisp_m.array(), 1.0)
    ref = put(ref, col(0x1a1228), wm_ * 0.4)
    # ---------------- o pincel: o fundo com o pincel largo, as figuras com o fino (não perdem o escuro)
    base = np.where(yy < PZ_HZ + 4, (value_noise(H, W, 90, rng, 2) - 0.5) * 0.25, (value_noise(H, W, 60, rng, 2) - 0.5) * 0.4)
    flow = flow_of(ref, base, 0.8)
    out, _ = painted(ref, rng, flow, ps=passes(0.85, dry=0.22, err=(0.0, 0.02, 0.035, 0.05), long=1.15))
    figm = np.clip(np.maximum(np.maximum(fig_all, om), trunk), 0, 1)
    fig_d = np.clip(blur(figm, 1.5) * 1.6, 0, 1)
    outf, _ = painted(ref, rng, flow, mask=fig_d, ps=passes(0.32, dry=0.15, err=(0.0, 0.015, 0.025, 0.035), long=0.9), base=1.0)
    out = out * (1 - fig_d[..., None]) + outf * fig_d[..., None]
    keep = np.clip(blur(np.maximum(figm, solid * (yy < 400)), 0.8) * 0.35, 0, 0.5)
    out = out * (1 - keep[..., None]) + ref * keep[..., None]
    cx, cy = PZ_CORE
    # as estrelas (finas, por cima da tinta), menos perto do núcleo
    sm = np.zeros((H, W), np.float32)
    ns = 420
    sx = rng.uniform(0, W, ns)
    sy = (rng.random(ns) ** 1.6) * (PZ_HZ - 40)
    br = rng.random(ns) ** 3
    for x_, y_, b_ in zip(sx, sy, br):
        ix, iy = int(x_), int(y_)
        if 0 <= ix < W and 0 <= iy < H:
            sm[iy, ix] += 0.4 + 1.6 * b_
    sm = blur(sm, 0.7) * 3.2
    dcore = np.hypot(xx - cx, yy - cy)
    sm = sm * sstep(80, 260, dcore) * (1 - solid) * (1 - figm)
    out = add_light(out, col(0xe8e0ff), np.clip(sm, 0, 1) * 0.9)
    # o núcleo, as runas e as janelas acesas brilham por cima
    out = add_light(out, col(0xffd890), np.exp(-(dcore / 16) ** 2) * 0.9)
    out = add_light(out, col(0xffb060), np.exp(-(dcore / 60) ** 2) * 0.35)
    out = add_light(out, col(0xa070e0), np.exp(-(dcore / 200) ** 2) * 0.12)
    out = add_light(out, col(0xffa850), blur(tglow, 2.0) * 0.6)
    return finish(out)


if __name__ == '__main__':
    import time
    rng = np.random.default_rng(1000 + sum(map(ord, 'paz')))
    t0 = time.time()
    img = f_paz(rng)
    img.save(os.path.join(OUT, 'paz.png'))
    print('ok', round(time.time() - t0, 1))

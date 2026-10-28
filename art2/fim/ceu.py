"""Final III, plano 3: o céu (finais.py, 'ceu' e 'ceu-perto').

Vespera vista de baixo, logo depois: uma pracinha na beira do rio, entre uma casa desabada e outra de pé com o
beiral quebrado. As nuvens pesadas do Eclipse abrem um buraco em cima das Torres, que ficam longe no
horizonte, escuras, com o núcleo apagado no alto. No buraco, o disco negro sai da frente do sol e a primeira
luz volta: o anel de diamante (a coroa ainda em volta, o fio do sol num lado e o ponto aceso). A luz é fria e
contida, sem o dourado do Final I: o dia volta e as ruínas continuam lá. Algumas pessoas saíram para ver: um
rapaz no meio da praça e um casal junto do parapeito. Em ceu-perto (por cima, com transparência),
de costas e em contraluz, uma mulher com uma criança no colo, que aponta para o céu, e um velho de bengala, os
dois cortados embaixo pelo quadro (a câmera anda diferente das duas camadas), e o entulho dos cantos.

uso: python3 ceu.py [ref]   -> out/ceu.png e out/ceu-perto.png (cache/ceu-ref.png com 'ref')
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

# Em metros, como nos outros planos: X para os lados, Y para cima, Z para longe. A câmera fica baixa (1 m),
# sentada no entulho: assim as cabeças de quem está de pé sobem contra o céu.
CE_HZ, CE_F, CE_CAM = 548.0, 1000.0, 1.0
CE_SUN = (812.0, 128.0)     # o meio do disco do Eclipse, em cima das Torres
CE_R = 30.0                 # o raio do disco (a lua do Eclipse cobre o sol inteiro)
CE_MOON = (3.2, -2.4)       # o quanto a lua já saiu de cima do sol (px): o fio de sol fica embaixo à esquerda
CE_DECK = 1500.0            # a altura do teto de nuvens
CE_WALL = 25.0              # o parapeito da beira do rio
CE_TX = 812.0               # as Torres, embaixo do sol


def ce_p(X, Y, Z):
    return (640.0 + X * CE_F / Z, CE_HZ + (CE_CAM - Y) * CE_F / Z)


def horizon_c(x):
    """A cor do ar no horizonte (a névoa come o que está longe): mais clara embaixo do sol."""
    x = np.asarray(x, np.float32)
    return mix(col(0x6c7286), col(0x9ea0aa), np.exp(-((x - CE_SUN[0]) / 380.0) ** 2)[..., None])


class ColdPile(Pile):
    """O entulho de Pile na luz desta manhã: pedra e madeira frias, a beira de cima pega o céu claro."""
    STONE = dict(front=0x20242c, top=0x363c48, lit=0x444a58, dark=0x16191f, rim=0x7c8292)
    WOOD = dict(front=0x141110, top=0x241e1b, lit=0x302825, dark=0x0e0c0b, rim=0x7a7880)
    HAZE = 0x7a8094
    HEAP = dict(fill=0x1c1f26, rim=0x6a7080)
    SPLINTER = dict(fill=0x181412, rim=0x7a7880)


# ---------------------------------------------------------------- o céu
def ce_sky(rng, yy, xx):
    """O céu sem nuvens: o azul de ardósia do fim do Eclipse e o claro largo e frio do sol que volta."""
    SX, SY = CE_SUN
    d = np.hypot(xx - SX, yy - SY)
    t = np.clip(yy / CE_HZ, 0, 1.3)
    sky = vgrad([(0.0, col(0x121828)), (0.3, col(0x202840)), (0.6, col(0x3a445e)), (0.84, col(0x626a82)), (0.96, col(0x8a8c9a)),
                 (1.0, col(0xa09aa0)), (1.3, col(0xa09aa0))], t)
    sky = mix(sky, col(0xb4bccc), (np.exp(-(d / 430) ** 2) * 0.55)[..., None])
    sky = mix(sky, col(0xe6e6e6), (np.exp(-(d / 120) ** 2) * 0.72)[..., None])
    return sky, d


def tile_noise(rng, size=512, cell=40, octaves=4):
    """Ruído suave que emenda de verdade nas bordas (a grade aleatória é periódica): para amostrar no plano das
    nuvens, onde a textura se repete muitas vezes."""
    out = np.zeros((size, size), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = max(2, int(round(size / max(1.0, cell / 2 ** o))))
        g = rng.random((n, n)).astype(np.float32)
        z = ndi.zoom(g, size / n, order=3, mode='grid-wrap', grid_mode=True)
        out += amp * z[:size, :size]
        tot += amp
        amp *= 0.5
    out /= tot
    return (out - out.min()) / (out.max() - out.min() + 1e-6)


def tsample(tex, u, v):
    s = tex.shape[0]
    return ndi.map_coordinates(tex, [np.mod(v, s), np.mod(u, s)], order=1, mode='grid-wrap').astype(np.float32)


def mips(tex, n=6):
    """A textura e as versões borradas dela (o que um px enxerga de longe), emendando nas bordas."""
    out = [tex]
    for k in range(1, n):
        out.append(ndi.gaussian_filter(tex, 2.0 ** (k - 1), mode='wrap').astype(np.float32))
    return out


def mip_sample(levels, u, v, lod):
    lod = np.clip(lod, 0, len(levels) - 1)
    out = np.zeros(u.shape, np.float32)
    for k, t in enumerate(levels):
        w = np.clip(1 - np.abs(lod - k), 0, 1)
        if w.max() > 0:
            out += tsample(t, u, v) * w
    return out


def ce_clouds(sky, rng, yy, xx, d):
    """O teto de nuvens do Eclipse, visto de baixo em perspectiva (um plano a CE_DECK m: os flocos grandes em
    cima, menores e achatados perto do horizonte, onde a névoa come o desenho) com o buraco aberto em volta do
    sol: a barriga das nuvens escura e pesada, mais fina e translúcida perto do sol, e as beiradas viradas para
    ele acesas."""
    SX, SY = CE_SUN
    hy = np.maximum(CE_HZ - yy, 1.0)
    Zc = CE_DECK * CE_F / hy
    Xc = (xx - 640.0) * Zc / CE_F
    S = 26.0
    fpx = Zc / CE_F / S
    fpy = CE_DECK * CE_F / hy ** 2 / S
    lod = np.log2(np.maximum(np.sqrt(fpx * fpy), 1.0))
    A = mips(tile_noise(rng, 512, 44, 5))
    Wp = mips(tile_noise(rng, 512, 70, 3))
    B = mips(tile_noise(rng, 512, 14, 4))
    u, v = Xc / S, Zc / S
    wu = mip_sample(Wp, u * 0.5, v * 0.5, lod - 1) - 0.5
    wv = mip_sample(Wp, u * 0.5 + 211, v * 0.5 + 97, lod - 1) - 0.5
    uw, vw = u + wu * 34, v + wv * 34
    a = mip_sample(A, uw, vw, lod)
    b = mip_sample(B, uw * 3.1, vw * 3.1, lod + 1.63)
    dens = a * 0.74 + b * 0.26
    # o buraco: em volta de onde o raio do sol fura o teto
    Zs = CE_DECK * CE_F / (CE_HZ - SY)
    Xs = (SX - 640.0) * Zs / CE_F
    hole = np.exp(-(((Xc - Xs) / 900.0) ** 2 + ((Zc - Zs) / 1150.0) ** 2) * 1.3)
    dd = dens - hole * 0.55 + (1 - hole) * 0.07
    # perto do horizonte o teto acaba: a faixa clara do primeiro dia por baixo dele
    clear = sstep(CE_HZ - 90, CE_HZ - 8, yy)
    cov = sstep(0.45, 0.56, dd) * (1 - 0.8 * clear)
    thick = sstep(0.5, 0.78, dd)
    near_s = np.exp(-(d / 460) ** 2)
    belly = mix(col(0x343b50), col(0x141824), thick[..., None])
    belly = mix(belly, col(0x5e6680), (near_s * (1 - thick) * 0.8)[..., None])
    # longe, as nuvens ficam da cor do ar
    aer = np.exp(-hy / 120.0)
    belly = mix(belly, horizon_c(xx) * 0.8, (aer * 0.8)[..., None])
    ref = mix(sky, belly, cov[..., None])
    # a franja prateada: o fino da beirada, perto do sol, acende por trás
    lit = blur(np.clip(facing_sun(ref, cov, xx, yy, CE_SUN, 2.0), 0, 1), 1.0)
    edge_c = mix(col(0x7a829c), col(0xf2f0ec), np.exp(-(d / 300) ** 2)[..., None])
    ref = mix(ref, edge_c, (np.clip(lit * 1.3, 0, 1) * (0.1 + 0.9 * np.exp(-(d / 470) ** 2)))[..., None])
    silver = cov * (1 - thick) * np.exp(-(d / 240) ** 2)
    ref = screen(ref, col(0xe4e4e6), silver * 0.6)
    return ref, cov


# ---------------------------------------------------------------- as Torres, longe
def ce_torres(ref, rng, yy, xx):
    """As Torres no horizonte, embaixo do sol, a uns cinco quilômetros: a torre do meio alta e fina com as
    cintas, o terraço do núcleo no alto (as duas agulhas e, entre elas, o núcleo apagado preso nas correntes)
    e as duas torres menores dos lados, de telhado em ponta; o pé delas some no mar de nuvens, que o sol acende
    por cima. Em contraluz: um pouco mais escuras que o céu, o fio de luz nas beiradas viradas para o sol."""
    T = CE_TX
    m = Mask(W, H)
    m.poly([(T - 19, 506), (T + 19, 506), (T + 12.5, 270), (T - 12.5, 270)])
    for yb, ext in ((452, 3.5), (404, 3.0), (352, 2.6), (304, 2.2)):
        w_ = 19 - (506 - yb) / 236 * 6.5 + ext
        m.poly([(T - w_, yb), (T + w_, yb), (T + w_ - 0.6, yb - 4.5), (T - w_ + 0.6, yb - 4.5)])
    m.poly([(T - 25, 270), (T + 25, 270), (T + 21, 262), (T - 21, 262)])
    for side in (-1, 1):
        m.poly([(T + side * 20.6, 262), (T + side * 17.6, 262), (T + side * 18.6, 223), (T + side * 19.2, 223)])
    m.ellipse(T, 240.5, 5.4, 5.4)
    for side in (-1, 1):
        m.line([(T + side * 4.8, 238.5), (T + side * 11, 232), (T + side * 18.6, 227)], 0.7)
    m.poly([(T - 72, 508), (T - 50, 508), (T - 52.5, 340), (T - 69.5, 340)])
    m.poly([(T - 73, 341), (T - 49, 341), (T - 61, 306)])
    m.poly([(T + 50, 508), (T + 71, 508), (T + 68.5, 354), (T + 52.5, 354)])
    m.poly([(T + 49, 355), (T + 72, 355), (T + 60.5, 322)])
    # as pontes de pedra entre a do meio e as dos lados, no alto do pé
    for side in (-1, 1):
        x0, x1 = (T - 51, T - 18) if side < 0 else (T + 18, T + 51)
        m.poly([(x0, 432), (x1, 432), (x1, 440), (x0, 440)])
    tm = m.array()
    # a névoa entre elas e a câmera (cinco quilômetros de ar): a mesma em toda a torre, não o que tem atrás
    air = horizon_c(xx) * 0.92
    ref = put(ref, mix(air, col(0x1c2232), 0.58), tm)
    for yb in (480, 432, 384, 334, 288):
        ref = put(ref, mix(air, col(0x0e1220), 0.72), Mask(W, H).rect(T - 2.2, yb - 11, T + 2.2, yb).array() * 0.7)
    ref = put(ref, col(0xc4c8d4), np.clip(facing_sun(ref, tm, xx, yy, CE_SUN, 1.6), 0, 1) * 0.42)
    # o mar de nuvens no pé delas: os topos fofos, acesos de cima, o de baixo na sombra e na névoa
    xs = np.arange(W, dtype=np.float32)
    puff = np.zeros(W, np.float32)
    for k in range(90):
        cxp = T + rng.normal(0, 300)
        rp = rng.uniform(5, 22) * (1.2 - 0.5 * min(abs(cxp - T) / 500.0, 1.0))
        hp = rp * rng.uniform(0.25, 0.5)
        puff = np.maximum(puff, hp * np.sqrt(np.clip(1 - ((xs - cxp) / rp) ** 2, 0, 1)))
    tops = 496 - puff - 3 * noise1d(W, 40, rng, 3)
    spread = np.exp(-((xx - T) / 520.0) ** 2)
    sea = sstep(tops[None, :] - 1.4, tops[None, :] + 1.4, yy) * (1 - sstep(520, 540, yy)) * spread
    depth = np.clip((yy - tops[None, :]) / 18.0, 0, 1)
    lit_c = mix(col(0x8e92a2), col(0xaeb0bc), np.exp(-((xx - T) / 220.0) ** 2)[..., None])
    sc = mix(lit_c, horizon_c(xx) * 0.88, depth[..., None])
    ref = put(ref, sc, sea * 0.82)
    ref = put(ref, col(0xc8cad2), np.clip(sea - shifted(sea, 0, 2.0), 0, 1) * 0.35 * spread)
    return ref, tm * (1 - sea)


# ---------------------------------------------------------------- a cidade do outro lado do rio
def ce_city(ref, rng, yy, xx, solid):
    """Os telhados da outra margem em três fileiras (longe, no meio, perto do rio), cada uma mais comida pela
    névoa, com chaminés, casas sem telhado e algumas janelas que voltaram a acender, e a catedral de duas torres
    no morro."""
    rows = [(536.0, 6, 14, 10, 24, 0.74), (541.0, 11, 26, 16, 34, 0.56), (548.0, 18, 44, 22, 48, 0.4)]
    for k, (base, hmin, hmax, wmin, wmax, haze) in enumerate(rows):
        x = -20.0 + rng.uniform(0, 10)
        while x < W + 20:
            w_ = rng.uniform(wmin, wmax)
            h_ = rng.uniform(hmin, hmax)
            x0, x1 = x, x + w_
            top = base - h_
            r = rng.random()
            if r < 0.45:
                apex = top - w_ * rng.uniform(0.3, 0.55)
                pts = [(x0, base + 4), (x1, base + 4), (x1, top), ((x0 + x1) / 2, apex), (x0, top)]
            elif r < 0.85:
                rt = top - w_ * rng.uniform(0.15, 0.28)
                pts = [(x0, base + 4), (x1, base + 4), (x1, top), (x1 - w_ * 0.18, rt), (x0 + w_ * 0.18, rt), (x0, top)]
            else:
                # a casa que desabou: só as paredes, de alto quebrado
                n = 6
                pts = [(x0, base + 4), (x1, base + 4)] + [(x1 - w_ * j / n, top + h_ * rng.uniform(-0.05, 0.55)) for j in range(n + 1)]
            c = mix(col(0x1a2030) * rng.uniform(0.85, 1.2), horizon_c((x0 + x1) / 2).reshape(3), haze)
            fill(ref, pts, c, solid)
            if r < 0.85 and rng.random() < 0.35:
                cx_ = rng.uniform(x0 + 2, x1 - 4)
                fill(ref, [(cx_, top + 2), (cx_ + 2.6 + k, top + 2), (cx_ + 2.6 + k, top - h_ * 0.3 - 3), (cx_, top - h_ * 0.3 - 3)], c, solid)
            # as janelas: escuras, e umas poucas acesas (gente acordando)
            if k == 2 and r < 0.85:
                for wy in np.arange(top + 6, base - 2, 8.0):
                    for wx in np.arange(x0 + 4, x1 - 4, 9.0):
                        if rng.random() < 0.05:
                            fill(ref, [(wx, wy), (wx + 2.4, wy), (wx + 2.4, wy + 3.6), (wx, wy + 3.6)], mix(col(0xf0c890), c, 0.35))
                        elif rng.random() < 0.5:
                            fill(ref, [(wx, wy), (wx + 2.4, wy), (wx + 2.4, wy + 3.6), (wx, wy + 3.6)], c * 0.7, k=0.8)
            x = x1 + (rng.uniform(2, 9) if rng.random() < 0.12 else rng.uniform(-4, 0.5))
        if k == 0:
            ce_cathedral(ref, solid)
    return ref


def ce_cathedral(ref, solid):
    """A catedral no morro da margem de lá, a uns 650 m: a nave, a rosácea apagada e as duas torres com agulha
    (a mesma de f_vespera, de outro lado)."""
    cx, base, s = 560.0, 530.0, 1.54   # px por metro
    c = mix(col(0x1a2030), horizon_c(cx).reshape(3), 0.5)
    d = c * 0.82
    P = lambda X, Y: (cx + X * s, base - Y * s)
    fill(ref, [P(-30, -4), P(30, -4), P(30, 30), P(0, 47), P(-30, 30)], c, solid)
    fill(ref, [P(30, -4), P(66, -4), P(66, 26), P(30, 34)], d, solid)
    for side in (-1, 1):
        x0 = -36 if side < 0 else 20
        fill(ref, [P(x0, -4), P(x0 + 16, -4), P(x0 + 16, 62), P(x0 + 8, 104), P(x0, 62)], c, solid)
        for fl in (28.0, 46.0):
            fill(ref, [P(x0 + 5, fl), P(x0 + 11, fl), P(x0 + 11, fl + 8), P(x0 + 8, fl + 11), P(x0 + 5, fl + 8)], c * 0.6)
    r_ = 6.0 * s
    rx, ry = P(0, 21)
    fill(ref, [(rx + r_ * math.cos(a), ry + r_ * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 24, endpoint=False)], c * 0.62)


# ---------------------------------------------------------------- a praça
def ce_plaza(ref, rng, yy, xx, sky_ref):
    """O chão de pedra da praça, úmido do sereno (devolve um pouco do céu), e o parapeito da beira do rio com a
    pedra de cima clara (pega o céu) e as juntas."""
    wall_top = ce_p(0, 0.9, CE_WALL)[1]
    wall_foot = ce_p(0, 0, CE_WALL)[1]
    tex = noise_tex(rng, 512, 20, 5)
    # o chão: pedras de 0,22 m em fileiras, com a junta escura
    below = yy > wall_foot - 0.5
    Z = np.where(below, CE_CAM * CE_F / np.maximum(yy - CE_HZ, 0.5), 1e3)
    X = (xx - 640.0) * Z / CE_F
    rowf = Z / 0.22
    row = np.floor(rowf)
    uu = X / 0.24 + np.mod(row * 0.5, 1.0)
    du = np.maximum(np.abs(np.gradient(uu, axis=1)), 1e-5)
    dr = np.maximum(np.abs(np.gradient(rowf, axis=0)), 1e-5)
    ju = np.abs(uu - np.round(uu)) / du
    jv = np.abs(rowf - np.round(rowf)) / dr
    joint = np.clip(1.4 - np.minimum(ju, jv), 0, 1) * sstep(1.5, 5.0, 1.0 / dr)
    stone = np.mod(np.floor(uu) * 7 + row * 13, 9) / 9.0 - 0.5
    grain = sample(tex, X * 90, Z * 90) - 0.5
    near = sstep(wall_foot, H, yy)
    g = vgrad([(0.0, col(0x3a4050)), (1.0, col(0x1c1f28))], near)
    g = g * (1 + 0.16 * stone[..., None] + 0.22 * grain[..., None])
    refl_y = np.clip(2 * CE_HZ - yy, 0, H - 1).astype(np.int32)
    refl = sky_ref[refl_y, np.arange(W)[None, :]]
    gloss = (0.1 + 0.2 * (1 - near) ** 2) * sstep(0.45, 0.7, value_noise(H, W, 60, rng, 3))
    g = mix(g, refl * 0.8, gloss[..., None])
    g = mix(g, col(0x0c0e14), (joint * 0.55)[..., None])
    ref = put(ref, g, below.astype(np.float32))
    # o parapeito
    wm = (yy >= wall_top) & (yy < wall_foot + 0.5)
    tw = np.clip((yy - wall_top) / max(wall_foot - wall_top, 1), 0, 1)
    wc = vgrad([(0.0, col(0x4a5060)), (0.12, col(0x2a2e3a)), (1.0, col(0x1e212a))], tw)
    wc = wc * (1 + 0.2 * (sample(tex, xx * 0.7, yy * 0.7) - 0.5))[..., None]
    jx = (np.abs(np.mod(xx - 18, 46) - 23) > 22.2) & (yy > wall_top + 4)
    wc = mix(wc, col(0x12141a), (jx * 0.6)[..., None])
    ref = put(ref, wc, wm.astype(np.float32))
    ref = put(ref, col(0xb4b8c4), (np.abs(yy - wall_top - 0.8) < 0.9) * 0.6)
    return ref, wall_top, wall_foot


def ce_ruin_profile(rng, z0, z1, h0):
    """O alto da parede que desabou: degraus de pedra (a parede cai em escada), baixando para o lado do rio,
    com um pedaço grande que caiu de vez em quando; a janela e a porta ficam com parede em cima."""
    zs, hs = [z0], [h0]
    z, h = z0, h0
    while z < z1 - 1e-6:
        z = min(z + rng.uniform(0.25, 0.85), z1)
        dh = rng.normal(-0.3, 0.32)
        if rng.random() < 0.13:
            dh -= rng.uniform(0.7, 1.5)
        if rng.random() < 0.1:
            dh += rng.uniform(0.4, 0.9)
        h = float(np.clip(h + dh, 2.4, h0 + 0.4))
        if 15.6 < z < 18.2:
            h = max(h, 5.5)
        if 19.4 < z < 21.4:
            h = max(h, 3.1)
        zs.append(z)
        hs.append(h)
    return zs, hs


def ce_houses(ref, rng, yy, xx, tex):
    """As duas casas dos lados da praça. À esquerda, a que desabou: a parede de lado (virada para a praça) com o
    alto quebrado em degraus, o vão de uma janela em arco e o de uma porta, com o céu e a praça atrás; uma viga do
    telhado caída, apoiada no alto da parede e no monte de entulho do pé dela, e outra deitada no monte. À
    direita, a de pé: a parede comprida subindo para fora do quadro, com uma rachadura grande, o reboco caído
    num canto, as janelas fechadas com tábuas e o beiral; no pé dela, mais entulho."""
    solid = np.zeros((H, W), np.float32)
    # ---- a da esquerda (X = -7,5; de Z = 13 a 24)
    Xl, z0, z1 = -7.5, 13.0, 24.0
    zs, hs = ce_ruin_profile(rng, z0, z1, 7.2)
    top_l = []
    for k in range(len(zs) - 1):
        top_l.append(ce_p(Xl, hs[k] + rng.uniform(-0.06, 0.06), zs[k]))
        top_l.append(ce_p(Xl, hs[k] + rng.uniform(-0.06, 0.06), zs[k + 1]))
    top_l.append(ce_p(Xl, hs[-1], zs[-1]))
    hz = lambda z: float(np.interp(z, zs, hs))
    wall = [ce_p(Xl, 0, z0), ce_p(Xl, 0, z1)] + top_l[::-1]
    # a frente (em Z = 13, de X = -30 a -7,5), quase toda fora do quadro, também quebrada
    ft = [ce_p(Xl, hs[0], z0)]
    for X in np.linspace(Xl - 0.4, -12.0, 8):
        ft.append(ce_p(X, 7.2 + rng.uniform(-0.9, 0.3), z0))
    front = [ce_p(-12.0, 0, z0), ce_p(Xl, 0, z0)] + ft + [ce_p(-12.0, 7.0, z0)]
    wm = Mask(W, H).poly(wall).poly(front).array()
    win = Mask(W, H)
    pts = [ce_p(Xl, 2.1, 16.2), ce_p(Xl, 2.1, 17.6)]
    for a in np.linspace(0, math.pi, 12):
        pts.append(ce_p(Xl, 3.9 + 0.7 * math.sin(a), 16.9 + 0.7 * math.cos(a)))
    win.poly(pts)
    win.poly([ce_p(Xl, 0, 19.8), ce_p(Xl, 0, 21.0), ce_p(Xl, 2.4, 21.0), ce_p(Xl, 2.4, 19.8)])
    wm = np.clip(wm - win.array(), 0, 1)
    tl = np.clip(xx / 340.0, 0, 1)
    wcol = mix(col(0x181b24), col(0x2a2e3a), tl[..., None]) * (1 + 0.22 * (tex[..., None] - 0.5))
    course = np.abs(np.mod(yy + 0.04 * xx, 15.0) - 7.5) > 6.8
    wcol = mix(wcol, col(0x10121a), (course * 0.35)[..., None])
    ref = put(ref, wcol, wm)
    solid = np.maximum(solid, wm)
    # o alto quebrado pega o céu: só as quinas de cima (as que viram para cima)
    for a_, b_ in zip(top_l[:-1], top_l[1:]):
        if abs(b_[1] - a_[1]) > abs(b_[0] - a_[0]) * 1.5:
            continue
        r_ = patch(edge_quad(a_, b_, 1.5))
        if r_ is not None:
            a, sl = r_
            ref[sl] = ref[sl] * (1 - a[..., None] * 0.55) + col(0xb8bcc8) * a[..., None] * 0.55
    # o entulho no pé, e as vigas: uma apoiada no alto da parede e no monte, outra deitada no monte
    P = ColdPile(ref, rng, tex, vp=(640.0, CE_HZ))
    fx_, fy_ = ce_p(Xl + 1.2, 0, 17.5)
    P.heap(fx_, fy_ + 2, 290, 64, 30, (10, 26))
    lo = np.array([-5.0, 0.85, 18.2])
    hi = np.array([Xl + 0.1, hz(15.6) + 0.12, 15.6])
    hi = hi + (hi - lo) * 0.12
    P.beam(ce_p(*lo), ce_p(*hi), 0.18 * CE_F / 16.5)
    P.beam(ce_p(-6.9, 0.55, 16.6), ce_p(-4.3, 0.8, 19.0), 0.17 * CE_F / 17.8)
    solid = np.maximum(solid, P.m)
    ref = P.ref
    # ---- a da direita (X = 9; de Z = 10 a 25), alta: o paredão subindo para fora do quadro
    Xr, z0r, z1r = 10.5, 11.0, 25.0
    eave = [ce_p(Xr, 9.6, z) for z in np.linspace(z0r, z1r, 30)]
    wall_r = [ce_p(Xr, 0, z0r), ce_p(Xr, 0, z1r)] + eave[::-1]
    wr = Mask(W, H).poly(wall_r).poly([ce_p(Xr, 0, z1r), ce_p(Xr + 14, 0, z1r), ce_p(Xr + 14, 9.6, z1r), ce_p(Xr, 9.6, z1r)]).array()
    tr = np.clip((1280 - xx) / 300.0, 0, 1)
    rcol = mix(col(0x161920), col(0x262a35), tr[..., None]) * (1 + 0.2 * (tex[..., None] - 0.5))
    # o reboco que caiu num canto: a pedra de baixo aparece, mais clara e com as fiadas
    pl = Mask(W, H).poly([ce_p(Xr, 2.6, 11.2), ce_p(Xr, 2.2, 12.6), ce_p(Xr, 3.1, 13.9), ce_p(Xr, 4.6, 14.2), ce_p(Xr, 5.6, 13.1),
                          ce_p(Xr, 5.2, 11.8), ce_p(Xr, 4.0, 11.0)]).array()
    course = np.abs(np.mod(yy - 0.06 * xx, 17.0) - 8.5) > 7.8
    rcol = mix(rcol, mix(col(0x2e3240), col(0x0e1016), course[..., None] * 0.6), (pl * 0.8)[..., None])
    rcol = mix(rcol, col(0x0e1016), (course * 0.18)[..., None])
    ref = put(ref, rcol, wr)
    solid = np.maximum(solid, wr)
    # a rachadura: desce torta do alto, entre as janelas
    ck = [(17.4, 8.9)]
    z, y = 17.4, 8.9
    while y > 3.0:
        z += rng.uniform(0.05, 0.42)
        y -= rng.uniform(0.25, 0.6)
        ck.append((z, y))
    cpts = [ce_p(Xr, y, z) for z, y in ck]
    ref = put(ref, col(0x07080c), Mask(W, H).line(cpts, 2.2).array() * wr * 0.85)
    ref = put(ref, col(0x3a3e4a), Mask(W, H).line([(x + 1.6, y + 0.8) for x, y in cpts], 1.0).array() * wr * 0.5)
    # as janelas fechadas com tábuas
    for z in (12.4, 15.6, 19.4, 22.6):
        for y0 in (1.6, 5.4):
            q = [ce_p(Xr, y0, z), ce_p(Xr, y0, z + 1.0), ce_p(Xr, y0 + 1.7, z + 1.0), ce_p(Xr, y0 + 1.7, z)]
            fill(ref, q, col(0x0c0d12))
            fill(ref, [ce_p(Xr, y0 + 0.05, z + 0.08), ce_p(Xr, y0 + 0.05, z + 0.92), ce_p(Xr, y0 + 1.6, z + 0.92), ce_p(Xr, y0 + 1.6, z + 0.08)], col(0x1e1a18), k=0.8)
            for kb in range(1, 4):
                yb_ = y0 + 1.7 * kb / 4
                ref = put(ref, col(0x0a0a0e), Mask(W, H).line([ce_p(Xr, yb_, z + 0.1), ce_p(Xr, yb_, z + 0.9)], 0.8).array() * 0.6)
    # o beiral: a fiada de telhas que sai da parede, com umas falhas
    for z in np.linspace(z0r, z1r, 60):
        if rng.random() < 0.08:
            continue
        a_, b_ = ce_p(Xr - 0.7, 9.7, z), ce_p(Xr - 0.7, 9.7, z + 0.27)
        fill(ref, [ce_p(Xr, 9.4, z), ce_p(Xr, 9.4, z + 0.26), b_, a_], col(0x1a1c24), solid)
    P.ref = ref
    fx_, fy_ = ce_p(Xr - 0.7, 0, 15.5)
    P.heap(fx_, fy_ + 2, 210, 44, 18, (8, 20))
    ref = P.ref
    solid = np.maximum(solid, P.m)
    ref = put(ref, col(0xa8acb8), np.clip(facing_sun(ref, wr, xx, yy, CE_SUN, 1.2), 0, 1) * 0.35)
    return ref, solid


# ---------------------------------------------------------------- a gente que saiu para ver (no fundo)
def ce_people():
    """O rapaz no meio da praça (a mão fazendo sombra nos olhos) e o casal junto do parapeito (ela encostada
    nele). Todos olham para o sol."""
    bodies = []
    look = dict(head=(0.012, -0.93))
    x, y = ce_p(1.3, 0, 21.0)
    h = 1.78 * CE_F / 21.0
    b = Body(x, y, h, pose(er=(0.11, -0.79), hr=(0.04, -0.9), **look))
    bodies.append(b.basic().coat(-0.42, 0.13))
    x, y = ce_p(-0.2, 0, 24.0)
    h = 1.72 * CE_F / 24.0
    b = Body(x, y, h, pose(er=(0.15, -0.66), hr=(0.13, -0.52), head=(0.018, -0.93)))
    bodies.append(b.basic().coat(-0.3, 0.12))
    x, y = ce_p(0.2, 0, 24.0)
    h = 1.6 * CE_F / 24.0
    b = Body(x, y, h, pose(el=(-0.16, -0.66), hl=(-0.21, -0.55), head=(-0.03, -0.93)), head_r=0.07)
    bodies.append(b.basic().dress(-0.03, 0.16).hair(0.16))
    return bodies


def ce_people_paint(ref, bodies, xx, yy):
    sil = silhouettes(bodies)
    ref = put(ref, col(0x14161e), sil)
    ref = put(ref, col(0xb8bcc8), np.clip(facing_sun(ref, sil, xx, yy, CE_SUN, 1.6), 0, 1) * 0.55)
    # a sombra comprida de cada um vem para a câmera (o sol está na frente, baixo), fraca: o sol ainda é um fio
    for b in bodies[:3]:
        fx_, fy_ = b.x, b.y
        L = b.h * 0.42
        ref = put(ref, col(0x15171e), Mask(W, H).poly([(fx_ - b.h * 0.05, fy_), (fx_ + b.h * 0.05, fy_), (fx_ + b.h * 0.11 - 0.06 * L, fy_ + L), (fx_ - b.h * 0.11 - 0.06 * L, fy_ + L)]).array() * 0.35)
    return ref, sil


# ---------------------------------------------------------------- o quadro
def f_ceu(rng):
    yy, xx = grid()
    sky, d = ce_sky(rng, yy, xx)
    ref, cov = ce_clouds(sky, rng, yy, xx, d)
    sky_ref = ref.copy()
    ref, tm = ce_torres(ref, rng, yy, xx)
    solid = np.zeros((H, W), np.float32)
    ref = ce_city(ref, rng, yy, xx, solid)
    solid = np.maximum(solid, tm)
    ref, wall_top, wall_foot = ce_plaza(ref, rng, yy, xx, sky_ref)
    tex = value_noise(H, W, 5, rng, 3)
    ref, hs = ce_houses(ref, rng, yy, xx, tex)
    bodies = ce_people()
    ref, ps = ce_people_paint(ref, bodies, xx, yy)
    info = dict(d=d, cov=cov, solid=np.maximum(solid, hs), people=ps, towers=tm)
    return ref, info


def ce_eclipse(out, yy, xx):
    """O fim do Eclipse, por cima do pincel (o pincel arrasta pontos): a coroa que ainda sobra, o disco negro,
    o fio do sol que volta e o ponto aceso (o anel de diamante) com o brilho em volta."""
    SX, SY = CE_SUN
    r = np.hypot(xx - SX, yy - SY)
    th = np.arctan2(yy - SY, xx - SX)
    streak = 0.6 + 0.4 * np.abs(np.sin(th * 7 + 0.5)) ** 3 + 0.25 * np.abs(np.sin(th * 13 + 1.3)) ** 5
    cor = np.exp(-np.maximum(r - CE_R, 0) / 20.0) * sstep(CE_R - 1.5, CE_R + 1.0, r) * streak
    out = screen(out, col(0xdde2ec), cor * 0.5)
    mx, my = SX + CE_MOON[0], SY + CE_MOON[1]
    moon = sstep(CE_R + 0.7, CE_R - 0.7, np.hypot(xx - mx, yy - my))
    sun = sstep(CE_R + 0.7, CE_R - 0.7, r)
    out = put(out, col(0x05060a), moon)
    out = put(out, col(0xfffcf4), np.clip(sun - moon, 0, 1))
    ang = math.atan2(-CE_MOON[1], -CE_MOON[0])
    bx, by = SX + CE_R * math.cos(ang), SY + CE_R * math.sin(ang)
    db = np.hypot(xx - bx, yy - by)
    out = screen(out, col(0xfffaf0), np.exp(-(db / 4.5) ** 2))
    out = screen(out, col(0xf2efe8), np.exp(-(db / 16) ** 2) * 0.6)
    out = screen(out, col(0xd6dae4), np.exp(-(db / 70) ** 2) * 0.3)
    for k in range(6):
        a = ang + k * math.pi / 3 + 0.25
        ux, uy = math.cos(a), math.sin(a)
        along = (xx - bx) * ux + (yy - by) * uy
        perp = np.abs(-(xx - bx) * uy + (yy - by) * ux)
        out = screen(out, col(0xfff6ea), np.exp(-(perp / 0.8) ** 2) * np.exp(-np.abs(along) / 28.0) * 0.32)
    return out


def ce_final(rng, ref, info):
    yy, xx = grid()
    d = info['d']
    base = np.where(yy < CE_HZ, (value_noise(H, W, 90, rng, 2) - 0.5) * 0.25, 0.0)
    flow = flow_of(ref, base, 0.9 * (1 - np.exp(-(d / 200) ** 2)))
    out, _ = painted(ref, rng, flow, ps=passes(0.8, dry=0.2, err=(0.0, 0.02, 0.035, 0.05), long=1.0))
    out = out * 0.8 + ref * 0.2
    # o alto das Torres (as agulhas e o núcleo entre elas) é fino demais para o pincel: volta o do quadro limpo
    tk = blur(info['towers'] * (1 - sstep(268, 282, yy)), 0.8) * 0.85
    out = out * (1 - tk[..., None]) + ref * tk[..., None]
    # os fachos pálidos: o claro do buraco arrastado do sol para fora, por cima da cidade
    src = (1 - info['cov']) * np.exp(-(d / 260) ** 2) * (yy < CE_HZ)
    ray = shafts(src, CE_SUN, 80, 1.0, 0.975)
    ray = np.clip(ray * 3.0 - 0.3, 0, 1) * (1 - np.exp(-(d / 70) ** 2))
    out = screen(out, col(0xd8dce6), ray * 0.26 * (1 - 0.6 * blur(info['solid'], 1.5)))
    out = ce_eclipse(out, yy, xx)
    v = np.hypot((xx - 640) / 780, (yy - 380) / 470)
    out = out * (1 - 0.28 * sstep(0.7, 1.3, v))[..., None]
    return finish(out)


def rim_sun(m, xx, yy, k=1.0, soft=0.8):
    """Como facing_sun, com a borda mais fina (as figuras de perto: o fio de luz é fino no contraluz)."""
    g = blur(m, soft)
    gy, gx = np.gradient(g)
    ux, uy = CE_SUN[0] - xx, CE_SUN[1] - yy
    ln = np.maximum(np.hypot(ux, uy), 1.0)
    return np.clip(-(gx * ux + gy * uy) / ln * 2.5 * k, 0, 1)


def ce_woman():
    """A mulher com a criança no colo, de costas, a 3,4 m: o vestido comprido, o xale escuro nos ombros caindo
    em ponta nas costas, o cabelo preso num coque baixo, a cabeça para trás (olhando para onde a criança aponta);
    a criança no quadril direito dela, de costas também, o braço de fora levantado apontando para o sol. Em cm,
    os pés em (0, 0) (fora do quadro: o quadro corta abaixo do joelho)."""
    ox, oy = ce_p(-1.25, 0, 3.4)
    s = CE_F / 3.4 / 100.0
    f = Figure(ox, oy, s)
    f.shape('dress', [(-14, -102), (14, -102), (21, -88), (25, -60), (28, -30), (31, -2), (-31, -2), (-28, -30), (-25, -60), (-21, -88)])
    f.shape('dress', [(-17, -134), (-9, -139), (9, -139), (17, -134), (20, -128), (18, -112), (14, -100), (-14, -100), (-18, -112), (-20, -128)])
    f.stroke('arm', [(-19, -128), (-22, -110), (-21.5, -90)], 8.5, 6.5)
    f.ell('hand', -21.5, -88, 3.4, 4.4)
    f.stroke('arm', [(18, -128), (24, -114), (31, -104)], 8.5, 7.0)
    f.shape('shawl', [(-22, -136), (-12, -141.5), (0, -142.5), (12, -141.5), (22, -136), (26, -126), (25.5, -113), (15, -108), (2, -97), (-11, -108),
                      (-25.5, -113), (-26, -126)], 5)
    f.ell('neck', 1.5, -141, 5.0, 4.0)
    f.ell('hair', 2.0, -151.5, 9.6, 10.0)
    f.ell('hair', 0.5, -144.5, 5.8, 4.8)
    f.ell('ear', 10.6, -149.5, 1.8, 2.8)
    # a criança: sentada no quadril direito dela, as costas para a câmera, a cabeça para cima
    f.shape('child', [(20, -100), (34, -101), (37, -110), (36, -124), (31, -129), (24, -129), (19, -124), (18, -110)], 4)
    f.stroke('child', [(24, -101), (30, -92), (33, -84)], 6.0, 4.6)
    f.ell('cshoe', 34, -82.5, 3.2, 2.6)
    f.ell('chair', 28.3, -136.8, 6.9, 7.0)
    f.stroke('child', [(21, -126), (16, -131), (12, -134)], 4.2, 3.6)
    f.stroke('child', [(34, -125), (40, -140), (46, -157)], 4.4, 3.6)
    f.stroke('chand', [(45.5, -156), (47.5, -162), (48.6, -166.5)], 3.0, 1.6)
    return f


def ce_oldman():
    """O velho de bengala, de costas, a 4,6 m: o casaco comprido, as costas um pouco curvas, a cabeça calva com
    a franja de cabelo branco em volta da nuca, para trás (olhando o sol); a mão direita na bengala, a esquerda
    segurando o chapéu que ele tirou. Em cm, os pés em (0, 0), fora do quadro."""
    ox, oy = ce_p(1.5, 0, 4.6)
    s = CE_F / 4.6 / 100.0
    f = Figure(ox, oy, s)
    f.shape('coat', [(-15, -134), (-6, -138), (7, -138), (16, -133), (21, -126), (22, -108), (24, -80), (27, -50), (29, -18), (-29, -18), (-27, -50),
                     (-25, -80), (-23, -108), (-21, -126)], 5)
    f.ell('coat', 0.5, -133, 13.5, 6.5)
    f.stroke('arm', [(-20, -127), (-24, -108), (-25, -89)], 8.5, 7.0)
    f.stroke('arm', [(19, -127), (25, -108), (28, -90)], 8.5, 7.0)
    f.ell('hand', 28.5, -88, 3.6, 4.2)
    f.stroke('cane', [(29, -86), (31.5, -45), (34, 0)], 2.4, 2.2)
    f.shape('cane', [(26, -89), (29, -93), (33, -91), (33, -86), (30, -86)], 3)
    f.ell('hat', -26, -82, 8.5, 2.6)
    f.shape('hat', [(-31, -83), (-30, -90), (-26, -92), (-21, -90), (-21, -83)], 3)
    f.ell('hand', -25.5, -88, 3.6, 4.2)
    f.ell('head', -0.5, -146.5, 9.0, 9.6)
    for side in (-1, 1):
        f.ell('ear', side * 9.2 - 0.5, -146, 1.8, 2.9)
    f.shape('whair', [(-9.4, -148), (-9.8, -143), (-7.5, -139), (-0.5, -137.2), (6.5, -139), (8.8, -143), (8.4, -148), (6.2, -144.5), (-0.5, -142.5),
                      (-7.2, -144.5)], 4)
    return f


def ce_perto(rng):
    """ceu-perto: a mulher com a criança e o velho, em contraluz (as costas no escuro frio, um pouco mais claras
    nos ombros, que pegam o céu, e o fio claro nas beiradas viradas para o sol), e o entulho dos dois cantos de
    baixo."""
    yy, xx = grid()
    ref = np.zeros((H, W, 3), np.float32)
    alpha = np.zeros((H, W), np.float32)
    zero = np.zeros((H, W), np.float32)
    tex = value_noise(H, W, 5, rng, 3)
    # (o lado do sol: a direita da mulher, a esquerda do velho)
    for f, sun_side, pal in ((ce_woman(), 1, dict(dress=0x181c26, shawl=0x232429, child=0x2a2a30, arm=0x181c26, hand=0x2a2422, neck=0x2a2422,
                                                  hair=0x141218, ear=0x3a302e, chair=0x16141a, cshoe=0x121216, chand=0x302826)),
                             (ce_oldman(), -1, dict(coat=0x1f1d21, arm=0x1f1d21, hand=0x2c2624, cane=0x241c17, hat=0x19181c, head=0x2c2624,
                                                    ear=0x342c2a, whair=0x5a5a62))):
        km = f.masks()
        sil = np.zeros((H, W), np.float32)
        for name in pal:
            m = km.get(name, zero)
            ref = put(ref, col(pal[name]) * (1 + 0.14 * (tex[..., None] - 0.5)), m)
            sil = np.maximum(sil, m)
        ys = np.nonzero(sil.max(1) > 0.5)[0]
        top_y = ys.min() if len(ys) else 0
        # o volume: os ombros e a cabeça pegam o céu de cima, embaixo fica mais escuro
        t = np.clip((yy - top_y) / 300.0, 0, 1)
        ref = ref * (1.18 - 0.38 * t)[..., None] * sil[..., None] + ref * (1 - sil[..., None])
        cloth = np.clip(km.get('dress', zero) + km.get('coat', zero) + km.get('shawl', zero), 0, 1)
        folds = 0.5 + 0.5 * np.sin((xx - f.ox) * 0.21 + 2.6 * value_noise(H, W, 40, rng, 2))
        ref = ref * (1 - (cloth * (folds - 0.5) * 0.32))[..., None]
        # o lado virado para o sol fica um pouco mais claro (a luz que volta é fraca, mas vem de lá)
        side = sstep(-20.0, 60.0, (xx - f.ox) * sun_side) * sil
        ref = ref * (1 + 0.22 * side)[..., None]
        top = np.clip(sil - shifted(sil, 0, 2.5), 0, 1)
        ref = put(ref, col(0x6a7080), blur(top, 0.7) * 0.45)
        ref = put(ref, col(0xe4ded4), rim_sun(sil, xx, yy, 2.2, 0.7) * 0.68)
        hair = np.clip(km.get('hair', zero) + km.get('chair', zero) + km.get('whair', zero), 0, 1)
        ref = put(ref, col(0xe2e0de), rim_sun(hair, xx, yy, 2.4, 0.6) * hair * 0.4)
        alpha = np.maximum(alpha, sil)
    P = ColdPile(ref, rng, tex, vp=(640.0, CE_HZ))
    P.heap(70, 748, 300, 84, 22, (18, 40), tone=0.72)
    P.heap(1215, 752, 270, 70, 18, (16, 36), tone=0.72)
    P.beam((1030, 716), (1290, 690), 16, tone=0.8)
    ref = P.ref
    alpha = np.maximum(alpha, P.m)
    base = np.zeros((H, W), np.float32)
    flow = flow_of(np.where(alpha[..., None] > 0.5, ref, 0.1), base, 0.9)
    out, A = painted(ref, rng, flow, mask=sstep(0.3, 0.6, alpha), ps=passes(0.7, dry=0.2, err=(0.0, 0.02, 0.03, 0.04)), base=1.0)
    a = np.clip(np.maximum(A * (alpha > 0.02), alpha * 0.98), 0, 1)
    out = out * 0.75 + ref * 0.25
    return finish(blur(out, 0.6), blur(a, 0.6))


def frame(rng):
    ref, info = f_ceu(rng)
    return ce_final(rng, ref, info)


if __name__ == '__main__':
    import time
    rng = np.random.default_rng(1000 + sum(map(ord, 'ceu')))
    t0 = time.time()
    ref, info = f_ceu(rng)
    finish(ref).save(os.path.join(CACHE, 'ceu-ref.png'))
    print('ref', round(time.time() - t0, 1))
    if 'ref' not in sys.argv:
        ce_final(rng, ref, info).save(os.path.join(OUT, 'ceu.png'))
        print('final', round(time.time() - t0, 1))
    if 'perto' in sys.argv or 'ref' not in sys.argv:
        rng = np.random.default_rng(1000 + sum(map(ord, 'ceu-perto')))
        ce_perto(rng).save(os.path.join(OUT, 'ceu-perto.png'))
        print('perto', round(time.time() - t0, 1))

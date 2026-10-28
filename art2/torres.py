"""Torres Rúnicas (capítulo 7): o terreno pintado das nove salas, já no EXTREME.

A arquitetura da Casa Vhalor (lore/torres.md): pedra escura e reta em fiadas regulares, a mesma cantaria
do aqueduto do vale, só que mais escura, com bronze nas juntas (as juntas de nível chumbadas com bronze e
os grampos de bronze atravessando as juntas de prumo) e runas gravadas, apagadas, em alguns blocos. Nada
de grama nem musgo: aqui em cima não cresce nada. O topo de quem se pisa é a pedra gasta, mais clara.

A luz das salas de fora vem de baixo: o mar de nuvens devolve o ouro de todas as memórias, então a borda
de baixo de cada bloco e de cada laje pega um fio dourado, e quanto mais perto das nuvens, mais o ouro e a
névoa tomam a pedra (os pilares somem no brilho). Por cima, a luz fria e violeta do céu do eclipse.
Dentro das torres: o Arquivo em âmbar quente, a Sala das Experiências fria e azulada, a Torre das
Engrenagens molhada (os escorridos da água dos baldes e do vapor), o Trono de pedra polida com as runas
embutidas no chão, a Coroação e o núcleo no escuro da pedra, com mais runas quanto mais perto da noite.

O que é de bronze no mapa ('+', as faces da calha onde a garra escorrega) são os canos que descem para
dentro das nuvens, presos na pedra por abraçadeiras. As plataformas de um lado só ('-') são as sacadas de
pedra da torre da comporta (com a mísula embaixo) e os degraus de ferro do pátio (com a mão-francesa). As
pontas que caíram (o lanço do meio da escada, os pilares que sobraram dos arcos) têm a quebra na pedra e
os grampos de bronze tortos para fora.

uso: python3 torres.py <sala> [pasta] [--only=terreno]
Sai <pasta>/terreno-<sala>-2x.png e terreno-<sala>.png (1x, alfa exato da física); no Arquivo, também a
estante falsa: terreno-arquivo-secret-2x.png e terreno-arquivo-secret.png (o véu).
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from brush import Layer, hexc, mix, sstep, value_noise, paint
import terreno
from terreno import Room, fields, downsample, S, T, PLANK_H
from floresta import Box, chip, stretched_noise, spans, downsample_soft
from cidade import breakables

HERE = os.path.dirname(os.path.abspath(__file__))
ONLY = next((a[7:] for a in sys.argv if a.startswith('--only=')), None)
SEEDS = {'escada': 301, 'calha': 303, 'patio': 305, 'arquivo': 307, 'experiencias': 309, 'engrenagens': 311, 'trono': 313,
         'coroacao': 315, 'nucleo': 317}
SOLID = '#+'
# salas (ou trechos, em tiles: x0, y0, x1, y1) a céu aberto: a luz das nuvens vem de baixo
OUTSIDE = {'escada': None, 'calha': None, 'patio': None, 'nucleo': None, 'experiencias': [(0, 0, 25, 71)]}
# o mar de nuvens embaixo da sala (o ouro e a névoa sobem do pé dela)
CLOUDS = {'escada', 'calha', 'nucleo', 'experiencias'}
# cor de cada sala por dentro (multiplica a pedra) e quanto escurece o miolo
TINT = {
    'arquivo': (1.1, 0.98, 0.84), 'experiencias': (0.86, 0.96, 1.12), 'engrenagens': (0.96, 0.98, 1.02),
    'trono': (1.0, 0.96, 0.98), 'coroacao': (0.98, 0.95, 1.02), 'nucleo': (1.0, 0.97, 0.98),
}
# runas gravadas: a chance de um bloco grande ter uma (mais perto do núcleo, mais runas)
RUNES = {'escada': 0.035, 'calha': 0.03, 'patio': 0.05, 'arquivo': 0.05, 'experiencias': 0.06, 'engrenagens': 0.04,
         'trono': 0.09, 'coroacao': 0.1, 'nucleo': 0.12}
# as pontas quebradas (tiles: x0, y0, x1, y1 da face que quebrou e o lado dela)
BROKEN = {
    'escada': [(80, 48, 80, 53, 'right'), (91, 39, 91, 42, 'left'), (83, 46, 85, 46, 'top')],
    'calha': [(155, 34, 158, 34, 'top')],
}
# a Torre das Engrenagens: as rodas atrás da coluna do meio (o mesmo cálculo de Torres.addMachine) e a
# corrente dos baldes (rooms.ts)
GEARS = dict(x=36, y=14, teeth=[50, 40, 56, 36, 50, 44, 56, 40, 50, 36])
TOOTH = 14

# a pedra da Casa: ardósia escura puxando para o violeta, cada bloco no seu tom
STONES = [hexc(0x3e3c48), hexc(0x37353f), hexc(0x45424d), hexc(0x312f38), hexc(0x4a4651), hexc(0x3b3741)]
DEEP = hexc(0x131218)
GAP = hexc(0x0c0b10)
# bronze: sombra, meio, luz e o brilho; o azinhavre (verde-azulado apagado) que escorre dele
BR_D, BR_M, BR_L, BR_H = hexc(0x3c2614), hexc(0x7a5126), hexc(0xb98442), hexc(0xf0cf88)
VERD, VERD_L = hexc(0x3d7064), hexc(0x6fa594)
IRON_D, IRON_M, IRON_L = hexc(0x15161b), hexc(0x2e3038), hexc(0x5e626e)
# a luz de baixo (o ouro das nuvens), a névoa dourada perto delas e a luz fria de cima
GOLD, HAZE, SKY = hexc(0xffbe6a), hexc(0xc98f58), hexc(0x9a92c0)
# a quebra (pedra nova, mais clara e áspera) e o pó
FRESH = hexc(0x857a74)
WET = np.array([0.62, 0.66, 0.72], np.float32)
LIME = hexc(0xb9b8ae)


def mats(room):
    """Material de cada célula: 0 cantaria, 1 bronze (cano), 2 a coluna do meio das Engrenagens (mancal)."""
    g = room.g
    mat = np.zeros(g.shape, np.int8)
    mat[g == '+'] = 1
    if room.name == 'engrenagens':
        sub = mat[12:128, 33:39]
        sub[g[12:128, 33:39] == '#'] = 2
    return mat


def outside_mask(room):
    """Onde a sala é a céu aberto (pixels 2x)."""
    o = OUTSIDE.get(room.name, False)
    if o is None:
        return np.ones((room.H, room.W), bool)
    m = np.zeros((room.H, room.W), bool)
    for (x0, y0, x1, y1) in (o or []):
        m[y0 * T:(y1 + 1) * T, x0 * T:(x1 + 1) * T] = True
    return m


# ======================================================================================
# cantaria
# ======================================================================================
def ashlar(H, W, rng, ch=T, lmin=1.45, lmax=2.7):
    """Fiadas da altura de um tile (as juntas de nível caem no limite dos tiles: o topo de cada degrau é
    uma junta), blocos de comprimento sorteado em cada fiada. Tudo vem só do tamanho da sala (a pintura
    com a passagem secreta fechada sai com as mesmas pedras)."""
    nc = int(math.ceil(H / ch))
    xs = np.arange(W, dtype=np.float32)
    bid = np.zeros((H, W), np.int32)
    u = np.zeros((H, W), np.float32)
    bl = np.zeros((H, W), np.float32)
    rects = []
    for c in range(nc):
        y0, y1 = int(c * ch), min(H, int((c + 1) * ch))
        e = [-rng.uniform(0, lmax * T)]
        while e[-1] < W:
            e.append(e[-1] + rng.uniform(lmin, lmax) * T)
        e = np.array(e, np.float32)
        k = np.clip(np.searchsorted(e, xs, side='right') - 1, 0, len(e) - 2)
        bid[y0:y1] = (c * 512 + k)[None, :]
        u[y0:y1] = (xs - e[k])[None, :]
        bl[y0:y1] = (e[k + 1] - e[k])[None, :]
        for i in range(len(e) - 1):
            rects.append((c * 512 + i, e[i], y0, e[i + 1], y1))
    yy = np.broadcast_to(np.arange(H, dtype=np.float32)[:, None], (H, W))
    v = yy % ch
    return bid, u, v, bl, rects


# as runas da pedra (traços retos de uma haste com ramos, numa grade de 4 x 8): gravadas a cinzel, sem
# curva nenhuma. São da Casa, não as do pátio (as que acendem têm o desenho do jogo, Torres.ts GLYPHS)
STAVES = [
    [((0, 0), (0, 8)), ((0, 2), (4, 0)), ((0, 5), (4, 3))],
    [((2, 0), (2, 8)), ((2, 2), (4, 4)), ((4, 4), (2, 6)), ((2, 6), (0, 4)), ((0, 4), (2, 2))],
    [((0, 0), (0, 8)), ((4, 0), (4, 8)), ((0, 2), (4, 6))],
    [((2, 0), (2, 8)), ((2, 0), (0, 3)), ((2, 0), (4, 3))],
    [((2, 0), (2, 8)), ((0, 1), (4, 7)), ((4, 1), (0, 7))],
    [((2, 0), (4, 2)), ((4, 2), (2, 4)), ((2, 4), (0, 2)), ((0, 2), (2, 0)), ((2, 4), (2, 8))],
    [((2, 2), (2, 8)), ((0, 0), (0, 3)), ((4, 0), (4, 3)), ((0, 3), (4, 3))],
    [((0, 0), (0, 8)), ((0, 4), (4, 2)), ((4, 2), (4, 8))],
]


def glyph_mask(gi, w, h, lw=1.9):
    """A runa gi numa janela w x h (a grade 4 x 8 cabe com margem); devolve o sulco (0..1)."""
    segs = STAVES[gi % len(STAVES)]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    sx = (w - 4) / 4.0
    sy = (h - 4) / 8.0
    m = np.zeros((h, w), np.float32)
    for (a, b) in segs:
        ax, ay = 2 + a[0] * sx, 2 + a[1] * sy
        bx, by = 2 + b[0] * sx, 2 + b[1] * sy
        dx, dy = bx - ax, by - ay
        L2 = max(dx * dx + dy * dy, 1e-6)
        t = np.clip(((xx - ax) * dx + (yy - ay) * dy) / L2, 0, 1)
        dd = np.hypot(xx - ax - t * dx, yy - ay - t * dy)
        m = np.maximum(m, sstep(lw * 0.5 + 0.6, lw * 0.5 - 0.4, dd))
    return m


def carve_breaks(room, M):
    """As pontas que caíram: a face da quebra entra um pouco na pedra (no máximo um terço de tile), em dentes."""
    rng = np.random.default_rng(SEEDS[room.name] + 77)
    zone = np.zeros(M.shape, np.float32)
    for (x0, y0, x1, y1, side) in BROKEN.get(room.name, []):
        X0, Y0, X1, Y1 = x0 * T, y0 * T, (x1 + 1) * T, (y1 + 1) * T
        if side in ('left', 'right'):
            n = Y1 - Y0
            prof = np.clip(np.cumsum(rng.normal(0, 1.6, n)) * 0.6, -6, 6)
            prof = np.abs(prof) + 2.0 + 5.0 * np.abs(np.sin(np.arange(n) / rng.uniform(4, 9))) * rng.uniform(0.4, 1.0)
            prof = np.clip(ndi.uniform_filter1d(prof, 3), 1.0, 0.33 * T)
            for i in range(n):
                k = int(prof[i])
                if side == 'right':
                    M[Y0 + i, X1 - k:X1] = False
                    zone[Y0 + i, max(0, X1 - k - 10):X1] = 1
                else:
                    M[Y0 + i, X0:X0 + k] = False
                    zone[Y0 + i, X0:X0 + k + 10] = 1
        else:
            n = X1 - X0
            prof = np.abs(np.cumsum(rng.normal(0, 1.8, n)) * 0.7) + 2.0
            prof = np.clip(ndi.uniform_filter1d(prof, 3), 1.0, 0.33 * T)
            for i in range(n):
                k = int(prof[i])
                M[Y0:Y0 + k, X0 + i] = False
                zone[Y0:Y0 + k + 10, X0 + i] = 1
    return M, ndi.gaussian_filter(zone, 3)


def terrain(room, extra=None):
    """A cantaria da sala. extra: células a mais pintadas como pedra (a estante falsa e o esconderijo do
    Arquivo, para o véu)."""
    rng = room.rng
    frng = np.random.default_rng(SEEDS[room.name] + 5)
    H, W = room.H, room.W
    yy, xx = room.yy, room.xx
    sol = np.isin(room.g, list(SOLID))
    if extra is not None:
        sol = sol | extra
    M = room.px(sol)
    M = chip(room, M, sol, top_max=1.3, bot_max=3.0)
    M, brk = carve_breaks(room, M)
    d, dtop, dbot, dleft, dright = fields(M)
    mat = np.kron(mats(room), np.ones((T, T), np.int8))
    out = outside_mask(room).astype(np.float32)
    out = ndi.gaussian_filter(out, 2 * T) if 0 < out.mean() < 1 else out
    low = (yy / H) if room.name in CLOUDS else np.zeros((H, W), np.float32)
    water = room.px(room.g == '~')
    dw = ndi.distance_transform_edt(~water).astype(np.float32) if water.any() else np.full((H, W), 1e6, np.float32)

    # ---- os blocos: tom de cada um, o grão, o veio, as manchas ----
    bid, u, v, bl, rects = ashlar(H, W, frng)
    nb = int(bid.max()) + 1
    kind = frng.choice(len(STONES), nb)
    tone = (1 + 0.15 * np.clip(frng.normal(0, 1, nb), -2.2, 2.2)).astype(np.float32)
    col = np.array(STONES, np.float32)[kind][bid] * tone[bid][..., None]
    # cada bloco puxa um pouco para o quente ou para o frio, e a face não é plana: um lado mais claro
    hue = np.clip(frng.normal(0, 1, nb), -2, 2).astype(np.float32)[bid]
    col *= np.stack([1 + 0.045 * hue, np.ones_like(hue), 1 - 0.045 * hue], -1)
    gx = frng.uniform(-1, 1, nb).astype(np.float32)[bid]
    gy = frng.uniform(-1, 1, nb).astype(np.float32)[bid]
    col *= (1 + 0.075 * (gx * (u / bl - 0.5) * 2 + gy * (v / T - 0.5) * 2))[..., None]
    grain = value_noise(H, W, 2.6, frng, 2)
    mott = value_noise(H, W, 46, frng, 2)
    big_l = value_noise(H, W, 190, frng, 2)
    col *= (1 + (grain - 0.5) * 0.22 + (mott - 0.5) * 0.18 + (big_l - 0.5) * 0.26)[..., None]
    # o veio fino da pedra, inclinado e diferente em cada bloco
    ang = frng.uniform(-0.5, 0.5, nb).astype(np.float32)[bid]
    vein = np.sin((xx * np.sin(ang) + yy * np.cos(ang)) * (2 * math.pi / (7.5 * S)) + value_noise(H, W, 14 * S, frng, 2) * 5)
    col *= (1 - 0.05 * sstep(0.7, 0.98, vein))[..., None]
    # lascas e furinhos (raros) e as trincas finas
    pits = sstep(0.8, 0.88, value_noise(H, W, 3.2 * S, frng, 2)) * sstep(0.55, 0.75, value_noise(H, W, 50 * S, frng, 1))
    col = mix(col, col * 0.55, (pits * 0.6)[..., None])
    crack = sstep(0.93, 0.985, stretched_noise(H, W, 1.0 * S, 18 * S, frng, 2)) * sstep(0.62, 0.8, value_noise(H, W, 60 * S, frng, 1))
    col = mix(col, GAP, (crack * 0.55)[..., None])

    # ---- o bisel de cada bloco: a aresta de cima, a de baixo e as dos lados ----
    jh, jv = 2.6, 2.0
    ch = float(T)
    top_e = sstep(jh + 4.0, jh, v)
    bot_e = sstep(ch - jh - 4.0, ch - jh, v)
    lft_e = sstep(jv + 4.0, jv, u)
    rgt_e = sstep(bl - jv - 4.0, bl - jv, u)
    # fora: a de baixo pega o ouro das nuvens, a de cima o frio do céu; dentro: a de cima clareia, a de baixo some
    col = mix(col, mix(col * 1.14, SKY * 0.55, 0.22 * out[..., None]), (top_e * 0.6)[..., None])
    col = mix(col, mix(col * 0.6, col * 0.78 + GOLD * 0.06, out[..., None]), (bot_e * 0.6)[..., None])
    col = mix(col, col * 1.1, (lft_e * 0.45)[..., None])
    col = mix(col, col * 0.74, (rgt_e * 0.5)[..., None])
    # a margem lavrada: a faixa lisa em volta da face (o miolo fica com a marca do cinzel)
    marg = np.maximum.reduce([sstep(jh + 7.0, jh + 5.0, v), sstep(T - jh - 7.0, T - jh - 5.0, v), sstep(jv + 7.0, jv + 5.0, u),
                              sstep(bl - jv - 7.0, bl - jv - 5.0, u)])
    tool = np.sin((xx * 0.8 + yy) * (2 * math.pi / 3.1)) * 0.5 + 0.5
    col *= (1 + (1 - marg) * (tool - 0.5) * 0.07 + marg * 0.035)[..., None]

    # ---- as juntas: as de nível chumbadas com bronze, as de prumo no escuro; os grampos ----
    hj = sstep(jh, jh - 1.2, v) + sstep(ch - jh, ch - jh + 1.2, v)
    hj = np.clip(hj, 0, 1)
    vj = np.clip(sstep(jv, jv - 1.0, u) + sstep(bl - jv, bl - jv + 1.0, u), 0, 1)
    # o bronze da junta: claro em cima (onde a luz pega a borda), escuro no fundo do vinco
    brz = mix(BR_M, BR_L, sstep(ch - jh, ch, v)[..., None] * 0.7 + sstep(jh, 0, v)[..., None] * 0.2)
    brz = mix(brz, BR_D, (sstep(0.55, 0.85, value_noise(H, W, 9 * S, frng, 2)) * 0.5)[..., None])
    # o azinhavre no bronze
    brz = mix(brz, VERD, (sstep(0.62, 0.86, value_noise(H, W, 6 * S, frng, 2)) * 0.6)[..., None])
    col = mix(col, brz, (hj * 0.92)[..., None])
    col = mix(col, GAP, (vj * (1 - hj) * 0.88)[..., None])
    # os grampos de bronze em cima das juntas de prumo (uma a cada três, mais ou menos)
    clamp = np.zeros((H, W), np.float32)
    has = frng.random(nb) < 0.34
    near = np.minimum(u, bl - u)
    cl = (near < 4.5) & has[bid] & (v > jh) & (v < jh + 4.2)
    clamp[cl] = 1.0
    clamp = ndi.gaussian_filter(clamp, 0.6)
    cc = mix(BR_M, BR_H, sstep(jh + 3.5, jh + 0.5, v)[..., None] * 0.6)
    col = mix(col, cc, (clamp * 0.95)[..., None])
    # o azinhavre escorrendo das juntas de bronze, descendo a face do bloco (só um véu)
    run = sstep(0.74, 0.9, stretched_noise(H, W, 1.8 * S, 34 * S, frng, 2)) * np.exp(-np.maximum(v - jh, 0) / (9 * S))
    col = mix(col, VERD * 0.7 + col * 0.3, (run * 0.35)[..., None])

    # ---- runas gravadas (apagadas): o sulco escuro, o lábio de baixo claro; umas com bronze no fundo ----
    rune = np.zeros((H, W), np.float32)
    lip = np.zeros((H, W), np.float32)
    inlay = np.zeros((H, W), np.float32)
    p = RUNES.get(room.name, 0.04)
    gi = 0
    for (b, x0, y0, x1, y1) in rects:
        if x1 - x0 < 1.9 * T or frng.random() > p:
            continue
        X0, X1 = int(x0) + 4, int(x1) - 4
        if X0 < 0 or X1 > W or y1 - y0 < T - 1:
            continue
        if not M[y0 + 3:y1 - 3, X0:X1].all():
            continue
        cx = int((x0 + x1) / 2)
        w, h = 16, 26
        gx0, gy0 = cx - w // 2, y0 + 3
        g = glyph_mask(int(frng.integers(len(STAVES))), w, h)
        gi += 1
        rune[gy0:gy0 + h, gx0:gx0 + w] = np.maximum(rune[gy0:gy0 + h, gx0:gx0 + w], g)
        sh = np.roll(g, 2, axis=0) * (1 - g)
        lip[gy0:gy0 + h, gx0:gx0 + w] = np.maximum(lip[gy0:gy0 + h, gx0:gx0 + w], sh)
        if frng.random() < 0.35:
            inlay[gy0:gy0 + h, gx0:gx0 + w] = np.maximum(inlay[gy0:gy0 + h, gx0:gx0 + w], g)
    col = mix(col, col * 1.25, (lip * 0.5)[..., None])
    col = mix(col, GAP * 1.4, (rune * 0.85)[..., None])
    col = mix(col, mix(BR_D, BR_M, 0.6), (inlay * 0.7)[..., None])

    # ---- as fachadas grandes (o tanque, a muralha do pátio, o tabuleiro da calha): as faixas de bronze a cada
    # oito fiadas, com rebites e a sombra embaixo, e as pilastras em relevo ----
    bigm = ((dleft + dright) > 9 * T) & ((dtop + dbot) > 7 * T) & M
    if bigm.any():
        bw = ndi.gaussian_filter(bigm.astype(np.float32), 0.6 * T)
        course = (yy // T).astype(np.int64)
        band = ((course % 8) == 7).astype(np.float32) * sstep(T - 6.0, T - 4.5, v)
        band += ((course % 8) == 0).astype(np.float32) * sstep(3.0, 1.5, v)
        band = np.clip(band, 0, 1) * bw
        bc = mix(BR_M, BR_L, sstep(T - 6, T, v)[..., None] * 0.8)
        bc = mix(bc, VERD, (sstep(0.6, 0.85, value_noise(H, W, 7 * S, frng, 2)) * 0.5)[..., None])
        col = mix(col, bc, (band * 0.95)[..., None])
        rv = band * sstep(2.0, 1.0, np.abs(((xx + 6) % (0.75 * T)) - 6))
        col = mix(col, BR_H, (rv * 0.7)[..., None])
        sh = ((course % 8) == 0).astype(np.float32) * sstep(1.5, 3.0, v) * sstep(9.0, 5.0, v) * bw
        col = mix(col, col * 0.62, (sh * 0.6)[..., None])
        # os painéis de runa: um rebaixo com moldura de bronze e uma runa grande gravada, aqui e ali
        prng = np.random.default_rng(SEEDS[room.name] + 55)
        pw, ph_ = 3 * T, 2 * T
        for gy0 in range(0, H - ph_, 6 * T):
            for gx0 in range(0, W - pw, 9 * T):
                if prng.random() > 0.3:
                    continue
                x0 = gx0 + int(prng.integers(0, 4)) * T
                y0 = gy0 + int(prng.integers(0, 3)) * T
                if x0 + pw > W or y0 + ph_ > H or not bigm[y0:y0 + ph_, x0:x0 + pw].all():
                    continue
                if not bigm[max(0, y0 - T):y0 + ph_ + T, max(0, x0 - T):x0 + pw + T].all():
                    continue
                by, bx = room.yy[y0:y0 + ph_, x0:x0 + pw] - y0, room.xx[y0:y0 + ph_, x0:x0 + pw] - x0
                frame = np.maximum.reduce([sstep(4.5, 3.0, by), sstep(ph_ - 4.5, ph_ - 3.0, by), sstep(4.5, 3.0, bx), sstep(pw - 4.5, pw - 3.0, bx)])
                inner = 1 - frame
                sub = col[y0:y0 + ph_, x0:x0 + pw]
                # o rebaixo: mais escuro, a sombra da moldura em cima e à esquerda
                sub = mix(sub, sub * 0.72, (inner * 0.8)[..., None])
                sub = mix(sub, sub * 0.55, (inner * (sstep(10, 4, by) + sstep(10, 4, bx)).clip(0, 1) * 0.6)[..., None])
                fc = mix(BR_M, BR_L, sstep(ph_, 0, by)[..., None] * 0.6)
                fc = mix(fc, VERD, (sstep(0.55, 0.8, value_noise(ph_, pw, 6 * S, prng, 2)) * 0.5)[..., None])
                sub = mix(sub, fc, (frame * 0.95)[..., None])
                g = glyph_mask(int(prng.integers(len(STAVES))), 26, 46, lw=3.0)
                gy, gx = (ph_ - 46) // 2, (pw - 26) // 2
                gg = np.zeros((ph_, pw), np.float32)
                gg[gy:gy + 46, gx:gx + 26] = g
                lipp = np.roll(gg, 2, axis=0) * (1 - gg)
                sub = mix(sub, sub * 1.3, (lipp * 0.5)[..., None])
                sub = mix(sub, mix(BR_D, BR_M, 0.5), (gg * 0.85)[..., None])
                col[y0:y0 + ph_, x0:x0 + pw] = sub
                hj[y0:y0 + ph_, x0:x0 + pw] = np.maximum(hj[y0:y0 + ph_, x0:x0 + pw], np.maximum(frame, gg))

    # ---- a quebra: pedra nova, clara e áspera, e os grampos tortos ----
    if brk.max() > 0:
        rough = value_noise(H, W, 2.2 * S, frng, 2)
        fc = FRESH * (0.8 + 0.6 * rough)[..., None]
        near_f = np.clip(brk * 2.0, 0, 1) * sstep(7 * S, 0, np.minimum(np.minimum(dleft, dright), dtop))
        col = mix(col, fc, (near_f * 0.9)[..., None])
        col = mix(col, col * 0.45, (near_f * sstep(0.55, 0.68, rough) * 0.6)[..., None])
        # as trincas que saem da quebra para dentro da pedra
        cr = sstep(0.9, 0.97, stretched_noise(H, W, 1.2 * S, 6 * S, frng, 2)) * np.clip(brk * 2.0, 0, 1)
        col = mix(col, GAP, (cr * 0.7)[..., None])

    # ---- o mancal (a coluna do meio das Engrenagens): a pedra lisa com as placas de bronze dos eixos ----
    pier = mat == 2
    if pier.any():
        x0, x1 = 33 * T, 39 * T
        cx = (x0 + x1) / 2
        r = 0
        y = GEARS['y'] * 16.0
        centers = []
        for i, n in enumerate(GEARS['teeth']):
            if i:
                m = GEARS['teeth'][i - 1]
                y += (m + n) * TOOTH / (2 * math.pi)
            centers.append(y * S)
        hub = np.zeros((H, W), np.float32)
        ring = np.zeros((H, W), np.float32)
        for cy in centers:
            dd = np.hypot(xx - cx, yy - cy)
            hub = np.maximum(hub, sstep(14 * S, 13 * S, dd))
            ring = np.maximum(ring, sstep(15.5 * S, 14.5 * S, dd) * sstep(12.5 * S, 13.5 * S, dd))
            # os parafusos em volta da placa
            for k in range(8):
                a = k * math.pi / 4 + math.pi / 8
                bx, by = cx + math.cos(a) * 11 * S, cy + math.sin(a) * 11 * S
                ring = np.maximum(ring, sstep(1.6 * S, 1.0 * S, np.hypot(xx - bx, yy - by)))
        lit = sstep(0, 1, -((xx - cx) + (yy % 1)) / (14 * S) * 0.5 + 0.5)
        hc = mix(BR_D, BR_L, lit[..., None])
        hc = mix(hc, BR_H, (sstep(0.9, 1.0, lit) * 0.5)[..., None])
        hc = mix(hc, VERD, (sstep(0.6, 0.85, value_noise(H, W, 5 * S, frng, 2)) * 0.45)[..., None])
        col = np.where((pier & (hub > 0.01))[..., None], mix(col, hc, hub[..., None]), col)
        col = mix(col, BR_D * 0.7, (ring * pier * 0.9)[..., None])
        # o eixo no meio da placa: o furo escuro com a ponta polida
        for cy in centers:
            dd = np.hypot(xx - cx, yy - cy)
            col = mix(col, GAP, (sstep(4.5 * S, 3.8 * S, dd) * pier)[..., None])
            col = mix(col, BR_H, (sstep(2.4 * S, 1.6 * S, np.hypot(xx - cx + 0.8 * S, yy - cy + 0.8 * S)) * pier * 0.8)[..., None])

    # ---- o cano de bronze ('+'): cilindro em pé, com os colares e as abraçadeiras ----
    pipe = mat == 1
    if pipe.any():
        cell_x = (xx // T) * T
        uu = (xx - cell_x) / T
        n = (uu - 0.5) / 0.41
        body = sstep(1.0, 0.92, np.abs(n))
        lam = np.clip(np.sqrt(np.clip(1 - n * n, 0, 1)) * 0.75 - n * 0.35, 0, 1)
        pc = mix(BR_D, BR_M, sstep(0.05, 0.6, lam)[..., None])
        pc = mix(pc, BR_L, sstep(0.55, 0.95, lam)[..., None])
        pc = mix(pc, BR_H, (sstep(0.9, 1.0, lam) * 0.6)[..., None])
        # o lado da direita devolve o ouro das nuvens
        pc = mix(pc, GOLD * 0.8, (sstep(0.35, 0.95, n) * 0.35 * out)[..., None])
        streak = stretched_noise(H, W, 2.0 * S, 40 * S, frng, 2)
        pc = mix(pc, VERD, (sstep(0.6, 0.85, streak) * 0.55)[..., None])
        pc = mix(pc, VERD_L, (sstep(0.85, 0.95, streak) * 0.3)[..., None])
        # os colares (a cada três tiles) e as abraçadeiras com os parafusos
        yc = yy % (3 * T)
        collar = sstep(5.5, 4.0, np.abs(yc - 1.5 * T))
        pc = mix(pc, mix(BR_D, BR_L, lam[..., None] * 0.9 + 0.1), (collar * 0.95)[..., None])
        bolt = collar * (sstep(2.2, 1.2, np.abs(uu * T - 0.18 * T)) + sstep(2.2, 1.2, np.abs(uu * T - 0.82 * T)))
        pc = mix(pc, BR_H, (np.clip(bolt, 0, 1) * 0.8)[..., None])
        # atrás do cano, a pedra (o cano é mais fino que o tile)
        col = np.where(pipe[..., None], mix(col * 0.55, pc, np.maximum(body, collar)[..., None]), col)

    # ---- luz ----
    dt = d / T
    k = np.maximum(0.4 + 0.08 * value_noise(H, W, 220, frng, 2), 1 - np.maximum(0, dt - 0.6) * 0.24)
    col = mix(DEEP, col, k[..., None])
    tint = np.array(TINT.get(room.name, (1.0, 1.0, 1.0)), np.float32)
    col = mix(col * tint, col, out[..., None])
    # o topo gasto de quem se pisa: mais claro e liso, a luz do céu (fora) ou da sala (dentro)
    worn = np.exp(-dtop / (1.8 * S)) * M
    col = mix(col, mix(col * 1.5 + 0.03, SKY * 0.7, 0.35 * out[..., None]), (worn * 0.7)[..., None])
    col = mix(col, col * 0.7, (sstep(2.5 * S, 3.5 * S, dtop) * sstep(5 * S, 3.5 * S, dtop) * 0.35)[..., None])
    # fora: a borda de baixo pega o ouro, os lados também (mais perto das nuvens, mais); a névoa dourada sobe
    col = mix(col, col * np.array([1.2, 1.03, 0.84], np.float32), (low * 0.6 * out)[..., None])
    under = np.exp(-dbot / (4.0 * S)) * (0.55 + 0.45 * low)
    col = mix(col, mix(col, GOLD, 0.65) * 1.15, (under * out)[..., None])
    side = np.exp(-np.minimum(dleft, dright) / (3.0 * S)) * (0.18 + 0.6 * low ** 1.3)
    col = mix(col, mix(col, GOLD, 0.5), (side * out)[..., None])
    if room.name in CLOUDS:
        haze = sstep(0.5, 1.0, low) ** 1.4 * 0.62
        col = mix(col, HAZE, (haze * out)[..., None])
    # os escorridos: a umidade das nuvens desce das bordas de cima e das juntas, escurecendo a face
    st = sstep(0.6, 0.86, stretched_noise(H, W, 2.2 * S, 70 * S, frng, 2)) * np.exp(-dtop / (7 * T))
    col = mix(col, col * 0.7, (st * (0.25 + 0.2 * out))[..., None])
    # dentro: a borda de baixo some no escuro, a da direita também
    col = mix(col, col * 0.55, (np.exp(-dbot / (3.0 * S)) * 0.45 * (1 - out))[..., None])
    col = mix(col, col * 0.75, (np.exp(-dright / (2.6 * S)) * 0.3 * (1 - out))[..., None])
    col = mix(col, col * 1.12, (np.exp(-dleft / (2.4 * S)) * 0.3 * (1 - out))[..., None])

    # ---- água: a pedra molhada embaixo da linha d'água, a linha de calcário em cima dela ----
    if water.any():
        wet = sstep(0.8 * T, 0.05 * T, dw) * M
        col = mix(col, col * WET, (wet * 0.7)[..., None])
        line = sstep(0.18 * T, 0.0, np.abs(dw - 0.12 * T)) * M * (yy < (yy * 0 + H))
        col = mix(col, LIME, (line * 0.25)[..., None])
    # a Torre das Engrenagens: os escorridos escuros da água e do vapor
    if room.name == 'engrenagens':
        st = sstep(0.7, 0.88, stretched_noise(H, W, 2.4 * S, 60 * S, frng, 2))
        col = mix(col, col * 0.62, (st * 0.5)[..., None])
        film = sstep(0.88, 0.96, stretched_noise(H, W, 1.2 * S, 90 * S, frng, 1)) * st
        col = mix(col, hexc(0x8fa2ac), (film * 0.25)[..., None])
    col = np.clip(col, 0, 1)

    mask = M.astype(np.float32)
    L = Layer(W, H)
    L.fill(col, mask)
    # pinceladas curtas deitadas nas fiadas (no cano, em pé); as juntas e as runas ficam limpas
    flow = np.where(pipe, math.pi / 2, (value_noise(H, W, 40, frng, 2) - 0.5) * 0.25).astype(np.float32)
    keep = 1 - np.maximum.reduce([hj * 0.95, vj * 0.9, rune, clamp, worn * 0.6])
    passes = [
        dict(size=8, spacing=0.95, length=(1.8, 3.6), err=0.0, alpha=0.55, bristle=0.55, dry=0.45, blur=0.12, taper=0.35, ang_jitter=0.1),
        dict(size=4, spacing=1.0, length=(1.6, 3.2), err=0.0, alpha=0.55, bristle=0.5, dry=0.4, blur=0.05, taper=0.4, ang_jitter=0.14),
    ]
    paint(L, col, mask * keep, flow, rng, passes, val_jitter=0.09, jitter=0.01, clip_soft=0, base=0.0)
    breaks_bronze(L, room)
    oneways(L, room, out)
    F = dict(d=d, dtop=dtop, dbot=dbot, dleft=dleft, dright=dright, out=out, low=low, mat=mat)
    return L, M, F


def breaks_bronze(L, room):
    """Os grampos de bronze que seguravam o pedaço que caiu: saem tortos da face da quebra."""
    rng = np.random.default_rng(SEEDS[room.name] + 13)
    for (x0, y0, x1, y1, side) in BROKEN.get(room.name, []):
        X0, Y0, X1, Y1 = x0 * T, y0 * T, (x1 + 1) * T, (y1 + 1) * T
        if side in ('left', 'right'):
            ys = np.arange(Y0 + 0.5 * T, Y1, T)
            for yc in ys:
                if rng.random() < 0.35:
                    continue
                d = 1 if side == 'right' else -1
                xb = (X1 - 0.3 * T) if side == 'right' else (X0 + 0.3 * T)
                # só onde ainda tem pedra para segurar o grampo
                if not solid_at(room, int(xb // T), int(yc // T)):
                    continue
                ln = rng.uniform(0.25, 0.45) * T
                bend = rng.uniform(-0.5, 0.6)
                pts = [(xb, yc), (xb + d * ln * 0.6, yc + bend * 4), (xb + d * ln, yc + bend * 12 + 5)]
                for (a, b) in zip(pts[:-1], pts[1:]):
                    n = 8
                    for i in range(n + 1):
                        t = i / n
                        L.dab(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 1.3 * S, mix(BR_M, BR_L, 0.4 + 0.3 * (1 - t)), 1.0, 0.5)
                L.dab(pts[-1][0], pts[-1][1], 0.9 * S, BR_H, 0.9, 0.5)
        else:
            xs = np.arange(X0 + 0.4 * T, X1, 0.9 * T)
            for xc in xs:
                if rng.random() < 0.4:
                    continue
                ln = rng.uniform(0.2, 0.4) * T
                lean = rng.uniform(-0.6, 0.6)
                pts = [(xc, Y0 + 0.25 * T), (xc + lean * 5, Y0 + 0.25 * T - ln * 0.6), (xc + lean * 14, Y0 + 0.25 * T - ln)]
                for (a, b) in zip(pts[:-1], pts[1:]):
                    n = 8
                    for i in range(n + 1):
                        t = i / n
                        L.dab(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 1.3 * S, mix(BR_M, BR_L, 0.5), 1.0, 0.5)


# ======================================================================================
# sacadas e degraus ('-')
# ======================================================================================
def solid_at(room, x, y):
    return 0 <= y < room.h and 0 <= x < room.w and room.g[y, x] in SOLID


def oneways(L, room, out):
    """As sacadas de pedra (na calha, com a mísula embaixo) e os degraus de ferro (no pátio, com a
    mão-francesa chumbada na pedra). O topo é o topo da física."""
    rng = np.random.default_rng(SEEDS[room.name] + 31)
    iron = room.name == 'patio'
    for (x0, x1, row) in spans(room, '-'):
        left = solid_at(room, x0 - 1, row)
        right = solid_at(room, x1 + 1, row)
        xa, xb = x0 * T, (x1 + 1) * T
        y = row * T
        th = (PLANK_H + 1) * S
        b = Box(xa - (4 if left else 0), y, xb + (4 if right else 0), y + th)
        o = out[min(room.H - 1, int(y)), min(room.W - 1, int((xa + xb) / 2))]
        if iron:
            c = mix(IRON_L, IRON_M, sstep(y, y + 3 * S, b.yy)[..., None])
            c = mix(c, IRON_D, sstep(y + th - 3 * S, y + th, b.yy)[..., None])
            # o ouro das nuvens na borda de baixo
            c = mix(c, GOLD * 0.7, (sstep(y + th - 2.5 * S, y + th, b.yy) * 0.45 * o)[..., None])
            c *= (0.9 + 0.2 * stretched_noise(b.h, b.w, 6 * S, 1.2 * S, rng))[..., None]
            b.put(L, np.clip(c, 0, 1), np.ones((b.h, b.w), np.float32))
            # os rebites
            for rx in np.arange(xa + 0.25 * T, xb - 0.1 * T, 0.5 * T):
                L.dab(rx, y + th * 0.5, 1.1 * S, IRON_L * 1.3, 0.9, 0.6)
            # a mão-francesa: a barra inclinada da ponta de fora até a pedra
            wall_x = xa if left else xb
            tip_x = xb - 0.15 * T if left else xa + 0.15 * T
            drop = 0.95 * T
            pts = [(tip_x, y + th - 1), (wall_x, y + th + drop)]
            bb = Box(min(wall_x, tip_x) - 6, y + th - 4, max(wall_x, tip_x) + 6, y + th + drop + 6)
            a = bb.line(pts, 2.6 * S)
            cc = mix(IRON_M, IRON_D, 0.4) * np.ones((bb.h, bb.w, 3), np.float32)
            bb.put(L, cc, a)
            L.dab(wall_x + (3 if left else -3), y + th + drop, 2.0 * S, IRON_M, 1.0, 0.6)
        else:
            # a laje de pedra com a aresta da frente gasta e o ouro embaixo
            c = mix(STONES[2] * 1.25, STONES[0], sstep(y, y + 3 * S, b.yy)[..., None])
            c = mix(c, STONES[3] * 0.7, sstep(y + th - 4 * S, y + th, b.yy)[..., None])
            c = mix(c, mix(c, GOLD, 0.5), (sstep(y + th - 3 * S, y + th, b.yy) * 0.6 * o)[..., None])
            c *= (0.9 + 0.2 * value_noise(b.h, b.w, 3 * S, rng, 2))[..., None]
            # a junta de bronze entre a laje e a parede
            b.put(L, np.clip(c, 0, 1), np.ones((b.h, b.w), np.float32))
            # a mísula: o bloco em cunha embaixo, da parede até perto da ponta
            wall_x = xa if left else xb
            reach = (xb - xa) * 0.72
            tip_x = wall_x + reach if left else wall_x - reach
            depth = 1.1 * T
            pts = [(wall_x, y + th), (tip_x, y + th), (wall_x, y + th + depth)]
            bb = Box(min(wall_x, tip_x) - 2, y + th - 1, max(wall_x, tip_x) + 2, y + th + depth + 2)
            a = bb.poly(pts)
            v = (bb.yy - y - th) / depth
            cc = mix(STONES[0] * 1.05, STONES[3] * 0.6, sstep(0.0, 1.0, v)[..., None])
            cc = mix(cc, mix(cc, GOLD, 0.45), (sstep(0.4, 1.0, v) * 0.5 * o)[..., None])
            cc *= (0.9 + 0.2 * value_noise(bb.h, bb.w, 3 * S, rng, 2))[..., None]
            bb.put(L, np.clip(cc, 0, 1), a)


# ======================================================================================
# o Arquivo: a estante falsa (o véu)
# ======================================================================================
def shelf_veil(room, out):
    """A estante falsa do Arquivo e o esconderijo atrás dela: pintados com as mesmas pedras da sala, a
    estante por cima; o véu cobre a passagem e some aos poucos em volta."""
    groups = breakables(room.rows)
    if not groups:
        return
    extra = np.zeros((room.h, room.w), bool)
    for g in groups:
        for x, y in g['cells']:
            extra[y, x] = True
        for x, y in g['veil']:
            extra[y, x] = True
    full = Room(room.name, room.rows, seed=SEEDS[room.name])
    FL, FM, _ = terrain(full, extra=extra)
    rng = np.random.default_rng(SEEDS[room.name] + 91)
    for g in groups:
        xs = [c[0] for c in g['cells']]
        ys = [c[1] for c in g['cells']]
        bookcase(FL, min(xs) * T, min(ys) * T, (max(xs) + 1) * T, (max(ys) + 1) * T, rng)
    M = room.px(np.isin(room.g, list(SOLID)))
    sec = room.px(extra)
    holes = FM & ~M
    zone = ndi.binary_dilation(sec | holes, iterations=4)
    dist = ndi.distance_transform_edt(~sec)
    ramp = np.clip(1 - (dist - 6) / 50, 0, 1)
    a = np.maximum(zone.astype(np.float32), ramp ** 1.5) * FL.A
    SL = Layer(room.W, room.H)
    SL.P[:] = FL.color() * a[..., None]
    SL.A[:] = a
    SL.image().save(f'{out}/terreno-{room.name}-secret-2x.png')
    downsample_soft(SL, room).save(f'{out}/terreno-{room.name}-secret.png')
    print('véu', room.name, len(groups), flush=True)


WOOD_D, WOOD_M, WOOD_L = hexc(0x23160e), hexc(0x4a3020), hexc(0x7a5636)
SPINES = [hexc(0x5a2a20), hexc(0x2f3a4a), hexc(0x4a4226), hexc(0x3a2a3e), hexc(0x6a5a3a), hexc(0x2a3a2e)]
AMBER = hexc(0xffb04a)


def bookcase(L, x0, y0, x1, y1, rng):
    """Uma estante de madeira escura de cima a baixo: as tábuas, os livros, as fichas e um frasco apagado."""
    b = Box(x0, y0, x1, y1)
    c = mix(WOOD_M, WOOD_D, sstep(x0, x1, b.xx)[..., None] * 0.6)
    c *= (0.85 + 0.3 * stretched_noise(b.h, b.w, 1.5 * S, 20 * S, rng))[..., None]
    b.put(L, np.clip(c, 0, 1), np.ones((b.h, b.w), np.float32))
    sh = 0.62 * T
    y = y0 + 0.18 * T
    while y + sh < y1 - 0.1 * T:
        # o vão da prateleira (escuro) e o que tem nele
        g = Box(x0 + 3 * S, y, x1 - 3 * S, y + sh - 2 * S)
        g.put(L, np.ones((g.h, g.w, 3), np.float32) * hexc(0x0e0a08), np.ones((g.h, g.w), np.float32))
        x = x0 + 3.5 * S
        while x < x1 - 4 * S:
            if rng.random() < 0.15:
                # um frasco de Âmbar apagado
                r = 3.4 * S
                L.dab(x + r, y + sh - 2 * S - r, r, mix(AMBER, hexc(0x3a2412), 0.65), 0.95, 0.8)
                L.dab(x + r * 0.7, y + sh - 2 * S - r * 1.3, r * 0.35, AMBER * 0.7, 0.8, 0.6)
                x += 2 * r + 1.5 * S
                continue
            w = rng.uniform(2.2, 3.6) * S
            h = rng.uniform(0.6, 0.95) * (sh - 3 * S)
            bk = Box(x, y + sh - 2 * S - h, x + w, y + sh - 2 * S)
            cc = SPINES[rng.integers(len(SPINES))] * rng.uniform(0.75, 1.15)
            cc = cc * (0.85 + 0.25 * sstep(x, x + w, bk.xx)[..., None] * 0 + 0.2 * (1 - sstep(x, x + w, bk.xx))[..., None])
            bk.put(L, np.clip(cc, 0, 1), np.ones((bk.h, bk.w), np.float32))
            # a faixa dourada da lombada
            if rng.random() < 0.6:
                fy = y + sh - 2 * S - h * rng.uniform(0.6, 0.8)
                f = Box(x, fy, x + w, fy + 1.2 * S)
                f.put(L, np.ones((f.h, f.w, 3), np.float32) * BR_L * 0.8, np.ones((f.h, f.w), np.float32) * 0.8)
            x += w + rng.uniform(0.2, 0.8) * S
        # a tábua da prateleira com a borda clara
        t = Box(x0, y + sh - 2 * S, x1, y + sh)
        tc = mix(WOOD_L, WOOD_M, sstep(y + sh - 2 * S, y + sh, t.yy)[..., None])
        t.put(L, np.clip(tc, 0, 1), np.ones((t.h, t.w), np.float32))
        y += sh


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    name = args[0]
    out = args[1] if len(args) > 1 else os.path.join(HERE, 'hd_torres')
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    room = Room(name, terreno.load_maps()[name], seed=SEEDS[name])
    L, M, F = terrain(room)
    L.image().save(f'{out}/terreno-{name}-2x.png')
    downsample(L, M, room).save(f'{out}/terreno-{name}.png')
    print('terreno', name, round(time.time() - t0, 1), 's', flush=True)
    if name == 'arquivo':
        shelf_veil(room, out)
        print('véu', name, round(time.time() - t0, 1), 's', flush=True)

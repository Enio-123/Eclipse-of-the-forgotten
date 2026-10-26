"""Floresta Nevada (capítulo 5): o terreno pintado das seis salas e a camada dos pinheiros, já no EXTREME.

Terreno: granito azulado com a terra congelada por baixo da neve. Todo chão a céu aberto leva uma
camada grossa de neve (embaixo de pedra, de telhado ou dentro da cabana, não). As paredes da serra
('+') são gelo liso, água que escorreu pela pedra e congelou; o lago ('_') é uma laje de gelo com
bolhas presas. Os espinhos ('^') viram estacas de caça afiadas, no fundo das covas. Na cabana o
telhado é de tábuas com neve, as paredes dos lados mostram a ponta dos troncos (a casa está em corte),
a chaminé é de pedra e o chão de dentro é de tábuas.

Pinheiros (pinhos-<sala>, atrás do cavaleiro): os troncos ('T') do chão até o alto, a copa lá em cima,
os galhos de verdade ('-') saindo do tronco com neve por cima (o topo da neve é o topo da física), a
árvore seca ('s'), os pinheiros novos ('t'), a espera de caça do pinhal (tablado em quatro pernas, com
escada), os pingentes de gelo embaixo das bordas, as pessoas paradas embaixo do gelo do lago, a boca
da mina com o madeiramento e a fogueira, a cabana por dentro e o abrigo do caçador na clareira.

uso: python3 floresta.py <sala> [pasta] [--maps=arquivo.ts] [--only=terreno|pinhos]
Sai <pasta>/terreno-<sala>-2x.png e terreno-<sala>.png (1x, alfa exato da física), pinhos-<sala>-2x.png
e pinhos-<sala>.png (1x, alfa suave).
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from brush import Layer, hexc, mix, sstep, blur, value_noise, paint
from shapes import Mask
import terreno
from terreno import Room, fields, downsample, TILE, S, T, PLANK_H

HERE = os.path.dirname(os.path.abspath(__file__))
MAPS = next((a[7:] for a in sys.argv if a.startswith('--maps=')), None)
if MAPS:
    terreno.MAPS = MAPS
ONLY = next((a[7:] for a in sys.argv if a.startswith('--only=')), None)

SEEDS = {'encosta': 61, 'pinhal': 63, 'lago': 65, 'cabana': 67, 'serra': 69, 'clareira': 71}
# trechos que são túnel (a parede do fundo é pedra mesmo onde o ar vê o céu de lado): x0, y0, x1, y1 em tiles
CAVES = {'encosta': [(0, 24, 13, 29)]}
SOLID = '#+_'

# neve: luz, meio, sombra e a sombra funda embaixo da borda
SNOW_L, SNOW_M, SNOW_S, SNOW_D = hexc(0xf6f9fd), hexc(0xdde8f3), hexc(0xa9bfd6), hexc(0x6f88a6)
SPARK = hexc(0xffffff)
# granito frio (azul, ardósia, cinza) e o fundo escuro da pedra
ROCKS = [hexc(0x343c4b), hexc(0x2b3240), hexc(0x3c4352), hexc(0x283039), hexc(0x42454f)]
ROCK_D = hexc(0x0a0d13)
# o fundo da pedra longe da superfície: azul bem escuro (não preto, a floresta é clara)
ROCK_DEEP = hexc(0x161c27)
EARTH = [hexc(0x2f2724), hexc(0x3b302a), hexc(0x272020)]
LICHEN = hexc(0x8d9b88)
FROST = hexc(0xcfe0f0)
ICE_L, ICE_M, ICE_D, ICE_DD = hexc(0xeaf5fc), hexc(0xa3c5df), hexc(0x56809f), hexc(0x2e4c68)
WOOD_D, WOOD_M, WOOD_L = hexc(0x241912), hexc(0x463222), hexc(0x765638)
FACE_L, FACE_M = hexc(0xc49a6c), hexc(0x9a7450)
STONE = [hexc(0x5e5a58), hexc(0x6f6964), hexc(0x534f50), hexc(0x77716a)]
MORTAR = hexc(0x2b2826)
BARK_D, BARK_M, BARK_L = hexc(0x1f1815), hexc(0x3b2e27), hexc(0x6a5a4d)
DEAD_D, DEAD_M, DEAD_L = hexc(0x3a3836), hexc(0x6e6a64), hexc(0xa49f96)
NEEDLE_D, NEEDLE_M, NEEDLE_L = hexc(0x13211f), hexc(0x213634), hexc(0x3a5450)
WARM = hexc(0xffa556)


# ======================================================================================
# utilidades
# ======================================================================================
def comp(L, x0, y0, rgb, a):
    """Compõe uma cor (h x w x 3 ou 3) com alfa (h x w) na camada, no canto (x0, y0), cortando nas bordas."""
    h, w = a.shape
    X0, Y0 = max(0, x0), max(0, y0)
    X1, Y1 = min(L.W, x0 + w), min(L.H, y0 + h)
    if X0 >= X1 or Y0 >= Y1:
        return
    a = a[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
    if np.ndim(rgb) == 3:
        rgb = rgb[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
    P = L.P[Y0:Y1, X0:X1]
    A = L.A[Y0:Y1, X0:X1]
    a3 = a[..., None]
    P *= 1 - a3
    P += rgb * a3
    A *= 1 - a
    A += a


class Box:
    """Janela local da tela (para desenhar uma forma sem criar uma máscara do tamanho da sala)."""

    def __init__(self, x0, y0, x1, y1):
        self.x0, self.y0 = int(math.floor(x0)), int(math.floor(y0))
        self.w = max(1, int(math.ceil(x1)) - self.x0)
        self.h = max(1, int(math.ceil(y1)) - self.y0)
        yy, xx = np.mgrid[0:self.h, 0:self.w].astype(np.float32)
        self.yy = yy + self.y0
        self.xx = xx + self.x0

    def mask(self):
        return Mask(self.w, self.h)

    def poly(self, pts):
        return self.mask().poly([(x - self.x0, y - self.y0) for x, y in pts]).array()

    def ellipse(self, cx, cy, rx, ry):
        return self.mask().ellipse(cx - self.x0, cy - self.y0, rx, ry).array()

    def line(self, pts, w):
        return self.mask().line([(x - self.x0, y - self.y0) for x, y in pts], w).array()

    def put(self, L, rgb, a):
        comp(L, self.x0, self.y0, rgb, a)


def chip(room, M, sol, top_max=2.0, bot_max=6.0):
    """Lasca os cantos expostos (como terreno.chip_corners, mas com o sólido que a floresta usa)."""
    h, w = sol.shape
    rng = room.rng

    def s(x, y):
        return True if (x < 0 or x >= w or y < 0 or y >= h) else bool(sol[y, x])

    for y in range(h):
        for x in range(w):
            if not sol[y, x] or room.g[y, x] in '_+':
                continue
            for (dx, dy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
                if s(x + dx, y) or s(x, y + dy):
                    continue
                top = dy < 0
                r = rng.uniform(0.6, top_max if top else bot_max) * S
                if rng.random() < 0.25:
                    continue
                cx = (x + (1 if dx > 0 else 0)) * T
                cy = (y + (1 if dy > 0 else 0)) * T
                x0, x1 = int(cx - r) if dx > 0 else int(cx), int(cx) if dx > 0 else int(cx + r)
                y0, y1 = int(cy - r) if dy > 0 else int(cy), int(cy) if dy > 0 else int(cy + r)
                ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1]
                d = np.abs(xs + 0.5 - cx) + np.abs(ys + 0.5 - cy)
                cut = d < r * rng.uniform(0.8, 1.2)
                ys, xs = ys[cut], xs[cut]
                ok = (ys >= 0) & (ys < M.shape[0]) & (xs >= 0) & (xs < M.shape[1])
                M[ys[ok], xs[ok]] = False
    return M


def exposure(M, angles=(-0.42, -0.2, 0.0, 0.22), edge=False):
    """Quanto de céu cada pixel vê por cima (0..1), em raios inclinados (a neve vem com o vento da esquerda).
    edge: fora da sala continua o que está na borda (a pedra da borda segue, o túnel que sai da sala também)."""
    H, W = M.shape
    out = np.zeros((H, W), np.float32)
    ys = np.arange(H)
    for a in angles:
        sh = np.round(ys * math.tan(a)).astype(np.int64)
        pad = int(np.abs(sh).max()) + 1
        P = np.zeros((H, W + 2 * pad), bool)
        for y in range(H):
            o = pad - sh[y]
            P[y, o:o + W] = M[y]
            if edge:
                P[y, :o] = M[y, 0]
                P[y, o + W:] = M[y, -1]
        cov = np.maximum.accumulate(P, axis=0)
        cov = np.vstack([np.zeros((1, P.shape[1]), bool), cov[:-1]])
        back = np.empty((H, W), bool)
        for y in range(H):
            back[y] = cov[y, pad - sh[y]:pad - sh[y] + W]
        out += ~back
    return out / len(angles)


def stretched_noise(H, W, cx, cy, rng, octaves=2):
    """Ruído esticado: células de cx por cy pixels (fibras da madeira, escorridos do gelo)."""
    h = max(4, int(H / cy * 8) + 2)
    w = max(4, int(W / cx * 8) + 2)
    base = value_noise(h, w, 8, rng, octaves)
    return ndi.zoom(base, (H / h, W / w), order=1)[:H, :W].astype(np.float32)


def spans(room, ch):
    out = []
    for y in range(room.h):
        x = 0
        row = room.g[y]
        while x < room.w:
            if row[x] == ch:
                x0 = x
                while x < room.w and row[x] == ch:
                    x += 1
                out.append((x0, x - 1, y))
            else:
                x += 1
    return out


def ground_row(room, tx, ty):
    """Primeira linha sólida embaixo de (tx, ty)."""
    for y in range(ty, room.h):
        if room.g[y, tx] in SOLID:
            return y
    return room.h


# ======================================================================================
# terreno
# ======================================================================================
def materials(room):
    """Material de cada célula: 0 pedra, 1 parede de gelo, 2 gelo do lago, 3 telhado, 4 troncos da parede,
    5 pedra da chaminé, 6 assoalho."""
    g = room.g
    mat = np.zeros(g.shape, np.int8)
    mat[g == '+'] = 1
    mat[g == '_'] = 2
    if room.name == 'cabana':
        for y in range(11, 21):
            for x in range(24, 62):
                if g[y, x] == '#':
                    mat[y, x] = 3
        for y in range(11, 16):
            for x in (50, 51):
                if g[y, x] == '#':
                    mat[y, x] = 5
        for y in range(21, 26):
            for x in (29, 55):
                if g[y, x] == '#':
                    mat[y, x] = 4
        for x in range(30, 55):
            mat[29, x] = 6
    return mat


def joints(H, W, rng, cell, width, squash=1.4, show=(0.42, 0.62), amp=0.0):
    from scipy.spatial import cKDTree
    gx, gy = int(W / cell) + 3, int(H / cell * squash) + 3
    g = np.stack(np.meshgrid(np.arange(gx), np.arange(gy)), -1).reshape(-1, 2).astype(np.float64)
    pts = (g + rng.uniform(0.08, 0.92, g.shape) - 1) * cell
    tree = cKDTree(pts)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    if amp:
        xx = xx + (value_noise(H, W, cell * 0.35, rng, 2) - 0.5) * amp
        yy = yy + (value_noise(H, W, cell * 0.35, rng, 2) - 0.5) * amp
    q = np.stack([xx.ravel(), (yy * squash).ravel()], 1)
    dd, idx = tree.query(q, k=2, workers=-1)
    edge = ((dd[:, 1] - dd[:, 0]) * 0.5).reshape(H, W).astype(np.float32)
    vis = sstep(show[0], show[1], value_noise(H, W, cell * 1.3, rng, 2))
    return sstep(width, width * 0.3, edge) * vis, idx[:, 0].reshape(H, W)


def terrain(room):
    rng = room.rng
    H, W = room.H, room.W
    yy, xx = room.yy, room.xx
    sol = np.isin(room.g, list(SOLID))
    M = room.px(sol)
    M = chip(room, M, sol, top_max=2.5, bot_max=7.0)
    d, dtop, dbot, dleft, dright = fields(M)
    mat = np.kron(materials(room), np.ones((T, T), np.int8))

    # ---- granito: blocos grandes partidos por juntas, lascas, líquen e geada nas faces ----
    warp = (value_noise(H, W, 150, rng, 2) - 0.5) * 70 * S
    yb = yy + warp + xx * rng.uniform(-0.05, 0.05)
    band = np.floor(yb / (rng.uniform(22, 34) * S)).astype(np.int64)
    band -= band.min()
    nb = int(band.max()) + 1
    kind = rng.choice(len(ROCKS), nb, p=[0.28, 0.24, 0.2, 0.16, 0.12])
    col = np.array(ROCKS, np.float32)[kind][band]
    col *= (1 + 0.12 * np.clip(rng.normal(0, 1, nb), -2, 2)).astype(np.float32)[band][..., None]
    big, cell_id = joints(H, W, rng, 46 * S, 1.1 * S, squash=1.25, show=(0.3, 0.5), amp=4 * S)
    small, _ = joints(H, W, rng, 18 * S, 0.55 * S, squash=1.1, show=(0.58, 0.74), amp=3 * S)
    # cada bloco com o seu tom (o granito não é liso)
    tone = (1 + 0.1 * rng.normal(0, 1, int(cell_id.max()) + 1)).astype(np.float32)
    col *= tone[cell_id][..., None]
    grain = value_noise(H, W, 4, rng, 2)
    col *= (1 + (grain - 0.5) * 0.34)[..., None]
    specks = value_noise(H, W, 2.5, rng, 1)
    col = mix(col, col * 1.45, (sstep(0.8, 0.88, specks) * 0.5)[..., None])  # feldspato claro
    col = mix(col, col * 0.55, (sstep(0.8, 0.9, 1 - specks) * 0.45)[..., None])  # mica escura
    cracks = np.maximum(big, small * 0.55)
    lit_edge = np.roll(cracks, 2 * S, axis=0) * (1 - cracks)
    col = mix(col, col * 1.28, (lit_edge * 0.45)[..., None])
    col = mix(col, ROCK_D, (cracks * 0.85)[..., None])
    # o miolo afunda no escuro, mas a pedra continua lá
    dt = d / T
    k = np.maximum(0.4 + 0.1 * value_noise(H, W, 200, rng, 2), 1 - np.maximum(0, dt - 0.5) * 0.3)
    col = mix(ROCK_DEEP, col, k[..., None])
    # geada nas faces de lado e embaixo das bordas (o frio sobe da neve)
    side = np.exp(-np.minimum(dleft, dright) / (2.2 * S)) * M
    col = mix(col, FROST * 0.7 + col * 0.3, (side * 0.32)[..., None])
    under = np.exp(-dbot / (2.5 * S)) * M
    col = mix(col, ICE_D, (under * 0.35)[..., None])
    # líquen claro em manchas, só perto da superfície
    lich = sstep(0.72, 0.8, value_noise(H, W, 9 * S, rng, 3)) * (d < 2.2 * T) * (d > 1.5 * S)
    col = mix(col, LICHEN * 0.7, (lich * 0.22)[..., None])

    # ---- parede de gelo ('+'): gelo liso com nervuras de escorrido, a pedra aparecendo por baixo ----
    iw = mat == 1
    if iw.any():
        ridge = np.sin(xx * (2 * math.pi / (0.62 * T)) + stretched_noise(H, W, 12 * S, 140 * S, rng) * 7)
        drip = stretched_noise(H, W, 6 * S, 90 * S, rng, 3)
        ice = mix(ICE_D, ICE_M, sstep(-0.6, 0.9, ridge)[..., None])
        ice = mix(ice, ICE_L, (sstep(0.75, 0.98, ridge) * 0.75)[..., None])
        ice = mix(ice, ICE_DD, (sstep(0.62, 0.8, drip) * 0.5)[..., None])
        ice = mix(ice, col, 0.18)
        bubbles = sstep(0.86, 0.9, value_noise(H, W, 2, rng, 1))
        ice = mix(ice, ICE_L, (bubbles * 0.5)[..., None])
        col = np.where(iw[..., None], ice, col)

    # ---- gelo do lago ('_'): laje translúcida, geada em cima, bolhas presas e trincas finas ----
    li = mat == 2
    if li.any():
        v = (yy % T) / T
        lake = mix(ICE_M, ICE_D, sstep(0.15, 1.0, v)[..., None])
        lake = mix(lake, ICE_L, (sstep(0.18, 0.0, v) * 0.85)[..., None])
        layers = np.sin(yy * 0.9 + stretched_noise(H, W, 70 * S, 6 * S, rng) * 5) * 0.5 + 0.5
        lake *= (0.92 + 0.12 * layers)[..., None]
        bub = sstep(0.83, 0.87, value_noise(H, W, 2.2, rng, 1)) * sstep(0.3, 0.8, v)
        lake = mix(lake, ICE_L, (bub * 0.7)[..., None])
        col = np.where(li[..., None], lake, col)

    # ---- cabana: telhado de tábuas, troncos, chaminé e assoalho ----
    roof = mat == 3
    if roof.any():
        course = np.floor(yy / (0.5 * T))
        joint_x = (xx + course * 0.37 * T) % (0.9 * T)
        sh = mix(WOOD_M, WOOD_L, sstep(0.5 * T, 0.0, yy % (0.5 * T))[..., None] * 0.6)
        sh *= (0.85 + 0.3 * stretched_noise(H, W, 40 * S, 3 * S, rng))[..., None]
        sh = mix(sh, WOOD_D, (sstep(2.5, 0.5, joint_x) + sstep(0.5 * T - 2.5, 0.5 * T - 0.5, yy % (0.5 * T))).clip(0, 1)[..., None] * 0.8)
        col = np.where(roof[..., None], sh, col)
    chim = mat == 5
    if chim.any():
        jn, sid = joints(H, W, rng, 9 * S, 0.9 * S, squash=1.5, show=(-1, 0), amp=1.5 * S)
        stc = np.array(STONE, np.float32)[sid % len(STONE)]
        stc *= (1 + (value_noise(H, W, 3, rng, 1) - 0.5) * 0.25)[..., None]
        stc = mix(stc, MORTAR, (jn * 0.9)[..., None])
        col = np.where(chim[..., None], stc, col)
    floor = mat == 6
    if floor.any():
        fy = yy % T
        board = (xx + np.floor(fy / (0.25 * T)) * 0.6 * T) % (1.7 * T)
        fl = mix(WOOD_M, WOOD_L, 0.25) * (0.85 + 0.3 * stretched_noise(H, W, 50 * S, 2 * S, rng))[..., None]
        fl = mix(fl, WOOD_D, sstep(2.0, 0.4, board)[..., None] * 0.8)
        fl = mix(fl, WOOD_D, sstep(0.25 * T - 2, 0.25 * T, fy % (0.25 * T))[..., None] * 0.6)
        fl = mix(fl, ROCK_D, sstep(0.6 * T, 1.0 * T, fy)[..., None])
        col = np.where(floor[..., None], fl, col)
    logs = mat == 4

    # ---- neve: todo chão que vê o céu; por baixo, a terra congelada ----
    exp = exposure(M)
    ytop = np.clip((yy - dtop + 1).astype(np.int64), 0, H - 1)
    surf = exp[ytop, xx.astype(np.int64)] * M
    deep = (11.0 + 4.0 * value_noise(H, W, 40 * S, rng, 2)) * S
    # a neve afina na quina (escorrega) e engrossa encostada numa parede (acumula)
    edge_l = np.minimum(dleft, 40 * S)
    edge_r = np.minimum(dright, 40 * S)
    rim = sstep(0, 5 * S, np.minimum(edge_l, edge_r))
    depth = deep * (0.55 + 0.45 * rim) * sstep(0.25, 0.55, surf)
    snow = (dtop < depth) & M & (mat != 1) & (mat != 2)
    snow_a = sstep(depth + 0.5, depth - 1.0, dtop) * snow
    sv = dtop / np.maximum(depth, 1)
    sc = mix(SNOW_L, SNOW_M, sstep(0.05, 0.5, sv)[..., None])
    sc = mix(sc, SNOW_S, sstep(0.72, 1.0, sv)[..., None])
    sc = mix(sc, SNOW_S, (sstep(0.55, 0.85, value_noise(H, W, 14 * S, rng, 2)) * 0.25)[..., None])
    # luz fria e lisa no alto, a borda de cima mais branca
    sc = mix(sc, SPARK, (sstep(1.4 * S, 0.2 * S, dtop) * 0.5)[..., None])
    earth = (dtop >= depth) & (dtop < depth + (5 + 3 * value_noise(H, W, 30 * S, rng, 1)) * S) & M & (surf > 0.3) & (mat == 0)
    ec = np.array(EARTH, np.float32)[(value_noise(H, W, 6 * S, rng, 1) * 2.99).astype(np.int64)]
    ec *= (0.8 + 0.4 * value_noise(H, W, 2, rng, 1))[..., None]
    ec = mix(ec, SNOW_D * 0.5, sstep(depth + 2.5 * S, depth, dtop)[..., None] * 0.6)  # a sombra azul logo embaixo da neve
    col = np.where(earth[..., None], ec, col)
    # as quinas da neve pendendo: a neve das bordas desce um pouco pela face de lado
    drape = M & (mat == 0) & (np.minimum(dleft, dright) < 2.2 * S) & (dtop < depth * 1.9) & (surf > 0.4)
    dsafe = np.maximum(depth, 1.0)
    col = mix(col, SNOW_M, (drape * sstep(dsafe * 1.9, dsafe, dtop) * 0.8)[..., None])
    col = mix(col, sc, snow_a[..., None])
    col = np.clip(col, 0, 1)

    mask = M.astype(np.float32)
    L = Layer(W, H)
    L.fill(col, mask)
    flow = np.where(iw | (mat == 4), math.pi / 2, (value_noise(H, W, 40, rng, 2) - 0.5) * 0.6).astype(np.float32)
    flow = np.where(snow | li | roof | floor, 0.0, flow).astype(np.float32)
    keep = 1 - np.maximum(cracks * 0.9 * (mat == 0), sstep(3 * S, 0.5 * S, dtop) * snow)
    passes = [
        dict(size=8, spacing=0.9, length=(1.8, 3.8), err=0.0, alpha=0.55, bristle=0.55, dry=0.45, blur=0.14, taper=0.35, ang_jitter=0.16),
        dict(size=4, spacing=0.95, length=(1.6, 3.4), err=0.0, alpha=0.6, bristle=0.5, dry=0.4, blur=0.06, taper=0.4, ang_jitter=0.22),
    ]
    paint(L, col, mask * keep * (1 - logs) * (1 - chim), flow, rng, passes, val_jitter=0.08, jitter=0.01, clip_soft=0, base=0.0)
    # a neve com pinceladas compridas e deitadas, e o brilho dos cristais
    snow_pass = [dict(size=5, spacing=0.8, length=(3.0, 6.0), err=0.0, alpha=0.7, bristle=0.35, dry=0.3, blur=0.1, taper=0.5, ang_jitter=0.05)]
    paint(L, col, snow_a * sstep(2.5 * S, 3.5 * S, dtop), np.zeros((H, W), np.float32), rng, snow_pass, val_jitter=0.03, jitter=0.006, clip_soft=0)
    sparkles(room, L, snow_a, dtop)
    if logs.any():
        log_ends(room, L, mat)
    if chim.any():
        chimney_top(room, L)
    stakes(room, L)
    return L, M, dict(d=d, dtop=dtop, dbot=dbot, dleft=dleft, dright=dright, surf=surf, snow=snow)


def sparkles(room, L, snow_a, dtop):
    rng = room.rng
    ys, xs = np.nonzero((snow_a > 0.9)[::3, ::3])
    ys, xs = ys * 3, xs * 3
    pick = rng.random(len(xs)) < 0.012
    for y, x in zip(ys[pick], xs[pick]):
        L.dab(x + rng.uniform(0, 3), y + rng.uniform(0, 3), rng.uniform(0.5, 0.9) * S, SPARK, 0.9, 0.4)


def log_ends(room, L, mat):
    """Paredes da cabana em corte: a ponta dos troncos empilhados, com casca e os anéis."""
    rng = room.rng
    for (x, y) in zip(*np.nonzero(materials(room) == 4)[::-1]):
        comp(L, x * T, y * T, WOOD_D * 0.8, np.ones((T, T), np.float32))
        cx, cy = (x + 0.5) * T, (y + 0.5) * T
        r = 0.5 * T
        b = Box(cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2)
        dist = np.hypot(b.xx + 0.5 - cx, (b.yy + 0.5 - cy) * 1.02)
        ang = np.arctan2(b.yy - cy, b.xx - cx)
        rr = r * (1 + 0.04 * np.sin(ang * 5 + rng.uniform(0, 6)))
        disc = sstep(rr + 0.8, rr - 0.8, dist)
        face = mix(FACE_L, FACE_M, sstep(0.0, rr.max(), dist)[..., None])
        rings = (np.sin(dist * 1.25 + np.sin(ang * 3) * 0.6) * 0.5 + 0.5)
        face *= (0.88 + 0.14 * rings)[..., None]
        crack = sstep(0.06, 0.0, np.abs(((ang + rng.uniform(0, 6)) % 2.1) - 1.05) / 1.05) * sstep(rr * 0.2, rr * 0.8, dist)
        face = mix(face, WOOD_D, (crack * 0.7)[..., None])
        bark = sstep(rr - 4.5, rr - 2.0, dist)
        face = mix(face, BARK_M, bark[..., None])
        face = mix(face, WOOD_D, sstep(rr - 1.2, rr + 0.5, dist)[..., None])
        # sombra entre um tronco e o de baixo
        b.put(L, np.clip(face, 0, 1), disc * 0.98)


def chimney_top(room, L):
    """A boca da chaminé: fuligem na borda de cima e um chapéu de neve."""
    rng = room.rng
    x0, x1, y0 = 50 * T, 52 * T, 11 * T
    b = Box(x0, y0, x1, y0 + 0.6 * T)
    soot = sstep(0.6 * T, 0.0, b.yy - y0) * (0.5 + 0.5 * value_noise(b.h, b.w, 3 * S, rng, 1))
    b.put(L, np.broadcast_to(MORTAR * 0.5, (b.h, b.w, 3)), soot * 0.6)


def stakes(room, L):
    """Estacas de caça no lugar dos espinhos: troncos finos afiados, enterrados no fundo da cova."""
    rng = room.rng
    for (x, y) in zip(*np.nonzero(room.cells('^'))[::-1]):
        base = (y + 1) * T
        for i in range(2):
            cx = x * T + T * (0.27 + 0.46 * i) + rng.normal(0, 1.2)
            top = y * T + rng.uniform(3, 9)
            hw = rng.uniform(4.0, 5.2)
            lean = rng.normal(0, 0.07)
            tip_h = rng.uniform(7, 10)
            pts = [(cx - hw + lean * (base - top), base), (cx + hw + lean * (base - top), base),
                   (cx + hw, top + tip_h), (cx + rng.uniform(-1, 1), top), (cx - hw, top + tip_h)]
            b = Box(cx - hw - 4, top - 2, cx + hw + 4 + abs(lean) * T, base + 1)
            a = b.poly(pts)
            u = (b.xx - cx) / hw
            c = mix(WOOD_L, WOOD_D, sstep(-0.8, 0.9, u)[..., None])
            c *= (0.85 + 0.3 * stretched_noise(b.h, b.w, 2 * S, 12 * S, rng))[..., None]
            # a ponta talhada, clara
            cut = sstep(top + tip_h + 1, top + tip_h - 2, b.yy)
            c = mix(c, FACE_L, (cut * 0.85)[..., None])
            # uma volta de corda e a neve que pegou na ponta
            rope = sstep(2.2, 0.8, np.abs(b.yy - (base - 0.42 * T)))
            c = mix(c, hexc(0x8c7550), (rope * 0.85)[..., None])
            sn = sstep(top + 4.5, top + 2.5, b.yy) * (value_noise(b.h, b.w, 3, rng, 1) > 0.4)
            c = mix(c, SNOW_M, (sn * 0.9)[..., None])
            b.put(L, np.clip(c, 0, 1), a)


# ======================================================================================
# pinheiros e o que fica atrás do cavaleiro
# ======================================================================================
def trunk(L, room, cx, ybase, ytop, w0, w1, rng, dead=False):
    """Tronco do chão (ybase) até ytop, afinando de w0 a w1, com a raiz alargando no pé e a casca em
    sulcos; a luz vem da esquerda (o lado do vento, que gruda neve na casca)."""
    lean = rng.normal(0, 0.006)
    n = 24
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        y = ybase + (ytop - ybase) * t
        w = w0 + (w1 - w0) * t
        flare = 1 + 0.55 * math.exp(-t * (ybase - ytop) / (0.55 * T))
        wob = rng.normal(0, 0.6)
        x = cx + lean * (ybase - y)
        left.append((x - w * 0.5 * flare + wob, y))
        right.append((x + w * 0.5 * flare + wob, y))
    pts = left + right[::-1]
    b = Box(min(p[0] for p in pts) - 2, ytop - 2, max(p[0] for p in pts) + 2, ybase + 2)
    a = b.poly(pts)
    xc = cx + lean * (ybase - b.yy)
    wy = w0 + (w1 - w0) * np.clip((ybase - b.yy) / max(1, ybase - ytop), 0, 1)
    u = np.clip((b.xx - xc) / (wy * 0.5), -1.4, 1.4)
    shade = sstep(-1.1, 1.0, u)
    if dead:
        c = mix(DEAD_L, DEAD_D, shade[..., None] * 0.9)
        fur = stretched_noise(b.h, b.w, 3 * S, 40 * S, rng, 2)
        c *= (0.82 + 0.3 * fur)[..., None]
        peel = sstep(0.62, 0.7, stretched_noise(b.h, b.w, 6 * S, 30 * S, rng, 2))
        c = mix(c, DEAD_D * 0.8, (peel * 0.6)[..., None])
    else:
        c = mix(BARK_L, BARK_D, shade[..., None])
        # sulcos da casca: listras finas na vertical, mais escuras, com placas entre elas
        fur = stretched_noise(b.h, b.w, 2.4 * S, 26 * S, rng, 2)
        c = mix(c, BARK_D * 0.7, (sstep(0.58, 0.72, fur) * 0.75)[..., None])
        plates = stretched_noise(b.h, b.w, 7 * S, 16 * S, rng, 1)
        c *= (0.86 + 0.26 * plates)[..., None]
        # neve grudada do lado do vento, em placas
        stick = sstep(-0.55, -0.95, u) * sstep(0.58, 0.7, value_noise(b.h, b.w, 7 * S, rng, 2))
        c = mix(c, SNOW_M, (stick * 0.85)[..., None])
    # o pé no escuro e com a neve encostada
    c = mix(c, c * 0.55, sstep(ybase - 0.9 * T, ybase, b.yy)[..., None])
    b.put(L, np.clip(c, 0, 1), a)
    # monte de neve no pé
    if not dead:
        for k in range(3):
            mx = cx + rng.uniform(-0.6, 0.6) * w0
            L.stroke(mx, ybase - rng.uniform(1.5, 3.5) * S, rng.normal(0, 0.05), w0 * rng.uniform(1.0, 1.7), rng.uniform(3, 5) * S,
                     mix(SNOW_M, SNOW_L, rng.random()), 0.95, rng, 0.25, 0.2, taper=0.75)


def tufts(L, pts, hang, rng, dirx=0, light=1.0, spacing=2.6):
    """Massa de agulhas ao longo de uma linha (pontos da base até a ponta): o corpo escuro e cheio logo
    embaixo da linha, a franja de tufos pendurada na borda de baixo e uns tufos claros por cima.
    hang(t) é a altura da massa em pixels (t de 0 na base a 1 na ponta)."""
    n = len(pts) - 1
    seg = []
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        m = max(1, int(math.hypot(x1 - x0, y1 - y0) / (spacing * S)))
        for k in range(m):
            t = (i + k / m) / n
            seg.append((x0 + (x1 - x0) * k / m, y0 + (y1 - y0) * k / m, t, math.atan2(y1 - y0, x1 - x0)))
    seg.append((pts[-1][0], pts[-1][1], 1.0, seg[-1][3] if seg else 0.0))
    # o corpo: pinceladas largas e curtas, deitadas na direção do galho, logo embaixo dele
    for (x, y, t, a) in seg:
        h = hang(t)
        if h <= 0:
            continue
        for k in range(2):
            off = h * rng.uniform(0.15, 0.45)
            c = mix(NEEDLE_D * 0.85, NEEDLE_M, rng.uniform(0.0, 0.6))
            L.stroke(x + rng.normal(0, 1.5), y + off, a + rng.normal(0, 0.15), h * rng.uniform(0.9, 1.5), h * rng.uniform(0.55, 0.85), c, 0.95, rng,
                     0.4, 0.25, taper=0.6)
    # a franja: tufos pendurados embaixo, para fora e para baixo
    for (x, y, t, a) in seg:
        h = hang(t)
        if h <= 0 or rng.random() < 0.3:
            continue
        ang = math.pi / 2 - dirx * rng.uniform(0.2, 0.8) if dirx else math.pi / 2 + rng.normal(0, 0.35)
        ln = h * rng.uniform(0.45, 0.8)
        L.stroke(x + rng.normal(0, 2), y + h * 0.65 + math.sin(ang) * ln * 0.4, ang, ln, rng.uniform(1.4, 2.2) * S,
                 mix(NEEDLE_D, NEEDLE_M, rng.random()), 0.9, rng, 0.45, 0.35, taper=0.85)
    # tufos claros na frente, de leve
    for (x, y, t, a) in seg:
        h = hang(t)
        if h <= 0 or rng.random() > 0.35 * light:
            continue
        L.stroke(x + rng.normal(0, 2), y + h * rng.uniform(0.1, 0.35), a + rng.normal(0, 0.3), h * rng.uniform(0.5, 0.9), rng.uniform(1.6, 2.6) * S,
                 mix(NEEDLE_M, NEEDLE_L, rng.random()), 0.75, rng, 0.45, 0.4, taper=0.8)


def snow_line(L, pts, rng, size=1.0):
    """Neve assentada por cima de uma linha (galho, andar de agulhas): montinhos irregulares."""
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        ang = math.atan2(y1 - y0, x1 - x0)
        seg = math.hypot(x1 - x0, y1 - y0)
        m = max(1, int(seg / (4 * S)))
        for k in range(m):
            t = (k + rng.random()) / m
            if rng.random() < 0.15:
                continue
            x = x0 + (x1 - x0) * t
            y = y0 + (y1 - y0) * t
            sz = size * (1 - 0.45 * (i + t) / max(1, len(pts) - 1))
            L.stroke(x, y - rng.uniform(0.2, 1.4) * S, ang + rng.normal(0, 0.1), rng.uniform(5, 10) * S * sz, rng.uniform(2.4, 3.8) * S * sz,
                     mix(SNOW_M, SNOW_L, rng.uniform(0.3, 1.0)), 0.97, rng, 0.25, 0.2, taper=0.65)
            if rng.random() < 0.3:
                L.dab(x + rng.normal(0, 2), y + rng.uniform(0.8, 2.2) * S, rng.uniform(1.0, 1.8) * S * sz, SNOW_S, 0.7, 0.8)


def bough(L, x, y, dirx, length, droop, rng, thick=1.0):
    """Galho de enfeite: sai do tronco caindo um pouco, as agulhas em tufos para baixo e para fora, a neve por cima."""
    n = max(4, int(length / (0.35 * T)))
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append((x + dirx * length * t, y + length * t * math.tan(droop) + 0.12 * length * t * t))
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        L.stroke((x0 + x1) / 2, (y0 + y1) / 2, math.atan2(y1 - y0, x1 - x0), math.hypot(x1 - x0, y1 - y0) * 1.25, (2.6 - 1.8 * i / n) * S,
                 BARK_D, 0.95, rng, 0.2, 0.0, taper=0.2)
    tufts(L, pts, lambda t: (0.2 - 0.12 * t) * length * thick + 3 * S, rng, dirx=dirx)
    snow_line(L, [(px, py - 1.2 * S) for (px, py) in pts], rng, size=0.9 * thick)


def crown(L, room, cx, ybase, ylow, rng, avoid):
    """A copa lá em cima: galhos de enfeite dos dois lados, do alto da sala até ylow, longe dos galhos de verdade."""
    y = -0.6 * T
    side = 1 if rng.random() < 0.5 else -1
    while y < ylow:
        side = -side
        if not any(abs(y - ay) < 2.2 * T for ay in avoid):
            ln = rng.uniform(1.6, 3.3) * T * (0.75 + 0.25 * (1 - y / max(1, ylow)))
            bough(L, cx + side * 0.25 * T, y, side, ln, rng.uniform(0.3, 0.52), rng)
        y += rng.uniform(0.55, 1.0) * T


def branch(L, room, x0, x1, row, trunk_x, rng, dead=False):
    """Galho de verdade (plataforma de um lado só): sai do tronco, a madeira por baixo da neve, a neve
    com o topo exatamente na linha da física, agulhas penduradas (o galho seco não tem)."""
    ytop = row * T
    ph = PLANK_H * S
    left_end = x0 * T - 0.3 * T
    right_end = (x1 + 1) * T + 0.3 * T
    if trunk_x is not None:
        tcx = (trunk_x + 0.5) * T
        if tcx <= (x0 + x1 + 1) * T / 2:
            start, end, dirx = tcx, right_end, 1
        else:
            start, end, dirx = tcx, left_end, -1
    else:
        start, end, dirx = left_end, right_end, 1
    length = abs(end - start)
    # agulhas penduradas embaixo (atrás da madeira)
    if not dead:
        n = max(4, int(length / (0.4 * T)))
        line = [(start + dirx * length * i / n, ytop + ph * 0.75) for i in range(n + 1)]
        tufts(L, line, lambda t: (0.7 + 0.15 * math.sin(t * math.pi * 0.9 + 0.3)) * T * (1 - 0.5 * t), rng, dirx=dirx)
    # a madeira: grossa no tronco, fina na ponta, encostada embaixo da neve
    pts_t, pts_b = [], []
    n = 12
    for i in range(n + 1):
        t = i / n
        px = start + dirx * length * t
        th = (15 - 8 * t) * S * 0.5
        mid = ytop + ph * 0.62 + t * 1.5 * S
        pts_t.append((px, mid - th))
        pts_b.append((px, mid + th))
    b = Box(min(start, end) - 4, ytop - 4, max(start, end) + 4, ytop + ph + 12 * S)
    a = b.poly(pts_t + pts_b[::-1])
    v = (b.yy - (ytop + ph * 0.3)) / (ph + 6 * S)
    if dead:
        c = mix(DEAD_L, DEAD_D, sstep(0.0, 1.0, v)[..., None])
    else:
        c = mix(BARK_L, BARK_D, sstep(0.0, 1.0, v)[..., None])
    c *= (0.85 + 0.25 * stretched_noise(b.h, b.w, 20 * S, 2 * S, rng))[..., None]
    b.put(L, np.clip(c, 0, 1), a)
    # nós e galhinhos que saem para cima e para baixo
    for k in range(int(length / (0.8 * T))):
        t = rng.uniform(0.15, 0.9)
        px = start + dirx * length * t
        up = rng.random() < 0.4
        ang = (-math.pi / 2 if up else math.pi / 2) + dirx * rng.uniform(0.5, 1.0)
        ln = rng.uniform(0.3, 0.7) * T * (0.6 if up else 1.0)
        L.stroke(px + math.cos(ang) * ln * 0.5, ytop + ph * 0.6 + math.sin(ang) * ln * 0.5, ang, ln, 1.6 * S, DEAD_M if dead else BARK_M, 0.9, rng, 0.2, 0.1, taper=0.8)
    # a neve: o topo na linha da física, a barriga arredondada por baixo
    b2 = Box(min(start, end) - 4, ytop - 1, max(start, end) + 4, ytop + ph + 2)
    tx = (b2.xx - start) * dirx / max(1, length)
    inside = (tx >= -0.02) & (tx <= 1.0)
    lump = 0.6 + 0.4 * value_noise(b2.h, b2.w, 6 * S, rng, 2)
    th = (ph * 0.68) * lump * np.clip(1.15 - tx * 0.6, 0.35, 1) * inside
    sa = sstep(ytop + th + 0.6, ytop + th - 0.8, b2.yy) * sstep(ytop - 0.5, ytop + 0.5, b2.yy)
    sv = (b2.yy - ytop) / np.maximum(th, 1)
    sc = mix(SNOW_L, SNOW_M, sstep(0.1, 0.6, sv)[..., None])
    sc = mix(sc, SNOW_S, sstep(0.6, 1.0, sv)[..., None])
    b2.put(L, np.clip(sc, 0, 1), sa)
    for k in range(int(length / (3 * S))):
        if rng.random() < 0.2:
            L.dab(start + dirx * rng.uniform(0, length), ytop + rng.uniform(0.5, 1.5) * S, rng.uniform(0.5, 0.8) * S, SPARK, 0.8, 0.4)


def fir(L, cx, ybase, h, rng):
    """Pinheiro novo: andares de agulhas em cone (cada andar pende para os dois lados), neve em cima de cada um."""
    tiers = int(rng.integers(4, 6))
    wbase = h * rng.uniform(0.5, 0.62)
    L.stroke(cx, ybase - 0.1 * h, math.pi / 2, 0.24 * h, 0.1 * wbase, BARK_D, 1.0, rng, 0.2, 0.0, taper=0.2)
    for i in range(tiers):
        t0 = i / tiers
        yb = ybase - 0.14 * h - t0 * 0.8 * h
        w = wbase * (1 - t0 * 0.78) * 0.5
        for dirx in (-1, 1):
            n = 4
            pts = [(cx + dirx * w * k / n, yb - 0.16 * h * (1 - k / n) + 0.02 * h) for k in range(n + 1)]
            tufts(L, pts, lambda t, w=w: (0.3 - 0.15 * t) * w + 3 * S, rng, dirx=dirx, light=1.3, spacing=2.0)
            snow_line(L, [(px, py - 1.0 * S) for (px, py) in pts], rng, size=0.6)
    L.stroke(cx, ybase - 0.95 * h, -math.pi / 2, 0.14 * h, 2.4 * S, NEEDLE_M, 1.0, rng, 0.3, 0.1, taper=0.9)
    L.dab(cx, ybase - 0.93 * h, 2.0 * S, SNOW_L, 0.95, 0.8)


def stand(L, room, x0, x1, row, rng):
    """Espera de caça: tablado de tábuas em quatro pernas (duas à vista), travessas em X e a escada."""
    ytop = row * T
    ph = PLANK_H * S
    gl = ground_row(room, (x0 + x1) // 2, row + 1) * T
    posts = [x0 * T + 0.35 * T, (x1 + 1) * T - 0.35 * T]
    for px in posts:
        L.stroke(px, (ytop + gl) / 2, math.pi / 2, gl - ytop + 4, 0.34 * T, WOOD_M, 1.0, rng, 0.35, 0.1, taper=0.05)
        L.stroke(px - 0.08 * T, (ytop + gl) / 2, math.pi / 2, gl - ytop, 0.1 * T, WOOD_L, 0.6, rng, 0.3, 0.2, taper=0.05)
    # travessas em X
    (pa, pb) = posts
    yA, yB = ytop + ph + 0.4 * T, gl - 0.9 * T
    for (xa, ya, xb, yb2) in ((pa, yA, pb, yB), (pa, yB, pb, yA)):
        ang = math.atan2(yb2 - ya, xb - xa)
        L.stroke((xa + xb) / 2, (ya + yb2) / 2, ang, math.hypot(xb - xa, yb2 - ya), 0.2 * T, WOOD_D, 1.0, rng, 0.3, 0.1, taper=0.05)
    L.stroke((pa + pb) / 2, yB, 0, pb - pa, 0.2 * T, WOOD_M, 1.0, rng, 0.3, 0.1, taper=0.02)
    # escada do lado de fora da perna esquerda
    lx0, lx1 = pa - 0.95 * T, pa - 0.25 * T
    for lx in (lx0, lx1):
        L.stroke(lx, (ytop + gl) / 2 - 0.1 * T, math.pi / 2 + 0.04, gl - ytop + 0.2 * T, 0.13 * T, WOOD_M, 1.0, rng, 0.3, 0.1, taper=0.03)
    y = gl - 0.45 * T
    while y > ytop + 0.2 * T:
        L.stroke((lx0 + lx1) / 2, y, 0, lx1 - lx0 + 0.1 * T, 0.11 * T, WOOD_L, 1.0, rng, 0.3, 0.1, taper=0.05)
        L.stroke((lx0 + lx1) / 2, y - 0.07 * T, 0, lx1 - lx0, 0.06 * T, SNOW_M, 0.9, rng, 0.3, 0.2, taper=0.3)
        y -= 0.5 * T
    # o tablado: tábuas grossas com a neve por cima (o topo é o topo da física)
    b = Box(x0 * T - 0.4 * T, ytop - 1, (x1 + 1) * T + 0.4 * T, ytop + ph + 3 * S)
    a = (b.yy >= ytop) & (b.yy < ytop + ph + 2 * S)
    seam = ((b.xx - x0 * T) % (0.8 * T)) < 1.5
    c = mix(WOOD_L, WOOD_D, sstep(ytop, ytop + ph + 2 * S, b.yy)[..., None])
    c = mix(c, WOOD_D, seam[..., None] * 0.8)
    b.put(L, np.clip(c, 0, 1), a.astype(np.float32))
    th = ph * 0.55 * (0.7 + 0.3 * value_noise(b.h, b.w, 5 * S, rng, 1))
    sa = sstep(ytop + th + 0.6, ytop + th - 0.8, b.yy) * (b.yy >= ytop)
    b.put(L, mix(SNOW_L, SNOW_M, sstep(ytop, ytop + th, b.yy)[..., None] * 0.7), sa)


def icicles(L, room, M, F, rng, density=0.09):
    """Pingentes de gelo embaixo das bordas que dão para o ar (mais onde a neve de cima derrete)."""
    H, W = M.shape
    edge = M & ~np.vstack([M[1:], np.zeros((1, W), bool)])
    edge[-1] = False
    ys, xs = np.nonzero(edge[:, ::2])
    xs = xs * 2
    if not len(xs):
        return
    air = F['air'][np.clip(ys + 3, 0, H - 1), xs]
    near = F['surf'][np.clip(ys - int(1.5 * T), 0, H - 1), xs] > 0.2
    p = np.where(air > 0.2, np.where(near, density, density * 0.4), 0.0)
    pick = rng.random(len(xs)) < p
    for y, x in zip(ys[pick], xs[pick]):
        ln = rng.uniform(3, 14) * S * (1.4 if rng.random() < 0.15 else 1.0)
        w = rng.uniform(1.4, 2.6) * S
        pts = [(x - w, y - 1), (x + w, y - 1), (x + rng.uniform(-0.6, 0.6), y + ln)]
        b = Box(x - w - 2, y - 2, x + w + 2, y + ln + 2)
        a = b.poly(pts)
        u = (b.xx - x) / w
        c = mix(ICE_L, ICE_M, sstep(-0.5, 0.9, u)[..., None])
        c = mix(c, SPARK, (sstep(0.4, 0.0, np.abs(u + 0.35)) * 0.6)[..., None])
        b.put(L, np.clip(c, 0, 1), a * 0.92)


def lake_people(L, room, rng):
    """Embaixo do gelo do lago: gente parada na água, o rosto virado para cima e as mãos no gelo."""
    if room.name != 'lago':
        return
    water_top = 34 * T
    for tx in (31, 37.5, 46, 73, 81.5, 93, 108, 114):
        cx = tx * T + rng.uniform(-6, 6)
        hy = water_top + rng.uniform(0.35, 0.6) * T
        tilt = rng.normal(0, 0.18)
        body = hexc(0x6f8a98)
        skin = hexc(0x9fb7c2)
        b = Box(cx - 1.4 * T, water_top - 2, cx + 1.4 * T, 38 * T)
        # o corpo descendo no escuro
        tor = b.poly([(cx - 0.42 * T, hy + 0.45 * T), (cx + 0.42 * T, hy + 0.45 * T), (cx + 0.6 * T, 38 * T), (cx - 0.6 * T, 38 * T)])
        fade = sstep(38 * T, hy + 0.5 * T, b.yy)
        b.put(L, np.broadcast_to(body * 0.75, (b.h, b.w, 3)), tor * fade * 0.55)
        # os braços para cima, a palma aberta contra o gelo
        for side in (-1, 1):
            hx = cx + side * rng.uniform(0.55, 0.85) * T
            sx = cx + side * 0.36 * T
            sy = hy + 0.55 * T
            arm = b.line([(sx, sy), ((sx + hx) / 2 + side * 3, (sy + water_top) / 2), (hx, water_top + 0.18 * T)], 0.17 * T)
            b.put(L, np.broadcast_to(body, (b.h, b.w, 3)), arm * 0.6)
            palm = b.ellipse(hx, water_top + 0.12 * T, 0.16 * T, 0.11 * T)
            b.put(L, np.broadcast_to(skin, (b.h, b.w, 3)), palm * 0.6)
        # a cabeça inclinada para trás, olhos fechados
        head = b.ellipse(cx + tilt * 6, hy, 0.3 * T, 0.36 * T)
        b.put(L, np.broadcast_to(skin, (b.h, b.w, 3)), head * 0.62)
        for side in (-1, 1):
            ex = cx + tilt * 6 + side * 0.11 * T
            ey = hy - 0.02 * T
            eye = b.line([(ex - 0.06 * T, ey), (ex + 0.06 * T, ey + 0.015 * T)], 1.2 * S)
            b.put(L, np.broadcast_to(hexc(0x2c3d48), (b.h, b.w, 3)), eye * 0.6)
        mouth = b.line([(cx + tilt * 6 - 0.05 * T, hy + 0.18 * T), (cx + tilt * 6 + 0.05 * T, hy + 0.18 * T)], 1.0 * S)
        b.put(L, np.broadcast_to(hexc(0x3a4f5c), (b.h, b.w, 3)), mouth * 0.45)
        # o cabelo solto na água, subindo
        for k in range(7):
            a0 = math.pi + 0.3 + k * 0.4 + rng.normal(0, 0.1)
            r0 = 0.32 * T
            x0 = cx + math.cos(a0) * r0
            y0 = hy + math.sin(a0) * r0 * 1.1
            L.stroke(x0 + rng.normal(0, 2), y0 - 0.2 * T, -math.pi / 2 + rng.normal(0, 0.4), rng.uniform(0.3, 0.6) * T, 1.6 * S, hexc(0x40525e), 0.45, rng, 0.3, 0.3, taper=0.8)


def mine_mouth(L, room, rng):
    """Encosta: o madeiramento da boca da mina (duas pernas e o chapéu) e a fogueira de quem saiu."""
    if room.name != 'encosta':
        return
    floor = 30 * T
    ceil = 24 * T
    # os quadros de madeira lá dentro do túnel, no escuro
    for (ax, k) in ((2.2 * T, 0.4),):
        for px in (ax, ax + 2.6 * T):
            L.stroke(px, (floor + ceil) / 2, math.pi / 2, floor - ceil + 2, 0.36 * T, WOOD_D * (0.6 + k), 1.0, rng, 0.4, 0.15, taper=0.04)
        L.stroke(ax + 1.3 * T, ceil + 0.2 * T, 0.0, 3.2 * T, 0.36 * T, WOOD_D * (0.5 + k), 1.0, rng, 0.4, 0.15, taper=0.02)
    for px in (10.7 * T, 13.5 * T):
        L.stroke(px, (floor + ceil) / 2, math.pi / 2, floor - ceil + 2, 0.42 * T, WOOD_M, 1.0, rng, 0.4, 0.15, taper=0.04)
        L.stroke(px - 0.12 * T, (floor + ceil) / 2, math.pi / 2, floor - ceil, 0.1 * T, WOOD_L, 0.55, rng, 0.3, 0.2, taper=0.04)
    L.stroke(12.1 * T, ceil + 0.2 * T, 0.0, 3.6 * T, 0.42 * T, WOOD_D, 1.0, rng, 0.4, 0.15, taper=0.02)
    L.stroke(12.1 * T, ceil + 0.08 * T, 0.0, 3.4 * T, 0.12 * T, WOOD_L, 0.5, rng, 0.3, 0.2, taper=0.05)
    # uma lanterna apagada pendurada no chapéu e a neve que o vento joga para dentro
    L.stroke(13.0 * T, ceil + 0.55 * T, math.pi / 2, 0.5 * T, 0.05 * T, hexc(0x2a2624), 1.0, rng, 0.2, 0.0, taper=0.0)
    L.dab(13.0 * T, ceil + 0.95 * T, 0.16 * T, hexc(0x3a3430), 1.0, 1.0)
    L.dab(13.0 * T, ceil + 0.95 * T, 0.09 * T, hexc(0x6a5a3a), 0.8, 1.0)
    for k in range(9):
        L.stroke(rng.uniform(9.5, 13.5) * T, floor - rng.uniform(0.05, 0.25) * T, rng.normal(0, 0.06), rng.uniform(0.6, 1.4) * T, rng.uniform(3, 5) * S,
                 mix(SNOW_M, SNOW_L, rng.random()), 0.9, rng, 0.25, 0.2, taper=0.75)
    firepit(L, 8.5 * T, floor, rng)


def firepit(L, x, y, rng):
    """Fogueira: pedras em roda, lenha queimada no meio (o fogo, quando aceso, o jogo põe)."""
    for k in range(7):
        a = math.pi * (k / 6)
        sx = x + math.cos(a) * 0.62 * T
        sy = y - 0.12 * T - math.sin(a) * 0.08 * T
        r = rng.uniform(0.16, 0.24) * T
        c = STONE[int(rng.integers(0, len(STONE)))] * rng.uniform(0.75, 1.0)
        L.dab(sx, sy, r, c, 1.0, 1.0)
        L.dab(sx - r * 0.3, sy - r * 0.4, r * 0.45, np.clip(c * 1.35, 0, 1), 0.8, 0.8)
        L.dab(sx, sy - r * 0.8, r * 0.5, SNOW_M, 0.7, 0.8)
    for ang in (0.35, -0.3, 0.05):
        L.stroke(x, y - 0.2 * T, ang, 0.9 * T, 0.16 * T, hexc(0x1a1210), 1.0, rng, 0.3, 0.1, taper=0.2)
    L.dab(x, y - 0.18 * T, 0.18 * T, hexc(0x3a1a10), 0.9, 1.0)


def plank(L, x0, y0, x1, y1, vertical=False, dark=False):
    """Tábua de madeira com volume: o veio, a quina de cima (ou da esquerda) clara e a sombra embaixo."""
    b = Box(x0 - 1, y0 - 1, x1 + 1, y1 + 1)
    a = ((b.xx >= x0) & (b.xx < x1) & (b.yy >= y0) & (b.yy < y1)).astype(np.float32)
    u = (b.xx - x0) / max(x1 - x0, 1) if vertical else (b.yy - y0) / max(y1 - y0, 1)
    base = mix(WOOD_M, WOOD_D, 0.55) if dark else WOOD_M
    c = mix(mix(WOOD_L, base, 0.35), base * 0.62, sstep(0.15, 1.0, u)[..., None])
    c = mix(c, WOOD_L * 1.1, (sstep(0.14, 0.0, u) * 0.75)[..., None])
    grain = np.sin((b.yy if not vertical else b.xx) * 0.9 + np.sin((b.xx if not vertical else b.yy) * 0.05) * 3)
    c *= (0.92 + 0.08 * grain)[..., None]
    b.put(L, np.clip(c, 0, 1), a)


def cabin_inside(L, room, rng):
    """A cabana por dentro: parede de troncos ao fundo, a janela, a prateleira do herbário, a mesa da
    carta, a lareira de pedra embaixo da chaminé e o prego da porta (onde fica o retalho vermelho)."""
    if room.name != 'cabana':
        return
    x0, x1 = 29.5 * T, 55.5 * T
    y0, y1 = 21 * T, 29 * T
    b = Box(x0, y0, x1, y1)
    lh = 0.8 * T
    k = ((b.yy - y0) % lh) / lh
    c = mix(WOOD_L, WOOD_D, sstep(0.0, 1.0, k)[..., None] * 0.9)
    c = mix(c, WOOD_L * 1.15, (sstep(0.25, 0.05, k) * 0.5)[..., None])
    c *= (0.82 + 0.3 * stretched_noise(b.h, b.w, 26 * S, 2 * S, rng, 2))[..., None]
    chink = sstep(0.06, 0.0, np.minimum(k, 1 - k))
    c = mix(c, hexc(0x9d927f), (chink * 0.85)[..., None])
    # a luz quente da lareira
    fx = 51.5 * T
    warm = np.exp(-(((b.xx - fx) / (7 * T)) ** 2 + ((b.yy - 27.5 * T) / (5 * T)) ** 2))
    c = mix(c, c * 0.6 + WARM * 0.5, (warm * 0.45)[..., None])
    c = mix(c, c * 0.45, sstep(y0 + 1.5 * T, y0, b.yy)[..., None] * 0.6)  # o alto, embaixo do telhado, mais escuro
    b.put(L, np.clip(c, 0, 1), np.ones((b.h, b.w), np.float32))
    # a viga do teto
    L.stroke((x0 + x1) / 2, y0 + 0.18 * T, 0, x1 - x0, 0.36 * T, WOOD_D, 1.0, rng, 0.35, 0.1, taper=0.01)
    # a janela: moldura, quatro vidros com o branco de fora e a geada nos cantos
    wx0, wx1, wy0, wy1 = 39.6 * T, 42.6 * T, 22.3 * T, 24.7 * T
    w = Box(wx0 - 4, wy0 - 4, wx1 + 4, wy1 + 4)
    inside = (w.xx > wx0) & (w.xx < wx1) & (w.yy > wy0) & (w.yy < wy1)
    gl = mix(hexc(0xe3edf7), hexc(0x9fb6cf), sstep(wy0, wy1, w.yy)[..., None])
    corner = np.minimum(np.minimum(w.xx - wx0, wx1 - w.xx), np.minimum(w.yy - wy0, wy1 - w.yy))
    gl = mix(gl, SPARK, (sstep(0.5 * T, 0.0, corner) * 0.7 * (value_noise(w.h, w.w, 3, rng, 1) > 0.35))[..., None])
    w.put(L, np.clip(gl, 0, 1), inside.astype(np.float32))
    for (ax, ay, bx, by, th) in ((wx0, wy0, wx1, wy0, 0.16), (wx0, wy1, wx1, wy1, 0.2), (wx0, wy0, wx0, wy1, 0.16), (wx1, wy0, wx1, wy1, 0.16),
                                 ((wx0 + wx1) / 2, wy0, (wx0 + wx1) / 2, wy1, 0.08), (wx0, (wy0 + wy1) / 2, wx1, (wy0 + wy1) / 2, 0.08)):
        L.stroke((ax + bx) / 2, (ay + by) / 2, math.atan2(by - ay, bx - ax), math.hypot(bx - ax, by - ay) + th * T, th * T, WOOD_D, 1.0, rng, 0.2, 0.0, taper=0.01)
    # a luz fria da janela no chão e na parede
    # a prateleira do herbário: tábua grossa em duas mãos-francesas, potes de vidro e maços de flores secas
    sy = 25.4 * T
    plank(L, 33.4 * T, sy - 0.14 * T, 39.0 * T, sy + 0.16 * T)
    for bx in (34.2 * T, 38.2 * T):
        b2 = Box(bx - 0.5 * T, sy, bx + 0.5 * T, sy + 0.9 * T)
        a2 = b2.poly([(bx - 0.08 * T, sy + 0.12 * T), (bx + 0.08 * T, sy + 0.12 * T), (bx + 0.08 * T, sy + 0.85 * T), (bx - 0.08 * T, sy + 0.85 * T)])
        a2 = np.maximum(a2, b2.poly([(bx - 0.08 * T, sy + 0.62 * T), (bx + 0.08 * T, sy + 0.72 * T), (bx + 0.45 * T, sy + 0.16 * T), (bx + 0.3 * T, sy + 0.12 * T)]))
        b2.put(L, WOOD_D, a2)
    for jx, jh, jc in ((34.2, 0.55, hexc(0x9fb5a8)), (35.0, 0.42, hexc(0xb7a77d)), (37.8, 0.5, hexc(0x8ea4b6))):
        jx *= T
        top = sy - 0.14 * T
        L.stroke(jx, top - jh * T * 0.5, math.pi / 2, jh * T, 0.4 * T, jc, 0.9, rng, 0.2, 0.0, taper=0.05)
        L.stroke(jx - 0.1 * T, top - jh * T * 0.55, math.pi / 2, jh * T * 0.7, 0.08 * T, SPARK, 0.5, rng, 0.2, 0.0, taper=0.3)
        L.stroke(jx, top - jh * T - 0.06 * T, 0, 0.34 * T, 0.12 * T, WOOD_D, 1.0, rng, 0.2, 0.0, taper=0.05)
    for fx2 in (33.6, 35.8, 36.5, 38.6):
        fx2 *= T
        L.stroke(fx2, sy + 0.5 * T, math.pi / 2, 0.7 * T, 0.12 * T, hexc(0x6d7a4c), 0.95, rng, 0.4, 0.3, taper=0.5)
        for f in range(3):
            L.dab(fx2 + rng.uniform(-3, 3), sy + 0.82 * T + rng.uniform(-3, 4), rng.uniform(1.6, 2.4) * S,
                  [hexc(0xb5506a), hexc(0xd8b24a), hexc(0x8a74b8)][int(rng.integers(0, 3))], 0.95, 0.6)
    # a mesa da carta (tampo grosso, saia e pernas) e o banco
    tx0, tx1, tt = 42.7 * T, 45.6 * T, 27.55 * T
    for lx in (tx0 + 0.3 * T, tx1 - 0.3 * T):
        plank(L, lx - 0.13 * T, tt + 0.2 * T, lx + 0.13 * T, y1, vertical=True)
    plank(L, tx0 + 0.2 * T, tt + 0.28 * T, tx1 - 0.2 * T, tt + 0.5 * T, dark=True)
    plank(L, tx0, tt, tx1, tt + 0.3 * T)
    for lx in (46.3 * T, 47.1 * T):
        plank(L, lx - 0.1 * T, 28.25 * T, lx + 0.1 * T, y1, vertical=True)
    plank(L, 45.95 * T, 28.05 * T, 47.45 * T, 28.3 * T)
    # a lareira: o peito de pedra até o teto, a boca escura em arco, a viga do console e a pedra do chão
    fx0, fx1 = 49.9 * T, 53.1 * T
    f = Box(fx0, y0, fx1, y1)
    jn, sid = joints(f.h, f.w, rng, 8 * S, 0.9 * S, squash=1.5, show=(-1, 0), amp=1.2 * S)
    st = np.array(STONE, np.float32)[sid % len(STONE)] * (0.82 + 0.25 * value_noise(f.h, f.w, 3, rng, 1))[..., None]
    st = mix(st, MORTAR, (jn * 0.9)[..., None])
    st = mix(st, st * 0.5 + WARM * 0.35, (sstep(25.2 * T, 28.6 * T, f.yy) * 0.35)[..., None])
    f.put(L, np.clip(st, 0, 1), np.ones((f.h, f.w), np.float32))
    ax, aw, ay = 51.5 * T, 0.95 * T, 27.1 * T
    arch = ((np.abs(f.xx - ax) < aw) & (f.yy > ay)) | (np.hypot((f.xx - ax) / aw, (f.yy - ay) / (0.5 * T)) < 1.0)
    inner = mix(hexc(0x0d0807), hexc(0x2a130b), sstep(ay - 0.4 * T, y1, f.yy)[..., None])
    f.put(L, inner, arch.astype(np.float32))
    L.stroke((fx0 + fx1) / 2, 26.3 * T, 0, fx1 - fx0 + 0.5 * T, 0.28 * T, WOOD_D, 1.0, rng, 0.35, 0.1, taper=0.01)
    L.stroke((fx0 + fx1) / 2, 26.2 * T, 0, fx1 - fx0 + 0.4 * T, 0.07 * T, WOOD_L, 0.6, rng, 0.3, 0.1, taper=0.02)
    for ang in (0.12, -0.1):
        L.stroke(ax, y1 - 0.18 * T, ang, 1.2 * T, 0.18 * T, hexc(0x2a1a12), 1.0, rng, 0.3, 0.1, taper=0.2)
    # o prego da porta
    L.dab(32.5 * T, 25.05 * T, 1.3 * S, hexc(0x1c1a1a), 1.0, 0.5)
    L.dab(32.3 * T, 24.98 * T, 0.6 * S, hexc(0x8c8a88), 1.0, 0.4)


def hunter_camp(L, room, rng):
    """Clareira: o abrigo do caçador encostado na pedra da direita (varas, peles esticadas) e o varal das peles."""
    if room.name != 'clareira':
        return
    gy = 29 * T
    # as varas do abrigo apoiadas na pedra
    for k in range(4):
        x = (66.6 + k * 0.85) * T
        top = (24.4 - k * 0.15) * T
        L.stroke((x + 70 * T) / 2, (gy + top) / 2, math.atan2(top - gy, 70 * T - x), math.hypot(70 * T - x, gy - top), 0.14 * T, WOOD_D, 1.0, rng, 0.3, 0.1, taper=0.05)
    hide = Box(66 * T, 24 * T, 70.2 * T, gy)
    a = hide.poly([(66.4 * T, gy), (70.1 * T, 24.6 * T), (70.1 * T, gy)])
    hc = mix(hexc(0x8a8076), hexc(0x4e4640), sstep(24 * T, gy, hide.yy)[..., None])
    hc *= (0.85 + 0.3 * stretched_noise(hide.h, hide.w, 3 * S, 9 * S, rng))[..., None]
    hide.put(L, np.clip(hc, 0, 1), a * 0.95)
    for k in range(12):
        x = rng.uniform(66.8, 70) * T
        y = 24.6 * T + (70.1 * T - x) / (3.7 * T) * (gy - 24.6 * T) * 0.98 - rng.uniform(0, 2) * S
        L.dab(x, min(y, gy - 4), rng.uniform(1.5, 2.5) * S, SNOW_M, 0.9, 0.8)
    # o varal entre os dois troncos da esquerda, com duas peles de lobo penduradas
    ax, bx, ry = 10.5 * T, 16.5 * T, 25.2 * T
    L.stroke((ax + bx) / 2, ry, 0, bx - ax, 0.09 * T, hexc(0x8c7550), 1.0, rng, 0.3, 0.1, taper=0.01)
    for px in (12.2 * T, 14.6 * T):
        pelt = Box(px - 0.75 * T, ry - 2, px + 0.75 * T, ry + 1.9 * T)
        pts = [(px - 0.55 * T, ry), (px + 0.55 * T, ry), (px + 0.68 * T, ry + 0.7 * T), (px + 0.4 * T, ry + 1.5 * T), (px + 0.1 * T, ry + 1.85 * T),
               (px - 0.1 * T, ry + 1.85 * T), (px - 0.4 * T, ry + 1.5 * T), (px - 0.68 * T, ry + 0.7 * T)]
        a = pelt.poly(pts)
        pc = mix(hexc(0x9aa3ad), hexc(0x4d535c), sstep(ry, ry + 1.8 * T, pelt.yy)[..., None])
        pc *= (0.85 + 0.3 * stretched_noise(pelt.h, pelt.w, 2 * S, 6 * S, rng))[..., None]
        pelt.put(L, np.clip(pc, 0, 1), a)
        L.stroke(px, ry + 0.02 * T, 0, 1.1 * T, 0.12 * T, SNOW_M, 0.85, rng, 0.3, 0.2, taper=0.3)


def cave_back(L, room, F, rng):
    """O ar que não vê o céu por lado nenhum (o túnel da mina, a chaminé de pedra da serra) tem a parede
    de pedra do fundo atrás, escura, clareando perto da boca."""
    M = F['M']
    H, W = M.shape
    enclosed = (~M) & (F['air'] < 0.02)
    for (x0, y0, x1, y1) in CAVES.get(room.name, []):
        enclosed[y0 * T:(y1 + 1) * T, x0 * T:(x1 + 1) * T] |= ~M[y0 * T:(y1 + 1) * T, x0 * T:(x1 + 1) * T]
    if not enclosed.any():
        return
    soft = blur(enclosed.astype(np.float32), 4 * S)
    # perto da boca (onde o ar já vê o céu) a pedra do fundo pega a luz de fora
    out = blur((~M & (F['air'] > 0.2)).astype(np.float32), 26 * S)
    yy, xx = room.yy, room.xx
    c = mix(ROCKS[1] * 0.5, ROCKS[0] * 0.75, (value_noise(H, W, 30 * S, rng, 2))[..., None])
    jn, _ = joints(H, W, rng, 30 * S, 0.8 * S, squash=1.3, show=(0.3, 0.5), amp=3 * S)
    c = mix(c, ROCK_D, (jn * 0.7)[..., None])
    c = mix(c, c * 0.45, (1 - np.clip(out * 3, 0, 1))[..., None])
    a = np.clip(soft * 1.2, 0, 1) * enclosed
    L.fill(np.clip(c, 0, 1), a)


def pines(room, F):
    rng = np.random.default_rng(SEEDS[room.name] + 1000)
    H, W = room.H, room.W
    L = Layer(W, H)
    cave_back(L, room, F, rng)
    sp = room.spawns
    trunks = [(x, y, c) for (c, x, y) in sp if c in 'Ts']
    walk = spans(room, '-')
    # cada galho de verdade é do tronco mais perto embaixo dele
    owner = {}
    for (x0, x1, row) in walk:
        best = None
        for (tx, ty, c) in trunks:
            if x0 - 2 <= tx <= x1 + 2 and ty > row:
                if best is None or abs(tx - (x0 + x1) / 2) < abs(best[0] - (x0 + x1) / 2):
                    best = (tx, ty, c)
        owner[(x0, x1, row)] = best
    cabin_inside(L, room, rng)
    hunter_camp(L, room, rng)
    for (tx, ty, c) in trunks:
        cx = (tx + 0.5) * T
        ybase = (ty + 1) * T
        dead = c == 's'
        mine = [row for (k, v) in owner.items() if v == (tx, ty, c) for row in [k[2]]]
        if dead:
            top = (min(mine) - 2.5) * T if mine else ybase - 14 * T
            trunk(L, room, cx, ybase, top, 0.85 * T, 0.38 * T, rng, dead=True)
            # a ponta quebrada e os galhos secos que sobraram
            for k in range(5):
                y = rng.uniform(top + 1 * T, ybase - 3 * T)
                side = rng.choice([-1, 1])
                ang = -math.pi / 2 + side * rng.uniform(0.5, 1.1)
                ln = rng.uniform(0.6, 1.4) * T
                L.stroke(cx + math.cos(ang) * ln * 0.5, y + math.sin(ang) * ln * 0.5, ang, ln, 0.13 * T, DEAD_M, 1.0, rng, 0.3, 0.1, taper=0.7)
            for k in range(3):
                L.stroke(cx + rng.uniform(-0.15, 0.15) * T, top + rng.uniform(0, 0.4) * T, -math.pi / 2 + rng.normal(0, 0.5), 0.5 * T, 0.12 * T, DEAD_D, 1.0, rng, 0.3, 0.1, taper=0.9)
        else:
            low = (min(mine) - 3) * T if mine else min(ybase - 9 * T, 0.42 * H)
            avoid = [r * T for r in mine]
            crown(L, room, cx, ybase, low, rng, avoid)
            trunk(L, room, cx, ybase, -T, 1.45 * T, 0.8 * T, rng)
            # tocos de galhos que caíram (o pinheiro alto perde os de baixo)
            for k in range(int((ybase - max(low, 0)) / (2.6 * T))):
                y = rng.uniform(max(low, 0) + T, ybase - 2.5 * T)
                if any(abs(y - a) < 1.5 * T for a in avoid):
                    continue
                side = rng.choice([-1, 1])
                ang = math.pi / 2 * 0 + (0.35 if side > 0 else math.pi - 0.35)
                L.stroke(cx + side * 0.72 * T, y, ang, 0.5 * T, 0.12 * T, BARK_M, 1.0, rng, 0.3, 0.1, taper=0.7)
    for key, ow in owner.items():
        (x0, x1, row) = key
        if ow is None:
            stand(L, room, x0, x1, row, rng)
        else:
            branch(L, room, x0, x1, row, ow[0], rng, dead=ow[2] == 's')
    for (c, x, y) in sp:
        if c == 't':
            fir(L, (x + 0.5) * T + rng.uniform(-4, 4), (y + 1) * T + 2, rng.uniform(2.3, 3.4) * T, rng)
    mine_mouth(L, room, rng)
    lake_people(L, room, rng)
    icicles(L, room, F['M'], F, rng)
    return L


def downsample_soft(L, room):
    img = L.image()
    W1, H1 = room.W // S, room.H // S
    arr = np.asarray(img, np.float32) / 255
    a = arr[..., 3:4]
    pm = (arr[..., :3] * a).reshape(H1, S, W1, S, 3).mean((1, 3))
    am = a[..., 0].reshape(H1, S, W1, S).mean((1, 3))
    rgb = pm / np.maximum(am[..., None], 1e-4)
    out = np.dstack([np.clip(rgb, 0, 1), am])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    name = args[0]
    out = args[1] if len(args) > 1 else os.path.join(HERE, 'hd_floresta')
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    room = Room(name, terreno.load_maps()[name], seed=SEEDS[name])
    L, M, F = terrain(room)
    F['M'] = M
    # o ar que vê o céu por algum lado (para os pingentes: embaixo de beiral sim, dentro de casa não)
    F['air'] = exposure(M, angles=(-1.05, -0.7, -0.3, 0.0, 0.3, 0.7, 1.05), edge=True)
    if ONLY != 'pinhos':
        L.image().save(f'{out}/terreno-{name}-2x.png')
        downsample(L, M, room).save(f'{out}/terreno-{name}.png')
        print('terreno', name, round(time.time() - t0, 1), 's', flush=True)
    if ONLY != 'terreno':
        P = pines(room, F)
        P.image().save(f'{out}/pinhos-{name}-2x.png')
        downsample_soft(P, room).save(f'{out}/pinhos-{name}.png')
        print('pinhos', name, round(time.time() - t0, 1), 's', flush=True)

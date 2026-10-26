"""Terreno pintado de cada sala: a pedra, as tábuas e os espinhos viram uma tela única, alinhada
aos tiles da física. O mapa ASCII vira máscara em 2x, recebe cor de pedra com juntas irregulares,
luz (céu, contraluz do eclipse, lampiões), musgo, manchas de chuva e névoa, é pintado com
pinceladas e depois reduzido para os pixels do jogo (a paleta final vem de finaliza.py).

uso: python3 terreno.py <sala> [pasta_hd]
Sai <pasta_hd>/terreno-<sala>.png (2x, com transparência) e terreno-<sala>-mask.png (1x).
"""
import math
import os
import re
import sys
import time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from brush import Layer, hexc, mix, sstep, blur, value_noise, paint

HERE = os.path.dirname(os.path.abspath(__file__))
# --x: versão do EXTREME (só a 2x, em hd_x/): o miolo da rocha mostra a pedra talhada, os nichos de
# enterro e as fileiras de crânios, em vez de sumir no preto; as bordas continuam as mesmas
XMODE = '--x' in sys.argv
MAPS = os.path.join(HERE, '..', 'game', 'src', 'world', 'maps.ts')
TILE, S = 16, 2
T = TILE * S
PLANK_H = 6
BIG = 1e6


def load_maps():
    src = open(MAPS, encoding='utf-8').read()
    out = {}
    for m in re.finditer(r'export const MAP_(\w+)\s*=\s*\[(.*?)\];', src, re.S):
        rows = re.findall(r"'([^']*)'", m.group(2))
        w = max(len(r) for r in rows)
        out[m.group(1).lower()] = [r.ljust(w, '.') for r in rows]
    return out


class Room:
    def __init__(self, name, rows, seed):
        self.name = name
        self.rows = rows
        self.h, self.w = len(rows), len(rows[0])
        self.g = np.array([list(r) for r in rows])
        self.H, self.W = self.h * T, self.w * T
        self.rng = np.random.default_rng(seed)
        self.spawns = [(c, x, y) for y, r in enumerate(rows) for x, c in enumerate(r) if c not in '.#-^~']
        yy, xx = np.mgrid[0:self.H, 0:self.W]
        self.yy = yy.astype(np.float32)
        self.xx = xx.astype(np.float32)

    def cells(self, ch):
        return self.g == ch

    def px(self, cells):
        return np.kron(cells.astype(np.uint8), np.ones((T, T), np.uint8)).astype(bool)

    def spawn_px(self, kinds):
        """Pé dos objetos do mapa em pixels 2x (centro do tile, base do tile)."""
        return [((x + 0.5) * T, (y + 1) * T, c) for (c, x, y) in self.spawns if c in kinds]


def chip_corners(room, M, top_max=2.0, bot_max=6.0):
    """Lasca os cantos expostos da pedra (só para dentro, para não sair da caixa de colisão)."""
    sol = room.cells('#')
    h, w = sol.shape
    rng = room.rng

    def s(x, y):
        return True if (x < 0 or x >= w or y < 0 or y >= h) else bool(sol[y, x])

    for y in range(h):
        for x in range(w):
            if not sol[y, x]:
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


def fields(M):
    """Distâncias (em pixels 2x) de cada pixel de pedra até o vazio: geral e em cada direção."""
    H, W = M.shape
    P = np.pad(M, T, constant_values=True)
    d = ndi.distance_transform_edt(P)[T:-T, T:-T].astype(np.float32)
    yy = np.broadcast_to(np.arange(H, dtype=np.float32)[:, None], (H, W))
    xx = np.broadcast_to(np.arange(W, dtype=np.float32)[None, :], (H, W))
    dtop = yy - np.maximum.accumulate(np.where(~M, yy, -BIG), axis=0)
    dbot = np.minimum.accumulate(np.where(~M, yy, BIG)[::-1], axis=0)[::-1] - yy
    dleft = xx - np.maximum.accumulate(np.where(~M, xx, -BIG), axis=1)
    dright = np.minimum.accumulate(np.where(~M, xx, BIG)[:, ::-1], axis=1)[:, ::-1] - xx
    return d, dtop.astype(np.float32), dbot.astype(np.float32), dleft.astype(np.float32), dright.astype(np.float32)


def masonry(room, course=24, wmin=34, wmax=84, wobble=2.2):
    """Fiadas de pedra com juntas tremidas: id da pedra, posição dentro dela (u, v) e distância às juntas
    da esquerda e da direita (px)."""
    H, W, rng = room.H, room.W, room.rng
    ny = value_noise(H, W, 40, rng, 2)
    nx = value_noise(H, W, 40, rng, 2)
    yd = room.yy + (ny - 0.5) * 2 * wobble
    xd = room.xx + (nx - 0.5) * 2 * wobble
    ci = np.floor(yd / course).astype(np.int32)
    v = (yd / course - ci).astype(np.float32)
    sid = np.zeros((H, W), np.int64)
    u = np.zeros((H, W), np.float32)
    dl = np.zeros((H, W), np.float32)
    dr = np.zeros((H, W), np.float32)
    for c in range(ci.min(), ci.max() + 1):
        sel = ci == c
        if not sel.any():
            continue
        xs = [-rng.uniform(0, wmax)]
        while xs[-1] < W + wmax:
            xs.append(xs[-1] + rng.uniform(wmin, wmax))
        xs = np.array(xs, np.float32)
        x = xd[sel]
        k = np.clip(np.searchsorted(xs, x, side='right') - 1, 0, len(xs) - 2)
        left, right = xs[k], xs[k + 1]
        sid[sel] = (c + 10000) * 100000 + k
        u[sel] = (x - left) / (right - left)
        dl[sel] = x - left
        dr[sel] = right - x
    _, inv = np.unique(sid, return_inverse=True)
    inv = inv.reshape(H, W)
    return inv, u, v, dl, dr


def per_stone(inv, rng, fn):
    vals = fn(rng, inv.max() + 1).astype(np.float32)
    return vals[inv]


# ======================================================================================
# Ponte: pedra de ardósia molhada, musgo, contraluz dourada do eclipse e lampiões
# ======================================================================================
def bridge(room):
    rng = room.rng
    H, W = room.H, room.W
    yy, xx = room.yy, room.xx
    ST_D = hexc(0x0b0e17)
    STONES = [hexc(0x262d3e), hexc(0x2b3142), hexc(0x232a36), hexc(0x2e2c36), hexc(0x29312f)]  # ardósia, cinza, azul, quente, limo
    ST_L = hexc(0x5a6784)
    SHEEN = hexc(0xb7c6de)
    MOSS_D, MOSS_M, MOSS_L = hexc(0x16241a), hexc(0x2b4127), hexc(0x5f7a37)
    GOLD = hexc(0xe7a957)
    COLD = hexc(0x8a9cc0)
    WARM = hexc(0xffa24a)
    FOG = hexc(0x2e3954)
    course = 30

    sol = room.cells('#')
    M = room.px(sol)
    M = chip_corners(room, M)
    d, dtop, dbot, dleft, dright = fields(M)
    inv, u, v, dl, dr = masonry(room, course=course, wmin=44, wmax=120, wobble=3.2)
    n = inv.max() + 1
    kind = rng.choice(len(STONES), n, p=[0.36, 0.22, 0.2, 0.12, 0.1])
    base = np.array(STONES, np.float32)[kind][inv]
    tone = (1 + 0.16 * np.clip(rng.normal(0, 1, n), -2, 2)).astype(np.float32)[inv]
    tilt = rng.uniform(-0.12, 0.12, n).astype(np.float32)[inv]  # cada pedra pende um pouco para um lado
    col = base * (tone * (1 + tilt * (u - 0.5)))[..., None]
    # chanfros: aresta de cima fria, aresta da direita dourada, base e lado esquerdo no escuro
    ty = v * course
    by = (1 - v) * course
    top_b = sstep(3.5, 0.5, ty) * sstep(0.0, 2.0, np.minimum(dl, dr))
    bot_b = sstep(4.0, 0.5, by)
    rgt_b = sstep(3.5, 0.5, dr) * sstep(0.5, 2.5, ty)
    lft_b = sstep(3.0, 0.5, dl)
    col = mix(col, col * 1.45 + COLD * 0.08, (top_b * 0.6)[..., None])
    col = mix(col, col * 0.55, (bot_b * 0.7)[..., None])
    col = mix(col, col * 1.2 + GOLD * 0.12, (rgt_b * 0.5)[..., None])
    col = mix(col, col * 0.75, (lft_b * 0.5)[..., None])
    # juntas: vão escuro entre as pedras (algumas quase somem sob o limo)
    joint = np.maximum(sstep(1.8, 0.4, np.minimum(ty, by)), sstep(1.6, 0.4, np.minimum(dl, dr)))
    jvis = 0.45 + 0.55 * sstep(0.35, 0.6, value_noise(H, W, 60, rng, 2))
    col = mix(col, ST_D, (joint * jvis * 0.85)[..., None])
    # textura fina de pedra gasta
    fine = value_noise(H, W, 6, rng, 2)
    col *= (1 + (fine - 0.5) * 0.24)[..., None]
    pits = value_noise(H, W, 3, rng, 1) > 0.82
    col *= (1 - 0.25 * pits)[..., None]

    # profundidade: o miolo da pedra afunda no escuro
    dt = d / T
    k = np.maximum(0.26, 1 - np.maximum(0, dt - 0.5) * 0.36)
    col = mix(ST_D, col, k[..., None])
    # luz do céu de tempestade de cima e brilho de pedra molhada na quina
    sky = np.exp(-dtop / (8 * S))
    col = mix(col, col * 1.5 + ST_L * 0.12, (sky * 0.5)[..., None])
    col = mix(col, SHEEN, (sstep(1.6 * S, 0.2 * S, dtop) * 0.75)[..., None])
    # contraluz do eclipse nas faces viradas para a direita, fria nas da esquerda
    col = mix(col, GOLD, (sstep(2.2 * S, 0.3 * S, dright) * 0.6 * (0.5 + 0.5 * sky))[..., None])
    col = mix(col, col + GOLD * 0.18, (np.exp(-dright / (9 * S)) * 0.5)[..., None])
    col = mix(col, COLD, (sstep(1.8 * S, 0.3 * S, dleft) * 0.35)[..., None])
    # parte de baixo da ponte na sombra
    col *= (1 - 0.5 * np.exp(-dbot / (16 * S)))[..., None]
    # pilares entram na névoa do abismo
    fog_t = sstep(24.5 * T, 33.5 * T, yy) * 0.8
    col = mix(col, FOG, fog_t[..., None])
    # lampiões acesos esquentam a pedra perto
    for (lx, ly, c) in room.spawn_px('LG'):
        cy = ly - 44 * S
        r = np.hypot(xx - lx, (yy - cy) * 1.2)
        glow = np.exp(-(r / (60 * S)) ** 2) * (0.3 + 0.7 * np.exp(-dtop / (10 * S)))
        col = mix(col, col * 0.5 + WARM * 0.7, (glow * (0.6 if c == 'L' else 0.42))[..., None])
    col = np.clip(col, 0, 1)

    mask = M.astype(np.float32)
    L = Layer(W, H)
    L.fill(col, mask)
    # pinceladas curtas por cima, seguindo as fiadas: a textura de tinta sem borrar as juntas
    flow = (value_noise(H, W, 40, rng, 2) - 0.5) * 0.4
    passes = [
        dict(size=6.5, spacing=0.9, length=(1.6, 3.4), err=0.0, alpha=0.55, bristle=0.55, dry=0.45, blur=0.12, taper=0.35, ang_jitter=0.12),
        dict(size=3.4, spacing=0.95, length=(1.6, 3.2), err=0.0, alpha=0.6, bristle=0.5, dry=0.4, blur=0.06, taper=0.4, ang_jitter=0.18),
    ]
    paint(L, col, mask * (1 - joint * 0.9), flow, rng, passes, val_jitter=0.09, jitter=0.012, clip_soft=0, base=0.0)
    glaze = [dict(size=20, spacing=1.1, length=(1.5, 3.0), err=0.0, alpha=0.22, bristle=0.5, dry=0.5, blur=0.6, taper=0.3, ang_jitter=0.3)]
    paint(L, col, mask, flow, rng, glaze, val_jitter=0.16, jitter=0.02, clip_soft=0, base=0.0)
    # musgo em tufos nas quinas de cima
    moss_tufts(room, L, M, dtop, k, MOSS_D, MOSS_M, MOSS_L)
    details_bridge(room, L, M, dtop, k)
    planks(room, L, hexc(0x20140f), hexc(0x43291c), hexc(0x7a5739), SHEEN)
    spikes(room, L, hexc(0x0d0f15), hexc(0x30364a), hexc(0x8d9ab4), hexc(0x4a2a1e))
    return L, M


def moss_tufts(room, L, M, dtop, k, MD, MM, ML):
    """Musgo nas quinas de cima: pinceladas curtas e escuras, com luz só nas pontas. Pode passar
    1 pixel acima da pedra (como um tufo), nunca mais que isso."""
    rng = room.rng
    up = M.copy()
    up[:-2] |= M[2:]
    clip = up.astype(np.float32)
    H, W = M.shape
    edge = M & (dtop < 1.5)
    ys, xs = np.nonzero(edge[:, ::2])
    xs = xs * 2
    dens = value_noise(H, W, 46, rng, 2)
    keep = (rng.random(len(xs)) < 0.45) & (dens[ys, xs] > 0.52)
    for y, x in zip(ys[keep], xs[keep]):
        ln = rng.uniform(3, 9) * S
        L.stroke(x + rng.normal(0, 2), y + rng.uniform(1.0, 3.5) * S, rng.normal(0, 0.25), ln, rng.uniform(1.6, 3.2) * S,
                 mix(MD, MM, rng.random() * 0.7), 0.9, rng, 0.45, 0.3, taper=0.6, clip=clip)
    keep2 = (rng.random(len(xs)) < 0.3) & (dens[ys, xs] > 0.6)
    for y, x in zip(ys[keep2], xs[keep2]):
        L.stroke(x + rng.normal(0, 2), y + rng.uniform(0.2, 1.2) * S, rng.normal(0, 0.3), rng.uniform(2, 5) * S, rng.uniform(0.8, 1.4) * S,
                 mix(MM, ML, rng.random()), 0.85, rng, 0.3, 0.2, taper=0.7, clip=clip)
    # fios escorrendo
    keep3 = (rng.random(len(xs)) < 0.025) & (dens[ys, xs] > 0.55)
    for y, x in zip(ys[keep3], xs[keep3]):
        ln = rng.uniform(5, 18) * S
        L.stroke(x, y + ln / 2, math.pi / 2 + rng.normal(0, 0.05), ln, rng.uniform(1.4, 2.6) * S, mix(MD, MM, rng.random()), 0.9, rng,
                 0.35, 0.3, taper=0.85, clip=clip)


def details_bridge(room, L, M, dtop, k):
    """Manchas de água escorrendo das quinas e fios de musgo pendurados."""
    rng = room.rng
    clip = M.astype(np.float32)
    H, W = M.shape
    # quinas de cima: pixels de pedra com vazio logo acima
    edge = M & (dtop < 1.5)
    ys, xs = np.nonzero(edge[:, ::3])
    xs = xs * 3
    pick = rng.random(len(xs)) < 0.045
    for y, x in zip(ys[pick], xs[pick]):
        ln = rng.uniform(10, 70) * S
        c = hexc(0x10141f)
        L.stroke(x + rng.normal(0, 1), y + ln / 2 + 2 * S, math.pi / 2 + rng.normal(0, 0.03), ln, rng.uniform(1.5, 4) * S,
                 c, rng.uniform(0.18, 0.4), rng, 0.5, 0.6, taper=0.7, clip=clip)


def planks(room, L, WD, WM, WL, SHEEN):
    """Tábuas das plataformas atravessáveis: madeira molhada com emendas e pregos."""
    rng = room.rng
    oneway = room.cells('-')
    ys, xs = np.nonzero(oneway)
    if not len(xs):
        return
    ph = PLANK_H * S
    m = np.zeros((room.H, room.W), np.float32)
    for y, x in zip(ys, xs):
        m[y * T:y * T + ph, x * T:(x + 1) * T] = 1
    H, W = m.shape
    yy, xx = room.yy, room.xx
    # tábuas: emendas a cada 1 ou 2 tiles
    seams = np.zeros(W, np.float32)
    x = 0.0
    while x < W:
        x += rng.choice([T, 1.5 * T, 2 * T]) + rng.normal(0, 3)
        xi = int(x)
        if 0 <= xi < W:
            seams[max(0, xi - 1):xi + 1] = 1
    grain = value_noise(H, W, 5, rng, 2)
    v = (yy % T) / ph
    f = 0.85 + 0.3 * (grain - 0.5) + 0.25 * (1 - v) ** 4 - 0.35 * v ** 3
    col = WM * np.clip(f, 0.2, 1.5)[..., None]
    col = mix(col, WD, (seams[None, :] * 0.85 + 0 * yy)[..., None])
    col = mix(col, SHEEN, ((v < 0.12) * 0.45)[..., None])
    flow = np.zeros((H, W), np.float32)
    passes = [
        dict(size=5, spacing=0.7, length=(3, 7), err=0.0, alpha=0.85, bristle=0.45, dry=0.3, blur=0.3, taper=0.3, ang_jitter=0.03),
        dict(size=2.6, spacing=0.8, length=(3, 6), err=0.04, alpha=0.9, bristle=0.4, dry=0.3, blur=0.2, taper=0.4, ang_jitter=0.03),
    ]
    paint(L, np.clip(col, 0, 1), m, flow, rng, passes, val_jitter=0.05, clip_soft=0, base=1.0)
    # pregos
    for y, x in zip(ys, xs):
        if rng.random() < 0.5:
            L.dab(x * T + rng.uniform(4, T - 4), y * T + ph * 0.5, 1.1 * S, WL * 1.2, 0.9, 0.6)


def spikes(room, L, KD, KM, KL, RUST):
    """Espinhos de ferro: duas pontas por tile, saindo da base do tile."""
    rng = room.rng
    sp = room.cells('^')
    ys, xs = np.nonzero(sp)
    for y, x in zip(ys, xs):
        base = (y + 1) * T
        for i in range(2):
            cx = x * T + T * (0.27 + 0.48 * i) + rng.normal(0, 1.2)
            top = y * T + rng.uniform(7, 11)
            hw = rng.uniform(5.5, 7.5)
            ys2, xs2 = np.mgrid[int(top):base, int(cx - hw - 1):int(cx + hw + 2)]
            t = (ys2 + 0.5 - top) / (base - top)
            half = hw * t
            dx = xs2 + 0.5 - cx
            a = sstep(half + 0.7, half - 0.7, np.abs(dx)) * (t > 0)
            shade = np.where(dx > 0, 1.0, 0.0)
            colv = KD + (KM - KD) * (0.35 + 0.65 * shade)[..., None] * (1 - 0.5 * t)[..., None]
            colv = colv + (KL - colv) * (sstep(-0.5, 1.5, dx) * sstep(half, half - 2.2, dx) * (1 - t) * 0.9)[..., None]
            colv = colv + (RUST - colv) * (sstep(0.55, 1.0, t) * 0.6)[..., None]
            P = L.P[int(top):base, int(cx - hw - 1):int(cx + hw + 2)]
            A = L.A[int(top):base, int(cx - hw - 1):int(cx + hw + 2)]
            P *= 1 - a[..., None]
            P += colv * a[..., None]
            A *= 1 - a
            A += a


# ======================================================================================
# Catacumbas: pedra talhada e grossa, poeira nos pisos, nichos de ossos e luz de velas
# ======================================================================================
def catacomb(room):
    rng = room.rng
    H, W = room.H, room.W
    yy, xx = room.yy, room.xx
    ST_D = hexc(0x050609)
    STONES = [hexc(0x24212a), hexc(0x29252b), hexc(0x1f2129), hexc(0x2c2726), hexc(0x212622)]
    DUST = hexc(0x8a8070)
    COLD = hexc(0x55607a)
    WARM = hexc(0xffa64e)
    course = 36

    sol = room.cells('#')
    M = room.px(sol)
    M = chip_corners(room, M, top_max=2.0, bot_max=7.0)
    d, dtop, dbot, dleft, dright = fields(M)
    inv, u, v, dl, dr = masonry(room, course=course, wmin=54, wmax=150, wobble=4.5)
    n = inv.max() + 1
    kind = rng.choice(len(STONES), n, p=[0.34, 0.22, 0.2, 0.14, 0.1])
    base = np.array(STONES, np.float32)[kind][inv]
    tone = (1 + 0.18 * np.clip(rng.normal(0, 1, n), -2, 2)).astype(np.float32)[inv]
    tilt = rng.uniform(-0.15, 0.15, n).astype(np.float32)[inv]
    col = base * (tone * (1 + tilt * (u - 0.5)))[..., None]
    ty = v * course
    by = (1 - v) * course
    top_b = sstep(4.0, 0.5, ty) * sstep(0.0, 2.0, np.minimum(dl, dr))
    bot_b = sstep(5.0, 0.5, by)
    col = mix(col, col * 1.4, (top_b * 0.55)[..., None])
    col = mix(col, col * 0.5, (bot_b * 0.75)[..., None])
    col = mix(col, col * 0.7, (sstep(3.0, 0.5, dl) * 0.5)[..., None])
    joint = np.maximum(sstep(2.2, 0.4, np.minimum(ty, by)), sstep(2.0, 0.4, np.minimum(dl, dr)))
    jvis = 0.4 + 0.6 * sstep(0.35, 0.6, value_noise(H, W, 70, rng, 2))
    col = mix(col, ST_D, (joint * jvis * 0.9)[..., None])
    fine = value_noise(H, W, 7, rng, 2)
    col *= (1 + (fine - 0.5) * 0.3)[..., None]
    pits = value_noise(H, W, 3, rng, 1) > 0.8
    col *= (1 - 0.3 * pits)[..., None]
    # o miolo da rocha some no preto (como no Limbo): só as bordas dos túneis aparecem. No EXTREME
    # a pedra talhada continua lá dentro, apagada, com os nichos de enterro (loculi, mais abaixo)
    dt = d / T
    if XMODE:
        k = np.maximum(0.2 + 0.05 * value_noise(H, W, 220, rng, 2), 1 - np.maximum(0, dt - 0.35) * 0.62)
    else:
        k = np.maximum(0.06, 1 - np.maximum(0, dt - 0.35) * 0.62)
    col = mix(ST_D, col, k[..., None])
    # pisos com poeira, tetos no escuro, luz fria dos túneis nas paredes
    col = mix(col, col * 1.35 + DUST * 0.1, (np.exp(-dtop / (5 * S)) * 0.6)[..., None])
    col = mix(col, DUST, (sstep(1.4 * S, 0.2 * S, dtop) * 0.55)[..., None])
    side = np.exp(-np.minimum(dleft, dright) / (2.0 * S))
    col = mix(col, COLD, (side * 0.22)[..., None])
    col *= (1 - 0.55 * np.exp(-dbot / (12 * S)))[..., None]
    # velas e o espelho esquentam a pedra perto
    for (lx, ly, c) in room.spawn_px('CMR'):
        cy = ly - (16 if c in 'CR' else 84) * S
        r = np.hypot(xx - lx, (yy - cy) * 1.15)
        rad = (80 if c == 'C' else 100 if c == 'R' else 130) * S
        glow = np.exp(-(r / rad) ** 2) * (0.35 + 0.65 * np.exp(-np.minimum(dtop, np.minimum(dleft, dright)) / (12 * S)))
        tint = WARM if c in 'CR' else hexc(0xffe3a8)
        col = mix(col, col * 0.4 + tint * 0.75, (glow * 0.6)[..., None])
    col = np.clip(col, 0, 1)
    mask = M.astype(np.float32)
    L = Layer(W, H)
    L.fill(col, mask)
    near = (M & (d < 3.2 * T)).astype(np.float32) if not XMODE else M.astype(np.float32)
    flow = (value_noise(H, W, 40, rng, 2) - 0.5) * 0.5
    passes = [
        dict(size=7, spacing=0.9, length=(1.6, 3.4), err=0.0, alpha=0.55, bristle=0.55, dry=0.45, blur=0.12, taper=0.35, ang_jitter=0.14),
        dict(size=3.6, spacing=0.95, length=(1.6, 3.2), err=0.0, alpha=0.6, bristle=0.5, dry=0.4, blur=0.06, taper=0.4, ang_jitter=0.2),
    ]
    paint(L, col, near * (1 - joint * 0.9), flow, rng, passes, val_jitter=0.1, jitter=0.012, clip_soft=0, base=0.0)
    glaze = [dict(size=22, spacing=1.1, length=(1.5, 3.0), err=0.0, alpha=0.2, bristle=0.5, dry=0.5, blur=0.6, taper=0.3, ang_jitter=0.3)]
    paint(L, col, near, flow, rng, glaze, val_jitter=0.16, jitter=0.02, clip_soft=0, base=0.0)
    if XMODE:
        loculi(room, L, M, d, k)
    moss_tufts(room, L, M, dtop, k, hexc(0x141c16), hexc(0x23301f), hexc(0x46582c))
    planks(room, L, hexc(0x1a110c), hexc(0x3a261a), hexc(0x6a4c33), DUST)
    # pontas mais claras: no fundo escuro do abismo os espinhos precisam aparecer
    spikes(room, L, hexc(0x0d0f15), hexc(0x3c4254), hexc(0xc2cad8), hexc(0x4a2a1e))
    return L, M


def ossuary(room, L, M, d, dleft, dright, dtop, dbot):
    """Nichos com crânios nas paredes dos túneis (só nas faces laterais, longe do chão)."""
    rng = room.rng
    H, W = M.shape
    BONE, BONE_D = hexc(0x6e665a), hexc(0x38332d)
    clip = M.astype(np.float32)
    wall = M & (np.minimum(dleft, dright) > 2 * S) & (np.minimum(dleft, dright) < 1.6 * T) & (dtop > 1.2 * T) & (dbot > 0.8 * T) & (d < 1.6 * T)
    ys, xs = np.nonzero(wall[::8, ::8])
    ys, xs = ys * 8, xs * 8
    order = rng.permutation(len(xs))
    placed = []
    for i in order[: max(1, len(order) // 110)]:
        x, y = float(xs[i]), float(ys[i])
        if any(abs(x - px) < 3 * T and abs(y - py) < 2 * T for px, py in placed):
            continue
        placed.append((x, y))
        nw, nh = rng.uniform(18, 30) * S, rng.uniform(9, 13) * S
        x0, y0 = int(x - nw / 2), int(y - nh / 2)
        x1, y1 = int(x + nw / 2), int(y + nh / 2)
        if x0 < 0 or y0 < 0 or x1 >= W or y1 >= H or not M[y0:y1, x0:x1].all():
            continue
        # recesso do nicho, com borda de cima arredondada
        yy2, xx2 = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        cx = (x0 + x1) / 2
        rx = (x1 - x0) / 2
        top_round = np.where(np.abs(xx2 - cx) > rx * 0.7, y0 + (np.abs(xx2 - cx) - rx * 0.7) * 0.6, y0)
        a = (yy2 >= top_round).astype(np.float32)
        P = L.P[y0:y1, x0:x1]
        A = L.A[y0:y1, x0:x1]
        dark = hexc(0x07080b)
        P *= 1 - a[..., None] * 0.85
        P += dark * (a * 0.85)[..., None]
        # crânios em fila no fundo do nicho
        nsk = int(nw // (6 * S))
        for k in range(nsk):
            sx = x0 + (k + 0.5) * (x1 - x0) / nsk + rng.normal(0, 0.6)
            sy = y1 - 3.2 * S
            r = 2.4 * S
            L.dab(sx, sy - r * 0.2, r, mix(BONE_D, BONE, rng.uniform(0.3, 0.8)), 0.9, 0.7)
            L.dab(sx - r * 0.38, sy - r * 0.1, r * 0.3, dark, 0.9, 0.4)
            L.dab(sx + r * 0.38, sy - r * 0.1, r * 0.3, dark, 0.9, 0.4)


def loculi(room, L, M, d, k):
    """EXTREME: nichos de enterro cavados fundo na rocha das catacumbas, em galerias (grupos de
    fileiras), longe das bordas. Uns abertos (o crânio e os ossos no escuro), uns fechados com uma
    laje da mesma pedra (a marca do eclipse riscada nela) e uns quebrados. Ficam no tom apagado do
    miolo: aparecem sem chamar o olho e sem confundir com o caminho."""
    rng = room.rng
    H, W = M.shape
    BONE, BONE_D = hexc(0x5a544a), hexc(0x2a2622)
    DARK = hexc(0x040406)
    deep = M & (d > 1.5 * T)
    clusters = value_noise(H, W, 260, rng, 2)
    fine = value_noise(H, W, 5, rng, 2)
    clip = M.astype(np.float32)
    placed = 0
    ch = 17 * S
    gy = ch + 11 * S
    for y0 in range(int(rng.uniform(0, gy)), H - ch, gy):
        cw = int(rng.choice([36, 42, 46]) * S)
        gx = cw + int(rng.uniform(7, 10) * S)
        for x0 in range(int(rng.uniform(0, gx)), W - cw, gx):
            x1, y1 = x0 + cw, y0 + ch
            if not deep[y0:y1, x0:x1].all() or clusters[(y0 + y1) // 2, (x0 + x1) // 2] < 0.47 or rng.random() < 0.18:
                continue
            placed += 1
            yy2, xx2 = np.mgrid[y0:y1, x0:x1].astype(np.float32)
            cx = (x0 + x1) / 2
            rx = cw / 2
            top = np.where(np.abs(xx2 - cx) > rx * 0.8, y0 + (np.abs(xx2 - cx) - rx * 0.8) * 0.7, y0)
            a = (yy2 >= top).astype(np.float32)
            P = L.P[y0:y1, x0:x1]
            stone = P.reshape(-1, 3).mean(0)
            # a borda de cima do nicho pega um fio de luz, a de baixo afunda (talhado na pedra)
            lip = ((yy2 - top) < 1.5 * S) * a
            sill = (yy2 > y1 - 2.2 * S) * a
            kind = rng.random()
            if kind < 0.4:
                # aberto: fundo escuro, mais fundo em cima; o crânio e os ossos longos deitados
                depth = np.clip((yy2 - y0) / ch, 0, 1)
                inner = mix(DARK, stone * 0.35, (depth * 0.6)[..., None])
                P[:] = P * (1 - a[..., None]) + inner * a[..., None]
                for _ in range(2):
                    L.stroke(rng.uniform(x0 + 6 * S, x1 - 6 * S), y1 - 2.6 * S, rng.normal(0, 0.06), rng.uniform(12, 20) * S, 1.5 * S,
                             mix(BONE_D, BONE, rng.uniform(0.2, 0.5)), 0.85, rng, 0.25, 0.15, taper=0.2, clip=clip)
                bx = rng.uniform(x0 + cw * 0.25, x1 - cw * 0.25)
                by = y1 - 4.4 * S
                r = 3.0 * S
                L.dab(bx, by - r * 0.1, r, mix(BONE_D, BONE, rng.uniform(0.45, 0.75)), 0.92, 0.6)
                L.dab(bx - r * 0.38, by, r * 0.3, DARK, 0.95, 0.4)
                L.dab(bx + r * 0.38, by, r * 0.3, DARK, 0.95, 0.4)
                L.dab(bx, by + r * 0.55, r * 0.45, mix(BONE_D, BONE, 0.3), 0.8, 0.6)
            else:
                # laje da mesma pedra, um pouco mais clara, gasta e manchada
                n = rng.uniform(0.92, 1.12)
                slab = stone * 1.18 * n * (1 + (fine[y0:y1, x0:x1] - 0.5) * 0.35)[..., None]
                slab = mix(slab, slab * 1.25, (((yy2 - top) < 2 * S) * 0.6)[..., None])
                slab = mix(slab, slab * 0.6, (((x1 - xx2) < 2 * S) | (yy2 > y1 - 2 * S)).astype(np.float32)[..., None] * 0.7)
                if kind < 0.85:
                    P[:] = P * (1 - a[..., None]) + slab * a[..., None]
                    # o eclipse riscado: um anel fino e o miolo escuro
                    er = ch * 0.2
                    ex, ey = cx + rng.uniform(-cw * 0.18, cw * 0.18), y0 + ch * 0.52
                    rr = np.hypot(xx2 - ex, yy2 - ey)
                    P *= (1 - (np.abs(rr - er) < 0.8 * S) * a * 0.45)[..., None]
                    P *= (1 - (rr < er * 0.55) * a * 0.3)[..., None]
                    L.stroke(rng.uniform(x0, x1), rng.uniform(y0, y1), rng.uniform(0, math.pi), rng.uniform(8, 18) * S, 0.6 * S, DARK, 0.5, rng,
                             0.2, 0.2, taper=0.8, clip=clip)
                else:
                    # quebrada: um pedaço caiu e mostra o escuro de dentro
                    cut = (xx2 - x0) / cw + (yy2 - y0) / ch * 0.45 + rng.normal(0, 0.05) > rng.uniform(0.55, 0.85)
                    hole = a * cut
                    keep = a * (1 - cut)
                    P[:] = P * (1 - keep[..., None]) + slab * keep[..., None]
                    P[:] = P * (1 - hole[..., None] * 0.9) + DARK * (hole * 0.9)[..., None]
            P[:] = mix(P, P * 1.3, (lip * 0.5)[..., None])
            P[:] = mix(P, P * 0.55, (sill * 0.5)[..., None])
    return placed


# ======================================================================================
# Lembrança: vale ensolarado, grama alta em cima da terra e luz quente do sol
# ======================================================================================
def memory(room):
    rng = room.rng
    H, W = room.H, room.W
    yy, xx = room.yy, room.xx
    E_D, E_M, E_L = hexc(0x2b1a12), hexc(0x5e3d25), hexc(0x94683f)
    E_R = hexc(0x7a4a2c)  # terra avermelhada
    G_D, G_M, G_L, G_S = hexc(0x2c6328), hexc(0x4c9234), hexc(0x8cc650), hexc(0xdcf290)
    SUN = hexc(0xfff1c8)
    SHADE = hexc(0x3a3a52)
    STONE_D, STONE_L = hexc(0x5d5a58), hexc(0xa8a49a)

    sol = room.cells('#')
    wet = room.cells('~')
    M = room.px(sol)
    M = chip_corners(room, M, top_max=1.5, bot_max=4.0)
    d, dtop, dbot, dleft, dright = fields(M)
    # terra em camadas tortas, com veios avermelhados
    warp = (value_noise(H, W, 110, rng, 2) - 0.5) * 70
    band = np.sin((yy + warp) / (7 * S)) * 0.5 + 0.5
    band2 = np.sin((yy + warp * 1.4) / (19 * S) + 1.3) * 0.5 + 0.5
    strata = value_noise(H, W, 30, rng, 2)
    col = mix(E_M, E_L, (band * 0.45 + (strata - 0.5) * 0.5)[..., None])
    col = mix(col, E_R, (sstep(0.55, 0.9, band2) * 0.45)[..., None])
    fine = value_noise(H, W, 5, rng, 2)
    col *= (1 + (fine - 0.5) * 0.3)[..., None]
    dt = d / T
    k = np.maximum(0.4, 1 - np.maximum(0, dt - 0.7) * 0.2)
    col = mix(E_D, col, k[..., None])
    # o sol vem do alto à esquerda: faces da esquerda claras, da direita na sombra azulada
    col = mix(col, col * 1.3 + SUN * 0.12, (np.exp(-dleft / (3 * S)) * 0.55)[..., None])
    col = mix(col, col * 0.6 + SHADE * 0.25, (np.exp(-dright / (5 * S)) * 0.55)[..., None])
    col *= (1 - 0.35 * np.exp(-dbot / (8 * S)))[..., None]
    # grama: faixa grossa em cima (não no fundo do riacho) e sombra logo abaixo dela
    under_water = np.zeros_like(M)
    wpx = room.px(wet)
    under_water[1:] = wpx[:-1]
    under_water = np.maximum.accumulate(under_water & M, axis=0) & M & (dtop < 12 * S)
    gdepth = (7 + 5 * value_noise(H, W, 26, rng, 2)) * S
    gm = sstep(gdepth, gdepth * 0.7, dtop) * (~under_water)
    col = mix(col, E_D * 0.8, (np.exp(-np.maximum(0, dtop - gdepth) / (3 * S)) * (dtop > gdepth * 0.8) * 0.55 * (~under_water))[..., None])
    gtone = value_noise(H, W, 4, rng, 2)
    gcol = mix(G_D, G_M, sstep(0.0, 0.8, 1 - dtop / gdepth)[..., None])
    gcol = mix(gcol, G_L, (sstep(0.5, 0.9, gtone) * sstep(gdepth * 0.6, 0, dtop))[..., None])
    gcol = mix(gcol, G_S, (sstep(1.2 * S, 0, dtop) * 0.55)[..., None])
    col = mix(col, gcol, gm[..., None])
    col = np.clip(col, 0, 1)
    mask = M.astype(np.float32)
    L = Layer(W, H)
    L.fill(col, mask)
    near = (M & (d < 4 * T)).astype(np.float32)
    flow = np.where(dtop < gdepth, -math.pi / 2, 0.0).astype(np.float32) + (value_noise(H, W, 30, rng, 2) - 0.5) * 0.5
    passes = [
        dict(size=8, spacing=0.85, length=(1.6, 3.8), err=0.0, alpha=0.7, bristle=0.5, dry=0.4, blur=0.12, taper=0.35, ang_jitter=0.2),
        dict(size=4, spacing=0.9, length=(1.6, 3.4), err=0.0, alpha=0.7, bristle=0.45, dry=0.35, blur=0.06, taper=0.4, ang_jitter=0.25),
    ]
    paint(L, col, near, flow, rng, passes, val_jitter=0.12, jitter=0.015, clip_soft=0, base=0.0)
    # pedras e raízes na terra
    clip = mask
    ys, xs = np.nonzero((M & (d > 6 * S) & (d < 3 * T))[::6, ::6])
    for y, x in zip(ys * 6, xs * 6):
        if rng.random() < 0.006:
            r = rng.uniform(2.5, 5) * S
            L.dab(x, y, r, mix(E_D, STONE_D, rng.uniform(0.3, 0.7)), 0.85, 1.2)
            L.dab(x - r * 0.3, y - r * 0.35, r * 0.4, mix(STONE_D, STONE_L, 0.4), 0.5, 1.0)
        elif rng.random() < 0.02:
            ang = rng.uniform(0.3, 1.2) * rng.choice([-1, 1]) + math.pi / 2
            L.stroke(x, y, ang, rng.uniform(10, 28) * S, rng.uniform(0.8, 1.6) * S, E_D, 0.75, rng, 0.2, 0.1, taper=0.8, bend=0.6, clip=clip)
    grass_blades(room, L, M & ~under_water, dtop, G_D, G_M, G_L, G_S)
    planks(room, L, hexc(0x3a2416), hexc(0x6a4528), hexc(0xa07448), SUN)
    return L, M


def grass_blades(room, L, M, dtop, GD, GM, GL, GS):
    """Folhas de grama saindo do chão: podem passar 2 pixels acima da terra, como tufos."""
    rng = room.rng
    up = M.copy()
    up[:-4] |= M[4:]
    clip = up.astype(np.float32)
    edge = M & (dtop < 1.5)
    ys, xs = np.nonzero(edge[:, ::2])
    xs = xs * 2
    keep = rng.random(len(xs)) < 0.75
    for y, x in zip(ys[keep], xs[keep]):
        ln = rng.uniform(4, 10) * S
        ang = -math.pi / 2 + rng.normal(0, 0.35)
        c = mix(GM, GL, rng.random()) if rng.random() < 0.7 else mix(GL, GS, rng.random())
        L.stroke(x + math.cos(ang) * ln * 0.4, y + 2 * S + math.sin(ang) * ln * 0.4, ang, ln, rng.uniform(0.8, 1.5) * S, c, 0.9, rng,
                 0.2, 0.1, taper=0.9, clip=clip)


THEMES = {'ponte': bridge, 'catacumbas': catacomb, 'memoria': memory, 'sinos': catacomb, 'cripta': catacomb, 'escadaria': catacomb,
          'nichos': catacomb}


SEEDS = {'ponte': 5, 'catacumbas': 7, 'memoria': 9, 'sinos': 11, 'cripta': 13, 'escadaria': 15, 'nichos': 17}


def downsample(L, M, room):
    """Reduz a pintura 2x para os pixels do jogo; o alfa sai exato da máscara de colisão."""
    img = L.image()
    W1, H1 = room.W // S, room.H // S
    arr = np.asarray(img, np.float32) / 255
    a = arr[..., 3:4]
    pm = arr[..., :3] * a
    pm = pm.reshape(H1, S, W1, S, 3).mean((1, 3))
    am = a[..., 0].reshape(H1, S, W1, S).mean((1, 3))
    rgb = pm / np.maximum(am[..., None], 1e-4)
    alpha = (am > 0.5).astype(np.float32)
    out = np.dstack([np.clip(rgb, 0, 1), alpha])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    name = args[0]
    out = args[1] if len(args) > 1 else os.path.join(HERE, 'hd')
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    room = Room(name, load_maps()[name], seed=SEEDS[name])
    L, M = THEMES[name](room)
    if XMODE:
        xo = os.path.join(HERE, 'hd_x')
        os.makedirs(xo, exist_ok=True)
        L.image().save(f'{xo}/terreno-{name}-2x.png')
        print('pronto (EXTREME)', name, round(time.time() - t0, 1), 's')
        sys.exit(0)
    L.image().save(f'{out}/terreno-{name}-2x.png')
    small = downsample(L, M, room)
    small.save(f'{out}/terreno-{name}.png')
    print('pronto', name, small.size, round(time.time() - t0, 1), 's')

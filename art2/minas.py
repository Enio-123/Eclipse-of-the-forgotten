"""Terreno pintado das Minas Abandonadas (capítulo 4), já no EXTREME.

A rocha é sedimento em camadas tortas (ocre, ferrugem, cinza de ardósia), quebrada em blocos por
fendas, com marcas de picareta nas paredes dos túneis, cascalho no chão e veios de Âmbar Mnêmico
correndo por dentro da pedra: um fio claro, quente, que brilha sozinho (o filtro do EXTREME não
escurece o que já é luz). Perto dos cristais acesos (x no mapa) a pedra pega a luz âmbar. O miolo da
rocha não some no preto: a pedra continua lá, apagada, com as camadas e as fendas.

uso: python3 minas.py <sala> [pasta] [--maps=arquivo.ts]
Sai <pasta>/terreno-<sala>-2x.png (2x) e terreno-<sala>.png (1x, alfa exato da física).
"""
import math
import os
import sys
import time
import numpy as np
from brush import Layer, hexc, mix, sstep, blur, value_noise, paint
import terreno
from terreno import Room, fields, chip_corners, planks, spikes, downsample, TILE, S, T

HERE = os.path.dirname(os.path.abspath(__file__))
MAPS = next((a[7:] for a in sys.argv if a.startswith('--maps=')), None)
if MAPS:
    terreno.MAPS = MAPS

SEEDS = {'boca': 41, 'trilhos': 43, 'alagada': 44, 'prensas': 45, 'veio': 47, 'espelhos': 49, 'capataz': 51}
# quanto Âmbar corre na pedra de cada sala (o veio é onde ele nasce)
VEINS = {'boca': 0.5, 'trilhos': 0.45, 'prensas': 0.4, 'veio': 1.0, 'espelhos': 0.8, 'capataz': 0.7}

ROCK_D = hexc(0x07060a)
ROCKS = [hexc(0x2e241d), hexc(0x3a2c22), hexc(0x2a2a2e), hexc(0x40301f), hexc(0x33291f)]  # ocre, ferrugem, ardósia, argila, umbra
DUST = hexc(0x9a8064)
GRAVEL = [hexc(0x4a3a2c), hexc(0x5e4a36), hexc(0x3a3230), hexc(0x6e5a44)]
AMBER_D, AMBER, AMBER_L = hexc(0x8a4a12), hexc(0xffa63c), hexc(0xffe6a6)
COLD = hexc(0x4c5670)
WARM = hexc(0xffa54a)


def iso_lines(H, W, rng, cell, warp, width):
    """Linhas finas: a curva de nível do meio de um ruído entortado (como as rachaduras do filtro),
    com a largura medida em pixels. Devolve 0..1 (1 em cima da linha)."""
    q = value_noise(H, W, cell, rng, 3)
    gy, gx = np.gradient(q)
    g = np.sqrt(gx * gx + gy * gy) + 1e-5
    d = np.abs(q - 0.5) / g
    return sstep(width, width * 0.3, d)


def joints(H, W, rng, cell, width, squash=1.7, show=(0.42, 0.62), amp=0.0):
    """Juntas da rocha: as bordas das células de Voronoi (blocos angulosos, mais largos que altos,
    como a pedra em camadas se parte), com a borda tremida e só em parte à mostra (cada fenda
    começa e termina dentro da pedra). Devolve 0..1 (1 em cima da fenda)."""
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
    dd, _ = tree.query(q, k=2, workers=-1)
    edge = ((dd[:, 1] - dd[:, 0]) * 0.5).reshape(H, W).astype(np.float32)
    vis = sstep(show[0], show[1], value_noise(H, W, cell * 1.3, rng, 2))
    return sstep(width, width * 0.3, edge) * vis


def mine(room, veins=0.5):
    rng = room.rng
    H, W = room.H, room.W
    yy, xx = room.yy, room.xx
    sol = room.cells('#')
    M = room.px(sol)
    M = chip_corners(room, M, top_max=2.5, bot_max=8.0)
    d, dtop, dbot, dleft, dright = fields(M)

    # camadas de sedimento: faixas tortas que pendem para um lado, cada uma com o seu tom
    tilt = rng.uniform(-0.12, 0.12)
    warp = (value_noise(H, W, 160, rng, 2) - 0.5) * 90 * S
    yb = yy + xx * tilt + warp
    band = np.floor(yb / (rng.uniform(16, 26) * S)).astype(np.int64)
    band -= band.min()
    nb = int(band.max()) + 1
    kind = rng.choice(len(ROCKS), nb, p=[0.3, 0.22, 0.2, 0.16, 0.12])
    col = np.array(ROCKS, np.float32)[kind][band]
    tone = (1 + 0.16 * np.clip(rng.normal(0, 1, nb), -2, 2)).astype(np.float32)[band]
    col *= tone[..., None]
    # dentro de cada faixa, listras finas e o grão da pedra
    fine_band = np.sin(yb / (2.6 * S) + value_noise(H, W, 30, rng, 2) * 6) * 0.5 + 0.5
    col *= (0.9 + 0.16 * fine_band)[..., None]
    grain = value_noise(H, W, 5, rng, 2)
    col *= (1 + (grain - 0.5) * 0.3)[..., None]
    pits = value_noise(H, W, 3, rng, 1) > 0.8
    col *= (1 - 0.28 * pits)[..., None]
    # fendas grandes partindo a pedra em blocos, e as pequenas
    big = joints(H, W, rng, 56 * S, 1.2 * S, squash=1.8, show=(0.36, 0.56), amp=5 * S)
    small = joints(H, W, rng, 22 * S, 0.6 * S, squash=1.4, show=(0.6, 0.76), amp=4 * S)
    cracks = np.maximum(big, small * 0.55)
    # o lado de cima da fenda pega luz, o de baixo afunda
    lit_edge = np.roll(cracks, 2 * S, axis=0) * (1 - cracks)
    col = mix(col, col * 1.3, (lit_edge * 0.5)[..., None])
    col = mix(col, ROCK_D, (cracks * 0.85)[..., None])

    # profundidade: o miolo afunda, mas a pedra continua visível
    dt = d / T
    k = np.maximum(0.22 + 0.06 * value_noise(H, W, 200, rng, 2), 1 - np.maximum(0, dt - 0.4) * 0.55)
    col = mix(ROCK_D, col, k[..., None])
    # chão com poeira e cascalho, teto no escuro, luz fria de baixo nas paredes
    col = mix(col, col * 1.35 + DUST * 0.08, (np.exp(-dtop / (6 * S)) * 0.6)[..., None])
    col = mix(col, DUST, (sstep(1.6 * S, 0.2 * S, dtop) * 0.5)[..., None])
    side = np.exp(-np.minimum(dleft, dright) / (2.4 * S))
    col = mix(col, COLD, (side * 0.16)[..., None])
    col *= (1 - 0.5 * np.exp(-dbot / (12 * S)))[..., None]

    # veios de Âmbar: fios quentes que seguem mais ou menos as camadas, cortados em trechos
    vein_q = value_noise(H, W, 70 * S, rng, 3)
    vy = yb / (46 * S) + (vein_q - 0.5) * 0.7
    vline = np.abs(((vy % 1.0) + 1.0) % 1.0 - 0.5)
    vgy, vgx = np.gradient(vy)
    vg = np.sqrt(vgx * vgx + vgy * vgy) + 1e-5
    vd = vline / vg
    seg = sstep(0.5, 0.66, value_noise(H, W, 90 * S, rng, 2)) * sstep(1.0 - veins * 0.9, 1.0 - veins * 0.6, value_noise(H, W, 140 * S, rng, 2))
    core = sstep(1.1 * S, 0.3 * S, vd) * seg * M
    halo = np.exp(-vd / (5 * S)) * seg * M
    col = mix(col, col * 0.6 + AMBER_D * 0.6, (halo * 0.55)[..., None])
    col = mix(col, AMBER, (core * 0.9)[..., None])
    col = mix(col, AMBER_L, (sstep(0.5 * S, 0.1 * S, vd) * seg * M * 0.85)[..., None])
    # cristais acesos (x) esquentam a pedra perto
    for (lx, ly, c) in room.spawn_px('x'):
        cy = ly - 8 * S
        r = np.hypot(xx - lx, (yy - cy) * 1.1)
        glow = np.exp(-(r / (70 * S)) ** 2) * (0.35 + 0.65 * np.exp(-np.minimum(dtop, np.minimum(dleft, np.minimum(dright, dbot))) / (10 * S)))
        col = mix(col, col * 0.45 + WARM * 0.7, (glow * 0.5)[..., None])
    col = np.clip(col, 0, 1)

    mask = M.astype(np.float32)
    L = Layer(W, H)
    L.fill(col, mask)
    flow = (math.atan(tilt) + (value_noise(H, W, 40, rng, 2) - 0.5) * 0.5).astype(np.float32)
    keep = 1 - np.maximum(cracks * 0.9, core * 0.95)
    passes = [
        dict(size=8, spacing=0.9, length=(1.8, 3.8), err=0.0, alpha=0.55, bristle=0.55, dry=0.45, blur=0.14, taper=0.35, ang_jitter=0.16),
        dict(size=4, spacing=0.95, length=(1.6, 3.4), err=0.0, alpha=0.6, bristle=0.5, dry=0.4, blur=0.06, taper=0.4, ang_jitter=0.22),
    ]
    paint(L, col, mask * keep, flow, rng, passes, val_jitter=0.1, jitter=0.012, clip_soft=0, base=0.0)
    glaze = [dict(size=24, spacing=1.1, length=(1.5, 3.0), err=0.0, alpha=0.18, bristle=0.5, dry=0.5, blur=0.6, taper=0.3, ang_jitter=0.3)]
    paint(L, col, mask * (1 - core), flow, rng, glaze, val_jitter=0.16, jitter=0.02, clip_soft=0, base=0.0)
    pick_marks(room, L, M, d, dleft, dright, dtop, dbot, k)
    gravel(room, L, M, dtop)
    nuggets(room, L, M, d, veins)
    planks(room, L, hexc(0x1e140d), hexc(0x4a3220), hexc(0x86603c), DUST)
    spikes(room, L, hexc(0x0d0c10), hexc(0x40382e), hexc(0xd2c2a4), hexc(0x6a3a1a))
    return L, M


def pick_marks(room, L, M, d, dleft, dright, dtop, dbot, k):
    """Marcas de picareta nas paredes dos túneis: riscos curtos em leque, mais escuros, em grupos."""
    rng = room.rng
    H, W = M.shape
    clip = M.astype(np.float32)
    wall = M & (d < 1.4 * T) & (dtop > 0.6 * T) & (dbot > 0.4 * T)
    ys, xs = np.nonzero(wall[::10, ::10])
    ys, xs = ys * 10, xs * 10
    pick = rng.random(len(xs)) < 0.05
    for y, x in zip(ys[pick], xs[pick]):
        base_a = rng.uniform(0.5, 1.1) * rng.choice([-1, 1])
        kk = float(k[y, x])
        for i in range(int(rng.integers(3, 6))):
            a = base_a + rng.normal(0, 0.12)
            L.stroke(x + rng.normal(0, 3 * S), y + rng.normal(0, 3 * S), a, rng.uniform(5, 10) * S, rng.uniform(0.8, 1.3) * S,
                     ROCK_D * 0.6 + hexc(0x221a14) * 0.4, 0.55 * min(1.0, kk + 0.3), rng, 0.3, 0.2, taper=0.75, clip=clip)


def gravel(room, L, M, dtop):
    """Cascalho no chão: pedrinhas arredondadas em cima da quina do piso."""
    rng = room.rng
    edge = M & (dtop < 2.5 * S)
    ys, xs = np.nonzero(edge[:, ::3])
    xs = xs * 3
    keep = rng.random(len(xs)) < 0.06
    for y, x in zip(ys[keep], xs[keep]):
        r = rng.uniform(0.8, 2.0) * S
        c = GRAVEL[int(rng.integers(0, len(GRAVEL)))] * rng.uniform(0.85, 1.2)
        L.dab(x + rng.normal(0, 1), y + rng.uniform(0, 2 * S), r, np.clip(c, 0, 1), 0.95, 0.7)
        L.dab(x - r * 0.3, y - r * 0.3, r * 0.4, np.clip(c * 1.4, 0, 1), 0.6, 0.6)


def nuggets(room, L, M, d, veins):
    """Pedras de Âmbar presas na rocha, aqui e ali perto da superfície (a luz própria do veio)."""
    rng = room.rng
    zone = M & (d > 1.5 * S) & (d < 2.5 * T)
    ys, xs = np.nonzero(zone[::12, ::12])
    ys, xs = ys * 12, xs * 12
    keep = rng.random(len(xs)) < 0.004 * (0.5 + veins)
    for y, x in zip(ys[keep], xs[keep]):
        r = rng.uniform(1.4, 2.8) * S
        L.dab(x, y, r * 1.6, AMBER_D * 0.6, 0.45, 2.5)
        pts = int(rng.integers(4, 7))
        a0 = rng.uniform(0, math.pi)
        for i in range(pts):
            a = a0 + i * math.pi * 2 / pts
            L.dab(x + math.cos(a) * r * 0.5, y + math.sin(a) * r * 0.5, r * 0.55, AMBER, 0.9, 0.6)
        L.dab(x - r * 0.2, y - r * 0.25, r * 0.4, AMBER_L, 0.95, 0.5)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    name = args[0]
    out = args[1] if len(args) > 1 else os.path.join(HERE, 'hd_minas')
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    room = Room(name, terreno.load_maps()[name], seed=SEEDS[name])
    L, M = mine(room, VEINS.get(name, 0.5))
    L.image().save(f'{out}/terreno-{name}-2x.png')
    downsample(L, M, room).save(f'{out}/terreno-{name}.png')
    print('pronto', name, round(time.time() - t0, 1), 's', flush=True)

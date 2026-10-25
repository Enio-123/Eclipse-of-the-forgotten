"""Fundos pintados da Lembrança (o vale antes do eclipse), em 2x.

  mem-sky  640x360   céu de verão, sol baixo à esquerda e nuvens grandes iluminadas (opaco)
  mem-far  1280x360  montanhas azuladas na névoa e uma cachoeira ao longe (repete)
  mem-mid  1024x360  colinas verdes com árvores, cerejeiras e casinhas (repete)

uso: python3 fundos_memoria.py [pasta_hd]
"""
import math
import os
import sys
import time
import numpy as np
from brush import Layer, hexc, mix, sstep, blur, value_noise, noise1d, paint, passes_std
from shapes import Mask
from common import seamless
from arvore import paint_tree, ground_shadow

OUT = sys.argv[1] if len(sys.argv) > 1 else 'hd'
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
SKY0, SKY1, SKY2 = hexc(0x5e8fcb), hexc(0x9dbde0), hexc(0xf1e8d6)
SUNC, SUNW = hexc(0xfff6dc), hexc(0xffe2a6)
CL_L, CL_M, CL_S = hexc(0xfff8ec), hexc(0xe6e0e6), hexc(0xa8a6c6)
MT0, MT1, MT2 = hexc(0x6f86b4), hexc(0x95a8cc), hexc(0xc3c8dc)
G0, G1, G2, G3 = hexc(0x2f6a32), hexc(0x4f8f3a), hexc(0x7fb64c), hexc(0xc6e07a)
PINK0, PINK1, PINK2 = hexc(0xc25d86), hexc(0xec97b6), hexc(0xffd2e2)
ROOF, WALL = hexc(0xb2452f), hexc(0xf0e6d2)
SX, SY = 180.0, 330.0  # sol (2x)


def grid(W, H):
    return np.mgrid[0:H, 0:W].astype(np.float32)


def sky_layer(rng):
    W, H = 1280, 720
    yy, xx = grid(W, H)
    t = yy / H
    ref = mix(SKY0, SKY1, sstep(0.0, 0.55, t)[..., None])
    ref = mix(ref, SKY2, sstep(0.4, 0.75, t)[..., None])
    d_s = np.hypot(xx - SX, (yy - SY) * 1.1)
    ref = mix(ref, SUNW, (np.exp(-(d_s / 420) ** 2) * 0.55)[..., None])
    ref = mix(ref, SUNC, (np.exp(-(d_s / 140) ** 2) * 0.9)[..., None])
    # nuvens grandes: densidade por ruído, luz do lado do sol, sombra fria do outro
    n = value_noise(H, W, 150, rng, 4)
    n2 = value_noise(H, W, 40, rng, 3)
    dens = sstep(0.5, 0.75, n * 0.75 + n2 * 0.25) * sstep(560, 300, yy) * sstep(20, 120, yy)
    ux, uy = (SX - xx), (SY - yy)
    nn = np.hypot(ux, uy) + 1e-3
    ux, uy = ux / nn, uy / nn
    sx_ = np.clip((xx + ux * 10).astype(int), 0, W - 1)
    sy_ = np.clip((yy + uy * 10).astype(int), 0, H - 1)
    lit = np.clip(dens - dens[sy_, sx_] * 0.9, 0, 1)
    ccol = mix(CL_M, CL_S, sstep(0.3, 1.0, dens)[..., None] * 0.6)
    ccol = mix(ccol, CL_L, np.clip(lit * 3 + 0.2, 0, 1)[..., None])
    ccol = mix(ccol, SUNW, (np.exp(-(d_s / 500) ** 2) * lit * 1.5).clip(0, 1)[..., None] * 0.6)
    ref = mix(ref, ccol, np.clip(dens * 1.3, 0, 1)[..., None])
    flow = np.full((H, W), -0.08, np.float32) + (n2 - 0.5) * 1.2
    L = Layer(W, H)
    paint(L, ref, np.ones((H, W), np.float32), flow, rng,
          passes_std(1.1, dry=0.25, bristle=0.3, err=(0, 0.02, 0.035, 0.06), long=1.5)[:3], val_jitter=0.035, base=1.0)
    # disco do sol e raios suaves
    L.dab(SX, SY, 26, SUNC, 0.95, 4)
    for _ in range(40):
        a = rng.uniform(-0.6, 0.9)
        ln = rng.uniform(200, 600)
        cx, cy = SX + math.cos(a) * ln / 2, SY + math.sin(a) * ln / 2
        L.stroke(cx, cy, a, ln, rng.uniform(10, 30), SUNW, rng.uniform(0.04, 0.09), rng, 0.3, 0.4, taper=0.9)
    return L


def pnoise1d(W, TW, cell, rng, octaves=3):
    """Ruído 1D (0..1) que se repete a cada TW colunas, para a silhueta emendar sem fantasma."""
    out = np.zeros(W, np.float32)
    amp, tot = 1.0, 0.0
    x = np.arange(W, dtype=np.float32)
    for o in range(octaves):
        k = max(2, int(round(TW / max(1.0, cell / 2 ** o))))
        g = rng.random(k).astype(np.float32)
        u = x * k / TW
        i0 = np.floor(u).astype(np.int64)
        f = u - i0
        f = f * f * (3 - 2 * f)
        out += amp * (g[i0 % k] + (g[(i0 + 1) % k] - g[i0 % k]) * f)
        tot += amp
        amp *= 0.5
    return out / tot


def streaks(H, W, cx, cy, rng, octaves=2):
    """Ruído esticado na vertical (cx estreito, cy comprido): sulcos e línguas de neve."""
    hs = max(4, int(H * cx / cy))
    n = value_noise(hs, W, cx, rng, octaves)
    from scipy import ndimage as ndi
    z = ndi.zoom(n, (H / hs, 1.0), order=1)[:H]
    if z.shape[0] < H:
        z = np.pad(z, ((0, H - z.shape[0]), (0, 0)), mode='edge')
    return z


def peak_range(W, TW, H, rng, n, top_min, top_max, slope_min, slope_max):
    """Silhueta de picos: cada pico é um triângulo (encostas com inclinação própria),
    a cordilheira é o mais alto deles em cada coluna. Devolve a borda (y), o x e o topo do
    pico dono de cada coluna e a inclinação da aresta que desce do pico."""
    x = np.arange(W, dtype=np.float32)
    ridge = np.full(W, 1e9, np.float32)
    own_x = np.zeros(W, np.float32)
    own_t = np.zeros(W, np.float32)
    own_r = np.zeros(W, np.float32)
    own_h = np.zeros(W, np.float32)
    pxs = (np.arange(n) + rng.uniform(0.1, 0.9, n)) * TW / n
    for px in pxs:
        top = rng.uniform(top_min, top_max)
        sl, sr = rng.uniform(slope_min, slope_max), rng.uniform(slope_min, slope_max)
        rr = rng.uniform(0.25, 0.75)
        for off in (-TW, 0.0, TW):
            dx = x - (px + off)
            y = top + np.where(dx < 0, -dx * sl, dx * sr)
            better = y < ridge
            ridge = np.where(better, y, ridge)
            own_x = np.where(better, px + off, own_x)
            own_t = np.where(better, top, own_t)
            own_r = np.where(better, rr, own_r)
            own_h = np.where(better, (top_max - top) / max(1.0, top_max - top_min), own_h)
    # rochas quebrando a linha
    ridge += (pnoise1d(W, TW, 26, rng, 3) - 0.5) * 16 + (pnoise1d(W, TW, 7, rng, 2) - 0.5) * 5
    return ridge, own_x, own_t, own_r, own_h


ROCK_L, ROCK_S = hexc(0xb7a6ae), hexc(0x56649a)
SNOW_L, SNOW_S = hexc(0xfff6ea), hexc(0xa7b6dc)
HAZE_M = hexc(0xc9d3e6)


def mountains(W, TW, H, rng, yy, xx, n, top_min, top_max, smin, smax, haze, snow_amt, base_fade):
    ridge, ox, ot, orr, oh = peak_range(W, TW, H, rng, n, top_min, top_max, smin, smax)
    m = Mask(W, H)
    m.poly([(-10, H + 5)] + [(x, float(ridge[x])) for x in range(0, W, 3)] + [(W + 10, H + 5)])
    mm = m.array()
    depth = yy - ridge[None, :]
    wig = (value_noise(H, W, 30, rng, 2) - 0.5) * 26
    xr = ox[None, :] + np.maximum(0, yy - ot[None, :]) * orr[None, :] + wig
    lit = sstep(2.5, -2.5, xx - xr)
    # sulcos: faixas mais escuras descendo a encosta iluminada, e mais claras na sombra
    gul = streaks(H, W, 9, 90, rng, 2)
    lit = np.clip(lit - sstep(0.62, 0.8, gul) * 0.55 * lit + sstep(0.72, 0.86, gul) * 0.3 * (1 - lit), 0, 1)
    rock = mix(ROCK_S, ROCK_L, lit[..., None])
    rock *= (0.92 + 0.16 * value_noise(H, W, 14, rng, 2))[..., None]
    # neve: mais funda nos picos altos, descendo em línguas pelos sulcos
    sd = snow_amt * (0.35 + 0.9 * oh[None, :]) * (0.35 + 1.1 * streaks(H, W, 7, 60, rng, 2))
    snow = sstep(sd + 4, sd - 4, depth) * (snow_amt > 0)
    scol = mix(SNOW_S, SNOW_L, lit[..., None])
    col = mix(rock, scol, snow[..., None])
    # pé da montanha some na névoa; luz quente do sol vindo da esquerda
    col = mix(col, HAZE_M, sstep(base_fade - 120, base_fade + 60, yy)[..., None] * 0.85)
    sunw = np.exp(-((xx % TW - SX * 2) / 900.0) ** 2)
    col = mix(col, SKY2, (haze + 0.12 * sunw)[..., None])
    flow = np.where(lit > 0.5, math.pi / 2 + 0.5, math.pi / 2 - 0.5).astype(np.float32) + (value_noise(H, W, 40, rng) - 0.5) * 0.4
    L = Layer(W, H)
    paint(L, col, mm, flow, rng, passes_std(0.42, dry=0.35, bristle=0.4, err=(0, 0.02, 0.035, 0.05), long=1.2)[:4],
          val_jitter=0.035, clip_soft=0.8, base=1.0)
    return L, ridge


def far_layer(rng):
    TW, PAD, H = 2560, 320, 720
    W = TW + PAD
    yy, xx = grid(W, H)
    out = Layer(W, H)
    # cordilheira mais distante, alta e nevada, quase da cor do céu
    L1, r1 = mountains(W, TW, H, rng, yy, xx, 7, 170, 270, 0.5, 0.95, 0.42, 70, 440)
    out.over(L1)
    band = Layer(W, H)
    band.fill(HAZE_M, np.exp(-((yy - 430) / 60) ** 2) * 0.55)
    out.over(band)
    # cordilheira do meio, mais escura, com a cachoeira
    L2, r2 = mountains(W, TW, H, rng, yy, xx, 9, 280, 350, 0.4, 0.8, 0.2, 34, 520)
    # a cachoeira sai logo abaixo de um pico, no lado da sombra (a água clara aparece mais)
    fx = int(np.argmin(r2[1450:1950])) + 1450 + 34
    fall_top = float(r2[fx]) + 22
    # fenda escura atrás da água
    cleft = Mask(W, H)
    cleft.poly([(fx - 12, fall_top - 8), (fx + 10, fall_top - 10), (fx + 22, 470), (fx - 26, 470)])
    L2.fill(mix(hexc(0x4a5a80), SKY2, 0.15), cleft.array() * 0.85 * (L2.A > 0.5))
    for _ in range(110):
        x = fx + rng.normal(0, 6)
        y0 = fall_top + rng.uniform(0, 30)
        ln = rng.uniform(50, 150)
        L2.stroke(x, y0 + ln / 2, math.pi / 2 + rng.normal(0, 0.015), ln, rng.uniform(2, 4.5), mix(hexc(0xdde8f2), hexc(0xffffff), rng.random()),
                  rng.uniform(0.45, 0.85), rng, 0.4, 0.35, taper=0.4)
    for _ in range(26):
        x = fx + 46 + rng.normal(0, 3)
        y0 = fall_top + 40 + rng.uniform(0, 16)
        ln = rng.uniform(30, 90)
        L2.stroke(x, y0 + ln / 2, math.pi / 2, ln, rng.uniform(1.5, 3), hexc(0xe8f0f6), rng.uniform(0.4, 0.7), rng, 0.4, 0.4, taper=0.4)
    out.over(L2)
    # névoa na base, com o borrifo da cachoeira
    mist = Layer(W, H)
    mist.fill(HAZE_M, sstep(470, 600, yy) * 0.6 * (out.A > 0.05))
    for _ in range(60):
        mist.dab(fx + rng.normal(0, 34), fall_top + 150 + rng.normal(0, 14), rng.uniform(10, 24), hexc(0xf4f7fa), 0.12, 10)
    out.over(mist)
    # morros com mata, mais perto: copas redondas na borda, luz por cima
    TOP3 = 520 - 50 * pnoise1d(W, TW, 300, rng, 3)
    m3 = Mask(W, H)
    m3.poly([(-10, H + 5)] + [(x, float(TOP3[x])) for x in range(0, W, 4)] + [(W + 10, H + 5)])
    mm3 = m3.array()
    L3 = Layer(W, H)
    d3 = yy - TOP3[None, :]
    c3 = mix(hexc(0x6f9a86), hexc(0x587f78), sstep(0, 160, d3)[..., None])
    c3 = mix(c3, SKY2, 0.28)
    paint(L3, c3, mm3, np.full((H, W), -0.1, np.float32) + (value_noise(H, W, 30, rng) - 0.5) * 2.0, rng,
          passes_std(0.35, dry=0.3, bristle=0.4)[1:4], val_jitter=0.04, clip_soft=0.8, base=1.0)
    for x in np.arange(0, W, 9.0):
        x = x + rng.normal(0, 3)
        y = float(TOP3[int(np.clip(x, 0, W - 1))]) + rng.uniform(-2, 8)
        r = rng.uniform(7, 13)
        L3.dab(x, y + 2, r, mix(hexc(0x547d72), SKY2, 0.3), 0.9, 1.5)
        L3.dab(x - r * 0.3, y - r * 0.15, r * 0.6, mix(hexc(0x9cc09a), SKY2, 0.3), 0.55, 2.0)
    out.over(L3)
    return seamless(out, TW, PAD)


def wrap_xs(x, TW, W, reach):
    """Posições onde desenhar algo em x para a camada emendar: x, x+TW e x-TW dentro da tela."""
    return [p for p in (x - TW, x, x + TW) if -reach < p < W + reach]


def meadow(W, TW, H, rng, yy, xx, ridge, cA, cB, haze, shadow_amt, flowers):
    m = Mask(W, H)
    m.poly([(-10, H + 5)] + [(x, float(ridge[x])) for x in range(0, W, 4)] + [(W + 10, H + 5)])
    mm = m.array()
    depth = np.maximum(0, yy - ridge[None, :])
    ref = mix(cA, cB, sstep(0, 230, depth)[..., None])
    # luz de fim de tarde na crista e manchas de sol / sombra de nuvem
    slope = np.gradient(ridge)
    ref = mix(ref, hexc(0xd8e88c), (np.clip(-slope * 1.2, 0, 1)[None, :] * np.exp(-depth / 60) * 0.45)[..., None])
    ref = mix(ref, hexc(0xe6ef9a), (np.exp(-depth / 5) * 0.55)[..., None])
    cl = value_noise(H, W, 230, rng, 3)
    ref = mix(ref, ref * 0.62 + hexc(0x2f5a5c) * 0.38, (sstep(0.58, 0.72, cl) * shadow_amt)[..., None])
    ref = mix(ref, hexc(0xb8d46a), (sstep(0.36, 0.22, cl) * 0.35)[..., None])
    ref = mix(ref, SKY2, haze)
    L = Layer(W, H)
    flow = np.full((H, W), -0.06, np.float32) + (value_noise(H, W, 50, rng, 2) - 0.5) * 0.7
    paint(L, ref, mm, flow, rng, passes_std(0.55, dry=0.35, bristle=0.4, err=(0, 0.02, 0.035, 0.05), long=1.5)[:4],
          val_jitter=0.045, clip_soft=1.0, base=1.0)
    if flowers:
        # flores em manchas (cada mancha de uma cor), não espalhadas por igual
        for colr in (hexc(0xffffff), hexc(0xffc8dc), hexc(0xfff09a), hexc(0xc9b8ff)):
            dens = sstep(0.62, 0.8, value_noise(H, W, 110, rng, 2)) * mm * sstep(10, 40, depth)
            ys, xs = np.nonzero(dens > rng.random((H, W)) * 6)
            for i in rng.choice(len(xs), min(len(xs), 700), replace=False) if len(xs) else []:
                c = mix(colr, SKY2, haze) * rng.uniform(0.9, 1.05)
                L.dab(xs[i], ys[i], rng.uniform(1.0, 2.0), np.clip(c, 0, 1), 0.85, 0.7)
        # tufos de capim mais escuros
        for _ in range(900):
            x = rng.uniform(0, W)
            y = float(ridge[int(x)]) + rng.uniform(6, 200)
            ang = -math.pi / 2 + rng.normal(0, 0.35)
            ln = rng.uniform(5, 12)
            L.stroke(x + math.cos(ang) * ln / 2, y + math.sin(ang) * ln / 2, ang, ln, rng.uniform(1.2, 2.2),
                     mix(hexc(0x3f7a36), hexc(0x9cc85c), rng.random()), 0.6, rng, 0.2, 0.1, taper=0.8)
    return L


def house(rng, W, H, x, gy, s, haze):
    L = Layer(W, H)
    w, h = 40 * s, 26 * s
    wall_l, wall_s = mix(hexc(0xf6ead2), SKY2, haze), mix(hexc(0xb9a89a), SKY2, haze)
    roof_l, roof_s = mix(hexc(0xc8573a), SKY2, haze), mix(hexc(0x7e3530), SKY2, haze)
    # parede da frente (lado do sol) e lateral na sombra
    m = Mask(W, H)
    m.rect(x, gy - h, x + w * 0.68, gy + 4)
    L.fill(wall_l, m.array())
    m = Mask(W, H)
    m.poly([(x + w * 0.68, gy - h), (x + w, gy - h + 3 * s), (x + w, gy + 4), (x + w * 0.68, gy + 4)])
    L.fill(wall_s, m.array())
    m = Mask(W, H)
    m.poly([(x - 5 * s, gy - h + 2), (x + w * 0.34, gy - h - 18 * s), (x + w * 0.72, gy - h + 2)])
    L.fill(roof_l, m.array())
    m = Mask(W, H)
    m.poly([(x + w * 0.34, gy - h - 18 * s), (x + w + 4 * s, gy - h - 14 * s), (x + w + 4 * s, gy - h + 5 * s), (x + w * 0.72, gy - h + 2)])
    L.fill(roof_s, m.array())
    m = Mask(W, H)
    m.rect(x + w * 0.8, gy - h - 22 * s, x + w * 0.88, gy - h - 8 * s)
    L.fill(wall_s * 0.9, m.array())
    m = Mask(W, H)
    m.rect(x + w * 0.26, gy - h * 0.55, x + w * 0.42, gy + 1)
    L.fill(mix(hexc(0x4a3022), SKY2, haze), m.array())
    m = Mask(W, H)
    m.rect(x + w * 0.5, gy - h * 0.7, x + w * 0.6, gy - h * 0.4)
    L.fill(mix(hexc(0x5b6f88), SKY2, haze), m.array())
    for _ in range(6):
        L.dab(x + w * 0.84 + rng.normal(0, 2) + _ * 3, gy - h - 26 * s - _ * 9, 3 + _ * 1.4, mix(hexc(0xf2f0ea), SKY2, 0.3), 0.18, 3)
    return L


def mid_layer(rng):
    TW, PAD, H = 2048, 256, 720
    W = TW + PAD
    yy, xx = grid(W, H)
    out = Layer(W, H)
    # colina de trás: verde azulado na névoa, faixas de mata, sebes e casinhas
    rb = 445 - 60 * pnoise1d(W, TW, 420, rng, 3)
    back = meadow(W, TW, H, rng, yy, xx, rb, hexc(0x9cbc84), hexc(0x7ea46a), 0.22, 0.4, False)
    out.over(back)
    hb = 0.26
    for _ in range(3):
        x = rng.uniform(80, TW - 80)
        for p in wrap_xs(x, TW, W, 80):
            out.over(house(rng, W, H, p, float(rb[int(np.clip(p, 0, W - 1))]) + 22, 0.9, hb))
    # sebes seguindo o morro
    for _ in range(4):
        x0 = rng.uniform(0, TW)
        ln = rng.uniform(220, 520)
        off = rng.uniform(40, 110)
        for x in np.arange(x0, x0 + ln, 10.0):
            for p in wrap_xs(x % TW, TW, W, 30):
                gy = float(rb[int(np.clip(p, 0, W - 1))]) + off + rng.normal(0, 2)
                paint_tree(out, rng, p, gy, rng.uniform(14, 22), 'bush', hb + 0.04, SKY2, trunk=False, flat=0.6)
    # matas no alto do morro
    for _ in range(4):
        x0 = rng.uniform(0, TW)
        ln = rng.uniform(160, 420)
        for x in np.sort(rng.uniform(x0, x0 + ln, int(ln / 16))):
            for p in wrap_xs(x % TW, TW, W, 60):
                gy = float(rb[int(np.clip(p, 0, W - 1))]) + rng.uniform(2, 16)
                paint_tree(out, rng, p, gy, rng.uniform(28, 46), 'deep', hb + 0.06, SKY2, trunk=rng.random() < 0.3)
    for x in rng.uniform(0, TW, 12):
        for p in wrap_xs(x, TW, W, 60):
            gy = float(rb[int(np.clip(p, 0, W - 1))]) + rng.uniform(14, 60)
            paint_tree(out, rng, p, gy, rng.uniform(32, 52), 'pink' if rng.random() < 0.45 else 'green', hb, SKY2)
    # colina da frente: verde forte, sombras de nuvem, flores em manchas e árvores grandes
    rf = 540 - 44 * pnoise1d(W, TW, 300, rng, 3)
    front = meadow(W, TW, H, rng, yy, xx, rf, hexc(0x7cb24e), hexc(0x4f8f3a), 0.0, 0.5, True)
    out.over(front)
    xs = (np.arange(7) + rng.uniform(0.15, 0.85, 7)) * TW / 7
    for x in xs:
        size = rng.uniform(80, 128)
        kind = 'pink' if rng.random() < 0.4 else 'green'
        for p in wrap_xs(x, TW, W, 140):
            gy = float(rf[int(np.clip(p, 0, W - 1))]) + rng.uniform(16, 50)
            ground_shadow(out, p, gy, size, hexc(0x2c5536), 0.38)
            paint_tree(out, rng, p, gy, size, kind, 0.0, SKY2, petals=True if kind == 'pink' else None)
    return seamless(out, TW, PAD)


if __name__ == '__main__':
    which = sys.argv[2:] or ['sky', 'far', 'mid']
    if 'sky' in which:
        sky_layer(np.random.default_rng(51)).image().save(f'{OUT}/mem-sky.png')
        print('mem-sky', round(time.time() - T0, 1), flush=True)
    if 'far' in which:
        far_layer(np.random.default_rng(52)).image().save(f'{OUT}/mem-far.png')
        print('mem-far', round(time.time() - T0, 1), flush=True)
    if 'mid' in which:
        mid_layer(np.random.default_rng(53)).image().save(f'{OUT}/mem-mid.png')
        print('mem-mid', round(time.time() - T0, 1), flush=True)

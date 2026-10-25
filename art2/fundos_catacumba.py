"""Fundos pintados das Catacumbas de Vespera, em 2x (as duas camadas repetem na horizontal).

  cat-far  1024x360  salão de arcos ao longe, névoa fria no meio e velas distantes (opaco)
  cat-mid  1024x360  arcada mais perto: pilares grossos, nichos de ossos e correntes (vazado)

uso: python3 fundos_catacumba.py [pasta_hd]
"""
import math
import os
import sys
import time
import numpy as np
from brush import Layer, hexc, mix, sstep, blur, value_noise, noise1d, paint, passes_std
from shapes import Mask
from common import seamless

OUT = sys.argv[1] if len(sys.argv) > 1 else 'hd'
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
INK = hexc(0x040509)
HAZE = hexc(0x2a3044)
HAZE2 = hexc(0x3c4560)
STONE0, STONE1 = hexc(0x11131b), hexc(0x1d202b)
WARM, WARM2 = hexc(0xd98a3a), hexc(0xffc070)
BONE = hexc(0x6a6358)


def grid(W, H):
    return np.mgrid[0:H, 0:W].astype(np.float32)


def far_layer(rng):
    TW, PAD, H = 2048, 256, 720
    W = TW + PAD
    yy, xx = grid(W, H)
    # fundo: preto em cima e embaixo, névoa fria no meio
    t = yy / H
    ref = mix(INK, HAZE, (np.exp(-((yy - 400) / 170) ** 2))[..., None])
    ref = mix(ref, HAZE2, (np.exp(-((yy - 420) / 70) ** 2) * 0.5 * value_noise(H, W, 120, rng, 2))[..., None])
    L = Layer(W, H)
    paint(L, ref, np.ones((H, W), np.float32), np.full((H, W), 0.0, np.float32) + (value_noise(H, W, 90, rng) - 0.5) * 0.4, rng,
          passes_std(1.1, dry=0.3, bristle=0.35, err=(0, 0.02, 0.04, 0.06), long=1.8)[:3], val_jitter=0.04, base=1.0)
    # arcada distante em dois andares
    for (span, pw, spring, base, top, col, off) in [(176, 30, 300, 640, 250, hexc(0x161925), 0.0), (128, 20, 420, 600, 380, hexc(0x1c2030), 64.0)]:
        m = Mask(W, H)
        for i in range(-1, int(W // span) + 2):
            cx = off + i * span
            m.rect(cx - pw / 2, top, cx + pw / 2, H + 5)
        m.rect(-10, top - 60, W + 10, top)
        mm = m.array()
        # arcos: tira semicírculos entre os pilares
        r = (span - pw) / 2
        for i in range(-1, int(W // span) + 2):
            cx = off + i * span + span / 2
            hole = (np.hypot(xx - cx, np.maximum(0, spring - yy)) < r) & (yy > top - 58)
            mm = np.where(hole, 0, mm)
        rr = np.roll(mm, 3, axis=1)
        rim = (mm > 0.5) & (rr < 0.5)
        cref = mix(col, col * 1.6, blur(rim.astype(np.float32), 1.0)[..., None] * 0.8)
        cref = mix(cref, INK, sstep(560, 720, yy)[..., None] * 0.8)
        LL = Layer(W, H)
        paint(LL, cref, mm, np.full((H, W), math.pi / 2, np.float32), rng,
              passes_std(0.5, dry=0.35, bristle=0.4, err=(0, 0.02, 0.035, 0.05))[:3], val_jitter=0.04, clip_soft=1.0, base=1.0)
        L.over(LL)
    # velas distantes em alguns vãos
    for _ in range(26):
        x, y = rng.uniform(0, W), rng.uniform(470, 600)
        L.dab(x, y, rng.uniform(1.6, 2.6), mix(WARM, WARM2, rng.random()), 0.85, 1.0)
        L.dab(x, y - 1, rng.uniform(10, 18), WARM, 0.08, 9)
    return seamless(L, TW, PAD)


def mid_layer(rng):
    TW, PAD, H = 2048, 256, 720
    W = TW + PAD
    yy, xx = grid(W, H)
    span, pw = 512, 76
    m = Mask(W, H)
    for i in range(-1, W // span + 2):
        cx = 120 + i * span
        m.rect(cx - pw / 2, -10, cx + pw / 2, H + 5)
        # capitel e base
        m.rect(cx - pw / 2 - 10, 318, cx + pw / 2 + 10, 336)
        m.rect(cx - pw / 2 - 12, 650, cx + pw / 2 + 12, H + 5)
    m.rect(-10, -10, W + 10, 70)
    mm = m.array()
    # arcos grandes saindo dos capitéis: acima da linha dos capitéis só o vão do arco fica aberto
    r = (span - pw) / 2
    spring = 330
    opening = np.zeros((H, W), bool)
    for i in range(-1, W // span + 2):
        cx = 120 + i * span + span / 2
        opening |= (np.hypot(xx - cx, np.maximum(0, spring - yy)) < r) & (np.abs(xx - cx) < r)
    arch = ((yy < spring) & ~opening).astype(np.float32)
    mm = np.clip(np.maximum(mm, blur(arch, 0.8)), 0, 1)
    # muro baixo de ossos entre os pilares
    wall = np.zeros((H, W), np.float32)
    wall[600:, :] = 1
    mm = np.maximum(mm, wall)
    ref = mix(STONE0, STONE1, sstep(0, 720, yy)[..., None] * 0.6)
    fine = value_noise(H, W, 8, rng, 2)
    ref *= (0.8 + 0.4 * fine)[..., None]
    # contraluz quente nas bordas viradas para dentro dos arcos
    left_edge = (mm > 0.5) & (np.roll(mm, -4, axis=1) < 0.5)
    right_edge = (mm > 0.5) & (np.roll(mm, 4, axis=1) < 0.5)
    under = (mm > 0.5) & (np.roll(mm, 4, axis=0) < 0.5)
    e = blur((left_edge | right_edge | under).astype(np.float32), 1.0)
    ref = mix(ref, hexc(0x6a4a30), np.clip(e * 1.2, 0, 1)[..., None] * 0.55)
    L = Layer(W, H)
    paint(L, ref, mm, np.full((H, W), math.pi / 2, np.float32) + (value_noise(H, W, 30, rng) - 0.5) * 0.3, rng,
          passes_std(0.5, dry=0.4, bristle=0.45, err=(0, 0.02, 0.035, 0.05))[:3], val_jitter=0.05, clip_soft=1.0, base=1.0)
    # nichos com crânios no muro
    for x in np.arange(0, W, 22):
        for y in (628, 676):
            if rng.random() < 0.25:
                continue
            L.dab(x + rng.normal(0, 2), y, 8.5, INK, 0.9, 1.5)
            if rng.random() < 0.75:
                L.dab(x + rng.normal(0, 1), y + 2, 5.2, mix(BONE * 0.6, BONE, rng.random()), 0.85, 1.0)
                L.dab(x - 2, y + 1, 1.4, INK, 0.9, 0.5)
                L.dab(x + 2, y + 1, 1.4, INK, 0.9, 0.5)
    # correntes penduradas no alto dos arcos
    ch = Mask(W, H)
    for _ in range(7):
        x0 = rng.uniform(0, TW)
        ln = rng.uniform(120, 300)
        for i in range(int(ln / 12)):
            y = 66 + i * 12
            if i % 2 == 0:
                ch.ellipse(x0, y, 4.2, 7.5)
            else:
                ch.ellipse(x0, y, 1.8, 7.5)
    L.fill(hexc(0x0c0d12), ch.array())
    return seamless(L, TW, PAD)


if __name__ == '__main__':
    L = far_layer(np.random.default_rng(41))
    L.image().save(f'{OUT}/cat-far.png')
    print('cat-far', round(time.time() - T0, 1), flush=True)
    L = mid_layer(np.random.default_rng(42))
    L.image().save(f'{OUT}/cat-mid.png')
    print('cat-mid', round(time.time() - T0, 1), flush=True)

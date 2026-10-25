"""Fundos pintados da Ponte do Castelo, em 2x, para a etapa final reduzir aos pixels do jogo.

Camadas (tamanho no jogo):
  bridge-sky   1100x380  céu de tempestade com o eclipse (opaco)
  bridge-far   1100x380  montanhas, a cidade alta e o castelo de Vespera no penhasco
  bridge-far-rim         o castelo aceso pelo relâmpago (acende e apaga)
  clouds-far   1280x200  faixa de nuvens no horizonte (repete)
  clouds-near  1280x170  nuvens pesadas no alto (repete)
  bridge-mid   1024x420  o abismo: névoa, aqueduto lá embaixo e as luzes da cidade (repete)
  bridge-mid-rim
  bridge-fg    1536x420  silhuetas pretas fora de foco na frente (Limbo, repete)

uso: python3 fundos_ponte.py [pasta_hd] [camada ...]
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from brush import Layer, hexc, mix, sstep, blur, value_noise, noise1d, paint, passes_std
from shapes import Mask
from common import seamless

OUT = sys.argv[1] if len(sys.argv) > 1 else 'hd'
ONLY = set(sys.argv[2:])
os.makedirs(OUT, exist_ok=True)
T0 = time.time()

INK = hexc(0x05070c)
SL0, SL1, SL2, SL3, SL4 = hexc(0x0b1020), hexc(0x141b2e), hexc(0x212a42), hexc(0x323d58), hexc(0x4d5a78)
FOG0, FOG1, FOG2 = hexc(0x2b3550), hexc(0x46526f), hexc(0x66729a)
GOLD0, GOLD1, GOLD2, GOLD3 = hexc(0x6e3c1a), hexc(0xb4702e), hexc(0xe7ad55), hexc(0xfff0c8)
WIN0, WIN1 = hexc(0xd9772e), hexc(0xffc46e)
COLD = hexc(0xc9d6f0)
EX, EY, ER = 1640.0, 190.0, 52.0  # o sol em eclipse, no vão entre as duas torres mais altas


def want(name):
    return not ONLY or name in ONLY


def save(layer_or_img, name):
    img = layer_or_img.image() if isinstance(layer_or_img, Layer) else layer_or_img
    img.save(f'{OUT}/{name}.png')
    print(name, img.size, round(time.time() - T0, 1), 's', flush=True)


def grid(W, H):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    return yy, xx


# ======================================================================================
# céu com o eclipse
# ======================================================================================
def sky_layer(rng):
    W, H = 2200, 760
    yy, xx = grid(W, H)
    d_e = np.hypot(xx - EX, yy - EY)
    t = yy / H
    sky = mix(SL0, SL2, sstep(0.0, 0.85, t)[..., None])
    cl = value_noise(H, W, 170, rng, 4)
    cl2 = value_noise(H, W, 64, rng, 3)
    cloud = sstep(0.42, 0.72, cl * 0.75 + cl2 * 0.25 + 0.16 * (1 - t))
    sky = mix(sky, SL3, (cloud * 0.55)[..., None])
    sky = mix(sky, SL1, (sstep(0.55, 0.3, cl) * 0.5)[..., None])
    storm = np.exp(-(((xx - 520) / 420) ** 2 + ((yy - 150) / 240) ** 2))
    sky = mix(sky, hexc(0x55638a), (storm * cloud * 0.6)[..., None])
    cold_edge = np.clip(cloud - blur(cloud, 6), 0, 1) * 4 * storm
    sky = mix(sky, hexc(0x9fb0d4), np.clip(cold_edge, 0, 1)[..., None] * 0.55)
    halo = np.exp(-(d_e / 320) ** 2)
    sky = mix(sky, GOLD0, (halo * 0.75)[..., None])
    sky = mix(sky, GOLD1, (np.exp(-(d_e / 150) ** 2) * 0.8)[..., None])
    lit_edge = np.clip(cloud - blur(cloud, 7), 0, 1) * 4 * np.exp(-(d_e / 400) ** 2)
    sky = mix(sky, GOLD2, np.clip(lit_edge, 0, 1)[..., None] * 0.8)
    flow = np.where(d_e < 340, np.arctan2(yy - EY, xx - EX) + math.pi / 2 + (cl2 - 0.5) * 0.6, -0.12 + (cl2 - 0.5) * 0.9)
    L = Layer(W, H)
    paint(L, sky, np.ones((H, W), np.float32), flow, rng,
          passes_std(1.2, dry=0.25, bristle=0.35, err=(0, 0.02, 0.04, 0.07), long=1.5)[:3], val_jitter=0.05, base=1.0)
    for _ in range(280):
        a = rng.uniform(0, 2 * math.pi)
        r0 = ER + rng.uniform(2, 10)
        ln = rng.uniform(20, 110) * (0.4 + rng.random())
        cx, cy = EX + math.cos(a) * (r0 + ln / 2), EY + math.sin(a) * (r0 + ln / 2)
        c = mix(GOLD1, GOLD3, rng.random() ** 2)
        L.stroke(cx, cy, a, ln, rng.uniform(2, 5), c, rng.uniform(0.15, 0.45), rng, 0.4, 0.5, taper=0.8)
    ring = sstep(ER + 5, ER + 1.5, d_e) * sstep(ER - 1, ER + 1.2, d_e)
    L.fill(GOLD3, ring * 0.95)
    L.fill(hexc(0x06070b), sstep(ER + 0.8, ER - 0.8, d_e))
    return L


# ======================================================================================
# castelo de Vespera, cidade alta e montanhas
# ======================================================================================
TOWERS = [  # (x, meia largura, topo, altura do telhado): as duas mais altas abrem o vão do eclipse
    (1455, 12, 360, 40), (1505, 18, 316, 56), (1561, 24, 262, 96), (1607, 13, 374, 34), (1647, 15, 392, 28),
    (1689, 14, 376, 36), (1747, 28, 236, 122), (1805, 18, 302, 64), (1855, 16, 340, 50), (1907, 22, 308, 60),
    (1963, 14, 358, 44), (2018, 20, 330, 58), (2074, 13, 372, 36), (2128, 24, 296, 70), (2186, 16, 350, 46),
]


def castle_mask(W, H, rng):
    m = Mask(W, H)
    cliff = [(1330, H + 5), (1350, 520), (1392, 478), (1440, 462), (1520, 452), (2210, 440), (2210, H + 5)]
    m.poly(cliff)
    for (x, hw, top, rh) in TOWERS:
        m.rect(x - hw, top, x + hw, 470)
        m.poly([(x - hw - 3, top + 2), (x, top - rh), (x + hw + 3, top + 2)])
        if hw > 16:
            for sx in (-1, 1):
                tx = x + sx * (hw - 3)
                m.rect(tx - 4, top - 14, tx + 4, top + 6)
                m.poly([(tx - 6, top - 12), (tx, top - 34), (tx + 6, top - 12)])
    m.rect(1495, 392, 2210, 472)
    for x in range(1497, 2210, 14):
        m.rect(x, 384, x + 7, 394)
    m.rect(1390, 420, 1500, 472)
    return m.array()


def town_mask(W, H, rng):
    """Cidade alta à esquerda do castelo: telhados e torres baixas, mais clara por estar na névoa."""
    m = Mask(W, H)
    x = 560.0
    while x < 1460:
        w = rng.uniform(26, 60)
        top = 470 - rng.uniform(18, 60) * (0.5 + 0.5 * (x - 560) / 900)
        m.rect(x, top, x + w, 520)
        if rng.random() < 0.7:
            m.poly([(x - 2, top + 1), (x + w * rng.uniform(0.3, 0.7), top - rng.uniform(10, 30)), (x + w + 2, top + 1)])
        if rng.random() < 0.18:
            tx = x + w * 0.5
            th = rng.uniform(50, 110)
            m.rect(tx - 6, top - th, tx + 6, top)
            m.poly([(tx - 9, top - th + 2), (tx, top - th - rng.uniform(20, 40)), (tx + 9, top - th + 2)])
        x += w * rng.uniform(0.7, 1.05)
    return m.array()


def far_layers(rng):
    W, H = 2200, 760
    yy, xx = grid(W, H)
    d_e = np.hypot(xx - EX, yy - EY)
    out = Layer(W, H)
    rim = Layer(W, H)
    # montanhas ao longe
    ridge = 440 + 70 * (noise1d(W, 260, rng, 4) - 0.5) - 0.02 * np.arange(W)
    mf = Mask(W, H)
    mf.poly([(-10, H + 5)] + [(x, float(ridge[x])) for x in range(0, W, 6)] + [(W + 10, H + 5)])
    mf = mf.array()
    ref = mix(hexc(0x1a2238), FOG0, sstep(420, 600, yy)[..., None] * 0.8)
    ref = mix(ref, GOLD0, (np.exp(-(d_e / 460) ** 2) * 0.35)[..., None])
    L = Layer(W, H)
    paint(L, ref, mf, -0.5 + (value_noise(H, W, 50, rng) - 0.5) * 0.8, rng,
          passes_std(0.8, dry=0.4, bristle=0.45, err=(0, 0.02, 0.04, 0.07))[:3], val_jitter=0.04, base=1.0)
    out.over(L)
    # cidade alta na névoa
    mt = town_mask(W, H, rng)
    ref = mix(hexc(0x242e48), hexc(0x3a4664), sstep(380, 540, yy)[..., None])
    ref = mix(ref, GOLD0, (np.exp(-(d_e / 520) ** 2) * 0.3)[..., None])
    L = Layer(W, H)
    paint(L, ref, mt, np.full((H, W), math.pi / 2, np.float32), rng,
          passes_std(0.45, dry=0.35, bristle=0.4, err=(0, 0.02, 0.035, 0.05))[:3], val_jitter=0.04, base=1.0)
    for _ in range(70):
        wx, wy = rng.uniform(560, 1460), rng.uniform(400, 515)
        if mt[int(wy), int(wx)] > 0.9:
            L.stroke(wx, wy, math.pi / 2, rng.uniform(3, 6), rng.uniform(2, 3), mix(WIN0, WIN1, rng.random()), 0.75, rng, 0.2, 0.0, taper=0.2)
    out.over(L)
    # castelo
    mc = castle_mask(W, H, rng)
    ref = mix(hexc(0x0a0e18), hexc(0x182036), sstep(330, 520, yy)[..., None])
    dirx, diry = (xx - EX), (yy - EY)
    nrm = np.hypot(dirx, diry) + 1e-3
    ux, uy = -dirx / nrm, -diry / nrm
    sx_ = np.clip((xx + ux * 3).astype(int), 0, W - 1)
    sy_ = np.clip((yy + uy * 3).astype(int), 0, H - 1)
    inside = mc > 0.5
    rimm = inside & (mc[sy_, sx_] < 0.5)
    rim_f = blur(rimm.astype(np.float32), 0.8) * np.exp(-(nrm / 560) ** 2) * 1.6
    ref = mix(ref, GOLD2, np.clip(rim_f, 0, 1)[..., None])
    L = Layer(W, H)
    paint(L, ref, mc, np.full((H, W), math.pi / 2, np.float32) + (value_noise(H, W, 30, rng) - 0.5) * 0.3, rng,
          passes_std(0.42, dry=0.35, bristle=0.4, err=(0, 0.02, 0.035, 0.05), long=1.2)[:3], val_jitter=0.04, base=1.0)
    for (x, hw, top, rh) in TOWERS + [(1850, 340, 400, 0)]:
        for _ in range(int(rng.integers(2, 6)) if hw < 100 else 18):
            wx = x + rng.uniform(-hw + 4, hw - 4)
            wy = rng.uniform(top + 10, 462)
            if mc[int(wy), int(np.clip(wx, 0, W - 1))] < 0.9:
                continue
            c = mix(WIN0, WIN1, rng.random())
            L.stroke(wx, wy, math.pi / 2, rng.uniform(4, 8), rng.uniform(2.2, 3.4), c, 0.95, rng, 0.2, 0.0, taper=0.2)
            L.dab(wx, wy, 6, WIN0, 0.08, 4)
    out.over(L)
    # névoa na base do castelo e do penhasco
    mist = Layer(W, H)
    band = np.exp(-((yy - 480) / 40) ** 2) * (0.4 + 0.6 * value_noise(H, W, 80, rng, 2))
    mist.fill(FOG1, band * 0.55)
    low = sstep(500, 700, yy) * 0.8
    mist.fill(FOG0, low * (out.A > 0.01))
    out.over(mist)
    # relâmpago: bordas do castelo e da cidade acesas pela luz fria vinda do alto à esquerda
    solid = np.clip(mc + mt, 0, 1)
    edge = (mc > 0.5) & (mc[np.clip((yy - 3).astype(int), 0, H - 1), np.clip((xx - 3).astype(int), 0, W - 1)] < 0.5)
    e = blur(edge.astype(np.float32), 1.2) * 1.2
    rim.fill(COLD, np.clip(e, 0, 1) * 0.3)
    body = Layer(W, H)
    body.fill(hexc(0x8a9ac0), blur((solid > 0.5).astype(np.float32), 1.0) * 0.14)
    body.fill(hexc(0x8a9ac0), mf * sstep(700, 420, yy) * 0.1)
    body.over(rim)
    return out, body


# ======================================================================================
# abismo: névoa, aqueduto lá embaixo e as luzes da cidade (repete na horizontal)
# ======================================================================================
def mid_layers(rng):
    TW, PAD, H = 2048, 256, 840
    W = TW + PAD
    yy, xx = grid(W, H)
    out = Layer(W, H)
    # corpo de névoa: começa leve acima da linha da ponte e escurece lá no fundo
    top = 470 + 24 * (noise1d(W, 300, rng, 3) - 0.5)
    a = sstep(top[None, :] - 10, top[None, :] + 44, yy)
    ref = mix(FOG1, FOG0, sstep(520, 640, yy)[..., None])
    ref = mix(ref, hexc(0x0b0f1a), sstep(640, 840, yy)[..., None])
    ref = mix(ref, FOG2, (np.exp(-((yy - 520) / 18) ** 2) * 0.35 * value_noise(H, W, 90, rng, 2))[..., None])
    L = Layer(W, H)
    paint(L, ref, a, -0.04 + (value_noise(H, W, 90, rng) - 0.5) * 0.4, rng,
          passes_std(1.0, dry=0.35, bristle=0.35, err=(0, 0.02, 0.035, 0.06), long=1.8)[:3], val_jitter=0.04, clip_soft=4, base=1.0)
    L.multiply_alpha(np.clip(a, 0, 1))
    # luzes da cidade lá embaixo
    for _ in range(170):
        x, y = rng.uniform(0, W), rng.uniform(690, 820)
        L.dab(x, y, rng.uniform(1.4, 2.8), mix(WIN0, WIN1, rng.random()), rng.uniform(0.35, 0.8), 1.2)
        L.dab(x, y, rng.uniform(6, 12), WIN0, 0.07, 6)
    out.over(L)
    # aqueduto: tabuleiro e arcos, os pilares somem na névoa
    m = Mask(W, H)
    deck0, deck1 = 580, 600
    m.rect(-20, deck0, W + 20, deck1)
    for x in range(0, W + 1, 4):
        if (x // 4) % 3 == 0:
            m.rect(x - 1, deck0 - 7, x + 1, deck0)  # parapeito vazado
    m.rect(-20, deck0 - 8, W + 20, deck0 - 5)
    span = 256
    for i in range(-1, W // span + 2):
        cx = i * span
        m.rect(cx - 22, deck1 - 2, cx + 22, H + 5)
    arch = np.zeros((H, W), np.float32)
    ma = m.array()
    # vãos dos arcos: semicírculo logo abaixo do tabuleiro e paredes retas até a névoa
    r = span / 2 - 22
    ys0 = deck1 + 6 + r
    for i in range(-1, W // span + 2):
        cx = i * span + span / 2
        hole = (np.hypot(xx - cx, np.maximum(0, ys0 - yy)) < r) & (yy > deck1 + 4)
        arch = np.maximum(arch, hole.astype(np.float32))
    below = (yy > deck1 - 1).astype(np.float32)
    ma = np.clip(np.maximum(ma, below) - blur(arch, 0.7), 0, 1)
    ref = mix(hexc(0x141a2a), hexc(0x1e2638), sstep(560, 700, yy)[..., None])
    rr = np.roll(ma, -3, axis=1)
    rim_r = (ma > 0.5) & (rr < 0.5)
    ref = mix(ref, GOLD1, blur(rim_r.astype(np.float32), 0.8)[..., None] * 0.5)
    L = Layer(W, H)
    paint(L, ref, ma, np.full((H, W), 0.0, np.float32) + (value_noise(H, W, 40, rng) - 0.5) * 0.3, rng,
          passes_std(0.4, dry=0.35, bristle=0.4, err=(0, 0.02, 0.035, 0.05))[:3], val_jitter=0.04, clip_soft=1.0, base=1.0)
    fogv = sstep(610, 800, yy)
    L.P[:] = L.P * (1 - fogv[..., None] * 0.85) + FOG0 * L.A[..., None] * fogv[..., None] * 0.85
    out.over(L)
    # véu de névoa na frente do aqueduto
    veil = Layer(W, H)
    band = np.exp(-((yy - 640) / 34) ** 2) * (0.35 + 0.65 * value_noise(H, W, 110, rng, 2))
    veil.fill(FOG1, band * 0.6)
    out.over(veil)
    # relâmpago: tabuleiro e névoa acesos
    rim = Layer(W, H)
    up = np.roll(ma, 3, axis=0)
    e = (ma > 0.5) & (up < 0.5)
    rim.fill(COLD, np.clip(blur(e.astype(np.float32), 1.4) * 1.4, 0, 1) * 0.4)
    rim.fill(hexc(0x8a9ac0), np.clip(a, 0, 1) * np.exp(-((yy - 560) / 60) ** 2) * 0.25)
    return seamless(out, TW, PAD), seamless(rim, TW, PAD)


# ======================================================================================
# nuvens (repetem na horizontal)
# ======================================================================================
def clouds_far(rng):
    TW, PAD, H = 2560, 320, 400
    W = TW + PAD
    yy, xx = grid(W, H)
    n = value_noise(H, W, 120, rng, 4)
    n2 = value_noise(H, W, 30, rng, 3)
    band = np.exp(-((yy - 200) / 90) ** 2)
    a = sstep(0.45, 0.75, n * 0.8 + n2 * 0.2) * band
    ref = mix(SL3, FOG2, sstep(260, 120, yy)[..., None])
    L = Layer(W, H)
    paint(L, ref, (a > 0.05).astype(np.float32), np.full((H, W), -0.05, np.float32) + (n2 - 0.5) * 0.4, rng,
          passes_std(0.9, dry=0.3, bristle=0.35, err=(0, 0.02, 0.04, 0.06), long=2.2)[:3], val_jitter=0.05, clip_soft=3, base=0.9)
    L.multiply_alpha(np.clip(a * 1.2, 0, 0.75))
    return seamless(L, TW, PAD)


def clouds_near(rng):
    TW, PAD, H = 2560, 320, 340
    W = TW + PAD
    yy, xx = grid(W, H)
    n = value_noise(H, W, 150, rng, 4)
    n2 = value_noise(H, W, 40, rng, 3)
    reach = 150 + 120 * value_noise(1, W, 260, rng, 2)[0]
    a = sstep(reach[None, :] + 40, reach[None, :] - 60, yy) * sstep(0.3, 0.6, n * 0.8 + n2 * 0.2)
    ref = mix(hexc(0x0c1120), hexc(0x252e46), sstep(60, 260, yy)[..., None])
    under = np.clip(blur(a, 6) - blur(a, 2), 0, 1)
    L = Layer(W, H)
    paint(L, ref, (a > 0.05).astype(np.float32), np.full((H, W), 0.04, np.float32) + (n2 - 0.5) * 0.5, rng,
          passes_std(1.0, dry=0.3, bristle=0.4, err=(0, 0.02, 0.04, 0.06), long=2.0)[:3], val_jitter=0.05, clip_soft=3, base=0.95)
    L.multiply_alpha(np.clip(a * 1.1, 0, 0.95))
    return seamless(L, TW, PAD)


# ======================================================================================
# silhuetas da frente (Limbo): entulho, coluna quebrada, poste torto, galho seco, corrente
# ======================================================================================
def fg_layer(rng):
    TW, PAD, H = 3072, 384, 840
    W = TW + PAD
    m = Mask(W, H)
    # entulho baixo com capim seco, só na borda de baixo
    m.poly([(300, H + 5), (330, 790), (390, 762), (470, 752), (550, 764), (600, 790), (640, H + 5)])
    for _ in range(70):
        bx = rng.uniform(320, 630)
        ln = rng.uniform(24, 80)
        ang = -math.pi / 2 + rng.normal(0, 0.3)
        y0 = 776 + rng.uniform(-14, 30)
        ex, ey = bx + math.cos(ang) * ln, y0 + math.sin(ang) * ln
        m.line([(bx, y0), ((bx + ex) / 2 + rng.normal(0, 3), (y0 + ey) / 2), (ex, ey)], rng.uniform(1.6, 3.2))
    # coluna quebrada com capitel
    cx = 1820
    m.rect(cx - 30, 690, cx + 30, H + 5)
    m.poly([(cx - 44, 692), (cx + 44, 692), (cx + 36, 672), (cx - 36, 672)])
    m.poly([(cx - 36, 674), (cx - 20, 650), (cx + 8, 662), (cx + 36, 676)])
    for i in range(4):
        x = cx - 21 + i * 14
        m.rect(x - 1.2, 696, x + 1.2, H + 5, v=0)
    # poste de lampião torto
    m.line([(2640, H + 5), (2648, 640), (2666, 560), (2690, 528)], 5)
    m.line([(2690, 528), (2724, 532), (2738, 546)], 3)
    m.poly([(2728, 544), (2750, 544), (2746, 574), (2732, 574)])
    # galho seco descendo do alto
    def branch(x, y, ang, ln, w, depth):
        ex, ey = x + math.cos(ang) * ln, y + math.sin(ang) * ln
        m.line([(x, y), ((x + ex) / 2 + rng.normal(0, 4), (y + ey) / 2 + rng.normal(0, 4)), (ex, ey)], w)
        if depth > 0:
            for _ in range(2):
                branch(ex, ey, ang + rng.normal(0, 0.55), ln * rng.uniform(0.5, 0.72), max(1.4, w * 0.6), depth - 1)
    branch(1180, -20, math.pi / 2 + 0.5, 150, 13, 4)
    branch(1240, -20, math.pi / 2 - 0.3, 110, 9, 3)
    # corrente com peso
    x0 = 2300
    for i in range(14):
        y = -10 + i * 13
        if i % 2 == 0:
            m.ellipse(x0, y, 5.5, 9)
        else:
            m.ellipse(x0, y, 2.6, 9)
    m.poly([(x0 - 12, 176), (x0 + 12, 176), (x0 + 8, 204), (x0 - 8, 204)])
    a = blur(m.array(), 1.3)
    L = Layer(W, H)
    L.fill(INK, np.clip(a, 0, 1) * 0.96)
    return seamless(L, TW, PAD)


if __name__ == '__main__':
    rng = np.random.default_rng(31)
    if want('sky'):
        save(sky_layer(np.random.default_rng(1)), 'bridge-sky')
    if want('far'):
        far, frim = far_layers(np.random.default_rng(2))
        save(far, 'bridge-far')
        save(frim, 'bridge-far-rim')
    if want('mid'):
        mid, mrim = mid_layers(np.random.default_rng(3))
        save(mid, 'bridge-mid')
        save(mrim, 'bridge-mid-rim')
    if want('clouds'):
        save(clouds_far(np.random.default_rng(4)), 'clouds-far')
        save(clouds_near(np.random.default_rng(5)), 'clouds-near')
    if want('fg'):
        save(fg_layer(np.random.default_rng(6)), 'bridge-fg')
    print('pronto', round(time.time() - T0, 1))

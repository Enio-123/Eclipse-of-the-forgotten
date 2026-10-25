"""Fundos do Fosso dos Esquecidos e do Leito do Abismo no traço liso (2 pixels da imagem por pixel do
mundo, hd.json, filtro suave atrás do terreno em pixel art). O fosso é um poço fundo: as duas
camadas repetem nas duas direções (o que passa de uma borda aparece na outra).

  fosso-far  512x512  a parede do outro lado do abismo: rocha fria tingida de roxo, fios de tinta
                      escorrendo do alto, saliências com montes de máscaras quebradas e luzes lilás
                      soltas no ar
  fosso-mid  512x512  mais perto: dois paredões com a tinta pingando das bordas e correntes com
                      máscaras penduradas como troféus

uso: python3 fundos_fosso.py <pasta_saida> [camada ...] [--preview=<pasta>]
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from brush import Layer, hexc, mix, sstep, value_noise
from shapes import Mask
from fundos_cidade import grid

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else 'hd_fosso'
ONLY = set(ARGS[1:])
PREVIEW = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
T0 = time.time()

INK = hexc(0x09070d)
PURPLE = hexc(0x7029b8)
MAGENTA = hexc(0xb52a9b)
LILAC = hexc(0xd8b7ff)
ROCK0, ROCK1, ROCK2, ROCK3 = hexc(0x07060b), hexc(0x100d18), hexc(0x1a1526), hexc(0x2a2338)
PORC0, PORC1, PORC2 = hexc(0x3c3842), hexc(0x6e6874), hexc(0xa49cab)


def want(name):
    return not ONLY or name in ONLY


def tnoise(H, W, cell, rng, octaves=2):
    """Ruído suave (0..1) que emenda nas quatro bordas."""
    pad = int(min(W // 4, H // 4, cell * 2 + 16))
    n = value_noise(H + pad, W + pad, cell, rng, octaves)
    t = np.linspace(0, 1, pad, dtype=np.float32)
    out = n[:H, :W + pad].copy()
    out[:pad] = n[H:H + pad, :W + pad] * (1 - t[:, None]) + out[:pad] * t[:, None]
    res = out[:, :W].copy()
    res[:, :pad] = out[:, W:W + pad] * (1 - t[None, :]) + res[:, :pad] * t[None, :]
    return res


def wrapped(fn, W, H, *args):
    """Desenha uma forma três vezes em cada direção, para emendar nas bordas."""
    acc = None
    for ox in (-W, 0, W):
        for oy in (-H, 0, H):
            a = fn(ox, oy, *args)
            acc = a if acc is None else np.maximum(acc, a)
    return acc


def mask_pile(m, cx, y, w, rng, n=14):
    """Monte de máscaras quebradas: ovais claros meio enterrados, uns por cima dos outros."""
    out = []
    for i in range(n):
        x = cx + rng.uniform(-w / 2, w / 2)
        yy = y - rng.uniform(0, 7) * (1 - abs(x - cx) / (w / 2 + 1))
        rx = rng.uniform(4.0, 6.5)
        ry = rx * rng.uniform(1.15, 1.4)
        out.append((x, yy, rx, ry, rng.uniform(-0.9, 0.9)))
    return out


# ======================================================================================
# A parede do outro lado do abismo
# ======================================================================================
def fosso_far(rng):
    W, H = 1024, 1024
    yy, xx = grid(W, H)
    tex = tnoise(H, W, 26, rng, 3)
    big = tnoise(H, W, 140, rng, 2)
    col = mix(ROCK0, ROCK2, (0.25 + 0.6 * big)[..., None])
    col = col * (0.82 + 0.3 * tex)[..., None]
    # faces de rocha em pé (bandas largas, a borda esquerda pega uma luz roxa fria)
    for i in range(7):
        x0 = rng.uniform(0, W)
        w = rng.uniform(60, 170)
        amp = rng.uniform(6, 16)
        k = int(rng.integers(1, 3))
        ph = rng.uniform(0, 6.28)

        def band(ox, oy, x0=x0, w=w, amp=amp, k=k, ph=ph):
            cx = x0 + ox + amp * np.sin((yy - oy) / H * 2 * math.pi * k + ph)
            return np.clip(np.minimum(xx - (cx - w / 2), (cx + w / 2) - xx) / 6.0, 0, 1)

        a = wrapped(band, W, H)
        face = mix(ROCK1, ROCK3, sstep(0.3, 0.8, tex)[..., None]) * rng.uniform(0.75, 1.05)
        col = mix(col, face, (a * 0.55)[..., None])
        lit = np.clip(a - np.roll(a, 6, axis=1), 0, 1)
        col = mix(col, PURPLE * 0.5, (lit * 0.25)[..., None])
    # fios de tinta escorrendo de cima a baixo, com a beira roxa e um brilho lilás
    falls = np.zeros((H, W), np.float32)
    rims = np.zeros((H, W), np.float32)
    for i in range(6):
        x0 = rng.uniform(0, W)
        wd = rng.uniform(2.0, 5.0)
        k = int(rng.integers(1, 4))
        ph = rng.uniform(0, 6.28)

        def fall(ox, oy, x0=x0, wd=wd, k=k, ph=ph):
            cx = x0 + ox + 3.0 * np.sin((yy - oy) / H * 2 * math.pi * k + ph)
            return np.clip(wd - np.abs(xx - cx), 0, 1)

        def frim(ox, oy, x0=x0, wd=wd, k=k, ph=ph):
            cx = x0 + ox + 3.0 * np.sin((yy - oy) / H * 2 * math.pi * k + ph)
            return np.exp(-((np.abs(xx - cx) - wd) / 2.2) ** 2)

        falls = np.maximum(falls, wrapped(fall, W, H))
        rims = np.maximum(rims, wrapped(frim, W, H))
    col = mix(col, PURPLE * 0.8, (rims * 0.32)[..., None])
    col = mix(col, INK, (falls * 0.95)[..., None])
    sheen = falls * sstep(0.62, 0.8, tnoise(H, W, 12, rng, 1))
    col = mix(col, LILAC * 0.6, (sheen * 0.25)[..., None])
    # saliências com montes de máscaras quebradas (o que a prisão jogava aqui)
    m = Mask(W, H)
    piles = []
    for i in range(4):
        cx = rng.uniform(80, W - 80)
        y = 120 + i * 240 + rng.uniform(-30, 30)
        w = rng.uniform(110, 190)
        m.poly([(cx - w / 2 - 14, y + 2), (cx + w / 2 + 14, y + 2), (cx + w / 2 - 6, y + 16), (cx - w / 2 + 10, y + 18)])
        piles += mask_pile(m, cx, y, w, rng)
    ledge = np.asarray(m.array(), np.float32)
    col = mix(col, ROCK1 * 0.9, (ledge * 0.95)[..., None])
    col = mix(col, ROCK3 * 1.1, (np.clip(ledge - np.roll(ledge, 3, axis=0), 0, 1) * 0.6)[..., None])
    for (x, y, rx, ry, ang) in piles:
        dx = xx - x
        dy = yy - y
        c, s = math.cos(ang), math.sin(ang)
        u = (dx * c + dy * s) / rx
        v = (-dx * s + dy * c) / ry
        d = u * u + v * v
        a = np.clip((1 - d) * 4, 0, 1)
        if not a.any():
            continue
        tone = mix(PORC1, PORC2, sstep(0.5, -0.6, u + v * 0.4)[..., None])
        tone = mix(tone, PORC0, sstep(0.3, 1.0, d)[..., None])
        col = mix(col, tone * 0.55, (a * 0.9)[..., None])
        # os dois furos dos olhos
        for ex in (-0.38, 0.38):
            e = np.clip((1 - ((u - ex) ** 2 / 0.06 + (v + 0.15) ** 2 / 0.09)) * 3, 0, 1) * a
            col = mix(col, ROCK0, (e * 0.85)[..., None])
    # luzes lilás soltas no ar e uma névoa roxa respirando
    glow = np.zeros((H, W), np.float32)
    for i in range(46):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(1.0, 2.2)
        g = wrapped(lambda ox, oy: np.exp(-((xx - x - ox) ** 2 + (yy - y - oy) ** 2) / (2 * r * r)), W, H)
        glow = np.maximum(glow, g * rng.uniform(0.5, 1.0))
        halo = wrapped(lambda ox, oy: np.exp(-((xx - x - ox) ** 2 + (yy - y - oy) ** 2) / (2 * (r * 6) ** 2)), W, H)
        col = mix(col, PURPLE * 0.6, (halo * 0.12)[..., None])
    col = mix(col, LILAC, (glow * 0.85)[..., None])
    fog = tnoise(H, W, 180, rng, 2)
    col = mix(col, PURPLE * 0.32, (sstep(0.45, 0.85, fog) * 0.35)[..., None])
    # tudo bem escuro: é o fundo do fundo
    col = col * 0.78
    return Layer.from_rgb(np.clip(col, 0, 1))


# ======================================================================================
# Mais perto: os paredões que pingam e as correntes com máscaras
# ======================================================================================
def fosso_mid(rng):
    W, H = 1024, 1024
    yy, xx = grid(W, H)
    tex = tnoise(H, W, 16, rng, 3)
    A = np.zeros((H, W), np.float32)
    # dois paredões de rocha, borda torta e periódica na vertical
    walls = []
    for i, x0 in enumerate((rng.uniform(120, 260), rng.uniform(640, 780))):
        w = rng.uniform(120, 170)
        k1, k2 = int(rng.integers(2, 5)), int(rng.integers(5, 9))
        p1, p2 = rng.uniform(0, 6.28), rng.uniform(0, 6.28)

        def wall(ox, oy, x0=x0, w=w, k1=k1, k2=k2, p1=p1, p2=p2):
            t = (yy - oy) / H * 2 * math.pi
            l = x0 + ox - w / 2 + 14 * np.sin(t * k1 + p1) + 5 * np.sin(t * k2 + p2)
            r = x0 + ox + w / 2 + 12 * np.sin(t * k1 + p2) + 6 * np.sin(t * k2 + p1)
            return np.clip(np.minimum(xx - l, r - xx) / 2.0, 0, 1)

        a = wrapped(wall, W, H)
        walls.append((x0, w, a))
        A = np.maximum(A, a)
    broad = tnoise(H, W, 60, rng, 2)
    col = mix(ROCK0 * 1.3, ROCK2, sstep(0.25, 0.9, broad)[..., None])
    col = col * (0.9 + 0.16 * tex)[..., None]
    # rachaduras compridas em pé (a rocha racha pela tinta que escorre)
    cr = sstep(0.035, 0.0, np.abs(tnoise(H, W, 30, rng, 2) - 0.5)) * sstep(0.3, 0.7, broad)
    col = mix(col, ROCK0 * 0.6, (cr * 0.7)[..., None])
    # luz roxa fria na borda esquerda de cada paredão e escuro na direita
    lit = np.clip(A - np.roll(A, 7, axis=1), 0, 1)
    col = mix(col, PURPLE * 0.7, (ndi.gaussian_filter(lit, 2.0) * 0.6)[..., None])
    shade = np.clip(A - np.roll(A, -16, axis=1), 0, 1)
    col = mix(col, ROCK0, (ndi.gaussian_filter(shade, 5.0) * 0.7)[..., None])
    # a tinta escorrendo pela face: faixas compridas e gotas na ponta
    h = H // 20 + 2
    st = ndi.zoom(value_noise(h, W, 5, rng, 2), (20, 1), order=1)[:H].astype(np.float32)
    st = st[:H]
    ink = sstep(0.6, 0.72, st) * A
    col = mix(col, INK, (ink * 0.85)[..., None])
    col = mix(col, MAGENTA * 0.5, (sstep(0.58, 0.6, st) * sstep(0.62, 0.6, st) * A * 0.4)[..., None])
    # gotas soltando das bordas dos paredões
    m = Mask(W, H)
    for (x0, w, a) in walls:
        for k in range(9):
            y = rng.uniform(0, H)
            side = rng.choice([-1, 1])
            # acha a borda naquela altura
            row = a[int(y) % H]
            idx = np.nonzero(row > 0.5)[0]
            if not len(idx):
                continue
            x = idx.min() if side < 0 else idx.max()
            L = rng.uniform(8, 26)
            m.line([(x, y), (x + side * 1.5, y + L * 0.6), (x + side * 0.5, y + L)], rng.uniform(1.6, 2.6))
            m.ellipse(x + side * 0.5, y + L + 2.5, 2.4, 3.2)
    drips = np.asarray(m.array(), np.float32)
    col = mix(col, INK, (drips * 0.95)[..., None])
    A = np.maximum(A, drips)
    # correntes que descem do alto do poço com máscaras presas, como troféus
    cm = Mask(W, H)
    masks = []
    for i, x in enumerate((rng.uniform(380, 460), rng.uniform(520, 600), rng.uniform(900, 980))):
        y = -10.0
        k = 0
        while y < H + 10:
            if k % 2:
                cm.ellipse(x, y + 4, 1.5, 4.4)
            else:
                cm.ellipse(x, y + 4, 3.0, 4.0)
                cm.ellipse(x, y + 4, 1.0, 2.2, v=0)
            y += 7.2
            k += 1
        for j in range(int(rng.integers(2, 4))):
            masks.append((x + rng.uniform(-3, 3), rng.uniform(40, H - 40), rng.uniform(-0.5, 0.5)))
    chains = np.asarray(cm.array(), np.float32)
    col = mix(col, hexc(0x0b0910), (chains * 0.95)[..., None])
    A = np.maximum(A, chains * 0.95)
    for (x, y, ang) in masks:
        rx, ry = 9.0, 12.0
        dx, dy = xx - x, yy - y
        c, s = math.cos(ang), math.sin(ang)
        u = (dx * c + dy * s) / rx
        v = (-dx * s + dy * c) / ry
        d = u * u + v * v
        a = np.clip((1 - d) * 5, 0, 1)
        tone = mix(PORC1, PORC2, sstep(0.6, -0.6, u + v * 0.5)[..., None])
        tone = mix(tone, PORC0, sstep(0.4, 1.0, d)[..., None])
        # a rachadura de cada uma
        crack = sstep(0.12, 0.0, np.abs(u - 0.15 * np.sin(v * 6) - 0.1)) * (v > -0.6)
        tone = mix(tone, ROCK0, (crack * 0.8)[..., None])
        for ex in (-0.36, 0.36):
            e = np.clip((1 - ((u - ex) ** 2 / 0.05 + (v + 0.12) ** 2 / 0.08)) * 3, 0, 1)
            tone = mix(tone, ROCK0, e[..., None])
        col = mix(col, tone * 0.7, a[..., None])
        A = np.maximum(A, a)
    L = Layer(W, H)
    L.fill(np.clip(col * 0.72, 0, 1), np.clip(A, 0, 1))
    return L


# ======================================================================================
def save(L, name):
    img = L.image()
    img.save(f'{OUT}/{name}.png', optimize=True)
    print(name, img.size, round(time.time() - T0, 1), 's', flush=True)
    return img


def preview(out):
    """Vista do jogo (640x360 em 2x) com as duas camadas."""
    os.makedirs(out, exist_ok=True)
    view = Image.new('RGBA', (1280, 720), (8, 7, 11, 255))
    for n, sx, sy in (('fosso-far', 0, 0), ('fosso-mid', 300, 200)):
        p = f'{OUT}/{n}.png'
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGBA')
        for x in range(-sx, 1280, im.width):
            for y in range(-sy, 720, im.height):
                view.alpha_composite(im, (max(0, x), max(0, y)), (max(0, -x), max(0, -y)))
    view.convert('RGB').save(f'{out}/fosso.png')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    if want('fosso-far'):
        save(fosso_far(np.random.default_rng(91)), 'fosso-far')
    if want('fosso-mid'):
        save(fosso_mid(np.random.default_rng(92)), 'fosso-mid')
    if PREVIEW:
        preview(PREVIEW)

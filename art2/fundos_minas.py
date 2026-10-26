"""Fundos das Minas Abandonadas no traço liso (2 pixels da imagem por pixel do mundo, hd.json).
As duas camadas repetem nas duas direções (a mina tem salas compridas e o Veio, que é um poço).

  mine-far  512x512  a parede do outro lado da caverna: rocha em camadas, andaimes e torres de
                     madeira ao longe, passarelas com lampiões e veios de Âmbar brilhando fraco
  mine-mid  512x512  mais perto: escoras de madeira (dois esteios e a viga, com mãos-francesas),
                     cordas com baldes, a roda da polia e cachos de cristal de Âmbar acesos

uso: python3 fundos_minas.py <pasta_saida> [camada ...] [--preview=<pasta>]
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from brush import Layer, hexc, mix, sstep, value_noise
from shapes import Mask
from fundos_cidade import grid
from fundos_fosso import tnoise

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else 'hd_minas'
ONLY = set(ARGS[1:])
PREVIEW = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
T0 = time.time()

ROCK0, ROCK1, ROCK2, ROCK3 = hexc(0x09070a), hexc(0x16110f), hexc(0x241b16), hexc(0x34281e)
WOOD0, WOOD1, WOOD2 = hexc(0x0e0a08), hexc(0x1c140e), hexc(0x2e2116)
AMBER_D, AMBER, AMBER_L = hexc(0x7a3e10), hexc(0xffa63c), hexc(0xffe6a6)
HAZE = hexc(0x3a2616)


def want(name):
    return not ONLY or name in ONLY


class WrapMask(Mask):
    """Máscara que emenda nas quatro bordas: cada forma é desenhada nos nove lugares."""

    def _all(self, fn):
        for ox in (-self.W, 0, self.W):
            for oy in (-self.H, 0, self.H):
                fn(ox, oy)

    def poly(self, pts, v=255):
        self._all(lambda ox, oy: Mask.poly(self, [(x + ox, y + oy) for x, y in pts], v))
        return self

    def ellipse(self, cx, cy, rx, ry, v=255):
        self._all(lambda ox, oy: Mask.ellipse(self, cx + ox, cy + oy, rx, ry, v))
        return self

    def line(self, pts, w, v=255):
        self._all(lambda ox, oy: Mask.line(self, [(x + ox, y + oy) for x, y in pts], w, v))
        return self

    def rect(self, x0, y0, x1, y1, v=255):
        self._all(lambda ox, oy: Mask.rect(self, x0 + ox, y0 + oy, x1 + ox, y1 + oy, v))
        return self


def glow_at(W, H, pts, yy, xx, r):
    """Brilho redondo (gaussiano) em cada ponto, emendando nas bordas."""
    g = np.zeros((H, W), np.float32)
    for (x, y, k) in pts:
        for ox in (-W, 0, W):
            for oy in (-H, 0, H):
                dx = xx - x - ox
                dy = yy - y - oy
                near = (np.abs(dx) < r * 4) & (np.abs(dy) < r * 4)
                if not near.any():
                    continue
                g = np.maximum(g, np.exp(-(dx * dx + dy * dy) / (2 * r * r)) * k)
    return g


def strata(H, W, rng, yy, xx, scale=1.0):
    """Rocha em camadas tortas (repete nas bordas): o tom de cada faixa e as listras finas."""
    warp = (tnoise(H, W, 160, rng, 2) - 0.5) * 120 * scale
    yb = yy + warp
    period = 64 * scale
    ph = (yb / period) % 1.0
    band = np.floor(yb / period).astype(np.int64) % 16
    tones = rng.uniform(0.7, 1.25, 16).astype(np.float32)
    t = tones[band]
    fine = np.sin(ph * math.pi * 2 * 5 + tnoise(H, W, 30, rng, 2) * 4) * 0.5 + 0.5
    return t * (0.88 + 0.18 * fine), ph, band


# ======================================================================================
def mine_far(rng):
    W, H = 1024, 1024
    yy, xx = grid(W, H)
    tex = tnoise(H, W, 22, rng, 3)
    big = tnoise(H, W, 150, rng, 2)
    t, ph, band = strata(H, W, rng, yy, xx)
    col = mix(ROCK0, ROCK2, (0.2 + 0.6 * big)[..., None]) * (t * (0.84 + 0.3 * tex))[..., None]
    # veios de Âmbar ao longe: só algumas camadas têm veio, e ele aparece em trechos curtos,
    # mais grosso no meio do trecho e sumindo nas pontas (não é uma listra em cada faixa)
    has = (rng.random(16) < 0.3).astype(np.float32)
    vd = np.abs(ph - 0.5) * 64
    sn = tnoise(H, W, 90, rng, 2)
    seg = sstep(0.6, 0.74, sn) * has[band]
    width = 0.5 + 1.3 * sstep(0.6, 0.85, sn)
    vein = sstep(width, width * 0.3, vd) * seg
    col = mix(col, AMBER_D * 0.8, (np.exp(-vd / 6) * seg * 0.25)[..., None])
    col = mix(col, AMBER * 0.85, (vein * 0.6)[..., None])
    # torres de madeira ao longe: sobem o poço inteiro (a camada repete na vertical), com X entre
    # as travessas, e passarelas de uma torre até a outra, com corrimão e lampiões pendurados embaixo
    m = WrapMask(W, H)
    lamps = []
    xs = [60 + i * 340 + rng.uniform(-40, 40) for i in range(3)]
    ws = [rng.uniform(70, 110) for _ in range(3)]
    for i in range(3):
        x0, w = xs[i], ws[i]
        for x in (x0, x0 + w):
            m.rect(x - 4, -8, x + 4, H + 8)
        n = int(rng.integers(9, 12))
        step = H / n
        off = rng.uniform(0, step)
        for k in range(n):
            y = off + k * step
            m.line([(x0, y), (x0 + w, y + step)], 3.2)
            m.line([(x0 + w, y), (x0, y + step)], 3.2)
            m.rect(x0 - 10, y - 3, x0 + w + 10, y + 3)
        nx = xs[(i + 1) % 3] + (W if i == 2 else 0)
        x1, x2 = x0 + w + 4, nx - 4
        py = off + int(rng.integers(1, n)) * step
        m.rect(x1, py - 3, x2, py + 4)
        posts = max(3, int((x2 - x1) / 46))
        for k in range(1, posts):
            px = x1 + (x2 - x1) * k / posts
            m.rect(px - 1.2, py - 36, px + 1.2, py)
        m.rect(x1, py - 38, x2, py - 35)
        for k in (1, 3):
            px = x1 + (x2 - x1) * k / 4
            m.line([(px, py + 4), (px, py + 16)], 1.2)
            lamps.append((px % W, py + 20, 1.0))
    sil = m.array()
    col = mix(col, WOOD0, (sil * 0.85)[..., None])
    # lampiões acesos nas passarelas e a névoa quente no ar
    g = glow_at(W, H, lamps, yy, xx, 2.2)
    halo = glow_at(W, H, lamps, yy, xx, 16)
    col = mix(col, AMBER * 0.6, (halo * 0.22)[..., None])
    col = mix(col, AMBER_L, (g * 0.95)[..., None])
    fog = tnoise(H, W, 200, rng, 2)
    col = mix(col, HAZE, (sstep(0.4, 0.85, fog) * 0.35)[..., None])
    col *= 0.78
    return Layer.from_rgb(np.clip(col, 0, 1))


# ======================================================================================
def mine_mid(rng):
    W, H = 1024, 1024
    yy, xx = grid(W, H)
    A = np.zeros((H, W), np.float32)
    col = np.zeros((H, W, 3), np.float32)
    tex = tnoise(H, W, 14, rng, 3)
    # pilares de rocha em pé (com camadas) atrás das escoras
    pm = WrapMask(W, H)
    for i in range(2):
        cx = 180 + i * 520 + rng.uniform(-60, 60)
        w = rng.uniform(110, 170)
        pts_l = [(cx - w / 2 + 14 * math.sin(k * 0.9 + i), k * H / 12) for k in range(13)]
        pts_r = [(cx + w / 2 + 14 * math.sin(k * 0.7 + i * 2), k * H / 12) for k in range(12, -1, -1)]
        pm.poly(pts_l + pts_r)
    pil = pm.array()
    t, ph, _ = strata(H, W, rng, yy, xx, 0.7)
    rock = mix(ROCK1, ROCK3, (0.3 + 0.5 * tex)[..., None]) * t[..., None]
    lit = np.clip(pil - np.roll(pil, 7, axis=1), 0, 1)
    rock = mix(rock, AMBER_D * 0.9, (lit * 0.4)[..., None])
    col = mix(col, rock, pil[..., None])
    A = np.maximum(A, pil)
    # escoras: dois esteios que sobem o poço inteiro, uma viga a cada meia altura e as
    # mãos-francesas embaixo de cada viga; a corda do balde sai de uma viga e a roda da polia fica
    # presa embaixo da outra por um suporte
    wm = WrapMask(W, H)
    hi = WrapMask(W, H)
    beams = []
    for i in range(2):
        x0 = 20 + i * 512 + rng.uniform(-20, 20)
        span = rng.uniform(250, 320)
        b0 = rng.uniform(140, 260)
        for x in (x0, x0 + span):
            wm.rect(x - 10, -12, x + 10, H + 12)
            hi.rect(x - 10, -12, x - 6, H + 12)
        for top in (b0, b0 + H / 2):
            wm.rect(x0 - 26, top - 18, x0 + span + 26, top + 4)
            hi.rect(x0 - 26, top - 18, x0 + span + 26, top - 14)
            for x, sg in ((x0, 1), (x0 + span, -1)):
                wm.line([(x + sg * 8, top + 70), (x + sg * 62, top + 2)], 9)
            beams.append((x0, span, top))
    # corda com balde pendurada numa viga
    x0, span, top = beams[0]
    bx = x0 + span * rng.uniform(0.35, 0.65)
    by = top + rng.uniform(150, 300)
    wm.line([(bx, top + 2), (bx, by)], 2.2)
    wm.poly([(bx - 16, by), (bx + 16, by), (bx + 12, by + 26), (bx - 12, by + 26)])
    hi.rect(bx - 16, by, bx + 16, by + 3)
    # a roda da polia presa embaixo de outra viga; a corda desce de um lado até o balde de baixo
    x0, span, top = beams[3]
    cx, r = x0 + span * 0.5, 46
    cy = top + 4 + 30 + r * 0.2
    wm.rect(cx - 4, top + 2, cx + 4, cy)
    wm.ellipse(cx, cy, r, r)
    wm.ellipse(cx, cy, r - 9, r - 9, v=0)
    for k in range(6):
        a = k * math.pi / 3
        wm.line([(cx, cy), (cx + math.cos(a) * (r - 6), cy + math.sin(a) * (r - 6))], 5)
    wm.ellipse(cx, cy, 10, 10)
    ry = cy + rng.uniform(220, 300)
    wm.line([(cx - r, cy), (cx - r, ry)], 2.6)
    wm.poly([(cx - r - 14, ry), (cx - r + 14, ry), (cx - r + 11, ry + 22), (cx - r - 11, ry + 22)])
    wm.line([(cx + r, cy), (cx + r, cy + 120)], 2.6)
    wm.rect(cx + r - 7, cy + 120, cx + r + 7, cy + 128)
    wood = wm.array()
    hil = hi.array() * wood
    grain = 0.85 + 0.25 * tnoise(H, W, 6, rng, 2)
    wcol = mix(WOOD1, WOOD2, (0.5 * grain)[..., None])
    wcol = mix(wcol, AMBER_D * 1.1, (hil * 0.6)[..., None])
    col = mix(col, wcol, wood[..., None])
    A = np.maximum(A, wood)
    # cachos de cristal de Âmbar acesos nos pilares (luz própria)
    cm = WrapMask(W, H)
    pts = []
    ys, xs = np.nonzero(pil > 0.9)
    for i in range(7):
        j = int(rng.integers(0, len(xs)))
        x, y = float(xs[j]), float(ys[j])
        n = int(rng.integers(3, 6))
        for k in range(n):
            a = -math.pi / 2 + rng.normal(0, 0.6)
            ln = rng.uniform(14, 34)
            wd = ln * 0.28
            bx, by = x + rng.normal(0, 6), y + rng.normal(0, 3)
            tx, ty = bx + math.cos(a) * ln, by + math.sin(a) * ln
            nx, ny = -math.sin(a) * wd, math.cos(a) * wd
            cm.poly([(bx + nx, by + ny), (tx, ty), (bx - nx, by - ny)])
        pts.append((x, y - 10, 1.0))
    cr = cm.array()
    col = mix(col, AMBER, (cr * 0.95)[..., None])
    col = mix(col, AMBER_L, (cr * sstep(0.55, 0.85, tex) * 0.7)[..., None])
    A = np.maximum(A, cr)
    halo = glow_at(W, H, pts, yy, xx, 40)
    col = mix(col, col + AMBER * 0.35, (halo * A * 0.6)[..., None])
    L = Layer(W, H)
    L.fill(np.clip(col * 0.8, 0, 1), np.clip(A, 0, 1))
    return L


def save(L, name):
    img = L.image()
    img.save(f'{OUT}/{name}.png', optimize=True)
    print(name, img.size, round(time.time() - T0, 1), 's', flush=True)
    return img


def preview(out):
    os.makedirs(out, exist_ok=True)
    view = Image.new('RGBA', (1280, 720), (9, 7, 10, 255))
    for n, sx, sy in (('mine-far', 0, 0), ('mine-mid', 300, 200)):
        p = f'{OUT}/{n}.png'
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGBA')
        for x in range(-sx, 1280, im.width):
            for y in range(-sy, 720, im.height):
                view.alpha_composite(im, (max(0, x), max(0, y)), (max(0, -x), max(0, -y)))
    view.convert('RGB').save(f'{out}/minas.png')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    if want('mine-far'):
        save(mine_far(np.random.default_rng(141)), 'mine-far')
    if want('mine-mid'):
        save(mine_mid(np.random.default_rng(142)), 'mine-mid')
    if PREVIEW:
        preview(PREVIEW)

"""Camadas novas do EXTREME, pintadas em 2x (2 pixels da imagem por pixel do mundo):

  xnear-<tema>  1024x420 no mundo: arquitetura entre o fundo pintado e a pedra jogável (colunas,
                nichos, celas, casas, arbustos), mais escura que o fundo e com algumas luzes acesas
  xfg-<tema>    1024x360 no mundo: o que passa na frente da câmera, fora de foco, só nas bordas de
                cima e de baixo da tela (raízes, correntes, estandartes, entulho, mato), para dar
                profundidade sem cobrir o caminho

As duas repetem na horizontal. Temas: catacomb, prison, nave, city, memory, abyss.

uso: python3 extreme_camadas.py <pasta_saida> [tema ...] [--preview=<pasta>] [--quick]
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from brush import Layer, hexc, mix, sstep, blur, value_noise, paint, passes_std
from shapes import Mask

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else 'hd_extreme'
ONLY = set(ARGS[1:])
PREVIEW = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
QUICK = '--quick' in sys.argv
T0 = time.time()
K = 2  # pixels da imagem por pixel do mundo


def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)


# ---------- formas ----------
class Wrap(Mask):
    """Máscara que dá a volta na horizontal: o que passa da borda aparece do outro lado."""

    def _each(self, fn, xs):
        fn(0)
        lo, hi = min(xs), max(xs)
        if lo < 0:
            fn(self.W)
        if hi > self.W:
            fn(-self.W)

    def poly(self, pts, v=255):
        self._each(lambda d: Mask.poly(self, [(x + d, y) for x, y in pts], v), [p[0] for p in pts])
        return self

    def ellipse(self, cx, cy, rx, ry, v=255):
        self._each(lambda d: Mask.ellipse(self, cx + d, cy, rx, ry, v), [cx - rx, cx + rx])
        return self

    def line(self, pts, w, v=255):
        self._each(lambda d: Mask.line(self, [(x + d, y) for x, y in pts], w, v), [p[0] for p in pts])
        return self

    def rect(self, x0, y0, x1, y1, v=255):
        self._each(lambda d: Mask.rect(self, x0 + d, y0, x1 + d, y1, v), [x0, x1])
        return self


def taper_line(m, pts, w0, w1):
    n = len(pts) - 1
    for i in range(n):
        t = i / max(1, n - 1)
        m.line([pts[i], pts[i + 1]], w0 + (w1 - w0) * t)


def chain(m, x, y0, y1, w=4.4):
    y = y0
    k = 0
    while y < y1:
        if k % 2:
            m.ellipse(x, y + 8, w * 0.55, 8.8)
        else:
            m.ellipse(x, y + 8, w * 1.2, 8.0)
            m.ellipse(x, y + 8, w * 0.4, 4.4, v=0)
        y += 14.4
        k += 1
    return y


def root(m, rng, x, y0, length, w):
    pts = []
    ph = rng.uniform(0, 6.28)
    for i in range(24):
        t = i / 23
        pts.append((x + math.sin(t * 3.2 + ph) * 10 * t + rng.normal(0, 0.8), y0 + t * length))
    taper_line(m, pts, w, 1.2)
    # raízes finas saindo
    for _ in range(rng.integers(1, 4)):
        i = int(rng.integers(4, 18))
        bx, by = pts[i]
        side = rng.choice([-1, 1])
        sub = [(bx + side * j * 2.6 + math.sin(j * 0.7) * 2, by + j * 3.2) for j in range(int(rng.integers(6, 14)))]
        taper_line(m, sub, w * 0.45, 0.8)


def banner(m, rng, x, y0, w, h):
    pts = [(x - w / 2, y0), (x + w / 2, y0)]
    n = 7
    for i in range(n + 1):
        t = i / n
        px = x + w / 2 - t * w
        py = y0 + h * (0.82 + 0.18 * rng.random()) - (8 if i % 2 else 0) * rng.random() * 3
        pts.append((px, py))
    m.poly(pts)
    m.rect(x - w / 2 - 10, y0 - 6, x + w / 2 + 10, y0 + 2)


def cage(m, x, y0, w, h):
    yb = chain(m, x, 0, y0)
    m.ellipse(x, yb + 4, w * 0.55, 10)
    for i in range(6):
        bx = x - w / 2 + i * w / 5
        m.line([(bx, yb + 6), (bx, yb + h)], 3.2)
    m.rect(x - w / 2 - 3, yb + h - 4, x + w / 2 + 3, yb + h + 4)
    m.rect(x - w / 2 - 3, yb + h * 0.45, x + w / 2 + 3, yb + h * 0.45 + 4)


def lantern(m, x, y0, w=12):
    yb = chain(m, x, 0, y0, w=3.4)
    m.poly([(x - w, yb + 4), (x + w, yb + 4), (x + w * 0.8, yb + w * 2.6), (x - w * 0.8, yb + w * 2.6)])
    m.poly([(x - w * 0.5, yb - 4), (x + w * 0.5, yb - 4), (x + w, yb + 4), (x - w, yb + 4)])
    return x, yb + w * 1.5


def rubble(m, rng, x0, x1, base, hmax):
    x = x0
    while x < x1:
        r = rng.uniform(0.3, 1.0) * hmax
        m.ellipse(x, base - r * 0.35, r * rng.uniform(0.9, 1.6), r * 0.55)
        x += r * rng.uniform(0.8, 1.6)


def skull(m, cx, cy, r):
    m.ellipse(cx, cy, r, r * 0.92)
    m.rect(cx - r * 0.55, cy + r * 0.5, cx + r * 0.55, cy + r * 1.05)
    m.ellipse(cx - r * 0.38, cy + r * 0.05, r * 0.24, r * 0.28, v=0)
    m.ellipse(cx + r * 0.38, cy + r * 0.05, r * 0.24, r * 0.28, v=0)


def grass(m, rng, x, base, h, n=7):
    for _ in range(n):
        lean = rng.normal(0, 0.35)
        hh = h * rng.uniform(0.5, 1.0)
        pts = [(x + lean * hh * (t / 8) ** 2 * 1.2 + rng.normal(0, 0.3), base - hh * t / 8) for t in range(9)]
        taper_line(m, pts, rng.uniform(2.6, 4.2), 0.8)
        x += rng.uniform(1.5, 5)


def column(m, x, w, y0, y1, capital=True):
    m.rect(x - w / 2, y0, x + w / 2, y1)
    if capital:
        m.rect(x - w * 0.72, y0, x + w * 0.72, y0 + w * 0.32)
        m.rect(x - w * 0.62, y0 + w * 0.32, x + w * 0.62, y0 + w * 0.48)
    m.rect(x - w * 0.7, y1 - w * 0.35, x + w * 0.7, y1)


def arch_band(m, cx, w, spring, thick, pointed=False, y_bot=None):
    """Arco (só a faixa de pedra) entre duas colunas."""
    steps = 40
    outer, inner = [], []
    for i in range(steps + 1):
        t = math.pi * i / steps
        if pointed:
            # arco ogival: dois arcos de círculo que se encontram em cima
            ang = t
            r = w * 0.62
            if t < math.pi / 2:
                ox = cx + w / 2 - r
                px, py = ox + r * math.cos(ang * 0.82), spring - r * math.sin(ang * 0.82) * 1.05
            else:
                ox = cx - w / 2 + r
                a2 = math.pi - (math.pi - ang) * 0.82
                px, py = ox + r * math.cos(a2), spring - r * math.sin(a2) * 1.05
        else:
            px, py = cx + w / 2 * math.cos(t), spring - w / 2 * math.sin(t)
        outer.append((px, py))
    for (px, py) in reversed(outer):
        dx, dy = px - cx, py - spring
        d = math.hypot(dx, dy) + 1e-6
        inner.append((px - dx / d * thick, py - dy / d * thick))
    m.poly(outer + inner)


# ---------- pintura ----------
def flow_field(H, W, kind='v'):
    a = np.full((H, W), math.pi / 2 if kind == 'v' else 0.0, np.float32)
    return a + (value_noise(H, W, 60, np.random.default_rng(3)) - 0.5) * 0.6


def shade(H, W, base, top, rng, rim=None, rim_side=1, mask=None, noise=0.08):
    """Cor de referência: gradiente vertical, manchas de valor e, se houver, a luz de lado."""
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    ref = mix(top, base, y) * np.ones((1, W, 1), np.float32)
    n = value_noise(H, W, 40, rng, octaves=3)[..., None]
    ref *= 1 + (n - 0.5) * noise * 4
    if rim is not None and mask is not None:
        # luz batendo na borda virada para o lado da luz
        sh = np.roll(mask, -rim_side * 6, axis=1)
        edge = np.clip(mask - sh, 0, 1)
        edge = blur(edge, 2.0)
        ref = mix(ref, rim, np.clip(edge * 1.4, 0, 0.8)[..., None])
    return np.clip(ref, 0, 1)


def finish(name, mask, ref, rng, painted=True, soft=0.0, alpha=1.0, glows=(), glow_col=None):
    H, W = mask.shape
    L = Layer(W, H)
    if painted and not QUICK:
        flow = flow_field(H, W, 'v')
        paint(L, ref, mask, flow, rng, passes_std(scale=0.55, dry=0.2, bristle=0.3), base=0.85)
    else:
        L.fill(ref, mask)
    img = L.image()
    if soft > 0:
        arr = np.asarray(img, np.float32) / 255
        a = blur(arr[..., 3], soft)
        rgb = blur(arr[..., :3] * arr[..., 3:4], soft) / np.maximum(a[..., None], 1e-4)
        img = Image.fromarray((np.clip(np.dstack([rgb, a]), 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    arr = np.asarray(img, np.float32) / 255
    arr[..., 3] *= alpha
    # luzes acesas (chamas, janelas): ponto claro com halo, que o brilho do EXTREME espalha
    for gx, gy, r in glows:
        yy, xx = np.mgrid[0:H, 0:W]
        d = np.hypot(xx - gx, yy - gy)
        core = sstep(r, r * 0.3, d)
        halo = np.exp(-(d / (r * 3.2)) ** 2) * 0.55
        c = glow_col if glow_col is not None else hexc(0xffc070)
        a = np.clip(core + halo, 0, 1)
        arr[..., :3] = arr[..., :3] * (1 - a[..., None]) + c * a[..., None] * (0.7 + 0.3 * core[..., None])
        arr[..., :3] = np.clip(arr[..., :3] + (core[..., None] * 0.35), 0, 1)
        arr[..., 3] = np.maximum(arr[..., 3], a)
    out = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    out.save(os.path.join(OUT, name + '.png'))
    if PREVIEW:
        bg = Image.new('RGBA', out.size, (70, 70, 90, 255))
        bg.alpha_composite(out)
        bg.convert('RGB').resize((out.width // 2, out.height // 2)).save(os.path.join(PREVIEW, name + '.png'))
    log(name, out.size)


W = 1024 * K
HN = 420 * K
HF = 360 * K


# ---------- catacumbas ----------
def catacomb(rng):
    # perto: colunas com arcos redondos e, entre elas, nichos de ossário com caveiras
    m = Wrap(W, HN)
    floor = HN - 30
    step = 256
    for i in range(W // step):
        x = i * step + 40
        column(m, x, 46, 210, floor)
        arch_band(m, x + step / 2, step - 46, 300, 34)
    m.rect(0, floor, W, HN)
    m.rect(0, 0, W, 96)
    mask = m.array()
    holes = Wrap(W, HN)
    lights = []
    for i in range(W // step):
        x0 = i * step + 40 + 46
        for row in range(3):
            for col in range(4):
                cx = x0 + 22 + col * 40
                cy = 470 + row * 70
                if rng.random() < 0.85:
                    holes.ellipse(cx, cy, 15, 20)
        lights.append((i * step + 40 + step / 2, floor - 40, 5))
    hole = holes.array()
    m2 = Wrap(W, HN)
    for i in range(W // step):
        x0 = i * step + 40 + 46
        for row in range(3):
            for col in range(4):
                cx = x0 + 22 + col * 40
                cy = 470 + row * 70
                skull(m2, cx, cy + 4, 9)
    sk = m2.array()
    wall = Wrap(W, HN)
    for i in range(W // step):
        x0 = i * step + 40 + 23
        wall.rect(x0, 420, x0 + step - 46, floor)
    wall_m = wall.array()
    full = np.clip(np.maximum(mask, wall_m * (1 - hole)) + sk * hole, 0, 1)
    ref = shade(HN, W, hexc(0x1a1512), hexc(0x2b241e), rng, rim=hexc(0x6a4a2c), rim_side=-1, mask=full)
    ref = mix(ref, hexc(0x3a3128), (sk * hole)[..., None] * 0.9)
    finish('xnear-catacomb', full, ref, rng, glows=lights)

    # frente: raízes e correntes em cima, entulho, ossos e caveiras embaixo
    m = Wrap(W, HF)
    for _ in range(9):
        root(m, rng, rng.uniform(0, W), -10, rng.uniform(50, 120), rng.uniform(6, 11))
    for _ in range(3):
        chain(m, rng.uniform(0, W), -10, rng.uniform(60, 120))
    rubble(m, rng, -40, W + 40, HF + 6, 34)
    for _ in range(10):
        skull(m, rng.uniform(0, W), HF - rng.uniform(12, 24), rng.uniform(8, 12))
    mask = m.array()
    ref = shade(HF, W, hexc(0x070606), hexc(0x0d0b0a), rng, rim=hexc(0x3a2a1c), rim_side=-1, mask=mask, noise=0.04)
    finish('xfg-catacomb', mask, ref, rng, painted=False, soft=3.0, alpha=0.96)


# ---------- prisão ----------
def prison(rng):
    m = Wrap(W, HN)
    floor = HN - 26
    step = W / 6
    lights = []
    for i in range(6):
        x = i * step + 60
        column(m, x, 70, 120, floor)
        # frente da cela entre os pilares: grade e viga
        x0 = x + 35
        x1 = x + step - 35
        m.rect(x0, 300, x1, 322)
        for b in range(int((x1 - x0) / 26)):
            m.line([(x0 + 14 + b * 26, 322), (x0 + 14 + b * 26, floor)], 6)
        lights.append((x, 250, 6))
    m.rect(0, floor, W, HN)
    m.rect(0, 0, W, 120)
    for i in range(6):
        cx = i * step + 60 + step / 2
        arch_band(m, cx, step - 70, 200, 40)
    mask = m.array()
    ref = shade(HN, W, hexc(0x101416), hexc(0x1d2427), rng, rim=hexc(0x6e5236), rim_side=1, mask=mask)
    finish('xnear-prison', mask, ref, rng, glows=lights)

    m = Wrap(W, HF)
    for _ in range(6):
        x = rng.uniform(0, W)
        y = chain(m, x, -10, rng.uniform(50, 110))
        # gancho na ponta
        m.line([(x, y), (x, y + 18), (x + 12, y + 26), (x + 18, y + 14)], 5)
    cage(m, rng.uniform(0, W), rng.uniform(30, 50), 46, 70)
    rubble(m, rng, -40, W + 40, HF + 6, 26)
    for _ in range(5):
        x = rng.uniform(0, W)
        m.ellipse(x, HF - 22, 16, 9)
        m.ellipse(x, HF - 22, 10, 4, v=0)
    mask = m.array()
    ref = shade(HF, W, hexc(0x050607), hexc(0x0a0c0e), rng, rim=hexc(0x2e2a26), rim_side=1, mask=mask, noise=0.04)
    finish('xfg-prison', mask, ref, rng, painted=False, soft=3.0, alpha=0.96)


# ---------- catedral por dentro ----------
def nave(rng):
    m = Wrap(W, HN)
    floor = HN - 24
    step = W / 4
    lights = []
    for i in range(4):
        x = i * step + 80
        column(m, x, 84, 40, floor)
        arch_band(m, x + step / 2, step - 84, 330, 46, pointed=True)
        # altar lateral com velas
        ax = x + step / 2
        m.rect(ax - 90, floor - 80, ax + 90, floor)
        m.rect(ax - 110, floor - 92, ax + 110, floor - 80)
        for c in range(5):
            cx = ax - 60 + c * 30
            m.rect(cx - 4, floor - 120 - (c % 2) * 14, cx + 4, floor - 92)
            lights.append((cx, floor - 126 - (c % 2) * 14, 4))
    m.rect(0, floor, W, HN)
    mask = m.array()
    ref = shade(HN, W, hexc(0x15121a), hexc(0x25202c), rng, rim=hexc(0x8a7aa8), rim_side=-1, mask=mask)
    finish('xnear-nave', mask, ref, rng, glows=lights)

    m = Wrap(W, HF)
    for _ in range(4):
        banner(m, rng, rng.uniform(0, W), -4, rng.uniform(44, 64), rng.uniform(90, 130))
    # lustre de velas pendurado
    cx = rng.uniform(0, W)
    yb = chain(m, cx, -10, 60)
    m.ellipse(cx, yb + 10, 90, 12)
    m.ellipse(cx, yb + 10, 76, 6, v=0)
    # bancos quebrados embaixo
    for i in range(5):
        x = i * 410 + rng.uniform(0, 120)
        m.rect(x, HF - 26, x + 260, HF - 18)
        m.rect(x + 20, HF - 46, x + 26, HF)
        m.rect(x + 230, HF - 44, x + 236, HF)
        m.rect(x, HF - 50, x + 250, HF - 44)
    rubble(m, rng, -40, W + 40, HF + 8, 18)
    mask = m.array()
    ref = shade(HF, W, hexc(0x07060a), hexc(0x0e0c12), rng, rim=hexc(0x3c3448), rim_side=-1, mask=mask, noise=0.04)
    finish('xfg-nave', mask, ref, rng, painted=False, soft=3.0, alpha=0.95)


# ---------- cidade ----------
def city(rng):
    m = Wrap(W, HN)
    floor = HN - 20
    x = 0
    lights = []
    windows = Wrap(W, HN)
    while x < W:
        w = rng.uniform(160, 260)
        top = floor - rng.uniform(200, 330)
        m.rect(x, top, x + w - 8, floor)
        # telhado
        m.poly([(x - 14, top + 4), (x + (w - 8) / 2, top - rng.uniform(60, 110)), (x + w + 6, top + 4)])
        # janelas acesas e apagadas
        for wy in np.arange(top + 40, floor - 90, 70):
            for wx in np.arange(x + 30, x + w - 40, 56):
                windows.rect(wx, wy, wx + 22, wy + 34)
                if rng.random() < 0.3:
                    lights.append((wx + 11, wy + 17, 7))
        # porta em arco
        dx = x + w * 0.5
        windows.rect(dx - 22, floor - 70, dx + 22, floor)
        x += w
    m.rect(0, floor, W, HN)
    mask = np.clip(m.array() - windows.array() * 0.75, 0, 1)
    ref = shade(HN, W, hexc(0x14141c), hexc(0x24222c), rng, rim=hexc(0xc0874a), rim_side=1, mask=mask)
    finish('xnear-city', mask, ref, rng, glows=lights, glow_col=hexc(0xffb860))

    m = Wrap(W, HF)
    x = 0
    while x < W:
        kind = rng.integers(0, 3)
        if kind == 0:
            # barril de pé: barriga larga, tampa e base mais estreitas, os aros de ferro saltados
            pts = []
            for i in range(13):
                t = i / 12
                pts.append((x + 20 - (15 + 5 * math.sin(math.pi * t)), HF - 46 * (1 - t)))
            for i in range(13):
                t = 1 - i / 12
                pts.append((x + 20 + (15 + 5 * math.sin(math.pi * t)), HF - 46 * (1 - t)))
            m.poly(pts)
            for hy in (HF - 40, HF - 8):
                m.rect(x + 2, hy - 1.5, x + 38, hy + 1.5)
        elif kind == 1:
            # caixotes
            m.rect(x, HF - 40, x + 50, HF)
        else:
            grass(m, rng, x, HF + 2, 36, 6)
        x += rng.uniform(140, 300)
    rubble(m, rng, -40, W + 40, HF + 8, 16)
    mask = m.array()
    ref = shade(HF, W, hexc(0x07070a), hexc(0x0d0c10), rng, rim=hexc(0x4a3420), rim_side=1, mask=mask, noise=0.04)
    finish('xfg-city', mask, ref, rng, painted=False, soft=3.0, alpha=0.95)


# ---------- vale da memória ----------
def memory(rng):
    m = Wrap(W, HN)
    floor = HN - 40
    x = 0
    while x < W:
        # arbusto
        r = rng.uniform(40, 90)
        for k in range(6):
            m.ellipse(x + rng.uniform(-r, r), floor - r * rng.uniform(0.3, 0.9), r * rng.uniform(0.5, 0.9), r * rng.uniform(0.4, 0.7))
        if rng.random() < 0.45:
            # árvore nova
            tx = x + rng.uniform(-30, 30)
            m.line([(tx, floor), (tx + rng.uniform(-10, 10), floor - 180)], 10)
            for k in range(7):
                m.ellipse(tx + rng.uniform(-60, 60), floor - 190 + rng.uniform(-50, 40), rng.uniform(40, 70), rng.uniform(30, 50))
        x += rng.uniform(150, 260)
    m.rect(0, floor, W, HN)
    mask = m.array()
    ref = shade(HN, W, hexc(0x3f6a3a), hexc(0x6f9a58), rng, rim=hexc(0xf0e6a8), rim_side=-1, mask=mask, noise=0.12)
    finish('xnear-memory', mask, ref, rng)

    m = Wrap(W, HF)
    x = 0
    flowers = []
    while x < W:
        grass(m, rng, x, HF + 4, rng.uniform(34, 64), 9)
        if rng.random() < 0.5:
            flowers.append((x + rng.uniform(0, 30), HF - rng.uniform(50, 90)))
        x += rng.uniform(40, 110)
    # (sem galho pendurado no alto: no vale aberto ele não vinha de lugar nenhum)
    for fx, fy in flowers:
        m.ellipse(fx, fy, 7, 7)
    mask = m.array()
    ref = shade(HF, W, hexc(0x1d3a22), hexc(0x2f5a32), rng, rim=hexc(0x9ac070), rim_side=-1, mask=mask, noise=0.06)
    for fx, fy in flowers:
        yy, xx = np.mgrid[0:HF, 0:W]
        ref = mix(ref, hexc(0xf6d0e0), (np.hypot(xx - fx, yy - fy) < 8)[..., None] * 0.85)
    finish('xfg-memory', mask, ref, rng, painted=False, soft=4.0, alpha=0.9)


# ---------- fosso e abismo ----------
def abyss(rng):
    m = Wrap(W, HN)
    floor = HN
    x = 0
    veins = Wrap(W, HN)
    while x < W:
        w = rng.uniform(80, 150)
        top = rng.uniform(60, 260)
        m.poly([(x - w / 2, floor), (x - w * 0.3, top + 60), (x - w * 0.1, top), (x + w * 0.15, top + 30), (x + w * 0.4, top + 90), (x + w / 2, floor)])
        # veios de tinta acesa
        vx = x
        pts = [(vx + math.sin(t * 0.8) * 8, top + 40 + t * 22) for t in range(int((floor - top) / 22))]
        if len(pts) > 1:
            taper_line(veins, pts, 4, 2)
        x += w * rng.uniform(1.1, 1.8)
    mask = m.array()
    vein = veins.array() * mask
    ref = shade(HN, W, hexc(0x120a1a), hexc(0x221430), rng, rim=hexc(0x6a3aa0), rim_side=-1, mask=mask)
    ref = mix(ref, hexc(0xb070ff), vein[..., None] * 0.85)
    finish('xnear-abyss', mask, ref, rng)

    m = Wrap(W, HF)
    for _ in range(10):
        x = rng.uniform(0, W)
        length = rng.uniform(40, 120)
        pts = [(x + math.sin(t * 0.5) * 2, -6 + t * length / 12) for t in range(13)]
        taper_line(m, pts, rng.uniform(6, 12), 2)
        m.ellipse(pts[-1][0], pts[-1][1] + 6, 5, 8)
    # montes de máscaras embaixo
    for _ in range(14):
        cx = rng.uniform(0, W)
        cy = HF - rng.uniform(6, 18)
        r = rng.uniform(10, 15)
        m.ellipse(cx, cy, r, r * 1.2)
        m.ellipse(cx - r * 0.35, cy - r * 0.15, r * 0.2, r * 0.14, v=0)
        m.ellipse(cx + r * 0.35, cy - r * 0.15, r * 0.2, r * 0.14, v=0)
    rubble(m, rng, -40, W + 40, HF + 8, 14)
    mask = m.array()
    ref = shade(HF, W, hexc(0x06030a), hexc(0x0c0612), rng, rim=hexc(0x3a1a5a), rim_side=-1, mask=mask, noise=0.04)
    finish('xfg-abyss', mask, ref, rng, painted=False, soft=3.0, alpha=0.95)


THEMES = {'catacomb': catacomb, 'prison': prison, 'nave': nave, 'city': city, 'memory': memory, 'abyss': abyss}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
    for name, fn in THEMES.items():
        if ONLY and name not in ONLY:
            continue
        fn(np.random.default_rng(sum(map(ord, name)) + 7))

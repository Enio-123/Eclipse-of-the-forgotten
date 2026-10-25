"""O castelo de Vespera, o céu do eclipse e as nuvens de tempestade."""
import math
import numpy as np
from paint import Layer, banded, fbm, ridge1d, edges, rgb, bayer, quantize_alpha

SIL = [0x07080d, 0x0b0d16, 0x0f121e, 0x141828, 0x1a1f33]
WIN = [0xffe3a0, 0xffc96b, 0xf2a03f, 0xb8622a]


def eclipse_sky(w, h, cx, cy, r, seed=3, top=0x04050b, mid=0x0b0e1d, low=0x1b1d36, horizon=0x2a2440):
    L = Layer(w, h)
    yy, xx = np.mgrid[0:h, 0:w]
    t = yy / (h - 1)
    n = fbm(w, h, 64, seed, 4) - 0.5
    base = banded(np.clip(t * 1.05 + n * 0.12, 0, 1), [top, 0x070814, mid, 0x12142a, low, horizon])
    L.rgb = base
    L.a[:] = 1
    # brilho do eclipse no céu
    d = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
    ang = np.arctan2(yy + 0.5 - cy, xx + 0.5 - cx)
    rays = 0.55 + 0.45 * np.sin(ang * 7 + 1.3) * np.sin(ang * 3 - 0.4) + (fbm(w, h, 8, seed + 9, 3) - 0.5) * 0.9
    halo = np.clip(1 - (d - r) / (r * 3.2), 0, 1) ** 1.6 * (0.75 + 0.35 * rays)
    halo[d < r] = 0
    glow_cols = [0x0b0e1d, 0x1d1a2e, 0x3a2a35, 0x6e4a33, 0xb98a4a, 0xf0d08a, 0xfff4d6]
    g = banded(np.clip(halo, 0, 1), glow_cols)
    m = halo > 0.06
    L.rgb[m] = g[m]
    # disco negro com borda finíssima
    disk = d < r
    L.rgb[disk] = rgb(0x020204)
    ring = (d >= r) & (d < r + 1.2)
    L.rgb[ring] = rgb(0xfff4d6)
    # "anel de diamante": ponto brilhante na borda
    dx, dy = cx - r * 0.72, cy - r * 0.7
    dd = np.hypot(xx + 0.5 - dx, yy + 0.5 - dy)
    L.rgb[dd < 2.2] = rgb(0xffffff)
    for k in range(1, 9):
        a = max(0, 1 - k / 9)
        for (ox, oy) in ((k, 0), (-k, 0), (0, k), (0, -k)):
            px, py = int(dx + ox), int(dy + oy)
            if 0 <= px < w and 0 <= py < h and a > 0.3:
                L.rgb[py, px] = L.rgb[py, px] * (1 - a) + rgb(0xfff4d6) * a
    # estrelas raras longe do eclipse
    rs = np.random.RandomState(seed)
    for _ in range(int(w * h / 2600)):
        x, y = rs.randint(0, w), rs.randint(0, int(h * 0.55))
        if math.hypot(x - cx, y - cy) < r * 3.5:
            continue
        c = 0x6d7290 if rs.rand() < 0.7 else 0xa7acc4
        L.rgb[y, x] = rgb(c)
    return L


def storm_clouds(w, h, seed, density=0.52, light=(0.8, -0.6), cols=None, glow_x=None, glow_r=220):
    """Faixa de nuvens com repetição horizontal; luz vinda do eclipse."""
    cols = cols or [0x090b14, 0x0e111d, 0x141828, 0x1c2033, 0x2a2b42, 0x433d55]
    L = Layer(w, h)
    yy, xx = np.mgrid[0:h, 0:w]
    n = fbm(w, h, 128, seed, 5, 0.55)
    # mais nuvem no meio da faixa, borda superior ondulada
    prof = np.sin(np.clip(yy / h, 0, 1) * math.pi) ** 0.6
    v = n * prof
    m = v > (1 - density) * 0.62
    # iluminação: derivada do ruído na direção da luz
    nx = np.roll(n, -2, axis=1) - n
    ny = np.roll(n, -2, axis=0) - n
    shade = 0.45 + (nx * light[0] + ny * light[1]) * 9 + (v - 0.3) * 0.6
    if glow_x is not None:
        dist = np.minimum(abs(xx - glow_x), w - abs(xx - glow_x))
        shade += np.clip(1 - dist / glow_r, 0, 1) * 0.35 * (1 - yy / h)
    c = banded(np.clip(shade, 0, 1), cols)
    L.rgb = c
    edge = np.clip((v - (1 - density) * 0.62) * 14, 0, 1)
    L.a = quantize_alpha(edge * m, (0, 0.5, 1.0))
    return L


class Castle:
    """Silhueta gótica com torres, agulhas, catedral e janelas acesas."""

    def __init__(self, L, rim=None, seed=7):
        self.L, self.rim = L, rim
        self.rs = np.random.RandomState(seed)
        self.mask = np.zeros((L.h, L.w), bool)
        self.windows = []

    def add(self, m):
        self.mask |= m

    def rect(self, x0, y0, x1, y1):
        self.add(self.L.mask_rect(x0, y0, x1, y1))

    def poly(self, pts):
        self.add(self.L.mask_poly(pts))

    def crenel(self, x0, x1, y, mw=3, gap=2, mh=3):
        x = x0
        while x < x1:
            self.rect(x, y - mh, min(x + mw, x1), y + 1)
            x += mw + gap

    def tower(self, cx, base, w, h, roof='spire', roof_h=None, win=True, pin=False):
        x0, x1 = cx - w / 2, cx + w / 2
        top = base - h
        self.rect(x0, top, x1, base)
        rh = roof_h if roof_h is not None else w * 2.2
        if roof == 'spire':
            self.poly([(x0 - 1.5, top + 1), (cx, top - rh), (x1 + 1.5, top + 1)])
            if pin:
                for px in (x0 - 0.5, x1 - 0.5):
                    self.poly([(px - 1.2, top + 2), (px + 0.5, top - rh * 0.28), (px + 2.2, top + 2)])
        elif roof == 'cone':
            self.poly([(x0 - 2, top + 1), (cx, top - rh), (x1 + 2, top + 1)])
        elif roof == 'crenel':
            self.rect(x0 - 1, top - 2, x1 + 1, top + 1)
            self.crenel(x0 - 1, x1 + 1, top - 2)
        elif roof == 'dome':
            self.add(self.L.mask_ellipse(cx, top, w / 2 + 1, rh * 0.5) & (np.mgrid[0:self.L.h, 0:self.L.w][0] <= top))
            self.rect(cx - 0.5, top - rh * 0.5 - 6, cx + 0.5, top - rh * 0.5)
        if win:
            n = max(1, int(h / 14))
            for k in range(n):
                wy = top + 6 + k * (h - 10) / n
                if self.rs.rand() < 0.62:
                    self.windows.append((cx - 0.5, wy, 1 if w < 9 else 2, 3 if w < 9 else 4))

    def nave(self, x0, x1, base, h, gable=24):
        self.rect(x0, base - h, x1, base)
        cx = (x0 + x1) / 2
        self.poly([(x0 - 1, base - h + 1), (cx, base - h - gable), (x1 + 1, base - h + 1)])
        # contrafortes com pináculos
        step = (x1 - x0) / 5
        for k in range(6):
            bx = x0 + k * step
            self.rect(bx - 1.5, base - h * 0.75, bx + 1.5, base)
            self.poly([(bx - 2, base - h * 0.75 + 1), (bx, base - h * 0.75 - 9), (bx + 2, base - h * 0.75 + 1)])
        # janelas altas da nave
        for k in range(5):
            wx = x0 + step * (k + 0.5)
            self.windows.append((wx - 1, base - h + 10, 2, 10))
        # rosácea
        self.windows.append(('rose', cx, base - h + 2, 5.5))

    def paint(self, body=0x0c0e18, light_side=0x1b1f33, rimc=0x4a4362, depth_cols=None):
        L = self.L
        m = self.mask
        L.put(m, body)
        # leve volume: lado esquerdo levemente mais claro (luz fria)
        e1 = edges(m, 1, 0)
        L.put(e1, light_side)
        # borda iluminada pelo eclipse (direita/cima)
        e2 = edges(m, 1, 0) | edges(m, 0, -1)
        L.put(e2 & ~e1, rimc)
        for wdw in self.windows:
            if wdw[0] == 'rose':
                _, cx, cy, r = wdw
                rr = L.mask_ellipse(cx, cy, r, r) & m
                L.put(rr, 0x6e3b1e)
                L.put(L.mask_ellipse(cx, cy, r - 1.5, r - 1.5) & m, 0xf2a03f)
                L.put(L.mask_ellipse(cx, cy, 1.6, 1.6) & m, 0xffe3a0)
                yy, xx = np.mgrid[0:L.h, 0:L.w]
                ang = np.arctan2(yy + 0.5 - cy, xx + 0.5 - cx)
                spokes = (np.abs(np.sin(ang * 4)) < 0.22) & L.mask_ellipse(cx, cy, r - 1, r - 1) & m
                L.put(spokes, 0x6e3b1e)
                continue
            x, y, ww, hh = wdw
            col = WIN[self.rs.randint(0, 3)] if self.rs.rand() < 0.85 else 0x9c2b2b
            wm = L.mask_rect(x, y, x + ww, y + hh) & m
            L.put(wm, col)
            if hh >= 4:
                L.put(L.mask_rect(x, y, x + ww, y + 1) & m, WIN[3])
        if self.rim is not None:
            # mapa de relâmpago: bordas superiores e esquerdas
            self.rim.a[m] = 0
            r = edges(m, 0, -1) | edges(m, -1, 0)
            self.rim.put(r, 0x8f9bc4)
            self.rim.put(edges(m, 0, -1) & ~edges(m, -1, 0), 0x6c7699)


def vespera(L, rim, cx, base, s=1.0, seed=7):
    """Monta o castelo principal centrado em cx com a base em base (y)."""
    C = Castle(L, rim, seed)
    S = lambda v: v * s
    # muralha
    C.rect(cx - S(120), base - S(34), cx + S(118), base)
    C.crenel(cx - S(120), cx + S(118), base - S(34))
    # torres da muralha
    for dx, w, h, roof in [(-118, 14, 58, 'cone'), (-92, 10, 46, 'cone'), (-60, 12, 70, 'crenel'),
                           (64, 12, 74, 'cone'), (96, 10, 52, 'cone'), (116, 16, 64, 'crenel')]:
        C.tower(cx + S(dx), base - S(30), S(w), S(h), roof)
    # catedral central
    C.nave(cx - S(46), cx + S(30), base - S(30), S(64), gable=S(26))
    # torres sineiras
    C.tower(cx - S(58), base - S(30), S(18), S(126), 'spire', roof_h=S(62), pin=True)
    C.tower(cx + S(40), base - S(30), S(16), S(112), 'spire', roof_h=S(54), pin=True)
    # agulha principal sobre o cruzeiro
    C.tower(cx - S(8), base - S(90), S(11), S(78), 'spire', roof_h=S(84), pin=True)
    # torrinhas
    for dx, w, h in [(-78, 6, 92), (-36, 5, 98), (22, 5, 90), (56, 6, 84), (82, 7, 64)]:
        C.tower(cx + S(dx), base - S(30), S(w), S(h), 'spire', roof_h=S(w * 4), win=False)
    # pontes entre torres (arcobotantes)
    for x0, x1, y in [(-58, -46, 92), (30, 40, 86)]:
        C.poly([(cx + S(x0), base - S(y)), (cx + S(x1), base - S(y - 12)), (cx + S(x1), base - S(y - 16)), (cx + S(x0), base - S(y - 5))])
    return C


def rock_mass(L, x0, x1, top_y, base_y, seed, col=0x090b13, rim=None, rimc=0x232740, jag=10):
    """Penhasco irregular (base do castelo ou primeiro plano)."""
    w = int(x1 - x0)
    hs = ridge1d(max(8, w), top_y, jag, seed, cells=(max(8, w // 3), 16, 8, 4), gains=(1, 0.5, 0.3, 0.15), wrap=False)
    pts = [(x0, base_y)] + [(x0 + i, hs[i]) for i in range(w)] + [(x1, base_y)]
    m = L.mask_poly(pts)
    L.put(m, col)
    L.put(edges(m, 0, -1), rimc)
    if rim is not None:
        rim.a[m] = 0
        rim.put(edges(m, 0, -1), 0x6c7699)
    return m

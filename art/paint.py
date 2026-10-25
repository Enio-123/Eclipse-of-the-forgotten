"""Ferramentas de pintura em pixel art com numpy: degradês pontilhados, ruído, silhuetas."""
import numpy as np
from PIL import Image, ImageDraw

_B8 = np.array([
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21]], float)
BAYER = (_B8 + 0.5) / 64.0


def bayer(h, w):
    return np.tile(BAYER, (h // 8 + 1, w // 8 + 1))[:h, :w]


def rgb(c):
    return np.array([(c >> 16) & 255, (c >> 8) & 255, c & 255], float)


def pal(cols):
    return np.array([rgb(c) for c in cols])


def banded(t, cols, dither=True):
    """t (h,w) em 0..1 -> cores da paleta em faixas pontilhadas."""
    P = pal(cols)
    n = len(cols)
    h, w = t.shape
    x = np.clip(t, 0, 1) * (n - 1)
    lo = np.floor(x).astype(int)
    fr = x - lo
    if dither:
        lo = lo + (fr > bayer(h, w)).astype(int)
    else:
        lo = lo + (fr > 0.5).astype(int)
    lo = np.clip(lo, 0, n - 1)
    return P[lo]


def smooth(t):
    return t * t * (3 - 2 * t)


def value_noise(w, h, cell, seed, wrap=True):
    rs = np.random.RandomState(seed)
    gx = int(np.ceil(w / cell))
    gy = int(np.ceil(h / cell)) + 1
    g = rs.rand(gy + 1, gx + 1)
    if wrap:
        g[:, gx] = g[:, 0]
    ys = np.arange(h) / cell
    xs = np.arange(w) / cell
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = smooth(ys - y0)[:, None]
    fx = smooth(xs - x0)[None, :]
    a = g[y0][:, x0]
    b = g[y0][:, x0 + 1]
    c = g[y0 + 1][:, x0]
    d = g[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(w, h, cell, seed, octaves=4, gain=0.5, wrap=True):
    tot = np.zeros((h, w))
    amp, norm, c = 1.0, 0.0, cell
    for o in range(octaves):
        cw = max(2, int(c))
        # mantém a repetição horizontal exata
        while w % cw and cw > 2:
            cw -= 1
        tot += amp * value_noise(w, h, cw, seed + o * 101, wrap)
        norm += amp
        amp *= gain
        c /= 2
    return tot / norm


def ridge1d(w, base, amp, seed, cells=(96, 48, 24, 12, 6), gains=(1, 0.5, 0.28, 0.14, 0.07), wrap=True):
    """Alturas 1D (repetem na largura) para montanhas e colinas."""
    rs = np.random.RandomState(seed)
    out = np.zeros(w)
    for c, g in zip(cells, gains):
        n = max(1, w // c)
        pts = rs.rand(n + 1)
        if wrap:
            pts[n] = pts[0]
        xs = np.arange(w) / w * n
        i0 = np.floor(xs).astype(int)
        f = smooth(xs - i0)
        out += g * (pts[i0] * (1 - f) + pts[np.minimum(i0 + 1, n)] * f)
    out = out / sum(gains)
    return base - (out - 0.5) * 2 * amp


class Layer:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.rgb = np.zeros((h, w, 3))
        self.a = np.zeros((h, w))

    def put(self, mask, color, alpha=1.0):
        """mask bool/float (h,w); color int ou array (h,w,3)."""
        m = mask.astype(float) * alpha if mask.dtype != float else mask * alpha
        col = rgb(color) if isinstance(color, int) else color
        if isinstance(color, int):
            self.rgb = self.rgb * (1 - m[..., None]) + col[None, None, :] * m[..., None]
        else:
            self.rgb = self.rgb * (1 - m[..., None]) + col * m[..., None]
        self.a = np.maximum(self.a, m) if alpha >= 1 else self.a + m * (1 - self.a)

    def mask_poly(self, pts):
        im = Image.new('L', (self.w, self.h), 0)
        ImageDraw.Draw(im).polygon([(float(x), float(y)) for x, y in pts], fill=255)
        return np.array(im) > 127

    def mask_rect(self, x0, y0, x1, y1):
        m = np.zeros((self.h, self.w), bool)
        m[max(0, int(y0)):max(0, int(y1)), max(0, int(x0)):max(0, int(x1))] = True
        return m

    def mask_ellipse(self, cx, cy, rx, ry):
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        return ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1

    def image(self):
        arr = np.zeros((self.h, self.w, 4), np.uint8)
        arr[..., :3] = np.clip(self.rgb, 0, 255).astype(np.uint8)
        arr[..., 3] = (np.clip(self.a, 0, 1) * 255).astype(np.uint8)
        return Image.fromarray(arr, 'RGBA')

    def save(self, path, opaque=False):
        im = self.image()
        if opaque:
            im = im.convert('RGB')
        im.save(path, optimize=True)
        return im


def edges(mask, dx, dy):
    """Pixels da máscara cujo vizinho (dx,dy) está fora dela."""
    sh = np.zeros_like(mask)
    h, w = mask.shape
    ys = slice(max(0, dy), h + min(0, dy))
    yd = slice(max(0, -dy), h + min(0, -dy))
    xs = slice(max(0, dx), w + min(0, dx))
    xd = slice(max(0, -dx), w + min(0, -dx))
    sh[yd, xd] = mask[ys, xs]
    return mask & ~sh


def quantize_alpha(a, levels=(0, 0.35, 0.7, 1.0)):
    """Transparência em poucos níveis pontilhados (visual de pixel art)."""
    h, w = a.shape
    L = np.array(levels)
    x = np.clip(a, 0, 1) * (len(L) - 1)
    lo = np.floor(x).astype(int)
    fr = x - lo
    lo = np.clip(lo + (fr > bayer(h, w)).astype(int), 0, len(L) - 1)
    return L[lo]

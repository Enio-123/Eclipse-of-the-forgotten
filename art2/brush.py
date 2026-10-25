"""Pintura digital procedural: pinceladas com textura de cerdas, pincel seco e camadas RGBA.

A ideia é a mesma de um pintor digital: primeiro manchas grandes com a cor geral,
depois pinceladas menores só onde a imagem ainda está diferente da referência
(bordas, luzes e detalhes). Cada pincelada segue um campo de direção (vertical nos
troncos, horizontal na neve, diagonal nas copas).
"""
import math
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def hexc(h):
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], np.float32) / 255.0


def mix(a, b, t):
    return a + (b - a) * t


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def blur(a, sigma):
    if sigma <= 0:
        return a
    if a.ndim == 3:
        return np.stack([ndi.gaussian_filter(a[..., i], sigma, mode='nearest') for i in range(a.shape[2])], -1)
    return ndi.gaussian_filter(a, sigma, mode='nearest')


def value_noise(H, W, cell, rng, octaves=1, persistence=0.5):
    """Ruído suave 2D (0..1) por interpolação de grades aleatórias."""
    out = np.zeros((H, W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = max(1.0, cell / (2 ** o))
        gh, gw = int(H / c) + 3, int(W / c) + 3
        g = rng.random((gh, gw)).astype(np.float32)
        z = ndi.zoom(g, (c, c), order=3, mode='nearest')[:H, :W]
        if z.shape != (H, W):
            z = np.pad(z, ((0, H - z.shape[0]), (0, W - z.shape[1])), mode='edge')
        out += amp * z
        tot += amp
        amp *= persistence
    out /= tot
    return np.clip((out - out.min()) / (out.max() - out.min() + 1e-6), 0, 1)


def noise1d(n, cell, rng, octaves=2):
    out = np.zeros(n, np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = max(1.0, cell / (2 ** o))
        k = int(n / c) + 4
        g = rng.random(k).astype(np.float32)
        x = np.arange(n) / c
        out += amp * np.interp(x, np.arange(k), g)
        tot += amp
        amp *= 0.5
    return out / tot


class Layer:
    """Camada com alfa pré-multiplicado."""

    def __init__(self, W, H):
        self.W, self.H = W, H
        self.P = np.zeros((H, W, 3), np.float32)
        self.A = np.zeros((H, W), np.float32)

    @staticmethod
    def from_rgb(rgb):
        L = Layer(rgb.shape[1], rgb.shape[0])
        L.P[:] = rgb
        L.A[:] = 1
        return L

    def color(self):
        return self.P / np.maximum(self.A[..., None], 1e-4)

    def fill(self, rgb, alpha):
        """Pinta uma cor (HxWx3 ou 3) com alfa por pixel."""
        a = np.clip(alpha, 0, 1)[..., None]
        self.P *= 1 - a
        self.P += np.broadcast_to(rgb, self.P.shape) * a
        self.A *= 1 - a[..., 0]
        self.A += a[..., 0]

    def over(self, top):
        """Compõe a camada `top` por cima desta (no lugar)."""
        self.P *= 1 - top.A[..., None]
        self.P += top.P
        self.A = top.A + self.A * (1 - top.A)

    def multiply_alpha(self, m):
        self.P *= m[..., None]
        self.A *= m

    def stroke(self, cx, cy, ang, length, width, col, alpha=1.0, rng=None, bristle=0.45,
               dry=0.0, taper=0.45, bend=0.0, soft=0.9, clip=None, col2=None):
        hl, hw = max(length * 0.5, 0.5), max(width * 0.5, 0.35)
        r = math.hypot(hl, hw) + 2.0 + abs(bend) * hw
        x0, x1 = max(0, int(cx - r)), min(self.W, int(cx + r) + 2)
        y0, y1 = max(0, int(cy - r)), min(self.H, int(cy + r) + 2)
        if x0 >= x1 or y0 >= y1:
            return
        ys, xs = np.mgrid[y0:y1, x0:x1]
        dx = xs + 0.5 - cx
        dy = ys + 0.5 - cy
        c, s = math.cos(ang), math.sin(ang)
        u = dx * c + dy * s
        v = -dx * s + dy * c
        un = u / hl
        if bend:
            v = v - bend * hw * (un * un - 0.33)
        wv = hw * np.clip(1.0 - taper * un * un, 0.08, 1.0)
        a = sstep(wv + soft, wv - soft, np.abs(v))
        a *= sstep(1.0 + soft / hl, 1.0 - 1.6 * soft / hl, np.abs(un))
        rng = rng or np.random.default_rng()
        nb = max(3, int(width * 0.8))
        if bristle > 0:
            tex = rng.random(nb + 2).astype(np.float32)
            vi = np.clip((v / (2 * hw) + 0.5) * nb, 0, nb)
            i0 = vi.astype(np.int32)
            fr = vi - i0
            b = tex[i0] * (1 - fr) + tex[np.minimum(i0 + 1, nb + 1)] * fr
            a *= 1 - bristle * b
        if dry > 0:
            # a tinta acaba perto do fim da pincelada: falhas por cerda
            segs = max(4, int(length / 3))
            g = rng.random((nb + 2, segs + 2)).astype(np.float32)
            vi = np.clip((v / (2 * hw) + 0.5) * nb, 0, nb).astype(np.int32)
            ui = np.clip((un * 0.5 + 0.5) * segs, 0, segs).astype(np.int32)
            n = g[vi, ui]
            k = dry * sstep(-0.6, 1.0, un)
            a *= sstep(k - 0.08, k + 0.08, n)
        a *= alpha
        if clip is not None:
            a *= clip[y0:y1, x0:x1]
        if col2 is not None:
            t = np.clip(un * 0.5 + 0.5, 0, 1)[..., None]
            colv = col + (col2 - col) * t
        else:
            colv = col
        P = self.P[y0:y1, x0:x1]
        A = self.A[y0:y1, x0:x1]
        a3 = a[..., None]
        P *= 1 - a3
        P += colv * a3
        A *= 1 - a
        A += a

    def dab(self, cx, cy, r, col, alpha=1.0, soft=1.0):
        x0, x1 = max(0, int(cx - r - 2)), min(self.W, int(cx + r) + 3)
        y0, y1 = max(0, int(cy - r - 2)), min(self.H, int(cy + r) + 3)
        if x0 >= x1 or y0 >= y1:
            return
        ys, xs = np.mgrid[y0:y1, x0:x1]
        d = np.hypot(xs + 0.5 - cx, ys + 0.5 - cy)
        a = sstep(r + soft, r - soft, d) * alpha
        P = self.P[y0:y1, x0:x1]
        A = self.A[y0:y1, x0:x1]
        P *= 1 - a[..., None]
        P += col * a[..., None]
        A *= 1 - a
        A += a

    def image(self):
        rgb = np.clip(self.color(), 0, 1)
        out = np.dstack([rgb, np.clip(self.A, 0, 1)[..., None]])
        return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def paint(layer, ref, mask, flow, rng, passes, jitter=0.007, val_jitter=0.035, clip_soft=1.5, base=0.0):
    """Pinta `ref` (HxWx3) dentro de `mask` (HxW 0..1) seguindo `flow` (ângulo em radianos).

    passes: lista de dicts com size, spacing, length (min,max), err, alpha, bristle, dry, bend, taper.
    base: alfa de uma mancha lisa por baixo (garante cobertura sem buracos).
    """
    H, W = mask.shape
    clip = sstep(0.15, 0.65, blur(mask, clip_soft)) if clip_soft else mask
    if base > 0:
        layer.fill(blur(ref, 3.0), clip * base)
    for ps in passes:
        size = ps['size']
        ref_b = blur(ref, size * ps.get('blur', 0.3))
        step = max(1.0, size * ps.get('spacing', 0.7))
        ys = np.arange(step * 0.5, H, step)
        xs = np.arange(step * 0.5, W, step)
        gx, gy = np.meshgrid(xs, ys)
        gx = (gx + rng.uniform(-0.5, 0.5, gx.shape) * step).ravel()
        gy = (gy + rng.uniform(-0.5, 0.5, gy.shape) * step).ravel()
        ix = np.clip(gx.astype(np.int32), 0, W - 1)
        iy = np.clip(gy.astype(np.int32), 0, H - 1)
        keep = mask[iy, ix] > 0.5
        err = ps.get('err', 0.0)
        if err > 0:
            cur = layer.color()
            d = np.abs(cur[iy, ix] - ref_b[iy, ix]).sum(-1) / 3
            d = np.where(layer.A[iy, ix] < 0.9, 1.0, d)
            keep &= d > err
        order = np.nonzero(keep)[0]
        rng.shuffle(order)
        lo, hi = ps.get('length', (1.5, 3.5))
        for k in order:
            x, y = gx[k], gy[k]
            col = ref_b[iy[k], ix[k]].copy()
            col += rng.normal(0, jitter, 3).astype(np.float32)
            col *= 1 + rng.normal(0, val_jitter)
            ang = flow[iy[k], ix[k]] + rng.normal(0, ps.get('ang_jitter', 0.12))
            L = size * rng.uniform(lo, hi)
            w = size * rng.uniform(0.75, 1.15)
            layer.stroke(x, y, ang, L, w, np.clip(col, 0, 1), ps.get('alpha', 0.9), rng,
                         ps.get('bristle', 0.45), ps.get('dry', 0.0), ps.get('taper', 0.45),
                         rng.normal(0, ps.get('bend', 0.25)), clip=clip)
    return layer


# camadas de pintura típicas: manchas grandes, médias e detalhes
def passes_std(scale=1.0, dry=0.25, bristle=0.35, err=(0.0, 0.03, 0.045, 0.06), long=1.0):
    return [
        dict(size=24 * scale, spacing=0.75, length=(2.6 * long, 5.5 * long), err=err[0], alpha=0.8, bristle=bristle * 0.5, dry=dry * 0.5, blur=0.5, taper=0.3),
        dict(size=11 * scale, spacing=0.7, length=(2.8 * long, 6.0 * long), err=err[1], alpha=0.85, bristle=bristle, dry=dry, blur=0.35, taper=0.35),
        dict(size=5.5 * scale, spacing=0.7, length=(2.5 * long, 5.5 * long), err=err[2], alpha=0.9, bristle=bristle, dry=dry, blur=0.28, taper=0.4),
        dict(size=2.8 * scale, spacing=0.8, length=(2.0 * long, 4.5 * long), err=err[3], alpha=0.92, bristle=bristle * 0.6, dry=dry * 0.6, blur=0.2, taper=0.45),
    ]


def save(layer_or_img, path):
    img = layer_or_img.image() if isinstance(layer_or_img, Layer) else layer_or_img
    img.save(path)
    return img

"""Árvores pintadas para a Lembrança: a copa é um monte de tufos redondos, cada um com a luz
do sol vindo da esquerda (como um pintor resolve uma árvore: massa clara em cima, sombra fria
embaixo e um vinco escuro onde um tufo encosta no outro), borda recortada em folhas e
pinceladas curtas em várias direções. O tronco aparece embaixo e entre os tufos.

paint_tree(L, rng, x, gy, size, kind, haze, hazec) pinta direto na camada L (pés em x, gy).
"""
import math
import numpy as np
from brush import Layer, hexc, mix, sstep, value_noise, paint

SUN = np.array([-0.62, -0.5, 0.6], np.float32)
SUN /= np.linalg.norm(SUN)

# sombra, meio, luz, brilho
PAL = {
    'green': [hexc(0x24453a), hexc(0x3f7536), hexc(0x7fae46), hexc(0xd2e38c)],
    'deep': [hexc(0x1d3a33), hexc(0x325f34), hexc(0x5f9140), hexc(0xb6d27a)],
    'pink': [hexc(0x7d4468), hexc(0xc86f98), hexc(0xf0a3c0), hexc(0xffe1ea)],
    'bush': [hexc(0x22433a), hexc(0x3b6e38), hexc(0x6fa046), hexc(0xc0d884)],
}
BARK, BARK_L = hexc(0x3a281d), hexc(0x7a5a40)


def ramp(pal, s):
    """s 0..1 → cor entre sombra, meio, luz e brilho."""
    s = s[..., None]
    c = mix(pal[0], pal[1], np.clip(s / 0.35, 0, 1))
    c = mix(c, pal[2], np.clip((s - 0.35) / 0.4, 0, 1))
    return mix(c, pal[3], np.clip((s - 0.78) / 0.22, 0, 1) * 0.85)


def composite(dst, src, x0, y0):
    """Coloca a camada src sobre dst com o canto em (x0, y0), cortando o que sair."""
    h, w = src.A.shape
    X0, Y0 = max(0, x0), max(0, y0)
    X1, Y1 = min(dst.W, x0 + w), min(dst.H, y0 + h)
    if X0 >= X1 or Y0 >= Y1:
        return
    sP = src.P[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
    sA = src.A[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
    dP = dst.P[Y0:Y1, X0:X1]
    dA = dst.A[Y0:Y1, X0:X1]
    dP *= (1 - sA)[..., None]
    dP += sP
    dA *= 1 - sA
    dA += sA


def canopy_field(rng, w, h, cx, cy, rx, ry, size, n, flat=1.0):
    """Tufos da copa: devolve máscara, normal (nx, ny, nz) e o vinco entre tufos."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fine = value_noise(h, w, max(2.0, size * 0.035), rng, 2)
    zb = np.full((h, w), -1e9, np.float32)
    z2 = np.full((h, w), -1e9, np.float32)
    nx = np.zeros((h, w), np.float32)
    ny = np.zeros((h, w), np.float32)
    nz = np.ones((h, w), np.float32)
    clumps = []
    for k in range(n):
        a = rng.uniform(0, 2 * math.pi)
        rr = math.sqrt(rng.random())
        ccx = cx + math.cos(a) * rr * rx * 0.78
        ccy = cy + math.sin(a) * rr * ry * 0.78 * flat
        r = size * rng.uniform(0.15, 0.26) * (1.15 - 0.35 * rr)
        cz = (1 - rr) * size * 0.25 + (ccy - cy) * 0.25
        clumps.append((ccx, ccy, r, cz))
    # tufos de cima por último: a copa cresce para cima e para fora
    for (ccx, ccy, r, cz) in clumps:
        d = np.hypot(xx - ccx, (yy - ccy) * 1.08)
        reff = r * (1 + (fine - 0.5) * 0.42)
        inside = d < reff
        dz = np.sqrt(np.clip(reff * reff - d * d, 0, None))
        z = cz + dz
        better = inside & (z > zb)
        z2 = np.where(better, zb, np.where(inside & (z > z2), z, z2))
        zb = np.where(better, z, zb)
        inv = 1.0 / np.maximum(reff, 1e-3)
        nx = np.where(better, (xx - ccx) * inv, nx)
        ny = np.where(better, (yy - ccy) * inv, ny)
        nz = np.where(better, dz * inv, nz)
    M = zb > -1e8
    crease = np.where(z2 > -1e8, np.exp(-(zb - z2) / max(1.0, size * 0.05)), 0.0)
    return M, nx, ny, nz, crease.astype(np.float32)


def paint_tree(L, rng, x, gy, size, kind='green', haze=0.0, hazec=None, trunk=True, flat=1.0, petals=None):
    pal = PAL[kind]
    hazec = hexc(0xf1e8d6) if hazec is None else hazec
    trunk_h = size * (0.62 if trunk else 0.12)
    cx = x + rng.normal(0, size * 0.04)
    cy = gy - trunk_h - size * 0.3 * flat
    rx, ry = size * 0.6, size * 0.46 * flat
    pad = int(size * 0.5) + 6
    x0, y0 = int(cx - rx - pad), int(cy - ry - pad)
    x1, y1 = int(cx + rx + pad), int(gy + 6)
    w, h = x1 - x0, y1 - y0
    sub = Layer(w, h)
    lx, ly, lcx, lcy = x - x0, gy - y0, cx - x0, cy - y0
    # tronco e galhos (atrás da copa)
    if trunk:
        tw = max(2.0, size * 0.085)
        bark = mix(BARK, hazec, haze)
        barkl = mix(BARK_L, hazec, haze)
        top = lcy + ry * 0.2
        sub.stroke(lx, (ly + top) / 2, math.pi / 2 + rng.normal(0, 0.04), ly - top + 2, tw, bark, 1.0, rng, 0.3, 0.05, taper=0.25)
        sub.stroke(lx - tw * 0.3, (ly + top) / 2, math.pi / 2, ly - top, tw * 0.3, barkl, 0.6, rng, 0.4, 0.2, taper=0.4)
        for s in (-1, 1, rng.choice([-1, 1])):
            ang = -math.pi / 2 + s * rng.uniform(0.35, 0.8)
            ln = size * rng.uniform(0.28, 0.42)
            bx, by = lx, top + (ly - top) * rng.uniform(0.0, 0.25)
            sub.stroke(bx + math.cos(ang) * ln / 2, by + math.sin(ang) * ln / 2, ang, ln, tw * 0.55, bark, 0.95, rng, 0.3, 0.1, taper=0.6)
    n = int(9 + size / 7)
    M, nx, ny, nz, crease = canopy_field(rng, w, h, lcx, lcy, rx, ry, size, n, flat)
    yy = np.mgrid[0:h, 0:w][0].astype(np.float32)
    shade = np.clip(nx * SUN[0] + ny * SUN[1] + nz * SUN[2], 0, 1)
    # a massa toda escurece para baixo e para a direita (sombra própria da copa)
    mass = sstep(lcy - ry, lcy + ry * 1.1, yy)
    s = shade * (1 - 0.45 * mass) + 0.05
    s = s * (1 - 0.55 * crease)
    col = ramp(pal, np.clip(s, 0, 1))
    # luz do céu nas sombras (um pouco de azul) e brilho atravessando as folhas na borda do sol
    col = mix(col, col * 0.75 + hexc(0x7fa0c0) * 0.25, ((1 - shade) * 0.35)[..., None])
    col = mix(col, hazec, haze)
    flow = (value_noise(h, w, max(3.0, size * 0.08), rng, 1) - 0.5) * 6.0
    k = max(0.25, size / 110)
    passes = [
        dict(size=9 * k, spacing=0.8, length=(1.0, 1.9), err=0.0, alpha=0.85, bristle=0.35, dry=0.25, blur=0.25, taper=0.5, ang_jitter=0.6),
        dict(size=4.6 * k, spacing=0.85, length=(1.0, 1.8), err=0.02, alpha=0.9, bristle=0.35, dry=0.2, blur=0.15, taper=0.55, ang_jitter=0.7),
        dict(size=2.4 * k, spacing=0.95, length=(1.0, 1.7), err=0.035, alpha=0.9, bristle=0.25, dry=0.15, blur=0.08, taper=0.6, ang_jitter=0.8),
    ]
    Mf = M.astype(np.float32)
    paint(sub, col, Mf, flow, rng, passes, jitter=0.01, val_jitter=0.06, clip_soft=0, base=1.0)
    # folhas soltas na borda iluminada e pontos de luz
    ys, xs = np.nonzero(M & (shade > 0.72))
    if len(xs):
        for i in rng.choice(len(xs), min(len(xs), int(size * 0.35)), replace=False):
            ang = rng.uniform(0, math.pi)
            sub.stroke(xs[i], ys[i], ang, rng.uniform(1.5, 3.0) * max(1, k * 2), rng.uniform(0.7, 1.2) * max(1, k * 1.6),
                       mix(pal[3], hazec, haze), rng.uniform(0.35, 0.65), rng, 0.2, 0.1, taper=0.6)
    if petals is not None:
        for _ in range(int(size * 0.5)):
            px = lcx + rng.normal(0, rx * 0.9)
            py = lcy + ry + rng.uniform(0, ly - lcy - ry + 4)
            sub.dab(px, py, rng.uniform(0.6, 1.2) * max(1, k * 1.6), mix(pal[2], hazec, haze), rng.uniform(0.5, 0.9), 0.5)
    composite(L, sub, x0, y0)
    return (x0, y0, x1, y1)


def ground_shadow(L, x, gy, size, col, alpha=0.35):
    """Sombra da árvore no chão: elipse achatada puxada para a direita (sol baixo à esquerda)."""
    cx, rx, ry = x + size * 0.35, size * 0.75, size * 0.085
    x0, x1 = max(0, int(cx - rx - 4)), min(L.W, int(cx + rx + 4))
    y0, y1 = max(0, int(gy - ry - 4)), min(L.H, int(gy + ry + 4))
    if x0 >= x1 or y0 >= y1:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.hypot((xx - cx) / rx, (yy - gy) / ry)
    a = sstep(1.0, 0.35, d) * alpha * sstep(cx + rx, x - size * 0.2, xx)
    P = L.P[y0:y1, x0:x1]
    A = L.A[y0:y1, x0:x1]
    P *= (1 - a)[..., None]
    P += col * a[..., None]
    A *= 1 - a
    A += a

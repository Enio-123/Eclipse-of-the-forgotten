"""Relevo para as pinturas: o volume da pedra vem de um campo de altura (o quanto cada ponto avança na
direção de quem olha), e a luz sai da normal desse campo. Assim a montanha, o paredão e a coluna de
basalto ganham faces de verdade (a que pega a luz, a da sombra, o vinco entre elas) antes do pincel.

  shade(z, luz)          luz difusa, normal e o brilho molhado (especular) de um campo de altura
  ridged(n)              ruído em cristas (1 - |2n - 1|): costelas finas em vez de manchas
  jagged(line, ...)      serrilha fractal numa linha de crista (picos menores, entalhes, ombros)
  spurs(...)             os espigões descendo de cada pico de uma serra vista de frente e o relevo das
                         faces entre eles (a distância ao espigão mais próximo)
"""
import math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from brush import noise1d


def unit(v):
    v = np.asarray(v, np.float32)
    return v / np.linalg.norm(v)


def shade(z, light, k=1.0, spec_pow=0.0):
    """z: HxW (pixels para a frente). light: vetor para a luz (x direita, y para baixo, z para fora).
    Devolve (difusa 0..1, nx, ny, nz, especular 0..1)."""
    gy, gx = np.gradient(z.astype(np.float32))
    nx, ny = -gx * k, -gy * k
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + 1.0)
    nx, ny, nz = nx * inv, ny * inv, inv
    l = unit(light)
    d = nx * l[0] + ny * l[1] + nz * l[2]
    sp = None
    if spec_pow:
        # reflexo da luz na direção de quem olha (0, 0, 1)
        rz = 2 * d * nz - l[2]
        sp = np.clip(rz, 0, 1) ** spec_pow
    return np.clip(d, 0, 1), nx, ny, nz, sp


def ridged(n):
    return 1.0 - np.abs(2.0 * n - 1.0)


def jagged(line, rng, amp, cell=180.0, octaves=6, sharp=0.6, period=None):
    """Soma oitavas de ruído na linha (y por coluna; menor = mais alto). As oitavas finas usam o ruído
    em cristas (entalhes em V) misturado com o liso pela `sharp`. period: a linha emenda (n colunas)."""
    n = len(line)
    out = line.astype(np.float32).copy()
    a, c = amp, cell
    for o in range(octaves):
        if period:
            pad = int(min(n // 3, c * 2 + 8))
            v = noise1d(n + pad, max(2.0, c), rng, 1)
            t = np.linspace(0, 1, pad, dtype=np.float32)
            w = v[:n].copy()
            w[:pad] = v[n:n + pad] * (1 - t) + v[:pad] * t
        else:
            w = noise1d(n, max(2.0, c), rng, 1)
        r = ridged(w)
        s = sharp if o >= 2 else 0.0
        out += ((w - 0.5) * (1 - s) + (r - 0.5) * s) * a
        a *= 0.52
        c *= 0.5
    return out


def peaks_of(line, win=40, min_prom=12.0):
    """Os picos de uma linha de crista (mínimos locais de y), com a proeminência mínima."""
    n = len(line)
    out = []
    lo = ndi.minimum_filter1d(line, win * 2 + 1, mode='nearest')
    for x in range(2, n - 2):
        if line[x] <= lo[x] + 1e-3 and line[x] < line[x - 1] + 1e-3 and line[x] < line[x + 1] + 1e-3:
            a, b = max(0, x - win * 3), min(n, x + win * 3)
            prom = min(line[a:x].max() if x > a else line[x], line[x:b].max()) - line[x]
            if prom >= min_prom and (not out or x - out[-1] > win // 2):
                out.append(x)
    return out


def spurs(W, H, rng, line, base_y, peaks=None, k=(0.55, 1.15), tilt=0.55, branch=0.55, step=5.0, wrap=False):
    """Relevo de uma serra vista de frente. Cada pico solta dois espigões (um para cada lado) que
    descem em passeio até o pé, às vezes com um galho; a crista também conta como espigão. A altura
    (para a frente) é a inclinação geral da encosta (sobe para quem olha conforme desce) menos a
    distância ao espigão mais próximo vezes a inclinação dele: as faces entre os espigões viram para
    os lados e os vincos (as canaletas) ficam no meio. Devolve (z, distância ao espigão, rótulo)."""
    if peaks is None:
        peaks = peaks_of(line)
    img = Image.new('I', (W, H), 0)
    dr = ImageDraw.Draw(img)
    ks = [0.0]
    lab = 1
    # a crista: rótulo próprio, inclinação média
    pts = [(x, float(line[x])) for x in range(0, W, 2)]
    dr.line(pts, fill=lab, width=1)
    ks.append(float(np.mean(k)))
    lab += 1

    def walk(x, y, ang, kk, depth):
        nonlocal lab
        me = lab
        lab += 1
        ks.append(kk)
        pts = [(x, y)]
        while y < base_y + 30 and len(pts) < 600:
            ang += rng.normal(0, 0.1)
            # os espigões descem: o ângulo fica entre 25 e 155 graus (y para baixo)
            ang = float(np.clip(ang, math.radians(28), math.radians(152)))
            x += math.cos(ang) * step
            y += math.sin(ang) * step
            if not wrap and (x < -40 or x > W + 40):
                break
            pts.append((x, y))
            if depth < 2 and rng.random() < branch * step / 90.0 and y < base_y - 30:
                side = rng.choice([-1, 1])
                walk(x, y, ang + side * rng.uniform(0.35, 0.7), kk * rng.uniform(0.85, 1.1), depth + 1)
        if wrap:
            for ox in (-W, 0, W):
                dr.line([(px + ox, py) for px, py in pts], fill=me, width=1)
        else:
            dr.line(pts, fill=me, width=1)

    for px in peaks:
        py = float(line[int(px) % W])
        for side in (-1, 1):
            # side -1: desce para a esquerda (ângulo > 90°), +1 para a direita
            a0 = math.pi / 2 - side * rng.uniform(0.55, 0.95)
            walk(float(px), py + 1, a0, rng.uniform(*k), 0)
        if rng.random() < 0.6:
            walk(float(px), py + 1, math.pi / 2 + rng.normal(0, 0.15), rng.uniform(*k), 1)
    labels = np.asarray(img, np.int32)
    d, (iy, ix) = ndi.distance_transform_edt(labels == 0, return_indices=True)
    near = labels[iy, ix]
    kk = np.asarray(ks, np.float32)[near]
    yy = np.arange(H, dtype=np.float32)[:, None]
    z = tilt * (yy - line[None, :]) - kk * d
    return z.astype(np.float32), d.astype(np.float32), near

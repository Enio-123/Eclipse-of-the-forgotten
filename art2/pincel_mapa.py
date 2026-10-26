"""Mapa de pinceladas que repete sem costura, usado pelo filtro de pintura a óleo do jogo.

Cada texel guarda a pincelada que ficou por cima nele:
  R = altura da tinta (relevo: crista no meio, sulcos das cerdas, tinta mais grossa no começo)
  G = variação de cor da pincelada (0,5 = nenhuma)
  B = direção da pincelada (0..1 = 0..pi)
A pincelada segue um campo de redemoinhos (curvas suaves, como numa pintura a óleo grossa).

uso: python3 pincel_mapa.py <saida.png> [--preview=<pasta>] [--size=512] [--seed=7]
"""
import math
import sys
import numpy as np
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
OUT = args[0] if args else 'paint-strokes.png'
T = int(opts.get('size', 512))
rng = np.random.default_rng(int(opts.get('seed', 7)))

# campo de redemoinhos: corrente de uma função que repete (ondas com frequência inteira)
waves = []
for kx, ky in [(1, 0), (0, 1), (1, 1), (1, -1), (2, 1), (1, 2), (2, -1), (3, 1), (1, 3), (3, -2)]:
    amp = 1.0 / math.hypot(kx, ky) ** 1.2
    waves.append((kx, ky, amp * rng.uniform(0.6, 1.0), rng.uniform(0, 2 * math.pi)))


def flow(x, y):
    """Direção (vx, vy) do campo no ponto (em texels)."""
    vx = np.zeros_like(x, dtype=np.float64)
    vy = np.zeros_like(x, dtype=np.float64)
    for kx, ky, a, ph in waves:
        arg = 2 * math.pi * (kx * x + ky * y) / T + ph
        c = np.cos(arg) * a * 2 * math.pi / T
        # psi = a sin(arg): v = (dpsi/dy, -dpsi/dx)
        vx += c * ky
        vy -= c * kx
    # um pouco de tendência na horizontal, como quem pinta deitado na tela
    vx += 0.35 * 2 * math.pi / T
    return vx, vy


H = np.zeros((T, T), np.float32)
G = np.full((T, T), 0.5, np.float32)
B = np.zeros((T, T), np.float32)
cover = np.zeros((T, T), np.float32)


def stroke(cx, cy, length, width, jitter):
    # caminha pela linha do campo nos dois sentidos a partir do centro
    step = 1.5
    n = max(3, int(length / step / 2))
    pts = [(cx, cy)]
    for sgn in (1, -1):
        x, y = cx, cy
        side = []
        for _ in range(n):
            vx, vy = flow(np.array(x), np.array(y))
            d = math.hypot(float(vx), float(vy)) + 1e-9
            x += sgn * step * float(vx) / d
            y += sgn * step * float(vy) / d
            side.append((x, y))
        if sgn == 1:
            pts = pts + side
        else:
            pts = side[::-1] + pts
    P = np.array(pts)
    seg_len = np.hypot(np.diff(P[:, 0]), np.diff(P[:, 1]))
    total = seg_len.sum() + 1e-6
    cum = np.concatenate([[0], np.cumsum(seg_len)]) / total
    hw = width / 2
    x0, x1 = int(P[:, 0].min() - hw - 2), int(P[:, 0].max() + hw + 3)
    y0, y1 = int(P[:, 1].min() - hw - 2), int(P[:, 1].max() + hw + 3)
    ys, xs = np.mgrid[y0:y1, x0:x1]
    px = xs + 0.5
    py = ys + 0.5
    best = np.full(px.shape, 1e9)
    bu = np.zeros(px.shape)
    bv = np.zeros(px.shape)
    ang = np.zeros(px.shape)
    for i in range(len(P) - 1):
        ax, ay = P[i]
        bx, by = P[i + 1]
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy + 1e-9
        t = np.clip(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1)
        qx = ax + t * dx
        qy = ay + t * dy
        dist2 = (px - qx) ** 2 + (py - qy) ** 2
        # lado da linha (sinal) para os sulcos das cerdas
        cross = (dx * (py - ay) - dy * (px - ax)) / math.sqrt(l2)
        m = dist2 < best
        best = np.where(m, dist2, best)
        bu = np.where(m, cum[i] + t * (cum[i + 1] - cum[i]), bu)
        bv = np.where(m, cross, bv)
        ang = np.where(m, math.atan2(dy, dx), ang)
    u = bu
    taper = np.clip(1.0 - 0.55 * (2 * u - 1) ** 4, 0.15, 1.0) * (0.75 + 0.25 * (1 - u))
    v = bv / (hw * taper + 1e-6)
    inside = np.clip((1.0 - np.abs(v)) * hw * 0.5, 0, 1) * np.clip(np.minimum(u, 1 - u) * total / 4.0, 0, 1)
    if not inside.any():
        return
    nb = int(rng.integers(5, 9))
    ph = rng.uniform(0, 2 * math.pi)
    # sulcos das cerdas: finos e rasos, quase paralelos à pincelada
    grooves = 0.5 + 0.5 * np.sin(v * nb * math.pi + ph + 0.5 * np.sin(u * 5 + ph))
    body = np.sqrt(np.clip(1 - v * v, 0, 1))
    # a tinta empurrada para as bordas e acumulada no fim da pincelada
    ridge = np.clip((np.abs(v) - 0.72) / 0.28, 0, 1) ** 2 * 0.3
    blob = np.clip((u - 0.82) / 0.18, 0, 1) ** 2 * 0.25
    # tinta mais grossa no começo, mais rala no fim
    load = 1.0 - 0.35 * u
    h = (0.5 + 0.3 * body + ridge + blob) * load + 0.09 * (grooves - 0.5)
    # pontas secas: falhas por cerda no fim da pincelada
    dry = rng.random((nb + 2,))[np.clip(((v * 0.5 + 0.5) * nb).astype(int), 0, nb + 1)]
    inside = inside * np.where((u > 0.78) & (dry < (u - 0.78) * 3.0), 0.0, 1.0)
    a = np.clip(inside, 0, 1).astype(np.float32)
    iy = np.mod(ys, T)
    ix = np.mod(xs, T)
    Hs = H[iy, ix]
    Gs = G[iy, ix]
    Bs = B[iy, ix]
    H[iy, ix] = Hs * (1 - a) + h.astype(np.float32) * a
    G[iy, ix] = np.where(a > 0.5, np.float32(jitter), Gs)
    B[iy, ix] = np.where(a > 0.5, (np.mod(ang, math.pi) / math.pi).astype(np.float32), Bs)
    cover[iy, ix] = np.maximum(cover[iy, ix], a)


# camada de base (pinceladas largas que cobrem tudo) e duas por cima, menores
for size, spacing, lo, hi in [(26, 16.0, 50, 90), (20, 15.0, 40, 75), (15, 17.0, 28, 55)]:
    ys = np.arange(0, T, spacing)
    xs = np.arange(0, T, spacing)
    pts = [(x + rng.uniform(0, spacing), y + rng.uniform(0, spacing)) for y in ys for x in xs]
    order = rng.permutation(len(pts))
    for k in order:
        cx, cy = pts[k]
        stroke(cx, cy, rng.uniform(lo, hi), size * rng.uniform(0.75, 1.2), float(np.clip(0.5 + rng.normal(0, 0.16), 0.05, 0.95)))

print('cobertura', float((cover > 0.5).mean()))
# relevo normalizado (o filtro mede as diferenças)
H = (H - H.min()) / (H.max() - H.min() + 1e-6)
img = np.dstack([H, G, B, np.ones_like(H)])
Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(OUT)
prev = opts.get('preview')
if prev:
    # relevo iluminado de cima à esquerda, em 2x2 para ver a emenda
    gy, gx = np.gradient(H)
    n = np.dstack([-gx * 6, -gy * 6, np.ones_like(H)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    L = np.array([-0.55, -0.75, 1.1])
    L /= np.linalg.norm(L)
    sh = np.clip((n @ L) / L[2], 0, 2)
    col = np.clip(0.5 * sh[..., None] * (0.8 + 0.4 * G[..., None]) * np.array([1.0, 0.85, 0.6]), 0, 1)
    tile = np.tile(col, (2, 2, 1))
    Image.fromarray((tile * 255).astype(np.uint8)).save(f'{prev}/pincel-relevo.png')
    print('prévia', f'{prev}/pincel-relevo.png')

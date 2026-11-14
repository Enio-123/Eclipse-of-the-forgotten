"""Peças dos fundos do ECLIPSE que repetem nas duas direções (os poços: Minas e Fosso), em 3x.

A imagem tem N x N px (3 px por px do mundo) e emenda nas quatro bordas. As contas são feitas nas
unidades do plano (px da pintura antiga em 2x, 1024 de lado: ver poco_plano.py), então as medidas do
desenho antigo valem direto; alturas de relevo são em px da imagem.
"""
import math
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from brush import hexc, mix, sstep
from fundos_fosso import tnoise

K = 1.5
N = 1536
P = 1024.0
TAU = 2 * math.pi


def plane():
    """A malha da imagem nas unidades do plano: (Y, X)."""
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    return (yy + 0.5) / K, (xx + 0.5) / K


def up(f, order=3):
    """Um campo do plano (2x) lido na malha do 3x, emendando nas bordas."""
    h, w = f.shape
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    out = ndi.map_coordinates(f.astype(np.float32), [(yy + 0.5) * (h / N) - 0.5, (xx + 0.5) * (w / N) - 0.5], order=order, mode='grid-wrap')
    return out.astype(np.float32)


def wd(a, period=P):
    """Diferença dando a volta (-period/2..period/2)."""
    return (a + period / 2) % period - period / 2


def aa(d, soft=1.0):
    """Cobertura de uma borda: d é a distância para dentro, em unidades do plano."""
    return np.clip(d * K / soft + 0.5, 0, 1)


def band(v, a, b, soft=1.0):
    """1 entre a e b (unidades do plano), com a borda suave."""
    return aa(v - a, soft) * aa(b - v, soft)


def gblur(a, s):
    if a.ndim == 3:
        return np.stack([ndi.gaussian_filter(a[..., i], s, mode='wrap') for i in range(a.shape[2])], -1)
    return ndi.gaussian_filter(a, s, mode='wrap')


def noise(cell, rng, octaves=2):
    """Ruído suave (0..1) na malha do 3x que emenda nas quatro bordas; cell em px da imagem."""
    return tnoise(N, N, cell, rng, octaves)


def normals(h, k=1.0):
    """Normais da altura (px da imagem), emendando."""
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    nx, ny = -gx * k, -gy * k
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + 1.0)
    return nx * inv, ny * inv, inv


def occlusion(h, scales=((3, 0.5), (9, 0.35)), floor=0.35):
    """Escuro nas frestas: onde a altura está abaixo da média em volta."""
    ao = np.ones_like(h)
    for s, k in scales:
        ao -= np.clip(gblur(h, s) - h, 0, None) * k * 0.5
    return np.clip(ao, floor, 1.0)


def direct(n, d):
    """Luz de direção nas normais, medida de modo que a parede lisa dá 1."""
    nx, ny, nz = n
    d = np.asarray(d, np.float32)
    d = d / np.linalg.norm(d)
    return np.clip(nx * d[0] + ny * d[1] + nz * d[2], 0, None) / d[2]


def point(n, Y, X, x, y, z, radius):
    """Luz de ponto em (x, y) do plano, a z do paredão (unidades do plano), dando a volta: devolve
    quanto ela acende cada ponto (1 = parede lisa bem embaixo da luz), com a queda em radius."""
    nx, ny, nz = n
    dx = -wd(X - x)
    dy = -wd(Y - y)
    d2 = dx * dx + dy * dy
    inv = 1.0 / np.sqrt(d2 + z * z)
    ndl = np.clip(nx * dx * inv + ny * dy * inv + nz * z * inv, 0, None)
    return ndl / (1.0 + d2 / (radius * radius)) ** 1.5


def cells(rng, nx, ny, jitter=0.9, warp=None):
    """Células de Voronoi que emendam, nx por ny no lado: devolve (id, d1, d2 - d1, dx, dy, deitada) na
    malha do 3x, com as distâncias em px da imagem medidas no espaço esticado (célula quadrada de lado
    N / nx), (dx, dy) a posição de cada ponto em relação ao centro da sua célula, em px da imagem, e
    deitada = 0 onde a borda mais perto é em pé, 1 onde é deitada. warp: (wx, wy), em px da imagem, um
    desvio suave (que emenda) para as bordas saírem tortas."""
    gx, gy = N / nx, N / ny
    pts = []
    for j in range(ny):
        for i in range(nx):
            pts.append(((i + 0.5 + rng.uniform(-0.5, 0.5) * jitter) % nx, (j + 0.5 + rng.uniform(-0.5, 0.5) * jitter) % ny))
    pts = np.asarray(pts, np.float64)
    tree = cKDTree(pts, boxsize=(nx, ny))
    yy, xx = np.mgrid[0:N, 0:N]
    qx, qy = xx.ravel() + 0.5, yy.ravel() + 0.5
    if warp is not None:
        qx, qy = qx + warp[0].ravel(), qy + warp[1].ravel()
    q = np.stack([(qx / gx) % nx, (qy / gy) % ny], 1)
    d, idx = tree.query(q, k=2)
    d = d.astype(np.float32) * gx
    i0, i1 = idx[:, 0], idx[:, 1]
    dx = ((q[:, 0] - pts[i0, 0] + nx / 2) % nx - nx / 2) * gx
    dy = ((q[:, 1] - pts[i0, 1] + ny / 2) % ny - ny / 2) * gy
    ex = np.abs((pts[i1, 0] - pts[i0, 0] + nx / 2) % nx - nx / 2)
    ey = np.abs((pts[i1, 1] - pts[i0, 1] + ny / 2) % ny - ny / 2)
    lying = (ey / (ex + ey + 1e-6)).astype(np.float32)
    sh = (N, N)
    return i0.reshape(sh), d[:, 0].reshape(sh), (d[:, 1] - d[:, 0]).reshape(sh), dx.astype(np.float32).reshape(sh), dy.astype(np.float32).reshape(sh), lying.reshape(sh)


def seg(Y, X, x0, y0, x1, y1):
    """Distância até o segmento e a posição ao longo dele (0..1)."""
    vx, vy = x1 - x0, y1 - y0
    L2 = vx * vx + vy * vy
    t = np.clip(((X - x0) * vx + (Y - y0) * vy) / L2, 0, 1)
    return np.hypot(X - x0 - vx * t, Y - y0 - vy * t), t


def hash1(i, seed=0.0):
    """Sorteio fixo (0..1) por número inteiro (vale para vetores)."""
    v = np.sin(np.asarray(i, np.float64) * 12.9898 + seed * 78.233 + 1.3) * 43758.5453
    return (v - np.floor(v)).astype(np.float32)


def periodic(vals, t):
    """Curva suave e fechada pelos valores (um por trecho igual): t em voltas (0..1)."""
    v = np.asarray(vals, np.float64)
    n = len(v)
    u = (np.asarray(t, np.float64) % 1.0) * n
    i = np.floor(u).astype(np.int64)
    f = u - i
    p0, p1, p2, p3 = v[(i - 1) % n], v[i % n], v[(i + 1) % n], v[(i + 2) % n]
    out = 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3)
    return out.astype(np.float32)


def cracks(rng, n=12, length=(160, 520), width=1.6, lean=0.5):
    """Trincas compridas e tortas que cortam os leitos (0..1), emendando nas quatro bordas; medidas em
    px da imagem."""
    from PIL import ImageDraw
    SS = 2
    img = Image.new('L', (N * SS, N * SS), 0)
    d = ImageDraw.Draw(img)

    def draw(pts, fill, w):
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                d.line([((px + ox) * SS, (py + oy) * SS) for px, py in pts], fill=fill, width=max(1, int(round(w * SS))))

    for _ in range(n):
        x, y = rng.uniform(0, N), rng.uniform(0, N)
        ang = math.pi / 2 + rng.uniform(-lean, lean)
        L = rng.uniform(*length)
        pts = [(x, y)]
        t = 0.0
        while t < L:
            st = rng.uniform(7, 22)
            ang += rng.normal(0, 0.4)
            ang = min(max(ang, math.pi * 0.18), math.pi * 0.82)
            x += math.cos(ang) * st
            y += math.sin(ang) * st
            pts.append((x, y))
            t += st
            if rng.random() < 0.1:
                bx, by, ba = x, y, ang + rng.choice([-1, 1]) * rng.uniform(0.5, 1.1)
                bp = [(bx, by)]
                for _k in range(int(rng.integers(2, 6))):
                    bx += math.cos(ba) * rng.uniform(6, 14)
                    by += math.sin(ba) * rng.uniform(6, 14)
                    bp.append((bx, by))
                draw(bp, 150, width * 0.7)
        draw(pts, 255, width)
    return np.asarray(img.resize((N, N), Image.BOX), np.float32) / 255.0


class Tile:
    """Tela que emenda nas duas direções (cor não pré-multiplicada e alfa)."""

    def __init__(self, opaque=False):
        self.col = np.zeros((N, N, 3), np.float32)
        self.a = np.ones((N, N), np.float32) if opaque else np.zeros((N, N), np.float32)

    def wins(self, x0, y0, x1, y1):
        """As janelas da imagem que cobrem a caixa do plano (x0..x1, y0..y1) em cada volta: lista de
        (linhas, colunas, Y, X), com Y e X no plano e contínuos (os da própria peça)."""
        out = []
        for oy in (-P, 0.0, P):
            r0, r1 = max(0, int(math.floor((y0 + oy) * K))), min(N, int(math.ceil((y1 + oy) * K)))
            if r0 >= r1:
                continue
            for ox in (-P, 0.0, P):
                c0, c1 = max(0, int(math.floor((x0 + ox) * K))), min(N, int(math.ceil((x1 + ox) * K)))
                if c0 >= c1:
                    continue
                yy, xx = np.mgrid[r0:r1, c0:c1].astype(np.float32)
                out.append((slice(r0, r1), slice(c0, c1), (yy + 0.5) / K - oy, (xx + 0.5) / K - ox))
        return out

    def over(self, rows, cols, col, a):
        """Pinta (col, a) por cima do que já está na janela."""
        A = self.a[rows, cols]
        C = self.col[rows, cols]
        col = np.broadcast_to(np.asarray(col, np.float32), C.shape)
        out_a = a + A * (1 - a)
        C[:] = (col * a[..., None] + C * (A * (1 - a))[..., None]) / np.maximum(out_a, 1e-5)[..., None]
        A[:] = out_a

    def tint(self, rows, cols, col, k):
        """Puxa a cor do que já está pintado para col (k = 0..1), sem mexer no alfa."""
        C = self.col[rows, cols]
        C[:] = C + (np.asarray(col, np.float32) - C) * k[..., None]

    def add(self, rows, cols, col, k):
        self.col[rows, cols] += np.asarray(col, np.float32) * k[..., None]

    def image(self):
        rgb = np.clip(self.col, 0, 1)
        out = np.concatenate([rgb, np.clip(self.a, 0, 1)[..., None]], -1)
        return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def grain(col, rng, k=0.035):
    g = rng.normal(0, 1, col.shape[:2]).astype(np.float32)
    g = ndi.gaussian_filter(g, 0.7, mode='wrap')
    return col * (1 + g * k)[..., None]

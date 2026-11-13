"""Peças dos fundos do ECLIPSE (3 px da imagem por px do mundo): alvenaria com relevo de verdade.

Os fundos do EXTREME das primeiras áreas são no traço liso (formas chapadas com degradê). Aqui cada
parede vira duas coisas: a cor do material (alb) e a altura dele (h, em px da imagem): blocos com
chanfro, rejunte fundo, lascas, trincas, cada pedra um pouco torta. A luz é calculada em cima dessa
altura (luz fria de cima e da esquerda, tochas quentes que batem de raspão), então a parede ganha
volume e a mesma tocha acende a face de uma pedra e deixa a de baixo na sombra.

Tudo dá a volta na horizontal em TW (as camadas repetem no jogo).
"""
import math
import numpy as np
from scipy import ndimage as ndi
from brush import hexc, mix, sstep, blur, value_noise

S = 3
TAU = 2 * math.pi


def grid(W, H, x0=0, y0=0):
    yy, xx = np.mgrid[y0:y0 + H, x0:x0 + W].astype(np.float32)
    return yy + 0.5, xx + 0.5


def pnoise(H, TW, cell, rng, octaves=2, sx=1.0):
    """Ruído suave (0..1) que emenda nas bordas da largura TW; sx estica na horizontal."""
    pad = int(min(TW // 4, cell * sx * 2 + 16))
    w = int(math.ceil((TW + pad) / sx)) + 2
    n = value_noise(H, w, cell, rng, octaves)
    if sx != 1.0:
        n = ndi.zoom(n, (1, sx), order=1)
    n = n[:, :TW + pad]
    t = np.linspace(0, 1, pad, dtype=np.float32)[None, :]
    out = n[:, :TW].copy()
    out[:, :pad] = n[:, TW:TW + pad] * (1 - t) + n[:, :pad] * t
    return out


def wdx(xx, x, TW):
    """Distância horizontal até x dando a volta em TW (-TW/2..TW/2)."""
    return (xx - x + TW / 2) % TW - TW / 2


def wblur(a, sigma):
    """Borrão que dá a volta na horizontal."""
    if a.ndim == 3:
        return np.stack([ndi.gaussian_filter(a[..., i], sigma, mode=('nearest', 'wrap')) for i in range(a.shape[2])], -1)
    return ndi.gaussian_filter(a, sigma, mode=('nearest', 'wrap'))


class Blocks:
    """Fiadas de blocos (pedra ou tijolo) que emendam em TW.

    course: altura da fiada; blen: comprimento médio; vary: quanto o comprimento muda de um bloco para o
    outro (0 = todos iguais); stagger: desencontro das juntas em pé entre uma fiada e a seguinte.
    Guarda, por pixel: key (um número por bloco), u e v (0..1 dentro do bloco), du e dv (px até a junta em
    pé e a deitada) e r(i) (um sorteio por bloco, 0..1).
    """

    def __init__(self, yy, xx, TW, course, blen, rng, vary=0.3, stagger=0.5, y0=0.0):
        row = np.floor((yy - y0) / course).astype(np.int64)
        rmin = int(row.min())
        nrow = int(row.max()) - rmin + 2
        ri = row - rmin
        n = max(1, int(round(TW / blen)))
        bl = TW / n
        offs = ((np.arange(nrow) + rmin) % 2) * bl * stagger + rng.uniform(-0.12, 0.12, nrow) * bl
        xw = xx + offs[ri]
        if vary > 0:
            for k, amp in ((max(1, n // 3), 0.5), (max(2, n // 2 + 1), 0.3)):
                a = vary * amp * TW / (TAU * k)
                ph = rng.uniform(0, TAU, nrow)
                xw = xw + a * np.sin(TAU * k * xx / TW + ph[ri])
        t = (xw % TW) / bl
        col = np.floor(t).astype(np.int64) % n
        self.u = (t - np.floor(t)).astype(np.float32)
        self.v = (((yy - y0) / course) - row).astype(np.float32)
        self.du = np.minimum(self.u, 1 - self.u) * bl
        self.dv = np.minimum(self.v, 1 - self.v) * course
        self.d = np.minimum(self.du, self.dv)
        self.key = ((ri * 7919 + col * 104729 + int(rng.integers(0, 1 << 20))) % 8192).astype(np.int64)
        self.rand = rng.random((6, 8192)).astype(np.float32)
        self.course, self.bl = course, bl

    def r(self, i):
        return self.rand[i][self.key]

    def face(self, mortar=1.2, bevel=2.2):
        """0 no rejunte, 1 na face do bloco (o chanfro entre os dois)."""
        return sstep(mortar * 0.5, mortar * 0.5 + bevel, self.d)

    def height(self, depth=2.0, jut=0.8, tilt=0.9, mortar=1.2, bevel=2.2, round_=0.0):
        """Altura do bloco: chanfro até a face, cada bloco um pouco para fora ou para dentro e torto."""
        f = self.face(mortar, bevel)
        h = f * depth
        h += f * (self.r(0) - 0.5) * 2 * jut
        h += f * ((self.u - 0.5) * (self.r(1) - 0.5) + (self.v - 0.5) * (self.r(2) - 0.5)) * 4 * tilt
        if round_ > 0:
            # almofada: a face abaulada (pedra de cantaria rústica)
            h += f * round_ * (1 - (2 * self.u - 1) ** 2) * (1 - (2 * self.v - 1) ** 2)
        return h


class Ring:
    """Aduelas em volta de um arco redondo (centro cx, nascendo em spring, raio interno r, espessura t):
    as pedras deitadas ao longo do arco e, abaixo da nascente, as ombreiras em fiadas. d = distância para
    fora do vão (0 na beira); m = máscara da moldura (0..1)."""

    def __init__(self, yy, xx, cx, spring, r, t, bottom, stones=9, jamb=30.0, key=0):
        dx = xx - cx
        dy = yy - spring
        up = dy < 0
        rad = np.hypot(dx, dy)
        self.d = np.where(up, rad - r, np.abs(dx) - r)
        self.m = (np.clip(self.d + 0.5, 0, 1) * np.clip(t - self.d + 0.5, 0, 1) * (yy < bottom)).astype(np.float32)
        th = np.arctan2(-dy, dx)  # 0 à direita, pi à esquerda, por cima
        ta = np.clip(th / math.pi, 0, 1) * stones
        ia = np.floor(ta)
        fa = ta - ia
        arc = math.pi * (r + t * 0.5) / stones
        dj_arc = np.minimum(fa, 1 - fa) * arc
        tj = dy / jamb
        ij = np.floor(tj)
        fj = tj - ij
        dj_jamb = np.minimum(fj, 1 - fj) * jamb
        dj = np.where(up, dj_arc, dj_jamb)
        de = np.minimum(self.d, t - self.d)
        self.dist = np.minimum(dj, de)
        side = (dx > 0).astype(np.int64)
        self.key = (np.where(up, ia, 40 + ij * 2 + side).astype(np.int64) * 131 + key * 977) % 8192
        self.keystone = (up & (np.abs(ta - stones / 2) < 0.5)).astype(np.float32) * self.m


def normals(h, k=1.0, wrap=True):
    """Normais da altura (px): k aumenta o relevo."""
    gy = np.gradient(h, axis=0)
    if wrap:
        gx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    else:
        gx = np.gradient(h, axis=1)
    nx, ny = -gx * k, -gy * k
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + 1.0)
    return nx * inv, ny * inv, inv


def ambient_occlusion(h, scales=((3, 0.5), (9, 0.35)), wrap=True, floor=0.35):
    """Escuro nas frestas: onde a altura está abaixo da média em volta."""
    ao = np.ones_like(h)
    for s, k in scales:
        b = wblur(h, s) if wrap else blur(h, s)
        ao -= np.clip(b - h, 0, None) * k * 0.5
    return np.clip(ao, floor, 1.0)


class Light:
    """Luz de ponto (tocha, vela, janela): em (x, y) e a z px da parede; raio onde cai pela metade."""

    def __init__(self, x, y, z, radius, color, power=1.0):
        self.x, self.y, self.z, self.radius, self.color, self.power = x, y, z, radius, np.asarray(color, np.float32), power


def shade(alb, h, yy, xx, TW, ambient, sun=None, lights=(), k=1.0, spec=0.0, gloss=18.0, ao=True, wrap=True, wet=None):
    """Cor final: alb x (luz de fundo + luz de direção + tochas), com o relevo de h.

    ambient: cor da luz de fundo; sun: (direção (x, y, z), cor); spec: brilho molhado (wet: máscara 0..1
    de onde a pedra está molhada, senão em tudo)."""
    nx, ny, nz = normals(h, k, wrap)
    occ = ambient_occlusion(h, wrap=wrap) if ao else 1.0
    light = np.zeros(alb.shape, np.float32) + np.asarray(ambient, np.float32) * (occ[..., None] if ao else 1.0)
    shine = np.zeros(alb.shape, np.float32)
    if sun is not None:
        d, c = sun
        d = np.asarray(d, np.float32)
        d = d / np.linalg.norm(d)
        ndl = np.clip(nx * d[0] + ny * d[1] + nz * d[2], 0, 1)
        light += ndl[..., None] * np.asarray(c, np.float32) * (0.6 + 0.4 * occ[..., None] if ao else 1.0)
    for L in lights:
        dx = -wdx(xx, L.x, TW) if wrap else L.x - xx
        dy = L.y - yy
        dist2 = dx * dx + dy * dy
        inv = 1.0 / np.sqrt(dist2 + L.z * L.z)
        lx, ly, lz = dx * inv, dy * inv, L.z * inv
        fall = L.power / (1.0 + dist2 / (L.radius * L.radius)) ** 1.5
        ndl = np.clip(nx * lx + ny * ly + nz * lz, 0, 1)
        light += (ndl * fall)[..., None] * L.color
        if spec > 0:
            # meio caminho entre a luz e quem olha (de frente)
            hx, hy, hz = lx, ly, lz + 1.0
            hi = 1.0 / np.sqrt(hx * hx + hy * hy + hz * hz)
            ndh = np.clip((nx * hx + ny * hy + nz * hz) * hi, 0, 1)
            sp = ndh ** gloss * fall * spec
            if wet is not None:
                sp = sp * wet
            shine += sp[..., None] * L.color
    return alb * light + shine


def streaks(H, TW, rng, length=160.0, width=7.0, density=0.5):
    """Escorridos de umidade: riscos em pé, largos e irregulares (0..1), que emendam em TW."""
    n = pnoise(H, TW, width, rng, 2, sx=1.0)
    col = pnoise(1, TW, width * 0.9, rng, 2)[0]
    tall = pnoise(max(2, int(H / length) + 2), TW, 3, rng, 1)
    tall = ndi.zoom(tall, (H / tall.shape[0], 1), order=1)[:H]
    s = sstep(1 - density, 1.0, col[None, :] * 0.65 + tall * 0.35) * (0.6 + 0.4 * n)
    return s.astype(np.float32)


def cracks(H, TW, rng, n=10, length=(60, 220), width=1.1):
    """Trincas finas: caminhos tortos que descem; devolve 0..1."""
    from PIL import Image, ImageDraw
    SS = 2
    img = Image.new('L', (TW * SS, H * SS), 0)
    d = ImageDraw.Draw(img)
    for _ in range(n):
        x, y = rng.uniform(0, TW), rng.uniform(0, H)
        ang = rng.uniform(math.pi * 0.25, math.pi * 0.75)
        L = rng.uniform(*length)
        pts = [(x, y)]
        t = 0.0
        while t < L:
            st = rng.uniform(5, 14)
            ang += rng.normal(0, 0.45)
            ang = min(max(ang, math.pi * 0.1), math.pi * 0.9)
            x += math.cos(ang) * st
            y += math.sin(ang) * st
            pts.append((x, y))
            t += st
            if rng.random() < 0.12:
                # galho curto
                bx, by, ba = x, y, ang + rng.choice([-1, 1]) * rng.uniform(0.5, 1.0)
                bp = [(bx, by)]
                for _k in range(int(rng.integers(2, 5))):
                    bx += math.cos(ba) * rng.uniform(4, 10)
                    by += math.sin(ba) * rng.uniform(4, 10)
                    bp.append((bx, by))
                for off in (-TW, 0, TW):
                    d.line([((px + off) * SS, py * SS) for px, py in bp], fill=170, width=max(1, int(width * SS * 0.7)))
        for off in (-TW, 0, TW):
            d.line([((px + off) * SS, py * SS) for px, py in pts], fill=255, width=max(1, int(width * SS)))
    return np.asarray(img.resize((TW, H), Image.BOX), np.float32) / 255.0


def grain(col, rng, k=0.035):
    """Grão fino de pintura (não deixa as áreas lisas chapadas)."""
    H, W = col.shape[:2]
    g = rng.normal(0, 1, (H, W)).astype(np.float32)
    g = ndi.gaussian_filter(g, 0.7)
    return col * (1 + g * k)[..., None]


def cyl(u):
    """Altura de um meio cilindro em u (-1..1 através da largura)."""
    return np.sqrt(np.clip(1 - u * u, 0, 1))


def put(dst_col, dst_a, col, a):
    """Compõe (col, a) por cima de (dst_col, dst_a), no lugar (cores não pré-multiplicadas)."""
    a3 = a[..., None]
    out_a = a + dst_a * (1 - a)
    dst_col[:] = (col * a3 + dst_col * (dst_a * (1 - a))[..., None]) / np.maximum(out_a, 1e-5)[..., None]
    dst_a[:] = out_a

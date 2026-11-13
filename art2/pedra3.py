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


class ArchRow:
    """Arcos redondos em fila: o anel de aduelas em volta de cada vão. dxa = distância até o meio do vão
    mais perto; cell = o número do vão (para cada arco ter as suas pedras); raio interno r, espessura t,
    `stones` pedras por volta e `lanes` voltas (tijolo em pé: 2).
    rd: px para fora do intradorso; m: máscara do anel; f: 0 na junta, 1 na face; dj: px até a junta
    entre duas aduelas; key: um número por pedra; th: 0..1 ao longo do arco; keystone: a pedra de fecho."""

    def __init__(self, yy, dxa, cell, spring, r, t, stones, lanes=1, mortar=1.2, bevel=2.0):
        dy = yy - spring
        up = dy < 0
        rad = np.hypot(dxa, dy)
        self.rd = rd = rad - r
        self.m = (np.clip(rd + 0.5, 0, 1) * np.clip(t - rd + 0.5, 0, 1) * up).astype(np.float32)
        self.th = th = np.clip(np.arctan2(-dy, dxa) / math.pi, 0, 1)
        lt = t / lanes
        lane = np.clip(np.floor(rd / lt), 0, lanes - 1)
        ta = th * stones + (lane % 2) * 0.5
        ia = np.floor(ta)
        fa = ta - ia
        arc = math.pi * (r + t * 0.5) / stones
        self.dj = np.minimum(fa, 1 - fa) * arc
        # a beira de dentro (o intradorso) não tem junta: é a quina do vão
        d_in = np.where(lane == 0, 99.0, rd - lane * lt)
        d_out = (lane + 1) * lt - rd
        self.dist = np.minimum(self.dj, np.maximum(np.minimum(d_in, d_out), 0))
        self.f = sstep(mortar * 0.5, mortar * 0.5 + bevel, self.dist)
        self.key = (ia.astype(np.int64) * 131 + lane.astype(np.int64) * 977 + cell.astype(np.int64) * 3571) % 8192
        if stones % 2:
            self.keystone = ((ia == stones // 2) & up).astype(np.float32) * self.m
        else:
            self.keystone = np.zeros_like(self.m)


def knobs(yy, xx, TW, pitch, rowh, rng, rmin=0.6, rmax=1.0, y0=0.0, jitter=0.16):
    """Pontas de osso empilhadas (ou seixos): calotas em fiadas desencontradas que emendam em TW.
    Devolve (h 0..1 de cada calota, key por calota, sorteios [5, 8192])."""
    n = max(1, int(round(TW / pitch)))
    p = TW / n
    row = np.floor((yy - y0) / rowh).astype(np.int64)
    xo = xx + (row % 2) * p * 0.5
    ci = np.floor(xo / p)
    key = ((row - int(row.min())) * 7919 + (ci.astype(np.int64) % n) * 104729 + int(rng.integers(0, 1 << 20))) % 8192
    rnd = rng.random((5, 8192)).astype(np.float32)
    cx = (ci + 0.5 + (rnd[0][key] - 0.5) * jitter) * p
    cy = (row + 0.5 + (rnd[1][key] - 0.5) * jitter) * rowh + y0
    R = (rmin + (rmax - rmin) * rnd[2][key]) * min(p, rowh) * 0.5
    d = np.hypot(xo - cx, yy - cy) / R
    return np.sqrt(np.clip(1 - d * d, 0, 1)).astype(np.float32), key, rnd


def skull(size, s=1.0, ang=0.0, jaw=True):
    """Um crânio visto de frente numa janela size x size (o meio da janela é o meio do rosto).
    Devolve (h em px, tom 0..1 que multiplica a cor do osso, a): a abóbada redonda, as órbitas e o nariz
    fundos, os dentes."""
    c = size / 2
    yy, xx = grid(size, size)
    u0, v0 = (xx - c) / s, (yy - c) / s
    ca, sa = math.cos(ang), math.sin(ang)
    u = u0 * ca + v0 * sa
    v = -u0 * sa + v0 * ca
    e = (u / 8.4) ** 2 + ((v + 1.8) / 8.8) ** 2
    dome = np.sqrt(np.clip(1 - e, 0, 1))
    a_dome = np.clip((1 - e) * 5.0, 0, 1)
    jb = 11.4 if jaw else 8.4
    wj = 5.7 - np.clip(v - 4.5, 0, 8) * 0.34
    fj = np.clip((wj - np.abs(u)) * s + 0.5, 0, 1) * np.clip((v - 1.0) * s, 0, 1) * np.clip((jb - v) * s + 0.5, 0, 1)
    hj = 4.4 * np.sqrt(np.clip(1 - (u / (wj + 0.8)) ** 2, 0, 1))
    a = np.maximum(a_dome, fj)
    h = np.maximum(dome * 7.6, hj * fj)
    tone = np.ones_like(h)
    # as maçãs do rosto saltam um pouco e a têmpora afunda
    h += np.exp(-((np.abs(u) - 5.2) / 1.6) ** 2 - ((v - 3.4) / 1.6) ** 2) * 1.2 * a
    pit = np.zeros_like(h)
    for sx in (-1, 1):
        eo = ((u - sx * 3.5) / 2.7) ** 2 + ((v - 1.3 - np.abs(u - sx * 3.5) * 0.12) / 2.5) ** 2
        pit = np.maximum(pit, np.clip((1 - eo) * 2.6, 0, 1))
    # o nariz: um coração de ponta para cima
    nn = np.clip(1.0 - (np.abs(u) * 0.95 + np.clip(4.2 - v, 0, 9) * 0.9 + np.clip(v - 6.2, 0, 9) * 2.0) * 0.8, 0, 1) * (v > 3.2) * (v < 6.8)
    pit = np.maximum(pit, np.clip(nn * 2.4, 0, 1))
    h -= pit * 6.0
    tone *= 1 - 0.93 * pit
    # os dentes: uma faixa mais clara com riscos, e o escuro entre a arcada de cima e a de baixo
    tb = np.clip(1 - np.abs(v - 8.3) / 1.2, 0, 1) * (np.abs(u) < wj - 0.4)
    gap = (np.abs(((u + 0.85) % 1.7) - 0.85) < 0.36) * tb
    tone *= 1 - 0.6 * gap
    if jaw:
        bite = np.clip(1 - np.abs(v - 9.3) / 0.55, 0, 1) * (np.abs(u) < wj - 0.2)
        tone *= 1 - 0.75 * bite
        h -= bite * 1.6
    # mais escuro para baixo e nas beiras (osso velho)
    tone *= 0.82 + 0.18 * np.clip(dome * 1.4, 0, 1)
    return (h * s).astype(np.float32), tone.astype(np.float32), a.astype(np.float32)


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


def shade(alb, h, yy, xx, TW, ambient, sun=None, lights=(), k=1.0, spec=0.0, gloss=18.0, ao=True, wrap=True, wet=None, sun_k=None, sun2=None):
    """Cor final: alb x (luz de fundo + luz de direção + tochas), com o relevo de h.

    ambient: cor da luz de fundo; sun: (direção (x, y, z), cor); spec: brilho molhado (wet: máscara 0..1
    de onde a pedra está molhada, senão em tudo); sun_k: quanto da luz de direção chega em cada ponto
    (0 = na sombra de alguma coisa); sun2: (direção, cor, de_raspão) uma segunda luz de direção; de raspão,
    ela só pega o que está virado para ela (a parede lisa não recebe nada: contraluz)."""
    nx, ny, nz = normals(h, k, wrap)
    occ = ambient_occlusion(h, wrap=wrap) if ao else 1.0
    light = np.zeros(alb.shape, np.float32) + np.asarray(ambient, np.float32) * (occ[..., None] if ao else 1.0)
    shine = np.zeros(alb.shape, np.float32)
    if sun is not None:
        d, c = sun
        d = np.asarray(d, np.float32)
        d = d / np.linalg.norm(d)
        ndl = np.clip(nx * d[0] + ny * d[1] + nz * d[2], 0, 1)
        if sun_k is not None:
            ndl = ndl * sun_k
        light += ndl[..., None] * np.asarray(c, np.float32) * (0.6 + 0.4 * occ[..., None] if ao else 1.0)
    if sun2 is not None:
        d, c, graze = sun2
        d = np.asarray(d, np.float32)
        d = d / np.linalg.norm(d)
        ndl = nx * d[0] + ny * d[1] + nz * d[2] - (d[2] if graze else 0.0)
        light += np.clip(ndl, 0, 1)[..., None] * np.asarray(c, np.float32)
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

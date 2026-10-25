"""Fundos da Cidade-Catedral no traço liso: nada de redução para pixels. O jogo mostra estas
imagens com filtro suave, 2 pixels da imagem por pixel do mundo (hd.json), atrás do terreno em
pixel art: o cenário misturado.

Camadas (tamanho no mundo; as imagens têm o dobro):
  city-sky  640x360   céu do eclipse sobre a cidade, preso na tela
  city-far  1024x400  a cidade alta ao longe e as torres da catedral (repete)
  city-mid  1024x420  casas mais perto: empenas, enxaimel, chaminés, janelas acesas, varais (repete)
  nave-far  1024x400  a parede do fundo da nave: arcadas, trifório e vitrais altos (repete)
  nave-mid  1024x420  pilares, estandartes e lustres de velas (repete)
  claustro-mid 1024x420  a arcada do claustro do outro lado do jardim (no lugar de city-mid)

As camadas que repetem são desenhadas dando a volta na horizontal (o que passa da borda direita
aparece na esquerda), então emendam sem costura.

uso: python3 fundos_cidade.py <pasta_saida> [camada ...] [--preview=<pasta>]
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from brush import Layer, hexc, mix, sstep, blur, value_noise
from shapes import Mask

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else 'hd'
ONLY = set(ARGS[1:])
PREVIEW = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
T0 = time.time()

# a noite do eclipse (as mesmas cores da ponte)
INK = hexc(0x05070c)
SL0, SL1, SL2, SL3, SL4 = hexc(0x0b1020), hexc(0x141b2e), hexc(0x212a42), hexc(0x323d58), hexc(0x4d5a78)
FOG0, FOG1, FOG2 = hexc(0x2b3550), hexc(0x46526f), hexc(0x66729a)
GOLD0, GOLD1, GOLD2, GOLD3 = hexc(0x6e3c1a), hexc(0xb4702e), hexc(0xe7ad55), hexc(0xfff0c8)
WIN0, WIN1, WIN2 = hexc(0xc8652a), hexc(0xffb860), hexc(0xffe4a8)
COLD = hexc(0x9fb0d4)
GLASS = [hexc(0x2a4e9a), hexc(0x9c2a2c), hexc(0xc99a3a), hexc(0x2f7a4a), hexc(0x5a3a8a), hexc(0x3a64b0)]
EX, EY, ER = 930.0, 150.0, 40.0   # o sol em eclipse no céu da cidade (pixels da imagem)


def want(name):
    return not ONLY or name in ONLY


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


def edge(m, dx, dy):
    """Faixa da forma cuja vizinha a (dx, dy) pixels está fora: a borda virada para esse lado."""
    sh = np.roll(np.roll(m, -dy, axis=0), -dx, axis=1)
    return np.clip(m - sh, 0, 1)


def rim(m, dx, dy, width):
    """Luz de borda que entra `width` pixels na forma, vinda da direção (dx, dy)."""
    out = np.zeros_like(m)
    n = max(1, int(width))
    for k in range(1, n + 1):
        out = np.maximum(out, edge(m, int(round(dx * k)), int(round(dy * k))) * (1 - (k - 1) / n))
    return blur(out, 0.7)


class Wrap:
    """Camada que dá a volta na horizontal: o que passa da borda direita aparece na esquerda."""

    def __init__(self, TW, H):
        self.TW, self.H = TW, H
        self.L = Layer(TW, H)

    def put(self, x0, y0, col, a):
        """Pinta a cor `col` (3 ou HxWx3 local) com o alfa local `a`, a partir de (x0, y0)."""
        h, w = a.shape
        y0 = int(y0)
        if y0 < 0:
            a, col = a[-y0:], (col[-y0:] if np.ndim(col) == 3 else col)
            h += y0
            y0 = 0
        h = min(h, self.H - y0)
        if h <= 0:
            return
        a = a[:h]
        if np.ndim(col) == 3:
            col = col[:h]
        cols = np.arange(int(x0), int(x0) + w) % self.TW
        P = self.L.P[y0:y0 + h][:, cols]
        A = self.L.A[y0:y0 + h][:, cols]
        a3 = a[..., None]
        P = P * (1 - a3) + np.broadcast_to(col, P.shape) * a3
        A = A * (1 - a) + a
        self.L.P[y0:y0 + h, cols] = P
        self.L.A[y0:y0 + h, cols] = A

    def put_layer(self, x0, y0, L):
        """Compõe uma camada local (pré-multiplicada) por cima, a partir de (x0, y0)."""
        h, w = L.A.shape
        y0 = int(y0)
        ys = slice(max(0, -y0), min(h, self.H - y0))
        if ys.start >= ys.stop:
            return
        Pl, Al = L.P[ys], L.A[ys]
        yd = max(0, y0)
        hh = Al.shape[0]
        cols = np.arange(int(x0), int(x0) + w) % self.TW
        P = self.L.P[yd:yd + hh][:, cols]
        A = self.L.A[yd:yd + hh][:, cols]
        P = P * (1 - Al[..., None]) + Pl
        A = Al + A * (1 - Al)
        self.L.P[yd:yd + hh, cols] = P
        self.L.A[yd:yd + hh, cols] = A


def local_mask(w, h, draw):
    m = Mask(w, h)
    draw(m)
    return m.array()


def lancet(xx, yy, cx, w, apex, bottom, k=0.75):
    """Alfa suave de um vão gótico (arco quebrado) de largura w, do ápice até `bottom`."""
    r = k * w
    off = r - w / 2
    hgt = math.sqrt(max(r * r - off * off, 1.0))
    spring = apex + hgt
    d1 = np.hypot(xx - (cx - off), yy - spring) - r
    d2 = np.hypot(xx - (cx + off), yy - spring) - r
    arch = np.maximum(np.maximum(d1, d2), yy - spring - 0.5)
    body = np.maximum(np.abs(xx - cx) - w / 2, np.maximum(spring - yy, yy - bottom))
    d = np.minimum(arch, body)
    return np.clip(0.5 - d, 0, 1), spring


def soft_glow(L, x, y, r, col, a):
    """Halo de luz no ar (alfa baixo): o fundo de trás aparece esquentado."""
    L.dab(x, y, r, col, a, r * 0.9)


# ======================================================================================
# Cidade: céu
# ======================================================================================
def city_sky(rng):
    W, H = 1280, 720
    yy, xx = grid(W, H)
    t = yy / H
    sky = mix(SL0, SL1, sstep(0.0, 0.45, t)[..., None])
    sky = mix(sky, SL2, sstep(0.35, 0.95, t)[..., None])
    sky = mix(sky, hexc(0x3a3a58), (sstep(0.6, 1.0, t) * 0.55)[..., None])
    d_e = np.hypot(xx - EX, yy - EY)
    sky = mix(sky, mix(GOLD0, SL2, 0.4), (np.exp(-(d_e / 400) ** 2) * 0.6)[..., None])
    sky = mix(sky, GOLD1, (np.exp(-(d_e / 140) ** 2) * 0.55)[..., None])
    # nuvens compridas e finas (estratos), mais no meio do céu
    n1 = pnoise(H, W, 36, rng, 4, sx=5.0)
    n2 = pnoise(H, W, 14, rng, 3, sx=3.0)
    c = n1 * 0.72 + n2 * 0.28
    band = sstep(0.08, 0.3, t) * sstep(1.0, 0.72, t)
    cloud = sstep(0.5, 0.68, c) * band
    near = np.exp(-(d_e / 430) ** 2)
    body = mix(sky * 0.72 + SL3 * 0.12, GOLD1 * 0.75 + GOLD0 * 0.2, (np.exp(-(d_e / 220) ** 2) * 0.7)[..., None])
    sky = mix(sky, body, (cloud * 0.85)[..., None])
    top = blur(np.clip(cloud - np.roll(cloud, 5, axis=0), 0, 1), 1.2)
    rim_col = mix(COLD * 0.75, GOLD2, near[..., None])
    sky = mix(sky, rim_col, np.clip(top * (0.25 + 0.75 * near) * 1.4, 0, 0.8)[..., None])
    sky = blur(sky, 1.0)
    L = Layer.from_rgb(sky)
    # estrelas onde não há nuvem
    for _ in range(170):
        x, y = rng.uniform(0, W), rng.uniform(0, H * 0.55) ** 1.0
        ix, iy = int(x), int(y)
        if cloud[iy, ix] > 0.25 or d_e[iy, ix] < 260:
            continue
        b = rng.random() ** 2.2
        L.dab(x, y, 0.6 + b * 0.9, mix(COLD, hexc(0xffffff), b), 0.35 + 0.6 * b, 0.6)
        if b > 0.55:
            L.dab(x, y, 4 + b * 4, COLD, 0.06, 4)
    # coroa do eclipse: raios finos, o anel claro e o disco escuro
    for _ in range(260):
        a = rng.uniform(0, 2 * math.pi)
        r0 = ER + rng.uniform(2, 9)
        ln = rng.uniform(16, 95) * (0.4 + rng.random())
        cx, cy = EX + math.cos(a) * (r0 + ln / 2), EY + math.sin(a) * (r0 + ln / 2)
        L.stroke(cx, cy, a, ln, rng.uniform(1.6, 4.2), mix(GOLD1, GOLD3, rng.random() ** 2), rng.uniform(0.12, 0.4), rng, 0.4, 0.5, taper=0.8)
    soft_glow(L, EX, EY, ER * 2.2, GOLD2, 0.18)
    d = np.hypot(xx - EX, yy - EY)
    L.fill(GOLD3, sstep(ER + 5, ER + 1.5, d) * sstep(ER - 1, ER + 1.2, d) * 0.95)
    L.fill(hexc(0x06070b), sstep(ER + 0.8, ER - 0.8, d))
    # uma nuvem fina passa na frente da coroa
    wisp = sstep(0.56, 0.7, pnoise(H, W, 10, rng, 3, sx=6.0)) * np.exp(-((yy - EY - 18) / 14) ** 2) * np.exp(-((xx - EX) / 190) ** 2)
    L.fill(mix(GOLD0, SL1, 0.5), wisp * 0.7)
    return L


# ======================================================================================
# Cidade: a cidade alta ao longe
# ======================================================================================
def skyline(W, H, rng, base, wr, hr, kinds, gap=(-6, 8)):
    """Prédios ao longe: lista de (x, largura, altura, tipo) até cobrir a largura W."""
    out = []
    x = rng.uniform(0, 20)
    while x < W:
        k = rng.choice(len(kinds[0]), p=kinds[1])
        kind = kinds[0][k]
        w = rng.uniform(*wr) * (0.55 if kind == 'tower' else 1.0)
        h = rng.uniform(*hr) * (1.5 if kind == 'tower' else 1.0)
        out.append((x, w, h, kind))
        x += w + rng.uniform(*gap)
    return out


def far_building(m, x, w, base, h, kind, rng, H):
    top = base - h
    m.rect(x, top, x + w, H)
    if kind == 'gable':
        rh = w * rng.uniform(0.35, 0.7)
        m.poly([(x - 2, top + 1), (x + w / 2, top - rh), (x + w + 2, top + 1)])
    elif kind == 'side':
        rh = rng.uniform(14, 30)
        m.poly([(x - 3, top + 1), (x + 6, top - rh), (x + w - 6, top - rh), (x + w + 3, top + 1)])
        if rng.random() < 0.6:
            cx = x + w * rng.uniform(0.2, 0.8)
            m.rect(cx - 3, top - rh - rng.uniform(8, 18), cx + 3, top - rh + 2)
    elif kind == 'tower':
        sh = w * rng.uniform(1.4, 2.6)
        m.poly([(x - 2, top + 1), (x + w / 2, top - sh), (x + w + 2, top + 1)])
        m.line([(x + w / 2, top - sh), (x + w / 2, top - sh - 10)], 1.2)
    elif kind == 'flat':
        n = max(2, int(w // 10))
        for i in range(n):
            if i % 2 == 0:
                x0 = x + i * w / n
                m.rect(x0, top - 7, x0 + w / n, top + 1)
    elif kind == 'dome':
        m.ellipse(x + w / 2, top, w * 0.42, w * 0.36)
        m.line([(x + w / 2, top - w * 0.36), (x + w / 2, top - w * 0.36 - 14)], 1.4)


def cathedral(m, cx, base, H):
    """A catedral vista de frente: duas torres com contrafortes, pináculos e agulhas, a empena com a
    rosácea, as naves laterais mais baixas e, atrás, a agulha do cruzeiro. Devolve o centro e o
    raio da rosácea."""
    m.rect(cx - 13, 228, cx + 13, 330)
    m.poly([(cx - 16, 230), (cx, 44), (cx + 16, 230)])
    m.line([(cx, 44), (cx, 24)], 1.6)
    for side in (-1, 1):
        xa, xb = sorted((cx + side * 122, cx + side * 196))
        m.rect(xa, 432, xb, H)
        m.poly([(xa - 2, 434), ((xa + xb) / 2, 398), (xb + 2, 434)])
        px = cx + side * 190
        m.rect(px - 7, 384, px + 7, H)
        m.poly([(px - 8, 386), (px, 342), (px + 8, 386)])
    tw = 66
    for side in (-1, 1):
        x0 = cx + side * 90 - tw / 2
        m.rect(x0, 250, x0 + tw, H)
        for bx in (x0 - 8, x0 + tw):
            m.rect(bx, 322, bx + 8, H)
            m.poly([(bx - 1, 324), (bx + 4, 300), (bx + 9, 324)])
        m.rect(x0 - 4, 244, x0 + tw + 4, 254)
        for px in (x0 - 2, x0 + tw - 6):
            m.poly([(px, 246), (px + 4, 206), (px + 8, 246)])
        m.poly([(x0 + 6, 248), (x0 + tw / 2, 92), (x0 + tw - 6, 248)])
        m.line([(x0 + tw / 2, 92), (x0 + tw / 2, 66)], 2.0)
        m.line([(x0 + tw / 2 - 7, 76), (x0 + tw / 2 + 7, 76)], 1.6)
        # botões de pedra subindo pelas arestas da agulha
        for k in range(1, 6):
            t = k / 6
            yk = 248 - (248 - 92) * t
            half = (tw / 2 - 6) * (1 - t)
            for sgn in (-1, 1):
                m.ellipse(x0 + tw / 2 + sgn * (half + 1.5), yk, 2.6, 2.0)
    m.rect(cx - 58, 360, cx + 58, H)
    m.poly([(cx - 62, 362), (cx, 296), (cx + 62, 362)])
    m.poly([(cx - 3, 300), (cx, 282), (cx + 3, 300)])
    return (cx, 420), 30


def city_far(rng):
    TW, H = 2048, 800
    yy, xx = grid(TW, H)
    W = Wrap(TW, H)
    lights = []
    # faixa A: a mais longe, quase da cor da névoa
    mA = Mask(TW + 400, H)
    for (x, w, h, kind) in skyline(TW, H, rng, 650, (34, 96), (50, 140), (['gable', 'side', 'tower', 'flat', 'dome'], [0.34, 0.3, 0.14, 0.14, 0.08])):
        far_building(mA, x + 200, w, 650, h, kind, rng, H)
        for _ in range(int(w * h / 1500)):
            if rng.random() < 0.5:
                lights.append(('A', x + rng.uniform(3, w - 3), 650 - rng.uniform(8, h - 6)))
    mAw = wrap_fix(mA, TW)
    colA = mix(hexc(0x2c3352), hexc(0x39425f), sstep(420, 660, yy)[..., None])
    colA = mix(colA, GOLD1 * 0.6 + colA * 0.5, (rim(mAw, 1, 0, 3) * 0.35)[..., None])
    W.put(0, 0, colA, mAw)
    # a catedral, entre as duas faixas
    mC = Mask(TW + 400, H)
    rose, rr = cathedral(mC, 1150 + 200, 700, H)
    mCw = wrap_fix(mC, TW)
    colC = mix(hexc(0x1f253d), hexc(0x2b3350), sstep(300, 700, yy)[..., None])
    colC = mix(colC, GOLD2 * 0.8 + colC * 0.3, (rim(mCw, 1, -0.4, 4) * 0.5)[..., None])
    colC = mix(colC, COLD * 0.5 + colC * 0.6, (rim(mCw, -0.3, -1, 3) * 0.3)[..., None])
    W.put(0, 0, colC, mCw)
    # rosácea acesa (vitral quente) e janelas altas das torres
    rx, ry = rose[0] - 200, rose[1]
    d = np.hypot(xx - rx, yy - ry)
    ang = np.arctan2(yy - ry, xx - rx)
    petals = 0.5 + 0.5 * np.cos(ang * 12)
    glass = mix(WIN0 * 0.7, WIN1, (np.clip(1 - d / rr, 0, 1) ** 0.7)[..., None])
    glass = mix(glass, glass * 0.45, (sstep(0.75, 0.95, petals) * sstep(rr * 0.3, rr * 0.5, d) * 0.6)[..., None])
    W.put(0, 0, glass, np.clip(rr + 0.5 - d, 0, 1))
    W.put(0, 0, hexc(0x1a1d2c), np.clip(np.minimum(d - rr + 3.5, rr + 0.5 - d), 0, 1) * 0.9)
    dark = hexc(0x0c0f1a)
    for side in (-1, 1):
        tx = rx + side * 90
        # sineiras escuras e uma janela acesa embaixo em cada torre
        for sx in (-12, 12):
            wm, _ = lancet(xx, yy, tx + sx, 14, 262, 306, 0.8)
            W.put(0, 0, dark, wm * 0.9)
        wm, _ = lancet(xx, yy, tx, 12, 344, 380, 0.8)
        W.put(0, 0, mix(WIN0 * 0.6, WIN1 * 0.8, 0.4), wm * 0.8)
    # galeria de arquinhos embaixo da rosácea
    for k in range(7):
        gx = rx - 48 + k * 16
        wm, _ = lancet(xx, yy, gx, 9, 464, 488, 0.8)
        W.put(0, 0, dark, wm * 0.85)
    # faixa B: casas mais perto, mais escuras
    mB = Mask(TW + 400, H)
    for (x, w, h, kind) in skyline(TW, H, rng, 700, (60, 150), (90, 210), (['gable', 'side', 'tower', 'flat'], [0.4, 0.34, 0.14, 0.12]), gap=(-12, 4)):
        if 1150 - 240 < x < 1150 + 560 and h > 150:
            h *= 0.6   # não cobre a catedral
        far_building(mB, x + 200, w, 700, h, kind, rng, H)
        for _ in range(int(w * h / 2200)):
            if rng.random() < 0.5:
                lights.append(('B', x + rng.uniform(4, w - 4), 700 - rng.uniform(10, h - 10)))
    mBw = wrap_fix(mB, TW)
    colB = mix(hexc(0x161b2e), hexc(0x222a42), sstep(480, 760, yy)[..., None])
    colB = mix(colB, GOLD2 * 0.75 + colB * 0.3, (rim(mBw, 1, -0.3, 3) * 0.45)[..., None])
    colB = mix(colB, COLD * 0.45 + colB * 0.6, (rim(mBw, -0.2, -1, 2) * 0.3)[..., None])
    W.put(0, 0, colB, mBw)
    # janelinhas acesas
    L = W.L
    for band, x, y in lights:
        x %= TW
        mm = mAw if band == 'A' else mBw
        if mm[int(min(y, H - 1)), int(x)] < 0.9:
            continue
        s = 1.0 if band == 'A' else 1.5
        c = mix(WIN0, WIN1, rng.random())
        L.dab(x, y, s, c, 0.55 if band == 'A' else 0.85, 0.6)
        L.dab(x, y, s * 5, WIN0, 0.05, s * 4)
    # névoa subindo da cidade baixa (cobre as bases e fica opaca embaixo)
    mist_n = pnoise(H, TW, 60, rng, 3, sx=3.0)
    mist = sstep(560, 760, yy + (mist_n - 0.5) * 60)
    W.put(0, 0, mix(FOG0, FOG1, 0.25), np.clip(mist, 0, 1))
    W.put(0, 0, mix(FOG0, SL2, 0.5), sstep(700, 800, yy))
    return W.L


def wrap_fix(m, TW, pad=200):
    """Máscara desenhada com `pad` pixels de folga de cada lado vira uma máscara que dá a volta."""
    a = m.array()
    out = a[:, pad:pad + TW].copy()
    left = a[:, :pad]
    right = a[:, pad + TW:pad + TW + pad]
    out[:, TW - pad:] = np.maximum(out[:, TW - pad:], left)
    out[:, :right.shape[1]] = np.maximum(out[:, :right.shape[1]], right)
    return out


# ======================================================================================
# Cidade: casas mais perto
# ======================================================================================
def house(rng, w, h, kind, base, tone):
    """Uma casa num quadro local: devolve (camada local, x do canto, y do canto)."""
    timber = kind in ('gable', 'side') and rng.random() < 0.7
    roof_h = w * rng.uniform(0.42, 0.62) if kind == 'gable' else rng.uniform(40, 76) if kind == 'side' else w * rng.uniform(1.6, 2.2)
    top = base - h
    m_top = top - roof_h - 120          # folga para chaminé e fumaça
    lx0 = -30
    LW, LH = int(w + 60), int(840 - m_top) + 2
    oy = m_top
    L = Layer(LW, LH)
    yy, xx = grid(LW, LH, int(lx0), int(oy))   # xx: em relação ao canto esquerdo da casa
    # corpo, com o andar de cima avançando (balanço) nas casas de enxaimel
    body = Mask(LW, LH)
    X = lambda x: x - lx0
    Y = lambda y: y - oy
    body.rect(X(0), Y(top), X(w), LH)
    jet = rng.uniform(5, 9) if timber else 0
    floors = max(2, int(h // rng.uniform(62, 74)))
    fh = h / floors
    if jet:
        body.rect(X(-jet), Y(top), X(w + jet), Y(top + fh * (floors - 1)))
    roof = Mask(LW, LH)
    chim = Mask(LW, LH)
    gable_wall = None
    chimneys = []
    if kind == 'gable':
        roof.poly([(X(-jet - 9), Y(top + 3)), (X(w / 2), Y(top - roof_h)), (X(w + jet + 9), Y(top + 3))])
        gable_wall = Mask(LW, LH).poly([(X(-jet + 8), Y(top + 1)), (X(w / 2), Y(top - roof_h + 15)), (X(w + jet - 8), Y(top + 1))]).array()
        if rng.random() < 0.7:
            cx = w * rng.uniform(0.62, 0.8)
            slope_y = top - roof_h * (1 - abs(cx - w / 2) / (w / 2 + jet + 9))
            chimneys.append((cx, slope_y))
    elif kind == 'side':
        roof.poly([(X(-jet - 12), Y(top + 3)), (X(14), Y(top - roof_h)), (X(w - 14), Y(top - roof_h)), (X(w + jet + 12), Y(top + 3))])
        for _ in range(rng.integers(0, 3)):
            dx = rng.uniform(30, w - 50)
            dw = rng.uniform(26, 34)
            dy = top - roof_h * rng.uniform(0.25, 0.45)
            roof.poly([(X(dx - 3), Y(dy + 2)), (X(dx + dw / 2), Y(dy - dw * 0.65)), (X(dx + dw + 3), Y(dy + 2))])
            body.rect(X(dx), Y(dy), X(dx + dw), Y(dy + 24))
            body.rect(X(dx), Y(dy), X(dx + dw), Y(top + 2))
        for _ in range(rng.integers(1, 3)):
            chimneys.append((rng.uniform(24, w - 24), top - roof_h))
    else:
        roof.poly([(X(-6), Y(top + 3)), (X(w / 2), Y(top - roof_h)), (X(w + 6), Y(top + 3))])
        roof.line([(X(w / 2), Y(top - roof_h)), (X(w / 2), Y(top - roof_h - 22))], 2.4)
        roof.poly([(X(w / 2), Y(top - roof_h - 22)), (X(w / 2 + 14), Y(top - roof_h - 17)), (X(w / 2), Y(top - roof_h - 12))])
        body.rect(X(-5), Y(top), X(w + 5), Y(top + 10))
    for (cx, cy) in chimneys:
        cw = rng.uniform(14, 20)
        ch = rng.uniform(46, 70)
        chim.rect(X(cx - cw / 2), Y(cy - ch), X(cx + cw / 2), Y(cy + 20))
        chim.rect(X(cx - cw / 2 - 3), Y(cy - ch - 5), X(cx + cw / 2 + 3), Y(cy - ch + 2))
    mb, mr, mc = body.array(), roof.array(), chim.array()
    if gable_wall is not None:
        mr = np.clip(mr - gable_wall, 0, 1)   # o telhado da empena é só a aba em volta da parede
    # cores: reboco azulado (cada casa com seu tom), telhado escuro, madeira mais escura que o reboco
    plaster = mix(hexc(0x111726), hexc(0x192036), tone) * (0.92 + 0.16 * rng.random())
    col = plaster * (1.12 - 0.3 * sstep(top, base, yy))[..., None]
    if gable_wall is not None:
        mb = np.maximum(mb, gable_wall)
    tex = value_noise(LH, LW, 18, rng, 3)
    col = col * (0.93 + 0.14 * tex)[..., None]
    if timber:
        wood = Mask(LW, LH)
        for i in range(floors + 1):
            y = top + i * fh
            wood.line([(X(-jet if i < floors else 0), Y(y)), (X(w + (jet if i < floors else 0)), Y(y))], 5)
        nposts = max(2, int(w // rng.uniform(38, 52)))
        for i in range(nposts + 1):
            px = i * w / nposts
            wood.line([(X(px), Y(top)), (X(px), Y(base))], 4)
        for f in range(floors):
            for i in range(nposts):
                if rng.random() < 0.45:
                    xa, xb = i * w / nposts, (i + 1) * w / nposts
                    ya, yb = top + f * fh, top + (f + 1) * fh
                    if rng.random() < 0.5:
                        wood.line([(X(xa), Y(yb)), (X(xb), Y(ya))], 3.5)
                    else:
                        wood.line([(X(xa), Y(ya)), (X(xb), Y(yb))], 3.5)
        if gable_wall is not None:
            wood.line([(X(w / 2), Y(top - roof_h + 18)), (X(w / 2), Y(top))], 4)
            wood.line([(X(w * 0.25), Y(top - roof_h * 0.5 + 6)), (X(w * 0.75), Y(top - roof_h * 0.5 + 6))], 3.5)
        mw = wood.array() * mb
        col = mix(col, plaster * 0.45, (mw * 0.9)[..., None])
    rcol = mix(hexc(0x0a0d17), hexc(0x10141f), tex[..., None])
    rows = (np.abs(((yy - top) % 9.0) - 4.5) < 0.7).astype(np.float32)
    rcol = mix(rcol, rcol * 0.6, (rows * 0.5)[..., None])
    ccol = plaster * 0.75
    # janelas por andar (a de baixo fica atrás do terreno: começa no segundo andar)
    wins = []
    for f in range(floors - 1 if kind != 'tower' else floors):
        y0 = top + f * fh + fh * 0.3
        n = max(1, int(w // 62)) if kind != 'tower' else 1
        for i in range(n):
            if rng.random() < 0.12:
                continue
            cx = (i + 0.5) * w / n + rng.normal(0, 3)
            ww, wh = (18, 26) if kind != 'tower' else (12, 30)
            wins.append((cx, y0, ww, wh, rng.random() < 0.42))
    if gable_wall is not None and rng.random() < 0.7:
        wins.append((w / 2, top - roof_h * 0.45, 14, 18, rng.random() < 0.6))
    # composição: corpo, telhado, chaminés
    L.fill(np.clip(col, 0, 1), mb)
    for (cx, y0, ww, wh, lit) in wins:
        hole = np.clip(np.minimum(ww / 2 + 0.5 - np.abs(xx - cx - 0.0), np.minimum(yy - y0 + 0.5, y0 + wh + 0.5 - yy)), 0, 1)
        if lit:
            glow = np.exp(-(np.hypot(xx - cx, (yy - y0 - wh / 2) * 0.8) / (ww * 1.3)) ** 2) * mb
            L.fill(WIN0 * 0.55 + plaster * 0.3, glow * 0.45)
            g = np.clip(1 - np.hypot((xx - cx) / (ww * 0.6), (yy - y0 - wh * 0.62) / (wh * 0.6)), 0, 1)
            gc = mix(WIN0, WIN1, g[..., None])
            gc = mix(gc, WIN2, (g ** 3 * 0.5)[..., None])
        else:
            gc = mix(hexc(0x0a0d17), hexc(0x161d2e), ((yy - y0) / wh)[..., None])
        lead = (np.abs(xx - cx) < 1.0) | (np.abs(yy - y0 - wh * 0.45) < 1.0)
        gc = np.where(lead[..., None], hexc(0x0c0a0a), gc)
        L.fill(np.clip(gc, 0, 1), hole)
        sill = np.clip(np.minimum(ww / 2 + 3.5 - np.abs(xx - cx), np.minimum(yy - (y0 + wh) + 0.5, y0 + wh + 4.5 - yy)), 0, 1)
        L.fill(plaster * 1.3, sill)
        if not lit and rng.random() < 0.5:
            for sgn in (-1, 1):
                sh = np.clip(np.minimum(5.5 - np.abs(xx - cx - sgn * (ww / 2 + 6)), np.minimum(yy - y0 + 0.5, y0 + wh + 0.5 - yy)), 0, 1)
                L.fill(hexc(0x1d140e), sh)
    L.fill(np.clip(ccol, 0, 1), mc)
    L.fill(np.clip(rcol, 0, 1), mr)
    # luz: dourada do eclipse nas bordas da direita, fria do céu nos topos
    full = np.clip(L.A, 0, 1)
    gold = rim(full, 1, -0.35, 4)
    cold = rim(full, -0.25, -1, 3)
    cur = L.color()
    cur = mix(cur, GOLD2 * 0.85 + cur * 0.25, (gold * 0.45)[..., None])
    cur = mix(cur, COLD * 0.5 + cur * 0.5, (cold * 0.35)[..., None])
    # ar entre a casa e o jogador: um pouco de névoa, mais perto da rua
    cur = mix(cur, FOG0 * 0.85, (0.1 + 0.3 * sstep(base - 260, base, yy))[..., None])
    L.P[:] = np.clip(cur, 0, 1) * L.A[..., None]
    # fumaça das chaminés
    for (cx, cy) in chimneys:
        if rng.random() < 0.6:
            x, y = X(cx), Y(cy - 70)
            for k in range(14):
                L.dab(x + k * 3.5 + rng.normal(0, 2), y - k * 7, 6 + k * 1.6, mix(SL3, SL4, rng.random()), 0.05 + 0.03 * (1 - k / 14), 5 + k)
    return L, lx0, oy


def city_mid(rng):
    TW, H = 2048, 840
    base = 700
    W = Wrap(TW, H)
    yy, xx = grid(TW, H)
    plan = []
    x = rng.uniform(0, 30)
    while x < TW - 60:
        kind = rng.choice(['gable', 'side', 'gable', 'side', 'tower'], p=[0.3, 0.3, 0.12, 0.13, 0.15])
        if kind == 'tower':
            w, h = rng.uniform(64, 84), rng.uniform(240, 320)
        else:
            w, h = rng.uniform(130, 210), rng.uniform(110, 190)
        plan.append((x, w, h, kind, rng.random()))
        x += w + rng.uniform(6, 46)
    # torres atrás, casas na frente
    gaps = []
    for (x, w, h, kind, tone) in sorted(plan, key=lambda p: p[3] != 'tower'):
        L, lx0, oy = house(rng, w, h, kind, base, tone)
        W.put_layer(x + lx0, oy, L)
    plan.sort(key=lambda p: p[0])
    for i, (x, w, h, kind, tone) in enumerate(plan):
        nx = plan[(i + 1) % len(plan)]
        x2 = nx[0] + (TW if i + 1 == len(plan) else 0)
        gaps.append((x + w, x2, min(h, nx[2])))
    L = W.L
    # varais e lampiões entre as casas
    for (xa, xb, hh) in gaps:
        if xb - xa < 4:
            continue
        r = rng.random()
        if r < 0.45 and xb - xa > 10:
            y = base - hh * rng.uniform(0.45, 0.7)
            line_y = lambda t: y + 22 * math.sin(math.pi * t)
            pts = [(xa - 10 + (xb - xa + 20) * t, line_y(t)) for t in np.linspace(0, 1, 24)]
            draw_wrap(W, pts, 1.6, hexc(0x0a0c14))
            for t in np.linspace(0.15, 0.85, rng.integers(2, 5)):
                cx = xa - 10 + (xb - xa + 20) * t
                cy = line_y(t)
                cw, chh = rng.uniform(14, 24), rng.uniform(20, 34)
                c = [hexc(0x5a2a2a), hexc(0x6a5a3a), hexc(0x4a5060), hexc(0x3a4a3a)][rng.integers(0, 4)]
                cloth_wrap(W, cx, cy, cw, chh, c * 0.75, rng)
        elif r < 0.8:
            y = base - rng.uniform(150, 210)
            side = xa if rng.random() < 0.5 else xb
            lantern_wrap(W, side, y, 1 if side == xa else -1, rng)
    # névoa da rua embaixo
    mist_n = pnoise(H, TW, 50, rng, 3, sx=3.0)
    W.put(0, 0, mix(SL1, FOG0, 0.45), np.clip(sstep(600, 800, yy + (mist_n - 0.5) * 50), 0, 1) * 0.92)
    W.put(0, 0, SL1 * 0.9, sstep(760, 840, yy))
    return W.L


def draw_wrap(W, pts, width, col):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0 = int(min(xs) - width - 3), int(min(ys) - width - 3)
    x1, y1 = int(max(xs) + width + 3), int(max(ys) + width + 3)
    m = Mask(x1 - x0, y1 - y0)
    m.line([(x - x0, y - y0) for x, y in pts], width)
    W.put(x0, y0, col, m.array())


def cloth_wrap(W, cx, cy, cw, ch, col, rng):
    x0, y0 = int(cx - cw), int(cy - 4)
    w, h = int(cw * 2), int(ch + 10)
    m = Mask(w, h)
    sway = rng.normal(0, 2)
    m.poly([(cw / 2, 4), (cw * 1.5, 4), (cw * 1.5 + sway, 4 + ch), (cw * 0.5 + sway, 4 + ch * rng.uniform(0.85, 1.0))])
    a = m.array()
    yy, xx = grid(w, h)
    c = col * (1.1 - 0.35 * (yy / h))[..., None]
    c = mix(c, c * 0.65, (0.5 + 0.5 * np.sin(xx * 0.9))[..., None] * 0.25)
    W.put(x0, y0, c, a)


def lantern_wrap(W, x, y, dirn, rng):
    """Lampião de ferro num braço saindo da parede, com a luz quente em volta."""
    L = Layer(120, 140)
    ox, oy = x - 60, y - 60
    arm = Mask(120, 140)
    bx = 60
    tip = bx + dirn * 26
    arm.line([(bx, 62), (tip, 62)], 3)
    arm.line([(bx, 74), (bx + dirn * 14, 62)], 2.2)
    arm.line([(tip, 62), (tip, 70)], 1.6)
    arm.poly([(tip - 7, 70), (tip + 7, 70), (tip + 5, 74), (tip - 5, 74)])
    arm.poly([(tip - 5, 88), (tip + 5, 88), (tip + 7, 92), (tip - 7, 92)])
    glass = Mask(120, 140).poly([(tip - 5, 74), (tip + 5, 74), (tip + 5.5, 88), (tip - 5.5, 88)]).array()
    for r, a in ((46, 0.08), (24, 0.12), (12, 0.2)):
        L.dab(tip, 81, r, WIN0, a, r * 0.9)
    L.fill(mix(WIN1, WIN2, 0.4), glass)
    L.fill(hexc(0x07080d), arm.array())
    W.put_layer(ox, oy, L)


# ======================================================================================
# Claustro: a galeria do outro lado do jardim
# ======================================================================================
def claustro_mid(rng):
    """A arcada do claustro vista do jardim: mureta, colunelos geminados, arcos redondos com a
    galeria escura atrás, o telhado de uma água (o céu e a catedral aparecem por cima), hera e
    ciprestes."""
    TW, H = 2048, 840
    yy, xx = grid(TW, H)
    W = Wrap(TW, H)
    bay = 128
    par_top, spring, wall_top, roof_top = 604, 452, 344, 300
    lights = []
    # telhado de uma água sobre a galeria
    rm = np.clip(0.5 - np.maximum(roof_top - yy, yy - wall_top), 0, 1)
    rows = (np.abs(((yy - roof_top) % 10.0) - 5.0) < 0.8).astype(np.float32)
    rcol = mix(hexc(0x141826), hexc(0x0d101a), rows[..., None] * 0.6)
    rcol = mix(rcol, COLD * 0.5 + rcol * 0.6, sstep(roof_top + 5, roof_top, yy)[..., None] * 0.7)
    W.put(0, 0, rcol, rm)
    # parede da galeria: pedra clara do claustro, com cornija embaixo do telhado
    stone = mix(hexc(0x2c2f43), hexc(0x24273a), sstep(wall_top, H, yy)[..., None])
    tex = pnoise(H, TW, 20, rng, 3)
    stone = stone * (0.92 + 0.14 * tex)[..., None]
    courses = (np.abs((yy % 22.0) - 11.0) > 10.3).astype(np.float32)
    stone = mix(stone, stone * 0.72, (courses * 0.4)[..., None])
    wall = np.clip(0.5 - (wall_top - yy), 0, 1)
    # vãos dos arcos (redondos, entre os pares de colunelos)
    opening = np.zeros((H, TW), np.float32)
    for i in range(-1, TW // bay + 2):
        cx = i * bay + bay / 2
        r = bay / 2 - 12
        d = np.where(yy < spring, np.hypot(xx - cx, yy - spring) - r, np.abs(xx - cx) - r)
        d = np.maximum(d, yy - par_top)
        opening = np.maximum(opening, np.clip(0.5 - d, 0, 1))
    # dentro da galeria: escuro, a abóbada de aresta e um brilho quente de vela aqui e ali
    inner = mix(hexc(0x090a12), hexc(0x141624), sstep(spring - 60, par_top, yy)[..., None])
    for i in range(TW // bay):
        if rng.random() < 0.35:
            gx = i * bay + bay / 2 + rng.normal(0, 14)
            g = np.exp(-(np.hypot((xx - gx) / 40, (yy - (par_top - 40)) / 50)) ** 2)
            inner = mix(inner, WIN0 * 0.55, (g * 0.55)[..., None])
            lights.append((gx, par_top - 30))
    col = mix(stone, inner, opening[..., None])
    # arquivolta: anel de pedra mais clara em volta de cada arco
    for i in range(-1, TW // bay + 2):
        cx = i * bay + bay / 2
        r = bay / 2 - 12
        dd = np.hypot(xx - cx, yy - spring)
        ring = np.clip(np.minimum(dd - r + 0.5, r + 9.5 - dd), 0, 1) * (yy < spring + 1)
        col = mix(col, hexc(0x3a3d54), (ring * 0.8)[..., None])
    # cornija embaixo do telhado e a mureta
    cor = np.clip(0.5 - np.maximum(wall_top - yy, yy - wall_top - 12), 0, 1)
    col = mix(col, hexc(0x3c4058), cor[..., None])
    col = mix(col, COLD * 0.55 + col * 0.5, (np.clip(0.5 - np.abs(yy - wall_top - 1.5), 0, 1) * 0.8)[..., None])
    par = np.clip(0.5 - np.maximum(par_top - yy, -1.0), 0, 1)
    pcol = mix(hexc(0x34374c), hexc(0x24273a), sstep(par_top, par_top + 80, yy)[..., None])
    pcol = mix(pcol, COLD * 0.5 + pcol * 0.6, sstep(par_top + 5, par_top, yy)[..., None] * 0.8)
    # pedra de capa da mureta e as juntas dos blocos
    pcol = mix(pcol, pcol * 0.6, (np.clip(1.2 - np.abs(yy - par_top - 10), 0, 1) * 0.8)[..., None])
    joints = (np.abs(((xx + (np.floor((yy - par_top - 10) / 26) % 2) * 32) % 64.0) - 32.0) > 31.0) & (yy > par_top + 10)
    pcol = mix(pcol, pcol * 0.7, (joints * 0.6)[..., None])
    pcol = mix(pcol, pcol * 0.7, ((np.abs(((yy - par_top - 10) % 26.0) - 13.0) > 12.2) * 0.5)[..., None])
    col = mix(col, pcol, par[..., None])
    W.put(0, 0, np.clip(col, 0, 1), wall)
    # colunelos geminados entre os arcos, com capitel e base
    for i in range(TW // bay + 1):
        x = (i * bay) % TW
        for o in (0, TW):
            for sx in (-7, 7):
                cx = x + o + sx
                shaft = np.clip(np.minimum(3.6 - np.abs(xx - cx), np.minimum(yy - spring + 0.5, par_top + 0.5 - yy)), 0, 1)
                sc = mix(hexc(0x4a4e68), hexc(0x22253a), sstep(-3, 3, xx - cx)[..., None])
                W.put(0, 0, sc, shaft)
            cap = np.clip(np.minimum(17.5 - np.abs(xx - x - o), np.minimum(yy - (spring - 10) + 0.5, spring + 2 + 0.5 - yy)), 0, 1)
            W.put(0, 0, hexc(0x3e4258), cap)
            base = np.clip(np.minimum(15.5 - np.abs(xx - x - o), np.minimum(yy - (par_top - 7) + 0.5, par_top + 0.5 - yy)), 0, 1)
            W.put(0, 0, hexc(0x34374c), base)
    L = W.L
    # luz: ouro do eclipse nas bordas da direita, fria no alto
    full = np.clip(L.A, 0, 1)
    cur = L.color()
    cur = mix(cur, GOLD2 * 0.8 + cur * 0.3, (rim(full, 1, -0.3, 3) * 0.35)[..., None])
    L.P[:] = np.clip(cur, 0, 1) * L.A[..., None]
    for (x, y) in lights:
        for o in (0, TW, -TW):
            L.dab(x + o, y, 28, WIN0, 0.05, 24)
    # hera descendo do telhado e subindo da mureta
    for k in range(70):
        x = rng.uniform(0, TW)
        top = rng.random() < 0.55
        y = wall_top + 10 if top else par_top + 4
        ln = rng.uniform(20, 90) if top else rng.uniform(14, 40)
        for o in (0, TW, -TW):
            for j in range(int(ln / 5)):
                yy2 = y + j * 5 if top else y - j * 4
                L.dab(x + o + rng.normal(0, 3), yy2, rng.uniform(2.5, 5.0), mix(hexc(0x16241a), hexc(0x2c4426), rng.random()), 0.9, 1.4)
    # ciprestes no jardim, na frente da arcada
    for k in range(5):
        x = rng.uniform(0, TW)
        h = rng.uniform(260, 360)
        c = Layer(80, int(h) + 20)
        m = Mask(80, int(h) + 20)
        # ponta fina em cima, bojo largo embaixo e um tronco curto
        def wdt(t):
            return 24 * (t / 0.62) ** 0.75 if t < 0.62 else 24 * (1 - 0.4 * ((t - 0.62) / 0.38) ** 2)
        pts = []
        for t in np.linspace(0, 0.94, 20):
            pts.append((40 + wdt(t) + rng.normal(0, 1.2), 10 + t * h))
        for t in np.linspace(0.94, 0, 20):
            pts.append((40 - wdt(t) + rng.normal(0, 1.2), 10 + t * h))
        m.poly(pts)
        m.rect(37, 10 + 0.9 * h, 43, 10 + h + 8)
        a = m.array()
        ly, lx = grid(80, int(h) + 20)
        cc = mix(hexc(0x0f1a14), hexc(0x1c2c20), sstep(60, 20, lx)[..., None])
        cc = mix(cc, GOLD1 * 0.5 + cc * 0.6, (rim(a, 1, 0, 3) * 0.4)[..., None])
        c.fill(np.clip(cc, 0, 1), a)
        W.put_layer(x - 40, 700 - h - 10, c)
    # névoa baixa do jardim
    W.put(0, 0, mix(SL1, FOG0, 0.4), np.clip(sstep(620, 800, yy), 0, 1) * 0.85)
    W.put(0, 0, SL1 * 0.9, sstep(760, 840, yy))
    return W.L


# ======================================================================================
# Catedral por dentro: a parede do fundo
# ======================================================================================
def stained_glass(xx, yy, cx, w, apex, bottom, rng, base_col, warm=0.0):
    """Cor de um vitral alto: mosaico de vidros coloridos, mais claro no meio, com o chumbo."""
    cell = 10.0
    ia = np.floor((xx - cx) / cell)
    ib = np.floor((yy - apex) / cell)
    key = ((ia.astype(np.int64) * 73856093) ^ (ib.astype(np.int64) * 19349663)) & 0xffff
    pal = np.array(GLASS, np.float32)
    pick = pal[key % len(GLASS)]
    lum = np.clip(1 - np.abs(xx - cx) / (w * 0.65), 0, 1) * np.clip(1 - np.abs((yy - (apex + bottom) / 2) / ((bottom - apex) * 0.7)), 0, 1)
    c = mix(base_col, pick * 1.2, 0.3)
    c = c * (0.5 + 0.7 * lum)[..., None]
    c = mix(c, WIN1, warm)
    fa = (xx - cx) / cell - ia
    fb = (yy - apex) / cell - ib
    lead = (np.minimum(fa, 1 - fa) < 0.08) | (np.minimum(fb, 1 - fb) < 0.08)
    c = np.where(lead[..., None], c * 0.5, c)
    return np.clip(c, 0, 1)


def nave_far(rng):
    TW, H = 2048, 800
    yy, xx = grid(TW, H)
    bay = 256
    floor = 620
    # parede: escura em cima (abóbada), névoa fria no meio, pedra perto do chão
    t = yy / H
    col = mix(hexc(0x080a12), hexc(0x161b2b), sstep(0.0, 0.5, t)[..., None])
    col = mix(col, hexc(0x121521), sstep(0.6, 1.0, t)[..., None])
    tex = pnoise(H, TW, 22, rng, 3)
    col = col * (0.92 + 0.16 * tex)[..., None]
    # fiadas de pedra bem fracas
    courses = (np.abs((yy % 26.0) - 13.0) > 12.2).astype(np.float32)
    col = mix(col, col * 0.75, (courses * 0.35)[..., None])
    open_aisle = np.zeros((H, TW), np.float32)
    glow = np.zeros((H, TW), np.float32)
    win_rgb = np.zeros((H, TW, 3), np.float32)
    win_a = np.zeros((H, TW), np.float32)
    for i in range(TW // bay + 1):
        for off in (0, -TW):
            cx = i * bay + bay / 2 + off
            if cx < -bay or cx > TW + bay:
                continue
            # arcada de baixo: o vão para a nave lateral, escuro, com a janela dela ao fundo
            a, spring = lancet(xx, yy, cx, bay - 52, 284, H + 10, 0.75)
            open_aisle = np.maximum(open_aisle, a)
            aw, _ = lancet(xx, yy, cx, 50, 352, 540, 0.8)
            c = stained_glass(xx, yy, cx, 50, 352, 540, rng, hexc(0x4e68a0))
            win_rgb = np.where((aw > win_a)[..., None], c, win_rgb)
            win_a = np.maximum(win_a, aw * 0.7)
            glow = np.maximum(glow, np.exp(-(np.hypot((xx - cx) / 70, (yy - 450) / 130)) ** 2) * 0.55)
            # trifório: quatro arquinhos escuros
            for k in range(4):
                tx = cx - 66 + k * 44
                ta, _ = lancet(xx, yy, tx, 26, 196, 252, 0.8)
                open_aisle = np.maximum(open_aisle, ta * 0.85)
            # clerestório: o vitral alto
            ca, _ = lancet(xx, yy, cx, 98, 24, 168, 0.72)
            c = stained_glass(xx, yy, cx, 98, 24, 168, rng, hexc(0x6f8ccc))
            mull = sstep(2.2, 0.8, np.abs(xx - cx)) * (yy > 70)
            rose = np.hypot(xx - cx, yy - 62)
            tracery = np.maximum(mull, sstep(1.6, 0.4, np.abs(rose - 17)))
            c = mix(c, hexc(0x0b0d16), tracery[..., None])
            win_rgb = np.where((ca > win_a)[..., None], c, win_rgb)
            win_a = np.maximum(win_a, ca)
            glow = np.maximum(glow, np.exp(-(np.hypot((xx - cx) / 110, (yy - 96) / 120)) ** 2) * 0.8)
    # névoa fria em volta das janelas
    col = mix(col, hexc(0x3a4a72), (glow * 0.35)[..., None])
    # vão da arcada: nave lateral funda, com névoa
    aisle = mix(hexc(0x05060b), hexc(0x10141f), sstep(300, 600, yy)[..., None])
    aisle = mix(aisle, hexc(0x2a3656), (glow * 0.45)[..., None])
    col = mix(col, aisle, open_aisle[..., None])
    col = mix(col, win_rgb, win_a[..., None])
    # pilares entre os vãos: fustes finos com luz fria na esquerda, capitéis no arranque
    for i in range(TW // bay + 1):
        px = (i * bay) % TW
        for off in (0, TW, -TW):
            x = px + off
            if x < -60 or x > TW + 60:
                continue
            shaft = np.clip(20.5 - np.abs(xx - x), 0, 1)
            sh = mix(hexc(0x1a1f30), hexc(0x0d1018), sstep(-20, 20, xx - x)[..., None])
            sh = mix(sh, hexc(0x4a5a84), (sstep(-14, -20, xx - x) * 0.6)[..., None])
            col = mix(col, sh, shaft[..., None])
            for fx in (-10, 0, 10):
                line = sstep(1.2, 0.3, np.abs(xx - x - fx)) * (yy < floor)
                col = mix(col, col * 0.7, (line * 0.6)[..., None])
            cap = np.clip(np.minimum(30.5 - np.abs(xx - x), np.minimum(yy - 412 + 0.5, 428 + 0.5 - yy)), 0, 1)
            col = mix(col, hexc(0x262c40), cap[..., None])
            cap2 = np.clip(np.minimum(26.5 - np.abs(xx - x), np.minimum(yy - 178 + 0.5, 188 + 0.5 - yy)), 0, 1)
            col = mix(col, hexc(0x20263a), cap2[..., None])
    # nervuras da abóbada no alto
    for i in range(TW // bay + 1):
        for off in (0, -TW, TW):
            x0 = i * bay + off
            d1 = np.abs(np.hypot(xx - x0, yy + 120) - 150)
            col = mix(col, hexc(0x06070c), (sstep(3.5, 1.0, d1) * (yy < 40))[..., None])
    # embaixo some no escuro aos poucos (quando a câmera sobe, isto aparece acima do chão de verdade)
    col = mix(col, hexc(0x07080d), (sstep(floor - 60, floor + 150, yy) * 0.94)[..., None])
    L = Layer.from_rgb(np.clip(col, 0, 1))
    # fachos de luz saindo dos vitrais altos, descendo para a esquerda
    beams = np.zeros((H, TW), np.float32)
    for i in range(TW // bay + 1):
        for off in (0, -TW, TW):
            cx = i * bay + bay / 2 + off
            u = (xx - cx) + (yy - 100) * 0.42
            beams = np.maximum(beams, np.exp(-(u / 34) ** 2) * sstep(90, 160, yy) * sstep(640, 300, yy))
    cur = L.color()
    cur = cur + hexc(0x6a82c0) * (beams * 0.12)[..., None]
    L.P[:] = np.clip(cur, 0, 1)
    return L


# ======================================================================================
# Catedral por dentro: pilares mais perto, estandartes e lustres
# ======================================================================================
def nave_mid(rng):
    TW, H = 2048, 840
    yy, xx = grid(TW, H)
    W = Wrap(TW, H)
    span = 512
    pw = 118
    floor = 660
    cap_y = 236
    for i in range(TW // span):
        cx = i * span + span / 2
        x0 = int(cx - span / 2 - 40)
        LW = span + 80
        ly, lx = grid(LW, H, x0, 0)
        m = Mask(LW, H)
        X = lambda x: x - x0
        # fuste principal e meias-colunas dos lados
        m.rect(X(cx - pw / 2), 0, X(cx + pw / 2), H)
        m.rect(X(cx - pw / 2 - 14), 0, X(cx + pw / 2 + 14), H)
        # capitel e base
        m.poly([(X(cx - pw / 2 - 30), cap_y), (X(cx + pw / 2 + 30), cap_y), (X(cx + pw / 2 + 16), cap_y + 30), (X(cx - pw / 2 - 16), cap_y + 30)])
        m.rect(X(cx - pw / 2 - 26), floor - 54, X(cx + pw / 2 + 26), H)
        m.rect(X(cx - pw / 2 - 18), floor - 74, X(cx + pw / 2 + 18), floor - 50)
        a = m.array()
        k = lx - cx
        # cilindro: luz fria na esquerda (vitrais), escuro na direita, quente embaixo (velas)
        sh = np.clip(k / (pw / 2 + 14), -1, 1)
        base = mix(hexc(0x1d2234), hexc(0x0b0d15), sstep(-0.6, 0.9, sh)[..., None])
        base = mix(base, hexc(0x55669a), (sstep(-0.62, -0.95, sh) * 0.55)[..., None])
        base = mix(base, hexc(0x4a3220), (sstep(floor - 200, floor - 40, ly) * sstep(0.2, 0.9, np.abs(sh)) * 0.35)[..., None])
        flutes = (np.abs(((k + 400) % 20.0) - 10.0) < 1.2) & (np.abs(k) < pw / 2) & (ly > cap_y + 30) & (ly < floor - 74)
        base = mix(base, base * 0.65, (flutes * 0.7)[..., None])
        tex = value_noise(H, LW, 16, rng, 3)
        base = base * (0.9 + 0.2 * tex)[..., None]
        # quinas do capitel e da base com luz
        lit = np.clip(edge(a, 0, -3) + edge(a, 0, -1), 0, 1)
        base = mix(base, base * 1.8, (lit * 0.5)[..., None])
        W.put(x0, 0, np.clip(base, 0, 1), a)
    # estandartes e lustres nos vãos (um sim, um não)
    for i in range(TW // span):
        gx = (i + 1) * span
        if i % 2 == 0:
            banner_wrap(W, gx, rng)
        else:
            chandelier_wrap(W, gx, rng)
    # castiçais altos perto dos pilares
    for i in range(TW // span):
        for sgn in (-1, 1):
            if rng.random() < 0.5:
                candelabra_wrap(W, i * span + span / 2 + sgn * (pw / 2 + 60), floor, rng)
    # escuro embaixo, aos poucos (o chão fica atrás do terreno)
    W.put(0, 0, hexc(0x07080d), sstep(floor - 70, floor + 170, yy) * 0.95)
    return W.L


def banner_wrap(W, cx, rng):
    """Estandarte comprido (vermelho com orla de ouro e o eclipse bordado) pendurado na barra."""
    w, top, bot = 58, 40, rng.uniform(330, 400)
    LW, LH = 120, int(bot + 40)
    L = Layer(LW, LH)
    yy, xx = grid(LW, LH)
    X = LW / 2
    m = Mask(LW, LH)
    m.poly([(X - w / 2, top), (X + w / 2, top), (X + w / 2, bot), (X, bot - 34), (X - w / 2, bot)])
    a = m.array()
    fold = 0.5 + 0.5 * np.sin((xx - X) / w * math.pi * 3.0)
    c = mix(hexc(0x3a0f18), hexc(0x6a1c26), fold[..., None])
    c = c * (1.0 - 0.35 * sstep(top, bot, yy))[..., None]
    trim = np.clip(a - Mask(LW, LH).poly([(X - w / 2 + 5, top + 6), (X + w / 2 - 5, top + 6), (X + w / 2 - 5, bot - 9), (X, bot - 40), (X - w / 2 + 5, bot - 9)]).array(), 0, 1)
    c = mix(c, GOLD1 * 0.85, trim[..., None])
    # o eclipse bordado: anel de ouro e o disco escuro
    ey = top + (bot - top) * 0.36
    d = np.hypot(xx - X, yy - ey)
    c = mix(c, GOLD2 * 0.9, (np.clip(np.minimum(d - 9.5, 14.5 - d) + 0.5, 0, 1))[..., None])
    c = mix(c, hexc(0x14070a), (np.clip(9.5 - d, 0, 1))[..., None])
    for k in range(12):
        ang = k * math.pi / 6
        rx, ry = X + math.cos(ang) * 19, ey + math.sin(ang) * 19
        c = mix(c, GOLD2 * 0.8, (np.clip(2.2 - np.hypot(xx - rx, yy - ry), 0, 1))[..., None])
    L.fill(np.clip(c, 0, 1), a)
    rod = Mask(LW, LH)
    rod.line([(X - w / 2 - 10, top - 2), (X + w / 2 + 10, top - 2)], 4)
    rod.line([(X - w / 2 - 6, top - 2), (X, 0)], 1.4)
    rod.line([(X + w / 2 + 6, top - 2), (X, 0)], 1.4)
    L.fill(hexc(0x090a10), rod.array())
    W.put_layer(cx - LW / 2, 0, L)


def chandelier_wrap(W, cx, rng):
    """Lustre de ferro: corrente do alto, um aro com velas acesas e a luz quente em volta."""
    y = rng.uniform(170, 230)
    LW, LH = 240, int(y + 90)
    L = Layer(LW, LH)
    X = LW / 2
    for r, a in ((110, 0.06), (60, 0.09), (30, 0.12)):
        L.dab(X, y - 10, r, WIN0, a, r * 0.9)
    m = Mask(LW, LH)
    for k in range(int(y // 10)):
        m.ellipse(X, k * 10 + 5, 2.4 if k % 2 else 1.2, 5)
    m.line([(X, y - 30), (X - 62, y), (X + 62, y), (X, y - 30)], 1.6)
    ring = Mask(LW, LH).ellipse(X, y, 66, 12).array() - Mask(LW, LH).ellipse(X, y, 61, 8.5).array()
    a = np.clip(m.array() + ring, 0, 1)
    for k in range(9):
        ang = k / 9 * 2 * math.pi + 0.3
        px, py = X + math.cos(ang) * 63, y + math.sin(ang) * 10
        if math.sin(ang) < -0.2:
            continue
        cm = Mask(LW, LH).rect(px - 2.2, py - 14, px + 2.2, py).array()
        L.fill(hexc(0xb9ab90), cm)
        L.dab(px, py - 18, 2.4, WIN2, 0.95, 1.2)
        L.dab(px, py - 18, 7, WIN1, 0.25, 6)
    L.fill(hexc(0x08090e), a)
    W.put_layer(cx - LW / 2, 0, L)


def candelabra_wrap(W, x, floor, rng):
    h = rng.uniform(130, 170)
    LW, LH = 80, int(h + 60)
    L = Layer(LW, LH)
    X, B = LW / 2, LH - 10
    m = Mask(LW, LH)
    m.poly([(X - 12, B), (X + 12, B), (X + 3, B - 14), (X - 3, B - 14)])
    m.line([(X, B - 10), (X, B - h)], 3)
    m.line([(X - 18, B - h + 6), (X + 18, B - h + 6)], 2.6)
    for sx in (-18, 0, 18):
        m.line([(X + sx, B - h + 6), (X + sx, B - h - 4)], 2.2)
    for sx in (-18, 0, 18):
        L.dab(X + sx, B - h - 18, 14, WIN0, 0.12, 12)
    for sx in (-18, 0, 18):
        L.fill(hexc(0xb9ab90), Mask(LW, LH).rect(X + sx - 2, B - h - 14, X + sx + 2, B - h - 4).array())
        L.dab(X + sx, B - h - 18, 2.2, WIN2, 0.95, 1.1)
    L.fill(hexc(0x08090e), m.array())
    W.put_layer(x - LW / 2, floor - LH + 10, L)


# ======================================================================================
def save(L, name):
    img = L.image()
    img.save(f'{OUT}/{name}.png', optimize=True)
    print(name, img.size, round(time.time() - T0, 1), 's', flush=True)
    return img


def preview(names, out):
    """Monta a vista do jogo (640x360 em 2x) com as camadas na posição de quem está no chão."""
    os.makedirs(out, exist_ok=True)
    for theme, layers, bg in (('city', ['city-sky', 'city-far', 'city-mid'], (11, 16, 32)), ('nave', ['nave-far', 'nave-mid'], (7, 8, 13)),
                              ('claustro', ['city-sky', 'city-far', 'claustro-mid'], (11, 16, 32))):
        for sx in (0, 700):
            view = Image.new('RGBA', (1280, 720), bg + (255,))
            for i, n in enumerate(layers):
                p = f'{OUT}/{n}.png'
                if not os.path.exists(p):
                    continue
                im = Image.open(p).convert('RGBA')
                if n.endswith('sky'):
                    view.alpha_composite(im)
                    continue
                fac = 0.1 if n.endswith('far') else 0.3
                fac = fac if theme != 'nave' else (0.12 if n.endswith('far') else 0.35)
                shift = int(sx * fac * 2) % im.width
                strip = Image.new('RGBA', (1280, im.height))
                x = -shift
                while x < 1280:
                    strip.paste(im, (x, 0))
                    x += im.width
                view.alpha_composite(strip, (0, 720 - im.height))
            view.convert('RGB').save(f'{out}/{theme}-{sx}.png')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    if want('city-sky'):
        save(city_sky(np.random.default_rng(61)), 'city-sky')
    if want('city-far'):
        save(city_far(np.random.default_rng(62)), 'city-far')
    if want('city-mid'):
        save(city_mid(np.random.default_rng(63)), 'city-mid')
    if want('claustro-mid'):
        save(claustro_mid(np.random.default_rng(66)), 'claustro-mid')
    if want('nave-far'):
        save(nave_far(np.random.default_rng(64)), 'nave-far')
    if want('nave-mid'):
        save(nave_mid(np.random.default_rng(65)), 'nave-mid')
    if PREVIEW:
        preview(None, PREVIEW)

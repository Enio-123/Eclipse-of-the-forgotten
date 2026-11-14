"""Fundos da Ponte do Castelo e a tela de título para o ECLIPSE (3 px da imagem por px do mundo).

O mesmo desenho dos pintores antigos (fundos_ponte.py e titulo.py, lido pelo plano de ponte_plano.py: as
mesmas nuvens, a mesma crista das montanhas, as mesmas casas da cidade alta, as mesmas torres do castelo
de Vespera com as janelas acesas no mesmo lugar, o mesmo aqueduto com as luzes da cidade lá embaixo e o
mesmo penhasco do título, com o mesmo brilho), repintado em 3x: o céu de tempestade com pinceladas mais
finas; as torres redondas com as fiadas de pedra, os telhados de ardósia em cone e a contraluz dourada do
eclipse pegando a beira de cada volume; o corpo do castelo com ameias, cordão e a chuva escorrida; as
janelas em arco com o clarão em volta; a cidade alta casa por casa, saindo da névoa; o aqueduto com as
aduelas dos arcos, as fiadas dos pilares e os balaústres do parapeito.

  bridge-sky      3300x1140  céu de tempestade com o eclipse (opaco)
  bridge-far      3300x1140  montanhas, a cidade alta e o castelo de Vespera no penhasco
  bridge-far-rim             o castelo aceso pelo relâmpago (acende e apaga)
  bridge-mid      3072x1260  o abismo: névoa, o aqueduto e as luzes da cidade (repete)
  bridge-mid-rim
  title-sky       1920x1080  o recorte do céu para a tela de título
  title-land                 o castelo, a névoa do abismo e o penhasco do cavaleiro
  title-rim

As medidas dentro do pintor são as do pintor antigo (px do 2x); a tela é 1,5 vez maior.

uso: python3 ecl_ponte.py <pasta_saida> [sky far mid title] [--preview=<pasta>] [--old=<pasta com os png em 2x>]
     python3 ecl_ponte.py <pasta_saida> --check     (confere a leitura dos ruídos anotados com os do pintor antigo)
"""
import math
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from brush import Layer, hexc, mix, sstep, blur, value_noise, noise1d, paint, passes_std
from shapes import Mask
from common import seamless
from pedra3 import cracks, grain, put
from ecl_comum import OUT, OLD, PREVIEW, T0, want, save
from fundos_ponte import SL0, SL1, SL2, SL3, FOG0, FOG1, FOG2, GOLD0, GOLD1, GOLD2, GOLD3, WIN0, WIN1, COLD, EX, EY, ER, TOWERS
import ponte_plano as PP

K = 1.5
W2, H2 = 2200, 760
W3, H3 = 3300, 1140
C0, C1 = hexc(0x0a0e18), hexc(0x182036)  # a pedra do castelo na contraluz, no alto e no pé
STORM = hexc(0x55638a)
FLASH = hexc(0x8a9ac0)


def unit(v):
    v = np.asarray(v, np.float32)
    return v / np.linalg.norm(v)


LF = unit([-0.62, -0.30, 0.72])  # a luz fria da tempestade: de cima e da esquerda, pela frente
LZ = unit([-0.56, -0.60, 0.57])  # o relâmpago
LB, CB = 0.70, 0.714  # a contraluz do eclipse: quanto ela vem de trás e quanto vem de lado
RT = np.random.default_rng(77).random(4096).astype(np.float32)  # um sorteio por pedra


# ======================================================================================
# a tela em 3x nas medidas do 2x, formas e ruídos
# ======================================================================================
def grid2(w3, h3):
    """O centro de cada pixel do 3x, nas medidas do pintor antigo."""
    yy, xx = np.mgrid[0:h3, 0:w3].astype(np.float32)
    return (yy + 0.5) / K, (xx + 0.5) / K


class Win:
    """Uma janela da tela (cantos em px do 2x): onde ela fica no 3x e o centro de cada pixel dela."""

    def __init__(self, x0, y0, x1, y1, w3=W3, h3=H3):
        c0, c1 = max(0, int(math.floor(x0 * K))), min(w3, int(math.ceil(x1 * K)))
        r0, r1 = max(0, int(math.floor(y0 * K))), min(h3, int(math.ceil(y1 * K)))
        self.ok = c1 > c0 and r1 > r0
        self.sl = (slice(r0, max(r0, r1)), slice(c0, max(c0, c1)))
        yy, xx = np.mgrid[r0:max(r0, r1), c0:max(c0, c1)].astype(np.float32)
        self.Y, self.X = (yy + 0.5) / K, (xx + 0.5) / K


def aa(d):
    """Quanto do pixel a forma cobre, pela distância para fora dela (px do 2x; negativa dentro)."""
    return np.clip(0.5 - d * K, 0, 1)


def sd_box(X, Y, x0, y0, x1, y1):
    dx = np.maximum(x0 - X, X - x1)
    dy = np.maximum(y0 - Y, Y - y1)
    return np.minimum(np.maximum(dx, dy), 0) + np.hypot(np.maximum(dx, 0), np.maximum(dy, 0))


def sd_edges(X, Y, pts):
    """Distância (positiva para fora) até cada lado de um polígono convexo, na ordem dos pontos."""
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    s = 1.0 if area > 0 else -1.0
    out = []
    for i in range(n):
        (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        out.append(((X - ax) * ey - (Y - ay) * ex) * (s / math.hypot(ex, ey)))
    return out


def sd_poly(X, Y, pts):
    d = sd_edges(X, Y, pts)
    out = d[0]
    for k in d[1:]:
        out = np.maximum(out, k)
    return out


def edir(X, Y):
    """Para que lado fica o eclipse (vetor de tamanho 1) e a distância até ele."""
    dx, dy = EX - X, EY - Y
    d = np.hypot(dx, dy) + 1e-3
    return dx / d, dy / d, d


def vn3(spec, w3, h3, k=K):
    """O value_noise que o pintor antigo sorteou (o estado anotado em spec), lido na tela maior: a mesma
    grade de sorteios, a mesma curva entre eles e a mesma escala de 0 a 1."""
    assert spec['fn'] == 'value_noise'
    rng = PP.gen(spec['state'])
    H, W, cell, octaves = spec['H'], spec['W'], spec['cell'], spec['octaves']
    iy = (np.arange(h3, dtype=np.float64) + 0.5) / k - 0.5  # o índice no 2x de cada linha do 3x
    ix = (np.arange(w3, dtype=np.float64) + 0.5) / k - 0.5
    old = np.zeros((H, W), np.float32)
    out = np.zeros((h3, w3), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = max(1.0, cell / (2 ** o))
        gh, gw = int(H / c) + 3, int(W / c) + 3
        g = rng.random((gh, gw)).astype(np.float32)
        z = ndi.zoom(g, (c, c), order=3, mode='nearest')
        zh, zw = z.shape
        z2 = z[:H, :W]
        if z2.shape != (H, W):
            z2 = np.pad(z2, ((0, H - z2.shape[0]), (0, W - z2.shape[1])), mode='edge')
        old += amp * z2
        # o zoom do scipy põe a saída o no ponto o * (entrada - 1) / (saída - 1) da grade
        cy = np.repeat((iy * (gh - 1) / (zh - 1))[:, None], w3, axis=1)
        cx = np.repeat((ix * (gw - 1) / (zw - 1))[None, :], h3, axis=0)
        out += amp * ndi.map_coordinates(g, [cy, cx], order=3, mode='nearest')
        tot += amp
        amp *= 0.5
    old /= tot
    out /= tot
    lo, hi = float(old.min()), float(old.max())
    return np.clip((out - lo) / (hi - lo + 1e-6), 0, 1)


def n1_at(spec, x2):
    """O noise1d anotado, lido em qualquer posição (índices do 2x, podem ser quebrados)."""
    assert spec['fn'] == 'noise1d'
    rng = PP.gen(spec['state'])
    x2 = np.asarray(x2, np.float64)
    out = np.zeros(x2.shape, np.float64)
    amp, tot = 1.0, 0.0
    for o in range(spec['octaves']):
        c = max(1.0, spec['cell'] / (2 ** o))
        k = int(spec['n'] / c) + 4
        g = rng.random(k).astype(np.float32)
        out += amp * np.interp(x2 / c, np.arange(k), g)
        tot += amp
        amp *= 0.5
    return (out / tot).astype(np.float32)


def vnoise(h3, w3, cell, rng, octaves=1):
    """Ruído novo (0..1), direto no 3x; cell em px do 2x."""
    return value_noise(h3, w3, cell * K, rng, octaves)


def snoise(h3, w3, cx, cy, rng, octaves=2):
    """Ruído novo esticado (0..1): células de cx por cy (px do 2x)."""
    if cy >= cx:
        f = cy / cx
        n = value_noise(int(math.ceil(h3 / f)) + 2, w3, cx * K, rng, octaves)
        return ndi.zoom(n, (f, 1), order=1)[:h3, :w3]
    f = cx / cy
    n = value_noise(h3, int(math.ceil(w3 / f)) + 2, cy * K, rng, octaves)
    return ndi.zoom(n, (1, f), order=1)[:h3, :w3]


def passes3(scale, dry, bristle, err, long=1.0):
    """As manchas do pintor antigo na tela maior e mais uma passada fina por cima."""
    return passes_std(scale * K, dry=dry, bristle=bristle, err=err, long=long)


def as_layer(col, a):
    L = Layer(a.shape[1], a.shape[0])
    L.P[:] = col * a[..., None]
    L.A[:] = a
    return L


def img_layer(img):
    arr = np.asarray(img.convert('RGBA'), np.float32) / 255
    return as_layer(arr[..., :3], arr[..., 3])


class Sheet:
    """Uma camada em 3x com o que a luz precisa saber de cada ponto: a cor, o alfa, a textura da pedra (a
    contraluz mostra as fiadas), quanto o ponto olha para o relâmpago e a meia-lua da contraluz nos
    volumes redondos."""

    def __init__(self, w3=W3, h3=H3):
        self.col = np.zeros((h3, w3, 3), np.float32)
        self.a = np.zeros((h3, w3), np.float32)
        self.tex = np.ones((h3, w3), np.float32)
        self.lit = np.zeros((h3, w3), np.float32)
        self.cres = np.zeros((h3, w3), np.float32)

    def put(self, w, col, a, tex=1.0, lit=0.5, cres=0.0):
        if not w.ok:
            return
        put(self.col[w.sl], self.a[w.sl], col, a)
        for arr, v in ((self.tex, tex), (self.lit, lit), (self.cres, cres)):
            arr[w.sl] = arr[w.sl] * (1 - a) + v * a


def edge_rim(a, ux, uy, steps=(1.2, 2.4, 3.6, 4.8), weights=(0.4, 0.3, 0.2, 0.1)):
    """Quanto cada ponto da forma está na beira que olha para o lado (ux, uy) (número ou campo; passos em
    px do 3x): 1 na beira, caindo para dentro."""
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    out = np.zeros_like(a)
    for d, k in zip(steps, weights):
        out += k * (1 - ndi.map_coordinates(a, [yy + uy * d, xx + ux * d], order=1, mode='nearest'))
    return out * a


def gold(v):
    """A contraluz do eclipse: do âmbar fundo ao ouro quase branco na beira (v 0..1)."""
    v = np.clip(v, 0, 1)[..., None]
    g = mix(GOLD0, GOLD1, sstep(0.0, 0.35, v))
    g = mix(g, GOLD2, sstep(0.3, 0.75, v))
    return mix(g, GOLD3, sstep(0.8, 1.0, v) * 0.55)


def masonry(X, Y, y0, ch, bl, key):
    """Fiadas de pedra numa parede lisa (altura ch, pedras de bl): o tom de cada pedra com a junta escura."""
    r = (Y - y0) / ch
    ri = np.floor(r).astype(np.int64)
    t = (X + RT[(ri * 7 + key * 3) % 4096] * bl + (ri % 2) * bl * 0.5) / bl
    bi = np.floor(t).astype(np.int64)
    fb, fr = t - bi, r - ri
    dj = np.minimum(np.minimum(fb, 1 - fb) * bl, np.minimum(fr, 1 - fr) * ch)
    tone = 1 + (RT[(bi * 31 + ri * 17 + key * 5) % 4096] - 0.5) * 0.14
    return tone * (1 - 0.22 * sstep(0.75, 0.2, dj))


def masonry_round(u, Y, y0, ch, hw, key):
    """Fiadas numa torre redonda (u de -1 a 1 através da largura): as pedras apertam perto das beiras."""
    nb = max(8, int(round(2 * math.pi * hw / 8.5)))
    r = (Y - y0) / ch
    ri = np.floor(r).astype(np.int64)
    t = np.arcsin(u) / (2 * math.pi) * nb + (ri % 2) * 0.5 + RT[(ri * 7 + key * 3) % 4096]
    bi = np.floor(t).astype(np.int64)
    fb, fr = t - bi, r - ri
    wj = 2 * math.pi * hw / nb * np.sqrt(np.clip(1 - u * u, 0, 1))  # a largura da pedra vista de frente
    jv = sstep(0.75, 0.2, np.minimum(fb, 1 - fb) * wj) * sstep(1.5, 4.0, wj)
    jh = sstep(0.75, 0.2, np.minimum(fr, 1 - fr) * ch)
    tone = 1 + (RT[(bi * 31 + ri * 17 + key * 5) % 4096] - 0.5) * 0.14
    return tone * (1 - 0.22 * np.maximum(jv, jh))


def fill(lam):
    """Quanto a luz fria da tempestade clareia a pedra (lam = quanto o ponto olha para ela): o lado que
    olha fica com o dobro do brilho do lado de trás, e na média a pedra continua do tom de sempre."""
    return 0.58 + 0.83 * lam ** 1.5


def bristles(col, rng, k=0.07, cx=2.2, cy=15.0):
    """As marcas do pincel (riscos em pé, bem leves) e o grão da tinta por cima de uma área lisa."""
    h, w = col.shape[:2]
    return grain(col * (1 - k / 2 + k * snoise(h, w, cx, cy, rng, 2))[..., None], rng, 0.03)


# ======================================================================================
# céu com o eclipse
# ======================================================================================
def sky(plan, rng):
    """O céu de tempestade: as mesmas nuvens (o mesmo ruído) com fiapos na beira e pinceladas mais finas."""
    yy, xx = grid2(W3, H3)
    d_e = np.hypot(xx - EX, yy - EY)
    t = yy / H2
    n = plan['sky']['noise']
    assert [s['cell'] for s in n] == [170, 64], n
    cl, cl2 = vn3(n[0], W3, H3), vn3(n[1], W3, H3)
    fine = vnoise(H3, W3, 20, rng, 2)
    ref = mix(SL0, SL2, sstep(0.0, 0.85, t)[..., None])
    cloud = sstep(0.42, 0.72, cl * 0.75 + cl2 * 0.25 + 0.16 * (1 - t) + (fine - 0.5) * 0.06)
    ref = mix(ref, SL3, (cloud * 0.55)[..., None])
    ref = mix(ref, SL1, (sstep(0.55, 0.3, cl) * 0.5)[..., None])
    storm = np.exp(-(((xx - 520) / 420) ** 2 + ((yy - 150) / 240) ** 2))
    ref = mix(ref, STORM, (storm * cloud * 0.6)[..., None])
    cold_edge = np.clip(cloud - blur(cloud, 6 * K), 0, 1) * 4 * storm
    ref = mix(ref, hexc(0x9fb0d4), np.clip(cold_edge, 0, 1)[..., None] * 0.55)
    ref = mix(ref, GOLD0, (np.exp(-(d_e / 320) ** 2) * 0.75)[..., None])
    ref = mix(ref, GOLD1, (np.exp(-(d_e / 150) ** 2) * 0.8)[..., None])
    lit_edge = np.clip(cloud - blur(cloud, 7 * K), 0, 1) * 4 * np.exp(-(d_e / 400) ** 2)
    ref = mix(ref, GOLD2, np.clip(lit_edge, 0, 1)[..., None] * 0.8)
    flow = np.where(d_e < 340, np.arctan2(yy - EY, xx - EX) + math.pi / 2 + (cl2 - 0.5) * 0.6, -0.12 + (cl2 - 0.5) * 0.9)
    L = Layer(W3, H3)
    paint(L, ref, np.ones((H3, W3), np.float32), flow.astype(np.float32), rng,
          passes3(1.2, 0.25, 0.35, (0, 0.02, 0.04, 0.035), 1.5), val_jitter=0.05, base=1.0)
    print('  céu pintado', round(time_s(), 1), 's', flush=True)
    # os raios do eclipse: os mesmos do pintor antigo e, entre eles, fios mais finos
    for cx, cy, ang, ln, wd, col, al, tp in plan['sky']['rays']:
        L.stroke(cx * K, cy * K, ang, ln * K, wd * K, np.asarray(col, np.float32), al, rng, 0.4, 0.5, taper=tp)
    for _ in range(420):
        a = rng.uniform(0, 2 * math.pi)
        r0 = ER + rng.uniform(1.5, 8)
        ln = rng.uniform(14, 70) * (0.4 + rng.random())
        cx, cy = EX + math.cos(a) * (r0 + ln / 2), EY + math.sin(a) * (r0 + ln / 2)
        L.stroke(cx * K, cy * K, a, ln * K, rng.uniform(0.8, 1.7) * K, mix(GOLD1, GOLD3, rng.random() ** 1.5),
                 rng.uniform(0.12, 0.3), rng, 0.3, 0.4, taper=0.9)
    ring = sstep(ER + 5, ER + 1.5, d_e) * sstep(ER - 1, ER + 1.2, d_e)
    L.fill(GOLD3, ring * 0.95)
    L.fill(hexc(0x06070b), sstep(ER + 0.6, ER - 0.6, d_e))
    return L


def time_s():
    import time
    return time.time() - T0


# ======================================================================================
# montanhas, cidade alta e castelo de Vespera
# ======================================================================================
def mountains(plan, rng, yy, xx, d_e):
    """A serra: a mesma crista, com as encostas, um morro mais perto e a névoa no vale entre os dois."""
    n = plan['far']['noise']
    xs = np.arange(0, W2, 6, dtype=np.float64)
    rid = 440 + 70 * (n1_at(n[0], xs) - 0.5) - 0.02 * xs
    crest = np.interp(xx[0], xs, rid).astype(np.float32)
    depth = yy - crest[None, :]  # px abaixo da crista
    mf = aa(-depth)
    ref = mix(hexc(0x1a2238), FOG0, sstep(420, 600, yy)[..., None] * 0.8)
    ref = mix(ref, GOLD0, (np.exp(-(d_e / 460) ** 2) * 0.35)[..., None])
    under = np.clip(depth, 0, None)
    slope = vnoise(H3, W3, 30, rng, 3)
    ref = ref * (1 + (slope - 0.5) * 0.2 * np.exp(-under / 80))[..., None]
    hill = crest + 20 + 46 * vnoise(1, W3, 150, rng, 2)[0]
    dn = yy - hill[None, :]  # px abaixo da crista do morro da frente
    near = aa(-dn)
    ref = ref * (1 - 0.15 * near * np.exp(-np.clip(dn, 0, None) / 55))[..., None]
    ref = mix(ref, FOG0, ((1 - near) * np.exp(-np.clip(-dn, 0, None) / 16) * 0.16)[..., None])
    # a luz do céu pegando a crista
    ref = mix(ref, STORM, (np.exp(-under / 1.8) * 0.12)[..., None])
    flow = -0.5 + (vn3(n[1], W3, H3) - 0.5) * 0.8
    L = Layer(W3, H3)
    paint(L, ref, mf, flow.astype(np.float32), rng, passes3(0.8, 0.4, 0.45, (0, 0.02, 0.04, 0.04)), val_jitter=0.04, base=1.0)
    return L, mf


def town3(plan, rng):
    """A cidade alta: as mesmas casas, cada uma com o seu tom, o telhado, as janelas apagadas e as acesas
    no lugar de sempre; as torres dos sinos; a base some na névoa (não acaba mais numa linha reta)."""
    houses = PP.town(PP.gen(plan['far']['town']))
    sh = Sheet()
    n = len(houses)
    tv = 1 + (rng.random(n) - 0.5) * 0.16
    kind = rng.random(n)
    pres = rng.random(4096).astype(np.float32)
    for i in sorted(range(n), key=lambda k: houses[k]['top']):
        b = houses[i]
        x, wd, top = b['x'], b['w'], b['top']
        hi = top
        if b['roof']:
            hi = min(hi, b['roof'][1])
        if b['tower']:
            hi = min(hi, top - b['tower'][1] - b['tower'][2])
        w = Win(x - 14, hi - 6, x + wd + 14, 534)
        if not w.ok:
            continue
        X, Y = w.X, w.Y
        ex, ey, de = edir(X, Y)
        base = mix(hexc(0x242e48), hexc(0x3a4664), sstep(380, 540, Y)[..., None])
        base = mix(base, GOLD0, (np.exp(-(de / 520) ** 2) * 0.3)[..., None])
        warm = np.exp(-(de / 640) ** 2)  # quanto da contraluz do eclipse chega até aqui
        if b['tower']:
            # a torre do sino, atrás da casa: redonda, com o vão do sino e a agulha
            tx, th, sp = b['tower']
            u = np.clip((X - tx) / 6, -1, 1)
            nz = np.sqrt(1 - u * u)
            tone = tv[i] * (0.86 + 0.26 * np.clip(u * LF[0] + nz * LF[2], 0, 1))
            yb = top - th + 9
            bell = np.where(Y < yb, np.hypot(X - tx, (Y - yb) / 1.5) - 2.2, np.maximum(np.abs(X - tx) - 2.2, Y - (yb + 6)))
            tone = tone * (1 - 0.45 * aa(bell)) * (1 + 0.18 * aa(np.abs(Y - (top - th + 19)) - 0.7))
            col = mix(base * tone[..., None], GOLD1, (sstep(2.0, 0.3, tx + 6 - X) * warm * 0.4)[..., None])
            sh.put(w, col, aa(sd_box(X, Y, tx - 6, top - th, tx + 6, top + 2)), lit=np.clip(u * LZ[0] + nz * LZ[2], 0, 1))
            tri = [(tx - 9, top - th + 2), (tx, top - th - sp), (tx + 9, top - th + 2)]
            dl, dr, db = sd_edges(X, Y, tri)
            left = X < tx
            tone = tv[i] * np.where(left, 0.92, 0.8) * (1 - 0.1 * sstep(0.7, 0.97, ((Y - (top - th - sp)) / 3.0) % 1.0))
            col = mix(base * tone[..., None], GOLD1, (sstep(2.0, 0.3, -dr) * warm * 0.5)[..., None])
            sh.put(w, col, aa(np.maximum(np.maximum(dl, dr), db)), lit=np.where(left, 0.9, 0.15))
        # o corpo da casa: a sombra do beiral e as janelas apagadas em grade
        tone = tv[i] * 1.03 * (1 - 0.14 * np.exp(-np.clip(Y - top, 0, None) / 3.5))
        # (poucas e pequenas: de longe, na névoa, a casa é uma mancha com uma ou outra janela)
        nc = max(1, int((wd - 5) / 10.0))
        pw = wd / nc
        cu = (X - x) / pw
        ci = np.floor(cu).astype(np.int64)
        rv = (Y - (top + 8)) / 11.5
        rj = np.floor(rv).astype(np.int64)
        dwin = np.maximum(np.abs((cu - ci - 0.5) * pw) - 1.0, np.abs((rv - rj) * 11.5 - 3.4) - 1.8)
        dark = (pres[(ci * 37 + rj * 101 + i * 53) % 4096] < 0.34) & (rj >= 0) & (Y < 506)
        tone = tone * (1 - 0.2 * aa(dwin) * dark)
        col = base * tone[..., None]
        if not b['roof']:
            # terraço: a luz do céu no alto da parede
            col = mix(col, STORM, (sstep(1.3, 0.2, Y - top) * (Y >= top - 0.5) * 0.3)[..., None])
        sh.put(w, col, aa(sd_box(X, Y, x, top, x + wd, 545)), lit=0.5)
        if b['roof']:
            ax, ay = b['roof']
            dl, dr, db = sd_edges(X, Y, [(x - 2, top + 1), (ax, ay), (x + wd + 2, top + 1)])
            left = X < ax
            if kind[i] < 0.5:
                # telhado de quatro águas: as duas que se veem, com as fiadas de telha
                tone = tv[i] * np.where(left, 0.97, 0.85) * (1 - 0.12 * sstep(0.7, 0.97, ((Y - ay) / 3.0) % 1.0))
                lit = np.where(left, 0.85, 0.2)
            else:
                # empena: a parede sobe em triângulo e o beiral escuro acompanha as duas águas
                tone = tv[i] * 1.02 * (1 - 0.3 * sstep(2.4, 0.9, np.minimum(-dl, -dr)))
                lit = 0.5
            col = mix(base * tone[..., None], GOLD1, (sstep(2.0, 0.3, -dr) * warm * 0.45)[..., None])
            sh.put(w, col, aa(np.maximum(np.maximum(dl, dr), db)), lit=lit)
    # as janelas acesas, onde o pintor antigo pôs
    for cx, cy, ang, ln, wd, col, al, tp in plan['far']['town_wins']:
        w = Win(cx - 14, cy - 14, cx + 14, cy + 14)
        if not w.ok:
            continue
        X, Y = w.X, w.Y
        A = sh.a[w.sl]
        g = np.exp(-(np.hypot(X - cx, Y - cy) / 4.6) ** 2) * 0.09
        sh.col[w.sl] += WIN0 * (g * A)[..., None]
        d = np.maximum(np.abs(X - cx) - wd / 2, np.abs(Y - cy) - ln / 2)
        put(sh.col[w.sl], sh.a[w.sl], np.asarray(col, np.float32), aa(d) * 0.9 * (A > 0.6))
    yy = grid2(1, H3)[0]
    sh.a *= sstep(530, 500, yy)
    sh.col[:] = bristles(sh.col, rng, 0.06)
    return sh


def stone_base(X, Y, far=0.0):
    """A pedra do castelo na contraluz: quase preta, com o ar da tempestade (e o clarão do eclipse) na
    frente das torres mais distantes e a névoa subindo no pé delas."""
    base = mix(C0, C1, sstep(330, 520, Y)[..., None])
    de = np.hypot(X - EX, Y - EY)
    air = mix(hexc(0x2a3350), GOLD0 * 0.85, np.exp(-(de / 300) ** 2)[..., None])
    k = far * 0.14 + sstep(340, 400, Y) * 0.10 * (0.5 + far)
    return mix(base, air, k[..., None])


def round_body(sh, w, cx, hw, y0, y1, key, far, eave=None):
    """O corpo redondo de uma torre: a luz fria de um lado, as fiadas de pedra e a meia-lua da contraluz."""
    X, Y = w.X, w.Y
    u = np.clip((X - cx) / hw, -1, 1)
    nz = np.sqrt(1 - u * u)
    stone = masonry_round(u, Y, y0, 4.6, hw, key)
    tone = fill(np.clip(u * LF[0] + nz * LF[2], 0, 1)) * stone * 1.08
    if eave is not None:
        tone = tone * (1 - 0.34 * sstep(eave + 8, eave, Y))
    ex, ey, _ = edir(X, Y)
    cres = np.clip(u * ex * CB - nz * LB, 0, 1) / CB
    lit = np.clip(u * LZ[0] + nz * LZ[2], 0, 1)
    sh.put(w, stone_base(X, Y, far) * tone[..., None], aa(sd_box(X, Y, cx - hw, y0, cx + hw, y1)), tex=stone, lit=lit, cres=cres)


def cone(sh, w, cx, hwr, ya, yb, key, far):
    """Telhado em cone, de ardósia: as fiadas com a sombra de cada uma, a luz fria e a contraluz na beira."""
    X, Y = w.X, w.Y
    t = np.clip((Y - ya) / (yb - ya), 0, 1)
    wr = np.maximum(hwr * t, 0.35)
    u = np.clip((X - cx) / wr, -1, 1)
    nzr = np.sqrt(1 - u * u)
    sl = math.hypot(hwr, yb - ya)
    sa, ca = hwr / sl, (yb - ya) / sl
    nx, ny, nz = u * ca, -sa, nzr * ca
    lam = np.clip(nx * LF[0] + ny * LF[1] + nz * LF[2], 0, 1)
    r = (Y - ya) / 3.3
    ri = np.floor(r).astype(np.int64)
    ns = np.maximum(3, np.round(wr * 2 * math.pi / 5.0))  # quantas ardósias dão a volta nesta altura
    ts = np.arcsin(u) / (2 * math.pi) * ns + (ri % 2) * 0.5
    si = np.floor(ts).astype(np.int64)
    fs = ts - si
    vj = sstep(0.12, 0.03, np.minimum(fs, 1 - fs)) * sstep(1.2, 3.0, wr * nzr)
    slate = (1 + (RT[(si * 13 + ri * 29 + key * 11) % 4096] - 0.5) * 0.2) * (1 - 0.26 * sstep(0.7, 0.97, r - ri)) * (1 - 0.12 * vj)
    col = stone_base(X, Y, far) * (0.97 * fill(lam) * slate)[..., None]
    col = col + FLASH * (lam ** 8 * 0.05)[..., None]  # a ardósia molhada
    ex, ey, _ = edir(X, Y)
    cres = np.clip((nx * ex + ny * ey) * CB - nz * LB, 0, 1) / CB
    lit = np.clip(nx * LZ[0] + ny * LZ[1] + nz * LZ[2], 0, 1)
    sh.put(w, col, aa(sd_poly(X, Y, [(cx - hwr, yb), (cx, ya), (cx + hwr, yb)])), tex=slate, lit=lit, cres=cres)


def tower(sh, i, x, hw, top, rh):
    """Uma torre do castelo: o corpo redondo, o cone e, nas mais largas, as duas guaritas no alto."""
    far = float(np.clip((24 - hw) / 14, 0, 1))  # as mais finas ficam mais longe
    w = Win(x - hw - 12, top - rh - 6, x + hw + 12, 466)
    if not w.ok:
        return
    # (o corpo acaba atrás da muralha, um pouco acima do pé dela: não aparece nada da torre por baixo)
    round_body(sh, w, x, hw, top, 464, i, far, eave=top + 2)
    # seteiras escuras no corpo, na parte que aparece por cima da muralha
    r = np.random.default_rng(700 + i)
    for k in range(int(max(0, (386 - top - 14) // 24))):
        sy_ = top + 16 + k * 24 + r.uniform(-4, 4)
        sx_ = x + r.uniform(-0.5, 0.5) * hw
        slit = aa(np.maximum(np.abs(w.X - sx_) - 0.6, np.abs(w.Y - sy_) - 3.0))
        sh.col[w.sl] *= (1 - 0.5 * slit)[..., None]
    cone(sh, w, x, hw + 3, top - rh, top + 2, i, far)
    if hw > 16:
        for sx in (-1, 1):
            tx = x + sx * (hw - 3)
            round_body(sh, w, tx, 4, top - 14, top + 6, 40 + i * 2 + (sx > 0), far, eave=top - 12)
            cone(sh, w, tx, 6, top - 34, top - 12, 40 + i * 2 + (sx > 0), far)


def cliff(sh, rng):
    """O penhasco debaixo do castelo: rocha em colunas em pé, com fendas; a subida da esquerda em degraus de
    pedra (cada degrau pega a contraluz em cima) e a face de baixo em lances, como pedra empilhada."""
    w = Win(1316, 428, W2 + 2, H2 + 2)
    X, Y = w.X, w.Y
    h, wd = X.shape
    pts = [(1330, H2 + 5), (1350, 520), (1392, 478), (1440, 462), (1520, 452), (2210, 440), (2210, H2 + 5)]
    rough = (value_noise(h, wd, 9 * K, rng, 2) - 0.5) * 3.2
    # os degraus: a beira anda em lances retos, de altura desigual (acabam antes do canto da muralha, que assenta em rocha lisa)
    t = (520 - Y) / 13.0 + 2.4 * vnoise(h, 1, 34, rng, 2)
    ti = np.floor(t)
    saw = t - ti - 0.5
    amp = 13.0 * (0.25 + 0.75 * sstep(566, 522, Y)) * (0.55 + 0.9 * RT[(ti.astype(np.int64) * 7 + 3) % 4096]) * sstep(1392, 1372, X)
    d = sd_poly(X + saw * amp, Y, pts) + rough * sstep(1520, 1400, X)
    # a rocha: colunas em pé, cada uma com o seu tom e a luz fria no canto esquerdo, cortadas por juntas
    wobx = (snoise(h, wd, 30, 50, rng, 2) - 0.5) * 9
    woby = (snoise(h, wd, 44, 20, rng, 2) - 0.5) * 16
    joint = masonry(Y + woby, X + wobx, 1300.0, 10.5, 38.0, 77)
    cu = (X + wobx - 1300.0) / 10.5
    ci = np.floor(cu).astype(np.int64)
    colt = (1 + (RT[(ci * 19 + 5) % 4096] - 0.5) * 0.24) * (1 + 0.14 * sstep(0.28, 0.06, cu - ci))
    tone = (0.86 + 0.3 * snoise(h, wd, 7, 60, rng, 2)) * joint * colt * (0.94 + 0.12 * snoise(h, wd, 46, 7, rng, 2))
    sh.put(w, stone_base(X, Y, 0.0) * tone[..., None], aa(d), tex=tone, lit=0.3 + 0.4 * np.clip(tone, 0, 1.5))


def wall(sh, x0, y0, x1, y1, key, merlons, rng):
    """Um corpo do castelo, na frente das torres: as fiadas, a chuva escorrida, o pé assentado na rocha e,
    no principal, as ameias com o cordão debaixo delas."""
    w = Win(x0 - 3, y0 - 14, x1 + 3, y1 + 8)
    X, Y = w.X, w.Y
    h, wd = X.shape
    # (na ponta esquerda o penhasco desce: a muralha vai até ele, sem deixar um vão debaixo do canto)
    foot = y1 - 4 + 7 * (value_noise(1, wd, 30 * K, rng, 2)[0] - 0.5) + 18 * sstep(1440, 1396, X[0])
    d = np.maximum(sd_box(X, Y, x0, y0, x1, y1 + 30), Y - foot[None, :])
    top = np.full(X.shape, float(y0), np.float32)
    if merlons:
        fx = (X - 1497.0) % 14.0
        dm = np.maximum(np.abs(fx - 3.5) - 3.5, np.maximum(384.0 - Y, Y - 396.0))
        d = np.minimum(d, np.where(X >= 1496.0, dm, 99.0))
        top = np.where((fx <= 7.0) & (X >= 1497.0), 384.0, top)
    stone = masonry(X, Y, y0 - 8, 5.2, 12.5, key)
    # as manchas largas do tempo e o pé úmido, mais escuro
    stone = stone * (0.92 + 0.16 * value_noise(h, wd, 34 * K, rng, 2)) * (1 - 0.16 * sstep(y1 - 18, y1 - 3, Y))
    tone = fill(float(LF[2])) * 0.98 * stone
    # o cordão: uma fiada saliente, com a luz em cima e a sombra embaixo
    yc = y0 + (8.0 if merlons else 5.0)
    tone = tone * (1 + 0.45 * aa(np.abs(Y - yc) - 0.7)) * (1 - 0.28 * sstep(yc + 5, yc + 0.7, Y) * (Y > yc + 0.7))
    # os contrafortes: pilastras do cordão até o pé, com a luz fria no canto esquerdo, o chanfro aceso em
    # cima e a sombra que cada um joga na parede à direita; entre um e outro, uma seteira
    xs = []
    bx = x0 + rng.uniform(16, 30)
    while bx < x1 - 12:
        xs.append(bx)
        bx += rng.uniform(50, 74)
    yb = yc + 6.5
    for j, b in enumerate(xs):
        dxb = X - b
        inb = aa(np.maximum(np.abs(dxb) - 3.2, yb - Y))
        tone = tone * (1 + inb * (0.10 + 0.22 * sstep(-1.9, -3.1, dxb) + 0.2 * sstep(yb + 1.6, yb + 0.3, Y)))
        tone = tone * (1 - 0.3 * sstep(8.5, 3.4, dxb) * (dxb > 3.2) * (Y > yb + 2))
        nxt = xs[j + 1] if j + 1 < len(xs) else x1
        if nxt - b > 30 and rng.random() < 0.8:
            sx_, sy_ = (b + nxt) / 2 + rng.uniform(-5, 5), yc + 16 + rng.uniform(-2, 2)
            tone = tone * (1 - 0.55 * aa(np.maximum(np.abs(X - sx_) - 0.65, np.abs(Y - sy_) - 3.4)))
    streak = snoise(h, wd, 5, 60, rng, 2)
    tone = tone * (1 - 0.2 * sstep(0.5, 0.82, streak) * sstep(y1, y0, Y))
    col = stone_base(X, Y, 0.0) * tone[..., None]
    # a luz do céu no que olha para cima: o alto das ameias e o peitoril entre elas
    topl = sstep(1.4, 0.2, Y - top) * (Y >= top - 0.5)
    col = mix(col, STORM, (topl * 0.3)[..., None])
    sh.put(w, col, aa(d), tex=stone, lit=0.45 + 0.5 * topl)


def lancet(sh, cx, cy, ln, wd, col, glow=0.11):
    """Uma janela acesa em arco, com o clarão na pedra em volta (as mais largas com o pinázio no meio)."""
    hw = wd / 2
    w = Win(cx - 16, cy - ln / 2 - 16, cx + 16, cy + ln / 2 + 16)
    if not w.ok:
        return
    X, Y = w.X, w.Y
    A = sh.a[w.sl]
    ys = cy - ln / 2 + hw * 1.5  # onde o arco nasce
    d = np.where(Y < ys, np.hypot(X - cx, (Y - ys) / 1.5) - hw, np.maximum(np.abs(X - cx) - hw, Y - (cy + ln / 2)))
    c = mix(np.asarray(col, np.float32), WIN1 * 1.05, (np.clip(1 - np.abs(X - cx) / hw, 0, 1) * 0.45)[..., None])
    if wd >= 2.8:
        c = c * (1 - 0.6 * aa(np.abs(X - cx) - 0.26))[..., None]
    g = np.exp(-(np.hypot(X - cx, (Y - cy) * 0.85) / 5.4) ** 2) * glow
    sh.col[w.sl] += WIN0 * (g * A)[..., None]
    put(sh.col[w.sl], sh.a[w.sl], np.clip(c, 0, 1), aa(d) * 0.96 * (A > 0.6))


def castle3(plan, rng):
    """O castelo de Vespera: o penhasco, as quinze torres, os dois corpos na frente, a contraluz e as janelas."""
    sh = Sheet()
    cliff(sh, rng)
    for i, (x, hw, top, rh) in enumerate(TOWERS):
        tower(sh, i, x, hw, top, rh)
    wall(sh, 1390, 420, 1500, 472, 201, False, rng)
    wall(sh, 1495, 392, W2 + 12, 472, 202, True, rng)
    sh.col[:] = bristles(sh.col, rng, 0.12)
    # a contraluz: a beira de tudo que olha para o eclipse e a meia-lua dos volumes redondos; perto do
    # eclipse ela é ouro claro, longe vai sumindo
    yy, xx = grid2(W3, H3)
    ex, ey, de = edir(xx, yy)
    fall = np.clip(np.exp(-(de / 560) ** 2) * 1.6, 0, 1)
    # (a beira acesa entra uns 5 px na forma, como no pintor antigo, que acendia 3 px do 2x)
    edge = edge_rim(sh.a, ex, ey, (1.0, 2.0, 3.0, 4.0, 5.2, 6.6), (0.22, 0.22, 0.2, 0.16, 0.12, 0.08))
    wide = edge_rim(sh.a, ex, ey, (3.0, 6.0, 9.0, 12.0, 16.0), (0.3, 0.25, 0.2, 0.15, 0.1))
    v = np.maximum(np.maximum(edge, sh.cres * 0.9), wide * 0.42) * fall * np.clip(sh.tex, 0.6, 1.1)
    sh.col[:] = mix(sh.col, gold(v), np.clip(v * 1.25, 0, 1)[..., None])
    for cx, cy, ang, ln, wd, col, al, tp in plan['far']['castle_wins']:
        lancet(sh, cx, cy, ln, wd, col)
    return sh


def far(plan, seed):
    """bridge-far e bridge-far-rim."""
    n = plan['far']['noise']
    assert [(s['fn'], s['cell']) for s in n] == [('noise1d', 260), ('value_noise', 50), ('value_noise', 30), ('value_noise', 80)], n
    yy, xx = grid2(W3, H3)
    d_e = np.hypot(xx - EX, yy - EY)
    out, mf = mountains(plan, np.random.default_rng(seed), yy, xx, d_e)
    print('  montanhas', round(time_s(), 1), 's', flush=True)
    tw = town3(plan, np.random.default_rng(seed + 1))
    out.over(as_layer(tw.col, tw.a))
    print('  cidade alta', round(time_s(), 1), 's', flush=True)
    cs = castle3(plan, np.random.default_rng(seed + 2))
    out.over(as_layer(np.clip(cs.col, 0, 1), cs.a))
    print('  castelo', round(time_s(), 1), 's', flush=True)
    # a névoa na base do castelo e do penhasco (o mesmo ruído), com fiapos
    rng = np.random.default_rng(seed + 3)
    solid = out.A > 0.01
    mist = Layer(W3, H3)
    band = np.exp(-((yy - 480) / 40) ** 2) * (0.4 + 0.6 * vn3(n[3], W3, H3)) * (0.9 + 0.2 * vnoise(H3, W3, 26, rng, 2))
    mist.fill(FOG1, band * 0.55)
    mist.fill(FOG0, sstep(500, 700, yy) * 0.8 * solid)
    out.over(mist)
    # o relâmpago: a luz fria de cima e da esquerda no lado de cada volume que olha para ela e nas beiras
    solid = np.clip(cs.a + tw.a, 0, 1)
    lit = cs.lit * cs.a + tw.lit * tw.a * (1 - cs.a)
    body = Layer(W3, H3)
    body.fill(FLASH, solid * 0.14 * (0.55 + 0.9 * lit))
    body.fill(FLASH, mf * sstep(700, 420, yy) * 0.1)
    rim = Layer(W3, H3)
    rim.fill(COLD, np.clip(edge_rim(cs.a, -0.707, -0.707) * 1.3, 0, 1) * 0.3)
    body.over(rim)
    return out, body


# ======================================================================================
# abismo: névoa, o aqueduto lá embaixo e as luzes da cidade (repete na horizontal)
# ======================================================================================
def aqueduct(yy, xx, rng):
    """O aqueduto: o tabuleiro com a cornija, o parapeito de balaústres, os arcos com as aduelas, os
    pilares em fiadas e a contraluz dourada no lado de cada vão que olha para o eclipse. Devolve (cor, alfa)."""
    D0, D1, SPAN, R, YS, RING = 580.0, 600.0, 256.0, 106.0, 712.0, 9.0
    xh = (xx % SPAN) - SPAN / 2  # do meio do vão mais perto
    cell = np.floor(xx / SPAN).astype(np.int64)
    up = yy < YS
    dh = np.where(up, np.hypot(xh, yy - YS) - R, np.abs(xh) - R)  # para fora do vão (negativa dentro)
    a_low = aa(D1 - 1 - yy) * (1 - aa(dh))
    a_deck = aa(np.maximum(D0 - yy, yy - D1))
    p = 2048.0 / 171  # os balaústres, num passo que fecha na largura que repete
    fx = (xx % p) - p / 2
    v = np.clip((yy - 575.0) / 5.0, 0, 1)
    hwb = 0.75 + 0.55 * np.sin(math.pi * v)
    a_par = np.maximum(aa(np.maximum(572.0 - yy, yy - 575.0)), aa(np.maximum(np.abs(fx) - hwb, np.maximum(574.0 - yy, yy - 580.5))))
    a = np.maximum(np.maximum(a_low, a_deck), a_par)
    # a pedra: fiadas nos tímpanos e nos pilares, pedras compridas no tabuleiro, aduelas em volta do vão
    tone = masonry(xx, yy, D1, 7.0, 2048.0 / 108, 41)
    ring = aa(-dh) * aa(dh - RING) * up
    th = np.clip(np.arctan2(YS - yy, xh) / math.pi, 0, 1) * 23
    ia = np.floor(th).astype(np.int64)
    dj = np.minimum(np.minimum(th - ia, 1 - (th - ia)) * (math.pi * (R + RING / 2) / 23), RING - dh)
    vous = 1.10 * (1 + (RT[(ia * 131 + cell * 977) % 4096] - 0.5) * 0.16) * (1 - 0.3 * sstep(0.75, 0.2, dj)) * (1 + 0.08 * (ia == 11))
    tone = tone * (1 - ring) + vous * ring
    # a imposta: a fiada saliente onde o arco nasce, com a sombra embaixo
    pier = np.abs(xh) >= R
    tone = tone * (1 + 0.12 * aa(np.maximum(YS - yy, yy - (YS + 4))) * pier) * (1 - 0.16 * sstep(YS + 8, YS + 4, yy) * (yy > YS + 4) * pier)
    deck = masonry(xx, yy, D0, 10.0, 2048.0 / 60, 43) * (1 + 0.22 * sstep(1.6, 0.3, yy - D0)) * (1 - 0.2 * aa(np.abs(yy - (D0 + 4)) - 0.7))
    tone = tone * (1 - a_deck) + deck * a_deck
    par = 1.0 + 0.2 * sstep(1.2, 0.2, yy - 572.0)
    in_par = (yy < D0).astype(np.float32)
    tone = tone * (1 - in_par) + par * in_par
    col = mix(hexc(0x141a2a), hexc(0x1e2638), sstep(560, 700, yy)[..., None]) * tone[..., None]
    # a contraluz: o lado esquerdo de cada vão (o pilar e a subida do arco) e a direita de cada balaústre
    face = np.where(up, np.clip(-xh / R, 0, 1) ** 0.6, 1.0) * (xh < 0)
    rim = sstep(3.4, 0.3, dh) * (dh >= 0) * face * np.clip(tone, 0.7, 1.1)
    rim = np.maximum(rim, sstep(1.1, 0.1, hwb - fx) * (fx > 0) * (yy > 575.0) * (yy < D0))
    col = mix(col, GOLD1, (np.clip(rim, 0, 1) * 0.5)[..., None])
    col = bristles(col, rng, 0.06, 15.0, 2.2)
    # os pilares somem na névoa
    fogv = sstep(610, 800, yy)[..., None] * 0.85
    return col * (1 - fogv) + FOG0 * fogv, a


def mid(plan, seed):
    """bridge-mid e bridge-mid-rim."""
    TW, PAD, HM = 2048, 256, 840
    w3, h3 = int((TW + PAD) * K), int(HM * K)
    n = plan['mid']['noise']
    assert [(s['fn'], s['cell']) for s in n] == [('noise1d', 300), ('value_noise', 90), ('value_noise', 90), ('value_noise', 40), ('value_noise', 110)], n
    rng = np.random.default_rng(seed)
    yy, xx = grid2(w3, h3)
    out = Layer(w3, h3)
    # corpo de névoa: começa leve acima da linha da ponte e escurece lá no fundo
    top = 470 + 24 * (n1_at(n[0], xx[0] - 0.5) - 0.5)
    a = sstep(top[None, :] - 10, top[None, :] + 44, yy)
    ref = mix(FOG1, FOG0, sstep(520, 640, yy)[..., None])
    ref = mix(ref, hexc(0x0b0f1a), sstep(640, 840, yy)[..., None])
    ref = mix(ref, FOG2, (np.exp(-((yy - 520) / 18) ** 2) * 0.35 * vn3(n[1], w3, h3))[..., None])
    flow = -0.04 + (vn3(n[2], w3, h3) - 0.5) * 0.4
    L = Layer(w3, h3)
    paint(L, ref, a, flow.astype(np.float32), rng, passes3(1.0, 0.35, 0.35, (0, 0.02, 0.035, 0.035), 1.8),
          val_jitter=0.04, clip_soft=4 * K, base=1.0)
    L.multiply_alpha(np.clip(a, 0, 1))
    print('  névoa pintada', round(time_s(), 1), 's', flush=True)
    # luzes da cidade lá embaixo: as de sempre e, mais fundo, outras bem pequenas
    for _ in range(260):
        x, y = rng.uniform(0, TW + PAD), 700 + 125 * rng.random() ** 0.7
        L.dab(x * K, y * K, rng.uniform(0.55, 1.1) * K, mix(WIN0, WIN1, rng.random()), rng.uniform(0.14, 0.38), 0.9)
    for (x, y, r, col, al, soft), (hx, hy, hr, hcol, hal, hsoft) in zip(plan['mid']['lights'], plan['mid']['halos']):
        L.dab(x * K, y * K, r * K, np.asarray(col, np.float32), al, soft * K)
        L.dab(x * K, y * K, r * K * 0.45, WIN1, al * 0.7, 0.8)
        L.dab(hx * K, hy * K, hr * K, np.asarray(hcol, np.float32), hal, hsoft * K)
    out.over(L)
    col, aq = aqueduct(yy, xx, rng)
    out.over(as_layer(np.clip(col, 0, 1), aq))
    print('  aqueduto', round(time_s(), 1), 's', flush=True)
    # véu de névoa na frente do aqueduto
    veil = Layer(w3, h3)
    veil.fill(FOG1, np.exp(-((yy - 640) / 34) ** 2) * (0.35 + 0.65 * vn3(n[4], w3, h3)) * 0.6)
    out.over(veil)
    # relâmpago: o alto do parapeito e do tabuleiro e a névoa acesos
    rim = Layer(w3, h3)
    rim.fill(COLD, np.clip(edge_rim(aq, 0.0, -1.0) * 1.3, 0, 1) * 0.4)
    rim.fill(FLASH, np.clip(a, 0, 1) * np.exp(-((yy - 560) / 60) ** 2) * 0.25)
    return seamless(out, int(TW * K), int(PAD * K)), seamless(rim, int(TW * K), int(PAD * K))


# ======================================================================================
# tela de título: o recorte do céu e do castelo, a névoa do abismo e o penhasco do cavaleiro
# ======================================================================================
TX0, TY0, TW2, TH2 = 700, 20, 1280, 720  # o recorte no 2x (titulo.py)
TW3, TH3 = 1920, 1080


def title_cliff(plan, rng):
    """O penhasco da frente com a árvore seca: a mesma forma (a árvore sai do mesmo sorteio), a rocha em
    camadas com trincas, a luz fria molhada em cima, a contraluz dourada na beira direita e o capim."""
    n = plan['title']['noise']
    assert [s['cell'] for s in n] == [10, 40], n
    yy, xx = grid2(TW3, TH3)
    m = Mask(TW3, TH3)
    top = 598
    pts = [(-10, TH2 + 5), (-10, 548), (30, 556), (70, 574), (110, top), (180, top - 2), (260, top), (330, top + 1), (352, top + 6),
           (370, 622), (384, 660), (378, 700), (392, TH2 + 5)]
    m.poly([(x * K, y * K) for x, y in pts])
    r61 = np.random.default_rng(61)

    def branch(x, y, ang, ln, w, depth):
        ex, ey = x + math.cos(ang) * ln, y + math.sin(ang) * ln
        mx = (x + ex) / 2 + r61.normal(0, 3)
        my = (y + ey) / 2 + r61.normal(0, 3)
        m.line([(x * K, y * K), (mx * K, my * K), (ex * K, ey * K)], w * K)
        if depth > 0:
            for _ in range(2):
                na = ang + r61.normal(0, 0.5)
                nl = ln * r61.uniform(0.55, 0.75)
                branch(ex, ey, na, nl, max(1.5, w * 0.62), depth - 1)

    m.line([(44 * K, 566 * K), (50 * K, 470 * K), (40 * K, 380 * K)], 12 * K)
    branch(40, 384, -math.pi / 2 - 0.4, 90, 9, 4)
    branch(48, 440, -math.pi / 2 + 0.7, 80, 6, 3)
    assert r61.bit_generator.state == n[0]['state'], 'a árvore seca do título não saiu do mesmo sorteio'
    mm = m.array()
    M = mm > 0.5
    iy, ix = np.mgrid[0:TH3, 0:TW3].astype(np.float32)
    # distância (px do 2x) até o vazio por cima e pela direita
    dtop = (iy - np.maximum.accumulate(np.where(~M, iy, -1e6), axis=0)) / K
    dright = (np.minimum.accumulate(np.where(~M, ix, 1e6)[:, ::-1], axis=1)[:, ::-1] - ix) / K
    fine = vn3(n[0], TW3, TH3)
    rock = (yy > 540) & (xx > 20)  # (a árvore fica com a casca lisa)
    strata = 0.88 + 0.24 * snoise(TH3, TW3, 70, 7, rng, 2)
    crk = np.zeros((TH3, TW3), np.float32)
    crk[TH3 - 400:, :640] = cracks(400, 640, rng, n=11, length=(40, 170), width=1.3)
    col = hexc(0x161b28) * (0.8 + 0.4 * fine)[..., None]
    col = col * np.where(rock, strata * (1 - 0.4 * crk), 1.0)[..., None]
    wet = 0.62 + 0.38 * vnoise(TH3, TW3, 6, rng, 2)
    col = mix(col, hexc(0x3c4864), (np.exp(-dtop / 14) * 0.7)[..., None])
    col = mix(col, hexc(0xb7c6de), (sstep(3, 0.4, dtop) * 0.7 * wet / 0.81)[..., None])
    col = mix(col, hexc(0xe7a957), (np.exp(-dright / 3) * 0.6)[..., None])
    col = mix(col, hexc(0x080a10), sstep(620, 720, yy)[..., None] * 0.6)
    col = np.clip(col, 0, 1)
    L = Layer(TW3, TH3)
    L.fill(col, mm)
    passes = [dict(size=9 * K, spacing=0.9, length=(1.6, 3.6), err=0.0, alpha=0.5, bristle=0.55, dry=0.45, blur=0.12, taper=0.35, ang_jitter=0.3),
              dict(size=4.5 * K, spacing=0.95, length=(1.6, 3.2), err=0.0, alpha=0.55, bristle=0.5, dry=0.4, blur=0.06, taper=0.4, ang_jitter=0.3),
              dict(size=2.4 * K, spacing=1.0, length=(1.6, 3.0), err=0.02, alpha=0.6, bristle=0.4, dry=0.3, blur=0.04, taper=0.4, ang_jitter=0.3)]
    paint(L, col, mm, ((vn3(n[1], TW3, TH3) - 0.5) * 0.8).astype(np.float32), rng, passes, val_jitter=0.1, clip_soft=0, base=0.0)
    # capim seco e molhado em cima: os fios de sempre e outros mais finos no meio. A cor é a que o jogo
    # mostra na tela de título (a paleta do tema tirou o verde: cinza azulado, com fios pardos e claros)
    def dry(u, v):
        tip = hexc(0x2c3645) if v < 0.45 else (hexc(0x3f3739) if v < 0.75 else hexc(0x434450))
        return mix(hexc(0x242c3b), tip, u)

    for _ in range(240):
        x = rng.uniform(60, 350)
        y = top + rng.uniform(0, 4)
        ln = rng.uniform(5, 16)
        ang = -math.pi / 2 + rng.normal(0, 0.35)
        c = dry(rng.random() ** 0.7, rng.random())
        if rng.random() < 0.2:
            c = mix(c, hexc(0xb7c6de), 0.25)  # a gota na ponta do fio
        L.stroke((x + math.cos(ang) * ln / 2) * K, (y + math.sin(ang) * ln / 2) * K, ang, ln * K, rng.uniform(0.6, 1.1) * K, c, 0.8, rng, 0.2, 0.1, taper=0.9)
    for cx, cy, ang, ln, wd, c, al, tp in plan['title']['grass']:
        u = float(np.clip((c[1] * 255 - 0x2a) / (0x6a - 0x2a), 0, 1))  # quanto do verde claro o fio antigo tinha
        L.stroke(cx * K, cy * K, ang, ln * K, wd * K, dry(u, (cx * 0.618) % 1.0), al, rng, 0.2, 0.1, taper=tp)
    rim = Layer(TW3, TH3)
    edge = M & ~np.roll(M, int(4 * K), axis=0)
    rim.fill(COLD, np.clip(blur(edge.astype(np.float32), 1.5 * K) * 1.3, 0, 1) * 0.4)
    return L, rim


def title(plan, seed):
    """title-sky, title-land e title-rim, a partir do céu e do castelo já pintados em 3x."""
    box = (int(TX0 * K), int(TY0 * K), int(TX0 * K) + TW3, int(TY0 * K) + TH3)

    def load(name):
        return Image.open(os.path.join(OUT, name + '.png')).convert('RGBA').crop(box)

    sk = np.asarray(load('bridge-sky').convert('RGB'), np.float32) * np.array([0.962, 0.974, 0.984], np.float32)
    img = Image.fromarray(np.clip(sk + 0.5, 0, 255).astype(np.uint8))
    img.save(os.path.join(OUT, 'title-sky.png'))
    print('title-sky', img.size, round(time_s(), 1), 's', flush=True)
    land = img_layer(load('bridge-far'))
    # abismo: névoa escura subindo do fundo entre o penhasco e o castelo
    yy = grid2(TW3, TH3)[0]
    fog = Layer(TW3, TH3)
    fog.fill(hexc(0x2b3550), sstep(470, 640, yy) * 0.85)
    fog.fill(hexc(0x0b0f1a), sstep(600, 720, yy) * 0.7)
    land.over(fog)
    c, crim = title_cliff(plan, np.random.default_rng(seed))
    land.over(c)
    save(land, 'title-land', opaque=False)
    rim = img_layer(load('bridge-far-rim'))
    rim.over(crim)
    save(rim, 'title-rim', opaque=False)


# ======================================================================================
# conferência
# ======================================================================================
def check(plan):
    """A leitura dos ruídos anotados bate com a do pintor antigo (lida no 2x)?"""
    worst = 0.0
    for part in ('sky', 'far', 'mid', 'title'):
        for s in plan[part]['noise']:
            if s['fn'] == 'value_noise':
                old = value_noise(s['H'], s['W'], s['cell'], PP.gen(s['state']), s['octaves'])
                new = vn3(s, s['W'], s['H'], 1.0)
            else:
                old = noise1d(s['n'], s['cell'], PP.gen(s['state']), s['octaves'])
                new = n1_at(s, np.arange(s['n']))
            d = float(np.abs(old - new).max())
            worst = max(worst, d)
            print(part, s['fn'], s['cell'], 'diferença máxima %.6f' % d, flush=True)
    assert worst < 2e-3, worst
    print('ruídos iguais aos do pintor antigo')


def view(out):
    """A vista do jogo (1920x1080) no começo e no fim da sala e a tela de título, com a pintura de antes
    ao lado (--old: a pasta com os png em 2x da Ponte e os title-*.png do jogo, em 1x), e recortes em 3x."""
    os.makedirs(out, exist_ok=True)

    def load(src, name, k):
        p = os.path.join(src, name + '.png')
        if not os.path.exists(p):
            return None
        im = Image.open(p).convert('RGBA')
        if k != 3:
            im = im.resize((im.width * 3 // k, im.height * 3 // k), Image.NEAREST if k == 1 else Image.BICUBIC)
        return im

    def ponte(src, k, frac):
        v = Image.new('RGBA', (1920, 1080), (0x16, 0x1a, 0x2b, 255))
        x = (310 + int(round(frac * 150))) * 3
        for name in ('bridge-sky', 'bridge-far'):
            im = load(src, name, k)
            if im:
                v.alpha_composite(im.crop((x, 30, x + 1920, 30 + 1080)))
        im = load(src, 'bridge-mid', k)
        if im:
            strip = Image.new('RGBA', (1920, im.height))
            px = -(int(frac * 960 * 0.3 * 3) % im.width)
            while px < 1920:
                strip.alpha_composite(im.crop((max(0, -px), 0, min(im.width, 1920 - px), im.height)), (max(0, px), 0))
                px += im.width
            v.alpha_composite(strip.crop((0, 90, 1920, 90 + 1080)))
        return v.convert('RGB')

    def titulo(src, k):
        v = Image.new('RGBA', (1920, 1080), (0, 0, 0, 255))
        for name in ('title-sky', 'title-land'):
            im = load(src, name, k)
            if im:
                v.alpha_composite(im)
        return v.convert('RGB')

    for frac in (0, 1):
        if OLD:
            ponte(OLD, 2, frac).save(f'{out}/ponte-{frac}-antes.png')
        ponte(OUT, 3, frac).save(f'{out}/ponte-{frac}-novo.png')
    if OLD:
        titulo(OLD, 1).save(f'{out}/titulo-antes.png')
    titulo(OUT, 3).save(f'{out}/titulo-novo.png')
    # recortes no tamanho da pintura: o castelo, a cidade alta e o aqueduto
    for tag, name, box in (('castelo', 'bridge-far', (2130, 150, 3300, 780)), ('cidade', 'bridge-far', (840, 520, 2200, 840)),
                           ('ceu', 'bridge-sky', (1800, 0, 3000, 620)), ('aqueduto', 'bridge-mid', (0, 780, 1400, 1260))):
        for src, k in ((OLD, 2), (OUT, 3)):
            im = load(src, name, k) if src else None
            if im:
                bg = Image.new('RGBA', (box[2] - box[0], box[3] - box[1]), (0x16, 0x1a, 0x2b, 255))
                if name == 'bridge-far':
                    sk = load(src, 'bridge-sky', k)
                    if sk:
                        bg.alpha_composite(sk.crop(box))
                bg.alpha_composite(im.crop(box))
                bg.convert('RGB').save(f'{out}/{tag}-{"novo" if k == 3 else "antes"}.png')
    # o brilho de cada camada, antes e agora (cor média com o alfa), e o de dois pedaços do fundo
    def mean(p, box=None):
        im = Image.open(p).convert('RGBA')
        arr = np.asarray(im.crop(box) if box else im, np.float32) / 255
        pm = (arr[..., :3] * arr[..., 3:4]).reshape(-1, 3).mean(0)
        return '%.4f %.4f %.4f alfa %.4f' % (pm[0], pm[1], pm[2], arr[..., 3].mean())

    for name in ('bridge-sky', 'bridge-far', 'bridge-far-rim', 'bridge-mid', 'bridge-mid-rim', 'title-sky', 'title-land', 'title-rim'):
        row = [mean(os.path.join(src, name + '.png')) for src in (OLD, OUT) if src and os.path.exists(os.path.join(src, name + '.png'))]
        print(name, ' | '.join(row), flush=True)
    for tag, (x0, y0, x1, y1) in (('cidade alta', (560, 380, 1380, 520)), ('castelo', (1400, 200, 2200, 470))):
        row = [mean(os.path.join(src, 'bridge-far.png'), (x0 * k // 2, y0 * k // 2, x1 * k // 2, y1 * k // 2))
               for src, k in ((OLD, 2), (OUT, 3)) if src and os.path.exists(os.path.join(src, 'bridge-far.png'))]
        print(tag, ' | '.join(row), flush=True)


if __name__ == '__main__':
    plan = PP.load()
    if '--check' in sys.argv:
        check(plan)
        sys.exit(0)
    if want('sky'):
        save(sky(plan, np.random.default_rng(3101)), 'bridge-sky', opaque=True)
    if want('far'):
        f, fr = far(plan, 3110)
        save(f, 'bridge-far', opaque=False)
        save(fr, 'bridge-far-rim', opaque=False)
    if want('mid'):
        m, mr = mid(plan, 3120)
        save(m, 'bridge-mid', opaque=False)
        save(mr, 'bridge-mid-rim', opaque=False)
    if want('title'):
        title(plan, 3161)
    if PREVIEW:
        view(PREVIEW)
    print('pronto', round(time_s(), 1))

"""A Lembrança (o vale antes do eclipse) para o ECLIPSE: os três fundos e o terreno da sala, em 3 px da
imagem por px do mundo.

Os fundos têm o mesmo desenho do pintor antigo (fundos_memoria.py, lido pelo plano de memoria_plano.py: as
mesmas nuvens, os mesmos picos com a mesma neve, a mesma cachoeira, os mesmos morros, cada casa e cada
árvore no mesmo lugar e do mesmo tamanho, as mesmas flores), repintado em 3x: a copa das árvores ganha os
tufos pequenos de folhas dentro de cada massa, com a luz do sol da esquerda em cada um; o tronco ganha a
casca; as casas ganham telhas, a cruz da janela, a porta de tábuas e a sombra do beiral; o campo ganha o
capim fio a fio na crista dos morros; as montanhas ganham a aresta fina de cada pico e os sulcos menores.

O terreno da sala é pintado de novo direto em 3x a partir do mapa (as mesmas cores do antigo): a terra em
camadas com linhas de sedimento, a faixa escura de húmus debaixo da grama, pedras enterradas de três
tamanhos (deitadas, com a luz em cima e a terra subindo na beira de baixo), raízes que descem da grama (as
mais grossas debaixo de cada árvore da sala), a grama caindo em pontas sobre a terra e as folhas em cima.

  mem-sky   1920x1080  céu de verão com o sol baixo à esquerda (opaco)
  mem-far   3840x1080  as duas cordilheiras, a cachoeira e os morros com mata (repete)
  mem-mid   3072x1080  as colinas com as árvores, as sebes e as casinhas (repete)
  terreno   memoria-0.png e memoria-1.png (3360x1440 cada), na pasta terreno/

As medidas dos fundos dentro do pintor são as do pintor antigo (px do 2x); a tela é 1,5 vez maior.

uso: python3 ecl_memoria.py <pasta_saida> [sky far mid terreno] [--preview=<pasta>] [--old=<pasta com os png em 2x>]
     python3 ecl_memoria.py <pasta_saida> --check     (confere a releitura do plano com o pintor antigo)
     python3 ecl_memoria.py <pasta_saida> --pack      (grava o pacote do terreno: assets/hd3/memory.json)
"""
import base64
import io
import json
import math
import os
import re
import sys
import time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from brush import Layer, hexc, mix, sstep, blur, value_noise, paint, passes_std
from common import seamless
from arvore import PAL, SUN, BARK, BARK_L, ramp, composite
from ecl_comum import OUT, OLD, PREVIEW, T0, want
import memoria_plano as MP

HERE = os.path.dirname(os.path.abspath(__file__))
K = 1.5
F32 = np.float32
# as cores do pintor antigo
SKY0, SKY1, SKY2 = hexc(0x5e8fcb), hexc(0x9dbde0), hexc(0xf1e8d6)
SUNC, SUNW = hexc(0xfff6dc), hexc(0xffe2a6)
CL_L, CL_M, CL_S = hexc(0xfff8ec), hexc(0xe6e0e6), hexc(0xa8a6c6)
ROCK_L, ROCK_S = hexc(0xb7a6ae), hexc(0x56649a)
SNOW_L, SNOW_S = hexc(0xfff6ea), hexc(0xa7b6dc)
HAZE_M = hexc(0xc9d3e6)
SX, SY = 180.0, 330.0  # o sol (px do 2x)
RT = np.random.default_rng(91).random(4096).astype(F32)  # um sorteio por coisa pequena (folha, pedra, fio de grama)


def log(*a):
    print(*a, round(time.time() - T0, 1), 's', flush=True)


# ======================================================================================
# a tela em 3x nas medidas do 2x e a releitura do que o pintor antigo sorteou
# ======================================================================================
def idx(n3, k=K):
    """O índice (do 2x) do centro de cada pixel do 3x."""
    return (np.arange(n3, dtype=np.float64) + 0.5) / k - 0.5


def aa(d):
    """Quanto do pixel a forma cobre, pela distância para fora dela (px do 2x; negativa dentro)."""
    return np.clip(0.5 - d * K, 0, 1)


def sd_box(X, Y, x0, y0, x1, y1):
    dx = np.maximum(x0 - X, X - x1)
    dy = np.maximum(y0 - Y, Y - y1)
    return np.minimum(np.maximum(dx, dy), 0) + np.hypot(np.maximum(dx, 0), np.maximum(dy, 0))


def sd_poly(X, Y, pts):
    """Distância (positiva para fora) até um polígono convexo."""
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    s = 1.0 if area > 0 else -1.0
    out = None
    for i in range(n):
        (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        d = ((X - ax) * ey - (Y - ay) * ex) * (s / math.hypot(ex, ey))
        out = d if out is None else np.maximum(out, d)
    return out


def vn_read(rng, H, W, cell, octaves, iy, ix):
    """O value_noise do pintor antigo (os mesmos sorteios de rng, a mesma curva e a mesma escala de 0 a 1),
    lido nas linhas iy e nas colunas ix (índices do 2x, podem ser quebrados)."""
    iy, ix = np.asarray(iy, np.float64), np.asarray(ix, np.float64)
    old = np.zeros((H, W), F32)
    out = np.zeros((len(iy), len(ix)), F32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = max(1.0, cell / (2 ** o))
        gh, gw = int(H / c) + 3, int(W / c) + 3
        g = rng.random((gh, gw)).astype(F32)
        z = ndi.zoom(g, (c, c), order=3, mode='nearest')
        zh, zw = z.shape
        z2 = z[:H, :W]
        if z2.shape != (H, W):
            z2 = np.pad(z2, ((0, H - z2.shape[0]), (0, W - z2.shape[1])), mode='edge')
        old += amp * z2
        # o zoom do scipy põe a saída o no ponto o * (entrada - 1) / (saída - 1) da grade
        cy = np.repeat((iy * (gh - 1) / (zh - 1))[:, None], len(ix), axis=1)
        cx = np.repeat((ix * (gw - 1) / (zw - 1))[None, :], len(iy), axis=0)
        out += amp * ndi.map_coordinates(g, [cy, cx], order=3, mode='nearest')
        tot += amp
        amp *= 0.5
    old /= tot
    out /= tot
    lo, hi = float(old.min()), float(old.max())
    return np.clip((out - lo) / (hi - lo + 1e-6), 0, 1)


def vn_ev(e, iy, ix):
    assert e[0] == 'vn', e[0]
    return vn_read(MP.gen(e[5]), e[1], e[2], e[3], e[4], iy, ix)


def st_ev(st, e, iy, ix):
    """Um ruído esticado na vertical do pintor antigo (streaks), lido em iy, ix."""
    assert st[0] == 'st' and e[0] == 'vn', (st[0], e[0])
    H, hs = st[1], e[1]
    n = vn_read(MP.gen(e[5]), hs, e[2], e[3], e[4], np.arange(hs), ix)
    c = np.clip(np.asarray(iy, np.float64), 0, H - 1) * (hs - 1) / (H - 1)
    i0 = np.clip(np.floor(c).astype(np.int64), 0, hs - 2)
    f = (c - i0)[:, None].astype(F32)
    return n[i0] * (1 - f) + n[i0 + 1] * f


def pn_read(rng, TW, cell, octaves, x):
    """O ruído de uma linha que dá a volta (pnoise1d do pintor antigo), lido em qualquer x."""
    x = np.asarray(x, np.float64)
    out = np.zeros(x.shape, np.float64)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        k = max(2, int(round(TW / max(1.0, cell / 2 ** o))))
        g = rng.random(k).astype(F32)
        u = x * k / TW
        i0 = np.floor(u).astype(np.int64)
        f = u - i0
        f = f * f * (3 - 2 * f)
        out += amp * (g[i0 % k] + (g[(i0 + 1) % k] - g[i0 % k]) * f)
        tot += amp
        amp *= 0.5
    return out / tot


def pn_ev(e, x):
    assert e[0] == 'pn', e[0]
    return pn_read(MP.gen(e[5]), e[2], e[3], e[4], x)


def peaks_read(e, x):
    """Uma cordilheira anotada (peak_range do pintor antigo), lida em qualquer x: a crista, o x e o topo do
    pico dono de cada coluna, a inclinação da aresta que desce dele e a altura dele (0..1)."""
    assert e[0] == 'pk', e[0]
    _, W, TW, n, top_min, top_max, smin, smax, state, _ = e
    rng = MP.gen(state)
    x = np.asarray(x, np.float64)
    ridge = np.full(x.shape, 1e9)
    own_x, own_t, own_r, own_h = (np.zeros(x.shape) for _ in range(4))
    pxs = (np.arange(n) + rng.uniform(0.1, 0.9, n)) * TW / n
    for px in pxs:
        top = rng.uniform(top_min, top_max)
        sl, sr = rng.uniform(smin, smax), rng.uniform(smin, smax)
        rr = rng.uniform(0.25, 0.75)
        for off in (-TW, 0.0, TW):
            dx = x - (px + off)
            y = top + np.where(dx < 0, -dx * sl, dx * sr)
            better = y < ridge
            ridge = np.where(better, y, ridge)
            own_x = np.where(better, px + off, own_x)
            own_t = np.where(better, top, own_t)
            own_r = np.where(better, rr, own_r)
            own_h = np.where(better, (top_max - top) / max(1.0, top_max - top_min), own_h)
    ridge = ridge + (pn_read(rng, TW, 26, 3, x) - 0.5) * 16 + (pn_read(rng, TW, 7, 2, x) - 0.5) * 5
    return ridge, own_x, own_t, own_r, own_h


def stretch(h3, w3, cx, cy, rng, octaves=2):
    """Ruído novo esticado (0..1), direto no 3x: células de cx por cy (px do 2x)."""
    if cy >= cx:
        f = cy / cx
        n = value_noise(int(math.ceil(h3 / f)) + 2, w3, cx * K, rng, octaves)
        return ndi.zoom(n, (f, 1), order=1)[:h3, :w3]
    f = cx / cy
    n = value_noise(h3, int(math.ceil(w3 / f)) + 2, cy * K, rng, octaves)
    return ndi.zoom(n, (1, f), order=1)[:h3, :w3]


def worley(X, Y, cell, seed):
    """Pontos sorteados numa grade (um por célula de lado cell): para cada pixel, a distância ao ponto mais
    perto e ao segundo (em células), o vetor até o mais perto e o número dele."""
    u, v = np.asarray(X, np.float64) / cell, np.asarray(Y, np.float64) / cell
    iu, iv = np.floor(u).astype(np.int64), np.floor(v).astype(np.int64)
    f1 = np.full(u.shape, 9.0, F32)
    f2 = f1.copy()
    dx1, dy1 = np.zeros(u.shape, F32), np.zeros(u.shape, F32)
    id1 = np.zeros(u.shape, np.int64)
    for a in (-1, 0, 1):
        for b in (-1, 0, 1):
            ci, cj = iu + a, iv + b
            hh = (ci * 73856093 + cj * 19349663 + seed * 83492791) & 4095
            ddx = (u - (ci + RT[hh])).astype(F32)
            ddy = (v - (cj + RT[(hh * 7 + 13) & 4095])).astype(F32)
            d = np.hypot(ddx, ddy)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            dx1 = np.where(closer, ddx, dx1)
            dy1 = np.where(closer, ddy, dy1)
            id1 = np.where(closer, hh, id1)
            f1 = np.where(closer, d, f1)
    return f1, f2, dx1, dy1, id1


def glaze(L, col, k):
    """Puxa a cor da camada para col (k: 0..1 por pixel ou um número), sem mexer no alfa."""
    k = np.asarray(k, F32)
    if k.ndim == 2:
        k = k[..., None]
    L.P[:] = L.P * (1 - k) + np.asarray(col, F32) * L.A[..., None] * k


def tone(L, f):
    """Multiplica a cor da camada (f por pixel), sem mexer no alfa."""
    L.P *= np.asarray(f, F32)[..., None]


def edge_toward(a, ux, uy, steps=(1.2, 2.4, 3.6), weights=(0.5, 0.3, 0.2)):
    """Quanto cada ponto da forma está na beira que olha para o lado (ux, uy) (passos em px do 3x)."""
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(F32)
    out = np.zeros_like(a)
    for d, k in zip(steps, weights):
        out += k * (1 - ndi.map_coordinates(a, [yy + uy * d, xx + ux * d], order=1, mode='constant', cval=0.0))
    return out * a


def save_layer(L, name, opaque=False):
    img = L.image()
    if opaque:
        img = img.convert('RGB')
    os.makedirs(OUT, exist_ok=True)
    img.save(f'{OUT}/{name}.png')
    log(name, img.size)
    return img


# ======================================================================================
# mem-sky
# ======================================================================================
def sky3(ev):
    w3, h3, H = 1920, 1080, 720
    iy, ix = idx(h3), idx(w3)
    yy, xx = iy[:, None].astype(F32), ix[None, :].astype(F32)
    vns = [e for e in ev if e[0] == 'vn']
    assert len(vns) == 2, len(vns)
    n, n2 = vn_ev(vns[0], iy, ix), vn_ev(vns[1], iy, ix)
    rng = np.random.default_rng(5101)
    n3 = value_noise(h3, w3, 15 * K, rng, 2)
    t = yy / H
    ref = mix(SKY0, SKY1, sstep(0.0, 0.55, t)[..., None])
    ref = mix(ref, SKY2, sstep(0.4, 0.75, t)[..., None])
    ref = np.broadcast_to(ref, (h3, w3, 3)).copy()
    d_s = np.hypot(xx - SX, (yy - SY) * 1.1)
    ref = mix(ref, SUNW, (np.exp(-(d_s / 420) ** 2) * 0.55)[..., None])
    ref = mix(ref, SUNC, (np.exp(-(d_s / 140) ** 2) * 0.9)[..., None])
    # as nuvens grandes: as mesmas do pintor antigo, com a beira desfiada por um ruído mais fino
    dens = sstep(0.5, 0.75, n * 0.75 + n2 * 0.25 + (n3 - 0.5) * 0.05) * sstep(560, 300, yy) * sstep(20, 120, yy)
    ux, uy = SX - xx, SY - yy
    nn = np.hypot(ux, uy) + 1e-3
    ux, uy = ux / nn, uy / nn
    py, px = np.mgrid[0:h3, 0:w3].astype(F32)

    def toward(dist):
        return ndi.map_coordinates(dens, [py + uy * dist * K, px + ux * dist * K], order=1, mode='nearest')

    lit = np.clip(dens - toward(10) * 0.9, 0, 1)
    rim = np.clip(dens - toward(3.5) * 0.96, 0, 1)
    ccol = mix(CL_M, CL_S, sstep(0.3, 1.0, dens)[..., None] * 0.6)
    ccol = mix(ccol, CL_L, np.clip(lit * 3 + 0.2, 0, 1)[..., None])
    ccol = mix(ccol, CL_L, (np.clip(rim * 2.5, 0, 1) * 0.45)[..., None])
    ccol = mix(ccol, SUNW, (np.exp(-(d_s / 500) ** 2) * lit * 1.5).clip(0, 1)[..., None] * 0.6)
    ccol = ccol * (1 + (n3 - 0.5) * 0.06)[..., None]
    ref = np.clip(mix(ref, ccol, np.clip(dens * 1.3, 0, 1)[..., None]), 0, 1)
    flow = np.full((h3, w3), -0.08, F32) + (n2 - 0.5) * 1.2
    L = Layer(w3, h3)
    ps = passes_std(1.1 * K, dry=0.25, bristle=0.3, err=(0, 0.02, 0.035, 0.05), long=1.5)
    paint(L, ref, np.ones((h3, w3), F32), flow, rng, ps, val_jitter=0.035, base=1.0)
    # o disco do sol e os raios, onde já estavam
    for e in ev:
        if e[0] == 'd':
            L.dab(e[1] * K, e[2] * K, e[3] * K, np.array(e[4], F32), e[5], e[6] * K)
        elif e[0] == 's':
            L.stroke(e[1] * K, e[2] * K, e[3], e[4] * K, e[5] * K, np.array(e[6], F32), e[7], rng, 0.3, 0.4, taper=e[8])
    return L


# ======================================================================================
# mem-far
# ======================================================================================
def mountains3(ev, i0, w3, h3, rng):
    """Uma cordilheira do pintor antigo (a anotação em ev[i0]) na tela maior."""
    e = ev[i0]
    kinds = [x[0] for x in ev[i0 + 1:i0 + 11]]
    assert kinds == ['pk', 'pn', 'pn', 'vn', 'st', 'vn', 'vn', 'st', 'vn', 'vn'], kinds
    haze, snow_amt, base_fade = e[1], e[2], e[3]
    pk, wig_e, st1, g_e, rock_e, st2, s_e = ev[i0 + 1], ev[i0 + 4], ev[i0 + 5], ev[i0 + 6], ev[i0 + 7], ev[i0 + 8], ev[i0 + 9]
    TW = pk[2]
    iy, ix = idx(h3), idx(w3)
    yy, xx = iy[:, None].astype(F32), ix[None, :].astype(F32)
    ridge, ox, ot, orr, oh = (a.astype(F32) for a in peaks_read(pk, ix))
    ridge_c = peaks_read(pk, ix + 0.5)[0]
    slope = (np.gradient(ridge_c) * K).astype(F32)
    cover = np.clip(0.5 + ((yy + 0.5) - ridge_c[None, :].astype(F32)) / np.sqrt(1 + slope[None, :] ** 2) * K, 0, 1)
    depth = yy - ridge[None, :]
    # a aresta que desce de cada pico: a mesma linha, mais fina e com o serrilhado miúdo da rocha
    wig = (vn_ev(wig_e, iy, ix) - 0.5) * 26 + (value_noise(h3, w3, 6 * K, rng, 2) - 0.5) * 2.6
    xr = ox[None, :] + np.maximum(0, yy - ot[None, :]) * orr[None, :] + wig
    side = xx - xr
    lit = sstep(1.5, -1.5, side)
    gul = st_ev(st1, g_e, iy, ix)
    lit = np.clip(lit - sstep(0.62, 0.8, gul) * 0.55 * lit + sstep(0.72, 0.86, gul) * 0.3 * (1 - lit), 0, 1)
    gul2 = stretch(h3, w3, 4.0, 44.0, rng)
    lit = np.clip(lit - sstep(0.66, 0.84, gul2) * 0.24 * lit + sstep(0.74, 0.9, gul2) * 0.13 * (1 - lit), 0, 1)
    rock = mix(ROCK_S, ROCK_L, lit[..., None])
    rock = rock * (0.92 + 0.16 * vn_ev(rock_e, iy, ix))[..., None]
    sd = snow_amt * (0.35 + 0.9 * oh[None, :]) * (0.35 + 1.1 * st_ev(st2, s_e, iy, ix))
    snow = sstep(sd + 4, sd - 4, depth) * (1.0 if snow_amt > 0 else 0.0)
    # perto da linha da neve a rocha fura em manchas pequenas
    fine = value_noise(h3, w3, 5 * K, rng, 2)
    snow = snow * (1 - 0.6 * sstep(0.6, 0.8, fine) * sstep(sd * 0.3, sd * 0.95, depth))
    scol = mix(SNOW_S, SNOW_L, lit[..., None])
    col = mix(rock, scol, snow[..., None])
    # a beira de cima pega a luz (um fio claro na crista) e o lado da sombra escurece junto da aresta
    crest = np.exp(-np.maximum(depth, 0) / 1.6) * lit
    col = mix(col, SNOW_L if snow_amt > 0 else ROCK_L, (crest * 0.5)[..., None])
    col = col * (1 - 0.12 * np.exp(-(side / 2.2) ** 2) * (side > 0))[..., None]
    col = mix(col, HAZE_M, (sstep(base_fade - 120, base_fade + 60, yy) * 0.85)[..., None])
    sunw = np.exp(-(((xx % TW) - SX * 2) / 900.0) ** 2)
    col = np.clip(mix(col, SKY2, (haze + 0.12 * sunw)[..., None]), 0, 1).astype(F32)
    flow = np.where(lit > 0.5, math.pi / 2 + 0.5, math.pi / 2 - 0.5).astype(F32) + (value_noise(h3, w3, 40 * K, rng) - 0.5) * 0.4
    L = Layer(w3, h3)
    ps = passes_std(0.42 * K, dry=0.35, bristle=0.4, err=(0, 0.02, 0.035, 0.05), long=1.2)[:3]
    paint(L, col, cover.astype(F32), flow, rng, ps, val_jitter=0.035, clip_soft=0, base=1.0)
    glaze(L, col, 0.5)
    return L


def far3(ev):
    TW, PAD, H = 2560, 320, 720
    W = TW + PAD
    w3, h3 = int(W * K), int(H * K)
    iy, ix = idx(h3), idx(w3)
    yy, xx = iy[:, None].astype(F32), ix[None, :].astype(F32)
    rng = np.random.default_rng(5102)
    mts = [i for i, e in enumerate(ev) if e[0] == 'mt']
    assert len(mts) == 2, len(mts)
    out = Layer(w3, h3)
    # a cordilheira mais distante, alta e nevada
    out.over(mountains3(ev, mts[0], w3, h3, rng))
    log('  cordilheira de trás')
    out.fill(HAZE_M, np.broadcast_to(np.exp(-((yy - 430) / 60) ** 2) * 0.55, (h3, w3)))
    # a cordilheira do meio, com a cachoeira
    L2 = mountains3(ev, mts[1], w3, h3, rng)
    log('  cordilheira do meio')
    r2 = peaks_read(ev[mts[1] + 1], np.arange(W))[0]
    fx = int(np.argmin(r2[1450:1950])) + 1450 + 34
    fall_top = float(r2[fx]) + 22
    Y, X = (iy + 0.5)[:, None], (ix + 0.5)[None, :]
    c0, c1 = max(0, int((fx - 40) * K)), min(w3, int((fx + 40) * K))
    cleft = aa(sd_poly(X[:, c0:c1], Y, [(fx - 12, fall_top - 8), (fx + 10, fall_top - 10), (fx + 22, 470), (fx - 26, 470)]))
    part = Layer(c1 - c0, h3)
    part.P, part.A = L2.P[:, c0:c1], L2.A[:, c0:c1]
    glaze(part, mix(hexc(0x4a5a80), SKY2, 0.15), (cleft * 0.85).astype(F32))
    end2 = ev[mts[1]][-1]
    fall = []
    i = end2
    while ev[i][0] == 's':
        fall.append(ev[i])
        i += 1
    assert len(fall) == 136, len(fall)
    for e in fall:
        cx, cy, ang, ln, wd, col, al, tp = e[1:9]
        col = np.array(col, F32)
        L2.stroke(cx * K, cy * K, ang, ln * K, wd * K * 0.8, col, al, rng, 0.4, 0.35, taper=tp)
        # um fio mais fino e mais claro junto de cada um
        L2.stroke((cx + rng.normal(0, wd * 0.4)) * K, (cy + rng.normal(0, 6)) * K, ang, ln * K * rng.uniform(0.5, 0.9), max(1.0, wd * K * 0.3),
                  mix(col, np.ones(3, F32), 0.5), al * 0.7, rng, 0.3, 0.3, taper=tp)
    out.over(L2)
    # a névoa na base, com o borrifo da cachoeira
    out.fill(HAZE_M, np.broadcast_to(sstep(470, 600, yy) * 0.6, (h3, w3)) * sstep(0.02, 0.1, out.A))
    spray = []
    while ev[i][0] == 'd':
        spray.append(ev[i])
        i += 1
    assert len(spray) == 60, len(spray)
    for e in spray:
        out.dab(e[1] * K, e[2] * K, e[3] * K, np.array(e[4], F32), e[5], e[6] * K)
    # os morros com mata, mais perto: as copas redondas na borda, com a luz por cima
    assert ev[i][0] == 'pn' and ev[i + 1][0] == 'vn', (ev[i][0], ev[i + 1][0])
    top = (520 - 50 * pn_ev(ev[i], ix)).astype(F32)
    top_c = 520 - 50 * pn_ev(ev[i], ix + 0.5)
    slope = (np.gradient(top_c) * K).astype(F32)
    cover = np.clip(0.5 + ((yy + 0.5) - top_c[None, :].astype(F32)) / np.sqrt(1 + slope[None, :] ** 2) * K, 0, 1).astype(F32)
    d3 = yy - top[None, :]
    c3 = mix(hexc(0x6f9a86), hexc(0x587f78), sstep(0, 160, d3)[..., None])
    c3 = mix(c3, SKY2, 0.28)
    # a mata em tufos: cada copa com a luz do sol do lado esquerdo, sumindo na névoa para baixo
    f1, f2, dx, dy, _ = worley(np.broadcast_to(xx, (h3, w3)), np.broadcast_to(yy * 1.25, (h3, w3)), 11.0, 3)
    lump = np.clip(0.5 - (dx * 0.62 + dy * 0.5) * 1.1, 0, 1) * sstep(0.75, 0.35, f1)
    gap = sstep(0.14, 0.0, f2 - f1)
    fade = 1 - 0.6 * sstep(30, 170, d3)
    c3 = c3 * (1 + ((lump - 0.4) * 0.2 - gap * 0.1) * fade)[..., None]
    c3 = np.clip(c3, 0, 1).astype(F32)
    L3 = Layer(w3, h3)
    flow = np.full((h3, w3), -0.1, F32) + (value_noise(h3, w3, 30 * K, rng) - 0.5) * 2.0
    paint(L3, c3, cover, flow, rng, passes_std(0.35 * K, dry=0.3, bristle=0.4)[1:3], val_jitter=0.04, clip_soft=0, base=1.0)
    glaze(L3, c3, 0.5)
    tops = [e for e in ev[i + 2:] if e[0] == 'd']
    assert len(tops) % 2 == 0 and len(tops) > 500, len(tops)
    for a, b in zip(tops[0::2], tops[1::2]):
        L3.dab(a[1] * K, a[2] * K, a[3] * K, np.array(a[4], F32), a[5], 1.4)
        cb = np.array(b[4], F32)
        L3.dab(b[1] * K, b[2] * K, b[3] * K, cb, b[5], 1.8)
        for _ in range(2):
            L3.dab((b[1] + rng.normal(0, b[3] * 0.55)) * K, (b[2] + rng.normal(0, b[3] * 0.4)) * K, b[3] * K * rng.uniform(0.35, 0.5),
                   np.clip(cb * 1.07, 0, 1), 0.5, 1.2)
    out.over(L3)
    return seamless(out, int(TW * K), int(PAD * K))


# ======================================================================================
# mem-mid: o campo, as casas e as árvores
# ======================================================================================
def meadow3(out, ev, i, ridge_e, base, amp, w3, h3, rng):
    """Um campo do pintor antigo (a anotação em ev[i]; a crista é base - amp * o ruído de ridge_e)."""
    e = ev[i]
    cA, cB, haze, shadow_amt, flowers = np.array(e[1], F32), np.array(e[2], F32), e[3], e[4], e[5]
    kids = ev[i + 1:e[-1]]
    vns = [k for k in kids if k[0] == 'vn']
    iy, ix = idx(h3), idx(w3)
    yy = iy[:, None].astype(F32)
    ridge = (base - amp * pn_ev(ridge_e, ix)).astype(F32)
    ridge_c = base - amp * pn_ev(ridge_e, ix + 0.5)
    slope_c = (np.gradient(ridge_c) * K).astype(F32)
    cover = np.clip(0.5 + ((yy + 0.5) - ridge_c[None, :].astype(F32)) / np.sqrt(1 + slope_c[None, :] ** 2) * K, 0, 1).astype(F32)
    depth = np.maximum(0, yy - ridge[None, :])
    ref = mix(cA, cB, sstep(0, 230, depth)[..., None])
    # a luz de fim de tarde na crista e as manchas de sol e de sombra de nuvem
    slope = np.gradient(ridge) * K
    ref = mix(ref, hexc(0xd8e88c), (np.clip(-slope * 1.2, 0, 1)[None, :] * np.exp(-depth / 60) * 0.45)[..., None])
    ref = mix(ref, hexc(0xe6ef9a), (np.exp(-depth / 5) * 0.55)[..., None])
    cl = vn_ev(vns[0], iy, ix)
    ref = mix(ref, ref * 0.62 + hexc(0x2f5a5c) * 0.38, (sstep(0.58, 0.72, cl) * shadow_amt)[..., None])
    ref = mix(ref, hexc(0xb8d46a), (sstep(0.36, 0.22, cl) * 0.35)[..., None])
    ref = mix(ref, SKY2, haze)
    # o capim: fios finos em pé, mais marcados perto de quem olha
    blades = stretch(h3, w3, 1.5, 8.0, rng)
    ref = ref * (1 + (blades - 0.5) * (0.12 if flowers else 0.06) * sstep(0, 26, depth))[..., None]
    ref = np.clip(ref, 0, 1).astype(F32)
    L = Layer(w3, h3)
    flow = np.full((h3, w3), -0.06, F32) + (value_noise(h3, w3, 50 * K, rng, 2) - 0.5) * 0.7
    ps = passes_std(0.55 * K, dry=0.35, bristle=0.4, err=(0, 0.02, 0.035, 0.05), long=1.5)[:3]
    paint(L, ref, cover, flow, rng, ps, val_jitter=0.045, clip_soft=0, base=1.0)
    glaze(L, ref, 0.45)
    # a crista: fios de capim passando da linha do morro, na cor da luz que bate nela
    crest = np.clip(mix(mix(cA, hexc(0xe6ef9a), 0.6), SKY2, haze), 0, 1)
    dark = np.clip(mix(cA * 0.8, SKY2, haze), 0, 1)
    for x in np.arange(0.5, w3, 2.3):
        if rng.random() > (0.75 if flowers else 0.5):
            continue
        xc = (x + 0.5) / K - 0.5
        j = int(np.clip(x, 0, w3 - 1))
        y0 = (float(ridge_c[j]) + 0.6) * K
        ln = rng.uniform(4, 10) * (1.0 if flowers else 0.6)
        ang = -math.pi / 2 + rng.normal(0, 0.35)
        c = mix(dark, crest, rng.uniform(0.3, 1.0))
        L.stroke(x + math.cos(ang) * ln * 0.3, y0 + math.sin(ang) * ln * 0.3, ang, ln, rng.uniform(1.1, 1.9), c, 0.85, rng, 0.15, 0.05, taper=0.9, soft=0.55)
        del xc
    if flowers:
        for k in kids:
            if k[0] == 'd':
                # as flores em manchas, no mesmo lugar
                c = np.array(k[4], F32)
                r = max(1.15, k[3] * K * 0.85)
                L.dab(k[1] * K, k[2] * K, r, c, k[5], 0.55)
                if r > 1.9:
                    L.dab(k[1] * K - 0.4, k[2] * K - 0.4, r * 0.45, np.clip(c * 1.12 + 0.04, 0, 1), 0.7, 0.45)
            elif k[0] == 's':
                # os tufos de capim mais escuros: três fios saindo do mesmo pé
                cx, cy, ang, ln, wd, c, al, tp = k[1:9]
                c = np.array(c, F32)
                bx, by = cx - math.cos(ang) * ln / 2, cy - math.sin(ang) * ln / 2
                for da, lf, cf in ((0.0, 1.0, 1.0), (-0.42, 0.75, 0.9), (0.36, 0.8, 1.1)):
                    a2, l2 = ang + da + rng.normal(0, 0.06), ln * lf
                    L.stroke((bx + math.cos(a2) * l2 / 2) * K, (by + math.sin(a2) * l2 / 2) * K, a2, l2 * K, max(1.0, wd * K * 0.55),
                             np.clip(c * cf, 0, 1), min(1.0, al + 0.15), rng, 0.2, 0.1, taper=0.85, soft=0.55)
    out.over(L)


def house3(out, e, kids, rng):
    """Uma casa do pintor antigo (pé em x, gy; s o tamanho), com telhas, janela, porta e a sombra do beiral."""
    _, x, gy, s, haze, _ = e
    w, h = 40 * s, 26 * s
    top = gy - h

    def hz(c):
        return mix(np.asarray(c, F32), SKY2, haze)

    wall_l, wall_s = hz(hexc(0xf6ead2)), hz(hexc(0xb9a89a))
    roof_l, roof_s = hz(hexc(0xc8573a)), hz(hexc(0x7e3530))
    bx0, by0, bx1, by1 = x - 8 * s, top - 26 * s, x + w + 8 * s, gy + 6
    o3x, o3y = int(math.floor(bx0 * K)), int(math.floor(by0 * K))
    w3, h3 = int(math.ceil(bx1 * K)) - o3x, int(math.ceil(by1 * K)) - o3y
    X = ((o3x + np.arange(w3) + 0.5) / K)[None, :].astype(F32)
    Y = ((o3y + np.arange(h3) + 0.5) / K)[:, None].astype(F32)
    XX, YY = np.broadcast_to(X, (h3, w3)), np.broadcast_to(Y, (h3, w3))
    sub = Layer(w3, h3)
    grain = value_noise(h3, w3, 3.0 * K, rng, 2)
    # a parede da frente (no sol) e a de lado (na sombra), com a sombra do beiral e o pé mais escuro
    eave = sstep(top + 6 * s, top + 1.5, YY)
    foot = sstep(gy - 3 * s, gy + 1, YY)
    for pts, c, dark in (([(x, top), (x + w * 0.68, top), (x + w * 0.68, gy + 4), (x, gy + 4)], wall_l, 0.26),
                         ([(x + w * 0.68, top), (x + w, top + 3 * s), (x + w, gy + 4), (x + w * 0.68, gy + 4)], wall_s, 0.2)):
        col = c * (1 + (grain - 0.5) * 0.07)[..., None] * (1 - dark * eave - 0.16 * foot)[..., None]
        sub.fill(col, aa(sd_poly(XX, YY, pts)))
    # a quina entre as duas paredes
    sub.fill(wall_s * 0.82, aa(sd_box(XX, YY, x + w * 0.68 - 0.3, top, x + w * 0.68 + 0.3, gy + 4)) * 0.6)
    # o telhado da frente: fiadas de telha paralelas ao beiral, a cumeeira clara
    apex = (x + w * 0.34, top - 18 * s)
    rows = (YY - apex[1]) / (2.7 * s)
    fr = rows - np.floor(rows)
    line = sstep(0.82, 0.98, fr)
    ri = np.floor(rows).astype(np.int64)
    tu = (XX + (ri % 2) * 1.6 * s) / (3.2 * s)
    joint = sstep(0.08, 0.0, np.abs(tu - np.floor(tu) - 0.5) - 0.42)
    rf = roof_l * (1 + (grain - 0.5) * 0.1)[..., None] * (1 - 0.2 * line - 0.07 * joint * (1 - line))[..., None]
    sub.fill(rf, aa(sd_poly(XX, YY, [(x - 5 * s, top + 2), apex, (x + w * 0.72, top + 2)])))
    # o telhado de lado (na sombra): as fiadas acompanham a cumeeira
    back = (x + w + 4 * s, top - 14 * s)
    ex, ey = back[0] - apex[0], back[1] - apex[1]
    en = math.hypot(ex, ey)
    dist = ((XX - apex[0]) * (-ey) + (YY - apex[1]) * ex) / en
    r2 = dist / (2.7 * s)
    line2 = sstep(0.82, 0.98, r2 - np.floor(r2))
    rs = roof_s * (1 + (grain - 0.5) * 0.1)[..., None] * (1 - 0.2 * line2)[..., None]
    side = [apex, back, (x + w + 4 * s, top + 5 * s), (x + w * 0.72, top + 2)]
    a_side = aa(sd_poly(XX, YY, side))
    sub.fill(rs, a_side)
    # a cumeeira e a beira da frente pegam a luz
    ridge_l = aa(np.abs(dist) - 0.45) * a_side
    sub.fill(np.clip(roof_l * 1.25, 0, 1), ridge_l * 0.8)
    edge_l = aa(np.abs(sd_poly(XX, YY, [(x - 5 * s, top + 2), apex, (x + w * 0.72, top + 2)]) + 0.35) - 0.35) * (XX < apex[0])
    sub.fill(np.clip(roof_l * 1.2 + 0.03, 0, 1), edge_l * 0.55)
    # a chaminé, com a beira clara do lado do sol e o capelo
    cx0, cx1, cy0, cy1 = x + w * 0.8, x + w * 0.88, top - 22 * s, top - 8 * s
    sub.fill(wall_s * 0.9, aa(sd_box(XX, YY, cx0, cy0, cx1, cy1)))
    sub.fill(wall_l * 0.95, aa(sd_box(XX, YY, cx0, cy0, cx0 + 0.7, cy1)) * 0.8)
    sub.fill(wall_s * 0.7, aa(sd_box(XX, YY, cx0 - 0.7, cy0 - 1.1, cx1 + 0.7, cy0 + 0.5)))
    # a porta de tábuas, com o batente
    dx0, dx1, dy0, dy1 = x + w * 0.26, x + w * 0.42, gy - h * 0.55, gy + 1
    door = hz(hexc(0x4a3022))
    sub.fill(np.clip(wall_l * 0.8, 0, 1), aa(sd_box(XX, YY, dx0 - 0.7, dy0 - 0.7, dx1 + 0.7, dy1)))
    plank = 1 - 0.22 * sstep(0.3, 0.0, np.abs(XX - (dx0 + dx1) / 2)) - 0.15 * sstep(0.3, 0.0, np.abs(XX - dx0 - (dx1 - dx0) * 0.25)) \
        - 0.15 * sstep(0.3, 0.0, np.abs(XX - dx0 - (dx1 - dx0) * 0.75))
    sub.fill(door * plank[..., None], aa(sd_box(XX, YY, dx0, dy0, dx1, dy1)))
    sub.fill(hz(hexc(0xc8a060)), aa(np.hypot(XX - (dx1 - 1.1), YY - (dy0 + dy1) / 2) - 0.45) * 0.9)
    # a janela: a moldura, o vidro com o reflexo do céu e a cruz
    wx0, wx1, wy0, wy1 = x + w * 0.5, x + w * 0.6, gy - h * 0.7, gy - h * 0.4
    sub.fill(np.clip(wall_l * 1.04, 0, 1), aa(sd_box(XX, YY, wx0 - 0.8, wy0 - 0.8, wx1 + 0.8, wy1 + 1.2)))
    glass = mix(hz(hexc(0x5b6f88)), hz(hexc(0xa9c4dc)), sstep(wy1, wy0, YY)[..., None] * sstep(wx1, wx0, XX)[..., None] * 0.7)
    sub.fill(glass, aa(sd_box(XX, YY, wx0, wy0, wx1, wy1)))
    cross = np.minimum(np.abs(XX - (wx0 + wx1) / 2), np.abs(YY - (wy0 + wy1) / 2)) - 0.22
    sub.fill(np.clip(wall_l * 1.02, 0, 1), aa(cross) * aa(sd_box(XX, YY, wx0, wy0, wx1, wy1)) * 0.9)
    composite(out, sub, o3x, o3y)
    # a fumaça, onde já estava
    for k in kids:
        if k[0] == 'd':
            out.dab(k[1] * K, k[2] * K, k[3] * K, np.array(k[4], F32), k[5], k[6] * K)


def tree3(out, e, kids, rng, check=False):
    """Uma árvore do pintor antigo na tela maior: a mesma copa (os mesmos tufos, relidos do sorteio dela),
    com os tufos pequenos de folhas dentro de cada massa; o tronco e os galhos com a casca."""
    _, x, gy, size, kind, haze, trunk, flat, petals, box, can, _ = e
    pal = PAL[kind]
    x0, y0 = box[0], box[1]
    w, h = can['w'], can['h']
    k = 1.0 if check else K
    o3x, o3y = int(math.floor(x0 * k)), int(math.floor(y0 * k))
    w3, h3 = int(math.ceil((x0 + w) * k)) - o3x, int(math.ceil((y0 + h) * k)) - o3y
    # o índice de cada pixel na caixa antiga da árvore
    ixl = (o3x + np.arange(w3) + 0.5) / k - 0.5 - x0
    iyl = (o3y + np.arange(h3) + 0.5) / k - 0.5 - y0
    XX, YY = np.meshgrid(ixl.astype(F32), iyl.astype(F32))
    g = MP.gen(can['state'])
    fine = vn_read(g, h, w, max(2.0, size * 0.035), 2, iyl, ixl)
    cx, cy, rx, ry = can['cx'], can['cy'], can['rx'], can['ry']
    clumps = []
    for _ in range(can['n']):
        a = g.uniform(0, 2 * math.pi)
        rr = math.sqrt(g.random())
        ccx = cx + math.cos(a) * rr * rx * 0.78
        ccy = cy + math.sin(a) * rr * ry * 0.78 * flat
        r = size * g.uniform(0.15, 0.26) * (1.15 - 0.35 * rr)
        cz = (1 - rr) * size * 0.25 + (ccy - cy) * 0.25
        clumps.append((ccx, ccy, r, cz))
    # os tufos pequenos de folhas: uma grade de pontos que acompanha a árvore (não a tela)
    cell = float(np.clip(size * 0.055, 2.3, 6.0))
    seed = int(abs(x * 13 + gy * 7 + size * 3)) % 997
    f1, f2, ldx, ldy, lid = worley(XX, YY, cell, seed)
    bump = np.sqrt(np.clip(1 - (f1 / 0.8) ** 2, 0, 1))
    wob = 0.0 if check else (bump - 0.55) * min(1.2, cell * 0.32)
    zb = np.full((h3, w3), -1e9, F32)
    z2 = np.full((h3, w3), -1e9, F32)
    nx, ny, nz = np.zeros((h3, w3), F32), np.zeros((h3, w3), F32), np.ones((h3, w3), F32)
    cov = np.zeros((h3, w3), F32)
    for (ccx, ccy, r, cz) in clumps:
        d = np.hypot(XX - ccx, (YY - ccy) * 1.08)
        reff = r * (1 + (fine - 0.5) * 0.42) + wob
        inside = d < reff
        dz = np.sqrt(np.clip(reff * reff - d * d, 0, None))
        z = cz + dz
        better = inside & (z > zb)
        z2 = np.where(better, zb, np.where(inside & (z > z2), z, z2))
        zb = np.where(better, z, zb)
        inv = 1.0 / np.maximum(reff, 1e-3)
        nx = np.where(better, (XX - ccx) * inv, nx)
        ny = np.where(better, (YY - ccy) * inv, ny)
        nz = np.where(better, dz * inv, nz)
        cov = np.maximum(cov, np.clip(0.5 + (reff - d) * k, 0, 1))
    M = zb > -1e8
    if check:
        return int(M.sum())
    crease = np.where(z2 > -1e8, np.exp(-(zb - z2) / max(1.0, size * 0.05)), 0.0).astype(F32)
    shade = np.clip(nx * SUN[0] + ny * SUN[1] + nz * SUN[2], 0, 1)
    mass = sstep(cy - ry, cy + ry * 1.1, YY)
    s = (shade * (1 - 0.45 * mass) + 0.05) * (1 - 0.55 * crease)
    # cada tufo de folhas com a luz dele (a normal da massa entortada pela do tufo) e o vão escuro em volta
    bx, by = ldx / 0.8 * 0.75, ldy / 0.8 * 0.75
    ln = np.sqrt((nx + bx) ** 2 + (ny + by) ** 2 + nz ** 2) + 1e-4
    shade2 = np.clip(((nx + bx) * SUN[0] + (ny + by) * SUN[1] + nz * SUN[2]) / ln, 0, 1)
    gap = sstep(0.2, 0.02, f2 - f1)
    s2 = (shade2 * (1 - 0.45 * mass) + 0.05) * (1 - 0.55 * crease) * (1 - 0.32 * gap) * (1 + (RT[lid] - 0.5) * 0.16)
    s = np.clip(mix(s, s2, 0.78), 0, 1)
    col = ramp(pal, s)
    # a luz do céu nas sombras, a folha atravessada de luz na beira do sol e a névoa da distância
    col = mix(col, col * 0.75 + hexc(0x7fa0c0) * 0.25, ((1 - shade) * 0.35)[..., None])
    un = math.hypot(SUN[0], SUN[1])
    rim = edge_toward(cov, SUN[0] / un, SUN[1] / un)
    col = mix(col, pal[3], (rim * 0.45)[..., None])
    hazec = SKY2
    col = np.clip(mix(col, hazec, haze), 0, 1).astype(F32)
    sub = Layer(w3, h3)

    def loc(px_, py_):
        """Um ponto da caixa antiga (contínuo) na caixa nova."""
        return (px_ + x0) * K - o3x, (py_ + y0) * K - o3y

    strokes = [q for q in kids if q[0] == 's']
    dabs = [q for q in kids if q[0] == 'd']
    nt = 5 if trunk else 0
    assert len(strokes) >= nt, (len(strokes), nt)
    # o tronco e os galhos (atrás da copa), com a casca: sulcos escuros, o lado do sol claro
    for j, q in enumerate(strokes[:nt]):
        qx, qy = loc(q[1], q[2])
        c = np.array(q[6], F32)
        sub.stroke(qx, qy, q[3], q[4] * K, q[5] * K, c, q[7], rng, 0.25, 0.04, taper=q[8])
        if j != 1 and q[5] * K > 2.4:
            wd = q[5] * K
            px_, py_ = -math.sin(q[3]), math.cos(q[3])
            sg = 1.0 if (px_ * SUN[0] + py_ * SUN[1]) > 0 else -1.0
            dark = np.clip(c * 0.62, 0, 1)
            sub.stroke(qx - sg * px_ * wd * 0.3, qy - sg * py_ * wd * 0.3, q[3], q[4] * K * 0.96, wd * 0.42, dark, 0.55, rng, 0.3, 0.1, taper=q[8])
            for _ in range(int(2 + wd / 3)):
                o = rng.uniform(-0.38, 0.38) * wd
                tpos = rng.uniform(-0.4, 0.4) * q[4] * K
                sub.stroke(qx + px_ * o + math.cos(q[3]) * tpos, qy + py_ * o + math.sin(q[3]) * tpos, q[3] + rng.normal(0, 0.05),
                           q[4] * K * rng.uniform(0.12, 0.3), max(0.8, wd * 0.09), dark, 0.6, rng, 0.1, 0.1, taper=0.7, soft=0.5)
            if j > 1:
                lightc = np.clip(mix(c, np.array(strokes[1][6], F32), 0.8), 0, 1)
                sub.stroke(qx + sg * px_ * wd * 0.28, qy + sg * py_ * wd * 0.28, q[3], q[4] * K * 0.9, max(0.8, wd * 0.25), lightc, 0.5, rng, 0.3, 0.2, taper=0.7)
    # a copa: as manchas grandes de pincel por baixo e o desenho fino das folhas por cima
    k3 = max(0.25, size / 110) * K
    flow = (value_noise(h3, w3, max(3.0, size * 0.08) * K, rng, 1) - 0.5) * 6.0
    passes = [
        dict(size=9 * k3, spacing=0.8, length=(1.0, 1.9), err=0.0, alpha=0.85, bristle=0.35, dry=0.25, blur=0.25, taper=0.5, ang_jitter=0.6),
        dict(size=4.6 * k3, spacing=0.85, length=(1.0, 1.8), err=0.02, alpha=0.9, bristle=0.35, dry=0.2, blur=0.15, taper=0.55, ang_jitter=0.7),
    ]
    can_l = Layer(w3, h3)
    paint(can_l, col, cov, flow, rng, passes, jitter=0.01, val_jitter=0.06, clip_soft=0, base=1.0)
    glaze(can_l, col, 0.68)
    sub.over(can_l)
    # as folhas soltas na beira iluminada, onde já estavam, e mais uma ao lado de cada
    for q in strokes[nt:]:
        qx, qy = loc(q[1], q[2])
        c = np.array(q[6], F32)
        sub.stroke(qx, qy, q[3], q[4] * K, max(1.0, q[5] * K * 0.8), c, q[7], rng, 0.2, 0.1, taper=q[8], soft=0.55)
        sub.stroke(qx + rng.normal(0, 2.2), qy + rng.normal(0, 2.2), q[3] + rng.normal(0, 0.6), q[4] * K * 0.8, max(1.0, q[5] * K * 0.6), c, q[7] * 0.8, rng, 0.2, 0.1, taper=q[8], soft=0.55)
    for q in dabs:
        qx, qy = loc(q[1], q[2])
        sub.dab(qx, qy, max(1.0, q[3] * K * 0.9), np.array(q[4], F32), q[5], 0.5)
    composite(out, sub, o3x, o3y)


def shadow3(L, e):
    """A sombra de uma árvore no chão (ground_shadow do pintor antigo)."""
    _, x, gy, size, col, alpha = e
    cx, rx, ry = x + size * 0.35, size * 0.75, size * 0.085
    X0, X1 = max(0, int((cx - rx - 4) * K)), min(L.W, int((cx + rx + 4) * K) + 1)
    Y0, Y1 = max(0, int((gy - ry - 4) * K)), min(L.H, int((gy + ry + 4) * K) + 1)
    if X0 >= X1 or Y0 >= Y1:
        return
    py, px = np.mgrid[Y0:Y1, X0:X1].astype(F32)
    xx, yy = (px + 0.5) / K - 0.5, (py + 0.5) / K - 0.5
    d = np.hypot((xx - cx) / rx, (yy - gy) / ry)
    a = sstep(1.0, 0.35, d) * alpha * sstep(cx + rx, x - size * 0.2, xx)
    P = L.P[Y0:Y1, X0:X1]
    A = L.A[Y0:Y1, X0:X1]
    P *= (1 - a)[..., None]
    P += np.asarray(col, F32) * a[..., None]
    A *= 1 - a
    A += a


def mid3(ev):
    TW, PAD, H = 2048, 256, 720
    W = TW + PAD
    w3, h3 = int(W * K), int(H * K)
    out = Layer(w3, h3)
    rng = np.random.default_rng(5103)
    i, nmd, nt, nh = 0, 0, 0, 0
    while i < len(ev):
        e = ev[i]
        if e[0] == 'md':
            assert ev[i - 1][0] == 'pn'
            base, amp = ((445, 60), (540, 44))[nmd]
            meadow3(out, ev, i, ev[i - 1], base, amp, w3, h3, rng)
            nmd += 1
            log('  campo', nmd)
            i = e[-1]
        elif e[0] == 'hs':
            house3(out, e, ev[i + 1:e[-1]], rng)
            nh += 1
            i = e[-1]
        elif e[0] == 'tr':
            tree3(out, e, ev[i + 1:e[-1]], rng)
            nt += 1
            i = e[-1]
        elif e[0] == 'sh':
            shadow3(out, e)
            i += 1
        else:
            i += 1
    log('  ', nh, 'casas,', nt, 'árvores')
    return seamless(out, int(TW * K), int(PAD * K))


# ======================================================================================
# o terreno da sala, direto em 3x
# ======================================================================================
MAPS = os.path.join(HERE, '..', 'game', 'src', 'world', 'maps.ts')
T3 = 48
E_D, E_M, E_L, E_R = hexc(0x2b1a12), hexc(0x5e3d25), hexc(0x94683f), hexc(0x7a4a2c)
G_D, G_M, G_L, G_S = hexc(0x2c6328), hexc(0x4c9234), hexc(0x8cc650), hexc(0xdcf290)
SUN_T, SHADE = hexc(0xfff1c8), hexc(0x3a3a52)
ST_D, ST_L = hexc(0x5d5a58), hexc(0xa8a49a)
ROOT_D, ROOT_L = hexc(0x2a190f), hexc(0x8a6646)
WD, WM, WL = hexc(0x3a2416), hexc(0x6a4528), hexc(0xa07448)
LT = np.array([-0.55, -0.62, 0.56], F32)
LT /= np.linalg.norm(LT)


def load_map(name):
    src = open(MAPS, encoding='utf-8').read()
    m = re.search(r'export const MAP_%s\s*=\s*\[(.*?)\];' % name.upper(), src, re.S)
    rows = re.findall(r"'([^']*)'", m.group(1))
    w = max(len(r) for r in rows)
    return [r.ljust(w, '.') for r in rows]


def stone(L, x, y, r, rng, wet=0.0):
    """Uma pedra enterrada: deitada, de contorno torto, com a luz em cima à esquerda, a sombra dela na terra
    e a terra subindo na beira de baixo."""
    rx, ry = r * rng.uniform(0.95, 1.4), r * rng.uniform(0.6, 0.9)
    th = rng.normal(0, 0.3)
    pad = int(max(rx, ry) * 1.3 + 6)
    X0, X1 = max(0, int(x) - pad), min(L.W, int(x) + pad + 1)
    Y0, Y1 = max(0, int(y) - pad), min(L.H, int(y) + pad + 1)
    if X0 >= X1 or Y0 >= Y1:
        return
    py, px = np.mgrid[Y0:Y1, X0:X1].astype(F32)
    dx, dy = px + 0.5 - x, py + 0.5 - y
    c, s = math.cos(th), math.sin(th)
    ph = rng.uniform(0, 2 * math.pi, 3)

    def shape(ddx, ddy, grow=1.0):
        u, v = (ddx * c + ddy * s) / (rx * grow), (-ddx * s + ddy * c) / (ry * grow)
        ang = np.arctan2(v, u)
        rad = 1 + 0.10 * np.sin(2 * ang + ph[0]) + 0.07 * np.sin(3 * ang + ph[1]) + 0.045 * np.sin(5 * ang + ph[2])
        return u, v, np.hypot(u, v) / rad

    u, v, q = shape(dx, dy)
    a = np.clip((1 - q) * min(rx, ry) + 0.5, 0, 1)
    P = L.P[Y0:Y1, X0:X1]
    # a sombra da pedra na terra, para baixo e para a direita
    _, _, qs = shape(dx - r * 0.16, dy - r * 0.2, 1.1)
    P *= (1 - 0.42 * sstep(1.0, 0.55, qs))[..., None]
    # o domo achatado
    qq = np.clip(q, 0, 1)
    f = qq ** 1.6
    nu, nv = u / np.maximum(q, 1e-3) * f, v / np.maximum(q, 1e-3) * f
    nz = np.sqrt(np.clip(1 - nu * nu - nv * nv, 0.02, 1))
    nx, ny = nu * c - nv * s, nu * s + nv * c
    shade = np.clip(nx * LT[0] + ny * LT[1] + nz * LT[2], 0, 1)
    t = rng.random()
    alb = mix(mix(ST_D, ST_L, 0.2 + 0.55 * t), E_M * 1.2, rng.uniform(0.18, 0.4))
    sp = value_noise(Y1 - Y0, X1 - X0, 2.4, rng, 2)
    col = alb * (0.36 + 0.92 * shade)[..., None] * (1 + (sp - 0.5) * 0.14)[..., None]
    col = col + hexc(0x8090b0) * (0.05 * (1 - shade))[..., None]
    if r > 9:
        # um veio claro atravessando as pedras grandes
        vph, vof = rng.uniform(0, math.pi), rng.uniform(-0.4, 0.4)
        vein = sstep(0.07, 0.02, np.abs(u * math.cos(vph) + v * math.sin(vph) - vof))
        col = col * (1 + 0.16 * vein)[..., None]
    # a beira de cima pega o sol; a de baixo fica na sombra e a terra sobe nela
    rimv = sstep(0.7, 0.98, qq) * np.clip(-(nx * 0.62 + ny * 0.78), 0, 1)
    col = col + SUN_T * (0.13 * rimv)[..., None]
    low = sstep(-0.1, 0.9, dy / ry)
    col = col * (1 - 0.3 * low)[..., None]
    col = col * (1 - 0.3 * wet)
    a = a * (1 - 0.7 * sstep(0.45, 1.0, dy / ry * 0.85 + dx / rx * 0.25) * sstep(0.55, 1.0, qq))
    col = np.clip(col, 0, 1)
    A = L.A[Y0:Y1, X0:X1]
    a = a * (A > 0.99)
    P *= (1 - a)[..., None]
    P += col * a[..., None]


def root(L, x, y, ang, length, width, rng, clip, depth=0):
    """Uma raiz: pedaços curtos que vão entortando e afinando; pode soltar um ramo."""
    n = max(3, int(length / 8))
    seg = length / n
    px, py, a = x, y, ang
    for i in range(n):
        t = i / n
        wd = max(0.9, width * (1 - 0.78 * t))
        a += rng.normal(0, 0.17) + (math.pi / 2 - a) * 0.05
        qx, qy = px + math.cos(a) * seg, py + math.sin(a) * seg
        mx, my = (px + qx) / 2, (py + qy) / 2
        if not (2 <= mx < L.W - 2 and 2 <= my < L.H - 2) or clip[int(my), int(mx)] < 0.5:
            return
        L.stroke(mx, my, a, seg + wd, wd, ROOT_D, 0.92, rng, 0.12, 0.0, taper=0.12, soft=0.55, clip=clip)
        if wd > 1.3:
            # o lado de cima e da esquerda da raiz pega a luz
            ex, ey = -math.sin(a), math.cos(a)
            sg = 1.0 if (ex * LT[0] + ey * LT[1]) > 0 else -1.0
            L.stroke(mx + sg * ex * wd * 0.28, my + sg * ey * wd * 0.28, a, seg + wd * 0.5, max(0.7, wd * 0.34), ROOT_L, 0.6, rng, 0.2, 0.0, taper=0.12, soft=0.5, clip=clip)
        if depth < 2 and wd > 1.4 and rng.random() < 0.13:
            root(L, qx, qy, a + rng.choice([-1, 1]) * rng.uniform(0.5, 1.0), length * (1 - t) * rng.uniform(0.35, 0.6), wd * 0.62, rng, clip, depth + 1)
        px, py = qx, qy


def terreno3():
    rows = load_map('memoria')
    g = np.array([list(r) for r in rows])
    h, w = g.shape
    H3, W3 = h * T3, w * T3
    rng = np.random.default_rng(5104)
    sol, wetc, plank = g == '#', g == '~', g == '-'

    def full(cx, cy):
        return True if (cx < 0 or cx >= w or cy < 0 or cy >= h) else bool(sol[cy, cx])

    M = np.kron(sol, np.ones((T3, T3), bool))
    # os cantos expostos arredondam para dentro (onde a tábua apoia, quase nada)
    for cy in range(h):
        for cx in range(w):
            if not sol[cy, cx]:
                continue
            for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
                if full(cx + dx, cy) or full(cx, cy + dy):
                    continue
                r = rng.uniform(5.0, 9.5) if dy < 0 else rng.uniform(4.0, 12.0)
                if 0 <= cx + dx < w and (plank[cy, cx + dx] or wetc[cy, cx + dx]):
                    r = 2.0
                kx, ky = (cx + (1 if dx > 0 else 0)) * T3, (cy + (1 if dy > 0 else 0)) * T3
                ax, ay = kx - dx * r, ky - dy * r
                x0, x1 = (int(kx - r) - 1, kx) if dx > 0 else (kx, int(kx + r) + 2)
                y0, y1 = (int(ky - r) - 1, ky) if dy > 0 else (ky, int(ky + r) + 2)
                x0, x1, y0, y1 = max(0, x0), min(W3, x1), max(0, y0), min(H3, y1)
                ys, xs = np.mgrid[y0:y1, x0:x1]
                ox, oy = (xs + 0.5 - ax) * dx, (ys + 0.5 - ay) * dy
                cut = (ox > 0) & (oy > 0) & (np.hypot(ox, oy) > r)
                M[y0:y1, x0:x1] &= ~cut
    BIG = 1e6
    yyi = np.arange(H3, dtype=F32)[:, None]
    xxi = np.arange(W3, dtype=F32)[None, :]

    def sides(m):
        dl = xxi - np.maximum.accumulate(np.where(~m, xxi, -BIG), axis=1)
        dr = np.minimum.accumulate(np.where(~m, xxi, BIG)[:, ::-1], axis=1)[:, ::-1] - xxi
        dt = yyi - np.maximum.accumulate(np.where(~m, yyi, -BIG), axis=0)
        return dl.astype(F32), dr.astype(F32), dt.astype(F32)

    # as faces de lado desbarrancam um pouco (só para dentro), abaixo da grama
    dl, dr, dt = sides(M)
    wob = 3.4 * sstep(0.35, 0.85, stretch(H3, W3, 22.0, 9.0, rng)) * sstep(14, 30, dt)
    M &= ~(np.minimum(dl, dr) < wob)
    dl, dr, dtop = sides(M)
    d = ndi.distance_transform_edt(np.pad(M, T3, constant_values=True))[T3:-T3, T3:-T3].astype(F32)
    cov = np.clip(blur(M.astype(F32), 0.7) * 2 - 0.5, 0, 1)
    wpx = np.kron(wetc, np.ones((T3, T3), bool))
    uw = np.zeros_like(M)
    uw[1:] = wpx[:-1]
    uw = np.maximum.accumulate(uw & M, axis=0) & M & (dtop < 36)
    near_w = blur(wpx.astype(F32), 10.0)
    log('  contorno')
    # ---- a terra: camadas tortas, veios avermelhados, linhas de sedimento, o húmus debaixo da grama ----
    warp = (value_noise(H3, W3, 110 * 1.5, rng, 2) - 0.5) * 105
    band = np.sin((yyi + warp) / 21.0) * 0.5 + 0.5
    band2 = np.sin((yyi + warp * 1.4) / 57.0 + 1.3) * 0.5 + 0.5
    strata = value_noise(H3, W3, 45, rng, 2)
    col = mix(E_M, E_L, (band * 0.45 + (strata - 0.5) * 0.5)[..., None])
    col = mix(col, E_R, (sstep(0.55, 0.9, band2) * 0.45)[..., None])
    fine = value_noise(H3, W3, 7.5, rng, 2)
    col *= (1 + (fine - 0.5) * 0.3)[..., None]
    ph = (yyi + warp * 1.15) / 31.0
    lines = sstep(0.05, 0.015, np.abs(ph - np.floor(ph) - 0.5)) * sstep(0.42, 0.6, value_noise(H3, W3, 70, rng, 2))
    col *= (1 - 0.2 * lines)[..., None]
    # um ou outro veio de areia clara
    sand = sstep(0.8, 0.93, stretch(H3, W3, 70.0, 9.0, rng)) * sstep(0.5, 0.75, strata)
    col = mix(col, E_L * 1.18, (sand * 0.4)[..., None])
    n_g = value_noise(H3, W3, 39, rng, 2)
    gd = (7 + 5 * n_g) * 3.0
    # a grama desce em pontas sobre a terra: cada fio tem o comprimento dele
    bw = 3.6
    bi = np.floor(xxi / bw).astype(np.int64)
    tip = 1 - np.abs(xxi / bw - bi - 0.5) * 2
    gde = (gd * 0.74 + (4 + 15 * RT[(bi * 7 + 3) % 4096]) * tip).astype(F32)
    hum = (9 + 7 * value_noise(H3, W3, 40, rng, 2)) * 3.0
    humus = sstep(gd + hum, gd + hum * 0.3, dtop) * (~uw)
    col = mix(col, E_D * 1.3, (humus * 0.5)[..., None])
    k = np.maximum(0.4, 1 - np.maximum(0, d / T3 - 0.7) * 0.2)
    col = mix(E_D, col, k[..., None])
    # o sol vem do alto à esquerda: as faces da esquerda claras, as da direita na sombra azulada
    col = mix(col, col * 1.3 + SUN_T * 0.12, (np.exp(-dl / 9.0) * 0.55)[..., None])
    col = mix(col, col * 0.6 + SHADE * 0.25, (np.exp(-dr / 15.0) * 0.55)[..., None])
    col = mix(col, E_D * 0.8, (np.exp(-np.maximum(0, dtop - gde) / 9.0) * (dtop > gde * 0.8) * 0.55 * (~uw))[..., None])
    # a terra molhada em volta do poço
    col = mix(col, col * 0.7 + hexc(0x20303a) * 0.08, np.clip(near_w * 1.6, 0, 1)[..., None])
    # ---- a grama ----
    grass = sstep(gde, gde * 0.72, dtop) * (~uw)
    gcol = mix(G_D, G_M, sstep(0.0, 0.8, 1 - dtop / gde)[..., None])
    gtone = value_noise(H3, W3, 6, rng, 2)
    gcol = mix(gcol, G_L, (sstep(0.5, 0.9, gtone) * sstep(gd * 0.6, 0, dtop))[..., None])
    gcol = mix(gcol, G_S, (sstep(3.6, 0, dtop) * 0.55)[..., None])
    gcol = gcol * (1 + (RT[(bi * 13 + 5) % 4096] - 0.5) * 0.22)[..., None]
    col = mix(col, gcol, grass[..., None])
    col = np.clip(col, 0, 1).astype(F32)
    log('  terra e grama')
    L = Layer(W3, H3)
    L.fill(col, cov)
    near = ((M & (d < 4 * T3)).astype(F32) * cov).astype(F32)
    flow = np.where(dtop < gd, -math.pi / 2, 0.0).astype(F32) + (value_noise(H3, W3, 45, rng, 2) - 0.5) * 0.5
    passes = [
        dict(size=12, spacing=0.85, length=(1.6, 3.8), err=0.0, alpha=0.6, bristle=0.5, dry=0.4, blur=0.12, taper=0.35, ang_jitter=0.2),
        dict(size=6, spacing=0.9, length=(1.6, 3.4), err=0.0, alpha=0.6, bristle=0.45, dry=0.35, blur=0.06, taper=0.4, ang_jitter=0.25),
    ]
    paint(L, col, near, flow, rng, passes, val_jitter=0.11, jitter=0.015, clip_soft=0, base=0.0)
    glaze(L, col, 0.35)
    # o alfa volta a ser o do contorno
    L.P *= (cov / np.maximum(L.A, 1e-4))[..., None]
    L.A[:] = cov
    log('  pinceladas')
    # ---- as pedras: grandes, médias e seixos (estes juntos nas linhas de cascalho) ----
    gravel = sstep(0.06, 0.02, np.abs(ph * 0.5 - np.floor(ph * 0.5) - 0.5)) * sstep(0.5, 0.7, value_noise(H3, W3, 90, rng, 2))
    stones = []
    for cellp, prob, rmin, rmax in ((250, 0.55, 15, 25), (84, 0.3, 7, 13), (26, 0.1, 2.4, 4.8)):
        for gy in range(0, H3, cellp):
            for gx in range(0, W3, cellp):
                x, y, r = gx + rng.uniform(0, cellp), gy + rng.uniform(0, cellp), rng.uniform(rmin, rmax)
                xi, yi = int(x), int(y)
                if not (0 <= xi < W3 and 0 <= yi < H3):
                    continue
                p = prob + (0.55 * float(gravel[yi, xi]) if cellp == 26 else 0.0)
                if rng.random() > p:
                    continue
                if d[yi, xi] < r * 1.5 + 5 or dtop[yi, xi] < gd[yi, xi] + r * 0.7 + 6 or d[yi, xi] > 5.2 * T3:
                    continue
                if any(math.hypot(x - sx_, y - sy_) < (r + sr_) * 1.05 for sx_, sy_, sr_ in stones if sr_ > 6):
                    continue
                stones.append((x, y, r))
    for x, y, r in stones:
        stone(L, x, y, r, rng, wet=float(np.clip(near_w[int(y), int(x)] * 1.6, 0, 1)))
    # seixos no fundo do poço
    ys, xs = np.nonzero(uw & (dtop > 2) & (dtop < 5))
    if len(xs):
        for j in rng.choice(len(xs), min(len(xs), 40), replace=False):
            stone(L, float(xs[j]), float(ys[j]) + rng.uniform(2, 7), rng.uniform(2.5, 5.5), rng, wet=1.0)
    log('  ', len(stones), 'pedras')
    # ---- as raízes: descem da grama; as mais grossas saem do pé de cada árvore da sala ----
    surf = np.argmax(M, axis=0)
    nroot = 0
    for x in range(10, W3 - 10):
        if rng.random() > 1 / 62 or surf[x] == 0 or uw[min(H3 - 1, surf[x] + 4), x]:
            continue
        y0 = surf[x] + float(gd[min(H3 - 1, surf[x] + 10), x]) * 0.8
        root(L, x, y0, math.pi / 2 + rng.normal(0, 0.5), rng.uniform(28, 110), rng.uniform(1.6, 3.0), rng, cov)
        nroot += 1
    for cy in range(h):
        for cx in range(w):
            if g[cy, cx] not in 'tT':
                continue
            big = g[cy, cx] == 'T'
            x = int((cx + 0.5) * T3)
            sy_ = surf[x]
            for _ in range(8 if big else 5):
                ox = rng.normal(0, 16 if big else 10)
                xx_ = int(np.clip(x + ox, 4, W3 - 5))
                if surf[xx_] == 0 or abs(int(surf[xx_]) - int(sy_)) > T3:
                    continue
                y0 = surf[xx_] + float(gd[min(H3 - 1, surf[xx_] + 10), xx_]) * 0.55
                ang = math.pi / 2 + np.clip(ox / 26, -1, 1) * 0.8 + rng.normal(0, 0.25)
                root(L, xx_, y0, ang, rng.uniform(90, 210) if big else rng.uniform(55, 130), rng.uniform(3.2, 5.4) if big else rng.uniform(2.2, 3.6), rng, cov)
                nroot += 1
    log('  ', nroot, 'raízes')
    # grãos claros e escuros na terra
    ys, xs = np.nonzero(M[::3, ::3] & (d[::3, ::3] > 5) & (d[::3, ::3] < 4.5 * T3) & (dtop[::3, ::3] > gd[::3, ::3] + 8))
    for j in rng.choice(len(xs), min(len(xs), 4200), replace=False):
        light = rng.random() < 0.45
        L.dab(xs[j] * 3 + rng.uniform(0, 3), ys[j] * 3 + rng.uniform(0, 3), rng.uniform(0.6, 1.5), E_L * 1.25 if light else E_D * 1.1, rng.uniform(0.3, 0.6), 0.5)
    L.P *= (cov / np.maximum(L.A, 1e-4))[..., None]
    L.A[:] = cov
    # ---- as folhas da grama em cima: primeiro as do fundo, mais escuras, depois as claras ----
    grassy = ~uw[np.minimum(H3 - 1, surf + 4), np.arange(W3)] & (surf > 0)
    for tier in (0, 1):
        for x in np.arange(1.0, W3 - 1, 2.6 if tier == 0 else 1.9):
            xi = int(x)
            if not grassy[xi] or rng.random() > (0.7 if tier == 0 else 0.85):
                continue
            ys_ = float(surf[xi])
            # na beira de um degrau as folhas caem para fora
            lean = 0.0
            if xi >= 12 and surf[xi - 12] > ys_ + 24:
                lean = -0.5
            elif xi < W3 - 12 and surf[xi + 12] > ys_ + 24:
                lean = 0.5
            ln = rng.uniform(10, 24) * (0.8 + 0.4 * float(n_g[min(H3 - 1, int(ys_) + 6), xi])) * (1.1 if tier == 0 else 1.0)
            ang = -math.pi / 2 + rng.normal(0, 0.34) + lean
            by = ys_ + rng.uniform(3, 9)
            up = max(0.2, -math.sin(ang))
            ln = min(ln, (by - (ys_ - rng.uniform(4.5, 9.5))) / up)
            if tier == 0:
                c = mix(G_D, G_M, rng.random())
            else:
                c = mix(G_M, G_L, rng.random()) if rng.random() < 0.68 else mix(G_L, G_S, rng.random() * 0.8)
            L.stroke(x + math.cos(ang) * ln * 0.5, by + math.sin(ang) * ln * 0.5, ang, ln, rng.uniform(1.7, 2.9), c, 0.94, rng, 0.12, 0.04,
                     taper=0.92, bend=rng.normal(0, 0.5), soft=0.55)
    log('  folhas')
    # ---- as tábuas sobre o poço ----
    for cy in range(h):
        cx = 0
        while cx < w:
            if not plank[cy, cx]:
                cx += 1
                continue
            c1 = cx
            while c1 < w and plank[cy, c1]:
                c1 += 1
            px0, px1, py0, phh = cx * T3, c1 * T3, cy * T3, 18
            n = px1 - px0
            u = np.arange(n, dtype=F32)[None, :]
            v = ((np.arange(phh, dtype=F32) + 0.5) / phh)[:, None]
            gr = ndi.zoom(value_noise(phh, n // 8 + 3, 2.2, rng, 2), (1, 8), order=1)[:, :n]
            f = 0.85 + 0.34 * (gr - 0.5) + 0.25 * (1 - v) ** 4 - 0.35 * v ** 3
            pc = WM * np.clip(f, 0.2, 1.5)[..., None]
            # os veios finos da madeira e um nó
            vein = sstep(0.75, 0.95, ndi.zoom(value_noise(phh, n // 20 + 3, 1.3, rng, 1), (1, 20), order=1)[:, :n])
            pc = pc * (1 - 0.18 * vein)[..., None]
            seams = [px for px in range(2 * T3, n - T3 // 2, 2 * T3)]
            for sx_ in seams:
                pc = mix(pc, WD, (sstep(1.6, 0.4, np.abs(u - sx_ - rng.normal(0, 2))) * 0.85 + 0 * v)[..., None])
            pc = mix(pc, SUN_T, ((v < 0.12) * 0.42 + 0 * u)[..., None])
            pc = pc * (1 - 0.45 * sstep(0.8, 1.0, v))[..., None]
            pc = mix(pc, WD, ((sstep(3.5, 0.5, u) + sstep(n - 4.5, n - 1.5, u)) * 0.7 + 0 * v)[..., None])
            for sx_ in seams + [T3 // 2, n - T3 // 2]:
                for off in ((-7, 0.5), (7, 0.5)) if sx_ in seams else ((0, 0.5),):
                    dd = np.hypot(u - (sx_ + off[0]), (v - off[1]) * phh)
                    pc = mix(pc, WD * 0.7, sstep(2.4, 1.4, dd)[..., None])
                    pc = mix(pc, WL * 1.2, sstep(1.1, 0.5, np.hypot(u - (sx_ + off[0]) + 0.6, (v - off[1]) * phh + 0.6))[..., None] * 0.8)
            L.P[py0:py0 + phh, px0:px1] = np.clip(pc, 0, 1)
            L.A[py0:py0 + phh, px0:px1] = 1
            cx = c1
    return L


def save_terreno(L):
    out = os.path.join(OUT, 'terreno')
    os.makedirs(out, exist_ok=True)
    img = L.image()
    half = img.width // 2
    for i in range(2):
        img.crop((i * half, 0, (i + 1) * half, img.height)).save(f'{out}/memoria-{i}.png')
    log('terreno', img.size)


def pack_terreno():
    """O pacote do terreno da Lembrança (assets/hd3/memory.json), com os mesmos pedaços do manifesto."""
    q = int(os.environ.get('Q', 86))
    man = json.load(open(os.path.join(HERE, '..', 'game', 'public', 'assets', 'hd', 'manifest.json')))
    t3 = man['terrain3']['memoria']
    assert t3['pack'] == 'memory' and [p['id'] for p in t3['pieces']] == ['memoria-0', 'memoria-1'], t3
    data = {}
    for p in t3['pieces']:
        im = Image.open(os.path.join(OUT, 'terreno', p['id'] + '.png')).convert('RGBA')
        assert im.size == (int(p['w'] * 3), int(p['h'] * 3)), (im.size, p)
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=q, method=6, alpha_quality=100)
        data[p['id']] = base64.b64encode(buf.getvalue()).decode('ascii')
    path = os.path.join(HERE, '..', 'game', 'public', 'assets', 'hd3', 'memory.json')
    json.dump(data, open(path, 'w'), separators=(',', ':'))
    print('memory.json', round(os.path.getsize(path) / 1e6, 2), 'MB')


# ======================================================================================
# conferir e ver
# ======================================================================================
def check(plan):
    """Confere a releitura do plano com o que o pintor antigo sorteou."""
    import brush
    worst = 0.0
    nv = 0
    for name in ('sky', 'far', 'mid'):
        ev = plan[name]
        for i, e in enumerate(ev):
            if e[0] == 'vn' and nv < 12 and e[1] * e[2] < 3e6:
                H, W = e[1], e[2]
                old = brush.value_noise(H, W, e[3], MP.gen(e[5]), e[4])
                new = vn_ev(e, np.arange(H), np.arange(W))
                dv = float(np.abs(old - new).max())
                worst = max(worst, dv)
                nv += 1
                print(f'{name} vn {H}x{W} célula {e[3]}: diferença {dv:.6f}')
            elif e[0] == 'pk':
                x = np.arange(e[1])
                r = peaks_read(e, x)[0][::16]
                dv = float(np.abs(r - np.array(e[-1])).max())
                worst = max(worst, dv)
                print(f'{name} cordilheira de {e[3]} picos: diferença da crista {dv:.4f}')
            elif e[0] == 'md':
                base, amp = ((445, 60), (540, 44))[sum(1 for q in ev[:i] if q[0] == 'md')]
                r = (base - amp * pn_ev(ev[i - 1], np.arange(ev[i - 1][1])))[::16]
                dv = float(np.abs(r - np.array(e[6])).max())
                worst = max(worst, dv)
                print(f'{name} campo: diferença da crista {dv:.4f}')
        trees = [e for e in ev if e[0] == 'tr']
        bad = 0
        for e in trees:
            got = tree3(None, e, [], None, check=True)
            if abs(got - e[10]['msum']) > max(3, 0.004 * e[10]['msum']):
                bad += 1
        if trees:
            print(f'{name}: {len(trees)} árvores, {bad} com a copa diferente da do pintor antigo')
            worst = max(worst, float(bad))
    print('pior diferença', round(worst, 5))
    return worst


def view(out):
    """Vista do jogo (640x360 no mundo, 3 px por px), a câmera na altura de quem anda no vale: o céu, as
    duas camadas na rolagem delas e o terreno; com --old, a mesma vista com os fundos 2x do EXTREME e o
    terreno em 3x de antes (pasta --old: mem-*.png e memoria-*.png)."""
    os.makedirs(out, exist_ok=True)
    SYW = 87

    def layer(src, name, k):
        p = f'{src}/{name}.png'
        if not os.path.exists(p):
            return None
        im = Image.open(p).convert('RGBA')
        return im if k == 3 else im.resize((im.width * 3 // k, im.height * 3 // k), Image.BICUBIC)

    def terr(src):
        ps = [f'{src}/memoria-{i}.png' for i in range(2)]
        if not all(os.path.exists(p) for p in ps):
            return None
        a, b = (Image.open(p).convert('RGBA') for p in ps)
        im = Image.new('RGBA', (a.width + b.width, a.height))
        im.paste(a, (0, 0))
        im.paste(b, (a.width, 0))
        return im

    for sx in (0, 520, 1040, 1600):
        for tag, src, k, tsrc in (('antes', OLD, 2, OLD), ('novo', OUT, 3, os.path.join(OUT, 'terreno'))):
            if not src:
                continue
            v = Image.new('RGBA', (1920, 1080), (0, 0, 0, 255))
            sky = layer(src, 'mem-sky', k)
            if sky:
                v.alpha_composite(sky.resize((1920, 1080), Image.BICUBIC) if sky.size != (1920, 1080) else sky)
            for name, fac, yoff in (('mem-far', 0.1, -26), ('mem-mid', 0.3, -42)):
                im = layer(src, name, k)
                if im is None:
                    continue
                shift = int(sx * fac * 3) % im.width
                strip = Image.new('RGBA', (1920, im.height))
                x = -shift
                while x < 1920:
                    strip.paste(im, (x, 0))
                    x += im.width
                v.alpha_composite(strip, (0, yoff * 3))
            t = terr(tsrc) or (terr(OLD) if OLD else None)
            if t is not None:
                v.alpha_composite(t.crop((sx * 3, SYW * 3, sx * 3 + 1920, SYW * 3 + 1080)))
            v.convert('RGB').save(f'{out}/mem-{sx}-{tag}.png')
    # o brilho de cada camada, antes e agora
    for name in ('mem-sky', 'mem-far', 'mem-mid'):
        vals = []
        for src in (OLD, OUT):
            p = f'{src}/{name}.png' if src else ''
            if not src or not os.path.exists(p):
                vals.append(None)
                continue
            arr = np.asarray(Image.open(p).convert('RGBA'), F32) / 255
            a = arr[..., 3]
            vals.append(((arr[..., :3] * a[..., None]).sum((0, 1)) / max(1e-6, a.sum()), float(a.mean())))
        print(name, ' | '.join('sem' if q is None else f'{q[0][0]:.4f} {q[0][1]:.4f} {q[0][2]:.4f} alfa {q[1]:.4f}' for q in vals))
    for tag, src in (('terreno antes', OLD), ('terreno novo', os.path.join(OUT, 'terreno'))):
        t = terr(src) if src else None
        if t is None:
            continue
        arr = np.asarray(t, F32) / 255
        a = arr[..., 3]
        rgbm = (arr[..., :3] * a[..., None]).sum((0, 1)) / max(1e-6, a.sum())
        top = arr[8 * 48:, :, :]
        print(tag, f'{rgbm[0]:.4f} {rgbm[1]:.4f} {rgbm[2]:.4f} alfa {float(a.mean()):.4f}', 'faixa de cima', np.round((top[..., :3] * top[..., 3:]).sum((0, 1)) / max(1e-6, top[..., 3].sum()), 4))
    log('vistas em', out)


if __name__ == '__main__':
    if '--pack' in sys.argv:
        pack_terreno()
        sys.exit(0)
    plan = MP.load()
    if '--check' in sys.argv:
        sys.exit(1 if check(plan) > 0.01 else 0)
    if want('sky'):
        save_layer(sky3(plan['sky']), 'mem-sky', opaque=True)
    if want('far'):
        save_layer(far3(plan['far']), 'mem-far')
    if want('mid'):
        save_layer(mid3(plan['mid']), 'mem-mid')
    if want('terreno'):
        save_terreno(terreno3())
    if PREVIEW:
        view(PREVIEW)

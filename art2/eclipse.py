"""ECLIPSE: a sobrepintura do terreno, em 3x (um pixel da pintura por pixel de uma tela de 1080 linhas).

Parte da pintura 2x do EXTREME de cada sala (os pedaços de game/public/assets/hd) e do mapa, e refaz o
contorno: a pedra deixa de acabar em linha de régua. Os cantos ficam arredondados ou cheios conforme o
material, nas paredes e no lado de baixo das lajes as pedras saem cada uma um pouco, do teto pendem
pingentes de gelo, raízes ou dentes de pedra, e a neve fica em montes que passam da beira e se acumulam
encostados nas paredes.

Regras que seguram o resultado:
- nada da pintura original some, a não ser a ponta dos cantos: o contorno só cresce (correntes, tábuas,
  grama fina, argolas e tudo o que é fino fica como está);
- o que cresce não é preenchido com cor: a pintura original é esticada junto com o contorno (a beira
  pintada, as rachaduras e o brilho da neve vão junto, sem emenda);
- o chão das salas de pedra continua na linha da grade (é onde o cavaleiro pisa);
- perto do que tem de casar com a grade (tábuas, espinhos, grades, paredes falsas, vitrais, Âmbar, gelo
  liso) o contorno não muda.

uso: python3 eclipse.py <sala> x0 y0 x1 y1      prévia de um recorte (em tiles): antes | depois
     python3 eclipse.py <sala> [<sala>...]      a sala inteira: pedaços WebP em SAIDA e <sala>.json
     python3 eclipse.py --todas                 todas as salas do manifesto
"""
import json
import os
import re
import sys
import time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('JOGO') or os.path.join(HERE, '..')
HD = os.path.join(ROOT, 'game', 'public', 'assets', 'hd')
MAPS = os.path.join(ROOT, 'game', 'src', 'world', 'maps.ts')
ROOMS = os.path.join(ROOT, 'game', 'src', 'world', 'rooms.ts')
OUT = os.environ.get('SAIDA') or os.path.join(HERE, 'hd_eclipse')
TILE = 16
K = 3            # px da saída por px do mundo
T = TILE * K
MAXP = 4096      # lado máximo de um pedaço (toda placa de vídeo com WebGL aguenta)
Q = int(os.environ.get('Q', 86))

# o que tem de continuar casando com a grade: o contorno em volta não muda
FROZEN_1 = '-"'             # tábuas e plataformas de cenário: só a célula e as vizinhas
FROZEN_S = '^'              # espinhos: nada de pingente por perto (não pode parecer perigo novo)
FROZEN_2 = '%V@|Y=:&!;+'    # paredes falsas, vitrais, Âmbar, grades, alçapões, membranas, gelo fino, ferro liso
ICE = '_;'                  # chão de gelo: fica liso, sem monte de neve


def load_maps():
    src = open(MAPS, encoding='utf-8').read()
    out = {}
    for m in re.finditer(r'export const MAP_(\w+)\s*=\s*\[(.*?)\];', src, re.S):
        rows = re.findall(r"'([^']*)'", m.group(2))
        w = max(len(r) for r in rows)
        out[m.group(1).lower()] = [r.ljust(w, '.') for r in rows]
    return out


def load_themes():
    src = open(ROOMS, encoding='utf-8').read()
    return {m.group(1): m.group(2) for m in re.finditer(r"id: '(\w+)',\s*map: MAP_\w+,\s*theme: '(\w+)'", src)}


def junta(room, man=None):
    """A pintura 2x da sala, remontada dos pedaços."""
    man = man or json.load(open(os.path.join(HD, 'manifest.json')))
    t = man['terrain'][room]
    s = t['scale']
    W = int(round(max((p['x'] + p['w']) for p in t['pieces']) * s))
    H = int(round(max((p['y'] + p['h']) for p in t['pieces']) * s))
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for p in t['pieces']:
        im.paste(Image.open(os.path.join(HD, p['file'])).convert('RGBA'), (int(round(p['x'] * s)), int(round(p['y'] * s))))
    return im, s


# ---------- ruído ----------
def noise1(n, cell, rng, octaves=2):
    """Ruído suave ao longo de uma linha (0..1)."""
    out = np.zeros(n, np.float32)
    amp, tot = 1.0, 0.0
    xs = np.arange(n, dtype=np.float32)
    for o in range(octaves):
        c = max(cell / (2 ** o), 2.0)
        g = rng.random(int(n / c) + 3).astype(np.float32)
        t = xs / c
        i = t.astype(np.int32)
        f = t - i
        f = f * f * (3 - 2 * f)
        out += amp * (g[i] * (1 - f) + g[i + 1] * f)
        tot += amp
        amp *= 0.5
    return out / tot


def blocks1(n, lo, hi, rng, soft=1.2):
    """Pedras ao longo de uma linha: trechos de lo..hi px, cada um com quanto sai (0..1), as juntas amaciadas."""
    out = np.zeros(n, np.float32)
    i = 0
    while i < n:
        L = max(int(rng.uniform(lo, hi)), 2)
        v = rng.random()
        out[i:i + L] = v * v if rng.random() < 0.7 else 0.55 + 0.45 * v
        i += L
    return ndi.gaussian_filter1d(out, soft, mode='nearest')


def edt(m, idx=False):
    if idx:
        d, ind = ndi.distance_transform_edt(m, return_indices=True)
        return d.astype(np.float32), ind[0].astype(np.int32), ind[1].astype(np.int32)
    return ndi.distance_transform_edt(m).astype(np.float32)


def lum(c):
    return c[..., 0] * 0.299 + c[..., 1] * 0.587 + c[..., 2] * 0.114


def stamp(points, R, H, W):
    """Discos de raio R em volta de cada vértice da grade (linha, coluna em tiles)."""
    m = np.zeros((H, W), bool)
    r = int(np.ceil(R))
    oy, ox = np.ogrid[-r:r + 1, -r:r + 1]
    disk = (oy * oy + ox * ox) <= R * R
    for i, j in points:
        cy, cx = int(i) * T, int(j) * T
        y0, y1, x0, x1 = max(0, cy - r), min(H, cy + r + 1), max(0, cx - r), min(W, cx + r + 1)
        if y0 < y1 and x0 < x1:
            m[y0:y1, x0:x1] |= disk[y0 - cy + r:y1 - cy + r, x0 - cx + r:x1 - cx + r]
    return m


def grid_up(a, H, W):
    """Um valor por célula esticado suave até o tamanho da pintura."""
    return np.asarray(Image.fromarray(a.astype(np.float32), 'F').resize((W, H), Image.BILINEAR), np.float32)


def roots(orig, rng, H, W, l0, l1):
    """Raízes finas pendendo: cobertura (0..1), de que lado do fio está cada ponto (-1 luz .. 1 sombra) e o tom de cada uma."""
    cov = np.zeros((H, W), np.float32)
    side = np.zeros((H, W), np.float32)
    tone = np.ones((H, W), np.float32)

    def stroke(y0, x0, L, r0, amp, f, ph, drift, tn):
        n = int(L) + 4
        t = np.arange(-3, n - 3, dtype=np.float32)
        py = y0 + t
        px = x0 + amp * np.sin(t * f + ph) * np.clip(t / (0.3 * L), 0, 1) + drift * np.clip(t, 0, None)
        rr = r0 * np.clip(1 - t / L, 0.1, 1) ** 0.7
        ya, yb = max(0, int(y0 - 4)), min(H, int(y0 + L + 3))
        xa, xb = max(0, int(px.min() - r0 - 2)), min(W, int(px.max() + r0 + 3))
        if ya >= yb or xa >= xb:
            return px, py
        gy, gx = np.mgrid[ya:yb, xa:xb].astype(np.float32)
        d = np.hypot(gy[..., None] - py, gx[..., None] - px) - rr
        j = d.argmin(axis=2)
        dm = np.take_along_axis(d, j[..., None], axis=2)[..., 0]
        c = np.clip(0.5 - dm, 0, 1)
        sd = np.clip((gx - px[j]) / np.maximum(rr[j], 0.5), -1, 1)
        win = (slice(ya, yb), slice(xa, xb))
        new = c > cov[win]
        side[win] = np.where(new, sd, side[win])
        tone[win] = np.where(new, tn, tone[win])
        cov[win] = np.maximum(cov[win], c)
        return px, py

    for y0, x0 in orig:
        L = rng.uniform(l0, l1) * K * (1.0 if rng.random() < 0.75 else 1.7)
        r0 = rng.uniform(0.38, 0.72) * K
        amp, f = rng.uniform(0.2, 1.1) * K, rng.uniform(0.10, 0.26) / K * 3
        drift = rng.uniform(-0.22, 0.22)
        tn = rng.uniform(0.82, 1.2)
        px, py = stroke(float(y0), float(x0), L, r0, amp, f, rng.uniform(0, 6.28), drift, tn)
        if rng.random() < 0.3 and L > 5 * K:
            i = int(len(px) * rng.uniform(0.35, 0.6))
            stroke(float(py[i]), float(px[i]), L * rng.uniform(0.3, 0.5), r0 * 0.6, amp * 0.5, f * 1.3, rng.uniform(0, 6.28),
                   drift + rng.choice([-1, 1]) * rng.uniform(0.3, 0.6), tn)
    return cov, side, tone


# ---------- o material de cada tema ----------
# open/close: raio (px do mundo) do arredondamento dos cantos de fora e do enchimento dos cantos de dentro;
# wall/ceil: quanto as pedras saem na parede e no teto (px do mundo); block: o tamanho das pedras;
# drip: o que pende do teto (o quê, quantos por px do mundo, comprimento mínimo e máximo em px do mundo): só na
#   pedra bruta, no gelo e na terra (alvenaria não tem estalactite, e dente escuro no teto pareceria espinho);
# cover: a cobertura macia do chão (neve), só onde a pintura tem essa faixa clara em cima:
#   montes (mínimo e máximo), aba que passa da beira, cantos mais redondos e o monte encostado na parede
#   (drift: altura junto da parede e até onde ele vai pelo chão, em px do mundo)
THEMES = {
    'snow': dict(open=1.2, close=0.0, wall=1.7, ceil=1.5, undul=0.6, block=(5, 16), drip=('gelo', 0.085, 4, 11),
                 cover=dict(lum=0.62, floor=(0.3, 5.2), lip=2.4, open=3.2, drift=(8.0, 20.0))),
    'vale': dict(open=1.4, close=1.2, wall=1.9, ceil=1.8, undul=1.0, block=(7, 22), drip=('raiz', 0.05, 3, 9), cover=None),
    'mine': dict(open=1.6, close=1.4, wall=2.3, ceil=2.4, undul=1.0, block=(6, 20), drip=('pedra', 0.05, 3, 8), cover=None),
    'catacomb': dict(open=1.0, close=0.0, wall=1.2, ceil=1.2, undul=0.0, block=(8, 18), drip=None, cover=None),
    'prison': dict(open=0.9, close=0.0, wall=1.1, ceil=1.1, undul=0.0, block=(8, 18), drip=None, cover=None),
    'city': dict(open=0.9, close=0.0, wall=1.0, ceil=1.0, undul=0.0, block=(9, 20), drip=None, cover=None),
    'nave': dict(open=0.7, close=0.0, wall=0.8, ceil=0.8, undul=0.0, block=(10, 22), drip=None, cover=None),
    'bridge': dict(open=1.0, close=0.0, wall=1.0, ceil=1.0, undul=0.0, block=(9, 20), drip=None, cover=None),
    'torres': dict(open=0.7, close=0.0, wall=0.8, ceil=0.8, undul=0.0, block=(10, 24), drip=None, cover=None),
    'memory': dict(open=1.4, close=1.2, wall=1.2, ceil=1.2, undul=0.8, block=(9, 24), drip=None, cover=None),
}
BAND = 2 * T      # faixas de 2 tiles: cada parede e cada teto com as suas pedras
R_IN = 6 * K      # até que fundura a pintura estica junto com o contorno


def eclipse(room, rows, theme, src, s_src, crop=None, seed=None, log=None):
    """Devolve (antes, depois): RGBA float 0..1 em 3x (alfa não pré-multiplicado). crop = (x0, y0, x1, y1) em tiles."""
    cfg = THEMES[theme]
    cov = cfg['cover']
    rng = np.random.default_rng(seed if seed is not None else sum(ord(c) for c in room) * 131 + 7)
    h, w = len(rows), len(rows[0])
    G = np.array([list(r) for r in rows])
    if crop:
        x0, y0, x1, y1 = crop
        mg = 4  # margem em tiles para o contorno não sentir a borda do recorte
        cx0, cy0, cx1, cy1 = max(0, x0 - mg), max(0, y0 - mg), min(w, x1 + mg), min(h, y1 + mg)
    else:
        cx0, cy0, cx1, cy1 = 0, 0, w, h
    # uma célula de borda repetida em volta: fora da sala o cenário continua como na beira
    g = np.pad(G[cy0:cy1, cx0:cx1], 1, mode='edge')
    box = tuple(int(round(v * TILE * s_src)) for v in (cx0, cy0, cx1, cy1))
    im = src.crop(box)
    # 2x -> 3x com o alfa pré-multiplicado (a franja não escurece)
    base = np.asarray(im.convert('RGBa').resize(((cx1 - cx0) * T, (cy1 - cy0) * T), Image.LANCZOS).convert('RGBA'), np.float32) / 255
    base = np.pad(base, ((T, T), (T, T), (0, 0)), mode='edge')
    rgb0, a0 = np.ascontiguousarray(base[..., :3]), np.ascontiguousarray(base[..., 3])
    del base
    H, W = a0.shape
    hh, ww = g.shape
    A0 = a0 >= 0.5
    yi = np.arange(H, dtype=np.int32)[:, None]
    xi = np.arange(W, dtype=np.int32)[None, :]

    # ---------- a grade: células pintadas cheias, vértices, o que não muda ----------
    solid = a0.reshape(hh, T, ww, T).mean(axis=(1, 3)) > 0.5
    sp = np.kron(solid.astype(np.uint8), np.ones((T, T), np.uint8))

    def gdist(chars):
        m = np.isin(g, list(chars))
        return ndi.distance_transform_edt(~m).astype(np.float32) if m.any() else np.full(g.shape, 99, np.float32)

    free_g = np.minimum(np.clip((gdist(FROZEN_1) - 1.0) / 0.9, 0, 1), np.clip((gdist(FROZEN_2) - 1.6) / 0.9, 0, 1))
    free = grid_up(free_g, H, W)
    nospike = grid_up(np.clip((gdist(FROZEN_S) - 1.5) / 1.0, 0, 1), H, W)
    s4 = np.pad(solid, 1, mode='edge').astype(np.int8)
    n4 = s4[:-1, :-1] + s4[:-1, 1:] + s4[1:, :-1] + s4[1:, 1:]      # células cheias em volta de cada vértice
    convex = np.argwhere(n4 == 1)
    concave = np.argwhere(n4 == 3)

    # ---------- o maciço: a pintura das células cheias, com uma margem (mais para cima: a neve passa da grade) ----------
    m, up = 3 * K, 16
    near = ndi.maximum_filter1d(sp, size=2 * m + 1, axis=1)
    near = ndi.maximum_filter1d(np.pad(near, ((0, up), (0, 0)), mode='edge'), size=2 * (m + up // 2) + 1, axis=0)[up // 2:up // 2 + H]
    Ab = A0 & (near > 0)
    del near, sp
    din = edt(Ab)

    # ---------- a cobertura macia (neve): onde a faixa de cima da pintura é clara ----------
    zone = None
    if cov:
        last_air = np.maximum.accumulate(np.where(~Ab, yi, -1), axis=0)
        depth = yi - last_air
        bright = Ab & (depth >= 2) & (depth <= 7 * K) & (lum(rgb0) > cov['lum'])
        if bright.sum() > 60:
            dz, ty, tx = edt(~bright, idx=True)
            zone = np.clip(1.5 - dz / (9.0 * K), 0, 1) * np.clip(1 - (yi - ty) / (16.0 * K), 0, 1)
            zone *= grid_up(np.clip((gdist(ICE) - 0.8) / 0.8, 0, 1), H, W)
            del dz, ty, tx
        del last_air, depth, bright
    zs = zone > 0.5 if zone is not None else None

    # ---------- cantos de fora: arredonda (só perto dos vértices da grade) ----------
    def opened(ro):
        d = edt(~(din > ro))
        return np.clip(np.floor(ro) - d + 1.0, 0, 1)

    cut = np.zeros((H, W), np.float32)
    ro = cfg['open'] * K
    if ro >= 1.0 and len(convex):
        zc = stamp(convex, 2.6 * ro + 2, H, W)
        cut = np.where(zc & Ab, 1 - opened(ro), 0).astype(np.float32)
        if zs is not None:
            ro2 = cov['open'] * K
            zc2 = stamp(convex, 2.6 * ro2 + 2, H, W) & zs
            cut = np.where(zc2, np.where(Ab, 1 - opened(ro2), 0), cut).astype(np.float32)
    cut *= free > 0.5
    Ac = Ab & (cut < 0.5)

    # ---------- cantos de dentro: enche (pedra: pouco; neve: o monte encostado na parede, onde tem chão) ----------
    nbx, nby = W // BAND + 2, H // BAND + 2
    moundP = lipN = None
    if zs is not None:
        # os montes de neve ao longo do chão: uma ondulação larga mais uma miúda, cada faixa de altura com a sua
        f0, f1 = cov['floor']
        moundP = np.stack([noise1(W, 60 * K, rng, 3) for _ in range(nby)])
        mn, mx = moundP.min(axis=1, keepdims=True), moundP.max(axis=1, keepdims=True)
        moundP = (f0 + (f1 - f0) * ((moundP - mn) / np.maximum(mx - mn, 1e-3)) ** 1.3) * K
        moundP *= np.stack([0.8 + 0.4 * noise1(W, 14 * K, rng, 2) for _ in range(nby)])
        lipN = np.stack([0.5 + noise1(H, 22 * K, rng) for _ in range(nbx)])
    add = np.zeros((H, W), np.float32)
    rc = cfg['close'] * K
    if rc >= 3.0 and len(concave):
        dout = edt(~Ab)
        d = edt(dout <= rc)             # distância até o que fica longe da pintura
        add = np.where(stamp(concave, 2.6 * rc + 2, H, W), np.clip(d - np.floor(rc), 0, 1) * (~Ab), 0).astype(np.float32)
        del dout, d
    if zs is not None:
        # a neve encostada na parede: uma rampa côncava, alta junto da parede e sumindo no chão
        hd, ld = cov['drift']
        below = np.minimum.accumulate(np.where(Ab, yi, 10 ** 7)[::-1], axis=0)[::-1] - yi          # até o chão de baixo
        above = yi - np.maximum.accumulate(np.where(Ab, yi, -10 ** 7), axis=0)                      # até o teto de cima
        left = xi - np.maximum.accumulate(np.where(Ab, xi, -10 ** 7), axis=1)                       # até a parede da esquerda
        right = np.minimum.accumulate(np.where(Ab, xi, 10 ** 7)[:, ::-1], axis=1)[:, ::-1] - xi     # e da direita
        # cada monte com a sua altura (varia devagar ao longo da sala)
        var = (0.45 + 0.9 * noise1(W, 90 * K, rng))[None, :]
        hh_ = hd * K * var * np.maximum(np.clip(1 - left / (ld * K * var), 0, 1), np.clip(1 - right / (ld * K * var), 0, 1)) ** 1.6
        fy = np.broadcast_to(np.clip(yi + np.minimum(below, H - 1), 0, H - 1).astype(np.int64), (H, W))
        zfloor = np.take_along_axis(zone, fy, axis=0) > 0.5                                         # o chão embaixo é de neve
        mound = moundP[(fy // BAND) % nby, np.broadcast_to(xi, (H, W))]                             # o monte do chão ali
        ramp = np.clip(mound + hh_ - below + 1.0, 0, 1) * (hh_ > 0.5) * (~Ab) * zfloor * (above > below + 3 * K)
        add = np.maximum(add, ramp).astype(np.float32)
        del below, above, left, right, hh_, fy, zfloor, ramp, mound
    add *= free > 0.5

    # ---------- quanto o contorno cresce para fora (só cresce) ----------
    dist, iy, ix = edt(~Ac, idx=True)                 # fora: distância e o ponto da pintura mais perto
    lo, hi = cfg['block']
    wallP = np.stack([blocks1(H, lo * K, hi * K, rng) for _ in range(nbx)])        # [faixa de colunas, y]
    ceilP = np.stack([blocks1(W, lo * K, hi * K, rng) for _ in range(nby)])        # [faixa de linhas, x]
    wallU = np.stack([noise1(H, 40 * K, rng) for _ in range(nbx)])
    ceilU = np.stack([noise1(W, 34 * K, rng) for _ in range(nby)])
    Dmax = (max(cfg['wall'], cfg['ceil']) + 1.0) * K
    # as pedras da pintura: numa faixa logo atrás da beira, cada trecho entre duas juntas ou rachaduras que
    # chegam até a beira (linhas finas, escuras ou claras) é a face de uma pedra, e sai inteira o mesmo
    # tanto; onde a pintura não tem junta (terra em camadas, trecho comprido demais) valem os trechos sorteados
    L0 = lum(rgb0)
    Lb = ndi.gaussian_filter(L0, 1.5 * K)
    joint = ndi.maximum_filter((np.abs(L0 - Lb) > 0.014 + 0.055 * Lb).astype(np.uint8), size=3) > 0
    lab, nlab = ndi.label(Ab & (din > 2.0 * K) & (din < 6.0 * K) & ~joint)
    area = np.bincount(lab.ravel(), minlength=nlab + 1)
    stone = (area > 4 * K * 4 * K) & (area < 4 * K * 46 * K)
    stone[0] = False
    rv = rng.random(nlab + 1)
    stonev = np.where(rng.random(nlab + 1) < 0.6, rv * rv, 0.5 + 0.5 * rv).astype(np.float32)
    if log is not None:
        log['pedras'] = int(stone.sum())
        log['faixa'] = round(float(area[stone].sum() / max(area[1:].sum(), 1)), 2)
    del L0, Lb, joint, area
    dripP = None
    if cfg['drip'] and cfg['drip'][0] != 'raiz':
        what, dens, l0, l1 = cfg['drip']
        dripP = np.zeros((nby, W), np.float32)
        xs = np.arange(W, dtype=np.float32)
        for b in range(nby):
            for _ in range(rng.poisson(W / K * dens)):
                cx = rng.uniform(0, W)
                L = rng.uniform(l0, l1) * K * (1.0 if rng.random() < 0.8 else 1.5)
                half = max(L * rng.uniform(0.15, 0.28), 1.8)
                dripP[b] = np.maximum(dripP[b], L * np.clip(1 - np.abs(xs - cx) / half, 0, 1) ** 1.2)
        Dmax = max(Dmax, l1 * K * 1.5 + 2)
    if zs is not None:
        Dmax = max(Dmax, (cov['floor'][1] * 1.2 + 1) * K, (cov['lip'] * 1.5 + 1) * K)

    def growth(py, px, by, bx, vy, vx):
        """Quanto cresce o contorno no ponto (by, bx) da beira, olhando para fora na direção (vy, vx)."""
        w_top = np.clip(-vy, 0, 1) ** 2
        w_bot = np.clip(vy, 0, 1) ** 2
        w_side = vx * vx
        fb = free[by, bx]
        kx, ky = (bx // BAND) % nbx, (by // BAND) % nby
        # a pedra pintada que fica atrás deste ponto da beira (um pouco para dentro)
        l1 = lab[np.clip(np.rint(by - vy * 3.2 * K).astype(np.int32), 0, H - 1), np.clip(np.rint(bx - vx * 3.2 * K).astype(np.int32), 0, W - 1)]
        l2 = lab[np.clip(np.rint(by - vy * 4.8 * K).astype(np.int32), 0, H - 1), np.clip(np.rint(bx - vx * 4.8 * K).astype(np.int32), 0, W - 1)]
        l = np.where(stone[l1], l1, l2)
        has = stone[l]
        und = cfg['undul'] * 0.35
        wall = np.where(has, stonev[l], wallP[kx, py]) * 0.8 + wallU[kx, py] * und
        ceil = np.where(has, stonev[l], ceilP[ky, px]) * 0.8 + ceilU[ky, px] * und
        d = w_side * cfg['wall'] * K * wall + w_bot * cfg['ceil'] * K * ceil
        dr = np.zeros_like(d)
        if dripP is not None:
            # só no teto de verdade (em face inclinada o dente sairia torto)
            dr = np.clip((vy - 0.8) / 0.15, 0, 1) * dripP[ky, px] * nospike[by, bx]
        if zs is not None:
            z = zone[by, bx]
            ds = w_top * moundP[ky, px] + w_side * cov['lip'] * K * lipN[kx, py]
            d = d * (1 - z) + ds * z
            dr = dr * (1 - z)
        return d * fb, dr * fb

    # fora, perto da pintura
    oy, ox = np.nonzero((dist > 0) & (dist < Dmax + 1))
    od = dist[oy, ox]
    oby, obx = iy[oy, ox], ix[oy, ox]
    ovy, ovx = (oy - oby) / od, (ox - obx) / od
    oD, oDr = growth(oy, ox, oby, obx, ovy, ovx)
    gm = np.clip(oD - od + 1.0, 0, 1)                 # o maciço que cresceu
    gt = np.clip(oD + oDr - od + 1.0, 0, 1)           # com o que pende
    grown = np.zeros((H, W), np.float32)
    grown[oy, ox] = gm
    dripc = np.zeros((H, W), np.float32)
    dripc[oy, ox] = gt - gm
    # longe do maciço (o que é fino de verdade, não a franja da beira antiga)
    far = np.clip(dist - 1.5, 0, 1)
    del dist, iy, ix

    # ---------- a cor: a pintura original esticada junto com o contorno ----------
    # cores estendidas para fora da pintura (o ponto opaco mais perto), para amostrar sem pegar transparente
    _, ey, ex = edt(a0 < 0.98, idx=True)
    rgbe = rgb0[ey, ex]
    del ey, ex

    def sample(qy, qx):
        qy = np.clip(qy, 0, H - 1.001)
        qx = np.clip(qx, 0, W - 1.001)
        y_, x_ = qy.astype(np.int32), qx.astype(np.int32)
        fy, fx = (qy - y_)[:, None], (qx - x_)[:, None]
        return (rgbe[y_, x_] * (1 - fy) * (1 - fx) + rgbe[y_, x_ + 1] * (1 - fy) * fx
                + rgbe[y_ + 1, x_] * fy * (1 - fx) + rgbe[y_ + 1, x_ + 1] * fy * fx)

    rgb = rgbe.copy()
    # fora: cada ponto novo mostra a pintura de mais para dentro, na proporção da fundura
    sh = oD * (R_IN + od) / (R_IN + oD)
    sel = (gt > 0.003)
    rgb[oy[sel], ox[sel]] = sample(oy[sel] - ovy[sel] * np.minimum(sh[sel], od[sel] + R_IN), ox[sel] - ovx[sel] * np.minimum(sh[sel], od[sel] + R_IN))
    tipk = np.zeros((H, W), np.float32)
    dcol = None
    if dripP is not None:
        # ao longo do que pende: 0 na raiz, 1 na ponta
        seld = (gt - gm) > 0.003
        tipk[oy[seld], ox[seld]] = np.clip((od[seld] - oD[seld]) / np.maximum(oDr[seld], 1.0), 0, 1)
        if cfg['drip'][0] == 'pedra':
            # a cor do corpo da rocha (de mais para dentro, longe da linha escura da beira)
            dcol = np.zeros((H, W, 3), np.float32)
            dcol[oy[seld], ox[seld]] = sample(oby[seld] - ovy[seld] * 5.0 * K, obx[seld] - ovx[seld] * 5.0 * K)
    root_from = None
    if cfg['drip'] and cfg['drip'][0] == 'raiz':
        # raízes saem do lado de baixo da terra, longe de espinho e do que não muda
        c = np.nonzero((od < 1.5) & (ovy > 0.95) & (free[oby, obx] > 0.6) & (nospike[oby, obx] > 0.6))[0]
        n = rng.poisson(len(c) / K * cfg['drip'][1])
        if n and len(c):
            pick = rng.choice(c, size=min(n, len(c)), replace=False)
            root_from = np.stack([oy[pick], ox[pick]], axis=1)
    del od, oby, obx, ovy, ovx, oD, oDr, gm, gt, sh, sel
    # dentro: a faixa perto da beira estica para acompanhar
    din_c, jy, jx = edt(Ac, idx=True)
    py, px = np.nonzero(Ac & (din_c < R_IN))
    pd = din_c[py, px]
    pby, pbx = jy[py, px], jx[py, px]
    pvy, pvx = (pby - py) / pd, (pbx - px) / pd
    pD, _ = growth(py, px, pby, pbx, pvy, pvx)
    s = pd - 0.5
    sh = pD * (R_IN - s) / (R_IN + pD)
    sel = sh > 0.05
    rgb[py[sel], px[sel]] = sample(py[sel] - pvy[sel] * sh[sel], px[sel] - pvx[sel] * sh[sel])
    del din_c, jy, jx, py, px, pd, pby, pbx, pvy, pvx, pD, s, sh, sel

    # o maciço novo e o alfa final
    aB = np.maximum(np.where(Ab, 1 - cut, 0), np.maximum(grown, add))
    cutf = ndi.maximum_filter(cut, size=3)            # a franja do canto que saiu vai junto
    a1 = np.maximum(a0 * (1 - cutf), np.maximum(aB, grown + dripc))
    A1 = aB >= 0.5

    # ---------- a neve: a faixa de cima estica na vertical (montes) ----------
    if zs is not None:
        HB = 8.0 * K
        top1 = np.maximum.accumulate(np.where(~A1, yi, -1), axis=0) + 1            # começo do trecho novo
        t0in = np.maximum.accumulate(np.where(~Ab, yi, -1), axis=0) + 1            # começo do trecho antigo (dentro)
        t0out = np.minimum.accumulate(np.where(Ab, yi, 10 ** 7)[::-1], axis=0)[::-1]  # o primeiro ponto antigo embaixo (fora)
        top0 = np.where(Ab, t0in, t0out)
        d = (top0 - top1).astype(np.float32)
        t = (yi - top1).astype(np.float32)
        ok = A1 & (zone > 0.02) & (d > -0.8 * HB) & (d < 22 * K) & (t < HB + d) & (np.abs(d) > 0.01)
        vy_, vx_ = np.nonzero(ok)
        dd, tt = d[vy_, vx_], t[vy_, vx_]
        src_y = top0[vy_, vx_] + tt * HB / (HB + dd)
        zz = np.clip(zone[vy_, vx_] * 2.0, 0, 1)[:, None]
        rgb[vy_, vx_] = rgb[vy_, vx_] * (1 - zz) + sample(src_y, vx_.astype(np.float32)) * zz
        del top1, t0in, t0out, top0, d, t, ok
        # o volume do monte novo: a crista clara, a sombra azulada na base e do lado contrário à luz
        newsnow = np.clip((grown + add) * 1.5, 0, 1) * np.clip(zone * 2, 0, 1) * (1 - np.clip(a0 * 2, 0, 1))
        if newsnow.max() > 0:
            sg = ndi.gaussian_filter(aB, 2.0 * K)
            gy_, gx_ = np.gradient(sg)
            nl = np.maximum(np.hypot(gx_, gy_), 1e-4)
            lit = np.clip((gx_ * 0.55 + gy_ * 0.83) / nl, -1, 1)       # luz de cima, um pouco da esquerda
            deep = np.clip((sg - 0.5) * 2.2, 0, 1)                      # 0 na crista, 1 no fundo
            tone = 1.0 + 0.05 * np.clip(lit, 0, 1) - 0.10 * np.clip(-lit, 0, 1) - 0.07 * deep
            tint = np.array([0.90, 0.95, 1.0], np.float32) ** (np.clip(-lit, 0, 1) + 0.6 * deep)[..., None]
            k = newsnow[..., None]
            rgb = rgb * (1 - k) + np.clip(rgb * tone[..., None] * tint, 0, 1) * k
            del sg, gy_, gx_, nl, lit, deep, tone, tint, k

    # ---------- o que pende do teto: a cor própria ----------
    if dripP is not None and dripc.max() > 0:
        what = cfg['drip'][0]
        k = np.clip(dripc * 1.2, 0, 1)[..., None]
        tk = tipk[..., None]
        if what == 'gelo':
            ice = np.array([0.72, 0.85, 0.96], np.float32)
            # um fio de brilho do lado da luz
            gx_ = np.gradient(ndi.gaussian_filter(dripc, 1.0), axis=1)
            gl = np.clip(gx_ * 6.0, 0, 1)[..., None]
            col = ice * (0.74 + 0.22 * tk) + gl * 0.2
            rgb = rgb * (1 - k) + np.clip(col, 0, 1) * k
            a1 = np.where(dripc > 0.003, np.maximum(a1 - dripc * (0.18 + 0.12 * tipk), np.maximum(aB, a0 * (1 - cutf))), a1)
        elif what == 'raiz':
            root = np.array([0.23, 0.16, 0.10], np.float32)
            rgb = rgb * (1 - k) + root * (0.75 + 0.35 * tk) * k
        else:
            # o dente de pedra: a cor da rocha, o lado da luz mais claro, o outro e a ponta mais escuros
            gx_ = np.gradient(ndi.gaussian_filter(dripc, 1.2), axis=1)
            side = np.clip(gx_ * 5.0, -1, 1)[..., None]
            col = dcol * (1.0 + 0.20 * np.clip(side, 0, 1) - 0.26 * np.clip(-side, 0, 1)) * (1 - 0.22 * tk)
            rgb = rgb * (1 - k) + np.clip(col, 0, 1) * k
    if root_from is not None:
        rc_, rs_, rv_ = roots(root_from, rng, H, W, cfg['drip'][2], cfg['drip'][3])
        base = np.array([0.25, 0.18, 0.115], np.float32)
        col = base[None, None, :] * (1.0 - 0.30 * rs_)[..., None] * rv_[..., None]
        k = rc_[..., None]
        rgb = rgb * (1 - k) + np.clip(col, 0, 1) * k
        a1 = np.maximum(a1, rc_)

    # o que é fino e já existia fora do maciço fica como estava
    thin = (a0 * far)[..., None]
    rgb = rgb * (1 - thin) + rgb0 * thin
    # o canto de dentro cheio na pedra: um pouco mais escuro (o fundo do canto)
    if add.max() > 0 and zs is None:
        rgb *= (1 - 0.18 * add)[..., None]

    # ---------- nitidez de 3x (sem halo na beira: só onde tem pintura) ----------
    am = np.clip(a1, 0, 1)
    wsum = np.maximum(ndi.gaussian_filter(am, 1.0), 1e-3)
    blur = np.dstack([ndi.gaussian_filter(rgb[..., c] * am, 1.0) for c in range(3)]) / wsum[..., None]
    rgb = np.clip(rgb + 0.45 * (rgb - blur) * (am > 0.6)[..., None] * free[..., None], 0, 1)
    del blur, wsum

    after = np.dstack([rgb, np.clip(a1, 0, 1)])
    before = np.dstack([rgb0, a0])
    if crop:
        ox_, oy_ = (x0 - cx0 + 1) * T, (y0 - cy0 + 1) * T
        sl = (slice(oy_, oy_ + (y1 - y0) * T), slice(ox_, ox_ + (x1 - x0) * T))
    else:
        sl = (slice(T, H - T), slice(T, W - T))
    return before[sl], after[sl]


def over(img, bg=(0.35, 0.43, 0.55)):
    a = img[..., 3:4]
    return np.clip(img[..., :3] * a + np.array(bg, np.float32) * (1 - a), 0, 1)


def pieces(arr, room, out):
    """Corta a sala em pedaços de no máximo MAXP px, grava em WebP e devolve a lista em px do mundo."""
    Hh, Ww = arr.shape[:2]
    nx, ny = -(-Ww // MAXP), -(-Hh // MAXP)
    cw = (-(-Ww // nx) + T - 1) // T * T
    ch = (-(-Hh // ny) + T - 1) // T * T
    res, size, i = [], 0, 0
    for y in range(0, Hh, ch):
        for x in range(0, Ww, cw):
            part = arr[y:y + ch, x:x + cw]
            if part[..., 3].max() < 4:
                continue
            name = f'{room}-{i}'
            path = os.path.join(out, name + '.webp')
            Image.fromarray(part, 'RGBA').save(path, 'WEBP', quality=Q, method=6, alpha_quality=100)
            size += os.path.getsize(path)
            res.append({'id': name, 'x': x / K, 'y': y / K, 'w': part.shape[1] / K, 'h': part.shape[0] / K})
            i += 1
    return res, size


if __name__ == '__main__':
    maps, themes = load_maps(), load_themes()
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    man = json.load(open(os.path.join(HD, 'manifest.json')))
    os.makedirs(OUT, exist_ok=True)
    if len(args) == 5 and all(re.fullmatch(r'-?\d+', a) for a in args[1:]):
        room = args[0]
        src, s = junta(room, man)
        t0 = time.time()
        crop = tuple(int(v) for v in args[1:5])
        info = {}
        b, a = eclipse(room, maps[room], themes[room], src, s, crop, log=info)
        print('  ', info)
        both = np.concatenate([over(b), np.ones((b.shape[0], 6, 3), np.float32), over(a)], 1)
        Image.fromarray((both * 255).astype(np.uint8)).save(os.path.join(OUT, f'previa-{room}.png'))
        print(room, themes[room], both.shape[1::-1], round(time.time() - t0, 1), 's')
        sys.exit(0)
    rooms = args or sorted(r for r in man['terrain'] if r in maps and r in themes)
    for room in rooms:
        t0 = time.time()
        src, s = junta(room, man)
        _, a = eclipse(room, maps[room], themes[room], src, s)
        arr = (a * 255 + 0.5).astype(np.uint8)
        # o que ficou transparente não guarda cor (o arquivo fica menor)
        arr[arr[..., 3] == 0] = 0
        for f in os.listdir(OUT):
            if re.fullmatch(re.escape(room) + r'-\d+\.webp', f):
                os.remove(os.path.join(OUT, f))
        res, size = pieces(arr, room, OUT)
        json.dump({'theme': themes[room], 'scale': K, 'pieces': res}, open(os.path.join(OUT, f'{room}.json'), 'w'))
        print(f'{room:14s} {themes[room]:9s} {arr.shape[1]}x{arr.shape[0]} {len(res)} pedaços {size // 1024} KB {time.time() - t0:.0f} s', flush=True)

"""Fundos da Floresta Nevada no traço pintado (2 pixels da imagem por pixel do mundo, hd.json).

  snow-sky    640x360  o céu branco de neve preso na tela: nuvens baixas, o sol frio atrás delas e
                       duas serras de montanhas nevadas sumindo na névoa
  snow-far    640x360  o pinhal ao longe (repete na horizontal): pinheiros pequenos, azulados,
                       com neve nos andares de galhos e a base sumindo na névoa
  snow-mid    640x360  os pinheiros grandes mais perto (repete na horizontal): escuros, com a neve
                       pesada em cima de cada andar e os troncos aparecendo entre os galhos de baixo
  serra-far   512x512  a parede do outro lado da fenda (repete nas duas direções): granito em
                       camadas tortas, neve nas saliências e cascatas congeladas
  serra-mid   512x512  mais perto: dois contrafortes de pedra com pingentes de gelo, neve nas
                       saliências e pinheiros mortos agarrados nelas

As camadas que repetem são pintadas numa tela mais larga, com as formas repetidas fora da borda, e a
faixa da emenda é misturada com a do outro lado (a pincelada não corta na emenda).

uso: python3 fundos_floresta.py <pasta_saida> [camada ...] [--preview=<pasta>]
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image, ImageDraw
from brush import Layer, hexc, mix, sstep, blur, value_noise, noise1d, paint, passes_std
from shapes import Mask
from fundos_fosso import tnoise

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else 'hd_floresta'
ONLY = set(ARGS[1:])
PREVIEW = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
T0 = time.time()

# paleta: o céu e a névoa da abertura, o verde-azulado das agulhas e o granito frio
SKY0, SKY1, SKY2 = hexc(0x6f87a3), hexc(0x9fb3c8), hexc(0xc9d7e5)
FOG, FOG_L = hexc(0xd6e1ec), hexc(0xe9f0f6)
SNOW_L, SNOW_M, SNOW_S, SNOW_D = hexc(0xf4f8fc), hexc(0xd5e2ee), hexc(0x9fb5cb), hexc(0x6d87a3)
NEED0, NEED1, NEED2, NEED3 = hexc(0x16222c), hexc(0x22323d), hexc(0x30454f), hexc(0x45606a)
BARK0, BARK1 = hexc(0x1f1d22), hexc(0x3a3439)
MT0, MT1, MT2 = hexc(0x8095ae), hexc(0x9cb0c6), hexc(0xb7c7d8)
GR0, GR1, GR2, GR3 = hexc(0x2a313c), hexc(0x3c4552), hexc(0x535e6c), hexc(0x6d7988)
ICE0, ICE1, ICE2 = hexc(0x7fa6c4), hexc(0xb2d2e8), hexc(0xe6f4fc)


def want(name):
    return not ONLY or name in ONLY


def grid(W, H):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    return yy + 0.5, xx + 0.5


def field(c, H, W):
    return np.broadcast_to(c, (H, W, 3)).astype(np.float32).copy()


class Wide:
    """Tela mais larga para uma camada que repete na horizontal com período W: as formas são
    desenhadas em x - W, x e x + W; no fim, a faixa [0, P) é misturada com a [W, W + P)."""

    def __init__(self, W, H, P):
        self.W, self.H, self.P = W, H, P
        self.CW = W + 2 * P

    def mask(self):
        return Mask(self.CW, self.H)

    def poly(self, m, pts):
        for ox in (-self.W, 0, self.W):
            q = [(x + ox + self.P, y) for x, y in pts]
            xs = [p[0] for p in q]
            if max(xs) < -4 or min(xs) > self.CW + 4:
                continue
            m.poly(q)

    def ellipse(self, m, cx, cy, rx, ry):
        for ox in (-self.W, 0, self.W):
            x = cx + ox + self.P
            if x + rx < -4 or x - rx > self.CW + 4:
                continue
            m.ellipse(x, cy, rx, ry)

    def line(self, m, pts, w):
        for ox in (-self.W, 0, self.W):
            q = [(x + ox + self.P, y) for x, y in pts]
            xs = [p[0] for p in q]
            if max(xs) < -4 or min(xs) > self.CW + 4:
                continue
            m.line(q, w)

    @property
    def offs(self):
        """Deslocamentos das três cópias (mundo -> tela larga)."""
        return [-self.W + self.P, self.P, self.W + self.P]

    def fold(self, L):
        """Recorta a tela larga no período W, com a emenda misturada."""
        W, P = self.W, self.P
        out = Layer(W, self.H)
        out.P[:] = L.P[:, P:P + W]
        out.A[:] = L.A[:, P:P + W]
        t = np.linspace(0, 1, P, dtype=np.float32)
        out.P[:, :P] = L.P[:, P + W:P + W + P] * (1 - t)[None, :, None] + L.P[:, P:2 * P] * t[None, :, None]
        out.A[:, :P] = L.A[:, P + W:P + W + P] * (1 - t)[None, :] + L.A[:, P:2 * P] * t[None, :]
        return out


def pnoise_x(H, W, cell, rng, octaves=2):
    """Ruído suave que emenda só na horizontal (largura W)."""
    pad = int(min(W // 4, cell * 2 + 16))
    n = value_noise(H, W + pad, cell, rng, octaves)
    t = np.linspace(0, 1, pad, dtype=np.float32)[None, :]
    out = n[:, :W].copy()
    out[:, :pad] = n[:, W:W + pad] * (1 - t) + n[:, :pad] * t
    return out


def periodic1d(n, cell, rng, octaves=3):
    """Ruído 1D que emenda (o fim continua no começo)."""
    pad = int(min(n // 3, cell * 2 + 8))
    v = noise1d(n + pad, cell, rng, octaves)
    t = np.linspace(0, 1, pad, dtype=np.float32)
    out = v[:n].copy()
    out[:pad] = v[n:n + pad] * (1 - t) + v[:pad] * t
    return out


def stretched(H, W, cell, rng, sx=1.0, sy=1.0, octaves=2):
    """Ruído suave esticado (sx > 1 alonga na horizontal, sy > 1 na vertical)."""
    h, w = max(4, int(H / sy) + 2), max(4, int(W / sx) + 2)
    n = value_noise(h, w, cell / max(sx, sy), rng, octaves)
    im = Image.fromarray((n * 65535).astype(np.uint16)).resize((W, H), Image.BILINEAR)
    return np.asarray(im, np.float32) / 65535


def paint_wrapped(ref, mask, flow, rng, passes, P, **kw):
    """Pinta um campo que repete nas duas direções: a tela ganha P de cada lado (com o campo repetido)
    e no fim as faixas das bordas são misturadas com o lado oposto (a pincelada emenda)."""
    H, W = mask.shape
    refw = np.pad(ref, ((P, P), (P, P), (0, 0)), mode='wrap')
    maskw = np.pad(mask, ((P, P), (P, P)), mode='wrap')
    floww = np.pad(flow, ((P, P), (P, P)), mode='wrap')
    L = Layer(W + 2 * P, H + 2 * P)
    paint(L, refw, maskw, floww, rng, passes, **kw)
    t = np.linspace(0, 1, P, dtype=np.float32)

    def fold(a):
        x = a[:, P:P + W].copy()
        tx = t[None, :, None] if a.ndim == 3 else t[None, :]
        x[:, :P] = a[:, P + W:P + W + P] * (1 - tx) + a[:, P:2 * P] * tx
        y = x[P:P + H].copy()
        ty = t[:, None, None] if a.ndim == 3 else t[:, None]
        y[:P] = x[P + H:P + H + P] * (1 - ty) + x[P:2 * P] * ty
        return y
    out = Layer(W, H)
    out.P[:] = fold(L.P)
    out.A[:] = fold(L.A)
    return out


def widen(a, P):
    """Estende um campo (H x W ...) periodicamente para a tela larga (P de cada lado)."""
    return np.concatenate([a[:, -P:], a, a[:, :P]], axis=1)


# ======================================================================================
def spruce(rng, cx, base, height, width, tier_h, lean=0.0):
    """Um pinheiro de neve visto de lado. Os galhos saem do tronco em verticilos, cada lado numa
    altura um pouco diferente (não fica espelhado), caem e levantam de leve na ponta; a borda de baixo
    é a franja de agulhas, em tufos de tamanhos diferentes; às vezes falta um galho (o tronco aparece)
    ou ele é curto (quebrou). A neve fica em montes em cima dos galhos, mais do lado da luz (esquerda),
    e não em todos. Devolve (galhos, montes de neve, ponta) em coordenadas do mundo."""
    tip = (cx + lean * height, base - height)
    n = max(4, int(height * 0.84 / tier_h))
    boughs, snows = [], []
    for i in range(n):
        u = (i + 1) / n
        for side in (-1, 1):
            if i > 1 and rng.random() < 0.06:
                continue  # falta o galho: o tronco aparece
            off = (0.0 if side < 0 else rng.uniform(0.3, 0.55)) + rng.uniform(-0.1, 0.1)
            y = tip[1] + height * 0.08 + height * 0.84 * (i + 0.35 + off) / n
            x0 = cx + lean * (base - y)
            th = tier_h * (1.1 + 0.5 * u) * rng.uniform(0.8, 1.2)
            w = width * 0.5 * (0.14 + 0.86 * u ** 0.9) * rng.uniform(0.66, 1.15)
            if i > 1 and rng.random() < 0.08:
                w *= rng.uniform(0.35, 0.55)
            droop = th * rng.uniform(0.45, 0.95) * (0.6 + 0.6 * u)
            top_y = y - th * 0.9
            k = 9

            def topc(t):
                # sobe um pouco saindo do tronco, cai e levanta de leve na ponta
                return top_y - th * 0.14 * math.sin(min(t, 0.5) * math.pi) + droop * t ** 1.5 - th * 0.12 * max(0.0, t - 0.82) / 0.18
            pts = [(x0, top_y + th * 0.05)]
            for j in range(1, k + 1):
                t = j / k
                pts.append((x0 + side * w * t, topc(t)))
            tipx, tipy = pts[-1]
            pts.append((tipx + side * th * 0.1, tipy + th * 0.18))
            # a franja de baixo: tufos que pendem, mais compridos no meio do galho
            m = max(5, int(w / (tier_h * 0.28)))
            for j in range(m, -1, -1):
                t = j / m
                hang = th * (0.38 + 0.3 * math.sin(t * math.pi) * rng.uniform(0.6, 1.3))
                if j % 2 == 1:
                    hang *= rng.uniform(1.15, 1.5)
                pts.append((x0 + side * w * t + side * rng.uniform(-0.6, 0.6) * tier_h * 0.12, topc(t) + hang))
            boughs.append((pts, side, x0, top_y, th))
            # a neve: montes em cima do galho (nem todo galho tem, a luz vem da esquerda)
            p_snow = 0.85 if side < 0 else 0.6
            if rng.random() > p_snow:
                continue
            # uma linha fina de neve seguindo o alto do galho e, por cima, os montes achatados
            if rng.random() < 0.6:
                reach = rng.uniform(0.5, 0.9)
                sp = []
                for j in range(10):
                    t = reach * j / 9
                    sp.append((x0 + side * w * t, topc(t) - th * 0.05))
                for j in range(9, -1, -1):
                    t = reach * j / 9
                    sp.append((x0 + side * w * t, topc(t) + th * (0.1 * (1 - t / reach) + 0.04)))
                snows.append((sp, side))
            for q in range(int(rng.integers(1, 3))):
                tc = rng.uniform(0.12, 0.7)
                half = w * rng.uniform(0.16, 0.34)
                hgt = th * rng.uniform(0.1, 0.22) * (1.2 - tc * 0.6)
                sp = []
                for j in range(11):
                    v = (j / 10 - 0.5) * 2
                    t = min(max(tc + v * half / max(w, 1), 0.0), 0.98)
                    e = max(0.0, 1 - v * v)
                    sp.append((x0 + side * w * t, topc(t) - hgt * e ** 0.35 * rng.uniform(0.85, 1.1) + th * 0.03))
                for j in range(10, -1, -1):
                    v = (j / 10 - 0.5) * 2
                    t = min(max(tc + v * half / max(w, 1), 0.0), 0.98)
                    sp.append((x0 + side * w * t, topc(t) + th * 0.1 * (1 - v * v)))
                snows.append((sp, side))
    return boughs, snows, tip


def forest_band(rng, W, H, P, trees, colors, snow_cols, fog_from, fog_to, fogc, scale, trunk_w, ground=None, ground_c=None):
    """Pinta uma faixa de pinheiros que repete na horizontal. trees: (cx, base, altura, largura,
    andar, profundidade 0..1). Devolve a camada já recortada no período W."""
    wide = Wide(W, H, P)
    CW = wide.CW
    yy, xx = grid(CW, H)
    m_need = wide.mask()
    m_snow = wide.mask()
    m_trunk = wide.mask()
    # campos de cor e de fluxo, desenhados por árvore numa imagem de rótulos (sem suavização)
    lab = Image.new('I', (CW, H), 0)
    dl = ImageDraw.Draw(lab)
    side_img = Image.new('L', (CW, H), 128)
    ds = ImageDraw.Draw(side_img)
    info = {}
    order = sorted(trees, key=lambda t: -t[5])  # os mais longe primeiro
    for idx, (cx, base, height, width, tier_h, d) in enumerate(order, start=1):
        lean = rng.normal(0, 0.006)
        tiers, snows, tip = spruce(rng, cx, base, height, width, tier_h, lean)
        info[idx] = (cx, d, base, height)
        # tronco: aparece entre os andares de baixo
        tw = trunk_w * (0.6 + 0.6 * width / 200)
        tpts = [(cx - tw * 0.5 + lean * height, base - height * 0.8), (cx + tw * 0.5 + lean * height, base - height * 0.8),
                (cx + tw * 0.75, base + 40), (cx - tw * 0.75, base + 40)]
        wide.poly(m_trunk, tpts)
        for ox in wide.offs:
            dl.polygon([(x + ox, y) for x, y in tpts], fill=idx)
        for (pts, side, x0, top_y, th) in tiers:
            wide.poly(m_need, pts)
            for ox in wide.offs:
                q = [(x + ox, y) for x, y in pts]
                dl.polygon(q, fill=idx)
                ds.polygon(q, fill=64 if side < 0 else 192)
        for (sp, side) in snows:
            wide.poly(m_snow, sp)
        # a ponta: um pique fino com um tufo de neve
        wide.poly(m_need, [(tip[0] - tier_h * 0.09, tip[1] + tier_h * 1.0), (tip[0], tip[1] - tier_h * 0.35), (tip[0] + tier_h * 0.09, tip[1] + tier_h * 1.0)])
        if rng.random() < 0.7:
            wide.ellipse(m_snow, tip[0] - tier_h * 0.05, tip[1] + tier_h * 0.55, tier_h * 0.16, tier_h * 0.22)
    mneed = m_need.array()
    mtr = m_trunk.array()
    mn = np.maximum(mneed, mtr)
    ms = m_snow.array() * mn
    lab = np.asarray(lab, np.int32)
    side = (np.asarray(side_img, np.float32) - 128) / 64  # -1, 0, +1
    dmap = np.zeros(lab.shape, np.float32)
    cxmap = np.zeros(lab.shape, np.float32)
    for idx, (cx, d, base, height) in info.items():
        sel = lab == idx
        dmap[sel] = d
        cxmap[sel] = cx + P
    # luz da esquerda e de cima: o lado esquerdo do pinheiro e o alto de cada andar mais claros
    rel = np.clip((xx - cxmap) / 90.0 / scale, -1, 1)
    tex = widen(pnoise_x(H, W, 9 * scale, rng, 3), P)
    big = widen(pnoise_x(H, W, 60 * scale, rng, 2), P)
    n0, n1, n2, n3 = colors
    need = mix(n1, n2, (0.5 - 0.5 * rel)[..., None] * 0.8)
    need = mix(need, n0, (sstep(0.2, 0.9, tex) * 0.35)[..., None])
    need = mix(need, n3, (sstep(0.55, 0.95, tex) * (0.5 - 0.5 * rel) * 0.45)[..., None])
    need = mix(need, n2, (big * 0.15)[..., None])
    trunk_c = mix(BARK0, BARK1, (0.5 - 0.5 * rel)[..., None])
    need = mix(need, mix(trunk_c, n1, 0.35), (mtr * (1 - mneed))[..., None])
    # a profundidade de cada árvore dentro da camada: as de trás mais claras (névoa)
    need = mix(need, fogc, (dmap * 0.45)[..., None])
    # névoa da base
    fog = sstep(fog_from, fog_to, yy)
    ref = mix(need, fogc, (fog * 0.85)[..., None])
    flow = np.where(side < 0, math.pi - 0.42, 0.42) + (tex - 0.5) * 0.35
    flow = np.where(np.abs(side) < 0.5, math.pi / 2, flow)
    L = Layer(CW, H)
    paint(L, ref, mn, flow, rng, passes_std(0.55 * scale, dry=0.45, bristle=0.5, err=(0, 0.03, 0.04, 0.06), long=1.2),
          val_jitter=0.05, base=0.95)
    # agulhas pendendo na borda de baixo de cada andar (pinceladas curtas inclinadas para a ponta)
    edge = np.clip(mn - np.roll(mn, -int(3 * scale), axis=0), 0, 1)
    ys, xs = np.nonzero(edge > 0.5)
    cnt = min(len(xs), int(CW * H / (90 * scale * scale)))
    if len(xs):
        pick = rng.choice(len(xs), cnt, replace=False)
        for k in pick:
            x, y = float(xs[k]), float(ys[k])
            s = side[ys[k], xs[k]]
            a = math.pi / 2 - (0.5 if s > 0 else -0.5) * rng.uniform(0.4, 1.2)
            c = ref[ys[k], xs[k]] * rng.uniform(0.75, 1.05)
            ln = rng.uniform(5, 13) * scale
            L.stroke(x + math.cos(a) * ln * 0.3, y + math.sin(a) * ln * 0.3, a, ln, rng.uniform(1.1, 2.2) * scale, np.clip(c, 0, 1), 0.85,
                     rng, 0.3, 0.3, taper=0.85)
    # a neve: branca no alto, azulada embaixo e na sombra; some na névoa como o resto
    s0, s1, s2 = snow_cols
    sn = mix(s1, s0, (0.55 - 0.45 * rel)[..., None])
    under = np.clip(ms - np.roll(ms, -int(4 * scale), axis=0), 0, 1)
    sn = mix(sn, s2, (blur(under, 1.5 * scale) * 0.7)[..., None])
    sn = mix(sn, fogc, (dmap * 0.4 + fog * 0.8)[..., None])
    sflow = np.where(side < 0, math.pi - 0.3, 0.3)
    S = Layer(CW, H)
    paint(S, sn, ms, sflow, rng, passes_std(0.4 * scale, dry=0.25, bristle=0.3, err=(0, 0.025, 0.035, 0.05), long=1.6),
          val_jitter=0.03, base=1.0)
    L.over(S)
    # o chão de neve da faixa (ondulado), na frente dos pés
    if ground is not None:
        gy = widen(ground[None, :], P)[0]
        gm = sstep(gy[None, :] - 1.5 * scale, gy[None, :] + 1.5 * scale, yy)
        gref = mix(ground_c[0], ground_c[1], sstep(gy[None, :], gy[None, :] + 60 * scale, yy)[..., None])
        gref = mix(gref, fogc, (fog * 0.6)[..., None])
        G = Layer(CW, H)
        paint(G, gref, gm, np.full((H, CW), -0.04, np.float32), rng, passes_std(0.5 * scale, dry=0.3, bristle=0.3, long=1.8), base=1.0)
        L.over(G)
    return wide.fold(L)


# ======================================================================================
def range_line(W, rng, n, ytop, ybase, steep, rough):
    """Linha de uma serra: picos em triângulo (cada lado com a sua inclinação) e a crista serrilhada."""
    x = np.arange(W, dtype=np.float32)
    line = np.full(W, ybase, np.float32)
    for k in range(n):
        xk = rng.uniform(-0.1, 1.1) * W
        hk = rng.uniform(0.25, 1.0) ** 0.8
        py = ybase - (ybase - ytop) * hk
        sl, sr = steep * rng.uniform(0.55, 1.4), steep * rng.uniform(0.55, 1.4)
        prof = py + np.where(x < xk, (xk - x) * sl, (x - xk) * sr)
        line = np.minimum(line, prof)
    line += (noise1d(W, 14, rng, 3) - 0.5) * rough + (noise1d(W, 60, rng, 2) - 0.5) * rough * 1.6
    return line


def snow_sky(rng):
    """O céu de neve: degradê do cinza-azulado de cima para o branco da névoa, nuvens baixas e
    macias, a claridade do sol atrás delas (do lado esquerdo, de onde vem a luz) e duas serras de
    picos nevados, a de trás quase sumindo."""
    W, H = 1280, 720
    yy, xx = grid(W, H)
    t = yy / H
    sky = mix(SKY0, SKY1, sstep(0.0, 0.5, t)[..., None])
    sky = mix(sky, SKY2, sstep(0.38, 0.78, t)[..., None])
    sun = np.exp(-(((xx - W * 0.3) / (W * 0.24)) ** 2 + ((yy - H * 0.2) / (H * 0.22)) ** 2))
    sky = mix(sky, FOG_L, (sun * 0.5)[..., None])
    # nuvens: massas largas e macias, mais escuras na barriga de cima, as bordas claras onde o sol bate
    cl = stretched(H, W, 170, rng, sx=3.2, octaves=3)
    cl2 = stretched(H, W, 70, rng, sx=4.0, octaves=2)
    dense = sstep(0.42, 0.78, cl * 0.75 + cl2 * 0.25) * sstep(0.66, 0.1, t)
    sky = mix(sky, mix(SKY0, SKY1, 0.55), (dense * 0.42 * (1 - sun * 0.5))[..., None])
    rimc = np.clip(dense - np.roll(dense, 9, axis=0), 0, 1)
    sky = mix(sky, FOG_L, (blur(rimc, 4) * 2.5 * (0.4 + sun)).clip(0, 0.55)[..., None])
    L = Layer.from_rgb(np.clip(blur(sky, 3.0), 0, 1))
    flow = np.full((H, W), -0.02, np.float32) + (cl2 - 0.5) * 0.25
    passes = [dict(size=9, spacing=0.9, length=(3.0, 7.0), err=0.012, alpha=0.3, bristle=0.25, dry=0.1, blur=0.6, taper=0.7, ang_jitter=0.05),
              dict(size=4.5, spacing=1.0, length=(3.0, 6.0), err=0.02, alpha=0.3, bristle=0.25, dry=0.1, blur=0.5, taper=0.7, ang_jitter=0.05)]
    paint(L, blur(sky, 2.0), np.ones((H, W), np.float32), flow, rng, passes, val_jitter=0.01, jitter=0.003, base=0.0)
    # as serras: a de trás alta e clara, a da frente mais baixa e mais escura; as encostas viradas
    # para a esquerda pegam luz e têm mais neve; canaletas de neve descendo
    for (k, n, ytop, ybase, steep, base_c, fogk) in ((0, 9, 0.30, 0.66, 0.62, MT2, 0.5), (1, 12, 0.48, 0.74, 0.8, MT1, 0.3)):
        line = range_line(W, rng, n, H * ytop, H * ybase, steep, 10)
        mk = sstep(line[None, :] - 0.8, line[None, :] + 0.8, yy)
        slope = np.gradient(blur(line[None, :], 2.0)[0])
        lit = (sstep(0.25, -0.35, slope)[None, :] * np.ones((H, 1), np.float32))
        depth = np.clip((yy - line[None, :]) / (H * 0.3), 0, 1)
        gully = stretched(H, W, 26, rng, sy=4.0, octaves=2)
        ridge = 1 - np.abs(gully - 0.5) * 2
        snowy = sstep(0.75, 0.05, depth) * sstep(0.35, 0.75, ridge * 0.6 + lit * 0.5 + 0.15)
        c = mix(base_c, mix(base_c, SKY0, 0.45), ((1 - lit) * 0.7)[..., None])
        c = mix(c, mix(SNOW_M, FOG_L, 0.5 + 0.5 * k), (snowy * (0.6 + 0.35 * lit))[..., None])
        c = mix(c, FOG, (sstep(0.1, 0.95, depth) * (fogk + 0.25))[..., None])
        c = mix(c, FOG_L, 0.25 - 0.1 * k)
        flow = np.where(lit > 0.5, -1.1, 1.1) + (gully - 0.5) * 0.5
        M = Layer(W, H)
        paint(M, c, mk, flow, rng, passes_std(0.55, dry=0.3, bristle=0.3, err=(0, 0.02, 0.03, 0.045), long=1.4), base=1.0)
        L.over(M)
    # a névoa baixa por cima de tudo
    fog = sstep(H * 0.6, H * 0.9, yy)
    L.fill(FOG, fog * 0.75)
    return L


def snow_far(rng):
    W, H, P = 1280, 720, 160
    trees = []
    x = rng.uniform(0, 40)
    while x < W:
        d = rng.uniform(0, 1)
        h = rng.uniform(170, 330) * (1 - 0.25 * d)
        trees.append((x, H * 0.84 + rng.uniform(-8, 10), h, h * rng.uniform(0.34, 0.44), rng.uniform(15, 20), d))
        x += rng.uniform(24, 62)
    ground = H * 0.83 + periodic1d(W, 160, rng) * 22
    far_cols = (hexc(0x63788e), hexc(0x768ba0), hexc(0x8a9fb4), hexc(0xa5b8ca))
    return forest_band(rng, W, H, P, trees, far_cols, (FOG_L, hexc(0xd2deea), hexc(0xa8bbce)), H * 0.42, H * 0.92, FOG, 1.0, 5,
                       ground=ground, ground_c=(hexc(0xdfe8f1), FOG))


def snow_mid(rng):
    W, H, P = 1280, 720, 260
    trees = []
    x = rng.uniform(40, 120)
    while x < W - 10:
        d = rng.uniform(0, 0.6)
        h = rng.uniform(440, 700)
        trees.append((x, H + 30, h, h * rng.uniform(0.36, 0.46), rng.uniform(32, 42), d))
        x += rng.uniform(170, 300)
    mid_cols = (hexc(0x2c3d4e), hexc(0x3a4e60), hexc(0x4a6073), hexc(0x637b90))
    return forest_band(rng, W, H, P, trees, mid_cols, (SNOW_L, SNOW_M, SNOW_S), H * 0.55, H * 1.05, hexc(0xb9c9d9), 1.6, 18,
                       ground=None)


# ======================================================================================
class WrapMask(Mask):
    """Máscara que emenda nas quatro bordas: cada forma é desenhada nos nove lugares."""

    def _all(self, fn):
        for ox in (-self.W, 0, self.W):
            for oy in (-self.H, 0, self.H):
                fn(ox, oy)

    def poly(self, pts, v=255):
        self._all(lambda ox, oy: Mask.poly(self, [(x + ox, y + oy) for x, y in pts], v))
        return self

    def ellipse(self, cx, cy, rx, ry, v=255):
        self._all(lambda ox, oy: Mask.ellipse(self, cx + ox, cy + oy, rx, ry, v))
        return self

    def line(self, pts, w, v=255):
        self._all(lambda ox, oy: Mask.line(self, [(x + ox, y + oy) for x, y in pts], w, v))
        return self


def granite(H, W, rng, yy, xx, steps=3, layers=11):
    """Granito em lajes inclinadas que emenda nas bordas: a inclinação desce `steps` lajes na largura
    inteira (assim a camada continua igual do outro lado). Devolve o tom de cada laje e a fase dentro
    dela (0 no alto da laje)."""
    period = H / layers
    tilt = steps * period / W
    warp = (tnoise(H, W, 180, rng, 2) - 0.5) * period * 0.9
    yb = (yy + warp - xx * tilt) % H
    ph = (yb / period) % 1.0
    band = np.floor(yb / period).astype(np.int64) % layers
    tones = rng.uniform(0.8, 1.2, layers).astype(np.float32)
    return tones[band], ph


def tnoise_v(H, W, cell, rng, sy=4, octaves=2):
    """Ruído que emenda nas quatro bordas e é esticado na vertical (canaletas que descem)."""
    h = H // sy
    n = tnoise(h, W, cell / sy, rng, octaves)
    n = np.concatenate([n, n[:1]], 0)
    im = Image.fromarray((n * 65535).astype(np.uint16)).resize((W, H + sy), Image.BILINEAR)
    return np.asarray(im, np.float32)[:H] / 65535


def rib_edge(rng, H, x0, amp, k):
    """Uma borda que sobe a camada inteira e emenda em cima e embaixo: x(y) como soma de senos
    com período H (k ondas) e um serrilhado fino."""
    y = np.arange(H, dtype=np.float32)
    x = np.full(H, x0, np.float32)
    for j, (n, a) in enumerate(((k, amp), (k * 2 + 1, amp * 0.45), (k * 5 + 2, amp * 0.18), (k * 11 + 3, amp * 0.07))):
        x += a * np.sin(2 * math.pi * n * y / H + rng.uniform(0, 6.3))
    return x


def serra_far(rng):
    """A encosta do outro lado da fenda, longe e na névoa: costelas de rocha escura descendo, as
    canaletas de neve entre elas, prateleiras com neve atravessando as costelas e bancos de névoa
    (repete nas duas direções)."""
    W = H = 1024
    yy, xx = grid(W, H)
    tex = tnoise(H, W, 16, rng, 3)
    # o fundo é a neve das canaletas: clara, com sombra azul perto das costelas
    col = mix(SNOW_M, SNOW_L, (0.3 + 0.5 * tex)[..., None])
    rock = np.zeros((H, W), np.float32)
    shade = np.zeros((H, W), np.float32)
    lit = np.zeros((H, W), np.float32)
    n = 5
    for i in range(n):
        cx = (i + rng.uniform(0.2, 0.8)) * W / n
        wv = rng.uniform(0.38, 0.62) * W / n
        le = rib_edge(rng, H, cx - wv / 2, rng.uniform(10, 26), int(rng.integers(1, 3)))
        re = rib_edge(rng, H, cx + wv / 2, rng.uniform(10, 26), int(rng.integers(1, 3)))
        for ox in (-W, 0, W):
            L_ = le[:, None] + ox
            R_ = re[:, None] + ox
            inside = sstep(L_ - 1, L_ + 1, xx) * sstep(R_ + 1, R_ - 1, xx)
            rock = np.maximum(rock, inside)
            lit = np.maximum(lit, inside * sstep(L_ + 14, L_ + 2, xx))
            # a sombra que a costela joga na neve à direita dela
            shade = np.maximum(shade, sstep(R_ + 30, R_, xx) * (xx > R_))
    # prateleiras: bancadas tortas que atravessam as costelas, com a neve assentada em cima (grossura
    # que varia, a linha que ondula e as pontas que afinam; nunca uma faixa reta)
    shelf = np.zeros((H, W), np.float32)
    for j in range(9):
        y0 = rng.uniform(0, H)
        tilt = rng.uniform(-0.1, 0.1)
        x0 = rng.uniform(0, W)
        ln = rng.uniform(70, 200)
        wob = (periodic1d(W, 26, rng, 3) - 0.5) * rng.uniform(8, 16)
        thick = 2.5 + 7.0 * periodic1d(W, 18, rng, 2)
        rel = ((xx - x0 + W / 2) % W) - W / 2
        yl = y0 + rel * tilt + wob[None, :]
        taper = sstep(ln / 2, ln / 2 - 40, np.abs(rel))
        th = thick[None, :] * taper
        dy = ((yy - yl + H / 2) % H) - H / 2
        shelf = np.maximum(shelf, sstep(th, th - 2, -dy) * sstep(1.0, -0.5, dy) * (th > 0.8))
        shade = np.maximum(shade, sstep(0, 3, dy) * sstep(18, 6, dy) * taper * rock * 0.8)
    rc = mix(GR1, GR2, (0.3 + 0.6 * tex)[..., None])
    rc = mix(rc, GR3, (lit * 0.6)[..., None])
    rc = mix(rc, GR0, (sstep(0.6, 0.9, tnoise(H, W, 40, rng, 2)) * 0.3)[..., None])
    col = mix(col, SNOW_S, (shade * 0.55)[..., None])
    col = mix(col, rc, rock[..., None])
    col = mix(col, SNOW_L, (shelf * rock * 0.95)[..., None])
    # a distância e os bancos de névoa
    col = mix(col, FOG, 0.4)
    mist = sstep(0.5, 0.85, tnoise(H, W, 200, rng, 2))
    col = mix(col, FOG_L, (mist * 0.5)[..., None])
    flow = np.full((H, W), math.pi / 2, np.float32) + (tex - 0.5) * 0.4
    return paint_wrapped(col, np.ones((H, W), np.float32), flow, rng,
                         passes_std(0.45, dry=0.35, bristle=0.35, err=(0, 0.025, 0.035, 0.05), long=1.5), 64, base=1.0)


def serra_mid(rng):
    """Mais perto: dois contrafortes de granito que sobem a fenda inteira. Onde a borda da pedra fica
    virada para cima a neve assenta; onde ela fica para fora por cima do vazio (a barriga), pendem os
    pingentes; pinheiros mortos saem das fendas, tortos, com os galhos secos e neve em cima
    (repete nas duas direções)."""
    W = H = 1024
    yy, xx = grid(W, H)
    tex = tnoise(H, W, 14, rng, 3)
    A = np.zeros((H, W), np.float32)
    rockm = np.zeros((H, W), np.float32)
    snow = np.zeros((H, W), np.float32)
    lit = np.zeros((H, W), np.float32)
    edges = []
    for i, cx in enumerate((150 + rng.uniform(-40, 40), 662 + rng.uniform(-40, 40))):
        wv = rng.uniform(150, 210)
        le = rib_edge(rng, H, cx - wv / 2, rng.uniform(24, 40), int(rng.integers(2, 4)))
        re = rib_edge(rng, H, cx + wv / 2, rng.uniform(24, 40), int(rng.integers(2, 4)))
        edges.append((le, re))
        for ox in (-W, 0, W):
            L_ = le[:, None] + ox
            R_ = re[:, None] + ox
            inside = sstep(L_ - 1, L_ + 1, xx) * sstep(R_ + 1, R_ - 1, xx)
            rockm = np.maximum(rockm, inside)
            lit = np.maximum(lit, inside * sstep(L_ + 18, L_ + 2, xx))
            # neve: na borda da direita onde ela vai para fora descendo (a face olha para cima)
            dR = np.gradient(re)[:, None]
            dL = np.gradient(le)[:, None]
            up_r = sstep(0.15, 0.6, dR)       # a borda da direita andando para a direita ao descer
            up_l = sstep(-0.15, -0.6, dL)     # a da esquerda andando para a esquerda ao descer
            snow = np.maximum(snow, inside * up_r * sstep(R_ - 16, R_ - 3, xx))
            snow = np.maximum(snow, inside * up_l * sstep(L_ + 16, L_ + 3, xx))
    # pequenas fendas na pedra (sem listras regulares)
    cr = sstep(0.04, 0.0, np.abs(tnoise(H, W, 60, rng, 2) - 0.5)) * sstep(0.45, 0.7, tnoise(H, W, 90, rng, 2))
    rock = mix(GR0, GR2, (0.3 + 0.55 * tex)[..., None])
    rock = mix(rock, GR3, (lit * 0.65)[..., None])
    rock = mix(rock, GR0 * 0.7, (cr * 0.7)[..., None])
    sc = mix(SNOW_M, SNOW_L, (0.4 + 0.6 * tex)[..., None])
    col = mix(rock, sc, (snow * 0.95)[..., None])
    A = np.maximum(A, rockm)
    # pingentes embaixo das barrigas: onde a borda volta para dentro descendo
    im = WrapMask(W, H)
    for (le, re) in edges:
        for (e, out_dir) in ((le, -1), (re, 1)):
            de = np.gradient(e)
            y = 0
            while y < H:
                if de[y] * out_dir < -0.35:
                    x = e[y]
                    for q in range(int(rng.integers(2, 5))):
                        yq = y + rng.uniform(0, 14)
                        xq = e[int(yq) % H] + out_dir * rng.uniform(-6, 2)
                        ln = rng.uniform(16, 52)
                        wq = rng.uniform(3, 6)
                        im.poly([(xq - wq, yq - 4), (xq + wq, yq - 4), (xq + out_dir * rng.uniform(0, 3), yq + ln)])
                    y += int(rng.integers(26, 60))
                else:
                    y += 4
    ice = im.array()
    col = mix(col, mix(ICE0, ICE1, tex[..., None]), (ice * 0.95)[..., None])
    col = mix(col, ICE2, (ice * sstep(0.55, 0.9, tex) * 0.6)[..., None])
    A = np.maximum(A, ice)
    # pinheiros mortos saindo das fendas da borda: tronco torto para fora e para cima, galhos secos
    tm = WrapMask(W, H)
    sm = WrapMask(W, H)
    for (le, re) in edges:
        for (e, d) in ((le, -1), (re, 1)):
            for k in range(2):
                yr = rng.uniform(0, H)
                x0, y0 = float(e[int(yr) % H]) - d * 6, yr
                ang = -math.pi / 2 + d * rng.uniform(0.45, 0.8)
                ln = rng.uniform(90, 150)
                pts = [(x0, y0)]
                for s_ in range(1, 7):
                    u = s_ / 6
                    pts.append((x0 + math.cos(ang) * ln * u + d * 10 * math.sin(u * 2.5), y0 + math.sin(ang) * ln * u + 8 * u * u))
                for s_ in range(len(pts) - 1):
                    tm.line([pts[s_], pts[s_ + 1]], 11 * (1 - s_ / 7) + 2)
                for s_ in range(1, 6):
                    bx, by = pts[s_]
                    for side in (-1, 1):
                        if rng.random() < 0.35:
                            continue
                        a2 = ang + side * rng.uniform(0.6, 1.1)
                        l2 = rng.uniform(16, 40) * (1 - s_ / 7)
                        ex, ey = bx + math.cos(a2) * l2, by + math.sin(a2) * l2
                        tm.line([(bx, by), (ex, ey)], 3.2)
                        if math.sin(a2) < -0.2 or abs(math.cos(a2)) > 0.6:
                            sm.line([(bx, by - 2.5), (ex, ey - 2.5)], 2.6)
                # neve em cima do tronco
                for s_ in range(len(pts) - 2):
                    sm.line([(pts[s_][0], pts[s_][1] - 5), (pts[s_ + 1][0], pts[s_ + 1][1] - 5)], 4 * (1 - s_ / 7) + 1.5)
    tr = tm.array()
    ts = sm.array() * sstep(0.2, 0.6, tex + 0.3)
    wood = mix(BARK0, hexc(0x6a6260), (0.3 + 0.4 * tex)[..., None])
    col = mix(col, wood, tr[..., None])
    col = mix(col, SNOW_L, (ts * 0.95)[..., None])
    A = np.maximum(A, np.maximum(tr, ts))
    col = mix(col, FOG, 0.14)
    flow = np.full((H, W), math.pi / 2, np.float32) + (tex - 0.5) * 0.5
    return paint_wrapped(col, A, flow, rng, passes_std(0.45, dry=0.4, bristle=0.45, err=(0, 0.03, 0.04, 0.06), long=1.3), 64, base=1.0)


def save(L, name):
    img = L.image()
    img.save(f'{OUT}/{name}.png', optimize=True)
    print(name, img.size, round(time.time() - T0, 1), 's', flush=True)
    return img


def preview(out):
    """Composição da floresta e da serra como a tela do jogo (2x)."""
    os.makedirs(out, exist_ok=True)
    view = Image.open(f'{OUT}/snow-sky.png').convert('RGBA') if os.path.exists(f'{OUT}/snow-sky.png') else Image.new('RGBA', (1280, 720), (200, 210, 225, 255))
    for n in ('snow-far', 'snow-mid'):
        p = f'{OUT}/{n}.png'
        if os.path.exists(p):
            view.alpha_composite(Image.open(p).convert('RGBA'))
    view.convert('RGB').save(f'{out}/floresta.png')
    view = Image.new('RGBA', (1280, 720), (150, 165, 185, 255))
    for n, sx, sy in (('serra-far', 0, 0), ('serra-mid', 300, 200)):
        p = f'{OUT}/{n}.png'
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGBA')
        for x in range(-sx, 1280, im.width):
            for y in range(-sy, 720, im.height):
                view.alpha_composite(im, (max(0, x), max(0, y)), (max(0, -x), max(0, -y)))
    view.convert('RGB').save(f'{out}/serra.png')


def export(names):
    """Copia as camadas prontas para o jogo (256 cores com alfa, em 2x) e registra a escala no hd.json."""
    import json
    assets = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'game', 'public', 'assets')
    hdj = os.path.join(assets, 'hd.json')
    hd = json.load(open(hdj))
    for n in names:
        src = f'{OUT}/{n}.png'
        if not os.path.exists(src):
            continue
        im = Image.open(src).convert('RGBA')
        q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        q.save(os.path.join(assets, f'{n}.png'), optimize=True)
        hd[n] = 2
        print('exportado', n, os.path.getsize(os.path.join(assets, f'{n}.png')) // 1024, 'KB')
    json.dump(hd, open(hdj, 'w'), indent=1)


LAYERS = ['snow-sky', 'snow-far', 'snow-mid', 'serra-far', 'serra-mid']

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    if '--export' in sys.argv:
        export([n for n in LAYERS if want(n)])
        sys.exit(0)
    if want('snow-sky'):
        save(snow_sky(np.random.default_rng(171)), 'snow-sky')
    if want('snow-far'):
        save(snow_far(np.random.default_rng(172)), 'snow-far')
    if want('snow-mid'):
        save(snow_mid(np.random.default_rng(173)), 'snow-mid')
    if want('serra-far'):
        save(serra_far(np.random.default_rng(174)), 'serra-far')
    if want('serra-mid'):
        save(serra_mid(np.random.default_rng(175)), 'serra-mid')
    if PREVIEW:
        preview(PREVIEW)

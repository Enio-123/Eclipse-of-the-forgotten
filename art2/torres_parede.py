"""Torres Rúnicas: a parede do fundo de cada sala, presa à sala (parede-<sala>-2x.png e parede-<sala>.png).

Fica atrás de tudo que tem física e na frente do céu (no jogo, logo acima dos fachos de luz do fundo). Dentro
das torres é o outro lado da sala: a mesma cantaria da Casa, em fiadas mais baixas e mais escura (está mais
longe), com o que cada sala guarda encostado nela. Fora, só o que segura e o que corre atrás do que se pisa.

- Arquivo: as estantes do chão ao teto em cada galeria (só onde tem chão embaixo e teto em cima), os frascos
  apagados nas prateleiras, as pilastras entre elas, as janelas altas da sala de leitura e o nicho atrás da
  estante falsa.
- Experiências: fria e azulada. Embaixo, o azulejo claro até a meia altura; no meio, os cadernos e as folhas
  das sete sessões pregadas na parede; em cima, a planta do núcleo entre as janelas.
- Engrenagens: o cilindro molhado da torre oca, os canos do vapor descendo até as saídas, os suportes das
  rodas da corrente dos baldes (presos no teto e no fundo do poço) e o brilho da água embaixo.
- Trono: as pilastras, as janelas altas acesas pelo ouro das nuvens, os estandartes índigo e, atrás do
  estrado, o disco de bronze da Casa.
- Coroação: o poço do núcleo no meio (o cilindro de pedra com as frestas de Âmbar acesas por dentro) e a
  parede de fora da escada.
- Fora: os arcos da calha (atrás dos pilares), os canos de bronze ao longo da escada, as fachadas das três
  torres atrás do pátio e a parede do poço do núcleo.

A luz é a da sala: a parede é a cor da pedra vezes a luz (o ambiente da sala, as poças dos frascos, das velas e
das janelas), com a sombra do que tem física em cima dela; o que brilha (o vidro das janelas, as frestas, os
frascos) vem por cima, sem a luz.

uso: python3 torres_parede.py <sala> [pasta]
"""
import math
import os
import sys
import time
import numpy as np
from scipy import ndimage as ndi
from brush import Layer, hexc, mix, sstep, value_noise, paint
import terreno
from terreno import Room, S, T
from floresta import Box, stretched_noise, downsample_soft
from torres import (SEEDS, SOLID, STONES, GAP, BR_D, BR_M, BR_L, BR_H, VERD, IRON_D, IRON_M, IRON_L, GOLD, HAZE,
                    SKY, ashlar, glyph_mask, STAVES, outside_mask)

HERE = os.path.dirname(os.path.abspath(__file__))
F32 = np.float32
# a pintura do fundo de cada sala tem o sorteio dela (o terreno continua com o dele)
PSEEDS = {k: v + 1000 for k, v in SEEDS.items()}
# a luz de cada coisa que brilha
AMBER = hexc(0xffa040)
CANDLE = hexc(0xffb860)
COLD = hexc(0x9fb6e0)
VIOLET = hexc(0x8a7cc0)
WOOD_D, WOOD_M, WOOD_L = hexc(0x1e130c), hexc(0x3e2818), hexc(0x684628)
SPINES = [hexc(0x4a2e26), hexc(0x2b3546), hexc(0x463f26), hexc(0x35283a), hexc(0x5e5236), hexc(0x283a30), hexc(0x4a4440)]
INDIGO, INDIGO_L = hexc(0x23214a), hexc(0x3c3a78)
TILE_W, TILE_C = hexc(0xb8c4cc), hexc(0x8a9aa6)
PAPER, INK = hexc(0xb7a98c), hexc(0x2a2420)
GLASS = hexc(0x46525c)


class Ctx:
    """A sala, o que tem física (em 2x), a camada e a luz."""

    def __init__(self, name):
        self.name = name
        self.room = Room(name, terreno.load_maps()[name], seed=PSEEDS[name])
        r = self.room
        self.H, self.W = r.H, r.W
        self.sol = np.isin(r.g, list(SOLID))
        self.M = r.px(self.sol)
        self.rng = np.random.default_rng(PSEEDS[name])
        self.L = Layer(r.W, r.H)
        self.glow = []  # o que brilha por cima, depois da luz: (Box, cor, alfa)
        self.crisp = None  # o que fica com a borda limpa (metal, vidro): as pinceladas não passam por cima

    def solid(self, x, y):
        return 0 <= y < self.room.h and 0 <= x < self.room.w and bool(self.sol[y, x])

    def spawns(self, kinds):
        return [(x, y, c) for (c, x, y) in self.room.spawns if c in kinds]


# ======================================================================================
# a pedra do fundo
# ======================================================================================
def back_stone(c, value=0.9, ch=0.7, bronze=0.3, lmin=1.0, lmax=1.9):
    """A cantaria do outro lado da sala: fiadas mais baixas que as do terreno (está mais longe), menos contraste,
    juntas finas (a de nível ainda com um fio de bronze apagado)."""
    H, W, rng = c.H, c.W, c.rng
    chp = ch * T
    bid, u, v, bl, _ = ashlar(H, W, rng, ch=chp, lmin=lmin, lmax=lmax)
    nb = int(bid.max()) + 1
    kind = rng.choice(len(STONES), nb)
    tone = (1 + 0.12 * np.clip(rng.normal(0, 1, nb), -2, 2)).astype(F32)
    col = np.array(STONES, F32)[kind][bid] * tone[bid][..., None]
    gx = rng.uniform(-1, 1, nb).astype(F32)[bid]
    col *= (1 + 0.06 * gx * (u / bl - 0.5) * 2)[..., None]
    grain = value_noise(H, W, 2.4, rng, 2)
    mott = value_noise(H, W, 36, rng, 2)
    big = value_noise(H, W, 220, rng, 2)
    col *= (1 + (grain - 0.5) * 0.14 + (mott - 0.5) * 0.16 + (big - 0.5) * 0.28)[..., None]
    del grain, mott, big, gx
    jh, jv = 1.7, 1.4
    col = mix(col, col * 1.12, (sstep(jh + 3, jh, v) * 0.5)[..., None])
    col = mix(col, col * 0.72, (sstep(chp - jh - 3, chp - jh, v) * 0.5)[..., None])
    hj = np.clip(sstep(jh, jh - 1, v) + sstep(chp - jh, chp - jh + 1, v), 0, 1)
    vj = np.clip(sstep(jv, jv - 0.8, u) + sstep(bl - jv, bl - jv + 0.8, u), 0, 1)
    jc = mix(GAP, mix(BR_D, BR_M, 0.35), bronze)
    col = mix(col, jc, (hj * 0.9)[..., None])
    col = mix(col, GAP, (vj * (1 - hj) * 0.85)[..., None])
    return np.clip(col * value, 0, 1)


def occlusion(c):
    """O escuro que o que tem física deixa na parede: o canto perto dela e a sombra embaixo das lajes (a luz da
    sala vem mais de cima)."""
    Mf = c.M.astype(F32)
    a1 = ndi.gaussian_filter(Mf, 0.4 * T)
    a2 = ndi.gaussian_filter(Mf, 1.8 * T)
    dy, dx = int(0.5 * T), int(0.15 * T)
    shd = np.zeros_like(Mf)
    shd[dy:, dx:] = Mf[:-dy, :-dx]
    shd = ndi.gaussian_filter(shd, 0.6 * T)
    return np.clip(1 - 0.5 * a1 - 0.25 * a2 - 0.3 * shd, 0.2, 1)


def add_light(Lt, x, y, r, color, k, sx=1.0, sy=1.0):
    """Uma poça de luz na parede (gaussiana, achatada por sx/sy)."""
    H, W = Lt.shape[:2]
    rx, ry = r * sx, r * sy
    x0, x1 = max(0, int(x - 3 * rx)), min(W, int(x + 3 * rx) + 1)
    y0, y1 = max(0, int(y - 3 * ry)), min(H, int(y + 3 * ry) + 1)
    if x0 >= x1 or y0 >= y1:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(F32)
    d2 = ((xx - x) / rx) ** 2 + ((yy - y) / ry) ** 2
    Lt[y0:y1, x0:x1] += np.exp(-d2)[..., None] * (np.asarray(color, F32) * k)


def emit(c, b, rgb, a):
    """O que brilha: guardado para depois da luz."""
    c.glow.append((b, rgb, a))


def keep(c, b, a, grow=0.3):
    """Guarda a forma (e um pouco em volta) do que é de metal: depois das pinceladas ela volta como estava."""
    if c.crisp is None:
        c.crisp = np.zeros((c.H, c.W), F32)
    m = ndi.maximum_filter(sstep(0.02, 0.4, np.asarray(a, F32)), size=max(3, int(grow * T)))
    m = ndi.gaussian_filter(m, 1.5)
    x0, y0 = max(0, b.x0), max(0, b.y0)
    x1, y1 = min(c.W, b.x0 + m.shape[1]), min(c.H, b.y0 + m.shape[0])
    if x0 >= x1 or y0 >= y1:
        return
    sub = m[y0 - b.y0:y1 - b.y0, x0 - b.x0:x1 - b.x0]
    c.crisp[y0:y1, x0:x1] = np.maximum(c.crisp[y0:y1, x0:x1], sub)


# no jogo a sala ainda escurece por cima (o véu das salas fechadas): as de dentro ganham um pouco de luz aqui para a
# parede não sumir no preto (as fotos do jogo mostraram o Arquivo, as Engrenagens e a Coroação quase pretos)
GAIN = {'arquivo': 1.3, 'engrenagens': 1.4, 'coroacao': 1.3, 'trono': 1.2, 'experiencias': 1.15}


def finish(c, Lt, alpha_mask=None, strokes=True):
    """A cor vezes a luz, as pinceladas por cima (a parede de longe fica mais mole que o terreno) e o que brilha."""
    L = c.L
    L.P *= Lt * GAIN.get(c.name, 1.0)
    np.clip(L.P, 0, None, out=L.P)
    if strokes and c.crisp is not None:
        P0, A0 = L.P.copy(), L.A.copy()
    if strokes:
        ref = np.clip(L.color(), 0, 1)
        mask = np.clip(L.A, 0, 1)
        flow = ((value_noise(c.H, c.W, 60, c.rng, 2) - 0.5) * 0.3).astype(F32)
        passes = [
            dict(size=7, spacing=1.0, length=(1.8, 3.4), err=0.0, alpha=0.4, bristle=0.5, dry=0.4, blur=0.15, taper=0.35, ang_jitter=0.12),
        ]
        paint(L, ref, mask, flow, c.rng, passes, val_jitter=0.07, jitter=0.008, clip_soft=0, base=0.0)
        if c.crisp is not None:
            k = np.clip(c.crisp, 0, 1)
            L.P = L.P * (1 - k[..., None]) + P0 * k[..., None]
            L.A = L.A * (1 - k) + A0 * k
            del P0, A0
    for (b, rgb, a) in c.glow:
        b.put(L, np.clip(rgb, 0, 1), np.clip(a, 0, 1))
    if alpha_mask is not None:
        L.multiply_alpha(alpha_mask)
    return L


# ======================================================================================
# peças
# ======================================================================================
def put(c, b, rgb, a):
    b.put(c.L, np.clip(rgb, 0, 1), np.clip(a, 0, 1).astype(F32))


def pilaster(c, x0, x1, y0, y1, light_left=True):
    """A pilastra encostada na parede: a face lisa mais clara que a parede (está mais perto), uma aresta pegando
    luz e a outra no escuro, a sombra dela na parede do lado, o capitel com a faixa de bronze e a base."""
    w = x1 - x0
    # a sombra que ela faz na parede, do lado de onde a luz não vem
    sx0, sx1 = (x1, x1 + 0.45 * w) if light_left else (x0 - 0.45 * w, x0)
    sb = Box(sx0, y0, sx1, y1)
    ts = (sb.xx - sx0) / max(sx1 - sx0, 1)
    sa = sstep(1.0, 0.0, ts) if light_left else sstep(0.0, 1.0, ts)
    put(c, sb, GAP * np.ones((sb.h, sb.w, 3), F32), sa * 0.45)
    b = Box(x0, y0, x1, y1)
    t = (b.xx - x0) / max(w, 1)
    col = np.ones((b.h, b.w, 3), F32) * STONES[2] * 1.4
    col *= (0.92 + 0.16 * value_noise(b.h, b.w, 18, c.rng, 2))[..., None]
    lit = sstep(0.24, 0.0, t) if light_left else sstep(0.76, 1.0, t)
    dark = sstep(0.78, 1.0, t) if light_left else sstep(0.22, 0.0, t)
    col = mix(col, col * 1.5, (lit * 0.85)[..., None])
    col = mix(col, col * 0.4, (dark * 0.85)[..., None])
    # as juntas das peças da pilastra (mais altas que as fiadas da parede)
    v = (b.yy - y0) % (1.4 * T)
    col = mix(col, GAP, (sstep(1.6, 0.6, v) * 0.8)[..., None])
    # o capitel (embaixo do teto) e a base (em cima do chão): a faixa de bronze e a moldura saindo da face
    cap = sstep(y0 + 1.1 * T, y0 + 0.9 * T, b.yy)
    capb = sstep(y0 + 0.75 * T, y0 + 0.6 * T, b.yy) * sstep(y0 + 0.35 * T, y0 + 0.5 * T, b.yy)
    base = sstep(y1 - 0.9 * T, y1 - 0.7 * T, b.yy)
    col = mix(col, col * 1.15, (cap * 0.5)[..., None])
    col = mix(col, mix(BR_M, BR_L, 0.4), (capb * 0.9)[..., None])
    col = mix(col, col * 1.2, (base * 0.5)[..., None])
    col = mix(col, col * 0.5, (sstep(y1 - 0.95 * T, y1 - 0.85 * T, b.yy) * sstep(y1 - 0.75 * T, y1 - 0.85 * T, b.yy))[..., None])
    put(c, b, col, np.ones((b.h, b.w), F32))


def shelves(c, x0, y0, x1, y1, rng, jars=0.12, boxes=0.18):
    """Uma estante do chão ao teto: as laterais e a cornija de madeira escura, as prateleiras e o que tem nelas
    (os livros, as caixas das fichas, os rolos e os frascos de Âmbar, apagados)."""
    L = c.L
    b = Box(x0, y0, x1, y1)
    side = 0.22 * T
    col = mix(WOOD_M, WOOD_D, sstep(x0, x1, b.xx)[..., None] * 0.5)
    col = col * (0.85 + 0.3 * stretched_noise(b.h, b.w, 1.4 * S, 26 * S, rng))[..., None]
    put(c, b, col, np.ones((b.h, b.w), F32))
    # o fundo da estante (as tábuas de trás, no escuro)
    inner = Box(x0 + side, y0 + 0.5 * T, x1 - side, y1 - 0.45 * T)
    ic = WOOD_D * 0.55 * (0.85 + 0.3 * stretched_noise(inner.h, inner.w, 1.2 * S, 30 * S, rng))[..., None]
    put(c, inner, ic, np.ones((inner.h, inner.w), F32))
    sh = 0.66 * T
    y = y0 + 0.5 * T
    jar_spots = []
    while y + sh <= y1 - 0.45 * T + 0.5:
        bot = y + sh - 0.12 * T
        x = x0 + side + 0.06 * T
        while x < x1 - side - 0.25 * T:
            r = rng.random()
            room_left = x1 - side - x
            if r < jars and room_left > 0.5 * T:
                # o frasco: o vidro escuro, o Âmbar apagado até perto do gargalo, a rolha e o reflexo
                w = rng.uniform(0.34, 0.46) * T
                h = rng.uniform(0.62, 0.86) * (sh - 0.12 * T)
                jb = Box(x, bot - h, x + w, bot)
                tt = (jb.xx - x) / w
                yy = (jb.yy - (bot - h)) / h
                body = sstep(0.0, 0.08, tt) * sstep(1.0, 0.92, tt) * sstep(0.12, 0.2, yy)
                neck = sstep(0.3, 0.36, tt) * sstep(0.7, 0.64, tt) * sstep(0.0, 0.05, yy) * sstep(0.22, 0.14, yy)
                fill = sstep(0.42, 0.5, yy)
                jc = mix(GLASS * 0.6, mix(AMBER * 0.4, hexc(0x3a2412), 0.45), fill[..., None])
                jc = mix(jc, hexc(0x7a5a3a), (neck * sstep(0.08, 0.0, yy))[..., None])
                jc = mix(jc, hexc(0xc8d4dc), (sstep(0.22, 0.16, np.abs(tt - 0.24)) * body * 0.35)[..., None])
                put(c, jb, jc, np.maximum(body, neck))
                jar_spots.append((x + w / 2, bot - h * 0.3, w))
                x += w + rng.uniform(0.06, 0.16) * T
                continue
            if r < jars + boxes and room_left > 0.7 * T:
                # a caixa das fichas, com a etiqueta clara
                w = rng.uniform(0.55, 0.8) * T
                h = rng.uniform(0.42, 0.58) * (sh - 0.12 * T)
                bb = Box(x, bot - h, x + w, bot)
                bc = mix(hexc(0x4a3a2a), hexc(0x2e241a), sstep(x, x + w, bb.xx)[..., None] * 0.6)
                put(c, bb, bc, np.ones((bb.h, bb.w), F32))
                lb = Box(x + w * 0.3, bot - h * 0.72, x + w * 0.7, bot - h * 0.42)
                put(c, lb, PAPER * 0.75, np.ones((lb.h, lb.w), F32))
                x += w + rng.uniform(0.04, 0.12) * T
                continue
            # um livro: a lombada, da altura da prateleira ou quase, às vezes inclinado no fim de uma fileira
            w = rng.uniform(0.09, 0.17) * T
            h = rng.uniform(0.6, 0.94) * (sh - 0.14 * T)
            bk = Box(x, bot - h, x + w, bot)
            cc = SPINES[rng.integers(len(SPINES))] * rng.uniform(0.7, 1.15)
            cc = cc * (0.8 + 0.3 * (1 - sstep(x, x + w, bk.xx)))[..., None]
            put(c, bk, cc, np.ones((bk.h, bk.w), F32))
            if rng.random() < 0.55:
                fy = bot - h * rng.uniform(0.65, 0.82)
                f = Box(x, fy, x + w, fy + 0.04 * T)
                put(c, f, BR_L * 0.7, np.ones((f.h, f.w), F32) * 0.8)
            x += w + rng.uniform(0.0, 0.03) * T
            if rng.random() < 0.06:
                x += rng.uniform(0.2, 0.5) * T  # um vão
        # a tábua com a borda da frente clara
        tb = Box(x0 + side * 0.6, bot, x1 - side * 0.6, bot + 0.12 * T)
        tc = mix(WOOD_L, WOOD_M, sstep(bot, bot + 0.12 * T, tb.yy)[..., None])
        put(c, tb, tc, np.ones((tb.h, tb.w), F32))
        y += sh
    # a cornija em cima e o rodapé embaixo
    cb = Box(x0 - 0.08 * T, y0, x1 + 0.08 * T, y0 + 0.45 * T)
    cc = mix(WOOD_L * 1.1, WOOD_D, sstep(y0, y0 + 0.45 * T, cb.yy)[..., None])
    put(c, cb, cc, np.ones((cb.h, cb.w), F32))
    fb = Box(x0 - 0.04 * T, y1 - 0.45 * T, x1 + 0.04 * T, y1)
    fc = mix(WOOD_M, WOOD_D * 0.8, sstep(y1 - 0.45 * T, y1, fb.yy)[..., None])
    put(c, fb, fc, np.ones((fb.h, fb.w), F32))
    # as laterais com a aresta clara
    for sx0, sx1 in ((x0, x0 + side), (x1 - side, x1)):
        sb = Box(sx0, y0 + 0.4 * T, sx1, y1 - 0.4 * T)
        sc = mix(WOOD_L * 0.9, WOOD_D, sstep(sx0, sx1, sb.xx)[..., None])
        put(c, sb, sc, np.ones((sb.h, sb.w), F32))
    return jar_spots


def window(c, x0, y0, x1, y1, lights, lancets=2, sky_top=None, sky_bot=None, k=1.0):
    """A janela alta em arco: o vão com o vidro aceso (o céu do eclipse em cima, o ouro das nuvens embaixo), o
    mainel e as travessas de bronze, as ombreiras de pedra mais clara e o peitoril. A luz dela entra na parede
    em volta."""
    sky_top = SKY * 0.85 if sky_top is None else sky_top
    sky_bot = GOLD * 0.9 if sky_bot is None else sky_bot
    w = x1 - x0
    rad = w / 2
    cx = (x0 + x1) / 2
    jamb = 0.28 * T
    # as ombreiras e o arco de pedra
    fb = Box(x0 - jamb, y0 - jamb, x1 + jamb, y1 + 0.3 * T)
    dd = np.hypot(fb.xx - cx, np.minimum(fb.yy - (y0 + rad), 0))
    outer = (dd <= rad + jamb) & (fb.xx >= x0 - jamb) & (fb.xx <= x1 + jamb)
    fc = STONES[4] * 1.15 * (0.9 + 0.2 * value_noise(fb.h, fb.w, 10, c.rng, 2))[..., None]
    fc = mix(fc, fc * 1.3, sstep(cx, x0 - jamb, fb.xx)[..., None] * 0.5)
    put(c, fb, fc, outer.astype(F32))
    # o vão
    gb = Box(x0, y0, x1, y1)
    gd = np.hypot(gb.xx - cx, np.minimum(gb.yy - (y0 + rad), 0))
    opening = sstep(rad + 0.5, rad - 0.5, gd)
    t = np.clip((gb.yy - y0) / max(y1 - y0, 1), 0, 1)
    glass = mix(sky_top, sky_bot, sstep(0.35, 1.0, t)[..., None])
    # as nuvens douradas lá fora, baixas, e a mancha do eclipse no alto
    glass = mix(glass, mix(sky_bot, GOLD * 1.1, 0.5), (sstep(0.62, 0.9, t) * sstep(0.35, 0.7, value_noise(gb.h, gb.w, 14, c.rng, 2)) * 0.6)[..., None])
    # o vidro em losangos com o chumbo escuro
    lat = (np.abs(((gb.xx - x0) + (gb.yy - y0)) % (0.5 * T) - 0.25 * T) < 0.9) | (np.abs(((gb.xx - x0) - (gb.yy - y0)) % (0.5 * T) - 0.25 * T) < 0.9)
    glass = mix(glass, glass * 0.45, (lat * 0.6)[..., None])
    # o mainel e as travessas de bronze
    bars = np.zeros((gb.h, gb.w), F32)
    for i in range(1, lancets):
        mx = x0 + w * i / lancets
        bars = np.maximum(bars, sstep(1.6 * S, 0.9 * S, np.abs(gb.xx - mx)))
    for ty in np.arange(y0 + rad + 1.6 * T, y1 - 0.5 * T, 1.8 * T):
        bars = np.maximum(bars, sstep(1.2 * S, 0.6 * S, np.abs(gb.yy - ty)))
    emit(c, gb, mix(glass * k, mix(BR_D, BR_M, 0.5), bars[..., None]), opening)
    # o peitoril
    sb = Box(x0 - jamb - 0.1 * T, y1, x1 + jamb + 0.1 * T, y1 + 0.3 * T)
    sc = mix(STONES[4] * 1.4, STONES[3] * 0.8, sstep(y1, y1 + 0.3 * T, sb.yy)[..., None])
    put(c, sb, sc, np.ones((sb.h, sb.w), F32))
    # a luz da janela na parede em volta (o frio do céu em cima, o ouro embaixo)
    lights.append((cx, y0 + (y1 - y0) * 0.35, (w + 2 * T) * 0.9, sky_top, 0.55 * k, 1.0, 1.6))
    lights.append((cx, y1, (w + 2 * T) * 0.8, sky_bot, 0.55 * k, 1.3, 0.8))


def banner(c, x, y0, y1, w, rng, emblem=0):
    """O estandarte índigo pendurado na vara de bronze: as dobras em pé, a barra de ouro, a runa da Casa e a
    ponta em rabo de andorinha (sem vermelho nenhum)."""
    x0, x1 = x - w / 2, x + w / 2
    b = Box(x0, y0, x1, y1)
    t = (b.xx - x0) / w
    yy = b.yy - y0
    # a ponta em V
    tail = (y1 - y0) - 0.6 * T * (1 - np.abs(t - 0.5) * 2)
    a = (yy <= tail).astype(F32) * sstep(-0.5, 0.5, b.xx - x0) * sstep(0.5, -0.5, b.xx - x1)
    folds = np.sin(t * math.pi * 3.0 + 0.4) * 0.5 + 0.5
    col = mix(INDIGO * 0.7, INDIGO_L, folds[..., None] * 0.6)
    col *= (0.9 + 0.2 * value_noise(b.h, b.w, 12, rng, 2))[..., None]
    # a barra dourada em cima e embaixo
    gold = sstep(0.75 * T, 0.68 * T, yy) * sstep(0.5 * T, 0.57 * T, yy)
    gold = np.maximum(gold, sstep(0.3 * T, 0.0, np.abs(yy - (tail - 0.45 * T))) * sstep(0.18 * T, 0.1 * T, np.abs(yy - (tail - 0.45 * T))))
    col = mix(col, mix(BR_M, BR_L, folds[..., None]), (gold * 0.9)[..., None])
    # a runa grande no meio
    gw, gh = int(w * 0.5), int(w * 0.5 * 1.8)
    gy0 = int(y0 + 1.2 * T)
    g = glyph_mask(emblem, gw, gh, lw=2.6)
    gx0 = int(x - gw / 2)
    sub = (slice(gy0 - b.y0, gy0 - b.y0 + gh), slice(gx0 - b.x0, gx0 - b.x0 + gw))
    col[sub] = mix(col[sub], mix(BR_L, BR_H, 0.3), (g * 0.85)[..., None])
    put(c, b, col, a)
    # a vara e as pontas
    rb = Box(x0 - 0.3 * T, y0 - 0.12 * T, x1 + 0.3 * T, y0 + 0.12 * T)
    rc = mix(BR_L, BR_D, sstep(y0 - 0.12 * T, y0 + 0.12 * T, rb.yy)[..., None])
    put(c, rb, rc, np.ones((rb.h, rb.w), F32))
    for px in (x0 - 0.3 * T, x1 + 0.3 * T):
        c.L.dab(px, y0, 0.16 * T, BR_L, 1.0, 0.6)


def bronze_disc(c, cx, cy, r, rng):
    """O disco de bronze da Casa: os anéis, as runas em volta, o miolo e os raios."""
    b = Box(cx - r - 4, cy - r - 4, cx + r + 4, cy + r + 4)
    d = np.hypot(b.xx - cx, b.yy - cy)
    ang = np.arctan2(b.yy - cy, b.xx - cx)
    a = sstep(r + 1, r - 1, d)
    lit = np.clip(0.5 - 0.5 * (np.cos(ang + 2.3)) * sstep(0, r, d), 0, 1)
    col = mix(BR_D, BR_M, lit[..., None])
    # os anéis em relevo
    for rr in (0.97, 0.78, 0.5, 0.22):
        ring = sstep(0.025 * r, 0.0, np.abs(d - rr * r))
        col = mix(col, mix(BR_L, BR_H, lit[..., None]), (ring * 0.8)[..., None])
        shadow = sstep(0.05 * r, 0.0, np.abs(d - (rr * r + 0.035 * r)))
        col = mix(col, BR_D * 0.6, (shadow * 0.5)[..., None])
    # os raios entre o miolo e o anel do meio
    spokes = sstep(0.035, 0.0, np.abs(((ang / (2 * math.pi) * 12) % 1) - 0.5) / 12) * sstep(0.22 * r, 0.26 * r, d) * sstep(0.5 * r, 0.46 * r, d)
    col = mix(col, mix(BR_L, BR_H, 0.4), (spokes * 0.8)[..., None])
    col = mix(col, VERD, (sstep(0.6, 0.85, value_noise(b.h, b.w, 9 * S, rng, 2)) * 0.45 * a)[..., None])
    # a sombra dele na parede (está preso a um palmo da pedra), embaixo e à direita
    sb = Box(cx - r, cy - r, cx + r + 0.5 * T, cy + r + 0.7 * T)
    ds = np.hypot(sb.xx - cx - 0.25 * T, sb.yy - cy - 0.4 * T)
    put(c, sb, GAP * np.ones((sb.h, sb.w, 3), F32), sstep(r + 0.4 * T, r - 0.2 * T, ds) * 0.55)
    put(c, b, col, a)
    keep(c, b, a)
    # as runas no anel de fora
    n = 12
    gw, gh = int(0.13 * r), int(0.2 * r)
    for i in range(n):
        an = i * 2 * math.pi / n - math.pi / 2
        rx, ry = cx + math.cos(an) * 0.875 * r, cy + math.sin(an) * 0.875 * r
        g = glyph_mask(i, gw, gh, lw=max(2.0, 0.018 * r))
        gb = Box(rx - gw / 2, ry - gh / 2, rx - gw / 2 + gw, ry - gh / 2 + gh)
        put(c, gb, BR_D * 0.5 * np.ones((gb.h, gb.w, 3), F32), g[:gb.h, :gb.w] * 0.9)


def pipe_v(c, x, y0, y1, r, rng, flanges=3.0, collar=True):
    """Um cano de bronze em pé, preso na parede: o cilindro, os flanges com os parafusos e as abraçadeiras."""
    b = Box(x - r - 3, y0, x + r + 3, y1)
    n = (b.xx - x) / r
    body = sstep(1.0, 0.9, np.abs(n))
    lam = np.clip(np.sqrt(np.clip(1 - n * n, 0, 1)) * 0.75 - n * 0.35, 0, 1)
    col = mix(BR_D, BR_M, sstep(0.05, 0.6, lam)[..., None])
    col = mix(col, BR_L, sstep(0.55, 0.95, lam)[..., None])
    col = mix(col, BR_H, (sstep(0.9, 1.0, lam) * 0.4)[..., None])
    st = stretched_noise(b.h, b.w, 2.0 * S, 40 * S, rng)
    col = mix(col, VERD, (sstep(0.6, 0.85, st) * 0.5)[..., None])
    a = body.copy()
    if flanges:
        yc = (b.yy - y0) % (flanges * T)
        fl = sstep(0.16 * T, 0.1 * T, np.abs(yc - 0.5 * flanges * T))
        wide = sstep(1.3, 1.2, np.abs(n))
        col = mix(col, mix(BR_D, BR_L, lam[..., None] * 0.9 + 0.1), (fl * wide)[..., None])
        a = np.maximum(a, fl * wide)
    put(c, b, col, a)


def pipe_path(c, pts, r, rng, collars=2.5):
    """Um cano de bronze ao longo de uma linha (os trechos retos e as curvas): pintado em pedaços, com a luz de
    cima e os colares a cada tanto."""
    L = c.L
    for (ax, ay), (bx, by) in zip(pts[:-1], pts[1:]):
        dx, dy = bx - ax, by - ay
        ln = math.hypot(dx, dy)
        if ln < 1:
            continue
        nx, ny = -dy / ln, dx / ln
        b = Box(min(ax, bx) - r - 4, min(ay, by) - r - 4, max(ax, bx) + r + 4, max(ay, by) + r + 4)
        # distância de cada ponto até o segmento (e onde cai nele)
        t = np.clip(((b.xx - ax) * dx + (b.yy - ay) * dy) / (ln * ln), 0, 1)
        px, py = ax + t * dx, ay + t * dy
        sd = ((b.xx - px) * nx + (b.yy - py) * ny) / r
        dist = np.hypot(b.xx - px, b.yy - py) / r
        body = sstep(1.0, 0.9, dist)
        # a luz vem de cima: o lado do normal que aponta para cima é o claro
        up = -1 if ny > 0 else 1
        s = sd * up
        lam = np.clip(np.sqrt(np.clip(1 - s * s, 0, 1)) * 0.75 + s * 0.35, 0, 1)
        col = mix(BR_D, BR_M, sstep(0.05, 0.6, lam)[..., None])
        col = mix(col, BR_L, sstep(0.55, 0.95, lam)[..., None])
        col = mix(col, BR_H, (sstep(0.9, 1.0, lam) * 0.4)[..., None])
        col = mix(col, VERD, (sstep(0.62, 0.86, value_noise(b.h, b.w, 5 * S, rng, 2)) * 0.45)[..., None])
        if collars:
            along = t * ln
            k = sstep(0.15 * T, 0.09 * T, np.abs((along % (collars * T)) - 0.5 * collars * T))
            wide = sstep(1.32, 1.22, dist)
            col = mix(col, mix(BR_D, BR_L, lam[..., None] * 0.9 + 0.1), (k * wide)[..., None])
            body = np.maximum(body, k * wide)
        put(c, b, col, body)
        # o joelho na ponta (cobre a emenda)
        L.dab(bx, by, r * 0.98, mix(BR_M, BR_L, 0.3), 1.0, 1.0)


def bracket(c, x, y, w, h, rng, iron=True):
    """A mão-francesa (o suporte em L com a barra inclinada) presa na parede, segurando o que está em cima."""
    L = c.L
    m = IRON_M if iron else BR_M
    d = IRON_D if iron else BR_D
    for (a, b, wd) in (((x, y), (x + w, y), 0.14 * T), ((x, y), (x, y + h), 0.14 * T), ((x + w * 0.85, y), (x, y + h * 0.85), 0.1 * T)):
        bb = Box(min(a[0], b[0]) - wd, min(a[1], b[1]) - wd, max(a[0], b[0]) + wd, max(a[1], b[1]) + wd)
        al = bb.line([a, b], wd)
        put(c, bb, mix(m, d, 0.3) * np.ones((bb.h, bb.w, 3), F32), al)
    L.dab(x, y + h * 0.3, 0.07 * T, IRON_L if iron else BR_L, 1.0, 0.5)
    L.dab(x, y + h * 0.75, 0.07 * T, IRON_L if iron else BR_L, 1.0, 0.5)


def bays(c, x0, x1, walls='#+%'):
    """Os vãos da sala: em cada coluna, os trechos de ar com pedra embaixo e em cima; as colunas vizinhas com o
    mesmo trecho viram um retângulo (xa, xb, ya, yb, em tiles, inclusivos). Onde a laje tem o vão da subida o
    trecho é mais alto (atravessa dois andares)."""
    g = c.room.g
    sol = np.isin(g, list(walls))
    h = c.room.h
    groups = {}
    for x in range(x0, x1 + 1):
        y = 0
        while y < h:
            if sol[y, x]:
                y += 1
                continue
            ya = y
            while y < h and not sol[y, x]:
                y += 1
            yb = y - 1
            if ya > 0 and yb < h - 1:
                groups.setdefault((ya, yb), []).append(x)
    out = []
    for (ya, yb), xs in groups.items():
        s = prev = xs[0]
        for x in xs[1:] + [None]:
            if x is None or x != prev + 1:
                out.append((s, prev, ya, yb))
                s = x
            prev = x
    return sorted(out, key=lambda r: (r[2], r[0]))


# ======================================================================================
# as salas de dentro
# ======================================================================================
def arquivo(c):
    room, rng = c.room, c.rng
    H, W = c.H, c.W
    col = back_stone(c, value=0.95, ch=0.7, bronze=0.4)
    # o Arquivo é quente: a pedra pega o âmbar
    col *= np.array([1.08, 0.98, 0.86], F32)
    c.L.fill(col, np.ones((H, W), F32))
    del col
    lights = []
    jar_glints = []
    # as galerias: em cada vão com chão embaixo e teto em cima, as estantes do chão ao teto (o vão da subida,
    # que atravessa dois andares, fica com a parede lisa; o esconderijo atrás da estante falsa também)
    for (sa, sb, y0, y1) in bays(c, 4, 75):
        n = sb - sa + 1
        hgt = y1 - y0 + 1
        if n < 3 or hgt < 4 or hgt > 8 or sa >= 70:
            continue
        # a sala de leitura (o andar alto): as janelas altas no lugar de algumas estantes
        if hgt >= 7 and n >= 14:
            cxs = [sa + n * 0.3, sa + n * 0.7] if n >= 30 else [sa + n * 0.5]
            wins = [(cx - 1.6, cx + 1.6) for cx in cxs]
            for (wa, wb) in wins:
                window(c, wa * T, (y0 + 1.6) * T, wb * T, (y1 - 1.0) * T, lights, lancets=2, k=0.85)
            edges = [sa] + [v for w in wins for v in (math.floor(w[0] - 1.0), math.ceil(w[1] + 1.0))] + [sb + 1]
            parts = [(edges[i], edges[i + 1]) for i in range(0, len(edges), 2)]
        else:
            parts = [(sa, sb + 1)]
        for (pa, pb) in parts:
            m = pb - pa
            if m < 3:
                continue
            # estantes de 4 a 7 tiles com uma pilastra de um tile entre elas
            k = max(1, round(m / 6.0))
            wseg = m / k
            for i in range(k):
                bx0 = (pa + i * wseg) * T
                bx1 = (pa + (i + 1) * wseg) * T
                px = 0.5 * T
                sx0 = bx0 + (px if i > 0 else 0.12 * T)
                sx1 = bx1 - (px if i < k - 1 else 0.12 * T)
                jar_glints += shelves(c, sx0, y0 * T + 0.05 * T, sx1, (y1 + 1) * T, rng)
                if i > 0:
                    pilaster(c, bx0 - px, bx0 + px, y0 * T, (y1 + 1) * T)
    # o nicho atrás da estante falsa: a parede lisa, mais escura, com a prateleira da ficha
    for (x, y, ch) in c.spawns('r'):
        if x >= 70 and y <= 17:
            nb = Box((x - 1.4) * T, (y - 2.4) * T, (x + 1.4) * T, (y + 0.95) * T)
            dd = np.hypot(nb.xx - x * T, np.minimum(nb.yy - (y - 1.0) * T, 0))
            a = sstep(1.42 * T, 1.3 * T, dd)
            put(c, nb, GAP * 1.6 * np.ones((nb.h, nb.w, 3), F32), a)
    # a luz: o âmbar dos frascos acesos e das velas; o ambiente é baixo e quente
    for (x, y, ch) in c.spawns(',O'):
        lights.append(((x + 0.5) * T, (y + 0.2) * T, 3.6 * T if ch == ',' else 4.5 * T, AMBER if ch == ',' else CANDLE, 0.9, 1.0, 1.0))
    Lt = np.ones((H, W, 3), F32) * np.array([0.5, 0.44, 0.36], F32)
    for (x, y, r, colr, k, sx, sy) in lights:
        add_light(Lt, x, y, r, colr, k, sx, sy)
    Lt *= occlusion(c)[..., None]
    # o brilho baixo de alguns frascos das prateleiras (Âmbar quase apagado)
    for (x, y, w) in jar_glints:
        if rng.random() < 0.35:
            b = Box(x - w, y - w, x + w, y + w)
            d = np.hypot(b.xx - x, b.yy - y)
            emit(c, b, AMBER * 0.75 * np.ones((b.h, b.w, 3), F32), sstep(w * 0.55, 0.0, d) * 0.35)
    return finish(c, Lt)


def trono(c):
    room, rng = c.room, c.rng
    H, W = c.H, c.W
    col = back_stone(c, value=0.9, ch=0.75, bronze=0.45)
    col *= np.array([1.0, 0.96, 1.0], F32)
    c.L.fill(col, np.ones((H, W), F32))
    del col
    lights = []
    # o salão: do começo (depois da grade) até a parede do encosto, entre o teto e o chão
    hx0, hx1 = 19, 89
    ceil, floor = 5, 40
    # as pilastras e, entre elas, as janelas altas e os estandartes, em vãos iguais
    nb = 6
    span = (hx1 + 1 - hx0) / nb
    for i in range(nb + 1):
        px = (hx0 + i * span) * T
        # o vão do estrado é a abside: sem a pilastra na frente do disco
        if 0 < i < nb - 1:
            pilaster(c, px - 0.55 * T, px + 0.55 * T, ceil * T, floor * T)
    for i in range(nb):
        a = hx0 + i * span
        b = a + span
        mid = (a + b) / 2
        if i == nb - 1:
            continue  # o vão do estrado fica com o disco
        if i % 2 == 0:
            window(c, (mid - 1.9) * T, (ceil + 5) * T, (mid + 1.9) * T, (floor - 11) * T, lights, lancets=2, k=1.0)
        else:
            banner(c, mid * T, (ceil + 3.2) * T, (floor - 9) * T, 3.0 * T, rng, emblem=i)
    # atrás do estrado: o disco grande de bronze da Casa, em cima do trono
    for (x, y, ch) in c.spawns('X'):
        # no meio do estrado (do pé dele até a parede do encosto), longe das duas paredes
        dx = x
        while dx > 0 and c.solid(dx - 1, y + 1):
            dx -= 1
        ex = x
        while ex < c.room.w and not c.solid(ex, y):
            ex += 1
        mx = (dx + ex) / 2
        rr = min(6.2, (ex - dx) / 2 - 0.9)
        bronze_disc(c, mx * T, (y - 13.5) * T, rr * T, rng)
        lights.append((mx * T, (y - 13.5) * T, 9 * T, AMBER, 0.35, 1.0, 1.0))
    # a antessala baixa: lisa, com as duas arandelas
    for x in (7.5, 12.5):
        lights.append((x * T, 32.5 * T, 3.0 * T, CANDLE, 0.8, 1.0, 1.0))
        b = Box((x - 0.25) * T, 32.6 * T, (x + 0.25) * T, 33.6 * T)
        put(c, b, mix(BR_D, BR_M, 0.5) * np.ones((b.h, b.w, 3), F32), np.ones((b.h, b.w), F32))
        g = Box((x - 0.6) * T, 31.4 * T, (x + 0.6) * T, 32.9 * T)
        d = np.hypot(g.xx - x * T, (g.yy - 32.3 * T) * 0.8)
        emit(c, g, CANDLE * np.ones((g.h, g.w, 3), F32), sstep(0.5 * T, 0.05 * T, d) * 0.9)
    Lt = np.ones((H, W, 3), F32) * np.array([0.42, 0.4, 0.46], F32)
    for (x, y, r, colr, k, sx, sy) in lights:
        add_light(Lt, x, y, r, colr, k, sx, sy)
    Lt *= occlusion(c)[..., None]
    return finish(c, Lt)


def coroacao(c):
    room, rng = c.room, c.rng
    H, W = c.H, c.W
    col = back_stone(c, value=0.85, ch=0.7, bronze=0.3)
    # a parede de fora da escada é curva: escurece perto das paredes da torre
    xx = room.xx
    x0, x1 = 4 * T, 60 * T
    curve = np.clip(np.abs((xx - (x0 + x1) / 2) / ((x1 - x0) / 2)), 0, 1)
    col *= (1 - 0.45 * curve ** 2)[..., None]
    c.L.fill(col, np.ones((H, W), F32))
    del col, curve
    lights = []
    # o poço do núcleo no meio: o cilindro de pedra lisa de cima a baixo, as frestas acesas por dentro
    cx = 32 * T
    rad = 8.5 * T
    b = Box(cx - rad - 0.6 * T, 0, cx + rad + 0.6 * T, H)
    # a sombra do poço na parede de fora, dos dois lados
    put(c, b, GAP * np.ones((b.h, b.w, 3), F32), sstep(rad + 0.6 * T, rad, np.abs(b.xx - cx)) * 0.55)
    b = Box(cx - rad, 0, cx + rad, H)
    n = (b.xx - cx) / rad
    cosn = np.sqrt(np.clip(1 - n * n, 0, 1))
    # o cilindro está mais perto que a parede de fora: pedra mais clara, a luz do lado esquerdo
    shade = np.clip(cosn * 0.85 - n * 0.3 + 0.15, 0.08, 1.25)
    sc = STONES[2] * 1.45 * (0.9 + 0.2 * value_noise(b.h, b.w, 20, rng, 2))[..., None]
    # as fiadas do cilindro (curvas: sobem um pouco nas bordas)
    lift = (1 - cosn) * 0.4 * T
    vy = (b.yy + lift) % (0.9 * T)
    sc = mix(sc, sc * 1.15, (sstep(4.0, 1.6, vy) * 0.5)[..., None])
    sc = mix(sc, GAP, (sstep(1.8, 0.7, vy) * 0.8)[..., None])
    # as juntas de prumo andam de lado (o cilindro gira na vista)
    th = np.arcsin(np.clip(n, -1, 1))
    course = ((b.yy + lift) // (0.9 * T)).astype(np.int32)
    seam = ((th / (math.pi / 9) + (course % 2) * 0.5) % 1)
    sc = mix(sc, GAP, (sstep(0.0, 0.025, np.abs(seam - 0.5) - 0.47) * 0.7)[..., None])
    sc *= shade[..., None]
    # as faixas de bronze em volta do cilindro, a cada volta da escada, com os rebites
    for by in range(20, room.h, 22):
        y = by * T
        dyb = b.yy - y - lift
        band = sstep(0.3 * T, 0.2 * T, np.abs(dyb))
        bc = mix(BR_D, BR_L, np.clip(shade, 0, 1)[..., None] * 0.85)
        bc = mix(bc, BR_D * 0.7, sstep(0.05 * T, 0.28 * T, dyb)[..., None] * 0.6)
        riv = band * sstep(0.12, 0.05, np.abs(((th / (math.pi / 18)) % 1) - 0.5)) * sstep(0.08 * T, 0.0, np.abs(dyb))
        bc = mix(bc, BR_H, (riv * 0.8)[..., None])
        sc = mix(sc, bc, (band * 0.95)[..., None])
        sc = mix(sc, sc * 0.5, (sstep(0.3 * T, 0.5 * T, dyb) * sstep(0.8 * T, 0.5 * T, dyb) * 0.6)[..., None])
    a = sstep(1.0, 0.97, np.abs(n))
    put(c, b, sc, a)
    # as frestas: em cada volta, duas frestas altas com o topo em ponta, a luz do núcleo vazando por dentro
    for by in range(8, room.h - 6, 11):
        for off in (-0.38, 0.32):
            sx = cx + off * rad
            sy0, sy1 = by * T, (by + 3.4) * T
            hw = 0.24 * T * math.sqrt(max(0.2, 1 - off * off))
            # o batente de pedra em volta (mais claro) e a fresta
            fb = Box(sx - hw - 0.25 * T, sy0 - 0.5 * T, sx + hw + 0.25 * T, sy1 + 0.25 * T)
            dx = np.abs(fb.xx - sx)
            top = sy0 + 0.6 * T * dx / (hw + 0.25 * T)
            frame = (dx < hw + 0.25 * T) & (fb.yy > top - 0.5 * T) & (fb.yy < sy1 + 0.25 * T)
            put(c, fb, STONES[4] * 1.6 * np.ones((fb.h, fb.w, 3), F32), frame.astype(F32) * 0.9)
            slit = sstep(hw, hw - 1.5, dx) * sstep(top, top + 2, fb.yy) * sstep(sy1, sy1 - 2, fb.yy)
            k = 0.75 + 0.35 * (1 - by / room.h)
            core = mix(AMBER, hexc(0xfff0c0), sstep(hw, 0.0, dx)[..., None] * 0.8)
            emit(c, fb, core * k, slit)
            lights.append((sx, (sy0 + sy1) / 2, 2.4 * T, AMBER, 0.75 * k, 0.9, 1.5))
    # as janelinhas da parede de fora (o frio do céu), perto das paredes
    for by in range(14, room.h - 8, 22):
        for wx in (9.0, 55.0):
            if c.solid(int(wx), by) or c.solid(int(wx), by + 3):
                continue
            window(c, (wx - 0.8) * T, by * T, (wx + 0.8) * T, (by + 3.4) * T, lights, lancets=1, k=0.6)
    for (x, y, ch) in c.spawns('O,'):
        lights.append(((x + 0.5) * T, y * T, 4 * T, CANDLE, 0.7, 1.0, 1.0))
    Lt = np.ones((H, W, 3), F32) * np.array([0.42, 0.39, 0.44], F32)
    for (x, y, r, colr, k, sx, sy) in lights:
        add_light(Lt, x, y, r, colr, k, sx, sy)
    Lt *= occlusion(c)[..., None]
    return finish(c, Lt)


def lamp(c, x, y, lights, color=None, k=0.8, r=3.2):
    """A lâmpada de parede: o braço de bronze, o globo de vidro aceso e a luz dela na parede."""
    color = CANDLE if color is None else color
    arm = Box(x - 0.08 * T, y, x + 0.08 * T, y + 0.7 * T)
    put(c, arm, mix(BR_D, BR_M, 0.5) * np.ones((arm.h, arm.w, 3), F32), np.ones((arm.h, arm.w), F32))
    pl = Box(x - 0.22 * T, y + 0.6 * T, x + 0.22 * T, y + 0.82 * T)
    put(c, pl, mix(BR_M, BR_L, 0.4) * np.ones((pl.h, pl.w, 3), F32), np.ones((pl.h, pl.w), F32))
    g = Box(x - 0.6 * T, y - 0.7 * T, x + 0.6 * T, y + 0.5 * T)
    d = np.hypot(g.xx - x, (g.yy - (y - 0.1 * T)) * 0.85)
    emit(c, g, mix(color, hexc(0xfff4dc), sstep(0.3 * T, 0.0, d)[..., None] * 0.7), sstep(0.3 * T, 0.18 * T, d) * 0.95 + sstep(0.6 * T, 0.3 * T, d) * 0.25)
    lights.append((x, y, r * T, color, k, 1.0, 1.0))


def tiles_dado(c, x0, y0, x1, y1, rng):
    """O azulejo claro da sala de baixo: as peças quadradas, o rejunte, o encardido subindo do chão e as lascas;
    em cima, o friso de bronze."""
    b = Box(x0, y0, x1, y1)
    s = 0.5 * T
    u, v = (b.xx - x0) % s, (b.yy - y0) % s
    ix = ((b.xx - x0) // s).astype(np.int32)
    iy = ((b.yy - y0) // s).astype(np.int32)
    h = ((ix * 73856093) ^ (iy * 19349663)) & 1023
    tone = 0.85 + 0.25 * (h / 1023.0)
    col = mix(TILE_C, TILE_W, (tone - 0.85)[..., None] * 3) * tone[..., None]
    # o brilho do esmalte no canto de cima de cada peça
    col = mix(col, col * 1.12, (sstep(0.45 * s, 0.1 * s, u + v) * 0.5)[..., None])
    grout = np.maximum(sstep(1.6, 0.6, u), sstep(1.6, 0.6, v))
    col = mix(col, hexc(0x5a6670), (grout * 0.85)[..., None])
    # o encardido de baixo para cima e as manchas
    dirt = sstep(y0 + (y1 - y0) * 0.2, y1, b.yy) * 0.55 + sstep(0.6, 0.85, value_noise(b.h, b.w, 14, rng, 2)) * 0.3
    col = mix(col, col * 0.55, dirt[..., None])
    chips = sstep(0.86, 0.9, value_noise(b.h, b.w, 3, rng, 1)) * sstep(0.5, 0.7, value_noise(b.h, b.w, 40, rng, 1))
    col = mix(col, STONES[3], (chips * 0.9)[..., None])
    put(c, b, col, np.ones((b.h, b.w), F32))
    fb = Box(x0, y0 - 0.16 * T, x1, y0 + 0.02 * T)
    put(c, fb, mix(BR_L, BR_D, sstep(y0 - 0.16 * T, y0, fb.yy)[..., None]), np.ones((fb.h, fb.w), F32))


def gauge(c, cx, cy, r, rng, needle=0.6):
    """O mostrador: o aro de bronze, a face clara com as marcas e o ponteiro."""
    b = Box(cx - r - 3, cy - r - 3, cx + r + 3, cy + r + 3)
    d = np.hypot(b.xx - cx, b.yy - cy)
    ang = np.arctan2(b.yy - cy, b.xx - cx)
    rim = sstep(r + 1, r - 1, d)
    face = sstep(r * 0.8 + 1, r * 0.8 - 1, d)
    col = mix(BR_D, BR_L, np.clip(0.5 - 0.5 * np.cos(ang + 2.3), 0, 1)[..., None])
    col = mix(col, PAPER * 0.85, face[..., None])
    ticks = face * sstep(0.04, 0.0, np.abs(((ang / (2 * math.pi) * 16) % 1) - 0.5) / 16 * 2) * sstep(0.55 * r, 0.65 * r, d)
    col = mix(col, INK, (ticks * 0.9)[..., None])
    put(c, b, col, rim)
    keep(c, b, rim, grow=0.15)
    a = -math.pi * 0.75 + needle * math.pi * 1.5
    tip = (cx + math.cos(a) * r * 0.7, cy + math.sin(a) * r * 0.7)
    nb = Box(min(cx, tip[0]) - 3, min(cy, tip[1]) - 3, max(cx, tip[0]) + 3, max(cy, tip[1]) + 3)
    put(c, nb, INK * np.ones((nb.h, nb.w, 3), F32), nb.line([(cx, cy), tip], 1.4 * S))
    c.L.dab(cx, cy, 0.09 * r + 1.5, BR_L, 1.0, 0.6)


def paper(c, x0, y0, x1, y1, rng, lines=True, mark=None, sketch=None):
    """Uma folha pregada na parede: o papel amarelado, as linhas da letra, um desenho pequeno e o prego."""
    b = Box(x0, y0, x1, y1)
    col = PAPER * (0.82 + 0.2 * value_noise(b.h, b.w, 10, rng, 2))[..., None]
    col = mix(col, col * 0.75, sstep(0.0, 0.25, np.minimum.reduce([b.xx - x0, x1 - b.xx, b.yy - y0, y1 - b.yy]) / max(1, x1 - x0) * -1 + 0.25)[..., None] * 0.6)
    a = np.ones((b.h, b.w), F32)
    put(c, b, col, a)
    if lines:
        y = y0 + 0.28 * T
        while y < y1 - 0.2 * T:
            ln = rng.uniform(0.55, 0.92) * (x1 - x0 - 0.3 * T)
            lb = Box(x0 + 0.15 * T, y, x0 + 0.15 * T + ln, y + 0.05 * T)
            ink = (0.5 + 0.5 * value_noise(lb.h, lb.w, 3, rng, 1))
            put(c, lb, INK * np.ones((lb.h, lb.w, 3), F32), ink * 0.75)
            y += rng.uniform(0.16, 0.22) * T
    if sketch == 'crown':
        cx, cy = (x0 + x1) / 2, y0 + (y1 - y0) * 0.55
        w = (x1 - x0) * 0.32
        pts = [(cx - w, cy + w * 0.5), (cx - w, cy - w * 0.3), (cx - w * 0.5, cy), (cx, cy - w * 0.6), (cx + w * 0.5, cy), (cx + w, cy - w * 0.3), (cx + w, cy + w * 0.5), (cx - w, cy + w * 0.5)]
        sb = Box(cx - w - 3, cy - w - 3, cx + w + 3, cy + w + 3)
        put(c, sb, INK * np.ones((sb.h, sb.w, 3), F32), sb.line(pts, 1.2 * S) * 0.85)
    if mark == 'scrawl':
        # a sétima sessão: a letra perde a linha e tudo vira um borrão
        for i in range(9):
            pts = [(rng.uniform(x0 + 4, x1 - 4), rng.uniform(y0 + 6, y1 - 4)) for _ in range(4)]
            sb = Box(x0, y0, x1, y1)
            put(c, sb, INK * np.ones((sb.h, sb.w, 3), F32), sb.line(pts, rng.uniform(1.2, 2.6) * S) * 0.8)
    c.L.dab((x0 + x1) / 2, y0 + 0.12 * T, 0.07 * T, BR_L, 1.0, 0.5)


def wall_shelf(c, x0, x1, y, rng):
    """A prateleira presa na parede por duas mãos-francesas, com os cadernos em pé e alguns deitados."""
    tb = Box(x0, y, x1, y + 0.2 * T)
    put(c, tb, mix(WOOD_L * 1.3, WOOD_D, sstep(y, y + 0.2 * T, tb.yy)[..., None]), np.ones((tb.h, tb.w), F32))
    # a sombra da tábua na parede
    sh = Box(x0 + 0.1 * T, y + 0.2 * T, x1 + 0.1 * T, y + 0.6 * T)
    put(c, sh, GAP * np.ones((sh.h, sh.w, 3), F32), sstep(y + 0.6 * T, y + 0.2 * T, sh.yy) * 0.45)
    for bx in (x0 + 0.5 * T, x1 - 0.7 * T):
        bracket(c, bx, y + 0.14 * T, 0.45 * T, 0.55 * T, rng, iron=False)
    x = x0 + 0.15 * T
    while x < x1 - 0.4 * T:
        if rng.random() < 0.15:
            # uma pilha deitada
            w = rng.uniform(0.5, 0.75) * T
            hh = 0.0
            for k in range(int(rng.integers(2, 5))):
                th = rng.uniform(0.06, 0.1) * T
                bk = Box(x + rng.uniform(-0.05, 0.05) * T, y - hh - th, x + w, y - hh)
                put(c, bk, SPINES[rng.integers(len(SPINES))] * rng.uniform(0.8, 1.1) * np.ones((bk.h, bk.w, 3), F32), np.ones((bk.h, bk.w), F32))
                hh += th
            x += w + 0.08 * T
            continue
        if rng.random() < 0.07:
            # um frasco de vidro com um resto de Âmbar no fundo
            fw, fh = 0.32 * T, 0.5 * T
            fb = Box(x, y - fh, x + fw, y)
            u = (fb.xx - x) / fw
            neck = (u > 0.3) & (u < 0.7)
            shape = ((fb.yy > y - fh * 0.72) | neck).astype(F32)
            put(c, fb, mix(GLASS, GLASS * 1.6, sstep(0.6, 0.15, u)[..., None]), shape * 0.85)
            lvl = sstep(y - fh * 0.3, y - fh * 0.26, fb.yy) * (fb.yy > y - fh * 0.72)
            emit(c, fb, AMBER * 0.8 * np.ones((fb.h, fb.w, 3), F32), lvl * 0.7)
            x += fw + 0.06 * T
            continue
        w = rng.uniform(0.12, 0.2) * T
        h = rng.uniform(0.55, 0.78) * T
        bk = Box(x, y - h, x + w, y)
        cc = SPINES[rng.integers(len(SPINES))] * rng.uniform(1.0, 1.45)
        put(c, bk, cc * (0.8 + 0.3 * (1 - sstep(x, x + w, bk.xx)))[..., None], np.ones((bk.h, bk.w), F32))
        # o rótulo no lombo
        if rng.random() < 0.5:
            lb = Box(x + 0.2 * w, y - h * 0.7, x + 0.8 * w, y - h * 0.58)
            put(c, lb, PAPER * 0.7 * np.ones((lb.h, lb.w, 3), F32), np.ones((lb.h, lb.w), F32) * 0.8)
        x += w + rng.uniform(0.0, 0.03) * T


def cabinet(c, x0, y0, x1, y1, rng, crowns=True):
    """O armário de vidro das coroas de reserva: a moldura escura, as prateleiras, as coroas de Âmbar (apagadas)
    e o reflexo do vidro."""
    b = Box(x0, y0, x1, y1)
    col = mix(WOOD_M, WOOD_D, sstep(x0, x1, b.xx)[..., None] * 0.5) * (0.85 + 0.3 * stretched_noise(b.h, b.w, 1.4 * S, 26 * S, rng))[..., None]
    put(c, b, col, np.ones((b.h, b.w), F32))
    fr = 0.25 * T
    ib = Box(x0 + fr, y0 + fr, x1 - fr, y1 - fr * 1.6)
    put(c, ib, WOOD_D * 0.45 * np.ones((ib.h, ib.w, 3), F32), np.ones((ib.h, ib.w), F32))
    n = 3
    sh = (y1 - fr * 1.6 - y0 - fr) / n
    for i in range(n):
        yb = y0 + fr + (i + 1) * sh
        tb = Box(x0 + fr, yb - 0.08 * T, x1 - fr, yb)
        put(c, tb, WOOD_L * np.ones((tb.h, tb.w, 3), F32), np.ones((tb.h, tb.w), F32))
        if not crowns:
            continue
        k = max(1, int((x1 - x0 - 2 * fr) / (0.9 * T)))
        for j in range(k):
            cx = x0 + fr + (j + 0.5) * (x1 - x0 - 2 * fr) / k
            w = 0.3 * T
            base = yb - 0.08 * T
            pts = [(cx - w, base), (cx - w, base - 0.3 * T), (cx - w * 0.5, base - 0.18 * T), (cx, base - 0.38 * T),
                   (cx + w * 0.5, base - 0.18 * T), (cx + w, base - 0.3 * T), (cx + w, base)]
            cb = Box(cx - w - 2, base - 0.42 * T, cx + w + 2, base + 1)
            a = cb.poly(pts)
            cc = mix(mix(AMBER, hexc(0x5a3416), 0.45), AMBER * 0.9, sstep(base, base - 0.38 * T, cb.yy)[..., None] * 0.5)
            put(c, cb, cc, a)
            c.glow.append((Box(cx - 1.5, base - 0.34 * T, cx + 1.5, base - 0.26 * T), AMBER * 1.1 * np.ones((max(1, int(0.08 * T) + 1), 4, 3), F32), np.ones((max(1, int(0.08 * T) + 1), 4), F32) * 0.6))
    # o vidro: o reflexo inclinado
    gb = Box(x0 + fr, y0 + fr, x1 - fr, y1 - fr * 1.6)
    refl = sstep(0.12 * T, 0.0, np.abs(((gb.xx - x0) - (gb.yy - y0) * 0.5) % (2.2 * T) - 0.4 * T))
    emit(c, gb, hexc(0xc8d8e4) * np.ones((gb.h, gb.w, 3), F32), refl * 0.12)


def blueprint(c, cx, cy, r, rng, x0, y0, x1, y1):
    """A planta do núcleo: a lousa escura com o desenho em giz (a esfera, as correntes até a viga, a torre
    embaixo, as cotas e as notas) e, na margem, a conta dela em outra tinta."""
    b = Box(x0, y0, x1, y1)
    col = hexc(0x1c2630) * (0.85 + 0.3 * value_noise(b.h, b.w, 16, rng, 2))[..., None]
    put(c, b, col, np.ones((b.h, b.w), F32))
    fb = Box(x0 - 0.2 * T, y0 - 0.2 * T, x1 + 0.2 * T, y1 + 0.2 * T)
    edge = 1 - ((fb.xx > x0) & (fb.xx < x1) & (fb.yy > y0) & (fb.yy < y1))
    put(c, fb, mix(BR_D, BR_M, 0.5) * np.ones((fb.h, fb.w, 3), F32), edge.astype(F32))
    chalk = np.zeros((b.h, b.w), F32)
    yy, xx = b.yy, b.xx
    d = np.hypot(xx - cx, yy - cy)
    lw = 1.0 * S
    for rr in (r, r * 0.92, r * 0.55):
        chalk = np.maximum(chalk, sstep(lw, 0, np.abs(d - rr)))
    # os meridianos da esfera (elipses)
    for k in (0.35, 0.7):
        e = np.hypot((xx - cx) / (r * k), (yy - cy) / r)
        chalk = np.maximum(chalk, sstep(lw / r * 1.2, 0, np.abs(e - 1)) * (d < r))
    # a viga em cima e as correntes
    beam_y = y0 + 0.9 * T
    chalk = np.maximum(chalk, sstep(lw, 0, np.abs(yy - beam_y)) * (np.abs(xx - cx) < r * 1.3))
    for ax in (-0.9, -0.35, 0.35, 0.9):
        px, py = cx + ax * r * 1.25, beam_y
        qx, qy = cx + ax * r * 0.62, cy - r * 0.78
        dx, dy = qx - px, qy - py
        ln2 = dx * dx + dy * dy
        t = np.clip(((xx - px) * dx + (yy - py) * dy) / ln2, 0, 1)
        dd = np.hypot(xx - px - t * dx, yy - py - t * dy)
        # a corrente em pontilhado (os elos)
        chalk = np.maximum(chalk, sstep(lw, 0, dd) * (np.sin(t * math.sqrt(ln2) / (0.12 * T) * math.pi) > -0.2))
    # a torre embaixo da esfera
    tw = r * 0.7
    ty = cy + r * 1.08
    for (ax, ay, bx2, by2) in ((cx - tw, ty, cx + tw, ty), (cx - tw, ty, cx - tw * 0.8, y1 - 0.4 * T), (cx + tw, ty, cx + tw * 0.8, y1 - 0.4 * T)):
        dx, dy = bx2 - ax, by2 - ay
        ln2 = max(dx * dx + dy * dy, 1)
        t = np.clip(((xx - ax) * dx + (yy - ay) * dy) / ln2, 0, 1)
        chalk = np.maximum(chalk, sstep(lw, 0, np.hypot(xx - ax - t * dx, yy - ay - t * dy)))
    # as cotas: as linhas finas com as pontas
    for (ax, ay, bx2, by2) in ((cx - r, cy + r * 1.35, cx + r, cy + r * 1.35), (cx + r * 1.4, cy - r, cx + r * 1.4, cy + r)):
        dx, dy = bx2 - ax, by2 - ay
        ln2 = max(dx * dx + dy * dy, 1)
        t = np.clip(((xx - ax) * dx + (yy - ay) * dy) / ln2, 0, 1)
        chalk = np.maximum(chalk, sstep(lw * 0.8, 0, np.hypot(xx - ax - t * dx, yy - ay - t * dy)) * 0.7)
    # as notas (linhas curtas de letra em giz)
    for (nx, ny) in ((x0 + 0.5 * T, y0 + 1.6 * T), (x0 + 0.5 * T, y1 - 2.6 * T), (x1 - 3.6 * T, y1 - 2.2 * T)):
        for i in range(4):
            ln = rng.uniform(1.4, 2.8) * T
            mask = (np.abs(yy - (ny + i * 0.3 * T)) < 0.04 * T) & (xx > nx) & (xx < nx + ln)
            chalk = np.maximum(chalk, mask * (0.5 + 0.5 * value_noise(b.h, b.w, 2, rng, 1)))
    chalk *= 0.55 + 0.45 * value_noise(b.h, b.w, 4, rng, 1)
    put(c, b, hexc(0xc8d0d4) * np.ones((b.h, b.w, 3), F32), chalk * 0.8)
    # a conta dela na margem, em tinta de Âmbar
    mx = x1 - 2.4 * T
    for i in range(6):
        ln = rng.uniform(0.9, 1.9) * T
        mask = (np.abs(yy - (y0 + 1.4 * T + i * 0.32 * T)) < 0.045 * T) & (xx > mx) & (xx < mx + ln)
        put(c, b, mix(AMBER, BR_L, 0.4) * np.ones((b.h, b.w, 3), F32), mask * 0.85)


def experiencias(c):
    room, rng = c.room, c.rng
    H, W = c.H, c.W
    col = back_stone(c, value=0.92, ch=0.7, bronze=0.22)
    col *= np.array([0.86, 0.96, 1.12], F32)
    # só dentro da torre: a ponte coberta, os pilares dela e o céu em volta ficam de fora
    inside = sstep(22.4 * T, 23.2 * T, room.xx)
    c.L.fill(col, inside)
    del col
    lights = []
    # embaixo, a sala das cadeiras: o azulejo até a meia altura, as lâmpadas frias, o painel do tanque
    tiles_dado(c, 26 * T, 61.4 * T, 86 * T, 66 * T, rng)
    for x in (31.0, 47.5, 79.5):
        lamp(c, x * T, 57.2 * T, lights, COLD, 0.75)
    pb = Box(69.0 * T, 56.4 * T, 77.2 * T, 61.2 * T)
    put(c, pb, mix(BR_D, BR_M, 0.35) * (0.85 + 0.3 * value_noise(pb.h, pb.w, 12, rng, 2))[..., None], np.ones((pb.h, pb.w), F32))
    for (gx, gy, nd) in ((70.6, 57.9, 0.2), (72.6, 57.9, 0.85), (74.6, 57.9, 0.55)):
        gauge(c, gx * T, gy * T, 0.62 * T, rng, nd)
    for k in range(5):
        pipe_v(c, (70.0 + k * 1.5) * T, 59.2 * T, 61.4 * T, 0.18 * T, rng, flanges=0)
    # no meio, os cadernos dos testes: a prateleira, as sete folhas das sessões e a lousa com as contas
    wall_shelf(c, 33.0 * T, 46.5 * T, 44.2 * T, rng)
    wall_shelf(c, 33.0 * T, 46.5 * T, 47.6 * T, rng)
    for i in range(7):
        for j in range(2):
            x0 = (49.0 + i * 2.15) * T + rng.uniform(-0.08, 0.08) * T
            y0 = (42.6 + j * 3.0) * T + rng.uniform(-0.08, 0.08) * T
            paper(c, x0, y0, x0 + 1.8 * T, y0 + 2.5 * T, rng, mark='scrawl' if (i == 6 and j == 0) else None,
                  sketch='crown' if j == 1 and i % 3 == 0 else None)
    for x in (39.0, 64.5, 80.0):
        lamp(c, x * T, 41.8 * T, lights, COLD, 0.7)
    # o andar das coroas de reserva: os armários de vidro
    cabinet(c, 31.0 * T, 29.6 * T, 39.5 * T, 37.0 * T, rng)
    cabinet(c, 52.0 * T, 29.6 * T, 60.5 * T, 37.0 * T, rng)
    pilaster(c, 45.2 * T, 46.3 * T, 27 * T, 38 * T)
    pilaster(c, 66.2 * T, 67.3 * T, 27 * T, 38 * T)
    for x in (43.0, 64.0):
        lamp(c, x * T, 28.4 * T, lights, COLD, 0.65)
    # em cima, a planta do núcleo entre as duas janelas
    blueprint(c, 56.0 * T, 11.5 * T, 4.3 * T, rng, 45.5 * T, 4.6 * T, 66.5 * T, 21.0 * T)
    for wx in (35.0, 77.0):
        window(c, (wx - 2.0) * T, 6.0 * T, (wx + 2.0) * T, 19.5 * T, lights, lancets=2, k=0.9)
    # o Âmbar do tanque (a luz que ainda sai dele) e a vela
    for (x, y, ch) in c.spawns('O'):
        lights.append(((x + 0.5) * T, y * T, 4.0 * T, CANDLE, 0.7, 1.0, 1.0))
    lights.append((66.5 * T, 63.0 * T, 5.5 * T, AMBER, 0.9, 1.0, 1.0))
    Lt = np.ones((H, W, 3), F32) * np.array([0.34, 0.4, 0.5], F32)
    for (x, y, r, colr, k, sx, sy) in lights:
        add_light(Lt, x, y, r, colr, k, sx, sy)
    Lt *= occlusion(c)[..., None]
    return finish(c, Lt)


def engrenagens(c):
    room, rng = c.room, c.rng
    H, W = c.H, c.W
    xx = room.xx
    col = back_stone(c, value=0.86, ch=0.72, bronze=0.2)
    # o cilindro da torre oca: escurece perto das paredes
    curve = np.clip(np.abs((xx - 36 * T) / (32 * T)), 0, 1)
    col *= (1 - 0.5 * curve ** 2)[..., None]
    # molhada: os escorridos escuros, a película da água que brilha e o calcário que a água deixou
    st = sstep(0.6, 0.86, stretched_noise(H, W, 2.4 * S, 70 * S, rng))
    col *= (1 - 0.35 * st)[..., None]
    film = sstep(0.9, 0.97, stretched_noise(H, W, 1.0 * S, 90 * S, rng)) * st
    col = mix(col, hexc(0x8fa2ac), (film * 0.3)[..., None])
    lime = sstep(0.93, 0.985, stretched_noise(H, W, 1.6 * S, 40 * S, rng)) * sstep(0.4, 0.7, value_noise(H, W, 80 * S, rng, 1))
    col = mix(col, hexc(0x9a9a92) * 0.6, (lime * 0.35)[..., None])
    c.L.fill(np.clip(col, 0, 1), np.ones((H, W), F32))
    del col, curve, st, film, lime
    lights = []
    # os canos do vapor: descem do alto pelas paredes até as saídas (a de baixo de cada lado é a última)
    vents = [(4, 30, 1), (4, 66, 1), (4, 102, 1), (67, 50, -1), (67, 86, -1)]
    for side_x, last in ((4.55, 102), (67.45, 86)):
        pipe_v(c, side_x * T, 0, (last + 1.2) * T, 0.42 * T, rng, flanges=4.0)
        # o tampão de baixo
        cap = Box((side_x - 0.45) * T, (last + 1.0) * T, (side_x + 0.45) * T, (last + 1.4) * T)
        put(c, cap, mix(BR_D, BR_M, 0.5) * np.ones((cap.h, cap.w, 3), F32), np.ones((cap.h, cap.w), F32))
    for (vx, vy, d) in vents:
        # a válvula em cima de cada saída: o volante de bronze
        px = (4.55 if d > 0 else 67.45) * T
        cy = (vy - 1.6) * T
        b = Box(px - 0.55 * T, cy - 0.55 * T, px + 0.55 * T, cy + 0.55 * T)
        dd = np.hypot(b.xx - px, b.yy - cy)
        ang = np.arctan2(b.yy - cy, b.xx - px)
        dang = np.abs(((ang / (2 * math.pi) * 5) % 1) - 0.5) * (2 * math.pi / 5)
        wheel = sstep(0.07 * T, 0.0, np.abs(dd - 0.42 * T)) + sstep(0.06 * T, 0.02 * T, dang * dd) * (dd < 0.42 * T)
        put(c, b, mix(BR_M, BR_L, 0.5) * np.ones((b.h, b.w, 3), F32), np.clip(wheel, 0, 1))
        c.L.dab(px, cy, 0.09 * T, BR_H, 1.0, 0.5)
    # as rodas da corrente dos baldes: em cima, pendurada no teto por duas barras; embaixo, de pé no fundo do poço
    hub_x = 60.5 * T
    for (hy, anchors) in ((6.0 * T, ((57.6 * T, 3.0 * T), (63.4 * T, 3.0 * T))), (140.0 * T, ((57.2 * T, 144.0 * T), (63.8 * T, 144.0 * T)))):
        for (ax, ay) in anchors:
            bb = Box(min(ax, hub_x) - 0.3 * T, min(ay, hy) - 0.3 * T, max(ax, hub_x) + 0.3 * T, max(ay, hy) + 0.3 * T)
            a = bb.line([(ax, ay), (hub_x, hy)], 0.32 * T)
            put(c, bb, mix(IRON_L, IRON_M, 0.4) * np.ones((bb.h, bb.w, 3), F32), a)
            # a sapata chumbada (no teto ou no fundo)
            sb = Box(ax - 0.5 * T, ay - 0.18 * T, ax + 0.5 * T, ay + 0.18 * T)
            put(c, sb, IRON_M * np.ones((sb.h, sb.w, 3), F32), np.ones((sb.h, sb.w), F32))
        hb = Box(hub_x - 0.9 * T, hy - 0.9 * T, hub_x + 0.9 * T, hy + 0.9 * T)
        dd = np.hypot(hb.xx - hub_x, hb.yy - hy)
        put(c, hb, mix(IRON_D, IRON_M, sstep(0.8 * T, 0.0, dd)[..., None]), sstep(0.82 * T, 0.75 * T, dd))
    # as lâmpadas de Âmbar nas paredes, a cada tanto, e a luz que entra pelas bocas (a de cima e a da ponte)
    for y in range(14, 140, 24):
        for x in (7.2, 64.8):
            if c.solid(int(x), y) or c.solid(int(x), y + 1):
                continue
            lamp(c, x * T, y * T, lights, CANDLE, 0.85, r=4.4)
    lights.append((36 * T, 1.5 * T, 9 * T, CANDLE, 0.45, 1.2, 0.8))
    lights.append((67 * T, 99 * T, 7 * T, hexc(0xd8c8b0), 0.55, 0.8, 1.0))
    # embaixo, o brilho da água do poço na parede (as linhas que tremem) e a vela da grande porta
    wb = Box(42 * T, 128 * T, 68 * T, 136.2 * T)
    k = sstep(128 * T, 136 * T, wb.yy)
    caus = sstep(0.62, 0.8, np.abs(np.sin((wb.xx * 0.07 + np.sin(wb.yy * 0.11) * 3.0 + value_noise(wb.h, wb.w, 18, rng, 2) * 9))))
    emit(c, wb, hexc(0xa8d4e0) * np.ones((wb.h, wb.w, 3), F32), caus * k * 0.12)
    lights.append((55 * T, 135 * T, 8 * T, hexc(0x7fb8cc), 0.4, 1.4, 0.6))
    for (x, y, ch) in c.spawns('O'):
        lights.append(((x + 0.5) * T, y * T, 4.5 * T, CANDLE, 0.8, 1.0, 1.0))
    # a luz das rodas da corrente (as lâmpadas presas nos suportes)
    for hy in (8.5, 137.5):
        lights.append((60.5 * T, hy * T, 5.5 * T, CANDLE, 0.45, 1.2, 1.0))
    Lt = np.ones((H, W, 3), F32) * np.array([0.4, 0.42, 0.47], F32)
    for (x, y, r, colr, k2, sx, sy) in lights:
        add_light(Lt, x, y, r, colr, k2, sx, sy)
    Lt *= occlusion(c)[..., None]
    return finish(c, Lt)


# ======================================================================================
# as salas de fora
# ======================================================================================
def nucleo(c):
    """O poço da escotilha, dentro da torre maior: a pedra do fundo, a luz do terraço em cima e o âmbar da
    Coroação subindo de baixo."""
    room, rng = c.room, c.rng
    H, W = c.H, c.W
    col = back_stone(c, value=0.85, ch=0.7, bronze=0.3)
    yy = room.yy
    a = np.zeros((H, W), F32)
    a[44 * T:, 49 * T:55 * T] = 1
    c.L.fill(col, a)
    del col
    lights = [(52 * T, 44 * T, 5 * T, hexc(0xd8c8e8), 0.6, 1.0, 1.0), (52 * T, 64 * T, 8 * T, AMBER, 0.7, 1.0, 1.4)]
    Lt = np.ones((H, W, 3), F32) * np.array([0.3, 0.28, 0.34], F32)
    for (x, y, r, colr, k, sx, sy) in lights:
        add_light(Lt, x, y, r, colr, k, sx, sy)
    Lt *= occlusion(c)[..., None]
    return finish(c, Lt)


def calha(c):
    """Os arcos atrás dos pilares: em cada vão entre dois pilares, o arco de volta inteira que segura o
    tabuleiro (as aduelas com o fecho, a pedra dos tímpanos), mais escuro que o terreno e com o ouro das nuvens
    batendo por baixo."""
    room, rng = c.room, c.rng
    H, W = c.H, c.W
    deck = 29
    stone = back_stone(c, value=1.0, ch=0.7, bronze=0.35)
    a = np.zeros((H, W), F32)
    ring = np.zeros((H, W), F32)
    lit = np.zeros((H, W), F32)
    row = deck
    x = 0
    spans = []
    while x < room.w:
        if c.sol[row, x]:
            x += 1
            continue
        xa = x
        while x < room.w and not c.sol[row, x]:
            x += 1
        xb = x - 1
        # entre dois pilares de pedra (não os canos de bronze), com o tabuleiro em cima
        if xa > 0 and xb < room.w - 1 and room.g[row, xa - 1] == '#' and room.g[row, xb + 1] == '#' and c.sol[row - 1, xa:xb + 1].all() and xb - xa + 1 <= 12:
            spans.append((xa, xb))
    for (xa, xb) in spans:
        X0, X1 = xa * T, (xb + 1) * T
        r = (X1 - X0) / 2
        cx = (X0 + X1) / 2
        cy = deck * T + r
        b = Box(X0, deck * T, X1, cy + 0.2 * T)
        d = np.hypot(b.xx - cx, b.yy - cy)
        # o tímpano (a pedra entre o arco e o tabuleiro) e a faixa das aduelas por baixo
        spand = sstep(r - 0.5, r + 0.5, d) * (b.yy <= cy)
        vous = sstep(r - 0.5, r + 0.5, d) * sstep(r + 0.75 * T + 0.5, r + 0.75 * T - 0.5, d) * (b.yy <= cy)
        sub = (slice(b.y0, b.y0 + b.h), slice(b.x0, b.x0 + b.w))
        a[sub] = np.maximum(a[sub], spand)
        ang = np.arctan2(b.yy - cy, b.xx - cx)
        jd = (0.5 - np.abs(((ang / math.pi * 11) % 1) - 0.5)) * (math.pi / 11) * d
        joint = sstep(1.6, 0.5, jd)
        keyst = sstep(0.32 * T, 0.22 * T, np.abs(b.xx - cx)) * vous
        ring[sub] = np.maximum(ring[sub], np.clip(vous * (1 - joint * 0.9) + keyst * 0.3, 0, 1))
        # o intradorso olha para baixo, para as nuvens: o ouro bate nele
        lit[sub] = np.maximum(lit[sub], sstep(r + 0.5 * T, r, d) * spand * sstep(cy - r * 1.05, cy, b.yy))
    col = stone * 0.75
    col = mix(col, STONES[4] * 1.25, (ring * 0.7)[..., None])
    col = mix(col, mix(col, GOLD, 0.6) * 1.2, (lit * 0.75)[..., None])
    # a sombra do tabuleiro em cima do tímpano
    yy = room.yy
    col = mix(col, col * 0.55, (sstep((deck + 1.2) * T, deck * T, yy) * 0.6)[..., None])
    c.L.fill(np.clip(col, 0, 1), a)
    del col, stone
    Lt = np.ones((H, W, 3), F32)
    L = finish(c, Lt)
    # a névoa dourada das nuvens, como nos pilares do terreno
    low = yy / H
    haze = sstep(0.5, 1.0, low) ** 1.4 * 0.62
    L.P[:] = mix(L.P, HAZE * L.A[..., None], haze[..., None])
    return L


def escada(c):
    """Os canos de bronze que sobem com a escada (por eles a água do vale sobe sozinha): dois, juntos, um pouco
    abaixo dos lanços, com as curvas nos patamares, passando atrás dos pilares; atravessam o vão do lanço que
    caiu e entram na torre lá em cima. As barras de ferro penduradas embaixo dos lanços seguram os dois."""
    room, rng = c.room, c.rng
    # a face de baixo de cada trecho da escada (tiles: coluna inicial, final e a linha logo abaixo da pedra)
    under = [(25, 29, 76), (30, 34, 73), (35, 39, 70), (40, 44, 67), (45, 49, 64), (50, 54, 61), (55, 70, 59),
             (71, 75, 55), (76, 80, 52), (91, 95, 43), (96, 100, 40), (101, 105, 37), (106, 123, 35), (124, 128, 31),
             (129, 133, 28), (134, 138, 25), (139, 143, 22), (144, 148, 19), (149, 153, 16), (154, 155, 14)]
    # o traçado dos canos: a reta pela quina de baixo de cada degrau, plana nos patamares
    path = [(23.0, 79.0), (25.0, 76.0), (52.0, 60.4), (56.5, 59.0), (69.5, 59.0), (72.5, 54.8), (80.0, 50.3),
            (91.0, 43.7), (104.5, 35.6), (107.5, 35.0), (122.5, 35.0), (125.5, 30.4), (156.5, 11.8)]
    off = [1.55, 2.45]
    rad = [0.34 * T, 0.27 * T]
    for k in range(2):
        pts = [(x * T, (y + off[k]) * T) for (x, y) in path]
        pipe_path(c, pts, rad[k], rng, collars=2.6)
    # as barras: da face de baixo do lanço até o cano de baixo, onde não tem pilar na frente
    def y_at(x):
        for (xa, ya), (xb, yb) in zip(path[:-1], path[1:]):
            if xa <= x <= xb:
                return ya + (yb - ya) * (x - xa) / (xb - xa)
        return None
    for (xa, xb, uy) in under:
        for x in np.arange(xa + 0.5, xb + 0.6, 2.5):
            y = y_at(x)
            if y is None:
                continue
            top = uy * T
            bot = (y + off[1] + 0.3) * T
            if bot - top < 0.4 * T:
                continue
            if any(c.solid(int(x), yy) for yy in range(uy, int(y + off[1]) + 1)):
                continue
            hb = Box(x * T - 0.08 * T, top, x * T + 0.08 * T, bot)
            put(c, hb, mix(IRON_M, IRON_D, 0.3) * np.ones((hb.h, hb.w, 3), F32), np.ones((hb.h, hb.w), F32))
            # a braçadeira em volta dos dois canos
            for k in range(2):
                cy = (y + off[k]) * T
                cb = Box(x * T - 0.14 * T, cy - rad[k] - 2, x * T + 0.14 * T, cy + rad[k] + 2)
                put(c, cb, IRON_M * np.ones((cb.h, cb.w, 3), F32), np.ones((cb.h, cb.w), F32) * 0.9)
            c.L.dab(x * T, top + 0.12 * T, 0.1 * T, IRON_L, 1.0, 0.5)
    # a luz: de cima o frio do céu, de baixo o ouro das nuvens (mais forte embaixo)
    H, W = c.H, c.W
    yy = room.yy
    low = yy / H
    Lt = np.ones((H, W, 3), F32) * 0.85
    Lt += (GOLD * 0.6 * low[..., None] ** 1.4).astype(F32)
    L = finish(c, Lt)
    # a névoa dourada perto das nuvens come os canos embaixo
    haze = sstep(0.55, 1.0, low) ** 1.4 * 0.6
    L.P[:] = mix(L.P, HAZE * L.A[..., None], haze[..., None])
    return L


def patio(c):
    """As três torres em volta do pátio, atrás do que se pisa: a do Arquivo (a da esquerda), a do meio (a mais
    larga, com a grande porta) e a da direita (a das Experiências, com a porta no terraço). Fachadas lisas de
    cantaria com as faixas de bronze e os contrafortes, os portais em arco em volta das portas e as janelas
    altas, todas apagadas. Embaixo o ouro das nuvens, em cima o frio do céu."""
    room, rng = c.room, c.rng
    H, W = c.H, c.W
    yy, xx = room.yy, room.xx
    stone = back_stone(c, value=1.0, ch=0.75, bronze=0.4)
    a = np.zeros((H, W), F32)
    doors = {(x, y): ch for (x, y, ch) in c.spawns('O')}
    towers = [
        # (x0, x1, chão, porta x, linhas das janelas)
        (24.0, 48.0, 50, 36.5),
        (61.0, 90.5, 50, 75.5),
        (111.0, 150.0, 40, 125.5),
    ]
    face = np.zeros((H, W), F32)
    for (x0, x1, floor, dx) in towers:
        X0, X1 = x0 * T, x1 * T
        a[:floor * T + T, int(X0):int(X1)] = 1
        # os contrafortes nas pontas (mais perto, mais claros, a sombra do lado de dentro)
        for (bx0, bx1, left) in ((X0, X0 + 1.6 * T, True), (X1 - 1.6 * T, X1, False)):
            face[:floor * T + T, int(bx0):int(bx1)] = 1
    col = stone * 0.82
    col = mix(col, col * 1.25, (face * 0.6)[..., None])
    # as faixas de bronze a cada oito fiadas (como nas fachadas do terreno)
    course = (yy // (0.75 * T)).astype(np.int64)
    v = yy % (0.75 * T)
    band = ((course % 8) == 7) * sstep(0.75 * T - 5.0, 0.75 * T - 3.5, v)
    bc = mix(BR_M, BR_L, sstep(0.75 * T - 5, 0.75 * T, v)[..., None] * 0.8)
    col = mix(col, bc, (band * 0.85)[..., None])
    c.L.fill(np.clip(col, 0, 1), a)
    del col, stone, face, band, bc, course, v
    lights = []
    for (x0, x1, floor, dx) in towers:
        # o portal em volta da porta: o arco fundo, a moldura de bronze e os degraus de pedra
        pw, ph = 2.6, 4.4
        X0, X1 = (dx - pw / 2 - 0.5) * T, (dx + pw / 2 + 0.5) * T
        Y0, Y1 = (floor - ph - 0.8) * T, floor * T
        pb = Box(X0, Y0, X1, Y1)
        cx = (X0 + X1) / 2
        rr = (X1 - X0) / 2
        dd = np.hypot(pb.xx - cx, np.minimum(pb.yy - (Y0 + rr), 0))
        outer = sstep(rr + 0.5, rr - 0.5, dd)
        inner = sstep(rr - 0.45 * T + 0.5, rr - 0.45 * T - 0.5, dd)
        pc = mix(STONES[4] * 1.3, mix(BR_M, BR_L, 0.4), sstep(rr - 0.5 * T, rr - 0.3 * T, dd)[..., None] * sstep(rr - 0.1 * T, rr - 0.3 * T, dd)[..., None])
        pc = mix(pc, GAP * 1.2, inner[..., None])
        put(c, pb, pc, outer)
        # as janelas altas apagadas: o vidro escuro com o reflexo do ouro embaixo
        n = max(1, int((x1 - x0 - 4) // 6))
        for i in range(n):
            wx = x0 + 2 + (i + 0.5) * (x1 - x0 - 4) / n
            for wy in range(floor - 10, 2, -11):
                if abs(wx - dx) < 3.2 and wy > floor - 12:
                    continue
                wb0, wb1 = (wx - 0.9) * T, (wx + 0.9) * T
                yb0, yb1 = wy * T, (wy + 4.2) * T
                gb = Box(wb0 - 0.25 * T, yb0 - 0.25 * T, wb1 + 0.25 * T, yb1 + 0.3 * T)
                gcx = (wb0 + wb1) / 2
                grr = (wb1 - wb0) / 2
                gd = np.hypot(gb.xx - gcx, np.minimum(gb.yy - (yb0 + grr), 0))
                frame = sstep(grr + 0.25 * T + 0.5, grr + 0.25 * T - 0.5, gd) * (gb.yy < yb1 + 0.3 * T)
                hole = sstep(grr + 0.5, grr - 0.5, gd) * (gb.yy < yb1)
                t = np.clip((gb.yy - yb0) / (yb1 - yb0), 0, 1)
                glass = mix(hexc(0x15141c), mix(hexc(0x15141c), GOLD * 0.5, 0.45), sstep(0.5, 1.0, t)[..., None])
                glass = mix(glass, hexc(0x5a5470), (sstep(0.1 * T, 0.0, np.abs((gb.xx - wb0) - (gb.yy - yb0) * 0.4 - 0.4 * T)) * 0.4)[..., None])
                fc = STONES[4] * 1.3
                put(c, gb, mix(fc * np.ones((gb.h, gb.w, 3), F32), glass, hole[..., None]), np.maximum(frame, hole))
    # a luz: o frio do céu de cima, o ouro das nuvens de baixo
    low = np.clip((yy / H), 0, 1)
    Lt = np.ones((H, W, 3), F32) * np.array([0.62, 0.6, 0.72], F32)
    Lt += (GOLD * 0.75 * (low[..., None] ** 2.2)).astype(F32)
    Lt *= occlusion(c)[..., None]
    L = finish(c, Lt)
    # as torres somem um pouco no ar (estão mais longe que o pátio): a névoa fria em cima, a dourada embaixo
    haze = mix(SKY * 0.55, HAZE * 0.8, low[..., None] ** 1.5)
    L.P[:] = mix(L.P, haze * L.A[..., None], 0.22)
    return L


ROOMS = {'arquivo': arquivo, 'trono': trono, 'coroacao': coroacao, 'experiencias': experiencias, 'engrenagens': engrenagens,
         'nucleo': nucleo, 'calha': calha, 'escada': escada, 'patio': patio}


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    name = args[0]
    out = args[1] if len(args) > 1 else os.path.join(HERE, 'hd_torres')
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    c = Ctx(name)
    L = ROOMS[name](c)
    L.image().save(f'{out}/parede-{name}-2x.png')
    downsample_soft(L, c.room).save(f'{out}/parede-{name}.png')
    print('parede', name, round(time.time() - t0, 1), 's', flush=True)

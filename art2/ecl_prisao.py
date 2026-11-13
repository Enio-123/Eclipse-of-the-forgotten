"""Fundos da Prisão Subterrânea para o ECLIPSE: os mesmos de fundos_prisao.py (mesmo desenho, mesmas
medidas no mundo), repintados em 3x com a pedra de pedra3.py: blocos com chanfro e rejunte, molduras de
aduelas em volta de cada cela, mísulas embaixo das passarelas, colunas redondas, tijolo assentado um a
um nos pilares e em anel nos arcos, e a luz das tochas batendo de raspão na parede.

Camadas (tamanho no mundo; as imagens têm o triplo):
  prison-far  1024x400  a parede do fundo do salão: três andares de celas, passarelas, colunas, correntes
  prison-mid  1024x420  a arcada de tijolo mais perto: pilares, tochas, correntes com gancho e a gaiola

uso: python3 ecl_prisao.py <pasta_saida> [camada ...] [--preview=<pasta>]
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from brush import hexc, mix, sstep, blur
from shapes import Mask
from pedra3 import Blocks, Ring, Light, shade, streaks, cracks, grain, cyl, grid, pnoise, wdx, wblur, TAU

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else 'hd_eclipse_fundos'
ONLY = set(ARGS[1:])
PREVIEW = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
T0 = time.time()

INK = hexc(0x040506)
FOG = hexc(0x2a3638)
WARM0, WARM1, WARM2 = hexc(0xb4501c), hexc(0xff9a44), hexc(0xffd890)
IRON, IRON_HI = hexc(0x0b0e10), hexc(0x4a565c)


def want(name):
    return not ONLY or name in ONLY


def arch_d(xx, yy, cx, w, spring):
    """Distância para fora de um vão com arco redondo (negativa dentro)."""
    r = w / 2
    body = np.maximum(np.abs(xx - cx) - r, spring - yy)
    arch = np.hypot(xx - cx, yy - spring) - r
    return np.where(yy < spring, arch, body)


class Canvas:
    """Tela que dá a volta na horizontal, com janelas locais (as coordenadas da janela não dão a volta)."""

    def __init__(self, TW, H):
        self.TW, self.H = TW, H
        self.col = np.zeros((H, TW, 3), np.float32)
        self.a = np.zeros((H, TW), np.float32)

    def win(self, x0, y0, w, h):
        x0, y0 = int(math.floor(x0)), int(math.floor(y0))
        ya, yb = max(0, y0), min(self.H, y0 + int(h))
        cols = np.arange(x0, x0 + int(w)) % self.TW
        ly, lx = grid(int(w), max(0, yb - ya), x0, ya)
        return slice(ya, yb), cols, ly, lx

    def get(self, arr, rows, cols):
        return arr[rows][:, cols]

    def over(self, rows, cols, col, a):
        if rows.stop <= rows.start:
            return
        P = self.col[rows][:, cols]
        A = self.a[rows][:, cols]
        a = np.clip(a, 0, 1)
        out_a = a + A * (1 - a)
        P = (np.broadcast_to(col, P.shape) * a[..., None] + P * (A * (1 - a))[..., None]) / np.maximum(out_a, 1e-5)[..., None]
        tmpc = self.col[rows]
        tmpc[:, cols] = P
        self.col[rows] = tmpc
        tmpa = self.a[rows]
        tmpa[:, cols] = out_a
        self.a[rows] = tmpa

    def image(self):
        out = np.dstack([np.clip(self.col, 0, 1), np.clip(self.a, 0, 1)[..., None]])
        return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def chain(cv, x, y0, y1, w=3.6, hook=False, hi=IRON_HI, hi_k=0.5, warm=None):
    """Corrente pendurada (elos em pé e deitados) com o brilho do ferro de um lado; gancho opcional."""
    LW = 60
    rows, cols, ly, lx = cv.win(x - LW / 2, y0 - 12, LW, (y1 - y0) + 80)
    if rows.stop <= rows.start:
        return
    h = rows.stop - rows.start
    m = Mask(LW, h)
    X = LW / 2
    oy = rows.start
    k, y = 0, y0
    while y < y1:
        cy = y + 6 - oy
        if k % 2:
            m.ellipse(X, cy, w * 0.55, 6.6)
        else:
            m.ellipse(X, cy, w * 1.2, 6.0)
            m.ellipse(X, cy, w * 0.42, 3.3, v=0)
        y += 10.8
        k += 1
    if hook:
        s = w / 2.4
        yb = y - oy
        m.line([(X, yb), (X, yb + 14 * s)], 3.9 * s)
        m.line([(X, yb + 14 * s), (X + 4.5 * s, yb + 20 * s), (X + 10.5 * s, yb + 18 * s), (X + 12 * s, yb + 10.5 * s)], 3.6 * s)
        m.line([(X + 12 * s, yb + 10.5 * s), (X + 9 * s, yb + 7.5 * s)], 3.0 * s)
    a = m.array()
    col = np.broadcast_to(IRON, a.shape + (3,)).copy()
    # brilho do ferro na beira esquerda de cada elo
    left = np.clip(a - np.roll(a, 1, axis=1), 0, 1)
    col = mix(col, hi, (left * hi_k)[..., None])
    if warm is not None:
        right = np.clip(a - np.roll(a, -1, axis=1), 0, 1)
        col = mix(col, warm, (right * 0.55)[..., None])
    cv.over(rows, cols, col, a * 0.97)


def flame(cv, x, y, s=1.0, rng=None):
    """Chama: o corpo laranja, o miolo claro e o halo em volta (x, y = a base da chama)."""
    LW, LH = int(240 * s), int(260 * s)
    rows, cols, ly, lx = cv.win(x - LW / 2, y - LH * 0.72, LW, LH)
    if rows.stop <= rows.start:
        return
    dx, dy = lx - x, ly - y
    for r, k in ((110 * s, 0.07), (62 * s, 0.1), (30 * s, 0.18)):
        g = np.exp(-(np.hypot(dx, (dy + 22 * s) * 0.9) / r) ** 2)
        cv.over(rows, cols, WARM0, g * k)
    # o corpo: uma gota torta que afina para cima
    t = np.clip(-dy / (40 * s), 0, 1)
    wob = np.sin(t * 5.0 + 0.6) * 2.2 * s * t
    half = (8.5 * s) * (1 - t) ** 0.75 * sstep(-0.12, 0.1, t)
    body = np.clip(half - np.abs(dx - wob) + 0.6, 0, 1) * (dy < 3 * s) * (dy > -40 * s)
    cv.over(rows, cols, mix(WARM1, WARM0, t[..., None] * 0.7), body * 0.95)
    t2 = np.clip(-dy / (24 * s), 0, 1)
    core = np.clip((5.0 * s) * (1 - t2) ** 0.8 * sstep(-0.1, 0.12, t2) - np.abs(dx - wob * 0.5) + 0.5, 0, 1) * (dy < 2 * s) * (dy > -24 * s)
    cv.over(rows, cols, WARM2, core * 0.95)


# ======================================================================================
# A parede do fundo: as galerias de celas
# ======================================================================================
def prison_far(rng):
    TW, H = 3072, 1200
    yy, xx = grid(TW, H)
    floor = 960
    tiers = [(180, 375), (450, 645), (720, 915)]
    pitch = 192
    ncell = TW // pitch
    cw, slab = 96, 24

    # ---------- a pedra da parede ----------
    B = Blocks(yy, xx, TW, 33.0, 86.0, rng, vary=0.4)
    face = B.face(1.7, 2.8)
    h = B.height(depth=2.4, jut=1.0, tilt=1.1, mortar=1.7, bevel=2.8, round_=0.5)
    pit = pnoise(H, TW, 4.5, rng, 2)
    h += (pit - 0.5) * 1.3 * face
    big = pnoise(H, TW, 80, rng, 3)
    stone = mix(hexc(0x4a5658), hexc(0x5b6664), B.r(3)[..., None])
    stone = mix(stone, hexc(0x4f5a4c), (sstep(0.6, 0.95, B.r(4)) * 0.5)[..., None])   # algumas pedras esverdeadas
    stone = mix(stone, hexc(0x3c4447), (sstep(0.7, 1.0, B.r(5)) * 0.6)[..., None])     # outras mais escuras
    alb = stone * (0.8 + 0.4 * big)[..., None] * (0.86 + 0.28 * pit)[..., None]
    alb = mix(alb, hexc(0x1c2122), ((1 - face) * 0.85)[..., None])                     # o rejunte
    # lascas nos cantos de alguns blocos
    chip = sstep(0.62, 0.8, pnoise(H, TW, 9, rng, 2)) * sstep(9.0, 2.0, np.hypot(B.du, B.dv)) * face
    h -= chip * 1.8
    alb = mix(alb, alb * 0.7, chip[..., None])
    # trincas
    cr = cracks(H, TW, rng, n=22)
    h -= cr * 1.6
    alb = mix(alb, hexc(0x0e1112), (cr * 0.8)[..., None])

    # ---------- as molduras das celas (aduelas) e os vãos ----------
    opening = np.zeros((H, TW), np.float32)       # o vão (0..1)
    glow = np.zeros((H, TW), np.float32)          # a luz de dentro das celas acesas
    reveal = np.zeros((H, TW), np.float32)        # a espessura da parede que aparece do lado direito do vão
    ringm = np.zeros((H, TW), np.float32)
    lit_cells = set(int(v) for v in rng.choice(np.arange(3 * ncell), 6, replace=False))
    lights = []
    cv0 = Canvas(TW, H)
    for ti, (top, bot) in enumerate(tiers):
        for i in range(ncell):
            cx = i * pitch + pitch / 2 + (ti % 2) * pitch / 2
            spring = top + cw / 2
            rows, cols, ly, lx = cv0.win(cx - pitch / 2, top - 30, pitch, bot - top + 34)
            R = Ring(ly, lx, cx, spring, cw / 2, 16.0, bot, stones=9, jamb=33.0, key=ti * 100 + i)
            d = arch_d(lx, ly, cx, cw, spring)
            op = np.clip(0.5 - d, 0, 1) * (ly < bot)
            rr = rng.random(8192).astype(np.float32)
            rf = sstep(0.7, 2.6, R.dist)
            rh = (2.6 + 3.2 * rf + (rr[R.key] - 0.5) * 1.6 * rf + R.keystone * 2.2) * R.m
            ra = mix(hexc(0x5d6a6c), hexc(0x6c7876), rr[R.key][..., None]) * (0.9 + 0.2 * pit[rows][:, cols])[..., None]
            ra = mix(ra, hexc(0x1c2122), ((1 - rf) * 0.85)[..., None])
            hw = h[rows][:, cols]
            hw = hw * (1 - R.m) + rh
            tmp = h[rows]; tmp[:, cols] = hw; h[rows] = tmp
            aw = alb[rows][:, cols]
            aw = mix(aw, ra, R.m[..., None])
            tmp = alb[rows]; tmp[:, cols] = aw; alb[rows] = tmp
            for arr, val in ((opening, op), (ringm, R.m)):
                tmp = arr[rows]; tmp[:, cols] = np.maximum(tmp[:, cols], val); arr[rows] = tmp
            # a espessura da parede: uma faixa de 10 px por dentro do vão, do lado direito e no alto à direita
            rv = np.clip((d + 10.5) / 3.0, 0, 1) * op * sstep(-6.0, 10.0, lx - cx)
            tmp = reveal[rows]; tmp[:, cols] = np.maximum(tmp[:, cols], rv); reveal[rows] = tmp
            if (ti * ncell + i) in lit_cells:
                g = np.exp(-((lx - cx) / 36) ** 2 - ((ly - (bot - 48)) / 50) ** 2) * op
                tmp = glow[rows]; tmp[:, cols] = np.maximum(tmp[:, cols], g); glow[rows] = tmp

    # ---------- as passarelas: a laje, as mísulas e a sombra embaixo ----------
    shadow = np.ones((H, TW), np.float32)
    topline = np.zeros((H, TW), np.float32)
    for top, bot in tiers:
        band = (yy >= bot) & (yy < bot + slab)
        SB = Blocks(yy, xx, TW, float(slab), 150.0, rng, vary=0.25, y0=bot)
        sf = SB.face(1.5, 2.4)
        sh = 9.0 + sf * 2.2 + (SB.r(0) - 0.5) * 1.2
        # a quina de cima arredondada e a de baixo com pingadeira
        sh -= sstep(4.0, 0.0, yy - bot) * 3.0
        sh -= sstep(slab - 5.0, slab, yy - bot) * 4.5
        sa = mix(hexc(0x66737a), hexc(0x77858a), SB.r(3)[..., None]) * (0.85 + 0.3 * pit)[..., None]
        sa = mix(sa, hexc(0x20272a), ((1 - sf) * 0.8)[..., None])
        h = np.where(band, sh, h)
        alb = np.where(band[..., None], sa, alb)
        # mísulas de pedra a cada 96 px
        px = ((xx + 48.0) % 96.0) - 48.0
        ky = yy - (bot + slab)
        cw2 = 12.0 - ky * 0.3
        cor = np.clip(cw2 - np.abs(px) + 0.5, 0, 1) * (ky >= 0) * (ky < 26)
        ch = 7.5 * (1 - sstep(14.0, 26.0, ky)) * np.clip(1.2 - (np.abs(px) / np.maximum(cw2, 1.0)) ** 4, 0, 1)
        h = np.where(cor > 0.5, ch + 1.5, h)
        alb = mix(alb, hexc(0x687579), (cor * 0.95)[..., None])
        # sombra da laje na parede de baixo (some em uns 60 px) e a luz no canto de cima da laje
        sdw = sstep(bot + slab + 70.0, bot + slab, yy) * (yy >= bot + slab)
        shadow *= 1 - 0.6 * sdw * (1 - cor * 0.4)
        topline = np.maximum(topline, sstep(3.4, 0.6, np.abs(yy - (bot + 1.2))))
    # a umidade escorre das lajes e das juntas
    wet = streaks(H, TW, rng, length=200.0, width=9.0, density=0.42)
    wet_k = np.zeros((H, TW), np.float32)
    for top, bot in tiers:
        wet_k = np.maximum(wet_k, sstep(bot + slab + 150.0, bot + slab, yy) * (yy > bot + slab))
    wet_k = np.maximum(wet_k, sstep(170.0, 0.0, yy) * 0.8)
    wetm = wet * wet_k * (1 - opening)
    alb = mix(alb, alb * hexc(0x8a9a86) * 0.62, (wetm * 0.85)[..., None])
    # musgo nas juntas e nos cantos úmidos
    moss = sstep(0.55, 0.8, pnoise(H, TW, 26, rng, 3)) * (1 - face) * np.clip(wet_k * 1.4 + 0.25, 0, 1)
    alb = mix(alb, hexc(0x3f5a34), (moss * 0.7)[..., None])

    # ---------- as colunas (meia coluna redonda a cada 768 px) ----------
    dxp = ((xx + 384.0) % 768.0) - 384.0
    hw_p = 51.0
    pm = np.clip(hw_p - np.abs(dxp) + 0.5, 0, 1)
    PB = Blocks(yy, xx, TW, 42.0, 110.0, rng, vary=0.0, stagger=0.0)
    drum = sstep(0.8, 2.6, PB.dv)
    ph = 30.0 * cyl(dxp / hw_p) + drum * 1.6 + (pit - 0.5) * 1.0
    pa = mix(hexc(0x5a676b), hexc(0x687579), PB.r(3)[..., None]) * (0.85 + 0.3 * big)[..., None] * (0.88 + 0.24 * pit)[..., None]
    pa = mix(pa, hexc(0x1d2325), ((1 - drum) * 0.7)[..., None])
    # anéis de pedra na altura de cada passarela e um capitel no alto
    for top, bot in tiers:
        k = yy - (bot - 3.0)
        ring_ = np.clip(1 - ((k - 15.0) / 15.0) ** 2, 0, 1) * (k > 0) * (k < 30)
        ph += ring_ * 5.5 * (np.abs(dxp) < hw_p + 5)
    capk = sstep(150.0, 96.0, yy) * sstep(60.0, 96.0, yy)
    ph += capk * 5.0
    h = h * (1 - pm) + ph * pm
    alb = mix(alb, pa, pm[..., None])
    # a coluna faz sombra na parede à direita dela
    shadow *= 1 - 0.38 * sstep(hw_p + 95.0, hw_p, dxp) * (dxp > hw_p) * (1 - pm)

    # ---------- tochas distantes nas passarelas ----------
    torches = []
    for k in range(7):
        top, bot = tiers[int(rng.integers(0, 3))]
        x = float(rng.uniform(0, TW))
        # nunca em cima de uma coluna nem de um vão
        for _ in range(40):
            dcol = abs(((x + 384.0) % 768.0) - 384.0)
            if dcol > 90:
                break
            x = float(rng.uniform(0, TW))
        y = bot - 60.0
        torches.append((x, y))
        lights.append(Light(x, y - 8, 30.0, 105.0, WARM1 * np.array([1.0, 0.92, 0.85], np.float32), 2.3))

    # ---------- a luz ----------
    col = shade(alb, h, yy, xx, TW, ambient=np.array([0.15, 0.17, 0.18]) * 1.0, sun=((-0.5, -0.72, 0.5), np.array([0.3, 0.34, 0.36])),
                lights=lights, k=1.0, spec=0.5, gloss=22.0, wet=np.clip(wetm * 1.5 + 0.12, 0, 1))
    col *= shadow[..., None]
    # a coluna é redonda: a luz fria pega o lado esquerdo e o direito cai na sombra (um resto de luz rebatida na beira)
    u = dxp / hw_p
    col *= (1 + pm * (0.32 - 0.85 * sstep(-0.75, 0.95, u) + 0.16 * sstep(0.82, 1.0, u)))[..., None]
    # a quina de cima das lajes pega a luz fria
    col = mix(col, hexc(0x7d8c92), (topline * 0.7 * (1 - pm))[..., None])
    # o escuro do alto (a abóbada) e a parede esfriando para baixo
    t = yy / H
    col *= (0.42 + 0.58 * sstep(0.0, 0.3, t))[..., None]

    cv = Canvas(TW, H)
    cv.col[:] = col
    cv.a[:] = 1

    # ---------- dentro das celas ----------
    inner = np.broadcast_to(hexc(0x030405), (H, TW, 3)).copy()
    # o fundo da cela: a parede de trás mal aparece (fiadas) e o chão pega um resto de luz
    back = (np.abs((yy % 30.0) - 15.0) > 13.2).astype(np.float32)
    inner = mix(inner, hexc(0x0a0d0e), ((1 - back) * 0.5)[..., None])
    inner = mix(inner, WARM0 * 0.85, (glow * 0.75)[..., None])
    inner = mix(inner, WARM1 * 0.9, (glow ** 3 * 0.35)[..., None])
    # a espessura da parede (o lado direito do vão): pedra fria, mais clara na quina
    rvc = mix(hexc(0x161b1d), hexc(0x38444a), reveal[..., None]) * (0.85 + 0.3 * pit)[..., None]
    rj = (np.abs((yy % 33.0) - 16.5) > 15.0).astype(np.float32)
    rvc = mix(rvc, hexc(0x0c0f10), (rj * 0.6)[..., None])
    rvc = rvc + WARM0 * (wblur(glow, 14.0) * 0.5)[..., None]
    inner = mix(inner, rvc, (reveal > 0.02)[..., None] * np.clip(reveal * 3.0, 0, 1)[..., None])
    cv.col[:] = mix(cv.col, inner, opening[..., None])
    # a sombra da moldura caindo dentro do vão (em cima e à esquerda)
    # grades: barras redondas em pé e a travessa
    bx = ((xx + 7.5) % 15.0) - 7.5
    bar = sstep(2.5, 1.3, np.abs(bx))
    barc = mix(hexc(0x1a2124), hexc(0x566268), sstep(0.2, -1.4, bx)[..., None])
    barc = mix(barc, hexc(0x07090a), sstep(0.6, 2.2, bx)[..., None])
    barc = barc + WARM0 * (wblur(glow, 10.0) * 0.55)[..., None] * sstep(-0.5, 1.8, np.abs(bx))[..., None]
    cross = np.zeros((H, TW), np.float32)
    crossc = np.zeros((H, TW, 3), np.float32)
    for top, bot in tiers:
        ky = yy - (top + 114.0)
        cross = np.maximum(cross, sstep(3.4, 2.0, np.abs(ky)))
        crossc = np.where((np.abs(ky) < 5)[..., None], mix(hexc(0x4e5a60), hexc(0x0a0c0d), sstep(-2.5, 2.5, ky)[..., None]), crossc)
    cv.col[:] = mix(cv.col, barc, (bar * opening * 0.96)[..., None])
    cv.col[:] = mix(cv.col, crossc, (cross * opening * 0.96)[..., None])

    # ---------- o parapeito de ferro das passarelas ----------
    for top, bot in tiers:
        k1 = yy - (bot - 39.0)
        k2 = yy - (bot - 14.0)
        rail = np.maximum(sstep(2.6, 1.4, np.abs(k1)), sstep(1.9, 0.9, np.abs(k2)))
        posts = sstep(2.2, 1.0, np.abs(((xx + 24.0) % 48.0) - 24.0)) * (yy > bot - 39) * (yy < bot)
        knob = np.clip(4.2 - np.hypot(((xx + 24.0) % 48.0) - 24.0, yy - (bot - 43.0)) + 0.5, 0, 1)
        m = np.clip(np.maximum(np.maximum(rail, posts), knob), 0, 1) * (1 - pm)
        rc = np.broadcast_to(IRON, (H, TW, 3)).copy()
        rc = mix(rc, hexc(0x46535a), (sstep(0.3, -1.6, k1) * sstep(-3.0, -1.2, k1))[..., None] * 0.9)
        rc = mix(rc, hexc(0x39454b), (sstep(0.5, -1.2, ((xx + 24.0) % 48.0) - 24.0) * posts)[..., None] * 0.6)
        cv.col[:] = mix(cv.col, rc, (m * 0.95)[..., None])

    # ---------- correntes penduradas da abóbada ----------
    for k in range(14):
        x = rng.uniform(0, TW)
        y1 = rng.uniform(120, 540)
        chain(cv, x, -14, y1, w=rng.uniform(2.9, 3.9), hook=rng.random() < 0.5)

    # ---------- as tochas (o ferro, a chama) ----------
    for x, y in torches:
        rows, cols, ly, lx = cv.win(x - 12, y - 6, 24, 30)
        m = Mask(24, rows.stop - rows.start)
        m.line([(12 - 7, 26), (12, 12), (12, 6)], 3.0)
        m.poly([(12 - 5.5, 2), (12 + 5.5, 2), (12 + 3.4, 10), (12 - 3.4, 10)])
        cv.over(rows, cols, IRON, m.array())
        flame(cv, x, y - 3, 0.42, rng)

    # ---------- névoa fria nos andares de baixo e o escuro do pé ----------
    fog = pnoise(H, TW, 135, rng, 2, sx=3.0)
    fa = sstep(570.0, 960.0, yy) * (0.25 + 0.5 * fog)
    cv.col[:] = mix(cv.col, FOG, (fa * 0.33)[..., None])
    cv.col[:] = mix(cv.col, hexc(0x060708), (sstep(floor - 75.0, floor + 225.0, yy) * 0.94)[..., None])
    # a parede está longe: o ar frio do salão fica na frente dela (menos contraste, mais escura que a arcada)
    lit = np.clip(cv.col.max(-1) - 0.42, 0, 1) * 2.5
    far = mix(cv.col, FOG * 0.42, 0.16) * 0.8
    cv.col[:] = mix(far, cv.col, np.clip(lit, 0, 1)[..., None])
    cv.col[:] = grain(cv.col, rng, 0.03)
    return cv


# ======================================================================================
# Mais perto: a arcada de tijolo, as tochas, as correntes e a gaiola
# ======================================================================================
def prison_mid(rng):
    TW, H = 3072, 1260
    yy, xx = grid(TW, H)
    span, pw = 768.0, 156.0
    floor, spring = 990.0, 375.0
    hw = pw / 2
    dxp = ((xx + span / 2) % span) - span / 2        # até o meio do pilar mais perto
    dxa = (xx % span) - span / 2                      # até o meio do vão mais perto
    r_in = span / 2 - hw
    rad = np.hypot(dxa, yy - spring)

    pier = np.clip(hw - np.abs(dxp) + 0.5, 0, 1)
    plinth_top = floor - 90.0
    plinth = np.clip(hw + 18.0 - np.abs(dxp) + 0.5, 0, 1) * np.clip(yy - plinth_top + 0.5, 0, 1)
    wall = np.clip(rad - r_in + 0.5, 0, 1) * (yy < spring)
    a = np.clip(np.maximum(np.maximum(pier, plinth), wall), 0, 1)

    pit = pnoise(H, TW, 4.0, rng, 2)
    big = pnoise(H, TW, 70, rng, 3)

    # ---------- o tijolo ----------
    Bk = Blocks(yy, xx, TW, 24.0, 51.2, rng, vary=0.1)
    bf = Bk.face(2.0, 2.2)
    h = Bk.height(depth=2.4, jut=1.1, tilt=1.2, mortar=2.0, bevel=2.2)
    h += (pit - 0.5) * 1.4 * bf
    brick = mix(hexc(0x7a5a46), hexc(0x94624a), Bk.r(3)[..., None])
    brick = mix(brick, hexc(0x4e3a32), (sstep(0.62, 0.95, Bk.r(4)) * 0.75)[..., None])   # tijolos queimados
    brick = mix(brick, hexc(0x9a7a62), (sstep(0.8, 1.0, Bk.r(5)) * 0.5)[..., None])      # e alguns mais claros
    alb = brick * (0.8 + 0.4 * big)[..., None] * (0.82 + 0.36 * pit)[..., None]
    alb = mix(alb, hexc(0x3c3632), ((1 - bf) * 0.9)[..., None])
    # tijolos lascados ou faltando um canto
    chip = sstep(0.66, 0.84, pnoise(H, TW, 8, rng, 2)) * sstep(8.0, 2.0, np.hypot(Bk.du, Bk.dv)) * bf
    h -= chip * 2.0
    alb = mix(alb, alb * 0.62, chip[..., None])

    # ---------- o anel do arco: duas voltas de tijolo em pé ----------
    ring_t = 42.0
    rd = rad - r_in
    ringm = np.clip(rd + 0.5, 0, 1) * np.clip(ring_t - rd + 0.5, 0, 1) * (yy < spring)
    th = np.arctan2(-(yy - spring), dxa) / math.pi           # 0..1 ao longo do arco
    lane = (rd > ring_t / 2).astype(np.float32)              # a volta de dentro e a de fora
    nst = 44.0
    ta = th * nst + lane * 0.5
    ia = np.floor(ta)
    fa_ = ta - ia
    arc = math.pi * (r_in + ring_t / 2) / nst
    dj = np.minimum(fa_, 1 - fa_) * arc
    dl = np.minimum(np.abs(rd - ring_t / 2), np.minimum(rd, ring_t - rd) + 1.0)
    rdist = np.minimum(dj, dl)
    rf = sstep(1.0, 3.0, rdist)
    cell_i = (np.floor(xx / span).astype(np.int64) % 4)
    rkey = ((ia.astype(np.int64) * 131 + lane.astype(np.int64) * 977 + cell_i * 3571) % 8192)
    rr = rng.random((3, 8192)).astype(np.float32)
    rh = 4.2 + rf * 2.4 + (rr[0][rkey] - 0.5) * 2.0 * rf + (pit - 0.5) * 1.2 * rf
    ra = mix(hexc(0x80604a), hexc(0x9a6a50), rr[1][rkey][..., None])
    ra = mix(ra, hexc(0x503c34), (sstep(0.7, 1.0, rr[2][rkey]) * 0.7)[..., None]) * (0.82 + 0.36 * pit)[..., None]
    ra = mix(ra, hexc(0x3a3430), ((1 - rf) * 0.9)[..., None])
    h = h * (1 - ringm) + rh * ringm
    alb = mix(alb, ra, ringm[..., None])

    # ---------- a imposta (a pedra de onde o arco nasce) e o soco do pilar ----------
    imp = np.clip(hw + 9.0 - np.abs(dxp) + 0.5, 0, 1) * (yy >= spring - 3) * (yy < spring + 30)
    ik = (yy - (spring - 3)) / 33.0
    ih = 7.0 + 4.0 * np.sin(np.clip(ik, 0, 1) * math.pi) + (pit - 0.5) * 1.0
    ia_ = hexc(0x6f7474) * (0.85 + 0.3 * pit)[..., None] * (0.85 + 0.3 * big)[..., None]
    h = h * (1 - imp) + ih * imp
    alb = mix(alb, ia_, imp[..., None])
    a = np.maximum(a, imp)
    PB = Blocks(yy, xx, TW, 30.0, 64.0, rng, vary=0.2, y0=plinth_top)
    pf = PB.face(1.8, 2.6)
    cap = sstep(plinth_top + 16.0, plinth_top, yy)                 # a quina chanfrada de cima do soco
    ph = 8.0 + PB.height(depth=2.2, jut=0.8, tilt=0.8, mortar=1.8, bevel=2.6, round_=0.6) - cap * 7.0 + (pit - 0.5) * 1.2 * pf
    pa = mix(hexc(0x5e6565), hexc(0x717878), PB.r(3)[..., None]) * (0.82 + 0.36 * big)[..., None] * (0.86 + 0.28 * pit)[..., None]
    pa = mix(pa, hexc(0x232728), ((1 - pf) * 0.85)[..., None])
    h = h * (1 - plinth) + ph * plinth
    alb = mix(alb, pa, plinth[..., None])

    # ---------- as quinas do pilar (chanfro) ----------
    edge_k = sstep(hw - 10.0, hw, np.abs(dxp)) * pier * (yy >= spring + 30) * (yy < plinth_top)
    h -= edge_k * 7.0

    # ---------- umidade, fuligem em cima da tocha, trincas ----------
    ty = 540.0
    soot = np.exp(-(dxp / 26.0) ** 2) * sstep(ty - 330.0, ty - 40.0, yy) * (yy < ty - 20) * pier
    alb = mix(alb, hexc(0x0e0c0b), (soot * 0.8)[..., None])
    wet = streaks(H, TW, rng, length=240.0, width=10.0, density=0.38)
    wet_k = np.maximum(sstep(spring + 30.0 + 200.0, spring + 30.0, yy) * (yy > spring + 30) * pier, sstep(260.0, 0.0, yy) * 0.9)
    wetm = wet * wet_k
    alb = mix(alb, alb * hexc(0x8c8a78) * 0.6, (wetm * 0.8)[..., None])
    moss = sstep(0.55, 0.8, pnoise(H, TW, 24, rng, 3)) * (1 - bf) * sstep(plinth_top - 140.0, plinth_top + 30.0, yy)
    alb = mix(alb, hexc(0x3c5230), (moss * 0.65 * (1 - ringm))[..., None])
    cr = cracks(H, TW, rng, n=14)
    h -= cr * 1.8
    alb = mix(alb, hexc(0x100e0d), (cr * 0.8)[..., None])

    # ---------- a luz: fria de cima e da esquerda, e a tocha de cada pilar de raspão ----------
    lights = [Light(i * span, ty - 26.0, 34.0, 150.0, WARM1 * np.array([1.0, 0.9, 0.8], np.float32), 2.7) for i in range(4)]
    col = shade(alb, h, yy, xx, TW, ambient=np.array([0.13, 0.135, 0.15]), sun=((-0.55, -0.68, 0.5), np.array([0.26, 0.28, 0.32])),
                lights=lights, k=1.0, spec=0.35, gloss=20.0, wet=np.clip(wetm * 1.6 + 0.1, 0, 1))
    # o pilar é um volume: o lado direito cai na sombra
    col *= (1.08 - 0.34 * sstep(-hw, hw, dxp) * np.maximum(pier, plinth))[..., None]
    # a parede de cima escurece para o alto (a abóbada)
    col *= (0.5 + 0.5 * sstep(0.0, 300.0, yy))[..., None]
    # a beira do arco (a quina que dá para o vão) escurece: o intradorso está na sombra
    col *= (1 - 0.45 * sstep(5.0, 0.0, rd) * (yy < spring) * wall)[..., None]

    cv = Canvas(TW, H)
    cv.col[:] = col
    cv.a[:] = a

    # ---------- as tochas dos pilares ----------
    for i in range(4):
        cx = i * span
        rows, cols, ly, lx = cv.win(cx - 30, ty - 12, 60, 60)
        m = Mask(60, rows.stop - rows.start)
        X = 30.0
        m.line([(X - 15, 12 + 33), (X, 12 + 9), (X, 12)], 4.8)
        m.poly([(X - 10.5, 12 - 3), (X + 10.5, 12 - 3), (X + 6, 12 + 12), (X - 6, 12 + 12)])
        ma = m.array()
        ic = np.broadcast_to(IRON, ma.shape + (3,)).copy()
        ic = mix(ic, hexc(0x6a3c20), (np.clip(ma - np.roll(ma, 2, axis=0), 0, 1) * 0.8)[..., None])
        cv.over(rows, cols, ic, ma)
        flame(cv, cx, ty - 4, 1.0, rng)

    # ---------- correntes com gancho nos vãos e a gaiola num deles ----------
    for i in range(4):
        bx = i * span + span / 2
        for k in range(2):
            x = bx + rng.uniform(-225, 225)
            chain(cv, x, -14, rng.uniform(240, 510), w=3.9, hook=rng.random() < 0.6, warm=hexc(0x5a3420))
        if i == 1:
            cage(cv, bx + 60, rng.uniform(330, 420), rng)

    # ---------- o pé some no escuro ----------
    cv.col[:] = mix(cv.col, hexc(0x060708), (sstep(floor - 120.0, floor + 240.0, yy) * 0.95)[..., None])
    cv.col[:] = grain(cv.col, rng, 0.03)
    return cv


def cage(cv, x, y, rng):
    """Gaiola pendurada no vão: corrente, argola, domo, barras redondas e o fundo; a tocha acende um lado."""
    chain(cv, x, -14, y, w=3.9, warm=hexc(0x5a3420))
    LW, LH = 180, 200
    rows, cols, ly, lx = cv.win(x - LW / 2, y, LW, LH)
    hgt = rows.stop - rows.start
    X = LW / 2
    m = Mask(LW, hgt)
    m.ellipse(X, 6, 9, 9)
    m.ellipse(X, 6, 5.1, 5.1, v=0)
    m.poly([(X - 60, 60), (X - 45, 27), (X, 15), (X + 45, 27), (X + 60, 60), (X + 60, 72), (X - 60, 72)])
    for k in range(7):
        bx = X - 54 + k * 18
        m.rect(bx - 2.4, 60, bx + 2.4, 174)
    m.rect(X - 63, 165, X + 63, 180)
    m.rect(X - 60, 114, X + 60, 120)
    a = m.array()
    col = np.broadcast_to(hexc(0x0b0c0e), a.shape + (3,)).copy()
    # o ferro redondo: brilho frio de um lado e a tocha do outro
    left = np.clip(a - np.roll(a, 2, axis=1), 0, 1)
    right = np.clip(a - np.roll(a, -2, axis=1), 0, 1)
    topl = np.clip(a - np.roll(a, 2, axis=0), 0, 1)
    col = mix(col, hexc(0x3a454c), (left * 0.55)[..., None])
    col = mix(col, hexc(0x6a3c22), (right * 0.7)[..., None])
    col = mix(col, hexc(0x2c3438), (topl * 0.5)[..., None])
    cv.over(rows, cols, col, a * 0.98)


# ======================================================================================
def save(cv, name):
    img = cv.image()
    if name.endswith('far'):
        img = img.convert('RGB')
    img.save(f'{OUT}/{name}.png')
    print(name, img.size, round(time.time() - T0, 1), 's', flush=True)
    return img


def preview(out, old=None):
    """Vista do jogo (640x360 no mundo, 3 px por px) com as duas camadas na posição de quem está no chão;
    com `old`, a mesma vista com os fundos 2x do EXTREME ampliados, lado a lado."""
    os.makedirs(out, exist_ok=True)
    for sx in (0, 700):
        views = []
        for src, k in ((old, 2), (OUT, 3)):
            if not src:
                continue
            view = Image.new('RGBA', (1920, 1080), (8, 7, 11, 255))
            for n, fac in (('prison-far', 0.12), ('prison-mid', 0.35)):
                p = f'{src}/{n}.png'
                if not os.path.exists(p):
                    continue
                im = Image.open(p).convert('RGBA')
                if k != 3:
                    im = im.resize((im.width * 3 // k, im.height * 3 // k), Image.BICUBIC)
                shift = int(sx * fac * 3) % im.width
                strip = Image.new('RGBA', (1920, im.height))
                x = -shift
                while x < 1920:
                    strip.paste(im, (x, 0))
                    x += im.width
                view.alpha_composite(strip, (0, 1080 - im.height))
            views.append(view.convert('RGB'))
        for i, v in enumerate(views):
            v.save(f'{out}/prison-{sx}-{"novo" if i == len(views) - 1 else "antes"}.png')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    if want('prison-far'):
        save(prison_far(np.random.default_rng(71)), 'prison-far')
    if want('prison-mid'):
        save(prison_mid(np.random.default_rng(72)), 'prison-mid')
    if PREVIEW:
        preview(PREVIEW, next((a[6:] for a in sys.argv if a.startswith('--old=')), None))

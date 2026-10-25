"""Fundos da Prisão Subterrânea no traço liso (como os da cidade: 2 pixels da imagem por pixel do
mundo, hd.json, filtro suave atrás do terreno em pixel art).

Camadas (tamanho no mundo; as imagens têm o dobro):
  prison-far  1024x400  a parede do fundo do salão: três andares de celas com passarelas e grades,
                        pilares, correntes penduradas da abóbada e névoa fria (repete)
  prison-mid  1024x420  arcos de tijolo mais perto, tochas nos pilares, correntes com gancho e uma
                        gaiola pendurada (repete)

As duas dão a volta na horizontal (o que passa da borda direita aparece na esquerda).

uso: python3 fundos_prisao.py <pasta_saida> [camada ...] [--preview=<pasta>]
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from brush import Layer, hexc, mix, sstep, value_noise
from shapes import Mask
from fundos_cidade import grid, pnoise, edge, Wrap

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else 'hd'
ONLY = set(ARGS[1:])
PREVIEW = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
T0 = time.time()

INK = hexc(0x040506)
ST0, ST1, ST2, ST3 = hexc(0x0b0e10), hexc(0x141a1c), hexc(0x1f2729), hexc(0x2e383a)
FOG = hexc(0x2a3638)
WARM0, WARM1, WARM2 = hexc(0xb4501c), hexc(0xff9a44), hexc(0xffd890)


def want(name):
    return not ONLY or name in ONLY


def arch_top(xx, yy, cx, w, spring):
    """Alfa de um vão com arco redondo em cima (meio círculo de largura w nascendo em spring)."""
    r = w / 2
    body = np.maximum(np.abs(xx - cx) - r, spring - yy)
    arch = np.hypot(xx - cx, yy - spring) - r
    d = np.where(yy < spring, arch, body)
    return np.clip(0.5 - d, 0, 1)


def chain_mask(m, x, y0, y1, w=2.2):
    """Corrente pendurada: elos em pé e deitados, um embaixo do outro."""
    k = 0
    y = y0
    while y < y1:
        if k % 2:
            m.ellipse(x, y + 4, w * 0.55, 4.4)
        else:
            m.ellipse(x, y + 4, w * 1.2, 4.0)
            m.ellipse(x, y + 4, w * 0.4, 2.2, v=0)
        y += 7.2
        k += 1
    return y


def hook_mask(m, x, y, s=1.0):
    m.line([(x, y), (x, y + 9 * s)], 2.6 * s)
    m.line([(x, y + 9 * s), (x + 3 * s, y + 13 * s), (x + 7 * s, y + 12 * s), (x + 8 * s, y + 7 * s)], 2.4 * s)
    m.line([(x + 8 * s, y + 7 * s), (x + 6 * s, y + 5 * s)], 2.0 * s)


# ======================================================================================
# A parede do fundo: as galerias de celas
# ======================================================================================
def prison_far(rng):
    TW, H = 2048, 800
    yy, xx = grid(TW, H)
    floor = 640
    t = yy / H
    col = mix(hexc(0x050607), ST1, sstep(0.0, 0.55, t)[..., None])
    col = mix(col, ST0, sstep(0.7, 1.0, t)[..., None])
    tex = pnoise(H, TW, 20, rng, 3)
    col = col * (0.9 + 0.2 * tex)[..., None]
    courses = (np.abs((yy % 22.0) - 11.0) > 10.2).astype(np.float32)
    col = mix(col, col * 0.72, (courses * 0.35)[..., None])
    # três andares de celas: o vão escuro com grades e a passarela embaixo
    tiers = [(120, 250), (300, 430), (480, 610)]
    pitch = 128
    cell_a = np.zeros((H, TW), np.float32)
    inner = np.zeros((H, TW, 3), np.float32)
    glow = np.zeros((H, TW), np.float32)
    lit_cells = set(int(v) for v in rng.choice(np.arange(3 * (TW // pitch)), 6, replace=False))
    for ti, (top, bot) in enumerate(tiers):
        for i in range(TW // pitch):
            cx = i * pitch + pitch / 2 + (ti % 2) * pitch / 2
            for off in (0, -TW, TW):
                x = cx + off
                if x < -pitch or x > TW + pitch:
                    continue
                a = arch_top(xx, yy, x, 64, top + 32) * (yy < bot)
                cell_a = np.maximum(cell_a, a)
                lit = (ti * (TW // pitch) + i) in lit_cells
                if lit:
                    g = np.exp(-((xx - x) / 22) ** 2 - ((yy - (bot - 34)) / 30) ** 2)
                    glow = np.maximum(glow, g * a)
    inner = mix(np.broadcast_to(hexc(0x030405), (H, TW, 3)), WARM0 * 0.8, (glow * 0.7)[..., None])
    # as grades dos vãos (barras em pé e a travessa)
    bars = sstep(1.6, 0.6, np.abs(((xx + 5) % 10.0) - 5.0))
    cross = np.zeros((H, TW), np.float32)
    for top, bot in tiers:
        cross = np.maximum(cross, sstep(1.6, 0.6, np.abs(yy - (top + 76))))
    grate = np.maximum(bars, cross) * cell_a
    inner = mix(inner, hexc(0x1d2427), (grate * 0.85)[..., None])
    inner = mix(inner, hexc(0x3a4246), (grate * sstep(0.6, 0.9, tex) * 0.4)[..., None])
    col = mix(col, inner, cell_a[..., None])
    # passarelas de pedra com o parapeito de ferro
    for top, bot in tiers:
        walk = np.clip(np.minimum(yy - bot + 0.5, bot + 16 + 0.5 - yy), 0, 1)
        wc = mix(ST3, ST2, sstep(bot, bot + 16, yy)[..., None])
        wc = mix(wc, hexc(0x55636a), (sstep(bot + 2.5, bot, yy) * 0.6)[..., None])
        col = mix(col, wc, walk[..., None])
        rail = sstep(1.4, 0.4, np.abs(yy - (bot - 26))) + (sstep(1.2, 0.3, np.abs(((xx + 16) % 32.0) - 16.0)) * (yy > bot - 26) * (yy < bot))
        col = mix(col, hexc(0x0a0d0f), (np.clip(rail, 0, 1) * 0.9)[..., None])
        # sombra embaixo da passarela
        col = mix(col, col * 0.45, (sstep(bot + 16, bot + 40, yy) * sstep(bot + 70, bot + 40, yy) * 0.6)[..., None])
    # pilares grossos a cada 512, com luz fria na esquerda
    for i in range(TW // 512 + 1):
        for off in (0, TW, -TW):
            x = i * 512 + off
            if x < -80 or x > TW + 80:
                continue
            shaft = np.clip(34.5 - np.abs(xx - x), 0, 1)
            sh = mix(hexc(0x1a2224), hexc(0x0a0d0f), sstep(-30, 30, xx - x)[..., None])
            sh = mix(sh, hexc(0x4a5a60), (sstep(-24, -34, xx - x) * 0.55)[..., None])
            sh = sh * (0.85 + 0.3 * tex)[..., None]
            jn = (np.abs((yy % 28.0) - 14.0) > 13.0) * (np.abs(xx - x) < 34)
            sh = mix(sh, sh * 0.6, (jn * 0.6)[..., None])
            col = mix(col, sh, shaft[..., None])
    # correntes penduradas da abóbada
    m = Mask(TW, H)
    for k in range(14):
        x = rng.uniform(0, TW)
        y1 = rng.uniform(80, 360)
        yend = chain_mask(m, x, -10, y1, w=rng.uniform(1.8, 2.6))
        if rng.random() < 0.5:
            hook_mask(m, x, yend, 1.2)
    ch = m.array()
    col = mix(col, hexc(0x07090b), (ch * 0.95)[..., None])
    # tochas distantes nas passarelas
    torch = np.zeros((H, TW), np.float32)
    for k in range(7):
        tier = tiers[int(rng.integers(0, 3))]
        x = rng.uniform(0, TW)
        y = tier[1] - 38
        for off in (0, -TW, TW):
            torch = np.maximum(torch, np.exp(-(np.hypot((xx - x - off) / 46, (yy - y) / 52)) ** 2))
            col = mix(col, WARM2, (np.exp(-(np.hypot((xx - x - off) / 2.6, (yy - y) / 4.0)) ** 2) * 0.95)[..., None])
    col = mix(col, col + WARM0 * 0.35, (torch * 0.75)[..., None])
    # névoa fria nos andares de baixo
    fog = pnoise(H, TW, 90, rng, 2, sx=3.0)
    fa = sstep(380, 640, yy) * (0.25 + 0.5 * fog)
    col = mix(col, FOG, (fa * 0.35)[..., None])
    # embaixo some no escuro (quando a câmera sobe, isto aparece acima do chão de verdade)
    col = mix(col, hexc(0x060708), (sstep(floor - 50, floor + 150, yy) * 0.94)[..., None])
    return Layer.from_rgb(np.clip(col, 0, 1))


# ======================================================================================
# Mais perto: arcos de tijolo, tochas, correntes e a gaiola
# ======================================================================================
def bricks(ly, lx, rng, x0, course=16.0, wlen=34.0):
    """Tijolos: fiadas com a junta em pé desencontrada, tom de cada tijolo sorteado."""
    row = np.floor(ly / course)
    off = (row % 2) * wlen / 2
    colx = np.floor((lx + off) / wlen)
    key = (row.astype(np.int64) * 7919 + colx.astype(np.int64) + 100000) % 4096
    tones = (1 + 0.16 * rng.normal(0, 1, 4096)).astype(np.float32)
    warm = rng.random(4096).astype(np.float32)
    jy = np.abs((ly % course) - course / 2) > course / 2 - 1.3
    jx = np.abs(((lx + off) % wlen) - wlen / 2) > wlen / 2 - 1.3
    return tones[key], warm[key], (jy | jx).astype(np.float32)


def prison_mid(rng):
    TW, H = 2048, 840
    yy, xx = grid(TW, H)
    W = Wrap(TW, H)
    span = 512
    pw = 104
    floor = 660
    spring = 250
    for i in range(TW // span):
        cx = i * span
        x0 = int(cx - span / 2 - 10)
        LW = span + 20
        ly, lx = grid(LW, H, x0, 0)
        m = Mask(LW, H)
        X = lambda x: x - x0
        # pilar de tijolo, base larga e o arco que vai até o próximo pilar (dos dois lados)
        m.rect(X(cx - pw / 2), 0, X(cx + pw / 2), H)
        m.rect(X(cx - pw / 2 - 12), floor - 60, X(cx + pw / 2 + 12), H)
        a = m.array()
        # arcada: a parede de tijolo em cima, com o vão em meio círculo até o próximo pilar
        for side in (-1, 1):
            acx = cx + side * span / 2
            r_in = span / 2 - pw / 2
            d_in = np.hypot(lx - acx, ly - spring)
            wall = (d_in > r_in) & (ly < spring) & (np.abs(lx - acx) <= span / 2) & (np.sign(lx - cx) == side)
            a = np.maximum(a, np.clip(d_in - r_in + 0.5, 0, 1) * wall)
        tone, warmk, joint = bricks(ly, lx, rng, x0)
        k = lx - cx
        sh = np.clip(k / (pw / 2 + 12), -1, 1)
        base = mix(hexc(0x2a2624), hexc(0x100e0e), sstep(-0.7, 0.9, sh)[..., None])
        base = mix(base, hexc(0x3a2a20), (warmk * 0.4)[..., None])
        base = base * tone[..., None]
        base = mix(base, hexc(0x0a0909), (joint * 0.75)[..., None])
        tex = value_noise(H, LW, 14, rng, 3)
        base = base * (0.7 + 0.2 * tex)[..., None]
        lit = np.clip(edge(a, 0, -3) + edge(a, 0, -1), 0, 1)
        base = mix(base, base * 1.6, (lit * 0.4)[..., None])
        # a tocha do pilar esquenta o tijolo em volta
        ty = 360
        g = np.exp(-(np.hypot((lx - cx) / 70, (ly - ty) / 90)) ** 2)
        base = mix(base, base * 0.5 + WARM1 * 0.34, (g * 0.5)[..., None])
        W.put(x0, 0, np.clip(base, 0, 1), a)
        torch_wrap(W, cx, ty, rng)
    # correntes com gancho nos vãos e a gaiola num deles
    for i in range(TW // span):
        bx = i * span + span / 2
        for k in range(2):
            x = bx + rng.uniform(-150, 150)
            chain_wrap(W, x, 0, rng.uniform(160, 340), rng)
        if i == 1:
            cage_wrap(W, bx + 40, rng.uniform(220, 280), rng)
    W.put(0, 0, hexc(0x060708), sstep(floor - 80, floor + 160, yy) * 0.95)
    return W.L


def torch_wrap(W, x, y, rng):
    LW, LH = 220, 240
    L = Layer(LW, LH)
    X, Y = LW / 2, 120
    for r, a in ((100, 0.07), (56, 0.1), (26, 0.16)):
        L.dab(X, Y - 18, r, WARM0, a, r * 0.9)
    m = Mask(LW, LH)
    # suporte de ferro preso no pilar e o copo da tocha
    m.line([(X - 10, Y + 22), (X, Y + 6), (X, Y)], 3.2)
    m.poly([(X - 7, Y - 2), (X + 7, Y - 2), (X + 4, Y + 8), (X - 4, Y + 8)])
    L.fill(hexc(0x0b0a0a), m.array())
    # a chama
    f = Mask(LW, LH)
    f.poly([(X - 6, Y - 3), (X + 6, Y - 3), (X + 2.5, Y - 18), (X + 0.5, Y - 28), (X - 3, Y - 16)])
    L.fill(WARM1, f.array())
    f2 = Mask(LW, LH)
    f2.poly([(X - 3, Y - 3), (X + 3, Y - 3), (X + 1, Y - 13), (X - 1.5, Y - 10)])
    L.fill(WARM2, f2.array())
    W.put_layer(x - LW / 2, y - Y, L)


def chain_wrap(W, x, y0, y1, rng):
    LW, LH = 40, int(y1 + 40)
    L = Layer(LW, LH)
    m = Mask(LW, LH)
    yend = chain_mask(m, LW / 2, y0 - 8, y1, w=2.6)
    if rng.random() < 0.6:
        hook_mask(m, LW / 2, yend, 1.4)
    L.fill(hexc(0x08090b), m.array())
    W.put_layer(x - LW / 2, 0, L)


def cage_wrap(W, x, y, rng):
    """Gaiola pendurada no vão: corrente, domo, barras e o fundo."""
    LW, LH = 120, int(y + 130)
    L = Layer(LW, LH)
    X = LW / 2
    m = Mask(LW, LH)
    chain_mask(m, X, -8, y, w=2.6)
    m.ellipse(X, y + 4, 6, 6)
    m.ellipse(X, y + 4, 3.4, 3.4, v=0)
    a_ring = m.array()
    cage = Mask(LW, LH)
    cage.poly([(X - 40, y + 40), (X - 30, y + 18), (X, y + 10), (X + 30, y + 18), (X + 40, y + 40), (X + 40, y + 48), (X - 40, y + 48)])
    for k in range(7):
        bx = X - 36 + k * 12
        cage.rect(bx - 1.6, y + 40, bx + 1.6, y + 116)
    cage.rect(X - 42, y + 110, X + 42, y + 120)
    cage.rect(X - 40, y + 76, X + 40, y + 80)
    a = np.clip(cage.array() + a_ring, 0, 1)
    L.fill(hexc(0x0a0b0d), a)
    # borda de luz quente de um lado (a tocha mais perto)
    lit = np.clip(edge(a, 2, 0), 0, 1)
    L.fill(hexc(0x4a3022), lit * 0.6)
    W.put_layer(x - LW / 2, 0, L)


# ======================================================================================
def save(L, name):
    img = L.image()
    img.save(f'{OUT}/{name}.png', optimize=True)
    print(name, img.size, round(time.time() - T0, 1), 's', flush=True)
    return img


def preview(out):
    """Vista do jogo (640x360 em 2x) com as duas camadas na posição de quem está no chão."""
    os.makedirs(out, exist_ok=True)
    for sx in (0, 700):
        view = Image.new('RGBA', (1280, 720), (8, 7, 11, 255))
        for n, fac in (('prison-far', 0.12), ('prison-mid', 0.35)):
            p = f'{OUT}/{n}.png'
            if not os.path.exists(p):
                continue
            im = Image.open(p).convert('RGBA')
            shift = int(sx * fac * 2) % im.width
            strip = Image.new('RGBA', (1280, im.height))
            x = -shift
            while x < 1280:
                strip.paste(im, (x, 0))
                x += im.width
            view.alpha_composite(strip, (0, 720 - im.height))
        view.convert('RGB').save(f'{out}/prison-{sx}.png')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    if want('prison-far'):
        save(prison_far(np.random.default_rng(71)), 'prison-far')
    if want('prison-mid'):
        save(prison_mid(np.random.default_rng(72)), 'prison-mid')
    if PREVIEW:
        preview(PREVIEW)

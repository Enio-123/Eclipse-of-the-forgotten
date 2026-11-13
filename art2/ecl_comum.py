"""Peças comuns dos fundos do ECLIPSE (ecl_*.py): a tela que dá a volta na horizontal, correntes, chamas,
o salvar e a vista de conferência (as camadas na posição do jogo, com a versão do EXTREME ao lado).

Os pintores recebem: <pasta_saida> [camada ...] [--preview=<pasta>] [--old=<pasta com os png em 2x>]
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from brush import hexc, mix, sstep
from shapes import Mask
from pedra3 import grid

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else 'hd_eclipse_fundos'
ONLY = set(ARGS[1:])
PREVIEW = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
OLD = next((a[6:] for a in sys.argv if a.startswith('--old=')), None)
T0 = time.time()

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

    def add(self, rows, cols, col, k):
        """Soma luz (não mexe no alfa): halos e brilhos por cima do que já está pintado."""
        if rows.stop <= rows.start:
            return
        tmpc = self.col[rows]
        tmpc[:, cols] = tmpc[:, cols] + np.asarray(col, np.float32) * k[..., None]
        self.col[rows] = tmpc

    def image(self):
        out = np.dstack([np.clip(self.col, 0, 1), np.clip(self.a, 0, 1)[..., None]])
        return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def put_win(arr, rows, cols, val, how='set'):
    """Escreve uma janela (rows, cols que dão a volta) num campo inteiro: set, max, min ou mul."""
    tmp = arr[rows]
    cur = tmp[:, cols]
    if how == 'max':
        val = np.maximum(cur, val)
    elif how == 'min':
        val = np.minimum(cur, val)
    elif how == 'mul':
        val = cur * val
    tmp[:, cols] = val
    arr[rows] = tmp


def chain(cv, x, y0, y1, w=3.6, hook=False, hi=IRON_HI, hi_k=0.5, warm=None, iron=IRON):
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
    col = np.broadcast_to(iron, a.shape + (3,)).copy()
    # brilho do ferro na beira esquerda de cada elo
    left = np.clip(a - np.roll(a, 1, axis=1), 0, 1)
    col = mix(col, hi, (left * hi_k)[..., None])
    if warm is not None:
        right = np.clip(a - np.roll(a, -1, axis=1), 0, 1)
        col = mix(col, warm, (right * 0.55)[..., None])
    cv.over(rows, cols, col, a * 0.97)


def flame(cv, x, y, s=1.0, rng=None, halo=1.0, air=False):
    """Chama: o corpo laranja, o miolo claro e o halo em volta (x, y = a base da chama). air: a chama
    fica na frente de um vão (o halo some antes da beira da janela, sem deixar um quadrado no ar)."""
    LW, LH = int(240 * s), int(260 * s)
    rows, cols, ly, lx = cv.win(x - LW / 2, y - LH * 0.72, LW, LH)
    if rows.stop <= rows.start:
        return
    dx, dy = lx - x, ly - y
    edge = 1.0
    if air:
        edge = np.clip(1 - (np.hypot(dx, dy + 22 * s) / (LW * 0.47)) ** 2, 0, 1) ** 2
    for r, k in ((110 * s, 0.07), (62 * s, 0.1), (30 * s, 0.18)):
        g = np.exp(-(np.hypot(dx, (dy + 22 * s) * 0.9) / r) ** 2) * edge
        cv.over(rows, cols, WARM0, g * k * halo)
    # o corpo: uma gota torta que afina para cima
    t = np.clip(-dy / (40 * s), 0, 1)
    wob = np.sin(t * 5.0 + 0.6) * 2.2 * s * t
    half = (8.5 * s) * (1 - t) ** 0.75 * sstep(-0.12, 0.1, t)
    body = np.clip(half - np.abs(dx - wob) + 0.6, 0, 1) * (dy < 3 * s) * (dy > -40 * s)
    cv.over(rows, cols, mix(WARM1, WARM0, t[..., None] * 0.7), body * 0.95)
    t2 = np.clip(-dy / (24 * s), 0, 1)
    core = np.clip((5.0 * s) * (1 - t2) ** 0.8 * sstep(-0.1, 0.12, t2) - np.abs(dx - wob * 0.5) + 0.5, 0, 1) * (dy < 2 * s) * (dy > -24 * s)
    cv.over(rows, cols, WARM2, core * 0.95)


def save(cv, name, opaque=None):
    """Grava a camada; as de fundo (nome terminado em far ou sky, ou opaque=True) sem alfa."""
    img = cv.image()
    if opaque if opaque is not None else name.endswith(('far', 'sky')):
        img = img.convert('RGB')
    os.makedirs(OUT, exist_ok=True)
    img.save(f'{OUT}/{name}.png')
    print(name, img.size, round(time.time() - T0, 1), 's', flush=True)
    return img


def preview(out, tag, layers, shifts=(0, 700), bg=(8, 7, 11)):
    """Vista do jogo (640x360 no mundo, 3 px por px) com as camadas na posição de quem está no chão; com
    --old, a mesma vista com os fundos 2x do EXTREME ampliados (arquivos <tag>-<rolagem>-antes/novo.png).
    layers: (nome, fator de rolagem), do fundo para a frente; cada uma encosta no pé da tela."""
    os.makedirs(out, exist_ok=True)
    for sx in shifts:
        views = []
        for src, k in ((OLD, 2), (OUT, 3)):
            if not src:
                continue
            view = Image.new('RGBA', (1920, 1080), bg + (255,))
            for n, fac in layers:
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
            v.save(f'{out}/{tag}-{sx}-{"novo" if i == len(views) - 1 else "antes"}.png')

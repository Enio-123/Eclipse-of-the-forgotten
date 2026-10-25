"""Repinta os enfeites (pixel art de arte/deco.py) no estilo dos cenários: a forma do sprite é
mantida (para continuar encaixando no mapa), mas a cor ganha a luz do lugar (céu frio e
contraluz dourada na ponte, velas nas catacumbas, sol no vale), pinceladas e bordas suaves.
As partes que brilham (vidro do lampião, chamas, espelho) ficam como estão.

uso: python3 decos.py [pasta_saida]   (lê game/public/assets/deco-*.png originais de arte/)
Sai <pasta>/deco-*.png em 1x, para finaliza.py aplicar a paleta do tema.
"""
import math
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from brush import Layer, hexc, mix, sstep, blur, value_noise, paint

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'decos-originais')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'hd', 'decos')
SC = 3  # pinta em 3x
BIG = 1e6

LIGHT = {
    'bridge': dict(top=hexc(0x8a9cc0), top_a=0.42, rim=hexc(0xe7a957), rim_a=0.55, rim_side='right',
                   shadow=hexc(0x0d111b), dark=0.62, cold=hexc(0x6f80a6)),
    'catacomb': dict(top=hexc(0x8c8068), top_a=0.25, rim=hexc(0xffb04a), rim_a=0.4, rim_side='left',
                     shadow=hexc(0x07080d), dark=0.62, cold=hexc(0x4a5468)),
    'memory': dict(top=hexc(0xfff4d0), top_a=0.38, rim=hexc(0xfff0c0), rim_a=0.3, rim_side='left',
                   shadow=hexc(0x2c4a48), dark=0.95, cold=hexc(0x7fa6b8)),
}

# nome: (tema, direção das pinceladas, quadros (largura) ou 0, repete na vertical)
DECOS = {
    'deco-balustrade': ('bridge', 'v', 0, False),
    'deco-balustrade-broken': ('bridge', 'v', 0, False),
    'deco-lamp': ('bridge', 'v', 0, False),
    'deco-lamp-off': ('bridge', 'v', 0, False),
    'deco-statue': ('bridge', 'v', 0, False),
    'deco-scaffold': ('bridge', 'h', 0, False),
    'deco-gate': ('bridge', 'v', 0, False),
    'deco-bracket': ('bridge', 'h', 0, False),
    'deco-post': ('bridge', 'v', 0, True),
    'deco-chain': ('bridge', 'v', 0, True),
    'deco-anchor': ('bridge', 'h', 0, False),
    'deco-tufts-bridge': ('bridge', 'v', 12, False),
    'deco-moss': ('bridge', 'v', 4, False),
    'deco-candles': ('catacomb', 'v', 16, False),
    'deco-tufts-catacomb': ('catacomb', 'v', 12, False),
    'deco-shrine': ('catacomb', 'v', 0, False),
    'deco-pedestal': ('catacomb', 'v', 0, False),
    'deco-portcullis': ('catacomb', 'v', 0, False),
    'deco-tufts-memory': ('memory', 'v', 12, False),
    # as árvores do vale saem de arvores_deco.py
}


def dirs(M):
    H, W = M.shape
    yy = np.broadcast_to(np.arange(H, dtype=np.float32)[:, None], (H, W))
    xx = np.broadcast_to(np.arange(W, dtype=np.float32)[None, :], (H, W))
    dtop = yy - np.maximum.accumulate(np.where(~M, yy, -BIG), axis=0)
    dbot = np.minimum.accumulate(np.where(~M, yy, BIG)[::-1], axis=0)[::-1] - yy
    dleft = xx - np.maximum.accumulate(np.where(~M, xx, -BIG), axis=1)
    dright = np.minimum.accumulate(np.where(~M, xx, BIG)[:, ::-1], axis=1)[:, ::-1] - xx
    return [np.minimum(v, 60).astype(np.float32) for v in (dtop, dbot, dleft, dright)]


def relight(img, theme, flow_kind, rng):
    cfg = LIGHT[theme]
    arr = np.asarray(img.convert('RGBA'), np.float32) / 255
    h, w = arr.shape[:2]
    P = 4  # margem para as pinceladas não baterem na borda
    arr = np.pad(arr, ((P, P), (P, P), (0, 0)))
    big = np.asarray(Image.fromarray((arr * 255).astype(np.uint8), 'RGBA').resize(((w + 2 * P) * SC, (h + 2 * P) * SC), Image.NEAREST), np.float32) / 255
    a0 = big[..., 3]
    A = sstep(0.3, 0.7, blur(a0, 0.45 * SC))
    rgb = big[..., :3]
    # cor de referência sem os degraus do pixel, puxando a cor para dentro da borda
    wsum = blur(a0, 0.6 * SC) + 1e-4
    ref = np.stack([blur(rgb[..., i] * a0, 0.6 * SC) for i in range(3)], -1) / wsum[..., None]
    lum = ref @ np.array([0.3, 0.55, 0.15], np.float32)
    warm = ref[..., 0] - ref[..., 2]
    emis = sstep(0.55, 0.75, lum) * sstep(0.12, 0.3, warm)
    if theme == 'catacomb':
        emis = np.maximum(emis, sstep(0.7, 0.85, lum))  # espelho e velas
    M = A > 0.5
    dtop, dbot, dleft, dright = dirs(M)
    col = mix(cfg['shadow'], ref, cfg['dark'])
    col = mix(col, col + cfg['top'] * 0.6, (np.exp(-dtop / (1.6 * SC)) * cfg['top_a'])[..., None])
    side = dright if cfg['rim_side'] == 'right' else dleft
    other = dleft if cfg['rim_side'] == 'right' else dright
    # partes finas (fios, hastes) recebem menos contraluz, senão ficam claras por inteiro
    thick = 0.25 + 0.75 * sstep(2.0 * SC, 5.0 * SC, dleft + dright)
    col = mix(col, cfg['rim'], (np.exp(-side / (0.9 * SC)) * cfg['rim_a'] * thick)[..., None])
    col = mix(col, cfg['cold'], (np.exp(-other / (0.9 * SC)) * 0.16 * thick)[..., None])
    col *= (1 - 0.32 * np.exp(-dbot / (2.2 * SC)))[..., None]
    if theme == 'memory':
        yy = np.arange(col.shape[0], dtype=np.float32)[:, None] / col.shape[0]
        col = mix(col, col * 0.78 + cfg['shadow'] * 0.22, sstep(0.4, 1.0, np.broadcast_to(yy, A.shape))[..., None] * 0.6)
    col = mix(col, ref * 1.08, emis[..., None])
    col = np.clip(col, 0, 1)
    H, W = A.shape
    if flow_kind == 'v':
        flow = np.full((H, W), math.pi / 2, np.float32)
    elif flow_kind == 'h':
        flow = np.zeros((H, W), np.float32)
    else:  # copas: pinceladas girando
        flow = (value_noise(H, W, 6 * SC, rng, 2) - 0.5) * 3.0
    flow = flow + (value_noise(H, W, 5 * SC, rng, 1) - 0.5) * 0.4
    L = Layer(W, H)
    L.fill(col, A)
    passes = [
        dict(size=2.2 * SC, spacing=0.9, length=(1.4, 3.0), err=0.0, alpha=0.55, bristle=0.5, dry=0.35, blur=0.15, taper=0.4, ang_jitter=0.15),
        dict(size=1.1 * SC, spacing=1.0, length=(1.4, 2.8), err=0.0, alpha=0.6, bristle=0.4, dry=0.3, blur=0.08, taper=0.45, ang_jitter=0.2),
    ]
    paint(L, col, A * (1 - emis * 0.8), flow, rng, passes, val_jitter=0.08, jitter=0.012, clip_soft=0, base=0.0)
    L.multiply_alpha(A > -1)
    out = L.image()
    # volta para 1x: média ponderada pelo alfa
    o = np.asarray(out, np.float32) / 255
    oa = o[..., 3]
    hh, ww = h + 2 * P, w + 2 * P
    pm = (o[..., :3] * oa[..., None]).reshape(hh, SC, ww, SC, 3).mean((1, 3))
    am = oa.reshape(hh, SC, ww, SC).mean((1, 3))
    rgb1 = pm / np.maximum(am[..., None], 1e-4)
    res = np.dstack([np.clip(rgb1, 0, 1), np.clip(am, 0, 1)])[P:-P, P:-P]
    # o alfa não cresce além do sprite original (mantém o encaixe no mapa)
    res[..., 3] = np.minimum(res[..., 3], ndi.maximum_filter(arr[P:-P, P:-P, 3], 3))
    return Image.fromarray((res * 255 + 0.5).astype(np.uint8), 'RGBA')


def process(name, theme, flow, frame_w, vtile, rng):
    img = Image.open(os.path.join(SRC, name + '.png')).convert('RGBA')
    w, h = img.size
    if vtile:
        stack = Image.new('RGBA', (w, h * 3))
        for i in range(3):
            stack.paste(img, (0, i * h))
        out = relight(stack, theme, flow, rng).crop((0, h, w, 2 * h))
        # mantém o alfa exato para emendar sem frestas
        out.putalpha(img.getchannel('A'))
        return out
    if frame_w:
        res = Image.new('RGBA', (w, h))
        for fx in range(0, w, frame_w):
            fr = img.crop((fx, 0, fx + frame_w, h))
            res.paste(relight(fr, theme, flow, rng), (fx, 0))
        return res
    return relight(img, theme, flow, rng)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    rng = np.random.default_rng(13)
    only = sys.argv[2:]
    for name, (theme, flow, fw, vt) in DECOS.items():
        if only and name not in only:
            continue
        out = process(name, theme, flow, fw, vt, rng)
        out.save(os.path.join(OUT, name + '.png'))
        print(name, out.size)

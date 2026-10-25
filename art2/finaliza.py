"""Etapa final dos cenários: reduz as pinturas 2x para os pixels do jogo com uma paleta única por
tema (o fundo, o terreno e os enfeites saem com as mesmas cores) e grava em game/public/assets.

uso: python3 finaliza.py <tema> [pasta_hd] [cores]
"""
import os
import sys
import numpy as np
from PIL import Image
from brush import hexc

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'game', 'public', 'assets')

GOLD = [hexc(0xb4702e), hexc(0xe7ad55), hexc(0xfff0c8)]
WIN = [hexc(0xd9772e), hexc(0xffc46e)]

# tipo de cada camada: 'opaque' (sem transparência), 'soft' (alfa suave em 16 níveis) ou
# 'exact' (já está em 1x com o alfa certo, como o terreno, que segue a física)
THEMES = {
    'bridge': dict(
        layers={
            'bridge-sky': 'opaque', 'bridge-far': 'soft', 'bridge-far-rim': 'soft', 'clouds-far': 'soft',
            'clouds-near': 'soft', 'bridge-mid': 'soft', 'bridge-mid-rim': 'soft', 'bridge-fg': 'soft',
            'terreno-ponte': 'exact',
            'title-sky': 'opaque', 'title-land': 'soft', 'title-rim': 'soft',
            **{f'decos/{n}': 'soft1x' for n in [
                'deco-balustrade', 'deco-balustrade-broken', 'deco-lamp', 'deco-lamp-off', 'deco-statue', 'deco-scaffold',
                'deco-gate', 'deco-bracket', 'deco-post', 'deco-chain', 'deco-anchor', 'deco-tufts-bridge', 'deco-moss']},
        },
        rename={'terreno-ponte': 'terrain-ponte'},
        accents=GOLD + WIN + [hexc(0xb7c6de), hexc(0x05070c)],
        colors=96,
    ),
    'catacomb': dict(
        layers={
            'cat-far': 'opaque', 'cat-mid': 'soft', 'terreno-catacumbas': 'exact', 'terreno-sinos': 'exact', 'terreno-cripta': 'exact',
            **{f'decos/{n}': 'soft1x' for n in ['deco-candles', 'deco-tufts-catacomb', 'deco-shrine', 'deco-pedestal', 'deco-portcullis']},
        },
        rename={'terreno-catacumbas': 'terrain-catacumbas', 'terreno-sinos': 'terrain-sinos', 'terreno-cripta': 'terrain-cripta'},
        accents=[hexc(0xffa64e), hexc(0xffd08a), hexc(0x040509), hexc(0x6e665a)],
        colors=80,
    ),
    'forest': dict(
        layers={'intro-back': 'opaque', 'intro-near': 'soft', 'intro-fore': 'soft', 'intro-beams': 'soft'},
        accents=[hexc(0x2e0a0c), hexc(0x5e1517), hexc(0x8a231e), hexc(0xb2382b), hexc(0x3b2219), hexc(0x66412f), hexc(0xd9e4c8)],
        colors=64,
    ),
    'memory': dict(
        layers={
            'mem-sky': 'opaque', 'mem-far': 'soft', 'mem-mid': 'soft', 'terreno-memoria': 'exact',
            **{f'decos/{n}': 'soft1x' for n in ['deco-tree-big', 'deco-tree-green', 'deco-tree-pink', 'deco-tufts-memory']},
        },
        rename={'terreno-memoria': 'terrain-memoria'},
        accents=[hexc(0xfff1c8), hexc(0xdcf290), hexc(0xf2a7c3), hexc(0x5e8fcb), hexc(0x9dbde0), hexc(0xf1e8d6), hexc(0xfff8ec)],
        colors=128,
        # o céu claro tem degradês longos: paleta própria, senão as nuvens viram manchas cinzentas
        own={'mem-sky': 72},
    ),
}


def reduce(im, size):
    """Média ponderada pelo alfa (a borda não escurece) e alfa pela média simples."""
    arr = np.asarray(im, np.float32) / 255
    a = arr[..., 3]
    w, h = size
    H, W = a.shape
    fy, fx = H // h, W // w
    arr = arr[:h * fy, :w * fx]
    a = a[:h * fy, :w * fx]
    pm = (arr[..., :3] * a[..., None]).reshape(h, fy, w, fx, 3).mean((1, 3))
    am = a.reshape(h, fy, w, fx).mean((1, 3))
    rgb = pm / np.maximum(am[..., None], 1e-4)
    return np.clip(rgb, 0, 1), am


def palette(samples, colors, accents):
    pix = np.concatenate(samples, 0)
    n = len(pix)
    side = int(np.ceil(np.sqrt(n)))
    sheet = np.zeros((side * side, 3), np.uint8)
    sheet[:n] = (pix * 255 + 0.5).astype(np.uint8)
    sheet[n:] = sheet[0]
    img = Image.fromarray(sheet.reshape(side, side, 3), 'RGB')
    auto = img.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = list(auto.getpalette()[:colors * 3])
    for c in accents:
        pal += [int(round(float(v) * 255)) for v in c]
    k = len(pal) // 3
    pal += pal[:3] * (256 - k)
    p = Image.new('P', (1, 1))
    p.putpalette(pal)
    return p, k


def quantize(rgb, pal):
    img = Image.fromarray((rgb * 255 + 0.5).astype(np.uint8), 'RGB')
    return np.asarray(img.quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB'))


def main():
    theme = sys.argv[1]
    hd = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'hd')
    cfg = THEMES[theme]
    colors = int(sys.argv[3]) if len(sys.argv) > 3 else cfg['colors']
    reduced = {}
    samples = []
    rng = np.random.default_rng(0)
    for name, kind in cfg['layers'].items():
        path = os.path.join(hd, name + '.png')
        if not os.path.exists(path):
            print('falta', name)
            continue
        im = Image.open(path).convert('RGBA')
        if kind in ('exact', 'soft1x'):
            arr = np.asarray(im, np.float32) / 255
            rgb, am = arr[..., :3], arr[..., 3]
        else:
            rgb, am = reduce(im, (im.width // 2, im.height // 2))
        reduced[name] = (rgb, am, kind)
        if name in cfg.get('own', {}):
            continue
        sel = am > 0.25
        pix = rgb[sel]
        if kind == 'soft1x':
            pix = np.repeat(pix, 4, 0)  # enfeites são pequenos: pesam um pouco mais na paleta
        if len(pix) > 400000:
            pix = pix[rng.choice(len(pix), 400000, replace=False)]
        samples.append(pix)
    pal, k = palette(samples, colors, cfg['accents'])
    print('paleta', k, 'cores')
    for name, (rgb, am, kind) in reduced.items():
        if name in cfg.get('own', {}):
            own, _ = palette([rgb[am > 0.25]], cfg['own'][name], cfg['accents'])
            q = quantize(rgb, own)
        else:
            q = quantize(rgb, pal)
        if kind == 'opaque':
            alpha = np.full(am.shape, 255, np.uint8)
        elif kind == 'exact':
            alpha = (am > 0.5).astype(np.uint8) * 255
        else:
            alpha = (np.round(np.clip(am, 0, 1) * 15) / 15 * 255 + 0.5).astype(np.uint8)
        out = Image.fromarray(np.dstack([q, alpha]), 'RGBA')
        dst = cfg.get('rename', {}).get(name, os.path.basename(name))
        out.save(os.path.join(ASSETS, dst + '.png'), optimize=True)
        print(dst, out.size)


if __name__ == '__main__':
    main()

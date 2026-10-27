"""Etapa final dos cenários: reduz as pinturas 2x para os pixels do jogo com uma paleta única por
tema (o fundo, o terreno e os enfeites saem com as mesmas cores) e grava em game/public/assets.

uso: python3 finaliza.py <tema> [pasta_hd] [cores] [--keep=camada,camada]
--keep refaz só as camadas pedidas, com as cores que as imagens já prontas do tema usam (o que
já foi aprovado fica igual, byte por byte).
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
FOREST = ['encosta', 'pinhal', 'lago', 'mata', 'cabana', 'serra', 'clareira']
VALE = ['descida', 'prado', 'riacho', 'cachoeiras', 'gruta', 'prainha', 'rio', 'cais']

# tipo de cada camada: 'opaque' (sem transparência), 'soft' (alfa suave em 16 níveis), 'exact'
# (já está em 1x com o alfa certo, como o terreno, que segue a física) ou 'veil' (já em 1x, alfa
# suave: a pedra que cobre as passagens secretas e some aos poucos em volta delas)
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
            'terreno-escadaria': 'exact', 'terreno-nichos': 'exact',
            **{f'decos/{n}': 'soft1x' for n in ['deco-candles', 'deco-tufts-catacomb', 'deco-shrine', 'deco-pedestal', 'deco-portcullis']},
        },
        rename={'terreno-catacumbas': 'terrain-catacumbas', 'terreno-sinos': 'terrain-sinos', 'terreno-cripta': 'terrain-cripta',
                'terreno-escadaria': 'terrain-escadaria', 'terreno-nichos': 'terrain-nichos'},
        accents=[hexc(0xffa64e), hexc(0xffd08a), hexc(0x040509), hexc(0x6e665a)],
        colors=80,
    ),
    # Cidade-Catedral: só o terreno sai em pixel (os fundos e os enfeites são no traço liso)
    'city': dict(
        layers={
            'terreno-praca': 'exact', 'terreno-rua': 'exact', 'terreno-telhados': 'exact', 'terreno-claustro': 'exact',
            'terreno-rua-secret': 'veil', 'terreno-telhados-secret': 'veil', 'terreno-claustro-secret': 'veil',
            'terreno-mercado': 'exact', 'terreno-mercado-secret': 'veil',
        },
        rename={n: n.replace('terreno', 'terrain') for n in [
            'terreno-praca', 'terreno-rua', 'terreno-telhados', 'terreno-claustro', 'terreno-rua-secret', 'terreno-telhados-secret',
            'terreno-claustro-secret', 'terreno-mercado', 'terreno-mercado-secret']},
        accents=GOLD + WIN + [hexc(0xc8652a), hexc(0xffe4a8), hexc(0xc3cee0), hexc(0x8a9ac0), hexc(0x06070c)],
        colors=96,
    ),
    'nave': dict(
        layers={
            'terreno-nave': 'exact', 'terreno-galeria': 'exact', 'terreno-altar': 'exact',
            'terreno-nave-secret': 'veil', 'terreno-galeria-secret': 'veil',
        },
        rename={n: n.replace('terreno', 'terrain') for n in [
            'terreno-nave', 'terreno-galeria', 'terreno-altar', 'terreno-nave-secret', 'terreno-galeria-secret']},
        accents=[hexc(0xd9a54e), hexc(0xffa64e), hexc(0xd8dce8), hexc(0x9e989b), hexc(0x34303b), hexc(0x05060b),
                 hexc(0x2a4e9a), hexc(0x9c2a2c), hexc(0xc99a3a), hexc(0x2f7a4a), hexc(0x5a3a8a)],
        colors=96,
    ),
    # Prisão Subterrânea: só o terreno sai em pixel (os fundos e os objetos são no traço liso)
    'prison': dict(
        layers={
            'terreno-poco': 'exact', 'terreno-solitarias': 'exact', 'terreno-celas': 'exact', 'terreno-correntes': 'exact', 'terreno-guarita': 'exact',
            'terreno-fuga': 'exact', 'terreno-arena': 'exact', 'terreno-mascara': 'exact', 'terreno-celas-secret': 'veil',
        },
        rename={n: n.replace('terreno', 'terrain') for n in [
            'terreno-poco', 'terreno-solitarias', 'terreno-celas', 'terreno-correntes', 'terreno-guarita', 'terreno-fuga', 'terreno-arena', 'terreno-mascara',
            'terreno-celas-secret']},
        accents=[hexc(0xff9a44), hexc(0xffd890), hexc(0xff7a2a), hexc(0x9aa6ba), hexc(0xb4c4c8), hexc(0x5e3522), hexc(0x3a5234),
                 hexc(0x050607)],
        colors=96,
    ),
    # Fosso dos Esquecidos e Leito do Abismo: a pedra da prisão tingida de tinta (paleta própria, roxa)
    'abyss': dict(
        layers={'terreno-fosso': 'exact', 'terreno-margem': 'exact', 'terreno-abismo': 'exact'},
        rename={'terreno-fosso': 'terrain-fosso', 'terreno-margem': 'terrain-margem', 'terreno-abismo': 'terrain-abismo'},
        accents=[hexc(0xd8b7ff), hexc(0x7029b8), hexc(0xb52a9b), hexc(0xc7b2ea), hexc(0xff9a44), hexc(0xffd890), hexc(0x55307e),
                 hexc(0x050408)],
        colors=96,
    ),
    # Minas Abandonadas: rocha em camadas e os veios de Âmbar (só o terreno sai em pixel)
    'mine': dict(
        layers={f'terreno-{n}': 'exact' for n in ['boca', 'trilhos', 'alagada', 'prensas', 'veio', 'espelhos', 'capataz']},
        rename={f'terreno-{n}': f'terrain-{n}' for n in ['boca', 'trilhos', 'alagada', 'prensas', 'veio', 'espelhos', 'capataz']},
        accents=[hexc(0xffa63c), hexc(0xffe6a6), hexc(0x8a4a12), hexc(0xd27a26), hexc(0x9a8064), hexc(0x4c5670), hexc(0x07060a)],
        colors=96,
    ),
    # Floresta Nevada: granito, gelo e neve no terreno (exato, segue a física); os pinheiros, a cabana
    # por dentro e o resto do que fica atrás numa camada própria, com alfa suave
    'snow': dict(
        layers={**{f'terreno-{n}': 'exact' for n in FOREST}, **{f'pinhos-{n}': 'soft1x' for n in FOREST}},
        rename={f'terreno-{n}': f'terrain-{n}' for n in FOREST},
        accents=[hexc(0xf6faff), hexc(0xdfeaf6), hexc(0x9fd0f2), hexc(0x5a92c4), hexc(0xffa63c), hexc(0xffd27a), hexc(0xb4222b),
                 hexc(0x2f4a46), hexc(0x05070c)],
        colors=128,
    ),
    'vale': dict(
        layers={**{f'terreno-{n}': 'exact' for n in VALE}, **{f'pinhos-{n}': 'soft1x' for n in VALE}},
        rename={f'terreno-{n}': f'terrain-{n}' for n in VALE},
        accents=[hexc(0xffe6ef), hexc(0xf6b6cd), hexc(0xe48aac), hexc(0xd9e07c), hexc(0x79b04e), hexc(0xe9c99c), hexc(0xd8ecf2),
                 hexc(0xf6f9fd), hexc(0x24161a)],
        colors=160,
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


def palette_of(paths):
    """Paleta com as cores que as imagens finais já usam (elas já saíram de uma paleta só)."""
    cols = set()
    for f in paths:
        a = np.asarray(Image.open(f).convert('RGBA'))
        rgb = a[..., :3][a[..., 3] > 0]
        cols.update(map(tuple, np.unique(rgb.reshape(-1, 3), axis=0).tolist()))
    cols = sorted(cols)
    assert len(cols) <= 256, len(cols)
    pal = [v for c in cols for v in c]
    pal += pal[:3] * (256 - len(cols))
    p = Image.new('P', (1, 1))
    p.putpalette(pal)
    return p, len(cols)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    keep = next((a[7:].split(',') for a in sys.argv if a.startswith('--keep=')), None)
    theme = args[0]
    hd = args[1] if len(args) > 1 else os.path.join(HERE, 'hd')
    cfg = THEMES[theme]
    colors = int(args[2]) if len(args) > 2 else cfg['colors']
    reduced = {}
    samples = []
    rng = np.random.default_rng(0)
    if keep:
        done = [os.path.join(ASSETS, cfg.get('rename', {}).get(n, os.path.basename(n)) + '.png') for n in cfg['layers'] if n not in keep]
        pal, k = palette_of([f for f in done if os.path.exists(f)])
        print('paleta das imagens prontas:', k, 'cores')
    for name, kind in cfg['layers'].items():
        if keep and name not in keep:
            continue
        path = os.path.join(hd, name + '.png')
        if not os.path.exists(path):
            print('falta', name)
            continue
        im = Image.open(path).convert('RGBA')
        if kind in ('exact', 'soft1x', 'veil'):
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
    if not keep:
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

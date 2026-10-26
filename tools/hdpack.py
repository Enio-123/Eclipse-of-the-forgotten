"""Pacote do EXTREME: o terreno pintado de cada sala e os fundos em 2x (antes de virarem pixel),
em pedaços de no máximo 2048 px (cabe em qualquer placa de vídeo) e em WebP, para o jogo baixar só
quando a sala abre. Escreve game/public/assets/hd/*.webp e game/public/assets/hd/manifest.json.

uso: python3 tools/hdpack.py [salas...]
"""
import json
import os
import sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(HERE, 'art2')
OUT = os.path.join(HERE, 'game', 'public', 'assets', 'hd')
SRC_DIRS = [os.path.join(ART, d) for d in ('hd', 'hd_prisao', 'hd_fosso', 'hd_minas', 'hd_extreme')]
MAX = 2048
Q = 88

# fundos que no jogo estão em 1x e têm a pintura 2x guardada
# camadas que só existem no EXTREME (pintadas em 2x por art2/extreme_camadas.py)
EXTRA = ['xfg-catacomb', 'xfg-prison', 'xfg-nave', 'xfg-city', 'xfg-memory', 'xfg-abyss']
BACKDROPS = ['bridge-sky', 'bridge-far', 'bridge-far-rim', 'bridge-mid', 'bridge-mid-rim', 'bridge-fg', 'clouds-far', 'clouds-near',
             'cat-far', 'cat-mid', 'mem-sky', 'mem-far', 'mem-mid']


def find(name):
    for d in SRC_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return None


def save(im, name):
    path = os.path.join(OUT, name)
    im.save(path, 'WEBP', quality=Q, method=6, alpha_quality=100)
    return os.path.getsize(path)


def chunks(im, prefix, scale):
    """Corta a imagem (scale px por px do mundo) em pedaços e devolve a lista em px do mundo.
    Pedaços sem nada (transparentes) ficam de fora."""
    W, H = im.size
    nx = -(-W // MAX)
    ny = -(-H // MAX)
    # pedaços do mesmo tamanho, múltiplos de 32 px
    cw = (-(-W // nx) + 31) // 32 * 32
    ch = (-(-H // ny) + 31) // 32 * 32
    a = np.asarray(im.getchannel('A'))
    out = []
    size = 0
    i = 0
    for y in range(0, H, ch):
        for x in range(0, W, cw):
            w = min(cw, W - x)
            h = min(ch, H - y)
            if a[y:y + h, x:x + w].max() < 4:
                continue
            name = f'{prefix}-{i}.webp'
            size += save(im.crop((x, y, x + w, y + h)), name)
            out.append({'file': name, 'x': x / scale, 'y': y / scale, 'w': w / scale, 'h': h / scale})
            i += 1
    return out, size


def main():
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[1:])
    man_path = os.path.join(OUT, 'manifest.json')
    man = json.load(open(man_path)) if os.path.exists(man_path) else {'terrain': {}, 'backdrop': {}}
    rooms = sorted(f[len('terrain-'):-4] for f in os.listdir(os.path.join(HERE, 'game', 'public', 'assets'))
                   if f.startswith('terrain-') and f.endswith('.png'))
    total = 0
    # pedaços antigos das salas que vão ser refeitas (o número de pedaços pode mudar)
    for f in os.listdir(OUT):
        if f.startswith('t-') and f.endswith('.webp'):
            room = f[2:f.rindex('-')]
            if not only or room.replace('-secret', '') in only:
                os.remove(os.path.join(OUT, f))
    for room in rooms:
        if only and room.replace('-secret', '') not in only:
            continue
        src = find(f'terreno-{room}-2x.png')
        if not src:
            print('sem 2x:', room)
            continue
        im = Image.open(src).convert('RGBA')
        small = Image.open(os.path.join(HERE, 'game', 'public', 'assets', f'terrain-{room}.png'))
        scale = im.size[0] / small.size[0]
        if abs(im.size[1] / small.size[1] - scale) > 0.01:
            print('tamanho não bate:', room, im.size, small.size)
            continue
        pieces, size = chunks(im, f't-{room}', scale)
        man['terrain'][room] = {'scale': scale, 'pieces': pieces}
        total += size
        print(f'{room:18s} {len(pieces)} pedaços {size // 1024} KB')
    if not only:
        for key in BACKDROPS:
            src = find(f'{key}.png')
            if not src:
                print('sem fundo 2x:', key)
                continue
            im = Image.open(src).convert('RGBA')
            small = Image.open(os.path.join(HERE, 'game', 'public', 'assets', f'{key}.png'))
            scale = im.size[0] / small.size[0]
            if max(im.size) > MAX * 2:
                print('grande demais:', key, im.size)
                continue
            size = save(im, f'b-{key}.webp')
            man['backdrop'][key] = {'file': f'b-{key}.webp', 'scale': scale}
            total += size
            print(f'{key:18s} {im.size} {size // 1024} KB')
    for key in EXTRA if (not only or 'extra' in only) else []:
        src = find(f'{key}.png')
        if not src:
            print('sem camada:', key)
            continue
        im = Image.open(src).convert('RGBA')
        size = save(im, f'b-{key}.webp')
        man['backdrop'][key] = {'file': f'b-{key}.webp', 'scale': 2}
        total += size
        print(f'{key:18s} {im.size} {size // 1024} KB')
    json.dump(man, open(man_path, 'w'), indent=1)
    print('total', round(total / 1e6, 2), 'MB')


main()

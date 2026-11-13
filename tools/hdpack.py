"""Pacote do EXTREME: o terreno pintado de cada sala e os fundos em 2x (antes de virarem pixel),
em pedaços de no máximo 4096 px (toda placa de vídeo com WebGL aguenta; menos arquivos, porque o Artifact guarda no máximo 511) e em WebP, para o jogo baixar só
quando a sala abre. Escreve game/public/assets/hd/*.webp e game/public/assets/hd/manifest.json.

uso: python3 tools/hdpack.py [salas...]
     python3 tools/hdpack.py --parede [salas...]   só a camada 'parede' (a parede do fundo das Torres e os
                                                   apoios de art2/apoio.py), sem mexer no terreno das salas
"""
import json
import os
import sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(HERE, 'art2')
OUT = os.path.join(HERE, 'game', 'public', 'assets', 'hd')
SRC_DIRS = [os.path.join(ART, d) for d in ('hd_x', 'hd', 'hd_prisao', 'hd_fosso', 'hd_minas', 'hd_extreme', 'hd_floresta', 'hd_vale', 'hd_torres', 'hd_apoio')]
MAX = 4096
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


def chunks(im, prefix, scale, tight=False):
    """Corta a imagem (scale px por px do mundo) em pedaços e devolve a lista em px do mundo.
    Pedaços sem nada (transparentes) ficam de fora; com tight, cada pedaço encolhe até o que tem pintura
    (os apoios ocupam um canto da sala: o resto seria placa de vídeo gasta com nada)."""
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
            if tight:
                # encolhe para a caixa do que foi pintado, em múltiplos de 8 px (4 px do mundo em 2x)
                ys, xs = np.nonzero(a[y:y + h, x:x + w] >= 4)
                bx0, by0 = x + int(xs.min()) // 8 * 8, y + int(ys.min()) // 8 * 8
                bx1, by1 = min(x + w, x + -(-(int(xs.max()) + 1) // 8) * 8), min(y + h, y + -(-(int(ys.max()) + 1) // 8) * 8)
                x_, y_, w_, h_ = bx0, by0, bx1 - bx0, by1 - by0
            else:
                x_, y_, w_, h_ = x, y, w, h
            name = f'{prefix}-{i}.webp'
            size += save(im.crop((x_, y_, x_ + w_, y_ + h_)), name)
            out.append({'file': name, 'x': x_ / scale, 'y': y_ / scale, 'w': w_ / scale, 'h': h_ / scale})
            i += 1
    return out, size


def main():
    os.makedirs(OUT, exist_ok=True)
    only = set(a for a in sys.argv[1:] if not a.startswith('--'))
    wall_only = '--parede' in sys.argv
    man_path = os.path.join(OUT, 'manifest.json')
    man = json.load(open(man_path)) if os.path.exists(man_path) else {'terrain': {}, 'backdrop': {}}
    rooms = sorted(f[len('terrain-'):-4] for f in os.listdir(os.path.join(HERE, 'game', 'public', 'assets'))
                   if f.startswith('terrain-') and f.endswith('.png'))
    total = 0
    # pedaços antigos das salas que vão ser refeitas (o número de pedaços pode mudar)
    for f in os.listdir(OUT):
        if f.startswith('t-') and f.endswith('.webp'):
            room = f[2:f.rindex('-')]
            if wall_only and not room.endswith('-parede'):
                continue
            if not only or room.replace('-secret', '').replace('-pinhos', '').replace('-parede', '') in only:
                os.remove(os.path.join(OUT, f))
    for room in rooms:
        if only and room.replace('-secret', '') not in only:
            continue
        if wall_only:
            # só a camada 'parede': a escala vem do tamanho da sala (a pintura cobre a sala inteira)
            src = find(f'parede-{room}-2x.png')
            if src:
                im = Image.open(src).convert('RGBA')
                small = Image.open(os.path.join(HERE, 'game', 'public', 'assets', f'terrain-{room}.png'))
                scale = im.size[0] / small.size[0]
                pieces, size = chunks(im, f't-{room}-parede', scale, tight=os.path.dirname(src).endswith('hd_apoio'))
                man['terrain'][f'{room}-parede'] = {'scale': scale, 'pieces': pieces}
                total += size
                print(f'{room + "-parede":18s} {len(pieces)} pedaços {size // 1024} KB')
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
        # a camada dos pinheiros da floresta, na frente do fundo e atrás de tudo que tem física
        src = find(f'pinhos-{room}-2x.png')
        if src:
            im = Image.open(src).convert('RGBA')
            pieces, size = chunks(im, f't-{room}-pinhos', scale)
            man['terrain'][f'{room}-pinhos'] = {'scale': scale, 'pieces': pieces}
            total += size
            print(f'{room + "-pinhos":18s} {len(pieces)} pedaços {size // 1024} KB')
        # a parede do fundo das Torres (atrás de tudo o que não é céu)
        src = find(f'parede-{room}-2x.png')
        if src:
            im = Image.open(src).convert('RGBA')
            pieces, size = chunks(im, f't-{room}-parede', scale, tight=os.path.dirname(src).endswith('hd_apoio'))
            man['terrain'][f'{room}-parede'] = {'scale': scale, 'pieces': pieces}
            total += size
            print(f'{room + "-parede":18s} {len(pieces)} pedaços {size // 1024} KB')
    if not only and not wall_only:
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
    for key in EXTRA if ((not only and not wall_only) or 'extra' in only) else []:
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

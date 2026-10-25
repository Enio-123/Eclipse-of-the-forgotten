"""Prévia do terreno pintado: visão geral reduzida e recortes em tamanho de jogo (1x ampliado 2x)."""
import sys
from PIL import Image
name, out = sys.argv[1], sys.argv[2]
crops = [tuple(int(v) for v in c.split(',')) for c in sys.argv[3:]]
bg = (40, 48, 70, 255)
big = Image.open(f'hd/terreno-{name}-2x.png').convert('RGBA')
base = Image.new('RGBA', big.size, bg)
base.alpha_composite(big)
w = 1600
base.convert('RGB').resize((w, int(big.height * w / big.width)), Image.LANCZOS).save(f'{out}/{name}-geral.png')
small = Image.open(f'hd/terreno-{name}.png').convert('RGBA')
for i, (x, y) in enumerate(crops):
    c = small.crop((x, y, x + 640, y + 360))
    b = Image.new('RGBA', c.size, bg)
    b.alpha_composite(c)
    b.convert('RGB').resize((1280, 720), Image.NEAREST).save(f'{out}/{name}-c{i}.png')

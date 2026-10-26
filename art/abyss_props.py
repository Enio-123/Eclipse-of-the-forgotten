"""Luzes do Fosso e do Abismo, no traço liso (ink.py).

O fundo do Fosso era só escuro: agora quem caiu lá embaixo deixou luz. As lanternas dos esquecidos
são gaiolas de ferro penduradas por corrente (no teto, embaixo das lajes ou num braço preso na
parede), com uma chama de memória lilás dentro; os cogumelos que comem a tinta do Véu brilham num
verde-água fraco no pé das paredes. Nada fica solto no ar: o jogo desenha a corrente ou o braço.

Cada função devolve (prims, decals, W, H, luzes) em pixels do mundo; as luzes (x, y, cor) ficam em
relação à origem da imagem (o gancho de cima na lanterna; o meio de baixo nos cogumelos).

uso: python3 abyss_props.py <pasta_assets> [--preview=<pasta>]
"""
import json
import math
import os
import random
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import puppet
from puppet import Ellipse, Capsule, Poly

puppet.RAMPS['iron'] = [0x101218, 0x1d2029, 0x30343f, 0x4b505e, 0x737a8b]
puppet.RAMPS['soul'] = [0x3b2c6e, 0x6c5bb4, 0xa999ea, 0xdcd2ff, 0xf8f5ff]
puppet.RAMPS['biolum'] = [0x0b2c2f, 0x145552, 0x2b8d84, 0x69d3c2, 0xc8fff1]
puppet.RAMPS['fstem'] = [0x161c20, 0x283234, 0x435250, 0x6c7d78, 0x9bada5]
puppet.SHINY.setdefault('iron', (0.45, 12))
puppet.RIM_MATS |= {'iron'}

SOUL = 0xcdbcff
TEAL = 0x72dcc8


def flat_n(x, y):
    return (0.0, 0.0, 1.0)


# ---------------------------------------------------------------- lanterna dos esquecidos
def lantern():
    """Gaiola de ferro de 16x28 com telhadinho pontudo, quatro colunas finas e a chama lilás no
    meio. A origem é o gancho de cima (o jogo pendura a corrente ali)."""
    W, H = 16, 28
    cx = 8.0
    P = []
    # argola do gancho
    P.append(Ellipse('hook', 'iron', 1.0, (cx, 1.6), 1.4, 1.4))
    P.append(Ellipse('hookin', 'void', 1.01, (cx, 1.6), 0.55, 0.55, flat=0))
    # telhado com beiral
    P.append(Poly('roof', 'iron', 1.1, [(cx, 2.6), (cx + 1.2, 3.2), (14.2, 7.8), (14.2, 9.0), (1.8, 9.0), (1.8, 7.8), (cx - 1.2, 3.2)],
                  nf=lambda x, y: (np.clip((np.asarray(x, np.float32) - cx) / 8, -0.6, 0.6), -0.45 + 0 * np.asarray(y, np.float32), 0.85), shade=1.05))
    P.append(Capsule('eave', 'iron', 1.12, (1.4, 8.8), (14.6, 8.8), 0.7, 0.7, shade=1.1))
    # o vidro aceso, o halo e a chama (bem clara: é ela que ilumina a sala)
    P.append(Poly('glass', 'soul', 0.6, [(3.0, 9.6), (13.0, 9.6), (13.0, 21.4), (3.0, 21.4)], nf=flat_n, flat=1))
    P.append(Ellipse('halo', 'soul', 0.7, (cx, 15.8), 4.4, 5.4, flat=2))
    P.append(Ellipse('flame', 'soul', 0.8, (cx, 16.2), 2.6, 4.0, flat=3))
    P.append(Ellipse('tip', 'soul', 0.81, (cx + 0.4, 12.0), 1.2, 2.0, ang=0.2, flat=3))
    P.append(Ellipse('core', 'soul', 0.82, (cx, 17.0), 1.5, 2.4, flat=4))
    # as quatro colunas da gaiola (duas nas quinas, duas finas na frente, longe da chama)
    for x, r in ((2.8, 0.6), (13.2, 0.6), (5.4, 0.32), (10.6, 0.32)):
        P.append(Capsule('bar', 'iron', 1.2, (x, 9.6), (x, 21.2), r, r))
    # base em cone com a gota de ferro
    P.append(Capsule('base', 'iron', 1.25, (2.0, 21.8), (14.0, 21.8), 0.9, 0.9, shade=1.08))
    P.append(Poly('cone', 'iron', 1.22, [(3.0, 22.4), (13.0, 22.4), (cx + 1.0, 25.6), (cx - 1.0, 25.6)],
                  nf=lambda x, y: (np.clip((np.asarray(x, np.float32) - cx) / 6, -0.6, 0.6), 0.4 + 0 * np.asarray(y, np.float32), 0.85)))
    P.append(Ellipse('drop', 'iron', 1.23, (cx, 26.5), 0.9, 1.1))
    return P, [], W, H, [(cx, 16.0, SOUL)]


# ---------------------------------------------------------------- cogumelos da tinta
def fungus(seed, wide):
    """Tufo de cogumelos de chapéu redondo, brilhando no pé da parede. A origem é o meio de baixo."""
    rnd = random.Random(seed)
    W, H = (26, 16) if wide else (18, 13)
    P = []
    n = 5 if wide else 3
    xs = sorted(rnd.uniform(3, W - 3) for _ in range(n))
    for i, x in enumerate(xs):
        h = rnd.uniform(4.5, H - 3.5) if i % 2 == 0 else rnd.uniform(2.5, 6.0)
        r = rnd.uniform(1.8, 3.4) * (1.0 if h > 5 else 0.75)
        lean = rnd.uniform(-1.4, 1.4)
        top = (x + lean, H - h)
        z = 1.0 + (0.2 if h < 5 else 0.0) + i * 0.01
        P.append(Capsule('stem', 'fstem', z, (x, H - 0.4), top, 0.55 + r * 0.12, 0.45 + r * 0.1))
        # chapéu: meia-cúpula com a beirada de baixo reta e as lamelas escuras
        cap = []
        for k in range(13):
            a = math.pi + math.pi * k / 12
            cap.append((top[0] + math.cos(a) * r, top[1] + 0.4 + math.sin(a) * r * 0.78))
        P.append(Poly('cap', 'biolum', z + 0.02, cap,
                      nf=lambda xx, yy, c=top, r=r: (np.clip((np.asarray(xx, np.float32) - c[0]) / (r * 1.6), -0.7, 0.7),
                                                  np.clip((np.asarray(yy, np.float32) - c[1]) / (r * 1.4), -0.8, 0.2), 0.75), flat=None))
        P.append(Capsule('gill', 'biolum', z + 0.03, (top[0] - r * 0.8, top[1] + 0.5), (top[0] + r * 0.8, top[1] + 0.5), 0.35, 0.35, flat=1))
        P.append(Ellipse('glow', 'biolum', z + 0.04, (top[0] - r * 0.25, top[1] - r * 0.35), r * 0.45, r * 0.22, flat=4))
        for _ in range(2):
            P.append(Ellipse('dot', 'biolum', z + 0.05, (top[0] + rnd.uniform(-0.6, 0.6) * r, top[1] - rnd.uniform(0.1, 0.5) * r), 0.35, 0.3, flat=4))
    # musgo escuro na base, para o tufo nascer do chão
    P.append(Ellipse('bed', 'fstem', 1.4, (W / 2, H - 0.3), W * 0.46, 1.1, flat=0))
    lights = [(W / 2, H - 5.0, TEAL)]
    return P, [], W, H, lights


PROPS = {
    'deco-soul-lantern': lantern,
    'deco-fungus-0': lambda: fungus(3, True),
    'deco-fungus-1': lambda: fungus(8, False),
    'deco-fungus-2': lambda: fungus(15, True),
}


if __name__ == '__main__':
    import ink
    from PIL import Image
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = args[0] if args else '.'
    only = set(args[1:])
    prev = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
    if prev:
        os.makedirs(prev, exist_ok=True)
    made = {}
    lights = {}
    for k, fn in PROPS.items():
        if only and k not in only:
            continue
        prims, decals, W, H, L = fn()
        a = ink.render_frame(prims, decals, W, H, style=ink.HK)
        im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        im.save(f'{out}/{k}.png')
        made[k] = ink.S
        lights[k] = [[round(x, 1), round(y, 1), c] for x, y, c in L]
        if prev:
            big = im.resize((im.width * 4, im.height * 4), Image.NEAREST)
            bg = Image.new('RGBA', big.size, (22, 16, 34, 255))
            bg.alpha_composite(big)
            bg.save(f'{prev}/{k}.png')
        print(k, im.size, len(prims), 'partes', flush=True)
    path = f'{out}/hd.json'
    hd = json.load(open(path)) if os.path.exists(path) else {}
    hd.update(made)
    json.dump(hd, open(path, 'w'), indent=1)
    lp = f'{out}/portal-lights.json'
    old = json.load(open(lp)) if os.path.exists(lp) else {}
    old.update(lights)
    json.dump(old, open(lp, 'w'), indent=1)

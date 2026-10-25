"""Árvores do vale (enfeites na frente das colinas), pintadas com arvore.py em 2x e reduzidas
para 1x com média pelo alfa. Mesmo tamanho de quadro e mesmo pé (centro embaixo) dos
sprites antigos, para continuar encaixando no mapa.

uso: python3 arvores_deco.py [pasta_saida]   (sai deco-tree-*.png em 1x para finaliza.py)
"""
import os
import sys
import numpy as np
from PIL import Image
from brush import Layer
from arvore import paint_tree

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'hd', 'decos')

# nome: (largura, altura em 1x, tamanho da árvore em 2x, tipo, semente)
TREES = {
    'deco-tree-big': (132, 128, 140, 'green', 3),
    'deco-tree-green': (64, 64, 46, 'green', 5),
    'deco-tree-pink': (64, 64, 46, 'pink', 8),
}


def down(L, w, h):
    o = np.asarray(L.image(), np.float32) / 255
    a = o[..., 3]
    pm = (o[..., :3] * a[..., None]).reshape(h, 2, w, 2, 3).mean((1, 3))
    am = a.reshape(h, 2, w, 2).mean((1, 3))
    rgb = pm / np.maximum(am[..., None], 1e-4)
    res = np.dstack([np.clip(rgb, 0, 1), np.clip(am, 0, 1)])
    return Image.fromarray((res * 255 + 0.5).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, (w, h, size, kind, seed) in TREES.items():
        L = Layer(w * 2, h * 2)
        paint_tree(L, np.random.default_rng(seed), w, h * 2 - 1, size, kind, 0.0, petals=True if kind == 'pink' else None)
        img = down(L, w, h)
        img.save(os.path.join(OUT, name + '.png'))
        a = np.asarray(img)[..., 3]
        ys, xs = np.nonzero(a > 128)
        print(name, img.size, 'bbox', xs.min(), xs.max(), ys.min(), ys.max())

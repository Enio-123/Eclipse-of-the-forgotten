"""Transforma uma pintura em pixel art: reduz para a resolução do jogo e limita a paleta,
guardando as cores de destaque (a capa vermelha, a ferrugem) que uma paleta automática perderia."""
import numpy as np
from PIL import Image


def pixelize(img, size, colors=56, accents=(), scale=2):
    """img: PIL RGB. size: (w, h) em pixels do jogo. accents: cores 0..1 que entram na paleta.
    Devolve a imagem ampliada `scale` vezes (vizinho mais próximo), pronta para ver."""
    small = img.convert('RGB').resize(size, Image.BOX)
    auto = small.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = list(auto.getpalette()[:colors * 3])
    for c in accents:
        pal += [int(round(float(v) * 255)) for v in c]
    n = len(pal) // 3
    pal += pal[:3] * (256 - n)
    pimg = Image.new('P', (1, 1))
    pimg.putpalette(pal)
    q = small.quantize(palette=pimg, dither=Image.Dither.NONE).convert('RGB')
    return q.resize((size[0] * scale, size[1] * scale), Image.NEAREST) if scale > 1 else q


def pixelize_rgba(img, size, palette_img):
    """Camada com transparência: reduz, quantiza com a paleta dada e mantém o alfa em 0/1."""
    small = img.resize(size, Image.BOX)
    a = np.asarray(small.getchannel('A'), np.float32) / 255
    q = small.convert('RGB').quantize(palette=palette_img, dither=Image.Dither.NONE).convert('RGB')
    out = q.convert('RGBA')
    out.putalpha(Image.fromarray(((a > 0.5) * 255).astype(np.uint8)))
    return out

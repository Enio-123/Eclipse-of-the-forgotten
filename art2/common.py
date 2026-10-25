"""Peças comuns dos fundos pintados: telas largas que emendam nas bordas (para os tileSprites
do jogo), paleta compartilhada por tema e a conversão das camadas em pixel art."""
import numpy as np
from PIL import Image
from brush import Layer

# matriz de Bayer 4x4: dá bordas pontilhadas (dither) às camadas com transparência
BAYER4 = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) + 0.5) / 16


def seamless(layer, width, pad):
    """Recorta `width` colunas de uma camada pintada com `pad` colunas extras à direita e
    mistura o começo com essa sobra, para a imagem emendar ao se repetir na horizontal."""
    P, A = layer.P, layer.A
    out = Layer(width, layer.H)
    out.P[:] = P[:, :width]
    out.A[:] = A[:, :width]
    t = np.linspace(0, 1, pad, dtype=np.float32)[None, :]
    out.P[:, :pad] = P[:, width:width + pad] * (1 - t[..., None]) + P[:, :pad] * t[..., None]
    out.A[:, :pad] = A[:, width:width + pad] * (1 - t) + A[:, :pad] * t
    return out


def layer_image(layer):
    return layer.image()


def palette_from(images, colors, accents=()):
    """Paleta única para um tema: cores mais usadas nas camadas + cores de destaque."""
    strip = [im.convert('RGB') for im in images]
    w = sum(im.width for im in strip)
    h = max(im.height for im in strip)
    sheet = Image.new('RGB', (w, h))
    x = 0
    for im in strip:
        sheet.paste(im, (x, 0))
        x += im.width
    auto = sheet.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = list(auto.getpalette()[:colors * 3])
    for c in accents:
        pal += [int(round(float(v) * 255)) for v in c]
    n = len(pal) // 3
    pal += pal[:3] * (256 - n)
    pimg = Image.new('P', (1, 1))
    pimg.putpalette(pal)
    return pimg


def to_pixels(img, size, pal, alpha_dither=True):
    """Reduz a camada (RGBA) para `size`, aplica a paleta e deixa o alfa em 0/1 com pontilhado."""
    img = img.convert('RGBA')
    # média ponderada pelo alfa, para a borda não escurecer ao reduzir
    arr = np.asarray(img, np.float32) / 255
    a = arr[..., 3:4]
    pm = Image.fromarray((np.clip(arr[..., :3] * a, 0, 1) * 255 + 0.5).astype(np.uint8))
    am = Image.fromarray((a[..., 0] * 255 + 0.5).astype(np.uint8))
    pm = np.asarray(pm.resize(size, Image.BOX), np.float32) / 255
    am = np.asarray(am.resize(size, Image.BOX), np.float32) / 255
    rgb = pm / np.maximum(am[..., None], 1e-4)
    rgb_img = Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8))
    q = np.asarray(rgb_img.quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB'))
    h, w = am.shape
    if alpha_dither:
        th = np.tile(BAYER4, (h // 4 + 1, w // 4 + 1))[:h, :w]
        alpha = (am > th).astype(np.uint8) * 255
    else:
        alpha = (am > 0.5).astype(np.uint8) * 255
    return Image.fromarray(np.dstack([q, alpha]), 'RGBA')


def preview(img, scale=2, bg=(255, 0, 255)):
    base = Image.new('RGBA', img.size, bg + (255,))
    base.alpha_composite(img.convert('RGBA'))
    return base.convert('RGB').resize((img.width * scale, img.height * scale), Image.NEAREST)

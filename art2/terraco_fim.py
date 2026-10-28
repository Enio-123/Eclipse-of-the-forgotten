"""O que ficou no chão do terraço depois do final I ("Ele tirou a máscara e largou a foice no chão do terraço"),
em 2x, como as outras peças pequenas:

  mascara-chao.png  a máscara de porcelana (a mesma pintura do item-mask), do tamanho da que ele usava no rosto,
                    já inclinada: ela fica de pé, encostada na coroa que ele deixou no chão
  foice-chao.png    a foice deitada: o cabo escuro no chão com os três anéis de ouro, como a do cavaleiro, e a
                    lâmina também deitada (vista de lado e um pouco de cima ela sobe para o fundo, achatada pela
                    distância), com a sombra colada embaixo dela

uso: python3 terraco_fim.py <pasta_assets>
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ASSETS = sys.argv[1] if len(sys.argv) > 1 else '../game/public/assets'

# a máscara no rosto do cavaleiro tem uns 17 px de largura na folha (2x)
MASK_W = 17
MASK_LEAN = 18  # graus: o alto vai para o lado da coroa (a esquerda; no jogo ela vira quando a coroa fica do outro lado)

# a foice: 128 x 32 em 2x (64 x 16 no mundo); o chão passa em y = 29
W, H = 128, 32
SS = 4
OUT = (12, 9, 12, 255)
STEEL = (66, 76, 102, 255)
STEEL_TOP = (94, 108, 138, 255)
EDGE = (182, 196, 220, 255)
WOOD = (40, 30, 36, 255)
WOOD_HI = (78, 64, 72, 255)
GOLD = (217, 164, 65, 255)
GOLD_HI = (250, 214, 130, 255)


def bez(p0, p1, p2, n=24):
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return out


def P(pts, dx=0.0, dy=0.0):
    return [((x + dx) * SS, (y + dy) * SS) for x, y in pts]


def mask():
    src = Image.open(os.path.join(ASSETS, 'item-mask.png')).convert('RGBA')
    a = np.asarray(src)[..., 3]
    ys, xs = np.nonzero(a > 20)
    face = src.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    h = round(face.height * MASK_W / face.width)
    face = face.resize((MASK_W * 4, h * 4), Image.LANCZOS)
    pad = Image.new('RGBA', (face.width + 40, face.height + 40), (0, 0, 0, 0))
    pad.alpha_composite(face, (20, 20))
    lean = pad.rotate(MASK_LEAN, resample=Image.BICUBIC)
    lean = lean.resize((lean.width // 4, lean.height // 4), Image.LANCZOS)
    box = lean.getbbox()
    return lean.crop(box)


def scythe():
    # a lâmina: o calcanhar na ponta do cabo (18, 26), sobe para o fundo e a ponta curva para o lado do cabo
    heel = (18, 26)
    outer = bez(heel, (4, 19), (16, 13)) + bez((16, 13), (32, 9.5), (54, 14))[1:]
    inner = bez((54, 14), (32, 12.5), (20, 16.5))[1:] + bez((20, 16.5), (14, 20), (22, 24.5))[1:]
    blade = outer + inner
    im = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    # a sombra no chão, colada embaixo do cabo e da lâmina
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh)
    ds.polygon(P(blade, 1.2, 1.4), fill=(6, 4, 10, 150))
    ds.line(P([(16, 29), (124, 29.6)]), fill=(6, 4, 10, 170), width=int(4 * SS))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(1.2 * SS)))
    d = ImageDraw.Draw(im)
    # o contorno escuro da lâmina, mais grosso que o do resto: ela é clara e fica contra o céu
    d.polygon(P(blade), fill=OUT)
    d.line(P(blade + blade[:1]), fill=OUT, width=int(1.6 * SS), joint='curve')
    body = (bez((18.6, 24.8), (5.6, 19), (16.4, 13.9)) + bez((16.4, 13.9), (32, 10.6), (51.5, 14.2))[1:]
            + bez((51.5, 14.2), (32, 13.3), (20.4, 17.3))[1:] + bez((20.4, 17.3), (15.2, 20.4), (21.5, 23.8))[1:])
    d.polygon(P(body), fill=STEEL)
    # a face de cima pega a luz do céu, mais clara para o fundo
    top = bez((17, 22), (7, 18.6), (17, 14.6)) + bez((17, 14.6), (32, 11.4), (48, 14.2))[1:] + bez((48, 14.2), (32, 12.6), (19, 16.6))[1:]
    d.polygon(P(top), fill=STEEL_TOP)
    edge = bez((17.6, 23.4), (5.2, 18.8), (16.4, 13.6)) + bez((16.4, 13.6), (32, 10.2), (51, 14))[1:]
    d.line(P(edge), fill=EDGE, width=int(1.1 * SS))
    # o cabo e os anéis de ouro (no calcanhar da lâmina, no punho e na ponta)
    d.line(P([(18, 26), (122, 27.4)]), fill=OUT, width=int(6 * SS))
    d.line(P([(18, 26), (122, 27.4)]), fill=WOOD, width=int(3.6 * SS))
    d.line(P([(20, 24.9), (120, 26.3)]), fill=WOOD_HI, width=int(1 * SS))
    for x, y, r in ((20, 26, 3.2), (80, 26.8, 2.6), (122, 27.4, 3.4)):
        d.ellipse([(x - r - 1) * SS, (y - r - 1) * SS, (x + r + 1) * SS, (y + r + 1) * SS], fill=OUT)
        d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=GOLD)
        d.ellipse([(x - r * 0.5 - 0.6) * SS, (y - r * 0.7) * SS, (x + r * 0.1) * SS, (y - r * 0.1) * SS], fill=GOLD_HI)
    return im.resize((W, H), Image.LANCZOS)


def main():
    m = mask()
    m.save(os.path.join(ASSETS, 'mascara-chao.png'), optimize=True)
    print('mascara-chao.png', m.size)
    f = scythe()
    f.save(os.path.join(ASSETS, 'foice-chao.png'), optimize=True)
    print('foice-chao.png', f.size)


if __name__ == '__main__':
    main()

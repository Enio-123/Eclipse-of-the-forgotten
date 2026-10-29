"""O céu da manhã depois do eclipse (finais I e III): a mesma pintura do céu da ponte, do título e da cidade,
com as mesmas pinceladas, passada para a primeira manhã. O eclipse acabou: no lugar do disco preto fica o sol,
as nuvens ganham a luz dele (creme e ouro perto, lilás e cinza no corpo) e o fundo escuro da noite vira o azul
fundo da manhã. Nada muda de lugar: só a luz. As estrelas da noite somem.

O céu do vale (que também é o das torres) é pintado em chapadas, com uma paleta de umas cem cores: lá cada
cor da paleta troca pela cor dela na manhã (a mesma ordem de luz), então as chapadas e as pinceladas ficam
onde estão, e o halo do sol sai em anéis, como o do eclipse.

uso: python3 aurora.py <pasta_assets> [céu ...]
  lê <céu>.png e grava <céu>-aurora.png (sem céu: todos)
"""
import os
import sys
import numpy as np
from PIL import Image
from brush import hexc, mix, sstep, blur

ASSETS = sys.argv[1] if len(sys.argv) > 1 else '../game/public/assets'

# onde o eclipse está em cada céu (centro e raio do disco, em pixels da imagem; a cidade e o vale têm o dobro)
SKIES = {
    'title-sky': (469.8, 84.8, 25.7),
    'bridge-sky': (819.8, 94.8, 25.7),
    'city-sky': (929.5, 149.5, 39.8),
}
FLAT = {
    'vale-sky': (967.5, 111.5, 29.6),
    # o céu das Torres é o mesmo céu do vale, visto de mais alto (o eclipse no mesmo lugar)
    'torres-sky': (967.5, 111.5, 29.6),
}
LUMA = np.array([0.3, 0.55, 0.15], np.float32)

def ramp(t, stops):
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,), np.float32)
    for (a, ca), (b, cb) in zip(stops[:-1], stops[1:]):
        k = np.clip((t - a) / (b - a), 0, 1)
        seg = (t >= a) & (t <= b)
        c = hexc(ca) * (1 - k[..., None]) + hexc(cb) * k[..., None]
        out[seg] = c[seg]
    return out


def screen(base, c, a):
    a = np.clip(a, 0, 1)[..., None]
    return 1 - (1 - base) * (1 - c * a)


def unstar(rgb, cx, cy, r):
    """As estrelas: pontos claros pequenos em cima do céu liso. Uma abertura com uma linha deitada (21 px)
    apaga o que é mais estreito que ela e deixa as nuvens (compridas); o que sobra da diferença, longe do
    eclipse, é estrela com o brilhinho em volta, e o buraco se fecha com o céu de perto."""
    from scipy import ndimage as ndi
    H, W = rgb.shape[:2]
    Y = rgb @ LUMA
    top = Y - ndi.grey_opening(Y, size=(1, 21))
    yy, xx = np.mgrid[0:H, 0:W]
    far = np.hypot(xx - cx, yy - cy) > r * 4
    star = ndi.binary_dilation((top > 0.02) & far, iterations=2)
    keep = (~star).astype(np.float32)
    num = blur(rgb * keep[..., None], 3)
    den = blur(keep, 3)[..., None]
    fill = num / np.maximum(den, 1e-3)
    return np.where(star[..., None], fill, rgb)


def dawn(img, cx, cy, r, stars=False):
    a = np.asarray(img.convert('RGBA'), np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3]
    if stars:
        rgb = unstar(rgb, cx, cy, r)
    H, W = rgb.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.hypot(xx - cx, yy - cy)
    Y = rgb @ LUMA
    # o disco do eclipse e a borda dele não contam na luz das nuvens (lá vai o sol)
    sky = d > r * 1.25
    lo, hi = np.percentile(Y[sky], 2), np.percentile(Y[sky], 99.5)
    t = (Y - lo) / max(1e-3, hi - lo)
    # contraste das pinceladas: a curva em S abre as luzes e as sombras das nuvens
    t = np.clip(t, 0, 1)
    t = t * t * (3 - 2 * t)
    # no disco do eclipse e na borda dele fica a luz do sol
    t = np.where(sky, t, 1.0)
    # o céu por baixo das nuvens: o azul limpo da manhã longe do sol, ouro em volta dele e perto do horizonte
    near = np.exp(-(d / (r * 8.0)) ** 2)
    glow = np.exp(-(d / (r * 22.0)) ** 2)
    s = np.clip(0.08 + 0.55 * near + 0.25 * glow + 0.25 * (yy / H) ** 2, 0, 1)
    base = ramp(s, [(0.0, 0x3d5c9c), (0.35, 0x7fa2d2), (0.6, 0xdfe2e4), (0.8, 0xf6dfb4), (1.0, 0xffd48c)])
    # as pinceladas: a sombra da nuvem mais funda e mais azul, a luz dela quente (ouro perto do sol)
    shade = base * 0.68 + hexc(0x1f2f60) * 0.12
    lit = mix(base, mix(hexc(0xfff4e6), hexc(0xffcf90), (near * 0.8 + glow * 0.2)[..., None]), 0.6)
    out = mix(shade, lit, t[..., None])
    # o sol: sem disco duro (ninguém olha direto para ele), o clarão, o brilho e o halo largo e quente
    out = screen(out, hexc(0xfff4e0), np.exp(-(d / (r * 1.4)) ** 2))
    out = screen(out, hexc(0xffd8a0), np.exp(-(d / (r * 4.0)) ** 2) * 0.55)
    out = screen(out, hexc(0xffc080), np.exp(-(d / (r * 12.0)) ** 2) * 0.3)
    out = mix(out, hexc(0xfffdf6), (np.exp(-(d / (r * 0.75)) ** 2) * 0.9)[..., None])
    # a beira de baixo, perto do horizonte, esquenta
    out = screen(out, hexc(0xffc89a), sstep(H * 0.5, H, yy) * 0.15)
    # os fachos: riscas largas e fracas saindo do sol
    ang = np.arctan2(yy - cy, xx - cx)
    rays = (0.5 + 0.5 * np.cos(ang * 9 + 0.7)) ** 6 + 0.6 * (0.5 + 0.5 * np.cos(ang * 14 + 2.1)) ** 8
    rays = blur(rays.astype(np.float32), 1.5) * sstep(r * 1.2, r * 2.4, d) * np.exp(-(d / (r * 9.0)) ** 2)
    out = screen(out, hexc(0xffe4bc), rays * 0.18)
    res = np.concatenate([np.clip(out, 0, 1), alpha[..., None]], -1)
    return Image.fromarray((res * 255 + 0.5).astype(np.uint8), 'RGBA')


def flat_stars(idx, L, allow):
    """As estrelas do céu em chapadas: manchas pequenas mais claras que a chapada em volta (a cor que mais
    aparece num quadrado de 15 px) viram a cor da chapada"""
    from scipy import ndimage as ndi
    best = np.full(idx.shape, -1.0, np.float32)
    mode = np.zeros_like(idx)
    for k in range(int(idx.max()) + 1):
        c = ndi.uniform_filter((idx == k).astype(np.float32), 15)
        m = c > best
        best[m] = c[m]
        mode[m] = k
    cand = (idx != mode) & (L[idx] > L[mode] + 0.03) & allow
    lab, _ = ndi.label(cand, structure=np.ones((3, 3)))
    out = idx.copy()
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        comp = lab[sl] == i
        if sl[0].stop - sl[0].start <= 16 and sl[1].stop - sl[1].start <= 16 and comp.sum() <= 140:
            out[sl][comp] = mode[sl][comp]
    return out


def flat_dawn(img, cx, cy, r):
    """A manhã num céu de chapadas: cada cor da paleta vira a cor dela na manhã, com a mesma curva de luz para
    todas (as chapadas que eram vizinhas na luz continuam vizinhas). O que separa as coisas é a cor: o céu
    (os azuis frios) vira o azul da manhã, as sombras das nuvens e das montanhas (os lilases e os cinzas) viram
    um cinza-azulado mais apagado, e as luzes quentes viram o creme do sol. No lugar do eclipse fica o sol,
    com o halo em anéis"""
    a = np.asarray(img.convert('RGBA'))
    H, W = a.shape[:2]
    pal, inv = np.unique(a[..., :3].reshape(-1, 3), axis=0, return_inverse=True)
    idx = inv.reshape(H, W)
    P = pal.astype(np.float32) / 255
    L = P @ LUMA
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.hypot(xx - cx, yy - cy)
    idx = flat_stars(idx, L, (d > r * 6) & (yy < H * 0.36))
    # quanto a cor é fria (céu) ou quente (luz do sol nas coisas), pela diferença entre o vermelho e o azul
    w = (P[:, 0] - P[:, 2]) / np.maximum(P.mean(1), 0.12)
    # (os lilases claros são a sombra das nuvens, não céu)
    sky = sstep(-0.12, -0.3, w) * sstep(0.6, 0.45, L)
    warm = sstep(-0.04, 0.28, w)
    # as luzes rosadas (o malva entre as nuvens) ficam um pouco mais escuras que as creme, para o mar de nuvens
    # não virar uma chapada só
    pink = sstep(0.2, 0.3, (P[:, 0] - P[:, 1]) / np.maximum(P.mean(1), 0.12)) * warm
    Lout = 0.38 + 0.62 * L ** 0.9 - 0.05 * pink
    SB = ramp(Lout, [(0.3, 0x2c4a86), (0.5, 0x426cb6), (0.6, 0x5c88cc), (0.7, 0x80a6de), (0.8, 0xacc6ea), (0.9, 0xd6e2f2), (1.0, 0xf6f8fc)])
    BG = ramp(Lout, [(0.3, 0x403e58), (0.5, 0x5c5c7c), (0.6, 0x787896), (0.7, 0x9896b0), (0.8, 0xb8b6c8), (0.9, 0xd8d6e0), (1.0, 0xf4f2f6)])
    WL = ramp(Lout, [(0.3, 0x6a5458), (0.5, 0x907a78), (0.6, 0xb49a92), (0.7, 0xd4baaa), (0.8, 0xecd6c2), (0.9, 0xfaeada), (1.0, 0xfff8ee)])
    obj = mix(BG, WL, warm[:, None])
    # o halo pintado do eclipse (as chapadas escuras em volta do disco) vira céu: lá vai o clarão do sol
    near = sstep(r * 4.5, r * 3.0, d) * sstep(0.4, 0.3, L[idx])
    k = np.maximum(sky[idx], near)[..., None]
    out = mix(obj[idx], SB[idx], k)
    # o sol: o clarão em anéis (como o halo pintado do eclipse) e o disco branco
    g = 0.95 * np.exp(-(d / (r * 1.7)) ** 2) + 0.36 * np.exp(-(d / (r * 4.2)) ** 2)
    gq = np.floor(np.clip(g, 0, 1) * 6) / 6
    out = screen(out, hexc(0xfff2d8), gq)
    out[d < r * 1.1] = hexc(0xfffdf6)
    res = np.concatenate([np.clip(out, 0, 1), a[..., 3:4].astype(np.float32) / 255], -1)
    return Image.fromarray((res * 255 + 0.5).astype(np.uint8), 'RGBA')


def main():
    want = set(sys.argv[2:])
    for key, (cx, cy, r) in SKIES.items():
        if want and key not in want:
            continue
        src = Image.open(os.path.join(ASSETS, key + '.png'))
        dawn(src, cx, cy, r, stars=key == 'city-sky').save(os.path.join(ASSETS, key + '-aurora.png'), optimize=True)
        print(key + '-aurora.png')
    for key, (cx, cy, r) in FLAT.items():
        if want and key not in want:
            continue
        src = Image.open(os.path.join(ASSETS, key + '.png'))
        # de volta para uma paleta, como o original (as chapadas cabem em 256 cores)
        out = flat_dawn(src, cx, cy, r).quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        out.save(os.path.join(ASSETS, key + '-aurora.png'), optimize=True)
        print(key + '-aurora.png')


if __name__ == '__main__':
    main()

"""Tela de título e cena de abertura, montadas a partir das pinturas já feitas.

Título: recorte do céu e do castelo da ponte (o eclipse entre as torres) e um penhasco escuro
pintado à esquerda, onde o cavaleiro fica parado na chuva (pés em x=128, y=299 no jogo).
Abertura: as camadas da floresta (forest.py) agrupadas por profundidade, para o jogo animar
com neve caindo e um leve movimento de câmera.

uso: python3 titulo.py [pasta_hd] [pasta_floresta]
"""
import math
import os
import sys
import numpy as np
from PIL import Image
from brush import Layer, hexc, mix, sstep, blur, value_noise, paint
from shapes import Mask

HD = sys.argv[1] if len(sys.argv) > 1 else 'hd'
FOREST = sys.argv[2] if len(sys.argv) > 2 else 'out'
W, H = 1280, 720
CROP = (700, 20, 700 + W, 20 + H)  # no céu/castelo da ponte (2x): o eclipse fica em x=940, y=170


def load(name):
    im = Image.open(os.path.join(HD, name + '.png')).convert('RGBA')
    return im.crop(CROP)


def as_layer(img):
    a = np.asarray(img, np.float32) / 255
    L = Layer(img.width, img.height)
    L.P[:] = a[..., :3] * a[..., 3:4]
    L.A[:] = a[..., 3]
    return L


def cliff(rng):
    """Penhasco da frente: rocha escura, luz fria em cima, contraluz dourada na borda direita."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    m = Mask(W, H)
    top = 598
    pts = [(-10, H + 5), (-10, 548), (30, 556), (70, 574), (110, top), (180, top - 2), (260, top), (330, top + 1), (352, top + 6),
           (370, 622), (384, 660), (378, 700), (392, H + 5)]
    m.poly(pts)
    # árvore seca na beira de trás
    def branch(x, y, ang, ln, w, depth):
        ex, ey = x + math.cos(ang) * ln, y + math.sin(ang) * ln
        m.line([(x, y), ((x + ex) / 2 + rng.normal(0, 3), (y + ey) / 2 + rng.normal(0, 3)), (ex, ey)], w)
        if depth > 0:
            for _ in range(2):
                branch(ex, ey, ang + rng.normal(0, 0.5), ln * rng.uniform(0.55, 0.75), max(1.5, w * 0.62), depth - 1)
    m.line([(44, 566), (50, 470), (40, 380)], 12)
    branch(40, 384, -math.pi / 2 - 0.4, 90, 9, 4)
    branch(48, 440, -math.pi / 2 + 0.7, 80, 6, 3)
    mm = m.array()
    M = mm > 0.5
    # distância até o vazio por cima e pela direita
    dtop = yy - np.maximum.accumulate(np.where(~M, yy, -1e6), axis=0)
    dright = np.minimum.accumulate(np.where(~M, xx, 1e6)[:, ::-1], axis=1)[:, ::-1] - xx
    base = hexc(0x161b28)
    fine = value_noise(H, W, 10, rng, 2)
    col = base * (0.8 + 0.4 * fine)[..., None]
    col = mix(col, hexc(0x3c4864), (np.exp(-dtop / 14) * 0.7)[..., None])
    col = mix(col, hexc(0xb7c6de), (sstep(3, 0.4, dtop) * 0.7)[..., None])
    col = mix(col, hexc(0xe7a957), (np.exp(-dright / 3) * 0.6)[..., None])
    col = mix(col, hexc(0x080a10), sstep(620, 720, yy)[..., None] * 0.6)
    L = Layer(W, H)
    L.fill(col, mm)
    passes = [dict(size=9, spacing=0.9, length=(1.6, 3.6), err=0.0, alpha=0.55, bristle=0.55, dry=0.45, blur=0.12, taper=0.35, ang_jitter=0.3),
              dict(size=4.5, spacing=0.95, length=(1.6, 3.2), err=0.0, alpha=0.6, bristle=0.5, dry=0.4, blur=0.06, taper=0.4, ang_jitter=0.3)]
    paint(L, col, mm, (value_noise(H, W, 40, rng, 2) - 0.5) * 0.8, rng, passes, val_jitter=0.1, clip_soft=0, base=0.0)
    # capim molhado em cima
    for _ in range(140):
        x = rng.uniform(60, 350)
        y = top + rng.uniform(0, 4)
        ln = rng.uniform(6, 22)
        ang = -math.pi / 2 + rng.normal(0, 0.3)
        L.stroke(x + math.cos(ang) * ln / 2, y + math.sin(ang) * ln / 2, ang, ln, rng.uniform(1.4, 2.6),
                 mix(hexc(0x1d2a22), hexc(0x4d6a3a), rng.random()), 0.9, rng, 0.2, 0.1, taper=0.9)
    rim = Layer(W, H)
    edge = M & (np.roll(M, 4, axis=0) == False)
    rim.fill(hexc(0xc9d6f0), np.clip(blur(edge.astype(np.float32), 1.5) * 1.3, 0, 1) * 0.4)
    return L, rim


def title(rng):
    sky = load('bridge-sky')
    sky.save(os.path.join(HD, 'title-sky.png'))
    land = as_layer(load('bridge-far'))
    # abismo: névoa escura subindo do fundo entre o penhasco e o castelo
    yy = np.mgrid[0:H, 0:W][0].astype(np.float32)
    fog = Layer(W, H)
    fog.fill(hexc(0x2b3550), sstep(470, 640, yy) * 0.85)
    fog.fill(hexc(0x0b0f1a), sstep(600, 720, yy) * 0.7)
    land.over(fog)
    c, crim = cliff(rng)
    land.over(c)
    land.image().save(os.path.join(HD, 'title-land.png'))
    rim = as_layer(load('bridge-far-rim'))
    rim.over(crim)
    rim.image().save(os.path.join(HD, 'title-rim.png'))
    print('título pronto')


def intro():
    """Camadas da abertura na floresta agrupadas por profundidade."""
    def L(name):
        return as_layer(Image.open(os.path.join(FOREST, f'floresta-{name}.png')).convert('RGBA'))
    back = L('sky')
    for k in ['far', 'snow', 'rocks', 'wolves', 'mid', 'mist', 'rock', 'figure']:
        back.over(L(k))
    back.image().save(os.path.join(HD, 'intro-back.png'))
    near = L('near')
    near.over(L('canopy'))
    near.image().save(os.path.join(HD, 'intro-near.png'))
    L('fore').image().save(os.path.join(HD, 'intro-fore.png'))
    L('beams').image().save(os.path.join(HD, 'intro-beams.png'))
    print('abertura pronta')


if __name__ == '__main__':
    title(np.random.default_rng(61))
    intro()

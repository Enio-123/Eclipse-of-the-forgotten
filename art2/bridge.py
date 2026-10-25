"""Prévia de jogo na Ponte do Castelo no estilo novo: fundo pintado com pinceladas (céu de
tempestade, eclipse, castelo de Vespera, abismo com a cidade lá embaixo) convertido em pixel art,
a camada jogável do próprio jogo por cima e silhuetas pretas fora de foco na frente (Limbo).

uso: python3 bridge.py <pasta_saida> <camada_jogavel.png>
A camada jogável vem de tools/capture_layer.cjs (640x360 com transparência).
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from brush import Layer, hexc, mix, sstep, blur, value_noise, noise1d, paint, passes_std
from shapes import Mask
from pixelize import pixelize

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
GAME = sys.argv[2] if len(sys.argv) > 2 else 'cap/ponte.png'
W, H = 1280, 720
S = 1.0
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(23)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
T0 = time.time()

# paleta: ardósia de tempestade, ouro do eclipse e as janelas acesas
INK = hexc(0x05070c)
SL0, SL1, SL2, SL3, SL4 = hexc(0x0b1020), hexc(0x141b2e), hexc(0x212a42), hexc(0x323d58), hexc(0x4d5a78)
FOG0, FOG1 = hexc(0x2b3550), hexc(0x46526f)
GOLD0, GOLD1, GOLD2, GOLD3 = hexc(0x6e3c1a), hexc(0xb4702e), hexc(0xe7ad55), hexc(0xfff0c8)
WIN0, WIN1 = hexc(0xd9772e), hexc(0xffc46e)
EX, EY, ER = 905.0, 150.0, 54.0  # o sol em eclipse, no vão entre as torres


def col_field(c):
    return np.broadcast_to(c, (H, W, 3)).astype(np.float32).copy()


def angle_field(a):
    return np.full((H, W), a, np.float32)


layers = {}
d_e = np.hypot(xx - EX, yy - EY)

# ---------------- céu de tempestade ----------------
t = yy / H
sky = mix(SL0, SL2, sstep(0.0, 0.8, t)[..., None])
cl = value_noise(H, W, 150, rng, 4)
cl2 = value_noise(H, W, 60, rng, 3)
cloud = sstep(0.42, 0.72, cl * 0.75 + cl2 * 0.25 + 0.18 * (1 - t))
sky = mix(sky, SL3, (cloud * 0.55)[..., None])
sky = mix(sky, SL1, (sstep(0.55, 0.3, cl) * 0.5)[..., None])  # vãos escuros entre as nuvens
storm = np.exp(-(((xx - 250) / 300) ** 2 + ((yy - 110) / 200) ** 2))
sky = mix(sky, hexc(0x55638a), (storm * cloud * 0.6)[..., None])
cold_edge = np.clip(cloud - blur(cloud, 6), 0, 1) * 4 * storm
sky = mix(sky, hexc(0x9fb0d4), np.clip(cold_edge, 0, 1)[..., None] * 0.55)
halo = np.exp(-(d_e / 300) ** 2)
sky = mix(sky, GOLD0, (halo * 0.75)[..., None])
sky = mix(sky, GOLD1, (np.exp(-(d_e / 150) ** 2) * 0.8)[..., None])
# bordas das nuvens acesas pela coroa
lit_edge = np.clip(cloud - blur(cloud, 7), 0, 1) * 4 * np.exp(-(d_e / 380) ** 2)
sky = mix(sky, GOLD2, np.clip(lit_edge, 0, 1)[..., None] * 0.8)
swirl = (cl2 - 0.5) * 0.9 + np.arctan2(yy - EY, xx - EX) * 0.0
flow = np.where(d_e < 330, np.arctan2(yy - EY, xx - EX) + math.pi / 2 + (cl2 - 0.5) * 0.6, -0.12 + swirl)
L = Layer(W, H)
paint(L, sky, np.ones((H, W), np.float32), flow, rng, passes_std(1.2, dry=0.25, bristle=0.35, err=(0, 0.02, 0.04, 0.07), long=1.5),
      val_jitter=0.05, base=1.0)
# o eclipse: disco negro, anel quente e raios da coroa
for _ in range(260):
    a = rng.uniform(0, 2 * math.pi)
    r0 = ER + rng.uniform(2, 10)
    ln = rng.uniform(20, 110) * (0.4 + rng.random())
    cx, cy = EX + math.cos(a) * (r0 + ln / 2), EY + math.sin(a) * (r0 + ln / 2)
    c = mix(GOLD1, GOLD3, rng.random() ** 2)
    L.stroke(cx, cy, a, ln, rng.uniform(1.5, 4.5), c, rng.uniform(0.15, 0.45), rng, 0.4, 0.5, taper=0.8)
ring = sstep(ER + 5, ER + 1.5, d_e) * sstep(ER - 1, ER + 1.2, d_e)
L.fill(GOLD3, ring * 0.95)
L.fill(hexc(0x06070b), sstep(ER + 0.8, ER - 0.8, d_e))
layers['sky'] = L
print('céu', round(time.time() - T0, 1))

# ---------------- montanhas e penhascos ao longe ----------------
m_far = Mask(W, H)
ridge = 330 + 70 * (noise1d(W, 220, rng, 4) - 0.5) + 0.06 * np.arange(W)
pts = [(-10, H)] + [(x, float(ridge[x])) for x in range(0, W, 6)] + [(W + 10, H)]
m_far.poly(pts)
mf = m_far.array()
ref = mix(hexc(0x1a2238), FOG0, sstep(320, 470, yy)[..., None] * 0.8)
ref = mix(ref, GOLD0, (np.exp(-(d_e / 420) ** 2) * 0.35)[..., None])
L = Layer(W, H)
paint(L, ref, mf, angle_field(-0.5) + (value_noise(H, W, 50, rng) - 0.5) * 0.8, rng,
      passes_std(0.8, dry=0.4, bristle=0.45, err=(0, 0.02, 0.04, 0.07)), val_jitter=0.04, base=1.0)
layers['far'] = L

# ---------------- castelo de Vespera no penhasco ----------------
m_c = Mask(W, H)
cliff = [(640, H), (660, 470), (700, 430), (742, 418), (800, 410), (1290, 395), (1290, H)]
m_c.poly(cliff)
towers = [  # (x, meia largura, topo, altura do telhado): as duas mais altas abrem um vão para o eclipse
    (720, 12, 320, 40), (770, 18, 276, 56), (826, 24, 222, 96), (872, 13, 334, 34), (912, 15, 352, 28),
    (954, 14, 336, 36), (1012, 28, 196, 122), (1070, 18, 262, 64), (1120, 16, 300, 50), (1172, 22, 268, 60), (1228, 14, 318, 44),
]
for (x, hw, top, rh) in towers:
    m_c.rect(x - hw, top, x + hw, 430)
    m_c.poly([(x - hw - 3, top + 2), (x, top - rh), (x + hw + 3, top + 2)])
    if hw > 16:  # torrinhas nos cantos
        for sx in (-1, 1):
            tx = x + sx * (hw - 3)
            m_c.rect(tx - 4, top - 14, tx + 4, top + 6)
            m_c.poly([(tx - 6, top - 12), (tx, top - 34), (tx + 6, top - 12)])
m_c.rect(760, 352, 1250, 432)  # muralha
for x in range(762, 1250, 14):
    m_c.rect(x, 344, x + 7, 354)  # ameias
for (x0, x1, y0) in [(700, 760, 380), (1180, 1290, 360)]:
    m_c.rect(x0, y0, x1, 432)
mc = m_c.array()
# corpo escuro, mais azulado embaixo (névoa), contraluz dourada nas bordas viradas para o eclipse
ref = mix(hexc(0x0a0e18), hexc(0x182036), sstep(300, 470, yy)[..., None])
dirx, diry = (xx - EX), (yy - EY)
nrm = np.hypot(dirx, diry) + 1e-3
shift = 3.0
inside = mc > 0.5
# borda iluminada: pixel do castelo cujo vizinho na direção da luz é céu
from scipy import ndimage as ndi
ux, uy = -dirx / nrm, -diry / nrm
sx_ = np.clip((xx + ux * shift).astype(int), 0, W - 1)
sy_ = np.clip((yy + uy * shift).astype(int), 0, H - 1)
rim = inside & (mc[sy_, sx_] < 0.5)
rim_f = blur(rim.astype(np.float32), 0.8) * np.exp(-(nrm / 520) ** 2) * 1.6
ref = mix(ref, GOLD2, np.clip(rim_f, 0, 1)[..., None])
flow = angle_field(math.pi / 2) + (value_noise(H, W, 30, rng) - 0.5) * 0.3
L = Layer(W, H)
paint(L, ref, mc, flow, rng, passes_std(0.42, dry=0.35, bristle=0.4, err=(0, 0.02, 0.035, 0.05), long=1.2), val_jitter=0.04, base=1.0)
# janelas acesas, pequenas e tremidas
for (x, hw, top, rh) in towers + [(1000, 200, 360, 0)]:
    for _ in range(int(rng.integers(2, 6)) if hw < 100 else 14):
        wx = x + rng.uniform(-hw + 4, hw - 4)
        wy = rng.uniform(top + 10, 420)
        if mc[int(wy), int(np.clip(wx, 0, W - 1))] < 0.9:
            continue
        c = mix(WIN0, WIN1, rng.random())
        L.stroke(wx, wy, math.pi / 2, rng.uniform(4, 8), rng.uniform(2.2, 3.4), c, 0.95, rng, 0.2, 0.0, taper=0.2)
        L.dab(wx, wy, 6, WIN0, 0.08, 4)
mist = Layer(W, H)
band = np.exp(-((yy - 430) / 34) ** 2) * (0.4 + 0.6 * value_noise(H, W, 70, rng, 2))
mist.fill(FOG1, band * 0.5)
L.over(mist)
layers['castle'] = L
print('castelo', round(time.time() - T0, 1))

# ---------------- abismo sob a ponte: névoa e a cidade lá embaixo ----------------
m_g = (yy > 470).astype(np.float32)
ref = mix(FOG0, hexc(0x070a12), sstep(480, 720, yy)[..., None])
ref = mix(ref, FOG1, (np.exp(-((yy - 520) / 30) ** 2) * 0.6 * value_noise(H, W, 90, rng, 2))[..., None])
L = Layer(W, H)
paint(L, ref, m_g, angle_field(-0.04) + (value_noise(H, W, 80, rng) - 0.5) * 0.4, rng,
      passes_std(1.0, dry=0.35, bristle=0.35, err=(0, 0.02, 0.035, 0.06), long=1.8), val_jitter=0.04, clip_soft=4, base=1.0)
for _ in range(120):  # luzes da cidade, borradas pela névoa
    x = rng.uniform(0, W)
    y = rng.uniform(560, 700)
    L.dab(x, y, rng.uniform(1.2, 2.6), mix(WIN0, WIN1, rng.random()), rng.uniform(0.35, 0.8), 1.2)
    L.dab(x, y, rng.uniform(5, 10), WIN0, 0.06, 5)
layers['gorge'] = L

# ---------------- chuva ao fundo ----------------
rain_far = Layer(W, H)
for _ in range(1400):
    x, y = rng.uniform(-40, W + 40), rng.uniform(-20, H + 20)
    rain_far.stroke(x, y, math.pi / 2 + 0.22, rng.uniform(14, 34), rng.uniform(0.8, 1.4), hexc(0x8a97b4), rng.uniform(0.12, 0.3), rng, 0.0, 0.0, taper=0.6)
layers['rain_far'] = rain_far
print('fundo', round(time.time() - T0, 1))

# ---------------- silhuetas da frente (Limbo) ----------------
m_f = Mask(W, H)
# correntes pendendo do alto, longe do HUD
for (x0, ln, sway) in [(330, 230, 8), (372, 150, -5)]:
    n = int(ln / 13)
    for i in range(n):
        y = -8 + i * 13
        x = x0 + sway * math.sin(i / n * math.pi * 0.5)
        if i % 2 == 0:
            m_f.ellipse(x, y, 5.0, 8.6)
        else:
            m_f.ellipse(x, y, 2.4, 8.6)
    m_f.line([(x0 + sway, -8 + n * 13), (x0 + sway * 1.1, -8 + n * 13 + 18)], 4.5)
    m_f.poly([(x0 + sway * 1.1 - 9, -8 + n * 13 + 16), (x0 + sway * 1.1 + 9, -8 + n * 13 + 16), (x0 + sway * 1.1, -8 + n * 13 + 34)])
# árvore morta na borda direita, com galhos sobre o castelo
def branch(x, y, ang, ln, w, depth):
    ex, ey = x + math.cos(ang) * ln, y + math.sin(ang) * ln
    m_f.line([(x, y), ((x + ex) / 2 + rng.normal(0, 4), (y + ey) / 2 + rng.normal(0, 4)), (ex, ey)], w)
    if depth > 0:
        for _ in range(2):
            branch(ex, ey, ang + rng.normal(0, 0.5), ln * rng.uniform(0.5, 0.72), max(1.2, w * 0.6), depth - 1)
m_f.poly([(1236, H + 5), (1248, 520), (1258, 300), (1262, 90), (1272, -10), (W + 10, -10), (W + 10, H + 5)])
m_f.poly([(1220, H + 5), (1240, 640), (1266, 600), (1290, H + 5)])  # raiz
branch(1262, 110, math.pi + 0.35, 140, 11, 4)
branch(1258, 260, math.pi - 0.2, 120, 8, 3)
branch(1264, 40, math.pi + 0.8, 90, 7, 3)
# capim alto e pedras quebradas nos cantos de baixo
for side in (-1, 1):
    x0 = 0 if side < 0 else W
    for i in range(80):
        bx = x0 - side * 340 * rng.random() ** 1.7
        reach = 1 - abs(bx - x0) / 360
        ln = rng.uniform(30, 130) * reach + 10
        ang = -math.pi / 2 + rng.normal(0, 0.3) - side * 0.15
        ex, ey = bx + math.cos(ang) * ln, H + 4 + math.sin(ang) * ln
        m_f.line([(bx, H + 4), ((bx + ex) / 2 + rng.normal(0, 4), (H + 4 + ey) / 2), (ex, ey)], rng.uniform(1.6, 3.8))
m_f.poly([(-10, H + 5), (-10, 628), (30, 606), (66, 618), (92, 660), (128, H + 5)])
fore = Layer(W, H)
fore.fill(INK, blur(m_f.array(), 2.2))
layers['fore'] = fore

rain_near = Layer(W, H)
for _ in range(500):
    x, y = rng.uniform(-40, W + 40), rng.uniform(-20, H + 20)
    rain_near.stroke(x, y, math.pi / 2 + 0.22, rng.uniform(26, 60), rng.uniform(1.2, 2.2), hexc(0xb7c3da), rng.uniform(0.18, 0.4), rng, 0.0, 0.0, taper=0.6)
layers['rain_near'] = rain_near
print('frente', round(time.time() - T0, 1))

# ---------------- composição ----------------
for k, v in layers.items():
    v.image().save(f'{OUT}/ponte-{k}.png')
comp = Layer.from_rgb(layers['sky'].color())
for k in ['far', 'castle', 'gorge', 'rain_far']:
    comp.over(layers[k])
back = Image.fromarray((np.clip(comp.color(), 0, 1) * 255 + 0.5).astype(np.uint8))
back.save(f'{OUT}/ponte-fundo-hd.png')
# fundo em pixel art na resolução do jogo
accents = [GOLD1, GOLD2, GOLD3, WIN0, WIN1]
back_px = pixelize(back, (W // 2, H // 2), 48, accents, scale=1).convert('RGBA')
game = Image.open(GAME).convert('RGBA')
frame = back_px.copy()
frame.alpha_composite(game)
# frente: silhuetas e chuva perto, reduzidas para os pixels do jogo
fr = layers['fore'].image().resize((W // 2, H // 2), Image.BOX)
frame.alpha_composite(fr)
rn = layers['rain_near'].image().resize((W // 2, H // 2), Image.BOX)
frame.alpha_composite(rn)
rgb = np.asarray(frame.convert('RGB'), np.float32) / 255
h2, w2 = rgb.shape[:2]
y2, x2 = np.mgrid[0:h2, 0:w2].astype(np.float32)
v = ((x2 - w2 / 2) / (w2 * 0.62)) ** 2 + ((y2 - h2 * 0.48) / (h2 * 0.7)) ** 2
rgb *= (1 - 0.45 * sstep(0.3, 1.2, v))[..., None]
rgb += rng.normal(0, 0.02, (h2, w2, 1)).astype(np.float32)
out = Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8))
out.resize((W, H), Image.NEAREST).save(f'{OUT}/ponte-previa.png')
print('pronto', round(time.time() - T0, 1))

"""Abertura: floresta de pinheiros na neve, a figura de capa vermelha e dois lobos.

Pintura procedural em camadas (fundo, árvores distantes, neve, pedras, lobos, árvores do meio,
rocha da frente com a figura, troncos próximos e copas). Gera as camadas separadas, para o
jogo animar com parallax e neve caindo, e uma composição completa para prévia.

A luz vem de trás da floresta, pela abertura no meio das copas: as sombras na neve saem
dos troncos e das pedras em direção à câmera, abrindo em leque a partir do centro.

uso: python3 forest.py <pasta_saida> [largura altura]
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from brush import Layer, hexc, mix, sstep, blur, value_noise, noise1d, paint, passes_std
from shapes import Mask

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
W = int(sys.argv[2]) if len(sys.argv) > 2 else 1280
H = int(sys.argv[3]) if len(sys.argv) > 3 else 720
S = W / 1280.0
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(11)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
T0 = time.time()

# paleta: azuis de inverno, ferrugem da terra e o vermelho da capa
NAVY0, NAVY1, NAVY2 = hexc(0x08121f), hexc(0x10213a), hexc(0x1b3452)
TEAL, MIDB = hexc(0x2c4f70), hexc(0x4a7194)
FOG0, FOG1, FOG2 = hexc(0x7896b0), hexc(0xa2bdd0), hexc(0xc8dae6)
SNOW_L, SNOW_M, SNOW_S, SNOW_D = hexc(0xf0f6fa), hexc(0xcadcea), hexc(0x8aa9c6), hexc(0x55789b)
RK0, RK1, RK2, RK3 = hexc(0x1e0e0d), hexc(0x3b1913), hexc(0x5a281b), hexc(0x7c3a24)
RED0, RED1, RED2, RED3 = hexc(0x2e0a0c), hexc(0x5e1517), hexc(0x8a231e), hexc(0xb2382b)
LX, LY = 620 * S, 300 * S  # de onde vem a luz (atrás das árvores)


def col_field(c):
    return np.broadcast_to(c, (H, W, 3)).astype(np.float32).copy()


def angle_field(a):
    return np.full((H, W), a, np.float32)


# linha do chão de neve ao fundo (sobe de leve para a direita)
nx = noise1d(W, 160 * S, rng, 3)
g_far = (468 - 0.03 * (np.arange(W) - W / 2) / S + 16 * (nx - 0.5)) * S


def gf(x):
    return float(g_far[int(np.clip(x, 0, W - 1))])


def shadow_poly(x, y, w, length, spread=1.8):
    """Sombra no chão saindo de (x, y), na direção oposta à luz, alargando com a perspectiva."""
    dx, dy = x - LX, y - LY
    n = math.hypot(dx, dy) + 1e-6
    dx, dy = dx / n, dy / n
    px_, py_ = -dy, dx
    return [(x - px_ * w * 0.5, y - py_ * w * 0.5), (x + px_ * w * 0.5, y + py_ * w * 0.5),
            (x + dx * length + px_ * w * spread * 0.5, y + dy * length + py_ * w * spread * 0.5),
            (x + dx * length - px_ * w * spread * 0.5, y + dy * length - py_ * w * spread * 0.5)], math.atan2(dy, dx)


layers = {}

# ---------------- céu e névoa ----------------
t = yy / H
sky = mix(NAVY2, FOG1, sstep(0.02, 0.62, t)[..., None])
glow = np.exp(-(((xx - LX) / (520 * S)) ** 2 + ((yy - LY) / (260 * S)) ** 2))
sky = mix(sky, FOG2, (glow * 0.8)[..., None])
sky = mix(sky, FOG2, sstep(0.45, 0.72, t)[..., None] * 0.6)
L = Layer(W, H)
paint(L, sky, np.ones((H, W), np.float32), angle_field(-0.42) + (value_noise(H, W, 200 * S, rng) - 0.5) * 0.5, rng,
      passes_std(1.25 * S, dry=0.12, bristle=0.2, err=(0, 0.02, 0.05, 0.9)), base=1.0)
layers['sky'] = L
print('céu', round(time.time() - T0, 1))


# ---------------- árvores distantes ----------------
def pine_tier(x, cy, span):
    """Andar de galhos de um pinheiro distante, com a base serrilhada."""
    pts = [(x + rng.uniform(-2, 2) * S, cy - span * 0.55), (x + span * 0.5, cy + span * 0.12), (x + span, cy + span * 0.42)]
    k = int(rng.integers(5, 9))
    for j in range(1, k):
        u = j / k
        pts.append((x + span - 2 * span * u, cy + span * (0.42 if j % 2 == 0 else 0.26) + rng.uniform(-2, 2) * S))
    pts += [(x - span, cy + span * 0.42), (x - span * 0.5, cy + span * 0.12)]
    return pts


m_far = Mask(W, H)
far_trunks = []
for i in range(46):
    x = rng.uniform(-20, W + 20)
    w = rng.uniform(4, 15) * S
    d = rng.uniform(0.12, 0.5)
    far_trunks.append((x, w, d))
far_trunks.sort(key=lambda a: a[2])
ref = col_field(FOG1)
flow = angle_field(math.pi / 2)
for (x, w, d) in far_trunks:
    top, bot = -10, gf(x) + 6 * S
    lean = rng.normal(0, 0.012)
    pts = [(x - w * 0.5, top), (x + w * 0.5, top), (x + w * 0.62 + lean * (bot - top), bot), (x - w * 0.62 + lean * (bot - top), bot)]
    mk = Mask(W, H).poly(pts).array()
    base = mix(FOG1, TEAL, d)
    litc = mix(base, FOG2, 0.35)
    side = sstep(x - w * 0.5, x + w * 0.1, xx) if x > LX else sstep(x + w * 0.5, x - w * 0.1, xx)
    c = mix(litc, base, side[..., None])
    c = mix(c, FOG1, sstep(bot - 160 * S, bot, yy)[..., None] * 0.45)  # névoa baixa
    ref = np.where(mk[..., None] > 0.5, c, ref)
    m_far.poly(pts)
    for k in range(int(rng.integers(4, 8))):
        cy = rng.uniform(-30, 200) * S
        span = rng.uniform(24, 62) * S * (1 - d * 0.4)
        tri = pine_tier(x, cy, span)
        tm = Mask(W, H).poly(tri).array()
        cc = mix(FOG1, TEAL, min(1.0, d * 1.25))
        cc = mix(cc, FOG1, 0.25 * sstep(260 * S, 60 * S, cy))
        ref = np.where(tm[..., None] > 0.5, cc, ref)
        m_far.poly(tri)
        flow = np.where(tm > 0.5, (0.55 if rng.random() < 0.5 else math.pi - 0.55) + rng.normal(0, 0.1), flow)
mf = m_far.array()
L = Layer(W, H)
paint(L, ref, mf, flow, rng, passes_std(0.9 * S, dry=0.35, bristle=0.4, err=(0, 0.03, 0.05, 0.08)), base=0.9)
layers['far'] = L
print('distantes', round(time.time() - T0, 1))

# posições que a neve precisa conhecer para as sombras
mid_x = [170, 262, 360, 700, 830, 960, 1060, 1150]
mid_trunks = []
for x in mid_x:
    x = x * S
    mid_trunks.append((x, rng.uniform(22, 46) * S, gf(x) + rng.uniform(18, 34) * S))
# pedras: (x, linha da base, tamanho); maiores perto da câmera, em grupos
spots = [(205, 562, 1.35), (298, 572, 0.55), (930, 580, 1.55), (1046, 594, 0.7), (1100, 702, 2.1), (168, 698, 1.7),
         (712, 541, 0.6), (430, 534, 0.45)]
rocks_geo = []
for (x, y, sz) in spots:
    x, y = x * S, y * S
    Lr = rng.uniform(95, 150) * S * sz
    hr = rng.uniform(20, 30) * S * sz
    pk = rng.uniform(0.55, 0.8)  # pico mais para a direita: rampa suave e queda íngreme
    rocks_geo.append((x, y, Lr, hr, pk))

# ---------------- neve ----------------
ground = (yy > g_far[None, :].repeat(H, 0) - 1).astype(np.float32)
lit = np.exp(-(((xx - LX) / (560 * S)) ** 2 + ((yy - 580 * S) / (170 * S)) ** 2))
undul = value_noise(H, W, 110 * S, rng, 2)
snow = mix(SNOW_M, SNOW_L, (lit * 0.95)[..., None])
snow = mix(snow, SNOW_S, (sstep(0.35, 0.8, undul) * 0.55 * (1 - lit * 0.6))[..., None])
gy = g_far[None, :].repeat(H, 0)
snow = mix(snow, FOG2, (sstep(gy + 50 * S, gy, yy) * 0.55)[..., None])  # neve distante some na névoa
corner = sstep(560 * S, 720 * S, yy) * (sstep(520 * S, 0, xx) + sstep(860 * S, W, xx))
snow = mix(snow, SNOW_D, (np.clip(corner, 0, 1) * 0.75)[..., None])
snow_flow = angle_field(-0.05) + (undul - 0.5) * 0.35
casts = [(x, b, w * 1.25, rng.uniform(380, 620) * S) for (x, w, b) in mid_trunks]
casts += [(60 * S, gf(60 * S) + 60 * S, 120 * S, 700 * S), (1225 * S, gf(1225 * S) + 60 * S, 120 * S, 700 * S)]
casts += [(x + Lr * 0.05, y - 2 * S, Lr * 0.8, Lr * 0.9) for (x, y, Lr, hr, pk) in rocks_geo]
for (x, y, w, length) in casts:
    pts, ang = shadow_poly(x, y, w, length)
    sm = blur(Mask(W, H).poly(pts).array(), 3.0 * S) * ground
    sm *= sstep(y - 4 * S, y + 10 * S, yy)  # sombra só para a frente da base
    snow = mix(snow, mix(SNOW_S, SNOW_D, 0.45), (sm * 0.75)[..., None])
    snow_flow = np.where(sm > 0.4, ang, snow_flow)
L = Layer(W, H)
paint(L, snow, ground, snow_flow, rng, passes_std(1.0 * S, dry=0.3, bristle=0.3, err=(0, 0.025, 0.04, 0.06), long=1.4),
      val_jitter=0.045, base=1.0)
# rastros de vento: sombras azuis longas e brilhos quase brancos, pincel seco
for _ in range(int(340 * S)):
    x = rng.uniform(-40, W + 40)
    y = rng.uniform(gf(x) + 14 * S, H + 10)
    d = (y - gf(x)) / (H - gf(x) + 1)
    sh = rng.random() < 0.55 + 0.3 * (1 - lit[int(min(y, H - 1)), int(np.clip(x, 0, W - 1))])
    c = mix(SNOW_S, SNOW_D, rng.uniform(0.0, 0.55)) if sh else mix(SNOW_L, hexc(0xffffff), rng.random() * 0.5)
    L.stroke(x, y, rng.uniform(-0.2, -0.02), rng.uniform(40, 190) * S * (0.5 + d), rng.uniform(2, 7) * S * (0.5 + d),
             c, rng.uniform(0.35, 0.75), rng, 0.5, 0.65, taper=0.6, clip=ground)
layers['snow'] = L
snow_rgb = L.color()
print('neve', round(time.time() - T0, 1))

# ---------------- terra e pedras à mostra ----------------
m_rock = Mask(W, H)
ref = col_field(RK1)
flow = angle_field(-0.12)
rock_info = []
for (x, y, Lr, hr, pk) in rocks_geo:
    n = 18
    top = []
    for j in range(n + 1):
        u = j / n
        e = u / pk if u <= pk else (1 - u) / (1 - pk)
        e = e ** 0.75 * (0.8 + 0.2 * rng.random())
        top.append((x - Lr / 2 + u * Lr, y - hr * e + rng.normal(0, 1.0) * S))
    pts = top + [(x + Lr / 2, y + 6 * S), (x - Lr / 2, y + 6 * S)]
    mk = Mask(W, H).poly(pts).array()
    tx = np.array([p[0] for p in top])
    ty = np.array([p[1] for p in top])
    ridge_y = np.interp(xx, tx, ty)
    depth = np.clip((yy - ridge_y) / (hr + 1e-3), 0, 1)
    xp = x - Lr / 2 + pk * Lr
    face = sstep(xp - 4 * S, xp + 6 * S, xx)  # face íngreme virada para a câmera, na sombra
    cc = mix(mix(RK3, RK2, sstep(0.0, 0.3, depth)[..., None]), RK0, sstep(0.25, 1.0, depth)[..., None])
    cc = mix(cc, mix(RK0, NAVY1, 0.45), (face * 0.7)[..., None])
    cc = mix(cc, mix(RK1, SNOW_D, 0.35), (sstep(0.55, 1.0, depth) * 0.5)[..., None])  # luz fria refletida da neve
    ref = np.where(mk[..., None] > 0.3, cc, ref)
    slope = np.where(xx < xp, -math.atan2(hr, pk * Lr), math.atan2(hr, (1 - pk) * Lr))
    flow = np.where(mk > 0.3, slope + 0.25 * np.sin(yy * 0.08), flow)
    m_rock.poly(pts)
    rock_info.append((x, y, Lr, hr, pk, top))
mr = m_rock.array()
L = Layer(W, H)
paint(L, ref, mr, flow, rng, passes_std(0.42 * S, dry=0.6, bristle=0.55, err=(0, 0.03, 0.045, 0.06), long=1.3),
      val_jitter=0.06, base=0.95)
for (x, y, Lr, hr, pk, top) in rock_info:
    # neve fina assentada na rampa suave
    xp = x - Lr / 2 + pk * Lr
    for j in range(len(top) - 1):
        (x0, y0), (x1, y1) = top[j], top[j + 1]
        if x1 > xp - 6 * S:
            break
        if rng.random() < 0.35:
            continue
        a = math.atan2(y1 - y0, x1 - x0)
        L.stroke((x0 + x1) / 2, (y0 + y1) / 2 + 1.5 * S, a, math.hypot(x1 - x0, y1 - y0) * rng.uniform(1.2, 2.2),
                 rng.uniform(2.0, 3.6) * S * min(1.5, Lr / (120 * S)), mix(SNOW_S, SNOW_M, rng.random() ** 0.7), 0.75, rng, 0.4, 0.5,
                 taper=0.7)
    # montes de neve cobrindo a base, com a cor da neve em volta
    for _ in range(int(10 * Lr / (100 * S))):
        bx = x + rng.uniform(-0.55, 0.55) * Lr
        by = y + rng.uniform(-2, 5) * S
        sc = snow_rgb[int(np.clip(by + 10 * S, 0, H - 1)), int(np.clip(bx, 0, W - 1))] * rng.uniform(0.96, 1.03)
        L.stroke(bx, by, rng.uniform(-0.12, 0.06), rng.uniform(24, 60) * S, rng.uniform(5, 11) * S, np.clip(sc, 0, 1), 0.9, rng, 0.3, 0.35)
layers['rocks'] = L
print('pedras', round(time.time() - T0, 1))


# ---------------- lobos ----------------
def wolf(m, x, y, s, face=-1):
    """Silhueta de lobo parado de perfil; face=-1 olha para a esquerda. (x, y) = chão."""
    f = -1 if face < 0 else 1
    P = lambda px, py: (x + f * px * s, y + py * s)
    m.ellipse(*P(0, -38), 33 * s, 13 * s)
    m.ellipse(*P(23, -41), 16 * s, 17 * s)
    m.ellipse(*P(-23, -40), 15 * s, 14 * s)
    m.poly([P(16, -54), P(38, -64), P(46, -54), P(30, -36)])
    m.ellipse(*P(48, -61), 11 * s, 9 * s)
    m.poly([P(54, -67), P(71, -61), P(70, -56), P(55, -54)])
    m.poly([P(43, -68), P(42, -82), P(50, -70)])
    m.poly([P(48, -69), P(52, -81), P(55, -68)])
    m.line([P(27, -32), P(28, -12), P(29, 0)], 6.5 * s)
    m.line([P(17, -32), P(15, -12), P(15, 0)], 5.5 * s)
    m.line([P(-20, -38), P(-27, -17), P(-22, 0)], 8.0 * s)
    m.line([P(-28, -36), P(-35, -15), P(-31, 0)], 6.5 * s)
    m.line([P(-35, -45), P(-48, -33), P(-52, -16)], 8.5 * s)
    m.line([P(-50, -26), P(-53, -12)], 5.5 * s)
    for j in range(5):
        m.poly([P(-12 + j * 7, -27), P(-9 + j * 7, -20), P(-5 + j * 7, -27)])


m_w = Mask(W, H)
wolves = [(762 * S, gf(762 * S) + 33 * S, 0.62 * S, -1), (884 * S, gf(884 * S) + 26 * S, 0.55 * S, -1)]
for (x, y, s, f) in wolves:
    wolf(m_w, x, y, s, f)
mw = m_w.array()
wc = mix(NAVY0, NAVY1, 0.7)
ref = col_field(wc)
for (x, y, s, f) in wolves:
    # contraluz fraca no dorso e na cabeça (o céu claro atrás)
    back = sstep(y - 44 * s, y - 52 * s, yy) * (np.abs(xx - x) < 60 * s)
    ref = mix(ref, mix(TEAL, MIDB, 0.5), (back * 0.55)[..., None])
L = Layer(W, H)
paint(L, ref, mw, angle_field(0.0), rng, passes_std(0.28 * S, dry=0.2, bristle=0.3, err=(0, 0.02, 0.03, 0.05)), base=1.0)
for (x, y, s, f) in wolves:
    L.dab(x + f * 52 * s, y - 63 * s, 1.1 * S, hexc(0xd9e4c8), 0.9, 0.5)  # olhos claros, quase apagados
layers['wolves'] = L
print('lobos', round(time.time() - T0, 1))

# ---------------- árvores do meio ----------------
m_mid = Mask(W, H)
ref = col_field(TEAL)
flow = angle_field(math.pi / 2)
for (x, w, bot) in mid_trunks:
    pts = [(x - w * 0.42, -20), (x + w * 0.42, -20), (x + w * 0.52, bot - 30 * S), (x + w * 0.85, bot), (x - w * 0.85, bot),
           (x - w * 0.52, bot - 30 * S)]
    mk = Mask(W, H).poly(pts).array()
    # contraluz: o lado virado para a luz ganha uma borda clara, o resto fica no meio-tom
    toward = 1 if x < LX else -1
    u = (xx - x) / (w * 0.5) * toward  # 1 = borda virada para a luz
    shade = mix(NAVY1, TEAL, 0.45)
    c = mix(shade, mix(TEAL, MIDB, 0.6), sstep(-0.2, 0.55, u)[..., None])
    c = mix(c, mix(FOG0, FOG1, 0.4), (sstep(0.62, 0.92, u) * 0.85)[..., None])
    c = mix(c, FOG1, (sstep(bot - 140 * S, bot, yy) * 0.22)[..., None])
    ref = np.where(mk[..., None] > 0.4, c, ref)
    m_mid.poly(pts)
mm = m_mid.array()
L = Layer(W, H)
paint(L, ref, mm, flow, rng, passes_std(0.75 * S, dry=0.55, bristle=0.55, err=(0, 0.03, 0.045, 0.07), long=1.6), base=0.95)
# casca: pinceladas secas verticais
for _ in range(int(900 * S)):
    x = rng.uniform(0, W)
    y = rng.uniform(0, H)
    if mm[int(y), int(x)] < 0.6:
        continue
    c = L.color()[int(y), int(x)]
    c2 = np.clip(c * rng.uniform(0.75, 1.25), 0, 1)
    L.stroke(x, y, math.pi / 2 + rng.normal(0, 0.04), rng.uniform(30, 120) * S, rng.uniform(1.5, 4) * S, c2, 0.7, rng, 0.5, 0.6, clip=mm)
# neve acumulada no pé de cada tronco
for (x, w, bot) in mid_trunks:
    for _ in range(9):
        bx = x + rng.uniform(-1.0, 1.0) * w
        sc = snow_rgb[int(np.clip(bot + 6 * S, 0, H - 1)), int(np.clip(bx, 0, W - 1))]
        L.stroke(bx, bot - rng.uniform(0, 5) * S, rng.uniform(-0.15, 0.15), rng.uniform(12, 30) * S, rng.uniform(4, 8) * S,
                 np.clip(sc * rng.uniform(0.97, 1.04), 0, 1), 0.9, rng, 0.3, 0.3)
layers['mid'] = L
print('meio', round(time.time() - T0, 1))

# ---------------- rocha da frente e a figura ----------------
rock_pts = [(300, H + 5), (316, 676), (350, 654), (420, 645), (520, 641), (610, 643), (700, 650), (782, 663), (848, 686), (880, H + 5)]
rock_pts = [(x * S, y * S if y < H else y) for x, y in rock_pts]
mrk = Mask(W, H).poly(rock_pts).array()
ridge = np.interp(xx[0], [p[0] for p in rock_pts[1:-1]], [p[1] for p in rock_pts[1:-1]])
ry = ridge[None, :].repeat(H, 0)
ref = mix(mix(NAVY1, TEAL, 0.55), NAVY0, sstep(ry + 10 * S, ry + 75 * S, yy)[..., None])
capn = value_noise(H, W, 26 * S, rng, 2)
capm = mrk * sstep(ry + 30 * S * (0.6 + 0.6 * capn), ry + 14 * S, yy)
cap_c = mix(mix(SNOW_M, SNOW_L, 0.55), SNOW_S, sstep(ry + 4 * S, ry + 30 * S, yy)[..., None])
ref = mix(ref, cap_c, capm[..., None])
flow = angle_field(-0.35) + (value_noise(H, W, 60 * S, rng) - 0.5) * 0.6
flow = np.where(capm > 0.5, -0.03, flow)
# sombra da figura na neve de cima da pedra, vindo para a frente
fx, fy = 548 * S, 640 * S
k = 0.84 * S
spts, sang = shadow_poly(fx + 2 * S, fy + 1 * S, 34 * k, 70 * S, spread=1.3)
fsh = blur(Mask(W, H).poly(spts).array(), 2.0 * S) * mrk
ref = mix(ref, mix(SNOW_S, SNOW_D, 0.6), (fsh * capm * 0.8)[..., None])
L = Layer(W, H)
paint(L, ref, mrk, flow, rng, passes_std(0.8 * S, dry=0.45, bristle=0.45, err=(0, 0.03, 0.045, 0.06), long=1.2), val_jitter=0.05, base=1.0)
layers['rock'] = L

# figura de capa vermelha, de costas
m_c = Mask(W, H)
cloak = [(-25, -133), (-34, -104), (-41, -62), (-48, -22), (-52, -13), (-33, -9), (-12, -12), (8, -8), (28, -12), (47, -15), (66, -19),
         (50, -40), (40, -78), (31, -115), (23, -134)]
m_c.poly([(fx + x * k, fy + y * k) for x, y in cloak])
m_c.ellipse(fx, fy - 151 * k, 23 * k, 25 * k)
m_c.poly([(fx - 15 * k, fy - 166 * k), (fx + 4 * k, fy - 181 * k), (fx + 17 * k, fy - 163 * k)])
mc = m_c.array()
m_l = Mask(W, H)
m_l.poly([(fx - 15 * k, fy - 12 * k), (fx - 5 * k, fy - 12 * k), (fx - 6 * k, fy), (fx - 17 * k, fy)])
m_l.poly([(fx + 6 * k, fy - 11 * k), (fx + 15 * k, fy - 11 * k), (fx + 17 * k, fy), (fx + 5 * k, fy)])
ml = m_l.array()
side = sstep(fx - 40 * k, fx + 30 * k, xx)
ref = mix(mix(RED2, RED3, sstep(fx - 20 * k, fx - 48 * k, xx)[..., None]), RED0, (side * 0.85)[..., None])
ref = mix(ref, RED3, (sstep(fy - 140 * k, fy - 175 * k, yy) * sstep(fx + 10 * k, fx - 16 * k, xx) * 0.7)[..., None])
ref = mix(ref, RED0, (sstep(fy - 40 * k, fy - 8 * k, yy) * 0.35)[..., None])
flow = angle_field(math.pi / 2 + 0.06) + (xx - fx) / (900 * S)
L = Layer(W, H)
paint(L, ref, mc, flow, rng, passes_std(0.32 * S, dry=0.25, bristle=0.35, err=(0, 0.02, 0.03, 0.04), long=1.4), base=1.0)
for i in range(10):  # dobras do tecido
    x0 = fx + rng.uniform(-36, 40) * k
    L.stroke(x0, fy - rng.uniform(40, 80) * k, math.pi / 2 + (x0 - fx) / (260 * S), rng.uniform(40, 90) * k, rng.uniform(2, 4) * k,
             RED0 if rng.random() < 0.7 else RED2, 0.55, rng, 0.4, 0.5, clip=mc)
# contraluz: a borda direita e o alto do capuz pegam a luz do fundo
edge_c = (mc > 0.5) & (np.roll(mc, -int(3 * S) - 1, 1) < 0.5)
ey, ex = np.nonzero(edge_c)
for j in rng.choice(len(ex), size=min(len(ex), 70), replace=False):
    L.stroke(float(ex[j]) - 1.0 * S, float(ey[j]), math.pi / 2 + 0.12, rng.uniform(6, 16) * S, rng.uniform(1.2, 2.2) * S,
             mix(RED3, hexc(0xe8a08a), 0.35), 0.7, rng, 0.3, 0.3, clip=mc)
L.fill(mix(RED0, NAVY0, 0.6), ml)
layers['figure'] = L
print('figura', round(time.time() - T0, 1))

# ---------------- troncos próximos ----------------
m_n = Mask(W, H)
m_n.poly([(-30, -10), (92 * S, -10), (104 * S, 560 * S), (128 * S, H + 5), (-30, H + 5)])
m_n.poly([(1182 * S, -10), (W + 30, -10), (W + 30, H + 5), (1158 * S, H + 5), (1172 * S, 600 * S)])
mn = m_n.array()
ref = mix(NAVY0, NAVY1, value_noise(H, W, 40 * S, rng, 2)[..., None] * 0.9)
edge_l = sstep(70 * S, 112 * S, xx) * sstep(140 * S, 100 * S, xx)
edge_r = sstep(1210 * S, 1170 * S, xx) * sstep(1140 * S, 1180 * S, xx)
ref = mix(ref, mix(TEAL, MIDB, 0.4), ((edge_l + edge_r) * 0.55)[..., None])
L = Layer(W, H)
paint(L, ref, mn, angle_field(math.pi / 2), rng, passes_std(0.9 * S, dry=0.6, bristle=0.6, err=(0, 0.03, 0.045, 0.07), long=1.8), base=1.0)
layers['near'] = L
print('troncos', round(time.time() - T0, 1))


# ---------------- copas por cima ----------------
def bough(ax, ay, d, Lb, h0, droop, far=0.0):
    """Galho de pinheiro saindo de (ax, ay) para o lado d (+1 direita, -1 esquerda)."""
    n = max(24, int(Lb / (4 * S)))
    ts = np.linspace(0, 1, n)
    cx = ax + d * ts * Lb
    cy = ay + droop * Lb * ts ** 1.6
    h = h0 * (1 - ts) ** 0.55 + 4 * S
    top = cy - h * 0.5 + rng.normal(0, 1.2, n) * S
    bot = cy + h * (0.75 + 0.45 * noise1d(n, 3, rng, 1)) + rng.normal(0, 1.5, n) * S
    tip = (cx[-1] + d * 8 * S, cy[-1] + 6 * S)
    pts = list(zip(cx, top)) + [tip] + list(zip(cx[::-1], bot[::-1]))
    return dict(pts=pts, cx=cx, top=top, bot=bot, d=d, Lb=Lb, ang=math.atan2(droop, d), far=far)


boughs = []
for i in range(16):  # massa fechada acima do quadro
    ax = rng.uniform(-80, W + 80)
    boughs.append(bough(ax, rng.uniform(-70, -15) * S, 1 if rng.random() < 0.5 else -1, rng.uniform(260, 460) * S,
                        rng.uniform(50, 80) * S, rng.uniform(0.04, 0.16), far=0.3))
for (x, w, bot) in mid_trunks:  # galhos baixos das árvores do meio (mais longe, mais névoa)
    if rng.random() < 0.25:
        continue
    for j in range(int(rng.integers(1, 3))):
        ay = rng.uniform(70, 165) * S
        for d in (-1, 1):
            if rng.random() < 0.35:
                continue
            boughs.append(bough(x, ay + rng.uniform(-6, 6) * S, d, rng.uniform(70, 135) * S, rng.uniform(14, 24) * S,
                                rng.uniform(0.12, 0.3), far=0.6))
rows_l = [(-30, 520, 70), (22, 470, 62), (78, 400, 54), (134, 320, 46), (190, 240, 38), (246, 165, 30)]
rows_r = [(-26, 500, 70), (30, 450, 62), (86, 390, 54), (142, 310, 46), (198, 230, 38), (252, 150, 30)]
for (ay, lb, h0) in rows_l:
    boughs.append(bough(84 * S, ay * S + rng.uniform(-6, 6) * S, 1, lb * S * rng.uniform(0.9, 1.08), h0 * S, rng.uniform(0.1, 0.22)))
for (ay, lb, h0) in rows_r:
    boughs.append(bough(1190 * S, ay * S + rng.uniform(-6, 6) * S, -1, lb * S * rng.uniform(0.9, 1.08), h0 * S, rng.uniform(0.1, 0.22)))
m_all = Mask(W, H)
m_all.poly([(-30, -30), (W + 30, -30), (W + 30, 6 * S), (-30, 6 * S)])
ref = col_field(NAVY0)
flow = angle_field(0.6)
for b in boughs:
    mk = Mask(W, H).poly(b['pts']).array()
    o = np.argsort(b['cx'])
    tp = np.interp(xx, b['cx'][o], b['top'][o])
    bt = np.interp(xx, b['cx'][o], b['bot'][o])
    s_ = np.clip((yy - tp) / np.maximum(bt - tp, 1), 0, 1)
    near = math.exp(-((float(np.mean(b['cx'])) - LX) / (420 * S)) ** 2)  # perto da abertura recebe mais luz
    b['near'] = near
    litc = mix(mix(NAVY2, TEAL, 0.55), mix(TEAL, MIDB, 0.7), near)
    darkc = mix(NAVY0, NAVY1, 0.5)
    litc, darkc = mix(litc, FOG0, b['far'] * 0.35), mix(darkc, TEAL, b['far'] * 0.45)
    c = mix(litc, darkc, sstep(0.05, 0.85, s_)[..., None])
    sel = mk > 0.5
    ref = np.where(sel[..., None], c, ref)
    flow = np.where(sel, b['ang'] + b['d'] * 0.45, flow)
    m_all.poly(b['pts'])
mcn = m_all.array()
L = Layer(W, H)
paint(L, ref, mcn, flow + (value_noise(H, W, 30 * S, rng) - 0.5) * 0.5, rng,
      passes_std(0.8 * S, dry=0.6, bristle=0.55, err=(0, 0.03, 0.045, 0.07), long=1.4), val_jitter=0.05, base=0.95)
for b in boughs:
    d, Lb, cx, top, bot = b['d'], b['Lb'], b['cx'], b['top'], b['bot']
    n = len(cx)
    darkc = mix(mix(NAVY0, NAVY1, 0.5), TEAL, b['far'] * 0.45)
    # agulhas pendendo na borda de baixo, inclinadas para a ponta do galho
    for _ in range(int(Lb / (3.2 * S))):
        i = int(rng.integers(0, n))
        tt = i / (n - 1)
        a = math.pi / 2 - d * rng.uniform(0.3, 0.75)
        ln = rng.uniform(8, 26) * S * (1 - 0.5 * tt)
        L.stroke(cx[i] + math.cos(a) * ln * 0.3, bot[i] + math.sin(a) * ln * 0.3 - 2 * S, a, ln, rng.uniform(1.4, 3.0) * S,
                 np.clip(darkc * rng.uniform(0.8, 1.25), 0, 1), 0.9, rng, 0.3, 0.4, taper=0.85)
    # luz e neve no alto do galho
    for _ in range(int(Lb / (6.5 * S))):
        i = int(rng.integers(0, n))
        y = top[i] + rng.uniform(0.05, 0.3) * (bot[i] - top[i])
        snowy = rng.random() < 0.3 + 0.35 * b['near']
        r = rng.random()
        c = mix(FOG1, SNOW_M, r) if snowy else mix(TEAL, MIDB, r * (0.5 + 0.5 * b['near']))
        c = mix(c, FOG0, b['far'] * 0.3)
        L.stroke(cx[i], y, b['ang'] + d * 0.12 + rng.normal(0, 0.15), rng.uniform(14, 46) * S, rng.uniform(1.8, 4.2) * S,
                 c, 0.72, rng, 0.45, 0.55, taper=0.7)
layers['canopy'] = L
print('copas', round(time.time() - T0, 1))

# ---------------- feixes de luz ----------------
beams = Layer(W, H)
for (ang, wtop, wbot, a) in [(-0.36, 26, 150, 0.09), (-0.16, 34, 190, 0.13), (0.06, 30, 170, 0.11), (0.25, 22, 130, 0.08)]:
    x0, y0 = LX - 10 * S, -40 * S
    Lb = H * 1.25
    dx, dy = math.sin(ang), math.cos(ang)
    px_, py_ = dy, -dx
    pts = [(x0 - px_ * wtop * S, y0 - py_ * wtop * S), (x0 + px_ * wtop * S, y0 + py_ * wtop * S),
           (x0 + dx * Lb + px_ * wbot * S, y0 + dy * Lb + py_ * wbot * S), (x0 + dx * Lb - px_ * wbot * S, y0 + dy * Lb - py_ * wbot * S)]
    mk = blur(Mask(W, H).poly(pts).array(), 16 * S) * sstep(H * 0.98, H * 0.3, yy)
    beams.fill(FOG2, mk * a)
layers['beams'] = beams

# ---------------- salvar camadas e composição ----------------
order = ['sky', 'far', 'snow', 'rocks', 'wolves', 'mid', 'rock', 'figure', 'near', 'canopy']
for k_ in order + ['beams']:
    layers[k_].image().save(f'{OUT}/floresta-{k_}.png')
comp = Layer.from_rgb(layers['sky'].color())
for k_ in order[1:]:
    comp.over(layers[k_])
comp.P += layers['beams'].P * 1.0  # a luz soma por cima
# neve caindo (na prévia; no jogo ela é animada)
snowf = Layer(W, H)
for _ in range(int(380 * S)):
    z = rng.random() ** 1.6
    r = (0.6 + 2.8 * z) * S
    x, y = rng.uniform(0, W), rng.uniform(0, H)
    snowf.stroke(x, y, 1.25 + rng.normal(0, 0.08), r * (2.0 + 1.6 * z), r * 1.7, mix(SNOW_M, SNOW_L, 0.5 + 0.5 * z), 0.45 + 0.45 * z, rng,
                 0.0, 0.0, 0.6, soft=0.9 + r * 0.35)
comp.over(snowf)
rgb = np.clip(comp.color(), 0, 1)
# vinheta e grão leve
v = ((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H * 0.48) / (H * 0.7)) ** 2
rgb *= (1 - 0.32 * sstep(0.35, 1.25, v))[..., None]
rgb += (rng.normal(0, 0.012, (H, W, 1))).astype(np.float32)
Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)).save(f'{OUT}/floresta-previa.png')
print('pronto', round(time.time() - T0, 1))

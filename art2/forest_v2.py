"""Abertura: floresta de pinheiros na neve, a figura de capa vermelha e dois lobos.

Pintura procedural em camadas (fundo, árvores distantes, neve, pedras, lobos, árvores do meio,
rocha da frente com a figura, troncos próximos e copas). Gera as camadas separadas, para o
jogo animar com parallax e neve caindo, e uma composição completa para prévia.

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
RUST0, RUST1, RUST2 = hexc(0x341410), hexc(0x632819), hexc(0x8e3d25)
RED0, RED1, RED2, RED3 = hexc(0x2e0a0c), hexc(0x5e1517), hexc(0x8a231e), hexc(0xb2382b)


def col_field(c):
    return np.broadcast_to(c, (H, W, 3)).astype(np.float32).copy()


def angle_field(a):
    return np.full((H, W), a, np.float32)


# linha do chão de neve ao fundo (sobe de leve para a direita)
nx = noise1d(W, 160 * S, rng, 3)
g_far = (468 - 0.03 * (np.arange(W) - W / 2) / S + 16 * (nx - 0.5)) * S


def gf(x):
    return float(g_far[int(np.clip(x, 0, W - 1))])


layers = {}

# ---------------- céu e névoa ----------------
t = yy / H
sky = mix(NAVY2, FOG1, sstep(0.02, 0.62, t)[..., None])
glow = np.exp(-(((xx - 560 * S) / (520 * S)) ** 2 + ((yy - 300 * S) / (260 * S)) ** 2))
sky = mix(sky, FOG2, (glow * 0.75)[..., None])
sky = mix(sky, FOG2, sstep(0.45, 0.72, t)[..., None] * 0.6)
L = Layer(W, H)
paint(L, sky, np.ones((H, W), np.float32), angle_field(-0.42) + (value_noise(H, W, 200 * S, rng) - 0.5) * 0.5, rng,
      passes_std(1.25 * S, dry=0.12, bristle=0.2, err=(0, 0.02, 0.05, 0.9)), base=1.0)
layers['sky'] = L
print('céu', round(time.time() - T0, 1))

# ---------------- árvores distantes ----------------
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
    pts = [(x - w * 0.5 + lean * 0, top), (x + w * 0.5, top), (x + w * 0.62 + lean * (bot - top), bot), (x - w * 0.62 + lean * (bot - top), bot)]
    mk = Mask(W, H).poly(pts).array()
    base = mix(FOG1, TEAL, d)
    lit = mix(base, FOG2, 0.35)
    side = sstep(x - w * 0.5, x + w * 0.1, xx)
    c = mix(lit, base, side[..., None])
    c = mix(c, FOG1, sstep(bot - 160 * S, bot, yy)[..., None] * 0.45)  # névoa baixa
    ref = np.where(mk[..., None] > 0.5, c, ref)
    m_far.poly(pts)
    # copas altas em camadas (pinheiro)
    tiers = rng.integers(4, 8)
    for k in range(tiers):
        cy = rng.uniform(-30, 210) * S
        span = rng.uniform(26, 70) * S * (1 - d * 0.4)
        tri = [(x, cy - span * 0.6), (x + span, cy + span * 0.45 + rng.uniform(0, 14) * S), (x + span * 0.3, cy + span * 0.32),
               (x - span * 0.3, cy + span * 0.36), (x - span, cy + span * 0.45 + rng.uniform(0, 14) * S)]
        tm = Mask(W, H).poly(tri).array()
        cc = mix(mix(FOG1, TEAL, d * 1.15), FOG2, 0.12 + 0.2 * rng.random())
        ref = np.where(tm[..., None] > 0.5, cc, ref)
        m_far.poly(tri)
        flow = np.where(tm > 0.5, (0.55 if rng.random() < 0.5 else math.pi - 0.55) + rng.normal(0, 0.1), flow)
mf = m_far.array()
L = Layer(W, H)
paint(L, ref, mf, flow, rng, passes_std(0.9 * S, dry=0.35, bristle=0.4, err=(0, 0.03, 0.05, 0.08)), base=0.9)
layers['far'] = L
print('distantes', round(time.time() - T0, 1))

# ---------------- neve ----------------
ground = (yy > g_far[None, :].repeat(H, 0) - 1).astype(np.float32)
lit = np.exp(-(((xx - 660 * S) / (620 * S)) ** 2 + ((yy - 560 * S) / (150 * S)) ** 2))
undul = value_noise(H, W, 110 * S, rng, 2)
snow = mix(SNOW_M, SNOW_L, (lit * 0.95)[..., None])
snow = mix(snow, SNOW_S, (sstep(0.35, 0.8, undul) * 0.55 * (1 - lit * 0.6))[..., None])
gy = g_far[None, :].repeat(H, 0)
snow = mix(snow, FOG2, (sstep(gy + 50 * S, gy, yy) * 0.55)[..., None])  # neve distante some na névoa
# cantos de baixo na sombra
corner = sstep(560 * S, 720 * S, yy) * (sstep(520 * S, 0, xx) + sstep(860 * S, W, xx))
snow = mix(snow, SNOW_D, (np.clip(corner, 0, 1) * 0.75)[..., None])
snow_flow = angle_field(-0.05) + (undul - 0.5) * 0.35
shadow_trunks = []  # sombras projetadas dos troncos do meio e da frente
mid_x = [170, 262, 360, 700, 830, 960, 1060, 1150]
for x in mid_x:
    shadow_trunks.append((x * S, rng.uniform(22, 46) * S))
for (x, w) in shadow_trunks + [(40 * S, 110 * S), (1235 * S, 110 * S)]:
    g0 = gf(x) + 24 * S
    ang = math.radians(rng.uniform(12, 20))
    Ls = rng.uniform(420, 720) * S
    dxv, dyv = math.cos(ang), math.sin(ang)
    px_, py_ = -dyv, dxv
    ww = w * 1.25
    pts = [(x - px_ * ww * 0.5, g0 - py_ * ww * 0.5), (x + px_ * ww * 0.5, g0 + py_ * ww * 0.5),
           (x + dxv * Ls + px_ * ww * 0.9, g0 + dyv * Ls + py_ * ww * 0.9), (x + dxv * Ls - px_ * ww * 0.9, g0 + dyv * Ls - py_ * ww * 0.9)]
    sm = blur(Mask(W, H).poly(pts).array(), 2.5 * S) * ground
    snow = mix(snow, mix(SNOW_S, SNOW_D, 0.35), (sm * 0.7)[..., None])
    snow_flow = np.where(sm > 0.4, ang, snow_flow)
L = Layer(W, H)
paint(L, snow, ground, snow_flow, rng, passes_std(1.0 * S, dry=0.3, bristle=0.3, err=(0, 0.025, 0.04, 0.06), long=1.4), base=1.0)
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
print('neve', round(time.time() - T0, 1))

# ---------------- terra e pedras à mostra ----------------
RK0, RK1, RK2, RK3 = hexc(0x2a120e), hexc(0x4e2117), hexc(0x74311f), hexc(0x95472c)
m_rock = Mask(W, H)
ref = col_field(RK1)
flow = angle_field(-0.12)
# (x, linha da base, tamanho): pedras em cunha saindo da neve, maiores perto da câmera
spots = [(232, 556, 1.0), (418, 604, 0.85), (905, 566, 1.15), (1032, 618, 1.0), (1118, 546, 0.7), (752, 530, 0.55),
         (318, 668, 1.35), (1000, 702, 1.45), (1205, 664, 1.0), (150, 622, 0.9), (520, 534, 0.5), (688, 594, 0.75)]
rock_info = []
for (x, y, sz) in spots:
    x, y = x * S, y * S
    Lr = rng.uniform(80, 150) * S * sz
    hr = rng.uniform(20, 34) * S * sz
    pk = rng.uniform(0.55, 0.82)  # pico mais para a direita: rampa suave e queda íngreme
    n = 16
    top = []
    for j in range(n + 1):
        t = j / n
        e = t / pk if t <= pk else (1 - t) / (1 - pk)
        e = e ** 0.8 * (0.82 + 0.18 * rng.random())
        top.append((x - Lr / 2 + t * Lr, y - hr * e + rng.normal(0, 1.2) * S))
    pts = top + [(x + Lr / 2, y + 6 * S), (x - Lr / 2, y + 6 * S)]
    mk = Mask(W, H).poly(pts).array()
    tx = np.array([p[0] for p in top])
    ty = np.array([p[1] for p in top])
    ridge_y = np.interp(xx, tx, ty)
    depth = np.clip((yy - ridge_y) / (hr + 1e-3), 0, 1)
    face = sstep(x - Lr / 2 + pk * Lr - 4 * S, x - Lr / 2 + pk * Lr + 6 * S, xx)  # face íngreme na sombra
    cc = mix(mix(RK3, RK2, sstep(0.0, 0.35, depth)[..., None]), RK0, sstep(0.3, 1.0, depth)[..., None])
    cc = mix(cc, mix(RK0, NAVY1, 0.3), (face * 0.75)[..., None])
    ref = np.where(mk[..., None] > 0.3, cc, ref)
    slope = np.where(xx < x - Lr / 2 + pk * Lr, -math.atan2(hr, pk * Lr), math.atan2(hr, (1 - pk) * Lr))
    flow = np.where(mk > 0.3, slope + 0.25 * np.sin(yy * 0.08), flow)
    m_rock.poly(pts)
    rock_info.append((x, y, Lr, hr, pk, top))
mr = m_rock.array()
snow_rgb = layers['snow'].color()
L = Layer(W, H)
paint(L, ref, mr, flow, rng, passes_std(0.42 * S, dry=0.6, bristle=0.55, err=(0, 0.03, 0.045, 0.06), long=1.3), base=0.95)
# neve assentada na rampa suave e montes de neve cobrindo a base
for (x, y, Lr, hr, pk, top) in rock_info:
    for j in range(len(top) - 1):
        (x0, y0), (x1, y1) = top[j], top[j + 1]
        if x0 > x - Lr / 2 + pk * Lr - 2 * S:
            break
        if rng.random() < 0.25:
            continue
        a = math.atan2(y1 - y0, x1 - x0)
        L.stroke((x0 + x1) / 2, (y0 + y1) / 2 + 2.5 * S, a, math.hypot(x1 - x0, y1 - y0) * rng.uniform(1.1, 1.8),
                 rng.uniform(3, 6) * S * min(1.3, Lr / (110 * S)), mix(SNOW_M, SNOW_L, rng.random() ** 0.5), 0.85, rng, 0.35, 0.4)
    for _ in range(int(9 * Lr / (100 * S))):
        bx = x + rng.uniform(-0.55, 0.55) * Lr
        by = y + rng.uniform(-3, 4) * S
        sc = snow_rgb[int(np.clip(by + 8 * S, 0, H - 1)), int(np.clip(bx, 0, W - 1))] * rng.uniform(0.96, 1.03)
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
wolves = [(792 * S, gf(792 * S) + 34 * S, 0.62 * S, -1), (884 * S, gf(884 * S) + 27 * S, 0.55 * S, -1)]
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
# olhos claros, quase apagados
for (x, y, s, f) in wolves:
    L.dab(x + f * 52 * s, y - 63 * s, 1.1 * S, hexc(0xd9e4c8), 0.9, 0.5)
layers['wolves'] = L
print('lobos', round(time.time() - T0, 1))

# ---------------- árvores do meio ----------------
m_mid = Mask(W, H)
ref = col_field(TEAL)
flow = angle_field(math.pi / 2)
for x in mid_x:
    x = x * S
    w = rng.uniform(22, 46) * S
    bot = gf(x) + rng.uniform(18, 34) * S
    pts = [(x - w * 0.46, -20), (x + w * 0.46, -20), (x + w * 0.55, bot - 30 * S), (x + w * 0.85, bot), (x - w * 0.85, bot), (x - w * 0.55, bot - 30 * S)]
    mk = Mask(W, H).poly(pts).array()
    side = sstep(x - w * 0.5, x + w * 0.05, xx)
    shade = mix(NAVY1, TEAL, 0.35)
    litc = mix(TEAL, MIDB, 0.75)
    c = mix(litc, shade, side[..., None])
    c = mix(c, FOG1, (sstep(bot - 140 * S, bot, yy) * 0.25)[..., None])
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
layers['mid'] = L
print('meio', round(time.time() - T0, 1))

# ---------------- rocha da frente e a figura ----------------
rock_pts = [(300, H + 5), (322, 668), (380, 646), (450, 634), (530, 641), (610, 636), (690, 648), (770, 664), (840, 690), (880, H + 5)]
rock_pts = [(x * S, y * S if y < H else y) for x, y in rock_pts]
m_r = Mask(W, H).poly(rock_pts)
mrk = m_r.array()
ridge = np.interp(xx[0], [p[0] for p in rock_pts[1:-1]], [p[1] for p in rock_pts[1:-1]])
ry = ridge[None, :].repeat(H, 0)
ref = mix(mix(NAVY1, MIDB, 0.35), NAVY0, sstep(ry, ry + 70 * S, yy)[..., None])
capm = mrk * sstep(ry + 16 * S, ry + 6 * S, yy) * (value_noise(H, W, 30 * S, rng) > 0.35)
ref = mix(ref, mix(SNOW_M, SNOW_L, 0.5), capm[..., None])
flow = angle_field(-0.35) + (value_noise(H, W, 60 * S, rng) - 0.5) * 0.6
flow = np.where(capm > 0.5, -0.05, flow)
L = Layer(W, H)
paint(L, ref, mrk, flow, rng, passes_std(0.8 * S, dry=0.45, bristle=0.45, err=(0, 0.03, 0.045, 0.06), long=1.2), base=1.0)
layers['rock'] = L

# figura de capa vermelha, de costas
fx, fy = 548 * S, 640 * S
k = 0.84 * S
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
# dobras do tecido
for i in range(10):
    x0 = fx + rng.uniform(-36, 40) * k
    L.stroke(x0, fy - rng.uniform(40, 80) * k, math.pi / 2 + (x0 - fx) / (260 * S), rng.uniform(40, 90) * k, rng.uniform(2, 4) * k,
             RED0 if rng.random() < 0.7 else RED2, 0.55, rng, 0.4, 0.5, clip=mc)
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
F = np.full((H, W), -1.0, np.float32)
ref = col_field(NAVY1)
flow = angle_field(0.6)
clumps = []
for i in range(30):
    cx = rng.uniform(-100, W + 100)
    cy = rng.uniform(-70, 120) * S - (45 * S if abs(cx - W * 0.44) < 260 * S else 0)
    rx, ry = rng.uniform(90, 200) * S, rng.uniform(40, 85) * S
    a = rng.uniform(-0.45, 0.45)
    c, s_ = math.cos(a), math.sin(a)
    u = ((xx - cx) * c + (yy - cy) * s_) / rx
    v = (-(xx - cx) * s_ + (yy - cy) * c) / ry
    f = 1 - (u * u + v * v)
    F = np.maximum(F, f)
    clumps.append((cx, cy, rx, ry, a))
    flow = np.where(f > 0, (0.65 if u.mean() >= 0 else 2.5) + a, flow)
nz = value_noise(H, W, 26 * S, rng, 3)
mcn = sstep(-0.02, 0.12, F - 0.35 * (nz - 0.5))
# luz pelo alto e pela esquerda de cada massa
litf = np.clip(F, 0, 1) * sstep(0.2, 0.9, F) * 0
for (cx, cy, rx, ry, a) in clumps:
    d = np.hypot((xx - (cx - rx * 0.35)) / rx, (yy - (cy - ry * 0.55)) / ry)
    litf = np.maximum(litf, np.clip(1 - d, 0, 1))
base_c = mix(NAVY0, NAVY2, (value_noise(H, W, 120 * S, rng) * 0.9)[..., None])
ref = mix(base_c, mix(TEAL, MIDB, 0.45), (litf * 0.75)[..., None])
flow = flow + (nz - 0.5) * 0.8
L = Layer(W, H)
paint(L, ref, mcn, flow, rng, passes_std(0.75 * S, dry=0.55, bristle=0.55, err=(0, 0.03, 0.045, 0.07), long=1.3), base=0.95)
# franja de agulhas pendendo na borda de baixo e luz nas pontas
edge = (mcn > 0.5) & (np.roll(mcn, -int(10 * S), 0) < 0.5)
ey, ex = np.nonzero(edge)
for k_ in rng.choice(len(ex), size=min(len(ex), int(1700 * S)), replace=False):
    x, y = float(ex[k_]), float(ey[k_])
    a = math.pi / 2 + rng.normal(0, 0.55)
    c = mix(NAVY0, NAVY2, rng.random())
    L.stroke(x, y + rng.uniform(-4, 6) * S, a, rng.uniform(10, 30) * S, rng.uniform(1.4, 3.2) * S, c, 0.9, rng, 0.3, 0.5, taper=0.8)
for _ in range(int(900 * S)):
    x = rng.uniform(0, W)
    y = rng.uniform(0, 300 * S)
    if mcn[int(y), int(x)] < 0.6 or litf[int(y), int(x)] < 0.25:
        continue
    a = flow[int(y), int(x)] + rng.normal(0, 0.3)
    snowy = rng.random() < 0.3
    c = mix(SNOW_S, SNOW_M, rng.random()) if snowy else mix(TEAL, MIDB, rng.random())
    L.stroke(x, y, a, rng.uniform(10, 34) * S, rng.uniform(1.4, 3.0) * S, c, 0.7, rng, 0.45, 0.55, taper=0.7)
layers['canopy'] = L
print('copas', round(time.time() - T0, 1))

# ---------------- feixes de luz ----------------
beams = Layer(W, H)
for (x0, wtop, wbot, a) in [(300, 40, 210, 0.13), (470, 30, 170, 0.1), (640, 26, 150, 0.08), (120, 26, 140, 0.07)]:
    x0 *= S
    dx = 0.32 * H
    pts = [(x0 - wtop * S, -10), (x0 + wtop * S, -10), (x0 + dx + wbot * S, H), (x0 + dx - wbot * S, H)]
    mk = blur(Mask(W, H).poly(pts).array(), 18 * S) * sstep(H * 0.95, H * 0.35, yy)
    beams.fill(FOG2, mk * a)
layers['beams'] = beams

# ---------------- salvar camadas e composição ----------------
order = ['sky', 'far', 'snow', 'rocks', 'wolves', 'mid', 'rock', 'figure', 'near', 'canopy']
for k_ in order + ['beams']:
    layers[k_].image().save(f'{OUT}/floresta-{k_}.png')
comp = Layer.from_rgb(layers['sky'].color())
for k_ in order[1:]:
    comp.over(layers[k_])
# luz soma por cima
comp.P += layers['beams'].P * 1.0
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

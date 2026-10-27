"""O Carrasco Coroado (lore/torres.md): a folha do colosso do núcleo e do que fica em volta dele.

O colosso é a versão do carrasco que continua achando que tudo foi necessário, feita das memórias que ele
rejeitou: o capuz carmesim (o mesmo do cavaleiro) e a máscara dele, a de porcelana com a testa larga e o
queixo em ponta, inteira: a rachadura que no cavaleiro está aberta aqui está selada em ouro. A armadura é
de ouro, com o medalhão do eclipse no peito pendurado num rosário de contas de Âmbar (as memórias), e a
coroa da Coroação é um aro de ouro com espinhos rúnicos. Ele sobe do mar de nuvens atrás da torre e
agarra as duas agulhas do terraço; o núcleo fica pendurado entre elas, em correntes, acima da coroa.

As partes (px do mundo, os mesmos números de entities/Coroado.ts): o peito (com o pescoço e os ombros), a
ombreira, a cabeça (o capuz e a máscara), a coroa, o braço e o antebraço com o punho, a lâmina da foice, a
coroa pequena do carrasco dourado, a conta, as agulhas, o núcleo e os elos das correntes. A luz é a da
cena: o núcleo em cima e à frente (quente), o mar de nuvens embaixo (laranja) e o céu da noite atrás
(contraluz frio); cada material sai de uma rampa de tons (o ouro vai do oliva quase preto ao amarelo
pálido). Depois da luz, o pincel repinta tudo (art2/brush.py), a tinta ganha relevo e os detalhes finos
(gravuras, runas acesas, a rachadura de ouro, o brilho nas quinas) voltam por cima, nítidos.

uso: python3 coroado.py <pasta_assets> [--preview=<pasta>] [--only=parte,parte]
"""
import json
import math
import os
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brush import Layer, paint, blur, value_noise, sstep

# px da folha por px do mundo
S = 2

# os pontos que a luta usa (entities/Coroado.ts, PART)
NECK = (200, 26)
SHOULDER = (80, 54)
PAULDRON = dict(w=112, h=100, joint=(66, 46))
BLADE = dict(w=200, h=64, root=(14, 44))
SPIRE = dict(w=36, h=400)


# ---------------------------------------------------------------- a tela de cada parte
class Cv:
    """Uma parte: cor pré-multiplicada e alfa, a direção das pinceladas e onde o pincel pode repintar."""

    def __init__(self, w, h, seed=1):
        self.w, self.h = w, h
        self.W, self.H = int(round(w * S)), int(round(h * S))
        ys, xs = np.mgrid[0:self.H, 0:self.W].astype(np.float32)
        self.X = (xs + 0.5) / S
        self.Y = (ys + 0.5) / S
        self.P = np.zeros((self.H, self.W, 3), np.float32)
        self.A = np.zeros((self.H, self.W), np.float32)
        self.flow = np.zeros((self.H, self.W), np.float32)
        self.brush = np.zeros((self.H, self.W), np.float32)
        self.rng = np.random.default_rng(seed)
        # os detalhes que voltam por cima depois do pincel
        self.post = []

    def put(self, cov, rgb, flow=None, brush=1.0, shadow=0.55, drop=2.0, soft=2.2):
        """Põe uma peça por cima; a sombra dela cai no que já está embaixo (a luz vem de cima)."""
        cov = np.clip(cov, 0, 1).astype(np.float32)
        if shadow > 0 and self.A.max() > 0:
            sh = ndi.shift(cov, (drop * S, 0), order=1, mode='constant')
            sh = blur(sh, soft * S)
            k = np.clip(shadow * sh * (1 - cov), 0, 0.92)
            self.P *= (1 - k)[..., None]
        a = cov[..., None]
        self.P = self.P * (1 - a) + np.asarray(rgb, np.float32) * a
        self.A = self.A * (1 - cov) + cov
        if flow is not None:
            f = np.broadcast_to(np.asarray(flow, np.float32), cov.shape)
            self.flow = np.where(cov > 0.5, f, self.flow)
        self.brush = self.brush * (1 - cov) + brush * cov

    def rgba(self):
        col = self.P / np.maximum(self.A, 1e-4)[..., None]
        return np.dstack([np.clip(col, 0, 1), np.clip(self.A, 0, 1)])


# ---------------------------------------------------------------- formas
def aa(sd):
    """Distância com sinal (px do mundo, negativa dentro) para cobertura com a borda suave de 1 px."""
    return np.clip(0.5 - sd * S, 0, 1).astype(np.float32)


def ellipse(cv, cx, cy, rx, ry, ang=0.0):
    c, s = math.cos(ang), math.sin(ang)
    dx, dy = cv.X - cx, cv.Y - cy
    u = (dx * c + dy * s) / rx
    v = (-dx * s + dy * c) / ry
    r = np.sqrt(u * u + v * v)
    return aa((r - 1) * min(rx, ry)), u, v, r


def dome(r, height):
    return height * np.sqrt(np.clip(1 - r * r, 0, 1))


def poly(cv, pts, ss=4):
    im = Image.new('L', (cv.W * ss, cv.H * ss), 0)
    ImageDraw.Draw(im).polygon([(x * S * ss, y * S * ss) for x, y in pts], fill=255)
    return np.asarray(im.resize((cv.W, cv.H), Image.BOX), np.float32) / 255


def inside(cov):
    """Distância (px do mundo) até a borda, de dentro."""
    return (ndi.distance_transform_edt(cov > 0.5) / S).astype(np.float32)


def spline(pts, n=10, closed=False):
    P = [np.array(p, float) for p in pts]
    P = [P[-1]] + P + [P[0], P[1]] if closed else [P[0]] + P + [P[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append((float(q[0]), float(q[1])))
    if not closed:
        out.append(tuple(P[-2]))
    return out


def segs_of(pts):
    return list(zip(pts[:-1], pts[1:]))


def seg_dist(cv, segs, pad=6.0):
    """Distância (px do mundo) até o traço mais perto e, nele, a posição ao longo (0 a 1 no traço todo)."""
    d = np.full((cv.H, cv.W), 1e9, np.float32)
    along = np.zeros((cv.H, cv.W), np.float32)
    total = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in segs) or 1.0
    acc = 0.0
    for (x0, y0), (x1, y1) in segs:
        L = math.hypot(x1 - x0, y1 - y0)
        xa, xb = int(max(0, (min(x0, x1) - pad) * S)), int(min(cv.W, (max(x0, x1) + pad) * S + 1))
        ya, yb = int(max(0, (min(y0, y1) - pad) * S)), int(min(cv.H, (max(y0, y1) + pad) * S + 1))
        if xa < xb and ya < yb:
            X = cv.X[ya:yb, xa:xb]
            Y = cv.Y[ya:yb, xa:xb]
            dx, dy = x1 - x0, y1 - y0
            t = np.clip(((X - x0) * dx + (Y - y0) * dy) / max(dx * dx + dy * dy, 1e-6), 0, 1)
            dd = np.hypot(X - (x0 + t * dx), Y - (y0 + t * dy))
            sub = d[ya:yb, xa:xb]
            m = dd < sub
            sub[m] = dd[m]
            along[ya:yb, xa:xb][m] = ((acc + t * L) / total)[m]
        acc += L
    return d, along


def tube(cv, pts, r0, r1=None):
    """Um tubo ao longo da linha (raio r0 no começo, r1 no fim): cobertura e altura (a seção é redonda)."""
    r1 = r0 if r1 is None else r1
    d, t = seg_dist(cv, segs_of(pts), pad=max(r0, r1) + 3)
    r = r0 + (r1 - r0) * t
    return aa(d - r), dome(d / np.maximum(r, 1e-3), 1.0) * r, t


def cavity(h, r=3.0, k=0.09, lo=0.45):
    """Oclusão das cavidades: onde a altura fica abaixo da média em volta, escurece."""
    return np.clip(1 - k * np.clip(blur(h, r * S) - h, 0, None), lo, 1).astype(np.float32)


# ---------------------------------------------------------------- luz e materiais
def unit(v):
    v = np.asarray(v, np.float32)
    return v / np.linalg.norm(v)


L_CORE = unit((0.06, -0.8, 0.6))
L_CLOUD = unit((0.0, 0.86, 0.5))
VIEW = np.array([0.0, 0.0, 1.0], np.float32)
C_CORE = np.array([1.0, 0.86, 0.62], np.float32)
C_CLOUD = np.array([1.0, 0.5, 0.22], np.float32)
C_SKY = np.array([0.42, 0.38, 0.78], np.float32)


def ramp(stops):
    xs = np.array([s[0] for s in stops], np.float32)
    cs = np.array([s[1] for s in stops], np.float32)

    def f(v):
        v = np.clip(v, 0, 1)
        out = np.empty(v.shape + (3,), np.float32)
        for i in range(3):
            out[..., i] = np.interp(v, xs, cs[:, i])
        return out
    return f


GOLD_R = ramp([(0.0, (0.03, 0.02, 0.014)), (0.15, (0.11, 0.065, 0.028)), (0.32, (0.31, 0.19, 0.065)), (0.5, (0.58, 0.39, 0.13)),
               (0.68, (0.84, 0.63, 0.27)), (0.84, (0.98, 0.84, 0.5)), (1.0, (1.0, 0.97, 0.84))])
BRONZE_R = ramp([(0.0, (0.03, 0.02, 0.016)), (0.2, (0.1, 0.06, 0.035)), (0.42, (0.27, 0.16, 0.075)), (0.64, (0.5, 0.31, 0.14)),
                 (0.84, (0.76, 0.54, 0.29)), (1.0, (0.96, 0.84, 0.6))])
IRON_R = ramp([(0.0, (0.02, 0.02, 0.03)), (0.4, (0.1, 0.1, 0.125)), (0.75, (0.27, 0.26, 0.29)), (1.0, (0.6, 0.54, 0.48))])
CRIMSON_R = ramp([(0.0, (0.025, 0.006, 0.014)), (0.2, (0.095, 0.015, 0.035)), (0.4, (0.23, 0.035, 0.065)), (0.6, (0.42, 0.07, 0.095)),
                  (0.8, (0.64, 0.16, 0.13)), (1.0, (0.92, 0.46, 0.3))])
PORC_R = ramp([(0.0, (0.08, 0.07, 0.09)), (0.2, (0.24, 0.21, 0.24)), (0.42, (0.5, 0.45, 0.45)), (0.64, (0.76, 0.7, 0.64)),
               (0.82, (0.92, 0.87, 0.78)), (1.0, (1.0, 0.98, 0.92))])
STONE_R = ramp([(0.0, (0.025, 0.025, 0.04)), (0.25, (0.08, 0.08, 0.105)), (0.5, (0.16, 0.16, 0.195)), (0.75, (0.28, 0.27, 0.3)),
                (1.0, (0.52, 0.46, 0.42))])


def dot(n, v):
    return n[..., 0] * v[0] + n[..., 1] * v[1] + n[..., 2] * v[2]


def normals(h):
    gy, gx = np.gradient(h.astype(np.float32))
    n = np.dstack([-gx * S, -gy * S, np.ones_like(h, dtype=np.float32)])
    return n / np.linalg.norm(n, axis=2, keepdims=True)


# Onde a parte fica na cena (em relação ao meio do terraço, no chão), para a luz do núcleo cair com a
# distância (KC) e para a borda da torre tapar o mar de nuvens perto do chão (KF). scene() acerta os dois
# para a tela da parte que está sendo pintada.
KC = 1.0
KF = 1.0
CORE_AT = (0.0, -290.0)


def scene(cv, ox, oy, kc=None):
    global KC, KF
    if kc is not None:
        KC, KF = kc, 1.0
        return
    wx = np.abs(cv.X + ox)
    wy = cv.Y + oy
    d = np.hypot(wx - CORE_AT[0], wy - CORE_AT[1])
    KC = np.clip((1 + (70 / 190) ** 2) / (1 + (d / 190) ** 2), 0, 1.1).astype(np.float32)
    KF = (1 - 0.6 * sstep(-70, 6, wy)).astype(np.float32)


def light_v(n, core=0.8, cloud=0.32, amb=0.08, wrap=0.2, rim=0.24, light=None):
    """O quanto a luz da cena acende cada ponto (o núcleo, as nuvens, o ambiente e o contraluz)."""
    L1 = L_CORE if light is None else light
    d1 = np.clip((dot(n, L1) + wrap) / (1 + wrap), 0, 1)
    d2 = np.clip((dot(n, L_CLOUD) + wrap) / (1 + wrap), 0, 1)
    r = np.clip(1 - n[..., 2], 0, 1) ** 2
    return amb + core * d1 * KC + cloud * d2 * KF + rim * r, d2 * KF, r


def matte(n, R, core=0.8, cloud=0.32, amb=0.08, rim=0.24, wrap=0.2, spec=0.0, shin=20.0, light=None, ao=None, var=None):
    v, d2, r = light_v(n, core, cloud, amb, wrap, rim, light)
    if ao is not None:
        v = v * ao
    if var is not None:
        v = v * (1 + var)
    col = R(v)
    col = col + d2[..., None] * C_CLOUD * 0.05 + r[..., None] * C_SKY * 0.07
    if spec:
        Hh = unit((L_CORE if light is None else light) + VIEW)
        col = col + (np.clip(dot(n, Hh), 0, 1) ** shin)[..., None] * C_CORE * spec
    return col


SKY_ENV = np.array([0.12, 0.09, 0.2], np.float32)
HOR_ENV = np.array([1.0, 0.7, 0.38], np.float32)
DEEP_ENV = np.array([0.8, 0.42, 0.18], np.float32)
FRONT_ENV = np.array([0.26, 0.18, 0.13], np.float32)
LUMA = np.array([0.3, 0.52, 0.18], np.float32)


def env(n):
    """O que o metal reflete: o céu escuro em cima, o mar de nuvens aceso embaixo e a torre na frente."""
    ry = 2 * n[..., 2] * n[..., 1]
    rz = 2 * n[..., 2] ** 2 - 1
    th = sstep(-0.32, 0.1, ry)[..., None]
    td = sstep(0.35, 0.95, ry)[..., None]
    base = SKY_ENV * (1 - th) + (HOR_ENV * (1 - td) + DEEP_ENV * td) * th
    tf = sstep(0.55, 0.98, rz)[..., None]
    return base * (1 - tf) + FRONT_ENV * tf


def metal(n, R=GOLD_R, diffuse=0.42, spec=0.9, shin=40.0, light=None, ao=None, var=None, gain=1.0):
    e = env(n)
    el = e @ LUMA * (0.45 + 0.55 * KC) * KF
    vd, _, _ = light_v(n, core=0.9, cloud=0.25, amb=0.04, wrap=0.1, rim=0.15, light=light)
    v = (el * (1 - diffuse) + vd * diffuse) * gain
    if ao is not None:
        v = v * ao
    if var is not None:
        v = v * (1 + var)
    Hh = unit((L_CORE if light is None else light) + VIEW)
    s = np.clip(dot(n, Hh), 0, 1) ** shin * spec * (0.3 + 0.7 * KC)
    col = R(v + s * 0.55)
    hue = e / (el[..., None] + 1e-3)
    return col * (0.84 + 0.16 * hue)


def amber(t, hot=1.0):
    """Âmbar aceso: t vai da borda (0) ao miolo (1)."""
    t = np.clip(t, 0, 1)[..., None]
    edge = np.array([0.36, 0.11, 0.025], np.float32)
    mid = np.array([0.96, 0.46, 0.1], np.float32)
    core = np.array([1.0, 0.93, 0.66], np.float32)
    c = np.where(t < 0.55, edge + (mid - edge) * (t / 0.55), mid + (core - mid) * ((t - 0.55) / 0.45))
    return c * hot


def gem(cv, x, y, rx, ry, k=1.0):
    """Uma pedra de Âmbar: o miolo aceso deslocado para baixo (a luz vem de dentro) e o brilho do núcleo."""
    c, u, v, r = ellipse(cv, x, y, rx, ry)
    t = np.clip(1 - np.hypot(u + 0.15, v - 0.32), 0, 1)
    nn = normals(dome(r, max(rx, ry)))
    col = amber(0.2 + 0.8 * t, k) + (np.clip(dot(nn, unit(L_CORE + VIEW)), 0, 1) ** 40)[..., None] * 0.95
    return c, col


# ---------------------------------------------------------------- detalhes por cima
def engrave(img, cv, segs, width=0.9, depth=0.55, lip=0.4, lipcol=(1.0, 0.86, 0.55)):
    """Uma gravura no metal: o sulco escuro e, embaixo dele, o fio que pega a luz."""
    d, _ = seg_dist(cv, segs, pad=width + 3)
    g = aa(d - width * 0.5) * img[..., 3]
    img[..., :3] *= (1 - depth * g)[..., None]
    if lip:
        d2, _ = seg_dist(cv, [((a[0], a[1] + width * 0.8), (b[0], b[1] + width * 0.8)) for a, b in segs], pad=width + 3)
        l = aa(d2 - width * 0.35) * (1 - g) * img[..., 3]
        img[..., :3] += (l * lip)[..., None] * np.asarray(lipcol, np.float32) * 0.6


def glow(img, cv, segs, width=0.9, col=(1.0, 0.6, 0.16), hot=(1.0, 0.92, 0.66), halo=2.2, k=1.0):
    """Uma runa acesa: o traço de Âmbar e a luz em volta (dentro da peça)."""
    d, _ = seg_dist(cv, segs, pad=width + halo * 3 + 2)
    line = aa(d - width * 0.5)
    h = np.exp(-(d / max(halo, 0.1)) ** 2) * 0.5
    a = img[..., 3]
    c = np.asarray(col, np.float32)
    m = (line * a * k)[..., None]
    img[..., :3] = img[..., :3] * (1 - m) + m * (c * 0.55 + np.asarray(hot, np.float32) * 0.45)
    img[..., :3] += (h * (1 - line) * a * k)[..., None] * c * 0.6
    core = aa(d - width * 0.18)
    img[..., :3] += (core * a * k * 0.3)[..., None] * np.asarray(hot, np.float32)


def glint(img, cv, x, y, r=1.6, k=1.0, col=(1.0, 0.96, 0.84)):
    """O brilho do núcleo numa quina do metal: o ponto e as duas riscas finas."""
    dx, dy = cv.X - x, cv.Y - y
    d = np.hypot(dx, dy)
    spot = np.exp(-(d / r) ** 2)
    star = np.exp(-(dx / (r * 3.0)) ** 2 - (dy / (r * 0.26)) ** 2) + np.exp(-(dy / (r * 2.2)) ** 2 - (dx / (r * 0.26)) ** 2)
    v = np.clip(spot + 0.4 * star, 0, 1.4) * k * img[..., 3]
    img[..., :3] += v[..., None] * np.asarray(col, np.float32)


# as runas da Casa, em traços (caixa 0.6 x 1): o tronco reto e os ramos inclinados, como as pedras das Torres
RUNES = [
    [((0.3, 0), (0.3, 1)), ((0.3, 0.32), (0.0, 0.0)), ((0.3, 0.32), (0.6, 0.0))],
    [((0.3, 0), (0.3, 1)), ((0.3, 0.5), (0.6, 0.18)), ((0.3, 0.5), (0.0, 0.82))],
    [((0.3, 0), (0.6, 0.35)), ((0.6, 0.35), (0.3, 0.7)), ((0.3, 0.7), (0.0, 0.35)), ((0.0, 0.35), (0.3, 0)), ((0.3, 0.7), (0.3, 1))],
    [((0.0, 0.0), (0.6, 0.6)), ((0.6, 0.0), (0.0, 0.6)), ((0.3, 0.3), (0.3, 1))],
    [((0.0, 0.0), (0.6, 0.0)), ((0.3, 0), (0.3, 1)), ((0.3, 0.6), (0.0, 0.92)), ((0.3, 0.6), (0.6, 0.92))],
    [((0.3, 0), (0.3, 1)), ((0.3, 0.12), (0.6, 0.34)), ((0.6, 0.34), (0.3, 0.56))],
    [((0.08, 0), (0.08, 1)), ((0.52, 0), (0.52, 1)), ((0.08, 0.28), (0.52, 0.62))],
    [((0.0, 0.36), (0.3, 0.0)), ((0.3, 0.0), (0.6, 0.36)), ((0.3, 0), (0.3, 1))],
    [((0.0, 0.0), (0.6, 0.33)), ((0.6, 0.33), (0.0, 0.66)), ((0.0, 0.66), (0.6, 1.0))],
    [((0.3, 0), (0.3, 1)), ((0.0, 0.5), (0.6, 0.5)), ((0.0, 0.18), (0.3, 0.0)), ((0.6, 0.82), (0.3, 1.0))],
]


def rune(i, x, y, h, ang=0.0):
    """Os traços da runa i com o meio em (x, y), da altura h, girada ang."""
    c, s = math.cos(ang), math.sin(ang)
    out = []
    for (ax, ay), (bx, by) in RUNES[i % len(RUNES)]:
        pa = ((ax - 0.3) * h, (ay - 0.5) * h)
        pb = ((bx - 0.3) * h, (by - 0.5) * h)
        out.append(((x + pa[0] * c - pa[1] * s, y + pa[0] * s + pa[1] * c), (x + pb[0] * c - pb[1] * s, y + pb[0] * s + pb[1] * c)))
    return out


# ---------------------------------------------------------------- o pincel
def paintover(cv, mix_ref=0.16, big=11.0, relief=0.3, outline=0.7, rim=0.5):
    """Repinta a parte com pinceladas que seguem a forma (as linhas de mesmo tom), dá relevo à tinta, põe
    os detalhes nítidos por cima, escurece a borda de fora (o contorno das figuras do jogo) e, logo dentro
    dela, acende o fio frio do céu da noite atrás (mais nas bordas viradas para cima)."""
    rgba = cv.rgba()
    ref = rgba[..., :3].astype(np.float32)
    alpha = rgba[..., 3]
    mask = ((alpha > 0.5) & (cv.brush > 0.5)).astype(np.float32)
    lum = blur(ref @ LUMA, 1.3 * S)
    gy, gx = np.gradient(lum)
    mag = np.hypot(gx, gy)
    iso = np.arctan2(gy, gx) + np.pi / 2
    k = sstep(0.0015, 0.008, mag)
    vx = np.cos(2 * iso) * k + np.cos(2 * cv.flow) * (1 - k)
    vy = np.sin(2 * iso) * k + np.sin(2 * cv.flow) * (1 - k)
    flow = (0.5 * np.arctan2(vy, vx)).astype(np.float32)
    layer = Layer(cv.W, cv.H)
    layer.fill(ref, mask)
    passes = [
        dict(size=big, spacing=0.9, length=(1.6, 3.6), err=0.0, alpha=0.55, bristle=0.4, dry=0.22, blur=0.4, taper=0.35, ang_jitter=0.12),
        dict(size=big * 0.6, spacing=0.8, length=(1.8, 4.0), err=0.02, alpha=0.66, bristle=0.45, dry=0.25, blur=0.3, taper=0.4, ang_jitter=0.12),
        dict(size=big * 0.34, spacing=0.8, length=(1.6, 3.4), err=0.035, alpha=0.76, bristle=0.35, dry=0.15, blur=0.22, taper=0.45, ang_jitter=0.14),
        dict(size=max(1.6, big * 0.19), spacing=0.85, length=(1.5, 3.0), err=0.06, alpha=0.85, bristle=0.25, dry=0.05, blur=0.15, taper=0.5, ang_jitter=0.14),
    ]
    paint(layer, ref, mask, flow, cv.rng, passes, jitter=0.009, val_jitter=0.045, clip_soft=0.8)
    col = layer.color()
    m = (layer.A > 0.02)[..., None]
    out = np.where(m, col * (1 - mix_ref) + ref * mix_ref, ref)
    if relief:
        # o relevo da tinta: as cristas das pinceladas pegam a luz de cima
        l2 = out @ LUMA
        bump = l2 - blur(l2, 1.2 * S)
        by = np.gradient(blur(bump, 0.5))[0]
        out = out * (1 + np.clip(-by * relief * 6, -0.18, 0.18) * mask)[..., None]
    img = np.dstack([np.clip(out, 0, 1), alpha]).astype(np.float32)
    for f in cv.post:
        f(img)
    if outline:
        edge = np.clip(alpha - ndi.minimum_filter(alpha, size=int(S * 1 + 1)), 0, 1)
        dark = np.array([0.05, 0.03, 0.05], np.float32)
        img[..., :3] = img[..., :3] * (1 - (edge * outline)[..., None]) + (edge * outline)[..., None] * (img[..., :3] * 0.25 + dark)
    if rim:
        solid = alpha > 0.5
        d_in, (iy, ix) = ndi.distance_transform_edt(solid, return_indices=True)
        yy, xx = np.mgrid[0:cv.H, 0:cv.W]
        vy = (iy - yy).astype(np.float32)
        ln = np.hypot((ix - xx).astype(np.float32), vy) + 1e-6
        up = np.clip(-vy / ln, 0, 1)
        band = np.exp(-((d_in / S - 1.1) / 0.6) ** 2) * solid
        img[..., :3] += (band * (0.25 + 0.75 * up) * rim)[..., None] * C_SKY * 0.55
    img[..., :3] = np.clip(img[..., :3], 0, 1)
    return img


def folds(cv, X, Y, x0, period, phase_cell, seed, amp=1.0):
    """Dobras de pano caindo: senoides que variam devagar de fase (pano de verdade não é regular)."""
    ph = value_noise(cv.H, cv.W, phase_cell * S, np.random.default_rng(seed), 2) * 5.0
    return amp * np.sin((X - x0) / period * 2 * np.pi + ph)


# ---------------------------------------------------------------- o peito
def chest():
    """O peito (400 x 150): o manto carmesim caindo dos ombros por trás, a couraça de ouro com a quilha, o
    debrum alto e o friso de runas embaixo, a capa curta com a barra recortada e o debrum de ouro, a gola,
    o rosário de contas de Âmbar (o fio de fora passa embaixo do medalhão, o de dentro termina na argola) e
    o medalhão do eclipse. O pescoço fica em (200, 26) e os ombros em (80, 54) e (320, 54); a parte de
    baixo (y > 130) fica atrás do chão do terraço."""
    cv = Cv(400, 150, seed=11)
    scene(cv, -NECK[0], -104 - NECK[1])
    X, Y = cv.X, cv.Y
    rng = cv.rng
    grain = value_noise(cv.H, cv.W, 9 * S, rng, 3) - 0.5

    # o manto: largo, atrás de tudo, caindo de trás dos ombros
    out = spline([(200, 14), (120, 20), (62, 34), (24, 58), (8, 96), (2, 150), (398, 150), (392, 96), (376, 58), (338, 34), (280, 20)], closed=True)
    m = poly(cv, out)
    dist = inside(m)
    h = 30 * np.sqrt(np.clip(1 - ((X - 200) / 205) ** 2, 0, 1)) + 5 * sstep(0, 12, dist)
    h += folds(cv, X, Y, 200, 17, 50, 3, 3.0) * sstep(40, 90, Y)
    n = normals(h)
    cv.put(m, matte(n, CRIMSON_R, wrap=0.35, rim=0.4, ao=cavity(h), var=grain * 0.25), flow=np.pi / 2, shadow=0)

    # a couraça
    plate = spline([(154, 28), (246, 28), (276, 40), (288, 80), (284, 150), (116, 150), (112, 80), (124, 40)], closed=True)
    m = poly(cv, plate)
    dist = inside(m)
    h = 30 * np.sqrt(np.clip(1 - ((X - 200) / 100) ** 2, 0, 1)) + 8 * np.sqrt(np.clip(1 - ((Y - 96) / 90) ** 2, 0, 1))
    h += 2.8 * np.exp(-((X - 200) / 4.5) ** 2) * sstep(36, 60, Y)
    h += 2.4 * np.exp(-((dist - 2.4) / 1.3) ** 2) - 1.2 * np.exp(-((dist - 6.4) / 0.9) ** 2)
    # as lâminas da cintura (quase todas atrás do chão)
    h += 1.6 * np.exp(-((((Y - 128) % 10) - 5) / 1.0) ** 2) * sstep(122, 126, Y)
    n = normals(h)
    cv.put(m, metal(n, ao=cavity(h), var=grain * 0.18), flow=0.0, shadow=0.6)
    band = [((116, 117), (284, 117)), ((116, 133), (284, 133))]
    runes = []
    for i, x in enumerate(np.linspace(128, 272, 12)):
        if abs(x - 200) < 7:
            continue
        runes += rune(i + 2, float(x), 125.0, 9.0)
    scrolls = []
    for side in (-1, 1):
        # os arabescos dos lados do medalhão: volutas gravadas presas numa haste curva
        for (cx, cy, r0, turns) in ((200 + side * 46, 62, 8.0, 1.6), (200 + side * 58, 98, 10.0, 1.8)):
            pts = []
            for t in np.linspace(0, 1, 44):
                a = side * (t * turns * 2 * np.pi) + (0 if side > 0 else np.pi)
                r = r0 * (1 - 0.78 * t)
                pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
            scrolls += segs_of(pts)
        scrolls += segs_of(spline([(200 + side * 24, 46), (200 + side * 40, 52), (200 + side * 56, 66), (200 + side * 64, 84), (200 + side * 60, 108)], 8))
    cv.post.append(lambda img: engrave(img, cv, band, 1.3, 0.62))
    cv.post.append(lambda img: engrave(img, cv, scrolls, 0.8, 0.5))
    cv.post.append(lambda img: glow(img, cv, runes, 0.75, halo=1.6, k=0.8))

    # a capa curta sobre os ombros, a barra recortada com o debrum de ouro
    hem = [(298, 52), (280, 57), (258, 51), (236, 59), (214, 53), (200, 61), (186, 53), (164, 59), (142, 51), (120, 57), (102, 52)]
    cape = [(140, 12), (260, 12), (296, 32)] + hem + [(104, 32)]
    m = poly(cv, spline(cape, 6, closed=True))
    dist = inside(m)
    ang = np.arctan2(Y + 10, X - 200)
    h = 14 * np.sqrt(np.clip(1 - ((X - 200) / 104) ** 2, 0, 1)) + 4 * sstep(0, 6, dist)
    h += 1.8 * np.sin(ang * 22 + 0.6 + folds(cv, X, Y, 0, 1e9, 30, 5, 1.0)) * sstep(16, 40, Y)
    n = normals(h)
    cv.put(m, matte(n, CRIMSON_R, wrap=0.35, rim=0.35, spec=0.05, shin=10, ao=cavity(h), var=grain * 0.25), flow=ang, shadow=0.75)
    hem_s = spline(hem, 6)
    cov, hh, _ = tube(cv, hem_s, 2.3)
    hh += 0.4 * np.sin(cv.X * 1.6)
    cv.put(cov, metal(normals(hh * 1.4), diffuse=0.5), flow=0.0, shadow=0.45, drop=1.0, soft=1.2)
    stitches = []
    for i in range(len(hem_s) - 1):
        if i % 3 == 0:
            (ax, ay), (bx, by) = hem_s[i], hem_s[i + 1]
            stitches.append(((ax, ay - 4.4), (bx, by - 4.4)))
    cv.post.append(lambda img: engrave(img, cv, stitches, 0.7, 0.0, 0.7, (1.0, 0.78, 0.42)))

    # a gola de ouro (o capuz cobre a parte de cima)
    gor = spline([(152, 16), (248, 16), (254, 30), (230, 38), (200, 42), (170, 38), (146, 30)], 8, closed=True)
    m = poly(cv, gor)
    dist = inside(m)
    h = 8 * np.sqrt(np.clip(1 - ((X - 200) / 56) ** 2, 0, 1)) + 2.4 * sstep(0, 3, dist)
    h += 1.6 * np.exp(-((Y - 30 + 0.0006 * (X - 200) ** 2) / 1.2) ** 2)
    cv.put(m, metal(normals(h), ao=cavity(h)), flow=0.0, shadow=0.65)

    # o rosário
    def along(pts, step, first=None):
        Ls = [0.0]
        for a, b in zip(pts[:-1], pts[1:]):
            Ls.append(Ls[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        out = []
        s = step * 0.5 if first is None else first
        j = 0
        while s < Ls[-1] - 1:
            while Ls[j + 1] < s:
                j += 1
            out.append(pts[j])
            s += step
        return out

    outer_pts = [(140 + 120 * t, 46 + 78 * 4 * t * (1 - t)) for t in np.linspace(0, 1, 400)]
    inner_pts = spline([(158, 36), (176, 58), (200, 69), (224, 58), (242, 36)], 40)
    for pts in (outer_pts, inner_pts):
        cov, hh, _ = tube(cv, pts[::8] + [pts[-1]], 0.7)
        cv.put(cov, metal(normals(hh), diffuse=0.5, gain=0.8), shadow=0.5, drop=1.4, soft=1.2, brush=0.0)
    for pts in (outer_pts, inner_pts):
        cov_all = np.zeros((cv.H, cv.W), np.float32)
        col_all = np.zeros((cv.H, cv.W, 3), np.float32)
        for k, (x, y) in enumerate(along(pts, 5.6)):
            if k % 6 == 5:
                c, u, v, r = ellipse(cv, x, y, 1.7, 1.7)
                col = metal(normals(dome(r, 1.7)), diffuse=0.4)
            else:
                c, col = gem(cv, x, y, 2.7, 2.7)
            cov_all = np.maximum(cov_all, c)
            col_all = np.where((c > 0)[..., None], col, col_all)
        cv.put(cov_all, col_all, shadow=0.8, drop=1.6, soft=1.6, brush=0.0)

    # o medalhão do eclipse
    mx, my = 200.0, 92.0
    c, u, v, r = ellipse(cv, mx, 73.5, 3.6, 3.6)
    ring = c * (1 - ellipse(cv, mx, 73.5, 1.8, 1.8)[0])
    cv.put(ring, metal(normals(dome(r, 2.0))), shadow=0.5, drop=1.0, soft=1.0, brush=0.0)
    c, u, v, r = ellipse(cv, mx, my, 20.5, 20.5)
    h = dome(r, 4.0) + 2.4 * np.exp(-((r - 0.93) / 0.05) ** 2) - 1.0 * np.exp(-((r - 0.8) / 0.03) ** 2)
    cv.put(c, metal(normals(h), diffuse=0.38, spec=1.2, ao=cavity(h, 2.0)), shadow=0.9, drop=2.6, soft=2.4)
    rays = []
    for i in range(24):
        a = i / 24 * 2 * np.pi
        r0, r1 = 13.8, (18.0 if i % 2 == 0 else 16.2)
        rays.append(((mx + math.cos(a) * r0, my + math.sin(a) * r0), (mx + math.cos(a) * r1, my + math.sin(a) * r1)))
    cv.post.append(lambda img: engrave(img, cv, rays, 0.8, 0.6, 0.6))

    def eclipse(img):
        d = np.hypot(cv.X - mx, cv.Y - my)
        a = img[..., 3]
        ringv = np.exp(-((d - 11.7) / 1.05) ** 2)
        img[..., :3] = img[..., :3] * (1 - (ringv * a)[..., None]) + (ringv * a)[..., None] * amber(0.45 + 0.55 * ringv)
        disc = aa(d - 10.4) * a
        sh = np.clip(1 - np.hypot(cv.X - mx + 3, cv.Y - my + 4) / 10, 0, 1)
        img[..., :3] = img[..., :3] * (1 - disc[..., None]) + disc[..., None] * (np.array([0.02, 0.016, 0.03], np.float32) + sh[..., None] * np.array([0.07, 0.05, 0.08], np.float32))
        glint(img, cv, mx - 3.4, my - 4.6, 0.9, 0.45)
        flare = np.exp(-((d - 12.6) / 0.9) ** 2) * np.clip(np.cos(np.arctan2(cv.Y - my, cv.X - mx) * 4), 0, 1) ** 6
        img[..., :3] += (flare * a * 0.55)[..., None] * np.array([1.0, 0.8, 0.45], np.float32)
    cv.post.append(eclipse)
    for gx, gy in ((mx - 13, my - 15), (mx + 9, my - 18), (152, 40), (248, 40), (128, 48), (272, 48)):
        cv.post.append(lambda img, gx=gx, gy=gy: glint(img, cv, gx, gy, 1.3, 0.5))
    return paintover(cv)


# ---------------------------------------------------------------- a ombreira
def pauldron():
    """A ombreira da esquerda (a da direita é o espelho): a cúpula de ouro com a crista e três espinhos
    rúnicos, o cravo de Âmbar no meio e as três lâminas embaixo, cada uma mais baixa e mais estreita. A
    junta do ombro fica em PAULDRON['joint'] (o braço sai de baixo dela)."""
    W, H = PAULDRON['w'], PAULDRON['h']
    cv = Cv(W, H, seed=41)
    scene(cv, -(NECK[0] - SHOULDER[0]) - PAULDRON['joint'][0], -104 + (SHOULDER[1] - NECK[1]) - PAULDRON['joint'][1])
    X, Y = cv.X, cv.Y
    grain = value_noise(cv.H, cv.W, 7 * S, cv.rng, 3) - 0.5
    tilt = 0.14
    for i in (2, 1, 0):
        cx, cy = 60 - i * 3, 58 + i * 12
        rx, ry = 50 - i * 5, 26 - i * 1.5
        c, u, v, r = ellipse(cv, cx, cy, rx, ry, tilt)
        h = dome(r, 10) + 1.8 * np.exp(-((r - 0.9) / 0.06) ** 2)
        cv.put(c, metal(normals(h), ao=cavity(h, 2.0), var=grain * 0.18), flow=tilt, shadow=0.85, drop=2.4, soft=2.0)
        for k in range(5):
            a = np.pi * (0.18 + 0.64 * k / 4)
            px = cx + math.cos(a) * rx * 0.86 * math.cos(tilt) - math.sin(a) * ry * 0.86 * math.sin(tilt)
            py = cy + math.cos(a) * rx * 0.86 * math.sin(tilt) + math.sin(a) * ry * 0.86 * math.cos(tilt)
            cc, uu, vv, rr = ellipse(cv, px, py, 1.6, 1.6)
            cv.put(cc, metal(normals(dome(rr, 1.6))), shadow=0.6, drop=0.8, soft=0.6, brush=0.0)
    c, u, v, r = ellipse(cv, 58, 42, 48, 32, tilt)
    h = dome(r, 26) + 2.4 * np.exp(-((r - 0.92) / 0.05) ** 2) - 1.0 * np.exp(-((r - 0.8) / 0.03) ** 2)
    h += 3.0 * np.exp(-((v + 0.05) / 0.14) ** 2) * (1 - sstep(0.7, 1.0, np.abs(u)))
    cv.put(c, metal(normals(h), spec=1.1, ao=cavity(h, 2.5), var=grain * 0.18), flow=tilt, shadow=0.9, drop=2.6, soft=2.4)
    for k, (sx, sh) in enumerate(((36, 15), (56, 22), (76, 15))):
        base_y = 42 - 32 * math.sqrt(max(0.0, 1 - ((sx - 58) / 48) ** 2)) * 0.9 + (sx - 58) * math.tan(tilt)
        pts = [(sx - 4.2, base_y + 6), (sx - 2.2, base_y - sh * 0.45), (sx - 0.4, base_y - sh), (sx + 0.6, base_y - sh), (sx + 2.2, base_y - sh * 0.45), (sx + 4.2, base_y + 6)]
        m = poly(cv, spline(pts, 6))
        hh = 4.0 * np.clip(1 - np.abs(X - sx) / 4.2, 0, 1)
        cv.put(m, metal(normals(hh), diffuse=0.4, spec=1.2), flow=np.pi / 2, shadow=0.6, drop=1.2, soft=1.0)
        cv.post.append(lambda img, sx=sx, base_y=base_y, sh=sh, k=k: glow(img, cv, rune(k + 4, sx, base_y - sh * 0.42 + 2, 4.0), 0.55, halo=1.0, k=0.85))
    c, u, v, r = ellipse(cv, 58, 40, 7.5, 7.5)
    cv.put(c, metal(normals(dome(r, 3))), shadow=0.6, drop=1.2, soft=1.2)
    c, col = gem(cv, 58, 40, 5.0, 5.4)
    cv.put(c, col, shadow=0, brush=0.0)
    rim = []
    for a in np.linspace(np.pi * 0.05, np.pi * 0.95, 40):
        rim.append((58 + math.cos(a) * 41 * math.cos(tilt) - math.sin(a) * 26 * math.sin(tilt), 42 + math.cos(a) * 41 * math.sin(tilt) + math.sin(a) * 26 * math.cos(tilt)))
    cv.post.append(lambda img: engrave(img, cv, segs_of(rim), 0.8, 0.55))
    rr = []
    for k, a in enumerate(np.linspace(np.pi * 0.3, np.pi * 0.72, 4)):
        px = 57 + math.cos(a) * 45 * math.cos(tilt) - math.sin(a) * 24.5 * math.sin(tilt)
        py = 70 + math.cos(a) * 45 * math.sin(tilt) + math.sin(a) * 24.5 * math.cos(tilt) - 22
        rr += rune(k + 1, px, py + 2, 4.6, tilt * 0.5)
    cv.post.append(lambda img: glow(img, cv, rr, 0.6, halo=1.2, k=0.75))
    for gx, gy in ((40, 22), (70, 18), (24, 52)):
        cv.post.append(lambda img, gx=gx, gy=gy: glint(img, cv, gx, gy, 1.4, 0.5))
    return paintover(cv, big=8.0)


# ---------------------------------------------------------------- a cabeça
MASK_OUT = [(60, 44.0), (72, 45.4), (82, 49.6), (86.6, 57.5), (87.0, 68), (85.4, 80), (81.0, 92), (73.0, 103), (64.5, 110.8), (60, 113.0),
            (55.5, 110.8), (47.0, 103), (39.0, 92), (34.6, 80), (33.0, 68), (33.4, 57.5), (38, 49.6), (48, 45.4)]
# a rachadura do cavaleiro (a do ícone dele), da testa até entre os olhos, e o fio que sai dela
CRACK = [(62.6, 44.6), (60.4, 49.2), (63.6, 53.6), (60.2, 58.2), (63.2, 62.6), (60.6, 67.2), (61.6, 72.4)]
CRACK2 = [(63.6, 53.6), (67.4, 56.2), (69.2, 60.6)]


def head():
    """A cabeça (120 x 132): o capuz carmesim de ponta (a coroa senta em (60, 24)), a dobra grossa do forro em
    volta da abertura, o escuro de dentro e a máscara do cavaleiro, a do ícone dele: testa larga, queixo em
    ponta, a quilha no meio, as fendas dos olhos (a da direita maior) e os sulcos das bochechas. A
    rachadura dele está aqui, selada em ouro. Dos dois lados do rosto descem fios de contas de Âmbar
    presos embaixo da coroa. O pescoço fica em (60, 128)."""
    cv = Cv(120, 132, seed=21)
    scene(cv, -60, -104 - 128)
    X, Y = cv.X, cv.Y
    grain = value_noise(cv.H, cv.W, 6 * S, cv.rng, 3) - 0.5
    hood = spline([(60, 4), (80, 9), (98, 25), (108, 50), (113, 84), (118, 120), (106, 131), (60, 130), (14, 131), (2, 120), (7, 84), (12, 50), (22, 25), (40, 9)], 8, closed=True)
    m = poly(cv, hood)
    dist = inside(m)
    ang = np.arctan2(Y - 2, X - 60)
    h = 20 * sstep(0, 24, dist) + 12 * np.sqrt(np.clip(1 - ((X - 60) / 62) ** 2, 0, 1))
    h += 2.6 * np.sin(ang * 13 + 0.4 + folds(cv, X, Y, 0, 1e9, 24, 7, 1.2)) * sstep(18, 56, Y) * (1 - sstep(96, 128, Y) * 0.5)
    n = normals(h)
    cv.put(m, matte(n, CRIMSON_R, wrap=0.35, rim=0.45, spec=0.05, shin=10, ao=cavity(h), var=grain * 0.25), flow=ang, shadow=0)
    # a dobra do forro em volta da abertura (um arco de ponta, como o da máscara)
    opening = [(60, 30), (77, 35), (90, 52), (94, 78), (91, 104), (80, 122), (60, 129), (40, 122), (29, 104), (26, 78), (30, 52), (43, 35)]
    om = poly(cv, spline(opening, 8, closed=True))
    big = ndi.binary_dilation(om > 0.5, iterations=int(4.5 * S)).astype(np.float32)
    lipm = blur(big, 0.6) * (1 - om)
    od = ndi.distance_transform_edt(om < 0.5) / S
    hh = 5.0 * np.exp(-((od - 2.2) / 1.6) ** 2)
    cv.put(lipm, matte(normals(hh + h * 0.4), CRIMSON_R, core=0.7, wrap=0.3, rim=0.3, spec=0.08, shin=12), flow=np.arctan2(Y - 78, X - 60) + np.pi / 2, shadow=0.55, drop=1.4, soft=1.4)
    # o escuro de dentro do capuz (o fundo quase preto, um resto de vermelho na beirada)
    oin = inside(om)
    inner = np.array([0.02, 0.012, 0.022], np.float32) + np.array([0.12, 0.02, 0.04], np.float32) * np.exp(-oin / 2.0)[..., None]
    cv.put(om, inner, shadow=0, brush=0.5)
    # a máscara
    mm = poly(cv, spline(MASK_OUT, 6, closed=True))
    md = inside(mm)
    h = -0.55 * np.abs(X - 60) - 0.0045 * (Y - 76) ** 2 + 3.2 * sstep(0, 4.5, md)
    h += 1.6 * np.exp(-((Y - 63.5) / 2.4) ** 2) * (1 - sstep(10, 26, np.abs(X - 60)))
    for ex in (46.0, 74.0):
        h += 1.3 * np.exp(-(((X - ex) / 6.5) ** 2 + ((Y - 81) / 4.5) ** 2))
        h -= 2.2 * np.exp(-(((X - ex) / 8.5) ** 2 + ((Y - 70) / 4.2) ** 2))
    n = normals(h)
    lightm = unit((-0.28, -0.74, 0.6))
    col = matte(n, PORC_R, core=0.95, cloud=0.3, amb=0.1, rim=0.2, wrap=0.35, spec=0.22, shin=24, light=lightm, ao=cavity(h, 2.0), var=grain * 0.1)
    cv.put(mm, col, flow=np.pi / 2, shadow=0.92, drop=2.4, soft=2.4)

    def face(img):
        a = img[..., 3]
        for (ex, ey, rx, ry, tl) in ((47.0, 70.0, 7.6, 2.5, 0.12), (73.0, 70.0, 8.2, 2.8, -0.12)):
            cc, uu, vv, rr = ellipse(cv, ex, ey, rx, ry, tl)
            # a beirada de baixo do buraco pega a luz; a de cima faz sombra para dentro
            lo = ellipse(cv, ex, ey + 0.9, rx + 0.8, ry + 0.9, tl)[0] * (1 - cc)
            hi = ellipse(cv, ex, ey - 0.9, rx + 0.9, ry + 1.2, tl)[0] * (1 - cc)
            img[..., :3] += (lo * a * 0.16)[..., None] * np.array([1.0, 0.9, 0.75], np.float32)
            img[..., :3] *= (1 - hi * a * 0.35)[..., None]
            img[..., :3] = img[..., :3] * (1 - (cc * a)[..., None]) + (cc * a)[..., None] * np.array([0.015, 0.01, 0.02], np.float32)
        # os sulcos das bochechas, descendo para o queixo
        grooves = []
        for s in (-1, 1):
            grooves += segs_of([(60 + s * 15.5, 79), (60 + s * 14.6, 88), (60 + s * 12.4, 96)])
            grooves += segs_of([(60 + s * 20.5, 81), (60 + s * 19.4, 89)])
        engrave(img, cv, grooves, 0.9, 0.38, 0.22, (1.0, 0.95, 0.85))
        # a quilha: o lado da direita um pouco mais escuro, como no ícone
        ridge = np.exp(-((cv.X - 60.2) / 0.55) ** 2) * sstep(48, 54, cv.Y) * (1 - sstep(104, 112, cv.Y)) * a
        img[..., :3] += (ridge * 0.1)[..., None]
    cv.post.append(face)
    seams = []
    for line, jit in ((CRACK, 0.3), (CRACK2, 0.25)):
        jag = [line[0]]
        for p0, p1 in zip(line[:-1], line[1:]):
            mid = ((p0[0] + p1[0]) / 2 + cv.rng.normal(0, jit), (p0[1] + p1[1]) / 2 + cv.rng.normal(0, jit))
            jag += [mid, p1]
        seams.append(jag)

    def gold_seams(img):
        a = img[..., 3]
        for i, jag in enumerate(seams):
            w = 1.25 if i == 0 else 0.7
            d, _ = seg_dist(cv, segs_of(jag), pad=4)
            # o sulco em volta (a porcelana partida) e o ouro em relevo dentro, com a luz em cima
            groove = aa(d - w * 0.5 - 0.5) * a
            img[..., :3] *= (1 - 0.35 * groove)[..., None]
            line = aa(d - w * 0.5) * a
            t = np.clip(1 - d / max(w * 0.5, 0.3), 0, 1)
            gold = GOLD_R(0.5 + 0.38 * t)
            img[..., :3] = img[..., :3] * (1 - line[..., None]) + line[..., None] * gold
        glint(img, cv, 62.4, 46.2, 1.1, 0.7)
        glint(img, cv, 63.4, 54.0, 0.8, 0.5)
    cv.post.append(gold_seams)
    # os fios de contas dos dois lados do rosto
    for side in (-1, 1):
        for (x0, xm, x1, y1, n_b) in ((30, 22, 18, 90, 15), (38, 31, 27, 72, 11)):
            pts = spline([(60 + side * (x0 - 60) * -1 if False else 60 - side * (60 - x0), 22), (60 - side * (60 - xm), (22 + y1) / 2), (60 - side * (60 - x1), y1)], 14)
            Ls = [0.0]
            for a, b in zip(pts[:-1], pts[1:]):
                Ls.append(Ls[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
            for k in range(n_b):
                s = 2.4 + k * (Ls[-1] - 2.4) / max(1, n_b - 1)
                j = min(len(pts) - 1, int(np.searchsorted(Ls, s)))
                x, y = pts[j]
                last = k == n_b - 1
                if last or k % 5 == 4:
                    rr = 2.4 if last else 1.4
                    c, u, v, r = ellipse(cv, x, y + (1.4 if last else 0), rr, rr * (1.35 if last else 1.0))
                    col = metal(normals(dome(r, rr)), diffuse=0.4, spec=1.2)
                else:
                    c, col = gem(cv, x, y, 2.1, 2.1)
                cv.put(c, col, shadow=0.75, drop=1.2, soft=1.0, brush=0.0)
    return paintover(cv, big=7.0)


# ---------------------------------------------------------------- a coroa
def crown_shape(cv, scale=1.0, ox=0.0, oy=0.0, detail=True):
    """O aro de ouro com sete espinhos rúnicos; o do meio é o mais alto. Base em (48, 46) * scale."""
    X, Y = cv.X, cv.Y
    k = scale

    def P(x, y):
        return (ox + x * k, oy + y * k)
    yb = lambda x: 47.5 - 4.5 * ((x - 48) / 42) ** 2
    for i, kk in enumerate(range(-3, 4)):
        x = 48 + kk * 12.6
        top = (2.0, 8.5, 15.5, 23.0)[abs(kk)]
        lean = kk * 1.3
        base = yb(x) - 12
        wd = 5.0 - abs(kk) * 0.35
        pts = [P(x - wd, base + 4), P(x - wd * 0.62, base - (base - top) * 0.35), P(x - wd * 0.2 + lean * 0.8, top + 3), P(x + lean, top), P(x + wd * 0.2 + lean * 0.8, top + 3), P(x + wd * 0.62, base - (base - top) * 0.35), P(x + wd, base + 4)]
        m = poly(cv, spline(pts, 6))
        cx = ox + (x + lean * 0.5) * k
        hh = 4.0 * k * np.clip(1 - np.abs(X - cx) / (wd * k), 0, 1)
        cv.put(m, metal(normals(hh), diffuse=0.4, spec=1.2), flow=np.pi / 2, shadow=0.5, drop=1.0 * k, soft=1.0 * k)
        if detail and abs(kk) <= 2:
            for s in (-1, 1):
                by = base - (base - top) * 0.55
                tp = [P(x + s * wd * 0.45, by + 2.5), P(x + s * (wd * 0.45 + 4.5), by - 3.5), P(x + s * wd * 0.4, by - 1.0)]
                m = poly(cv, tp)
                cv.put(m, metal(normals((X * s) * 0.3), diffuse=0.4), shadow=0.4, drop=0.8, soft=0.8)
        if detail:
            cv.post.append(lambda img, x=x, top=top, base=base, i=i: glow(img, cv, rune(i + 3, ox + x * k, oy + (base - (base - top) * 0.3) * k, 5.2 * k), 0.55 * k, halo=1.0 * k, k=0.9))
        if abs(kk) <= 1:
            c, col = gem(cv, ox + (x + lean) * k, oy + (top + 0.5) * k, 2.4 * k, 2.4 * k)
            cv.put(c, col, shadow=0.3, drop=0.6, soft=0.6, brush=0.0)
    top_pts = [P(x, yb(x) - 14) for x in np.linspace(6, 90, 30)]
    bot_pts = [P(x, yb(x)) for x in np.linspace(90, 6, 30)]
    m = poly(cv, top_pts + bot_pts)
    lx = (X - ox) / k
    ly = (Y - oy) / k
    yy = ly - (yb(lx) - 7)
    h = (8.0 * np.sqrt(np.clip(1 - ((lx - 48) / 46) ** 2, 0, 1)) + 2.0 * np.exp(-((yy + 5.6) / 1.3) ** 2) + 2.0 * np.exp(-((yy - 5.6) / 1.3) ** 2)) * k
    cv.put(m, metal(normals(h), diffuse=0.4, spec=1.1, ao=cavity(h, 1.5 * k)), flow=0.0, shadow=0.6, drop=1.5 * k, soft=1.4 * k)
    for gx, rx, ry in ((48, 5.2, 5.6), (27, 3.2, 3.6), (69, 3.2, 3.6)) if detail else ((48, 4.0, 4.4),):
        gy = yb(gx) - 7
        c, u, v, r = ellipse(cv, ox + gx * k, oy + gy * k, (rx + 1.6) * k, (ry + 1.6) * k)
        cv.put(c, metal(normals(dome(r, 2.5 * k)), diffuse=0.4), shadow=0.5, drop=0.8 * k, soft=0.8 * k)
        c, col = gem(cv, ox + gx * k, oy + gy * k, rx * k, ry * k)
        cv.put(c, col, shadow=0, brush=0.0)
    if detail:
        rr = []
        for i, x in enumerate((15.0, 37.0, 59.0, 81.0)):
            rr += rune(i, ox + x * k, oy + (yb(x) - 7) * k, 6.0 * k)
        cv.post.append(lambda img: glow(img, cv, rr, 0.6 * k, halo=1.1 * k, k=0.85))
        cv.post.append(lambda img: glint(img, cv, ox + 40 * k, oy + 33.5 * k, 1.2 * k, 0.6))
        cv.post.append(lambda img: glint(img, cv, ox + 48 * k, oy + 4 * k, 1.0 * k, 0.5))


def crown():
    cv = Cv(96, 50, seed=31)
    scene(cv, -48, -208 - 46)
    crown_shape(cv)
    return paintover(cv, big=5.0, mix_ref=0.35)


def crown_small():
    """A coroa pequena do carrasco dourado (20 x 12, base em (10, 11)): a mesma coroa, sem os detalhes finos."""
    cv = Cv(20, 12, seed=32)
    scene(cv, 0, 0, kc=1.0)
    crown_shape(cv, scale=20 / 96, ox=0.0, oy=12 - 47.5 * 20 / 96 - 0.6, detail=False)
    return cv.rgba()


# ---------------------------------------------------------------- os braços
def arm():
    """A parte de cima do braço (60 x 130), pendurada do ombro (30, 12) até o cotovelo (30, 124): a manga
    carmesim franzida embaixo da ombreira e a braçadeira de ouro, com duas lâminas em cima e a linha de
    runas na frente. A luz é a mesma dos dois lados (o braço gira)."""
    cv = Cv(60, 130, seed=51)
    scene(cv, -(NECK[0] - SHOULDER[0]) - 30 - 40, -76 - 12)
    X, Y = cv.X, cv.Y
    grain = value_noise(cv.H, cv.W, 6 * S, cv.rng, 3) - 0.5
    light = unit((0.0, -0.45, 0.89))
    sleeve = spline([(30, 0), (52, 4), (56, 22), (52, 44), (30, 48), (8, 44), (4, 22), (8, 4)], 8, closed=True)
    m = poly(cv, sleeve)
    h = 14 * np.sqrt(np.clip(1 - ((X - 30) / 27) ** 2, 0, 1)) + 1.8 * np.sin(Y / 4.2 + 0.3 * np.sin(X / 5))
    cv.put(m, matte(normals(h), CRIMSON_R, wrap=0.35, rim=0.4, light=light, ao=cavity(h), var=grain * 0.25), flow=0.0, shadow=0)
    hw = lambda y: 19.5 - (y - 40) * 0.045
    for y0, y1 in ((32, 46), (42, 56)):
        pts = [(30 - hw(y0) - 1.5, y0), (30 + hw(y0) + 1.5, y0), (30 + hw(y1) + 1.5, y1 + 2), (30, y1 + 4), (30 - hw(y1) - 1.5, y1 + 2)]
        mm = poly(cv, spline(pts, 5, closed=True))
        hh = 16 * np.sqrt(np.clip(1 - ((X - 30) / 22) ** 2, 0, 1)) + 1.6 * np.exp(-((Y - (y1 + 1 + 0.004 * (X - 30) ** 2)) / 1.2) ** 2)
        cv.put(mm, metal(normals(hh), light=light, ao=cavity(hh, 2.0), var=grain * 0.15), flow=0.0, shadow=0.75, drop=1.8, soft=1.6)
    pts = [(30 - hw(52), 52), (30 + hw(52), 52), (30 + hw(122), 122), (30 - hw(122), 122)]
    mm = poly(cv, pts)
    hh = 15 * np.sqrt(np.clip(1 - ((X - 30) / (hw(Y) + 0.5)) ** 2, 0, 1)) + 1.4 * np.exp(-((X - 30) / 2.4) ** 2)
    cv.put(mm, metal(normals(hh), light=light, var=grain * 0.15), flow=np.pi / 2, shadow=0.8, drop=2.0, soft=1.8)
    rr = []
    for i, y in enumerate((70.0, 86.0, 102.0)):
        rr += rune(i + 5, 30.0, y, 8.0)
    cv.post.append(lambda img: engrave(img, cv, [((22.0, 60.0), (22.0, 116.0)), ((38.0, 60.0), (38.0, 116.0))], 0.8, 0.5))
    cv.post.append(lambda img: glow(img, cv, rr, 0.7, halo=1.4, k=0.85))
    cv.post.append(lambda img: glint(img, cv, 24.0, 58.0, 1.4, 0.45))
    return paintover(cv, big=7.0)


def fore():
    """O antebraço (64 x 120), do cotovelo (32, 10) até o punho da manopla: a cotoveleira redonda com o sol
    gravado, a braçadeira com as duas cintas e as runas e o punho largo, em sino. A mão é outro quadro (o
    punho fechado, ou a mão agarrada na agulha), com o meio a 118 px do cotovelo."""
    cv = Cv(64, 120, seed=61)
    scene(cv, -(NECK[0] - SHOULDER[0]) - 120, -76 - 40)
    X, Y = cv.X, cv.Y
    grain = value_noise(cv.H, cv.W, 6 * S, cv.rng, 3) - 0.5
    light = unit((0.0, -0.45, 0.89))
    hw = lambda y: 18.5 - (y - 20) * 0.03
    pts = [(32 - hw(18), 18), (32 + hw(18), 18), (32 + hw(100), 100), (32 - hw(100), 100)]
    m = poly(cv, pts)
    h = 15 * np.sqrt(np.clip(1 - ((X - 32) / (hw(Y) + 0.5)) ** 2, 0, 1))
    for yb in (40.0, 84.0):
        h += 2.2 * np.exp(-((Y - yb) / 2.2) ** 2)
    cv.put(m, metal(normals(h), light=light, ao=cavity(h, 2.0), var=grain * 0.15), flow=np.pi / 2, shadow=0)
    rr = []
    for i, y in enumerate((52.0, 64.0, 76.0)):
        rr += rune(i + 1, 32.0, y, 7.5)
    cv.post.append(lambda img: glow(img, cv, rr, 0.7, halo=1.4, k=0.85))
    cv.post.append(lambda img: engrave(img, cv, [((24.5, 46), (24.5, 80)), ((39.5, 46), (39.5, 80))], 0.7, 0.45))
    bell = spline([(32 - 19, 92), (32 + 19, 92), (32 + 24, 106), (32 + 23.5, 112), (32, 114), (32 - 23.5, 112), (32 - 24, 106)], 6, closed=True)
    m = poly(cv, bell)
    h = 16 * np.sqrt(np.clip(1 - ((X - 32) / 25) ** 2, 0, 1)) + 1.8 * np.exp(-((Y - 110.5) / 1.4) ** 2)
    cv.put(m, metal(normals(h), light=light, ao=cavity(h, 2.0)), flow=0.0, shadow=0.85, drop=2.0, soft=1.8)
    c, u, v, r = ellipse(cv, 25, 15, 19, 12.5, -0.25)
    h = dome(r, 7) + 1.4 * np.exp(-((r - 0.9) / 0.07) ** 2)
    cv.put(c, metal(normals(h), light=light), shadow=0.85, drop=2.0, soft=1.8)
    c, u, v, r = ellipse(cv, 32, 14, 13.5, 13.5)
    h = dome(r, 9) + 1.6 * np.exp(-((r - 0.9) / 0.06) ** 2)
    cv.put(c, metal(normals(h), light=light, spec=1.1), shadow=0.9, drop=2.2, soft=2.0)
    sun = []
    for i in range(12):
        a = i / 12 * 2 * np.pi
        sun.append(((32 + math.cos(a) * 4.5, 14 + math.sin(a) * 4.5), (32 + math.cos(a) * 9.5, 14 + math.sin(a) * 9.5)))
    cv.post.append(lambda img: engrave(img, cv, sun, 0.7, 0.55))
    c, col = gem(cv, 32, 14, 3.4, 3.4)
    cv.put(c, col, shadow=0.4, brush=0.0)
    for gx, gy in ((26.0, 7.5), (12.0, 102.0)):
        cv.post.append(lambda img, gx=gx, gy=gy: glint(img, cv, gx, gy, 1.3, 0.5))
    return paintover(cv, big=7.0)


def fist():
    """O punho fechado (56 x 52, o meio em (28, 26), que fica no fim do antebraço e gira com ele): as costas da
    mão de ouro saindo do punho da manopla, os nós dos dedos, os dedos dobrados embaixo e o polegar do lado
    de dentro (x maior; o da direita é o espelho)."""
    cv = Cv(56, 52, seed=62)
    scene(cv, -(NECK[0] - SHOULDER[0]) - 150, -76 - 70)
    X, Y = cv.X, cv.Y
    light = unit((0.0, -0.45, 0.89))
    back = spline([(9, 12), (47, 12), (50, 24), (28, 28), (7, 24)], 6, closed=True)
    m = poly(cv, back)
    h = 12 * np.sqrt(np.clip(1 - ((X - 28) / 23) ** 2, 0, 1)) + 3 * sstep(12, 18, Y)
    cv.put(m, metal(normals(h), light=light), flow=0.0, shadow=0)
    for fx in (11.5, 22.0, 33.0, 43.5):
        c, u, v, r = ellipse(cv, fx, 38.5, 5.2, 7.6)
        cv.put(c, metal(normals(dome(r, 6)), light=light), flow=np.pi / 2, shadow=0.75, drop=1.6, soft=1.4)
    for fx in (11.5, 22.0, 33.0, 43.5):
        c, u, v, r = ellipse(cv, fx, 29.0, 5.6, 5.0)
        cv.put(c, metal(normals(dome(r, 6.5)), light=light, spec=1.1), shadow=0.8, drop=1.8, soft=1.4)
    cov, hh, _ = tube(cv, [(48.0, 12.0), (52.5, 22.0), (50.0, 32.0)], 5.4, 4.6)
    cv.put(cov, metal(normals(hh * 1.2), light=light), flow=np.pi / 2, shadow=0.85, drop=1.6, soft=1.4)
    cv.post.append(lambda img: glint(img, cv, 18.0, 28.0, 1.3, 0.5))
    return paintover(cv, big=6.0)


def grip():
    """A mão agarrada na agulha (68 x 72; o meio da agulha, na altura da pegada, em (26, 44); a da direita é o
    espelho). É a pegada de quem sobe numa corda: o antebraço vem de baixo, do lado de dentro, e a palma fica
    contra a pedra; de frente se vê a placa das costas da mão do lado de dentro, os nós dos dedos em coluna na
    quina da frente e os quatro dedos de placas dando a volta na pedra, com as pontas sumindo atrás da beirada
    de fora. O polegar fecha por trás. A mão fica toda acima do punho da manopla (que termina em (+11, +12) do
    meio da agulha e cobre o pulso)."""
    W, H, PX, PY = 68, 72, 26.0, 44.0
    cv = Cv(W, H, seed=63)
    scene(cv, -276 - PX, -116 - PY)
    X, Y = cv.X, cv.Y
    light = unit((0.5, -0.45, 0.74))
    grain = value_noise(cv.H, cv.W, 4 * S, cv.rng, 3) - 0.5
    # o pulso, descendo para o punho da manopla (quase todo coberto por ele)
    cov, hh, _ = tube(cv, [(PX + 27, PY + 27), (PX + 15, PY + 3)], 10.0, 9.0)
    cv.put(cov, metal(normals(hh * 1.1), light=light, gain=0.8), flow=1.1, shadow=0)
    # a placa das costas da mão, de lado (virada para dentro e para a frente)
    back = spline([(PX + 7.5, PY - 33), (PX + 17, PY - 35), (PX + 24.5, PY - 27), (PX + 26.5, PY - 8), (PX + 22, PY + 7),
                   (PX + 12, PY + 8.5), (PX + 7.5, PY + 4)], 6, closed=True)
    m = poly(cv, back)
    tilt = 0.55 * (PX + 27 - X)
    ridge = 2.2 * np.exp(-((X - (PX + 15.5 + (Y - PY) * -0.08)) / 3.2) ** 2)
    h = tilt + ridge + 2.0 * sstep(0, 3, inside(m))
    cv.put(m, metal(normals(h), light=light, ao=cavity(h, 2.0), var=grain * 0.12), flow=np.pi / 2, shadow=0.8, drop=1.6, soft=1.6)
    # os quatro dedos, do mindinho (embaixo) ao indicador, dando a volta na pedra: cada dedo é um pedaço de
    # toro em volta do eixo da agulha (raio 12.6 da pedra mais o dedo); de frente ele vai do nó, na quina
    # de dentro, até a beirada de fora, onde a volta some atrás e a silhueta do dedo fica redonda
    rows = [(PY + 1.0, 4.0, 0.56), (PY - 7.1, 4.6, 0.6), (PY - 16.1, 4.9, 0.62), (PY - 25.2, 4.7, 0.6)]
    joints = []
    for fy, fr, thk in rows:
        rho0 = 12.6 + fr + 0.3
        dy = (Y - fy) / fr
        cphi = np.sqrt(np.clip(1 - dy * dy, 0, 1))
        rho = rho0 + fr * cphi
        sth = (X - PX) / rho
        d_top = np.abs(Y - fy) - fr
        d_out = -(X - PX) - rho
        d_in = (X - PX) - rho * math.sin(thk)
        cov = aa(np.maximum(np.maximum(d_top, d_out), d_in))
        sth = np.clip(sth, -1, 1)
        cth = np.sqrt(np.clip(1 - sth * sth, 0, 1))
        n = np.dstack([cphi * sth, dy * 0.95, cphi * cth + 0.05]).astype(np.float32)
        n /= np.linalg.norm(n, axis=2, keepdims=True)
        # a volta de fora vira para longe do núcleo e de quem olha: escurece
        away = -0.5 * sstep(-0.35, -1.0, sth) - 0.15 * np.abs(dy) ** 3
        cv.put(cov, metal(n, light=light, spec=1.0, var=grain * 0.08 + away), flow=0.0, shadow=0.85, drop=1.5, soft=1.1)
        # as juntas das placas: onde a volta passa de 0 e de -0.8 rad (curvas, seguindo o dedo redondo)
        for thj in (0.0, -0.8):
            pts = []
            for k in np.linspace(-0.92, 0.92, 9):
                rr = rho0 + fr * math.sqrt(1 - k * k)
                pts.append((PX + rr * math.sin(thj), fy + k * fr))
            joints.append(segs_of(pts))
        # o nó do dedo: a placa redonda na quina de dentro
        kx = PX + (rho0 + fr * 0.55) * math.sin(thk)
        c, u, v, r = ellipse(cv, kx, fy, fr * 0.8, fr * 0.92)
        cv.put(c, metal(normals(dome(r, 4.5)), light=light, spec=1.2), shadow=0.75, drop=1.2, soft=1.0)
    cv.post.append(lambda img: engrave(img, cv, [sg for j in joints for sg in j], 0.55, 0.5, 0.3))
    # a runa acesa na placa das costas da mão e o brilho no nó do indicador
    rr_ = rune(5, PX + 17.5, PY - 13, 9.0, -0.08)
    cv.post.append(lambda img: glow(img, cv, rr_, 0.7, halo=1.3, k=0.8))
    cv.post.append(lambda img: glint(img, cv, PX + 11.5, PY - 28.5, 1.2, 0.5))
    return paintover(cv, mix_ref=0.3, big=3.6)


# ---------------------------------------------------------------- a lâmina da foice
def blade():
    """A lâmina da foice (200 x 64): presa na haste pelo encaixe de bronze na raiz (14, 44) e curvada para o
    lado do pivô (para cima na folha), acompanhando o arco do golpe; o fio claro fica do lado de fora e a
    lombada grossa, com as runas, do lado de dentro."""
    W, H = BLADE['w'], BLADE['h']
    cv = Cv(W, H, seed=71)
    scene(cv, 0, 0, kc=0.8)
    X, Y = cv.X, cv.Y
    rx, ry = BLADE['root']
    R = 600.0
    yc = lambda x: ry - (x - rx) ** 2 / (2 * R)
    s = np.clip((X - rx) / 184.0, 0, 1)
    a = 9.5 * (1 - s ** 1.7)
    b = 13.0 * (1 - s ** 1.25) * (0.86 + 0.2 * np.sin(np.pi * np.clip(s * 1.1, 0, 1)))
    yy = Y - yc(X)
    root_k = sstep(rx - 1, rx + 10, X)
    a = a * root_k + 6.5 * (1 - root_k)
    b = b * root_k + 6.5 * (1 - root_k)
    sd = np.maximum(np.maximum(-a - yy, yy - b), np.maximum(rx - 2 - X, X - (rx + 186)))
    m = aa(sd)
    tt = (yy + a) / np.maximum(a + b, 1e-3)
    h = 4.5 * np.exp(-(tt / 0.18) ** 2) + 2.6 * (1 - tt) - 0.9 * np.exp(-((tt - 0.42) / 0.06) ** 2)
    h = h * (1 - s * 0.6)
    light = unit((0.0, -0.45, 0.89))
    cv.put(m, metal(normals(h), diffuse=0.35, spec=1.2, light=light, gain=1.05), flow=0.0, shadow=0)

    def edge(img):
        al = img[..., 3]
        d = b - yy
        honed = np.exp(-(d / 1.6) ** 2) * (X > rx + 6) * al
        img[..., :3] = img[..., :3] * (1 - (honed * 0.8)[..., None]) + (honed * 0.8)[..., None] * np.array([1.0, 0.94, 0.8], np.float32)
        hot = np.exp(-(d / 0.6) ** 2) * (X > rx + 6) * al
        img[..., :3] += (hot * 0.4)[..., None] * np.array([1.0, 0.7, 0.3], np.float32)
    cv.post.append(edge)
    rr = []
    for i, x in enumerate(np.linspace(40, 140, 5)):
        x = float(x)
        yv = yc(x) - 9.5 * (1 - ((x - rx) / 184) ** 1.7) * 0.42
        rr += rune(i + 2, x, yv, 5.5, math.atan2(-(x - rx) / R, 1.0))
    cv.post.append(lambda img: glow(img, cv, rr, 0.6, halo=1.2, k=0.85))
    cov, hh, _ = tube(cv, [(rx, ry - 14.0), (rx, ry + 10.0)], 6.5)
    cv.put(cov, metal(normals(hh * 1.3), BRONZE_R, light=light), shadow=0.6, drop=1.0, soft=1.0, brush=0.6)
    for yv in (ry - 8.0, ry + 4.0):
        cov, hh, _ = tube(cv, [(rx - 7.2, yv), (rx + 7.2, yv)], 1.6)
        cv.put(cov, metal(normals(hh), light=light), shadow=0.5, drop=0.8, soft=0.6, brush=0.0)
    for gx in (60.0, 110.0):
        cv.post.append(lambda img, gx=gx: glint(img, cv, gx, yc(gx) - 6.0, 1.3, 0.55))
    return paintover(cv, big=5.0, mix_ref=0.35)


# ---------------------------------------------------------------- as agulhas
TSTONE_R = ramp([(0.0, (0.02, 0.026, 0.03)), (0.25, (0.06, 0.075, 0.08)), (0.5, (0.12, 0.145, 0.15)), (0.75, (0.22, 0.25, 0.25)),
                 (1.0, (0.42, 0.43, 0.39))])


def spire():
    """A agulha da esquerda (36 x 400; a da direita é o espelho), de pé na borda de trás do terraço (a base em
    (18, 400), 6 px abaixo do chão): a pedra escura das Torres talhada em oito faces, afinando até a ponta,
    com os painéis fundos das runas acesas na face da frente, as cintas de bronze (a da base, a da pegada, a
    do meio e a da corrente, com o olhal virado para o núcleo) e o capuz de bronze na ponta. A luz do núcleo
    vem do lado de dentro (a direita)."""
    W, H = SPIRE['w'], SPIRE['h']
    cv = Cv(W, H, seed=81)
    scene(cv, -276 - 18, 6 - 400)
    X, Y = cv.X, cv.Y
    light = unit((0.62, -0.5, 0.6))
    grain = value_noise(cv.H, cv.W, 4 * S, cv.rng, 4) - 0.5
    hw = lambda y: np.where(y > 44, 8.0 + (15.0 - 8.0) * (y - 44) / (H - 44), 8.0 * np.clip((y - 2) / 42, 0, 1) ** 0.8)
    half = hw(Y)
    m = aa(np.maximum(np.abs(X - 18) - half, 1 - Y))
    u = (X - 18) / np.maximum(half, 0.5)
    # as oito faces: a da frente, as duas inclinadas e uma quina viva entre elas
    side = np.sign(u) * sstep(0.36, 0.46, np.abs(u))
    nx = side * 0.72 + np.sign(u) * sstep(0.9, 1.0, np.abs(u)) * 0.25
    n = np.dstack([nx, np.zeros_like(nx), np.sqrt(np.clip(1 - nx * nx, 0.05, 1))]).astype(np.float32)
    # as juntas dos tambores, a pedra lascada nas quinas
    joints = np.arange(392, 44, -21.5)
    jd = np.min(np.abs(Y[..., None] - joints[None, None, :]), axis=2)
    hj = -1.2 * np.exp(-(jd / 0.7) ** 2) + 0.7 * value_noise(cv.H, cv.W, 2.5 * S, cv.rng, 2)
    nj = normals(hj)
    n = n + np.dstack([nj[..., 0], nj[..., 1], np.zeros_like(nx)]) * 0.8
    n = n / np.linalg.norm(n, axis=2, keepdims=True)
    col = matte(n, TSTONE_R, core=0.95, cloud=0.35, rim=0.35, wrap=0.1, light=light, ao=cavity(hj, 1.5, 0.2), var=grain * 0.45)
    cv.put(m, col, flow=np.pi / 2, shadow=0)
    # os painéis fundos da frente, com as runas
    panels = []
    for (y0, y1) in ((304.0, 368.0), (172.0, 228.0), (90.0, 150.0)):
        pw = float(hw(np.array((y0 + y1) / 2))) * 0.36
        pm = poly(cv, [(18 - pw, y0), (18 + pw, y0), (18 + pw, y1), (18 - pw, y1)])
        ph = -1.5 * sstep(0, 1.2, inside(pm))
        cv.put(pm, matte(normals(ph) * 0.5 + n * 0.5, TSTONE_R, core=0.7, cloud=0.25, rim=0.2, light=light, var=grain * 0.3, amb=0.04), shadow=0, brush=0.6)
        panels.append((y0, y1))
    # a luva da pegada: o bronze em gomos onde as mãos fecham (a pegada é em 278; a mão vai de 248 a 284)
    sl = poly(cv, [(18 - hw(243.0) - 1.0, 243.0), (18 + hw(243.0) + 1.0, 243.0), (18 + hw(289.0) + 1.0, 289.0), (18 - hw(289.0) - 1.0, 289.0)])
    uu = np.clip((X - 18) / (hw(Y) + 1.0), -1, 1)
    hh = 13 * np.sqrt(np.clip(1 - uu * uu, 0, 1)) + 0.8 * np.cos(2 * np.pi * (Y - 243.0) / 3.0)
    cv.put(sl, metal(normals(hh), BRONZE_R, diffuse=0.5, light=light, var=grain * 0.3, gain=0.82), flow=0.0, shadow=0.6, drop=1.2, soft=1.0)
    for yb_, th in ((392.0, 9.0), (241.0, 5.0), (291.0, 5.0), (161.0, 6.0), (74.0, 8.0), (46.0, 4.0)):
        hwb = float(hw(np.array(yb_))) + 1.6
        pts = [(18 - hwb, yb_ - th / 2), (18 + hwb, yb_ - th / 2), (18 + hwb, yb_ + th / 2), (18 - hwb, yb_ + th / 2)]
        mm = poly(cv, pts)
        uu = np.clip((X - 18) / hwb, -1, 1)
        hh = 15 * np.sqrt(np.clip(1 - uu * uu, 0, 1)) + 1.2 * np.exp(-((Y - (yb_ - th / 2 + 1.2)) / 0.9) ** 2) + 1.2 * np.exp(-((Y - (yb_ + th / 2 - 1.2)) / 0.9) ** 2)
        cv.put(mm, metal(normals(hh), BRONZE_R, diffuse=0.5, light=light, var=grain * 0.3), flow=0.0, shadow=0.7, drop=1.6, soft=1.4)
        for rx_ in np.linspace(18 - hwb * 0.7, 18 + hwb * 0.7, 4 if th > 8 else 3):
            c, uu2, vv2, rr2 = ellipse(cv, float(rx_), yb_, 1.2, 1.2)
            cv.put(c, metal(normals(dome(rr2, 1.2)), BRONZE_R, light=light), shadow=0.5, drop=0.6, soft=0.5, brush=0.0)
    c, u2, v2, r2 = ellipse(cv, 25.5, 74.0, 4.4, 4.4)
    hole = ellipse(cv, 25.5, 74.0, 2.1, 2.1)[0]
    cv.put(c * (1 - hole), metal(normals(dome(r2, 2.5)), BRONZE_R, light=light), shadow=0.5, drop=1.0, soft=0.8, brush=0.0)
    tip = poly(cv, spline([(18, 0.5), (21.5, 14), (24.5, 34), (26, 46), (10, 46), (11.5, 34), (14.5, 14)], 6))
    uu = np.clip((X - 18) / np.maximum(hw(Y) + 2, 0.5), -1, 1)
    cv.put(tip, metal(normals(10 * np.sqrt(np.clip(1 - uu * uu, 0, 1))), BRONZE_R, light=light), flow=np.pi / 2, shadow=0.5)
    c, col = gem(cv, 18, 30, 3.0, 3.6)
    cv.put(c, col, shadow=0.3, brush=0.0)
    rr = []
    gi = 1
    for (y0, y1) in panels:
        for y in np.linspace(y0 + 14, y1 - 14, 2):
            rr += rune(gi, 18.0, float(y), 10.0)
            gi += 1
    cv.post.append(lambda img: glow(img, cv, rr, 0.85, halo=2.2, k=0.95))
    cv.post.append(lambda img: glint(img, cv, 22.5, 240.0, 1.4, 0.4))
    return paintover(cv, big=6.0)


# ---------------------------------------------------------------- o núcleo
def core():
    """O núcleo (60 x 60, o meio em (30, 30)): a esfera de Âmbar de raio 22, acesa por dentro (o miolo quase
    branco um pouco abaixo do meio, a borda funda e vermelha, onde o Âmbar é mais grosso), com as memórias
    girando dentro em fios de luz, presa numa gaiola fina de bronze (o anel do meio e três meridianos, a
    metade de trás vista através do Âmbar), o remate de cima, a gota de baixo e as duas orelhas com as
    argolas das correntes (em (6, 26) e (54, 26))."""
    cv = Cv(60, 60, seed=91)
    scene(cv, 0, 0, kc=1.0)
    X, Y = cv.X, cv.Y
    Rr = 22.0
    c, u, v, r = ellipse(cv, 30, 30, Rr, Rr)
    rng = cv.rng
    swirl = value_noise(cv.H, cv.W, 6 * S, rng, 4) - 0.5
    cloud = value_noise(cv.H, cv.W, 3 * S, rng, 3) - 0.5
    # o corpo: a luz de dentro cai com a espessura (mais grosso na borda), e o miolo fica abaixo do meio
    t = np.clip(1 - np.hypot(u * 1.05, (v - 0.14) * 1.1), 0, 1)
    t = t ** 0.75 * (0.86 + 0.28 * swirl + 0.12 * cloud)
    col = amber(0.08 + 1.0 * t, 1.0)
    rim = np.clip(r, 0, 1) ** 4
    col = col * (1 - 0.55 * rim)[..., None] + rim[..., None] * np.array([0.32, 0.06, 0.03], np.float32) * 0.5
    n = normals(dome(r, Rr))
    # o reflexo da janela de céu em cima e o fio de contraluz frio na borda de cima
    sky = np.exp(-((u + 0.38) / 0.2) ** 2 - ((v + 0.55) / 0.12) ** 2)
    col = col + sky[..., None] * np.array([0.75, 0.7, 0.85], np.float32) * 0.75
    edge = np.exp(-((r - 0.955) / 0.03) ** 2) * sstep(0.2, -0.6, v)
    col = col + edge[..., None] * C_SKY * 0.15
    cv.put(c, col, flow=0.6, shadow=0, brush=1.0)
    inner = (r < 0.97).astype(np.float32)
    # as memórias: fios de luz em órbitas inclinadas, alguns mais acesos
    wisps = []
    for i in range(7):
        rad = rng.uniform(7, 18)
        tilt = rng.uniform(-0.8, 0.8)
        squash = rng.uniform(0.25, 0.6)
        a0 = rng.uniform(0, 2 * np.pi)
        sweep = rng.uniform(1.3, 2.6)
        grow = rng.uniform(-0.25, 0.25)
        pts = []
        for k in np.linspace(0, 1, 18):
            a = a0 + sweep * k
            rr_ = rad * (1 + grow * k)
            px, py = math.cos(a) * rr_, math.sin(a) * rr_ * squash
            pts.append((30 + px * math.cos(tilt) - py * math.sin(tilt), 31.5 + px * math.sin(tilt) + py * math.cos(tilt)))
        wisps.append((segs_of(pts), rng.uniform(0.45, 1.0)))

    def draw_wisps(img):
        for segs, k in wisps:
            d, along = seg_dist(cv, segs, pad=4)
            fade = np.clip(np.sin(np.pi * np.clip(along, 0, 1)), 0, 1) ** 0.8
            line = np.exp(-(d / 0.45) ** 2) * fade * k * inner
            halo = np.exp(-(d / 1.8) ** 2) * fade * k * inner * 0.35
            img[..., :3] += line[..., None] * np.array([1.0, 0.95, 0.8], np.float32) * 0.6 + halo[..., None] * np.array([1.0, 0.62, 0.2], np.float32) * 0.5
    cv.post.append(draw_wisps)
    # a gaiola: fios de bronze finos (a metade de trás, vista através do Âmbar, escura e fraca)
    light = unit((0.0, -0.5, 0.85))
    wire = 0.75

    def ring(pts_fn, n_=64):
        return [pts_fn(k) for k in np.linspace(0, 2 * np.pi, n_ + 1)]

    loops = []
    # o anel do meio (a esfera vista um pouco de cima: a metade da frente é a de baixo)
    loops.append(ring(lambda a: (30 + math.cos(a) * 22.6, 30 + math.sin(a) * 5.4, math.sin(a))))
    for phi in (math.radians(55), math.radians(-55), math.radians(90)):
        loops.append(ring(lambda a, phi=phi: (30 + math.cos(a) * 22.6 * math.cos(phi), 30 + math.sin(a) * 22.6, math.cos(a) * math.sin(phi))))
    back_segs, front_segs = [], []
    for pts in loops:
        for p, q in zip(pts[:-1], pts[1:]):
            seg = ((p[0], p[1]), (q[0], q[1]))
            (front_segs if p[2] + q[2] >= 0 else back_segs).append(seg)
    d, _ = seg_dist(cv, back_segs, pad=3)
    bw = aa(d - wire * 0.8) * c
    cv.put(bw * 0.55, np.broadcast_to(np.array([0.22, 0.07, 0.02], np.float32), (cv.H, cv.W, 3)), shadow=0, brush=0.0)
    d, _ = seg_dist(cv, front_segs, pad=3)
    fw = aa(d - wire)
    hh = dome(np.clip(d / wire, 0, 1), 1.0) * wire
    cv.put(fw, metal(normals(hh * 1.4 + dome(r, 4) * 0.4), BRONZE_R, diffuse=0.45, light=light, gain=1.35), shadow=0.5, drop=0.6, soft=0.6, brush=0.0)
    # os nós onde os meridianos cruzam o anel do meio
    for kx_, ky_ in ((42.7, 34.4), (17.3, 34.4), (30.0, 35.4)):
        kc_, ku, kv, kr = ellipse(cv, kx_, ky_, 1.5, 1.3)
        cv.put(kc_, metal(normals(dome(kr, 1.2)), BRONZE_R, light=light, gain=1.3, spec=1.2), shadow=0.5, drop=0.5, soft=0.5, brush=0.0)
    # o remate de cima e a gota de baixo
    c2, u2, v2, r2 = ellipse(cv, 30, 8.6, 5.6, 2.4)
    cv.put(c2, metal(normals(dome(r2, 2.0)), BRONZE_R, light=light, gain=1.25), shadow=0.6, drop=0.8, soft=0.8, brush=0.0)
    c2, u2, v2, r2 = ellipse(cv, 30, 6.4, 2.2, 2.2)
    cv.put(c2, metal(normals(dome(r2, 2.0)), BRONZE_R, light=light, gain=1.3, spec=1.2), shadow=0.4, drop=0.6, soft=0.6, brush=0.0)
    c2, u2, v2, r2 = ellipse(cv, 30, 51.6, 4.6, 2.0)
    cv.put(c2, metal(normals(dome(r2, 1.6)), BRONZE_R, light=light, gain=1.15), shadow=0.4, drop=0.6, soft=0.6, brush=0.0)
    drop = poly(cv, spline([(28.2, 52.5), (31.8, 52.5), (31.2, 55.5), (30, 58.4), (28.8, 55.5)], 6, closed=True))
    cv.put(drop, metal(normals(blur(drop, 0.8 * S) * 2.0), BRONZE_R, light=light, gain=1.1), shadow=0.3, drop=0.5, soft=0.5, brush=0.0)
    # as orelhas com as argolas das correntes
    for sx, ex in ((6.0, 8.6), (54.0, 51.4)):
        cov, hh2, _ = tube(cv, [(ex, 31.0), (sx + (2.4 if sx < 30 else -2.4), 27.6)], 1.3, 1.0)
        cv.put(cov, metal(normals(hh2 * 1.3), BRONZE_R, light=light, gain=1.2), shadow=0.4, drop=0.5, soft=0.5, brush=0.0)
        oc, uu, vv, rr = ellipse(cv, sx, 26.0, 3.4, 3.4)
        ic = ellipse(cv, sx, 26.0, 1.7, 1.7)[0]
        ringh = np.sqrt(np.clip(1 - ((rr - 0.75) / 0.25) ** 2, 0, 1)) * 1.4
        cv.put(oc * (1 - ic), metal(normals(ringh), BRONZE_R, light=light, gain=1.2, spec=1.0), shadow=0.5, drop=0.6, soft=0.6, brush=0.0)
    cv.post.append(lambda img: glint(img, cv, 21.5, 15.5, 1.3, 0.55))
    return paintover(cv, mix_ref=0.45, big=4.0, relief=0.15, outline=0.45, rim=0.15)


# ---------------------------------------------------------------- miúdos
def bead():
    """A conta de Âmbar que cai (12 x 12): o furo do fio atravessando e o brilho do núcleo."""
    cv = Cv(12, 12, seed=101)
    scene(cv, 0, 0, kc=1.0)
    c, col = gem(cv, 6, 6, 4.8, 4.8)
    hole = np.exp(-((cv.Y - 6 + (cv.X - 6) * 0.25) / 0.6) ** 2) * (np.abs(cv.X - 6) < 4.2) * 0.5
    cv.put(c, col * (1 - hole[..., None]), shadow=0, brush=0.0)
    img = cv.rgba()
    edge = np.clip(img[..., 3] - ndi.minimum_filter(img[..., 3], size=3), 0, 1)
    img[..., :3] *= (1 - 0.5 * edge)[..., None]
    return img


def link(side=False):
    """Um elo da corrente (10 x 6 de frente, 10 x 3 de lado), de ferro escurecido, deitado no eixo x."""
    light = unit((0.0, 0.4, 0.9))
    if side:
        cv = Cv(10, 3, seed=111)
        scene(cv, 0, 0, kc=0.6)
        cov, h, _ = tube(cv, [(1.6, 1.5), (8.4, 1.5)], 1.25)
        cv.put(cov, metal(normals(h * 1.4), IRON_R, diffuse=0.5, spec=0.8, light=light, gain=1.3), shadow=0)
        return cv.rgba()
    cv = Cv(10, 6, seed=112)
    scene(cv, 0, 0, kc=0.6)
    oc, u, v, r = ellipse(cv, 5, 3, 4.8, 2.8)
    ic = ellipse(cv, 5, 3, 2.8, 1.0)[0]
    ringd = np.abs(r - 0.7) / 0.3
    h = np.sqrt(np.clip(1 - ringd ** 2, 0, 1)) * 1.4
    cv.put(oc * (1 - ic), metal(normals(h), IRON_R, diffuse=0.5, spec=0.8, light=light, gain=1.3), shadow=0)
    return cv.rgba()


# ---------------------------------------------------------------- a folha
def pack(items, W, pad=2):
    """Empacota os quadros (nome, w, h) pela linha do horizonte: cada um no lugar mais baixo onde cabe."""
    sky = [[0, W, 0]]
    pos = {}
    for name, w, h in sorted(items, key=lambda t: (-t[2], -t[1])):
        w2, h2 = w + pad, h + pad
        best = None
        for i in range(len(sky)):
            x = sky[i][0]
            if x + w2 > W:
                break
            y, span, j = 0, 0, i
            while span < w2 and j < len(sky):
                y = max(y, sky[j][2])
                span += sky[j][1]
                j += 1
            if span < w2:
                continue
            if best is None or y + h2 < best[1] + best[2] or (y + h2 == best[1] + best[2] and x < best[0]):
                best = (x, y, h2)
        x, y, _ = best
        pos[name] = (x, y)
        new = []
        for sx, sw, sy in sky:
            a, b = sx, sx + sw
            if b <= x or a >= x + w2:
                new.append([sx, sw, sy])
                continue
            if a < x:
                new.append([a, x - a, sy])
            if b > x + w2:
                new.append([x + w2, b - (x + w2), sy])
        new.append([x, w2, y + h2])
        new.sort()
        merged = []
        for seg in new:
            if merged and merged[-1][2] == seg[2] and merged[-1][0] + merged[-1][1] == seg[0]:
                merged[-1][1] += seg[1]
            else:
                merged.append(seg)
        sky = merged
    Hh = max(pos[n][1] + h for n, w, h in items)
    return pos, Hh


def to8(img):
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


PARTS = {
    'chest': chest, 'pauldron': pauldron, 'head': head, 'crown': crown, 'crown-s': crown_small,
    'arm': arm, 'fore': fore, 'fist': fist, 'grip': grip, 'blade': blade, 'spire': spire, 'core': core, 'bead': bead,
    'link': lambda: link(False), 'link-side': lambda: link(True),
}


def build(only=None):
    frames = {}
    for name, fn in PARTS.items():
        if only and name not in only:
            continue
        print('pintando', name, flush=True)
        frames[name] = to8(fn())
    return frames


def write_sheet(frames, out_dir, width=1024):
    items = [(n, im.shape[1], im.shape[0]) for n, im in frames.items()]
    pos, H = pack(items, width)
    H = int(math.ceil(H / 4) * 4)
    sheet = np.zeros((H, width, 4), np.uint8)
    meta = {}
    for n, im in frames.items():
        x, y = pos[n]
        h, w = im.shape[:2]
        sheet[y:y + h, x:x + w] = im
        meta[n] = {'frame': {'x': x, 'y': y, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
                   'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'sourceSize': {'w': w, 'h': h}}
    Image.fromarray(sheet, 'RGBA').save(os.path.join(out_dir, 'coroado.png'), optimize=True)
    data = {'frames': meta, 'meta': {'image': 'coroado.png', 'size': {'w': width, 'h': H}, 'scale': '1'},
            'frameWidth': frames['chest'].shape[1], 'frameHeight': frames['chest'].shape[0], 'originX': 0.5, 'originY': 0.5,
            'scale': S, 'anims': {}}
    with open(os.path.join(out_dir, 'coroado.json'), 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print('folha', width, 'x', H)


# ---------------------------------------------------------------- a prévia da arena
def ik(Sx, Sy, gx, gy, side, L1=112.0, L2=118.0):
    """Os dois ossos como na luta (Coroado.placeArm): o cotovelo para fora e um pouco para baixo."""
    d = min(math.hypot(gx - Sx, gy - Sy), L1 + L2 - 1)
    base = math.atan2(gy - Sy, gx - Sx)
    A = math.acos(max(-1, min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))))
    ang = max((base + A, base - A), key=lambda a: math.cos(a) * side + math.sin(a) * 0.5)
    e = (Sx + math.cos(ang) * L1, Sy + math.sin(ang) * L1)
    return ang, e


def preview(frames, path, zoom=3, grip=116, sky_img=None):
    """Monta o colosso como a luta monta (o pescoço, os ombros, os braços pelos dois ossos até as agulhas, o
    núcleo nas correntes) na frente de um céu e de um terraço de mentira, para ver as peças juntas."""
    c, F = 1024.0, 704.0
    vx0, vy0 = c - 320, F - 333
    Wv, Hv = 640 * zoom, 360 * zoom
    yy = np.linspace(0, 1, Hv)[:, None]
    sky = np.array([0.07, 0.06, 0.12]) * (1 - yy[..., None]) + np.array([0.62, 0.34, 0.17]) * yy[..., None] ** 2.2
    canvas = np.dstack([np.broadcast_to(sky, (Hv, Wv, 3)), np.ones((Hv, Wv))]).astype(np.float32).copy()

    def place(name, x, y, ox, oy, rot=0.0, flip=False, sc=1.0):
        im = frames[name].astype(np.float32) / 255
        if flip:
            im = im[:, ::-1]
            ox = im.shape[1] - ox
        pil = Image.fromarray(to8(im), 'RGBA')
        k = zoom / S * sc
        pil = pil.resize((max(1, int(round(pil.width * k))), max(1, int(round(pil.height * k)))), Image.LANCZOS)
        ox *= k
        oy *= k
        if rot:
            big = Image.new('RGBA', (pil.width * 3, pil.height * 3))
            big.paste(pil, (pil.width, pil.height))
            cx, cy = pil.width + ox, pil.height + oy
            big = big.rotate(-math.degrees(rot), resample=Image.BICUBIC, center=(cx, cy))
            pil, ox, oy = big, cx, cy
        arr = np.asarray(pil, np.float32) / 255
        px = int(round((x - vx0) * zoom - ox))
        py = int(round((y - vy0) * zoom - oy))
        h, w = arr.shape[:2]
        x0, y0 = max(0, px), max(0, py)
        x1, y1 = min(Wv, px + w), min(Hv, py + h)
        if x0 >= x1 or y0 >= y1:
            return
        sub = arr[y0 - py:y1 - py, x0 - px:x1 - px]
        a = sub[..., 3:4]
        canvas[y0:y1, x0:x1, :3] = canvas[y0:y1, x0:x1, :3] * (1 - a) + sub[..., :3] * a

    neck = (c, F - 104)
    sh = {s: (c + s * (NECK[0] - SHOULDER[0]), neck[1] + (SHOULDER[1] - NECK[1])) for s in (-1, 1)}
    spires = (c - 276, c + 276)
    place('chest', neck[0], neck[1], NECK[0] * S, NECK[1] * S)
    for s in (-1, 1):
        S0 = sh[s]
        g = (spires[0 if s < 0 else 1] - s * 4, F - grip)
        ang, e = ik(S0[0], S0[1], g[0], g[1], s)
        place('arm', S0[0], S0[1], 30 * S, 12 * S, ang - math.pi / 2, s > 0)
    for s in (-1, 1):
        j = PAULDRON['joint']
        place('pauldron', sh[s][0], sh[s][1], j[0] * S, j[1] * S, 0, s > 0)
    place('head', neck[0], neck[1], 60 * S, 128 * S)
    place('crown', neck[0], neck[1] - 104, 48 * S, 46 * S)
    for i, x in enumerate(spires):
        place('spire', x, F + 6, 18 * S, 400 * S, 0, i == 1)
    for s in (-1, 1):
        place('grip', spires[0 if s < 0 else 1], F - grip, 26 * S, 44 * S, 0, s > 0)
    for s in (-1, 1):
        S0 = sh[s]
        g = (spires[0 if s < 0 else 1] - s * 4, F - grip)
        ang, e = ik(S0[0], S0[1], g[0], g[1], s)
        place('fore', e[0], e[1], 32 * S, 10 * S, math.atan2(g[1] - e[1], g[0] - e[0]) - math.pi / 2, s > 0)
    ty = int((F - vy0) * zoom)
    canvas[ty:, :, :3] = np.array([0.11, 0.13, 0.14])
    canvas[ty:ty + zoom * 2, :, :3] = np.array([0.2, 0.24, 0.22])
    cy = F - 290
    for s, x in ((-1, spires[0]), (1, spires[1])):
        ax, ay = x - s * 6, F - 320
        bx, by = c + s * 24, cy - 4
        n = int(round((math.hypot(bx - ax, by - ay) + 26 * 0.6) / 7))
        for i in range(n + 1):
            t = i / n
            px = ax + (bx - ax) * t
            py = ay + (by - ay) * t + 26 * 4 * t * (1 - t)
            t2 = min(1, t + 0.01)
            q = (ax + (bx - ax) * t2, ay + (by - ay) * t2 + 26 * 4 * t2 * (1 - t2))
            t3 = max(0, t - 0.01)
            o = (ax + (bx - ax) * t3, ay + (by - ay) * t3 + 26 * 4 * t3 * (1 - t3))
            place('link-side' if i % 2 else 'link', px, py, 5 * S, (1.5 if i % 2 else 3) * S, math.atan2(q[1] - o[1], q[0] - o[0]))
    place('core', c, cy, 30 * S, 30 * S)
    kx = int((c - 120 - vx0) * zoom)
    canvas[ty - 32 * zoom:ty, kx - 7 * zoom:kx + 7 * zoom, :3] = np.array([0.35, 0.08, 0.12])
    Image.fromarray(to8(canvas[..., :3]), 'RGB').save(path)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else None
    prev = None
    only = None
    for a in sys.argv[1:]:
        if a.startswith('--preview='):
            prev = a.split('=', 1)[1]
        if a.startswith('--only='):
            only = set(a.split('=', 1)[1].split(','))
    frames = build(only)
    if prev:
        os.makedirs(prev, exist_ok=True)
        for n, im in frames.items():
            Image.fromarray(im, 'RGBA').save(os.path.join(prev, f'{n}.png'))
        if not only:
            preview(frames, os.path.join(prev, 'arena.png'))
    if out and not only:
        write_sheet(frames, out)


if __name__ == '__main__':
    main()

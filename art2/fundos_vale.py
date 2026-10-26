"""Fundos do Vale das Cachoeiras no traço pintado (2 pixels da imagem por pixel do mundo, hd.json).

O vale é o da Lembrança do prólogo, agora no presente: o céu lá em cima é o do eclipse (escuro, com a
coroa), e embaixo fica a luz da memória, dourada e baixa, que não vem do sol. As nuvens grandes pegam
essa luz por baixo (as primeiras nuvens luminosas, no caminho das Torres). A tinta é mais grossa que a
da floresta, em espiral nas copas e nas quedas d'água. As montanhas e os paredões têm relevo (relevo.py):
a luz sai da normal de um campo de altura antes do pincel. O aqueduto da Casa aparece no cais, de
noite: a única coisa escura e reta da paisagem.

  vale-sky     1280x720  o céu preso na tela: o eclipse no alto, o degradê até o dourado do horizonte,
                         nuvens luminosas e a serra nevada de onde ele desceu, sumindo na névoa
  vale-far     1280x720  o outro lado do vale (repete na horizontal): tepuis (platôs de paredes retas) em
                         duas fileiras, com caneluras, estratos, alga e mata em cima, torres soltas,
                         cachoeiras saindo das fendas da borda, a nuvem baixa atravessando e a mata na névoa
  vale-mid     1280x720  mais perto (repete na horizontal): o campo subindo em ondas, árvores de flor
                         rosa, árvores verdes e um salgueiro, com a luz dourada nas bordas
  cascata-far  1024x1024 o paredão molhado do outro lado das Cachoeiras (repete nas duas direções):
                         colunas de basalto (prismas com juntas e gomos saltados), musgo nas prateleiras,
                         samambaias e quedas finas descendo pelas fendas entre as colunas
  cascata-mid  1024x1024 mais perto: dois contrafortes com musgo nas saliências, samambaias penduradas,
                         raízes e fios d'água escorrendo pela pedra
  gruta-far    1024x1024 a parede da gruta atrás da água: pedra escura e molhada, escorridos de calcário
                         e a luz esverdeada que atravessa a cortina d'água, em redes que dançam
  gruta-mid    1024x1024 mais perto: colunas de pedra escorrida do chão ao teto, prateleiras presas nelas com
                         estalactites embaixo e estalagmites em cima, raízes descendo
  cais-sky     1280x720  a noite do Cais da Lua: a lua cheia, estrelas, nuvens finas prateadas e a serra
                         recortada no horizonte
  cais-far     1280x720  a outra margem do lago de noite (repete): salgueiros e juncos escuros com a borda
                         de prata, e o aqueduto passando lá no fundo
  cais-mid     1280x720  mais perto (repete): salgueiros grandes com os ramos caindo e os juncos

uso: python3 fundos_vale.py <pasta_saida> [camada ...] [--preview=<pasta>] [--fast] [--export]
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from brush import Layer, hexc, mix, sstep, blur, value_noise, noise1d, paint, passes_std
from shapes import Mask
from fundos_fosso import tnoise
from relevo import shade, ridged, jagged, spurs, peaks_of, unit
from fundos_floresta import Wide, pnoise_x, periodic1d, stretched, paint_wrapped, widen, WrapMask, rib_edge, tnoise_v, range_line, grid, granite

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else 'hd_vale'
ONLY = set(ARGS[1:])
PREVIEW = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
# --fast: só as duas primeiras passadas de pincel (para ver a composição depressa)
FAST = '--fast' in sys.argv
T0 = time.time()

# ---- o céu: o eclipse no alto, a luz da memória embaixo ----
ZEN, UP, LAV, ROSE = hexc(0x1b1f3f), hexc(0x2c335d), hexc(0x666894), hexc(0xb48b9e)
PEACH, GOLD, GOLDW = hexc(0xeab68a), hexc(0xffd796), hexc(0xfff2d0)
COR0, COR1, COR2, COR3 = hexc(0x6e3c1a), hexc(0xb4702e), hexc(0xe7ad55), hexc(0xfff0c8)
STAR = hexc(0xc9d2f0)
# nuvens luminosas: a barriga dourada, o corpo rosado e o alto frio do céu do eclipse
CL_GOLD, CL_CREAM, CL_ROSE, CL_LAV, CL_DUSK = hexc(0xffcf86), hexc(0xfff1d6), hexc(0xd99a9a), hexc(0x8a7fa8), hexc(0x4e4a74)
# a serra nevada lá longe
MT_S, MT_L = hexc(0x6a6a96), hexc(0xd9b8a8)
SN_S, SN_L = hexc(0xa3a3cc), hexc(0xfff0dc)
HAZE = hexc(0xe6c7b0)
HAZE_D = hexc(0xb79aa2)

# ---- o vale ----
ROCK_D, ROCK_M, ROCK_L, ROCK_W = hexc(0x4a4054), hexc(0x7d6a6a), hexc(0xc29a7a), hexc(0xf0c896)
MOSS_D, MOSS_M, MOSS_L = hexc(0x2b4636), hexc(0x4f7a43), hexc(0x9cbf5a)
G_D, G_M, G_L, G_W = hexc(0x2f5a36), hexc(0x4f8a3c), hexc(0x8fbd4e), hexc(0xe8e48a)
WATER_W, WATER_C = hexc(0xfdfaf0), hexc(0xd8ecec)
AQ_D, AQ_M, AQ_L = hexc(0x2a2633), hexc(0x3c3647), hexc(0x5c5266)
BRONZE, BRONZE_L = hexc(0x9a6a34), hexc(0xe6b062)
PINK0, PINK1, PINK2, PINK3 = hexc(0x7e4a66), hexc(0xc87c9c), hexc(0xeeb0c6), hexc(0xffe6ee)
GREEN0, GREEN1, GREEN2, GREEN3 = hexc(0x23423a), hexc(0x3f7236), hexc(0x83ad48), hexc(0xe2e48e)
WILLOW0, WILLOW1, WILLOW2, WILLOW3 = hexc(0x2c4a3c), hexc(0x5c8a4a), hexc(0xa7c46a), hexc(0xeef0a6)
BARK0, BARK1, BARK2 = hexc(0x2e211c), hexc(0x56402f), hexc(0x9a7656)

# ---- a gruta ----
CAVE0, CAVE1, CAVE2, CAVE3 = hexc(0x070b0d), hexc(0x0e1619), hexc(0x182428), hexc(0x2a3a3c)
CAUST, CAUST_W = hexc(0x7fd3b8), hexc(0xd8fff0)
FLOW0, FLOW1 = hexc(0x55615a), hexc(0x8f9c8c)

# ---- a noite do cais ----
NT0, NT1, NT2, NT3 = hexc(0x070b1c), hexc(0x0f1a36), hexc(0x1e2f57), hexc(0x3a5180)
MOON, MOON_S, MOON_H = hexc(0xf6f2e2), hexc(0xb9bdc8), hexc(0xcfdcff)
SILVER = hexc(0xbfd0f0)
NFOG = hexc(0x6f86b2)
NSIL0, NSIL1, NSIL2 = hexc(0x060a14), hexc(0x0e1628), hexc(0x1c2a46)

# a luz baixa e dourada da memória, da esquerda (para as montanhas e os paredões com relevo)
MT_LIGHT = (-0.8, -0.22, 0.55)
SUNV = np.array([-0.62, 0.42, 0.66], np.float32)
SUNV /= np.linalg.norm(SUNV)


def want(name):
    return not ONLY or name in ONLY


def dump(name, c):
    """REFDUMP=<pasta>: salva a referência antes do pincel (para ver a luz e as formas sem a tinta)."""
    d = os.environ.get('REFDUMP')
    if d:
        os.makedirs(d, exist_ok=True)
        Image.fromarray((np.clip(c, 0, 1) * 255).astype(np.uint8)).save(f'{d}/{name}.png')


def P(passes):
    return passes[:2] if FAST else passes


def field(c, H, W):
    return np.broadcast_to(c, (H, W, 3)).astype(np.float32).copy()


def ramp4(pal, s):
    """s 0..1 → sombra, meio, luz e brilho."""
    s = s[..., None]
    c = mix(pal[0], pal[1], np.clip(s / 0.35, 0, 1))
    c = mix(c, pal[2], np.clip((s - 0.35) / 0.4, 0, 1))
    return mix(c, pal[3], np.clip((s - 0.8) / 0.2, 0, 1) * 0.85)


# ======================================================================================
# tufos: copas e nuvens feitas de bolas encostadas (a luz em cada uma, o vinco entre elas) e o
# fluxo das pinceladas girando em volta do centro de cada bola (a espiral pedida)
# ======================================================================================
def billows(w, h, blobs, rng, rough=0.4, cell=None, swirl=1.0):
    """blobs: lista de (cx, cy, r, z). Devolve máscara, normal (nx, ny, nz), vinco e o fluxo em espiral
    (swirl 1: a pincelada gira em volta do tufo; 0: deitada)."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fine = value_noise(h, w, cell or max(2.0, np.mean([b[2] for b in blobs]) * 0.18), rng, 2)
    zb = np.full((h, w), -1e9, np.float32)
    z2 = np.full((h, w), -1e9, np.float32)
    nx = np.zeros((h, w), np.float32)
    ny = np.zeros((h, w), np.float32)
    nz = np.ones((h, w), np.float32)
    flow = np.zeros((h, w), np.float32)
    for (cx, cy, r, cz) in blobs:
        x0, x1 = max(0, int(cx - r * 1.5)), min(w, int(cx + r * 1.5) + 1)
        y0, y1 = max(0, int(cy - r * 1.5)), min(h, int(cy + r * 1.5) + 1)
        if x0 >= x1 or y0 >= y1:
            continue
        sx, sy = xx[y0:y1, x0:x1], yy[y0:y1, x0:x1]
        d = np.hypot(sx - cx, (sy - cy) * 1.06)
        reff = r * (1 + (fine[y0:y1, x0:x1] - 0.5) * rough)
        inside = d < reff
        dz = np.sqrt(np.clip(reff * reff - d * d, 0, None))
        z = cz + dz
        Zb, Z2 = zb[y0:y1, x0:x1], z2[y0:y1, x0:x1]
        better = inside & (z > Zb)
        Z2[:] = np.where(better, Zb, np.where(inside & (z > Z2), z, Z2))
        Zb[:] = np.where(better, z, Zb)
        inv = 1.0 / np.maximum(reff, 1e-3)
        nx[y0:y1, x0:x1] = np.where(better, (sx - cx) * inv, nx[y0:y1, x0:x1])
        ny[y0:y1, x0:x1] = np.where(better, (sy - cy) * inv, ny[y0:y1, x0:x1])
        nz[y0:y1, x0:x1] = np.where(better, dz * inv, nz[y0:y1, x0:x1])
        # a pincelada gira em volta do centro do tufo (tangente ao círculo), meio inclinada para fora
        ang = np.arctan2(sy - cy, sx - cx) + math.pi / 2 + 0.35
        if swirl < 1.0:
            ang = np.arctan2(np.sin(ang) * swirl, np.cos(ang) * swirl + (1 - swirl) * np.sign(np.cos(ang) + 1e-6))
        flow[y0:y1, x0:x1] = np.where(better, ang, flow[y0:y1, x0:x1])
    M = zb > -1e8
    crease = np.where(z2 > -1e8, np.exp(-(zb - z2) / max(1.0, np.mean([b[2] for b in blobs]) * 0.22)), 0.0)
    return M, nx, ny, nz, crease.astype(np.float32), flow


def thick(scale=1.0, dry=0.35, bristle=0.5, err=(0.0, 0.025, 0.04, 0.055), long=1.0, bend=0.5):
    """Passadas de tinta grossa: pincel mais largo, mais cerda e mais falha que o passes_std."""
    ps = passes_std(scale, dry, bristle, err, long)
    for p in ps:
        p['bend'] = bend
    return P(ps)


# ======================================================================================
# árvores do vale: copa de tufos com pinceladas em espiral, o tronco e os galhos aparecendo
# ======================================================================================
def blossom_tree(L, rng, x, gy, size, pal, haze=0.0, hazec=None, rimc=None, petals=False, lean=0.0, flat=1.0, wide=1.0):
    hazec = HAZE if hazec is None else hazec
    trunk_h = size * 0.58
    cx = x + lean * size * 0.4
    cy = gy - trunk_h - size * 0.28 * flat
    rx, ry = size * 0.62 * wide, size * 0.44 * flat
    pad = int(size * 0.45) + 8
    x0, y0 = int(cx - rx - pad), int(cy - ry - pad)
    x1, y1 = int(max(cx, x) + rx + pad), int(gy + 8)
    w, h = x1 - x0, y1 - y0
    sub = Layer(w, h)
    lx, ly, lcx, lcy = x - x0, gy - y0, cx - x0, cy - y0
    tw = max(2.5, size * 0.075)
    bark = mix(BARK1, hazec, haze)
    barkd = mix(BARK0, hazec, haze)
    barkl = mix(BARK2, hazec, haze)
    top = lcy + ry * 0.15
    # tronco: sai do chão um pouco torto, com a raiz abrindo; galhos abrem em leque para dentro da copa
    mid_x = (lx + lcx) / 2 + rng.normal(0, tw * 0.6)
    sub.stroke((lx + mid_x) / 2, (ly + (ly + top) / 2) / 2, math.atan2((ly + top) / 2 - ly, mid_x - lx), abs((ly - top) / 2) + tw, tw * 1.15, bark, 1.0, rng, 0.35, 0.1, taper=0.2)
    sub.stroke((mid_x + lcx) / 2, ((ly + top) / 2 + top) / 2, math.atan2(top - (ly + top) / 2, lcx - mid_x), abs((ly - top) / 2) + tw, tw, bark, 1.0, rng, 0.35, 0.1, taper=0.3)
    sub.stroke(lx - tw * 0.35, (ly + top) / 2, math.pi / 2, (ly - top) * 0.9, tw * 0.3, barkl, 0.5, rng, 0.5, 0.3, taper=0.5)
    sub.stroke(lx + tw * 0.4, (ly + top) / 2 + 4, math.pi / 2, (ly - top) * 0.8, tw * 0.35, barkd, 0.6, rng, 0.5, 0.3, taper=0.5)
    # o pé alarga um pouco (a raiz entra no chão), sem desenhar a raiz inteira
    sub.stroke(lx, ly - tw * 0.35, 0.0, tw * 2.6, tw * 0.7, barkd, 0.9, rng, 0.3, 0.1, taper=0.75)
    for k in range(int(rng.integers(3, 6))):
        s = -1 if k % 2 == 0 else 1
        ang = -math.pi / 2 + s * rng.uniform(0.3, 1.0)
        ln = size * rng.uniform(0.26, 0.45)
        bx, by = lcx, top + rng.uniform(0, 0.15) * (ly - top)
        sub.stroke(bx + math.cos(ang) * ln / 2, by + math.sin(ang) * ln / 2, ang, ln, tw * 0.5, bark, 0.95, rng, 0.3, 0.15, taper=0.65)
    # a copa: tufos espalhados num elipse achatado, os de cima por último
    n = int(10 + size / 8)
    blobs = []
    for k in range(n):
        a = rng.uniform(0, 2 * math.pi)
        rr = math.sqrt(rng.random())
        bx = lcx + math.cos(a) * rr * rx * 0.8
        by = lcy + math.sin(a) * rr * ry * 0.8
        r = size * rng.uniform(0.15, 0.25) * (1.15 - 0.35 * rr)
        blobs.append((bx, by, r, (1 - rr) * size * 0.25 + (by - lcy) * 0.2))
    M, nx, ny, nz, crease, flow = billows(w, h, blobs, rng, 0.45)
    yy = np.mgrid[0:h, 0:w][0].astype(np.float32)
    shade = np.clip(nx * SUNV[0] + ny * SUNV[1] * -0.6 + nz * SUNV[2], 0, 1)
    mass = sstep(lcy - ry, lcy + ry * 1.1, yy)
    s = shade * (1 - 0.4 * mass) + 0.05
    s = s * (1 - 0.55 * crease)
    col = ramp4(pal, np.clip(s, 0, 1))
    # o céu de cima esfria a sombra; a luz dourada de baixo esquenta a borda de baixo
    col = mix(col, col * 0.7 + hexc(0x6f6f9a) * 0.3, ((1 - shade) * 0.3)[..., None])
    if rimc is not None:
        under = np.clip(ny, 0, 1) * np.clip(-nx + 0.3, 0, 1) * (1 - crease)
        col = mix(col, rimc, (sstep(0.35, 0.9, under) * 0.55)[..., None])
    col = mix(col, hazec, haze)
    k = max(0.3, size / 120)
    passes = [
        dict(size=11 * k, spacing=0.8, length=(1.2, 2.2), err=0.0, alpha=0.9, bristle=0.5, dry=0.35, blur=0.25, taper=0.45, ang_jitter=0.25, bend=0.9),
        dict(size=5.8 * k, spacing=0.85, length=(1.2, 2.2), err=0.02, alpha=0.9, bristle=0.45, dry=0.3, blur=0.15, taper=0.5, ang_jitter=0.3, bend=0.9),
        dict(size=3.0 * k, spacing=0.95, length=(1.1, 2.0), err=0.035, alpha=0.92, bristle=0.35, dry=0.2, blur=0.08, taper=0.55, ang_jitter=0.35, bend=0.8),
    ]
    paint(sub, col, M.astype(np.float32), flow, rng, P(passes), jitter=0.012, val_jitter=0.06, clip_soft=0, base=1.0)
    # pontos de luz e flores soltas na borda iluminada
    ys, xs = np.nonzero(M & (shade > 0.7))
    if len(xs):
        for i in rng.choice(len(xs), min(len(xs), int(size * 0.45)), replace=False):
            ang = rng.uniform(0, math.pi)
            sub.stroke(xs[i], ys[i], ang, rng.uniform(2, 4) * max(1, k * 1.6), rng.uniform(1.0, 1.8) * max(1, k * 1.4),
                       mix(pal[3], hazec, haze), rng.uniform(0.4, 0.75), rng, 0.25, 0.1, taper=0.6)
    if petals:
        for _ in range(int(size * 0.6)):
            px = lcx + rng.normal(0, rx * 0.9)
            py = lcy + ry * 0.6 + rng.uniform(0, max(4.0, ly - lcy - ry * 0.6 + 6))
            sub.dab(px, py, rng.uniform(0.8, 1.5) * max(1, k * 1.3), mix(pal[2], hazec, haze), rng.uniform(0.5, 0.9), 0.5)
    comp_layer(L, sub, x0, y0)


def willow(L, rng, x, gy, size, haze=0.0, hazec=None, night=False):
    """Salgueiro: tronco grosso e torto, a copa larga e os ramos compridos caindo quase até o chão."""
    hazec = HAZE if hazec is None else hazec
    pal = [NSIL0, NSIL1, NSIL2, SILVER * 0.5 + NSIL2 * 0.5] if night else [WILLOW0, WILLOW1, WILLOW2, WILLOW3]
    trunk_h = size * 0.5
    cx, cy = x + rng.normal(0, size * 0.05), gy - trunk_h - size * 0.2
    rx, ry = size * 0.75, size * 0.32
    pad = int(size * 0.3) + 8
    x0, y0 = int(cx - rx - pad), int(cy - ry - pad)
    x1, y1 = int(cx + rx + pad), int(gy + 8)
    w, h = x1 - x0, y1 - y0
    sub = Layer(w, h)
    lx, ly, lcx, lcy = x - x0, gy - y0, cx - x0, cy - y0
    tw = max(3.0, size * 0.1)
    bark = mix(NSIL1 if night else BARK1, hazec, haze)
    sub.stroke(lx, (ly + lcy) / 2, math.pi / 2 + rng.normal(0, 0.08), ly - lcy, tw, bark, 1.0, rng, 0.4, 0.15, taper=0.25)
    for s in (-1, 1):
        ang = -math.pi / 2 + s * rng.uniform(0.6, 1.1)
        ln = size * 0.4
        sub.stroke(lcx + math.cos(ang) * ln / 2, lcy + 10 + math.sin(ang) * ln / 2, ang, ln, tw * 0.55, bark, 1.0, rng, 0.3, 0.1, taper=0.6)
    blobs = []
    for k in range(int(8 + size / 12)):
        a = rng.uniform(math.pi, 2 * math.pi) if rng.random() < 0.7 else rng.uniform(0, math.pi)
        rr = math.sqrt(rng.random())
        blobs.append((lcx + math.cos(a) * rr * rx * 0.8, lcy + math.sin(a) * rr * ry * 0.7, size * rng.uniform(0.13, 0.2), (1 - rr) * size * 0.2))
    M, nx, ny, nz, crease, flow = billows(w, h, blobs, rng, 0.5)
    shade = np.clip(nx * SUNV[0] + ny * -0.3 + nz * SUNV[2], 0, 1)
    col = ramp4(pal, np.clip(shade * (1 - 0.5 * crease) + 0.05, 0, 1))
    col = mix(col, hazec, haze)
    k = max(0.3, size / 120)
    passes = [
        dict(size=9 * k, spacing=0.8, length=(1.2, 2.2), err=0.0, alpha=0.9, bristle=0.5, dry=0.35, blur=0.25, taper=0.45, ang_jitter=0.3, bend=0.8),
        dict(size=4.5 * k, spacing=0.9, length=(1.2, 2.0), err=0.02, alpha=0.9, bristle=0.4, dry=0.3, blur=0.15, taper=0.5, ang_jitter=0.35, bend=0.8),
    ]
    paint(sub, col, M.astype(np.float32), flow, rng, P(passes), jitter=0.012, val_jitter=0.05, clip_soft=0, base=1.0)
    # os ramos caindo: cortinas de pinceladas finas e compridas, da copa até perto do chão
    ys, xs = np.nonzero(M)
    if len(xs):
        bottom = {}
        for xi, yi in zip(xs, ys):
            if yi > bottom.get(xi, -1):
                bottom[xi] = yi
        keys = sorted(bottom)
        for _ in range(int(size * 2.2)):
            xi = keys[int(rng.integers(0, len(keys)))]
            y_top = bottom[xi] - rng.uniform(0, ry * 0.8)
            ln = rng.uniform(0.35, 1.0) * (ly - y_top) * 0.95
            if ln < 6:
                continue
            t = rng.random()
            c = ramp4(pal, np.array([0.25 + 0.6 * t], np.float32))[0]
            c = mix(c, hazec, haze)
            sub.stroke(xi + rng.normal(0, 1.2), y_top + ln / 2, math.pi / 2 + rng.normal(0, 0.05), ln, rng.uniform(1.2, 2.4) * max(1, k), c,
                       rng.uniform(0.55, 0.9), rng, 0.35, 0.45, taper=0.8)
    comp_layer(L, sub, x0, y0)


def comp_layer(dst, src, x0, y0):
    h, w = src.A.shape
    X0, Y0 = max(0, x0), max(0, y0)
    X1, Y1 = min(dst.W, x0 + w), min(dst.H, y0 + h)
    if X0 >= X1 or Y0 >= Y1:
        return
    sP = src.P[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
    sA = src.A[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
    dP = dst.P[Y0:Y1, X0:X1]
    dA = dst.A[Y0:Y1, X0:X1]
    dP *= (1 - sA)[..., None]
    dP += sP
    dA *= 1 - sA
    dA += sA


def wide_xs(wide, x, reach):
    """Onde desenhar na tela larga algo que está em x (mundo): as cópias que caem dentro dela."""
    return [x + o for o in wide.offs if -reach < x + o < wide.CW + reach]


# ======================================================================================
# vale-sky
# ======================================================================================
EX, EY, ER = 968.0, 112.0, 30.0


def cloud_bank(W, H, rng, base_y, x0, x1, top_y, n):
    """Um cúmulo: montes grandes (a forma geral) com tufos menores por cima de cada um (a couve-flor).
    Devolve a máscara (borda macia), a normal dos tufos, o vinco, o fluxo e a forma geral (u, v)."""
    cx, rx, ry = (x0 + x1) / 2, (x1 - x0) / 2, base_y - top_y
    mounds = []
    for k in range(max(3, n // 8)):
        th = rng.uniform(0.25, math.pi - 0.25)
        env = math.sin(th) ** 1.3
        r = ry * rng.uniform(0.3, 0.45) * (0.55 + 0.6 * env)
        mx = cx + math.cos(th) * rx * 0.62
        my = base_y - r * 0.55 - ry * env * rng.uniform(0.25, 0.5)
        mounds.append((mx, my, r))
    blobs = [(mx, my, r, 0.0) for (mx, my, r) in mounds]
    for k in range(n):
        mx, my, r = mounds[int(rng.integers(0, len(mounds)))]
        a = rng.uniform(math.pi * 1.05, math.pi * 1.95)
        rr = r * rng.uniform(0.25, 0.42)
        blobs.append((mx + math.cos(a) * r * 0.82, my + math.sin(a) * r * 0.82, rr, 30 + rng.uniform(0, 20)))
    M, nx, ny, nz, crease, flow = billows(W, H, blobs, rng, 0.3, swirl=0.6)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    flatb = base_y + (value_noise(1, W, 40, rng, 2)[0] - 0.5) * 5
    M = M & (yy < flatb[None, :])
    u = (xx - cx) / rx
    v = (yy - (base_y - ry * 0.5)) / (ry * 0.6)
    return blur(M.astype(np.float32), 1.2), nx, ny, nz, crease, flow, u, v


def serra_relevo(W, H, rng, yy, line, base_y, back):
    """Uma serra vista de frente com relevo: os espigões descendo de cada pico (relevo.spurs), costelas e
    canaletas, a luz baixa e dourada vindo da esquerda (alpenglow: a face virada para ela fica pêssego, a
    outra lilás) e a neve em campos grandes nas faces de frente e nas canaletas, com a pedra nas arestas."""
    pk = peaks_of(line, 36, 14)
    z, d, _ = spurs(W, H, rng, line, base_y, pk, k=(0.6, 1.25), tilt=0.5, branch=0.9)
    fine = stretched(H, W, 22, rng, sy=3.5, octaves=3)
    med = stretched(H, W, 64, rng, sy=2.0, octaves=2)
    big = stretched(H, W, 160, rng, sy=1.5, octaves=2)
    rib = ridged(fine)
    z2 = z + rib * 5 + ridged(med) * 12 + (big - 0.5) * 30
    dif, nx, ny, nz, _ = shade(blur(z2, 0.8), MT_LIGHT)
    _, nxs, _, _, _ = shade(blur(z2, 4.0), MT_LIGHT)
    skyl = np.clip(0.5 - ny * 0.6, 0, 1)
    top = float(line.min())
    alt = np.clip((yy - line[None, :]) / max(1.0, base_y - top), 0, 1)
    mk = sstep(line[None, :] - 0.8, line[None, :] + 0.8, yy)
    streak = stretched(H, W, 9, rng, sy=7.0, octaves=2)
    arete = sstep(5.0, 1.0, d) * sstep(0.3, 0.6, streak)
    sidew = sstep(0.42, 0.7, np.abs(nxs))
    rocky = np.clip(sidew * 0.8 + arete * 0.7 + sstep(0.62, 0.85, rib * 0.6 + streak * 0.4) * 0.8, 0, 1)
    if back:
        snowline = 0.55 + (big - 0.5) * 0.5
        snow = sstep(snowline + 0.1, snowline - 0.2, alt) * sstep(0.75, 0.35, rocky)
    else:
        snow = sstep(0.22, 0.02, alt) * sstep(0.6, 0.3, rocky) * 0.85
    lit = sstep(0.3, 0.72, dif)
    rock = mix(hexc(0x2f2a52), hexc(0xa8706e), lit[..., None])
    rock = mix(rock, hexc(0x221c3c), (sstep(0.3, 0.0, dif) * 0.6)[..., None])
    snow_c = mix(hexc(0x8a8cc8), mix(SN_L, PEACH, 0.5), lit[..., None])
    snow_c = mix(snow_c, hexc(0xfff3e4), (sstep(0.8, 1.0, dif) * 0.6)[..., None])
    snow_c = mix(snow_c, hexc(0xb4b6ea), (skyl * (1 - lit) * 0.35)[..., None])
    c = mix(rock, snow_c, snow[..., None])
    hz = (0.32 if back else 0.22) + 0.45 * sstep(0.25, 1.0, alt)
    c = mix(c, mix(HAZE_D, ROSE, 0.5) if back else mix(LAV, ROSE, 0.5), (hz * 0.7)[..., None])
    # as pinceladas descem junto dos espigões (perpendiculares ao gradiente da distância)
    gdy, gdx = np.gradient(blur(d, 2.0))
    along = np.arctan2(gdy, gdx) + math.pi / 2
    along = np.where(np.sin(along) < 0, along + math.pi, along).astype(np.float32)
    M = Layer(W, H)
    paint(M, np.clip(c, 0, 1), mk, along, rng, thick(0.55, dry=0.3, bristle=0.35, err=(0, 0.02, 0.03, 0.045), long=1.2, bend=0.3), base=1.0)
    return M


def vale_sky(rng):
    W, H = 1280, 720
    yy, xx = grid(W, H)
    t = yy / H
    sky = mix(ZEN, UP, sstep(0.0, 0.3, t)[..., None])
    sky = mix(sky, LAV, sstep(0.22, 0.52, t)[..., None])
    sky = mix(sky, ROSE, sstep(0.44, 0.64, t)[..., None])
    sky = mix(sky, PEACH, sstep(0.56, 0.72, t)[..., None])
    sky = mix(sky, GOLD, sstep(0.66, 0.8, t)[..., None])
    # a luz da memória: mais forte no horizonte, puxada para a esquerda (de onde a luz vem)
    glow = np.exp(-((xx - W * 0.26) / (W * 0.46)) ** 2 - ((yy - H * 0.78) / (H * 0.17)) ** 2)
    sky = mix(sky, GOLDW, (glow * 0.62)[..., None])
    # em volta do eclipse o céu fica mais escuro e a coroa esquenta só um pouco
    d_e = np.hypot(xx - EX, yy - EY)
    sky = mix(sky, ZEN * 0.8, (np.exp(-(d_e / 260) ** 2) * 0.35)[..., None])
    sky = mix(sky, COR1 * 0.6 + ZEN * 0.4, (np.exp(-(d_e / 120) ** 2) * 0.4)[..., None])
    # cirros: poucos fios compridos no meio do céu, a barriga deles pega o dourado de baixo
    st = stretched(H, W, 34, rng, sx=10.0, octaves=3)
    st2 = stretched(H, W, 90, rng, sx=4.0, octaves=2)
    cir = sstep(0.6, 0.76, st * 0.7 + st2 * 0.3) * sstep(0.16, 0.3, t) * sstep(0.52, 0.36, t)
    belly = np.clip(cir - np.roll(cir, -4, axis=0), 0, 1)
    cir_c = mix(LAV * 0.9 + UP * 0.1, CL_ROSE, sstep(0.25, 0.5, t)[..., None])
    sky = mix(sky, cir_c, (cir * 0.5)[..., None])
    sky = mix(sky, CL_GOLD, (blur(belly, 1.5) * 1.4 * sstep(0.22, 0.45, t)).clip(0, 0.6)[..., None])
    base = np.clip(blur(sky, 2.0), 0, 1)
    L = Layer.from_rgb(base)
    flow = np.full((H, W), -0.03, np.float32) + (st2 - 0.5) * 0.3
    passes = [dict(size=12, spacing=0.9, length=(3.0, 7.0), err=0.012, alpha=0.35, bristle=0.35, dry=0.2, blur=0.6, taper=0.6, ang_jitter=0.06, bend=0.4),
              dict(size=6, spacing=1.0, length=(3.0, 6.0), err=0.02, alpha=0.35, bristle=0.3, dry=0.15, blur=0.5, taper=0.7, ang_jitter=0.06, bend=0.4)]
    paint(L, base, np.ones((H, W), np.float32), flow, rng, passes, val_jitter=0.012, jitter=0.004)
    # estrelas só no escuro de cima
    for _ in range(160):
        x, y = rng.uniform(0, W), rng.uniform(0, H * 0.36)
        ix, iy = int(x), int(y)
        if cir[iy, ix] > 0.2 or d_e[iy, ix] < 150:
            continue
        b = rng.random() ** 2.4 * (1 - y / (H * 0.38))
        L.dab(x, y, 0.6 + b * 1.0, mix(STAR, hexc(0xffffff), b), 0.3 + 0.6 * b, 0.6)
        if b > 0.5:
            L.dab(x, y, 4 + b * 4, STAR, 0.05, 4)
    # a coroa do eclipse (a mesma do céu da cidade, mais longe)
    L.fill(COR2, np.exp(-(d_e / (ER * 2.6)) ** 2) * 0.22)
    for _ in range(200):
        a = rng.uniform(0, 2 * math.pi)
        r0 = ER + rng.uniform(2, 7)
        ln = rng.uniform(12, 70) * (0.4 + rng.random())
        cx, cy = EX + math.cos(a) * (r0 + ln / 2), EY + math.sin(a) * (r0 + ln / 2)
        L.stroke(cx, cy, a, ln, rng.uniform(1.4, 3.6), mix(COR1, COR3, rng.random() ** 2), rng.uniform(0.1, 0.34), rng, 0.4, 0.5, taper=0.8)
    d = d_e
    L.fill(COR3, sstep(ER + 4.5, ER + 1.2, d) * sstep(ER - 1, ER + 1, d) * 0.95)
    L.fill(hexc(0x06070b), sstep(ER + 0.8, ER - 0.8, d))
    # a serra nevada de onde ele desceu: comprida, do lado esquerdo, longe; na frente dela um
    # espigão mais baixo e mais escuro que corre a tela inteira; o pé dos dois some no mar de nuvens
    for (k, n, x1f, ytop, ybase, steep, amp) in ((0, 7, 0.72, 0.28, 0.72, 0.85, 34), (1, 10, 1.2, 0.55, 0.74, 0.7, 20)):
        line = range_line(W, rng, n, H * ytop, H * ybase, steep, 0)
        if x1f < 1:
            fall = np.arange(W) > W * x1f
            line = np.where(fall, line + (np.arange(W) - W * x1f) * 0.9, line)
        line = jagged(line, rng, amp, cell=160, octaves=6, sharp=0.65)
        L.over(serra_relevo(W, H, rng, yy, line, H * ybase, k == 0))
    # o mar de nuvens no horizonte: montes grandes de alturas diferentes, cada um com tufos por cima; a
    # borda de cima pega a luz baixa (dourada e creme), embaixo rosa e lilás
    sea_y = H * 0.7
    blobs = []
    mounds = []
    x = -60.0
    while x < W + 60:
        r = rng.uniform(24, 62)
        my = sea_y + r * rng.uniform(0.15, 0.55) + rng.uniform(-6, 8)
        mounds.append((x, my, r))
        blobs.append((x, my, r, 0.0))
        x += r * rng.uniform(0.8, 1.4)
    for (mx, my, r) in mounds:
        for k in range(int(r / 7)):
            a2 = rng.uniform(math.pi * 1.1, math.pi * 1.9)
            rr = r * rng.uniform(0.18, 0.32)
            blobs.append((mx + math.cos(a2) * r * 0.86, my + math.sin(a2) * r * 0.86, rr, 30 + rng.uniform(0, 12)))
    Mb, nx, ny, nz, crease, bflow = billows(W, H, blobs, rng, 0.3, swirl=0.35)
    Mb = np.maximum(Mb, yy > sea_y + 12)
    sea = blur(Mb.astype(np.float32), 1.2)
    lit_s = np.clip(nx * -0.5 + ny * -0.45 + nz * 0.55, 0, 1)
    sc = mix(CL_ROSE, CL_GOLD, sstep(0.25, 0.85, lit_s)[..., None])
    sc = mix(sc, CL_CREAM, (sstep(0.75, 1.0, lit_s) * 0.7)[..., None])
    sc = mix(sc, mix(CL_ROSE, CL_LAV, 0.5), (crease * 0.5)[..., None])
    below = sstep(sea_y - 10, sea_y + 140, yy)
    sc = mix(sc, mix(PEACH, CL_ROSE, 0.45), (below * 0.75)[..., None])
    sc = mix(sc, GOLDW, (glow * 0.35)[..., None])
    sc = mix(sc, sky, 0.15)
    S = Layer(W, H)
    sflow = np.where(Mb, bflow, 0.02).astype(np.float32)
    paint(S, sc, sea, sflow, rng, thick(0.6, dry=0.25, bristle=0.35, err=(0, 0.02, 0.03, 0.045), long=1.1, bend=0.7), base=1.0)
    L.over(S)
    # cúmulos luminosos no meio da tela: a barriga dourada (a luz vem de baixo e da esquerda), o
    # corpo rosado, o alto lilás puxando para o céu escuro; a forma geral manda na luz, os tufos dão o
    # relevo
    for (bx0, bx1, by, ty, n) in ((850, 1230, H * 0.6, H * 0.33, 40), (170, 440, H * 0.63, H * 0.5, 26)):
        Mc, nx, ny, nz, cr, cflow, u, v = cloud_bank(W, H, rng, by, bx0, bx1, ty, n)
        macro = np.clip(-u * 0.45 + v * 0.55 + 0.45, 0, 1)
        micro = np.clip(nx * -0.55 + ny * 0.5 + nz * 0.4, 0, 1)
        lit_c = np.clip(macro * 0.65 + micro * 0.45, 0, 1)
        hgt = np.clip((by - yy) / max(1.0, by - ty), 0, 1)
        cc = mix(CL_LAV, CL_ROSE, sstep(0.15, 0.55, lit_c)[..., None])
        cc = mix(cc, CL_DUSK, (sstep(0.55, 1.0, hgt) * sstep(0.45, 0.1, lit_c) * 0.6)[..., None])
        cc = mix(cc, CL_GOLD, sstep(0.5, 0.85, lit_c)[..., None])
        cc = mix(cc, CL_CREAM, (sstep(0.82, 1.0, lit_c) * 0.8)[..., None])
        cc = mix(cc, cc * 0.82, (cr * 0.4)[..., None])
        cc = mix(cc, sky, 0.12 + 0.2 * (1 - Mc[..., None]))
        C = Layer(W, H)
        paint(C, cc, Mc, cflow, rng, thick(0.5, dry=0.2, bristle=0.3, err=(0, 0.02, 0.03, 0.045), long=0.9, bend=0.9), base=1.0)
        C.multiply_alpha(np.clip(Mc * 1.4, 0, 1))
        L.over(C)
    # névoa dourada bem baixa
    L.fill(GOLDW, sstep(H * 0.76, H * 0.96, yy) * 0.45)
    return L


# ======================================================================================
# vale-far: o paredão do outro lado, as cachoeiras e o aqueduto
# ======================================================================================
def aqueduct(wide, y_deck, y_low, sp, phase, xx, yy, scale=1.0):
    """O aqueduto em dois andares de arcos, reto de ponta a ponta (a tela larga repete o período W).
    Devolve o alfa da pedra e o do bronze (as cintas e as juntas)."""
    CW, H = wide.CW, wide.H
    k = scale
    deck0, deck1 = y_deck, y_deck + 6 * k          # o canal e a cornija
    up0, up1 = deck1, deck1 + 15 * k               # andar de cima, arcos pequenos
    mid1 = up1 + 4 * k                              # cinta entre os andares
    lo0 = mid1
    stone = sstep(deck0 - 0.6, deck0 + 0.6, yy) * sstep(y_low + 0.6, y_low - 0.6, yy)
    bronze = (sstep(deck1 - 1.6 * k, deck1 - 0.6 * k, yy) * sstep(deck1 + 0.2, deck1 - 0.4, yy)
              + sstep(mid1 - 1.8 * k, mid1 - 0.8 * k, yy) * sstep(mid1 + 0.2, mid1 - 0.4, yy))
    rel = (xx - phase) % sp
    # vãos de cima: dois por vão de baixo, pilares finos
    hs = sp / 2
    pu = 4 * k
    ru = (hs - pu) / 2
    cu = ((xx - phase) % hs) - hs / 2
    spring_u = up0 + 2 * k + ru
    d = np.hypot(cu, np.minimum(0, yy - spring_u))
    hole_u = sstep(ru + 0.7, ru - 0.7, d) * (yy < up1) * (yy > up0)
    # vãos de baixo: arcos grandes, os pilares mais largos
    pl = 8 * k
    rl = (sp - pl) / 2
    cl = rel - sp / 2
    spring_l = lo0 + 3 * k + rl
    d = np.hypot(cl, np.minimum(0, yy - spring_l))
    hole_l = sstep(rl + 0.7, rl - 0.7, d) * (yy > lo0)
    stone = stone * (1 - hole_u) * (1 - hole_l)
    bronze = np.clip(bronze, 0, 1) * stone
    return stone, bronze, cl, pl


def canopy_band(W, H, rng, line, rows, rmin, rmax, step, lift=(0.0, 1.0)):
    """Mata vista de longe: copas redondas encostadas em fileiras ao longo de `line` (y por coluna; 1e9
    onde não tem mata), as de trás mais altas. Devolve máscara, normal e vinco (como billows)."""
    blobs = []
    for row in range(rows):
        x = rng.uniform(-step, 0)
        while x < W + step:
            r = rng.uniform(rmin, rmax) * (1 - 0.15 * row)
            ly = float(line[int(np.clip(x, 0, W - 1))])
            if ly < 1e8:
                y = ly - r * rng.uniform(*lift) + row * r * 0.9
                blobs.append((x, y, r, rng.uniform(0, 10) - row * 20))
            x += r * rng.uniform(0.7, 1.3) * step / max(rmin, 1)
    return billows(W, H, blobs, rng, 0.4, swirl=0.8)


SAND_L, SAND_M, SAND_D, ALGA, FRESH = hexc(0xe0a27a), hexc(0x956c69), hexc(0x433853), hexc(0x29252f), hexc(0xf2b47e)


def pstretch_v(H, W, cell, rng, sy=6.0, octaves=2):
    """Ruído que emenda na horizontal (largura W), esticado na vertical (estrias que descem)."""
    h = max(4, int(H / sy) + 2)
    n = pnoise_x(h, W, cell, rng, octaves)
    im = Image.fromarray((n * 65535).astype(np.uint16)).resize((W, int(h * sy)), Image.BILINEAR)
    return np.asarray(im, np.float32)[:H] / 65535


def tepui(wide, rng, x0, x1, top, base_y, haze, fall):
    """Um tepui (o platô de arenito de paredes retas): o alto em blocos com degraus e serrilha fina, a
    fenda de onde sai a cachoeira, os lados com contrafortes; o relevo da parede (as caneluras verticais,
    os estratos com a sombra fina embaixo de cada um, os lados virando) recebe a luz baixa da esquerda.
    Por cima: as manchas pretas de alga que a água deixa descendo, a pedra laranja onde caiu bloco, o
    verde nas prateleiras, a mata no alto e o talude de mata no pé. Devolve (camada, cachoeira)."""
    W, H, PP, CW = wide.W, wide.H, wide.P, wide.CW
    yy, xx = grid(CW, H)
    hgt = base_y - top
    span = x1 - x0
    lx = np.arange(-80, span + 80, 1.0, dtype=np.float32)
    T = np.full(lx.shape, top, np.float32)
    nb = int(rng.integers(2, 4))
    edges = np.concatenate([[-80.0], np.sort(rng.uniform(0.2, 0.8, nb - 1)) * span, [span + 80.0]])
    main = int(rng.integers(0, nb))
    for i in range(nb):
        off = 0.0 if i == main else rng.uniform(4, 42)
        T[(lx >= edges[i]) & (lx < edges[i + 1])] = top + off
    T = ndi.gaussian_filter1d(T, 1.6)
    T += (noise1d(len(lx), 7, rng, 3) - 0.5) * 3.5 + (noise1d(len(lx), 40, rng, 2) - 0.5) * 5
    spout = None
    if fall:
        fl = rng.uniform(0.25, 0.75) * span
        nw, nd = rng.uniform(5, 9), rng.uniform(9, 18)
        T += nd * np.clip(1 - np.abs(lx - fl) / nw, 0, 1) ** 0.8
        spout = (x0 + fl, float(np.interp(fl, lx, T)) - 1)
    ys = np.arange(H, dtype=np.float32)
    u = np.clip((ys - top) / hgt, 0, 1)
    Lb = -hgt * rng.uniform(0.02, 0.07) * u + (noise1d(H, 26, rng, 3) - 0.5) * 9
    Rb = span + hgt * rng.uniform(0.02, 0.07) * u + (noise1d(H, 26, rng, 3) - 0.5) * 9
    # ombros: em algum ponto o paredão alarga num degrau (a prateleira de baixo, com mata em cima)
    for side in (-1, 1):
        if rng.random() < 0.65:
            ysh = top + hgt * rng.uniform(0.3, 0.6)
            step = rng.uniform(14, 44) * sstep(ysh - 2, ysh + 2, ys)
            if side < 0:
                Lb = Lb - step
            else:
                Rb = Rb + step
    sw_l, sw_r = rng.uniform(14, 32), rng.uniform(12, 26)
    inside = np.zeros((H, CW), bool)
    zc = np.zeros((H, CW), np.float32)
    Ttop = np.full((H, CW), 1e9, np.float32)
    for ox in wide.offs:
        loc = xx - (x0 + ox)
        if loc.max() < -90 or loc.min() > span + 90:
            continue
        tl = np.interp(loc, lx, T)
        dl = loc - Lb[:, None]
        dr = Rb[:, None] - loc
        ins = (dl >= 0) & (dr >= 0) & (yy >= tl)
        inside |= ins
        z = np.minimum(dl, sw_l) * 1.6 + np.minimum(dr, sw_r) * 1.6 + np.minimum(yy - tl, 4.0) * 0.9
        zc = np.where(ins, z, zc)
        Ttop = np.where(ins, tl, Ttop)
    mk = blur(inside.astype(np.float32), 0.6)
    # o relevo: caneluras (vincos verticais que serpenteiam), estratos e o grão da pedra
    f0 = widen(pstretch_v(H, W, 56, rng, sy=6.0, octaves=2), PP)
    f1 = widen(pstretch_v(H, W, 20, rng, sy=9.0, octaves=2), PP)
    f2 = widen(pstretch_v(H, W, 8, rng, sy=11.0, octaves=2), PP)
    per = rng.uniform(13, 22)
    warp = widen(pnoise_x(H, W, 110, rng, 2), PP) * 9
    ph = ((yy + warp) / per) % 1.0
    grain = widen(pnoise_x(H, W, 3.5, rng, 2), PP)
    z = zc + ridged(f0) * 22 + ridged(f1) * 8 + ridged(f2) * 3.5 + ph * 2.2 + grain * 1.4
    dif, nx, ny, nz, _ = shade(z, MT_LIGHT)
    rc = mix(SAND_D * 0.8, SAND_M, sstep(0.1, 0.5, dif)[..., None])
    rc = mix(rc, SAND_L, sstep(0.5, 0.92, dif)[..., None])
    # o alto do paredão no dourado, o pé no lilás
    rc = mix(rc, rc * 0.8 + ROCK_W * 0.2, (sstep(top + hgt * 0.45, top, yy) * 0.6)[..., None])
    rc = mix(rc, hexc(0x9c90c0), (np.clip(-ny * 1.2, 0, 1) * 0.3)[..., None])
    # a parede de baixo fica mais escura (a luz baixa chega menos, a sombra da mata)
    rc = mix(rc, rc * 0.68, (sstep(top + hgt * 0.25, base_y, yy) * 0.55)[..., None])
    # as manchas de alga: escorrem do alto e de cada fenda
    st = widen(pstretch_v(H, W, 4, rng, sy=16.0, octaves=2), PP)
    st2 = widen(pstretch_v(H, W, 12, rng, sy=12.0, octaves=2), PP)
    stain = sstep(0.55, 0.78, st * 0.55 + st2 * 0.45) * (0.4 + 0.6 * sstep(top + hgt * 0.75, top, yy))
    if spout:
        for ox in wide.offs:
            stain = np.maximum(stain, sstep(12, 3, np.abs(xx - (spout[0] + ox))) * (yy > spout[1]) * 0.9)
    rc = mix(rc, ALGA, (stain * 0.62)[..., None])
    fresh = sstep(0.72, 0.86, widen(pnoise_x(H, W, 24, rng, 2), PP)) * sstep(0.3, 0.7, dif) * (1 - stain)
    rc = mix(rc, FRESH, (fresh * 0.42)[..., None])
    # verde nas prateleiras dos estratos (o alto de cada um), mais na metade de baixo
    ledge = sstep(0.14, 0.0, ph) * sstep(0.45, 0.7, widen(pnoise_x(H, W, 10, rng, 2), PP))
    ledge *= sstep(top + hgt * 0.15, top + hgt * 0.55, yy)
    rc = mix(rc, mix(MOSS_D, MOSS_M, sstep(0.3, 0.8, dif)[..., None]), (ledge * 0.75)[..., None])
    # a quina do alto pega a luz dourada
    rc = mix(rc, ROCK_W, (sstep(5, 0, yy - Ttop) * 0.45)[..., None])
    rc = mix(rc, LAV * 0.5 + HAZE * 0.5, haze)
    rc = mix(rc, HAZE, (sstep(base_y - hgt * 0.55, base_y, yy) * 0.45)[..., None])
    flow = np.full((H, CW), math.pi / 2, np.float32) + (f1 - 0.5) * 0.25
    C = Layer(CW, H)
    paint(C, np.clip(rc, 0, 1), mk, flow, rng, thick(0.4, dry=0.45, bristle=0.5, err=(0, 0.022, 0.032, 0.045), long=1.6, bend=0.15), base=1.0)
    # a mata do alto: copas miúdas seguindo a borda, umas debruçando, cipós caindo um pouco
    anyin = inside.any(axis=0)
    topline = np.where(anyin, np.argmax(inside, axis=0).astype(np.float32) + 2.5, 1e9).astype(np.float32)
    Mt, tnx, tny, tnz, tcr, _ = canopy_band(CW, H, rng, topline, 3, 1.4, 3.6, 2.6, (0.1, 1.0))
    Mt = Mt & (topline[None, :] < 1e8)
    sh = np.clip(tnx * -0.7 + tny * -0.45 + tnz * 0.5, 0, 1)
    tc = ramp4([GREEN0, GREEN1, GREEN2, G_W], np.clip(sh * (1 - 0.6 * tcr) - 0.12, 0, 1))
    tc = mix(tc, LAV * 0.4 + HAZE * 0.6, haze * 0.85)
    C.fill(tc, blur(Mt.astype(np.float32), 0.5))
    for _ in range(int(span / 9)):
        vx = x0 + rng.uniform(0, span)
        vy = float(np.interp(vx - x0, lx, T)) + 2
        ln = rng.uniform(4, 16)
        for xo in wide_xs(wide, vx, 20):
            C.stroke(xo, vy + ln / 2, math.pi / 2 + rng.normal(0, 0.05), ln, rng.uniform(1.0, 1.8),
                     mix(mix(GREEN0, GREEN1, rng.random()), LAV * 0.4 + HAZE * 0.6, haze * 0.85), 0.7, rng, 0.2, 0.2, taper=0.8)
    # o talude de mata no pé: sobe em línguas pelas canaletas
    tal = np.full(CW, 1e9, np.float32)
    tongue = ridged(periodic1d(W, 22, rng, 2))
    for ox in wide.offs:
        xa, xb = x0 + ox - hgt * 0.45, x1 + ox + hgt * 0.45
        i0, i1 = int(max(0, xa)), int(min(CW, xb))
        if i0 >= i1:
            continue
        uu = (np.arange(i0, i1) - xa) / (xb - xa)
        env = np.clip(np.sin(uu * math.pi), 0, 1) ** 0.7
        tw = widen(tongue[None, :], PP)[0][i0:i1]
        tal[i0:i1] = np.minimum(tal[i0:i1], base_y + 10 - hgt * env * (0.24 + 0.14 * tw))
    Mk, knx, kny, knz, kcr, kfl = canopy_band(CW, H, rng, tal, 3, 3.5, 7.5, 5.0, (0.0, 0.5))
    Mk = Mk & (tal[None, :] < 1e8)
    Mk = np.maximum(Mk, (yy > tal[None, :] + 8) & (tal[None, :] < 1e8))
    sh = np.clip(knx * -0.7 + kny * -0.45 + knz * 0.5, 0, 1)
    kc = ramp4([GREEN0, GREEN1, GREEN2, GREEN3], np.clip(sh * (1 - 0.5 * kcr) + 0.02, 0, 1))
    kc = mix(kc, LAV * 0.4 + HAZE * 0.6, haze * 0.9)
    kc = mix(kc, HAZE, (sstep(base_y - 60, base_y + 10, yy) * 0.5)[..., None])
    K = Layer(CW, H)
    paint(K, kc, Mk.astype(np.float32), np.where(Mk, kfl, 0.0).astype(np.float32), rng, thick(0.3, dry=0.3, bristle=0.4, err=(0, 0.025, 0.035, 0.05), long=1.0, bend=0.8), base=1.0)
    C.over(K)
    # a cachoeira: sai da fenda, cai inteira e vai virando névoa antes do pé; a névoa sobe da mata
    if spout:
        fx, fy = spout
        fw = rng.uniform(2.5, 4.5)
        end = fy + (base_y - fy) * rng.uniform(0.62, 0.8)
        F = Layer(CW, H)
        for xo in wide_xs(wide, fx, 60):
            for _ in range(int(fw * 22)):
                y0 = fy + rng.uniform(-1, (end - fy) * 0.9)
                ln = rng.uniform(20, 90)
                yc = min(y0 + ln / 2, end)
                frac = (yc - fy) / max(1.0, end - fy)
                spread = fw * (0.45 + 1.6 * frac ** 1.5)
                x = xo + rng.uniform(-spread, spread)
                c = mix(mix(WATER_C, WATER_W, rng.random()), HAZE, haze * 0.5)
                a = rng.uniform(0.45, 0.9) * (1 - 0.75 * frac ** 2)
                F.stroke(x, yc, math.pi / 2 + rng.normal(0, 0.015), ln, rng.uniform(0.9, 1.9) * (1 + frac), c, a, rng, 0.45, 0.35, taper=0.55)
            for _ in range(40):
                yb = end - rng.uniform(-10, 60) * rng.random()
                F.stroke(xo + rng.normal(0, fw * 3.5), yb, rng.uniform(0, math.pi), rng.uniform(8, 22), rng.uniform(4, 10),
                         mix(WATER_W, HAZE, 0.35 + haze * 0.4), 0.14, rng, 0.3, 0.2, taper=0.7, bend=1.2)
            for _ in range(30):
                yb = base_y - rng.uniform(10, 70) * rng.random()
                F.stroke(xo + rng.normal(0, fw * 5), yb, rng.uniform(0, math.pi), rng.uniform(10, 26), rng.uniform(5, 12),
                         mix(WATER_W, HAZE, 0.45 + haze * 0.4), 0.12, rng, 0.3, 0.2, taper=0.7, bend=1.2)
        C.over(F)
    return C


def cloud_wisp(wide, rng, y, x0, x1, th, haze):
    """Uma faixa de nuvem baixa atravessando os paredões: tufos achatados ao longo de y, a barriga
    reta, o alto dourado do lado da luz e o de baixo lilás."""
    W, H, CW = wide.W, wide.H, wide.CW
    yy, xx = grid(CW, H)
    blobs = []
    x = x0
    while x < x1:
        r = rng.uniform(th * 0.35, th)
        env = math.sin(math.pi * (x - x0) / (x1 - x0)) ** 0.6
        for xo in wide_xs(wide, x, th * 2):
            blobs.append((xo, y - r * 0.35 * env - rng.uniform(0, th * 0.3) * env, r * (0.5 + 0.5 * env), rng.uniform(0, 8)))
        x += r * rng.uniform(0.6, 1.1)
    if not blobs:
        return None
    M, nx, ny, nz, cr, fl = billows(CW, H, blobs, rng, 0.35, swirl=0.4)
    M = M & (yy < y + th * 0.25 + (widen(pnoise_x(H, W, 30, rng, 2), wide.P) - 0.5) * 4)
    lit = np.clip(nx * -0.6 + ny * -0.55 + nz * 0.4, 0, 1)
    c = mix(CL_LAV, CL_ROSE, sstep(0.1, 0.5, lit)[..., None])
    c = mix(c, CL_GOLD, sstep(0.5, 0.85, lit)[..., None])
    c = mix(c, CL_CREAM, (sstep(0.85, 1.0, lit) * 0.7)[..., None])
    c = mix(c, c * 0.85, (cr * 0.35)[..., None])
    c = mix(c, HAZE, haze)
    C = Layer(CW, H)
    m = blur(M.astype(np.float32), 1.4)
    paint(C, np.clip(c, 0, 1), m, np.where(M, fl, 0.0).astype(np.float32), rng, thick(0.4, dry=0.2, bristle=0.3, err=(0, 0.02, 0.03, 0.045), long=1.0, bend=0.9), base=1.0)
    # a beirada da faixa se desfaz
    C.multiply_alpha(np.clip(m * 1.25, 0, 0.92))
    return C


def vale_far(rng):
    W, H, PP = 1280, 720, 200
    wide = Wide(W, H, PP)
    CW = wide.CW
    yy, xx = grid(CW, H)
    out = Layer(CW, H)
    base_y = H * 0.8
    # ---- os tepuis em duas fileiras: a de trás mais alta e mais na névoa; entre elas, uma faixa de
    # nuvem baixa atravessando os paredões ----
    for (far, n, hmin, hmax, haze, wmin, wmax, off) in ((1, 2, 0.3, 0.38, 0.42, 200, 300, 0.0), (0, 2, 0.4, 0.48, 0.2, 140, 210, 0.5)):
        for i in range(n):
            x0 = (i + off + rng.uniform(-0.1, 0.1)) * W / n
            wdt = rng.uniform(wmin, wmax)
            top = H * rng.uniform(hmin, hmax)
            out.over(tepui(wide, rng, x0, x0 + wdt, top, base_y, haze, rng.random() < 0.85))
            # às vezes uma torre solta do lado (o platô se partiu)
            if rng.random() < 0.4:
                pw, gap = rng.uniform(20, 42), rng.uniform(5, 16)
                px0 = x0 - gap - pw if rng.random() < 0.5 else x0 + wdt + gap
                out.over(tepui(wide, rng, px0, px0 + pw, top + rng.uniform(16, 70), base_y, haze, False))
        if far:
            for (cy, cx0, cx1, th) in ((H * 0.47, rng.uniform(0, W * 0.15), rng.uniform(W * 0.4, W * 0.55), 20),
                                        (H * 0.53, rng.uniform(W * 0.55, W * 0.65), rng.uniform(W * 0.9, W * 1.05), 16)):
                wsp = cloud_wisp(wide, rng, cy, cx0, cx1, th, 0.25)
                if wsp:
                    out.over(wsp)
    # ---- a névoa no pé dos platôs ----
    fog = Layer(CW, H)
    fog.fill(mix(HAZE, GOLDW, 0.25), sstep(base_y - 110, base_y - 10, yy) * 0.55)
    out.over(fog)
    # ---- a mata do fundo do vale: copas em fileiras, umas de flor ----
    gl = H * 0.82 + (widen(periodic1d(W, 120, rng, 3)[None, :], PP)[0] - 0.5) * 34
    Mf, nx, ny, nz, cr, fl = canopy_band(CW, H, rng, gl, 3, 4, 10, 6.0, (0.0, 0.8))
    Mf = np.maximum(Mf, yy > gl[None, :] + 20)
    sh = np.clip(nx * -0.6 + ny * -0.5 + nz * 0.6, 0, 1)
    pink = sstep(0.72, 0.8, widen(pnoise_x(H, W, 14, rng, 2), PP))
    fc = ramp4([GREEN0, GREEN1, GREEN2, GREEN3], np.clip(sh * (1 - 0.5 * cr) + 0.05, 0, 1))
    fc = mix(fc, ramp4([PINK0, PINK1, PINK2, PINK3], np.clip(sh * (1 - 0.4 * cr) + 0.1, 0, 1)), (pink * 0.9)[..., None])
    fc = mix(fc, HAZE, 0.42)
    fc = mix(fc, mix(HAZE, GOLDW, 0.3), (sstep(H * 0.84, H * 0.96, yy) * 0.8)[..., None])
    F = Layer(CW, H)
    paint(F, fc, Mf.astype(np.float32), np.where(Mf, fl, 0.0).astype(np.float32), rng, thick(0.4, dry=0.3, bristle=0.4, err=(0, 0.025, 0.035, 0.05), long=1.0, bend=0.8), base=1.0)
    out.over(F)
    fog = Layer(CW, H)
    fog.fill(mix(HAZE, GOLDW, 0.3), sstep(H * 0.88, H * 0.99, yy))
    out.over(fog)
    return wide.fold(out)


# ======================================================================================
# vale-mid: o campo em ondas e as árvores grandes
# ======================================================================================
def meadow_band(wide, rng, ridge, cA, cB, haze, flowers):
    W, H, PP, CW = wide.W, wide.H, wide.P, wide.CW
    yy, xx = grid(CW, H)
    rg = widen(ridge[None, :], PP)[0]
    mm = sstep(rg[None, :] - 1.2, rg[None, :] + 1.2, yy)
    depth = np.maximum(0, yy - rg[None, :])
    ref = mix(cA, cB, sstep(0, 220, depth)[..., None])
    slope = np.gradient(rg)
    ref = mix(ref, G_W, (np.clip(-slope * 1.4, 0, 1)[None, :] * np.exp(-depth / 50) * 0.5)[..., None])
    ref = mix(ref, G_W, (np.exp(-depth / 6) * 0.45)[..., None])
    cl = widen(pnoise_x(H, W, 200, rng, 3), PP)
    ref = mix(ref, ref * 0.62 + hexc(0x3a4a6a) * 0.38, (sstep(0.58, 0.74, cl) * 0.45)[..., None])
    ref = mix(ref, G_L, (sstep(0.34, 0.2, cl) * 0.3)[..., None])
    ref = mix(ref, HAZE, haze)
    L = Layer(CW, H)
    flow = np.full((H, CW), -0.05, np.float32) + (widen(pnoise_x(H, W, 50, rng, 2), PP) - 0.5) * 0.7
    paint(L, ref, mm, flow, rng, thick(0.6, dry=0.35, bristle=0.45, err=(0, 0.02, 0.035, 0.05), long=1.5, bend=0.4), val_jitter=0.045, clip_soft=1.0, base=1.0)
    if flowers:
        for colr in (hexc(0xffffff), PINK2, hexc(0xfff09a), hexc(0xd8c8ff)):
            dens = sstep(0.62, 0.8, widen(pnoise_x(H, W, 60, rng, 2), PP)) * mm * sstep(8, 24, depth) * sstep(160, 60, depth)
            ys, xs = np.nonzero(dens > rng.random((H, CW)) * 4)
            if len(xs):
                for i in rng.choice(len(xs), min(len(xs), 260), replace=False):
                    c = mix(colr, HAZE, haze) * rng.uniform(0.9, 1.05)
                    L.dab(xs[i], ys[i], rng.uniform(0.9, 1.7), np.clip(c, 0, 1), 0.8, 0.7)
        # o capim alto da crista contra o céu
        for x in np.arange(0, CW, 2.5):
            if rng.random() < 0.35:
                continue
            y = float(rg[int(min(CW - 1, x))]) + rng.uniform(-1, 4)
            ang = -math.pi / 2 + rng.normal(0, 0.3)
            ln = rng.uniform(6, 16)
            L.stroke(x + math.cos(ang) * ln / 2, y + math.sin(ang) * ln / 2, ang, ln, rng.uniform(1.0, 1.8),
                     mix(mix(G_M, G_W, rng.random() * 0.8), HAZE, haze), 0.8, rng, 0.2, 0.1, taper=0.85)
    return L


def vale_mid(rng):
    W, H, PP = 1280, 720, 300
    wide = Wide(W, H, PP)
    CW = wide.CW
    out = Layer(CW, H)
    # a colina de trás, mais na névoa, com uma fileira de árvores
    rb = H * 0.6 - 40 * periodic1d(W, 420, rng, 3)
    back = meadow_band(wide, rng, rb, hexc(0x8db07a), hexc(0x6f9668), 0.3, False)
    out.over(back)
    for x in np.sort(rng.uniform(0, W, 18)):
        g = float(rb[int(x) % W]) + rng.uniform(6, 22)
        size = rng.uniform(40, 70)
        kind = rng.random()
        for xo in wide_xs(wide, x, 120):
            if kind < 0.3:
                blossom_tree(out, rng, xo, g, size, [PINK0, PINK1, PINK2, PINK3], 0.34, rimc=CL_GOLD, petals=False)
            else:
                blossom_tree(out, rng, xo, g, size, [GREEN0, GREEN1, GREEN2, GREEN3], 0.36, rimc=CL_GOLD)
    # a colina da frente e as árvores grandes: em grupos, tamanhos diferentes, a sombra comprida para a
    # direita (a luz baixa vem da esquerda)
    rf = H * 0.7 - 36 * periodic1d(W, 300, rng, 3)
    front = meadow_band(wide, rng, rf, mix(hexc(0x86b852), GOLD, 0.22), hexc(0x3f6e3a), 0.0, True)
    out.over(front)
    trees = []
    x = rng.uniform(0, 60)
    kinds = ['green', 'pink', 'bush', 'willow', 'green', 'bush', 'pink', 'green']
    i = 0
    while x < W - 40:
        kind = kinds[i % len(kinds)]
        i += 1
        d = rng.uniform(0, 1)
        size = {'pink': rng.uniform(150, 200), 'green': rng.uniform(170, 230), 'willow': rng.uniform(170, 210), 'bush': rng.uniform(55, 85)}[kind]
        size *= 0.6 + 0.4 * d
        trees.append((x, kind, size, d))
        x += size * rng.uniform(0.6, 1.2) + rng.uniform(30, 150)
    shade = Layer(CW, H)
    yy, xx = grid(CW, H)
    placed = []
    for (x, kind, size, d) in trees:
        g = float(rf[int(x) % W]) + 8 + d * 70
        placed.append((x, kind, size, d, g))
        for xo in wide_xs(wide, x, 300):
            m = Mask(CW, H)
            m.ellipse(xo + size * 0.7, g + 1, size * 0.85, size * 0.05 + 3)
            shade.fill(hexc(0x2c4a3a), blur(m.array(), 3.0) * 0.28 * sstep(xo - size * 0.1, xo + size * 0.3, xx))
    out.over(shade)
    for (x, kind, size, d, g) in sorted(placed, key=lambda t: t[4]):
        haze = 0.18 * (1 - d)
        for xo in wide_xs(wide, x, 300):
            if kind == 'pink':
                blossom_tree(out, rng, xo, g, size, [PINK0, PINK1, PINK2, PINK3], haze, rimc=CL_GOLD, petals=True)
            elif kind == 'green':
                blossom_tree(out, rng, xo, g, size, [GREEN0, GREEN1, GREEN2, GREEN3], haze, rimc=CL_GOLD)
            elif kind == 'willow':
                willow(out, rng, xo, g, size, haze=haze)
            else:
                blossom_tree(out, rng, xo, g + 4, size, [GREEN0, GREEN1, GREEN2, GREEN3], haze, rimc=CL_GOLD, flat=0.6, wide=1.3)
    return wide.fold(out)


# ======================================================================================
# cascata: o paredão molhado das Cachoeiras (repete nas duas direções)
# ======================================================================================
BAS0, BAS1, BAS2, BAS3 = hexc(0x161b20), hexc(0x2c353a), hexc(0x56625f), hexc(0x9aa49a)
CAS_LIGHT = (-0.5, -0.66, 0.56)


def psin(H, rng, amp, k):
    """Deslocamento que emenda em cima e embaixo (soma de senos com período H)."""
    y = np.arange(H, dtype=np.float32)
    out = np.zeros(H, np.float32)
    for n, a in ((k, amp), (k * 2 + 1, amp * 0.4), (k * 5 + 2, amp * 0.15)):
        out += a * np.sin(2 * math.pi * n * y / H + rng.uniform(0, 6.3))
    return out


def cast_shadow(z, light, reach=48):
    """Sombra projetada pela luz que vem da esquerda e de cima (a camada repete: o rolo emenda)."""
    l = unit(light)
    tan_x = l[2] / max(1e-3, -l[0])
    tan_y = l[2] / max(1e-3, -l[1])
    sh = np.zeros_like(z)
    for t in range(2, reach, 2):
        dx = int(round(t * -l[0] / math.hypot(l[0], l[1])))
        dy = int(round(t * -l[1] / math.hypot(l[0], l[1])))
        src = np.roll(np.roll(z, dy, axis=0), dx, axis=1)
        rise = t * l[2] / math.hypot(l[0], l[1])
        sh = np.maximum(sh, np.clip((src - z - rise) / 4.0, 0, 1))
    return sh


def basalt(W, H, rng, wmin, wmax, recess, joint_gap):
    """O campo de altura de uma parede de colunas de basalto (repete nas duas direções): colunas de
    larguras diferentes, cada uma um prisma (a face da esquerda, a da frente, a da direita), umas mais
    para a frente que as outras, as juntas atravessadas (um pouco tortas) que partem cada coluna em
    gomos, e um gomo ou outro saltado (a prateleira onde o musgo pega). Devolve (z, coluna, prateleira,
    distância à junta, x relativo na coluna)."""
    yy, xx = grid(W, H)
    ws = []
    tot = 0.0
    while tot < W - wmin:
        w = rng.uniform(wmin, wmax)
        ws.append(w)
        tot += w
    ws = np.asarray(ws, np.float32) * (W / tot)
    b = np.concatenate([[0.0], np.cumsum(ws)])
    k = len(ws)
    wob = [psin(H, rng, rng.uniform(2.0, 5.0), int(rng.integers(1, 3))) for _ in range(k)]
    wob.append(wob[0])
    z = np.full((H, W), -1e3, np.float32)
    col = np.zeros((H, W), np.int32)
    ledge = np.zeros((H, W), np.float32)
    jd = np.full((H, W), 1e3, np.float32)
    rel = np.zeros((H, W), np.float32)
    for i in range(k):
        for ox in (-W, 0, W):
            x0 = b[i] + wob[i][:, None] + ox
            x1 = b[i + 1] + wob[i + 1][:, None] + ox
            ins = (xx >= x0) & (xx < x1)
            if not ins.any():
                continue
            w = x1 - x0
            fl, fr = rng.uniform(0.16, 0.3), rng.uniform(0.16, 0.3)
            front = w * min(fl, fr) * 1.5
            zz = np.minimum(np.minimum((xx - x0) * 1.5, (x1 - xx) * 1.5), front)
            if rng.random() < 0.45:
                # prisma de quina para a frente: duas faces se encontrando no meio
                apex = rng.uniform(0.4, 0.6)
                zz = np.minimum(zz, front - np.abs((xx - x0) / w - apex) * w * 0.28)
            zz = zz + rng.uniform(-recess, recess * 0.5)
            # as juntas deste prisma (posições que emendam em cima e embaixo), um pouco inclinadas
            n_j = max(2, int(H / rng.uniform(*joint_gap)))
            ys = np.sort(rng.uniform(0, H, n_j))
            tilt = rng.uniform(-0.12, 0.12, n_j)
            dmin = np.full((H, W), 1e3, np.float32)
            jidx = np.zeros((H, W), np.int32)
            for j, (yj, tj) in enumerate(zip(ys, tilt)):
                line = yj + (xx - (x0 + x1) / 2) * tj + np.sin(xx * rng.uniform(0.08, 0.2) + rng.uniform(0, 6)) * rng.uniform(0.5, 2.0)
                d = (yy - line + H / 2) % H - H / 2
                closer = np.abs(d) < np.abs(dmin)
                dmin = np.where(closer, d, dmin)
                jidx = np.where(closer, j, jidx)
            # gomos saltados: o de baixo de uma junta avança, a cara de cima vira prateleira
            pro = rng.uniform(0, 1, n_j) < 0.22
            seg_below = (dmin > 0)
            jut = np.where(seg_below & pro[jidx] & (dmin < rng.uniform(26, 60)), rng.uniform(5, 10), 0.0)
            zz = zz + jut
            zz = zz - 7.0 * np.exp(-(dmin / 2.6) ** 2)
            ledge_i = pro[jidx] & (dmin > 0) & (dmin < 5)
            z = np.where(ins, zz, z)
            col = np.where(ins, i, col)
            ledge = np.where(ins, ledge_i.astype(np.float32), ledge)
            jd = np.where(ins, dmin, jd)
            rel = np.where(ins, (xx - x0) / w, rel)
    return z, col, ledge, jd, rel, b, wob


def fern_tuft(L, rng, x, y, size, col, alpha=0.9):
    """Um tufo de samambaia visto de longe: folhas arqueando para fora e para baixo, cada uma com os
    folíolos (pinceladas curtas) dos dois lados."""
    for _ in range(int(rng.integers(4, 8))):
        side = rng.choice([-1, 1])
        a0 = -math.pi / 2 + side * rng.uniform(0.3, 1.2)
        ln = size * rng.uniform(0.6, 1.0)
        px, py, a = x, y, a0
        n = 7
        for s in range(n):
            a += side * 0.22
            nx_, ny_ = px + math.cos(a) * ln / n, py + math.sin(a) * ln / n
            L.stroke((px + nx_) / 2, (py + ny_) / 2, a, ln / n + 1, 1.1, col * rng.uniform(0.85, 1.1), alpha, rng, 0.2, 0.0, taper=0.2)
            fl = size * 0.16 * (1 - s / n)
            for sgn in (-1, 1):
                fa = a + sgn * 1.1
                L.stroke(nx_ + math.cos(fa) * fl / 2, ny_ + math.sin(fa) * fl / 2, fa, fl, 0.9, col * rng.uniform(0.9, 1.2), alpha * 0.85, rng, 0.2, 0.0, taper=0.7)
            px, py = nx_, ny_


def cascata_far(rng):
    W = H = 1024
    yy, xx = grid(W, H)
    z, col, ledge, jd, rel, b, wob = basalt(W, H, rng, 52, 104, 12, (60, 170))
    grain = tnoise(H, W, 5, rng, 2)
    worn = tnoise(H, W, 22, rng, 3)
    z2 = blur(z, 0.9) + grain * 1.4 + (worn - 0.5) * 7
    dif, nx, ny, nz, spec = shade(z2, CAS_LIGHT, 1.0, spec_pow=18)
    shd = cast_shadow(z2, CAS_LIGHT, 40)
    light = 0.12 + 0.88 * dif * (1 - 0.7 * shd)
    tones = rng.uniform(0.82, 1.15, int(col.max()) + 1).astype(np.float32)
    rock = mix(BAS0, BAS1, sstep(0.1, 0.42, light)[..., None])
    rock = mix(rock, BAS2, sstep(0.4, 0.8, light)[..., None])
    rock = mix(rock, BAS3, (sstep(0.8, 1.0, light) * 0.6)[..., None])
    rock = rock * tones[col][..., None]
    # a luz dourada da memória pega de leve as faces de cima
    rock = mix(rock, rock * 0.6 + ROCK_W * 0.4, (np.clip(-ny, 0, 1) * light * 0.35)[..., None])
    # a fresta da junta: escura no fundo
    rock = mix(rock, BAS0 * 0.6, (np.exp(-(jd / 1.3) ** 2) * 0.75)[..., None])
    # o molhado: estrias de película d'água descendo (escurece e brilha)
    film = sstep(0.55, 0.8, tnoise_v(H, W, 9, rng, sy=10, octaves=2))
    rock = mix(rock, rock * 0.72, (film * 0.5)[..., None])
    gloss = spec * (0.35 + 0.65 * film) * (1 - shd)
    rock = mix(rock, hexc(0xeef6ee), np.clip(gloss * 0.9, 0, 0.8)[..., None])
    # musgo: nas prateleiras, nas juntas e em manchas grandes (mais onde a água respinga)
    patch = sstep(0.52, 0.7, tnoise(H, W, 60, rng, 3))
    groove = np.exp(-(jd / 3.0) ** 2) * sstep(0.4, 0.7, tnoise(H, W, 14, rng, 2))
    moss = np.clip(ledge * 1.0 + groove * 0.8 + patch * sstep(0.45, 0.62, tnoise(H, W, 9, rng, 2)) * 0.9, 0, 1)
    mc = mix(MOSS_D, MOSS_M, sstep(0.2, 0.7, light)[..., None])
    mc = mix(mc, MOSS_L, (sstep(0.7, 1.0, light) * 0.6)[..., None])
    rock = mix(rock, mc, (moss * 0.85)[..., None])
    # as quedas: descem pelas fendas entre colunas, inteiras, espirrando onde batem num gomo saltado
    falls = np.zeros((H, W), np.float32)
    fpos = rng.choice(np.arange(1, len(b) - 1), 3, replace=False)
    streak = tnoise_v(H, W, 4, rng, sy=16, octaves=2)
    for j in fpos:
        fw = rng.uniform(7, 13)
        for ox in (-W, 0, W):
            cx = b[j] + wob[j][:, None] + ox
            d = np.abs(xx - cx)
            falls = np.maximum(falls, sstep(fw, fw * 0.3, d) * (0.65 + 0.35 * streak))
    wc = mix(WATER_C * 0.85, WATER_W, sstep(0.35, 0.8, streak)[..., None])
    c = mix(rock, wc, (falls * 0.92)[..., None])
    # o ar da garganta é borrifo: bancos de névoa atravessando, mais claros perto das quedas
    mist = sstep(0.5, 0.85, tnoise(H, W, 170, rng, 2))
    c = mix(c, mix(HAZE, WATER_W, 0.45), (mist * 0.2 + blur(falls, 18) * 0.22)[..., None])
    c = mix(c, mix(HAZE_D, WATER_C, 0.4), 0.1)
    flow = np.full((H, W), math.pi / 2, np.float32) + (grain - 0.5) * 0.2
    dump('cascata-far', c)
    L = paint_wrapped(np.clip(c, 0, 1), np.ones((H, W), np.float32), flow, rng,
                      thick(0.4, dry=0.4, bristle=0.45, err=(0, 0.02, 0.03, 0.04), long=0.9, bend=0.12), 64, base=1.0)
    # samambaias nas prateleiras (pequenas, de longe) e o borrifo onde a água bate
    ys, xs = np.nonzero(ledge[::6, ::6] > 0.5)
    for i in rng.permutation(len(xs))[:70]:
        x, y = xs[i] * 6 + 3, ys[i] * 6 + 3
        fern_tuft(L, rng, x, y, rng.uniform(10, 20), mix(MOSS_M, MOSS_L, rng.random() * 0.6) * 0.9, 0.85)
    return L


def cascata_mid(rng):
    W = H = 1024
    yy, xx = grid(W, H)
    tex = tnoise(H, W, 12, rng, 3)
    A = np.zeros((H, W), np.float32)
    rockm = np.zeros((H, W), np.float32)
    moss = np.zeros((H, W), np.float32)
    lit = np.zeros((H, W), np.float32)
    edges = []
    for cx in (180 + rng.uniform(-40, 40), 700 + rng.uniform(-40, 40)):
        wv = rng.uniform(140, 190)
        le = rib_edge(rng, H, cx - wv / 2, rng.uniform(22, 36), int(rng.integers(2, 4)))
        re = rib_edge(rng, H, cx + wv / 2, rng.uniform(22, 36), int(rng.integers(2, 4)))
        edges.append((le, re))
        for ox in (-W, 0, W):
            L_ = le[:, None] + ox
            R_ = re[:, None] + ox
            inside = sstep(L_ - 1, L_ + 1, xx) * sstep(R_ + 1, R_ - 1, xx)
            rockm = np.maximum(rockm, inside)
            lit = np.maximum(lit, inside * sstep(L_ + 20, L_ + 2, xx))
            dR = np.gradient(re)[:, None]
            dL = np.gradient(le)[:, None]
            moss = np.maximum(moss, inside * sstep(0.15, 0.6, dR) * sstep(R_ - 18, R_ - 3, xx))
            moss = np.maximum(moss, inside * sstep(-0.15, -0.6, dL) * sstep(L_ + 18, L_ + 3, xx))
    rock = mix(hexc(0x161b1e), hexc(0x2e3638), (0.3 + 0.5 * tex)[..., None])
    rock = mix(rock, hexc(0x5d6a62), (lit * 0.6)[..., None])
    rock = mix(rock, ROCK_W * 0.6 + hexc(0x5d6a62) * 0.4, (lit * sstep(0.6, 0.9, tex) * 0.3)[..., None])
    cr = sstep(0.04, 0.0, np.abs(tnoise(H, W, 60, rng, 2) - 0.5)) * sstep(0.45, 0.7, tnoise(H, W, 90, rng, 2))
    rock = mix(rock, hexc(0x100d12), (cr * 0.7)[..., None])
    wet = sstep(0.6, 0.78, tnoise_v(H, W, 12, rng, sy=6, octaves=2)) * rockm
    rock = mix(rock, hexc(0xe6f0ea), (wet * (0.15 + 0.3 * lit))[..., None])
    mc = mix(MOSS_D, MOSS_L, (0.3 + 0.6 * tex)[..., None])
    col = mix(rock, mc, (moss * 0.9)[..., None])
    A = np.maximum(A, rockm)
    # samambaias penduradas nas bordas e raízes descendo
    fm = WrapMask(W, H)
    rm = WrapMask(W, H)
    for (le, re) in edges:
        for (e, d) in ((le, -1), (re, 1)):
            for _ in range(5):
                yr = rng.uniform(0, H)
                x0, y0 = float(e[int(yr) % H]) + d * 2, yr
                # samambaia: uma haste curva e os folíolos dos dois lados
                ang = d * rng.uniform(0.3, 0.9) + math.pi / 2 * 0.0
                ln = rng.uniform(50, 90)
                pts = [(x0, y0)]
                for s_ in range(1, 9):
                    t_ = s_ / 8
                    pts.append((x0 + d * ln * t_ * 0.8, y0 - ln * 0.25 * math.sin(t_ * math.pi * 0.8) + ln * 0.5 * t_ * t_))
                for s_ in range(len(pts) - 1):
                    fm.line([pts[s_], pts[s_ + 1]], 2.2)
                for s_ in range(1, len(pts) - 1):
                    px, py = pts[s_]
                    fl = 14 * (1 - s_ / 9)
                    for side in (-1, 1):
                        fm.line([(px, py), (px + side * fl * 0.35, py + fl)], 2.6 * (1 - s_ / 10) + 0.8)
            for _ in range(3):
                yr = rng.uniform(0, H)
                x0 = float(e[int(yr) % H]) + d * 1
                ln = rng.uniform(80, 200)
                pts = [(x0, yr)]
                for s_ in range(1, 10):
                    t_ = s_ / 9
                    pts.append((x0 + d * 10 * math.sin(t_ * 3 + yr), yr + ln * t_))
                for s_ in range(len(pts) - 1):
                    rm.line([pts[s_], pts[s_ + 1]], 3.2 * (1 - s_ / 11) + 0.8)
    fa = fm.array()
    ra = rm.array()
    col = mix(col, mix(BARK0, BARK1, tex[..., None]), ra[..., None])
    col = mix(col, mix(MOSS_M, MOSS_L, tex[..., None]), fa[..., None])
    A = np.maximum(A, np.maximum(fa, ra))
    # fios d'água escorrendo pela face (brancos e finos)
    wm = WrapMask(W, H)
    for (le, re) in edges:
        for _ in range(4):
            yr = rng.uniform(0, H)
            mid = (le[int(yr) % H] + re[int(yr) % H]) / 2
            x0 = mid + rng.uniform(-50, 50)
            ln = rng.uniform(120, 400)
            wm.line([(x0, yr), (x0 + rng.uniform(-6, 6), yr + ln)], rng.uniform(1.5, 3.2))
    wa = wm.array() * rockm
    col = mix(col, WATER_W, (wa * 0.85)[..., None])
    col = mix(col, HAZE, 0.12)
    flow = np.full((H, W), math.pi / 2, np.float32) + (tex - 0.5) * 0.4
    return paint_wrapped(col, A, flow, rng, thick(0.45, dry=0.4, bristle=0.45, err=(0, 0.03, 0.04, 0.06), long=1.3, bend=0.3), 64, base=1.0)


# ======================================================================================
# gruta (repete nas duas direções)
# ======================================================================================
GRUTA_LIGHT = (-0.82, 0.08, 0.56)


def gruta_far(rng):
    """A parede do fundo da gruta: massas de pedra escorrida (o calcário desce em cortinas e costelas),
    molhada; a luz verde entra pela cortina d'água da boca, da esquerda e um pouco de baixo (refletida na
    água), e só pega as faces viradas para ela; nas manchas onde ela chega forte, a cáustica fraca e
    macia (a que dança é a do jogo, por cima). O resto afunda no escuro."""
    W = H = 1024
    yy, xx = grid(W, H)
    big = tnoise(H, W, 170, rng, 2)
    lump = tnoise(H, W, 60, rng, 3)
    drape = tnoise_v(H, W, 14, rng, sy=7, octaves=2)
    drape2 = tnoise_v(H, W, 40, rng, sy=5, octaves=2)
    grain = tnoise(H, W, 4, rng, 2)
    z = big * 60 + lump * 18 + ridged(drape) * 6 + ridged(drape2) * 10 + grain * 1.5
    dif, nx, ny, nz, spec = shade(z, GRUTA_LIGHT, 1.0, spec_pow=26)
    ao = sstep(-14, 8, z - blur(z, 22))
    reach = sstep(0.42, 0.8, tnoise(H, W, 220, rng, 2))
    col = mix(CAVE0, CAVE1, (0.3 + 0.7 * ao)[..., None])
    col = mix(col, CAVE2, (sstep(0.3, 0.75, dif) * (0.4 + 0.6 * ao))[..., None])
    lit = sstep(0.55, 0.95, dif) * (0.25 + 0.75 * reach)
    col = mix(col, CAUST * 0.4 + CAVE3 * 0.6, (lit * 0.75)[..., None])
    # cortinas de calcário: mais claras, em faixas onduladas
    curtain = sstep(0.6, 0.75, tnoise(H, W, 90, rng, 2)) * sstep(0.45, 0.8, drape)
    col = mix(col, mix(FLOW0, FLOW1, dif[..., None]) * 0.55, (curtain * 0.45)[..., None])
    # cáustica fraca e macia, só onde a luz chega
    n1 = tnoise(H, W, 30, rng, 2)
    n2 = tnoise(H, W, 21, rng, 2)
    net = blur(np.clip(sstep(0.07, 0.0, np.abs(n1 - 0.5)) + sstep(0.06, 0.0, np.abs(n2 - 0.5)), 0, 1), 1.4)
    col = mix(col, CAUST * 0.7 + col * 0.3, (net * reach * sstep(0.4, 0.8, dif) * 0.35)[..., None])
    # o molhado: brilho miúdo nas faces de frente
    col = mix(col, CAUST_W * 0.6 + CAVE3 * 0.4, np.clip(spec * reach * 0.8, 0, 0.6)[..., None])
    col = mix(col, CAVE0 * 0.8, ((1 - reach) * 0.35)[..., None])
    flow = np.full((H, W), math.pi / 2, np.float32) + (lump - 0.5) * 0.6
    dump('gruta-far', col)
    return paint_wrapped(np.clip(col, 0, 1), np.ones((H, W), np.float32), flow, rng,
                         thick(0.42, dry=0.45, bristle=0.5, err=(0, 0.018, 0.026, 0.036), long=1.0, bend=0.35), 64, base=1.0)


def gruta_mid(rng):
    """Mais perto (repete nas duas direções, então nada fica solto): duas colunas de pedra escorrida
    que vão do chão ao teto, com prateleiras saindo do lado delas (as estalactites pendem embaixo da
    prateleira, as estalagmites sobem em cima) e raízes descendo das frestas. A luz verde da boca pega
    a beira esquerda de tudo."""
    W = H = 1024
    yy, xx = grid(W, H)
    M = np.zeros((H, W), np.float32)
    Z = np.full((H, W), -1e3, np.float32)
    ys = np.arange(H, dtype=np.float32)
    cols = []
    xs = (np.arange(2) + rng.uniform(0.15, 0.85, 2)) * W / 2
    for x in xs:
        w = rng.uniform(52, 84)
        # a coluna engorda onde a estalactite encontrou a estalagmite e afina entre elas (bojos)
        bulge = psin(H, rng, 0.32, 2)
        lw = w * (1 + bulge + psin(H, rng, 0.12, 5))
        rw = w * (1 + bulge + psin(H, rng, 0.12, 4))
        cx = x + psin(H, rng, 14, 1)
        cols.append((cx, lw, rw))
        for ox in (-W, 0, W):
            dx = xx - (cx[:, None] + ox)
            half = np.where(dx < 0, lw[:, None], rw[:, None])
            u = dx / half
            ins = np.abs(u) < 1
            z = np.sqrt(np.clip(1 - u * u, 0, 1)) * half * 0.9
            Z = np.where(ins & (z > Z), z, Z)
            M = np.maximum(M, sstep(1.0 + 1.5 / half, 1.0 - 1.5 / half, np.abs(u)))
    # prateleiras saindo das colunas
    ledges = []
    for (cx, lw, rw) in cols:
        for k in range(3):
            y0 = (k + rng.uniform(0.15, 0.85)) * H / 3
            side = rng.choice([-1, 1])
            iy = int(y0) % H
            root = cx[iy] + side * (rw[iy] if side > 0 else lw[iy]) * 0.6
            ln = rng.uniform(110, 240)
            th = rng.uniform(22, 38)
            ledges.append((root, y0, side, ln, th))
    for (root, y0, side, ln, th) in ledges:
        for ox in (-W, 0, W):
            for oy in (-H, 0, H):
                u = (xx - (root + ox)) * side / ln
                if u.max() < 0 or u.min() > 1:
                    continue
                taper = np.clip(1 - u, 0, 1) ** 0.6
                top = y0 + oy - th * 0.35 * taper + np.sin(u * 9 + y0) * 1.5
                bot = y0 + oy + th * 0.65 * taper + np.sin(u * 7 + root) * 2.0
                ins = (u >= -0.05) & (u <= 1) & (yy >= top) & (yy <= bot)
                zl = (bot - yy) * 0.6 + 20 * (1 - u)
                Z = np.where(ins & (zl > Z), zl, Z)
                M = np.maximum(M, ins.astype(np.float32))
    # estalactites embaixo das prateleiras e estalagmites em cima (presas nelas)
    L = None
    drip = WrapMask(W, H)
    for (root, y0, side, ln, th) in ledges:
        for _ in range(int(ln / 14)):
            u = rng.uniform(0.05, 0.85)
            taper = (1 - u) ** 0.6
            x = root + side * u * ln
            yb = y0 + th * 0.65 * taper - 2
            w = rng.uniform(4, 11) * (0.5 + taper)
            ln2 = rng.uniform(20, 90) * (0.4 + taper)
            drip.poly([(x - w, yb), (x + w, yb), (x + w * 0.3, yb + ln2 * 0.7), (x + rng.uniform(-1, 1), yb + ln2)])
            if rng.random() < 0.35:
                yt = y0 - th * 0.35 * taper + 2
                w2 = rng.uniform(3, 6)
                drip.poly([(x - w2, yt), (x + w2, yt), (x + w2 * 0.2, yt - rng.uniform(8, 26))])
    dm = drip.array()
    yy2 = yy
    Zd = np.where(dm > 0.5, 6.0, -1e3)
    Z = np.maximum(Z, Zd)
    M = np.maximum(M, dm)
    # raízes descendo das frestas (penduradas nas prateleiras e na beira das colunas)
    rm = WrapMask(W, H)
    for (root, y0, side, ln, th) in ledges:
        for _ in range(int(rng.integers(1, 4))):
            u = rng.uniform(0.1, 0.7)
            x0 = root + side * u * ln
            yb = y0 + th * 0.6 * (1 - u) ** 0.6
            ln3 = rng.uniform(80, 240)
            pts = [(x0, yb)]
            for s_ in range(1, 14):
                t_ = s_ / 13
                pts.append((x0 + 8 * math.sin(t_ * 5 + x0) * t_, yb + ln3 * t_))
            for s_ in range(len(pts) - 1):
                rm.line([pts[s_], pts[s_ + 1]], 3.0 * (1 - s_ / 14) + 0.8)
    ra = rm.array()
    Z = np.where(Z < -100, 0, Z)
    lump = tnoise(H, W, 26, rng, 3)
    rib = ridged(tnoise_v(H, W, 9, rng, sy=6, octaves=2))
    z2 = Z + lump * 8 + rib * 4
    dif, nx, ny, nz, spec = shade(blur(z2, 1.0), GRUTA_LIGHT, 1.0, spec_pow=20)
    col = mix(CAVE0, CAVE1, sstep(0.0, 0.4, dif)[..., None])
    col = mix(col, CAVE3, sstep(0.4, 0.75, dif)[..., None])
    col = mix(col, CAUST * 0.55 + CAVE3 * 0.45, (sstep(0.7, 0.95, dif) * 0.8)[..., None])
    col = mix(col, CAUST_W * 0.5 + CAVE3 * 0.5, np.clip(spec * 0.7, 0, 0.5)[..., None])
    col = mix(col, mix(BARK0, hexc(0x3b3a30), lump[..., None]) * (0.6 + 0.6 * dif[..., None]), ra[..., None])
    A = np.clip(np.maximum(M, ra), 0, 1)
    flow = np.full((H, W), math.pi / 2, np.float32) + (lump - 0.5) * 0.3
    dump('gruta-mid', col * A[..., None])
    return paint_wrapped(np.clip(col, 0, 1), A, flow, rng, thick(0.38, dry=0.45, bristle=0.5, err=(0, 0.025, 0.035, 0.05), long=1.1, bend=0.3), 64, base=1.0)


# ======================================================================================
# a noite do cais
# ======================================================================================
MX, MY, MR = 400.0, 150.0, 44.0


def cais_sky(rng):
    W, H = 1280, 720
    yy, xx = grid(W, H)
    t = yy / H
    sky = mix(NT0, NT1, sstep(0.0, 0.35, t)[..., None])
    sky = mix(sky, NT2, sstep(0.3, 0.7, t)[..., None])
    sky = mix(sky, NT3, sstep(0.6, 0.85, t)[..., None])
    d_m = np.hypot(xx - MX, yy - MY)
    sky = mix(sky, NT3 * 0.6 + MOON_H * 0.4, (np.exp(-(d_m / 360) ** 2) * 0.55)[..., None])
    sky = mix(sky, MOON_H, (np.exp(-(d_m / 110) ** 2) * 0.35)[..., None])
    # a faixa da via láctea, bem fraca, na diagonal
    band = np.exp(-(((xx - W * 0.75) * 0.5 + (yy - H * 0.1)) / 120) ** 2) * sstep(0.7, 0.2, t)
    mw = tnoise(H, W, 30, rng, 3) if False else value_noise(H, W, 30, rng, 3)
    sky = mix(sky, hexc(0x5a6a9a), (band * mw * 0.35)[..., None])
    # nuvens finas e compridas, com a borda de prata do lado da lua
    st = stretched(H, W, 40, rng, sx=9.0, octaves=3)
    st2 = stretched(H, W, 120, rng, sx=3.0, octaves=2)
    cl = sstep(0.6, 0.78, st * 0.6 + st2 * 0.4) * sstep(0.2, 0.32, t) * sstep(0.6, 0.42, t)
    near = np.exp(-(d_m / 380) ** 2)
    sky = mix(sky, NT1 * 0.7 + NT2 * 0.3, (cl * 0.75)[..., None])
    edge = blur(np.clip(cl - np.roll(cl, 4, axis=0), 0, 1), 1.2)
    sky = mix(sky, SILVER, (edge * (0.3 + 0.9 * near)).clip(0, 0.75)[..., None])
    base = np.clip(blur(sky, 1.6), 0, 1)
    L = Layer.from_rgb(base)
    flow = np.full((H, W), -0.02, np.float32)
    passes = [dict(size=10, spacing=0.9, length=(3.0, 7.0), err=0.01, alpha=0.3, bristle=0.35, dry=0.2, blur=0.6, taper=0.6, ang_jitter=0.05, bend=0.3)]
    paint(L, base, np.ones((H, W), np.float32), flow, rng, passes, val_jitter=0.01, jitter=0.003)
    # estrelas: muitas, de brilhos diferentes, menos perto da lua e atrás das nuvens
    for _ in range(520):
        x, y = rng.uniform(0, W), rng.uniform(0, H * 0.7)
        ix, iy = int(x), int(y)
        if cl[iy, ix] > 0.3 or d_m[iy, ix] < 140:
            continue
        b = rng.random() ** 2.6
        L.dab(x, y, 0.55 + b * 1.1, mix(STAR, hexc(0xffffff), b), 0.35 + 0.6 * b, 0.6)
        if b > 0.55:
            L.dab(x, y, 4 + b * 5, STAR, 0.06, 4)
    # a lua cheia: o disco claro, os mares cinza-azulados e o halo largo
    d = np.hypot(xx - MX, yy - MY)
    L.fill(MOON_H, np.exp(-(d / (MR * 2.6)) ** 2) * 0.16)
    L.fill(MOON_H, np.exp(-(d / (MR * 1.4)) ** 2) * 0.2)
    disk = sstep(MR + 1.0, MR - 1.0, d)
    mare = sstep(0.55, 0.75, value_noise(H, W, 14, rng, 3)) * disk
    limb = sstep(MR * 0.5, MR, d) * disk
    mc = mix(MOON, MOON_S, (mare * 0.55)[..., None])
    mc = mix(mc, MOON_S * 0.9 + MOON_H * 0.1, (limb * 0.25)[..., None])
    L.fill(mc, disk)
    # a serra recortada no horizonte, escura, com a borda de prata nas encostas viradas para a lua
    for (k, ytop, ybase, steep, cA, fogk) in ((0, 0.5, 0.74, 0.7, hexc(0x1a2442), 0.45), (1, 0.6, 0.8, 0.9, hexc(0x0e1528), 0.2)):
        line = range_line(W, rng, 10 + 3 * k, H * ytop, H * ybase, steep, 8)
        mk = sstep(line[None, :] - 0.8, line[None, :] + 0.8, yy)
        slope = np.gradient(blur(line[None, :], 2.0)[0])
        litm = sstep(0.2, -0.4, slope)[None, :] * np.ones((H, 1), np.float32)
        depth = np.clip((yy - line[None, :]) / 60, 0, 1)
        c = mix(cA, cA * 1.6 + SILVER * 0.15, (litm * sstep(1, 0, depth) * 0.6)[..., None])
        c = mix(c, NFOG * 0.6 + cA * 0.4, (sstep(0.3, 1.0, (yy - H * ybase) / (H * 0.2) + 0.5) * fogk)[..., None])
        M = Layer(W, H)
        paint(M, c, mk, np.where(litm > 0.5, -1.0, 1.0).astype(np.float32), rng, thick(0.5, dry=0.3, bristle=0.35, err=(0, 0.02, 0.03, 0.045), long=1.3, bend=0.3), base=1.0)
        L.over(M)
    # a névoa prateada baixa
    L.fill(NFOG, sstep(H * 0.76, H * 0.95, yy) * 0.45)
    return L


def cais_far(rng):
    W, H, PP = 1280, 720, 200
    wide = Wide(W, H, PP)
    CW = wide.CW
    yy, xx = grid(CW, H)
    out = Layer(CW, H)
    # o aqueduto lá no fundo: silhueta reta com o bronze pegando a lua
    sp = 40.0
    phase = rng.uniform(0, sp)
    y_deck = H * 0.47
    a_st, a_br, cl, pl = aqueduct(wide, y_deck, H * 0.7, sp, phase, xx, yy, 0.85)
    A = Layer(CW, H)
    stc = mix(hexc(0x141c30), hexc(0x1d2742), widen(pnoise_x(H, W, 8, rng, 2), PP)[..., None] * 0.6)
    stc = mix(stc, NFOG * 0.5 + stc * 0.5, (sstep(H * 0.62, H * 0.82, yy) * 0.7)[..., None])
    A.fill(stc, a_st)
    A.fill(mix(BRONZE * 0.7, SILVER * 0.5 + BRONZE_L * 0.5, 0.4), a_br * 0.8)
    out.over(A)
    # a outra margem: salgueiros e árvores escuras, a borda de prata virada para a lua (esquerda)
    gl = H * 0.66 + (widen(periodic1d(W, 160, rng, 3)[None, :], PP)[0] - 0.5) * 24
    S = Layer(CW, H)
    S.fill(NSIL1, sstep(gl[None, :] - 1, gl[None, :] + 1, yy))
    for x in np.arange(-40.0, W + 40, 26.0):
        x += rng.normal(0, 8)
        g = float(gl[int(np.clip(x + PP, 0, CW - 1))])
        for xo in wide_xs(wide, x, 120):
            if rng.random() < 0.25:
                willow(S, rng, xo, g + 4, rng.uniform(50, 80), haze=0.0, night=True)
            else:
                r = rng.uniform(9, 20)
                S.dab(xo, g - r * 0.8, r, NSIL1, 0.97, 1.5)
                S.dab(xo + r * 0.5, g - r * 1.1, r * 0.7, NSIL1, 0.97, 1.5)
                S.dab(xo - r * 0.35, g - r * 1.05, r * 0.55, NSIL2 * 0.8 + NSIL1 * 0.2, 0.7, 2)
    out.over(S)
    # o lago na frente da margem: escuro, com o brilho comprido da lua nas ondinhas
    lake = sstep(gl[None, :] + 2, gl[None, :] + 6, yy)
    Lk = Layer(CW, H)
    Lk.fill(mix(NT1, NT2, 0.5), lake)
    for _ in range(900):
        x = rng.uniform(0, CW)
        y = rng.uniform(float(gl.mean()) + 8, H)
        g = float(gl[int(x)])
        if y < g + 6:
            continue
        near = math.exp(-((x % W - MX) / 260) ** 2)
        c = mix(NT3, SILVER, near * rng.uniform(0.4, 1.0))
        Lk.stroke(x, y, rng.normal(0, 0.03), rng.uniform(6, 22), rng.uniform(1.0, 2.2), c, rng.uniform(0.2, 0.55) * (0.3 + 0.7 * near), rng, 0.3, 0.3, taper=0.8)
    out.over(Lk)
    # a névoa sobre a água
    fog = Layer(CW, H)
    fog.fill(NFOG, sstep(gl[None, :] - 20, gl[None, :] + 10, yy) * sstep(gl[None, :] + 60, gl[None, :] + 10, yy) * 0.35)
    out.over(fog)
    return wide.fold(out)


def cais_mid(rng):
    W, H, PP = 1280, 720, 320
    wide = Wide(W, H, PP)
    CW = wide.CW
    yy, xx = grid(CW, H)
    out = Layer(CW, H)
    gl = H * 0.74 + (widen(periodic1d(W, 200, rng, 3)[None, :], PP)[0] - 0.5) * 30
    G = Layer(CW, H)
    G.fill(NSIL0 * 0.8 + NSIL1 * 0.2, sstep(gl[None, :] - 1, gl[None, :] + 1, yy))
    out.over(G)
    # salgueiros grandes, ramos caindo
    xs = (np.arange(2) + rng.uniform(0.2, 0.6, 2)) * W / 2
    for x in xs:
        g = float(gl[int(x) % W]) + 6
        for xo in wide_xs(wide, x, 300):
            willow(out, rng, xo, g, rng.uniform(150, 200), night=True)
    # juncos e taboas na beira
    R = Layer(CW, H)
    for x in np.arange(0, W, 3.0):
        if rng.random() < 0.5:
            continue
        g = float(gl[int(x)])
        ln = rng.uniform(20, 70)
        ang = -math.pi / 2 + rng.normal(0, 0.12)
        for xo in wide_xs(wide, x, 20):
            c = mix(NSIL0, NSIL2, rng.random() * 0.6)
            R.stroke(xo + math.cos(ang) * ln / 2, g + 4 + math.sin(ang) * ln / 2, ang, ln, rng.uniform(1.2, 2.4), c, 0.95, rng, 0.2, 0.1, taper=0.85)
            if rng.random() < 0.08:
                R.stroke(xo + math.cos(ang) * ln * 0.85, g + 4 + math.sin(ang) * ln * 0.85, ang, 10, 4, hexc(0x2a1e1a), 0.95, rng, 0.2, 0.1, taper=0.3)
            if rng.random() < 0.15:
                R.stroke(xo - 1 + math.cos(ang) * ln / 2, g + 4 + math.sin(ang) * ln / 2, ang, ln * 0.7, 0.8, SILVER * 0.4 + NSIL2 * 0.6, 0.6, rng, 0.2, 0.1, taper=0.9)
    out.over(R)
    return wide.fold(out)


# ======================================================================================
def save(L, name):
    img = L.image()
    img.save(f'{OUT}/{name}.png', optimize=True)
    print(name, img.size, round(time.time() - T0, 1), 's', flush=True)
    return img


def preview(out):
    """Composição como a tela do jogo (2x): o vale aberto, as cachoeiras, a gruta e o cais."""
    os.makedirs(out, exist_ok=True)

    def opened(n):
        p = f'{OUT}/{n}.png'
        return Image.open(p).convert('RGBA') if os.path.exists(p) else None

    for name, layers in (('vale', ('vale-sky', 'vale-far', 'vale-mid')), ('cais', ('cais-sky', 'cais-far', 'cais-mid'))):
        view = Image.new('RGBA', (1280, 720), (120, 120, 140, 255))
        for i, n in enumerate(layers):
            im = opened(n)
            if im is None:
                continue
            dy = (0, 30, 80)[i]
            view.alpha_composite(im, (0, dy) if dy == 0 else (0, 0), (0, 0) if dy == 0 else (0, 0))
        view.convert('RGB').save(f'{out}/{name}.png')
    for name, layers in (('cascata', ('cascata-far', 'cascata-mid')), ('gruta', ('gruta-far', 'gruta-mid'))):
        view = Image.new('RGBA', (1280, 720), (40, 40, 50, 255))
        for n, sx, sy in ((layers[0], 0, 0), (layers[1], 300, 200)):
            im = opened(n)
            if im is None:
                continue
            for x in range(-sx, 1280, im.width):
                for y in range(-sy, 720, im.height):
                    view.alpha_composite(im, (max(0, x), max(0, y)), (max(0, -x), max(0, -y)))
        view.convert('RGB').save(f'{out}/{name}.png')


def export(names):
    """Copia as camadas prontas para o jogo (256 cores com alfa, em 2x) e registra a escala no hd.json."""
    import json
    assets = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'game', 'public', 'assets')
    hdj = os.path.join(assets, 'hd.json')
    hd = json.load(open(hdj))
    for n in names:
        src = f'{OUT}/{n}.png'
        if not os.path.exists(src):
            continue
        im = Image.open(src).convert('RGBA')
        q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        q.save(os.path.join(assets, f'{n}.png'), optimize=True)
        hd[n] = 2
        print('exportado', n, os.path.getsize(os.path.join(assets, f'{n}.png')) // 1024, 'KB')
    json.dump(hd, open(hdj, 'w'), indent=1)


LAYERS = {
    'vale-sky': (vale_sky, 181), 'vale-far': (vale_far, 182), 'vale-mid': (vale_mid, 183),
    'cascata-far': (cascata_far, 184), 'cascata-mid': (cascata_mid, 185),
    'gruta-far': (gruta_far, 186), 'gruta-mid': (gruta_mid, 187),
    'cais-sky': (cais_sky, 188), 'cais-far': (cais_far, 189), 'cais-mid': (cais_mid, 190),
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    if '--export' in sys.argv:
        export([n for n in LAYERS if want(n)])
        sys.exit(0)
    for n, (fn, seed) in LAYERS.items():
        if want(n):
            save(fn(np.random.default_rng(seed)), n)
    if PREVIEW:
        preview(PREVIEW)

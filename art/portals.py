"""Paredes em volta das portas e a porta da máscara, no traço liso (ink.py).

Uma porta solta no meio da sala não faz sentido: cada uma ganha a parede onde ela está. A porta
lateral da catedral (na praça) fica num pórtico gótico com contrafortes, arquivoltas, tímpano com o
eclipse e o gablete com a rosácea; as portas de dentro da catedral (nave e galeria) ficam numa
parede de capela com pilastras, friso e velas; as da prisão ficam num paredão de pedra bruta com
lintel, grade, tocha e correntes. A porta da Sala da Máscara é de ferro com a máscara em relevo.

Cada função devolve (prims, decals, W, H, luzes) em pixels do mundo; a origem é o meio de baixo
(os pés da porta). As luzes (x, y, cor) viram brilhos no jogo (Fixtures.ts).

uso: python3 portals.py <pasta_assets> [--preview=<pasta>]
"""
import json
import math
import os
import random
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import puppet
from puppet import Ellipse, Capsule, Poly, norm

puppet.RAMPS['cstone'] = [0x14141f, 0x23253a, 0x363a55, 0x4f5674, 0x6f7896]
puppet.RAMPS['cstone2'] = [0x17161f, 0x2a2836, 0x403c4f, 0x5b566b, 0x7c768c]
puppet.RAMPS.setdefault('stone', [0x15171f, 0x262a36, 0x3b4152, 0x565e73, 0x7b849a])
puppet.RAMPS['pstone'] = [0x0d1110, 0x171d1c, 0x232c2a, 0x33403c, 0x485652]
puppet.RAMPS['pstone2'] = [0x110f0e, 0x1d1a18, 0x2b2724, 0x3c3632, 0x524a44]
puppet.RAMPS['iron'] = [0x101218, 0x1d2029, 0x30343f, 0x4b505e, 0x737a8b]
puppet.RAMPS['rust'] = [0x1a1311, 0x302220, 0x4a3329, 0x684834, 0x8a6446]
puppet.RAMPS['ember'] = [0x5a1606, 0xa8340c, 0xe4691a, 0xffa94a, 0xffe2a0]
puppet.RAMPS['wax'] = [0x6a5a44, 0x9c8868, 0xc9b690, 0xe6d6b2, 0xfaf0d6]
puppet.RAMPS['glass'] = [0x140f2a, 0x22184a, 0x3a2a72, 0x5a4aa0, 0x8f86d0]
puppet.RAMPS.setdefault('porcelain', [0x5d5754, 0x958e86, 0xc4bcae, 0xe6dfd0, 0xfdf8ec])
puppet.SHINY.setdefault('iron', (0.45, 12))
puppet.RIM_MATS |= {'cstone', 'cstone2', 'stone', 'pstone', 'pstone2', 'iron', 'rust', 'gold'}

WARM = 0xffb25a


# ---------------------------------------------------------------- formas
def bevel(x0, y0, x1, y1, b=1.6, tilt=0.55):
    """Normal de bloco de pedra: chapado no meio, as bordas viram para fora (chanfro)."""
    def nf(x, y):
        x = np.asarray(x, np.float32)
        y = np.asarray(y, np.float32)
        nx = np.where(x < x0 + b, -tilt, np.where(x > x1 - b, tilt, 0.0))
        ny = np.where(y < y0 + b, -tilt, np.where(y > y1 - b, tilt, -0.06))
        nz = np.ones_like(x)
        l = np.sqrt(nx * nx + ny * ny + nz * nz)
        return nx / l, ny / l, nz / l
    return nf


def block(prims, name, mat, z, x0, y0, x1, y1, b=1.6, shade=1.0, rough=0.0, rnd=None):
    """Bloco de pedra (com os cantos um pouco tortos quando rough > 0)."""
    if rough and rnd:
        j = lambda: (rnd.random() - 0.5) * rough
        pts = [(x0 + j(), y0 + j()), (x1 + j(), y0 + j()), (x1 + j(), y1 + j()), (x0 + j(), y1 + j())]
    else:
        pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    prims.append(Poly(name, mat, z, pts, nf=bevel(x0, y0, x1, y1, b), shade=shade))


def ashlar(prims, name, mat, z, x0, y0, x1, y1, row_h=10, w=(14, 24), rnd=None, holes=(), shade=(0.92, 1.08), rough=0.0, b=1.6):
    """Parede de blocos em fiadas desencontradas, de baixo para cima. holes: retângulos sem blocos."""
    rnd = rnd or random.Random(1)
    y = y1
    row = 0
    while y > y0 + 0.5:
        ya = max(y0, y - row_h)
        x = x0 - (rnd.uniform(0, w[0]) if row % 2 else 0)
        while x < x1 - 0.5:
            bw = rnd.uniform(*w)
            xa, xb = max(x0, x), min(x1, x + bw)
            # o bloco que cai num buraco é cortado na borda dele (sobram os pedaços de fora)
            parts = [(xa, xb)]
            for hx0, hy0, hx1, hy1 in holes:
                if hy0 < y and hy1 > ya:
                    nxt = []
                    for pa, pb in parts:
                        if hx0 < pb and hx1 > pa:
                            if hx0 - pa > 2:
                                nxt.append((pa, hx0))
                            if pb - hx1 > 2:
                                nxt.append((hx1, pb))
                        else:
                            nxt.append((pa, pb))
                    parts = nxt
            sh = rnd.uniform(*shade)
            for pa, pb in parts:
                if pb - pa > 2:
                    block(prims, name, mat, z, pa, ya, pb, y, b=b, shade=sh, rough=rough, rnd=rnd)
            x += bw
        y = ya
        row += 1


def pointed(cx, sy, w, k=0.55, n=10):
    """Arco gótico (quebrado): do pé esquerdo, subindo até a ponta e descendo ao pé direito.
    k: 0 = meio círculo; perto de 1 = bem pontudo."""
    r = w * (1 + k)
    a_end = math.acos(-k / (1 + k))
    pts = []
    ox = cx + k * w
    for i in range(n + 1):
        a = math.pi - (math.pi - a_end) * i / n
        pts.append((ox + math.cos(a) * r, sy - math.sin(a) * r))
    ox = cx - k * w
    start = math.pi - a_end
    for i in range(1, n + 1):
        a = start - start * i / n
        pts.append((ox + math.cos(a) * r, sy - math.sin(a) * r))
    return pts


def arch_ring(prims, name, mat, z, cx, sy, w_in, w_out, k, jamb_to=None, n=9, shade=1.0, rnd=None):
    """Arquivolta: aduelas (pedras em cunha) entre o arco de dentro e o de fora, e as ombreiras
    descendo até jamb_to."""
    inner = pointed(cx, sy, w_in, k, n)
    outer = pointed(cx, sy, w_out, k, n)
    for i in range(len(inner) - 1):
        a, b = inner[i], inner[i + 1]
        c, d = outer[i + 1], outer[i]
        mx = (a[0] + b[0] + c[0] + d[0]) / 4
        my = (a[1] + b[1] + c[1] + d[1]) / 4
        # normal da moldura: aponta para fora do centro do arco (meia-cana)
        def nf(x, y, mx=mx, my=my):
            x = np.asarray(x, np.float32)
            y = np.asarray(y, np.float32)
            dx, dy = x - cx, y - sy + 6
            l = np.sqrt(dx * dx + dy * dy) + 1e-3
            nx, ny = dx / l * 0.45, dy / l * 0.45
            nz = np.ones_like(x)
            q = np.sqrt(nx * nx + ny * ny + nz * nz)
            return nx / q, ny / q, nz / q
        sh = shade * (rnd.uniform(0.94, 1.06) if rnd else 1.0)
        prims.append(Poly(name, mat, z, [a, b, c, d], nf=nf, shade=sh))
    if jamb_to is not None:
        for side in (-1, 1):
            x0 = cx + side * w_in
            x1 = cx + side * w_out
            xa, xb = min(x0, x1), max(x0, x1)
            y = sy
            while y < jamb_to - 0.5:
                yb = min(jamb_to, y + 11)
                block(prims, name, mat, z, xa, y, xb, yb, b=1.4, shade=shade * (rnd.uniform(0.94, 1.06) if rnd else 1.0))
                y = yb


def ring(prims, name, mat, z, c, rx, ry, r, n=16, ang0=0.0, shade=1.0):
    pts = [(c[0] + math.cos(ang0 + i / n * 2 * math.pi) * rx, c[1] + math.sin(ang0 + i / n * 2 * math.pi) * ry) for i in range(n + 1)]
    for a, b in zip(pts, pts[1:]):
        prims.append(Capsule(name, mat, z, a, b, r, r, shade=shade))


def flame(prims, name, z, x, y, h=4.0):
    prims.append(Ellipse(name, 'ember', z, (x, y - h * 0.45), h * 0.32, h * 0.6, flat=3))
    prims.append(Ellipse(name + 'c', 'ember', z + 0.01, (x, y - h * 0.3), h * 0.16, h * 0.34, flat=4))


def eclipse(prims, z, cx, cy, r, rays=12):
    """O eclipse da Casa Vhalor: disco escuro, coroa de ouro e raios curtos."""
    for i in range(rays):
        a = i / rays * 2 * math.pi + 0.13
        p0 = (cx + math.cos(a) * (r + 1.6), cy + math.sin(a) * (r + 1.6))
        p1 = (cx + math.cos(a) * (r + 4.6 + (i % 2) * 1.6), cy + math.sin(a) * (r + 4.6 + (i % 2) * 1.6))
        prims.append(Capsule('ray', 'gold', z, p0, p1, 0.7, 0.35))
    ring(prims, 'corona', 'gold', z + 0.01, (cx, cy), r + 0.9, r + 0.9, 0.75, n=22)
    prims.append(Ellipse('disc', 'void', z + 0.02, (cx, cy), r, r, flat=1))


# ---------------------------------------------------------------- pórtico da catedral (praça)
def portal_cathedral():
    W, H = 176, 240
    cx = 88.0
    rnd = random.Random(7)
    P = []
    lights = []
    # parede do fundo em fiadas
    # fundo escuro atrás das pedras: as juntas ficam fundas em vez de vazadas
    P.append(Poly('back', 'cstone', 0.1, [(14, 34), (162, 34), (162, 222), (14, 222)], nf=lambda x, y: (0.0, 0.0, 1.0), flat=0))
    ashlar(P, 'wall', 'cstone', 0.2, 14, 34, 162, 222, row_h=10, w=(16, 26), rnd=rnd, holes=[(cx - 24, 150, cx + 24, 222)])
    # embasamento com moldura chanfrada
    block(P, 'socle', 'cstone2', 0.4, 8, 222, 168, 240, b=2.4)
    block(P, 'socle', 'cstone2', 0.41, 10, 218, 166, 223, b=1.2, shade=1.1)
    # contrafortes com recuos e pináculos
    for side in (-1, 1):
        def X(v):
            return cx + side * v
        for (a, b, y0, y1) in ((62, 88, 150, 222), (64, 86, 88, 150), (67, 83, 44, 88)):
            xa, xb = sorted((X(a), X(b)))
            ashlar(P, 'butt', 'cstone2', 0.6, xa, y0, xb, y1, row_h=11, w=(9, 14), rnd=rnd)
        # capas inclinadas dos recuos
        for (a, b, y) in ((62, 88, 150), (64, 86, 88)):
            xa, xb = sorted((X(a), X(b)))
            P.append(Poly('cap', 'cstone2', 0.62, [(xa - 1, y + 0.5), (xb + 1, y + 0.5), ((xa + xb) / 2, y - 6)],
                          nf=lambda x, y: (0.0 * np.asarray(x), -0.6 + 0 * np.asarray(y), 0.8 + 0 * np.asarray(x)), shade=1.1))
        # pináculo
        px = X(75)
        P.append(Poly('spire', 'cstone2', 0.64, [(px - 7, 44), (px + 7, 44), (px, 6)], nf=lambda x, y, px=px: (np.sign(np.asarray(x) - px) * 0.5, -0.3 + 0 * np.asarray(y), 0.8), shade=1.05))
        for t in (0.25, 0.5, 0.75):
            yy = 44 - 38 * t
            hw = 7 * (1 - t)
            for s2 in (-1, 1):
                P.append(Ellipse('crocket', 'cstone2', 0.66, (px + s2 * (hw + 0.6), yy), 1.5, 1.2, shade=1.1))
        P.append(Ellipse('finial', 'cstone2', 0.67, (px, 5.0), 1.8, 2.2, shade=1.15))
        # nicho com a estátua de um santo encapuzado
        nx0 = X(52) if side < 0 else X(40)
        nx1 = nx0 + 14
        npts = pointed((nx0 + nx1) / 2, 158, 7, 0.4, 6)
        P.append(Poly('niche', 'cstone', 0.5, [(nx0, 200)] + npts + [(nx1, 200)], nf=lambda x, y: (0.0, 0.0, 1.0), flat=0))
        sx = (nx0 + nx1) / 2
        P.append(Poly('saint', 'cstone2', 0.55, [(sx - 5, 199), (sx - 4, 170), (sx, 164), (sx + 4, 170), (sx + 5, 199)],
                      nf=lambda x, y, sx=sx: (np.clip((np.asarray(x) - sx) / 6, -1, 1) * 0.7, -0.1 + 0 * np.asarray(y), 0.7), shade=1.2))
        P.append(Ellipse('saint', 'cstone2', 0.56, (sx, 165), 3.2, 3.6, shade=1.25))
        P.append(Poly('ledge', 'cstone2', 0.57, [(nx0 - 1.5, 199), (nx1 + 1.5, 199), (nx1, 203), (nx0, 203)], nf=lambda x, y: (0.0, -0.5, 0.86), shade=1.1))
    # vão fundo da porta (escuro) e o tímpano com o eclipse
    door_top = 240 - 56
    P.append(Poly('recess', 'cstone', 0.45, [(cx - 24, 222)] + pointed(cx, 176, 24, 0.55, 12) + [(cx + 24, 222)], nf=lambda x, y: (0.0, 0.0, 1.0), flat=0))
    P.append(Poly('tymp', 'cstone', 0.5, pointed(cx, 176, 22, 0.55, 12) + [(cx + 22, 180), (cx - 22, 180)], nf=lambda x, y: (0.0, -0.1, 1.0), shade=0.95))
    eclipse(P, 0.52, cx, 163, 6.2)
    P.append(Poly('lintel', 'cstone2', 0.53, [(cx - 22, 178), (cx + 22, 178), (cx + 22, door_top + 1), (cx - 22, door_top + 1)], nf=bevel(cx - 22, 178, cx + 22, door_top + 1), shade=1.05))
    # arquivoltas (três), com colunelos nas ombreiras
    for j, (wi, wo) in enumerate(((24, 30), (30, 36), (36, 42))):
        arch_ring(P, f'arch{j}', 'cstone2', 0.8 + j * 0.03, cx, 176, wi, wo, 0.55, jamb_to=222, n=8, shade=1.0 + 0.04 * (2 - j), rnd=rnd)
        for side in (-1, 1):
            x = cx + side * (wi + wo) / 2
            P.append(Capsule(f'col{j}', 'cstone2', 0.9 + j * 0.03, (x, 178), (x, 220), 1.5, 1.5, shade=1.12))
            P.append(Ellipse(f'capital{j}', 'cstone2', 0.91 + j * 0.03, (x, 177), 3.0, 1.8, shade=1.15))
    # gablete com crochês, florão e rosácea
    gl, gr, gt, gy = cx - 46, cx + 46, 58.0, 122.0
    for (a, b) in (((gl, gy), (cx, gt)), ((cx, gt), (gr, gy))):
        P.append(Capsule('gable', 'cstone2', 0.95, a, b, 2.6, 2.6, shade=1.1))
        for t in (0.2, 0.4, 0.6, 0.8):
            px, py = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            P.append(Ellipse('crocket', 'cstone2', 0.96, (px, py - 3.2), 1.7, 1.4, shade=1.15))
    P.append(Poly('gfill', 'cstone', 0.7, [(gl + 3, gy), (cx, gt + 4), (gr - 3, gy)], nf=lambda x, y: (0.0, -0.05, 1.0), shade=0.9))
    P.append(Ellipse('finial', 'cstone2', 0.97, (cx, gt - 4), 2.4, 3.2, shade=1.2))
    for s2 in (-1, 1):
        P.append(Ellipse('finial', 'cstone2', 0.97, (cx + s2 * 2.6, gt - 2), 1.6, 1.2, shade=1.15))
    rc = (cx, 100.0)
    P.append(Ellipse('roseglass', 'glass', 0.72, rc, 11.0, 11.0, flat=2))
    for i in range(6):
        a = i / 6 * 2 * math.pi
        P.append(Ellipse('rosepetal', 'glass', 0.73, (rc[0] + math.cos(a) * 5.6, rc[1] + math.sin(a) * 5.6), 3.0, 3.0, flat=3))
        P.append(Capsule('tracery', 'cstone2', 0.75, rc, (rc[0] + math.cos(a + math.pi / 6) * 10.6, rc[1] + math.sin(a + math.pi / 6) * 10.6), 0.7, 0.7, shade=1.1))
    ring(P, 'roseframe', 'cstone2', 0.76, rc, 11.4, 11.4, 1.5, n=24, shade=1.1)
    P.append(Ellipse('rosehub', 'cstone2', 0.77, rc, 2.0, 2.0, shade=1.15))
    # cornija e arcaria cega no alto, parapeito com ameias
    block(P, 'cornice', 'cstone2', 0.7, 14, 34, 162, 42, b=2.0, shade=1.1)
    for i in range(8):
        x0 = 20 + i * 17.5
        if x0 > 40 and x0 < 120:
            continue
        P.append(Poly('blind', 'cstone', 0.68, [(x0, 62)] + pointed(x0 + 6, 52, 6, 0.4, 5) + [(x0 + 12, 62)], nf=lambda x, y: (0.0, 0.0, 1.0), flat=1))
    for i in range(9):
        x0 = 14 + i * 17
        block(P, 'merlon', 'cstone2', 0.69, x0, 24, x0 + 10, 34, b=1.6, shade=1.05)
    # lanterna de ferro presa no contraforte da direita
    lx, ly = cx + 54, 150.0
    P.append(Capsule('arm', 'iron', 1.1, (cx + 62, 140), (lx, 140), 1.0, 1.0))
    P.append(Capsule('arm', 'iron', 1.1, (cx + 62, 147), (lx + 4, 140), 0.7, 0.7))
    P.append(Capsule('hang', 'iron', 1.1, (lx, 140), (lx, 145), 0.5, 0.5))
    P.append(Poly('lamp', 'iron', 1.12, [(lx - 4, 146), (lx + 4, 146), (lx + 3, 157), (lx - 3, 157)], nf=lambda x, y: (0.0, -0.2, 0.98), shade=0.9))
    P.append(Poly('lampglass', 'ember', 1.13, [(lx - 2.6, 148), (lx + 2.6, 148), (lx + 2, 155.5), (lx - 2, 155.5)], nf=lambda x, y: (0.0, 0.0, 1.0), flat=2))
    flame(P, 'flame', 1.14, lx, 155, 5.0)
    P.append(Poly('lamptop', 'iron', 1.15, [(lx - 5, 146.5), (lx + 5, 146.5), (lx, 141.5)], nf=lambda x, y: (0.0, -0.6, 0.8)))
    lights.append((lx, 151, WARM))
    # degraus na frente
    block(P, 'step', 'cstone2', 1.2, cx - 30, 236, cx + 30, 240, b=1.2, shade=1.12)
    return P, [], W, H, lights


# ---------------------------------------------------------------- parede de capela (nave, galeria)
def portal_nave():
    W, H = 128, 176
    cx = 64.0
    rnd = random.Random(11)
    P = []
    lights = []
    P.append(Poly('back', 'stone', 0.1, [(12, 24), (116, 24), (116, 168), (12, 168)], nf=lambda x, y: (0.0, 0.0, 1.0), flat=0))
    ashlar(P, 'wall', 'stone', 0.2, 12, 24, 116, 168, row_h=9, w=(14, 22), rnd=rnd, holes=[(cx - 22, 100, cx + 22, 168)])
    block(P, 'socle', 'stone', 0.4, 6, 166, 122, 176, b=2.0, shade=1.05)
    # pilastras com base e capitel
    for side in (-1, 1):
        x0, x1 = sorted((cx + side * 52, cx + side * 64))
        ashlar(P, 'pil', 'stone', 0.6, x0, 30, x1, 164, row_h=12, w=(12, 13), rnd=rnd, shade=(1.02, 1.1))
        block(P, 'pilbase', 'stone', 0.62, x0 - 2, 162, x1 + 2, 172, b=1.8, shade=1.1)
        block(P, 'pilcap', 'stone', 0.62, x0 - 2.5, 26, x1 + 2.5, 33, b=1.6, shade=1.15)
        for k in (-1, 1):
            P.append(Ellipse('volute', 'stone', 0.63, ((x0 + x1) / 2 + k * 4.2, 31), 2.0, 2.0, shade=1.2))
        # arandela com vela acesa
        sx = (x0 + x1) / 2
        P.append(Poly('sconce', 'gold', 1.1, [(sx - 4, 112), (sx + 4, 112), (sx + 2, 116), (sx - 2, 116)], nf=lambda x, y: (0.0, -0.3, 0.95)))
        P.append(Capsule('sconce', 'gold', 1.1, (sx, 116), (sx, 121), 0.8, 1.2))
        P.append(Capsule('candle', 'wax', 1.12, (sx, 111.5), (sx, 105), 1.4, 1.4))
        flame(P, 'flame', 1.14, sx, 104.5, 4.6)
        lights.append((sx, 102, WARM))
    # vão da porta, tímpano e duas arquivoltas
    P.append(Poly('recess', 'stone', 0.45, [(cx - 22, 168)] + pointed(cx, 128, 22, 0.5, 12) + [(cx + 22, 168)], nf=lambda x, y: (0.0, 0.0, 1.0), flat=0))
    P.append(Poly('tymp', 'stone', 0.5, pointed(cx, 128, 20, 0.5, 12) + [(cx + 20, 122), (cx - 20, 122)], nf=lambda x, y: (0.0, -0.1, 1.0), shade=0.95))
    eclipse(P, 0.52, cx, 113, 4.6, rays=10)
    for j, (wi, wo) in enumerate(((22, 28), (28, 33))):
        arch_ring(P, f'arch{j}', 'stone', 0.8 + j * 0.03, cx, 128, wi, wo, 0.5, jamb_to=166, n=8, shade=1.04 + 0.04 * (1 - j), rnd=rnd)
    # friso com o relevo (um medalhão e duas folhas) e a cornija com dentículos
    block(P, 'frieze', 'stone', 0.55, 28, 44, 100, 64, b=1.8, shade=1.0)
    ring(P, 'medal', 'stone', 0.57, (cx, 54), 7.6, 7.6, 1.3, n=20, shade=1.15)
    P.append(Ellipse('medalin', 'stone', 0.56, (cx, 54), 6.6, 6.6, shade=0.95))
    P.append(Ellipse('medalsun', 'gold', 0.58, (cx, 54), 3.0, 3.0, shade=1.0))
    for s2 in (-1, 1):
        for t in range(3):
            P.append(Ellipse('leaf', 'stone', 0.57, (cx + s2 * (14 + t * 7), 54 + (t % 2) * 1.5), 3.6, 2.0, ang=s2 * 0.5, shade=1.12))
    block(P, 'cornice', 'stone', 0.7, 2, 14, 126, 22, b=2.0, shade=1.12)
    for i in range(15):
        x0 = 5 + i * 8.2
        block(P, 'dentil', 'stone', 0.71, x0, 22, x0 + 4.4, 25.5, b=1.0, shade=1.05)
    # balaustrada em cima
    block(P, 'rail', 'stone', 0.66, 4, 2, 124, 6, b=1.2, shade=1.12)
    for i in range(12):
        x = 9 + i * 10.0
        P.append(Capsule('baluster', 'stone', 0.65, (x, 7), (x, 13), 1.7, 1.2, shade=1.08))
    return P, [], W, H, lights


# ---------------------------------------------------------------- paredão da prisão
def portal_prison():
    W, H = 112, 144
    cx = 56.0
    rnd = random.Random(23)
    P = []
    lights = []
    P.append(Poly('back', 'pstone', 0.1, [(1, 16), (111, 16), (111, 144), (1, 144)], nf=lambda x, y: (0.0, 0.0, 1.0), flat=0))
    ashlar(P, 'wall', 'pstone', 0.2, 2, 16, 110, 144, row_h=14, w=(18, 30), rnd=rnd, holes=[(34, 74, 78, 144)], rough=1.6, b=2.2, shade=(0.88, 1.08))
    # ombreiras e lintel grosso com cravos
    for x0, x1 in ((34, 41), (71, 78)):
        y = 88.0
        while y < 144:
            yb = min(144.0, y + 14)
            block(P, 'jamb', 'pstone2', 0.6, x0, y, x1, yb, b=1.6, shade=rnd.uniform(1.0, 1.1))
            y = yb
    P.append(Poly('recess', 'pstone', 0.45, [(41, 144), (41, 88), (71, 88), (71, 144)], nf=lambda x, y: (0.0, 0.0, 1.0), flat=0))
    block(P, 'lintel', 'pstone2', 0.65, 28, 74, 84, 89, b=2.4, shade=1.08)
    for x in (33, 42, 51, 61, 70, 79):
        P.append(Ellipse('stud', 'iron', 0.7, (x, 81.5), 1.3, 1.3))
    # janelinha com grade em cima do lintel
    P.append(Poly('slit', 'void', 0.5, [(46, 70), (46, 56), (66, 56), (66, 70)], nf=lambda x, y: (0.0, 0.0, 1.0), flat=1))
    block(P, 'sill', 'pstone2', 0.55, 43, 69, 69, 73, b=1.2, shade=1.1)
    block(P, 'slitcap', 'pstone2', 0.55, 43, 52, 69, 56.5, b=1.2, shade=1.05)
    for x in (50, 56, 62):
        P.append(Capsule('bar', 'iron', 0.6, (x, 56.5), (x, 69.5), 0.9, 0.9))
    P.append(Capsule('bar', 'iron', 0.61, (46.5, 62.5), (65.5, 62.5), 0.7, 0.7))
    # tocha na parede da esquerda
    tx, ty = 20.0, 100.0
    P.append(Poly('tplate', 'iron', 1.05, [(tx - 3, ty + 4), (tx + 3, ty + 4), (tx + 3, ty + 12), (tx - 3, ty + 12)], nf=lambda x, y: (0.0, -0.2, 0.98)))
    P.append(Capsule('tarm', 'iron', 1.06, (tx, ty + 8), (tx + 2, ty + 1), 0.9, 0.9))
    P.append(Capsule('torch', 'wood', 1.07, (tx + 2.6, ty + 2), (tx + 0.6, ty - 9), 1.5, 1.9))
    P.append(Poly('tcup', 'iron', 1.08, [(tx - 2.6, ty - 9), (tx + 4, ty - 9), (tx + 3, ty - 4), (tx - 1.6, ty - 4)], nf=lambda x, y: (0.0, -0.2, 0.98)))
    flame(P, 'flame', 1.1, tx + 0.7, ty - 9.5, 8.0)
    lights.append((tx + 0.7, ty - 14, 0xff9a40))
    # correntes com algemas à direita
    for k, (x, ln) in enumerate(((92.0, 26), (100.0, 18))):
        P.append(Ellipse('staple', 'iron', 0.9, (x, 64), 1.8, 1.4))
        y = 66.0
        for i in range(int(ln / 3.2)):
            if i % 2:
                P.append(Ellipse('link', 'rust', 0.92, (x, y + 1.6), 0.8, 1.9, shade=1.0))
            else:
                ring(P, 'link', 'rust', 0.92, (x, y + 1.6), 1.2, 1.9, 0.5, n=8)
            y += 3.2
        ring(P, 'cuff', 'iron', 0.95, (x, y + 3), 3.0, 2.4, 0.9, n=12)
    # cornija saliente e ameias (só aparecem nas salas altas)
    block(P, 'cornice', 'pstone2', 0.7, 0, 8, 112, 18, b=2.2, shade=1.12)
    for i in range(7):
        x0 = 2 + i * 16
        block(P, 'merlon', 'pstone2', 0.69, x0, 0, x0 + 10, 8, b=1.6, shade=1.05, rough=0.8, rnd=rnd)
    return P, [], W, H, lights


# ---------------------------------------------------------------- porta da máscara (fuga <-> máscara)
def door_mask():
    import props_hd
    W, H = 32, 56
    P = []
    frame = props_hd.arch_pts(0.5, 31.5, 15.0, 0.6, 56.0, n=14)
    P.append(Poly('frame', 'pstone2', 0.5, frame, nf=lambda x, y: (np.clip((np.asarray(x) - 16) / 40, -1, 1), -0.25 + 0 * np.asarray(y), 0.95 + 0 * np.asarray(x))))
    leaf = props_hd.arch_pts(4.2, 27.8, 16.0, 4.6, 56.0, n=14)
    P.append(Poly('leaf', 'iron', 1.0, leaf, nf=lambda x, y: (0.18 * np.sin((np.asarray(x) - 4.2) / 23.6 * math.pi * 2), -0.25 + 0 * np.asarray(y), 0.95), shade=1.08))
    # máscara em relevo: o rosto de porcelana com os olhos vazados e uma rachadura
    P.append(Ellipse('mask', 'porcelain', 1.2, (16.0, 27.0), 7.2, 9.4, bulge=0.8, shade=0.86))
    for s in (-1, 1):
        P.append(Ellipse('eye', 'void', 1.3, (16 + s * 3.0, 24.6), 1.6, 0.85, ang=s * -0.25, flat=0))
    P.append(Capsule('mouth', 'void', 1.3, (13.6, 32.6), (18.4, 32.6), 0.45, 0.45, flat=0))
    P.append(Capsule('crack', 'void', 1.31, (17.6, 18.2), (16.2, 23.0), 0.32, 0.25, flat=0))
    P.append(Capsule('crack', 'void', 1.31, (16.2, 23.0), (18.0, 27.6), 0.25, 0.2, flat=0))
    # rebites e as faixas de ferro
    for yb in (40.0, 49.0):
        P.append(Capsule('band', 'iron', 1.1, (4.8, yb), (27.2, yb), 1.0, 1.0, shade=1.1))
        for xb in (7.0, 12.5, 19.5, 25.0):
            P.append(Ellipse('nail', 'iron', 1.15, (xb, yb), 0.7, 0.7))
    for (x, y) in ((7.0, 12.0), (25.0, 12.0), (5.6, 30.0), (26.4, 30.0)):
        P.append(Ellipse('nail', 'iron', 1.15, (x, y), 0.7, 0.7))
    P.append(Capsule('step', 'pstone2', 2.5, (1.6, 55.0), (30.4, 55.0), 1.1, 1.1, flat=3))
    return P, [], W, H, []


PORTALS = {
    'deco-portal-cathedral': portal_cathedral,
    'deco-portal-nave': portal_nave,
    'deco-portal-prison': portal_prison,
    'deco-door-mask': door_mask,
}


if __name__ == '__main__':
    import ink
    from PIL import Image
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = args[0] if args else '.'
    only = set(args[1:])
    prev = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
    made = {}
    lights = {}
    for k, fn in PORTALS.items():
        if only and k not in only:
            continue
        prims, decals, W, H, L = fn()
        a = ink.render_frame(prims, decals, W, H, style=ink.HK)
        im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        im.save(f'{out}/{k}.png')
        made[k] = ink.S
        lights[k] = [[round(x - W / 2, 1), round(y - H, 1), c] for x, y, c in L]
        if prev:
            bg = Image.new('RGBA', im.size, (30, 34, 48, 255))
            bg.alpha_composite(im)
            bg.save(f'{prev}/{k}.png')
        print(k, im.size, len(prims), 'partes', flush=True)
    path = f'{out}/hd.json'
    hd = json.load(open(path)) if os.path.exists(path) else {}
    hd.update(made)
    json.dump(hd, open(path, 'w'), indent=1)
    # luzes de cada parede (em relação aos pés da porta), para o jogo acender
    lp = f'{out}/portal-lights.json'
    old = json.load(open(lp)) if os.path.exists(lp) else {}
    old.update(lights)
    json.dump(old, open(lp, 'w'), indent=1)

"""As pranchas grandes dos quatro cajados para a escolha do mago, no jeito da arte do Enio (o cajado
na diagonal, do pé embaixo à esquerda até a ponta em cima à direita, sobre um círculo claro de
aquarela com uma coroa de nuvens cinza, e a luz da magia em volta do que brilha).

O Eclipse usa a própria arte do Enio (magos/cajado-eclipse-arte-enio.png), só reduzida; os outros
três são desenhados aqui no traço liso (ink.py) com os mesmos volumes do cajado do jogo (staffs.py).

uso: python3 staff_art.py <pasta_assets> [--enio=<png do Enio>] [--preview=<pasta>]
"""
import math
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageFilter
import ink
import staffs

SIZE = 512          # a prancha final (quadrada)
DESIGN = 256        # pixels de desenho (o traço liso sai com ink.S por pixel)
K = 4.4             # quanto o cajado cresce em relação ao do boneco

# o tom do papel de cada prancha (fundo, coroa de nuvens) e as cores que brilham
PAPER = {
    'necro': ((233, 236, 233), (120, 132, 128)),
    'veu': ((234, 230, 236), (124, 114, 132)),
    'espaco': ((230, 233, 238), (112, 122, 138)),
    'eclipse': ((236, 233, 228), (128, 124, 118)),
}
GLOW = {
    'eclipse': ['eclipse'],
    'necro': ['soul'],
    'veu': ['abyssglow', 'membrane', 'abyssmag'],
    'espaco': ['lens'],
}


def noise(n, seed, octaves=5):
    rng = np.random.default_rng(seed)
    out = np.zeros((n, n), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        g = 4 * 2 ** o
        grid = rng.random((g + 1, g + 1)).astype(np.float32)
        im = Image.fromarray((grid * 255).astype(np.uint8), 'L').resize((n, n), Image.BICUBIC)
        out += np.asarray(im, np.float32) / 255 * amp
        tot += amp
        amp *= 0.5
    return out / tot


def backdrop(kind):
    n = SIZE
    base, cloud = PAPER[kind]
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    c = (n - 1) / 2
    r = np.hypot(xx - c, yy - c) / (n / 2)
    seed = sum(map(ord, kind))
    nz = noise(n, seed)
    nz2 = noise(n, seed + 7, 6)
    img = np.ones((n, n, 3), np.float32) * np.array(base, np.float32) / 255
    # o papel: manchas leves no fundo todo
    img *= (0.965 + 0.05 * nz2[..., None])
    # a coroa de nuvens cinza em volta do círculo claro (mais forte entre 0,62 e 0,95 do raio)
    ring = np.clip(1 - np.abs(r - 0.8) / 0.2, 0, 1) ** 1.3
    cl = np.clip((nz - 0.34) * 2.8, 0, 1) * ring
    cl = cl * (0.75 + 0.5 * nz2)
    cc = np.array(cloud, np.float32) / 255
    img = img * (1 - 0.55 * cl[..., None]) + cc * 0.55 * cl[..., None]
    # o círculo do meio, mais claro, e dois aros finos
    inner = np.clip(1 - r / 0.66, 0, 1) ** 0.6
    img = img * (1 - 0.35 * inner[..., None]) + 0.35 * inner[..., None] * np.array([0.985, 0.98, 0.975], np.float32)
    for rr, a in ((0.66, 0.08), (0.9, 0.05)):
        line = np.clip(1 - np.abs(r - rr) / 0.006, 0, 1)
        img = img * (1 - a * line[..., None]) + a * line[..., None] * cc
    # a moldura: uma linha fina por dentro da borda
    m = 10
    frame = np.zeros((n, n), np.float32)
    frame[m:m + 2, m:n - m] = frame[n - m - 2:n - m, m:n - m] = 1
    frame[m:n - m, m:m + 2] = frame[m:n - m, n - m - 2:n - m] = 1
    img = img * (1 - 0.18 * frame[..., None]) + 0.18 * frame[..., None] * cc
    return np.clip(img, 0, 1)


# ------------------------------------------------------------------ pranchas detalhadas
# o cajado na diagonal: do pé (embaixo à esquerda) até a ponta (em cima à direita)
P0 = (50.0, 210.0)
SD = (math.cos(math.radians(-45)), math.sin(math.radians(-45)))
PLATE_STYLE = dict(ink.HK, outline=1.25, inner=0.6, bands=(-1.0, 0.32, 0.62, 0.9), soft=0.03, ao=1.4, ao_k=0.35)
DOWN = (0.0, 1.0)


def _F(L):
    """Eixo do cajado com o comprimento L (desenho): F.A(t, s) com t de 0 (pé) a L (ponta)."""
    total = math.hypot(146, 146)
    k = total / L
    return staffs.Frame(P0, SD, k)


def _pts(F, ts):
    return [F.A(t, s) for t, s in ts]


def _chain(P, F, name, mat, z, ts, r0, r1, shade=1.0):
    q = _pts(F, ts)
    n = len(q) - 1
    for i in range(n):
        ra = (r0 + (r1 - r0) * i / n) * F.k
        rb = (r0 + (r1 - r0) * (i + 1) / n) * F.k
        P.append(staffs.Capsule(name, mat, z, q[i], q[i + 1], ra, rb, shade=shade))


def plate_necro():
    from puppet import Ellipse, Capsule, Poly, Decal, norm
    P, D = [], []
    F = _F(48.0)
    A, k = F.A, F.k
    ang = F.ang
    # a ponteira de ferro com dois aros
    P.append(Poly('nferrule', 'steel', 1.0, [A(-0.6), A(3.0, -1.25), A(4.2, -1.2), A(4.2, 1.2), A(3.0, 1.25)], nf=lambda x, y: norm((-0.2, -0.4, 0.9))))
    for t in (4.4, 5.4):
        P.append(Ellipse('nring', 'steel', 1.02, A(t), 1.45 * k, 0.42 * k, ang=ang + math.pi / 2))
    # a madeira escura com veios, dois nós e uma rachadura
    P.append(Capsule('nshaft', 'ebony', 1.0, A(4.6), A(38.6), 1.12 * k, 1.0 * k, shade=1.1))

    def grain(x, y, cur):
        t, s_ = F.local(x, y)
        w = math.sin(t * 0.9 + s_ * 3.0) * 0.12
        for c0 in (-0.55, -0.1, 0.4, 0.75):
            if abs(s_ - c0 - w) < 0.07:
                return ('ebony', 3)
        if 17.0 < t < 21.0 and abs(s_ + 0.2 - (t - 17) * 0.08) < 0.06:
            return ('void', 0)
        return None
    D.append(Decal('nshaft', grain))
    for t, s_ in ((12.5, 0.55), (24.0, -0.5)):
        P.append(Ellipse('nknot', 'ebony', 1.01, A(t, s_), 1.35 * k, 1.0 * k, ang=ang, shade=1.15))
    # as voltas de cordão de osso, cruzadas
    P.append(Capsule('nwrap', 'bone', 1.03, A(27.2), A(31.0), 1.28 * k, 1.28 * k, shade=1.0))

    def cross(x, y, cur):
        t, s_ = F.local(x, y)
        u = (t * 1.6 + s_ * 1.6) % 1.4
        v = (t * 1.6 - s_ * 1.6) % 1.4
        if u < 0.18 or v < 0.18:
            return ('bone', 1)
        return None
    D.append(Decal('nwrap', cross))
    # dois talismãs de papel pendurados do cordão, caindo para baixo
    for dx, L_, sw in ((0.6, 9.5, 0.0), (-0.8, 7.2, 0.25)):
        t0 = A(29.0 + dx, 1.5)
        dn = (math.sin(sw), math.cos(sw))
        side = (dn[1], -dn[0])
        w = 1.25 * k
        pts = [_add(t0, side, -w), _add(t0, side, w)]
        steps = 6
        for i in range(1, steps + 1):
            q = _add(t0, dn, L_ * k * i / steps)
            wob = math.sin(i * 1.3) * 0.15 * k
            pts.insert(len(pts) // 2, _add(q, side, -w + wob))
            pts.insert(len(pts) // 2 + 1, _add(q, side, w + wob))
        # a ponta rasgada
        tip = _add(t0, dn, (L_ + 0.8) * k)
        left = [_add(t0, side, -w)] + [_add(_add(t0, dn, L_ * k * i / steps), side, -w + math.sin(i * 1.3) * 0.15 * k) for i in range(1, steps + 1)]
        right = [_add(t0, side, w)] + [_add(_add(t0, dn, L_ * k * i / steps), side, w + math.sin(i * 1.3) * 0.15 * k) for i in range(1, steps + 1)]
        bottom = [_add(tip, side, 0.6 * k), _add(tip, side, -0.1 * k), _add(_add(tip, dn, -0.6 * k), side, -0.7 * k)]
        poly = left + bottom[::-1] + right[::-1]
        name = f'ntal{int(L_)}'
        P.append(Poly(name, 'paper', 1.05 + dx * 0.01, poly, nf=lambda x, y: (0.0, -0.25, 0.96)))

        def glyphs(x, y, cur, t0=t0, dn=dn, side=side, L_=L_):
            lx = ((x - t0[0]) * side[0] + (y - t0[1]) * side[1]) / k
            ly = ((x - t0[0]) * dn[0] + (y - t0[1]) * dn[1]) / k
            if abs(lx) < 0.12 and 1.2 < ly < L_ - 1.2:
                return ('void', 1)
            for yy, a in ((2.4, 0.4), (4.1, -0.5), (5.9, 0.3), (7.4, -0.2)):
                if yy < L_ - 1 and abs(ly - yy - lx * a) < 0.11 and abs(lx) < 0.75:
                    return ('void', 1)
            if abs(ly - 0.7) < 0.12:
                return ('paper', 1)
            return None
        D.append(Decal(name, glyphs))
    # o gancho de vértebras com os processos dos lados, subindo e curvando para a frente
    O = A(42.0, 4.4)
    Rr = 4.4
    n = 10
    prev = None
    for i in range(n):
        phi = math.radians(-8 + i * 212 / (n - 1))
        q = _add(_add(O, F.fw, -math.cos(phi) * Rr * k), F.sd, math.sin(phi) * Rr * k)
        r = (1.55 - 0.07 * i) * k
        tang = (F.fw[0] * math.sin(phi) + F.sd[0] * math.cos(phi), F.fw[1] * math.sin(phi) + F.sd[1] * math.cos(phi))
        a_t = math.atan2(tang[1], tang[0])
        nm = f'nvert{i}'
        P.append(Ellipse(nm, 'bone', 1.1 + i * 0.002, q, r * 0.95, r * 0.8, ang=a_t, shade=1.05))
        # o espinho de cada vértebra, para fora da curva
        out = (q[0] - O[0], q[1] - O[1])
        lo = math.hypot(*out) or 1
        out = (out[0] / lo, out[1] / lo)
        P.append(Poly(f'nspine{i}', 'bone', 1.09 + i * 0.002, [_add(q, (tang[0] * 0.5 * r, tang[1] * 0.5 * r)), _add(q, out, r * 1.65), _add(q, (-tang[0] * 0.5 * r, -tang[1] * 0.5 * r))],
                      nf=lambda x, y: norm((-0.3, -0.4, 0.85)), shade=0.95))

        def vdec(x, y, cur, q=q, r=r, a_t=a_t):
            lx = ((x - q[0]) * math.cos(a_t) + (y - q[1]) * math.sin(a_t)) / r
            if abs(abs(lx) - 0.78) < 0.09:
                return ('bone', 1)
            return None
        D.append(Decal(nm, vdec))
        prev = q
    end = prev
    # três argolas de corrente e a lanterna
    for i in range(3):
        c = _add(end, DOWN, (1.6 + i * 1.5) * k)
        P.append(Ellipse(f'nlink{i}', 'steel', 1.12, c, (0.45 if i % 2 else 0.62) * k, 0.85 * k, flat=None))
    Lc = _add(end, DOWN, 9.6 * k)
    # tampa em cúpula com argola, corpo de vidro com quatro barras e o fundo com a ponta
    P.append(Ellipse('ndome', 'steel', 1.16, _add(Lc, (0, -3.4 * k)), 2.5 * k, 1.3 * k, shade=1.05))
    P.append(Ellipse('ntopring', 'steel', 1.15, _add(Lc, (0, -4.9 * k)), 0.6 * k, 0.6 * k))
    P.append(Capsule('nbase', 'steel', 1.16, _add(Lc, (-2.3 * k, 3.4 * k)), _add(Lc, (2.3 * k, 3.4 * k)), 0.6 * k, 0.6 * k))
    P.append(Poly('nspike', 'steel', 1.16, [_add(Lc, (-0.8 * k, 3.8 * k)), _add(Lc, (0.8 * k, 3.8 * k)), _add(Lc, (0, 5.6 * k))], nf=lambda x, y: (0.0, -0.3, 0.95)))
    P.append(Ellipse('nglass', 'soul', 1.13, Lc, 2.15 * k, 3.1 * k, shade=1.25, bulge=0.6))

    def lamp(x, y, cur):
        lx, ly = (x - Lc[0]) / k, (y - Lc[1]) / k
        for bx in (-1.35, 0.0, 1.35):
            if abs(lx - bx) < 0.16:
                return ('steel', 1 if bx else 2)
        # a chama: uma gota que sobe, com o miolo claro e dois olhos de lembrança
        fy = ly + 0.3
        if (lx / (0.9 - 0.18 * fy)) ** 2 + (fy / 1.9) ** 2 < 1 and fy > -1.9:
            if abs(fy - 0.2) < 0.18 and abs(abs(lx) - 0.32) < 0.14:
                return ('soul', 1)
            return ('soul', 4)
        return None
    D.append(Decal('nglass', lamp))
    return P, D, F, {'nglass': 1.0, 'nlink0': 0.0}, Lc


def plate_veu():
    from puppet import Ellipse, Capsule, Poly, Decal, norm
    P, D = [], []
    F = _F(46.0)
    A, k = F.A, F.k
    # a gota de tinta no pé, quase caindo
    P.append(Ellipse('vdrop', 'abyss', 1.0, _add(A(-0.4), DOWN, 1.4 * k), 0.75 * k, 1.1 * k, shade=1.2))
    P.append(Capsule('vneck', 'abyss', 1.0, A(-0.4), _add(A(-0.4), DOWN, 0.8 * k), 0.3 * k, 0.4 * k))
    # o cabo: duas fitas de tinta torcidas uma na outra
    for strand in (0, 1):
        pts = []
        for i in range(0, 73):
            t = i * 0.5
            ph = t * 0.55 + strand * math.pi
            pts.append((t, math.sin(ph) * 0.55))
        for i in range(len(pts) - 1):
            t, s_ = pts[i]
            ph = t * 0.55 + strand * math.pi
            z = 1.0 + (0.02 if math.cos(ph) > 0 else -0.02)
            P.append(Capsule(f'vstr{strand}', 'abyss', z, A(*pts[i]), A(*pts[i + 1]), 0.78 * k, 0.78 * k, shade=0.82 if math.cos(ph) > 0 else 0.6))

    def sheen(x, y, cur):
        t, s_ = F.local(x, y)
        if (t * 0.55 + s_ * 0.9) % 1.7 < 0.16:
            return ('abyssglow', 2)
        return None
    D.append(Decal('vstr0', sheen))
    D.append(Decal('vstr1', sheen))
    # dois aros de luz roxa na base da forquilha
    for t in (35.0, 36.4):
        P.append(Ellipse('vband', 'abyssglow', 1.06, A(t), 1.75 * k, 0.5 * k, ang=F.ang + math.pi / 2, shade=1.1))
    # a forquilha: dois chifres que abrem e voltam, com a membrana esticada e o olho fechado no meio
    prong = [(36.2, 0.9), (38.5, 2.9), (41.0, 4.1), (43.6, 4.2), (45.6, 3.2), (46.8, 1.7), (47.2, 0.9)]
    for side in (-1, 1):
        ts = [(t, s_ * side) for t, s_ in prong]
        _chain(P, F, f'vprong{side}', 'abyss', 1.1, ts, 1.0, 0.32, shade=1.25)
    mem = [A(t, s_ * 0.86) for t, s_ in prong] + [A(t, -s_ * 0.86) for t, s_ in prong[::-1]]
    P.append(Poly('vmem', 'membrane', 1.05, mem, nf=lambda x, y: norm((F.local(x, y)[1] * 0.08, -0.3, 0.95)), shade=1.12))

    def veins(x, y, cur):
        t, s_ = F.local(x, y)
        e = ((t - 41.6) / 3.1) ** 2 + (s_ / 0.95) ** 2
        if e < 1:
            if abs(s_) < 0.12 + 0.1 * (1 - e):
                return ('abyssglow', 4)
            if e > 0.78:
                return ('abyss', 1)
            return ('abyssmag', 2)
        # cílios de tinta na borda do olho
        if 1 < e < 1.35 and abs(t - 41.6) < 2.6 and int((t + s_ * 0.5) * 3) % 2 == 0:
            return ('abyss', 1)
        for a in (-1.0, -0.55, 0.55, 1.0):
            if abs(s_ - (t - 36.6) * a * 0.42) < 0.09 and 37.0 < t < 46.4 and e > 1.4:
                return ('membrane', 4)
        return None
    staffs.R.setdefault('abyssmag', [0x2c0a26, 0x5a1650, 0x8a2178, 0xb52a9b, 0xe486d6])
    D.append(Decal('vmem', veins))
    # fios de tinta escorrendo das pontas dos chifres
    for side in (-1, 1):
        tip = A(47.2, 0.9 * side)
        _drip = [tip, _add(tip, DOWN, 1.4 * k), _add(_add(tip, DOWN, 2.6 * k), (0.25 * k * side, 0)), _add(tip, DOWN, 3.4 * k)]
        for i in range(len(_drip) - 1):
            P.append(Capsule('vdripline', 'abyss', 1.12, _drip[i], _drip[i + 1], 0.32 * k, 0.26 * k))
        P.append(Ellipse('vdripend', 'abyss', 1.12, _add(_drip[-1], DOWN, 0.4 * k), 0.42 * k, 0.6 * k))
    return P, D, F, {'vmem': 1.0, 'vband': 0.8}, A(41.6)


def plate_espaco():
    from puppet import Ellipse, Capsule, Poly, Decal, norm
    P, D = [], []
    F = _F(46.0)
    A, k = F.A, F.k
    ang = F.ang
    # o pé: esfera com um aro
    P.append(Ellipse('sbutt', 'silver', 1.0, A(0.6), 1.5 * k, 1.5 * k, shade=1.05))
    P.append(Ellipse('sbuttring', 'silver', 1.02, A(2.0), 1.35 * k, 0.42 * k, ang=ang + math.pi / 2))
    P.append(Capsule('sshaft', 'silver', 1.0, A(2.2), A(34.4), 1.0 * k, 1.0 * k, shade=1.05))

    def grooves(x, y, cur):
        t, s_ = F.local(x, y)
        if 3 < t < 34 and (t % 3.6) < 0.22:
            return ('silver', 0)
        if 8.6 < t < 24.6 and abs(s_) < 0.34:
            # o veio de céu noturno com estrelas
            if math.hypot((t * 7.3) % 1.9 - 0.95, s_ * 3) < 0.2:
                return ('silver', 4)
            return ('lens', 2)
        return None
    D.append(Decal('sshaft', grooves))
    # a pegada de couro azul com cravos
    P.append(Capsule('sgrip', 'lens', 1.02, A(26.0), A(31.2), 1.12 * k, 1.12 * k, shade=0.9))

    def studs(x, y, cur):
        t, s_ = F.local(x, y)
        if (t % 1.3) < 0.36 and abs(abs(s_) - 0.55) < 0.22:
            return ('silver', 4)
        return None
    D.append(Decal('sgrip', studs))
    # o berço de três garras
    for side in (-1, 1):
        ts = [(34.2, 1.0 * side), (36.6, 2.8 * side), (39.6, 3.2 * side), (42.0, 2.0 * side)]
        _chain(P, F, f'sclaw{side}', 'silver', 1.08, ts, 0.75, 0.32, shade=1.1)
    P.append(Capsule('sclawmid', 'silver', 1.03, A(34.0), A(36.2), 0.8 * k, 0.6 * k))
    C = A(39.4)
    P.append(Ellipse('score', 'lens', 1.05, C, 2.9 * k, 2.9 * k, shade=1.15, bulge=0.9))
    import random
    rnd = random.Random(7)
    stars = [(rnd.uniform(-2.2, 2.2), rnd.uniform(-2.2, 2.2), rnd.uniform(0.12, 0.26)) for _ in range(14)]

    def sky(x, y, cur):
        lx, ly = (x - C[0]) / k, (y - C[1]) / k
        for sx, sy, r in stars:
            if math.hypot(lx - sx, ly - sy) < r:
                return ('silver', 4)
        # a nebulosa: uma faixa clara torta
        if abs(ly - 0.45 * lx - 0.3 * math.sin(lx * 2.2)) < 0.45 and math.hypot(lx, ly) < 2.6:
            return ('lens', 4) if abs(ly - 0.45 * lx - 0.3 * math.sin(lx * 2.2)) < 0.18 else ('lens', 3)
        return None
    D.append(Decal('score', sky))
    # três anéis de giroscópio com marcas gravadas; a metade da frente passa por cima do núcleo
    for j, (tilt, rx, ry, w) in enumerate(((0.5, 6.6, 1.9, 0.46), (-0.7, 6.0, 1.6, 0.42), (1.45, 5.4, 1.2, 0.36))):
        a0 = ang + math.pi / 2 + tilt
        ca, sa = math.cos(a0), math.sin(a0)
        n = 30
        prev = None
        for i in range(n + 1):
            th = 2 * math.pi * i / n
            ex, ey = math.cos(th) * rx * k, math.sin(th) * ry * k
            q = (C[0] + ex * ca - ey * sa, C[1] + ex * sa + ey * ca)
            if prev is not None:
                front = math.sin(th - math.pi / n) > 0
                nm = f'sring{j}{"f" if front else "b"}'
                P.append(Capsule(nm, 'silver', 1.1 if front else 1.0, prev, q, w * k, w * k, shade=1.1 if front else 0.7))
            prev = q
    # pedras soltas em volta, com rachaduras acesas de azul
    rocks = [(46.8, 6.2, 1.5, 0.3), (33.0, -7.0, 1.2, 1.1), (49.0, -4.6, 1.0, 2.0), (38.6, 9.0, 1.1, 2.6), (30.8, 6.8, 0.8, 0.9)]
    for i, (t, s_, r, rot) in enumerate(rocks):
        c = A(t, s_)
        pts = []
        for m in range(7):
            a = rot + m * 2 * math.pi / 7
            rr = r * (1.0 if m % 2 else 0.74) * (0.9 + 0.2 * math.sin(m * 2.7 + i)) * k
            pts.append((c[0] + math.cos(a) * rr, c[1] + math.sin(a) * rr))
        nm = f'srock{i}'
        P.append(Poly(nm, 'rock', 1.12, pts, nf=lambda x, y, c=c: norm(((x - c[0]) * 0.3 / k, (y - c[1]) * 0.3 / k - 0.3, 0.85))))

        def crack(x, y, cur, c=c, r=r, rot=rot):
            lx, ly = (x - c[0]) / k, (y - c[1]) / k
            u = lx * math.cos(rot) + ly * math.sin(rot)
            v = -lx * math.sin(rot) + ly * math.cos(rot)
            if abs(v - 0.3 * math.sin(u * 3)) < 0.1 and abs(u) < r * 0.7:
                return ('lens', 4)
            return None
        D.append(Decal(nm, crack))
    return P, D, F, {'score': 1.0}, C


PLATES = {'necro': plate_necro, 'veu': plate_veu, 'espaco': plate_espaco}


def _add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def emissive(prims, decals, names):
    """Só as partes que brilham, em branco (a máscara da luz)."""
    keep = [p for p in prims if any(p.name.startswith(n) for n in names)]
    return keep


def glow_mask(rgba, kind):
    """O que brilha: os pixels perto das cores das rampas de luz de cada cajado."""
    rgb = rgba[..., :3]
    m = np.zeros(rgba.shape[:2], np.float32)
    for mat in GLOW[kind]:
        for col in staffs.R[mat][2:]:
            c = np.array([(col >> 16) & 255, (col >> 8) & 255, col & 255], np.float32) / 255
            d = np.sqrt(((rgb - c) ** 2).sum(-1))
            m = np.maximum(m, np.clip(1 - d / 0.16, 0, 1))
    return m * rgba[..., 3]


def plate(kind):
    bg = backdrop(kind)
    P, D, F, glow_names, focus = PLATES[kind]()
    a = ink.render_frame(P, D, DESIGN, DESIGN, style=PLATE_STYLE)
    st = np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').resize((SIZE, SIZE), Image.LANCZOS), np.float32) / 255
    col = np.array([(staffs.COLOR[kind] >> 16) & 255, (staffs.COLOR[kind] >> 8) & 255, staffs.COLOR[kind] & 255], np.float32) / 255
    # a luz: a máscara das partes que brilham, borrada em duas larguras, mais um halo em volta do foco
    gm = glow_mask(st, kind)
    n = SIZE
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    fx, fy = focus[0] * SIZE / DESIGN, focus[1] * SIZE / DESIGN
    halo = np.exp(-((xx - fx) ** 2 + (yy - fy) ** 2) / (2 * 46.0 ** 2))
    g1 = np.asarray(Image.fromarray((gm * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(16)), np.float32) / 255
    g2 = np.asarray(Image.fromarray((gm * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(5)), np.float32) / 255
    g = np.clip(g1 * 2.2 + g2 * 0.9 + halo * 0.55, 0, 1)
    out = bg * (1 - 0.7 * g[..., None]) + col * 0.7 * g[..., None]
    out = particles(out, kind, fx, fy)
    sa = st[..., 3:4]
    out = out * (1 - sa) + st[..., :3] * sa
    # um pouco de luz por cima do que brilha (o miolo fica mais claro)
    top = np.clip(g2 * 0.35, 0, 1)[..., None] * (1 - sa * 0.6)
    out = out + (np.minimum(1, col * 1.4) - out) * top * 0.5
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')


def particles(img, kind, fx, fy):
    """Os enfeites soltos de cada magia, pintados no papel: almas subindo (Necromante), fios de tinta
    (Véu) e o espaço dobrado em ondas (Espaço)."""
    import random
    rnd = random.Random(sum(map(ord, kind)))
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), 'RGB').convert('RGBA')
    from PIL import ImageDraw
    lay = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    c = staffs.COLOR[kind]
    rgb = ((c >> 16) & 255, (c >> 8) & 255, c & 255)
    if kind == 'necro':
        # fiapos de alma subindo em espiral da lanterna, com pontinhos claros
        for j in range(5):
            x0 = fx + rnd.uniform(-30, 30)
            y0 = fy - rnd.uniform(10, 30)
            pts = []
            for i in range(24):
                t = i / 23
                pts.append((x0 + math.sin(t * 6 + j) * 10 * (1 - t) + t * rnd.uniform(-20, 20), y0 - t * rnd.uniform(70, 130)))
            for i in range(len(pts) - 1):
                a = int(150 * (1 - i / len(pts)))
                d.line([pts[i], pts[i + 1]], fill=rgb + (a,), width=max(1, int(4 * (1 - i / len(pts)))))
        for _ in range(26):
            x, y = fx + rnd.gauss(0, 50), fy - abs(rnd.gauss(30, 60))
            r = rnd.uniform(1.2, 3.2)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(226, 255, 244, rnd.randint(90, 200)))
    elif kind == 'veu':
        # fios de tinta soltos no ar em volta da membrana
        for j in range(4):
            a0 = rnd.uniform(0, 2 * math.pi)
            r0 = rnd.uniform(56, 100)
            pts = []
            for i in range(30):
                t = i / 29
                a = a0 + t * rnd.uniform(1.0, 2.2)
                r = r0 + 5 * math.sin(t * 2.2 + j)
                pts.append((fx + math.cos(a) * r, fy + math.sin(a) * r * 0.8))
            for i in range(len(pts) - 1):
                w = max(1, int(3.2 * math.sin(math.pi * i / len(pts))))
                d.line([pts[i], pts[i + 1]], fill=(20, 10, 30, 190), width=w)
        for _ in range(22):
            x, y = fx + rnd.gauss(0, 70), fy + rnd.gauss(0, 70)
            r = rnd.uniform(1.0, 2.8)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(216, 183, 255, rnd.randint(110, 220)))
    elif kind == 'espaco':
        # o espaço dobrado em volta da cabeça: arcos finos concêntricos, quebrados
        for j in range(6):
            r = 34 + j * 15
            a0 = rnd.uniform(0, 360)
            for seg in range(3):
                s0 = a0 + seg * 120 + rnd.uniform(-10, 10)
                d.arc([fx - r, fy - r * 0.86, fx + r, fy + r * 0.86], s0, s0 + rnd.uniform(40, 80), fill=rgb + (int(150 - j * 20),), width=2)
        for _ in range(40):
            x, y = fx + rnd.gauss(0, 80), fy + rnd.gauss(0, 80)
            r = rnd.uniform(0.6, 1.8)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(232, 240, 255, rnd.randint(120, 230)))
    lay = lay.filter(ImageFilter.GaussianBlur(0.6))
    im.alpha_composite(lay)
    return np.asarray(im.convert('RGB'), np.float32) / 255


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = args[0] if args else '.'
    enio = next((a[7:] for a in sys.argv if a.startswith('--enio=')), None)
    prev = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
    for kind in ('necro', 'veu', 'espaco'):
        im = plate(kind)
        im.save(f'{out}/staff-{kind}.webp', quality=88, method=6)
        if prev:
            im.save(f'{prev}/staff-{kind}.png')
        print(kind, im.size, flush=True)
    if enio:
        im = Image.open(enio).convert('RGB')
        s = min(im.size)
        im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((SIZE, SIZE), Image.LANCZOS)
        im.save(f'{out}/staff-eclipse.webp', quality=90, method=6)
        if prev:
            im.save(f'{prev}/staff-eclipse.png')
        print('eclipse (arte do Enio)', im.size)


if __name__ == '__main__':
    main()

"""Final II, plano 4: o rosto dela, renderizado em 3D (art9/rosto.c) e pintado por cima (rascunho para finais.py).

python3 rosto3d.py [ref] [ss] -> art7/out/rosto.png (ou só a referência em dbg/rosto-ref.png)"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('FIM_OUT', os.path.join(HERE, 'out'))
CACHE = os.path.join(HERE, 'cache')
os.makedirs(CACHE, exist_ok=True)
import math
sys.path.insert(0, os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
from finais import *  # noqa
import rm

# ---------------------------------------------------------------- o enquadramento
YAW, PITCH, ROLL = -0.50, 0.16, 0.08
SMILE = 0.45
NG = 8
GR = dict(bg=0, skin=1, eye=2, hair=3, hood=4, lip=5)
O_ALB = 10 + NG


def hrot(v, yaw=YAW, pitch=PITCH, roll=ROLL):
    """O mesmo giro da cabeça do rosto.c (guinada, depois o aceno, depois a inclinação)."""
    x, y, z = v
    x, z = x * math.cos(yaw) + z * math.sin(yaw), -x * math.sin(yaw) + z * math.cos(yaw)
    y, z = y * math.cos(pitch) - z * math.sin(pitch), y * math.sin(pitch) + z * math.cos(pitch)
    x, y = x * math.cos(roll) - y * math.sin(roll), x * math.sin(roll) + y * math.cos(roll)
    return np.array([x, y, z])


HX, HY, HZ = (hrot(v) for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1)))


def world(p):
    p = np.asarray(p, np.float64)
    return p[..., 0:1] * HX + p[..., 1:2] * HY + p[..., 2:3] * HZ


F = 2750.0 * W / 1280
C = np.array([0.03, 0.035, 1.16])
NASION = (0.0, 0.004, 0.085)


def aim():
    """A câmera mira de modo que o ponto entre os olhos caia em (640, 302) do quadro de 1280 x 720."""
    n = world(NASION)
    T = n.copy()
    for _ in range(8):
        cam = list(C) + list(T) + [F]
        x, y, z = rm.project(cam, W, H, [n])
        T[1] += (302.0 * W / 1280 - y[0]) * (z[0] / F) * 0.9
        T[0] -= (640.0 * W / 1280 - x[0]) * (z[0] / F) * 0.9
    return list(C) + list(T) + [F]


CAM = aim()
KEY = [-1.0, 0.95, 0.15]
RIM = [0.70, 0.30, -0.55]
PRM = [1.8, 1.35, 0.18, 0.9] + list(C) + [YAW, PITCH, ROLL] + [0.0, SMILE, 1.0, 0.0] + KEY + RIM


def proj(pts_head):
    """Pontos no espaço da cabeça -> px do quadro e a distância."""
    return rm.project(CAM, W, H, world(np.asarray(pts_head, np.float64)))


def ro_render(ss=2, cache=True):
    key = '%d-%d-%s' % (W, ss, abs(hash(tuple(round(v, 5) for v in list(CAM) + PRM))) % 10 ** 8)
    path = os.path.join(CACHE, f'rosto-{key}.npy')
    if cache and os.path.exists(path) and os.path.getmtime(path) > os.path.getmtime(os.path.join(HERE, 'rosto.c')):
        return np.load(path)
    lib = rm.build('rosto')
    out = rm.render(lib, W, H, ss, CAM, PRM)
    np.save(path, out)
    return out


def sss(irr, cov, depth, widths_m=(0.0016, 0.0007, 0.0004), thr=0.004, keep=(0.25, 0.35, 0.5)):
    """A luz que entra na pele e sai um pouco adiante: espalha a luz difusa (o vermelho mais longe), sem passar
    para o que está em outra profundidade (a pálpebra sobre o olho, o nariz sobre a bochecha)."""
    z0 = float(np.median(depth[cov > 0.5])) if (cov > 0.5).any() else 1.0
    dz = np.where(cov > 0.5, depth / np.maximum(cov, 1e-3), z0)
    out = np.zeros_like(irr)
    for c in range(3):
        sig = widths_m[c] * F / z0
        r = int(math.ceil(sig * 3))
        num, den = irr[..., c].astype(np.float64), cov.astype(np.float64)
        for axis in (1, 0):
            n2, d2 = np.zeros_like(num), np.zeros_like(den)
            for k in range(-r, r + 1):
                g = math.exp(-0.5 * (k / sig) ** 2)
                zs = np.roll(dz, k, axis)
                w = g * np.exp(-((zs - dz) / thr) ** 2)
                n2 += w * np.roll(num, k, axis)
                d2 += w * np.roll(den, k, axis)
            num, den = n2, d2
        bl = num / np.maximum(den, 1e-6)
        sharp = irr[..., c] / np.maximum(cov, 1e-6)
        out[..., c] = (keep[c] * sharp + (1 - keep[c]) * bl) * (cov > 1e-4)
    return out.astype(np.float32)


def f_rosto_ref(rng, ss=2):
    out = ro_render(ss)
    cov = {k: out[..., 10 + v] for k, v in GR.items()}
    skin = np.clip(cov['skin'] + cov['lip'], 0, 1)
    depth = out[..., 6]
    irr = sss(out[..., 3:6], skin, depth)
    rgb = out[..., 0:3] + irr * out[..., O_ALB:O_ALB + 3]
    ref = rm.tonemap(rgb, 1.0)
    info = dict(cov=cov, skin=skin, depth=depth, out=out)
    return ref, info


# ---------------------------------------------------------------- os olhos (os mesmos números do rosto.c)
EX, EY, EZ, ER = 0.0302, 0.0, 0.0668, 0.0131
A0, A1, B0, B1 = -1.38, 1.30, -0.11, 0.07


def cam_head():
    c = np.asarray(CAM[:3], np.float64)
    return np.array([c @ HX, c @ HY, c @ HZ])


def gazes():
    ch = cam_head()
    g = []
    for side in (-1, 1):
        v = ch - np.array([side * EX, EY, EZ])
        g.append(v / np.linalg.norm(v))
    ge = math.asin(float(np.clip(0.5 * (g[0][1] + g[1][1]), -0.5, 0.5)))
    return g, ge


GZ, GE = gazes()


def lid_point(side, upper, t, r, db=0.0):
    """Um ponto da beira da pálpebra (de cima ou de baixo), t de 0 (canto de dentro) a 1 (canto de fora), no raio r
    em volta do centro do globo; db desloca em ângulo (para cima +)."""
    a = A0 + t * (A1 - A0)
    base = B0 + t * (B1 - B0)
    sh = math.sin(math.pi * t)
    if upper:
        b = base + 0.41 * math.sin(math.pi * t ** 0.85) ** 0.75 + 0.75 * GE * sh
    else:
        b = base - (0.45 * (1 - 0.34 * SMILE) * math.sin(math.pi * t ** 1.15) ** 0.85 - 0.35 * GE * sh)
    b += db
    q = np.array([side * r * math.cos(b) * math.sin(a), r * math.sin(b), r * math.cos(b) * math.cos(a)])
    return np.array([side * EX, EY, EZ]) + q, q / r


def visible(pts_head, depth, tol=0.003):
    """Se cada ponto (no espaço da cabeça) aparece na câmera: a distância até ele contra a do render."""
    x, y, _ = proj(pts_head)
    wp = world(np.asarray(pts_head, np.float64))
    dist = np.linalg.norm(wp - np.asarray(CAM[:3]), axis=-1)
    xi = np.clip(np.round(x).astype(int), 0, W - 1)
    yi = np.clip(np.round(y).astype(int), 0, H - 1)
    return (depth[yi, xi] > dist - tol), x, y


def lashes(rng, depth):
    """Os cílios: os de cima longos, curvando para cima e, no canto de fora, para fora; os de baixo curtos e ralos.
    Saem da beira da pálpebra e são desenhados por cima, menos onde o nariz tapa."""
    m = Mask(W, H)
    Y = np.array([0.0, 1.0, 0.0])
    Z = np.array([0.0, 0.0, 1.0])
    for side in (-1, 1):
        lat = np.array([side * 1.0, 0.0, 0.0])
        for upper, n, t0, t1 in ((True, 70, 0.05, 0.985), (False, 26, 0.25, 0.95)):
            for i in range(n):
                t = t0 + (t1 - t0) * (i + rng.random() * 0.8) / n
                if upper:
                    t = t ** 0.85
                root, nn = lid_point(side, upper, t, ER + 0.0021, -0.035 if upper else 0.03)
                if upper:
                    # para a frente, um pouco para cima, e no canto de fora abrindo para o lado; a ponta curva para cima
                    L = (0.0040 + 0.0036 * math.sin(math.pi * t ** 0.75)) * (0.8 + 0.4 * rng.random())
                    d0 = Z * 1.0 + nn * 0.35 + Y * 0.10 + lat * (0.05 + 0.55 * t ** 2)
                    curl = Y * 0.65
                else:
                    L = (0.0014 + 0.0016 * math.sin(math.pi * t)) * (0.7 + 0.6 * rng.random())
                    d0 = Z * 1.0 + nn * 0.4 - Y * 0.35 + lat * (0.10 + 0.25 * t)
                    curl = -Y * 0.15
                d0 = d0 / np.linalg.norm(d0)
                ss_ = np.linspace(0, 1, 7)
                pts = np.array([root + L * (s_ * d0 + s_ * s_ * curl) for s_ in ss_])
                vis, x, y = visible(pts[:1], depth, 0.004)
                if not vis[0]:
                    continue
                x, y, _ = proj(pts)
                w0 = (0.62 if upper else 0.36) * (0.8 + 0.4 * rng.random())
                for k in range(len(ss_) - 1):
                    w = w0 * (1 - 0.75 * ss_[k])
                    m.line([(x[k], y[k]), (x[k + 1], y[k + 1])], w, v=int(255 * (0.9 if upper else 0.45)))
    return m.array()


def catchlights(depth, cov_eye):
    """O reflexo da luz quente em cada córnea (e um menor, da janela de trás, roxo)."""
    out = []
    kh = np.array([np.dot(KEY, HX), np.dot(KEY, HY), np.dot(KEY, HZ)])
    rh = np.array([np.dot(RIM, HX), np.dot(RIM, HY), np.dot(RIM, HZ)])
    ch = cam_head()
    for side, g in zip((-1, 1), GZ):
        c = np.array([side * EX, EY, EZ]) + g * 0.0058
        for L, kind in ((kh, 'key'), (rh, 'rim')):
            l = L - c
            l /= np.linalg.norm(l)
            v = ch - c
            v /= np.linalg.norm(v)
            n = l + v
            n /= np.linalg.norm(n)
            pt = c + n * 0.0078
            vis, x, y = visible([pt], depth, 0.002)
            xi, yi = int(round(x[0])), int(round(y[0]))
            if vis[0] and 0 <= xi < W and 0 <= yi < H and cov_eye[yi, xi] > 0.5:
                out.append((x[0], y[0], kind))
    return out


def eyes_detail(rng, ref, info):
    """Os cílios e os reflexos de luz nos olhos, por cima da referência."""
    yy, xx = grid()
    depth = info['depth']
    lm = lashes(rng, depth)
    ref = ref * (1 - lm[..., None] * 0.92) + col(0x120a08) * (lm[..., None] * 0.92)
    for x_, y_, kind in catchlights(depth, info['cov']['eye']):
        d2 = (xx - x_) ** 2 + (yy - y_) ** 2
        if kind == 'key':
            ref = add_light(ref, col(0xfff2dc), np.exp(-d2 / (2 * 1.3 ** 2)) * 0.95 + np.exp(-d2 / (2 * 3.0 ** 2)) * 0.12)
        else:
            ref = add_light(ref, col(0xb8a4ff), np.exp(-d2 / (2 * 0.9 ** 2)) * 0.35)
    info['lash'] = lm
    return ref


def bokeh(rng, n, x0, x1, y0, y1, r0, r1, color, k):
    """Discos fora de foco: as memórias paradas no ar, atrás dela."""
    yy, xx = grid()
    acc = np.zeros((H, W), np.float32)
    for _ in range(n):
        cx, cy = rng.uniform(x0, x1), rng.uniform(y0, y1)
        r = r0 + (r1 - r0) * rng.random() ** 2
        a = 0.25 + 0.75 * rng.random() ** 1.5
        ix0, ix1 = int(max(0, cx - r - 3)), int(min(W, cx + r + 4))
        iy0, iy1 = int(max(0, cy - r - 3)), int(min(H, cy + r + 4))
        if ix0 >= ix1 or iy0 >= iy1:
            continue
        d = np.hypot(xx[iy0:iy1, ix0:ix1] - cx, yy[iy0:iy1, ix0:ix1] - cy)
        disc = sstep(r + 1.2, r - 1.2, d) * (0.75 + 0.25 * sstep(r * 0.55, r, d))
        acc[iy0:iy1, ix0:ix1] = np.maximum(acc[iy0:iy1, ix0:ix1], disc * a)
    return acc


def flyaways(rng, ref, info, n=150):
    """Fios soltos saindo da beira do cabelo (para o rosto e para o capuz), finos e meio transparentes."""
    hair = info['cov']['hair']
    hb = blur(hair, 3.0)
    gy, gx = np.gradient(hb)
    edge = (hair > 0.5) & (ndi.maximum_filter(hair, 5) - ndi.minimum_filter(hair, 5) > 0.5)
    ys, xs = np.nonzero(edge)
    if len(xs) == 0:
        return ref
    flow = flow_of(ref, np.pi / 2, 1.0, sigma=4.0)
    pick = rng.choice(len(xs), size=min(n, len(xs)), replace=False)
    m = Mask(W, H)
    lit = Mask(W, H)
    for i in pick:
        x0, y0 = float(xs[i]), float(ys[i])
        a = float(flow[ys[i], xs[i]])
        dx, dy = math.cos(a), math.sin(a)
        ox, oy = -gx[ys[i], xs[i]], -gy[ys[i], xs[i]]
        # o fio segue o penteado e sai um pouco para fora da massa do cabelo
        if dx * ox + dy * oy < 0:
            dx, dy = -dx, -dy
        on = math.hypot(ox, oy) + 1e-6
        dx, dy = dx * 0.75 + ox / on * 0.35, dy * 0.75 + oy / on * 0.35
        dn = math.hypot(dx, dy)
        dx, dy = dx / dn, dy / dn
        L = 12 + 30 * rng.random() ** 1.5
        bend = rng.normal(0, 0.35)
        pts = []
        for k in range(9):
            t = k / 8
            ang = bend * t
            ca, sa = math.cos(ang), math.sin(ang)
            pts.append((x0 + L * t * (dx * ca - dy * sa), y0 + L * t * (dx * sa + dy * ca)))
        w = 0.45 + 0.35 * rng.random()
        target = lit if x0 < 640 else m
        for k in range(8):
            target.line([pts[k], pts[k + 1]], w * (1 - 0.6 * k / 8), v=int(255 * (0.55 + 0.3 * rng.random()) * (1 - 0.5 * k / 8)))
    a1, a2 = m.array(), lit.array()
    ref = ref * (1 - a2[..., None] * 0.8) + col(0x8a5a3a) * (a2[..., None] * 0.8)
    ref = ref * (1 - a1[..., None] * 0.7) + col(0x4a3448) * (a1[..., None] * 0.7)
    return ref


def skin_tones(ref, info):
    """Como num retrato pintado: o meio-tom da pele esfria um pouco, a sombra esquenta (a luz que volta do capuz)."""
    out = info['out']
    skin = np.clip(blur(info['skin'], 0.7), 0, 1)
    irr = out[..., 3:6] / np.maximum(info['skin'][..., None], 1e-3)
    L = irr @ np.array([0.3, 0.55, 0.15], np.float32)
    Lm = np.percentile(L[info['skin'] > 0.5], 98) if (info['skin'] > 0.5).any() else 1.0
    l = np.clip(L / Lm, 0, 1)
    half = np.exp(-((l - 0.38) / 0.16) ** 2) * skin
    shad = sstep(0.25, 0.05, l) * skin
    ref = ref * (1 - half[..., None] * 0.10) + (ref * np.array([0.92, 1.0, 1.10], np.float32)) * (half[..., None] * 0.10)
    ref = ref * (1 - shad[..., None] * 0.25) + (ref * np.array([1.25, 0.85, 0.80], np.float32)) * (shad[..., None] * 0.25)
    return np.clip(ref, 0, 1)


def head_xyz(info):
    """A posição de cada pixel no espaço da cabeça (pela distância do render)."""
    yy, xx = grid()
    Cc = np.asarray(CAM[:3], np.float64)
    T = np.asarray(CAM[3:6], np.float64)
    fw = T - Cc
    fw /= np.linalg.norm(fw)
    rt = np.cross(fw, [0, 1, 0])
    rt /= np.linalg.norm(rt)
    up = np.cross(rt, fw)
    u = (xx + 0.5 - W * 0.5) / CAM[6]
    v = (yy + 0.5 - H * 0.5) / CAM[6]
    rd = fw[None, None, :] + rt[None, None, :] * u[..., None] - up[None, None, :] * v[..., None]
    rd /= np.linalg.norm(rd, axis=-1, keepdims=True)
    P = Cc[None, None, :] + rd * info['depth'][..., None]
    return np.stack([P @ HX, P @ HY, P @ HZ], -1).astype(np.float32)


def forehead(rng, ref, info):
    """A testa: o capuz tira a luz de cima (a pele escurece subindo) e alguns fios soltos da risca atravessam."""
    hp = head_xyz(info)
    skin = np.clip(blur(info['skin'], 0.7), 0, 1)
    k = sstep(0.025, 0.085, hp[..., 1]) * skin
    ref = ref * (1 - k[..., None] * 0.30) + (ref * np.array([0.80, 0.82, 0.95], np.float32)) * (k[..., None] * 0.0)
    # os fios: da risca descendo para os lados, por cima da testa (curvas na superfície, projetadas)
    m = Mask(W, H)
    for i in range(9):
        side = -1 if i % 3 else 1
        x0 = rng.uniform(-0.004, 0.006)
        y0 = rng.uniform(0.072, 0.082)
        x1 = side * rng.uniform(0.030, 0.050)
        y1 = rng.uniform(0.030, 0.055)
        pts = []
        for t in np.linspace(0, 1, 14):
            x = x0 + (x1 - x0) * t
            y = y0 + (y1 - y0) * (t ** 0.8) - 0.006 * math.sin(math.pi * t) + 0.0008 * math.sin(t * 9 + i)
            pts.append((x, y))
        # z na pele: o ponto do render mais perto em (x, y) na cabeça
        P = []
        for x, y in pts:
            d2 = (hp[..., 0] - x) ** 2 + (hp[..., 1] - y) ** 2 + (info['skin'] < 0.5) * 1.0
            j = np.unravel_index(np.argmin(d2), d2.shape)
            if d2[j] > 4e-6:
                P.append(None)
                continue
            P.append((float(j[1]), float(j[0])))
        seg = [q for q in P if q is not None]
        if len(seg) < 4:
            continue
        w = 0.45 + 0.25 * rng.random()
        for a_, b_ in zip(seg[:-1], seg[1:]):
            m.line([a_, b_], w, v=int(255 * (0.35 + 0.25 * rng.random())))
    a = m.array()
    ref = ref * (1 - a[..., None] * 0.85) + col(0x3a2418) * (a[..., None] * 0.85)
    return ref


def ro_final(rng, ref, info):
    yy, xx = grid()
    cov = info['cov']
    bg = np.clip(blur(cov['bg'], 0.8), 0, 1)
    fig = 1 - bg
    # ---------------- o fundo: o escuro da lembrança, quente do lado da luz, roxo do outro
    t = np.clip(xx / W, 0, 1)
    back = col(0x1a0f0a) * (1 - t[..., None]) + col(0x120c22) * t[..., None]
    glow = np.exp(-(((xx - 330) / 520.0) ** 2 + ((yy - 300) / 380.0) ** 2))
    back = back + col(0x5a3018) * (glow[..., None] * 0.55)
    glow2 = np.exp(-(((xx - 1080) / 420.0) ** 2 + ((yy - 200) / 420.0) ** 2))
    back = back + col(0x2a2060) * (glow2[..., None] * 0.5)
    b1 = bokeh(rng, 46, 0, 560, 0, 720, 8, 46, None, 1)
    b2 = bokeh(rng, 22, 820, 1280, 0, 720, 6, 34, None, 1)
    b1 = blur(b1, 1.2)
    b2 = blur(b2, 1.2)
    back = add_light(back, col(0xffb45a), b1 * 0.30)
    back = add_light(back, col(0x9a7ae0), b2 * 0.22)
    ref = ref * fig[..., None] + back * bg[..., None]
    # ---------------- a cor: a pele um pouco menos laranja, o preto puxando para o roxo
    skin = np.clip(blur(info['skin'], 0.6), 0, 1)
    lum = ref @ LUMA
    sat_cut = skin * 0.06
    ref = ref * (1 - sat_cut[..., None]) + lum[..., None] * sat_cut[..., None]
    ref = ref + col(0x0c0816) * ((1 - sstep(0.0, 0.25, lum))[..., None] * 0.6)
    ref = skin_tones(ref, info)
    ref = forehead(rng, ref, info)
    ref = flyaways(rng, ref, info)
    # ---------------- a pintura: largo no fundo, médio no capuz e no cabelo, fino no rosto; os olhos limpos
    base = (value_noise(H, W, 80, rng, 2) - 0.5) * 0.5 + np.pi / 2
    flow = flow_of(ref, base, 0.9)
    out, _ = painted(ref, rng, flow, ps=passes(0.70, dry=0.22, err=(0.0, 0.02, 0.035, 0.05), long=1.0), keep=0.10)
    hood = np.clip(blur(cov['hood'] + cov['hair'], 1.5) * 1.3, 0, 1) * fig
    outh, _ = painted(ref, rng, flow, mask=hood, ps=passes(0.40, dry=0.16, err=(0.0, 0.015, 0.03, 0.04), long=1.1), base=1.0, keep=0.12)
    out = out * (1 - hood[..., None]) + outh * hood[..., None]
    face = np.clip(blur(info['skin'] + cov['eye'], 2.0) * 1.5, 0, 1)
    outf, _ = painted(ref, rng, flow, mask=face, ps=passes(0.30, dry=0.10, bristle=0.25, err=(0.0, 0.012, 0.018, 0.024), long=0.9), base=1.0, keep=0.10)
    out = out * (1 - face[..., None]) + outf * face[..., None]
    sharp = np.clip(blur(cov['eye'], 0.8) * 1.4 + blur(info.get('lash', np.zeros((H, W), np.float32)), 0.6), 0, 1)
    keep = np.clip(sharp * 0.85, 0, 0.9)
    out = out * (1 - keep[..., None]) + ref * keep[..., None]
    # ---------------- as bordas no escuro, e o meio-tom
    vg = ((xx - 640) / 780) ** 2 + ((yy - 330) / 520) ** 2
    out = out * (1 - 0.42 * np.clip(vg, 0, 1.2) ** 1.4)[..., None]
    out = np.clip(out, 0, 1) ** 0.95
    return finish(out)


def frame(rng, ss=2):
    ref, info = f_rosto_ref(rng, ss)
    ref = eyes_detail(rng, ref, info)
    return ro_final(rng, ref, info)


if __name__ == '__main__':
    import time
    ss = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    rng = np.random.default_rng(1000 + sum(map(ord, 'rosto')))
    t0 = time.time()
    ref, info = f_rosto_ref(rng, ss)
    ref = eyes_detail(rng, ref, info)
    finish(ref).save(os.path.join(CACHE, 'rosto-ref.png'))
    if 'ref' not in sys.argv:
        ro_final(rng, ref, info).save(os.path.join(OUT, 'rosto.png'))
    x, y, z = proj([NASION])
    print('ok', round(time.time() - t0, 1), 'nasion', round(float(x[0]), 1), round(float(y[0]), 1))

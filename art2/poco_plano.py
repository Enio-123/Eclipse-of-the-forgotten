"""O plano dos fundos dos poços (Minas e Fosso), tirado dos pintores do traço liso.

Os fundos do ECLIPSE repintam em 3x o mesmo desenho: as mesmas camadas de rocha, as mesmas torres,
escoras, cristais, saliências, máscaras e correntes, nos mesmos lugares. Aqui cada pintor antigo é
refeito passo a passo, com os mesmos sorteios na mesma ordem, e devolve as medidas e os campos suaves
(em px do 2x, a unidade do plano) para o pintor novo ler.

uso: python3 poco_plano.py        confere, camada por camada, que o plano dá a mesma imagem do pintor antigo
"""
import math
import numpy as np
from scipy import ndimage as ndi
from brush import hexc, mix, sstep, value_noise
from shapes import Mask
from fundos_cidade import grid
from fundos_fosso import tnoise, wrapped, mask_pile
import fundos_fosso as FO
import fundos_minas as MI
from fundos_minas import WrapMask, glow_at

W = H = 1024


# ======================================================================================
# Minas
# ======================================================================================
def strata_plan(rng, yy, scale=1.0):
    """As camadas tortas da rocha: o desvio, o tom de cada uma das 16 faixas e o ruído das listras."""
    warp = (tnoise(H, W, 160, rng, 2) - 0.5) * 120 * scale
    tones = rng.uniform(0.7, 1.25, 16).astype(np.float32)
    n30 = tnoise(H, W, 30, rng, 2)
    return dict(warp=warp, tones=tones, n30=n30, period=64 * scale)


def strata_old(st, yy):
    yb = yy + st['warp']
    ph = (yb / st['period']) % 1.0
    band = np.floor(yb / st['period']).astype(np.int64) % 16
    fine = np.sin(ph * math.pi * 2 * 5 + st['n30'] * 4) * 0.5 + 0.5
    return st['tones'][band] * (0.88 + 0.18 * fine), ph, band


def mine_far_plan(rng):
    yy, xx = grid(W, H)
    P = dict(tex=tnoise(H, W, 22, rng, 3), big=tnoise(H, W, 150, rng, 2))
    P['strata'] = strata_plan(rng, yy)
    P['has'] = (rng.random(16) < 0.3).astype(np.float32)
    P['sn'] = tnoise(H, W, 90, rng, 2)
    towers, walks, lamps = [], [], []
    xs = [60 + i * 340 + rng.uniform(-40, 40) for i in range(3)]
    ws = [rng.uniform(70, 110) for _ in range(3)]
    for i in range(3):
        x0, w = xs[i], ws[i]
        n = int(rng.integers(9, 12))
        step = H / n
        off = rng.uniform(0, step)
        towers.append(dict(x0=x0, w=w, n=n, step=step, off=off))
        nx = xs[(i + 1) % 3] + (W if i == 2 else 0)
        x1, x2 = x0 + w + 4, nx - 4
        py = off + int(rng.integers(1, n)) * step
        posts = max(3, int((x2 - x1) / 46))
        walks.append(dict(x1=x1, x2=x2, py=py, posts=posts))
        for k in (1, 3):
            px = x1 + (x2 - x1) * k / 4
            lamps.append((px % W, py + 20, 1.0))
    P.update(towers=towers, walks=walks, lamps=lamps)
    P['fog'] = tnoise(H, W, 200, rng, 2)
    return P


def mine_far_old(P):
    """A imagem do pintor antigo a partir do plano (a conferência)."""
    yy, xx = grid(W, H)
    t, ph, band = strata_old(P['strata'], yy)
    col = mix(MI.ROCK0, MI.ROCK2, (0.2 + 0.6 * P['big'])[..., None]) * (t * (0.84 + 0.3 * P['tex']))[..., None]
    vd = np.abs(ph - 0.5) * 64
    sn = P['sn']
    seg = sstep(0.6, 0.74, sn) * P['has'][band]
    width = 0.5 + 1.3 * sstep(0.6, 0.85, sn)
    vein = sstep(width, width * 0.3, vd) * seg
    col = mix(col, MI.AMBER_D * 0.8, (np.exp(-vd / 6) * seg * 0.25)[..., None])
    col = mix(col, MI.AMBER * 0.85, (vein * 0.6)[..., None])
    m = WrapMask(W, H)
    for tw, wk in zip(P['towers'], P['walks']):
        x0, w, n, step, off = tw['x0'], tw['w'], tw['n'], tw['step'], tw['off']
        for x in (x0, x0 + w):
            m.rect(x - 4, -8, x + 4, H + 8)
        for k in range(n):
            y = off + k * step
            m.line([(x0, y), (x0 + w, y + step)], 3.2)
            m.line([(x0 + w, y), (x0, y + step)], 3.2)
            m.rect(x0 - 10, y - 3, x0 + w + 10, y + 3)
        x1, x2, py, posts = wk['x1'], wk['x2'], wk['py'], wk['posts']
        m.rect(x1, py - 3, x2, py + 4)
        for k in range(1, posts):
            px = x1 + (x2 - x1) * k / posts
            m.rect(px - 1.2, py - 36, px + 1.2, py)
        m.rect(x1, py - 38, x2, py - 35)
        for k in (1, 3):
            px = x1 + (x2 - x1) * k / 4
            m.line([(px, py + 4), (px, py + 16)], 1.2)
    sil = m.array()
    col = mix(col, MI.WOOD0, (sil * 0.85)[..., None])
    g = glow_at(W, H, P['lamps'], yy, xx, 2.2)
    halo = glow_at(W, H, P['lamps'], yy, xx, 16)
    col = mix(col, MI.AMBER * 0.6, (halo * 0.22)[..., None])
    col = mix(col, MI.AMBER_L, (g * 0.95)[..., None])
    col = mix(col, MI.HAZE, (sstep(0.4, 0.85, P['fog']) * 0.35)[..., None])
    col *= 0.78
    return np.clip(col, 0, 1)


def mine_mid_plan(rng):
    yy, xx = grid(W, H)
    P = dict(tex=tnoise(H, W, 14, rng, 3))
    pillars = []
    pm = WrapMask(W, H)
    for i in range(2):
        cx = 180 + i * 520 + rng.uniform(-60, 60)
        w = rng.uniform(110, 170)
        pts_l = [(cx - w / 2 + 14 * math.sin(k * 0.9 + i), k * H / 12) for k in range(13)]
        pts_r = [(cx + w / 2 + 14 * math.sin(k * 0.7 + i * 2), k * H / 12) for k in range(12, -1, -1)]
        pm.poly(pts_l + pts_r)
        pillars.append(dict(cx=cx, w=w, i=i, left=pts_l, right=pts_r[::-1]))
    pil = pm.array()
    P.update(pillars=pillars, pil=pil)
    P['strata'] = strata_plan(rng, yy, 0.7)
    frames, beams = [], []
    for i in range(2):
        x0 = 20 + i * 512 + rng.uniform(-20, 20)
        span = rng.uniform(250, 320)
        b0 = rng.uniform(140, 260)
        frames.append(dict(x0=x0, span=span, b0=b0))
        for top in (b0, b0 + H / 2):
            beams.append((x0, span, top))
    x0, span, top = beams[0]
    bx = x0 + span * rng.uniform(0.35, 0.65)
    by = top + rng.uniform(150, 300)
    P['bucket'] = dict(bx=bx, by=by, top=top)
    x0, span, top = beams[3]
    cx, r = x0 + span * 0.5, 46
    cy = top + 4 + 30 + r * 0.2
    ry = cy + rng.uniform(220, 300)
    P['pulley'] = dict(cx=cx, cy=cy, r=r, ry=ry, top=top)
    P.update(frames=frames, beams=beams)
    P['grain'] = tnoise(H, W, 6, rng, 2)
    clusters = []
    ys, xs = np.nonzero(pil > 0.9)
    for i in range(7):
        j = int(rng.integers(0, len(xs)))
        x, y = float(xs[j]), float(ys[j])
        n = int(rng.integers(3, 6))
        cr = []
        for k in range(n):
            a = -math.pi / 2 + rng.normal(0, 0.6)
            ln = rng.uniform(14, 34)
            bx, by = x + rng.normal(0, 6), y + rng.normal(0, 3)
            cr.append((bx, by, a, ln))
        clusters.append(dict(x=x, y=y, crystals=cr))
    P['clusters'] = clusters
    return P


def mine_mid_old(P):
    yy, xx = grid(W, H)
    A = np.zeros((H, W), np.float32)
    col = np.zeros((H, W, 3), np.float32)
    tex, pil = P['tex'], P['pil']
    t, ph, _ = strata_old(P['strata'], yy)
    rock = mix(MI.ROCK1, MI.ROCK3, (0.3 + 0.5 * tex)[..., None]) * t[..., None]
    lit = np.clip(pil - np.roll(pil, 7, axis=1), 0, 1)
    rock = mix(rock, MI.AMBER_D * 0.9, (lit * 0.4)[..., None])
    col = mix(col, rock, pil[..., None])
    A = np.maximum(A, pil)
    wm = WrapMask(W, H)
    hi = WrapMask(W, H)
    for fr in P['frames']:
        x0, span, b0 = fr['x0'], fr['span'], fr['b0']
        for x in (x0, x0 + span):
            wm.rect(x - 10, -12, x + 10, H + 12)
            hi.rect(x - 10, -12, x - 6, H + 12)
        for top in (b0, b0 + H / 2):
            wm.rect(x0 - 26, top - 18, x0 + span + 26, top + 4)
            hi.rect(x0 - 26, top - 18, x0 + span + 26, top - 14)
            for x, sg in ((x0, 1), (x0 + span, -1)):
                wm.line([(x + sg * 8, top + 70), (x + sg * 62, top + 2)], 9)
    b = P['bucket']
    bx, by, top = b['bx'], b['by'], b['top']
    wm.line([(bx, top + 2), (bx, by)], 2.2)
    wm.poly([(bx - 16, by), (bx + 16, by), (bx + 12, by + 26), (bx - 12, by + 26)])
    hi.rect(bx - 16, by, bx + 16, by + 3)
    p = P['pulley']
    cx, cy, r, ry, top = p['cx'], p['cy'], p['r'], p['ry'], p['top']
    wm.rect(cx - 4, top + 2, cx + 4, cy)
    wm.ellipse(cx, cy, r, r)
    wm.ellipse(cx, cy, r - 9, r - 9, v=0)
    for k in range(6):
        a = k * math.pi / 3
        wm.line([(cx, cy), (cx + math.cos(a) * (r - 6), cy + math.sin(a) * (r - 6))], 5)
    wm.ellipse(cx, cy, 10, 10)
    wm.line([(cx - r, cy), (cx - r, ry)], 2.6)
    wm.poly([(cx - r - 14, ry), (cx - r + 14, ry), (cx - r + 11, ry + 22), (cx - r - 11, ry + 22)])
    wm.line([(cx + r, cy), (cx + r, cy + 120)], 2.6)
    wm.rect(cx + r - 7, cy + 120, cx + r + 7, cy + 128)
    wood = wm.array()
    hil = hi.array() * wood
    grain = 0.85 + 0.25 * P['grain']
    wcol = mix(MI.WOOD1, MI.WOOD2, (0.5 * grain)[..., None])
    wcol = mix(wcol, MI.AMBER_D * 1.1, (hil * 0.6)[..., None])
    col = mix(col, wcol, wood[..., None])
    A = np.maximum(A, wood)
    cm = WrapMask(W, H)
    pts = []
    for c in P['clusters']:
        for (bx, by, a, ln) in c['crystals']:
            wd = ln * 0.28
            tx, ty = bx + math.cos(a) * ln, by + math.sin(a) * ln
            nx, ny = -math.sin(a) * wd, math.cos(a) * wd
            cm.poly([(bx + nx, by + ny), (tx, ty), (bx - nx, by - ny)])
        pts.append((c['x'], c['y'] - 10, 1.0))
    cr = cm.array()
    col = mix(col, MI.AMBER, (cr * 0.95)[..., None])
    col = mix(col, MI.AMBER_L, (cr * sstep(0.55, 0.85, tex) * 0.7)[..., None])
    A = np.maximum(A, cr)
    halo = glow_at(W, H, pts, yy, xx, 40)
    col = mix(col, col + MI.AMBER * 0.35, (halo * A * 0.6)[..., None])
    return np.clip(col * 0.8, 0, 1), np.clip(A, 0, 1), dict(wood=wood, cr=cr)


# ======================================================================================
# Fosso
# ======================================================================================
def fosso_far_plan(rng):
    yy, xx = grid(W, H)
    P = dict(tex=tnoise(H, W, 26, rng, 3), big=tnoise(H, W, 140, rng, 2))
    bands = []
    for i in range(7):
        x0 = rng.uniform(0, W)
        w = rng.uniform(60, 170)
        amp = rng.uniform(6, 16)
        k = int(rng.integers(1, 3))
        ph = rng.uniform(0, 6.28)
        tone = rng.uniform(0.75, 1.05)
        bands.append(dict(x0=x0, w=w, amp=amp, k=k, ph=ph, tone=tone))
    falls = []
    for i in range(6):
        x0 = rng.uniform(0, W)
        wd = rng.uniform(2.0, 5.0)
        k = int(rng.integers(1, 4))
        ph = rng.uniform(0, 6.28)
        falls.append(dict(x0=x0, wd=wd, k=k, ph=ph))
    P['sheen'] = tnoise(H, W, 12, rng, 1)
    ledges = []
    for i in range(4):
        cx = rng.uniform(80, W - 80)
        y = 120 + i * 240 + rng.uniform(-30, 30)
        w = rng.uniform(110, 190)
        ledges.append(dict(cx=cx, y=y, w=w, pile=mask_pile(None, cx, y, w, rng)))
    motes = []
    for i in range(46):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(1.0, 2.2)
        motes.append((x, y, r, rng.uniform(0.5, 1.0)))
    P.update(bands=bands, falls=falls, ledges=ledges, motes=motes)
    P['fog'] = tnoise(H, W, 180, rng, 2)
    return P


def fosso_far_old(P):
    yy, xx = grid(W, H)
    tex, big = P['tex'], P['big']
    col = mix(FO.ROCK0, FO.ROCK2, (0.25 + 0.6 * big)[..., None])
    col = col * (0.82 + 0.3 * tex)[..., None]
    for b in P['bands']:
        def band(ox, oy, x0=b['x0'], w=b['w'], amp=b['amp'], k=b['k'], ph=b['ph']):
            cx = x0 + ox + amp * np.sin((yy - oy) / H * 2 * math.pi * k + ph)
            return np.clip(np.minimum(xx - (cx - w / 2), (cx + w / 2) - xx) / 6.0, 0, 1)

        a = wrapped(band, W, H)
        face = mix(FO.ROCK1, FO.ROCK3, sstep(0.3, 0.8, tex)[..., None]) * b['tone']
        col = mix(col, face, (a * 0.55)[..., None])
        lit = np.clip(a - np.roll(a, 6, axis=1), 0, 1)
        col = mix(col, FO.PURPLE * 0.5, (lit * 0.25)[..., None])
    falls = np.zeros((H, W), np.float32)
    rims = np.zeros((H, W), np.float32)
    for f in P['falls']:
        def fall(ox, oy, x0=f['x0'], wd=f['wd'], k=f['k'], ph=f['ph']):
            cx = x0 + ox + 3.0 * np.sin((yy - oy) / H * 2 * math.pi * k + ph)
            return np.clip(wd - np.abs(xx - cx), 0, 1)

        def frim(ox, oy, x0=f['x0'], wd=f['wd'], k=f['k'], ph=f['ph']):
            cx = x0 + ox + 3.0 * np.sin((yy - oy) / H * 2 * math.pi * k + ph)
            return np.exp(-((np.abs(xx - cx) - wd) / 2.2) ** 2)

        falls = np.maximum(falls, wrapped(fall, W, H))
        rims = np.maximum(rims, wrapped(frim, W, H))
    col = mix(col, FO.PURPLE * 0.8, (rims * 0.32)[..., None])
    col = mix(col, FO.INK, (falls * 0.95)[..., None])
    sheen = falls * sstep(0.62, 0.8, P['sheen'])
    col = mix(col, FO.LILAC * 0.6, (sheen * 0.25)[..., None])
    m = Mask(W, H)
    piles = []
    for L in P['ledges']:
        cx, y, w = L['cx'], L['y'], L['w']
        m.poly([(cx - w / 2 - 14, y + 2), (cx + w / 2 + 14, y + 2), (cx + w / 2 - 6, y + 16), (cx - w / 2 + 10, y + 18)])
        piles += L['pile']
    ledge = np.asarray(m.array(), np.float32)
    col = mix(col, FO.ROCK1 * 0.9, (ledge * 0.95)[..., None])
    col = mix(col, FO.ROCK3 * 1.1, (np.clip(ledge - np.roll(ledge, 3, axis=0), 0, 1) * 0.6)[..., None])
    for (x, y, rx, ry, ang) in piles:
        dx = xx - x
        dy = yy - y
        c, s = math.cos(ang), math.sin(ang)
        u = (dx * c + dy * s) / rx
        v = (-dx * s + dy * c) / ry
        d = u * u + v * v
        a = np.clip((1 - d) * 4, 0, 1)
        if not a.any():
            continue
        tone = mix(FO.PORC1, FO.PORC2, sstep(0.5, -0.6, u + v * 0.4)[..., None])
        tone = mix(tone, FO.PORC0, sstep(0.3, 1.0, d)[..., None])
        col = mix(col, tone * 0.55, (a * 0.9)[..., None])
        for ex in (-0.38, 0.38):
            e = np.clip((1 - ((u - ex) ** 2 / 0.06 + (v + 0.15) ** 2 / 0.09)) * 3, 0, 1) * a
            col = mix(col, FO.ROCK0, (e * 0.85)[..., None])
    glow = np.zeros((H, W), np.float32)
    for (x, y, r, k) in P['motes']:
        g = wrapped(lambda ox, oy: np.exp(-((xx - x - ox) ** 2 + (yy - y - oy) ** 2) / (2 * r * r)), W, H)
        glow = np.maximum(glow, g * k)
        halo = wrapped(lambda ox, oy: np.exp(-((xx - x - ox) ** 2 + (yy - y - oy) ** 2) / (2 * (r * 6) ** 2)), W, H)
        col = mix(col, FO.PURPLE * 0.6, (halo * 0.12)[..., None])
    col = mix(col, FO.LILAC, (glow * 0.85)[..., None])
    col = mix(col, FO.PURPLE * 0.32, (sstep(0.45, 0.85, P['fog']) * 0.35)[..., None])
    return np.clip(col * 0.78, 0, 1)


def fosso_mid_plan(rng):
    yy, xx = grid(W, H)
    P = dict(tex=tnoise(H, W, 16, rng, 3))
    A = np.zeros((H, W), np.float32)
    walls, arr = [], []
    for i, x0 in enumerate((rng.uniform(120, 260), rng.uniform(640, 780))):
        w = rng.uniform(120, 170)
        k1, k2 = int(rng.integers(2, 5)), int(rng.integers(5, 9))
        p1, p2 = rng.uniform(0, 6.28), rng.uniform(0, 6.28)

        def wall(ox, oy, x0=x0, w=w, k1=k1, k2=k2, p1=p1, p2=p2):
            t = (yy - oy) / H * 2 * math.pi
            l = x0 + ox - w / 2 + 14 * np.sin(t * k1 + p1) + 5 * np.sin(t * k2 + p2)
            r = x0 + ox + w / 2 + 12 * np.sin(t * k1 + p2) + 6 * np.sin(t * k2 + p1)
            return np.clip(np.minimum(xx - l, r - xx) / 2.0, 0, 1)

        a = wrapped(wall, W, H)
        walls.append(dict(x0=x0, w=w, k1=k1, k2=k2, p1=p1, p2=p2))
        arr.append(a)
        A = np.maximum(A, a)
    P.update(walls=walls, wall_a=arr, A=A)
    P['broad'] = tnoise(H, W, 60, rng, 2)
    P['crack'] = tnoise(H, W, 30, rng, 2)
    h = H // 20 + 2
    P['st'] = ndi.zoom(value_noise(h, W, 5, rng, 2), (20, 1), order=1)[:H].astype(np.float32)
    drips = []
    for a in arr:
        for k in range(9):
            y = rng.uniform(0, H)
            side = rng.choice([-1, 1])
            row = a[int(y) % H]
            idx = np.nonzero(row > 0.5)[0]
            if not len(idx):
                continue
            x = idx.min() if side < 0 else idx.max()
            L = rng.uniform(8, 26)
            drips.append((float(x), y, int(side), L, rng.uniform(1.6, 2.6)))
    chains = []
    for i, x in enumerate((rng.uniform(380, 460), rng.uniform(520, 600), rng.uniform(900, 980))):
        ms = []
        for j in range(int(rng.integers(2, 4))):
            ms.append((x + rng.uniform(-3, 3), rng.uniform(40, H - 40), rng.uniform(-0.5, 0.5)))
        chains.append(dict(x=x, masks=ms))
    P.update(drips=drips, chains=chains)
    return P


def fosso_mid_old(P):
    yy, xx = grid(W, H)
    tex, broad, A = P['tex'], P['broad'], P['A'].copy()
    col = mix(FO.ROCK0 * 1.3, FO.ROCK2, sstep(0.25, 0.9, broad)[..., None])
    col = col * (0.9 + 0.16 * tex)[..., None]
    cr = sstep(0.035, 0.0, np.abs(P['crack'] - 0.5)) * sstep(0.3, 0.7, broad)
    col = mix(col, FO.ROCK0 * 0.6, (cr * 0.7)[..., None])
    lit = np.clip(A - np.roll(A, 7, axis=1), 0, 1)
    col = mix(col, FO.PURPLE * 0.7, (ndi.gaussian_filter(lit, 2.0) * 0.6)[..., None])
    shade = np.clip(A - np.roll(A, -16, axis=1), 0, 1)
    col = mix(col, FO.ROCK0, (ndi.gaussian_filter(shade, 5.0) * 0.7)[..., None])
    st = P['st']
    ink = sstep(0.6, 0.72, st) * A
    col = mix(col, FO.INK, (ink * 0.85)[..., None])
    col = mix(col, FO.MAGENTA * 0.5, (sstep(0.58, 0.6, st) * sstep(0.62, 0.6, st) * A * 0.4)[..., None])
    m = Mask(W, H)
    for (x, y, side, L, wd) in P['drips']:
        m.line([(x, y), (x + side * 1.5, y + L * 0.6), (x + side * 0.5, y + L)], wd)
        m.ellipse(x + side * 0.5, y + L + 2.5, 2.4, 3.2)
    drips = np.asarray(m.array(), np.float32)
    col = mix(col, FO.INK, (drips * 0.95)[..., None])
    A = np.maximum(A, drips)
    cm = Mask(W, H)
    masks = []
    for c in P['chains']:
        x = c['x']
        y = -10.0
        k = 0
        while y < H + 10:
            if k % 2:
                cm.ellipse(x, y + 4, 1.5, 4.4)
            else:
                cm.ellipse(x, y + 4, 3.0, 4.0)
                cm.ellipse(x, y + 4, 1.0, 2.2, v=0)
            y += 7.2
            k += 1
        masks += c['masks']
    chains = np.asarray(cm.array(), np.float32)
    col = mix(col, hexc(0x0b0910), (chains * 0.95)[..., None])
    A = np.maximum(A, chains * 0.95)
    for (x, y, ang) in masks:
        rx, ry = 9.0, 12.0
        dx, dy = xx - x, yy - y
        c, s = math.cos(ang), math.sin(ang)
        u = (dx * c + dy * s) / rx
        v = (-dx * s + dy * c) / ry
        d = u * u + v * v
        a = np.clip((1 - d) * 5, 0, 1)
        tone = mix(FO.PORC1, FO.PORC2, sstep(0.6, -0.6, u + v * 0.5)[..., None])
        tone = mix(tone, FO.PORC0, sstep(0.4, 1.0, d)[..., None])
        crack = sstep(0.12, 0.0, np.abs(u - 0.15 * np.sin(v * 6) - 0.1)) * (v > -0.6)
        tone = mix(tone, FO.ROCK0, (crack * 0.8)[..., None])
        for ex in (-0.36, 0.36):
            e = np.clip((1 - ((u - ex) ** 2 / 0.05 + (v + 0.12) ** 2 / 0.08)) * 3, 0, 1)
            tone = mix(tone, FO.ROCK0, e[..., None])
        col = mix(col, tone * 0.7, a[..., None])
        A = np.maximum(A, a)
    return np.clip(col * 0.72, 0, 1), np.clip(A, 0, 1), dict(drips=drips, chains=chains)


PLANS = {
    'mine-far': (mine_far_plan, 141),
    'mine-mid': (mine_mid_plan, 142),
    'fosso-far': (fosso_far_plan, 91),
    'fosso-mid': (fosso_mid_plan, 92),
}


def plan(name):
    fn, seed = PLANS[name]
    return fn(np.random.default_rng(seed))


if __name__ == '__main__':
    from brush import Layer

    def same(a, b):
        return 'IGUAL' if a.shape == b.shape and np.array_equal(a, b) else f'DIFERENTE ({np.abs(a.astype(np.float32) - b.astype(np.float32)).max():.4f})'

    old = np.asarray(MI.mine_far(np.random.default_rng(141)).image())
    new = np.asarray(Layer.from_rgb(mine_far_old(plan('mine-far'))).image())
    print('mine-far', same(old, new), flush=True)
    old = np.asarray(MI.mine_mid(np.random.default_rng(142)).image())
    c, a, _ = mine_mid_old(plan('mine-mid'))
    L = Layer(W, H)
    L.fill(c, a)
    print('mine-mid', same(old, np.asarray(L.image())), flush=True)
    old = np.asarray(FO.fosso_far(np.random.default_rng(91)).image())
    new = np.asarray(Layer.from_rgb(fosso_far_old(plan('fosso-far'))).image())
    print('fosso-far', same(old, new), flush=True)
    old = np.asarray(FO.fosso_mid(np.random.default_rng(92)).image())
    c, a, _ = fosso_mid_old(plan('fosso-mid'))
    L = Layer(W, H)
    L.fill(c, a)
    print('fosso-mid', same(old, np.asarray(L.image())), flush=True)

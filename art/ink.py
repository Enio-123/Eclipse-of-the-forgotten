"""Traço liso dos bonecos (desenho à mão, sem pixel), com os mesmos volumes de puppet.py.

Cada quadro é amostrado numa grade fina: S vezes a resolução do jogo e A x A amostras por pixel
(as bordas saem suaves quando a grade é reduzida). A luz vem das mesmas normais do renderizador de
pixel, mas a cor sai de poucas faixas com passagem macia (sombra pintada), o contorno é uma linha de
tinta escura, mais grossa do lado da sombra, e onde uma parte passa na frente de outra fica uma
linha interna fina. Algumas partes podem continuar em pixel (o corpo do cavaleiro): o renderizador
antigo desenha essas partes e as duas camadas se juntam pela profundidade.

A folha sai como atlas do Phaser com os quadros recortados e nomeados pelo número ("0", "1", ...),
no mesmo lugar em que estavam na folha antiga: o jogo continua usando os mesmos números e só
reduz o desenho (escala 1/S).

uso: ink.build_atlas('guard', ANIMS, build, W, H, FEET, pasta)  (ver ink_sheets.py)
"""
import json
import math
import os
from multiprocessing import Pool
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import puppet
from puppet import Ellipse, Capsule, Poly, RAMPS, LIGHT, HALF, SHINY, THRESH, RIM_MATS
from rig import Rot

S = 2
A = 3
INK = np.array([11, 9, 16], np.float32) / 255
# direção da luz no plano (de cima à esquerda) e da luz de contorno (de cima à direita)
L2 = np.array([LIGHT[0], LIGHT[1]], np.float32) / math.hypot(LIGHT[0], LIGHT[1])
RIM2 = np.array([0.86, -0.5], np.float32)

STYLE = dict(
    outline=1.0,      # espessura do contorno (pixels do jogo)
    vary=0.38,        # quanto o contorno engrossa do lado da sombra
    inner=0.5,        # linha interna onde uma parte passa na frente de outra
    soft=0.035,       # largura da passagem entre as faixas de luz
    rim=0.55,         # largura da luz de contorno
    rim_k=0.55,
    bands=(0.2, 0.42, 0.66, 0.9),   # limiares das faixas (intensidade -> rampa 0..4)
    ao=0.0,           # sombra macia na parte de trás, perto da borda da parte da frente
    ao_k=0.0,
    ink_tint=0.35,    # quanto o contorno puxa para a cor mais escura da parte (o resto é tinta)
)

# o traço do jogo: contorno grosso de tinta, três tons por material e sombra entre as partes
HK = dict(STYLE, outline=1.6, vary=0.4, inner=0.8, soft=0.022, rim=0.5, rim_k=0.55,
          bands=(-1.0, 0.45, 0.92, 9.0), ao=1.8, ao_k=0.45, ink_tint=0.0)
# partes do cavaleiro que continuam em pixel (o corpo); máscara, capuz, capa e armas ficam lisos
KNIGHT_PIXEL = ('thigh', 'shin', 'knee', 'foot', 'upperarm', 'forearm', 'hand', 'belly', 'chest', 'skirt', 'belt', 'buckle')


def ramp_f(mat):
    return np.array([[(c >> 16) & 255, (c >> 8) & 255, c & 255] for c in RAMPS[mat]], np.float32) / 255


def col_f(c):
    return np.array([(c >> 16) & 255, (c >> 8) & 255, c & 255], np.float32) / 255


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- volumes vetorizados
def _normalize(nx, ny, nz):
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    l = np.where(l == 0, 1.0, l)
    return nx / l, ny / l, nz / l


def hit_np(p, X, Y):
    """(dentro, nx, ny, nz) da parte p nas amostras X, Y (mesmo formato)."""
    if isinstance(p, Rot):
        dx = (X - p.off[0] - p.pivot[0]) / p.k
        dy = (Y - p.off[1] - p.pivot[1]) / p.k
        lx = p.pivot[0] + dx * p.c + dy * p.s
        ly = p.pivot[1] - dx * p.s + dy * p.c
        m, nx, ny, nz = hit_np(p.inner, lx, ly)
        return m, nx * p.c - ny * p.s, nx * p.s + ny * p.c, nz
    if isinstance(p, Ellipse):
        c, s = math.cos(-p.ang), math.sin(-p.ang)
        dx, dy = X - p.c[0], Y - p.c[1]
        lx, ly = dx * c - dy * s, dx * s + dy * c
        u, v = lx / p.rx, ly / p.ry
        d = u * u + v * v
        m = d <= 1.0
        nz = np.sqrt(np.maximum(0.0, 1.0 - d)) * p.bulge + 0.08
        ca, sa = math.cos(p.ang), math.sin(p.ang)
        nx, ny = u * ca - v * sa, u * sa + v * ca
        return (m,) + _normalize(nx, ny, nz)
    if isinstance(p, Capsule):
        ax, ay = p.a
        bx, by = p.b
        vx, vy = bx - ax, by - ay
        L2_ = vx * vx + vy * vy or 1e-6
        t = np.clip(((X - ax) * vx + (Y - ay) * vy) / L2_, 0.0, 1.0)
        px, py = ax + vx * t, ay + vy * t
        r = p.ra + (p.rb - p.ra) * t
        dx, dy = X - px, Y - py
        d = np.sqrt(dx * dx + dy * dy)
        m = d <= r
        k = d / r
        dd = np.where(d == 0, 1.0, d)
        return (m,) + _normalize(dx / dd * k, dy / dd * k, np.sqrt(np.maximum(0.0, 1 - k * k)) + 0.1)
    if isinstance(p, Poly):
        m = inside_np(p.pts, X, Y)
        nx = np.zeros(X.shape, np.float32)
        ny = np.full(X.shape, -0.2, np.float32)
        nz = np.full(X.shape, 0.98, np.float32)
        if p.nf is not None and m.any():
            xs, ys = X[m], Y[m]
            n = poly_normals(p.nf, xs, ys)
            nx[m], ny[m], nz[m] = n
        return m, nx, ny, nz
    raise TypeError(type(p))


def inside_np(pts, X, Y):
    ins = np.zeros(X.shape, bool)
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if yi != yj or True:
            cond = ((yi > Y) != (yj > Y)) & (X < (xj - xi) * (Y - yi) / (yj - yi + 1e-9) + xi)
            ins ^= cond
        j = i
    return ins


def poly_normals(nf, xs, ys):
    """Normais de um polígono: tenta a função com vetores; se ela só aceita números, calcula numa
    grade de meio pixel do jogo (a luz é suave, não precisa da grade fina)."""
    try:
        r = nf(xs, ys)
        out = [np.broadcast_to(np.asarray(c, np.float32), xs.shape) for c in r]
        if len(out) == 3:
            return out
    except Exception:
        pass
    q = 2.0
    kx = np.round(xs * q).astype(np.int64)
    ky = np.round(ys * q).astype(np.int64)
    key = kx * 1000003 + ky
    uniq, inv = np.unique(key, return_inverse=True)
    first = np.zeros(len(uniq), np.int64)
    first[inv[::-1]] = np.arange(len(key))[::-1]
    vals = np.array([nf(kx[i] / q, ky[i] / q) for i in first], np.float32)
    return vals[inv, 0], vals[inv, 1], vals[inv, 2]


# ---------------------------------------------------------------- quadro liso
def intensity(mat, nx, ny, nz, shade):
    diff = np.maximum(0.0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2])
    i = 0.2 + 0.8 * diff
    if mat in SHINY:
        amt, pw = SHINY[mat]
        spec = np.maximum(0.0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]) ** pw
        i = i + amt * spec
    return i * shade


def bands(i, style):
    """Intensidade -> posição contínua na rampa (0..4) em faixas com passagem macia."""
    w = style['soft']
    g = np.zeros_like(i)
    for t in style['bands']:
        g += sstep(t - w, t + w, i)
    return g


def quant(i):
    idx = np.zeros(i.shape, np.int32)
    for t in THRESH:
        idx += i > t
    return idx


def render_smooth(prims, decals, W, H, s=S, a=A, style=STYLE, skip=()):
    """Desenha as partes lisas de um quadro numa grade fina (H*s*a, W*s*a).
    Devolve rgb, alfa (0/1 por amostra), z e o material de cada amostra."""
    k = s * a
    Hf, Wf = H * k, W * k
    order = sorted([p for p in prims if p.name not in skip], key=lambda p: -p.z)
    zbuf = np.full((Hf, Wf), -1e9, np.float32)
    pid = np.full((Hf, Wf), -1, np.int32)
    rgb = np.zeros((Hf, Wf, 3), np.float32)
    inten = np.zeros((Hf, Wf), np.float32)
    mats = sorted(RAMPS)
    mid = np.full((Hf, Wf), -1, np.int32)
    for n, p in reversed(list(enumerate(order))):
        b = p.bbox
        x0, x1 = max(0, int(math.floor(b[0] * k))), min(Wf, int(math.ceil(b[2] * k)) + 1)
        y0, y1 = max(0, int(math.floor(b[1] * k))), min(Hf, int(math.ceil(b[3] * k)) + 1)
        if x0 >= x1 or y0 >= y1:
            continue
        ys, xs = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        X = (xs + 0.5) / k
        Y = (ys + 0.5) / k
        m, nx, ny, nz = hit_np(p, X, Y)
        if not m.any():
            continue
        R = ramp_f(p.mat)
        if p.flat is not None and isinstance(p.flat, int):
            c = np.broadcast_to(R[p.flat], m.shape + (3,))
            iv = np.full(m.shape, np.nan, np.float32)
        else:
            iv = intensity(p.mat, nx, ny, nz, p.shade)
            g = bands(iv, style)
            lo = np.clip(np.floor(g).astype(np.int32), 0, 4)
            hi = np.clip(lo + 1, 0, 4)
            fr = (g - lo)[..., None]
            c = R[lo] + (R[hi] - R[lo]) * fr
        sub = (slice(y0, y1), slice(x0, x1))
        rgb[sub][m] = c[m]
        zbuf[sub][m] = p.z
        pid[sub][m] = n
        inten[sub][m] = iv[m]
        mid[sub][m] = mats.index(p.mat)
    filled = pid >= 0
    # decalques: chamam a função antiga em cada amostra da parte
    if decals:
        names = np.array([p.name for p in order] + [''], dtype=object)
        pname = names[pid]
        for d in decals:
            sel = np.nonzero(filled & (pname == d.clip))
            if not len(sel[0]):
                continue
            iv = inten[sel]
            q = quant(np.nan_to_num(iv, nan=0.5))
            for j in range(len(sel[0])):
                yy, xx = sel[0][j], sel[1][j]
                p = order[pid[yy, xx]]
                cur = (p.mat, p.flat if p.flat is not None else int(q[j]))
                r = d.fn((xx + 0.5) / k, (yy + 0.5) / k, cur)
                if r is None:
                    continue
                m2, v = r
                if isinstance(v, (int, np.integer)) and 0 <= v < 5:
                    rgb[yy, xx] = ramp_f(m2)[v]
                else:
                    rgb[yy, xx] = col_f(int(v))
                mid[yy, xx] = mats.index(m2) if m2 in RAMPS else mid[yy, xx]
    return dict(rgb=rgb, filled=filled, z=zbuf, mid=mid, mats=mats, k=k)


def ink_pass(L, style=STYLE, rim=True):
    """Linha interna, luz de contorno e contorno de tinta na grade fina."""
    rgb, filled, z, mid, mats, k = L['rgb'], L['filled'], L['z'], L['mid'], L['mats'], L['k']
    Hf, Wf = filled.shape
    darkest = np.array([ramp_f(m)[0] for m in mats], np.float32)
    # ---- linha interna: a amostra de trás, perto da borda de uma parte da frente
    r_in = style['inner'] * k
    if r_in > 0:
        zk = np.where(filled, np.round(z * 100).astype(np.int64) * 64 + np.maximum(mid, 0), -1)
        rr = int(math.ceil(r_in))
        yy, xx = np.mgrid[-rr:rr + 1, -rr:rr + 1]
        disk = (xx * xx + yy * yy) <= r_in * r_in
        front = ndi.maximum_filter(zk, footprint=disk, mode='constant', cval=-1)
        fz = (front // 64) / 100.0
        fm = front % 64
        line = filled & (front >= 0) & (fz > z + 0.25)
        other = line & (fm != mid)
        same = line & (fm == mid)
        inkc = darkest[np.maximum(mid, 0)] * 0.45 + INK * 0.55
        rgb = rgb.copy()
        rgb[other] = rgb[other] * 0.1 + inkc[other] * 0.9
        rgb[same] = rgb[same] * 0.45 + inkc[same] * 0.55
    # ---- sombra macia na parte de trás, junto da borda da parte da frente
    if style.get('ao', 0) > 0:
        ra = style['ao'] * k
        zz = np.where(filled, z, -1e9)
        rr = int(math.ceil(ra))
        yy, xx = np.mgrid[-rr:rr + 1, -rr:rr + 1]
        disk = (xx * xx + yy * yy) <= ra * ra
        zf = ndi.maximum_filter(zz, footprint=disk, mode='constant', cval=-1e9)
        occl = (filled & (zf > z + 0.25)).astype(np.float32)
        # quanto mais perto da borda da frente, mais escuro (a distância vem de um desfoque da máscara)
        near = np.zeros_like(occl)
        front_m = np.zeros(filled.shape, np.float32)
        # amostras que estão na frente de alguma vizinha
        lower = ndi.minimum_filter(np.where(filled, z, 1e9), footprint=disk, mode='constant', cval=1e9)
        front_m[(filled) & (lower < z - 0.25)] = 1.0
        near = ndi.gaussian_filter(front_m, ra * 0.45)
        t = np.clip(near * 2.2, 0, 1) * occl * style['ao_k']
        rgb = rgb * (1 - t[..., None]) + (darkest[np.maximum(mid, 0)] * 0.6 + INK * 0.4) * t[..., None]
    # ---- luz de contorno: lado de cima à direita da silhueta
    if rim:
        din, (iy, ix) = ndi.distance_transform_edt(filled, return_indices=True)
        oy = iy - np.arange(Hf)[:, None]
        ox = ix - np.arange(Wf)[None, :]
        dl = np.maximum(din, 1e-3)
        facing = (ox * RIM2[0] + oy * RIM2[1]) / dl
        rimm = filled & (din < style['rim'] * k) & (facing > 0.25)
        ok = np.isin(mid, [mats.index(m) for m in RIM_MATS if m in mats])
        rimm &= ok
        lift = np.array([ramp_f(m)[3] for m in mats], np.float32)[np.maximum(mid, 0)]
        t = (style['rim_k'] * sstep(0.25, 0.8, facing) * (1 - din / (style['rim'] * k)))[..., None]
        rgb = np.where(rimm[..., None], rgb + (lift - rgb) * t, rgb)
    # ---- contorno de tinta por fora, mais grosso do lado da sombra
    dout, (iy, ix) = ndi.distance_transform_edt(~filled, return_indices=True)
    oy = np.arange(Hf)[:, None] - iy
    ox = np.arange(Wf)[None, :] - ix
    dl = np.maximum(dout, 1e-3)
    tolight = (ox * L2[0] + oy * L2[1]) / dl
    w = style['outline'] * k * (1 - style['vary'] * tolight)
    ring = (~filled) & (dout <= w)
    m_near = mid[iy, ix]
    tint = style.get('ink_tint', 0.35)
    inkc = darkest[np.maximum(m_near, 0)] * tint + INK * (1 - tint)
    out = rgb.copy()
    out[ring] = inkc[ring]
    alpha = filled | ring
    zout = np.where(ring, z[iy, ix], z)
    return out, alpha, zout


def down(rgb, alpha, a):
    Hf, Wf = alpha.shape
    h, w = Hf // a, Wf // a
    al = alpha.astype(np.float32)
    pm = (rgb * al[..., None]).reshape(h, a, w, a, 3).mean((1, 3))
    am = al.reshape(h, a, w, a).mean((1, 3))
    col = pm / np.maximum(am[..., None], 1e-5)
    return np.dstack([np.clip(col, 0, 1), am])


# ---------------------------------------------------------------- camada em pixel (partes que continuam pixel)
def pixel_layer(prims, decals, W, H, keep):
    """As partes `keep` no renderizador de pixel (1x), com contorno e profundidade por pixel."""
    sel = [p for p in prims if p.name in keep]
    if not sel:
        return None
    dec = [d for d in decals if d.clip in keep]
    px, part = puppet.render(sel, dec, W, H)
    px = puppet.rim_light(px, W, H)
    rgb = np.zeros((H, W, 3), np.float32)
    al = np.zeros((H, W), bool)
    z = np.full((H, W), -1e9, np.float32)
    for y in range(H):
        for x in range(W):
            c = px[y][x]
            if c is None:
                continue
            col = RAMPS[c[0]][c[1]] if isinstance(c[1], int) else c[1]
            rgb[y, x] = col_f(col)
            al[y, x] = True
            z[y, x] = part[y][x].z
    # contorno de 1 pixel, na profundidade da parte vizinha
    out_rgb, out_al, out_z = rgb.copy(), al.copy(), z.copy()
    for y in range(H):
        for x in range(W):
            if al[y, x]:
                continue
            best = None
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and al[ny, nx]:
                    if best is None or z[ny, nx] > z[best[1], best[0]]:
                        best = (nx, ny)
            if best is None:
                continue
            m = px[best[1]][best[0]][0]
            out_rgb[y, x] = col_f(puppet.mix(RAMPS[m][0], 0x0b0910, 0.55))
            out_al[y, x] = True
            out_z[y, x] = z[best[1], best[0]]
    return out_rgb, out_al, out_z


def render_frame(prims, decals, W, H, s=S, a=A, style=STYLE, pixel=(), rim=True):
    """Quadro final em (H*s, W*s) RGBA float. `pixel`: nomes das partes que continuam em pixel."""
    k = s * a
    L = render_smooth(prims, decals, W, H, s, a, style, skip=pixel)
    rgb, al, z = ink_pass(L, style, rim)
    if pixel:
        P = pixel_layer(prims, decals, W, H, set(pixel))
        if P is not None:
            prgb, pal, pz = (np.repeat(np.repeat(v, k, 0), k, 1) for v in P)
            front = pal & (~al | (pz >= z))
            rgb = np.where(front[..., None], prgb, rgb)
            al = al | pal
    return down(rgb, al, a)


# ---------------------------------------------------------------- folha (atlas)
def _job(args):
    mod_name, an, i, pose, W, H, s, a, pixel, extra = args
    import importlib
    mod = importlib.import_module(mod_name)
    build = getattr(mod, extra.get('build', 'build'))
    kw = extra.get('kw', {})
    prims, decals = build(pose, **kw) if kw else build(pose)
    img = render_frame(prims, decals, W, H, s, a, pixel=pixel, style=extra.get('style', HK))
    return an, i, (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


def pack(frames, max_w=2048, pad=1):
    """frames: lista de (nome, rgba uint8). Recorta cada quadro e arruma em prateleiras."""
    items = []
    for name, im in frames:
        al = im[..., 3]
        ys, xs = np.nonzero(al)
        if not len(xs):
            x0 = y0 = 0
            x1 = y1 = 1
        else:
            x0, x1 = max(0, xs.min() - pad), min(im.shape[1], xs.max() + 1 + pad)
            y0, y1 = max(0, ys.min() - pad), min(im.shape[0], ys.max() + 1 + pad)
        items.append((name, im, int(x0), int(y0), int(x1), int(y1)))
    order = sorted(range(len(items)), key=lambda j: -(items[j][5] - items[j][3]))
    x = y = shelf = 0
    place = {}
    for j in order:
        name, im, x0, y0, x1, y1 = items[j]
        w, h = x1 - x0, y1 - y0
        if x + w > max_w:
            x = 0
            y += shelf + 1
            shelf = 0
        place[j] = (x, y)
        x += w + 1
        shelf = max(shelf, h)
    tw = max_w
    th = y + shelf + 1
    sheet = np.zeros((th, tw, 4), np.uint8)
    out = {}
    for j, (name, im, x0, y0, x1, y1) in enumerate(items):
        px, py = place[j]
        w, h = x1 - x0, y1 - y0
        sheet[py:py + h, px:px + w] = im[y0:y1, x0:x1]
        out[name] = {
            'frame': {'x': px, 'y': py, 'w': w, 'h': h}, 'rotated': False, 'trimmed': True,
            'spriteSourceSize': {'x': int(x0), 'y': int(y0), 'w': w, 'h': h},
            'sourceSize': {'w': im.shape[1], 'h': im.shape[0]},
        }
    used = max(v['frame']['x'] + v['frame']['w'] for v in out.values())
    return sheet[:, :used + 1], out


def build_atlas(name, anims, mod_name, W, H, feet, out_dir, s=S, a=A, pixel=(), extra=None, preview=None, procs=4, meta_extra=None):
    """Desenha todas as animações no traço liso e grava <name>.png e <name>.json (atlas do Phaser
    com as animações, a origem e a escala no mesmo arquivo)."""
    extra = extra or {}
    jobs = []
    cols = max(len(f) for f, _, _ in anims.values())
    for row, (an, (poses, fps, loop)) in enumerate(anims.items()):
        for i, pose in enumerate(poses):
            jobs.append((mod_name, an, i, pose, W, H, s, a, tuple(pixel), extra))
    with Pool(procs) as pool:
        res = pool.map(_job, jobs)
    got = {(an, i): im for an, i, im in res}
    frames = []
    meta_anims = {}
    for row, (an, (poses, fps, loop)) in enumerate(anims.items()):
        for i in range(len(poses)):
            frames.append((str(row * cols + i), got[(an, i)]))
        meta_anims[an] = {'start': row * cols, 'count': len(poses), 'fps': fps, 'loop': loop}
    sheet, fr = pack(frames)
    Image.fromarray(sheet, 'RGBA').save(f'{out_dir}/{name}.png', optimize=True)
    meta = {
        'frames': fr,
        'meta': {'image': f'{name}.png', 'size': {'w': sheet.shape[1], 'h': sheet.shape[0]}, 'scale': '1'},
        'frameWidth': W, 'frameHeight': H, 'originX': feet[0] / W, 'originY': feet[1] / H, 'columns': cols,
        'scale': s, 'anims': meta_anims,
    }
    meta.update(meta_extra or {})
    json.dump(meta, open(f'{out_dir}/{name}.json', 'w'))
    if preview:
        contact(frames, preview, s)
    return sheet, meta


def contact(frames, path, s, bg=(30, 34, 48), cols=8, zoom=1):
    ims = [im for _, im in frames]
    h, w = ims[0].shape[:2]
    rows = (len(ims) + cols - 1) // cols
    out = Image.new('RGBA', (cols * w, rows * h), bg + (255,))
    for j, im in enumerate(ims):
        out.alpha_composite(Image.fromarray(im, 'RGBA'), ((j % cols) * w, (j // cols) * h))
    if zoom != 1:
        out = out.resize((out.width * zoom, out.height * zoom), Image.LANCZOS)
    out.convert('RGB').save(path)

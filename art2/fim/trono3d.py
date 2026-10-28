"""Final II, plano 3: o trono, renderizado em 3D (art9/trono.c) e pintado por cima (rascunho para finais.py)."""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('FIM_OUT', os.path.join(HERE, 'out'))
CACHE = os.path.join(HERE, 'cache')
os.makedirs(CACHE, exist_ok=True)
sys.path.insert(0, os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
from finais import *  # noqa
import rm

TR_CAM = [0.0, 1.25, 6.4, 0.0, 2.0, 0.6, 900.0]
TR_PRM = [3.6, 0.8, 0.4, 1.0, 8.0, 4.0, 0.30, 8.0, 0.8, 1.0, 1.0, 0.25]
TR_RING = (0.0, 0.45, 2.35, 0.78)
DAIS_Y_ = 0.45
G = dict(room=0, throne=1, king=2, mask=3, crown=4, bead=5, emit=6, glass=7)


def tr_render(ss=2, cache=True):
    path = os.path.join(CACHE, f'trono-{W}-ss{ss}.npy')
    if cache and os.path.exists(path) and os.path.getmtime(path) > os.path.getmtime(os.path.join(HERE, 'trono.c')):
        return np.load(path)
    lib = rm.build('trono')
    out = rm.render(lib, W, H, ss, TR_CAM, TR_PRM)
    np.save(path, out)
    return out


def proj(pts):
    x, y, z = rm.project(TR_CAM, W, H, pts)
    return x, y, z


def runes_on_dais(n=14, r=0.71, size=0.085):
    """As runas entre os dois anéis do círculo, deitadas no chão do estrado (projetadas na câmera)."""
    rx, ry, rz, _ = TR_RING
    m = Mask(W, H)
    for i in range(n):
        a = i / n * 2 * math.pi + 0.2
        cu, cv_ = math.cos(a) * r, math.sin(a) * r
        for (p0, p1) in K.rune(i, 0.0, 0.0, size, ang=0.0):
            pts = []
            for (u, v) in (p0, p1):
                # a runa de pé para quem olha de fora do círculo: o "alto" dela aponta para o centro
                tu, tv = -math.sin(a), math.cos(a)
                wu = cu + u * tu - v * math.cos(a) * -1 * 0 + v * (-math.cos(a))
                wv = cv_ + u * tv + v * (-math.sin(a))
                pts.append((rx + wu, ry + 0.002, rz + wv))
            x, y, _ = proj(np.array(pts))
            m.line([(x[0], y[0]), (x[1], y[1])], 1.3)
    return m.array()


def runes_on_chest():
    m = Mask(W, H)
    for i, xw in enumerate(np.linspace(-0.13, 0.13, 7)):
        yw = 1.175
        zz = 0.865 + 0.132 * math.sqrt(max(1 - (xw / 0.205) ** 2 - ((yw - 1.21) / 0.15) ** 2, 0.0)) + 0.004
        x, y, z = proj(np.array([[xw, yw, zz]]))
        hpx = 0.034 * TR_CAM[6] / z[0]
        for a_, b_ in K.rune(i + 1, x[0], y[0], hpx):
            m.line([a_, b_], 1.0)
    return m.array()


def f_trono(rng):
    yy, xx = grid()
    out = tr_render()
    cov = {k: out[..., 10 + v] for k, v in G.items()}
    depth = out[..., 6]
    # o reflexo do estrado polido: borrado e esticado para baixo (como no chão encerado)
    refl = out[..., 3:6]
    refl = np.dstack([ndi.gaussian_filter(refl[..., i], (3.0, 1.2)) for i in range(3)])
    rgb = out[..., 0:3] + refl
    ref = rm.tonemap(rgb, 1.15)
    # ---------------- a máscara (selada em ouro), no lugar da máscara escura do render
    mimg = mask_prop(scale=5, light=(0.0, 0.55, 0.85), crack='gold', warm=(1.0, 0.8, 0.54), cool=(0.36, 0.3, 0.55), amb=0.04)
    mx, my, mz = proj(np.array([[0.0, 1.8435, 0.95]]))
    unit_px = 0.003087 * TR_CAM[6] / mz[0]       # 1 unidade do desenho da máscara em px da tela
    sc = unit_px / 5.0
    holder = np.zeros((H, W, 3), np.float32)
    _, _, pa = place(holder, None, mimg, mx[0], my[0], scale=sc, ox=(60 - 30) * 5, oy=(78.5 - 41) * 5)
    _, _, pa_full = place(holder.copy(), None, mimg, mx[0], my[0], scale=sc, ox=(60 - 30) * 5, oy=(78.5 - 41) * 5)
    vis = np.clip(blur(cov['mask'], 0.6) * 1.4, 0, 1)
    mref, _, pa = place(ref.copy(), None, mimg, mx[0], my[0], scale=sc, ox=(60 - 30) * 5, oy=(78.5 - 41) * 5, k=1.0)
    a = (pa * vis)[..., None]
    ref = ref * (1 - a) + mref * a
    # a beira grudada no capuz: um fio escuro onde a máscara encontra o pano
    edge = np.clip(vis - ndi.grey_erosion(vis, size=3), 0, 1) * 0.5
    ref = ref * (1 - edge[..., None])
    # ---------------- as runas acesas: no círculo do estrado e na barra da couraça
    rd = runes_on_dais() * (cov['room'] > 0.5)
    rc = runes_on_chest() * cov['king']
    ref = put(ref, col(0xffc070), rd * 0.95)
    ref = put(ref, col(0xffb058), rc * 0.85)
    info = dict(cov=cov, depth=depth, rd=rd, rc=rc, mask=pa * vis)
    return ref, info


def tr_final(rng, ref, info):
    yy, xx = grid()
    cov = info['cov']
    fig = np.clip(cov['king'] + cov['mask'] + cov['crown'] + cov['bead'], 0, 1)
    # o vermelho mais fundo e os vidros mais baixos (o que acende é o círculo, o ouro e a máscara)
    r, g, b_ = ref[..., 0], ref[..., 1], ref[..., 2]
    red = sstep(0.05, 0.25, r - np.maximum(g, b_)) * (1 - info['mask'])
    lum = ref @ LUMA
    ref = ref * (1 - red[..., None] * 0.22) + (lum[..., None] * 0.15) * red[..., None] * 0.0
    ref = ref * (1 - (blur(cov['glass'], 1.0) * 0.25)[..., None])
    base = (value_noise(H, W, 80, rng, 2) - 0.5) * 0.4 + np.pi / 2
    flow = flow_of(ref, base, 0.9)
    out, _ = painted(ref, rng, flow, ps=passes(0.62, dry=0.2, err=(0.0, 0.02, 0.035, 0.05), long=1.0), keep=0.18)
    # o encosto (com a sombra) e ele pintados com pincel menor, para a sombra da coroa e da foice não borrar
    thr = np.clip(blur(cov['throne'], 2.0) * 1.4, 0, 1)
    outt, _ = painted(ref, rng, flow, mask=thr, ps=passes(0.42, dry=0.15, err=(0.0, 0.015, 0.03, 0.04), long=1.0), base=1.0, keep=0.15)
    out = out * (1 - thr[..., None]) + outt * thr[..., None]
    fig_d = np.clip(blur(fig, 1.5) * 1.6, 0, 1)
    outf, _ = painted(ref, rng, flow, mask=fig_d, ps=passes(0.30, dry=0.12, err=(0.0, 0.015, 0.025, 0.035), long=0.9), base=1.0)
    out = out * (1 - fig_d[..., None]) + outf * fig_d[..., None]
    sharp = np.clip(info['mask'] + cov['crown'] * 0.7 + cov['bead'] * 0.7 + info['rd'] + info['rc'], 0, 1)
    keep = np.clip(blur(sharp, 0.7) * 0.85 + blur(fig, 0.8) * 0.22, 0, 0.9)
    out = out * (1 - keep[..., None]) + ref * keep[..., None]
    # ---------------- as memórias paradas como estrelas, juntas em volta do trono (ele as chamou) e poucas no resto
    pm = np.zeros((H, W), np.float32)
    n1, n2 = 520, 220
    p1 = np.stack([rng.normal(0, 1.3, n1), 2.1 + rng.normal(0, 0.9, n1), 1.0 + rng.normal(0, 0.9, n1)], -1)
    p2 = np.stack([rng.uniform(-4.2, 4.2, n2), 0.6 + 4.4 * rng.random(n2), rng.uniform(-0.2, 5.4, n2)], -1)
    pts = np.concatenate([p1, p2])
    pts = pts[(pts[:, 1] > DAIS_Y_ + 0.15) & (np.abs(pts[:, 0]) < 4.4) & (pts[:, 2] > 0.05)]
    px, py, pz = proj(pts)
    br = rng.random(len(pts))
    depth = info['depth']
    for x_, y_, z_, b2 in zip(px, py, pz, br):
        if not (2 <= x_ < W - 2 and 2 <= y_ < H - 2):
            continue
        if depth[int(y_), int(x_)] < z_ - 0.05:
            continue
        pr = max(0.5, 0.0075 * TR_CAM[6] / z_ * (0.5 + b2))
        pa_ = 0.12 + 0.6 * b2 ** 2.5
        x0, x1 = int(max(0, x_ - pr * 4)), int(min(W, x_ + pr * 4 + 1))
        y0, y1 = int(max(0, y_ - pr * 4)), int(min(H, y_ + pr * 4 + 1))
        d2 = ((xx[y0:y1, x0:x1] - x_) ** 2 + (yy[y0:y1, x0:x1] - y_) ** 2) / (pr * pr)
        pm[y0:y1, x0:x1] = np.maximum(pm[y0:y1, x0:x1], np.exp(-d2) * pa_)
    out = add_light(out, col(0xffd890), pm * 0.75)
    out = add_light(out, col(0xffa850), blur(pm, 3) * 0.25 + blur(pm, 20) * 0.3)
    # ---------------- os brilhos: a pedra de Âmbar e o círculo, as runas, os vidros, as pedras da coroa
    emit = cov['emit']
    lx, ly, _ = proj(np.array([[0.0, 0.47, 2.35]]))
    dl = np.hypot((xx - lx[0]) / 1.0, (yy - ly[0]) / 0.6)
    out = add_light(out, col(0xffb060), np.exp(-(dl / 60) ** 2) * 0.3 + np.exp(-(dl / 260) ** 2) * 0.10)
    out = add_light(out, col(0xffb060), blur(emit, 3) * 0.45 + blur(emit, 16) * 0.25)
    out = add_light(out, col(0xff9a48), blur(info['rd'], 1.5) * 0.6 + blur(info['rc'], 1.2) * 0.4)
    out = add_light(out, col(0x8a6ad0), blur(cov['glass'], 30) * 0.08)
    # o ar: a luz da pedra subindo na poeira na frente do trono, e os fachos roxos caindo das lancetas
    haze = np.exp(-((xx - lx[0]) / 230.0) ** 2) * np.exp(-np.clip(ly[0] - yy, 0, None) / 330.0) * (yy < ly[0] + 20)
    out = add_light(out, col(0xc8803c), haze * 0.07)
    for wx in (-2.35, 2.35):
        tx, ty, _ = proj(np.array([[wx, 4.6, 0.0]]))
        src = cov['glass'] * (np.abs(xx - tx[0]) < 90)
        out = add_light(out, col(0x6a58b0), shafts(src, (tx[0], ty[0] - 260), n=48, reach=0.9, decay=0.985) * 0.22)
    # as bordas do quadro no escuro (o olho vai para o trono)
    vg = ((xx - 640) / 760) ** 2 + ((yy - 380) / 520) ** 2
    out = out * (1 - 0.38 * np.clip(vg, 0, 1.2) ** 1.4)[..., None]
    # o meio-tom sobe um pouco (o pincel escurece na média)
    out = np.clip(out, 0, 1) ** 0.93
    return finish(out)


def frame(rng):
    ref, info = f_trono(rng)
    return tr_final(rng, ref, info)


if __name__ == '__main__':
    import time
    rng = np.random.default_rng(1000 + sum(map(ord, 'trono')))
    t0 = time.time()
    ref, info = f_trono(rng)
    finish(ref).save(os.path.join(CACHE, 'trono-ref.png'))
    if 'ref' not in sys.argv:
        tr_final(rng, ref, info).save(os.path.join(OUT, 'trono.png'))
    print('ok', round(time.time() - t0, 1))

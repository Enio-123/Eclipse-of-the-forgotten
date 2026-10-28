"""Final III, plano 4: o campo (finais.py, 'campo' e 'campo-perto').

O último fragmento de memória: o vale da Lembrança do prólogo, no verão, no fim da tarde. O sol baixo à
esquerda, as nuvens grandes acesas pela beira, a serra nevada e azulada no fundo, as cerejeiras, o riacho
com a ponte de madeira inteira (no presente ela está quebrada no meio) e o capim alto. Ela de capa
vermelha, de frente, parada no capim a uns seis metros, olhando para ele (a câmera fica na altura dos olhos
dele). A luz vem de trás dela: a borda do capuz e da capa acende, o rosto fica na sombra macia do céu, e a
sombra comprida dela vem pelo capim na direção dele. Sem glória: um campo quieto, o vento leve que leva as
pétalas para a direita. Em campo-perto (por cima, com transparência), o capim e as flores bem perto da
câmera, fora de foco, acesos por trás.

uso: python3 campo.py [ref]   -> out/campo.png e out/campo-perto.png (cache/campo-ref.png com 'ref')
"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('FIM_OUT', os.path.join(HERE, 'out'))
CACHE = os.path.join(HERE, 'cache')
os.makedirs(CACHE, exist_ok=True)
sys.path.insert(0, os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
from finais import *  # noqa
from relevo import spurs, shade, jagged
from ceu import tile_noise, tsample, mips, mip_sample

# Em metros: X para os lados, Y para cima, Z para longe. A câmera fica na altura dos olhos dele (1,5 m), de pé
# no capim; o horizonte passa na altura do rosto dela.
CP_HZ, CP_F, CP_CAM = 404.0, 1000.0, 1.5
CP_SUN = (236.0, 296.0)     # o sol baixo, à esquerda, um pouco acima da serra
CP_HER = (1.2, 6.5)         # ela (X, Z): os pés
CP_WIND = 0.18              # o vento leve da esquerda (o capim e a capa pendem para a direita)
CP_STREAM = [(-10.5, 11.0), (-8.4, 12.6), (-6.6, 13.6), (-5.4, 15.0), (-4.9, 18.0), (-4.6, 21.0), (-4.5, 24.0), (-4.2, 28.0), (-3.4, 34.0),
             (-2.2, 42.0), (-0.6, 54.0), (1.8, 70.0), (5.0, 92.0), (9.4, 125.0), (16.0, 175.0), (26.0, 250.0), (40.0, 360.0)]
CP_STREAM_W = 2.2           # a largura do riacho
CP_WATER_Y = -0.22          # a água fica um pouco abaixo do campo (o barranco)
CP_BRIDGE = (-6.2, -2.8, 24.0)   # a ponte: de X0 a X1, em Z
CP_TILT = -0.07             # a cabeça dela um pouco inclinada para o ombro direito (a esquerda da tela)
CP_SUND = (-0.3727, 0.0996, 0.9226)   # para onde fica o sol, no mundo (de cada ponto, o raio que vai até ele)
# as cerejeiras (X, Z, altura em m): a de trás da ponte, na margem de lá, e a da direita, longe. A da ponte fica
# fora da linha entre ela e o sol (a sombra comprida da copa passa atrás dela, à direita, e ela fica no sol)
CP_TREES = ((30.0, 70.0, 7.0), (-5.6, 36.0, 6.0))


def cp_p(X, Y, Z):
    return (640.0 + X * CP_F / Z, CP_HZ + (CP_CAM - Y) * CP_F / Z)


def cp_z(y):
    """A distância do chão na linha y da tela (abaixo do horizonte)."""
    return CP_CAM * CP_F / np.maximum(np.asarray(y, np.float32) - CP_HZ, 0.5)


def horizon_c(x):
    """A cor do ar no horizonte: o creme dourado embaixo do sol, mais rosado e frio para a direita."""
    x = np.asarray(x, np.float32)
    k = np.exp(-((x - CP_SUN[0]) / 520.0) ** 2)[..., None]
    return mix(col(0xe6d8cc), col(0xfbe4b8), k)


# ---------------------------------------------------------------- o céu
def cp_sky(yy, xx):
    """O céu de verão no fim da tarde: o azul de cima, o creme do horizonte e o claro largo do sol."""
    SX, SY = CP_SUN
    t = np.clip((CP_HZ - yy) / CP_HZ, -0.2, 1.0)
    sky = vgrad([(-0.2, col(0xf4e2c4)), (0.0, col(0xf2e2c8)), (0.1, col(0xdcdcd2)), (0.3, col(0xaec4da)), (0.62, col(0x80a4d0)), (1.0, col(0x5f88c2))], t)
    hz = horizon_c(xx)
    sky = mix(sky, hz, (sstep(0.22, 0.0, t) * 0.65)[..., None])
    d = np.hypot(xx - SX, (yy - SY) * 1.15)
    sky = mix(sky, col(0xffe0a8), (np.exp(-(d / 460.0) ** 2) * 0.55)[..., None])
    sky = mix(sky, col(0xfff0d0), (np.exp(-(d / 170.0) ** 2) * 0.8)[..., None])
    sky = mix(sky, col(0xfffaf0), (np.exp(-(d / 46.0) ** 2) * 0.95)[..., None])
    return sky, d


def cp_puffs(clusters, rng):
    """Os cúmulos: uma cúpula de base reta (com algumas torres que sobem mais) coberta de bolhas em três
    tamanhos, cada bolha sentada na superfície de baixo dela (a couve-flor). As bolhas da beira saem para
    fora e fazem os lóbulos do contorno; a base fica lisa. A altura (para a frente) é a mais alta das
    superfícies em cada ponto; a normal sai dela, com o vinco onde duas bolhas se cruzam."""
    yy, xx = grid()
    out = []
    for cl in clusters:
        cx, base, w, h = cl['cx'], cl['base'], cl['w'], cl['h']
        us = np.linspace(-1.2, 1.2, 289)
        top = np.clip(1 - np.abs(us) ** 2.0, 0, 1) ** (0.5 + cl.get('flat', 0.0))
        for _ in range(cl.get('turrets', 3)):
            tx, tw, th = rng.uniform(-0.55, 0.55), rng.uniform(0.1, 0.24), rng.uniform(0.25, 0.6)
            top = top + th * np.exp(-((us - tx) / tw) ** 2) * np.clip(1 - np.abs(us), 0, 1)
        top = top / top.max()
        u = (xx - cx) / (w / 2)
        v = (base - yy) / h
        tu = np.interp(u, us, top).astype(np.float32)
        e = (tu - v) * h
        e = np.where(v > -0.02, e, -1e3)
        R = h * 0.6
        dome = np.sqrt(np.clip(e * (2 * R - e), 0, None)) * (e > 0)
        dome = np.where(e > R, R + (e - R) * 0.15, dome)
        hgt = dome.copy()
        win = dome > -1
        x0b, x1b = int(cx - w / 2 - h * 0.4), int(cx + w / 2 + h * 0.4)
        y0b, y1b = int(base - h * 1.25), int(base)
        for s, k_up in ((h * 0.27, 0.12), (h * 0.14, 0.08), (h * 0.07, 0.05), (h * 0.036, 0.04)):
            s = max(s, 3.0)
            gxs = np.arange(x0b, x1b, s * 1.05)
            gys = np.arange(y0b, y1b, s * 1.05)
            for by in gys:
                for bx in gxs:
                    px = bx + rng.uniform(-0.4, 0.4) * s
                    py = by + rng.uniform(-0.4, 0.4) * s
                    ix, iy = int(np.clip(px, 0, W - 1)), int(np.clip(py, 0, H - 1))
                    if not (0 <= px < W and 0 <= py < H):
                        continue
                    ev = e[iy, ix]
                    vv = v[iy, ix]
                    if ev < -s * 0.2 or vv < k_up + 0.05:
                        continue
                    r = s * rng.uniform(0.55, 0.95)
                    h0 = dome[iy, ix] - r * 0.5
                    xa, xb = max(0, int(px - r) - 1), min(W, int(px + r) + 2)
                    ya, yb = max(0, int(py - r) - 1), min(H, int(py + r) + 2)
                    d2 = (xx[ya:yb, xa:xb] - px) ** 2 + (yy[ya:yb, xa:xb] - py) ** 2
                    cap = np.where(d2 < r * r, h0 + np.sqrt(np.clip(r * r - d2, 0, None)), -1e3)
                    hgt[ya:yb, xa:xb] = np.maximum(hgt[ya:yb, xa:xb], cap)
        base_l = base + (value_noise(1, W, 30, rng, 2)[0] - 0.5) * cl.get('base_wob', 4.0)
        cut = sstep(base_l[None, :] + 1.0, base_l[None, :] - 2.0, yy)
        inside = ((hgt > 0) | (e > 0)).astype(np.float32)
        cov = blur(inside, 0.7) * cut
        hf = blur(np.clip(hgt, 0, None) * inside, 1.5)
        gy, gx = np.gradient(hf)
        nx, ny = -gx, -gy
        inv = 1.0 / np.sqrt(nx * nx + ny * ny + 1.0)
        nx, ny, nz = nx * inv, ny * inv, inv
        # a forma grande (a cúpula com as bolhas alisadas) manda na luz; as bolhas só modulam
        sg = max(2.0, h * 0.2)
        hb = blur(hf, sg)
        gy, gx = np.gradient(hb)
        bx, by = -gx * 1.3, -gy * 1.3
        inv = 1.0 / np.sqrt(bx * bx + by * by + 1.0)
        k = cl.get('lobe', 0.45)
        mx, my, mz = nx * k + bx * inv * (1 - k), ny * k + by * inv * (1 - k), nz * k + inv * (1 - k)
        inv = 1.0 / np.maximum(np.sqrt(mx * mx + my * my + mz * mz), 1e-4)
        lap = blur(hf, 2.5) - hf
        crease = blur(sstep(0.5, 4.0, lap), 1.0) * cov
        out.append(dict(cov=cov, nx=mx * inv, ny=my * inv, nz=mz * inv, crease=crease, base=base_l, rm=h * 0.3,
                        D=np.clip(blur(inside, h * 0.12) * 1.2, 0, 1) * cut, edge_n=nz))
    return out


def cp_clouds(sky, rng, yy, xx, d):
    """As nuvens grandes do verão, acesas pela beira virada para o sol (o sol está atrás delas, mais baixo):
    a beira de baixo e da esquerda dourada, o corpo na sombra clara do céu (lilás frio em cima, morno embaixo,
    da luz que volta do campo). As de perto do horizonte ficam pequenas, chatas e na névoa."""
    SX, SY = CP_SUN
    clusters = [
        # as pequenas do fundo, por cima da serra
        dict(cx=1040, base=316, w=170, h=30, flat=0.6, haze=0.5),
        dict(cx=890, base=326, w=120, h=20, flat=0.6, haze=0.55),
        dict(cx=500, base=320, w=140, h=24, flat=0.6, haze=0.55),
        dict(cx=1214, base=300, w=200, h=44, flat=0.4, haze=0.45),
        # a comprida de perto do sol: o sol fica embaixo e à esquerda dela
        dict(cx=360, base=236, w=420, h=64, turrets=4, flat=0.7, haze=0.12, rough=0.6),
        # a torre grande do meio para a direita
        dict(cx=800, base=212, w=500, h=196, turrets=4, haze=0.06),
        # um pedaço solto no alto, à esquerda
        dict(cx=130, base=96, w=300, h=52, turrets=2, flat=0.8, haze=0.1, rough=0.65),
    ]
    info = cp_puffs(clusters, rng)
    ref = sky.copy()
    allc = np.zeros((H, W), np.float32)
    dsun = np.hypot(xx - SX, yy - SY)
    near = np.exp(-(dsun / 430.0) ** 2)
    ux, uy = (SX - xx) / np.maximum(dsun, 1.0), (SY - yy) / np.maximum(dsun, 1.0)
    ang = np.clip(dsun / CP_F + 0.8, 0.0, 1.45)
    L = np.stack([ux * np.sin(ang), uy * np.sin(ang), -np.cos(ang)], 0)
    for cl, ci in zip(clusters, info):
        cov, D, rm = ci['cov'], ci['D'], ci['rm']
        nx, ny, nz = ci['nx'], ci['ny'], ci['nz']
        ys, xs = np.nonzero(cov > 0.5)
        if not len(xs):
            continue
        ccx, ccy = float(xs.mean()), float(ys.mean())
        nd = nx * L[0] + ny * L[1] + nz * L[2]
        dif = np.clip((nd + 0.2) / 1.2, 0, 1)
        # a espessura até o sol: quanto mais nuvem entre o ponto e o sol, mais sombra
        th = np.zeros((H, W), np.float32)
        dx, dy = (SX - ccx), (SY - ccy)
        dl = max(1.0, math.hypot(dx, dy))
        for k, step in enumerate((0.3, 0.7, 1.3, 2.2)):
            th += shifted(D, -dx / dl * step * rm, -dy / dl * step * rm) * (0.5 if k < 2 else 0.35)
        # o lado da nuvem virado para o sol inteiro mais claro (a luz atravessa menos nuvem)
        p = ((xx - ccx) * dx + (yy - ccy) * dy) / dl / max(cl['w'] * 0.5, 1.0)
        lit = np.clip(dif * np.exp(-th * 0.45) * (0.45 + 0.75 * sstep(-0.9, 0.7, p)), 0, 1)
        edge = np.clip(1 - ci['edge_n'], 0, 1) ** 1.5
        silver = edge * np.clip(nx * ux + ny * uy, 0, 1) * np.exp(-th * 0.8) * (0.3 + 1.0 * near)
        up = np.clip(-ny, 0, 1)
        dn = np.clip(ny, 0, 1)
        shadow = mix(col(0xaeaec8), col(0x8f9ac2), (up * 0.8)[..., None])
        shadow = mix(shadow, col(0xcdb6ae), (dn * 0.6)[..., None])
        shadow = shadow * (1 - 0.07 * ci['crease'])[..., None]
        light = mix(col(0xffd09a), col(0xfff1da), sstep(0.3, 0.85, lit)[..., None])
        c = mix(shadow, light, sstep(0.04, 0.5, lit)[..., None])
        c = screen(c, col(0xfff2d6), silver * 1.1)
        c = mix(c, col(0xffeccc), (near * 0.26)[..., None])
        c = mix(c, horizon_c(xx), cl['haze'])
        # a base derrete um pouco no ar; a beira de cima fica nítida
        cv = cov * (1 - 0.45 * sstep(ci['base'][None, :] - rm * 0.8, ci['base'][None, :] + 1, yy))
        ref = put(ref, c, cv)
        allc = np.maximum(allc, cov)
    return ref, allc


# ---------------------------------------------------------------- a serra
def cp_range(ref, rng, yy, xx, line, base_y, pal, snow_k, haze, forest=0.0):
    """Uma serra com relevo (os espigões de relevo.spurs). A luz vem de trás e da esquerda: a face virada para o
    sol pega o dourado (a neve fica pêssego) e o resto fica na sombra azul do céu; perto do sol a serra fica em
    contraluz (só as arestas acendem). A névoa come o pé e clareia tudo com o ar do vale."""
    z, dsp, _ = spurs(W, H, rng, line, base_y, None, k=(0.6, 1.2), tilt=0.5, branch=0.8, step=4.0)
    fine = stretched_noise(H, W, 9, 0.35, rng, 3)
    z = blur(z + (fine - 0.5) * 6, 1.0)
    dif_s, nx, ny, nz, _ = shade(z, (-0.86, -0.2, -0.1), k=1.4)
    dif_b, _, _, _, _ = shade(z, (-0.45, -0.3, -0.84), k=1.4)
    wb = np.exp(-((xx - CP_SUN[0]) / 320.0) ** 2)
    dif = dif_s * (1 - wb) + np.clip(dif_b * 1.6, 0, 1) * wb
    m = sstep(line[None, :] - 0.8, line[None, :] + 0.8, yy)
    alt = np.clip((yy - line[None, :]) / np.maximum(base_y - line[None, :], 1.0), 0, 1)
    streak = stretched_noise(H, W, 14, 0.22, rng, 3)
    arete = sstep(4.0, 0.8, dsp) * sstep(0.35, 0.65, streak)
    steep = sstep(0.55, 0.85, np.abs(nx))
    rocky = np.clip(arete * 0.8 + steep * 0.6 + sstep(0.66, 0.86, streak) * 0.5, 0, 1)
    snowline = snow_k + (stretched_noise(H, W, 40, 0.5, rng, 2) - 0.5) * 0.3
    snow = sstep(snowline + 0.08, snowline - 0.12, alt) * sstep(0.8, 0.4, rocky)
    lit = sstep(0.18, 0.62, dif)
    rock = mix(col(pal['rock_s']), col(pal['rock_l']), lit[..., None])
    if forest:
        # a mata nas encostas de baixo: copas escuras em manchas, mais densas embaixo
        fm = sstep(0.55, 0.68, value_noise(H, W, 5, rng, 3) * 0.6 + alt * 0.6) * forest
        tree_c = mix(col(0x2e4a44), col(0x6c7a52), lit[..., None])
        rock = mix(rock, tree_c, fm[..., None])
    snow_c = mix(col(pal['snow_s']), col(pal['snow_l']), lit[..., None])
    snow_c = mix(snow_c, col(0xfff6ea), (sstep(0.75, 1.0, dif) * 0.5)[..., None])
    c = mix(rock, snow_c, snow[..., None])
    hz = haze[0] + (haze[1] - haze[0]) * sstep(0.1, 1.0, alt)
    hz = np.clip(hz + 0.22 * wb, 0, 0.95)
    c = mix(c, horizon_c(xx), hz[..., None])
    return put(ref, c, m), m, lit * snow * m


def cp_mountains(ref, rng, yy, xx):
    """A serra nevada do fundo (bem longe e azulada, o maciço alto atrás dela) e, na frente, uma serra mais
    baixa de pedra e mata, com pouca neve."""
    xs = np.arange(W, dtype=np.float32)
    prof = np.full(W, 340.0, np.float32)
    for px, py, sl, sr in ((40, 300, 0.42, 0.46), (238, 292, 0.44, 0.4), (418, 280, 0.5, 0.58), (602, 232, 0.5, 0.48), (716, 196, 0.64, 0.72),
                           (852, 246, 0.52, 0.46), (1012, 218, 0.7, 0.52), (1150, 254, 0.5, 0.42), (1270, 238, 0.5, 0.5)):
        dx = xs - px
        prof = np.minimum(prof, py + np.where(dx < 0, -dx * sl, dx * sr))
    line = jagged(prof, rng, 10, 60, 5, 0.6)
    pal = dict(rock_s=0x5e6c9c, rock_l=0xc09c98, snow_s=0x8e9fd0, snow_l=0xffdcbc)
    ref, m1, glow1 = cp_range(ref, rng, yy, xx, line, 404.0, pal, 0.5, (0.24, 0.72))
    prof2 = np.full(W, 380.0, np.float32)
    for px, py, sl, sr in ((10, 318, 0.3, 0.32), (190, 300, 0.3, 0.34), (380, 326, 0.26, 0.24), (930, 318, 0.24, 0.3), (1140, 296, 0.32, 0.28)):
        dx = xs - px
        prof2 = np.minimum(prof2, py + np.where(dx < 0, -dx * sl, dx * sr))
    line2 = jagged(prof2, rng, 6, 40, 5, 0.5)
    pal2 = dict(rock_s=0x46586e, rock_l=0x9a9078, snow_s=0x8e9ec2, snow_l=0xf4d8bc)
    ref, m2, _ = cp_range(ref, rng, yy, xx, line2, 404.0, pal2, 0.1, (0.34, 0.62), forest=1.0)
    return ref, np.maximum(m1, m2), glow1 * (1 - m2), line, line2


def cp_hills(ref, rng, yy, xx):
    """Entre a serra e o vale: os morros de mata (a uns 3 km, azul-esverdeados na névoa) e, mais perto, os
    campos subindo em ondas (a 1 km e a 400 m), dourados na crista virada para o sol, com bosques e árvores
    soltas de sombra comprida. As copas fazem a beira de cima dos morros de mata em bolinhas."""
    out_m = np.zeros((H, W), np.float32)
    hz_c = horizon_c(xx)
    sunk = np.exp(-((xx - CP_SUN[0]) / 340.0) ** 2)
    # a mata dos morros de longe
    line = 352.0 - 18.0 * noise1d(W, 300, rng, 3) + (noise1d(W, 80, rng, 2) - 0.5) * 8
    m = Mask(W, H)
    m.poly([(-10, H)] + [(float(x), float(line[x])) for x in range(0, W, 3)] + [(W + 10, H)])
    x = 0.0
    while x < W:
        r = 4.0 * rng.uniform(0.7, 1.3)
        m.ellipse(x, float(line[int(min(x, W - 1))]) - r * rng.uniform(0.2, 0.9), r, r * 0.9)
        x += r * rng.uniform(0.9, 1.3)
    mm = m.array()
    t = np.clip((yy - line[None, :]) / 40.0, 0, 1)
    c = mix(col(0x6c8a66), col(0x34504c), sstep(0.0, 0.7, t)[..., None])
    c = c * (0.88 + 0.24 * value_noise(H, W, 4, rng, 2))[..., None]
    c = mix(c, col(0xe8dc9c), (rim_of(mm, -1.4, -0.6, 0.6) * 0.5)[..., None])
    c = mix(c, hz_c, (0.5 + 0.2 * sunk)[..., None])
    ref = put(ref, c, mm)
    out_m = np.maximum(out_m, mm)
    # os campos em ondas: a crista dourada, a encosta virada para o sol mais clara, o vale entre eles mais frio
    for (y0, amp, cell, hz, n_trees, tsize) in ((372.0, 14.0, 420.0, 0.36, 12, (9, 15)), (388.0, 10.0, 360.0, 0.22, 9, (13, 22))):
        line = y0 - amp * (noise1d(W, cell, rng, 3) - 0.3) * 2.0
        m = Mask(W, H).poly([(-10, H)] + [(float(x), float(line[x])) for x in range(0, W, 3)] + [(W + 10, H)])
        mm = m.array()
        slope = np.gradient(blur(line[None, :].repeat(3, 0), 4.0)[1])
        depth = np.clip((yy - line[None, :]) / 40.0, 0, 1)
        g = mix(col(0xd2cc7c), col(0x7c9c4e), sstep(0.0, 0.8, depth)[..., None])
        g = mix(g, col(0xe8e09a), (np.clip(slope * 3.0, 0, 1)[None, :] * (1 - depth) * 0.6)[..., None])
        g = mix(g, col(0x5a7c58), (np.clip(-slope * 3.0, 0, 1)[None, :] * 0.35)[..., None])
        g = g * (0.92 + 0.16 * value_noise(H, W, 18, rng, 2))[..., None]
        # as cercas vivas: faixas escuras seguindo o morro
        for _ in range(3):
            off = rng.uniform(6, 22)
            x0 = rng.uniform(0, W)
            ln = rng.uniform(160, 420)
            hedge = np.exp(-((yy - (line[None, :] + off)) / 1.3) ** 2) * sstep(x0, x0 + 20, xx) * sstep(x0 + ln, x0 + ln - 20, xx)
            g = mix(g, col(0x3c5a3a), (hedge * 0.75)[..., None])
        g = mix(g, hz_c, (hz + 0.2 * sunk)[..., None])
        ref = put(ref, g, mm)
        out_m = np.maximum(out_m, mm)
        # bosques e árvores soltas em cima do morro
        for k in range(n_trees):
            tx = rng.uniform(-20, W + 20)
            gy = float(line[int(np.clip(tx, 0, W - 1))]) + rng.uniform(3, 16)
            hgt = rng.uniform(*tsize)
            pink = rng.random() < 0.18
            pal = (0x8a5a78, 0xd49ab4, 0xffe2ea) if pink else (0x26402c, 0x5e7a40, 0xdcd690)
            iy, ix = int(np.clip(gy, 0, H - 1)), int(np.clip(tx, 0, W - 1))
            ref = grove(ref, rng, tx, gy, hgt, int(rng.integers(1, 6)), pal, float(hz + 0.1 * sunk[iy, ix]), hz_c[iy, ix], mask=out_m)
    return ref, out_m


def ground_xz(yy, xx):
    """O ponto do chão (X, Z) em cada pixel abaixo do horizonte."""
    Z = cp_z(yy)
    X = (xx - 640.0) * Z / CP_F
    return X, Z


def cast(mask, Zt, GX, GZ):
    """A sombra no chão de uma peça que fica toda na distância Zt (a máscara dela na tela): de cada ponto do
    chão mais perto que ela, o raio que vai para o sol fura o plano dela; a sombra é a máscara nesse furo, mais
    macia quanto mais longe a peça fica do chão (a penumbra: o sol não é um ponto)."""
    sx, sy, sz = CP_SUND
    t = (Zt - GZ) / sz
    ok = (t > 0.05) & (GZ < 590.0)
    t = np.where(ok, t, 0.0)
    px = 640.0 + (GX + sx * t) * CP_F / Zt
    py = CP_HZ + (CP_CAM - sy * t) * CP_F / Zt
    # o raio do disco do sol visto do chão, no plano da peça (px)
    rr = np.clip(t * 0.00465 * CP_F / Zt * 0.6, 0.0, 6.0)
    lv = (0.0, 1.0, 2.5, 6.0)
    out = np.zeros(GZ.shape, np.float32)
    wsum = np.zeros(GZ.shape, np.float32)
    for k, s in enumerate(lv):
        lo = lv[k - 1] if k > 0 else -1.0
        hi = lv[k + 1] if k + 1 < len(lv) else 99.0
        w = np.where(rr <= s, np.clip((rr - lo) / (s - lo), 0, 1), np.clip((hi - rr) / (hi - s), 0, 1)).astype(np.float32)
        if w.max() <= 0:
            continue
        m = blur(mask, s) if s > 0 else mask
        out += ndi.map_coordinates(m, [py, px], order=1, mode='constant') * w
        wsum += w
    return (np.clip(out / np.maximum(wsum, 1e-6), 0, 1) * ok).astype(np.float32)


def shade_ground(ref, S):
    """O chão na sombra: sem o sol, só o céu azul de cima ilumina (mais escuro e mais frio, sem o dourado)."""
    cool = ref * np.array([0.32, 0.36, 0.42], np.float32) + np.array([0.03, 0.045, 0.07], np.float32)
    return mix(ref, cool, S[..., None])


def cp_meadow(ref, rng, yy, xx):
    """O campo plano do vale, da beira dos morros (a uns 500 m) até os pés dele: o verde mais fundo perto, o
    verde dourado longe, as touceiras e as manchas de capim mais alto em perspectiva, o brilho do contraluz
    no capim virado para o sol (à esquerda, perto do horizonte) e as flores em manchas."""
    below = yy > CP_HZ + 2.2
    X, Z = ground_xz(yy, xx)
    Z = np.where(below, Z, 600.0)
    X = np.where(below, X, 0.0)
    lz = np.log(np.clip(Z, 4.0, 600.0))
    g = vgrad([(math.log(4.0), col(0x34481e)), (math.log(9.0), col(0x465a24)), (math.log(25.0), col(0x64722e)), (math.log(80.0), col(0x8a8a40)),
               (math.log(250.0), col(0xaa9e56)), (math.log(600.0), col(0xc0ae6c))], lz)
    # as touceiras (1 m) e as manchas (10 m), amostradas no chão com o borrado de quem vê de longe
    t1 = mips(tile_noise(rng, 512, 24, 4))
    t2 = mips(tile_noise(rng, 512, 60, 3))
    def samp(levels, S, n_px):
        foot = np.maximum(np.abs(np.gradient(Z, axis=0)), (Z / CP_F)) / S * (512 / n_px)
        lod = np.log2(np.maximum(foot, 1e-6)) + 1.0
        return mip_sample(levels, X / S * (512 / n_px), Z / S * (512 / n_px), lod)
    clump = samp(t1, 1.1, 24)
    patch = samp(t2, 9.0, 60)
    g = g * (0.86 + 0.26 * clump)[..., None]
    g = mix(g, g * 0.78 + col(0x2c4a2c) * 0.22, (sstep(0.55, 0.75, patch) * 0.6)[..., None])
    g = mix(g, col(0xb8c060), (sstep(0.42, 0.25, patch) * 0.3)[..., None])
    # o contraluz: o capim entre ele e o sol brilha (as pontas atravessadas pela luz)
    sheen = np.exp(-((xx - CP_SUN[0]) / 560.0) ** 2) * sstep(5.0, 70.0, Z)
    g = mix(g, col(0xead48a), (sheen * 0.5)[..., None])
    g = mix(g, col(0xf6e2a8), (np.exp(-((xx - CP_SUN[0]) / 260.0) ** 2) * sstep(30.0, 300.0, Z) * 0.45)[..., None])
    # o ar: o campo longe some no creme do horizonte
    g = mix(g, horizon_c(xx), (sstep(40.0, 600.0, Z) * 0.55)[..., None])
    ref = put(ref, g, below.astype(np.float32))
    return ref, X, Z


def stream_banks(rng):
    """As duas margens do riacho no chão (X, Z), com a beira irregular."""
    pts = K.spline(CP_STREAM, 24)
    P = np.array(pts, np.float64)
    d = np.gradient(P, axis=0)
    d /= np.maximum(np.hypot(d[:, 0], d[:, 1]), 1e-9)[:, None]
    n = np.stack([d[:, 1], -d[:, 0]], 1)
    wob = (noise1d(len(P), 14, rng, 3) - 0.5) * 0.7
    wob2 = (noise1d(len(P), 14, rng, 3) - 0.5) * 0.7
    half = CP_STREAM_W / 2
    left = P - n * (half + wob[:, None])
    right = P + n * (half + wob2[:, None])
    return P, left, right


def cp_stream(ref, rng, yy, xx, sky_ref, GX, GZ):
    """O riacho: vem do fundo, passa embaixo da ponte e faz a curva para a esquerda, saindo do quadro. A água
    devolve o céu (o reflexo de cima espelhado no horizonte, quebrado pelas marolas que descem com a
    correnteza), mais escura perto (vê-se o fundo) e quase um espelho longe. Logo abaixo da beira de lá fica o
    espelho escuro da margem e do capim dela (com as pontas douradas embaixo), e na beira de cá o fio escuro do
    barranco; embaixo do sol, o caminho de brilho."""
    P, left, right = stream_banks(rng)
    def proj(arr, Y=0.0):
        return [cp_p(float(a), Y, float(b)) for a, b in arr if b > 0.5]
    poly = proj(left) + proj(right)[::-1]
    wm = Mask(W, H).poly(poly).array() * (yy > CP_HZ + 0.5)
    # as marolas: faixas atravessadas no chão (mais finas no sentido da correnteza), em perspectiva
    rip_t = tile_noise(rng, 512, 18, 3)
    rip = tsample(rip_t, GX / 0.9 * 18, GZ / 0.22 * 18)
    rip2 = tsample(rip_t, GX / 0.35 * 18 + 77, GZ / 0.09 * 18 + 31)
    r = (rip - 0.5) * 0.7 + (rip2 - 0.5) * 0.3
    # o reflexo: a linha espelhada no horizonte, entortada pelas marolas. Cada marola inclina a água uns
    # graus, e o espelho dela pega o céu bem mais alto (azul) ou mais baixo (o creme do horizonte): as faixas
    # deitadas de azul e de creme são o que faz a água parecer água. Longe, as marolas somem na média.
    amp = np.clip(CP_F / np.maximum(GZ, 1.0) * 0.012, 0.3, 6.0)
    rn = r / max(float(np.std(r[wm > 0.5])) if (wm > 0.5).any() else 1.0, 1e-3)
    tiltk = 6.0 + 38.0 * (1 - sstep(22.0, 60.0, GZ))
    ry = np.clip(2 * CP_HZ - yy - rn * tiltk, 0, CP_HZ - 1)
    rx = np.clip(xx + r * amp * 0.6, 0, W - 1)
    # (o céu com o brilho largo do sol, que o quadro só ganha no fim: a água perto dele fica dourada)
    dsun = np.hypot(xx - CP_SUN[0], yy - CP_SUN[1])
    sky_s = screen(sky_ref, col(0xfff0d0), np.exp(-(dsun / 260.0) ** 2) * 0.35)
    sky_s = screen(sky_s, col(0xfff4dc), np.exp(-(dsun / 90.0) ** 2) * 0.6)
    refl = np.dstack([ndi.map_coordinates(sky_s[..., i], [ry, rx], order=1, mode='nearest') for i in range(3)])
    ang = np.arctan2(CP_CAM - CP_WATER_Y, np.maximum(GZ, 0.5))
    fres = np.clip(0.98 - ang / 0.32 * 0.45, 0.45, 0.98)
    body = mix(col(0x262c1e), col(0x46483a), sstep(8.0, 30.0, GZ)[..., None])
    wc = mix(body, refl * (0.92 + 0.3 * r)[..., None], fres[..., None])
    # quantos px cada ponto da água fica da beira de cima (a margem de lá) e da de baixo (a de cá)
    wb = wm > 0.5
    td = np.zeros((H, W), np.float32)
    bd = np.zeros((H, W), np.float32)
    for y in range(1, H):
        td[y] = np.where(wb[y], td[y - 1] + 1.0, 0.0)
    for y in range(H - 2, -1, -1):
        bd[y] = np.where(wb[y], bd[y + 1] + 1.0, 0.0)
    span = td + bd
    # o espelho da margem de lá: o barranco e o pé do capim (escuros, na sombra deles) e, mais embaixo, as
    # pontas das folhas (no espelho elas ficam de cabeça para baixo), em fiapos verticais tremidos pela água
    st_t = tile_noise(rng, 512, 40, 2)
    vs = tsample(st_t, (xx + r * amp * 0.8) * 15.0, yy * 0.6)
    cap = 0.64 * span * (1 - 0.5 * sstep(30.0, 90.0, GZ))
    hb = np.minimum(0.34 * CP_F / np.maximum(GZ, 1.0) * (0.6 + 0.8 * vs), cap)
    u = td / np.maximum(hb, 0.7)
    bandk = sstep(1.05, 0.72, u) * wb
    sunk = np.exp(-((xx - CP_SUN[0]) / 300.0) ** 2)
    tipc = mix(col(0x6e6234), col(0xc4a45c), sunk[..., None])
    bcol = mix(col(0x1c2016), tipc, sstep(0.35, 1.0, u)[..., None]) * (0.85 + 0.3 * vs)[..., None]
    wc = mix(wc, bcol, (bandk * 0.9)[..., None])
    # a beira de cá: o barranco e o capim debruçado fazem um fio escuro embaixo
    lip = sstep(1.8, 0.3, bd) * wb
    wc = mix(wc, col(0x23261a), (lip * 0.55)[..., None])
    # o caminho do sol: as cristas das marolas embaixo dele brilham (mais espalhado para perto)
    sy_m = 2 * CP_HZ - CP_SUN[1]
    col_s = np.exp(-((xx - CP_SUN[0]) / (22.0 + 0.25 * np.abs(yy - sy_m))) ** 2) * np.exp(-((yy - sy_m) / 60.0) ** 2)
    rr = (rip * 0.6 + rip2 * 0.4 - 0.5) / max(float(np.std(rip * 0.6 + rip2 * 0.4)), 1e-3)
    glit = sstep(0.9, 2.0, rr) * col_s * wm
    wc = screen(wc, col(0xffe8b8), col_s * 0.4 * (1 - bandk * 0.45))
    wc = screen(wc, col(0xfff6dc), glit)
    # o barranco da margem de lá (de terra, virado para cá, na sombra) logo abaixo da beira
    lft = proj(left)
    bank = Mask(W, H)
    for (x0, y0), (x1, y1), (a, b) in zip(lft[:-1], lft[1:], left[:-1]):
        hbk = (0.0 - CP_WATER_Y) * CP_F / max(b, 0.5) * 0.45
        bank.poly([(x0, y0), (x1, y1), (x1, y1 + hbk), (x0, y0 + hbk)])
    bk = bank.array() * wm
    wc = mix(wc, col(0x30281a), (bk * 0.75)[..., None])
    ref = put(ref, wc, wm)
    return ref, wm, glit, (P, left, right, col_s * wm)


def bridge_parts():
    """As peças da ponte na tela (máscaras): o tabuleiro arqueado, a viga, as cabeceiras, os postes e as
    travessas do corrimão."""
    X0, X1, Z = CP_BRIDGE
    def P(X, Y):
        return cp_p(X, Y, Z)
    def arch(t):
        return 0.52 + 0.2 * math.sin(math.pi * t)
    parts = {k: Mask(W, H) for k in ('deck', 'beam', 'post', 'rail', 'pile')}
    n = 24
    top, bot = [], []
    for i in range(n + 1):
        t = i / n
        X = X0 + (X1 - X0) * t
        top.append(P(X, arch(t)))
        bot.append(P(X, arch(t) - 0.2))
    parts['deck'].poly(top + bot[::-1])
    # a viga de baixo, mais escura, aparecendo embaixo do tabuleiro
    beam = [P(X0 + (X1 - X0) * i / n, arch(i / n) - 0.2) for i in range(n + 1)]
    beam2 = [P(X0 + (X1 - X0) * i / n, arch(i / n) - 0.32) for i in range(n + 1)]
    parts['beam'].poly(beam + beam2[::-1])
    # as cabeceiras: um berço de toras em cada ponta, assentado na margem
    for Xa, Xb in ((X0 - 0.15, X0 + 0.55), (X1 - 0.55, X1 + 0.15)):
        xa, ya = P(Xa, arch(0.0) - 0.2)
        xb, yb = P(Xb, -0.06)
        parts['pile'].poly([(xa, ya), (xb, ya), (xb + 1.5, yb), (xa - 1.5, yb)])
    # o corrimão: postes a cada ~1,15 m e duas travessas
    npost = 5
    for i in range(npost):
        t = i / (npost - 1)
        X = X0 + 0.12 + (X1 - X0 - 0.24) * t
        xa, ya = P(X - 0.05, arch(t) + 0.95)
        xb, yb = P(X + 0.05, arch(t))
        parts['post'].poly([(xa, ya), (xb, ya), (xb, yb), (xa, yb)])
    for hgt, th in ((0.95, 0.07), (0.5, 0.05)):
        up = [P(X0 + 0.1 + (X1 - X0 - 0.2) * i / n, arch(i / n) + hgt) for i in range(n + 1)]
        dn = [P(X0 + 0.1 + (X1 - X0 - 0.2) * i / n, arch(i / n) + hgt - th) for i in range(n + 1)]
        parts['rail'].poly(up + dn[::-1])
    ms = {k: v.array() for k, v in parts.items()}
    sil = np.clip(np.maximum.reduce(list(ms.values())), 0, 1)
    return ms, sil


def cp_bridge(ref, rng, yy, xx, wm):
    """A ponte de madeira, inteira (a do presente está quebrada no meio): o tabuleiro um pouco arqueado nas
    duas vigas, os berços de tora assentados nas margens, o corrimão dos dois lados com os postes. Em
    contraluz: a madeira escura, a beira de cima e o lado esquerdo de cada peça acesos de dourado. O reflexo
    na água logo embaixo (só onde tem água)."""
    X0, X1, Z = CP_BRIDGE
    ms, sil = bridge_parts()
    wood = col(0x382a20) * (0.9 + 0.2 * value_noise(H, W, 3, rng, 2))[..., None]
    img = np.zeros((H, W, 3), np.float32) + wood
    img = mix(img, col(0x261b15), (ms['beam'] * 0.8 + ms['pile'] * 0.3)[..., None])
    # as tábuas: juntas finas no tabuleiro
    xs0, _ = cp_p(X0, 0, Z)
    xs1, _ = cp_p(X1, 0, Z)
    pl = np.abs(np.mod(xx - xs0, (xs1 - xs0) / 26.0) - (xs1 - xs0) / 52.0) > (xs1 - xs0) / 52.0 - 0.7
    img = mix(img, col(0x221812), (pl * ms['deck'] * 0.5)[..., None])
    hz = horizon_c(xx)
    img = mix(img, hz, 0.14)
    # a luz de trás: a beira de cima e a esquerda de cada peça
    rim = np.clip(rim_of(sil, -1.2, -1.0, 0.5) * 1.3, 0, 1)
    img = mix(img, col(0xffcf8c), (rim * 0.85)[..., None])
    ref = put(ref, img, sil)
    # o reflexo: espelhado na linha da água embaixo da ponte, onde tem água, escurecido e quebrado
    ym = cp_p(0, CP_WATER_Y, Z)[1]
    ry = np.clip(2 * ym - yy, 0, H - 1)
    rs = ndi.map_coordinates(sil, [ry, xx], order=1, mode='constant')
    rs = rs * (yy > ym) * wm
    wav = 0.75 + 0.25 * np.sin(yy * 1.3 + value_noise(H, W, 6, rng, 2) * 6)
    ref = ref * (1 - (rs * 0.6 * wav)[..., None]) + col(0x2a221c) * (rs * 0.6 * wav)[..., None]
    return ref, sil


def fallen_petals(ref, rng, x, gy, h, haze, wide, S):
    """As pétalas caídas no chão em volta do pé da cerejeira (mais para o lado de onde o vento as leva)."""
    yy, xx = grid()
    hz_c = horizon_c(xx)
    for _ in range(int(h * 2.0)):
        px, py = x + rng.normal(h * 0.1, h * 0.4 * wide), gy + rng.normal(0, h * 0.03)
        r = max(0.6, h * rng.uniform(0.004, 0.007))
        iy, ix = int(np.clip(py, 0, H - 1)), int(np.clip(px, 0, W - 1))
        c = mix(col(0xf2c4d2), hz_c[iy, ix], haze)
        c = mix(c, c * np.array([0.4, 0.44, 0.52], np.float32), S[iy, ix])
        ref = put(ref, c, np.exp(-(((xx - px) / r) ** 2 + ((yy - py) / (r * 0.6)) ** 2)) * 0.75)
    return ref


def blob_mask(rng, cx, cy, rx, ry, n=7, rough=0.3):
    """Uma copa irregular: círculos encostados num elipse, cada um de um tamanho."""
    m = Mask(W, H)
    m.ellipse(cx, cy + ry * 0.1, rx * 0.8, ry * 0.75)
    for _ in range(n):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0.35, 0.6)
        px, py = cx + math.cos(a) * rx * (1 - rr * 0.7), cy + math.sin(a) * ry * (1 - rr * 0.7)
        m.ellipse(px, py, rx * rr * rng.uniform(0.8, 1.2), ry * rr * rng.uniform(0.8, 1.2))
    return m.array()


def grove(ref, rng, x, gy, h, n, pal, haze, hz_c, mask=None):
    """Um bosque de longe: algumas copas de alturas diferentes, uma na frente da outra, o lado do sol aceso, o
    tronco aparecendo só embaixo das maiores e a sombra comprida no chão, para a frente e para a direita."""
    yy, xx = grid()
    allm = np.zeros((H, W), np.float32)
    xs = np.sort(rng.normal(x, h * 0.35 * max(1, n) ** 0.5, n))
    for tx in xs:
        th = h * rng.uniform(0.6, 1.05)
        tw = th * rng.uniform(0.34, 0.48)
        cy = gy - th + tw * 0.9
        cm = blob_mask(rng, tx, cy, tw, tw * 0.9, 6)
        if th > 14:
            trunk = Mask(W, H).line([(tx, gy + 1), (tx + rng.normal(0, 0.6), cy + tw * 0.5)], max(1.0, th * 0.05)).array()
        else:
            trunk = np.zeros((H, W), np.float32)
        sh = Mask(W, H).ellipse(tx + th * 0.8, gy + th * 0.06, th * 0.9, max(1.2, th * 0.07)).array()
        ref = ref * (1 - (blur(sh, 1.0) * (0.3 * (1 - haze)))[..., None])
        side = np.clip((xx - tx) / max(tw, 1.0), -1, 1)
        c = mix(col(pal[1]), col(pal[0]), sstep(-0.7, 0.6, side)[..., None])
        c = c * (0.86 + 0.28 * value_noise(H, W, max(1.2, tw * 0.3), rng, 2))[..., None]
        c = mix(c, col(pal[2]), (np.clip(rim_of(cm, -1.3, -0.7, 0.5) * 1.2, 0, 1) * 0.75)[..., None])
        c = mix(c, hz_c, haze)
        ref = put(ref, mix(col(0x2e241c), hz_c, haze), trunk * 0.9)
        ref = put(ref, c, cm)
        allm = np.maximum(allm, np.maximum(cm, trunk))
    if mask is not None:
        np.maximum(mask, allm, out=mask)
    return ref


def cherry_tree(rng, x, gy, h, haze=0.0, lean=0.04, wide=1.0):
    """Uma cerejeira em flor: o tronco curto e grosso, um pouco torto, abrindo em galhos largos; a copa larga
    e baixa feita de nuvens de flor na ponta de cada galho, com vãos entre elas por onde aparecem a madeira e
    o céu. O sol de trás e da esquerda atravessa a beira dos cachos virada para ele (quase branca, morna); o
    alto de cada nuvem fica rosa claro e a barriga lilás. Devolve a camada (cor pré-multiplicada, alfa) e a
    silhueta (para a sombra)."""
    yy, xx = grid()
    hz_c = horizon_c(xx)
    tw = max(2.0, h * 0.07)
    fork = (x + lean * h, gy - h * 0.3)
    # o tronco e os galhos: cada galho grosso dobra no meio e solta dois finos; a nuvem de flor fica na ponta
    wood = Mask(W, H)
    wood.line([(x - tw * 0.15, gy + 1), (x + lean * h * 0.5, gy - h * 0.15), fork], tw)
    wood.line([(x - tw * 0.95, gy + 1.5), (x + tw * 0.95, gy + 1.5)], tw * 0.55)
    clusters = []
    nl = 4
    for k in range(nl):
        a = -math.pi / 2 + (k - (nl - 1) / 2) * 0.62 * wide + rng.normal(0, 0.1)
        ln = h * rng.uniform(0.32, 0.42)
        mid = (fork[0] + math.cos(a) * ln * 0.5, fork[1] + math.sin(a) * ln * 0.5)
        a2 = a + rng.normal(0, 0.15) - 0.15 * math.copysign(1, math.cos(a))
        end = (mid[0] + math.cos(a2) * ln * 0.5 * wide, mid[1] + math.sin(a2) * ln * 0.45)
        wood.line([fork, mid], tw * 0.62)
        wood.line([mid, end], tw * 0.38)
        clusters.append((end[0], end[1], h * rng.uniform(0.15, 0.2)))
        for j in range(2):
            b = a2 + (j * 2 - 1) * rng.uniform(0.35, 0.7)
            l2 = ln * rng.uniform(0.28, 0.42)
            tip = (mid[0] + math.cos(b) * l2 * wide, mid[1] + math.sin(b) * l2)
            wood.line([mid, tip], tw * 0.22)
            clusters.append((tip[0], tip[1], h * rng.uniform(0.11, 0.15)))
    cx0 = float(np.mean([c[0] for c in clusters]))
    cy0 = float(np.mean([c[1] for c in clusters]))
    clusters.append((cx0, cy0 - h * 0.04, h * 0.2))
    wm = wood.array()
    ux, uy = CP_SUN[0] - cx0, CP_SUN[1] - cy0
    ul = max(1.0, math.hypot(ux, uy))
    ux, uy = ux / ul, uy / ul
    cov = np.zeros((H, W), np.float32)
    shade_v = np.zeros((H, W), np.float32)
    grain = value_noise(H, W, max(1.5, h * 0.012), rng, 2)
    for (bx, by, rc) in clusters:
        # a nuvem: bolinhas de flor dentro do raio, mais na casca
        cm = np.zeros((H, W), np.float32)
        nb = int(14 + rc * 0.25)
        for _ in range(nb):
            a = rng.uniform(0, 2 * math.pi)
            rr = math.sqrt(rng.uniform(0.0, 1.0)) * rc * 0.75
            px, py = bx + math.cos(a) * rr * 1.25, by + math.sin(a) * rr * 0.85
            br = rc * rng.uniform(0.28, 0.45)
            x0, x1 = max(0, int(px - br - 2)), min(W, int(px + br + 3))
            y0, y1 = max(0, int(py - br - 2)), min(H, int(py + br + 3))
            if x0 >= x1 or y0 >= y1:
                continue
            d = np.hypot(xx[y0:y1, x0:x1] - px, yy[y0:y1, x0:x1] - py)
            reff = br * (0.8 + 0.4 * grain[y0:y1, x0:x1])
            cm[y0:y1, x0:x1] = np.maximum(cm[y0:y1, x0:x1], sstep(reff + 0.8, reff - 0.8, d))
        # a luz da nuvem inteira: o lado do sol claro, a barriga escura
        u = np.clip(((xx - bx) * ux + (yy - by) * uy) / max(rc, 1.0), -1.5, 1.5)
        v = np.clip((yy - by) / max(rc, 1.0), -1.5, 1.5)
        sv = np.clip(0.5 + 0.45 * u - 0.35 * v, 0, 1)
        new = cm * (1 - cov)
        shade_v = shade_v * (1 - new) + sv * new
        cov = np.maximum(cov, cm)
    holes = sstep(0.7, 0.78, value_noise(H, W, max(1.5, h * 0.03), rng, 2))
    cov = cov * (1 - holes * 0.85)
    c = mix(col(0x8c5676), col(0xd890b0), sstep(0.1, 0.6, shade_v)[..., None])
    c = mix(c, col(0xf6c8d6), (sstep(0.55, 0.95, shade_v) * 0.85)[..., None])
    edge = np.clip(rim_of(cov, ux * 1.6, uy * 1.6, 0.6) * 1.4, 0, 1)
    c = mix(c, col(0xfff2ea), (edge * 0.85)[..., None])
    c = c * (0.88 + 0.24 * grain)[..., None]
    c = mix(c, hz_c, haze)
    wc = mix(col(0x30221c), hz_c, haze * 0.8)
    wc = mix(wc, col(0xe0a468), (np.clip(rim_of(wm, ux * 1.2, uy * 1.2, 0.5) * 1.4, 0, 1) * 0.75)[..., None])
    img = np.zeros((H, W, 3), np.float32)
    a = np.zeros((H, W), np.float32)
    for cc, m in ((wc, wm), (c, cov), (wc, wm * holes * (1 - sstep(0.3, 0.7, shade_v)) * 0.7)):
        img = put(img, cc, m)
        a = a * (1 - np.clip(m, 0, 1)) + np.clip(m, 0, 1)
    return img, a, np.maximum(cov, wm)


def cp_grass(ref, rng, n, zmin, zmax, ymax=820.0, flowers=0.0, water=None, path=None, shade=None):
    """O capim alto do verão em folhas soltas, do fundo para a frente: cada folha nasce num ponto do chão
    (X, Z) e sobe pendendo para a direita (o vento), escura no pé, onde o capim faz sombra, e clara na ponta,
    que o sol de trás atravessa (mais dourada para o lado do sol). Na sombra das árvores e da ponte a ponta não
    acende: fica só o azul fraco do céu. Algumas são hastes com a espiga e, em manchas, as flores (margaridas,
    botões amarelos e trevo). Devolve a camada (cor pré-multiplicada, alfa)."""
    L = Layer(W, H)
    y0 = CP_HZ + CP_CAM * CP_F / zmax
    y1 = min(ymax, CP_HZ + CP_CAM * CP_F / zmin)
    # mais folhas nas linhas de longe (finas) que nas de perto (grandes)
    u = rng.random(n)
    ys = CP_HZ + (y0 - CP_HZ) * ((y1 - CP_HZ) / (y0 - CP_HZ)) ** u
    xs = rng.uniform(-40, W + 40, n)
    order = np.argsort(ys)
    fl_noise = value_noise(H, W, 90, rng, 2)
    for i in order:
        x, y = float(xs[i]), float(ys[i])
        Z = CP_CAM * CP_F / (y - CP_HZ)
        X = (x - 640.0) * Z / CP_F
        if path is not None and abs(X - path(Z)) < 0.32 and rng.random() < 0.8:
            continue
        f = CP_F / Z
        stalk = rng.random() < 0.07
        hb = rng.uniform(0.62, 0.85) if stalk else rng.uniform(0.22, 0.52)
        lean = CP_WIND + rng.normal(0, 0.22)
        bend = rng.normal(0.2, 0.35)
        L_px = hb * f
        wd = max(0.7, (0.008 if not stalk else 0.004) * f)
        tx, ty = x + math.sin(lean) * L_px, y - math.cos(lean) * L_px
        iy, ix = int(np.clip(y, 0, H - 1)), int(np.clip(x, 0, W - 1))
        if water is not None and water[iy, ix] > 0.5:
            continue
        sh = float(shade[iy, ix]) if shade is not None else 0.0
        base = ref[iy, ix]
        sunk = math.exp(-((x - CP_SUN[0]) / 560.0) ** 2)
        dark = base * rng.uniform(0.42, 0.66)
        tip = mix(base * 1.05, col(0xe8e294) if not stalk else col(0xf0dca0), (0.25 + 0.5 * sunk + rng.uniform(-0.1, 0.15)) * (1 - sh))
        if rng.random() < 0.14:
            tip = mix(tip, col(0xc8b878), 0.5 * (1 - sh))
        if sh > 0:
            tip = mix(tip, base * 1.3 + col(0x1a2636) * 0.12, sh * 0.8)
        ang = math.atan2(ty - y, tx - x)
        cx, cy = (x + tx) / 2, (y + ty) / 2
        L.stroke(cx, cy, ang, L_px, wd, np.clip(dark, 0, 1), rng.uniform(0.75, 0.95), rng, 0.0, 0.0, 0.85, bend, 0.6, col2=np.clip(tip, 0, 1))
        if stalk and f > 30:
            # a espiga: um grão comprido na ponta, claro do lado do sol
            head = col(0xd8c088) * (0.8 + 0.3 * sunk)
            head = mix(head, base * 1.4 + col(0x1a2636) * 0.1, sh * 0.85)
            L.stroke(tx, ty, ang, max(2.0, 0.06 * f), max(1.0, 0.012 * f), np.clip(head, 0, 1), 0.9, rng, 0.0, 0.0, 0.5, 0.0, 0.5)
        if flowers and f > 20 and rng.random() < flowers * (0.15 + 0.85 * sstep(0.45, 0.7, fl_noise[iy, ix])):
            kind = rng.random()
            hf = rng.uniform(0.14, 0.34)
            fx, fy = x + math.sin(lean) * hf * f * 0.5, y - hf * f
            r = rng.uniform(0.012, 0.02) * f
            dim = 1.0 - 0.5 * sh
            L.stroke((x + fx) / 2, (y + fy) / 2, math.atan2(fy - y, fx - x), hf * f, max(0.6, 0.003 * f), np.clip(dark, 0, 1), 0.85, rng, 0.0, 0.0, 0.6, 0.1, 0.5)
            if kind < 0.5:
                L.dab(fx, fy, max(0.8, r), np.clip(col(0xfbf6ea) * (0.85 + 0.2 * sunk) * dim, 0, 1), 0.95, 0.6)
                L.dab(fx, fy, max(0.5, r * 0.35), col(0xe8b830) * dim, 0.95, 0.4)
            elif kind < 0.78:
                L.dab(fx, fy, max(0.7, r * 0.75), col(0xf2cc38) * dim, 0.95, 0.5)
            else:
                L.dab(fx, fy, max(0.7, r * 0.8), col(0xc87aa8) * dim, 0.9, 0.6)
    return L


def tilt(p, c=(0.0, -140.0), a=CP_TILT):
    x, y = p[0] - c[0], p[1] - c[1]
    ca, sa = math.cos(a), math.sin(a)
    return (c[0] + x * ca - y * sa, c[1] + x * sa + y * ca)


def cp_her():
    """Ela, inteira, de frente, parada no capim (os pés em 0, em cm): o capuz com a ponta macia caída atrás da
    cabeça, que o vento leva um pouco para a direita da tela; a capa vermelha caindo dos ombros até perto do
    chão, com a barra puxada para a direita pelo vento e aberta na frente, onde aparecem o vestido escuro e as
    mãos juntas; a cabeça um pouco inclinada, olhando para ele."""
    X, Z = CP_HER
    fx, fy = cp_p(X, 0, Z)
    s = CP_F / Z * 1.64 / 176.0
    f = Figure(fx, fy, s)
    f.shape('cape', [(-21, -141), (-25.5, -128), (-28.5, -100), (-30.5, -70), (-31.5, -40), (-31.5, -14), (-28, -9), (-23, -12), (-17, -8), (-11, -11),
                     (-4, -8), (3, -10), (10, -7), (17, -10), (24, -6), (32, -9), (39, -10), (43, -14), (39, -42), (34, -72), (29.5, -102), (25.5, -129),
                     (21, -141), (10, -146), (-10, -146)], 4)
    f.shape('dress', [(-3, -138), (3, -138), (5, -112), (7.5, -94), (7, -80), (6, -60), (7, -30), (9, -5), (-6, -5), (-5, -30), (-6, -60), (-7, -80),
                      (-7.5, -94), (-5, -112)], 4)
    f.ell('collar', 0, -136, 4.4, 2.6)
    f.ell('hands', -2.0, -88, 3.4, 2.7).ell('hands', 1.8, -86.6, 3.1, 2.6)
    hood = [(-17, -136), (-18.5, -152), (-16.5, -167), (-11, -177), (-4, -182.5), (4, -185), (11, -189), (16, -192), (16.5, -188), (13, -181),
            (15.5, -170), (17.5, -157), (17.5, -146), (19, -136), (8, -132), (-8, -132)]
    f.shape('hood', [tilt(p) for p in hood], 4)
    cx, cy = tilt((-0.4, -156.0))
    f.ell('inside', cx, cy, 10.2, 12.4)
    cx, cy = tilt((-0.4, -155.6))
    f.ell('face', cx, cy, 7.4, 9.6)
    return f, (fx, fy, s)


def cp_her_paint(ref, rng, f, info, xx, yy):
    """A luz dela: o sol atrás e à esquerda (para quem olha) acende a borda do capuz e o ombro desse lado e
    atravessa o pano fino da barra (o vermelho fica laranja na beira); a frente fica na sombra macia, clareada
    pelo céu azul de trás dele e pelo verde do capim. A capa tem corpo: dá a volta nela (mais quente do lado do
    sol, mais fria e escura do outro), cai em poucas dobras largas dos ombros até a barra, sobe por cima dos
    antebraços até as mãos juntas na frente e faz sombra no vestido na abertura. O capuz faz sombra nos ombros e
    a beira dele em volta do rosto pega o céu. O rosto fundo no capuz, morno e sem dureza: os olhos escuros
    olhando para a câmera, as bochechas, o quase sorriso, a franja e o cabelo curto dos lados (o corte dela)."""
    fx, fy, s = info
    ms = f.masks()
    zero = np.zeros((H, W), np.float32)
    cape, hood, dress = ms.get('cape', zero), ms.get('hood', zero), ms.get('dress', zero)
    hands, inside = ms.get('hands', zero), ms.get('inside', zero)
    face = ms.get('face', zero) * inside
    sil = np.clip(np.maximum.reduce([cape, hood, dress]), 0, 1)
    cloth = np.clip(cape + hood, 0, 1)
    d_in = dress * (1 - hood)
    shx, shy = f.T((0, -150))
    ang = np.arctan2(xx - shx, np.maximum(yy - shy, 1.0))
    t = np.clip((yy - shy) / (150 * s), 0, 1)
    # as dobras: poucas largas, que nascem nos ombros e abrem para a barra, e umas finas por cima; mais
    # fundas embaixo (o pano solto) do que nos ombros (o pano esticado)
    n1 = value_noise(H, W, 10, rng, 2)
    folds = 0.5 + 0.32 * np.sin(ang * 13 + 1.4 * n1) + 0.18 * np.sin(ang * 31 + 2.0 * n1 + 1.3)
    depth = 0.35 + 0.65 * t
    v = 0.5 + (folds - 0.5) * depth
    red = mix(col(0x3a0c14), col(0x7a1c24), v[..., None])
    # o volume: u vai de -1 (a beira do lado do sol) a +1 (a de lá)
    half = (21.0 + 16.0 * t) * s
    u = np.clip((xx - (fx + 5.75 * t * s)) / half, -1.3, 1.3)
    red = mix(red, red * 0.7 + col(0x2e2440) * 0.12, (sstep(0.15, 0.95, u) * 0.75)[..., None])
    red = mix(red, col(0xa02c24), (sstep(-0.5, -1.05, u) * 0.5)[..., None])
    # a capa por cima dos antebraços: a dobra que sobe do cotovelo até as mãos pega o céu em cima e faz sombra
    # embaixo
    for sd in (-1, 1):
        p0, p1 = f.T((sd * 16.0, -108.0)), f.T((sd * 4.5, -91.0))
        arm = blur(Mask(W, H).line([p0, p1], 4.5 * s).array(), 1.5 * s)
        under = np.clip(shifted(arm, 0, 3.5 * s) - arm, 0, 1)
        red = mix(red, red * 1.3 + col(0x201a2a) * 0.1, (arm * 0.45)[..., None])
        red = mix(red, red * 0.62, (under * 0.6)[..., None])
    # a sombra do capuz nos ombros e no alto da capa
    hsh = blur(np.clip(shifted(hood, 0.8 * s, 3.5 * s) - hood, 0, 1), 1.2 * s)
    red = mix(red, red * 0.6, (hsh * 0.7)[..., None])
    # a beira da capa na abertura da frente: o pano dobra e pega o céu
    near_d = np.clip(blur(d_in, 1.2 * s) - d_in, 0, 1) * cape * (1 - hood)
    red = mix(red, red * 1.4, (np.clip(near_d * 2.0, 0, 1) * 0.5)[..., None])
    # o capuz: um domo; o alto e o lado do sol mais claros, a beira em volta do rosto mais clara (o céu)
    hx0, hy0 = f.T(tilt((0.0, -160.0)))
    uh = np.clip((xx - hx0) / (18.0 * s), -1.3, 1.3)
    vh = np.clip((yy - hy0) / (22.0 * s), -1.3, 1.3)
    hood_c = mix(col(0x5a141c), col(0x7e1e26), sstep(0.6, -0.8, vh)[..., None])
    hood_c = mix(hood_c, hood_c * 0.7 + col(0x2e2440) * 0.1, (sstep(0.1, 0.95, uh) * 0.7)[..., None])
    hood_c = mix(hood_c, col(0xa02c24), (sstep(-0.45, -1.05, uh) * 0.5)[..., None])
    hood_c = hood_c * (0.92 + 0.16 * n1)[..., None]
    rimh = np.clip(blur(inside, 1.1 * s) - inside, 0, 1) * hood
    hood_c = mix(hood_c, col(0x9a3030), (np.clip(rimh * 2.2, 0, 1) * 0.55)[..., None])
    ref = put(ref, red, cape * (1 - hood))
    ref = put(ref, hood_c, hood)
    # o vestido escuro na abertura, com a sombra da capa nas duas beiras
    dc = mix(col(0x1e1c28), col(0x34303e), (1 - t)[..., None])
    dsh = np.clip(blur(cloth * (1 - d_in), 1.6 * s), 0, 1) * d_in
    dc = mix(dc, dc * 0.55, (dsh * 0.8)[..., None])
    ref = put(ref, dc, d_in)
    ref = put(ref, col(0x6a6270), ms.get('collar', zero) * (1 - hood) * 0.8)
    ref = put(ref, col(0x2a1a20), np.clip(rim_of(hands, 0, 1.2, 0.4), 0, 1) * dress * 0.6)
    ref = put(ref, col(0xb08472), hands)
    ref = put(ref, col(0xc89a86), np.clip(rim_of(hands, 0, -1.0, 0.4), 0, 1) * hands * 0.6)
    # o capuz por dentro: o forro na sombra funda, um pouco mais claro embaixo (a volta da luz no capim)
    hx, hy = f.T(tilt((-0.4, -155.6)))
    r = 9.6 * s
    lin = mix(col(0x1a060a), col(0x3a1016), sstep(hy - 2 * r * 0.4, hy + r * 1.2, yy)[..., None])
    ref = put(ref, lin, inside * hood)
    # o rosto: a pele morna na sombra, mais clara no meio (o céu de frente), mais escura na beira (fundo no
    # capuz) e a volta morna do capim embaixo do queixo
    ref = put(ref, col(0xb4846f), face)
    ref = put(ref, col(0xd0a490), face * np.exp(-(((xx - hx) / (4.8 * s)) ** 2 + ((yy - (hy - 1.2 * s)) / (5.6 * s)) ** 2)) * 0.55)
    fd = np.hypot((xx - hx) / (7.4 * s), (yy - hy) / (9.6 * s))
    ref = put(ref, col(0x7e5446), face * sstep(0.62, 1.0, fd) * 0.5)
    ref = put(ref, col(0xb07462), face * sstep(hy + 3 * s, hy + 9 * s, yy) * 0.3)
    for ex in (-0.44, 0.44):
        ref = put(ref, col(0xc87c6c), face * np.exp(-(((xx - (hx + ex * r)) / (0.2 * r)) ** 2 + ((yy - (hy + 0.3 * r)) / (0.14 * r)) ** 2)) * 0.3)
    fr = Mask(W, H).poly([(hx - r * 0.82, hy - r * 0.15), (hx - r * 0.72, hy - r * 0.8), (hx, hy - r * 1.02), (hx + r * 0.74, hy - r * 0.78), (hx + r * 0.84, hy - r * 0.12),
                          (hx + r * 0.42, hy - r * 0.36), (hx, hy - r * 0.3), (hx - r * 0.44, hy - r * 0.38)]).array()
    sides = Mask(W, H).poly([(hx - r * 0.86, hy - r * 0.3), (hx - r * 0.6, hy - r * 0.3), (hx - r * 0.62, hy + r * 0.62), (hx - r * 0.9, hy + r * 0.56)]).poly(
        [(hx + r * 0.86, hy - r * 0.3), (hx + r * 0.6, hy - r * 0.3), (hx + r * 0.62, hy + r * 0.62), (hx + r * 0.9, hy + r * 0.56)]).array()
    hair = np.clip(fr + sides, 0, 1) * inside
    ref = put(ref, mix(col(0x2e1c14), col(0x46301f), sstep(hy - r, hy - r * 0.3, yy)[..., None] * 0.6), blur(hair, 0.4))
    # a sombra da franja na testa e a luz de trás na beira do cabelo do lado do sol
    ref = put(ref, col(0x7a5040), np.clip(shifted(fr, 0, 1.2 * s) - fr, 0, 1) * face * 0.5)
    ref = put(ref, col(0xc8885a), rim_of(hair, -1.0, -0.6, 0.4) * hair * 0.5)
    # os olhos olhando para ele (de frente): a íris escura, a linha de cima dos cílios, um ponto do céu;
    # a sobrancelha fraca, o nariz só em sombra e a boca num quase sorriso
    for ex in (-0.36, 0.36):
        ecx, ecy = hx + ex * r, hy + 0.06 * r
        e = np.exp(-(((xx - ecx) / (0.13 * r)) ** 2 + ((yy - ecy) / (0.08 * r)) ** 2))
        ref = put(ref, col(0x2a1a1c), e * 0.85 * inside)
        lid = np.exp(-(((xx - ecx) / (0.19 * r)) ** 2 + ((yy - (ecy - 0.07 * r)) / (0.035 * r)) ** 2))
        ref = put(ref, col(0x24161a), lid * 0.6 * face)
        cl = np.exp(-(((xx - (ecx - 0.04 * r)) / (0.04 * r)) ** 2 + ((yy - (ecy - 0.02 * r)) / (0.04 * r)) ** 2))
        ref = put(ref, col(0xd8dce8), cl * 0.45 * face)
        brow = np.exp(-(((xx - ecx) / (0.22 * r)) ** 2 + ((yy - (ecy - 0.27 * r)) / (0.045 * r)) ** 2))
        ref = put(ref, col(0x5a3a30), brow * 0.35 * face * (1 - hair))
    ref = put(ref, col(0x9a6656), np.exp(-(((xx - (hx + 0.06 * r)) / (0.09 * r)) ** 2 + ((yy - (hy + 0.42 * r)) / (0.13 * r)) ** 2)) * 0.4 * face)
    ref = put(ref, col(0x8a4c4c), np.exp(-(((xx - hx) / (0.17 * r)) ** 2 + ((yy - (hy + 0.67 * r)) / (0.04 * r)) ** 2)) * 0.55 * face)
    for ex in (-0.17, 0.17):
        ref = put(ref, col(0x8a4c4c), np.exp(-(((xx - (hx + ex * r)) / (0.05 * r)) ** 2 + ((yy - (hy + 0.63 * r)) / (0.04 * r)) ** 2)) * 0.45 * face)
    ref = put(ref, col(0xc89080), np.exp(-(((xx - hx) / (0.15 * r)) ** 2 + ((yy - (hy + 0.76 * r)) / (0.04 * r)) ** 2)) * 0.25 * face)
    # o contraluz: a beira de cima e a do lado do sol acesas, o pano fino da barra e da beira atravessado
    rim_l = rim_of(sil, -2.2, -1.2, 0.7)
    top = np.clip(sil - shifted(sil, 0, 2.2), 0, 1)
    ref = put(ref, col(0xffb87a), np.clip(rim_l * 1.2, 0, 1) * 0.9)
    ref = put(ref, col(0xffd8a0), blur(top, 0.5) * 0.75 * sstep(fx + 10 * s, fx - 14 * s, xx))
    thin = np.clip(rim_of(cloth, -5.0, 0, 1.4) - rim_l, 0, 1) * (1 - inside)
    ref = put(ref, col(0xd0402e), thin * 0.45)
    hem = cape * sstep(fy - 22 * s, fy - 6 * s, yy)
    ref = put(ref, col(0xc23a2a), hem * 0.3)
    # o lado de lá (a direita da tela) só com o fio frio do céu
    ref = put(ref, col(0x6e6c8a), rim_of(sil, 1.6, -0.4, 0.6) * 0.18)
    return ref, sil, np.clip(face + inside * 0.5 + hands, 0, 1)


def her_shadow(rng, sil, info):
    """A sombra comprida dela no capim: o sol baixo atrás dela estica a sombra para a frente e para a direita;
    no quadro só cabe o começo, a sombra da barra da capa, do pé até a beira de baixo."""
    fx, fy, s = info
    X, Z = CP_HER
    pts = []
    for hgt, half in ((0.0, 0.34), (0.08, 0.36), (0.16, 0.37), (0.26, 0.37), (0.4, 0.36)):
        for side in (-1, 1):
            pts.append((X + side * half + 3.74 * hgt, Z - 9.25 * hgt, side, hgt))
    left = [cp_p(a, 0, max(b, 0.3)) for a, b, sd, _ in pts if sd < 0]
    right = [cp_p(a, 0, max(b, 0.3)) for a, b, sd, _ in pts if sd > 0]
    m = Mask(W, H).poly(left + right[::-1]).array()
    m = blur(m, 4.0) * (1 - sil)
    yy, xx = grid()
    m = m * (0.65 + 0.35 * value_noise(H, W, 6, rng, 2)) * sstep(fy - 6, fy + 10, yy)
    return m


def f_campo(rng):
    yy, xx = grid()
    sky, d = cp_sky(yy, xx)
    ref, clouds = cp_clouds(sky, rng, yy, xx, d)
    sky_ref = ref.copy()
    ref, mts, glow, line, line2 = cp_mountains(ref, rng, yy, xx)
    ref, hills = cp_hills(ref, rng, yy, xx)
    # tudo o que fica acima do horizonte, para o reflexo da água
    up_ref = ref.copy()
    ref, GX, GZ = cp_meadow(ref, rng, yy, xx)
    ref, wm, glit, banks = cp_stream(ref, rng, yy, xx, up_ref, GX, GZ)
    # as cerejeiras e a ponte primeiro, para as sombras: o sol baixo atrás delas estica a sombra para cá
    (XR, ZR, HR), (XL, ZL, HL) = CP_TREES
    xr, gr = cp_p(XR, 0, ZR)
    xl, gl = cp_p(XL, 0, ZL)
    hr, hl = HR * CP_F / ZR, HL * CP_F / ZL
    tR = cherry_tree(rng, xr, gr, hr, haze=0.2, lean=-0.03, wide=1.1)
    tL = cherry_tree(rng, xl, gl, hl, haze=0.06, lean=0.05, wide=1.25)
    bms, bsil = bridge_parts()
    S = np.maximum.reduce([cast(tR[2], ZR, GX, GZ), cast(tL[2], ZL, GX, GZ), cast(bsil, CP_BRIDGE[2], GX, GZ)])
    S = S * (1 - wm * 0.75)
    ref = shade_ground(ref, S)
    # do fundo para a frente: o capim em faixas de distância, com as árvores e a ponte entre elas
    def band(ref, za, zb):
        G = cp_grass(ref, rng, int(7990 * math.log(zb / za)), za, zb, flowers=0.05, water=wm, shade=S)
        return ref * (1 - G.A[..., None]) + G.P
    ref = band(ref, ZR, 90.0)
    ref = fallen_petals(ref, rng, xr, gr, hr, 0.2, 1.1, S)
    ref = ref * (1 - tR[1][..., None]) + tR[0]
    ref = band(ref, ZL, ZR)
    ref = fallen_petals(ref, rng, xl, gl, hl, 0.06, 1.25, S)
    ref = ref * (1 - tL[1][..., None]) + tL[0]
    ref = band(ref, 24.6, ZL)
    ref, bridge = cp_bridge(ref, rng, yy, xx, wm)
    zh = CP_HER[1]
    ref = band(ref, zh, 24.6)
    f, finfo = cp_her()
    ref, her, her_keep = cp_her_paint(ref, rng, f, finfo, xx, yy)
    G = cp_grass(ref, rng, 7000, 3.6, zh, flowers=0.05, water=wm, shade=S)
    ref = ref * (1 - G.A[..., None]) + G.P
    sh = her_shadow(rng, her, finfo)
    ref = ref * (1 - (sh * 0.42)[..., None]) + col(0x1c2a30) * (sh * 0.42 * 0.25)[..., None]
    info = dict(her=her, her_keep=her_keep, finfo=finfo, d=d, clouds=clouds, sky=sky_ref, mts=mts, snowglow=glow, water=wm, glitter=glit,
                bridge=bridge, GX=GX, GZ=GZ, banks=banks, shade=S, trees=np.maximum(tR[1], tL[1]))
    return ref, info


def cp_sun(out, yy, xx):
    """O sol, por cima do pincel: o disco quase branco, o brilho morno em volta e o véu largo que clareia o
    ar e baixa o contraste de tudo o que fica perto dele."""
    SX, SY = CP_SUN
    d = np.hypot(xx - SX, yy - SY)
    out = screen(out, col(0xfff0d0), np.exp(-(d / 260.0) ** 2) * 0.22)
    out = screen(out, col(0xfff4dc), np.exp(-(d / 70.0) ** 2) * 0.5)
    out = screen(out, col(0xfffaf0), np.exp(-(d / 22.0) ** 2) * 0.9)
    out = put(out, col(0xfffdf8), sstep(11.0, 8.5, d))
    return out


def cp_final(rng, ref, info):
    yy, xx = grid()
    below = sstep(CP_HZ - 2, CP_HZ + 6, yy)
    # o capim pinta de pé (as pinceladas sobem); o céu e a serra seguem a forma
    base = np.where(yy > CP_HZ, math.pi / 2 + CP_WIND * 0.6 + (value_noise(H, W, 40, rng, 2) - 0.5) * 0.5, (value_noise(H, W, 90, rng, 2) - 0.5) * 0.3)
    flow = flow_of(ref, base, 0.8 * (1 - below * 0.85))
    out, _ = painted(ref, rng, flow, ps=passes(0.75, dry=0.22, err=(0.0, 0.02, 0.035, 0.05), long=1.0))
    out = out * 0.78 + ref * 0.22
    # o que é fino demais para o pincel volta do quadro limpo: o rosto e as mãos dela, a ponte, a beira dela
    k = np.clip(blur(info['her_keep'], 0.8) * 0.9 + blur(info['bridge'], 0.6) * 0.6 + rim_of(info['her'], -2.0, -1.0, 0.8) * 0.6, 0, 1)
    out = out * (1 - k[..., None]) + ref * k[..., None]
    # perto, o capim volta um pouco mais nítido (as folhas da frente)
    kn = sstep(560.0, 720.0, yy) * 0.35 * (1 - info['her'])
    out = out * (1 - kn[..., None]) + ref * kn[..., None]
    # a água fina volta do quadro limpo (o pincel a apagava no meio do capim)
    kw = blur(info['water'], 0.6) * 0.55
    out = out * (1 - kw[..., None]) + ref * kw[..., None]
    out = cp_sun(out, yy, xx)
    sunpath = info['banks'][3]
    out = screen(out, col(0xffe6b0), blur(sunpath, 1.5) * 0.45)
    # o brilho na água embaixo do sol, em pontos
    g = info['glitter']
    ys, xs = np.nonzero(g > 0.35)
    if len(xs):
        m = np.zeros((H, W), np.float32)
        sel = rng.choice(len(xs), min(len(xs), 220), replace=False)
        m[ys[sel], xs[sel]] = g[ys[sel], xs[sel]]
        m = blur(m, 0.8) * 6.0
        out = screen(out, col(0xfff8e4), np.clip(m, 0, 1))
    # ela: o fio de luz de trás mais forte na beira do lado do sol e o claro do fundo que invade a borda
    her = info['her']
    hfx, hfy, hs = info['finfo']
    out = screen(out, col(0xffc488), np.clip(rim_of(her, -2.4, -1.4, 0.9) * 1.3, 0, 1) * 0.55)
    band = np.clip(her - ndi.minimum_filter(her, 5), 0, 1) * sstep(hfx + 8 * hs, hfx - 16 * hs, xx)
    out = screen(out, col(0xf6d8a8), blur(band, 1.2) * 0.22)
    # a cor do fim da tarde: o véu morno do ar (mais forte perto do sol e longe), o verde menos saturado,
    # o capim da frente mais escuro (o contraluz), a sombra puxando para o lilás
    d = info['d']
    near = np.where(yy > CP_HZ, 0.5 + 0.5 * sstep(10.0, 160.0, info['GZ']), 1.0)
    veil = (0.07 + 0.2 * np.exp(-(d / 620.0) ** 2)) * near + 0.08 * sstep(CP_HZ + 60, CP_HZ - 10, yy) * (yy > CP_HZ - 60)
    out = screen(out, col(0xffd9a0), veil)
    lum = out @ LUMA
    out = mix(out, lum[..., None] * np.array([1.06, 1.0, 0.86], np.float32), 0.14 * below[..., None])
    out = out * (1 - 0.2 * sstep(540.0, 720.0, yy) * (1 - her))[..., None]
    lum = out @ LUMA
    out = out * np.array([1.03, 1.0, 0.94], np.float32)
    out = mix(out, out * 0.92 + col(0x3a3050) * 0.08, sstep(0.35, 0.05, lum)[..., None])
    v = np.hypot((xx - 640) / 780, (yy - 380) / 470)
    out = out * (1 - 0.22 * sstep(0.75, 1.35, v))[..., None]
    return finish(out)


def blade(L, rng, x0, y0, ang0, length, w0, c0, c1, curl=0.0, alpha=0.9, n=8):
    """Uma folha comprida que sai do chão e verga: uma curva em pedaços curtos, afinando da base para a ponta,
    a cor indo da base (c0) à ponta (c1)."""
    pts = []
    for i in range(n + 1):
        t = i / n
        a = ang0 + curl * t * t
        if i == 0:
            pts.append((x0, y0))
        else:
            px, py = pts[-1]
            pts.append((px + math.cos(a) * length / n, py + math.sin(a) * length / n))
    for i in range(n):
        (xa, ya), (xb, yb) = pts[i], pts[i + 1]
        t0, t1 = i / n, (i + 1) / n
        w = max(0.8, w0 * (1 - 0.8 * (t0 + t1) / 2))
        ca = mix(c0, c1, t0)
        cb = mix(c0, c1, t1)
        L.stroke((xa + xb) / 2, (ya + yb) / 2, math.atan2(yb - ya, xb - xa), math.hypot(xb - xa, yb - ya) * 1.25, w,
                 np.clip(ca, 0, 1), alpha, rng, 0.0, 0.0, 0.15, 0.0, 0.8, col2=np.clip(cb, 0, 1))
    return pts[-1]


def cp_perto(rng):
    """campo-perto: o que fica bem perto da câmera, fora de foco. O capim da frente sobe da beira de baixo,
    mais junto nos dois cantos e ralo no meio, onde ela está: as folhas escuras vergando com a beira acesa, e
    nos cantos umas poucas hastes altas com a espiga, que o sol de trás atravessa (o talo e o grão dourados).
    Pelo canto de cima, à direita, entra o galho florido de uma cerejeira que fica fora do quadro, perto da
    câmera: o galho escuro com a beira dourada e as flores uma por uma, acesas por trás."""
    yy, xx = grid()
    L = Layer(W, H)
    hx = cp_p(CP_HER[0], 0, CP_HER[1])[0]
    items = []
    for x in rng.uniform(-90, W + 90, 1700):
        side = max(sstep(520.0, 20.0, x), sstep(1020.0, 1290.0, x))
        if rng.random() > 0.1 + 0.9 * side:
            continue
        items.append((rng.uniform(2.4, 3.5), float(x), side))
    items.sort(key=lambda it: -it[0])
    for Z, x, side in items:
        f = CP_F / Z
        yb = CP_HZ + CP_CAM * f
        stalk = side > 0.55 and rng.random() < 0.08
        hb = rng.uniform(0.85, 1.05) if stalk else rng.uniform(0.4, 0.85) * (0.75 + 0.25 * side)
        hb *= 1 - 0.5 * math.exp(-((x - hx) / 120.0) ** 2)
        lean = CP_WIND + rng.normal(0, 0.16)
        ang0 = -math.pi / 2 + lean
        curl = rng.normal(0.08, 0.05) if stalk else rng.normal(0.4, 0.3)
        if yb - hb * f * 0.92 > H + 10:
            continue
        sunk = math.exp(-((x - CP_SUN[0]) / 620.0) ** 2)
        if stalk:
            c0 = col(0x2a2c14)
            c1 = mix(col(0x9a8a48), col(0xe0c47a), 0.5 + 0.4 * sunk)
            w0 = 0.007 * f
        else:
            c0 = col(0x141c0c) * rng.uniform(0.85, 1.2)
            c1 = mix(col(0x3a3e1c), col(0xa8964e), rng.uniform(0.15, 0.5) * (0.6 + 0.4 * sunk))
            w0 = rng.uniform(0.009, 0.018) * f
        tip = blade(L, rng, x, yb, ang0, hb * f, w0, c0, c1, curl, rng.uniform(0.85, 0.97))
        if stalk:
            # a espiga: o grão comprido e fino, dourado por dentro
            a = ang0 + curl
            hl = rng.uniform(0.06, 0.08) * f
            L.stroke(tip[0] + math.cos(a) * hl * 0.4, tip[1] + math.sin(a) * hl * 0.4, a, hl, 0.012 * f,
                     np.clip(col(0xd8b46a) * (0.85 + 0.2 * sunk), 0, 1), 0.92, rng, 0.0, 0.0, 0.55, 0.0, 0.8, col2=np.clip(col(0xf6dca0), 0, 1))
    grass = Layer(W, H)
    grass.P[:] = blur(L.P, 2.6)
    grass.A[:] = blur(L.A, 2.6)
    # o galho da cerejeira de fora do quadro: entra pelo alto, à direita, e verga para baixo com o peso das flores
    B = Layer(W, H)
    path = K.spline([(1336.0, -30.0), (1262.0, 20.0), (1190.0, 66.0), (1132.0, 104.0), (1096.0, 138.0)], 10)
    wood = Mask(W, H)
    nseg = len(path) - 1
    for i in range(nseg):
        w = 22.0 * (1 - 0.7 * (i + 0.5) / nseg)
        wood.line([path[i], path[i + 1]], w)
    twigs = []
    for t, side, ln in ((0.3, -1, 54), (0.45, 1, 44), (0.6, -1, 60), (0.78, 1, 40), (0.92, -1, 36)):
        i = min(nseg - 1, int(t * nseg))
        (xa, ya), (xb, yb) = path[i], path[i + 1]
        a = math.atan2(yb - ya, xb - xa) + side * rng.uniform(0.6, 0.95)
        end = (xa + math.cos(a) * ln, ya + math.sin(a) * ln)
        wood.line([(xa, ya), end], 6.5 * (1 - 0.45 * t))
        twigs.append(((xa, ya), end))
    wm = wood.array()
    ux, uy = -0.97, 0.24
    wc = mix(col(0x22181a), col(0xd8a070), (np.clip(rim_of(wm, ux * 2.0, uy * 2.0, 0.8) * 1.3, 0, 1) * 0.75)[..., None])
    B.fill(wc, wm)
    # as flores: cada uma um disco claro (o sol atravessa as pétalas), mais rosa no miolo e onde uma cobre a
    # outra, a beira virada para o sol quase branca; em cachos curtos ao longo dos raminhos e na ponta do galho
    spots = []
    for (p0, p1) in twigs:
        for k in range(rng.integers(7, 12)):
            t = rng.uniform(0.35, 1.05)
            spots.append((p0[0] + (p1[0] - p0[0]) * t + rng.normal(0, 7), p0[1] + (p1[1] - p0[1]) * t + rng.normal(0, 7)))
    for k in range(14):
        spots.append((path[-1][0] + rng.normal(-4, 13), path[-1][1] + rng.normal(6, 12)))
    for (i0, n) in ((3, 4), (6, 4), (9, 3)):
        px, py = path[min(i0, nseg)]
        for _ in range(n):
            spots.append((px + rng.normal(0, 10), py + rng.normal(8, 8)))
    rng.shuffle(spots)
    for (px, py) in spots:
        r = rng.uniform(6.5, 10.5)
        x0, x1 = max(0, int(px - r - 4)), min(W, int(px + r + 5))
        y0, y1 = max(0, int(py - r - 4)), min(H, int(py + r + 5))
        if x0 >= x1 or y0 >= y1:
            continue
        sx, sy = xx[y0:y1, x0:x1] - px, yy[y0:y1, x0:x1] - py
        d = np.hypot(sx, sy)
        m = np.zeros((H, W), np.float32)
        m[y0:y1, x0:x1] = sstep(r + 1.0, r - 1.0, d)
        u = np.zeros((H, W), np.float32)
        u[y0:y1, x0:x1] = np.clip((sx * ux + sy * uy) / r, -1, 1)
        dd = np.zeros((H, W), np.float32)
        dd[y0:y1, x0:x1] = d / r
        base = mix(col(0xe0a0b8), col(0xf8d4de), rng.uniform(0.2, 1.0))
        c = mix(base[None, None, :] * np.ones((H, W, 1), np.float32), col(0xfff2f2), (sstep(0.2, 0.95, u) * 0.7)[..., None])
        c = mix(c, col(0xc06a8a), (sstep(0.45, 0.0, dd) * 0.45)[..., None])
        B.fill(c, m * 0.92)
    branch = Layer(W, H)
    branch.P[:] = blur(B.P, 3.6)
    branch.A[:] = blur(B.A, 3.6)
    grass.over(branch)
    return finish(grass.color(), np.clip(grass.A, 0, 1))


def frame(rng):
    ref, info = f_campo(rng)
    return cp_final(rng, ref, info)


if __name__ == '__main__':
    import time
    t0 = time.time()
    if 'perto' not in sys.argv:
        rng = np.random.default_rng(1000 + sum(map(ord, 'campo')))
        ref, info = f_campo(rng)
        finish(ref).save(os.path.join(CACHE, 'campo-ref.png'))
        print('ref', round(time.time() - t0, 1))
        if 'ref' not in sys.argv:
            cp_final(rng, ref, info).save(os.path.join(OUT, 'campo.png'))
            print('final', round(time.time() - t0, 1))
    if 'ref' not in sys.argv:
        rng = np.random.default_rng(1000 + sum(map(ord, 'campo-perto')))
        cp_perto(rng).save(os.path.join(OUT, 'campo-perto.png'))
        print('perto', round(time.time() - t0, 1))

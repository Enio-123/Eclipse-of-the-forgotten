"""Final III, plano 1: as vozes (finais.py, 'vozes' e 'vozes-luz').

No terraço do núcleo, logo depois da escolha. A câmera fica baixa, atrás dele: ele de joelhos, de costas, no
canto de baixo à esquerda (o capuz, a capa, a ombreira, e a beira da máscara aparecendo porque ele vira a cabeça
para ela). A foice e a coroa que o carrasco deixou ficam no chão. Na frente, de pé no terraço, as pessoas que ele
executou, claras e meio transparentes, olhando para ele; entre elas, ela, de capa vermelha, inteira (sem nenhuma
versão: é a única coisa sólida e quente na frente dele). Em cima, o núcleo pendurado nas correntes; nas beiradas,
as duas agulhas. Atrás de todos, no brilho do mar de nuvens, os lugares que ele destruiu, como lembrança.

uso: python3 vozes.py [ref]   -> cache/vozes-ref.png (e out/vozes.png, out/vozes-luz.png sem 'ref')
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

# Em metros: X para os lados (o meio do terraço é 0), Y para cima (o chão é 0), Z para longe (a câmera em 0).
VZ_HZ, VZ_F, VZ_CAM = 470.0, 900.0, 0.75
VZ_EDGE = 26.0                # a borda de trás do terraço
VZ_HALF = 12.0                # meia largura do terraço
VZ_CORE = (0.0, 7.0, 17.0)    # o meio do núcleo
VZ_CORE_R = 1.1
VZ_NEEDLE = (10.5, 17.0)      # as agulhas (±X, Z)
VZ_HER = (1.55, 8.4)
VZ_HIM = (-1.0, 2.4)
VZ_SUN = (1104.0, 62.0)       # o eclipse, no alto à direita
VZ_SUN_R = 19.0
COOL = col(0xc4cdea)          # a luz das pessoas
JOINTS = [None]               # as juntas das lajes (voltam por cima depois do pincel)
VZ_CROWD_SEED = 312           # as posições da multidão (as mesmas em vozes e vozes-luz)


def vz_p(X, Y, Z):
    return (640.0 + X * VZ_F / Z, VZ_HZ + (VZ_CAM - Y) * VZ_F / Z)


def vz_core_px():
    x, y = vz_p(*VZ_CORE)
    return x, y, VZ_CORE_R * VZ_F / VZ_CORE[2]


# ---------------------------------------------------------------- o céu do eclipse
def vz_sky(rng, yy, xx):
    t = np.clip(yy / VZ_HZ, 0, 1.3)
    sky = vgrad([(0.0, col(0x06050c)), (0.3, col(0x0f0d1c)), (0.55, col(0x1e182e)), (0.74, col(0x372840)), (0.87, col(0x613e48)),
                 (0.95, col(0xa06a4c)), (1.0, col(0xdc9e5c)), (1.3, col(0xdc9e5c))], t)
    cx, cy, cr = vz_core_px()
    d = np.hypot(xx - cx, (yy - cy) * 1.08)
    # o ar aceso em volta do núcleo (a poeira de luz da arena)
    sky = screen(sky, col(0x7a4a34), np.exp(-(d / 340) ** 2) * 0.6)
    sky = screen(sky, col(0xf0a868), np.exp(-(d / 130) ** 2) * 0.4)
    # a coroa do eclipse esfria o céu em volta do disco
    ds = np.hypot(xx - VZ_SUN[0], yy - VZ_SUN[1])
    sky = screen(sky, col(0x3c3060), np.exp(-(np.maximum(ds - VZ_SUN_R, 0) / 190) ** 2) * 0.55)
    # faixas de nuvem alta, acesas por baixo pelo mar de nuvens
    n1 = stretched_noise(H, W, 54, 6.5, rng, 5)
    n2 = stretched_noise(H, W, 20, 3.0, rng, 3)
    band = sstep(0.56, 0.76, n1 * 0.8 + n2 * 0.2) * sstep(0.28, 0.6, t) * (1 - sstep(0.8, 0.96, t))
    lit = np.clip(band - shifted(band, 0, -4), 0, 1)
    sky = mix(sky, col(0x2a1f34), (band * 0.55)[..., None])
    sky = mix(sky, col(0xb87c5a), (np.clip(lit * 2.2, 0, 1) * (0.3 + 0.4 * sstep(0.5, 0.9, t)))[..., None])
    # as estrelas (poucas, e nenhuma no brilho do núcleo)
    st = np.zeros((H, W), np.float32)
    n = 520
    sx = rng.uniform(0, W, n)
    sy = (rng.random(n) ** 1.6) * VZ_HZ * 0.72
    sb = rng.uniform(0.25, 1.0, n) ** 2
    for x, y, b in zip(sx, sy, sb):
        st[int(y), int(x)] += b
    glow_mask = np.exp(-(d / 260) ** 2)
    st = blur(st, 0.65) * 5.0 * (1 - glow_mask) * (1 - band * 0.8) * (1 - sstep(0.45, 0.8, t))
    return sky, band, d, st


def vz_eclipse_ref(ref, yy, xx):
    """O lugar do eclipse na referência: o disco escuro e o brilho em volta, para o pincel pintar o tom certo."""
    ds = np.hypot(xx - VZ_SUN[0], yy - VZ_SUN[1])
    ref = add_light(ref, col(0x8a6ab4), np.exp(-(np.maximum(ds - VZ_SUN_R, 0) / 46) ** 2) * 0.22)
    return put(ref, col(0x07060c), sstep(VZ_SUN_R + 3, VZ_SUN_R - 1, ds))


def vz_eclipse(ref, rng, yy, xx, band):
    """O disco negro com o anel e a coroa de raios (o mesmo eclipse do céu do jogo), pequeno e alto."""
    ds = np.hypot(xx - VZ_SUN[0], yy - VZ_SUN[1])
    rays = Mask(W, H)
    for k in range(150):
        a = rng.uniform(0, 2 * math.pi)
        ln = VZ_SUN_R * rng.uniform(0.25, 1.6) ** 1.6
        w = rng.uniform(0.6, 1.6)
        r0 = VZ_SUN_R + 1
        rays.line([(VZ_SUN[0] + math.cos(a) * r0, VZ_SUN[1] + math.sin(a) * r0),
                   (VZ_SUN[0] + math.cos(a) * (r0 + ln), VZ_SUN[1] + math.sin(a) * (r0 + ln))], w)
    rr = blur(rays.array(), 1.2) * np.exp(-np.maximum(ds - VZ_SUN_R, 0) / 34) * (1 - band * 0.6)
    ref = add_light(ref, col(0xe2b878), rr * 0.5)
    ring = np.exp(-((ds - VZ_SUN_R) / 1.1) ** 2)
    ref = put(ref, col(0x050409), sstep(VZ_SUN_R + 0.4, VZ_SUN_R - 0.6, ds))
    ref = put(ref, col(0xfff0d2), ring * 0.95)
    ref = add_light(ref, col(0xffd9a0), np.exp(-((ds - VZ_SUN_R) / 4.5) ** 2) * 0.3 * (ds > VZ_SUN_R))
    return ref


# ---------------------------------------------------------------- o mar de nuvens e os lugares
def vz_sea(ref, rng, yy, xx):
    """O mar de nuvens depois da borda do terraço: uma faixa de rolos dourados, com algumas torres de nuvem
    subindo do horizonte."""
    edge = vz_p(0, 0, VZ_EDGE)[1]
    tops = VZ_HZ + 1.0 - 9.0 * sstep(0.55, 0.95, noise1d(W, 120, rng, 3)) - 3.0 * noise1d(W, 30, rng, 2)
    under = sstep(tops[None, :] - 1.2, tops[None, :] + 1.2, yy) * (1 - sstep(edge - 1, edge + 1, yy))
    ref, hsea = cloud_sea(ref, rng, yy, xx, under, 640.0, VZ_HZ - 2,
                          far=(0xf4c07a, 0xc8804c, 0x7a4a46), shade=0x6a3c40, crest_c=0xffe4b0, hot=0xfff2d2)
    # a luz da memória por dentro, mais forte embaixo do núcleo
    ref = add_light(ref, col(0x8a4a20), under * np.exp(-((xx - 640) / 520) ** 2) * 0.25)
    return ref, under


def vz_places(rng):
    """Os lugares que ele destruiu, de pé no horizonte como uma lembrança: casas, a capela com a torre do
    sino, o moinho, a ponte de arcos, a árvore queimada; quase todos sem telhado, com as paredes quebradas.
    Devolve a máscara (0 a 1) e a das bordas."""
    m = Mask(W, H)
    holes = Mask(W, H)
    base = VZ_HZ + 3
    x = 120.0
    kinds = ['house', 'house', 'chapel', 'house', 'mill', 'house', 'arches', 'house', 'tower', 'house', 'tree', 'house', 'barn', 'house']
    i = 0
    while x < 1170:
        k = kinds[i % len(kinds)] if rng.random() < 0.8 else kinds[int(rng.integers(0, len(kinds)))]
        i += 1
        s = rng.uniform(1.25, 1.75)
        if k == 'house':
            w = 46 * s
            hw = rng.uniform(52, 84) * s
            ruined = rng.random() < 0.65
            if ruined:
                # as paredes sem o telhado: o alto quebrado em degraus
                pts = [(x, base), (x, base - hw)]
                for j in range(1, 6):
                    pts.append((x + w * j / 6, base - hw - rng.uniform(-18, 6) * s + (0 if j % 2 else 10 * s)))
                pts += [(x + w, base - hw * rng.uniform(0.55, 0.9)), (x + w, base)]
                m.poly(pts)
            else:
                m.poly([(x, base), (x, base - hw), (x + w / 2, base - hw - 30 * s), (x + w, base - hw), (x + w, base)])
            for wy in (0.42, 0.75):
                for wx in (0.25, 0.65):
                    if rng.random() < 0.8:
                        holes.rect(x + w * wx, base - hw * wy - 9 * s, x + w * wx + 9 * s, base - hw * wy + 4 * s)
            x += w + rng.uniform(6, 26)
        elif k == 'chapel':
            w = 70 * s
            hw = 74 * s
            m.poly([(x, base), (x, base - hw), (x + w * 0.5, base - hw - 34 * s), (x + w, base - hw), (x + w, base)])
            tx = x + w * 0.72
            m.rect(tx - 12 * s, base - hw - 92 * s, tx + 12 * s, base)
            # a ponta da torre caída pela metade
            m.poly([(tx - 15 * s, base - hw - 90 * s), (tx - 2 * s, base - hw - 138 * s), (tx + 6 * s, base - hw - 112 * s), (tx + 15 * s, base - hw - 94 * s)])
            holes.poly(lancet(tx, base - hw - 80 * s, base - hw - 56 * s, 10 * s))
            holes.poly(lancet(x + w * 0.3, base - hw + 8 * s, base - 22 * s, 16 * s))
            x += w + rng.uniform(10, 30)
        elif k == 'mill':
            cx = x + 26 * s
            top = base - 104 * s
            m.poly([(cx - 26 * s, base), (cx - 15 * s, top), (cx + 15 * s, top), (cx + 26 * s, base)])
            m.poly([(cx - 18 * s, top + 2), (cx, top - 18 * s), (cx + 18 * s, top + 2)])
            hub = (cx, top - 4 * s)
            for a in (0.5, 0.5 + math.pi / 2 + 0.25):
                ln = rng.uniform(60, 78) * s
                m.line([hub, (hub[0] + math.cos(a) * ln, hub[1] + math.sin(a) * ln)], 4 * s)
                m.poly([(hub[0] + math.cos(a) * ln * 0.3, hub[1] + math.sin(a) * ln * 0.3),
                        (hub[0] + math.cos(a) * ln, hub[1] + math.sin(a) * ln),
                        (hub[0] + math.cos(a) * ln - math.sin(a) * 12 * s, hub[1] + math.sin(a) * ln + math.cos(a) * 12 * s),
                        (hub[0] + math.cos(a) * ln * 0.3 - math.sin(a) * 12 * s, hub[1] + math.sin(a) * ln * 0.3 + math.cos(a) * 12 * s)])
            x += 60 * s + rng.uniform(10, 30)
        elif k == 'arches':
            n = 4
            span = 36 * s
            hw = 58 * s
            m.rect(x, base - hw, x + span * n, base - hw + 14 * s)
            for j in range(n + 1):
                m.rect(x + span * j - 5 * s, base - hw, x + span * j + 5 * s, base)
            # um vão caído
            holes.rect(x + span * 2.2, base - hw - 2, x + span * 2.9, base - hw + 16 * s)
            x += span * n + rng.uniform(10, 30)
        elif k == 'tower':
            w = 30 * s
            hw = 130 * s
            pts = [(x, base), (x, base - hw), (x + w * 0.3, base - hw + 10 * s), (x + w * 0.55, base - hw - 8 * s), (x + w * 0.8, base - hw + 16 * s), (x + w, base - hw * 0.7), (x + w, base)]
            m.poly(pts)
            holes.poly(lancet(x + w / 2, base - hw * 0.62, base - hw * 0.4, 9 * s))
            x += w + rng.uniform(10, 30)
        elif k == 'tree':
            cx = x + 20 * s
            m.line([(cx, base), (cx + 2 * s, base - 70 * s)], 6 * s)
            for (a, ln, at) in ((-2.2, 34, 0.6), (-0.9, 30, 0.75), (-1.9, 22, 0.9), (-0.5, 24, 0.45)):
                p0 = (cx + 1 * s, base - 70 * s * at)
                m.line([p0, (p0[0] + math.cos(a) * ln * s, p0[1] + math.sin(a) * ln * s)], 2.4 * s)
            x += 44 * s + rng.uniform(10, 30)
        else:  # barn
            w = 64 * s
            hw = 46 * s
            m.poly([(x, base), (x, base - hw), (x + w * 0.2, base - hw - 26 * s), (x + w * 0.45, base - hw - 8 * s), (x + w * 0.55, base - hw - 20 * s), (x + w, base - hw - 2 * s), (x + w, base)])
            holes.rect(x + w * 0.35, base - hw * 0.7, x + w * 0.65, base)
            x += w + rng.uniform(10, 30)
    pm = np.clip(m.array() - holes.array(), 0, 1)
    return pm


def vz_places_paint(ref, rng, yy, xx, pm):
    """A lembrança dos lugares: clara e meio transparente, acesa por baixo pelo mar de nuvens, sumindo para
    cima e em manchas (a lembrança falha)."""
    fade = sstep(VZ_HZ - 300, VZ_HZ - 60, yy)
    patchy = sstep(0.25, 0.6, value_noise(H, W, 26, rng, 3))
    a = blur(pm, 0.9) * fade * (0.45 + 0.55 * patchy)
    tone = vgrad([(0.0, col(0x8e7c9a)), (1.0, col(0xe8b884))], np.clip((yy - (VZ_HZ - 150)) / 150, 0, 1))
    ref = put(ref, tone, a * 0.42)
    edge = np.clip(rim_of(pm, 0, -1.6, 0.6) + rim_of(pm, 1.4, 0, 0.6) + rim_of(pm, -1.4, 0, 0.6), 0, 1)
    ref = put(ref, col(0xffe2b4), edge * fade * patchy * 0.55)
    return ref, a


# ---------------------------------------------------------------- o chão do terraço
def vz_floor(ref, rng, yy, xx, sky_ref):
    edge_y = vz_p(0, 0, VZ_EDGE)[1]
    yz = np.maximum(yy, VZ_HZ + 0.5)
    Z = VZ_CAM * VZ_F / (yz - VZ_HZ)
    X = (xx - 640) * Z / VZ_F
    # o terraço: até a borda de trás e entre as duas beiradas dos lados
    floor = sstep(edge_y - 1, edge_y + 1, yy) * sstep(VZ_HALF + 0.15, VZ_HALF - 0.15, np.abs(X))
    # as lajes: fiadas de 0,9 m, a junta desencontrada em cada fiada
    rowf = Z / 0.9
    row = np.floor(rowf)
    uu = X / 0.9 + np.mod(row * 0.47, 1.0)
    dudx = np.maximum(np.abs(np.gradient(uu, axis=1)), 1e-5)
    drdy = np.maximum(np.abs(np.gradient(rowf, axis=0)), 1e-5)
    ju = np.abs(uu - np.round(uu)) / dudx
    jv = np.abs(rowf - np.round(rowf)) / drdy
    # longe, as fiadas ficam a menos de uns px uma da outra: as juntas somem antes de virar listras
    joint = np.clip(1.5 - np.minimum(ju, jv * 1.3), 0, 1) * floor * sstep(3.0, 9.0, 1.0 / drdy)
    slab = np.mod(np.floor(uu) * 7 + row * 13, 11) / 11.0 - 0.5
    stone_n = value_noise(H, W, 12, rng, 4) - 0.5
    near = sstep(edge_y, H, yy)
    base = vgrad([(0.0, col(0x4a3a48)), (0.35, col(0x2e2534)), (1.0, col(0x141018))], near)
    base = base * (1 + 0.14 * slab[..., None] + 0.2 * stone_n[..., None])
    # a luz do núcleo no chão: cai com o cubo da distância, o máximo embaixo dele
    cX, cY, cZ = VZ_CORE
    dd = np.sqrt((X - cX) ** 2 + cY ** 2 + (Z - cZ) ** 2)
    e = (cY / dd) ** 3
    flo = base + col(0xc8803e) * (e * 0.55)[..., None] * (1 - 0.6 * joint[..., None])
    # pedra polida: reflete o céu na beira de longe (o ângulo raso) e, embaixo, só um pouco
    refl_y = np.clip(2 * VZ_HZ - yy, 0, H - 1).astype(np.int32)
    refl = sky_ref[refl_y, np.arange(W)[None, :]]
    gloss = (0.08 + 0.5 * (1 - near) ** 3) * (0.6 + 0.4 * value_noise(H, W, 40, rng, 3))
    flo = mix(flo, refl * 0.85, gloss[..., None])
    flo = mix(flo, col(0x0c090f), (joint * 0.55)[..., None])
    ref = put(ref, flo, floor)
    JOINTS[0] = joint
    # o friso de bronze na borda de trás, aceso pelo núcleo
    trim = np.exp(-((yy - edge_y - 0.6) / 0.9) ** 2) * sstep(VZ_HALF + 0.2, VZ_HALF - 0.2, np.abs(X))
    ref = put(ref, mix(col(0x6a4420), col(0xf0b060), np.exp(-((xx - 640) / 420) ** 2)[..., None]), trim * 0.85)
    return ref, floor, X, Z


# ---------------------------------------------------------------- as agulhas, o núcleo e as correntes
def vz_needles(ref, alpha_keep):
    """As duas agulhas do terraço (a de coroado.py), nas beiradas: a da esquerda acesa do lado de dentro e a da
    direita, o espelho. Só o pé delas entra no quadro."""
    sc = 2.6
    K.S = sc
    img = K.spire()
    K.S = 2
    out = []
    for side in (-1, 1):
        X, Z = side * VZ_NEEDLE[0], VZ_NEEDLE[1]
        fx, fy = vz_p(X, 0, Z)
        im = img if side < 0 else img[:, ::-1].copy()
        h, w = im.shape[:2]
        # a base da peça (18, 400 - 6 do chão) vai no pé da agulha, no chão
        ox = (18 if side < 0 else 36 - 18) * sc
        oy = (400 - 6) * sc
        ref, alpha_keep, pa = place(ref, alpha_keep, im, fx, fy + 4, 1.0, ox=ox, oy=oy)
        out.append(pa)
    return ref, alpha_keep, out


def vz_ears():
    """As argolas das correntes nas orelhas do núcleo (em (6, 26) e (54, 26) da peça de 60 x 60)."""
    cx, cy, cr = vz_core_px()
    s = cr / 22.0
    return [(cx - 24 * s, cy - 4 * s), (cx + 24 * s, cy - 4 * s)]


def vz_core(ref, alpha_keep):
    cx, cy, cr = vz_core_px()
    s = cr / 22.0
    K.S = s
    img = K.core()
    K.S = 2
    ref, alpha_keep, pa = place(ref, alpha_keep, img, cx, cy, 1.0, ox=30 * s, oy=30 * s)
    return ref, alpha_keep, pa


def vz_chains(ref, ears, yy, xx):
    """As duas correntes: da argola do núcleo até o olhal de cada agulha (acima do quadro), de elos de ferro
    grandes, um de frente e um de lado, acesos por baixo pelo núcleo."""
    cx, cy, cr = vz_core_px()
    m_face = Mask(W, H)
    m_hole = Mask(W, H)
    m_side = Mask(W, H)
    for side, (ex, ey) in zip((-1, 1), ears):
        tx, ty = vz_p(side * (VZ_NEEDLE[0] - 0.45), 12.6, VZ_NEEDLE[1])
        n = 60
        pts = []
        for i in range(n + 1):
            t = i / n
            x = ex + (tx - ex) * t
            y = ey + (ty - ey) * t + 26.0 * 4 * t * (1 - t)
            pts.append((x, y))
        # elos de 0,24 m (no plano do núcleo)
        link = 0.24 * VZ_F / VZ_CORE[2]
        acc = 0.0
        k = 0
        for p0, p1 in zip(pts[:-1], pts[1:]):
            seg = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            acc += seg
            while acc >= link * 0.62:
                acc -= link * 0.62
                t = 1 - acc / max(seg, 1e-6)
                x = p0[0] + (p1[0] - p0[0]) * t
                y = p0[1] + (p1[1] - p0[1]) * t
                if y < -20:
                    break
                ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
                ca, sa = math.cos(ang), math.sin(ang)
                if k % 2 == 0:
                    # de frente: o anel (oval comprido ao longo da corrente)
                    pts_o = [(x + ca * math.cos(a) * link * 0.5 - sa * math.sin(a) * link * 0.3, y + sa * math.cos(a) * link * 0.5 + ca * math.sin(a) * link * 0.3) for a in np.linspace(0, 2 * math.pi, 18)]
                    pts_i = [(x + ca * math.cos(a) * link * 0.3 - sa * math.sin(a) * link * 0.12, y + sa * math.cos(a) * link * 0.3 + ca * math.sin(a) * link * 0.12) for a in np.linspace(0, 2 * math.pi, 14)]
                    m_face.poly(pts_o)
                    m_hole.poly(pts_i)
                else:
                    m_side.line([(x - ca * link * 0.45, y - sa * link * 0.45), (x + ca * link * 0.45, y + sa * link * 0.45)], link * 0.2)
                k += 1
    face = np.clip(m_face.array() - m_hole.array(), 0, 1)
    sidem = m_side.array() * (1 - face)
    chain = np.clip(face + sidem, 0, 1)
    dcore = np.hypot(xx - cx, yy - cy)
    lit = np.exp(-(dcore / 260) ** 2)
    ref = put(ref, col(0x15121a), chain)
    ref = put(ref, mix(col(0x5a4636), col(0xe0a060), lit[..., None]), rim_of(chain, 0, 1.4, 0.5) * (0.5 + 0.5 * lit))
    ref = put(ref, col(0x6a6478), rim_of(chain, 0, -1.2, 0.5) * 0.35)
    return ref, chain


# ---------------------------------------------------------------- a gente
class LocalBody(Body):
    """O mesmo corpo de finais.py, desenhado só numa caixa em volta dele (a multidão passa de cem)."""

    def __init__(self, x, y, h, p, box, **kw):
        super().__init__(x, y, h, p, **kw)
        self.box = box

    def P(self, q):
        x, y = super().P(q)
        return (x - self.box[0], y - self.box[1])

    def _m(self, name):
        if name not in self.parts:
            self.parts[name] = Mask(self.box[2], self.box[3])
        return self.parts[name]


def vz_crowd(rng):
    """As posições: um corredor livre dele até ela e um espaço em volta dela; mais gente longe."""
    hx, hz = VZ_HER
    out = []
    tries = 0
    while len(out) < 165 and tries < 40000:
        tries += 1
        Z = 5.0 + 20.5 * rng.random() ** 0.75
        lim = min(VZ_HALF - 0.6, (690 * Z) / VZ_F)
        X = rng.uniform(-lim, lim)
        lane = VZ_HIM[0] + (hx - VZ_HIM[0]) * np.clip((Z - VZ_HIM[1]) / (hz - VZ_HIM[1]), 0, 1)
        if Z < hz + 1.2 and abs(X - lane) < 1.25 + 0.06 * Z:
            continue
        if math.hypot(X - hx, (Z - hz) * 0.6) < 1.5:
            continue
        gap = 0.9 + 0.012 * Z
        if any(math.hypot(X - a, Z - b) < gap for a, b, *_ in out):
            continue
        r = rng.random()
        kind = 'man' if r < 0.38 else 'woman' if r < 0.74 else 'child' if r < 0.85 else 'old'
        out.append((X, Z, kind))
    return out


def vz_person(rng, X, Z, kind):
    fx, fy = vz_p(X, 0, Z)
    hm = {'man': rng.uniform(1.64, 1.86), 'woman': rng.uniform(1.52, 1.7), 'child': rng.uniform(0.98, 1.3), 'old': rng.uniform(1.5, 1.66)}[kind]
    h = hm * VZ_F / Z
    box = (int(fx - 0.5 * h) - 4, int(fy - 1.12 * h) - 4, int(h) + 8, int(1.2 * h) + 8)
    j = lambda a: rng.uniform(-a, a)
    arms = rng.random()
    if arms < 0.5:
        p = pose(el=(-0.13 + j(0.015), -0.63), er=(0.13 + j(0.015), -0.63), hl=(-0.14 + j(0.02), -0.47 + j(0.03)), hr=(0.14 + j(0.02), -0.47 + j(0.03)))
    elif arms < 0.8:
        # as mãos juntas na frente
        p = pose(el=(-0.13, -0.62), er=(0.13, -0.62), hl=(-0.03, -0.5), hr=(0.03, -0.5))
    else:
        # o chapéu (ou um pano) contra o peito
        p = pose(el=(-0.12, -0.62), er=(0.1, -0.66), hl=(-0.04, -0.58), hr=(0.02, -0.66))
    if kind == 'old':
        p['head'] = (0.03, -0.9)
        p['neck'] = (0.02, -0.83)
    p['head'] = (p['head'][0] + j(0.01), p['head'][1])
    hr_ = 0.085 if kind == 'child' else 0.066
    b = LocalBody(fx, fy, h, p, box, flip=rng.random() < 0.5, head_r=hr_, build=rng.uniform(0.92, 1.12))
    # os braços numa parte só deles, para a borda deles aparecer por cima da roupa
    b.basic(arms=False)
    b.limb('sl', 'el', 'hl', 0.055, 0.04, 'arm').limb('sr', 'er', 'hr', 0.055, 0.04, 'arm')
    for hnd in ('hl', 'hr'):
        b.ellipse(hnd, 0.022, 0.026, 'skin')
    if kind in ('woman', 'child') and rng.random() < 0.75:
        b.dress(hem=-0.02, flare=rng.uniform(0.13, 0.2))
        if rng.random() < 0.4:
            b.cloak(hem=-0.3, flare=0.17, part='shawl')
        b.hair(rng.uniform(0.0, 0.16), bun=rng.random() < 0.35)
    elif kind == 'old':
        b.cloak(hem=-0.04, flare=0.2, part='cloak')
        b.hood(part='cloak', point=0.02)
    else:
        b.coat(hem=rng.uniform(-0.3, -0.18), flare=0.13)
        if rng.random() < 0.3:
            # o chapéu de aba
            hx, hy = p['head']
            b.ellipse((hx, hy - 0.05), 0.11, 0.018, 'hair').ellipse((hx, hy - 0.075), 0.06, 0.04, 'hair')
        else:
            b.hair(0.0)
    if p['hl'][0] > -0.06 and arms >= 0.8:
        b.ellipse(((p['hl'][0] + p['hr'][0]) / 2, -0.6), 0.07, 0.05, 'hair')
    return b, (fx, fy, h)


def vz_ghost_paint(ref, rng, b, info, Z, glow, floor_glow):
    """Uma pessoa da multidão, feita de luz fraca: quase transparente no meio, a borda de cada parte mais acesa
    (como vidro visto de lado), o alto pego pelo núcleo e os pés sumindo no chão; o reflexo no chão polido."""
    fx, fy, h = info
    x0, y0, bw, bh = b.box
    sl = (slice(max(y0, 0), min(y0 + bh, H)), slice(max(x0, 0), min(x0 + bw, W)))
    if sl[0].stop <= sl[0].start or sl[1].stop <= sl[1].start:
        return ref
    ms = b.masks()
    sil = np.zeros((bh, bw), np.float32)
    for m in ms.values():
        sil = np.maximum(sil, m)
    ly = np.mgrid[0:bh, 0:bw][0].astype(np.float32)
    gy = ly + y0
    feet = sstep(fy + 0.01 * h, fy - 0.2 * h, gy)
    sil = sil * feet
    near = float(np.clip((26.0 - Z) / 20.0, 0, 1))
    r = max(1.0, 0.045 * h)
    hgt = blur(sil, r)
    gyh, gxh = np.gradient(hgt)
    fres = np.clip(np.hypot(gxh, gyh) * r * 2.6, 0, 1) * sil
    top = np.clip(gyh * r * 4.0, 0, 1) * sil
    ring = np.zeros_like(sil)
    for k, m in ms.items():
        g1, g2 = np.gradient(blur(m * feet, 0.7))
        ring = np.maximum(ring, np.clip(np.hypot(g1, g2) * 2.0, 0, 1))
    ring = ring * blur(sil, 1.2)
    zero = np.zeros_like(sil)
    skin = ms.get('skin', zero) * feet
    hair = np.clip(ms.get('hair', zero) + ms.get('shawl', zero) * 0.35, 0, 1) * feet
    a_fill = 0.06 + 0.13 * near ** 1.3
    a_edge = 0.12 + 0.4 * near ** 1.2
    al = np.clip(sil * a_fill + fres * a_edge + ring * (0.08 + 0.14 * near) + skin * 0.06 - hair * 0.03, 0, 0.8)
    tone = mix(np.broadcast_to(col(0x7884ae), (bh, bw, 3)), col(0xe4eaff), np.clip(fres * 1.2 + ring * 0.6, 0, 1)[..., None])
    tone = mix(tone, col(0xd8def4), (skin * 0.45)[..., None])
    tone = mix(tone, col(0x4a5072), (hair * 0.5)[..., None])
    tone = mix(tone, col(0xffd6a2), (top * 0.65)[..., None])
    cy0, cx0 = sl[0].start - y0, sl[1].start - x0
    cs = (slice(cy0, cy0 + sl[0].stop - sl[0].start), slice(cx0, cx0 + sl[1].stop - sl[1].start))
    region = ref[sl]
    region[:] = region * (1 - al[cs][..., None]) + tone[cs] * al[cs][..., None]
    glow[sl] = np.maximum(glow[sl], blur(sil, max(1.0, 0.06 * h))[cs] * (0.3 + 0.7 * near))
    # o reflexo no chão polido: o corpo espelhado na linha dos pés, fraco e borrado na vertical
    ry = np.clip((2 * fy - gy - y0).astype(np.int32), 0, bh - 1)
    rsil = (sil * 0.5 + fres * 0.5)[ry, np.arange(bw)[None, :]] * (gy > fy) * np.exp(-np.maximum(gy - fy, 0) / (0.22 * h))
    floor_glow[sl] = np.maximum(floor_glow[sl], (ndi.gaussian_filter(rsil, (max(1, 0.03 * h), 0.6)) * (0.1 + 0.2 * near))[cs])
    return ref


# ---------------------------------------------------------------- ela
def vz_her(rng):
    """Ela, inteira, desenhada à mão (os pés em 0, em px da tela): o capuz com a ponta macia em volta do rosto,
    a capa vermelha caindo dos ombros em dobras até perto do chão, aberta na frente onde aparecem o vestido
    escuro e as mãos juntas; a cabeça um pouco inclinada para ele (para a esquerda e para baixo)."""
    X, Z = VZ_HER
    fx, fy = vz_p(X, 0, Z)
    h = 1.64 * VZ_F / Z
    s = h / 176.0
    f = Figure(fx, fy, s)
    # a capa: os ombros, a queda com a barra irregular das dobras
    f.shape('cape', [(-21, -141), (-25, -128), (-28, -100), (-30, -70), (-32, -40), (-34, -14), (-31, -9), (-27, -12), (-22, -8), (-17, -11), (-11, -8),
                     (-4, -10), (3, -8), (10, -11), (16, -8), (22, -11), (27, -8), (32, -12), (34, -15), (32, -42), (30, -72), (28, -102), (25, -129), (21, -141),
                     (10, -146), (-10, -146)], 4)
    # a abertura da frente: o vestido do pescoço até a barra, mais aberta na cintura onde ficam as mãos
    f.shape('dress', [(-3, -138), (3, -138), (5, -112), (7.5, -94), (7, -80), (5, -60), (6, -30), (8, -4), (-7, -4), (-5, -30), (-5, -60), (-7, -80), (-7.5, -94), (-5, -112)], 4)
    f.ell('collar', 0, -136, 4.4, 2.6)
    f.ell('hands', -2.2, -88, 3.4, 2.7).ell('hands', 1.6, -86.6, 3.1, 2.6)
    f.ell('shoe', -5, -2, 3.4, 2.0).ell('shoe', 4, -2, 3.4, 2.0)
    # o capuz em volta da cabeça, a ponta macia em cima, caindo nos ombros
    f.shape('hood', [(-17, -136), (-18, -152), (-15, -167), (-9, -177), (-2, -182), (5, -180), (11, -172), (15, -160), (16, -146), (19, -136), (8, -132), (-8, -132)], 4)
    f.ell('inside', -2.4, -156, 10.2, 12.4)
    f.ell('face', -3.0, -156, 7.4, 9.6)
    return f, (fx, fy, h, s)


def vz_her_paint(ref, rng, f, info, xx, yy):
    fx, fy, h, s = info
    ms = f.masks()
    zero = np.zeros((H, W), np.float32)
    cape = ms.get('cape', zero)
    hood = ms.get('hood', zero)
    dress = ms.get('dress', zero)
    hands = ms.get('hands', zero)
    inside = ms.get('inside', zero)
    face = ms.get('face', zero) * inside
    shoe = ms.get('shoe', zero)
    sil = np.clip(np.maximum.reduce([cape, hood, dress, shoe]), 0, 1)
    # a capa: o vermelho com as dobras que caem dos ombros (mais fundas embaixo, onde o pano junta)
    shx, shy = f.T((0, -150))
    ang = np.arctan2(xx - shx, np.maximum(yy - shy, 1.0))
    t = np.clip((yy - shy) / (150 * s), 0, 1)
    folds = 0.5 + 0.5 * np.sin(ang * 34 + 1.3 * value_noise(H, W, 10, rng, 2))
    red = mix(col(0x4a0a12), col(0x9a2026), (folds * (0.45 + 0.4 * t) + (1 - t) * 0.3)[..., None])
    # o lado esquerdo dela (a direita da tela) mais no escuro, o da luz quente do chão mais claro embaixo
    side = np.clip((xx - fx) / (30 * s), -1, 1)
    red = red * (1 - 0.18 * np.clip(side, 0, 1))[..., None]
    ref = put(ref, red, np.clip(cape + hood, 0, 1))
    ref = put(ref, mix(col(0x22202e), col(0x3a3448), (1 - t)[..., None]), dress * (1 - hood))
    ref = put(ref, col(0x7a6e78), ms.get('collar', zero) * (1 - hood) * 0.8)
    ref = put(ref, col(0x120e14), shoe * 0.9)
    ref = put(ref, col(0x2a1a20), np.clip(rim_of(hands, 0, 1.2, 0.4), 0, 1) * dress * 0.6)
    ref = put(ref, mix(col(0xb08a7c), col(0xdcbcaa), 0.5), hands)
    # o capuz por dentro e o rosto, com a franja escura e o cabelo dos lados (o corte dela, como no rosto)
    ref = put(ref, col(0x22060c), inside * hood)
    hx, hy = f.T((-3.0, -156))
    r = 9.6 * s
    ref = put(ref, col(0xe0c2b0), face)
    ref = put(ref, col(0xf0d8c8), face * np.exp(-(((xx - (hx - 1.5 * s)) / (5 * s)) ** 2 + ((yy - (hy - 1 * s)) / (6 * s)) ** 2)) * 0.5)
    fr = Mask(W, H).poly([(hx - r * 0.82, hy - r * 0.15), (hx - r * 0.72, hy - r * 0.8), (hx, hy - r * 1.02), (hx + r * 0.74, hy - r * 0.78), (hx + r * 0.84, hy - r * 0.12),
                          (hx + r * 0.42, hy - r * 0.34), (hx, hy - r * 0.26), (hx - r * 0.44, hy - r * 0.36)]).array()
    sides = Mask(W, H).poly([(hx - r * 0.84, hy - r * 0.3), (hx - r * 0.58, hy - r * 0.3), (hx - r * 0.6, hy + r * 0.66), (hx - r * 0.9, hy + r * 0.6)]).poly(
        [(hx + r * 0.84, hy - r * 0.3), (hx + r * 0.58, hy - r * 0.3), (hx + r * 0.6, hy + r * 0.66), (hx + r * 0.9, hy + r * 0.6)]).array()
    ref = put(ref, col(0x1a1216), blur(np.clip(fr + sides, 0, 1), 0.4) * inside)
    # os olhos olhando para a esquerda e para baixo (para ele), o nariz e a boca só em sombra
    for ex in (-0.36, 0.3):
        e = np.exp(-(((xx - (hx + ex * r - 0.1 * r)) / (0.12 * r)) ** 2 + ((yy - (hy + 0.1 * r)) / (0.065 * r)) ** 2))
        ref = put(ref, col(0x221418), e * 0.9 * inside)
    ref = put(ref, col(0xb4806e), np.exp(-(((xx - (hx - 0.08 * r)) / (0.1 * r)) ** 2 + ((yy - (hy + 0.42 * r)) / (0.16 * r)) ** 2)) * 0.45 * face)
    ref = put(ref, col(0x9a5654), np.exp(-(((xx - (hx - 0.06 * r)) / (0.18 * r)) ** 2 + ((yy - (hy + 0.66 * r)) / (0.045 * r)) ** 2)) * 0.55 * face)
    # a luz: o núcleo atrás e em cima acende a borda do capuz e dos ombros; a luz fria das pessoas, os lados
    top = np.clip(sil - shifted(sil, 0, 2.0), 0, 1)
    ref = put(ref, col(0xffc88e), blur(top, 0.5) * 0.9)
    ref = put(ref, col(0xd8443a), np.clip(rim_of(np.clip(cape + hood, 0, 1), 0, -3.0, 0.9) - top, 0, 1) * 0.5)
    sidel = np.clip(rim_of(sil, -1.8, 0, 0.6) + rim_of(sil, 1.8, 0, 0.6) * 0.6, 0, 1)
    ref = put(ref, mix(col(0xd88a8a), col(0xd8dcf0), 0.45), sidel * 0.45 * (1 - top))
    return ref, sil, np.clip(face + inside * 0.5 + hands, 0, 1)


# ---------------------------------------------------------------- ele
def vz_him():
    """Ele de joelhos, sentado nos calcanhares, de costas para a câmera (que fica atrás e um pouco à direita
    dele), como no desenho do jogo: o capuz grande com a ponta caída para trás, a capinha de ombro com a barra
    recortada, a capa comprida por baixo (cortada pelo quadro), os braços de placas cinzentas dos lados até os
    cotovelos (as mãos estão nos joelhos, na frente); o perfil da máscara de porcelana (a testa, a fenda do
    olho, a bochecha, o queixo em ponta) aparece do lado direito do capuz, porque ele vira a cabeça para ela. O
    (0, 0) é o chão embaixo do meio dele."""
    ox, oy = vz_p(VZ_HIM[0], 0, VZ_HIM[1])
    kn = Figure(ox, oy, 1.0)
    kn.shape('cape', [(-98, -302), (-110, -262), (-118, -212), (-126, -152), (-138, -92), (-150, -32), (-160, 8), (164, 8), (154, -32), (142, -92),
                      (130, -152), (122, -212), (114, -262), (102, -302), (0, -310)])
    for side in (1, -1):
        kn.stroke('arm', [(side * 104, -304), (side * 114, -266), (side * 121, -230)], 31, 27)
        kn.ell('elbow', side * 122, -228, 15.5, 13.5)
    kn.shape('capelet', [(-126, -312), (-118, -336), (-92, -352), (-50, -362), (0, -366), (50, -362), (92, -352), (120, -336), (130, -312), (124, -298), (116, -304),
                         (106, -293), (94, -301), (80, -291), (64, -299), (44, -291), (24, -299), (2, -291), (-22, -299), (-44, -291), (-64, -299), (-82, -291),
                         (-96, -301), (-108, -293), (-118, -303)], 3)
    kn.shape('hood', [(-58, -352), (-66, -386), (-62, -416), (-50, -440), (-36, -456), (-24, -468), (-10, -456), (6, -451), (26, -445), (44, -430), (58, -404),
                      (62, -378), (60, -352)], 4)
    kn.shape('mask', [(55, -418), (62, -412), (68, -400), (66, -392), (70, -382), (71, -370), (68, -360), (63, -350), (57, -344), (56, -354), (59, -368),
                      (59, -384), (57, -402)], 4)
    return kn


def vz_him_paint(ref, rng, kn, xx, yy):
    km = kn.masks()
    zero = np.zeros((H, W), np.float32)
    sil = np.zeros((H, W), np.float32)
    for m in km.values():
        sil = np.maximum(sil, m)
    cape = km.get('cape', zero)
    hood = km.get('hood', zero)
    capelet = km.get('capelet', zero)
    arm = km.get('arm', zero)
    elbow = km.get('elbow', zero)
    mask_ = km.get('mask', zero)
    ref = put(ref, col(0x10070b), sil)
    # a capa: as dobras saem de baixo da capinha e caem quase retas
    shx, shy = kn.T((0, -380))
    ang = np.arctan2(xx - shx, np.maximum(yy - shy, 1.0))
    wob = 1.6 * value_noise(H, W, 30, rng, 2)
    folds = 0.5 + 0.5 * np.sin(ang * 30 + wob)
    folds2 = 0.5 + 0.5 * np.sin(ang * 13 + 0.7 * wob + 1.1)
    t = np.clip((yy - shy) / 420.0, 0, 1)
    cl = mix(col(0x16060b), col(0x44111a), (folds * 0.55 + folds2 * 0.45)[..., None])
    cl = mix(cl, col(0x0a0306), (t ** 1.4 * 0.5)[..., None])
    ref = put(ref, cl, cape)
    # os braços de placas: o cinza azulado do desenho do jogo, a quina de cima pega o núcleo e a de fora a luz fria
    armm = np.clip(arm + elbow, 0, 1)
    ax_ = kn.T((0, 0))[0]
    out_side = np.clip(np.abs(xx - ax_) - 100, 0, 30) / 30.0
    steel = mix(col(0x2c3040), col(0x5a6078), out_side[..., None])
    ref = put(ref, steel, armm)
    # as placas do braço: duas juntas atravessadas (cada placa cobre a de baixo) e a cotoveleira em cúpula
    bands = Mask(W, H)
    for side in (1, -1):
        for yb in (-282, -258):
            p0, p1 = kn.T((side * 96, yb)), kn.T((side * 134, yb + 5))
            bands.line([p0, p1], 2.2)
    bands = bands.array() * arm
    ref = put(ref, col(0x14161e), bands * 0.75)
    ref = put(ref, col(0x8a90a8), np.clip(shifted(bands, 0, 2.0) - bands, 0, 1) * arm * 0.45)
    ref = put(ref, col(0x1a1c26), np.clip(rim_of(elbow, 0, 2.0, 0.6), 0, 1) * arm * 0.7)
    el_c = np.zeros((H, W), np.float32)
    for side in (1, -1):
        ex_, ey_ = kn.T((side * 122, -228))
        el_c = np.maximum(el_c, np.exp(-(((xx - ex_ - side * 4) / 6.0) ** 2 + ((yy - ey_ + 4) / 5.0) ** 2)))
    ref = put(ref, col(0x9aa2bc), el_c * elbow * 0.7)
    ref = put(ref, col(0xc4cce8), np.where(xx > ax_, rim_of(armm, 2.0, 0, 0.6), rim_of(armm, -2.0, 0, 0.6)) * 0.55)
    # a capinha de ombro por cima: a barra recortada faz sombra na capa e nos braços
    ref = put(ref, col(0x0a0306), np.clip(shifted(capelet, 0, 5) - capelet, 0, 1) * np.clip(cape + armm, 0, 1) * 0.6)
    cfold = 0.5 + 0.5 * np.sin(np.arctan2(xx - shx, np.maximum(yy - shy, 1.0)) * 22 + 1.2 * value_noise(H, W, 16, rng, 2))
    tc = np.clip((yy - (shy + 14)) / 74.0, 0, 1)
    ref = put(ref, mix(mix(col(0x2a0a10), col(0x5a1820), cfold[..., None]), col(0x1a060b), (tc * 0.45)[..., None]), capelet)
    # o capuz: o vermelho mais claro em cima, onde chega o brilho do núcleo; a nuca na sombra
    hx, hy = kn.T((0, -400))
    hv = np.clip((hy + 40 - yy) / 90.0, 0, 1)
    hood_c = mix(col(0x2a0a12), col(0x601a24), hv[..., None])
    hood_c = mix(hood_c, col(0x18060b), (0.5 + 0.5 * np.sin((xx - hx) * 0.1 + (yy - hy) * 0.05 + 2 * value_noise(H, W, 20, rng, 2)))[..., None] * 0.3)
    ref = put(ref, hood_c, hood)
    ref = put(ref, col(0x0c0407), np.clip(rim_of(hood, 0, 3.0, 1.0), 0, 1) * capelet * 0.55)
    # a máscara de porcelana: clara na testa e na bochecha, a fenda do olho escura, o lado de dentro na sombra
    mx, my = kn.T((63, -382))
    mv = np.clip((xx - (mx - 7)) / 9.0, 0, 1)
    ref = put(ref, mix(col(0x5a5258), col(0xece4d8), mv[..., None]), mask_)
    ex, ey = kn.T((65, -393))
    eye = np.exp(-(((xx - ex) / 2.6) ** 2 + ((yy - ey) / 1.5) ** 2))
    ref = put(ref, col(0x16101a), eye * mask_ * 0.9)
    ref = put(ref, col(0xffe0b4), np.clip(mask_ - shifted(mask_, -1.4, 1.0), 0, 1) * 0.7)
    # o contraluz: o alto do capuz, da capinha e dos ombros (o núcleo), o lado direito (a luz fria das pessoas)
    top = np.clip(sil - shifted(sil, 0, 3.0), 0, 1)
    ref = put(ref, col(0xffc690), blur(top, 0.6) * 0.95)
    cloth = np.clip(cape + hood + capelet, 0, 1)
    ref = put(ref, col(0xc83a30), np.clip(rim_of(cloth, 0, -5.0, 1.4) - top, 0, 1) * 0.45)
    right = rim_of(sil, 2.4, 0, 0.7) * sstep(kn.oy - 480, kn.oy - 300, yy)
    ref = put(ref, col(0xb8c2e4), right * 0.5 * (1 - top))
    left = rim_of(sil, -2.0, 0, 0.7) * sstep(kn.oy - 460, kn.oy - 360, yy) * (1 - sstep(kn.oy - 300, kn.oy - 200, yy))
    ref = put(ref, col(0x8a3a3a), left * 0.4 * (1 - top))
    return ref, sil, km


# ---------------------------------------------------------------- a foice e a coroa no chão
def vz_props(ref, alpha_keep, rng):
    """A foice deitada no chão à direita dele (o cabo quase de lado, a lâmina na ponta de lá curvando para longe)
    e a coroa de pé no chão, entre ele e ela, onde o carrasco a deixou."""
    simg, s0, s1 = scythe_prop(scale=3, light=(0.1, -0.9, 0.42), warm=(1.0, 0.8, 0.56), cool=(0.4, 0.42, 0.62))
    pa_ = vz_p(-0.38, 0, 2.95)
    pb_ = vz_p(0.95, 0, 3.55)
    ang = math.atan2(pb_[1] - pa_[1], pb_[0] - pa_[0])
    sc = math.hypot(pb_[0] - pa_[0], pb_[1] - pa_[1]) / (s1[0] - s0[0])
    # deitada: no plano do chão a lâmina fica achatada (a câmera baixa)
    Ms = rot(ang) @ np.diag([1.0, 0.46]) * sc
    sh_s = np.dstack([np.zeros(simg.shape[:2] + (3,), np.float32), simg[..., 3]])
    _, _, sh2 = place_m(ref, None, sh_s, pa_[0] - 2, pa_[1] + 4, Ms, ox=s0[0], oy=s0[1])
    ref = ref * (1 - (blur(sh2, 3) * 0.55)[..., None])
    ref, alpha_keep, pa_s = place_m(ref, alpha_keep, simg, pa_[0], pa_[1], Ms, ox=s0[0], oy=s0[1])
    ref = put(ref, col(0x100c12), pa_s * 0.55)
    ref = put(ref, col(0xffd8a0), rim_of(pa_s, 0, -1.6, 0.5) * 0.8)
    ref = put(ref, col(0xb8c2e4), rim_of(pa_s, 1.4, 0, 0.5) * 0.35)
    # a coroa pequena do carrasco dourado (a mesma de coroado.py), de pé
    K.S = 1.6
    cv = K.Cv(96, 50, seed=33)
    K.scene(cv, 0, 0, kc=1.0)
    K.crown_shape(cv)
    cimg = K.paintover(cv, big=4.0, mix_ref=0.4)
    K.S = 2
    Zc = 5.3
    cx, cy = vz_p(-0.62, 0, Zc)
    sc2 = 0.34 * VZ_F / Zc / 96.0 / 1.6
    sh_c = np.dstack([np.zeros(cimg.shape[:2] + (3,), np.float32), cimg[..., 3]])
    _, _, shc = place_m(ref, None, sh_c, cx + 2, cy + 1, np.array([[1.0, -0.6], [0.0, 0.18]]) * sc2, ox=48 * 1.6, oy=47.5 * 1.6)
    ref = ref * (1 - (blur(shc, 2.0) * 0.6)[..., None])
    ref, alpha_keep, pa_c = place(ref, alpha_keep, cimg, cx, cy, sc2, ox=48 * 1.6, oy=47.5 * 1.6)
    # o reflexo dela no chão polido
    refl, _, _ = place(np.zeros_like(ref), None, cimg[::-1].copy(), cx, cy, sc2, ox=48 * 1.6, oy=(50 - 47.5) * 1.6)
    ref = ref + blur(refl, 1.2) * 0.25 * (1 - alpha_keep[..., None])
    return ref, alpha_keep, pa_s, pa_c, (cx, cy)


# ---------------------------------------------------------------- o quadro
def f_vozes(rng):
    yy, xx = grid()
    sky, band, dcore, stars = vz_sky(rng, yy, xx)
    ref = vz_eclipse_ref(sky.copy(), yy, xx)
    ref, under = vz_sea(ref, rng, yy, xx)
    pm = vz_places(rng)
    ref, pl_a = vz_places_paint(ref, rng, yy, xx, pm)
    sky_ref = ref.copy()
    ref, floor, FX, FZ = vz_floor(ref, rng, yy, xx, sky_ref)
    keep = np.zeros((H, W), np.float32)
    # as agulhas e o núcleo nas correntes
    ref, keep, needles = vz_needles(ref, keep)
    ref, chain = vz_chains(ref, vz_ears(), yy, xx)
    ref, keep, core_a = vz_core(ref, keep)
    # a multidão, de longe para perto; ela no meio, na distância dela
    crowd = vz_crowd(np.random.default_rng(VZ_CROWD_SEED))
    crowd.sort(key=lambda c: -c[1])
    glow = np.zeros((H, W), np.float32)
    floor_glow = np.zeros((H, W), np.float32)
    her_b, her_info = vz_her(rng)
    her_done = False
    her_sil = np.zeros((H, W), np.float32)
    her_face = np.zeros((H, W), np.float32)
    for X, Z, kind in crowd:
        if not her_done and Z < VZ_HER[1]:
            ref, her_sil, her_face = vz_her_paint(ref, rng, her_b, her_info, xx, yy)
            her_done = True
        b, info = vz_person(rng, X, Z, kind)
        ref = vz_ghost_paint(ref, rng, b, info, Z, glow, floor_glow)
    if not her_done:
        ref, her_sil, her_face = vz_her_paint(ref, rng, her_b, her_info, xx, yy)
    # a luz das pessoas no chão: o reflexo e uma poça fria; a névoa baixa onde os pés somem
    ref = add_light(ref, COOL * 0.8, floor_glow * floor)
    pool = blur(glow * floor, 9) + blur(glow, 22) * floor * 0.5
    ref = add_light(ref, col(0x4a5070), pool * 0.5)
    mist_n = stretched_noise(H, W, 18, 5.0, rng, 3)
    edge_y = vz_p(0, 0, VZ_EDGE)[1]
    mist = np.exp(-((yy - (edge_y + 30)) / 34) ** 2) * (0.5 + 0.5 * mist_n) * sstep(edge_y - 30, edge_y + 4, yy)
    ref = screen(ref, col(0x6a7092), mist * 0.32 * (0.4 + 0.6 * blur(glow, 30) * 2))
    # a sombra dela no chão (a luz das pessoas em volta é mole: uma mancha embaixo)
    hfx, hfy, hh, _ = her_info
    ref = ref * (1 - (np.exp(-(((xx - hfx) / (0.22 * hh)) ** 2 + ((yy - hfy - 2) / (0.03 * hh)) ** 2)) * 0.55 * floor)[..., None])
    ref, keep, pa_s, pa_c, crown_at = vz_props(ref, keep, rng)
    kn = vz_him()
    ref, him_sil, km = vz_him_paint(ref, rng, kn, xx, yy)
    info = dict(glow=glow, her=her_sil, face=her_face, him=him_sil, keep=keep, core=core_a, chain=chain, crown=pa_c, scythe=pa_s,
                places=pl_a, floor=floor, crown_at=crown_at, stars=stars, band=band, joints=JOINTS[0])
    return ref, info


def vz_final(rng, ref, info):
    yy, xx = grid()
    cx, cy, cr = vz_core_px()
    base = np.where(yy < VZ_HZ, (value_noise(H, W, 90, rng, 2) - 0.5) * 0.35, np.arctan2(yy - cy, xx - cx))
    flow = flow_of(ref, base, 0.85)
    out, _ = painted(ref, rng, flow, ps=passes(0.95, dry=0.2, err=(0.0, 0.02, 0.035, 0.05), long=1.15))
    # os detalhes nítidos voltam: o rosto dela, a máscara, a coroa, o núcleo, as correntes
    sharp = np.clip(info['face'] * 0.9 + info['keep'] * 0.75 + info['chain'] * 0.6 + info['her'] * 0.35 + info['him'] * 0.25, 0, 1)
    out = out * (1 - sharp[..., None]) + ref * sharp[..., None]
    # depois do pincel: as juntas das lajes (atrás do que fica de pé no chão), as estrelas e o eclipse
    occ = np.clip(info['him'] + info['her'] + info['keep'], 0, 1)
    out = put(out, col(0x0c090f), info['joints'] * (1 - occ) * 0.35)
    out = add_light(out, col(0xe8e4ff), info['stars'])
    out = vz_eclipse(out, rng, yy, xx, info['band'])
    # o brilho do núcleo e das pessoas (o resto da luz vai em vozes-luz, que pulsa)
    d = np.hypot(xx - cx, yy - cy)
    out = add_light(out, col(0xffb25a), np.exp(-(np.maximum(d - cr, 0) / 30) ** 2) * 0.35)
    out = screen(out, col(0x6a72a0), blur(info['glow'], 6) * 0.25)
    # a vinheta
    v = np.hypot((xx - 640) / 760, (yy - 380) / 470)
    out = out * (1 - 0.4 * sstep(0.7, 1.25, v))[..., None]
    return finish(out)


def f_vozes_luz(rng):
    """A luz que pulsa por cima: o halo do núcleo e o ar em volta, as pessoas (a luz fria delas) e o mar de
    nuvens. Ele fica fora (é o que está mais perto da câmera; a luz em cima dele viraria névoa na frente)."""
    yy, xx = grid()
    cx, cy, cr = vz_core_px()
    d = np.hypot(xx - cx, yy - cy)
    out = np.zeros((H, W, 3), np.float32)
    out = add_light(out, col(0xffd08a), np.exp(-((d - cr * 1.02) / 24) ** 2) * 0.3 + np.exp(-(d / (cr * 0.5)) ** 2) * 0.07)
    out = add_light(out, col(0xc87a3a), np.exp(-(d / 200) ** 2) * 0.18)
    out = add_light(out, col(0x6a3a2a), np.exp(-(d / 420) ** 2) * 0.1)
    out = add_light(out, col(0xffc078), np.exp(-((yy - VZ_HZ - 10) / 14) ** 2) * np.exp(-((xx - 640) / 560) ** 2) * 0.1)
    # a luz das pessoas (as mesmas posições de f_vozes)
    g = np.zeros((H, W), np.float32)
    for X, Z, kind in vz_crowd(np.random.default_rng(VZ_CROWD_SEED)):
        fx, fy = vz_p(X, 0, Z)
        hgt = 1.6 * VZ_F / Z
        g += np.exp(-(((xx - fx) / (0.3 * hgt)) ** 2 + ((yy - (fy - 0.55 * hgt)) / (0.5 * hgt)) ** 2)) * (0.25 + 0.75 * np.clip((26 - Z) / 20, 0, 1))
    g = blur(g, 10)
    out = add_light(out, col(0x8a94c8), np.clip(g, 0, 1.4) * 0.1)
    him = blur(np.maximum.reduce(list(vz_him().masks().values())), 14)
    out = out * (1 - np.clip(him * 1.3, 0, 1))[..., None]
    return finish(np.clip(out, 0, 1))


def frame(rng):
    ref, info = f_vozes(rng)
    return vz_final(rng, ref, info)


if __name__ == '__main__':
    import time
    rng = np.random.default_rng(1000 + sum(map(ord, 'vozes')))
    t0 = time.time()
    ref, info = f_vozes(rng)
    finish(ref).save(os.path.join(CACHE, 'vozes-ref.png'))
    print('ref', round(time.time() - t0, 1))
    if 'ref' not in sys.argv:
        vz_final(rng, ref, info).save(os.path.join(OUT, 'vozes.png'))
        print('final', round(time.time() - t0, 1))
        f_vozes_luz(np.random.default_rng(1000 + sum(map(ord, 'vozes-luz')))).save(os.path.join(OUT, 'vozes-luz.png'))

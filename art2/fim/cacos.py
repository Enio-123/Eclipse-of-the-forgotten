"""Final III, plano 2: os cacos (finais.py, 'cacos').

O mesmo terraço, logo depois: ele não está mais lá. A câmera desce até o chão, perto da máscara partida em
cinco cacos (os cortes saem da rachadura dele). Atrás e fora de foco, a coroa no chão, as agulhas e, em cima,
o núcleo apagado nas correntes: Âmbar cinzento, sem luz nenhuma. O céu é o da hora antes do
amanhecer, frio; no horizonte, o último dourado do mar de nuvens. A luz vem de lá, baixa e de frente, e acende
só as bordas quebradas da porcelana. Sem corpo, sem mais nada.

uso: python3 cacos.py [ref]   -> cache/cacos-ref.png (e out/cacos.png sem 'ref')
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

# Em metros, como em vozes.py: X para os lados, Y para cima, Z para longe. A câmera fica a 20 cm do chão.
CA_HZ, CA_F, CA_CAM = 430.0, 900.0, 0.2
CA_EDGE = 24.0
CA_CORE = (0.0, 6.6, 16.0)
CA_CORE_R = 1.1
CA_NEEDLE = (10.5, 16.0)
CA_MASK = (0.04, 0.9)         # onde a máscara caiu (X, Z)
# a porcelana em contraluz: a face vira para a câmera, que fica do lado do céu escuro
SHARD_TINT = np.array([0.8, 0.84, 0.94], np.float32)


def ca_p(X, Y, Z):
    return (640.0 + X * CA_F / Z, CA_HZ + (CA_CAM - Y) * CA_F / Z)


# ---------------------------------------------------------------- uma peça num plano do mundo
def place_plane(ref, alpha, img, O, U, V, c, k=1.0):
    """Põe a peça (HxWx4) num plano do mundo: o ponto c da peça vai em O (metros), e um px da peça anda U e V
    (vetores em metros) no mundo; a projeção é a da câmera do plano (perspectiva de verdade, não afim)."""
    A = np.array([[U[0], V[0], O[0] - U[0] * c[0] - V[0] * c[1]],
                  [U[1], V[1], O[1] - U[1] * c[0] - V[1] * c[1]],
                  [U[2], V[2], O[2] - U[2] * c[0] - V[2] * c[1]],
                  [0.0, 0.0, 1.0]], np.float64)
    Kp = np.array([[CA_F, 0.0, 640.0, 0.0], [0.0, -CA_F, CA_HZ, CA_F * CA_CAM], [0.0, 0.0, 1.0, 0.0]], np.float64)
    M = Kp @ A
    Mi = np.linalg.inv(M)
    Mi = Mi / Mi[2, 2]
    coef = (Mi[0, 0], Mi[0, 1], Mi[0, 2], Mi[1, 0], Mi[1, 1], Mi[1, 2], Mi[2, 0], Mi[2, 1])
    pre = np.dstack([img[..., :3] * img[..., 3:4], img[..., 3:4]])
    chans = []
    for i in range(4):
        ch = Image.fromarray(pre[..., i].astype(np.float32), 'F')
        chans.append(np.asarray(ch.transform((W, H), Image.PERSPECTIVE, coef, resample=Image.BICUBIC), np.float32))
    pa = np.clip(chans[3], 0, 1) * k
    prgb = np.clip(np.dstack(chans[:3]), 0, None) * k
    ref = ref * (1 - pa[..., None]) + prgb
    if alpha is not None:
        alpha = alpha + pa * (1 - alpha)
    return np.clip(ref, 0, 1), alpha, pa


def clean_pieces(pieces):
    """Cada caco fica com o pedaço maior dele; as ilhas pequenas (a quebra de mask_pieces sai com respingos)
    vão para o caco vizinho, e a borda entre eles fica menos serrilhada."""
    lab = np.argmax(np.stack(pieces), 0)
    inside = np.max(np.stack(pieces), 0) > 0.5
    lab = ndi.median_filter(lab, size=5)
    for i in range(len(pieces)):
        cc, n = ndi.label((lab == i) & inside)
        if n > 1:
            sizes = ndi.sum(np.ones_like(cc), cc, range(1, n + 1))
            big = 1 + int(np.argmax(sizes))
            lab[(cc > 0) & (cc != big)] = -1
    # as ilhas soltas: o caco mais perto
    miss = (lab < 0) & inside
    if miss.any():
        valid = (lab >= 0) & inside
        _, (iy, ix) = ndi.distance_transform_edt(~valid, return_indices=True)
        lab = np.where(miss, lab[iy, ix], lab)
    return [((lab == i) & inside).astype(np.float32) for i in range(len(pieces))]


# ---------------------------------------------------------------- o céu e o fundo
def ca_sky(rng, yy, xx):
    t = np.clip(yy / CA_HZ, 0, 1.3)
    sky = vgrad([(0.0, col(0x0b1020)), (0.35, col(0x18213a)), (0.62, col(0x2e3a58)), (0.82, col(0x56607e)), (0.94, col(0x8a8ea6)),
                 (1.0, col(0xb8a49c)), (1.3, col(0xb8a49c))], t)
    # nuvens altas paradas, escuras por baixo (ainda não há sol)
    n1 = stretched_noise(H, W, 46, 6.0, rng, 5)
    band = sstep(0.55, 0.78, n1) * sstep(0.2, 0.55, t) * (1 - sstep(0.85, 0.98, t))
    sky = mix(sky, col(0x1a2036), (band * 0.6)[..., None])
    lit = np.clip(band - shifted(band, 0, -4), 0, 1)
    sky = mix(sky, col(0x8a8aa6), (np.clip(lit * 2, 0, 1) * 0.3 * sstep(0.5, 0.9, t))[..., None])
    # o resto do brilho do mar de nuvens, frio, e o primeiro claro do dia
    sky = screen(sky, col(0x8a6a5a), np.exp(-((yy - CA_HZ) / 50) ** 2) * np.exp(-((xx - 640) / 700) ** 2) * 0.45)
    return sky, band


def ca_sea(ref, rng, yy, xx):
    edge = ca_p(0, 0, CA_EDGE)[1]
    tops = CA_HZ + 0.5 - 6.0 * sstep(0.55, 0.95, noise1d(W, 120, rng, 3)) - 2.0 * noise1d(W, 30, rng, 2)
    under = sstep(tops[None, :] - 1.0, tops[None, :] + 1.0, yy) * (1 - sstep(edge - 1, edge + 1, yy))
    ref, _ = cloud_sea(ref, rng, yy, xx, under, 640.0, CA_HZ - 1, far=(0xb8a098, 0x7a6e80, 0x4a4660), shade=0x3a3852, crest_c=0xd8c4b8, hot=0xe0c8b4)
    return ref, under


def ca_floor(ref, rng, yy, xx, sky_ref):
    edge_y = ca_p(0, 0, CA_EDGE)[1]
    yz = np.maximum(yy, CA_HZ + 0.5)
    Z = CA_CAM * CA_F / (yz - CA_HZ)
    X = (xx - 640) * Z / CA_F
    floor = sstep(edge_y - 1, edge_y + 1, yy)
    rowf = Z / 0.9 + 0.3
    row = np.floor(rowf)
    uu = X / 0.9 + np.mod(row * 0.47, 1.0) + 0.31
    dudx = np.maximum(np.abs(np.gradient(uu, axis=1)), 1e-5)
    drdy = np.maximum(np.abs(np.gradient(rowf, axis=0)), 1e-5)
    ju = np.abs(uu - np.round(uu)) / dudx
    jv = np.abs(rowf - np.round(rowf)) / drdy
    joint = np.clip(1.6 - np.minimum(ju, jv * 1.3), 0, 1) * floor * sstep(3.0, 9.0, 1.0 / drdy)
    slab = np.mod(np.floor(uu) * 7 + row * 13, 11) / 11.0 - 0.5
    # a pedra de perto tem grão (riscos, lascas): o ruído amostrado no chão
    tex = noise_tex(rng, 512, 26, 5)
    grain = sample(tex, X * 160, Z * 160) - 0.5
    near = sstep(edge_y, H, yy)
    base = vgrad([(0.0, col(0x54566a)), (0.3, col(0x34364a)), (1.0, col(0x1c1c28))], near)
    base = base * (1 + 0.12 * slab[..., None] + 0.3 * grain[..., None] * near[..., None])
    refl_y = np.clip(2 * CA_HZ - yy, 0, H - 1).astype(np.int32)
    refl = sky_ref[refl_y, np.arange(W)[None, :]]
    gloss = (0.06 + 0.55 * (1 - near) ** 3) * (0.6 + 0.4 * value_noise(H, W, 40, rng, 3))
    flo = mix(base, refl * 0.85, gloss[..., None])
    # o claro do horizonte rasante no chão (o que vem de frente)
    # o claro do horizonte no chão polido: um rastro comprido que vem de lá até os cacos
    glare = np.exp(-((xx - 650) / (90 + 260 * near)) ** 2) * (1 - near) ** 1.5 * (0.7 + 0.3 * value_noise(H, W, 30, rng, 3))
    flo = mix(flo, col(0xc0aca4), (glare * 0.45)[..., None])
    flo = mix(flo, col(0x0c0c12), (joint * 0.6)[..., None])
    ref = put(ref, flo, floor)
    return ref, floor, X, Z, joint


def ca_needles(ref, keep):
    sc = 2.4
    K.S = sc
    img = K.spire()
    K.S = 2
    # apagadas: sem o núcleo, as runas das agulhas não acendem mais (tira o brilho quente, fica a pedra)
    lum = img[..., :3] @ LUMA
    cold = np.dstack([lum * 0.8, lum * 0.84, lum * 1.0])
    img = np.dstack([img[..., :3] * 0.3 + cold * 0.7, img[..., 3]])
    for side in (-1, 1):
        X, Z = side * CA_NEEDLE[0], CA_NEEDLE[1]
        fx, fy = ca_p(X, 0, Z)
        im = img if side < 0 else img[:, ::-1].copy()
        ox = (18 if side < 0 else 36 - 18) * sc
        ref, keep, _ = place(ref, keep, im, fx, fy + 4, 1.0, ox=ox, oy=(400 - 6) * sc)
    return ref, keep


def chain_links(pts, link, top=-20):
    """Os elos de uma corrente ao longo de `pts` (px): um de frente (o anel, oval ao longo da corrente) e um
    de lado (a barra), alternados, como em vozes.py."""
    m_face = Mask(W, H)
    m_hole = Mask(W, H)
    m_side = Mask(W, H)
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
            if y < top:
                break
            ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
            ca, sa = math.cos(ang), math.sin(ang)
            if k % 2 == 0:
                pts_o = [(x + ca * math.cos(a) * link * 0.5 - sa * math.sin(a) * link * 0.3, y + sa * math.cos(a) * link * 0.5 + ca * math.sin(a) * link * 0.3) for a in np.linspace(0, 2 * math.pi, 18)]
                pts_i = [(x + ca * math.cos(a) * link * 0.3 - sa * math.sin(a) * link * 0.12, y + sa * math.cos(a) * link * 0.3 + ca * math.sin(a) * link * 0.12) for a in np.linspace(0, 2 * math.pi, 14)]
                m_face.poly(pts_o)
                m_hole.poly(pts_i)
            else:
                m_side.line([(x - ca * link * 0.45, y - sa * link * 0.45), (x + ca * link * 0.45, y + sa * link * 0.45)], link * 0.2)
            k += 1
    face = np.clip(m_face.array() - m_hole.array(), 0, 1)
    return np.clip(face + m_side.array() * (1 - face), 0, 1)


def ca_core(ref, keep, yy, xx):
    """O núcleo apagado: a mesma peça de coroado.py, sem a luz de dentro (o Âmbar fica cinza e escuro, a gaiola
    de bronze quase some). O vidro só devolve o que tem em volta: o céu escuro em cima, a faixa fraca do
    horizonte de trás da câmera embaixo do meio e, na borda de baixo, o fio claro do horizonte de lá (a luz
    vem de trás dele). As correntes sobem para os olhais das agulhas, fora do quadro, acesas por baixo pela
    mesma luz."""
    cx, cy = ca_p(*CA_CORE)
    cr = CA_CORE_R * CA_F / CA_CORE[2]
    s = cr / 22.0
    K.S = s
    img = K.core()
    K.S = 2
    lum = img[..., :3] @ LUMA
    dead = np.dstack([lum * 0.3 + 0.02, lum * 0.29 + 0.02, lum * 0.33 + 0.03])
    h_, w_ = img.shape[:2]
    ly, lx = np.mgrid[0:h_, 0:w_].astype(np.float32)
    u = (lx - 30 * s) / (22 * s)
    v = (ly - 30 * s) / (22 * s)
    d = np.hypot(u, v)
    ins = (d < 0.97).astype(np.float32)
    top = np.clip(1 - np.hypot((u + 0.2) / 0.46, (v + 0.6) / 0.22), 0, 1) * ins
    band = np.exp(-((v - 0.42 + 0.2 * u * u) / 0.08) ** 2) * np.clip(1 - u * u * 1.2, 0, 1) * ins
    rim = np.exp(-((d - 0.93) / 0.04) ** 2) * sstep(-0.2, 0.75, v) * (d < 1.0)
    dead = dead + top[..., None] * np.array([0.1, 0.12, 0.18], np.float32)
    dead = dead + band[..., None] * np.array([0.2, 0.2, 0.25], np.float32)
    dead = dead + rim[..., None] * np.array([0.55, 0.47, 0.44], np.float32)
    img = np.dstack([np.clip(dead, 0, 1), img[..., 3]])
    # as correntes: das argolas das orelhas até o olhal de cada agulha
    chain = np.zeros((H, W), np.float32)
    for side in (-1, 1):
        ex, ey = cx + side * 24 * s, cy - 4 * s
        tx, ty = ca_p(side * (CA_NEEDLE[0] - 0.45), 12.6, CA_NEEDLE[1])
        pts = [(ex + (tx - ex) * t, ey + (ty - ey) * t + 20.0 * 4 * t * (1 - t)) for t in np.linspace(0, 1, 61)]
        chain = np.maximum(chain, chain_links(pts, 0.24 * CA_F / CA_CORE[2]))
    # o ferro escuro pega o claro do horizonte por baixo; sem isso, a corrente some no céu
    ref = put(ref, col(0x3e3a46), chain)
    ref = put(ref, col(0xa89a98), rim_of(chain, 0, 1.6, 0.6) * 0.8)
    ref = put(ref, col(0x161822), rim_of(chain, 0, -1.2, 0.5) * 0.5)
    ref, keep, pa = place(ref, keep, img, cx, cy, 1.0, ox=30 * s, oy=30 * s)
    return ref, keep, pa, chain


def ca_props(ref, keep, rng):
    """A coroa, de pé na própria base, onde ficou: à esquerda e atrás dos cacos (fora de foco depois). Sem o
    núcleo, o ouro só pega o céu (mais frio e mais escuro) e o fio do horizonte atrás dela; embaixo, a sombra de
    contato e o reflexo no chão polido."""
    K.S = 1.6
    cv = K.Cv(96, 50, seed=33)
    K.scene(cv, 0, 0, kc=0.5)
    K.crown_shape(cv)
    cimg = K.paintover(cv, big=4.0, mix_ref=0.4)
    K.S = 2
    Zc = 2.1
    cx, cy = ca_p(-0.78, 0, Zc)
    sc2 = 0.34 * CA_F / Zc / 96.0 / 1.6
    lum = cimg[..., :3] @ LUMA
    gold = vgrad([(0.0, col(0x14131a)), (0.35, col(0x3a3532)), (0.7, col(0x7a6c58)), (1.0, col(0xc8b48c))], np.clip(lum * 1.1, 0, 1))
    cimg = np.dstack([mix(gold, cimg[..., :3], 0.18) * 0.9, cimg[..., 3]])
    yy, xx = grid()
    hw = 0.17 * CA_F / Zc
    contact = np.exp(-(((xx - cx) / hw) ** 6 + ((yy - cy - 1) / 3.5) ** 2))
    ref = ref * (1 - (contact * 0.55)[..., None])
    rimg = np.dstack([cimg[::-1, :, :3] * 0.8, cimg[::-1, :, 3]])
    rf, _, pr = place(np.zeros((H, W, 3), np.float32), None, rimg, cx, cy + 1, sc2, ox=48 * 1.6, oy=(50 - 47.5) * 1.6)
    ref = ref * (1 - (blur(pr, 1.2) * 0.28)[..., None]) + blur(rf, 1.2) * 0.28
    ref, keep, pa_c = place(ref, keep, cimg, cx, cy, sc2, ox=48 * 1.6, oy=47.5 * 1.6)
    ref = put(ref, col(0xd8c0a0), rim_of(pa_c, 0, -1.5, 0.5) * 0.45)
    return ref, keep, pa_c


# ---------------------------------------------------------------- os cacos
def ca_shards(ref, rng, yy, xx):
    """A máscara partida: os cinco cacos espalhados de onde ela bateu no chão, cada um um pouco virado; o maior
    (o da testa e do olho esquerdo) ficou apoiado de lado, inclinado para a câmera; os outros deitados. A luz
    baixa de frente acende as quinas quebradas; cada caco tem a espessura da porcelana e a sombra embaixo."""
    img = mask_prop(scale=5, light=(0.0, -0.75, 0.66), warm=(0.98, 0.9, 0.84), cool=(0.5, 0.56, 0.74), amb=0.1)
    pieces, (bx, by) = mask_pieces(img)
    pieces = clean_pieces(pieces)
    h_, w_ = img.shape[:2]
    # 0,2 m de largura de máscara para 300 px da peça
    m_px = 0.205 / w_
    MX, MZ = CA_MASK
    th = 0.42   # a máscara caiu girada
    # onde cada caco foi parar (em metros no chão, a partir de onde estava na máscara) e o quanto girou
    # (a máscara é uma casca curva: cada caco deitado balança sobre as costas e fica inclinado para algum lado)
    # os de cima (a testa e os dois olhos) ficaram quase juntos, ainda lendo como um rosto; os de baixo (as
    # bochechas e o queixo em ponta) escorregaram para perto da câmera, separados
    moves = {0: (-0.035, 0.025, 0.12, 0.88), 1: (0.02, 0.055, -0.1, 0.32), 2: (0.075, 0.03, 0.26, 0.46), 3: (0.1, -0.085, -0.5, 0.42), 4: (-0.085, -0.1, 0.38, 0.58)}
    alpha = np.zeros((H, W), np.float32)
    shadow = np.zeros((H, W), np.float32)
    edges = np.zeros((H, W), np.float32)
    lay = []
    for i, pm in enumerate(pieces):
        ys, xs = np.nonzero(pm > 0.5)
        if len(xs) < 20:
            continue
        pcx, pcy = xs.mean(), ys.mean()
        du, dv, rot_, tilt = moves.get(i, (0, 0, 0, 0.4))
        # o meio do caco no chão: a posição dele na máscara, girada com ela, mais o quanto escorregou
        lu = (pcx - w_ / 2) * m_px
        lv = -(pcy - h_ / 2) * m_px
        c, s_ = math.cos(th), math.sin(th)
        X = MX + lu * c - lv * s_ + du
        Z = MZ + lu * s_ + lv * c + dv
        a = th + rot_
        ca, sa = math.cos(a), math.sin(a)
        # no chão: x da peça anda para o lado (girado), y da peça anda para perto (o alto da máscara fica longe)
        U = np.array([ca * m_px, 0.0, sa * m_px])
        # inclinado: o y da peça sobe (a beira de lá no ar, a de cá no chão)
        Vf = np.array([sa * m_px * math.cos(tilt), -m_px * math.sin(tilt), -ca * m_px * math.cos(tilt)])
        Vflat = np.array([sa * m_px, 0.0, -ca * m_px])
        lift = (ys.max() - pcy) * m_px * math.sin(tilt) + 0.002
        O = np.array([X, lift, Z])
        piece = np.dstack([img[..., :3] * SHARD_TINT, img[..., 3] * pm])
        # a espessura: a mesma peça um pouco mais baixa e mais escura embaixo (a quina de porcelana crua)
        thick = np.dstack([np.broadcast_to(np.array([0.36, 0.36, 0.42], np.float32), img.shape[:2] + (3,)), img[..., 3] * pm])
        sh = np.dstack([np.zeros(img.shape[:2] + (3,), np.float32), img[..., 3] * pm])
        _, _, sp = place_plane(np.zeros((H, W, 3), np.float32), None, sh, np.array([X - 0.004, 0.0, Z - 0.02]), U, Vflat * np.array([1.0, 0.0, 1.25]), (pcx, pcy))
        shadow = np.maximum(shadow, sp)
        lay.append((Z, piece, thick, O, U, Vf, (pcx, pcy)))
    # a sombra macia de todos embaixo (a luz é larga: o céu e o horizonte)
    ref = ref * (1 - (blur(shadow, 5.0) * 0.4 + blur(shadow, 1.2) * 0.25)[..., None])
    lay.sort(key=lambda q: -q[0])
    for Z, piece, thick, O, U, Vf, c in lay:
        # o reflexo no chão polido: o caco espelhado embaixo do chão, fraco
        Om = O * np.array([1.0, -1.0, 1.0])
        Vm = Vf * np.array([1.0, -1.0, 1.0])
        rf, _, pr = place_plane(np.zeros((H, W, 3), np.float32), None, piece, Om, U, Vm, c)
        ref = ref * (1 - (blur(pr, 1.5) * 0.22)[..., None]) + blur(rf, 1.5) * 0.22
        ref, _, pt = place_plane(ref, None, thick, O + np.array([0.0, -0.004, 0.0]), U, Vf, c)
        ref, alpha, pa = place_plane(ref, alpha, piece, O, U, Vf, c)
        # o contato: o escuro fino embaixo da beira que encosta no chão
        ref = ref * (1 - (blur(np.clip(shifted(pa, 0, 1.8) - pa, 0, 1), 0.8) * 0.5)[..., None])
        # a quina quebrada pega a luz de frente: a borda de cima de cada caco
        edges = np.maximum(edges, np.clip(pa - shifted(pa, 0, 1.6), 0, 1))
    ref = put(ref, col(0xf2e6da), edges * 0.75)
    # lascas pequenas em volta
    chips = np.zeros((H, W), np.float32)
    for k in range(14):
        r_ = rng.uniform(0.06, 0.26)
        a_ = rng.uniform(0, 2 * math.pi)
        X = MX + math.cos(a_) * r_
        Z = MZ + math.sin(a_) * r_ * 0.8
        if Z < 0.62:
            continue
        x, y = ca_p(X, 0, Z)
        sz = rng.uniform(0.6, 1.8) * 0.9 / Z
        m = Mask(W, H).ellipse(x, y, sz * 1.4, sz * 0.6).array()
        chips = np.maximum(chips, m)
    ref = put(ref, col(0x15151c), blur(shifted(chips, 0, 1.2), 0.8) * 0.5)
    ref = put(ref, col(0xd8d0cc), chips * 0.9)
    return ref, np.clip(alpha + chips, 0, 1), edges


# ---------------------------------------------------------------- o quadro
def f_cacos(rng):
    yy, xx = grid()
    sky, band = ca_sky(rng, yy, xx)
    ref, under = ca_sea(sky.copy(), rng, yy, xx)
    sky_ref = ref.copy()
    ref, floor, FX, FZ, joint = ca_floor(ref, rng, yy, xx, sky_ref)
    keep = np.zeros((H, W), np.float32)
    ref, keep = ca_needles(ref, keep)
    ref, keep, core_a, chain = ca_core(ref, keep, yy, xx)
    ref, keep, pa_c = ca_props(ref, keep, rng)
    # o foco: perto, nos cacos; o fundo (o céu, as agulhas, o núcleo, a borda) e o meio (a coroa) borram
    Zd = np.where(floor > 0.5, FZ, 60.0)
    Zd = np.where(yy < CA_HZ + 2, 60.0, Zd)
    coc = np.clip(np.abs(1.0 / CA_MASK[1] - 1.0 / Zd) * 3.15, 0, 3.5)
    b1, b2, b3 = blur(ref, 1.0), blur(ref, 2.0), blur(ref, 3.5)
    w1 = sstep(0.4, 1.0, coc)
    w2 = sstep(1.0, 2.0, coc)
    w3 = sstep(2.0, 3.5, coc)
    out = ref * (1 - w1[..., None]) + b1 * w1[..., None]
    out = out * (1 - w2[..., None]) + b2 * w2[..., None]
    out = out * (1 - w3[..., None]) + b3 * w3[..., None]
    ref = out
    ref, shard_a, edges = ca_shards(ref, rng, yy, xx)
    # o que sobra no ar: poeira parada perto do chão, pega pela luz de frente
    info = dict(shards=shard_a, edges=edges, joint=joint, floor=floor, coc=coc, chain=chain)
    return ref, info


def ca_final(rng, ref, info):
    yy, xx = grid()
    base = np.where(yy < CA_HZ, (value_noise(H, W, 90, rng, 2) - 0.5) * 0.3, np.arctan2(yy - CA_HZ, xx - 640))
    flow = flow_of(ref, base, 0.85)
    out, _ = painted(ref, rng, flow, ps=passes(0.62, dry=0.16, err=(0.0, 0.02, 0.03, 0.045), long=1.1))
    sharp = np.clip(info['shards'] * 0.85 + info['edges'], 0, 1)
    out = out * (1 - sharp[..., None]) + ref * sharp[..., None]
    near = info['floor'] * (1 - sstep(0.8, 1.8, info['coc']))
    # a corrente fina some debaixo do pincel: volta a do quadro limpo (já desfocada)
    cm = np.clip(blur(info['chain'], 2.0) * 1.6, 0, 1) * 0.7
    out = out * (1 - cm[..., None]) + ref * cm[..., None]
    out = put(out, col(0x0c0c12), info['joint'] * near * (1 - info['shards']) * 0.35)
    # a poeira no ar, perto do chão, na luz rasante (o jogo põe a que anda por cima)
    dust = np.zeros((H, W), np.float32)
    for k in range(50):
        x = 650 + rng.normal(0, 260)
        y = rng.uniform(CA_HZ - 40, CA_HZ + 220)
        if 0 <= x < W:
            dust[int(y), int(x)] += rng.uniform(0.3, 1.0)
    dust = blur(dust, 1.0) * 5.0 * np.exp(-((yy - CA_HZ - 50) / 160) ** 2)
    out = add_light(out, col(0xd8ccc4), dust * 0.5)
    v = np.hypot((xx - 640) / 760, (yy - 400) / 460)
    out = out * (1 - 0.35 * sstep(0.65, 1.25, v))[..., None]
    return finish(out)


def frame(rng):
    ref, info = f_cacos(rng)
    return ca_final(rng, ref, info)


if __name__ == '__main__':
    import time
    rng = np.random.default_rng(1000 + sum(map(ord, 'cacos')))
    t0 = time.time()
    ref, info = f_cacos(rng)
    finish(ref).save(os.path.join(CACHE, 'cacos-ref.png'))
    print('ref', round(time.time() - t0, 1))
    if 'ref' not in sys.argv:
        ca_final(rng, ref, info).save(os.path.join(OUT, 'cacos.png'))
        print('final', round(time.time() - t0, 1))

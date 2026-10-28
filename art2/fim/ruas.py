"""Final II, plano 2: as ruas paradas (rascunho para colar em finais.py)."""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('FIM_OUT', os.path.join(HERE, 'out'))
CACHE = os.path.join(HERE, 'cache')
os.makedirs(CACHE, exist_ok=True)
sys.path.insert(0, os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
from finais import *  # noqa
from paz import *  # noqa


def towers_far(ref, cx, base, s, solid, tone=0x15111f):
    """As Torres ao longe (a mesma silhueta da paz, na escala s): as três torres no pico, as duas agulhas no alto
    da maior e o núcleo entre elas. Devolve o ponto do núcleo e a máscara das runas acesas."""
    c = col(tone)
    runes = np.zeros((H, W), np.float32)
    for (dx, hw, ht, roof) in ((-62, 17, 160, 34), (58, 15, 144, 28), (0, 24, 230, 0)):
        x = cx + dx * s
        top = base - ht * s
        fill(ref, [(x - hw * s, base), (x - hw * s, top), (x + hw * s, top), (x + hw * s, base)], c, solid)
        if roof:
            fill(ref, [(x - hw * s - 0.8, top + 0.5), (x, top - roof * s), (x + hw * s + 0.8, top + 0.5)], c, solid)
        for k, ry in enumerate(np.arange(top + 30 * s, base - 14 * s, 44 * s)):
            q = patch([(x - 1.0, ry), (x + 1.0, ry), (x + 1.0, ry + 3.2 * s + 1), (x - 1.0, ry + 3.2 * s + 1)])
            if q is not None:
                a, sl = q
                runes[sl] = np.maximum(runes[sl], a)
    top = base - 230 * s
    fill(ref, [(cx - 30 * s, top + 2), (cx + 30 * s, top + 2), (cx + 30 * s, top - 8 * s), (cx - 30 * s, top - 8 * s)], c, solid)
    for sx in (-1, 1):
        x = cx + sx * 24 * s
        fill(ref, [(x - 3.5 * s, top - 6 * s), (x + 3.5 * s, top - 6 * s), (x + 0.8 * s, top - 64 * s), (x - 0.8 * s, top - 64 * s)], c, solid)
    return (cx, top - 34 * s), runes


# ---------------------------------------------------------------- Final II: as ruas
# Uma rua de Vespera de noite, a mesma gente do Final I, mas parada: cada um onde estava quando esqueceu (o
# acendedor com a vara erguida até o lampião apagado, a moça com o cesto caído, o pai e a filha de mão dada, o
# velho sentado na soleira, o casal que não se reconhece, o cachorro olhando o dono que não responde). De cada
# cabeça sobe a luz dourada do que a pessoa era, rumo às Torres, que aparecem no fim da rua acima do mirante.
RU_VX, RU_VY, RU_F, RU_CAM = 640.0, 378.0, 640.0, 1.6
RU_END = 30.0
RU_TX, RU_TBASE, RU_TS = 652.0, 372.0, 0.5


def ru_house_row(ref, rng, st, side, z0, z1, walls, detail, glass, lit, solid):
    """As casas de um lado da rua, de z0 a z1: reboco escuro de noite, os andares, o madeiramento, as janelas
    (vidro escuro que pega o céu, umas poucas com vela), as portas, as sacadas e as placas penduradas."""
    X = side * 4.0
    z = z0
    out = []
    while z < z1:
        dz = rng.uniform(1.7, 2.8) * (z ** 0.5)
        zb = min(z + dz, z1)
        hgt = rng.uniform(6.5, 9.5)
        m = Mask(W, H).poly(st.quad_x(X, z, zb, 0, hgt))
        gable = rng.random() < 0.6
        if gable:
            apex = hgt + rng.uniform(1.6, 2.8)
            m.poly([st.p(X, hgt, z), st.p(X, hgt, zb), st.p(X - side * 1.1, apex, zb - (zb - z) * 0.5)])
        else:
            m.poly(st.quad_x(X, z, zb, hgt - 0.1, hgt + 0.55))
        ma = m.array() * (1 - walls)
        fog = 1 - math.exp(-z / 22.0)
        hue = [col(0x241e26), col(0x261c26), col(0x1e1e28), col(0x1c1e2a), col(0x261e20)][int(rng.integers(0, 5))]
        base = mix(hue, col(0x34284a), fog)
        out.append((ma, base))
        walls[:] = walls + ma
        lm = Mask(W, H)
        for fy in (2.1, 4.4, 6.5):
            if fy < hgt:
                lm.line([st.p(X, fy, z), st.p(X, fy, zb)], max(1.0, 0.07 * RU_F / z))
        if rng.random() < 0.5:
            k = 0
            while z + k * 0.95 < zb:
                zk = z + k * 0.95
                lm.line([st.p(X, 2.1, zk), st.p(X, hgt, zk)], max(1.0, 0.06 * RU_F / zk))
                if k % 2 == 0 and zk + 0.95 < zb:
                    lm.line([st.p(X, 2.1, zk), st.p(X, 4.4, zk + 0.95)], max(1.0, 0.05 * RU_F / zk))
                k += 1
        detail[:] = np.maximum(detail, lm.array() * ma * (1 - fog) * 0.8)
        gm = Mask(W, H)
        cm = Mask(W, H)
        nwin = max(1, int((zb - z) / 1.15))
        for fl in (2.45, 4.75, 7.0):
            if fl + 1.2 > hgt:
                continue
            for k in range(nwin):
                za = z + (k + 0.28) * (zb - z) / nwin
                zw = za + (zb - z) / nwin * 0.44
                q = st.quad_x(X, za, zw, fl, fl + 1.25)
                if rng.random() < 0.06 and z < 18:
                    cm.poly(q)
                else:
                    gm.poly(q)
        if rng.random() < 0.75:
            za = z + (zb - z) * rng.uniform(0.15, 0.55)
            gm.poly(st.quad_x(X, za, za + 0.55, 0, 2.05))
        glass[:] = np.maximum(glass, gm.array() * ma * (1 - fog * 0.7))
        lit[:] = np.maximum(lit, cm.array() * ma)
        # uma placa pendurada num braço de ferro (de frente para a rua, vista de lado)
        if rng.random() < 0.35 and z < 16:
            zs = z + (zb - z) * rng.uniform(0.3, 0.7)
            bm = Mask(W, H)
            bm.line([st.p(X, 3.4, zs), st.p(X - side * 1.0, 3.4, zs)], max(1.0, 0.05 * RU_F / zs))
            bm.poly([st.p(X - side * 0.25, 3.35, zs), st.p(X - side * 0.95, 3.35, zs), st.p(X - side * 0.95, 2.75, zs), st.p(X - side * 0.25, 2.75, zs)])
            b = bm.array()
            detail[:] = np.maximum(detail, b * (1 - fog))
            solid[:] = np.maximum(solid, b)
        # sacada no primeiro andar
        if rng.random() < 0.3 and z < 14:
            za = z + (zb - z) * 0.2
            zw = z + (zb - z) * 0.8
            bm = Mask(W, H)
            bm.poly([st.p(X, 3.9, za), st.p(X - side * 0.7, 3.9, za), st.p(X - side * 0.7, 3.9, zw), st.p(X, 3.9, zw)])
            bm.line([st.p(X - side * 0.7, 4.75, za), st.p(X - side * 0.7, 4.75, zw)], max(1.0, 0.05 * RU_F / za))
            for kk in range(int((zw - za) / 0.3) + 1):
                zk = za + kk * 0.3
                bm.line([st.p(X - side * 0.7, 3.9, zk), st.p(X - side * 0.7, 4.75, zk)], max(1.0, 0.025 * RU_F / zk))
            b = bm.array()
            detail[:] = np.maximum(detail, b * (1 - fog))
            solid[:] = np.maximum(solid, b)
        z = zb + rng.uniform(0.0, 0.2)
    return out


def ru_hat(b, brim=1.75, tall=0.95):
    hx, hy = b.p['head']
    r = b.head_r
    b.ellipse((hx, hy - r * 0.5), r * brim, r * 0.28, 'hair')
    b.poly([(hx - r * 0.86, hy - r * 0.55), (hx - r * 0.78, hy - r * (0.55 + tall)), (hx + r * 0.78, hy - r * (0.55 + tall)), (hx + r * 0.86, hy - r * 0.55)], 'hair')
    return b


def ru_people(st):
    """A gente parada na rua: (corpo, pés na tela, px por m, o que é)."""
    P = pose
    out = []

    def at(X, z):
        return st.p(X, 0, z), RU_F / z

    # o acendedor de chapéu: a vara erguida até o lampião apagado
    (fx, fy), k = at(-2.65, 6.2)
    b = Body(fx, fy, 1.74 * k, P(er=(0.16, -0.84), hr=(0.19, -1.0), el=(-0.12, -0.63), hl=(-0.11, -0.5))).basic().coat(hem=-0.2, flare=0.13).hair(0.02)
    out.append((ru_hat(b), (fx, fy), k, 'acendedor'))
    # a moça do cesto, de xale na cabeça: os braços largados, o cesto caído do lado
    (fx, fy), k = at(-0.9, 4.8)
    b = Body(fx, fy, 1.64 * k, P(el=(-0.125, -0.64), hl=(-0.13, -0.49), er=(0.125, -0.64), hr=(0.135, -0.49), head=(0.01, -0.915))).basic().dress(flare=0.18).hair(0.1)
    b.hood(part='hair', point=0.01, lean=0.0)
    b.poly([(-0.12, -0.84), (0.12, -0.84), (0.16, -0.66), (0.0, -0.6), (-0.16, -0.66)], 'cloth')
    out.append((b, (fx, fy), k, 'cesto'))
    # o pai de chapéu e a filha de mão dada
    (fx, fy), k = at(0.72, 9.0)
    b = Body(fx, fy, 1.8 * k, P(er=(0.14, -0.62), hr=(0.17, -0.5))).basic().coat(hem=-0.24, flare=0.14).hair(0.02)
    out.append((ru_hat(b, 1.6, 0.8), (fx, fy), k, 'pai'))
    (fx2, fy2), k2 = at(1.12, 9.0)
    b = Body(fx2, fy2, 1.12 * k2, P(el=(-0.16, -0.72), hl=(-0.2, -0.88), head=(0.0, -0.9)), head_r=0.085).basic().dress(flare=0.16).hair(0.1, bun=False)
    out.append((b, (fx2, fy2), k2, 'filha'))
    # o velho sentado na soleira do lado direito, as mãos nos joelhos
    (fx, fy), k = at(3.2, 5.6)
    sit = P(head=(-0.03, -0.67), neck=(-0.02, -0.6), sl=(-0.11, -0.565), sr=(0.09, -0.565), wl=(-0.08, -0.38), wr=(0.08, -0.38),
            pl=(-0.07, -0.29), pr=(0.07, -0.29), kl=(-0.22, -0.33), kr=(-0.08, -0.34), fl=(-0.24, -0.01), fr=(-0.1, -0.01),
            el=(-0.17, -0.42), er=(0.0, -0.42), hl=(-0.22, -0.36), hr=(-0.09, -0.37))
    b = Body(fx, fy, 1.7 * k, sit).basic().coat(hem=-0.29, flare=0.12).hair(0.0)
    out.append((ru_hat(b, 1.5, 0.6), (fx, fy), k, 'velho'))
    # o dono (o cachorro senta do lado e olha para ele)
    (fx, fy), k = at(1.9, 7.2)
    b = Body(fx, fy, 1.72 * k, P(head=(0.0, -0.925), el=(-0.13, -0.63), hl=(-0.12, -0.49))).basic().coat(hem=-0.22, flare=0.12).hair(0.03)
    out.append((b, (fx, fy), k, 'dono'))
    # a moça da vassoura, encostada na parede da esquerda, mais para trás
    (fx, fy), k = at(-3.0, 10.5)
    b = Body(fx, fy, 1.62 * k, P(el=(0.02, -0.66), hl=(0.08, -0.6), er=(0.14, -0.62), hr=(0.12, -0.52))).basic().dress(flare=0.16).hair(0.05, bun=True)
    out.append((b, (fx, fy), k, 'vassoura'))
    # o casal que não se reconhece: lado a lado, cada um olhando para um canto
    (fx, fy), k = at(-1.45, 13.5)
    out.append((ru_hat(Body(fx, fy, 1.74 * k, P()).basic().coat(hem=-0.22).hair(0.02), 1.6, 0.7), (fx, fy), k, 'casal'))
    (fx, fy), k = at(-0.4, 13.8)
    out.append((Body(fx, fy, 1.62 * k, P(el=(-0.12, -0.62), hl=(-0.1, -0.5))).basic().dress(flare=0.15).hair(0.16), (fx, fy), k, 'casal'))
    # gente parada lá no fundo
    for (X, z, h_, dress) in ((0.9, 17.5, 1.7, False), (-2.2, 19.5, 1.65, True), (2.4, 21.0, 1.75, False), (-0.6, 23.0, 1.6, True),
                              (1.4, 25.0, 1.7, False), (-1.7, 26.5, 1.68, False), (0.3, 27.5, 1.2, True)):
        (fx, fy), k = at(X, z)
        bb = Body(fx, fy, h_ * k, P()).basic()
        (bb.dress(flare=0.15).hair(0.14) if dress else bb.coat().hair(0.02))
        out.append((bb, (fx, fy), k, 'fundo'))
    return out


def ru_dog(st):
    (fx, fy) = st.p(2.42, 0, 7.2)
    k = RU_F / 7.2
    f = Figure(fx, fy, k / 100.0)
    # o cachorro sentado de lado, a cabeça erguida para o dono (à esquerda dele), o rabo no chão
    f.shape('dog', [(-20, 0), (-22, -10), (-19, -22), (-13, -32), (-9, -40), (-10, -47), (-14, -52), (-22, -54), (-29, -53), (-30, -49),
                    (-24, -47), (-20, -44), (-16, -40), (-12, -34), (-6, -27), (3, -20), (12, -15), (17, -8), (19, 0), (8, 1)], 5)
    f.shape('dog', [(-13, -51), (-8, -62), (-5, -50)], 2)
    f.stroke('dog', [(16, -2), (28, 0), (36, -3)], 6, 3.5)
    return f, (fx, fy)


def ru_motes(head, k, core, rng, n=10):
    """As partículas de luz que sobem de uma cabeça e entortam devagar para o núcleo: (x, y, raio, força)."""
    hx, hy = head
    cx, cy = core
    out = []
    ph = rng.uniform(0, 6)
    for i in range(n):
        t = (i + rng.uniform(0.2, 0.8)) / n
        rise = 1.9 * k * t
        x = hx + (cx - hx) * 0.18 * t ** 2 + math.sin(ph + t * 9) * 0.09 * k * t
        y = hy - rise + (cy - hy) * 0.08 * t ** 2
        out.append((x, y, max(0.9, 0.028 * k * (1 - 0.6 * t)), 0.85 * (1 - t) ** 1.2))
    return out


def f_ruas(rng):
    yy, xx = grid()
    st = Street(RU_VX, RU_VY, RU_F, RU_CAM)
    solid = np.zeros((H, W), np.float32)
    # ---------------- o céu da noite, a luz das Torres no fim da rua
    t = np.clip(yy / RU_VY, 0, 1.3)
    ref = vgrad([(0.0, col(0x08060f)), (0.45, col(0x1a1330)), (0.8, col(0x352650)), (1.0, col(0x5e426c)), (1.3, col(0x5e426c))], t)
    core_guess = (RU_TX, RU_TBASE - 230 * RU_TS - 34 * RU_TS)
    d = np.hypot(xx - core_guess[0], (yy - core_guess[1]) * 1.1)
    ref = mix(ref, col(0x5a3e8a), (np.exp(-(d / 260) ** 2) * 0.45)[..., None])
    ref = mix(ref, col(0xc0886a), (np.exp(-(d / 70) ** 2) * 0.5)[..., None])
    n1 = stretched_noise(H, W, 30, 6.0, rng, 4)
    band = sstep(0.58, 0.8, n1) * sstep(60, 160, yy) * (1 - sstep(280, 340, yy))
    ref = mix(ref, col(0x22183a), (band * 0.7)[..., None])
    ref = mix(ref, col(0x8a5a7a), (np.clip(rim_of(band, 0, 4, 1.0) * 2, 0, 1) * np.exp(-(d / 300) ** 2) * 0.6)[..., None])
    # os morros longe, o colar de nuvem acesa no pé do pico e as Torres
    xs = np.arange(W)
    line = ridge(xs, rng, 0, 18, 90, 6, 0.6) + 352 + 14 * np.cos((xs - 650) / 300)
    hills = sstep(line[None, :] - 0.8, line[None, :] + 0.8, yy) * (yy < RU_VY + 30)
    ref = put(ref, mix(col(0x1e1830), col(0x2e2240), sstep(340, 380, yy)[..., None]), hills)
    collar = np.exp(-((yy - 366) / 9) ** 2) * np.exp(-((xx - RU_TX) / 120) ** 2) * (0.6 + 0.4 * stretched_noise(H, W, 6, 5.0, rng, 3))
    core, runes = towers_far(ref, RU_TX, RU_TBASE, RU_TS, solid)
    ref = put(ref, col(0xffd28a), sstep(7.0, 5.5, np.hypot(xx - core[0], yy - core[1])))
    ref = mix(ref, col(0xf0a868), (np.clip(collar, 0, 1) * 0.85)[..., None])
    ref = put(ref, col(0x8a6aa8), rim_of(solid, 0, -1.2, 0.5) * 0.45)
    # ---------------- o fim da rua: o parapeito do mirante
    pm = Mask(W, H)
    pm.poly([st.p(-4.2, 0, RU_END), st.p(4.2, 0, RU_END), st.p(4.2, 1.05, RU_END), st.p(-4.2, 1.05, RU_END)])
    par = pm.array()
    ref = put(ref, col(0x1c1626), par)
    ref = put(ref, col(0x7a5a88), rim_of(par, 0, -1.2, 0.5) * 0.6)
    # ---------------- as casas
    walls = np.zeros((H, W), np.float32)
    detail = np.zeros((H, W), np.float32)
    glass = np.zeros((H, W), np.float32)
    lit = np.zeros((H, W), np.float32)
    rows = ru_house_row(ref, rng, st, -1, 1.4, RU_END, walls, detail, glass, lit, solid) + ru_house_row(ref, rng, st, 1, 1.4, RU_END, walls, detail, glass, lit, solid)
    walls = np.clip(walls, 0, 1)
    wall_c = np.zeros((H, W, 3), np.float32)
    for ma, base in rows:
        wall_c += ma[..., None] * base
    wall_c = wall_c / np.maximum(walls[..., None], 1e-4)
    wall_c = wall_c * (0.85 + 0.25 * value_noise(H, W, 7, rng, 3)[..., None])
    ref = put(ref, wall_c, walls)
    ref = put(ref, col(0x0e0b12), detail * walls * 0.8)
    # o vidro escuro das janelas pega um pouco do céu; umas poucas velas
    ref = put(ref, mix(col(0x0a0810), col(0x3a2c52), sstep(RU_VY + 200, 0, yy)[..., None]), glass * 0.95)
    ref = put(ref, col(0xffa456), lit * 0.85)
    solid = np.maximum(solid, np.maximum(walls, par))
    ref = put(ref, col(0x8a6a9a), np.clip(rim_of(walls, 0, -2, 0.8) * (yy < RU_VY), 0, 1) * 0.55)
    # ---------------- o chão: pedra molhada
    floor = sstep(RU_VY - 0.5, RU_VY + 0.5, yy) * (1 - walls) * (1 - par)
    zf = RU_F * RU_CAM / np.maximum(yy - RU_VY, 0.5)
    uf = (xx - RU_VX) * zf / RU_F
    cob = np.abs(np.mod(uf * 2.6 + np.floor(zf * 2.2) * 0.5, 1) - 0.5) * 2
    cobv = np.abs(np.mod(zf * 2.2, 1) - 0.5) * 2
    cj = np.clip(1 - np.minimum((1 - cob) * RU_F / zf / 2.6 * 0.5, (1 - cobv) * 30), 0, 1)
    near = sstep(RU_VY, H, yy)
    fl = vgrad([(0.0, col(0x5a4466)), (0.3, col(0x2c2238)), (1.0, col(0x16121e))], near)
    refl = ref[np.clip(2 * RU_VY - yy, 0, H - 1).astype(np.int32), np.arange(W)[None, :]]
    wet = 0.4 + 0.3 * value_noise(H, W, 50, rng, 3)
    fl = mix(fl, refl * 0.8, (wet * (1 - near * 0.4))[..., None])
    fl = mix(fl, col(0x0c0a10), (cj * 0.55 * near)[..., None])
    ref = put(ref, fl, floor)
    # ---------------- a gente, o cachorro, o lampião, o cesto
    people = ru_people(st)
    dog, dft = ru_dog(st)
    # o poste do lampião (perto do acendedor) e o lampião apagado no alto
    lpx, lpy = st.p(-3.35, 0, 6.5)
    lk = RU_F / 6.5
    lamp = Mask(W, H)
    lamp.line([(lpx, lpy), (lpx, lpy - 3.3 * lk)], max(2.0, 0.07 * lk))
    lamp.line([(lpx, lpy - 3.3 * lk), (lpx + 0.35 * lk, lpy - 3.32 * lk)], max(1.5, 0.05 * lk))
    lamp.poly([(lpx + 0.22 * lk, lpy - 3.28 * lk), (lpx + 0.48 * lk, lpy - 3.28 * lk), (lpx + 0.44 * lk, lpy - 2.95 * lk), (lpx + 0.26 * lk, lpy - 2.95 * lk)])
    lamp.poly([(lpx + 0.2 * lk, lpy - 3.28 * lk), (lpx + 0.35 * lk, lpy - 3.42 * lk), (lpx + 0.5 * lk, lpy - 3.28 * lk)])
    # a vara do acendedor, das mãos até a boca do lampião
    b0 = people[0][0]
    hx, hy = b0.P('hr')
    lamp.line([(hx - 0.02 * lk, hy + 0.25 * lk), (lpx + 0.33 * lk, lpy - 2.98 * lk)], max(1.2, 0.025 * lk))
    lampm = lamp.array()
    # o cesto caído e as maçãs
    b1 = people[1]
    cx_, cy_ = b1[1]
    kk = b1[2]
    basket = Mask(W, H)
    basket.ellipse(cx_ + 0.42 * kk, cy_ - 0.12 * kk, 0.2 * kk, 0.13 * kk)
    apples = Mask(W, H)
    for (ax, ay) in ((0.66, -0.03), (0.78, 0.02), (0.58, 0.05), (0.92, 0.0), (0.3, 0.06)):
        apples.ellipse(cx_ + ax * kk, cy_ + ay * kk - 0.04 * kk, 0.045 * kk, 0.04 * kk)
    basketm = basket.array()
    applem = apples.array() * (1 - basketm)
    # a vassoura da moça encostada
    bvm = Mask(W, H)
    bw = people[6][0]
    hx, hy = bw.P('hr')
    k6 = people[6][2]
    bvm.line([(hx + 0.02 * k6, hy - 0.35 * k6), (hx + 0.12 * k6, people[6][1][1] - 0.05 * k6)], max(1.2, 0.025 * k6))
    bvm.poly([(hx + 0.06 * k6, people[6][1][1] - 0.28 * k6), (hx + 0.2 * k6, people[6][1][1] - 0.28 * k6), (hx + 0.26 * k6, people[6][1][1]), (hx + 0.02 * k6, people[6][1][1])])
    lampm = np.maximum(lampm, bvm.array())
    sil = np.zeros((H, W), np.float32)
    for b, ft, k, kind in people:
        sil = np.maximum(sil, b.silhouette())
    dsil = dog.masks()['dog']
    sil = np.maximum(sil, dsil)
    # o escuro de contato no chão e o reflexo de cada um na pedra molhada (virado no pé)
    contact = np.zeros((H, W), np.float32)
    reflm = np.zeros((H, W), np.float32)
    for b, ft, k, kind in people + [(None, dft, RU_F / 7.3, 'dog')]:
        fx, fy = ft
        contact = np.maximum(contact, np.exp(-(((xx - fx) / (0.32 * k)) ** 2 + ((yy - fy) / (0.05 * k + 1.5)) ** 2)))
    for b, ft, k, kind in people:
        s_ = b.silhouette()
        fy = int(round(ft[1]))
        ys = np.arange(H)
        src = np.clip(2 * fy - ys, 0, H - 1)
        flip = s_[src, :] * (ys[:, None] > fy)
        reflm = np.maximum(reflm, flip)
    reflm = blur(reflm, 1.5) * floor
    ref = ref * (1 - (contact * floor * 0.5)[..., None])
    ref = put(ref, col(0x0c0a12), reflm * 0.45)
    # as figuras: escuras na noite, o alto da cabeça e dos ombros aceso pela luz que sai delas
    ref = put(ref, col(0x0f0c16), lampm)
    ref = put(ref, col(0x9a6a40), rim_of(lampm, 1.2, -1.2, 0.5) * 0.7)
    wick = sstep(0.45, 0.8, stretched_noise(H, W, 1.6, 2.5, rng, 2))
    ref = put(ref, mix(col(0x2a1c12), col(0x5a3a20), wick[..., None]), basketm)
    ref = put(ref, col(0xd09050), rim_of(basketm, 0, -1.4, 0.5) * 0.8)
    ref = put(ref, col(0x4a1814), applem)
    ref = put(ref, col(0xf0a070), rim_of(applem, 0.6, -1.0, 0.4) * 0.8)
    fogp = np.exp(-(np.maximum(yy - RU_VY, 1) / 55))
    figc = mix(col(0x110d18), col(0x2e2446), fogp[..., None])
    ref = put(ref, figc, sil)
    # ---------------- a luz que sai de cada cabeça: o alto da cabeça aceso por dentro, o vapor dourado logo acima
    vapor = np.zeros((H, W), np.float32)
    heads = []
    for b, ft, k, kind in people:
        hx, hy = b.P('head')
        r = b.head_r * b.h
        top = (hx, hy - r * 0.95)
        heads.append((top, r, k))
        dd = np.hypot((xx - top[0]) / (r * 1.5), (yy - top[1] + r * 0.5) / (r * 1.6))
        vapor = np.maximum(vapor, np.exp(-dd ** 2) * (1 - 0.6 * sil))
    near_flame = np.zeros((H, W), np.float32)
    for (top, r, k) in heads:
        near_flame = np.maximum(near_flame, np.exp(-(((xx - top[0]) / (r * 3.0)) ** 2 + ((yy - top[1] - r * 1.2) / (r * 3.4)) ** 2)))
    top_rim = rim_of(sil, 0, -1.6, 0.6)
    ref = put(ref, col(0xffc070), top_rim * np.clip(near_flame * 1.4, 0, 1) * 0.95)
    side = np.where(xx < RU_VX, rim_of(sil, 1.5, 0, 0.6), rim_of(sil, -1.5, 0, 0.6))
    ref = put(ref, col(0x8a6aa8), side * 0.4)
    pool = np.zeros((H, W), np.float32)
    for b, ft, k, kind in people:
        fx, fy = ft
        pool = np.maximum(pool, np.exp(-(((xx - fx) / (1.2 * k)) ** 2 + ((yy - fy) / (0.2 * k)) ** 2)))
    ref = add_light(ref, col(0x5a3a1e), (pool * floor * 0.35 + blur(near_flame, 14) * walls * 0.3) * (1 - sil))
    # o reflexo de cada luz no chão molhado: uma risca dourada embaixo dos pés
    for (top, r, k), (b, ft, kk_, kind) in zip(heads, people):
        fy = ft[1]
        ry = fy + (fy - top[1]) * 0.95
        streak = np.exp(-(((xx - top[0]) / (r * 1.1)) ** 2)) * np.exp(-((yy - ry) / (r * 5)) ** 2) * (yy > fy + 2)
        ref = add_light(ref, col(0x9a6030), streak * floor * 0.45)
    # ---------------- o pincel
    base = np.where(yy < RU_VY, (value_noise(H, W, 90, rng, 2) - 0.5) * 0.3, np.arctan2(yy - RU_VY, xx - RU_VX))
    flow = flow_of(ref, base, 0.9)
    out, _ = painted(ref, rng, flow, ps=passes(0.85, dry=0.2, err=(0.0, 0.02, 0.035, 0.05), long=1.1))
    figm = np.clip(np.maximum(np.maximum(sil, lampm), np.maximum(basketm, applem)), 0, 1)
    fig_d = np.clip(blur(figm, 1.5) * 1.6, 0, 1)
    outf, _ = painted(ref, rng, flow, mask=fig_d, ps=passes(0.3, dry=0.12, err=(0.0, 0.015, 0.025, 0.035), long=0.9), base=1.0)
    out = out * (1 - fig_d[..., None]) + outf * fig_d[..., None]
    keep = np.clip(blur(figm, 0.8) * 0.35, 0, 0.5)
    out = out * (1 - keep[..., None]) + ref * keep[..., None]
    # a luz por cima da tinta: o vapor das cabeças e as partículas subindo, as runas e o núcleo
    out = add_light(out, col(0xffc878), vapor * 0.55)
    out = add_light(out, col(0xffa850), blur(vapor, 5) * 0.35)
    # o rio de luz por cima das cabeças: o que cada um era subindo e correndo rua acima até o núcleo das Torres
    pm_ = np.zeros((H, W), np.float32)
    npart = 850
    zs = 3.0 + 27.0 * rng.random(npart) ** 1.25
    X0 = np.clip(rng.normal(0, 1.5, npart), -3.4, 3.4)
    Y0 = rng.uniform(2.0, 4.6, npart)
    tt = np.clip((zs - 3.0) / 27.0, 0, 1) ** 0.8
    Xs = (1 - tt) * X0 + tt * (core[0] - RU_VX) / RU_F * zs + rng.normal(0, 0.12, npart) * (1 - tt)
    Ys = (1 - tt) * Y0 + tt * (RU_CAM + (RU_VY - core[1]) / RU_F * zs)
    for X, Y, z, b_ in zip(Xs, Ys, zs, rng.random(npart)):
        px, py = RU_VX + X * RU_F / z, RU_VY + (RU_CAM - Y) * RU_F / z
        pr = max(0.7, 0.03 * RU_F / z * (0.6 + 0.8 * b_))
        pa = (0.25 + 0.75 * b_ ** 2) * (0.55 + 0.45 * min(1.0, z / 8.0))
        x0, x1 = int(max(0, px - pr * 4)), int(min(W, px + pr * 4 + 1))
        y0, y1 = int(max(0, py - pr * 4)), int(min(H, py + pr * 4 + 1))
        if x0 >= x1 or y0 >= y1:
            continue
        d2 = ((xx[y0:y1, x0:x1] - px) ** 2 + (yy[y0:y1, x0:x1] - py) ** 2) / (pr * pr)
        pm_[y0:y1, x0:x1] = np.maximum(pm_[y0:y1, x0:x1], np.exp(-d2) * pa)
    # as que saem de cada cabeça, poucas, se espalhando
    for (top, r, k) in heads:
        for (px, py, pr, pa) in ru_motes(top, k, core, rng, 5):
            px += rng.normal(0, 0.12 * k)
            x0, x1 = int(max(0, px - pr * 4)), int(min(W, px + pr * 4 + 1))
            y0, y1 = int(max(0, py - pr * 4)), int(min(H, py + pr * 4 + 1))
            if x0 >= x1 or y0 >= y1:
                continue
            d2 = ((xx[y0:y1, x0:x1] - px) ** 2 + (yy[y0:y1, x0:x1] - py) ** 2) / (pr * pr)
            pm_[y0:y1, x0:x1] = np.maximum(pm_[y0:y1, x0:x1], np.exp(-d2) * pa * 0.8)
    out = add_light(out, col(0xffd890), pm_ * 0.85)
    out = add_light(out, col(0xffa850), blur(pm_, 4) * 0.45 + blur(pm_, 22) * 0.6)
    dcore = np.hypot(xx - core[0], yy - core[1])
    out = add_light(out, col(0xffd890), np.exp(-(dcore / 10) ** 2) * 0.9)
    out = add_light(out, col(0xffa860), np.exp(-(dcore / 40) ** 2) * 0.3)
    out = add_light(out, col(0xffa850), blur(runes, 1.0) * 0.7)
    out = add_light(out, col(0xff9a50), blur(lit, 3.0) * 0.25)
    # as estrelas
    sm = np.zeros((H, W), np.float32)
    ns = 260
    sx = rng.uniform(0, W, ns)
    sy = (rng.random(ns) ** 1.5) * 300
    br = rng.random(ns) ** 3
    for x_, y_, b_ in zip(sx, sy, br):
        sm[int(y_), int(x_)] += 0.4 + 1.6 * b_
    sm = blur(sm, 0.7) * 3.0 * (1 - solid) * (yy < RU_VY - 20) * sstep(60, 200, dcore)
    out = add_light(out, col(0xe0d8ff), np.clip(sm, 0, 1) * 0.85)
    return finish(out)


def f_ruas_perto(rng):
    """A camada da frente: dois parados bem perto, cortados pela borda (a moça de xale de costas, à esquerda,
    virada para a rua; o velho de bengala de perfil, à direita), com o alto da cabeça aceso pela luz que sai deles."""
    yy, xx = grid()
    st = Street(RU_VX, RU_VY, RU_F, RU_CAM)
    ref = np.zeros((H, W, 3), np.float32)
    # a moça de xale (1,66 m) a 2,35 m, de costas e um pouco de lado, olhando para a rua
    (ax, ay) = st.p(-1.78, 0, 2.35)
    ka = RU_F / 2.35 * 1.66 / 100.0
    wo = Figure(ax, ay, ka)
    wo.shape('cloth', [(1, -101), (5, -99.5), (7.2, -96), (7.6, -92), (8.8, -89), (8.2, -87.5), (8.4, -85.5), (7, -83.5), (6, -82), (9, -79),
                       (14, -76), (17, -70), (17.6, -60), (17, -51), (13.5, -46), (12.6, -38), (14.5, -26), (17.5, -12), (20, 2), (-19, 2),
                       (-17.5, -12), (-15, -26), (-13, -38), (-14, -46), (-17, -52), (-17.6, -62), (-16, -72), (-11, -80), (-8, -86), (-7.6, -93), (-4.5, -98.5)], 6)
    wo.shape('shawl', [(1, -101), (5, -99.5), (7.2, -96), (7.4, -92.5), (6.2, -91), (5.4, -86), (6, -82), (9, -79), (14, -76), (17, -70),
                       (17.6, -60), (17, -51), (8, -49), (0, -48.5), (-9, -49), (-14, -46), (-17, -52), (-17.6, -62), (-16, -72), (-11, -80), (-8, -86),
                       (-7.6, -93), (-4.5, -98.5)], 6)
    for k in range(12):
        fx = -15 + k * 2.75
        wo.stroke('fringe', [(fx, -48.6), (fx + 0.3, -45)], 0.7, 0.5)
    wo.shape('skin', [(6.6, -92), (7.6, -92), (8.8, -89), (8.2, -87.5), (8.4, -85.5), (7, -83.5), (6, -82.6), (5.5, -87)], 4)
    # o velho de bengala (1,7 m) a 2,6 m, de perfil olhando para a esquerda, curvado
    (bx, by) = st.p(2.25, 0, 2.6)
    kb = RU_F / 2.6 * 1.7 / 100.0
    om = Figure(bx, by, kb)
    om.shape('cloth', [(-6, -71), (-8, -60), (-9, -46), (-10, -34), (-11, -24), (-10, -6), (-11, 2), (11, 2), (10, -8), (16, -24), (18, -32),
                       (16, -48), (17, -60), (16, -71), (10, -80), (4, -78), (0, -73)], 6)
    om.shape('skin', [(-9, -90), (-12, -87), (-14, -84), (-11.5, -82.5), (-11.5, -80), (-10, -77), (-5, -75), (0, -73), (4, -78), (6, -84), (6, -90), (0, -92)], 4)
    om.ell('hat', -1, -92, 15.5, 2.2)
    om.shape('hat', [(-9, -92), (-8, -102), (7, -103), (8, -92)], 3)
    om.stroke('cloth', [(4, -70), (1, -56), (-13, -48)], 7, 5)
    om.ell('skin', -14, -48, 2.6, 2.4)
    om.stroke('cane', [(-14.5, -50), (-17, -24), (-19.5, 2)], 1.5, 1.4)
    om.stroke('cane', [(-16, -50), (-13, -51.5), (-11.5, -50)], 1.4, 1.4)
    wm, bm_ = wo.masks(), om.masks()
    zero = np.zeros((H, W), np.float32)
    sil = np.zeros((H, W), np.float32)
    for m in list(wm.values()) + list(bm_.values()):
        sil = np.maximum(sil, m)
    # o escuro de perto (mais escuro que o fundo), a lã do xale, o pano do casaco
    ref = put(ref, col(0x100c14), sil)
    weave = sstep(0.45, 0.8, stretched_noise(H, W, 2.2, 0.4, rng, 2))
    ref = put(ref, mix(col(0x1a1220), col(0x2c1e2c), weave[..., None]), wm.get('shawl', zero))
    ref = put(ref, col(0x241a26), wm.get('fringe', zero))
    ref = put(ref, col(0x1c1612), wm.get('skin', zero) + bm_.get('skin', zero))
    ref = put(ref, col(0x15110f), bm_.get('hat', zero))
    ref = put(ref, col(0x1a1410), bm_.get('cane', zero))
    # a luz que sai de cada um acende o alto da cabeça e os ombros; o roxo da rua na borda de lado
    heads = [(wo.T((0, -100)), 0.11 * RU_F / 2.35), (om.T((-1, -102)), 0.11 * RU_F / 2.6)]
    near = np.zeros((H, W), np.float32)
    for (hx, hy), r in heads:
        near = np.maximum(near, np.exp(-(((xx - hx) / (r * 2.4)) ** 2 + ((yy - hy - r * 1.2) / (r * 3.2)) ** 2)))
    ref = put(ref, col(0xffc27a), rim_of(sil, 0, -2.4, 0.8) * np.clip(near * 1.5, 0, 1))
    ref = put(ref, col(0xb07a50), rim_of(sil, 0, -5.0, 2.0) * np.clip(near * 1.2, 0, 1) * 0.35)
    ref = put(ref, col(0x8a6aa8), np.clip(rim_of(sil, 2.2, 0, 0.8) * (xx < RU_VX) + rim_of(sil, -2.2, 0, 0.8) * (xx >= RU_VX), 0, 1) * 0.55)
    ref = put(ref, col(0xa07050), rim_of(bm_.get('cane', zero), -1.0, -1.0, 0.4) * 0.6)
    flow = flow_of(ref, np.full((H, W), np.pi / 2, np.float32), 0.9)
    m_d = np.clip(blur(sil, 1.5) * 1.6, 0, 1)
    out, _ = painted(ref, rng, flow, mask=m_d, ps=passes(0.5, dry=0.15, err=(0.0, 0.015, 0.025, 0.035), long=1.0), base=1.0)
    out = out * 0.7 + ref * 0.3
    alpha = blur(sil, 0.9)
    # o vapor dourado no alto da cabeça (um véu claro por cima do fundo)
    glowa = np.zeros((H, W), np.float32)
    for (hx, hy), r in heads:
        glowa = np.maximum(glowa, np.exp(-(((xx - hx) / (r * 1.6)) ** 2 + ((yy - hy + r * 0.4) / (r * 1.7)) ** 2)))
    g = glowa * (1 - alpha) * 0.4
    rgb = (out * alpha[..., None] + col(0xffc070) * g[..., None]) / np.maximum(alpha + g, 1e-4)[..., None]
    a_ = np.clip(alpha + g, 0, 1)
    return finish(rgb, a_)


if __name__ == '__main__':
    import time
    rng = np.random.default_rng(1000 + sum(map(ord, 'ruas')))
    t0 = time.time()
    if 'perto' not in sys.argv:
        img = f_ruas(rng)
        img.save(os.path.join(OUT, 'ruas.png'))
    rng = np.random.default_rng(1000 + sum(map(ord, 'ruas-perto')))
    img = f_ruas_perto(rng)
    img.save(os.path.join(OUT, 'ruas-perto.png'))
    print('ok', round(time.time() - t0, 1))

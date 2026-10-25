"""Modelo do Cavaleiro de Máscara Partida para o renderizador de esqueleto."""
import math
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot

W, H = 112, 96
BASE_HIP = (56.0, 71.0)
FEET = (56, 90)

DEFAULT = dict(
    hip=(0.0, 0.0), lean=0.0, head=(0.0, 0.0), tilt=0.0,
    legF=(6.0, 4.0), legB=(-5.0, 4.0), footF=0.0, footB=0.0,
    armF=(-8.0, 30.0), armB=(10.0, 20.0), sword=None,
    cape=dict(lift=8.0, wave=4.0, phase=0.0, length=1.0, flare=0.0),
    hoodtip=(0.0, 0.0), mask='partida', glow=False, crouch=0.0,
)


def P(d, **kw):
    p = {k: (dict(v) if isinstance(v, dict) else v) for k, v in DEFAULT.items()}
    for k, v in d.items():
        if k == 'cape':
            p['cape'].update(v)
        else:
            p[k] = v
    p.update(kw)
    return p


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def dirv(deg):
    a = math.radians(deg)
    return (math.sin(a), math.cos(a))


def build(pose):
    p = P(pose)
    prims, decals = [], []
    hip = add(BASE_HIP, p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))  # para cima ao longo do tronco
    f = (math.cos(lean), math.sin(lean))   # para frente
    neck = add(hip, u, 15.0)
    shF = add(add(neck, f, 2.5), u, -2.5)
    shB = add(add(neck, f, -2.0), u, -2.5)
    hipF = add(hip, f, 1.5)
    hipB = add(hip, f, -1.5)
    head = add(add(add(neck, u, 9.0), f, 1.5), p['head'])

    # ---------- pernas ----------
    def leg(root, ang, z, shade, footang):
        th, kn = ang
        knee = add(root, dirv(th), 8.5)
        ankle = add(knee, dirv(th - kn), 8.0)
        fa = math.radians(footang)
        toe = add(ankle, (math.cos(fa), math.sin(fa)), 4.2)
        heel = add(ankle, (math.cos(fa), math.sin(fa)), -1.2)
        prims.append(Capsule('thigh', 'cloth', z, root, knee, 3.0, 2.5, shade=shade))
        prims.append(Capsule('shin', 'steel', z + 0.05, knee, ankle, 2.5, 2.1, shade=shade))
        prims.append(Ellipse('knee', 'steel', z + 0.08, knee, 2.3, 2.0, shade=shade))
        prims.append(Capsule('foot', 'leather', z + 0.04, heel, toe, 1.9, 1.6, shade=shade))
        return ankle

    leg(hipB, p['legB'], 1.5, 0.62, p['footB'])
    leg(hipF, p['legF'], 4.0, 1.0, p['footF'])

    # ---------- braços ----------
    def arm(root, ang, z, shade):
        up, el = ang
        elbow = add(root, dirv(up), 7.0)
        hand = add(elbow, dirv(up + el), 6.3)
        prims.append(Capsule('upperarm', 'cloth', z, root, elbow, 2.4, 2.1, shade=shade))
        prims.append(Capsule('forearm', 'steel', z + 0.05, elbow, hand, 2.2, 2.0, shade=shade))
        prims.append(Ellipse('hand', 'leather', z + 0.1, hand, 1.9, 1.9, shade=shade))
        return elbow, hand, up + el

    arm(shB, p['armB'], 0.5, 0.55)
    _, handF, foreAng = arm(shF, p['armF'], 7.0, 1.0)

    # ---------- espada ----------
    sa = p['sword'] if p['sword'] is not None else foreAng
    sd = dirv(sa)
    sp = (sd[1], -sd[0])
    g0 = add(handF, sd, 1.6)
    prims.append(Capsule('blade', 'steel', 6.5, add(handF, sd, 2.0), add(handF, sd, 23.0), 1.35, 0.55))
    prims.append(Capsule('guard', 'gold', 6.6, add(g0, sp, -3.6), add(g0, sp, 3.6), 1.0, 1.0))
    prims.append(Ellipse('pommel', 'gold', 6.6, add(handF, sd, -2.6), 1.3, 1.3))

    # ---------- capa ----------
    c = p['cape']
    N = 12
    length = 31.0 * c['length']
    F, B, T = [], [], []
    pt = add(add(neck, f, -3.2), u, -0.5)
    for i in range(N + 1):
        t = i / N
        th = c['lift'] * (t ** 1.15) + c['wave'] * math.sin(c['phase'] + t * 3.2) * t + math.degrees(lean) * 0.6
        a = math.radians(th)
        d = (-math.sin(a), math.cos(a))
        back = (-math.cos(a), -math.sin(a))
        w = 2.5 + (10.5 + c['flare']) * (t ** 0.85)
        F.append(pt)
        B.append(add(pt, back, w))
        T.append((t, w, a))
        pt = add(pt, d, length / N)
    # barra rasgada
    tat = [2.2, -1.0, 3.0, -0.5, 1.6, -1.2]
    bottom = []
    tN, wN, aN = T[-1]
    dN = (-math.sin(aN), math.cos(aN))
    for k in range(1, len(tat) + 1):
        q = k / (len(tat) + 1)
        base = (F[-1][0] + (B[-1][0] - F[-1][0]) * q, F[-1][1] + (B[-1][1] - F[-1][1]) * q)
        bottom.append(add(base, dN, tat[k - 1]))
    pts = F + bottom + B[::-1]

    def cape_normal(x, y):
        best, bi, bs = 1e9, 0, 0.0
        for i in range(N):
            ax, ay = F[i]
            bx, by = F[i + 1]
            vx, vy = bx - ax, by - ay
            L2 = vx * vx + vy * vy or 1e-6
            tt = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / L2))
            px, py = ax + vx * tt, ay + vy * tt
            dd = (x - px) ** 2 + (y - py) ** 2
            if dd < best:
                best, bi, bs = dd, i, tt
        t = (bi + bs) / N
        w = 2.5 + (10.5 + c['flare']) * (t ** 0.85)
        s = min(1.0, math.sqrt(best) / max(1.0, w))
        nx = -0.15 + 0.6 * math.sin(s * 5.2 + t * 2.4 + c['phase'] * 0.8)
        ny = -0.35 * (1 - t) + 0.1
        return norm((nx, ny, 0.8))

    prims.append(Poly('cape', 'cloak', 0.8, pts, nf=cape_normal, shade=0.92))

    # ---------- tronco ----------
    prims.append(Capsule('belly', 'cloth', 3.0, add(hip, u, 1.0), add(neck, u, -3.0), 4.6, 5.2))
    chest = add(add(neck, u, -5.5), f, 0.8)
    prims.append(Ellipse('chest', 'steel', 3.6, chest, 5.0, 4.8, ang=lean))
    # saia/tabardo
    sk = [add(add(hip, f, -5.0), u, 2.0), add(add(hip, f, 5.2), u, 2.0), add(add(hip, f, 6.6), u, -7.5),
          add(add(hip, f, 0.6), u, -6.0), add(add(hip, f, -6.2), u, -7.8)]
    prims.append(Poly('skirt', 'cloth', 3.4, sk, nf=lambda x, y: norm((-(0.1), -0.25, 0.95)), shade=0.95))
    belt_y = add(hip, u, 1.6)
    prims.append(Capsule('belt', 'leather', 3.5, add(belt_y, f, -5.3), add(belt_y, f, 5.4), 1.1, 1.1))
    prims.append(Ellipse('buckle', 'gold', 3.55, add(belt_y, f, 3.0), 1.0, 1.0))

    # ---------- capuz e máscara ----------
    tilt = math.radians(p['tilt'])
    hl = lambda q: add(head, rot(q, tilt))
    ht = p['hoodtip']
    tip = [hl((-2.5, -9.6)), hl((-8.5, -7.2)), hl((-12.5, -2.5 )), hl((-15.0 + ht[0], 3.5 + ht[1])),
           hl((-11.2, 0.4)), hl((-8.0, 2.5)), hl((-5.0, 1.0))]
    prims.append(Poly('hoodtip', 'cloak', 5.0, tip, nf=lambda x, y: norm((-0.35, -0.55, 0.75))))
    prims.append(Ellipse('hood', 'cloak', 5.1, head, 9.6, 10.0, ang=tilt, bulge=0.9))
    prims.append(Ellipse('capelet', 'cloak', 4.6, add(neck, u, -1.6), 7.6, 4.6, ang=lean))
    face_c = hl((2.8, 1.2))
    prims.append(Ellipse('face', 'void', 5.2, face_c, 6.2, 7.9, ang=tilt, flat=1))
    mask_c = hl((5.0, 1.8))
    mask = Ellipse('mask', 'porcelain', 5.5, mask_c, 5.3, 6.8, ang=tilt, bulge=0.7)
    prims.append(mask)
    # borda interna do capuz (forro escuro em volta do rosto)
    rim = Ellipse('hoodrim', 'lining', 5.15, face_c, 6.9, 8.4, ang=tilt)
    prims.append(rim)

    def seg_dist(x, y, a, b):
        vx, vy = b[0] - a[0], b[1] - a[1]
        L2 = vx * vx + vy * vy or 1e-6
        t = max(0.0, min(1.0, ((x - a[0]) * vx + (y - a[1]) * vy) / L2))
        return math.hypot(x - a[0] - vx * t, y - a[1] - vy * t)

    crack = [[(1.2, -4.4), (0.0, -3.0), (-0.1, -1.6), (0.6, 0.8), (-0.3, 3.2), (0.5, 6.3)],
             [(-0.1, -1.6), (-2.6, 1.6), (-3.6, 3.6)]]
    chunk = [(0.6, -6.9), (4.4, -5.6), (5.4, -2.6), (3.6, -3.1), (2.6, -4.6), (1.2, -4.4)]
    chunk_poly = Poly('chunk', 'void', 0, chunk)

    def mask_decal(x, y, cur):
        lx, ly = mask.local(x, y)
        state = p['mask']
        # olhos
        if ((lx - 2.0) / 1.75) ** 2 + ((ly + 0.9 + 0.25 * (lx - 2.0)) / 1.15) ** 2 <= 1.0:
            if p['glow'] and abs(lx - 2.1) < 0.55 and abs(ly + 1.0) < 0.55:
                return ('gold', 4)
            return ('void', 0)
        if ((lx + 2.0) / 1.25) ** 2 + ((ly + 0.9 - 0.25 * (lx + 2.0)) / 1.1) ** 2 <= 1.0:
            return ('void', 0)
        # boca fina
        if 2.9 < ly < 3.6 and -0.4 < lx < 2.2:
            return ('porcelain', 1)
        if state == 'partida' and chunk_poly.inside(lx, ly):
            return ('void', 1)
        if state == 'partida':
            # brilho dourado na borda do pedaço que falta
            for i in range(len(chunk)):
                if seg_dist(lx, ly, chunk[i], chunk[(i + 1) % len(chunk)]) < 0.5:
                    return ('gold', 3)
        for line in crack:
            for i in range(len(line) - 1):
                if seg_dist(lx, ly, line[i], line[i + 1]) < 0.42:
                    return ('gold', 3 if state != 'partida' else 2)
        return None

    decals.append(Decal('mask', mask_decal))
    return prims, decals

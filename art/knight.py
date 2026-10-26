"""Modelo do Cavaleiro de Máscara Partida (o carrasco de Vespera) para o renderizador de esqueleto.

Armas: espada, foice, adagas duplas, arco, o badalo do Sineiro e o incensário do Arcebispo (liberados ao vencer cada chefe). A mão de trás pode usar cinemática inversa
para segurar o cabo da foice ou puxar a corda do arco.
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot

# bronze do sino (o mesmo do Sineiro), para o badalo
puppet.RAMPS.setdefault('bronze', [0x2e1f10, 0x5a3a18, 0x8a5c26, 0xb98a3e, 0xe4bd72])
puppet.SHINY.setdefault('bronze', (0.5, 9))
# Âmbar Mnêmico grudado na picareta do Capataz (brilha sozinho no miolo)
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
puppet.SHINY.setdefault('amber', (0.7, 16))

W, H = 144, 120
BASE_HIP = (72.0, 87.0)
FEET = (72, 106)

DEFAULT = dict(
    hip=(0.0, 0.0), lean=0.0, head=(0.0, 0.0), tilt=0.0,
    legF=(6.0, 4.0), legB=(-5.0, 4.0), footF=0.0, footB=0.0,
    armF=(-8.0, 30.0), armB=(10.0, 20.0),
    wpn=None,      # ângulo da arma (graus: 0 = para baixo, 90 = para frente, 180 = para cima)
    wpnB=None,     # ângulo da segunda adaga
    grip=None,     # foice: quanto do cabo fica atrás da mão
    blade=1,       # foice: lado da lâmina (1 = no sentido do golpe)
    droop=6.0,     # foice: curvatura da lâmina
    bow=90.0,      # arco: direção da flecha
    draw=0.0,      # arco: quanto a corda está puxada (0..1)
    nock=False,    # arco: flecha encaixada
    ikB=None,      # mão de trás por cinemática inversa: ('staff', s) | ('string',) | (dx, dy)
    zB=0.5,        # profundidade do braço de trás
    cape=dict(lift=8.0, wave=4.0, phase=0.0, length=1.0, flare=0.0),
    hoodtip=(0.0, 0.0), mask='partida', glow=False,
    hot=False,     # incensário: os furos acesos no golpe
    lash=False,    # corrente: lá fora no golpe (o jogo desenha), na mão só a volta enrolada
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


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def dirv(deg):
    a = math.radians(deg)
    return (math.sin(a), math.cos(a))


def seg_dist(x, y, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]
    L2 = vx * vx + vy * vy or 1e-6
    t = max(0.0, min(1.0, ((x - a[0]) * vx + (y - a[1]) * vy) / L2))
    return math.hypot(x - a[0] - vx * t, y - a[1] - vy * t)


def poly_dist(x, y, pts):
    return min(seg_dist(x, y, pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def ik(root, target, l1, l2, bend=1):
    """Cotovelo para que a mão alcance o alvo (2 ossos)."""
    dx, dy = target[0] - root[0], target[1] - root[1]
    d = math.hypot(dx, dy)
    d = max(abs(l1 - l2) + 0.05, min(l1 + l2 - 0.05, d))
    a = math.atan2(dy, dx)
    c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
    b = math.acos(max(-1.0, min(1.0, c)))
    e = a + b * bend
    return (root[0] + math.cos(e) * l1, root[1] + math.sin(e) * l1)


def build(pose, weapon='sword'):
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

    # ---------- braço da frente ----------
    def arm_fk(root, ang):
        up, el = ang
        elbow = add(root, dirv(up), 7.0)
        hand = add(elbow, dirv(up + el), 6.3)
        return elbow, hand, up + el

    def arm_prims(root, elbow, hand, z, shade):
        prims.append(Capsule('upperarm', 'cloth', z, root, elbow, 2.4, 2.1, shade=shade))
        prims.append(Capsule('forearm', 'steel', z + 0.05, elbow, hand, 2.2, 2.0, shade=shade))
        prims.append(Ellipse('hand', 'leather', z + 0.1, hand, 1.9, 1.9, shade=shade))

    elbowF, handF, foreAng = arm_fk(shF, p['armF'])
    arm_prims(shF, elbowF, handF, 7.0, 1.0)

    # ---------- arma ----------
    wa = p['wpn'] if p['wpn'] is not None else foreAng
    sd = dirv(wa)
    sp = (sd[1], -sd[0])
    back_target = None

    if weapon == 'sword':
        g0 = add(handF, sd, 1.6)
        prims.append(Capsule('blade', 'steel', 6.5, add(handF, sd, 2.0), add(handF, sd, 23.0), 1.35, 0.55))
        prims.append(Capsule('guard', 'gold', 6.6, add(g0, sp, -3.6), add(g0, sp, 3.6), 1.0, 1.0))
        prims.append(Ellipse('pommel', 'gold', 6.6, add(handF, sd, -2.6), 1.3, 1.3))

    elif weapon == 'scythe':
        grip = p['grip'] if p['grip'] is not None else 14.0
        LEN = 46.0
        butt = add(handF, sd, -grip)
        top = add(handF, sd, LEN - grip)
        prims.append(Capsule('staff', 'ebony', 6.4, butt, top, 1.2, 1.0))
        prims.append(Ellipse('ferrule', 'gold', 6.45, add(butt, sd, 0.8), 1.5, 1.5))
        prims.append(Ellipse('collar', 'gold', 6.45, add(top, sd, -2.2), 1.6, 1.6))
        prims.append(Ellipse('collar', 'gold', 6.45, add(top, sd, -6.0), 1.35, 1.35))
        # lâmina em meia-lua: sai do topo, curva para fora e cai na ponta
        bd = (-sp[0] * p['blade'], -sp[1] * p['blade'])
        L = 22.0
        spine, edge = [], []
        for i in range(13):
            t = i / 12
            a_off = 3.2 * math.sin(math.pi * t) - p['droop'] * t * t
            pt = add(add(top, bd, L * t), sd, a_off + 1.0)
            w = 5.6 * (1 - t) ** 0.75 + 0.35
            spine.append(pt)
            edge.append(add(pt, sd, -w))
        blade = Poly('scytheblade', 'steel', 6.5, spine + edge[::-1], nf=lambda x, y: norm((-0.35, -0.55, 0.8)))
        prims.append(blade)

        def blade_decal(x, y, cur, edge=edge, spine=spine):
            if poly_dist(x, y, edge[1:]) < 0.85:
                return ('steel', 4)
            if poly_dist(x, y, spine[:-2]) < 0.75:
                return ('steel', 1)
            return None

        decals.append(Decal('scytheblade', blade_decal))
        if p['ikB'] and p['ikB'][0] == 'staff':
            back_target = add(handF, sd, p['ikB'][1])

    elif weapon == 'daggers':
        def dagger(hand, d, z, shade):
            dp = (d[1], -d[0])
            g0 = add(hand, d, 1.5)
            prims.append(Capsule('dblade', 'steel', z, add(hand, d, 1.8), add(hand, d, 12.5), 1.2, 0.45, shade=shade))
            prims.append(Capsule('dguard', 'gold', z + 0.05, add(g0, dp, -2.4), add(g0, dp, 2.4), 0.85, 0.85, shade=shade))
            prims.append(Ellipse('dpommel', 'gold', z + 0.05, add(hand, d, -2.2), 1.05, 1.05, shade=shade))
        dagger(handF, sd, 6.5, 1.0)

    elif weapon == 'bow':
        ad = dirv(p['bow'])
        lp = (ad[1], -ad[0])
        bend = 4.0 + 3.0 * p['draw']
        pts = []
        for i in range(-10, 11):
            s = i / 10
            q = add(add(handF, lp, 13.5 * s), ad, -bend * s * s)
            if abs(s) > 0.82:
                q = add(q, ad, 2.0 * (abs(s) - 0.82) / 0.18)
            pts.append(q)
        for i in range(len(pts) - 1):
            s = abs((i + 0.5) / 10 - 1)
            r = 1.45 - 0.75 * s
            prims.append(Capsule('limb', 'wood', 7.3, pts[i], pts[i + 1], r, r))
        prims.append(Ellipse('tip', 'gold', 7.32, pts[0], 1.1, 1.1))
        prims.append(Ellipse('tip', 'gold', 7.32, pts[-1], 1.1, 1.1))
        prims.append(Capsule('bowgrip', 'leather', 7.35, add(handF, lp, -2.2), add(handF, lp, 2.2), 1.7, 1.7))
        tipA, tipB = pts[0], pts[-1]
        mid = ((tipA[0] + tipB[0]) / 2, (tipA[1] + tipB[1]) / 2)
        nockp = add(mid, ad, -10.5 * p['draw'])
        prims.append(Capsule('string', 'string', 7.1, tipA, nockp, 0.55, 0.55, flat=3))
        prims.append(Capsule('string', 'string', 7.1, nockp, tipB, 0.55, 0.55, flat=3))
        if p['nock']:
            head_p = add(nockp, ad, 21.0)
            prims.append(Capsule('shaft', 'wood', 7.2, nockp, head_p, 0.6, 0.6))
            ap = (ad[1], -ad[0])
            prims.append(Poly('arrowhead', 'steel', 7.25, [add(head_p, ap, 1.8), add(head_p, ad, 4.0), add(head_p, ap, -1.8)]))
            for side in (1, -1):
                prims.append(Capsule('fletch', 'cloak', 7.22, add(nockp, ad, 1.0), add(add(nockp, ad, 4.5), ap, 1.3 * side), 0.6, 0.5))
        if p['ikB'] and p['ikB'][0] == 'string':
            back_target = nockp

    elif weapon == 'badalo':
        # o badalo do grande sino: cabo de aço com argola no pé e uma bola de bronze na ponta
        grip = p['grip'] if p['grip'] is not None else 7.0
        LEN = 26.0
        butt = add(handF, sd, -grip)
        top = add(handF, sd, LEN - grip)
        prims.append(Capsule('haft', 'steel', 6.4, butt, top, 1.15, 1.0, shade=0.9))
        prims.append(Ellipse('ring', 'steel', 6.42, add(butt, sd, -1.8), 2.1, 2.1))
        prims.append(Ellipse('ringhole', 'void', 6.44, add(butt, sd, -1.8), 0.8, 0.8))
        prims.append(Capsule('bcollar', 'bronze', 6.5, add(top, sd, -2.4), add(top, sd, 0.8), 1.9, 2.2))
        ball_c = add(top, sd, 5.4)
        ball = Ellipse('ball', 'bronze', 6.55, ball_c, 5.8, 5.8)
        prims.append(ball)

        # uma faixa escura e a rachadura do bronze, como no sino do Sineiro
        def ball_decal(x, y, cur, ball=ball, sd=sd):
            lx, ly = x - ball_c[0], y - ball_c[1]
            along = lx * sd[0] + ly * sd[1]
            across = lx * sd[1] - ly * sd[0]
            if abs(along + 1.4) < 0.6:
                return ('bronze', 1)
            if abs(across - 1.6 - along * 0.35) < 0.45 and -4.6 < along < 1.2:
                return ('void', 2)
            return None

        decals.append(Decal('ball', ball_decal))
        if p['ikB'] and p['ikB'][0] == 'staff':
            back_target = add(handF, sd, p['ikB'][1])

    elif weapon == 'picareta':
        # a picareta do Capataz: cabo de madeira com duas cintas de ferro e a cabeça de ferro de
        # través, com a ponta fina curvada de um lado, a pá larga do outro e lascas de Âmbar grudadas
        grip = p['grip'] if p['grip'] is not None else 7.0
        LEN = 24.0
        butt = add(handF, sd, -grip)
        top = add(handF, sd, LEN - grip)
        prims.append(Capsule('haft', 'wood', 6.4, butt, top, 1.15, 1.0, shade=0.95))
        for t in (0.22, 0.72):
            c = add(butt, sd, LEN * t)
            prims.append(Capsule('band', 'steel', 6.42, add(c, sd, -0.7), add(c, sd, 0.7), 1.4, 1.4))
        side = (sd[1], -sd[0])
        hc = add(top, sd, -1.2)

        def H(a, b):
            return add(add(hc, side, a), sd, -b)

        outline = [H(-5.8, -1.2), H(-6.0, 2.2), H(-4.6, 2.0), H(-1.6, 1.7), H(2.6, 1.6), H(6.4, 2.6), H(9.6, 4.6),
                   H(10.4, 4.4), H(7.4, 1.4), H(3.0, -1.5), H(-1.6, -1.9)]
        prims.append(Poly('phead', 'steel', 6.55, outline, nf=lambda x, y: norm((0.0, -0.6, 0.8)), shade=0.95))
        prims.append(Capsule('peye', 'steel', 6.57, H(-0.9, -2.0), H(-0.9, 2.0), 1.6, 1.6, shade=0.8))
        for (a, b, r) in ((-4.4, 0.6, 0.9), (4.6, 0.6, 0.8), (7.6, 2.4, 0.6)):
            prims.append(Ellipse('pamber', 'amber', 6.6, H(a, b), r, r * 0.8, flat=3))
        if p['ikB'] and p['ikB'][0] == 'staff':
            back_target = add(handF, sd, p['ikB'][1])

    elif weapon == 'incensario':
        # o incensário do Arcebispo: corrente curta na mão e o incensário de ouro na ponta
        L = 12.0
        ring = add(handF, sd, L)
        cc = add(ring, sd, 5.4)
        n = 6
        prev = handF
        for i in range(1, n + 1):
            q = add(handF, sd, L * i / n)
            prims.append(Ellipse('link', 'steel', 6.42, ((prev[0] + q[0]) / 2, (prev[1] + q[1]) / 2), 1.2, 0.6,
                                 ang=math.atan2(q[1] - prev[1], q[0] - prev[0]), flat=3 if i % 2 else 1))
            prev = q
        prims.append(Ellipse('cring', 'gold', 6.5, ring, 1.1, 1.1))
        side = (sd[1], -sd[0])
        lid = [add(add(cc, sd, -1.8), side, -3.7), add(add(cc, sd, -1.8), side, 3.7), add(add(cc, sd, -5.2), side, 0.7), add(add(cc, sd, -5.2), side, -0.7)]
        prims.append(Poly('clid', 'gold', 6.55, lid, nf=lambda x, y: norm((-0.35, -0.55, 0.75)), shade=0.92))
        ball = Ellipse('cball', 'gold', 6.52, add(cc, sd, 0.9), 4.2, 4.2, bulge=0.95)
        prims.append(ball)
        bc = add(cc, sd, 0.9)

        def holes(x, y, cur, bc=bc, sd=sd, side=side, hot=p['hot']):
            lx = (x - bc[0]) * side[0] + (y - bc[1]) * side[1]
            ly = (x - bc[0]) * sd[0] + (y - bc[1]) * sd[1]
            if abs(ly) < 0.9 and abs(lx) < 3.4 and int(lx + 10) % 2 == 0:
                return ('gold', 4) if hot else ('void', 0)
            return None

        decals.append(Decal('cball', holes))

    elif weapon == 'corrente':
        # a corrente da Carcereira: voltas enroladas no antebraço e um palmo pendurado com o gancho
        fx, fy = handF[0] - elbowF[0], handF[1] - elbowF[1]
        fl = math.hypot(fx, fy) or 1.0
        fore = (fx / fl, fy / fl)
        for i in range(2):
            c = add(elbowF, fore, 2.2 + i * 2.0)
            prims.append(Ellipse('coil', 'steel', 7.07 + i * 0.01, c, 0.9, 2.5, ang=math.atan2(fore[1], fore[0]), flat=3 if i % 2 else 2))
        if not p['lash']:
            L = 13.0
            n = 6
            prev = handF
            for i in range(1, n + 1):
                q = add(handF, sd, L * i / n)
                prims.append(Ellipse('link', 'steel', 6.42, ((prev[0] + q[0]) / 2, (prev[1] + q[1]) / 2), 1.2, 0.6,
                                     ang=math.atan2(q[1] - prev[1], q[0] - prev[0]), flat=3 if i % 2 else 1))
                prev = q
            side = sp if sp[1] <= 0 else (-sp[0], -sp[1])
            tip = add(prev, sd, 3.6)
            prims.append(Ellipse('hring', 'steel', 6.44, prev, 1.0, 1.0))
            prims.append(Capsule('hshaft', 'steel', 6.45, prev, tip, 0.8, 0.7))
            bend = add(add(tip, side, 2.2), sd, -0.8)
            prims.append(Capsule('hbend', 'steel', 6.46, tip, bend, 0.7, 0.55))
            barb = add(add(bend, side, 0.3), sd, -2.0)
            prims.append(Capsule('hbarb', 'steel', 6.47, bend, barb, 0.55, 0.3))

    # ---------- braço de trás ----------
    if back_target is None and p['ikB'] and isinstance(p['ikB'][0], (int, float)):
        back_target = add(hip, p['ikB'])
    if back_target is not None:
        elbowB = ik(shB, back_target, 7.0, 6.3, bend=1)
        dB = sub(back_target, elbowB)
        lB = math.hypot(*dB) or 1
        handB = add(elbowB, (dB[0] / lB, dB[1] / lB), 6.3)
        foreB = math.degrees(math.atan2(dB[0], dB[1]))
    else:
        elbowB, handB, foreB = arm_fk(shB, p['armB'])
    shadeB = 0.55 if p['zB'] < 2 else 0.85
    arm_prims(shB, elbowB, handB, p['zB'], shadeB)
    if weapon == 'daggers':
        wb = p['wpnB'] if p['wpnB'] is not None else foreB
        db = dirv(wb)
        dbp = (db[1], -db[0])
        g0 = add(handB, db, 1.5)
        prims.append(Capsule('dblade', 'steel', p['zB'] - 0.05, add(handB, db, 1.8), add(handB, db, 12.5), 1.2, 0.45, shade=shadeB))
        prims.append(Capsule('dguard', 'gold', p['zB'] - 0.02, add(g0, dbp, -2.4), add(g0, dbp, 2.4), 0.85, 0.85, shade=shadeB))

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
    tip = [hl((-2.5, -9.6)), hl((-8.5, -7.2)), hl((-12.5, -2.5)), hl((-15.0 + ht[0], 3.5 + ht[1])),
           hl((-11.2, 0.4)), hl((-8.0, 2.5)), hl((-5.0, 1.0))]
    prims.append(Poly('hoodtip', 'cloak', 5.0, tip, nf=lambda x, y: norm((-0.35, -0.55, 0.75))))
    prims.append(Ellipse('hood', 'cloak', 5.1, head, 9.6, 10.0, ang=tilt, bulge=0.9))
    prims.append(Ellipse('capelet', 'cloak', 4.6, add(neck, u, -1.6), 7.6, 4.6, ang=lean))
    face_c = hl((2.8, 1.2))
    prims.append(Ellipse('face', 'void', 5.2, face_c, 6.2, 7.9, ang=tilt, flat=1))
    mask_c = hl((5.0, 1.8))
    mask = Ellipse('mask', 'porcelain', 5.5, mask_c, 5.3, 6.8, ang=tilt, bulge=0.7)
    prims.append(mask)
    rim = Ellipse('hoodrim', 'lining', 5.15, face_c, 6.9, 8.4, ang=tilt)
    prims.append(rim)

    crack = [[(1.2, -4.4), (0.0, -3.0), (-0.1, -1.6), (0.6, 0.8), (-0.3, 3.2), (0.5, 6.3)],
             [(-0.1, -1.6), (-2.6, 1.6), (-3.6, 3.6)]]
    chunk = [(0.6, -6.9), (4.4, -5.6), (5.4, -2.6), (3.6, -3.1), (2.6, -4.6), (1.2, -4.4)]
    chunk_poly = Poly('chunk', 'void', 0, chunk)

    def mask_decal(x, y, cur):
        lx, ly = mask.local(x, y)
        state = p['mask']
        if ((lx - 2.0) / 1.75) ** 2 + ((ly + 0.9 + 0.25 * (lx - 2.0)) / 1.15) ** 2 <= 1.0:
            if p['glow'] and abs(lx - 2.1) < 0.55 and abs(ly + 1.0) < 0.55:
                return ('gold', 4)
            return ('void', 0)
        if ((lx + 2.0) / 1.25) ** 2 + ((ly + 0.9 - 0.25 * (lx + 2.0)) / 1.1) ** 2 <= 1.0:
            return ('void', 0)
        if 2.9 < ly < 3.6 and -0.4 < lx < 2.2:
            return ('porcelain', 1)
        if state == 'partida' and chunk_poly.inside(lx, ly):
            return ('void', 1)
        if state == 'partida':
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

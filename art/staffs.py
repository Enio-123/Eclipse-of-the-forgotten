"""Os cajados dos quatro magos, para o boneco do cavaleiro (knight.py) e para as ilustrações grandes
da escolha do mago (staff_art.py).

- Eclipse: o desenho do Enio. Pomo de metal, cabo enrolado com fio de latão, a cabeça mecânica
  (canos dos lados, um mostrador e o botão vermelho), a esfera negra com a coroa laranja e as
  chamas em cruz, dois anéis de metal e a lança negra de borda acesa.
- Necromante (Cajado do Grimório): madeira escura com nós, ponteira de ferro, voltas de osso, um
  talismã de papel pendurado, o gancho de vértebras e a lanterna com a chama fria das lembranças.
- Véu Abissal: tinta endurecida torcida, a forquilha de duas pontas e a membrana roxa esticada no
  meio, com o olho fechado do abismo; uma gota de tinta pendurada no pé.
- Espaço (Cajado da Dobra): prata com sulcos, o berço de três garras segurando o núcleo de céu
  noturno, dois anéis de giroscópio em volta e três pedras soltas no ar.

draw(kind, p, hand, sd, prims, decals, z) desenha o cajado com a mão em `hand` e o eixo `sd` (do pé
para a ponta); devolve (alvo da mão de trás ou None, ponto do foco) — o foco é de onde a magia sai
(a esfera, a lanterna, a membrana, o núcleo).
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm

STAFFS = ('eclipse', 'necro', 'veu', 'espaco')

R = puppet.RAMPS
R.setdefault('eclipse', [0x8a3204, 0xc85a0c, 0xf28c22, 0xffb347, 0xffe0a0])
R.setdefault('ruby', [0x3a0606, 0x6e0c0c, 0xa81818, 0xe03a2a, 0xff8a6a])
R.setdefault('soul', [0x1e5a52, 0x2f8c7c, 0x5cc4ac, 0x9ee8d2, 0xe2fff4])
R.setdefault('abyss', [0x030205, 0x09070d, 0x150d22, 0x3b1d66, 0x7029b8])
R.setdefault('abyssglow', [0x2a0f4a, 0x4b1d80, 0x7029b8, 0xb27fea, 0xd8b7ff])
R.setdefault('membrane', [0x2a0d3d, 0x4a1a66, 0x6e2a8e, 0x9a4cc0, 0xc890e8])
R.setdefault('silver', [0x2a2f3c, 0x4e5668, 0x7e889c, 0xb4bccc, 0xe8eef8])
R.setdefault('lens', [0x06061a, 0x0e1238, 0x1c2668, 0x3046a0, 0x6a8ce0])
R.setdefault('rock', [0x1c1a1e, 0x302c30, 0x4a4448, 0x6a6266, 0x8e8588])
R.setdefault('paper', [0x3a3226, 0x6a5c46, 0x9c8b6c, 0xc9b892, 0xece0be])
puppet.SHINY.setdefault('silver', (0.6, 12))
puppet.SHINY.setdefault('lens', (0.8, 20))

# o que cada cajado tem de comprimento (do pé à ponta) e onde a mão segura (a partir do pé)
LEN = {'eclipse': 45.0, 'necro': 40.0, 'veu': 40.0, 'espaco': 40.0}
GRIP = {'eclipse': 13.0, 'necro': 12.0, 'veu': 12.0, 'espaco': 12.0}
# a cor da magia de cada um (o jogo usa as mesmas)
COLOR = {'eclipse': 0xf28c22, 'necro': 0x7fe0c8, 'veu': 0xb27fea, 'espaco': 0x8fb4ff}


def _add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def _seg(x, y, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]
    L2 = vx * vx + vy * vy or 1e-6
    t = max(0.0, min(1.0, ((x - a[0]) * vx + (y - a[1]) * vy) / L2))
    return math.hypot(x - a[0] - vx * t, y - a[1] - vy * t)


class Frame:
    """Coordenadas do cajado: t ao longo do eixo (a partir do pé), s para o lado da frente."""

    def __init__(self, butt, sd, k=1.0):
        self.o, self.sd, self.k = butt, sd, k
        # a frente: o lado para onde o cavaleiro olha quando o cajado está em pé
        self.fw = (-sd[1], sd[0])

    def A(self, t, s=0.0):
        k = self.k
        return (self.o[0] + self.sd[0] * t * k + self.fw[0] * s * k, self.o[1] + self.sd[1] * t * k + self.fw[1] * s * k)

    def local(self, x, y):
        dx, dy = x - self.o[0], y - self.o[1]
        return ((dx * self.sd[0] + dy * self.sd[1]) / self.k, (dx * self.fw[0] + dy * self.fw[1]) / self.k)

    @property
    def ang(self):
        # ângulo de uma elipse com o eixo y ao longo do cajado
        return math.atan2(-self.sd[0], self.sd[1])


def draw(kind, p, hand, sd, prims, decals, z=6.4, k=1.0, grip=None):
    g = grip if grip is not None else (p.get('grip') if p.get('grip') is not None else GRIP[kind])
    butt = (hand[0] - sd[0] * g * k, hand[1] - sd[1] * g * k)
    F = Frame(butt, sd, k)
    focus = {'eclipse': _eclipse, 'necro': _necro, 'veu': _veu, 'espaco': _espaco}[kind](F, prims, decals, z, p)
    back = None
    ik = p.get('ikB')
    if ik and ik[0] == 'staff':
        back = F.A(g + ik[1])
    return back, focus


# ------------------------------------------------------------------ Eclipse (arte do Enio)
def _eclipse(F, P, D, z, p):
    A, k = F.A, F.k
    ang = F.ang
    # pomo: o bulbo de metal com a tampa e o pescoço anelado
    P.append(Capsule('ecap', 'steel', z, A(-0.4), A(0.6), 0.8 * k, 0.9 * k))
    P.append(Ellipse('epommel', 'steel', z + 0.01, A(2.4), 1.9 * k, 2.6 * k, ang=ang, bulge=0.9))
    P.append(Capsule('eneck', 'steel', z, A(4.6), A(6.0), 0.85 * k, 0.85 * k, shade=0.85))
    P.append(Ellipse('ering', 'steel', z + 0.02, A(5.3), 1.25 * k, 0.55 * k, ang=ang))
    # cabo de couro enrolado com fio de latão
    P.append(Capsule('egrip', 'leather', z, A(5.8), A(21.8), 1.05 * k, 1.05 * k))

    def wrap(x, y, cur):
        t, s = F.local(x, y)
        if not 6.2 < t < 21.4:
            return None
        u = (t * 0.95 + s * 1.5) % 2.4
        if u < 0.42:
            return ('gold', 3)
        if u < 0.62:
            return ('gold', 1)
        return None
    D.append(Decal('egrip', wrap))
    # a cabeça mecânica: bloco de metal com cantos chanfrados
    head = [A(21.4, -2.3), A(22.4, -3.4), A(27.4, -3.4), A(28.6, -2.5), A(28.6, 2.5), A(27.4, 3.4), A(22.4, 3.4), A(21.4, 2.3)]
    P.append(Poly('ehead', 'steel', z + 0.04, head, nf=lambda x, y: norm((F.local(x, y)[1] * 0.08 * F.fw[0] - 0.25, -0.35, 0.9)), shade=0.95))
    gauge = A(24.8, 0.6)
    button = A(26.6, -1.9)

    def headdec(x, y, cur):
        t, s = F.local(x, y)
        dg = math.hypot(x - gauge[0], y - gauge[1]) / k
        if dg < 0.75:
            return ('steel', 4) if dg < 0.35 else ('void', 1)
        if dg < 1.35:
            return ('steel', 1)
        if math.hypot(x - button[0], y - button[1]) / k < 0.62:
            return ('ruby', 3)
        if abs(t - 22.9) < 0.28 or abs(t - 27.6) < 0.28:
            return ('steel', 0)
        if abs(s + 1.9) < 0.22 and 22.9 < t < 25.4:
            return ('steel', 1)
        return None
    D.append(Decal('ehead', headdec))
    # os canos que saem dos lados da cabeça e voltam
    for side in (-1, 1):
        a, b, c = A(22.6, 3.3 * side), A(24.8, 4.7 * side), A(27.0, 3.3 * side)
        P.append(Capsule('epipe', 'steel', z + 0.05, a, b, 0.6 * k, 0.6 * k, shade=0.82))
        P.append(Capsule('epipe', 'steel', z + 0.05, b, c, 0.6 * k, 0.6 * k, shade=0.82))
    P.append(Capsule('ecollar', 'steel', z + 0.03, A(28.4), A(29.4), 1.4 * k, 1.25 * k))
    # a esfera negra, a coroa laranja atrás e as chamas em cruz
    C = A(32.4)
    for a_deg, L, w in ((90, 7.2, 1.5), (-90, 7.2, 1.5), (140, 4.8, 1.1), (-140, 4.8, 1.1), (30, 4.2, 0.9), (-30, 4.2, 0.9)):
        a = math.radians(a_deg)
        dvec = (F.sd[0] * math.cos(a) + F.fw[0] * math.sin(a), F.sd[1] * math.cos(a) + F.fw[1] * math.sin(a))
        perp = (-dvec[1], dvec[0])
        base = _add(C, dvec, 2.6 * k)
        tip = _add(C, dvec, (2.6 + L) * k)
        P.append(Poly('eflare', 'eclipse', z + 0.02, [_add(base, perp, w * k), _add(_add(base, dvec, L * 0.45 * k), perp, w * 0.45 * k), tip,
                                                        _add(_add(base, dvec, L * 0.45 * k), perp, -w * 0.45 * k), _add(base, perp, -w * k)],
                      nf=lambda x, y: (0.0, -0.3, 0.95), shade=1.15))
    P.append(Ellipse('ecorona', 'eclipse', z + 0.03, C, 4.0 * k, 4.0 * k, shade=1.2))
    P.append(Ellipse('esphere', 'void', z + 0.06, C, 3.05 * k, 3.05 * k, bulge=0.6))

    def drips(x, y, cur):
        # gotas negras escorrendo da esfera para a coroa (como no desenho)
        lx, ly = (x - C[0]) / k, (y - C[1]) / k
        r = math.hypot(lx, ly)
        a = math.atan2(ly, lx)
        if 3.1 < r < 3.8 and any(abs(((a - q + math.pi) % (2 * math.pi)) - math.pi) < 0.12 for q in (0.7, 2.3, -1.6, -2.7)):
            return ('void', 1)
        if abs(r - 3.9) < 0.28:
            return ('eclipse', 4)
        return None
    D.append(Decal('ecorona', drips))
    # a lança negra de borda acesa e os dois anéis de metal em volta da base
    hw = lambda t: 1.55 * max(0.0, 1 - (t - 35.0) / 15.5) ** 0.8
    ts = [35.0, 38.0, 41.0, 44.0, 47.0, 50.5]
    spike = [A(t, -hw(t)) for t in ts] + [A(t, hw(t)) for t in ts[::-1]]
    P.append(Poly('espike', 'eclipse', z + 0.05, spike, nf=lambda x, y: (0.0, -0.3, 0.95), shade=1.1))

    def core(x, y, cur):
        t, s = F.local(x, y)
        w = hw(t)
        if abs(s) < w * 0.5:
            return ('void', 1)
        if s > w * 0.72:
            return ('eclipse', 4)
        return None
    D.append(Decal('espike', core))
    P.append(Ellipse('eband', 'steel', z + 0.08, A(36.2), 2.7 * k, 0.75 * k, ang=ang + math.pi / 2, shade=1.0))
    P.append(Ellipse('eband', 'steel', z + 0.08, A(38.2), 2.3 * k, 0.65 * k, ang=ang + math.pi / 2, shade=0.95))
    return C


# ------------------------------------------------------------------ Necromante
def _necro(F, P, D, z, p):
    A, k = F.A, F.k
    ang = F.ang
    P.append(Poly('nferrule', 'steel', z, [A(-1.4), A(1.8, -1.0), A(2.6, -0.9), A(2.6, 0.9), A(1.8, 1.0)], nf=lambda x, y: (0.0, -0.3, 0.95)))
    P.append(Capsule('nshaft', 'ebony', z, A(2.0), A(31.6), 0.95 * k, 0.9 * k))
    for t, s in ((9.6, 0.35), (18.8, -0.3)):
        P.append(Ellipse('nknot', 'ebony', z + 0.01, A(t, s), 1.3 * k, 1.0 * k, ang=ang, shade=1.05))
    for t in (22.0, 23.3, 24.6):
        P.append(Ellipse('nwrap', 'bone', z + 0.02, A(t), 1.35 * k, 0.55 * k, ang=ang + math.pi / 2, shade=0.95))
    # o talismã pendurado do lado de fora (cai para baixo, não acompanha o cajado)
    t0 = A(23.3, 1.1)
    down = (0.0, 1.0)
    tal = [_add(t0, (-1.1 * k, 0)), _add(t0, (1.1 * k, 0)), _add(t0, (1.0 * k, 6.0 * k)), _add(t0, (0.0, 6.9 * k)), _add(t0, (-1.0 * k, 6.0 * k))]
    P.append(Poly('ntalisman', 'paper', z + 0.03, tal, nf=lambda x, y: (0.0, -0.2, 0.98), shade=0.95))

    def glyph(x, y, cur):
        lx, ly = (x - t0[0]) / k, (y - t0[1]) / k
        if abs(lx) < 0.22 and 1.0 < ly < 5.2:
            return ('void', 1)
        if abs(ly - 2.2) < 0.2 and abs(lx) < 0.7:
            return ('void', 1)
        if abs(ly - 3.8 - lx * 0.4) < 0.2 and abs(lx) < 0.7:
            return ('void', 1)
        return None
    D.append(Decal('ntalisman', glyph))
    # o gancho de vértebras: sobe e curva para a frente, descendo na ponta
    O = A(33.0, 3.2)
    Rr = 3.2
    pts = []
    for i in range(8):
        phi = math.radians(i * 200 / 7)
        q = _add(_add(O, F.fw, -math.cos(phi) * Rr * k), F.sd, math.sin(phi) * Rr * k)
        pts.append(q)
    for i, q in enumerate(pts):
        r = (1.3 - 0.06 * i) * k
        P.append(Ellipse('nvert', 'bone', z + 0.03 + i * 0.002, q, r, r * 0.85, ang=ang + i * 0.4, shade=1.0))
    # a lanterna pendurada na ponta: duas argolas de corrente e a gaiola com a chama fria
    end = pts[-1]
    l1 = _add(end, down, 1.4 * k)
    l2 = _add(end, down, 2.7 * k)
    P.append(Ellipse('nlink', 'steel', z + 0.04, l1, 0.5 * k, 0.75 * k))
    P.append(Ellipse('nlink', 'steel', z + 0.04, l2, 0.5 * k, 0.75 * k))
    Lc = _add(end, down, 5.6 * k)
    P.append(Capsule('ncap', 'steel', z + 0.07, _add(Lc, (-1.5 * k, -2.5 * k)), _add(Lc, (1.5 * k, -2.5 * k)), 0.55 * k, 0.55 * k))
    P.append(Capsule('ncap', 'steel', z + 0.07, _add(Lc, (-1.3 * k, 2.4 * k)), _add(Lc, (1.3 * k, 2.4 * k)), 0.5 * k, 0.5 * k))
    P.append(Ellipse('nlamp', 'soul', z + 0.05, Lc, 1.9 * k, 2.4 * k, shade=1.25))

    def bars(x, y, cur):
        lx, ly = (x - Lc[0]) / k, (y - Lc[1]) / k
        if abs(abs(lx) - 1.1) < 0.2:
            return ('steel', 1)
        # a chama dentro: o miolo claro e a ponta subindo
        if (lx / 0.75) ** 2 + ((ly - 0.4) / 1.2) ** 2 < 1:
            return ('soul', 4)
        return None
    D.append(Decal('nlamp', bars))
    return Lc


# ------------------------------------------------------------------ Véu Abissal
def _veu(F, P, D, z, p):
    A, k = F.A, F.k
    P.append(Ellipse('vdrop', 'abyss', z, A(-0.9), 0.8 * k, 1.4 * k, ang=F.ang, shade=1.1))
    P.append(Capsule('vshaft', 'abyss', z, A(-0.2), A(30.0), 1.0 * k, 1.15 * k, shade=1.15))

    def twist(x, y, cur):
        t, s = F.local(x, y)
        u = (t * 1.1 + s * 2.4) % 3.2
        if u < 0.5:
            return ('abyssglow', 2)
        if u < 0.9:
            return ('abyss', 3)
        return None
    D.append(Decal('vshaft', twist))
    # a forquilha: duas pontas que abrem e fecham de novo, com a membrana entre elas
    prong = [(29.4, 0.7), (32.8, 2.7), (36.6, 3.4), (39.6, 2.6), (41.6, 1.2)]
    for side in (-1, 1):
        q = [A(t, s * side) for t, s in prong]
        for i in range(len(q) - 1):
            r0 = (0.95 - 0.12 * i) * k
            P.append(Capsule('vprong', 'abyss', z + 0.05, q[i], q[i + 1], r0, r0 - 0.1 * k, shade=1.2))
    mem = [A(t, s * 0.86) for t, s in prong] + [A(t, -s * 0.86) for t, s in prong[::-1]]
    P.append(Poly('vmembrane', 'membrane', z + 0.03, mem, nf=lambda x, y: (0.0, -0.25, 0.97), shade=1.1))
    E = A(35.4)

    def veins(x, y, cur):
        t, s = F.local(x, y)
        # o olho do abismo, fechado (uma fenda clara no meio)
        if ((t - 35.4) / 2.3) ** 2 + (s / 0.55) ** 2 < 1:
            return ('abyssglow', 4) if abs(s) < 0.2 else ('abyss', 1)
        for a in (-0.9, -0.35, 0.35, 0.9):
            if abs(s - (t - 30.0) * a * 0.55) < 0.18 and 30.5 < t < 40.5:
                return ('membrane', 4)
        return None
    D.append(Decal('vmembrane', veins))
    return E


# ------------------------------------------------------------------ Espaço (Cajado da Dobra)
def _espaco(F, P, D, z, p):
    A, k = F.A, F.k
    ang = F.ang
    P.append(Ellipse('sbutt', 'silver', z, A(0.3), 1.35 * k, 1.35 * k))
    P.append(Capsule('sshaft', 'silver', z, A(1.0), A(29.0), 0.92 * k, 0.92 * k))

    def grooves(x, y, cur):
        t, s = F.local(x, y)
        if 2 < t < 28 and (t % 3.4) < 0.32:
            return ('silver', 0)
        if 9 < t < 17 and abs(s) < 0.3:
            return ('lens', 3)
        return None
    D.append(Decal('sshaft', grooves))
    # o berço de três garras
    for side in (-1, 0, 1):
        if side == 0:
            P.append(Capsule('sclaw', 'silver', z + 0.02, A(28.6), A(30.4), 0.7 * k, 0.6 * k))
            continue
        a, b, c = A(28.6, 0.9 * side), A(31.6, 2.7 * side), A(34.6, 1.9 * side)
        P.append(Capsule('sclaw', 'silver', z + 0.07, a, b, 0.65 * k, 0.55 * k))
        P.append(Capsule('sclaw', 'silver', z + 0.07, b, c, 0.55 * k, 0.35 * k))
    C = A(33.2)
    P.append(Ellipse('score', 'lens', z + 0.05, C, 2.5 * k, 2.5 * k, shade=1.1))
    stars = [(-0.9, -0.8), (0.7, -0.2), (-0.2, 0.9), (1.1, 0.8), (0.1, -1.4)]

    def sky(x, y, cur):
        lx, ly = (x - C[0]) / k, (y - C[1]) / k
        for sx, sy in stars:
            if math.hypot(lx - sx, ly - sy) < 0.24:
                return ('silver', 4)
        return None
    D.append(Decal('score', sky))
    # dois anéis de giroscópio: a metade da frente passa por cima do núcleo, a de trás por baixo
    for tilt, rx, ry in ((0.45, 5.0, 1.5), (-0.6, 4.4, 1.3)):
        a0 = ang + math.pi / 2 + tilt
        ca, sa = math.cos(a0), math.sin(a0)
        n = 18
        prev = None
        for i in range(n + 1):
            th = 2 * math.pi * i / n
            ex, ey = math.cos(th) * rx * k, math.sin(th) * ry * k
            q = (C[0] + ex * ca - ey * sa, C[1] + ex * sa + ey * ca)
            if prev is not None:
                front = math.sin(th - math.pi / n) > 0
                P.append(Capsule('sring', 'silver', z + (0.08 if front else 0.01), prev, q, 0.32 * k, 0.32 * k, shade=1.05 if front else 0.7))
            prev = q
    # as pedras soltas em volta
    for (t, s, r, rot) in ((35.8, 5.6, 1.15, 0.3), (30.6, -5.2, 0.95, 1.1), (38.4, -3.2, 0.8, 2.0)):
        c = A(t, s)
        pts = []
        for i in range(5):
            a = rot + i * 2 * math.pi / 5
            rr = r * (1.0 if i % 2 else 0.78) * k
            pts.append((c[0] + math.cos(a) * rr, c[1] + math.sin(a) * rr))
        P.append(Poly('srock', 'rock', z + 0.09, pts, nf=lambda x, y: (-0.3, -0.5, 0.8)))
    return C

"""Animações do cavaleiro como sequências de poses, para cada arma."""
import math

TAU = math.pi * 2
WEAPONS = ['sword', 'scythe', 'daggers', 'bow', 'badalo', 'incensario']


def lerp(a, b, t):
    """Interpola duas poses (números, tuplas e a capa)."""
    out = dict(a)
    for k, vb in b.items():
        va = a.get(k)
        if va is None:
            out[k] = vb
        elif isinstance(vb, dict):
            m = dict(va)
            for kk, x in vb.items():
                y = va.get(kk, x)
                m[kk] = y + (x - y) * t
            out[k] = m
        elif isinstance(vb, tuple) and isinstance(va, tuple) and all(isinstance(q, (int, float)) for q in vb):
            out[k] = tuple(p + (q - p) * t for p, q in zip(va, vb))
        elif isinstance(vb, (int, float)) and isinstance(va, (int, float)) and not isinstance(vb, bool):
            out[k] = va + (vb - va) * t
        else:
            out[k] = vb if t >= 0.5 else va
    return out


# ---------------- golpes mais fluidos ----------------
# o que não é medida troca de uma vez no meio do caminho (lado da lâmina, flecha encaixada, brasa
# acesa, pegada de duas mãos e a profundidade do braço de trás)
STEP_KEYS = ('blade', 'nock', 'hot', 'glow', 'mask', 'ikB', 'zB')


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _cr(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3)


def _blend(a, b, c, d, t, key=''):
    if key in STEP_KEYS:
        return b if t < 0.5 else c
    if isinstance(b, dict):
        return {k: _blend(a.get(k, b[k]), b[k], c.get(k, b[k]), d.get(k, c.get(k, b[k])), t, k) for k in b}
    if all(_num(v) for v in (a, b, c, d)):
        return _cr(a, b, c, d, t)
    if all(isinstance(v, tuple) and len(v) == len(b) and all(_num(q) for q in v) for v in (a, b, c, d)):
        return tuple(_cr(a[i], b[i], c[i], d[i], t) for i in range(len(b)))
    return b if t < 0.5 else c


def smooth(keys, fps, target=54):
    """Poses intermediárias entre as poses-chave de um golpe, numa curva suave (Catmull-Rom): o
    braço e a arma passam por todos os ângulos no caminho sem parar em cada chave, e chegam
    devagar na última. A duração e o momento de cada chave continuam iguais (o golpe acerta na
    mesma hora); só entram mais quadros, num ritmo perto de `target` por segundo."""
    import knight
    m = max(1, round(target / fps))
    if m <= 1 or len(keys) < 2:
        return keys, fps
    K = [knight.P(k) for k in keys]
    n = len(K)
    out = []
    for i in range(n - 1):
        p0 = K[i - 1] if i > 0 else K[i]
        p1, p2 = K[i], K[i + 1]
        # depois da última chave ele para (a curva chega sem velocidade)
        p3 = K[i + 2] if i + 2 < n else K[i]
        for j in range(m):
            f = _blend(p0, p1, p2, p3, j / m) if j else dict(p1)
            f['draw'] = min(1.0, max(0.0, f['draw']))
            out.append(f)
    out.append(K[-1])
    return out, fps * m


# ---------------- corpo (comum a todas as armas) ----------------
def idle_body(i, n):
    ph = TAU * i / n
    b = (1 - math.cos(ph)) * 0.5
    return dict(hip=(0, round(b * 0.6, 2)), head=(0, round(b * 1.0)), lean=1,
                armF=(-6 + b * 2, 32 - b * 3), armB=(10, 18),
                cape=dict(lift=6 + 3 * math.sin(ph), wave=3, phase=ph),
                hoodtip=(round(math.sin(ph) * 1.2), round(math.cos(ph) * 0.8))), b, ph


def run_body(i, n):
    ph = TAU * i / n

    def leg(p):
        thigh = 34 * math.sin(p)
        knee = 12 + 78 * max(0.0, math.cos(p)) ** 1.4
        foot = -10 * math.sin(p)
        return (thigh, knee), foot

    lf, ff = leg(ph)
    lb, fb = leg(ph + math.pi)
    return dict(hip=(0, round(-1.6 * math.cos(2 * ph) - 0.4, 2)), lean=13,
                legF=lf, legB=lb, footF=ff, footB=fb,
                armF=(-18 - 22 * math.sin(ph), 48), armB=(18 + 26 * math.sin(ph), 58),
                cape=dict(lift=38 + 6 * math.sin(2 * ph), wave=7, phase=ph * 2, flare=2),
                hoodtip=(-3, -4 + round(math.sin(2 * ph))),
                head=(0, round(-0.6 * math.cos(2 * ph)))), ph


JUMP = [dict(legF=(38, 72), legB=(-8, 52), footF=20, footB=10, lean=4, armF=(-30, 70), armB=(30, 40),
             cape=dict(lift=4, wave=5, phase=1.0, length=1.04), hoodtip=(0, 2)),
        dict(legF=(30, 60), legB=(-4, 44), footF=20, footB=10, lean=4, armF=(-30, 70), armB=(30, 40),
             cape=dict(lift=8, wave=6, phase=1.6, length=1.03), hoodtip=(0, 2))]
FALL = [dict(legF=(18, 12), legB=(-16, 26), footF=25, footB=20, lean=-2, armF=(-50, 60), armB=(60, 30),
             cape=dict(lift=72, wave=12, phase=0.0, flare=3), hoodtip=(2, -7), head=(0, -1)),
        dict(legF=(18, 12), legB=(-16, 26), footF=25, footB=20, lean=-2, armF=(-50, 60), armB=(60, 30),
             cape=dict(lift=80, wave=12, phase=1.7, flare=3), hoodtip=(3, -8), head=(0, -1))]
LAND = [dict(hip=(0, 6), lean=16, legF=(58, 104), legB=(12, 84), armF=(-4, 50), armB=(28, 40),
             cape=dict(lift=14, wave=4, phase=2.0), hoodtip=(-1, 2), head=(0, 1)),
        dict(hip=(0, 3), lean=10, legF=(34, 60), legB=(2, 46), armF=(-4, 50), armB=(28, 40),
             cape=dict(lift=9, wave=3, phase=2.6), hoodtip=(-1, 2), head=(0, 1))]
DASH = [dict(hip=(0, -1), lean=30, legF=(-6, 26), legB=(-48, 34), footF=-20, footB=-50,
             armF=(-76, 8), armB=(-40, 20),
             cape=dict(lift=88, wave=5, phase=i * 2.0, length=1.08, flare=1), hoodtip=(-6, -6), head=(1, 0))
        for i in range(3)]
HURT = [dict(lean=-18, tilt=-14, head=(-1, 0), legF=(26, 36), legB=(-14, 42), armF=(40, 40), armB=(-50, 30),
             cape=dict(lift=34, wave=10, phase=0.8), hoodtip=(2, -3)),
        dict(lean=-12, tilt=-8, head=(-1, 0), legF=(26, 36), legB=(-14, 42), armF=(40, 40), armB=(-50, 30),
             cape=dict(lift=24, wave=8, phase=1.8), hoodtip=(2, -3))]

# agachado: tronco curvado e cabeça baixa para caber em túneis de 2 blocos
CROUCH = dict(hip=(0, 14), lean=30, head=(0, 3), tilt=14, legF=(85, 160), legB=(55, 165), footF=0, footB=170,
              armF=(-20, 50), armB=(10, 30), cape=dict(lift=10, wave=2, length=0.6, flare=2), hoodtip=(-1, 0))
SLIDE = dict(hip=(0, 15), lean=-35, head=(0, 2), tilt=-4, legF=(98, 12), legB=(58, 150), footF=-14, footB=160,
             armF=(-80, 30), armB=(-60, 40), cape=dict(lift=96, wave=5, length=0.78, flare=2), hoodtip=(-6, -4))
KNEEL = dict(hip=(0, 11), lean=26, head=(1, 3), tilt=22, legF=(80, 118), legB=(55, 165), footF=0, footB=170,
             armB=(20, 40), cape=dict(lift=4, wave=2, length=0.78, flare=3), hoodtip=(0, 3))


def crouch_frames(n=4):
    out = []
    for i in range(n):
        ph = TAU * i / n
        b = (1 - math.cos(ph)) * 0.5
        out.append(lerp(CROUCH, dict(hip=(0, 14 + b * 0.6), armF=(-20 + b * 2, 50 - b * 3),
                                     cape=dict(lift=10 + 2 * math.sin(ph), wave=2, phase=ph, length=0.6, flare=2)), 1))
    return out


def crouch_walk_frames(n=6):
    out = []
    for i in range(n):
        ph = TAU * i / n
        s = math.sin(ph)
        out.append(lerp(CROUCH, dict(hip=(0, 14 + abs(math.cos(ph)) * 0.8), legF=(85 + 12 * s, 160 - 14 * max(0, s)),
                                     legB=(55 - 12 * s, 165 - 10 * max(0, -s)), armF=(-20 - 8 * s, 50),
                                     cape=dict(lift=14 + 3 * s, wave=3, phase=ph, length=0.6, flare=2)), 1))
    return out


def slide_frames():
    return [SLIDE, lerp(SLIDE, dict(cape=dict(lift=92, wave=7, phase=1.6), hoodtip=(-7, -3)), 1)]


# ---------------- armas: como cada uma é carregada ----------------
def carry(w, name, i=0, n=1, ph=0.0, b=0.0):
    s = math.sin(ph)
    if w == 'sword':
        return {'idle': dict(wpn=26 - b), 'run': dict(wpn=-48 - 10 * s), 'jump': dict(wpn=-60), 'fall': dict(wpn=-80),
                'land': dict(wpn=-30), 'dash': dict(wpn=-96), 'hurt': dict(wpn=60), 'crouch': dict(wpn=96),
                'slide': dict(wpn=-100), 'kneel': dict(armF=(118, 12), wpn=0)}[name]
    if w == 'scythe':
        return {'idle': dict(armF=(18 + b * 2, 80 - b * 2), wpn=180, grip=11, blade=-1, droop=5),
                'run': dict(armF=(-26 - 12 * s, 44), wpn=-104 + 5 * s, grip=8, blade=1),
                'jump': dict(armF=(-40, 50), wpn=-128, grip=9, blade=1),
                'fall': dict(armF=(-58, 48), wpn=-146, grip=9, blade=1),
                'land': dict(armF=(-12, 50), wpn=-84, grip=8, blade=1),
                'dash': dict(armF=(-80, 10), wpn=-96, grip=6, blade=1),
                'hurt': dict(armF=(40, 40), wpn=118, grip=10, blade=1),
                'crouch': dict(wpn=-100, grip=6, blade=1),
                'slide': dict(wpn=-132, grip=10, blade=1),
                'kneel': dict(armF=(100, 30), wpn=180, grip=22, blade=-1, droop=5)}[name]
    if w == 'daggers':
        return {'idle': dict(wpn=26 - b, wpnB=28), 'run': dict(wpn=-40 - 10 * s, wpnB=-30), 'jump': dict(wpn=-50, wpnB=-40),
                'fall': dict(wpn=-70, wpnB=-60), 'land': dict(wpn=-20, wpnB=-10), 'dash': dict(wpn=-100, wpnB=-100),
                'hurt': dict(wpn=60, wpnB=40), 'crouch': dict(wpn=80, wpnB=60), 'slide': dict(wpn=-100, wpnB=-90),
                'kneel': dict(armF=(20, 30), wpn=10, wpnB=10)}[name]
    if w == 'bow':
        return {'idle': dict(bow=90), 'run': dict(bow=84 + 8 * s), 'jump': dict(bow=110), 'fall': dict(bow=124),
                'land': dict(bow=80), 'dash': dict(bow=60), 'hurt': dict(bow=120), 'crouch': dict(bow=10),
                'slide': dict(bow=150), 'kneel': dict(armF=(30, 40), bow=90)}[name]
    if w == 'badalo':
        # pesado: parado, com as duas mãos e a bola para cima na frente; andando, no ombro
        return {'idle': dict(armF=(22 + b * 2, 74 - b * 2), wpn=150 - b * 2, grip=6, ikB=('staff', -4.5), zB=4.9),
                'run': dict(armF=(-34 - 8 * s, 70), wpn=-128 + 4 * s, grip=5),
                'jump': dict(armF=(-44, 66), wpn=-140, grip=5),
                'fall': dict(armF=(-60, 60), wpn=-158, grip=5),
                'land': dict(armF=(-14, 56), wpn=-92, grip=5),
                'dash': dict(armF=(-80, 10), wpn=-96, grip=4),
                'hurt': dict(armF=(40, 40), wpn=118, grip=6),
                'crouch': dict(armF=(-10, 60), wpn=-96, grip=5),
                'slide': dict(wpn=-132, grip=6),
                'kneel': dict(armF=(96, 34), wpn=4, grip=14)}[name]
    if w == 'incensario':
        # a corrente na mão da frente: pendurado no repouso, arrastando para trás na corrida
        return {'idle': dict(armF=(-2 + b * 2, 34 - b * 2), wpn=6 * math.sin(ph) - 2),
                'run': dict(armF=(-18 - 18 * s, 44), wpn=-34 - 14 * s),
                'jump': dict(armF=(-40, 50), wpn=-112),
                'fall': dict(armF=(-52, 60), wpn=-146),
                'land': dict(armF=(-6, 46), wpn=30),
                'dash': dict(armF=(-74, 10), wpn=-100),
                'hurt': dict(armF=(40, 40), wpn=130),
                'crouch': dict(armF=(40, 50), wpn=84),
                'slide': dict(armF=(-70, 30), wpn=-110),
                'kneel': dict(armF=(96, 34), wpn=0)}[name]
    raise ValueError(w)


# ---------------- golpes ----------------
SIDE_LEGS = dict(legF=(28, 28), legB=(-26, 22), footF=-4, footB=-6)


def attacks(w):
    A = {}
    if w == 'sword':
        L = SIDE_LEGS
        A['attack'] = ([
            dict(L, lean=-6, armF=(168, 10), armB=(30, 40), wpn=205, cape=dict(lift=10, wave=4, phase=0.5), hoodtip=(1, 1)),
            dict(L, lean=12, armF=(96, -2), armB=(-30, 40), wpn=92, cape=dict(lift=30, wave=6, phase=1.4), hoodtip=(-2, -2)),
            dict(L, lean=14, armF=(66, -12), armB=(-40, 30), wpn=46, cape=dict(lift=26, wave=6, phase=2.2), hoodtip=(-2, -1)),
            dict(L, lean=6, armF=(24, 26), armB=(0, 30), wpn=10, cape=dict(lift=14, wave=4, phase=3.0), hoodtip=(-1, 0)),
        ], 24)
        U = dict(legF=(18, 20), legB=(-18, 18))
        A['attack_up'] = ([
            dict(U, lean=8, armF=(30, 40), armB=(10, 30), wpn=72, cape=dict(lift=10, wave=4, phase=0.4)),
            dict(U, lean=-6, armF=(150, 12), armB=(-20, 30), wpn=168, head=(0, -1), tilt=-8, cape=dict(lift=16, wave=6, phase=1.2)),
            dict(U, lean=-10, armF=(176, 6), armB=(-30, 30), wpn=186, head=(0, -1), tilt=-10, cape=dict(lift=18, wave=6, phase=2.0)),
            dict(U, lean=-2, armF=(120, 20), armB=(0, 30), wpn=140, cape=dict(lift=12, wave=4, phase=2.8)),
        ], 24)
        D = dict(legF=(40, 70), legB=(-6, 50), footF=20)
        A['attack_down'] = ([
            dict(D, lean=0, armF=(130, 20), armB=(30, 40), wpn=170, cape=dict(lift=60, wave=8, phase=0.3), hoodtip=(2, -5)),
            dict(D, lean=8, armF=(26, -10), armB=(-30, 30), wpn=4, cape=dict(lift=70, wave=10, phase=1.3), hoodtip=(2, -6)),
            dict(D, lean=6, armF=(10, -6), armB=(-20, 30), wpn=0, cape=dict(lift=74, wave=10, phase=2.3), hoodtip=(3, -6)),
        ], 22)
        A['crouch_attack'] = ([
            lerp(CROUCH, dict(armF=(-60, 30), wpn=-110, lean=24), 1),
            lerp(CROUCH, dict(armF=(92, 0), wpn=94, lean=34), 1),
            lerp(CROUCH, dict(armF=(80, -6), wpn=88, lean=36), 1),
            lerp(CROUCH, dict(armF=(50, 20), wpn=80, lean=32), 1),
        ], 24)
    elif w == 'scythe':
        L = dict(legF=(32, 30), legB=(-30, 24), footF=-4, footB=-8)
        two = lambda s: ('staff', s)
        A['attack'] = ([
            dict(L, lean=-8, armF=(150, 30), wpn=212, grip=16, blade=1, ikB=two(-11), zB=4.9, cape=dict(lift=8, wave=4, phase=0.3), hoodtip=(1, 1)),
            dict(L, lean=-12, armF=(166, 20), wpn=232, grip=16, blade=1, ikB=two(-11), zB=4.9, cape=dict(lift=6, wave=4, phase=0.8), hoodtip=(2, 1), head=(0, -1)),
            dict(L, lean=14, armF=(104, 4), wpn=118, grip=16, blade=1, ikB=two(-11), zB=4.9, cape=dict(lift=34, wave=7, phase=1.5), hoodtip=(-2, -2)),
            dict(L, lean=20, armF=(70, -6), wpn=58, grip=16, blade=1, ikB=two(-11), zB=4.9, cape=dict(lift=34, wave=7, phase=2.2), hoodtip=(-3, -2)),
            dict(L, lean=16, armF=(44, 10), wpn=36, grip=18, blade=1, ikB=two(-11), zB=4.9, cape=dict(lift=24, wave=6, phase=2.8), hoodtip=(-2, -1)),
            dict(L, lean=8, armF=(18, 70), wpn=150, grip=12, blade=-1, droop=5, cape=dict(lift=14, wave=4, phase=3.4), hoodtip=(-1, 0)),
        ], 19)
        U = dict(legF=(20, 22), legB=(-20, 20))
        A['attack_up'] = ([
            dict(U, lean=10, armF=(10, 40), wpn=-72, grip=14, blade=-1, ikB=two(-10), zB=4.9, cape=dict(lift=10, wave=4, phase=0.4)),
            dict(U, lean=12, armF=(-4, 40), wpn=-86, grip=14, blade=-1, ikB=two(-10), zB=4.9, cape=dict(lift=12, wave=4, phase=0.9)),
            dict(U, lean=-4, armF=(120, 20), wpn=124, grip=14, blade=-1, ikB=two(-10), zB=4.9, head=(0, -1), tilt=-6, cape=dict(lift=16, wave=6, phase=1.4)),
            dict(U, lean=-10, armF=(164, 10), wpn=176, grip=14, blade=-1, ikB=two(-10), zB=4.9, head=(0, -1), tilt=-10, cape=dict(lift=20, wave=6, phase=2.0)),
            dict(U, lean=-12, armF=(178, 4), wpn=206, grip=14, blade=-1, ikB=two(-10), zB=4.9, head=(0, -1), tilt=-10, cape=dict(lift=20, wave=6, phase=2.6)),
            dict(U, lean=-2, armF=(140, 20), wpn=176, grip=12, blade=-1, cape=dict(lift=12, wave=4, phase=3.2)),
        ], 19)
        D = dict(legF=(40, 70), legB=(-6, 50), footF=20)
        A['attack_down'] = ([
            dict(D, lean=-4, armF=(150, 20), wpn=176, grip=14, blade=1, ikB=two(-10), zB=4.9, cape=dict(lift=56, wave=8, phase=0.3), hoodtip=(2, -5)),
            dict(D, lean=-6, armF=(166, 14), wpn=196, grip=14, blade=1, ikB=two(-10), zB=4.9, cape=dict(lift=60, wave=8, phase=0.8), hoodtip=(2, -5)),
            dict(D, lean=10, armF=(40, -6), wpn=20, grip=20, blade=1, ikB=two(-10), zB=4.9, cape=dict(lift=70, wave=10, phase=1.4), hoodtip=(2, -6)),
            dict(D, lean=12, armF=(16, -4), wpn=2, grip=20, blade=1, ikB=two(-10), zB=4.9, cape=dict(lift=74, wave=10, phase=2.0), hoodtip=(3, -6)),
            dict(D, lean=8, armF=(10, 0), wpn=-6, grip=20, blade=1, ikB=two(-10), zB=4.9, cape=dict(lift=74, wave=10, phase=2.6), hoodtip=(3, -6)),
            dict(D, lean=4, armF=(0, 20), wpn=-40, grip=20, blade=1, cape=dict(lift=70, wave=10, phase=3.2), hoodtip=(3, -6)),
        ], 19)
        A['crouch_attack'] = ([
            lerp(CROUCH, dict(armF=(-40, 40), wpn=-96, grip=12, blade=1, lean=26), 1),
            lerp(CROUCH, dict(armF=(-56, 40), wpn=-112, grip=12, blade=1, lean=24), 1),
            lerp(CROUCH, dict(armF=(90, 0), wpn=96, grip=12, blade=1, lean=36), 1),
            lerp(CROUCH, dict(armF=(80, -8), wpn=94, grip=12, blade=1, lean=38), 1),
            lerp(CROUCH, dict(armF=(60, 0), wpn=88, grip=14, blade=1, lean=36), 1),
            lerp(CROUCH, dict(armF=(20, 30), wpn=-100, grip=6, blade=1, lean=32), 1),
        ], 19)
    elif w == 'daggers':
        L = dict(legF=(24, 26), legB=(-22, 20), footF=-4, footB=-6)
        A['attack'] = ([
            dict(L, lean=-2, armF=(150, 16), armB=(40, 40), wpn=196, wpnB=60, cape=dict(lift=12, wave=4, phase=0.5)),
            dict(L, lean=12, armF=(96, -2), armB=(10, 40), wpn=96, wpnB=40, cape=dict(lift=28, wave=6, phase=1.4), hoodtip=(-2, -2)),
            dict(L, lean=14, armF=(58, -10), armB=(80, 0), wpn=40, wpnB=92, cape=dict(lift=26, wave=6, phase=2.2), hoodtip=(-2, -1)),
            dict(L, lean=6, armF=(20, 26), armB=(40, 20), wpn=12, wpnB=50, cape=dict(lift=14, wave=4, phase=3.0)),
        ], 27)
        A['attack2'] = ([
            dict(L, lean=4, armF=(10, 20), armB=(-20, 40), wpn=10, wpnB=-10, cape=dict(lift=12, wave=4, phase=0.5)),
            dict(L, lean=12, armF=(84, 10), armB=(0, 40), wpn=86, wpnB=20, cape=dict(lift=28, wave=6, phase=1.4), hoodtip=(-2, -2)),
            dict(L, lean=10, armF=(130, 10), armB=(90, 0), wpn=150, wpnB=94, cape=dict(lift=26, wave=6, phase=2.2), hoodtip=(-2, -1)),
            dict(L, lean=4, armF=(60, 30), armB=(40, 20), wpn=90, wpnB=50, cape=dict(lift=14, wave=4, phase=3.0)),
        ], 27)
        U = dict(legF=(18, 20), legB=(-18, 18))
        A['attack_up'] = ([
            dict(U, lean=8, armF=(40, 40), armB=(10, 30), wpn=80, cape=dict(lift=10, wave=4, phase=0.4)),
            dict(U, lean=-6, armF=(156, 12), armB=(120, 20), wpn=172, wpnB=150, head=(0, -1), tilt=-8, cape=dict(lift=16, wave=6, phase=1.2)),
            dict(U, lean=-10, armF=(178, 4), armB=(150, 20), wpn=188, wpnB=176, head=(0, -1), tilt=-10, cape=dict(lift=18, wave=6, phase=2.0)),
            dict(U, lean=-2, armF=(120, 20), armB=(60, 30), wpn=140, cape=dict(lift=12, wave=4, phase=2.8)),
        ], 27)
        D = dict(legF=(40, 70), legB=(-6, 50), footF=20)
        A['attack_down'] = ([
            dict(D, lean=0, armF=(130, 20), armB=(40, 40), wpn=170, cape=dict(lift=60, wave=8, phase=0.3), hoodtip=(2, -5)),
            dict(D, lean=8, armF=(26, -10), armB=(10, 10), wpn=4, wpnB=0, cape=dict(lift=70, wave=10, phase=1.3), hoodtip=(2, -6)),
            dict(D, lean=6, armF=(10, -6), armB=(4, 0), wpn=0, wpnB=0, cape=dict(lift=74, wave=10, phase=2.3), hoodtip=(3, -6)),
        ], 22)
        A['crouch_attack'] = ([
            lerp(CROUCH, dict(armF=(-50, 30), wpn=-100, lean=26), 1),
            lerp(CROUCH, dict(armF=(92, 0), wpn=94, lean=34), 1),
            lerp(CROUCH, dict(armF=(76, -6), wpn=80, armB=(80, 0), wpnB=90, zB=0.5, lean=36), 1),
            lerp(CROUCH, dict(armF=(40, 20), wpn=60, lean=32), 1),
        ], 27)
    elif w == 'bow':
        L = dict(legF=(26, 22), legB=(-24, 18), footF=-2, footB=-6)
        S = lambda **k: dict(L, ikB=('string',), zB=4.9, **k)
        A['attack'] = ([
            S(lean=4, armF=(84, 6), bow=90, draw=0.45, nock=True, cape=dict(lift=10, wave=4, phase=0.5)),
            S(lean=6, armF=(86, 4), bow=90, draw=1.0, nock=True, cape=dict(lift=12, wave=4, phase=1.2), hoodtip=(1, 0)),
            S(lean=2, armF=(88, 2), bow=90, draw=0.0, cape=dict(lift=18, wave=5, phase=1.9), hoodtip=(-1, -1)),
            dict(L, lean=4, armF=(54, 24), armB=(30, 40), bow=80, cape=dict(lift=12, wave=4, phase=2.6)),
        ], 20)
        U = dict(legF=(18, 20), legB=(-18, 18))
        SU = lambda **k: dict(U, ikB=('string',), zB=4.9, **k)
        A['attack_up'] = ([
            SU(lean=-4, armF=(172, 4), bow=180, draw=0.45, nock=True, tilt=-10, cape=dict(lift=10, wave=4, phase=0.4)),
            SU(lean=-6, armF=(176, 2), bow=180, draw=1.0, nock=True, tilt=-12, cape=dict(lift=12, wave=5, phase=1.1)),
            SU(lean=-4, armF=(178, 0), bow=180, draw=0.0, tilt=-10, cape=dict(lift=14, wave=6, phase=1.8)),
            dict(U, lean=0, armF=(130, 20), armB=(20, 30), bow=150, cape=dict(lift=12, wave=4, phase=2.6)),
        ], 20)
        D = dict(legF=(40, 70), legB=(-6, 50), footF=20)
        SD = lambda **k: dict(D, ikB=('string',), zB=4.9, **k)
        A['attack_down'] = ([
            SD(lean=6, armF=(8, 2), bow=0, draw=0.5, nock=True, tilt=10, cape=dict(lift=60, wave=8, phase=0.3), hoodtip=(2, -5)),
            SD(lean=8, armF=(4, 0), bow=0, draw=1.0, nock=True, tilt=12, cape=dict(lift=66, wave=9, phase=1.0), hoodtip=(2, -6)),
            SD(lean=6, armF=(2, 0), bow=0, draw=0.0, tilt=10, cape=dict(lift=72, wave=10, phase=1.7), hoodtip=(3, -6)),
            dict(D, lean=4, armF=(-20, 40), armB=(30, 30), bow=40, cape=dict(lift=74, wave=10, phase=2.4), hoodtip=(3, -6)),
        ], 20)
        SC = lambda **k: lerp(CROUCH, dict(ikB=('string',), zB=4.9, **k), 1)
        A['crouch_attack'] = ([
            SC(lean=22, armF=(86, 4), bow=90, draw=0.45, nock=True),
            SC(lean=22, armF=(88, 2), bow=90, draw=1.0, nock=True),
            SC(lean=22, armF=(90, 0), bow=90, draw=0.0),
            lerp(CROUCH, dict(armF=(40, 30), bow=40, lean=26), 1),
        ], 20)
    elif w == 'badalo':
        # a pancada sobe por trás da cabeça e desce até o chão na frente (lá nasce a onda)
        L = dict(legF=(34, 32), legB=(-30, 24), footF=-4, footB=-8)
        two = lambda s: ('staff', s)
        g = dict(grip=5, ikB=two(-4.5), zB=4.9)
        A['attack'] = ([
            dict(L, **g, lean=-10, armF=(152, 26), wpn=214, cape=dict(lift=8, wave=4, phase=0.3), hoodtip=(1, 1)),
            dict(L, **g, lean=-14, armF=(170, 16), wpn=236, cape=dict(lift=6, wave=4, phase=0.8), hoodtip=(2, 1), head=(0, -1)),
            dict(L, **g, lean=10, armF=(120, 6), wpn=138, cape=dict(lift=30, wave=7, phase=1.5), hoodtip=(-2, -2)),
            dict(L, **g, lean=28, hip=(0, 3), armF=(74, -2), wpn=60, cape=dict(lift=34, wave=7, phase=2.2), hoodtip=(-3, -2)),
            dict(L, **g, lean=29, hip=(0, 3), armF=(68, 2), wpn=56, cape=dict(lift=26, wave=6, phase=2.8), hoodtip=(-2, -1)),
            dict(L, lean=14, armF=(30, 56), wpn=96, grip=6, cape=dict(lift=14, wave=4, phase=3.4), hoodtip=(-1, 0)),
        ], 16)
        U = dict(legF=(20, 22), legB=(-20, 20))
        A['attack_up'] = ([
            dict(U, **g, lean=10, armF=(30, 40), wpn=40, cape=dict(lift=10, wave=4, phase=0.4)),
            dict(U, **g, lean=12, armF=(20, 40), wpn=20, cape=dict(lift=12, wave=4, phase=0.9)),
            dict(U, **g, lean=-4, armF=(120, 20), wpn=120, head=(0, -1), tilt=-6, cape=dict(lift=16, wave=6, phase=1.4)),
            dict(U, **g, lean=-10, armF=(164, 10), wpn=172, head=(0, -1), tilt=-10, cape=dict(lift=20, wave=6, phase=2.0)),
            dict(U, **g, lean=-12, armF=(176, 4), wpn=192, head=(0, -1), tilt=-10, cape=dict(lift=20, wave=6, phase=2.6)),
            dict(U, lean=-2, armF=(130, 20), wpn=160, grip=6, cape=dict(lift=12, wave=4, phase=3.2)),
        ], 16)
        D = dict(legF=(40, 70), legB=(-6, 50), footF=20)
        A['attack_down'] = ([
            dict(D, **g, lean=-4, armF=(150, 20), wpn=176, cape=dict(lift=56, wave=8, phase=0.3), hoodtip=(2, -5)),
            dict(D, **g, lean=-6, armF=(166, 14), wpn=196, cape=dict(lift=60, wave=8, phase=0.8), hoodtip=(2, -5)),
            dict(D, **g, lean=10, armF=(40, -6), wpn=20, cape=dict(lift=70, wave=10, phase=1.4), hoodtip=(2, -6)),
            dict(D, **g, lean=12, armF=(16, -4), wpn=4, cape=dict(lift=74, wave=10, phase=2.0), hoodtip=(3, -6)),
            dict(D, **g, lean=8, armF=(10, 0), wpn=-4, cape=dict(lift=74, wave=10, phase=2.6), hoodtip=(3, -6)),
            dict(D, lean=4, armF=(0, 20), wpn=-40, grip=6, cape=dict(lift=70, wave=10, phase=3.2), hoodtip=(3, -6)),
        ], 16)
        A['crouch_attack'] = ([
            lerp(CROUCH, dict(armF=(-40, 40), wpn=-96, grip=5, lean=26), 1),
            lerp(CROUCH, dict(armF=(-56, 40), wpn=-112, grip=5, lean=24), 1),
            lerp(CROUCH, dict(armF=(90, 0), wpn=96, grip=5, lean=36), 1),
            lerp(CROUCH, dict(armF=(80, -8), wpn=92, grip=5, lean=38), 1),
            lerp(CROUCH, dict(armF=(60, 0), wpn=86, grip=6, lean=36), 1),
            lerp(CROUCH, dict(armF=(20, 30), wpn=-96, grip=5, lean=32), 1),
        ], 16)
    elif w == 'incensario':
        # o incensário gira por cima da cabeça e desce na frente (lá fica a nuvem de incenso)
        L = dict(legF=(30, 28), legB=(-26, 22), footF=-4, footB=-6)
        h = dict(hot=True)
        A['attack'] = ([
            dict(L, **h, lean=-8, armF=(150, 24), armB=(30, 40), wpn=232, cape=dict(lift=8, wave=4, phase=0.3), hoodtip=(1, 1)),
            dict(L, **h, lean=-10, armF=(168, 10), armB=(20, 40), wpn=196, cape=dict(lift=8, wave=4, phase=0.8), hoodtip=(2, 1), head=(0, -1)),
            dict(L, **h, lean=10, armF=(118, 0), armB=(-20, 40), wpn=124, cape=dict(lift=30, wave=7, phase=1.5), hoodtip=(-2, -2)),
            dict(L, **h, lean=20, armF=(86, -6), armB=(-40, 30), wpn=78, cape=dict(lift=34, wave=7, phase=2.2), hoodtip=(-3, -2)),
            dict(L, **h, lean=18, armF=(70, 0), armB=(-30, 30), wpn=44, cape=dict(lift=26, wave=6, phase=2.8), hoodtip=(-2, -1)),
            dict(L, lean=8, armF=(30, 30), armB=(0, 30), wpn=8, cape=dict(lift=14, wave=4, phase=3.4), hoodtip=(-1, 0)),
        ], 20)
        U = dict(legF=(20, 22), legB=(-20, 20))
        A['attack_up'] = ([
            dict(U, **h, lean=10, armF=(40, 40), armB=(10, 30), wpn=20, cape=dict(lift=10, wave=4, phase=0.4)),
            dict(U, **h, lean=6, armF=(90, 20), armB=(0, 30), wpn=80, cape=dict(lift=12, wave=4, phase=0.9)),
            dict(U, **h, lean=-4, armF=(140, 10), armB=(-20, 30), wpn=150, head=(0, -1), tilt=-6, cape=dict(lift=16, wave=6, phase=1.4)),
            dict(U, **h, lean=-10, armF=(170, 4), armB=(-30, 30), wpn=186, head=(0, -1), tilt=-10, cape=dict(lift=20, wave=6, phase=2.0)),
            dict(U, **h, lean=-12, armF=(178, 0), armB=(-30, 30), wpn=208, head=(0, -1), tilt=-10, cape=dict(lift=20, wave=6, phase=2.6)),
            dict(U, lean=-2, armF=(130, 20), armB=(0, 30), wpn=150, cape=dict(lift=12, wave=4, phase=3.2)),
        ], 20)
        D = dict(legF=(40, 70), legB=(-6, 50), footF=20)
        A['attack_down'] = ([
            dict(D, **h, lean=-4, armF=(150, 20), armB=(30, 40), wpn=190, cape=dict(lift=56, wave=8, phase=0.3), hoodtip=(2, -5)),
            dict(D, **h, lean=-2, armF=(120, 20), armB=(20, 40), wpn=140, cape=dict(lift=60, wave=8, phase=0.8), hoodtip=(2, -5)),
            dict(D, **h, lean=8, armF=(60, -6), armB=(-20, 30), wpn=40, cape=dict(lift=70, wave=10, phase=1.4), hoodtip=(2, -6)),
            dict(D, **h, lean=10, armF=(24, -4), armB=(-20, 30), wpn=4, cape=dict(lift=74, wave=10, phase=2.0), hoodtip=(3, -6)),
            dict(D, **h, lean=8, armF=(12, 0), armB=(-10, 30), wpn=-6, cape=dict(lift=74, wave=10, phase=2.6), hoodtip=(3, -6)),
            dict(D, lean=4, armF=(0, 20), armB=(0, 30), wpn=-20, cape=dict(lift=70, wave=10, phase=3.2), hoodtip=(3, -6)),
        ], 20)
        A['crouch_attack'] = ([
            lerp(CROUCH, dict(armF=(-40, 40), wpn=-110, lean=26, hot=True), 1),
            lerp(CROUCH, dict(armF=(-20, 40), wpn=-60, lean=24, hot=True), 1),
            lerp(CROUCH, dict(armF=(88, 0), wpn=96, lean=36, hot=True), 1),
            lerp(CROUCH, dict(armF=(82, -6), wpn=92, lean=38, hot=True), 1),
            lerp(CROUCH, dict(armF=(64, 0), wpn=70, lean=36, hot=True), 1),
            lerp(CROUCH, dict(armF=(20, 30), wpn=10, lean=32), 1),
        ], 20)
    return A


def anims_for(w):
    A = {}
    idle = []
    for i in range(8):
        body, b, ph = idle_body(i, 8)
        idle.append(lerp(body, carry(w, 'idle', b=b, ph=ph), 1))
    A['idle'] = (idle, 7, True)
    run = []
    for i in range(8):
        body, ph = run_body(i, 8)
        run.append(lerp(body, carry(w, 'run', ph=ph), 1))
    A['run'] = (run, 13, True)
    A['jump'] = ([lerp(f, carry(w, 'jump'), 1) for f in JUMP], 10, True)
    A['fall'] = ([lerp(f, carry(w, 'fall'), 1) for f in FALL], 10, True)
    A['land'] = ([lerp(f, carry(w, 'land'), 1) for f in LAND], 16, False)
    A['dash'] = ([lerp(f, carry(w, 'dash'), 1) for f in DASH], 18, True)
    A['hurt'] = ([lerp(f, carry(w, 'hurt'), 1) for f in HURT], 10, False)
    A['crouch'] = ([lerp(f, carry(w, 'crouch'), 1) for f in crouch_frames()], 5, True)
    A['crouch_walk'] = ([lerp(f, carry(w, 'crouch'), 1) for f in crouch_walk_frames()], 10, True)
    A['slide'] = ([lerp(f, carry(w, 'slide'), 1) for f in slide_frames()], 12, True)
    kneel = lerp(KNEEL, carry(w, 'kneel'), 1)
    A['kneel'] = ([kneel, lerp(kneel, dict(hip=(0, 11.6), head=(1, 3.5), cape=dict(lift=5, wave=2, phase=1.5)), 1)], 2, True)
    stand = idle[0]
    A['getup'] = ([lerp(kneel, stand, t) for t in (0.25, 0.5, 0.75, 0.95)], 10, False)
    for k, v in attacks(w).items():
        poses, fps = smooth(v[0], v[1])
        A[k] = (poses, fps, False)
    return A

"""Definição das animações do cavaleiro como sequências de poses."""
import math

TAU = math.pi * 2


def idle(n=8):
    out = []
    for i in range(n):
        ph = TAU * i / n
        b = (1 - math.cos(ph)) * 0.5  # respiração 0..1
        out.append(dict(
            hip=(0, round(b * 0.6, 2)), head=(0, round(b * 1.0)), lean=1,
            armF=(-6 + b * 2, 32 - b * 3), armB=(10, 18),
            cape=dict(lift=6 + 3 * math.sin(ph), wave=3, phase=ph),
            hoodtip=(round(math.sin(ph) * 1.2), round(math.cos(ph) * 0.8)),
        ))
    return out


def run(n=8):
    out = []
    for i in range(n):
        ph = TAU * i / n

        def leg(p):
            thigh = 34 * math.sin(p)
            knee = 12 + 78 * max(0.0, math.cos(p)) ** 1.4
            foot = -10 * math.sin(p)
            return (thigh, knee), foot

        lf, ff = leg(ph)
        lb, fb = leg(ph + math.pi)
        out.append(dict(
            hip=(0, round(-1.6 * math.cos(2 * ph) - 0.4, 2)), lean=13,
            legF=lf, legB=lb, footF=ff, footB=fb,
            armF=(-18 - 22 * math.sin(ph), 48), armB=(18 + 26 * math.sin(ph), 58),
            sword=-48 - 10 * math.sin(ph),
            cape=dict(lift=38 + 6 * math.sin(2 * ph), wave=7, phase=ph * 2, flare=2),
            hoodtip=(-3, -4 + round(math.sin(2 * ph))),
            head=(0, round(-0.6 * math.cos(2 * ph))),
        ))
    return out


def jump():
    base = dict(legF=(38, 72), legB=(-8, 52), footF=20, footB=10, lean=4,
                armF=(-30, 70), armB=(30, 40), sword=-60,
                cape=dict(lift=4, wave=5, phase=1.0, length=1.04), hoodtip=(0, 2))
    b2 = dict(base, legF=(30, 60), legB=(-4, 44), cape=dict(lift=8, wave=6, phase=1.6, length=1.03))
    return [base, b2]


def fall():
    f1 = dict(legF=(18, 12), legB=(-16, 26), footF=25, footB=20, lean=-2,
              armF=(-50, 60), armB=(60, 30), sword=-80,
              cape=dict(lift=72, wave=12, phase=0.0, flare=3), hoodtip=(2, -7), head=(0, -1))
    f2 = dict(f1, cape=dict(lift=80, wave=12, phase=1.7, flare=3), hoodtip=(3, -8))
    return [f1, f2]


def land():
    l1 = dict(hip=(0, 6), lean=16, legF=(58, 104), legB=(12, 84), footF=0, footB=0,
              armF=(-4, 50), armB=(28, 40), sword=-30,
              cape=dict(lift=14, wave=4, phase=2.0), hoodtip=(-1, 2), head=(0, 1))
    l2 = dict(l1, hip=(0, 3), lean=10, legF=(34, 60), legB=(2, 46), cape=dict(lift=9, wave=3, phase=2.6))
    return [l1, l2]


def dash():
    out = []
    for i in range(3):
        out.append(dict(
            hip=(0, -1), lean=30, legF=(-6, 26), legB=(-48, 34), footF=-20, footB=-50,
            armF=(-76, 8), armB=(-40, 20), sword=-96,
            cape=dict(lift=88, wave=5, phase=i * 2.0, length=1.08, flare=1), hoodtip=(-6, -6), head=(1, 0),
        ))
    return out


def attack_side():
    legs = dict(legF=(28, 28), legB=(-26, 22), footF=-4, footB=-6)
    return [
        dict(legs, lean=-6, armF=(168, 10), armB=(30, 40), sword=205, cape=dict(lift=10, wave=4, phase=0.5), hoodtip=(1, 1)),
        dict(legs, lean=12, armF=(96, -2), armB=(-30, 40), sword=92, cape=dict(lift=30, wave=6, phase=1.4), hoodtip=(-2, -2)),
        dict(legs, lean=14, armF=(66, -12), armB=(-40, 30), sword=46, cape=dict(lift=26, wave=6, phase=2.2), hoodtip=(-2, -1)),
        dict(legs, lean=6, armF=(24, 26), armB=(0, 30), sword=10, cape=dict(lift=14, wave=4, phase=3.0), hoodtip=(-1, 0)),
    ]


def attack_up():
    legs = dict(legF=(18, 20), legB=(-18, 18))
    return [
        dict(legs, lean=8, armF=(30, 40), armB=(10, 30), sword=72, cape=dict(lift=10, wave=4, phase=0.4)),
        dict(legs, lean=-6, armF=(150, 12), armB=(-20, 30), sword=168, head=(0, -1), tilt=-8, cape=dict(lift=16, wave=6, phase=1.2)),
        dict(legs, lean=-10, armF=(176, 6), armB=(-30, 30), sword=186, head=(0, -1), tilt=-10, cape=dict(lift=18, wave=6, phase=2.0)),
        dict(legs, lean=-2, armF=(120, 20), armB=(0, 30), sword=140, cape=dict(lift=12, wave=4, phase=2.8)),
    ]


def attack_down():
    legs = dict(legF=(40, 70), legB=(-6, 50), footF=20)
    return [
        dict(legs, lean=0, armF=(130, 20), armB=(30, 40), sword=170, cape=dict(lift=60, wave=8, phase=0.3), hoodtip=(2, -5)),
        dict(legs, lean=8, armF=(26, -10), armB=(-30, 30), sword=4, cape=dict(lift=70, wave=10, phase=1.3), hoodtip=(2, -6)),
        dict(legs, lean=6, armF=(10, -6), armB=(-20, 30), sword=0, cape=dict(lift=74, wave=10, phase=2.3), hoodtip=(3, -6)),
    ]


def hurt():
    h = dict(lean=-18, tilt=-14, head=(-1, 0), legF=(26, 36), legB=(-14, 42),
             armF=(40, 40), armB=(-50, 30), sword=60, cape=dict(lift=34, wave=10, phase=0.8), hoodtip=(2, -3))
    return [h, dict(h, lean=-12, tilt=-8, cape=dict(lift=24, wave=8, phase=1.8))]


ANIMS = {
    'idle': (idle(), 7, True),
    'run': (run(), 13, True),
    'jump': (jump(), 10, True),
    'fall': (fall(), 10, True),
    'land': (land(), 16, False),
    'dash': (dash(), 18, True),
    'attack': (attack_side(), 24, False),
    'attack_up': (attack_up(), 24, False),
    'attack_down': (attack_down(), 22, False),
    'hurt': (hurt(), 10, False),
}

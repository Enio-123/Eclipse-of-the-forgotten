"""Morcego de Âmbar das Minas Abandonadas: morcego grande, de pelo escuro e orelhas compridas, com
lascas de Âmbar crescendo nas costas e nas pontas dos dedos das asas (ele dorme grudado no veio). As
asas são de pele esticada entre os dedos. Antes de mergulhar, o Âmbar do corpo acende inteiro.

uso: python3 ink_sheets.py <pasta_assets> ambat
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm
from rig import rotate_all

puppet.RAMPS['batfur'] = [0x0e0b0c, 0x1d1719, 0x2e2528, 0x433639, 0x5c4b4d]
puppet.RAMPS['batskin'] = [0x150d0f, 0x2a1a1d, 0x41292c, 0x5c3b3c, 0x7a5150]
puppet.RAMPS.setdefault('amber', [0x5a2a08, 0x9a4c12, 0xd27a26, 0xffa63c, 0xffe6a6])
puppet.SHINY.setdefault('amber', (0.7, 16))

W, H = 72, 56
CENTER = (36, 30)
FEET = (36, 37)


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def dv(deg):
    a = math.radians(deg)
    return (math.cos(a), math.sin(a))


def shard(prims, base, ang, ln, wd, z, glow):
    d = dv(ang)
    n = (-d[1], d[0])
    prims.append(Poly('shard', 'amber', z, [add(base, n, wd), add(base, d, ln), add(base, n, -wd)],
                      nf=lambda x, y: norm((n[0] * 0.5, n[1] * 0.5 - 0.3, 0.8)), flat=4 if glow else None))


def wing(prims, root, ang, z, shade, fold=1.0, spread=1.0, glow=False):
    """Asa de morcego: braço até o pulso, três dedos longos abertos em leque e a pele entre eles."""
    arm = 9.0 * fold
    wrist = add(root, dv(ang), arm)
    prims.append(Capsule('wingarm', 'batskin', z + 0.02, root, wrist, 1.5, 1.1, shade=shade))
    tips = []
    for k in range(3):
        a = ang + (14 + k * 26) * spread
        ln = (15.0 - k * 2.6) * fold
        tip = add(wrist, dv(a), ln)
        prims.append(Capsule('finger', 'batskin', z + 0.03, wrist, tip, 0.8, 0.35, shade=shade))
        tips.append(tip)
    # a pele: do ombro ao pulso, de dedo em dedo e de volta ao corpo, com a borda recortada
    body_end = add(root, dv(ang + 90 * spread), 5.0 * fold)
    pts = [root, wrist, tips[0]]
    for k in range(2):
        a, b = tips[k], tips[k + 1]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        inward = add(mid, (wrist[0] - mid[0], wrist[1] - mid[1]), 0.28)
        pts += [inward, b]
    last = tips[-1]
    pts += [add(((last[0] + body_end[0]) / 2, (last[1] + body_end[1]) / 2), (wrist[0] - last[0], wrist[1] - last[1]), 0.15), body_end]
    prims.append(Poly('membrane', 'batskin', z, pts, nf=lambda x, y: norm((0.0, -0.35, 0.9)), shade=shade * 0.85))
    # lasquinhas de Âmbar nas pontas dos dois primeiros dedos
    for k in range(2):
        shard(prims, tips[k], ang + (14 + k * 26) * spread, 2.6 * fold, 0.9, z + 0.05, glow)


def build(pose):
    prims, decals = [], []
    cx, cy = CENTER
    near = pose.get('near', -120)
    far = pose.get('far', near + 14)
    fold = pose.get('fold', 1.0)
    spread = pose.get('spread', 1.0)
    glow = pose.get('glow', False)
    root = (cx - 0.5, cy - 2.5)
    wing(prims, add(root, (1.0, 0.5)), far, 1.0, 0.55, fold, spread, glow)
    # corpo peludo, cabeça com orelhas grandes e focinho curto
    prims.append(Ellipse('body', 'batfur', 3.0, (cx, cy), 5.2, 6.4, ang=0.1))
    head_c = (cx + 1.0, cy - 7.4)
    head = Ellipse('head', 'batfur', 3.6, head_c, 3.8, 3.4)
    prims.append(head)
    for side, a in ((-1, -112), (1, -66)):
        base = add(head_c, (side * 1.8, -2.0))
        d = dv(a)
        n = (-d[1], d[0])
        prims.append(Poly('ear', 'batskin', 3.55, [add(base, n, 1.6), add(base, d, 6.0), add(base, n, -1.6)],
                          nf=lambda x, y: norm((0.0, -0.4, 0.9))))
    prims.append(Ellipse('snout', 'batskin', 3.7, add(head_c, (0.6, 1.8)), 1.6, 1.2))
    # as costas cobertas de Âmbar
    for i, (dx, a, ln, wd) in enumerate(((-2.0, -150, 6.0, 1.6), (0.5, -118, 7.4, 1.8), (2.6, -84, 5.6, 1.5), (-3.4, -176, 4.2, 1.2))):
        shard(prims, (cx + dx, cy - 2.0), a, ln, wd, 3.3 + i * 0.01, glow)
    # pés recolhidos com as garrinhas
    if pose.get('legs', True):
        prims.append(Capsule('leg', 'batskin', 2.0, (cx - 1.5, cy + 5.0), (cx - 2.0, cy + 8.4), 0.7, 0.5, shade=0.8))
        prims.append(Capsule('leg', 'batskin', 2.1, (cx + 1.5, cy + 5.0), (cx + 2.0, cy + 8.4), 0.7, 0.5))

    def eyes(x, y, cur):
        lx, ly = head.local(x, y)
        for ex in (-1.3, 1.6):
            d = math.hypot(lx - ex, ly + 0.3)
            if d < 0.7:
                return ('amber', 4 if glow else 3)
        # boquinha com as presas
        if 1.4 < ly < 1.9 and -0.6 < lx < 1.8:
            return ('void', 0)
        return None

    decals.append(Decal('head', eyes))
    wing(prims, root, near, 5.0, 1.0, fold, spread, glow)
    return rotate_all(prims, decals, CENTER, pose.get('rot', 0.0), pose.get('off', (0.0, 0.0)))


FLY = [dict(near=-150, far=-30), dict(near=-110, far=-70, fold=0.92), dict(near=-60, far=-120, fold=0.85, spread=0.8),
       dict(near=-170, far=-10, fold=0.96, spread=1.1)]
ANIMS = {
    'fly': (FLY, 12, True),
    'windup': ([dict(near=-160, far=-20, glow=True, rot=-8), dict(near=-170, far=-10, glow=True, rot=-12, spread=1.15)], 8, False),
    'dive': ([dict(near=-110, far=-70, fold=0.7, spread=0.5, glow=True, legs=False),
              dict(near=-100, far=-80, fold=0.72, spread=0.45, glow=True, legs=False)], 14, True),
    'stun': ([dict(near=160, far=20, rot=170, off=(0, 6), fold=0.9), dict(near=150, far=30, rot=176, off=(0, 6), fold=0.92)], 6, True),
    'hurt': ([dict(near=-130, far=-50, rot=-24, spread=1.3)], 10, False),
    'death': ([dict(near=-150, far=-30, rot=40, spread=1.4), dict(near=150, far=30, rot=120, spread=1.2, off=(0, 4)),
               dict(near=170, far=10, rot=180, fold=0.8, off=(0, 8))], 9, False),
}

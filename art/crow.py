"""Corvo do Dízimo: corvo grande e esfarrapado com uma moeda de ouro pendurada no pescoço e o
olho dourado (que acende quando ele vai mergulhar). Asas feitas de penas separadas, para a
silhueta ficar recortada.

uso: python3 crow.py <pasta_assets>
"""
import math
import sys
from puppet import Ellipse, Capsule, Poly, Decal, norm
from rig import rotate_all, build_sheet

W, H = 60, 56
CENTER = (30, 32)
FEET = (30, 39)  # origem do sprite: um pouco abaixo do corpo


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def dv(deg):
    a = math.radians(deg)
    return (math.cos(a), math.sin(a))


def wing(prims, root, ang, z, shade, fold=1.0, spread=1.0):
    """Asa: braço até o pulso, quatro primárias abertas no pulso e quatro secundárias no braço."""
    arm = 8.0 * fold
    wrist = add(root, dv(ang), arm)
    prims.append(Capsule('wingarm', 'shadowcloth', z, root, wrist, 2.6, 2.0, shade=shade))
    for k in range(4):
        a = ang + (8 + k * 9) * spread
        ln = (11.5 - k * 1.2) * fold
        prims.append(Capsule('primary', 'shadowcloth', z - 0.01 * k, wrist, add(wrist, dv(a), ln), 1.6, 0.55, shade=shade))
    for k in range(4):
        t = 0.25 + k * 0.22
        base = add(root, dv(ang), arm * t)
        a = ang + 52 * spread + k * 6
        ln = (7.5 - k * 0.6) * fold
        prims.append(Capsule('secondary', 'shadowcloth', z - 0.05 - 0.01 * k, base, add(base, dv(a), ln), 1.7, 0.7, shade=shade))


def build(pose):
    prims, decals = [], []
    cx, cy = CENTER
    near = pose.get('near', -100)
    far = pose.get('far', near + 12)
    fold = pose.get('fold', 1.0)
    spread = pose.get('spread', 1.0)
    root = (cx + 0.5, cy - 3.0)
    wing(prims, add(root, (-1.0, 0.5)), far, 1.0, 0.55, fold, spread)
    # corpo, peito e cabeça
    prims.append(Ellipse('body', 'ebony', 3.0, (cx - 1.5, cy), 7.8, 5.2, ang=-0.18))
    prims.append(Ellipse('breast', 'ebony', 3.2, (cx + 2.5, cy + 1.6), 5.0, 4.2))
    hx, hy = cx + 7.0, cy - 4.5
    head = Ellipse('head', 'ebony', 3.6, (hx, hy), 3.9, 3.5)
    prims.append(head)
    prims.append(Ellipse('ruff', 'shadowcloth', 3.4, (hx - 1.8, hy + 2.8), 3.6, 3.0))
    beak = [(hx + 2.4, hy - 1.4), (hx + 9.0, hy + 0.9), (hx + 7.2, hy + 1.5), (hx + 2.4, hy + 2.2)]
    prims.append(Poly('beak', 'husk', 3.7, beak, nf=lambda x, y: norm((0.1, -0.5 if y < hy + 0.6 else 0.4, 0.8))))
    tail = [(cx - 8.0, cy - 1.5), (cx - 17.0, cy - 3.8), (cx - 19.0, cy - 0.8), (cx - 15.5, cy + 0.2), (cx - 18.5, cy + 2.8),
            (cx - 13.5, cy + 2.6), (cx - 15.0, cy + 4.8), (cx - 8.0, cy + 3.2)]
    prims.append(Poly('tail', 'shadowcloth', 2.6, tail, nf=lambda x, y: norm((-0.1, -0.4, 0.9))))
    # pernas encolhidas e a moeda do dízimo
    if pose.get('legs', True):
        prims.append(Capsule('leg', 'husk', 2.0, (cx - 0.5, cy + 4.0), (cx - 2.5, cy + 7.2), 0.9, 0.7, shade=0.8))
        prims.append(Capsule('leg', 'husk', 2.1, (cx + 1.5, cy + 4.0), (cx + 0.5, cy + 7.4), 0.9, 0.7))
    prims.append(Capsule('cord', 'leather', 3.75, (hx - 0.8, hy + 2.6), (hx - 0.4, hy + 5.8), 0.45, 0.45, flat=2))
    prims.append(Ellipse('coin', 'gold', 3.8, (hx - 0.2, hy + 7.0), 1.8, 1.8))
    wing(prims, root, near, 5.0, 1.0, fold, spread)

    glow = pose.get('glow', False)

    def eye(x, y, cur):
        lx, ly = head.local(x, y)
        d = math.hypot(lx - 1.6, ly + 0.6)
        if d < 0.95:
            return ('gold', 4 if glow else 3)
        if glow and d < 1.7:
            return ('gold', 2)
        return None

    decals.append(Decal('head', eye))
    return rotate_all(prims, decals, CENTER, pose.get('rot', 0.0), pose.get('off', (0.0, 0.0)))


FLY = [dict(near=-104, far=-92), dict(near=-160, far=-150), dict(near=118, far=128, spread=0.8), dict(near=176, far=184, fold=0.72)]
ANIMS = {
    'fly': (FLY, 12, True),
    'windup': ([dict(near=-96, far=-84, rot=-14, glow=True), dict(near=-88, far=-78, rot=-18, glow=True, spread=1.15)], 8, False),
    'dive': ([dict(near=172, far=178, fold=0.78, spread=0.35, glow=True, legs=False),
              dict(near=168, far=176, fold=0.8, spread=0.45, glow=True, legs=False)], 14, True),
    'stuck': ([dict(near=-60, far=-48, rot=62, off=(0, 4)), dict(near=-130, far=-118, rot=66, off=(0, 4))], 10, True),
    'hurt': ([dict(near=-150, far=-140, rot=-24, spread=1.3)], 10, False),
    'death': ([dict(near=-150, far=-120, rot=40, spread=1.4), dict(near=150, far=120, rot=120, spread=1.2, off=(0, 4)),
               dict(near=170, far=160, rot=180, fold=0.8, off=(0, 8))], 9, False),
}

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    sheet, meta = build_sheet('crow', ANIMS, build, W, H, FEET, out, preview='crow_preview.png')
    print('crow', sheet.size)

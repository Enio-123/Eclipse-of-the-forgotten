"""Coruja de Geada (Floresta Nevada): coruja grande de penas cinza-claras com a ponta de cada pena
coberta de geada, o disco do rosto quase branco, dois tufos de orelha e os olhos claros que acendem
quando ela acorda. Dorme pousada no galho com as asas fechadas; voando, as asas são largas e
arredondadas, com as pontas abertas como dedos.

O boneco olha para a direita (+x). FEET é onde as garras seguram o galho.

uso: python3 ink_sheets.py <pasta_assets> owl
"""
import math
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm
from rig import rotate_all

puppet.RAMPS['owlfeather'] = [0x23242c, 0x40424d, 0x676a77, 0x9599a5, 0xc6cad3]
puppet.RAMPS['owlface'] = [0x7c808a, 0xa8acb5, 0xcfd2d9, 0xe9ebf0, 0xfbfcfe]
puppet.RAMPS.setdefault('frost', [0x4f5f74, 0x7d90a8, 0xa9bdd3, 0xd3e2f0, 0xf4f9ff])
puppet.RAMPS.setdefault('iceeye', [0x1d3550, 0x2f5a85, 0x5a92c4, 0x9fd0f2, 0xe8f7ff])
puppet.SHINY.setdefault('frost', (0.45, 12))
puppet.RIM_MATS |= {'owlfeather'}

W, H = 72, 60
FEET = (34, 46)
CENTER = (34, 34)


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def dv(deg):
    a = math.radians(deg)
    return (math.cos(a), math.sin(a))


def wing_open(prims, root, ang, z, shade, spread=1.0, fold=1.0):
    """Asa aberta: o braço até o pulso, cinco primárias abertas como dedos, as secundárias largas
    no braço e a pele de penas por baixo; a ponta de cada pena pega geada."""
    arm = 9.5 * fold
    wrist = add(root, dv(ang), arm)
    prims.append(Capsule('wingarm', 'owlfeather', z, root, wrist, 3.4, 2.4, shade=shade))
    tips = []
    for k in range(5):
        a = ang + (6 + k * 11) * spread
        ln = (13.0 - k * 1.1) * fold
        tip = add(wrist, dv(a), ln)
        prims.append(Capsule('primary', 'owlfeather', z - 0.01 * k, wrist, tip, 2.0, 0.8, shade=shade))
        prims.append(Capsule('ptip', 'frost', z - 0.01 * k + 0.005, add(wrist, dv(a), ln * 0.78), tip, 1.1, 0.7, shade=shade))
        tips.append(tip)
    for k in range(5):
        t = 0.15 + k * 0.19
        base = add(root, dv(ang), arm * t)
        a = ang + 64 * spread + k * 5
        ln = (10.5 - k * 0.6) * fold
        tip = add(base, dv(a), ln)
        prims.append(Capsule('secondary', 'owlfeather', z - 0.06 - 0.01 * k, base, tip, 2.6, 1.2, shade=shade * 0.92))
        prims.append(Capsule('stip', 'frost', z - 0.055 - 0.01 * k, add(base, dv(a), ln * 0.8), tip, 1.3, 0.9, shade=shade * 0.92))


def build(pose):
    prims, decals = [], []
    cx, cy = CENTER
    mode = pose.get('mode', 'perch')
    glow = pose.get('glow', False)
    eyes_open = pose.get('eyes', True)
    turn = pose.get('turn', 0.0)       # 0: de perfil; 1: o rosto virado para quem olha
    lean = pose.get('lean', 0.0)       # graus (+ para a frente)
    bob = pose.get('bob', 0.0)
    la = math.radians(lean)
    up = (math.sin(la), -math.cos(la))
    fw = (math.cos(la), math.sin(la))
    if mode == 'perch':
        body_c = (cx - 0.5, cy + bob)
        body = Ellipse('body', 'owlfeather', 3.0, body_c, 6.6, 8.8, ang=la)
        head_c = add(add(body_c, up, 10.2), fw, 1.0 + turn * -0.5)
    else:
        # voando: o corpo deitado para a frente
        body_c = (cx, cy - 2 + bob)
        body = Ellipse('body', 'owlfeather', 3.0, body_c, 8.4, 5.6, ang=la)
        head_c = add(add(body_c, fw, 7.6), up, 3.2)
    near = pose.get('near', None)
    far = pose.get('far', None)
    spread = pose.get('spread', 1.0)
    fold = pose.get('fold', 1.0)
    if far is not None:
        wing_open(prims, add(body_c, up, 3.0), far, 1.0, 0.58, spread, fold)
    # o rabo: leque curto embaixo (pousada) ou atrás (voando)
    if mode == 'perch':
        tb = add(body_c, up, -6.5)
        tail = [add(add(tb, fw, -3.6), up, 1.0), add(add(tb, fw, 2.0), up, 1.0), add(add(tb, fw, 0.6), up, -6.0), add(add(tb, fw, -2.6), up, -6.4), add(add(tb, fw, -4.6), up, -5.0)]
    else:
        tb = add(body_c, fw, -7.0)
        tail = [add(tb, up, 2.4), add(tb, up, -2.4), add(add(tb, fw, -8.0), up, -3.4), add(add(tb, fw, -8.6), up, 0.0), add(add(tb, fw, -8.0), up, 3.4)]
    prims.append(Poly('tail', 'owlfeather', 2.4, tail, nf=lambda x, y: norm((-0.1, -0.3, 0.9)), shade=0.8))
    prims.append(body)
    # o peito claro com as barras de pena
    breast_c = add(add(body_c, fw, 2.6 if mode == 'perch' else 1.0), up, -0.5 if mode == 'perch' else -1.6)
    breast = Ellipse('breast', 'owlface', 3.1, breast_c, 4.4 if mode == 'perch' else 6.4, 6.6 if mode == 'perch' else 3.4, ang=la)
    prims.append(breast)

    def bars(x, y, cur):
        lx, ly = breast.local(x, y)
        # chevrons pequenos, em fileiras
        row = math.floor((ly + 8) / 2.6)
        v = (ly + 8) - row * 2.6
        off = (row % 2) * 1.6
        u = ((lx + 8 + off) % 3.2) - 1.6
        if abs(v - 1.2 - abs(u) * 0.5) < 0.38:
            return ('owlfeather', 2)
        return None

    decals.append(Decal('breast', bars))
    # asa fechada (pousada): cobre o lado do corpo, com as pontas de geada nas penas de baixo
    if mode == 'perch':
        sh = add(add(body_c, up, 5.5), fw, -1.0)
        wing = [sh, add(add(sh, fw, 3.0), up, -3.0), add(add(body_c, fw, 2.8), up, -6.0), add(add(body_c, fw, -1.0), up, -9.6),
                add(add(body_c, fw, -5.6), up, -10.4), add(add(body_c, fw, -6.8), up, -4.0), add(add(sh, fw, -5.2), up, -1.0)]
        prims.append(Poly('fwing', 'owlfeather', 3.3, wing, nf=lambda x, y: norm((0.15, -0.35, 0.92)), shade=0.95))
        for k in range(5):
            c = add(add(body_c, fw, -5.0 + k * 1.7), up, -9.0 + k * 0.7)
            prims.append(Poly('wtip', 'frost', 3.32, [add(c, fw, -1.2), add(c, fw, 1.0), add(add(c, up, -2.2), fw, -0.5)],
                              nf=lambda x, y: norm((0.2, 0.0, 0.95))))
        for k in range(3):
            c = add(add(sh, fw, -2.0 + k * 0.8), up, -4.0 - k * 2.4)
            prims.append(Capsule('wbar', 'owlfeather', 3.31, add(c, fw, -2.4), add(c, fw, 2.0), 0.5, 0.5, flat=1))
        # garras no galho
        for dx in (-1.6, 1.8):
            f0 = add(FEET, (dx, -2.8))
            prims.append(Capsule('leg', 'owlface', 2.9, add(f0, (0, -2.0)), f0, 1.6, 1.3, shade=0.8))
            for a in (-30, 20, 70):
                prims.append(Capsule('talon', 'void', 2.95, f0, add(f0, dv(a + 40), 2.6), 0.6, 0.3, flat=1))
    else:
        talon = pose.get('talons', False)
        legb = add(body_c, up, -3.0)
        tip = add(add(legb, fw, 7.0 if talon else -2.0), up, -6.0 if talon else -3.6)
        prims.append(Capsule('leg', 'owlface', 2.9, legb, tip, 1.6, 1.2, shade=0.8))
        for a in (0, 40, 80):
            prims.append(Capsule('talon', 'void', 2.95, tip, add(tip, dv(a + (10 if talon else 120)), 2.8), 0.6, 0.3, flat=1))

    # ---------- cabeça: redonda, os tufos, o disco do rosto e os olhos ----------
    head = Ellipse('head', 'owlfeather', 3.6, head_c, 6.4, 5.8)
    prims.append(head)
    for side in (-1, 1):
        b0 = add(head_c, (side * 3.0 + turn * 1.0, -4.4))
        tipt = add(b0, (side * 1.6 - 1.0, -4.6))
        prims.append(Poly('tuft', 'owlfeather', 3.55 if side < 0 else 3.66, [add(b0, (-1.6, 0.6)), add(b0, (1.6, 0.6)), tipt],
                          nf=lambda x, y: norm((0.0, -0.6, 0.8))))
        prims.append(Capsule('tuftfrost', 'frost', 3.67, add(b0, (side * 0.6 - 0.3, -2.4)), tipt, 0.9, 0.5))
    # o disco: de perfil fica para a frente; virado, fica no meio
    disc_c = add(head_c, (2.6 * (1 - turn), 0.8))
    disc = Ellipse('disc', 'owlface', 3.7, disc_c, 4.2 + turn * 1.0, 4.4)
    prims.append(disc)
    beak_c = add(disc_c, (1.6 * (1 - turn) + 0.4, 1.4))
    prims.append(Poly('beak', 'bone', 3.75, [add(beak_c, (-1.1, -1.0)), add(beak_c, (1.1, -1.0)), add(beak_c, (0.3, 2.4))],
                      nf=lambda x, y: norm((0.3, -0.2, 0.9))))
    eyes_at = [(1.4, -0.6)] if turn < 0.5 else [(-2.1, -0.6), (2.1, -0.6)]

    def eye(x, y, cur):
        lx, ly = disc.local(x, y)
        for ex, ey in eyes_at:
            d = math.hypot(lx - ex, ly - ey)
            if not eyes_open:
                if abs(ly - ey) < 0.35 and abs(lx - ex) < 1.4:
                    return ('owlfeather', 1)
                continue
            if d < 0.7:
                return ('void', 0)
            if d < 1.55:
                return ('iceeye', 4 if glow else 3)
            if d < 2.0:
                return ('owlfeather', 1)
        return None

    decals.append(Decal('disc', eye))
    if near is not None:
        wing_open(prims, add(body_c, up, 2.4), near, 5.0, 1.0, spread, fold)
    return rotate_all(prims, decals, CENTER, pose.get('rot', 0.0), pose.get('off', (0.0, 0.0)))


FLY = [dict(mode='fly', near=-110, far=-96), dict(mode='fly', near=-160, far=-150, spread=0.9),
       dict(mode='fly', near=128, far=136, spread=0.8, fold=0.9), dict(mode='fly', near=178, far=186, fold=0.75, spread=0.7)]
ANIMS = {
    # dormindo no galho, os olhos fechados, a respiração subindo e descendo
    'perch': ([dict(eyes=False), dict(eyes=False, bob=0.5)], 2, True),
    # acordou: os olhos abrem e a cabeça vira para quem passa embaixo
    'alert': ([dict(turn=0.5, glow=True), dict(turn=1.0, glow=True, lean=6)], 6, False),
    'fly': (FLY, 11, True),
    'dive': ([dict(mode='fly', near=-150, far=-140, fold=0.8, spread=0.4, glow=True, talons=True, lean=20),
              dict(mode='fly', near=-156, far=-148, fold=0.78, spread=0.35, glow=True, talons=True, lean=24)], 12, True),
    'land': ([dict(mode='fly', near=-80, far=-70, spread=1.2, talons=True, lean=-20), dict(lean=-6)], 8, False),
    'hurt': ([dict(mode='fly', near=-140, far=-120, rot=-20, spread=1.3)], 10, False),
    'stun': ([dict(mode='fly', near=150, far=30, rot=150, off=(0, 8), spread=1.2), dict(mode='fly', near=146, far=34, rot=156, off=(0, 8), spread=1.25)], 5, True),
    'death': ([dict(mode='fly', near=-150, far=-120, rot=30, spread=1.4), dict(mode='fly', near=150, far=120, rot=110, spread=1.2, off=(0, 4)),
               dict(mode='fly', near=170, far=160, rot=170, fold=0.8, off=(0, 8))], 9, False),
}

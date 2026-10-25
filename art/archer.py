"""Arqueiro da sacada: vigia do Dízimo nos balcões da cidade. Capuz e tabardo cinza da ordem,
gibão de couro, aljava nas costas e a máscara de porcelana com uma fenda só (acende dourada
quando ele mira). Arco longo. Mira em três alturas: reto, para baixo e para cima.

uso: python3 archer.py <pasta_assets>
"""
import json
import math
import sys
from puppet import Ellipse, Capsule, Poly, Decal, norm, rot
from rig import rotate_all, build_sheet

W, H = 112, 80
BASE_HIP = (56.0, 58.0)
FEET = (56, 77)
# o boneco é montado pequeno e escalado a partir dos pés (fica da altura do cavaleiro)
S = 1.18

# alturas da mira (graus; positivo é para baixo)
AIMS = {'': -4.0, 'dn': 32.0, 'up': -36.0}

DEFAULT = dict(
    hip=(0.0, 0.0), lean=0.0, tilt=0.0,
    legF=(10.0, 8.0), legB=(-8.0, 6.0), footF=0.0, footB=0.0,
    # braço do arco: None = esticado na direção da mira
    bowArm=None, aim=0.0, bend=3.0,
    # mão da corda: puxada (0..1) ou solta (braço caído)
    pull=0.0, onString=False, drawArm=(-6.0, 24.0), nock=False,
    glow=False, noBow=False, bowDrop=None,
    rot=0.0, pivot=None, off=(0.0, 0.0),
)


def P(d):
    p = dict(DEFAULT)
    p.update(d)
    return p


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def dirv(deg):
    a = math.radians(deg)
    return (math.sin(a), math.cos(a))


def ik(root, target, l1, l2, bend):
    """Cotovelo e mão de um braço de dois ossos que tenta alcançar o alvo (bend escolhe o lado)."""
    dx, dy = target[0] - root[0], target[1] - root[1]
    d = math.hypot(dx, dy) or 1e-6
    reach = min(d, l1 + l2 - 0.05)
    a = math.atan2(dy, dx)
    c = (l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach)
    b = math.acos(max(-1.0, min(1.0, c)))
    ea = a + bend * b
    elbow = (root[0] + math.cos(ea) * l1, root[1] + math.sin(ea) * l1)
    hand = (root[0] + dx / d * reach, root[1] + dy / d * reach)
    return elbow, hand


def frame_points(pose):
    """Onde fica a mão do arco (de onde a flecha sai), relativo aos pés."""
    _, _, pts = rig_pose(pose)
    return [round((pts['bow'][0] - FEET[0]) * S, 1), round((pts['bow'][1] - FEET[1]) * S, 1)]


def rig_pose(pose):
    p = P(pose)
    hip = add(BASE_HIP, p['hip'])
    lean = math.radians(p['lean'])
    u = (math.sin(lean), -math.cos(lean))
    f = (math.cos(lean), math.sin(lean))
    neck = add(hip, u, 15.0)
    shF = add(add(neck, f, 2.6), u, -2.6)
    shB = add(add(neck, f, -2.2), u, -2.6)
    head = add(add(neck, u, 6.2), f, 1.2)
    aim = math.radians(p['aim'])
    ad = (math.cos(aim), math.sin(aim))
    if p['bowArm'] is None:
        # braço esticado um pouco acima da linha da mira (a flecha passa na altura do rosto)
        bd = (math.cos(aim - 0.1), math.sin(aim - 0.1))
        elbowF = add(shF, bd, 7.5)
        handF = add(elbowF, bd, 7.0)
    else:
        up, el = p['bowArm']
        elbowF = add(shF, dirv(up), 7.5)
        handF = add(elbowF, dirv(up + el), 7.0)
    return p, dict(hip=hip, u=u, f=f, neck=neck, shF=shF, shB=shB, head=head, ad=ad, lean=lean,
                   elbowF=elbowF), dict(bow=handF)


def build(pose):
    p, R, pts = rig_pose(pose)
    prims, decals = [], []
    hip, u, f, neck, shF, shB, head, ad, lean = (R[k] for k in ('hip', 'u', 'f', 'neck', 'shF', 'shB', 'head', 'ad', 'lean'))
    handF = pts['bow']
    elbowF = R['elbowF']

    # ---------- pernas: calça de pano e botas de couro ----------
    def leg(root, ang, z, shade, footang):
        th, kn = ang
        knee = add(root, dirv(th), 9.2)
        ankle = add(knee, dirv(th - kn), 8.8)
        fa = math.radians(footang)
        toe = add(ankle, (math.cos(fa), math.sin(fa)), 4.6)
        heel = add(ankle, (math.cos(fa), math.sin(fa)), -1.4)
        prims.append(Capsule('thigh', 'cloth', z, root, knee, 3.1, 2.6, shade=shade))
        prims.append(Capsule('boot', 'leather', z + 0.05, knee, ankle, 2.6, 2.2, shade=shade))
        prims.append(Capsule('foot', 'leather', z + 0.04, heel, toe, 2.0, 1.7, shade=shade))

    leg(add(hip, f, -1.8), p['legB'], 1.5, 0.6, p['footB'])
    leg(add(hip, f, 1.8), p['legF'], 4.0, 1.0, p['footF'])

    # ---------- aljava nas costas ----------
    qa = add(add(shB, f, -3.2), u, 2.5)
    qb = add(add(hip, f, -4.6), u, 2.0)
    prims.append(Capsule('quiver', 'leather', 0.8, qa, qb, 2.3, 2.0, shade=0.75))
    for k in range(3):
        tip = add(add(qa, u, 3.2 + k * 0.6), f, -1.2 + k * 1.2)
        prims.append(Ellipse('fletch', 'cloak', 0.9, tip, 0.9, 1.6, ang=lean - 0.3 + k * 0.3))

    # ---------- tronco: gibão, tabardo e capa curta ----------
    prims.append(Capsule('belly', 'cloth', 3.0, add(hip, u, 2.0), add(neck, u, -3.5), 4.8, 5.4))
    chest = add(add(neck, u, -5.4), f, 0.8)
    prims.append(Ellipse('jerkin', 'leather', 3.5, chest, 5.4, 6.0, ang=lean))
    tab = [add(add(neck, f, -3.6), u, -3.2), add(add(neck, f, 4.8), u, -3.2), add(add(hip, f, 5.6), u, -8.6),
           add(add(hip, f, 0.6), u, -7.0), add(add(hip, f, -5.0), u, -9.0)]
    prims.append(Poly('tabard', 'robe', 3.7, tab, nf=lambda x, y: norm((0.22 * math.sin(x * 1.1), -0.2, 0.95))))

    def tab_decal(x, y, cur):
        d = abs((y - (hip[1] + 7.2)) - (x - hip[0]) * 0.1)
        if d < 0.8 and y > hip[1] + 3:
            return ('gold', 2)
        # moeda do olho no peito
        if math.hypot(x - (chest[0] + 1.4), y - (chest[1] + 1.0)) < 1.3:
            return ('gold', 3)
        return None

    decals.append(Decal('tabard', tab_decal))
    belt = add(hip, u, 1.4)
    prims.append(Capsule('belt', 'leather', 3.8, add(belt, f, -5.2), add(belt, f, 5.4), 1.2, 1.2))
    prims.append(Ellipse('buckle', 'gold', 3.85, add(belt, f, 3.4), 1.0, 1.0))
    cape = [add(add(neck, f, -1.0), u, 1.5), add(add(neck, f, 3.6), u, -1.0), add(add(neck, f, 0.5), u, -9.0),
            add(add(neck, f, -5.4), u, -10.0), add(add(neck, f, -5.2), u, -3.0)]
    prims.append(Poly('cape', 'robe', 3.9, cape, nf=lambda x, y: norm((-0.35, -0.3, 0.88)), shade=0.9))

    # ---------- capuz e máscara ----------
    tilt = math.radians(p['tilt'])
    hood = Ellipse('hood', 'robe', 5.0, head, 5.0, 5.6, ang=tilt, bulge=0.9)
    prims.append(hood)
    prims.append(Ellipse('face', 'void', 5.05, add(head, rot((1.6, 0.8), tilt)), 3.4, 4.2, ang=tilt, flat=1))
    mask = Ellipse('mask', 'porcelain', 5.1, add(head, rot((2.6, 1.0), tilt)), 2.6, 3.5, ang=tilt, bulge=0.7)
    prims.append(mask)

    def mask_decal(x, y, cur):
        lx, ly = mask.local(x, y)
        if -1.3 < ly < -0.4 and -1.6 < lx < 2.4:
            return ('gold', 4) if p['glow'] and lx > -0.6 else ('void', 0)
        return None

    decals.append(Decal('mask', mask_decal))

    # ---------- arco ----------
    perp = (ad[1], -ad[0])
    tips = None
    if not p['noBow'] and p['bowDrop'] is None:
        bow, tips = bow_prims(handF, perp, ad, p['bend'] + p['pull'] * 3.0, 6.4)
        prims.extend(bow)

    # ---------- braço da corda (atrás) ----------
    if p['pull'] > 0 or p['onString']:
        target = add(handF, ad, -(2.5 + p['pull'] * 13.5))
        elbowB, handB = ik(shB, target, 7.5, 7.0, -1 if ad[0] >= 0 else 1)
        # o cotovelo fica alto, para trás
        if elbowB[1] > handB[1] + 3:
            elbowB, handB = ik(shB, target, 7.5, 7.0, 1 if ad[0] >= 0 else -1)
    else:
        up, el = p['drawArm']
        elbowB = add(shB, dirv(up), 7.5)
        handB = add(elbowB, dirv(up + el), 7.0)
    zB = 2.4 if not (p['pull'] > 0 or p['onString']) else 6.0
    prims.append(Capsule('sleeveB', 'cloth', zB, shB, elbowB, 2.4, 2.1, shade=0.8 if zB < 3 else 1.0))
    prims.append(Capsule('bracerB', 'leather', zB + 0.05, elbowB, handB, 2.1, 1.8, shade=0.8 if zB < 3 else 1.0))
    prims.append(Ellipse('gloveB', 'leather', zB + 0.1, handB, 1.7, 1.7))

    # corda: reta entre as pontas ou puxada pela mão
    if tips is not None:
        nockp = handB if (p['pull'] > 0 or p['onString']) else None
        segs = [(tips[0], nockp), (nockp, tips[1])] if nockp else [(tips[0], tips[1])]
        for a, b in segs:
            prims.append(Capsule('string', 'string', 6.2, a, b, 0.5, 0.5, flat=2))
        # flecha encaixada
        if p['nock'] and nockp:
            tail = nockp
            tipA = add(nockp, ad, 21.0)
            prims.append(Capsule('shaft', 'wood', 6.9, tail, add(tipA, ad, -2.0), 0.6, 0.6, flat=3))
            head_pts = [add(tipA, ad, 1.2), add(add(tipA, ad, -2.2), perp, 1.5), add(add(tipA, ad, -2.2), perp, -1.5)]
            prims.append(Poly('arrowhead', 'steel', 6.95, head_pts, nf=lambda x, y: norm((-0.4, -0.6, 0.7))))
            for sgn in (1, -1):
                prims.append(Capsule('fletchA', 'cloak', 6.92, add(tail, ad, 1.0), add(add(tail, ad, 4.0), perp, sgn * 1.2), 0.7, 0.5))

    # ---------- braço do arco (frente) ----------
    prims.append(Capsule('sleeveF', 'cloth', 6.0, shF, elbowF, 2.4, 2.1))
    prims.append(Capsule('bracerF', 'leather', 6.05, elbowF, handF, 2.1, 1.8))
    prims.append(Ellipse('gloveF', 'leather', 6.6, handF, 1.8, 1.8))
    prims.append(Ellipse('shoulderF', 'robe', 6.2, add(shF, u, 1.0), 3.4, 2.8, ang=lean))

    pivot = p['pivot'] or FEET
    prims, decals = rotate_all(prims, decals, pivot, p['rot'], p['off'])
    if p['bowDrop'] is not None:
        # o arco caído fica no chão, fora do giro do corpo
        bc, ba = p['bowDrop']
        bperp = (math.cos(ba), math.sin(ba))
        bow, _ = bow_prims(bc, bperp, (bperp[1], -bperp[0]), 2.0, 0.6)
        prims = prims + bow
    return rotate_all(prims, decals, FEET, 0, (0.0, 0.0), S)


def bow_prims(bc, bperp, bad, bend, bz):
    """Arco longo de madeira (curva para trás nas pontas) com a empunhadura de couro."""
    n = 9
    pts_b = []
    for i in range(n + 1):
        s = -1 + 2 * i / n
        pts_b.append(add(add(bc, bperp, s * 15.0), bad, -bend * s * s))
    out = []
    for i in range(n):
        s = abs(-1 + 2 * (i + 0.5) / n)
        out.append(Capsule('bow', 'wood', bz, pts_b[i], pts_b[i + 1], 1.5 - 0.6 * s, 1.5 - 0.6 * s))
    out.append(Capsule('grip', 'leather', bz + 0.05, add(bc, bperp, -2.2), add(bc, bperp, 2.2), 1.6, 1.6))
    return out, (pts_b[0], pts_b[-1])


# ---------- animações ----------
def idle():
    out = []
    for b in (0.0, 0.4, 0.8, 0.4):
        out.append(dict(hip=(0, b), bowArm=(22 - b, 8), aim=6 + b * 2, drawArm=(-8, 20 + b * 2)))
    return out


def turn():
    return [dict(bowArm=(10, 6), aim=0, lean=-2, drawArm=(-4, 14))]


def draw(aim):
    lean = aim * 0.12
    legs = dict(legF=(16, 10), legB=(-14, 6))
    return [
        dict(aim=aim, lean=lean, onString=True, nock=True, pull=0.15, **legs),
        dict(aim=aim, lean=lean - 1, nock=True, pull=0.55, **legs),
        dict(aim=aim, lean=lean - 2, nock=True, pull=1.0, glow=True, **legs),
    ]


def shoot(aim):
    lean = aim * 0.12
    legs = dict(legF=(16, 10), legB=(-14, 6))
    return [
        dict(aim=aim - 3, lean=lean - 3, pull=0.0, bend=2.2, drawArm=(-60, 40), **legs),
        dict(aim=aim, lean=lean - 1, pull=0.0, drawArm=(-30, 34), **legs),
    ]


def hurt():
    return [dict(lean=-10, hip=(-2, 1), bowArm=(60, 30), aim=-50, drawArm=(-30, 50), legF=(12, 8), legB=(-14, 10), tilt=-12)]


def death():
    # cai de costas; o arco escapa da mão e fica no chão na frente
    piv = (50.0, 76.0)
    return [
        dict(lean=-12, hip=(-2, 2), bowArm=(70, 40), aim=-40, drawArm=(-40, 50), tilt=-16),
        dict(hip=(-2, 6), legF=(40, 70), legB=(10, 60), lean=-20, bowArm=(120, 20), aim=-60, drawArm=(-60, 30), tilt=-20),
        dict(rot=-38, pivot=piv, off=(0, -2), hip=(-2, 4), legF=(40, 60), legB=(16, 50), lean=-10, drawArm=(-120, 20),
             bowArm=(150, 10), tilt=-10, bowDrop=((70.0, 70.0), 0.5)),
        dict(rot=-84, pivot=piv, off=(2, -1), hip=(0, 2), legF=(16, 24), legB=(2, 10), lean=0, drawArm=(-150, 10),
             bowArm=(172, 4), tilt=0, bowDrop=((68.0, 74.5), 0.04)),
    ]


ANIMS = {
    'idle': (idle(), 4, True),
    'turn': (turn(), 10, False),
}
for k, a in AIMS.items():
    ANIMS[f'draw{k}'] = (draw(a), 5, False)
    ANIMS[f'shoot{k}'] = (shoot(a), 10, False)
ANIMS['hurt'] = (hurt(), 10, False)
ANIMS['death'] = (death(), 8, False)

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    sheet, meta = build_sheet('archer', ANIMS, build, W, H, FEET, out, preview='archer_preview.png')
    # de onde sai a flecha em cada quadro de mira (o jogo usa o último quadro de 'draw')
    meta['points'] = {name: [frame_points(pose) for pose in poses] for name, (poses, _, _) in ANIMS.items() if name.startswith('draw')}
    json.dump(meta, open(f'{out}/archer.json', 'w'), indent=1)
    print('archer', sheet.size)

"""Penitente: figura rastejante de manto cinza e máscara lisa, imposta pela sociedade."""
import math, sys, json
sys.path.insert(0, '.')
from puppet import Ellipse, Capsule, Poly, Decal, norm, render, to_image

W, H = 72, 48
FEET = (36, 44)


def build(p):
    prims, decals = [], []
    bob = p.get('bob', 0.0)
    low = p.get('low', 0.0)
    hx, hy = 45 + p.get('hx', 0.0), 27 + bob + low * 1.2 + p.get('hy', 0.0)
    # manto corcunda com dobras verticais
    b = bob * 0.6 + low
    robe = [(41, 40 + low * 0.5), (42, 30 + b), (39, 25 + b), (33, 21.5 + b), (25, 22 + b), (18, 27 + b),
            (13 + p.get('tail', 0) * 0.5, 36), (9 + p.get('tail', 0), 44), (14, 42.5), (17, 44), (22, 42.8),
            (26, 44), (31, 43), (36, 44), (40, 43)]

    def robe_n(x, y):
        nx = -(x - 30) / 34 + 0.32 * math.sin(x * 0.85 + y * 0.18)
        ny = -0.75 * max(0.0, 1 - (y - 20) / 22)
        return norm((nx, ny, 0.75))

    prims.append(Poly('robe', 'robe', 3.0, robe, nf=robe_n))
    # pernas dobradas (só os pés aparecem)
    prims.append(Capsule('footB', 'husk', 2.5, (22, 41), (17, 43.5), 1.4, 1.2, shade=0.7))
    prims.append(Capsule('footF', 'husk', 3.5, (31, 41), (26, 43.5), 1.4, 1.2))
    # braços longos e magros
    for side, z, sh in (('B', 2.0, 0.6), ('F', 3.8, 1.0)):
        s0 = (39 if side == 'B' else 41, 35 + bob + low * 0.8)
        e = p['elbow' + side]
        h = p['hand' + side]
        prims.append(Capsule('arm' + side, 'husk', z, s0, e, 1.7, 1.4, shade=sh))
        prims.append(Capsule('fore' + side, 'husk', z + 0.05, e, h, 1.4, 1.1, shade=sh))
        for k, dx in enumerate((-1.6, 0.0, 1.6)):
            prims.append(Capsule('claw', 'husk', z + 0.1, h, (h[0] + 2.2 + dx * 0.3, h[1] + 0.4 + abs(dx) * 0.2), 0.7, 0.4, shade=sh))
    # capuz e máscara lisa
    prims.append(Ellipse('hood', 'robe', 4.0, (hx, hy), 6.6, 6.4, bulge=0.9))
    prims.append(Ellipse('face', 'void', 4.1, (hx + 2.2, hy + 1.0), 4.6, 5.4, flat=1))
    mask = Ellipse('mask', 'porcelain', 4.3, (hx + 3.4 + p.get('mx', 0), hy + 1.4 + p.get('my', 0)), 3.7, 4.6, bulge=0.7)
    prims.append(mask)

    def mdec(x, y, cur):
        lx, ly = mask.local(x, y)
        if -1.2 < ly < -0.3 and (0.4 < lx < 2.6 or -2.4 < lx < -0.9):
            return ('void', 0)
        if 2.0 < ly < 2.6 and -0.8 < lx < 1.4:
            return ('porcelain', 1)
        return None

    decals.append(Decal('mask', mdec))
    return prims, decals


def crawl(n=6):
    out = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        def hand(base, ph2):
            fwd = math.cos(ph2) * 4.0
            lift = max(0.0, math.sin(ph2)) * 3.0
            return (base + fwd, 44 - lift)
        hF = hand(52, ph)
        hB = hand(48, ph + math.pi)
        out.append(dict(
            bob=round(math.sin(2 * ph) * 0.8, 2),
            handF=hF, elbowF=((42 + hF[0]) / 2 + 1.5, 37 - max(0, math.sin(ph)) * 1.5),
            handB=hB, elbowB=((40 + hB[0]) / 2 + 1.0, 37.5 - max(0, math.sin(ph + math.pi)) * 1.5),
            tail=round(math.sin(ph) * 1.0, 2), hx=round(math.cos(ph) * 0.6, 2),
        ))
    return out


def death():
    return [
        dict(bob=-1.5, hy=-2.5, hx=-1, handF=(54, 40), elbowF=(49, 35), handB=(50, 41), elbowB=(46, 36)),
        dict(low=3, hy=1, handF=(55, 44), elbowF=(50, 41), handB=(51, 44), elbowB=(46, 41)),
        dict(low=5, hy=2.5, handF=(56, 44), elbowF=(51, 43), handB=(52, 44), elbowB=(47, 43), mx=2.5, my=2.5),
        dict(low=6, hy=3, handF=(56, 44), elbowF=(51, 43.5), handB=(52, 44), elbowB=(47, 43.5), mx=6, my=4),
    ]


ANIMS = {'crawl': (crawl(), 9, True), 'death': (death(), 10, False)}

if __name__ == '__main__':
    out = sys.argv[1]
    cols = max(len(f) for f, _, _ in ANIMS.values())
    from PIL import Image
    sheet = Image.new('RGBA', (cols * W, len(ANIMS) * H), (0, 0, 0, 0))
    meta = {'frameWidth': W, 'frameHeight': H, 'originX': FEET[0] / W, 'originY': FEET[1] / H, 'columns': cols, 'anims': {}}
    for row, (name, (poses, fps, loop)) in enumerate(ANIMS.items()):
        for i, pose in enumerate(poses):
            prims, decals = build(pose)
            px, _ = render(prims, decals, W, H)
            sheet.alpha_composite(to_image(px, W, H), (i * W, row * H))
        meta['anims'][name] = {'start': row * cols, 'count': len(poses), 'fps': fps, 'loop': loop}
    sheet.save(out + '/penitent.png')
    json.dump(meta, open(out + '/penitent.json', 'w'), indent=1)
    prev = Image.new('RGBA', sheet.size, (24, 28, 42, 255))
    prev.alpha_composite(sheet)
    prev.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save('penitent_preview.png')

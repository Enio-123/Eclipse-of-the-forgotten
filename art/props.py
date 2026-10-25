"""Objetos novos das catacumbas: vela de descanso, pedestal das relíquias, grade de ferro, as
relíquias (Garras de Ferro e Pena do Eclipse), a memória que se coleta e o Cobrador.

O cenário (vela, pedestal, grade) sai em pixel art para decos.py repintar no estilo do lugar;
as relíquias, a memória e o Cobrador ficam em pixel art, como os personagens.

uso: python3 props.py <pasta_decos_originais> <pasta_assets>
"""
import json
import math
import sys
from PIL import Image
import puppet
from puppet import Ellipse, Capsule, Poly, Decal, norm, render, to_image
from deco import Px, IRON, STONE
from rig import build_sheet

WAX = [0x6c6150, 0x9c907a, 0xc9bea6, 0xe2d8c0, 0xf4eddb]
BRASS = [0x3a2a12, 0x664a1e, 0x94702e, 0xc49a48, 0xe8c67a]

puppet.RAMPS['coat'] = [0x0d0b10, 0x18141c, 0x251f2a, 0x342b38, 0x463a4a]
puppet.RAMPS['brass'] = BRASS
puppet.RAMPS['wax'] = WAX
puppet.RIM_MATS |= {'coat'}


def shrine(out):
    """Vela de descanso: altar de pedra com um prato de ferro e cinco velas grossas.
    As chamas entram no jogo (acendem quando o cavaleiro descansa)."""
    W, H = 44, 54
    p = Px(W, H)
    # degrau de baixo, bloco do meio e tampo
    p.rect(3, 47, 41, 54, STONE[1]); p.rect(3, 47, 41, 48, STONE[3]); p.rect(3, 53, 41, 54, STONE[0])
    p.rect(8, 31, 36, 47, STONE[2]); p.rect(8, 31, 10, 47, STONE[3]); p.rect(34, 31, 36, 47, STONE[1])
    # painel entalhado com a moeda-olho do dízimo
    p.rect(12, 34, 32, 44, STONE[1]); p.rect(13, 35, 31, 43, STONE[2])
    for y in range(35, 44):
        for x in range(13, 31):
            d = math.hypot(x + 0.5 - 22, (y + 0.5 - 39) * 1.15)
            if 3.0 < d < 4.3:
                p.set(x, y, STONE[4] if x < 22 else STONE[1])
            elif d <= 1.2:
                p.set(x, y, STONE[0])
    p.rect(5, 27, 39, 31, STONE[3]); p.rect(5, 27, 39, 28, STONE[5]); p.rect(5, 30, 39, 31, STONE[1])
    # cera escorrida pela borda do tampo
    for x, ln in ((9, 5), (14, 3), (27, 6), (33, 4)):
        p.rect(x, 27, x + 2, 28 + ln, WAX[2]); p.set(x, 28 + ln, WAX[1]); p.set(x, 27, WAX[3])
    # prato de ferro
    p.rect(9, 24, 35, 27, IRON[1]); p.rect(10, 24, 34, 25, IRON[3]); p.rect(8, 23, 36, 24, IRON[2])
    # velas (x, altura)
    wicks = []
    for x, h in ((11, 9), (16, 14), (21, 18), (26, 12), (31, 8)):
        top = 23 - h
        p.rect(x, top, x + 4, 23, WAX[2]); p.rect(x, top, x + 1, 23, WAX[3]); p.rect(x + 3, top, x + 4, 23, WAX[1])
        p.rect(x, top, x + 4, top + 1, WAX[4])
        # pingos de cera
        p.set(x + (h % 3), top + 2, WAX[4]); p.set(x + 3, top + 3 + h % 4, WAX[3])
        p.set(x + 2, top - 1, 0x1a1410)
        wicks.append((x + 2 - W / 2, top - 1 - H))
    p.save(f'{out}/deco-shrine.png')
    return {'wicks': [[round(a, 1), round(b, 1)] for a, b in wicks]}


def pedestal(out):
    """Pedestal de pedra onde a relíquia flutua."""
    W, H = 28, 36
    p = Px(W, H)
    p.rect(2, 30, 26, 36, STONE[1]); p.rect(2, 30, 26, 31, STONE[3]); p.rect(2, 35, 26, 36, STONE[0])
    p.rect(6, 12, 22, 30, STONE[2])
    for x in (8, 12, 16, 20):
        p.rect(x, 13, x + 1, 29, STONE[1])
        p.rect(x - 1, 13, x, 29, STONE[3])
    p.rect(6, 12, 7, 30, STONE[3]); p.rect(21, 12, 22, 30, STONE[1])
    p.rect(3, 8, 25, 12, STONE[3]); p.rect(3, 8, 25, 9, STONE[5]); p.rect(3, 11, 25, 12, STONE[1])
    # almofada gasta em cima
    p.rect(8, 5, 20, 8, 0x3b2430); p.rect(9, 5, 19, 6, 0x5a3443); p.set(8, 7, 0x24161e); p.set(19, 7, 0x24161e)
    p.rect(7, 7, 8, 9, BRASS[3]); p.rect(20, 7, 21, 9, BRASS[2])
    p.save(f'{out}/deco-pedestal.png')


def portcullis(out):
    """Grade de ferro (1 tile de largura, 5 de altura), com pontas embaixo."""
    W, H = 16, 80
    p = Px(W, H)
    for bx in (2, 9):
        p.rect(bx, 0, bx + 4, 74, IRON[1]); p.rect(bx + 1, 0, bx + 2, 74, IRON[3]); p.rect(bx + 3, 0, bx + 4, 74, IRON[0])
        # ponta
        p.rect(bx, 74, bx + 4, 76, IRON[1]); p.rect(bx + 1, 76, bx + 3, 78, IRON[2]); p.set(bx + 1, 78, IRON[3]); p.set(bx + 2, 79, IRON[1])
        p.set(bx + 1, 74, IRON[3])
    for by in (6, 26, 46, 66):
        p.rect(0, by, 16, by + 3, IRON[2]); p.rect(0, by, 16, by + 1, IRON[4]); p.rect(0, by + 2, 16, by + 3, IRON[0])
        for bx in (3, 10):
            p.set(bx + 1, by + 1, IRON[4]); p.set(bx + 2, by + 1, IRON[3])
    # ferrugem
    for x, y in ((4, 18), (11, 33), (3, 52), (12, 61), (10, 12), (5, 40)):
        p.set(x, y, 0x5a3a26); p.set(x, y + 1, 0x3e2a1e)
    p.save(f'{out}/deco-portcullis.png')


def flame(out):
    """Chama das velas de descanso: 4 quadros de 5x9."""
    sheet = Image.new('RGBA', (20, 9), (0, 0, 0, 0))
    shapes = [
        ['..y..', '..y..', '.yY..', '.yYy.', 'oyWyo', 'oyWyo', '.oyo.', '.oro.', '..r..'],
        ['...y.', '..y..', '..Yy.', '.yYy.', 'oyWyo', 'oyWyo', '.oyo.', '.oro.', '..r..'],
        ['.....', '..y..', '..y..', '.yYy.', '.yWy.', 'oyWyo', 'oyWyo', '.oro.', '..r..'],
        ['.y...', '..y..', '.Yy..', '.yYy.', 'oyWyo', 'oyWyo', '.oyo.', '.oro.', '..r..'],
    ]
    cols = {'y': (255, 201, 107, 255), 'Y': (255, 233, 184, 255), 'W': (255, 250, 236, 255), 'o': (242, 160, 63, 255), 'r': (178, 92, 40, 255)}
    for f, rows in enumerate(shapes):
        for y, row in enumerate(rows):
            for x, c in enumerate(row):
                if c in cols:
                    sheet.putpixel((f * 5 + x, y), cols[c])
    sheet.save(f'{out}/flame.png')


def relics(out):
    """Ícones das relíquias (18x18): Garras de Ferro e Pena do Eclipse."""
    W = H = 18
    # garras: manopla de ferro com três garras curvas
    prims = [
        Capsule('cuff', 'steel', 1.0, (5.0, 13.0), (9.0, 9.5), 3.2, 3.0),
        Ellipse('hand', 'steel', 2.0, (10.0, 8.2), 3.4, 2.8, ang=-0.6),
        Capsule('ring', 'gold', 2.5, (4.2, 12.0), (7.0, 14.8), 0.8, 0.8),
    ]
    for k, (a, b, c) in enumerate((((11.0, 5.5), (14.0, 2.6), (16.2, 3.4)), ((12.6, 7.2), (15.6, 5.4), (17.0, 7.0)), ((13.0, 9.4), (15.8, 9.2), (16.4, 11.2)))):
        prims.append(Capsule('claw', 'steel', 3.0 + k * 0.1, a, b, 1.3, 0.9))
        prims.append(Capsule('tip', 'steel', 3.05 + k * 0.1, b, c, 0.9, 0.4))
    px, _ = render(prims, [], W, H)
    to_image(px, W, H, outline_col=0x06070c).save(f'{out}/relic-wall.png')

    # pena: pena negra com a haste dourada e o anel do eclipse em volta
    prims = []
    quill = ((3.5, 15.5), (14.5, 2.5))
    for i in range(9):
        t = 0.18 + i * 0.09
        bx = quill[0][0] + (quill[1][0] - quill[0][0]) * t
        by = quill[0][1] + (quill[1][1] - quill[0][1]) * t
        ln = 4.8 * math.sin(math.pi * min(1.0, t * 1.15))
        prims.append(Capsule('vane', 'bone', 1.0 + i * 0.01, (bx, by), (bx - ln * 0.55, by - ln * 0.9), 1.4, 0.6))
        prims.append(Capsule('vane', 'bone', 1.0 + i * 0.01, (bx, by), (bx + ln * 0.9, by + ln * 0.5), 1.4, 0.6))
    prims.append(Capsule('quill', 'gold', 2.0, quill[0], quill[1], 0.7, 0.45))
    px, _ = render(prims, [], W, H)
    im = to_image(px, W, H, outline_col=0x06070c)
    for y in range(H):
        for x in range(W):
            d = math.hypot(x + 0.5 - 9, y + 0.5 - 9)
            if 8.0 < d < 8.9 and im.getpixel((x, y))[3] == 0 and (x + y) % 3 != 0:
                im.putpixel((x, y), (242, 205, 120, 255))
    im.save(f'{out}/relic-double.png')


def memory(out):
    """A memória: uma lágrima de luz dourada com o miolo branco (12x16)."""
    W, H = 12, 16
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for y in range(H):
        for x in range(W):
            u = (x + 0.5 - 6) / 4.6
            v = (y + 0.5 - 10) / 5.4
            # gota: círculo embaixo que afina em ponta em cima
            if v < 0:
                w = 1 + v * 0.95
                r = abs(u) / max(w, 0.05)
                inside = v > -1.1 and r <= 1.0
                d = max(r, -v / 1.1)
            else:
                d = math.hypot(u, v)
                inside = d <= 1.0
            if not inside:
                continue
            if d < 0.35:
                c = (255, 252, 240)
            elif d < 0.62:
                c = (255, 233, 176)
            elif d < 0.85:
                c = (240, 196, 106)
            else:
                c = (176, 120, 46)
            if x < 6 and 0.4 < d < 0.75 and v < 0.2:
                c = (255, 246, 214)
            im.putpixel((x, y), c + (255,))
    im.save(f'{out}/memory.png')


# ---------- o Cobrador ----------
CW, CH = 64, 64
CFEET = (30, 62)


def cobrador_build(pose):
    """Cobrador do Dízimo: corcunda num casaco comprido coberto de moedas costuradas, máscara de
    porcelana com uma moeda no lugar de um olho e uma balança na mão com uma luz no prato."""
    prims, decals = [], []
    b = pose.get('breath', 0.0)
    tilt = pose.get('tilt', 0.0)
    arm = pose.get('arm', 0.0)
    sway = pose.get('sway', 0.0)
    # casaco (sino largo até o chão)
    coat = [(22, 30 + b), (36, 28 + b), (42, 44), (45, 61), (15, 61), (17, 46)]

    def coat_n(x, y):
        return norm(((x - 30) / 16 + 0.18 * math.sin(x * 0.9), -0.15, 0.85))

    prims.append(Poly('coat', 'coat', 2.0, coat, nf=coat_n))

    def coat_dec(x, y, cur):
        # moedas costuradas em fileiras tortas e a barra puída
        if y > 59.5 and int(x) % 3 == 0:
            return ('coat', 0)
        fx = (x - 14) % 6.0
        fy = (y - 34 - (x * 0.35) % 3) % 7.0
        if 1.6 < fx < 3.4 and 1.4 < fy < 3.0 and y > 34:
            return ('gold', 2 if x < 30 else 1)
        return None

    decals.append(Decal('coat', coat_dec))
    # corcunda e cachecol
    prims.append(Ellipse('hump', 'coat', 2.5, (27 - sway * 0.3, 30 + b), 10.0, 7.5, ang=-0.3))
    prims.append(Ellipse('scarf', 'robe', 3.0, (33, 29 + b), 6.0, 3.4, ang=0.15))
    # cabeça: capuz e máscara de porcelana
    hx, hy = 37 + sway * 0.4, 22 + b + tilt * 0.4
    prims.append(Ellipse('hood', 'coat', 3.5, (hx - 2, hy - 1), 6.6, 6.8, bulge=0.9))
    mask = Ellipse('mask', 'porcelain', 4.0, (hx + 1.6, hy + 0.8), 4.0, 5.0, ang=tilt * 0.05)
    prims.append(mask)

    def mask_dec(x, y, cur):
        lx, ly = mask.local(x, y)
        if math.hypot(lx - 1.3, ly + 0.8) < 1.35:
            return ('gold', 4 if pose.get('glint') else 3)
        if math.hypot(lx - 1.3, ly + 0.8) < 1.9:
            return ('gold', 1)
        if math.hypot(lx + 1.8, ly + 0.8) < 0.9:
            return ('void', 0)
        if 2.4 < ly < 2.9 and -1.6 < lx < 1.8:
            return ('void', 1)
        return None

    decals.append(Decal('mask', mask_dec))
    # chapéu de abas largas
    prims.append(Ellipse('brim', 'coat', 4.5, (hx - 1, hy - 5.2), 9.5, 1.8, ang=-0.12 + tilt * 0.02))
    prims.append(Ellipse('crown', 'coat', 4.4, (hx - 1.5, hy - 8.0), 5.0, 3.6))
    prims.append(Capsule('band', 'brass', 4.45, (hx - 6.0, hy - 6.4), (hx + 3.0, hy - 6.8), 0.7, 0.7))
    # braço com a balança
    sh = (36, 31 + b)
    el = (40, 40 + b - arm * 2)
    hd = (45, 37 + b - arm * 5)
    prims.append(Capsule('sleeve', 'coat', 5.0, sh, el, 2.6, 2.3))
    prims.append(Capsule('forearm', 'coat', 5.1, el, hd, 2.2, 1.8))
    prims.append(Ellipse('fingers', 'husk', 5.2, (hd[0] + 1.2, hd[1] - 0.5), 1.6, 1.3))
    top = (hd[0] + 1.5, hd[1] - 3.0)
    prims.append(Capsule('beam', 'brass', 5.3, (top[0] - 7, top[1] + sway * 0.3), (top[0] + 7, top[1] - sway * 0.3), 0.6, 0.6))
    prims.append(Capsule('post', 'brass', 5.25, (hd[0] + 1.5, hd[1]), top, 0.6, 0.6))
    for sx, lift in ((-7, sway * 0.3), (7, -sway * 0.3)):
        px_ = top[0] + sx
        py_ = top[1] + lift
        prims.append(Capsule('cord', 'string', 5.2, (px_, py_), (px_ - 2.2, py_ + 7), 0.3, 0.3, flat=2))
        prims.append(Capsule('cord', 'string', 5.2, (px_, py_), (px_ + 2.2, py_ + 7), 0.3, 0.3, flat=2))
        prims.append(Ellipse('pan', 'brass', 5.4, (px_, py_ + 7.6), 3.0, 1.0))
    # a luz de memória no prato da direita
    lx, ly = top[0] + 7, top[1] - sway * 0.3 + 5.6
    prims.append(Ellipse('light', 'gold', 5.5, (lx, ly), 1.5, 1.7, flat=4))
    # o outro braço segura o livro de contas junto ao peito
    prims.append(Poly('ledger', 'leather', 4.8, [(25, 36 + b), (33, 35 + b), (34, 45 + b), (26, 46 + b)], nf=lambda x, y: norm((-0.3, -0.2, 0.9))))
    prims.append(Capsule('ledger-edge', 'wax', 4.85, (26, 45.6 + b), (33.6, 44.6 + b), 0.5, 0.5, flat=3))
    prims.append(Capsule('arm2', 'coat', 4.9, (25, 33 + b), (29, 41 + b), 2.4, 2.0))
    return prims, decals


COB_ANIMS = {
    'idle': ([dict(breath=0.0), dict(breath=0.5, sway=0.6), dict(breath=1.0, sway=1.0), dict(breath=0.5, sway=0.4)], 4, True),
    'talk': ([dict(tilt=-2, arm=0.6, glint=True), dict(tilt=1, arm=1.0, sway=-1.0), dict(tilt=-1, arm=0.8, glint=True, sway=1.0)], 6, True),
}


if __name__ == '__main__':
    deco_out = sys.argv[1]
    assets = sys.argv[2]
    meta = shrine(deco_out)
    pedestal(deco_out)
    portcullis(deco_out)
    flame(assets)
    relics(assets)
    memory(assets)
    json.dump(meta, open(f'{assets}/deco-shrine.json', 'w'))
    build_sheet('cobrador', COB_ANIMS, cobrador_build, CW, CH, CFEET, assets, preview='cobrador_preview.png', scale=4)
    print('ok', meta)

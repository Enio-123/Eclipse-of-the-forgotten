"""O desenho da cidade (as casas de city-mid e os prédios de city-far), tirado de fundos_cidade.py sem pintar
nada: refaz os mesmos sorteios, na mesma ordem, e devolve as medidas (em px da pintura 2x). Os fundos em 3x
do ECLIPSE (ecl_cidade.py) pintam em cima deste plano, então as casas, as janelas acesas, os varais e os
lampiões ficam exatamente onde já estavam.

Cada sorteio daqui tem que casar com o de fundos_cidade.py: `python3 cidade_plano.py` confere (o gerador
tem que terminar no mesmo estado que o do pintor antigo).
"""
import math
import numpy as np
from brush import value_noise
from shapes import Mask
from pedra3 import pnoise


def house_plan(rng, w, h, kind, base, tone):
    """As medidas de uma casa (as de house() em fundos_cidade.py). x = 0 é o canto esquerdo da casa."""
    timber = kind in ('gable', 'side') and rng.random() < 0.7
    roof_h = w * rng.uniform(0.42, 0.62) if kind == 'gable' else rng.uniform(40, 76) if kind == 'side' else w * rng.uniform(1.6, 2.2)
    top = base - h
    m_top = top - roof_h - 120
    LW, LH = int(w + 60), int(840 - m_top) + 2
    jet = rng.uniform(5, 9) if timber else 0
    floors = max(2, int(h // rng.uniform(62, 74)))
    fh = h / floors
    chimneys, dormers = [], []
    if kind == 'gable':
        if rng.random() < 0.7:
            cx = w * rng.uniform(0.62, 0.8)
            slope_y = top - roof_h * (1 - abs(cx - w / 2) / (w / 2 + jet + 9))
            chimneys.append([cx, slope_y])
    elif kind == 'side':
        for _ in range(rng.integers(0, 3)):
            dx = rng.uniform(30, w - 50)
            dw = rng.uniform(26, 34)
            dy = top - roof_h * rng.uniform(0.25, 0.45)
            dormers.append((dx, dw, dy))
        for _ in range(rng.integers(1, 3)):
            chimneys.append([rng.uniform(24, w - 24), top - roof_h])
    for c in chimneys:
        cw = rng.uniform(14, 20)
        ch = rng.uniform(46, 70)
        c += [cw, ch]
    shade = 0.92 + 0.16 * rng.random()
    value_noise(LH, LW, 18, rng, 3)
    posts, braces = [], []
    if timber:
        nposts = max(2, int(w // rng.uniform(38, 52)))
        posts = [i * w / nposts for i in range(nposts + 1)]
        for f in range(floors):
            for i in range(nposts):
                if rng.random() < 0.45:
                    xa, xb = i * w / nposts, (i + 1) * w / nposts
                    ya, yb = top + f * fh, top + (f + 1) * fh
                    if rng.random() < 0.5:
                        braces.append((xa, yb, xb, ya))
                    else:
                        braces.append((xa, ya, xb, yb))
    wins = []
    for f in range(floors - 1 if kind != 'tower' else floors):
        y0 = top + f * fh + fh * 0.3
        n = max(1, int(w // 62)) if kind != 'tower' else 1
        for i in range(n):
            if rng.random() < 0.12:
                continue
            cx = (i + 0.5) * w / n + rng.normal(0, 3)
            ww, wh = (18, 26) if kind != 'tower' else (12, 30)
            wins.append([cx, y0, ww, wh, bool(rng.random() < 0.42), False, False])
    if kind == 'gable' and rng.random() < 0.7:
        wins.append([w / 2, top - roof_h * 0.45, 14, 18, bool(rng.random() < 0.6), False, True])
    for wn in wins:
        if not wn[4] and rng.random() < 0.5:
            wn[5] = True                       # folhas de madeira abertas dos lados
    smoke = []
    for c in chimneys:
        on = bool(rng.random() < 0.6)
        if on:
            for k in range(14):
                rng.normal(0, 2)
                rng.random()
        smoke.append(on)
    return dict(w=w, h=h, kind=kind, tone=tone, base=base, top=top, roof_h=roof_h, timber=bool(timber), jet=jet, floors=floors, fh=fh,
                chimneys=[tuple(c) + (s,) for c, s in zip(chimneys, smoke)], dormers=dormers, shade=shade, posts=posts, braces=braces,
                wins=[tuple(v) for v in wins])


def mid_plan(rng, TW=2048, H=840, base=700):
    """As casas de city-mid e o que fica entre elas: varais (com os panos) e lampiões."""
    plan = []
    x = rng.uniform(0, 30)
    while x < TW - 60:
        kind = str(rng.choice(['gable', 'side', 'gable', 'side', 'tower'], p=[0.3, 0.3, 0.12, 0.13, 0.15]))
        if kind == 'tower':
            w, h = rng.uniform(64, 84), rng.uniform(240, 320)
        else:
            w, h = rng.uniform(130, 210), rng.uniform(110, 190)
        plan.append((x, w, h, kind, rng.random()))
        x += w + rng.uniform(6, 46)
    houses = []
    for (x, w, h, kind, tone) in sorted(plan, key=lambda p: p[3] != 'tower'):
        hp = house_plan(rng, w, h, kind, base, tone)
        hp['x'] = x
        houses.append(hp)
    plan.sort(key=lambda p: p[0])
    gaps = []
    for i, (x, w, h, kind, tone) in enumerate(plan):
        nx = plan[(i + 1) % len(plan)]
        x2 = nx[0] + (TW if i + 1 == len(plan) else 0)
        gaps.append((x + w, x2, min(h, nx[2])))
    lines, lanterns = [], []
    for (xa, xb, hh) in gaps:
        if xb - xa < 4:
            continue
        r = rng.random()
        if r < 0.45 and xb - xa > 10:
            y = base - hh * rng.uniform(0.45, 0.7)
            cloths = []
            for t in np.linspace(0.15, 0.85, rng.integers(2, 5)):
                cw, chh = rng.uniform(14, 24), rng.uniform(20, 34)
                c = int(rng.integers(0, 4))
                sway = rng.normal(0, 2)
                low = rng.uniform(0.85, 1.0)
                cloths.append((float(t), cw, chh, c, sway, low))
            lines.append((xa - 10, xb + 10, y, 22.0, cloths))
        elif r < 0.8:
            y = base - rng.uniform(150, 210)
            side = xa if rng.random() < 0.5 else xb
            lanterns.append((side, y, 1 if side == xa else -1))
    return dict(houses=houses, lines=lines, lanterns=lanterns, TW=TW, H=H, base=base)


def skyline(W, rng, wr, hr, kinds, gap=(-6, 8)):
    out = []
    x = rng.uniform(0, 20)
    while x < W:
        k = rng.choice(len(kinds[0]), p=kinds[1])
        kind = kinds[0][k]
        w = rng.uniform(*wr) * (0.55 if kind == 'tower' else 1.0)
        h = rng.uniform(*hr) * (1.5 if kind == 'tower' else 1.0)
        out.append((x, w, h, kind))
        x += w + rng.uniform(*gap)
    return out


def far_shape(rng, x, w, base, h, kind):
    """Os sorteios de far_building(): devolve as medidas do telhado de cada prédio ao longe."""
    top = base - h
    d = dict(x=x, w=w, h=h, top=top, base=base, kind=kind)
    if kind == 'gable':
        d['rh'] = w * rng.uniform(0.35, 0.7)
    elif kind == 'side':
        d['rh'] = rng.uniform(14, 30)
        if rng.random() < 0.6:
            cx = x + w * rng.uniform(0.2, 0.8)
            d['chim'] = (cx, rng.uniform(8, 18))
    elif kind == 'tower':
        d['sh'] = w * rng.uniform(1.4, 2.6)
    return d


def far_draw(m, d, H, pad=200):
    """A silhueta de um prédio ao longe (a mesma de far_building(), com as medidas já sorteadas)."""
    x, w, top, kind = d['x'] + pad, d['w'], d['top'], d['kind']
    m.rect(x, top, x + w, H)
    if kind == 'gable':
        rh = d['rh']
        m.poly([(x - 2, top + 1), (x + w / 2, top - rh), (x + w + 2, top + 1)])
    elif kind == 'side':
        rh = d['rh']
        m.poly([(x - 3, top + 1), (x + 6, top - rh), (x + w - 6, top - rh), (x + w + 3, top + 1)])
        if 'chim' in d:
            cx, chh = d['chim']
            m.rect(cx + pad - 3, top - rh - chh, cx + pad + 3, top - rh + 2)
    elif kind == 'tower':
        sh = d['sh']
        m.poly([(x - 2, top + 1), (x + w / 2, top - sh), (x + w + 2, top + 1)])
        m.line([(x + w / 2, top - sh), (x + w / 2, top - sh - 10)], 1.2)
    elif kind == 'flat':
        n = max(2, int(w // 10))
        for i in range(n):
            if i % 2 == 0:
                x0 = x + i * w / n
                m.rect(x0, top - 7, x0 + w / n, top + 1)
    elif kind == 'dome':
        m.ellipse(x + w / 2, top, w * 0.42, w * 0.36)
        m.line([(x + w / 2, top - w * 0.36), (x + w / 2, top - w * 0.36 - 14)], 1.4)


def wrap_fix(m, TW, pad=200):
    a = m.array()
    out = a[:, pad:pad + TW].copy()
    left = a[:, :pad]
    right = a[:, pad + TW:pad + TW + pad]
    out[:, TW - pad:] = np.maximum(out[:, TW - pad:], left)
    out[:, :right.shape[1]] = np.maximum(out[:, :right.shape[1]], right)
    return out


def far_plan(rng, TW=2048, H=800):
    """city-far: a faixa A (ao longe), a catedral (fixa, em x = 1150) e a faixa B (mais perto), com as
    janelinhas acesas de cada uma: (faixa, número do prédio, x, y, tom)."""
    lights = []
    A = []
    for (x, w, h, kind) in skyline(TW, rng, (34, 96), (50, 140), (['gable', 'side', 'tower', 'flat', 'dome'], [0.34, 0.3, 0.14, 0.14, 0.08])):
        A.append(far_shape(rng, x, w, 650, h, kind))
        for _ in range(int(w * h / 1500)):
            if rng.random() < 0.5:
                lights.append(('A', len(A) - 1, x + rng.uniform(3, w - 3), 650 - rng.uniform(8, h - 6)))
    B = []
    for (x, w, h, kind) in skyline(TW, rng, (60, 150), (90, 210), (['gable', 'side', 'tower', 'flat'], [0.4, 0.34, 0.14, 0.12]), gap=(-12, 4)):
        if 1150 - 240 < x < 1150 + 560 and h > 150:
            h *= 0.6
        B.append(far_shape(rng, x, w, 700, h, kind))
        for _ in range(int(w * h / 2200)):
            if rng.random() < 0.5:
                lights.append(('B', len(B) - 1, x + rng.uniform(4, w - 4), 700 - rng.uniform(10, h - 10)))
    # as janelinhas: só as que caem em cima do prédio da faixa delas (e só essas sorteiam a cor)
    masks = {}
    for band, shapes in (('A', A), ('B', B)):
        m = Mask(TW + 400, H)
        for d in shapes:
            far_draw(m, d, H)
        masks[band] = wrap_fix(m, TW)
    out = []
    for band, bi, x, y in lights:
        x %= TW
        if masks[band][int(min(y, H - 1)), int(x)] < 0.9:
            continue
        out.append((band, bi, x, y, float(rng.random())))
    return dict(A=A, B=B, lights=out, cathedral=1150.0, TW=TW, H=H, masks=masks)


def claustro_plan(rng, TW=2048, H=840):
    """claustro-mid: em que vãos tem vela acesa lá dentro, os ramos de hera (x, se desce do telhado ou
    sobe da mureta, comprimento) e os ciprestes (x, altura, o tremido de cada ponto do contorno)."""
    pnoise(H, TW, 20, rng, 3)
    bay = 128
    glows = []
    for i in range(TW // bay):
        if rng.random() < 0.35:
            glows.append(i * bay + bay / 2 + rng.normal(0, 14))
    ivy = []
    for k in range(70):
        x = rng.uniform(0, TW)
        top = bool(rng.random() < 0.55)
        ln = rng.uniform(20, 90) if top else rng.uniform(14, 40)
        for o in range(3):
            for j in range(int(ln / 5)):
                rng.normal(0, 3)
                rng.uniform(2.5, 5.0)
                rng.random()
        ivy.append((x, top, ln))
    trees = []
    for k in range(5):
        x = rng.uniform(0, TW)
        h = rng.uniform(260, 360)
        trees.append((x, h, [rng.normal(0, 1.2) for _ in range(40)]))
    return dict(glows=glows, ivy=ivy, trees=trees, TW=TW, H=H, bay=bay)


def nave_plan(rng, TW=2048, H=840):
    """nave-mid: o que fica pendurado em cada vão entre os pilares (estandarte e até onde ele desce, ou
    lustre e a altura do aro) e os castiçais de pé (x, altura). Os pilares ficam a cada 512, sem sorteio."""
    span, pw, floor, cap_y = 512, 118, 660, 236
    for i in range(TW // span):
        value_noise(H, span + 80, 16, rng, 3)
    hang = []
    for i in range(TW // span):
        gx = (i + 1) * span
        hang.append(('banner', gx, rng.uniform(330, 400)) if i % 2 == 0 else ('chandelier', gx, rng.uniform(170, 230)))
    stands = []
    for i in range(TW // span):
        for sgn in (-1, 1):
            if rng.random() < 0.5:
                stands.append((i * span + span / 2 + sgn * (pw / 2 + 60), rng.uniform(130, 170)))
    return dict(hang=hang, stands=stands, TW=TW, H=H, span=span, pw=pw, floor=floor, cap_y=cap_y)


if __name__ == '__main__':
    # confere com o pintor antigo: o gerador tem que terminar no mesmo estado
    import fundos_cidade as old
    ra, rb = np.random.default_rng(63), np.random.default_rng(63)
    p = mid_plan(ra)
    old.pnoise(840, 2048, 50, ra, 3, sx=3.0)
    old.city_mid(rb)
    same = ra.bit_generator.state['state'] == rb.bit_generator.state['state']
    print('city-mid:', len(p['houses']), 'casas,', len(p['lines']), 'varais,', len(p['lanterns']), 'lampiões;', 'IGUAL' if same else 'DIFERENTE')
    ra, rb = np.random.default_rng(62), np.random.default_rng(62)
    p = far_plan(ra)
    old.pnoise(800, 2048, 60, ra, 3, sx=3.0)
    old.city_far(rb)
    same2 = ra.bit_generator.state['state'] == rb.bit_generator.state['state']
    print('city-far:', len(p['A']), '+', len(p['B']), 'prédios,', len(p['lights']), 'janelas;', 'IGUAL' if same2 else 'DIFERENTE')
    ra, rb = np.random.default_rng(66), np.random.default_rng(66)
    p = claustro_plan(ra)
    old.claustro_mid(rb)
    same3 = ra.bit_generator.state['state'] == rb.bit_generator.state['state']
    print('claustro-mid:', len(p['glows']), 'velas,', len(p['ivy']), 'ramos de hera,', len(p['trees']), 'ciprestes;', 'IGUAL' if same3 else 'DIFERENTE')
    ra, rb = np.random.default_rng(65), np.random.default_rng(65)
    p = nave_plan(ra)
    old.nave_mid(rb)
    same4 = ra.bit_generator.state['state'] == rb.bit_generator.state['state']
    print('nave-mid:', [(k, x, round(v)) for k, x, v in p['hang']], [(round(x), round(h)) for x, h in p['stands']], 'IGUAL' if same4 else 'DIFERENTE')
    raise SystemExit(0 if same and same2 and same3 and same4 else 1)

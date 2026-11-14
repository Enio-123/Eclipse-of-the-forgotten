"""Fundos do Fosso dos Esquecidos e do Leito do Abismo para o ECLIPSE (3 px da imagem por px do mundo).

O mesmo desenho do traço liso (fundos_fosso.py, lido pelo plano de poco_plano.py: as mesmas faces de
rocha, fios de tinta, saliências com montes de máscaras, luzes soltas, paredões, gotas e correntes com
máscaras, nos mesmos lugares), repintado com relevo: a rocha em lajes em pé, rachada, com a luz roxa
fria vindo da esquerda; a tinta como um fio grosso e brilhante correndo numa calha; máscaras de
porcelana com volume, olhos fundos, trincas e lascas; correntes de elos de ferro. As duas camadas
repetem nas duas direções.

  fosso-far  1536x1536  a parede do outro lado do abismo
  fosso-mid  1536x1536  os dois paredões que pingam e as correntes com máscaras

uso: python3 ecl_fosso.py <pasta_saida> [camada ...] [--preview=<pasta>] [--old=<pasta com os png em 2x>]
"""
import math
import numpy as np
from brush import hexc, mix, sstep
from poco3 import K, N, P, TAU, Tile, aa, band, cells, cracks, direct, gblur, grain, hash1, noise, normals, occlusion, plane, point, seg, up, wd
from poco_plano import plan
from ecl_comum import save, want, PREVIEW
from ecl_minas import view
from fundos_fosso import INK, PURPLE, MAGENTA, LILAC, ROCK0, ROCK1, ROCK2, ROCK3, PORC0, PORC1, PORC2

FULL = (slice(0, N), slice(0, N))


def slabs(rng, nx, ny, depth=3.0, groove=2.8):
    """Rocha em lajes em pé: células compridas na vertical com a borda torta, cada laje um pouco para
    fora ou para dentro e um pouco torta. As frestas em pé são fundas e somem e voltam ao longo da
    rocha; as deitadas (onde uma laje quebrou) são raras e rasas. Devolve (altura em px, tom de cada
    laje, a fresta 0..1)."""
    warp = ((noise(46, rng, 2) - 0.5) * 60.0, (noise(80, rng, 2) - 0.5) * 110.0)
    cid, d1, gap, dx, dy, lying = cells(rng, nx, ny, warp=warp)
    n = nx * ny
    off = rng.uniform(-1, 1, n).astype(np.float32)[cid]
    tone = (1.0 + rng.uniform(-0.09, 0.09, n)).astype(np.float32)[cid]
    tx = rng.uniform(-0.07, 0.07, n).astype(np.float32)[cid]
    ty = rng.uniform(-0.02, 0.02, n).astype(np.float32)[cid]
    fade = 0.12 + 0.88 * sstep(0.40, 0.66, noise(64, rng, 2))
    strength = (1 - 0.8 * sstep(0.35, 0.7, lying)) * fade
    # umas frestas são um risco fino, outras abrem
    crev = sstep(1.5 + 2.6 * noise(90, rng, 2), 0.4, gap) * strength
    # onde a fresta some, as duas lajes viram uma só (o degrau entre elas também some)
    seam = sstep(9.0, 0.0, gap) * (1 - strength)
    h = (off * depth + tx * dx + ty * dy) * (1 - 0.8 * seam) - groove * crev - 0.9 * sstep(7.0, 0.0, gap) * strength
    return h.astype(np.float32), 1 + (tone - 1) * (1 - seam), crev


def porcelain(u, v, d, rpx):
    """Uma máscara de porcelana vista de frente: u, v na elipse (-1..1), d = u² + v², rpx o raio em px da
    imagem. Devolve a cor (sem o escuro do fosso) com o volume, a sobrancelha, o nariz e o brilho da louça."""
    dome = np.sqrt(np.clip(1 - d, 0.02, 1))
    # o rosto: a aresta do nariz e a sobrancelha em relevo
    bump = 0.5 * np.exp(-(u / 0.16) ** 2) * sstep(-0.35, 0.05, v) * sstep(0.55, 0.2, v) + 0.35 * np.exp(-((v + 0.22) / 0.09) ** 2) * sstep(0.75, 0.3, np.abs(u))
    hgt = rpx * (0.62 * dome + 0.13 * bump)
    gy, gx = np.gradient(hgt)
    inv = 1.0 / np.sqrt(gx * gx + gy * gy + 1.0)
    ndl = np.clip((0.52 * gx + 0.60 * gy + 0.61) * inv, 0, 1)
    tone = mix(PORC0, PORC1, sstep(0.0, 0.5, ndl)[..., None])
    tone = mix(tone, PORC2, sstep(0.45, 0.92, ndl)[..., None])
    # o brilho da louça e a luz roxa que volta do fundo, na beira de baixo
    tone = mix(tone, PORC2 * 1.25, (sstep(0.93, 0.995, ndl) * 0.7)[..., None])
    tone = mix(tone, PURPLE * 0.9, (sstep(0.5, 1.0, d) * sstep(0.0, 0.7, u * 0.5 + v) * 0.35)[..., None])
    tone = mix(tone, PORC0 * 0.8, (sstep(0.72, 1.0, d) * 0.5)[..., None])
    return tone


def eyes(tone, u, v, ex=0.37, ey=-0.12, rx=0.22, ry=0.27, dark=ROCK0):
    """Os dois furos dos olhos: fundos, com a beira de baixo pegando luz."""
    for sgn in (-1, 1):
        e = ((u - sgn * ex) / rx) ** 2 + ((v - ey) / ry) ** 2
        tone = mix(tone, PORC2 * 1.05, (sstep(1.45, 1.1, e) * sstep(0.9, 1.1, e) * sstep(-0.05, 0.25, v - ey) * 0.5)[..., None])
        tone = mix(tone, dark, sstep(1.1, 0.8, e)[..., None])
    return tone


# ======================================================================================
def fosso_far(rng):
    Pl = plan('fosso-far')
    Y, X = plane()
    tex, big, fog = up(Pl['tex']), up(Pl['big']), up(Pl['fog'])
    hs, stone, crev = slabs(rng, 18, 6)
    ck = cracks(rng, 14, (140, 480), 1.5, 0.3)
    h = hs + (big - 0.5) * 14.0 + sstep(0.3, 0.8, tex) * 2.6 + (noise(12, rng, 2) - 0.5) * 3.0 + (noise(4, rng, 1) - 0.5) * 0.6 - 2.2 * ck
    col = mix(ROCK0, ROCK2, (0.25 + 0.6 * big)[..., None]) * (0.86 + 0.22 * tex)[..., None]
    # as faces de rocha em pé: lajes largas que saem da parede, a borda esquerda pega a luz roxa
    dep = rng.uniform(7.0, 13.0, len(Pl['bands']))
    t = Y / P * TAU
    for b, D in zip(Pl['bands'], dep):
        cx = b['x0'] + b['amp'] * np.sin(t * b['k'] + b['ph'])
        xr = wd(X - cx)
        a = np.clip((b['w'] / 2 - np.abs(xr)) / 6.0, 0, 1)
        a = a * a * (3 - 2 * a)
        face = mix(ROCK1, ROCK3, sstep(0.3, 0.8, tex)[..., None]) * b['tone']
        col = mix(col, face, (a * 0.55)[..., None])
        h = h + D * a
    crevs = np.maximum(crev, ck * 0.9)
    alb = col * (stone * (1 - 0.14 * crevs))[..., None]
    # os fios de tinta: uma calha na rocha
    falls = np.zeros((N, N), np.float32)
    rims = np.zeros((N, N), np.float32)
    fq = np.zeros((N, N), np.float32)
    wn = noise(70, rng, 2)
    for f in Pl['falls']:
        cx = f['x0'] + 3.0 * np.sin(t * f['k'] + f['ph'])
        xr = wd(X - cx)
        wdt = f['wd'] * (0.82 + 0.36 * wn)
        a = aa(wdt - np.abs(xr))
        fq = np.where(a > falls, xr / np.maximum(wdt, 0.5), fq)
        falls = np.maximum(falls, a)
        rims = np.maximum(rims, np.exp(-((np.abs(xr) - wdt) / 2.2) ** 2))
    h = h - 3.4 * gblur(falls, 2.0)
    h = gblur(h, 0.7)
    n = normals(h, 0.85)
    ao = occlusion(h, ((2.5, 0.55), (8, 0.3)), floor=0.4)
    key = direct(n, (-0.78, -0.30, 0.48))
    light = 0.44 * ao + 0.56 * key
    col = alb * light[..., None]
    col = mix(col, PURPLE * 0.5, np.clip((key - 1.0) * 0.30, 0, 0.45)[..., None])
    # a tinta: a beira roxa, o fio preto e o brilho lilás que corre nele
    col = mix(col, PURPLE * 0.8, (rims * 0.32 * (0.6 + 0.5 * np.clip(key, 0, 1.6)))[..., None])
    col = mix(col, INK, (falls * 0.95)[..., None])
    run = noise(46, rng, 2)
    sh = up(Pl['sheen'])
    streak = sstep(0.5, 0.15, np.abs(fq + 0.42)) * sstep(0.40, 0.56, run)
    col = mix(col, LILAC * 0.6, (falls * np.clip(0.22 * sstep(0.62, 0.8, sh) + 0.30 * streak, 0, 1))[..., None])

    tile = Tile(opaque=True)
    tile.col[:] = col
    # saliências com montes de máscaras quebradas (o que a prisão jogava aqui)
    for li, L in enumerate(Pl['ledges']):
        cx, y, w = L['cx'], L['y'], L['w']
        for rows, cols, yy, xx in tile.wins(cx - w / 2 - 30, y - 16, cx + w / 2 + 30, y + 44):
            # a sombra da saliência na parede embaixo
            und = sstep(34.0, 0.0, yy - (y + 10)) * (yy > y + 4) * band(xx, cx - w / 2 - 10, cx + w / 2 + 12, 9.0)
            tile.tint(rows, cols, np.zeros(3, np.float32), 0.5 * und)
            # a pedra: tampo em y + 2, por baixo ela afina torta para a parede
            q = np.clip((xx - (cx - w / 2 - 14)) / (w + 28), 0, 1)
            bot = y + 18 - 2 * q + 2.4 * np.sin(xx * 0.21 + li) + 1.6 * np.sin(xx * 0.53 + 2 * li)
            lft = cx - w / 2 - 14 + 24 * np.clip((yy - (y + 2)) / 16.0, 0, 1) ** 1.3
            rgt = cx + w / 2 + 14 - 20 * np.clip((yy - (y + 2)) / 14.0, 0, 1) ** 1.3
            d = np.minimum(np.minimum(yy - (y + 2), bot - yy), np.minimum(xx - lft, rgt - xx))
            a = aa(d)
            if not a.any():
                continue
            v = np.clip((yy - (y + 2)) / 16.0, 0, 1)
            tn = hash1(np.floor((xx + 5 * np.sin(yy * 0.4)) / 17.0) + li * 31, 3.0)
            st_ = mix(ROCK1 * 0.9, ROCK2 * 0.9, (0.25 + 0.5 * tn)[..., None]) * (1.0 - 0.62 * v)[..., None]
            st_ = st_ * (1 - 0.4 * sstep(1.0, 0.2, 8.5 - np.abs(((xx + 5 * np.sin(yy * 0.4)) / 17.0) % 1.0 - 0.5) * 17.0))[..., None]
            # o tampo pega a luz de cima; a quina da esquerda, a roxa
            st_ = mix(st_, ROCK3 * 1.1, (sstep(3.4, 0.4, yy - (y + 2)) * 0.62)[..., None])
            st_ = mix(st_, PURPLE * 0.55, (sstep(5.0, 0.0, xx - lft) * 0.4)[..., None])
            tile.over(rows, cols, st_, a)
        for (mx, my, rx, ry, ang) in L['pile']:
            k = float(hash1(int(mx * 7 + my * 13), 1.0))
            for rows, cols, yy, xx in tile.wins(mx - 9, my - 11, mx + 9, my + 11):
                dx, dy = xx - mx, yy - my
                c, s = math.cos(ang), math.sin(ang)
                u = (dx * c + dy * s) / rx
                v = (-dx * s + dy * c) / ry
                d = u * u + v * v
                a = aa((1 - np.sqrt(d)) * min(rx, ry))
                # metade delas está quebrada: falta um pedaço, cortado torto
                if k < 0.5:
                    ca, sa = math.cos(k * 40), math.sin(k * 40)
                    cut = u * ca + v * sa + 0.12 * np.sin((u * sa - v * ca) * 9 + k * 20)
                    a = a * aa((0.28 + 0.5 * k - cut) * min(rx, ry))
                if not a.any():
                    continue
                tone = eyes(porcelain(u, v, d, min(rx, ry) * K), u, v, 0.38, -0.15, 0.24, 0.30)
                tile.over(rows, cols, tone * 0.55, a * 0.94)
    col = tile.col
    # luzes lilás soltas no ar e a névoa roxa
    glow = np.zeros((N, N), np.float32)
    for (mx, my, r, kk) in Pl['motes']:
        dx, dy = wd(X - mx), wd(Y - my)
        d2 = dx * dx + dy * dy
        col = mix(col, PURPLE * 0.6, (np.exp(-d2 / (2 * (r * 6) ** 2)) * 0.12)[..., None])
        glow = np.maximum(glow, np.exp(-d2 / (2 * r * r)) * kk)
    col = mix(col, LILAC, (glow * 0.85)[..., None])
    col = mix(col, PURPLE * 0.32, (sstep(0.45, 0.85, fog) * 0.35)[..., None])
    tile.col[:] = grain(col * 0.78, rng, 0.03)
    return tile


# ======================================================================================
def fosso_mid(rng):
    Pl = plan('fosso-mid')
    Y, X = plane()
    tex, broad, crk = up(Pl['tex']), up(Pl['broad']), up(Pl['crack'])
    tile = Tile()
    t = Y / P * TAU
    # os dois paredões: a borda do desenho antigo, lascada
    edge = noise(14, rng, 2)
    hs, stone, crev = slabs(rng, 22, 7, depth=3.4)
    inside = np.full((N, N), -99.0, np.float32)
    prof = np.zeros((N, N), np.float32)
    side = np.zeros((N, N), np.float32)
    for wl in Pl['walls']:
        l = wl['x0'] - wl['w'] / 2 + 14 * np.sin(t * wl['k1'] + wl['p1']) + 5 * np.sin(t * wl['k2'] + wl['p2'])
        r = wl['x0'] + wl['w'] / 2 + 12 * np.sin(t * wl['k1'] + wl['p2']) + 6 * np.sin(t * wl['k2'] + wl['p1'])
        C, hw = (l + r) / 2, (r - l) / 2
        xr = wd(X - C)
        d = hw - np.abs(xr) - np.clip((edge - 0.5) * 6.0 + (1.0 - hs / 3.4) * 1.3, 0, 5)
        u = np.clip(xr / hw, -1, 1)
        take = d > inside
        inside = np.where(take, d, inside)
        prof = np.where(take, 24.0 * (1 - np.abs(u) ** 3.0) ** 0.7, prof)
        side = np.where(take, u, side)
    A = aa(inside)
    # rachaduras compridas em pé (as do desenho antigo) e as novas, miúdas
    cr = sstep(0.035, 0.0, np.abs(crk - 0.5)) * sstep(0.3, 0.7, broad)
    ck = cracks(rng, 12, (100, 360), 1.4, 0.3)
    h = prof + hs + (broad - 0.5) * 10.0 + (tex - 0.5) * 3.4 + (noise(11, rng, 2) - 0.5) * 2.8 + (noise(4, rng, 1) - 0.5) * 0.6 - 3.2 * cr - 2.0 * ck
    # a tinta escorrendo pela face: o campo antigo, fechado na emenda de cima com a de baixo
    st = Pl['st'].copy()
    pad = 90
    w_ = np.linspace(0, 1, pad, dtype=np.float32)[:, None] ** 2
    st[-pad:] = st[-pad:] * (1 - w_) + st[:1] * w_
    st = up(st)
    ink = sstep(0.6, 0.72, st) * A
    h = h * (1 - 0.55 * ink) + gblur(h, 3.0) * (0.55 * ink) + 1.2 * ink
    h = gblur(h, 0.7)
    n = normals(h, 0.9)
    ao = occlusion(h, ((2.5, 0.55), (8, 0.3)), floor=0.4)
    key = direct(n, (-0.82, -0.22, 0.44))
    alb = mix(ROCK0 * 1.3, ROCK2, sstep(0.25, 0.9, broad)[..., None]) * ((0.92 + 0.12 * tex) * stone * (1 - 0.16 * np.maximum(crev, ck * 0.9)))[..., None]
    alb = mix(alb, ROCK0 * 0.6, (cr * 0.7)[..., None])
    back = sstep(0.75, 0.98, side) * 0.10
    light = (0.40 * ao + 0.60 * key + back) * 0.80
    col = alb * light[..., None]
    # a luz roxa fria no que olha para a esquerda (e um fio dela em toda a borda esquerda) e o escuro do outro lado
    col = mix(col, PURPLE * 0.7, np.clip((key - 1.0) * 0.30 + sstep(6.0, 0.5, inside) * (side < 0) * 0.5, 0, 0.62)[..., None])
    col = mix(col, ROCK0, (sstep(0.30, 1.0, side) * 0.62)[..., None])
    # a tinta: preta, lisa, com a beira magenta e o brilho da luz roxa
    col = mix(col, INK, (ink * 0.85)[..., None])
    col = mix(col, MAGENTA * 0.5, (sstep(0.575, 0.6, st) * sstep(0.625, 0.6, st) * A * 0.42)[..., None])
    spec = np.clip((n[0] * -0.55 + n[1] * -0.25 + n[2] * 0.80), 0, 1) ** 26
    col = mix(col, LILAC * 0.7, np.clip(ink * spec * 0.5, 0, 0.2)[..., None])
    tile.over(*FULL, col, A)
    # gotas soltando das bordas dos paredões: o fio afina e a gota engorda na ponta
    for (x, y, sd, L, wdt) in Pl['drips']:
        for rows, cols, yy, xx in tile.wins(x - 8, y - 4, x + 8, y + L + 10):
            pts = [(x, y), (x + sd * 1.5, y + L * 0.6), (x + sd * 0.5, y + L)]
            d1, t1 = seg(yy, xx, *pts[0], *pts[1])
            d2, t2 = seg(yy, xx, *pts[1], *pts[2])
            along = np.where(d1 < d2, t1 * 0.6, 0.6 + t2 * 0.4)
            a = aa(wdt / 2 * (1.05 - 0.55 * along) - np.minimum(d1, d2))
            gx, gy = x + sd * 0.5, y + L + 2.5
            drop = aa(1.0 - np.hypot((xx - gx) / 2.5, (yy - gy) / 3.3 + 0.25 * np.clip((gy - yy) / 3.3, 0, 1) ** 2) , 0.4)
            a = np.maximum(a, drop)
            c = np.zeros(a.shape + (3,), np.float32) + INK
            c = mix(c, LILAC * 0.6, (aa(0.6 - np.hypot(xx - gx + 0.9, yy - gy + 0.8)) * 0.4)[..., None])
            c = mix(c, MAGENTA * 0.5, (sstep(0.5, 0.0, wdt / 2 * (1.05 - 0.55 * along) - d1) * (d1 < d2) * (xx < x + sd * 0.8) * 0.3)[..., None])
            tile.over(rows, cols, c, a * 0.97)
    # correntes que descem o poço inteiro, com máscaras presas como troféus
    iron = hexc(0x0b0910)
    pitch = P / 142.0
    for ci, ch in enumerate(Pl['chains']):
        x = ch['x']
        for rows, cols, yy, xx in tile.wins(x - 5, 0, x + 5, P):
            dx = xx - x
            # elo de lado (uma barra fina, atrás) e elo de frente (um anel oval), um engatado no outro
            lyo = yy + 6 - pitch - np.round((yy + 6 - pitch) / (2 * pitch)) * 2 * pitch
            bar = aa((1 - np.hypot(dx / 1.5, lyo / 4.6)) * 1.5)
            c = iron[None, None, :] * (0.8 + 1.3 * sstep(1.0, -1.0, dx))[..., None]
            tile.over(rows, cols, mix(c, PURPLE * 0.8, (sstep(0.4, -1.2, dx) * 0.14)[..., None]), bar * 0.96)
            lye = yy + 6 - np.round((yy + 6) / (2 * pitch)) * 2 * pitch
            ring = aa((1 - np.hypot(dx / 3.1, lye / 4.2)) * 3.1) * aa((np.hypot(dx / 1.0, lye / 2.2) - 1) * 1.0)
            lit = sstep(0.35, -0.9, dx / 3.1 + lye / 10.0)
            c = iron[None, None, :] * (0.8 + 1.6 * lit)[..., None]
            tile.over(rows, cols, mix(c, PURPLE * 0.8, (lit * 0.18)[..., None]), ring * 0.96)
        for mi, (mx, my, ang) in enumerate(ch['masks']):
            k = float(hash1(ci * 17 + mi * 5 + 3, 2.0))
            rx, ry = 9.0, 12.0
            for rows, cols, yy, xx in tile.wins(mx - 14, my - 22, mx + 14, my + 16):
                dx, dy = xx - mx, yy - my
                c_, s_ = math.cos(ang), math.sin(ang)
                u = (dx * c_ + dy * s_) / rx
                v = (-dx * s_ + dy * c_) / ry
                d = u * u + v * v
                # os dois cordões que amarram a máscara na corrente
                for sg in (-1, 1):
                    tu, tv = sg * 0.84 * rx, -0.18 * ry
                    dd, _t = seg(yy, xx, mx + tu * c_ - tv * s_, my + tu * s_ + tv * c_, x, my - 19)
                    tile.over(rows, cols, iron * 1.7, aa(0.55 - dd) * 0.9)
                a = aa((1 - np.sqrt(d)) * rx)
                if k < 0.45:
                    cut = u * math.cos(k * 50) * 0.6 + v + 0.1 * np.sin(u * 8 + k * 30)
                    a = a * aa((0.55 + 0.5 * k - cut) * rx)
                tone = porcelain(u, v, d, rx * K)
                # a rachadura de cada uma
                crack = sstep(0.07, 0.01, np.abs(u - 0.15 * np.sin(v * 6) - 0.1)) * (v > -0.6)
                tone = mix(tone, ROCK0, (crack * 0.85)[..., None])
                tone = mix(tone, PORC2, (sstep(0.14, 0.08, np.abs(u - 0.15 * np.sin(v * 6) - 0.1 + 0.09)) * (v > -0.6) * 0.25)[..., None])
                tone = eyes(tone, u, v, 0.36, -0.12, 0.215, 0.27)
                # os furos do cordão nas têmporas
                for sg in (-1, 1):
                    tone = mix(tone, ROCK0, aa((0.075 - np.hypot(u - sg * 0.84, v + 0.18)) * rx)[..., None])
                tile.over(rows, cols, tone * 0.7, a)
    tile.col[:] = grain(tile.col * 0.72, rng, 0.03)
    return tile


if __name__ == '__main__':
    if want('fosso-far'):
        save(fosso_far(np.random.default_rng(1091)), 'fosso-far')
    if want('fosso-mid'):
        save(fosso_mid(np.random.default_rng(1092)), 'fosso-mid')
    if PREVIEW:
        view(PREVIEW, 'fosso', [('fosso-far', 0.12, 0.1), ('fosso-mid', 0.34, 0.3)], (8, 7, 11))

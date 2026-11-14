"""Fundos das Minas Abandonadas para o ECLIPSE (3 px da imagem por px do mundo).

O mesmo desenho do traço liso (fundos_minas.py, lido pelo plano de poco_plano.py: as mesmas camadas de
rocha, torres, passarelas, escoras, balde, polia e cachos de cristal, nos mesmos lugares), repintado com
relevo: a rocha em leitos que saem e entram na parede, partidos em blocos por juntas em pé, com a luz
fria de cima e o brilho do Âmbar por baixo; madeira com veio, topo cortado e cavilhas; cristais com
faces. As duas camadas repetem nas duas direções.

  mine-far  1536x1536  a parede do outro lado da caverna
  mine-mid  1536x1536  os pilares de rocha com as escoras, o balde, a polia e os cristais

uso: python3 ecl_minas.py <pasta_saida> [camada ...] [--preview=<pasta>] [--old=<pasta com os png em 2x>]
"""
import math
import os
import numpy as np
from PIL import Image
from brush import hexc, mix, sstep
from poco3 import K, N, P, TAU, Tile, aa, band, cells, cracks, direct, gblur, grain, hash1, noise, normals, occlusion, periodic, plane, point, seg, up, wd
from poco_plano import plan
from ecl_comum import save, want, PREVIEW, OLD, OUT
from fundos_minas import ROCK0, ROCK1, ROCK2, ROCK3, WOOD0, WOOD1, WOOD2, AMBER_D, AMBER, AMBER_L, HAZE


def beds(st, Y, n30, period=None, nbands=16):
    """As camadas da rocha na malha do 3x. Cada faixa do plano tem cinco leitos finos (as listras do
    desenho antigo), tortos pelo mesmo ruído: devolve (fase 0..1 dentro da faixa, número da faixa, número
    do leito contado no poço inteiro, fase dentro do leito, grossura do leito em unidades do plano)."""
    period = period or st['period']
    q = (Y + up(st['warp'])) / period
    ph = q % 1.0
    bi = np.floor(q).astype(np.int64)
    fl = ph * 5 + n30 * (4 / TAU)
    li = np.floor(fl)
    G = (bi * 5 + li.astype(np.int64)) % (nbands * 5)
    return ph, bi, G, (fl - li).astype(np.float32), period / 5.0


def per_bed(vals, G, dlo, dhi):
    """Um valor por leito, com a passagem de um leito para o outro sem serrilhado."""
    n = len(vals)
    v = np.asarray(vals, np.float32)
    wlo = np.clip(0.5 - dlo * K, 0, 0.5)
    whi = np.clip(0.5 - dhi * K, 0, 0.5)
    return v[G % n] * (1 - wlo - whi) + v[(G - 1) % n] * wlo + v[(G + 1) % n] * whi


def rock_relief(rng, X, G, lf, thick, wob, nG, massive, blocks=(5, 14), depth=6.0):
    """A altura da rocha em leitos (px da imagem) e o tom de cada bloco. As lâminas se juntam em leitos
    de grossuras diferentes (de uma a quatro lâminas); leitos duros saem da parede, os moles entram;
    cada leito é partido em blocos compridos por juntas em pé, tortas, umas abertas e outras fechadas
    (quase nenhuma onde a rocha é maciça); cada bloco um pouco torto; entre leitos, uma fresta."""
    bed = np.zeros(nG, np.int64)
    first = np.zeros(nG, bool)
    pos = np.zeros(nG, np.float32)
    size = np.ones(nG, np.float32)
    i = nb_ = 0
    while i < nG:
        k = min(int(rng.choice([1, 1, 2, 2, 3, 3, 4])), nG - i)
        bed[i:i + k] = nb_
        first[i] = True
        pos[i:i + k] = np.arange(k)
        size[i:i + k] = k
        i += k
        nb_ += 1
    dep = rng.uniform(0, 1, nb_).astype(np.float32)[bed]
    nb = rng.integers(blocks[0], blocks[1], nb_)[bed]
    offs = rng.uniform(0, 1, nb_)[bed]
    lean = rng.uniform(-0.6, 0.6, nb_).astype(np.float32)[bed]
    open_ = (0.5 + 0.5 * rng.uniform(0, 1, nG)).astype(np.float32)
    g = G % nG
    dlo, dhi = lf * thick, (1 - lf) * thick
    h = per_bed(dep, G, dlo, dhi) * depth
    v = (pos[g] + lf) / size[g]
    xj = X + (wob - 0.5) * 26 + (v - 0.5) * size[g] * thick * lean[g]
    u = xj / P * nb[g] + offs[g]
    fu = np.floor(u)
    f = (u - fu).astype(np.float32)
    cell = fu.astype(np.int64) % nb[g]
    blen = (P / nb[g]).astype(np.float32)
    dj = np.minimum(f, 1 - f) * blen
    key = bed[g] * 53 + cell
    jkey = bed[g] * 53 + (cell + (f >= 0.5)) % nb[g]
    jd = sstep(0.3, 0.8, hash1(jkey, 1.0)) * (1 - 0.8 * massive)
    h = h + (hash1(key, 2.0) - 0.5) * 2.4 * (1 - 0.6 * massive)
    # cada bloco um pouco torto (a face pega a luz de um jeito diferente do vizinho)
    h = h + ((hash1(key, 3.0) - 0.5) * 0.07 * (f - 0.5) * blen * K + (hash1(key, 4.0) - 0.5) * 0.14 * (v - 0.5) * size[g] * thick * K) * (1 - 0.6 * massive)
    groove = sstep(1.2, 0.2, dj) * jd
    # a fresta entre leitos (em cima da primeira lâmina de cada leito) e o risco fino entre lâminas
    top = np.where(first[g], open_[g], 0.0)
    bot = np.where(first[(g + 1) % nG], open_[(g + 1) % nG], 0.0)
    part = np.maximum(sstep(1.1, 0.15, dlo) * top, sstep(1.1, 0.15, dhi) * bot)
    hair = np.maximum(sstep(0.8, 0.1, dlo) * (1 - first[g]), sstep(0.8, 0.1, dhi) * (1 - first[(g + 1) % nG]))
    h = h - 2.6 * groove - 2.2 * part - 0.7 * hair
    # quina gasta de cada bloco
    edge = np.minimum(np.where(jd > 0.3, dj, 99.0), np.minimum(np.where(top > 0, dlo, 99.0), np.where(bot > 0, dhi, 99.0)))
    h = h - 1.0 * sstep(2.6, 0.0, edge)
    tone = 1.0 + (hash1(key, 5.0) - 0.5) * 0.16 * (1 - 0.5 * massive)
    return h.astype(np.float32), tone.astype(np.float32), np.maximum(groove, part), hair


# ======================================================================================
def mine_far(rng):
    Pl = plan('mine-far')
    Y, X = plane()
    tex, big, sn, fog = up(Pl['tex']), up(Pl['big']), up(Pl['sn']), up(Pl['fog'])
    st = Pl['strata']
    period = st['period']
    n30 = up(st['n30'])
    ph, bi, G, lf, thick = beds(st, Y, n30)
    tone = per_bed(st['tones'], bi, ph * period, (1 - ph) * period)
    massive = sstep(0.42, 0.72, big)
    h, btone, crev, hair = rock_relief(rng, X, G, lf, thick, n30, 80, massive)
    r1, r2 = noise(11, rng, 2), noise(3.2, rng, 1)
    # trincas compridas que cortam os leitos
    ck = cracks(rng, 11)
    h -= 2.4 * ck
    crev = np.maximum(crev, ck * 0.9)
    # a parede não é plana: barrigas largas, o grão da pedra e o miúdo
    h += (big - 0.5) * 16.0 + (tex - 0.5) * 5.0 + (r1 - 0.5) * 2.6 + (r2 - 0.5) * 1.0
    # os veios de Âmbar: uma fresta no meio do leito, cheia de cristal
    has = Pl['has'][bi % 16]
    vd = np.abs(ph - 0.5) * 64
    segm = sstep(0.6, 0.74, sn) * has
    width = 0.5 + 1.3 * sstep(0.6, 0.85, sn)
    h -= 2.2 * sstep(width + 1.6, width * 0.4, vd) * segm
    h = gblur(h, 0.7)

    base = mix(ROCK0, ROCK2, (0.2 + 0.6 * big)[..., None])
    stripe = 0.5 - 0.5 * np.cos(lf * TAU)
    alb = base * (tone * btone * (0.93 + 0.10 * stripe) * (0.93 + 0.14 * tex) * (1 - 0.20 * crev) * (1 - 0.08 * hair))[..., None]
    n = normals(h, 0.85)
    ao = occlusion(h, ((2.5, 0.55), (8, 0.3)), floor=0.4)
    key = direct(n, (-0.3, -0.85, 0.42))
    fill = direct(n, (0.2, 0.8, 0.6))
    cool = np.array([0.875, 1.0125, 1.1375], np.float32)
    warm = np.array([1.5, 0.95, 0.45], np.float32)
    light = (0.34 * ao + 0.46 * key)[..., None] * cool + (0.20 * fill * (0.5 + 0.5 * ao))[..., None] * warm
    # os lampiões das passarelas acendem a rocha em volta
    lamps = Pl['lamps']
    lamp = np.zeros((N, N), np.float32)
    for (lx, ly, _k) in lamps:
        lamp += point(n, Y, X, lx, ly, 16.0, 34.0)
    light += (lamp * 2.1)[..., None] * np.array([1.0, 0.62, 0.24], np.float32)
    col = alb * light * 1.05
    # o veio: a luz dele na rocha de cima e de baixo, e o cristal na fresta
    s = np.sign(0.5 - ph)
    face = np.clip((n[1] * s + n[2] * 0.5) / 1.118, 0, None) / 0.447
    glow = np.exp(-vd / 6) * segm
    col = mix(col, AMBER_D * 0.8, np.clip(glow * 0.25 * (0.35 + 0.75 * face), 0, 0.7)[..., None])
    sp = noise(5, rng, 1)
    vein = sstep(width, width * 0.3, vd) * segm
    col = mix(col, AMBER * 0.85, (vein * np.clip(0.34 + 0.6 * sp, 0, 1))[..., None])
    col = mix(col, AMBER_L * 0.9, (vein * sstep(0.62, 0.8, noise(2.6, rng, 1)) * 0.6)[..., None])

    # torres de madeira ao longe (sobem o poço inteiro), com X entre as travessas
    sil = np.zeros((N, N), np.float32)
    shade = np.ones((N, N), np.float32)
    for tw in Pl['towers']:
        x0, w, step, off = tw['x0'], tw['w'], tw['step'], tw['off']
        xl = wd(X - (x0 + w / 2)) + w / 2
        v = ((Y - off) / step) % 1.0
        dvy = np.minimum(v, 1 - v) * step
        sy = np.where(v < 0.5, v, v - 1) * step          # abaixo (+) ou acima (-) da travessa
        inside = band(xl, 0, w)
        c = step / math.hypot(w, step)
        b1 = aa(1.6 - np.abs(xl - w * v) * c) * inside
        b2 = aa(1.6 - np.abs(xl - w * (1 - v)) * c) * inside
        # esteios roliços, mais grossos onde a travessa amarra
        pw = 4.0 + 0.9 * sstep(7.0, 3.0, dvy)
        dl, dr = np.abs(xl), np.abs(xl - w)
        post = np.maximum(aa(pw - dl), aa(pw - dr))
        plat = aa(3.0 - np.abs(sy)) * band(xl, -10, w + 10)
        # as pontas das vigotas embaixo do tabuado e as tábuas desencontradas na ponta
        jo = band(sy, 3.0, 5.6) * band(xl, -8, w + 8) * (((xl + 3) / 13.0) % 1.0 < 0.3)
        tip = aa(3.0 - np.abs(sy + 1.6)) * np.maximum(band(xl, -12.5, -10), band(xl, w + 10, w + 13))
        one = np.maximum.reduce([b1, b2, post, plat, jo, tip * 0.9])
        sil = np.maximum(sil, one)
        # o roliço: mais claro no meio do esteio
        u = np.minimum(dl, dr) / pw
        shade = np.where(post > 0.3, 0.8 + 0.5 * np.sqrt(np.clip(1 - u * u, 0, 1)), shade)
    tile = Tile(opaque=True)
    tile.col[:] = col
    tile.a[:] = 1
    # passarelas de uma torre até a outra: tabuado, corrimão, corda no meio e lampiões pendurados embaixo
    wsil = np.zeros((N, N), np.float32)
    for wk in Pl['walks']:
        x1, x2, py, posts = wk['x1'], wk['x2'], wk['py'], wk['posts']
        for rows, cols, yy, xx in tile.wins(x1 - 2, py - 42, x2 + 2, py + 28):
            inx = band(xx, x1, x2)
            a = aa(3.5 - np.abs(yy - (py + 0.5))) * inx                               # o tabuado
            a = np.maximum(a, band(yy, py + 4, py + 6.4) * inx * (((xx - x1) / 23.0) % 1.0 < 0.2))   # vigotas
            a = np.maximum(a, aa(1.5 - np.abs(yy - (py - 36.5))) * inx)               # corrimão
            span = (x2 - x1) / posts
            fx = ((xx - x1) / span) % 1.0
            dpx = np.minimum(fx, 1 - fx) * span
            a = np.maximum(a, aa(1.25 - dpx) * band(yy, py - 37, py) * inx)           # balaústres
            sag = py - 19 + 2.4 * (1 - (2 * fx - 1) ** 2)
            a = np.maximum(a, aa(0.55 - np.abs(yy - sag)) * inx)                      # a corda do meio
            for k in (1, 3):
                px = x1 + (x2 - x1) * k / 4
                dxl = np.abs(xx - px)
                a = np.maximum(a, aa(0.6 - dxl) * band(yy, py + 4, py + 14.5))        # a corrente do lampião
                cap = aa(3.6 - dxl - (py + 16.6 - yy) * 1.15) * band(yy, py + 13.6, py + 16.6)
                frame = np.maximum(aa(0.45 - np.abs(dxl - 2.3)), aa(0.5 - np.abs(yy - 23.9 - py))) * band(yy, py + 16, py + 24.4) * aa(2.8 - dxl)
                a = np.maximum(a, np.maximum(cap, frame))
            wsil[rows, cols] = np.maximum(wsil[rows, cols], a)
    sil = np.maximum(sil, wsil)
    # a sombra da madeira na parede atrás (a luz vem de cima e da esquerda) e a madeira
    sh = np.roll(np.roll(gblur(sil, 4.5), 7, axis=0), 5, axis=1)
    tile.col[:] *= (1 - 0.42 * np.clip(sh * 1.5, 0, 1) * (1 - sil))[..., None]
    wood = WOOD0 * shade[..., None]
    tile.col[:] = mix(tile.col, wood, (sil * 0.92)[..., None])
    # a luz dos lampiões na beira da madeira que olha para eles
    sb = gblur(sil, 1.5)
    gx = (np.roll(sb, -1, 1) - np.roll(sb, 1, 1)) * 0.5
    gy = (np.roll(sb, -1, 0) - np.roll(sb, 1, 0)) * 0.5
    rim = np.zeros((N, N), np.float32)
    halo = np.zeros((N, N), np.float32)
    core = np.zeros((N, N), np.float32)
    for (lx, ly, _k) in lamps:
        dx, dy = -wd(X - lx), -wd(Y - ly)
        d2 = dx * dx + dy * dy
        inv = 1.0 / np.sqrt(d2 + 1.0)
        rim += np.clip(-(gx * dx + gy * dy) * inv, 0, None) / (1.0 + d2 / (26.0 * 26.0)) ** 2
        halo = np.maximum(halo, np.exp(-d2 / (2 * 16.0 * 16.0)))
        # a chama dentro do vidro (o vidro tem 4 de largura por 6 de altura)
        g = np.exp(-(dx * dx / (2 * 1.5 * 1.5) + (dy + 0.4) ** 2 / (2 * 2.3 * 2.3)))
        core = np.maximum(core, g * band(np.abs(dx), -1, 2.1, 1.4) * band(-dy, -3.6, 3.6, 1.4))
    col = tile.col
    col += (rim * sil * 2.6)[..., None] * AMBER * 0.5
    col = mix(col, AMBER * 0.6, (halo * 0.19)[..., None])
    col = mix(col, AMBER, np.clip(core * 1.6, 0, 1)[..., None])
    col = mix(col, AMBER_L, np.clip(core * 1.6 - 0.45, 0, 1)[..., None])
    # a névoa quente no ar
    col = mix(col, HAZE, (sstep(0.4, 0.85, fog) * 0.35)[..., None])
    col = col * 0.78
    tile.col[:] = grain(col, rng, 0.03)
    return tile


# ======================================================================================
def mine_mid(rng):
    Pl = plan('mine-mid')
    Y, X = plane()
    tex = up(Pl['tex'])
    tile = Tile()
    st = Pl['strata']
    n30 = up(st['n30'])
    # 23 faixas fecham certinho na altura da camada (o desenho antigo usava 44.8 e deixava um degrau na emenda)
    period = P / 23.0
    ph, bi, G, lf, thick = beds(st, Y, n30, period, 23)
    tones = np.asarray([st['tones'][i % 16] for i in range(23)], np.float32)
    tone = per_bed(tones, bi, ph * period, (1 - ph) * period)
    wob = noise(40, rng, 2)
    hb, btone, crev, hair = rock_relief(rng, X, G, lf, thick, wob, 115, np.zeros((N, N), np.float32), blocks=(7, 18), depth=7.0)
    ck = cracks(rng, 16, (120, 420), 1.5, 0.35)
    r1, r2 = noise(10, rng, 2), noise(3.0, rng, 1)
    # os pilares de rocha: a borda do desenho antigo, agora fechando na emenda, com os blocos dos leitos
    # entrando e saindo no contorno
    edge = noise(16, rng, 2)
    inside = np.full((N, N), -99.0, np.float32)
    prof = np.zeros((N, N), np.float32)
    side = np.zeros((N, N), np.float32)
    t = Y / P
    for pl in Pl['pillars']:
        L = periodic([p[0] for p in pl['left']][:12], t)
        R = periodic([p[0] for p in pl['right']][:12], t)
        C, hw = (L + R) / 2, (R - L) / 2
        xr = wd(X - C)
        notch = (7.0 - hb) * 0.55 + (edge - 0.5) * 5.0
        d = hw - np.abs(xr) - np.clip(notch, 0, 6)
        u = np.clip(xr / hw, -1, 1)
        pr = 26.0 * (1 - np.abs(u) ** 3.2) ** 0.7
        take = d > inside
        inside = np.where(take, d, inside)
        prof = np.where(take, pr, prof)
        side = np.where(take, u, side)
    pa = aa(inside)
    h = prof + hb - 2.4 * ck + (r1 - 0.5) * 3.0 + (r2 - 0.5) * 1.1 + (tex - 0.5) * 4.0
    h = gblur(h, 0.7)
    n = normals(h, 0.9)
    ao = occlusion(h, ((2.5, 0.55), (8, 0.3)), floor=0.4)
    stripe = 0.5 - 0.5 * np.cos(lf * TAU)
    alb = mix(ROCK1, ROCK3, (0.3 + 0.5 * tex)[..., None]) * (tone * btone * (0.93 + 0.10 * stripe) * (1 - 0.22 * np.maximum(crev, ck * 0.9)) * (1 - 0.08 * hair))[..., None]
    key = direct(n, (-0.80, -0.25, 0.42))
    top = direct(n, (0.1, -0.8, 0.5))
    cold = np.array([0.88, 0.97, 1.10], np.float32)
    warm = np.array([1.18, 0.98, 0.78], np.float32)
    # a luz quente vem da esquerda; do outro lado, só o ar frio do poço e um fio de luz na beira
    back = sstep(0.72, 0.98, side) * 0.16
    light = (0.36 * ao + 0.20 * top + back)[..., None] * cold + (0.44 * key)[..., None] * warm
    # os cachos de cristal acendem a rocha em volta
    cl = np.zeros((N, N), np.float32)
    halo = np.zeros((N, N), np.float32)
    for c in Pl['clusters']:
        cl += point(n, Y, X, c['x'], c['y'] - 10, 16.0, 38.0)
        dx, dy = wd(X - c['x']), wd(Y - (c['y'] - 10))
        halo = np.maximum(halo, np.exp(-(dx * dx + dy * dy) / (2 * 40.0 * 40.0)))
    light += (cl * 1.5)[..., None] * np.array([1.0, 0.62, 0.22], np.float32)
    rock = alb * light * 1.10
    full = (slice(0, N), slice(0, N))
    tile.over(*full, rock, pa)

    # ---------------------------------------------------------------- madeira
    T1, T2 = noise(3.0, rng, 1), noise(2.2, rng, 1)

    def fibre(s, c, T=T1, stretch=16.0):
        a = s * K / stretch
        i = np.floor(a).astype(np.int64)
        f = (a - i).astype(np.float32)
        j = np.round(c * K).astype(np.int64) % N
        return T[i % N, j] * (1 - f) + T[(i + 1) % N, j] * f

    def timber(s, c, half, seed, lit=-1, knots=()):
        """A cor de uma peça de madeira falquejada: s ao longo do veio, c atravessado (-half..half);
        lit: o lado que pega a luz quente (-1: c negativo)."""
        fb = fibre(s + seed * 37.0, c + seed * 91.0)
        ckk = sstep(0.80, 0.92, fibre(s + seed * 11.0, c + seed * 53.0, T2, 70.0))
        col = mix(WOOD1, WOOD2, np.clip(0.10 + 0.78 * fb, 0, 1)[..., None])
        col = col * ((1 - 0.5 * ckk) * (0.97 + 0.04 * np.sin(s * TAU / 9.0 + fb * 5)))[..., None]
        for (ks, kc) in knots:
            r2_ = ((s - ks) / 5.5) ** 2 + ((c - kc) / 2.8) ** 2
            col = col * (1 - 0.55 * sstep(1.0, 0.3, r2_) + 0.16 * sstep(2.6, 1.4, r2_) * sstep(0.8, 1.4, r2_))[..., None]
        e = c * lit
        hw_ = min(4.4, half * 0.62)
        hi = sstep(half - hw_, half - hw_ * 0.43, e)
        col = mix(col, AMBER_D * 1.1, (hi * 0.62)[..., None])
        col = mix(col, AMBER * 0.62, (sstep(half - 1.0, half - 0.2, e) * 0.5)[..., None])
        col = col * (1 - 0.42 * sstep(half - 3.6, half, -e))[..., None]
        return col

    iron = np.array([0.040, 0.036, 0.034], np.float32)
    seed = 0
    # mãos-francesas (atrás dos esteios e das vigas)
    for (x0, span, top_) in Pl['beams']:
        for x, sg in ((x0, 1), (x0 + span, -1)):
            ax, ay, bx, by = x + sg * 8, top_ + 70, x + sg * 62, top_ + 2
            Ln = math.hypot(bx - ax, by - ay)
            ux, uy = (bx - ax) / Ln, (by - ay) / Ln
            seed += 1
            for rows, cols, yy, xx in tile.wins(min(ax, bx) - 8, by - 8, max(ax, bx) + 8, ay + 8):
                s_ = (xx - ax) * ux + (yy - ay) * uy
                c_ = -(xx - ax) * uy + (yy - ay) * ux
                a_ = aa(4.5 - np.abs(c_)) * band(s_, -7, Ln + 7)
                tile.over(rows, cols, timber(s_, c_, 4.5, seed, lit=-1 if sg > 0 else 1), a_)
    # esteios: sobem o poço inteiro
    for fr in Pl['frames']:
        for x in (fr['x0'], fr['x0'] + fr['span']):
            seed += 1
            c_ = wd(X - x)
            a_ = aa(10 - np.abs(c_))
            kn = [(rng.uniform(0, P), rng.uniform(-5, 5)) for _ in range(5)]
            kn = [(ks + o, kc) for ks, kc in kn for o in (-P, 0, P)]
            # a sombra do esteio na rocha do lado direito
            tile.tint(*full, np.zeros(3, np.float32), 0.34 * band(c_, 9, 19, 6.0) * (1 - a_))
            tile.over(*full, timber(Y, c_, 10, seed, knots=kn), a_)
    # o balde pendurado numa viga: corda torcida, alça e aduelas com dois arcos de ferro
    b = Pl['bucket']

    def rope(x, y0, y1, w=1.1):
        for rows, cols, yy, xx in tile.wins(x - 3, y0, x + 3, y1):
            a_ = aa(w - np.abs(xx - x)) * band(yy, y0, y1)
            tw = 0.5 + 0.5 * np.sin((yy * 1.5 + (xx - x) * 2.4))
            col = mix(WOOD1 * 1.1, WOOD2 * 1.5, tw[..., None]) * (1 - 0.35 * sstep(0.2, w, xx - x))[..., None]
            tile.over(rows, cols, col, a_)

    def bucket(bx, by, wt, wb, hgt, sd):
        """Balde: boca em by (meia largura wt), fundo em by + hgt (meia largura wb)."""
        for rows, cols, yy, xx in tile.wins(bx - wt - 3, by - 13, bx + wt + 3, by + hgt + 2):
            v = (yy - by) / hgt
            hwid = wt + (wb - wt) * np.clip(v, 0, 1)
            body = aa(hwid - np.abs(xx - bx)) * band(yy, by, by + hgt)
            q = (xx - bx) / np.maximum(hwid, 1e-3)
            stave = np.abs(((q * 3.0 + 0.5) % 1.0) - 0.5) * hwid / 3.0          # distância até a fresta entre aduelas
            col = timber(yy, (xx - bx), wt, sd, lit=-1)
            col = col * (1 - 0.45 * sstep(0.9, 0.2, stave))[..., None]
            col = col * (0.74 + 0.36 * np.sqrt(np.clip(1 - (q + 0.25) ** 2, 0, 1)))[..., None]     # redondo
            hoop = np.maximum(band(v, 0.20, 0.33), band(v, 0.70, 0.83))
            col = mix(col, iron * (1.0 + 2.2 * sstep(0.2, -0.7, q))[..., None], hoop[..., None])
            col = mix(col, AMBER_D * 1.1, (band(yy, by, by + 2.6) * 0.6)[..., None])
            tile.over(rows, cols, col, body)
            # a alça de ferro: um arco da beira até a corda
            ry_ = 11.0
            dd = np.abs(np.hypot((xx - bx) / (wt - 1.0), (yy - by) / ry_) - 1.0) * ry_
            tile.over(rows, cols, iron * 1.4, aa(0.75 - dd) * (yy < by + 0.5))

    rope(b['bx'], b['top'] + 2, b['by'] - 10.5)
    bucket(b['bx'], b['by'], 16, 12, 26, 31)
    # a polia: roda de madeira com aro, seis raios, cubo de ferro; a corda passa por cima, desce de um
    # lado até o balde de baixo e do outro até o contrapeso
    pu = Pl['pulley']
    cx, cy, r, ry = pu['cx'], pu['cy'], pu['r'], pu['ry']
    rope(cx - r, cy, ry - 9.5)
    rope(cx + r, cy, cy + 120)
    for rows, cols, yy, xx in tile.wins(cx - r - 3, cy - r - 3, cx + r + 3, cy + r + 3):
        dx, dy = xx - cx, yy - cy
        rad = np.hypot(dx, dy)
        ang = np.arctan2(dy, dx)
        # a corda por cima da roda
        tile.over(rows, cols, mix(WOOD1 * 1.1, WOOD2 * 1.5, (0.5 + 0.5 * np.sin(ang * 60))[..., None]), aa(1.2 - np.abs(rad - r)) * (dy < 0.5))
        # raios
        k6 = np.round(ang / (math.pi / 3))
        da = ang - k6 * (math.pi / 3)
        sc = rad * np.sin(da)
        sp = aa(2.5 - np.abs(sc)) * band(rad, 6, r - 5)
        tile.over(rows, cols, timber(rad * np.cos(da), sc, 2.5, 40 + 0, lit=-1) * 0.92, sp)
        # o aro (pinas de madeira emendadas entre os raios) e a cinta de ferro por fora
        rim = band(rad, r - 9, r)
        seam = sstep(0.022, 0.006, np.abs(((ang / (math.pi / 3) + 0.5) % 1.0) - 0.5))
        lit_ = np.clip((-dx * 0.75 - dy * 0.66) / np.maximum(rad, 1e-3), -1, 1)
        col = timber(ang * r, rad - (r - 4.5), 4.5, 47, lit=1)
        col = col * ((1 - 0.5 * seam) * (0.86 + 0.22 * lit_))[..., None]
        col = mix(col, iron * 1.2, band(rad, r - 1.7, r)[..., None])
        col = mix(col, AMBER_D * 1.1, (band(rad, r - 1.7, r) * sstep(0.3, 0.9, lit_) * 0.55)[..., None])
        tile.over(rows, cols, col, rim)
        # o cubo: madeira, cinta de ferro e o pino do eixo
        hubc = timber(dx, dy, 10, 49) * (0.8 + 0.3 * sstep(8, 0, np.hypot(dx + 2.5, dy + 2.5)))[..., None]
        hubc = mix(hubc, iron * 1.2, band(rad, 6.6, 9.4)[..., None])
        hubc = mix(hubc, iron * 3.2, (aa(2.6 - rad))[..., None])
        hubc = mix(hubc, AMBER_D * 1.3, (aa(1.0 - np.hypot(dx + 0.8, dy + 0.8)) * 0.8)[..., None])
        tile.over(rows, cols, hubc, aa(10 - rad))
    # o suporte de ferro que desce da viga e segura o eixo
    for rows, cols, yy, xx in tile.wins(cx - 6, pu['top'] + 2, cx + 6, cy + 6):
        a_ = np.maximum(aa(3.2 - np.abs(xx - cx)) * band(yy, pu['top'] + 2, cy), aa(4.6 - np.hypot(xx - cx, yy - cy)))
        col = iron * (1.2 + 1.6 * sstep(-0.5, -3.0, xx - cx))[..., None]
        col = mix(col, iron * 3.4, aa(1.5 - np.hypot(xx - cx, yy - cy))[..., None])
        tile.over(rows, cols, col, a_)
    bucket(cx - r, ry, 14, 11, 22, 33)
    # o contrapeso: um bloco de ferro com argola
    for rows, cols, yy, xx in tile.wins(cx + r - 9, cy + 114, cx + r + 9, cy + 131):
        dx = xx - (cx + r)
        a_ = np.maximum(aa(7 - np.abs(dx)) * band(yy, cy + 120, cy + 129), aa(0.8 - np.abs(np.hypot(dx, yy - (cy + 118.5)) - 2.2)))
        col = iron * (1.1 + 1.5 * sstep(1.0, -6.5, dx) + 0.8 * band(yy, cy + 120, cy + 121.4))[..., None]
        tile.over(rows, cols, col, a_)
    # vigas: a sombra delas no que está embaixo, a viga com as pontas cintadas de ferro e as cavilhas
    for (x0, span, top_) in Pl['beams']:
        seed += 1
        c_ = wd(Y - (top_ - 7))
        xc = wd(X - (x0 + span / 2))
        hl = span / 2 + 26
        inx = aa(hl - np.abs(xc))
        tile.tint(*full, np.zeros(3, np.float32), 0.5 * sstep(22, 11, c_) * (c_ > 10.5) * inx)
        a_ = aa(11 - np.abs(c_)) * inx
        kn = [(rng.uniform(-hl, hl), rng.uniform(-6, 6)) for _ in range(4)]
        col = timber(xc, c_, 11, seed, knots=kn)
        strap = band(np.abs(xc), hl - 8.5, hl - 4.5)
        col = mix(col, iron * (1.0 + 2.4 * sstep(-3, -11, c_))[..., None], strap[..., None])
        col = col * (1 - 0.4 * sstep(hl - 2.2, hl, np.abs(xc)))[..., None]
        tile.over(*full, col, a_)
        for xp in (x0, x0 + span):
            for (ox, oy) in ((-4.5, -12.0), (4.5, -2.5)):
                dd = np.hypot(wd(X - (xp + ox)), wd(Y - (top_ + oy)))
                tile.over(*full, iron * 0.9, aa(1.8 - dd))
                tile.over(*full, AMBER_D * 1.2, aa(0.75 - np.hypot(wd(X - (xp + ox - 0.6)), wd(Y - (top_ + oy - 0.6)))) * 0.85)

    # ---------------------------------------------------------------- cristais de Âmbar (luz própria)
    ci = 0
    for c in Pl['clusters']:
        for (bx, by, a, ln) in c['crystals']:
            ci += 1
            wdt = ln * 0.28
            ux, uy = math.cos(a), math.sin(a)
            for rows, cols, yy, xx in tile.wins(bx - ln - 5, by - ln - 5, bx + ln + 5, by + ln + 5):
                s_ = ((xx - bx) * ux + (yy - by) * uy) / ln
                q = -(xx - bx) * uy + (yy - by) * ux
                halfw = wdt * np.minimum(0.86, 2.3 * (1 - s_))
                d = np.minimum(halfw - np.abs(q), (s_ + 0.06) * ln)
                a_ = aa(d)
                if not a_.any():
                    continue
                qn = q / np.maximum(halfw, 1e-3)
                tip = sstep(0.58, 0.68, s_)
                e1, e2 = -0.30 - 0.12 * tip, 0.36 - 0.2 * tip
                left = sstep(e1 + 0.05, e1 - 0.05, qn)
                right = sstep(e2 - 0.05, e2 + 0.05, qn)
                col = np.zeros(a_.shape + (3,), np.float32) + AMBER
                col = mix(col, mix(AMBER, AMBER_L, 0.30 + 0.25 * tip[..., None]), left[..., None])
                col = mix(col, mix(AMBER, AMBER_D, 0.50 + 0.2 * tip[..., None]), right[..., None])
                # a luz de dentro, mais forte no meio e perto da raiz
                col = mix(col, AMBER_L, (0.16 * np.exp(-(qn / 0.55) ** 2) * (1 - 0.7 * s_) * (1 - left) * (1 - right))[..., None])
                # as arestas entre as faces e o contorno
                col = mix(col, AMBER_L * 1.02, (np.maximum(sstep(0.06, 0.02, np.abs(qn - e1)), 0.5 * sstep(0.05, 0.02, np.abs(qn - e2))) * 0.6)[..., None])
                col = mix(col, AMBER_D * 0.55, (sstep(1.1, 0.2, halfw - q) * 0.7)[..., None])
                col = mix(col, AMBER_L, (sstep(0.8, 0.2, halfw + q) * 0.4)[..., None])
                # raiz: o cristal sai escuro de dentro da pedra
                col = mix(col, AMBER_D * 0.8, (sstep(0.22, 0.0, s_) * 0.75)[..., None])
                tile.over(rows, cols, col, a_)
    col, A = tile.col, tile.a
    col += AMBER * 0.35 * (halo * A * 0.33)[..., None]
    tile.col[:] = grain(col * 0.8, rng, 0.03)
    return tile


# ======================================================================================
def view(out, tag, layers, bg, cams=((0, 0), (700, 520))):
    """Vista do jogo (640x360 do mundo em 1920x1080) com as camadas repetindo nas duas direções, na
    posição de duas câmeras; com --old, a mesma vista com a pintura 2x ampliada.
    layers: (nome, fator de rolagem em x, fator em y)."""
    os.makedirs(out, exist_ok=True)
    for (sx, sy) in cams:
        for src, k, suf in ((OLD, 2, 'antes'), (OUT, 3, 'novo')):
            if not src:
                continue
            v = Image.new('RGBA', (1920, 1080), bg + (255,))
            for name, fx, fy in layers:
                p = f'{src}/{name}.png'
                if not os.path.exists(p):
                    continue
                im = Image.open(p).convert('RGBA')
                if k != 3:
                    im = im.resize((im.width * 3 // k, im.height * 3 // k), Image.BICUBIC)
                ox, oy = int(sx * fx * 3) % im.width, int(sy * fy * 3) % im.height
                for x in range(-ox, 1920, im.width):
                    for y in range(-oy, 1080, im.height):
                        v.alpha_composite(im, (max(0, x), max(0, y)), (max(0, -x), max(0, -y)))
            v.convert('RGB').save(f'{out}/{tag}-{sx}-{suf}.png')


if __name__ == '__main__':
    if want('mine-far'):
        save(mine_far(np.random.default_rng(1141)), 'mine-far')
    if want('mine-mid'):
        save(mine_mid(np.random.default_rng(1142)), 'mine-mid')
    if PREVIEW:
        view(PREVIEW, 'minas', [('mine-far', 0.12, 0.1), ('mine-mid', 0.34, 0.3)], (9, 7, 10))

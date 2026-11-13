"""Fundos das Catacumbas de Vespera para o ECLIPSE: os mesmos de fundos_catacumba.py (mesmo desenho, mesmas
medidas no mundo), repintados em 3x com a pedra de pedra3.py.

Camadas (tamanho no mundo; as imagens têm o triplo, a tela inteira):
  cat-far  1024x360  o salão ao longe: duas arcadas na névoa fria, fachos de luz, velas e o chão molhado
  cat-mid  1024x360  a arcada mais perto: pilares de cantaria com capitel, arcos de aduelas, o muro baixo
                     de ossos empilhados com as fileiras de crânios, velas no muro, nichos e correntes

O que era um contorno quente nas bordas dos arcos virou a espessura da parede (o intradorso), acesa pelas
velas do salão de trás; as correntes pendem do alto dos arcos.

uso: python3 ecl_catacumba.py <pasta_saida> [camada ...] [--preview=<pasta>] [--old=<pasta 2x>]
"""
import math
import numpy as np
from PIL import Image, ImageDraw
from brush import hexc, mix, sstep, blur
from shapes import Mask
from pedra3 import Blocks, ArchRow, Light, shade, streaks, cracks, grain, cyl, grid, pnoise, wdx, wblur, knobs, skull, TAU
from ecl_comum import Canvas, chain, flame, save, preview, want, put_win, PREVIEW, WARM0, WARM1, WARM2

INK = hexc(0x040509)
HAZE = hexc(0x2a3044)
HAZE2 = hexc(0x3c4560)
BONE = hexc(0x8a8270)
CANDLE = WARM1 * np.array([1.0, 0.88, 0.74], np.float32)
IRON_C, IRON_C_HI = hexc(0x0a0b10), hexc(0x464c5e)


def candle(cv, x, y, hgt, rng, s=0.4, wide=3.4):
    """Um toco de vela em pé em (x, y = onde ele apoia), com a cera escorrida e a chama."""
    LW, LH = 24, int(hgt) + 8
    rows, cols, ly, lx = cv.win(x - LW / 2, y - hgt - 2, LW, LH)
    if rows.stop <= rows.start:
        return
    dx = lx - x
    top = y - hgt
    body = np.clip(wide - np.abs(dx) + 0.5, 0, 1) * np.clip(ly - top + 0.5, 0, 1) * np.clip(y - ly + 0.5, 0, 1)
    # a cera escorrida engrossa o pé
    foot = np.clip(wide + 2.2 * sstep(y - 5.0, y, ly) - np.abs(dx) + 0.5, 0, 1) * np.clip(ly - (y - 5.0), 0, 1) * np.clip(y - ly + 0.5, 0, 1)
    m = np.maximum(body, foot)
    wax = mix(hexc(0x6a5a3e), hexc(0xd9b878), sstep(y - 2.0, top - 2.0, ly)[..., None] ** 1.6)   # mais clara perto da chama
    wax = wax * (1 - 0.45 * sstep(-wide * 0.2, wide, dx))[..., None]                              # o lado direito na sombra
    cv.over(rows, cols, wax, m * 0.97)
    flame(cv, x, top + 1.5, s, rng, halo=0.75, air=True)


def web(cv, x, y, w, h, rng, flip=False, up=False):
    """Teia de aranha num canto (x, y = a quina; abre para a direita e para baixo; flip: para a esquerda;
    up: para cima)."""
    SS = 3
    img = Image.new('L', (int(w) * SS, int(h) * SS), 0)
    d = ImageDraw.Draw(img)
    n = 6
    ends = []
    for i in range(n):
        t = i / (n - 1)
        ang = t * math.pi / 2
        L = (0.72 + 0.28 * rng.random())
        ends.append((math.cos(ang) * w * L, math.sin(ang) * h * L))
    for ex, ey in ends:
        d.line([(0, 0), (ex * SS, ey * SS)], fill=150, width=1)
    for k in range(1, 7):
        f = k / 7 + rng.uniform(-0.02, 0.02)
        pts = []
        for i in range(n):
            ex, ey = ends[i]
            pts.append((ex * f, ey * f))
        # os fios entre dois raios caem um pouco para a quina
        for i in range(n - 1):
            (ax, ay), (bx, by) = pts[i], pts[i + 1]
            mx, my = (ax + bx) / 2 * 0.93, (ay + by) / 2 * 0.93
            d.line([(ax * SS, ay * SS), (mx * SS, my * SS), (bx * SS, by * SS)], fill=120, width=1)
    a = np.asarray(img.resize((int(w), int(h)), Image.BOX), np.float32) / 255.0
    if flip:
        a = a[:, ::-1]
    if up:
        a = a[::-1]
    rows, cols, ly, lx = cv.win(x - (w if flip else 0), y - (h if up else 0), w, h)
    if rows.stop - rows.start < int(h):
        return
    cv.over(rows, cols, hexc(0x8a93a8), a * 0.75)


# ======================================================================================
# Mais perto: a arcada de cantaria e o muro de ossos
# ======================================================================================
def cat_mid(rng):
    TW, H = 3072, 1080
    yy, xx = grid(TW, H)
    span, pw, X0 = 768.0, 114.0, 180.0
    hw = pw / 2
    spring, r_in = 495.0, span / 2 - pw / 2
    band, wall_top, base_top = 105.0, 900.0, 975.0
    cap0, cap1 = 477.0, 504.0
    ring_t, rev = 54.0, 7.0
    dxp = ((xx - X0 + span / 2) % span) - span / 2      # até o meio do pilar mais perto
    dxa = ((xx - X0) % span) - span / 2                  # até o meio do vão mais perto
    cell = np.floor((xx - X0) / span).astype(np.int64) % 4
    pcell = np.floor((xx - X0 + span / 2) / span).astype(np.int64) % 4
    adx = np.abs(dxp)

    pit = pnoise(H, TW, 4.2, rng, 2)
    big = pnoise(H, TW, 90, rng, 3)
    mid = pnoise(H, TW, 22, rng, 2)

    # ---------- as máscaras ----------
    AR = ArchRow(yy, dxa, cell, spring, r_in, ring_t, 21, mortar=1.6, bevel=2.6)
    rd = AR.rd
    upper = np.clip(rd + 0.5, 0, 1) * (yy < spring)
    pier = np.clip(hw - adx + 0.5, 0, 1)
    capw = hw + 15.0 - 12.0 * sstep(cap0 + 12.0, cap1, yy)
    capm = np.clip(capw - adx + 0.5, 0, 1) * np.clip(yy - cap0 + 0.5, 0, 1) * np.clip(cap1 - yy + 0.5, 0, 1)
    basem = np.clip(hw + 18.0 - adx + 0.5, 0, 1) * np.clip(yy - base_top + 0.5, 0, 1)
    wallm = np.clip(yy - wall_top + 0.5, 0, 1)
    a = np.clip(np.maximum.reduce([upper, pier, capm, basem, wallm]), 0, 1)

    # ---------- a parede de cima (cantaria velha, almofadada) ----------
    B = Blocks(yy, xx, TW, 39.0, 98.0, rng, vary=0.45)
    bf = B.face(1.8, 3.0)
    h = B.height(depth=2.8, jut=1.5, tilt=1.5, mortar=1.8, bevel=3.0, round_=1.2)
    h += (pit - 0.5) * 1.7 * bf + (mid - 0.5) * 2.6 * bf
    stone = mix(hexc(0x50546a), hexc(0x626680), B.r(3)[..., None])
    stone = mix(stone, hexc(0x5e5a62), (sstep(0.62, 0.95, B.r(4)) * 0.6)[..., None])      # algumas pedras mais quentes
    stone = mix(stone, hexc(0x3a3d50), (sstep(0.72, 1.0, B.r(5)) * 0.65)[..., None])      # outras mais escuras
    alb = stone * (0.78 + 0.44 * big)[..., None] * (0.84 + 0.32 * pit)[..., None]
    alb = mix(alb, hexc(0x14151c), ((1 - bf) * 0.88)[..., None])
    chip = sstep(0.56, 0.78, pnoise(H, TW, 11, rng, 2)) * sstep(13.0, 2.0, np.hypot(B.du, B.dv)) * bf
    h -= chip * 2.8
    alb = mix(alb, alb * 0.62, chip[..., None])
    # pedras gastas: a face comida pelo tempo em manchas
    worn = sstep(0.58, 0.8, pnoise(H, TW, 30, rng, 3)) * bf
    h -= worn * (1.0 + 1.6 * pit)
    alb = mix(alb, alb * hexc(0xb0a898) * 1.05, (worn * 0.5)[..., None])

    # ---------- o anel de aduelas de cada arco ----------
    rr = rng.random((4, 8192)).astype(np.float32)
    rf = AR.f
    rh = 3.4 + rf * 2.8 + (rr[0][AR.key] - 0.5) * 2.2 * rf + (pit - 0.5) * 1.4 * rf + AR.keystone * 3.0
    ra = mix(hexc(0x5a5e76), hexc(0x6e7290), rr[1][AR.key][..., None])
    ra = mix(ra, hexc(0x444860), (sstep(0.7, 1.0, rr[2][AR.key]) * 0.6)[..., None])
    ra = ra * (0.8 + 0.4 * big)[..., None] * (0.84 + 0.32 * pit)[..., None]
    ra = mix(ra, hexc(0x14151c), ((1 - rf) * 0.88)[..., None])
    h = h * (1 - AR.m) + rh * AR.m
    alb = mix(alb, ra, AR.m[..., None])

    # ---------- a cornija no alto (a faixa de cima) ----------
    ck = yy - (band - 16.0)
    corn = np.clip(1 - ((ck - 8.0) / 8.0) ** 2, 0, 1) * (ck > 0) * (ck < 16)
    h += corn * 6.0 * (yy < band + 2)
    alb = mix(alb, hexc(0x666a84) * (0.8 + 0.4 * big)[..., None], (sstep(0.0, 0.5, corn) * 0.7)[..., None])

    # ---------- um nicho redondo com um crânio no meio de cada enjunta (em cima do pilar) ----------
    roundel_y, roundel_r = 262.0, 30.0
    dr = np.hypot(dxp, yy - roundel_y)
    rim = np.clip(1 - np.abs(dr - (roundel_r + 5.0)) / 5.5, 0, 1)
    hole = np.clip(roundel_r - dr + 0.5, 0, 1)
    h = h * (1 - np.clip(rim * 2, 0, 1)) + (4.0 + 2.5 * np.sin(np.clip(rim, 0, 1) * math.pi / 2)) * np.clip(rim * 2, 0, 1)
    seg = np.abs(((np.arctan2(yy - roundel_y, dxp) / TAU * 12.0) % 1.0) - 0.5) * TAU / 12.0 * (roundel_r + 5.0)   # juntas do aro
    rimf = sstep(0.6, 2.2, seg)
    alb = mix(alb, hexc(0x666a84) * (0.8 + 0.4 * big)[..., None] * (0.25 + 0.75 * rimf)[..., None], np.clip(rim * 2, 0, 1)[..., None])
    h = h * (1 - hole) + (-9.0 + 5.0 * sstep(roundel_r - 8.0, roundel_r, dr)) * hole
    alb = mix(alb, hexc(0x15161c) * (0.7 + 0.6 * pit)[..., None], hole[..., None])
    sun_k = 1 - hole * sstep(roundel_r, roundel_r - 16.0, dr + (dxp + (yy - roundel_y)) * 0.55)   # a sombra do aro dentro do nicho
    cv0 = Canvas(TW, H)
    for i in range(4):
        cx = X0 + i * span
        s = 2.15 + 0.2 * rng.random()
        n = 64
        sh, st, sa = skull(n, s, rng.uniform(-0.12, 0.12), jaw=i != 2)
        rows, cols, ly, lx = cv0.win(cx - n / 2, roundel_y - n / 2 + 2, n, n)
        sa = sa * (np.hypot(lx - cx, ly - roundel_y) < roundel_r - 1.0)
        hw_ = h[rows][:, cols]
        put_win(h, rows, cols, hw_ * (1 - sa) + (-7.0 + sh * 0.8) * sa)
        aw = alb[rows][:, cols]
        bone = BONE * (0.72 + 0.2 * rng.random()) * st[..., None] * (0.85 + 0.3 * pit[rows][:, cols])[..., None]
        put_win(alb, rows, cols, mix(aw, bone, sa[..., None]))

    # ---------- o pilar: cantaria em duas pedras por fiada ----------
    PB = Blocks(yy, dxp + hw, pw, 46.0, pw / 2, rng, vary=0.0, stagger=0.5, y0=cap1)
    PB.key = (PB.key + pcell * 977) % 8192
    pf = PB.face(1.8, 3.0)
    ph = 1.5 + PB.height(depth=2.8, jut=1.4, tilt=1.5, mortar=1.8, bevel=3.0, round_=1.4) + (pit - 0.5) * 1.7 * pf + (mid - 0.5) * 2.4 * pf
    pa = mix(hexc(0x565a72), hexc(0x686c88), PB.r(3)[..., None])
    pa = mix(pa, hexc(0x40435a), (sstep(0.7, 1.0, PB.r(4)) * 0.6)[..., None])
    pa = pa * (0.78 + 0.44 * big)[..., None] * (0.84 + 0.32 * pit)[..., None]
    pa = mix(pa, hexc(0x14151c), ((1 - pf) * 0.88)[..., None])
    below = (yy >= cap1).astype(np.float32)
    pm = pier * below
    h = h * (1 - pm) + ph * pm
    alb = mix(alb, pa, pm[..., None])
    # o colarinho embaixo do capitel
    nk = yy - (cap1 + 5.0)
    neck = np.clip(1 - ((nk - 4.5) / 4.5) ** 2, 0, 1) * (nk > 0) * (nk < 9) * pier
    h += neck * 3.2

    # ---------- o capitel (ábaco e a moldura embaixo) e o soco ----------
    ct = (yy - cap0) / (cap1 - cap0)
    chh = 13.0 - 7.0 * sstep(0.45, 1.0, ct) ** 1.5 + 1.2 * np.clip(1 - np.abs(ct - 0.42) / 0.07, 0, 1)
    cpa = hexc(0x6c7090) * (0.8 + 0.4 * big)[..., None] * (0.85 + 0.3 * pit)[..., None]
    h = h * (1 - capm) + chh * capm
    alb = mix(alb, cpa, capm[..., None])
    SB = Blocks(yy, dxp + hw + 18.0, pw + 36.0, 36.0, (pw + 36.0) / 2, rng, vary=0.0, stagger=0.5, y0=base_top + 18.0)
    SB.key = (SB.key + pcell * 977) % 8192
    sf = SB.face(1.8, 2.8)
    bk = yy - base_top
    torus = np.clip(1 - ((bk - 9.0) / 9.0) ** 2, 0, 1) * (bk < 18)
    bh = np.where(bk < 18, 5.0 + 6.5 * np.sqrt(torus), 9.0 + sf * 2.4 + (SB.r(0) - 0.5) * 1.4 * sf + (pit - 0.5) * 1.4)
    ba = mix(hexc(0x5c6078), hexc(0x6a6e8a), SB.r(3)[..., None]) * (0.8 + 0.4 * big)[..., None] * (0.85 + 0.3 * pit)[..., None]
    ba = np.where((bk < 18)[..., None], ba, mix(ba, hexc(0x14151c), ((1 - sf) * 0.88)[..., None]))
    h = h * (1 - basem) + bh * basem
    alb = mix(alb, ba, basem[..., None])

    # ---------- o muro baixo: a laje de cima e os ossos empilhados ----------
    front = np.clip(np.maximum(pier, basem), 0, 1)                # o que fica na frente do muro
    wy = yy - wall_top
    cop = 17.0
    CB = Blocks(yy, xx, TW, cop, 132.0, rng, vary=0.3, y0=wall_top)
    cf = sstep(0.8, 2.8, CB.du)
    coph = 8.0 + cf * 2.0 + (CB.r(0) - 0.5) * 1.6 - sstep(5.0, 0.0, wy) * 4.0 - sstep(cop - 4.0, cop, wy) * 5.0 + (pit - 0.5) * 1.6
    copa = mix(hexc(0x62667e), hexc(0x747894), CB.r(3)[..., None]) * (0.8 + 0.4 * big)[..., None] * (0.82 + 0.36 * pit)[..., None]
    copa = mix(copa, hexc(0x15161d), ((1 - cf) * 0.85)[..., None])
    kh, kkey, krnd = knobs(yy, xx, TW, 9.0, 8.0, rng, y0=wall_top + cop)
    gone = krnd[3][kkey] < 0.07                                            # falta um osso aqui e ali
    kh = np.where(gone, 0.0, kh)
    bh_ = -4.0 + kh * (3.2 + 1.6 * krnd[4][kkey]) + (pit - 0.5) * 0.8 * kh
    ktone = 0.55 + 0.45 * krnd[4][kkey]
    ba_ = mix(hexc(0x4e493e), hexc(0x7c7462), krnd[2][kkey][..., None]) * ktone[..., None] * (0.8 + 0.4 * mid)[..., None]
    ba_ = mix(hexc(0x08080a), ba_, sstep(0.0, 0.35, kh)[..., None])
    # no meio de algumas pontas o tutano: um furo escuro pequeno
    marrow = sstep(0.93, 0.985, kh) * (krnd[0][kkey] > 0.45)
    ba_ = mix(ba_, ba_ * 0.35, marrow[..., None])
    bh_ -= marrow * 1.2
    wmask = wallm * (1 - front)
    is_cop = (wy < cop).astype(np.float32)
    wh = np.where(wy < cop, coph, bh_)
    wa = np.where((wy < cop)[..., None], copa, ba_)
    h = h * (1 - wmask) + wh * wmask
    alb = mix(alb, wa, wmask[..., None])

    # as fileiras de crânios (uma a cada 33 px, como antes; aqui e ali falta um, ou o nicho ficou vazio)
    nsk = 93
    pitch = TW / nsk
    lights = []
    for row_y in (942.0, 1014.0):
        for k in range(nsk):
            if rng.random() < 0.25:
                continue
            x = k * pitch + rng.normal(0, 2.0)
            y = row_y + rng.normal(0, 1.2)
            n = 40
            rows, cols, ly, lx = cv0.win(x - n / 2, y - n / 2, n, n)
            if rows.stop - rows.start < n:
                continue
            dd = np.hypot(lx - x, (ly - y - 1.0) * 0.92)
            nm = np.clip(13.6 - dd + 0.5, 0, 1)
            fr = 1 - front[rows][:, cols]
            hw_ = h[rows][:, cols]
            aw = alb[rows][:, cols]
            hw_ = hw_ * (1 - nm * fr) + (-10.0 + 3.0 * sstep(8.0, 13.6, dd)) * nm * fr
            aw = mix(aw, hexc(0x050506), (nm * fr)[..., None])
            if rng.random() < 0.75:
                s = rng.uniform(0.98, 1.16)
                sh, st, sa = skull(n, s, rng.normal(0, 0.14), jaw=rng.random() < 0.6)
                sa = sa * fr
                hw_ = hw_ * (1 - sa) + (-6.5 + sh * 0.75) * sa
                tint = mix(hexc(0x7a7262), hexc(0x9a927c), rng.random()) * rng.uniform(0.7, 1.0)
                aw = mix(aw, tint * st[..., None] * (0.85 + 0.3 * pit[rows][:, cols])[..., None], sa[..., None])
            put_win(h, rows, cols, hw_)
            put_win(alb, rows, cols, aw)

    # ---------- nichos com velas em dois pilares, uma placa gravada noutro ----------
    niche_y0, niche_y1, niche_w = 640.0, 724.0, 48.0
    nsp = niche_y0 + niche_w / 2
    niche_open = np.zeros((H, TW), np.float32)
    for i in (0, 2):
        cx = X0 + i * span
        rows, cols, ly, lx = cv0.win(cx - 60, niche_y0 - 20, 120, niche_y1 - niche_y0 + 40)
        ddx = lx - cx
        d = np.where(ly < nsp, np.hypot(ddx, ly - nsp) - niche_w / 2, np.abs(ddx) - niche_w / 2)
        d = np.where(ly > niche_y1, np.maximum(d, ly - niche_y1), d)
        inside = np.clip(0.5 - d, 0, 1)
        frame = np.clip(d + 0.5, 0, 1) * np.clip(8.0 - d + 0.5, 0, 1) * (ly < niche_y1 + 9)
        sill = np.clip(niche_w / 2 + 10.0 - np.abs(ddx) + 0.5, 0, 1) * np.clip(ly - niche_y1 + 0.5, 0, 1) * np.clip(niche_y1 + 10.0 - ly + 0.5, 0, 1)
        hw_ = h[rows][:, cols]
        aw = alb[rows][:, cols]
        fa_ = hexc(0x6a6e8c) * (0.8 + 0.4 * big[rows][:, cols])[..., None] * (0.85 + 0.3 * pit[rows][:, cols])[..., None]
        hw_ = hw_ * (1 - frame) + (5.0 + 1.5 * np.sin(np.clip(d / 8.0, 0, 1) * math.pi)) * frame
        aw = mix(aw, fa_, frame[..., None])
        hw_ = hw_ * (1 - sill) + 9.0 * sill
        aw = mix(aw, fa_ * 1.05, sill[..., None])
        hw_ = hw_ * (1 - inside) + (-13.0 + 5.0 * sstep(-9.0, 0.0, d)) * inside
        aw = mix(aw, hexc(0x3c3a44) * (0.75 + 0.5 * pit[rows][:, cols])[..., None], inside[..., None])
        put_win(h, rows, cols, hw_)
        put_win(alb, rows, cols, aw)
        put_win(niche_open, rows, cols, inside, 'max')
        lights.append(Light(cx, niche_y1 - 26.0, 9.0, 34.0, CANDLE, 2.3))
        lights.append(Light(cx, niche_y1 - 22.0, 30.0, 120.0, CANDLE, 0.55))
    sun_k = sun_k * (1 - niche_open)
    # a placa: uma lápide lisa embutida, com o anel do eclipse gravado (o disco, a coroa e os raios) e
    # três linhas de letras gastas
    cx = X0 + 1 * span
    rows, cols, ly, lx = cv0.win(cx - 40, 628, 80, 110)
    ddx, ddy = lx - cx, ly - 683.0
    plate = np.clip(27.0 - np.abs(ddx) + 0.5, 0, 1) * np.clip(42.0 - np.abs(ddy) + 0.5, 0, 1)
    edge = np.minimum(27.0 - np.abs(ddx), 42.0 - np.abs(ddy))
    er = np.hypot(ddx, ddy + 12.0)
    ea = np.arctan2(ddy + 12.0, ddx)
    ray = (np.abs(((ea / TAU * 12.0) % 1.0) - 0.5) < 0.09) * (er > 14.5) * (er < 19.5)
    cross = np.maximum(np.clip(1 - np.abs(er - 10.0) / 1.7, 0, 1), ray.astype(np.float32))
    lines = (np.abs(((ddy - 26.0) % 7.0) - 3.5) < 0.9) * (ddy > 20) * (ddy < 37) * (np.abs(ddx) < 18) * (pit[rows][:, cols] > 0.3)
    hw_ = h[rows][:, cols]
    aw = alb[rows][:, cols]
    hw_ = hw_ * (1 - plate) + (4.5 - 2.5 * sstep(4.0, 0.0, edge) - 2.0 * cross - 1.0 * lines + (pit[rows][:, cols] - 0.5) * 1.0) * plate
    aw = mix(aw, hexc(0x70748e) * (0.82 + 0.36 * big[rows][:, cols])[..., None] * (1 - 0.5 * cross - 0.3 * lines)[..., None], plate[..., None])
    put_win(h, rows, cols, hw_)
    put_win(alb, rows, cols, aw)

    # ---------- umidade, salitre e trincas ----------
    wet = streaks(H, TW, rng, length=260.0, width=11.0, density=0.4)
    wet_k = np.maximum(sstep(band + 300.0, band, yy) * (yy > band - 4), sstep(cap1 + 230.0, cap1, yy) * (yy > cap1) * pier * 0.8)
    wetm = wet * wet_k * (1 - wallm)
    alb = mix(alb, alb * hexc(0x7c8492) * 0.6, (wetm * 0.85)[..., None])
    niter = sstep(0.6, 0.86, pnoise(H, TW, 34, rng, 3)) * sstep(0.35, 0.7, pit) * (1 - wetm) * (1 - wallm) * (yy > band)
    alb = mix(alb, hexc(0x8e94a8), (niter * 0.32)[..., None])
    cr = cracks(H, TW, rng, n=18, length=(70, 260))
    cr = cr * (1 - wallm * (1 - front))
    h -= cr * 1.8
    alb = mix(alb, hexc(0x0b0c10), (cr * 0.8)[..., None])

    # ---------- as velas em cima do muro (as luzes) ----------
    candles = []
    for i in range(4):
        x0 = X0 + i * span + hw + 40.0
        x1 = X0 + (i + 1) * span - hw - 40.0
        for g in range(int(rng.integers(2, 4))):
            gx = rng.uniform(x0, x1)
            for c in range(int(rng.integers(1, 4))):
                x = gx + rng.uniform(-20, 20)
                hgt = rng.uniform(9, 30)
                candles.append((x, hgt))
            lights.append(Light(gx, wall_top - 26.0, 22.0, 150.0, CANDLE, rng.uniform(1.5, 2.1)))

    # ---------- a luz: fria de cima e da esquerda, e as velas de raspão ----------
    under_cop = sstep(cop + 26.0, cop, wy) * (wy >= cop) * wallm * (1 - front)       # a laje faz sombra nos ossos de cima
    under_cap = sstep(cap1 + 46.0, cap1, yy) * (yy >= cap1) * pier                    # e o capitel no fuste
    sun_k = sun_k * (1 - 0.85 * under_cop) * (1 - 0.7 * under_cap)
    col = shade(alb, h, yy, xx, TW, ambient=np.array([0.075, 0.085, 0.118]), sun=((-0.5, -0.7, 0.5), np.array([0.2, 0.235, 0.33])),
                lights=lights, k=1.0, spec=0.3, gloss=20.0, wet=np.clip(wetm * 1.6 + 0.08, 0, 1), sun_k=sun_k)
    # os volumes: o lado direito do pilar e do soco cai na sombra, o muro fica atrás do pilar
    col *= (1.1 - 0.36 * sstep(-hw, hw, dxp) * np.maximum(pm, basem))[..., None]
    shadow_r = sstep(hw + 18.0 + 70.0, hw + 18.0, dxp) * (dxp > hw) * wmask
    col *= (1 - 0.5 * shadow_r)[..., None]
    # o alto some no escuro (a abóbada)
    col *= (0.4 + 0.6 * sstep(0.0, 330.0, yy))[..., None]

    # ---------- a espessura da parede nos vãos (o intradorso), acesa pelas velas do salão de trás ----------
    side = (yy >= cap1) & (yy < wall_top)
    arch = yy < cap0
    de = np.where(arch, rd, np.where(side, hw - adx, 99.0))
    revm = np.clip(rev - de + 0.5, 0, 1) * np.clip(de + 0.5, 0, 1) * (arch | side)
    jd = np.where(arch, AR.dj, PB.dv)
    jf = sstep(0.5, 2.2, jd)
    # a luz quente vem das velas: forte perto do muro, fraca no alto do arco, e mais forte nos vãos com mais velas
    near = np.zeros((1, TW), np.float32)
    for L in lights:
        if L.y > wall_top - 60:                       # só as velas do muro (as dos nichos ficam dentro deles)
            near = np.maximum(near, L.power * np.exp(-(wdx(xx[:1], L.x, TW) / 240.0) ** 2))
    near = np.clip(near / 2.0, 0, 1)
    warm_y = 0.16 + 0.84 * sstep(170.0, 900.0, yy) ** 1.5
    wn = 0.55 + 0.9 * pnoise(H, TW, 46, rng, 2)
    across = sstep(rev, 0.0, de)                          # mais clara para o fundo (mais perto das velas)
    wk = warm_y * wn * (0.3 + 0.7 * near) * (0.3 + 0.7 * across)
    rv = (hexc(0x16141a) + hexc(0xa8662f) * wk[..., None]) * (0.8 + 0.4 * pit)[..., None]
    rv = mix(rv * 0.3, rv, jf[..., None])
    col = mix(col, rv, revm[..., None])
    # a quina entre a face e o intradorso: um fio escuro
    arris = np.clip(1 - np.abs(de - rev) / 1.2, 0, 1) * (arch | side)
    col *= (1 - 0.5 * arris)[..., None]

    cv = Canvas(TW, H)
    cv.col[:] = col
    cv.a[:] = a

    # ---------- as velas: no muro e nos nichos ----------
    for x, hgt in candles:
        candle(cv, x, wall_top + 2.0, hgt, rng, s=rng.uniform(0.34, 0.44))
    for i in (0, 2):
        cx = X0 + i * span
        for dxc, hg in ((-12.0, 16.0), (11.0, 24.0)) if i == 0 else ((-14.0, 22.0), (0.0, 12.0), (13.0, 30.0)):
            candle(cv, cx + dxc, niche_y1, hg, rng, s=0.3, wide=2.8)

    # ---------- correntes penduradas do alto dos arcos, teias nos cantos ----------
    for k in range(7):
        i = k % 4
        # duas por vão no máximo, uma de cada lado do meio (não ficam coladas)
        dx = (-0.36 + 0.72 * (k // 4) + rng.uniform(-0.22, 0.22)) * r_in
        x = X0 + i * span + span / 2 + dx
        y0 = spring - math.sqrt(r_in ** 2 - dx ** 2) - 1.0          # o intradorso neste ponto
        y1 = y0 + rng.uniform(150, 420)
        # a argola presa no intradorso (o alto dela entra na pedra)
        rows, cols, ly, lx = cv.win(x - 9, y0 - 5, 18, 18)
        ring = np.clip(1 - np.abs(np.hypot(lx - x, ly - (y0 + 4)) - 5.0) / 1.6, 0, 1)
        cv.over(rows, cols, IRON_C, ring)
        chain(cv, x, y0 + 7, y1, w=4.4, hook=k in (2, 5), hi=IRON_C_HI, hi_k=0.45, warm=hexc(0x6a4426), iron=IRON_C)
    # teias no canto entre o pilar e o muro de ossos
    for i, flip in ((0, False), (1, True), (3, False)):
        px = X0 + i * span + (-hw if flip else hw)
        web(cv, px, wall_top + 1, 78, 96, rng, flip=flip, up=True)

    cv.col[:] = grain(cv.col, rng, 0.03)
    return cv


# ======================================================================================
# Ao longe: o salão
# ======================================================================================
def gallery(yy, xx, TW, rng, span, pw, spring, deck_top, deck_bot, off, foot, lights, round_col, course, nst, ring_t, tint, rev=4.0, joint=0.75):
    """Uma arcada do salão: o tabuleiro em cima, os arcos com aduelas, os pilares até o chão.
    Devolve (cor iluminada, máscara)."""
    H = yy.shape[0]
    n = int(round(TW / span))
    hw = pw / 2
    dxp = ((xx - off + span / 2) % span) - span / 2
    dxa = ((xx - off) % span) - span / 2
    cell = np.floor((xx - off) / span).astype(np.int64) % n
    pcell = np.floor((xx - off + span / 2) / span).astype(np.int64) % n
    adx = np.abs(dxp)
    r = span / 2 - hw
    AR = ArchRow(yy, dxa, cell, spring, r, ring_t, nst, mortar=1.0, bevel=1.6)
    upper = np.clip(AR.rd + 0.5, 0, 1) * (yy < spring) * np.clip(yy - deck_top + 0.5, 0, 1)
    pier = np.clip(hw - adx + 0.5, 0, 1) * (yy >= spring) * np.clip(foot - yy + 0.5, 0, 1)
    capw = hw + 5.0
    capm = np.clip(capw - adx + 0.5, 0, 1) * np.clip(yy - (spring - 7.0) + 0.5, 0, 1) * np.clip(spring + 6.0 - yy + 0.5, 0, 1)
    plw = hw + 5.0
    plinth = np.clip(plw - adx + 0.5, 0, 1) * np.clip(yy - (foot - 16.0) + 0.5, 0, 1) * np.clip(foot - yy + 0.5, 0, 1)
    m = np.clip(np.maximum.reduce([upper, pier, capm, plinth]), 0, 1)

    pit = pnoise(H, TW, 3.6, rng, 2)
    big = pnoise(H, TW, 70, rng, 3)
    B = Blocks(yy, xx, TW, course, course * 2.4, rng, vary=0.35)
    bf = B.face(1.0, 1.8)
    h = B.height(depth=1.5, jut=0.7, tilt=0.6, mortar=1.0, bevel=1.8, round_=0.4) + (pit - 0.5) * 0.9 * bf
    alb = mix(hexc(0x626470), hexc(0x74768a), B.r(3)[..., None]) * (0.8 + 0.4 * big)[..., None] * (0.88 + 0.24 * pit)[..., None]
    alb = mix(alb, hexc(0x2a2c36), ((1 - bf) * joint)[..., None])
    # o anel
    rr = rng.random((2, 8192)).astype(np.float32)
    rh = 1.8 + AR.f * 1.6 + (rr[0][AR.key] - 0.5) * 1.0 * AR.f + AR.keystone * 1.4
    ra = mix(hexc(0x6a6c7c), hexc(0x7e8096), rr[1][AR.key][..., None]) * (0.82 + 0.36 * big)[..., None]
    ra = mix(ra, hexc(0x2a2c36), ((1 - AR.f) * joint)[..., None])
    h = h * (1 - AR.m) + rh * AR.m
    alb = mix(alb, ra, AR.m[..., None])
    # a cornija do tabuleiro e a faixa embaixo dele
    for y0, hh, k in ((deck_top, 10.0, 5.0), (deck_bot - 7.0, 7.0, 3.0)):
        t = yy - y0
        mould = np.clip(1 - ((t - hh / 2) / (hh / 2)) ** 2, 0, 1) * (t > 0) * (t < hh)
        h += mould * k
        alb = mix(alb, hexc(0x7a7c92) * (0.85 + 0.3 * big)[..., None], (sstep(0.0, 0.6, mould) * 0.6)[..., None])
    # o pilar
    if round_col:
        PBk = Blocks(yy, xx, TW, course * 1.5, 9999.0, rng, vary=0.0, stagger=0.0, y0=spring + 6.0)
        drum = sstep(0.5, 1.8, PBk.dv)
        ph = hw * 0.9 * cyl(dxp / hw) + drum * 1.0
        pa = mix(hexc(0x686a7a), hexc(0x7a7c90), rng.random(64)[pcell % 64][..., None]) * (0.85 + 0.3 * big)[..., None]
        pa = mix(pa, hexc(0x2a2c36), ((1 - drum) * joint * 0.8)[..., None])
    else:
        PB = Blocks(yy, dxp + hw, pw, course, pw / 2 if pw > course * 1.6 else pw, rng, vary=0.0, stagger=0.5, y0=spring + 6.0)
        PB.key = (PB.key + pcell * 977) % 8192
        pf = PB.face(1.0, 1.8)
        ph = 1.0 + PB.height(depth=1.6, jut=0.7, tilt=0.6, mortar=1.0, bevel=1.8, round_=0.5) + (pit - 0.5) * 0.9 * pf
        pa = mix(hexc(0x666878), hexc(0x787a90), PB.r(3)[..., None]) * (0.82 + 0.36 * big)[..., None] * (0.88 + 0.24 * pit)[..., None]
        pa = mix(pa, hexc(0x2a2c36), ((1 - pf) * joint)[..., None])
    pm = pier * (yy >= spring + 6.0)
    h = h * (1 - pm) + ph * pm
    alb = mix(alb, pa, pm[..., None])
    ch = 5.5 + 2.0 * np.sin(np.clip((yy - (spring - 7.0)) / 13.0, 0, 1) * math.pi)
    h = h * (1 - capm) + ch * capm
    alb = mix(alb, hexc(0x7c7e94) * (0.85 + 0.3 * big)[..., None], capm[..., None])
    h = h * (1 - plinth) + (4.5 + (pit - 0.5)) * plinth
    alb = mix(alb, hexc(0x70728a) * (0.85 + 0.3 * big)[..., None], plinth[..., None])
    alb = alb * np.asarray(tint, np.float32)
    # umidade escorrendo do tabuleiro
    wet = streaks(H, TW, rng, length=150.0, width=7.0, density=0.42) * sstep(deck_bot + 170.0, deck_bot, yy) * (yy > deck_top + 10)
    alb = mix(alb, alb * 0.55, (wet * 0.8)[..., None])
    col = shade(alb, h, yy, xx, TW, ambient=np.array([0.1, 0.115, 0.17]), sun=((-0.6, -0.55, 0.58), np.array([0.2, 0.225, 0.31])),
                lights=lights, k=1.2, spec=0.25, gloss=16.0, wet=np.clip(wet * 1.5 + 0.1, 0, 1))
    if round_col:
        u = dxp / hw
        col *= (1 + pm * (0.2 - 0.6 * sstep(-0.5, 0.95, u) + 0.12 * sstep(0.8, 1.0, u)))[..., None]
    else:
        col *= (1.06 - 0.3 * sstep(-hw, hw, dxp) * pm)[..., None]
    # o intradorso (a espessura do arco e do pilar): do lado direito de cada vão pega a luz fria, do
    # esquerdo fica na sombra
    de = np.where(yy < spring, AR.rd, hw - adx)
    rv = np.clip(rev - de + 0.5, 0, 1) * np.clip(de + 0.5, 0, 1) * (yy < foot - 16.0) * (yy > deck_top + 10.0)
    lit = sstep(-0.3, 0.3, dxa / r)
    col = col * (1 + rv * (-0.5 + 1.3 * lit))[..., None]
    return col, m


def cat_far(rng):
    TW, H = 3072, 1080
    yy, xx = grid(TW, H)
    horizon = 790.0
    n1 = pnoise(H, TW, 190, rng, 2, sx=2.2)
    n2 = pnoise(H, TW, 60, rng, 2, sx=3.0)
    glow = np.exp(-((yy - 600.0) / 255.0) ** 2)
    col = mix(INK, HAZE, glow[..., None])
    col = mix(col, HAZE2, (np.exp(-((yy - 630.0) / 105.0) ** 2) * 0.5 * (0.4 + 0.9 * n1))[..., None])
    col = col * (0.9 + 0.2 * n2)[..., None]

    # ---------- o chão molhado (abaixo do horizonte): lajes que somem na névoa ----------
    fy = np.clip((yy - horizon) / (H - horizon), 0, 1)
    depth = 1.0 / np.maximum(fy, 0.02)                         # longe = grande
    joint = np.abs(((depth * 1.35) % 1.0) - 0.5) * 2           # juntas deitadas, mais juntas para o horizonte
    freq = 1.35 / (np.maximum(fy, 0.02) ** 2 * (H - horizon))  # juntas por px (perto do horizonte não cabem)
    line = (1 - sstep(0.0, np.clip(3.0 * freq, 0.02, 1.0), joint)) * sstep(0.12, 0.3, fy)
    floor_c = mix(HAZE * 0.62, hexc(0x0c0e16), sstep(0.0, 0.75, fy)[..., None]) * (0.86 + 0.28 * n2)[..., None]
    floor_c = floor_c * (1 - 0.3 * line)[..., None]
    fm = sstep(horizon - 4.0, horizon + 10.0, yy)
    col = mix(col, floor_c, fm[..., None])

    # ---------- as velas: no chão (em volta dos túmulos), nos pilares da galeria e nos capitéis ----------
    floor_candles, wall_candles = [], []
    lights_b, lights_a = [], []
    for g in range(11):
        gx = rng.uniform(0, TW)
        gy = rng.uniform(horizon + 14.0, 905.0)
        for c in range(int(rng.integers(1, 4))):
            x = gx + rng.uniform(-34, 34)
            y = gy + rng.uniform(-6, 6)
            floor_candles.append((x, y))
        k = (gy - horizon) / (H - horizon)
        (lights_b if gy < 880 else lights_a).append(Light(gx, gy - 14.0, 26.0, 80.0 + 60.0 * k, CANDLE, 0.9 + 0.7 * k))
    span_b, off_b = 192.0, 96.0
    for k in rng.choice(16, 7, replace=False):
        x = off_b + k * span_b + rng.choice([-1, 1]) * 21.0
        y = rng.uniform(705.0, 770.0)
        wall_candles.append((x, y))
        lights_b.append(Light(x, y - 8.0, 14.0, 52.0, CANDLE, 1.5))

    # ---------- a galeria baixa, mais longe (some na névoa) ----------
    cb, mb = gallery(yy, xx, TW, rng, span_b, 30.0, 630.0, 480.0, 570.0, off_b, 872.0, lights_b, True, 15.0, 11, 13.0, (0.92, 0.95, 1.06), rev=3.0, joint=0.4)
    hz = mix(HAZE, HAZE2, 0.35) * (0.78 + 0.3 * n1)[..., None]
    cb = mix(cb, hz, 0.46)
    cb = mix(cb, col, (sstep(820.0, 880.0, yy) * 0.5)[..., None])            # o pé mergulha na névoa do chão
    col = mix(col, cb, mb[..., None])
    # a sombra dela no chão e o reflexo dos pilares no molhado
    # velas presas nos pilares da galeria e as do chão que ficam atrás da arcada alta
    cv = Canvas(TW, H)
    cv.col[:] = col
    cv.a[:] = 1
    for x, y in wall_candles:
        rows, cols, ly, lx = cv.win(x - 6, y - 2, 12, 8)
        brk = np.clip(1.2 - np.abs(ly - (y + 1.5)), 0, 1) * (np.abs(lx - x) < 5)
        cv.over(rows, cols, hexc(0x0c0d14), brk)
        tiny_flame(cv, x, y, rng.uniform(0.85, 1.1), rng)
    for x, y in floor_candles:
        if y < 880:
            tiny_candle(cv, x, y, rng)

    # ---------- fachos de luz fria descendo das frestas do teto, entre as duas arcadas ----------
    beams = np.zeros((H, TW), np.float32)
    for k in range(6):
        x0 = rng.uniform(0, TW)
        ang = rng.uniform(0.16, 0.3)
        w = rng.uniform(22.0, 58.0)
        d = wdx(xx - (yy - 285.0) * math.tan(ang), x0, TW) * math.cos(ang)
        b = np.exp(-(d / w) ** 2) * sstep(250.0, 420.0, yy) * sstep(930.0, 640.0, yy)
        beams += b * rng.uniform(0.5, 1.0)
    beams *= 0.75 + 0.5 * n2
    cv.col[:] = cv.col + hexc(0x8ea0c8) * (beams * 0.085)[..., None]

    # ---------- a arcada alta, mais perto ----------
    ca, ma = gallery(yy, xx, TW, rng, 256.0, 45.0, 450.0, 285.0, 375.0, 0.0, 962.0, lights_a + lights_b[:6], False, 20.0, 15, 19.0, (0.8, 0.83, 0.96), rev=5.0, joint=0.55)
    ca = mix(ca, hz, 0.2)
    # a beira esquerda de cada pilar e do arco pega a luz fria (a quina)
    cv.col[:] = mix(cv.col, ca, ma[..., None])
    # o ar frio fica na frente da pedra, mais grosso embaixo
    veil = (0.1 + 0.16 * n1) * sstep(430.0, 700.0, yy) * sstep(1010.0, 860.0, yy)
    cv.col[:] = mix(cv.col, hz, veil[..., None])
    for x, y in floor_candles:
        if y >= 880:
            tiny_candle(cv, x, y, rng)
    # o pé de tudo some no escuro (o muro de ossos fica na frente)
    cv.col[:] = mix(cv.col, INK, (sstep(900.0, 1080.0, yy) * 0.85)[..., None])
    cv.col[:] = mix(cv.col, INK, (sstep(250.0, 60.0, yy) * 0.9)[..., None])
    cv.col[:] = grain(cv.col, rng, 0.028)
    return cv


def tiny_flame(cv, x, y, s, rng):
    """Chama pequena ao longe: o halo, a gota e o miolo (y = a base da chama)."""
    rows, cols, ly, lx = cv.win(x - 60, y - 70, 120, 120)
    dx, dy = lx - x, ly - y
    for r, k in ((44.0 * s, 0.05), (20.0 * s, 0.11), (8.0 * s, 0.3)):
        cv.add(rows, cols, WARM0 * 0.9, np.exp(-(np.hypot(dx, dy + 5.0 * s) / r) ** 2) * k)
    t = np.clip(-dy / (9.5 * s), 0, 1)
    body = np.clip(2.2 * s * (1 - t) ** 0.7 * sstep(-0.15, 0.15, t) - np.abs(dx) + 0.5, 0, 1) * (dy < 1.5) * (dy > -9.5 * s)
    cv.over(rows, cols, mix(WARM1, WARM0, t[..., None] * 0.6), body * 0.95)
    core = np.clip(1.2 * s * (1 - np.clip(-dy / (5.5 * s), 0, 1)) - np.abs(dx) + 0.4, 0, 1) * (dy < 1.0) * (dy > -5.5 * s)
    cv.over(rows, cols, WARM2, core * 0.95)


def tiny_candle(cv, x, y, rng):
    """Vela no chão do salão, ao longe: o toco, a chama e o reflexo no chão molhado."""
    s = rng.uniform(0.8, 1.15)
    hgt = rng.uniform(5.0, 12.0)
    rows, cols, ly, lx = cv.win(x - 8, y - hgt - 2, 16, hgt + 44)
    dx = lx - x
    body = np.clip(1.8 - np.abs(dx) + 0.5, 0, 1) * np.clip(ly - (y - hgt) + 0.5, 0, 1) * np.clip(y - ly + 0.5, 0, 1)
    cv.over(rows, cols, mix(hexc(0x54462e), hexc(0xb89a66), sstep(y, y - hgt, ly)[..., None]), body * 0.95)
    # o reflexo: um risco quente embaixo, tremido
    refl = np.exp(-(dx / 2.4) ** 2) * sstep(y, y + 3.0, ly) * sstep(y + 40.0, y + 4.0, ly) * (0.6 + 0.4 * np.sin(ly * 1.7 + x))
    cv.add(rows, cols, WARM0, refl * 0.22)
    tiny_flame(cv, x, y - hgt, s, rng)


# ======================================================================================
if __name__ == '__main__':
    if want('cat-far'):
        save(cat_far(np.random.default_rng(141)), 'cat-far')
    if want('cat-mid'):
        save(cat_mid(np.random.default_rng(142)), 'cat-mid')
    if PREVIEW:
        preview(PREVIEW, 'cat', [('cat-far', 0.15), ('cat-mid', 0.4)], bg=(7, 8, 13))

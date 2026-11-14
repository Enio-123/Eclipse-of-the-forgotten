"""Fundos da Catedral por dentro para o ECLIPSE: os mesmos de fundos_cidade.py (nave_far e nave_mid, o
mesmo desenho e as mesmas medidas no mundo), repintados em 3x com relevo de verdade.

Camadas (tamanho no mundo; as imagens têm o triplo):
  nave-far  1024x400  a parede do fundo: a arcada para a nave lateral com as arquivoltas, os feixes de
                      colunetas subindo até a abóbada, o trifório, os vitrais do clerestório com a
                      traceria de pedra e o chumbo dos vidros
  nave-mid  1024x420  os pilares de perto (tambores, colunetas, capitel de folhas, base), os estandartes
                      bordados, os lustres de ferro e os castiçais

As medidas no código são as do pintor antigo (px da pintura 2x); cada uma vira 1,5 px da imagem.

uso: python3 ecl_nave.py <pasta_saida> [camada ...] [--preview=<pasta>] [--old=<pasta com os png em 2x>]
"""
import math
import numpy as np
from scipy import ndimage as ndi
from brush import hexc, mix, sstep, value_noise
from shapes import Mask
from pedra3 import Blocks, Light, shade, cracks, grain, cyl, grid, pnoise, wdx, wblur, TAU
from ecl_comum import Canvas, save, preview, want, put_win, flame, PREVIEW
from ecl_cidade import AMBN, SKYN, WIN0, WIN1, WIN2, GOLD1, GOLD2, GOLD3
from cidade_plano import nave_plan

K = 1.5
GLASS = [hexc(0x2a4e9a), hexc(0x9c2a2c), hexc(0xc99a3a), hexc(0x2f7a4a), hexc(0x5a3a8a), hexc(0x3a64b0)]
DARK = hexc(0x07080d)


def aa(d):
    """Alfa suave de uma distância para dentro (nas unidades do plano)."""
    return np.clip(d * K + 0.5, 0, 1)


def band(v, a, b):
    """1 entre a e b (unidades do plano), com a beira suave."""
    return aa(v - a) * aa(b - v)


def lin(x, y, w, apex, bottom, k=0.75):
    """Distância para dentro de um vão gótico de largura w com o eixo em x = 0 (arco quebrado do ápice até
    a nascente, ombreiras retas dali até bottom). Sem a costura na linha da nascente que lancet_d tem:
    serve para faixas que acompanham a beira (molduras, cercaduras). Devolve também a nascente."""
    r = k * w
    off = r - w / 2
    spring = apex + math.sqrt(max(r * r - off * off, 1.0))
    ax = np.abs(x)
    d = np.where(y <= spring, r - np.hypot(ax + off, y - spring), w / 2 - ax)
    return np.minimum(d, bottom - y), spring


def hash2(a, b, seed=0):
    """Um sorteio 0..1 por par de inteiros (o mesmo sempre)."""
    k = (a.astype(np.int64) * 73856093) ^ (b.astype(np.int64) * 19349663) ^ (seed * 83492791)
    k = (k ^ (k >> 13)) * 1274126177
    return ((k ^ (k >> 16)) & 0xffff).astype(np.float32) / 65535.0


def glass(u, v, d_in, top, base_col, seed, lum, medals=(), pane=10.0, edge=5.0, tint=0.3):
    """Vitral de uma luz (u = distância ao eixo dela, v = altura, d_in = distância para dentro do vão):
    quadros de vidro soprado presos no chumbo, uma cercadura de vidros pequenos em volta e medalhões.
    Devolve a cor (o vidro já aceso pelo dia que falta lá fora: mais claro no meio)."""
    pal = np.array(GLASS, np.float32)
    # os quadros
    ia = np.floor(u / pane)
    ib = np.floor((v - top) / pane)
    r0 = hash2(ia, ib, seed)
    r1 = hash2(ia, ib, seed + 7)
    r2 = hash2(ia, ib, seed + 13)
    pick = pal[(r0 * 997).astype(np.int64) % len(GLASS)]
    c = mix(base_col, pick * 1.2, (tint * (0.75 + 0.6 * r1))[..., None])
    fa = u / pane - ia
    fb = (v - top) / pane - ib
    # vidro soprado: cada quadro mais grosso de um lado, com um risco de bolha
    c = c * (0.86 + 0.3 * r2 + (fa - 0.5) * (r1 - 0.5) * 0.5 + (fb - 0.5) * (r0 - 0.5) * 0.5)[..., None]
    lead = np.minimum(np.minimum(fa, 1 - fa), np.minimum(fb, 1 - fb)) * pane
    lead_a = 1 - aa(lead - 0.55)
    # a cercadura: vidros pequenos alternando rubi, azul e ouro ao longo da beira
    s = np.floor((v * 0.92 + np.abs(u) * 0.55) / 6.5)
    bc = pal[np.array([1, 0, 2, 5], np.int64)[(s.astype(np.int64)) % 4]] * 1.15
    fs = (v * 0.92 + np.abs(u) * 0.55) / 6.5 - s
    in_edge = aa(edge - d_in)
    bc = mix(base_col, bc, 0.62)
    c = mix(c, bc * (0.8 + 0.4 * hash2(s, np.sign(u), seed + 3))[..., None], in_edge[..., None])
    lead_a = np.maximum(lead_a * (1 - in_edge), in_edge * (1 - aa(np.minimum(fs, 1 - fs) * 6.5 - 0.5)))
    lead_a = np.maximum(lead_a, 1 - aa(np.abs(d_in - edge) - 0.6))
    # medalhões: roseta de seis pétalas num aro de ouro
    for (mu, mv, R) in medals:
        du, dv = u - mu, v - mv
        rr = np.hypot(du, dv)
        m = aa(R - rr)
        ang = np.arctan2(dv, du)
        pet = np.cos(ang * 3.0) ** 2
        ins = mix(pal[0] * 1.25, pal[1] * 1.3, sstep(0.35, 0.65, pet)[..., None])
        ins = mix(ins, pal[2] * 1.5, aa(R * 0.28 - rr)[..., None])
        ins = mix(ins, pal[2] * 1.35, band(rr, R - 2.6, R)[..., None])
        ins = mix(base_col, ins, 0.7)
        c = mix(c, ins, m[..., None])
        ml = np.maximum(1 - aa(np.abs(rr - (R - 2.6)) - 0.5), 1 - aa(np.abs(rr - R * 0.28) - 0.45))
        ml = np.maximum(ml, (1 - aa(np.abs(np.sin(ang * 3.0)) * rr - 0.45)) * (rr > R * 0.28) * (rr < R - 2.6))
        lead_a = np.maximum(lead_a * (1 - m), np.maximum(ml * m, 1 - aa(np.abs(rr - R) - 0.6)))
    # mais claro no meio da janela, como o pintor antigo
    c = c * (0.5 + 0.7 * lum)[..., None]
    c = mix(c, c * 0.32, lead_a[..., None])
    return np.clip(c, 0, 1.4)


# ======================================================================================
# A parede do fundo
# ======================================================================================
def nave_far(rng):
    TW, H = 3072, 1200
    yy, xx = grid(TW, H)
    X, Y = xx / K, yy / K
    bay, floor = 256.0, 620.0
    bi = np.floor(X / bay)
    dxc = X - (bi + 0.5) * bay                 # até o meio do vão
    dxp = (X + bay / 2) % bay - bay / 2        # até o eixo do pilar mais perto
    cellp = np.floor((X + bay / 2) / bay)

    # ---------- a cor de base do pintor antigo (a mesma mancha grande) ----------
    old = np.random.default_rng(64)
    tex = ndi.zoom(pnoise(800, 2048, 22, old, 3), K, order=1)[:H, :TW]
    t = Y / 800.0
    base = mix(hexc(0x080a12), hexc(0x161b2b), sstep(0.0, 0.5, t)[..., None])
    base = mix(base, hexc(0x121521), sstep(0.6, 1.0, t)[..., None])
    base = base * (0.92 + 0.16 * tex)[..., None]
    glow_c = np.exp(-(np.hypot(dxc / 110, (Y - 96) / 120)) ** 2) * 0.8
    glow_a = np.exp(-(np.hypot(dxc / 70, (Y - 450) / 130)) ** 2) * 0.55
    glow = np.maximum(glow_c, glow_a)

    # ---------- os vãos ----------
    AW = bay - 52
    d_arc, spring = lin(dxc, Y, AW, 284.0, 900.0)
    r_arc = 0.75 * AW
    off_arc = r_arc - AW / 2
    d_awin, _ = lin(dxc, Y, 50.0, 352.0, 540.0, 0.8)
    kt = np.clip(np.round((dxc + 66.0) / 44.0), 0, 3)
    dxt = dxc - (-66.0 + 44.0 * kt)
    d_tri, tri_spring = lin(dxt, Y, 26.0, 196.0, 252.0, 0.8)
    d_cl, _ = lin(dxc, Y, 98.0, 24.0, 168.0, 0.72)

    # ---------- a cantaria ----------
    B = Blocks(yy, xx, TW, 39.0, 104.0, rng, vary=0.3)
    face = B.face(1.3, 2.2)
    h = B.height(depth=1.5, jut=0.55, tilt=0.5, mortar=1.3, bevel=2.2)
    pit = pnoise(H, TW, 4.0, rng, 2)
    h += (pit - 0.5) * 0.9 * face
    det = (0.93 + 0.14 * B.r(3)) * (0.95 + 0.1 * pit) * (1 - 0.2 * (1 - face))
    cr = cracks(H, TW, rng, n=14, length=(50, 160), width=1.0)
    h -= cr * 1.2
    det = det * (1 - 0.35 * cr)

    def raise_(m, hh, d=None):
        """Põe uma peça em relevo por cima da parede (m = máscara, hh = altura em px da imagem)."""
        nonlocal h, det
        h = h * (1 - m) + hh * m
        if d is not None:
            det = det * (1 - m) + d * m

    shadow = np.ones((H, TW), np.float32)

    # ---------- a arcada: três arquivoltas em toro, com as juntas das aduelas ----------
    e = -d_arc                                   # para fora do vão
    up = aa(spring - Y)
    th = np.arctan2(np.maximum(spring - Y, 0.0), np.abs(dxc) + off_arc)
    tha = math.acos(off_arc / r_arc)
    ta = np.clip(th / tha, 0, 1) * 9.0
    dj = np.abs(ta - np.round(ta)) * (tha * (r_arc + 10.0) / 9.0)
    joint = (1 - aa(dj - 0.5)) * (np.abs(ta - 9.0) > 0.3)
    arch_h = 3.0 + 6.5 * cyl((e - 3.4) / 3.4) + 5.0 * cyl((e - 10.2) / 3.4) + 3.6 * cyl((e - 16.6) / 3.0)
    arch_h -= joint * 1.3
    am = band(e, 0.0, 20.0) * up
    rk = hash2(np.round(ta), bi * 2 + (dxc > 0), 5)
    raise_(am, arch_h, (0.96 + 0.12 * rk) * (1 - 0.3 * joint) * (0.96 + 0.08 * pit))
    # a sombra fina que a arquivolta de fora faz na parede
    shadow *= 1 - 0.3 * band(e, 20.0, 27.0) * up * sstep(27.0, 20.0, e)

    # ---------- as faixas de pedra: o peitoril do trifório e o do clerestório ----------
    for y0, y1, proud in ((257.0, 264.0, 6.5), (170.5, 177.0, 5.5)):
        sm = band(Y, y0, y1)
        prof = cyl((Y - (y0 + y1) / 2) / ((y1 - y0) / 2)) * proud + 1.5
        raise_(sm, prof, 1.04 * (0.96 + 0.08 * pit))
        shadow *= 1 - 0.3 * sstep(y1 + 9.0, y1, Y) * (Y > y1)

    # ---------- o trifório: molduras dos arquinhos e as colunetas entre eles ----------
    et = -d_tri
    tm = band(et, 0.0, 3.4) * aa(tri_spring + 1.0 - Y)
    raise_(tm, 2.0 + 3.6 * cyl((et - 1.7) / 1.7), 1.03)
    for xc in (-88.0, -44.0, 0.0, 44.0, 88.0):
        du = dxc - xc
        cm = aa(4.2 - np.abs(du)) * band(Y, tri_spring - 2.0, 256.0)
        ch = 2.0 + 6.2 * cyl(du / 4.2)
        # capitel e base da coluneta
        capm = aa(6.0 - np.abs(du)) * band(Y, tri_spring - 4.5, tri_spring + 2.5)
        basm = aa(5.6 - np.abs(du)) * band(Y, 250.5, 256.5)
        raise_(cm, ch, 1.05)
        raise_(np.maximum(capm, basm), 7.6 * np.ones_like(h), 1.08)

    # ---------- os pilares: o feixe de quatro colunetas que sobe até a abóbada ----------
    centers = (-15.4, -5.13, 5.13, 15.4)
    roll = np.zeros((H, TW), np.float32)
    for c in centers:
        roll = np.maximum(roll, cyl((dxp - c) / 5.3))
    pm = aa(20.5 - np.abs(dxp))
    ph = 5.0 + 8.0 * roll + 4.0 * cyl(dxp / 21.0)
    PB = Blocks(yy, xx, TW, 78.0, 400.0, rng, vary=0.0, stagger=0.0)
    drum = sstep(0.6, 2.0, PB.dv)
    ph -= (1 - drum) * 1.1
    pdet = (0.97 + 0.1 * PB.r(3)) * (1 - 0.22 * (1 - drum)) * (0.96 + 0.08 * pit)
    # abaixo do capitel da arcada o pilar é mais largo: a ombreira lisa até a beira do vão
    wide = aa(26.5 - np.abs(dxp)) * aa(Y - spring)
    raise_(wide, 3.2 * np.ones_like(h), 1.0 * (0.96 + 0.08 * pit))
    raise_(pm, ph, pdet)
    shadow *= 1 - 0.3 * sstep(20.5 + 14.0, 20.5, dxp) * (dxp > 20.5) * (1 - wide * 0.5)
    # o capitel da arcada: o cesto que abre, as folhas e o ábaco
    ky = (Y - 412.0) / 16.0
    capw = 30.5 - 8.5 * np.clip(ky, 0, 1) ** 1.4
    capm = aa(capw - np.abs(dxp)) * band(Y, 411.0, 428.5)
    leaf = (0.5 + 0.5 * np.cos((dxp + 4.0 * np.floor(ky * 2.0)) * (TAU / 8.0))) * band(Y, 417.0, 427.0)
    caph = 13.0 + 3.0 * (1 - np.clip(ky, 0, 1)) + 3.4 * leaf * sstep(0.0, 0.5, ky) - 2.0 * band(Y, 416.2, 417.4)
    raise_(capm, caph, 1.12 * (0.96 + 0.08 * pit))
    shadow *= 1 - 0.5 * sstep(428.5 + 12.0, 428.5, Y) * (Y > 428.5) * aa(27.0 - np.abs(dxp))
    # o anel no nível do clerestório
    rm = aa(26.5 - np.abs(dxp)) * band(Y, 177.5, 188.5)
    rh = 9.0 + 3.2 * cyl((Y - 180.2) / 2.8) + 5.0 * cyl((Y - 185.3) / 3.3)
    raise_(rm, rh, 1.08)
    shadow *= 1 - 0.45 * sstep(188.5 + 9.0, 188.5, Y) * (Y > 188.5) * aa(23.0 - np.abs(dxp))

    # ---------- o arranque da abóbada: as nervuras abrindo de cada pilar ----------
    rv = np.hypot(dxp, Y + 120.0)
    rib = band(rv, 146.5, 153.5) * aa(44.0 - Y)
    raise_(rib * (1 - pm), 3.0 + 5.0 * cyl((rv - 150.0) / 3.5), 1.0)
    web = aa(150.0 - rv) * aa(44.0 - Y)

    # ---------- o chanfro dos vãos do clerestório ----------
    ec = -d_cl
    spl = band(ec, 0.0, 6.5)
    raise_(spl, -6.5 + ec * 1.0 + 0.0 * h, 1.02)

    # ---------- a luz ----------
    lights = []
    for i in range(int(TW / K / bay) + 1):
        cx = (i + 0.5) * bay * K
        lights.append(Light(cx, 96.0 * K, 55.0, 150.0, np.array([0.55, 0.68, 1.0], np.float32), 0.55))
        lights.append(Light(cx, 450.0 * K, 60.0, 120.0, np.array([0.5, 0.62, 0.95], np.float32), 0.28))
    lit = shade(np.ones((H, TW, 3), np.float32), h, yy, xx, TW, ambient=AMBN, sun=SKYN, lights=lights, k=1.0)
    col = base * det[..., None] * lit * shadow[..., None]
    # as colunetas guardam o tom do pintor antigo (não escurecem com a parede lá no alto) e a beira fria
    shaft = mix(hexc(0x1a1f30), hexc(0x0d1018), sstep(-20.0, 20.0, dxp)[..., None]) * 1.14
    shaft = shaft * det[..., None] * lit * (0.92 + 0.16 * tex)[..., None]
    shaft = mix(shaft, hexc(0x4a5a84), (sstep(-14.0, -20.0, dxp) * 0.45)[..., None])
    col = mix(col, shaft, (pm * (1 - capm) * (1 - rm))[..., None])
    capc = hexc(0x262c40) * det[..., None] * lit * 1.05
    col = mix(col, capc, capm[..., None])
    col = mix(col, hexc(0x20263a) * det[..., None] * lit * 1.05, rm[..., None])
    # a abóbada some no escuro acima das nervuras
    col = mix(col, hexc(0x06070c), (web * 0.55 * (1 - pm))[..., None])
    # névoa fria em volta das janelas
    col = mix(col, hexc(0x3a4a72), (glow * 0.35)[..., None])

    # ---------- a nave lateral atrás da arcada ----------
    aisle = mix(hexc(0x05060b), hexc(0x10141f), sstep(300.0, 600.0, Y)[..., None])
    AB = Blocks(yy, xx, TW, 33.0, 90.0, rng, vary=0.3)
    aisle = aisle * (0.9 + 0.2 * AB.r(3) * AB.face(1.2, 1.8) - 0.12 * (1 - AB.face(1.2, 1.8)))[..., None]
    # a parede de trás recebe a luz do vitral dela (mais perto dele, mais clara) e a moldura dele em volta
    aisle = mix(aisle, hexc(0x2a3656), (glow * 0.45)[..., None])
    ew = -d_awin
    aisle = mix(aisle, hexc(0x3b4a72), (band(ew, 0.0, 4.0) * 0.5)[..., None])
    aisle = mix(aisle, hexc(0x04050a), (band(ew, 4.0, 7.0) * 0.45)[..., None])
    # a nervura da abóbada da nave lateral, um arco quebrado por cima do vitral
    d_rib, _ = lin(dxc, Y, 150.0, 316.0, 900.0)
    aisle = mix(aisle, hexc(0x1a2238), (band(-d_rib, 0.0, 4.5) * aa(470.0 - Y) * 0.55)[..., None])
    aisle = mix(aisle, hexc(0x030408), (aa(-d_rib - 4.5) * 0.4)[..., None])
    # a espessura da parede: a face de dentro do arco, em sombra, com um fio de luz fria na quina
    soff = band(d_arc, 0.0, 9.0)
    sc = mix(hexc(0x0b0e18), hexc(0x1b2236), sstep(0.0, 9.0, d_arc)[..., None]) * (0.9 + 0.2 * pit)[..., None]
    sc = mix(sc, hexc(0x2f3b5c), (glow_a * 0.8)[..., None])
    aisle = mix(aisle, sc, (soff * (0.55 + 0.45 * up))[..., None])
    aisle = mix(aisle, hexc(0x3d4b72), (band(d_arc, 8.2, 9.6) * 0.4 * up)[..., None])
    col = mix(col, aisle, aa(d_arc)[..., None])
    # o vitral da nave lateral (a 70%, como antes: o escuro da nave na frente dele)
    lum_a = np.clip(1 - np.abs(dxc) / (50.0 * 0.65), 0, 1) * np.clip(1 - np.abs((Y - 446.0) / (188.0 * 0.7)), 0, 1)
    gw = glass(dxc, Y, d_awin, 352.0, hexc(0x4e68a0), 21, lum_a, medals=((0.0, 412.0, 13.0), (0.0, 482.0, 13.0)))
    col = mix(col, gw * np.array([0.86, 0.95, 1.0], np.float32), (aa(d_awin) * 0.7)[..., None])

    # ---------- o trifório: os vãos escuros ----------
    tri_in = mix(hexc(0x05060b), hexc(0x0d111c), sstep(196.0, 252.0, Y)[..., None])
    col = mix(col, tri_in, (aa(d_tri) * 0.88)[..., None])
    col = mix(col, hexc(0x2c3856), (band(d_tri, 0.0, 1.6) * 0.35 * (dxt > 0))[..., None])

    # ---------- o vitral do clerestório: duas luzes, o óculo e a traceria fina de pedra ----------
    lum_c = np.clip(1 - np.abs(dxc) / (98.0 * 0.65), 0, 1) * np.clip(1 - np.abs((Y - 96.0) / (144.0 * 0.7)), 0, 1)
    us = np.abs(dxc) - 25.5
    d_sub, _ = lin(us, Y, 44.6, 84.0, 166.0, 0.8)
    ro = np.hypot(dxc, Y - 62.0)
    d_oc = 15.6 - ro
    d_sp = np.minimum(np.minimum(d_cl - 2.2, -d_sub - 2.6), ro - 18.2)
    d_glass = np.maximum(np.maximum(d_sub, d_oc), d_sp)
    g1 = glass(us, Y, d_sub, 24.0, hexc(0x6f8ccc), 3, lum_c, medals=((0.0, 128.0, 11.5),))
    # o óculo: uma roseta de oito pétalas, rubi e azul, em volta de um miolo de ouro
    ang = np.arctan2(Y - 62.0, dxc)
    gq = mix(hexc(0x3a64b0) * 1.3, hexc(0x9c2a2c) * 1.3, sstep(0.35, 0.65, np.cos(ang * 4.0) ** 2)[..., None])
    gq = mix(hexc(0x6f8ccc), gq, 0.6)
    gq = mix(gq, hexc(0xc99a3a) * 1.5, aa(4.2 - ro)[..., None])
    lead_q = np.maximum(1 - aa(np.abs(ro - 4.2) - 0.45), (1 - aa(np.abs(np.sin(ang * 4.0)) * ro - 0.45)) * (ro > 4.2))
    lead_q = np.maximum(lead_q, 1 - aa(np.abs(ro - 12.2) - 0.45))
    gq = gq * (0.5 + 0.7 * lum_c)[..., None]
    gq = mix(gq, gq * 0.32, lead_q[..., None])
    # os cantos entre as luzes e o óculo: vidrinhos azuis
    gs = glass(dxc, Y, d_sp, 24.0, hexc(0x5f7cc0), 9, lum_c, pane=6.5, edge=0.0, tint=0.2)
    gcol = np.where((d_sub >= np.maximum(d_oc, d_sp))[..., None], g1, np.where((d_oc >= d_sp)[..., None], gq, gs))
    gcol = gcol * np.array([1.0, 1.07, 1.08], np.float32)
    stone = hexc(0x0b0d16) * (0.9 + 0.3 * pit)[..., None]
    win = mix(stone, gcol, aa(d_glass)[..., None])
    # a pedra da traceria pega a luz do vidro na beira
    edge_l = band(-d_glass, 0.0, 1.0) * aa(d_cl - 0.5)
    win = mix(win, hexc(0x5a70a8), (edge_l * 0.5)[..., None])
    col = mix(col, win, aa(d_cl)[..., None])
    # o chanfro em volta: a luz do vitral bate nele
    col = mix(col, hexc(0x55699c), (spl * 0.28 * sstep(6.5, 0.0, ec))[..., None])

    # ---------- embaixo some no escuro; os fachos dos vitrais altos ----------
    col = mix(col, DARK, (sstep(floor - 60.0, floor + 150.0, Y) * 0.94)[..., None])
    u = dxc + (Y - 100.0) * 0.42
    ub = (u + bay / 2) % bay - bay / 2
    dust = 0.75 + 0.5 * pnoise(H, TW, 60, rng, 2, sx=0.5)
    beams = np.exp(-(ub / 34.0) ** 2) * sstep(90.0, 160.0, Y) * sstep(640.0, 300.0, Y) * dust
    col = col + hexc(0x6a82c0) * (beams * 0.12)[..., None]
    col = grain(col, rng, 0.03)

    cv = Canvas(TW, H)
    cv.col[:] = np.clip(col, 0, 1)
    cv.a[:] = 1
    return cv


# ======================================================================================
# Os pilares de perto, os estandartes, os lustres e os castiçais
# ======================================================================================
IRON = hexc(0x08090e)
WAX = hexc(0xb9ab90)


def pwin(cv, x0, y0, w, h):
    """Janela em unidades do plano: (rows, cols, Y, X do plano, ly, lx da imagem)."""
    rows, cols, ly, lx = cv.win(x0 * K, y0 * K, w * K, h * K)
    return rows, cols, ly / K, lx / K, ly, lx


def lit_flat(hd, ly, lx, lights=()):
    """Luz de uma peça com relevo hd (px da imagem), 1,0 onde ela é lisa: a fria de cima e da esquerda
    e as velas por perto."""
    return shade(np.ones(hd.shape + (3,), np.float32), hd, ly, lx, 1, ambient=AMBN, sun=SKYN, lights=lights, wrap=False)


def candle(cv, x, y, hgt=10.0, wid=4.0, s=0.2):
    """Uma vela de pé com a base em (x, y) do plano: o corpo de cera com um escorrido, o pavio e a chama."""
    rows, cols, Y, X, ly, lx = pwin(cv, x - 6, y - hgt - 4, 12, hgt + 6)
    u = (X - x) / (wid / 2)
    body = aa(wid / 2 - np.abs(X - x)) * band(Y, y - hgt, y + 0.3)
    c = WAX * (0.62 + 0.5 * np.clip(1 - (u + 0.35) ** 2, 0, 1))[..., None]
    # a cera quente perto da chama e o escorrido de um lado
    c = mix(c, WIN2 * 0.95, (sstep(y - hgt + 4.0, y - hgt, Y) * 0.6)[..., None])
    drip = aa(0.9 - np.abs(X - x - wid * 0.32)) * band(Y, y - hgt, y - hgt * 0.45)
    c = mix(c, WAX * 1.15, (drip * 0.6)[..., None])
    cv.over(rows, cols, np.clip(c, 0, 1), body)
    wick = aa(0.45 - np.abs(X - x)) * band(Y, y - hgt - 1.8, y - hgt + 0.3)
    cv.over(rows, cols, hexc(0x1a1210), wick)
    flame(cv, x * K, (y - hgt - 1.0) * K, s, air=True)


def air_glow(cv, x, y, radii, col=WIN0):
    """Luz quente no ar em volta de um ponto (some aos poucos: sem quadrado em volta)."""
    R = max(r for r, _ in radii) * 2.3
    rows, cols, Y, X, ly, lx = pwin(cv, x - R, y - R, 2 * R, 2 * R)
    d = np.hypot(X - x, Y - y)
    fade = np.clip(1 - (d / R) ** 2, 0, 1) ** 2
    for r, k in radii:
        cv.over(rows, cols, col, np.exp(-(d / r) ** 2) * k * fade)


def pillar(cv, cx, tex, stands, rng):
    floor, cap_y, pw = 660.0, 236.0, 118.0
    rows, cols, Y, X, ly, lx = pwin(cv, cx - 112, 0, 224, 840)
    k = X - cx
    ak = np.abs(k)
    # o contorno do pintor antigo: fuste, capitel que abre, a base em dois degraus
    capt = np.clip((Y - cap_y) / 30.0, 0, 1)
    hw = np.full_like(Y, 73.0)
    hw = np.where((Y >= cap_y) & (Y < cap_y + 30), 89.0 - 14.0 * capt, hw)
    hw = np.where((Y >= floor - 74) & (Y < floor - 54), 77.0, hw)
    hw = np.where(Y >= floor - 54, 85.0, hw)
    a = aa(hw - ak)
    in_cap = band(Y, cap_y, cap_y + 30.0)
    in_base = aa(Y - (floor - 74.0))
    shaft = (1 - in_cap) * (1 - in_base)

    # ---------- o relevo ----------
    roll = cyl((((k + 10.0) % 20.0) - 10.0) / 10.3) * aa(59.0 - ak)
    side = cyl((ak - 66.0) / 7.3) * aa(ak - 58.5)
    hd = (10.0 * roll + 9.0 * side) * shaft
    # as juntas dos tambores
    seg = (Y - (cap_y + 30.0)) / 62.0
    jy = np.abs(seg - np.round(seg)) * 62.0
    joint = (1 - aa(jy - 0.5)) * shaft
    hd -= joint * 1.4
    drum = hash2(np.floor(seg + 0.5), np.full_like(seg, cx), 11)
    det = (0.95 + 0.1 * drum) * (1 - 0.3 * joint)
    # trincas e lascas nas quinas
    chip = sstep(0.7, 0.9, tex) * shaft
    hd -= chip * 1.2
    # o capitel: ábaco, o cesto com duas fiadas de folhas e o colarinho
    aba = band(Y, cap_y, cap_y + 7.5)
    hc = 10.0 * aba + 3.5 * cyl((Y - (cap_y + 9.2)) / 2.0)
    bell = band(Y, cap_y + 9.5, cap_y + 26.5)
    hc += bell * (7.0 * np.clip(1 - (Y - cap_y - 9.5) / 17.0, 0, 1) ** 1.6)
    for row, yc, offs in ((0, cap_y + 15.0, 0.0), (1, cap_y + 22.5, 11.0)):
        kc = np.round((k - offs) / 22.0) * 22.0 + offs
        lu = (k - kc)
        lv = (Y - yc)
        leafm = np.exp(-(lu / 7.0) ** 2 - (lv / 4.6) ** 2)
        curl = np.exp(-(lu / 3.2) ** 2 - ((lv + 4.4) / 2.2) ** 2)
        vein = np.exp(-(lu / 0.9) ** 2) * leafm
        hc += bell * (5.0 * leafm + 3.6 * curl - 1.0 * vein)
    hc += 4.5 * cyl((Y - (cap_y + 28.2)) / 2.4)
    hd = hd * (1 - in_cap) + hc * in_cap
    det = det * (1 + 0.2 * in_cap)
    # a base: toro, escócia, toro e o plinto
    yb = Y - (floor - 74.0)
    hb = 5.5 * cyl((yb - 4.0) / 4.2) - 2.2 * cyl((yb - 10.5) / 3.0) + 7.5 * cyl((yb - 16.5) / 4.4)
    plinth = aa(yb - 21.0)
    # o plinto: dois blocos grandes por fiada, com a quina de cima chanfrada e as juntas
    py = (yb - 21.0) / 46.0
    prow = np.floor(py)
    pjy = np.abs(py - np.round(py)) * 46.0
    pxo = k + 85.0 + np.where(prow % 2 > 0.5, 42.0, 0.0)
    pjx = np.abs(pxo / 85.0 - np.round(pxo / 85.0)) * 85.0
    pj = np.maximum(1 - aa(pjy - 0.6), (1 - aa(pjx - 0.6)) * (pjy > 1.0)) * plinth * aa(yb - 24.0)
    hb = hb * (1 - plinth) + 9.0 * plinth - 3.0 * band(yb, 20.5, 23.0) - 1.5 * pj
    det = det * (1 - 0.3 * pj) * (1 + plinth * (hash2(prow, np.round(pxo / 85.0), 17) - 0.5) * 0.14)
    hd = hd * (1 - in_base) + hb * in_base

    # ---------- a luz ----------
    lights = []
    for sx, sh in stands:
        dx = ((sx - cx + 1024.0) % 2048.0) - 1024.0
        if abs(dx) < 260:
            lights.append(Light((cx + dx) * K, (floor - sh - 16.0) * K, 34.0, 95.0, WIN1 * np.array([1.0, 0.86, 0.7], np.float32), 0.75))
    lit = lit_flat(hd * a, ly, lx, lights)
    # o cilindro do pintor antigo: luz fria na esquerda, escuro na direita, quente embaixo
    sh = np.clip(k / 73.0, -1, 1)
    base = mix(hexc(0x1d2234), hexc(0x0b0d15), sstep(-0.6, 0.9, sh)[..., None])
    base = mix(base, hexc(0x55669a), (sstep(-0.62, -0.95, sh) * 0.55)[..., None])
    base = mix(base, hexc(0x4a3220), (sstep(floor - 200.0, floor - 40.0, Y) * sstep(0.2, 0.9, np.abs(sh)) * 0.35)[..., None])
    gain = 1.11 * shaft + 1.05 * in_cap * (1 - in_base) + 1.06 * in_base
    col = base * (0.9 + 0.2 * tex)[..., None] * (det * gain)[..., None] * lit
    # as beiradas que pegam a luz de cima: o topo do ábaco e os degraus da base
    ledge = np.maximum(band(Y, cap_y, cap_y + 1.6) * aa(ak - 73.0), band(yb, 20.0, 22.0) * aa(ak - 77.0))
    ledge = np.maximum(ledge, band(yb, 0.0, 1.6) * aa(ak - 73.0))
    col = mix(col, col * 1.9 + hexc(0x0c1020), (ledge * 0.55)[..., None])
    cv.over(rows, cols, np.clip(col, 0, 1), a)


def banner(cv, gx, bot, rng):
    w, top = 58.0, 40.0
    rows, cols, Y, X, ly, lx = pwin(cv, gx - 62, 0, 124, bot + 16)
    u = X - gx
    au = np.abs(u)
    # a barra e as cordas (atrás do pano)
    rod = aa(2.0 - np.abs(Y - (top - 2.0))) * aa(w / 2 + 10.0 - au)
    knob = aa(3.6 - np.hypot(au - (w / 2 + 11.5), Y - (top - 2.0)))
    t = np.clip(Y / (top - 2.0), 0, 1)
    cord = aa(0.75 - np.abs(au - (w / 2 + 6.0) * t)) * aa(top - 2.0 - Y)
    iron = np.maximum(np.maximum(rod, knob), cord)
    ic = np.broadcast_to(hexc(0x090a10), Y.shape + (3,)).copy()
    ic = mix(ic, hexc(0x4b5878), (aa(0.9 - np.abs(Y - (top - 3.6))) * rod * 0.8)[..., None])
    ic = mix(ic, hexc(0x4b5878), (aa(1.3 - np.hypot(au - (w / 2 + 10.6), Y - (top - 3.2))) * 0.8)[..., None])
    cv.over(rows, cols, ic, iron)
    # o pano: rabo de andorinha, três dobras que abrem para baixo
    yb = bot - 34.0 * (1 - au / (w / 2))
    cloth = aa(w / 2 - au) * aa(Y - top) * aa(yb - Y)
    down = sstep(top, bot, Y)
    ph = u / w * math.pi * 3.0
    sway = 0.9 * np.sin(Y / 46.0 + gx) * down
    fold = np.sin(ph + sway)
    hd = (2.6 + 3.4 * down) * fold + 1.2 * np.sin(Y / 17.0 + u / 9.0) * down
    # a bainha de cima franzida na barra
    hd += 1.6 * np.sin(u * 1.9) * sstep(top + 14.0, top, Y)
    c = mix(hexc(0x3a0f18), hexc(0x6a1c26), (0.5 + 0.28 * fold)[..., None])
    c = c * (1.0 - 0.35 * down)[..., None]
    # a trama do tecido
    weave = 0.5 + 0.5 * np.sin((lx + ly) * 2.1) * np.sin((lx - ly) * 2.1)
    c = c * (0.94 + 0.1 * weave)[..., None]
    # a orla de ouro bordada (em relevo), com um fio fino por dentro
    ybi = bot - 40.0 + (31.0 / 24.0) * au
    inner = aa(w / 2 - 5.0 - au) * aa(Y - top - 6.0) * aa(ybi - Y)
    trim = np.clip(cloth - inner, 0, 1)
    stitch = 0.5 + 0.5 * np.sin((lx * 0.9 + ly * 0.9) * 1.3)
    gold = GOLD1 * 0.85 * (0.78 + 0.4 * stitch)[..., None]
    c = mix(c, gold, trim[..., None])
    hd += trim * 1.3
    ybl = bot - 44.5 + (31.0 / 24.0) * au
    line = np.clip(aa(w / 2 - 7.6 - au) * aa(Y - top - 8.6) * aa(ybl - Y + 2.6) - aa(w / 2 - 8.8 - au) * aa(Y - top - 9.8) * aa(ybl - Y + 1.4), 0, 1)
    c = mix(c, GOLD2 * 0.7, (line * 0.75)[..., None])
    # o eclipse bordado: o aro de ouro com o fio claro por dentro, o disco escuro e os doze raios
    ey = top + (bot - top) * 0.36
    d = np.hypot(u, Y - ey)
    ang = np.arctan2(Y - ey, u)
    ring = band(d, 9.5, 14.5)
    rg = GOLD2 * 0.9 * (0.8 + 0.35 * (0.5 + 0.5 * np.sin(ang * 36.0)))[..., None]
    c = mix(c, rg, ring[..., None])
    c = mix(c, GOLD3 * 0.95, (band(d, 9.5, 10.6) * 0.7)[..., None])
    c = mix(c, hexc(0x14070a), aa(9.5 - d)[..., None])
    hd += ring * 1.6
    for kk in range(12):
        an = kk * math.pi / 6
        ru = u * math.cos(an) + (Y - ey) * math.sin(an)
        rv = -u * math.sin(an) + (Y - ey) * math.cos(an)
        ray = aa(1.9 - np.abs(rv) - np.abs(ru - 19.0) * 0.62)
        c = mix(c, GOLD2 * 0.85, ray[..., None])
        hd += ray * 1.0
    lit = lit_flat(hd * cloth, ly, lx)
    c = c * (0.55 + 0.45 * lit)
    # a sombra da barra no alto do pano
    c = c * (1 - 0.35 * sstep(top + 7.0, top, Y))[..., None]
    cv.over(rows, cols, np.clip(c, 0, 1), cloth)
    # a franja de ouro na beira de baixo
    fr = aa(Y - yb) * aa(yb + 5.5 - Y) * aa(w / 2 - au) * (0.35 + 0.65 * (0.5 + 0.5 * np.cos(u * 3.4)) ** 2)
    cv.over(rows, cols, GOLD1 * 0.8, fr * 0.9)


def chandelier(cv, gx, y, rng):
    # a luz quente no ar (antes do ferro)
    air_glow(cv, gx, y - 10.0, ((110.0, 0.06), (60.0, 0.09), (30.0, 0.12)))
    # a corrente do alto até o nó, elo por elo
    rows, cols, Y, X, ly, lx = pwin(cv, gx - 8, 0, 16, y - 26)
    u = X - gx
    li = np.floor(Y / 7.0)
    lv = Y - (li + 0.5) * 7.0
    odd = (li % 2) > 0.5
    rx = np.where(odd, 1.1, 2.5)
    e = np.hypot(u / rx, lv / 4.3)
    link = np.where(odd, aa((1 - e) * 1.1), aa((1 - e) * 2.5) * (1 - aa((0.5 - e) * 2.5)))
    lc = mix(IRON, hexc(0x4a5674), (aa(-u - 0.4) * 0.55)[..., None])
    cv.over(rows, cols, lc, link * 0.97)
    rows, cols, Y, X, ly, lx = pwin(cv, gx - 80, y - 40, 160, 70)
    u, v = X - gx, Y - y
    au = np.abs(u)
    # o aro visto de baixo: a metade de trás, as três hastes, as velas e a metade da frente
    e_out = np.hypot(u / 66.0, v / 12.0)
    e_in = np.hypot(u / 61.0, v / 8.5)
    hoop = aa((1 - e_out) * 12.0) * aa((e_in - 1) * 8.5)
    back = hoop * (v < 0)
    cv.over(rows, cols, mix(IRON, hexc(0x3a2516), 0.5), back * 0.95)
    t = np.clip((v + 30.0) / 30.0, 0, 1)
    stay = aa(0.8 - np.abs(au - 62.0 * t)) * (v > -30.0) * (v < 0.5)
    cv.over(rows, cols, IRON, stay * 0.95)
    hub = aa(3.2 - np.hypot(u, v + 30.0))
    cv.over(rows, cols, mix(IRON, hexc(0x4a5674), 0.25), hub)
    pts = []
    for kk in range(9):
        an = kk / 9 * TAU + 0.3
        if math.sin(an) < -0.2:
            continue
        pts.append((gx + math.cos(an) * 63.0, y + math.sin(an) * 10.0, math.sin(an)))
    # de trás para a frente
    for px, py, sn in sorted(pts, key=lambda q: q[2]):
        if sn < 0.25:
            candle(cv, px, py, 14.0, 4.4, 0.2)
    rows, cols, Y, X, ly, lx = pwin(cv, gx - 80, y - 40, 160, 70)
    u, v = X - gx, Y - y
    e_out = np.hypot(u / 66.0, v / 12.0)
    e_in = np.hypot(u / 61.0, v / 8.5)
    hoop = aa((1 - e_out) * 12.0) * aa((e_in - 1) * 8.5)
    # a frente do aro: uma cinta de ferro com a beira de cima acesa pelas velas e rebites
    front = np.maximum(hoop * (v >= 0), aa((1 - e_out) * 12.0) * aa((np.hypot(u / 66.0, (v - 4.2) / 12.0) - 1) * -12.0) * 0 )
    yo = 12.0 * np.sqrt(np.clip(1 - (u / 66.0) ** 2, 0, 1))
    cinta = aa(66.0 - np.abs(u)) * band(v, yo - 1.0, yo + 4.6)
    fm = np.maximum(front, cinta)
    fc = np.broadcast_to(IRON, Y.shape + (3,)).copy()
    fc = mix(fc, WIN0 * 0.75, (band(v, yo - 1.0, yo + 0.5) * 0.7)[..., None])
    fc = mix(fc, hexc(0x4a5674), (band(v, yo + 3.2, yo + 4.6) * 0.3)[..., None])
    riv = aa(0.9 - np.hypot(((u + 5.5) % 11.0) - 5.5, v - (yo + 2.0)))
    fc = mix(fc, WIN0 * 0.6, (riv * 0.6)[..., None])
    cv.over(rows, cols, fc, fm * 0.97)
    for px, py, sn in sorted(pts, key=lambda q: q[2]):
        if sn >= 0.25:
            # o pratinho de ferro e a vela da frente
            r2, c2, Y2, X2, _, _ = pwin(cv, px - 6, py - 2, 12, 6)
            cup = aa(4.0 - np.abs(X2 - px)) * band(Y2, py - 0.6, py + 1.4)
            cv.over(r2, c2, mix(IRON, WIN0, 0.35), cup)
            candle(cv, px, py - 0.5, 14.0, 4.4, 0.2)


def candelabra(cv, x, hgt, floor, rng):
    B = floor
    top = B - hgt
    air_glow(cv, x, top - 18.0, ((14.0, 0.12), (30.0, 0.05)))
    rows, cols, Y, X, ly, lx = pwin(cv, x - 34, top - 12, 68, hgt + 16)
    u = X - x
    au = np.abs(u)
    # o pé de três pernas em S, a haste com nós torneados, o braço e os pratinhos
    leg_y = B - 2.0 - 12.0 * np.clip(1 - au / 13.0, 0, 1) ** 1.7
    leg = aa(1.5 - np.abs(Y - leg_y)) * aa(13.5 - au) * aa(Y - (B - 15.0))
    foot = aa(2.2 - np.hypot(au - 12.6, Y - (B - 1.6)))
    stem = aa(1.5 - au) * band(Y, top + 4.0, B - 12.0)
    knots = np.zeros_like(Y)
    for ky, kr in ((B - 14.0, 3.4), (B - hgt * 0.45, 3.0), (top + 10.0, 2.8)):
        knots = np.maximum(knots, aa(1.0 - np.hypot(u / kr, (Y - ky) / (kr * 0.72))) )
    # o braço: sobe em curva do meio para as pontas
    arm_y = top + 6.0 - 3.2 * (au / 18.0) ** 2
    arm = aa(1.25 - np.abs(Y - arm_y)) * aa(19.0 - au)
    cups = np.zeros_like(Y)
    for sx in (-18.0, 0.0, 18.0):
        cy = top + 6.0 - (3.2 if sx else 0.0)
        cups = np.maximum(cups, aa(1.0 - np.abs(X - x - sx)) * band(Y, cy - 8.0, cy))
        cups = np.maximum(cups, aa(4.2 - np.abs(X - x - sx)) * band(Y, cy - 9.4, cy - 7.8))
    m = np.clip(np.maximum.reduce([leg, foot, stem, knots, arm, cups]), 0, 1)
    c = np.broadcast_to(IRON, Y.shape + (3,)).copy()
    # o ferro pega a luz fria de um lado e a das velas em cima
    c = mix(c, hexc(0x46526e), (np.clip(m - np.roll(m, 1, axis=1), 0, 1) * 0.6)[..., None])
    c = mix(c, WIN0 * 0.8, (np.clip(m - np.roll(m, 2, axis=0), 0, 1) * sstep(top + 40.0, top, Y) * 0.75)[..., None])
    cv.over(rows, cols, c, m * 0.97)
    for sx in (-18.0, 0.0, 18.0):
        cy = top + 6.0 - (3.2 if sx else 0.0)
        candle(cv, x + sx, cy - 9.2, 10.0, 4.0, 0.2)


def nave_mid(rng):
    TW, H = 3072, 1260
    plan = nave_plan(np.random.default_rng(65))
    cv = Canvas(TW, H)
    span, floor = plan['span'], plan['floor']
    yy, xx = grid(TW, H)
    tex = pnoise(H, TW, 24, rng, 3)
    for i in range(int(plan['TW'] // span)):
        cx = i * span + span / 2
        r, c, _, _, _, _ = pwin(cv, cx - 112, 0, 224, 840)
        pillar(cv, cx, tex[r][:, c], plan['stands'], rng)
    for kind, gx, v in plan['hang']:
        if kind == 'banner':
            banner(cv, gx, v, rng)
        else:
            chandelier(cv, gx, v, rng)
    for x, hgt in plan['stands']:
        candelabra(cv, x, hgt, floor, rng)
    # escuro embaixo, aos poucos (o chão fica atrás do terreno)
    fade = sstep((floor - 70.0) * K, (floor + 170.0) * K, yy) * 0.95
    a3 = fade[..., None]
    out_a = fade + cv.a * (1 - fade)
    cv.col[:] = (DARK * a3 + cv.col * (cv.a * (1 - fade))[..., None]) / np.maximum(out_a, 1e-5)[..., None]
    cv.a[:] = out_a
    return cv


if __name__ == '__main__':
    if want('nave-far'):
        save(nave_far(np.random.default_rng(164)), 'nave-far')
    if want('nave-mid'):
        save(nave_mid(np.random.default_rng(165)), 'nave-mid')
    if PREVIEW:
        preview(PREVIEW, 'nave', [('nave-far', 0.12), ('nave-mid', 0.35)], bg=(7, 8, 13))

"""Fundos das Torres Rúnicas no traço pintado (2 pixels da imagem por pixel do mundo, hd.json).

As Torres ficam no alto da montanha, acima do mar de nuvens. O céu é o do vale (o eclipse com a coroa no
mesmo lugar da tela), visto de mais alto: o horizonte fica mais baixo e o mar de nuvens vai até ele, com os
tufos crescendo para perto e os picos da serra furando lá longe. Mais perto, as outras torres da Casa, em
esporões de pedra que saem das nuvens (nada flutua: o pé de cada esporão some no mar de nuvens), com o aro
dourado da luz baixa, as faixas de bronze e algumas janelas de Âmbar acesas.

  torres-sky   1280x720  o céu preso na tela: o eclipse, o degradê até o ouro do horizonte, cirros, os picos
                         longe, um cúmulo grande do lado esquerdo e o mar de nuvens visto de cima
  torres-far   1280x720  repete na horizontal: as torres da Casa nos esporões (as de trás na névoa), a ponte em
                         arco entre duas delas, as faixas de nuvem passando e o mar de nuvens embaixo

uso: python3 fundos_torres.py <pasta_saida> [camada ...] [--fast] [--export] [--preview=<pasta>]
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from brush import Layer, hexc, mix, sstep, blur, value_noise, noise1d, paint
from relevo import shade, ridged, jagged
from fundos_floresta import Wide, stretched, grid
from fundos_vale import (billows, cloud_bank, serra_relevo, thick, cloud_wisp, wide_xs, comp_layer, P,
                         ZEN, UP, LAV, ROSE, PEACH, GOLD, GOLDW, COR1, COR2, COR3, STAR,
                         CL_GOLD, CL_CREAM, CL_ROSE, CL_LAV, CL_DUSK, HAZE, MT_LIGHT, EX, EY, ER)

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else 'hd_torres_fundos'
ONLY = set(ARGS[1:])
PREVIEW = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
T0 = time.time()

# a pedra da Casa (a mesma cantaria escura das salas), o bronze, a ardósia dos telhados e o Âmbar das janelas
ST_D, ST_M, ST_L = hexc(0x221f30), hexc(0x3e374c), hexc(0x6e6070)
RIM = hexc(0xf6cf8e)
BRZ_D, BRZ_L = hexc(0x7a5430), hexc(0xe0a860)
SLATE_D, SLATE_L = hexc(0x1e1c2c), hexc(0x5a5470)
RK_D, RK_M, RK_L = hexc(0x2e2840), hexc(0x5e4e60), hexc(0xb88a78)
WIN_D = hexc(0x14121c)
AMBER, AMBER_W = hexc(0xffa848), hexc(0xffe0a0)
# o ar entre as torres e quem olha (o lilás do céu com o pêssego de baixo)
AIR = mix(LAV, HAZE, 0.5)


def want(name):
    return not ONLY or name in ONLY


def tint(L, c, k):
    """Puxa a cor da camada para c (k: 0..1 por pixel ou um número), sem mexer no alfa."""
    k = np.asarray(k, np.float32)
    if k.ndim == 2:
        k = k[..., None]
    L.P[:] = L.P * (1 - k) + np.asarray(c, np.float32) * L.A[..., None] * k


# ======================================================================================
# torres-sky
# ======================================================================================
def flat_billows(w, h, blobs, rng, rough=0.35):
    """Tufos vistos de cima (elipses achatadas pela perspectiva): blobs (cx, cy, rx, ry, z). Devolve a máscara,
    a normal (nx, ny, nz), o vinco entre tufos e o fluxo (a pincelada gira em volta do tufo, achatada como ele)."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fine = value_noise(h, w, 5, rng, 2)
    zb = np.full((h, w), -1e9, np.float32)
    z2 = np.full((h, w), -1e9, np.float32)
    nx = np.zeros((h, w), np.float32)
    ny = np.zeros((h, w), np.float32)
    nz = np.ones((h, w), np.float32)
    flow = np.zeros((h, w), np.float32)
    for (cx, cy, rx, ry, cz) in blobs:
        x0, x1 = max(0, int(cx - rx * 1.4)), min(w, int(cx + rx * 1.4) + 1)
        y0, y1 = max(0, int(cy - ry * 1.4)), min(h, int(cy + ry * 1.4) + 1)
        if x0 >= x1 or y0 >= y1:
            continue
        sx, sy = xx[y0:y1, x0:x1], yy[y0:y1, x0:x1]
        ux, uy = (sx - cx) / rx, (sy - cy) / ry
        d = np.hypot(ux, uy)
        reff = 1 + (fine[y0:y1, x0:x1] - 0.5) * rough
        inside = d < reff
        dz = np.sqrt(np.clip(reff * reff - d * d, 0, None))
        z = cz + dz * ry
        Zb, Z2 = zb[y0:y1, x0:x1], z2[y0:y1, x0:x1]
        better = inside & (z > Zb)
        Z2[:] = np.where(better, Zb, np.where(inside & (z > Z2), z, Z2))
        Zb[:] = np.where(better, z, Zb)
        inv = 1.0 / np.maximum(reff, 1e-3)
        nx[y0:y1, x0:x1] = np.where(better, ux * inv, nx[y0:y1, x0:x1])
        ny[y0:y1, x0:x1] = np.where(better, uy * inv, ny[y0:y1, x0:x1])
        nz[y0:y1, x0:x1] = np.where(better, dz * inv, nz[y0:y1, x0:x1])
        th = np.arctan2(uy, ux)
        ang = np.arctan2(ry * np.cos(th), -rx * np.sin(th)) + 0.2
        flow[y0:y1, x0:x1] = np.where(better, ang, flow[y0:y1, x0:x1])
    M = zb > -1e8
    mry = np.mean([b[3] for b in blobs])
    crease = np.where(z2 > -1e8, np.exp(-(zb - z2) / max(1.0, mry * 0.3)), 0.0)
    return M, nx, ny, nz, crease.astype(np.float32), flow


def peak_line(W, rng, xs, ytop, ybase, steep):
    """A crista de um grupo de picos (só nos x pedidos; fora deles a linha fica embaixo do mar de nuvens)."""
    x = np.arange(W, dtype=np.float32)
    line = np.full(W, ybase + 60, np.float32)
    for xk in xs:
        hk = rng.uniform(0.45, 1.0)
        py = ybase - (ybase - ytop) * hk
        sl, sr = steep * rng.uniform(0.6, 1.35), steep * rng.uniform(0.6, 1.35)
        line = np.minimum(line, py + np.where(x < xk, (xk - x) * sl, (x - xk) * sr))
    return line


def torres_sky(rng):
    W, H = 1280, 720
    yy, xx = grid(W, H)
    t = yy / H
    # o horizonte: mais baixo que no vale (o mar de nuvens está bem mais embaixo de quem olha)
    yh = H * 0.6
    sky = mix(ZEN, UP, sstep(0.0, 0.26, t)[..., None])
    sky = mix(sky, LAV, sstep(0.2, 0.42, t)[..., None])
    sky = mix(sky, ROSE, sstep(0.36, 0.52, t)[..., None])
    sky = mix(sky, PEACH, sstep(0.46, 0.57, t)[..., None])
    sky = mix(sky, GOLD, sstep(0.53, 0.6, t)[..., None])
    # a luz baixa: mais forte no horizonte, puxada para a esquerda (de onde ela vem)
    glow = np.exp(-((xx - W * 0.24) / (W * 0.5)) ** 2 - ((yy - yh) / (H * 0.13)) ** 2)
    sky = mix(sky, GOLDW, (glow * 0.6)[..., None])
    d_e = np.hypot(xx - EX, yy - EY)
    sky = mix(sky, ZEN * 0.8, (np.exp(-(d_e / 260) ** 2) * 0.35)[..., None])
    sky = mix(sky, COR1 * 0.6 + ZEN * 0.4, (np.exp(-(d_e / 120) ** 2) * 0.4)[..., None])
    # cirros compridos no meio do céu, a barriga pegando o dourado de baixo
    st = stretched(H, W, 34, rng, sx=10.0, octaves=3)
    st2 = stretched(H, W, 90, rng, sx=4.0, octaves=2)
    cir = sstep(0.6, 0.76, st * 0.7 + st2 * 0.3) * sstep(0.12, 0.24, t) * sstep(0.46, 0.32, t)
    belly = np.clip(cir - np.roll(cir, -4, axis=0), 0, 1)
    cir_c = mix(LAV * 0.9 + UP * 0.1, CL_ROSE, sstep(0.2, 0.42, t)[..., None])
    sky = mix(sky, cir_c, (cir * 0.5)[..., None])
    sky = mix(sky, CL_GOLD, (blur(belly, 1.5) * 1.4 * sstep(0.18, 0.4, t)).clip(0, 0.6)[..., None])
    base = np.clip(blur(sky, 2.0), 0, 1)
    L = Layer.from_rgb(base)
    flow = np.full((H, W), -0.03, np.float32) + (st2 - 0.5) * 0.3
    passes = [dict(size=12, spacing=0.9, length=(3.0, 7.0), err=0.012, alpha=0.35, bristle=0.35, dry=0.2, blur=0.6, taper=0.6, ang_jitter=0.06, bend=0.4),
              dict(size=6, spacing=1.0, length=(3.0, 6.0), err=0.02, alpha=0.35, bristle=0.3, dry=0.15, blur=0.5, taper=0.7, ang_jitter=0.06, bend=0.4)]
    paint(L, base, np.ones((H, W), np.float32), flow, rng, P(passes), val_jitter=0.012, jitter=0.004)
    # estrelas só no escuro de cima
    for _ in range(170):
        x, y = rng.uniform(0, W), rng.uniform(0, H * 0.34)
        ix, iy = int(x), int(y)
        if cir[iy, ix] > 0.2 or d_e[iy, ix] < 150:
            continue
        b = rng.random() ** 2.4 * (1 - y / (H * 0.36))
        L.dab(x, y, 0.6 + b * 1.0, mix(STAR, hexc(0xffffff), b), 0.3 + 0.6 * b, 0.6)
        if b > 0.5:
            L.dab(x, y, 4 + b * 4, STAR, 0.05, 4)
    # a coroa do eclipse (a mesma do céu do vale: é o mesmo céu)
    L.fill(COR2, np.exp(-(d_e / (ER * 2.6)) ** 2) * 0.22)
    for _ in range(200):
        a = rng.uniform(0, 2 * math.pi)
        r0 = ER + rng.uniform(2, 7)
        ln = rng.uniform(12, 70) * (0.4 + rng.random())
        cx, cy = EX + math.cos(a) * (r0 + ln / 2), EY + math.sin(a) * (r0 + ln / 2)
        L.stroke(cx, cy, a, ln, rng.uniform(1.4, 3.6), mix(COR1, COR3, rng.random() ** 2), rng.uniform(0.1, 0.34), rng, 0.4, 0.5, taper=0.8)
    L.fill(COR3, sstep(ER + 4.5, ER + 1.2, d_e) * sstep(ER - 1, ER + 1, d_e) * 0.95)
    L.fill(hexc(0x06070b), sstep(ER + 0.8, ER - 0.8, d_e))
    # os picos da serra furando o mar de nuvens, bem longe (na névoa do horizonte)
    for (xs, ytop, steep, amp, hz) in (((-30, 70, 190, 300, 420), H * 0.46, 0.78, 12, 0.45),):
        line = peak_line(W, rng, xs, ytop, yh + 14, steep)
        line = jagged(line, rng, amp, cell=110, octaves=6, sharp=0.65)
        M = serra_relevo(W, H, rng, yy, line, yh + 14, True)
        tint(M, mix(PEACH, ROSE, 0.45), hz)
        L.over(M)
    # o cúmulo grande do lado esquerdo, saindo do mar de nuvens: a barriga dourada (a luz vem de baixo e da
    # esquerda), o corpo rosado e o alto lilás puxando para o céu escuro
    for (bx0, bx1, by, ty, n) in ((70, 400, yh + 6, H * 0.33, 36), (1040, 1270, yh + 4, H * 0.47, 22)):
        Mc, nx, ny, nz, cr, cflow, u, v = cloud_bank(W, H, rng, by, bx0, bx1, ty, n)
        macro = np.clip(-u * 0.45 + v * 0.55 + 0.45, 0, 1)
        micro = np.clip(nx * -0.55 + ny * 0.5 + nz * 0.4, 0, 1)
        lit_c = np.clip(macro * 0.65 + micro * 0.45, 0, 1)
        hgt = np.clip((by - yy) / max(1.0, by - ty), 0, 1)
        cc = mix(CL_LAV, CL_ROSE, sstep(0.15, 0.55, lit_c)[..., None])
        cc = mix(cc, CL_DUSK, (sstep(0.55, 1.0, hgt) * sstep(0.45, 0.1, lit_c) * 0.6)[..., None])
        cc = mix(cc, CL_GOLD, sstep(0.5, 0.85, lit_c)[..., None])
        cc = mix(cc, CL_CREAM, (sstep(0.82, 1.0, lit_c) * 0.8)[..., None])
        cc = mix(cc, cc * 0.82, (cr * 0.4)[..., None])
        cc = mix(cc, sky, 0.18 + 0.2 * (1 - Mc[..., None]))
        C = Layer(W, H)
        paint(C, cc, Mc, cflow, rng, thick(0.5, dry=0.2, bristle=0.3, err=(0, 0.02, 0.03, 0.045), long=0.9, bend=0.9), base=1.0)
        C.multiply_alpha(np.clip(Mc * 1.4, 0, 1))
        L.over(C)
    # o mar de nuvens visto de cima: fileiras de tufos achatados, miúdos no horizonte e grandes perto
    blobs = []
    y = yh - 3
    while y < H + 70:
        s = max(0.0, (y - yh + 8) / (H - yh))
        r = 4.0 + 74.0 * s ** 1.5
        ry = r * (0.26 + 0.3 * min(s, 1.0))
        x = -rng.uniform(0, r)
        while x < W + r:
            rr = r * rng.uniform(0.7, 1.35)
            blobs.append((x, y + rng.uniform(-0.3, 0.3) * ry, rr, ry * rr / r, y * 3 + rng.uniform(0, 4)))
            x += rr * rng.uniform(1.0, 1.6)
        y += max(2.0, ry * 0.9)
    Mb, nx, ny, nz, crease, bflow = flat_billows(W, H, blobs, rng)
    Mb = Mb | (yy > yh + 6)
    sea = blur(Mb.astype(np.float32), 1.0) * sstep(yh - 6, yh - 1, yy)
    lit = np.clip(nx * -0.35 + ny * -0.38 + nz * 0.6 + 0.08, 0, 1)
    soft_lav = mix(CL_LAV, CL_ROSE, 0.45)
    sc = mix(soft_lav, mix(CL_ROSE, PEACH, 0.5), sstep(0.1, 0.5, lit)[..., None])
    sc = mix(sc, mix(CL_GOLD, CL_CREAM, 0.45), sstep(0.5, 0.82, lit)[..., None])
    sc = mix(sc, CL_CREAM, (sstep(0.8, 1.0, lit) * 0.8)[..., None])
    sc = mix(sc, soft_lav, (crease * 0.35)[..., None])
    # as ondas grandes do mar de nuvens (os vales mais apagados) e a névoa dourada perto do horizonte
    und = value_noise(H, W, 150, rng, 2)
    sc = sc * (0.86 + 0.26 * und)[..., None]
    far = sstep(yh + (H - yh) * 0.62, yh, yy)
    sc = mix(sc, mix(GOLDW, PEACH, 0.3), (far * 0.75)[..., None])
    sc = mix(sc, GOLDW, (glow * 0.3)[..., None])
    S = Layer(W, H)
    sflow = np.where(Mb, bflow, 0.02).astype(np.float32)
    paint(S, np.clip(sc, 0, 1), sea, sflow, rng, thick(0.6, dry=0.1, bristle=0.2, err=(0, 0.015, 0.025, 0.035), long=1.2, bend=0.6), base=1.0)
    L.over(S)
    # a névoa dourada em cima da linha do horizonte
    L.fill(GOLDW, np.exp(-((yy - yh) / 10.0) ** 2) * 0.45)
    return L


# ======================================================================================
# torres-far: as outras torres da Casa
# ======================================================================================
def casa_tower(rng, w, top, rtop, base_y, haze, roof, lit_p=0.35):
    """Uma torre da Casa num esporão de pedra, numa tela local. A torre é quadrada (duas faces: a da esquerda
    acesa pela luz baixa, com o aro dourado na quina, a da direita na sombra), com as fiadas, as faixas de
    bronze, as janelas em arco (umas acesas de Âmbar) e o telhado: a agulha de ardósia com o remate de bronze
    ou as ameias. Fica de pé num embasamento de cantaria em cima do esporão, que desce alargando até sumir nas
    nuvens. Devolve (camada, x do meio da torre na tela local, y do alto da tela local)."""
    hw = w / 2
    roof_h = 1.55 * w if roof == 'spire' else 0.2 * w
    y0 = int(top - roof_h - 0.45 * w - 8)
    spread = (base_y + 40 - rtop) * 0.8
    lw = int(2 * (hw * 1.5 + spread) + 24)
    lh = int(base_y + 50 - y0)
    xm = lw / 2
    yy, xx = grid(lw, lh)
    yy = yy + y0
    lx = xx - xm
    # ---- a torre ----
    hwy = hw * (1 - 0.05 * np.clip((rtop - yy) / max(1.0, rtop - top), 0, 1))
    xc = -0.2 * hw  # a quina que olha para cá
    shaft = (np.abs(lx) <= hwy) & (yy >= top) & (yy <= rtop + 2)
    ul = np.clip((lx + hwy) / np.maximum(xc + hwy, 1.0), 0, 1)
    ur = np.clip((lx - xc) / np.maximum(hwy - xc, 1.0), 0, 1)
    face_l = mix(ST_L, ST_M, (ul * 0.6)[..., None])
    face_l = mix(face_l, RIM, (sstep(0.14, 0.0, ul) * 0.85)[..., None])
    face_r = mix(ST_M * 0.72, ST_D, ur[..., None])
    col = np.where((lx < xc)[..., None], face_l, face_r)
    # a luz que o mar de nuvens devolve esquenta o pé da torre
    up = sstep(top + (rtop - top) * 0.45, rtop, yy)
    col = mix(col, mix(PEACH, GOLD, 0.4), (up * 0.3)[..., None])
    # as fiadas e as faixas de bronze
    course = ((yy - top) % 6.0) < 1.0
    col = np.where(course[..., None], col * 0.84, col)
    step = max(18.0, 0.9 * w)
    bands = np.zeros_like(yy, dtype=bool)
    by = top + 0.4 * w
    while by < rtop - 4:
        bands |= (yy >= by) & (yy < by + 2.0)
        by += step
    bc = np.where((lx < xc)[..., None], mix(BRZ_D, BRZ_L, 0.75), BRZ_D * 0.8)
    col = np.where(bands[..., None], bc, col)
    mask = shaft.astype(np.float32)
    # o telhado
    if roof == 'spire':
        ax, ay = xc * 0.6, top - roof_h
        ew = hw * 1.12
        k = np.clip((yy - ay) / max(1.0, top - ay), 0, 1)
        lft = ax + (-ew - ax) * k
        rgt = ax + (ew - ax) * k
        mid = ax + (xc - ax) * k
        rf = (yy >= ay) & (yy <= top + 1) & (lx >= lft) & (lx <= rgt)
        slate = mix(SLATE_L, mix(SLATE_L, RIM, 0.45), sstep(0.3, 0.0, (lx - lft) / np.maximum(mid - lft, 1.0))[..., None])
        slate = np.where((lx < mid)[..., None], slate, mix(SLATE_D, SLATE_L * 0.6, 0.3))
        slate = np.where((((yy - ay) % 3.0) < 0.8)[..., None], slate * 0.85, slate)
        col = np.where(rf[..., None], slate, col)
        mask = np.maximum(mask, rf.astype(np.float32))
        # a sombra do beiral na parede, logo embaixo
        eave = shaft & (yy > top + 1) & (yy < top + 3.5)
        col = np.where(eave[..., None], col * 0.6, col)
    else:
        # o parapeito em balanço (a cornija com a sombra embaixo) e as ameias
        cor = (np.abs(lx) <= hw * 1.1) & (yy >= top - 0.06 * w) & (yy <= top + 0.08 * w)
        merl = (np.abs(lx) <= hw * 1.1) & (yy >= top - 0.06 * w - 0.16 * w) & (yy < top - 0.06 * w)
        pitch = max(5.0, 0.32 * w)
        merl &= (((lx + hw * 1.1) % pitch) < pitch * 0.58)
        cc = np.where((lx < xc)[..., None], mix(ST_L, RIM, 0.35), ST_M * 0.8)
        col = np.where((cor | merl)[..., None], cc, col)
        und = shaft & (yy > top + 0.08 * w) & (yy < top + 0.08 * w + 2.5)
        col = np.where(und[..., None], col * 0.55, col)
        mask = np.maximum(mask, (cor | merl).astype(np.float32))
    # ---- o embasamento e o esporão ----
    plinth = (np.abs(lx) <= hw * 1.2) & (yy > rtop - 0.16 * w) & (yy <= rtop + 3)
    pc = np.where((lx < xc)[..., None], mix(ST_L, RIM, 0.25), ST_M * 0.75)
    ys = np.arange(lh, dtype=np.float32) + y0
    kk = np.clip((ys - rtop) / max(1.0, base_y + 40 - rtop), 0, 1)
    def edge():
        # o perfil de um lado: a parede quase de prumo perto do alto, abrindo embaixo, com um ou dois ombros
        # (degraus para fora) e a borda serrilhada
        e = hw * 1.3 + spread * rng.uniform(0.55, 0.9) * (0.25 * kk + 0.75 * kk ** 2.2)
        for _ in range(int(rng.integers(1, 3))):
            at = rng.uniform(0.15, 0.7)
            e = e + rng.uniform(6, 18) * sstep(at - 0.02, at + 0.03, kk)
        e = e + (noise1d(lh, 34, rng, 2) - 0.5) * 22 * (0.25 + kk) + (noise1d(lh, 6, rng, 2) - 0.5) * 5
        return e
    half_l = edge()
    half_r = edge()
    topn = rtop + 2 + (value_noise(1, lw, 9, rng, 2)[0] - 0.5) * 4 + np.clip(np.abs(lx[0]) - hw * 1.3, 0, None) * 0.35
    rock = (yy >= topn[None, :]) & (lx >= -half_l[:, None]) & (lx <= half_r[:, None])
    dl = np.clip(lx + half_l[:, None], 0, 30)
    dr = np.clip(half_r[:, None] - lx, 0, 30)
    f1 = stretched(lh, lw, 14, rng, sy=4.0, octaves=3)
    f2 = stretched(lh, lw, 40, rng, sy=2.5, octaves=2)
    f3 = stretched(lh, lw, 5, rng, sy=9.0, octaves=2)
    z = dl * 1.4 + dr * 1.4 + ridged(f1) * 9 + ridged(f2) * 16 + ridged(f3) * 4
    dif, _, _, _, _ = shade(blur(z, 0.8), MT_LIGHT)
    rc = mix(RK_D, RK_M, sstep(0.12, 0.5, dif)[..., None])
    rc = mix(rc, RK_L, sstep(0.55, 0.9, dif)[..., None])
    # as fendas de cima para baixo (escuras) e as prateleiras com a borda clara
    fis = sstep(0.82, 0.95, ridged(f3) * 0.6 + ridged(f1) * 0.4)
    rc = mix(rc, RK_D * 0.7, (fis * 0.55)[..., None])
    rc = mix(rc, RIM, (sstep(3.0, 0.0, dl) * sstep(0.4, 0.7, dif) * 0.6)[..., None])
    rc = mix(rc, mix(PEACH, HAZE, 0.5), (sstep(rtop + (base_y - rtop) * 0.3, base_y, yy) * 0.6)[..., None])
    allc = np.where(rock[..., None], rc, 0.0)
    allc = np.where(plinth[..., None], pc, allc)
    allc = np.where((mask > 0.5)[..., None], col, allc)
    allm = np.clip(np.maximum(np.maximum(mask, plinth), rock).astype(np.float32), 0, 1)
    allc = mix(allc, AIR, haze)
    T = Layer(lw, lh)
    # a pedra do esporão em pinceladas descendo; a torre com o pincel fino e de pé (a borda continua reta)
    fl = (np.full((lh, lw), math.pi / 2, np.float32) + (f2 - 0.5) * 0.3).astype(np.float32)
    paint(T, np.clip(allc, 0, 1), blur(allm, 0.6), fl, rng, thick(0.26, dry=0.35, bristle=0.4, err=(0, 0.02, 0.03, 0.04), long=1.3, bend=0.1), base=1.0)
    T.multiply_alpha(np.clip(blur(allm, 0.5) * 1.2, 0, 1))
    # as janelas em arco: as apagadas escuras, as acesas de Âmbar com o brilho em volta
    ww, wh = max(2.2, 0.11 * w), max(5.0, 0.26 * w)
    wy = top + 0.65 * w
    lit = []
    while wy < rtop - 0.5 * w:
        cols = [(-hw + xc) / 2] + ([xc + (hw - xc) * 0.33, xc + (hw - xc) * 0.72] if hw - xc > 14 else [(xc + hw) / 2])
        for wx in cols:
            on = rng.random() < lit_p
            b = (np.abs(lx - wx) <= ww / 2) & (yy <= wy + wh) & (yy >= wy) & \
                ((yy >= wy + ww / 2) | (np.hypot(lx - wx, yy - (wy + ww / 2)) <= ww / 2))
            c = mix(AMBER, AMBER_W, 0.35) if on else WIN_D
            T.fill(mix(c, AIR, haze * (0.5 if on else 1.0)), b.astype(np.float32) * T.A)
            if on:
                lit.append((xm + wx, wy + wh * 0.55 - y0))
        wy += max(16.0, 0.85 * w)
    for (gx, gy) in lit:
        T.dab(gx, gy, ww * 2.4, AMBER, 0.16 * (1 - haze), 3.0)
    return T, xm, y0


def arch_bridge(rng, span, deck_y, th, haze):
    """A ponte em arco entre duas torres (span: a distância entre as paredes de frente uma da outra): o
    tabuleiro com o parapeito, o arco embaixo (nasce nas duas paredes, o intradorso na sombra) e os tímpanos
    em cima do arco. Devolve (camada, y do alto da tela local); x = 0 é a parede da esquerda."""
    rise = span * 0.3
    y0 = int(deck_y - 0.6 * th - 4)
    lw, lh = int(span + 8), int(th + rise + 0.6 * th + 12)
    yy, xx = grid(lw, lh)
    yy = yy + y0
    lx = xx - 4
    sb = deck_y + th + rise * 0.15
    spring = sb + rise
    u = np.clip((lx - span / 2) / (span / 2), -1, 1)
    intr = spring - rise * np.sqrt(np.clip(1 - u * u, 0, 1))
    body = (lx >= -2) & (lx <= span + 2) & (yy >= deck_y - 0.6 * th) & (yy <= intr)
    par = yy < deck_y
    col = np.broadcast_to(ST_M, yy.shape + (3,)).copy()
    col = mix(col, mix(ST_L, RIM, 0.4), (sstep(deck_y - 0.6 * th + 2.0, deck_y - 0.6 * th, yy) * 0.8)[..., None])
    col = np.where((par & (yy > deck_y - 1.5))[..., None], col * 0.6, col)
    col = mix(col, ST_D, (sstep(deck_y + th, intr, yy) * 0.5)[..., None])
    ring = sstep(0.0, 2.2, intr - yy) * sstep(5.5, 3.0, intr - yy)
    col = mix(col, mix(ST_L, ST_M, 0.5), (ring * 0.6)[..., None])
    col = mix(col, mix(PEACH, GOLD, 0.4), (sstep(intr - 3, intr, yy) * 0.35)[..., None])
    col = np.where(((((yy - deck_y) % 6.0) < 1.0) & ~par)[..., None], col * 0.86, col)
    col = mix(col, AIR, haze)
    m = body.astype(np.float32)
    B = Layer(lw, lh)
    paint(B, np.clip(col, 0, 1), m, np.zeros((lh, lw), np.float32), rng, thick(0.22, dry=0.3, bristle=0.35, err=(0, 0.02, 0.03, 0.04), long=1.0, bend=0.1), base=1.0)
    B.multiply_alpha(np.clip(blur(m, 0.5) * 1.2, 0, 1))
    return B, y0


def place(out, wide, layer, x_canvas0, y0, x):
    """Põe a camada local (com o x do mundo em x_canvas0 dela) em todas as cópias da tela larga."""
    reach = layer.W
    for xo in wide_xs(wide, x, reach):
        comp_layer(out, layer, int(round(xo - x_canvas0)), int(y0))


def far_sea(wide, rng, sea_y):
    """O mar de nuvens embaixo das torres (mais perto que o do céu): três fileiras de montes com os tufos por
    cima, cada uma maior e mais perto que a de trás, até o pé da tela."""
    W, H, CW = wide.W, wide.H, wide.CW
    yy, xx = grid(CW, H)
    blobs = []
    for (row_y, rmin, rmax, zb) in ((sea_y, 26, 64, 0.0), (sea_y + 74, 40, 86, 70.0), (sea_y + 160, 58, 112, 150.0)):
        x = rng.uniform(0, 40)
        while x < W:
            r = rng.uniform(rmin, rmax)
            my = row_y + r * rng.uniform(0.25, 0.6) + rng.uniform(-6, 10)
            for xo in wide_xs(wide, x, r * 2):
                blobs.append((xo, my, r, zb))
            for k in range(int(r / 7)):
                a2 = rng.uniform(math.pi * 1.1, math.pi * 1.9)
                rr = r * rng.uniform(0.18, 0.32)
                bx, by = x + math.cos(a2) * r * 0.86, my + math.sin(a2) * r * 0.86
                z = zb + 30 + rng.uniform(0, 12)
                for xo in wide_xs(wide, bx, rr * 2):
                    blobs.append((xo, by, rr, z))
            x += r * rng.uniform(0.8, 1.3)
    Mb, nx, ny, nz, crease, bflow = billows(CW, H, blobs, rng, 0.3, swirl=0.35)
    Mb = np.maximum(Mb, yy > sea_y + 200)
    sea = blur(Mb.astype(np.float32), 1.2)
    lit_s = np.clip(nx * -0.5 + ny * -0.45 + nz * 0.55, 0, 1)
    sc = mix(CL_ROSE, CL_GOLD, sstep(0.25, 0.85, lit_s)[..., None])
    sc = mix(sc, CL_CREAM, (sstep(0.75, 1.0, lit_s) * 0.7)[..., None])
    sc = mix(sc, mix(CL_ROSE, CL_LAV, 0.5), (crease * 0.5)[..., None])
    # a fileira de trás na névoa dourada; as de perto com mais cor
    sc = mix(sc, mix(GOLDW, PEACH, 0.3), (sstep(sea_y + 120, sea_y - 10, yy) * 0.3 + 0.08)[..., None])
    S = Layer(CW, H)
    sflow = np.where(Mb, bflow, 0.02).astype(np.float32)
    paint(S, np.clip(sc, 0, 1), sea, sflow, rng, thick(0.55, dry=0.25, bristle=0.35, err=(0, 0.02, 0.03, 0.045), long=1.1, bend=0.7), base=1.0)
    return S


def torres_far(rng):
    W, H, PP = 1280, 720, 240
    wide = Wide(W, H, PP)
    CW = wide.CW
    out = Layer(CW, H)
    base_y = H * 0.7
    # a fileira de trás: torres finas na névoa
    for (cx, w, top, rtop, roof) in ((140, 24, 0.36, 0.58, 'spire'), (610, 18, 0.43, 0.6, 'crown'),
                                     (1030, 28, 0.32, 0.56, 'spire'), (1215, 16, 0.46, 0.61, 'crown')):
        T, xm, y0 = casa_tower(rng, w, H * top, H * rtop, base_y, 0.58, roof, lit_p=0.25)
        place(out, wide, T, xm, y0, cx)
    # as faixas de nuvem passando entre as duas fileiras
    for (cy, x0, x1, th) in ((H * 0.6, -40, 540, 22), (H * 0.63, 690, 1180, 19)):
        wsp = cloud_wisp(wide, rng, cy, x0, x1, th, 0.32)
        if wsp:
            out.over(wsp)
    # a fileira da frente: a torre alta da agulha e a menor das ameias, ligadas pela ponte; e a outra agulha
    A = (360, 60, 0.16, 0.5)
    B = (528, 36, 0.3, 0.53)
    C = (884, 52, 0.22, 0.49)
    ha = A[1] / 2 * (1 - 0.05 * (A[3] - 0.41) / (A[3] - A[2]))
    hb = B[1] / 2 * (1 - 0.05 * (B[3] - 0.41) / (B[3] - B[2]))
    xa, xb = A[0] + ha - 1, B[0] - hb + 1
    Bg, by0 = arch_bridge(rng, xb - xa, H * 0.41, 9.0, 0.14)
    place(out, wide, Bg, 4.0, by0, xa)
    T, xm, y0 = casa_tower(rng, B[1], H * B[2], H * B[3], base_y, 0.16, 'crown', lit_p=0.4)
    place(out, wide, T, xm, y0, B[0])
    T, xm, y0 = casa_tower(rng, A[1], H * A[2], H * A[3], base_y, 0.12, 'spire', lit_p=0.35)
    place(out, wide, T, xm, y0, A[0])
    T, xm, y0 = casa_tower(rng, C[1], H * C[2], H * C[3], base_y, 0.14, 'spire', lit_p=0.35)
    place(out, wide, T, xm, y0, C[0])
    out.over(far_sea(wide, rng, H * 0.68))
    return wide.fold(out)


# ======================================================================================
def save(L, name):
    img = L.image()
    img.save(f'{OUT}/{name}.png', optimize=True)
    print(name, img.size, round(time.time() - T0, 1), 's', flush=True)
    return img


def preview(out):
    """A tela do jogo (2x): o céu e as torres de longe em três posições da câmera."""
    os.makedirs(out, exist_ok=True)
    sky = Image.open(f'{OUT}/torres-sky.png').convert('RGBA')
    farp = f'{OUT}/torres-far.png'
    far = Image.open(farp).convert('RGBA') if os.path.exists(farp) else None
    for i, sx in enumerate((0, 420, 900)):
        view = sky.copy()
        if far is not None:
            row = Image.new('RGBA', (far.width * 2, far.height))
            row.paste(far, (0, 0))
            row.paste(far, (far.width, 0))
            view.alpha_composite(row.crop((sx, 0, sx + 1280, 720)))
        view.convert('RGB').save(f'{out}/torres-{i}.png')


def export(names):
    """Copia as camadas prontas para o jogo (256 cores com alfa, em 2x) e registra a escala no hd.json."""
    import json
    assets = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'game', 'public', 'assets')
    hdj = os.path.join(assets, 'hd.json')
    hd = json.load(open(hdj))
    for n in names:
        src = f'{OUT}/{n}.png'
        if not os.path.exists(src):
            continue
        im = Image.open(src).convert('RGBA')
        q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        q.save(os.path.join(assets, f'{n}.png'), optimize=True)
        hd[n] = 2
        print('exportado', n, os.path.getsize(os.path.join(assets, f'{n}.png')) // 1024, 'KB')
    json.dump(hd, open(hdj, 'w'), indent=1)


LAYERS = {'torres-sky': (torres_sky, 201), 'torres-far': (torres_far, 202)}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    if '--export' in sys.argv:
        export([n for n in LAYERS if want(n)])
        sys.exit(0)
    for n, (fn, seed) in LAYERS.items():
        if want(n):
            save(fn(np.random.default_rng(seed)), n)
    if PREVIEW:
        preview(PREVIEW)

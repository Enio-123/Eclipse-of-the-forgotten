"""Fundos da Cidade-Catedral para o ECLIPSE: os mesmos de fundos_cidade.py (as mesmas casas nos mesmos
lugares: o plano vem de cidade_plano.py, que refaz os sorteios do pintor antigo), repintados em 3x com
relevo: reboco com manchas e trincas, enxaimel saliente com veio de madeira, telha por telha, janelas com
caixilho e peitoril, lampiões de ferro que acendem a parede em volta.

Camadas (tamanho no mundo; as imagens têm o triplo):
  city-sky  640x360   o céu do eclipse, preso na tela
  city-far  1024x400  a cidade alta ao longe e a catedral de frente, com a rosácea acesa
  city-mid  1024x420  as casas mais perto: empenas, enxaimel, torres, chaminés, janelas acesas, varais
  claustro-mid 1024x420  a arcada do claustro do outro lado do jardim (no lugar de city-mid)

As medidas dentro do pintor estão nas unidades do plano (px da pintura 2x); K = 1,5 leva para a imagem.

uso: python3 ecl_cidade.py <pasta_saida> [camada ...] [--preview=<pasta>] [--old=<pasta 2x>]
"""
import math
import numpy as np
from scipy import ndimage as ndi
from brush import hexc, mix, sstep, blur, value_noise
from shapes import Mask
from pedra3 import Blocks, ArchRow, Light, shade, cracks, streaks, grain, cyl, grid, pnoise, wdx, wblur, TAU
from ecl_comum import Canvas, save, preview, want, put_win, flame, PREVIEW
from cidade_plano import mid_plan, far_plan, claustro_plan

K = 1.5
# a noite do eclipse (as cores de fundos_cidade.py)
SL1, SL2, SL3, SL4 = hexc(0x141b2e), hexc(0x212a42), hexc(0x323d58), hexc(0x4d5a78)
FOG0, FOG1 = hexc(0x2b3550), hexc(0x46526f)
GOLD1, GOLD2, GOLD3 = hexc(0xb4702e), hexc(0xe7ad55), hexc(0xfff0c8)
WIN0, WIN1, WIN2 = hexc(0xc8652a), hexc(0xffb860), hexc(0xffe4a8)
COLD = hexc(0x9fb0d4)
# a luz da noite: o céu frio de cima e da esquerda; o eclipse, dourado, de raspão pela direita
AMB = np.array([0.085, 0.115, 0.215], np.float32)
SKY = ((-0.3, -0.75, 0.6), np.array([0.14, 0.18, 0.32], np.float32))
ECL = ((0.85, -0.32, 0.42), np.array([0.62, 0.43, 0.19], np.float32), True)
LAMP = WIN1 * np.array([1.0, 0.92, 0.8], np.float32)
CLOTH = [hexc(0x5a2a2a), hexc(0x6a5a3a), hexc(0x4a5060), hexc(0x3a4a3a)]


def aa(d):
    """Alfa suave de uma distância para dentro (nas unidades do plano)."""
    return np.clip(d * K + 0.5, 0, 1)


def vnoise(H, W, cell, rng, octaves=2, sx=1.0, sy=1.0):
    """Ruído suave (0..1) local; sx e sy esticam (veio de madeira, escorridos)."""
    h, w = max(2, int(math.ceil(H / sy)) + 1), max(2, int(math.ceil(W / sx)) + 1)
    n = value_noise(h, w, cell, rng, octaves)
    if sx != 1.0 or sy != 1.0:
        n = ndi.zoom(n, (sy, sx), order=1)
    if n.shape[0] < H or n.shape[1] < W:
        n = np.pad(n, ((0, max(0, H - n.shape[0])), (0, max(0, W - n.shape[1]))), mode='edge')
    return n[:H, :W]


def seg_d(x, y, ax, ay, bx, by):
    """Distância de cada ponto ao segmento a-b e a posição ao longo dele (0..comprimento)."""
    vx, vy = bx - ax, by - ay
    L = math.hypot(vx, vy) or 1.0
    t = np.clip(((x - ax) * vx + (y - ay) * vy) / (L * L), 0, 1)
    return np.hypot(x - (ax + vx * t), y - (ay + vy * t)), t * L


def rim(m, dx, dy, width):
    """Luz de borda que entra `width` px na forma, vinda da direção (dx, dy)."""
    out = np.zeros_like(m)
    n = max(1, int(width))
    for k in range(1, n + 1):
        sh = np.roll(np.roll(m, -int(round(dy * k)), axis=0), -int(round(dx * k)), axis=1)
        out = np.maximum(out, np.clip(m - sh, 0, 1) * (1 - (k - 1) / n))
    return blur(out, 0.8)


class House:
    """Uma casa pintada numa janela local da tela (o plano dela vem de cidade_plano.house_plan)."""

    def __init__(self, cv, hp, lamps, rng):
        self.cv, self.hp, self.rng = cv, hp, rng
        w, kind, top, roof_h, jet = hp['w'], hp['kind'], hp['top'], hp['roof_h'], hp['jet']
        apex = top - roof_h
        ymin = min([apex - (34 if kind == 'tower' else 8)] + [cy - ch - 10 for (cx, cy, cw, ch, sm) in hp['chimneys']])
        x_lo, x_hi = -jet - 26, w + jet + 26
        ox, oy = int(math.floor((hp['x'] + x_lo) * K)), int(math.floor(ymin * K))
        LW = int(math.ceil((x_hi - x_lo) * K)) + 2
        self.rows, self.cols, py, px = cv.win(ox, oy, LW, cv.H - oy)
        self.py, self.px = py, px
        self.x = px / K - hp['x']
        self.y = py / K
        self.ox, self.oy = ox, self.rows.start
        self.LW, self.LH = LW, self.rows.stop - self.rows.start
        self.lamps = [Light(l.x - ((l.x - (ox + LW / 2) + cv.TW / 2) // cv.TW) * cv.TW, l.y, l.z, l.radius, l.color, l.power) for l in lamps]
        self.lamps = [l for l in self.lamps if ox - 330 < l.x < ox + LW + 330]

    # coordenadas do plano -> px da janela (para os polígonos)
    def P(self, pts):
        return [((self.hp['x'] + x) * K - self.ox, y * K - self.oy) for x, y in pts]

    def poly(self, pts):
        return Mask(self.LW, self.LH).poly(self.P(pts)).array()

    def paint(self):
        hp, rng, x, y = self.hp, self.rng, self.x, self.y
        LW, LH = self.LW, self.LH
        w, kind, top, base, roof_h, jet = hp['w'], hp['kind'], hp['top'], hp['base'], hp['roof_h'], hp['jet']
        floors, fh, timber = hp['floors'], hp['fh'], hp['timber']
        apex = top - roof_h
        upper_y = top + fh * (floors - 1)
        tower = kind == 'tower'

        tex = vnoise(LH, LW, 27, rng, 3)
        fine = vnoise(LH, LW, 3.4, rng, 2)
        trowel = vnoise(LH, LW, 8, rng, 2, sx=2.6)
        gh_ = vnoise(LH, LW, 2.6, rng, 2, sx=9.0)       # veio deitado
        gv_ = vnoise(LH, LW, 2.6, rng, 2, sy=9.0)       # veio em pé

        # ---------- as formas ----------
        up = (y < upper_y) & (jet > 0)
        x0 = np.where(up, -jet, 0.0)
        x1 = np.where(up, w + jet, w)
        body = aa(np.minimum(np.minimum(x - x0, x1 - x), y - top))
        gw = None
        dorm = np.zeros((LH, LW), np.float32)
        if kind == 'gable':
            gw = self.poly([(-jet + 8, top + 1), (w / 2, apex + 15), (w + jet - 8, top + 1)])
            roof = np.clip(self.poly([(-jet - 9, top + 3), (w / 2, apex), (w + jet + 9, top + 3)]) - gw, 0, 1)
            body = np.maximum(body, gw)
        elif kind == 'side':
            roof = self.poly([(-jet - 12, top + 3), (14, apex), (w - 14, apex), (w + jet + 12, top + 3)])
            for (dx, dw, dy) in hp['dormers']:
                dorm = np.maximum(dorm, aa(np.minimum(np.minimum(x - dx, dx + dw - x), np.minimum(y - dy, top + 3 - y))))
        else:
            roof = self.poly([(-6, top + 3), (w / 2, apex), (w + 6, top + 3)])
            body = np.maximum(body, aa(np.minimum(np.minimum(x + 5, w + 5 - x), np.minimum(y - top, top + 10 - y))))
        chim = np.zeros((LH, LW), np.float32)
        for (cx, cy, cw, ch, sm) in hp['chimneys']:
            chim = np.maximum(chim, aa(np.minimum(np.minimum(x - (cx - cw / 2), cx + cw / 2 - x), np.minimum(y - (cy - ch), cy + 20 - y))))
            chim = np.maximum(chim, aa(np.minimum(np.minimum(x - (cx - cw / 2 - 3), cx + cw / 2 + 3 - x), np.minimum(y - (cy - ch - 5), cy - ch + 2 - y))))

        # ---------- o reboco ----------
        tone = hp['tone']
        plaster = mix(hexc(0x9c9484), hexc(0xbcb098), tone) * hp['shade']
        if tower:
            plaster = mix(hexc(0x8e8c88), hexc(0xa8a298), tone) * hp['shade']
        alb = plaster * (0.8 + 0.4 * tex)[..., None] * (0.9 + 0.2 * fine)[..., None]
        hgt = (fine - 0.5) * 0.3 + (trowel - 0.5) * 0.8 + (tex - 0.5) * 1.6
        # escorridos escuros embaixo do beiral e manchas de umidade perto da rua
        drip = sstep(0.52, 0.8, vnoise(LH, LW, 5.0, rng, 2, sy=12.0))
        dk = sstep(top + 70.0, top + 4.0, y) * 0.8 + 0.25
        alb = alb * (1 - 0.38 * drip * dk)[..., None]
        damp = sstep(base - 150.0, base - 10.0, y + (tex - 0.5) * 60.0)
        alb = mix(alb, alb * hexc(0x8a9a86) * 0.75, (damp * 0.7)[..., None])
        cr = cracks(LH, LW, rng, n=int(2 + w / 60), length=(40, 150), width=0.9)
        hgt -= cr * 1.2
        alb = alb * (1 - 0.6 * cr)[..., None]
        if tower:
            # torre de pedra: fiadas fracas
            TB = Blocks(self.py - self.oy, self.px - self.ox, LW, 12.5, 24.0, rng, vary=0.35)
            tf = TB.face(1.0, 1.6)
            hgt += tf * 0.7 + (TB.r(0) - 0.5) * 0.6 * tf
            alb = alb * (0.9 + 0.2 * TB.r(3))[..., None]
            alb = mix(alb, alb * 0.62, ((1 - tf) * 0.45)[..., None])
        elif not timber:
            # onde o reboco caiu aparece o tijolo
            fall = sstep(0.7, 0.76, vnoise(LH, LW, 46, rng, 2) * (0.75 + 0.5 * tex)) * body
            BK = Blocks(self.py - self.oy, self.px - self.ox, LW, 7.0, 17.0, rng, vary=0.1)
            bf = BK.face(1.2, 1.6)
            brick = mix(hexc(0x7a5240), hexc(0x94664c), BK.r(3)[..., None]) * (0.8 + 0.4 * fine)[..., None]
            brick = mix(hexc(0x5a554e), brick, bf[..., None])
            alb = mix(alb, brick, fall[..., None])
            hgt = hgt * (1 - fall) + (-1.8 + bf * 1.2 + (BK.r(0) - 0.5) * 0.6) * fall

        # o balanço: os andares de cima avançam, com as pontas das vigas embaixo
        level = np.zeros((LH, LW), np.float32)
        if jet > 0:
            level += 4.5 * up
            joist = (np.abs(((x + 6.0) % 12.0) - 6.0) < 2.0) & (y >= upper_y + 2.2) & (y < upper_y + 6.4) & (x > 1) & (x < w - 1)
            level = np.where(joist, 5.5, level)
            alb = np.where(joist[..., None], hexc(0x3c2e22) * (0.8 + 0.4 * gh_)[..., None], alb)

        # ---------- o enxaimel ----------
        wood_m = np.zeros((LH, LW), np.float32)
        wood_h = np.zeros((LH, LW), np.float32)
        wood_g = np.zeros((LH, LW), np.float32)
        beams = []
        if timber:
            for i in range(floors + 1):
                yb = top + i * fh
                ext = jet if i < floors else 0
                beams.append((-ext, yb, w + ext, yb, 5.0, 'h'))
            for pxu in hp['posts']:
                beams.append((pxu, top, pxu, base + 60, 4.0, 'v'))
            if jet > 0:
                for pxu in (-jet + 2, w + jet - 2):
                    beams.append((pxu, top, pxu, upper_y, 4.0, 'v'))
            for (xa, ya, xb, yb) in hp['braces']:
                beams.append((xa, ya, xb, yb, 3.5, 'd'))
            if kind == 'gable':
                beams.append((w / 2, apex + 18, w / 2, top, 4.0, 'v'))
                yc = top - roof_h * 0.5 + 6
                beams.append((w * 0.25, yc, w * 0.75, yc, 3.5, 'h'))
            for (ax, ay, bx, by, wd, o) in beams:
                d, _t = seg_d(x, y, ax, ay, bx, by)
                e = (wd / 2 - d) * K
                m = np.clip(e + 0.5, 0, 1)
                g = gh_ if o == 'h' else gv_ if o == 'v' else (gh_ + gv_) * 0.5
                hb = 2.6 * sstep(0.0, 1.8, e) + (g - 0.5) * 0.9
                take = m > wood_m
                wood_h = np.where(take, hb, wood_h)
                wood_g = np.where(take, g, wood_g)
                wood_m = np.maximum(wood_m, m)
            wood_m *= body
        oak = mix(hexc(0x35291f), hexc(0x55412e), wood_g[..., None]) * (0.85 + 0.3 * tex)[..., None]
        oak = mix(oak, hexc(0x5a5850) * (0.7 + 0.5 * wood_g)[..., None], (sstep(0.55, 0.9, tex) * 0.45)[..., None])     # madeira velha, cinzenta
        alb = mix(alb, oak, wood_m[..., None])
        hgt = hgt * (1 - wood_m) + wood_h * wood_m

        # ---------- as janelas ----------
        lights = list(self.lamps)
        glass_m = np.zeros((LH, LW), np.float32)
        glass_c = np.zeros((LH, LW, 3), np.float32)
        halo = np.zeros((LH, LW), np.float32)
        sun_k = np.ones((LH, LW), np.float32)
        wins = list(hp['wins'])
        for (dx, dw, dy) in hp['dormers']:
            wins.append((dx + dw / 2, dy + 7.0, 10, 13, bool(rng.random() < 0.3), False, True))
        for (cx, y0, ww, wh, lit, shut, small) in wins:
            e_in = np.minimum(np.minimum(ww / 2 - np.abs(x - cx), y - y0), y0 + wh - y) * K
            op = np.clip(e_in + 0.5, 0, 1)
            if op.max() <= 0:
                continue
            # o peitoril de pedra e a verga de madeira
            sill = aa(np.minimum(np.minimum(ww / 2 + 3.5 - np.abs(x - cx), y - (y0 + wh)), y0 + wh + 4.2 - y))
            lint = aa(np.minimum(np.minimum(ww / 2 + 2.6 - np.abs(x - cx), y - (y0 - 3.6)), y0 - y)) * (0.0 if timber and not small else 1.0)
            hgt = hgt * (1 - sill) + (5.0 - 2.2 * sstep(y0 + wh + 2.2, y0 + wh + 4.2, y)) * sill
            alb = mix(alb, plaster * 1.25 * (0.85 + 0.3 * fine)[..., None], sill[..., None])
            hgt = hgt * (1 - lint) + (1.8 + (gh_ - 0.5) * 0.8) * lint
            alb = mix(alb, mix(hexc(0x35291f), hexc(0x55412e), gh_[..., None]), lint[..., None])
            wood_m = np.maximum(wood_m * (1 - op), 0)
            # as folhas de madeira abertas dos lados
            if shut:
                for sgn in (-1, 1):
                    sx_ = cx + sgn * (ww / 2 + 6.0)
                    sm_ = aa(np.minimum(np.minimum(5.5 - np.abs(x - sx_), y - y0), y0 + wh - y))
                    plank = sstep(0.25, 0.9, np.abs(((x - sx_ + 5.5) % 3.67) - 1.83) * K)
                    bat = np.maximum(np.clip(1 - np.abs(y - (y0 + wh * 0.2)) / 1.5, 0, 1), np.clip(1 - np.abs(y - (y0 + wh * 0.8)) / 1.5, 0, 1))
                    hgt = hgt * (1 - sm_) + (2.2 + plank * 0.8 + bat * 1.4 + (gv_ - 0.5) * 0.7) * sm_
                    sc = mix(hexc(0x6a4a30), hexc(0x8a5e3a), gv_[..., None]) * (0.55 + 0.45 * plank)[..., None]
                    alb = mix(alb, sc, sm_[..., None])
            # o vão: caixilho de madeira, a cruz de chumbo e o vidro
            frame = np.clip(2.8 - e_in, 0, 1) * op
            bar = np.maximum(np.clip((1.0 - np.abs(x - cx)) * K + 0.5, 0, 1), np.clip((1.0 - np.abs(y - (y0 + wh * 0.45))) * K + 0.5, 0, 1)) * op
            hgt = hgt * (1 - op) + (-6.0 + 3.2 * frame + 2.0 * bar * (1 - frame)) * op
            alb = mix(alb, hexc(0x2e241c) * (0.8 + 0.4 * gv_)[..., None], op[..., None])
            g_m = op * (1 - np.clip(frame + bar, 0, 1))
            if lit:
                g = np.clip(1 - np.hypot((x - cx) / (ww * 0.6), (y - y0 - wh * 0.62) / (wh * 0.6)), 0, 1)
                gc = mix(WIN0, WIN1, g[..., None])
                gc = mix(gc, WIN2, (g ** 3 * 0.5)[..., None])
                # os losangos de chumbo, bem finos, e uma cortina de um lado
                dia = np.minimum(np.abs(((x - cx + (y - y0)) % 4.4) - 2.2), np.abs(((x - cx - (y - y0)) % 4.4) - 2.2)) * K
                gc = gc * (1 - 0.22 * sstep(0.9, 0.2, dia))[..., None]
                if rng.random() < 0.55:
                    sgn = 1 if rng.random() < 0.5 else -1
                    cur = sstep(ww * 0.12, ww * 0.34, sgn * (x - cx) + (y - y0) / wh * ww * 0.14)
                    fold = 0.75 + 0.25 * np.sin((x - cx) * 2.6 + (y - y0) * 0.15)
                    gc = mix(gc, gc * hexc(0xc87a4a) * 0.95 * fold[..., None], (cur * 0.75)[..., None])
                if rng.random() < 0.3:
                    # um vaso no peitoril de dentro
                    vx = cx + rng.uniform(-0.2, 0.2) * ww
                    pot = aa(np.minimum(2.2 - np.abs(x - vx), y - (y0 + wh - 5.0)))
                    leaf = np.clip(1 - np.hypot((x - vx) / 3.4, (y - (y0 + wh - 8.5)) / 3.6), 0, 1) * (0.5 + 0.5 * np.sin(x * 4.0 + y * 3.0) > 0.35)
                    gc = mix(gc, hexc(0x2a1608), np.clip(pot + sstep(0.1, 0.4, leaf), 0, 1)[..., None] * 0.92)
                halo = np.maximum(halo, np.exp(-(np.hypot(x - cx, (y - y0 - wh / 2) * 0.8) / (ww * 1.3)) ** 2))
                lights.append(Light((hp['x'] + cx) * K, (y0 + wh * 0.62) * K, 7.0, ww * K * 1.15, WIN1, 0.9))
            else:
                gc = mix(hexc(0x0a0d17), hexc(0x161d2e), np.clip((y - y0) / wh, 0, 1)[..., None])
                # o vidro escuro devolve um pouco do céu
                refl = np.clip(1 - np.abs((x - cx) + (y - y0) * 0.6 - ww * 0.2) / (ww * 0.22), 0, 1) * (y < y0 + wh * 0.44)
                gc = gc + hexc(0x2a3550) * (refl * 0.5)[..., None]
            glass_c = np.where((g_m > glass_m)[..., None], gc, glass_c)
            glass_m = np.maximum(glass_m, g_m)
            # a parede de cima faz sombra no vão; o peitoril, na parede embaixo dele
            sun_k *= 1 - op * 0.75 * sstep(y0 + wh * 0.55, y0, y)
            sun_k *= 1 - 0.5 * sstep(y0 + wh + 16.0, y0 + wh + 4.2, y) * (y > y0 + wh + 4.2) * aa(ww / 2 + 3.5 - np.abs(x - cx))
        hgt += level
        if tower:
            # a cornija embaixo do telhado, com os cachorros de pedra
            band = aa(np.minimum(np.minimum(x + 5, w + 5 - x), np.minimum(y - top, top + 10 - y)))
            corb = aa(np.minimum(np.minimum(x, w - x), np.minimum(y - (top + 10), top + 15.5 - y))) * sstep(1.2, 2.2, np.abs(((x + 1.0) % 7.0) - 3.5))
            hgt = hgt * (1 - band) + (4.0 + (fine - 0.5) * 0.6) * band + corb * 2.6
            alb = mix(alb, plaster * 1.05 * (0.85 + 0.3 * fine)[..., None], band[..., None])
            sun_k *= 1 - 0.55 * sstep(top + 30.0, top + 15.0, y) * (y > top + 10.0)
        a = np.clip(body, 0, 1)

        # ---------- a água-furtada (a parede dela sobe do beiral) ----------
        if dorm.max() > 0:
            a = np.maximum(a, dorm)

        # ---------- a chaminé de tijolo ----------
        if chim.max() > 0:
            CK = Blocks(self.py - self.oy, self.px - self.ox, LW, 6.5, 15.0, rng, vary=0.1)
            cf = CK.face(1.1, 1.5)
            cb = mix(hexc(0x70503e), hexc(0x8c6248), CK.r(3)[..., None]) * (0.78 + 0.44 * fine)[..., None]
            cb = mix(cb, hexc(0x2a2624), (sstep(0.5, 0.9, tex) * 0.55)[..., None])            # fuligem
            cb = mix(hexc(0x4c4842), cb, cf[..., None])
            chh = 2.0 + cf * 1.2 + (CK.r(0) - 0.5) * 0.7
            cap = np.zeros((LH, LW), np.float32)
            for (cx, cy, cw, ch, sm) in hp['chimneys']:
                cap = np.maximum(cap, aa(np.minimum(np.minimum(x - (cx - cw / 2 - 3), cx + cw / 2 + 3 - x), np.minimum(y - (cy - ch - 5), cy - ch + 2 - y))))
            chh = np.where(cap > 0.5, 5.0 + (fine - 0.5), chh)
            cb = mix(cb, hexc(0x8a8880) * (0.8 + 0.4 * fine)[..., None], cap[..., None])
            alb = mix(alb, cb, chim[..., None] * (1 - body)[..., None])
            hgt = np.where((chim > 0.5) & (body < 0.5), chh, hgt)
            a = np.maximum(a, chim)

        # ---------- o telhado ----------
        ra, rh_ = self.roof_tiles(kind, roof, tex, fine, apex, top)
        if kind == 'side' and dorm.max() > 0:
            # a parede da água-furtada fica na frente do telhado; o telhadinho dela por cima
            keep = dorm
            alb_d, hgt_d = alb.copy(), hgt.copy()
            alb = mix(alb, ra, roof[..., None])
            hgt = hgt * (1 - roof) + rh_ * roof
            alb = mix(alb, alb_d, keep[..., None])
            hgt = hgt * (1 - keep) + (hgt_d + 3.0) * keep
            for (dx, dw, dy) in hp['dormers']:
                tri = self.poly([(dx - 3.5, dy + 2), (dx + dw / 2, dy - dw * 0.65), (dx + dw + 3.5, dy + 2)])
                inner = self.poly([(dx + 1.5, dy + 2), (dx + dw / 2, dy - dw * 0.65 + 5.0), (dx + dw - 1.5, dy + 2)])
                verge = np.clip(tri - inner, 0, 1)
                alb = mix(alb, plaster * 0.95 * (0.85 + 0.3 * fine)[..., None], inner[..., None])
                hgt = hgt * (1 - inner) + 9.0 * inner
                alb = mix(alb, hexc(0x4a4852) * (0.8 + 0.4 * tex)[..., None], verge[..., None])
                hgt = hgt * (1 - verge) + 12.0 * verge
                a = np.maximum(a, tri)
        else:
            alb = mix(alb, ra, roof[..., None])
            hgt = hgt * (1 - roof) + rh_ * roof
        a = np.maximum(a, roof)
        # a sombra do beiral na parede
        if kind != 'gable':
            sun_k *= 1 - 0.6 * sstep(top + 3.0 + 20.0, top + 3.0, y) * (y > top + 3.0) * (1 - roof) * (1 - dorm)
        else:
            d_out = self.verge_d
            sun_k *= 1 - 0.5 * sstep(22.0, 12.0, d_out) * (gw > 0.5)
        if jet > 0:
            sun_k *= 1 - 0.55 * sstep(upper_y + 30.0, upper_y + 2.0, y) * (y > upper_y + 2.0) * (x > 0) * (x < w)

        # ---------- a luz ----------
        col = shade(alb, hgt, self.py, self.px, LW, AMB, sun=SKY, sun2=ECL, lights=lights, k=1.0, spec=0.0, wrap=False, sun_k=sun_k)
        # mais céu no alto, menos perto da rua (como antes)
        col *= (1.12 - 0.3 * sstep(top, base, y))[..., None]
        if tower:
            u = np.clip((x - w / 2) / (w / 2), -1.2, 1.2)
            col *= (1 + body * (1 - roof) * (0.3 - 0.75 * sstep(-0.8, 0.9, u)))[..., None]
        # a névoa quente em volta das janelas acesas (o ar da rua)
        wallc = plaster * AMB * 3.0
        col = mix(col, WIN0 * 0.55 + wallc * 0.3, (halo * 0.42 * (1 - glass_m))[..., None])
        col = mix(col, glass_c, glass_m[..., None])
        # a contraluz do eclipse nas beiras da direita e o céu frio nos topos (a silhueta)
        full = np.clip(a, 0, 1)
        gold = rim(full, 1, -0.35, 6)
        cold = rim(full, -0.25, -1, 4)
        var = 0.6 + 0.8 * fine
        col = mix(col, GOLD2 * 0.85 + col * 0.25, np.clip(gold * 0.45 * var, 0, 1)[..., None])
        col = mix(col, COLD * 0.5 + col * 0.5, np.clip(cold * 0.33 * var, 0, 1)[..., None])
        # o ar entre a casa e quem olha: um pouco de névoa, mais perto da rua
        col = mix(col, FOG0 * 0.85, (0.1 + 0.3 * sstep(base - 260.0, base, y))[..., None])
        self.cv.over(self.rows, self.cols, np.clip(col, 0, 1), full)
        return lights

    def roof_tiles(self, kind, roof, tex, fine, apex, top):
        """A cor e a altura do telhado: ardósia em fiadas (cada telha com o seu tom), cumeeira e espigões;
        na empena, a aba de madeira com a ponta das telhas; na torre, o cone de telhas que fecham no bico."""
        hp, rng, x, y = self.hp, self.rng, self.x, self.y
        w, jet = hp['w'], hp['jet']
        LW, LH = self.LW, self.LH
        rnd = rng.random((4, 4096)).astype(np.float32)
        slate0, slate1 = hexc(0x333133), hexc(0x4a4849)
        if rng.random() < 0.3:
            slate0, slate1 = hexc(0x3f332c), hexc(0x554439)       # um telhado de barro velho de vez em quando
        self.verge_d = None
        if kind == 'tower':
            v = np.clip((y - apex) / (hp['roof_h'] + 3.0), 0.001, 1)
            half = (w / 2 + 6.0) * v
            u = np.clip((x - w / 2) / np.maximum(half, 0.5), -1, 1)
            th = np.arcsin(u)                                       # a volta do cone
            ry = (y - apex) / 9.0
            row = np.floor(ry)
            fy = ry - row
            ncol = np.maximum(3, np.round(((w / 2 + 6.0) * (row + 0.5) * 9.0 / (hp['roof_h'] + 3.0)) * math.pi / 7.0))
            tc = (th / math.pi + 0.5) * ncol + (row % 2) * 0.5
            ti = np.floor(tc)
            fx = tc - ti
            key = (row.astype(np.int64) * 131 + ti.astype(np.int64) * 977) % 4096
            gap = np.minimum(fx, 1 - fx) * 7.0 * K * np.cos(th)
            ht = 6.0 + 1.0 + 2.2 * fy + (rnd[0][key] - 0.5) * 0.9 - 1.5 * sstep(1.4, 0.3, gap)
            ca = mix(slate0, slate1, rnd[1][key][..., None]) * (0.78 + 0.44 * tex)[..., None] * (0.9 + 0.2 * fine)[..., None]
            ca = ca * (1 - 0.5 * sstep(0.82, 1.0, fy))[..., None]
            # o cone é redondo: o lado esquerdo pega o céu, o direito some na sombra
            ca = ca * (1.25 - 0.85 * sstep(-0.7, 0.9, u))[..., None]
            # o mastro e a bandeirola
            pole = aa(1.2 - np.abs(x - w / 2)) * (y < apex + 2) * (y > apex - 22)
            flag = self.poly([(w / 2, apex - 22), (w / 2 + 14, apex - 17), (w / 2, apex - 12)])
            extra = np.clip(pole + flag, 0, 1)
            roof[:] = np.maximum(roof, extra)
            ca = mix(ca, hexc(0x2a2c3a), extra[..., None])
            ht = np.where(extra > 0.5, 3.0, ht)
            return ca, ht
        # telhas em fiadas
        ry = (y - apex) / 9.0
        row = np.floor(ry)
        fy = ry - row
        xo = x + (row % 2) * 3.75 + rnd[3][(row.astype(np.int64) * 53) % 4096] * 2.0
        ti = np.floor(xo / 7.5)
        fx = xo / 7.5 - ti
        key = (row.astype(np.int64) * 131 + ti.astype(np.int64) * 977) % 4096
        fy = np.clip(fy + (rnd[2][key] - 0.5) * 0.14, 0, 1)
        gap = np.minimum(fx, 1 - fx) * 7.5 * K
        ht = 6.0 + 1.0 + 2.3 * fy + (rnd[0][key] - 0.5) * 1.0 - 1.5 * sstep(1.4, 0.3, gap)
        ca = mix(slate0, slate1, rnd[1][key][..., None]) * (0.78 + 0.44 * tex)[..., None] * (0.9 + 0.2 * fine)[..., None]
        ca = ca * (1 - 0.45 * sstep(0.84, 1.0, fy))[..., None]
        lost = rnd[2][key] < 0.018                                   # falta uma telha aqui e ali
        ht = np.where(lost, 5.0, ht)
        ca = np.where(lost[..., None], ca * 0.35, ca)
        # musgo perto do beiral e em manchas
        moss = sstep(0.55, 0.8, vnoise(LH, LW, 20, rng, 3)) * sstep(top - 46.0, top + 3.0, y + (tex - 0.5) * 30.0)
        ca = mix(ca, hexc(0x4a5a34) * (0.7 + 0.6 * fine)[..., None], (moss * 0.6)[..., None])
        if kind == 'side':
            # cumeeira: telhas de meia-cana deitadas em cima
            rk = (y - apex) / 4.6
            ridge = np.clip(1 - np.abs(rk - 0.5) * 2, 0, 1) ** 0.5 * (rk < 1) * (x > 12) * (x < w - 12)
            rj = sstep(0.3, 1.0, np.abs(((x + 4.5) % 9.0) - 4.5) * K)
            ht = np.where(rk < 1, 8.0 + 3.0 * ridge + rj * 0.8, ht)
            ca = np.where((rk < 1)[..., None], mix(slate0, slate1, 0.8) * (0.6 + 0.4 * rj)[..., None] * (0.8 + 0.4 * tex)[..., None], ca)
            # espigões nas duas descidas
            for (ax, ay, bx, by) in ((-jet - 12, top + 3, 14, apex), (w + jet + 12, top + 3, w - 14, apex)):
                d, t = seg_d(x, y, ax, ay, bx, by)
                hip = np.clip((3.2 - d) * K * 0.6, 0, 1)
                hj = sstep(0.3, 1.0, np.abs(((t + 4.5) % 9.0) - 4.5) * K)
                ht = ht * (1 - hip) + (9.5 + hj * 0.8) * hip
                ca = mix(ca, mix(slate0, slate1, 0.85) * (0.6 + 0.4 * hj)[..., None], hip[..., None])
            return ca, ht
        # empena: a aba (a tábua de beira e, por fora, a ponta das telhas)
        dl, tl = seg_d(x, y, -jet - 9, top + 3, w / 2, apex)
        dr, tr = seg_d(x, y, w + jet + 9, top + 3, w / 2, apex)
        left = x < w / 2
        d_out = np.where(left, dl, dr)
        t_al = np.where(left, tl, tr)
        self.verge_d = d_out
        tile = d_out < 4.6
        tj = sstep(0.3, 1.0, np.abs(((t_al + 3.75) % 7.5) - 3.75) * K)
        board_g = vnoise(LH, LW, 2.6, rng, 2, sx=5.0, sy=5.0)
        ca = np.where(tile[..., None], mix(slate0, slate1, rnd[1][(np.floor((t_al + 3.75) / 7.5).astype(np.int64) * 131) % 4096][..., None]) * (0.55 + 0.45 * tj)[..., None],
                      mix(hexc(0x35291f), hexc(0x55412e), board_g[..., None]))
        ht = np.where(tile, 10.0 + tj * 1.0, 7.0 + (board_g - 0.5) * 0.8 + 1.5 * sstep(4.6, 6.5, d_out) * sstep(13.0, 9.5, d_out))
        return ca * (0.8 + 0.4 * tex)[..., None], ht


def smoke(cv, x, y, rng):
    """A fumaça de uma chaminé: sobe e deita para a direita, rala (x, y em px da tela)."""
    LW, LH = 300, 330
    rows, cols, py, px = cv.win(x - 70, y - LH + 20, LW, LH)
    if rows.stop <= rows.start:
        return
    n1 = vnoise(rows.stop - rows.start, LW, 26, rng, 3)
    n2 = vnoise(rows.stop - rows.start, LW, 9, rng, 2)
    acc = np.zeros(n1.shape, np.float32)
    for k in range(14):
        cx = x + k * 5.25 + rng.normal(0, 3.0)
        cy = y - k * 10.5
        r = (6.0 + k * 1.6) * K
        acc += np.exp(-(np.hypot(px - cx, py - cy) / r) ** 2) * (0.085 - 0.035 * k / 14)
    acc *= 0.35 + 1.3 * n1 * (0.6 + 0.8 * n2)
    cv.over(rows, cols, mix(SL3, SL4, n2[..., None]), np.clip(acc, 0, 0.5))


def lantern(cv, x, y, dirn, rng):
    """Lampião de ferro batido num braço que sai da parede (x, y do plano: onde o braço nasce)."""
    tip = dirn * 26.0
    LW, LH = 174, 156
    ox, oy = int((x + tip - 58) * K), int((y - 31) * K)
    rows, cols, py, px = cv.win(ox, oy, LW, LH)
    if rows.stop <= rows.start:
        return
    ux, uy = px / K - x, py / K - y
    m = Mask(LW, rows.stop - rows.start)
    P = lambda pts: [((x + a) * K - ox, (y + b) * K - rows.start) for a, b in pts]
    m.line(P([(0, 2), (tip, 2)]), 3.0 * K)
    m.line(P([(0, 14), (dirn * 14, 2)]), 2.2 * K)
    # a voluta embaixo do braço e a chapa na parede
    pts = []
    for i in range(22):
        t = i / 21
        ang = math.pi * 1.5 * t
        r = 5.2 * (1 - 0.55 * t)
        pts.append((dirn * (17.0 + math.cos(ang + math.pi / 2) * r * -1), 8.0 + math.sin(ang + math.pi / 2) * r - 2.0))
    m.line(P(pts), 1.5 * K)
    m.rect(*[v for p in P([(-1.6, -3), (1.6, 18)]) for v in p])
    m.line(P([(tip, 2), (tip, 10)]), 1.6 * K)
    m.poly(P([(tip - 7, 10), (tip + 7, 10), (tip + 5, 14), (tip - 5, 14)]))
    m.poly(P([(tip - 2.5, 7.5), (tip + 2.5, 7.5), (tip + 4, 10), (tip - 4, 10)]))
    m.poly(P([(tip - 5, 28), (tip + 5, 28), (tip + 7, 32), (tip - 7, 32)]))
    for bx in (-5.2, 0.0, 5.2):
        m.line(P([(tip + bx, 14), (tip + bx * 1.06, 28)]), 1.0 * K)
    iron = m.array()
    gl = Mask(LW, rows.stop - rows.start).poly(P([(tip - 5, 14), (tip + 5, 14), (tip + 5.5, 28), (tip - 5.5, 28)])).array()
    # o clarão no ar
    for r, k in ((46.0, 0.08), (24.0, 0.12), (12.0, 0.2)):
        g = np.exp(-(np.hypot(ux - tip, uy - 21.0) / r) ** 2) * np.clip(1 - (np.hypot(ux - tip, uy - 21.0) / 49.0) ** 4, 0, 1)
        cv.over(rows, cols, WIN0, g * k)
    fl = np.exp(-((ux - tip) / 2.6) ** 2 - ((uy - 22.5) / 5.0) ** 2)
    cv.over(rows, cols, mix(mix(WIN1, WIN2, 0.4), GOLD3, fl[..., None]), gl)
    col = np.broadcast_to(hexc(0x07080d), iron.shape + (3,)).copy()
    # o ferro pega o dourado de um lado e a luz da própria chama por dentro
    edge_w = np.clip(iron - np.roll(iron, -2 * (1 if dirn > 0 else -1), axis=1), 0, 1) * np.exp(-(np.hypot(ux - tip, uy - 21.0) / 16.0) ** 2)
    col = mix(col, WIN1 * 0.8, (edge_w * 0.8)[..., None])
    top = np.clip(iron - np.roll(iron, 2, axis=0), 0, 1)
    col = mix(col, COLD * 0.35, (top * 0.5)[..., None])
    cv.over(rows, cols, col, iron)


def laundry(cv, xa, xb, y, sag, cloths, rng):
    """O varal entre duas casas: a corda com a barriga e os panos pendurados, com dobras."""
    n = 40
    ox, oy = int(xa * K) - 6, int((y - 8) * K)
    LW, LH = int((xb - xa) * K) + 12, int((sag + 60) * K)
    rows, cols, py, px = cv.win(ox, oy, LW, LH)
    if rows.stop <= rows.start:
        return
    line_y = lambda t: y + sag * math.sin(math.pi * t)
    m = Mask(LW, rows.stop - rows.start)
    m.line([((xa + (xb - xa) * i / n) * K - ox, line_y(i / n) * K - rows.start) for i in range(n + 1)], 1.1 * K)
    cv.over(rows, cols, hexc(0x0a0c14), m.array())
    ux, uy = px / K, py / K
    for (t, cw, ch, ci, sway, low) in cloths:
        cx, cy = xa + (xb - xa) * t, line_y(t)
        mm = Mask(LW, rows.stop - rows.start)
        P = lambda pts: [(a * K - ox, b * K - rows.start) for a, b in pts]
        mm.poly(P([(cx - cw / 2, cy - 0.5), (cx + cw / 2, cy - 0.5), (cx + cw / 2 + sway, cy + ch), (cx - cw / 2 + sway, cy + ch * low)]))
        am = mm.array()
        v = np.clip((uy - cy) / ch, 0, 1)
        fold = 0.5 + 0.5 * np.sin((ux - cx - sway * v) * 1.35 + ci * 1.7 + np.sin(uy * 0.25) * 0.8)
        c = CLOTH[ci] * 0.75 * (1.12 - 0.35 * v)[..., None]
        c = c * (0.72 + 0.4 * fold * (0.4 + 0.6 * v))[..., None]
        # a bainha de cima dobrada na corda e os pregadores
        c = c * (1 + 0.35 * np.clip(1 - (uy - cy) / 2.2, 0, 1))[..., None]
        right = np.clip(am - np.roll(am, -3, axis=1), 0, 1)
        c = mix(c, GOLD2 * 0.7, (right * 0.45)[..., None])
        cv.over(rows, cols, np.clip(c, 0, 1), am * 0.97)
        for sx in (-0.3, 0.3):
            pg = np.clip(1.1 - np.abs(ux - (cx + sx * cw)), 0, 1) * np.clip(2.2 - np.abs(uy - cy), 0, 1)
            cv.over(rows, cols, hexc(0x2a2018), np.clip(pg * K, 0, 1))


def on_wall(plan, lan):
    """O lampião do plano, preso de verdade na casa dele: o pintor antigo sorteava a altura sem olhar a casa
    e alguns ficavam no ar, ao lado do telhado. O braço desce para a parede, logo embaixo do beiral (e
    acompanha o balanço do andar de cima)."""
    lx, ly, d = lan
    TW = plan['TW']
    for hp in plan['houses']:
        edge = hp['x'] + hp['w'] if d > 0 else hp['x']
        if abs((edge - lx + TW / 2) % TW - TW / 2) < 0.01:
            y = max(ly, hp['top'] + 11.0)
            upper = hp['top'] + hp['fh'] * (hp['floors'] - 1)
            jet = hp['jet'] if y + 18.0 < upper else 0.0
            return (lx + d * jet, y, d)
    return lan


def city_mid(rng):
    plan = mid_plan(np.random.default_rng(63))
    TW, H = 3072, 1260
    cv = Canvas(TW, H)
    yy, xx = grid(TW, H)
    base = plan['base']
    lanterns = [on_wall(plan, l) for l in plan['lanterns']]
    lamps = [Light((lx + d * 26.0) * K, (ly + 21.0) * K, 15.0, 118.0, LAMP, 1.55) for (lx, ly, d) in lanterns]
    for hp in plan['houses']:
        House(cv, hp, lamps, rng).paint()
    # a fumaça das chaminés
    for hp in plan['houses']:
        for (cx, cy, cw, ch, sm) in hp['chimneys']:
            if sm:
                smoke(cv, (hp['x'] + cx) * K, (cy - ch - 6.0) * K, rng)
    for (xa, xb, y, sag, cloths) in plan['lines']:
        laundry(cv, xa, xb, y, sag, cloths, rng)
    for (lx, ly, d) in lanterns:
        lantern(cv, lx, ly, d, rng)
    # a névoa da rua embaixo
    mist_n = pnoise(H, TW, 75, rng, 3, sx=3.0)
    fine_n = pnoise(H, TW, 24, rng, 2, sx=2.0)
    m1 = np.clip(sstep(900.0, 1200.0, yy + (mist_n - 0.5) * 75.0 + (fine_n - 0.5) * 24.0), 0, 1) * 0.92
    rows, cols = slice(0, H), np.arange(TW)
    cv.over(rows, cols, mix(SL1, FOG0, 0.45), m1)
    cv.over(rows, cols, SL1 * 0.9, sstep(1140.0, 1260.0, yy))
    cv.col[:] = grain(cv.col, rng, 0.025)
    return cv


# ======================================================================================
# A cidade alta ao longe e a catedral
# ======================================================================================
# luz sem cor (a parede lisa dá 1): o relevo só clareia e escurece a cor de cada plano, que é a de antes
AMBN = np.array([0.42, 0.42, 0.42], np.float32)
SKYN = ((-0.3, -0.75, 0.6), np.array([0.97, 0.97, 0.97], np.float32))


def ecln(k):
    return ((0.85, -0.32, 0.42), np.array([1.5, 1.05, 0.5], np.float32) * k, True)


def lancet_d(x, y, cx, w, apex, bottom, k=0.75):
    """Distância para dentro de um vão gótico (arco quebrado de largura w, do ápice até bottom)."""
    r = k * w
    off = r - w / 2
    hh = math.sqrt(max(r * r - off * off, 1.0))
    spring = apex + hh
    d1 = np.hypot(x - (cx - off), y - spring) - r
    d2 = np.hypot(x - (cx + off), y - spring) - r
    arch = np.maximum(np.maximum(d1, d2), y - spring - 0.5)
    body = np.maximum(np.abs(x - cx) - w / 2, np.maximum(spring - y, y - bottom))
    return -np.minimum(arch, body)


def wrim(m, dx, dy, width):
    """rim() para uma tela inteira que dá a volta."""
    out = np.zeros_like(m)
    n = max(1, int(width))
    for k in range(1, n + 1):
        sh = np.roll(m, -int(round(dx * k)), axis=1)
        s = int(round(dy * k))
        if s:
            sh2 = np.empty_like(sh)
            if s < 0:
                sh2[-s:] = sh[:s]
                sh2[:-s] = sh[:1]
            else:
                sh2[:-s] = sh[s:]
                sh2[-s:] = sh[-1:]
            sh = sh2
        out = np.maximum(out, np.clip(m - sh, 0, 1) * (1 - (k - 1) / n))
    return wblur(out, 0.8)


class Plane:
    """Um plano da paisagem ao longe: a máscara, o relevo (px), o tom (multiplica a cor de base do plano)
    e o que brilha por conta própria (as janelas acesas, pré-multiplicado). Dá a volta na horizontal."""

    def __init__(self, TW, H):
        self.TW, self.H = TW, H
        self.m = np.zeros((H, TW), np.float32)
        self.det = np.ones((H, TW), np.float32)
        self.hgt = np.zeros((H, TW), np.float32)
        self.em = np.zeros((H, TW, 3), np.float32)
        self.ema = np.zeros((H, TW), np.float32)

    def win(self, x0, y0, w, y1=None):
        """Janela em unidades do plano (de x0, y0, com a largura w, até y1 ou até o pé):
        (rows, cols, x, y, ox, oy), x e y em unidades."""
        ox, oy = int(math.floor(x0 * K)), max(0, int(math.floor(y0 * K)))
        LW = int(math.ceil(w * K)) + 2
        yb = self.H if y1 is None else min(self.H, int(math.ceil(y1 * K)) + 1)
        rows, cols = slice(oy, yb), np.arange(ox, ox + LW) % self.TW
        py, px = grid(LW, max(0, yb - oy), ox, oy)
        return rows, cols, px / K, py / K, ox, oy

    def put(self, rows, cols, a, det, hgt, em=None, ema=None):
        """Compõe um pedaço (alfa a) por cima do que já está no plano."""
        for arr, val in ((self.det, det), (self.hgt, hgt)):
            cur = arr[rows][:, cols]
            put_win(arr, rows, cols, cur * (1 - a) + val * a)
        put_win(self.m, rows, cols, a, 'max')
        cur = self.ema[rows][:, cols]
        put_win(self.ema, rows, cols, cur * (1 - a) + (ema if ema is not None else 0.0))
        cur = self.em[rows][:, cols]
        put_win(self.em, rows, cols, cur * (1 - a)[..., None] + (em if em is not None else 0.0))

    def glow(self, rows, cols, col, a):
        """Luz própria por cima (janela acesa, halo): não mexe na máscara nem no relevo."""
        a = a * self.m[rows][:, cols]
        cur = self.ema[rows][:, cols]
        put_win(self.ema, rows, cols, cur * (1 - a) + a)
        cur = self.em[rows][:, cols]
        put_win(self.em, rows, cols, cur * (1 - a)[..., None] + np.asarray(col, np.float32) * a[..., None])

    def color(self, base, yy, xx, ecl_k, relief, rims):
        lit = shade(np.ones(base.shape, np.float32), self.hgt, yy, xx, self.TW, AMBN, sun=SKYN, sun2=ecln(ecl_k), k=relief, wrap=True)
        col = base * self.det[..., None] * lit
        for (dx, dy, width, colr, keep, k) in rims:
            r = wrim(self.m, dx, dy, width)
            col = mix(col, colr + col * keep, (r * k)[..., None])
        return col * (1 - self.ema[..., None]) + self.em


def far_grid(d, near):
    """A grade das janelas de um prédio ao longe: (largura da casa, altura do andar, colunas, margem, folga do topo)."""
    cw, rh = (16.0, 22.0) if near else (10.5, 14.0)
    ncol = max(1, int((d['w'] - 3) // cw))
    return cw, rh, ncol, (d['w'] - ncol * cw) / 2, (8.0 if near else 5.0)


def far_cell(d, near, lx, ly, TW):
    """A casa da grade onde cai uma janelinha acesa: (coluna, andar, x do meio, y do meio)."""
    cw, rh, ncol, offx, offy = far_grid(d, near)
    ci = min(max(int(math.floor(((lx - d['x']) % TW - offx) / cw)), 0), ncol - 1)
    ri = max(int(math.floor((ly - d['top'] - offy) / rh)), 0)
    return ci, ri, d['x'] + offx + (ci + 0.5) * cw, d['top'] + offy + (ri + 0.45) * rh


def far_house(pl, d, near, rng, lit=()):
    """Um prédio ao longe (as medidas vêm do plano): parede com as janelas apagadas, o telhado de cada
    tipo (empena, água de frente com chaminé, torre de cone, ameias, cúpula)."""
    x0, w, top, kind = d['x'], d['w'], d['top'], d['kind']
    up = {'gable': d.get('rh', 0), 'side': d.get('rh', 0) + (d['chim'][1] if 'chim' in d else 0), 'tower': d.get('sh', 0) + 12, 'flat': 8, 'dome': w * 0.36 + 16}[kind]
    rows, cols, x, y, ox, oy = pl.win(x0 - 8, top - up - 4, w + 16)
    if rows.stop <= rows.start:
        return
    x = x - x0
    LH, LW = x.shape
    P = lambda pts: [((x0 + a_) * K - ox, b_ * K - oy) for a_, b_ in pts]
    poly = lambda pts: Mask(LW, LH).poly(P(pts)).array()
    tone = 0.93 + 0.14 * rng.random()
    tex = vnoise(LH, LW, 22, rng, 2)
    wall = aa(np.minimum(np.minimum(x, w - x), y - top))
    det = tone * (0.95 + 0.1 * tex)
    hgt = np.zeros((LH, LW), np.float32)
    a = wall.copy()
    # as janelas apagadas, numa grade
    cw, rh, ncol, offx, offy = far_grid(d, near)
    pw, ph = (4.4, 6.8) if near else (2.8, 4.0)
    ci = np.floor((x - offx) / cw)
    fx = (x - offx) - (ci + 0.5) * cw
    ri = np.floor((y - top - offy) / rh)
    fy = (y - top - offy) - (ri + 0.45) * rh
    rnd = rng.random((3, 512))
    key = (ci.astype(np.int64) * 31 + ri.astype(np.int64) * 17) % 512
    has = rnd[0][key] < (0.5 if near else 0.45)
    for (lc, lr) in lit:
        has &= ~((ci == lc) & (ri == lr))          # essa está acesa: quem pinta é far_light
    # as janelas não ficam em fila certinha: cada uma um pouco para o lado e de um tamanho
    fx = fx + (rnd[1][key] - 0.5) * (cw - pw - 3.0) * 0.8
    pw_, ph_ = pw * (0.8 + 0.4 * rnd[2][key]), ph * (0.85 + 0.3 * rnd[1][key])
    pane = aa(np.minimum(pw_ / 2 - np.abs(fx), ph_ / 2 - np.abs(fy))) * (ci >= 0) * (ci < ncol) * (ri >= 0) * has * wall
    det = det * (1 - (0.34 if near else 0.16) * pane)
    hgt = hgt - 1.6 * pane
    if near:
        # o peitoril pega um fio de céu; uma linha de viga em cada andar
        sill = aa(np.minimum(pw_ / 2 + 1.0 - np.abs(fx), 0.8 - np.abs(fy - ph_ / 2 - 0.9))) * (ci >= 0) * (ci < ncol) * (ri >= 0) * has * wall
        det = det * (1 + 0.16 * sill)
        hgt = hgt + 1.2 * sill
        beam = aa(0.7 - np.abs(((y - top - offy + rh * 0.42) % rh) - 0.7)) * wall * (y > top + 2)
        if rng.random() < 0.6:
            det = det * (1 - 0.14 * beam)
            hgt = hgt + 0.8 * beam
    roofd = tone * 0.8
    rowl = 4.0 if near else 3.2
    if kind == 'gable':
        rh_ = d['rh']
        tri = poly([(-2, top + 1), (w / 2, top - rh_), (w + 2, top + 1)])
        a = np.maximum(a, tri)
        dl, _ = seg_d(x, y, -2, top + 1, w / 2, top - rh_)
        dr, _ = seg_d(x, y, w + 2, top + 1, w / 2, top - rh_)
        verge = aa((2.6 if near else 1.8) - np.minimum(dl, dr)) * tri
        det = det * (1 - 0.2 * verge)
        hgt = hgt + 1.6 * verge
        # a janelinha do sótão
        att = aa(np.minimum(pw * 0.42 - np.abs(x - w / 2), ph * 0.42 - np.abs(y - (top - rh_ * 0.38)))) * tri * (1.0 if rh_ > 16 else 0.0)
        det = det * (1 - (0.34 if near else 0.16) * att)
    elif kind == 'side':
        rh_ = d['rh']
        trap = poly([(-3, top + 1), (6, top - rh_), (w - 6, top - rh_), (w + 3, top + 1)])
        if 'chim' in d:
            cx, chh = d['chim']
            cxl = cx - x0
            ch = aa(np.minimum(3.0 - np.abs(x - cxl), np.minimum(y - (top - rh_ - chh), top - rh_ + 2 - y)))
            cap = aa(np.minimum(4.0 - np.abs(x - cxl), 1.1 - np.abs(y - (top - rh_ - chh + 0.6))))
            a = np.maximum(a, ch)
            det = np.where(ch > 0.5, tone * 0.9, det)
            hgt = np.where(ch > 0.5, 1.0 + 1.5 * cyl((x - cxl) / 3.0) + cap * 1.5, hgt)
        a = np.maximum(a, trap)
        row = ((y - (top - rh_)) % rowl) / rowl
        rd = roofd * (1 - 0.13 * sstep(0.7, 1.0, row)) * (0.94 + 0.12 * tex)
        ridge = aa(1.3 - np.abs(y - (top - rh_ + 0.9)))
        rd = rd * (1 + 0.22 * ridge)
        eave = aa(1.0 - np.abs(y - (top + 0.2)))
        rd = rd * (1 - 0.25 * eave)
        det = det * (1 - trap) + rd * trap
        hgt = hgt * (1 - trap) + (2.0 + row * 1.1 + ridge * 1.5) * trap
    elif kind == 'tower':
        sh = d['sh']
        cone = poly([(-2, top + 1), (w / 2, top - sh), (w + 2, top + 1)])
        ned = aa(0.6 - np.abs(x - w / 2)) * (y < top - sh + 1) * (y > top - sh - 10)
        a = np.maximum(a, np.maximum(cone, ned))
        half = np.maximum((w / 2 + 2) * np.clip((y - (top - sh)) / (sh + 1), 0.02, 1), 0.5)
        t = np.clip((x - w / 2) / half, -1, 1)
        row = ((y - (top - sh)) % rowl) / rowl
        rd = roofd * (1.12 - 0.3 * sstep(-0.7, 0.8, t)) * (1 - 0.12 * sstep(0.7, 1.0, row))
        det = det * (1 - cone) + rd * cone
        hgt = hgt * (1 - cone) + (1.5 + np.minimum(5.0, half * K * 0.5) * cyl(t)) * cone
        # a torre é redonda: mais céu de um lado
        tw = np.clip((x - w / 2) / (w / 2), -1, 1)
        det = det * np.where((cone < 0.5) & (wall > 0.5), 1.06 - 0.14 * sstep(-0.6, 0.9, tw), 1.0)
        corn = aa(1.0 - np.abs(y - (top + 1.6))) * wall
        det = det * (1 + 0.14 * corn)
        hgt = hgt + 1.2 * corn
    elif kind == 'flat':
        n = max(2, int(w // 10))
        for i in range(0, n, 2):
            xa = i * w / n
            mer = aa(np.minimum(np.minimum(x - xa, xa + w / n - x), np.minimum(y - (top - 7), top + 1 - y)))
            a = np.maximum(a, mer)
        strg = aa(0.9 - np.abs(y - (top + 3.4))) * wall
        det = det * (1 + 0.14 * strg)
        hgt = hgt + 1.3 * strg
        mach = aa(np.minimum(1.3 - np.abs(((x + 2.5) % 5.0) - 2.5), 1.6 - np.abs(y - (top + 6.2)))) * wall
        det = det * (1 - 0.22 * mach)
    elif kind == 'dome':
        rx, ry = w * 0.42, w * 0.36
        ex, ey = (x - w / 2) / rx, (y - top) / ry
        rr = np.hypot(ex, ey)
        dome = aa((1 - rr) * min(rx, ry)) * (y < top + 1)
        ned = aa(0.7 - np.abs(x - w / 2)) * (y < top - ry + 1) * (y > top - ry - 14)
        a = np.maximum(a, np.maximum(dome, ned))
        zz = np.sqrt(np.clip(1 - rr * rr, 0, 1))
        ribs = sstep(0.75, 1.0, np.abs(np.sin(np.arcsin(np.clip(ex / np.maximum(np.sqrt(np.clip(1 - ey * ey, 0.02, 1)), 0.05), -1, 1)) * 4.0)))
        rd = roofd * (1.06 - 0.25 * sstep(-0.5, 0.8, ex)) * (1 - 0.12 * ribs)
        det = det * (1 - dome) + rd * dome
        hgt = hgt * (1 - dome) + (1.0 + zz * min(rx, ry) * K * 0.35) * dome
    pl.put(rows, cols, np.clip(a, 0, 1), det, hgt)


def far_light(pl, d, near, lx, ly, tone):
    """Uma janelinha acesa: cai na grade das janelas do prédio dela."""
    pw, ph = (4.4, 6.8) if near else (2.8, 4.0)
    ci, ri, cx, cy = far_cell(d, near, lx, ly, pl.TW)
    R = 18.0 if near else 12.0
    rows, cols, x, y, ox, oy = pl.win(cx - R, cy - R, 2 * R, cy + R)
    if rows.stop <= rows.start:
        return
    pane = aa(np.minimum(pw / 2 - np.abs(x - cx), ph / 2 - np.abs(y - cy)))
    bar = np.ones_like(pane)
    if near:
        bar = 1 - 0.55 * np.maximum(aa(0.35 - np.abs(x - cx)), aa(0.35 - np.abs(y - cy + ph * 0.08)))
    c = mix(WIN0, WIN1, tone)
    hot = np.clip(1 - np.hypot((x - cx) / pw, (y - cy - ph * 0.15) / ph), 0, 1)
    col = mix(c, WIN2, (hot ** 2 * 0.45)[..., None]) * (0.75 + 0.25 * bar)[..., None]
    g = np.exp(-(np.hypot(x - cx, y - cy) / (pw * (2.2 if near else 1.9))) ** 2)
    pl.glow(rows, cols, WIN0, g * (0.16 if near else 0.1) * (1 - pane))
    pl.glow(rows, cols, col, pane * (0.92 if near else 0.7))


def cathedral3(pl, cx, rng):
    """A catedral de frente, com relevo: as duas torres (contrafortes com capelo, sineiras com venezianas,
    parapeito vazado, pináculos, agulha de oito faces com os botões de pedra), a empena com a rosácea de
    doze pétalas, a galeria de arquinhos, o portal, as naves laterais e a agulha do cruzeiro atrás.
    A silhueta é a de cathedral() em fundos_cidade.py."""
    rows, cols, x, y, ox, oy = pl.win(cx - 214, 14, 428)
    u = x - cx
    LH, LW = u.shape
    st = dict(A=np.zeros((LH, LW), np.float32), D=np.ones((LH, LW), np.float32), H=np.zeros((LH, LW), np.float32))
    E = np.zeros((LH, LW, 3), np.float32)
    EA = np.zeros((LH, LW), np.float32)
    P = lambda pts: [((cx + a_) * K - ox, b_ * K - oy) for a_, b_ in pts]
    poly = lambda pts: Mask(LW, LH).poly(P(pts)).array()
    BIG = 9999.0

    def rect(xa, ya, xb, yb):
        return aa(np.minimum(np.minimum(u - xa, xb - u), np.minimum(y - ya, yb - y)))

    def lay(a, d=None, h=None, grow=True):
        if grow:
            st['A'] = np.maximum(st['A'], a)
        if d is not None:
            st['D'] = st['D'] * (1 - a) + d * a
        if h is not None:
            st['H'] = st['H'] * (1 - a) + h * a

    def glass(a, col):
        nonlocal E, EA
        E = E * (1 - a)[..., None] + col * a[..., None]
        EA = EA * (1 - a) + a

    def spire(tc, y_base, y_tip, half0, hbase, bands=26.0):
        """Agulha de oito faces: a da esquerda pega o céu, a da direita fica na sombra; cintas e fiadas."""
        tri = poly([(tc - half0, y_base), (tc, y_tip), (tc + half0, y_base)])
        half = np.maximum(half0 * np.clip((y - y_tip) / (y_base - y_tip), 0.02, 1), 0.4)
        t = np.clip((u - tc) / half, -1.2, 1.2)
        f = 1.07 - 0.1 * sstep(-0.46, -0.3, t) - 0.11 * sstep(0.3, 0.46, t)
        band = aa(0.8 - np.abs(((y_base - y) % bands) - bands / 2))
        rowm = sstep(0.72, 1.0, ((y_base - y) % 4.0) / 4.0)
        d = f * (1 - 0.13 * band) * (1 - 0.06 * rowm)
        h = hbase + np.minimum(8.0, half * K * 0.5) * (1 - np.clip((np.abs(t) - 0.38) / 0.62, 0, 1)) + band * 1.2
        lay(tri, d, h)
        return tri

    def window(mid, w, apex, bottom, depth, dark=0.42, k=0.8, ring=2.0, hraise=2.2, mull=True):
        """Vão escuro com a moldura em volta; devolve a distância para dentro."""
        d = lancet_d(u, y, mid, w, apex, bottom, k)
        base_h = st['H'].copy()
        lay(aa(d + ring) * (1 - aa(d)), 1.07, None, grow=False)
        st['H'] = st['H'] + hraise * aa(d + ring) * (1 - aa(d))
        lay(aa(d), dark, None, grow=False)
        st['H'] = st['H'] * (1 - aa(d)) + (base_h + depth) * aa(d)
        if mull:
            m_ = aa(0.55 - np.abs(u - mid)) * aa(d) * (y > apex + w * 0.55)
            lay(m_, dark * 1.6, None, grow=False)
            st['H'] = st['H'] + 3.0 * m_
        return d

    def course(xa, xb, ya, yb, raise_=2.6, d=1.06):
        a = rect(xa, ya, xb, yb) * (st['A'] > 0.5)
        lay(a, d, None, grow=False)
        st['H'] = st['H'] + raise_ * a

    # ---------- a agulha do cruzeiro, lá atrás (mais névoa) ----------
    a = rect(-13, 228, 13, 330)
    lay(a, 1.13 * (1.04 - 0.12 * sstep(-13, 13, u)), -30.0 + 4.0 * cyl(u / 13.0))
    for sx in (-5.6, 5.6):
        d = lancet_d(u, y, sx, 5.0, 242, 284, 0.8)
        lay(aa(d), 0.62, -34.0, grow=False)
    tri = spire(0.0, 230.0, 44.0, 16.0, -30.0, bands=31.0)
    st['D'] = np.where(tri > 0.5, st['D'] * 1.13, st['D'])
    ned = aa(0.8 - np.abs(u)) * (y < 45) * (y > 24)
    lay(ned, 1.1, -30.0)
    course(-14, 14, 228, 231.5, 2.0, 1.2)

    # ---------- as naves laterais e os pilares com pináculo ----------
    for s in (-1, 1):
        xa, xb = sorted((s * 122, s * 196))
        mid = (xa + xb) / 2
        fr = poly([(xa - 2, 434), (mid, 398), (xb + 2, 434)])
        lay(np.maximum(rect(xa, 432, xb, BIG), fr), 1.0, -10.0)
        dl, _ = seg_d(u, y, xa - 2, 434, mid, 398)
        dr, _ = seg_d(u, y, xb + 2, 434, mid, 398)
        rk = aa(3.0 - np.minimum(dl, dr)) * fr
        lay(rk, 1.07, -7.0, grow=False)
        course(xa, xb, 434, 437, 2.4)
        window(mid, 15.0, 448, 504, -7.0, dark=0.5)
        # um trifólio cego em cima do vão
        dd = np.hypot(u - mid, y - 421.0)
        lay(aa(4.2 - dd), 0.8, -13.0, grow=False)
        pu = s * 190
        pin = poly([(pu - 8, 386), (pu, 342), (pu + 8, 386)])
        lay(rect(pu - 7, 384, pu + 7, BIG), 1.02, -3.0)
        lay(pin, np.where(u < pu, 1.07, 0.9), -3.0 + 3.0 * (1 - np.abs(u - pu) / 8.0))
        course(pu - 8, pu + 8, 384, 388, 2.2)
        for ys in (432.0, 490.0):
            course(pu - 7, pu + 7, ys, ys + 2.4, 1.8, 1.05)
            lay(rect(pu - 7, ys + 2.4, pu + 7, ys + 5.0) * 0.5, 0.86, None, grow=False)

    # ---------- as duas torres ----------
    for s in (-1, 1):
        tc = s * 90.0
        x0 = tc - 33.0
        lay(rect(x0, 250, x0 + 66, BIG), 1.0, 0.0)
        for bx in (x0 - 8, x0 + 66):
            cap = poly([(bx - 1, 324), (bx + 4, 300), (bx + 9, 324)])
            lay(np.maximum(rect(bx, 322, bx + 8, BIG), cap), 1.03, 7.0)
            st['D'] = np.where(cap > 0.5, st['D'] * np.where(u < bx + 4, 1.05, 0.9), st['D'])
            for ys in (324.0, 404.0, 482.0):
                course(bx, bx + 8, ys, ys + 2.6, 2.0, 1.06)
                lay(rect(bx, ys + 2.6, bx + 8, ys + 5.6) * 0.55, 0.84, None, grow=False)
        # parapeito vazado e os pináculos dos cantos
        lay(rect(x0 - 4, 244, x0 + 70, 254), 1.04, 3.5)
        dot = aa(1.5 - np.hypot(((u - x0 + 0.9) % 6.2) - 3.1, y - 249.2)) * rect(x0 - 3, 245, x0 + 69, 253)
        lay(dot, 0.5, 0.5, grow=False)
        for pxx in (x0 - 2, x0 + 60):
            tri = poly([(pxx, 246), (pxx + 4, 206), (pxx + 8, 246)])
            lay(tri, np.where(u < pxx + 4, 1.08, 0.9), 3.5 + 2.5 * (1 - np.abs(u - pxx - 4) / 4.0))
        tri = spire(tc, 248.0, 92.0, 27.0, 2.0)
        # as lucarnas na face da frente
        for (ly_, lw_) in ((228.0, 5.0), (176.0, 3.6)):
            d = lancet_d(u, y, tc, lw_, ly_ - lw_ * 2.6, ly_, 0.8)
            lay(aa(d), 0.52, -3.0, grow=False)
            hood = aa(d + 1.3) * (1 - aa(d))
            lay(hood, 1.1, 5.0, grow=False)
        for k in range(1, 6):
            tt = k / 6
            yk = 248 - (248 - 92) * tt
            hf = (66 / 2 - 6) * (1 - tt)
            for sg in (-1, 1):
                ex = tc + sg * (hf + 1.5)
                e = aa((1 - np.hypot((u - ex) / 2.6, (y - yk) / 2.0)) * 2.2)
                lay(e, 1.08 if sg < 0 else 0.9, 4.0)
        fin = np.maximum(aa(1.0 - np.abs(u - tc)) * (y < 93) * (y > 66), aa(0.8 - np.abs(y - 76.0)) * (np.abs(u - tc) < 7.0))
        lay(fin, 0.98, 2.0)
        # o andar dos sinos
        for sx in (-12.0, 12.0):
            d = window(tc + sx, 14.0, 262, 306, -9.0, dark=0.42, mull=False)
            slat = aa(0.75 - np.abs(((y - 262.0) % 5.0) - 2.5)) * aa(d - 0.6)
            lay(slat, 0.66, None, grow=False)
            st['H'] = st['H'] + 2.5 * slat
        course(x0, x0 + 66, 255.5, 258.0, 2.0)
        course(x0 - 8, x0 + 74, 318.5, 322.0, 2.8, 1.08)
        lay(rect(x0, 322.0, x0 + 66, 325.5) * 0.5, 0.86, None, grow=False)
        # a janela acesa, três arquinhos cegos e a janela grande de baixo
        d = window(tc, 12.0, 344, 380, -7.0, dark=0.5, mull=False)
        gl = aa(d - 0.9)
        v = np.clip((y - 344.0) / 36.0, 0, 1)
        gc = mix(WIN0 * 0.62, WIN1 * 0.92, (0.25 + 0.6 * v * (1 - np.abs(u - tc) / 9.0))[..., None])
        dia = np.minimum(np.abs(((u - tc + (y - 344)) % 3.4) - 1.7), np.abs(((u - tc - (y - 344)) % 3.4) - 1.7)) * K
        gc = gc * (1 - 0.25 * sstep(0.9, 0.2, dia))[..., None]
        gc = gc * (1 - 0.6 * aa(0.45 - np.abs(u - tc)) * (y > 352))[..., None]
        glass(gl * 0.9, gc)
        course(x0, x0 + 66, 390.0, 393.0, 2.4)
        for sx in (-18.0, 0.0, 18.0):
            d = lancet_d(u, y, tc + sx, 11.0, 406, 446, 0.8)
            lay(aa(d), 0.9, None, grow=False)
            st['H'] = st['H'] - 2.6 * aa(d)
        course(x0, x0 + 66, 456.0, 459.0, 2.4)
        window(tc, 13.0, 474, 560, -8.0, dark=0.46)

    # ---------- a frente da nave: empena, rosácea, galeria e portal ----------
    gab = poly([(-62, 362), (0, 296), (62, 362)])
    lay(np.maximum(np.maximum(rect(-58, 360, 58, BIG), gab), poly([(-3, 300), (0, 282), (3, 300)])), 1.0, -6.0)
    dl, _ = seg_d(u, y, -62, 362, 0, 296)
    dr, _ = seg_d(u, y, 62, 362, 0, 296)
    lay(aa(3.4 - np.minimum(dl, dr)) * gab, 1.08, -2.5, grow=False)
    course(-58, 58, 362.0, 365.0, 2.4)
    # o óculo da empena
    dd = np.hypot(u, y - 337.0)
    lay(aa(9.6 - dd) * (1 - aa(7.4 - dd)), 1.08, -3.5, grow=False)
    lay(aa(7.4 - dd), 0.6, -11.0, grow=False)
    ang = np.arctan2(y - 337.0, u)
    tre = aa(0.6 - np.abs(np.sin(ang * 2.0)) * dd) * aa(7.4 - dd)
    lay(tre, 0.95, -8.0, grow=False)
    # o arco cego em volta da rosácea
    dA = lancet_d(u, y, 0.0, 98.0, 371.0, 462.0, 0.72)
    lay(aa(dA + 2.6) * (1 - aa(dA)), 1.08, -3.5, grow=False)
    lay(aa(dA), 0.95, -10.0, grow=False)
    # a rosácea
    RX, RY = 0.0, 420.0
    dd = np.hypot(u - RX, y - RY)
    ang = np.arctan2(y - RY, u - RX)
    lay(aa(33.6 - dd) * (1 - aa(30.0 - dd)), 1.09, -6.0, grow=False)
    lay(aa(30.0 - dd) * (1 - aa(26.5 - dd)), 0.8, -8.0, grow=False)
    sect = TAU / 12
    a1 = ang % sect
    a0 = np.minimum(a1, sect - a1)                 # ângulo até o raio de pedra mais perto
    beta = a1 - sect / 2                           # ângulo até o eixo da pétala
    spoke = aa(0.62 - dd * np.sin(a0)) * (dd > 6.0) * (dd < 19.6)
    rho = 19.0 * math.sin(sect / 2)
    hc = np.hypot(dd * np.cos(beta) - 19.0, dd * np.sin(beta))
    head = aa(rho - 0.75 - hc) * (dd >= 18.6)
    petal = np.clip(aa(19.0 - dd) * aa(dd - 6.6) * (1 - spoke) + head, 0, 1)
    oc = np.hypot(dd * np.cos(a0) - 23.3, dd * np.sin(a0))
    ocul = aa(2.25 - oc)
    hub = aa(5.0 - dd)
    gmask = np.clip(petal + ocul + hub, 0, 1) * aa(26.5 - dd)
    disc = aa(26.5 - dd)
    lay(disc * (1 - gmask), 0.55, -9.0, grow=False)       # o rendilhado de pedra
    lay(gmask, 0.5, -12.0, grow=False)
    pi_ = np.floor(ang / sect).astype(np.int64) % 12
    g = np.clip(1 - dd / 26.5, 0, 1) ** 0.7
    gc = mix(WIN0 * 0.78, WIN1, g[..., None])
    tint = np.array([[1.0, 1.0, 1.0], [1.06, 0.74, 0.52], [1.02, 1.1, 1.18]], np.float32)[pi_ % 3]
    gc = gc * tint
    ruby = np.array([0.82, 0.2, 0.14], np.float32)
    gc = mix(gc, ruby, (aa(10.6 - dd) * aa(dd - 6.6) * 0.62)[..., None])
    gc = mix(gc, WIN2 * 0.98, (head * 0.5)[..., None])
    lead = np.maximum(aa(0.38 - np.abs(dd - 10.6)), aa(0.38 - np.abs(dd - 15.0)))
    gc = gc * (1 - 0.5 * lead)[..., None]
    gc = mix(gc, np.array([0.3, 0.52, 0.95], np.float32), ocul[..., None])
    gc = mix(gc, WIN2, hub[..., None])
    six = aa(0.45 - np.abs(np.sin(ang * 3.0)) * dd) * hub
    gc = gc * (1 - 0.55 * six)[..., None]
    glass(gmask * 0.97, np.clip(gc, 0, 1))
    # a galeria de arquinhos com os colunelos
    course(-58, 58, 456.5, 459.5, 2.4)
    for k in range(7):
        gx = -48.0 + k * 16.0
        d = window(gx, 9.0, 464, 488, -8.0, dark=0.45, ring=1.5, hraise=1.6, mull=False)
        fig = aa(np.minimum(1.5 - np.abs(u - gx), np.minimum(y - 473.0, 488.0 - y))) * aa(d)
        hd = aa(1.5 - np.hypot(u - gx, y - 471.6))
        lay(np.maximum(fig, hd * aa(d)), 0.86, None, grow=False)
        st['H'] = st['H'] + 3.5 * np.maximum(fig, hd * aa(d))
    for k in range(8):
        col_ = rect(-56.0 + k * 16.0 - 0.9, 470, -56.0 + k * 16.0 + 0.9, 489)
        lay(col_, 1.1, None, grow=False)
        st['H'] = st['H'] + 2.4 * col_
    course(-58, 58, 489.5, 492.5, 2.6, 1.07)
    # o portal com as arquivoltas e o gablete
    dP = lancet_d(u, y, 0.0, 56.0, 508.0, BIG, 0.8)
    for i in range(3):
        ring = aa(dP - i * 3.3) * (1 - aa(dP - i * 3.3 - 2.1))
        lay(ring, 1.07 - 0.04 * i, None, grow=False)
        st['H'] = st['H'] * (1 - ring) + (-5.0 - 3.2 * i) * ring
    lay(aa(dP - 9.9), 0.5, -20.0, grow=False)
    d1, _ = seg_d(u, y, -40, 546, 0, 496)
    d2, _ = seg_d(u, y, 40, 546, 0, 496)
    gb = aa(1.5 - np.minimum(d1, d2)) * rect(-58, 494, 58, BIG) * (1 - aa(dP))
    lay(gb, 1.09, None, grow=False)
    st['H'] = st['H'] + 2.6 * gb

    # ---------- a pedra: fiadas finas, manchas e escorridos ----------
    gy, gx_ = grid(LW, LH)
    BK = Blocks(gy, gx_, LW, 9.0, 21.0, rng, vary=0.35)
    bf = BK.face(0.8, 1.2)
    tex = vnoise(LH, LW, 38, rng, 3)
    drip = sstep(0.5, 0.85, vnoise(LH, LW, 4.0, rng, 2, sy=16.0))
    D = st['D'] * (0.9 + 0.2 * tex) * (0.98 + 0.045 * BK.r(3)) * (1 - 0.04 * (1 - bf)) * (1 - 0.12 * drip)
    Hh = st['H'] + bf * 0.3
    A = st['A']
    pl.put(rows, cols, A, D, Hh, E * A[..., None], EA * A)
    return (cx + RX, RY)


def city_far(rng):
    plan = far_plan(np.random.default_rng(62))
    TW, H = 3072, 1200
    cv = Canvas(TW, H)
    yy, xx = grid(TW, H)
    allr, allc = slice(0, H), np.arange(TW)
    lights = plan['lights']
    # faixa A: a mais longe, quase da cor da névoa
    pA = Plane(TW, H)
    cells = {}
    for (band, bi, lx, ly, tone) in lights:
        cells.setdefault((band, bi), []).append(far_cell(plan[band][bi], band == 'B', lx, ly, TW)[:2])
    for i, d in enumerate(plan['A']):
        far_house(pA, d, False, rng, cells.get(('A', i), ()))
    for (band, bi, lx, ly, tone) in lights:
        if band == 'A':
            far_light(pA, plan['A'][bi], False, lx, ly, tone)
    colA = mix(hexc(0x2c3352), hexc(0x39425f), sstep(630.0, 990.0, yy)[..., None])
    cv.over(allr, allc, np.clip(pA.color(colA, yy, xx, 0.3, 0.55, [(1, 0, 4, GOLD1 * 0.6, 0.5, 0.35)]), 0, 1), pA.m)
    # a catedral, entre as duas faixas
    pC = Plane(TW, H)
    cathedral3(pC, plan['cathedral'], rng)
    colC = mix(hexc(0x1f253d), hexc(0x2b3350), sstep(450.0, 1050.0, yy)[..., None])
    cv.over(allr, allc, np.clip(pC.color(colC, yy, xx, 0.42, 1.0, [(1, -0.4, 6, GOLD2 * 0.8, 0.3, 0.5), (-0.3, -1, 4, COLD * 0.5, 0.6, 0.3)]), 0, 1), pC.m)
    # faixa B: casas mais perto, mais escuras
    pB = Plane(TW, H)
    for i, d in enumerate(plan['B']):
        far_house(pB, d, True, rng, cells.get(('B', i), ()))
    for (band, bi, lx, ly, tone) in lights:
        if band == 'B':
            far_light(pB, plan['B'][bi], True, lx, ly, tone)
    colB = mix(hexc(0x161b2e), hexc(0x222a42), sstep(720.0, 1140.0, yy)[..., None])
    cv.over(allr, allc, np.clip(pB.color(colB, yy, xx, 0.45, 0.9, [(1, -0.3, 4, GOLD2 * 0.75, 0.3, 0.45), (-0.2, -1, 3, COLD * 0.45, 0.6, 0.3)]), 0, 1), pB.m)
    # névoa subindo da cidade baixa (cobre as bases e fica opaca embaixo)
    mist_n = pnoise(H, TW, 90, rng, 3, sx=3.0)
    fine_n = pnoise(H, TW, 28, rng, 2, sx=2.5)
    mist = sstep(840.0, 1140.0, yy + (mist_n - 0.5) * 90.0 + (fine_n - 0.5) * 24.0)
    cv.over(allr, allc, mix(FOG0, FOG1, 0.25) * (0.95 + 0.1 * fine_n)[..., None], np.clip(mist, 0, 1))
    cv.over(allr, allc, mix(FOG0, SL2, 0.5), sstep(1050.0, 1200.0, yy))
    cv.col[:] = grain(cv.col, rng, 0.02)
    return cv


# ======================================================================================
# O céu do eclipse sobre a cidade (preso na tela: 1920x1080, um pixel da pintura por pixel da tela)
# ======================================================================================
SL0 = hexc(0x0b1020)
GOLD0 = hexc(0x6e3c1a)


def ring_noise(n, lobes, rng, octaves=3):
    """Ruído de uma volta (0..1) em n passos que fecha no fim: `lobes` altos e baixos na volta inteira."""
    out = np.zeros(n, np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        k = max(2, int(lobes * 2 ** o))
        g = rng.random(k).astype(np.float32)
        t = np.arange(n) / n * k
        i0 = np.floor(t).astype(int) % k
        f = t - np.floor(t)
        f = f * f * (3 - 2 * f)
        out += amp * (g[i0] * (1 - f) + g[(i0 + 1) % k] * f)
        tot += amp
        amp *= 0.5
    out /= tot
    return (out - out.min()) / (out.max() - out.min() + 1e-6)


def corona(col, yy, xx, ex, ey, R, rng, k=1.0):
    """A coroa do eclipse: clarão em volta, raios finos de comprimentos diferentes (uns poucos bem
    compridos), o anel claro e o disco escuro. Soma luz em col (no lugar)."""
    dx, dy = xx - ex, yy - ey
    r = np.hypot(dx, dy)
    th = np.arctan2(dy, dx)
    N = 4096
    ti = ((th / TAU) % 1.0 * N).astype(np.int64) % N
    low = ring_noise(N, 5, rng, 2)
    mid = ring_noise(N, 26, rng, 3)
    hi = ring_noise(N, 150, rng, 2)
    hi2 = ring_noise(N, 420, rng, 1)
    # o comprimento de cada raio: quase todos curtos, alguns jatos compridos
    L = R * (0.42 + 1.25 * low ** 2.2 + 1.6 * sstep(0.74, 1.0, mid) * low)
    B = 0.3 + 0.7 * mid
    out = np.clip(r - R, 0, None)
    twist = ((th / TAU) % 1.0 * N + out * 0.12).astype(np.int64) % N
    fil = 0.5 + 0.5 * hi[twist] * (0.55 + 0.45 * hi2[ti])
    I = B[ti] * fil * np.exp(-out / L[ti]) * (r > R - 2)
    I += 0.5 * np.exp(-out / (R * 0.3)) * (r > R - 2)
    I *= k
    warm = mix(GOLD1, GOLD3, np.clip(I, 0, 1)[..., None] ** 0.8)
    col += warm * np.clip(I * 0.85, 0, 1.2)[..., None]
    col += GOLD2 * (np.exp(-(r / (R * 2.2)) ** 2) * 0.14 * k)[..., None]
    ring = sstep(R + 7.5, R + 2.0, r) * sstep(R - 1.5, R + 1.8, r)
    col[:] = mix(col, GOLD3, (ring * 0.95)[..., None])
    col[:] = mix(col, hexc(0x06070b), sstep(R + 1.0, R - 1.0, r)[..., None])


def city_sky(rng):
    """O mesmo céu de fundos_cidade.city_sky(): o degradê, as mesmas nuvens (os mesmos campos de ruído,
    ampliados, com a beirada desfiada em 3x), as mesmas estrelas e o eclipse no mesmo lugar."""
    W, H = 1920, 1080
    W2, H2 = 1280, 720
    EX2, EY2, ER2 = 930.0, 150.0, 40.0
    EX, EY, ER = EX2 * K, EY2 * K, ER2 * K
    old = np.random.default_rng(61)
    n1 = pnoise(H2, W2, 36, old, 4, sx=5.0)
    n2 = pnoise(H2, W2, 14, old, 3, sx=3.0)
    c2 = n1 * 0.72 + n2 * 0.28
    y2, x2 = grid(W2, H2)
    cloud2 = sstep(0.5, 0.68, c2) * sstep(0.08, 0.3, y2 / H2) * sstep(1.0, 0.72, y2 / H2)
    d2 = np.hypot(x2 - EX2, y2 - EY2)
    stars = []
    for _ in range(170):
        sx_, sy_ = old.uniform(0, W2), old.uniform(0, H2 * 0.55)
        if cloud2[int(sy_), int(sx_)] > 0.25 or d2[int(sy_), int(sx_)] < 260:
            continue
        stars.append((sx_ * K, sy_ * K, old.random() ** 2.2))
    yy, xx = grid(W, H)
    t = yy / H
    sky = mix(SL0, SL1, sstep(0.0, 0.45, t)[..., None])
    sky = mix(sky, SL2, sstep(0.35, 0.95, t)[..., None])
    sky = mix(sky, hexc(0x3a3a58), (sstep(0.6, 1.0, t) * 0.55)[..., None])
    d_e = np.hypot(xx - EX, yy - EY)
    sky = mix(sky, mix(GOLD0, SL2, 0.4), (np.exp(-(d_e / 600) ** 2) * 0.6)[..., None])
    sky = mix(sky, GOLD1, (np.exp(-(d_e / 210) ** 2) * 0.55)[..., None])
    # poeira de estrelas bem fraca e as estrelas de antes (nos mesmos lugares)
    c3 = ndi.zoom(c2, K, order=3)[:H, :W]
    fine = pnoise(H, W, 9, rng, 3, sx=3.5)
    wisp_n = pnoise(H, W, 3.2, rng, 2, sx=5.0)
    c3 = c3 + (fine - 0.5) * 0.06 + (wisp_n - 0.5) * 0.03
    band = sstep(0.08, 0.3, t) * sstep(1.0, 0.72, t)
    cloud = sstep(0.51, 0.67, c3) * band
    clear = (1 - sstep(0.05, 0.3, cloud)) * sstep(390.0, 520.0, d_e)
    dust = rng.random((H, W)).astype(np.float32)
    faint = sstep(0.9975, 1.0, dust) * (0.25 + 0.75 * rng.random((H, W)).astype(np.float32))
    faint = blur(faint, 0.55) * 2.2 * sstep(0.62, 0.1, t) * clear
    sky = sky + COLD * np.clip(faint, 0, 1)[..., None] * 0.55
    for (sx_, sy_, b) in stars:
        r0 = (0.6 + b * 0.9) * K * 0.8
        x0, y0 = int(sx_) - 24, int(sy_) - 24
        ys, xs = slice(max(0, y0), min(H, y0 + 48)), slice(max(0, x0), min(W, x0 + 48))
        dd = np.hypot(xx[ys, xs] - sx_, yy[ys, xs] - sy_)
        core = np.exp(-(dd / r0) ** 2) * (0.35 + 0.6 * b)
        sc = mix(COLD, hexc(0xffffff), b)
        sky[ys, xs] = mix(sky[ys, xs], sc, np.clip(core, 0, 1)[..., None])
        if b > 0.55:
            sky[ys, xs] += COLD * (np.exp(-(dd / ((4 + b * 4) * K * 0.7)) ** 2) * 0.07)[..., None]
        if b > 0.8:
            ax, ay = np.abs(xx[ys, xs] - sx_), np.abs(yy[ys, xs] - sy_)
            spike = np.maximum(np.exp(-(ay / 0.7) ** 2 - (ax / (7.0 * b)) ** 2), np.exp(-(ax / 0.7) ** 2 - (ay / (7.0 * b)) ** 2))
            sky[ys, xs] += COLD * (spike * 0.35)[..., None]
    # as nuvens compridas e finas: o corpo escuro contra o céu, a beira virada para o eclipse acesa
    near = np.exp(-(d_e / 645) ** 2)
    body = mix(sky * 0.72 + SL3 * 0.12, GOLD1 * 0.75 + GOLD0 * 0.2, (np.exp(-(d_e / 330) ** 2) * 0.7)[..., None])
    thick = sstep(0.6, 0.82, c3)
    body = body * (1 - 0.12 * thick * (1 - 0.6 * near))[..., None]
    sky = mix(sky, body, (cloud * 0.85)[..., None])
    cb = blur(cloud, 1.1)
    gy_, gx_ = np.gradient(cb)
    ux, uy = (EX - xx) / np.maximum(d_e, 1), (EY - yy) / np.maximum(d_e, 1)
    toward = np.clip(-(gx_ * ux + gy_ * uy) * 7.0, 0, 1)            # a beira que olha para o eclipse
    topr = np.clip(gy_ * 7.0, 0, 1)                                  # a beira de cima
    edge = np.clip(topr * (0.2 + 0.3 * near) + toward * near * 1.1, 0, 1) * sstep(0.02, 0.2, cloud)
    rim_col = mix(COLD * 0.75, GOLD2, near[..., None])
    sky = mix(sky, rim_col, np.clip(edge * 1.35, 0, 0.8)[..., None])
    sky = blur(sky, 0.5)
    corona(sky, yy, xx, EX, EY, ER, rng)
    # uma nuvem fina passa na frente da coroa
    wn = pnoise(H, W, 15, rng, 3, sx=6.0) + (pnoise(H, W, 4, rng, 2, sx=6.0) - 0.5) * 0.12
    wisp = sstep(0.56, 0.7, wn) * np.exp(-((yy - EY - 27) / 21) ** 2) * np.exp(-((xx - EX) / 285) ** 2)
    sky = mix(sky, mix(GOLD0, SL1, 0.5), (wisp * 0.7)[..., None])
    sky = grain(sky, rng, 0.012)
    cv = Canvas(W, H)
    cv.col[:] = np.clip(sky, 0, 1)
    cv.a[:] = 1.0
    return cv


# ======================================================================================
# O claustro: a arcada do outro lado do jardim (no lugar das casas)
# ======================================================================================
def leaves(cv, pts, rng, n, size=(4.5, 7.5), spread=3.2, hang=True):
    """Folhas de hera ao longo de um ramo (pts em unidades): cada uma virada para um lado, umas pegando o
    céu, outras na sombra; o ramo é um fio escuro por baixo."""
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    x0, y0 = min(xs) - 12, min(ys) - 12
    w, h = max(xs) - x0 + 12, max(ys) - y0 + 12
    ox, oy = int(math.floor(x0 * K)), int(math.floor(y0 * K))
    LW, LH = int(w * K) + 2, int(h * K) + 2
    rows, cols, py, px = cv.win(ox, oy, LW, LH)
    if rows.stop <= rows.start:
        return
    u, v = px / K, py / K
    m = Mask(LW, rows.stop - rows.start)
    m.line([(x * K - ox, y * K - rows.start) for x, y in pts], 0.9 * K)
    cv.over(rows, cols, hexc(0x10160f), m.array() * 0.9)
    for i in range(n):
        t = rng.random() * (len(pts) - 1)
        k = int(t)
        f = t - k
        lx = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f + rng.normal(0, spread)
        ly = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f + rng.normal(0, spread * 0.6)
        a_, b_ = rng.uniform(*size) / 2, rng.uniform(size[0], size[0] + 1.6) / 2
        ang = (math.pi / 2 if hang else -math.pi / 2) + rng.normal(0, 0.75)
        ca, sa = math.cos(ang), math.sin(ang)
        du, dv = u - lx, v - ly
        p_ = du * ca + dv * sa
        q_ = -du * sa + dv * ca
        # a ponta afina: a largura cai para o fim da folha
        wq = b_ * np.clip(1 - np.clip(p_ / a_, -1, 1) * 0.55, 0.25, 1.6)
        e = 1 - np.hypot(p_ / a_, q_ / wq)
        al = np.clip(e * min(a_, b_) * K, 0, 1)
        tone = rng.random()
        c = mix(hexc(0x16241a), hexc(0x2c4426), tone)
        lit = 0.78 + 0.4 * np.clip(-q_ / wq * sa - p_ / a_ * 0.2, -1, 1)
        col = c * lit[..., None]
        col = col * (1 - 0.35 * np.clip(1 - np.abs(q_) * K / 0.9, 0, 1) * (p_ > -a_ * 0.6))[..., None]      # a nervura
        if tone > 0.75:
            col = mix(col, COLD * 0.35, 0.18)
        cv.over(rows, cols, np.clip(col, 0, 1), al * 0.95)


def cypress(cv, x, h, jit, rng):
    """Um cipreste do jardim (o contorno é o de antes: ponta fina, bojo largo, tronco curto), agora com a
    folhagem em penachos em pé, o lado do céu mais claro e a beira da direita no ouro do eclipse."""
    LW, LH = int(96 * K), int((h + 40) * K)
    ox, oy = int(math.floor((x - 48) * K)), int(math.floor((700 - h - 10 - 8) * K))
    rows, cols, py, px = cv.win(ox, oy, LW, LH)
    if rows.stop <= rows.start:
        return
    hh = rows.stop - rows.start
    u = px / K - x
    v = py / K - (700 - h)

    def wdt(t):
        return 24 * (t / 0.62) ** 0.75 if t < 0.62 else 24 * (1 - 0.4 * ((t - 0.62) / 0.38) ** 2)

    P = lambda pts: [((x + a_) * K - ox, (700 - h + b_) * K - rows.start) for a_, b_ in pts]
    pts = []
    ts = list(np.linspace(0, 0.94, 20))
    for i, t in enumerate(ts):
        pts.append((wdt(t) + jit[i], t * h))
    for i, t in enumerate(reversed(ts)):
        pts.append((-wdt(t) + jit[20 + i], t * h))
    body = Mask(LW, hh).poly(P(pts)).array()
    # a beira desfiada: penachos que passam um pouco do contorno e reentrâncias
    fray = vnoise(hh, LW, 3.0, rng, 2, sy=3.2)
    soft = blur(body, 2.4)
    edge = np.clip((soft - 0.5 + (fray - 0.5) * 0.7) * 5.0 + 0.5, 0, 1)
    a = np.clip(np.maximum(edge * (soft > 0.03), body * 0.0), 0, 1)
    trunk = np.clip(np.minimum(3.0 - np.abs(u), np.minimum(v - 0.9 * h, h + 8 - v)) * K + 0.5, 0, 1)
    tex = vnoise(hh, LW, 2.6, rng, 2, sy=9.0)
    big = vnoise(hh, LW, 9.0, rng, 2, sy=3.0)
    half = np.maximum(np.interp(np.clip(v / h, 0, 0.94), ts, [wdt(t) for t in ts]), 1.0)
    tt = np.clip(u / half, -1.3, 1.3)
    hgt = 13.0 * cyl(tt * 0.9) + (tex - 0.5) * 5.0 + (big - 0.5) * 6.0
    lit = shade(np.ones((hh, LW, 3), np.float32), hgt, py, px, LW, AMBN, sun=SKYN, sun2=ecln(0.5), k=1.0, wrap=False)
    base = mix(hexc(0x0f1a14), hexc(0x1c2c20), sstep(0.5, -0.6, tt)[..., None])
    col = base * (0.82 + 0.36 * tex)[..., None] * lit
    col = col * (1 - 0.4 * sstep(0.62, 0.3, big) * sstep(-0.2, 0.6, tt))[..., None]            # os vãos escuros entre os ramos
    gold = rim(a, 1, 0, 5)
    col = mix(col, GOLD1 * 0.5 + col * 0.6, np.clip(gold * 0.45 * (0.5 + tex), 0, 1)[..., None])
    cv.over(rows, cols, hexc(0x15120f) * (0.8 + 0.5 * tex)[..., None], trunk * (1 - a))
    cv.over(rows, cols, np.clip(col, 0, 1), a)


def claustro_mid(rng):
    plan = claustro_plan(np.random.default_rng(66))
    TW, H = 3072, 1260
    cv = Canvas(TW, H)
    yy, xx = grid(TW, H)
    U, V = xx / K, yy / K
    allr, allc = slice(0, H), np.arange(TW)
    bay = 128.0
    par_top, spring, wall_top, roof_top = 604.0, 452.0, 344.0, 300.0
    r = bay / 2 - 12
    ax = (U % bay) - bay / 2                              # até o meio do vão mais perto
    bx = ((U + bay / 2) % bay) - bay / 2                  # até o eixo dos colunelos mais perto
    cell = np.floor(U / bay)
    tex = pnoise(H, TW, 30, rng, 3)
    fine = pnoise(H, TW, 4, rng, 2)
    base = np.zeros((H, TW, 3), np.float32)
    det = np.ones((H, TW), np.float32)
    hgt = np.zeros((H, TW), np.float32)

    def lay(a, col=None, d=None, h=None):
        nonlocal base, det, hgt
        if col is not None:
            base = mix(base, np.asarray(col, np.float32), a[..., None])
        if d is not None:
            det = det * (1 - a) + d * a
        if h is not None:
            hgt = hgt * (1 - a) + h * a

    # ---------- o telhado de uma água: telhas em fiadas ----------
    rm = aa(np.minimum(V - roof_top, wall_top - V))
    rnd = rng.random((4, 4096)).astype(np.float32)
    ry = (V - roof_top) / 10.0
    rowi = np.floor(ry).astype(np.int64)
    fy = ry - rowi
    xo = U + (rowi % 2) * 4.0
    ti = np.floor(xo / 8.0)
    fx = xo / 8.0 - ti
    key = (rowi * 131 + (ti.astype(np.int64) % 256) * 977) % 4096
    gap = np.minimum(fx, 1 - fx) * 8.0 * K
    rdet = (0.84 + 0.32 * rnd[1][key]) * (0.9 + 0.2 * tex) * (1 - 0.42 * sstep(0.8, 1.0, fy)) * (1 - 0.22 * sstep(1.3, 0.3, gap))
    rdet = np.where(rnd[2][key] < 0.012, rdet * 0.45, rdet)
    rh = 2.0 + 2.6 * fy + (rnd[0][key] - 0.5) * 0.9 - 1.3 * sstep(1.3, 0.3, gap)
    lay(rm, hexc(0x141826) * 1.08, rdet, rh)

    # ---------- a parede da galeria: cantaria, cornija com dentículos, cordão e os medalhões ----------
    wall = aa(V - wall_top)
    stone = mix(hexc(0x2c2f43), hexc(0x24273a), sstep(wall_top, H / K, V)[..., None]) * np.array([1.2, 1.2, 1.27], np.float32)
    BK = Blocks(yy, xx, TW, 33.0, 90.0, rng, vary=0.25, y0=(wall_top + 12) * K)
    bf = BK.face(1.2, 2.0)
    drip = streaks(H, TW, rng, length=150.0, width=7.0, density=0.45) * sstep(wall_top + 110.0, wall_top + 12.0, V)
    lay(wall, stone, (0.92 + 0.14 * tex) * (0.95 + 0.1 * BK.r(3)) * (1 - 0.24 * (1 - bf)) * (1 - 0.26 * drip), BK.height(depth=1.4, jut=0.5, tilt=0.5))
    cy_ = V - wall_top
    cor = aa(np.minimum(cy_, 12.0 - cy_))
    prof = np.where(cy_ < 4.5, 7.0, np.where(cy_ < 9.0, 7.0 - (cy_ - 4.5) / 4.5 * 4.0, 4.5))
    lay(cor, hexc(0x3c4058), 0.95 + 0.1 * fine, prof)
    dent = aa(np.minimum(1.6 - np.abs(((U + 3.0) % 6.0) - 3.0), np.minimum(cy_ - 12.0, 17.0 - cy_)))
    hgt += 3.0 * dent
    det *= 1 + 0.08 * dent
    sc = aa(1.5 - np.abs(V - 377.5))
    hgt += 2.2 * sc
    det *= 1 + 0.06 * sc
    # o eclipse de pedra em cada tímpano: a moldura, o disco fundo, a lua no meio e os doze raios
    ry0 = spring - 47.0
    rdd = np.hypot(bx, V - ry0)
    rang = np.arctan2(V - ry0, bx)
    mould = aa(10.6 - rdd) * (1 - aa(8.6 - rdd))
    disc = aa(8.6 - rdd)
    moon = aa(4.0 - rdd)
    rays = aa(0.55 - np.abs(np.sin(rang * 6.0)) * rdd / 6.0) * aa(rdd - 5.3) * aa(7.9 - rdd)
    hgt += 2.2 * mould - 2.8 * disc + 2.6 * moon - 1.3 * rays * disc - 1.0 * aa(0.6 - np.abs(rdd - 4.7))
    det *= (1 + 0.06 * mould) * (1 - 0.1 * disc) * (1 + 0.1 * moon) * (1 - 0.16 * rays)
    # as aduelas em volta de cada arco, com a pedra de fecho
    AR = ArchRow(yy, ax * K, cell, spring * K, r * K, 9.5 * K, stones=13, mortar=1.1, bevel=1.8)
    rv = rng.random((2, 8192)).astype(np.float32)
    lay(AR.m * 0.8, hexc(0x3a3d54), None, None)
    lay(AR.m, None, (0.93 + 0.14 * rv[0][AR.key]) * (1 - 0.22 * (1 - AR.f)) * (0.94 + 0.12 * tex), 2.2 * AR.f + (rv[1][AR.key] - 0.5) * 0.8 * AR.f + 1.4 * AR.keystone)
    hood = aa(1.3 - np.abs(AR.rd / K - 10.7)) * (V < spring)
    hgt += 1.6 * hood
    det *= 1 + 0.06 * hood

    # ---------- os vãos ----------
    d_open = np.where(V < spring, np.hypot(ax, V - spring) - r, np.abs(ax) - r)
    d_open = np.maximum(d_open, V - par_top)
    opening = aa(-d_open)

    # ---------- capitéis, colunelos geminados e bases ----------
    cy = V - spring
    abac = aa(np.minimum(17.5 - np.abs(bx), np.minimum(cy + 10.0, -6.0 - cy)))
    bellw = 11.0 + 6.5 * np.clip((2.0 - cy) / 8.0, 0, 1) ** 1.6
    bell = aa(np.minimum(bellw - np.abs(bx), np.minimum(cy + 6.2, 2.0 - cy)))
    fol = 0.5 + 0.5 * np.cos(bx * 1.95)
    cap = np.maximum(abac, bell)
    lay(cap, hexc(0x3e4258), (0.96 + 0.1 * fine) * (1 - 0.14 * (1 - fol) * bell * (1 - abac)), np.where(abac > 0.5, 7.5, 5.0 + 1.8 * fol * sstep(2.0, -4.5, cy)))
    solid = cap.copy()
    for sgn in (-7.0, 7.0):
        t = (bx - sgn) / 3.6
        sh = aa(np.minimum(3.6 - np.abs(bx - sgn), np.minimum(cy - 2.0, par_top - 7.0 - V)))
        ann = aa(1.1 - np.abs(V - (spring + 76.0)))
        lay(sh, hexc(0x363a51), 1.0 + 0.04 * (fine - 0.5), 3.0 + 5.2 * cyl(t) + 1.0 * ann)
        solid = np.maximum(solid, sh)
    by = V - par_top
    tor = aa(np.minimum(11.0 - np.abs(bx), np.minimum(by + 7.0, -3.4 - by)))
    pli = aa(np.minimum(15.5 - np.abs(bx), np.minimum(by + 3.6, 0.5 - by)))
    lay(tor, hexc(0x34374c), 1.0, 5.0 + 2.2 * np.sin(np.clip((by + 7.0) / 3.6, 0, 1) * math.pi))
    lay(pli, hexc(0x34374c), 0.98, 6.0)
    solid = np.maximum(solid, np.maximum(tor, pli))

    # ---------- a mureta: a pedra de capa e os blocos grandes ----------
    par = aa(V - par_top)
    PB = Blocks(yy, xx, TW, 39.0, 96.0, rng, vary=0.12, y0=(par_top + 10) * K)
    pbase = mix(hexc(0x34374c), hexc(0x24273a), sstep(par_top, par_top + 80.0, V)[..., None]) * 1.09
    damp = sstep(par_top + 50.0, par_top + 150.0, V + (tex - 0.5) * 50.0)
    lay(par, pbase, (0.92 + 0.16 * tex) * (0.94 + 0.12 * PB.r(3)) * (1 - 0.3 * (1 - PB.face(1.4, 2.2))) * (1 - 0.2 * damp), PB.height(depth=1.8, jut=0.7, tilt=0.6, mortar=1.4, bevel=2.2))
    cop = aa(np.minimum(by, 10.0 - by))
    cprof = np.where(by < 3.0, 6.5, np.where(by < 7.0, 6.5 + 1.6 * np.sin((by - 3.0) / 4.0 * math.pi), 4.0))
    cj = sstep(0.6, 1.6, np.abs(((U + 20.0) % 80.0) - 40.0) * K)          # as juntas da capa
    lay(cop, mix(hexc(0x34374c), hexc(0x3c4058), 0.5), (0.95 + 0.1 * fine) * (0.82 + 0.18 * cj), cprof * (0.85 + 0.15 * cj))
    # líquen na capa e nas primeiras fiadas
    lich = sstep(0.6, 0.85, pnoise(H, TW, 16, rng, 3)) * sstep(par_top + 70.0, par_top, V) * par
    base = mix(base, hexc(0x4a5a48), (lich * 0.3)[..., None])
    facade = np.clip(np.maximum(np.maximum(wall * (1 - opening), solid * wall), np.maximum(par, rm)), 0, 1)

    # ---------- dentro da galeria: a parede do fundo, a abóbada escura e as velas ----------
    IB = Blocks(yy, xx, TW, 33.0, 84.0, rng, vary=0.3, y0=spring * K)
    ibf = IB.face(1.2, 1.8)
    ialb = hexc(0x77726a) * (0.85 + 0.3 * tex)[..., None] * (0.92 + 0.16 * IB.r(3))[..., None]
    ialb = mix(ialb * 0.6, ialb, ibf[..., None])
    ih = IB.height(depth=1.2, jut=0.4, tilt=0.4)
    imp = aa(1.8 - np.abs(V - (spring + 4.0)))
    ih += 2.4 * imp
    # uma porta de madeira no fundo de alguns vãos (os que não têm vela)
    lit_cells = set(int(gx // bay) for gx in plan['glows'])
    ci = cell.astype(np.int64) % int(plan['TW'] // bay)
    door_cell = np.isin(ci, [c for c in range(int(plan['TW'] // bay)) if c % 3 == 1 and c not in lit_cells])
    dd = lancet_d(ax, V, 0.0, 36.0, spring + 22.0, par_top + 30.0, 0.85)
    frame = aa(dd + 3.2) * (1 - aa(dd)) * door_cell
    leaf = aa(dd) * door_cell
    plank = sstep(0.2, 0.9, np.abs(((ax + 18.0) % 6.0) - 3.0) * K)
    strap = np.maximum(aa(1.3 - np.abs(V - (spring + 70.0))), aa(1.3 - np.abs(V - (spring + 118.0)))) * (np.abs(ax) < 15.0)
    ialb = mix(ialb, hexc(0x8a857c) * (0.9 + 0.2 * fine)[..., None], frame[..., None])
    ih = ih * (1 - frame) + 3.2 * frame
    ialb = mix(ialb, hexc(0x4a3626) * (0.6 + 0.4 * plank)[..., None] * (0.8 + 0.4 * tex)[..., None], leaf[..., None])
    ih = ih * (1 - leaf) + (-3.0 + plank * 0.9) * leaf
    ialb = mix(ialb, hexc(0x1c1c20), (strap * leaf)[..., None])
    ih += 1.0 * strap * leaf
    # a espessura do arco (o intradorso): uma faixa de pedra que vira para quem olha
    rev = sstep(6.5, 0.0, -d_open * K) * opening
    ialb = mix(ialb, hexc(0x8e8a84) * (0.9 + 0.2 * fine)[..., None], rev[..., None])
    ih = ih * (1 - rev) + (7.0 * sstep(6.5, 0.0, -d_open * K)) * rev
    lamps = [Light(gx * K, (par_top - 54.0) * K, 16.0, 112.0, WIN1 * np.array([1.0, 0.86, 0.68], np.float32), 1.3) for gx in plan['glows']]
    amb = np.array([0.135, 0.145, 0.235], np.float32) * (0.3 + 0.7 * sstep(spring - 46.0, par_top, V))[..., None]
    icol = shade(ialb, ih, yy, xx, TW, amb, lights=lamps, k=1.0, wrap=True)
    # mais fundo para cima: a abóbada some no escuro
    icol *= (0.45 + 0.55 * sstep(spring - 50.0, spring + 30.0, V))[..., None]
    cv.over(allr, allc, np.clip(icol, 0, 1), wall)
    for gx in plan['glows']:
        # a arandela de ferro com a vela, na parede do fundo
        sx_, sy_ = gx * K, (par_top - 46.0) * K
        rows, cols, ly, lx = cv.win(sx_ - 30, sy_ - 30, 60, 60)
        if rows.stop > rows.start:
            m = Mask(60, rows.stop - rows.start)
            oy_ = rows.start
            m.rect(27.5, sy_ - oy_ + 6, 32.5, sy_ - oy_ + 20)
            m.line([(30, sy_ - oy_ + 8), (30, sy_ - oy_ + 3)], 9.0)
            cv.over(rows, cols, hexc(0x0a0a0e), m.array() * 0.95)
            wax = np.clip(np.minimum(2.6 - np.abs(lx - sx_), np.minimum(ly - (sy_ - 9), sy_ + 3 - ly)) + 0.5, 0, 1)
            cv.over(rows, cols, mix(hexc(0xd8c49a), hexc(0x8a6a44), np.clip((ly - sy_ + 9) / 12, 0, 1)[..., None]), wax)
        flame(cv, sx_, sy_ - 9, 0.23, rng, halo=0.9)
        # o ar da galeria aceso em volta da vela (a mancha quente de antes)
        rows, cols, ly, lx = cv.win(sx_ - 150, sy_ - 190, 300, 330)
        if rows.stop > rows.start:
            g = np.exp(-(np.hypot((lx - sx_) / 66.0, (ly - sy_ + 10) / 82.0)) ** 2) * np.clip(1 - (np.hypot((lx - sx_) / 148.0, (ly - sy_ + 10) / 160.0)) ** 4, 0, 1)
            cv.over(rows, cols, WIN0 * 0.6, g * 0.3)

    # ---------- a fachada por cima ----------
    lit = shade(np.ones((H, TW, 3), np.float32), hgt, yy, xx, TW, AMBN, sun=SKYN, sun2=ecln(0.42), k=1.0, wrap=True)
    col = base * det[..., None] * lit
    # a luz das velas pega a beira de dentro dos colunelos e dos capitéis
    for gx in plan['glows']:
        dxl = wdx(xx, gx * K, TW)
        g = np.exp(-(np.hypot(dxl / 150.0, (yy - (par_top - 54.0) * K) / 190.0)) ** 2)
        inner = np.clip(np.where(dxl > 0, -1.0, 1.0) * np.gradient(hgt, axis=1) * 0.6, 0, 1)
        col += WIN0 * (g * inner * 0.5 * solid)[..., None]
    # o céu frio no alto do telhado e da cornija; o ouro do eclipse na cumeeira
    col = mix(col, COLD * 0.5 + col * 0.6, (sstep(roof_top + 5.0, roof_top, V) * rm * 0.7)[..., None])
    col = mix(col, GOLD2 * 0.8 + col * 0.3, (aa(1.0 - np.abs(V - roof_top - 0.6)) * rm * 0.3)[..., None])
    moss = sstep(0.56, 0.8, pnoise(H, TW, 26, rng, 3)) * sstep(roof_top + 6.0, wall_top, V + (tex - 0.5) * 24.0) * rm
    col = mix(col, hexc(0x26301f) * (0.7 + 0.6 * fine)[..., None], (moss * 0.5)[..., None])
    cv.over(allr, allc, np.clip(col, 0, 1), facade)

    # ---------- hera descendo do telhado e brotando da mureta ----------
    for (x, top, ln) in plan['ivy']:
        pts = [(x, wall_top + 8.0) if top else (x, par_top + 5.0)]
        n = max(2, int(ln / 6))
        for j in range(n):
            px_, py_ = pts[-1]
            pts.append((px_ + rng.normal(0, 2.2), py_ + (ln / n if top else -ln * 0.8 / n)))
        leaves(cv, pts, rng, int(ln * (0.75 if top else 1.1)) + 4, hang=top, spread=3.0 if top else 3.6)

    # ---------- os ciprestes do jardim ----------
    for (x, h, jit) in plan['trees']:
        cypress(cv, x, h, jit, rng)

    # ---------- a névoa baixa do jardim ----------
    mist_n = pnoise(H, TW, 70, rng, 3, sx=3.0)
    cv.over(allr, allc, mix(SL1, FOG0, 0.4), np.clip(sstep(930.0, 1200.0, yy + (mist_n - 0.5) * 60.0), 0, 1) * 0.85)
    cv.over(allr, allc, SL1 * 0.9, sstep(1140.0, 1260.0, yy))
    cv.col[:] = grain(cv.col, rng, 0.022)
    return cv


# ======================================================================================
if __name__ == '__main__':
    if want('city-sky'):
        save(city_sky(np.random.default_rng(161)), 'city-sky')
    if want('city-far'):
        save(city_far(np.random.default_rng(162)), 'city-far', opaque=False)
    if want('city-mid'):
        save(city_mid(np.random.default_rng(163)), 'city-mid')
    if want('claustro-mid'):
        save(claustro_mid(np.random.default_rng(166)), 'claustro-mid')
    if PREVIEW:
        preview(PREVIEW, 'city', [('city-far', 0.1), ('city-mid', 0.3)], bg=(33, 42, 66))
        preview(PREVIEW, 'claustro', [('city-far', 0.1), ('claustro-mid', 0.3)], bg=(33, 42, 66))

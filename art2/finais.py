"""Os planos pintados dos três finais (game/src/world/endings.ts, FILMS e FILM_FRAMES).

Cada plano é uma tela de 1280x720 (2 px da pintura por px do jogo). Os de nome "-perto" têm transparência:
ficam na frente e andam mais que o fundo durante o plano. Os de nome "-luz" são luz somada por cima (o preto
não acende nada) e pulsam devagar no jogo; por isso só levam brilhos largos, que não precisam casar com as
bordas do fundo (os contornos acesos ficam na pintura de baixo).

O jeito de pintar é o mesmo dos fundos (art2/brush.py): primeiro uma referência limpa com as formas, a luz e
as sombras; depois o pincel repinta tudo seguindo a forma (as linhas de mesmo tom) e os detalhes finos voltam
por cima. As peças com volume (a máscara de porcelana, a foice, a coroa) saem da mesma luz por normais de
art2/coroado.py, com o desenho da máscara do ícone do cavaleiro (a testa larga, o queixo em ponta, a fenda
dos olhos e a rachadura).

uso: python3 finais.py <pasta_saida> [quadro ...]       pinta os quadros (todos, sem nomes) em PNG
     python3 finais.py <pasta_saida> --atlas <assets>    junta os PNG nos três atlas finais-<final>.webp
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brush import Layer, hexc, mix, sstep, blur, value_noise, noise1d, paint
from shapes import Mask
import coroado as K

W, H = 1280, 720
T0 = time.time()
LUMA = np.array([0.3, 0.52, 0.18], np.float32)

# a ordem de cada atlas (a mesma de FILM_FRAMES em endings.ts)
FRAMES = {
    'truth': ['mascara', 'mascara-luz', 'vespera', 'vespera-perto', 'povo', 'destrocos', 'destrocos-perto', 'flor'],
    'absorb': ['paz', 'ruas', 'ruas-perto', 'trono', 'rosto', 'eclipse'],
    'fragments': ['vozes', 'vozes-luz', 'cacos', 'ceu', 'ceu-perto', 'campo', 'campo-perto'],
}


def log(*a):
    print(*a, round(time.time() - T0, 1), 's', flush=True)


def grid(w=W, h=H):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    return yy, xx


def col(h):
    return hexc(h)


def vgrad(stops, t):
    """Degradê por uma coordenada t (0 a 1): stops = [(t, cor), ...]."""
    xs = np.array([s[0] for s in stops], np.float32)
    cs = np.array([s[1] for s in stops], np.float32)
    out = np.empty(t.shape + (3,), np.float32)
    for i in range(3):
        out[..., i] = np.interp(t, xs, cs[:, i])
    return out


def put(ref, color, m):
    """Pinta a cor (3 ou HxWx3) na referência onde a máscara (0 a 1) cobre."""
    m = np.clip(m, 0, 1)[..., None]
    return ref * (1 - m) + np.asarray(color, np.float32) * m


def add_light(ref, color, k):
    return ref + np.asarray(color, np.float32) * np.clip(k, 0, None)[..., None]


def screen(ref, color, k):
    c = np.asarray(color, np.float32) * np.clip(k, 0, 1)[..., None]
    return 1 - (1 - ref) * (1 - c)


def radial(xx, yy, cx, cy, rx, ry=None):
    ry = rx if ry is None else ry
    return np.hypot((xx - cx) / rx, (yy - cy) / ry)


def shifted(m, dx, dy):
    return ndi.shift(m, (dy, dx), order=1, mode='constant')


def rim_of(m, dx, dy, soft=1.2):
    """A borda da forma virada para a luz: o que sobra da máscara deslocada para longe da luz."""
    return np.clip(m - shifted(m, -dx, -dy), 0, 1) * blur(m, soft)


# ---------------------------------------------------------------- direção das pinceladas
def flow_of(ref, base, k_edge=1.0, lo=0.004, hi=0.03, sigma=6.0):
    """As pinceladas seguem as linhas de mesmo tom onde a imagem tem forma e o ângulo `base` (número ou
    HxW) onde ela é lisa."""
    lum = blur(ref @ LUMA, 2.0)
    gy, gx = np.gradient(lum)
    jxx, jyy, jxy = blur(gx * gx, sigma), blur(gy * gy, sigma), blur(gx * gy, sigma)
    ang = 0.5 * np.arctan2(2 * jxy, jxx - jyy) + np.pi / 2
    mag = np.sqrt(np.sqrt(jxx + jyy))
    w = sstep(lo, hi, mag) * k_edge
    b = np.broadcast_to(np.asarray(base, np.float32), lum.shape)
    vx = np.cos(2 * ang) * w + np.cos(2 * b) * (1 - w)
    vy = np.sin(2 * ang) * w + np.sin(2 * b) * (1 - w)
    return (0.5 * np.arctan2(vy, vx)).astype(np.float32)


def passes(scale=1.0, dry=0.25, bristle=0.35, err=(0.0, 0.025, 0.04, 0.06), long=1.0, fine=True):
    out = [
        dict(size=26 * scale, spacing=0.75, length=(2.4 * long, 5.0 * long), err=err[0], alpha=0.75, bristle=bristle * 0.5, dry=dry * 0.5, blur=0.5, taper=0.3),
        dict(size=12 * scale, spacing=0.7, length=(2.6 * long, 5.6 * long), err=err[1], alpha=0.82, bristle=bristle, dry=dry, blur=0.35, taper=0.35),
        dict(size=6 * scale, spacing=0.7, length=(2.4 * long, 5.0 * long), err=err[2], alpha=0.88, bristle=bristle, dry=dry, blur=0.28, taper=0.4),
    ]
    if fine:
        out.append(dict(size=3.0 * scale, spacing=0.8, length=(2.0 * long, 4.2 * long), err=err[3], alpha=0.9, bristle=bristle * 0.6, dry=dry * 0.6, blur=0.2, taper=0.45))
    return out


DEBUG = os.environ.get('FINAIS_DEBUG')


def painted(ref, rng, flow, mask=None, ps=None, base=1.0, keep=0.0, relief=0.22):
    """Repinta a referência com o pincel; `keep` devolve um pouco da referência limpa (os detalhes)."""
    if DEBUG:
        finish(ref).save(os.path.join(DEBUG, f'ref-{int(time.time() * 1000) % 100000}.png'))
    m = np.ones((H, W), np.float32) if mask is None else mask
    L = Layer(W, H)
    paint(L, ref, m, flow, rng, ps or passes(), jitter=0.008, val_jitter=0.04, base=base)
    out = L.color()
    if keep:
        out = out * (1 - keep) + ref * keep
    if relief:
        # o relevo da tinta: as cristas das pinceladas pegam a luz de cima
        l2 = out @ LUMA
        bump = l2 - blur(l2, 2.0)
        by = np.gradient(blur(bump, 0.6))[0]
        out = out * (1 + np.clip(-by * relief * 5, -0.12, 0.12))[..., None]
    return np.clip(out, 0, 1), L.A


def finish(rgb, alpha=None):
    rgb = np.clip(rgb, 0, 1)
    if alpha is None:
        return Image.fromarray((rgb * 255 + 0.5).astype(np.uint8), 'RGB').convert('RGBA')
    a = np.clip(alpha, 0, 1)
    return Image.fromarray((np.dstack([rgb, a]) * 255 + 0.5).astype(np.uint8), 'RGBA')


# ---------------------------------------------------------------- peças com volume (art2/coroado.py)
def prop_rgba(cv, paint_big=None, mix_ref=0.25):
    """A peça pronta (HxWx4 float): com o pincel de coroado.py, ou só a luz (paint_big=None)."""
    if paint_big:
        return K.paintover(cv, big=paint_big, mix_ref=mix_ref, outline=0.35, rim=0.0)
    img = cv.rgba().astype(np.float32)
    for f in cv.post:
        f(img)
    return img


def place(ref, alpha, img, x, y, scale=1.0, ang=0.0, sx=1.0, sy=1.0, ox=None, oy=None, k=1.0):
    """Põe uma peça (HxWx4) na tela com o ponto (ox, oy) da peça em (x, y), escala, achatamento e giro."""
    h, w = img.shape[:2]
    ox = w / 2 if ox is None else ox
    oy = h / 2 if oy is None else oy
    c, s = math.cos(ang), math.sin(ang)
    # da tela para a peça: desfaz o giro, a escala e o achatamento
    a, b = c / (scale * sx), s / (scale * sx)
    d, e = -s / (scale * sy), c / (scale * sy)
    tx = ox - (a * x + b * y)
    ty = oy - (d * x + e * y)
    pre = np.dstack([img[..., :3] * img[..., 3:4], img[..., 3:4]])
    chans = []
    for i in range(4):
        ch = Image.fromarray(pre[..., i].astype(np.float32), 'F')
        chans.append(np.asarray(ch.transform((W, H), Image.AFFINE, (a, b, tx, d, e, ty), resample=Image.BICUBIC), np.float32))
    pa = np.clip(chans[3], 0, 1) * k
    prgb = np.dstack(chans[:3]) * k
    ref = ref * (1 - pa[..., None]) + prgb
    if alpha is not None:
        alpha = alpha + pa * (1 - alpha)
    return np.clip(ref, 0, 1), alpha, pa


# ---------------------------------------------------------------- a máscara do cavaleiro
# o contorno, a rachadura e o fio dela são os de coroado.py (MASK_OUT, CRACK, CRACK2): o ícone dele
MASK_BOX = (30.0, 41.0, 90.0, 116.0)


def mask_prop(scale=5, light=(0.0, -0.74, 0.6), crack='open', warm=(1.0, 0.86, 0.66), cool=(0.42, 0.44, 0.7), seed=3, amb=0.1):
    """A máscara de porcelana de frente (60 x 75 px do mundo, vezes `scale`): testa larga, queixo em ponta,
    a quilha no meio, as fendas dos olhos (a da direita maior), os sulcos das bochechas e a rachadura (aberta,
    selada em ouro ou partida em cacos, sem nada). Devolve RGBA float e o tamanho do px do mundo."""
    K.S = scale
    x0, y0, x1, y1 = MASK_BOX
    cv = K.Cv(x1 - x0, y1 - y0, seed=seed)
    K.scene(cv, 0, 0, kc=1.0)
    X, Y = cv.X + x0, cv.Y + y0
    grain = value_noise(cv.H, cv.W, 6 * scale, cv.rng, 3) - 0.5
    pts = [(x - x0, y - y0) for x, y in K.MASK_OUT]
    mm = K.poly(cv, K.spline(pts, 8, closed=True))
    md = K.inside(mm)
    h = -0.55 * np.abs(X - 60) - 0.0045 * (Y - 76) ** 2 + 3.2 * sstep(0, 4.5, md)
    h += 1.6 * np.exp(-((Y - 63.5) / 2.4) ** 2) * (1 - sstep(10, 26, np.abs(X - 60)))
    for ex in (46.0, 74.0):
        h += 1.3 * np.exp(-(((X - ex) / 6.5) ** 2 + ((Y - 81) / 4.5) ** 2))
        h -= 2.2 * np.exp(-(((X - ex) / 8.5) ** 2 + ((Y - 70) / 4.2) ** 2))
    # a distância até a borda sai em degraus na escala grande: um borrão leve tira as listras da beirada
    n = K.normals(blur(h, scale * 0.7))
    L = K.unit(light)
    d = np.clip((K.dot(n, L) + 0.3) / 1.3, 0, 1)
    rim = np.clip(1 - n[..., 2], 0, 1) ** 2
    v = amb + 0.95 * d * K.cavity(h, 2.0) * (1 + grain * 0.1) + 0.2 * rim
    base = K.PORC_R(v)
    # a cor da luz (o sol) e a do ambiente (o céu) por cima do tom da porcelana
    tw = np.clip(d, 0, 1)[..., None]
    c = base * (np.asarray(cool, np.float32) * (1 - tw) + np.asarray(warm, np.float32) * tw) * 1.12
    hh = K.unit(L + K.VIEW)
    c = c + (np.clip(K.dot(n, hh), 0, 1) ** 24)[..., None] * 0.25 * np.asarray(warm, np.float32)
    cv.put(mm, c, flow=np.pi / 2, shadow=0)
    ox, oy = -x0, -y0

    def face(img):
        a = img[..., 3]
        for (ex, ey, rx, ry, tl) in ((47.0, 70.0, 7.6, 2.5, 0.12), (73.0, 70.0, 8.2, 2.8, -0.12)):
            cc = K.ellipse(cv, ex + ox, ey + oy, rx, ry, tl)[0]
            lo = K.ellipse(cv, ex + ox, ey + oy + 0.9, rx + 0.8, ry + 0.9, tl)[0] * (1 - cc)
            hi = K.ellipse(cv, ex + ox, ey + oy - 0.9, rx + 0.9, ry + 1.2, tl)[0] * (1 - cc)
            img[..., :3] += (lo * a * 0.14)[..., None] * np.asarray(warm, np.float32)
            img[..., :3] *= (1 - hi * a * 0.35)[..., None]
            img[..., 3] = img[..., 3] * (1 - cc)
        grooves = []
        for sx in (-1, 1):
            grooves += K.segs_of([(60 + sx * 15.5 + ox, 79 + oy), (60 + sx * 14.6 + ox, 88 + oy), (60 + sx * 12.4 + ox, 96 + oy)])
            grooves += K.segs_of([(60 + sx * 20.5 + ox, 81 + oy), (60 + sx * 19.4 + ox, 89 + oy)])
        K.engrave(img, cv, grooves, 0.9, 0.38, 0.22, warm)
        ridge = np.exp(-((cv.X - 60.2 - ox) / 0.55) ** 2) * sstep(48, 54, cv.Y - oy) * (1 - sstep(104, 112, cv.Y - oy)) * a
        img[..., :3] += (ridge * 0.08)[..., None]
    cv.post.append(face)
    seams = []
    for line, jit in ((K.CRACK, 0.3), (K.CRACK2, 0.25)):
        jag = [(line[0][0] + ox, line[0][1] + oy)]
        for p0, p1 in zip(line[:-1], line[1:]):
            mid = ((p0[0] + p1[0]) / 2 + cv.rng.normal(0, jit) + ox, (p0[1] + p1[1]) / 2 + cv.rng.normal(0, jit) + oy)
            jag += [mid, (p1[0] + ox, p1[1] + oy)]
        seams.append(jag)

    def cracks(img):
        a = img[..., 3]
        for i, jag in enumerate(seams):
            w = 1.25 if i == 0 else 0.7
            dd, _ = K.seg_dist(cv, K.segs_of(jag), pad=4)
            groove = K.aa(dd - w * 0.5 - 0.5) * a
            img[..., :3] *= (1 - 0.35 * groove)[..., None]
            line = K.aa(dd - w * 0.5) * a
            if crack == 'gold':
                t = np.clip(1 - dd / max(w * 0.5, 0.3), 0, 1)
                img[..., :3] = img[..., :3] * (1 - line[..., None]) + line[..., None] * K.GOLD_R(0.5 + 0.38 * t)
            else:
                # aberta: o escuro da fenda e, embaixo, a beirada que pega a luz
                img[..., :3] = img[..., :3] * (1 - line[..., None]) + line[..., None] * np.array([0.05, 0.04, 0.06], np.float32)
                d2, _ = K.seg_dist(cv, [((p[0], p[1] + w * 0.9), (q[0], q[1] + w * 0.9)) for p, q in K.segs_of(jag)], pad=4)
                lip = K.aa(d2 - w * 0.3) * (1 - line) * a
                img[..., :3] += (lip * 0.18)[..., None] * np.asarray(warm, np.float32)
    cv.post.append(cracks)
    img = prop_rgba(cv)
    K.S = 2
    return img


def mask_pieces(img, seed=5):
    """A máscara partida em cacos (sem nada de dentro): cortes retos e tortos que saem da rachadura; cada caco
    é uma máscara de alfa da peça inteira."""
    h, w = img.shape[:2]
    rng = np.random.default_rng(seed)
    yy, xx = grid(w, h)
    # o ponto de onde a quebra sai: o pé da rachadura, entre os olhos
    cx, cy = w * 0.53, h * 0.41
    angs = [-1.75, -0.35, 0.75, 1.75, 2.75]
    lab = np.zeros((h, w), np.int32)
    th = np.arctan2(yy - cy, xx - cx)
    r = np.hypot(xx - cx, yy - cy)
    # o ângulo de cada corte entorta com a distância (quebra de porcelana não é reta)
    wob = (value_noise(h, w, 18, rng, 3) - 0.5) * 0.5 + r * 0.0012
    tt = np.mod(th + wob + math.pi, 2 * math.pi)
    edges = np.sort(np.mod(np.array(angs) + math.pi, 2 * math.pi))
    lab = np.searchsorted(edges, tt) % len(edges)
    return [(lab == i).astype(np.float32) for i in range(len(edges))], (cx, cy)


# ---------------------------------------------------------------- a foice
def scythe_prop(scale=3, length=300, light=(0.2, -0.8, 0.55), warm=(1.0, 0.84, 0.62), cool=(0.4, 0.42, 0.66), seed=7):
    """A foice dele vista de cima, deitada (o cabo ao longo de x, a lâmina na ponta da direita curvando para
    cima): o cabo de madeira escura com as argolas de ouro e a lâmina de aço com o fio claro."""
    K.S = scale
    blade_w = 128
    cv = K.Cv(length + 40, blade_w + 30, seed=seed)
    K.scene(cv, 0, 0, kc=1.0)
    X, Y = cv.X, cv.Y
    L = K.unit(light)
    yc = blade_w + 12
    x_end = length + 10
    grain = value_noise(cv.H, cv.W, 4 * scale, cv.rng, 3) - 0.5
    # o cabo: um tubo; a madeira com veios ao longo
    cov, hh, t = K.tube(cv, [(8, yc), (x_end, yc)], 4.6)
    n = K.normals(hh)
    d = np.clip((K.dot(n, L) + 0.25) / 1.25, 0, 1)
    wood = K.ramp([(0.0, (0.02, 0.015, 0.02)), (0.4, (0.09, 0.06, 0.05)), (0.75, (0.22, 0.14, 0.09)), (1.0, (0.5, 0.36, 0.24))])
    vein = np.sin(Y * 2.2 + 3 * np.sin(X * 0.05)) * 0.05
    c = wood(0.12 + 0.8 * d + vein + grain * 0.1) * (np.asarray(cool) * (1 - d[..., None]) + np.asarray(warm) * d[..., None]) * 1.2
    cv.put(cov, c, flow=0.0, shadow=0)
    # as argolas de ouro: na ponta de baixo, no meio e junto da lâmina
    for gx, gw in ((12, 5), (length * 0.52, 3.2), (x_end - 10, 6)):
        cov2, h2, _ = K.tube(cv, [(gx - gw, yc), (gx + gw, yc)], 5.6)
        h2 = h2 + 1.2 * np.exp(-((X - gx) / (gw * 0.5)) ** 2)
        cv.put(cov2, K.metal(K.normals(h2), diffuse=0.45, spec=1.1, light=L), shadow=0.5, drop=0.8, soft=0.8)
    # a lâmina: um crescente que sai da ponta e curva para cima e para a esquerda
    bx, by = x_end - 4, yc - 2
    outer = K.spline([(bx + 6, by + 4), (bx + 26, by - 30), (bx + 22, by - 76), (bx - 8, by - 112), (bx - 62, by - 128), (bx - 120, by - 122)], 10)
    inner = K.spline([(bx - 120, by - 122), (bx - 70, by - 110), (bx - 28, by - 88), (bx - 4, by - 52), (bx - 2, by - 14)], 10)
    bm = K.poly(cv, outer + inner)
    bd = K.inside(bm)
    # o fio (a borda de dentro, côncava) é a parte mais fina: o chanfro pega a luz
    dist_in = ndi.distance_transform_edt(K.poly(cv, inner + [(bx + 40, by + 10), (bx + 40, by - 140), (bx - 130, by - 140)]) < 0.5) / scale
    hb = blur(2.6 * sstep(0, 10, bd) + 1.4 * sstep(0, 3, dist_in), scale * 0.8)
    nb = K.normals(hb)
    # aço escuro, frio, como o da folha do cavaleiro; o claro fica no fio
    steel = K.ramp([(0.0, (0.02, 0.025, 0.04)), (0.4, (0.08, 0.1, 0.15)), (0.75, (0.22, 0.26, 0.34)), (1.0, (0.62, 0.68, 0.78))])
    db = np.clip((K.dot(nb, L) + 0.2) / 1.2, 0, 1)
    spec = np.clip(K.dot(nb, K.unit(L + K.VIEW)), 0, 1) ** 40
    tint = 0.82 + 0.18 * (np.asarray(cool) * (1 - db[..., None]) + np.asarray(warm) * db[..., None])
    c = steel(0.1 + 0.42 * db + 0.45 * spec + grain * 0.06) * tint
    edge = np.exp(-(dist_in / 1.2) ** 2) * bm
    c = c + edge[..., None] * np.asarray(warm, np.float32) * 0.5
    # o encaixe da lâmina no cabo: um colar de ferro
    sock = K.tube(cv, [(bx - 10, yc), (bx + 4, yc)], 5.4)
    cv.put(sock[0], K.metal(K.normals(sock[1]), R=K.IRON_R, diffuse=0.5, spec=0.8, light=L), shadow=0.5, drop=0.8, soft=0.8)
    cv.put(bm, c, flow=0.0, shadow=0.6, drop=1.0, soft=1.0)
    img = prop_rgba(cv)
    K.S = 2
    return img, (8 * scale, yc * scale), (x_end * scale, yc * scale)


def place_m(ref, alpha, img, x, y, M, ox=None, oy=None, k=1.0):
    """Põe uma peça com a matriz M (2x2, da peça para a tela) e o ponto (ox, oy) da peça em (x, y)."""
    h, w = img.shape[:2]
    ox = w / 2 if ox is None else ox
    oy = h / 2 if oy is None else oy
    Mi = np.linalg.inv(np.asarray(M, np.float64))
    a, b = Mi[0]
    d, e = Mi[1]
    tx = ox - (a * x + b * y)
    ty = oy - (d * x + e * y)
    pre = np.dstack([img[..., :3] * img[..., 3:4], img[..., 3:4]])
    chans = []
    for i in range(4):
        ch = Image.fromarray(pre[..., i].astype(np.float32), 'F')
        chans.append(np.asarray(ch.transform((W, H), Image.AFFINE, (a, b, tx, d, e, ty), resample=Image.BICUBIC), np.float32))
    pa = np.clip(chans[3], 0, 1) * k
    prgb = np.clip(np.dstack(chans[:3]), 0, None) * k
    ref = ref * (1 - pa[..., None]) + prgb
    if alpha is not None:
        alpha = alpha + pa * (1 - alpha)
    return np.clip(ref, 0, 1), alpha, pa


def rot(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s], [s, c]])


def floor_m(scale, ang, squash):
    """Uma peça deitada no chão: gira no plano do chão e achata na vertical (a câmera baixa)."""
    return np.diag([1.0, squash]) @ rot(ang) * scale


def stretched_noise(h, w, cell, aspect, rng, octaves=4):
    """Ruído esticado na horizontal (nuvens em faixa, veio de pedra): manchas `cell` de altura e `aspect`
    vezes mais largas."""
    ww = max(4, int(w / aspect))
    n = value_noise(h, ww, cell, rng, octaves)
    return np.asarray(Image.fromarray(n.astype(np.float32), 'F').resize((w, h), Image.BICUBIC), np.float32)


def noise_tex(rng, size=512, cell=40, octaves=4):
    """Uma textura de ruído que emenda nas bordas, para amostrar em coordenadas do chão (perspectiva)."""
    n = value_noise(size * 2, size * 2, cell, rng, octaves)
    t = n[:size, :size].copy()
    wx = np.linspace(0, 1, size, dtype=np.float32)[None, :]
    wy = np.linspace(0, 1, size, dtype=np.float32)[:, None]
    t = t * (1 - wx) + n[:size, size:] * wx
    t2 = n[size:, :size] * (1 - wx) + n[size:, size:] * wx
    t = t * (1 - wy) + t2 * wy
    return (t - t.min()) / (t.max() - t.min() + 1e-6)


def sample(tex, u, v):
    s = tex.shape[0]
    return ndi.map_coordinates(tex, [np.mod(v, s), np.mod(u, s)], order=1, mode='wrap').astype(np.float32)


def ridge(xs, rng, base, amp, cell=160.0, octaves=6, sharp=0.6):
    from relevo import jagged
    return jagged(np.full(len(xs), base, np.float32), rng, amp, cell, octaves, sharp)


# ---------------------------------------------------------------- gente
# Um corpo é um esqueleto em unidades da altura (os pés em y = 0, o alto da cabeça em y = -1, x no meio) e
# as peças em volta dele: membros como traços grossos que afinam, o tronco, a cabeça e a roupa (vestido,
# casaco, capa, capuz, cabelo). A cena acende as bordas com a luz dela (rim_of).
BASE_POSE = dict(
    head=(0.0, -0.925), neck=(0.0, -0.845),
    sl=(-0.105, -0.805), sr=(0.105, -0.805), el=(-0.135, -0.63), er=(0.135, -0.63),
    hl=(-0.145, -0.47), hr=(0.145, -0.47), wl=(-0.082, -0.6), wr=(0.082, -0.6),
    pl=(-0.072, -0.5), pr=(0.072, -0.5), kl=(-0.072, -0.265), kr=(0.072, -0.265),
    fl=(-0.08, -0.012), fr=(0.08, -0.012),
)


def pose(**kw):
    p = dict(BASE_POSE)
    p.update(kw)
    return p


class Body:
    """Um corpo desenhado numa máscara (com as partes separadas: pele, cabelo, roupa, capa)."""

    def __init__(self, x, y, h, p, flip=False, head_r=0.066, build=1.0):
        self.x, self.y, self.h, self.p, self.flip = x, y, h, p, flip
        self.head_r = head_r
        self.k = build
        self.parts = {}

    def P(self, q):
        qx, qy = self.p[q] if isinstance(q, str) else q
        if self.flip:
            qx = -qx
        return (self.x + qx * self.h, self.y + qy * self.h)

    def _m(self, name):
        if name not in self.parts:
            self.parts[name] = Mask(W, H)
        return self.parts[name]

    def limb(self, a, b, c, w0, w1, part='cloth'):
        m = self._m(part)
        pts = [self.P(a), self.P(b), self.P(c)]
        ws = [w0, (w0 + w1) / 2, w1]
        for (p0, p1), wa, wb in zip(zip(pts[:-1], pts[1:]), ws[:-1], ws[1:]):
            n = 6
            for i in range(n):
                t0, t1 = i / n, (i + 1) / n
                q0 = (p0[0] + (p1[0] - p0[0]) * t0, p0[1] + (p1[1] - p0[1]) * t0)
                q1 = (p0[0] + (p1[0] - p0[0]) * t1, p0[1] + (p1[1] - p0[1]) * t1)
                m.line([q0, q1], (wa + (wb - wa) * (t0 + t1) / 2) * self.h * self.k)
        return self

    def poly(self, pts, part='cloth'):
        self._m(part).poly([self.P(q) for q in pts])
        return self

    def ellipse(self, q, rx, ry, part='skin'):
        cx, cy = self.P(q)
        self._m(part).ellipse(cx, cy, rx * self.h, ry * self.h)
        return self

    def basic(self, arms=True, legs=True, skin='skin', cloth='cloth'):
        p = self.p
        if legs:
            self.limb('pl', 'kl', 'fl', 0.075, 0.05, cloth).limb('pr', 'kr', 'fr', 0.075, 0.05, cloth)
        wl, wr = p['wl'], p['wr']
        sl, sr, nk = p['sl'], p['sr'], p['neck']
        # o tronco com os ombros caídos: a base do pescoço, o alto do ombro, a ponta do ombro e a axila
        self.poly([(nk[0] - 0.04, nk[1] + 0.008), (sl[0] + 0.03, sl[1] - 0.018), (sl[0] - 0.008, sl[1] + 0.012), (sl[0] + 0.01, sl[1] + 0.11),
                   (wl[0] - 0.004, wl[1]), (p['pl'][0] - 0.016, p['pl'][1] + 0.01), (p['pr'][0] + 0.016, p['pr'][1] + 0.01), (wr[0] + 0.004, wr[1]),
                   (sr[0] - 0.01, sr[1] + 0.11), (sr[0] + 0.008, sr[1] + 0.012), (sr[0] - 0.03, sr[1] - 0.018), (nk[0] + 0.04, nk[1] + 0.008)], cloth)
        self._m(cloth).line([self.P('neck'), self.P((p['head'][0], p['head'][1] + 0.03))], 0.04 * self.h * self.k)
        if arms:
            self.limb('sl', 'el', 'hl', 0.055, 0.04, cloth).limb('sr', 'er', 'hr', 0.055, 0.04, cloth)
            for hnd in ('hl', 'hr'):
                self.ellipse(hnd, 0.022, 0.026, skin)
        self.ellipse('head', self.head_r * 0.88, self.head_r, skin)
        return self

    def dress(self, hem=-0.03, flare=0.2, sway=0.0, part='cloth'):
        p = self.p
        wl, wr = p['wl'], p['wr']
        self.poly([(wl[0] - 0.01, wl[1]), (wr[0] + 0.01, wr[1]), (p['pr'][0] + 0.03, p['pr'][1]), (flare + sway, hem), (sway * 0.5, hem + 0.012), (-flare + sway, hem), (p['pl'][0] - 0.03, p['pl'][1])], part)
        return self

    def coat(self, hem=-0.24, flare=0.15, part='cloth'):
        p = self.p
        self.poly([p['sl'], p['sr'], (flare, hem), (-flare, hem)], part)
        return self

    def cloak(self, hem=-0.06, flare=0.24, sway=0.0, part='cloak'):
        p = self.p
        sl, sr = p['sl'], p['sr']
        self.poly([(sl[0] - 0.02, sl[1] - 0.015), (sr[0] + 0.02, sr[1] - 0.015), (sr[0] + 0.05, sr[1] + 0.1), (flare + sway, hem), (sway * 0.4, hem + 0.02), (-flare + sway, hem), (sl[0] - 0.05, sl[1] + 0.1)], part)
        return self

    def hood(self, part='cloak', point=0.07, lean=-0.03):
        hx, hy = self.p['head']
        r = self.head_r
        self.poly([(hx - r * 1.25, hy + r * 1.1), (hx - r * 1.3, hy - r * 0.2), (hx - r * 0.6, hy - r * 1.15), (hx + lean, hy - r - point), (hx + r * 0.7, hy - r * 1.1), (hx + r * 1.3, hy - r * 0.15), (hx + r * 1.25, hy + r * 1.1)], part)
        return self

    def hair(self, length=0.12, wind=0.0, part='hair', bun=False):
        hx, hy = self.p['head']
        r = self.head_r
        self.ellipse((hx, hy - r * 0.12), r * 0.98, r * 1.02, part)
        if bun:
            self.ellipse((hx - r * 0.2, hy - r * 1.05), r * 0.45, r * 0.4, part)
        if length > 0:
            self.poly([(hx - r * 0.95, hy - r * 0.2), (hx + r * 0.95, hy - r * 0.2), (hx + r * 0.9 + wind * 0.6, hy + length), (hx + wind, hy + length + 0.02), (hx - r * 0.9 + wind * 0.6, hy + length)], part)
        return self

    def masks(self, smooth=0.011):
        """As partes, com as quinas arredondadas (borrão e corte macio): gente não tem quina de polígono."""
        out = {}
        sg = max(0.6, smooth * self.h)
        for k, m in self.parts.items():
            a = m.array()
            out[k] = sstep(0.38, 0.62, blur(a, sg)) if smooth else a
        return out

    def silhouette(self, smooth=0.011):
        out = np.zeros((H, W), np.float32)
        for m in self.masks(smooth).values():
            out = np.maximum(out, m)
        return out


def silhouettes(bodies):
    out = np.zeros((H, W), np.float32)
    for b in bodies:
        out = np.maximum(out, b.silhouette())
    return out


# ======================================================================================
# Final I: A Aurora das Memórias
# ======================================================================================
HZ = 352.0  # o horizonte do terraço
SUN = (905.0, 368.0)


def dawn_sky(rng, yy, xx, hz=HZ, sun=SUN, top=0x1f2444):
    t = np.clip(yy / hz, 0, 1.2)
    sky = vgrad([(0.0, col(top)), (0.3, col(0x3d3b66)), (0.56, col(0x84657f)), (0.78, col(0xd29a85)), (0.92, col(0xf7cf9e)), (1.0, col(0xfff0d0)), (1.2, col(0xfff0d0))], t)
    d = radial(xx, yy, sun[0], sun[1], 520, 300)
    sky = mix(sky, col(0xffe0ae), (np.exp(-d ** 2 * 1.6) * 0.55)[..., None])
    # faixas de nuvem alta, acesas por baixo
    n1 = stretched_noise(H, W, 70, 5.0, rng, 5)
    n2 = stretched_noise(H, W, 26, 3.0, rng, 3)
    band = sstep(0.52, 0.74, n1 * 0.8 + n2 * 0.2) * sstep(0.12, 0.4, t) * (1 - sstep(0.86, 0.98, t))
    lit = np.clip(band - shifted(band, 0, -5), 0, 1)
    cl = mix(col(0x5a4a6e), col(0xc98478), sstep(0.3, 0.85, t)[..., None])
    sky = mix(sky, cl, (band * 0.75)[..., None])
    glowc = mix(col(0xf2a27c), col(0xffe2b4), np.exp(-d ** 2)[..., None])
    sky = mix(sky, glowc, (np.clip(lit * 2.2, 0, 1) * (0.35 + 0.65 * np.exp(-d ** 2 * 0.7)))[..., None])
    return sky, band


def cloud_sea(ref, rng, yy, xx, under, sx, hz, far=(0xe8b796, 0x9b7287, 0x55466a), shade=0x3c3556, crest_c=0xffe3b8, hot=0xfff0d2):
    """O mar de nuvens visto de cima da torre: rolos amostrados no plano das nuvens (encolhem perto do
    horizonte), a sombra do lado de cá e a crista acesa pelo sol baixo atrás deles."""
    tex = noise_tex(rng, 512, 90, 5)
    tex2 = noise_tex(rng, 512, 30, 3)
    dz = np.maximum(yy - hz + 4, 1.0)
    zz = 300.0 / dz
    u = (xx - sx) * zz * 0.9
    v = zz * 90.0
    h1 = sample(tex, u * 0.32, v * 0.42)
    h2 = sample(tex2, u * 0.8 + 17, v * 0.9 + 5)
    # rolos redondos: a raiz deixa o alto largo e as dobras estreitas
    hsea = np.sqrt(np.clip(h1 * 0.8 + h2 * 0.2, 0, 1))
    depth = np.clip((yy - hz) / 120, 0, 1)
    # a crista: onde a altura cai para baixo na tela (o topo do rolo, virado para o sol atrás)
    crest = np.clip(hsea - shifted(hsea, 0, 2.5), 0, 1) * 7
    sea = vgrad([(0.0, col(far[0])), (0.35, col(far[1])), (1.0, col(far[2]))], depth)
    sea = mix(sea, col(shade), (sstep(0.55, 0.25, hsea) * 0.55)[..., None])
    d_sun = np.hypot((xx - sx) / 1.4, yy - hz)
    near_sun = np.exp(-(d_sun / 300) ** 2)
    sea = mix(sea, col(crest_c), (np.clip(crest, 0, 1) * (0.18 + 0.82 * near_sun))[..., None])
    sea = mix(sea, col(hot), (np.exp(-((xx - sx) / 120) ** 2 - ((yy - hz - 14) / 20) ** 2) * 0.75)[..., None])
    return put(ref, sea, under), hsea


def peak(ref, rng, x0, x1, top, base, light, dark, mid, rimc, hide=None, haze=None, hazec=None, seed_amp=26):
    """Uma montanha com relevo (espigões e vincos de relevo.spurs), acesa de lado por `light`."""
    from relevo import spurs, shade
    xs = np.arange(W)
    cx = (x0 + x1) / 2
    prof = top + (base - top) * np.clip(np.abs(xs - cx) / ((x1 - x0) / 2), 0, 1) ** 1.3
    line = ridge(xs, rng, 0, seed_amp, 110, 6, 0.65) + prof
    yy, xx = grid()
    m = sstep(line[None, :] - 0.8, line[None, :] + 0.8, yy) * ((xs >= x0 - 60) & (xs <= x1 + 60))[None, :]
    if hide is not None:
        m = m * (1 - hide)
    z, dsp, _ = spurs(W, H, rng, line, base, step=4.0)
    z = blur(z, 1.2)
    dif, nx, ny, nz, _ = shade(z, light, k=1.6)
    tone = mix(dark, mid, np.clip(dif * 1.4, 0, 1)[..., None])
    rim = np.clip(dif - 0.55, 0, 1) * 2.2
    tone = mix(tone, rimc, np.clip(rim, 0, 1)[..., None])
    if haze is not None:
        tone = mix(tone, hazec, haze[..., None])
    return put(ref, tone, m), m


def spire(ref, rng, x, top, foot, w0, w1, lit_side, rimc, runes=0.4):
    """A agulha de pedra do terraço (a mesma das arenas das Torres): blocos, duas cintas de bronze e as
    runas, em contraluz com a quina do lado do sol acesa."""
    yy, xx = grid()
    m = Mask(W, H).poly([(x - w1, foot), (x - w0, top), (x + w0, top), (x + w1, foot)]).array()
    t = np.clip((yy - top) / (foot - top), 0, 1)
    half = w0 + (w1 - w0) * t
    u = (xx - x) / np.maximum(half, 1)
    stone = vgrad([(0.0, col(0x2a2538)), (1.0, col(0x221d2c))], t)
    stone = stone * (1 + 0.1 * (value_noise(H, W, 10, rng, 3)[..., None] - 0.5))
    # os blocos: juntas horizontais a cada ~46 px, e o lado do sol um pouco mais claro
    jy = np.abs(np.mod(yy - top, 46) - 23)
    stone = mix(stone, col(0x15111c), (sstep(21.5, 23, jy) * 0.6)[..., None])
    stone = mix(stone, col(0x4a3d52), (np.clip(u * lit_side, 0, 1) ** 2 * 0.6)[..., None])
    for by in (top + (foot - top) * 0.36, top + (foot - top) * 0.72):
        band = sstep(by - 9, by - 7, yy) * (1 - sstep(by + 7, by + 9, yy))
        bc = mix(col(0x3a2414), col(0xb8783e), (np.clip(u * lit_side, 0, 1) ** 1.5)[..., None])
        stone = mix(stone, bc, band[..., None])
    ref = put(ref, stone, m)
    ref = put(ref, rimc, rim_of(m, lit_side * 3, 0, 0.8) * 0.85)
    if runes:
        rm = Mask(W, H)
        for i, ry in enumerate(np.linspace(top + 60, foot - 90, 4)):
            for a, b in K.rune(i + 2, x, ry, 30):
                rm.line([a, b], 3.0)
        r = rm.array() * m
        ref = put(ref, col(0xd08a3e), r * runes)
        ref = add_light(ref, col(0xb86a2a), blur(r, 5) * runes * 0.5)
    return ref, m


def f_mascara(rng):
    yy, xx = grid()
    SX, SY = SUN
    sky, band = dawn_sky(rng, yy, xx)
    ref = sky.copy()
    d_sun = np.hypot(xx - SX, yy - SY)
    # o mar de nuvens até o horizonte: rolos em perspectiva (menores perto do horizonte), o lado de cá na
    # sombra e a crista acesa pelo sol atrás
    sea_top = HZ + 12 + 5 * noise1d(W, 80, rng, 3)
    under = sstep(sea_top[None, :] - 1.5, sea_top[None, :] + 1.5, yy)
    ref, hsea = cloud_sea(ref, rng, yy, xx, under, SX, HZ)
    # o sol nascendo atrás dos rolos
    ref = put(ref, col(0xfffbea), sstep(29, 26, d_sun) * (1 - under))
    # dois picos saindo do mar de nuvens, em contraluz (a face virada para o sol pega a luz)
    haze = sstep(HZ - 120, HZ + 8, yy) * 0.6
    ref, _ = peak(ref, rng, 120, 560, 250, 400, (0.85, -0.25, 0.25), col(0x3a3558), col(0x76607c), col(0xffc99a), hide=under, haze=haze, hazec=col(0xc99490))
    ref, _ = peak(ref, rng, 1060, 1340, 292, 400, (-0.85, -0.25, 0.25), col(0x3a3558), col(0x76607c), col(0xffc99a), hide=under, haze=haze, hazec=col(0xd6a090))
    # ---------------- o terraço
    FAR = 474.0
    PAR = 438.0
    floor = sstep(FAR - 1, FAR + 1, yy)
    yz = np.maximum(yy, FAR + 0.5)
    z = 368.0 / (yz - HZ)
    u = (xx - SX) * z / 368.0 * 3.0
    rowf = z / 0.26
    row = np.floor(rowf)
    off = np.mod(row * 0.43, 1.0)
    uu = u / 0.95 + off
    # as juntas: a distância em px da tela até a linha mais perto, nas duas direções
    dudx = np.maximum(np.abs(np.gradient(uu, axis=1)), 1e-5)
    drdy = np.maximum(np.abs(np.gradient(rowf, axis=0)), 1e-5)
    ju = np.abs(uu - np.round(uu)) / dudx
    jv = np.abs(rowf - np.round(rowf)) / drdy
    joint = np.clip(1.6 - np.minimum(ju, jv * 1.3), 0, 1) * floor
    slab = (np.mod(np.floor(uu) * 7 + row * 13, 11) / 11.0 - 0.5)
    stone_n = value_noise(H, W, 14, rng, 4) - 0.5
    near = sstep(FAR, H, yy)
    base_c = vgrad([(0.0, col(0x6a5a74)), (0.4, col(0x463d58)), (1.0, col(0x272233))], near)
    base_c = base_c * (1 + 0.16 * slab[..., None] + 0.22 * stone_n[..., None])
    # molhado da chuva da noite: reflete o céu (mais longe, mais espelho) e as poças refletem inteiro
    refl_y = np.clip(2 * HZ - yy, 0, H - 1).astype(np.int32)
    refl = ref[refl_y, np.arange(W)[None, :]]
    puddle = sstep(0.62, 0.7, value_noise(H, W, 70, rng, 3)) * (1 - joint)
    wet = np.clip((0.18 + 0.5 * (1 - near)) * (0.5 + 0.5 * value_noise(H, W, 40, rng, 3)) + puddle * 0.7, 0, 0.95)
    flo = mix(base_c, refl * 0.92, wet[..., None])
    glare = np.exp(-((xx - SX) / (30 + 170 * near)) ** 2) * (0.55 + 0.45 * (stone_n + 0.5)) * (1 - 0.7 * joint)
    flo = mix(flo, col(0xffeccb), (np.clip(glare * (1.0 - 0.55 * near) * (0.6 + 0.4 * wet), 0, 1))[..., None])
    flo = mix(flo, col(0x17131f), (joint * 0.6)[..., None])
    ref = put(ref, flo, floor)
    # o parapeito na beira: mureta grossa com a pedra de cima, dois vãos quebrados (a luz passa por eles)
    pm = Mask(W, H)
    pm.rect(-2, PAR + 6, W + 2, FAR + 2)
    pm.rect(-2, PAR - 2, W + 2, PAR + 8)
    pmask = pm.array()
    for (g0, g1, dep) in ((SX - 96, SX - 34, 30), (300, 336, 14)):
        jag = (noise1d(W, 6, rng, 2) - 0.5) * 8
        cut = ((xx > g0 + jag[None, :] * 0.5) & (xx < g1 - jag[None, :] * 0.5) & (yy < PAR + dep + jag[None, :])).astype(np.float32)
        pmask = pmask * (1 - blur(cut, 0.8))
    ptone = vgrad([(0.0, col(0x3a3046)), (1.0, col(0x221c2c))], np.clip((yy - PAR) / 36, 0, 1))
    ptone = ptone * (1 + 0.12 * stone_n[..., None])
    pj = np.abs(np.mod(xx + 14, 74) - 37)
    ptone = mix(ptone, col(0x141019), (sstep(35.5, 37, pj) * 0.7 * (yy > PAR + 8))[..., None])
    ref = put(ref, ptone, pmask)
    ref = put(ref, col(0xffd9a6), rim_of(pmask, 0, -3, 0.8) * 0.85)
    side_rim = np.where(xx < SX, rim_of(pmask, 3, 0, 0.8), rim_of(pmask, -3, 0, 0.8))
    ref = put(ref, col(0xfff0d0), side_rim * np.exp(-((xx - SX) / 260) ** 2))
    # a luz que entra pelo vão grande e deita no chão
    spill = np.exp(-((xx - (SX - 65)) / (30 + 60 * near)) ** 2) * sstep(FAR, FAR + 30, yy) * (1 - near) * floor
    ref = add_light(ref, col(0x6a4a30), spill * 0.6)
    # a agulha do terraço à esquerda, saindo do quadro em cima
    ref, _ = spire(ref, rng, 104, -10, FAR + 36, 26, 38, 1, col(0xffc690), runes=0.35)
    # ---------------- a foice, mais longe, deitada no rastro do sol; a máscara na frente
    alpha_props = np.zeros((H, W), np.float32)
    simg, s0, s1 = scythe_prop(scale=3, light=(0.3, -0.9, 0.3), warm=(1.0, 0.82, 0.6), cool=(0.36, 0.36, 0.55))
    Ms = floor_m(0.5, -0.2, 0.36)
    sh_s = np.dstack([np.zeros(simg.shape[:2] + (3,), np.float32), simg[..., 3]])
    _, _, sh2 = place_m(ref, None, sh_s, 690, 556, Ms, ox=s0[0], oy=s0[1])
    ref = ref * (1 - (blur(shifted(sh2, -3, 5), 3) * 0.6)[..., None])
    ref, alpha_props, pa_s = place_m(ref, alpha_props, simg, 690, 552, Ms, ox=s0[0], oy=s0[1])
    # em contraluz a foice escurece, e a borda pega o sol
    ref = put(ref, col(0x15111b), pa_s * 0.86)
    ref = put(ref, col(0xfff0d0), rim_of(pa_s, 0, -2, 0.5) * 0.95)
    mimg = mask_prop(scale=5, light=(0.2, -0.97, 0.14), warm=(1.0, 0.82, 0.6), cool=(0.36, 0.36, 0.6), amb=0.04)
    MX, MY = 520.0, 610.0
    Mm = floor_m(1.12, 0.08, 0.42)
    sh_m = np.dstack([np.zeros(mimg.shape[:2] + (3,), np.float32), mimg[..., 3]])
    _, _, sh = place_m(ref, None, sh_m, MX - 18, MY + 22, np.array([[1.0, -0.25], [0.0, 1.15]]) @ Mm)
    ref = ref * (1 - (blur(sh, 7) * 0.62)[..., None])
    ref, alpha_props, pa_m = place_m(ref, alpha_props, mimg, MX, MY, Mm)
    ref = put(ref, col(0xffe8c4), rim_of(pa_m, 0, -3, 0.8) * 0.75)
    # ---------------- o pincel
    base = np.where(yy < HZ + 12, (value_noise(H, W, 90, rng, 2) - 0.5) * 0.35, np.arctan2(yy - SY, xx - SX))
    flow = flow_of(ref, base, 0.85)
    out, _ = painted(ref, rng, flow, ps=passes(1.0, dry=0.22, err=(0.0, 0.02, 0.035, 0.05), long=1.2))
    pa = np.clip(pa_m + pa_s, 0, 1)
    out = out * (1 - (pa * 0.82)[..., None]) + ref * (pa * 0.82)[..., None]
    return finish(out)


def f_mascara_luz(rng):
    """O que a manhã acende por cima: o sol, a faixa do horizonte, o rastro dele no chão molhado."""
    yy, xx = grid()
    SX, SY = SUN
    d = np.hypot(xx - SX, yy - SY)
    out = np.zeros((H, W, 3), np.float32)
    out = add_light(out, col(0xffe9c4), np.exp(-(d / 40) ** 2) * 0.6)
    out = add_light(out, col(0xffb874), np.exp(-(d / 180) ** 2) * 0.32)
    out = add_light(out, col(0xc86a52), np.exp(-(d / 460) ** 2) * 0.14)
    out = add_light(out, col(0xffcf98), np.exp(-((yy - HZ - 12) / 12) ** 2) * np.exp(-((xx - SX) / 420) ** 2) * 0.3)
    near = sstep(474, H, yy)
    trail = np.exp(-((xx - SX) / (34 + 180 * near)) ** 2) * sstep(470, 492, yy) * (1 - near * 0.7)
    out = add_light(out, col(0xffc890), trail * 0.25 * (0.6 + 0.4 * value_noise(H, W, 30, rng, 3)))
    return finish(np.clip(out, 0, 1))


# ---------------------------------------------------------------- perspectiva de rua
class Street:
    """Uma rua vista de dentro: o ponto de fuga (vx, vy), a câmera a `cam` unidades do chão e a distância focal
    f em px. X para os lados (o meio da rua é 0), Y para cima, z para longe."""

    def __init__(self, vx, vy, f=620.0, cam=1.7):
        self.vx, self.vy, self.f, self.cam = vx, vy, f, cam

    def p(self, X, Y, z):
        return (self.vx + X * self.f / z, self.vy + (self.cam - Y) * self.f / z)

    def quad_x(self, X, z0, z1, y0, y1):
        """Um retângulo na parede de lado (X fixo), de z0 a z1 e de y0 a y1."""
        return [self.p(X, y0, z0), self.p(X, y0, z1), self.p(X, y1, z1), self.p(X, y1, z0)]

    def quad_z(self, z, x0, x1, y0, y1):
        """Um retângulo de frente (z fixo)."""
        return [self.p(x0, y0, z), self.p(x1, y0, z), self.p(x1, y1, z), self.p(x0, y1, z)]


def cast_shadow(sil, feet, sun, k=1.5, blur_px=3.0):
    """A sombra comprida de uma figura no chão, saindo dos pés para longe do sol (o sol na frente, baixo)."""
    ys, xs = np.nonzero(sil > 0.02)
    if len(xs) == 0:
        return np.zeros((H, W), np.float32)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = sil[y0:y1, x0:x1]
    img = np.dstack([np.zeros(crop.shape + (3,), np.float32), crop])
    fx, fy = feet
    dx, dy = fx - sun[0], fy - sun[1]
    ln = math.hypot(dx, dy) or 1.0
    dx, dy = dx / ln, dy / ln
    M = np.array([[1.0, -k * dx], [0.0, -k * dy]])
    _, _, pa = place_m(np.zeros((H, W, 3), np.float32), None, img, fx, fy, M, ox=fx - x0, oy=fy - y0)
    return blur(pa, blur_px)


def f_povo(rng):
    """A rua de Vespera de manhã: gente que voltou a lembrar, em contraluz (um casal abraçado, alguém de
    joelhos chorando, um pai levantando a filha, alguém olhando a lembrança que voltou nas mãos)."""
    yy, xx = grid()
    VX, VY = 662.0, 388.0
    st = Street(VX, VY, 640.0, 1.7)
    SUN2 = (VX + 8, VY - 26)
    d_sun = np.hypot(xx - SUN2[0], yy - SUN2[1])
    # o céu no fim da rua
    t = np.clip(yy / VY, 0, 1.3)
    ref = vgrad([(0.0, col(0x6a6a96)), (0.45, col(0xc79aa0)), (0.8, col(0xf4cf9f)), (1.0, col(0xfff0cf)), (1.3, col(0xfff0cf))], t)
    ref = mix(ref, col(0xfff6de), (np.exp(-(d_sun / 140) ** 2) * 0.8)[..., None])
    n = stretched_noise(H, W, 30, 4.0, rng, 4)
    ref = mix(ref, col(0xd89a8a), (sstep(0.55, 0.75, n) * sstep(60, 300, yy) * (1 - sstep(300, 380, yy)) * 0.45)[..., None])
    ref = put(ref, col(0xfffcf0), sstep(24, 21, d_sun))
    # as casas dos dois lados, de perto (z=1.2) até longe (z=40): fachadas, telhados, janelas, portas
    walls = np.zeros((H, W), np.float32)
    shade_img = np.zeros((H, W, 3), np.float32)
    lit_win = np.zeros((H, W), np.float32)
    detail = np.zeros((H, W), np.float32)
    for side in (-1, 1):
        X = side * 3.4
        z = 0.55
        while z < 42:
            dz = rng.uniform(1.6, 2.6) * (z ** 0.55)
            z1 = z + dz
            hgt = rng.uniform(6.0, 8.5)
            m = Mask(W, H).poly(st.quad_x(X, z, z1, 0, hgt))
            # o telhado: um triângulo de frente na ponta da casa
            if rng.random() < 0.65:
                apex = hgt + rng.uniform(1.4, 2.6)
                m.poly([st.p(X, hgt, z), st.p(X, hgt, z1), st.p(X - side * 1.2, apex, z1 - dz * 0.5)])
            else:
                m.poly(st.quad_x(X, z, z1, hgt - 0.1, hgt + 0.5))
            ma = m.array() * (1 - walls)
            fog = 1 - math.exp(-z / 16.0)
            # reboco de cores diferentes (ocre, rosa, cinza, azulado), na sombra: a fachada só pega o céu
            hue = [col(0x5a4a3e), col(0x5c4250), col(0x4a4652), col(0x3e4656), col(0x584436)][int(rng.integers(0, 5))]
            dark = 0.55 + 0.45 * min(1.0, z / 6.0)
            base = mix(hue * dark, col(0xe8b79a), fog)
            shade_img += ma[..., None] * base
            walls = walls + ma
            # as linhas de cada andar e, em algumas casas, o madeiramento escuro
            lm = Mask(W, H)
            for fy in (2.05, 4.35, 6.4):
                if fy < hgt:
                    lm.line([st.p(X, fy, z), st.p(X, fy, z1)], max(1.0, 0.13 * 640 / z))
            if rng.random() < 0.45:
                for k in range(int(dz / 0.9) + 1):
                    zk = z + k * 0.9
                    if zk < z1:
                        lm.line([st.p(X, 0, zk), st.p(X, hgt, zk)], max(1.0, 0.1 * 640 / zk))
                        if k % 2 == 0 and zk + 0.9 < z1:
                            lm.line([st.p(X, 2.05, zk), st.p(X, 4.35, zk + 0.9)], max(1.0, 0.08 * 640 / zk))
            detail = np.maximum(detail, lm.array() * ma * (1 - fog) * 0.8)
            # janelas: algumas com luz acesa (gente acordou), outras escuras
            wm = Mask(W, H)
            lw = Mask(W, H)
            nwin = max(1, int(dz / 1.1))
            for fl in (2.3, 4.6):
                for k in range(nwin):
                    za = z + (k + 0.3) * dz / nwin
                    zb = za + dz / nwin * 0.4
                    q = st.quad_x(X, za, zb, fl, fl + 1.2)
                    (lw if rng.random() < 0.3 else wm).poly(q)
            if rng.random() < 0.7:
                za = z + dz * rng.uniform(0.2, 0.6)
                wm.poly(st.quad_x(X, za, za + 0.5, 0, 2.0))
            detail = np.maximum(detail, wm.array() * (1 - fog))
            lit_win = np.maximum(lit_win, lw.array() * (1 - fog * 0.8))
            z = z1 + rng.uniform(0.0, 0.25)
    walls = np.clip(walls, 0, 1)
    col_walls = shade_img / np.maximum(walls[..., None], 1e-4)
    col_walls = col_walls * (1 + 0.1 * (value_noise(H, W, 8, rng, 3)[..., None] - 0.5))
    ref = put(ref, col_walls, walls)
    ref = put(ref, col(0x1b1520), detail * walls * 0.75)
    ref = put(ref, col(0xffb966), lit_win * walls * 0.9)
    # as quinas das casas viradas para o sol pegam a luz
    ref = put(ref, col(0xffd9a4), np.clip(rim_of(walls, 0, -2, 0.8) + rim_of(walls, 2, 0, 0.8) * (xx < VX) + rim_of(walls, -2, 0, 0.8) * (xx > VX), 0, 1) * 0.7 * (yy > 4))
    # a torre da catedral no fim da rua, na névoa, acima do sol
    cm = Mask(W, H)
    cm.rect(VX - 16, VY - 150, VX + 16, VY + 2)
    cm.poly([(VX - 20, VY - 148), (VX, VY - 250), (VX + 20, VY - 148)])
    for sx2 in (-1, 1):
        cm.rect(VX + sx2 * 24 - 5, VY - 118, VX + sx2 * 24 + 5, VY + 2)
        cm.poly([(VX + sx2 * 24 - 7, VY - 116), (VX + sx2 * 24, VY - 150), (VX + sx2 * 24 + 7, VY - 116)])
    cmask = cm.array() * (1 - walls)
    ref = mix(ref, col(0xd9a092), (cmask * 0.55)[..., None])
    # a névoa dourada no fundo da rua
    haze = np.exp(-(d_sun / 260) ** 2) * 0.55
    ref = mix(ref, col(0xffe7c2), haze[..., None])
    # o chão de pedra molhado
    floor = sstep(VY - 0.5, VY + 0.5, yy) * (1 - walls)
    zf = 640.0 * 1.7 / np.maximum(yy - VY, 0.5)
    uf = (xx - VX) * zf / 640.0
    cob = np.abs(np.mod(uf * 2.6 + np.floor(zf * 2.2) * 0.5, 1) - 0.5) * 2
    cobv = np.abs(np.mod(zf * 2.2, 1) - 0.5) * 2
    cj = np.clip(1 - np.minimum((1 - cob) * 640 / zf / 2.6 * 0.5, (1 - cobv) * 30), 0, 1)
    near = sstep(VY, H, yy)
    fl = vgrad([(0.0, col(0xd2a48c)), (0.3, col(0x6e5a68)), (1.0, col(0x2c2532))], near)
    refl = ref[np.clip(2 * VY - yy, 0, H - 1).astype(np.int32), np.arange(W)[None, :]]
    wet = 0.35 + 0.3 * value_noise(H, W, 50, rng, 3)
    fl = mix(fl, refl, (wet * (1 - near * 0.5))[..., None])
    fl = mix(fl, col(0x16121b), (cj * 0.5 * near)[..., None])
    glare = np.exp(-((xx - VX) / (20 + 260 * near)) ** 2) * (1 - near * 0.4)
    fl = mix(fl, col(0xfff0d2), (glare * 0.75)[..., None])
    ref = put(ref, fl, floor)
    # ---------------- a gente
    P = pose
    bodies = []
    feet = []

    def add(b, fx, fy):
        bodies.append(b)
        feet.append((fx, fy))
    # o casal abraçado, no meio da rua, um pouco à esquerda
    fx, fy = 560.0, 520.0
    hh = 150.0
    a = Body(fx - 12, fy, hh, P(er=(0.16, -0.72), hr=(0.2, -0.8), el=(-0.1, -0.68), hl=(0.02, -0.72), head=(0.03, -0.93))).basic().coat(hem=-0.22, flare=0.13).hair(0.02)
    b = Body(fx + 16, fy, hh * 0.93, P(el=(-0.16, -0.72), hl=(-0.21, -0.82), er=(0.08, -0.66), hr=(-0.02, -0.7), head=(-0.04, -0.92))).basic().dress(flare=0.17).hair(0.18, wind=0.02)
    add(a, fx - 12, fy)
    add(b, fx + 16, fy)
    # alguém de joelhos chorando, mãos no rosto (direita, mais perto)
    kneel = P(pl=(-0.07, -0.3), pr=(0.07, -0.3), kl=(-0.1, -0.06), kr=(0.12, -0.05), fl=(-0.26, -0.01), fr=(-0.1, -0.01), head=(0.06, -0.6), neck=(0.04, -0.54),
              sl=(-0.08, -0.52), sr=(0.12, -0.51), wl=(-0.07, -0.38), wr=(0.09, -0.38), el=(0.0, -0.42), er=(0.17, -0.44), hl=(0.04, -0.6), hr=(0.1, -0.6))
    add(Body(905, 640, 250, kneel).basic().coat(hem=-0.12, flare=0.16).hair(0.05), 905, 640)
    # o pai levantando a filha no ar (longe, no fundo)
    up = P(el=(-0.13, -0.92), hl=(-0.07, -1.06), er=(0.13, -0.92), hr=(0.07, -1.06))
    add(Body(722, 452, 82, up).basic().coat(), 722, 452)
    kid = P(el=(-0.18, -0.85), hl=(-0.24, -1.0), er=(0.18, -0.85), hr=(0.24, -1.0), fl=(-0.12, 0.02), fr=(0.1, -0.06))
    bodies.append(Body(722, 452 - 82 * 1.0, 40, kid, head_r=0.085).basic().dress(flare=0.16).hair(0.05))
    # alguém olhando as mãos abertas, onde a lembrança voltou (esquerda, perto)
    look = P(head=(0.02, -0.9), el=(-0.12, -0.62), hl=(-0.05, -0.58), er=(0.12, -0.62), hr=(0.06, -0.58))
    add(Body(300, 690, 330, look).basic().cloak(hem=-0.08, flare=0.2).hood(point=0.03), 300, 690)
    # gente pequena no fundo, parada, olhando em volta
    for (bx, by, bh) in ((610, 430, 48), (700, 424, 42), (640, 418, 36), (760, 440, 58), (520, 446, 60)):
        bb = Body(bx, by, bh, P(el=(-0.13, -0.63 + rng.uniform(-0.05, 0.05)), er=(0.13, -0.63))).basic()
        (bb.dress(flare=0.15) if rng.random() < 0.5 else bb.coat())
        add(bb, bx, by)
    sil = silhouettes(bodies)
    shadow = np.zeros((H, W), np.float32)
    for b, f in zip(bodies, feet):
        shadow = np.maximum(shadow, cast_shadow(b.silhouette(), f, SUN2, 1.4 * (0.5 + 0.5 * (f[1] - VY) / (H - VY))))
    ref = ref * (1 - (shadow * floor * 0.6)[..., None])
    fog_f = np.exp(-(np.maximum(yy - VY, 1) / 70))
    fig = mix(col(0x231b26), col(0xcf9e8c), fog_f[..., None])
    ref = put(ref, fig, sil)
    rim = np.clip(rim_of(sil, 0, -2, 0.7) + np.where(xx < VX, rim_of(sil, 2, 0, 0.7), rim_of(sil, -2, 0, 0.7)), 0, 1)
    ref = put(ref, col(0xffe2b4), rim * 0.85)
    # a lembrança nas mãos: uma luz pequena entre as mãos dele
    gl = np.exp(-(np.hypot(xx - 304, yy - 495) / 10) ** 2)
    ref = add_light(ref, col(0xffd890), gl * 0.9)
    ref = add_light(ref, col(0xffb860), np.exp(-(np.hypot(xx - 304, yy - 495) / 40) ** 2) * 0.25)
    base = np.where(yy < VY, (value_noise(H, W, 90, rng, 2) - 0.5) * 0.3, np.arctan2(yy - VY, xx - VX))
    flow = flow_of(ref, base, 0.9)
    out, _ = painted(ref, rng, flow, ps=passes(0.9, dry=0.2, err=(0.0, 0.02, 0.035, 0.05), long=1.1))
    out = out * (1 - (sil * 0.45)[..., None]) + ref * (sil * 0.45)[..., None]
    return finish(out)


# ---------------------------------------------------------------- destroços
# O bairro que desabou, de manhã: o sol baixo está atrás da fachada quebrada e entra pela janela do meio. A
# câmera fica na altura de uma pessoa (o horizonte em DY_HZ), o ponto de fuga no meio; o que vira para a câmera
# fica na sombra, o de cima pega o céu e o lado da direita pega o sol de lado.
DX_VP = (640.0, 410.0)
DX_SUN = (900.0, 318.0)


def patch(pts, ss=4):
    """A máscara de um polígono só na caixa dele (muitas peças pequenas): (a, (fatia y, fatia x)) ou None."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0 = max(0, int(math.floor(min(xs))) - 2), max(0, int(math.floor(min(ys))) - 2)
    x1, y1 = min(W, int(math.ceil(max(xs))) + 2), min(H, int(math.ceil(max(ys))) + 2)
    if x1 - x0 < 1 or y1 - y0 < 1:
        return None
    img = Image.new('L', ((x1 - x0) * ss, (y1 - y0) * ss), 0)
    ImageDraw.Draw(img).polygon([((x - x0) * ss, (y - y0) * ss) for x, y in pts], fill=255)
    a = np.asarray(img.resize((x1 - x0, y1 - y0), Image.BOX), np.float32) / 255.0
    return a, (slice(y0, y1), slice(x0, x1))


def edge_quad(p0, p1, w):
    """Um traço fino ao longo de uma aresta (a quina que pega a luz)."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    ln = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / ln * w / 2, dx / ln * w / 2
    return [(p0[0] + nx, p0[1] + ny), (p1[0] + nx, p1[1] + ny), (p1[0] - nx, p1[1] - ny), (p0[0] - nx, p0[1] - ny)]


class Pile:
    """Pedras e vigas caídas, pintadas de trás para a frente com as faces que a câmera vê: a da frente (na
    sombra), a de cima (o céu) e a de lado (a da direita pega o sol). As arestas de cima e a do lado do sol,
    contra o fundo claro, ficam acesas."""

    STONE = dict(front=0x332a38, top=0x5e4e5e, lit=0x86686a, dark=0x262030, rim=0xffd2a0)
    WOOD = dict(front=0x22170f, top=0x463228, lit=0x8c5a3a, dark=0x1a100b, rim=0xffc690)
    # a névoa, o cascalho do monte e as lascas da ponta da viga (uma cena de outra luz troca as cores)
    HAZE = 0xe0b29c
    HEAP = dict(fill=0x2e2634, rim=0xffd2a0)
    SPLINTER = dict(fill=0x2a1c12, rim=0xffc690)

    def __init__(self, ref, rng, tex, vp=DX_VP, haze=None):
        self.ref = ref
        self.rng = rng
        self.tex = tex
        self.vp = vp
        self.m = np.zeros((H, W), np.float32)
        # o quanto a névoa da manhã come cada peça (função de y do pé: longe = mais névoa)
        self.haze = haze

    def _put(self, pts, color, alpha=1.0):
        r = patch(pts)
        if r is None:
            return
        a, sl = r
        a = a * alpha
        c = np.asarray(color, np.float32) * (1 + 0.24 * (self.tex[sl] - 0.5))[..., None]
        self.ref[sl] = self.ref[sl] * (1 - a[..., None]) + c * a[..., None]
        self.m[sl] = np.maximum(self.m[sl], a)

    def _rim(self, p0, p1, color, k, w=1.4):
        r = patch(edge_quad(p0, p1, w))
        if r is None:
            return
        a, sl = r
        a = a * k
        self.ref[sl] = self.ref[sl] * (1 - a[..., None]) + np.asarray(color, np.float32) * a[..., None]

    def box(self, bl, br, tr, tl, d, pal, tone=1.0, fog=0.0, chip=True):
        """Uma peça com a face da frente bl-br-tr-tl e a profundidade d (para o ponto de fuga)."""
        rng = self.rng
        cx, cy = (bl[0] + br[0]) / 2, (bl[1] + br[1]) / 2
        vx, vy = self.vp[0] - cx, self.vp[1] - cy
        ln = math.hypot(vx, vy) or 1.0
        Dx, Dy = vx / ln * d, min(vy / ln * d, -d * 0.3)
        q = lambda p: (p[0] + Dx, p[1] + Dy)
        hz = np.asarray(col(self.HAZE), np.float32)
        c = {k: mix(col(v) * (tone if k != 'rim' else 1.0), hz, fog * (0.35 if k == 'rim' else 1.0)) for k, v in pal.items()}
        front = [bl, br, tr, tl]
        if chip:
            # uma quina quebrada na frente
            k = int(rng.integers(0, 4))
            p, nx_, pv = front[k], front[(k + 1) % 4], front[(k - 1) % 4]
            t1, t2 = rng.uniform(0.15, 0.4), rng.uniform(0.15, 0.4)
            a1 = (p[0] + (nx_[0] - p[0]) * t1, p[1] + (nx_[1] - p[1]) * t1)
            a2 = (p[0] + (pv[0] - p[0]) * t2, p[1] + (pv[1] - p[1]) * t2)
            front = front[:k] + [a2, a1] + front[k + 1:]
        right = Dx > 0
        side = [br, q(br), q(tr), tr] if right else [bl, q(bl), q(tl), tl]
        self._put(side, c['lit'] if right else c['dark'])
        self._put([tl, tr, q(tr), q(tl)], c['top'])
        self._put(front, c['front'])
        # o contraluz: a aresta de trás da face de cima e a de fora do lado do sol
        self._rim(q(tl), q(tr), c['rim'], 0.65)
        if right:
            self._rim(q(tr), q(br), c['rim'], 0.45)
            self._rim(tr, br, c['lit'] * 1.2, 0.35, 1.0)

    def block(self, x, y, w, h, ang=0.0, d=None, tone=1.0, fog=0.0, pal=None):
        rng = self.rng
        d = min(w, h) * rng.uniform(0.5, 0.9) if d is None else d
        c, s = math.cos(ang), math.sin(ang)
        R = lambda a, b: (x + c * a - s * b, y + s * a + c * b)
        jw, jh = w * 0.08, h * 0.12
        bl = R(-w / 2 + rng.uniform(-jw, jw), 0)
        br = R(w / 2 + rng.uniform(-jw, jw), 0)
        tr = R(w / 2 + rng.uniform(-jw, jw), -h + rng.uniform(-jh, jh))
        tl = R(-w / 2 + rng.uniform(-jw, jw), -h + rng.uniform(-jh, jh))
        self.box(bl, br, tr, tl, d, pal or self.STONE, tone, fog)

    def beam(self, p0, p1, t, d=None, tone=1.0, fog=0.0, splinter=True):
        """Uma viga de p0 a p1 (a aresta de baixo), t de grossura; a ponta de p1 quebrada em lascas."""
        rng = self.rng
        ax, ay = p1[0] - p0[0], p1[1] - p0[1]
        ln = math.hypot(ax, ay) or 1.0
        nx, ny = ay / ln, -ax / ln
        if ny > 0:
            nx, ny = -nx, -ny
        tl, tr = (p0[0] + nx * t, p0[1] + ny * t), (p1[0] + nx * t, p1[1] + ny * t)
        self.box(p0, p1, tr, tl, t * 0.9 if d is None else d, self.WOOD, tone, fog, chip=False)
        if splinter:
            # as lascas da ponta quebrada: dentes compridos para fora
            ux, uy = ax / ln, ay / ln
            pts = [p1]
            n = 5
            for i in range(1, n):
                f = i / n
                bx, by = p1[0] + (tr[0] - p1[0]) * f, p1[1] + (tr[1] - p1[1]) * f
                L = t * rng.uniform(0.4, 1.6) * (1 if i % 2 else 0.3)
                pts.append((bx + ux * L, by + uy * L))
            pts.append(tr)
            hz = np.asarray(col(self.HAZE), np.float32)
            self._put(pts + [(tr[0] - ux * 2, tr[1] - uy * 2), (p1[0] - ux * 2, p1[1] - uy * 2)], mix(col(self.SPLINTER['fill']) * tone, hz, fog))
            for a, b in zip(pts[:-1], pts[1:]):
                if b[1] < a[1]:
                    self._rim(a, b, mix(col(self.SPLINTER['rim']), hz, fog * 0.35), 0.5, 1.0)

    def heap(self, cx, foot, w, h, n, size, fog=0.0, tone=1.0, skip=None):
        """Um monte de entulho: o miúdo por baixo (um morro de cascalho) e os blocos por cima, maiores no meio;
        o pé do monte encosta no chão em `foot`."""
        rng = self.rng
        xs = np.linspace(cx - w / 2, cx + w / 2, 48)
        prof = foot - h * np.clip(1 - np.abs((xs - cx) / (w / 2)) ** 1.7, 0, 1) ** 0.8
        prof = prof + (noise1d(48, 6, rng, 2) - 0.5) * h * 0.12
        prof[0] = prof[-1] = foot
        fill = [(xs[0], foot + 2)] + list(zip(xs, prof)) + [(xs[-1], foot + 2)]
        hz = np.asarray(col(self.HAZE), np.float32)
        self._put(fill, mix(col(self.HEAP['fill']) * tone, hz, fog))
        for a, b in zip(fill[1:-2], fill[2:-1]):
            self._rim(a, b, mix(col(self.HEAP['rim']), hz, fog * 0.35), 0.3, 1.2)
        items = []
        for i in range(n):
            u = rng.uniform(-1, 1)
            xv = cx + u * w / 2 * 0.92
            top_here = np.interp(xv, xs, prof)
            yb = rng.uniform(top_here + 2, foot + 1)
            # maiores perto do alto
            k = 1 - abs(u) * 0.55
            sz = rng.uniform(*size) * k
            if skip is not None and skip(xv, yb):
                continue
            items.append((yb, xv, sz))
        items.sort()
        for yb, xv, sz in items:
            if rng.random() < 0.12:
                L = sz * rng.uniform(2.2, 4.0)
                ang = rng.normal(0, 0.35)
                p0 = (xv - math.cos(ang) * L / 2, yb - math.sin(ang) * L / 2)
                p1 = (xv + math.cos(ang) * L / 2, yb + math.sin(ang) * L / 2)
                self.beam(p0, p1, sz * 0.32, tone=tone, fog=fog, splinter=rng.random() < 0.6)
            else:
                self.block(xv, yb, sz * rng.uniform(0.9, 1.6), sz * rng.uniform(0.45, 0.85), rng.normal(0, 0.28), tone=tone * rng.uniform(0.8, 1.12), fog=fog)
        return xs, prof


def lancet(cx, top, bot, w, n=10):
    """A janela de arco quebrado (dois arcos que se encontram em ponta): o vão de cx-w/2 a cx+w/2."""
    r = w
    spring = top + w * math.sqrt(3) / 2
    pts = [(cx - w / 2, bot), (cx - w / 2, spring)]
    # o arco da esquerda: centro no pé do arco da direita
    a0, a1 = math.pi, math.pi * 2 / 3
    for i in range(1, n + 1):
        a = a0 + (a1 - a0) * i / n
        pts.append((cx + w / 2 + r * math.cos(a), spring - r * math.sin(a)))
    for i in range(1, n + 1):
        a = math.pi / 3 - (math.pi / 3) * i / n
        pts.append((cx - w / 2 + r * math.cos(a), spring - r * math.sin(a)))
    pts.append((cx + w / 2, bot))
    return pts


class Figure:
    """Uma figura desenhada à mão em coordenadas locais (os pés em 0, y para baixo), posta em (ox, oy) com a
    escala s: contornos lisos (spline), traços que afinam (braços, pernas) e elipses, cada parte com nome."""

    def __init__(self, ox, oy, s=1.0):
        self.ox, self.oy, self.s = ox, oy, s
        self.parts = {}

    def T(self, p):
        return (self.ox + p[0] * self.s, self.oy + p[1] * self.s)

    def _m(self, part):
        if part not in self.parts:
            self.parts[part] = Mask(W, H)
        return self.parts[part]

    def shape(self, part, pts, n=6):
        self._m(part).poly([self.T(p) for p in K.spline(pts, n, closed=True)])
        return self

    def stroke(self, part, pts, w0, w1):
        path = [self.T(p) for p in K.spline(pts, 5)]
        m = self._m(part)
        k = len(path) - 1
        for i in range(k):
            w = (w0 + (w1 - w0) * (i + 0.5) / k) * self.s
            m.line([path[i], path[i + 1]], w)
        return self

    def ell(self, part, cx, cy, rx, ry):
        x, y = self.T((cx, cy))
        self._m(part).ellipse(x, y, rx * self.s, ry * self.s)
        return self

    def masks(self):
        return {k: sstep(0.3, 0.7, blur(m.array(), 0.5)) for k, m in self.parts.items()}


def rescue_figures(ox, oy, s):
    """Ele (sem a máscara, o capuz caído, de costas) ajoelhado no alto do entulho, inclinado, puxando pela mão
    alguém que ainda está preso numa fresta entre as lajes; o (0, 0) é o joelho dele no alto do monte. A
    armadura é de placas (as que pegam luz ficam em 'plate'), a capa é pesada e gasta na barra."""
    kn = Figure(ox, oy, s)
    # a perna da frente: a coxa, a joelheira, a canela e a bota
    kn.stroke('armor', [(10, -52), (34, -51), (55, -45)], 17, 14)
    kn.stroke('armor', [(57, -40), (58, -26), (59, -8)], 14, 11)
    kn.shape('armor', [(50, -12), (62, -14), (70, -7), (74, 0), (50, 1)], 4)
    kn.shape('plate', [(48, -50), (56, -54), (65, -50), (66, -41), (58, -37), (49, -41)], 4)
    # a capa caindo das costas até o chão, com o peso no pé (ele está inclinado para a frente) e a barra gasta
    kn.shape('cloak', [(24, -122), (8, -118), (-5, -107), (-16, -88), (-24, -66), (-30, -42), (-36, -20), (-48, -6), (-68, 0),
                       (-61, -3), (-55, 2), (-47, -2), (-40, 3), (-33, -1), (-24, 2), (-12, 0), (2, 2), (12, -6), (20, -26), (26, -48),
                       (34, -72), (40, -90), (42, -106), (36, -118)])
    # o braço que alcança: a ombreira saindo de baixo da capa, o braço, o cotovelo, o antebraço e a luva
    kn.stroke('armor', [(44, -96), (56, -84), (64, -77)], 14, 12)
    kn.stroke('armor', [(64, -77), (73, -67), (81, -58)], 12, 10)
    kn.shape('plate', [(30, -108), (44, -113), (55, -105), (57, -93), (47, -90), (36, -95)], 5)
    kn.ell('plate', 64, -77, 7.0, 6.0)
    kn.shape('plate', [(79, -60), (86, -61), (91, -55), (89, -48), (82, -47), (78, -53)], 4)
    # o capuz caído, enrolado no pescoço; a cabeça baixa (de trás, o cabelo e a orelha)
    kn.shape('hood', [(8, -111), (24, -122), (44, -119), (55, -108), (42, -100), (22, -103)])
    kn.ell('skin', 47, -122, 10.5, 12.0)
    kn.shape('hair', [(34, -124), (37, -133), (44, -138), (53, -136), (58, -129), (58, -121), (53, -116), (44, -112), (37, -115)])
    kn.ell('ear', 39, -121, 2.4, 3.6)
    other = Figure(ox, oy, s)
    # o braço levantado, o pulso preso na luva dele
    other.stroke('cloth', [(101, -20), (95, -32), (91, -42), (88, -52)], 11, 9)
    # os ombros e o peito saindo da fresta, a cabeça virada para cima, para ele, o cabelo sujo de pó
    other.shape('cloth', [(90, -4), (94, -18), (103, -26), (116, -28), (129, -21), (137, -9), (141, 4), (88, 6)])
    other.ell('skin', 113, -36, 10.0, 11.0)
    other.shape('hair', [(102, -38), (104, -46), (112, -50), (121, -48), (126, -41), (127, -31), (124, -24), (120, -30), (112, -36), (105, -32)])
    # a outra mão agarrada na quina da laje da frente
    other.ell('skin', 138, -3, 5.0, 4.5)
    slab = [kn.T(p) for p in ((84, 2), (124, -1), (160, -4), (166, 30), (80, 34))]
    return kn, other, slab


def figure_paint(ref, kn, other, rng, xx, yy):
    """As duas figuras em contraluz: o escuro, a capa vinho com as dobras que caem do ombro, as placas de aço
    com o céu refletido em cima, o cabelo e as bordas do lado do sol acesas (a orelha e a barra da capa deixam
    passar um vermelho)."""
    km, om = kn.masks(), other.masks()
    ksil = np.zeros((H, W), np.float32)
    for m in km.values():
        ksil = np.maximum(ksil, m)
    osil = np.zeros((H, W), np.float32)
    for m in om.values():
        osil = np.maximum(osil, m)
    fig = np.maximum(ksil, osil)
    ref = put(ref, col(0x1d161c), fig)
    # as dobras da capa saem do ombro e caem retas embaixo
    shx, shy = kn.T((30, -112))
    ang = np.arctan2(xx - shx, np.maximum(yy - shy, 1.0))
    folds = 0.5 + 0.5 * np.sin(ang * 26 + 1.8 * value_noise(H, W, 22, rng, 2))
    zero = np.zeros((H, W), np.float32)
    plate = km.get('plate', zero)
    cloak = km.get('cloak', zero) * (1 - plate)
    ref = put(ref, mix(col(0x1c0a0e), col(0x381419), folds[..., None]), cloak * 0.95)
    hood = km.get('hood', zero)
    ref = put(ref, mix(col(0x30101a), col(0x5a2026), (0.5 + 0.5 * np.sin((xx - shx) * 0.9 + (yy - shy) * 0.5))[..., None]), hood * 0.9)
    armor = km.get('armor', zero)
    ref = put(ref, col(0x1d1e25), armor * 0.9)
    ref = put(ref, col(0x262731), plate)
    # o aço reflete o céu claro num risco em cima de cada placa e o sol na quina
    ref = put(ref, col(0x8a8092), rim_of(np.maximum(plate, armor), 0, -1.4, 0.5) * 0.5)
    ref = put(ref, col(0xffe2b8), rim_of(plate, 1.6, -1.0, 0.5) * 0.85)
    # o contraluz em tudo: a borda do lado do sol e a de cima
    ref = put(ref, col(0xffd7a6), np.clip(rim_of(fig, 2.2, -0.8, 0.6) * 0.95 + rim_of(fig, 0, -2.2, 0.6) * 0.5, 0, 1))
    hair = np.maximum(km.get('hair', zero), om.get('hair', zero))
    ref = put(ref, col(0xffcf96), rim_of(hair, 1.6, -1.6, 0.5) * 0.8)
    ref = put(ref, col(0xc8402e), np.clip(rim_of(np.clip(cloak + hood, 0, 1), 4.0, -1, 1.0) - rim_of(fig, 2.2, -0.8, 0.6), 0, 1) * 0.6)
    ref = put(ref, col(0xe0583c), km.get('ear', zero) * 0.55)
    return dict(ref=ref, fig=fig, ksil=ksil, osil=osil, km=km, om=om)


def shafts(src, sun, n=64, reach=1.0, decay=0.97):
    """Os fachos de luz na poeira: o que acende (src) arrastado do sol para fora, como num raio de janela."""
    yy, xx = grid()
    acc = np.zeros((H, W), np.float32)
    tot, w = 0.0, 1.0
    for k in range(n):
        t = k / n * reach
        acc += ndi.map_coordinates(src, [yy + (sun[1] - yy) * t, xx + (sun[0] - xx) * t], order=1, mode='constant') * w
        tot += w
        w *= decay
    return acc / tot


def f_destrocos(rng):
    """O bairro desabado de manhã: a fachada quebrada com o sol no óculo da janela do meio e os fachos na
    poeira; o monte de entulho com ele (no sol, que passa pela ponta da fachada) puxando alguém da fresta (na
    sombra da fachada); gente carregando tábuas lá atrás."""
    yy, xx = grid()
    VX, VY = DX_VP
    SX, SY = DX_SUN
    d_sun = np.hypot(xx - SX, yy - SY)
    tex = value_noise(H, W, 5, rng, 3)
    HAZE = col(0xe6b8a0)
    # ---------------- o céu da manhã, de poeira, mais claro perto do sol (atrás da fachada)
    t = np.clip(yy / VY, 0, 1.4)
    ref = vgrad([(0.0, col(0x66658e)), (0.3, col(0x9a87a6)), (0.62, col(0xd6aaa4)), (0.9, col(0xf2cfae)), (1.0, col(0xf8dcb8)), (1.4, col(0xf8dcb8))], t)
    ref = mix(ref, col(0xffefd2), (np.exp(-(d_sun / 340) ** 2) * 0.7)[..., None])
    band = stretched_noise(H, W, 18, 7.0, rng, 4)
    cl = sstep(0.57, 0.72, band) * sstep(30, 120, yy) * (1 - sstep(220, 330, yy))
    ref = mix(ref, mix(col(0x8a6f8c), col(0xe6a890), np.exp(-(d_sun / 420) ** 2)[..., None]), (cl * 0.45)[..., None])
    ref = put(ref, col(0xffd9b0), np.clip(cl - shifted(cl, 0, -3), 0, 1) * np.exp(-(d_sun / 380) ** 2) * 0.7)
    # ---------------- a cidade lá longe, na névoa (entre a esquina da esquerda e a fachada): telhados de duas
    # águas, chaminés e duas torres
    fm = Mask(W, H)
    x = 150.0
    while x < 720:
        w_ = rng.uniform(26, 60)
        hb = rng.uniform(18, 40)
        fm.rect(x, 406 - hb, x + w_, 424)
        fm.poly([(x - 2, 407 - hb), (x + w_ / 2, 407 - hb - w_ * rng.uniform(0.3, 0.5)), (x + w_ + 2, 407 - hb)])
        if rng.random() < 0.4:
            fm.rect(x + w_ * 0.7, 400 - hb - w_ * 0.3, x + w_ * 0.7 + 4, 407 - hb)
        x += w_ + rng.uniform(-6, 4)
    for tx_, th in ((318, 168), (560, 118)):
        fm.rect(tx_ - 8, 404 - th, tx_ + 8, 424)
        fm.poly([(tx_ - 11, 406 - th), (tx_, 406 - th - 52), (tx_ + 11, 406 - th)])
    far = fm.array()
    ref = put(ref, mix(col(0xb08c98), col(0xe8c0a6), sstep(300, 424, yy)[..., None]), far * 0.75)
    ref = put(ref, col(0xffe2c0), rim_of(far, 1.5, -1, 0.5) * 0.35)
    # ---------------- o chão (lajes de rua em perspectiva, poeira por cima)
    ground = sstep(VY - 0.5, VY + 0.5, yy)
    zf = 640.0 * 1.7 / np.maximum(yy - VY, 0.5)
    uf = (xx - VX) * zf / 640.0
    row = np.floor(zf * 1.4)
    cu = np.mod(uf * 1.6 + row * 0.37, 1.0)
    cv_ = np.mod(zf * 1.4, 1.0)
    du = np.maximum(np.abs(np.gradient(uf * 1.6, axis=1)), 1e-5)
    dv = np.maximum(np.abs(np.gradient(zf * 1.4, axis=0)), 1e-5)
    joint = np.clip(1.4 - np.minimum(np.minimum(cu, 1 - cu) / du, np.minimum(cv_, 1 - cv_) / dv * 1.2), 0, 1)
    near = sstep(VY, H, yy)
    gcol = vgrad([(0.0, col(0xc49888)), (0.2, col(0x7a6068)), (1.0, col(0x342a34))], near)
    gcol = gcol * (1 + 0.22 * (tex[..., None] - 0.5)) * (1 + 0.12 * (np.mod(np.floor(uf * 1.6) * 7 + row * 3, 5) / 5 - 0.5))[..., None]
    gcol = mix(gcol, col(0x1e1820), (joint * 0.5 * near)[..., None])
    # a poeira assentada (manchas claras) e o brilho da manhã no rumo do sol
    gcol = mix(gcol, col(0x9a7e7c), (sstep(0.5, 0.75, value_noise(H, W, 40, rng, 3)) * 0.35)[..., None])
    gl = np.exp(-((xx - SX) / (60 + 300 * near)) ** 2) * (1 - near * 0.7)
    gcol = mix(gcol, col(0xf2cca6), (gl * 0.3)[..., None])
    ref = put(ref, gcol, ground)
    # ---------------- a esquina que sobrou à esquerda: a parede com o pilar e uma janela vazada
    lw = Mask(W, H)
    top_l = [(-4, 120), (40, 96), (70, 128), (96, 110), (124, 60), (150, 52), (176, 62)]
    lw.poly([(-4, 640)] + top_l + [(176, 640)])
    lwall = lw.array()
    win = Mask(W, H).poly(lancet(64, 270, 430, 54)).array()
    lwall = lwall * (1 - win)
    lc = vgrad([(0.0, col(0x4a3c4e)), (1.0, col(0x2a222e))], np.clip(yy / 640, 0, 1))
    courses = (np.abs(np.mod(yy, 19) - 9.5) > 8.6) | (np.abs(np.mod(xx + 23 * np.floor(yy / 19), 46) - 23) > 22.2)
    lc = mix(lc * (1 + 0.2 * (tex[..., None] - 0.5)), col(0x1c1620), (courses * 0.4)[..., None])
    ref = put(ref, mix(lc, HAZE, 0.08), lwall)
    ref = put(ref, col(0xffd3a0), np.clip(rim_of(lwall, 2.5, 0, 0.7) * 0.75 + rim_of(lwall, 0, -2.5, 0.7) * 0.6, 0, 1))
    # ---------------- a fachada quebrada: três janelas de arco, o alto em dentes, a ponta da esquerda baixa
    FX0, FX1, FB = 680.0, 1196.0, 552.0
    top_pts = [(FX0, 384), (698, 352), (720, 362), (744, 300), (770, 308), (796, 246), (826, 238), (850, 200), (876, 208), (902, 160),
               (936, 150), (962, 168), (992, 128), (1030, 136), (1060, 112), (1092, 120), (1124, 96), (1160, 104), (1180, 138), (FX1, 150)]
    fw = Mask(W, H).poly([(FX0, FB)] + top_pts + [(FX1, FB)]).array()
    wins = [(770.0, 318.0, 462.0, 56.0), (SX, 258.0, 470.0, 88.0), (1064.0, 280.0, 466.0, 66.0)]
    holes = np.zeros((H, W), np.float32)
    for (wx, wt, wb, ww) in wins:
        holes = np.maximum(holes, Mask(W, H).poly(lancet(wx, wt, wb, ww)).array())
    # a pedra rendilhada da janela do meio: o montante, os dois arcos pequenos e o anel do óculo (com um
    # pedaço caído); o sol bem no óculo
    tr = Mask(W, H)
    tr.line([(SX, 472), (SX, 390)], 7)
    for a0 in (SX - 44, SX):
        tr.line(lancet(a0 + 22, 360, 392, 44, 8)[1:-1], 5)
    ring = Mask(W, H).ellipse(SX, SY, 20, 20).array()
    ring_in = Mask(W, H).ellipse(SX, SY, 15, 15).array()
    ang_r = np.arctan2(yy - SY, xx - SX)
    ringm = np.clip(ring - ring_in, 0, 1) * (1 - ((ang_r > 1.9) & (ang_r < 2.8)))
    tracery = np.maximum(tr.array(), ringm) * holes
    wall = np.clip(fw * (1 - holes) + tracery, 0, 1)
    wc = vgrad([(0.0, col(0x56465a)), (0.5, col(0x433546)), (1.0, col(0x30262f))], np.clip((yy - 100) / 452, 0, 1))
    courses = (np.abs(np.mod(yy - FB, 17) - 8.5) > 7.7) | (np.abs(np.mod(xx + 21 * np.floor((yy - FB) / 17), 42) - 21) > 20.3)
    stain = sstep(0.55, 0.8, value_noise(H, W, 30, rng, 3)) * 0.2
    wc = wc * (1 + 0.2 * (tex[..., None] - 0.5)) * (1 - stain[..., None])
    wc = mix(wc, col(0x201922), (courses * 0.38)[..., None])
    ref = put(ref, mix(wc, HAZE, 0.1), wall)
    # o contraluz nos dentes de cima e nas beiradas dos vãos (a luz contorna a pedra)
    ref = put(ref, col(0xffdcae), np.clip(rim_of(wall, 0, -2.5, 0.7) * 0.9 + rim_of(wall, 2.5, 0, 0.7) * 0.55, 0, 1))
    open_ = holes * (1 - tracery)
    wrap = np.clip(blur(open_, 2.5) - open_, 0, 1) * wall
    ref = add_light(ref, col(0xffc890), wrap * (0.25 + 1.6 * np.exp(-(d_sun / 160) ** 2)))
    # o sol no óculo: o disco e o brilho em volta (o céu dos vãos fica mais claro perto dele)
    ref = put(ref, col(0xfff4de), open_ * np.exp(-(d_sun / 110) ** 2) * 0.85)
    ref = put(ref, col(0xfffcf2), sstep(16, 13, d_sun) * open_)
    # ---------------- a viga do telhado que caiu: o pé no chão, encostada na fachada, na frente da janela
    pile = Pile(ref, rng, tex)
    pile.beam((714, 552), (850, 232), 11, tone=0.9, fog=0.1, splinter=True)
    ref = pile.ref
    # ---------------- gente lá atrás, carregando uma tábua entre duas (pequenas, na névoa)
    P = pose
    hold = P(el=(0.1, -0.62), hl=(0.2, -0.56), er=(0.15, -0.62), hr=(0.24, -0.56))
    b1 = Body(236, 452, 46, hold).basic().coat()
    b2 = Body(286, 450, 44, P(el=(-0.1, -0.62), hl=(-0.2, -0.56), er=(-0.15, -0.62), hr=(-0.24, -0.56))).basic().dress(flare=0.14).hair(0.06)
    far_people = np.maximum(b1.silhouette(), b2.silhouette())
    far_people = np.maximum(far_people, Mask(W, H).line([(242, 427), (281, 426)], 2.4).array())
    b3 = Body(352, 444, 40, P(el=(-0.13, -0.6), hl=(-0.06, -0.52), er=(0.13, -0.6), hr=(0.06, -0.52))).basic().cloak(hem=-0.06, flare=0.16)
    far_people = np.maximum(far_people, b3.silhouette())
    ref = put(ref, col(0x7e6270), far_people)
    ref = put(ref, col(0xffe0bc), rim_of(far_people, 1.2, -1, 0.5) * 0.7)
    # pedrinhas espalhadas no chão e um monte no pé da fachada; outro lá atrás, na rua
    pile.ref = ref
    for i in range(170):
        yb = 430 + (H - 430) * rng.random() ** 0.8
        xv = rng.uniform(150, 1280)
        sz = (yb - VY) / 300 * rng.uniform(5, 16)
        pile.block(xv, yb, sz * rng.uniform(1.0, 1.8), sz * rng.uniform(0.4, 0.8), rng.normal(0, 0.4), tone=rng.uniform(0.75, 1.1), fog=float(np.clip(1 - (yb - VY) / 200, 0, 0.6)))
    pile.heap(1010, 562, 270, 36, 24, (12, 28), fog=0.2, tone=0.9)
    pile.heap(420, 470, 180, 22, 16, (6, 14), fog=0.5, tone=1.0)
    ref = pile.ref
    # ---------------- o monte grande, com eles em cima
    KOX, KOY, KS = 456.0, 508.0, 1.18
    kn, other, slab = rescue_figures(KOX, KOY, KS)
    # embaixo dele e na fresta onde a pessoa está não vão pedras soltas (as da frente vêm depois)
    gap = lambda x, y: (380 < x < 660 and y < 548)
    pile.ref = ref
    pile.heap(505, 612, 480, 112, 70, (24, 60), fog=0.03, tone=0.95, skip=gap)
    # o bloco onde ele ajoelha (o alto do monte) e a laje de trás da fresta
    pile.box((KOX - 92, KOY + 24), (KOX + 70, KOY + 20), (KOX + 72, KOY + 1), (KOX - 90, KOY + 2), 16, Pile.STONE, 1.05, 0.03, chip=True)
    pile.box((KOX + 160, KOY + 34), (KOX + 222, KOY + 38), (KOX + 214, KOY - 26), (KOX + 168, KOY - 18), 20, Pile.STONE, 0.95, 0.04, chip=True)
    ref = pile.ref
    # a sombra dele no alto do monte, para a câmera (o sol está atrás)
    ksil = np.zeros((H, W), np.float32)
    for m in kn.masks().values():
        ksil = np.maximum(ksil, m)
    sh = cast_shadow(ksil, (KOX + 20, KOY + 4), DX_SUN, 0.45, 4.0)
    ref = ref * (1 - (sh * pile.m * 0.55)[..., None])
    # as figuras em contraluz
    fp = figure_paint(ref, kn, other, rng, xx, yy)
    ref, fig = fp['ref'], fp['fig']
    # a laje da frente da fresta, por cima da pessoa (cobre do peito para baixo) e pedras soltas na frente
    pile2 = Pile(ref, rng, tex)
    a, b, c_, d_ = slab[0], slab[2], slab[3], slab[4]
    pile2.box(d_, c_, b, a, 6, Pile.STONE, 0.92, 0.02, chip=False)
    for i in range(24):
        xv = rng.uniform(300, 720)
        yb = rng.uniform(560, 640)
        sz = rng.uniform(12, 30)
        pile2.block(xv, yb, sz * rng.uniform(1.0, 1.6), sz * rng.uniform(0.45, 0.8), rng.normal(0, 0.3), tone=rng.uniform(0.75, 1.0), fog=0.0)
    ref = pile2.ref
    solid = np.clip(pile.m + pile2.m, 0, 1)
    # a sombra comprida do monte no chão, vindo para a câmera
    mound = np.clip(pile.m, 0, 1) * (yy > 470) * (xx > 260) * (xx < 760)
    msh = cast_shadow(mound, (500, 612), DX_SUN, 0.9, 8.0)
    ref = ref * (1 - (msh * ground * (1 - solid) * 0.45)[..., None])
    # ---------------- a sombra da fachada: o sol baixo passa pela ponta da esquerda dela; o que está à direita
    # da linha (no chão e no monte) fica na sombra, ele fica no sol e a pessoa na fresta, na sombra
    zg = np.where(yy > VY + 1, 640.0 * 1.7 / np.maximum(yy - VY, 1.0), 99.0)
    zz = np.where(solid > 0.05, np.minimum(zg, 6.2), zg)
    Xp = (xx - VX) * zz / 640.0 + 0.34 * (10.0 - zz)
    fsh = sstep(0.35, 0.85, Xp) * (1 - sstep(8.4, 8.9, Xp)) * (zz < 10.0)
    fsh = blur(fsh, 2.0) * np.clip(ground + solid, 0, 1) * (1 - fp['ksil']) * (1 - fp['osil'] * 0.5)
    ref = ref * (1 - (fsh * 0.42)[..., None]) * (1 - fsh[..., None] * 0.08 * (1 - np.array([0.9, 0.95, 1.0], np.float32)))
    # ---------------- os fachos: o sol do óculo e o céu dos vãos arrastados pela poeira (mais densa embaixo)
    src = open_ * (0.08 + 3.4 * np.exp(-(d_sun / 46) ** 2))
    ray = shafts(src, DX_SUN, 96, 1.0, 0.982)
    dust = (0.5 + 0.5 * value_noise(H, W, 60, rng, 3)) * (0.4 + 0.6 * sstep(200, 620, yy))
    to_fig = np.array([520.0 - SX, 450.0 - SY])
    to_fig /= np.linalg.norm(to_fig)
    dirk = 0.45 + 0.55 * np.clip(((xx - SX) * to_fig[0] + (yy - SY) * to_fig[1]) / np.maximum(d_sun, 1), 0, 1)
    ray = ray * dust * dirk * (1 - fig * 0.7)
    ref = screen(ref, col(0xffd8a6), np.clip(ray * 2.3, 0, 0.62))
    # ---------------- o pincel (as figuras voltam um pouco mais nítidas)
    base = (value_noise(H, W, 80, rng, 2) - 0.5) * 0.3
    flow = flow_of(ref, base, 0.9)
    out, _ = painted(ref, rng, flow, ps=passes(0.95, dry=0.22, err=(0.0, 0.02, 0.035, 0.05), long=1.1))
    keep = np.clip(blur(fig, 1.0) * 0.6, 0, 0.6)
    out = out * (1 - keep[..., None]) + ref * keep[..., None]
    return finish(out)


def f_destrocos_perto(rng):
    """O entulho da frente, nos dois cantos, e uma viga quebrada deitada por cima (andam mais que o fundo
    durante o plano; um pouco desfocados, estão perto demais da câmera)."""
    yy, xx = grid()
    tex = value_noise(H, W, 6, rng, 3)
    ref = np.zeros((H, W, 3), np.float32)
    pile = Pile(ref, rng, tex)
    pile.heap(150, 740, 520, 150, 70, (30, 70), fog=0.0, tone=0.72)
    pile.heap(1190, 744, 300, 96, 40, (26, 60), fog=0.0, tone=0.72)
    # a viga caída de um monte ao outro, apoiada nas pedras
    pile.beam((900, 722), (1268, 598), 22, d=18, tone=0.8, splinter=True)
    ref = pile.ref
    alpha = pile.m
    base = np.full((H, W), 0.3, np.float32)
    flow = flow_of(np.where(alpha[..., None] > 0.5, ref, 0.2), base, 0.9)
    out, A = painted(ref, rng, flow, mask=sstep(0.3, 0.6, alpha), ps=passes(1.1, dry=0.25, err=(0.0, 0.02, 0.035, 0.05)), base=1.0)
    a = np.clip(np.maximum(A, alpha * 0.98), 0, 1) * (alpha > 0.02)
    out = blur(out, 1.2)
    a = blur(a, 1.2)
    return finish(out, a)


# ---------------------------------------------------------------- Vespera vista das Torres
# Uma sacada baixa das Torres, de frente para o rio: ele vem do fundo (onde o sol já subiu um pouco) até
# embaixo da sacada; a ponte de arcos atravessa no meio, a catedral fica no morro da margem esquerda e uma torre
# velha na direita. Tudo em contraluz: as fachadas na sombra, as cumeeiras e as quinas acesas, a névoa mais
# clara e mais quente no rumo do sol. Em metros: X para os lados (o meio do rio é 0), Y para cima, Z para longe.
VS_VX, VS_VY, VS_F, VS_CAMH = 700.0, 420.0, 900.0, 40.0
VS_SUNP = (700.0, 252.0)
VS_RIVER = 32.0
VS_BANK = 3.0


def vs_p(X, Y, Z):
    return (VS_VX + X * VS_F / Z, VS_VY + (VS_CAMH - Y) * VS_F / Z)


def vs_hill(X, Z):
    """O morro da catedral, na margem esquerda (a altura do chão em m)."""
    return 16.0 * math.exp(-((X + 150.0) ** 2 + (Z - 480.0) ** 2) / 160.0 ** 2)


def fill(ref, pts, color, mask=None, k=1.0):
    r = patch(pts)
    if r is None:
        return
    a, sl = r
    a = a * k
    ref[sl] = ref[sl] * (1 - a[..., None]) + np.asarray(color, np.float32) * a[..., None]
    if mask is not None:
        mask[sl] = np.maximum(mask[sl], a)


def facing_sun(ref, m, xx, yy, sun, k=1.0):
    """A borda de uma forma virada para o sol (em qualquer direção): onde a forma acaba indo para ele."""
    g = blur(m, 1.2)
    gy, gx = np.gradient(g)
    ux, uy = sun[0] - xx, sun[1] - yy
    ln = np.maximum(np.hypot(ux, uy), 1.0)
    return np.clip(-(gx * ux + gy * uy) / ln * 2.5 * k, 0, 1)


def f_vespera(rng):
    """Vespera de manhã vista das Torres, em contraluz: o rio que leva ao sol, a ponte de arcos no meio, a
    catedral no morro e os telhados em camadas na névoa; as memórias caindo devagar sobre a cidade."""
    yy, xx = grid()
    SX, SY = VS_SUNP
    d_sun = np.hypot(xx - SX, yy - SY)
    tex = value_noise(H, W, 4, rng, 3)
    # ---------------- o céu: as nuvens altas abrindo em volta do sol, as beiradas viradas para ele acesas
    t = np.clip(yy / VS_VY, 0, 1.3)
    ref = vgrad([(0.0, col(0x2a2a54)), (0.3, col(0x4a4470)), (0.55, col(0x946e8a)), (0.8, col(0xdea68c)), (0.95, col(0xf8d4a8)),
                 (1.0, col(0xffeed0)), (1.3, col(0xffeed0))], t)
    dd = radial(xx, yy, SX, SY, 560, 330)
    ref = mix(ref, col(0xffe0ae), (np.exp(-dd ** 2 * 1.4) * 0.6)[..., None])
    n1 = stretched_noise(H, W, 56, 5.0, rng, 5)
    n2 = stretched_noise(H, W, 20, 3.0, rng, 3)
    clear = np.exp(-(d_sun / 170) ** 2)
    band = sstep(0.5, 0.7, n1 * 0.8 + n2 * 0.2 - clear * 0.4) * sstep(0.04, 0.25, t) * (1 - sstep(0.78, 0.93, t))
    near_s = np.exp(-(d_sun / 420) ** 2)
    cl = mix(col(0x4a3e62), col(0xb87a7a), near_s[..., None])
    ref = mix(ref, cl, (band * 0.8)[..., None])
    lit = facing_sun(ref, band, xx, yy, VS_SUNP, 1.6)
    ref = mix(ref, mix(col(0xe8968a), col(0xffdca6), near_s[..., None]), (lit * (0.5 + 0.5 * near_s) * 0.95)[..., None])
    # o sol e o brilho em volta
    ref = mix(ref, col(0xfff2d8), (np.exp(-(d_sun / 80) ** 2) * 0.85)[..., None])
    ref = put(ref, col(0xfffbef), sstep(19, 16, d_sun))
    sky_ref = ref.copy()
    # ---------------- os morros do fundo, na névoa quente
    xs = np.arange(W)
    hl = VS_VY - 6 - 26 * noise1d(W, 140, rng, 3) - 16 * np.exp(-((xs - 230) / 170.0) ** 2) - 12 * np.exp(-((xs - 1150) / 150.0) ** 2)
    hills = sstep(hl[None, :] - 0.8, hl[None, :] + 0.8, yy) * (yy < VS_VY + 3)
    hz_col = lambda x: mix(col(0x8a7494), col(0xf2c8a6), np.exp(-((x - SX) / 360.0) ** 2)[..., None])
    ref = put(ref, mix(hz_col(xx), col(0x6a5878), 0.25), hills)
    # ---------------- o chão da margem (a rua do cais), o cais e o rio
    below = yy > VS_VY + 0.5
    Zw = np.where(below, VS_CAMH * VS_F / np.maximum(yy - VS_VY, 0.5), 1e5)
    Xw = (xx - VS_VX) * Zw / VS_F
    Zs = np.where(below, (VS_CAMH - VS_BANK) * VS_F / np.maximum(yy - VS_VY, 0.5), 1e5)
    Xs = (xx - VS_VX) * Zs / VS_F
    water = (np.abs(Xw) < VS_RIVER) & below
    quay = (np.abs(Xs) < VS_RIVER) & ~water & below
    street = (np.abs(Xs) >= VS_RIVER) & below
    fog_s = 1 - np.exp(-Zs / 1300.0)
    st = col(0x2a2230) * (1 + 0.3 * (tex[..., None] - 0.5))
    ref = put(ref, mix(st, hz_col(xx), fog_s[..., None] * 0.9), street.astype(np.float32))
    ref = put(ref, mix(col(0x1c1622), hz_col(xx), (1 - np.exp(-Zw / 1300.0))[..., None] * 0.85), quay.astype(np.float32))
    # a água: o céu espelhado (com marolas), o rastro do sol descendo pelo meio
    rip = stretched_noise(H, W, 3, 10.0, rng, 2) - 0.5
    ym = np.clip(2 * VS_VY - yy + rip * 10, 0, H - 1)
    xm_ = np.clip(xx + rip * 6, 0, W - 1)
    refl = np.stack([ndi.map_coordinates(sky_ref[..., i], [ym, xm_], order=1) for i in range(3)], -1)
    wcol = refl * 0.82 + col(0x1a1828) * 0.18
    glit = np.exp(-((xx - SX) / (6 + 0.35 * (yy - VS_VY))) ** 2) * sstep(VS_VY, VS_VY + 12, yy)
    spark = sstep(0.62, 0.8, stretched_noise(H, W, 2, 9.0, rng, 2))
    wcol = mix(wcol, col(0xfff0cc), (glit * (0.35 + 0.65 * spark) * 0.9)[..., None])
    ref = put(ref, wcol, water.astype(np.float32))
    # ---------------- as casas, a catedral, a torre e a ponte, de trás para a frente
    items = []
    Z = 1900.0
    while Z > 122:
        dz = 13.0 + Z * 0.022
        for side in (-1, 1):
            X = 38.0 + rng.uniform(0, 4)
            row = []
            lim = 0.86 * Z + 60
            while X < lim:
                w_ = rng.uniform(8, 14) * (1 + Z / 3000)
                row.append((X, X + w_))
                X += w_ + (rng.uniform(4, 8) if rng.random() < 0.1 else rng.uniform(0, 1.0))
            # de fora para dentro: as casas mais perto do rio (do meio da tela) ficam por cima
            for k, (a, b) in enumerate(row[::-1]):
                x0, x1 = (a, b) if side > 0 else (-b, -a)
                xm = (x0 + x1) / 2
                if -205 < xm < -95 and 400 < Z < 600:
                    continue
                if 100 < xm < 140 and 360 < Z < 420:
                    continue
                if -60 < xm < 60 and 285 < Z < 318:
                    continue
                items.append(('house', Z + 1e-4 * (len(row) - k), Z + rng.uniform(-dz * 0.2, dz * 0.2), x0, x1, dz * rng.uniform(0.55, 0.8), side))
        Z -= dz
    items.append(('cathedral', 440.0))
    items.append(('tower', 380.0))
    items.append(('bridge', 300.0))
    items.sort(key=lambda it: -it[1])
    solid = np.zeros((H, W), np.float32)

    def tone(base, k, Zb, x_scr):
        fog = 1 - math.exp(-Zb / 1300.0)
        hz = np.asarray(hz_col(np.array(x_scr)), np.float32).reshape(3)
        return mix(np.asarray(base, np.float32) * k, hz, fog * 0.95), fog

    def rim(p0, p1, k, fog, w=1.3):
        r = patch(edge_quad(p0, p1, w))
        if r is None:
            return
        a, sl = r
        a = a * k * (1 - fog * 0.55)
        c = mix(col(0xffd8a4), col(0xfff0d0), fog)
        ref[sl] = ref[sl] * (1 - a[..., None]) + c * a[..., None]

    walls = [col(0x8a8494), col(0x9a8a80), col(0x8c7a86), col(0x7c8090), col(0x9a9088)]
    roofs = [col(0x5a586c), col(0x7a5650), col(0x625a6a), col(0x84605a)]
    def fill_s(pts, color, k=1.0):
        fill(ref, pts, color, solid, k)

    for it in items:
        kind = it[0]
        if kind == 'house':
            _, _, Z0, x0, x1, d, side = it
            Z1 = Z0 + d
            xm, zm = (x0 + x1) / 2, (Z0 + Z1) / 2
            gY = VS_BANK + vs_hill(xm, zm)
            hgt = rng.uniform(8, 15) if rng.random() > 0.06 else rng.uniform(18, 26)
            rise = rng.uniform(4, 7)
            ruin = Z0 < 900 and rng.random() < 0.09
            wc, rc = walls[int(rng.integers(0, 5))], roofs[int(rng.integers(0, 4))]
            xs_ = vs_p(xm, gY, Z0)[0]
            cw, fog = tone(wc, 0.25, Z0, xs_)
            cs, _ = tone(wc, 0.2, Z0, xs_)
            cr, _ = tone(rc, 0.34, Z0, xs_)
            ridge_x = rng.random() < 0.55
            Y0, Y1 = gY, gY + hgt
            # a parede do lado que vira para o rio
            xe = x1 if side < 0 else x0
            side_q = [vs_p(xe, Y0, Z0), vs_p(xe, Y0, Z1), vs_p(xe, Y1, Z1), vs_p(xe, Y1, Z0)]
            fill_s(side_q, cs)
            if ridge_x and not ruin:
                fill_s([vs_p(xe, Y1, Z0), vs_p(xe, Y1, Z1), vs_p(xe, Y1 + rise, zm)], cs)
            if ruin:
                # a casa que desabou: as paredes com o alto quebrado, o escuro de dentro e duas vigas soltas
                nj = 7
                top = [vs_p(x0 + (x1 - x0) * k / nj, Y0 + hgt * rng.uniform(0.35, 0.9), Z0) for k in range(nj + 1)]
                fill_s([vs_p(x0, Y0, Z0), vs_p(x1, Y0, Z0)] + top[::-1], cw)
                for a_, b_ in zip(top[:-1], top[1:]):
                    rim(a_, b_, 0.6, fog)
                for k in range(2):
                    bx = rng.uniform(x0, x1)
                    rim(vs_p(bx, Y0 + hgt * 0.5, Z0 + 1), vs_p(bx + rng.uniform(-6, 6), Y0 + hgt * 0.95, zm), 0.5, fog, max(1.0, 0.5 * VS_F / Z0 / 4))
                continue
            front = [vs_p(x0, Y0, Z0), vs_p(x1, Y0, Z0), vs_p(x1, Y1, Z0), vs_p(x0, Y1, Z0)]
            fill_s(front, cw)
            # as janelas: escuras, algumas acesas (a cidade acordando)
            if Z0 < 1000:
                fw_ = x1 - x0
                nwin = max(1, int(fw_ / 3.6))
                for fl in np.arange(Y0 + 2.2, Y1 - 2.2, 3.4):
                    for k in range(nwin):
                        wx0 = x0 + (k + 0.32) * fw_ / nwin
                        q = [vs_p(wx0, fl, Z0), vs_p(wx0 + 1.1, fl, Z0), vs_p(wx0 + 1.1, fl + 1.7, Z0), vs_p(wx0, fl + 1.7, Z0)]
                        if rng.random() < 0.14:
                            fill_s(q, mix(col(0xffb466), col(0xf4cfa8), fog), k=0.9)
                        else:
                            fill_s(q, mix(col(0x15111b), np.asarray(hz_col(np.array(xs_)), np.float32).reshape(3), fog * 0.9), k=0.75)
            if ridge_x:
                roof = [vs_p(x0 - 0.4, Y1, Z0 - 0.4), vs_p(x1 + 0.4, Y1, Z0 - 0.4), vs_p(x1 + 0.4, Y1 + rise, zm), vs_p(x0 - 0.4, Y1 + rise, zm)]
                fill_s(roof, cr)
                rim(vs_p(x0, Y1 + rise, zm), vs_p(x1, Y1 + rise, zm), 0.5, fog, max(1.0, 0.14 * VS_F / Z0))
            else:
                apex = vs_p(xm, Y1 + rise, Z0)
                fill_s([vs_p(x0, Y1, Z0), vs_p(x1, Y1, Z0), apex], cw)
                # a água do telhado que vira para a câmera (a do lado do rio)
                xe2 = x1 if side < 0 else x0
                fill_s([vs_p(xe2, Y1, Z0 - 0.3), apex, vs_p(xm, Y1 + rise, Z1), vs_p(xe2, Y1, Z1)], cr)
                # a beira da empena do lado do sol e a cumeeira pegam a luz
                sun_side = x0 if xs_ > SX else x1
                rim(vs_p(sun_side, Y1, Z0), apex, 0.32, fog)
                rim(apex, vs_p(xm, Y1 + rise, Z1), 0.3, fog)
            if rng.random() < 0.3 and Z0 < 1100:
                cxh = rng.uniform(x0 + 1, x1 - 2)
                ch = [vs_p(cxh, Y1, zm), vs_p(cxh + 1.3, Y1, zm), vs_p(cxh + 1.3, Y1 + rise + 1.6, zm), vs_p(cxh, Y1 + rise + 1.6, zm)]
                fill_s(ch, cs)
                rim(vs_p(cxh, Y1 + rise + 1.6, zm), vs_p(cxh + 1.3, Y1 + rise + 1.6, zm), 0.4, fog)
        elif kind == 'cathedral':
            # no alto do morro: a nave para o fundo, a fachada com a rosácea e o portal, duas torres com agulha
            gY = VS_BANK + vs_hill(-150, 480)
            x0, x1, Z0, Z1 = -178.0, -122.0, 440.0, 570.0
            xm = (x0 + x1) / 2
            xs_ = vs_p(xm, gY, Z0)[0]
            stone = col(0x968a96)
            cw, fog = tone(stone, 0.22, Z0, xs_)
            cs, _ = tone(stone, 0.18, Z0, xs_)
            cr, _ = tone(col(0x4e4e62), 0.45, Z0, xs_)
            hgt, rise = 30.0, 17.0
            fill_s([vs_p(x1, gY, Z0), vs_p(x1, gY, Z1), vs_p(x1, gY + hgt, Z1), vs_p(x1, gY + hgt, Z0)], cs)
            for k in range(8):
                zb = Z0 + 10 + k * 14
                fill_s([vs_p(x1, gY + 9, zb), vs_p(x1, gY + 9, zb + 5), vs_p(x1, gY + 24, zb + 5), vs_p(x1, gY + 27, zb + 2.5), vs_p(x1, gY + 24, zb)], mix(cs, col(0xffc890), 0.25))
                fill_s([vs_p(x1, gY, zb - 2), vs_p(x1 + 4, gY, zb - 2), vs_p(x1 + 4, gY + 18, zb - 2), vs_p(x1, gY + 26, zb - 2)], cw)
            fill_s([vs_p(x1, gY + hgt, Z0), vs_p(xm, gY + hgt + rise, Z0), vs_p(xm, gY + hgt + rise, Z1), vs_p(x1, gY + hgt, Z1)], cr)
            rim(vs_p(xm, gY + hgt + rise, Z0), vs_p(xm, gY + hgt + rise, Z1), 0.85, fog, 1.6)
            fill_s([vs_p(x0, gY, Z0), vs_p(x1, gY, Z0), vs_p(x1, gY + hgt, Z0), vs_p(xm, gY + hgt + rise, Z0), vs_p(x0, gY + hgt, Z0)], cw)
            rcx, rcy = vs_p(xm, gY + 21, Z0)
            r_ = 6.5 * VS_F / Z0
            fill_s([(rcx + r_ * 0.8 * math.cos(a), rcy + r_ * 0.8 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 28, endpoint=False)], mix(col(0xffc27a), cw, 0.68))
            fill_s([vs_p(xm - 4, gY, Z0), vs_p(xm + 4, gY, Z0), vs_p(xm + 4, gY + 8, Z0), vs_p(xm, gY + 12, Z0), vs_p(xm - 4, gY + 8, Z0)], col(0x120e16))
            for (tx0, tx1) in ((x0 - 4, x0 + 12), (x1 - 12, x1 + 4)):
                tz = Z0 - 6
                fill_s([vs_p(tx0, gY, tz), vs_p(tx1, gY, tz), vs_p(tx1, gY + 62, tz), vs_p(tx0, gY + 62, tz)], cw)
                for fl in (26.0, 44.0):
                    fill_s([vs_p(tx0 + 4, gY + fl, tz), vs_p(tx1 - 4, gY + fl, tz), vs_p(tx1 - 4, gY + fl + 9, tz), vs_p((tx0 + tx1) / 2, gY + fl + 12, tz), vs_p(tx0 + 4, gY + fl + 9, tz)], col(0x120e16))
                tip = vs_p((tx0 + tx1) / 2, gY + 104, tz + 8)
                fill_s([vs_p(tx0, gY + 62, tz), vs_p(tx1, gY + 62, tz), tip], cr)
                sun_side = tx0 if vs_p(tx0, 0, tz)[0] > SX else tx1
                rim(vs_p(sun_side, gY, tz), vs_p(sun_side, gY + 62, tz), 0.6, fog)
                rim(vs_p(sun_side, gY + 62, tz), tip, 0.85, fog)
                rim(vs_p(tx0, gY + 62, tz), vs_p(tx1, gY + 62, tz), 0.5, fog)
        elif kind == 'tower':
            # a torre velha da margem direita: quadrada, com as seteiras e o telhado em ponta
            x0, x1, Z0 = 106.0, 122.0, 380.0
            gY = VS_BANK
            xs_ = vs_p(x0, gY, Z0)[0]
            cw, fog = tone(col(0x8a8090), 0.24, Z0, xs_)
            cs, _ = tone(col(0x8a8090), 0.19, Z0, xs_)
            fill_s([vs_p(x0, gY, Z0), vs_p(x0, gY, Z0 + 16), vs_p(x0, gY + 48, Z0 + 16), vs_p(x0, gY + 48, Z0)], cs)
            fill_s([vs_p(x0, gY, Z0), vs_p(x1, gY, Z0), vs_p(x1, gY + 48, Z0), vs_p(x0, gY + 48, Z0)], cw)
            for fl in (14.0, 26.0, 38.0):
                fill_s([vs_p(113.4, gY + fl, Z0), vs_p(114.6, gY + fl, Z0), vs_p(114.6, gY + fl + 4, Z0), vs_p(113.4, gY + fl + 4, Z0)], col(0x120e16))
            tip = vs_p(114.0, gY + 64, Z0 + 8)
            cr, _ = tone(col(0x4e4e62), 0.45, Z0, xs_)
            fill_s([vs_p(x0 - 1, gY + 48, Z0), vs_p(x1 + 1, gY + 48, Z0), tip], cr)
            fill_s([vs_p(x0 - 1, gY + 48, Z0), vs_p(x0 - 1, gY + 48, Z0 + 16), tip], cs)
            rim(vs_p(x0 - 1, gY + 48, Z0), tip, 0.85, fog)
            rim(vs_p(x0, gY, Z0), vs_p(x0, gY + 48, Z0), 0.6, fog)
        elif kind == 'bridge':
            # a ponte de pedra: o tabuleiro em cima de quatro arcos, os pilares na água e o reflexo dela
            zb = 300.0
            xs_ = VS_VX
            cw, fog = tone(col(0x8e8290), 0.3, zb, xs_)
            bm = Mask(W, H)
            bm.poly([vs_p(-44, VS_BANK, zb), vs_p(44, VS_BANK, zb), vs_p(44, 13.2, zb), vs_p(-44, 13.2, zb)])
            bm.poly([vs_p(-40, -1, zb), vs_p(40, -1, zb), vs_p(40, VS_BANK, zb), vs_p(-40, VS_BANK, zb)])
            om = Mask(W, H)
            for k in range(4):
                ax0 = -32 + k * 16.5
                pts = [vs_p(ax0, -1, zb)]
                for a in np.linspace(math.pi, 0, 14):
                    pts.append(vs_p(ax0 + 6.75 + 6.75 * math.cos(a), 2.0 + 7.0 * math.sin(a), zb))
                pts.append(vs_p(ax0 + 13.5, -1, zb))
                om.poly(pts)
            bridge = np.clip(bm.array() - om.array(), 0, 1)
            # o reflexo na água, embaixo (espelhado na linha d'água), mais escuro e quebrado pelas marolas
            wy = vs_p(0, 0, zb)[1]
            ys_ = np.clip(2 * wy - yy + rip * 4, 0, H - 1)
            refl_b = ndi.map_coordinates(bridge, [ys_, xx], order=1) * water * (yy > wy)
            ref[:] = ref * (1 - (refl_b * 0.55)[..., None]) + col(0x2a2234) * (refl_b * 0.55)[..., None]
            ref[:] = put(ref, cw, bridge)
            solid[:] = np.maximum(solid, bridge)
            # o parapeito e as beiradas dos arcos, contra a água clara
            rim(vs_p(-44, 13.2, zb), vs_p(44, 13.2, zb), 0.9, fog, 1.6)
    # ---------------- o pincel
    base = np.where(yy < VS_VY, (value_noise(H, W, 90, rng, 2) - 0.5) * 0.3, 0.0)
    # em volta do sol as pinceladas deitam (sem rodar em volta dele)
    flow = flow_of(ref, base, 0.9 * (1 - np.exp(-(d_sun / 230) ** 2)))
    out, _ = painted(ref, rng, flow, ps=passes(0.85, dry=0.2, err=(0.0, 0.02, 0.035, 0.05), long=1.0))
    out = out * 0.78 + ref * 0.22
    # ---------------- os raios do sol pelas brechas das nuvens (por cima de tudo, na névoa da manhã)
    src = (1 - band) * np.exp(-(d_sun / 230) ** 2) * (yy < VS_VY)
    ray = shafts(src, VS_SUNP, 80, 1.0, 0.975)
    ray = np.clip(ray * 3.0 - 0.25, 0, 1) * (1 - np.exp(-(d_sun / 60) ** 2))
    out = screen(out, col(0xffdcae), ray * 0.32 * (1 - 0.7 * blur(solid, 1.5)) * np.where(yy < VS_VY, 1.0, 0.5))
    # ---------------- as memórias caindo: luzinhas douradas com um rastro curto para cima
    glow = np.zeros((H, W), np.float32)
    for i in range(64):
        gx, gy_ = rng.uniform(0, W), 20 + 560 * rng.random() ** 1.3
        r = rng.uniform(1.2, 3.2) * (0.6 + 0.8 * gy_ / 640)
        g = np.exp(-((xx - gx) ** 2 + (yy - gy_) ** 2) / (r * r))
        tail = np.exp(-((xx - gx) / (r * 0.6)) ** 2) * np.exp(-np.maximum(gy_ - yy, 0) / (r * 5)) * (yy < gy_) * 0.35
        glow = np.maximum(glow, g + tail)
    out = screen(out, col(0xffd88a), np.clip(glow, 0, 1) * 0.85)
    out = add_light(out, col(0xffb860), blur(glow, 5) * 0.35)
    return finish(out)


def f_vespera_perto(rng):
    """O parapeito da sacada embaixo e a corrente pesada das Torres descendo do alto à esquerda até uma argola
    no parapeito (em contraluz, a beirada de cima pega o céu)."""
    yy, xx = grid()
    ref = np.zeros((H, W, 3), np.float32)
    alpha = np.zeros((H, W), np.float32)
    tex = value_noise(H, W, 6, rng, 3)
    # o parapeito: a pedra de cima (com a quina gasta) e o muro embaixo
    top = 646 + (xx - 640) * 0.02
    pm = sstep(top - 1, top + 1, yy)
    pc = vgrad([(0.0, col(0x4a3e50)), (0.12, col(0x2c2432)), (1.0, col(0x1a141e))], np.clip((yy - top) / 74, 0, 1))
    pc = pc * (1 + 0.2 * (tex[..., None] - 0.5))
    joint = (np.abs(np.mod(xx + 30, 210) - 105) > 103.5) * (yy > top + 16)
    pc = mix(pc, col(0x100c12), (joint * 0.7)[..., None])
    ref = put(ref, pc, pm)
    ref = put(ref, mix(col(0x2a2232), col(0x1e1824), 0.5), sstep(top + 15, top + 17, yy) * (1 - sstep(top + 18, top + 20, yy)))
    ref = put(ref, col(0xffd8b0), rim_of(pm, 0, -2.2, 0.7) * 0.75 * (0.5 + 0.5 * np.exp(-((xx - VS_SUNP[0]) / 420) ** 2)))
    alpha = np.maximum(alpha, pm)
    # a argola presa no parapeito e a corrente: uma catenária de elos (de frente e de lado, alternados)
    ax, ay = 236.0, top[0, 236] + 2
    ring = np.clip(Mask(W, H).ellipse(ax, ay - 10, 13, 13).array() - Mask(W, H).ellipse(ax, ay - 10, 7.5, 7.5).array(), 0, 1)
    p0 = np.array([-40.0, -30.0])
    p1 = np.array([ax, ay - 22])
    n_links = 26
    pts = []
    for i in range(n_links + 1):
        t = i / n_links
        pts.append((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t + 72 * 4 * t * (1 - t)))
    cm = Mask(W, H)
    hole = Mask(W, H)
    for i in range(n_links):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        ang = math.atan2(y1 - y0, x1 - x0)
        L = math.hypot(x1 - x0, y1 - y0) * 0.78
        ca, sa = math.cos(ang), math.sin(ang)
        if i % 2 == 0:
            # o elo de frente: um anel comprido com o vão no meio
            cm.poly([(cx + ca * L * math.cos(a) - sa * 7.5 * math.sin(a), cy + sa * L * math.cos(a) + ca * 7.5 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 20, endpoint=False)])
            hole.poly([(cx + ca * L * 0.62 * math.cos(a) - sa * 3.2 * math.sin(a), cy + sa * L * 0.62 * math.cos(a) + ca * 3.2 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 16, endpoint=False)])
        else:
            # o elo de lado: uma barra grossa
            cm.line([(cx - ca * L, cy - sa * L), (cx + ca * L, cy + sa * L)], 5.5)
    chain = np.maximum(np.clip(cm.array() - hole.array(), 0, 1), ring)
    ref = put(ref, col(0x16121a), chain)
    ref = put(ref, col(0xc8a8a0), rim_of(chain, 0, -1.6, 0.5) * 0.7)
    ref = put(ref, col(0xffd2a0), rim_of(chain, 1.6, -0.6, 0.5) * 0.45)
    alpha = np.maximum(alpha, chain)
    base = np.full((H, W), 0.0, np.float32)
    flow = flow_of(np.where(alpha[..., None] > 0.5, ref, 0.1), base, 0.9)
    out, A = painted(ref, rng, flow, mask=sstep(0.3, 0.6, alpha), ps=passes(0.8, dry=0.2, err=(0.0, 0.02, 0.03, 0.04)), base=1.0)
    out = out * (1 - chain[..., None] * 0.5) + ref * chain[..., None] * 0.5
    a = np.clip(np.maximum(A * (alpha > 0.02), alpha * 0.98), 0, 1)
    return finish(blur(out, 0.8), blur(a, 0.8))


# ---------------------------------------------------------------- a flor no Arquivo
# O corredor do Arquivo Proibido visto bem de perto do chão (a câmera a FL_CAMH m, quase deitada): as estantes
# dos dois lados indo para o fundo escuro, com os frascos de Âmbar agora vazios (as memórias voltaram para os
# donos) e os registros; do óculo no alto da abóbada desce uma coluna de sol, cortada pelas duas barras de
# ferro do óculo, que faz uma mancha redonda no chão; só ali a flor nasceu, entre duas lajes. Mais atrás, aberto
# no chão, um registro dela com as flores prensadas entre as folhas.
FL_CAMH, FL_PITCH, FL_F = 0.34, math.radians(11.0), 1150.0
FL_L = np.array([-0.22, 1.0, 0.16], np.float32) / np.linalg.norm([-0.22, 1.0, 0.16])
FL_SPOT = (0.0, 0.8, 0.19)
FL_FLOWER = (0.0, 0.76)
FL_AISLE = 0.82
FL_PHASES = np.random.default_rng(77).uniform(0, 2 * np.pi, 20)


def fl_rays(yy, xx):
    dcx = (xx - W / 2) / FL_F
    dcy = -(yy - H / 2) / FL_F
    c, s = math.cos(FL_PITCH), math.sin(FL_PITCH)
    dx = dcx
    dy = dcy * c - s
    dz = dcy * s + c
    n = np.sqrt(dx * dx + dy * dy + dz * dz)
    return dx / n, dy / n, dz / n


def fl_p(X, Y, Z):
    """Do mundo para a tela (a câmera em (0, FL_CAMH, 0) olhando para +Z, inclinada FL_PITCH para baixo)."""
    y = Y - FL_CAMH
    c, s = math.cos(FL_PITCH), math.sin(FL_PITCH)
    zc = Z * c - y * s
    yc = Z * s + y * c
    return (W / 2 + X / zc * FL_F, H / 2 - yc / zc * FL_F)


def fl_spot(X, Z, soft=0.03, leaves=True):
    """A mancha do óculo no chão (1 dentro, 0 fora): a beirada recortada pelas folhas da hera que cresce em volta
    do óculo lá em cima."""
    cx, cz, r = FL_SPOT
    X, Z = np.asarray(X, np.float32), np.asarray(Z, np.float32)
    d = np.hypot(X - cx, Z - cz)
    if leaves:
        # a beirada irregular: muitas ondas de fases soltas (as folhas da hera na boca do óculo)
        th = np.arctan2(Z - cz, X - cx)
        wob = np.zeros_like(d)
        for k, ph in zip(range(2, 22), FL_PHASES):
            wob = wob + np.sin(k * th + ph) * 0.07 / k ** 0.75
        d = d * (1 + wob)
    return sstep(r + soft, r - soft, d)


def petal_shape(L, Wd, n=14, notch=0.12):
    """O contorno de uma pétala (no plano dela: x ao longo, y de lado): estreita no pé, larga e arredondada na
    ponta, com um entalhe pequeno no meio da ponta."""
    pts = []
    for i in range(n + 1):
        t = i / n
        w = Wd * (math.sin(math.pi * min(1.0, t * 1.08)) ** 0.7) * (0.35 + 0.65 * t)
        pts.append((t * L, w / 2))
    tip = [(L * (1 - notch * 0.4), 0.0)]
    return pts + tip + [(x, -y) for x, y in pts[::-1]]


def f_flor(rng):
    """O chão do Arquivo na mancha de sol do óculo: a flor branca entre as lajes, o registro aberto com as flores
    prensadas, as estantes no escuro com os frascos vazios, a coluna de luz com poeira."""
    yy, xx = grid()
    dx, dy, dz = fl_rays(yy, xx)
    INF = 1e9
    # ---------------- o que cada raio da câmera encontra: o chão, a face de uma estante ou o fundo
    t_f = np.where(dy < -1e-4, -FL_CAMH / np.minimum(dy, -1e-4), INF)
    t_l = np.where(dx < -1e-4, -FL_AISLE / np.minimum(dx, -1e-4), INF)
    t_r = np.where(dx > 1e-4, FL_AISLE / np.maximum(dx, 1e-4), INF)
    hit_l = (t_l < t_f) & (FL_CAMH + t_l * dy < 3.2)
    hit_r = (t_r < t_f) & (FL_CAMH + t_r * dy < 3.2)
    shelf = hit_l | hit_r
    t_hit = np.where(shelf, np.where(hit_l, t_l, t_r), t_f)
    t_hit = np.minimum(t_hit, 30.0)
    far = t_hit >= 29.9
    Xh, Yh, Zh = dx * t_hit, FL_CAMH + dy * t_hit, dz * t_hit
    tex = value_noise(H, W, 4, rng, 3)
    ref = np.zeros((H, W, 3), np.float32)
    # ---------------- o chão: lajes grandes gastas, juntas escuras, pó; musgo e terra só perto da luz
    SW, SL = 0.6, 0.44
    row = np.floor(Zh / SL)
    u = Xh / SW + np.mod(row * 0.5, 1.0) + 0.5
    cu, cv_ = np.mod(u, 1.0), np.mod(Zh / SL, 1.0)
    du = np.maximum(np.abs(np.gradient(u, axis=1)) + np.abs(np.gradient(u, axis=0)), 1e-5)
    dv = np.maximum(np.abs(np.gradient(Zh / SL, axis=0)) + np.abs(np.gradient(Zh / SL, axis=1)), 1e-5)
    joint = np.clip(1.8 - np.minimum(np.minimum(cu, 1 - cu) / du, np.minimum(cv_, 1 - cv_) / dv), 0, 1) * ~shelf
    slab_id = np.floor(u) * 13 + row * 7
    slab_v = np.mod(np.sin(slab_id * 12.9898) * 43758.5453, 1.0) - 0.5
    grain = sample(noise_tex(rng, 512, 14, 4), Xh * 220, Zh * 220)
    floor_c = col(0x6c6470) * (1 + 0.16 * slab_v[..., None]) * (1 + 0.5 * (grain[..., None] - 0.5))
    floor_c = mix(floor_c, col(0x8c8088), (sstep(0.6, 0.85, sample(noise_tex(rng, 256, 30, 3), Xh * 90, Zh * 90)) * 0.3)[..., None])
    floor_c = mix(floor_c, col(0x120e14), (joint * 0.78)[..., None])
    moss = joint * sstep(0.4, 0.7, sample(noise_tex(rng, 256, 8, 3), Xh * 400, Zh * 400)) * fl_spot(Xh, Zh, 0.3, False)
    floor_c = mix(floor_c, col(0x4a6a36), (moss * 0.85)[..., None])
    # a luz: a mancha do óculo, a luz rebatida em volta dela e o escuro do resto
    spot = fl_spot(Xh, Zh) * ~shelf
    dspot = np.hypot(Xh - FL_SPOT[0], Zh - FL_SPOT[1])
    bounce = np.exp(-(dspot / 0.8) ** 2)
    light = col(0x6c6c98) * (0.08 + 0.18 * bounce)[..., None] + col(0xffc890) * (0.12 * bounce)[..., None] + col(0xffdcae) * (spot * 1.7)[..., None]
    ref = np.where(shelf[..., None], ref, floor_c * light)
    # ---------------- as estantes: tábuas, frascos de vidro vazios e registros, no escuro
    Zs, Ys = np.where(shelf, Zh, 0.0), np.where(shelf, Yh, 0.0)
    pitch_ = 0.44
    slot = np.floor(Ys / pitch_)
    inner = np.mod(Ys, pitch_)
    board = inner < 0.04
    # cada trecho de prateleira: ou uma fila de frascos (redondos, de vidro) ou uma fila de registros
    run = np.floor(Zs / 0.7 + slot * 1.37)
    jar_run = np.mod(run * 5 + slot * 3, 3) == 0
    wj = 0.13
    kj = np.mod(Zs, wj) / wj
    jar_h = 0.24
    jar_body = jar_run & (inner > 0.04) & (inner < 0.04 + jar_h) & (np.abs(kj - 0.5) < 0.42)
    neck = jar_run & (inner >= 0.04 + jar_h) & (inner < 0.04 + jar_h + 0.05) & (np.abs(kj - 0.5) < 0.18)
    seg = np.floor(Zs / 0.045 + slot * 3.7)
    rnd = np.mod(np.sin(seg * 78.233 + slot * 12.9) * 43758.5453, 1.0)
    bk_h = 0.2 + 0.16 * rnd
    book = ~jar_run & (inner > 0.04) & (inner < 0.04 + bk_h) & (np.mod(Zs, 0.045) > 0.004)
    pal = np.array([col(0x5a2a2a), col(0x2e3a2e), col(0x4a3826), col(0x6a5a3a), col(0x2a2e44)], np.float32)
    bc = mix(pal[(rnd * 5).astype(int) % 5], col(0x3a3440), 0.35)
    sc = np.full((H, W, 3), col(0x0e0b10), np.float32)
    sc = np.where(book[..., None], bc * (1 + 0.2 * (tex[..., None] - 0.5)), sc)
    glass = mix(col(0x2a2e3a), col(0x6a6e80), (np.abs(kj - 0.5) > 0.32)[..., None] * 1.0)
    sc = np.where((jar_body | neck)[..., None], glass, sc)
    sc = np.where(board[..., None], col(0x3a2a22) * (1 + 0.3 * (tex[..., None] - 0.5)), sc)
    lit_s = 0.12 + 0.45 * np.exp(-(np.hypot(Zs - FL_SPOT[1], Ys * 1.4) / 0.9) ** 2)
    sh = sc * (col(0x8a86a8) * 0.7 + col(0xffc890) * (lit_s - 0.16)[..., None] * 1.4) * lit_s[..., None] * 2.0
    # o vidro reflete a mancha clara do chão num risco
    glint = (jar_body & (np.abs(kj - 0.22) < 0.04)) * np.exp(-(np.abs(Zs - FL_SPOT[1]) / 1.4))
    sh = sh + glint[..., None] * col(0xffe0b8) * 0.5
    ref = np.where(shelf[..., None], sh, ref)
    # o fundo do corredor: o escuro, e longe a fresta clara de uma porta
    fogd = np.clip((t_hit - 1.2) / 9.0, 0, 1) ** 0.8
    ref = mix(ref, col(0x161320), (fogd * 0.85)[..., None])
    door = np.exp(-((xx - 646) / 10.0) ** 2) * sstep(240, 310, yy) * (1 - sstep(350, 362, yy)) * 0.1
    ref = add_light(ref, col(0x8a9ac8), door)
    # ---------------- o registro aberto no chão, mais atrás, meio na luz, com as flores prensadas
    BX, BZ, BA = 0.3, 1.0, 0.42
    ca_, sa_ = math.cos(BA), math.sin(BA)

    def bp(a, b, y=0.004):
        return fl_p(BX + ca_ * a - sa_ * b, y, BZ + sa_ * a + ca_ * b)

    def blit(a, b):
        return float(fl_spot(BX + ca_ * a - sa_ * b, BZ + sa_ * a + ca_ * b, 0.06))
    book_m = np.zeros((H, W), np.float32)
    fill(ref, [bp(-0.16, -0.115, 0.0), bp(0.16, -0.115, 0.0), bp(0.16, 0.115, 0.0), bp(-0.16, 0.115, 0.0)], col(0x24140e), book_m)
    for sgn in (-1, 1):
        pts = [bp(0.0, -0.105, 0.01), bp(sgn * 0.075, -0.106, 0.022), bp(sgn * 0.148, -0.104, 0.016), bp(sgn * 0.152, 0.104, 0.016), bp(sgn * 0.078, 0.106, 0.022), bp(0.0, 0.105, 0.01)]
        lk = blit(sgn * 0.08, 0.0)
        page = mix(col(0x4a4036), col(0xe8d4ae), 0.15 + 0.85 * lk)
        fill(ref, pts, page, book_m)
        # o amarelado nas beiradas da folha velha
        fill(ref, edge_quad(bp(sgn * 0.148, -0.1, 0.017), bp(sgn * 0.152, 0.1, 0.017), 2.0), mix(page, col(0x8a6a40), 0.4))
        for k in range(8):
            b0 = -0.08 + k * 0.02
            a1 = sgn * (0.13 if k % 3 else 0.09)
            fill(ref, edge_quad(bp(sgn * 0.018, b0, 0.023), bp(a1, b0, 0.023), 0.8), mix(page, col(0x2a1c14), 0.4))
        fx_, fz_ = sgn * 0.08, 0.025 * sgn
        for pk in range(5):
            ang = pk * 2 * math.pi / 5 + 0.4 * sgn
            pts = [bp(fx_ + math.cos(ang + e) * r, fz_ + math.sin(ang + e) * r, 0.024) for e, r in ((-0.4, 0.003), (-0.25, 0.016), (0.0, 0.021), (0.25, 0.016), (0.4, 0.003))]
            fill(ref, pts, mix(col(0x6a4038), col(0xb8806a), lk))
        fill(ref, edge_quad(bp(fx_, fz_, 0.024), bp(fx_ + 0.012 * sgn, fz_ + 0.055, 0.024), 0.9), col(0x4a4a2c))
    fill(ref, edge_quad(bp(0.0, -0.105, 0.012), bp(0.0, 0.105, 0.012), 1.4), col(0x2a1c14))
    # ---------------- a flor: o caule saindo da junta, duas folhas, um botão e cinco pétalas brancas
    FX, FZ = FL_FLOWER
    # a terra e o musgo na fresta de onde ela sai
    cx_, cy_ = fl_p(FX, 0.0, FZ)
    sm = Mask(W, H).ellipse(cx_, cy_ + 1, 26, 5).array()
    ref = put(ref, mix(col(0x2a2216), col(0x5a7038), sstep(0.3, 0.7, tex)[..., None]) * (0.5 + 0.9 * float(fl_spot(FX, FZ))), sm * 0.9)
    stem3 = [(FX + 0.006 * math.sin(k * 0.45) - 0.002 * k, k * 0.0125, FZ + 0.0015 * k) for k in range(11)]
    stem = [fl_p(*q) for q in stem3]
    stem_m = np.zeros((H, W), np.float32)
    for k, (p0, p1) in enumerate(zip(stem[:-1], stem[1:])):
        fill(ref, edge_quad(p0, p1, 3.4 - k * 0.12), col(0x3e5e2c), stem_m)
        fill(ref, edge_quad((p0[0] - 0.8, p0[1]), (p1[0] - 0.8, p1[1]), 1.0), col(0x8ab05a))
    # as folhas: compridas, com a nervura do meio clara
    for sgn, k_at, ln in ((-1, 3, 0.05), (1, 5, 0.042)):
        bx3 = stem3[k_at]
        tip3 = (bx3[0] + sgn * ln, bx3[1] + 0.012, bx3[2] - 0.012)
        for side_ in (1, -1):
            mids = [(bx3[0] + (tip3[0] - bx3[0]) * f + side_ * 0.004 * math.sin(math.pi * f) * 1.6, bx3[1] + (tip3[1] - bx3[1]) * f + 0.006 * math.sin(math.pi * f) * side_, bx3[2] + (tip3[2] - bx3[2]) * f) for f in np.linspace(0, 1, 8)]
            pts = [fl_p(*q) for q in mids] + [fl_p(*bx3)]
            fill(ref, pts, col(0x4e7a36) if side_ > 0 else col(0x3a5e28))
        fill(ref, edge_quad(fl_p(*bx3), fl_p(*tip3), 0.9), col(0x9cc46c))
    # o botão fechado num galhinho
    b3 = stem3[7]
    bt = (b3[0] + 0.025, b3[1] + 0.03, b3[2] + 0.004)
    fill(ref, edge_quad(fl_p(*b3), fl_p(*bt), 1.6), col(0x4a6a32))
    bxs, bys = fl_p(*bt)
    fill(ref, [(bxs + 4.2 * math.cos(a), bys + 6.0 * math.sin(a) - 2) for a in np.linspace(0, 2 * math.pi, 14, endpoint=False)], col(0xd8d0c0))
    fill(ref, [(bxs + 4.4 * math.cos(a), bys + 3.5 * math.sin(a) + 2) for a in np.linspace(0, math.pi, 8)], col(0x4e7a36))
    # a cabeça: o plano dela virado para cima e um pouco para a câmera, as pétalas com o pé mais escuro,
    # a ponta clara e a borda que deixa passar a luz
    top3 = stem3[-1]
    cx3 = np.array([top3[0], top3[1] + 0.004, top3[2]])
    tilt = 0.62
    e1 = np.array([1.0, 0.0, 0.0])
    e2 = np.array([0.0, math.sin(tilt), math.cos(tilt)])
    nrm = np.cross(e1, e2)
    flower_m = np.zeros((H, W), np.float32)
    petals = []
    for k in range(5):
        a = k * 2 * math.pi / 5 + 0.25
        L_ = 0.034 * rng.uniform(0.92, 1.06)
        shape = petal_shape(L_, 0.026)
        da, db = math.cos(a), math.sin(a)
        pts = []
        for (px, py) in shape:
            # a pétala levanta um pouco para a ponta (a flor é uma tacinha rasa)
            lift = 0.25 * (px / L_) ** 1.5 * L_
            q = cx3 + e1 * (da * px - db * py) + e2 * (db * px + da * py) + nrm * lift
            pts.append(fl_p(*q))
        petals.append((math.sin(a), pts, a))
    # as de trás primeiro
    petals.sort(key=lambda p: -p[0])
    cxs, cys = fl_p(*cx3)
    for sv, pts, a in petals:
        m = Mask(W, H).poly(pts).array()
        d_c = np.hypot(xx - cxs, yy - cys)
        reach = max(1.0, max(math.hypot(p[0] - cxs, p[1] - cys) for p in pts))
        tt = np.clip(d_c / reach, 0, 1)
        lit_p = 0.8 + 0.2 * sv
        pc = vgrad([(0.0, col(0xb8b89a)), (0.35, col(0xe8e4d8)), (1.0, col(0xfffcf4))], tt) * lit_p
        # os veios saindo do pé
        ang_p = np.arctan2(yy - cys, xx - cxs)
        veins = (0.5 + 0.5 * np.cos((ang_p - a) * 40)) * sstep(0.15, 0.5, tt) * (1 - sstep(0.7, 1.0, tt))
        pc = mix(pc, col(0xd8d0c4), (veins * 0.25)[..., None])
        # a tacinha: a metade da pétala virada para longe da luz fica mais escura
        side = ((xx - cxs) * math.sin(a) - (yy - cys) * math.cos(a)) * (1 if math.cos(a) > 0 else -1)
        pc = pc * (1 - 0.14 * sstep(0, 6, side))[..., None]
        # a sombra da pétala de cima na de baixo, e a borda translúcida
        ref = ref * (1 - (blur(m, 1.5) * (1 - m) * 0.25)[..., None])
        ref = put(ref, pc, m)
        ref = put(ref, col(0xfff4dc), rim_of(m, 0, -1.2, 0.5) * 0.6)
        flower_m = np.maximum(flower_m, m)
    # o miolo: o disco amarelo e os estames em volta
    fill(ref, [(cxs + 6.0 * math.cos(a), cys + 4.6 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 18, endpoint=False)], col(0xd09a2a), flower_m)
    fill(ref, [(cxs + 3.4 * math.cos(a) - 1, cys + 2.6 * math.sin(a) - 1) for a in np.linspace(0, 2 * math.pi, 14, endpoint=False)], col(0xffe27a))
    for k in range(12):
        a = k * 2 * math.pi / 12
        px_, py_ = cxs + 7.2 * math.cos(a), cys + 5.4 * math.sin(a)
        fill(ref, [(px_ + 1.1 * math.cos(b), py_ + 1.1 * math.sin(b)) for b in np.linspace(0, 2 * math.pi, 8, endpoint=False)], col(0xf0c040))
    # a sombra da flor no chão (a luz vem do alto, um pouco da esquerda e do fundo)
    shm = Mask(W, H)
    sdx, sdz = -FL_L[0] / FL_L[1], -FL_L[2] / FL_L[1]
    sp = [fl_p(q[0] + sdx * q[1], 0.0, q[2] + sdz * q[1]) for q in stem3]
    shm.line(sp, 2.6)
    hx_, hy_ = fl_p(cx3[0] + sdx * cx3[1], 0.0, cx3[2] + sdz * cx3[1])
    shm.ellipse(hx_, hy_, 30, 7)
    shadow = blur(shm.array(), 2.5) * spot * (1 - flower_m)
    ref = ref * (1 - (shadow * 0.5)[..., None])
    # ---------------- a coluna de luz do óculo na poeira: o raio da câmera atravessando o cilindro
    acc = np.zeros((H, W), np.float32)
    n = 64
    tmax = np.minimum(t_hit, 6.0)
    dust3 = noise_tex(rng, 256, 18, 3)
    for k in range(n):
        tt = (k + 0.5) / n * tmax
        Qx, Qy, Qz = dx * tt, FL_CAMH + dy * tt, dz * tt
        Fx = Qx - Qy / FL_L[1] * FL_L[0]
        Fz = Qz - Qy / FL_L[1] * FL_L[2]
        inside = fl_spot(Fx, Fz, 0.05) * (Qy > 0)
        d3 = sample(dust3, Qx * 70 + Qy * 30, Qz * 70 - Qy * 24)
        acc += inside * (0.4 + 1.0 * d3) * (tmax / n)
    beam = 1 - np.exp(-acc * 2.6)
    # ---------------- o pincel (a flor, o registro e a mancha ficam mais nítidos)
    base = (value_noise(H, W, 60, rng, 2) - 0.5) * 0.4
    flow = flow_of(ref, base, 0.9)
    out, _ = painted(ref, rng, flow, ps=passes(0.75, dry=0.2, err=(0.0, 0.02, 0.03, 0.045), long=1.0))
    keep = np.clip(blur(np.maximum(flower_m, np.maximum(book_m * 0.55, stem_m)), 1.0) * 0.92 + spot * 0.42, 0, 0.92)
    out = out * (1 - keep[..., None]) + ref * keep[..., None]
    out = screen(out, col(0xffe2b4), np.clip(beam, 0, 1) * 0.5)
    # a flor brilha um pouco na luz (as pétalas deixam passar o sol)
    out = add_light(out, col(0xfff0d0), blur(flower_m, 5.0) * 0.16)
    return finish(out)


FRAME_FN = {
    'mascara': f_mascara,
    'mascara-luz': f_mascara_luz,
    'povo': f_povo,
    'destrocos': f_destrocos,
    'destrocos-perto': f_destrocos_perto,
    'vespera': f_vespera,
    'vespera-perto': f_vespera_perto,
    'flor': f_flor,
}


def _fim(mod, run):
    """Os planos dos finais II e III ficam em art2/fim/ (o trono e o rosto saem do raymarcher de lá, em C)."""
    def fn(rng):
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fim'))
        return run(__import__(mod), rng)
    return fn


FRAME_FN.update({
    'paz': _fim('paz', lambda m, rng: m.f_paz(rng)),
    'ruas': _fim('ruas', lambda m, rng: m.f_ruas(rng)),
    'ruas-perto': _fim('ruas', lambda m, rng: m.f_ruas_perto(rng)),
    'trono': _fim('trono3d', lambda m, rng: m.frame(rng)),
    'rosto': _fim('rosto3d', lambda m, rng: m.frame(rng)),
    'eclipse': _fim('eclipse', lambda m, rng: m.frame(rng)),
    'vozes': _fim('vozes', lambda m, rng: m.frame(rng)),
    'vozes-luz': _fim('vozes', lambda m, rng: m.f_vozes_luz(rng)),
    'cacos': _fim('cacos', lambda m, rng: m.frame(rng)),
    'ceu': _fim('ceu', lambda m, rng: m.frame(rng)),
    'ceu-perto': _fim('ceu', lambda m, rng: m.ce_perto(rng)),
    'campo': _fim('campo', lambda m, rng: m.frame(rng)),
    'campo-perto': _fim('campo', lambda m, rng: m.cp_perto(rng)),
})


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    names = [a for a in sys.argv[2:] if not a.startswith('--')]
    if '--atlas' in sys.argv:
        assets = sys.argv[sys.argv.index('--atlas') + 1]
        atlas(out, assets)
        return
    todo = names or [n for fr in FRAMES.values() for n in fr]
    for i, name in enumerate(todo):
        fn = FRAME_FN.get(name)
        if not fn:
            log('sem pintura ainda:', name)
            continue
        rng = np.random.default_rng(1000 + sum(map(ord, name)))
        img = fn(rng)
        img.save(os.path.join(out, f'{name}.png'))
        log(name, img.size)


def atlas(src, assets):
    for kind, names in FRAMES.items():
        rows = math.ceil(len(names) / 2)
        sheet = Image.new('RGBA', (W * 2, H * rows), (0, 0, 0, 0))
        for i, n in enumerate(names):
            im = Image.open(os.path.join(src, f'{n}.png')).convert('RGBA')
            sheet.paste(im, ((i % 2) * W, (i // 2) * H))
        path = os.path.join(assets, f'finais-{kind}.webp')
        sheet.save(path, 'WEBP', quality=88, method=6)
        log(path, sheet.size, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main()

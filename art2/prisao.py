"""Terreno pintado da Prisão Subterrânea (tema 'prison'): o poço, as celas, a sala das correntes, a
guarita, a fuga, a arena e a sala da máscara.

Mesmo processo de cidade.py (máscara 2x do mapa, cor, luz, pinceladas e redução para os pixels do
jogo), com a pedra da prisão: blocos frios e úmidos com escorridos escuros descendo das bordas, chão
de lajes gastas, as paredes de ferro liso ('+', onde as garras não seguram) em chapas rebitadas com
brilho de água e ferrugem escorrendo dos rebites, e a luz quente das velas, das tochas e da forja.
O alçapão ('=') fica vazado: a folha de madeira é um objeto do jogo (Fixtures.addTrapdoors), assim
como as grades de cela (':') e as do alarme ('!').

uso: python3 prisao.py <sala> [pasta_hd]
"""
import math
import os
import sys
import time
import numpy as np
from scipy import ndimage as ndi
from brush import Layer, hexc, mix, sstep, value_noise
from terreno import Room, fields, masonry, planks, spikes, downsample, load_maps, S, T
from cidade import hrand, breakables, chip, shade_masonry, strokes, lights, cornice, moss, cracks, downsample_soft

SEEDS = {'poco': 41, 'celas': 43, 'correntes': 45, 'guarita': 47, 'fuga': 49, 'arena': 51, 'mascara': 53, 'fosso': 55, 'abismo': 57}

PRISON = dict(
    ST_D=hexc(0x050607),
    STONES=[hexc(0x2c3335), hexc(0x31373a), hexc(0x283034), hexc(0x36363a), hexc(0x2d3430)],
    MORTAR=hexc(0x0b0d0f),
    DAMP=hexc(0x10171a),
    COLD=hexc(0x7d95a0),
    WARM=hexc(0xff9a44),
    FORGE=hexc(0xff7a2a),
    RUST=hexc(0x5e3522),
    SHEEN=hexc(0xb4c4c8),
    SLAB=[hexc(0x3a3f41), hexc(0x33393b), hexc(0x403f3c), hexc(0x383c38), hexc(0x2f3536)],
    MOSS=(hexc(0x131e1a), hexc(0x213326), hexc(0x3a5234)),
    IRON=(hexc(0x14171d), hexc(0x262b35), hexc(0x3d4452), hexc(0x9aa6ba)),
)


# o Fosso e o Leito do Abismo: a mesma pedra, mais funda e tingida de tinta. Em vez de água, a tinta
# preta escorre das bordas; o brilho molhado é lilás e o musgo vira crosta roxa
ABYSS_P = dict(
    PRISON,
    ST_D=hexc(0x050408),
    STONES=[hexc(0x25212d), hexc(0x2a2532), hexc(0x201d29), hexc(0x2d2736), hexc(0x24202b)],
    MORTAR=hexc(0x08060c),
    DAMP=hexc(0x0c0614),
    COLD=hexc(0x8f74c4),
    RUST=hexc(0x40184a),
    SHEEN=hexc(0xc7b2ea),
    SLAB=[hexc(0x302b38), hexc(0x2b2731), hexc(0x352f3d), hexc(0x2d2935), hexc(0x28242f)],
    MOSS=(hexc(0x170c22), hexc(0x2c1544), hexc(0x55307e)),
)
PALETTES = {'fosso': ABYSS_P, 'abismo': ABYSS_P}


def streaks(H, W, rng, cell=7, stretch=18):
    """Ruído de faixas em pé (água escorrendo): fino na horizontal, comprido na vertical."""
    h = H // stretch + 2
    n = value_noise(h, W, cell, rng, 2)
    n = ndi.zoom(n, (stretch, 1), order=1)[:H]
    return n.astype(np.float32)


def slab_band(col, band, dtop, xx, seed, P, depth, wet):
    """Lajes gastas do chão vistas de lado: o tampo com as juntas tortas e a quina molhada clara,
    a espessura da laje embaixo e um filete escuro entre as duas."""
    W = col.shape[1]
    rng = np.random.default_rng(seed + 61)
    edges = [-rng.uniform(0, 80)]
    while edges[-1] < W + 100:
        edges.append(edges[-1] + rng.uniform(48, 118))
    edges = np.array(edges, np.float32)
    # a junta inclina um pouco conforme desce (lajes assentadas tortas)
    lean = rng.uniform(-0.25, 0.25, len(edges)).astype(np.float32)
    xs = xx[0]
    k = np.clip(np.searchsorted(edges, xs, side='right') - 1, 0, len(edges) - 2)
    n = len(edges)
    pal = np.array(P['SLAB'], np.float32)[rng.integers(0, len(P['SLAB']), n)]
    tone = (1 + 0.12 * rng.normal(0, 1, n)).astype(np.float32)
    kk = np.broadcast_to(k[None, :], col.shape[:2])
    left = edges[kk] + lean[kk] * dtop
    right = edges[np.minimum(kk + 1, n - 1)] + lean[np.minimum(kk + 1, n - 1)] * dtop
    dj = np.minimum(xx - left, right - xx)
    top_h = depth * 0.55
    t = np.clip(dtop / top_h, 0, 1)
    c = pal[kk] * tone[kk][..., None]
    c = c * (1.12 - 0.25 * t)[..., None]
    # quina molhada e as poças paradas no tampo
    c = mix(c, P['SHEEN'], (sstep(1.3 * S, 0.2 * S, dtop) * 0.55)[..., None])
    pud = sstep(0.62, 0.7, wet) * (dtop < top_h)
    c = mix(c, P['SHEEN'] * 0.6, (pud * 0.25)[..., None])
    # juntas entre as lajes, com a borda lascada
    c = mix(c, P['ST_D'] * 1.6, (sstep(2.4, 0.6, dj) * 0.8)[..., None])
    c = mix(c, c * 1.25, (sstep(4.0, 2.4, dj) * sstep(0.6, 2.4, dj) * 0.3)[..., None])
    # a espessura da laje e o sulco embaixo do tampo
    f = np.clip((dtop - top_h) / (depth - top_h), 0, 1)
    face = c * (0.78 - 0.3 * f)[..., None]
    c = np.where((dtop < top_h)[..., None], c, face)
    c = mix(c, P['ST_D'], (np.exp(-((dtop - top_h) / 1.2) ** 2) * 0.7)[..., None])
    c = mix(c, c * 0.55, sstep(depth * 0.7, depth, dtop)[..., None])
    return np.where(band[..., None], c, col)


def iron_plates(col, iron, xx, yy, dleft, dright, dbot, seed, P, vstreak):
    """Paredes de ferro liso: uma chapa por tile, emenda escura, quatro rebites, o veio de lixa em
    pé, a faixa de brilho da água (de onde a luz vem) e ferrugem escorrendo dos rebites."""
    ID, IM, IL, IS = P['IRON']
    u = (xx % T) / T
    v = (yy % T) / T
    c = mix(ID, IM, (0.55 + 0.45 * np.sin(u * math.pi))[..., None])
    c = c * (0.86 + 0.28 * vstreak)[..., None]
    # brilho molhado em faixa vertical, mais forte perto da borda aberta
    gl = np.exp(-((u - 0.3) / 0.12) ** 2) * (0.55 + 0.45 * vstreak)
    c = mix(c, IL, (gl * 0.45)[..., None])
    open_side = np.exp(-np.minimum(dleft, dright) / (5 * S))
    c = mix(c, IS, (open_side * sstep(0.45, 0.9, vstreak) * 0.35)[..., None])
    # emendas das chapas
    seam = np.maximum(sstep(1.6, 0.4, np.minimum(xx % T, T - xx % T)), sstep(1.6, 0.4, np.minimum(yy % T, T - yy % T)))
    c = mix(c, P['ST_D'], (seam * 0.85)[..., None])
    # rebites: ponto claro com sombra embaixo, e a ferrugem descendo
    rust = np.zeros(col.shape[:2], np.float32)
    for rx, ry in ((0.16, 0.16), (0.84, 0.16), (0.16, 0.84), (0.84, 0.84)):
        dx = (u - rx) * T
        dy = (v - ry) * T
        r = np.hypot(dx, dy)
        c = mix(c, P['ST_D'], (sstep(2.6, 1.6, np.hypot(dx, dy - 1.0)) * 0.7)[..., None])
        c = mix(c, IS * 0.85, sstep(1.9, 0.9, r)[..., None])
        drip = sstep(1.6, 0.4, np.abs(dx + 0.3 * np.sin(dy * 0.4))) * (dy > 1.5) * np.exp(-np.maximum(dy, 0) / (6 * S))
        rust = np.maximum(rust, drip)
    c = mix(c, P['RUST'], (rust * 0.55)[..., None])
    c = mix(c, c * 0.6, (np.exp(-dbot / (6 * S)) * 0.5)[..., None])
    return np.where(iron[..., None], c, col)


def prison(room, extra=None, glass=None):
    """A pedra da prisão (ver o começo do arquivo)."""
    P = PALETTES.get(room.name, PRISON)
    seed = SEEDS[room.name]
    rf = np.random.default_rng(seed)
    H, W = room.H, room.W
    yy, xx = room.yy, room.xx
    course = 24
    # ---- campos que não dependem da máscara (iguais com e sem as passagens secretas)
    room.rng = np.random.default_rng(seed + 1)
    inv, u, v, dl, dr = masonry(room, course=course, wmin=36, wmax=92, wobble=2.4)
    n = inv.max() + 1
    kind = rf.choice(len(P['STONES']), n, p=[0.3, 0.24, 0.2, 0.14, 0.12])
    tone = (1 + 0.15 * np.clip(rf.normal(0, 1, n), -2, 2)).astype(np.float32)
    tilt = rf.uniform(-0.1, 0.1, n).astype(np.float32)
    fine = value_noise(H, W, 6, rf, 2)
    pits = value_noise(H, W, 3, rf, 1) > 0.8
    jv = value_noise(H, W, 60, rf, 2)
    flow = (value_noise(H, W, 40, rf, 2) - 0.5) * 0.35
    wet = value_noise(H, W, 30, rf, 2)
    drip = streaks(H, W, rf)
    vstreak = streaks(H, W, rf, cell=4, stretch=24)
    # ---- máscara: pedra e ferro liso são sólidos; o alçapão fica vazado
    sol_main = room.cells('#') | room.cells('+')
    sol = sol_main.copy()
    if extra is not None:
        sol |= extra
    if glass is not None:
        sol |= glass
    M = room.px(sol)
    M = chip(M, sol, seed, top_max=1.2, bot_max=4.0)
    d, dtop, dbot, dleft, dright = fields(M)
    iron = room.px(room.cells('+')) & M

    base = np.array(P['STONES'], np.float32)[kind][inv]
    col = base * (tone[inv] * (1 + tilt[inv] * (u - 0.5)))[..., None]
    col, joint = shade_masonry(col, u, v, dl, dr, course, top_k=0.5, bot_k=0.7, joint_col=P['MORTAR'], jvis=0.5 + 0.5 * sstep(0.3, 0.6, jv))
    col *= (1 + (fine - 0.5) * 0.22)[..., None]
    col *= (1 - 0.28 * pits)[..., None]
    # água escorrendo das bordas de cima: faixas escuras e esverdeadas que somem para baixo
    run = sstep(0.56, 0.74, drip) * (0.35 + 0.65 * np.exp(-dtop / (34 * S)))
    col = mix(col, P['DAMP'], (run * (0.8 if P is ABYSS_P else 0.55))[..., None])
    if P is ABYSS_P:
        # a borda roxa dos escorridos de tinta, onde a luz pega
        rim = sstep(0.52, 0.56, drip) * sstep(0.6, 0.56, drip) * np.exp(-dtop / (24 * S))
        col = mix(col, hexc(0x5a2a8e), (rim * 0.35)[..., None])
    # o miolo da parede afunda no escuro
    dt = d / T
    k = np.maximum(0.16, 1 - np.maximum(0, dt - 0.5) * 0.45)
    col = mix(P['ST_D'], col, k[..., None])
    # pouca luz de cima (é embaixo da terra), um frio fraco nas bordas e o escuro embaixo de tudo
    sky = np.exp(-dtop / (7 * S))
    col = mix(col, col * 1.3 + P['COLD'] * 0.06, (sky * 0.35)[..., None])
    side = np.exp(-np.minimum(dleft, dright) / (2.2 * S))
    col = mix(col, P['COLD'] * 0.8, (side * 0.14)[..., None])
    col *= (1 - 0.5 * np.exp(-dbot / (12 * S)))[..., None]

    # ---- topos: lajes em todos os pisos de pedra (o ferro liso não tem tampo)
    band = 9 * S
    top_slab = M & (dtop < band) & ~iron
    if top_slab.any():
        col = slab_band(col, top_slab, dtop, xx, seed, P, band, wet)
    # ---- ferro liso
    if iron.any():
        col = iron_plates(col, iron, xx, yy, dleft, dright, dbot, seed, P, vstreak)
    # velas, a chama dos descansos e a forja da sala da máscara
    col = lights(room, col, M, dtop, dleft, dright, 'CRO', P['WARM'], {'C': 66, 'R': 92, 'O': 54}, k=0.55)
    if room.spawn_px('n'):
        col = lights(room, col, M, dtop, dleft, dright, 'n', P['FORGE'], {'n': 170}, k=0.85, lift=20)
    col = np.clip(col, 0, 1)

    mask = M.astype(np.float32)
    L = Layer(W, H)
    L.fill(col, mask)
    near = (M & (d < 3.2 * T)).astype(np.float32)
    # as lajes e as chapas têm desenho próprio: as pinceladas quase não passam por cima
    strokes(L, col, near * (1 - top_slab * 0.85) * (1 - iron * 0.92), flow, np.random.default_rng(seed + 2), joint, big=7.0, small=3.4)
    room.rng = np.random.default_rng(seed + 3)
    moss(room, L, M & ~iron, dtop, P['MOSS'], seed, amount=0.22)
    room.rng = np.random.default_rng(seed + 4)
    planks(room, L, hexc(0x1a120c), hexc(0x392818), hexc(0x6a4c32), P['SHEEN'])
    room.rng = np.random.default_rng(seed + 5)
    spikes(room, L, hexc(0x0b0d12), hexc(0x2e3440), hexc(0x8a96aa), hexc(0x4a2a1e))
    return L, M


def paint_room(name, out):
    rows = load_maps()[name]
    t0 = time.time()
    room = Room(name, rows, seed=SEEDS[name])
    L, M = prison(room)
    L.image().save(f'{out}/terreno-{name}-2x.png')
    downsample(L, M, room).save(f'{out}/terreno-{name}.png')
    print(name, 'terreno', round(time.time() - t0, 1), 's', flush=True)
    groups = breakables(rows)
    if not groups:
        return
    extra = np.zeros((room.h, room.w), bool)
    for g in groups:
        for x, y in g['cells']:
            extra[y, x] = True
        for x, y in g['veil']:
            extra[y, x] = True
    full = Room(name, rows, seed=SEEDS[name])
    FL, FM = prison(full, extra=extra)
    for i, g in enumerate(groups):
        cracks(FL, room, g['cells'], SEEDS[name] * 50 + i, PRISON['ST_D'], PRISON['SHEEN'])
    # o véu cobre a passagem e o que muda em volta dela, sumindo aos poucos (como na cidade)
    sec = room.px(extra)
    holes = FM & ~M
    full_zone = ndi.binary_dilation(sec | holes, iterations=4)
    dist = ndi.distance_transform_edt(~sec)
    ramp = np.clip(1 - (dist - 6) / 50, 0, 1)
    a = np.maximum(full_zone.astype(np.float32), ramp ** 1.5) * FL.A
    SL = Layer(room.W, room.H)
    SL.P[:] = FL.color() * a[..., None]
    SL.A[:] = a
    SL.image().save(f'{out}/terreno-{name}-secret-2x.png')
    downsample_soft(SL, room).save(f'{out}/terreno-{name}-secret.png')
    print(name, 'véu', len(groups), 'grupos', round(time.time() - t0, 1), 's', flush=True)


if __name__ == '__main__':
    name = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hd')
    os.makedirs(out, exist_ok=True)
    paint_room(name, out)

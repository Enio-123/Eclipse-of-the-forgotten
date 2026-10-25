"""Terreno pintado da Cidade-Catedral: as salas de fora (tema 'city': praça, rua, telhados e
claustro) e as de dentro da catedral (tema 'nave': nave, galeria e altar).

Mesmo processo de terreno.py (máscara 2x do mapa, cor, luz, pinceladas e redução para os pixels
do jogo), com duas diferenças:
- os campos aleatórios (fiadas de pedra, ruído, paralelepípedos) vêm de geradores só deles ou de
  um sorteio fixo por posição, nunca da ordem em que a máscara é percorrida: a pintura com as
  passagens secretas fechadas sai com as mesmas pedras da pintura normal;
- as salas com paredes falsas ('%') ou vitrais ('V') ganham terreno-<sala>-secret.png: a pedra que
  cobre a passagem e o esconderijo (e o vitral inteiro), transparente no resto. O jogo recorta e
  põe por cima até o golpe quebrar (Fixtures.addWall).

uso: python3 cidade.py <sala> [pasta_hd]
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from brush import Layer, hexc, mix, sstep, blur, value_noise, paint
from terreno import Room, fields, masonry, planks, spikes, downsample, load_maps, TILE, S, T

SEEDS = {'praca': 21, 'rua': 23, 'telhados': 25, 'claustro': 27, 'nave': 31, 'galeria': 33, 'altar': 35}
THEME = {'praca': 'city', 'rua': 'city', 'telhados': 'city', 'claustro': 'city', 'nave': 'nave', 'galeria': 'nave', 'altar': 'nave'}
# o que cobre o chão mais baixo de cada sala (os outros topos viram cornija, ou telhado nos telhados)
FLOOR = {'praca': 'cobble', 'rua': 'cobble', 'telhados': 'slate', 'claustro': 'garden', 'nave': 'marble', 'galeria': 'marble', 'altar': 'marble'}


def hrand(*k):
    """Sorteio fixo 0..1 para uma chave (não depende da ordem dos pedidos)."""
    h = 2166136261
    for v in k:
        h = ((h ^ (int(v) & 0xffffffff)) * 16777619) & 0xffffffff
    h ^= h >> 13
    h = (h * 1274126177) & 0xffffffff
    h ^= h >> 16
    return h / 4294967296.0


# ---------------------------------------------------------------- passagens secretas
def breakables(rows):
    """O mesmo cálculo de src/world/secrets.ts: grupos de '%' ou 'V' e o esconderijo atrás de cada
    um (as células abertas que só se alcançam quebrando)."""
    h = len(rows)
    w = max(len(r) for r in rows)

    def ch(x, y):
        return rows[y][x] if 0 <= y < h and 0 <= x < len(rows[y]) else '.'

    def inside(x, y):
        return 0 <= x < w and 0 <= y < h

    def opn(x, y):
        return inside(x, y) and ch(x, y) not in '#%V'
    N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
    groups, taken = [], set()
    for y in range(h):
        for x in range(w):
            c = ch(x, y)
            if c not in '%V' or (x, y) in taken:
                continue
            cells, q = [], [(x, y)]
            taken.add((x, y))
            while q:
                cx, cy = q.pop()
                cells.append((cx, cy))
                for dx, dy in N4:
                    n = (cx + dx, cy + dy)
                    if inside(*n) and ch(*n) == c and n not in taken:
                        taken.add(n)
                        q.append(n)
            groups.append((c, cells))
    if not groups:
        return []
    seed = None
    for k in '1OP':
        for y in range(h):
            for x in range(w):
                if seed is None and ch(x, y) == k:
                    seed = (x, y)
        if seed:
            break
    main = set()
    if seed:
        q = [seed]
        main.add(seed)
        while q:
            cx, cy = q.pop()
            for dx, dy in N4:
                n = (cx + dx, cy + dy)
                if opn(*n) and n not in main:
                    main.add(n)
                    q.append(n)
    out = []
    for c, cells in groups:
        veil, seen = [], set()
        for gx, gy in cells:
            for dx, dy in N4:
                s = (gx + dx, gy + dy)
                if not opn(*s) or s in main or s in seen:
                    continue
                seen.add(s)
                q = [s]
                while q:
                    p = q.pop()
                    veil.append(p)
                    for ex, ey in N4:
                        n = (p[0] + ex, p[1] + ey)
                        if opn(*n) and n not in main and n not in seen:
                            seen.add(n)
                            q.append(n)
        out.append(dict(ch=c, cells=cells, veil=veil))
    return out


# ---------------------------------------------------------------- peças comuns
def chip(M, sol, seed, top_max=1.4, bot_max=5.0):
    """Lasca os cantos expostos (só para dentro, sem sair da caixa de colisão), com sorteio fixo."""
    h, w = sol.shape

    def s(x, y):
        return True if (x < 0 or x >= w or y < 0 or y >= h) else bool(sol[y, x])
    ys, xs = np.nonzero(sol)
    for y, x in zip(ys, xs):
        for k, (dx, dy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
            if s(x + dx, y) or s(x, y + dy) or hrand(seed, x, y, k, 1) < 0.25:
                continue
            top = dy < 0
            r = (0.6 + hrand(seed, x, y, k, 2) * ((top_max if top else bot_max) - 0.6)) * S
            cx = (x + (1 if dx > 0 else 0)) * T
            cy = (y + (1 if dy > 0 else 0)) * T
            x0, x1 = (int(cx - r), int(cx)) if dx > 0 else (int(cx), int(cx + r))
            y0, y1 = (int(cy - r), int(cy)) if dy > 0 else (int(cy), int(cy + r))
            yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1]
            d = np.abs(xx + 0.5 - cx) + np.abs(yy + 0.5 - cy)
            cut = d < r * (0.8 + 0.4 * hrand(seed, x, y, k, 3))
            yy, xx = yy[cut], xx[cut]
            ok = (yy >= 0) & (yy < M.shape[0]) & (xx >= 0) & (xx < M.shape[1])
            M[yy[ok], xx[ok]] = False
    return M


def voronoi(mask, cell, seed, stagger=0.5, jitter=(0.55, 0.45)):
    """Pedras arredondadas (paralelepípedos, lajes): id da pedra, distância à borda dela e posição
    dentro dela (-1..1) para cada pixel de `mask`."""
    H, W = mask.shape
    cw, chh = cell
    pts = []
    for j in range(-1, int(H / chh) + 3):
        for i in range(-1, int(W / cw) + 3):
            px = i * cw + (j % 2) * stagger * cw + (hrand(seed, i, j, 1) - 0.5) * cw * jitter[0]
            py = j * chh + (hrand(seed, i, j, 2) - 0.5) * chh * jitter[1]
            pts.append((px, py))
    pts = np.array(pts, np.float32)
    ys, xs = np.nonzero(mask)
    q = np.stack([xs + 0.5, ys + 0.5], 1).astype(np.float32)
    d, idx = cKDTree(pts).query(q, k=2)
    sid = np.full((H, W), -1, np.int64)
    edge = np.zeros((H, W), np.float32)
    ox = np.zeros((H, W), np.float32)
    oy = np.zeros((H, W), np.float32)
    sid[ys, xs] = idx[:, 0]
    edge[ys, xs] = (d[:, 1] - d[:, 0]) / 2
    c = pts[idx[:, 0]]
    ox[ys, xs] = (q[:, 0] - c[:, 0]) / (cw * 0.5)
    oy[ys, xs] = (q[:, 1] - c[:, 1]) / (chh * 0.5)
    return sid, edge, ox, oy


def tops(M, dtop, band):
    """Faixa de cima de cada piso (pedra com vazio logo acima), com a profundidade dentro dela."""
    return M & (dtop < band)


def floor_level(room):
    """Linha (em tiles) a partir da qual um topo conta como o chão mais baixo da sala."""
    return room.h - 6


def shade_masonry(col, u, v, dl, dr, course, top_k=0.55, bot_k=0.7, joint_col=None, jvis=None):
    ty = v * course
    by = (1 - v) * course
    top_b = sstep(4.0, 0.5, ty) * sstep(0.0, 2.0, np.minimum(dl, dr))
    bot_b = sstep(5.0, 0.5, by)
    col = mix(col, col * 1.4, (top_b * top_k)[..., None])
    col = mix(col, col * 0.55, (bot_b * bot_k)[..., None])
    col = mix(col, col * 0.75, (sstep(3.0, 0.5, dl) * 0.45)[..., None])
    joint = np.maximum(sstep(2.0, 0.4, np.minimum(ty, by)), sstep(1.8, 0.4, np.minimum(dl, dr)))
    if joint_col is not None:
        col = mix(col, joint_col, (joint * (jvis if jvis is not None else 1.0) * 0.88)[..., None])
    return col, joint


def strokes(L, col, mask, flow, rng, joint, big=7.0, small=3.6, glaze=22):
    passes = [
        dict(size=big, spacing=0.9, length=(1.6, 3.4), err=0.0, alpha=0.55, bristle=0.55, dry=0.45, blur=0.12, taper=0.35, ang_jitter=0.14),
        dict(size=small, spacing=0.95, length=(1.6, 3.2), err=0.0, alpha=0.6, bristle=0.5, dry=0.4, blur=0.06, taper=0.4, ang_jitter=0.2),
    ]
    paint(L, col, mask * (1 - joint * 0.9), flow, rng, passes, val_jitter=0.09, jitter=0.012, clip_soft=0, base=0.0)
    gl = [dict(size=glaze, spacing=1.1, length=(1.5, 3.0), err=0.0, alpha=0.2, bristle=0.5, dry=0.5, blur=0.6, taper=0.3, ang_jitter=0.3)]
    paint(L, col, mask, flow, rng, gl, val_jitter=0.14, jitter=0.02, clip_soft=0, base=0.0)


def lights(room, col, M, dtop, dleft, dright, kinds, warm, radius, k=0.6, lift=44):
    """Lampiões e velas esquentam a pedra perto (mais nas quinas viradas para a luz)."""
    yy, xx = room.yy, room.xx
    for (lx, ly, c) in room.spawn_px(kinds):
        cy = ly - (lift if c in 'L' else 12) * S
        r = np.hypot(xx - lx, (yy - cy) * 1.15)
        rad = radius.get(c, 80) * S
        near = np.exp(-np.minimum(dtop, np.minimum(dleft, dright)) / (12 * S))
        glow = np.exp(-(r / rad) ** 2) * (0.35 + 0.65 * near)
        col = mix(col, col * 0.45 + warm * 0.72, (glow * k)[..., None])
    return col


# ---------------------------------------------------------------- cidade (de fora)
CITY = dict(
    ST_D=hexc(0x06070c),
    STONES=[hexc(0x34343e), hexc(0x3b3739), hexc(0x30344a), hexc(0x403933), hexc(0x333a39)],
    PLASTER=hexc(0x4a4640),
    MORTAR=hexc(0x121319),
    COLD=hexc(0x8a9ac0),
    GOLD=hexc(0xe7a957),
    WARM=hexc(0xffa24a),
    SHEEN=hexc(0xc3cee0),
    COB=[hexc(0x4b4c57), hexc(0x56525a), hexc(0x44474f), hexc(0x5b5348), hexc(0x4e4f4a)],
    SLATE=[hexc(0x262a38), hexc(0x2c2f3d), hexc(0x232733), hexc(0x30303a)],
    MOSS=(hexc(0x1c2a1e), hexc(0x2e4228), hexc(0x56703a)),
    GRASS=(hexc(0x1d2c1c), hexc(0x2f4527), hexc(0x56703a), hexc(0x8aa45a)),
    GRAVEL=hexc(0x6e6a62),
)


def city(room, extra=None, glass=None):
    """Pedra de calcário da cidade: fachadas com janelas acesas, paralelepípedos molhados no chão
    da rua, telhas de ardósia nos telhados, cornijas e o jardim do claustro."""
    P = CITY
    seed = SEEDS[room.name]
    rf = np.random.default_rng(seed)
    H, W = room.H, room.W
    yy, xx = room.yy, room.xx
    course = 26
    # ---- campos que não dependem da máscara (iguais com e sem as passagens secretas)
    room.rng = np.random.default_rng(seed + 1)
    inv, u, v, dl, dr = masonry(room, course=course, wmin=40, wmax=104, wobble=2.6)
    n = inv.max() + 1
    kind = rf.choice(len(P['STONES']), n, p=[0.34, 0.22, 0.2, 0.14, 0.1])
    tone = (1 + 0.16 * np.clip(rf.normal(0, 1, n), -2, 2)).astype(np.float32)
    tilt = rf.uniform(-0.12, 0.12, n).astype(np.float32)
    fine = value_noise(H, W, 6, rf, 2)
    pits = value_noise(H, W, 3, rf, 1) > 0.82
    jv = value_noise(H, W, 60, rf, 2)
    plaster_n = value_noise(H, W, 90, rf, 2)
    flow = (value_noise(H, W, 40, rf, 2) - 0.5) * 0.4
    wet = value_noise(H, W, 30, rf, 2)
    # ---- máscara
    sol_main = room.cells('#')
    sol = sol_main.copy()
    if extra is not None:
        sol |= extra
    if glass is not None:
        sol |= glass
    M = room.px(sol)
    M = chip(M, sol, seed)
    d, dtop, dbot, dleft, dright = fields(M)

    base = np.array(P['STONES'], np.float32)[kind][inv]
    col = base * (tone[inv] * (1 + tilt[inv] * (u - 0.5)))[..., None]
    # reboco gasto por cima de algumas paredes (menos juntas aparecendo)
    plaster = sstep(0.62, 0.72, plaster_n)
    col = mix(col, P['PLASTER'] * (0.9 + 0.2 * fine[..., None]), (plaster * 0.7)[..., None])
    col, joint = shade_masonry(col, u, v, dl, dr, course, joint_col=P['MORTAR'], jvis=(0.4 + 0.6 * sstep(0.35, 0.6, jv)) * (1 - plaster * 0.75))
    col *= (1 + (fine - 0.5) * 0.24)[..., None]
    col *= (1 - 0.25 * pits)[..., None]
    # profundidade: fachadas escurecem para dentro, o chão some no escuro embaixo da rua
    street = floor_level(room) * T
    dt = d / T
    k_wall = np.maximum(0.32, 1 - np.maximum(0, dt - 0.6) * 0.3)
    k_ground = np.maximum(0.06, 1 - np.maximum(0, dt - 0.4) * 0.6)
    below = sstep(street - 0.5 * T, street + 1.5 * T, yy)
    k = mix(k_wall, k_ground, below)
    col = mix(P['ST_D'], col, k[..., None])
    # luz do céu de cima, contraluz dourada do eclipse do lado direito, fria do esquerdo
    sky = np.exp(-dtop / (8 * S))
    col = mix(col, col * 1.45 + P['COLD'] * 0.1, (sky * 0.45)[..., None])
    col = mix(col, P['GOLD'], (sstep(2.2 * S, 0.3 * S, dright) * 0.5 * (0.5 + 0.5 * sky))[..., None])
    col = mix(col, col + P['GOLD'] * 0.14, (np.exp(-dright / (9 * S)) * 0.45)[..., None])
    col = mix(col, P['COLD'], (sstep(1.8 * S, 0.3 * S, dleft) * 0.3)[..., None])
    col *= (1 - 0.5 * np.exp(-dbot / (14 * S)))[..., None]

    # ---- topos: paralelepípedos (rua), ardósia (telhados), jardim (claustro) ou cornija
    low = yy >= street - 0.5 * T
    floor_kind = FLOOR[room.name]
    band_cob = 11 * S
    top_cob = M & (dtop < band_cob) & low & (floor_kind == 'cobble')
    top_slate = M & (dtop < 16 * S) & (floor_kind == 'slate')
    top_garden = M & (dtop < 9 * S) & low & (floor_kind == 'garden')
    top_ledge = M & (dtop < 7 * S) & ~(top_cob | top_slate | top_garden)
    if top_cob.any():
        col = cobble_band(col, top_cob, dtop, band_cob, seed, P, wet)
    if top_slate.any():
        col = slate_band(col, top_slate, dtop, xx, seed, P, 16 * S)
    if top_garden.any():
        col = garden_band(col, top_garden, dtop, seed, P, 9 * S, fine)
    if top_ledge.any():
        col = cornice(col, top_ledge, dtop, P['STONES'][0] * 1.5, P['SHEEN'], P['ST_D'], 7 * S)
    # lampiões
    col = lights(room, col, M, dtop, dleft, dright, 'LC', P['WARM'], {'L': 70, 'C': 60})
    col = np.clip(col, 0, 1)

    mask = M.astype(np.float32)
    L = Layer(W, H)
    L.fill(col, mask)
    near = (M & (d < 3.2 * T)).astype(np.float32)
    # as pedras da rua e as telhas têm desenho próprio: as pinceladas não passam por cima
    strokes(L, col, near * (1 - (top_cob | top_slate) * 0.95), flow, np.random.default_rng(seed + 2), joint)
    # janelas nas fachadas grossas (a posição sai da sala sem as passagens: igual nas duas pinturas)
    windows(room, L, sol_main, street, seed, P)
    garden_tufts(room, L, M, dtop, top_garden, seed, P)
    room.rng = np.random.default_rng(seed + 3)
    moss(room, L, M, dtop, P['MOSS'], seed, amount=0.25)
    room.rng = np.random.default_rng(seed + 4)
    planks(room, L, hexc(0x1d130d), hexc(0x3e2a1c), hexc(0x74543a), P['SHEEN'])
    room.rng = np.random.default_rng(seed + 5)
    spikes(room, L, hexc(0x0d0f15), hexc(0x30364a), hexc(0x8d9ab4), hexc(0x4a2a1e))
    if glass is not None and glass.any():
        stained(room, L, glass, seed)
    return L, M


def cobble_band(col, band, dtop, depth, seed, P, wet):
    """Paralelepípedos molhados no chão da rua, maiores na frente (perto da borda de baixo da faixa)."""
    sid, edge, ox, oy = voronoi(band, (26, 14), seed + 11)
    n = int(sid.max()) + 2
    rng = np.random.default_rng(seed + 12)
    pal = np.array(P['COB'], np.float32)[rng.integers(0, len(P['COB']), n)]
    tone = (1 + 0.14 * rng.normal(0, 1, n)).astype(np.float32)
    s = np.maximum(sid, 0)
    c = pal[s] * tone[s][..., None]
    # cada pedra é abaulada: luz em cima à esquerda, sombra embaixo à direita
    bump = np.clip(1 - (ox ** 2 + oy ** 2), 0, 1)
    c = c * (0.75 + 0.45 * bump)[..., None]
    c = mix(c, c * 1.5 + P['SHEEN'] * 0.1, (sstep(0.2, -0.6, oy) * sstep(0.5, -0.4, ox) * 0.5)[..., None])
    c = mix(c, c * 0.5, (sstep(0.2, 0.9, oy) * 0.6)[..., None])
    # rejunte escuro entre as pedras e brilho de água nas poças
    gap = sstep(2.6, 0.6, edge)
    c = mix(c, P['ST_D'] * 1.4, (gap * 0.75)[..., None])
    puddle = sstep(0.62, 0.7, wet) * sstep(depth * 0.7, 0, dtop)
    c = mix(c, P['SHEEN'] * 0.7 + P['GOLD'] * 0.1, (puddle * bump * 0.35)[..., None])
    # quina de cima clara (a luz do céu na pedra molhada)
    c = mix(c, P['SHEEN'], (sstep(1.4 * S, 0.2 * S, dtop) * 0.6)[..., None])
    # embaixo da faixa a pedra afunda na terra
    c = mix(c, c * 0.6, sstep(depth * 0.6, depth, dtop)[..., None])
    return np.where(band[..., None], c, col)


def slate_band(col, band, dtop, xx, seed, P, depth):
    """Telhado de ardósia: fileiras de telhas com a ponta de baixo redonda, a cumeeira em cima."""
    th, tw = 7.0 * S, 11.0 * S
    r = np.floor(dtop / th)
    vv = (dtop - r * th) / th
    off = (r % 2) * tw * 0.5
    ci = np.floor((xx + off) / tw)
    uu = (xx + off - ci * tw) / tw
    rng = np.random.default_rng(seed + 21)
    key = (r.astype(np.int64) * 7919 + ci.astype(np.int64)) % 4096
    pal = np.array(P['SLATE'], np.float32)[rng.integers(0, len(P['SLATE']), 4096)]
    tone = (1 + 0.16 * rng.normal(0, 1, 4096)).astype(np.float32)
    c = pal[key] * tone[key][..., None]
    # ponta arredondada: a telha de baixo aparece entre as pontas da de cima
    curve = 0.62 + 0.38 * np.sqrt(np.clip(1 - (2 * uu - 1) ** 2, 0, 1))
    shadow = sstep(curve - 0.12, curve, vv)
    c = c * (1.25 - 0.45 * vv)[..., None]
    c = mix(c, P['ST_D'], (shadow * 0.75)[..., None])
    c = mix(c, c * 0.7, (sstep(0.06, 0.0, np.minimum(uu, 1 - uu)) * 0.6)[..., None])
    # cumeeira e a luz fria no alto do telhado
    c = mix(c, P['SHEEN'] * 0.8, (sstep(1.6 * S, 0.3 * S, dtop) * 0.6)[..., None])
    c = mix(c, c * 1.3 + P['GOLD'] * 0.08, (sstep(depth, 0, dtop) * 0.2)[..., None])
    c = mix(c, c * 0.55, sstep(depth * 0.7, depth, dtop)[..., None])
    return np.where(band[..., None], c, col)


def garden_band(col, band, dtop, seed, P, depth, fine):
    """Chão do claustro: terra escura com grama baixa por cima e cascalho claro aparecendo."""
    GD, GM, GL, GS = P['GRASS']
    g = mix(GD, GM, sstep(depth, 0, dtop)[..., None])
    g = mix(g, GL, (sstep(0.55, 0.85, fine) * sstep(depth * 0.5, 0, dtop))[..., None])
    g = mix(g, GS, (sstep(1.2 * S, 0, dtop) * 0.45)[..., None])
    grav = sstep(0.62, 0.7, fine) * sstep(depth * 0.3, depth * 0.9, dtop)
    g = mix(g, P['GRAVEL'], (grav * 0.6)[..., None])
    g = mix(g, g * 0.55, sstep(depth * 0.65, depth, dtop)[..., None])
    return np.where(band[..., None], g, col)


def cornice(col, band, dtop, stone, sheen, dark, depth):
    """Cornija: aresta clara em cima, um boleado com luz e um sulco escuro antes da parede."""
    t = dtop / depth
    c = stone * (1.15 - 0.4 * t)[..., None]
    c = mix(c, sheen, (sstep(0.22, 0.04, t) * 0.75)[..., None])
    c = mix(c, c * 1.25, (np.exp(-((t - 0.45) / 0.14) ** 2) * 0.6)[..., None])
    c = mix(c, dark, (np.exp(-((t - 0.85) / 0.08) ** 2) * 0.85)[..., None])
    return np.where(band[..., None], c, col)


def windows(room, L, sol, street, seed, P):
    """Janelas em arco nas fachadas grossas: acesas (vidro quente com chumbo e um brilho na parede em
    volta), escuras (reflexo frio), de venezianas fechadas ou tapadas com tábuas. Cada uma tem
    moldura, pedra de fecho e peitoril. Ficam fora de alcance da física: só pintura."""
    Hh, Ww = sol.shape
    din = ndi.distance_transform_edt(np.pad(sol, 1, constant_values=True))[1:-1, 1:-1]
    for ty in range(1, Hh - 3, 6):
        for tx in range(1, Ww - 1, 5):
            if hrand(seed, tx, ty, 7) < 0.2:
                continue
            # a janela ocupa 1 x 2 tiles; precisa de pedra em volta
            if not (din[ty, tx] > 2.4 and din[ty + 1, tx] > 2.4 and din[ty + 2, tx] > 1.4):
                continue
            if (ty + 2) * T > street - T:
                continue
            cx = (tx + 0.5) * T + (hrand(seed, tx, ty, 8) - 0.5) * 8
            top = ty * T + 6
            k = hrand(seed, tx, ty, 9)
            kind = 'lit' if k < 0.42 else 'dark' if k < 0.7 else 'shut' if k < 0.88 else 'board'
            window(L, cx, top, 13.0 * S, 25.0 * S, kind, P, int(hrand(seed, tx, ty, 10) * 1e6))


def window(L, cx, top, w, h, kind, P, wseed):
    rng = np.random.default_rng(wseed)
    x0, x1 = max(0, int(cx - w * 1.9)), min(L.W, int(cx + w * 1.9))
    y0, y1 = max(0, int(top - h * 0.75)), min(L.H, int(top + h * 1.6))
    P_ = L.P[y0:y1, x0:x1]
    A_ = L.A[y0:y1, x0:x1]
    if not (A_ > 0.5).all():
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    yy += 0.5
    xx += 0.5
    rx = w / 2
    spring = top + rx
    dx = xx - cx

    def arch(r, bottom):
        """Alfa suave de um vão em arco de meia largura r, do topo até `bottom`."""
        dside = r - np.abs(dx)
        darc = r - np.hypot(dx, yy - spring)
        d = np.where(yy > spring, dside, np.minimum(dside, darc))
        d = np.minimum(d, bottom - yy)
        return np.clip(d + 0.5, 0, 1)
    cur = P_ / np.maximum(A_[..., None], 1e-4)
    stone = P['STONES'][0] * 1.2
    hole = arch(rx, top + h)
    frame = arch(rx + 3.5, top + h + 1)
    sill = np.clip(np.minimum(rx + 6 - np.abs(dx), np.minimum(yy - (top + h - 0.5), top + h + 5 - yy)) + 0.5, 0, 1)
    WARM, WARM2, WARM3 = hexc(0xc8652a), hexc(0xffb860), hexc(0xffe4a8)
    out = cur.copy()
    if kind == 'lit':
        # a luz de dentro vaza na parede em volta
        glow = np.exp(-(np.hypot(dx, (yy - top - h * 0.5) * 0.8) / (w * 0.95)) ** 2)
        out = mix(out, out * 0.6 + WARM * 0.5, (glow * 0.4)[..., None])
    # moldura de pedra lisa com luz em cima e sombra do lado direito
    fcol = mix(stone, stone * 1.25, sstep(spring + 4, spring - rx, yy)[..., None])
    fcol = mix(fcol, stone * 0.7, sstep(rx - 2, rx + 3.5, dx)[..., None])
    out = mix(out, fcol, frame[..., None])
    # pedra de fecho no alto do arco
    key = np.clip(np.minimum(np.minimum(3.2 + (yy - (top - 4)) * 0.25 - np.abs(dx), yy - (top - 5)), top + 4 - yy) + 0.5, 0, 1)
    out = mix(out, stone * 1.35, key[..., None])
    # peitoril: aresta clara em cima e sombra embaixo dele
    scol = mix(stone * 1.45, stone * 0.8, sstep(top + h, top + h + 5, yy)[..., None])
    out = mix(out, scol, sill[..., None])
    under = np.clip(np.minimum(rx + 5 - np.abs(dx), 1.0) + 0.5, 0, 1) * sstep(top + h + 5, top + h + 6, yy) * sstep(top + h + 13, top + h + 6, yy)
    out = mix(out, out * 0.55, (under * 0.7)[..., None])
    # vidro (ou o que tapa a janela)
    v = (yy - top) / h
    if kind == 'lit':
        g = np.clip(1 - np.hypot(dx / rx, (yy - (top + h * 0.6)) / (h * 0.55)), 0, 1)
        glass = mix(WARM, WARM2, g[..., None])
        glass = mix(glass, WARM3, (g ** 3 * 0.6)[..., None])
    elif kind == 'dark':
        glass = mix(hexc(0x0d1220), hexc(0x1b2438), v[..., None])
        streak = np.exp(-(((dx + (yy - top) * 0.55) - rx * 0.1) / 2.2) ** 2) * sstep(0.1, 0.4, v) * sstep(0.95, 0.6, v)
        glass = mix(glass, P['SHEEN'] * 0.6, (streak * 0.35)[..., None])
    elif kind == 'shut':
        wood = hexc(0x3a2617) * (0.85 + 0.3 * rng.random())
        plank = (np.abs(((dx + rx) % 4.0) - 2.0) < 0.5)
        glass = mix(wood, wood * 0.55, plank[..., None].astype(np.float32))
        glass = mix(glass, wood * 1.4, (sstep(1.5, 0.0, np.abs(yy - (top + h * 0.62))) * 0.8)[..., None])
        glass = mix(glass, hexc(0x0a0806), sstep(1.2, 0.2, np.abs(dx))[..., None])
        glass = mix(glass, glass * 0.6, sstep(spring - 2, spring - rx, yy)[..., None])
    else:
        glass = np.broadcast_to(hexc(0x0b0c12), out.shape).copy()
        for i in range(3):
            yc = top + h * (0.3 + 0.24 * i) + rng.normal(0, 1.5)
            ang = rng.normal(0, 0.18)
            band = np.abs((yy - yc) - dx * math.tan(ang)) < 2.2
            glass = np.where(band[..., None], hexc(0x2f2016) * (0.9 + 0.25 * rng.random()), glass)
    if kind in ('lit', 'dark'):
        # chumbo: travessa no meio, montante vertical e uma faixa no arranque do arco
        lead = (sstep(1.1, 0.4, np.abs(dx)) + sstep(1.1, 0.4, np.abs(yy - (top + h * 0.58))) + sstep(1.0, 0.3, np.abs(yy - spring)))
        glass = mix(glass, hexc(0x1a120c), np.clip(lead, 0, 1)[..., None])
    # sombra do vão em cima (a parede é grossa)
    glass = mix(glass, glass * 0.55, (sstep(top + rx * 0.6, top - 1, yy) * 0.7)[..., None])
    out = mix(out, glass, hole[..., None])
    P_[:] = np.clip(out, 0, 1) * A_[..., None]


def garden_tufts(room, L, M, dtop, band, seed, P):
    """Grama do claustro saindo da borda de cima (pode passar 2 pixels acima da terra)."""
    if not band.any():
        return
    GD, GM, GL, GS = P['GRASS']
    up = M.copy()
    up[:-4] |= M[4:]
    clip = up.astype(np.float32)
    edge = band & (dtop < 1.5)
    ys, xs = np.nonzero(edge[:, ::2])
    xs = xs * 2
    rng = np.random.default_rng(seed + 31)
    keep = rng.random(len(xs)) < 0.55
    for y, x in zip(ys[keep], xs[keep]):
        ln = rng.uniform(3, 8) * S
        ang = -math.pi / 2 + rng.normal(0, 0.35)
        c = mix(GM, GL, rng.random()) if rng.random() < 0.7 else mix(GL, GS, rng.random())
        L.stroke(x + math.cos(ang) * ln * 0.4, y + 2 * S + math.sin(ang) * ln * 0.4, ang, ln, rng.uniform(0.8, 1.4) * S, c, 0.9, rng,
                 0.2, 0.1, taper=0.9, clip=clip)


def moss(room, L, M, dtop, cols, seed, amount=0.45):
    """Musgo nas quinas de cima, com o mesmo sorteio nas duas pinturas (por posição)."""
    MD, MM, ML = cols
    up = M.copy()
    up[:-2] |= M[2:]
    clip = up.astype(np.float32)
    H, W = M.shape
    edge = M & (dtop < 1.5)
    ys, xs = np.nonzero(edge[:, ::2])
    xs = xs * 2
    dens = value_noise(H, W, 46, np.random.default_rng(seed + 41), 2)
    for y, x in zip(ys, xs):
        if dens[y, x] < 0.55 or hrand(seed, x, y, 51) > amount:
            continue
        rng = np.random.default_rng((seed * 100003 + int(y) * 9176 + int(x)) & 0x7fffffff)
        ln = rng.uniform(3, 8) * S
        L.stroke(x + rng.normal(0, 2), y + rng.uniform(1.0, 3.0) * S, rng.normal(0, 0.25), ln, rng.uniform(1.4, 2.8) * S,
                 mix(MD, MM, rng.random() * 0.7), 0.9, rng, 0.45, 0.3, taper=0.6, clip=clip)
        if rng.random() < 0.4:
            L.stroke(x + rng.normal(0, 2), y + rng.uniform(0.2, 1.0) * S, rng.normal(0, 0.3), rng.uniform(2, 4) * S, rng.uniform(0.8, 1.3) * S,
                     mix(MM, ML, rng.random()), 0.85, rng, 0.3, 0.2, taper=0.7, clip=clip)


# ---------------------------------------------------------------- catedral (de dentro)
NAVE = dict(
    ST_D=hexc(0x05060b),
    STONES=[hexc(0x4a4852), hexc(0x534e52), hexc(0x454a58), hexc(0x56504a), hexc(0x4c4f50)],
    MORTAR=hexc(0x16161d),
    COLD=hexc(0x8fa0cc),
    WARM=hexc(0xffa64e),
    GOLD=hexc(0xd9a54e),
    SHEEN=hexc(0xd8dce8),
    MARBLE_D=hexc(0x34303b),
    MARBLE_L=hexc(0x9e989b),
    VEIN=hexc(0x6a6470),
)


def nave(room, extra=None, glass=None):
    """Calcário claro da catedral em blocos grandes, piso de mármore em xadrez, cornijas com friso
    de ouro, luz fria das janelas e quente das velas."""
    P = NAVE
    seed = SEEDS[room.name]
    rf = np.random.default_rng(seed)
    H, W = room.H, room.W
    yy, xx = room.yy, room.xx
    course = 34
    room.rng = np.random.default_rng(seed + 1)
    inv, u, v, dl, dr = masonry(room, course=course, wmin=56, wmax=132, wobble=1.6)
    n = inv.max() + 1
    kind = rf.choice(len(P['STONES']), n, p=[0.34, 0.22, 0.2, 0.14, 0.1])
    tone = (1 + 0.12 * np.clip(rf.normal(0, 1, n), -2, 2)).astype(np.float32)
    tilt = rf.uniform(-0.08, 0.08, n).astype(np.float32)
    fine = value_noise(H, W, 7, rf, 2)
    jv = value_noise(H, W, 70, rf, 2)
    flow = (value_noise(H, W, 40, rf, 2) - 0.5) * 0.3
    veins = value_noise(H, W, 14, rf, 3)
    sol_main = room.cells('#')
    sol = sol_main.copy()
    if extra is not None:
        sol |= extra
    if glass is not None:
        sol |= glass
    M = room.px(sol)
    M = chip(M, sol, seed, top_max=1.0, bot_max=3.0)
    d, dtop, dbot, dleft, dright = fields(M)

    base = np.array(P['STONES'], np.float32)[kind][inv]
    col = base * (tone[inv] * (1 + tilt[inv] * (u - 0.5)))[..., None]
    col, joint = shade_masonry(col, u, v, dl, dr, course, top_k=0.45, bot_k=0.55, joint_col=P['MORTAR'], jvis=0.45 + 0.55 * sstep(0.3, 0.6, jv))
    col *= (1 + (fine - 0.5) * 0.18)[..., None]
    # o miolo da parede afunda no azul escuro
    dt = d / T
    k = np.maximum(0.2, 1 - np.maximum(0, dt - 0.5) * 0.42)
    col = mix(P['ST_D'], col, k[..., None])
    # luz fria das janelas de cima e das bordas, quente embaixo perto do chão
    sky = np.exp(-dtop / (7 * S))
    col = mix(col, col * 1.4 + P['COLD'] * 0.12, (sky * 0.45)[..., None])
    side = np.exp(-np.minimum(dleft, dright) / (2.2 * S))
    col = mix(col, P['COLD'], (side * 0.2)[..., None])
    col *= (1 - 0.5 * np.exp(-dbot / (12 * S)))[..., None]

    street = floor_level(room) * T
    low = yy >= street - 0.5 * T
    band_m = 9 * S
    top_marble = M & (dtop < band_m) & low
    top_ledge = M & (dtop < 7 * S) & ~top_marble
    if top_marble.any():
        col = marble_band(col, top_marble, dtop, xx, veins, P, band_m)
    if top_ledge.any():
        col = cornice(col, top_ledge, dtop, P['STONES'][0] * 1.45, P['SHEEN'], P['ST_D'], 7 * S)
        trim = top_ledge & (np.abs(dtop - 7 * S * 0.62) < 1.1)
        col = np.where(trim[..., None], P['GOLD'] * (0.95 + 0.1 * fine[..., None]), col)
    col = lights(room, col, M, dtop, dleft, dright, 'CRm', P['WARM'], {'C': 74, 'R': 96, 'm': 70})
    col = np.clip(col, 0, 1)
    mask = M.astype(np.float32)
    L = Layer(W, H)
    L.fill(col, mask)
    near = (M & (d < 3.2 * T)).astype(np.float32)
    strokes(L, col, near * (1 - top_marble * 0.85), flow, np.random.default_rng(seed + 2), joint, big=8.0, small=4.0)
    room.rng = np.random.default_rng(seed + 4)
    planks(room, L, hexc(0x1d130d), hexc(0x40291a), hexc(0x7a5838), P['SHEEN'])
    room.rng = np.random.default_rng(seed + 5)
    spikes(room, L, hexc(0x0d0f15), hexc(0x3c4254), hexc(0xc2cad8), hexc(0x5a3a1e))
    if glass is not None and glass.any():
        stained(room, L, glass, seed)
    return L, M


def marble_band(col, band, dtop, xx, veins, P, depth):
    """Piso de mármore visto de lado: o tampo em xadrez (claro e escuro, com veios e o brilho do
    salão na aresta) e embaixo a espessura lisa da laje, com um filete escuro entre os dois."""
    slab = 16 * S
    ci = np.floor(xx / slab).astype(np.int64)
    light = (ci % 2) == 0
    top_h = depth * 0.5
    t = dtop / top_h
    surf = np.where(light[..., None], P['MARBLE_L'], P['MARBLE_D'])
    vein = sstep(0.48, 0.5, veins) * sstep(0.53, 0.5, veins)
    surf = mix(surf, np.where(light[..., None], P['VEIN'], P['MARBLE_L'] * 0.55), (vein * 0.45)[..., None])
    surf = surf * (1.08 - 0.2 * t)[..., None]
    surf = mix(surf, P['SHEEN'], (sstep(0.3, 0.0, t) * 0.5)[..., None])
    surf = mix(surf, P['ST_D'], (((xx % slab) < 1.2) * 0.45)[..., None])
    f = np.clip((dtop - top_h) / (depth - top_h), 0, 1)
    face = P['STONES'][0] * 1.25 * (1.2 - 0.55 * f)[..., None]
    face = mix(face, P['SHEEN'] * 0.75, (sstep(0.25, 0.0, f) * 0.45)[..., None])
    c = np.where((dtop < top_h)[..., None], surf, face)
    c = mix(c, P['ST_D'], (np.exp(-((dtop - top_h) / 1.1) ** 2) * 0.75)[..., None])
    c = mix(c, P['ST_D'] * 1.5, (np.exp(-((dtop - depth) / 2.0) ** 2) * 0.6)[..., None])
    return np.where(band[..., None], c, col)


# ---------------------------------------------------------------- vitral (só na camada do véu)
GLASS = [hexc(0x2a4e9a), hexc(0x9c2a2c), hexc(0xc99a3a), hexc(0x2f7a4a), hexc(0x5a3a8a)]


def stained(room, L, glass, seed):
    """Vitral nas células 'V': moldura de pedra com o alto em arco quebrado, vidro frio aceso por
    trás (mais claro no meio), alguns vidros de cor e o chumbo escuro em losangos."""
    lab, n = ndi.label(glass)
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        x0, x1 = xs.min() * T, (xs.max() + 1) * T
        y0, y1 = ys.min() * T, (ys.max() + 1) * T
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32) + 0.5
        cx = (x0 + x1) / 2
        w = (x1 - x0) - 9
        r = 0.8 * w
        off = r - w / 2
        spring = y0 + 4 + math.sqrt(r * r - off * off)
        d1 = np.hypot(xx - (cx - off), yy - spring) - r
        d2 = np.hypot(xx - (cx + off), yy - spring) - r
        arch = np.maximum(np.maximum(d1, d2), yy - spring - 0.5)
        body = np.maximum(np.abs(xx - cx) - w / 2, np.maximum(spring - yy, yy - (y1 - 5)))
        hole = np.clip(0.5 - np.minimum(arch, body), 0, 1)
        lum = np.clip(1 - np.abs(xx - cx) / (w * 0.75), 0, 1) * np.clip(1 - np.abs(yy - (y0 + y1) / 2) / ((y1 - y0) * 0.62), 0, 1)
        gl = mix(hexc(0x2c4478), hexc(0xa8bfe8), (lum ** 0.8)[..., None])
        s = 5.0 * S
        a = (xx - cx + yy) / s
        b = (xx - cx - yy) / s
        ia, ib = np.floor(a), np.floor(b)
        key = ((ia.astype(np.int64) * 92821) ^ (ib.astype(np.int64) * 68917) ^ seed) & 0xffff
        tint = np.array(GLASS, np.float32)[key % len(GLASS)]
        pick = ((key // 7) % 4 == 0)
        gl = np.where(pick[..., None], mix(gl, tint * (0.7 + 0.6 * lum[..., None]), 0.55), gl)
        fa, fb = a - ia, b - ib
        lead = sstep(0.1, 0.04, np.minimum(np.minimum(fa, 1 - fa), np.minimum(fb, 1 - fb)))
        gl = mix(gl, hexc(0x0b0a10), (lead * 0.85)[..., None])
        stone = mix(hexc(0x5a5864), hexc(0x3a3a46), sstep(x0, x1, xx)[..., None])
        edge_d = np.minimum(arch, body)
        stone = mix(stone, hexc(0x14141c), np.clip(1.5 - np.abs(edge_d + 1.0), 0, 1)[..., None] * 0.8)
        c = mix(stone, gl, hole[..., None])
        m = np.zeros((room.H, room.W), np.float32)
        m[y0:y1, x0:x1] = 1
        full = np.zeros((room.H, room.W, 3), np.float32)
        full[y0:y1, x0:x1] = np.clip(c, 0, 1)
        L.fill(full, m)


# ---------------------------------------------------------------- sala inteira (terreno e véu)
def cracks(L, room, cells, seed, col_dark, col_light):
    """Rachaduras finas na parede falsa (só na pintura fechada): o jogador atento percebe."""
    if not cells:
        return
    xs = [c[0] for c in cells]
    ys = [c[1] for c in cells]
    gx0, gx1 = min(xs) * T, (max(xs) + 1) * T
    gy0, gy1 = min(ys) * T, (max(ys) + 1) * T
    rng = np.random.default_rng(seed)
    n = 2 + len(cells) // 6
    yy, xx = np.mgrid[gy0:gy1, gx0:gx1].astype(np.float32)
    dark = np.zeros(yy.shape, np.float32)
    light = np.zeros(yy.shape, np.float32)
    for _ in range(n):
        x, y = rng.uniform(gx0 + 6, gx1 - 6), rng.uniform(gy0 + 6, gy1 - 6)
        ang = rng.uniform(0, 2 * math.pi)
        for _ in range(rng.integers(3, 6)):
            ln = rng.uniform(9, 18)
            nx, ny = x + math.cos(ang) * ln, y + math.sin(ang) * ln
            # distância até o segmento
            px, py = xx - x, yy - y
            sx, sy = nx - x, ny - y
            t = np.clip((px * sx + py * sy) / max(sx * sx + sy * sy, 1e-4), 0, 1)
            dd = np.hypot(px - t * sx, py - t * sy)
            dark = np.maximum(dark, sstep(1.3, 0.4, dd))
            light = np.maximum(light, sstep(1.2, 0.3, np.hypot(px - t * sx, py - t * sy - 1.6)))
            x, y = nx, ny
            ang += rng.normal(0, 0.4)
    light *= 1 - dark
    P_ = L.P[gy0:gy1, gx0:gx1]
    A_ = L.A[gy0:gy1, gx0:gx1]
    cur = P_ / np.maximum(A_[..., None], 1e-4)
    cur = mix(cur, col_dark, (dark * 0.6)[..., None])
    cur = mix(cur, cur * 1.25 + col_light * 0.08, (light * 0.45)[..., None])
    P_[:] = cur * A_[..., None]


def downsample_soft(L, room):
    """Como downsample, mas o alfa fica suave (o véu se mistura com a pedra em volta)."""
    W1, H1 = room.W // S, room.H // S
    a = L.A
    pm = L.P.reshape(H1, S, W1, S, 3).mean((1, 3))
    am = a.reshape(H1, S, W1, S).mean((1, 3))
    rgb = pm / np.maximum(am[..., None], 1e-4)
    out = np.dstack([np.clip(rgb, 0, 1), np.clip(am, 0, 1)])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def paint_room(name, out):
    rows = load_maps()[name]
    painter = city if THEME[name] == 'city' else nave
    t0 = time.time()
    room = Room(name, rows, seed=SEEDS[name])
    L, M = painter(room)
    L.image().save(f'{out}/terreno-{name}-2x.png')
    downsample(L, M, room).save(f'{out}/terreno-{name}.png')
    print(name, 'terreno', round(time.time() - t0, 1), 's', flush=True)
    groups = breakables(rows)
    if not groups:
        return
    extra = np.zeros((room.h, room.w), bool)
    glass = np.zeros_like(extra)
    for g in groups:
        for x, y in g['cells']:
            (glass if g['ch'] == 'V' else extra)[y, x] = True
        for x, y in g['veil']:
            extra[y, x] = True
    full = Room(name, rows, seed=SEEDS[name])
    FL, FM = painter(full, extra=extra, glass=glass)
    pal = CITY if THEME[name] == 'city' else NAVE
    for i, g in enumerate(groups):
        if g['ch'] == '%':
            cracks(FL, room, g['cells'], SEEDS[name] * 50 + i, pal['ST_D'], pal['SHEEN'])
    # o véu cobre a passagem e tudo o que a pintura aberta mostra de diferente em volta dela (a luz
    # nas bordas da passagem, as quinas lascadas): cheio perto, sumindo até 28 pixels do jogo
    sec = room.px(extra | glass)
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

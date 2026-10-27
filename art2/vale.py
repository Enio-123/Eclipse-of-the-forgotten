"""Vale das Cachoeiras (capítulo 6): o terreno pintado das oito salas e a camada da vegetação, já no EXTREME.

Terreno: arenito quente em camadas (as linhas de estratificação, a estratificação cruzada dentro de cada
camada, as juntas verticais, os buraquinhos da erosão), com o tapete de grama e a terra escura por baixo
em todo chão que vê o céu. Na beira da água o chão vira areia (molhada perto da linha d'água); embaixo da
água, o leito com seixos e limo. As paredes '+' são pedra escura lisa e molhada (a água escorre por
elas, por isso a garra escorrega). Nas Cachoeiras o paredão é de basalto em colunas, com musgo; na gruta
o arenito é escuro e úmido; a moldura do rio e a escada do cais são de cantaria (pedra lavrada). No alto
da Descida, que vem da Floresta Nevada, ainda tem neve.

Vegetação (pinhos-<sala>, atrás do cavaleiro): as árvores de flor ('T') com o tronco do chão até o alto,
os galhos de verdade ('-') saindo do tronco (o topo da madeira é o topo da física) e a copa de flor rosa;
as árvores pequenas ('t'); as passarelas de tábua dos vãos soltos ('-' sem tronco), presas no paredão
com mão-francesa ou em postes até o chão (o trapiche do cais com os postes dentro da água), com a ponta
quebrada onde a ponte caiu; a grama alta e as flores do campo no chão, os juncos na beira da água, as
samambaias na pedra molhada e as raízes penduradas embaixo das bordas.

As copas das árvores dos trechos do presente (o cinza da memória as alcança) saem à parte, em
flores-<sala>-<n>.png (2x, recortadas em volta da árvore), para o jogo apagar quando o cinza chega.

uso: python3 vale.py <sala> [pasta] [--only=terreno|pinhos]
Sai <pasta>/terreno-<sala>-2x.png e terreno-<sala>.png (1x, alfa exato da física), pinhos-<sala>-2x.png
e pinhos-<sala>.png (1x, alfa suave) e as flores à parte.
"""
import math
import os
import sys
import time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from brush import Layer, hexc, mix, sstep, value_noise, paint
import terreno
from terreno import Room, fields, downsample, S, T, PLANK_H
from floresta import Box, chip, exposure, joints, stretched_noise, spans, downsample_soft, SNOW_L, SNOW_M, SNOW_S, SPARK

HERE = os.path.dirname(os.path.abspath(__file__))
ONLY = next((a[7:] for a in sys.argv if a.startswith('--only=')), None)
SEEDS = {'descida': 201, 'prado': 203, 'riacho': 205, 'cachoeiras': 207, 'gruta': 209, 'prainha': 211, 'rio': 213, 'cais': 215}
SOLID = '#+'
# os trechos do presente com árvore (a copa sai à parte): sala -> retângulos em tiles (x0, y0, x1, y1)
PRESENT = {'prado': [(62, 0, 92, 41)]}

# arenito: creme, pêssego, ferrugem, vinho (camadas), o fundo escuro do miolo e as fendas
SANDS = [hexc(0xc98d63), hexc(0xb47354), hexc(0xd9a57a), hexc(0x9c5c48), hexc(0xc28466), hexc(0x8a5a52)]
SAND_DEEP, SAND_CRACK = hexc(0x2c1e24), hexc(0x24161a)
# grama, terra, areia, leito
GD, GM, GL, GS = hexc(0x24452a), hexc(0x3f7535), hexc(0x79b04e), hexc(0xd9e07c)
MOSS_D, MOSS_M, MOSS_L = hexc(0x1f3a26), hexc(0x355f34), hexc(0x6d9a48)
LOAM = [hexc(0x35251f), hexc(0x452f25), hexc(0x2a1d19)]
ROOT = hexc(0x6a4a36)
BEACH_L, BEACH_M, BEACH_W = hexc(0xe9c99c), hexc(0xd2a87c), hexc(0x8e6a52)
BED_D, BED_M, PEBBLE, ALGA = hexc(0x3b302c), hexc(0x5e4c3e), hexc(0x9a8a74), hexc(0x415a37)
# pedra molhada, basalto, cantaria
WET_D, WET_M, WET_L, FILM = hexc(0x161b1f), hexc(0x2c3638), hexc(0x56645f), hexc(0xd8ecf2)
BAS_D, BAS_M, BAS_L = hexc(0x1c1f22), hexc(0x3a3f3e), hexc(0x7d776b)
STONES = [hexc(0x8c7b6c), hexc(0x9d8a78), hexc(0x7a6a5c), hexc(0xa8957f), hexc(0x6f6256)]
MORTAR = hexc(0x2a221f)
# madeira, flor e folha
BARK_D, BARK_M, BARK_L = hexc(0x2a1b18), hexc(0x4e3428), hexc(0x86604a)
WOOD_D, WOOD_M, WOOD_L = hexc(0x2e2018), hexc(0x5a4030), hexc(0x9a7656)
ROPE = hexc(0xb79a6c)
PINK_D, PINK_M, PINK_L, PINK_H = hexc(0xb2577a), hexc(0xe48aac), hexc(0xf6b6cd), hexc(0xffe6ef)
LEAF_D, LEAF_M, LEAF_L = hexc(0x26442a), hexc(0x3f6e36), hexc(0x7fae52)
FLOWERS = [hexc(0xfff4e6), hexc(0xffd84a), hexc(0xf7a8c4), hexc(0xb9a2e8), hexc(0xff9a5a), hexc(0xfff4e6)]
REED_D, REED_M, REED_L, CATTAIL = hexc(0x3d5a2e), hexc(0x6f8a45), hexc(0xb6c27a), hexc(0x5a3524)


def materials(room):
    """Material de cada célula: 0 arenito, 1 pedra molhada ('+'), 2 cantaria, 3 basalto, 4 arenito da gruta."""
    g = room.g
    mat = np.zeros(g.shape, np.int8)
    if room.name == 'cachoeiras':
        mat[:] = 3
    elif room.name == 'gruta':
        mat[:] = 4
    elif room.name == 'rio':
        mat[6:34, 96:148] = 2
    elif room.name == 'cais':
        mat[25:32, 86:] = 2
    mat[g == '+'] = 1
    return mat


# ======================================================================================
# terreno
# ======================================================================================
def terrain(room):
    rng = room.rng
    H, W = room.H, room.W
    yy, xx = room.yy, room.xx
    sol = np.isin(room.g, list(SOLID))
    M = room.px(sol)
    M = chip(room, M, sol, top_max=2.2, bot_max=6.0)
    d, dtop, dbot, dleft, dright = fields(M)
    mat = np.kron(materials(room), np.ones((T, T), np.int8))
    water = room.px(room.g == '~')
    dw = ndi.distance_transform_edt(~water).astype(np.float32) if water.any() else np.full((H, W), 1e6, np.float32)

    # ---- arenito: camadas onduladas, estratificação cruzada, juntas, erosão ----
    warp = (value_noise(H, W, 260, rng, 2) - 0.5) * 18 * S
    yb = yy + warp + xx * rng.uniform(-0.035, 0.035)
    bh = rng.uniform(10, 14) * S
    band = np.floor(yb / bh).astype(np.int64)
    band -= band.min()
    nb = int(band.max()) + 1
    kind = rng.choice(len(SANDS), nb, p=[0.26, 0.2, 0.16, 0.14, 0.14, 0.1])
    col = np.array(SANDS, np.float32)[kind][band]
    col *= (1 + 0.08 * np.clip(rng.normal(0, 1, nb), -2, 2)).astype(np.float32)[band][..., None]
    fb = (yb / bh) % 1.0
    # a estratificação cruzada: linhas finas inclinadas dentro de cada camada (cada uma com o seu ângulo)
    ang = rng.uniform(-0.32, 0.32, nb).astype(np.float32)[band]
    cb = np.sin((xx * np.sin(ang) + yb * np.cos(ang)) * (2 * math.pi / (3.2 * S)) + value_noise(H, W, 30 * S, rng, 1) * 4)
    col *= (1 - 0.07 * sstep(0.55, 0.95, cb))[..., None]
    # o plano entre camadas é um sulco: escuro no vinco, a beirada de baixo pega a luz
    col = mix(col, SAND_CRACK, (sstep(0.07, 0.0, fb) * 0.55)[..., None])
    col = mix(col, col * 1.18, (sstep(0.07, 0.11, fb) * sstep(0.2, 0.11, fb) * 0.6)[..., None])
    # as juntas: verticais, cortando uma camada por vez (com o desencontro de uma para a outra), e as
    # juntas mestras que atravessam o paredão de cima a baixo; o resto é trinca fina e rara
    off = rng.uniform(0, 400 * S, nb).astype(np.float32)[band]
    sp = rng.uniform(130, 300, nb).astype(np.float32)[band] * S
    jx = (xx + off + (yb % bh) * rng.uniform(-0.25, 0.25) + (value_noise(H, W, 18 * S, rng, 2) - 0.5) * 6 * S) % sp
    vj = sstep(1.1 * S, 0.3 * S, np.minimum(jx, sp - jx)) * (rng.random(nb) < 0.4)[band] * sstep(0.04, 0.12, fb)
    xm = xx + (value_noise(H, W, 50 * S, rng, 2) - 0.5) * 14 * S
    per = rng.uniform(300, 420) * S
    dm = np.abs(((xm + rng.uniform(0, per)) % per) - per / 2)
    mj = sstep(1.3 * S, 0.3 * S, per / 2 - dm) * sstep(0.45, 0.6, value_noise(H, W, 120 * S, rng, 1))
    big = np.maximum(vj, mj)
    small, cid = joints(H, W, rng, 30 * S, 0.45 * S, squash=1.6, show=(0.66, 0.78), amp=3 * S)
    small *= 0.5
    tone = (1 + 0.08 * rng.normal(0, 1, int(cid.max()) + 1)).astype(np.float32)
    col *= tone[cid][..., None]
    grain = value_noise(H, W, 3, rng, 2)
    col *= (1 + (grain - 0.5) * 0.26)[..., None]
    # erosão alveolar: buraquinhos escuros com a borda de cima clara
    pit = sstep(0.74, 0.84, value_noise(H, W, 4.5 * S, rng, 2)) * sstep(0.5, 0.7, value_noise(H, W, 60 * S, rng, 1))
    col = mix(col, SAND_CRACK, (pit * 0.45)[..., None])
    col = mix(col, col * 1.2, (np.roll(pit, 2 * S, axis=0) * (1 - pit) * 0.35)[..., None])
    cracks = np.maximum(big, small * 0.5)
    col = mix(col, col * 1.22, (np.roll(cracks, 2 * S, axis=0) * (1 - cracks) * 0.4)[..., None])
    col = mix(col, SAND_CRACK, (cracks * 0.75)[..., None])

    # ---- basalto (Cachoeiras): colunas verticais com juntas atravessadas, frio e úmido ----
    ba = mat == 3
    if ba.any():
        # colunas de larguras diferentes, quase retas (um leve tombo), cada uma com o seu tom
        cx = xx + yy * rng.uniform(-0.02, 0.02) + (value_noise(H, W, 200 * S, rng, 2) - 0.5) * 4 * S
        nci = int(W / (0.8 * T)) + 8
        widths = rng.uniform(0.8, 1.8, nci).astype(np.float32) * T
        edges = np.concatenate([[-3 * T], -3 * T + np.cumsum(widths)]).astype(np.float32)
        ci = np.clip(np.searchsorted(edges, cx, side='right') - 1, 0, nci - 1)
        fx = (cx - edges[ci]) / widths[ci]
        ctone = (0.85 + 0.3 * rng.random(nci)).astype(np.float32)[ci]
        # cada coluna é um prisma: a face da esquerda pega a luz, a da direita fica na sombra
        # cada coluna é um prisma: três faces planas com a aresta viva entre elas (a da esquerda pega a
        # luz, a da frente fica no meio, a da direita na sombra), cada coluna com as suas proporções
        f1 = rng.uniform(0.18, 0.38, nci).astype(np.float32)[ci]
        f2 = rng.uniform(0.62, 0.82, nci).astype(np.float32)[ci]
        bc = mix(BAS_L, BAS_M, sstep(f1 - 0.02, f1 + 0.02, fx)[..., None])
        bc = mix(bc, BAS_D, sstep(f2 - 0.02, f2 + 0.02, fx)[..., None])
        bc = mix(bc, BAS_L * 1.25, (sstep(0.04, 0.0, np.abs(fx - f1)) * 0.5)[..., None])
        bc *= ctone[..., None]
        off = (rng.random(nci) * 3 * T).astype(np.float32)[ci]
        step = (rng.uniform(2.0, 4.0, nci) * T).astype(np.float32)[ci]
        fy = ((yy + off) % step) / step
        bc = mix(bc, BAS_D * 0.6, (sstep(0.03, 0.0, fy) + sstep(0.97, 1.0, fy)).clip(0, 1)[..., None] * 0.8)
        bc = mix(bc, BAS_D * 0.5, (sstep(0.08, 0.0, fx) + sstep(0.94, 1.0, fx)).clip(0, 1)[..., None] * 0.9)
        streak = stretched_noise(H, W, 2.5 * S, 50 * S, rng, 2)
        bc = mix(bc, FILM * 0.5 + bc * 0.5, (sstep(0.78, 0.92, streak) * 0.35)[..., None])
        bc *= (1 + (grain - 0.5) * 0.2)[..., None]
        # líquen ocre e musgo em manchas (a luz quente do vale pega nelas)
        lq = sstep(0.7, 0.82, value_noise(H, W, 7 * S, rng, 2)) * sstep(0.4, 0.6, value_noise(H, W, 80 * S, rng, 1))
        bc = mix(bc, hexc(0x9a8650), (lq * 0.35)[..., None])
        bc = mix(bc, MOSS_M, (sstep(0.72, 0.85, value_noise(H, W, 10 * S, rng, 2)) * 0.35)[..., None])
        col = np.where(ba[..., None], bc, col)

    # ---- gruta: o mesmo arenito, escuro, frio e úmido ----
    gr = mat == 4
    if gr.any():
        gc = mix(col * 0.62, hexc(0x3a3644), 0.3)
        col = np.where(gr[..., None], gc, col)

    # ---- cantaria: blocos lavrados retangulares assentados em fiadas (cada fiada com o seu desencontro), a
    # aresta de cima de cada bloco pega a luz e a de baixo escurece, argamassa funda, musgo nas juntas de
    # baixo e os escorridos escuros da água que desce pela pedra ----
    ms = mat == 2
    if ms.any():
        ch = 0.8 * T
        course = np.floor(yy / ch).astype(np.int64)
        nc = int(course.max()) + 1
        coff = (rng.random(nc) * 4 * T).astype(np.float32)[course]
        blen = (rng.uniform(1.6, 2.8, nc) * T).astype(np.float32)[course]
        bxf = (xx + coff) / blen
        bx = bxf % 1.0
        bid = (course * 997 + np.floor(bxf).astype(np.int64)) % 4093
        fy = (yy % ch) / ch
        btone = (0.86 + 0.26 * rng.random(4093)).astype(np.float32)[bid]
        stc = np.array(STONES, np.float32)[bid % len(STONES)] * btone[..., None]
        stc *= (1 + (value_noise(H, W, 2.5, rng, 1) - 0.5) * 0.2)[..., None]
        # a face do bloco: levemente abaulada, a borda de cima clara e a de baixo na sombra
        stc = mix(stc, stc * 1.28, sstep(0.16, 0.04, fy)[..., None] * 0.6)
        stc = mix(stc, stc * 0.62, sstep(0.8, 0.95, fy)[..., None] * 0.7)
        ex = np.minimum(bx, 1 - bx) * blen
        stc = mix(stc, stc * 1.15, (sstep(2.5 * S, 0.8 * S, bx * blen) * 0.5)[..., None])
        stc = mix(stc, stc * 0.7, (sstep(2.5 * S, 0.8 * S, (1 - bx) * blen) * 0.5)[..., None])
        jn = np.maximum(sstep(0.05, 0.0, fy) + sstep(0.95, 1.0, fy), sstep(1.2 * S, 0.3 * S, ex)).clip(0, 1)
        stc = mix(stc, MORTAR, (jn * 0.9)[..., None])
        mossy = sstep(0.5, 0.72, value_noise(H, W, 14 * S, rng, 2)) * np.maximum(jn, sstep(0.7, 1.0, fy) * 0.5)
        stc = mix(stc, MOSS_M, (mossy * 0.55)[..., None])
        stain = sstep(0.6, 0.85, stretched_noise(H, W, 5 * S, 120 * S, rng, 2))
        stc = mix(stc, stc * 0.6, (stain * 0.45)[..., None])
        col = np.where(ms[..., None], stc, col)

    # ---- pedra molhada ('+'): lisa e escura, a película de água escorrendo em fios claros ----
    wr = mat == 1
    if wr.any():
        st = stretched_noise(H, W, 3 * S, 70 * S, rng, 3)
        wc = mix(WET_D, WET_M, sstep(0.3, 0.8, st)[..., None])
        film = sstep(0.8, 0.93, stretched_noise(H, W, 1.6 * S, 110 * S, rng, 2))
        wc = mix(wc, WET_L, (film * 0.55)[..., None])
        glint = sstep(0.9, 0.97, stretched_noise(H, W, 1.2 * S, 30 * S, rng, 1)) * film
        wc = mix(wc, FILM, (glint * 0.7)[..., None])
        # o musgo nas bordas da parede, onde a água espirra
        edge = np.exp(-np.minimum(dleft, dright) / (2.5 * S))
        wc = mix(wc, MOSS_D, (edge * sstep(0.5, 0.7, value_noise(H, W, 6 * S, rng, 2)) * 0.6)[..., None])
        col = np.where(wr[..., None], wc, col)

    # ---- luz: o miolo afunda no escuro, o alto e a esquerda pegam a luz, embaixo e a direita na sombra ----
    dt = d / T
    k = np.maximum(0.34 + 0.1 * value_noise(H, W, 200, rng, 2), 1 - np.maximum(0, dt - 0.5) * 0.32)
    col = mix(SAND_DEEP, col, k[..., None])
    col = mix(col, col * 1.22 + 0.02, (np.exp(-dleft / (2.2 * S)) * 0.35)[..., None])
    col = mix(col, col * 0.6, (np.exp(-dright / (2.6 * S)) * 0.35)[..., None])
    col = mix(col, col * 0.45, (np.exp(-dbot / (3.0 * S)) * 0.45)[..., None])

    # ---- água: a pedra perto da água fica escura e saturada (molhada), com o limo na linha d'água ----
    wet = sstep(0.9 * T, 0.1 * T, dw) * M
    col = mix(col, col * np.array([0.62, 0.66, 0.7], np.float32), (wet * 0.75)[..., None])
    lim = sstep(0.35 * T, 0.0, dw) * M * sstep(0.45, 0.65, value_noise(H, W, 5 * S, rng, 2))
    col = mix(col, ALGA, (lim * 0.45)[..., None])

    # ---- superfície: grama com a terra embaixo, areia na beira da água, leito com seixos, neve no alto ----
    exp = exposure(M, angles=(-0.35, -0.15, 0.0, 0.15, 0.35))
    ytop = np.clip((yy - dtop + 1).astype(np.int64), 0, H - 1)
    xi = xx.astype(np.int64)
    surf = exp[ytop, xi] * M
    # a coluna de ar logo acima da superfície é água? (o chão está submerso)
    sub = water[np.clip(ytop - 3, 0, H - 1), xi] & M
    dws = dw[np.clip(ytop - 2, 0, H - 1), xi]
    open_top = (surf > 0.3) & ~sub & (mat != 1)
    beach = open_top & (dws < (2.2 + 1.4 * value_noise(H, W, 40 * S, rng, 1)) * T) & (mat != 2)
    grass = open_top & ~beach & (mat != 2)
    gd = (2.4 + 2.4 * value_noise(H, W, 18 * S, rng, 2)) * S
    sd = gd + (4.0 + 4.0 * value_noise(H, W, 30 * S, rng, 2)) * S
    blade = stretched_noise(H, W, 1.3 * S, 7 * S, rng, 2)
    mossy_room = room.name in ('cachoeiras', 'gruta')
    g_d, g_m, g_l = (MOSS_D, MOSS_M, MOSS_L) if mossy_room else (GD, GM, GL)
    gv = dtop / np.maximum(gd, 1)
    gcol = mix(g_m, g_d, sstep(0.2, 1.0, gv)[..., None])
    gcol = mix(gcol, g_l, (sstep(0.62, 0.85, blade) * sstep(0.7, 0.1, gv) * 0.7)[..., None])
    gcol *= (0.72 + 0.4 * blade)[..., None]
    gcol = mix(gcol, GS, (sstep(0.8 * S, 0.0, dtop) * sstep(0.6, 0.8, blade) * 0.4 * (1 - mossy_room))[..., None])
    # a terra: escura, com raízes finas e pedrinhas, a sombra logo embaixo da grama
    ec = np.array(LOAM, np.float32)[(value_noise(H, W, 6 * S, rng, 1) * 2.99).astype(np.int64)]
    ec *= (0.8 + 0.4 * value_noise(H, W, 2, rng, 1))[..., None]
    roots = sstep(0.9, 0.96, stretched_noise(H, W, 30 * S, 1.2 * S, rng, 1))
    ec = mix(ec, ROOT, (roots * 0.5)[..., None])
    ec = mix(ec, ec * 0.5, sstep(gd + 2 * S, gd, dtop)[..., None] * 0.7)
    soil = grass & (dtop < sd) & (dtop >= gd)
    col = np.where(soil[..., None], mix(ec, col, sstep(sd - 2 * S, sd, dtop)[..., None]), col)
    gmat = grass & (dtop < gd)
    # a grama pende um pouco pelas quinas
    drape = grass & (np.minimum(dleft, dright) < 2.0 * S) & (dtop < gd * 2.4)
    col = mix(col, g_m * 0.8, (drape * sstep(gd * 2.4, gd, dtop) * 0.85)[..., None])
    col = np.where(gmat[..., None], gcol, col)
    # areia: clara no seco, escura e lisa perto da água, com marcas de ondinha
    bd = (6.0 + 5.0 * value_noise(H, W, 34 * S, rng, 2)) * S
    ripple = np.sin(xx * (2 * math.pi / (5 * S)) + value_noise(H, W, 20 * S, rng, 1) * 6) * 0.5 + 0.5
    bcol = mix(BEACH_L, BEACH_M, sstep(0.0, 1.0, dtop / bd)[..., None])
    bcol *= (0.92 + 0.12 * ripple * sstep(1.5 * T, 0.4 * T, dws) + (grain - 0.5) * 0.2)[..., None]
    bcol = mix(bcol, BEACH_W, (sstep(1.0 * T, 0.2 * T, dws) * 0.8)[..., None])
    bsel = beach & (dtop < bd)
    col = np.where(bsel[..., None], mix(bcol, col, sstep(bd - 2 * S, bd, dtop)[..., None]), col)
    # o leito embaixo da água: lama escura, seixos redondos, limo
    bed = sub & (dtop < 7 * S)
    peb = value_noise(H, W, 2.2 * S, rng, 1)
    bedc = mix(BED_M, BED_D, sstep(0.0, 7 * S, dtop)[..., None])
    bedc = mix(bedc, PEBBLE, (sstep(0.66, 0.74, peb) * 0.75)[..., None])
    bedc = mix(bedc, BED_D * 0.7, (sstep(0.6, 0.66, peb) * sstep(0.74, 0.7, peb) * 0.6)[..., None])
    bedc = mix(bedc, ALGA, (sstep(0.55, 0.75, value_noise(H, W, 9 * S, rng, 2)) * 0.5)[..., None])
    col = np.where(bed[..., None], bedc, col)
    # neve no alto da Descida (o caminho que desce da Floresta)
    snow_a = np.zeros((H, W), np.float32)
    if room.name == 'descida':
        cold = sstep(0.47 * H, 0.3 * H, yy + (value_noise(H, W, 40 * S, rng, 2) - 0.5) * 10 * T) * (xx < 0.45 * W)
        # mais grossa encostada no paredão (o vento junta a neve ali)
        drift = 1 + 0.8 * np.exp(-np.minimum(dleft, dright) / (14 * S))
        depth = (10 + 6 * value_noise(H, W, 30 * S, rng, 2)) * S * cold * drift
        snow_a = sstep(depth + 0.5, depth - 1.0, dtop) * open_top * (depth > 1.5 * S)
        sv = dtop / np.maximum(depth, 1)
        sc = mix(SNOW_L, SNOW_M, sstep(0.05, 0.5, sv)[..., None])
        sc = mix(sc, SNOW_S, sstep(0.72, 1.0, sv)[..., None])
        col = mix(col, sc, snow_a[..., None])
    col = np.clip(col, 0, 1)

    mask = M.astype(np.float32)
    L = Layer(W, H)
    L.fill(col, mask)
    flow = np.where(wr | ba, math.pi / 2, (value_noise(H, W, 40, rng, 2) - 0.5) * 0.5).astype(np.float32)
    flow = np.where(gmat | bsel | bed, 0.0, flow).astype(np.float32)
    keep = 1 - np.maximum(cracks * 0.9 * (mat == 0), sstep(2.5 * S, 0.5 * S, dtop) * (gmat | bsel))
    passes = [
        dict(size=8, spacing=0.9, length=(1.8, 3.8), err=0.0, alpha=0.5, bristle=0.55, dry=0.45, blur=0.14, taper=0.35, ang_jitter=0.16),
        dict(size=4, spacing=0.95, length=(1.6, 3.4), err=0.0, alpha=0.55, bristle=0.5, dry=0.4, blur=0.06, taper=0.4, ang_jitter=0.22),
    ]
    paint(L, col, mask * keep, flow, rng, passes, val_jitter=0.07, jitter=0.01, clip_soft=0, base=0.0)
    F = dict(d=d, dtop=dtop, dbot=dbot, dleft=dleft, dright=dright, surf=surf, water=water, dw=dw,
             grass=grass, beach=beach, sub=sub, snow=snow_a > 0.5, mat=mat)
    return L, M, F


# ======================================================================================
# vegetação, árvores e passarelas
# ======================================================================================
def bloom(L, cx, cy, r, rng, density=1.0, green=0.12):
    """Uma bola de flor de cerejeira: três ou quatro cachos juntos, a massa escura no fundo, o corpo rosa e
    as pétalas claras do lado da luz (em cima e à esquerda), umas folhas verdes aparecendo."""
    subs = [(0.0, 0.0, 0.72)] + [(rng.uniform(-0.5, 0.5), rng.uniform(-0.35, 0.3), rng.uniform(0.45, 0.65)) for _ in range(int(rng.integers(2, 4)))]
    for (ox, oy, rr) in subs:
        L.dab(cx + ox * r, cy + oy * r + 0.12 * r, rr * r * 0.75, PINK_D * 0.85, 0.55, 1.0)
    for (ox, oy, rr) in subs:
        sx, sy, R = cx + ox * r, cy + oy * r, rr * r
        n = int(max(5, R * R / (1.9 * S) ** 2 * 0.75 * density))
        for layer, (k0, k1, sz, al) in enumerate(((0.0, 0.45, (1.8, 3.0), 0.9), (0.3, 0.85, (1.4, 2.5), 0.88), (0.65, 1.0, (1.0, 1.9), 0.9))):
            for i in range(n if layer < 2 else n // 2):
                a = rng.uniform(0, 2 * math.pi)
                dd = math.sqrt(rng.random()) * R * (1.0 - 0.18 * layer)
                x = sx + math.cos(a) * dd
                y = sy + math.sin(a) * dd * 0.8
                lit = 0.5 + 0.5 * (-(x - cx) / r * 0.5 - (y - cy) / r * 0.8) + rng.normal(0, 0.12)
                lit = min(1.0, max(0.0, k0 + (k1 - k0) * lit))
                if rng.random() < green * (1.2 - lit):
                    c = mix(LEAF_D, LEAF_L, lit * 0.8)
                elif lit < 0.33:
                    c = mix(PINK_D, PINK_M, lit / 0.33)
                elif lit < 0.75:
                    c = mix(PINK_M, PINK_L, (lit - 0.33) / 0.42)
                else:
                    c = mix(PINK_L, PINK_H, (lit - 0.75) / 0.25)
                L.dab(x, y, rng.uniform(*sz) * S, c, al, 0.6)


def vtrunk(L, cx, ybase, ytop, w0, w1, rng):
    """Tronco do chão (ybase) até ytop, afinando de w0 a w1, com a raiz alargando no pé, a casca em
    sulcos e a luz da esquerda."""
    lean = rng.normal(0, 0.01)
    n = 24
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        y = ybase + (ytop - ybase) * t
        w = w0 + (w1 - w0) * t
        flare = 1 + 0.7 * math.exp(-t * (ybase - ytop) / (0.5 * T))
        wob = rng.normal(0, 0.5)
        x = cx + lean * (ybase - y) + math.sin(t * 5.0 + cx) * 0.06 * T
        left.append((x - w * 0.5 * flare + wob, y))
        right.append((x + w * 0.5 * flare + wob, y))
    pts = left + right[::-1]
    b = Box(min(p[0] for p in pts) - 2, ytop - 2, max(p[0] for p in pts) + 2, ybase + 2)
    a = b.poly(pts)
    wy = w0 + (w1 - w0) * np.clip((ybase - b.yy) / max(1, ybase - ytop), 0, 1)
    u = np.clip((b.xx - cx - lean * (ybase - b.yy)) / (wy * 0.5), -1.4, 1.4)
    c = mix(BARK_L, BARK_D, sstep(-1.0, 1.0, u)[..., None])
    fur = stretched_noise(b.h, b.w, 2.2 * S, 20 * S, rng, 2)
    c = mix(c, BARK_D * 0.7, (sstep(0.6, 0.74, fur) * 0.7)[..., None])
    # as faixas horizontais da casca da cerejeira (lenticelas)
    lent = sstep(0.8, 0.9, stretched_noise(b.h, b.w, 10 * S, 1.2 * S, rng, 1))
    c = mix(c, BARK_L * 1.1, (lent * 0.35)[..., None])
    c = mix(c, c * 0.55, sstep(ybase - 0.8 * T, ybase, b.yy)[..., None])
    b.put(L, np.clip(c, 0, 1), a)


def limb(L, x0, y0, x1, y1, w0, w1, rng):
    """Galho de enfeite (sem física): um traço que afina."""
    n = max(2, int(math.hypot(x1 - x0, y1 - y0) / (3 * S)))
    for i in range(n):
        t = i / n
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        L.stroke(x, y, math.atan2(y1 - y0, x1 - x0), 4 * S, w0 + (w1 - w0) * t, mix(BARK_M, BARK_L, 0.3 * (1 - t)), 1.0, rng, 0.2, 0.05, taper=0.2)


def branch(L, Lf, x0, x1, row, trunk_x, rng):
    """Galho de verdade (plataforma de um lado só): sai do tronco e afina; o topo da madeira é a linha da
    física. As flores penduram embaixo e enchem a ponta."""
    ytop = row * T
    tcx = (trunk_x + 0.5) * T
    if tcx <= (x0 + x1 + 1) * T / 2:
        start, end, dirx = tcx, (x1 + 1) * T + 0.25 * T, 1
    else:
        start, end, dirx = tcx, x0 * T - 0.25 * T, -1
    length = abs(end - start)
    # as flores de trás (penduradas embaixo do galho)
    for i in range(int(length / (0.7 * T)) + 1):
        t = min(1.0, (i + rng.uniform(0.2, 0.8)) / max(1, length / (0.7 * T)))
        if t < 0.25:
            continue
        bloom(Lf, start + dirx * length * t, ytop + rng.uniform(0.75, 1.0) * T, rng.uniform(0.4, 0.6) * T * (0.6 + 0.6 * t), rng, 0.8)
    pts_t, pts_b = [], []
    n = 20
    ph = PLANK_H * S
    for i in range(n + 1):
        t = i / n
        px = start + dirx * length * t
        th = (15 - 8 * t) * S * (1 + 0.45 * math.exp(-t / 0.08)) * (1 + rng.normal(0, 0.05))
        pts_t.append((px, ytop))
        pts_b.append((px, ytop + th * (0.8 + 0.2 * math.cos(t * 3)) + t * 2 * S))
    b = Box(min(start, end) - 4, ytop - 2, max(start, end) + 4, ytop + 18 * S)
    a = b.poly(pts_t + pts_b[::-1])
    v = (b.yy - ytop) / (ph + 6 * S)
    c = mix(BARK_L, BARK_D, sstep(0.0, 1.0, v)[..., None])
    c *= (0.8 + 0.3 * stretched_noise(b.h, b.w, 16 * S, 1.6 * S, rng, 2))[..., None]
    c = mix(c, BARK_D * 0.7, (sstep(0.62, 0.75, stretched_noise(b.h, b.w, 26 * S, 1.2 * S, rng, 2)) * 0.6)[..., None])
    c = mix(c, BARK_L * 1.15, sstep(1.5 * S, 0.0, b.yy - ytop)[..., None] * 0.6)
    b.put(L, np.clip(c, 0, 1), a)
    # galhinhos para cima e para baixo, com flor na ponta
    for k in range(int(length / (0.9 * T))):
        t = rng.uniform(0.2, 0.95)
        px = start + dirx * length * t
        up = rng.random() < 0.45
        ang = (-math.pi / 2 if up else math.pi / 2) + dirx * rng.uniform(0.5, 1.0)
        ln = rng.uniform(0.5, 1.0) * T
        ex, ey = px + math.cos(ang) * ln, ytop + 4 * S + math.sin(ang) * ln
        limb(L, px, ytop + 4 * S, ex, ey, 2.4 * S, 1.0 * S, rng)
        bloom(Lf, ex, ey, rng.uniform(0.35, 0.55) * T, rng, 0.9)
    # a ponta cheia de flor
    bloom(Lf, end + dirx * 0.35 * T, ytop + 0.35 * T, rng.uniform(0.7, 0.95) * T, rng)


def tree(L, Lf, room, tx, ty, own, rng):
    """Árvore de flor: o tronco do chão até acima do galho mais alto, os galhos do mapa e a copa."""
    cx = (tx + 0.5) * T
    ybase = (ty + 1) * T + 2
    top = (min(r for (_, _, r) in own) - 2.2) * T if own else ybase - rng.uniform(5, 7) * T
    vtrunk(L, cx, ybase, top + 0.6 * T, 1.3 * T, 0.55 * T, rng)
    for (x0, x1, row) in own:
        branch(L, Lf, x0, x1, row, tx, rng)
    # os galhos de cima (sem física), abrindo a copa
    for k in range(4):
        side = -1 if k % 2 == 0 else 1
        ex = cx + side * rng.uniform(1.0, 2.2) * T
        ey = top - rng.uniform(0.2, 1.4) * T
        limb(L, cx, top + 1.2 * T, ex, ey, 0.32 * T, 0.12 * T, rng)
    # a copa: bolas de flor em volta das pontas e no alto
    for k in range(11):
        a = -math.pi / 2 + rng.uniform(-1.5, 1.5)
        dd = rng.uniform(0.6, 2.4) * T
        bloom(Lf, cx + math.cos(a) * dd * 1.35, top + 0.5 * T + math.sin(a) * dd * 0.75, rng.uniform(1.0, 1.6) * T, rng)
    bloom(Lf, cx, top - 0.2 * T, 1.8 * T, rng)
    # galhinhos com tufos de flor ao longo do tronco (a árvore não é um poste)
    for k in range(int((ybase - top) / (3.2 * T))):
        y = rng.uniform(top + 2 * T, ybase - 3 * T)
        if any(abs(y - r * T) < 1.6 * T for (_, _, r) in own):
            continue
        side = rng.choice([-1, 1])
        ex, ey = cx + side * rng.uniform(0.9, 1.5) * T, y - rng.uniform(0.3, 0.8) * T
        limb(L, cx + side * 0.25 * T, y, ex, ey, 0.16 * T, 0.06 * T, rng)
        bloom(Lf, ex, ey, rng.uniform(0.4, 0.6) * T, rng, 0.9)


def sapling(L, cx, ybase, rng, room):
    """Árvore pequena ('t'): tronco curto e copa redonda de folha, umas flores brancas ou rosa."""
    h = rng.uniform(2.0, 3.4) * T
    vtrunk(L, cx, ybase, ybase - h * 0.75, 0.42 * T, 0.2 * T, rng)
    r = rng.uniform(0.9, 1.3) * T
    cy = ybase - h * 0.82
    dark = room.name in ('gruta', 'cachoeiras')
    for (dx, dy, rr) in ((0, 0, 1.0), (-0.55, 0.25, 0.7), (0.55, 0.2, 0.72), (0.1, -0.45, 0.65)):
        x, y, R = cx + dx * r, cy + dy * r, r * rr
        n = int(R * R / (2.2 * S) ** 2 * 0.9)
        for i in range(n):
            a = rng.uniform(0, 2 * math.pi)
            dd = math.sqrt(rng.random()) * R
            px, py = x + math.cos(a) * dd, y + math.sin(a) * dd * 0.85
            lit = min(1.0, max(0.0, 0.5 - (px - cx) / r * 0.3 - (py - cy) / r * 0.45 + rng.normal(0, 0.12)))
            c = mix(LEAF_D, LEAF_M, lit * 1.4) if lit < 0.7 else mix(LEAF_M, LEAF_L, (lit - 0.7) / 0.3)
            if dark:
                c = c * 0.75
            L.dab(px, py, rng.uniform(1.8, 3.2) * S, c, 0.95, 0.55)
    flower = FLOWERS[0] if rng.random() < 0.5 else PINK_L
    for i in range(int(r / S * 0.9)):
        a = rng.uniform(0, 2 * math.pi)
        dd = math.sqrt(rng.random()) * r * 1.1
        L.dab(cx + math.cos(a) * dd, cy + math.sin(a) * dd * 0.8 - 0.1 * r, rng.uniform(0.9, 1.5) * S, flower, 0.9, 0.5)


def solid_at(room, x, y):
    return 0 <= y < room.h and 0 <= x < room.w and room.g[y, x] in SOLID


def floor_below(room, x, y, limit=16):
    """Primeira linha sólida (ou de água) embaixo de (x, y), até limit tiles; None se não houver."""
    for k in range(y + 1, min(room.h, y + 1 + limit)):
        if room.g[k, x] in SOLID:
            return k, False
        if room.g[k, x] == '~':
            # poste na água: desce até o leito
            for j in range(k, room.h):
                if room.g[j, x] in SOLID:
                    return j, True
            return room.h, True
    return None


def walkway(L, room, x0, x1, row, rng):
    """Passarela de tábuas (vão solto, sem tronco): o deque com as pontas das tábuas, a viga de lado, os
    postes até o chão ou a mão-francesa presa no paredão; a ponta solta, sem apoio, é a ponte que
    quebrou (tábuas lascadas e uma corda pendurada)."""
    ytop = row * T
    xa, xb = x0 * T, (x1 + 1) * T
    wl, wr = solid_at(room, x0 - 1, row), solid_at(room, x1 + 1, row)
    # o deque: as tábuas atravessadas vistas de ponta, uma do lado da outra
    x = xa - (0.3 * T if wl else 0)
    end = xb + (0.3 * T if wr else 0)
    while x < end:
        w = rng.uniform(0.38, 0.5) * T
        w = min(w, end - x)
        b = Box(x, ytop, x + w - 1.0 * S, ytop + 3.5 * S)
        c = mix(WOOD_L, WOOD_M, sstep(ytop, ytop + 3.5 * S, b.yy)[..., None])
        c *= rng.uniform(0.8, 1.1) * (0.88 + 0.2 * stretched_noise(b.h, b.w, 4 * S, 1 * S, rng))[..., None]
        b.put(L, np.clip(c, 0, 1), np.ones((b.h, b.w), np.float32))
        x += w
    # a viga de lado embaixo do deque
    b = Box(xa - (0.3 * T if wl else 0), ytop + 3.5 * S, end, ytop + PLANK_H * S + 1.5 * S)
    c = mix(WOOD_M, WOOD_D, sstep(ytop + 3.5 * S, ytop + 8 * S, b.yy)[..., None])
    c *= (0.85 + 0.25 * stretched_noise(b.h, b.w, 30 * S, 1.5 * S, rng))[..., None]
    b.put(L, np.clip(c, 0, 1), np.ones((b.h, b.w), np.float32))
    yb = ytop + PLANK_H * S + 1.5 * S
    # postes até o chão (ou até o leito, dentro da água), a cada 2,5 a 3,5 tiles
    posts = []
    px = xa + 0.4 * T
    while px < xb - 0.2 * T:
        tx = int(px // T)
        f = floor_below(room, tx, row)
        if f is not None:
            posts.append((px, f))
        px += rng.uniform(2.5, 3.5) * T
    if len(posts) >= 2 or (posts and (wl or wr)):
        for (px, (fy, wet)) in posts:
            b = Box(px - 0.2 * T, yb - 2, px + 0.2 * T, fy * T + (0.3 * T if wet else 0.1 * T))
            u = (b.xx - px) / (0.2 * T)
            c = mix(WOOD_L, WOOD_D, sstep(-1.0, 1.0, u)[..., None])
            c *= (0.85 + 0.25 * stretched_noise(b.h, b.w, 1.5 * S, 20 * S, rng))[..., None]
            if wet:
                # a parte que fica dentro da água escurece e cria limo
                wl_y = ytop + T
                for k in range(row + 1, room.h):
                    if room.g[k, int(px // T)] == '~':
                        wl_y = k * T
                        break
                c = mix(c, mix(c * 0.5, ALGA, 0.4), sstep(wl_y - 0.5 * T, wl_y + 0.5 * T, b.yy)[..., None])
            b.put(L, np.clip(c, 0, 1), np.ones((b.h, b.w), np.float32))
        # a travessa em X entre postes vizinhos (só onde os postes são curtos o bastante)
        for (pa, (fa, _)), (pb, (fb, _)) in zip(posts, posts[1:]):
            yl = min(fa, fb) * T - 0.3 * T
            if yl - yb > 1.2 * T:
                for (ax, ay, bx, by) in ((pa, yb + 0.2 * T, pb, yl), (pb, yb + 0.2 * T, pa, yl)):
                    L.stroke((ax + bx) / 2, (ay + by) / 2, math.atan2(by - ay, bx - ax), math.hypot(bx - ax, by - ay), 0.16 * T,
                             WOOD_M, 0.95, rng, 0.25, 0.1, taper=0.05)
    else:
        # sem chão por perto: mão-francesa presa no paredão de cada lado que tem pedra
        for (has, wx, sgn) in ((wl, xa, 1), (wr, xb, -1)):
            if not has:
                continue
            reach = min(abs(xb - xa) * 0.7, 2.6 * T)
            ax, ay = wx + sgn * reach, yb
            bx, by = wx, yb + reach * 0.9
            L.stroke((ax + bx) / 2, (ay + by) / 2, math.atan2(by - ay, bx - ax), math.hypot(bx - ax, by - ay) + 0.2 * T, 0.2 * T,
                     WOOD_M, 1.0, rng, 0.25, 0.1, taper=0.05)
            L.dab(bx, by, 0.12 * T, hexc(0x3a3a3e), 1.0, 0.3)  # o grampo de ferro na pedra
    # a ponta quebrada: tábuas lascadas e a corda pendurada
    for (has, ex, sgn) in ((wl, xa, -1), (wr, xb, 1)):
        if has:
            continue
        nxt = x1 + 1 if sgn > 0 else x0 - 1
        if 0 <= nxt < room.w and room.g[row, nxt] == '-':
            continue
        anchored_post = any(abs(p[0] - ex) < 1.0 * T for p in posts)
        if anchored_post:
            continue
        for k in range(3):
            L.stroke(ex + sgn * rng.uniform(0.0, 0.25) * T, ytop + rng.uniform(1, 6) * S, sgn * rng.uniform(0.0, 0.5),
                     rng.uniform(0.2, 0.45) * T, rng.uniform(1.0, 1.8) * S, WOOD_L, 0.95, rng, 0.3, 0.2, taper=0.85)
        ln = rng.uniform(1.4, 2.6) * T
        L.stroke(ex - sgn * 0.15 * T, yb + ln / 2, math.pi / 2 + sgn * 0.12, ln, 0.07 * T, ROPE, 0.95, rng, 0.2, 0.1, taper=0.2, bend=0.15)


def surface_points(M, ok, step, rng):
    """Pontos do topo das superfícies (o pixel de cima do chão), uma amostra por ~step pixels."""
    top = M & ~np.vstack([np.zeros((1, M.shape[1]), bool), M[:-1]]) & ok
    ys, xs = np.nonzero(top)
    keep = rng.random(len(xs)) < 1.0 / step
    return list(zip(xs[keep].tolist(), ys[keep].tolist()))


def grass(L, F, M, room, rng):
    """A grama alta, as flores do campo e os juncos da beira da água, saindo do topo do chão."""
    dw = F['dw']
    W = M.shape[1]
    ok = F['grass'] & ~F['snow']
    blades = []
    for (x, y) in surface_points(M, ok, 3.2 * S, rng):
        tall = rng.uniform(0.6, 1.5)
        for k in range(int(rng.integers(2, 5))):
            blades.append((x + rng.normal(0, 1.5 * S), y, tall, (k - 1.5) * 0.22))
    for (x, y, tall, fan) in blades:
        x = int(min(max(x, 0), W - 1))
        near_w = dw[y, x] < 1.3 * T
        ln = rng.uniform(3, 9) * S * tall * (1.4 if near_w else 1.0)
        a = -math.pi / 2 + fan + rng.normal(0, 0.18)
        lit = rng.random()
        c = mix(GD, GM, lit * 1.6) if lit < 0.6 else mix(GM, GL, (lit - 0.6) / 0.4)
        if rng.random() < 0.08 and room.name != 'gruta':
            c = mix(hexc(0x8a7a3a), hexc(0xc9b060), rng.random())  # capim seco, dourado
        if room.name in ('cachoeiras', 'gruta'):
            c = mix(MOSS_D, MOSS_L, lit * 0.8)
        L.stroke(x + math.cos(a) * ln * 0.5, y + 2 + math.sin(a) * ln * 0.5, a, ln, rng.uniform(1.0, 1.6) * S, c, 0.95, rng, 0.2, 0.1, taper=0.9,
                 bend=rng.normal(0, 0.25))
        if lit > 0.92 and room.name not in ('gruta',):
            L.stroke(x + math.cos(a) * ln * 0.75, y + 2 + math.sin(a) * ln * 0.75, a, ln * 0.4, 1.0 * S, GS, 0.8, rng, 0.2, 0.1, taper=0.9)
    if room.name not in ('gruta', 'cachoeiras'):
        # flores do campo em tufinhos
        for (x, y) in surface_points(M, ok, 26 * S, rng):
            c = FLOWERS[int(rng.integers(len(FLOWERS)))]
            for k in range(int(rng.integers(2, 6))):
                fx = x + rng.normal(0, 3 * S)
                h = rng.uniform(4, 10) * S
                L.stroke(fx, y - h / 2 + 2, -math.pi / 2 + rng.normal(0, 0.15), h, 0.7 * S, GM, 0.9, rng, 0.1, 0.0, taper=0.6)
                L.dab(fx, y - h + 2, rng.uniform(1.1, 1.8) * S, c, 0.95, 0.4)
                L.dab(fx - 0.4 * S, y - h + 1.4, 0.6 * S, mix(c, PINK_H, 0.6), 0.9, 0.3)
    # juncos e taboas onde o chão encontra a água
    shore = (F['grass'] | F['beach']) & (dw < 0.9 * T)
    for (x, y) in surface_points(M, shore, 9 * S, rng):
        for k in range(int(rng.integers(3, 7))):
            rx = x + rng.normal(0, 3 * S)
            h = rng.uniform(14, 30) * S
            a = -math.pi / 2 + rng.normal(0, 0.12)
            L.stroke(rx + math.cos(a) * h / 2, y + 2 + math.sin(a) * h / 2, a, h, rng.uniform(1.0, 1.6) * S, mix(REED_D, REED_L, rng.random()), 0.95,
                     rng, 0.2, 0.1, taper=0.85, bend=rng.normal(0, 0.15))
            if rng.random() < 0.35:
                L.stroke(rx + math.cos(a) * h * 0.78, y + math.sin(a) * h * 0.78, a, 4.5 * S, 2.2 * S, CATTAIL, 1.0, rng, 0.2, 0.1, taper=0.3)


def ferns_and_roots(L, F, M, room, rng):
    """Samambaias na pedra úmida (perto da água, nas Cachoeiras e na gruta) e as raízes e cipós
    pendurados embaixo das bordas de grama."""
    H, W = M.shape
    mat, dw = F['mat'], F['dw']
    wetok = (F['grass'] | (mat == 1)) & ((dw < 3 * T) | (mat == 3) | (mat == 4))
    for (x, y) in surface_points(M, wetok, 40 * S, rng):
        n = int(rng.integers(5, 9))
        for k in range(n):
            a = -math.pi / 2 + (k / (n - 1) - 0.5) * 2.4 + rng.normal(0, 0.1)
            ln = rng.uniform(0.5, 0.9) * T
            # a fronde arqueia: o traço com dobra e folíolos
            L.stroke(x + math.cos(a) * ln * 0.5, y + math.sin(a) * ln * 0.5, a, ln, 2.6 * S, mix(MOSS_D, LEAF_L, rng.uniform(0.2, 0.8)), 0.95, rng,
                     0.45, 0.3, taper=0.8, bend=0.35 * (1 if a > -math.pi / 2 else -1))
    # raízes penduradas: embaixo de uma borda que tem grama logo acima (a beira de um barranco)
    bot = M & ~np.vstack([M[1:], np.zeros((1, W), bool)])
    ys, xs = np.nonzero(bot)
    for i in np.nonzero(rng.random(len(xs)) < 1 / (14 * S))[0]:
        x, y = int(xs[i]), int(ys[i])
        if y + 2 * T >= H or M[y + 1:y + int(1.5 * T), x].any():
            continue
        up = M[max(0, y - int(1.6 * T)):y, x]
        if up.all() or not F['grass'][max(0, y - int(1.5 * T)):y, x].any():
            continue
        ln = rng.uniform(0.6, 2.2) * T
        cx = x
        segs = int(ln / (3 * S))
        cy = y
        for k in range(segs):
            nx_ = cx + rng.normal(0, 0.8 * S)
            L.stroke((cx + nx_) / 2, cy + 1.5 * S, math.pi / 2, 3.4 * S, 1.2 * S * (1 - k / segs * 0.6), mix(ROOT, LEAF_D, 0.3), 0.95, rng, 0.2, 0.1,
                     taper=0.2)
            if rng.random() < 0.3:
                L.dab(nx_ + rng.choice([-1, 1]) * 1.5 * S, cy + 1.5 * S, rng.uniform(1.0, 1.8) * S, mix(LEAF_D, LEAF_M, rng.random()), 0.95, 0.4)
            cx, cy = nx_, cy + 3 * S


def fall_cliff(L, room, rng):
    """Cais: o paredão de onde cai a cachoeira grande do fundo (RoomDef.backFall, x 43 a 48). As duas
    paredes escuras de cada lado da queda, alargando para baixo até o lago, com degraus, os fios de água
    escorrendo e a luz da lua na quina de dentro; em cima, a borda de pedra que a água transborda."""
    if room.name != 'cais':
        return
    x0, x1 = 43, 48
    cx = (x0 + x1) // 2
    ty = next(y for y in range(room.h) if room.g[y, cx] == '~')
    foot = ty * T + 4
    ND, NM, MOON = hexc(0x232a3c), hexc(0x3a4560), hexc(0xa8b8d8)
    for side in (-1, 1):
        inner = x0 * T + 3 if side < 0 else (x1 + 1) * T - 3
        n = 24
        din = [inner + side * rng.normal(0, 0.06) * T for _ in range(n + 1)]
        dout = [inner + side * (1.8 + 1.6 * i / n + 0.25 * math.sin(i * 0.9 + side) + rng.normal(0, 0.06)) * T for i in range(n + 1)]
        pts = [(din[i], foot * i / n) for i in range(n + 1)] + [(dout[i], foot * i / n) for i in range(n, -1, -1)]
        b = Box(min(min(din), min(dout)) - 2, 0, max(max(din), max(dout)) + 2, foot + 2)
        a = b.poly(pts)
        u = np.abs(b.xx - inner) / (3.4 * T)
        col = mix(NM, ND, sstep(0.0, 0.8, u)[..., None])
        streak = stretched_noise(b.h, b.w, 2.5 * S, 50 * S, rng, 2)
        col *= (0.75 + 0.45 * streak)[..., None]
        ledge = (b.yy + (value_noise(b.h, b.w, 40 * S, rng, 2) - 0.5) * 1.2 * T) % (rng.uniform(1.6, 2.6) * T)
        col = mix(col, MOON * 0.55, (sstep(0.5 * S, 0.0, ledge) * 0.5)[..., None])
        col = mix(col, ND * 0.6, (sstep(1.0 * S, 3.0 * S, ledge) * sstep(5 * S, 3 * S, ledge) * 0.5)[..., None])
        rim = sstep(0.7 * T, 0.0, np.abs(b.xx - inner))
        col = mix(col, MOON, (rim * 0.45)[..., None])
        wet = sstep(0.82, 0.93, stretched_noise(b.h, b.w, 1.4 * S, 90 * S, rng, 2))
        col = mix(col, MOON * 0.8, (wet * 0.35)[..., None])
        spray = sstep(foot - 3 * T, foot, b.yy) * sstep(3 * T, 0.0, np.abs(b.xx - inner))
        col = mix(col, hexc(0x8090a8), (spray * 0.4)[..., None])
        col = mix(col, hexc(0x4a5a80), 0.3)  # a névoa da noite: o paredão fica lá atrás
        b.put(L, np.clip(col, 0, 1), a)
    # a borda lá em cima: a laje que segura o rio de cima, a água sai por baixo dela no vão
    b = Box(x0 * T - 2.2 * T, 0, (x1 + 1) * T + 2.2 * T, 2.2 * T)
    k = np.arange(b.w, dtype=np.float32) + b.x0
    notch = sstep(x0 * T - 0.5 * T, x0 * T + 0.8 * T, k) * sstep((x1 + 1) * T + 0.5 * T, (x1 + 1) * T - 0.8 * T, k)
    yb = 1.7 * T - notch * 0.8 * T + (value_noise(1, b.w, 30 * S, rng, 2)[0] - 0.5) * 0.4 * T
    a = (b.yy < yb[None, :]).astype(np.float32)
    v = b.yy / yb[None, :]
    col = mix(NM * 1.2, ND, sstep(0.2, 1.0, v)[..., None])
    col *= (0.8 + 0.35 * stretched_noise(b.h, b.w, 30 * S, 2 * S, rng, 2))[..., None]
    col = mix(col, MOON, (sstep(0.92, 0.99, v) * 0.25)[..., None])
    b.put(L, np.clip(col, 0, 1), a)


def flora(room, F, M):
    rng = np.random.default_rng(SEEDS[room.name] + 1000)
    H, W = room.H, room.W
    L = Layer(W, H)
    fall_cliff(L, room, rng)
    pres = [Box(x0 * T, y0 * T, (x1 + 1) * T, (y1 + 1) * T) for (x0, y0, x1, y1) in PRESENT.get(room.name, [])]
    trunks = [(x, y) for (c, x, y) in room.spawns if c == 'T']
    walk = spans(room, '-')
    owned = {}
    loose = []
    for (x0, x1, row) in walk:
        t = next(((tx, ty) for (tx, ty) in trunks if ty > row and (x1 + 1 == tx or x0 - 1 == tx)), None)
        if t is None:
            loose.append((x0, x1, row))
        else:
            owned.setdefault(t, []).append((x0, x1, row))
    for (c, x, y) in room.spawns:
        if c == 't':
            sapling(L, (x + 0.5) * T + rng.uniform(-4, 4), (y + 1) * T + 2, rng, room)
    extra = []
    for (tx, ty) in trunks:
        inside = any(b.x0 <= (tx + 0.5) * T < b.x0 + b.w for b in pres)
        Lf = Layer(W, H) if inside else L
        tree(L, Lf, room, tx, ty, owned.get((tx, ty), []), rng)
        if inside:
            extra.append(((tx, ty), Lf))
    for (x0, x1, row) in loose:
        walkway(L, room, x0, x1, row, rng)
    ferns_and_roots(L, F, M, room, rng)
    grass(L, F, M, room, rng)
    return L, extra


def crop_flowers(Lf, out, name, idx):
    """Recorta a copa à parte em volta do que foi pintado (2x) e devolve o canto em pixels do jogo."""
    a = Lf.A
    ys, xs = np.nonzero(a > 0.01)
    x0, y0 = (int(xs.min()) // S) * S, (int(ys.min()) // S) * S
    x1, y1 = int(xs.max()) + 1, int(ys.max()) + 1
    img = Lf.image().crop((x0, y0, x1, y1))
    img.save(f'{out}/flores-{name}-{idx}.png')
    return x0 // S, y0 // S


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    name = args[0]
    out = args[1] if len(args) > 1 else os.path.join(HERE, 'hd_vale')
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    room = Room(name, terreno.load_maps()[name], seed=SEEDS[name])
    L, M, F = terrain(room)
    if ONLY != 'pinhos':
        L.image().save(f'{out}/terreno-{name}-2x.png')
        downsample(L, M, room).save(f'{out}/terreno-{name}.png')
        print('terreno', name, round(time.time() - t0, 1), 's', flush=True)
    if ONLY != 'terreno':
        P, extra = flora(room, F, M)
        P.image().save(f'{out}/pinhos-{name}-2x.png')
        downsample_soft(P, room).save(f'{out}/pinhos-{name}.png')
        for i, ((tx, ty), Lf) in enumerate(extra):
            ox, oy = crop_flowers(Lf, out, name, i)
            print('flores', name, i, 'arvore', tx, ty, 'canto', ox, oy, flush=True)
        print('pinhos', name, round(time.time() - t0, 1), 's', flush=True)

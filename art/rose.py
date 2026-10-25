"""Rosácea do Altar do Dízimo: o vitral redondo atrás do altar (128x128). Na segunda fase da luta
o Arcebispo quebra o vitral e a luz entra pelos buracos (deco-rose-broken).

uso: python3 rose.py <pasta_assets> [preview.png] [--hd]
--hd: no traço liso, 256x256 (o jogo mostra com 128 pixels do mundo; entra no hd.json)
"""
import math
import random
import sys
from PIL import Image

S = 128
C = 63.5
R = 61.0
# pedra da nave (fria) e o chumbo entre os vidros
STONE = [0x14161f, 0x1d202c, 0x272b3a, 0x343a4d, 0x485069]
LEAD = 0x0b0c12
# vidros: vermelho, azul, ouro, verde e roxo (escuro -> claro)
GLASS = {
    'red': [0x4a1016, 0x7a1c22, 0xa83a34, 0xd8644a],
    'blue': [0x111f46, 0x1f3a78, 0x3762b0, 0x6a94d8],
    'gold': [0x4a3312, 0x7f5a1e, 0xbf8f36, 0xeccb72],
    'green': [0x12301f, 0x1f5232, 0x3a8250, 0x6cb47a],
    'violet': [0x26143a, 0x43256a, 0x6a4698, 0x9a78c4],
}
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def rgb(c, a=255):
    return ((c >> 16) & 255, (c >> 8) & 255, c & 255, a)


def ramp(cols, v, x, y):
    """Valor 0..1 numa rampa, com pontilhado entre os tons (como as outras artes)."""
    v = max(0.0, min(0.999, v)) * (len(cols) - 1)
    i = int(v)
    f = v - i
    if i + 1 < len(cols) and f * 16 > BAYER[y % 4][x % 4] + 0.5:
        i += 1
    return cols[i]


def cell(r, a):
    """Em que pedaço da rosácea o ponto cai: (anel, setor) ou None se for pedra/chumbo."""
    deg = math.degrees(a) % 360
    if r < 9.5:
        return ('eye', 0)
    if r < 12.0:
        return None
    if r < 30.0:
        # doze pétalas: cada uma é um arco com a ponta para fora
        k = int(deg // 30)
        local = deg - k * 30 - 15
        petal = 30.0 - abs(local) * 0.9
        if r > petal - 1.6:
            return None
        if abs(local) > 13.4:
            return None
        return ('petal', k)
    if r < 32.5:
        return None
    if r < 55.0:
        # vinte e quatro janelinhas em volta
        k = int(deg // 15)
        local = deg - k * 15 - 7.5
        if abs(local) > 6.2:
            return None
        if 42.5 < r < 44.5:
            return None
        return ('outer' if r > 44 else 'mid', k)
    return None


def color_of(c):
    ring, k = c
    if ring == 'eye':
        return 'gold'
    if ring == 'petal':
        return ['red', 'blue'][k % 2]
    if ring == 'mid':
        return ['gold', 'violet', 'green'][k % 3]
    return ['blue', 'red', 'blue', 'gold'][k % 4]


def rose(broken=False, seed=7):
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    put = img.putpixel
    rnd = random.Random(seed)
    # o que sobra do vidro quebrado: só alguns cacos presos no chumbo
    keep = {}
    for ring, n in (('eye', 1), ('petal', 12), ('mid', 24), ('outer', 24)):
        for k in range(n):
            keep[(ring, k)] = rnd.random() < (0.22 if ring != 'outer' else 0.35)
    for y in range(S):
        for x in range(S):
            dx, dy = x + 0.5 - C, y + 0.5 - C
            r = math.hypot(dx, dy)
            if r > R:
                continue
            a = math.atan2(dy, dx)
            # moldura de pedra: anel grosso com a luz vindo de cima à esquerda
            if r > R - 5.5:
                lit = (-dx * 0.55 - dy * 0.75) / r
                v = 0.5 + 0.35 * lit + (0.25 if r > R - 1.5 else 0.0) * (1 if lit > 0 else -0.6)
                put((x, y), rgb(ramp(STONE, v, x, y)))
                continue
            c = cell(r, a)
            if c is None:
                # pedra fina da tracería
                lit = (-dx * 0.55 - dy * 0.75) / (r + 1e-6)
                put((x, y), rgb(ramp(STONE, 0.42 + 0.2 * lit, x, y)))
                continue
            if broken and not keep[c]:
                # buraco: sobra só uma beirada serrilhada de vidro presa no chumbo
                rim = False
                for ox, oy in ((2, 0), (-2, 0), (0, 2), (0, -2), (2, 2), (-2, -2), (2, -2), (-2, 2)):
                    q = (x + 0.5 + ox - C, y + 0.5 + oy - C)
                    if cell(math.hypot(*q), math.atan2(q[1], q[0])) != c:
                        rim = True
                        break
                if rim and (x * 5 + y * 3 + (x * y) % 7) % 4 != 0:
                    put((x, y), rgb(ramp(GLASS[color_of(c)], 0.3, x, y)))
                continue
            cols = GLASS[color_of(c)]
            # mais claro no alto e no meio de cada pedaço; uma rachadura no quebrado
            v = 0.55 + 0.25 * (-dy / R) + 0.15 * math.sin(r * 0.5 + a * 3.0)
            if broken and (x * 7 + y * 13) % 29 == 0:
                put((x, y), rgb(LEAD))
                continue
            put((x, y), rgb(ramp(cols, v, x, y)))
    # chumbo: escurece as bordas entre vidro e pedra
    px = img.load()
    out = img.copy()
    po = out.load()
    for y in range(1, S - 1):
        for x in range(1, S - 1):
            if px[x, y][3] == 0:
                continue
            ns = [px[x + 1, y], px[x - 1, y], px[x, y + 1], px[x, y - 1]]
            if any(n[3] == 0 for n in ns) and math.hypot(x + 0.5 - C, y + 0.5 - C) < R - 6:
                po[x, y] = rgb(LEAD)
    return out


def rose_hd(broken=False, seed=7, s=2):
    """A mesma rosácea no traço liso: 128*s pixels, vidro com degradê aceso por trás, chumbo como
    linha de tinta e a pedra com luz suave (desenhada em 4x e reduzida, para as bordas saírem lisas)."""
    import numpy as np
    from scipy import ndimage as ndi
    ss = s * 2
    n = S * ss
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    dx = (xx + 0.5) / ss - C
    dy = (yy + 0.5) / ss - C
    r = np.hypot(dx, dy)
    deg = np.degrees(np.arctan2(dy, dx)) % 360
    # id de cada pedaço (como cell()): 0 pedra, 1 olho, 2..13 pétalas, 14..37 meio, 38..61 fora
    cid = np.zeros((n, n), np.int32)
    cid[r < 9.5] = 1
    k30 = (deg // 30).astype(np.int32)
    local = deg - k30 * 30 - 15
    petal = (r >= 12.0) & (r < 30.0) & (r <= 30.0 - np.abs(local) * 0.9 - 1.6) & (np.abs(local) <= 13.4)
    cid[petal] = 2 + k30[petal]
    k15 = (deg // 15).astype(np.int32)
    l15 = deg - k15 * 15 - 7.5
    ring = (r >= 32.5) & (r < 55.0) & (np.abs(l15) <= 6.2) & ~((r > 42.5) & (r < 44.5))
    mid = ring & (r <= 44)
    outer = ring & (r > 44)
    cid[mid] = 14 + k15[mid]
    cid[outer] = 38 + k15[outer]
    names = [None, ('eye', 0)] + [('petal', k) for k in range(12)] + [('mid', k) for k in range(24)] + [('outer', k) for k in range(24)]
    rnd = random.Random(seed)
    keep = {}
    for rg, cnt in (('eye', 1), ('petal', 12), ('mid', 24), ('outer', 24)):
        for k in range(cnt):
            keep[(rg, k)] = rnd.random() < (0.22 if rg != 'outer' else 0.35)

    def hexf(c):
        return np.array([(c >> 16) & 255, (c >> 8) & 255, c & 255], np.float32) / 255

    out = np.zeros((n, n, 3), np.float32)
    alpha = np.zeros((n, n), np.float32)
    inside = r < R
    frame = inside & (r > R - 5.5)
    lit = (-dx * 0.55 - dy * 0.75) / np.maximum(r, 1e-3)
    st = [hexf(c) for c in STONE]

    def stone_ramp(v):
        v = np.clip(v, 0, 0.999) * (len(st) - 1)
        i = v.astype(np.int32)
        f = (v - i)[..., None]
        a = np.stack(st)[i]
        b = np.stack(st)[np.minimum(i + 1, len(st) - 1)]
        return a + (b - a) * f
    vf = 0.5 + 0.35 * lit + np.where(r > R - 1.5, np.where(lit > 0, 0.25, -0.15), 0.0)
    out[frame] = stone_ramp(vf)[frame]
    alpha[inside] = 1
    trac = inside & ~frame & (cid == 0)
    out[trac] = stone_ramp(0.42 + 0.2 * lit)[trac]
    glow = np.clip(1 - r / R, 0, 1)
    for i in range(1, len(names)):
        m = (cid == i) & inside & ~frame
        if not m.any():
            continue
        cols = [hexf(c) for c in GLASS[color_of(names[i])]]
        v = 0.5 + 0.25 * (-dy / R) + 0.12 * np.sin(r * 0.5 + np.radians(deg) * 3.0) + 0.25 * glow
        v = np.clip(v, 0, 0.999) * (len(cols) - 1)
        j = v.astype(np.int32)
        f = (v - j)[..., None]
        a = np.stack(cols)[j]
        b = np.stack(cols)[np.minimum(j + 1, len(cols) - 1)]
        g = a + (b - a) * f
        if broken and not keep[names[i]]:
            # buraco: sobra uma beirada de cacos presa no chumbo
            dist = ndi.distance_transform_edt(m)
            ph1, ph2, ph3 = rnd.uniform(0, 6.3), rnd.uniform(0, 6.3), rnd.uniform(0, 6.3)
            ang = np.arctan2(dy, dx)
            # cacos em ponta: a largura da beirada sobe e desce devagar ao longo do contorno
            jag = 0.5 + 0.5 * np.sin(ang * 23 + ph1) * np.sin(ang * 9 + r * 0.35 + ph2) + 0.25 * np.sin(r * 0.9 + ph3)
            shard = m & (dist < (0.7 + 3.2 * np.clip(jag, 0, 1) ** 2) * ss)
            out[shard] = (g * 0.75)[shard]
            alpha[m & ~shard] = 0
            continue
        out[m] = g[m]
    # chumbo: linha escura onde um pedaço encontra outro (ou a pedra)
    edge = np.zeros((n, n), bool)
    for ax in (0, 1):
        d = np.diff(cid, axis=ax) != 0
        if ax == 0:
            edge[1:] |= d
            edge[:-1] |= d
        else:
            edge[:, 1:] |= d
            edge[:, :-1] |= d
    edge = ndi.binary_dilation(edge, iterations=max(1, ss // 2)) & inside & (r < R - 5.0)
    if broken:
        edge &= alpha > 0
    lead = hexf(LEAD)
    out[edge] = lead
    # borda externa em tinta escura
    rim = inside & (r > R - 0.9)
    out[rim] = lead
    # reduz 2x (a média deixa as bordas lisas)
    pm = (out * alpha[..., None]).reshape(n // 2, 2, n // 2, 2, 3).mean((1, 3))
    am = alpha.reshape(n // 2, 2, n // 2, 2).mean((1, 3))
    a = np.clip(r.reshape(n // 2, 2, n // 2, 2).mean((1, 3)) * 0 + am, 0, 1)
    edge_aa = np.clip((R - r.reshape(n // 2, 2, n // 2, 2).mean((1, 3))) * ss + 0.5, 0, 1)
    a = np.minimum(a, edge_aa)
    rgb = pm / np.maximum(am[..., None], 1e-4)
    img = np.dstack([np.clip(rgb, 0, 1), a])
    return Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGBA')


def main(out, preview=None, hd=False):
    a = rose_hd(False) if hd else rose(False)
    b = rose_hd(True) if hd else rose(True)
    a.save(f'{out}/deco-rose.png')
    b.save(f'{out}/deco-rose-broken.png')
    if preview:
        w = a.width
        p = Image.new('RGBA', (w * 2 + 24, w + 16), (18, 20, 28, 255))
        glow = Image.new('RGBA', (w, w), (255, 236, 190, 255))
        p.alpha_composite(a, (8, 8))
        p.alpha_composite(glow, (w + 16, 8))
        p.alpha_composite(b, (w + 16, 8))
        p.resize((p.width * (3 if w == S else 2), p.height * (3 if w == S else 2)), Image.NEAREST if w == S else Image.LANCZOS).save(preview)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    main(args[0], args[1] if len(args) > 1 else None, hd='--hd' in sys.argv)

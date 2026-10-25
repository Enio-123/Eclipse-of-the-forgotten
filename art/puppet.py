"""Renderizador de pixel art por esqueleto 2D com volumes (luz, sombra e contorno seletivo).

Cada parte do corpo é um volume simples (elipsoide, cápsula ou polígono com normal própria).
A luz é calculada por pixel e quantizada em rampas de cor, como um artista faria à mão.
"""
import math

# ---------------- paletas (escuro -> claro) ----------------
RAMPS = {
    'cloak':     [0x1a0a10, 0x33101b, 0x541827, 0x782436, 0x9c3a47],
    'lining':    [0x0e080c, 0x180c14, 0x24111c, 0x311825, 0x40202f],
    'steel':     [0x161923, 0x272c3a, 0x414a5e, 0x6a7590, 0xa3aec4],
    'leather':   [0x130e0f, 0x251b1a, 0x3b2b25, 0x564033, 0x725a46],
    'cloth':     [0x13141c, 0x20222f, 0x323547, 0x474b62, 0x60667f],
    'porcelain': [0x5d5754, 0x958e86, 0xc4bcae, 0xe6dfd0, 0xfdf8ec],
    'gold':      [0x543913, 0x936622, 0xd29f45, 0xf2cd78, 0xfff1c2],
    'void':      [0x040306, 0x07060a, 0x0a0910, 0x0e0c14, 0x13111a],
    'flesh':     [0x2a1b1f, 0x4a3035, 0x6e4a4c, 0x936a66, 0xb48d84],
    'bone':      [0x3d3a38, 0x6b6660, 0x9c968b, 0xc8c1b2, 0xe8e2d4],
    'shadowcloth': [0x0c0c12, 0x14151d, 0x1e2029, 0x2a2d39, 0x383c4b],
    'robe':      [0x17151b, 0x27232a, 0x3b353b, 0x544c50, 0x70676a],
    'husk':      [0x24232a, 0x403f48, 0x64636e, 0x8d8b95, 0xb4b1ba],
    'ebony':     [0x0b090d, 0x17131a, 0x261f28, 0x372d38, 0x4b3f4b],
    'wood':      [0x22140e, 0x3d2718, 0x5e3f25, 0x825d38, 0xa8804f],
    'string':    [0x5c5750, 0x8a847a, 0xb5ae9f, 0xd9d2c2, 0xf3eddf],
}
# limiares de quantização (intensidade -> índice da rampa)
THRESH = [0.16, 0.36, 0.60, 0.84]

LIGHT = (-0.52, -0.66, 0.54)
_l = math.sqrt(sum(c * c for c in LIGHT))
LIGHT = tuple(c / _l for c in LIGHT)
HALF = (LIGHT[0], LIGHT[1], LIGHT[2] + 1.0)
_h = math.sqrt(sum(c * c for c in HALF))
HALF = tuple(c / _h for c in HALF)

SHINY = {'steel': (0.55, 14), 'gold': (0.6, 10), 'porcelain': (0.25, 8)}


def norm(v):
    l = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) or 1.0
    return (v[0] / l, v[1] / l, v[2] / l)


def rot(p, a):
    c, s = math.cos(a), math.sin(a)
    return (p[0] * c - p[1] * s, p[0] * s + p[1] * c)


class Prim:
    def __init__(self, name, mat, z, bbox, shade=1.0, flat=None):
        self.name, self.mat, self.z, self.bbox, self.shade, self.flat = name, mat, z, bbox, shade, flat

    def hit(self, x, y):
        raise NotImplementedError


class Ellipse(Prim):
    def __init__(self, name, mat, z, c, rx, ry, ang=0.0, bulge=1.0, **kw):
        r = max(rx, ry) + 1
        super().__init__(name, mat, z, (c[0] - r, c[1] - r, c[0] + r, c[1] + r), **kw)
        self.c, self.rx, self.ry, self.ang, self.bulge = c, rx, ry, ang, bulge

    def hit(self, x, y):
        dx, dy = rot((x - self.c[0], y - self.c[1]), -self.ang)
        u, v = dx / self.rx, dy / self.ry
        d = u * u + v * v
        if d > 1.0:
            return None
        nz = math.sqrt(max(0.0, 1.0 - d)) * self.bulge + 0.08
        nx, ny = rot((u, v), self.ang)
        return norm((nx, ny, nz))

    def local(self, x, y):
        dx, dy = rot((x - self.c[0], y - self.c[1]), -self.ang)
        return dx, dy


class Capsule(Prim):
    def __init__(self, name, mat, z, a, b, ra, rb, **kw):
        r = max(ra, rb) + 1
        super().__init__(name, mat, z, (min(a[0], b[0]) - r, min(a[1], b[1]) - r, max(a[0], b[0]) + r, max(a[1], b[1]) + r), **kw)
        self.a, self.b, self.ra, self.rb = a, b, ra, rb

    def hit(self, x, y):
        ax, ay = self.a
        bx, by = self.b
        vx, vy = bx - ax, by - ay
        L2 = vx * vx + vy * vy or 1e-6
        t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / L2))
        px, py = ax + vx * t, ay + vy * t
        r = self.ra + (self.rb - self.ra) * t
        dx, dy = x - px, y - py
        d = math.sqrt(dx * dx + dy * dy)
        if d > r:
            return None
        k = d / r
        return norm((dx / (d or 1) * k, dy / (d or 1) * k, math.sqrt(max(0.0, 1 - k * k)) + 0.1))


class Poly(Prim):
    """Polígono com função de normal opcional nf(x, y) -> (nx, ny, nz)."""

    def __init__(self, name, mat, z, pts, nf=None, **kw):
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        super().__init__(name, mat, z, (min(xs) - 1, min(ys) - 1, max(xs) + 1, max(ys) + 1), **kw)
        self.pts, self.nf = pts, nf

    def inside(self, x, y):
        ins = False
        pts = self.pts
        j = len(pts) - 1
        for i in range(len(pts)):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi:
                ins = not ins
            j = i
        return ins

    def hit(self, x, y):
        if not self.inside(x, y):
            return None
        return self.nf(x, y) if self.nf else (0.0, -0.2, 0.98)


class Decal:
    """Pinta sobre uma parte já desenhada (recortado pela parte 'clip')."""

    def __init__(self, clip, fn):
        self.clip, self.fn = clip, fn


def shade_index(mat, n, k=1.0):
    diff = max(0.0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2])
    i = 0.2 + 0.8 * diff
    if mat in SHINY:
        amt, p = SHINY[mat]
        spec = max(0.0, n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]) ** p
        i += amt * spec
    i *= k
    idx = 0
    for t in THRESH:
        if i > t:
            idx += 1
    return idx


def render(prims, decals, W, H, outline=True):
    """Retorna matriz de (rampa, índice) ou None, e o buffer de partes."""
    prims = sorted(prims, key=lambda p: -p.z)
    px = [[None] * W for _ in range(H)]
    part = [[None] * W for _ in range(H)]
    zbuf = [[-1e9] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            cx, cy = x + 0.5, y + 0.5
            for p in prims:
                b = p.bbox
                if cx < b[0] or cx > b[2] or cy < b[1] or cy > b[3]:
                    continue
                n = p.hit(cx, cy)
                if n is None:
                    continue
                if p.flat is not None:
                    px[y][x] = (p.mat, p.flat)
                else:
                    px[y][x] = (p.mat, shade_index(p.mat, n, p.shade))
                part[y][x] = p
                zbuf[y][x] = p.z
                break
    # decalques
    for d in decals:
        for y in range(H):
            for x in range(W):
                p = part[y][x]
                if p is None or p.name != d.clip:
                    continue
                r = d.fn(x + 0.5, y + 0.5, px[y][x])
                if r is not None:
                    px[y][x] = r
    # separação entre partes: escurece o pixel que está atrás de uma parte vizinha
    out = [row[:] for row in px]
    for y in range(H):
        for x in range(W):
            if px[y][x] is None:
                continue
            z = zbuf[y][x]
            me = part[y][x]
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and px[ny][nx] is not None:
                    o = part[ny][nx]
                    if o is not me and zbuf[ny][nx] > z + 0.25 and o.mat != me.mat:
                        m, i = out[y][x]
                        out[y][x] = (m, max(0, i - 2))
                        break
                    if o is not me and zbuf[ny][nx] > z + 0.25:
                        m, i = out[y][x]
                        out[y][x] = (m, max(0, i - 1))
                        break
    px = out
    # limpeza: remove pixels isolados de tom diferente
    for _ in range(1):
        out = [row[:] for row in px]
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                c = px[y][x]
                if c is None:
                    continue
                ns = [px[y - 1][x], px[y + 1][x], px[y][x - 1], px[y][x + 1]]
                if all(n is not None and n[0] == c[0] for n in ns):
                    vals = [n[1] for n in ns]
                    if all(v == vals[0] for v in vals) and vals[0] != c[1]:
                        out[y][x] = (c[0], vals[0])
        px = out
    return px, part


RIM_MATS = {'cloak', 'cloth', 'steel', 'leather', 'shadowcloth', 'robe', 'husk', 'ebony', 'wood'}


def rim_light(px, W, H):
    """Luz de contorno fria no lado direito/superior da silhueta (segunda fonte de luz)."""
    out = [row[:] for row in px]
    for y in range(H):
        for x in range(W):
            c = px[y][x]
            if c is None or c[0] not in RIM_MATS or not isinstance(c[1], int):
                continue
            r = x + 1 >= W or px[y][x + 1] is None
            ur = y - 1 < 0 or x + 1 >= W or px[y - 1][x + 1] is None
            if r and ur:
                out[y][x] = (c[0], min(4, c[1] + 2))
            elif r:
                out[y][x] = (c[0], min(4, c[1] + 1))
    return out


def to_image(px, W, H, outline_col=0x0b0910, rim=True):
    from PIL import Image
    if rim:
        px = rim_light(px, W, H)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    put = img.putpixel
    for y in range(H):
        for x in range(W):
            c = px[y][x]
            if c is None:
                continue
            col = RAMPS[c[0]][c[1]] if isinstance(c[1], int) else c[1]
            put((x, y), ((col >> 16) & 255, (col >> 8) & 255, col & 255, 255))
    if outline_col is not None:
        marks = []
        for y in range(H):
            for x in range(W):
                if px[y][x] is not None:
                    continue
                neigh = []
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and px[ny][nx] is not None:
                        neigh.append(px[ny][nx])
                if neigh:
                    marks.append((x, y, neigh))
        for x, y, neigh in marks:
            # contorno colorido: tom mais escuro da rampa vizinha, puxado para o preto
            m = neigh[0][0]
            base = RAMPS[m][0]
            col = mix(base, outline_col, 0.55)
            put((x, y), ((col >> 16) & 255, (col >> 8) & 255, col & 255, 255))
    return img


def mix(a, b, t):
    ar, ag, ab = (a >> 16) & 255, (a >> 8) & 255, a & 255
    br, bg, bb = (b >> 16) & 255, (b >> 8) & 255, b & 255
    return (round(ar + (br - ar) * t) << 16) | (round(ag + (bg - ag) * t) << 8) | round(ab + (bb - ab) * t)

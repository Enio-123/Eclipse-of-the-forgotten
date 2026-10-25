"""Efeitos de corte (apontando para a direita) e a flecha do arco.

uso: python3 slash.py <pasta_saida> [--hd]
Gera slash.png (espada), slash-big.png (foice), slash-small.png (adagas), slash-heavy.png (badalo),
slash-censer.png (incensário) e arrow.png. Com --hd (ou main(out, hd=2)) sai no traço liso, com 2
pixels por pixel do mundo: o fio sem serrilhado e o rastro em degradê no lugar do xadrez de pixels;
slashes.json guarda o tamanho do quadro na folha e a escala.
"""
import math, sys, json
import numpy as np
from PIL import Image

CORE, MID, EDGE, GOLD = (246, 241, 228), (196, 204, 220), (122, 134, 160), (210, 159, 69)
# foice: fio claro com rastro carmesim e brasas douradas
S_CORE, S_MID, S_EDGE, S_DEEP = (255, 244, 226), (232, 182, 160), (156, 52, 66), (84, 20, 34)
# adagas: cortes finos e frios
D_CORE, D_MID, D_EDGE = (240, 246, 255), (176, 196, 228), (104, 124, 168)
# badalo: arco grosso de cima para baixo, cor de bronze
H_CORE, H_MID, H_EDGE, H_DEEP = (255, 240, 208), (232, 184, 108), (156, 100, 44), (78, 46, 20)
# incensário: brasa dourada com rastro de fumaça cinza
C_CORE, C_MID, C_EDGE, C_DEEP = (255, 238, 196), (236, 190, 110), (150, 132, 120), (92, 88, 100)


def arc_frame(W, H, cx, R, squash, start, end, thick, alpha, cols, a0=-80, a1=80, trail=2.2, sparkle=None):
    core, mid, edge, rim = cols
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    cy = H / 2
    for y in range(H):
        for x in range(W):
            dx, dy = x + 0.5 - cx, (y + 0.5 - cy) * squash
            r = math.hypot(dx, dy)
            a = math.degrees(math.atan2(dy, dx))
            t = (a - a0) / (a1 - a0)
            if not (start <= t <= end):
                continue
            local = (t - start) / max(1e-6, end - start)
            th = thick * math.sin(math.pi * min(1, max(0, local))) ** 0.7
            d = R - r
            if d < 0:
                continue
            if d > th:
                if d < th * trail and (x + y) % 2 == 0 and local > 0.15:
                    img.putpixel((x, y), mid + (int(70 * alpha * (1 - (d - th) / (th * (trail - 1)))),))
                continue
            k = d / max(th, 1e-6)
            if k < 0.22:
                c = core
            elif k < 0.5:
                c = mid
            elif k < 0.8:
                c = edge
            else:
                c = rim if (x + y) % 3 == 0 else edge
            img.putpixel((x, y), c + (int(255 * alpha * (1.0 if k < 0.5 else 0.8)),))
    if sparkle:
        import random
        rnd = random.Random(sparkle)
        for _ in range(int(14 * alpha)):
            t = rnd.uniform(start, end)
            a = math.radians(a0 + (a1 - a0) * t)
            r = R - rnd.uniform(0, thick * 1.6)
            x, y = int(cx + math.cos(a) * r), int(cy + math.sin(a) * r / squash)
            if 0 <= x < W and 0 <= y < H:
                img.putpixel((x, y), GOLD + (230,))
    return img


def arc_hd(W, H, cx, R, squash, start, end, thick, alpha, cols, a0=-80, a1=80, trail=2.2, sparkle=None, s=2, aa=3):
    """O mesmo arco no traço liso: `s` pixels por pixel do mundo e aa x aa amostras por pixel."""
    core, mid, edge, rim = [np.array(c, np.float32) / 255 for c in cols]
    k = s * aa
    yy, xx = np.mgrid[0:H * k, 0:W * k].astype(np.float32)
    x = (xx + 0.5) / k
    y = (yy + 0.5) / k
    cy = H / 2
    dx, dy = x - cx, (y - cy) * squash
    r = np.hypot(dx, dy)
    t = (np.degrees(np.arctan2(dy, dx)) - a0) / (a1 - a0)
    local = np.clip((t - start) / max(1e-6, end - start), 0, 1)
    ok = (t >= start) & (t <= end)
    th = thick * np.maximum(np.sin(np.pi * local), 0) ** 0.7
    d = R - r
    q = d / np.maximum(th, 1e-6)
    # corpo: do fio claro (fora) para a borda escura (dentro), com passagens macias
    stops = [0.0, 0.22, 0.5, 0.8, 1.0]
    pal = [core, core, mid, edge, (rim + edge) / 2]
    col = np.stack([np.interp(q, stops, [c[i] for c in pal]) for i in range(3)], -1)
    body = ok & (d >= 0) & (d <= th)
    a_body = alpha * np.interp(q, [0.0, 0.5, 0.85, 1.0], [1.0, 1.0, 0.8, 0.55])
    # rastro: um véu claro e fino por dentro do arco, sumindo para o centro
    tail = ok & (d > th) & (d < th * trail)
    fade = 1 - (d - th) / np.maximum(th * (trail - 1), 1e-6)
    a_tail = alpha * 0.17 * np.clip(fade, 0, 1) * np.clip((local - 0.1) / 0.15, 0, 1)
    a = np.where(body, a_body, np.where(tail, a_tail, 0.0)).astype(np.float32)
    rgb = np.where(body[..., None], col, mid).astype(np.float32)
    if sparkle:
        import random
        rnd = random.Random(sparkle)
        gold = np.array(GOLD, np.float32) / 255
        for _ in range(int(14 * alpha)):
            ts = rnd.uniform(start, end)
            an = math.radians(a0 + (a1 - a0) * ts)
            rr = R - rnd.uniform(0, thick * 1.6)
            sx, sy = int(cx + math.cos(an) * rr) + 0.5, int(cy + math.sin(an) * rr / squash) + 0.5
            g = (np.exp(-((x - sx) ** 2 + (y - sy) ** 2) / (2 * 0.42 ** 2)) * 0.9).astype(np.float32)
            # a faísca por cima do que já há
            na = g + a * (1 - g)
            rgb = (gold * g[..., None] + rgb * (a * (1 - g))[..., None]) / np.maximum(na[..., None], 1e-5)
            a = na
    # reduz para s pixels por pixel do mundo (média com alfa pré-multiplicado)
    h, w = H * s, W * s
    pm = (rgb * a[..., None]).reshape(h, aa, w, aa, 3).mean((1, 3))
    am = a.reshape(h, aa, w, aa).mean((1, 3))
    out = np.dstack([pm / np.maximum(am[..., None], 1e-5), am])
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def arrow_hd(s=2):
    """A flecha no traço liso (24x7 no mundo): haste de madeira, ponta de ferro e penas vermelhas."""
    import ink, puppet
    from puppet import Capsule, Poly, norm
    puppet.RAMPS.setdefault('feather', [0x2a0c14, 0x5c1a26, 0x8e2c3a, 0xb94a52, 0xde7f78])
    prims = [
        Capsule('shaft', 'wood', 1.0, (2.6, 3.5), (18.6, 3.5), 0.55, 0.55),
        Poly('head', 'steel', 2.0, [(18.0, 1.9), (22.9, 3.5), (18.0, 5.1)], nf=lambda x, y: norm((0.2, -0.5 if y < 3.5 else 0.3, 0.85))),
        Poly('fletch', 'feather', 1.5, [(0.4, 0.9), (4.6, 2.9), (4.6, 3.4), (1.6, 3.2)], nf=lambda x, y: norm((-0.3, -0.6, 0.75))),
        Poly('fletch', 'feather', 1.6, [(0.4, 6.1), (4.6, 4.1), (4.6, 3.6), (1.6, 3.8)], nf=lambda x, y: norm((-0.3, 0.4, 0.85))),
    ]
    a = ink.render_frame(prims, [], 24, 7, s=s, style=dict(ink.HK, outline=0.7, inner=0.4, ao=0.0))
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def sheet(frames, path):
    W, H = frames[0].size
    s = Image.new('RGBA', (W * len(frames), H), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        s.alpha_composite(f, (i * W, 0))
    s.save(path)
    return s


def main(out, hd=0):
    """hd: pixels por pixel do mundo no traço liso (0 = pixel art). Devolve {imagem: escala} das
    imagens soltas que o jogo reduz (a flecha)."""
    global arc_frame
    pixel_arc = arc_frame
    if hd:
        arc_frame = lambda *a, **k: arc_hd(*a, s=hd, **k)
    meta = {}
    # espada (igual ao protótipo)
    W, H = 72, 64
    cols = (CORE, MID, EDGE, GOLD)
    fr = [arc_frame(W, H, 14, 34, 1.05, 0.05, 0.62, 7, 1.0, cols),
          arc_frame(W, H, 14, 34, 1.05, 0.0, 1.0, 9, 1.0, cols),
          arc_frame(W, H, 14, 34, 1.05, 0.38, 1.0, 5, 0.7, cols)]
    sheet(fr, f'{out}/slash.png')
    meta['slash'] = dict(w=W, h=H, ox=14 / W, frames=3, fps=24)
    # foice: arco largo e achatado, mais lento, rastro carmesim
    W, H = 104, 96
    cols = (S_CORE, S_MID, S_EDGE, S_DEEP)
    fr = [arc_frame(W, H, 14, 74, 1.55, 0.0, 0.42, 9, 1.0, cols, a0=-78, a1=82, trail=2.6, sparkle=1),
          arc_frame(W, H, 14, 74, 1.55, 0.0, 0.85, 12, 1.0, cols, a0=-78, a1=82, trail=2.6, sparkle=2),
          arc_frame(W, H, 14, 74, 1.55, 0.18, 1.0, 11, 0.95, cols, a0=-78, a1=82, trail=2.6, sparkle=3),
          arc_frame(W, H, 14, 74, 1.55, 0.55, 1.0, 6, 0.6, cols, a0=-78, a1=82, trail=2.0, sparkle=4)]
    sheet(fr, f'{out}/slash-big.png')
    meta['slash-big'] = dict(w=W, h=H, ox=14 / W, frames=4, fps=22)
    # adagas: dois cortes finos que se cruzam
    W, H = 52, 44
    cols = (D_CORE, D_MID, D_EDGE, D_EDGE)
    def dagger_frame(s0, e0, s1, e1, th, al):
        a = arc_frame(W, H, 8, 30, 1.25, s0, e0, th, al, cols, a0=-70, a1=60)
        b = arc_frame(W, H, 6, 26, 1.1, s1, e1, th * 0.8, al * 0.85, cols, a0=-40, a1=75)
        a.alpha_composite(b)
        return a
    fr = [dagger_frame(0.0, 0.7, 0.0, 0.0, 4, 1.0), dagger_frame(0.2, 1.0, 0.0, 0.8, 4.5, 1.0), dagger_frame(0.6, 1.0, 0.4, 1.0, 3, 0.7)]
    sheet(fr, f'{out}/slash-small.png')
    meta['slash-small'] = dict(w=W, h=H, ox=8 / W, frames=3, fps=30)
    # badalo: a pancada desce por cima da cabeça até o chão na frente
    W, H = 96, 92
    cols = (H_CORE, H_MID, H_EDGE, H_DEEP)
    fr = [arc_frame(W, H, 12, 62, 1.3, 0.0, 0.4, 11, 1.0, cols, a0=-96, a1=74, trail=2.4, sparkle=5),
          arc_frame(W, H, 12, 62, 1.3, 0.0, 0.86, 15, 1.0, cols, a0=-96, a1=74, trail=2.4, sparkle=6),
          arc_frame(W, H, 12, 62, 1.3, 0.22, 1.0, 13, 0.95, cols, a0=-96, a1=74, trail=2.4, sparkle=7),
          arc_frame(W, H, 12, 62, 1.3, 0.6, 1.0, 7, 0.6, cols, a0=-96, a1=74, trail=2.0, sparkle=8)]
    sheet(fr, f'{out}/slash-heavy.png')
    meta['slash-heavy'] = dict(w=W, h=H, ox=12 / W, frames=4, fps=20)
    # incensário: o arco desce por cima da cabeça até a frente, deixando fumaça
    W, H = 92, 88
    cols = (C_CORE, C_MID, C_EDGE, C_DEEP)
    fr = [arc_frame(W, H, 12, 58, 1.25, 0.0, 0.42, 9, 1.0, cols, a0=-100, a1=72, trail=3.0, sparkle=9),
          arc_frame(W, H, 12, 58, 1.25, 0.0, 0.88, 12, 1.0, cols, a0=-100, a1=72, trail=3.0, sparkle=10),
          arc_frame(W, H, 12, 58, 1.25, 0.24, 1.0, 11, 0.9, cols, a0=-100, a1=72, trail=3.2, sparkle=11),
          arc_frame(W, H, 12, 58, 1.25, 0.62, 1.0, 6, 0.55, cols, a0=-100, a1=72, trail=2.6, sparkle=12)]
    sheet(fr, f'{out}/slash-censer.png')
    meta['slash-censer'] = dict(w=W, h=H, ox=12 / W, frames=4, fps=20)
    # flecha
    a = Image.new('RGBA', (24, 7), (0, 0, 0, 0))
    px = a.putpixel
    for x in range(3, 19):
        px((x, 3), (98, 71, 47, 255))
    for x in range(4, 18, 3):
        px((x, 3), (130, 98, 60, 255))
    for (x, y) in [(19, 2), (19, 3), (19, 4), (20, 2), (20, 3), (20, 4), (21, 3), (22, 3)]:
        px((x, y), (196, 204, 220, 255))
    px((20, 3), (246, 241, 228, 255))
    for (x, y) in [(0, 1), (1, 1), (1, 2), (2, 2), (0, 5), (1, 5), (1, 4), (2, 4), (3, 2), (3, 4)]:
        px((x, y), (156, 58, 71, 255))
    made = {}
    if hd:
        a = arrow_hd(hd)
        made['arrow'] = hd
        for m in meta.values():
            m.update(w=m['w'] * hd, h=m['h'] * hd, scale=hd)
        arc_frame = pixel_arc
    a.save(f'{out}/arrow.png')
    json.dump(meta, open(f'{out}/slashes.json', 'w'), indent=1)
    # prévia
    prev = Image.new('RGBA', (520 * max(1, hd), 500 * max(1, hd)), (24, 28, 42, 255))
    y = 4
    for k in ('slash', 'slash-big', 'slash-small', 'slash-heavy', 'slash-censer'):
        im = Image.open(f'{out}/{k}.png')
        prev.alpha_composite(im, (4, y))
        y += im.height + 4
    prev.alpha_composite(a.resize((96, 28), Image.NEAREST), (400, 10))
    if not hd:
        prev = prev.resize((1040, 1000), Image.NEAREST)
    prev.save('slash_preview.png')
    return made


if __name__ == '__main__':
    main(sys.argv[1], hd=2 if '--hd' in sys.argv else 0)

"""ECLIPSE: os enfeites antigos da primeira área (o pixel art de art/deco.py: portão, estátua, lampiões,
balaustrada, andaime, correntes, santuário, pedestal, grade, musgo, capim, velas) na pintura em 3x.

É a mesma repintura de decos.py (a luz do lugar, pinceladas, bordas suaves). Ela já era feita em 3x e
depois reduzida para os pixels do jogo; aqui fica no tamanho em que foi pintada, com os degraus do pixel
alisados antes (Scale3x: as diagonais saem retas e os cantos dos retângulos continuam vivos). A forma, o
lugar e a cor de cada enfeite são os de sempre. As árvores do vale da memória saem da pintura em 2x
delas (arvores_deco.py), ampliada, e o espelho só é alisado (ele brilha: fica com a cor que tem).

uso: python3 ecl_enfeites.py <pasta_saida> [nome ...] [--preview=<pasta>]
Sai <pasta>/<nome>.png em 3x (nas folhas, os quadros no mesmo lugar, 3x maiores) e enfeites.json, com
as medidas para tools/eclipsepack.py --enfeites.
"""
import json
import os
import sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPTS = {a.split('=')[0]: (a.split('=') + [''])[1] for a in sys.argv[1:] if a.startswith('--')}
OUT = ARGS[0] if ARGS else os.path.join(HERE, 'hd_eclipse_enfeites')
sys.argv = sys.argv[:1]  # decos.py e arvores_deco.py leem a pasta deles de sys.argv
import decos  # noqa: E402
import arvores_deco  # noqa: E402
from arvore import paint_tree  # noqa: E402
from brush import Layer  # noqa: E402

SC = 3
ASSETS = os.path.join(HERE, '..', 'game', 'public', 'assets')
# o que emenda com o vizinho do lado (a balaustrada vai de tile em tile)
HTILE = {'deco-balustrade': 'deco-balustrade', 'deco-balustrade-broken': 'deco-balustrade'}
# o poste também é usado deitado, como travessa: a borda dele fica reta, sem suavizar
EXACT = {'deco-post'}
# fora de decos.py: o espelho (brilha, só alisa)
PLAIN = ['deco-mirror']


def scale3x(img):
    """Amplia 3x alisando os degraus do pixel art (Scale3x): só mexe onde as cores são iguais de verdade."""
    a = np.asarray(img.convert('RGBA'))
    h, w = a.shape[:2]
    v = a.astype(np.uint32)
    ids = v[..., 0] | (v[..., 1] << 8) | (v[..., 2] << 16) | (v[..., 3] << 24)
    ids = np.where(a[..., 3] == 0, 0, ids)
    p = np.pad(ids, 1, mode='edge')
    A, B, C = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    D, E, F = p[1:-1, :-2], p[1:-1, 1:-1], p[1:-1, 2:]
    G, H, I = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    pr = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode='edge')
    rB, rD, rE, rF, rH = pr[:-2, 1:-1], pr[1:-1, :-2], pr[1:-1, 1:-1], pr[1:-1, 2:], pr[2:, 1:-1]
    ok = (B != H) & (D != F)

    def pick(cond, r):
        return np.where((ok & cond)[..., None], r, rE)

    cells = [
        pick(D == B, rD),
        pick(((D == B) & (E != C)) | ((B == F) & (E != A)), rB),
        pick(B == F, rF),
        pick(((D == B) & (E != G)) | ((D == H) & (E != A)), rD),
        rE,
        pick(((B == F) & (E != I)) | ((H == F) & (E != C)), rF),
        pick(D == H, rD),
        pick(((D == H) & (E != I)) | ((H == F) & (E != G)), rH),
        pick(H == F, rF),
    ]
    out = np.zeros((h * SC, w * SC, 4), np.uint8)
    for k, e in enumerate(cells):
        out[k // 3::3, k % 3::3] = e
    return Image.fromarray(out, 'RGBA')


def src(name):
    return Image.open(os.path.join(decos.SRC, name + '.png')).convert('RGBA')


PACK = json.load(open(os.path.join(HERE, '..', 'game', 'src', 'gfx', 'pack.json')))['images']


def game(name):
    """O enfeite como está no jogo (1x, já na paleta do tema): do atlas de boot ou solto."""
    if name in PACK:
        i, x, y, w, h, _ = PACK[name]
        return Image.open(os.path.join(ASSETS, f'pack-{i}.png')).convert('RGBA').crop((x, y, x + w, y + h))
    return Image.open(os.path.join(ASSETS, name + '.png')).convert('RGBA')


def cells(p):
    """A pintura em 3x reduzida para as células de 1x (cor média pesada pelo alfa, e o alfa médio)."""
    H, W = p.shape[0] // SC, p.shape[1] // SC
    pa = p[..., 3]
    pm = (p[..., :3] * pa[..., None]).reshape(H, SC, W, SC, 3).mean((1, 3))
    am = pa.reshape(H, SC, W, SC).mean((1, 3))
    return pm / np.maximum(am[..., None], 1e-4), am


def match(big, small, sc=0.09, ss=0.8):
    """Leva a pintura em 3x para as cores do enfeite do jogo, que passou pela paleta do tema (o musgo da
    ponte, por exemplo, ficou cinza). Em cada ponto soma a diferença (jogo menos pintura reduzida) das
    células de 1x em volta, pesando mais as de cor parecida com a do ponto: a diferença de uma vela não
    vaza para a pedra ao lado. Devolve a pintura acertada e quanto ainda falta (0 a 255, média por célula)."""
    p = np.asarray(big, np.float32) / 255
    g = np.asarray(small.convert('RGBA'), np.float32) / 255
    H, W = g.shape[:2]
    assert p.shape[0] == H * SC and p.shape[1] == W * SC, (big.size, small.size)
    d, am = cells(p)
    both = np.minimum(am, g[..., 3])
    delta = g[..., :3] - d
    yy, xx = np.mgrid[0:H * SC, 0:W * SC]
    cy, cx = yy // SC, xx // SC
    fy = (yy + 0.5) / SC - 0.5 - cy
    fx = (xx + 0.5) / SC - 0.5 - cx
    num = np.zeros(p.shape[:2] + (3,), np.float32)
    den = np.zeros(p.shape[:2], np.float32)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            inside = (cy + oy >= 0) & (cy + oy < H) & (cx + ox >= 0) & (cx + ox < W)
            jy = np.clip(cy + oy, 0, H - 1)
            jx = np.clip(cx + ox, 0, W - 1)
            near = np.exp(-((p[..., :3] - d[jy, jx]) ** 2).sum(-1) / (2 * sc * sc)) + 1e-3
            w = both[jy, jx] * inside * near * np.exp(-((fy - oy) ** 2 + (fx - ox) ** 2) / (2 * ss * ss))
            num += w[..., None] * delta[jy, jx]
            den += w
    out = p.copy()
    out[..., :3] = np.clip(p[..., :3] + num / np.maximum(den, 1e-6)[..., None], 0, 1)
    d2, _ = cells(out)
    left = float((np.abs(g[..., :3] - d2) * both[..., None]).sum() / max(both.sum() * 3, 1e-6) * 255)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA'), left


def paint(name, theme, flow, frame_w, vtile, rng):
    img = src(name)
    w, h = img.size
    if vtile:
        stack = Image.new('RGBA', (w, h * 3))
        for i in range(3):
            stack.paste(img, (0, i * h))
        out = decos.relight(stack, theme, flow, rng, keep3=scale3x).crop((0, h * SC, w * SC, 2 * h * SC))
        if name in EXACT:
            out.putalpha(img.resize((w * SC, h * SC), Image.NEAREST).getchannel('A'))
        return out
    if name in HTILE:
        side = src(HTILE[name])
        row = Image.new('RGBA', (w * 3, h))
        row.paste(side, (0, 0))
        row.paste(img, (w, 0))
        row.paste(side, (2 * w, 0))
        return decos.relight(row, theme, flow, rng, keep3=scale3x).crop((w * SC, 0, 2 * w * SC, h * SC))
    if frame_w:
        res = Image.new('RGBA', (w * SC, h * SC))
        for fx in range(0, w, frame_w):
            fr = img.crop((fx, 0, fx + frame_w, h))
            res.paste(decos.relight(fr, theme, flow, rng, keep3=scale3x), (fx * SC, 0))
        return res
    return decos.relight(img, theme, flow, rng, keep3=scale3x)


def plain(name):
    """Só alisa: Scale3x e a borda suave, com a cor que o enfeite já tem."""
    big = np.asarray(scale3x(src(name)), np.float32) / 255
    a0 = big[..., 3]
    A = decos.sstep(0.3, 0.7, decos.blur(a0, 0.45 * SC))
    wsum = decos.blur(a0, 0.5 * SC) + 1e-4
    rgb = np.stack([decos.blur(big[..., i] * a0, 0.5 * SC) for i in range(3)], -1) / wsum[..., None]
    res = np.dstack([np.clip(rgb, 0, 1), np.clip(A, 0, 1)])
    return Image.fromarray((res * 255 + 0.5).astype(np.uint8), 'RGBA')


def tree(name):
    """A árvore na pintura em 2x de sempre (mesma semente, mesma árvore), ampliada para 3x."""
    w, h, size, kind, seed = arvores_deco.TREES[name]
    L = Layer(w * 2, h * 2)
    paint_tree(L, np.random.default_rng(seed), w, h * 2 - 1, size, kind, 0.0, petals=True if kind == 'pink' else None)
    o = np.asarray(L.image(), np.float32) / 255
    # amplia com o alfa multiplicado (a borda não puxa a cor do fundo vazio)
    pm = np.dstack([o[..., :3] * o[..., 3:4], o[..., 3:4]])
    chans = [np.asarray(Image.fromarray(pm[..., i]).resize((w * SC, h * SC), Image.LANCZOS)) for i in range(4)]
    a = np.clip(chans[3], 0, 1)
    rgb = np.stack(chans[:3], -1) / np.maximum(a[..., None], 1e-4)
    res = np.dstack([np.clip(rgb, 0, 1), a])
    return Image.fromarray((res * 255 + 0.5).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    only = ARGS[1:]
    rng = np.random.default_rng(13)
    meta = {}
    done = []
    for name, (theme, flow, fw, vt) in decos.DECOS.items():
        img1 = src(name)
        meta[name] = {'sx': SC, 'sy': SC}
        if fw:
            meta[name]['frame'] = [fw * SC, img1.height * SC]
        if only and name not in only:
            continue
        out, left = match(paint(name, theme, flow, fw, vt, rng), game(name))
        out.save(os.path.join(OUT, name + '.png'))
        done.append(name)
        print(name, out.size, 'falta %.1f' % left)
    for name in PLAIN:
        meta[name] = {'sx': SC, 'sy': SC}
        if only and name not in only:
            continue
        out, left = match(plain(name), game(name))
        out.save(os.path.join(OUT, name + '.png'))
        done.append(name)
        print(name, out.size, 'falta %.1f' % left)
    for name in arvores_deco.TREES:
        meta[name] = {'sx': SC, 'sy': SC}
        if only and name not in only:
            continue
        out, left = match(tree(name), game(name))
        out.save(os.path.join(OUT, name + '.png'))
        done.append(name)
        print(name, out.size, 'falta %.1f' % left)
    json.dump(meta, open(os.path.join(OUT, 'enfeites.json'), 'w'), indent=1, sort_keys=True)
    prev = OPTS.get('--preview')
    if prev:
        # lado a lado, no tamanho da tela do ECLIPSE: o enfeite do jogo (1x, ampliado sem filtro) e a pintura em 3x
        os.makedirs(prev, exist_ok=True)
        for name in done:
            new = Image.open(os.path.join(OUT, name + '.png')).convert('RGBA')
            old = game(name).resize(new.size, Image.NEAREST)
            sheet = Image.new('RGBA', (new.width * 2 + 24, new.height + 16), (58, 66, 92, 255))
            sheet.alpha_composite(old, (8, 8))
            sheet.alpha_composite(new, (new.width + 16, 8))
            sheet.convert('RGB').save(os.path.join(prev, name + '.png'))

"""Apoios pintados: o que segura as construções que ficavam soltas no ar (os pés do portão e a passagem
baixa da torre na ponte, o campanário dos telhados, a passagem sob o prédio do mercado, os pilares da laje
na boca da mina, o pé da ilha na descida e os arcos do aqueduto no rio).

Cada apoio é pedra da própria sala: o pintor do tema pinta um mapa em que o vão está cheio, e daqui sai só
o recorte na forma do apoio (pilar, arcada, pé de rocha), escurecido. No jogo ele entra como a camada
'parede-<sala>' (a mesma da parede do fundo das Torres): fica atrás de tudo o que tem física, o cavaleiro
passa na frente, e nada do caminho muda.

uso: python3 apoio.py <sala> [--previa]
Sai <pasta>/parede-<sala>-2x.png (o EXTREME, 2x) e game/public/assets/parede-<sala>.png (os pixels do jogo).
--previa grava também <pasta>/previa-<sala>.png: o apoio atrás do terreno da sala, para conferir a forma.
"""
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.join(HERE, '..', 'game')
MAPS = os.path.join(GAME, 'src', 'world', 'maps.ts')
ASSETS = os.path.join(GAME, 'public', 'assets')
TILE, S = 16, 2
T = TILE * S


# ---------- as formas (tudo em tiles, com fração; x1 e y1 ficam de fora) ----------
def rect(x0, y0, x1, y1, k, rec=False):
    """rec: parede recuada (o fundo de um vão), sem luz de aresta."""
    return dict(kind='rect', x0=x0, y0=y0, x1=x1, y1=y1, k=k, rec=rec)


def arcada(x0, y0, x1, y1, n, pier, k, fundo=None, crown=0.8, rise=None, ends=True, aro=0.0):
    """n vãos entre x0 e x1; pilares de 'pier' tiles (nas pontas também, com ends); o arco sobe 'rise'
    tiles (sem rise, meio vão: arco pleno) e o fecho fica 'crown' tiles abaixo de y0. 'fundo' é a parede
    recuada dentro dos vãos (sem ela, o vão é aberto). 'aro' é a largura (em tiles) da faixa de pedra mais
    clara que contorna cada arco (a arquivolta), do fecho até a altura de onde o arco nasce."""
    return dict(kind='arcada', x0=x0, y0=y0, x1=x1, y1=y1, n=n, pier=pier, k=k, fundo=fundo, crown=crown, rise=rise, ends=ends, aro=aro)


def rocha(cx, y0, y1, top, bot, k, waist=None, wob=0.45, seed=1):
    """Pé de rocha: meia largura 'top' em cima, 'bot' embaixo e 'waist' no meio (sem ela, a média), com a
    borda ondulada."""
    return dict(kind='rocha', cx=cx, y0=y0, y1=y1, top=top, bot=bot, k=k, waist=waist, wob=wob, seed=seed)


# sala -> pintor, modo EXTREME (o miolo da pedra pintado), névoa (cor, quanto), formas e, se o pintor
# precisar, trocas de texto na cópia dele (patch) para o material do apoio sair certo
APOIOS = {
    'ponte': dict(
        painter='terreno.py', x=True, haze=(0x1c2536, 0.14),
        shapes=[
            # os pés do portão: os dois pilares descem até o tabuleiro, por trás de quem passa, cada um
            # com a sua base mais larga
            rect(79, 16.8, 82, 22.1, 0.94), rect(96, 16.8, 99, 22.1, 0.94),
            rect(78.45, 21.05, 82.55, 22.1, 1.02), rect(95.45, 21.05, 99.55, 22.1, 1.02),
            # a passagem baixa na base da torre: a parede do fundo e os dois batentes
            rect(134, 19.9, 144, 22.1, 0.5, rec=True), rect(134, 19.9, 134.9, 22.1, 0.92), rect(143.1, 19.9, 144, 22.1, 0.92),
        ],
    ),
    'telhados': dict(
        painter='cidade.py', x=True, haze=(0x1a2238, 0.12),
        # o campanário: os dois tocos da laje descem como pilares até o alto da torre
        shapes=[rect(52, 8.8, 54, 13.1, 0.94), rect(63, 8.8, 65, 13.1, 0.94)],
    ),
    'mercado': dict(
        painter='cidade.py', x=True, haze=(0x1a2238, 0.1),
        # (sem as janelas da fachada: elas cairiam em cima dos arcos)
        patch=[('    windows(room, L, sol_main, street, seed, P)', '    pass')],
        # a rua passa por baixo do prédio: uma passagem coberta, com pilares e arcos baixos
        shapes=[arcada(84, 24.9, 112, 29.1, n=4, pier=1.6, k=0.76, fundo=0.36, crown=0.5, rise=1.15, aro=0.34)],
        ref=(84, 20, 112, 24),
    ),
    'boca': dict(
        painter='minas.py', x=False, haze=(0x1a120a, 0.08),
        # a laje do registro fica em cima de dois pilares de rocha deixados pela lavra
        shapes=[rocha(48.2, 20.7, 30.2, 1.7, 1.9, 0.86, waist=1.05, seed=3), rocha(54.0, 20.7, 30.2, 1.6, 2.0, 0.86, waist=1.1, seed=8)],
    ),
    'veio': dict(
        painter='minas.py', x=False, haze=(0x1a120a, 0.08),
        # a laje do cofre é a ponta de um esporão que desce do piso de cima
        shapes=[rocha(43.4, 19.8, 30.3, 3.6, 3.1, 0.84, waist=2.3, wob=0.55, seed=11)],
    ),
    'descida': dict(
        painter='vale.py', x=False, haze=(0x232a4a, 0.12),
        # a ilha fica de pé no lago em três pernas de arenito (dá para nadar por entre elas)
        shapes=[
            rocha(56.6, 38.5, 44.3, 3.4, 3.2, 0.72, waist=2.3, wob=0.5, seed=5),
            rocha(66.9, 38.5, 44.3, 4.1, 3.8, 0.72, waist=2.9, wob=0.55, seed=6),
            rocha(77.3, 38.5, 44.3, 3.0, 3.0, 0.72, waist=2.1, wob=0.5, seed=7),
        ],
        ref=(52, 30, 80, 38),
    ),
    'rio': dict(
        painter='vale.py', x=False, haze=(0x232a4a, 0.1),
        patch=[('mat[6:34, 96:148] = 2', 'mat[6:, 96:148] = 2')],
        # o aqueduto ganha os arcos: três pilares de cantaria descem até o leito do rio
        shapes=[arcada(100, 7.9, 143, 44.2, n=4, pier=3.0, k=0.94, fundo=None, crown=0.9, rise=None, ends=False, aro=0.6)],
        ref=(96, 10, 100, 40),
    ),
}
# o pintor do Vale pinta só o terreno aqui (a vegetação é outra camada)
EXTRA_ARGS = {'vale.py': ['--only=terreno']}


def load_rows(name):
    src = open(MAPS, encoding='utf-8').read()
    m = re.search(r'export const MAP_%s\s*=\s*\[(.*?)\];' % name.upper(), src, re.S)
    rows = re.findall(r"'([^']*)'", m.group(1))
    w = max(len(r) for r in rows)
    return [r.ljust(w, '.') for r in rows], src, m


def bbox(sh):
    if sh['kind'] == 'rocha':
        half = max(sh['top'], sh['bot'], sh['waist'] or 0) + sh['wob'] + 0.5
        return sh['cx'] - half, sh['y0'], sh['cx'] + half, sh['y1']
    return sh['x0'], sh['y0'], sh['x1'], sh['y1']


def corner(name):
    """A caixa (em tiles) do recorte que vai para o jogo: a das formas, com um tile de folga."""
    rows, _, _ = load_rows(name)
    h, w = len(rows), len(rows[0])
    bs = [bbox(sh) for sh in APOIOS[name]['shapes']]
    return (max(0, math.floor(min(b[0] for b in bs)) - 1), max(0, math.floor(min(b[1] for b in bs)) - 1),
            min(w, math.ceil(max(b[2] for b in bs)) + 1), min(h, math.ceil(max(b[3] for b in bs)) + 1))


def write_ts():
    """O canto de cada recorte, para o jogo pôr a pintura no lugar (game/src/gfx/apoios.ts)."""
    lines = ['// gerado por art2/apoio.py: o canto (em pixels da sala) da pintura de apoio de cada sala',
             'export const APOIO_AT: Record<string, [number, number]> = {']
    for nm in APOIOS:
        x0, y0, _, _ = corner(nm)
        lines.append(f'  {nm}: [{x0 * TILE}, {y0 * TILE}],')
    lines.append('};')
    open(os.path.join(GAME, 'src', 'gfx', 'apoios.ts'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')


def variant_maps(name, shapes, pad=2):
    """O maps.ts com o vão dos apoios cheio de pedra (e uma folga em volta, para a borda pintada do
    bloco ficar fora do recorte)."""
    rows, src, m = load_rows(name)
    h, w = len(rows), len(rows[0])
    g = [list(r) for r in rows]
    for sh in shapes:
        x0, y0, x1, y1 = bbox(sh)
        for y in range(max(0, math.floor(y0) - pad), min(h, math.ceil(y1) + pad)):
            for x in range(max(0, math.floor(x0) - pad), min(w, math.ceil(x1) + pad)):
                g[y][x] = '#'
    body = '\n'.join("  '%s'," % ''.join(r) for r in g)
    return src[:m.start(1)] + '\n' + body + '\n' + src[m.end(1):], h, w


def paint_variant(name, cfg, tmp):
    """Roda o pintor numa cópia de art2 com o mapa trocado e devolve a pintura 2x (RGBA float)."""
    art = os.path.join(tmp, 'art2')
    os.makedirs(os.path.join(tmp, 'game', 'src', 'world'), exist_ok=True)
    os.makedirs(art, exist_ok=True)
    for f in os.listdir(HERE):
        if f.endswith('.py'):
            shutil.copy(os.path.join(HERE, f), art)
    for a, b in cfg.get('patch', []):
        pp = os.path.join(art, cfg['painter'])
        src = open(pp, encoding='utf-8').read()
        if a not in src:
            sys.exit('a troca não achou o trecho no pintor: ' + a)
        open(pp, 'w', encoding='utf-8').write(src.replace(a, b))
    text, h, w = variant_maps(name, cfg['shapes'])
    open(os.path.join(tmp, 'game', 'src', 'world', 'maps.ts'), 'w', encoding='utf-8').write(text)
    out = os.path.join(art, 'saida')
    cmd = [sys.executable, cfg['painter'], name, out] + (['--x'] if cfg.get('x') else []) + EXTRA_ARGS.get(cfg['painter'], [])
    r = subprocess.run(cmd, cwd=art, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit('o pintor falhou:\n' + r.stdout[-2000:] + r.stderr[-4000:])
    # no modo EXTREME o terreno.py grava sempre em hd_x
    for d in (out, os.path.join(art, 'hd_x')):
        p = os.path.join(d, f'terreno-{name}-2x.png')
        if os.path.exists(p):
            return np.asarray(Image.open(p).convert('RGBA'), np.float32) / 255, h, w
    sys.exit('o pintor não gravou a pintura 2x')


def noise1(n, step, rng):
    """Ruído suave de n amostras (interpola pontos a cada 'step')."""
    pts = rng.uniform(-1, 1, n // step + 3)
    x = np.arange(n) / step
    i = x.astype(int)
    f = x - i
    f = f * f * (3 - 2 * f)
    return pts[i] * (1 - f) + pts[i + 1] * f


def masks(shapes, H, W):
    """Alfa e quanto de luz sobra (k) em cada pixel 2x; 'rec' marca a parede recuada dos vãos."""
    A = np.zeros((H, W), np.float32)
    K = np.ones((H, W), np.float32)
    rec = np.zeros((H, W), bool)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    def put(m, k, recess=False):
        m = np.clip(m, 0, 1)
        on = m > 0
        A[on] = np.maximum(A[on], m[on])
        K[m > 0.5] = k
        rec[m > 0.5] = recess

    for sh in shapes:
        if sh['kind'] == 'rect':
            m = ((xx >= sh['x0'] * T) & (xx < sh['x1'] * T) & (yy >= sh['y0'] * T) & (yy < sh['y1'] * T)).astype(np.float32)
            put(m, sh['k'], sh['rec'])
        elif sh['kind'] == 'arcada':
            x0, x1, y0, y1 = sh['x0'] * T, sh['x1'] * T, sh['y0'] * T, sh['y1'] * T
            n, pier = sh['n'], sh['pier'] * T
            npier = n + 1 if sh['ends'] else n - 1
            bay = (x1 - x0 - npier * pier) / n
            box = (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
            opening = np.zeros((H, W), bool)
            springs = np.zeros((H, W), np.float32)
            for i in range(n):
                bx0 = x0 + (pier if sh['ends'] else 0) + i * (bay + pier)
                cx = bx0 + bay / 2
                a = bay / 2
                b = sh['rise'] * T if sh['rise'] else a
                spring = y0 + sh['crown'] * T + b
                springs[:] = spring
                u = np.clip((xx - cx) / a, -1, 1)
                top = spring - b * np.sqrt(1 - u * u)
                opening |= (xx >= bx0) & (xx < bx0 + bay) & (yy >= top) & (yy < y1)
            if sh['fundo'] is not None:
                put((box & opening).astype(np.float32), sh['fundo'], True)
            put((box & ~opening).astype(np.float32), sh['k'])
            if sh['aro'] > 0:
                # a arquivolta: uma faixa mais clara em volta do arco, com um risco escuro por fora
                d_o = ndi.distance_transform_edt(~opening)
                r = sh['aro'] * T
                ring = box & ~opening & (d_o <= r) & (yy < springs + 0.3 * T)
                K[ring] = sh['k'] * 1.13
                K[box & ~opening & (d_o > r) & (d_o <= r + 2.2) & (yy < springs + 0.3 * T)] = sh['k'] * 0.7
        elif sh['kind'] == 'rocha':
            rng = np.random.default_rng(sh['seed'])
            y0, y1 = sh['y0'] * T, sh['y1'] * T
            n = int(y1 - y0)
            t = np.linspace(0, 1, n)
            waist = sh['waist'] if sh['waist'] is not None else (sh['top'] + sh['bot']) / 2
            # cintura no meio: a parábola passa por (0, top), (0.5, waist), (1, bot)
            half = sh['top'] * (1 - t) * (1 - 2 * t) + waist * 4 * t * (1 - t) + sh['bot'] * t * (2 * t - 1)
            wl = half + sh['wob'] * (0.6 * noise1(n, 46, rng) + 0.4 * noise1(n, 17, rng))
            wr = half + sh['wob'] * (0.6 * noise1(n, 46, rng) + 0.4 * noise1(n, 17, rng))
            m = np.zeros((H, W), np.float32)
            ys = np.arange(n) + int(y0)
            ok = (ys >= 0) & (ys < H)
            left = (sh['cx'] - wl) * T
            right = (sh['cx'] + wr) * T
            rowsel = ys[ok]
            m[rowsel] = np.clip(np.minimum(xx[rowsel] - left[ok, None], right[ok, None] - xx[rowsel]) + 0.5, 0, 1)
            put(m, sh['k'])
    return A, K, rec


def flatten(img, region):
    """Tira da pintura a sombra do pintor (o miolo que afunda no escuro conforme se afasta da borda) e deixa
    a pedra toda com a luz da face: sobra o desenho dos blocos e das camadas, com o contraste que ele tem na
    face (no miolo o pintor apaga o desenho junto com a luz). As medidas saem só do bloco dos apoios
    ('region'), para a referência ser a pedra dali (a cantaria do aqueduto, não o arenito do resto da sala).
    Devolve a cor e a luz de referência."""
    a = img[..., 3] > 0.5
    sel = a & region
    lum = img[..., 0] * 0.299 + img[..., 1] * 0.587 + img[..., 2] * 0.114
    # a luz média da pintura a cada distância da borda (de 4 em 4 pixels)
    d = ndi.distance_transform_edt(a)
    step = 4
    bins = np.minimum((d / step).astype(np.int64), int(8 * T / step))
    n = np.bincount(bins[sel], minlength=bins.max() + 1).astype(np.float64)
    tot = np.bincount(bins[sel], weights=lum[sel], minlength=bins.max() + 1)
    mean = tot / np.maximum(n, 1)
    mean = np.where(n > 50, mean, np.nan)
    ok = ~np.isnan(mean)
    mean = np.interp(np.arange(len(mean)), np.nonzero(ok)[0], mean[ok])
    mean = ndi.gaussian_filter1d(mean, 1.2, mode='nearest')
    # a face: a pedra entre um terço de tile e um tile e meio da borda
    b0, b1 = int(0.33 * T / step), int(1.5 * T / step)
    face = float((tot[b0:b1].sum()) / max(n[b0:b1].sum(), 1))
    local = mean[bins].astype(np.float32)
    gain = np.clip(face / np.maximum(local, 1e-3), 0.6, 4.5)
    ratio = np.clip(lum / np.maximum(local, 1e-3), 0.05, 4.0)
    # onde o pintor escureceu mais, o desenho ficou mais apagado: devolve o contraste
    p = 1 + 0.55 * np.clip((gain - 1) / 1.5, 0, 1)
    k = gain * ratio ** (p - 1)
    out = img[..., :3] * k[..., None]
    # o pintor também esfria a cor do miolo (a sombra dele puxa para o roxo): devolve o tom da face, distância
    # por distância, sem mexer na luz
    w3 = np.array([0.299, 0.587, 0.114])
    col = np.stack([np.bincount(bins[sel], weights=out[..., c][sel], minlength=len(n)) for c in range(3)], 1)
    fcol = col[b0:b1].sum(0) / max(n[b0:b1].sum(), 1)
    col = col / np.maximum(n, 1)[:, None]
    for c in range(3):
        v = np.where(n > 50, col[:, c], np.nan)
        good = ~np.isnan(v)
        col[:, c] = ndi.gaussian_filter1d(np.interp(np.arange(len(v)), np.nonzero(good)[0], v[good]), 1.2, mode='nearest')
    tone = (fcol / max(float(fcol @ w3), 1e-3))[None, :] / (col / np.maximum(col @ w3, 1e-3)[:, None])
    out = out * np.clip(tone, 0.6, 1.7)[bins].astype(np.float32)
    # o que sobrar de mancha larga (a luz de um cristal, a umidade) sai numa segunda passada, mais leve
    af = a.astype(np.float32)
    l2 = out[..., 0] * 0.299 + out[..., 1] * 0.587 + out[..., 2] * 0.114
    sg = 3.0 * T
    low = ndi.gaussian_filter(l2 * af, sg) / np.maximum(ndi.gaussian_filter(af, sg), 1e-3)
    out *= np.clip(face / np.maximum(low, 1e-3), 0.75, 1.4)[..., None]
    return np.clip(out, 0, 1), face


def under(name, H, W):
    """A quantos pixels (2x) cada ponto está abaixo da pedra de verdade da sala (longe = sem nada em cima)."""
    rows, _, _ = load_rows(name)
    sol = np.kron(np.array([[c in '#+_' for c in r] for r in rows], bool), np.ones((T, T), bool))
    out = np.full((H, W), 1e6, np.float32)
    c = np.full(W, 1e6, np.float32)
    for y in range(H):
        c = np.where(sol[y], 0, c + 1)
        out[y] = c
    return out


def runs(m):
    """Em cada ponto da máscara, quantos pixels até a borda dela para a esquerda, a direita e para baixo."""
    def acc(a):
        out = np.zeros(a.shape, np.float32)
        c = np.zeros(a.shape[1], np.float32)
        for i in range(a.shape[0]):
            c = np.where(a[i], c + 1, 0)
            out[i] = c
        return out
    left = acc(m.T).T
    right = acc(m.T[::-1])[::-1].T
    down = acc(m[::-1])[::-1]
    return left, right, down


def shade(A, K, rec, below):
    """A luz do apoio, como a do pintor: a aresta da esquerda pega a luz, a da direita e a de baixo ficam
    na sombra, o contorno escurece e a pedra de verdade em cima faz sombra no começo dele. Devolve o
    multiplicador final de luz."""
    inside = A > 0.5
    d_in = ndi.distance_transform_edt(inside)
    k = K.copy()
    front = inside & ~rec
    left, right, down = runs(front)
    k = np.where(front, k * (1 + 0.24 * np.exp(-left / (2.4 * S))), k)
    k = np.where(front, k * (1 - 0.3 * np.exp(-right / (2.8 * S))), k)
    k = np.where(front, k * (1 - 0.3 * np.exp(-down / (3.2 * S))), k)
    # contorno escuro em toda a silhueta
    k *= 1 - 0.3 * np.exp(-d_in / 2.4)
    # a pedra de verdade em cima faz sombra no começo do apoio
    k *= 1 - 0.3 * np.exp(-below / (0.7 * T))
    if rec.any():
        # a parede recuada escurece junto dos pilares e embaixo do que a cobre
        d_p = ndi.distance_transform_edt(~front)
        k = np.where(rec, k * (1 - 0.3 * np.exp(-d_p / 12.0)), k)
        top = np.cumsum(rec, axis=0).astype(np.float32)
        k = np.where(rec, k * (1 - 0.22 * np.exp(-top / 18.0)), k)
    return k


def run(name, preview=False):
    cfg = APOIOS[name]
    hd = os.path.join(HERE, 'hd_apoio')
    os.makedirs(hd, exist_ok=True)
    cache = os.path.join(hd, f'cheio-{name}-2x.png')
    if '--recorte' in sys.argv and os.path.exists(cache):
        img = np.asarray(Image.open(cache).convert('RGBA'), np.float32) / 255
        rows, _, _ = load_rows(name)
        h, w = len(rows), len(rows[0])
    else:
        tmp = tempfile.mkdtemp(prefix='tmp-', dir=hd)
        try:
            img, h, w = paint_variant(name, cfg, tmp)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGBA').save(cache)
    H, W = h * T, w * T
    A, K, rec = masks(cfg['shapes'], H, W)
    k = shade(A, K, rec, under(name, H, W))
    hz = cfg['haze']
    hc = np.array([(hz[0] >> 16) & 255, (hz[0] >> 8) & 255, hz[0] & 255], np.float32) / 255
    region = np.zeros((H, W), bool)
    for sh in cfg['shapes']:
        bx0, by0, bx1, by1 = bbox(sh)
        region[max(0, (math.floor(by0) - 2) * T):(math.ceil(by1) + 2) * T, max(0, (math.floor(bx0) - 2) * T):(math.ceil(bx1) + 2) * T] = True
    flat, face = flatten(img, region)
    if cfg.get('ref'):
        # o tom da pedra de verdade ao lado (uma caixa do terreno pintado da sala): o apoio fica da mesma cor
        ter = np.asarray(Image.open(os.path.join(ASSETS, f'terrain-{name}.png')).convert('RGBA'), np.float32) / 255
        rx0, ry0, rx1, ry1 = [int(v * TILE) for v in cfg['ref']]
        boxr = ter[ry0:ry1, rx0:rx1]
        rc = boxr[boxr[..., 3] > 0.5][:, :3].mean(0)
        sc = flat[(A > 0.5) & (img[..., 3] > 0.5) & ~rec].mean(0)
        w3 = np.array([0.299, 0.587, 0.114], np.float32)
        flat = flat * ((rc / max(float(rc @ w3), 1e-3)) / (sc / max(float(sc @ w3), 1e-3)))[None, None, :]
    rgb = flat * k[..., None]
    rgb = rgb * (1 - hz[1]) + hc * hz[1] * np.clip(k[..., None] * 1.6, 0, 1)
    # só onde o pintor pintou pedra
    A = A * (img[..., 3] > 0.5)
    out2 = np.dstack([np.clip(rgb, 0, 1), A])
    im2 = Image.fromarray((out2 * 255 + 0.5).astype(np.uint8), 'RGBA')
    im2.save(os.path.join(hd, f'parede-{name}-2x.png'))
    # os pixels do jogo: média 2x2 (pela área coberta), alfa exato e poucas cores
    a = out2[..., 3:4]
    pm = (out2[..., :3] * a).reshape(h * TILE, S, w * TILE, S, 3).mean((1, 3))
    am = a[..., 0].reshape(h * TILE, S, w * TILE, S).mean((1, 3))
    c = pm / np.maximum(am[..., None], 1e-4)
    small = Image.fromarray((np.dstack([np.clip(c, 0, 1), (am > 0.5).astype(np.float32)]) * 255 + 0.5).astype(np.uint8), 'RGBA')
    q = small.convert('RGB').quantize(colors=40, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
    q.putalpha(small.getchannel('A'))
    # para o jogo vai só a caixa dos apoios (o resto da sala seria placa de vídeo gasta com nada)
    cx0, cy0, cx1, cy1 = corner(name)
    q.crop((cx0 * TILE, cy0 * TILE, cx1 * TILE, cy1 * TILE)).save(os.path.join(ASSETS, f'parede-{name}.png'), optimize=True)
    print('apoio', name, small.size, 'pixels cobertos', int((am > 0.5).sum()), 'luz da face', round(face, 3), flush=True)
    if preview:
        ter = Image.open(os.path.join(ASSETS, f'terrain-{name}.png')).convert('RGBA')
        x0 = min(bbox(s)[0] for s in cfg['shapes'])
        y0 = min(bbox(s)[1] for s in cfg['shapes'])
        x1 = max(bbox(s)[2] for s in cfg['shapes'])
        y1 = max(bbox(s)[3] for s in cfg['shapes'])
        box = (max(0, int((x0 - 10) * TILE)), max(0, int((y0 - 12) * TILE)), min(w * TILE, int((x1 + 10) * TILE)), min(h * TILE, int((y1 + 5) * TILE)))
        bg = Image.new('RGBA', ter.size, (58, 66, 96, 255))
        bg.alpha_composite(q)
        bg.alpha_composite(ter)
        pv = bg.crop(box)
        pv = pv.resize((pv.width * 2, pv.height * 2), Image.NEAREST)
        pv.convert('RGB').save(os.path.join(hd, f'previa-{name}.png'))


if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if not a.startswith('--')]
    write_ts()
    for nm in names or list(APOIOS):
        run(nm, '--previa' in sys.argv)

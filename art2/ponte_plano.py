"""O desenho dos fundos da Ponte (e do título, que é um recorte deles), tirado dos pintores antigos sem mudar
nada neles: roda fundos_ponte.py e titulo.py de verdade, anotando o que foi sorteado pelo caminho, para a
repintura em 3x do ECLIPSE (ecl_ponte.py) pôr cada coisa onde ela já estava.

O que fica anotado (cap/ponte_plano.json, em px da pintura 2x):
  - o estado do sorteio antes de cada ruído (as nuvens, a crista das montanhas, a névoa): a repintura refaz
    o mesmo ruído, só que maior;
  - o estado do sorteio na hora de desenhar a cidade alta (as casas saem as mesmas);
  - as pinceladas soltas: janelas acesas da cidade e do castelo, raios do eclipse, capim do penhasco;
  - as luzes da cidade lá embaixo, no abismo.

uso: python3 ponte_plano.py        (uns 2 min; grava cap/ponte_plano.json e confere a cidade alta)
"""
import json
import math
import os
import sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PLAN = os.path.join(HERE, 'cap', 'ponte_plano.json')
W2, H2 = 2200, 760


def gen(state):
    """Um gerador no estado anotado."""
    g = np.random.default_rng()
    g.bit_generator.state = state
    return g


def town(rng):
    """As casas da cidade alta (town_mask de fundos_ponte.py, os mesmos sorteios na mesma ordem):
    lista de dicts com o corpo, o telhado (ou None) e a torre com a agulha (ou None)."""
    out = []
    x = 560.0
    while x < 1460:
        w = rng.uniform(26, 60)
        top = 470 - rng.uniform(18, 60) * (0.5 + 0.5 * (x - 560) / 900)
        b = dict(x=x, w=w, top=top, roof=None, tower=None)
        if rng.random() < 0.7:
            fx = rng.uniform(0.3, 0.7)
            b['roof'] = (x + w * fx, top - rng.uniform(10, 30))
        if rng.random() < 0.18:
            tx = x + w * 0.5
            th = rng.uniform(50, 110)
            b['tower'] = (tx, th, rng.uniform(20, 40))
        out.append(b)
        x += w * rng.uniform(0.7, 1.05)
    return out


def town_mask2(houses):
    """A máscara 2x da cidade alta a partir da lista (para conferir com a do pintor antigo)."""
    from shapes import Mask
    m = Mask(W2, H2)
    for b in houses:
        x, w, top = b['x'], b['w'], b['top']
        m.rect(x, top, x + w, 520)
        if b['roof']:
            m.poly([(x - 2, top + 1), b['roof'], (x + w + 2, top + 1)])
        if b['tower']:
            tx, th, sh = b['tower']
            m.rect(tx - 6, top - th, tx + 6, top)
            m.poly([(tx - 9, top - th + 2), (tx, top - th - sh), (tx + 9, top - th + 2)])
    return m.array()


class Rec:
    """Anota, enquanto um pintor antigo roda: os ruídos (com o estado do sorteio antes de cada um), as
    pinceladas soltas (as de paint() levam clip e ficam de fora) e as pintas de luz."""

    def __init__(self, mod):
        self.mod = mod
        self.noise, self.strokes, self.dabs = [], [], []

    def __enter__(self):
        import brush
        rec = self
        self._stroke, self._dab = brush.Layer.stroke, brush.Layer.dab
        self._vn, self._n1 = self.mod.value_noise, getattr(self.mod, 'noise1d', None)

        def stroke(layer, cx, cy, ang, length, width, col, alpha=1.0, rng=None, bristle=0.45, dry=0.0, taper=0.45, bend=0.0, soft=0.9, clip=None, col2=None):
            if clip is None:
                rec.strokes.append([float(cx), float(cy), float(ang), float(length), float(width), [float(v) for v in col], float(alpha), float(taper)])
            return rec._stroke(layer, cx, cy, ang, length, width, col, alpha, rng, bristle, dry, taper, bend, soft, clip, col2)

        def dab(layer, cx, cy, r, col, alpha=1.0, soft=1.0):
            rec.dabs.append([float(cx), float(cy), float(r), [float(v) for v in col], float(alpha), float(soft)])
            return rec._dab(layer, cx, cy, r, col, alpha, soft)

        def vn(H, W, cell, rng, octaves=1, persistence=0.5):
            rec.noise.append(dict(fn='value_noise', H=int(H), W=int(W), cell=float(cell), octaves=int(octaves), state=rng.bit_generator.state))
            return rec._vn(H, W, cell, rng, octaves, persistence)

        def n1(n, cell, rng, octaves=2):
            rec.noise.append(dict(fn='noise1d', n=int(n), cell=float(cell), octaves=int(octaves), state=rng.bit_generator.state))
            return rec._n1(n, cell, rng, octaves)

        brush.Layer.stroke, brush.Layer.dab = stroke, dab
        self.mod.value_noise = vn
        if self._n1:
            self.mod.noise1d = n1
        return self

    def __exit__(self, *a):
        import brush
        brush.Layer.stroke, brush.Layer.dab = self._stroke, self._dab
        self.mod.value_noise = self._vn
        if self._n1:
            self.mod.noise1d = self._n1


def make():
    import tempfile
    tmp = tempfile.mkdtemp(prefix='ponte_plano_')
    argv = sys.argv
    sys.argv = [argv[0], tmp]
    import fundos_ponte as fp
    import titulo
    sys.argv = argv
    plan = {}

    # ---- o céu: os dois ruídos das nuvens são os primeiros sorteios (anotados assim mesmo) e os raios ----
    with Rec(fp) as r:
        fp.sky_layer(np.random.default_rng(1))
    plan['sky'] = dict(noise=r.noise, rays=r.strokes)
    print('céu:', len(r.noise), 'ruídos,', len(r.strokes), 'raios', flush=True)

    # ---- o castelo, a cidade alta e as montanhas ----
    box = {}
    old_town = fp.town_mask

    def town_mask(W, H, rng):
        box['state'] = rng.bit_generator.state
        box['mask'] = old_town(W, H, rng)
        return box['mask']

    fp.town_mask = town_mask
    with Rec(fp) as r:
        fp.far_layers(np.random.default_rng(2))
    fp.town_mask = old_town
    houses = town(gen(box['state']))
    diff = float(np.abs(town_mask2(houses) - box['mask']).max())
    print('longe:', len(r.noise), 'ruídos,', len(houses), 'casas (diferença da máscara: %.4f),' % diff, len(r.strokes), 'janelas', flush=True)
    assert diff < 1e-6, 'a cidade alta refeita não bate com a do pintor antigo'
    # as janelas da cidade (alfa 0.75) e as do castelo (0.95, cada uma com a pinta do halo)
    plan['far'] = dict(noise=r.noise, town=box['state'],
                       town_wins=[s for s in r.strokes if abs(s[6] - 0.75) < 1e-6],
                       castle_wins=[s for s in r.strokes if abs(s[6] - 0.95) < 1e-6])
    assert len(plan['far']['town_wins']) + len(plan['far']['castle_wins']) == len(r.strokes)

    # ---- o abismo: a névoa, o aqueduto e as luzes da cidade lá embaixo ----
    with Rec(fp) as r:
        fp.mid_layers(np.random.default_rng(3))
    # cada luz são duas pintas: o miolo (suave 1.2) e o halo (suave 6)
    plan['mid'] = dict(noise=r.noise, lights=[d for d in r.dabs if abs(d[5] - 1.2) < 1e-6], halos=[d for d in r.dabs if abs(d[5] - 6) < 1e-6])
    print('abismo:', len(r.noise), 'ruídos,', len(plan['mid']['lights']), 'luzes', flush=True)
    assert len(plan['mid']['lights']) == len(plan['mid']['halos']) == 170

    # ---- o penhasco do título: os ruídos e o capim molhado ----
    with Rec(titulo) as r:
        titulo.cliff(np.random.default_rng(61))
    plan['title'] = dict(noise=r.noise, grass=r.strokes)
    print('título:', len(r.noise), 'ruídos,', len(r.strokes), 'fios de capim', flush=True)

    os.makedirs(os.path.dirname(PLAN), exist_ok=True)
    json.dump(plan, open(PLAN, 'w'), separators=(',', ':'))
    print('gravado', PLAN, os.path.getsize(PLAN) // 1024, 'KB')
    return plan


def load():
    if not os.path.exists(PLAN):
        return make()
    return json.load(open(PLAN))


if __name__ == '__main__':
    make()

"""O desenho dos fundos da Lembrança (o vale antes do eclipse), tirado do pintor antigo sem mudar nada nele:
roda fundos_memoria.py de verdade, anotando pelo caminho o que foi sorteado, para a repintura em 3x do
ECLIPSE (ecl_memoria.py) pôr cada coisa onde ela já estava.

Fica anotado (cap/memoria_plano.json, em px da pintura 2x), na ordem em que aconteceu em cada camada:
  vn   o estado do sorteio antes de um ruído (nuvens, sulcos e neve das montanhas, sombra de nuvem no campo)
  pn   idem, de um ruído de uma linha só que dá a volta (a crista dos morros)
  st   um ruído esticado na vertical (o vn dele vem logo depois)
  pk   uma cordilheira (o estado do sorteio antes dela e a crista de 16 em 16 colunas, para conferir)
  mt   uma camada de montanhas (até onde vão as anotações dela)
  md   um campo (idem; as flores e os tufos de capim ficam dentro)
  hs   uma casa (a fumaça fica dentro)
  tr   uma árvore: pé, tamanho, tipo, névoa, a caixa dela, o sorteio da copa e, dentro, o tronco, os galhos,
       as folhas soltas e as pétalas (em px da caixa)
  sh   a sombra de uma árvore no chão
  s d  uma pincelada solta e uma pinta (as de paint() levam recorte e ficam de fora)

uso: python3 memoria_plano.py [pasta]      (uns 4 min; grava cap/memoria_plano.json e, na pasta, a pintura
                                            antiga em 2x de cada camada, para comparar)
"""
import json
import os
import sys
import time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PLAN = os.path.join(HERE, 'cap', 'memoria_plano.json')
SEEDS = {'sky': 51, 'far': 52, 'mid': 53}


def gen(state):
    """Um gerador no estado anotado."""
    g = np.random.default_rng()
    g.bit_generator.state = state
    return g


def r2(v):
    return round(float(v), 2)


def r4(v):
    return round(float(v), 4)


def rgb(c):
    return [r4(v) for v in np.broadcast_to(np.asarray(c, np.float32), (3,))]


class Rec:
    """Anota o que um pintor antigo faz enquanto roda."""

    def __init__(self, fm):
        self.fm = fm
        self.ev = []
        self.canopy = None

    def __enter__(self):
        import brush
        import arvore
        fm, ev, rec = self.fm, self.ev, self
        S = self.saved = dict(stroke=brush.Layer.stroke, dab=brush.Layer.dab, vn=fm.value_noise, pn=fm.pnoise1d,
                              st=fm.streaks, pk=fm.peak_range, mt=fm.mountains, md=fm.meadow, hs=fm.house,
                              tr=fm.paint_tree, sh=fm.ground_shadow, canopy=arvore.canopy_field)

        def stroke(layer, cx, cy, ang, length, width, col, alpha=1.0, rng=None, bristle=0.45, dry=0.0, taper=0.45, bend=0.0, soft=0.9, clip=None, col2=None):
            if clip is None:
                ev.append(['s', r2(cx), r2(cy), r4(ang), r2(length), r2(width), rgb(col), r4(alpha), r2(taper)])
            return S['stroke'](layer, cx, cy, ang, length, width, col, alpha, rng, bristle, dry, taper, bend, soft, clip, col2)

        def dab(layer, cx, cy, r, col, alpha=1.0, soft=1.0):
            ev.append(['d', r2(cx), r2(cy), r2(r), rgb(col), r4(alpha), r2(soft)])
            return S['dab'](layer, cx, cy, r, col, alpha, soft)

        def vn(H, W, cell, rng, octaves=1, persistence=0.5):
            ev.append(['vn', int(H), int(W), float(cell), int(octaves), rng.bit_generator.state])
            return S['vn'](H, W, cell, rng, octaves, persistence)

        def pn(W, TW, cell, rng, octaves=3):
            ev.append(['pn', int(W), int(TW), float(cell), int(octaves), rng.bit_generator.state])
            return S['pn'](W, TW, cell, rng, octaves)

        def st(H, W, cx, cy, rng, octaves=2):
            ev.append(['st', int(H), int(W), float(cx), float(cy), int(octaves)])
            return S['st'](H, W, cx, cy, rng, octaves)

        def pk(W, TW, H, rng, n, top_min, top_max, slope_min, slope_max):
            e = ['pk', int(W), int(TW), int(n), float(top_min), float(top_max), float(slope_min), float(slope_max), rng.bit_generator.state, None]
            ev.append(e)
            out = S['pk'](W, TW, H, rng, n, top_min, top_max, slope_min, slope_max)
            e[-1] = [round(float(v), 3) for v in out[0][::16]]
            return out

        def mt(W, TW, H, rng, yy, xx, n, top_min, top_max, smin, smax, haze, snow_amt, base_fade):
            e = ['mt', float(haze), float(snow_amt), float(base_fade), None]
            ev.append(e)
            out = S['mt'](W, TW, H, rng, yy, xx, n, top_min, top_max, smin, smax, haze, snow_amt, base_fade)
            e[-1] = len(ev)
            return out

        def md(W, TW, H, rng, yy, xx, ridge, cA, cB, haze, shadow_amt, flowers):
            e = ['md', rgb(cA), rgb(cB), float(haze), float(shadow_amt), bool(flowers), [round(float(v), 3) for v in ridge[::16]], None]
            ev.append(e)
            out = S['md'](W, TW, H, rng, yy, xx, ridge, cA, cB, haze, shadow_amt, flowers)
            e[-1] = len(ev)
            return out

        def hs(rng, W, H, x, gy, s, haze):
            e = ['hs', float(x), float(gy), float(s), float(haze), None]
            ev.append(e)
            out = S['hs'](rng, W, H, x, gy, s, haze)
            e[-1] = len(ev)
            return out

        def tr(L, rng, x, gy, size, kind='green', haze=0.0, hazec=None, trunk=True, flat=1.0, petals=None):
            e = ['tr', float(x), float(gy), float(size), kind, float(haze), bool(trunk), float(flat), petals is not None, None, None, None]
            ev.append(e)
            box = S['tr'](L, rng, x, gy, size, kind, haze, hazec, trunk, flat, petals)
            e[9], e[10], e[11] = [int(v) for v in box], rec.canopy, len(ev)
            return box

        def canopy(rng, w, h, cx, cy, rx, ry, size, n, flat=1.0):
            state = rng.bit_generator.state
            out = S['canopy'](rng, w, h, cx, cy, rx, ry, size, n, flat)
            rec.canopy = dict(state=state, w=int(w), h=int(h), cx=float(cx), cy=float(cy), rx=float(rx), ry=float(ry),
                              size=float(size), n=int(n), flat=float(flat), msum=int(out[0].sum()))
            return out

        def sh(L, x, gy, size, col, alpha=0.35):
            ev.append(['sh', float(x), float(gy), float(size), rgb(col), float(alpha)])
            return S['sh'](L, x, gy, size, col, alpha)

        brush.Layer.stroke, brush.Layer.dab = stroke, dab
        fm.value_noise, fm.pnoise1d, fm.streaks, fm.peak_range, fm.mountains = vn, pn, st, pk, mt
        fm.meadow, fm.house, fm.paint_tree, fm.ground_shadow = md, hs, tr, sh
        arvore.canopy_field = canopy
        return self

    def __exit__(self, *a):
        import brush
        import arvore
        fm, S = self.fm, self.saved
        brush.Layer.stroke, brush.Layer.dab = S['stroke'], S['dab']
        fm.value_noise, fm.pnoise1d, fm.streaks, fm.peak_range, fm.mountains = S['vn'], S['pn'], S['st'], S['pk'], S['mt']
        fm.meadow, fm.house, fm.paint_tree, fm.ground_shadow = S['md'], S['hs'], S['tr'], S['sh']
        arvore.canopy_field = S['canopy']


def make(out=None):
    import tempfile
    t0 = time.time()
    out = out or tempfile.mkdtemp(prefix='memoria_plano_')
    os.makedirs(out, exist_ok=True)
    argv = sys.argv
    sys.argv = [argv[0], out]
    import fundos_memoria as fm
    sys.argv = argv
    plan = {}
    for name, fn in (('sky', fm.sky_layer), ('far', fm.far_layer), ('mid', fm.mid_layer)):
        with Rec(fm) as r:
            L = fn(np.random.default_rng(SEEDS[name]))
        plan[name] = r.ev
        L.image().save(os.path.join(out, f'mem-{name}.png'))
        n = {}
        for e in r.ev:
            n[e[0]] = n.get(e[0], 0) + 1
        print(name, ' '.join(f'{k}:{v}' for k, v in sorted(n.items())), round(time.time() - t0, 1), 's', flush=True)
    os.makedirs(os.path.dirname(PLAN), exist_ok=True)
    json.dump(plan, open(PLAN, 'w'), separators=(',', ':'))
    print('gravado', PLAN, os.path.getsize(PLAN) // 1024, 'KB; a pintura antiga em', out)
    return plan


def load():
    if not os.path.exists(PLAN):
        return make()
    return json.load(open(PLAN))


if __name__ == '__main__':
    make(sys.argv[1] if len(sys.argv) > 1 else None)

"""Pacotes do ECLIPSE: junta os pedaços do terreno em 3x (art2/eclipse.py grava em art2/hd_eclipse) em
poucos arquivos, porque o Artifact guarda no máximo 511 arquivos e só tipos comuns da web: cada pacote é
um JSON { "<sala>-<n>": "<WebP em base64>" } em game/public/assets/hd3/, com as salas de uma mesma área
juntas (são as que o jogador visita em seguida) e no máximo MAX_MB por pacote. A lista de cada sala
(pacote, pedaços e onde ficam, em px do mundo) entra em game/public/assets/hd/manifest.json, na chave
terrain3; o jogo lê em gfx/hdAssets.ts.

Os fundos repintados em 3x (art2/ecl_*.py gravam PNG em art2/hd_eclipse_fundos) vão do mesmo jeito, um
pacote por área (f-<área>.json, { "<camada>": "<WebP em base64>" }), e a lista entra em backdrop3.

uso: python3 tools/eclipsepack.py            terreno e fundos (ENTRADA=<pasta> e FUNDOS=<pasta> para ler de outro lugar)
     python3 tools/eclipsepack.py --fundos   só os fundos (os pacotes do terreno ficam como estão)
"""
import base64
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get('ENTRADA') or os.path.join(HERE, 'art2', 'hd_eclipse')
OUT = os.path.join(HERE, 'game', 'public', 'assets', 'hd3')
MAN = os.path.join(HERE, 'game', 'public', 'assets', 'hd', 'manifest.json')
FUNDOS = os.environ.get('FUNDOS') or os.path.join(HERE, 'art2', 'hd_eclipse_fundos')
MAX_MB = 2.6
# as camadas de fundo de cada área (as que tiverem PNG em FUNDOS entram no pacote f-<área>)
BACK = {
    'bridge': ['bridge-sky', 'bridge-far', 'bridge-mid'],
    'catacomb': ['cat-far', 'cat-mid'],
    'city': ['city-sky', 'city-far', 'city-mid', 'claustro-mid'],
    'nave': ['nave-far', 'nave-mid'],
    'prison': ['prison-far', 'prison-mid', 'fosso-far', 'fosso-mid'],
    'mine': ['mine-far', 'mine-mid'],
}
Q_FUNDO = 92
# a ordem das áreas no jogo (as salas de uma área ficam juntas no mesmo pacote enquanto couber)
ORDER = ['bridge', 'catacomb', 'city', 'nave', 'memory', 'prison', 'mine', 'snow', 'vale', 'torres']


def fundos():
    """Os fundos em 3x: PNG -> WebP -> um pacote por área; devolve a lista para o manifesto."""
    from PIL import Image
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith('f-') and f.endswith('.json'):
            os.remove(os.path.join(OUT, f))
    back3 = {}
    total = 0
    if not os.path.isdir(FUNDOS):
        return back3
    for theme, keys in BACK.items():
        data = {}
        for k in keys:
            path = os.path.join(FUNDOS, k + '.png')
            if not os.path.exists(path):
                continue
            im = Image.open(path)
            buf = io.BytesIO()
            im.save(buf, 'WEBP', quality=Q_FUNDO, method=6, alpha_quality=100)
            data[k] = base64.b64encode(buf.getvalue()).decode('ascii')
            back3[k] = {'pack': f'f-{theme}', 'id': k, 'scale': 3, 'w': im.width, 'h': im.height}
        if not data:
            continue
        path = os.path.join(OUT, f'f-{theme}.json')
        json.dump(data, open(path, 'w'), separators=(',', ':'))
        total += os.path.getsize(path)
        print(f'f-{theme:10s} {os.path.getsize(path) / 1e6:5.2f} MB  {" ".join(data)}')
    print(len(back3), 'fundos em 3x,', round(total / 1e6, 2), 'MB')
    return back3


def main():
    if '--fundos' in sys.argv:
        man = json.load(open(MAN))
        man['backdrop3'] = dict(sorted(fundos().items()))
        json.dump(man, open(MAN, 'w'), indent=1)
        return
    rooms = {}
    for f in sorted(os.listdir(SRC)):
        if f.endswith('.json'):
            rooms[f[:-5]] = json.load(open(os.path.join(SRC, f)))
    if not rooms:
        sys.exit(f'nada em {SRC}: rode antes python3 art2/eclipse.py --todas')
    man = json.load(open(MAN))
    missing = sorted(r for r in man['terrain'] if '-' not in r and r not in rooms)
    if missing:
        print('sem pintura 3x (ficam com a 2x):', ', '.join(missing))
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.json') and not f.startswith('f-'):
            os.remove(os.path.join(OUT, f))
    terrain3 = {}
    total = 0
    packs = []
    for theme in ORDER + sorted(set(r['theme'] for r in rooms.values()) - set(ORDER)):
        cur, size, n = {}, 0, 0
        names = sorted(r for r in rooms if rooms[r]['theme'] == theme)

        def flush():
            nonlocal cur, size, n
            if not cur:
                return
            name = theme if n == 0 else f'{theme}-{n + 1}'
            path = os.path.join(OUT, name + '.json')
            json.dump(cur, open(path, 'w'), separators=(',', ':'))
            packs.append((name, os.path.getsize(path), sorted(set(k.rsplit('-', 1)[0] for k in cur))))
            for k in cur:
                terrain3[k.rsplit('-', 1)[0]]['pack'] = name
            cur, size = {}, 0
            n += 1

        for room in names:
            info = rooms[room]
            data = {}
            for p in info['pieces']:
                raw = open(os.path.join(SRC, p['id'] + '.webp'), 'rb').read()
                data[p['id']] = base64.b64encode(raw).decode('ascii')
            rsize = sum(len(v) for v in data.values())
            if cur and size + rsize > MAX_MB * 1e6:
                flush()
            terrain3[room] = {'scale': info['scale'], 'pack': '', 'pieces': info['pieces']}
            cur.update(data)
            size += rsize
        flush()
    for name, size, rs in packs:
        total += size
        print(f'{name:12s} {size / 1e6:5.2f} MB  {len(rs):2d} salas  {" ".join(rs)}')
    man['terrain3'] = dict(sorted(terrain3.items()))
    man['backdrop3'] = dict(sorted(fundos().items()))
    json.dump(man, open(MAN, 'w'), indent=1)
    print(len(terrain3), 'salas em', len(packs), 'pacotes,', round(total / 1e6, 2), 'MB')


main()

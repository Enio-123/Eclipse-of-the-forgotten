"""Pacotes do ECLIPSE: junta os pedaços do terreno em 3x (art2/eclipse.py grava em art2/hd_eclipse) em
poucos arquivos, porque o Artifact guarda no máximo 511 arquivos e só tipos comuns da web: cada pacote é
um JSON { "<sala>-<n>": "<WebP em base64>" } em game/public/assets/hd3/, com as salas de uma mesma área
juntas (são as que o jogador visita em seguida) e no máximo MAX_MB por pacote. A lista de cada sala
(pacote, pedaços e onde ficam, em px do mundo) entra em game/public/assets/hd/manifest.json, na chave
terrain3; o jogo lê em gfx/hdAssets.ts.

uso: python3 tools/eclipsepack.py            (ENTRADA=<pasta> para ler de outro lugar)
"""
import base64
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get('ENTRADA') or os.path.join(HERE, 'art2', 'hd_eclipse')
OUT = os.path.join(HERE, 'game', 'public', 'assets', 'hd3')
MAN = os.path.join(HERE, 'game', 'public', 'assets', 'hd', 'manifest.json')
MAX_MB = 2.6
# a ordem das áreas no jogo (as salas de uma área ficam juntas no mesmo pacote enquanto couber)
ORDER = ['bridge', 'catacomb', 'city', 'nave', 'memory', 'prison', 'mine', 'snow', 'vale', 'torres']


def main():
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
        if f.endswith('.json'):
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
    json.dump(man, open(MAN, 'w'), indent=1)
    print(len(terrain3), 'salas em', len(packs), 'pacotes,', round(total / 1e6, 2), 'MB')


main()

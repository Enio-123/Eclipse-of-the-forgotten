"""Confere o mapa do mundo sem abrir o jogo: as salas (MAP_POS + tamanho do mapa ASCII) não podem se
sobrepor, e cada saída de lado precisa encostar na sala vizinha, com o chão das duas na mesma altura.
Confere também a água: a linha d'água de um mesmo corpo numa altura só, e água sempre segura por margem
e fundo (só vaza de lado onde começa uma queda d'água).
Serve para quando uma sala nova entra no meio de uma região e empurra as outras.

uso: python3 tools/mapcheck.py [game/src/world]   (sai com 1 se achar problema)
"""
import os
import re
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'game', 'src', 'world')
SOLID = set('#+%@')

maps_ts = open(os.path.join(SRC, 'maps.ts')).read()
rooms_ts = open(os.path.join(SRC, 'rooms.ts')).read()

# os mapas ASCII: cada export const MAP_X = [ 'linha', ... ];
MAPS = {}
for m in re.finditer(r"export const (MAP_\w+)\s*=\s*\[(.*?)\];", maps_ts, re.S):
    MAPS[m.group(1)] = re.findall(r"'([^']*)'", m.group(2))

# as salas: id, mapa e saídas
ROOMS = {}
starts = [m for m in re.finditer(r"\n  (\w+): \{\n    id: '(\w+)',", rooms_ts)]
for i, m in enumerate(starts):
    end = starts[i + 1].start() if i + 1 < len(starts) else len(rooms_ts)
    body = rooms_ts[m.start():end]
    mp = re.search(r"map: (MAP_\w+)", body)
    ex = re.search(r"exits: \[(.*?)\],\n", body, re.S)
    exits = []
    if ex:
        for e in re.finditer(r"\{ side: '(\w+)', to: '(\w+)', entry: '(\w+)'(?:, range: \[(-?\d+), (-?\d+)\])? \}", ex.group(1)):
            side, to, entry, r0, r1 = e.groups()
            exits.append((side, to, entry, (int(r0), int(r1)) if r0 is not None else None))
    falls = []
    fl = re.search(r"falls: \[(.*?)\],?\n", body, re.S)
    if fl:
        for f in re.finditer(r"\{ x0: (\d+), x1: (\d+), y0: (\d+), y1: (\d+) \}", fl.group(1)):
            falls.append(tuple(int(v) for v in f.groups()))
    if mp and mp.group(1) in MAPS:
        ROOMS[m.group(2)] = {'map': MAPS[mp.group(1)], 'exits': exits, 'falls': falls}

POS = {}
pm = re.search(r"export const MAP_POS[^=]*= \{(.*?)\n\};", rooms_ts, re.S)
for m in re.finditer(r"(\w+): \{ x: (-?\d+), y: (-?\d+) \}", pm.group(1)):
    POS[m.group(1)] = (int(m.group(2)), int(m.group(3)))

problems = []
box = {}
for rid, (x, y) in POS.items():
    if rid not in ROOMS:
        problems.append(f'{rid}: está no MAP_POS mas não achei o mapa')
        continue
    g = ROOMS[rid]['map']
    box[rid] = (x, y, len(g[0]), len(g))

# 1. sobreposição
ids = sorted(box)
for i, a in enumerate(ids):
    ax, ay, aw, ah = box[a]
    for b in ids[i + 1:]:
        bx, by, bw, bh = box[b]
        if ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah:
            # rocha em cima de rocha pode (as salas dividem a parede); vão em cima de vão não
            ga, gb = ROOMS[a]['map'], ROOMS[b]['map']
            both = 0
            for wy in range(max(ay, by), min(ay + ah, by + bh)):
                for wx in range(max(ax, bx), min(ax + aw, bx + bw)):
                    if ga[wy - ay][wx - ax] not in SOLID and gb[wy - by][wx - bx] not in SOLID:
                        both += 1
            if both:
                problems.append(f'{a} e {b} se sobrepõem ({both} tiles abertos nas duas)')


def edge_open(rid, side, rng):
    """Linhas (esquerda/direita) ou colunas (cima/baixo) abertas na borda, em coordenadas da sala."""
    g = ROOMS[rid]['map']
    W, H = len(g[0]), len(g)
    if side in ('left', 'right'):
        col = 0 if side == 'left' else W - 1
        cells = [r for r in range(H) if g[r][col] not in SOLID]
    else:
        row = 0 if side == 'up' else H - 1
        cells = [c for c in range(W) if g[row][c] not in SOLID]
    if rng:
        cells = [c for c in cells if rng[0] <= c <= rng[1]]
    return cells


OPP = {'left': 'right', 'right': 'left', 'up': 'down', 'down': 'up'}
# 2. as saídas de lado encostam e o chão bate
for a in ids:
    for side, to, entry, rng in ROOMS[a]['exits']:
        if to not in box:
            continue
        back = [e for e in ROOMS[to]['exits'] if e[1] == a and e[0] == OPP[side]]
        if not back:
            # mão única (queda num poço, porta): só avisa
            continue
        ax, ay, aw, ah = box[a]
        bx, by, bw, bh = box[to]
        mine = edge_open(a, side, rng)
        theirs = edge_open(to, OPP[side], back[0][3])
        if not mine or not theirs:
            problems.append(f'{a} -> {to} ({side}): borda fechada ({len(mine)} / {len(theirs)} abertas)')
            continue
        if side in ('left', 'right'):
            gap = bx - (ax + aw) if side == 'right' else ax - (bx + bw)
            if gap != 0:
                problems.append(f'{a} -> {to} ({side}): {"vão" if gap > 0 else "encavalado"} de {abs(gap)} tiles entre as salas')
            wa = [ay + r for r in mine]
            wb = [by + r for r in theirs]
            if not set(wa) & set(wb):
                problems.append(f'{a} -> {to} ({side}): as aberturas não se cruzam (linhas {wa[0]}..{wa[-1]} x {wb[0]}..{wb[-1]})')
            elif max(wa) != max(wb):
                problems.append(f'{a} -> {to} ({side}): o chão não bate (linha {max(wa)} x {max(wb)}, {max(wb) - max(wa):+d})')
        else:
            gap = (by + bh) - ay if side == 'up' else by - (ay + ah)
            if gap != 0:
                problems.append(f'{a} -> {to} ({side}): {"encavalado" if (gap > 0) == (side == "up") else "vão"} de {abs(gap)} tiles na vertical')
            wa = [ax + c for c in mine]
            wb = [bx + c for c in theirs]
            if not set(wa) & set(wb):
                problems.append(f'{a} -> {to} ({side}): as aberturas não se cruzam (colunas {wa[0]}..{wa[-1]} x {wb[0]}..{wb[-1]})')

# 3. a água tem que fazer sentido: num mesmo corpo d'água a linha d'água é uma só, e a água não fica
# pendurada (embaixo e dos lados dela, água ou pedra). Só pode vazar de lado onde começa uma queda
# d'água (os falls do RoomDef). As marcas de criatura dentro d'água viram água, como no Level.ts
WSOLID = set('#+_%V@;')
for rid, room in sorted(ROOMS.items()):
    g = [list(r) for r in room['map']]
    h, w = len(g), len(g[0])
    wet = [(x, y) for y in range(h) for x in range(w)
           if g[y][x] not in '.~' and g[y][x] not in WSOLID and g[y][x] not in '-"^|Y'
           and ((0 < x < w - 1 and g[y][x - 1] == '~' and g[y][x + 1] == '~') or (y > 0 and g[y - 1][x] == '~'))]
    for x, y in wet:
        g[y][x] = '~'
    water = lambda x, y: 0 <= x < w and 0 <= y < h and g[y][x] == '~'
    def holds(x, y):
        # fora da sala a água segue na sala vizinha (o rio passa de uma para a outra)
        return x < 0 or x >= w or y >= h or g[y][x] == '~' or g[y][x] in WSOLID
    def in_fall(x, y):
        return any(x0 <= x <= x1 and y0 - 1 <= y <= y1 for x0, x1, y0, y1 in room['falls'])
    air_open = {}
    def open_air(x, y):
        if (x, y) in air_open:
            return air_open[(x, y)]
        stack, region, edge = [(x, y)], {(x, y)}, False
        while stack:
            cx, cy = stack.pop()
            for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                if not (0 <= nx < w and 0 <= ny < h):
                    edge = True
                    continue
                if (nx, ny) in region or g[ny][nx] == '~' or g[ny][nx] in WSOLID:
                    continue
                region.add((nx, ny))
                stack.append((nx, ny))
        for c in region:
            air_open[c] = edge
        return edge
    seen = set()
    for y in range(h):
        for x in range(w):
            if not water(x, y) or (x, y) in seen:
                continue
            stack, cells = [(x, y)], []
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                cells.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if water(nx, ny) and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            # um bolsão de ar preso na pedra (o ar em cima não chega na borda da sala) segura a água num
            # nível só dele, então não entra na comparação
            tops = sorted({cy for cx, cy in cells if cy > 0 and not water(cx, cy - 1) and g[cy - 1][cx] not in WSOLID and open_air(cx, cy - 1)})
            if len(tops) > 1:
                xs = sorted(cx for cx, cy in cells)
                problems.append(f'{rid}: a água das colunas {xs[0]}..{xs[-1]} tem a linha d\'água em alturas diferentes (linhas {tops})')
            leaks = []
            for cx, cy in cells:
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy + 1)):
                    if not holds(nx, ny) and not in_fall(nx, ny):
                        leaks.append((nx, ny))
            if leaks:
                problems.append(f'{rid}: a água vaza (sem margem nem fundo) em {leaks[:6]}{" ..." if len(leaks) > 6 else ""}')

print(f'{len(box)} salas no mapa, {sum(len(r["exits"]) for r in ROOMS.values())} saídas')
for p in problems:
    print('  ' + p)
print('tudo certo' if not problems else f'{len(problems)} problema(s)')
sys.exit(1 if problems else 0)

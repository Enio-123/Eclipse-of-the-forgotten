# mostra um trecho do mapa de uma sala com régua: python3 mapa.py <sala> [x0 x1 y0 y1]
import os, re, sys
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'game', 'src', 'world', 'maps.ts'), encoding='utf-8').read()
maps = {m.group(1).lower(): re.findall(r"'([^']*)'", m.group(2)) for m in re.finditer(r'export const MAP_(\w+)\s*=\s*\[(.*?)\];', src, re.S)}
room = sys.argv[1]
rows = maps[room]
a = [int(v) for v in sys.argv[2:6]] if len(sys.argv) >= 6 else [0, len(rows[0]), 0, len(rows)]
x0, x1, y0, y1 = a
x1 = min(x1, len(rows[0])); y1 = min(y1, len(rows))
print(room, len(rows[0]), 'x', len(rows))
print('     ' + ''.join(str((x // 100) % 10) if x % 10 == 0 else ' ' for x in range(x0, x1)))
print('     ' + ''.join(str((x // 10) % 10) for x in range(x0, x1)))
print('     ' + ''.join(str(x % 10) for x in range(x0, x1)))
for y in range(y0, y1):
    print(f'{y:4d} ' + rows[y][x0:x1])

"""Mostra um pedaço de um mapa: python3 tools/win.py <sala> [y0 y1 x0 x1] [maps.ts]"""
import re, sys
room = sys.argv[1]
src = sys.argv[6] if len(sys.argv) > 6 else 'game/src/world/maps.ts'
txt = open(src).read()
m = re.search(r"export const MAP_%s\s*=\s*\[(.*?)\];" % room.upper(), txt, re.S)
g = re.findall(r"'([^']*)'", m.group(1))
H, W = len(g), len(g[0])
y0, y1, x0, x1 = (int(a) for a in sys.argv[2:6]) if len(sys.argv) > 5 else (0, H - 1, 0, W - 1)
print(f'{room} {W}x{H}')
print('     ' + ''.join(str((x // 10) % 10) if x % 10 == 0 else ' ' for x in range(x0, x1 + 1)))
print('     ' + ''.join(str(x % 10) for x in range(x0, x1 + 1)))
for y in range(y0, y1 + 1):
    print(f'{y:4d} ' + g[y][x0:x1 + 1])

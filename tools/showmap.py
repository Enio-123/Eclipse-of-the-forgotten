# imprime o mapa ASCII de uma sala com régua de colunas e números de linha
# uso: python3 tools/showmap.py catacumbas [x0 x1]
import re, sys
name = sys.argv[1]
x0 = int(sys.argv[2]) if len(sys.argv) > 2 else 0
x1 = int(sys.argv[3]) if len(sys.argv) > 3 else 10 ** 6
s = open('game/src/world/maps.ts').read()
m = re.search(r"export const MAP_%s = \[\n(.*?)\];" % name.upper(), s, re.S)
rows = re.findall(r"'(.*)'", m.group(1))
w = len(rows[0])
x1 = min(x1, w)
print('    ' + ''.join(str((x // 10) % 10) if x % 10 == 0 else ' ' for x in range(x0, x1)))
print('    ' + ''.join(str(x % 10) for x in range(x0, x1)))
for y, r in enumerate(rows):
    print('%3d %s' % (y, r[x0:x1]))

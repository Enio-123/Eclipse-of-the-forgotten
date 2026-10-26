"""Abre espaço no mapa do mundo para uma sala nova no meio de uma região: anda (MAP_POS em
world/rooms.ts) todas as salas que ficam "depois" da vizinha, isto é, as que se alcançam a partir
dela pelas saídas e portas sem passar pela sala de antes.

uso: python3 tools/worldmap.py <sala_de_antes> <sala_de_depois> <dx> <dy> [--dry]
depois confira com: python3 tools/mapcheck.py
"""
import os
import re
import sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'game', 'src', 'world')
ROOMS_TS = os.path.join(SRC, 'rooms.ts')


def links(text):
    """Para cada sala, as salas ligadas a ela (saídas de lado, de cima e de baixo, e portas)."""
    out = {}
    starts = list(re.finditer(r"\n  (\w+): \{\n    id: '(\w+)',", text))
    for i, m in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else len(text)
        body = text[m.start():end]
        to = set()
        for block in re.findall(r"(?:exits|doors): \[(.*?)\],\n", body, re.S):
            to |= set(re.findall(r"to: '(\w+)'", block))
        out[m.group(2)] = to
    # as ligações valem nos dois sentidos
    for a, tos in list(out.items()):
        for b in tos:
            out.setdefault(b, set()).add(a)
    return out


def after(text, a, b):
    g = links(text)
    seen, todo = {b}, [b]
    while todo:
        r = todo.pop()
        for n in g.get(r, ()):
            if n != a and n not in seen:
                seen.add(n)
                todo.append(n)
    return seen


def shift(text, ids, dx, dy):
    m = re.search(r"(export const MAP_POS[^=]*= \{)(.*?)(\n\};)", text, re.S)

    def f(mm):
        rid, x, y = mm.group(1), int(mm.group(2)), int(mm.group(3))
        if rid not in ids:
            return mm.group(0)
        return f"{rid}: {{ x: {x + dx}, y: {y + dy} }}"
    body = re.sub(r"(\w+): \{ x: (-?\d+), y: (-?\d+) \}", f, m.group(2))
    return text[:m.start(2)] + body + text[m.end(2):]


if __name__ == '__main__':
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    a, b, dx, dy = args[0], args[1], int(args[2]), int(args[3])
    text = open(ROOMS_TS).read()
    ids = after(text, a, b)
    if a in ids:
        sys.exit(f'{a} também se alcança a partir de {b}: não dá para separar as duas pontas')
    print(f'andam ({dx:+d}, {dy:+d}):', ' '.join(sorted(ids)))
    if '--dry' not in sys.argv:
        open(ROOMS_TS, 'w').write(shift(text, ids, dx, dy))

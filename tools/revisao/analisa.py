# Lê a varredura de alcance (alc/<sala>.<passe>.json) e mostra, sala por sala, o que ficou de fora:
# chão onde dá para ficar de pé e o cavaleiro nunca pisou, objetos nunca tocados, saídas que uma entrada não
# alcança e pontos de onde não se sai. Desenha por cima da foto clareada da sala (claras/<sala>.jpg):
#   verde: pisado com os poderes da primeira visita   amarelo: só com poderes de depois   vermelho: nunca
# uso: python3 analisa.py <alc> <claras> <saida> [sala,sala...]
import json, os, sys, collections
from PIL import Image, ImageDraw, ImageFont

ALC, FOTOS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
ONLY = sys.argv[4].split(',') if len(sys.argv) > 4 and sys.argv[4] else None
os.makedirs(OUT, exist_ok=True)
T = 16
# o que cada letra do mapa é (só o que importa alcançar)
NOMES = {
    '$': 'baú', 'm': 'memória', 'r': 'registro', 'R': 'vela de descanso', 'K': 'Cobrador', '>': 'Esporas', 'J': 'Garras', 'U': 'Pena',
    'w': 'Gancho', '{': 'Retalho (capa)', '<': 'Concha', '/': 'Capa de Luz', 'p': 'página', 'O': 'porta', 'Q': 'alavanca', 'k': 'chaves',
    'N': 'freira', 'B': 'ferreiro', 'E': 'esquecido', 'I': 'preso', 'b': 'sino', 'o': 'argola', ']': 'runa', '0': 'lume', ',': 'jarro de Âmbar',
    'M': 'espelho', 'F': 'figura', 'A': 'altar', 'X': 'chefe', 'h': 'h', 'j': 'vagonete', 'q': 'q', 'W': 'W', 'y': 'y', 'z': 'z', 'x': 'cristal',
}
IMPORTA = set('$mrRK>JUw{</pOQkNBEIb],MFAj')

def load(room, tag):
    p = os.path.join(ALC, f'{room}.{tag}.json')
    return json.load(open(p)) if os.path.exists(p) else None

def standable(rows):
    h, w = len(rows), len(rows[0])
    free = lambda x, y: y < 0 or (0 <= x < w and y < h and rows[y][x] not in '#')
    out = {}
    for y in range(h - 1):
        for x in range(w):
            if rows[y + 1][x] not in '#-':
                continue
            if rows[y][x] in '#^':
                continue
            if not free(x, y - 1):
                continue
            out[(x, y)] = 'pe' if free(x, y - 2) else 'agachado'
    return out

def comps(cells):
    cells = set(cells); seen = set(); res = []
    for c in sorted(cells):
        if c in seen: continue
        q = [c]; seen.add(c); comp = []
        while q:
            x, y = q.pop(); comp.append((x, y))
            for dx in (-1, 1):
                for dy in (-1, 0, 1):
                    n = (x + dx, y + dy)
                    if n in cells and n not in seen:
                        seen.add(n); q.append(n)
        res.append(comp)
    return res

def reach_from(d, seed):
    nodes = {n['k']: n for n in d['nodes']}
    start = [n['k'] for n in d['nodes'] if seed in n['seeds']]
    seen = set(start); q = list(start); goals = set()
    while q:
        k = q.pop(); n = nodes[k]
        goals.update(n['goals'])
        for e in n['edges']:
            k2 = e[0]
            if k2 not in seen and k2 in nodes:
                seen.add(k2); q.append(k2)
    return seen, goals

def stuck(d):
    nodes = {n['k']: n for n in d['nodes']}
    ok = {k for k, n in nodes.items() if any(g.startswith('exit:') or g.startswith('door:') for g in n['goals'])}
    changed = True
    while changed:
        changed = False
        for k, n in nodes.items():
            if k in ok: continue
            if any(e[0] in ok for e in n['edges']):
                ok.add(k); changed = True
    return [n for k, n in nodes.items() if k not in ok]

try:
    FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 11)
except Exception:
    FONT = ImageFont.load_default()

rooms = sorted({f.split('.')[0] for f in os.listdir(ALC) if f.endswith('.json')})
report = []
for room in rooms:
    if ONLY and room not in ONLY: continue
    passes = {t: load(room, t) for t in ('chegada', 'depois', 'tudo')}
    full = passes['tudo'] or passes['depois'] or passes['chegada']
    first = passes['chegada'] or full
    if not full: continue
    info = full['info']
    rows = info['rows']
    st = standable(rows)
    trod = {t: {tuple(map(int, c.split(':'))) for c in (d['trod'] if d else [])} for t, d in passes.items()}
    allt = trod['tudo'] | trod['depois'] | trod['chegada']
    firstt = trod['chegada'] if passes['chegada'] else allt
    never = [c for c in st if c not in allt]
    later = [c for c in st if c in allt and c not in firstt]
    lines = [f"== {room} ({info['w']}x{info['h']})  passes: {', '.join(f'{t}[{len(d['nodes'])} pontos, {d['secs']}s]' for t, d in passes.items() if d)}"]
    # objetos
    sp = info['spawns']
    tfull = set(full['touched']); tfirst = set(first['touched'])
    for q in sp:
        if q['kind'] not in IMPORTA: continue
        nome = NOMES.get(q['kind'], q['kind'])
        if q['i'] not in tfull: lines.append(f"   NUNCA TOCADO: {nome} '{q['kind']}' em ({q['tx']},{q['ty']})")
        elif q['i'] not in tfirst: lines.append(f"   só depois: {nome} '{q['kind']}' em ({q['tx']},{q['ty']})")
    # saídas por entrada
    for t, d in passes.items():
        if not d: continue
        allgoals = sorted({g for n in d['nodes'] for g in n['goals'] if g.startswith('exit:')})
        want = sorted({f"exit:{e['to']}:{e['entry']}" for e in info['exits']})
        seeds = sorted({sd for n in d['nodes'] for sd in n['seeds']})
        miss = [g for g in want if g not in allgoals]
        if miss: lines.append(f"   [{t}] saída que ninguém alcança: {', '.join(miss)}")
        for sd in seeds:
            _, goals = reach_from(d, sd)
            m2 = [g for g in want if g not in goals and g not in miss]
            if m2: lines.append(f"   [{t}] da entrada {sd} não chega em: {', '.join(m2)}")
        stk = stuck(d)
        if stk:
            cs = comps({(int(n['x'] // T), round(n['f'] / T) - 1) for n in stk})
            lines.append(f"   [{t}] pontos sem saída: {len(stk)} em {len(cs)} grupo(s): " + '; '.join(f"x {min(c[0] for c in g)}-{max(c[0] for c in g)} y {min(c[1] for c in g)}-{max(c[1] for c in g)}" for g in cs[:8]))
        if d['fails']: lines.append(f"   [{t}] falhas: {d['fails']}")
    # chão nunca pisado
    cs = [c for c in comps(never) if len(c) >= 3]
    cs.sort(key=lambda c: -len(c))
    for c in cs[:14]:
        xs = [p[0] for p in c]; ys = [p[1] for p in c]
        kinds = collections.Counter(st[p] for p in c)
        lines.append(f"   chão nunca pisado: {len(c)} células, x {min(xs)}-{max(xs)}, y {min(ys)}-{max(ys)} ({dict(kinds)})")
    cl = [c for c in comps(later) if len(c) >= 3]
    cl.sort(key=lambda c: -len(c))
    for c in cl[:10]:
        xs = [p[0] for p in c]; ys = [p[1] for p in c]
        lines.append(f"   chão só com poderes de depois: {len(c)} células, x {min(xs)}-{max(xs)}, y {min(ys)}-{max(ys)}")
    report.append('\n'.join(lines))
    # desenho
    fp = os.path.join(FOTOS, f'{room}.jpg')
    W, H = info['W'], info['H']
    base = Image.open(fp).convert('RGB') if os.path.exists(fp) else Image.new('RGB', (W, H), (20, 20, 24))
    if base.size != (W, H): base = base.resize((W, H))
    S = 2
    base = base.resize((W * S, H * S), Image.LANCZOS)
    ov = Image.new('RGBA', base.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(ov)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch == '#':
                # contorno da colisão: só as bordas com ar
                for dx, dy, seg in ((0, -1, (0, 0, 1, 0)), (0, 1, (0, 1, 1, 1)), (-1, 0, (0, 0, 0, 1)), (1, 0, (1, 0, 1, 1))):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < len(r) and 0 <= ny < len(rows) and rows[ny][nx] != '#':
                        dr.line([((x + seg[0]) * T * S, (y + seg[1]) * T * S), ((x + seg[2]) * T * S, (y + seg[3]) * T * S)], fill=(120, 200, 255, 150), width=1)
            elif ch == '-':
                dr.line([(x * T * S, y * T * S + 1), ((x + 1) * T * S, y * T * S + 1)], fill=(120, 200, 255, 200), width=2)
            elif ch == '^':
                dr.rectangle([x * T * S, y * T * S + 12, (x + 1) * T * S, (y + 1) * T * S], fill=(255, 80, 200, 120))
    for (x, y), kind in st.items():
        c = (x, y)
        col = (60, 230, 90, 190) if c in firstt else (255, 200, 40, 210) if c in allt else (255, 40, 40, 230)
        dr.rectangle([x * T * S + 2, (y + 1) * T * S - 5, (x + 1) * T * S - 2, (y + 1) * T * S - 1], fill=col)
    for q in sp:
        if q['kind'] in '.': continue
        col = (255, 255, 255, 255) if q['i'] in tfirst else (255, 200, 40, 255) if q['i'] in tfull else (255, 60, 60, 255)
        if q['kind'] in IMPORTA or q['i'] not in tfull:
            dr.text((q['x'] * S - 4, (q['y'] - 30) * S), q['kind'], fill=col, font=FONT, stroke_width=2, stroke_fill=(0, 0, 0, 255))
    for e in info['exits']:
        g = f"exit:{e['to']}:{e['entry']}"
        okf = any(g in n['goals'] for n in full['nodes'])
        col = (60, 230, 90, 255) if okf else (255, 40, 40, 255)
        r0, r1 = e.get('range') or (0, (info['h'] if e['side'] in ('left', 'right') else info['w']) - 1)
        if e['side'] == 'left': box = [0, r0 * T * S, 6, (r1 + 1) * T * S]
        elif e['side'] == 'right': box = [W * S - 7, r0 * T * S, W * S - 1, (r1 + 1) * T * S]
        elif e['side'] == 'up': box = [r0 * T * S, 0, (r1 + 1) * T * S, 6]
        else: box = [r0 * T * S, H * S - 7, (r1 + 1) * T * S, H * S - 1]
        dr.rectangle(box, fill=col)
        dr.text((min(max(box[0], 4), W * S - 90), min(max(box[1] - 14, 2), H * S - 16)), f"> {e['to']}", fill=col, font=FONT, stroke_width=2, stroke_fill=(0, 0, 0, 255))
    # régua de tiles
    for x in range(0, info['w'], 10): dr.text((x * T * S + 2, 2), str(x), fill=(255, 255, 255, 200), font=FONT, stroke_width=2, stroke_fill=(0, 0, 0, 255))
    for y in range(0, info['h'], 10): dr.text((2, y * T * S + 2), str(y), fill=(255, 255, 255, 200), font=FONT, stroke_width=2, stroke_fill=(0, 0, 0, 255))
    img = Image.alpha_composite(base.convert('RGBA'), ov).convert('RGB')
    img.save(os.path.join(OUT, f'{room}.jpg'), quality=86)
    SW, SH = 1920, 1080
    w2, h2 = img.size
    nx = max(1, -(-w2 // SW)); ny = max(1, -(-h2 // SH)); n = 0
    for j in range(ny):
        for i in range(nx):
            x0 = 0 if nx == 1 else round(i * (w2 - SW) / (nx - 1)); y0 = 0 if ny == 1 else round(j * (h2 - SH) / (ny - 1))
            img.crop((x0, y0, min(w2, x0 + SW), min(h2, y0 + SH))).save(os.path.join(OUT, f'{room}-{n}.jpg'), quality=84)
            n += 1
txt = '\n'.join(report)
open(os.path.join(OUT, 'relatorio.txt'), 'w').write(txt)
print(txt)

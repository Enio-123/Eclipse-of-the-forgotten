"""Monta a pasta artifact/ a partir de game/dist e escreve artifact-files.json (mapa de arquivos
para publicar, com as subpastas, como assets/hd/).
Uma publicação leva no máximo 255 arquivos: por isso o mapa traz só o que mudou desde a última
publicação marcada (tools/published.json guarda o sha de cada arquivo) e null no que saiu.
uso: python3 tools/pack.py            monta e lista só o que mudou
     python3 tools/pack.py --all      monta e lista tudo
     python3 tools/pack.py --mark     depois de publicar: guarda os sha do que está em artifact/"""
import hashlib, json, os, shutil, subprocess, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dist = os.path.join(HERE, 'game', 'dist')
art = os.path.join(HERE, 'artifact')
PUB = os.path.join(HERE, 'tools', 'published.json')
LIMIT = 254  # 255 menos a página


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def current():
    out = {}
    root = os.path.join(art, 'assets')
    for d, _, names in os.walk(root):
        for n in names:
            full = os.path.join(d, n)
            rel = os.path.relpath(full, art).replace(os.sep, '/')
            out[rel] = sha(full)
    return out


if '--mark' in sys.argv:
    json.dump(current(), open(PUB, 'w'), indent=0, sort_keys=True)
    print('marcado', PUB)
    sys.exit(0)

subprocess.run([sys.executable, os.path.join(HERE, 'tools', 'make_artifact.py'), dist, os.path.join(art, 'index.html')], check=True)
shutil.rmtree(os.path.join(art, 'assets'), ignore_errors=True)
src_root = os.path.join(dist, 'assets')
for d, _, names in os.walk(src_root):
    for n in names:
        if d == src_root and n == 'index.css':
            continue
        rel = os.path.relpath(os.path.join(d, n), src_root)
        dst = os.path.join(art, 'assets', rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy(os.path.join(d, n), dst)

now = current()
old = {} if '--all' in sys.argv or not os.path.exists(PUB) else json.load(open(PUB))
files = {}
for rel, h in sorted(now.items()):
    if old.get(rel) != h:
        files[rel] = f'artifact/{rel}'
for rel in sorted(old):
    if rel not in now:
        files[rel] = None
json.dump(files, open(os.path.join(HERE, 'artifact-files.json'), 'w'), indent=0)
size = sum(os.path.getsize(os.path.join(art, r)) for r, v in files.items() if v)
total = sum(os.path.getsize(os.path.join(art, r)) for r in now)
print(len(now), 'arquivos no total', round(total / 1e6, 2), 'MB;', len(files), 'para mandar', round(size / 1e6, 2), 'MB')
if len(files) > LIMIT:
    print('ATENÇÃO: mais de', LIMIT, 'arquivos, publicar em partes (o resto vai numa segunda publicação)')

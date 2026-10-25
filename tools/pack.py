"""Monta a pasta artifact/ a partir de game/dist e escreve artifact-files.json (mapa de arquivos
para publicar). uso: python3 tools/pack.py"""
import json, os, shutil, subprocess, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dist = os.path.join(HERE, 'game', 'dist')
art = os.path.join(HERE, 'artifact')
subprocess.run([sys.executable, os.path.join(HERE, 'tools', 'make_artifact.py'), dist, os.path.join(art, 'index.html')], check=True)
shutil.rmtree(os.path.join(art, 'assets'), ignore_errors=True)
os.makedirs(os.path.join(art, 'assets'))
files = {}
for name in sorted(os.listdir(os.path.join(dist, 'assets'))):
    if name == 'index.css':
        continue
    shutil.copy(os.path.join(dist, 'assets', name), os.path.join(art, 'assets', name))
    files[f'assets/{name}'] = f'artifact/assets/{name}'
json.dump(files, open(os.path.join(HERE, 'artifact-files.json'), 'w'))
total = sum(os.path.getsize(os.path.join(art, 'assets', n)) for n in os.listdir(os.path.join(art, 'assets')))
print(len(files), 'arquivos', round(total / 1e6, 2), 'MB')

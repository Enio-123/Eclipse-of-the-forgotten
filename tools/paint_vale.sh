#!/bin/sh
# v19: pinta o terreno e a vegetação das salas do Vale (art2/vale.py, três salas por vez), passa tudo pela
# paleta do tema 'vale', empacota a 2x do EXTREME e copia as copas à parte das árvores do presente.
# uso: sh tools/paint_vale.sh [sala ...]   (sem salas: as oito, com a paleta refeita do zero)
cd "$(dirname "$0")/../art2"
mkdir -p hd_vale
ROOMS=${*:-descida prado riacho cachoeiras gruta prainha rio cais}
echo $ROOMS | tr ' ' '\n' | xargs -P 3 -I{} sh -c 'nice -n 10 python3 vale.py {} hd_vale > hd_vale/{}.log 2>&1 || echo "falhou {}"'
grep -h "terreno\|pinhos\|flores" hd_vale/*.log
if [ $# -gt 0 ]; then
  KEEP=$(for r in $ROOMS; do printf 'terreno-%s,pinhos-%s,' $r $r; done)
  python3 finaliza.py vale hd_vale --keep=${KEEP%,} || exit 1
else
  python3 finaliza.py vale hd_vale || exit 1
fi
for r in $ROOMS; do python3 ../tools/hdpack.py $r || exit 1; done
# as copas à parte vão em 2x, com 256 cores
python3 - <<'EOF'
import glob, os
from PIL import Image
for p in sorted(glob.glob('hd_vale/flores-*.png')):
    q = Image.open(p).convert('RGBA').quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    dst = os.path.join('..', 'game', 'public', 'assets', os.path.basename(p))
    q.save(dst, optimize=True)
    print('copa', os.path.basename(p), os.path.getsize(dst) // 1024, 'KB')
EOF
grep -h "^flores" hd_vale/*.log

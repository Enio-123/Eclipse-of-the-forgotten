#!/bin/sh
# toda a arte das Minas em sequência (terreno das 6 salas, fundos, Abismo aberto, folhas e objetos),
# com o tempo de cada etapa em shots/minas_art.log
cd "$(dirname "$0")/.."
LOG=shots/minas_art.log
: > $LOG
step() { t0=$(date +%s); echo "== $1" >> $LOG; shift; "$@" >> $LOG 2>&1; r=$?; echo "   ($(( $(date +%s) - t0 ))s, saída $r)" >> $LOG; return $r; }
step terreno sh tools/paint_minas.sh || exit 1
step abismo sh -c 'cd art2 && python3 prisao.py abismo hd_fosso && python3 finaliza.py abyss hd_fosso --keep=terreno-abismo'
step objetos sh -c 'cd art && python3 mine_props.py ../game/public/assets'
step folhas sh -c 'cd art && python3 ink_sheets.py ../game/public/assets knight-picareta miner ambat'
step hdpack python3 tools/hdpack.py
echo FIM >> $LOG

#!/bin/sh
# v18: pinta o terreno de uma sala nova (versão pixel e a do EXTREME), passa pela paleta do tema
# sem mexer nas salas já aprovadas e empacota a 2x do EXTREME; uso: sh tools/paint_v18.sh <sala> <pintor> <tema> [pasta]
cd "$(dirname "$0")/../art2"
ROOM=$1; PAINTER=$2; THEME=$3; HD=${4:-hd}
nice -n 15 python3 $PAINTER $ROOM $HD || exit 1
case $PAINTER in terreno.py|cidade.py) nice -n 15 python3 $PAINTER $ROOM --x || exit 1 ;; esac
KEEP=terreno-$ROOM
[ -f $HD/terreno-$ROOM-secret.png ] && KEEP=$KEEP,terreno-$ROOM-secret
# na floresta o pintor faz também a camada dos pinheiros
[ -f $HD/pinhos-$ROOM.png ] && KEEP=$KEEP,pinhos-$ROOM
python3 finaliza.py $THEME $HD --keep=$KEEP || exit 1
cd .. && python3 tools/hdpack.py $ROOM

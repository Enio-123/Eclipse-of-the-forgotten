#!/bin/sh
# pinta o terreno das seis salas das Minas e o Leito do Abismo aberto para a mina, reduz para os pixels
# do jogo (finaliza) e grava os fundos da mina; uso: sh tools/paint_minas.sh [salas...]
cd "$(dirname "$0")/../art2"
for r in ${*:-boca trilhos prensas veio espelhos capataz}; do
  python3 minas.py $r hd_minas || exit 1
done
python3 finaliza.py mine hd_minas
python3 fundos_minas.py hd_minas && cp hd_minas/mine-far.png hd_minas/mine-mid.png ../game/public/assets/

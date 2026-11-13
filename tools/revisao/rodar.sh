#!/bin/sh
# roda um passe da varredura de alcance: <passe> <habilidades> <salas> <ambar>   (uma linha de passes.txt)
# todos, três de cada vez:  xargs -P 3 -L 1 sh tools/revisao/rodar.sh < tools/revisao/passes.txt
# OUT pasta dos resultados (padrão shots/alcance), LOG arquivo do andamento (padrão shots/alcance.log)
cd "$(dirname "$0")/../.." || exit 1
mkdir -p "${OUT:-shots/alcance}"
TAG=$1 AB=$2 AMBER=$4 node tools/revisao/alcance.cjs "${OUT:-shots/alcance}" "$3" >> "${LOG:-shots/alcance.log}" 2>&1
echo "fim $1 $3" >> "${LOG:-shots/alcance.log}"

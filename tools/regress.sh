#!/bin/sh
# roda os testes principais em sequência; cada um grava seu resultado em shots/reg/<nome>.log
# (o jogo precisa estar servido em http://localhost:8765)
cd "$(dirname "$0")/.."
URL=http://localhost:8765/index.html
for t in ${*:-loot progression boss enemies transitions doors3 tower gamepad mobile artcheck explore area1 parry npcs round5 arcebispo}; do
  mkdir -p shots/reg/$t
  case $t in
    gamepad|explore) timeout 1200 node tools/$t.cjs $URL shots/reg/$t > shots/reg/$t.log 2>&1 ;;
    arcebispo) timeout 1200 node tools/$t.cjs shots/reg/$t > shots/reg/$t.log 2>&1 ;;
    *) timeout 900 node tools/$t.cjs shots/reg/$t > shots/reg/$t.log 2>&1 ;;
  esac
  echo "$t terminou ($?)" >> shots/reg/progresso.log
done
echo FIM >> shots/reg/progresso.log

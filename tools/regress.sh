#!/bin/sh
# roda os testes principais em sequência; cada um grava seu resultado em shots/reg/<nome>.log
# (o jogo precisa estar servido em $GAME, por padrão http://localhost:8765; artcheck e smoke abrem a página
# do Artifact, a pasta artifact/ que tools/pack.py monta, servida em http://localhost:8766)
cd "$(dirname "$0")/.."
GAME=${GAME:-http://localhost:8765}
export GAME
URL=$GAME/index.html
for t in ${*:-mapcheck loot progression boss enemies transitions doors3 tower gamepad mobile artcheck smoke explore area1 parry npcs round5 arcebispo echo area2 carcereira sombra fosso fossoexit starter minas poderes itens magos reflexo_mago agrimensor esporas floresta v18 vale lore2 torres}; do
  mkdir -p shots/reg/$t
  case $t in
    mapcheck) python3 tools/mapcheck.py > shots/reg/$t.log 2>&1 ;;
    smoke) timeout 900 node tools/$t.cjs http://localhost:8766/index.html > shots/reg/$t.log 2>&1 ;;
    gamepad|explore) timeout 1200 node tools/$t.cjs $URL shots/reg/$t > shots/reg/$t.log 2>&1 ;;
    arcebispo|reflexo_mago) timeout 1200 node tools/$t.cjs shots/reg/$t > shots/reg/$t.log 2>&1 ;;
    agrimensor|esporas|floresta|lore2) timeout 900 node tools/$t.cjs shots/reg/$t $URL > shots/reg/$t.log 2>&1 ;;
    v18|vale) timeout 1800 node tools/$t.cjs shots/reg/$t $URL > shots/reg/$t.log 2>&1 ;;
    torres) timeout 5400 node tools/$t.cjs shots/reg/$t $URL > shots/reg/$t.log 2>&1 ;;
    minas|magos) timeout 1800 node tools/$t.cjs shots/reg/$t > shots/reg/$t.log 2>&1 ;;
    *) timeout 900 node tools/$t.cjs shots/reg/$t > shots/reg/$t.log 2>&1 ;;
  esac
  echo "$t terminou ($?)" >> shots/reg/progresso.log
done
echo FIM >> shots/reg/progresso.log

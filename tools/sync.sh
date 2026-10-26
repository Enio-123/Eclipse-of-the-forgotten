#!/bin/sh
# Copia o código, a arte e as ferramentas para a pasta do projeto.
SP=/tmp/claude-0/-home-user/c7059113-119e-543c-91af-5a4cdbda7748/scratchpad
DST=/mnt/project-files/jogo-metroidvania
mkdir -p $DST/jogo $DST/arte/gerador $DST/arte/pintura $DST/ferramentas
rm -rf $DST/jogo/src && cp -r $SP/game/src $DST/jogo/src
rm -rf $DST/jogo/public && cp -r $SP/game/public $DST/jogo/public
cp $SP/game/index.html $SP/game/package.json $SP/game/package-lock.json $SP/game/tsconfig.json $SP/game/vite.config.ts $DST/jogo/
cp $SP/art/*.py $DST/arte/gerador/
cp $SP/art2/*.py $DST/arte/pintura/
cp $SP/tools/*.cjs $SP/tools/*.py $SP/tools/*.sh $DST/ferramentas/ 2>/dev/null
cp $SP/LEIAME.md $DST/LEIAME.md
mkdir -p $DST/lore && cp $SP/lore/*.md $DST/lore/
echo sincronizado

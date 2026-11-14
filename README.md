# Eclipse of the Forgotten

Metroidvania 2D feito com Phaser 3, Vite e TypeScript. O Último Carrasco de Vespera atravessa um reino
onde as memórias eram compradas, roubadas e trocadas até a Coroação do Silêncio falhar e trazer o
Primeiro Eclipse. Pelo caminho ele junta as lembranças que perdeu, e algumas delas têm duas versões.

- Jogar no navegador: https://enio-123.github.io/Eclipse-of-the-forgotten/
- Versão no claude.ai: https://claude.ai/artifact/J6Hjw8miabTdUriR53VrJT

Toda a arte é original e feita por código. O terreno e os fundos são pintados com pinceladas de tinta a
óleo (`art2/`) e reduzidos para a pixel art do jogo; personagens, chefes, bichos e armas são desenhados
em traço liso de tinta (`art/`). O gráfico EXTREME usa o terreno pintado em 2x, luz com sombras, névoa,
reflexos na água e um filtro de óleo por cima. O ECLIPSE GRAPHICS fica um nível acima: o terreno das 57
salas e os fundos da Ponte, da Prisão, do Fosso, das Catacumbas, da Cidade, da Catedral e das Minas são
repintados em 3x (um pixel da pintura em cada pixel de uma tela 1080p cheia), com a pedra em relevo
iluminada pelas tochas; a tela de título, que nos outros níveis é pixel art, mostra a mesma pintura em 3x
(o castelo de Vespera contra o eclipse); os enfeites antigos da primeira área (o portão e as estátuas da Ponte, os lampiões, os santuários,
o musgo, as velas) trocam o pixel art pela pintura em 3x (`src/gfx/props3.ts`); os personagens fazem
sombra; e o eclipse do céu fica vivo, com a coroa se mexendo devagar por cima da pintura
(`src/gfx/eclipse.ts`). Ele se escolhe em Configurações > Imagem (`?gfx=eclipse` no fim do
endereço fixa o nível).

## Rodar no computador

```sh
cd game
npm ci
npm run dev
```

`npm run build` gera `game/dist/`. A cada envio na branch `main`, o GitHub Actions monta essa mesma versão
e publica no GitHub Pages (`.github/workflows/pages.yml`).

## Controles

Teclado: A/D andam, W sobe e interage, S desce, Espaço pula, clique esquerdo ataca, F dá dash (depois das
Esporas), Ctrl agacha, E lança a corrente, Q usa o poder de memória, M abre o mapa (depois de comprar o
da região) e Esc pausa. Tudo pode ser trocado em Configurações. O jogo também aceita controle
(PlayStation, Xbox, Nintendo e genéricos) e toque no celular.

No celular, começar a jogar entra na tela cheia e deita a tela (no Android; no iPhone o Safari não deixa, e
o jogo pode ir para a Tela de Início). Com o celular em pé a página inteira é desenhada deitada, girada 90
graus, e o jogo ocupa a tela toda mesmo com a rotação travada (`game/src/systems/Screen.ts`; o CSS usa
`@container` e `cqw/cqh` para valer também com a página deitada). Em Configurações > Celular dá para voltar à
imagem pequena em cima, deitar para o outro lado e abrir o editor dos botões na tela, que muda o lugar e o
tamanho de cada um e a opacidade de todos (`systems/TouchLayout.ts`, `ui/touchEdit.ts`). O brilho fica em
Configurações > Imagem (`gfx/brightness.ts`, uma passada de gama depois de cada quadro). `tools/celular.cjs`
confere tudo isso.

## Pastas

- `game/` o jogo: `src/` (cenas, entidades, mundo, sistemas e interface) e `public/assets/` (folhas dos
  personagens, terrenos, fundos e música). Os mapas das salas ficam em `game/src/world/maps.ts`.
- `art/` scripts Python (numpy + Pillow) dos personagens, inimigos, chefes, armas e enfeites.
- `art2/` o motor de pintura (`brush.py`) e os pintores do terreno e dos fundos de cada área;
  `finaliza.py` passa cada tema pela paleta final. `apoio.py` pinta o que segura as construções que
  ficavam soltas no ar (pilares, arcos, pernas de rocha), na camada `parede-<sala>` atrás do terreno;
  `tools/hdpack.py --parede` corta essa camada para o EXTREME. Para o ECLIPSE, `eclipse.py` repinta o
  terreno em 3x e os `ecl_<área>.py` repintam os fundos no mesmo desenho dos antigos (`cidade_plano.py`,
  `poco_plano.py` e `ponte_plano.py` repetem o sorteio dos pintores antigos para cada peça cair no mesmo
  lugar: o da Ponte anota as nuvens, as casas, as janelas e as luzes, e serve também à tela de título; `poco3.py`
  tem as peças das camadas que emendam nas duas direções, as dos poços), com o kit de pedra em relevo de
  `pedra3.py`, e `ecl_enfeites.py` repinta em 3x os enfeites antigos da primeira área (o pixel art deles
  fica em `decos-originais/`); `tools/eclipsepack.py` junta tudo em poucos pacotes (`public/assets/hd3/`).
- `tools/` `rooms.py` gera os mapas das salas, os testes `*.cjs` jogam o jogo de verdade com Playwright
  (`regress.sh` roda os principais em fila; `eclipse.cjs` confere o nível ECLIPSE),
  `hdpack.py` corta o terreno do EXTREME e `pack.py` empacota a versão do claude.ai. `atlas.py` junta as
  imagens do começo do jogo em duas folhas (`public/assets/pack-*.png`): no build o jogo carrega as folhas e
  as soltas saem de `dist/` (a versão do claude.ai aceita no máximo 511 arquivos). Rode de novo quando uma
  dessas imagens mudar; se esquecer, o build avisa e a imagem que mudou vai solta.
- `tools/revisao/` a revisão das salas. `salas.cjs` fotografa cada sala inteira e `mosaico.py` junta as
  fotos em folhas; `foco.cjs` fotografa um ponto escolhido. `alcance.cjs` é a varredura de alcance: joga
  cada sala com a física de verdade (todos os movimentos de `alcance-page.js`, de cada ponto de apoio
  achado) com as habilidades que o cavaleiro tem ao chegar nela (`passes.txt`; `rodar.sh` roda um passe) e
  `analisa.py` mostra o que ficou de fora: chão nunca pisado, objeto nunca tocado, saída que uma entrada
  não alcança e ponto de onde não se sai. `rota.cjs` joga de verdade um caminho achado pela varredura (e
  mede o tempo), `um.cjs` roda um movimento só de um ponto, com o rastro, e `mapa.py` mostra um trecho do
  mapa com régua.
- `tools/video/` o vídeo "como zerar", gravado quadro a quadro num relógio virtual: `plan.js` é o roteiro
  dos 23 trechos (com os bots que jogam cada um), `capture.cjs` grava (com `GL=mesa` num Xvfb fica umas 3
  vezes mais rápido), `audio.cjs` refaz o som pelo motor do jogo e `montar.sh` junta tudo (`CRF=23` para um
  arquivo menor).
- `lore/` a lore oficial, o registro de continuidade e o plano de cada área.
- `LEIAME.md` notas de desenvolvimento das primeiras versões.

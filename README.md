# Eclipse of the Forgotten

Metroidvania 2D feito com Phaser 3, Vite e TypeScript. O Último Carrasco de Vespera atravessa um reino
onde as memórias eram compradas, roubadas e trocadas até a Coroação do Silêncio falhar e trazer o
Primeiro Eclipse. Pelo caminho ele junta as lembranças que perdeu, e algumas delas têm duas versões.

- Jogar no navegador: https://enio-123.github.io/Eclipse-of-the-forgotten/
- Versão no claude.ai: https://claude.ai/artifact/J6Hjw8miabTdUriR53VrJT

Toda a arte é original e feita por código. O terreno e os fundos são pintados com pinceladas de tinta a
óleo (`art2/`) e reduzidos para a pixel art do jogo; personagens, chefes, bichos e armas são desenhados
em traço liso de tinta (`art/`). O gráfico EXTREME usa o terreno pintado em 2x, luz com sombras, névoa,
reflexos na água e um filtro de óleo por cima.

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

## Pastas

- `game/` o jogo: `src/` (cenas, entidades, mundo, sistemas e interface) e `public/assets/` (folhas dos
  personagens, terrenos, fundos e música). Os mapas das salas ficam em `game/src/world/maps.ts`.
- `art/` scripts Python (numpy + Pillow) dos personagens, inimigos, chefes, armas e enfeites.
- `art2/` o motor de pintura (`brush.py`) e os pintores do terreno e dos fundos de cada área;
  `finaliza.py` passa cada tema pela paleta final.
- `tools/` `rooms.py` gera os mapas das salas, os testes `*.cjs` jogam o jogo de verdade com Playwright,
  `hdpack.py` corta o terreno do EXTREME e `pack.py` empacota a versão do claude.ai.
- `lore/` a lore oficial, o registro de continuidade e o plano de cada área.
- `LEIAME.md` notas de desenvolvimento das primeiras versões.

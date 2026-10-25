# Eclipse of the Forgotten

Metroidvania 2D (Phaser 3 + Vite + TypeScript). Visual pintado em tudo (fundos, terreno de cada sala, decoração) com pixel art nos personagens e um toque de Limbo (silhuetas, névoa, grão).

Versão jogável: https://claude.ai/artifact/J6Hjw8miabTdUriR53VrJT
Bíblia do jogo: https://claude.ai/artifact/VH5Rv24AoRCu32MxqSBvx8

## O que tem no jogo (rodada 5)

- Cinco salas: Ponte do Castelo (chuva e relâmpagos), Catacumbas de Vespera (espelho e a Lembrança do vale), Galeria dos Sinos e Cripta do Sineiro.
- Primeiro capítulo completo: prólogo na ponte, memória do vale, grade das catacumbas que abre depois dela, Galeria dos Sinos e a luta contra o Sineiro, que termina na tela "Fim do primeiro capítulo".
- Habilidades achadas no mapa: Garras de Ferro (pulo na parede; dá para subir uma parede só, indo e voltando) e Pena do Eclipse (pulo duplo). O poço da Galeria só sobe com as garras e o abismo só passa com o pulo duplo (a saída fica 7 blocos acima, numa viga pendurada, sem parede para as garras). A memória do alto da torre da ponte só se alcança voltando com as garras.
- Velas de descanso: curam, salvam e viram o ponto de volta ao morrer. Mapa que vai se desenhando conforme a câmera vê as salas (M, Tab ou Select; também pela pausa), com velas, relíquias, memórias e o chefe marcados.
- Cinco memórias para coletar e o Cobrador. Por memórias (que o cavaleiro esquece): Fôlego (dash recarrega mais rápido), Máscara remendada (+1 de vida) e Fio do carrasco (+30% de dano). Por moedas: Bolsa do dízimo (30, mais moedas e o dobro de cacos de vida), Lasca de porcelana (50, +1 de vida) e Pedra de amolar (70, +15% de dano).
- Inventário com 3 espaços (pausa > Inventário): tudo o que o Cobrador entrega vira item que só vale equipado. Fôlego, Máscara, Bolsa, Lasca e Pedra ocupam 1 espaço; o Fio do carrasco ocupa 2. Se não cabe, a compra vai guardada e o inventário diz quanto falta. Equipar um item de vida traz o fragmento vazio, e guardar não cura (não dá para ganhar vida de graça). A tela também lista as armas liberadas e as relíquias. Saves antigos ligam o que cabe nos 3 espaços.
- Trechos vencidos viram cinza: o inimigo que o cavaleiro já passou (andou dos dois lados dele) ou derrotou fica marcado; ao descansar numa vela, todos os marcados de todas as salas se desfazem em cinza e não voltam mais. Os que ainda não foram passados continuam voltando.
- Velocidade pelo peso da arma: a espada corre 1,4 da base antiga (224 px/s, antes 192). Adagas 1,1 da espada, arco 1,05, foice 0,94 e o Badalo 0,86. A animação de corrida acompanha e a tela Trocar arma mostra o atributo Corrida.
- Arma de chefe: o Sineiro deixa cair o Badalo do Sineiro, que fica no chão brilhando até ser pego. O Badalo é lento e pesado e cada pancada no chão solta uma onda que corre pelo chão, passa por baixo do escudo e derruba o guarda. Trancado em Trocar arma até vencer o chefe ("Vença o Sineiro"). Cada chefe novo vai ter a sua.
- Apagar progresso no menu inicial (só aparece com save), com confirmação e o foco começando em Cancelar. As configurações ficam; uma arma de chefe escolhida volta para a foice.
- Moedas do dízimo: todo inimigo derrotado solta moedas que pulam e quicam no chão (rastejante 2 a 4, corvo 3 a 5, guarda 7 a 10, Sineiro 40; a moeda grande, com furo, vale 5). Perto do cavaleiro elas vêm sozinhas. O contador aparece embaixo da vida na primeira moeda e as moedas ficam gravadas.
- Cacos de vida: a cada dois rastejantes ou corvos (ou um guarda) cai um caco de porcelana que devolve um fragmento de vida. Só cai e só é pego com o cavaleiro ferido; com a vida cheia o próximo fica guardado. Some depois de 16 segundos, piscando antes.
- Dash fantasma: o dash atravessa os inimigos e os golpes deles sem levar dano (com um respiro curto logo depois). Espinhos ainda machucam. O dash ficou 20% mais longo (94 px) e anda sempre a mesma distância, mesmo com o jogo lento. Dash ou pulo apertado durante a pausa curta de um impacto não se perde mais.
- Inimigos: rastejante, Guarda de escudo e espada (bloqueia de frente, se vira, corte alto que passa por cima de quem agacha, golpe de escudo; a rasteira derruba e ele leva dano caído), Corvo do Dízimo (avisa, mergulha e fica preso no chão se errar) e o chefe Sineiro (martelada com onda no chão que se pula, varredura no peito que se agacha ou desliza, investida até a parede que deixa ele tonto, e na segunda fase os sinos caem do teto com sombra de aviso).

## Pastas

- `jogo/` código do jogo. `npm install`, `npm run dev` para testar, `npm run build` gera `dist/` (pronto para GitHub Pages).
- `jogo/public/assets/` sprites, fundos e terrenos já gerados.
- `arte/gerador/` scripts Python (numpy + Pillow) da pixel art: `knight.py` e `build_sheet.py` (cavaleiro, uma folha por arma), `items.py` (ícones do inventário e o Badalo caído: `python3 items.py ../../jogo/public/assets`), `enemy.py`, `guard.py`, `crow.py`, `sineiro.py` (chefe), `props.py` (vela, pedestal, relíquias, grade, memória, Cobrador), `puppet.py` e `rig.py` (bonecos articulados que viram folhas de animação).
- `arte/pintura/` motor de pintura procedural (`brush.py`) e os pintores: `fundos_*.py` (fundos de cada área), `terreno.py` (pinta o terreno de uma sala: `python3 terreno.py sinos hd`), `decos.py` e `finaliza.py` (paleta final por tema: `python3 finaliza.py catacomb hd`).
- `ferramentas/rooms.py` gera os mapas das salas: `python3 rooms.py ../jogo/src/world/maps.ts` (`-v` mostra o mapa). Depois de mudar uma sala, repinte o terreno dela.
- `ferramentas/*.cjs` testes com Playwright (o jogo servido em http://localhost:8765):
  - `progression` grade, vela, relíquias, poço, abismo, memórias, Cobrador, mapa e morte voltando na vela.
  - `boss` a luta inteira do Sineiro até o fim do capítulo.
  - `enemies` guarda e corvo; `transitions` portas, espelho, volta da memória, pausa e morte; `doors3` portas da Galeria dos Sinos e da Cripta andando de verdade; `mobile` celular deitado e em pé; `gamepad` controle simulado.
  - `round5` velocidade de cada arma, trechos vencidos e cinza no descanso, inventário com 3 espaços (loja, mapa e save antigo), o Badalo (cai do Sineiro, onda no chão contra o guarda) e apagar progresso; `uishots` fotos das telas novas no PC e no celular; `ashshot` fotos em câmera lenta da cinza.
  - `loot` moedas e cacos de vida (o que cada inimigo solta, ímã, cura só ferido, contador, compra com moedas e gravação, Bolsa do dízimo) e o dash fantasma (atravessa sem dano, distância nova); `ghoststress` repete o dash através do rastejante e do guarda de vários lados; `lootshot` tira uma foto de perto das moedas e dos cacos no chão. Fotos desta rodada em `arte/rodada4/`.
  - `explore` percorre cada sala com a física real e confere se todo lugar alcançável leva ao objetivo.
  - `regress.sh` roda os testes principais em sequência e grava cada resultado em `shots/reg/`.
  - `jumpenv` mede o alcance real dos saltos (pulo, pulo + dash, pulo duplo, pulo duplo + dash) para desenhar abismos justos; `wallclimb` e `tower` conferem a subida com as garras.
- `ferramentas/pack.py` e `make_artifact.py` convertem `dist/` na página do Artifact.

## Controles padrão

A/D andar, W cima (descansar na vela, falar com o Cobrador, tocar o espelho), S baixo, Espaço pular (no ar de novo: pulo duplo; encostado na parede: pulo na parede), clique esquerdo atacar, F dash, Ctrl agachar (agachado + F desliza), M ou Tab mapa, Esc pausa (lá ficam Inventário e Trocar arma). Dá para trocar tudo em Configurações > Teclado e mouse, e existe o modo "clique para andar, botão direito ataca".

Controle (PlayStation, Xbox, Nintendo e genéricos, por cabo ou Bluetooth): analógico esquerdo ou direcional andam, botão de baixo pula (X / A / B), botão da esquerda ataca (Quadrado / X / Y), R2 ou o botão da direita dão dash, L2 ou L1 agacham (analógico para baixo também), Select abre o mapa, Start pausa. Nos menus o botão de baixo confirma, o da direita volta e L1/R1 trocam a aba. As dicas na tela mostram o desenho do botão da marca conectada, e a aba Configurações > Controle troca os botões e liga ou desliga a vibração. O código fica em `jogo/src/systems/Pad.ts`.

# Eclipse of the Forgotten

Metroidvania 2D (Phaser 3 + Vite + TypeScript). Visual misturado: terreno pintado e reduzido para pixel art, fundos pintados (os da Cidade-Catedral em alta resolução, sem pixel), e os personagens, chefes, bichos, armas e alguns enfeites no traço liso de tinta, no espírito de Hollow Knight. O cavaleiro é metade de cada: máscara, capuz, capa e armas no traço liso, o corpo em pixel. Um toque de Limbo por cima (silhuetas, névoa, grão).

Versão jogável: https://claude.ai/artifact/J6Hjw8miabTdUriR53VrJT
Bíblia do jogo: https://claude.ai/artifact/VH5Rv24AoRCu32MxqSBvx8

## O que tem no jogo

### Capítulo 1 (rodadas 1 a 5)


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

### Capítulo 2: Cidade-Catedral (mega atualização, área 1)

- Oito salas novas depois da cripta do Sineiro: a grade da direita da cripta abre quando o Sineiro cai e leva à Escadaria dos Penitentes, Praça do Cadafalso, Rua dos Penitentes, Telhados, Nave da Catedral, Claustro, Galeria dos Vitrais e Altar do Dízimo. O mapa e a lista de Lugares do Diário já contam com elas.
- Caminho: praça, rua, sobe pelo entulho até os telhados, quebra o vitral rachado e entra na nave pelo alto. Por dentro, a porta da catedral tira a tranca e vira atalho para a praça. Da nave, a escada em caracol sobe para a Galeria dos Vitrais (quem cai do buraco dela pousa no lustre da nave) e a galeria leva ao altar. O claustro fica à esquerda da nave.
- Segredos: paredes falsas (3 golpes) e vitrais rachados (2 golpes) escondem cofres do dízimo cheios de moedas, páginas do diário e passagens. A pedra falsa tem a mesma pintura da parede e some aos poucos quando quebra. Tudo fica gravado.
- Aparar: golpear bem no fim da preparação de um golpe inimigo deixa o inimigo tonto e o próximo golpe entra com bônus. Funciona no corte do guarda, no incensário do penitente e no do Arcebispo; golpear uma flecha rebate ela de volta no arqueiro. Uma dica aparece até a primeira vez.
- Inimigos novos: Arqueiro do balcão (flecha mirada de cima, dá para rebater) e Penitente do incensário (giro que bate no chão e deixa uma nuvem de incenso que machuca e some sozinha).
- Gente da cidade: a irmã Luzia, freira cega, entrega o Diário e a missão dos três sinos (telhados, claustro e nave; toca com um golpe para cima). A recompensa são as Contas da Irmã (item de 1 espaço: paredes falsas e vitrais brilham de leve e os esconderijos aparecem no mapa), a memória da voz dela e moedas. O ferreiro Brás forja cada arma em 3 níveis (30 moedas; 60 e o Bronze do Sineiro; 100 e o Ouro do dízimo), com dano x1,15, x1,3 e x1,5, gravado por arma. Esquecidos falam uma coisa por vez e uma procissão passa ao fundo da praça.
- Diário (pausa > Diário): História (as 10 páginas), Bestiário (cada inimigo com quantos já foram derrotados) e Lugares (12).
- Chefe: o Arcebispo do Dízimo, ajoelhado diante da rosácea do altar. Varre com o incensário (aparável), deixa nuvens de incenso, arremessa o incensário (pula por cima ou rebate de volta, o que deixa ele tonto), chove moedas do dízimo pela arena (o tablado protege), some na fumaça e reaparece atrás do cavaleiro. Na metade da vida quebra a rosácea: entram fachos de luz (a sombra do tablado protege) e dois penitentes vêm ajudar. Vencido, solta a memória e o Incensário e mostra a tela "Fim do segundo capítulo"; depois disso o altar fica em paz, com a rosácea quebrada.
- Arma do chefe: Incensário do Arcebispo, golpe largo pela corrente que deixa incenso queimando onde passa (o incenso pega até atrás do escudo do guarda). Corrida 0,95. Trancado em Trocar arma até vencer o Arcebispo.

## Estilo da arte

- Terreno: pintado em 2x (pedra, luz, musgo, pinceladas) e reduzido para os pixels do jogo com uma paleta por tema, porque ele segue a física bloco por bloco.
- Fundos: os das áreas antigas também viram pixel; os da Cidade-Catedral (céu do eclipse, cidade alta com a fachada da catedral, casas, arcada do claustro, paredes e pilares da nave) ficam lisos, em alta resolução, com filtro suave, e repetem sem costura na horizontal.
- Personagens, chefes, bichos, armas, cortes e enfeites da cidade (porta, sino, cofre, página, cadafalso, fonte, altar, rosácea): traço liso de tinta com sombra pintada, desenhados com 2 pixels por pixel do mundo e mostrados reduzidos. `jogo/public/assets/hd.json` lista essas imagens (nome e quantos pixels da imagem cabem em um pixel do mundo).
- Resolução (Configurações > Imagem): Automática, Nítida ou Leve. A tela tem 2 ou 3 pixels por pixel do jogo para o traço liso sair nítido; na Automática ela começa assim e baixa sozinha um nível se o jogo ficar abaixo de uns 42 quadros por segundo, e num computador sem placa de vídeo (como o navegador dos testes) já começa na Leve, com 1 pixel por pixel do jogo. `?res=2` no fim do endereço fixa a resolução (as fotos de conferência usam isso). O código fica em `jogo/src/gfx/view.ts`.

## Pastas

- `jogo/` código do jogo. `npm install`, `npm run dev` para testar, `npm run build` gera `dist/` (pronto para GitHub Pages).
- `jogo/public/assets/` sprites, fundos e terrenos já gerados.
- `arte/gerador/` scripts Python (numpy + Pillow) da pixel art: `knight.py` e `build_sheet.py` (cavaleiro, uma folha por arma), `items.py` (ícones do inventário e o Badalo caído: `python3 items.py ../../jogo/public/assets`), `enemy.py`, `guard.py`, `crow.py`, `sineiro.py` (chefe), `props.py` (vela, pedestal, relíquias, grade, memória, Cobrador), `puppet.py` e `rig.py` (bonecos articulados que viram folhas de animação).
  - Traço liso: `ink.py` (o renderizador de tinta, com os mesmos bonecos de `puppet.py`) e `ink_sheets.py`, que gera as folhas de todos os personagens, as armas caídas, os cortes, os ícones e os enfeites da cidade (`props_hd.py`) e atualiza o `hd.json`: `python3 ink_sheets.py ../../jogo/public/assets [nomes] [--preview=<pasta>]`. Bonecos novos do capítulo 2: `archer.py`, `censer.py`, `arcebispo.py`, `townsfolk.py` (freira, ferreiro, esquecidos). A rosácea do altar: `python3 rose.py ../../jogo/public/assets --hd`.
- `arte/pintura/` motor de pintura procedural (`brush.py`) e os pintores: `fundos_*.py` (fundos de cada área), `terreno.py` (pinta o terreno de uma sala: `python3 terreno.py sinos hd`), `decos.py` e `finaliza.py` (paleta final por tema: `python3 finaliza.py catacomb hd`).
  - Cidade-Catedral: `cidade.py` pinta o terreno das salas da cidade e da catedral (`python3 cidade.py praca hd`) e, nas salas com segredos, também a camada `-secret` com a pedra falsa e os vitrais; `fundos_cidade.py` pinta os fundos lisos (`python3 fundos_cidade.py hd/cidade [camadas] [--preview=<pasta>]`; copie os PNG para `jogo/public/assets` e eles já estão no `hd.json`); `prev_ter.py` tira fotos de prévia do terreno. Depois, `python3 finaliza.py city hd` e `python3 finaliza.py nave hd`. Para refazer uma sala sem mexer nas outras já aprovadas: `--keep=terreno-escadaria` (usa só as cores que o tema já tem).
- `ferramentas/rooms.py` gera os mapas das salas: `python3 rooms.py ../jogo/src/world/maps.ts` (`-v` mostra o mapa). Depois de mudar uma sala, repinte o terreno dela.
- `ferramentas/*.cjs` testes com Playwright (o jogo servido em http://localhost:8765):
  - `progression` grade, vela, relíquias, poço, abismo, memórias, Cobrador, mapa e morte voltando na vela.
  - `boss` a luta inteira do Sineiro até o fim do capítulo.
  - `enemies` guarda e corvo; `transitions` portas, espelho, volta da memória, pausa e morte; `doors3` portas da Galeria dos Sinos e da Cripta andando de verdade; `mobile` celular deitado e em pé; `gamepad` controle simulado.
  - `round5` velocidade de cada arma, trechos vencidos e cinza no descanso, inventário com 3 espaços (loja, mapa e save antigo), o Badalo (cai do Sineiro, onda no chão contra o guarda) e apagar progresso; `uishots` fotos das telas novas no PC e no celular; `ashshot` fotos em câmera lenta da cinza.
  - `loot` moedas e cacos de vida (o que cada inimigo solta, ímã, cura só ferido, contador, compra com moedas e gravação, Bolsa do dízimo) e o dash fantasma (atravessa sem dano, distância nova); `ghoststress` repete o dash através do rastejante e do guarda de vários lados; `lootshot` tira uma foto de perto das moedas e dos cacos no chão. Fotos desta rodada em `arte/rodada4/`.
  - `explore` percorre cada sala com a física real e confere se todo lugar alcançável leva ao objetivo.
  - Capítulo 2: `area1` (ligações das salas, paredes falsas, vitrais, cofre, páginas, porta e atalho, lustre, sinos), `parry` (aparar o guarda, o penitente do incensário e a flecha do arqueiro), `npcs` (freira, missão dos sinos, Diário, ferreiro, esquecidos, procissão), `arcebispo` (a luta inteira, as duas fases, o Incensário e o fim do capítulo). `artcheck` confere a página do Artifact já empacotada (servida em http://localhost:8766): carrega, abre o menu e entra no jogo sem erros.
  - `regress.sh` roda os testes principais em sequência e grava cada resultado em `shots/reg/` (um por vez: em paralelo o navegador fica lento e os tempos falham).
  - `jumpenv` mede o alcance real dos saltos (pulo, pulo + dash, pulo duplo, pulo duplo + dash) para desenhar abismos justos; `wallclimb` e `tower` conferem a subida com as garras.
- `ferramentas/pack.py` e `make_artifact.py` convertem `dist/` na página do Artifact.

## Controles padrão

A/D andar, W cima (descansar na vela, falar com o Cobrador, tocar o espelho), S baixo, Espaço pular (no ar de novo: pulo duplo; encostado na parede: pulo na parede), clique esquerdo atacar, F dash, Ctrl agachar (agachado + F desliza), M ou Tab mapa, Esc pausa (lá ficam Inventário e Trocar arma). Dá para trocar tudo em Configurações > Teclado e mouse, e existe o modo "clique para andar, botão direito ataca".

Controle (PlayStation, Xbox, Nintendo e genéricos, por cabo ou Bluetooth): analógico esquerdo ou direcional andam, botão de baixo pula (X / A / B), botão da esquerda ataca (Quadrado / X / Y), R2 ou o botão da direita dão dash, L2 ou L1 agacham (analógico para baixo também), Select abre o mapa, Start pausa. Nos menus o botão de baixo confirma, o da direita volta e L1/R1 trocam a aba. As dicas na tela mostram o desenho do botão da marca conectada, e a aba Configurações > Controle troca os botões e liga ou desliga a vibração. O código fica em `jogo/src/systems/Pad.ts`.

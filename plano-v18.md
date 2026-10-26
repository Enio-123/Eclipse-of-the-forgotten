# v18: áreas mais longas (pedido do Enio, 26/10 10:51)

Cada região ganha salas novas (e algumas salas ficam mais compridas). As salas novas também levam os
registros que a integração da lore pede (continuidade.md, seção 9), então #57 e #33 andam juntos.

Pipeline de uma sala nova:
1. mapa em tools/rooms.py (função + entrada no dicionário; --minas/--floresta) e
   `python3 tools/rooms.py game/src/world/maps.ts --minas --floresta`
2. RoomDef em game/src/world/rooms.ts (título, subtítulo, tema, música, saídas, pensamentos) e as
   saídas das vizinhas (mapa delas também: portas)
3. MAP_POS (rooms.ts) e REGIONS (world/regions.ts)
4. pintura: art2/<regiao>.py <sala> <pasta> + finaliza.py + hdpack (tools/hdpack.py); a imagem entra
   em ROOM_IMAGES (gfx/roomAssets.ts)
5. looks.ts (ROOMS) se a sala pedir luz própria
6. testes: links da região, explore.cjs (alcance), regress.sh

Salas novas — o que ficou pronto (v18):

| Região | Sala | Onde entra | O que tem |
|---|---|---|---|
| Vespera | Galeria dos Nichos | catacumbas -> sinos | lápides raspadas, a casa do coveiro, a laje que cede com a memória do vale |
| Cidade | Mercado do Dízimo | praça -> rua | as bancas fechadas, a balança da Casa, o édito no poste |
| Prisão | As Solitárias | poço -> celas | o corredor das portas, o livro das sentenças na mesa do escrivão |
| Fosso | A Margem da Tinta | fosso -> abismo | a calha de tinta corrente, as argolas da corrente, o caderno do copista, a memória das mãos |
| Minas | Galeria Alagada | trilhos -> prensas | a bacia parada, as pedras de pé, a casa das bombas atrás do tampão de Âmbar |
| Floresta | A Mata Fechada | lago -> cabana | a copa fechada (fundo próprio, escuro), o cercado das esperas, a cova com o pinheiro, a espera do guarda |

Ficaram para depois (não cabem no mesmo fôlego, e as regiões já dobraram de tamanho): "Cisterna"
(abaixo dos sinos), "Campanário" (telhados), "Poço do Elevador" (prensas -> veio) e "Cascata
Congelada" (serra -> clareira).

Memória de vídeo: com roomAssets cada sala nova só pesa quando está aberta.

Fora as salas, entraram nesta versão:
- o mapa redesenhado, com o marcador do cavaleiro, e cada mapa de região agora é comprado do
  agrimensor (não se começa com nenhum)
- o dash deixou de vir de graça: é uma habilidade das Esporas
- as salas fechadas ficaram mais escuras, com contraste forte (vinheta por sala e luz por sala)
- as animações de corrida, pulo e queda ficaram mais fluidas
- líquido parado com camada funda e reflexo por região (a tinta do Fosso, a água das Minas)
- o save passou a validar a sala pelo próprio mapa (sem isso, descansar numa sala nova perdia o save)

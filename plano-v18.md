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

Salas novas (proposta):
- Vespera: "Galeria dos Nichos" (catacumbas -> sinos; lápides sem nome, registro), "Cisterna" (abaixo
  dos sinos; água, baú)
- Cidade: "Mercado do Dízimo" (praça -> rua; édito da Casa Vhalor), "Campanário" (subida a partir dos
  telhados; sino)
- Prisão: "Solitárias" (ramo das correntes; Livro das Sentenças)
- Fosso: "Margem da Tinta" (fosso -> abismo; registro de A.)
- Minas: "Galeria Alagada" (ramo dos trilhos), "Poço do Elevador" (prensas -> veio)
- Floresta: "Bosque das Fitas" (pinhal -> lago), "Cascata Congelada" (serra -> clareira)

Memória de vídeo: com roomAssets cada sala nova só pesa quando está aberta.

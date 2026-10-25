# Área 1: Cidade-Catedral (plano de trabalho)

Capítulo 2. A cripta do Sineiro ganha uma passagem à direita (grade 'Y' com chave boss:sineiro).

## Salas (MAP_POS em tiles; y cresce para baixo)
| id | título | pos | W x H | ligações |
|---|---|---|---|---|
| escadaria | Escadaria dos Penitentes | (434,-24) | 36x36 | esq-baixo: cripta; dir-cima: praca |
| praca | Praça do Cadafalso | (470,-42) | 120x34 | esq: escadaria; dir: rua; porta O: nave (trancada por dentro, short:catedral) |
| rua | Rua dos Penitentes | (590,-48) | 150x40 | esq: praca; cima (buraco no telhado, x faixa): telhados |
| telhados | Telhados | (590,-88) | 150x40 | baixo (buraco): rua; esq-cima: nave (vitral rachado 'V') |
| nave | Nave da Catedral | (470,-82) | 120x40 | dir: telhados; esq: claustro; porta O esq-baixo: praca (tranca); porta O caracol: galeria |
| claustro | Claustro | (380,-82) | 90x40 | dir: nave |
| galeria | Galeria dos Vitrais | (470,-112) | 120x30 | porta O: nave (caracol); dir: altar |
| altar | Altar do Dízimo | (590,-116) | 60x28 | esq: galeria |

Velas: escadaria(0)? praca R0 em cima do cadafalso; claustro R0 (fonte); galeria R0 (antes do altar).
Sinos da freira (b): telhados, claustro, nave. Páginas (p): ~7 na cidade + 3 nas salas antigas.
Segredos (%): rua (porão), telhados (chaminé), claustro (arcada), nave, galeria. Vitrais quebráveis (V).

## Mapa: caracteres novos
% parede falsa (quebra com 3 golpes, grava wall:sala:x:y)  V vitral quebrável (idem, vidro)
Y grade com chave (RoomDef.locks)  O porta (RoomDef.doors, na ordem do mapa)  Q alavanca
b sino da freira  p página do diário  N freira cega  B ferreiro  E esquecido (fala)
a arqueiro da sacada  i penitente do incensário  Z procissão (caminho de fundo)  X chefe (RoomDef.boss)

## Sistemas
- Saídas: side left/right com faixa y0..y1; up/down com faixa x0..x1. Portas (subir).
- Aparar: Enemy.parry(box) -> inimigo tonto (stagger); flechas inimigas voltam.
- Paredes falsas e vitrais: camada 'terrain-<sala>-secret' recortada por grupo.
- Ferreiro: níveis 1..3 por arma (30, 60+bronze do Sineiro, 100+ouro do dízimo); dano x1.15/1.3/1.5.
- Freira: dá o Diário, missão dos 3 sinos; recompensa Contas da Irmã (item 1 espaço: segredos brilham e aparecem no mapa) + memória.
- Diário (pausa): História (páginas), Bestiário (mortes por tipo), Lugares.
- Inimigos: arqueiro (flecha mirada, aparável), penitente do incensário (giro aparável + fumaça no chão).
- Chefe Arcebispo do Dízimo: incensário (aparável), fumaça, chuva de moedas; fase 2: vitral quebra, fachos de luz, chama procissão. Solta Incensário + ouro do dízimo + memória; fim do capítulo 2.
- Arma Incensário: corrente com incensário, deixa fumaça que machuca inimigos.
- Extras: vela no cadafalso, telhados, vitrais, procissão no fundo, esquecidos que falam.

## Arte
Temas 'city' (exterior) e 'nave' (interior). Terreno pintado das 8 salas, fundos city-sky/city-far/city-mid e nave-far/nave-mid.
Personagens: arqueiro, penitente do incensário, freira, ferreiro, arcebispo, procissão, esquecidos; knight-incensario.
Objetos: sino, página, alavanca, porta, bigorna/forja, item-incensario, item-beads.

## Testes
area1.cjs (ligações, aparar, segredos, porta/atalho, freira, ferreiro, diário, inimigos, chefe), explore nas salas novas, regressão.

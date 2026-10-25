# Área 2: Prisão Subterrânea (plano de trabalho)

Capítulo 3. Onde o carrasco foi condenado e recebeu a máscara. Celas, correntes, ferro enferrujado.
Abre depois do Arcebispo: o alçapão embaixo do cadafalso da praça (marca boss:arcebispo).
Recursos da lista: 5 gancho de corrente, 10 Eco da morte, 15 arenas, 16 prisioneiro, 9 carcereiro.
Chefe: a Carcereira, que solta a Corrente. Extras: alavancas e portas, fuga com alarme, celas escondidas.

## Salas (MAP_POS em tiles; y cresce para baixo; a prisão fica embaixo da praça e da rua)
| id | título | ligações |
|---|---|---|
| poco | Poço dos Condenados | cima: praca (alçapão); esq: escadaria (grade da alavanca, atalho); dir-baixo: celas |
| celas | Corredor das Celas | esq: poco; dir: correntes; baixo (gancho): mascara; porta: arena |
| correntes | Sala das Correntes | esq: celas; dir-cima (gancho): guarita |
| guarita | Guarita dos Carcereiros | esq: correntes; dir: fuga |
| fuga | Galeria da Fuga | esq: guarita; baixo-esq: celas (volta pelo andar de baixo) |
| arena | Arena dos Condenados | porta: celas |
| mascara | Sala da Máscara | cima: celas (chefe) |

Velas: celas R0 (no meio, perto do preso), guarita R0 (depois do gancho), antes da Sala da Máscara.
Segredos: celas escondidas atrás de parede falsa (%), cofres ($), páginas (p) e argolas nas salas antigas.

## Mapa: caracteres novos
o argola do gancho (teto ou parede)  Q alavanca (golpe vira; abre as grades 'Y' com a marca lever:sala:i)
= alçapão (fileira sólida enquanto a marca não existe; RoomDef.trapdoors)  k molho de chaves
W carcereiro  I o preso da cela sete  e onde o Eco espera (só nos testes)  w gancho de corrente (relíquia)

## Sistemas
- Gancho de corrente (relíquia 'hook'): botão novo (E ou clique direito; Triângulo/Y ou R1 no
  controle; botão na tela do celular). Mira a argola mais perto na frente do cavaleiro (até 9 blocos,
  com linha livre), a corrente voa e puxa o cavaleiro até ela. Chegando, recupera o pulo duplo e o
  dash. Argolas de teto deixam pendurado por um instante; de parede, puxam de lado.
- Eco da morte: ao morrer, fica um Eco (o cavaleiro em sombra) onde ele caiu, com todas as moedas.
  Derrotar o Eco devolve tudo; morrer de novo antes perde as moedas dele (o Eco novo leva as de
  agora). Aparece no mapa. Sala de chefe: o Eco espera na entrada. Grava em progress.echo.
- Alavancas: golpe vira a alavanca, grava lever:sala:i e abre as grades 'Y' com essa marca (pode
  ser em outra sala).
- Alçapão: 'trapdoors' na sala (marca que abre). O da praça abre com boss:arcebispo.
- Fuga com alarme: pegar o molho de chaves toca o alarme. Na Galeria da Fuga as grades descem uma
  a uma na frente do cavaleiro (dá para deslizar por baixo no fim) e carcereiros aparecem. Se uma
  grade fechar antes, ela abre de novo quando o alarme acaba (sem ficar preso).
- Arena dos Condenados: a porta tranca e vêm três ondas (rastejantes e guardas; carcereiros e
  arqueiros; todos juntos). No fim, o Elo do Condenado: mais um espaço no inventário (4). Morrer
  na arena só reabre a porta.
- O preso da cela sete: reconhece o carrasco. Pede o molho de chaves da guarita. Solto, dá uma
  memória que contradiz outra (Ato II, as versões) e mostra a passagem para a Sala da Máscara.
- Carcereiro: corrente com gancho. Chicotada de longe (aparável), gancho que puxa o cavaleiro
  para um golpe de ombro (desvia com dash ou pulo), empurrão de perto.
- Chefe a Carcereira (Sala da Máscara): chicotada longa (pula), gancho que puxa (apara = tonta),
  bola com corrente por cima (onda no chão), gaiolas que caem do teto com sombra de aviso.
  Fase 2: o alarme toca, as tochas apagam (só a lanterna dela e as brasas), duas celas abrem e
  soltam penitentes, combinações mais rápidas. Solta a Corrente, a memória da máscara e o ferro da
  prisão (material do ferreiro, se fizer falta); fim do terceiro capítulo.
- Arma Corrente: o golpe mais longo (alcance 6), dano médio; a ponta puxa o inimigo um pouco.
- Argolas nas salas antigas: ponte, catacumbas, sinos, rua e nave ganham argolas que levam a
  esconderijos (cofre, página, memória escondida).

## Arte
Tema 'prison': terreno pintado (pedra úmida, ferro enferrujado, correntes), fundos lisos HD
(celas ao fundo, correntes penduradas, a forja das máscaras).
Personagens no traço liso: carcereiro, Carcereira (chefe), o preso; o Eco usa a folha do cavaleiro
em sombra. Objetos: argola, alavanca, alçapão, molho de chaves, gaiola, grade da cela, a bigorna
da máscara, item-corrente, item-elo, corrente do gancho; knight-corrente.

## Testes
area2.cjs (ligações, alçapão, alavancas, gancho, fuga, preso, arena), echo.cjs (morrer, Eco com as
moedas, morrer de novo perde), carcereira.cjs (a luta inteira), explore nas salas novas, regressão.

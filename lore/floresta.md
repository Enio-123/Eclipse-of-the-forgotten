# Floresta Nevada (capítulo 5)

Plano da área, escrito antes de construir (26/10/2026). Segue a [lore oficial](lore-oficial.md) e o
[registro de continuidade](continuidade.md). Quando algo mudar no jogo, atualize aqui e lá.

## O que a área conta

A lore pede: memórias de Arielle e momentos de calma que contrastam com a violência dele. É aqui
que o nome dela volta.

A floresta é a da abertura do jogo. Quem jogou reconhece os pinheiros altos, a luz entre as copas e
os dois lobos: a abertura era uma lembrança deste lugar, e a figura de capa vermelha era ela.

A história da floresta, contada pelos registros, memórias e cenário:

- A Casa Vhalor caçava quem fugia de Vespera com memórias proibidas: arquivistas, testemunhas,
  pesquisadores. O Mestre da Caça e os lobos da Casa traziam os fugitivos de volta, e era o carrasco
  quem os recebia no fim da trilha.
- Arielle guardava cópias dos registros numa cabana no meio da floresta, a casa da avó dela. Era ali
  que os dois se encontravam, longe da Casa. Ela prensava flores entre as páginas (o herbário).
- Uma vez, numa caçada, ele mandou a matilha para o lado errado e ela passou a serra. Foi a única vez
  que ele desobedeceu. Isso pesa no fim: ele sabia que podia escolher, e na noite do Eclipse escolheu
  cumprir a ordem.
- A carta da cabana tem data de depois do casamento que não aconteceu, e nela ela ainda fala dele. É a
  prova que desmente "o Arcebispo cobrou a memória dela e ela me esqueceu" (continuidade 5.1).

## Como se chega

A Galeria do Capataz já tem o bloco de Âmbar na parede da direita ("do outro lado passa um vento
frio"). Atrás dele, o túnel sobe e sai na encosta. A Picareta quebra o bloco; o mago quebra com a
Energia do Capataz (o Âmbar cede à magia).

## Salas

| Sala | Título | Subtítulo | O que tem |
|---|---|---|---|
| encosta | Encosta Gelada | A mina respira frio | Saída da mina para a neve, descida em degraus de pedra, primeiros lobos, a floresta lá embaixo no fundo, vento |
| pinhal | O Pinhal | Onde a caça passava | Pinheiros altos com galhos que seguram (plataformas), esperas de caça de madeira, lobos, corujas, as pegadas dela levando a um galho escondido |
| lago | Lago Congelado | O gelo guarda | Gelo que escorrega, gelo fino que racha, água gelada que machuca, rostos parados embaixo do gelo, a ilha com uma memória, argolas na pedra do outro lado |
| cabana | A Cabana | Onde ela guardava as flores | Clareira sem inimigos, a cabana em corte (lareira para descansar, herbário, carta, a capa pendurada), a memória do nome, música calma |
| serra | A Serra | A trilha que ela abriu | Subida vertical com correntes de ar (a capa plana e sobe), galhos, argolas em árvores mortas, corujas, rajadas de vento |
| clareira | Clareira da Caça | O fim da trilha | Arena do Mestre da Caça; depois da luta, a descida para o Vale das Cachoeiras (fechada até a área existir) |

## Mecânicas novas

1. **Gelo**: o chão de gelo escorrega (aceleração e freada bem menores). O deslize no gelo vai mais longe.
2. **Gelo fino**: racha quando ele fica parado em cima ou cai pesado; quebra e abre para a água.
3. **Água gelada**: cair na água do lago machuca aos poucos e empurra para fora (volta ao último chão seguro, como os espinhos, se ficar).
4. **Vento**: rajadas que empurram de lado em trechos marcados (a neve mostra a direção antes).
5. **Correntes de ar**: colunas de ar subindo dos vãos (na serra e no lago); com a capa ele sobe.
6. **A Capa de Arielle** (relíquia da área, na cabana): segurando pulo no ar, o retalho vermelho abre e ele plana. A capa é desenhada pelo jogo (pano que balança), presa nos ombros: sempre visível como um retalho vermelho que tremula atrás dele, aberta quando plana. Vale para cavaleiro e mago.
7. **Pegadas**: na neve ficam as pegadas dele. Em alguns trechos aparecem pegadas pequenas, de luz fraca, que não são dele: levam a memórias e esconderijos (o eco dela).

## Inimigos

- **Lobo da Caça**: os cães da Casa Vhalor. Congelaram correndo atrás de alguém e continuam correndo. Anda de lado, para e uiva (os olhos acendem), depois corre e salta mordendo. Machuca ao encostar.
- **Coruja de Geada**: dorme pousada nos galhos. Quando ele passa embaixo, solta-se num mergulho em curva e volta para outro galho. As penas soltam geada.

## Chefe: O Mestre da Caça

- Quem é: o caçador-mor da Casa Vhalor. Trazia os fugitivos de volta pela neve e os entregava ao carrasco no fim da trilha. Congelou esperando uma presa que nunca voltou (ela passou a serra).
- Aparência: alto, casaco de peles de lobo coberto de geada, capuz com a barba congelada, a lança longa de caça com uma lanterna pendurada na ponta, a trompa no cinto e o brasão da Casa no peito.
- Fase 1: estocadas longas da lança (agachar ou pular), salto com a lança para baixo (sai de baixo), a trompa chama dois lobos (uma vez por fase).
- Fase 2 (metade da vida): a nevasca. A tela embranquece, ele some na neve e só a lanterna anda pela arena. Antes de atacar a lanterna pisca; os olhos dos lobos acendem na nevasca.
- Vencido: cai de joelhos, a lanterna apaga, a trompa cai. Deixa o livro da caça (registro), a memória "A trilha na neve" e a arma Lança do Caçador (no mago, vira Energia).
- Fala (rara, uma vez): "Você também caçava. Só esperava no fim da trilha."

## Lore da área

No jogo desde a v17 (26/10/2026). Os textos ficam em `game/src/world/lore.ts`.

- Registros:
  - pinhal:0 "O bilhete na casca": papel preso no tronco com uma fita vermelha; outras fitas seguem mata adentro. "Se a neve apagar a trilha, siga as fitas: elas levam à casa da minha avó. Os cães da Casa não passam do lago. A." Prova: arielle.
  - cabana:0 "O herbário": flores prensadas, o lugar e o dia embaixo de cada uma. Antes da memória "O nome dela", o nome bordado na capa escorrega quando ele junta as letras (como o nome na areia). Depois, o registro muda: "bordado em linha vermelha: Arielle", e a última página guarda uma flor da serra e "para lembrar o caminho de volta". Se ele já tinha lido o herbário, ao pegar a memória pensa: "O nome bordado na capa do herbário. Agora as letras ficam paradas: Arielle." Prova: arielle.
  - cabana:1 "A carta que ficou": data de três dias depois do casamento que não houve. Ela avisa que, se disserem que o Arcebispo cobrou a memória dela e que ela o esqueceu, não é verdade; não chegou ao altar porque naquele dia descobriu para onde a Casa leva o Âmbar das prensas; "Volte pela serra, que eu explico tudo. A." Provas: arielle, ambar. Desmente a versão do Arcebispo (continuidade 5.1).
  - clareira:0 "O livro da caça": cai do Mestre vencido (e fica perto do corpo nas visitas seguintes). Fugitivos trazidos de volta (arquivista, testemunhas do tablado, copista e a filha) e entregues ao carrasco; a última caçada: "o carrasco mandou a matilha para o vale. A trilha era falsa. A arquivista passou a serra. Avisar a Casa Vhalor: ele não serve para caçar." Provas: vhalor, inocentes.
- Memórias:
  - lago:0 "O lago congelado": ela rindo quando ele escorregou no gelo e caindo também. Inteira (dourada), eco dela.
  - cabana:0 "O nome dela" (NAME_MEMORY): "Arielle." É o primeiro lugar do jogo onde o nome aparece. Inteira (dourada), eco dela.
  - clareira:boss "A trilha na neve": duas versões (mandou a matilha para o vale e ficou olhando ela subir a serra, ou mostrou o caminho aos cães). Roxa (corrompida). O livro da caça confirma a primeira.
- Bestiário: Lobo da Caça, Coruja de Geada e O Mestre da Caça (e entraram também A Sombra do Carrasco, O Reflexo e O Capataz de Âmbar, que faltavam). No Grimório do Necromante, o lobo e a coruja voltam como eco, e o Mestre como eco de chefe (a estocada baixa).
- Pensamentos curtos ao entrar, no lago, na cabana e depois do chefe (já no jogo desde a v16).

## Sistemas da história que nascem aqui

- Memórias com duas versões e a prova que decide: a versão falsa racha no Diário quando a prova é achada. Primeiras a usar: "O dízimo do casamento" (prova: a carta) e "A trilha na neve" (prova: o livro da caça).
- O nome Arielle passa a aparecer nos textos depois da memória "O nome dela" (antes, só "ela", "a moça de capa vermelha", "A.").

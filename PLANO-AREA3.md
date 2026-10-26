# Área 3: Minas Abandonadas (plano de trabalho)

Capítulo 4. Onde a Casa Vhalor tirava o Âmbar Mnêmico. A lore manda: a exploração dos trabalhadores
e a origem industrial do Âmbar (ver `lore/continuidade.md`, seção 8). Já nasce no EXTREME.
Abre depois da Sombra do Carrasco: a parede direita do Leito do Abismo é uma membrana abissal (Véu).
Recursos da lista: 8 poderes de memória, 11 fragmentação, 14 mais itens e espaços, a sombra que imita
(mini-chefe), fuga de vagonete. Chefe: o Capataz, que solta a Picareta.

## Salas (a mina fica embaixo e à direita do abismo)
| id | título | ligações |
|---|---|---|
| boca | Boca da Mina | esq: abismo (membrana); dir: trilhos; baixo: poço do elevador |
| trilhos | Galeria dos Trilhos | esq: boca; dir: prensas (a fuga de vagonete volta por aqui) |
| elevador | Poço do Elevador | cima: boca; baixo: veio; plataforma que desce com alavanca |
| veio | Veio de Âmbar | cima: elevador; dir: espelhos; esq: alojamento |
| alojamento | Alojamento dos Mineiros | dir: veio (vela, registros, o mineiro que ficou) |
| espelhos | Câmara de Âmbar | esq: veio; dir: prensas (mini-chefe: a sombra que imita) |
| prensas | Casa das Prensas | esq: trilhos; baixo-esq: espelhos; dir: capataz |
| capataz | Galeria do Capataz | esq: prensas (chefe) |

## Lore nas salas
- Registros: o livro do Capataz (alojamento: turnos pagos com esquecimento), a ordem da Casa
  Vhalor para as prensas (prensas), a ficha assinada "A." com uma flor prensada (veio).
- O mineiro que ficou (alojamento): esqueceu o próprio nome na mina; reconhece a capa vermelha.
- Memória essencial depois do Capataz: as luzes douradas que o cavaleiro coleta são Âmbar, memória
  de gente. Uma das versões de "Arielle fugindo" (corrompida, roxa).
- Fim do quarto capítulo com a revelação.

## Sistemas
- Poderes de memória: barra de Âmbar que enche acertando inimigos. Lembrança (tempo quase parado
  por um instante), Eco (uma cópia de tinta repete o último golpe), Remendo (cura gastando o ouro
  do kintsugi). Um botão novo; troca no menu de pausa.
- Fragmentação: com 1 de vida e na fase 2 do chefe, a tela racha, a onda roxa passa, inimigos de
  tinta aparecem (somem com um golpe) e a gravidade fica leve por alguns segundos.
- Vagonete: anda sozinho nos trilhos depois do golpe, pula as falhas, o teto desaba atrás.
- Cristais de Âmbar: acendem o chão (luz da sala), quebram com a Picareta e abrem passagens.
- Itens novos (seis) e dois espaços extras escondidos.

## Inimigos e chefes
- Mineiro esquecido (picareta curta, pula e bate), morcego de âmbar (mergulha e brilha antes).
- A sombra que imita (Câmara de Âmbar): repete os movimentos do cavaleiro com atraso.
- O Capataz (Galeria do Capataz): picareta no chão abre cristais, cacos de âmbar em arco,
  investida, prensa do teto com sombra de aviso; fase 2 com a fragmentação. Solta a Picareta.

## Testes
area3.cjs (ligações, membrana, elevador, vagonete), capataz.cjs (a luta), poderes.cjs, regressão.

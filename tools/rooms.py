"""Monta os mapas ASCII das salas do prólogo e gera src/world/maps.ts.

'#' pedra  '-' plataforma atravessável  '^' espinhos
P início (acordar)  1-9 entradas  c penitente  g guarda de escudo  v corvo (paira nessa célula)
L poste aceso  l poste apagado  S estátua  G cadafalso  D portão  C velas  M espelho
T árvore grande  t árvore pequena  F figura de capa vermelha  ~ água
R vela de descanso (cura e salva)  K o Cobrador  m fragmento de memória
J Garras de Ferro (pulo na parede)  U Pena do Eclipse (pulo duplo)
| grade de ferro (sólida enquanto fechada)  X onde o chefe aparece
Cidade-Catedral:
% parede falsa (quebra com golpes)  V vitral quebrável  Y grade com chave (RoomDef.locks)
O porta (entra apertando para cima; RoomDef.doors na ordem do mapa)  $ baú de moedas
b sino da freira  p página do diário  N freira cega  B ferreiro  E esquecido (fala; RoomDef.npcs)
a arqueiro da sacada  i penitente do incensário  Z ponta do caminho da procissão
H cadafalso grande (a vela fica em cima)  f fonte do claustro  A altar do dízimo
"""
import sys


class Grid:
    def __init__(self, w, h, fill='.'):
        self.w, self.h = w, h
        self.g = [[fill] * w for _ in range(h)]

    def fill(self, x0, y0, x1, y1, ch):
        for y in range(max(0, y0), min(self.h, y1 + 1)):
            for x in range(max(0, x0), min(self.w, x1 + 1)):
                self.g[y][x] = ch

    def put(self, x, y, ch):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = ch

    def rows(self):
        return [''.join(r) for r in self.g]


def ponte():
    W, H, D = 180, 34, 22
    g = Grid(W, H)
    # penhasco do início e rocha à esquerda
    g.fill(0, D, 22, H - 1, '#')
    g.fill(0, 13, 2, D - 1, '#')
    g.fill(3, 17, 4, D - 1, '#')
    g.fill(5, 20, 5, D - 1, '#')
    # tabuleiro da ponte em trechos
    for (x0, x1) in [(23, 51), (56, 83), (94, 107), (123, 171)]:
        g.fill(x0, D, x1, D + 1, '#')
    # pilares até o abismo
    for px in (31, 45, 63, 77, 97, 140, 156, 167):
        g.fill(px, D + 2, px + 2, H - 1, '#')
    # passarela baixa sob o desabamento
    g.fill(104, D + 5, 125, D + 6, '#')
    g.fill(104, D + 2, 106, D + 4, '#')
    g.fill(104, D + 7, 106, H - 1, '#')
    g.fill(123, D + 2, 125, D + 4, '#')
    g.fill(123, D + 7, 125, H - 1, '#')
    for x in range(110, 115):
        g.put(x, D + 4, '^')
    # plataforma sobre estacas para voltar ao tabuleiro
    for x in range(118, 123):
        g.put(x, D + 2, '-')
    # arco de guarita arruinado sobre o vão do meio: os pilares têm passagem por baixo
    g.fill(79, 9, 81, D - 6, '#')
    g.fill(96, 9, 98, D - 6, '#')
    g.fill(77, 6, 100, 8, '#')
    for x in range(77, 101, 2):
        g.put(x, 5, '#')
    for x in range(87, 91):
        g.put(x, D - 3, '-')
    # torre caída: só dá para passar agachado ou deslizando
    g.fill(134, D - 12, 143, D - 3, '#')
    for x in range(134, 144, 2):
        g.put(x, D - 13, '#')
    # muralha do castelo com o portão aberto
    g.fill(172, 0, W - 1, D - 8, '#')
    g.fill(172, D, W - 1, H - 1, '#')
    # objetos e criaturas (na linha acima do chão)
    r = D - 1
    g.put(8, r, 'G')
    g.put(15, r, 'P')
    for x in (26, 40, 60, 74, 101, 128, 150, 164):
        g.put(x, r, 'L')
    for x in (34, 68):
        g.put(x, r, 'l')
    for x in (37, 71, 147, 160):
        g.put(x, r, 'S')
    for x in (47, 78, 166):
        g.put(x, r, 'c')
    g.put(115, D + 4, 'c')
    # memória esquecida em cima da torre caída: só subindo pela parede
    g.put(139, D - 13, 'm')
    # guarda do dízimo depois da torre caída (a rasteira acabou de ser ensinada)
    g.put(155, r, 'g')
    # corvos sobre o tabuleiro e sobre o desabamento
    g.put(64, 13, 'v')
    g.put(113, 16, 'v')
    g.put(172, r, 'D')
    g.put(169, r, '2')
    # página do diário na passarela baixa do desabamento
    g.put(108, D + 4, 'p')
    return g.rows()


def catacumbas():
    W, H = 110, 48
    g = Grid(W, H, '#')
    # corredor de entrada (vem do portão)
    g.fill(0, 6, 34, 9, '.')
    # poço da esquerda, do teto ao fundo
    g.fill(24, 4, 51, 43, '.')
    # saliências de pedra presas às paredes, alternando os lados, e andaimes de madeira
    # pendurados por correntes no meio. Cada degrau fica 4 linhas abaixo do anterior:
    # dá para descer caindo da beirada e subir pulando (as tábuas deixam passar por baixo)
    g.fill(24, 10, 34, 11, '#')
    for (x0, x1, y) in [(41, 51, 18), (24, 34, 26), (41, 51, 34)]:
        g.fill(x0, y, x1, y + 1, '#')
    for y in (14, 22, 30, 38):
        for x in range(35, 41):
            g.put(x, y, '-')
    # degrau de pedra no fundo, para alcançar o último andaime na volta
    g.fill(24, 42, 34, 43, '#')
    # espinhos no fundo, entre o andaime e o túnel baixo no pé do pilar
    for x in range(44, 49):
        g.put(x, 43, '^')
    g.fill(52, 42, 57, 43, '.')
    # corredor da direita até a cripta
    g.fill(58, 30, 88, 43, '.')
    for x in range(66, 78):
        g.put(x, 43, '^')
    for (x0, x1) in [(63, 66), (70, 73), (77, 80)]:
        for x in range(x0, x1 + 1):
            g.put(x, 40, '-')
    # cripta do espelho
    g.fill(89, 33, 106, 43, '.')
    g.fill(107, 39, 107, 43, '.')
    g.fill(87, 30, 88, 38, '#')
    # passagem atrás do espelho para a Galeria dos Sinos (a grade só sobe depois da memória)
    g.fill(108, 39, 109, 43, '.')
    for y in range(39, 44):
        g.put(107, y, '|')
    # poço estreito no teto do corredor: só sobe pulando de parede em parede
    g.fill(60, 14, 62, 29, '.')
    g.fill(55, 11, 64, 13, '.')
    # criaturas e objetos
    g.put(2, 9, '1')
    g.put(46, 17, 'c')
    g.put(30, 25, 'c')
    g.put(46, 33, 'c')
    g.put(61, 43, 'c')
    g.put(84, 43, 'g')
    # corvos no poço
    g.put(38, 25, 'v')
    g.put(44, 39, 'v')
    g.put(26, 9, 'C'); g.put(50, 17, 'C'); g.put(25, 25, 'C'); g.put(27, 41, 'C'); g.put(90, 43, 'C')
    g.put(100, 43, 'M')
    g.put(96, 43, '2')
    g.put(104, 43, '3')
    g.put(12, 9, 'R')
    g.put(93, 43, 'R')
    g.put(58, 13, 'm')
    # página do diário no fundo do poço da esquerda
    g.put(30, 41, 'p')
    return g.rows()


def memoria():
    W, H = 140, 30
    g = Grid(W, H)
    # relevo de colinas suaves
    import math
    ground = []
    for x in range(W):
        y = 22 - round(1.6 * math.sin(x / 9.0) + 1.2 * math.sin(x / 23.0 + 1.3))
        ground.append(y)
    # trecho plano em volta do riacho, com uma ponte de madeira rente às margens
    for x in range(40, 55):
        ground[x] = 23
    for x in range(44, 51):
        ground[x] = 25
    for x in range(W):
        g.fill(x, ground[x], x, H - 1, '#')
    for x in range(44, 51):
        g.put(x, 23, '-')
        g.put(x, 24, '~')
    # outeiro de pedra
    g.fill(84, ground[84] - 3, 92, H - 1, '#')
    # bordas da memória
    g.fill(0, 8, 2, H - 1, '#')
    g.fill(W - 3, 8, W - 1, H - 1, '#')
    g.put(4, ground[4] - 1, '1')
    for x in (12, 30, 60, 99, 110):
        g.put(x, ground[x] - 1, 't')
    g.put(123, ground[123] - 1, 'T')
    g.put(128, ground[128] - 1, 'F')
    return g.rows()


def sinos():
    """Galeria dos Sinos: corredor embaixo (Cobrador, guarda, Garras de Ferro), o poço que só
    sobe pulando de parede e a galeria de cima (Pena do Eclipse e o abismo que pede pulo duplo)."""
    W, H = 96, 60
    g = Grid(W, H, '#')
    # corredor de baixo, com abóbada no meio
    g.fill(0, 50, 46, 57, '.')
    g.fill(10, 38, 36, 49, '.')
    # nicho alto: plataforma fina que só se alcança com pulo duplo
    for x in range(21, 28):
        g.put(x, 44, '-')
    for x in range(18, 25):
        g.put(x, 53, '-')
    # poço das garras: liso, com apoios a cada 8 linhas (longe demais para o pulo comum)
    g.fill(47, 5, 51, 57, '.')
    for i, y in enumerate((49, 41, 33, 25, 17)):
        g.put(47 if i % 2 == 0 else 51, y, '#')
    # galeria de cima: teto alto para o pulo duplo não bater a cabeça
    g.fill(52, 2, 95, 15, '.')
    # abismo com espinhos no fundo. A saída fica 7 blocos acima da borda (o pulo comum sobe 5,7)
    # e começa numa viga fina pendurada (sem parede para as garras): só o pulo duplo chega lá.
    g.fill(69, 16, 94, 21, '.')
    for x in range(69, 95):
        g.put(x, 21, '^')
    for x in range(79, 88):
        g.put(x, 9, '-')
    g.fill(88, 9, 95, 9, '#')
    g.fill(95, 10, 95, 21, '#')
    # saída para a cripta do sineiro, no alto à direita
    r1, r2 = 57, 15
    g.put(2, r1, '1')
    g.put(5, r1, 'R')
    g.put(13, r1, 'K')
    g.put(34, r1, 'g')
    g.put(39, r1, 'm')
    g.put(43, r1, 'J')
    g.put(24, 43, 'm')
    g.put(49, 30, 'v')
    g.put(55, r2, 'R')
    g.put(61, r2, 'g')
    g.put(66, r2, 'U')
    g.put(60, 5, 'v')
    g.put(93, 8, '2')
    for x in (8, 20, 30, 44):
        g.put(x, r1, 'C') if g.g[r1][x] == '.' else None
    g.put(58, r2, 'C')
    g.put(90, 8, 'C')
    # página do diário na galeria de cima, antes do abismo
    g.put(57, r2, 'p')
    return g.rows()


def cripta():
    """Cripta do Sineiro: arena plana, grade que fecha atrás do cavaleiro e o chefe."""
    W, H = 48, 24
    g = Grid(W, H, '#')
    g.fill(2, 3, 45, 19, '.')
    # entrada pela esquerda; a grade fica no vão da porta (some na pedra de cima ao abrir)
    g.fill(0, 15, 1, 19, '.')
    for y in range(15, 20):
        g.put(1, y, '|')
    # passagem atrás do Sineiro para a Escadaria dos Penitentes (a grade sobe quando ele cai)
    g.fill(46, 16, 47, 19, '.')
    for y in range(16, 20):
        g.put(46, y, 'Y')
    g.put(3, 19, '1')
    g.put(44, 19, '2')
    g.put(36, 19, 'X')
    for x in (9, 16, 31, 40):
        g.put(x, 19, 'C')
    return g.rows()


# ======================================================================================
# Cidade-Catedral (capítulo 2). Posições no mapa em tools: ver world/rooms.ts (MAP_POS).
# Alturas que ligam as salas: o chão da praça e da rua fica na mesma linha absoluta; a nave e
# o claustro também; a galeria e o altar também.
# ======================================================================================
def escadaria():
    """Escadaria dos Penitentes: o poço que sobe da cripta do Sineiro até a praça da cidade.
    Entra embaixo, à esquerda; sai no alto, à direita. Degraus de 3 linhas: dá para subir com
    o pulo comum, com os corvos atrapalhando."""
    W, H = 36, 37
    g = Grid(W, H, '#')
    g.fill(1, 2, 34, 35, '.')
    # passagem da cripta e saída para a praça
    g.fill(0, 32, 0, 35, '.')
    g.fill(35, 7, 35, 10, '.')
    # claraboia: lá em cima já é a cidade
    g.fill(13, 0, 21, 1, '.')
    # patamares de pedra presos às paredes, alternando os lados, com tábuas no meio
    for (x0, x1, y) in [(22, 34, 32), (1, 11, 27), (21, 34, 21), (1, 11, 15), (22, 35, 11)]:
        g.fill(x0, y, x1, y, '#')
    for (x0, x1, y) in [(15, 18, 30), (14, 17, 24), (15, 18, 18), (13, 17, 12)]:
        for x in range(x0, x1 + 1):
            g.put(x, y, '-')
    g.put(2, 35, '1')
    g.put(33, 10, '2')
    g.put(28, 20, 'c')
    g.put(26, 26, 'v')
    g.put(8, 9, 'v')
    g.put(4, 14, 'p')
    g.put(3, 26, 'C')
    g.put(9, 14, 'C')
    g.put(31, 31, 'C')
    g.put(30, 10, 'L')
    return g.rows()


def praca():
    """Praça do Cadafalso: o centro da cidade. A vela fica em cima do cadafalso, o ferreiro
    trabalha sob a arcada da esquerda e a freira cega espera na escadaria da catedral."""
    W, H = 120, 34
    g = Grid(W, H)
    g.fill(0, 29, W - 1, H - 1, '#')
    # muros nas pontas (as saídas ficam só na altura do chão)
    g.fill(0, 0, 1, 24, '#')
    g.fill(W - 2, 0, W - 1, 24, '#')
    # arcada do ferreiro: o telhado é uma passarela de madeira
    for x in range(3, 23):
        g.put(x, 21, '-')
    # cadafalso: o tablado fica 3 blocos acima do chão
    for x in range(52, 61):
        g.put(x, 26, '-')
    # escadaria da catedral, com a porta no alto
    g.fill(91, 28, 111, 28, '#')
    g.fill(94, 27, 108, 27, '#')
    g.fill(97, 26, 105, 26, '#')
    r = 28
    g.put(2, r, '1')
    g.put(W - 3, r, '2')
    g.put(101, 25, 'O')
    g.put(12, r, 'B')
    g.put(8, 20, 'p')
    g.put(32, r, 'E')
    g.put(78, r, 'E')
    g.put(56, r, 'H')
    g.put(56, 25, 'R')
    g.put(24, r, 'Z')
    g.put(88, r, 'Z')
    g.put(92, 27, 'N')
    for x in (28, 44, 72):
        g.put(x, r, 'L')
    g.put(40, 14, 'v')
    g.put(84, 10, 'v')
    return g.rows()


def rua():
    """Rua dos Penitentes: casas altas com sacadas (arqueiros nelas), penitentes do incensário
    na rua e uma casa desabada no fim. Só se passa por cima: as sacadas levam ao alto do
    entulho e de lá se pula para os telhados."""
    W, H = 150, 40
    g = Grid(W, H)
    g.fill(0, 35, W - 1, H - 1, '#')
    g.fill(0, 0, 1, 30, '#')
    # caixote para alcançar a primeira sacada
    g.fill(8, 33, 9, 34, '#')
    # sacadas (tábuas presas às fachadas)
    for (x0, x1, y) in [(11, 16, 29), (36, 41, 29), (44, 49, 23), (66, 71, 29), (75, 80, 23), (68, 73, 17),
                        (98, 103, 29), (106, 111, 23), (98, 103, 17), (106, 111, 11), (115, 118, 9)]:
        for x in range(x0, x1 + 1):
            g.put(x, y, '-')
    # a casa desabada fecha a rua; embaixo dela, o porão (parede falsa) com moedas e uma página
    g.fill(121, 7, W - 1, 34, '#')
    g.fill(123, 30, 129, 34, '.')
    g.fill(121, 30, 122, 34, '%')
    r = 34
    g.put(2, r, '1')
    g.put(135, 6, '3')
    g.put(127, r, '$')
    g.put(125, r, 'p')
    g.put(14, 28, 'a')
    g.put(78, 22, 'a')
    g.put(100, 16, 'a')
    g.put(28, r, 'i')
    g.put(90, r, 'i')
    g.put(58, r, 'g')
    g.put(60, 18, 'v')
    g.put(46, r, 'E')
    g.put(30, r, 'Z')
    g.put(110, r, 'Z')
    for x in (20, 54, 86, 116):
        g.put(x, r, 'L')
    return g.rows()


def telhados():
    """Telhados: de casa em casa até a parede da catedral. A torre do sino (o primeiro da
    freira) só se sobe pulando de parede; o vitral rachado no fim é a entrada da nave."""
    W, H = 150, 40
    g = Grid(W, H)
    # parede da catedral, com o vão do vitral
    g.fill(0, 0, 10, H - 1, '#')
    g.fill(0, 20, 10, 24, '.')
    for y in range(20, 25):
        g.put(5, y, 'V')
    # casas: telhado na linha dada, até o fundo; becos entre elas com chão no fundo
    houses = [(11, 30, 25), (34, 48, 21), (68, 84, 26), (89, 112, 30), (116, 124, 34)]
    for (x0, x1, top) in houses:
        g.fill(x0, top, x1, H - 1, '#')
    g.fill(11, H - 1, 124, H - 1, '#')
    # torre do sino: corpo maciço, câmara aberta em cima com arcos dos dois lados
    g.fill(52, 13, 64, H - 1, '#')
    g.fill(52, 6, 53, 12, '#')
    g.fill(63, 6, 64, 12, '#')
    g.fill(51, 4, 65, 6, '#')
    g.fill(52, 9, 53, 12, '.')
    g.fill(63, 9, 64, 12, '.')
    # sótão escondido debaixo de um alçapão no telhado (parede falsa no chão do telhado)
    g.fill(74, 27, 80, 30, '.')
    g.fill(76, 26, 77, 26, '%')
    # buraco para a rua lá embaixo (saída para baixo) e a parede da direita
    g.fill(147, 0, W - 1, H - 1, '#')
    g.put(120, 33, '1')
    g.put(2, 24, '2')
    g.put(58, 9, 'b')
    g.put(78, 30, 'p')
    g.put(75, 30, '$')
    g.put(40, 20, 'a')
    g.put(100, 29, 'a')
    g.put(72, 25, 'c')
    g.put(30, 14, 'v')
    g.put(70, 16, 'v')
    g.put(104, 20, 'v')
    return g.rows()


def nave():
    """Nave da catedral: bancos no chão, lustres pendurados no meio e as galerias dos lados.
    O sino da nave fica pendurado acima do lustre do cruzeiro. A porta da praça está trancada
    por dentro; a escada em caracol leva à Galeria dos Vitrais."""
    W, H = 120, 40
    g = Grid(W, H, '#')
    g.fill(2, 3, 117, 35, '.')
    # buraco na abóbada (quem cai da galeria entra por aqui)
    g.fill(40, 0, 46, 2, '.')
    # saídas: claustro à esquerda (no chão) e telhados à direita (na galeria de cima)
    g.fill(0, 32, 1, 35, '.')
    g.fill(118, 14, 119, 18, '.')
    # galerias laterais (trifório)
    g.fill(2, 19, 20, 19, '#')
    g.fill(98, 19, 117, 19, '#')
    # capela escondida debaixo da galeria da direita
    g.fill(110, 20, 117, 35, '#')
    g.fill(112, 31, 117, 35, '.')
    g.fill(110, 31, 111, 35, '%')
    # bancos
    for (x0, x1) in [(26, 31), (36, 41), (74, 79), (84, 89)]:
        g.fill(x0, 35, x1, 35, '#')
    # mísulas de pedra para subir às galerias e lustres no meio
    for (x0, x1, y) in [(86, 90, 31), (93, 97, 27), (86, 90, 23), (24, 28, 31), (17, 21, 27), (24, 28, 23)]:
        g.fill(x0, y, x1, y, '#')
    for (x0, x1, y) in [(84, 89, 17), (70, 75, 17), (56, 64, 14), (38, 48, 17), (28, 33, 17)]:
        for x in range(x0, x1 + 1):
            g.put(x, y, '-')
    r = 35
    g.put(116, 18, '1')
    g.put(3, r, '2')
    g.put(43, 3, '4')
    # portas: a da escada em caracol (galeria) e a principal (praça, trancada por dentro)
    g.put(14, r, 'O')
    g.put(101, r, 'O')
    g.put(60, 11, 'b')
    g.put(115, r, 'm')
    g.put(113, r, 'C')
    g.put(117, r, 'C')
    g.put(50, r, 'i')
    g.put(68, r, 'i')
    g.put(56, r, 'g')
    g.put(8, 18, 'a')
    g.put(102, 18, 'a')
    # página na galeria lateral da esquerda, atrás do arqueiro
    g.put(4, 18, 'p')
    return g.rows()


def claustro():
    """Claustro: jardim aberto no meio, arcadas em volta com passarela por cima. A vela fica
    junto da fonte; o sino do claustro, no campanário da direita. Atrás de uma parede da
    arcada há um depósito esquecido."""
    W, H = 90, 40
    g = Grid(W, H, '#')
    g.fill(9, 0, 87, 35, '.')
    g.fill(88, 32, 89, 35, '.')
    # depósito escondido na parede da esquerda
    g.fill(2, 31, 7, 35, '.')
    g.fill(8, 31, 8, 35, '%')
    # telhados das arcadas (passarela de cima)
    g.fill(9, 25, 22, 26, '#')
    g.fill(66, 25, 87, 26, '#')
    # escadas de madeira do jardim até as passarelas
    for (x0, x1, y) in [(23, 26, 31), (27, 30, 28), (62, 65, 31), (58, 61, 28)]:
        for x in range(x0, x1 + 1):
            g.put(x, y, '-')
    r = 35
    g.put(86, r, '1')
    g.put(45, r, 'f')
    g.put(51, r, 'R')
    g.put(80, 21, 'b')
    g.put(4, r, 'p')
    g.put(6, r, '$')
    g.put(14, r, 'E')
    g.put(36, r, 'g')
    g.put(56, r, 'c')
    g.put(16, 24, 'c')
    g.put(45, 12, 'v')
    g.put(70, 24, 'C')
    return g.rows()


def galeria():
    """Galeria dos Vitrais: passarela no alto da nave, ao longo dos vitrais. O chão está
    quebrado num trecho (quem cai volta para a nave); dois vitrais escondem nichos."""
    W, H = 120, 30
    g = Grid(W, H, '#')
    g.fill(2, 2, 117, 26, '.')
    g.fill(118, 23, 119, 26, '.')
    # chão quebrado: cai na nave
    g.fill(40, 27, 46, H - 1, '.')
    for x in range(66, 73):
        g.put(x, 26, '^')
    for (x0, x1, y) in [(20, 26, 20), (54, 60, 20), (92, 98, 20), (34, 40, 14), (76, 82, 14), (93, 99, 13), (15, 19, 15)]:
        for x in range(x0, x1 + 1):
            g.put(x, y, '-')
    # nicho atrás de um vitral, pendurado do teto à esquerda (página) e à direita (moedas)
    g.fill(6, 2, 14, 15, '#')
    g.fill(8, 11, 13, 14, '.')
    for y in range(11, 15):
        g.put(14, y, 'V')
    g.fill(100, 2, 107, 13, '#')
    g.fill(102, 9, 106, 12, '.')
    for y in range(9, 13):
        g.put(101, y, 'V')
    r = 26
    g.put(4, r, 'O')
    g.put(116, r, '2')
    g.put(108, r, 'R')
    g.put(10, 14, 'p')
    g.put(104, 12, '$')
    g.put(28, r, 'i')
    g.put(88, r, 'i')
    g.put(95, r, 'g')
    g.put(57, 19, 'a')
    g.put(79, 13, 'a')
    g.put(62, 8, 'v')
    return g.rows()


def altar():
    """Altar do Dízimo: arena do Arcebispo. A grade fecha atrás do cavaleiro; tablados de
    madeira para fugir da chuva de moedas."""
    W, H = 60, 30
    g = Grid(W, H, '#')
    g.fill(2, 3, 57, 28, '.')
    g.fill(0, 25, 1, 28, '.')
    for y in range(25, 29):
        g.put(1, y, '|')
    for (x0, x1, y) in [(14, 19, 22), (40, 45, 22), (27, 32, 16)]:
        for x in range(x0, x1 + 1):
            g.put(x, y, '-')
    r = 28
    g.put(3, r, '1')
    g.put(46, r, 'X')
    g.put(53, r, 'A')
    for x in (8, 22, 37, 50):
        g.put(x, r, 'C')
    return g.rows()


if __name__ == '__main__':
    out = sys.argv[1]
    maps = {'ponte': ponte(), 'catacumbas': catacumbas(), 'memoria': memoria(), 'sinos': sinos(), 'cripta': cripta(),
            'escadaria': escadaria(), 'praca': praca(), 'rua': rua(), 'telhados': telhados(), 'nave': nave(),
            'claustro': claustro(), 'galeria': galeria(), 'altar': altar()}
    lines = ['// Gerado por ferramentas/rooms.py: não edite à mão', '']
    for k, rows in maps.items():
        lines.append(f'export const MAP_{k.upper()} = [')
        for r in rows:
            lines.append(f"  '{r}',")
        lines.append('];')
        lines.append('')
    open(out, 'w').write('\n'.join(lines))
    for k, rows in maps.items():
        print(k, len(rows[0]), 'x', len(rows))
        if '-v' in sys.argv:
            print('\n'.join(rows))

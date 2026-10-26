"""Monta os mapas ASCII das salas do prólogo e gera src/world/maps.ts.

'#' pedra  '-' plataforma atravessável  '"' plataforma que o próprio cenário desenha  '^' espinhos
P início (acordar)  1-9 entradas  c penitente  g guarda de escudo  v corvo (paira nessa célula)
L poste aceso  l poste apagado  S estátua  G cadafalso  D portão  C velas  M espelho
T árvore grande  t árvore pequena  F figura de capa vermelha  ~ água
R vela de descanso (cura e salva)  K o Cobrador  m fragmento de memória
> Esporas do Carrasco (dash)  J Garras de Ferro (pulo na parede)  U Pena do Eclipse (pulo duplo)
| grade de ferro (sólida enquanto fechada)  X onde o chefe aparece
Cidade-Catedral:
% parede falsa (quebra com golpes)  V vitral quebrável  Y grade com chave (RoomDef.locks)
O porta (entra apertando para cima; RoomDef.doors na ordem do mapa)  $ baú de moedas
b sino da freira  p página do diário  N freira cega  B ferreiro  E esquecido (fala; RoomDef.npcs)
a arqueiro da sacada  i penitente do incensário  Z ponta do caminho da procissão
H cadafalso grande (a vela fica em cima)  f fonte do claustro  A altar do dízimo
Prisão Subterrânea: ver a seção dela, mais abaixo.
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
    # o ossuário: um nicho cavado na parede do poço, no fundo, onde dorme um carrasco antigo; as
    # Esporas do Carrasco (o dash) ficam no pedestal, entre as velas
    g.fill(13, 37, 23, 41, '.')
    g.put(17, 41, '>')
    g.put(14, 41, 'C')
    g.put(21, 41, 'C')
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


def nichos():
    """Galeria dos Nichos (v18, entre as catacumbas e os sinos): a galeria de cima, com as paredes
    cheias de nichos de enterro e o chão de lápides, que cede no meio e derruba o cavaleiro no ossuário
    de baixo; a beirada do fim da galeria desce para o salão alto (o poço das colunas de nichos sobre as
    estacas, com os ressaltos que sobem até um baú escondido), a casa do coveiro e o corredor que leva à
    Galeria dos Sinos. Tudo se passa com o pulo comum (as garras e o pulo duplo só vêm nos sinos)."""
    W, H = 128, 46
    g = Grid(W, H, '#')
    # a galeria de cima (chão na linha 31), com duas abóbadas
    g.fill(0, 24, 55, 30, '.')
    g.fill(13, 20, 23, 23, '.')
    g.fill(33, 19, 43, 23, '.')
    # o ossuário embaixo da galeria: a laje de lápides (x 40 a 45) cede quando ele pisa
    g.fill(30, 32, 55, 36, '.')
    for x in range(40, 46):
        g.put(x, 31, '=')
    # a beirada: o fim da galeria cai seis linhas até o chão de baixo; o bloco de pedra é o degrau da volta
    g.fill(56, 24, 66, 36, '.')
    g.fill(58, 34, 60, 36, '#')
    # o salão alto das colunas: o poço de estacas no meio
    g.fill(67, 10, 97, 36, '.')
    g.fill(68, 37, 96, 43, '.')
    for x in range(68, 97):
        g.put(x, 44, '^')
    # colunas de nichos saindo do fundo do poço (o topo é o degrau do pulo; quatro de largura e quatro de
    # vão, dá para acertar com o pulo comum)
    for x0 in (71, 78, 85, 92):
        g.fill(x0, 36, x0 + 3, 43, '#')
    # tábuas presas na parede da direita, alternando os lados, até o nicho escondido do baú, cavado na
    # parede acima da casa do coveiro (o último salto é de lado, da tábua de cima até a boca do nicho)
    for (x0, x1, y) in ((92, 96, 32), (86, 90, 28), (92, 96, 24), (86, 90, 20)):
        for x in range(x0, x1 + 1):
            g.put(x, y, '-')
    g.fill(97, 16, 102, 19, '.')
    # a casa do coveiro e o corredor da saída (chão na linha 37)
    g.fill(98, 28, 112, 36, '.')
    g.fill(113, 32, 127, 36, '.')
    # gente e objetos
    g.put(2, 30, '1')
    g.put(125, 36, '2')
    for x in (6, 27, 50):
        g.put(x, 30, 'C')
    g.put(18, 30, 'c')
    g.put(36, 30, 'c')
    g.put(38, 22, 'v')
    # as lápides raspadas, embaixo da abóbada da esquerda
    g.put(20, 30, 'r')
    g.put(48, 36, 'c')
    g.put(63, 36, 'C')
    g.put(77, 28, 'v')
    g.put(89, 23, 'v')
    g.put(101, 19, '$')
    g.put(98, 19, 'C')
    # a casa do coveiro: o livro dele na estante, velas
    for x in (100, 110):
        g.put(x, 36, 'C')
    g.put(105, 36, 'r')
    g.put(108, 36, 'c')
    g.put(119, 36, 'g')
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
    # atalho para o Poço dos Condenados: a grade só abre pela alavanca do outro lado
    for y in range(33, 36):
        g.put(35, y, 'Y')
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
    g.put(33, 35, '3')
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
    # o alçapão do cadafalso: abre depois do Arcebispo e leva ao Poço dos Condenados
    for x in range(54, 59):
        g.put(x, 29, '=')
    g.fill(54, 30, 58, H - 1, '.')
    # escadaria da catedral, com a porta no alto
    g.fill(91, 28, 111, 28, '#')
    g.fill(94, 27, 108, 27, '#')
    g.fill(97, 26, 105, 26, '#')
    r = 28
    g.put(2, r, '1')
    g.put(W - 3, r, '2')
    g.put(51, r, '3')
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


def mercado():
    """Mercado do Dízimo (v18, entre a praça e a rua): a rua do mercado onde se pagava o Dízimo.
    Bancas de pedra com toldo, a balança pública parada torta (o prato de baixo ainda com o saco do
    último Dízimo, o de cima alto) e, no fim, a Casa de Contagem: o pórtico por onde a rua continua,
    a torre que encosta na Rua dos Penitentes e a sala de contar no primeiro andar, que se alcança
    pelo prato alto da balança e pela sacada. Atrás da mesa de contar, uma parede falsa guarda o
    cofre. Mesma altura da praça (chão na linha 29), que a nave fica logo em cima."""
    W, H = 112, 34
    g = Grid(W, H)
    g.fill(0, 29, W - 1, H - 1, '#')
    # o arco da praça (a passagem fica só na altura do chão)
    g.fill(0, 0, 1, 24, '#')
    # bancas: balcão de pedra de dois de altura e o toldo por cima ('"' é piso de cenário: quem
    # desenha é o toldo, sem tábua nem poste)
    for (x0, x1) in ((10, 15), (26, 31), (42, 47)):
        g.fill(x0, 27, x1, 28, '#')
        for x in range(x0 - 1, x1 + 2):
            g.put(x, 23, '"')
    # sacadas das casas do fundo (o arqueiro fica na do meio)
    for (x0, x1, y) in ((19, 24, 17), (34, 39, 15), (51, 56, 18)):
        for x in range(x0, x1 + 1):
            g.put(x, y, '-')
    # a balança pública: os dois pratos (o de baixo com o saco, o de cima vazio)
    for x in range(63, 68):
        g.put(x, 25, '"')
    for x in range(72, 77):
        g.put(x, 20, '"')
    # a Casa de Contagem: o salão (telhado na linha 4) e a torre que sobe até o alto, encostada na rua
    g.fill(84, 4, 99, 24, '#')
    g.fill(100, 0, W - 1, 24, '#')
    # o pórtico embaixo: a rua passa por dentro do prédio
    g.fill(84, 25, W - 1, 28, '.')
    # a sala de contar no primeiro andar, a porta da sacada e a sacada
    g.fill(88, 10, 104, 17, '.')
    g.fill(84, 14, 87, 17, '.')
    for x in range(79, 84):
        g.put(x, 18, '-')
    # o cofre atrás da parede falsa
    g.fill(105, 14, 105, 17, '%')
    g.fill(106, 14, 109, 17, '.')
    r = 28
    g.put(2, r, '1')
    g.put(W - 3, r, '2')
    # o édito pregado no poste, logo depois do arco
    g.put(6, r, 'r')
    for x in (20, 37, 56, 80):
        g.put(x, r, 'L')
    g.put(22, r, 'i')
    g.put(52, r, 'i')
    g.put(36, 14, 'a')
    g.put(59, r, 'E')
    g.put(96, r, 'g')
    g.put(28, 5, 'v')
    g.put(66, 7, 'v')
    # a mesa de contar com a tabela do Dízimo, as velas e o cofre
    g.put(96, 17, 'r')
    for x in (90, 101):
        g.put(x, 17, 'C')
    g.put(108, 17, '$')
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
    """Altar do Dízimo: arena do Arcebispo. A grade fecha atrás do cavaleiro. O altar e a rosácea
    ficam no meio; os tablados de baixo seguram a chuva de moedas e fazem sombra para a luz do vitral
    quebrado, e os dois do alto ficam fora do alcance dela. Duas linhas de pedra embaixo do chão
    para a câmera não deixar a luta colada na borda da tela."""
    W, H = 60, 32
    g = Grid(W, H, '#')
    g.fill(2, 3, 57, 28, '.')
    g.fill(0, 25, 1, 28, '.')
    for y in range(25, 29):
        g.put(1, y, '|')
    for (x0, x1, y) in [(12, 18, 22), (41, 47, 22), (20, 24, 16), (35, 39, 16)]:
        for x in range(x0, x1 + 1):
            g.put(x, y, '-')
    r = 28
    g.put(3, r, '1')
    g.put(26, r, 'X')
    g.put(30, r, 'A')
    for x in (8, 22, 37, 51):
        g.put(x, r, 'C')
    return g.rows()



# ======================================================================================
# Prisão Subterrânea (capítulo 3). Fica embaixo da praça e da rua. O chão do poço, das celas,
# da sala das correntes e da guarita fica na mesma linha absoluta (32); a galeria da fuga corre
# embaixo deles. Caracteres novos:
# = alçapão (sólido enquanto fechado; RoomDef.trapdoors)  Q alavanca (golpe vira; marca lever:sala:i)
# o argola do gancho  + parede de ferro liso (as garras escorregam)  : grade de cela (nada passa)
# ! grade do alarme (cai na fuga)  k molho de chaves  w gancho de corrente (relíquia)
# W carcereiro  q carcereiro que só aparece com o alarme  I o preso da cela sete  * onda da arena
# ======================================================================================
def plank(g, x0, x1, y):
    for x in range(x0, x1 + 1):
        g.put(x, y, '-')


def poco():
    """Poço dos Condenados: embaixo do cadafalso. Quem cai pelo alçapão pousa na laje de cima.
    As tábuas descem para a esquerda, até o túnel da alavanca (atalho para a escadaria); do fundo,
    onde jogavam os condenados, se segue para as celas, à direita. Para voltar: as tábuas em
    zigue-zague sobem até a laje e as garras sobem pelo poço."""
    W, H = 60, 44
    g = Grid(W, H, '#')
    g.fill(54, 0, 58, 11, '.')
    g.fill(6, 12, 58, 40, '.')
    # laje de pouso, presa na parede da direita
    g.fill(40, 16, 58, 17, '#')
    g.fill(49, 18, 58, 18, '#')
    # túnel da alavanca e a laje da esquerda
    g.fill(0, 17, 5, 19, '.')
    g.fill(6, 20, 13, 21, '#')
    g.fill(6, 22, 9, 22, '#')
    for y in range(17, 20):
        g.put(2, y, 'Y')
    # descida até a laje da esquerda
    plank(g, 27, 32, 19)
    plank(g, 17, 21, 22)
    # zigue-zague de volta, do fundo até a laje
    for (x0, x1, y) in [(47, 51, 37), (38, 43, 33), (47, 51, 29), (38, 43, 25), (33, 38, 21)]:
        plank(g, x0, x1, y)
    # saída para as celas, no fundo
    g.fill(59, 37, 59, 40, '.')
    g.put(56, 2, '1')
    g.put(1, 19, '2')
    g.put(57, 40, '3')
    g.put(4, 19, 'Q')
    g.put(9, 19, 'p')
    g.put(24, 40, 'c')
    g.put(36, 40, 'c')
    g.put(11, 19, 'C')
    g.put(44, 15, 'C')
    return g.rows()


def solitarias():
    """As Solitárias (v18, entre o poço e as celas): o corredor de castigo e a chaminé das celas de
    silêncio. No começo do corredor fica a mesa do carcereiro, com o livro das sentenças. No meio, a
    chaminé sobe emparedada pelas três solitárias, uma em cada altura, até a claraboia gradeada que
    dá na praça; as passarelas de ferro levam de uma grade à outra. A de baixo está arrombada; as
    outras duas têm a grade inteira, e a do alto, onde o último preso riscou a parede, só se abre
    para quem atravessa o Véu."""
    W, H = 96, 44
    g = Grid(W, H, '#')
    # o corredor: a boca do poço tem quatro linhas (37-40), a das celas tem oito (33-40)
    g.fill(0, 36, W - 1, 40, '.')
    g.put(0, 36, '#')
    g.fill(86, 33, W - 1, 40, '.')
    # a chaminé das solitárias e a claraboia lá em cima (a grade deixa passar a luz, não o corpo)
    g.fill(32, 10, 41, 35, '.')
    g.fill(34, 5, 39, 9, '.')
    for x in range(34, 40):
        g.put(x, 4, ':')
    # passarelas de ferro, cada uma na altura do chão de uma solitária
    plank(g, 32, 37, 34)
    plank(g, 36, 41, 28)
    plank(g, 32, 37, 22)
    plank(g, 34, 39, 16)
    # a solitária de baixo: a grade foi arrancada do batente para baixo, dá para entrar andando
    g.fill(25, 30, 30, 33, '.')
    g.put(31, 30, ':')
    g.fill(31, 31, 31, 33, '.')
    # a do meio, do outro lado da chaminé, com a grade inteira
    g.fill(43, 24, 48, 27, '.')
    g.fill(42, 24, 42, 27, ':')
    # a do alto: a cela do último preso
    g.fill(25, 18, 30, 21, '.')
    g.fill(31, 18, 31, 21, ':')
    r = 40
    g.put(2, r, '1')
    g.put(93, r, '2')
    # a mesa do carcereiro, logo na entrada, com o livro das sentenças
    g.put(10, r, 'r')
    for x in (6, 52, 80):
        g.put(x, r, 'C')
    g.put(20, r, 'W')
    g.put(64, r, 'W')
    g.put(44, r, 'c')
    # o que ficou nas celas: a página na arrombada, as moedas na do meio, o registro na de cima
    g.put(27, 33, 'p')
    g.put(46, 27, '$')
    g.put(27, 21, 'r')
    g.put(29, 21, '$')
    return g.rows()


def celas():
    """Corredor das Celas: o corredor de baixo vai do poço à sala das correntes, passando pela cela
    do preso (ao fundo), pela vela e pela porta da arena. No chão, o alçapão que só abre por baixo
    (a alavanca fica na galeria da fuga). A galeria dos carcereiros, em cima, sobe pelo vão do meio
    e desce perto do fim; acaba numa cela com grade. Da galeria, as argolas da abóbada levam ao
    nicho alto (as paredes de ferro não seguram as garras). Uma parede falsa esconde outra cela."""
    W, H = 150, 44
    g = Grid(W, H, '#')
    # corredor de baixo
    g.fill(0, 33, W - 1, 40, '.')
    # trecho de teto baixo: só passa agachado ou deslizando
    g.fill(104, 33, 111, 38, '#')
    # alçapão no chão e o vão embaixo dele (vai para a galeria da fuga)
    for x in range(93, 98):
        g.put(x, 41, '=')
    g.fill(93, 42, 97, 43, '.')
    # galeria de cima
    g.fill(8, 19, 135, 27, '.')
    # vão do meio para subir, com tábuas dentro e embaixo
    g.fill(62, 28, 66, 32, '.')
    plank(g, 58, 62, 37)
    plank(g, 64, 68, 33)
    # vão perto do fim para descer
    g.fill(118, 28, 122, 32, '.')
    plank(g, 112, 116, 36)
    # cela com grade no fim da galeria (o que tem dentro fica à vista)
    g.fill(137, 21, 144, 27, '.')
    for y in range(21, 28):
        g.put(136, y, ':')
    # cela escondida atrás da parede falsa, na ponta esquerda da galeria
    g.fill(2, 23, 5, 27, '.')
    g.fill(6, 23, 7, 27, '%')
    # abóbada alta com paredes de ferro e o nicho no alto, à direita
    g.fill(92, 6, 112, 18, '.')
    for y in range(6, 19):
        g.put(91, y, '+')
        g.put(113, y, '+')
    g.fill(106, 9, 112, 10, '#')
    r = 40
    g.put(2, r, '1')
    g.put(147, r, '2')
    g.put(91, r, '3')
    g.put(30, r, 'I')
    g.put(40, r, 'R')
    g.put(52, r, 'O')
    g.put(20, r, 'c')
    g.put(78, r, 'W')
    g.put(126, r, 'W')
    g.put(84, 27, 'W')
    g.put(3, 27, '$')
    g.put(141, 27, '$')
    g.put(12, 27, 'p')
    g.put(110, 8, 'm')
    g.put(99, 17, 'o')
    g.put(103, 11, 'o')
    for x in (10, 26, 46, 72, 88, 118, 138):
        g.put(x, r, 'C')
    return g.rows()


def correntes():
    """Sala das Correntes: correntes enormes descem do teto escuro. O gancho de corrente fica no
    pedestal do meio. A saída é a laje alta da direita: a parede de ferro embaixo dela não segura as
    garras, então só se chega lá de argola em argola."""
    W, H = 60, 44
    g = Grid(W, H, '#')
    g.fill(1, 3, 58, 40, '.')
    g.fill(0, 37, 0, 40, '.')
    # laje da saída e a parede de ferro embaixo dela
    g.fill(45, 8, 58, 9, '#')
    g.fill(59, 4, 59, 7, '.')
    for y in range(10, 41):
        g.put(59, y, '+')
    # pedestal do gancho e uma tábua do lado
    g.fill(18, 39, 22, 40, '#')
    plank(g, 6, 11, 36)
    r = 40
    g.put(2, r, '1')
    g.put(56, 7, '2')
    g.put(20, 38, 'w')
    g.put(30, 32, 'o')
    g.put(37, 25, 'o')
    g.put(44, 18, 'o')
    g.put(41, 12, 'o')
    g.put(8, 35, 'p')
    g.put(34, r, 'c')
    g.put(50, r, 'c')
    for x in (4, 14, 26, 46):
        g.put(x, r, 'C')
    return g.rows()


def guarita():
    """Guarita dos Carcereiros: a torre onde eles dormem e guardam as chaves. Entra pelo alto, à
    esquerda (a vela fica logo ali), e desce andar por andar. O molho de chaves fica pendurado no
    fundo, em cima de um alçapão: pegar as chaves toca o alarme e o chão some."""
    W, H = 60, 44
    g = Grid(W, H, '#')
    # patamar de entrada
    g.fill(0, 4, 18, 7, '.')
    # a torre
    g.fill(12, 8, 52, 40, '.')
    g.fill(13, 2, 51, 7, '.')
    # andares de madeira e pedra, alternando os vãos
    g.fill(12, 8, 30, 8, '#')
    plank(g, 31, 36, 8)
    g.fill(24, 16, 52, 16, '#')
    plank(g, 18, 23, 16)
    g.fill(12, 24, 40, 24, '#')
    plank(g, 41, 46, 24)
    g.fill(22, 32, 52, 32, '#')
    plank(g, 16, 21, 32)
    # alçapão das chaves
    for x in range(44, 49):
        g.put(x, 41, '=')
    g.fill(44, 42, 48, 43, '.')
    g.put(2, 7, '1')
    g.put(41, 40, '2')
    g.put(6, 7, 'R')
    g.put(46, 39, 'k')
    g.put(40, 15, 'W')
    g.put(20, 23, 'W')
    g.put(36, 31, 'W')
    g.put(28, 40, 'c')
    g.put(14, 31, 'p')
    for x in (16, 34, 48):
        g.put(x, 15, 'C')
    return g.rows()


def fuga():
    """Galeria da Fuga: corre embaixo das celas. Quem cai da guarita chega na ponta da direita com
    o alarme tocando: as grades descem uma a uma pelo caminho e os carcereiros acordam. Na ponta
    da esquerda, a alavanca abre o alçapão das celas (o poço sobe até lá) e a porta das máscaras
    só abre para quem soltou o preso."""
    W, H = 180, 26
    g = Grid(W, H, '#')
    g.fill(3, 12, 176, 21, '.')
    # poço da guarita (direita) e poço das celas (esquerda, com o alçapão em cima)
    g.fill(164, 0, 168, 11, '.')
    g.fill(3, 0, 7, 11, '.')
    for x in range(3, 8):
        g.put(x, 0, '=')
    # obstáculos: tetos baixos, espinhos e degraus
    g.fill(138, 12, 144, 18, '#')
    for x in range(118, 124):
        g.put(x, 21, '^')
    g.fill(116, 20, 117, 21, '#')
    g.fill(124, 20, 125, 21, '#')
    g.fill(96, 12, 101, 18, '#')
    g.fill(72, 18, 79, 21, '#')
    for x in range(54, 60):
        g.put(x, 21, '^')
    g.fill(52, 20, 53, 21, '#')
    g.fill(60, 20, 61, 21, '#')
    g.fill(30, 12, 35, 18, '#')
    # grades do alarme (descem até o chão; as do teto baixo deixam o vão de deslizar)
    for gx in (152, 132, 108, 86, 66, 42):
        for y in range(12, 22):
            if g.g[y][gx] == '.':
                g.put(gx, y, '!')
    r = 21
    g.put(166, 2, '1')
    g.put(5, 2, '2')
    g.put(10, r, 'Q')
    g.put(22, r, 'O')
    # Tomé espera aqui depois de sair da cela
    g.put(27, r, 'I')
    g.put(160, r, 'C')
    g.put(14, r, 'C')
    for x in (146, 112, 90, 62, 38):
        g.put(x, r, 'q')
    return g.rows()


def arena():
    """Arena dos Condenados: a porta tranca atrás do cavaleiro e vêm três ondas. Tablados nos dois
    lados e um no meio, mais alto."""
    W, H = 60, 26
    g = Grid(W, H, '#')
    g.fill(2, 3, 57, 22, '.')
    for y in range(19, 23):
        g.put(8, y, '|')
    plank(g, 12, 19, 18)
    plank(g, 40, 47, 18)
    plank(g, 25, 34, 13)
    r = 22
    g.put(4, r, 'O')
    for (x, y) in [(14, r), (46, r), (16, 17), (44, 17), (30, 12), (54, r)]:
        g.put(x, y, '*')
    for x in (10, 22, 38, 50):
        g.put(x, r, 'C')
    return g.rows()


def mascara():
    """Sala da Máscara: a forja onde se faziam as máscaras dos condenados. A Carcereira espera
    junto da bigorna; a grade fecha atrás do cavaleiro. Gaiolas presas no teto e duas celas no
    fundo (abrem na segunda fase)."""
    W, H = 70, 32
    g = Grid(W, H, '#')
    g.fill(2, 3, 67, 27, '.')
    for y in range(24, 28):
        g.put(7, y, '|')
    plank(g, 16, 22, 21)
    plank(g, 47, 53, 21)
    r = 27
    g.put(4, r, 'O')
    g.put(50, r, 'X')
    g.put(52, r, 'n')
    g.put(20, r, '*')
    g.put(60, r, '*')
    for x in (12, 28, 42, 58):
        g.put(x, r, 'C')
    # o chão ao pé da bigorna cede depois da Carcereira e leva ao Fosso dos Esquecidos
    for x in range(54, 58):
        g.put(x, 28, '=')
    g.fill(54, 29, 57, 31, '.')
    # quem volta do Fosso sobe pelo buraco e pisa ao lado dele
    g.put(59, r, '2')
    return g.rows()


def fosso():
    """Fosso dos Esquecidos: embaixo da Sala da Máscara, onde a prisão jogava o que arrancava dos
    condenados. Cai-se pelo buraco ao pé da bigorna num poço estreito até a laje das máscaras
    quebradas; tábuas e prateleiras descem em zigue-zague até o fundo, onde a vela de descanso
    espera antes do Leito do Abismo (à direita). Na prateleira da esquerda, uma membrana abissal
    tapa uma câmara na parede (só o Véu passa). Para voltar, cada degrau fica a cinco tiles do
    outro; da laje, a argola embaixo do poço puxa até ele, e as garras sobem por dentro."""
    W, H = 56, 84
    g = Grid(W, H, '#')
    g.fill(34, 0, 37, 13, '.')
    g.fill(9, 14, 52, 77, '.')
    # laje de pouso, presa na parede da direita
    g.fill(26, 28, 52, 31, '#')
    # descida para a esquerda
    plank(g, 17, 22, 33)
    plank(g, 10, 15, 38)
    # prateleira da esquerda e a câmara da membrana na parede
    g.fill(9, 43, 20, 46, '#')
    g.fill(3, 39, 7, 42, '.')
    for y in range(39, 43):
        g.put(8, y, '&')
    # para a direita e de volta, até o fundo
    plank(g, 25, 30, 48)
    plank(g, 35, 40, 53)
    g.fill(41, 58, 52, 61, '#')
    plank(g, 29, 34, 63)
    plank(g, 17, 22, 68)
    plank(g, 25, 30, 73)
    # saída para o Leito do Abismo, no fundo à direita
    g.fill(53, 73, 55, 77, '.')
    g.put(35, 2, '1')
    g.put(54, 77, '2')
    g.put(46, 77, 'R')
    # três argolas para sair por cima: uma presa no teto da câmara, ao lado da boca do poço, e duas
    # penduradas da viga lá no alto do poço (o gancho vai de uma para a outra até a Sala da Máscara)
    g.put(33, 19, 'o')
    g.put(37, 10, 'o')
    g.put(34, 2, 'o')
    g.put(4, 42, '$')
    g.put(6, 40, 'm')
    g.put(40, 27, 'c')
    g.put(14, 42, 'c')
    g.put(34, 77, 'c')
    g.put(22, 24, 'v')
    g.put(46, 50, 'v')
    return g.rows()


def margem():
    """A Margem da Tinta: a calha por onde a prisao escorria a tinta das sentencas, do Fosso ate o
    Leito do Abismo. Da margem da esquerda a tinta vai ficando funda: um degrau raso de vadear, a
    calha funda no meio e os pilares quebrados da comporta para passar por cima. No alto, a sacada
    dos copistas (tabuas pela parede) e as correntes da comporta, por onde o gancho atravessa ate a
    sacada da direita; atras da membrana, o nicho onde um copista guardou o que nao devia."""
    W, H = 104, 40
    g = Grid(W, H, '#')
    # as duas bocas, na mesma altura das do Fosso e do Leito do Abismo
    g.fill(0, 28, 2, 32, '.')
    g.fill(101, 28, 103, 32, '.')
    # as margens e o vao alto da comporta, no meio
    g.fill(3, 18, 21, 32, '.')
    g.fill(22, 5, 82, 32, '.')
    g.fill(83, 18, 100, 32, '.')
    # a calha: degrau raso dos dois lados (chao 35) e a calha funda no meio (chao 39)
    g.fill(28, 33, 43, 34, '~')
    g.fill(44, 33, 70, 38, '~')
    g.fill(71, 33, 84, 34, '~')
    # o fundo da calha desce em rampa, do degrau da esquerda para o fundo
    g.fill(44, 36, 44, 39, '#')
    g.fill(45, 37, 45, 39, '#')
    g.fill(46, 38, 46, 39, '#')
    # os pilares quebrados da comporta, fincados no fundo da calha
    for x0, top in ((48, 32), (54, 29), (60, 31), (67, 33)):
        g.fill(x0, top, x0 + 1, 38, '#')
    # a sacada dos copistas, presa na parede da esquerda, e as tabuas que sobem ate ela
    g.fill(22, 17, 32, 18, '#')
    plank(g, 26, 31, 29)
    plank(g, 33, 38, 25)
    plank(g, 35, 40, 21)
    # a sacada da direita, presa na parede do fundo: so o gancho chega
    g.fill(72, 14, 82, 15, '#')
    # o nicho do copista atras da membrana abissal (so o Veu passa)
    g.fill(84, 10, 88, 13, '.')
    for y in range(10, 14):
        g.put(83, y, '&')
    # as correntes da comporta, penduradas da abobada
    g.put(40, 13, 'o')
    g.put(52, 10, 'o')
    g.put(64, 13, 'o')
    g.put(74, 10, 'o')
    g.put(1, 32, '1')
    g.put(102, 32, '2')
    g.put(95, 32, 'R')
    # o caderno do copista na margem e a ordem em branco na sacada
    g.put(8, 32, 'r')
    g.put(29, 16, 'r')
    g.put(24, 16, '$')
    g.put(87, 13, '$')
    g.put(86, 13, 'm')
    g.put(18, 32, 'c')
    g.put(36, 34, 'c')
    g.put(90, 32, 'c')
    g.put(44, 22, 'v')
    g.put(66, 20, 'v')
    return g.rows()


MINES = False


def abismo():
    """Leito do Abismo: o fundo do Fosso, um lago raso de tinta. A Sombra do Carrasco espera
    afundada no meio; a grade fecha atrás do cavaleiro. Tábuas dos dois lados e uma no alto. Na
    parede do fundo, uma membrana abissal tapa um nicho: o primeiro lugar onde o Véu passa."""
    W, H = 70, 32
    g = Grid(W, H, '#')
    g.fill(2, 3, 61, 27, '.')
    g.fill(0, 23, 1, 27, '.')
    for y in range(23, 28):
        g.put(7, y, '|')
    plank(g, 15, 21, 21)
    plank(g, 42, 48, 21)
    plank(g, 27, 36, 15)
    # o nicho atrás da membrana: o túnel dos mineiros, que leva à Boca da Mina (capítulo 4); sem
    # as Minas no jogo ainda, o túnel acaba na rocha
    g.fill(63, 24, 69 if MINES else 67, 27, '.')
    for y in range(24, 28):
        g.put(62, y, '&')
    g.put(65, 27, '$')
    g.put(1, 27, '1')
    g.put(44, 27, 'X')
    if MINES:
        g.put(68, 27, '2')
    return g.rows()


# ======================================================================================
# Minas Abandonadas (capítulo 4). Atrás da membrana do Leito do Abismo. Onde a Casa Vhalor tirava
# o Âmbar Mnêmico. Caracteres novos:
# x cristal de âmbar aceso (enfeite e luz)  u mineiro esquecido  z morcego de âmbar
# r registro (documento da lore)  j vagonete  h prensa grande  @ bloco de âmbar (só a Picareta quebra)
# y moldura de madeira dos túneis (escora)
# ======================================================================================
def snap_crystals(g):
    """Todo cristal nasce da rocha: cada 'x' vai para a célula vazia mais perto que encosta na pedra
    (chão, teto ou parede); o jogo vira o cristal para o lado da pedra."""
    def touches(x, y):
        return any(0 <= x + dx < g.w and 0 <= y + dy < g.h and g.g[y + dy][x + dx] == '#'
                   for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)))
    def solid(x, y):
        return not (0 <= x < g.w and 0 <= y < g.h) or g.g[y][x] == '#'
    pts = [(x, y) for y in range(g.h) for x in range(g.w) if g.g[y][x] == 'x']
    for x, y in pts:
        # caiu dentro da pedra (pedra dos dois lados): a pedra volta e o cristal vai para a borda
        inside = (solid(x - 1, y) and solid(x + 1, y)) or (solid(x, y - 1) and solid(x, y + 1))
        g.g[y][x] = '#' if inside else '.'
        best = None
        for r in range(0, 6):
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    if max(abs(dx), abs(dy)) != r:
                        continue
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < g.w and 0 <= ny < g.h and g.g[ny][nx] == '.' and touches(nx, ny):
                        d = abs(dx) + abs(dy) * 0.9
                        if best is None or d < best[0]:
                            best = (d, nx, ny)
            if best:
                break
        if best:
            g.g[best[2]][best[1]] = 'x'
    return g


def boca():
    """Boca da Mina: o túnel baixo que vem do abismo sobe para a caverna da entrada. A vela fica
    logo no começo. Os trilhos seguem para a Galeria dos Trilhos, à direita."""
    W, H = 100, 36
    g = Grid(W, H, '#')
    g.fill(0, 23, 33, 29, '.')
    g.fill(30, 7, 96, 29, '.')
    g.fill(97, 22, 99, 29, '.')
    # rocha do meio, tábua para subir e a prateleira alta do cofre
    g.fill(46, 19, 56, 20, '#')
    plank(g, 38, 43, 24)
    plank(g, 59, 64, 15)
    # pontas de pedra no teto
    for x in range(34, 96, 6):
        g.fill(x, 7, x, 8 + (x % 3), '#')
    r = 29
    g.put(2, r, '1')
    g.put(98, r, '2')
    g.put(8, r, 'R')
    g.put(61, 14, '$')
    g.put(51, 18, 'r')
    g.put(50, r, 'u')
    g.put(88, r, 'u')
    g.put(62, 11, 'z')
    for x in (18, 36, 66, 92):
        g.put(x, r, 'y')
    for (x, y) in ((31, 22), (45, 18), (57, 21), (70, 9), (95, 12)):
        g.put(x, y, 'x')
    snap_crystals(g)
    return g.rows()


def trilhos():
    """Galeria dos Trilhos: um túnel comprido com trilhos e três falhas fundas com espinhos. O
    vagonete espera no começo; com um golpe ele anda e pula as falhas pelas rampas, e o teto
    desaba atrás dele. A pé também se passa (pulo duplo e dash), mais devagar. Vigas baixas: no
    vagonete, agachado."""
    W, H = 150, 30
    g = Grid(W, H, '#')
    g.fill(0, 8, W - 1, 23, '.')
    # as falhas, com espinhos no fundo
    for (x0, x1) in ((38, 47), (76, 86), (112, 121)):
        g.fill(x0, 24, x1, 28, '.')
        for x in range(x0, x1 + 1):
            g.put(x, 28, '^')
    # vigas baixas (sobra pouco espaço em cima do vagonete)
    for x in (60, 98, 132):
        g.fill(x, 8, x + 1, 20, '#')
    # pontas no teto e trechos mais baixos
    g.fill(0, 8, 30, 13, '#')
    g.fill(138, 8, W - 1, 13, '#')
    r = 23
    g.put(2, r, '1')
    g.put(147, r, '2')
    g.put(8, r, 'j')
    g.put(26, r, 'u')
    g.put(70, r, 'u')
    g.put(104, r, 'u')
    g.put(90, 15, 'z')
    for x in (20, 54, 92, 128):
        g.put(x, r, 'y')
    for (x, y) in ((34, 14), (68, 9), (108, 10), (126, 15)):
        g.put(x, y, 'x')
    snap_crystals(g)
    return g.rows()


def prensas():
    """Casa das Prensas: o salão onde a Casa Vhalor espremia a memória das pessoas direto no
    Âmbar. Entra-se pelo alto, à esquerda, vindo dos trilhos. Três prensas enormes no chão; a ordem
    da Casa pregada na parede (registro). Um buraco no chão, à direita, desce para o Veio de Âmbar."""
    W, H = 90, 44
    g = Grid(W, H, '#')
    g.fill(0, 16, 26, 23, '.')
    g.fill(10, 6, 85, 39, '.')
    g.fill(10, 24, 26, 26, '#')
    # plataformas entre as prensas
    plank(g, 30, 35, 33)
    plank(g, 44, 50, 28)
    plank(g, 58, 63, 33)
    g.fill(70, 29, 85, 30, '#')
    # buraco para o veio
    g.fill(74, 40, 79, 43, '.')
    # o nicho do cinto de ferramentas, no pé da parede embaixo da entrada, tapado pelo Âmbar que pingou
    # das prensas (só a Picareta abre)
    g.fill(6, 37, 7, 39, '.')
    for y in range(37, 40):
        g.put(8, y, '@')
        g.put(9, y, '@')
    r = 39
    g.put(2, 23, '1')
    g.put(82, r, '2')
    g.put(12, 23, 'R')
    g.put(38, r, 'h')
    g.put(54, r, 'h')
    g.put(68, r, 'h')
    g.put(47, 27, 'r')
    g.put(80, 28, '$')
    g.put(30, r, 'u')
    g.put(62, r, 'u')
    g.put(50, 14, 'z')
    for (x, y) in ((22, 30), (42, 10), (66, 12), (84, 22)):
        g.put(x, y, 'x')
    snap_crystals(g)
    return g.rows()


def veio():
    """Veio de Âmbar: o poço fundo onde o Âmbar nasce na pedra, embaixo da Casa das Prensas (o
    buraco do teto é o do chão das prensas). Desce-se em zigue-zague entre
    cristais acesos; no meio, à esquerda, o alojamento dos mineiros (vela, o mineiro que ficou e o
    livro do Capataz). No fundo, à direita, a Câmara de Âmbar. Para subir: paredes, argolas e o
    pulo duplo."""
    W, H = 64, 84
    g = Grid(W, H, '#')
    g.fill(8, 0, 13, 9, '.')
    g.fill(6, 10, 58, 77, '.')
    # degraus e prateleiras
    g.fill(6, 18, 22, 19, '#')
    g.fill(40, 18, 58, 19, '#')
    plank(g, 26, 34, 24)
    g.fill(30, 30, 46, 31, '#')
    plank(g, 14, 20, 36)
    # o nicho do bornal, logo embaixo da entrada: o Âmbar escorreu por cima e tapou (só a Picareta abre)
    g.fill(1, 15, 3, 17, '.')
    for y in range(15, 18):
        g.put(4, y, '@')
        g.put(5, y, '@')
    # o alojamento, cavado na parede da esquerda
    g.fill(0, 40, 5, 47, '.')
    g.fill(6, 48, 24, 49, '#')
    plank(g, 32, 38, 54)
    g.fill(42, 60, 58, 61, '#')
    plank(g, 24, 30, 66)
    plank(g, 12, 18, 71)
    # saída para a Câmara de Âmbar, no fundo à direita
    g.fill(59, 72, 63, 77, '.')
    g.put(10, 3, '1')
    g.put(62, 77, '3')
    g.put(2, 47, 'R')
    g.put(9, 47, 'E')
    g.put(4, 47, 'r')
    g.put(52, 59, 'r')
    g.put(33, 29, '$')
    g.put(20, 77, 'u')
    g.put(48, 77, 'u')
    g.put(36, 47, 'u')
    g.put(30, 14, 'z')
    g.put(44, 40, 'z')
    g.put(24, 62, 'z')
    for (x, y) in ((28, 22), (36, 30), (20, 43), (55, 45), (40, 57), (10, 66), (36, 74)):
        g.put(x, y, 'o' if (x, y) in ((28, 22), (20, 43), (40, 57)) else 'x')
    for (x, y) in ((7, 14), (57, 12), (58, 34), (7, 56), (58, 66), (30, 76)):
        g.put(x, y, 'x')
    snap_crystals(g)
    return g.rows()


def espelhos():
    """Câmara de Âmbar: paredes de âmbar polido que devolvem a imagem de quem passa. O Reflexo
    espera no meio; a grade fecha atrás do cavaleiro. Duas tábuas no alto."""
    W, H = 64, 30
    g = Grid(W, H, '#')
    g.fill(2, 4, 61, 25, '.')
    g.fill(0, 20, 1, 25, '.')
    g.fill(62, 20, 63, 25, '.')
    for y in range(20, 26):
        g.put(6, y, '|')
        g.put(57, y, '|')
    plank(g, 16, 22, 19)
    plank(g, 41, 47, 19)
    plank(g, 28, 35, 13)
    r = 25
    g.put(1, r, '1')
    g.put(62, r, '2')
    g.put(32, r, 'X')
    for (x, y) in ((3, 8), (60, 8), (20, 6), (43, 6), (32, 4)):
        g.put(x, y, 'x')
    snap_crystals(g)
    return g.rows()


def capataz():
    """Galeria do Capataz: o fim da mina, onde o Capataz tocava as prensas. Ele espera junto da
    última prensa; a grade fecha atrás do cavaleiro. Tábuas dos dois lados, cristais no teto. Na
    parede da direita, um bloco de âmbar tapa o túnel que segue (só a Picareta abre)."""
    W, H = 72, 34
    g = Grid(W, H, '#')
    g.fill(2, 4, 63, 29, '.')
    g.fill(0, 24, 1, 29, '.')
    for y in range(24, 30):
        g.put(7, y, '|')
    plank(g, 15, 21, 23)
    plank(g, 44, 50, 23)
    # o túnel tapado pelo âmbar: segue para leste e sobe até a encosta da serra (o vento frio passa
    # pelas frestas)
    g.fill(64, 24, 71, 29, '.')
    for y in range(24, 30):
        g.put(64, y, '@')
        g.put(65, y, '@')
    r = 29
    g.put(1, r, '1')
    g.put(46, r, 'X')
    g.put(50, r, 'x')
    g.put(68, r, 'r')
    g.put(70, r, '2')
    for (x, y) in ((10, 6), (24, 5), (40, 5), (58, 7), (33, 4)):
        g.put(x, y, 'x')
    snap_crystals(g)
    return g.rows()



# ======================================================================================
# Floresta Nevada (capítulo 5). Atrás do bloco de Âmbar da Galeria do Capataz: o túnel sobe e sai
# na encosta da serra. A floresta é a da abertura do jogo. Ver lore/floresta.md. Caracteres novos:
# _ gelo (chão que escorrega)  ; gelo fino (racha com peso e quebra; embaixo, água gelada)
# ~ água gelada (machuca e devolve ao último chão firme)  d lobo da caça  e coruja de geada
# { a Capa de Arielle (relíquia: plana)  T pinheiro grande  s pinheiro seco  t pinheiro novo (enfeite)
# Na neve, '-' é galho (sai sempre de um tronco T ou s, ou é tábua da espera de caça, com postes) e
# '+' é parede de gelo (as garras escorregam). Nenhum galho fica solto: check_forest confere.
# ======================================================================================
def ground(g, x0, x1, top, bottom=None):
    """Chão de neve: pedra do topo até o fundo da sala."""
    g.fill(x0, top, x1, (g.h - 1) if bottom is None else bottom, '#')


def pine(g, x, top, branches=(), kind='T'):
    """Pinheiro (T) ou pinheiro seco (s) de pé no chão cuja superfície é a linha top. Cada galho que
    segura o peso dele é (lado, comprimento, linha): sai do tronco para a esquerda (-1) ou para a
    direita (1). Os galhos de enfeite (finos, sem neve em cima) são da pintura, não do mapa."""
    g.put(x, top - 1, kind)
    for side, n, y in branches:
        for bx in (range(x + 1, x + 1 + n) if side > 0 else range(x - n, x)):
            g.put(bx, y, '-')


def check_forest(name, rows, stands=()):
    """Cada galho tem tronco: o trecho de '-' encosta num T ou s da mesma coluna (o tronco sobe do pé
    da árvore até o alto), ou está na lista das tábuas com poste (stands)."""
    trunks = [(x, y) for y, r in enumerate(rows) for x, c in enumerate(r) if c in 'Ts']
    bad = []
    for y, r in enumerate(rows):
        x = 0
        while x < len(r):
            if r[x] != '-':
                x += 1
                continue
            x0 = x
            while x < len(r) and r[x] == '-':
                x += 1
            x1 = x - 1
            ok = any(x0 - 1 <= tx <= x1 + 1 and ty > y for tx, ty in trunks) or (x0, x1, y) in stands
            if not ok:
                bad.append((x0, x1, y))
    if bad:
        raise SystemExit(f'{name}: galho sem tronco em {bad}')


def encosta():
    """Encosta Gelada: o túnel da mina sai na encosta da serra, ao ar livre. No pé do túnel, o braseiro
    dos mineiros (descanso). Em cima da boca do túnel, o paredão da montanha e uma laje de pedra presa
    nele, com o baú dos mineiros (sobe-se pelos galhos do primeiro pinheiro). A neve desce em degraus
    até o pinhal, lá embaixo à direita. Um córrego congelado corta a encosta: o fundo é de lascas de
    gelo e o vento sopra contra quem atravessa."""
    W, H = 112, 44
    g = Grid(W, H, '.')
    # a montanha à esquerda, com o túnel cavado nela (a boca vai da linha 24 à 29)
    g.fill(0, 0, 13, 23, '#')
    g.fill(14, 0, 16, 19, '#')
    # a laje presa no paredão
    g.fill(17, 11, 20, 12, '#')
    ground(g, 0, 24, 30)
    # degraus da encosta (com uma pedra grande no segundo)
    ground(g, 25, 36, 32)
    ground(g, 37, 50, 34)
    g.fill(44, 32, 46, 33, '#')
    ground(g, 51, 64, 36)
    # o córrego congelado: vão com lascas de gelo no fundo
    ground(g, 65, 71, 41)
    for x in range(65, 72):
        g.put(x, 40, '^')
    ground(g, 72, 111, 38)
    pine(g, 28, 32, [(1, 6, 24), (-1, 6, 17)])
    pine(g, 58, 36, [(1, 7, 28)])
    pine(g, 80, 38)
    pine(g, 97, 38)
    for (x, top) in ((33, 32), (49, 34), (86, 38), (104, 38)):
        g.put(x, top - 1, 't')
    g.put(1, 29, '1')
    g.put(110, 37, '2')
    g.put(8, 29, 'R')
    g.put(18, 10, '$')
    g.put(55, 35, 'd')
    g.put(92, 37, 'd')
    return g.rows()


def pinhal():
    """O Pinhal: os pinheiros altos da abertura. Os galhos baixos seguram o peso dele. No meio, a espera
    de caça (o tablado de madeira dos caçadores, em postes). Dali, as pegadas pequenas e as fitas
    vermelhas amarradas nos troncos sobem de galho em galho até o alto do pinheiro velho, onde ela
    escondia uma caixa. Um córrego congelado corta o chão e um tronco caído atravessa o caminho."""
    W, H = 172, 40
    g = Grid(W, H, '.')
    ground(g, 0, 20, 34)
    ground(g, 21, 40, 33)
    ground(g, 41, 60, 34)
    # córrego congelado
    ground(g, 61, 68, 38)
    for x in range(61, 69):
        g.put(x, 37, '^')
    ground(g, 69, 100, 34)
    # tronco caído
    g.fill(84, 32, 90, 33, '#')
    ground(g, 101, 118, 35)
    ground(g, 119, 140, 34)
    ground(g, 141, 171, 33)
    # a espera de caça
    plank(g, 103, 110, 27)
    pine(g, 12, 34)
    pine(g, 33, 33, [(1, 6, 26)])
    pine(g, 52, 34)
    pine(g, 78, 34, [(-1, 6, 26)])
    pine(g, 96, 34)
    pine(g, 122, 34, [(-1, 6, 23)])
    pine(g, 132, 34, [(-1, 6, 19)])
    pine(g, 141, 33, [(-1, 6, 15), (1, 7, 11)])
    pine(g, 160, 33)
    for (x, top) in ((25, 33), (70, 34), (113, 35), (151, 33)):
        g.put(x, top - 1, 't')
    g.put(1, 33, '1')
    g.put(170, 32, '2')
    g.put(147, 10, '$')
    g.put(54, 33, 'r')
    g.put(45, 33, 'd')
    g.put(95, 33, 'd')
    g.put(128, 33, 'd')
    g.put(37, 25, 'e')
    g.put(74, 25, 'e')
    g.put(128, 18, 'e')
    return g.rows(), {(103, 110, 27)}


def lago():
    """Lago Congelado: o lago todo coberto de gelo, com três trechos de gelo fino. Embaixo do gelo, a
    água gelada (e os rostos parados de quem a caçada empurrou para o gelo fino). Na ilha do meio, um
    pinheiro seco e uma memória. Do lado da ilha, a fonte quente: um buraco no gelo de onde o vapor
    sobe alto; com a capa aberta, ele leva até o galho de cima do pinheiro seco, onde ficou a caixa de
    um caçador. Do outro lado, a margem sobe em degraus de pedra para a cabana."""
    W, H = 150, 42
    g = Grid(W, H, '.')
    ground(g, 0, 24, 32)
    # o leito do lago, a água e o gelo por cima
    ground(g, 25, 118, 38)
    g.fill(25, 34, 118, 37, '~')
    for x in range(25, 119):
        g.put(x, 33, '_')
    for (x0, x1) in ((40, 45), (78, 84), (98, 103)):
        for x in range(x0, x1 + 1):
            g.put(x, 33, ';')
    # a ilha
    g.fill(55, 30, 63, 37, '#')
    g.fill(57, 29, 61, 29, '#')
    # a fonte quente: o gelo aberto do lado da ilha
    for x in range(67, 70):
        g.put(x, 33, '~')
    pine(g, 59, 29, [(-1, 6, 24), (1, 9, 12)], kind='s')
    # a margem da direita em degraus
    ground(g, 119, 128, 33)
    ground(g, 129, 136, 28)
    ground(g, 137, 143, 23)
    ground(g, 144, 149, 18)
    pine(g, 10, 32)
    pine(g, 21, 32, [(-1, 6, 24)])
    pine(g, 124, 33)
    pine(g, 140, 23)
    for (x, top) in ((4, 32), (133, 28)):
        g.put(x, top - 1, 't')
    g.put(1, 31, '1')
    g.put(148, 17, '2')
    g.put(57, 28, 'm')
    g.put(67, 11, '$')
    g.put(48, 32, 'd')
    g.put(110, 32, 'd')
    g.put(17, 23, 'e')
    return g.rows()


def cabana():
    """A Cabana: a clareira onde ela guardava as flores. A cabana fica em corte, como uma casa de
    bonecas: paredes de tronco com uma porta de cada lado, o forro e o telhado de duas águas, a chaminé
    de pedra em cima da lareira (descanso). Lá dentro, a capa pendurada no prego da porta, o herbário
    na estante e a carta na mesa. Nenhum inimigo chega aqui."""
    W, H = 84, 34
    g = Grid(W, H, '.')
    ground(g, 0, 83, 29)
    # a beirada do morro dos dois lados
    ground(g, 0, 8, 28)
    ground(g, 76, 83, 28)
    # as paredes (as portas vão da linha 26 à 28) e o telhado
    for y in range(21, 26):
        g.put(29, y, '#')
        g.put(55, y, '#')
    for y, (x0, x1) in zip(range(20, 13, -1), ((27, 57), (28, 56), (30, 54), (32, 52), (34, 50), (36, 48), (38, 46))):
        g.fill(x0, y, x1, y, '#')
    g.fill(50, 11, 51, 16, '#')
    g.put(1, 27, '1')
    g.put(82, 27, '2')
    g.put(32, 28, '{')
    g.put(37, 28, 'r')
    g.put(44, 28, 'r')
    g.put(47, 25, 'm')
    g.put(51, 28, 'R')
    pine(g, 14, 29)
    pine(g, 22, 29)
    pine(g, 64, 29)
    pine(g, 71, 29)
    for (x, top) in ((18, 29), (68, 29)):
        g.put(x, top - 1, 't')
    return g.rows()


def serra():
    """A Serra: a subida pela fenda da montanha, por onde ela passou. Embaixo, a saída da clareira da
    cabana. À esquerda, a chaminé de pedra (saliências dos dois lados, para as garras e o pulo duplo),
    que termina num beco com um baú. À direita, o poço do vento: as paredes são de gelo liso (as garras
    escorregam) e o vento sobe da fenda até o céu; com a capa aberta, ele leva até a saliência de cima e
    à saída, no alto à direita. No meio da subida, rajadas de lado tiram quem plana da corrente."""
    W, H = 60, 100
    g = Grid(W, H, '#')
    # a base
    g.fill(0, 88, 46, 95, '.')
    # a chaminé
    g.fill(10, 40, 22, 87, '.')
    for (x0, x1, y) in ((10, 13, 82), (19, 22, 76), (10, 13, 70), (19, 22, 64), (10, 13, 58), (19, 22, 52), (10, 13, 46)):
        g.fill(x0, y, x1, y + 1, '#')
    # o poço do vento, aberto para o céu, com as paredes de gelo
    g.fill(28, 0, 46, 87, '.')
    for y in range(8, 88):
        g.put(26, y, '+')
        g.put(27, y, '+')
    for y in range(14, 88):
        g.put(47, y, '+')
        g.put(48, y, '+')
    # saliências de pedra no poço e a de cima, com a saída
    g.fill(28, 60, 31, 61, '#')
    g.fill(43, 38, 46, 39, '#')
    g.fill(40, 12, 59, 13, '#')
    g.fill(47, 4, 59, 11, '.')
    g.put(1, 95, '1')
    g.put(58, 11, '2')
    g.put(12, 45, '$')
    g.put(16, 87, 't')
    g.put(21, 75, 'e')
    g.put(11, 57, 'e')
    g.put(29, 59, 'e')
    return g.rows()


def clareira():
    """Clareira da Caça: o fim da trilha, onde o Mestre da Caça entregava os fugitivos ao carrasco. Um
    vale fechado por paredões; entra-se por uma passagem estreita, e a paliçada de estacas desce atrás
    dele. Dois pinheiros grandes dos lados, com um galho cada. A passagem do outro lado desce para o
    vale (a neve fechou, até o Vale das Cachoeiras existir)."""
    W, H = 76, 34
    g = Grid(W, H, '.')
    ground(g, 0, 75, 29)
    # os paredões e a passagem de entrada (linha 24 a 28)
    g.fill(0, 0, 6, 23, '#')
    g.fill(70, 0, 75, 28, '#')
    for y in range(24, 29):
        g.put(6, y, '|')
    pine(g, 16, 29, [(1, 7, 22)])
    pine(g, 59, 29, [(-1, 7, 22)])
    pine(g, 10, 29)
    pine(g, 65, 29)
    for (x, top) in ((22, 29), (54, 29)):
        g.put(x, top - 1, 't')
    g.put(1, 28, '1')
    g.put(44, 28, 'X')
    return g.rows()


if __name__ == '__main__':
    out = sys.argv[1]
    # as Minas entram no mapa quando a área estiver no jogo (--minas)
    MINES = '--minas' in sys.argv
    maps = {'ponte': ponte(), 'catacumbas': catacumbas(), 'memoria': memoria(), 'sinos': sinos(), 'cripta': cripta(),
            'escadaria': escadaria(), 'praca': praca(), 'rua': rua(), 'telhados': telhados(), 'nave': nave(),
            'claustro': claustro(), 'galeria': galeria(), 'altar': altar(),
            'poco': poco(), 'celas': celas(), 'correntes': correntes(), 'guarita': guarita(), 'fuga': fuga(),
            'arena': arena(), 'mascara': mascara(), 'fosso': fosso(), 'abismo': abismo()}
    if MINES:
        maps.update({'boca': boca(), 'trilhos': trilhos(), 'prensas': prensas(), 'veio': veio(), 'espelhos': espelhos(),
                     'capataz': capataz()})
    # v18: as salas novas no meio das regiões
    if '--v18' in sys.argv:
        maps.update({'nichos': nichos(), 'mercado': mercado(), 'solitarias': solitarias(), 'margem': margem()})
    # a Floresta Nevada (--floresta)
    if '--floresta' in sys.argv:
        pin, stands = pinhal()
        forest = {'encosta': encosta(), 'pinhal': pin, 'lago': lago(), 'cabana': cabana(), 'serra': serra(), 'clareira': clareira()}
        for k, rows in forest.items():
            check_forest(k, rows, stands if k == 'pinhal' else ())
        maps.update(forest)
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

"""Monta os mapas ASCII das salas do prólogo e gera src/world/maps.ts.

'#' pedra  '-' plataforma atravessável  '^' espinhos
P início (acordar)  1-9 entradas  c penitente  g guarda de escudo  v corvo (paira nessa célula)
L poste aceso  l poste apagado  S estátua  G cadafalso  D portão  C velas  M espelho
T árvore grande  t árvore pequena  F figura de capa vermelha  ~ água
R vela de descanso (cura e salva)  K o Cobrador  m fragmento de memória
J Garras de Ferro (pulo na parede)  U Pena do Eclipse (pulo duplo)
| grade de ferro (sólida enquanto fechada)  X onde o chefe aparece
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
    g.put(3, 19, '1')
    g.put(36, 19, 'X')
    for x in (9, 16, 31, 40):
        g.put(x, 19, 'C')
    return g.rows()


if __name__ == '__main__':
    out = sys.argv[1]
    maps = {'ponte': ponte(), 'catacumbas': catacumbas(), 'memoria': memoria(), 'sinos': sinos(), 'cripta': cripta()}
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

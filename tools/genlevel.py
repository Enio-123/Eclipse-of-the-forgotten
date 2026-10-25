# Gera o mapa de teste em ASCII (usado só no protótipo)
W, H = 110, 34
g = [['.'] * W for _ in range(H)]
def fill(x0, y0, x1, y1, c='#'):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = c
fill(0, 0, W - 1, 0)            # teto
fill(0, 0, 0, H - 1)            # parede esquerda
fill(W - 1, 0, W - 1, H - 1)    # parede direita
fill(0, 28, W - 1, H - 1)       # chão
# fosso de espinhos
fill(21, 28, 25, 29, '.')
fill(21, 29, 25, 29, '^')
# degrau
fill(40, 25, 44, 27)
# estalactites
fill(29, 1, 34, 5); fill(31, 6, 33, 8)
fill(70, 1, 76, 3)
# plataformas finas subindo
fill(48, 23, 52, 23, '-'); fill(55, 19, 59, 19, '-')
fill(48, 15, 52, 15, '-'); fill(56, 11, 61, 11, '-')
# pilar no meio do caminho
fill(62, 20, 64, 27)
fill(66, 24, 69, 24, '-')
# saliência alta e vão para o dash
fill(64, 11, 80, 12)
fill(89, 11, 108, 12)
fill(95, 13, 98, 16)
# espinhos no chão para testar o ataque para baixo
fill(88, 27, 93, 27, '^')
# caixa baixa para pular
fill(100, 24, 108, 27)
g[27][4] = 'P'
g[27][36] = 'c'
g[27][80] = 'c'
g[10][70] = 'c'
rows = [''.join(r) for r in g]
out = 'export const LEVEL_1 = [\n' + ''.join(f"  '{r}',\n" for r in rows) + '];\n'
open(__import__('sys').argv[1], 'w').write(out)
print('\n'.join(rows))

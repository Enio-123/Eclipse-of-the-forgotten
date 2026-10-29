"""Junta as imagens que o jogo carrega no começo (a lista IMAGES de game/src/scenes/BootScene.ts) em poucas
folhas, game/public/assets/pack-N.png, e escreve game/src/gfx/pack.json com o lugar de cada uma e o sha1 do
arquivo solto. No build o jogo carrega as folhas e as soltas saem da pasta final (vite.config.ts): a
publicação do Artifact aceita no máximo 511 arquivos. Rodar de novo sempre que uma dessas imagens mudar;
o build avisa e deixa solta a que mudou depois da folha.
Ficam de fora os itens (a página da loja usa o endereço deles) e o relevo da tinta, que repete.
uso: python3 tools/atlas.py"""
import hashlib, json, os, re
from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(HERE, 'game')
ASSETS = os.path.join(GAME, 'public', 'assets')
OUT = os.path.join(GAME, 'src', 'gfx', 'pack.json')
SIDE = 2048  # lado das folhas: toda placa de vídeo aceita
GAP = 1


def boot_images():
    src = open(os.path.join(GAME, 'src', 'scenes', 'BootScene.ts'), encoding='utf-8').read()
    block = re.search(r'const IMAGES = \[(.*?)\n\];', src, re.S).group(1)
    return re.findall(r"'([^']+)'", re.sub(r'//[^\n]*', '', block))


def loose(key):
    return key.startswith('item-') or key == 'paint-strokes'


class Sheet:
    """Encaixe pelo horizonte: cada imagem desce até onde der, da esquerda para a direita."""

    def __init__(self):
        self.sky = [(0, 0, SIDE)]  # (x, y, largura) de cada trecho do horizonte
        self.rects = []

    def spot(self, w, h):
        best = None
        for i, (x, _, _) in enumerate(self.sky):
            if x + w > SIDE:
                break
            # a imagem fica em cima do trecho mais alto que ela cobre
            top, span, j = 0, 0, i
            while span < w:
                top = max(top, self.sky[j][1])
                span += self.sky[j][2]
                j += 1
            if top + h <= SIDE and (best is None or (top + h, x) < (best[1] + h, best[0])):
                best = (x, top)
        return best

    def place(self, w, h, x, y):
        self.rects.append((x, y, w, h))
        sky = []
        for sx, sy, sw in self.sky:
            # corta o trecho em volta da nova imagem
            if sx + sw <= x or sx >= x + w:
                sky.append((sx, sy, sw))
                continue
            if sx < x:
                sky.append((sx, sy, x - sx))
            if sx + sw > x + w:
                sky.append((x + w, sy, sx + sw - x - w))
        sky.append((x, y + h, w))
        sky.sort()
        # junta os trechos vizinhos da mesma altura
        merged = []
        for seg in sky:
            if merged and merged[-1][1] == seg[1] and merged[-1][0] + merged[-1][2] == seg[0]:
                merged[-1] = (merged[-1][0], seg[1], merged[-1][2] + seg[2])
            else:
                merged.append(seg)
        self.sky = merged


def main():
    keys = [k for k in boot_images() if not loose(k)]
    imgs = {k: Image.open(os.path.join(ASSETS, f'{k}.png')).convert('RGBA') for k in keys}
    order = sorted(keys, key=lambda k: (-imgs[k].height, -imgs[k].width, k))
    sheets = []
    where = {}
    for k in order:
        w, h = imgs[k].width + GAP, imgs[k].height + GAP
        for n, sh in enumerate(sheets):
            at = sh.spot(w, h)
            if at:
                break
        else:
            sheets.append(Sheet())
            n, sh = len(sheets) - 1, sheets[-1]
            at = sh.spot(w, h)
            assert at, f'{k} não cabe numa folha de {SIDE}'
        sh.place(w, h, *at)
        where[k] = (n, *at)
    for old in os.listdir(ASSETS):
        if re.fullmatch(r'pack-\d+\.png', old):
            os.remove(os.path.join(ASSETS, old))
    files = []
    for n, sh in enumerate(sheets):
        # a folha só tem a altura que usou
        tall = max(y + h for _, y, _, h in sh.rects)
        out = Image.new('RGBA', (SIDE, tall), (0, 0, 0, 0))
        for k, (m, x, y) in where.items():
            if m == n:
                out.paste(imgs[k], (x, y))
        files.append(f'pack-{n}.png')
        out.save(os.path.join(ASSETS, files[-1]), optimize=True)
    images = {}
    for k in keys:
        n, x, y = where[k]
        sha = hashlib.sha1(open(os.path.join(ASSETS, f'{k}.png'), 'rb').read()).hexdigest()
        images[k] = [n, x, y, imgs[k].width, imgs[k].height, sha]
    json.dump({'sheets': files, 'images': images}, open(OUT, 'w'), indent=0, sort_keys=True)
    area = sum(i.width * i.height for i in imgs.values())
    used = sum(SIDE * Image.open(os.path.join(ASSETS, f)).height for f in files)
    loose_n = len([k for k in boot_images() if loose(k)])
    print(f'{len(keys)} imagens em {len(files)} folhas ({round(100 * area / used)}% ocupado), {loose_n} soltas;',
          ', '.join(f'{f} {round(os.path.getsize(os.path.join(ASSETS, f)) / 1e3)} kB' for f in files))


main()

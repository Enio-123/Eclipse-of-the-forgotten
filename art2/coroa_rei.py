"""A coroa pequena do Carrasco Coroado, solta da folha dele (coroado.png, quadro crown-s): no final II ela fica na
cabeça do cavaleiro em toda sala, e a folha do Coroado só vem no terraço. Mesma pintura, em 2x.

uso: python3 coroa_rei.py <pasta_assets>
  lê coroado.png e coroado.json e grava crown-rei.png
"""
import json
import os
import sys
from PIL import Image

ASSETS = sys.argv[1] if len(sys.argv) > 1 else '../game/public/assets'


def main():
    meta = json.load(open(os.path.join(ASSETS, 'coroado.json')))
    f = meta['frames']['crown-s']['frame']
    sheet = Image.open(os.path.join(ASSETS, 'coroado.png')).convert('RGBA')
    crown = sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
    crown.save(os.path.join(ASSETS, 'crown-rei.png'), optimize=True)
    print('crown-rei.png', crown.size)


if __name__ == '__main__':
    main()

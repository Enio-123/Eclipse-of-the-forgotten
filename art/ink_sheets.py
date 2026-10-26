"""Gera no traço liso (ink.py) as folhas dos personagens, chefes e bichos, as armas caídas e os ícones.

As folhas saem como atlas do Phaser (<nome>.png + <nome>.json, com a escala dentro); as imagens
soltas que o jogo também desenha reduzidas ficam listadas em hd.json (nome -> pixels por pixel do
mundo). O cavaleiro sai misturado: máscara, capuz, capa e armas lisos, o corpo em pixel.

uso: python3 ink_sheets.py <pasta_assets> [nomes...] [--preview=<pasta>]
"""
import json
import os
import sys
import time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import ink

ICON_S = 4   # ícones do inventário: 24 -> 96 (a tela mostra com 48)


def sheets():
    import anims, knight, guard, crow, archer, censer, sineiro, arcebispo, townsfolk, enemy, props, deco, jailer, carcereira, sombra
    import miner, ambat
    out = {}
    for w in anims.WEAPONS:
        out[f'knight-{w}'] = dict(anims=anims.anims_for(w), mod='knight', W=knight.W, H=knight.H, feet=knight.FEET,
                                  pixel=ink.KNIGHT_PIXEL, extra={'kw': {'weapon': w}})
    out['penitent'] = dict(anims=enemy.ANIMS, mod='enemy', W=enemy.W, H=enemy.H, feet=enemy.FEET)
    out['guard'] = dict(anims=guard.ANIMS, mod='guard', W=guard.W, H=guard.H, feet=guard.FEET)
    out['crow'] = dict(anims=crow.ANIMS, mod='crow', W=crow.W, H=crow.H, feet=crow.FEET)
    # de onde sai a flecha (o jogo usa o último quadro de 'draw'), em pixels do mundo
    out['archer'] = dict(anims=archer.ANIMS, mod='archer', W=archer.W, H=archer.H, feet=archer.FEET,
                         meta_extra={'points': {n: [archer.frame_points(p) for p in poses] for n, (poses, _, _) in archer.ANIMS.items() if n.startswith('draw')}})
    out['censer'] = dict(anims=censer.ANIMS, mod='censer', W=censer.W, H=censer.H, feet=censer.FEET,
                         meta_extra={'points': {n: [censer.censer_point(p) for p in poses] for n, (poses, _, _) in censer.ANIMS.items()}})
    out['sineiro'] = dict(anims=sineiro.ANIMS, mod='sineiro', W=sineiro.W, H=sineiro.H, feet=sineiro.FEET)
    out['arcebispo'] = dict(anims=arcebispo.ANIMS, mod='arcebispo', W=arcebispo.W, H=arcebispo.H, feet=arcebispo.FEET,
                            meta_extra={'points': {n: [arcebispo.points(p) for p in poses] for n, (poses, _, _) in arcebispo.ANIMS.items()}})
    # Carcereiro: a mão da corrente em cada quadro (o jogo desenha a corrente estalada)
    out['jailer'] = dict(anims=jailer.ANIMS, mod='jailer', W=jailer.W, H=jailer.H, feet=jailer.FEET,
                         meta_extra={'points': {n: [jailer.points(p) for p in poses] for n, (poses, _, _) in jailer.ANIMS.items()}})
    out['carcereira'] = dict(anims=carcereira.ANIMS, mod='carcereira', W=carcereira.W, H=carcereira.H, feet=carcereira.FEET,
                             meta_extra={'points': {n: [carcereira.points(p) for p in poses] for n, (poses, _, _) in carcereira.ANIMS.items()}})
    # Sombra do Carrasco: a mão e a ponta do machado em cada quadro (o respingo da machadada)
    out['sombra'] = dict(anims=sombra.ANIMS, mod='sombra', W=sombra.W, H=sombra.H, feet=sombra.FEET,
                         meta_extra={'points': {n: [sombra.points(p) for p in poses] for n, (poses, _, _) in sombra.ANIMS.items()}})
    # Mineiro esquecido: a ponta da picareta em cada quadro (onde o golpe acerta)
    out['miner'] = dict(anims=miner.ANIMS, mod='miner', W=miner.W, H=miner.H, feet=miner.FEET,
                        meta_extra={'points': {n: [miner.tip_point(p) for p in poses] for n, (poses, _, _) in miner.ANIMS.items()}})
    out['ambat'] = dict(anims=ambat.ANIMS, mod='ambat', W=ambat.W, H=ambat.H, feet=ambat.FEET)
    out['nun'] = dict(anims=townsfolk.NUN_ANIMS, mod='townsfolk', W=townsfolk.NUN_W, H=townsfolk.NUN_H, feet=townsfolk.NUN_FEET, extra={'build': 'nun'})
    out['smith'] = dict(anims=townsfolk.SMITH_ANIMS, mod='townsfolk', W=townsfolk.SMITH_W, H=townsfolk.SMITH_H, feet=townsfolk.SMITH_FEET, extra={'build': 'smith'})
    out['folk'] = dict(anims=townsfolk.FOLK_ANIMS, mod='townsfolk', W=townsfolk.FOLK_W, H=townsfolk.FOLK_H, feet=townsfolk.FOLK_FEET, extra={'build': 'folk'})
    out['prisoner'] = dict(anims=townsfolk.PRISONER_ANIMS, mod='townsfolk', W=townsfolk.PRISONER_W, H=townsfolk.PRISONER_H, feet=townsfolk.PRISONER_FEET, extra={'build': 'prisoner'})
    out['cobrador'] = dict(anims=props.COB_ANIMS, mod='props', W=props.CW, H=props.CH, feet=props.CFEET, extra={'build': 'cobrador_build'})
    out['figure'] = dict(anims=deco.FIGURE_ANIMS, mod='deco', W=deco.FIGURE_W, H=deco.FIGURE_H, feet=deco.FIGURE_FEET, extra={'build': 'figure_build'})
    return out


def to_png(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def singles(out_dir):
    """Imagens soltas: o incensário que o Arcebispo arremessa, o sino que cai, as armas no chão, os
    cortes e a flecha."""
    import arcebispo, sineiro, items, slash
    from puppet import Capsule
    made = {}
    prims, decals = arcebispo.censer_prims((16.0, 22.0), (0.0, -1.0), True, 1.0)
    to_png(ink.render_frame(prims, decals, 32, 40, style=ink.HK)).save(f'{out_dir}/arcebispo-censer.png')
    made['arcebispo-censer'] = ink.S
    prims, decals = [], []
    sineiro.bell(prims, decals, 'bell', (16.0, 21.0), 0.0, 0.95, 1.0, slit=False)
    prims.append(Capsule('rope', 'wood', 0.5, (16.0, 0.5), (16.0, 6.0), 0.9, 0.9))
    to_png(ink.render_frame(prims, decals, 32, 36, style=ink.HK)).save(f'{out_dir}/bell-drop.png')
    made['bell-drop'] = ink.S
    items.HD = ink.S
    items.badalo().save(f'{out_dir}/item-badalo.png')
    items.incensario().save(f'{out_dir}/item-incensario.png')
    made['item-badalo'] = made['item-incensario'] = ink.S
    # enfeites da Cidade-Catedral e da Prisão Subterrânea
    import props_hd, prison_props
    for k, fn in list(props_hd.PROPS.items()) + list(prison_props.PROPS.items()):
        prims, decals, W, H = fn()
        to_png(ink.render_frame(prims, decals, W, H, style=ink.HK)).save(f'{out_dir}/{k}.png')
        made[k] = ink.S
    # cortes (a escala vai no slashes.json) e a flecha
    made.update(slash.main(out_dir, hd=ink.S))
    # ícones (só na tela, em HTML: não entram no hd.json)
    items.HD = ICON_S
    for k, fn in items.ICONS.items():
        fn().save(f'{out_dir}/item-{k}.png')
    items.HD = 0
    return made


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out_dir = args[0] if args else '.'
    only = set(args[1:])
    prev_dir = next((a[10:] for a in sys.argv if a.startswith('--preview=')), None)
    if prev_dir:
        os.makedirs(prev_dir, exist_ok=True)
    table = sheets()
    for name, d in table.items():
        if only and name not in only:
            continue
        t0 = time.time()
        sheet, meta = ink.build_atlas(name, d['anims'], d['mod'], d['W'], d['H'], d['feet'], out_dir, pixel=d.get('pixel', ()),
                                      extra=d.get('extra'), meta_extra=d.get('meta_extra'),
                                      preview=f'{prev_dir}/{name}.png' if prev_dir else None)
        print(f'{name}: {sheet.shape[1]}x{sheet.shape[0]}, {len(meta["frames"])} quadros, {time.time() - t0:.0f}s', flush=True)
    if not only or 'singles' in only:
        made = singles(out_dir)
        path = f'{out_dir}/hd.json'
        hd = json.load(open(path)) if os.path.exists(path) else {}
        hd.update(made)
        json.dump(hd, open(path, 'w'), indent=1)
        print('soltas:', ', '.join(made), flush=True)


if __name__ == '__main__':
    main()

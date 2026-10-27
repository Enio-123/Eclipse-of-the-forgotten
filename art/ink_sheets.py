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
    import miner, ambat, capataz, wolf, owl, cacador, trout, heron, barqueiro, coroa, arquivado
    out = {}
    for w in anims.WEAPONS:
        out[f'knight-{w}'] = dict(anims=anims.anims_for(w), mod='knight', W=knight.W, H=knight.H, feet=knight.FEET,
                                  pixel=ink.KNIGHT_PIXEL, extra={'kw': {'weapon': w}})
    # a lança do Mestre da Caça: onde fica a lanterna em cada quadro (o jogo acende a luz ali)
    A = anims.anims_for('lanca')
    out['knight-lanca']['meta_extra'] = {'points': {n: [knight.focus_point(p, 'lanca') for p in poses] for n, (poses, _, _) in A.items()}}
    # os cajados dos magos: o foco de cada quadro (de onde sai a magia e onde fica a luz dela)
    for w in anims.STAFFS:
        A = anims.anims_for(w)
        out[f'knight-{w}'] = dict(anims=A, mod='knight', W=knight.W, H=knight.H, feet=knight.FEET,
                                  pixel=ink.KNIGHT_PIXEL, extra={'kw': {'weapon': w}},
                                  meta_extra={'points': {n: [knight.focus_point(p, w) for p in poses] for n, (poses, _, _) in A.items()}})
    # todos os outros bonecos ganham poses de passagem (fluid.py): os chefes grandes um pouco menos, para
    # o atlas não crescer demais
    import fluid

    def add(key, mod, A, points=None, which=None, cap=4, skip=(), extra=None, loop_fps=16):
        A, holds = fluid.densify(A, mod, cap=cap, skip=skip, loop_fps=loop_fps)
        meta = {}
        if points:
            meta['points'] = {n: [points(p) for p in poses] for n, (poses, _, _) in A.items() if which is None or which(n)}
        if holds:
            meta['holds'] = holds
        d = dict(anims=A, mod=mod.__name__, W=mod.W, H=mod.H, feet=mod.FEET, meta_extra=meta or None)
        if extra:
            d['extra'] = extra
        out[key] = d

    def add_npc(key, mod, A, W, H, feet, build, cap=4, skip=()):
        A, holds = fluid.densify(A, mod, cap=cap, skip=skip)
        out[key] = dict(anims=A, mod=mod.__name__, W=W, H=H, feet=feet, extra={'build': build},
                        meta_extra={'holds': holds} if holds else None)

    add('penitent', enemy, enemy.ANIMS)
    add('guard', guard, guard.ANIMS)
    add('crow', crow, crow.ANIMS)
    # de onde sai a flecha (o jogo usa o último quadro de 'draw'), em pixels do mundo
    add('archer', archer, archer.ANIMS, points=archer.frame_points, which=lambda n: n.startswith('draw'))
    add('censer', censer, censer.ANIMS, points=censer.censer_point)
    add('sineiro', sineiro, sineiro.ANIMS, cap=3)
    add('arcebispo', arcebispo, arcebispo.ANIMS, points=arcebispo.points, cap=3)
    # Carcereiro: a mão da corrente em cada quadro (o jogo desenha a corrente estalada)
    add('jailer', jailer, jailer.ANIMS, points=jailer.points)
    add('carcereira', carcereira, carcereira.ANIMS, points=carcereira.points, cap=3)
    # Sombra do Carrasco: a mão e a ponta do machado em cada quadro (o respingo da machadada)
    add('sombra', sombra, sombra.ANIMS, points=sombra.points, cap=2)
    # Mineiro esquecido: a ponta da picareta em cada quadro (onde o golpe acerta)
    add('miner', miner, miner.ANIMS, points=miner.tip_point)
    # O Capataz de Âmbar: a ponta da picareta, a cabeça dela e a mão em cada quadro
    add('capataz', capataz, capataz.ANIMS, points=capataz.points, cap=3)
    add('ambat', ambat, ambat.ANIMS)
    # Floresta Nevada: o Lobo da Caça e a Coruja de Geada
    # o lobo corre rápido: a corrida também ganha poses de passagem
    add('wolf', wolf, wolf.ANIMS, loop_fps=24)
    add('owl', owl, owl.ANIMS)
    # O Mestre da Caça: a ponta da lança, a lanterna e a mão em cada quadro
    add('cacador', cacador, cacador.ANIMS, points=cacador.points, cap=3)
    # Vale das Cachoeiras: a Truta de Âmbar e a Garça Cinzenta (a ponta do bico em cada quadro: o bote)
    add('trout', trout, trout.ANIMS)
    add('heron', heron, heron.ANIMS, points=heron.points)
    # O Barqueiro: a mão da frente, a vara (o jogo desenha a vara solta), a mão da corda, a cabeça, o chapéu
    # e a lanterna da proa em cada quadro
    add('barqueiro', barqueiro, barqueiro.ANIMS, points=barqueiro.points, cap=3)
    # Torres Rúnicas: o Guarda da Coroação (a ponta da alabarda e o meio da lâmina em cada quadro)
    add('crownguard', coroa, coroa.ANIMS, points=coroa.points, cap=3)
    # e os Arquivados (dois corpos na mesma folha)
    add('archived', arquivado, arquivado.ANIMS, points=arquivado.points, which=lambda n: n.startswith(('sit', 'getup')))
    # o mineiro que ficou (NPC do Veio de Âmbar): o mesmo boneco, sentado, com a vela acesa
    A, holds = fluid.densify(miner.NPC_ANIMS, miner)
    out['oldminer'] = dict(anims=A, mod='miner', W=miner.W, H=miner.H, feet=miner.FEET, meta_extra={'holds': holds} if holds else None)
    add_npc('nun', townsfolk, townsfolk.NUN_ANIMS, townsfolk.NUN_W, townsfolk.NUN_H, townsfolk.NUN_FEET, 'nun')
    # a forja: o jogo solta a faísca num quadro certo da martelada, então ela fica como está
    add_npc('smith', townsfolk, townsfolk.SMITH_ANIMS, townsfolk.SMITH_W, townsfolk.SMITH_H, townsfolk.SMITH_FEET, 'smith', skip=('work',))
    add_npc('folk', townsfolk, townsfolk.FOLK_ANIMS, townsfolk.FOLK_W, townsfolk.FOLK_H, townsfolk.FOLK_FEET, 'folk')
    add_npc('prisoner', townsfolk, townsfolk.PRISONER_ANIMS, townsfolk.PRISONER_W, townsfolk.PRISONER_H, townsfolk.PRISONER_FEET, 'prisoner')
    # o Agrimensor, que vende as folhas do mapa (a groma dele sai solta, em singles)
    add_npc('surveyor', townsfolk, townsfolk.SURVEYOR_ANIMS, townsfolk.SURVEYOR_W, townsfolk.SURVEYOR_H, townsfolk.SURVEYOR_FEET, 'surveyor')
    add_npc('cobrador', props, props.COB_ANIMS, props.CW, props.CH, props.CFEET, 'cobrador_build')
    add_npc('figure', deco, deco.FIGURE_ANIMS, deco.FIGURE_W, deco.FIGURE_H, deco.FIGURE_FEET, 'figure_build')
    return out


def to_png(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def groma(out_dir, made):
    """A groma do Agrimensor (fica fincada no chão ao lado dele e não vira junto)."""
    import townsfolk
    prims, decals, W, H = townsfolk.groma()
    to_png(ink.render_frame(prims, decals, W, H, style=ink.HK)).save(f'{out_dir}/deco-groma.png')
    made['deco-groma'] = ink.S


def barq_singles(out_dir, made):
    """A vara solta do Barqueiro e a mão que vai por cima dela."""
    import barqueiro
    for key, fn in (('barqueiro-pole', barqueiro.pole_image), ('barqueiro-fist', barqueiro.fist_image)):
        prims, decals, W, H = fn()
        to_png(ink.render_frame(prims, decals, W, H, style=ink.HK)).save(f'{out_dir}/{key}.png')
        made[key] = ink.S


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
    groma(out_dir, made)
    barq_singles(out_dir, made)
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
    if 'groma' in only or 'barqueiro-pole' in only:
        made = {}
        if 'groma' in only:
            groma(out_dir, made)
        if 'barqueiro-pole' in only:
            barq_singles(out_dir, made)
        path = f'{out_dir}/hd.json'
        hd = json.load(open(path)) if os.path.exists(path) else {}
        hd.update(made)
        json.dump(hd, open(path, 'w'), indent=1)
    if not only or 'singles' in only:
        made = singles(out_dir)
        path = f'{out_dir}/hd.json'
        hd = json.load(open(path)) if os.path.exists(path) else {}
        hd.update(made)
        json.dump(hd, open(path, 'w'), indent=1)
        print('soltas:', ', '.join(made), flush=True)


if __name__ == '__main__':
    main()

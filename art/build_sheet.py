"""Gera as folhas de sprites do cavaleiro (uma por arma) + JSON + prévias.

uso: python3 build_sheet.py <pasta_saida> [armas separadas por vírgula] [--preview]
"""
import json, sys, os
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from puppet import render, to_image
from knight import build, W, H, FEET
from anims import anims_for, WEAPONS


def render_one(job):
    w, name, i, pose = job
    prims, decals = build(pose, w)
    px, _ = render(prims, decals, W, H)
    img = to_image(px, W, H)
    return (w, name, i, img.tobytes())


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else '.'
    weapons = sys.argv[2].split(',') if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else WEAPONS
    only = None
    for a in sys.argv:
        if a.startswith('--only='):
            only = a[7:].split(',')
    jobs = []
    tables = {}
    for w in weapons:
        A = anims_for(w)
        if only:
            A = {k: v for k, v in A.items() if k in only}
        tables[w] = A
        for name, (poses, fps, loop) in A.items():
            for i, pose in enumerate(poses):
                jobs.append((w, name, i, pose))
    with Pool(4) as pool:
        res = pool.map(render_one, jobs, chunksize=2)
    frames = {}
    for w, name, i, data in res:
        frames.setdefault(w, {}).setdefault(name, {})[i] = Image.frombytes('RGBA', (W, H), data)
    for w in weapons:
        A = tables[w]
        cols = max(len(f) for f, _, _ in A.values())
        sheet = Image.new('RGBA', (cols * W, len(A) * H), (0, 0, 0, 0))
        meta = {'frameWidth': W, 'frameHeight': H, 'originX': FEET[0] / W, 'originY': FEET[1] / H, 'columns': cols, 'anims': {}}
        for row, (name, (poses, fps, loop)) in enumerate(A.items()):
            for i in range(len(poses)):
                sheet.alpha_composite(frames[w][name][i], (i * W, row * H))
            meta['anims'][name] = {'start': row * cols, 'count': len(poses), 'fps': fps, 'loop': loop}
        if not only:
            sheet.save(f'{out_dir}/knight-{w}.png', optimize=True)
            json.dump(meta, open(f'{out_dir}/knight-{w}.json', 'w'), indent=1)
        # prévia ampliada (recorte central) com fundo do jogo
        S = 3
        cw, ch = 96, 84
        prev = Image.new('RGBA', (cols * cw * S, len(A) * ch * S), (24, 28, 42, 255))
        for row, (name, (poses, fps, loop)) in enumerate(A.items()):
            for i in range(len(poses)):
                fr = frames[w][name][i].crop(((W - cw) // 2, H - ch - 2, (W + cw) // 2, H - 2))
                prev.alpha_composite(fr.resize((cw * S, ch * S), Image.NEAREST), (i * cw * S, row * ch * S))
        prev.save(f'preview-{w}.png')
        print(w, sheet.size, len(A), 'anims')


if __name__ == '__main__':
    main()

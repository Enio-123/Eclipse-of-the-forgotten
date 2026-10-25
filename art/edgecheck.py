import sys, json, os
sys.path.insert(0, '.')
from multiprocessing import Pool
from puppet import render
from knight import build, W, H
from anims import anims_for, WEAPONS

def job(a):
    w, name, i, pose = a
    prims, decals = build(pose, w)
    px, _ = render(prims, decals, W, H)
    xs = [x for y in range(H) for x in range(W) if px[y][x] is not None]
    ys = [y for y in range(H) for x in range(W) if px[y][x] is not None]
    return w, name, i, min(xs), max(xs), min(ys), max(ys)

if __name__ == '__main__':
    ws = sys.argv[1].split(',') if len(sys.argv) > 1 else WEAPONS
    jobs = [(w, n, i, p) for w in ws for n, (ps, _, _) in anims_for(w).items() for i, p in enumerate(ps)]
    with Pool(4) as pool:
        res = pool.map(job, jobs)
    for w, n, i, x0, x1, y0, y1 in res:
        flag = ' <-- EDGE' if x0 <= 1 or x1 >= W - 2 or y0 <= 1 or y1 >= H - 2 else ''
        if flag or '-v' in sys.argv:
            print(f'{w:8s} {n:14s} {i} x[{x0},{x1}] y[{y0},{y1}]{flag}')

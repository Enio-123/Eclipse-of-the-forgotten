"""Peças comuns dos bonecos novos: girar o corpo inteiro (quedas, mergulho) e montar a folha
de sprites com o JSON que o jogo lê (mesmo formato de enemy.py)."""
import json
import math
from PIL import Image
from puppet import Prim, Decal, render, to_image


class Rot(Prim):
    """Uma parte girada em volta de um pivô (e escalada a partir dele), depois deslocada. A luz
    continua vindo do mesmo lado."""

    def __init__(self, inner, pivot, ang, off=(0.0, 0.0), k=1.0):
        c, s = math.cos(ang), math.sin(ang)
        x0, y0, x1, y1 = inner.bbox
        pts = [(x0, y0), (x1, y0), (x0, y1), (x1, y1)]
        rp = [(pivot[0] + ((x - pivot[0]) * c - (y - pivot[1]) * s) * k + off[0],
               pivot[1] + ((x - pivot[0]) * s + (y - pivot[1]) * c) * k + off[1]) for x, y in pts]
        bbox = (min(p[0] for p in rp) - 1, min(p[1] for p in rp) - 1, max(p[0] for p in rp) + 1, max(p[1] for p in rp) + 1)
        super().__init__(inner.name, inner.mat, inner.z, bbox, inner.shade, inner.flat)
        self.inner, self.pivot, self.c, self.s, self.off, self.k = inner, pivot, c, s, off, k

    def to_local(self, x, y):
        dx, dy = (x - self.off[0] - self.pivot[0]) / self.k, (y - self.off[1] - self.pivot[1]) / self.k
        return self.pivot[0] + dx * self.c + dy * self.s, self.pivot[1] - dx * self.s + dy * self.c

    def hit(self, x, y):
        n = self.inner.hit(*self.to_local(x, y))
        if n is None:
            return None
        return (n[0] * self.c - n[1] * self.s, n[0] * self.s + n[1] * self.c, n[2])

    def local(self, x, y):
        return self.inner.local(*self.to_local(x, y))

    def inside(self, x, y):
        return self.inner.inside(*self.to_local(x, y))


def rotate_all(prims, decals, pivot, ang_deg, off=(0.0, 0.0), scale=1.0):
    if not ang_deg and off == (0.0, 0.0) and scale == 1.0:
        return prims, decals
    a = math.radians(ang_deg)
    rp = [Rot(p, pivot, a, off, scale) for p in prims]
    probe = Rot(prims[0], pivot, a, off, scale)

    def wrap(fn):
        return lambda x, y, cur: fn(*probe.to_local(x, y), cur)

    return rp, [Decal(d.clip, wrap(d.fn)) for d in decals]


def build_sheet(name, anims, build, W, H, feet, out_dir, preview=None, bg=(24, 28, 42, 255), scale=3):
    cols = max(len(f) for f, _, _ in anims.values())
    sheet = Image.new('RGBA', (cols * W, len(anims) * H), (0, 0, 0, 0))
    meta = {'frameWidth': W, 'frameHeight': H, 'originX': feet[0] / W, 'originY': feet[1] / H, 'columns': cols, 'anims': {}}
    for row, (an, (poses, fps, loop)) in enumerate(anims.items()):
        for i, pose in enumerate(poses):
            prims, decals = build(pose)
            px, _ = render(prims, decals, W, H)
            sheet.alpha_composite(to_image(px, W, H), (i * W, row * H))
        meta['anims'][an] = {'start': row * cols, 'count': len(poses), 'fps': fps, 'loop': loop}
    sheet.save(f'{out_dir}/{name}.png', optimize=True)
    json.dump(meta, open(f'{out_dir}/{name}.json', 'w'), indent=1)
    if preview:
        prev = Image.new('RGBA', sheet.size, bg)
        prev.alpha_composite(sheet)
        prev.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST).save(preview)
    return sheet, meta

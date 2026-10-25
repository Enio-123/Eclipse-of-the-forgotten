import numpy as np, time
from brush import Layer, hexc, mix
from arvore import paint_tree, ground_shadow
T0=time.time()
W,H=1400,520
L=Layer(W,H)
yy=np.mgrid[0:H,0:W][0].astype(np.float32)
L.fill(mix(hexc(0x9dbde0), hexc(0xf1e8d6), (yy/H)[...,None]), np.ones((H,W),np.float32))
g=np.zeros((H,W),np.float32); g[400:]=1
L.fill(hexc(0x5f9a44), g)
rng=np.random.default_rng(3)
for i,(x,size,kind) in enumerate([(150,120,'green'),(420,100,'pink'),(650,70,'deep'),(820,50,'green'),(950,36,'pink'),(1100,110,'green'),(1300,26,'bush')]):
    ground_shadow(L, x, 404, size, hexc(0x2e5a38), 0.4)
    paint_tree(L, rng, x, 404, size, kind, 0.0, petals=True if kind=='pink' else None)
L.image().save('../shots/v5/teste-arvore.png')
print(time.time()-T0)

import time, numpy as np
from brush import *
rng = np.random.default_rng(3)
W, H = 640, 360
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
ref = np.zeros((H, W, 3), np.float32)
top, bot = hexc(0x1a3350), hexc(0xa9c3d4)
t = (yy / H)[..., None]
ref[:] = mix(top, bot, t)
# tronco
trunk = (np.abs(xx - 200) < 22 + yy * 0.02).astype(np.float32)
ref = np.where(trunk[..., None] > 0, mix(hexc(0x1b2f48), hexc(0x4e7194), sstep(200, 175, xx)[..., None] * 0.7), ref)
# neve
ground = (yy > 250 + 0.08 * (xx - 320)).astype(np.float32)
ref = np.where(ground[..., None] > 0, mix(hexc(0xe7f1f7), hexc(0x7fa0bd), value_noise(H, W, 60, rng)[..., None] * 0.6), ref)
flow = np.zeros((H, W), np.float32) - 0.1
flow = np.where(trunk > 0, np.pi / 2, flow)
flow = np.where(ground > 0, -0.05, flow)
L = Layer(W, H)
t0 = time.time()
paint(L, ref, np.ones((H, W), np.float32), flow, rng, passes_std(0.6), base=1.0)
print('t', time.time() - t0)
save(L, 't_brush.png')

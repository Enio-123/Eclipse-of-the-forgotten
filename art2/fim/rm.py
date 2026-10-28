"""O lado Python do raymarcher: compila a cena em C, chama o render e devolve as camadas."""
import ctypes
import os
import subprocess
import time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def build(name):
    src = os.path.join(HERE, name + '.c')
    so = os.path.join(HERE, name + '.so')
    if not os.path.exists(so) or os.path.getmtime(so) < max(os.path.getmtime(src), os.path.getmtime(os.path.join(HERE, 'rm.h'))):
        subprocess.check_call(['gcc', '-O3', '-march=native', '-ffast-math', '-fopenmp', '-shared', '-fPIC', src, '-o', so, '-lm'])
    lib = ctypes.CDLL(so)
    lib.setup.argtypes = [ctypes.POINTER(ctypes.c_float)]
    lib.render.argtypes = [ctypes.c_int] * 7 + [ctypes.POINTER(ctypes.c_float), ctypes.POINTER(ctypes.c_float)]
    lib.nout.restype = ctypes.c_int
    return lib


def fptr(a):
    return a.ctypes.data_as(ctypes.POINTER(ctypes.c_float))


def render(lib, W, H, ss, cam, prm, win=None, verbose=True):
    """win = (x0, y0, x1, y1): só essa janela do quadro W x H."""
    prm = np.asarray(list(prm) + [0.0] * (32 - len(prm)), np.float32)
    lib.setup(fptr(prm))
    cam = np.asarray(cam, np.float32)
    n = lib.nout()
    x0, y0, x1, y1 = win if win else (0, 0, W, H)
    out = np.zeros((y1 - y0, x1 - x0, n), np.float32)
    t0 = time.time()
    lib.render(W, H, ss, x0, x1, y0, y1, fptr(cam), fptr(out))
    if verbose:
        print('render %dx%d ss%d: %.1fs' % (W, H, ss, time.time() - t0))
    return out


def project(cam, W, H, pts):
    """Os pontos do mundo (N x 3) no quadro (x, y em px) e a distância até a câmera."""
    C = np.asarray(cam[:3], np.float32)
    T = np.asarray(cam[3:6], np.float32)
    f = cam[6]
    fw = T - C
    fw /= np.linalg.norm(fw)
    rt = np.cross(fw, [0, 1, 0])
    rt /= np.linalg.norm(rt)
    up = np.cross(rt, fw)
    q = np.asarray(pts, np.float32) - C
    z = q @ fw
    x = W * 0.5 + f * (q @ rt) / z
    y = H * 0.5 - f * (q @ up) / z
    return x, y, z


def tonemap(rgb, exposure=1.0):
    """Filmico pela luminância (guarda o matiz: o vermelho continua vermelho); só o muito claro vai para o branco."""
    x = np.clip(rgb * exposure, 0, None)
    f = lambda v: (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14)
    L = 0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2]
    Lm = f(L)
    yl = x * (Lm / np.maximum(L, 1e-6))[..., None]
    yc = f(x)
    t = np.clip((Lm - 0.55) / 0.45, 0, 1)[..., None]
    y = yl * (1 - t) + yc * t
    # o que passa de 1 num canal vira branco aos poucos (sem estourar o matiz)
    over = np.clip(y.max(-1, keepdims=True) - 1.0, 0, None)
    y = np.clip(y + over * 0.6, 0, 1)
    return y ** (1 / 2.2)

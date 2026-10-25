"""Energia e percussão segundo a segundo nos trechos pedidos (para escolher os pontos de laço)."""
import sys
import numpy as np
SR = 22050


def frames(x, n, hop):
    k = 1 + (len(x) - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(k)[:, None]
    return x[idx]


path = sys.argv[1]
ranges = [tuple(map(float, r.split('-'))) for r in sys.argv[2:]]
x = np.fromfile(path, dtype=np.float32)
n, hop = 2048, 512
F = frames(x, n, hop) * np.hanning(n)
S = np.abs(np.fft.rfft(F, axis=1))
freqs = np.fft.rfftfreq(n, 1 / SR)
t = np.arange(S.shape[0]) * hop / SR
rms = np.sqrt((frames(x, n, hop) ** 2).mean(1))
hflux = np.r_[0, np.maximum(0, np.diff(S[:, freqs >= 3000], axis=0)).sum(1)]
low = S[:, freqs < 150].sum(1)
for a, b in ranges:
    print(f'--- {a}-{b}s')
    for s in np.arange(a, b, 1.0):
        m = (t >= s) & (t < s + 1)
        bar = '#' * int(rms[m].mean() * 120)
        print(f'{s:6.1f}  rms {rms[m].mean():.3f}  perc {hflux[m].mean():5.2f}  grave {low[m].mean():6.1f}  {bar}')

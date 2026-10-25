"""Análise das trilhas enviadas: energia ao longo do tempo, brilho, percussão e andamento."""
import sys
import numpy as np
from scipy import signal

SR = 22050


def load(path):
    return np.fromfile(path, dtype=np.float32)


def frames(x, n, hop):
    k = 1 + (len(x) - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(k)[:, None]
    return x[idx]


def analyze(path):
    x = load(path)
    dur = len(x) / SR
    n, hop = 2048, 512
    F = frames(x, n, hop) * np.hanning(n)
    S = np.abs(np.fft.rfft(F, axis=1))
    freqs = np.fft.rfftfreq(n, 1 / SR)
    t = np.arange(S.shape[0]) * hop / SR
    rms = np.sqrt((frames(x, n, hop) ** 2).mean(1))
    cent = (S * freqs).sum(1) / (S.sum(1) + 1e-9)
    low = S[:, freqs < 150].sum(1)
    mid = S[:, (freqs >= 150) & (freqs < 2000)].sum(1)
    high = S[:, freqs >= 4000].sum(1)
    # fluxo espectral (ataques) e percussão (fluxo nas altas)
    flux = np.maximum(0, np.diff(S, axis=0)).sum(1)
    hflux = np.maximum(0, np.diff(S[:, freqs >= 3000], axis=0)).sum(1)
    print(f'== {path}: {dur:.1f}s, pico {np.abs(x).max():.2f}, rms medio {rms.mean():.3f}')
    # por blocos de 10 s
    for s0 in range(0, int(dur), 10):
        m = (t >= s0) & (t < s0 + 10)
        if not m.any():
            continue
        mm = m[1:]
        print(f'  {s0:3d}-{s0+10:3d}s  rms {rms[m].mean():.3f}  brilho {cent[m].mean():6.0f}Hz  grave {low[m].mean():6.1f}  medio {mid[m].mean():6.1f}  agudo {high[m].mean():6.2f}  ataques {flux[mm].mean():6.1f}  perc {hflux[mm].mean():5.2f}')
    # andamento: autocorrelação do fluxo (60-180 bpm)
    o = flux - signal.medfilt(flux, 31)
    o = np.maximum(o, 0)
    fps = SR / hop
    ac = np.correlate(o, o, 'full')[len(o) - 1:]
    lags = np.arange(len(ac)) / fps
    best = []
    for bpm in np.arange(50, 181, 0.5):
        lag = 60 / bpm * fps
        i = int(round(lag))
        if i + 1 >= len(ac):
            continue
        best.append((ac[i] + 0.5 * ac[2 * i] if 2 * i < len(ac) else ac[i], bpm))
    best.sort(reverse=True)
    print('  andamentos prováveis:', ', '.join(f'{b:.1f}' for _, b in best[:6]))
    # começo e fim: onde a energia passa de 20% do rms mediano
    med = np.median(rms)
    on = np.nonzero(rms > med * 0.25)[0]
    print(f'  som começa em {t[on[0]]:.2f}s, termina em {t[on[-1]]:.2f}s (mediana rms {med:.3f})')
    np.save(path + '.env.npy', np.stack([t, rms, cent]))


if __name__ == '__main__':
    for p in sys.argv[1:]:
        analyze(p)

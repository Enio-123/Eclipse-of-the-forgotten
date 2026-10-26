"""Animações mais fluidas para todos os bonecos: poses de passagem entre as poses-chave.

Cada animação ganha m-1 poses entre cada duas (numa curva suave, Catmull-Rom) e o ritmo sobe m vezes,
então as poses-chave continuam caindo no mesmo instante e a animação dura o mesmo:
- nos laços a curva fecha (a última pose volta para a primeira sem tranco);
- nas que param, a última pose segura o tempo que segurava antes (vai em 'holds' no atlas e o jogo
  estica o último quadro), para quem espera o fim da animação não ver nada adiantado.
Golpes rápidos (já acima do ritmo alvo) ficam como estão: o estalo do golpe é de propósito.
O que não é medida (lado da arma, brilho ligado, a pose de morte) troca de uma vez no meio do caminho.
"""


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _cr(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3)


def _pos(v, b, c):
    # a curva passa um pouco das chaves (é o que dá o embalo), mas o que nas duas chaves é zero ou mais
    # (comprimento de corrente, brilho, escala) não fica negativo no meio do caminho
    return max(0.0, v) if b >= 0 and c >= 0 else v


def _blend(a, b, c, d, t):
    if isinstance(b, dict) and isinstance(c, dict):
        out = {}
        for k in set(b) | set(c):
            if k in b and k in c:
                aa = a.get(k, b[k]) if isinstance(a, dict) else b[k]
                dd = d.get(k, c[k]) if isinstance(d, dict) else c[k]
                out[k] = _blend(aa, b[k], c[k], dd, t)
            elif k in b:
                if t < 0.5:
                    out[k] = b[k]
            elif t >= 0.5:
                out[k] = c[k]
        return out
    if all(_num(v) for v in (a, b, c, d)):
        # números inteiros que mudam de sinal ou de valor de uma vez (lado, camada) trocam no meio
        if isinstance(b, int) and isinstance(c, int) and b != c and abs(b) <= 1 and abs(c) <= 1:
            return b if t < 0.5 else c
        return _pos(_cr(a, b, c, d, t), b, c)
    if all(isinstance(v, tuple) and len(v) == len(b) and all(_num(q) for q in v) for v in (a, b, c, d)):
        return tuple(_pos(_cr(a[i], b[i], c[i], d[i], t), b[i], c[i]) for i in range(len(b)))
    return b if t < 0.5 else c


def _full(mod, pose):
    base = getattr(mod, 'DEFAULT', None)
    if isinstance(base, dict) and isinstance(pose, dict):
        p = dict(base)
        p.update(pose)
        return p
    return pose


def densify(anims, mod=None, loop_fps=16, once_fps=20, cap=4, skip=()):
    """Devolve (anims, holds): as animações com as poses de passagem e, para as que param, quanto o
    último quadro precisa segurar a mais (segundos) para durar o mesmo que antes."""
    out = {}
    holds = {}
    for name, (poses, fps, loop) in anims.items():
        n = len(poses)
        target = loop_fps if loop else once_fps
        m = max(1, min(cap, round(target / fps))) if fps > 0 else 1
        if name in skip or n < 2 or m <= 1 or not all(isinstance(p, dict) for p in poses):
            out[name] = (poses, fps, loop)
            continue
        K = [_full(mod, p) for p in poses]
        frames = []
        if loop:
            for i in range(n):
                p0, p1, p2, p3 = K[i - 1], K[i], K[(i + 1) % n], K[(i + 2) % n]
                for j in range(m):
                    frames.append(dict(p1) if j == 0 else _blend(p0, p1, p2, p3, j / m))
        else:
            for i in range(n - 1):
                p0 = K[i - 1] if i > 0 else K[i]
                p1, p2 = K[i], K[i + 1]
                # depois da última chave a curva chega parada
                p3 = K[i + 2] if i + 2 < n else K[i + 1]
                for j in range(m):
                    frames.append(dict(p1) if j == 0 else _blend(p0, p1, p2, p3, j / m))
            frames.append(dict(K[-1]))
            holds[name] = round((m - 1) / (fps * m), 4)
        out[name] = (frames, round(fps * m, 4), loop)
    return out, holds

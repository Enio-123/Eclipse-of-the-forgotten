// Paredes falsas ('%') e vitrais quebráveis ('V'). Cada grupo de células ligadas cai junto.
// O véu é o que fica escondido atrás do grupo: as células abertas que só se alcançam
// quebrando. Fica coberto de pedra (no jogo e no mapa) até o grupo cair.
// A mesma conta é feita em ferramentas/rooms.py para pintar a pedra do véu.
export interface Breakable {
  // wall:<sala>:<x>:<y> da primeira célula do grupo (de cima para baixo, da esquerda para a direita)
  id: string;
  ch: '%' | 'V';
  cells: [number, number][];
  veil: [number, number][];
  // retângulo em tiles que cobre o grupo e o véu
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const BREAK = '%V';

export function findBreakables(room: string, rows: string[]): Breakable[] {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const ch = (x: number, y: number) => rows[y]?.[x] ?? '.';
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  // por onde se anda com tudo fechado (grades contam como abertas: um dia abrem)
  const open = (x: number, y: number) => inside(x, y) && !'#+%V'.includes(ch(x, y));
  const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const groups: { ch: '%' | 'V'; cells: [number, number][] }[] = [];
  const taken = new Set<number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = ch(x, y);
      if (!BREAK.includes(c) || taken.has(y * w + x)) continue;
      const cells: [number, number][] = [];
      const q: [number, number][] = [[x, y]];
      taken.add(y * w + x);
      while (q.length) {
        const [cx, cy] = q.pop()!;
        cells.push([cx, cy]);
        for (const [dx, dy] of N4) {
          const nx = cx + dx, ny = cy + dy;
          if (!inside(nx, ny) || ch(nx, ny) !== c || taken.has(ny * w + nx)) continue;
          taken.add(ny * w + nx);
          q.push([nx, ny]);
        }
      }
      cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      groups.push({ ch: c as '%' | 'V', cells });
    }
  }
  if (!groups.length) return [];

  // a área principal: tudo que se alcança da entrada 1 (ou da primeira porta) sem quebrar nada
  let seed: [number, number] | null = null;
  for (const k of ['1', 'O', 'P']) {
    for (let y = 0; y < h && !seed; y++) for (let x = 0; x < w && !seed; x++) if (ch(x, y) === k) seed = [x, y];
    if (seed) break;
  }
  const main = new Set<number>();
  if (seed) {
    const q = [seed];
    main.add(seed[1] * w + seed[0]);
    while (q.length) {
      const [cx, cy] = q.pop()!;
      for (const [dx, dy] of N4) {
        const nx = cx + dx, ny = cy + dy;
        if (!open(nx, ny) || main.has(ny * w + nx)) continue;
        main.add(ny * w + nx);
        q.push([nx, ny]);
      }
    }
  }

  return groups.map((g) => {
    const veil: [number, number][] = [];
    const seen = new Set<number>();
    for (const [gx, gy] of g.cells) {
      for (const [dx, dy] of N4) {
        const sx = gx + dx, sy = gy + dy;
        const k = sy * w + sx;
        if (!open(sx, sy) || main.has(k) || seen.has(k)) continue;
        seen.add(k);
        const q: [number, number][] = [[sx, sy]];
        while (q.length) {
          const [cx, cy] = q.pop()!;
          veil.push([cx, cy]);
          for (const [ex, ey] of N4) {
            const nx = cx + ex, ny = cy + ey;
            const nk = ny * w + nx;
            if (!open(nx, ny) || main.has(nk) || seen.has(nk)) continue;
            seen.add(nk);
            q.push([nx, ny]);
          }
        }
      }
    }
    const all = [...g.cells, ...veil];
    const xs = all.map((c) => c[0]);
    const ys = all.map((c) => c[1]);
    const [fx, fy] = g.cells[0];
    return {
      id: `wall:${room}:${fx}:${fy}`,
      ch: g.ch,
      cells: g.cells,
      veil,
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      x1: Math.max(...xs),
      y1: Math.max(...ys),
    };
  });
}

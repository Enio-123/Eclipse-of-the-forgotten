import { TILE } from '../config';
import { progress } from '../systems/Save';
import { MAP_POS, ROOMS, type Exit, type RoomId, type Side } from '../world/rooms';
import { findBreakables } from '../world/secrets';
import { REGIONS, regionOf, surveyorRegion, type RegionDef } from '../world/regions';

// O mapa do Agrimensor: folhas de couro escuro com a tinta clara. Cada região comprada aparece a lápis
// (as salas que ele desenhou) e o que o cavaleiro já pisou fica passado a tinta, com a aguada da região.
// Cada sala é pintada uma vez numa folha guardada (B pixels por tile) e o mapa só arrasta e amplia as
// folhas; marcas, nomes e o cavaleiro são desenhados por cima em tamanho fixo.

// células de visita (4x4 tiles, como o jogo grava)
const CELL = 4;
// pixels por tile nas folhas guardadas e as tiles de margem em volta (a passagem das saídas
// continua um pouco para fora, até encontrar a da sala vizinha)
const B = 4;
const PAD = 3;
// zoom (pixels de tela por tile)
const S_MIN = 0.2;
const S_MAX = 9;
const S_START = 3.2;

const INK: [number, number, number] = [240, 228, 200];
const PENCIL: [number, number, number] = [205, 188, 156];
const GOLD = '#d6a24a';

export interface MapHere {
  room: RoomId;
  x: number;
  y: number;
  facing?: 1 | -1;
}

interface Marker {
  kind: string;
  x: number;
  y: number;
  on: boolean;
}

interface RoomArt {
  id: RoomId;
  region: RegionDef;
  ox: number;
  oy: number;
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
  seen: boolean;
}

const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ---------- a folha de cada sala ----------
const arts = new Map<string, RoomArt>();

function roomGrid(id: RoomId) {
  const def = ROOMS[id];
  const rows = def.map;
  const H = rows.length;
  const W = rows[0].length;
  const beads = progress.on('beads');
  const hidden = new Set<number>();
  const secret = new Set<number>();
  // paredes falsas e vitrais de pé contam como pedra, e o que está atrás deles não aparece
  // (com as Contas da Irmã, os esconderijos aparecem brilhando)
  for (const b of findBreakables(id, rows)) {
    if (progress.seen.has(b.id)) continue;
    for (const [x, y] of b.cells) hidden.add(y * W + x);
    for (const [x, y] of b.veil) (beads ? secret : hidden).add(y * W + x);
    if (beads) for (const [x, y] of b.cells) secret.add(y * W + x);
  }
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const ch = (x: number, y: number) => (!inside(x, y) || hidden.has(y * W + x) ? '#' : rows[y][x]);
  const openCh = (c: string) => c !== '#' && c !== '%' && c !== 'V';
  const exits = def.exits;
  const leaves = (e: Exit, side: Side, v: number) => e.side === side && (!e.range || (v >= e.range[0] && v <= e.range[1]));
  // fora da sala, pelas bordas com saída, o mapa continua aberto
  const outside = (x: number, y: number) =>
    (x < 0 && y >= 0 && y < H && exits.some((e) => leaves(e, 'left', y))) ||
    (x >= W && y >= 0 && y < H && exits.some((e) => leaves(e, 'right', y))) ||
    (y < 0 && x >= 0 && x < W && (exits.some((e) => leaves(e, 'up', x)) || openCh(ch(x, 0)))) ||
    (y >= H && x >= 0 && x < W && exits.some((e) => leaves(e, 'down', x)));
  const open = (x: number, y: number) => (inside(x, y) ? openCh(ch(x, y)) : outside(x, y));
  return { rows, W, H, ch, open, hidden, secret, key: `${beads ? 1 : 0}:${[...hidden].length}` };
}

function seenOf(id: RoomId, W: number, H: number) {
  const set = progress.visited.get(id) ?? new Set<number>();
  const cw = Math.ceil(W / CELL);
  const chh = Math.ceil(H / CELL);
  // fora da sala (na passagem de uma saída) vale a célula de dentro mais perto
  return {
    set,
    at: (x: number, y: number) => set.has(Math.max(0, Math.min(chh - 1, Math.floor(y / CELL))) * cw + Math.max(0, Math.min(cw - 1, Math.floor(x / CELL)))),
  };
}

// distância (em pixels) de cada ponto até o mais perto em que on[i] vale 1 (chanfro 1 / 1,41)
function distance(on: Uint8Array, W: number, H: number) {
  const BIG = 1e6;
  const d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = on[i] ? 0 : BIG;
  const D = Math.SQRT2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - W] + 1);
        if (x > 0) v = Math.min(v, d[i - W - 1] + D);
        if (x < W - 1) v = Math.min(v, d[i - W + 1] + D);
      }
      d[i] = v;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < H - 1) {
        v = Math.min(v, d[i + W] + 1);
        if (x < W - 1) v = Math.min(v, d[i + W + 1] + D);
        if (x > 0) v = Math.min(v, d[i + W - 1] + D);
      }
      d[i] = v;
    }
  }
  return d;
}

// cantos arredondados: média numa janela e corte na metade (o contorno sai como desenhado à mão)
function smooth(m: Uint8Array, W: number, H: number, r: number) {
  const tmp = new Float32Array(W * H);
  const out = new Uint8Array(W * H);
  const n = r * 2 + 1;
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += m[y * W + Math.max(0, Math.min(W - 1, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / n;
      acc += m[y * W + Math.min(W - 1, x + r + 1)] - m[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.max(0, Math.min(H - 1, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / n >= 0.5 ? 1 : 0;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}

function paintRoom(id: RoomId, region: RegionDef): RoomArt {
  const g = roomGrid(id);
  const { W, H } = g;
  const seen = seenOf(id, W, H);
  const pos = MAP_POS[id]!;
  const key = `${id}|${seen.set.size}|${g.key}`;
  const old = arts.get(id);
  if (old && old.canvas.dataset.key === key) return old;
  const TW = W + PAD * 2;
  const TH = H + PAD * 2;
  const PW = TW * B;
  const PH = TH * B;
  // tiles abertas (a lápis) e abertas e vistas (a tinta)
  const all = new Uint8Array(PW * PH);
  const ink = new Uint8Array(PW * PH);
  let any = false;
  for (let ty = 0; ty < TH; ty++) {
    for (let tx = 0; tx < TW; tx++) {
      const x = tx - PAD;
      const y = ty - PAD;
      if (!g.open(x, y)) continue;
      const s = seen.at(x, y);
      if (s) any = true;
      for (let py = ty * B; py < ty * B + B; py++) {
        const row = py * PW;
        for (let px = tx * B; px < tx * B + B; px++) {
          all[row + px] = 1;
          if (s) ink[row + px] = 1;
        }
      }
    }
  }
  const A = smooth(all, PW, PH, 2);
  const K = smooth(ink, PW, PH, 2);
  const notA = new Uint8Array(PW * PH);
  const notK = new Uint8Array(PW * PH);
  for (let i = 0; i < A.length; i++) {
    notA[i] = A[i] ? 0 : 1;
    notK[i] = K[i] ? 0 : 1;
  }
  const aOut = distance(A, PW, PH);
  const kOut = distance(K, PW, PH);
  const kIn = distance(notK, PW, PH);
  const wash = hexRgb(region.wash);
  const cv = document.createElement('canvas');
  cv.width = PW;
  cv.height = PH;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(PW, PH);
  const px = img.data;
  // "por cima" com alfa (a cor nova sobre a que já está)
  const over = (i: number, c: [number, number, number], a: number) => {
    if (a <= 0) return;
    const o = i * 4;
    const da = px[o + 3] / 255;
    const na = a + da * (1 - a);
    for (let k = 0; k < 3; k++) px[o + k] = (c[k] * a + px[o + k] * da * (1 - a)) / Math.max(na, 1e-5);
    px[o + 3] = na * 255;
  };
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const i = y * PW + x;
      // a lápis: o que o Agrimensor desenhou (aguada fraquinha e o traço cinza)
      if (A[i]) over(i, wash, 0.07);
      else if (aOut[i] <= 1.2) over(i, PENCIL, 0.3 * Math.min(1, 2.2 - aOut[i]));
      // a tinta: o que ele já pisou (a aguada escurece perto da parede, o traço claro e o hachurado
      // do lado de fora, como nas gravuras)
      if (K[i]) over(i, wash, 0.24 + 0.32 * Math.max(0, 1 - kIn[i] / 5));
      else if (kOut[i] <= 1.6) over(i, INK, 0.95 * Math.min(1, 2.4 - kOut[i]));
      else if (kOut[i] <= 6.5 && (x - y + 4096) % 4 === 0) over(i, INK, 0.26 * (1 - (kOut[i] - 1.6) / 4.9));
    }
  }
  ctx.putImageData(img, 0, 0);
  // plataformas finas, espinhos, água, grades e esconderijos (só no que ele viu)
  const def = ROOMS[id];
  const lockCols = [...new Set(g.rows.flatMap((row) => [...row].map((c, x) => (c === 'Y' ? x : -1)).filter((x) => x >= 0)))].sort((a, b) => a - b);
  const lockKey = (x: number) => def.locks?.[lockCols.indexOf(x)] ?? 'never';
  const at = (x: number, y: number) => ({ x: (x + PAD) * B, y: (y + PAD) * B });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!seen.at(x, y)) continue;
      const c = g.ch(x, y);
      const p = at(x, y);
      if (c === '-' || c === '"') {
        ctx.fillStyle = 'rgba(240, 228, 200, 0.75)';
        ctx.fillRect(p.x, p.y, B, 1.2);
      } else if (c === '^') {
        ctx.fillStyle = 'rgba(196, 92, 78, 0.85)';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + B);
        ctx.lineTo(p.x + B * 0.25, p.y + B * 0.45);
        ctx.lineTo(p.x + B * 0.5, p.y + B);
        ctx.lineTo(p.x + B * 0.75, p.y + B * 0.45);
        ctx.lineTo(p.x + B, p.y + B);
        ctx.fill();
      } else if (c === '~') {
        ctx.fillStyle = 'rgba(112, 166, 220, 0.38)';
        ctx.fillRect(p.x, p.y, B, B);
        if (g.ch(x, y - 1) !== '~') {
          ctx.fillStyle = 'rgba(190, 220, 245, 0.7)';
          ctx.fillRect(p.x, p.y, B, 0.8);
        }
      } else if (c === '|' || c === 'Y') {
        const shut = c === 'Y' ? !progress.seen.has(lockKey(x)) : id === 'catacumbas' ? !progress.seen.has('memory:vale') : false;
        if (shut) {
          ctx.fillStyle = 'rgba(240, 228, 200, 0.8)';
          ctx.fillRect(p.x + B * 0.35, p.y, B * 0.3, B);
        }
      }
      if (g.secret.has(y * W + x)) {
        ctx.fillStyle = 'rgba(214, 162, 74, 0.32)';
        ctx.fillRect(p.x, p.y, B, B);
      }
    }
  }
  cv.dataset.key = key;
  const art: RoomArt = { id, region, ox: pos.x, oy: pos.y, w: W, h: H, canvas: cv, seen: any };
  arts.set(id, art);
  return art;
}

// marcas da sala (em tiles do mundo); o que está atrás de parede falsa só aparece com as contas
function roomMarkers(id: RoomId): Marker[] {
  const out: Marker[] = [];
  const g = roomGrid(id);
  const seen = seenOf(id, g.W, g.H);
  const def = ROOMS[id];
  const pos = MAP_POS[id]!;
  let ri = 0;
  let mi = 0;
  let bi = 0;
  for (let y = 0; y < g.H; y++) {
    for (let x = 0; x < g.W; x++) {
      const c = g.rows[y][x];
      if (!'RKJUw>{<mXMOBNb'.includes(c)) continue;
      const idx = c === 'R' ? ri++ : c === 'm' ? mi++ : c === 'b' ? bi++ : 0;
      if (!seen.at(x, y) || g.hidden.has(y * g.W + x)) continue;
      const p = { x: pos.x + x + 0.5, y: pos.y + y + 0.5 };
      if (c === 'R') out.push({ kind: 'rest', ...p, on: progress.seen.has(`rest:${id}:${idx}`) });
      else if (c === 'K') out.push({ kind: 'cobrador', ...p, on: true });
      else if (c === '>' && !progress.abilities.has('dash')) out.push({ kind: 'relic', ...p, on: true });
      else if (c === '{' && !progress.abilities.has('cape')) out.push({ kind: 'relic', ...p, on: true });
      else if (c === '<' && !progress.abilities.has('swim')) out.push({ kind: 'relic', ...p, on: true });
      else if (c === 'J' && !progress.abilities.has('wall')) out.push({ kind: 'relic', ...p, on: true });
      else if (c === 'U' && !progress.abilities.has('double')) out.push({ kind: 'relic', ...p, on: true });
      else if (c === 'w' && !progress.abilities.has('hook')) out.push({ kind: 'relic', ...p, on: true });
      else if (c === 'm' && !progress.memories.has(`${id}:${idx}`)) out.push({ kind: 'memory', ...p, on: true });
      else if (c === 'X' && def.boss && !progress.seen.has(`boss:${def.boss}`)) out.push({ kind: 'boss', ...p, on: true });
      else if (c === 'M') out.push({ kind: 'mirror', ...p, on: true });
      else if (c === 'O') out.push({ kind: 'door', ...p, on: true });
      else if (c === 'B') out.push({ kind: 'forge', ...p, on: true });
      else if (c === 'N') out.push({ kind: 'nun', ...p, on: true });
      else if (c === 'b') out.push({ kind: 'bell', ...p, on: !progress.seen.has(`bell:${id}:${idx}`) });
    }
  }
  // o Agrimensor, onde ele espera agora (se o cavaleiro já passou por aquele canto)
  const sv = surveyorRegion(null, (r) => (progress.visited.get(r)?.size ?? 0) > 0)?.surveyor;
  if (sv && sv.room === id && seen.at(sv.x, sv.y)) out.push({ kind: 'surveyor', x: pos.x + sv.x + 0.5, y: pos.y + sv.y - 0.6, on: true });
  return out;
}

// a folha de uma região em miniatura, para a banca do Agrimensor: as salas na aguada da região, mais
// forte no que o cavaleiro já pisou
export function regionThumb(def: RegionDef, w: number, h: number, dpr = 1): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const ids = def.rooms.filter((id) => MAP_POS[id]);
  if (!ids.length) return cv;
  const box = ids.map((id) => ({ id, pos: MAP_POS[id]!, W: ROOMS[id].map[0].length, H: ROOMS[id].map.length }));
  const x0 = Math.min(...box.map((b) => b.pos.x));
  const y0 = Math.min(...box.map((b) => b.pos.y));
  const x1 = Math.max(...box.map((b) => b.pos.x + b.W));
  const y1 = Math.max(...box.map((b) => b.pos.y + b.H));
  const s = Math.min((w - 10) / (x1 - x0), (h - 10) / (y1 - y0));
  const ox = (w - (x1 - x0) * s) / 2 - x0 * s;
  const oy = (h - (y1 - y0) * s) / 2 - y0 * s;
  const [r, g, b] = hexRgb(def.wash);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (const bx of box) {
    const grid = roomGrid(bx.id);
    const seen = seenOf(bx.id, grid.W, grid.H);
    const tile = document.createElement('canvas');
    tile.width = grid.W;
    tile.height = grid.H;
    const tc = tile.getContext('2d')!;
    const img = tc.createImageData(grid.W, grid.H);
    for (let y = 0; y < grid.H; y++) {
      for (let x = 0; x < grid.W; x++) {
        if (!grid.open(x, y)) continue;
        const o = (y * grid.W + x) * 4;
        const lit = seen.at(x, y);
        img.data[o] = lit ? Math.min(255, r + 60) : r;
        img.data[o + 1] = lit ? Math.min(255, g + 52) : g;
        img.data[o + 2] = lit ? Math.min(255, b + 40) : b;
        img.data[o + 3] = lit ? 235 : 120;
      }
    }
    tc.putImageData(img, 0, 0);
    ctx.drawImage(tile, ox + bx.pos.x * s, oy + bx.pos.y * s, grid.W * s, grid.H * s);
  }
  return cv;
}

// ---------- o couro ----------
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makePaper(w: number, h: number, dpr: number) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  const c = cv.getContext('2d')!;
  c.scale(dpr, dpr);
  const rnd = seeded(7);
  const g = c.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
  g.addColorStop(0, '#30261c');
  g.addColorStop(0.6, '#241c15');
  g.addColorStop(1, '#0f0c09');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // manchas grandes e macias (o couro curtido não tem cor igual)
  const nz = document.createElement('canvas');
  nz.width = 18;
  nz.height = 11;
  const nc = nz.getContext('2d')!;
  const id = nc.createImageData(18, 11);
  for (let i = 0; i < 18 * 11; i++) {
    const v = rnd();
    id.data[i * 4] = v > 0.5 ? 255 : 0;
    id.data[i * 4 + 1] = v > 0.5 ? 222 : 0;
    id.data[i * 4 + 2] = v > 0.5 ? 170 : 0;
    id.data[i * 4 + 3] = Math.abs(v - 0.5) * 2 * 13;
  }
  nc.putImageData(id, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(nz, 0, 0, w, h);
  // grão fino
  const gr = document.createElement('canvas');
  gr.width = gr.height = 128;
  const gc = gr.getContext('2d')!;
  const gd = gc.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const v = rnd();
    gd.data[i * 4] = gd.data[i * 4 + 1] = gd.data[i * 4 + 2] = v > 0.5 ? 255 : 0;
    gd.data[i * 4 + 3] = Math.abs(v - 0.5) * 2 * 9;
  }
  gc.putImageData(gd, 0, 0);
  const pat = c.createPattern(gr, 'repeat');
  if (pat) {
    c.fillStyle = pat;
    c.fillRect(0, 0, w, h);
  }
  // fibras e duas manchas de mão (dedos sujos de tinta)
  c.lineWidth = 0.6;
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const a = rnd() * Math.PI;
    const L = 6 + rnd() * 22;
    c.strokeStyle = `rgba(255, 228, 186, ${0.02 + rnd() * 0.04})`;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + (rnd() - 0.5) * 4, y + Math.sin(a) * L * 0.5 + (rnd() - 0.5) * 4, x + Math.cos(a) * L, y + Math.sin(a) * L);
    c.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 18 + rnd() * 40;
    const sg = c.createRadialGradient(x, y, r * 0.7, x, y, r);
    sg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    sg.addColorStop(0.85, 'rgba(0, 0, 0, 0.12)');
    sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = sg;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // a moldura de dois fios
  c.strokeStyle = 'rgba(214, 162, 74, 0.32)';
  c.lineWidth = 1;
  c.strokeRect(7.5, 7.5, w - 15, h - 15);
  c.strokeStyle = 'rgba(214, 162, 74, 0.18)';
  c.strokeRect(11.5, 11.5, w - 23, h - 23);
  return cv;
}

// a rosa dos ventos no canto
function compass(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.save();
  c.translate(x, y);
  c.strokeStyle = 'rgba(214, 162, 74, 0.5)';
  c.lineWidth = 0.8;
  c.beginPath();
  c.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  c.stroke();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 - Math.PI / 2;
    const L = k % 2 ? r * 0.55 : r;
    const s = k % 2 ? r * 0.1 : r * 0.16;
    c.fillStyle = k % 2 ? 'rgba(214, 162, 74, 0.35)' : 'rgba(214, 162, 74, 0.6)';
    c.beginPath();
    c.moveTo(Math.cos(a) * L, Math.sin(a) * L);
    c.lineTo(Math.cos(a + Math.PI / 2) * s, Math.sin(a + Math.PI / 2) * s);
    c.lineTo(0, 0);
    c.lineTo(Math.cos(a - Math.PI / 2) * s, Math.sin(a - Math.PI / 2) * s);
    c.closePath();
    c.fill();
  }
  c.fillStyle = 'rgba(240, 228, 200, 0.7)';
  c.font = `${Math.round(r * 0.5)}px "IM Fell English SC", Georgia, serif`;
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.fillText('N', 0, -r - 2);
  c.restore();
}

// o cavaleiro no mapa: o capuz vermelho e a máscara de porcelana com a rachadura de ouro, olhando
// para onde ele estava virado
export function drawKnight(c: CanvasRenderingContext2D, x: number, y: number, k: number, facing: 1 | -1 = 1) {
  c.save();
  c.translate(x, y);
  c.scale(facing * k, k);
  // sombra macia em volta para destacar do mapa
  c.shadowColor = 'rgba(0, 0, 0, 0.75)';
  c.shadowBlur = 4;
  // capuz: gota com a ponta para trás
  c.fillStyle = '#8a1a24';
  c.beginPath();
  c.moveTo(-1.15, 0.2);
  c.bezierCurveTo(-1.25, -0.75, -0.55, -1.2, 0.1, -1.15);
  c.bezierCurveTo(0.85, -1.1, 1.05, -0.45, 1.0, 0.25);
  c.bezierCurveTo(0.95, 0.85, 0.45, 1.05, -0.05, 1.05);
  c.bezierCurveTo(-0.5, 1.05, -0.8, 0.85, -0.95, 0.6);
  c.lineTo(-1.6, 0.95);
  c.closePath();
  c.fill();
  c.shadowBlur = 0;
  // borda clara do capuz
  c.strokeStyle = '#d0353c';
  c.lineWidth = 0.12;
  c.stroke();
  // rosto escuro e a máscara
  c.fillStyle = '#120c10';
  c.beginPath();
  c.ellipse(0.28, 0.05, 0.6, 0.72, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#f2ede2';
  c.beginPath();
  c.ellipse(0.38, 0.08, 0.48, 0.62, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#1a1416';
  c.beginPath();
  c.ellipse(0.62, -0.05, 0.13, 0.09, 0.2, 0, Math.PI * 2);
  c.ellipse(0.2, -0.05, 0.11, 0.08, -0.2, 0, Math.PI * 2);
  c.fill();
  // a rachadura de ouro
  c.strokeStyle = GOLD;
  c.lineWidth = 0.09;
  c.beginPath();
  c.moveTo(0.48, -0.5);
  c.lineTo(0.38, -0.22);
  c.lineTo(0.46, 0.05);
  c.lineTo(0.34, 0.32);
  c.lineTo(0.42, 0.6);
  c.stroke();
  c.restore();
}

export function drawMarker(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, k: number, on = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 1.2;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 3;
  switch (kind) {
    case 'rest':
      // vela: chama em gota sobre um tico de cera
      ctx.fillStyle = on ? GOLD : 'rgba(240, 228, 200, 0.5)';
      ctx.beginPath();
      ctx.moveTo(0, -k * 1.2);
      ctx.quadraticCurveTo(k * 0.6, -k * 0.2, 0, k * 0.15);
      ctx.quadraticCurveTo(-k * 0.6, -k * 0.2, 0, -k * 1.2);
      ctx.fill();
      ctx.fillRect(-k * 0.3, k * 0.2, k * 0.6, k * 0.8);
      break;
    case 'cobrador':
      ctx.strokeStyle = GOLD;
      ctx.beginPath();
      ctx.arc(0, 0, k * 0.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.fillRect(-k * 0.15, -k * 0.45, k * 0.3, k * 0.9);
      break;
    case 'surveyor': {
      // o Agrimensor: o compasso de pontas abertas
      ctx.strokeStyle = '#f0e4c8';
      ctx.lineWidth = Math.max(1.2, k * 0.22);
      ctx.beginPath();
      ctx.moveTo(-k * 0.6, k * 0.9);
      ctx.lineTo(0, -k * 0.8);
      ctx.lineTo(k * 0.6, k * 0.9);
      ctx.moveTo(-k * 0.38, k * 0.3);
      ctx.quadraticCurveTo(0, k * 0.5, k * 0.38, k * 0.3);
      ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(0, -k * 0.85, k * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'relic':
      ctx.fillStyle = '#f2ede2';
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-k * 0.5, -k * 0.5, k, k);
      break;
    case 'memory':
      ctx.fillStyle = '#ffe2a0';
      ctx.beginPath();
      ctx.arc(0, 0, k * 0.42, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'boss':
      // sino
      ctx.fillStyle = '#c4584e';
      ctx.beginPath();
      ctx.moveTo(-k * 0.9, k * 0.7);
      ctx.quadraticCurveTo(-k * 0.7, -k * 1.0, 0, -k * 1.0);
      ctx.quadraticCurveTo(k * 0.7, -k * 1.0, k * 0.9, k * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-k * 0.2, k * 0.7, k * 0.4, k * 0.35);
      break;
    case 'door':
      // arco de porta
      ctx.strokeStyle = 'rgba(240, 228, 200, 0.9)';
      ctx.beginPath();
      ctx.moveTo(-k * 0.5, k * 0.8);
      ctx.lineTo(-k * 0.5, -k * 0.1);
      ctx.arc(0, -k * 0.1, k * 0.5, Math.PI, 0);
      ctx.lineTo(k * 0.5, k * 0.8);
      ctx.stroke();
      break;
    case 'forge':
      // bigorna
      ctx.fillStyle = GOLD;
      ctx.fillRect(-k * 0.8, -k * 0.45, k * 1.6, k * 0.4);
      ctx.fillRect(-k * 0.3, -k * 0.05, k * 0.6, k * 0.5);
      ctx.fillRect(-k * 0.6, k * 0.45, k * 1.2, k * 0.3);
      break;
    case 'nun':
      // cruz pequena
      ctx.fillStyle = '#f2ede2';
      ctx.fillRect(-k * 0.12, -k * 0.8, k * 0.24, k * 1.6);
      ctx.fillRect(-k * 0.5, -k * 0.4, k, k * 0.22);
      break;
    case 'bell':
      ctx.fillStyle = on ? GOLD : 'rgba(240, 228, 200, 0.4)';
      ctx.beginPath();
      ctx.moveTo(-k * 0.6, k * 0.5);
      ctx.quadraticCurveTo(-k * 0.5, -k * 0.7, 0, -k * 0.7);
      ctx.quadraticCurveTo(k * 0.5, -k * 0.7, k * 0.6, k * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'mirror':
      ctx.strokeStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(-k * 0.6, k * 0.9);
      ctx.lineTo(-k * 0.6, -k * 0.3);
      ctx.arc(0, -k * 0.3, k * 0.6, Math.PI, 0);
      ctx.lineTo(k * 0.6, k * 0.9);
      ctx.stroke();
      break;
    case 'echo':
      // gota escura com a máscara pequena
      ctx.fillStyle = '#7029b8';
      ctx.beginPath();
      ctx.moveTo(0, -k * 1.15);
      ctx.bezierCurveTo(k * 0.75, -k * 0.2, k * 0.75, k * 0.8, 0, k * 0.8);
      ctx.bezierCurveTo(-k * 0.75, k * 0.8, -k * 0.75, -k * 0.2, 0, -k * 1.15);
      ctx.fill();
      ctx.strokeStyle = '#d8b7ff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#efe6ff';
      ctx.beginPath();
      ctx.ellipse(0, k * 0.2, k * 0.28, k * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'you':
      ctx.shadowBlur = 0;
      drawKnight(ctx, 0, 0, k * 0.9, 1);
      break;
  }
  ctx.restore();
}

// ---------- a vista do mapa (arrastar, ampliar, onde estou) ----------
export class MapView {
  readonly rooms: RoomArt[] = [];
  readonly markers: Marker[] = [];
  readonly regions: { def: RegionDef; x0: number; y0: number; x1: number; y1: number }[] = [];
  // a região onde ele está tem folha? (sem ela, nem ele aparece)
  readonly hereMapped: boolean;
  readonly hereRegion: RegionDef | null;
  readonly player: { x: number; y: number };
  cx = 0;
  cy = 0;
  s = S_START;
  private paper: { cv: HTMLCanvasElement; w: number; h: number; dpr: number } | null = null;
  private bounds = { x0: 0, y0: 0, x1: 1, y1: 1 };

  constructor(readonly here: MapHere) {
    this.hereRegion = regionOf(here.room);
    for (const r of REGIONS) {
      if (!progress.maps.has(r.id)) continue;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const id of r.rooms) {
        if (!MAP_POS[id]) continue;
        const art = paintRoom(id, r);
        this.rooms.push(art);
        this.markers.push(...roomMarkers(id));
        x0 = Math.min(x0, art.ox);
        y0 = Math.min(y0, art.oy);
        x1 = Math.max(x1, art.ox + art.w);
        y1 = Math.max(y1, art.oy + art.h);
      }
      if (isFinite(x0)) this.regions.push({ def: r, x0, y0, x1, y1 });
    }
    // a sombra com as moedas perdidas, onde ela espera
    const echo = progress.echo;
    if (echo && this.rooms.some((r) => r.id === echo.room)) {
      const pos = MAP_POS[echo.room]!;
      this.markers.push({ kind: 'echo', x: pos.x + echo.x / TILE, y: pos.y + echo.y / TILE - 1.4, on: true });
    }
    this.hereMapped = !!this.hereRegion && progress.maps.has(this.hereRegion.id) && !!MAP_POS[here.room];
    const pos = MAP_POS[here.room] ?? { x: 0, y: 0 };
    this.player = { x: pos.x + here.x, y: pos.y + here.y };
    if (this.regions.length) {
      this.bounds = {
        x0: Math.min(...this.regions.map((r) => r.x0)),
        y0: Math.min(...this.regions.map((r) => r.y0)),
        x1: Math.max(...this.regions.map((r) => r.x1)),
        y1: Math.max(...this.regions.map((r) => r.y1)),
      };
    }
    this.center();
  }

  get empty() {
    return this.rooms.length === 0;
  }

  // volta para o cavaleiro (ou, sem a folha de onde ele está, para o meio do que tem)
  center() {
    if (this.hereMapped || this.empty) {
      this.cx = this.player.x;
      this.cy = this.player.y;
    } else {
      this.cx = (this.bounds.x0 + this.bounds.x1) / 2;
      this.cy = (this.bounds.y0 + this.bounds.y1) / 2;
    }
    this.s = S_START;
  }

  // o mapa inteiro que ele tem, na tela
  fit(w: number, h: number) {
    const b = this.bounds;
    this.cx = (b.x0 + b.x1) / 2;
    this.cy = (b.y0 + b.y1) / 2;
    this.s = Math.max(S_MIN, Math.min(S_MAX, Math.min((w - 60) / (b.x1 - b.x0), (h - 60) / (b.y1 - b.y0))));
  }

  zoom(f: number, w: number, h: number, sx = w / 2, sy = h / 2) {
    const ns = Math.max(S_MIN, Math.min(S_MAX, this.s * f));
    // o ponto debaixo do cursor fica parado
    const wx = this.cx + (sx - w / 2) / this.s;
    const wy = this.cy + (sy - h / 2) / this.s;
    this.s = ns;
    this.cx = wx - (sx - w / 2) / ns;
    this.cy = wy - (sy - h / 2) / ns;
    this.clamp();
  }

  pan(dx: number, dy: number) {
    this.cx -= dx / this.s;
    this.cy -= dy / this.s;
    this.clamp();
  }

  private clamp() {
    const b = this.bounds;
    const m = 60;
    this.cx = Math.max(Math.min(b.x0, this.player.x) - m, Math.min(Math.max(b.x1, this.player.x) + m, this.cx));
    this.cy = Math.max(Math.min(b.y0, this.player.y) - m, Math.min(Math.max(b.y1, this.player.y) + m, this.cy));
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, t: number) {
    if (!this.paper || this.paper.w !== w || this.paper.h !== h || this.paper.dpr !== dpr) this.paper = { cv: makePaper(w, h, dpr), w, h, dpr };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.paper.cv, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = this.s;
    const offX = w / 2 - this.cx * s;
    const offY = h / 2 - this.cy * s;
    const sx = (x: number) => offX + x * s;
    const sy = (y: number) => offY + y * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(12, 12, w - 24, h - 24);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // as salas
    const k = s / B;
    for (const r of this.rooms) {
      const x = sx(r.ox - PAD);
      const y = sy(r.oy - PAD);
      const cw = r.canvas.width * k;
      const ch = r.canvas.height * k;
      if (x > w || y > h || x + cw < 0 || y + ch < 0) continue;
      ctx.drawImage(r.canvas, x, y, cw, ch);
    }
    // os nomes das regiões (longe) e das salas que ele pisou (perto)
    const fade = (a: number, b: number, v: number) => Math.max(0, Math.min(1, (v - a) / (b - a)));
    const regionA = 1 - fade(1.6, 2.4, s);
    if (regionA > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fs = Math.round(Math.max(12, Math.min(18, 9 + s * 7)));
      ctx.font = `${fs}px "IM Fell English SC", Georgia, serif`;
      // cada nome no meio da região; se bater em outro, tenta acima e abaixo dela
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
      for (const r of this.regions) {
        const tw = ctx.measureText(r.def.name).width;
        const mx = sx((r.x0 + r.x1) / 2);
        const tries = [sy((r.y0 + r.y1) / 2), sy(r.y0) - fs * 0.8, sy(r.y1) + fs * 0.8, sy(r.y0) - fs * 1.9, sy(r.y1) + fs * 1.9];
        let at = tries[0];
        for (const ty of tries) {
          const box = { x0: mx - tw / 2 - 4, y0: ty - fs * 0.6, x1: mx + tw / 2 + 4, y1: ty + fs * 0.6 };
          if (!placed.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0)) {
            at = ty;
            break;
          }
        }
        placed.push({ x0: mx - tw / 2 - 4, y0: at - fs * 0.6, x1: mx + tw / 2 + 4, y1: at + fs * 0.6 });
        // a ponta do nome nunca sai da folha
        const x = Math.max(18 + tw / 2, Math.min(w - 18 - tw / 2, mx));
        ctx.lineWidth = 4;
        ctx.strokeStyle = `rgba(20, 15, 10, ${0.85 * regionA})`;
        ctx.strokeText(r.def.name, x, at);
        ctx.fillStyle = `rgba(240, 228, 200, ${0.85 * regionA})`;
        ctx.fillText(r.def.name, x, at);
      }
    }
    const roomA = fade(2.6, 3.6, s);
    if (roomA > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = `italic ${Math.round(Math.min(14, 9 + s))}px "IM Fell English", Georgia, serif`;
      for (const r of this.rooms) {
        if (!r.seen) continue;
        const x = sx(r.ox + r.w / 2);
        const y = sy(r.oy) - 3;
        if (x < -80 || x > w + 80 || y < 0 || y > h + 20) continue;
        const title = ROOMS[r.id].title;
        ctx.lineWidth = 3;
        ctx.strokeStyle = `rgba(20, 15, 10, ${0.75 * roomA})`;
        ctx.strokeText(title, x, y);
        ctx.fillStyle = `rgba(232, 214, 176, ${0.7 * roomA})`;
        ctx.fillText(title, x, y);
      }
    }
    // as marcas, em tamanho fixo
    const mk = Math.max(3.4, Math.min(6, s * 1.25));
    for (const m of this.markers) {
      const x = sx(m.x);
      const y = sy(m.y);
      if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue;
      drawMarker(ctx, m.kind, x, y, mk, m.on);
    }
    // o cavaleiro: anel dourado pulsando e o capuz com a máscara (se a folha de onde ele está foi comprada)
    if (this.hereMapped) {
      const px = sx(this.player.x);
      const py = sy(this.player.y);
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.005);
      const inside = px > 14 && py > 14 && px < w - 14 && py < h - 14;
      if (inside) {
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 26);
        glow.addColorStop(0, 'rgba(214, 162, 74, 0.35)');
        glow.addColorStop(1, 'rgba(214, 162, 74, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(px - 26, py - 26, 52, 52);
        ctx.strokeStyle = `rgba(214, 162, 74, ${0.45 + pulse * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 11 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
        drawKnight(ctx, px, py, 7.5, this.here.facing ?? 1);
      } else {
        // fora da tela: uma seta na borda apontando para ele
        const cxs = w / 2;
        const cys = h / 2;
        const a = Math.atan2(py - cys, px - cxs);
        const R = Math.min((w / 2 - 26) / Math.abs(Math.cos(a) || 1e-6), (h / 2 - 26) / Math.abs(Math.sin(a) || 1e-6));
        const ex = cxs + Math.cos(a) * R;
        const ey = cys + Math.sin(a) * R;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(a);
        ctx.fillStyle = `rgba(214, 162, 74, ${0.6 + pulse * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-4, -8);
        ctx.lineTo(-1, 0);
        ctx.lineTo(-4, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        drawKnight(ctx, ex - Math.cos(a) * 14, ey - Math.sin(a) * 14, 5.5, this.here.facing ?? 1);
      }
    }
    ctx.restore();
    // perto: a região do meio da tela num rótulo no canto (longe, os nomes ficam no próprio mapa)
    if (regionA < 1 && this.regions.length) {
      const mid = this.regions.find((r) => this.cx >= r.x0 - 20 && this.cx <= r.x1 + 20 && this.cy >= r.y0 - 20 && this.cy <= r.y1 + 20);
      if (mid) {
        ctx.save();
        ctx.globalAlpha = 1 - regionA;
        ctx.font = '17px "IM Fell English SC", Georgia, serif';
        const tw = ctx.measureText(mid.def.name).width;
        ctx.fillStyle = 'rgba(16, 12, 8, 0.72)';
        ctx.fillRect(22, 22, tw + 28, 30);
        ctx.strokeStyle = 'rgba(214, 162, 74, 0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(22.5, 22.5, tw + 27, 29);
        ctx.fillStyle = mid.def.wash;
        ctx.fillRect(30, 34, 6, 6);
        ctx.fillStyle = 'rgba(240, 228, 200, 0.92)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(mid.def.name, 42, 37.5);
        ctx.restore();
      }
    }
    compass(ctx, w - 44, h - 46, 22);
    // sem folha: o aviso
    if (!this.hereMapped) {
      const name = this.hereRegion?.name;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const y = this.empty ? h / 2 - 12 : 44;
      ctx.font = '22px "IM Fell English SC", Georgia, serif';
      ctx.fillStyle = 'rgba(240, 228, 200, 0.85)';
      ctx.fillText(this.empty ? 'Sem mapa' : name ? `Sem a folha de ${name}` : 'Sem mapa daqui', w / 2, y);
      ctx.font = 'italic 15px "IM Fell English", Georgia, serif';
      ctx.fillStyle = 'rgba(214, 196, 160, 0.75)';
      ctx.fillText('O Agrimensor vende o mapa de cada região. Procure por ele pelo caminho.', w / 2, y + 26);
    }
  }
}

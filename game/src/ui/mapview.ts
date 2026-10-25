import { TILE } from '../config';
import { progress } from '../systems/Save';
import { MAP_POS, ROOMS, type Exit, type RoomId, type Side } from '../world/rooms';
import { findBreakables } from '../world/secrets';

const CELL = 4;
const INK = 'rgba(232, 228, 218, 0.78)';
const FLOOR = 'rgba(232, 228, 218, 0.07)';
const HERE_FLOOR = 'rgba(214, 162, 74, 0.1)';
const GOLD = '#d6a24a';

export interface MapHere {
  room: RoomId;
  x: number;
  y: number;
}

// salas que aparecem no mapa, com o pedaço já visto de cada uma
function rooms() {
  const out: { id: RoomId; ox: number; oy: number; seen: Set<number>; cw: number }[] = [];
  for (const id of Object.keys(MAP_POS) as RoomId[]) {
    const seen = progress.visited.get(id);
    if (!seen || !seen.size) continue;
    const pos = MAP_POS[id]!;
    const w = ROOMS[id].map[0].length;
    out.push({ id, ox: pos.x, oy: pos.y, seen, cw: Math.ceil(w / CELL) });
  }
  return out;
}

// Desenha o mapa (só o que o cavaleiro já viu) num canvas fora da tela; devolve como
// converter coordenadas de tile para o desenho, para o marcador do jogador
export function renderMap(cssW: number, cssH: number, dpr: number, here: MapHere) {
  const list = rooms();
  const cv = document.createElement('canvas');
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of list) {
    const rows = ROOMS[r.id].map;
    for (const k of r.seen) {
      const cx = (k % r.cw) * CELL;
      const cy = Math.floor(k / r.cw) * CELL;
      if (cy >= rows.length) continue;
      x0 = Math.min(x0, r.ox + cx);
      y0 = Math.min(y0, r.oy + cy);
      x1 = Math.max(x1, r.ox + cx + CELL);
      y1 = Math.max(y1, r.oy + cy + CELL);
    }
  }
  if (!isFinite(x0)) {
    const pos = MAP_POS[here.room] ?? { x: 0, y: 0 };
    x0 = pos.x + here.x - 20;
    x1 = pos.x + here.x + 20;
    y0 = pos.y + here.y - 10;
    y1 = pos.y + here.y + 10;
  }
  const pad = 18;
  const s = Math.max(1.2, Math.min(6, (cssW - pad * 2) / (x1 - x0), (cssH - pad * 2) / (y1 - y0)));
  const offX = (cssW - (x1 - x0) * s) / 2 - x0 * s;
  const offY = (cssH - (y1 - y0) * s) / 2 - y0 * s;
  const at = (room: RoomId, tx: number, ty: number) => {
    const pos = MAP_POS[room] ?? { x: 0, y: 0 };
    return { x: offX + (pos.x + tx) * s, y: offY + (pos.y + ty) * s };
  };

  const markers: { kind: string; x: number; y: number; on: boolean }[] = [];
  for (const r of list) {
    const rows = ROOMS[r.id].map;
    const H = rows.length;
    const W = rows[0].length;
    const def = ROOMS[r.id];
    // paredes falsas e vitrais de pé contam como pedra, e o que está atrás deles não aparece
    // (com as Contas da Irmã, os esconderijos aparecem brilhando)
    const hidden = new Set<number>();
    const secret = new Set<number>();
    const beads = progress.on('beads');
    for (const b of findBreakables(r.id, rows)) {
      if (progress.seen.has(b.id)) continue;
      for (const [x, y] of b.cells) hidden.add(y * W + x);
      for (const [x, y] of b.veil) (beads ? secret : hidden).add(y * W + x);
      if (beads) for (const [x, y] of b.cells) secret.add(y * W + x);
    }
    const ch = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H || hidden.has(y * W + x) ? '#' : rows[y][x]);
    const seen = (x: number, y: number) => r.seen.has(Math.floor(y / CELL) * r.cw + Math.floor(x / CELL));
    const open = (c: string) => c !== '#' && c !== '%' && c !== 'V';
    const exits = def.exits;
    // fora da sala, pelas bordas com saída, o mapa continua aberto
    const leaves = (e: Exit, side: Side, v: number) => e.side === side && (!e.range || (v >= e.range[0] && v <= e.range[1]));
    const outside = (x: number, y: number) =>
      (x < 0 && exits.some((e) => leaves(e, 'left', y))) || (x >= W && exits.some((e) => leaves(e, 'right', y))) ||
      y < 0 || (y >= H && exits.some((e) => leaves(e, 'down', x)));
    const lockCols = [...new Set(rows.flatMap((row, y) => [...row].map((c, x) => (c === 'Y' ? x : -1)).filter((x) => x >= 0 && y >= 0)))].sort((a, b) => a - b);
    const lockKey = (x: number) => def.locks?.[lockCols.indexOf(x)] ?? 'never';
    ctx.fillStyle = r.id === here.room ? HERE_FLOOR : FLOOR;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!open(ch(x, y)) || !seen(x, y)) continue;
        const p = at(r.id, x, y);
        ctx.fillRect(p.x, p.y, s + 0.5, s + 0.5);
      }
    }
    // contorno das paredes
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, s * 0.32);
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = ch(x, y);
        if (!open(c) || !seen(x, y)) continue;
        const p = at(r.id, x, y);
        const wall = (nx: number, ny: number) => !open(ch(nx, ny)) && !outside(nx, ny);
        if (wall(x, y - 1)) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + s, p.y); }
        if (wall(x, y + 1)) { ctx.moveTo(p.x, p.y + s); ctx.lineTo(p.x + s, p.y + s); }
        if (wall(x - 1, y)) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + s); }
        if (wall(x + 1, y)) { ctx.moveTo(p.x + s, p.y); ctx.lineTo(p.x + s, p.y + s); }
      }
    }
    ctx.stroke();
    // plataformas finas, espinhos, água e grades
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = ch(x, y);
        if (!seen(x, y)) continue;
        const p = at(r.id, x, y);
        if (c === '-') {
          ctx.fillStyle = 'rgba(232, 228, 218, 0.55)';
          ctx.fillRect(p.x, p.y, s, Math.max(1, s * 0.25));
        } else if (c === '^') {
          ctx.fillStyle = 'rgba(190, 90, 80, 0.8)';
          ctx.fillRect(p.x, p.y + s * 0.55, s, s * 0.45);
        } else if (c === '~') {
          ctx.fillStyle = 'rgba(120, 170, 220, 0.4)';
          ctx.fillRect(p.x, p.y, s, s);
        } else if (c === '|' || c === 'Y') {
          const shut = c === 'Y' ? !progress.seen.has(lockKey(x)) : r.id === 'catacumbas' ? !progress.seen.has('memory:vale') : false;
          if (shut) {
            ctx.fillStyle = 'rgba(232, 228, 218, 0.6)';
            ctx.fillRect(p.x + s * 0.3, p.y, s * 0.4, s);
          }
        }
        if (secret.has(y * W + x)) {
          ctx.fillStyle = 'rgba(214, 162, 74, 0.28)';
          ctx.fillRect(p.x, p.y, s + 0.5, s + 0.5);
        }
      }
    }
    // objetos marcados (o que está escondido atrás de parede falsa só aparece com as contas)
    let ri = 0;
    let mi = 0;
    let bi = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = rows[y][x];
        if (!'RKJUmXMOBNb'.includes(c)) continue;
        const idx = c === 'R' ? ri++ : c === 'm' ? mi++ : c === 'b' ? bi++ : 0;
        if (!seen(x, y) || hidden.has(y * W + x)) continue;
        const p = at(r.id, x + 0.5, y + 0.5);
        if (c === 'R') markers.push({ kind: 'rest', ...p, on: progress.seen.has(`rest:${r.id}:${idx}`) });
        else if (c === 'K') markers.push({ kind: 'cobrador', ...p, on: true });
        else if (c === 'J' && !progress.abilities.has('wall')) markers.push({ kind: 'relic', ...p, on: true });
        else if (c === 'U' && !progress.abilities.has('double')) markers.push({ kind: 'relic', ...p, on: true });
        else if (c === 'm' && !progress.memories.has(`${r.id}:${idx}`)) markers.push({ kind: 'memory', ...p, on: true });
        else if (c === 'X' && def.boss && !progress.seen.has(`boss:${def.boss}`)) markers.push({ kind: 'boss', ...p, on: true });
        else if (c === 'M') markers.push({ kind: 'mirror', ...p, on: true });
        else if (c === 'O') markers.push({ kind: 'door', ...p, on: true });
        else if (c === 'B') markers.push({ kind: 'forge', ...p, on: true });
        else if (c === 'N') markers.push({ kind: 'nun', ...p, on: true });
        else if (c === 'b') markers.push({ kind: 'bell', ...p, on: !progress.seen.has(`bell:${r.id}:${idx}`) });
      }
    }
  }
  // a sombra com as moedas perdidas, onde ela espera
  const echo = progress.echo;
  if (echo && list.some((r) => r.id === echo.room)) markers.push({ kind: 'echo', ...at(echo.room, echo.x / TILE, echo.y / TILE - 1.4), on: true });
  const k = Math.max(3.2, s * 1.1);
  for (const m of markers) drawMarker(ctx, m.kind, m.x, m.y, k, m.on);
  const pos = at(here.room, here.x, here.y);
  return { canvas: cv, player: pos, size: k };
}

export function drawMarker(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, k: number, on = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 1.2;
  switch (kind) {
    case 'rest':
      // vela: chama em gota sobre um tico de cera
      ctx.fillStyle = on ? GOLD : 'rgba(232, 228, 218, 0.45)';
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
      ctx.fillStyle = '#b5524a';
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
      ctx.strokeStyle = 'rgba(232, 228, 218, 0.85)';
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
      ctx.fillStyle = on ? GOLD : 'rgba(232, 228, 218, 0.35)';
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
      ctx.fillStyle = '#fff6df';
      ctx.beginPath();
      ctx.arc(0, 0, k * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
}

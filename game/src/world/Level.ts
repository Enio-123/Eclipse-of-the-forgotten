import Phaser from 'phaser';
import { TILE } from '../config';
import { SOLID_VARIANTS, TILE_ONEWAY, TILE_SOLID, TILE_SPIKE } from '../gfx/textures';

export type Theme = 'bridge' | 'catacomb' | 'memory';

export interface Spawn {
  kind: string;
  // pé do objeto: centro do tile na horizontal, base do tile na vertical
  x: number;
  y: number;
  tx: number;
  ty: number;
}

// Trecho horizontal de tiles (para superfícies, tetos e plataformas)
export interface Span {
  x0: number;
  x1: number;
  y: number;
}

export const isSolid = (i: number) => i >= TILE_SOLID;
export const isGround = (i: number) => i >= TILE_SOLID || i === TILE_ONEWAY;

// Constrói o tilemap a partir de um mapa ASCII:
// '#' pedra, '-' plataforma atravessável, '^' espinhos, '~' água; letras e números são objetos
export class Level {
  readonly map: Phaser.Tilemaps.Tilemap;
  readonly layer: Phaser.Tilemaps.TilemapLayer;
  readonly spawns: Spawn[] = [];
  readonly gates: { x: number; y: number }[] = [];
  readonly widthPx: number;
  readonly heightPx: number;
  readonly w: number;
  readonly h: number;
  readonly grid: string[];

  constructor(scene: Phaser.Scene, rows: string[], readonly theme: Theme) {
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const grid = rows.map((r) => r.padEnd(w, '.'));
    this.grid = grid;
    this.w = w;
    this.h = h;
    const solid = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || grid[y][x] === '#';

    const data: number[][] = [];
    for (let y = 0; y < h; y++) {
      const row: number[] = [];
      for (let x = 0; x < w; x++) {
        const c = grid[y][x];
        if (c === '#') {
          // fundo de riacho não ganha grama: a água conta como coberta por cima
          const top = solid(x, y - 1) || grid[y - 1]?.[x] === '~';
          const mask = (top ? 0 : 1) | (solid(x + 1, y) ? 0 : 2) | (solid(x, y + 1) ? 0 : 4) | (solid(x - 1, y) ? 0 : 8);
          const v = ((x * 73856093) ^ (y * 19349663)) >>> 0;
          row.push(TILE_SOLID + mask * SOLID_VARIANTS + (v % SOLID_VARIANTS));
        } else if (c === '|') {
          // grade de ferro: sólida enquanto estiver fechada
          row.push(TILE_SOLID + 15 * SOLID_VARIANTS);
          this.gates.push({ x, y });
        } else if (c === '-') row.push(TILE_ONEWAY);
        else if (c === '^') row.push(TILE_SPIKE);
        else {
          row.push(-1);
          if (c !== '.' && c !== '~') this.spawns.push({ kind: c, x: x * TILE + TILE / 2, y: (y + 1) * TILE, tx: x, ty: y });
        }
      }
      data.push(row);
    }

    this.map = scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const key = `tiles-${theme}`;
    const tiles = this.map.addTilesetImage(key, key, TILE, TILE, 0, 0)!;
    this.layer = this.map.createLayer(0, tiles, 0, 0)!;
    this.widthPx = w * TILE;
    this.heightPx = h * TILE;

    const solids: number[] = [];
    for (let i = TILE_SOLID; i < TILE_SOLID + 16 * SOLID_VARIANTS; i++) solids.push(i);
    this.layer.setCollision([...solids, TILE_ONEWAY]);
    this.layer.forEachTile((t) => {
      if (t.index === TILE_ONEWAY) t.setCollision(false, false, true, false, false);
    });

    // escurece o interior da rocha conforme a distância da superfície
    const depth = this.depthField();
    const floor = theme === 'memory' ? 0.5 : 0.38;
    this.layer.forEachTile((t) => {
      if (!isSolid(t.index)) return;
      const d = depth[t.y][t.x];
      const k = Math.max(floor, 1 - Math.max(0, d - 1) * 0.16);
      const c = Math.round(255 * k);
      t.tint = (c << 16) | (c << 8) | c;
    });
  }

  // caractere do mapa; fora dele, as laterais e o fundo contam como rocha
  ch(x: number, y: number) {
    if (y < 0) return '.';
    if (x < 0 || x >= this.w || y >= this.h) return '#';
    return this.grid[y][x];
  }

  solidCell(x: number, y: number) {
    return this.ch(x, y) === '#';
  }

  // célula vazia de verdade (sem chão, plataforma ou espinho)
  openCell(x: number, y: number) {
    const c = this.ch(x, y);
    return c !== '#' && c !== '-' && c !== '^';
  }

  spawn(kind: string) {
    // R0, R1...: a vela de descanso de número n (na ordem do mapa)
    if (kind.length > 1 && kind[0] === 'R') return this.spawns.filter((s) => s.kind === 'R')[Number(kind.slice(1))];
    return this.spawns.find((s) => s.kind === kind);
  }

  // abre ou fecha as grades de ferro da sala
  setGates(open: boolean) {
    for (const g of this.gates) {
      if (open) this.layer.removeTileAt(g.x, g.y);
      else this.layer.putTileAt(TILE_SOLID + 15 * SOLID_VARIANTS, g.x, g.y);
    }
  }

  // Trechos contínuos de um tipo de célula que obedecem a um teste
  spans(test: (x: number, y: number) => boolean): Span[] {
    const out: Span[] = [];
    for (let y = 0; y < this.h; y++) {
      let x0 = -1;
      for (let x = 0; x <= this.w; x++) {
        const ok = x < this.w && test(x, y);
        if (ok && x0 < 0) x0 = x;
        if (!ok && x0 >= 0) {
          out.push({ x0, x1: x - 1, y });
          x0 = -1;
        }
      }
    }
    return out;
  }

  // chão de pedra com espaço livre acima
  floorCell(x: number, y: number) {
    return this.solidCell(x, y) && y > 0 && this.openCell(x, y - 1) && this.ch(x, y - 1) !== '~';
  }

  // teto de pedra com espaço livre abaixo
  ceilingCell(x: number, y: number) {
    return this.solidCell(x, y) && y + 1 < this.h && this.openCell(x, y + 1);
  }

  // primeira linha não vazia abaixo de (x, y), ou -1 se cair para fora do mapa
  groundBelow(x: number, y: number) {
    for (let yy = y; yy < this.h; yy++) if (!this.openCell(x, yy)) return yy;
    return -1;
  }

  // primeira rocha acima de (x, y), ou -1 se for céu aberto
  ceilingAbove(x: number, y: number) {
    for (let yy = y; yy >= 0; yy--) if (this.solidCell(x, yy)) return yy;
    return -1;
  }

  // superfícies que recebem chuva: o primeiro chão de cada coluna vindo do céu
  skyFloors() {
    const out: { x: number; y: number }[] = [];
    for (let x = 0; x < this.w; x++) {
      const y = this.groundBelow(x, 0);
      if (y >= 0) out.push({ x, y });
    }
    return out;
  }

  private depthField() {
    const { grid, w, h } = this;
    const INF = 99;
    const d: number[][] = grid.map((r) => [...r].map((c) => (c === '#' ? INF : 0)));
    const q: [number, number][] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[y][x] === 0) q.push([x, y]);
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (d[ny][nx] > d[y][x] + 1) {
          d[ny][nx] = d[y][x] + 1;
          q.push([nx, ny]);
        }
      }
    }
    return d;
  }

  tileAt(x: number, y: number) {
    return this.layer.getTileAtWorldXY(x, y, true)?.index ?? -1;
  }

  // Verifica se um retângulo toca a parte pontuda dos espinhos
  touchesSpikes(x: number, y: number, w: number, h: number) {
    const tiles = this.layer.getTilesWithinWorldXY(x, y, w, h);
    for (const t of tiles) {
      if (t.index !== TILE_SPIKE) continue;
      const top = t.pixelY + 6;
      if (y + h > top && y < t.pixelY + TILE && x + w > t.pixelX + 1 && x < t.pixelX + TILE - 1) return true;
    }
    return false;
  }

  // o ponto está dentro da água do riacho?
  inWater(x: number, y: number) {
    return this.ch(Math.floor(x / TILE), Math.floor(y / TILE)) === '~';
  }
}

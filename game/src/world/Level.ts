import Phaser from 'phaser';
import { TILE } from '../config';
import { SOLID_VARIANTS, TILE_ONEWAY, TILE_SOLID, TILE_SPIKE } from '../gfx/textures';
import { findBreakables, type Breakable } from './secrets';

export type Theme = 'bridge' | 'catacomb' | 'memory' | 'city' | 'nave' | 'prison' | 'mine' | 'snow' | 'vale' | 'torres';

// o que conta como rocha no grid: pedra, ferro liso (na neve, parede de gelo) e o chão de gelo do lago
const ROCK = '#+_';
const rock = (c: string | undefined) => c !== undefined && c.length === 1 && ROCK.includes(c);

// bloco liso usado nas grades, nas paredes falsas e nos vitrais (sólidos enquanto fechados)
export const BLOCK = TILE_SOLID + 15 * SOLID_VARIANTS;

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
// '#' pedra, '-' plataforma atravessável, '^' espinhos, '~' água, '|' grade, 'Y' grade com chave,
// '%' parede falsa, 'V' vitral quebrável; na prisão: '+' ferro liso (as garras escorregam),
// '=' alçapão, ':' grade de cela e '!' grade do alarme (aberta até cair); '&' membrana abissal (como a
// grade de cela, só o Véu Abissal atravessa); nas Minas, '@' bloco de Âmbar (só a Picareta quebra);
// na Floresta Nevada, '_' gelo (chão que escorrega) e ';' gelo fino (racha e quebra; o Forest cuida);
// letras e números são objetos (um objeto no meio da água, como a truta no espelho do riacho ou o baú
// no fundo do poço, fica dentro d'água: a célula dele vira água também)
export class Level {
  readonly map: Phaser.Tilemaps.Tilemap;
  readonly layer: Phaser.Tilemaps.TilemapLayer;
  readonly spawns: Spawn[] = [];
  readonly gates: { x: number; y: number }[] = [];
  readonly locks: { x: number; y: number }[] = [];
  readonly traps: { x: number; y: number }[] = [];
  readonly bars: { x: number; y: number }[] = [];
  readonly membranes: { x: number; y: number }[] = [];
  readonly alarms: { x: number; y: number }[] = [];
  // blocos de Âmbar ainda de pé (cada grupo encostado é um só; só a Picareta quebra)
  readonly ambers: { id: string; cells: [number, number][] }[] = [];
  // gelo fino ainda inteiro (cada célula racha sozinha)
  readonly thin: { x: number; y: number }[] = [];
  // paredes falsas e vitrais ainda de pé (os já quebrados viram vão no grid)
  readonly breakables: Breakable[] = [];
  readonly widthPx: number;
  readonly heightPx: number;
  readonly w: number;
  readonly h: number;
  readonly grid: string[];

  constructor(scene: Phaser.Scene, rows: string[], readonly theme: Theme, room = '', broken: (id: string) => boolean = () => false) {
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const grid = rows.map((r) => r.padEnd(w, '.'));
    // o que já foi quebrado neste progresso é vão desde o começo
    for (const b of findBreakables(room, grid)) {
      if (!broken(b.id)) {
        this.breakables.push(b);
        continue;
      }
      for (const [x, y] of b.cells) grid[y] = grid[y].slice(0, x) + '.' + grid[y].slice(x + 1);
    }
    // Âmbar: cada grupo de '@' encostados tem uma marca; quebrado, vira vão desde o começo
    const seenAmber = new Set<string>();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (grid[y][x] !== '@' || seenAmber.has(`${x},${y}`)) continue;
        const cells: [number, number][] = [];
        const q: [number, number][] = [[x, y]];
        seenAmber.add(`${x},${y}`);
        while (q.length) {
          const [cx, cy] = q.pop()!;
          cells.push([cx, cy]);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || grid[ny][nx] !== '@' || seenAmber.has(`${nx},${ny}`)) continue;
            seenAmber.add(`${nx},${ny}`);
            q.push([nx, ny]);
          }
        }
        cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        const id = `amber:${room}:${cells[0][0]}:${cells[0][1]}`;
        if (broken(id)) for (const [cx, cy] of cells) grid[cy] = grid[cy].slice(0, cx) + '.' + grid[cy].slice(cx + 1);
        else this.ambers.push({ id, cells });
      }
    }
    this.grid = grid;
    this.w = w;
    this.h = h;
    const solid = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || rock(grid[y][x]);

    const data: number[][] = [];
    const wet: [number, number][] = [];
    for (let y = 0; y < h; y++) {
      const row: number[] = [];
      for (let x = 0; x < w; x++) {
        const c = grid[y][x];
        if (rock(c)) {
          // fundo de riacho não ganha grama: a água conta como coberta por cima
          const top = solid(x, y - 1) || grid[y - 1]?.[x] === '~';
          const mask = (top ? 0 : 1) | (solid(x + 1, y) ? 0 : 2) | (solid(x, y + 1) ? 0 : 4) | (solid(x - 1, y) ? 0 : 8);
          const v = ((x * 73856093) ^ (y * 19349663)) >>> 0;
          row.push(TILE_SOLID + mask * SOLID_VARIANTS + (v % SOLID_VARIANTS));
        } else if (c === '|') {
          // grade de ferro: sólida enquanto estiver fechada
          row.push(BLOCK);
          this.gates.push({ x, y });
        } else if (c === 'Y') {
          row.push(BLOCK);
          this.locks.push({ x, y });
        } else if (c === '=') {
          // alçapão: sólido até abrir (Fixtures abre os que já têm a marca)
          row.push(BLOCK);
          this.traps.push({ x, y });
        } else if (c === ':') {
          row.push(BLOCK);
          this.bars.push({ x, y });
        } else if (c === '&') {
          row.push(BLOCK);
          this.membranes.push({ x, y });
        } else if (c === '!') {
          row.push(-1);
          this.alarms.push({ x, y });
        } else if (c === ';') {
          row.push(BLOCK);
          this.thin.push({ x, y });
        } else if (c === '%' || c === 'V' || c === '@') row.push(BLOCK);
        // '"' é plataforma de cenário: pisa igual à prancha, mas quem desenha é o próprio objeto
        // (o prato da balança, o toldo da banca), sem tábuas nem postes de apoio
        else if (c === '-' || c === '"') row.push(TILE_ONEWAY);
        else if (c === '^') row.push(TILE_SPIKE);
        else {
          row.push(-1);
          if (c !== '.' && c !== '~') {
            this.spawns.push({ kind: c, x: x * TILE + TILE / 2, y: (y + 1) * TILE, tx: x, ty: y });
            if ((grid[y][x - 1] === '~' && grid[y][x + 1] === '~') || grid[y - 1]?.[x] === '~') wet.push([x, y]);
          }
        }
      }
      data.push(row);
    }
    for (const [x, y] of wet) grid[y] = grid[y].slice(0, x) + '~' + grid[y].slice(x + 1);

    this.map = scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    // o Vale usa os tiles de grama do vale da memória (é o mesmo lugar) até ter a pintura dele
    const key = scene.textures.exists(`tiles-${theme}`) ? `tiles-${theme}` : theme === 'vale' ? 'tiles-memory' : 'tiles-catacomb';
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
    const floor = theme === 'memory' || theme === 'vale' ? 0.5 : 0.38;
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
    return rock(this.ch(x, y));
  }

  // chão que escorrega: o gelo do lago (e o gelo fino, enquanto não quebra)
  iceCell(x: number, y: number) {
    const c = this.ch(x, y);
    return c === '_' || c === ';';
  }

  // parede de ferro liso: as garras não seguram
  slickCell(x: number, y: number) {
    return this.ch(x, y) === '+';
  }

  // grade de cela ou membrana abissal: sólida para tudo, menos para o Véu
  veilCell(x: number, y: number) {
    const c = this.ch(x, y);
    return c === ':' || c === '&';
  }

  // tiles sólidos que um retângulo (em pixels do mundo) toca, separados entre os do Véu e os outros
  private touched(x: number, y: number, w: number, h: number, veil: boolean) {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 0.01) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.layer.getTileAt(tx, ty, true);
        if (!t || !isSolid(t.index)) continue;
        if (this.veilCell(tx, ty) === veil) return true;
      }
    }
    return false;
  }

  overlapsVeil(x: number, y: number, w: number, h: number) {
    return this.touched(x, y, w, h, true);
  }

  // pedra de verdade (ou grade, alçapão e ferro): o que nem o Véu atravessa
  overlapsRock(x: number, y: number, w: number, h: number) {
    return this.touched(x, y, w, h, false);
  }

  // célula vazia de verdade (sem chão, plataforma ou espinho)
  openCell(x: number, y: number) {
    const c = this.ch(x, y);
    return !rock(c) && c !== '-' && c !== '"' && c !== '^' && c !== ';';
  }

  // põe ou tira um bloco liso (alçapões e grades do alarme)
  setBlock(x: number, y: number, on: boolean) {
    if (on) this.layer.putTileAt(BLOCK, x, y);
    else this.layer.removeTileAt(x, y);
  }

  spawn(kind: string) {
    // R0, R1...: a vela de descanso de número n; O0, O1...: a porta de número n (na ordem do mapa)
    if (kind.length > 1 && (kind[0] === 'R' || kind[0] === 'O')) return this.spawns.filter((s) => s.kind === kind[0])[Number(kind.slice(1))];
    return this.spawns.find((s) => s.kind === kind);
  }

  // abre ou fecha as grades de ferro da sala
  setGates(open: boolean) {
    for (const g of this.gates) {
      if (open) this.layer.removeTileAt(g.x, g.y);
      else this.layer.putTileAt(BLOCK, g.x, g.y);
    }
  }

  // abre ou fecha a grade com chave da coluna x
  setLock(x: number, open: boolean) {
    for (const l of this.locks) {
      if (l.x !== x) continue;
      if (open) this.layer.removeTileAt(l.x, l.y);
      else this.layer.putTileAt(BLOCK, l.x, l.y);
    }
  }

  // tem gelo fino na linha y (px) entre x0 e x1 (px)?
  thinNear(x0: number, x1: number, y: number) {
    if (!this.thin.length) return false;
    const ty = Math.floor(y / TILE);
    const a = Math.floor(x0 / TILE);
    const z = Math.floor(x1 / TILE);
    return this.thin.some((t) => t.y === ty && t.x >= a && t.x <= z);
  }

  // o gelo fino quebrou: a célula vira vão (embaixo, a água)
  breakThin(x: number, y: number) {
    this.layer.removeTileAt(x, y);
    this.grid[y] = this.grid[y].slice(0, x) + '.' + this.grid[y].slice(x + 1);
    const i = this.thin.findIndex((t) => t.x === x && t.y === y);
    if (i >= 0) this.thin.splice(i, 1);
  }

  // a parede falsa (ou o vitral) cai: as células viram vão
  breakOpen(b: Breakable) {
    for (const [x, y] of b.cells) {
      this.layer.removeTileAt(x, y);
      this.grid[y] = this.grid[y].slice(0, x) + '.' + this.grid[y].slice(x + 1);
    }
    const i = this.breakables.indexOf(b);
    if (i >= 0) this.breakables.splice(i, 1);
  }

  // o bloco de Âmbar quebrou: as células viram vão
  openAmber(cells: [number, number][]) {
    for (const [x, y] of cells) {
      this.layer.removeTileAt(x, y);
      this.grid[y] = this.grid[y].slice(0, x) + '.' + this.grid[y].slice(x + 1);
    }
    const i = this.ambers.findIndex((a) => a.cells[0][0] === cells[0][0] && a.cells[0][1] === cells[0][1]);
    if (i >= 0) this.ambers.splice(i, 1);
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
    const d: number[][] = grid.map((r) => [...r].map((c) => (rock(c) ? INF : 0)));
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

  // a água deste ponto: a linha da superfície acima dele (px) e se em cima dela há ar (num túnel alagado
  // a água vai até a pedra do teto); null fora da água
  waterAt(x: number, y: number) {
    const tx = Math.floor(x / TILE);
    let ty = Math.floor(y / TILE);
    if (this.ch(tx, ty) !== '~') return null;
    while (ty > 0 && this.ch(tx, ty - 1) === '~') ty--;
    return { surface: ty * TILE + 3, air: !this.solidCell(tx, ty - 1) };
  }
}

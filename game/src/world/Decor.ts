import Phaser from 'phaser';
import { TILE } from '../config';
import { PLANK_H } from '../gfx/textures';
import { rng } from '../gfx/raster';
import type { Level } from './Level';
import type { RoomDef } from './rooms';

interface Strand {
  img: Phaser.GameObjects.Image;
  phase: number;
  amp: number;
  // mola de quando o cavaleiro esbarra (ângulo e velocidade)
  a: number;
  va: number;
}

// tufo de mato no chão (balança com o vento e abre quando o cavaleiro passa)
interface Tuft {
  img: Phaser.GameObjects.Image;
  phase: number;
  a: number;
  va: number;
}

// quem empurra o mato e o musgo: o corpo do cavaleiro
export interface Pusher {
  x: number;
  top: number;
  bottom: number;
  vx: number;
}

interface Flicker {
  img: Phaser.GameObjects.Image;
  base: number;
  phase: number;
  speed: number;
}

export interface Point {
  x: number;
  y: number;
}

// Profundidades de desenho usadas no mundo
export const DEPTH = {
  rail: -3,
  prop: -2,
  support: -1,
  tiles: 0,
  front: 1,
  enemy: 8,
  player: 10,
  slash: 11,
  water: 12,
} as const;

// A água funda de cada região, pintada pela profundidade de cada célula (contada da linha d'água daquela
// coluna) em quatro faixas por tile, sem emendas: a cor da linha d'água (surf), a do fundo (deep, a uns
// sete tiles para baixo), o brilho da superfície e quanto de cáustica corre logo embaixo dela. A água do
// riacho da memória e o lago gelado da floresta não entram aqui (rasa uma, debaixo do gelo o outro).
export interface WaterLook {
  surf: [number, number, number];
  deep: [number, number, number];
  line: number;
  caustic: number;
}
export const WATER_LOOKS: Partial<Record<string, WaterLook>> = {
  // a tinta das sentenças, no Fosso e na Margem: grossa, sem luz por dentro
  prison: { surf: [78, 46, 122], deep: [16, 8, 26], line: 0xb58cf0, caustic: 0 },
  // a água que tomou as minas, esverdeada do Âmbar dissolvido
  mine: { surf: [52, 112, 100], deep: [8, 22, 24], line: 0x8fd8c8, caustic: 0.07 },
  // a água morna do Vale: verde-água clara em cima, azul-esverdeada e funda embaixo
  vale: { surf: [74, 150, 134], deep: [12, 42, 54], line: 0xe6fff4, caustic: 0.11 },
};

// as texturas da água pintada: o brilho da linha d'água e a cáustica (linhas finas de luz que se
// cruzam, feitas de ondas que emendam nas bordas)
function waterTextures(scene: Phaser.Scene) {
  const T = scene.textures;
  const canvas = (key: string, w: number, h: number, draw: (d: Uint8ClampedArray) => void) => {
    if (T.exists(key)) return;
    const tex = T.createCanvas(key, w, h);
    if (!tex) return;
    const ctx = tex.getContext();
    const img = ctx.createImageData(w, h);
    draw(img.data);
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  };
  canvas('water-surf', 128, 8, (d) => {
    const rand = rng(17);
    for (let x = 0; x < 128; x++) {
      const k = 0.6 + 0.4 * Math.sin((x / 128) * Math.PI * 6 + 1.3) * Math.sin((x / 128) * Math.PI * 2);
      for (let y = 0; y < 8; y++) {
        const i = (y * 128 + x) * 4;
        const a = y === 0 ? 0.85 * k : y === 1 ? 0.45 * k : Math.max(0, 0.22 - y * 0.03) * (rand() < 0.5 ? 1 : 0.4);
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = Math.round(255 * a);
      }
      if (rand() < 0.06) {
        const i = ((2 + Math.floor(rand() * 3)) * 128 + x) * 4;
        d[i + 3] = 235;
      }
    }
  });
  canvas('water-caustic', 128, 64, (d) => {
    const rand = rng(29);
    const waves: [number, number, number, number][] = [];
    for (let i = 0; i < 7; i++) waves.push([1 + Math.floor(rand() * 4) * (rand() < 0.5 ? -1 : 1), 1 + Math.floor(rand() * 3), rand() * 6.3, 0.6 + rand() * 0.4]);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 128; x++) {
        let n = 0;
        let m = 0;
        for (const [kx, ky, ph, a] of waves) {
          n += a * Math.sin(Math.PI * 2 * ((kx * x) / 128 + (ky * y) / 64) + ph + 0.8 * Math.sin((Math.PI * 2 * ky * x) / 128 + ph));
          m += a;
        }
        const ridge = Math.pow(1 - Math.abs(n / m), 14);
        const i = (y * 128 + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = Math.round(255 * Math.min(1, ridge * 1.3));
      }
    }
  });
}

// pinta a água funda da sala. A massa fica atrás do cavaleiro (DEPTH.front) e um véu fino na frente tinge
// quem está afundado (mais quanto mais fundo); devolve a linha d'água e as cáusticas (quem chama anima)
export function paintWater(scene: Phaser.Scene, L: Level, look: WaterLook, dim = 1) {
  const water = (x: number, y: number) => L.ch(x, y) === '~';
  const out = { surfaces: [] as Phaser.GameObjects.TileSprite[], caustics: [] as Phaser.GameObjects.TileSprite[] };
  if (!L.spans(water).length) return out;
  waterTextures(scene);
  const top = new Int16Array(L.w * L.h).fill(-1);
  for (let x = 0; x < L.w; x++) {
    for (let y = 0; y < L.h; y++) if (water(x, y)) top[y * L.w + x] = y > 0 && water(x, y - 1) ? top[(y - 1) * L.w + x] : y;
  }
  const back = scene.add.graphics().setDepth(DEPTH.front);
  const veil = scene.add.graphics().setDepth(DEPTH.water);
  const color = (t: number) => {
    const k = Math.min(1, Math.pow(t / 6.5, 0.85));
    const c = (i: number) => Math.round((look.surf[i] + (look.deep[i] - look.surf[i]) * k) * dim);
    return (c(0) << 16) | (c(1) << 8) | c(2);
  };
  const SUB = 4;
  for (let y = 0; y < L.h; y++) {
    let x = 0;
    while (x < L.w) {
      if (!water(x, y)) {
        x++;
        continue;
      }
      const d = y - top[y * L.w + x];
      let x1 = x;
      while (x1 + 1 < L.w && water(x1 + 1, y) && y - top[y * L.w + x1 + 1] === d) x1++;
      const px = x * TILE;
      const w = (x1 - x + 1) * TILE;
      for (let k = 0; k < SUB; k++) {
        const t = d + (k + 0.5) / SUB;
        // a primeira faixa começa na linha d'água (3 px abaixo do alto do tile)
        const y0 = y * TILE + (k * TILE) / SUB;
        const yy = d === 0 && k === 0 ? y * TILE + 3 : y0;
        const h = y0 + TILE / SUB - yy;
        back.fillStyle(color(t), Math.min(0.94, 0.6 + t * 0.12)).fillRect(px, yy, w, h);
        veil.fillStyle(color(t), Math.min(0.42, 0.12 + t * 0.07)).fillRect(px, yy, w, h);
      }
      x = x1 + 1;
    }
  }
  // a linha d'água (só onde ela dá para o ar) e, logo embaixo, a cáustica em duas camadas que se cruzam.
  // A cáustica não passa do fundo (num poço raso ela é curta) e some aos poucos com a profundidade
  const depthAt = (x: number, y: number) => {
    let d = 0;
    while (d < 4 && water(x, y + d)) d++;
    return d;
  };
  for (const sp of L.spans((x, y) => water(x, y) && !water(x, y - 1) && !L.solidCell(x, y - 1))) {
    const w = (sp.x1 - sp.x0 + 1) * TILE;
    out.surfaces.push(scene.add.tileSprite(sp.x0 * TILE, sp.y * TILE + 2, w, 8, 'water-surf').setOrigin(0).setTint(look.line).setAlpha(0.9 * dim).setDepth(DEPTH.water + 0.1));
    if (look.caustic <= 0) continue;
    let x = sp.x0;
    while (x <= sp.x1) {
      const d = depthAt(x, sp.y);
      let x1 = x;
      while (x1 + 1 <= sp.x1 && depthAt(x1 + 1, sp.y) === d) x1++;
      const h = Math.min(56, d * TILE - 5);
      const a = look.caustic * dim * Math.min(1, 0.45 + d * 0.2);
      for (let i = 0; i < 2 && h > 4; i++) {
        const c = scene.add.tileSprite(x * TILE, sp.y * TILE + 4, (x1 - x + 1) * TILE, h, 'water-caustic').setOrigin(0).setAlpha(a, a, 0, 0)
          .setTint(0xeaffe0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front + 0.1).setFlipX(i === 1);
        // o desenho preso ao mundo, para os trechos vizinhos emendarem
        c.tilePositionX = i === 1 ? -(c.x + c.width) : c.x;
        out.caustics.push(c);
      }
      x = x1 + 1;
    }
  }
  return out;
}

// Trechos do tabuleiro da ponte que recebem balaustrada (em tiles)
const BRIDGE_RAILS: [number, number][] = [[24, 50], [57, 78], [99, 106], [124, 132], [145, 170]];
const BRIDGE_DECK_ROW = 22;

// Tudo que enfeita a sala e não tem física: suportes das plataformas, musgo,
// tufos de mato, balaustrada, poças, postes, estátuas, velas, árvores e o espelho.
export class Decor {
  readonly strands: Strand[] = [];
  readonly grass: Tuft[] = [];
  readonly flickers: Flicker[] = [];
  readonly puddles: Point[] = [];
  readonly water: { sprite: Phaser.GameObjects.TileSprite; x0: number; x1: number; y: number }[] = [];
  private caustics: Phaser.GameObjects.TileSprite[] = [];
  mirror: { x: number; y: number; glow: Phaser.GameObjects.Image } | null = null;
  figureSpawn: Point | null = null;
  private rand: () => number;

  constructor(private scene: Phaser.Scene, private level: Level, room: RoomDef) {
    this.rand = rng(room.id.length * 7919 + room.map.length * 31);
    this.supports();
    if (level.theme !== 'memory') this.moss();
    this.tufts();
    if (level.theme === 'bridge') {
      this.rails();
      this.makePuddles();
    }
    // a água funda do Vale é pintada pelo próprio Vale (a cor pela profundidade, sem faixas)
    if (level.theme === 'memory' || level.theme === 'vale') {
      this.flowers();
      if (level.theme === 'memory') this.waterBodies();
    } else if (level.theme !== 'snow') this.waterBodies();
    this.objects();
  }

  // ---------- suportes: nenhuma plataforma flutua solta ----------
  private supports() {
    const L = this.level;
    // na neve, o galho que sai de um pinheiro (T, ou s, o seco) já está preso no tronco; no Vale, o da
    // árvore de flor (T)
    const trunks = L.theme === 'snow' || L.theme === 'vale' ? L.spawns.filter((sp) => sp.kind === 'T' || sp.kind === 's') : [];
    for (const r of L.spans((x, y) => L.ch(x, y) === '-')) {
      if (trunks.some((t) => t.tx >= r.x0 - 1 && t.tx <= r.x1 + 1 && t.ty > r.y)) continue;
      const yTop = r.y * TILE;
      const yBot = yTop + PLANK_H;
      const leftWall = L.solidCell(r.x0 - 1, r.y);
      const rightWall = L.solidCell(r.x1 + 1, r.y);
      if (leftWall || rightWall) {
        if (leftWall) this.bracket(r.x0 * TILE, yBot, false);
        if (rightWall) this.bracket((r.x1 + 1) * TILE, yBot, true);
        // viga comprida presa de um lado só: a ponta solta fica pendurada numa corrente
        if (leftWall !== rightWall && r.x1 - r.x0 >= 4) {
          const free = leftWall ? r.x1 : r.x0;
          const c = L.ceilingAbove(free, r.y - 1);
          if (c >= 0 && r.y - c <= 30) this.chain(leftWall ? (free + 1) * TILE - 3 : free * TILE + 3, (c + 1) * TILE, yTop + 2);
        }
        continue;
      }
      const ends = [r.x0, r.x1];
      const near = ends.every((x) => {
        const g = L.groundBelow(x, r.y + 1);
        return g >= 0 && g - r.y - 1 <= 4;
      });
      if (near) {
        const cols = r.x1 - r.x0 >= 6 ? [r.x0, Math.round((r.x0 + r.x1) / 2), r.x1] : ends;
        for (const x of cols) this.postAt(x, r, yBot);
        continue;
      }
      const ceil = ends.map((x) => L.ceilingAbove(x, r.y - 1));
      if (ceil.every((c) => c >= 0 && r.y - c <= 30)) {
        this.chain(r.x0 * TILE + 3, (ceil[0] + 1) * TILE, yTop + 2);
        this.chain((r.x1 + 1) * TILE - 3, (ceil[1] + 1) * TILE, yTop + 2);
        continue;
      }
      for (const x of ends) this.postAt(x, r, yBot);
    }
  }

  private postAt(x: number, r: { x0: number; x1: number; y: number }, yBot: number) {
    const g = this.level.groundBelow(x, r.y + 1);
    if (g < 0) return;
    const px = x === r.x0 ? x * TILE + 4 : x === r.x1 ? (x + 1) * TILE - 4 : x * TILE + 8;
    // o poste desce até a primeira pedra (passa por trás de espinhos)
    let gy = g;
    while (gy < this.level.h && !this.level.solidCell(x, gy)) gy++;
    const h = gy * TILE - yBot;
    if (h <= 0) return;
    this.scene.add.tileSprite(px, yBot, 6, h, 'deco-post').setOrigin(0.5, 0).setDepth(DEPTH.support);
  }

  private chain(x: number, y0: number, y1: number) {
    const s = this.scene;
    s.add.tileSprite(x, y0, 5, y1 - y0, 'deco-chain').setOrigin(0.5, 0).setDepth(DEPTH.support);
    s.add.image(x, y0, 'deco-anchor').setOrigin(0.5, 0).setDepth(DEPTH.support);
  }

  private bracket(x: number, y: number, flip: boolean) {
    this.scene.add.image(x, y, 'deco-bracket').setOrigin(flip ? 1 : 0, 0).setFlipX(flip).setDepth(DEPTH.support);
  }

  // ---------- musgo pendurado nos tetos ----------
  private moss() {
    const L = this.level;
    const p = { bridge: 0.4, catacomb: 0.55, memory: 0, city: 0.3, nave: 0.22, prison: 0.3, mine: 0.08, snow: 0, vale: 0.3 }[L.theme];
    for (let y = 0; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        if (!L.ceilingCell(x, y)) continue;
        const g = L.groundBelow(x, y + 1);
        const space = (g < 0 ? L.h + 4 : g) - (y + 1);
        if (space < 2 || this.rand() > p) continue;
        const n = this.rand() < 0.35 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const img = this.scene.add
            .image(x * TILE + 1 + this.rand() * 14, (y + 1) * TILE - 2, 'deco-moss', Math.floor(this.rand() * 12))
            .setOrigin(0.5, 0)
            .setDepth(DEPTH.front);
          // em túneis baixos o musgo fica curto para não encostar na cabeça
          if (space < 4) img.setCrop(0, 0, 4, Math.max(6, space * TILE - 26));
          this.strands.push({ img, phase: this.rand() * Math.PI * 2, amp: 0.6 + this.rand() * 1.1, a: 0, va: 0 });
        }
      }
    }
  }

  // ---------- tufos de mato e flores no chão ----------
  private tufts() {
    const L = this.level;
    // o Vale usa o capim do vale da memória (é o mesmo lugar)
    const own = `deco-tufts-${L.theme === 'vale' ? 'memory' : L.theme}`;
    const key = this.scene.textures.exists(own) ? own : 'deco-tufts-catacomb';
    const p = { bridge: 0.3, catacomb: 0.45, memory: 0.8, city: 0.28, nave: 0.1, prison: 0.14, mine: 0, snow: 0, vale: 0.7 }[L.theme];
    for (let y = 1; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        if (!L.floorCell(x, y) || this.rand() > p) continue;
        const img = this.scene.add
          .image(x * TILE + 2 + this.rand() * 12, y * TILE + 1, key, Math.floor(this.rand() * 6))
          .setOrigin(0.5, 1)
          .setFlipX(this.rand() < 0.5)
          .setDepth(DEPTH.front);
        this.grass.push({ img, phase: this.rand() * Math.PI * 2, a: 0, va: 0 });
      }
    }
  }

  private flowers() {
    const L = this.level;
    const g = this.scene.add.graphics().setDepth(DEPTH.front);
    const cols = [0xffffff, 0xffe0ec, 0xf6a9c9, 0xfff0a0, 0xd6c4ff, 0xff8fae];
    for (let y = 1; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        if (!L.floorCell(x, y) || this.rand() > 0.5) continue;
        const n = 1 + Math.floor(this.rand() * 2);
        for (let k = 0; k < n; k++) {
          const fx = Math.floor(x * TILE + 1 + this.rand() * 14);
          const h = 2 + Math.floor(this.rand() * 3);
          const top = y * TILE - h;
          g.fillStyle(0x3f8a3c).fillRect(fx, top + 1, 1, h);
          g.fillStyle(cols[Math.floor(this.rand() * cols.length)]);
          if (this.rand() < 0.4) g.fillRect(fx - 1, top, 3, 1).fillRect(fx, top - 1, 1, 3);
          else g.fillRect(fx, top, 1, 1);
        }
      }
    }
  }

  private waterBodies() {
    const L = this.level;
    // o lago da floresta é fundo: só a água que dá para o ar tem a linha da superfície; embaixo do gelo
    // (e mais para baixo) é água escura e fria, inteira, e dá para ver o que está parado nela
    const snow = L.theme === 'snow';
    // o líquido parado de cada região (a tinta das sentenças, a água que tomou as minas): pintado pela
    // profundidade, com a linha d'água correndo
    const liq = snow ? null : WATER_LOOKS[L.theme];
    if (liq) {
      const w = paintWater(this.scene, L, liq);
      for (const sprite of w.surfaces) this.water.push({ sprite, x0: sprite.x, x1: sprite.x + sprite.width, y: sprite.y + 1 });
      this.caustics.push(...w.caustics);
      return;
    }
    const deepKey = 'water-deep';
    const open = (x: number, y: number) => (snow ? L.ch(x, y - 1) === '.' : true);
    if (snow && !this.scene.textures.exists(deepKey)) {
      const g = this.scene.add.graphics();
      for (let y = 0; y < 16; y++) g.fillStyle(Phaser.Display.Color.GetColor(30 + y, 70 + y * 2, 104 + y * 2), 1).fillRect(0, y, 16, 1);
      g.generateTexture(deepKey, 16, 16);
      g.destroy();
    }
    for (const s of L.spans((x, y) => L.ch(x, y) === '~' && open(x, y))) {
      const sprite = this.scene.add
        .tileSprite(s.x0 * TILE, s.y * TILE + 3, (s.x1 - s.x0 + 1) * TILE, TILE - 3, 'water')
        .setOrigin(0)
        .setAlpha(snow ? 0.7 : 0.82)
        .setDepth(DEPTH.water);
      if (snow) sprite.setTint(0xb8d8ec);
      this.water.push({ sprite, x0: s.x0 * TILE, x1: (s.x1 + 1) * TILE, y: s.y * TILE + 3 });
    }
    if (!snow) return;
    // embaixo do gelo: a água escura e fria, inteira
    for (const s of L.spans((x, y) => L.ch(x, y) === '~' && !open(x, y))) {
      this.scene.add.tileSprite(s.x0 * TILE, s.y * TILE, (s.x1 - s.x0 + 1) * TILE, TILE, deepKey).setOrigin(0).setAlpha(0.6).setDepth(DEPTH.water);
    }
  }

  // ---------- ponte: balaustrada e poças de chuva ----------
  private rails() {
    const y = BRIDGE_DECK_ROW * TILE;
    for (const [x0, x1] of BRIDGE_RAILS) {
      for (let x = x0; x <= x1; x++) {
        const r = this.rand();
        if (r < 0.04) continue;
        const key = r < 0.16 ? 'deco-balustrade-broken' : 'deco-balustrade';
        this.scene.add.image(x * TILE, y, key).setOrigin(0, 1).setDepth(DEPTH.rail);
      }
    }
  }

  private makePuddles() {
    const L = this.level;
    for (const [x0, x1] of BRIDGE_RAILS) {
      for (let x = x0; x <= x1; x++) {
        if (this.rand() > 0.1 || L.ceilingAbove(x, BRIDGE_DECK_ROW - 1) >= 0) continue;
        const px = x * TILE + 8;
        const py = BRIDGE_DECK_ROW * TILE + 1;
        this.scene.add.image(px, py, 'puddle').setOrigin(0.5, 1).setDepth(DEPTH.front);
        this.puddles.push({ x: px, y: py - 1 });
      }
    }
  }

  // ---------- objetos marcados no mapa ----------
  private objects() {
    const s = this.scene;
    for (const p of this.level.spawns) {
      switch (p.kind) {
        case 'L':
        case 'l': {
          const lit = p.kind === 'L';
          s.add.image(p.x, p.y, lit ? 'deco-lamp' : 'deco-lamp-off').setOrigin(0.5, 1).setDepth(DEPTH.prop);
          if (lit) this.light(p.x, p.y - 42, 0xffad55, 1.1, 0.75, 3.4);
          break;
        }
        case 'S':
          s.add.image(p.x, p.y, 'deco-statue').setOrigin(0.5, 1).setDepth(DEPTH.prop).setTint(0xc9cfdf);
          break;
        case 'G': {
          s.add.image(p.x, p.y, 'deco-scaffold').setOrigin(0.5, 1).setDepth(DEPTH.prop);
          // velas acesas no cadafalso
          const deck = p.y - 34;
          for (const dx of [-22, 26]) {
            s.add.sprite(p.x + dx, deck, 'deco-candles').setOrigin(0.5, 1).setDepth(DEPTH.prop).play({ key: 'candles', startFrame: dx > 0 ? 1 : 0 });
            this.light(p.x + dx, deck - 8, 0xffb04a, 0.6, 0.6, 2.4);
          }
          break;
        }
        case 'D': {
          const cx = p.x + 56;
          s.add.image(cx, p.y, 'deco-gate').setOrigin(0.5, 1).setDepth(DEPTH.front);
          this.light(cx - 46, p.y - 70, 0xff9a3c, 1, 0.8, 3);
          this.light(cx + 45, p.y - 70, 0xff9a3c, 1, 0.8, 3);
          break;
        }
        case 'C':
          s.add.sprite(p.x, p.y, 'deco-candles').setOrigin(0.5, 1).setDepth(DEPTH.prop).play({ key: 'candles', startFrame: Math.floor(this.rand() * 2) });
          this.light(p.x, p.y - 8, 0xffb04a, 0.7, 0.7, 2.6);
          break;
        case 'M': {
          const glow = s.add.image(p.x, p.y - 42, 'glow').setScale(3.4).setTint(0xffe2a0).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.rail);
          s.add.image(p.x, p.y, 'deco-mirror').setOrigin(0.5, 1).setDepth(DEPTH.prop);
          this.mirror = { x: p.x, y: p.y, glow };
          break;
        }
        case 'T':
          // na neve e no Vale a árvore tem os galhos do mapa: quem desenha é a pintura da sala
          if (this.level.theme === 'snow' || this.level.theme === 'vale') break;
          s.add.image(p.x, p.y + 2, 'deco-tree-big').setOrigin(0.5, 1).setDepth(DEPTH.prop);
          break;
        case 't':
          if (this.level.theme === 'snow') break;
          s.add.image(p.x, p.y + 2, this.rand() < 0.6 ? 'deco-tree-pink' : 'deco-tree-green').setOrigin(0.5, 1).setDepth(DEPTH.prop).setFlipX(this.rand() < 0.5);
          break;
        case 'F':
          this.figureSpawn = { x: p.x, y: p.y };
          break;
      }
    }
  }

  // ponto de luz quente: um brilho forte pequeno e um halo largo e fraco
  private light(x: number, y: number, tint: number, scale: number, alpha: number, halo: number) {
    const add = Phaser.BlendModes.ADD;
    const core = this.scene.add.image(x, y, 'glow').setScale(scale).setTint(tint).setAlpha(alpha).setBlendMode(add).setDepth(DEPTH.front);
    const wide = this.scene.add.image(x, y, 'glow').setScale(halo).setTint(tint).setAlpha(0.16).setBlendMode(add).setDepth(DEPTH.front);
    this.flickers.push({ img: core, base: alpha, phase: this.rand() * 10, speed: 0.011 + this.rand() * 0.006 });
    this.flickers.push({ img: wide, base: 0.16, phase: this.rand() * 10, speed: 0.007 + this.rand() * 0.004 });
  }

  // push: o cavaleiro (High e EXTREME), para o mato abrir e o musgo balançar quando ele passa
  update(time: number, dt: number, push: Pusher | null = null) {
    const v = this.scene.cameras.main.worldView;
    const k = Math.min(dt, 0.05);
    for (const s of this.strands) {
      const im = s.img;
      if (im.x < v.x - 16 || im.x > v.right + 16 || im.y > v.bottom + 8 || im.y < v.y - 40) continue;
      if (push) {
        // o musgo pendurado empurrado pela cabeça ou pelo corpo, e volta como mola
        const len = im.displayHeight;
        const dx = im.x - push.x;
        if (Math.abs(dx) < 9 && push.top < im.y + len && push.bottom > im.y + 4) s.va += Math.sign(push.vx || dx) * Math.min(1, Math.abs(push.vx) / 120) * 9 * k;
        s.va += (-s.a * 40 - s.va * 4) * k;
        s.a += s.va * k * 6;
      }
      im.rotation = Math.sin(time * 0.0011 + s.phase) * 0.06 * s.amp + s.a;
    }
    if (push) {
      for (const t of this.grass) {
        const im = t.img;
        if (im.x < v.x - 12 || im.x > v.right + 12 || im.y < v.y - 8 || im.y > v.bottom + 12) continue;
        // o mato deita para longe dos pés do cavaleiro e volta devagar
        const dx = im.x - push.x;
        const target = Math.abs(dx) < 11 && Math.abs(push.bottom - im.y) < 8 ? Math.sign(dx || push.vx) * (1 - Math.abs(dx) / 11) * 0.9 : 0;
        t.va += ((target - t.a) * 70 - t.va * 9) * k;
        t.a += t.va * k;
        im.rotation = Math.sin(time * 0.0016 + t.phase + im.x * 0.04) * 0.07 + t.a;
      }
    }
    for (const f of this.flickers) {
      const a = Math.sin(time * f.speed + f.phase) * 0.6 + Math.sin(time * f.speed * 2.9 + f.phase * 1.7) * 0.4;
      f.img.alpha = f.base * (0.84 + 0.16 * a);
    }
    for (const w of this.water) w.sprite.tilePositionX -= dt * 9;
    this.caustics.forEach((c, i) => {
      c.tilePositionX += dt * (i % 2 ? 7 : -5);
      c.tilePositionY = Math.sin(time * 0.0006 + (i % 2)) * 6;
    });
    if (this.mirror) this.mirror.glow.alpha = 0.26 + Math.sin(time * 0.002) * 0.08;
  }
}

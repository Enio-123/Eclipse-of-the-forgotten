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

// O líquido parado de cada região: a cor da massa funda (e quanto ela clareia por linha), as duas
// cores da superfície que corre e o brilho solto nela. A água do riacho da memória não entra aqui:
// é rasa, e usa a textura de sempre.
const LIQUIDS: Partial<Record<string, { deep: [number, number, number]; step: [number, number, number]; dark: number; light: number; line: [number, number]; glint: number }>> = {
  // a tinta das sentenças, no Fosso e na Margem
  prison: { deep: [22, 11, 34], step: [1, 1, 2], dark: 0x2a1248, light: 0x381c5c, line: [0xb58cf0, 0x7b55b4], glint: 0xd8b7ff },
  // a água que tomou as minas, esverdeada do Âmbar dissolvido
  mine: { deep: [9, 24, 25], step: [1, 2, 2], dark: 0x0d2a2c, light: 0x14403c, line: [0x8fd8c8, 0x47897e], glint: 0xd9f6ea },
};

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
    if (level.theme === 'memory') {
      this.flowers();
      this.waterBodies();
    } else if (level.theme !== 'snow') this.waterBodies();
    this.objects();
  }

  // ---------- suportes: nenhuma plataforma flutua solta ----------
  private supports() {
    const L = this.level;
    // na neve, o galho que sai de um pinheiro (T, ou s, o seco) já está preso no tronco
    const trunks = L.theme === 'snow' ? L.spawns.filter((sp) => sp.kind === 'T' || sp.kind === 's') : [];
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
    const p = { bridge: 0.4, catacomb: 0.55, memory: 0, city: 0.3, nave: 0.22, prison: 0.3, mine: 0.08, snow: 0 }[L.theme];
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
    const own = `deco-tufts-${L.theme}`;
    const key = this.scene.textures.exists(own) ? own : 'deco-tufts-catacomb';
    const p = { bridge: 0.3, catacomb: 0.45, memory: 0.8, city: 0.28, nave: 0.1, prison: 0.14, mine: 0, snow: 0 }[L.theme];
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
    // o líquido parado de cada região (a tinta das sentenças, a água que tomou as minas): a superfície
    // corre, e a massa funda fica atrás de quem está dentro dela
    const liq = snow ? null : LIQUIDS[L.theme];
    const deepKey = snow ? 'water-deep' : `liquid-${L.theme}-deep`;
    const topKey = `liquid-${L.theme}-top`;
    const open = (x: number, y: number) => (snow ? L.ch(x, y - 1) === '.' : !liq || L.ch(x, y - 1) !== '~');
    if (snow && !this.scene.textures.exists(deepKey)) {
      const g = this.scene.add.graphics();
      for (let y = 0; y < 16; y++) g.fillStyle(Phaser.Display.Color.GetColor(30 + y, 70 + y * 2, 104 + y * 2), 1).fillRect(0, y, 16, 1);
      g.generateTexture(deepKey, 16, 16);
      g.destroy();
    }
    // as duas texturas do líquido (a da água do riacho é azul demais para tingir de roxo ou de verde)
    if (liq && !this.scene.textures.exists(topKey)) {
      const g = this.scene.add.graphics();
      for (let y = 0; y < 16; y++) g.fillStyle(Phaser.Display.Color.GetColor(liq.deep[0] + y * liq.step[0], liq.deep[1] + y * liq.step[1], liq.deep[2] + y * liq.step[2]), 1).fillRect(0, y, 16, 1);
      g.generateTexture(deepKey, 16, 16);
      g.clear();
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 32; x++) g.fillStyle((x * 7 + y * 13) % 5 < 2 ? liq.dark : liq.light, 0.9).fillRect(x, y, 1, 1);
      }
      for (let x = 0; x < 32; x++) g.fillStyle(x % 8 < 5 ? liq.line[0] : liq.line[1], 0.95).fillRect(x, 0, 1, 1);
      for (const [x, y] of [[4, 4], [18, 7], [27, 3], [11, 10]]) g.fillStyle(liq.glint, 0.85).fillRect(x, y, 1, 1);
      g.generateTexture(topKey, 32, 16);
      g.destroy();
    }
    for (const s of L.spans((x, y) => L.ch(x, y) === '~' && open(x, y))) {
      const sprite = this.scene.add
        .tileSprite(s.x0 * TILE, s.y * TILE + 3, (s.x1 - s.x0 + 1) * TILE, TILE - 3, liq ? topKey : 'water')
        .setOrigin(0)
        .setAlpha(snow ? 0.7 : liq ? 0.95 : 0.82)
        .setDepth(DEPTH.water);
      if (snow) sprite.setTint(0xb8d8ec);
      this.water.push({ sprite, x0: s.x0 * TILE, x1: (s.x1 + 1) * TILE, y: s.y * TILE + 3 });
    }
    if (!snow && !liq) return;
    // a massa funda fica atrás de quem está dentro dela: na calha o cavaleiro sumiria se ela passasse
    // por cima (só a linha da superfície, essa sim, corta o corpo dele)
    for (const s of L.spans((x, y) => L.ch(x, y) === '~' && !open(x, y))) {
      const w = (s.x1 - s.x0 + 1) * TILE;
      this.scene.add.tileSprite(s.x0 * TILE, s.y * TILE, w, TILE, deepKey).setOrigin(0)
        .setAlpha(snow ? 0.6 : 0.92).setDepth(snow ? DEPTH.water : DEPTH.front);
      // e um véu fino por cima, só para tingir quem está afundado nela
      if (liq) this.scene.add.tileSprite(s.x0 * TILE, s.y * TILE, w, TILE, deepKey).setOrigin(0).setAlpha(0.3).setDepth(DEPTH.water);
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
          if (this.level.theme === 'snow') break;
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
    if (this.mirror) this.mirror.glow.alpha = 0.26 + Math.sin(time * 0.002) * 0.08;
  }
}

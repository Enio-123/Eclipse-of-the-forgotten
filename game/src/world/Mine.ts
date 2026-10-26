import Phaser from 'phaser';
import { TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import { overlap } from '../entities/Enemy';
import { progress } from '../systems/Save';
import { DEPTH } from './Decor';
import { isGround, isSolid } from './Level';
import { hd, hdScale } from '../gfx/flip';
import { rng } from '../gfx/raster';
import { RECORDS } from './lore';

const AMBER = 0xffa63c;

// vagonete: velocidade nos trilhos, arranque, gravidade no pulo das falhas e onde ele fica em pé
export const CART = {
  speed: 290,
  accel: 300,
  gravity: 900,
  // roda (raio) e altura do assento, a partir do topo do trilho
  wheelR: 6,
  seat: 14,
  // corpo (largura e altura) e onde ficam os eixos no desenho
  w: 44,
  h: 26,
  axle: 21,
  axles: [-11, 11],
};

// prensa: subida, espera em cima, aviso, descida e espera embaixo (s)
export const PRESS = { rise: 1.7, top: 1.0, warn: 0.5, slam: 0.12, bottom: 0.6, dmg: 5 };

interface Cart {
  x: number;
  // topo do trilho embaixo das rodas (o chão da linha) e a altura atual das rodas
  rail: number;
  y: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  state: 'park' | 'roll' | 'air' | 'stop';
  body: Phaser.GameObjects.Image;
  wheels: Phaser.GameObjects.Image[];
  glow: Phaser.GameObjects.Image;
  spin: number;
  // batentes no fim de cada lado da linha (x do centro onde ele para)
  minX: number;
  maxX: number;
  rumbleT: number;
  fallT: number;
  rider: boolean;
}

interface Press {
  x: number;
  floor: number;
  plate: Phaser.GameObjects.Image;
  screw: Phaser.GameObjects.TileSprite;
  bar: Phaser.GameObjects.Image;
  barK: number;
  state: 'rise' | 'top' | 'warn' | 'slam' | 'bottom';
  t: number;
  // topo da chapa (mundo)
  y: number;
  ang: number;
  hitDone: boolean;
}

interface Ledger {
  id: string;
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}

interface Plug {
  id: string;
  cells: [number, number][];
  imgs: Phaser.GameObjects.Image[];
  glows: Phaser.GameObjects.Image[];
  rect: Phaser.Geom.Rectangle;
  shakeT: number;
}

// o espelho de Âmbar da Câmara (o Reflexo sai dele)
interface Mirror {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  pane: { cx: number; cy: number; rx: number; ry: number };
  k: number;
  broken: boolean;
}

// a prensa do teto da Galeria do Capataz: a chapa pendurada num carrinho que corre na viga
interface Ceil {
  beamY: number;
  floor: number;
  minX: number;
  maxX: number;
  x: number;
  tx: number;
  // topo da chapa e onde ela fica pendurada
  y: number;
  rest: number;
  // onde ela assenta desta vez (o chão ou uma tábua)
  land: number;
  vy: number;
  state: 'park' | 'move' | 'warn' | 'drop' | 'down' | 'up';
  t: number;
  trolley: Phaser.GameObjects.Image;
  plate: Phaser.GameObjects.Image;
  chain: Phaser.GameObjects.Graphics;
  shadow: Phaser.GameObjects.Ellipse;
  hit: Set<unknown>;
}

interface Glow {
  g: Phaser.GameObjects.Image;
  base: number;
  ph: number;
  fire: boolean;
}

// Tudo o que é das Minas Abandonadas e não é inimigo: os cristais de Âmbar presos na pedra, as
// escoras de madeira dos túneis baixos com a lamparina, os trilhos e o vagonete, as prensas da Casa
// Vhalor, os registros (livros em cima dos caixotes) e os blocos de Âmbar que só a Picareta quebra.
export class Mine {
  private cart: Cart | null = null;
  readonly presses: Press[] = [];
  readonly ledgers: Ledger[] = [];
  readonly plugs: Plug[] = [];
  private glows: Glow[] = [];
  private lamps: { img: Phaser.GameObjects.Image; ph: number }[] = [];
  private shards: Phaser.GameObjects.Particles.ParticleEmitter;
  private rocks: Phaser.GameObjects.Particles.ParticleEmitter;
  private warned = false;
  mirror: Mirror | null = null;
  ceil: Ceil | null = null;

  constructor(private s: GameScene) {
    const L = s.level;
    const room = s.room;
    this.shards = s.add.particles(0, 0, 'px', {
      lifespan: { min: 500, max: 1200 },
      speed: { min: 60, max: 230 },
      angle: { min: 180, max: 360 },
      gravityY: 640,
      rotate: { min: 0, max: 360 },
      scale: { start: 1.8, end: 0.5 },
      tint: [0xffa63c, 0xd27a26, 0xffe6a6, 0x9a4c12],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(DEPTH.enemy + 2);
    this.rocks = s.add.particles(0, 0, 'px', {
      lifespan: { min: 700, max: 1300 },
      speedY: { min: 30, max: 120 },
      speedX: { min: -30, max: 30 },
      gravityY: 820,
      scale: { start: 2.4, end: 1.2 },
      tint: [0x372c25, 0x514338, 0x221b17, 0x716050],
      emitting: false,
    }).setDepth(DEPTH.enemy + 2);
    let ri = 0;
    for (const sp of L.spawns) {
      if (sp.kind === 'x') this.addCrystal(sp.tx, sp.ty);
      else if (sp.kind === 'y') this.addFrame(sp.tx, sp.ty);
      else if (sp.kind === 'h') this.addPress(sp.x, sp.y);
      else if (sp.kind === 'r') this.addLedger(`${room.id}:${ri++}`, sp.x, sp.y);
      else if (sp.kind === 'j') this.addCart(sp.tx, sp.ty);
    }
    for (const [x0, x1, row] of room.rails ?? []) this.addRails(x0, x1, row);
    for (const [tx, ty] of room.lamps ?? []) this.addLamp(tx * TILE + 8, ty * TILE, 12);
    this.addPlugs();
    const boss = L.spawns.find((sp) => sp.kind === 'X');
    if (room.id === 'espelhos' && boss) this.addMirror(boss.x, boss.y);
    if (room.id === 'capataz' && boss) this.addCeiling(boss.y);
  }

  // ---------- o espelho de Âmbar ----------
  private addMirror(x: number, floor: number) {
    const s = this.s;
    const broken = progress.seen.has('boss:reflexo');
    const key = broken ? 'deco-amber-mirror-broken' : 'deco-amber-mirror';
    if (!s.textures.exists(key)) return;
    const img = hd(s.add.image(x, floor + 2, key).setOrigin(0.5, 1).setDepth(DEPTH.prop - 0.4));
    const pane = { cx: x, cy: floor + 2 - 150 + 78, rx: 27, ry: 64 };
    const glow = s.add.image(pane.cx, pane.cy, 'glow').setTint(AMBER).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.prop - 0.3)
      .setScale(1.6, 3.2).setAlpha(broken ? 0.04 : 0.12);
    this.mirror = { img, glow, pane, k: broken ? 0 : 0.15, broken };
  }

  // o espelho acende enquanto o reflexo está fora dele
  mirrorPulse(k: number, dt: number) {
    const m = this.mirror;
    if (!m || m.broken) return;
    m.k += (k - m.k) * Math.min(1, dt * 3);
    m.glow.setAlpha(0.08 + m.k * 0.36 + Math.sin(this.s.clock * 3.1) * 0.02 * m.k);
  }

  breakMirror() {
    const m = this.mirror;
    if (!m || m.broken) return;
    m.broken = true;
    if (this.s.textures.exists('deco-amber-mirror-broken')) m.img.setTexture('deco-amber-mirror-broken');
    this.shards.explode(24, m.pane.cx, m.pane.cy);
    this.s.tweens.add({ targets: m.glow, alpha: 0.04, duration: 900 });
  }

  // ---------- a prensa do teto ----------
  private addCeiling(floor: number) {
    const s = this.s;
    const L = s.level;
    if (!s.textures.exists('deco-ceiling-beam') || !s.textures.exists('deco-trolley')) return;
    // a viga corre de parede a parede, pendurada no teto da galeria por tirantes de ferro (baixa o
    // bastante para quem está no chão ver o carrinho andar e a chapa balançar)
    let row = 1;
    const mid = Math.floor(L.w / 2) * TILE;
    while (row < L.h - 2 && isSolid(L.tileAt(mid, row * TILE + 2))) row++;
    const roof = row * TILE;
    const beamY = Math.max(roof, floor - 17 * TILE);
    const x0 = 2 * TILE;
    const x1 = (L.w - 8) * TILE;
    const k = hdScale(s, 'deco-ceiling-beam');
    s.add.tileSprite(x0, beamY, x1 - x0, 10, 'deco-ceiling-beam').setOrigin(0, 0).setTileScale(k, k).setDepth(DEPTH.support);
    // os tirantes que seguram a viga na pedra, com a braçadeira em cima e embaixo
    for (let x = x0 + 40; x < x1; x += 160) {
      const g = s.add.graphics().setDepth(DEPTH.support - 0.1);
      if (beamY - roof > 4) {
        g.fillStyle(0x1d2029, 1).fillRect(x - 1.5, roof, 3, beamY - roof);
        g.fillStyle(0x4b505e, 1).fillRect(x - 1.5, roof, 1, beamY - roof);
        g.fillStyle(0x16181f, 1).fillRect(x - 4, roof, 8, 3);
      }
      g.fillStyle(0x1d2029, 1).fillRect(x - 3, beamY - 6, 6, 8);
      g.fillStyle(0x4b505e, 1).fillRect(x - 3, beamY - 6, 1, 8);
    }
    const minX = 10 * TILE;
    const maxX = (L.w - 10) * TILE;
    const x = maxX;
    const rest = beamY + 58;
    const trolley = hd(s.add.image(x, beamY + 2, 'deco-trolley').setOrigin(0.5, 0).setDepth(DEPTH.support + 0.2));
    const plate = hd(s.add.image(x, rest, 'deco-press-plate').setOrigin(0.5, 0).setDepth(DEPTH.prop + 0.6));
    const chain = s.add.graphics().setDepth(DEPTH.support + 0.15);
    const shadow = s.add.ellipse(x, floor - 1, 44, 8, 0x050403, 0).setStrokeStyle(1, 0xffc46a, 0).setDepth(DEPTH.enemy - 0.4);
    this.ceil = { beamY, floor, minX, maxX, x, tx: x, y: rest, rest, land: floor - 16, vy: 0, state: 'park', t: 0, trolley, plate, chain, shadow, hit: new Set() };
    this.placeCeil();
  }

  // onde a chapa assenta: no primeiro chão ou tábua embaixo dela (em cima de uma tábua, para nela)
  private ceilLand(x: number) {
    const c = this.ceil!;
    const L = this.s.level;
    for (let y = Math.ceil((c.rest + 18) / TILE) * TILE; y < c.floor; y += TILE) {
      for (const dx of [-18, 0, 18]) if (isGround(L.tileAt(x + dx, y + 2))) return y - 16;
    }
    return c.floor - 16;
  }

  get pressBusy() {
    return !this.ceil || this.ceil.state !== 'park';
  }

  // o apito do Capataz: o carrinho corre até em cima do ponto e solta a chapa
  callPress(tx: number) {
    const c = this.ceil;
    if (!c || c.state !== 'park') return false;
    c.tx = Phaser.Math.Clamp(tx, c.minX, c.maxX);
    c.state = 'move';
    c.t = 0;
    this.s.sfx('gate', 0.7, 1.3);
    return true;
  }

  ceilRect() {
    const c = this.ceil!;
    return new Phaser.Geom.Rectangle(c.x - 21, c.y + 1, 42, 16);
  }

  private placeCeil() {
    const c = this.ceil!;
    c.trolley.setX(Math.round(c.x));
    c.plate.setPosition(Math.round(c.x), Math.round(c.y));
    // a corrente: elos alternados da roldana até a alça da chapa
    const g = c.chain;
    g.clear();
    const top = c.beamY + 16;
    const n = Math.max(1, Math.floor((c.y - top) / 4));
    for (let i = 0; i < n; i++) {
      const y = top + i * 4;
      if (i % 2) g.fillStyle(0x30343f, 1).fillRect(Math.round(c.x) - 1, y, 2, 4);
      else g.fillStyle(0x4b505e, 1).fillRect(Math.round(c.x) - 1.5, y, 3, 4).fillStyle(0x16181f, 1).fillRect(Math.round(c.x) - 0.5, y + 1, 1, 2);
    }
  }

  private updateCeil(dt: number) {
    const c = this.ceil;
    if (!c) return;
    const s = this.s;
    const p = s.player;
    c.t += dt;
    switch (c.state) {
      case 'park':
        c.y = c.rest + Math.sin(s.clock * 1.3) * 0.6;
        break;
      case 'move': {
        const d = c.tx - c.x;
        const v = Math.sign(d) * Math.min(Math.abs(d), 420 * dt + Math.abs(d) * dt * 2);
        c.x += v;
        // a chapa balança atrás do carrinho
        c.y = c.rest + Math.abs(v) * 0.4;
        if (Math.random() < dt * 14) s.grit(c.x + (Math.random() - 0.5) * 10, c.beamY + 10);
        if (Math.abs(c.tx - c.x) < 1) {
          c.x = c.tx;
          c.state = 'warn';
          c.t = 0;
          c.land = this.ceilLand(c.x);
          c.shadow.setPosition(c.x, c.land + 15);
          s.tweens.add({ targets: c.shadow, fillAlpha: 0.75, strokeAlpha: 0.6, duration: 380 });
          s.sfx('clang', 0.6, 1.5);
        }
        break;
      }
      case 'warn':
        c.y = c.rest + Math.sin(c.t * 60) * 0.8;
        c.shadow.setScale(0.5 + 0.5 * Math.min(1, c.t / 0.5), 1);
        if (Math.random() < dt * 24) s.grit(c.x - 18 + Math.random() * 36, c.y + 16);
        if (c.t > 0.5) {
          c.state = 'drop';
          c.t = 0;
          c.vy = 120;
          c.hit.clear();
          s.sfx('swoosh', 0.8, 0.6);
        }
        break;
      case 'drop':
        c.vy += 2600 * dt;
        c.y = Math.min(c.land, c.y + c.vy * dt);
        if (c.y >= c.land) {
          c.state = 'down';
          c.t = 0;
          s.sfx('thud', 1, 0.55);
          s.sfx('clang', 0.9, 0.45);
          s.cameras.main.shake(200, 0.008);
          s.dustBurst(c.x - 24, c.land + 16, 8);
          s.dustBurst(c.x + 24, c.land + 16, 8);
          this.shards.explode(5, c.x, c.land + 14);
          s.tweens.add({ targets: c.shadow, fillAlpha: 0, strokeAlpha: 0, duration: 200 });
        }
        break;
      case 'down':
        if (c.t > 0.7) {
          c.state = 'up';
          c.t = 0;
          s.sfx('gate', 0.5, 0.8);
        }
        break;
      case 'up':
        c.y = Math.max(c.rest, c.y - 230 * dt);
        if (c.y <= c.rest) {
          c.state = 'park';
          c.t = 0;
        }
        break;
    }
    this.placeCeil();
    const deadly = c.state === 'drop' || (c.state === 'down' && c.t < 0.08);
    if (!deadly) return;
    const r = this.ceilRect();
    if (!p.dead && !p.veiling && !c.hit.has(p) && overlap(r, p.rect)) {
      c.hit.add(p);
      s.hazardHit(c.x, true);
    }
    // a chapa não escolhe: pega quem estiver embaixo, até o Capataz
    for (const e of s.enemies) {
      if (e.alive && !c.hit.has(e) && overlap(r, e.rect)) {
        c.hit.add(e);
        s.hitByPress(e, c.x);
      }
    }
  }

  // lascas de Âmbar voando (o mineiro e o morcego estouram assim; a picareta também tira lascas)
  amberBurst(x: number, y: number, n: number) {
    this.shards.explode(n, x, y);
  }

  // ---------- luz ----------
  private glow(x: number, y: number, tint: number, scale: number, alpha: number, halo: number, haloA: number, fire: boolean) {
    const add = Phaser.BlendModes.ADD;
    const g = this.s.add.image(x, y, 'glow').setScale(scale).setTint(tint).setAlpha(alpha).setBlendMode(add).setDepth(DEPTH.prop + 0.32);
    const w = this.s.add.image(x, y, 'glow').setScale(halo).setTint(tint).setAlpha(haloA).setBlendMode(add).setDepth(DEPTH.prop + 0.31);
    this.glows.push({ g, base: alpha, ph: Math.random() * Math.PI * 2, fire });
    this.glows.push({ g: w, base: haloA, ph: Math.random() * Math.PI * 2, fire });
    return g;
  }

  private light(key: string, i = 0): [number, number, number] {
    const all = this.s.cache.json.get('portal-lights') as Record<string, [number, number, number][]> | undefined;
    return all?.[key]?.[i] ?? [8, 8, AMBER];
  }

  // ---------- cristais de Âmbar ----------
  // cada cristal nasce da pedra encostada (o mapa já garante): no chão aponta para cima, no teto
  // para baixo e na parede para o lado de fora; o tamanho vem do espaço livre na frente dele
  private addCrystal(tx: number, ty: number) {
    const s = this.s;
    const L = s.level;
    const below = L.solidCell(tx, ty + 1);
    const above = L.solidCell(tx, ty - 1);
    const left = L.solidCell(tx - 1, ty);
    const right = L.solidCell(tx + 1, ty);
    // de que lado está a pedra (o chão tem preferência, depois o teto, depois as paredes)
    const side = below ? 'floor' : above ? 'ceil' : left ? 'left' : right ? 'right' : 'floor';
    const room = (dx: number, dy: number) => {
      let n = 0;
      for (let k = 1; k <= 3; k++) if (L.openCell(tx + dx * k, ty + dy * k)) n++;
      return n;
    };
    const space = side === 'floor' ? room(0, -1) : side === 'ceil' ? room(0, 1) : side === 'left' ? room(1, 0) : room(-1, 0);
    const h = ((tx * 7349) ^ (ty * 3011)) >>> 0;
    const key = space >= 3 && h % 3 !== 2 ? 'deco-crystal-0' : space >= 2 ? (h % 2 ? 'deco-crystal-1' : 'deco-crystal-2') : 'deco-crystal-2';
    if (!s.textures.exists(key)) return;
    const img = hd(s.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(DEPTH.tiles + 0.2));
    const w = img.displayWidth;
    const hh = img.displayHeight;
    const [lx, ly, lc] = this.light(key);
    const cx = tx * TILE + 8;
    const cy = ty * TILE + 8;
    // pé do cristal grudado na face da pedra; a luz fica no miolo (lx, ly a partir do canto da imagem)
    let gx = cx;
    let gy = cy;
    const flip = (h & 4) !== 0;
    img.setFlipX(flip);
    if (side === 'floor') {
      img.setPosition(cx, (ty + 1) * TILE + 1);
      gx = cx - w / 2 + (flip ? w - lx : lx);
      gy = (ty + 1) * TILE + 1 - hh + ly;
    } else if (side === 'ceil') {
      img.setPosition(cx, ty * TILE - 1).setFlipY(true);
      gx = cx - w / 2 + (flip ? w - lx : lx);
      gy = ty * TILE - 1 + hh - ly;
    } else if (side === 'left') {
      img.setPosition(tx * TILE - 1, cy).setAngle(90);
      gx = tx * TILE - 1 + hh - ly;
      gy = cy;
    } else {
      img.setPosition((tx + 1) * TILE + 1, cy).setAngle(-90);
      gx = (tx + 1) * TILE + 1 - hh + ly;
      gy = cy;
    }
    const big = key === 'deco-crystal-0';
    this.glow(gx, gy, lc, big ? 1.1 : 0.75, big ? 0.55 : 0.45, big ? 3.6 : 2.6, big ? 0.15 : 0.11, false);
  }

  // ---------- escoras ----------
  // quadro de madeira dos túneis: dois esteios no chão, a travessa encostada no teto (no ponto mais
  // baixo dele) e as mãos-francesas; só onde o teto está perto (sem viga solta no ar)
  private addFrame(tx: number, ty: number) {
    const s = this.s;
    const L = s.level;
    if (!s.textures.exists('deco-timber')) return;
    const cx = tx * TILE + 8;
    const floor = (ty + 1) * TILE;
    const cols = [Math.floor((cx - 28) / TILE), Math.floor((cx - 20) / TILE), tx, Math.floor((cx + 20) / TILE), Math.floor((cx + 27) / TILE)];
    let cap = -1;
    for (const c of cols) {
      const r = L.ceilingAbove(c, ty);
      if (r < 0) return;
      cap = Math.max(cap, (r + 1) * TILE);
    }
    const h = floor - cap;
    if (h < 3 * TILE || h > 17 * TILE) return;
    // os dois esteios precisam de chão embaixo
    if (!L.solidCell(cols[1], ty + 1) || !L.solidCell(cols[3], ty + 1)) return;
    const k = hdScale(s, 'deco-timber');
    const post = (x: number) =>
      s.add.tileSprite(x, cap + 6, h - 6, 8, 'deco-timber').setOrigin(0, 0.5).setAngle(90).setTileScale(k, k).setDepth(DEPTH.support);
    post(cx - 20);
    post(cx + 20);
    s.add.tileSprite(cx - 30, cap, 60, 8, 'deco-timber').setOrigin(0, 0).setTileScale(k, k).setDepth(DEPTH.support + 0.05);
    if (h > 8 * TILE) {
      // escora alta: uma travessa no meio para os esteios não flambarem
      s.add.tileSprite(cx - 24, cap + Math.round(h * 0.45), 48, 8, 'deco-timber').setOrigin(0, 0.5).setTileScale(k, k).setDepth(DEPTH.support + 0.04);
    }
    if (s.textures.exists('deco-timber-knee')) {
      hd(s.add.image(cx - 17, cap + 22, 'deco-timber-knee').setOrigin(0, 1).setDepth(DEPTH.support + 0.06));
      hd(s.add.image(cx + 17, cap + 22, 'deco-timber-knee').setOrigin(1, 1).setFlipX(true).setDepth(DEPTH.support + 0.06));
    }
    // a lamparina pendurada no meio da travessa
    if (h <= 12 * TILE) this.addLamp(cx, cap + 8, 1);
  }

  // ---------- lamparinas ----------
  private addLamp(x: number, top: number, chain: number) {
    const s = this.s;
    if (!s.textures.exists('deco-mine-lamp')) return;
    if (chain > 1) s.fixtures.hang(x, top, chain);
    else s.add.tileSprite(x, top, 5, 7, 'deco-chain').setOrigin(0.5, 0).setDepth(DEPTH.prop + 0.25);
    const y = chain > 1 ? top : top + 6;
    const img = hd(s.add.image(x, y, 'deco-mine-lamp').setOrigin(0.5, 0).setDepth(DEPTH.prop + 0.3));
    this.lamps.push({ img, ph: Math.random() * Math.PI * 2 });
    const [lx, ly, lc] = this.light('deco-mine-lamp');
    this.glow(x - img.displayWidth / 2 + lx, y + ly, lc, 0.85, 0.6, 4.2, 0.16, true);
  }

  // ---------- trilhos ----------
  // os trilhos correm pelo chão; na beira de cada falha o trilho entorta para cima (a ponte de
  // madeira que cruzava caiu, ficaram os esteios quebrados lá embaixo)
  private addRails(x0: number, x1: number, row: number) {
    const s = this.s;
    const L = s.level;
    if (!s.textures.exists('deco-rail')) return;
    const k = hdScale(s, 'deco-rail');
    const F = row * TILE;
    let a = -1;
    for (let x = x0; x <= x1 + 1; x++) {
      const ok = x <= x1 && L.floorCell(x, row);
      if (ok && a < 0) a = x;
      if (!ok && a >= 0) {
        s.add.tileSprite(a * TILE, F - 2, (x - a) * TILE, 8, 'deco-rail').setOrigin(0, 0).setTileScale(k, k).setDepth(DEPTH.tiles + 0.3);
        // pontas entortadas onde o chão acaba numa falha (não na parede nem na saída)
        const gapR = x <= x1 && !L.solidCell(x, row) && L.openCell(x, row - 1);
        const gapL = a > x0 && !L.solidCell(a - 1, row) && L.openCell(a - 1, row - 1);
        if (gapR) this.bentRail(x * TILE, F, 1, k);
        if (gapL) this.bentRail(a * TILE, F, -1, k);
        a = -1;
      }
    }
    // os esteios quebrados da ponte que caiu, no fundo de cada falha
    let g0 = -1;
    for (let x = x0; x <= x1 + 1; x++) {
      const gap = x <= x1 && !L.solidCell(x, row) && L.openCell(x, row - 1);
      if (gap && g0 < 0) g0 = x;
      if (!gap && g0 >= 0) {
        this.trestle(g0, x - 1, row);
        g0 = -1;
      }
    }
  }

  private bentRail(x: number, F: number, dir: 1 | -1, k: number) {
    const s = this.s;
    s.add.tileSprite(x, F - 2, 18, 8, 'deco-rail').setOrigin(dir > 0 ? 0 : 1, 0).setAngle(dir * -24).setTileScale(k, k).setDepth(DEPTH.tiles + 0.3);
  }

  private trestle(g0: number, g1: number, row: number) {
    const s = this.s;
    const L = s.level;
    if (!s.textures.exists('deco-timber')) return;
    const k = hdScale(s, 'deco-timber');
    const r = rng(g0 * 131 + row);
    const bottom = L.groundBelow(Math.floor((g0 + g1) / 2), row) * TILE;
    if (bottom <= 0) return;
    const F = row * TILE;
    // dois esteios de pé, quebrados em alturas diferentes, e uma viga caída apoiada neles
    const xs = [g0 * TILE + 18 + r() * 10, (g1 + 1) * TILE - 18 - r() * 10];
    for (const x of xs) {
      const top = F + 6 + r() * 26;
      s.add.tileSprite(x, top, bottom - top, 8, 'deco-timber').setOrigin(0, 0.5).setAngle(90).setTileScale(k, k).setDepth(DEPTH.prop);
    }
    const len = (g1 - g0 + 1) * TILE * 0.7;
    s.add.tileSprite((g0 * TILE + (g1 + 1) * TILE) / 2, bottom - 10, len, 8, 'deco-timber')
      .setOrigin(0.5, 0.5).setAngle(r() < 0.5 ? 14 : -14).setTileScale(k, k).setDepth(DEPTH.prop + 0.01);
  }

  // ---------- vagonete ----------
  private addCart(tx: number, ty: number) {
    const s = this.s;
    const L = s.level;
    if (!s.textures.exists('deco-cart')) return;
    const row = ty + 1;
    const rail = row * TILE - 2;
    // a linha vai de parede a parede do túnel; os batentes ficam a uns tiles das pontas
    let minX = tx * TILE + 8;
    let maxX = minX;
    for (let x = tx; x >= 0 && L.floorCell(x, row); x--) minX = x * TILE + 8;
    for (let x = tx; x < L.w && (L.floorCell(x, row) || !L.solidCell(x, row)); x++) if (L.floorCell(x, row)) maxX = x * TILE + 8;
    minX = Math.max(minX, 3 * TILE) + CART.w / 2 + 4;
    maxX = Math.min(maxX, (L.w - 9) * TILE) - CART.w / 2 - 4;
    this.rails(row);
    const atRight = progress.seen.has(`cart:${s.room.id}:right`);
    const x = atRight ? maxX : tx * TILE + 8;
    const body = hd(s.add.image(x, 0, 'deco-cart').setOrigin(0.5, 0).setDepth(DEPTH.player + 0.4));
    const wheels = CART.axles.map(() => hd(s.add.image(0, 0, 'deco-cart-wheel').setDepth(DEPTH.player + 0.45)));
    const [lx, ly, lc] = this.light('deco-cart');
    const glow = this.glow(x - CART.w / 2 + lx, rail - CART.wheelR - CART.axle + ly, lc, 0.6, 0.4, 2.2, 0.1, false);
    this.cart = { x, rail, y: rail, vx: 0, vy: 0, dir: atRight ? -1 : 1, state: 'park', body, wheels, glow, spin: 0, minX, maxX, rumbleT: 0, fallT: 0, rider: false };
    this.placeCart();
    // os batentes de madeira nas duas pontas da linha
    for (const [bx, d] of [[minX - CART.w / 2 - 6, -1], [maxX + CART.w / 2 + 6, 1]] as const) this.bumper(bx, row * TILE, d);
  }

  // trilhos ao longo da linha do vagonete
  private rails(row: number) {
    this.addRails(0, this.s.level.w - 1, row);
  }

  private bumper(x: number, F: number, dir: number) {
    const s = this.s;
    if (!s.textures.exists('deco-timber')) return;
    const k = hdScale(s, 'deco-timber');
    s.add.tileSprite(x, F - 22, 22, 8, 'deco-timber').setOrigin(0, 0.5).setAngle(90).setTileScale(k, k).setDepth(DEPTH.prop + 0.4);
    s.add.tileSprite(x - dir * 8, F - 14, 20, 8, 'deco-timber').setOrigin(dir > 0 ? 1 : 0, 0.5).setAngle(dir * 40).setTileScale(k, k).setDepth(DEPTH.prop + 0.39);
    s.add.tileSprite(x - 10, F - 20, 20, 8, 'deco-timber').setOrigin(0, 0.5).setTileScale(k, k).setDepth(DEPTH.prop + 0.41);
  }

  private placeCart() {
    const c = this.cart!;
    const top = c.y - CART.wheelR - CART.axle;
    const tilt = c.state === 'air' ? Phaser.Math.Clamp(c.vy / 900, -0.35, 0.35) * c.dir : 0;
    c.body.setPosition(Math.round(c.x), Math.round(top)).setRotation(tilt);
    CART.axles.forEach((ax, i) => {
      const w = c.wheels[i];
      w.setPosition(Math.round(c.x + ax * Math.cos(tilt)), Math.round(c.y - CART.wheelR + ax * Math.sin(tilt))).setRotation(c.spin);
    });
    const [lx, ly] = this.light('deco-cart');
    c.glow.setPosition(c.x - CART.w / 2 + lx, top + ly);
  }

  private get cartRect() {
    const c = this.cart!;
    return new Phaser.Geom.Rectangle(c.x - CART.w / 2, c.y - CART.wheelR - CART.axle, CART.w, CART.h + 4);
  }

  // o vagonete com o cavaleiro dentro, para a cena e os testes
  get riding() {
    return !!this.cart?.rider;
  }

  get cartState() {
    const c = this.cart;
    return c ? { x: c.x, y: c.y, state: c.state, rider: c.rider, vx: c.vx } : null;
  }

  private board() {
    const c = this.cart!;
    const p = this.s.player;
    c.rider = true;
    p.board(c.x - c.dir * 2, c.y - CART.seat);
    p.facing = c.dir;
    this.s.sfx('land', 0.8, 0.9);
    this.s.sfx('clang', 0.4, 1.4);
  }

  private release() {
    const c = this.cart!;
    if (c.state !== 'park' && c.state !== 'stop') return;
    // estava no batente: volta para o outro lado
    if (c.state === 'stop' || (c.dir > 0 && c.x >= c.maxX - 2) || (c.dir < 0 && c.x <= c.minX + 2)) c.dir = (c.x > (c.minX + c.maxX) / 2 ? -1 : 1) as 1 | -1;
    c.state = 'roll';
    c.vx = c.dir * 30;
    this.s.clearCartHits();
    this.s.player.facing = c.dir;
    this.s.sfx('clang', 0.9, 0.7);
    this.s.sfx('censer', 0.6, 0.6);
    this.s.cameras.main.shake(160, 0.004);
  }

  private updateCart(dt: number) {
    const c = this.cart;
    if (!c) return;
    const s = this.s;
    const L = s.level;
    const p = s.player;
    if (c.rider && !p.ride) c.rider = false;
    if (c.rider && p.dead) {
      c.rider = false;
      p.leaveRide(0, 0);
    }
    if (c.state === 'roll' || c.state === 'air') {
      c.vx = Phaser.Math.Clamp(c.vx + c.dir * CART.accel * dt, -CART.speed, CART.speed);
      c.x += c.vx * dt;
      c.spin += (c.vx * dt) / CART.wheelR;
      const row = Math.floor((c.rail + 2) / TILE);
      if (c.state === 'roll') {
        // a roda da frente saiu do trilho: a ponta entortada joga o vagonete por cima da falha
        const front = Math.floor((c.x + c.dir * (CART.w / 2 - 6)) / TILE);
        if (!L.floorCell(front, row)) {
          let land = front;
          while (land > 0 && land < L.w - 1 && !L.floorCell(land, row)) land += c.dir;
          const target = (c.dir > 0 ? land * TILE : (land + 1) * TILE) + c.dir * (CART.w / 2 + 2 * TILE);
          const T = Math.abs(target - c.x) / Math.max(120, Math.abs(c.vx));
          c.vy = (-CART.gravity * T) / 2;
          c.state = 'air';
          s.sfx('clang', 0.7, 1.2);
          s.sfx('swoosh', 0.8, 0.7);
          this.shards.explode(4, c.x + c.dir * 18, c.rail);
        }
        c.rumbleT -= dt;
        if (c.rumbleT <= 0) {
          c.rumbleT = 0.16;
          s.dustBurst(c.x - c.dir * 16, c.rail + 2, 1);
          if (Math.abs(c.vx) > 120) s.sfx('step', 0.25, 0.5 + Math.random() * 0.1);
        }
      } else {
        c.vy += CART.gravity * dt;
        c.y += c.vy * dt;
        if (c.vy > 0 && c.y >= c.rail) {
          const a = Math.floor((c.x - CART.w / 2 + 6) / TILE);
          const b = Math.floor((c.x + CART.w / 2 - 6) / TILE);
          if (L.floorCell(a, row) && L.floorCell(b, row)) {
            c.y = c.rail;
            c.vy = 0;
            c.state = 'roll';
            s.sfx('thud', 1, 0.8);
            s.sfx('clang', 0.8, 0.9);
            s.dustBurst(c.x, c.rail + 2, 10);
            this.shards.explode(6, c.x, c.rail);
            s.cameras.main.shake(140, 0.006);
          } else if (c.y > c.rail + 8 * TILE) {
            // errou a falha (não deveria): some lá embaixo
            c.state = 'stop';
          }
        }
      }
      // o teto treme atrás: cai pedra e poeira por onde ele passou (só com o cavaleiro dentro)
      if (c.rider && c.state === 'roll') {
        c.fallT -= dt;
        if (c.fallT <= 0) {
          c.fallT = 0.35 + Math.random() * 0.3;
          const fx = c.x - c.dir * (70 + Math.random() * 80);
          const col = Math.floor(fx / TILE);
          const ceil = L.ceilingAbove(col, row - 2);
          if (ceil >= 0) {
            this.rocks.explode(5, fx, (ceil + 1) * TILE + 2);
            s.time.delayedCall(260, () => s.dustBurst(fx, c.rail + 2, 6));
            s.sfx('crack', 0.35, 0.7 + Math.random() * 0.2);
            s.cameras.main.shake(90, 0.0025);
          }
        }
      }
      // atropela quem estiver na linha
      if (Math.abs(c.vx) > 140) {
        const r = this.cartRect;
        for (const e of s.enemies) {
          if (!e.alive || !overlap(r, e.rect)) continue;
          if (s.hitByCart(e, c.x - c.dir * 30)) s.cameras.main.shake(80, 0.004);
        }
      }
      // o batente da ponta
      const end = c.dir > 0 ? c.x >= c.maxX : c.x <= c.minX;
      if (end && c.state === 'roll') {
        c.x = c.dir > 0 ? c.maxX : c.minX;
        c.state = 'stop';
        const v = c.vx;
        c.vx = 0;
        s.sfx('thud', 1, 0.7);
        s.sfx('clang', 1, 0.6);
        s.cameras.main.shake(220, 0.008);
        s.dustBurst(c.x + c.dir * 22, c.rail, 12);
        if (c.dir > 0) progress.seen.add(`cart:${s.room.id}:right`);
        else progress.seen.delete(`cart:${s.room.id}:right`);
        progress.save();
        // quem estava dentro é jogado para a frente
        if (c.rider) {
          c.rider = false;
          p.leaveRide(Math.sign(v) * 230, -320);
        }
      }
    }
    // com o cavaleiro dentro: viga baixa sem agachar derruba ele para trás
    if (c.rider && p.ride) {
      p.ride.x = c.x - c.dir * 2;
      p.ride.y = c.y - CART.seat;
      p.ride.vx = c.vx;
      p.ride.vy = c.vy;
      if (!p.crouched && (c.state === 'roll' || c.state === 'air')) {
        const b = p.body;
        if (L.overlapsRock(p.ride.x - b.width / 2 + 1, p.ride.y - 42, b.width - 2, 40)) {
          c.rider = false;
          p.leaveRide(-c.dir * 140, -120);
          // o Capacete de mineiro aguenta a pancada: ele cai do vagonete, mas sem se machucar
          if (progress.on('helmet')) s.helmetBonk(p.x + c.dir * 6, p.body.top);
          else s.hazardHit(c.x + c.dir * 30);
          s.sfx('thud', 0.9, 1.1);
          if (!this.warned) {
            this.warned = true;
            s.time.delayedCall(900, () => s.thinkOnce('mine:duck', 'Viga baixa. No vagonete, agachado.'));
          }
        }
      }
    }
    this.placeCart();
  }

  // ---------- prensas ----------
  private addPress(x: number, floor: number) {
    const s = this.s;
    if (!s.textures.exists('deco-press')) return;
    hd(s.add.image(x, floor + 1, 'deco-press').setOrigin(0.5, 1).setDepth(DEPTH.support));
    if (s.textures.exists('deco-press-bed')) hd(s.add.image(x, floor + 3, 'deco-press-bed').setOrigin(0.5, 1).setDepth(DEPTH.tiles + 0.2));
    const top = floor - 102;
    const k = hdScale(s, 'deco-press-screw');
    const screw = s.add.tileSprite(x, floor - 104, 8, 4, 'deco-press-screw').setOrigin(0.5, 0).setTileScale(k, k).setDepth(DEPTH.support + 0.1);
    const bar = hd(s.add.image(x, floor - 124, 'deco-press-bar').setDepth(DEPTH.support + 0.2));
    const plate = hd(s.add.image(x, top, 'deco-press-plate').setOrigin(0.5, 0).setDepth(DEPTH.prop + 0.6));
    const i = this.presses.length;
    const pr: Press = { x, floor, plate, screw, bar, barK: bar.scaleX, state: 'top', t: -i * 0.95, y: top, ang: i * 1.3, hitDone: false };
    this.presses.push(pr);
    // lamparina na ponta da viga de cima
    this.addLamp(x + 27, floor - 112, 1);
    this.placePress(pr);
  }

  private placePress(pr: Press) {
    pr.plate.setY(Math.round(pr.y));
    const y0 = pr.floor - 104;
    pr.screw.setSize(8, Math.max(2, pr.y - y0 + 2));
    pr.bar.setScale(pr.barK * Math.cos(pr.ang), pr.bar.scaleY);
  }

  plateRect(pr: Press) {
    return new Phaser.Geom.Rectangle(pr.x - 21, pr.y + 1, 42, 16);
  }

  private updatePresses(dt: number) {
    const s = this.s;
    const p = s.player;
    for (const pr of this.presses) {
      pr.t += dt;
      const top = pr.floor - 102;
      const bottom = pr.floor - 18;
      const y0 = pr.y;
      switch (pr.state) {
        case 'top':
          pr.y = top;
          pr.ang += dt * 0.4;
          if (pr.t > PRESS.top) {
            pr.state = 'warn';
            pr.t = 0;
            if (this.near(pr.x, 320)) s.sfx('censer', 0.5 * this.vol(pr.x), 0.5);
          }
          break;
        case 'warn':
          // a barra gira rápido e a chapa treme: cai pó da beirada
          pr.ang += dt * 9;
          pr.y = top + Math.sin(pr.t * 70) * 0.8;
          if (Math.random() < dt * 30) s.grit(pr.x - 18 + Math.random() * 36, pr.y + 16);
          if (pr.t > PRESS.warn) {
            pr.state = 'slam';
            pr.t = 0;
            pr.hitDone = false;
          }
          break;
        case 'slam': {
          const k = Math.min(1, pr.t / PRESS.slam);
          pr.y = top + (bottom - top) * k * k;
          pr.ang -= dt * 30;
          if (k >= 1) {
            pr.state = 'bottom';
            pr.t = 0;
            const v = this.vol(pr.x);
            if (v > 0) {
              s.sfx('thud', v, 0.6);
              s.sfx('clang', v * 0.8, 0.5);
              s.cameras.main.shake(140, 0.006 * v);
            }
            s.dustBurst(pr.x - 24, pr.floor, 6);
            s.dustBurst(pr.x + 24, pr.floor, 6);
            this.shards.explode(3, pr.x, pr.floor - 2);
          }
          break;
        }
        case 'bottom':
          pr.y = bottom;
          if (pr.t > PRESS.bottom) {
            pr.state = 'rise';
            pr.t = 0;
          }
          break;
        case 'rise': {
          const k = Math.min(1, pr.t / PRESS.rise);
          const e = 0.5 - Math.cos(k * Math.PI) / 2;
          pr.y = bottom + (top - bottom) * e;
          pr.ang += dt * 2.2;
          if (k >= 1) {
            pr.state = 'top';
            pr.t = 0;
          }
          break;
        }
      }
      // o fuso gira junto: os filetes andam conforme a chapa sobe ou desce
      pr.screw.tilePositionY += (pr.y - y0) / hdScale(s, 'deco-press-screw') * 0.6;
      this.placePress(pr);
      // esmaga quem estiver embaixo na descida (e no primeiro instante lá embaixo)
      const deadly = pr.state === 'slam' || (pr.state === 'bottom' && pr.t < 0.08);
      if (deadly) {
        const r = this.plateRect(pr);
        if (!p.dead && !p.veiling && overlap(r, p.rect) && !pr.hitDone) {
          pr.hitDone = true;
          s.hazardHit(pr.x, true);
        }
        for (const e of s.enemies) {
          if (e.alive && e.kind !== 'boss' && overlap(r, e.rect)) s.hitByPress(e, pr.x);
        }
      }
    }
  }

  private near(x: number, d: number) {
    return Math.abs(this.s.player.x - x) < d;
  }

  private vol(x: number) {
    return Phaser.Math.Clamp(1 - Math.abs(this.s.player.x - x) / 420, 0, 1);
  }

  // ---------- registros ----------
  private addLedger(id: string, x: number, y: number) {
    const s = this.s;
    if (!s.textures.exists('deco-ledger') || !RECORDS[id]) return;
    const img = hd(s.add.image(x, y + 1, 'deco-ledger').setOrigin(0.5, 1).setDepth(DEPTH.prop + 0.5));
    const [lx, ly, lc] = this.light('deco-ledger');
    const glow = this.glow(x - img.displayWidth / 2 + lx, y + 1 - img.displayHeight + ly, lc, 0.4, progress.seen.has(`record:${id}`) ? 0.25 : 0.5, 1.4, 0.08, false);
    this.ledgers.push({ id, x, y, img, glow });
  }

  // ---------- blocos de Âmbar ----------
  private addPlugs() {
    const s = this.s;
    const L = s.level;
    for (const g of L.ambers) {
      const imgs: Phaser.GameObjects.Image[] = [];
      const glows: Phaser.GameObjects.Image[] = [];
      // a mão presa fica num bloco só do grupo
      const hand = Math.floor(g.cells.length * 0.6);
      g.cells.forEach(([cx, cy], i) => {
        const key = i === hand ? 'deco-amber-block-1' : (cx + cy) % 2 ? 'deco-amber-block-2' : 'deco-amber-block-0';
        if (!s.textures.exists(key)) return;
        imgs.push(hd(s.add.image(cx * TILE, cy * TILE, key).setOrigin(0).setDepth(DEPTH.tiles + 0.4).setFlipX(i !== hand && (cx * 3 + cy) % 3 === 0)));
      });
      const xs = g.cells.map((c) => c[0]);
      const ys = g.cells.map((c) => c[1]);
      const rect = new Phaser.Geom.Rectangle(Math.min(...xs) * TILE, Math.min(...ys) * TILE, (Math.max(...xs) - Math.min(...xs) + 1) * TILE, (Math.max(...ys) - Math.min(...ys) + 1) * TILE);
      for (let y = rect.y + 24; y < rect.bottom; y += 40) glows.push(this.glow(rect.centerX, y, AMBER, 0.7, 0.32, 2.4, 0.1, false));
      this.plugs.push({ id: g.id, cells: g.cells, imgs, glows, rect, shakeT: 0 });
    }
  }

  // golpe no Âmbar: só a Picareta quebra; as outras armas tilintam
  private hitPlug(pl: Plug, p: Player) {
    const s = this.s;
    if (!p.weapon.pick) {
      pl.shakeT = 0.18;
      s.sfx('tink', 0.9, 0.7);
      s.sfx('clang', 0.4, 1.6);
      this.shards.explode(3, p.facing > 0 ? pl.rect.x : pl.rect.right, p.body.center.y);
      s.thinkOnce('mine:amber', 'O Âmbar não cede. Precisa de uma ferramenta feita para a pedra.');
      return;
    }
    progress.seen.add(pl.id);
    progress.save();
    s.level.openAmber(pl.cells);
    for (const im of pl.imgs) {
      this.shards.explode(6, im.x + 8, im.y + 8);
      s.tweens.add({ targets: im, alpha: 0, duration: 160, onComplete: () => im.destroy() });
    }
    for (const g of pl.glows) s.tweens.add({ targets: g, alpha: 0, scale: g.scale * 2, duration: 600, onComplete: () => g.destroy() });
    this.glows = this.glows.filter((g) => !pl.glows.includes(g.g));
    this.plugs.splice(this.plugs.indexOf(pl), 1);
    s.sfx('glass', 1, 0.7);
    s.sfx('break', 0.9, 0.8);
    s.cameras.main.shake(200, 0.007);
    s.glowBurst(pl.rect.centerX, pl.rect.centerY, AMBER, 3);
  }

  // ---------- golpes e interação ----------
  strike(box: Phaser.Geom.Rectangle, p: Player) {
    let hit = false;
    for (const pl of [...this.plugs]) {
      if (p.hitSet.has(pl) || !overlap(box, pl.rect)) continue;
      p.hitSet.add(pl);
      this.hitPlug(pl, p);
      hit = true;
    }
    const c = this.cart;
    if (c && !p.hitSet.has(c) && overlap(box, this.cartRect)) {
      p.hitSet.add(c);
      if (c.rider) this.release();
      else if (c.state === 'park' || c.state === 'stop') {
        // de fora só faz barulho: o freio está preso por dentro
        this.s.sfx('clang', 0.7, 1.1);
        this.s.thinkOnce('mine:cart', 'O freio está preso por dentro. Só soltando lá de cima.');
      }
      hit = true;
    }
    return hit;
  }

  nearby(p: Player): { hint: string; act: () => void } | null {
    const c = this.cart;
    if (c?.rider) {
      if (c.state === 'park' || c.state === 'stop') return { hint: '{attack} soltar o freio · {jump} descer', act: () => {} };
      return { hint: '{down} agachar nas vigas · {jump} saltar fora', act: () => {} };
    }
    if (!p.onGround) return null;
    if (c && (c.state === 'park' || c.state === 'stop') && Math.abs(p.x - c.x) < 30 && Math.abs(p.body.bottom - (c.rail + 2)) < 12) {
      return { hint: '{up} subir no vagonete', act: () => this.board() };
    }
    for (const l of this.ledgers) {
      if (Math.abs(p.x - l.x) > 20 || Math.abs(p.body.bottom - l.y) > 10) continue;
      return {
        hint: '{up} ler o registro',
        act: () => {
          this.s.readRecord(l.id);
          l.glow.setAlpha(0.25);
        },
      };
    }
    return null;
  }

  // stopped: a Lembrança segura as prensas no lugar (o vagonete leva o cavaleiro, então segue)
  update(time: number, dt: number, stopped = false) {
    this.updateCart(dt);
    if (!stopped) {
      this.updatePresses(dt);
      this.updateCeil(dt);
    }
    // o Âmbar respira devagar; a chama da lamparina treme e a lamparina mal balança
    for (const g of this.glows) {
      const k = g.fire ? 0.86 + 0.1 * Math.sin(time * 0.013 + g.ph) + 0.05 * Math.sin(time * 0.041 + g.ph * 3) : 0.86 + 0.14 * Math.sin(time * 0.0016 + g.ph);
      g.g.setAlpha(g.base * k);
    }
    for (const l of this.lamps) l.img.setRotation(Math.sin(time * 0.0012 + l.ph) * 0.04);
    for (const pl of this.plugs) {
      if (pl.shakeT <= 0) continue;
      pl.shakeT -= dt;
      const dx = pl.shakeT > 0 ? Math.sin(pl.shakeT * 90) * 1.2 : 0;
      pl.imgs.forEach((im, i) => im.setX(pl.cells[i][0] * TILE + dx));
    }
  }
}

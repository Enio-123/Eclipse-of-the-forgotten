import Phaser from 'phaser';
import { PAL, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import { overlap } from '../entities/Enemy';
import { progress } from '../systems/Save';
import { DEPTH } from './Decor';
import { hd, hdScale } from '../gfx/flip';
import type { Breakable } from './secrets';
import { hdKey, type HdPiece } from '../gfx/hdAssets';
import type { DoorDef, TrapdoorDef } from './rooms';

// o véu fica acima de tudo do cenário e dos inimigos, abaixo do cavaleiro
const VEIL_DEPTH = DEPTH.enemy + 1.5;

export interface Door {
  i: number;
  x: number;
  y: number;
  def: DoorDef;
  sprite: Phaser.GameObjects.Image;
}

export interface LockGate {
  x: number;
  y: number;
  h: number;
  key: string;
  col: number;
  sprite: Phaser.GameObjects.Image;
  open: boolean;
}

export interface Wall {
  b: Breakable;
  hp: number;
  rect: Phaser.Geom.Rectangle;
  veil: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics | Phaser.GameObjects.Container;
  // trecho do mundo que a pintura do véu cobre
  area: { x: number; y: number; w: number; h: number };
  baseX: number;
  shakeT: number;
}

export interface Bell {
  i: number;
  x: number;
  top: number;
  sprite: Phaser.GameObjects.Image;
  angle: number;
  vel: number;
  rung: boolean;
}

export interface Cache {
  i: number;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  hp: number;
  open: boolean;
  baseX: number;
  shakeT: number;
}

export interface Page {
  id: string;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  phase: number;
  taken: boolean;
}

// ---------- prisão ----------
// alavanca no chão: um golpe e ela vira (a marca abre grades e alçapões com a mesma chave)
export interface Lever {
  i: number;
  x: number;
  y: number;
  key: string;
  base: Phaser.GameObjects.Image;
  handle: Phaser.GameObjects.Image;
  on: boolean;
}

// alçapão: duas folhas presas nas pontas; abertas, ficam penduradas para baixo
export interface Trapdoor {
  i: number;
  x0: number;
  x1: number;
  y: number;
  def: TrapdoorDef | null;
  open: boolean;
  leaves: Phaser.GameObjects.Image[];
  // cedendo sob os pés (o do cadafalso)
  giveT: number;
  // laje de pedra (look 'stone'): pedaços do chão pintado, cada um com a altura de onde saiu
  stone?: boolean;
}

// grade do alarme: escondida no teto até o alarme derrubar
export interface AlarmGate {
  x: number;
  ys: number[];
  top: number;
  h: number;
  sprite: Phaser.GameObjects.Image;
  down: boolean;
}

// argola de ferro onde o gancho morde
export interface Ring {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  lit: number;
}

// as chaves da prisão, penduradas na guarita
export interface Keys {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  taken: boolean;
}

// O que o cavaleiro golpeia ou atravessa e não é inimigo: portas, grades com chave, paredes
// falsas e vitrais, sinos da freira, cofres do dízimo e páginas do diário; na prisão, alavancas,
// alçapões, grades de cela, grades do alarme, argolas do gancho e as chaves
export class Fixtures {
  readonly doors: Door[] = [];
  readonly locks: LockGate[] = [];
  readonly walls: Wall[] = [];
  readonly bells: Bell[] = [];
  readonly caches: Cache[] = [];
  readonly pages: Page[] = [];
  readonly levers: Lever[] = [];
  readonly trapdoors: Trapdoor[] = [];
  readonly alarms: AlarmGate[] = [];
  readonly rings: Ring[] = [];
  // vigas dos poços já desenhadas (várias argolas podem pendurar da mesma)
  private beams = new Set<string>();
  // brilho das chamas das paredes das portas (tremem um pouco)
  private portalGlows: { g: Phaser.GameObjects.Image; ph: number }[] = [];
  // membranas abissais: a pele de tinta escorre devagar e a luz roxa respira atrás
  readonly membranes: { skin: Phaser.GameObjects.TileSprite; glow: Phaser.GameObjects.Image; k: number; x: number; y: number; h: number; ph: number }[] = [];
  keys: Keys | null = null;

  constructor(private scene: GameScene) {
    const s = scene;
    const L = s.level;
    const room = s.room;
    let di = 0;
    let bi = 0;
    let ci = 0;
    let pi = 0;
    for (const sp of L.spawns) {
      if (sp.kind === 'O') {
        const def = room.doors?.[di];
        if (def) this.addDoor(di, sp.x, sp.y, def);
        di++;
      } else if (sp.kind === 'b') this.addBell(bi++, sp.x, sp.y);
      else if (sp.kind === '$') this.addCache(ci++, sp.x, sp.y);
      else if (sp.kind === 'p') {
        const id = `${room.id}:${pi++}`;
        if (!progress.seen.has(`page:${id}`)) this.addPage(id, sp.x, sp.y);
      } else if (sp.kind === 'H') this.prop('deco-gallows', sp.x, sp.y + 1);
      else if (sp.kind === 'f') this.prop('deco-fountain', sp.x, sp.y + 1);
      else if (sp.kind === 'A') this.prop('deco-altar', sp.x, sp.y + 1);
      else if (sp.kind === 'n') this.prop('deco-anvil', sp.x, sp.y + 1);
      else if (sp.kind === 'Q') this.addLever(this.levers.length, sp.x, sp.y);
      else if (sp.kind === 'o') this.addRing(sp.x, sp.y - TILE / 2);
      else if (sp.kind === 'k' && !progress.seen.has('item:chaves')) this.addKeys(sp.x, sp.y);
    }
    this.addTrapdoors();
    this.addBars();
    this.addMembranes();
    this.addAlarms();
    // cada coluna de 'Y' é uma grade com a sua chave
    const cols = new Map<number, number[]>();
    for (const l of L.locks) cols.set(l.x, [...(cols.get(l.x) ?? []), l.y]);
    [...cols.keys()].sort((a, b) => a - b).forEach((x, k) => {
      const ys = cols.get(x)!;
      const top = Math.min(...ys);
      const h = (Math.max(...ys) - top + 1) * TILE;
      const sprite = s.add.image(x * TILE, top * TILE, 'deco-portcullis').setOrigin(0).setDepth(DEPTH.tiles - 0.5);
      sprite.setDisplaySize(TILE, h);
      const g: LockGate = { x: x * TILE, y: top * TILE, h, key: room.locks?.[k] ?? 'never', col: x, sprite, open: false };
      this.locks.push(g);
      if (progress.seen.has(g.key)) this.openLock(g, false);
    });
    for (const b of L.breakables) this.addWall(b);
  }

  // ---------- desenhos que faltam (enquanto a arte não chega) ----------
  private ensure(key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
    if (this.scene.textures.exists(key)) return key;
    const g = this.scene.add.graphics();
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
    return key;
  }

  private prop(key: string, x: number, y: number) {
    const k = this.ensure(key, 48, 40, (g) => g.fillStyle(0x2a2e3d).fillRect(0, 8, 48, 32));
    hd(this.scene.add.image(x, y, k).setOrigin(0.5, 1).setDepth(DEPTH.prop));
  }

  // ---------- portas ----------
  private addDoor(i: number, x: number, y: number, def: DoorDef) {
    const s = this.scene;
    const room = s.room.id;
    // a porta da máscara (entre a Fuga e a Sala da Máscara) é de ferro, com o rosto em relevo
    const mask = (room === 'fuga' && def.to === 'mascara') || (room === 'mascara' && def.to === 'fuga');
    const key = mask && s.textures.exists('deco-door-mask')
      ? 'deco-door-mask'
      : this.ensure('deco-door', 32, 56, (g) => {
          g.fillStyle(0x1a1410).fillRect(0, 8, 32, 48).fillEllipse(16, 10, 32, 20);
          g.fillStyle(0x3a2a1c).fillRect(3, 10, 26, 46).fillEllipse(16, 12, 26, 16);
          g.fillStyle(0x6b6f7c).fillRect(3, 24, 26, 2).fillRect(3, 42, 26, 2).fillRect(22, 32, 3, 3);
        });
    this.addPortal(x, y);
    const sprite = hd(s.add.image(x, y, key).setOrigin(0.5, 1).setDepth(DEPTH.prop));
    this.doors.push({ i, x, y, def, sprite });
  }

  // a parede onde a porta está: o pórtico da catedral na praça, a parede de capela dentro da
  // catedral e o paredão de pedra na prisão. Fica atrás do terreno (a rocha da sala corta as bordas)
  // e as chamas dela (lanterna, velas, tocha) acendem de verdade
  private addPortal(x: number, y: number) {
    const s = this.scene;
    const theme = s.level.theme;
    const key = theme === 'city' && s.room.id === 'praca' ? 'deco-portal-cathedral'
      : theme === 'city' || theme === 'nave' ? 'deco-portal-nave'
      : theme === 'prison' ? 'deco-portal-prison'
      : null;
    if (!key || !s.textures.exists(key)) return;
    hd(s.add.image(x, y, key).setOrigin(0.5, 1).setDepth(DEPTH.prop - 0.5));
    const lights = (s.cache.json.get('portal-lights') as Record<string, [number, number, number][]> | undefined)?.[key] ?? [];
    for (const [dx, dy, color] of lights) {
      const g = s.add.image(x + dx, y + dy, 'glow').setScale(0.9).setTint(color).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.prop - 0.4);
      this.portalGlows.push({ g, ph: Math.random() * Math.PI * 2 });
    }
  }

  // ---------- grades com chave ----------
  openLock(g: LockGate, animate: boolean, done?: () => void) {
    if (g.open) return;
    g.open = true;
    const s = this.scene;
    const y = g.y - g.h + 6;
    if (!animate) {
      g.sprite.y = y;
      s.level.setLock(g.col, true);
      done?.();
      return;
    }
    s.sfx('gate', 0.9);
    s.tweens.add({
      targets: g.sprite,
      y,
      duration: 2200,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        s.level.setLock(g.col, true);
        done?.();
      },
    });
  }

  openLocks(key: string, animate: boolean) {
    for (const g of this.locks) if (g.key === key) this.openLock(g, animate);
  }

  // ---------- paredes falsas e vitrais ----------
  private addWall(b: Breakable) {
    const s = this.scene;
    // a pintura do véu some aos poucos até 2 tiles em volta da passagem
    const pad = TILE * 2;
    const x = Math.max(0, b.x0 * TILE - pad);
    const y = Math.max(0, b.y0 * TILE - pad);
    const w = Math.min(s.level.widthPx, (b.x1 + 1) * TILE + pad) - x;
    const h = Math.min(s.level.heightPx, (b.y1 + 1) * TILE + pad) - y;
    const key = `terrain-${s.room.id}-secret`;
    let veil: Wall['veil'];
    if (s.textures.exists(key)) {
      veil = s.add.image(0, 0, key).setOrigin(0).setCrop(x, y, w, h).setDepth(VEIL_DEPTH);
    } else {
      // sem pintura: pedra lisa por cima do esconderijo e o bloco rachado
      const g = s.add.graphics().setDepth(VEIL_DEPTH);
      g.fillStyle(0x14161f);
      for (const [cx, cy] of b.veil) g.fillRect(cx * TILE, cy * TILE, TILE, TILE);
      g.fillStyle(b.ch === 'V' ? 0x3a3150 : PAL.stone);
      for (const [cx, cy] of b.cells) g.fillRect(cx * TILE, cy * TILE, TILE, TILE);
      g.lineStyle(1, b.ch === 'V' ? 0xc9a24a : 0x0e0f17, 0.8);
      for (const [cx, cy] of b.cells) g.lineBetween(cx * TILE + 3, cy * TILE + 2, cx * TILE + 12, cy * TILE + 14);
      veil = g;
    }
    const cx = b.cells.map((c) => c[0]);
    const cy = b.cells.map((c) => c[1]);
    const rect = new Phaser.Geom.Rectangle(
      Math.min(...cx) * TILE, Math.min(...cy) * TILE,
      (Math.max(...cx) - Math.min(...cx) + 1) * TILE, (Math.max(...cy) - Math.min(...cy) + 1) * TILE,
    );
    this.walls.push({ b, hp: b.ch === 'V' ? 2 : 3, rect, veil, area: { x, y, w, h }, baseX: veil.x, shakeT: 0 });
  }

  // EXTREME: a pintura do véu em 2x (pieces = pedaços da camada secreta da sala; null volta para a normal)
  useHdVeils(pieces: HdPiece[] | null, scale: number) {
    const s = this.scene;
    const key = `terrain-${s.room.id}-secret`;
    for (const w of this.walls) {
      const old = w.veil;
      if (old instanceof Phaser.GameObjects.Graphics) continue;
      const isHd = old instanceof Phaser.GameObjects.Container;
      if (!!pieces === isHd) continue;
      let veil: Wall['veil'];
      const a = w.area;
      if (pieces) {
        const c = s.add.container(0, 0).setDepth(VEIL_DEPTH);
        for (const p of pieces) {
          const x0 = Math.max(a.x, p.x);
          const y0 = Math.max(a.y, p.y);
          const x1 = Math.min(a.x + a.w, p.x + p.w);
          const y1 = Math.min(a.y + a.h, p.y + p.h);
          if (x1 <= x0 || y1 <= y0) continue;
          const img = s.add.image(p.x, p.y, hdKey(p.file)).setOrigin(0).setScale(1 / scale);
          img.setCrop((x0 - p.x) * scale, (y0 - p.y) * scale, (x1 - x0) * scale, (y1 - y0) * scale);
          c.add(img);
        }
        veil = c;
      } else veil = s.add.image(0, 0, key).setOrigin(0).setCrop(a.x, a.y, a.w, a.h).setDepth(VEIL_DEPTH);
      veil.setAlpha(old.alpha);
      old.destroy();
      w.veil = veil;
      w.baseX = 0;
    }
  }

  // a célula (em tiles) está escondida atrás de uma parede ainda de pé?
  veiled(tx: number, ty: number) {
    return this.walls.find((w) => w.b.veil.some(([x, y]) => x === tx && y === ty)) ?? null;
  }

  private hitWall(w: Wall, at: { x: number; y: number }) {
    const s = this.scene;
    w.hp--;
    w.shakeT = 0.18;
    if (w.hp > 0) {
      s.debris(at.x, at.y, w.b.ch === 'V' ? 'glass' : 'rock', 6);
      if (w.b.ch === 'V') s.sfx('tink', 0.9, 0.7);
      else s.sfx('thunk', 1, 0.8);
      s.sfx('crack', 0.5);
      return;
    }
    this.breakWall(w, true);
  }

  breakWall(w: Wall, loud: boolean) {
    const s = this.scene;
    const i = this.walls.indexOf(w);
    if (i < 0) return;
    this.walls.splice(i, 1);
    s.level.breakOpen(w.b);
    s.lighting?.refreshMask();
    progress.seen.add(w.b.id);
    if (!loud) {
      w.veil.destroy();
      return;
    }
    progress.save();
    const glass = w.b.ch === 'V';
    s.sfx(glass ? 'glass' : 'break');
    s.cameras.main.shake(glass ? 160 : 260, glass ? 0.004 : 0.008);
    for (const [cx, cy] of w.b.cells) s.debris(cx * TILE + 8, cy * TILE + 8, glass ? 'glass' : 'rock', glass ? 7 : 5);
    s.dustBurst(w.rect.centerX, w.rect.bottom, 14);
    s.tweens.add({ targets: w.veil, alpha: 0, duration: glass ? 260 : 520, onComplete: () => w.veil.destroy() });
    s.onSecret(w.b);
  }

  // ---------- sinos da freira ----------
  private addBell(i: number, x: number, bottom: number) {
    const s = this.scene;
    const L = s.level;
    const key = this.ensure('deco-bell', 26, 28, (g) => {
      g.fillStyle(0x6e5a32).fillTriangle(13, 0, 0, 26, 26, 26).fillRect(0, 22, 26, 6);
      g.fillStyle(0xb08d4a).fillTriangle(13, 3, 4, 24, 13, 24);
    });
    const top = bottom - s.textures.getFrame(key).height * hdScale(s, key);
    const tx = Math.floor(x / TILE);
    const ceil = L.ceilingAbove(tx, Math.floor(top / TILE) - 1);
    if (ceil >= 0 && Math.floor(top / TILE) - ceil <= 30) {
      s.add.tileSprite(x, (ceil + 1) * TILE, 5, top - (ceil + 1) * TILE + 3, 'deco-chain').setOrigin(0.5, 0).setDepth(DEPTH.support);
      s.add.image(x, (ceil + 1) * TILE, 'deco-anchor').setOrigin(0.5, 0).setDepth(DEPTH.support);
    } else {
      // sem teto: campanário de madeira em cima do telhado
      const ground = L.groundBelow(tx, Math.floor(bottom / TILE));
      const gy = ground >= 0 ? ground * TILE : bottom + 32;
      const beam = top - 6;
      for (const dx of [-17, 17]) s.add.tileSprite(x + dx, beam, 6, gy - beam, 'deco-post').setOrigin(0.5, 0).setDepth(DEPTH.support);
      s.add.tileSprite(x, beam - 2, 44, 6, 'deco-post').setOrigin(0.5, 0).setAngle(0).setDepth(DEPTH.support);
    }
    const sprite = hd(s.add.image(x, top, key).setOrigin(0.5, 0).setDepth(DEPTH.prop + 0.2));
    this.bells.push({ i, x, top, sprite, angle: 0, vel: 0, rung: progress.seen.has(this.bellKey(i)) });
  }

  bellKey(i: number) {
    return `bell:${this.scene.room.id}:${i}`;
  }

  private bellRect(b: Bell) {
    const h = b.sprite.displayHeight;
    return new Phaser.Geom.Rectangle(b.x - 14, b.top, 28, h + 2);
  }

  private ring(b: Bell, from: number) {
    const s = this.scene;
    b.vel += (from < b.x ? 1 : -1) * 260;
    // cada sino da cidade tem a sua nota (a freira reconhece pelo som)
    s.sfx('bell', 0.9, ({ telhados: 1, claustro: 1.26, nave: 0.84 } as Record<string, number>)[s.room.id] ?? 1.1);
    s.glowBurst(b.x, b.top + 14, 0xffd98a, 3);
    s.cameras.main.shake(120, 0.003);
    const first = !b.rung;
    b.rung = true;
    s.onBell(this.bellKey(b.i), first);
  }

  // ---------- cofres do dízimo ----------
  private addCache(i: number, x: number, y: number) {
    const s = this.scene;
    const shut = this.ensure('deco-cache', 24, 18, (g) => {
      g.fillStyle(0x2b2118).fillRect(0, 4, 24, 14);
      g.fillStyle(0x4a3a26).fillRect(1, 5, 22, 12);
      g.fillStyle(0xb08d4a).fillRect(0, 9, 24, 2).fillRect(10, 8, 4, 5);
    });
    const open = progress.seen.has(this.cacheKey(i));
    const key = open ? this.ensure('deco-cache-open', 24, 18, (g) => {
      g.fillStyle(0x2b2118).fillRect(0, 8, 24, 10);
      g.fillStyle(0x4a3a26).fillRect(1, 9, 22, 8);
      g.fillStyle(0x1a140e).fillRect(2, 0, 20, 7);
    }) : shut;
    const sprite = hd(s.add.image(x, y + 1, key).setOrigin(0.5, 1).setDepth(DEPTH.prop + 0.2));
    this.caches.push({ i, x, y, sprite, hp: 3, open, baseX: x, shakeT: 0 });
  }

  cacheKey(i: number) {
    return `cache:${this.scene.room.id}:${i}`;
  }

  private cacheRect(c: Cache) {
    return new Phaser.Geom.Rectangle(c.x - 12, c.y - 18, 24, 18);
  }

  private hitCache(c: Cache) {
    const s = this.scene;
    c.hp--;
    c.shakeT = 0.16;
    s.sfx('thunk', 0.9, 1.2);
    s.sfx('tink', 0.6);
    if (c.hp > 0) return;
    c.open = true;
    progress.seen.add(this.cacheKey(c.i));
    s.markDirty();
    c.sprite.setTexture(this.ensure('deco-cache-open', 24, 18, (g) => g.fillStyle(0x2b2118).fillRect(0, 8, 24, 10)));
    s.sfx('coinrain', 0.8);
    s.loot.coins(Phaser.Math.Between(16, 24), c.x, c.y - 10);
  }

  // ---------- páginas do diário ----------
  private addPage(id: string, x: number, y: number) {
    const s = this.scene;
    const key = this.ensure('deco-page', 10, 12, (g) => {
      g.fillStyle(0xe8e0cc).fillRect(0, 0, 10, 12);
      g.fillStyle(0x6b6250).fillRect(2, 3, 6, 1).fillRect(2, 6, 5, 1).fillRect(2, 9, 6, 1);
    });
    const py = y - 18;
    const glow = s.add.image(x, py, 'glow').setScale(1.1).setTint(0xfff1d6).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front);
    const sprite = hd(s.add.image(x, py, key).setDepth(DEPTH.enemy + 0.4));
    this.pages.push({ id, x, y: py, sprite, glow, phase: Math.random() * 6, taken: false });
  }

  // ---------- alavancas ----------
  private addLever(i: number, x: number, y: number) {
    const s = this.scene;
    const baseKey = this.ensure('deco-lever-base', 20, 10, (g) => {
      g.fillStyle(0x1c1d24).fillRect(0, 4, 20, 6);
      g.fillStyle(0x4a4e5c).fillRect(1, 5, 18, 3).fillCircle(10, 5, 4);
      g.fillStyle(0x2b2e38).fillCircle(10, 5, 2);
    });
    const handleKey = this.ensure('deco-lever-handle', 6, 26, (g) => {
      g.fillStyle(0x3a3d48).fillRect(2, 4, 2, 22);
      g.fillStyle(0x6b6f7c).fillRect(2, 4, 1, 22);
      g.fillStyle(0x2b2118).fillRect(0, 0, 6, 6);
      g.fillStyle(0x4a3a26).fillRect(1, 1, 4, 4);
    });
    const key = `lever:${s.room.id}:${i}`;
    const on = progress.seen.has(key);
    const handle = hd(s.add.image(x, y - 5, handleKey).setOrigin(0.5, 1).setDepth(DEPTH.prop + 0.1).setAngle(on ? 38 : -38));
    const base = hd(s.add.image(x, y + 1, baseKey).setOrigin(0.5, 1).setDepth(DEPTH.prop + 0.2));
    this.levers.push({ i, x, y, key, base, handle, on });
  }

  private leverRect(l: Lever) {
    return new Phaser.Geom.Rectangle(l.x - 12, l.y - 30, 24, 30);
  }

  private pull(l: Lever) {
    if (l.on) return;
    const s = this.scene;
    l.on = true;
    s.tweens.add({ targets: l.handle, angle: 38, duration: 260, ease: 'Back.easeOut' });
    s.sfx('clang', 0.8, 0.7);
    s.sfx('gate', 0.5, 1.2);
    s.cameras.main.shake(100, 0.003);
    s.onLever(l.key);
  }

  // ---------- alçapões ----------
  private addTrapdoors() {
    const s = this.scene;
    const L = s.level;
    const key = this.ensure('deco-trapdoor', 16, 16, (g) => {
      g.fillStyle(0x24190f).fillRect(0, 0, 16, 16);
      g.fillStyle(0x3d2b1b).fillRect(0, 1, 16, 4).fillRect(0, 6, 16, 4).fillRect(0, 11, 16, 4);
      g.fillStyle(0x5a5e6a).fillRect(0, 3, 16, 2).fillRect(0, 12, 16, 2);
      g.fillStyle(0x8a8e9a).fillRect(3, 3, 1, 1).fillRect(12, 12, 1, 1);
    });
    // cada trecho seguido de '=' na mesma linha é um alçapão, na ordem do mapa
    const cells = [...L.traps].sort((a, b) => a.y - b.y || a.x - b.x);
    const groups: { x0: number; x1: number; y: number }[] = [];
    for (const c of cells) {
      const g = groups[groups.length - 1];
      if (g && g.y === c.y && g.x1 === c.x - 1) g.x1 = c.x;
      else groups.push({ x0: c.x, x1: c.x, y: c.y });
    }
    groups.forEach((g, i) => {
      const w = (g.x1 - g.x0 + 1) * TILE;
      const half = w / 2;
      const y = g.y * TILE;
      const def = s.room.trapdoors?.[i] ?? null;
      if (def?.look === 'stone') {
        const t: Trapdoor = { i, x0: g.x0, x1: g.x1, y: g.y, def, open: false, leaves: this.stoneSlab(g, i), giveT: 0, stone: true };
        this.trapdoors.push(t);
        if (progress.seen.has(def.key)) this.openTrapdoor(t, false);
        return;
      }
      const left = s.add.image(g.x0 * TILE, y, key).setOrigin(0, 0).setDisplaySize(half, TILE).setDepth(DEPTH.tiles + 0.5);
      const right = s.add.image((g.x1 + 1) * TILE, y, key).setOrigin(1, 0).setDisplaySize(half, TILE).setDepth(DEPTH.tiles + 0.5).setFlipX(true);
      const t: Trapdoor = { i, x0: g.x0, x1: g.x1, y: g.y, def, open: false, leaves: [left, right], giveT: 0 };
      this.trapdoors.push(t);
      if (def && progress.seen.has(def.key)) this.openTrapdoor(t, false);
    });
  }

  // A laje que cede: copia um trecho do chão pintado ali do lado (do tampo até o fundo da sala) e
  // cobre o buraco com ele, em pedaços de um tile, com uma rachadura fina por cima
  private stoneSlab(g: { x0: number; x1: number; y: number }, i: number) {
    const s = this.scene;
    const L = s.level;
    const cols = g.x1 - g.x0 + 1;
    const rows = L.h - g.y;
    const key = `slab-${s.room.id}-${i}`;
    const terrain = `terrain-${s.room.id}`;
    if (!s.textures.exists(key)) {
      const ct = s.textures.createCanvas(key, cols * TILE, rows * TILE)!;
      const c = ct.context;
      if (s.textures.exists(terrain)) {
        // o trecho de chão inteiro mais perto à esquerda, fora do buraco
        const src = s.textures.get(terrain).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        const sx = Math.max(0, g.x0 - cols - 5) * TILE;
        c.drawImage(src, sx, g.y * TILE, cols * TILE, rows * TILE, 0, 0, cols * TILE, rows * TILE);
      } else {
        c.fillStyle = '#2c3335';
        c.fillRect(0, 0, cols * TILE, rows * TILE);
      }
      // a rachadura que a luta abriu
      c.strokeStyle = 'rgba(5,6,7,0.9)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(1, 3);
      let x = 1;
      let y = 3;
      while (x < cols * TILE - 2) {
        x += 3 + Math.random() * 4;
        y = Phaser.Math.Clamp(y + (Math.random() - 0.5) * 4, 1, 8);
        c.lineTo(x, y);
      }
      c.stroke();
      c.strokeStyle = 'rgba(160,170,180,0.25)';
      c.beginPath();
      c.moveTo(4, 1);
      c.lineTo(7, 5);
      c.lineTo(6, 9);
      c.stroke();
      ct.refresh();
      for (let yy = 0; yy < rows; yy++) for (let xx = 0; xx < cols; xx++) ct.add(yy * cols + xx, 0, xx * TILE, yy * TILE, TILE, TILE);
    }
    const out: Phaser.GameObjects.Image[] = [];
    for (let yy = 0; yy < rows; yy++) {
      for (let xx = 0; xx < cols; xx++) {
        const px = (g.x0 + xx) * TILE + TILE / 2;
        const py = (g.y + yy) * TILE + TILE / 2;
        out.push(s.add.image(px, py, key, yy * cols + xx).setDepth(DEPTH.tiles + 0.5).setData('y0', py));
      }
    }
    return out;
  }

  openTrapdoor(t: Trapdoor, animate: boolean) {
    if (t.open) return;
    t.open = true;
    const s = this.scene;
    for (let x = t.x0; x <= t.x1; x++) s.level.setBlock(x, t.y, false);
    if (t.stone) {
      // a laje racha e os pedaços despencam girando no escuro
      if (!animate) {
        for (const l of t.leaves) l.destroy();
        return;
      }
      s.sfx('crack', 1.1, 0.6);
      s.sfx('quake', 0.6, 1.3);
      s.cameras.main.shake(220, 0.006);
      t.leaves.forEach((l, k) => {
        const delay = (k % (t.x1 - t.x0 + 1)) * 40 + Math.floor(k / (t.x1 - t.x0 + 1)) * 25;
        s.tweens.add({
          targets: l,
          y: l.y + 260 + Math.random() * 80,
          x: l.x + (Math.random() - 0.5) * 30,
          angle: (Math.random() - 0.5) * 260,
          alpha: 0,
          delay,
          duration: 900 + Math.random() * 300,
          ease: 'Quad.easeIn',
          onComplete: () => l.destroy(),
        });
      });
      s.dustBurst((t.x0 + t.x1 + 1) * TILE * 0.5, t.y * TILE, 16);
      return;
    }
    const [left, right] = t.leaves;
    if (!animate) {
      left.setAngle(90);
      right.setAngle(-90);
      return;
    }
    s.sfx('door', 0.9, 0.7);
    s.sfx('thud', 0.7, 0.8);
    s.tweens.add({ targets: left, angle: 90, duration: 420, ease: 'Bounce.easeOut' });
    s.tweens.add({ targets: right, angle: -90, duration: 420, ease: 'Bounce.easeOut' });
    s.dustBurst((t.x0 + t.x1 + 1) * TILE * 0.5, t.y * TILE, 12);
  }

  // abre as grades com chave e os alçapões que esperam por essa marca
  unlock(key: string) {
    this.openLocks(key, true);
    for (const t of this.trapdoors) if (t.def?.key === key) this.openTrapdoor(t, true);
  }

  // o alçapão do cadafalso cede quando o cavaleiro pisa nele (depois do Arcebispo)
  private updateTrapdoors(dt: number) {
    const s = this.scene;
    const p = s.player;
    for (const t of this.trapdoors) {
      const d = t.def;
      if (t.open || !d?.auto || !progress.seen.has(d.auto)) continue;
      if (t.giveT > 0) {
        t.giveT -= dt;
        for (const l of t.leaves) l.y = ((l.getData('y0') as number | undefined) ?? t.y * TILE) + (Math.random() < 0.5 ? 1 : 0);
        if (t.giveT <= 0) {
          for (const l of t.leaves) l.y = (l.getData('y0') as number | undefined) ?? t.y * TILE;
          progress.seen.add(d.key);
          s.markDirty();
          this.openTrapdoor(t, true);
          if (d.thought) s.time.delayedCall(500, () => s.thoughtNow(d.thought!));
        }
        continue;
      }
      const tx = p.x / TILE;
      // não cede no meio de uma cena (pegando a arma do chefe, lendo uma memória)
      if (s.cinematic || p.frozen) continue;
      if (p.onGround && tx > t.x0 - 0.2 && tx < t.x1 + 1.2 && Math.abs(p.body.bottom - t.y * TILE) < 3) {
        t.giveT = 0.55;
        s.sfx('crack', 0.9, 0.7);
        s.sfx('door', 0.5, 0.5);
      }
    }
  }

  // ---------- grades de cela (só o Véu passa) ----------
  private addBars() {
    const s = this.scene;
    const key = this.ensure('deco-cellbars', 16, 16, (g) => {
      g.fillStyle(0x2a2d36).fillRect(3, 0, 3, 16).fillRect(10, 0, 3, 16);
      g.fillStyle(0x5a5e6a).fillRect(3, 0, 1, 16).fillRect(10, 0, 1, 16);
      g.fillStyle(0x3a3d48).fillRect(0, 7, 16, 2);
    });
    const cols = new Map<number, number[]>();
    for (const c of s.level.bars) cols.set(c.x, [...(cols.get(c.x) ?? []), c.y]);
    for (const [x, ys] of cols) {
      const top = Math.min(...ys);
      const h = (Math.max(...ys) - top + 1) * TILE;
      // a folha no traço liso tem mais pixels que o tile: reduz a repetição para o tamanho do mundo
      const k = hdScale(s, key);
      s.add.tileSprite(x * TILE, top * TILE, TILE, h, key).setOrigin(0).setTileScale(k, k).setDepth(DEPTH.tiles + 0.4);
    }
  }

  // ---------- membranas abissais (só o Véu passa) ----------
  private addMembranes() {
    const s = this.scene;
    const L = s.level;
    if (!L.membranes.length) return;
    const cols = new Map<number, number[]>();
    for (const c of L.membranes) cols.set(c.x, [...(cols.get(c.x) ?? []), c.y]);
    const k = hdScale(s, 'membrane');
    for (const [x, ys] of cols) {
      ys.sort((a, b) => a - b);
      // cada trecho seguido da coluna vira uma pele só
      let y0 = ys[0];
      for (let i = 1; i <= ys.length; i++) {
        if (i < ys.length && ys[i] === ys[i - 1] + 1) continue;
        const y1 = ys[i - 1];
        const h = (y1 - y0 + 1) * TILE;
        const cx = x * TILE + TILE / 2;
        const glow = s.add.image(cx, y0 * TILE + h / 2, 'glow').setTint(0x7029b8).setBlendMode(Phaser.BlendModes.ADD)
          .setDisplaySize(TILE * 3.2, h * 1.25).setAlpha(0.22).setDepth(DEPTH.tiles + 0.35);
        const skin = s.add.tileSprite(x * TILE, y0 * TILE, TILE, h, 'membrane').setOrigin(0).setTileScale(k, k).setDepth(DEPTH.tiles + 0.4);
        this.membranes.push({ skin, glow, k, x: cx, y: y0 * TILE, h, ph: Math.random() * 6 });
        if (i < ys.length) y0 = ys[i];
      }
    }
  }

  // ---------- grades do alarme ----------
  private addAlarms() {
    const s = this.scene;
    const cols = new Map<number, number[]>();
    for (const c of s.level.alarms) cols.set(c.x, [...(cols.get(c.x) ?? []), c.y]);
    for (const x of [...cols.keys()].sort((a, b) => b - a)) {
      const ys = cols.get(x)!;
      const top = Math.min(...ys);
      const h = (Math.max(...ys) - top + 1) * TILE;
      // escondida dentro do teto, atrás da pintura do terreno
      const sprite = s.add.image(x * TILE, top * TILE - h, 'deco-portcullis').setOrigin(0).setDepth(DEPTH.tiles - 0.5);
      sprite.setDisplaySize(TILE, h);
      this.alarms.push({ x, ys, top, h, sprite, down: false });
    }
  }

  // a grade cai; quem estiver embaixo é empurrado para o lado de onde veio
  dropAlarm(a: AlarmGate) {
    if (a.down) return;
    a.down = true;
    const s = this.scene;
    s.tweens.add({
      targets: a.sprite,
      y: a.top * TILE,
      duration: 300,
      ease: 'Quad.easeIn',
      onComplete: () => {
        const p = s.player;
        const b = p.body;
        const gx0 = a.x * TILE;
        const gx1 = gx0 + TILE;
        if (b.right > gx0 && b.left < gx1 && b.bottom > a.top * TILE) {
          const side = p.x < gx0 + TILE / 2 ? -1 : 1;
          b.x = side < 0 ? gx0 - b.width - 1 : gx1 + 1;
        }
        for (const y of a.ys) s.level.setBlock(a.x, y, true);
        s.sfx('clang', 0.9, 0.6);
        s.sfx('thud', 0.8);
        s.cameras.main.shake(140, 0.006);
        s.dustBurst(gx0 + TILE / 2, (a.top * TILE) + a.h, 10);
      },
    });
  }

  raiseAlarm(a: AlarmGate) {
    if (!a.down) return;
    a.down = false;
    const s = this.scene;
    for (const y of a.ys) s.level.setBlock(a.x, y, false);
    s.tweens.add({ targets: a.sprite, y: a.top * TILE - a.h, duration: 1600, ease: 'Sine.easeInOut' });
  }

  // ---------- argolas do gancho ----------
  private addRing(x: number, y: number) {
    const s = this.scene;
    const key = this.ensure('deco-ring', 18, 18, (g) => {
      g.fillStyle(0x1c1d24).fillRect(5, 0, 8, 6);
      g.fillStyle(0x4a4e5c).fillRect(6, 1, 6, 4);
      g.lineStyle(3, 0x2a2d36, 1).strokeCircle(9, 10, 6);
      g.lineStyle(1, 0x8a8e9a, 1).strokeCircle(9, 10, 6);
    });
    const glow = s.add.image(x, y, 'glow').setScale(1.2).setTint(0xbcd4ff).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front);
    const sprite = hd(s.add.image(x, y, key).setDepth(DEPTH.prop + 0.3));
    this.rings.push({ x, y, sprite, glow, lit: 0 });
    this.anchorRing(x, y);
  }

  // a argola fica presa em alguma coisa: corrente até o teto; num poço sem teto, corrente até uma
  // viga entre as duas paredes; com uma parede perto, um braço de ferro; sem nada, a corrente sobe
  // até sumir no alto da sala
  private anchorRing(x: number, y: number) {
    const s = this.scene;
    const L = s.level;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const top = y - 8;
    const chain = (y0: number) => {
      s.add.tileSprite(x, y0, 5, top - y0 + 2, 'deco-chain').setOrigin(0.5, 0).setDepth(DEPTH.prop + 0.25);
    };
    const ceil = L.ceilingAbove(tx, ty - 1);
    if (ceil >= 0 && ty - ceil <= 30) {
      const y0 = (ceil + 1) * TILE;
      chain(y0);
      s.add.image(x, y0, 'deco-anchor').setOrigin(0.5, 0).setDepth(DEPTH.prop + 0.26);
      return;
    }
    const wallAt = (dir: number) => {
      for (let d = 1; d <= 6; d++) if (L.solidCell(tx + dir * d, ty)) return tx + dir * d;
      return -1;
    };
    const lw = wallAt(-1);
    const rw = wallAt(1);
    if (lw >= 0 && rw >= 0) {
      // poço: a viga fica no alto, onde as duas paredes ainda existem
      let yb = ty;
      while (yb - 1 >= 0 && L.solidCell(lw, yb - 1) && L.solidCell(rw, yb - 1)) yb--;
      const by = (Math.min(yb + 1, ty - 2)) * TILE + 2;
      const key = `${lw}:${rw}:${by}`;
      if (!this.beams.has(key)) {
        this.beams.add(key);
        const x0 = (lw + 1) * TILE;
        const x1 = rw * TILE;
        s.add.tileSprite(x0, by, x1 - x0, 6, 'deco-post').setOrigin(0, 0).setDepth(DEPTH.support);
        s.add.image(x0, by + 4, 'deco-bracket').setOrigin(0, 0).setDepth(DEPTH.support);
        s.add.image(x1, by + 4, 'deco-bracket').setOrigin(1, 0).setFlipX(true).setDepth(DEPTH.support);
      }
      chain(by + 5);
      return;
    }
    const wall = lw >= 0 && tx - lw <= 4 ? lw : rw >= 0 && rw - tx <= 4 ? rw : -1;
    if (wall >= 0) {
      // braço de ferro saindo da parede, com a mão-francesa embaixo
      const face = wall < tx ? (wall + 1) * TILE : wall * TILE;
      const ay = top - 6;
      const w = Math.abs(x - face) + 3;
      s.add.tileSprite(Math.min(face, x - 3), ay, w, 4, 'deco-post').setOrigin(0, 0).setDepth(DEPTH.support);
      s.add.image(face, ay + 3, 'deco-bracket').setOrigin(wall < tx ? 0 : 1, 0).setFlipX(wall > tx).setDepth(DEPTH.support);
      chain(ay + 3);
      return;
    }
    chain(-8);
  }

  // a argola que o gancho alcança agora acende de leve
  markRing(r: Ring | null) {
    for (const o of this.rings) o.lit = o === r ? 1 : 0;
  }

  // ---------- as chaves ----------
  private addKeys(x: number, y: number) {
    const s = this.scene;
    const key = this.ensure('item-keys', 20, 22, (g) => {
      g.lineStyle(2, 0x8a7440, 1).strokeCircle(10, 6, 5);
      g.fillStyle(0xb09450).fillRect(4, 10, 2, 11).fillRect(9, 10, 2, 9).fillRect(14, 10, 2, 12);
      g.fillStyle(0xb09450).fillRect(4, 18, 4, 2).fillRect(9, 16, 4, 2).fillRect(14, 19, 4, 2);
    });
    const py = y - 26;
    const glow = s.add.image(x, py, 'glow').setScale(1.4).setTint(0xffd98a).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front);
    const sprite = hd(s.add.image(x, py, key).setDepth(DEPTH.enemy + 0.4));
    this.keys = { x, y: py, sprite, glow, taken: false };
  }

  // ---------- golpes ----------
  // o golpe do cavaleiro bate em paredes falsas, vitrais, sinos e cofres (uma vez por golpe)
  strike(box: Phaser.Geom.Rectangle, p: Player) {
    let hit = false;
    for (const w of [...this.walls]) {
      if (p.hitSet.has(w) || !overlap(box, w.rect)) continue;
      p.hitSet.add(w);
      const c = Phaser.Geom.Rectangle.Intersection(box, w.rect);
      this.hitWall(w, { x: c.centerX, y: c.centerY });
      hit = true;
    }
    for (const b of this.bells) {
      if (p.hitSet.has(b) || !overlap(box, this.bellRect(b))) continue;
      p.hitSet.add(b);
      this.ring(b, p.x);
      hit = true;
    }
    for (const c of this.caches) {
      if (c.open || p.hitSet.has(c) || !overlap(box, this.cacheRect(c))) continue;
      p.hitSet.add(c);
      this.hitCache(c);
      hit = true;
    }
    for (const l of this.levers) {
      if (l.on || p.hitSet.has(l) || !overlap(box, this.leverRect(l))) continue;
      p.hitSet.add(l);
      this.pull(l);
      hit = true;
    }
    return hit;
  }

  // flecha do arco: crava na parede falsa, toca o sino, bate no cofre
  arrow(rect: Phaser.Geom.Rectangle, tip: { x: number; y: number }, fromX: number) {
    for (const w of [...this.walls]) {
      if (!Phaser.Geom.Rectangle.Contains(w.rect, tip.x, tip.y) && !overlap(rect, w.rect)) continue;
      this.hitWall(w, tip);
      return true;
    }
    for (const b of this.bells) {
      if (!overlap(rect, this.bellRect(b))) continue;
      this.ring(b, fromX);
      return true;
    }
    for (const c of this.caches) {
      if (c.open || !overlap(rect, this.cacheRect(c))) continue;
      this.hitCache(c);
      return true;
    }
    for (const l of this.levers) {
      if (l.on || !overlap(rect, this.leverRect(l))) continue;
      this.pull(l);
      return true;
    }
    return false;
  }

  // ---------- interação ----------
  nearby(p: Player): { hint: string; act: () => void } | null {
    if (!p.onGround) return null;
    const s = this.scene;
    const b = p.body;
    for (const d of this.doors) {
      if (Math.abs(p.x - d.x) > 14 || Math.abs(b.bottom - d.y) > 8) continue;
      const key = d.def.key;
      if (d.def.bar && key && !progress.seen.has(key)) return { hint: '{up} tirar a tranca', act: () => s.unbar(d) };
      return { hint: '{up} entrar', act: () => s.useDoor(d) };
    }
    return null;
  }

  // pega as páginas (e as chaves) que o cavaleiro encostar
  touch(p: Player) {
    const b = p.body;
    const k = this.keys;
    if (k && !k.taken && Math.abs(p.x - k.x) < 14 && k.y > b.top - 8 && k.y < b.bottom + 6) {
      k.taken = true;
      this.scene.takeKeys(k.x, k.y);
      this.scene.tweens.add({ targets: k.sprite, scale: k.sprite.scale * 1.8, alpha: 0, duration: 380, onComplete: () => k.sprite.destroy() });
      this.scene.tweens.add({ targets: k.glow, scale: 4, alpha: 0, duration: 520, onComplete: () => k.glow.destroy() });
    }
    for (const pg of this.pages) {
      if (pg.taken) continue;
      if (Math.abs(p.x - pg.x) < 14 && pg.y > b.top - 8 && pg.y < b.bottom + 6) {
        pg.taken = true;
        this.scene.takePage(pg.id, pg.x, pg.y);
        this.scene.tweens.add({ targets: pg.sprite, scale: pg.sprite.scale * 1.8, alpha: 0, duration: 380, onComplete: () => pg.sprite.destroy() });
        this.scene.tweens.add({ targets: pg.glow, scale: 4, alpha: 0, duration: 520, onComplete: () => pg.glow.destroy() });
      }
    }
  }

  update(time: number, dt: number) {
    this.updateTrapdoors(dt);
    for (const m of this.membranes) {
      // a tinta desce sem parar e a pele ondula um pouco
      m.skin.tilePositionY -= (dt * 9) / m.k;
      m.skin.tilePositionX = Math.sin(time * 0.0016 + m.ph) * 0.6 / m.k;
      m.glow.setAlpha(0.18 + 0.07 * Math.sin(time * 0.0021 + m.ph));
      if (Math.random() < dt * 1.6) this.scene.echoMotes(m.x + (Math.random() - 0.5) * 10, m.y + Math.random() * m.h, Math.random() < 0.35);
    }
    for (const p of this.portalGlows) p.g.setAlpha(0.5 + Math.sin(time * 0.009 + p.ph) * 0.05 + Math.sin(time * 0.023 + p.ph * 2) * 0.04);
    for (const r of this.rings) {
      const target = r.lit ? 0.5 + Math.sin(time * 0.008) * 0.12 : 0;
      r.glow.alpha += (target - r.glow.alpha) * Math.min(1, dt * 12);
    }
    const k = this.keys;
    if (k && !k.taken) {
      const y = k.y + Math.sin(time * 0.0024) * 2;
      k.sprite.setPosition(k.x, y).setAngle(Math.sin(time * 0.0017) * 10);
      k.glow.setPosition(k.x, y).setAlpha(0.38 + Math.sin(time * 0.004) * 0.1);
    }
    for (const w of this.walls) {
      if (w.shakeT <= 0) continue;
      w.shakeT -= dt;
      w.veil.x = w.baseX + (w.shakeT > 0 ? Math.sin(w.shakeT * 90) * 1.5 : 0);
    }
    for (const c of this.caches) {
      if (c.shakeT <= 0) continue;
      c.shakeT -= dt;
      c.sprite.x = c.baseX + (c.shakeT > 0 ? Math.sin(c.shakeT * 80) * 1.5 : 0);
    }
    for (const b of this.bells) {
      // pêndulo amortecido (graus)
      b.vel += -b.angle * 38 * dt;
      b.vel *= Math.pow(0.985, dt * 60);
      b.angle += b.vel * dt;
      b.sprite.setAngle(b.angle);
    }
    for (const pg of this.pages) {
      if (pg.taken) continue;
      const y = pg.y + Math.sin(time * 0.0028 + pg.phase) * 2.5;
      pg.sprite.y = y;
      pg.sprite.setAngle(Math.sin(time * 0.0019 + pg.phase) * 8);
      pg.glow.y = y;
      pg.glow.alpha = 0.32 + Math.sin(time * 0.004 + pg.phase) * 0.1;
    }
  }
}

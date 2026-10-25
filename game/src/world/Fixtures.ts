import Phaser from 'phaser';
import { PAL, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import { overlap } from '../entities/Enemy';
import { progress } from '../systems/Save';
import { DEPTH } from './Decor';
import type { Breakable } from './secrets';
import type { DoorDef } from './rooms';

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
  veil: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
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

// O que o cavaleiro golpeia ou atravessa e não é inimigo: portas, grades com chave, paredes
// falsas e vitrais, sinos da freira, cofres do dízimo e páginas do diário
export class Fixtures {
  readonly doors: Door[] = [];
  readonly locks: LockGate[] = [];
  readonly walls: Wall[] = [];
  readonly bells: Bell[] = [];
  readonly caches: Cache[] = [];
  readonly pages: Page[] = [];

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
    }
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
    this.scene.add.image(x, y, k).setOrigin(0.5, 1).setDepth(DEPTH.prop);
  }

  // ---------- portas ----------
  private addDoor(i: number, x: number, y: number, def: DoorDef) {
    const key = this.ensure('deco-door', 32, 56, (g) => {
      g.fillStyle(0x1a1410).fillRect(0, 8, 32, 48).fillEllipse(16, 10, 32, 20);
      g.fillStyle(0x3a2a1c).fillRect(3, 10, 26, 46).fillEllipse(16, 12, 26, 16);
      g.fillStyle(0x6b6f7c).fillRect(3, 24, 26, 2).fillRect(3, 42, 26, 2).fillRect(22, 32, 3, 3);
    });
    const sprite = this.scene.add.image(x, y, key).setOrigin(0.5, 1).setDepth(DEPTH.prop);
    this.doors.push({ i, x, y, def, sprite });
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
    const pad = TILE;
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
    this.walls.push({ b, hp: b.ch === 'V' ? 2 : 3, rect, veil, baseX: veil.x, shakeT: 0 });
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
    const top = bottom - s.textures.getFrame(key).height;
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
    const sprite = s.add.image(x, top, key).setOrigin(0.5, 0).setDepth(DEPTH.prop + 0.2);
    this.bells.push({ i, x, top, sprite, angle: 0, vel: 0, rung: progress.seen.has(this.bellKey(i)) });
  }

  bellKey(i: number) {
    return `bell:${this.scene.room.id}:${i}`;
  }

  private bellRect(b: Bell) {
    const h = b.sprite.height;
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
    const sprite = s.add.image(x, y + 1, key).setOrigin(0.5, 1).setDepth(DEPTH.prop + 0.2);
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
    const sprite = s.add.image(x, py, key).setDepth(DEPTH.enemy + 0.4);
    this.pages.push({ id, x, y: py, sprite, glow, phase: Math.random() * 6, taken: false });
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

  // pega as páginas que o cavaleiro encostar
  touch(p: Player) {
    const b = p.body;
    for (const pg of this.pages) {
      if (pg.taken) continue;
      if (Math.abs(p.x - pg.x) < 14 && pg.y > b.top - 8 && pg.y < b.bottom + 6) {
        pg.taken = true;
        this.scene.takePage(pg.id, pg.x, pg.y);
        this.scene.tweens.add({ targets: pg.sprite, scale: 1.8, alpha: 0, duration: 380, onComplete: () => pg.sprite.destroy() });
        this.scene.tweens.add({ targets: pg.glow, scale: 4, alpha: 0, duration: 520, onComplete: () => pg.glow.destroy() });
      }
    }
  }

  update(time: number, dt: number) {
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

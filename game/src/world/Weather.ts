import Phaser from 'phaser';
import { TILE, VIEW_H, VIEW_W } from '../config';
import { audio } from '../systems/Audio';
import type { Level } from './Level';
import type { Point } from './Decor';

export interface WeatherOpts {
  rain: boolean;
  lightning: boolean;
  drips: number;
  petals: boolean;
  motes: boolean;
  // superfície que recebe a chuva: altura do chão em cada x do mundo, ou null
  floorAt?: (x: number) => number | null;
  puddles?: Point[];
  rims?: { setAlpha(a: number): unknown; alpha: number }[];
  boltDepth?: number;
  // quem está ouvindo as gotas (normalmente o jogador)
  listener?: () => Point;
}

interface Drip {
  x: number;
  y: number;
  floor: number;
  t: number;
  period: number;
  phase: 0 | 1 | 2;
  vy: number;
  img: Phaser.GameObjects.Image;
}

interface Floater {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  spin: number;
  base: number;
}

// Clima e partículas de ambiente: chuva com respingos, relâmpagos,
// gotas que pingam do teto, pétalas ao vento e poeira na luz.
export class Weather {
  private rainFar?: Phaser.GameObjects.TileSprite;
  private rainNear?: Phaser.GameObjects.TileSprite;
  private splash?: Phaser.GameObjects.Particles.ParticleEmitter;
  private ripples?: Phaser.GameObjects.Particles.ParticleEmitter;
  private flash?: Phaser.GameObjects.Rectangle;
  private bolt?: Phaser.GameObjects.Graphics;
  private nextBolt = 2.5 + Math.random() * 3;
  private drips: Drip[] = [];
  private floaters: Floater[] = [];
  private splashAcc = 0;
  private lastSX = 0;
  private lastSY = 0;
  private time = 0;

  constructor(private scene: Phaser.Scene, private level: Level | null, private o: WeatherOpts) {
    const cam = scene.cameras.main;
    this.lastSX = cam.scrollX;
    this.lastSY = cam.scrollY;
    if (o.rain) this.makeRain();
    if (o.lightning) this.makeLightning();
    if (o.drips > 0 && level) this.makeDrips(o.drips);
    if (o.petals) this.makeFloaters(46, true);
    if (o.motes) this.makeFloaters(36, false);
  }

  private makeRain() {
    const s = this.scene;
    this.rainFar = s.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'rain-far').setOrigin(0).setScrollFactor(0).setDepth(-9).setAlpha(0.55);
    this.rainNear = s.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'rain-near').setOrigin(0).setScrollFactor(0).setDepth(20).setAlpha(0.7);
    this.splash = s.add.particles(0, 0, 'px', {
      lifespan: { min: 150, max: 300 },
      speedX: { min: -38, max: 38 },
      speedY: { min: -95, max: -35 },
      gravityY: 520,
      scale: { start: 0.55, end: 0.25 },
      alpha: { start: 0.85, end: 0 },
      tint: [0xb6c6ee, 0xdbe5ff],
      emitting: false,
    }).setDepth(3);
    this.ripples = s.add.particles(0, 0, 'ripple', {
      lifespan: 340,
      scaleX: { start: 0.25, end: 1.25 },
      scaleY: 1,
      alpha: { start: 0.7, end: 0 },
      emitting: false,
    }).setDepth(2);
  }

  private makeLightning() {
    const s = this.scene;
    this.flash = s.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xdfe6ff).setOrigin(0).setScrollFactor(0).setDepth(40).setAlpha(0);
    this.flash.setBlendMode(Phaser.BlendModes.ADD);
    this.bolt = s.add.graphics().setScrollFactor(0).setDepth(this.o.boltDepth ?? -19);
  }

  private makeDrips(n: number) {
    const L = this.level!;
    const cands: { x: number; y: number; g: number }[] = [];
    for (let y = 0; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        if (!L.ceilingCell(x, y)) continue;
        const g = L.groundBelow(x, y + 1);
        if (g < 0 || g - (y + 1) < 2) continue;
        cands.push({ x, y, g });
      }
    }
    // espalha as fontes de gota pelo mapa (não todas juntas)
    Phaser.Utils.Array.Shuffle(cands);
    const used = new Set<number>();
    for (const c of cands) {
      if (this.drips.length >= n) break;
      if (used.has(c.x) || used.has(c.x - 1) || used.has(c.x + 1)) continue;
      used.add(c.x);
      const x = c.x * TILE + 3 + Math.floor(Math.random() * 10);
      const floor = c.g * TILE + (L.ch(c.x, c.g) === '^' ? 10 : 0);
      const img = this.scene.add.image(x, (c.y + 1) * TILE, 'drop').setOrigin(0.5, 0).setDepth(2).setVisible(false);
      this.drips.push({ x, y: (c.y + 1) * TILE, floor, t: Math.random() * 4, period: 1.6 + Math.random() * 3.4, phase: 0, vy: 0, img });
      if (L.ch(c.x, c.g) === '#') {
        this.scene.add.image(x, floor + 1, 'puddle').setOrigin(0.5, 1).setScale(0.55, 1).setAlpha(0.75).setDepth(1);
      }
    }
  }

  private makeFloaters(n: number, petals: boolean) {
    const s = this.scene;
    for (let i = 0; i < n; i++) {
      const img = petals
        ? s.add.image(0, 0, Math.random() < 0.5 ? 'petal-a' : 'petal-b')
        : s.add.image(0, 0, 'px').setScale(0.5).setTint(0xe9dcb4).setBlendMode(Phaser.BlendModes.ADD);
      img.setScrollFactor(0).setDepth(petals ? 21 : 19);
      const f: Floater = {
        img,
        x: Math.random() * VIEW_W,
        y: Math.random() * VIEW_H,
        vx: petals ? 14 + Math.random() * 22 : -4 + Math.random() * 8,
        vy: petals ? 10 + Math.random() * 18 : -6 + Math.random() * 4,
        phase: Math.random() * 10,
        spin: (Math.random() - 0.5) * 4,
        base: petals ? 0.95 : 0.25 + Math.random() * 0.4,
      };
      img.setAlpha(f.base);
      this.floaters.push(f);
    }
  }

  // ---------- relâmpago ----------
  strike() {
    if (!this.flash || !this.bolt) return;
    const s = this.scene;
    const g = this.bolt;
    const x0 = 50 + Math.random() * (VIEW_W - 100);
    const yEnd = 150 + Math.random() * 90;
    const main = this.boltPath(x0, -4, yEnd);
    const draw = () => {
      g.clear();
      g.lineStyle(3, 0x9fb4ff, 0.35);
      g.strokePoints(main.pts);
      for (const b of main.branches) g.strokePoints(b);
      g.lineStyle(1, 0xffffff, 1);
      g.strokePoints(main.pts);
      g.lineStyle(1, 0xdfe6ff, 0.8);
      for (const b of main.branches) g.strokePoints(b);
    };
    const rims = this.o.rims ?? [];
    draw();
    this.flash.setAlpha(0.3);
    rims.forEach((r) => r.setAlpha(1));
    s.time.delayedCall(70, () => {
      this.flash!.setAlpha(0.05);
      g.clear();
    });
    s.time.delayedCall(130, () => {
      this.flash!.setAlpha(0.22);
      draw();
    });
    s.time.delayedCall(200, () => {
      g.clear();
      s.tweens.add({ targets: this.flash, alpha: 0, duration: 380 });
      s.tweens.add({ targets: rims, alpha: 0, duration: 760, ease: 'Quad.easeIn' });
    });
    const near = Math.random() < 0.35;
    s.time.delayedCall(near ? 160 : 500 + Math.random() * 1200, () => audio.sfx('thunder', { vol: near ? 1 : 0.6 }));
  }

  private boltPath(x: number, y: number, yEnd: number) {
    const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(x, y)];
    const branches: Phaser.Math.Vector2[][] = [];
    let cx = x;
    let cy = y;
    while (cy < yEnd) {
      cy += 6 + Math.random() * 12;
      cx += (Math.random() - 0.5) * 18;
      pts.push(new Phaser.Math.Vector2(Math.round(cx), Math.round(cy)));
      if (Math.random() < 0.18) {
        const br = [new Phaser.Math.Vector2(Math.round(cx), Math.round(cy))];
        let bx = cx;
        let by = cy;
        const dir = Math.random() < 0.5 ? -1 : 1;
        for (let k = 0; k < 3 + Math.random() * 4; k++) {
          bx += dir * (4 + Math.random() * 10);
          by += 5 + Math.random() * 9;
          br.push(new Phaser.Math.Vector2(Math.round(bx), Math.round(by)));
        }
        branches.push(br);
      }
    }
    return { pts, branches };
  }

  update(dt: number) {
    this.time += dt;
    const cam = this.scene.cameras.main;
    const dx = cam.scrollX - this.lastSX;
    const dy = cam.scrollY - this.lastSY;
    this.lastSX = cam.scrollX;
    this.lastSY = cam.scrollY;
    if (this.rainFar && this.rainNear) {
      this.rainFar.tilePositionX += 105 * dt + dx * 0.6;
      this.rainFar.tilePositionY += -420 * dt + dy * 0.6;
      this.rainNear.tilePositionX += 175 * dt + dx;
      this.rainNear.tilePositionY += -700 * dt + dy;
      this.rainSplashes(dt);
    }
    if (this.flash) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 6 + Math.random() * 10;
        this.strike();
      }
    }
    if (this.drips.length) this.updateDrips(dt);
    if (this.floaters.length) this.updateFloaters(dt, dx, dy);
  }

  private rainSplashes(dt: number) {
    const floorAt = this.o.floorAt;
    if (!floorAt || !this.splash || !this.ripples) return;
    const v = this.scene.cameras.main.worldView;
    this.splashAcc += dt * 90;
    while (this.splashAcc >= 1) {
      this.splashAcc -= 1;
      const x = v.x + Math.random() * v.width;
      const y = floorAt(x);
      if (y === null || y < v.y - 4 || y > v.bottom + 4) continue;
      this.splash.explode(Math.random() < 0.5 ? 1 : 2, x, y - 1);
      if (Math.random() < 0.22) this.ripples.explode(1, x, y);
    }
    // poças recebem mais anéis
    for (const p of this.o.puddles ?? []) {
      if (p.x < v.x - 20 || p.x > v.right + 20) continue;
      if (Math.random() < dt * 4) this.ripples.explode(1, p.x - 9 + Math.random() * 18, p.y);
    }
  }

  // respingos em quem está na chuva (cabeça do cavaleiro)
  splashOn(x: number, y: number, dt: number) {
    if (this.splash && Math.random() < dt * 7) this.splash.explode(1, x - 5 + Math.random() * 10, y);
  }

  private updateDrips(dt: number) {
    const v = this.scene.cameras.main.worldView;
    const who = this.o.listener?.();
    for (const d of this.drips) {
      if (d.phase === 0) {
        d.t -= dt;
        if (d.t <= 0) {
          d.phase = 1;
          d.t = 0.8;
          d.img.setVisible(true).setPosition(d.x, d.y).setScale(0.4);
        }
      } else if (d.phase === 1) {
        // a gota cresce presa ao teto antes de cair
        d.t -= dt;
        d.img.setScale(0.4 + 0.6 * (1 - Math.max(0, d.t) / 0.8));
        if (d.t <= 0) {
          d.phase = 2;
          d.vy = 0;
        }
      } else {
        d.vy = Math.min(520, d.vy + 900 * dt);
        d.img.y += d.vy * dt;
        if (d.img.y + 4 >= d.floor) {
          d.phase = 0;
          d.t = d.period * (0.7 + Math.random() * 0.6);
          d.img.setVisible(false);
          const inView = d.x > v.x - 40 && d.x < v.right + 40 && d.floor > v.y - 40 && d.floor < v.bottom + 40;
          if (inView) {
            this.dripSplash(d.x, d.floor);
            if (who) {
              const dist = Math.hypot(who.x - d.x, who.y - d.floor);
              if (dist < 380) audio.sfx('drip', { vol: 0.9 * (1 - dist / 380), rate: 0.85 + Math.random() * 0.35 });
            }
          }
        }
      }
    }
  }

  private dripSplash(x: number, y: number) {
    if (!this.splash) {
      this.splash = this.scene.add.particles(0, 0, 'px', {
        lifespan: { min: 160, max: 320 },
        speedX: { min: -34, max: 34 },
        speedY: { min: -80, max: -30 },
        gravityY: 520,
        scale: { start: 0.55, end: 0.25 },
        alpha: { start: 0.9, end: 0 },
        tint: [0xa8c4e8, 0xdbe8ff],
        emitting: false,
      }).setDepth(3);
      this.ripples = this.scene.add.particles(0, 0, 'ripple', {
        lifespan: 360,
        scaleX: { start: 0.25, end: 1.1 },
        scaleY: 1,
        alpha: { start: 0.65, end: 0 },
        emitting: false,
      }).setDepth(2);
    }
    this.splash.explode(3 + Math.floor(Math.random() * 3), x, y - 1);
    this.ripples!.explode(1, x, y);
  }

  private updateFloaters(dt: number, dx: number, dy: number) {
    const t = this.time;
    for (const f of this.floaters) {
      const petal = f.spin !== 0 && f.img.texture.key.startsWith('petal');
      f.x += (f.vx + Math.sin(t * 1.3 + f.phase) * (petal ? 14 : 5)) * dt - dx * (petal ? 0.9 : 0.6);
      f.y += (f.vy + Math.cos(t * 0.9 + f.phase) * (petal ? 6 : 3)) * dt - dy * (petal ? 0.9 : 0.6);
      if (f.x > VIEW_W + 20) f.x -= VIEW_W + 40;
      if (f.x < -20) f.x += VIEW_W + 40;
      if (f.y > VIEW_H + 10) f.y -= VIEW_H + 20;
      if (f.y < -10) f.y += VIEW_H + 20;
      f.img.setPosition(Math.round(f.x), Math.round(f.y));
      if (petal) f.img.rotation += f.spin * dt;
      else f.img.alpha = f.base * (0.6 + 0.4 * Math.sin(t * 1.7 + f.phase));
    }
  }
}

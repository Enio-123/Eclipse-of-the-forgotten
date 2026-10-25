import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { overlap } from './Enemy';

// nuvem de incenso parada num lugar: cresce, sobe devagar e some
export interface Cloud {
  x: number;
  // base da nuvem (o chão onde o incensário bateu)
  y: number;
  w: number;
  h: number;
  life: number;
  t: number;
  puffs: Phaser.GameObjects.Image[];
  // quem já foi queimado por ela (as nuvens do cavaleiro queimam cada inimigo uma vez)
  hit: Set<unknown>;
}

// Nuvens de incenso de quem carrega um incensário (penitentes, o Arcebispo e o próprio cavaleiro).
// Machucam enquanto estão densas; no fim já não queimam.
export class SmokeField {
  readonly list: Cloud[] = [];

  constructor(private scene: GameScene, private tints: [number, number] = [0x7a7484, 0x9a94a2], private depth = 10.5) {}

  spawn(x: number, y: number, w: number, h: number, life: number) {
    const n = Math.max(4, Math.round(w / 7));
    const k = h / 24;
    const puffs: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < n; i++) {
      const px = x + (i - (n - 1) / 2) * (w / n) + (Math.random() - 0.5) * 4;
      const py = y - 5 * k - Math.random() * 12 * k;
      const img = this.scene.add
        .image(px, py, 'smoke')
        .setTint(this.tints[i % 2])
        .setDepth(this.depth)
        .setAlpha(0)
        .setAngle(Math.random() * 360)
        .setScale((0.5 + Math.random() * 0.2) * k);
      puffs.push(img);
    }
    const c: Cloud = { x, y, w, h, life, t: 0, puffs, hit: new Set() };
    this.list.push(c);
    return c;
  }

  rect(c: Cloud) {
    return new Phaser.Geom.Rectangle(c.x - c.w / 2, c.y - c.h, c.w, c.h);
  }

  // ainda densa o bastante para queimar
  burning(c: Cloud) {
    return c.t <= c.life - 0.3;
  }

  update(dt: number) {
    if (!this.list.length) return;
    for (const c of this.list) {
      c.t += dt;
      const k = c.t / c.life;
      const s = c.h / 24;
      c.puffs.forEach((img, i) => {
        const grow = Math.min(1, c.t * 5);
        const fade = k > 0.7 ? (1 - k) / 0.3 : 1;
        img.setAlpha(0.78 * grow * Math.max(0, fade));
        img.setScale((0.55 + 0.6 * grow + k * 0.35) * (i % 3 === 0 ? 1.15 : 1) * s);
        img.y -= dt * (4 + i);
        img.angle += dt * (i % 2 ? 12 : -9);
      });
      if (Math.random() < 0.3) this.scene.incense(c.x + (Math.random() - 0.5) * c.w, c.y - 4 - Math.random() * 10, 1);
    }
    for (const c of this.list) if (c.t >= c.life) c.puffs.forEach((img) => img.destroy());
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].t >= this.list[i].life) this.list.splice(i, 1);
  }

  // a nuvem que está queimando o cavaleiro agora (se houver)
  at(pr: Phaser.Geom.Rectangle) {
    return this.list.find((c) => this.burning(c) && overlap(pr, this.rect(c)));
  }

  harms(pr: Phaser.Geom.Rectangle) {
    return !!this.at(pr);
  }

  clear() {
    for (const c of this.list) c.puffs.forEach((img) => img.destroy());
    this.list.length = 0;
  }
}

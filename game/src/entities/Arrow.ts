import Phaser from 'phaser';
import { ARROW } from '../config';
import type { Level } from '../world/Level';
import { isSolid } from '../world/Level';

// Flecha do arco: anda em linha reta, crava na pedra e some depois de um tempo
export class Arrow {
  readonly img: Phaser.GameObjects.Image;
  dead = false;
  stuck = false;
  private life: number = ARROW.life;
  private stuckT = 0;

  constructor(scene: Phaser.Scene, public x: number, public y: number, readonly dx: number, readonly dy: number, readonly dmg: number) {
    this.img = scene.add.image(x, y, 'arrow').setDepth(11).setOrigin(0.85, 0.5);
    this.img.setRotation(Math.atan2(dy, dx));
  }

  get tip() {
    return { x: this.x + this.dx * 3, y: this.y + this.dy * 3 };
  }

  // devolve 'wall' quando crava na pedra
  update(dt: number, level: Level): 'wall' | null {
    if (this.stuck) {
      this.stuckT -= dt;
      if (this.stuckT < 0.4) this.img.setAlpha(Math.max(0, this.stuckT / 0.4));
      if (this.stuckT <= 0) this.destroy();
      return null;
    }
    this.life -= dt;
    if (this.life <= 0) {
      this.destroy();
      return null;
    }
    // avança em passos curtos para não atravessar paredes finas
    const dist = ARROW.speed * dt;
    const steps = Math.ceil(dist / 4);
    for (let i = 0; i < steps; i++) {
      this.x += (this.dx * dist) / steps;
      this.y += (this.dy * dist) / steps;
      const t = this.tip;
      if (isSolid(level.tileAt(t.x, t.y))) {
        this.stuck = true;
        this.stuckT = 1.6;
        this.img.setPosition(Math.round(this.x), Math.round(this.y));
        return 'wall';
      }
    }
    this.img.setPosition(Math.round(this.x), Math.round(this.y));
    return null;
  }

  get rect() {
    return new Phaser.Geom.Rectangle(this.x - 4 + this.dx * 4, this.y - 4 + this.dy * 4, 8, 8);
  }

  destroy() {
    this.dead = true;
    this.img.destroy();
  }
}

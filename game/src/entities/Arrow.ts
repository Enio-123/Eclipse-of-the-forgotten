import Phaser from 'phaser';
import { ARROW } from '../config';
import type { Level } from '../world/Level';
import { isSolid } from '../world/Level';
import { hd } from '../gfx/flip';

export interface ArrowOpts {
  // flecha inimiga: machuca o cavaleiro (e pode ser rebatida)
  hostile?: boolean;
  speed?: number;
  life?: number;
}

// Flecha: anda em linha reta, crava na pedra e some depois de um tempo. As do arco do cavaleiro
// acertam inimigos; as do arqueiro da sacada acertam o cavaleiro até serem rebatidas.
export class Arrow {
  readonly img: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image | null = null;
  dead = false;
  stuck = false;
  hostile: boolean;
  private speed: number;
  private life: number;
  private stuckT = 0;

  constructor(scene: Phaser.Scene, public x: number, public y: number, public dx: number, public dy: number, public dmg: number, opts: ArrowOpts = {}) {
    this.hostile = !!opts.hostile;
    this.speed = opts.speed ?? ARROW.speed;
    this.life = opts.life ?? ARROW.life;
    this.img = hd(scene.add.image(x, y, 'arrow').setDepth(11).setOrigin(0.85, 0.5));
    this.img.setRotation(Math.atan2(dy, dx));
    if (this.hostile) {
      // a flecha do inimigo vem avermelhada, com um brilho fraco para dar tempo de reagir
      this.img.setTint(0xffb08c);
      this.glow = scene.add.image(x, y, 'glow').setDepth(10.9).setTint(0xff8a5c).setAlpha(0.32).setScale(0.45, 0.22).setBlendMode(Phaser.BlendModes.ADD);
      this.glow.setRotation(this.img.rotation);
    }
  }

  get tip() {
    return { x: this.x + this.dx * 3, y: this.y + this.dy * 3 };
  }

  // rebatida por um golpe: volta pelo mesmo caminho, mais rápida, e passa a acertar inimigos
  deflect(dx: number, dy: number, speed: number, dmg: number) {
    const l = Math.hypot(dx, dy) || 1;
    this.dx = dx / l;
    this.dy = dy / l;
    this.speed = speed;
    this.dmg = dmg;
    this.hostile = false;
    this.life = 1.2;
    this.img.setTint(0xfff0c8).setRotation(Math.atan2(this.dy, this.dx));
    this.glow?.setTint(0xffd98a).setAlpha(0.5).setRotation(this.img.rotation);
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
    const dist = this.speed * dt;
    const steps = Math.ceil(dist / 4);
    for (let i = 0; i < steps; i++) {
      this.x += (this.dx * dist) / steps;
      this.y += (this.dy * dist) / steps;
      const t = this.tip;
      if (isSolid(level.tileAt(t.x, t.y))) {
        this.stuck = true;
        this.stuckT = 1.6;
        this.img.setPosition(Math.round(this.x), Math.round(this.y));
        this.glow?.destroy();
        this.glow = null;
        return 'wall';
      }
    }
    this.img.setPosition(Math.round(this.x), Math.round(this.y));
    this.glow?.setPosition(this.x - this.dx * 4, this.y - this.dy * 4);
    return null;
  }

  get rect() {
    return new Phaser.Geom.Rectangle(this.x - 4 + this.dx * 4, this.y - 4 + this.dy * 4, 8, 8);
  }

  destroy() {
    this.dead = true;
    this.img.destroy();
    this.glow?.destroy();
    this.glow = null;
  }
}

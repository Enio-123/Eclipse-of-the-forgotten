import Phaser from 'phaser';
import { CRAWLER as C } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { overlap, type Enemy, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';

// Penitente rastejante: patrulha, vira em paredes e bordas, dano por contato
export class Crawler implements Enemy {
  readonly kind = 'crawler' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  private dir: 1 | -1 = -1;
  private knockT = 0;
  private flashT = 0;
  // patrulha só em volta de onde nasceu
  private readonly homeX: number;
  private readonly range = 92;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.homeX = x;
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(600, 560);
    const o = scene.registry.get('penitent-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'penitent', 0).setOrigin(o.x, o.y).setDepth(8));
    if (Math.random() < 0.5) this.dir = 1;
    this.sprite.play({ key: 'penitent-crawl', startFrame: Math.floor(Math.random() * 6) });
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x + 2, b.y + 2, b.width - 4, b.height - 2);
  }

  update(dt: number) {
    if (!this.alive) return;
    const b = this.body;
    if (this.knockT > 0) {
      this.knockT -= dt;
      b.velocity.x *= Math.pow(0.88, dt * 60);
    } else {
      if (b.blocked.left || this.zone.x < this.homeX - this.range) this.dir = 1;
      else if (b.blocked.right || this.zone.x > this.homeX + this.range) this.dir = -1;
      if (b.blocked.down) {
        const l = this.scene.level;
        const aheadX = this.dir > 0 ? b.right + 2 : b.left - 2;
        const floor = l.tileAt(aheadX, b.bottom + 4);
        const wall = l.tileAt(aheadX, b.bottom - 6);
        if (!isGround(floor) || isSolid(wall)) this.dir = (this.dir * -1) as 1 | -1;
      }
      b.velocity.x = this.dir * C.speed;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(b.bottom));
    face(this.sprite, this.dir < 0);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    return !sliding && overlap(pr, this.rect);
  }

  hit(fromX: number, dmg = 1): HitResult {
    if (!this.alive) return 'ignored';
    this.hp -= dmg;
    const away = Math.sign(this.zone.x - fromX) || 1;
    this.body.velocity.x = away * C.knock;
    this.knockT = C.knockTime;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  // descanso na vela: sai do jogo sem morrer (a cena desfaz o desenho em cinza)
  vanish() {
    if (!this.alive) return null;
    this.alive = false;
    this.body.enable = false;
    return this.sprite;
  }

  private die() {
    this.alive = false;
    this.body.enable = false;
    this.scene.deathBurst(this.zone.x, this.zone.y);
    this.scene.time.delayedCall(80, () => this.sprite.clearTint());
    this.sprite.play('penitent-death');
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.scene.tweens.add({ targets: this.sprite, alpha: 0, delay: 900, duration: 700, onComplete: () => this.sprite.destroy() });
    });
  }
}

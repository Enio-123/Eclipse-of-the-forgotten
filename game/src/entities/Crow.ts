import Phaser from 'phaser';
import { CROW as C, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isSolid } from '../world/Level';
import { overlap, type Enemy, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';

type State = 'hover' | 'windup' | 'dive' | 'stuck' | 'recover' | 'hurt';

// Corvo do Dízimo: paira perto de onde nasceu, acende o olho e grasna antes de mergulhar
// em linha reta. Se errar e bater no chão, fica preso pelo bico por um instante.
export class Crow implements Enemy {
  readonly kind = 'crow' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  private state: State = 'hover';
  private t = 0;
  private cd = 0.8 + Math.random();
  private phase = Math.random() * 10;
  private facing: 1 | -1 = -1;
  private flashT = 0;
  private anim = '';
  private readonly home: Phaser.Math.Vector2;
  private readonly aim = new Phaser.Math.Vector2();

  constructor(private scene: GameScene, x: number, y: number) {
    this.home = new Phaser.Math.Vector2(x, y);
    this.zone = scene.add.zone(x, y, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.body.setMaxVelocity(500, 500);
    const o = scene.registry.get('crow-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, y, 'crow', 0).setOrigin(o.x, o.y).setDepth(8));
    this.sprite.play({ key: 'crow-fly', startFrame: Math.floor(Math.random() * 4) });
    this.anim = 'fly';
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x - 2, b.y - 2, b.width + 4, b.height + 4);
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`crow-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  // caminho livre até o jogador (sem rocha no meio)
  private sees(x: number, y: number) {
    const l = this.scene.level;
    const dx = x - this.zone.x;
    const dy = y - this.zone.y;
    const n = Math.ceil(Math.hypot(dx, dy) / (TILE / 2));
    for (let i = 1; i < n; i++) {
      if (isSolid(l.tileAt(this.zone.x + (dx * i) / n, this.zone.y + (dy * i) / n))) return false;
    }
    return true;
  }

  update(dt: number) {
    if (!this.alive) return;
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    this.cd -= dt;
    const px = p.x;
    const py = p.body.center.y;
    const dx = px - this.zone.x;
    const dy = py - this.zone.y;
    const blocked = b.blocked.down || b.blocked.up || b.blocked.left || b.blocked.right;
    let rot = 0;
    switch (this.state) {
      case 'hover': {
        this.phase += dt;
        const tx = this.home.x + Math.sin(this.phase * 0.8) * 34;
        const ty = this.home.y + Math.sin(this.phase * 1.9) * 7;
        b.velocity.set((tx - this.zone.x) * 2.4, (ty - this.zone.y) * 2.4);
        if (Math.abs(dx) < 240) this.facing = dx >= 0 ? 1 : -1;
        else if (Math.abs(b.velocity.x) > 8) this.facing = b.velocity.x > 0 ? 1 : -1;
        this.play('fly');
        if (!p.dead && this.cd <= 0 && Math.abs(dx) < C.sight && dy > -16 && dy < 190 && this.sees(px, py)) {
          this.go('windup', 'windup');
          this.scene.sfx('caw', 0.55);
        }
        break;
      }
      case 'windup':
        b.velocity.set(0, -26);
        this.facing = dx >= 0 ? 1 : -1;
        if (this.t > C.windup) {
          // mira um pouco à frente de onde o cavaleiro está indo
          this.aim.set(px + p.body.velocity.x * 0.18 - this.zone.x, py - this.zone.y).normalize();
          this.go('dive', 'dive');
          this.scene.sfx('swoosh', 0.6);
        }
        break;
      case 'dive':
        b.velocity.set(this.aim.x * C.diveSpeed, this.aim.y * C.diveSpeed);
        this.facing = this.aim.x >= 0 ? 1 : -1;
        rot = Math.atan2(this.aim.y, this.aim.x) - (this.facing < 0 ? Math.PI : 0);
        if (this.t > 0.05 && blocked) {
          this.go('stuck', 'stuck');
          this.scene.sfx('thunk');
          this.scene.dustBurst(this.zone.x + this.aim.x * 8, b.bottom, 6);
        } else if (this.t > C.diveTime) this.go('recover', 'fly');
        break;
      case 'stuck':
        b.velocity.set(0, 0);
        this.sprite.x += Math.sin(this.t * 60) * 0.6;
        if (this.t > C.stuckTime) this.go('recover', 'fly');
        break;
      case 'recover': {
        const hx = this.home.x - this.zone.x;
        const hy = this.home.y - this.zone.y;
        const d = Math.hypot(hx, hy);
        if (d < 10 || this.t > 3) {
          this.cd = C.cooldown;
          this.go('hover', 'fly');
          break;
        }
        b.velocity.set((hx / d) * 120, (hy / d) * 120);
        if (Math.abs(hx) > 4) this.facing = hx > 0 ? 1 : -1;
        break;
      }
      case 'hurt':
        b.velocity.scale(0.9);
        if (this.t > 0.26) this.go('recover', 'fly');
        break;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    if (this.state !== 'stuck') this.sprite.setPosition(Math.round(this.zone.x), Math.round(this.zone.y + 7));
    face(this.sprite, this.facing < 0);
    this.sprite.setRotation(rot);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    return this.alive && !sliding && overlap(pr, this.rect);
  }

  hit(fromX: number, dmg: number): HitResult {
    if (!this.alive) return 'ignored';
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    const away = Math.sign(this.zone.x - fromX) || 1;
    this.body.velocity.set(away * 190, -70);
    if (this.hp <= 0) this.die();
    else {
      this.go('hurt', 'hurt');
      this.cd = Math.max(this.cd, 0.9);
    }
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
    this.anim = 'death';
    this.sprite.setRotation(0);
    this.sprite.play('crow-death');
    this.scene.tweens.add({ targets: this.sprite, y: this.sprite.y + 40, alpha: 0, delay: 300, duration: 1000, ease: 'Quad.easeIn', onComplete: () => this.sprite.destroy() });
  }
}

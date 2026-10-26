import Phaser from 'phaser';
import { AMBAT as C, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isSolid } from '../world/Level';
import { overlap, type Enemy, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';

type State = 'roost' | 'drop' | 'hover' | 'windup' | 'dive' | 'stun' | 'recover' | 'hurt';

// Morcego de Âmbar: dorme de cabeça para baixo grudado no teto do veio. Acorda quando o cavaleiro
// passa embaixo, paira e, antes de atacar, o Âmbar das costas acende inteiro. O mergulho é em curva:
// desce na direção do cavaleiro e sobe de novo depois de passar (pule por cima ou corte na volta).
// Se bater na pedra no mergulho, fica tonto no chão, de barriga para cima.
export class AmberBat implements Enemy {
  readonly kind = 'ambat' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  private state: State = 'hover';
  private t = 0;
  private cd = 0.6 + Math.random() * 0.8;
  private phase = Math.random() * 10;
  private facing: 1 | -1 = -1;
  private flashT = 0;
  private anim = '';
  private readonly home: Phaser.Math.Vector2;
  private readonly vel = new Phaser.Math.Vector2();
  private readonly glow: Phaser.GameObjects.Image;
  // teto onde ele dorme (y da face de baixo da pedra)
  private ceil = -1;

  constructor(private scene: GameScene, x: number, y: number) {
    this.home = new Phaser.Math.Vector2(x, y);
    this.zone = scene.add.zone(x, y, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.body.setMaxVelocity(520, 520);
    const o = scene.registry.get('ambat-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, y, 'ambat', 0).setOrigin(o.x, o.y).setDepth(8));
    this.glow = scene.add.image(x, y, 'glow').setTint(0xffa63c).setBlendMode(Phaser.BlendModes.ADD).setDepth(8.1).setScale(0.6).setAlpha(0);
    // pedra logo acima: dorme pendurado nela
    const l = scene.level;
    for (let k = 0; k <= 5; k++) {
      const ty = Math.floor(y / TILE) - k;
      if (isSolid(l.tileAt(x, ty * TILE + 2))) {
        this.ceil = (ty + 1) * TILE;
        break;
      }
    }
    if (this.ceil > 0) {
      this.state = 'roost';
      this.body.reset(x, this.ceil + C.bodyH / 2 + 2);
      this.home.set(x, Math.max(y, this.ceil + 44));
      this.sprite.play({ key: 'ambat-roost', startFrame: Math.floor(Math.random() * 2) });
      this.anim = 'roost';
    } else {
      this.sprite.play({ key: 'ambat-fly', startFrame: Math.floor(Math.random() * 4) });
      this.anim = 'fly';
    }
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x - 2, b.y - 2, b.width + 4, b.height + 4);
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`ambat-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

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
    if (!this.alive) {
      this.glow.setAlpha(0);
      return;
    }
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
    let lit = 0;
    let sy = 7;
    switch (this.state) {
      case 'roost':
        b.velocity.set(0, 0);
        sy = 6;
        if (!p.dead && Math.abs(dx) < C.wake && dy > 0 && dy < 230 && this.sees(px, py)) {
          this.go('drop', 'fly');
          this.scene.sfx('caw', 0.45, 1.6);
          b.velocity.set(0, 60);
        }
        break;
      case 'drop':
        // solta do teto, vira no ar e sobe um pouco até o ponto de pairar
        b.velocity.y = Phaser.Math.Linear(b.velocity.y, (this.home.y - this.zone.y) * 3, Math.min(1, dt * 6));
        b.velocity.x *= 0.9;
        this.facing = dx >= 0 ? 1 : -1;
        if (this.t > 0.5) {
          this.cd = Math.min(this.cd, 0.4);
          this.go('hover', 'fly');
        }
        break;
      case 'hover': {
        this.phase += dt;
        // oito deitado em volta de onde nasceu
        const tx = this.home.x + Math.sin(this.phase * 0.9) * 38;
        const ty = this.home.y + Math.sin(this.phase * 1.8) * 9;
        b.velocity.set((tx - this.zone.x) * 2.6, (ty - this.zone.y) * 2.6);
        if (Math.abs(dx) < 240) this.facing = dx >= 0 ? 1 : -1;
        else if (Math.abs(b.velocity.x) > 8) this.facing = b.velocity.x > 0 ? 1 : -1;
        this.play('fly');
        if (!p.dead && this.cd <= 0 && Math.abs(dx) < C.sight && dy > -10 && dy < 200 && this.sees(px, py)) {
          this.go('windup', 'windup');
          this.scene.sfx('caw', 0.5, 1.35);
        }
        break;
      }
      case 'windup':
        b.velocity.set(-Math.sign(dx) * 20, -34);
        this.facing = dx >= 0 ? 1 : -1;
        lit = Math.min(1, this.t / C.windup);
        if (this.t > C.windup) {
          // mira um pouco abaixo e à frente do cavaleiro: o mergulho passa por ele e sobe
          this.vel.set(px + p.body.velocity.x * 0.2 - this.zone.x, py + 12 - this.zone.y).normalize().scale(C.diveSpeed);
          this.go('dive', 'dive');
          this.scene.sfx('swoosh', 0.7, 1.2);
        }
        break;
      case 'dive': {
        lit = 1;
        // depois de passar da altura do cavaleiro, a curva puxa para cima
        if (this.zone.y > py - 4 || this.t > 0.42) this.vel.y -= C.turn * dt;
        b.velocity.set(this.vel.x, this.vel.y);
        this.facing = this.vel.x >= 0 ? 1 : -1;
        rot = Math.atan2(this.vel.y, Math.abs(this.vel.x)) * 0.8 * this.facing;
        if (this.t > 0.06 && blocked) {
          this.go('stun', 'stun');
          this.scene.sfx('thunk', 0.8, 1.2);
          this.scene.sfx('glass', 0.35, 1.5);
          this.scene.dustBurst(this.zone.x, b.bottom, 6);
          this.scene.mine?.amberBurst(this.zone.x, this.zone.y, 3);
          b.velocity.set(0, 0);
          b.setAllowGravity(true);
        } else if (this.t > C.diveTime || (this.vel.y < -C.diveSpeed * 0.6 && this.zone.y < this.home.y)) this.go('recover', 'fly');
        break;
      }
      case 'stun':
        b.velocity.x *= 0.85;
        sy = 4;
        if (this.t > C.stunTime) {
          b.setAllowGravity(false);
          b.velocity.set(0, -90);
          this.go('recover', 'fly');
          this.scene.sfx('caw', 0.35, 1.5);
        }
        break;
      case 'recover': {
        const hx = this.home.x - this.zone.x;
        const hy = this.home.y - this.zone.y;
        const d = Math.hypot(hx, hy);
        if (d < 10 || this.t > 3) {
          this.cd = C.cooldown * (0.8 + Math.random() * 0.5);
          this.go('hover', 'fly');
          break;
        }
        b.velocity.set((hx / d) * 130, (hy / d) * 130);
        if (Math.abs(hx) > 4) this.facing = hx > 0 ? 1 : -1;
        break;
      }
      case 'hurt':
        b.velocity.scale(0.9);
        if (this.t > 0.26) {
          b.setAllowGravity(false);
          this.go('recover', 'fly');
        }
        break;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(this.zone.y + sy));
    face(this.sprite, this.facing < 0);
    this.sprite.setRotation(rot);
    const a = this.glow.alpha + (lit * 0.8 - this.glow.alpha) * Math.min(1, dt * 12);
    this.glow.setAlpha(a).setPosition(this.zone.x - this.facing * 2, this.zone.y + 2).setScale(0.5 + a * 0.35);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    return this.alive && !sliding && this.state !== 'roost' && this.state !== 'stun' && overlap(pr, this.rect);
  }

  hit(fromX: number, dmg: number): HitResult {
    if (!this.alive) return 'ignored';
    // tonto de barriga para cima: o Âmbar das costas fica exposto
    if (this.state === 'stun') dmg *= 1.5;
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    const away = Math.sign(this.zone.x - fromX) || 1;
    if (this.hp <= 0) this.die();
    else if (this.state !== 'stun') {
      this.body.setAllowGravity(false);
      this.body.velocity.set(away * 190, -70);
      this.go('hurt', 'hurt');
      this.cd = Math.max(this.cd, 0.9);
    }
    return 'hit';
  }

  vanish() {
    if (!this.alive) return null;
    this.alive = false;
    this.body.enable = false;
    this.glow.setAlpha(0);
    return this.sprite;
  }

  private die() {
    this.alive = false;
    this.body.enable = false;
    this.glow.setAlpha(0);
    const s = this.scene;
    s.deathBurst(this.zone.x, this.zone.y);
    s.mine?.amberBurst(this.zone.x, this.zone.y, 8);
    s.glowBurst(this.zone.x, this.zone.y, 0xffa63c, 2.4);
    s.sfx('glass', 0.45, 1.3);
    s.time.delayedCall(80, () => this.sprite.clearTint());
    this.anim = 'death';
    this.sprite.setRotation(0);
    this.sprite.play('ambat-death');
    s.tweens.add({ targets: this.sprite, y: this.sprite.y + 40, alpha: 0, delay: 300, duration: 1000, ease: 'Quad.easeIn', onComplete: () => this.sprite.destroy() });
  }

  destroy() {
    this.glow.destroy();
  }
}

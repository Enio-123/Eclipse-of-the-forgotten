import Phaser from 'phaser';
import { OWL as C, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isSolid } from '../world/Level';
import { overlap, type Enemy, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';

type State = 'perch' | 'alert' | 'dive' | 'fly' | 'land' | 'hurt' | 'stun';

interface Perch {
  x: number;
  // y dos pés (o topo do galho ou da pedra)
  y: number;
}

// Coruja de Geada: dorme pousada num galho, com a geada nas penas. Quando o cavaleiro passa embaixo
// abre os olhos e vira a cabeça; solta do galho num mergulho em curva (desce na direção dele e sobe
// depois de passar) e voa para outro galho perto, onde pousa e dorme de novo. As penas soltam geada.
// Bateu na pedra no mergulho: cai tonta no chão.
export class Owl implements Enemy {
  readonly kind = 'owl' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  private state: State = 'perch';
  private t = 0;
  private rest = 0.4;
  private facing: 1 | -1 = -1;
  private flashT = 0;
  private anim = '';
  private frostT = 0;
  private readonly vel = new Phaser.Math.Vector2();
  private readonly eyes: Phaser.GameObjects.Image;
  private perch: Perch;
  private readonly perches: Perch[];
  private target: Perch | null = null;

  constructor(private scene: GameScene, x: number, y: number) {
    // o galho (ou a pedra) logo abaixo de onde ela foi posta
    this.perch = this.findPerch(x, y) ?? { x, y };
    // os outros galhos da sala onde ela pode pousar (topo livre de um '-' ou de pedra com ar em cima)
    this.perches = this.collectPerches();
    this.zone = scene.add.zone(this.perch.x, this.perch.y - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.body.setMaxVelocity(520, 520);
    const o = scene.registry.get('owl-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(this.perch.x, this.perch.y, 'owl', 0).setOrigin(o.x, o.y).setDepth(8));
    this.eyes = scene.add.image(this.perch.x, this.perch.y - 12, 'glow').setTint(0xe8f4ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(8.1).setScale(0.28).setAlpha(0);
    this.facing = scene.player && scene.player.x > x ? 1 : -1;
    this.sprite.play({ key: 'owl-perch', startFrame: Math.floor(Math.random() * 2) });
    this.anim = 'perch';
  }

  private findPerch(x: number, y: number): Perch | null {
    const l = this.scene.level;
    const tx = Math.floor(x / TILE);
    for (let ty = Math.floor((y - 1) / TILE); ty < Math.floor(y / TILE) + 4 && ty < l.h; ty++) {
      const c = l.ch(tx, ty);
      if (c === '-' || l.solidCell(tx, ty)) return { x: tx * TILE + TILE / 2, y: ty * TILE };
    }
    return null;
  }

  private collectPerches() {
    const l = this.scene.level;
    const out: Perch[] = [];
    for (let ty = 1; ty < l.h; ty++) {
      for (let tx = 0; tx < l.w; tx++) {
        if (l.ch(tx, ty) !== '-') continue;
        // a ponta do galho não: só onde tem galho dos dois lados
        if (l.ch(tx - 1, ty) !== '-' || l.ch(tx + 1, ty) !== '-') continue;
        if (l.solidCell(tx, ty - 1) || l.solidCell(tx, ty - 2)) continue;
        out.push({ x: tx * TILE + TILE / 2, y: ty * TILE });
      }
    }
    return out;
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x - 2, b.y - 2, b.width + 4, b.height + 4);
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`owl-${name}`);
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

  // o próximo galho: perto do cavaleiro, longe do último, que ela enxerga daqui
  private nextPerch(): Perch {
    const p = this.scene.player;
    let best: Perch | null = null;
    let bestScore = Infinity;
    for (const q of this.perches) {
      const d = Math.hypot(q.x - this.zone.x, q.y - this.zone.y);
      if (d < 48 || d > 360) continue;
      if (Math.abs(q.x - this.perch.x) < 40 && Math.abs(q.y - this.perch.y) < 20) continue;
      if (!this.sees(q.x, q.y - 10)) continue;
      const score = Math.abs(q.x - p.x) * 0.6 + d * 0.4 + Math.random() * 40;
      if (score < bestScore) {
        bestScore = score;
        best = q;
      }
    }
    return best ?? this.perch;
  }

  update(dt: number) {
    if (!this.alive) {
      this.eyes.setAlpha(0);
      return;
    }
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    this.rest -= dt;
    const px = p.x;
    const py = p.body.center.y;
    const dx = px - this.zone.x;
    const dy = py - this.zone.y;
    const blocked = b.blocked.down || b.blocked.up || b.blocked.left || b.blocked.right;
    let rot = 0;
    let lit = 0;
    switch (this.state) {
      case 'perch':
        b.velocity.set(0, 0);
        b.reset(this.perch.x, this.perch.y - C.bodyH / 2);
        if (!p.dead && this.rest <= 0 && Math.abs(dx) < C.wake && dy > 20 && dy < C.below && this.sees(px, py)) {
          this.facing = dx >= 0 ? 1 : -1;
          this.go('alert', 'alert');
          this.scene.sfx('hoot', 0.7, 1.15);
        }
        break;
      case 'alert':
        b.velocity.set(0, 0);
        lit = Math.min(1, this.t / C.alert);
        this.facing = dx >= 0 ? 1 : -1;
        if (this.t > C.alert) {
          // mira um pouco abaixo e à frente dele: o mergulho passa por ele e sobe
          this.vel.set(px + p.body.velocity.x * 0.25 - this.zone.x, py + 14 - this.zone.y).normalize().scale(C.diveSpeed);
          this.go('dive', 'dive');
          this.scene.sfx('flap', 0.8, 1.2);
          this.scene.sfx('swoosh', 0.6, 1.3);
          this.scene.frostBurst(this.zone.x, this.zone.y, 6);
        }
        break;
      case 'dive': {
        lit = 1;
        if (this.zone.y > py - 4 || this.t > 0.45) this.vel.y -= C.turn * dt;
        b.velocity.set(this.vel.x, this.vel.y);
        this.facing = this.vel.x >= 0 ? 1 : -1;
        rot = Math.atan2(this.vel.y, Math.abs(this.vel.x)) * 0.7 * this.facing;
        this.frostT -= dt;
        if (this.frostT <= 0) {
          this.frostT = 0.05;
          this.scene.frostBurst(this.zone.x - this.facing * 6, this.zone.y, 1);
        }
        if (this.t > 0.06 && blocked) {
          this.go('stun', 'stun');
          this.scene.sfx('thunk', 0.7, 1.3);
          this.scene.frostBurst(this.zone.x, this.zone.y, 8);
          b.velocity.set(0, 0);
          b.setAllowGravity(true);
        } else if (this.t > C.diveTime || (this.vel.y < -C.diveSpeed * 0.5 && this.zone.y < py - 60)) {
          this.target = this.nextPerch();
          this.go('fly', 'fly');
        }
        break;
      }
      case 'fly': {
        const q = this.target ?? this.perch;
        const hx = q.x - this.zone.x;
        const hy = q.y - C.bodyH / 2 - this.zone.y;
        const d = Math.hypot(hx, hy);
        if (d < 6 || this.t > 4) {
          this.perch = q;
          this.go('land', 'land');
          this.scene.sfx('flap', 0.4, 0.9);
          this.scene.frostBurst(q.x, q.y, 4);
          break;
        }
        // voa em arco: sobe um pouco no meio do caminho
        const sp = Math.min(C.fly, d * 3);
        b.velocity.set((hx / d) * sp, (hy / d) * sp - Math.min(60, d * 0.3));
        if (Math.abs(hx) > 4) this.facing = hx > 0 ? 1 : -1;
        if (Math.random() < dt * 3) this.scene.sfx('flap', 0.2, 1.1 + Math.random() * 0.2);
        break;
      }
      case 'land':
        b.velocity.set(0, 0);
        b.reset(this.perch.x, this.perch.y - C.bodyH / 2);
        if (this.t > 0.35) {
          this.rest = C.rest * (0.8 + Math.random() * 0.4);
          this.go('perch', 'perch');
        }
        break;
      case 'stun':
        b.velocity.x *= 0.85;
        if (this.t > 1.2) {
          b.setAllowGravity(false);
          this.target = this.nextPerch();
          this.go('fly', 'fly');
          this.scene.sfx('hoot', 0.4, 1.3);
        }
        break;
      case 'hurt':
        b.velocity.scale(0.9);
        if (this.t > 0.26) {
          b.setAllowGravity(false);
          this.target = this.nextPerch();
          this.go('fly', 'fly');
        }
        break;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    const perched = this.state === 'perch' || this.state === 'alert' || this.state === 'land';
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(perched ? this.perch.y : this.body.bottom));
    face(this.sprite, this.facing < 0);
    this.sprite.setRotation(rot);
    const a = this.eyes.alpha + (lit * 0.8 - this.eyes.alpha) * Math.min(1, dt * 12);
    this.eyes.setAlpha(a).setPosition(this.zone.x + this.facing * 3, (perched ? this.perch.y : this.body.bottom) - 13).setScale(0.22 + a * 0.18);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    return this.alive && !sliding && (this.state === 'dive' || this.state === 'fly') && overlap(pr, this.rect);
  }

  hit(fromX: number, dmg: number): HitResult {
    if (!this.alive) return 'ignored';
    if (this.state === 'stun' || this.state === 'perch') dmg *= 1.5;
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    this.scene.frostBurst(this.zone.x, this.zone.y, 5);
    const away = Math.sign(this.zone.x - fromX) || 1;
    if (this.hp <= 0) this.die();
    else if (this.state !== 'stun') {
      this.body.setAllowGravity(false);
      this.body.velocity.set(away * 170, -90);
      this.go('hurt', 'hurt');
      this.scene.sfx('hoot', 0.4, 1.6);
    }
    return 'hit';
  }

  vanish() {
    if (!this.alive) return null;
    this.alive = false;
    this.body.enable = false;
    this.eyes.setAlpha(0);
    return this.sprite;
  }

  private die() {
    this.alive = false;
    this.body.enable = false;
    this.eyes.setAlpha(0);
    const s = this.scene;
    s.deathBurst(this.zone.x, this.zone.y);
    s.frostBurst(this.zone.x, this.zone.y, 14);
    s.featherBurst(this.zone.x, this.zone.y);
    s.sfx('hoot', 0.5, 0.7);
    s.time.delayedCall(80, () => this.sprite.clearTint());
    this.anim = 'death';
    this.sprite.setRotation(0);
    this.sprite.play('owl-death');
    s.tweens.add({ targets: this.sprite, y: this.sprite.y + 36, alpha: 0, delay: 300, duration: 1000, ease: 'Quad.easeIn', onComplete: () => this.sprite.destroy() });
  }

  destroy() {
    this.eyes.destroy();
  }
}

import Phaser from 'phaser';
import { PARRY, PLAYER, TILE, WOLF as C } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { overlap, type Enemy, type HitDir, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';

type State = 'trot' | 'howl' | 'chase' | 'crouch' | 'pounce' | 'skid' | 'hurt' | 'stagger';

// Lobo da Caça: os cães da Casa Vhalor. Congelaram correndo atrás de alguém e continuam correndo: a
// geada cobre o pelo das costas e os olhos acendem azul quando ele acha a presa. Trota em volta de
// onde está; quando vê o cavaleiro, para e uiva (os lobos perto respondem e vêm junto), corre atrás
// e, perto, agacha e salta mordendo. Depois do salto escorrega no chão (no gelo, bem mais longe) e
// fica aberto. Cai na água gelada e não sai mais.
export class Wolf implements Enemy {
  readonly kind = 'wolf' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  facing: 1 | -1 = -1;
  private state: State = 'trot';
  private t = 0;
  private atkCd = 0.6;
  private flashT = 0;
  private lostT = 0;
  private anim = '';
  private howled = false;
  // ouviu outro lobo uivar: daqui a pouco responde e vem
  private callT = -1;
  private readonly homeX: number;
  private readonly eyes: Phaser.GameObjects.Image;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.homeX = x;
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(360, 760);
    const o = scene.registry.get('wolf-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'wolf', 0).setOrigin(o.x, o.y).setDepth(8));
    this.eyes = scene.add.image(x, feetY - 16, 'glow').setTint(0x9fd8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(8.1).setScale(0.3).setAlpha(0);
    this.facing = Math.random() < 0.5 ? 1 : -1;
    this.play('trot');
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x, b.y - 4, b.width, b.height + 4);
  }

  // a boca, na frente da cabeça (o salto morde com ela)
  private get biteBox() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.right - 6 : b.left - 12, b.top - 6, 18, 20);
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`wolf-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  private get onIce() {
    const b = this.body;
    return b.blocked.down && this.scene.level.iceCell(Math.floor(b.center.x / TILE), Math.floor((b.bottom + 2) / TILE));
  }

  private edgeAhead(dir: number) {
    const l = this.scene.level;
    const b = this.body;
    const ax = dir > 0 ? b.right + 3 : b.left - 3;
    return !isGround(l.tileAt(ax, b.bottom + 4)) || isSolid(l.tileAt(ax, b.bottom - 8));
  }

  private stopAtEdge() {
    const b = this.body;
    if (b.velocity.x === 0 || !b.blocked.down) return;
    if (this.edgeAhead(Math.sign(b.velocity.x))) b.velocity.x = 0;
  }

  // nada de rocha entre ele e o cavaleiro na altura do focinho
  private clearTo(x: number) {
    const l = this.scene.level;
    const y = this.body.bottom - 14;
    const step = Math.sign(x - this.zone.x) * (TILE / 2);
    if (step === 0) return true;
    for (let xx = this.zone.x + step; Math.abs(xx - this.zone.x) < Math.abs(x - this.zone.x); xx += step) {
      if (isSolid(l.tileAt(xx, y))) return false;
    }
    return true;
  }

  // outro lobo uivou perto: responde e entra na caçada
  hear(x: number) {
    if (!this.alive || this.state !== 'trot' || this.callT >= 0) return;
    if (Math.abs(x - this.zone.x) > C.call) return;
    this.callT = 0.35 + Math.random() * 0.4;
  }

  // chamado pela trompa: já entra correndo, sem uivar
  hunt(x: number) {
    this.howled = true;
    this.facing = x >= this.zone.x ? 1 : -1;
    this.atkCd = 0.5;
    this.go('chase', 'run');
  }

  private startHowl(answer: boolean) {
    const b = this.body;
    b.velocity.x = 0;
    this.go('howl', 'howl');
    this.howled = true;
    this.scene.sfx('howl', answer ? 0.5 : 0.8, answer ? 1.08 + Math.random() * 0.1 : 1);
    if (!answer) for (const e of this.scene.enemies) if (e !== this && e instanceof Wolf) e.hear(this.zone.x);
  }

  private pounce() {
    const p = this.scene.player;
    const b = this.body;
    const g = PLAYER.gravity;
    const lead = Phaser.Math.Clamp(p.body.velocity.x * 0.18, -36, 36);
    const dx = Phaser.Math.Clamp(p.x + lead - this.zone.x, -C.pounceMax, C.pounceMax);
    const vy = Math.sqrt(2 * g * C.pounceApex);
    const T = (2 * vy) / g;
    b.setVelocity(Phaser.Math.Clamp(dx / T, -C.pounceSpeed, C.pounceSpeed), -vy);
    if (Math.abs(dx) > 4) this.facing = dx > 0 ? 1 : -1;
    this.go('pounce', 'pounce');
    this.scene.sfx('swoosh', 0.6, 1.05);
    this.scene.sfx('growl', 0.5, 1.2);
  }

  update(dt: number) {
    if (!this.alive) {
      this.eyes.setAlpha(0);
      return;
    }
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    this.atkCd -= dt;
    const dx = p.x - this.zone.x;
    const dy = p.body.bottom - b.bottom;
    const seen = !p.dead && Math.abs(dx) < C.sight && Math.abs(dy) < 110 && this.clearTo(p.x);
    const ice = this.onIce;

    switch (this.state) {
      case 'trot': {
        if (Math.abs(this.zone.x - this.homeX) > 64) this.facing = this.zone.x > this.homeX ? -1 : 1;
        b.velocity.x = this.facing * C.trot;
        this.stopAtEdge();
        if (b.velocity.x === 0 && b.blocked.down) this.facing = (this.facing * -1) as 1 | -1;
        this.play('trot');
        if (this.callT >= 0) {
          this.callT -= dt;
          if (this.callT < 0) {
            this.facing = dx >= 0 ? 1 : -1;
            this.startHowl(true);
          }
        } else if (seen) {
          this.facing = dx >= 0 ? 1 : -1;
          if (!this.howled) this.startHowl(false);
          else this.go('chase', 'run');
        }
        break;
      }
      case 'howl':
        b.velocity.x = 0;
        if (this.t > C.howl) {
          this.atkCd = Math.max(this.atkCd, 0.2);
          this.go('chase', 'run');
        }
        break;
      case 'chase': {
        this.lostT = seen ? 0 : this.lostT + dt;
        if (this.lostT > 3.5) {
          this.go('trot', 'trot');
          break;
        }
        const dist = Math.abs(dx);
        if (dist > 8) this.facing = dx >= 0 ? 1 : -1;
        if (this.atkCd <= 0 && b.blocked.down && Math.abs(dy) < 60 && dist < C.pounceMax * 0.75 && seen) {
          b.velocity.x = 0;
          this.go('crouch', 'crouch');
          this.scene.sfx('growl', 0.6, 0.9);
          break;
        }
        // no gelo ele demora para virar (as patas escorregam)
        const want = dist > 36 ? this.facing * C.run : 0;
        b.velocity.x = ice ? Phaser.Math.Linear(b.velocity.x, want, Math.min(1, dt * 2.2)) : want;
        this.play(Math.abs(b.velocity.x) > 20 ? 'run' : 'idle');
        this.stopAtEdge();
        break;
      }
      case 'crouch':
        b.velocity.x *= ice ? 0.97 : 0.6;
        this.facing = dx >= 0 ? 1 : -1;
        if (this.t > C.crouch) this.pounce();
        break;
      case 'pounce':
        if (b.blocked.left || b.blocked.right) b.velocity.x = 0;
        if (b.blocked.up && b.velocity.y < 0) b.velocity.y = 0;
        if (this.t > 0.08 && b.blocked.down) {
          this.go('skid', 'skid');
          this.scene.dustBurst(this.zone.x, b.bottom, 6);
          this.scene.sfx(ice ? 'ice-crack' : 'step', 0.4, 1.2);
        } else if (this.t > 2.2) this.go('chase', 'run');
        break;
      case 'skid': {
        // as patas freiam na neve; no gelo ele desliza longe
        b.velocity.x *= Math.pow(ice ? 0.985 : 0.86, dt * 60);
        if (Math.abs(b.velocity.x) > 40 && Math.random() < dt * 30) this.scene.dustBurst(this.zone.x - this.facing * 10, b.bottom, 1);
        if (!ice) this.stopAtEdge();
        if (this.t > C.skid * (ice ? 1.6 : 1)) {
          this.atkCd = C.atkCd * (0.8 + Math.random() * 0.4);
          this.go('chase', 'run');
        }
        break;
      }
      case 'hurt':
        if (b.blocked.down) b.velocity.x *= Math.pow(0.85, dt * 60);
        if (this.t > 0.26) this.go('chase', 'run');
        break;
      case 'stagger':
        if (b.blocked.down) b.velocity.x *= Math.pow(0.86, dt * 60);
        this.stopAtEdge();
        if (this.t > PARRY.stagger) {
          this.atkCd = 0.5;
          this.go('chase', 'run');
        }
        break;
    }
    // a água gelada do lago: não sai mais
    if (this.scene.level.inWater(b.center.x, b.bottom - 3)) {
      this.drown();
      return;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(b.bottom));
    face(this.sprite, this.facing < 0);
    // os olhos acendem quando ele acha a presa e ficam acesos na caçada (na nevasca, é o que se vê dele)
    const hunting = this.state !== 'trot' && this.state !== 'hurt';
    const lit = hunting ? (this.state === 'crouch' || this.state === 'pounce' ? 1 : 0.7) : 0;
    const blizzard = this.scene.boss ? this.scene.whiteout : 0;
    const a = this.eyes.alpha + (Math.min(1, lit * (1 + blizzard)) * 0.8 - this.eyes.alpha) * Math.min(1, dt * 10);
    this.eyes.setAlpha(a).setPosition(this.zone.x + this.facing * 13, b.bottom - (this.state === 'crouch' ? 13 : 19)).setScale(0.26 + a * 0.2 + blizzard * 0.15);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    if (!this.alive) return false;
    if (this.state === 'pounce' && overlap(pr, this.biteBox)) return true;
    if (sliding || this.state === 'stagger' || this.state === 'skid' || this.state === 'hurt' || this.state === 'howl') return false;
    if (this.state === 'trot') return overlap(pr, this.rect);
    return overlap(pr, this.rect);
  }

  // aparar: pegar o salto pela frente, com a boca aberta
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive) return false;
    const leaping = this.state === 'pounce';
    const late = this.state === 'crouch' && this.t > C.crouch - PARRY.early;
    if (!leaping && !late) return false;
    if ((Math.sign(fromX - this.zone.x) || this.facing) !== this.facing) return false;
    if (!overlap(box, this.rect) && !overlap(box, this.biteBox)) return false;
    this.go('stagger', 'hurt');
    this.body.setVelocity(-this.facing * 150, leaping ? -140 : 0);
    this.scene.sfx('yelp', 0.7, 1);
    this.atkCd = 0.6;
    return true;
  }

  hit(fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive) return 'ignored';
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    // escorregando depois do salto, de lado e sem pé firme
    else if (this.state === 'skid') dmg *= 1.25;
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    if (!this.howled) {
      // pego de surpresa: nem uiva, já vem
      this.howled = true;
      for (const e of this.scene.enemies) if (e !== this && e instanceof Wolf) e.hear(this.zone.x);
    }
    if (this.state !== 'pounce' && this.state !== 'stagger') {
      this.go('hurt', 'hurt');
      if (this.body.blocked.down) this.body.velocity.x = -Math.sign(fromX - this.zone.x) * 110;
      this.scene.sfx('yelp', 0.45, 1.15);
    }
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  vanish() {
    if (!this.alive) return null;
    this.alive = false;
    this.body.enable = false;
    this.eyes.setAlpha(0);
    return this.sprite;
  }

  // caiu na água gelada: afunda com a geada estalando
  private drown() {
    const s = this.scene;
    const x = this.body.center.x;
    const y = Math.floor((this.body.bottom - 3) / TILE) * TILE + 3;
    this.alive = false;
    this.body.enable = false;
    this.eyes.setAlpha(0);
    s.splash(x, y);
    s.sfx('freeze', 0.7, 1.1);
    s.killed(this);
    this.sprite.stop();
    s.tweens.add({ targets: this.sprite, y: this.sprite.y + 26, alpha: 0, duration: 700, ease: 'Quad.easeIn', onComplete: () => this.sprite.destroy() });
  }

  private die() {
    this.alive = false;
    this.body.enable = false;
    this.eyes.setAlpha(0);
    const s = this.scene;
    s.deathBurst(this.zone.x, this.zone.y);
    s.frostBurst(this.zone.x, this.body.top + 4, 10);
    s.time.delayedCall(80, () => this.sprite.clearTint());
    this.anim = 'death';
    this.sprite.play('wolf-death');
    s.sfx('yelp', 0.6, 0.8);
    s.sfx('thud', 0.5, 1.1);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      s.tweens.add({ targets: this.sprite, alpha: 0, delay: 1400, duration: 900, onComplete: () => this.sprite.destroy() });
    });
  }

  destroy() {
    this.eyes.destroy();
  }
}

import Phaser from 'phaser';
import { MINER as C, PARRY, PLAYER, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { overlap, type Enemy, type HitDir, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';

type State = 'patrol' | 'chase' | 'windup' | 'leap' | 'strike' | 'recover' | 'hurt' | 'stagger';

// Mineiro esquecido: anda curvado com a picareta curta, e quando vê o cavaleiro agacha, os olhos
// acendem cor de Âmbar e ele pula com a picareta por cima da cabeça. Onde cai, crava a ponta na
// pedra na frente (saia de baixo, pule por cima ou apare no ar, quando ele já está descendo).
// Depois da pancada fica um instante tirando a ponta da pedra: é a hora de bater.
export class Miner implements Enemy {
  readonly kind = 'miner' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  facing: 1 | -1 = -1;
  private state: State = 'patrol';
  private t = 0;
  private atkCd = 0.8;
  private flashT = 0;
  private lostT = 0;
  private anim = '';
  private readonly homeX: number;
  private readonly eyes: Phaser.GameObjects.Image;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.homeX = x;
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(320, 700);
    const o = scene.registry.get('miner-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'miner', 0).setOrigin(o.x, o.y).setDepth(8));
    // o brilho dos olhos e do Âmbar das costas quando ele prepara o pulo
    this.eyes = scene.add.image(x, feetY - 40, 'glow').setTint(0xffa63c).setBlendMode(Phaser.BlendModes.ADD).setDepth(8.1).setScale(0.5).setAlpha(0);
    this.facing = scene.player && scene.player.x > x ? 1 : -1;
    this.play('idle');
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  // a ponta da picareta cravando na pedra, na frente dos pés
  private get strikeBox() {
    const b = this.body;
    const w = C.strikeReach;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x : b.center.x - w, b.bottom - 30, w, 32);
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`miner-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  private stopAtEdge() {
    const b = this.body;
    if (b.velocity.x === 0 || !b.blocked.down) return;
    const l = this.scene.level;
    const dir = Math.sign(b.velocity.x);
    const ax = dir > 0 ? b.right + 3 : b.left - 3;
    if (!isGround(l.tileAt(ax, b.bottom + 4)) || isSolid(l.tileAt(ax, b.bottom - 8))) b.velocity.x = 0;
  }

  // quanto dá para subir antes de bater a cabeça (galerias baixas: o pulo fica rasteiro)
  private headroom() {
    const l = this.scene.level;
    const b = this.body;
    for (let k = 1; k <= 7; k++) {
      const y = b.top - k * TILE;
      if (isSolid(l.tileAt(b.left + 2, y)) || isSolid(l.tileAt(b.right - 2, y)) || isSolid(l.tileAt(b.center.x, y))) return (k - 1) * TILE + (b.top % TILE);
    }
    return 7 * TILE;
  }

  // nada de rocha entre ele e o cavaleiro na altura do peito
  private clearTo(x: number) {
    const l = this.scene.level;
    const y = this.body.bottom - 24;
    const step = Math.sign(x - this.zone.x) * (TILE / 2);
    if (step === 0) return true;
    for (let xx = this.zone.x + step; Math.abs(xx - this.zone.x) < Math.abs(x - this.zone.x); xx += step) {
      if (isSolid(l.tileAt(xx, y))) return false;
    }
    return true;
  }

  private leap() {
    const p = this.scene.player;
    const b = this.body;
    const g = PLAYER.gravity;
    // pula até onde o cavaleiro vai estar, mas não mais longe do que as pernas dão
    const lead = Phaser.Math.Clamp(p.body.velocity.x * 0.22, -40, 40);
    const dx = Phaser.Math.Clamp(p.x + lead - this.zone.x, -C.leapMax, C.leapMax);
    const apex = Math.max(18, Math.min(C.leapApex, this.headroom() - 6));
    const vy = Math.sqrt(2 * g * apex);
    const T = (2 * vy) / g;
    b.setVelocity(Phaser.Math.Clamp(dx / T, -C.leapSpeed, C.leapSpeed), -vy);
    if (Math.abs(dx) > 4) this.facing = dx > 0 ? 1 : -1;
    this.go('leap', 'leap');
    this.scene.sfx('swoosh', 0.7, 0.75);
  }

  private land() {
    const s = this.scene;
    const b = this.body;
    b.velocity.x = 0;
    this.go('strike', 'strike');
    const x = this.zone.x + this.facing * 30;
    s.sfx('thud', 0.9, 0.85);
    s.sfx('clang', 0.45, 1.3);
    s.dustBurst(x, b.bottom, 10);
    s.mine?.amberBurst(x, b.bottom - 2, 4);
    s.cameras.main.shake(90, 0.004);
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
    const seen = !p.dead && Math.abs(dx) < C.sight && Math.abs(dy) < 120 && this.clearTo(p.x);

    switch (this.state) {
      case 'patrol': {
        if (Math.abs(this.zone.x - this.homeX) > 56) this.facing = this.zone.x > this.homeX ? -1 : 1;
        b.velocity.x = this.facing * C.walk * 0.55;
        this.stopAtEdge();
        if (b.velocity.x === 0 && b.blocked.down) this.facing = (this.facing * -1) as 1 | -1;
        this.play('walk');
        if (seen) {
          this.go('chase');
          this.atkCd = Math.max(this.atkCd, 0.35);
          this.scene.sfx('heavy', 0.35, 0.55);
        }
        break;
      }
      case 'chase': {
        this.lostT = seen ? 0 : this.lostT + dt;
        if (this.lostT > 3) {
          this.go('patrol');
          break;
        }
        this.facing = dx >= 0 ? 1 : -1;
        const dist = Math.abs(dx);
        if (this.atkCd <= 0 && b.blocked.down && Math.abs(dy) < 70 && dist < C.leapMax + 20 && seen) {
          b.velocity.x = 0;
          this.go('windup', 'windup');
          this.scene.sfx('heavy', 0.5, 0.7);
          break;
        }
        if (dist > 54) {
          b.velocity.x = this.facing * C.walk;
          this.play('walk');
        } else {
          b.velocity.x = 0;
          this.play('idle');
        }
        this.stopAtEdge();
        break;
      }
      case 'windup':
        b.velocity.x = 0;
        this.facing = dx >= 0 ? 1 : -1;
        if (this.t > C.windup) this.leap();
        break;
      case 'leap':
        if (b.blocked.left || b.blocked.right) b.velocity.x = 0;
        if (b.blocked.up && b.velocity.y < 0) b.velocity.y = 0;
        if (this.t > 0.08 && b.blocked.down) this.land();
        else if (this.t > 2.5) this.go('recover', 'recover');
        break;
      case 'strike':
        b.velocity.x = 0;
        if (this.t > C.strikeActive) this.go('recover', 'recover');
        break;
      case 'recover':
        b.velocity.x = 0;
        if (this.t > C.recover) {
          this.atkCd = C.atkCd * (0.8 + Math.random() * 0.4);
          this.go('chase', 'idle');
        }
        break;
      case 'hurt':
        if (b.blocked.down) b.velocity.x *= Math.pow(0.85, dt * 60);
        if (this.t > 0.24) this.go('chase', 'idle');
        break;
      case 'stagger':
        if (b.blocked.down) b.velocity.x *= Math.pow(0.86, dt * 60);
        this.stopAtEdge();
        if (this.t > PARRY.stagger) {
          this.atkCd = 0.6;
          this.go('chase', 'idle');
        }
        break;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(b.bottom));
    face(this.sprite, this.facing < 0);
    // os olhos acendem no preparo e ficam acesos até a ponta sair da pedra
    const lit = this.state === 'windup' ? Math.min(1, this.t / (C.windup * 0.6)) : this.state === 'leap' || this.state === 'strike' ? 1 : 0;
    const a = this.eyes.alpha + (lit * 0.75 - this.eyes.alpha) * Math.min(1, dt * 14);
    this.eyes.setAlpha(a).setPosition(this.zone.x + this.facing * 8, b.bottom - 40).setScale(0.42 + a * 0.25);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    if (!this.alive) return false;
    if (this.state === 'strike' && overlap(pr, this.strikeBox)) return true;
    if (sliding || this.state === 'stagger' || this.state === 'recover') return false;
    return overlap(pr, this.rect);
  }

  // aparar: acertar a picareta quando ele já está descendo do pulo, pela frente
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive) return false;
    const falling = this.state === 'leap' && this.body.velocity.y > 40;
    const late = this.state === 'windup' && this.t > C.windup - PARRY.early;
    if (!falling && !late) return false;
    if ((Math.sign(fromX - this.zone.x) || this.facing) !== this.facing) return false;
    if (!overlap(box, this.rect) && !overlap(box, this.strikeBox)) return false;
    this.go('stagger', 'hurt');
    this.body.setVelocity(-this.facing * 110, falling ? -120 : 0);
    this.atkCd = 0.6;
    return true;
  }

  hit(fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive) return 'ignored';
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    // no meio do pulo ele não para; andando, o golpe tira do passo
    if (this.state === 'patrol' || this.state === 'chase' || this.state === 'recover') {
      this.go('hurt', 'hurt');
      if (this.body.blocked.down) this.body.velocity.x = -Math.sign(fromX - this.zone.x) * 60;
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

  private die() {
    this.alive = false;
    this.body.enable = false;
    this.eyes.setAlpha(0);
    const s = this.scene;
    s.deathBurst(this.zone.x, this.zone.y);
    // o Âmbar das costas estoura junto
    s.mine?.amberBurst(this.zone.x - this.facing * 6, this.body.top + 14, 10);
    s.glowBurst(this.zone.x - this.facing * 6, this.body.top + 14, 0xffa63c, 3);
    s.time.delayedCall(80, () => this.sprite.clearTint());
    this.anim = 'death';
    this.sprite.play('miner-death');
    s.sfx('thud', 0.8, 0.9);
    s.sfx('glass', 0.5, 0.8);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      s.tweens.add({ targets: this.sprite, alpha: 0, delay: 1400, duration: 900, onComplete: () => this.sprite.destroy() });
    });
  }

  destroy() {
    this.eyes.destroy();
  }
}

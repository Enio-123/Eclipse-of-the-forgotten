import Phaser from 'phaser';
import { BOSS as C, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { overlap, type Enemy, type HitResult } from './Enemy';

type State =
  | 'sleep' | 'rise' | 'roar' | 'idle' | 'walk'
  | 'slamwind' | 'slam' | 'slamrec'
  | 'sweepwind' | 'sweep' | 'sweeprec'
  | 'chargewind' | 'charge' | 'stun'
  | 'dead';

type Attack = 'slam' | 'sweep' | 'charge';

// onda que corre rente ao chão depois da martelada (pule por cima)
interface Wave {
  x: number;
  dir: 1 | -1;
  t: number;
  glow: Phaser.GameObjects.Image;
}

// sino que cai do teto na segunda fase: sombra no chão, depois a queda
interface Bell {
  x: number;
  y: number;
  vy: number;
  t: number;
  falling: boolean;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  done: boolean;
}

// O Sineiro: dorme ajoelhado no fundo da cripta. Martelada (com onda no chão), varredura na
// altura do peito (agache ou deslize), investida até a parede (fica tonto: é a hora de bater)
// e, com metade da vida, urra e faz os sinos caírem do teto.
export class Boss implements Enemy {
  readonly kind = 'boss' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly maxHp = C.hp;
  hp = C.hp;
  alive = true;
  facing: 1 | -1 = -1;
  state: State = 'sleep';
  onDefeat: (() => void) | null = null;
  private t = 0;
  private thinkT = 0;
  private bellT = 0;
  private phase2 = false;
  private flashT = 0;
  private anim = '';
  private last: Attack[] = [];
  private hitDone = false;
  private waves: Wave[] = [];
  private bells: Bell[] = [];
  private readonly floorY: number;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.floorY = feetY;
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(600, 700);
    const o = scene.registry.get('sineiro-origin') as { x: number; y: number };
    this.sprite = scene.add.sprite(x, feetY, 'sineiro', 0).setOrigin(o.x, o.y).setDepth(8);
    this.play('kneel');
    this.sprite.setFlipX(true);
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  get awake() {
    return this.state !== 'sleep' && this.state !== 'dead';
  }

  private get speedMul() {
    return this.phase2 ? 0.8 : 1;
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`sineiro-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    this.hitDone = false;
    if (anim) this.play(anim);
  }

  private face() {
    this.facing = this.scene.player.x >= this.zone.x ? 1 : -1;
  }

  // acorda quando o cavaleiro entra na arena
  wake() {
    if (this.state !== 'sleep') return;
    this.go('rise', 'rise');
    this.face();
    this.scene.sfx('bell', 0.9);
    this.scene.cameras.main.shake(500, 0.004);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.go('roar', 'roar');
      this.scene.sfx('roar');
      this.scene.cameras.main.shake(900, 0.006);
    });
  }

  // ---------- área dos golpes ----------
  private get slamBox() {
    const b = this.body;
    const w = 74;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x + 20 : b.center.x - 20 - w, b.bottom - 48, w, 48);
  }

  private get sweepBox() {
    const b = this.body;
    const w = 128;
    // da cintura dele à altura do peito do cavaleiro: agachado ou deslizando passa por baixo
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x : b.center.x - w, b.bottom - 80, w, 46);
  }

  private choose(): Attack {
    const dist = Math.abs(this.scene.player.x - this.zone.x);
    let opts: [Attack, number][];
    if (dist < 95) opts = [['sweep', 0.5], ['slam', 0.4], ['charge', 0.1]];
    else if (dist < 210) opts = [['slam', 0.55], ['charge', 0.3], ['sweep', 0.15]];
    else opts = [['charge', 0.7], ['slam', 0.3]];
    // não repete o mesmo golpe três vezes seguidas
    if (this.last.length >= 2 && this.last[0] === this.last[1]) opts = opts.filter(([a]) => a !== this.last[0]);
    const total = opts.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [a, w] of opts) {
      r -= w;
      if (r <= 0) return a;
    }
    return opts[0][0];
  }

  update(dt: number) {
    this.updateHazards(dt);
    if (this.state === 'dead' || this.state === 'sleep') {
      this.sync();
      return;
    }
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    const dx = p.x - this.zone.x;
    switch (this.state) {
      case 'rise':
        b.velocity.x = 0;
        break;
      case 'roar':
        b.velocity.x = 0;
        if (this.t > 1.3) {
          this.thinkT = 0.4;
          this.go('idle', 'idle');
        }
        break;
      case 'idle': {
        b.velocity.x = 0;
        this.face();
        this.thinkT -= dt;
        if (this.thinkT > 0) break;
        const dist = Math.abs(dx);
        // longe demais para a varredura e perto demais para valer a investida: anda um pouco
        if (dist > 120 && dist < 210 && Math.random() < 0.35) {
          this.go('walk', 'walk');
          break;
        }
        this.startAttack(this.choose());
        break;
      }
      case 'walk':
        this.face();
        b.velocity.x = this.facing * C.walk * (this.phase2 ? 1.3 : 1);
        if (Math.abs(dx) < 90 || this.t > 1.4) {
          b.velocity.x = 0;
          this.startAttack(Math.abs(dx) < 90 ? (Math.random() < 0.6 ? 'sweep' : 'slam') : 'slam');
        }
        break;
      case 'slamwind':
        b.velocity.x = 0;
        if (this.t > C.slamWind * this.speedMul) {
          this.go('slam', 'slam');
          b.velocity.x = this.facing * 60;
        }
        break;
      case 'slam':
        // freia igual em qualquer taxa de quadros
        b.velocity.x *= Math.pow(0.8, dt * 60);
        if (!this.hitDone && this.t > 0.1) {
          this.hitDone = true;
          this.impact();
        }
        if (this.t > 0.18) this.go('slamrec', 'slamrec');
        break;
      case 'slamrec':
        b.velocity.x = 0;
        if (this.t > C.slamRec * this.speedMul) this.toIdle();
        break;
      case 'sweepwind':
        b.velocity.x = 0;
        if (this.t > C.sweepWind * this.speedMul) {
          this.go('sweep', 'sweep');
          this.scene.sfx('heavy', 1);
          this.scene.sfx('swoosh', 0.9);
          b.velocity.x = this.facing * 120;
        }
        break;
      case 'sweep':
        b.velocity.x *= Math.pow(0.86, dt * 60);
        if (this.t > C.sweepTime) this.go('sweeprec', 'idle');
        break;
      case 'sweeprec':
        b.velocity.x = 0;
        if (this.t > C.sweepRec * this.speedMul) this.toIdle();
        break;
      case 'chargewind':
        b.velocity.x = 0;
        if (this.t > 0.2 && Math.random() < 0.3) this.scene.dustBurst(this.zone.x - this.facing * 20, b.bottom, 2);
        if (this.t > C.chargeWind * this.speedMul) {
          this.go('charge', 'charge');
          this.scene.sfx('dash', 1);
        }
        break;
      case 'charge': {
        b.velocity.x = this.facing * C.chargeSpeed;
        if (Math.random() < 0.5) this.scene.dustBurst(this.zone.x - this.facing * 18, b.bottom, 2);
        const wall = this.facing > 0 ? b.blocked.right : b.blocked.left;
        if (wall || this.t > 3) {
          // bate a cabeça de sino na parede: o sino toca e ele fica tonto
          b.velocity.x = 0;
          this.go('stun', 'stun');
          this.scene.sfx('bell', 1);
          this.scene.sfx('thud', 1);
          this.scene.cameras.main.shake(320, 0.012);
          this.scene.dustBurst(this.zone.x + this.facing * 26, b.top + 30, 18);
          if (this.phase2) this.dropBells(2);
        }
        break;
      }
      case 'stun':
        b.velocity.x = 0;
        if (this.t > C.stunTime) this.toIdle();
        break;
    }
    // segunda fase: sinos caem de tempos em tempos
    if (this.phase2 && this.state !== 'roar') {
      this.bellT -= dt;
      if (this.bellT <= 0) {
        this.bellT = C.bellEvery + Math.random() * 0.8;
        this.dropBells(Math.random() < 0.5 ? 2 : 3);
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sync();
  }

  private sync() {
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(this.body.bottom));
    this.sprite.setFlipX(this.facing < 0);
  }

  private toIdle() {
    this.thinkT = (C.think + Math.random() * 0.35) * this.speedMul;
    this.go('idle', 'idle');
  }

  private startAttack(a: Attack) {
    this.face();
    this.last = [a, ...this.last].slice(0, 2);
    if (a === 'slam') {
      this.go('slamwind', 'slamwind');
      this.scene.sfx('swoosh', 0.5);
    } else if (a === 'sweep') this.go('sweepwind', 'sweepwind');
    else {
      this.go('chargewind', 'chargewind');
      this.scene.sfx('roar', 0.35);
    }
  }

  // o badalo bate no chão: tremor, poeira e duas ondas correndo pelo chão
  private impact() {
    const s = this.scene;
    const x = this.zone.x + this.facing * 78;
    s.cameras.main.shake(260, 0.011);
    s.sfx('thud', 1);
    s.sfx('bell', 0.55);
    s.dustBurst(x, this.floorY, 22);
    for (const dir of [-1, 1] as const) {
      const glow = s.add.image(x, this.floorY - 7, 'glow').setScale(1.6, 0.55).setTint(0xffb35a).setAlpha(0.85)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(9);
      this.waves.push({ x, dir, t: 0, glow });
    }
  }

  private dropBells(n: number) {
    const s = this.scene;
    const L = s.level;
    const px = s.player.x;
    const xs = [px];
    for (let i = 1; i < n; i++) xs.push(px + (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * 140));
    const minX = 3 * TILE + 16;
    const maxX = (L.w - 3) * TILE - 16;
    for (const x0 of xs) {
      const x = Phaser.Math.Clamp(x0, minX, maxX);
      const top = 3 * TILE;
      const sprite = s.add.image(x, top - 20, 'bell-drop').setOrigin(0.5, 1).setDepth(9);
      const shadow = s.add.ellipse(x, this.floorY - 1, 30, 7, 0x000000, 0.0).setDepth(7);
      s.tweens.add({ targets: shadow, fillAlpha: 0.55, duration: C.bellWarn * 1000 });
      this.bells.push({ x, y: top - 20, vy: 0, t: 0, falling: false, sprite, shadow, done: false });
    }
    s.sfx('bell', 0.3);
  }

  private updateHazards(dt: number) {
    const s = this.scene;
    for (const w of this.waves) {
      w.t += dt;
      w.x += w.dir * C.waveSpeed * dt;
      w.glow.setPosition(w.x, this.floorY - 7);
      w.glow.setAlpha(0.85 * Math.max(0, 1 - w.t / C.waveLife));
      if (Math.random() < 0.6) s.dustBurst(w.x, this.floorY, 2);
    }
    for (const w of this.waves) if (w.t > C.waveLife || w.x < 2 * TILE || w.x > (s.level.w - 2) * TILE) w.glow.destroy();
    this.waves = this.waves.filter((w) => w.glow.active);
    for (const bl of this.bells) {
      bl.t += dt;
      if (!bl.falling) {
        // treme no teto antes de cair
        bl.sprite.x = bl.x + Math.sin(bl.t * 50) * 1.2;
        if (Math.random() < 0.25) s.dustBurst(bl.x + (Math.random() - 0.5) * 16, 3 * TILE + 4, 1);
        if (bl.t > C.bellWarn) bl.falling = true;
        continue;
      }
      bl.vy += 1500 * dt;
      bl.y += bl.vy * dt;
      bl.sprite.setPosition(bl.x, bl.y);
      if (bl.y >= this.floorY) {
        bl.done = true;
        s.sfx('clang', 1);
        s.sfx('crack', 0.6);
        s.dustBurst(bl.x, this.floorY, 14);
        s.deathBurst(bl.x, this.floorY - 12);
        s.cameras.main.shake(120, 0.006);
        bl.sprite.destroy();
        bl.shadow.destroy();
      }
    }
    this.bells = this.bells.filter((b) => !b.done);
  }

  private waveRect(w: Wave) {
    return new Phaser.Geom.Rectangle(w.x - 9, this.floorY - 16, 18, 16);
  }

  private bellRect(b: Bell) {
    return new Phaser.Geom.Rectangle(b.x - 13, b.y - 30, 26, 30);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    for (const w of this.waves) if (overlap(pr, this.waveRect(w))) return true;
    for (const b of this.bells) if (b.falling && overlap(pr, this.bellRect(b))) return true;
    if (!this.awake || this.state === 'rise') return false;
    if (this.state === 'slam' && this.t < 0.16 && overlap(pr, this.slamBox)) return true;
    if (this.state === 'sweep' && this.t < 0.2 && overlap(pr, this.sweepBox)) return true;
    // deslizando, o cavaleiro passa por baixo do corpo dele (menos na investida)
    if (sliding && this.state !== 'charge') return false;
    return overlap(pr, this.rect);
  }

  hit(_fromX: number, dmg: number): HitResult {
    if (!this.alive || !this.awake || this.state === 'rise') return 'ignored';
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    if (!this.phase2 && this.hp <= this.maxHp * C.phase2 && this.hp > 0) {
      this.phase2 = true;
      this.bellT = 1.6;
      this.go('roar', 'roar');
      this.scene.sfx('roar', 1);
      this.scene.sfx('bell', 1);
      this.scene.cameras.main.shake(1000, 0.007);
      this.dropBells(3);
    }
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  private die() {
    const s = this.scene;
    this.alive = false;
    this.hp = 0;
    this.go('dead');
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    for (const w of this.waves) w.glow.destroy();
    this.waves = [];
    for (const b of this.bells) {
      b.sprite.destroy();
      b.shadow.destroy();
    }
    this.bells = [];
    s.time.delayedCall(80, () => this.sprite.clearTint());
    this.anim = 'death';
    this.sprite.play('sineiro-death');
    s.deathBurst(this.zone.x, this.zone.y);
    s.sfx('bell', 1.2);
    s.hitstop(0.25);
    s.cameras.main.flash(300, 255, 236, 200);
    s.cameras.main.shake(700, 0.01);
    this.onDefeat?.();
  }
}

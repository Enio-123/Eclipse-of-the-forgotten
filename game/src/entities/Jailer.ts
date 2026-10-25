import Phaser from 'phaser';
import { JAILER as C, PARRY } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { DEPTH } from '../world/Decor';
import { overlap, type Enemy, type HitDir, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';

type State = 'patrol' | 'chase' | 'lashwind' | 'lash' | 'lashrec' | 'slamwind' | 'slam' | 'slamrec' | 'hurt' | 'stagger';

interface FramePoints {
  hand: [number, number];
}

// Carcereiro: grandalhão de capuz de couro, com a corrente enrolada no braço e o molho de chaves na
// cintura. De longe estala a corrente na altura do peito (agache, deslize por baixo ou apare na hora);
// de perto ergue o punho de ferro e bate no chão (pule ou saia de perto). Não tem escudo: depois da
// pancada fica um instante aberto. Os do alarme já chegam acordados e correm mais.
export class Jailer implements Enemy {
  readonly kind = 'jailer' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  facing: 1 | -1 = -1;
  private state: State = 'patrol';
  private t = 0;
  private atkCd = 0.6;
  private flashT = 0;
  private lostT = 0;
  private anim = '';
  private readonly homeX: number;
  private readonly chain: Phaser.GameObjects.Graphics;
  private readonly points: Record<string, FramePoints[]> | null;

  constructor(private scene: GameScene, x: number, feetY: number, readonly alarm = false) {
    this.homeX = x;
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(400, 600);
    const o = scene.registry.get('jailer-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'jailer', 0).setOrigin(o.x, o.y).setDepth(8));
    this.points = (scene.cache.json.get('jailer-meta') as { points?: Record<string, FramePoints[]> } | undefined)?.points ?? null;
    this.chain = scene.add.graphics().setDepth(DEPTH.enemy + 0.3);
    this.facing = scene.player && scene.player.x > x ? 1 : -1;
    if (alarm) this.state = 'chase';
    this.play('idle');
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  // a corrente estalada: uma faixa na altura do peito (agachado ou deslizando passa por baixo)
  private get lashBox() {
    const b = this.body;
    const w = C.lashReach;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x : b.center.x - w, b.bottom - 50, w, 22);
  }

  // o punho de ferro batendo no chão na frente
  private get slamBox() {
    const b = this.body;
    const w = C.slamReach;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x - 6 : b.center.x + 6 - w, b.bottom - 34, w, 34);
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`jailer-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  // ponto da mão da corrente no quadro atual
  private hand() {
    const pts = this.points?.[this.anim];
    const i = (this.sprite.anims.currentFrame?.index ?? 1) - 1;
    const pt = pts?.[Math.min(i, pts.length - 1)]?.hand ?? [12, -40];
    return { x: this.zone.x + this.facing * pt[0], y: this.body.bottom + pt[1] };
  }

  private stopAtEdge() {
    const b = this.body;
    if (b.velocity.x === 0 || !b.blocked.down) return;
    const l = this.scene.level;
    const dir = Math.sign(b.velocity.x);
    const ax = dir > 0 ? b.right + 3 : b.left - 3;
    if (!isGround(l.tileAt(ax, b.bottom + 4)) || isSolid(l.tileAt(ax, b.bottom - 8))) b.velocity.x = 0;
  }

  update(dt: number) {
    if (!this.alive) {
      this.chain.clear();
      return;
    }
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    this.atkCd -= dt;
    const dx = p.x - this.zone.x;
    const dy = p.body.bottom - b.bottom;
    const seen = !p.dead && Math.abs(dx) < C.sight && Math.abs(dy) < 110;
    const walk = C.walk * (this.alarm ? 1.45 : 1);

    switch (this.state) {
      case 'patrol': {
        if (Math.abs(this.zone.x - this.homeX) > 60) this.facing = this.zone.x > this.homeX ? -1 : 1;
        b.velocity.x = this.facing * walk * 0.5;
        this.stopAtEdge();
        if (b.velocity.x === 0) this.facing = (this.facing * -1) as 1 | -1;
        this.play('walk');
        if (seen) {
          this.go('chase');
          this.scene.sfx('censer', 0.5, 0.7);
        }
        break;
      }
      case 'chase': {
        this.lostT = seen ? 0 : this.lostT + dt;
        if (this.lostT > 3 && !this.alarm) {
          this.go('patrol');
          break;
        }
        this.facing = dx >= 0 ? 1 : -1;
        const dist = Math.abs(dx);
        if (this.atkCd <= 0 && Math.abs(dy) < 50) {
          if (dist < C.slamReach - 6) {
            b.velocity.x = 0;
            this.go('slamwind', 'slamwind');
            this.scene.sfx('heavy', 0.4, 0.6);
            break;
          }
          if (dist < C.lashReach - 10 && dist > 44) {
            b.velocity.x = 0;
            this.go('lashwind', 'lashwind');
            this.scene.sfx('censer', 0.8, 0.8);
            break;
          }
        }
        if (dist > 40) {
          b.velocity.x = this.facing * walk;
          this.play('walk');
        } else {
          b.velocity.x = 0;
          this.play('idle');
        }
        this.stopAtEdge();
        break;
      }
      case 'lashwind':
        b.velocity.x = 0;
        if (this.t > C.lashWind) {
          this.go('lash', 'lash');
          this.scene.sfx('swoosh', 0.9, 0.7);
          this.scene.sfx('clang', 0.4, 1.6);
        }
        break;
      case 'lash':
        b.velocity.x = 0;
        if (this.t > C.lashActive) this.go('lashrec', 'lashrec');
        break;
      case 'lashrec':
        b.velocity.x = 0;
        if (this.t > C.lashRec) {
          this.atkCd = C.atkCd;
          this.go('chase', 'idle');
        }
        break;
      case 'slamwind':
        b.velocity.x = 0;
        if (this.t > C.slamWind) {
          this.go('slam', 'slam');
          const s = this.scene;
          const x = this.zone.x + this.facing * 30;
          s.sfx('thud', 1, 0.8);
          s.sfx('clang', 0.6, 0.6);
          s.dustBurst(x, b.bottom, 12);
          s.cameras.main.shake(110, 0.005);
        }
        break;
      case 'slam':
        b.velocity.x = 0;
        if (this.t > C.slamActive) this.go('slamrec', 'slamrec');
        break;
      case 'slamrec':
        b.velocity.x = 0;
        if (this.t > C.slamRec) {
          this.atkCd = C.atkCd;
          this.go('chase', 'idle');
        }
        break;
      case 'hurt':
        b.velocity.x *= Math.pow(0.85, dt * 60);
        if (this.t > 0.22) this.go('chase', 'idle');
        break;
      case 'stagger':
        b.velocity.x *= Math.pow(0.86, dt * 60);
        this.stopAtEdge();
        if (this.t > PARRY.stagger) {
          this.atkCd = 0.5;
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
    this.drawChain();
  }

  // a corrente estalando: sai da mão, estica na altura do peito e volta enrolando
  private drawChain() {
    const g = this.chain;
    g.clear();
    let k = 0;
    if (this.state === 'lash') k = Math.min(1, this.t / 0.06);
    else if (this.state === 'lashrec') k = Math.max(0, 1 - this.t / (C.lashRec * 0.6));
    if (k <= 0) return;
    const h = this.hand();
    const y = this.body.bottom - 39;
    const len = (C.lashReach - 8) * k;
    const n = 14;
    g.lineStyle(2, 0x23262f, 1);
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = h.x + this.facing * len * t;
      const yy = h.y + (y - h.y) * Math.min(1, t * 2.4) + Math.sin(t * 9 + this.t * 40) * 2 * t * (1 - k * 0.6);
      if (i === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.strokePath();
    g.fillStyle(0x8a93a8, 1);
    for (let i = 1; i < n; i += 2) {
      const t = i / n;
      g.fillRect(Math.round(h.x + this.facing * len * t), Math.round(h.y + (y - h.y) * Math.min(1, t * 2.4)) - 1, 2, 2);
    }
    const tx = h.x + this.facing * len;
    g.fillStyle(0x3a3f4e, 1).fillTriangle(tx + this.facing * 5, y, tx - this.facing * 2, y - 4, tx - this.facing * 2, y + 4);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    if (!this.alive) return false;
    if (this.state === 'lash' && overlap(pr, this.lashBox)) return true;
    if (this.state === 'slam' && overlap(pr, this.slamBox)) return true;
    if (sliding || this.state === 'stagger') return false;
    return overlap(pr, this.rect);
  }

  // aparar a corrente: no fim da preparação ou com ela esticando, golpeando pela frente
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive) return false;
    const late = this.state === 'lashwind' && this.t > C.lashWind - PARRY.early;
    const swing = this.state === 'lash';
    if (!late && !swing) return false;
    if ((Math.sign(fromX - this.zone.x) || this.facing) !== this.facing) return false;
    if (!overlap(box, this.lashBox) && !overlap(box, this.rect)) return false;
    this.go('stagger', 'stagger');
    this.body.velocity.x = -this.facing * 70;
    this.atkCd = 0.6;
    return true;
  }

  hit(fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive) return 'ignored';
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    // golpe leve não interrompe a pancada; só tira do andar
    if (this.state === 'patrol' || this.state === 'chase') {
      this.go('hurt', 'hurt');
      this.body.velocity.x = -Math.sign(fromX - this.zone.x) * 50;
    }
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  vanish() {
    if (!this.alive) return null;
    this.alive = false;
    this.body.enable = false;
    this.chain.clear();
    return this.sprite;
  }

  private die() {
    this.alive = false;
    this.body.enable = false;
    this.chain.clear();
    this.scene.deathBurst(this.zone.x, this.zone.y);
    this.scene.time.delayedCall(80, () => this.sprite.clearTint());
    this.anim = 'death';
    this.sprite.play('jailer-death');
    this.scene.sfx('thud', 0.9, 0.8);
    this.scene.sfx('tink', 0.6, 0.7);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.scene.tweens.add({ targets: this.sprite, alpha: 0, delay: 1400, duration: 900, onComplete: () => this.sprite.destroy() });
    });
  }

  destroy() {
    this.chain.destroy();
  }
}

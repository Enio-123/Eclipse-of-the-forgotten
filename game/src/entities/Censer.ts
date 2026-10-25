import Phaser from 'phaser';
import { CENSER as C, PARRY } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { overlap, type Enemy, type HitDir, type HitResult } from './Enemy';
import { SmokeField } from './Smoke';
import { face, hd } from '../gfx/flip';

type State = 'patrol' | 'chase' | 'windup' | 'swing' | 'recover' | 'stagger' | 'hurt';

interface SheetPoints {
  points: Record<string, [number, number][]>;
}

// Penitente do incensário: anda devagar soltando incenso. Perto do cavaleiro ergue o incensário
// para trás (os furos acendem e a corrente chia) e bate na frente, e onde bate fica uma nuvem que
// machuca. Não para de bater por levar golpe; aparar é que derruba a guarda dele.
export class Censer implements Enemy {
  readonly kind = 'censer' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  facing: 1 | -1 = -1;
  private state: State = 'patrol';
  private t = 0;
  private atkCd = 0.6;
  private lostT = 0;
  private flashT = 0;
  private puffT = 0;
  private anim = '';
  // nuvens de incenso que ficam no chão onde o incensário bateu
  private readonly smoke: SmokeField;
  private readonly homeX: number;
  private readonly points: Record<string, [number, number][]>;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.homeX = x;
    this.smoke = new SmokeField(scene);
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(300, 600);
    const o = scene.registry.get('censer-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'censer', 0).setOrigin(o.x, o.y).setDepth(8));
    this.points = (scene.cache.json.get('censer-meta') as SheetPoints).points;
    this.facing = Math.random() < 0.5 ? 1 : -1;
    this.sprite.play({ key: 'censer-walk', startFrame: Math.floor(Math.random() * 6) });
    this.anim = 'walk';
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  get clouds() {
    return this.smoke.list;
  }

  // o arco do incensário: de cima da cabeça até o chão na frente
  private get swingBox() {
    const b = this.body;
    const w = C.reach;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x - 4 : b.center.x + 4 - w, b.bottom - 66, w, 66);
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`censer-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  // onde está o incensário agora (o desenho guarda o ponto de cada quadro)
  private censerAt() {
    const pts = this.points[this.anim];
    const i = (this.sprite.anims.currentFrame?.index ?? 1) - 1;
    const pt = pts?.[Math.min(i, pts.length - 1)] ?? [this.facing * 20, -30];
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
    this.smoke.update(dt);
    if (!this.alive) return;
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    this.atkCd -= dt;
    const dx = p.x - this.zone.x;
    const dy = p.body.bottom - b.bottom;
    const seen = !p.dead && Math.abs(dx) < C.sight && Math.abs(dy) < 90;
    const side: 1 | -1 = dx >= 0 ? 1 : -1;

    switch (this.state) {
      case 'patrol':
        if (Math.abs(this.zone.x - this.homeX) > 80) this.facing = this.zone.x > this.homeX ? -1 : 1;
        b.velocity.x = this.facing * C.walk * 0.6;
        this.stopAtEdge();
        if (b.velocity.x === 0) this.facing = (this.facing * -1) as 1 | -1;
        this.play('walk');
        if (seen) this.go('chase');
        break;
      case 'chase': {
        this.lostT = seen ? 0 : this.lostT + dt;
        if (this.lostT > 2.5) {
          this.go('patrol');
          break;
        }
        this.facing = side;
        const dist = Math.abs(dx);
        if (dist < C.reach - 6 && this.atkCd <= 0 && Math.abs(dy) < 50) {
          b.velocity.x = 0;
          this.go('windup', 'windup');
          this.scene.sfx('censer', 0.8);
          break;
        }
        if (dist > C.keep) {
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
        if (this.t > C.windup) {
          this.go('swing', 'swing');
          this.scene.sfx('heavy', 0.8, 0.8);
          b.velocity.x = this.facing * 50;
        }
        break;
      case 'swing':
        b.velocity.x *= Math.pow(0.85, dt * 60);
        this.stopAtEdge();
        if (this.t > C.active) this.slam();
        break;
      case 'recover':
        b.velocity.x = 0;
        if (this.t > C.recover) {
          this.atkCd = C.atkCd;
          this.go('chase', 'idle');
        }
        break;
      case 'stagger':
        b.velocity.x *= Math.pow(0.86, dt * 60);
        this.stopAtEdge();
        if (this.t > PARRY.stagger) {
          this.atkCd = 0.5;
          this.go('chase', 'idle');
        }
        break;
      case 'hurt':
        b.velocity.x *= Math.pow(0.85, dt * 60);
        if (this.t > 0.22) this.go('chase', 'idle');
        break;
    }
    // o incenso sobe do incensário o tempo todo
    this.puffT -= dt;
    if (this.puffT <= 0 && this.state !== 'stagger') {
      this.puffT = this.state === 'windup' ? 0.05 : 0.16;
      const c = this.censerAt();
      this.scene.incense(c.x, c.y - 4, this.state === 'windup' ? 2 : 1);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(b.bottom));
    face(this.sprite, this.facing < 0);
  }

  // o incensário bate no chão na frente e deixa a nuvem
  private slam() {
    const b = this.body;
    const x = this.zone.x + this.facing * 42;
    const l = this.scene.level;
    this.go('recover', 'recover');
    this.scene.sfx('thud', 0.7);
    this.scene.sfx('smoke', 0.9);
    this.scene.dustBurst(x, b.bottom, 8);
    // sem chão na frente (beirada), a nuvem não tem onde ficar
    if (!isGround(l.tileAt(x, b.bottom + 4))) return;
    const cam = this.scene.cameras.main;
    if (cam.worldView.contains(x, b.bottom - 10)) cam.shake(80, 0.003);
    this.spawnCloud(x, b.bottom);
  }

  private spawnCloud(x: number, y: number) {
    this.smoke.spawn(x, y, C.smokeW, C.smokeH, C.smoke);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    // a nuvem queima enquanto está densa (no fim ela já não machuca)
    if (this.smoke.harms(pr)) return true;
    if (!this.alive) return false;
    if (this.state === 'swing' && this.t <= C.active && overlap(pr, this.swingBox)) return true;
    if (sliding || this.state === 'stagger') return false;
    return overlap(pr, this.rect);
  }

  // aparar: no fim da preparação ou com o incensário descendo, golpeando pela frente
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive) return false;
    const late = this.state === 'windup' && this.t > C.windup - PARRY.early;
    const swing = this.state === 'swing' && this.t <= C.active;
    if (!late && !swing) return false;
    if ((Math.sign(fromX - this.zone.x) || this.facing) !== this.facing) return false;
    if (!overlap(box, this.swingBox)) return false;
    this.go('stagger', 'stagger');
    this.body.velocity.x = -this.facing * 60;
    this.atkCd = 0.8;
    return true;
  }

  hit(fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive) return 'ignored';
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    // pesado: no meio do ataque ele não para
    if (this.state === 'patrol' || this.state === 'chase') {
      this.facing = fromX >= this.zone.x ? 1 : -1;
      this.go('hurt', 'hurt');
      this.body.velocity.x = -this.facing * 70;
    }
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  vanish() {
    if (!this.alive) return null;
    this.alive = false;
    this.body.enable = false;
    return this.sprite;
  }

  destroy() {
    this.smoke.clear();
  }

  private die() {
    this.alive = false;
    this.body.enable = false;
    this.scene.deathBurst(this.zone.x, this.zone.y);
    this.scene.time.delayedCall(80, () => this.sprite.clearTint());
    this.anim = 'death';
    this.sprite.play('censer-death');
    this.scene.sfx('thud', 0.8);
    this.scene.time.delayedCall(380, () => this.scene.sfx('tink', 0.5, 0.7));
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.scene.tweens.add({ targets: this.sprite, alpha: 0, delay: 1400, duration: 900, onComplete: () => this.sprite.destroy() });
    });
  }
}

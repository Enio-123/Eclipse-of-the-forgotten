import Phaser from 'phaser';
import { ARCHER as C, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isSolid } from '../world/Level';
import { overlap, type Enemy, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';

type State = 'watch' | 'draw' | 'shoot' | 'hurt';
// altura da mira: reto, para baixo ou para cima (cada uma tem o seu desenho)
type Aim = '' | 'dn' | 'up';

interface SheetPoints {
  points: Record<string, [number, number][]>;
}

// Arqueiro da sacada: não sai do balcão. Quando vê o cavaleiro, vira para ele, puxa a corda
// devagar (a fenda da máscara acende) e solta uma flecha mirada. Um golpe na flecha bem na hora
// rebate ela de volta para ele.
export class Archer implements Enemy {
  readonly kind = 'archer' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  private state: State = 'watch';
  private t = 0;
  private cd = 0.5 + Math.random() * 0.8;
  private lostT = 0;
  private facing: 1 | -1 = -1;
  private aim: Aim = '';
  private flashT = 0;
  private anim = '';
  private readonly points: Record<string, [number, number][]>;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(200, 600);
    const o = scene.registry.get('archer-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'archer', 0).setOrigin(o.x, o.y).setDepth(8));
    this.points = (scene.cache.json.get('archer-meta') as SheetPoints).points;
    this.facing = scene.player && scene.player.x > x ? 1 : -1;
    this.sprite.play({ key: 'archer-idle', startFrame: Math.floor(Math.random() * 4) });
    this.anim = 'idle';
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x - 1, b.y, b.width + 2, b.height);
  }

  private play(name: string, startFrame = 0) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play({ key: `archer-${name}`, startFrame });
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  // mão do arco no quadro de mira (de onde a flecha sai)
  private bowPoint(aim: Aim) {
    const pts = this.points[`draw${aim}`];
    const [px, py] = pts[pts.length - 1];
    return { x: this.zone.x + this.facing * px, y: this.body.bottom + py };
  }

  // de longe, com o caminho livre (sem pedra entre o arco e o cavaleiro)
  private sees(x: number, y: number) {
    const p = this.scene.player;
    if (p.dead) return false;
    const fx = this.zone.x;
    const fy = this.body.bottom - 34;
    const dx = x - fx;
    const dy = y - fy;
    if (Math.abs(dx) > C.sight || Math.abs(dy) > 240) return false;
    const l = this.scene.level;
    const n = Math.ceil(Math.hypot(dx, dy) / (TILE / 2));
    for (let i = 1; i < n; i++) {
      if (isSolid(l.tileAt(fx + (dx * i) / n, fy + (dy * i) / n))) return false;
    }
    return true;
  }

  private pickAim(x: number, y: number): Aim {
    const a = Phaser.Math.RadToDeg(Math.atan2(y - (this.body.bottom - 34), Math.abs(x - this.zone.x)));
    return a > 17 ? 'dn' : a < -17 ? 'up' : '';
  }

  update(dt: number) {
    if (!this.alive) return;
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    this.cd -= dt;
    b.velocity.x = 0;
    const tx = p.x;
    const ty = p.body.center.y;
    const seen = this.sees(tx, ty);
    switch (this.state) {
      case 'watch':
        if (seen) this.facing = tx >= this.zone.x ? 1 : -1;
        this.play('idle');
        if (seen && this.cd <= 0) {
          this.aim = this.pickAim(tx, ty);
          this.lostT = 0;
          this.go('draw', `draw${this.aim}`);
          this.scene.sfx('draw', 0.7);
        }
        break;
      case 'draw': {
        // acompanha o cavaleiro enquanto mira; se ele some de vista, desiste
        this.lostT = seen ? 0 : this.lostT + dt;
        if (this.lostT > 0.35) {
          this.cd = 0.4;
          this.go('watch', 'idle');
          break;
        }
        if (seen) this.facing = tx >= this.zone.x ? 1 : -1;
        const aim = this.pickAim(tx, ty);
        if (aim !== this.aim) {
          const f = this.sprite.anims.currentFrame?.index ?? 1;
          this.aim = aim;
          this.play(`draw${aim}`, f - 1);
        }
        if (this.t > C.draw) {
          this.release(tx, ty);
          this.go('shoot', `shoot${this.aim}`);
        }
        break;
      }
      case 'shoot':
        if (this.t > 0.32) {
          this.cd = C.cooldown;
          this.go('watch', 'idle');
        }
        break;
      case 'hurt':
        if (this.t > 0.28) {
          this.cd = Math.max(this.cd, 0.6);
          this.go('watch', 'idle');
        }
        break;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(b.bottom));
    face(this.sprite, this.facing < 0);
  }

  // solta a flecha no cavaleiro (o arco não vira mais que 60 graus para cima ou para baixo)
  private release(tx: number, ty: number) {
    const o = this.bowPoint(this.aim);
    const ang = Phaser.Math.Clamp(Math.atan2(ty - o.y, Math.abs(tx - o.x)), -1.05, 1.05);
    this.scene.spawnEnemyArrow(o.x, o.y, Math.cos(ang) * this.facing, Math.sin(ang));
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    return this.alive && !sliding && overlap(pr, this.rect);
  }

  hit(_fromX: number, dmg: number): HitResult {
    if (!this.alive) return 'ignored';
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    // apanhar no meio da mira faz ele perder o tiro
    this.go('hurt', 'hurt');
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
    this.anim = 'death';
    this.sprite.play('archer-death');
    this.scene.sfx('thud', 0.6);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.scene.tweens.add({ targets: this.sprite, alpha: 0, delay: 1300, duration: 800, onComplete: () => this.sprite.destroy() });
    });
  }
}

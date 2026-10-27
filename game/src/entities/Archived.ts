import Phaser from 'phaser';
import { ARCHIVED as C, PAL, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { overlap, type Enemy, type HitDir, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';
import { DEPTH } from '../world/Decor';

type State = 'seated' | 'getup' | 'wander' | 'stand' | 'chase' | 'reach' | 'drain' | 'hurt';

// Os Arquivados (Torres Rúnicas): gente cuja memória está nos frascos do Arquivo, só o corpo. Andam devagar
// entre as estantes, de olhos fechados e braços estendidos, e vão atrás do calor de quem passa perto. O toque
// não abre rachadura: leva uma conta de Âmbar (a rachadura da têmpora acende). Sem Âmbar, o toque machuca.
// Deslizando, o cavaleiro passa por baixo dos braços. Vencidos, não morrem de novo: o corpo deita, um fio de
// luz sobe para o frasco mais perto e ele some (volta para a estante). Na Sala das Experiências eles ainda estão
// sentados nas cadeiras, de coroa, e levantam quando alguém chega perto (a coroa fica na cadeira)
export class Archived implements Enemy {
  readonly kind = 'archived' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  facing: 1 | -1 = 1;
  private state: State = 'stand';
  private t = 0;
  private wait = 0.5 + Math.random() * 1.5;
  private flashT = 0;
  private lostT = 0;
  private anim = '';
  // qual dos dois corpos (0: cabelo curto; 1: cabelo comprido)
  private readonly v: 0 | 1;
  private readonly homeX: number;
  // a cadeira das Experiências em que ele está sentado (-1: nenhuma)
  private chair = -1;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.homeX = x;
    // (misturado pela posição, para que vizinhos de fila e de andar não saiam iguais)
    this.v = (((3 * Math.floor(x / TILE) + Math.floor(feetY / TILE)) >> 3) & 1) as 0 | 1;
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(300, 600);
    const o = scene.registry.get('archived-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'archived', 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy));
    this.facing = Math.random() < 0.5 ? 1 : -1;
    const seat = scene.torres?.chairAt(x, feetY);
    if (seat) {
      this.chair = seat.i;
      this.facing = seat.facing;
      this.state = 'seated';
      this.play('sit');
    } else this.play('idle');
    // cada um no seu passo (não respiram juntos)
    this.sprite.anims.setProgress(Math.random());
    face(this.sprite, this.facing < 0);
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  // os braços estendidos: o toque chega um pouco à frente do corpo, na altura do peito
  private get arms() {
    const b = this.body;
    const w = this.state === 'reach' || this.state === 'drain' ? 16 : 10;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.right : b.left - w, b.bottom - 34, w, 12);
  }

  // a rachadura de Âmbar na têmpora (para onde vai o que ele leva)
  private get temple() {
    return { x: this.zone.x + this.facing * 3, y: this.body.bottom - 36 };
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`archived-${name}-${this.v}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  // não anda para fora da beirada nem contra a estante
  private stopAtEdge() {
    const b = this.body;
    if (b.velocity.x === 0 || !b.blocked.down) return;
    const l = this.scene.level;
    const dir = Math.sign(b.velocity.x);
    const ax = dir > 0 ? b.right + 3 : b.left - 3;
    if (!isGround(l.tileAt(ax, b.bottom + 4)) || isSolid(l.tileAt(ax, b.bottom - 8))) b.velocity.x = 0;
  }

  // sente o cavaleiro por perto, no mesmo andar e sem parede no meio (de olhos fechados, é o calor)
  private senses() {
    const p = this.scene.player;
    if (p.dead) return false;
    const dx = p.x - this.zone.x;
    if (Math.abs(dx) > C.sight || Math.abs(p.body.bottom - this.body.bottom) > 40) return false;
    const L = this.scene.level;
    const y = this.body.bottom - 30;
    const n = Math.ceil(Math.abs(dx) / (TILE / 2));
    for (let i = 1; i < n; i++) if (isSolid(L.tileAt(this.zone.x + (dx * i) / n, y))) return false;
    return true;
  }

  // levanta da cadeira: a coroa fica no braço dela
  private rise() {
    this.go('getup', 'getup');
    this.scene.torres?.chairFree(this.chair);
    this.scene.sfx('ghost', 0.3, 0.7);
  }

  update(dt: number) {
    if (!this.alive) return;
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    const sensed = this.senses();
    const dx = p.x - this.zone.x;
    const side: 1 | -1 = dx >= 0 ? 1 : -1;

    switch (this.state) {
      case 'seated':
        b.velocity.x = 0;
        if (!p.dead && Math.abs(dx) < C.wake && Math.abs(p.body.bottom - b.bottom) < 40) this.rise();
        break;
      case 'getup':
        b.velocity.x = 0;
        if (this.t > 0.72) {
          this.facing = side;
          this.go('chase', 'idle');
        }
        break;
      case 'stand':
        b.velocity.x = 0;
        this.play('idle');
        if (sensed) {
          this.go('chase');
          break;
        }
        if (this.t > this.wait) {
          // anda um pouco para um lado, sem se afastar muito de onde estava
          if (Math.abs(this.zone.x - this.homeX) > 36) this.facing = this.zone.x > this.homeX ? -1 : 1;
          else if (Math.random() < 0.5) this.facing = (this.facing * -1) as 1 | -1;
          this.wait = 1.2 + Math.random() * 1.8;
          this.go('wander');
        }
        break;
      case 'wander':
        b.velocity.x = this.facing * C.walk;
        this.stopAtEdge();
        this.play(b.velocity.x === 0 ? 'idle' : 'walk');
        if (sensed) this.go('chase');
        else if (this.t > this.wait || b.velocity.x === 0) {
          this.wait = 0.8 + Math.random() * 1.6;
          this.go('stand');
        }
        break;
      case 'chase': {
        this.lostT = sensed ? 0 : this.lostT + dt;
        if (this.lostT > 1.6) {
          this.wait = 1 + Math.random();
          this.go('stand');
          break;
        }
        this.facing = side;
        b.velocity.x = Math.abs(dx) > 6 ? side * C.chase : 0;
        this.stopAtEdge();
        this.play(b.velocity.x === 0 ? 'idle' : 'walk');
        if (Math.abs(dx) < C.reach && sensed) this.go('reach', 'reach');
        break;
      }
      case 'reach':
        // de braços esticados ele continua vindo, mais devagar
        this.facing = side;
        b.velocity.x = Math.abs(dx) > 4 ? side * C.chase * 0.6 : 0;
        this.stopAtEdge();
        if (this.t > 0.9 && (Math.abs(dx) > C.reach + 14 || !sensed)) this.go('chase');
        break;
      case 'drain':
        // segurando o que levou: parado, a rachadura acesa
        b.velocity.x = 0;
        if (this.t > 0.8) this.go('reach', 'reach');
        break;
      case 'hurt':
        b.velocity.x *= Math.pow(0.85, dt * 60);
        if (this.t > 0.3) this.go(sensed ? 'chase' : 'stand', 'idle');
        break;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(b.bottom));
    face(this.sprite, this.facing < 0);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    if (!this.alive || sliding || this.state === 'hurt' || this.state === 'seated' || this.state === 'getup') return false;
    if (!overlap(pr, this.rect) && !overlap(pr, this.arms)) return false;
    // com Âmbar, o toque leva uma conta em vez de machucar
    const tp = this.temple;
    const r = this.scene.sapAmber(this.zone.x, tp.x, tp.y);
    if (r === 'took') this.go('drain', 'drain');
    return r === 'none';
  }

  hit(fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive) return 'ignored';
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    if (this.hp <= 0) {
      this.die();
      return 'hit';
    }
    // sentado, o golpe acorda: ele levanta (e não cai para trás no meio disso)
    if (this.state === 'seated') this.rise();
    if (this.state === 'getup') return 'hit';
    this.go('hurt', 'hurt');
    this.body.velocity.x = -Math.sign(fromX - this.zone.x) * 70;
    return 'hit';
  }

  vanish() {
    if (!this.alive) return null;
    this.alive = false;
    this.body.enable = false;
    return this.sprite;
  }

  private die() {
    this.alive = false;
    this.body.enable = false;
    const s = this.scene;
    s.time.delayedCall(80, () => this.sprite.clearTint());
    s.sfx('thud', 0.45, 1.2);
    s.sfx('ghost', 0.35, 0.8);
    // vencido sem chegar a levantar (de longe), ele afunda na cadeira e a luz sai dali mesmo
    const seated = this.state === 'seated';
    if (this.chair >= 0) s.torres?.chairFree(this.chair);
    const tp = seated ? { x: this.zone.x - this.facing * 2, y: this.body.bottom - 30 } : this.temple;
    const release = () => {
      // deitado, a luz sai da têmpora e volta para o frasco dele, à vista (nas Experiências, para o tanque);
      // sem frasco por perto, ela sobe um pouco e se apaga
      const from = seated ? tp : { x: this.zone.x + this.facing * 14, y: this.body.bottom - 6 };
      const jar = s.torres?.lightHome(from.x, from.y);
      if (jar) s.lightThread(from.x, from.y, jar.x, jar.y, 9, 900, PAL.gold, () => jar.flare());
      else s.lightThread(from.x, from.y, from.x + (Math.random() - 0.5) * 12, from.y - 56, 7, 1100, PAL.gold);
      s.sfx('chime', 0.22, 0.75);
      s.tweens.add({ targets: this.sprite, alpha: 0, delay: 500, duration: 1300, onComplete: () => this.sprite.destroy() });
    };
    if (seated) {
      this.sprite.anims.pause();
      s.tweens.add({ targets: this.sprite, y: this.sprite.y + 1, duration: 300, ease: 'Quad.easeIn' });
      s.time.delayedCall(380, release);
    } else {
      this.anim = 'death';
      this.sprite.play(`archived-death-${this.v}`);
      this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, release);
    }
    s.glowBurst(tp.x, tp.y, PAL.gold, 1.2);
  }
}

import Phaser from 'phaser';
import { GUARD as C, PARRY } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { overlap, type Enemy, type HitDir, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';

type State =
  | 'patrol' | 'guard' | 'turn' | 'block' | 'hurt'
  | 'windup' | 'strike' | 'recover'
  | 'bashwind' | 'bash' | 'bashrec'
  | 'trip' | 'down' | 'getup' | 'stagger';

// estados em que o escudo não está na frente do corpo
const OPEN: State[] = ['strike', 'recover', 'trip', 'down', 'getup', 'hurt', 'stagger'];
const FLOORED: State[] = ['trip', 'down', 'getup'];

// Guarda do Dízimo. Pedra, papel e tesoura com o jogador:
// corte alto (espada levantada) -> agache ou deslize; escudo baixo (agachado atrás do escudo) -> pule;
// parado de guarda -> deslize nas pernas para derrubar, ou vá pelas costas antes que ele se vire.
// O corte alto também dá para aparar: golpear quando a espada desce joga a espada para trás e
// deixa ele tonto, de escudo aberto.
export class Guard implements Enemy {
  readonly kind = 'guard' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  facing: 1 | -1 = -1;
  private state: State = 'patrol';
  private t = 0;
  private behindT = 0;
  private atkCd = 0.8;
  private tripCd = 0;
  private flashT = 0;
  private lostT = 0;
  private anim = '';
  private readonly homeX: number;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.homeX = x;
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(400, 600);
    const o = scene.registry.get('guard-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'guard', 0).setOrigin(o.x, o.y).setDepth(8));
    this.facing = scene.player && scene.player.x > x ? 1 : -1;
    this.play('idle');
  }

  get rect() {
    const b = this.body;
    if (this.state === 'down' || this.state === 'trip') return new Phaser.Geom.Rectangle(b.center.x - 24, b.bottom - 18, 48, 18);
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  private get legs() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x - 4, b.bottom - 18, b.width + 8, 18);
  }

  // área do corte (alta: quem está agachado ou deslizando passa por baixo)
  private get swordBox() {
    const b = this.body;
    const w = 54;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x : b.center.x - w, b.bottom - 58, w, 30);
  }

  // área do golpe de escudo (baixa: só pulando por cima)
  private get bashBox() {
    const b = this.body;
    const w = 22;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.right - 4 : b.left + 4 - w, b.bottom - 40, w, 40);
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`guard-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  // não anda para fora da beirada nem contra a parede
  private stopAtEdge() {
    const b = this.body;
    if (b.velocity.x === 0 || !b.blocked.down) return;
    const l = this.scene.level;
    const dir = Math.sign(b.velocity.x);
    const ax = dir > 0 ? b.right + 3 : b.left - 3;
    if (!isGround(l.tileAt(ax, b.bottom + 4)) || isSolid(l.tileAt(ax, b.bottom - 8))) b.velocity.x = 0;
  }

  update(dt: number) {
    if (!this.alive) return;
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    this.atkCd -= dt;
    this.tripCd -= dt;
    const dx = p.x - this.zone.x;
    const dy = p.body.bottom - b.bottom;
    const seen = !p.dead && Math.abs(dx) < C.sight && Math.abs(dy) < 100;
    const side: 1 | -1 = dx >= 0 ? 1 : -1;

    switch (this.state) {
      case 'patrol': {
        if (Math.abs(this.zone.x - this.homeX) > 70) this.facing = this.zone.x > this.homeX ? -1 : 1;
        b.velocity.x = this.facing * C.walk * 0.6;
        this.stopAtEdge();
        if (b.velocity.x === 0) this.facing = (this.facing * -1) as 1 | -1;
        this.play('walk');
        if (seen) this.go('guard');
        break;
      }
      case 'guard': {
        this.lostT = seen ? 0 : this.lostT + dt;
        if (this.lostT > 2.5) {
          this.go('patrol');
          break;
        }
        if (side !== this.facing) {
          // jogador nas costas: demora um pouco para perceber e se virar
          this.behindT += dt;
          b.velocity.x = 0;
          this.play('idle');
          if (this.behindT > C.turnDelay) this.go('turn', 'turn');
          break;
        }
        this.behindT = Math.max(0, this.behindT - dt * 2);
        const dist = Math.abs(dx);
        if (dist < C.reach && this.atkCd <= 0 && Math.abs(dy) < 44) {
          b.velocity.x = 0;
          const low = p.crouched || p.sliding || Math.random() < 0.3;
          if (low) this.go('bashwind', 'bashwind');
          else {
            this.go('windup', 'windup');
            this.scene.sfx('swoosh', 0.35);
          }
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
      case 'turn':
        b.velocity.x = 0;
        if (this.t > 0.16) {
          this.facing = (this.facing * -1) as 1 | -1;
          this.behindT = 0;
          this.go('guard', 'idle');
        }
        break;
      case 'block':
        b.velocity.x *= Math.pow(0.8, dt * 60);
        if (this.t > 0.2) this.go('guard', 'idle');
        break;
      case 'hurt':
        b.velocity.x *= Math.pow(0.85, dt * 60);
        if (this.t > 0.24) this.go('guard', 'idle');
        break;
      case 'windup':
        b.velocity.x = 0;
        if (this.t > C.windup) {
          this.go('strike', 'strike');
          this.scene.sfx('heavy');
          b.velocity.x = this.facing * 80;
        }
        break;
      case 'strike':
        b.velocity.x *= Math.pow(0.85, dt * 60);
        this.stopAtEdge();
        if (this.t > C.strike) this.go('recover', 'recover');
        break;
      case 'recover':
        b.velocity.x = 0;
        if (this.t > C.recover) {
          this.atkCd = C.atkCd;
          this.go('guard', 'idle');
        }
        break;
      case 'bashwind':
        b.velocity.x = 0;
        if (this.t > C.bashWind) {
          this.go('bash', 'bash');
          this.scene.sfx('dash');
        }
        break;
      case 'bash':
        b.velocity.x = this.facing * C.bashSpeed;
        this.stopAtEdge();
        if (this.t > C.bashTime) this.go('bashrec', 'bashrec');
        break;
      case 'bashrec':
        b.velocity.x *= Math.pow(0.8, dt * 60);
        if (this.t > 0.36) {
          this.atkCd = C.atkCd;
          this.go('guard', 'idle');
        }
        break;
      case 'stagger':
        b.velocity.x *= Math.pow(0.86, dt * 60);
        this.stopAtEdge();
        if (this.t > PARRY.stagger) {
          this.atkCd = 0.5;
          this.go('guard', 'idle');
        }
        break;
      case 'trip':
        b.velocity.x *= Math.pow(0.9, dt * 60);
        if (this.t > 0.26) {
          this.go('down', 'down');
          this.scene.sfx('thud');
          this.scene.dustBurst(this.zone.x - this.facing * 12, b.bottom, 12);
          this.scene.cameras.main.shake(90, 0.004);
        }
        break;
      case 'down':
        b.velocity.x = 0;
        if (this.t > C.downTime) this.go('getup', 'getup');
        break;
      case 'getup':
        b.velocity.x = 0;
        if (this.t > 0.4) {
          this.tripCd = C.tripCd;
          this.facing = side;
          this.behindT = 0;
          this.atkCd = 0.35;
          this.go('guard', 'idle');
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

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    if (!this.alive) return false;
    if (this.state === 'strike' && this.t < C.strikeActive && overlap(pr, this.swordBox)) return true;
    if (this.state === 'bash' && overlap(pr, this.bashBox)) return true;
    // tonto, ele não empurra ninguém: dá para chegar perto e bater
    if (sliding || FLOORED.includes(this.state) || this.state === 'stagger') return false;
    return overlap(pr, this.rect);
  }

  slideInto(pr: Phaser.Geom.Rectangle) {
    if (!this.alive || this.tripCd > 0) return;
    if (FLOORED.includes(this.state) || this.state === 'bash' || this.state === 'bashwind') return;
    if (!overlap(pr, this.legs)) return;
    this.go('trip', 'trip');
    this.scene.sfx('hit', 0.6);
    this.scene.onPlayerAction('trip');
    this.atkCd = 0.6;
  }

  // aparar o corte alto: no fim da preparação ou enquanto a espada desce, golpeando pela frente
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive) return false;
    const late = this.state === 'windup' && this.t > C.windup - PARRY.early;
    const swing = this.state === 'strike' && this.t < C.strikeActive;
    if (!late && !swing) return false;
    if ((Math.sign(fromX - this.zone.x) || this.facing) !== this.facing) return false;
    if (!overlap(box, this.swordBox) && !overlap(box, this.rect)) return false;
    this.go('stagger', 'stagger');
    this.body.velocity.x = -this.facing * 70;
    this.atkCd = 0.6;
    return true;
  }

  hit(fromX: number, dmg: number, dir: HitDir): HitResult {
    if (!this.alive) return 'ignored';
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    const front = (Math.sign(fromX - this.zone.x) || this.facing) === this.facing;
    if (front && dir !== 'down' && dir !== 'quake' && dir !== 'smoke' && !OPEN.includes(this.state)) {
      if (this.state === 'guard' || this.state === 'patrol' || this.state === 'turn' || this.state === 'block') this.go('block', 'block');
      return 'blocked';
    }
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    if (!front) this.behindT = Math.max(this.behindT, C.turnDelay * 0.55);
    if (dir === 'quake' && !FLOORED.includes(this.state) && this.state !== 'bash') {
      // a onda do badalo passa por baixo do escudo e tira o chão dele
      this.go('trip', 'trip');
      this.atkCd = 0.6;
    } else if (this.state === 'patrol' || this.state === 'guard' || this.state === 'block' || this.state === 'turn') {
      this.go('hurt', 'hurt');
      this.body.velocity.x = -Math.sign(fromX - this.zone.x) * 60;
    }
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
    this.sprite.play('guard-death');
    this.scene.sfx('thud', 0.8);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.scene.tweens.add({ targets: this.sprite, alpha: 0, delay: 1400, duration: 900, onComplete: () => this.sprite.destroy() });
    });
  }
}

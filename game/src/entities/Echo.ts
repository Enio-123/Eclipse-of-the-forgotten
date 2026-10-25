import Phaser from 'phaser';
import { ECHO as C, PARRY, WEAPONS, type WeaponId } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { overlap, type Enemy, type HitDir, type HitResult } from './Enemy';
import { SLASH_KEY, type SlashMeta } from './Player';
import { face, hd } from '../gfx/flip';
import { DEPTH } from '../world/Decor';

// cores do abismo (as mesmas do Véu Abissal)
export const ABYSS = { ink: 0x09070d, purple: 0x7029b8, magenta: 0xb52a9b, lilac: 0xd8b7ff };

type State = 'wait' | 'drift' | 'wind' | 'strike' | 'recover' | 'hurt' | 'stagger' | 'home';

const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

// O Eco: a sombra do cavaleiro, que ficou onde ele caiu com as moedas que ele perdeu.
// Espera parada no ar; quando o cavaleiro chega perto, segue devagar mantendo distância e avança
// num corte com a mesma arma que ele está usando. Só o corte machuca (dá para aparar no fim da
// preparação). Derrotada, devolve as moedas.
export class Echo implements Enemy {
  readonly kind = 'echo' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  facing: 1 | -1 = 1;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly eye: Phaser.GameObjects.Image;
  private readonly slash: Phaser.GameObjects.Sprite;
  private readonly slashKey: string;
  private readonly slashOx: number;
  private readonly slashK: number;
  private readonly sheet: string;
  private readonly reach: number;
  private readonly tall: number;
  private readonly home: Phaser.Math.Vector2;
  private state: State = 'wait';
  private t = 0;
  private age = 0;
  private atkCd = 0.7;
  private flashT = 0;
  private trailT = 0;
  private dripT = 0;
  private anim = '';
  // para onde o avanço vai (fixado no começo da preparação)
  private aimY = 0;

  constructor(private scene: GameScene, x: number, feetY: number, weapon: WeaponId) {
    // o arco não corta: a sombra dele usa a espada
    const w: WeaponId = WEAPONS[weapon].ranged ? 'sword' : weapon;
    this.sheet = `knight-${w}`;
    this.slashKey = SLASH_KEY[w] ?? 'slash';
    const meta = (scene.registry.get('slashes') as Record<string, SlashMeta>)[this.slashKey];
    this.slashOx = meta?.ox ?? 0.2;
    this.slashK = 1 / (meta?.scale ?? 1);
    this.reach = Math.min(WEAPONS[w].reach, 74);
    this.tall = Math.min(WEAPONS[w].height, 48);
    this.home = new Phaser.Math.Vector2(x, feetY - 8);
    this.zone = scene.add.zone(x, this.home.y - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.body.setMaxVelocity(520, 520);
    this.glow = scene.add.image(x, feetY - 24, 'glow').setTint(ABYSS.purple).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy - 0.2).setAlpha(0.32).setScale(1.5, 1.9);
    const o = scene.registry.get(`${this.sheet}-origin`) as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, this.home.y, this.sheet, 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy));
    this.sprite.setAlpha(0.94);
    // contorno roxo em volta da silhueta (só com placa de vídeo)
    this.sprite.preFX?.addGlow(ABYSS.purple, 3, 0, false, 0.1, 10);
    this.shade();
    this.eye = scene.add.image(x, feetY - 40, 'glow').setTint(ABYSS.lilac).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy + 0.1).setAlpha(0).setScale(0.22);
    this.slash = scene.add.sprite(0, 0, this.slashKey, 0).setDepth(DEPTH.slash).setVisible(false).setTint(ABYSS.lilac, ABYSS.lilac, ABYSS.magenta, ABYSS.magenta);
    this.slash.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.slash.setVisible(false));
    this.facing = scene.player && scene.player.x < x ? -1 : 1;
    this.play('idle');
  }

  // silhueta escura: o que era claro (máscara, lâmina) fica lilás, o resto quase preto
  private shade() {
    this.sprite.setTint(0x9a82dc, 0x9a82dc, 0x4a2370, 0x4a2370);
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x - 2, b.y + 2, b.width + 4, b.height - 2);
  }

  // área do corte na frente da sombra
  private get strikeBox() {
    const b = this.body;
    const r = this.reach;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x + 2 : b.center.x - 2 - r, b.center.y - 4 - this.tall / 2, r, this.tall);
  }

  get harmFrom() {
    return this.zone.x;
  }

  get waiting() {
    return this.state === 'wait';
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`${this.sheet}-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  update(dt: number) {
    if (!this.alive) return;
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    this.age += dt;
    this.atkCd -= dt;
    const dx = p.x - this.zone.x;
    const dy = p.body.bottom - b.bottom;
    const side: 1 | -1 = dx >= 0 ? 1 : -1;
    const fromHome = Math.hypot(p.x - this.home.x, p.body.bottom - this.home.y);

    switch (this.state) {
      case 'wait': {
        this.float(dt, this.home.x, this.home.y, 0.5);
        this.play('idle');
        if (this.age > C.calm && !p.dead && Math.abs(dx) < C.sight && Math.abs(dy) < C.sightY) this.wake();
        break;
      }
      case 'drift': {
        this.facing = side;
        if (p.dead || fromHome > C.leash) {
          this.go('home');
          break;
        }
        // fica do lado em que está, a uma distância de golpe, na altura do cavaleiro
        this.float(dt, p.x - side * C.keep, p.body.bottom - 2, 1);
        this.play(Math.abs(b.velocity.x) > 40 ? 'fall' : 'idle');
        if (this.atkCd <= 0 && Math.abs(dx) < C.reach && Math.abs(dy) < 70) {
          this.aimY = p.body.bottom - 2;
          this.go('wind', 'land');
          this.scene.sfx('echo', 0.55, 1.35);
        }
        break;
      }
      case 'wind': {
        // recua um palmo e o olho acende antes de avançar
        this.facing = side;
        b.velocity.x = approach(b.velocity.x, -this.facing * 26, 900 * dt);
        b.velocity.y = approach(b.velocity.y, 0, 900 * dt);
        const k = Math.min(1, this.t / C.windup);
        this.eye.setAlpha(0.35 + 0.65 * k).setScale(0.18 + 0.2 * k);
        if (this.t > C.windup) this.lunge();
        break;
      }
      case 'strike': {
        const k = this.t / C.lungeTime;
        b.velocity.x = this.facing * C.lunge * (1 - 0.7 * k);
        b.velocity.y = Phaser.Math.Clamp((this.aimY - b.bottom) / Math.max(0.05, C.lungeTime - this.t), -240, 240);
        this.trailT -= dt;
        if (this.trailT <= 0) {
          this.trailT = 0.03;
          this.afterimage();
        }
        if (this.t > C.lungeTime || (this.facing > 0 ? b.blocked.right : b.blocked.left)) {
          this.go('recover', 'fall');
          this.eye.setAlpha(0);
        }
        break;
      }
      case 'recover':
        b.velocity.x = approach(b.velocity.x, 0, 700 * dt);
        b.velocity.y = approach(b.velocity.y, -12, 500 * dt);
        if (this.t > C.recover) {
          this.atkCd = Phaser.Math.FloatBetween(C.atkCd[0], C.atkCd[1]);
          this.go('drift', 'idle');
        }
        break;
      case 'hurt':
        b.velocity.x = approach(b.velocity.x, 0, 900 * dt);
        b.velocity.y = approach(b.velocity.y, 0, 900 * dt);
        if (this.t > C.hurt) this.go('drift', 'idle');
        break;
      case 'stagger':
        // aparada: cai um pouco, sem forças, e os golpes entram com bônus
        b.velocity.x = approach(b.velocity.x, 0, 300 * dt);
        b.velocity.y = approach(b.velocity.y, 30, 300 * dt);
        if (this.t > PARRY.stagger) {
          this.atkCd = 0.5;
          this.shade();
          this.go('drift', 'idle');
        }
        break;
      case 'home':
        this.float(dt, this.home.x, this.home.y, 0.8);
        this.play('fall');
        if (Math.hypot(this.zone.x - this.home.x, b.bottom - this.home.y) < 6) this.go('wait', 'idle');
        else if (!p.dead && fromHome < C.leash * 0.7 && Math.abs(dx) < C.sight) this.go('drift');
        break;
    }
    // não sai pelo alto da sala
    if (b.y < 4) {
      b.y = 4;
      b.velocity.y = Math.max(0, b.velocity.y);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        if (this.state === 'stagger') this.sprite.setTint(0xc8b8f0);
        else this.shade();
      }
    }
    this.draw(dt);
  }

  // paira até o ponto (pé da sombra), com um balanço leve
  private float(dt: number, tx: number, ty: number, pace: number) {
    const b = this.body;
    const sway = Math.sin(this.age * 2.3) * 5;
    const vx = Phaser.Math.Clamp((tx - this.zone.x) * 2.4, -C.speed * pace, C.speed * pace);
    const vy = Phaser.Math.Clamp((ty + sway - b.bottom) * 2.4, -C.speed * 0.8 * pace, C.speed * 0.8 * pace);
    b.velocity.x = approach(b.velocity.x, vx, C.accel * dt);
    b.velocity.y = approach(b.velocity.y, vy, C.accel * dt);
  }

  private wake() {
    this.go('drift', 'fall');
    this.atkCd = 0.9;
    this.scene.sfx('echo', 0.9);
    this.scene.echoWoke(this);
    this.glow.setScale(3);
    this.scene.tweens.add({ targets: this.glow, scaleX: 1.5, scaleY: 1.9, duration: 500, ease: 'Quad.easeOut' });
  }

  private lunge() {
    this.go('strike', 'attack');
    this.scene.sfx('swoosh', 0.7, 0.75);
    this.scene.sfx('echo', 0.35, 1.8);
    this.body.velocity.x = this.facing * C.lunge;
    this.trailT = 0;
    this.slash.setVisible(true).play(this.slashKey);
    this.placeSlash();
  }

  private placeSlash() {
    const b = this.body;
    const ox = this.slashOx;
    this.slash.setPosition(b.center.x + this.facing * 2, b.center.y - 4).setFlipX(this.facing < 0).setOrigin(this.facing < 0 ? 1 - ox : ox, 0.5);
    this.slash.setScale(this.slashK);
  }

  // rastro do avanço: cópias roxas que somem
  private afterimage() {
    const s = this.sprite;
    const g = this.scene.add
      .image(s.x, s.y, s.texture.key, s.frame.name)
      .setOrigin(s.originX, s.originY)
      .setScale(s.scaleX, s.scaleY)
      .setFlipX(s.flipX)
      .setDepth(DEPTH.enemy - 0.1)
      .setTintFill(ABYSS.purple)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.42);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  private draw(dt: number) {
    const b = this.body;
    const x = Math.round(this.zone.x);
    const y = Math.round(b.bottom);
    this.sprite.setPosition(x, y);
    face(this.sprite, this.facing < 0);
    const pulse = 0.5 + 0.5 * Math.sin(this.age * 3.1);
    const awake = this.state !== 'wait';
    this.glow.setPosition(x, y - 22).setAlpha((awake ? 0.3 : 0.2) + pulse * 0.1);
    this.eye.setPosition(x + this.facing * 3, y - 37);
    if (this.slash.visible) this.placeSlash();
    // gotas escuras pingando da capa e luzes lilás subindo
    this.dripT -= dt;
    if (this.dripT <= 0) {
      this.dripT = awake ? 0.09 : 0.16;
      this.scene.echoMotes(x + (Math.random() - 0.5) * 14, y - 4 - Math.random() * 30, Math.random() < 0.55);
    }
  }

  harms(pr: Phaser.Geom.Rectangle) {
    if (!this.alive || this.state !== 'strike' || this.t > C.active + 0.05) return false;
    return overlap(pr, this.strikeBox) || overlap(pr, this.rect);
  }

  // aparar: no fim da preparação ou no começo do avanço, golpeando pela frente
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive) return false;
    const late = this.state === 'wind' && this.t > C.windup - PARRY.early;
    const swing = this.state === 'strike' && this.t < C.active;
    if (!late && !swing) return false;
    if ((Math.sign(fromX - this.zone.x) || this.facing) !== this.facing) return false;
    if (!overlap(box, this.strikeBox) && !overlap(box, this.rect)) return false;
    this.go('stagger', 'hurt');
    this.body.velocity.x = -this.facing * 120;
    this.eye.setAlpha(0);
    this.slash.setVisible(false);
    this.sprite.setTint(0xc8b8f0);
    return true;
  }

  hit(fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive) return 'ignored';
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    if (this.state === 'wait') this.wake();
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xf2e8ff);
    const away = Math.sign(this.zone.x - fromX) || -this.facing;
    if (this.state !== 'stagger') {
      this.go('hurt', 'hurt');
      this.eye.setAlpha(0);
      this.slash.setVisible(false);
    }
    this.body.velocity.x = away * C.knock;
    this.body.velocity.y = -40;
    this.scene.echoMotes(this.zone.x, this.zone.y, false, 6);
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  private die() {
    this.alive = false;
    this.body.enable = false;
    this.slash.setVisible(false);
    this.eye.destroy();
    this.sprite.anims.stop();
    const s = this.sprite;
    // a sombra estica para cima e se desfaz em gotas
    this.scene.time.delayedCall(70, () => s.setTintFill(ABYSS.lilac));
    this.scene.tweens.add({
      targets: s,
      scaleY: s.scaleY * 1.35,
      scaleX: s.scaleX * 0.6,
      alpha: 0,
      delay: 120,
      duration: 520,
      ease: 'Quad.easeIn',
      onComplete: () => s.destroy(),
    });
    this.scene.tweens.add({ targets: this.glow, scale: 4, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => this.glow.destroy() });
    this.scene.echoDefeated(this.zone.x, this.zone.y);
  }

  destroy() {
    this.slash.destroy();
  }
}

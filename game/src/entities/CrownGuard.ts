import Phaser from 'phaser';
import { CROWN_GUARD as C, PARRY, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { overlap, type Enemy, type HitDir, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';
import { DEPTH } from '../world/Decor';

type State = 'patrol' | 'guard' | 'turn' | 'block' | 'hurt' | 'aim' | 'thrust' | 'thrustrec' | 'spinwind' | 'spin' | 'spinrec' | 'stagger';

// estados em que o escudo não está na frente do corpo (do aviso do giro em diante ele está agachado,
// com o escudo para a frente mas aberto por cima)
const OPEN: State[] = ['thrust', 'thrustrec', 'spinwind', 'spin', 'spinrec', 'hurt', 'stagger'];

interface SheetPoints {
  points: Record<string, { tip: [number, number]; blade: [number, number] }[]>;
}

// Guarda da Coroação (Torres Rúnicas): soldado da Casa Vhalor, que na noite subiu atrás dela. Anda com o
// escudo alto e a alabarda em pé, e o escudo para o que vem pela frente (menos o golpe de cima e o que
// passa por baixo). De longe, a estocada: recua a alabarda (a viseira e a runa do escudo acendem) e estica
// tudo de uma vez, na altura do peito: agache, pule por cima ou apare a ponta. Perto demais ou pelas
// costas, o giro: agacha e passa a alabarda rente ao chão dos dois lados: pule. Depois de cada golpe ele
// fica aberto.
export class CrownGuard implements Enemy {
  readonly kind = 'crownguard' as const;
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
  private flashT = 0;
  private lostT = 0;
  private anim = '';
  private readonly homeX: number;
  private readonly points: SheetPoints['points'];
  // o rastro do giro rente ao chão
  private arc: Phaser.GameObjects.Image | null = null;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.homeX = x;
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(400, 600);
    this.points = (scene.cache.json.get('crownguard-meta') as SheetPoints).points;
    const o = scene.registry.get('crownguard-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'crownguard', 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy));
    this.facing = scene.player && scene.player.x > x ? 1 : -1;
    this.play('idle');
    CrownGuard.textures(scene);
  }

  // o rastro do giro: um anel achatado de luz fria, mais forte na frente
  private static textures(scene: Phaser.Scene) {
    if (scene.textures.exists('spin-arc')) return;
    const W = 128;
    const H = 24;
    const c = scene.textures.createCanvas('spin-arc', W, H)!;
    const ctx = c.getContext();
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = (x + 0.5 - W / 2) / (W / 2);
        const ny = (y + 0.5 - H / 2) / (H / 2);
        const r = Math.hypot(nx, ny);
        const ring = Math.max(0, 1 - Math.abs(r - 0.82) / 0.16);
        // a metade de baixo (a que passa na frente) mais forte
        const a = ring * ring * (ny > 0 ? 1 : 0.45);
        const i = (y * W + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 244;
        img.data[i + 2] = 214;
        img.data[i + 3] = Math.round(255 * Math.min(1, a));
      }
    }
    ctx.putImageData(img, 0, 0);
    c.refresh();
  }

  get rect() {
    const b = this.body;
    // agachado no giro, ele fica mais baixo
    const low = this.state === 'spinwind' || this.state === 'spin';
    return new Phaser.Geom.Rectangle(b.x, low ? b.bottom - C.bodyH + 10 : b.y, b.width, low ? C.bodyH - 10 : b.height);
  }

  // um ponto da alabarda no quadro de agora (a folha guarda a ponta e o meio da lâmina de cada quadro)
  private pt(key: 'tip' | 'blade') {
    const pts = this.points[this.anim];
    const i = (this.sprite.anims.currentFrame?.index ?? 1) - 1;
    const q = pts?.[Math.min(i, pts.length - 1)]?.[key] ?? [60, -31];
    return { x: this.zone.x + this.facing * q[0], y: this.body.bottom + q[1] };
  }

  // a estocada: o último trecho da haste até a ponta, acima da altura de quem está agachado (a ponta fica
  // uns 29 px acima dos pés; o cavaleiro agachado tem 26)
  private get thrustBox() {
    const t = this.pt('tip');
    const w = 36;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? t.x - w : t.x, t.y - 7, w, 8);
  }

  // o giro: rente ao chão, dos dois lados
  private get spinBox() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.center.x - C.spinReach, b.bottom - C.spinH, C.spinReach * 2, C.spinH);
  }

  get harmFrom() {
    if (this.state === 'thrust') return this.pt('tip').x - this.facing * 30;
    return undefined;
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`crownguard-${name}`);
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

  // de onde ele está, sem pedra no meio, na altura do elmo
  private sees() {
    const p = this.scene.player;
    const L = this.scene.level;
    const x0 = this.zone.x;
    const y0 = this.body.bottom - 46;
    const x1 = p.x;
    const y1 = p.body.center.y;
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE / 2));
    for (let i = 1; i < n; i++) if (isSolid(L.tileAt(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n))) return false;
    return true;
  }

  private startSpin() {
    this.body.velocity.x = 0;
    this.go('spinwind', 'spinwind');
    this.scene.sfx('swoosh', 0.3, 0.6);
  }

  update(dt: number) {
    if (!this.alive) return;
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    this.atkCd -= dt;
    const dx = p.x - this.zone.x;
    const dy = p.body.bottom - b.bottom;
    const seen = !p.dead && Math.abs(dx) < C.sight && Math.abs(dy) < 90 && this.sees();
    const side: 1 | -1 = dx >= 0 ? 1 : -1;
    const dist = Math.abs(dx);

    switch (this.state) {
      case 'patrol': {
        if (Math.abs(this.zone.x - this.homeX) > 64) this.facing = this.zone.x > this.homeX ? -1 : 1;
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
        // pelas costas e perto: ele sente e gira; mais longe, demora um pouco para virar
        if (side !== this.facing) {
          b.velocity.x = 0;
          this.play('idle');
          if (dist < C.close && Math.abs(dy) < 40 && this.atkCd <= 0) {
            this.startSpin();
            break;
          }
          this.behindT += dt;
          if (this.behindT > C.turnDelay) this.go('turn', 'turn');
          break;
        }
        this.behindT = Math.max(0, this.behindT - dt * 2);
        if (this.atkCd <= 0 && Math.abs(dy) < 40) {
          if (dist < C.close) {
            this.startSpin();
            break;
          }
          if (dist < C.reach) {
            b.velocity.x = 0;
            this.go('aim', 'aim');
            this.scene.sfx('swoosh', 0.3, 0.7);
            this.scene.sfx('chime', 0.12, 1.6);
            break;
          }
        }
        // procura a distância da alabarda: chega perto se está longe, recua devagar se está perto demais
        if (dist > C.keep + 14) {
          b.velocity.x = this.facing * C.walk;
          this.play('walk');
        } else if (dist < C.close + 6 && this.atkCd > 0) {
          b.velocity.x = -this.facing * C.walk * 0.6;
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
        if (this.t > 0.18) {
          this.facing = (this.facing * -1) as 1 | -1;
          this.behindT = 0;
          this.go('guard', 'idle');
        }
        break;
      case 'block':
        b.velocity.x *= Math.pow(0.8, dt * 60);
        if (this.t > 0.22) this.go('guard', 'idle');
        break;
      case 'hurt':
        b.velocity.x *= Math.pow(0.85, dt * 60);
        if (this.t > 0.26) this.go('guard', 'idle');
        break;
      case 'aim':
        b.velocity.x = 0;
        if (this.t > C.aim) {
          this.go('thrust', 'thrust');
          this.scene.sfx('stab', 0.9, 0.85);
          this.scene.sfx('swoosh', 0.5, 1.1);
          b.velocity.x = this.facing * C.lunge;
        }
        break;
      case 'thrust':
        b.velocity.x *= Math.pow(0.86, dt * 60);
        this.stopAtEdge();
        if (this.t > C.thrust) this.go('thrustrec', 'thrustrec');
        break;
      case 'thrustrec':
        b.velocity.x = 0;
        if (this.t > C.thrustRec) {
          this.atkCd = C.atkCd * (0.8 + Math.random() * 0.4);
          this.go('guard', 'idle');
        }
        break;
      case 'spinwind':
        b.velocity.x = 0;
        if (this.t > C.spinWind) {
          this.go('spin', 'spin');
          this.scene.sfx('swoosh', 0.8, 0.75);
          this.scene.time.delayedCall(260, () => this.alive && this.state === 'spin' && this.scene.sfx('swoosh', 0.6, 0.9));
          this.arc = this.scene.add.image(this.zone.x, b.bottom - C.spinH * 0.45, 'spin-arc').setBlendMode(Phaser.BlendModes.ADD)
            .setDisplaySize(C.spinReach * 2 + 8, 16).setDepth(DEPTH.enemy + 0.5).setAlpha(0);
        }
        break;
      case 'spin': {
        b.velocity.x = 0;
        if (this.arc) this.arc.setPosition(this.zone.x, b.bottom - C.spinH * 0.45).setAlpha(0.5 * Math.sin(Math.min(1, this.t / C.spin) * Math.PI)).setFlipX(this.t % 0.12 < 0.06);
        if (Math.random() < dt * 20) this.scene.dustBurst(this.zone.x + (Math.random() - 0.5) * C.spinReach * 2, b.bottom, 1);
        if (this.t > C.spin) {
          this.arc?.destroy();
          this.arc = null;
          this.go('spinrec', 'spinrec');
        }
        break;
      }
      case 'spinrec':
        b.velocity.x = 0;
        if (this.t > C.spinRec) {
          this.atkCd = C.atkCd * (0.8 + Math.random() * 0.4);
          this.facing = side;
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
    if (this.state === 'thrust' && this.t < C.thrustActive && overlap(pr, this.thrustBox)) return true;
    if (this.state === 'spin' && overlap(pr, this.spinBox)) return true;
    // tonto, ele não empurra ninguém; deslizando, o cavaleiro passa entre as pernas dele
    if (sliding || this.state === 'stagger') return false;
    return overlap(pr, this.rect);
  }

  // aparar a estocada: no fim do aviso ou com a ponta indo, golpeando pela frente
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive) return false;
    const late = this.state === 'aim' && this.t > C.aim - PARRY.early;
    const going = this.state === 'thrust' && this.t < C.thrustActive;
    if (!late && !going) return false;
    if ((Math.sign(fromX - this.zone.x) || this.facing) !== this.facing) return false;
    if (!overlap(box, this.thrustBox) && !overlap(box, this.rect)) return false;
    this.go('stagger', 'stagger');
    this.body.velocity.x = -this.facing * 80;
    this.atkCd = 0.6;
    this.scene.sfx('clang', 0.8, 0.8);
    return true;
  }

  hit(fromX: number, dmg: number, dir: HitDir): HitResult {
    if (!this.alive) return 'ignored';
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    const front = (Math.sign(fromX - this.zone.x) || this.facing) === this.facing;
    // o escudo alto para o que vem de frente; o golpe de cima, a onda pelo chão e a fumaça passam
    if (front && dir !== 'down' && dir !== 'quake' && dir !== 'smoke' && dir !== 'low' && !OPEN.includes(this.state)) {
      if (this.state === 'guard' || this.state === 'patrol' || this.state === 'turn' || this.state === 'block') this.go('block', 'block');
      return 'blocked';
    }
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    if (!front) this.behindT = Math.max(this.behindT, C.turnDelay * 0.6);
    if (this.hp <= 0) {
      this.die();
      return 'hit';
    }
    if (this.state === 'patrol' || this.state === 'guard' || this.state === 'block' || this.state === 'turn') {
      this.go('hurt', 'hurt');
      this.body.velocity.x = -Math.sign(fromX - this.zone.x) * 50;
    }
    return 'hit';
  }

  vanish() {
    if (!this.alive) return null;
    this.alive = false;
    this.body.enable = false;
    this.arc?.destroy();
    this.arc = null;
    return this.sprite;
  }

  destroy() {
    this.arc?.destroy();
    this.arc = null;
  }

  private die() {
    this.alive = false;
    this.body.enable = false;
    this.arc?.destroy();
    this.arc = null;
    const s = this.scene;
    s.deathBurst(this.zone.x, this.zone.y);
    s.time.delayedCall(80, () => this.sprite.clearTint());
    this.anim = 'death';
    this.sprite.play('crownguard-death');
    s.sfx('thud', 0.8);
    s.time.delayedCall(520, () => s.sfx('clang', 0.45, 0.6));
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      s.tweens.add({ targets: this.sprite, alpha: 0, delay: 1600, duration: 900, onComplete: () => this.sprite.destroy() });
    });
  }
}

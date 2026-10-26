import Phaser from 'phaser';
import { HERON as C, PARRY, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isSolid } from '../world/Level';
import { overlap, type Enemy, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';
import { DEPTH } from '../world/Decor';

type State = 'stand' | 'turn' | 'cock' | 'stab' | 'hold' | 'recover' | 'takeoff' | 'fly' | 'land' | 'hurt' | 'stun';

interface Spot {
  x: number;
  // y dos pés (o fundo da água rasa ou o chão da margem)
  y: number;
  wet: boolean;
}

interface SheetPoints {
  points: Record<string, [number, number][]>;
}

// Garça Cinzenta (Vale das Cachoeiras): a única coisa cinza dentro da lembrança. Fica parada no raso como
// uma estátua, virando só a cabeça. Com o cavaleiro perto e na frente, encolhe o pescoço num Z (o aviso) e
// dá o bote: o pescoço inteiro estica de uma vez e o bico fica um instante lá na frente (a hora de bater).
// Aparar o bico na hora deixa ela tonta. Apanhou: levanta voo e vai para outro ponto do raso.
export class Heron implements Enemy {
  readonly kind = 'heron' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  facing: 1 | -1 = -1;
  private state: State = 'stand';
  private t = 0;
  private cd = 0.8;
  private flashT = 0;
  private anim = '';
  private spot: Spot;
  private readonly spots: Spot[];
  private readonly points: Record<string, [number, number][]>;
  // o voo: de onde, para onde e quanto dura
  private from = { x: 0, y: 0 };
  private to: Spot | null = null;
  private flyDur = 1;
  private pos = { x: 0, y: 0 };

  constructor(private scene: GameScene, x: number, y: number) {
    this.spot = this.findFloor(x, y);
    this.spots = this.collectSpots();
    this.pos = { x: this.spot.x, y: this.spot.y };
    this.zone = scene.add.zone(this.spot.x, this.spot.y - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.points = (scene.cache.json.get('heron-meta') as SheetPoints).points;
    const o = scene.registry.get('heron-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(this.spot.x, this.spot.y, 'heron', 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy));
    this.facing = scene.player && scene.player.x > x ? 1 : -1;
    this.sprite.play({ key: 'heron-stand', startFrame: Math.floor(Math.random() * 3) });
    this.anim = 'stand';
  }

  // os pés: o primeiro chão firme embaixo de onde ela foi posta (o fundo da água rasa)
  private findFloor(x: number, y: number): Spot {
    const L = this.scene.level;
    const tx = Math.floor(x / TILE);
    for (let ty = Math.floor((y - 1) / TILE); ty < L.h; ty++) {
      if (L.solidCell(tx, ty + 1)) return { x: tx * TILE + TILE / 2, y: (ty + 1) * TILE, wet: L.ch(tx, ty) === '~' };
    }
    return { x, y, wet: false };
  }

  // onde mais ela pode ficar: chão firme com o raso de no máximo um tile por cima e espaço para o pescoço
  private collectSpots() {
    const L = this.scene.level;
    const out: Spot[] = [];
    const hx = Math.floor(this.spot.x / TILE);
    const hy = Math.floor(this.spot.y / TILE) - 1;
    for (let ty = Math.max(3, hy - 8); ty <= Math.min(L.h - 2, hy + 8); ty++) {
      for (let tx = Math.max(1, hx - 18); tx <= Math.min(L.w - 2, hx + 18); tx++) {
        if (!L.solidCell(tx, ty + 1) || L.solidCell(tx, ty) || L.ch(tx, ty) === '^') continue;
        const wet = L.ch(tx, ty) === '~';
        if (L.ch(tx, ty - 1) === '~') continue;
        if (L.solidCell(tx, ty - 1) || L.solidCell(tx, ty - 2) || L.solidCell(tx - 1, ty - 1) || L.solidCell(tx + 1, ty - 1)) continue;
        out.push({ x: tx * TILE + TILE / 2, y: (ty + 1) * TILE, wet });
      }
    }
    return out;
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x - 2, b.y, b.width + 4, b.height);
  }

  // a ponta do bico agora (a folha guarda o ponto de cada quadro)
  private tip() {
    const pts = this.points[this.anim];
    const i = (this.sprite.anims.currentFrame?.index ?? 1) - 1;
    const pt = pts?.[Math.min(i, pts.length - 1)] ?? [14, -32];
    return { x: this.pos.x + this.facing * pt[0], y: this.pos.y + pt[1] };
  }

  // o bico e o fim do pescoço: o que machuca no bote (e o que dá para aparar)
  private get beakBox() {
    const t = this.tip();
    const w = 16;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? t.x - w + 2 : t.x - 2, t.y - 5, w, 10);
  }

  get harmFrom() {
    return this.tip().x;
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`heron-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  private sees(x0: number, y0: number, x1: number, y1: number) {
    const L = this.scene.level;
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE / 2));
    for (let i = 1; i < n; i++) if (isSolid(L.tileAt(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n))) return false;
    return true;
  }

  // o próximo ponto: longe do cavaleiro, a uma boa distância daqui, de preferência na água
  private nextSpot(): Spot | null {
    const p = this.scene.player;
    let best: Spot | null = null;
    let bestScore = Infinity;
    for (const q of this.spots) {
      const d = Math.hypot(q.x - this.pos.x, q.y - this.pos.y);
      if (d < 64 || d > C.range) continue;
      if (Math.hypot(q.x - p.x, q.y - p.body.bottom) < 90) continue;
      if (!this.sees(this.pos.x, this.pos.y - 30, q.x, q.y - 30)) continue;
      const score = (q.wet ? -60 : 0) + Math.abs(d - 150) * 0.5 - Math.min(160, Math.abs(q.x - p.x)) * 0.4 + Math.random() * 40;
      if (score < bestScore) {
        bestScore = score;
        best = q;
      }
    }
    return best;
  }

  private takeOff() {
    const q = this.nextSpot();
    if (!q) {
      this.cd = 0.4;
      this.go('stand', 'stand');
      return;
    }
    this.to = q;
    this.from = { x: this.pos.x, y: this.pos.y };
    this.flyDur = Phaser.Math.Clamp(Math.hypot(q.x - this.pos.x, q.y - this.pos.y) / C.fly, 0.8, 2.2);
    this.facing = q.x >= this.pos.x ? 1 : -1;
    this.go('takeoff', 'takeoff');
    this.scene.sfx('heron', 0.8, 1);
    this.scene.sfx('flap', 0.7, 0.75);
    if (this.spot.wet) this.scene.splash(this.pos.x, this.surfaceAt(this.pos.x, this.pos.y));
  }

  private surfaceAt(x: number, feetY: number) {
    return this.scene.level.waterAt(x, feetY - 4)?.surface ?? feetY - TILE + 3;
  }

  update(dt: number) {
    if (!this.alive) return;
    const p = this.scene.player;
    this.t += dt;
    this.cd -= dt;
    const dx = p.x - this.pos.x;
    const neckY = this.pos.y - 20;
    const dy = p.body.center.y - neckY;
    const ahead = dx * this.facing;
    switch (this.state) {
      case 'stand': {
        // só a cabeça segue o cavaleiro; atrás dela, perto, ela vira
        if (!p.dead && Math.abs(dx) < C.sight && Math.abs(dx) > 6 && ahead < 0 && this.sees(this.pos.x, neckY, p.x, p.body.center.y)) {
          this.go('turn');
          break;
        }
        if (!p.dead && this.cd <= 0 && ahead > 4 && ahead < C.reach && Math.abs(dy) < 20 && this.sees(this.pos.x, neckY, p.x, p.body.center.y)) {
          this.go('cock', 'cock');
          this.scene.sfx('swoosh', 0.25, 0.6);
        }
        break;
      }
      case 'turn':
        // um instante parada antes de virar (ela não é rápida em terra)
        if (this.t > 0.18) {
          this.facing = dx >= 0 ? 1 : -1;
          this.go('stand');
          this.cd = Math.max(this.cd, 0.25);
        }
        break;
      case 'cock':
        if (this.t > C.windup) {
          this.go('stab', 'stab');
          this.scene.sfx('stab', 0.8, 1.25);
          if (this.spot.wet) this.scene.splash(this.pos.x + this.facing * 6, this.surfaceAt(this.pos.x, this.pos.y));
        }
        break;
      case 'stab':
        if (this.t > 0.1) this.go('hold', 'hold');
        break;
      case 'hold':
        if (this.t > C.hold) this.go('recover', 'recover');
        break;
      case 'recover':
        if (this.t > C.recover) {
          this.cd = C.cooldown * (0.8 + Math.random() * 0.4);
          this.go('stand', 'stand');
        }
        break;
      case 'stun':
        if (this.t > C.stun) {
          this.cd = 0.5;
          this.go('stand', 'stand');
        }
        break;
      case 'hurt':
        if (this.t > 0.28) this.takeOff();
        break;
      case 'takeoff': {
        // sobe um pouco antes de ir
        this.pos.y = this.from.y - Math.min(1, this.t / 0.3) * 10;
        if (this.t > 0.3) {
          this.from = { x: this.pos.x, y: this.pos.y };
          this.go('fly', 'fly');
        }
        break;
      }
      case 'fly': {
        const q = this.to!;
        const k = Math.min(1, this.t / this.flyDur);
        const e = k * k * (3 - 2 * k);
        const arc = (26 + Math.abs(q.x - this.from.x) * 0.12) * 4 * k * (1 - k);
        this.pos.x = this.from.x + (q.x - this.from.x) * e;
        this.pos.y = this.from.y + (q.y - this.from.y) * e - arc;
        if (Math.random() < dt * 2.2) this.scene.sfx('flap', 0.35, 0.8 + Math.random() * 0.15);
        if (k >= 1) {
          this.spot = q;
          this.go('land', 'land');
          if (q.wet) this.scene.splash(q.x, this.surfaceAt(q.x, q.y));
        }
        break;
      }
      case 'land':
        if (this.t > 0.32) {
          this.cd = 0.6;
          this.facing = dx >= 0 ? 1 : -1;
          this.go('stand', 'stand');
        }
        break;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    if (this.state !== 'fly' && this.state !== 'takeoff') this.pos = { x: this.spot.x, y: this.pos.y + (this.spot.y - this.pos.y) * Math.min(1, dt * 20) };
    this.body.reset(this.pos.x, this.pos.y - C.bodyH / 2);
    this.sprite.setPosition(Math.round(this.pos.x), Math.round(this.pos.y));
    face(this.sprite, this.facing < 0);
  }

  harms(pr: Phaser.Geom.Rectangle) {
    if (!this.alive) return false;
    const striking = this.state === 'stab' || (this.state === 'hold' && this.t < 0.12);
    return striking && overlap(pr, this.beakBox);
  }

  // aparar: o golpe encontra o bico no bote (ou no fim do aviso)
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive) return false;
    const live = this.state === 'stab' || (this.state === 'hold' && this.t < 0.15) || (this.state === 'cock' && this.t > C.windup - PARRY.early);
    if (!live) return false;
    if ((Math.sign(fromX - this.pos.x) || this.facing) !== this.facing) return false;
    if (!overlap(box, this.beakBox) && !(this.state === 'cock' && overlap(box, this.rect))) return false;
    this.go('stun', 'stun');
    this.scene.sfx('heron', 0.6, 1.3);
    return true;
  }

  hit(fromX: number, dmg: number): HitResult {
    if (!this.alive) return 'ignored';
    if (this.state === 'stun') dmg *= PARRY.bonus;
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    this.scene.featherBurst(this.pos.x, this.pos.y - 22);
    if (this.hp <= 0) {
      this.die();
      return 'hit';
    }
    // no voo ela segue; parada, se assusta e vai embora
    if (this.state !== 'fly' && this.state !== 'takeoff' && this.state !== 'stun') {
      this.facing = fromX >= this.pos.x ? 1 : -1;
      this.go('hurt', 'hurt');
      this.scene.sfx('heron', 0.7, 1.15);
    }
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
    s.deathBurst(this.pos.x, this.pos.y - 20);
    s.featherBurst(this.pos.x, this.pos.y - 20);
    s.sfx('heron', 0.6, 0.75);
    s.time.delayedCall(80, () => this.sprite.clearTint());
    this.anim = 'death';
    this.sprite.play('heron-death');
    // caiu no voo: desce até o chão de baixo
    const floor = this.findFloor(this.pos.x, this.pos.y);
    if (floor.y > this.pos.y + 2) s.tweens.add({ targets: this.sprite, y: floor.y, duration: Math.min(700, (floor.y - this.pos.y) * 4), ease: 'Quad.easeIn' });
    if (floor.wet) s.time.delayedCall(300, () => s.splash(floor.x, this.surfaceAt(floor.x, floor.y)));
    s.tweens.add({ targets: this.sprite, alpha: 0, delay: 1700, duration: 1000, onComplete: () => this.sprite.destroy() });
  }
}

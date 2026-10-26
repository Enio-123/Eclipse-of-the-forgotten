import Phaser from 'phaser';
import { TROUT as C, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from './Player';
import { overlap, type Enemy, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';
import { DEPTH } from '../world/Decor';

type State = 'swim' | 'stalk' | 'rise' | 'leap' | 'fall' | 'sink' | 'aim' | 'dart' | 'flop' | 'hurt';

// Truta de Âmbar (Vale das Cachoeiras): nada devagar no poço dela, embaixo d'água, os cristais de Âmbar
// das escamas brilhando fraco no escuro da água. Com o cavaleiro em cima do poço (na beira, numa pedra,
// pulando por cima) ela vai para baixo dele e sobe: bolhas e um círculo na linha d'água avisam. Salta de
// boca aberta, reto para cima e um pouco para o lado dele, e cai de volta. Se cair na terra, se debate
// aos pulos até a água (e apanha mais). Com ele nadando no mesmo poço, recua e dá um bote embaixo d'água.
export class Trout implements Enemy {
  readonly kind = 'trout' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  private state: State = 'swim';
  private t = 0;
  private cd = 0.8;
  private turnT = 3;
  private lostT = 0;
  private landT = 0;
  private restT = 0;
  private facing: 1 | -1 = 1;
  private flashT = 0;
  private anim = '';
  private rot = 0;
  private wasWet = true;
  private readonly seed = Math.random() * 10;
  private readonly vel = new Phaser.Math.Vector2();
  private readonly glow: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Graphics;
  // o poço dela: as células de água ligadas a onde ela está e, em cada coluna, a linha de cima e a de baixo
  private readonly cells = new Set<number>();
  private readonly top = new Map<number, number>();
  private readonly bot = new Map<number, number>();
  // de onde ela salta (x) e a linha d'água ali (s)
  private launch = { x: 0, s: 0 };
  // o alvo do bote embaixo d'água
  private aimY = 0;

  constructor(private scene: GameScene, x: number, y: number) {
    const cy = y - TILE / 2;
    this.pool(Math.floor(x / TILE), Math.floor(cy / TILE));
    const sy = this.cruiseY(Math.floor(x / TILE), cy);
    this.zone = scene.add.zone(x, sy, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.body.setMaxVelocity(600, 900);
    const o = scene.registry.get('trout-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, sy, 'trout', 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy));
    this.glow = scene.add.image(x, sy, 'glow').setTint(0xffa63c).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy + 0.1).setScale(0.3).setAlpha(0.18);
    this.ring = scene.add.graphics().setDepth(DEPTH.water + 0.2);
    this.facing = Math.random() < 0.5 ? 1 : -1;
    this.sprite.play({ key: 'trout-swim', startFrame: Math.floor(Math.random() * 4) });
    this.anim = 'swim';
  }

  // as células de água ligadas a esta (o poço inteiro, com as passagens alagadas)
  private pool(tx: number, ty: number) {
    const L = this.scene.level;
    this.cells.clear();
    this.top.clear();
    this.bot.clear();
    if (L.ch(tx, ty) !== '~') return;
    const q = [ty * L.w + tx];
    this.cells.add(q[0]);
    while (q.length && this.cells.size < 8000) {
      const i = q.pop()!;
      const x = i % L.w;
      const y = (i - x) / L.w;
      this.top.set(x, Math.min(this.top.get(x) ?? y, y));
      this.bot.set(x, Math.max(this.bot.get(x) ?? y, y));
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
        const j = ny * L.w + nx;
        if (this.cells.has(j) || L.ch(nx, ny) !== '~') continue;
        this.cells.add(j);
        q.push(j);
      }
    }
  }

  private inPool(x: number, y: number) {
    return this.cells.has(Math.floor(y / TILE) * this.scene.level.w + Math.floor(x / TILE));
  }

  // a altura em que ela nada naquela coluna: um pouco abaixo da linha d'água, sem encostar no fundo
  private cruiseY(col: number, fallback: number) {
    const t = this.top.get(col);
    const b = this.bot.get(col);
    if (t === undefined || b === undefined) return fallback;
    const s = t * TILE + 3;
    return Math.min((b + 1) * TILE - 7, s + C.depth);
  }

  get rect() {
    // o corpo deitado é comprido e baixo; no salto, de pé, fica alto e estreito
    const c = Math.abs(Math.cos(this.rot));
    const s = Math.abs(Math.sin(this.rot));
    const w = 26 * c + 10 * s;
    const h = 26 * s + 10 * c;
    return new Phaser.Geom.Rectangle(this.zone.x - w / 2, this.zone.y - h / 2, w, h);
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`trout-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    // só na terra a gravidade do mundo puxa; no salto e na água ela anda pela conta dela
    this.body.setAllowGravity(s === 'flop');
    if (anim) this.play(anim);
  }

  // o salto até ele: a coluna do poço mais perto de onde ele vai estar, com ar em cima e o caminho livre
  private leapFrom(p: Player) {
    if (p.dead || p.swim) return null;
    const L = this.scene.level;
    const pb = p.body;
    const py = pb.center.y;
    const want = p.x + Phaser.Math.Clamp(pb.velocity.x * 0.3, -48, 48);
    let best: { x: number; s: number } | null = null;
    let bestD = 30;
    for (const [col, top] of this.top) {
      const cx = col * TILE + TILE / 2;
      const d = Math.abs(cx - want);
      if (d >= bestD || Math.abs(cx - this.zone.x) > C.sight) continue;
      if (L.solidCell(col, top - 1) || L.ch(col, top - 1) === '-') continue;
      const s = top * TILE + 3;
      const h = s - py;
      if (h < 4 || h > C.leapMax) continue;
      if (!this.clearUp(cx, s, p.x, py)) continue;
      best = { x: cx, s };
      bestD = d;
    }
    return best;
  }

  // o caminho do salto: reto para cima até a altura dele e de lado até ele, sem pedra nem tábua
  private clearUp(x: number, s: number, px: number, py: number) {
    const L = this.scene.level;
    const shut = (wx: number, wy: number) => {
      const tx = Math.floor(wx / TILE);
      const ty = Math.floor(wy / TILE);
      return L.solidCell(tx, ty) || L.ch(tx, ty) === '-';
    };
    for (let yy = s - 4; yy > py; yy -= 6) if (shut(x, yy)) return false;
    const n = Math.ceil(Math.abs(px - x) / 6);
    for (let i = 1; i < n; i++) if (shut(x + ((px - x) * i) / n, py)) return false;
    return true;
  }

  // embaixo d'água ela enxerga até onde a água vai reta
  private seesWater(x: number, y: number) {
    const dx = x - this.zone.x;
    const dy = y - this.zone.y;
    const n = Math.ceil(Math.hypot(dx, dy) / 8);
    for (let i = 1; i < n; i++) if (!this.inPool(this.zone.x + (dx * i) / n, this.zone.y + (dy * i) / n)) return false;
    return true;
  }

  // nadando (ou de pé no fundo) no mesmo poço: o bote; em cima da água: o salto
  private look(p: Player) {
    if (p.dead) return;
    const pb = p.body;
    const x = this.zone.x;
    const y = this.zone.y;
    const mid = this.inPool(p.x, pb.center.y);
    if (mid || this.inPool(p.x, pb.bottom - 3)) {
      const ty = mid ? pb.center.y : pb.bottom - 6;
      if (Math.hypot(p.x - x, ty - y) < C.sightWater && this.seesWater(p.x, ty)) {
        this.facing = p.x >= x ? 1 : -1;
        this.aimY = ty;
        this.go('aim', 'leap');
      }
      return;
    }
    const l = this.leapFrom(p);
    if (l) {
      this.launch = l;
      this.lostT = 0;
      this.go('stalk');
    }
  }

  private jump(p: Player) {
    const l = this.leapFrom(p);
    if (!l || Math.abs(l.x - this.zone.x) > 20) {
      this.go('swim', 'swim');
      this.cd = 0.6;
      return;
    }
    const pb = p.body;
    // o alto do salto passa um pouco acima do meio dele
    const h = Math.max(24, this.zone.y - (pb.center.y - 6));
    const vy = -Math.sqrt(2 * C.gravity * h);
    const up = -vy / C.gravity;
    const vx = Phaser.Math.Clamp((p.x - this.zone.x) / up, -110, 110);
    this.vel.set(vx, vy);
    if (Math.abs(p.x - this.zone.x) > 2) this.facing = p.x > this.zone.x ? 1 : -1;
    this.go('leap', 'leap');
    this.scene.sfx('leap', 0.75, 0.95 + Math.random() * 0.15);
  }

  private enterWater() {
    const L = this.scene.level;
    const x = this.zone.x;
    const w = L.waterAt(x, this.zone.y);
    if (w?.air) this.scene.splash(x, w.surface);
    // caiu em outra água: ela vira o poço dela
    if (!this.inPool(x, this.zone.y)) this.pool(Math.floor(x / TILE), Math.floor(this.zone.y / TILE));
    this.vel.set(this.vel.x * 0.4, Math.min(this.vel.y, 260) * 0.35);
    this.go('sink', 'swim');
  }

  // em terra: para que lado fica a água mais perto (no chão dela ou logo abaixo)
  private waterDir() {
    const L = this.scene.level;
    const tx = Math.floor(this.zone.x / TILE);
    const ty = Math.floor(this.body.bottom / TILE);
    for (let d = 1; d < 14; d++) {
      for (const s of [this.facing, -this.facing] as const) {
        for (let yy = ty - 1; yy <= ty + 3; yy++) if (L.ch(tx + s * d, yy) === '~') return s;
      }
    }
    return this.facing;
  }

  // o círculo na linha d'água antes do salto
  private ringAt(x: number, s: number, k: number) {
    const g = this.ring;
    for (let i = 0; i < 2; i++) {
      const r = 3 + ((k * 1.6 + i * 0.5) % 1) * 15;
      const a = 0.75 * (1 - r / 18);
      if (a <= 0) continue;
      g.lineStyle(1, 0xeafff6, a).strokeEllipse(x, s + 1, r * 2, r * 0.55);
    }
  }

  update(dt: number) {
    this.ring.clear();
    if (!this.alive) return;
    const b = this.body;
    const p = this.scene.player;
    const L = this.scene.level;
    this.t += dt;
    this.cd -= dt;
    const x = this.zone.x;
    const y = this.zone.y;
    const col = Math.floor(x / TILE);
    const wet = L.inWater(x, y);
    let glow = 0.22;
    let rot = 0;
    let shake = 0;
    this.sprite.anims.timeScale = 1;
    // empurrada para fora da água (o gancho, o pulso do cajado): cai
    if (!wet && (this.state === 'swim' || this.state === 'stalk' || this.state === 'rise' || this.state === 'aim' || this.state === 'dart' || this.state === 'sink')) {
      this.vel.set(b.velocity.x, Math.min(0, b.velocity.y));
      this.go('fall', 'hurt');
    }
    switch (this.state) {
      case 'swim': {
        if (this.t > this.turnT || !this.inPool(x + this.facing * 14, y)) {
          this.facing = this.facing === 1 ? -1 : 1;
          this.t = 0;
          this.turnT = 2.4 + Math.random() * 3.2;
        }
        const ty = this.cruiseY(col, y) + Math.sin(this.scene.clock * 1.7 + this.seed) * 3;
        b.velocity.set(this.facing * C.cruise * (0.75 + 0.25 * Math.sin(this.scene.clock * 2.3 + this.seed)), Phaser.Math.Clamp((ty - y) * 2.5, -60, 60));
        rot = Phaser.Math.Clamp(b.velocity.y / 220, -0.2, 0.2) * this.facing;
        this.play('swim');
        if (this.cd <= 0) this.look(p);
        break;
      }
      case 'stalk': {
        const l = this.leapFrom(p);
        if (l) {
          this.launch = l;
          this.lostT = 0;
        } else if ((this.lostT += dt) > 0.6 || this.t > 2.5) {
          this.go('swim', 'swim');
          this.cd = 0.5;
          break;
        }
        const dx = this.launch.x - x;
        const dy = this.launch.s + 9 - y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 3) this.facing = dx > 0 ? 1 : -1;
        const sp = Math.min(C.stalk, d * 5);
        b.velocity.set(d > 0.5 ? (dx / d) * sp : 0, d > 0.5 ? (dy / d) * sp : 0);
        this.sprite.anims.timeScale = 1.8;
        glow = 0.4;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
          this.go('rise');
          this.scene.sfx('plop', 0.55, 0.9 + Math.random() * 0.2);
        }
        break;
      }
      case 'rise': {
        b.velocity.set(0, 0);
        const k = Math.min(1, this.t / C.rise);
        glow = 0.4 + k * 0.5;
        shake = k;
        this.sprite.anims.timeScale = 2.4;
        this.ringAt(this.launch.x, this.launch.s, k);
        if (Math.random() < dt * 16) this.scene.bubbles(x + (Math.random() - 0.5) * 12, y - 4, 1);
        if (this.t >= C.rise) this.jump(p);
        break;
      }
      case 'leap':
      case 'fall': {
        this.vel.y += C.gravity * dt;
        if (b.blocked.up && this.vel.y < 0) this.vel.y = 0;
        b.velocity.set(this.vel.x, this.vel.y);
        glow = this.state === 'leap' ? 0.9 : 0.35;
        rot = Phaser.Math.Clamp(Math.atan2(this.vel.y, Math.max(70, Math.abs(this.vel.x))), -1.25, 1.25) * this.facing;
        // rompeu a linha d'água subindo: o respingo
        if (this.wasWet && !wet && this.vel.y < 0) {
          const w = L.waterAt(x, y + 8);
          this.scene.splash(x, w?.surface ?? y + 4);
        }
        if (wet && this.vel.y > 0 && (!this.wasWet || this.t > 0.15)) {
          this.enterWater();
          break;
        }
        if (b.blocked.down && !wet) {
          this.landT = 0;
          this.restT = 0.001;
          this.go('flop', 'hurt');
          this.scene.sfx('flop', 0.7);
          this.scene.dustBurst(x, b.bottom, 3);
        }
        break;
      }
      case 'sink': {
        this.vel.scale(Math.pow(0.04, dt));
        const ty = this.cruiseY(col, y);
        b.velocity.set(this.vel.x, this.vel.y + (ty - y) * 1.5 * Math.min(1, this.t * 2));
        rot = Phaser.Math.Clamp(b.velocity.y / 220, -0.4, 0.4) * this.facing;
        if (this.t > 0.6) {
          this.go('swim', 'swim');
          this.cd = C.cooldown;
        }
        break;
      }
      case 'aim': {
        // recua um pouco, de frente para ele, e os cristais acendem
        this.facing = p.x >= x ? 1 : -1;
        b.velocity.set(-this.facing * 24, 0);
        glow = 0.4 + 0.5 * Math.min(1, this.t / C.aim);
        shake = Math.min(1, this.t / C.aim) * 0.6;
        if (this.t >= C.aim) {
          const pb = p.body;
          const ty = this.inPool(p.x, pb.center.y) ? pb.center.y : this.aimY;
          const dx = p.x - x;
          const dy = ty - y;
          const d = Math.hypot(dx, dy) || 1;
          this.vel.set((dx / d) * C.dart, (dy / d) * C.dart);
          this.go('dart', 'leap');
          this.scene.sfx('swoosh', 0.45, 0.7);
          this.scene.bubbles(x, y, 4);
        }
        break;
      }
      case 'dart': {
        glow = 0.9;
        b.velocity.set(this.vel.x, this.vel.y);
        rot = Phaser.Math.Clamp(Math.atan2(this.vel.y, Math.abs(this.vel.x)), -1.1, 1.1) * this.facing;
        if (Math.random() < dt * 30) this.scene.bubbles(x - this.facing * 8, y, 1);
        const ahead = !this.inPool(x + Math.sign(this.vel.x) * 12, y + Math.sign(this.vel.y) * 6);
        if (this.t > C.dartTime || ahead || b.blocked.left || b.blocked.right || b.blocked.up || b.blocked.down) {
          this.vel.scale(0.45);
          this.go('sink', 'swim');
        }
        break;
      }
      case 'flop': {
        // fora d'água: se debate aos pulos para o lado da água
        this.landT += dt;
        glow = 0.3;
        rot = Math.sin(this.landT * 17) * 0.22;
        if (wet) {
          this.vel.set(b.velocity.x, b.velocity.y);
          this.enterWater();
          break;
        }
        if (b.blocked.down) {
          // bateu no chão: o tapa molhado; fica um instante e pula de novo
          if (this.restT === 0 && this.t > 0.1) {
            this.scene.sfx('flop', 0.55, 0.9 + Math.random() * 0.3);
            this.scene.dustBurst(x, b.bottom, 2);
          }
          this.restT += dt;
          b.velocity.x *= Math.pow(0.002, dt);
          if (this.restT > C.flop) {
            const dir = this.waterDir();
            this.facing = Math.random() < 0.5 ? 1 : -1;
            b.velocity.set(dir * (60 + Math.random() * 30), -190 - Math.random() * 70);
            this.restT = 0;
          }
        }
        if (this.landT > C.air) {
          // ficou tempo demais fora d'água
          this.die();
          this.scene.killed(this);
          return;
        }
        break;
      }
      case 'hurt': {
        if (wet) this.vel.scale(Math.pow(0.05, dt));
        else this.vel.y += C.gravity * dt;
        b.velocity.set(this.vel.x, this.vel.y);
        if (this.t > 0.28) {
          if (wet) this.go('sink', 'swim');
          else if (b.blocked.down) {
            this.restT = 0.001;
            this.go('flop', 'hurt');
          } else this.go('fall', 'hurt');
        }
        break;
      }
    }
    this.wasWet = wet;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.rot += (rot - this.rot) * Math.min(1, dt * 14);
    const jx = shake ? Math.sin(this.scene.clock * 70) * 0.7 * shake : 0;
    this.sprite.setPosition(Math.round(this.zone.x + jx), Math.round(this.zone.y));
    face(this.sprite, this.facing < 0);
    this.sprite.setRotation(this.rot);
    // embaixo d'água ela some um pouco no verde (o véu da água tinge por cima)
    this.sprite.setAlpha(L.inWater(this.zone.x, this.zone.y) ? 0.88 : 1);
    const a = this.glow.alpha + (glow * 0.8 - this.glow.alpha) * Math.min(1, dt * 10);
    this.glow.setAlpha(a).setPosition(this.zone.x - this.facing * 1, this.zone.y - 3).setScale(0.24 + a * 0.22);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    return this.alive && !sliding && (this.state === 'leap' || this.state === 'dart') && overlap(pr, this.rect);
  }

  hit(fromX: number, dmg: number): HitResult {
    if (!this.alive) return 'ignored';
    // em terra, se debatendo, ela não tem como fugir
    if (this.state === 'flop') dmg *= 1.5;
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    if (this.hp <= 0) {
      this.die();
      return 'hit';
    }
    const away = Math.sign(this.zone.x - fromX) || 1;
    const wet = this.scene.level.inWater(this.zone.x, this.zone.y);
    this.vel.set(away * (wet ? 150 : 120), wet ? 0 : -150);
    this.facing = away === 1 ? -1 : 1;
    this.go('hurt', 'hurt');
    if (wet) this.scene.bubbles(this.zone.x, this.zone.y, 3);
    return 'hit';
  }

  vanish() {
    if (!this.alive) return null;
    this.alive = false;
    this.body.enable = false;
    this.glow.setAlpha(0);
    this.ring.clear();
    return this.sprite;
  }

  private die() {
    this.alive = false;
    this.body.enable = false;
    const s = this.scene;
    const x = this.zone.x;
    const y = this.zone.y;
    s.deathBurst(x, y);
    s.sfx('glass', 0.35, 1.5);
    s.time.delayedCall(80, () => this.sprite.clearTint());
    this.anim = 'death';
    this.sprite.setRotation(0);
    this.sprite.play('trout-death');
    s.tweens.add({ targets: this.glow, alpha: 0, duration: 900 });
    const w = s.level.waterAt(x, y);
    if (w) {
      // morta, ela boia: sobe de barriga para cima até a linha d'água e some devagar
      const top = w.air ? w.surface + 1 : w.surface + 6;
      s.tweens.add({ targets: this.sprite, y: Math.min(this.sprite.y, top), duration: Math.max(300, (y - top) * 20), ease: 'Sine.easeOut' });
      s.tweens.add({ targets: this.sprite, alpha: 0, delay: 1800, duration: 1400, onComplete: () => this.sprite.destroy() });
    } else s.tweens.add({ targets: this.sprite, alpha: 0, delay: 900, duration: 1000, onComplete: () => this.sprite.destroy() });
  }

  destroy() {
    this.glow.destroy();
    this.ring.destroy();
  }
}

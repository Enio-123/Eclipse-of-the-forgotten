import Phaser from 'phaser';
import { CAPATAZ as C, PARRY, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { DEPTH } from '../world/Decor';
import { overlap, type BossFoe, type HitDir, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';

type State =
  | 'sleep' | 'rise' | 'roar' | 'idle' | 'walk'
  | 'slamwind' | 'slam' | 'slamrec'
  | 'throwwind' | 'throw'
  | 'chargewind' | 'charge' | 'stun'
  | 'whistle'
  | 'stagger' | 'rage'
  | 'dead';

type Attack = 'slam' | 'throw' | 'charge' | 'whistle';

interface FramePoints {
  tip: [number, number];
  head: [number, number];
  hand: [number, number];
}

// um cristal da fileira que a picareta abre no chão: racha, sobe, fica um instante e afunda
interface Spike {
  x: number;
  t: number;
  img: Phaser.GameObjects.Image | null;
  glow: Phaser.GameObjects.Image | null;
  h: number;
  done: boolean;
}

// lasca de Âmbar arremessada em arco (dá para rebater com um golpe na hora)
interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  back: boolean;
  dead: boolean;
}

// pedra que cai do teto quando ele bate na parede (a sombra no chão avisa)
interface Rock {
  x: number;
  y: number;
  land: number;
  vy: number;
  t: number;
  falling: boolean;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  done: boolean;
}

// O Capataz de Âmbar: tocava as prensas da Casa Vhalor e ficou depois do último turno, picando o
// veio até o Âmbar crescer nele. De costas para quem entra, pica um cristal grande. Acordado: crava a
// picareta no chão e abre uma fileira de cristais que corre pelo chão (pule), joga lascas de Âmbar
// em arco com a varrida de baixo para cima (saia de baixo ou rebata), abaixa o ombro de cristal e
// investe até a parede (pule por cima; na parede ele fica tonto e o teto solta pedras) e toca o
// apito do turno, que manda a chapa da prensa do teto correr até em cima do cavaleiro e cair (a
// sombra avisa; a chapa pega até ele). Na metade, a fragmentação: a lembrança racha, a gravidade fica
// leve por um tempo, sobem fiapos de tinta e os golpes emendam.
export class Capataz implements BossFoe {
  readonly kind = 'boss' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly maxHp = C.hp;
  hp = C.hp;
  alive = true;
  facing: 1 | -1 = 1;
  state: State = 'sleep';
  onDefeat: (() => void) | null = null;
  harmFrom: number | undefined;
  private t = 0;
  private thinkT = 0;
  private pressCd = 2;
  private phase2 = false;
  private combo = 0;
  private flashT = 0;
  private anim = '';
  private last: Attack[] = [];
  private workT = 0;
  private spikes: Spike[] = [];
  private shards: Shard[] = [];
  private rocks: Rock[] = [];
  private pressQueue = 0;
  private wispT = 0;
  private lowT = 0;
  private readonly floorY: number;
  private readonly x0: number;
  private readonly x1: number;
  private readonly points: Record<string, FramePoints[]> | null;
  private readonly eye: Phaser.GameObjects.Image;
  private readonly aura: Phaser.GameObjects.Image;
  private crack: Phaser.GameObjects.Graphics | null = null;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.floorY = feetY;
    this.x0 = 9 * TILE;
    // até o bloco de Âmbar que tapa o túnel (a parede da direita da arena)
    let right = scene.level.w - 3;
    for (let tx = Math.floor(x / TILE); tx < scene.level.w; tx++) {
      if (isSolid(scene.level.tileAt(tx * TILE + 8, feetY - 8))) {
        right = tx;
        break;
      }
    }
    this.x1 = right * TILE - C.bodyW / 2 - 2;
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(600, 900);
    const o = scene.registry.get('capataz-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'capataz', 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy));
    this.points = (scene.cache.json.get('capataz-meta') as { points?: Record<string, FramePoints[]> } | undefined)?.points ?? null;
    this.eye = scene.add.image(x, feetY - 90, 'glow').setTint(0xffa63c).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy + 0.2).setScale(0.35).setAlpha(0.5);
    this.aura = scene.add.image(x, feetY - 60, 'glow').setTint(0xffa63c).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy - 0.2).setScale(2.2, 2.8).setAlpha(0.1);
    // de costas para a entrada, picando o cristal grande da frente
    this.facing = 1;
    this.play('work');
    this.sync();
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  get sleeping() {
    return this.state === 'sleep';
  }

  private get present() {
    return this.state !== 'sleep' && this.state !== 'rise' && this.state !== 'dead';
  }

  private get speedMul() {
    return this.phase2 ? 0.8 : 1;
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`capataz-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  private face() {
    this.facing = this.scene.player.x >= this.zone.x ? 1 : -1;
  }

  // ponto marcado no desenho (ponta da picareta, cabeça dela, mão) no quadro atual
  private point(k: keyof FramePoints) {
    const pts = this.points?.[this.anim];
    const i = (this.sprite.anims.currentFrame?.index ?? 1) - 1;
    const pt = pts?.[Math.min(i, pts.length - 1)]?.[k] ?? [60, -40];
    return { x: this.zone.x + this.facing * pt[0], y: this.body.bottom + pt[1] };
  }

  wake() {
    if (this.state !== 'sleep') return;
    this.go('rise', 'rise');
    this.scene.sfx('clang', 0.8, 0.7);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.face();
      this.go('roar', 'roar');
      this.scene.sfx('roar', 0.9, 0.8);
      this.scene.mine?.amberBurst(this.zone.x - this.facing * 14, this.body.top + 20, 12);
      this.scene.cameras.main.shake(700, 0.005);
    });
  }

  // ---------- escolha ----------
  private choose(): Attack {
    const p = this.scene.player;
    const dist = Math.abs(p.x - this.zone.x);
    const high = this.floorY - p.body.bottom > 44;
    const pressOk = this.pressCd <= 0 && !(this.scene.mine?.pressBusy ?? true);
    let opts: [Attack, number][];
    if (high) opts = [['throw', 0.55], ['whistle', 0.45]];
    else if (dist < 110) opts = [['slam', 0.6], ['charge', 0.15], ['whistle', 0.25]];
    else if (dist < 260) opts = [['slam', 0.4], ['throw', 0.3], ['whistle', 0.3]];
    else opts = [['charge', 0.45], ['throw', 0.35], ['whistle', 0.2]];
    if (!pressOk) opts = opts.filter(([a]) => a !== 'whistle');
    if (this.last.length >= 2 && this.last[0] === this.last[1]) opts = opts.filter(([a]) => a !== this.last[0]);
    if (!opts.length) opts = [['slam', 1]];
    const total = opts.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [a, w] of opts) {
      r -= w;
      if (r <= 0) return a;
    }
    return opts[0][0];
  }

  private toIdle(extra = 0) {
    this.thinkT = (C.think + Math.random() * 0.35) * this.speedMul + extra;
    this.go('idle', 'idle');
  }

  private startAttack(a: Attack) {
    this.face();
    this.last = [a, ...this.last].slice(0, 2);
    const s = this.scene;
    if (a === 'slam') {
      this.go('slamwind', 'slamwind');
      s.sfx('heavy', 0.6, 0.55);
    } else if (a === 'throw') {
      this.go('throwwind', 'throwwind');
      s.sfx('heavy', 0.5, 0.7);
    } else if (a === 'charge') {
      this.go('chargewind', 'chargewind');
      s.sfx('roar', 0.5, 1.3);
    } else {
      this.go('whistle', 'whistle');
    }
  }

  // ---------- quadro a quadro ----------
  update(dt: number) {
    this.updateSpikes(dt);
    this.updateShards(dt);
    this.updateRocks(dt);
    this.updateFragment(dt);
    if (this.state === 'dead') {
      this.sync();
      return;
    }
    if (this.state === 'sleep') {
      // a picareta no cristal, a cada batida
      this.workT -= dt;
      if (this.workT <= 0) {
        this.workT = 0.9;
        const d = Math.abs(this.scene.player.x - this.zone.x);
        if (d < 460) {
          this.scene.sfx('tink', 0.7 * (1 - d / 460), 0.8);
          this.scene.sfx('glass', 0.25 * (1 - d / 460), 1.3);
        }
        const tip = this.point('tip');
        this.scene.mine?.amberBurst(tip.x, tip.y, 3);
      }
      this.sync();
      return;
    }
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    this.pressCd -= dt;
    const dx = p.x - this.zone.x;
    switch (this.state) {
      case 'rise':
        b.velocity.x = 0;
        break;
      case 'roar':
        b.velocity.x = 0;
        if (this.t > 1.5) this.toIdle(0.3);
        break;
      case 'rage':
        b.velocity.x = 0;
        if (this.t > 0.5 && this.t - dt <= 0.5) this.fragment();
        if (this.t > 2.0) this.toIdle(0.2);
        break;
      case 'idle': {
        b.velocity.x = 0;
        this.face();
        this.thinkT -= dt;
        if (this.thinkT > 0) break;
        if (Math.abs(dx) > 300 && Math.random() < 0.35) {
          this.go('walk', 'walk');
          break;
        }
        this.startAttack(this.choose());
        break;
      }
      case 'walk':
        this.face();
        b.velocity.x = this.facing * C.walk * (this.phase2 ? 1.3 : 1);
        if (Math.abs(dx) < 200 || this.t > 1.3) {
          b.velocity.x = 0;
          this.startAttack(this.choose());
        }
        break;
      case 'slamwind':
        b.velocity.x = 0;
        if (this.t > C.slamWind * this.speedMul) {
          this.go('slam', 'slam');
          this.slamDown();
        }
        break;
      case 'slam':
        b.velocity.x = 0;
        if (this.t > C.slamActive) this.go('slamrec', 'slamrec');
        break;
      case 'slamrec':
        b.velocity.x = 0;
        // na segunda fase, às vezes emenda outra pancada virando para o cavaleiro
        if (this.phase2 && this.combo > 0 && this.t > 0.3) {
          this.combo--;
          this.startAttack('slam');
          this.t = C.slamWind * 0.4;
        } else if (this.t > C.slamRec * this.speedMul) this.toIdle();
        break;
      case 'throwwind':
        b.velocity.x = 0;
        if (this.t > C.throwWind * this.speedMul) {
          this.go('throw', 'throw');
          this.scene.sfx('swoosh', 1, 0.6);
          this.scene.time.delayedCall(70, () => this.state === 'throw' && this.throwShards());
        }
        break;
      case 'throw':
        b.velocity.x = 0;
        if (this.t > C.throwRec * this.speedMul) this.toIdle();
        break;
      case 'chargewind':
        b.velocity.x = 0;
        if (Math.random() < dt * 20) this.scene.dustBurst(this.zone.x - this.facing * 16, this.floorY, 1);
        if (this.t > C.chargeWind * this.speedMul) {
          this.go('charge', 'charge');
          this.scene.sfx('heavy', 0.9, 0.5);
        }
        break;
      case 'charge': {
        b.velocity.x = this.facing * C.chargeSpeed * (this.phase2 ? 1.12 : 1);
        if (Math.random() < dt * 30) this.scene.dustBurst(this.zone.x - this.facing * 12, this.floorY, 1);
        const wall = (this.facing > 0 && (this.zone.x >= this.x1 || b.blocked.right)) || (this.facing < 0 && (this.zone.x <= this.x0 || b.blocked.left));
        if (wall) this.hitWall();
        else if (this.t > 3) this.toIdle();
        break;
      }
      case 'stun':
        b.velocity.x *= Math.pow(0.8, dt * 60);
        if (this.t > C.stun) this.toIdle(0.2);
        break;
      case 'whistle':
        b.velocity.x = 0;
        if (this.t > C.whistleWind && this.t - dt <= C.whistleWind) {
          // o apito do turno: o carrinho da prensa obedece
          this.scene.sfx('chime', 0.9, 1.9);
          this.scene.sfx('chime', 0.6, 2.3);
          this.pressQueue = this.phase2 ? 1 : 0;
          if (this.scene.mine?.callPress(this.scene.player.x)) this.pressCd = C.pressCd;
        }
        if (this.t > C.whistleWind + 0.6) this.toIdle(0.1);
        break;
      case 'stagger':
        b.velocity.x *= Math.pow(0.86, dt * 60);
        if (this.t > C.stagger) this.toIdle(0.3);
        break;
    }
    // segunda fase: assim que a chapa volta para cima, ela corre de novo até o cavaleiro
    if (this.pressQueue > 0 && !(this.scene.mine?.pressBusy ?? true)) {
      this.pressQueue--;
      this.scene.mine?.callPress(this.scene.player.x);
    }
    // não sai da arena
    if (this.zone.x < this.x0 && b.velocity.x < 0) b.velocity.x = 0;
    if (this.zone.x > this.x1 && b.velocity.x > 0) b.velocity.x = 0;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sync();
  }

  private sync() {
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(this.body.bottom));
    face(this.sprite, this.facing < 0);
    const lit = this.state === 'dead' ? 0 : this.phase2 ? 0.75 : 0.5;
    this.eye.setPosition(this.zone.x + this.facing * 16, this.body.bottom - 96).setAlpha(lit * (0.8 + Math.sin(this.scene.clock * 7) * 0.2));
    this.aura.setPosition(this.zone.x - this.facing * 12, this.body.bottom - 70).setAlpha(this.state === 'dead' ? 0 : (this.phase2 ? 0.2 : 0.11) + Math.sin(this.scene.clock * 2) * 0.03);
  }

  // ---------- pancada: a fileira de cristais ----------
  private slamDown() {
    const s = this.scene;
    const tip = this.point('tip');
    s.sfx('thud', 1.1, 0.6);
    s.sfx('glass', 0.6, 0.7);
    s.dustBurst(tip.x, this.floorY, 14);
    s.mine?.amberBurst(tip.x, this.floorY - 2, 8);
    s.cameras.main.shake(180, 0.007);
    if (this.phase2) this.combo = Math.random() < 0.5 ? 1 : 0;
    // os cristais saem do chão em fila, a partir da ponta, para a frente
    const n = Math.floor(C.eruptRange / C.eruptGap);
    for (let i = 0; i < n; i++) {
      const x = tip.x + this.facing * (12 + i * C.eruptGap);
      if (x < this.x0 - 20 || x > this.x1 + 20) break;
      if (!isGround(s.level.tileAt(x, this.floorY + 4)) || isSolid(s.level.tileAt(x, this.floorY - 8))) break;
      this.spikes.push({ x, t: -i * C.eruptStep, img: null, glow: null, h: 0, done: false });
    }
    // na segunda fase, também para trás
    if (this.phase2) {
      for (let i = 0; i < 4; i++) {
        const x = this.zone.x - this.facing * (40 + i * C.eruptGap);
        if (x < this.x0 - 20 || x > this.x1 + 20) break;
        this.spikes.push({ x, t: -0.25 - i * C.eruptStep, img: null, glow: null, h: 0, done: false });
      }
    }
  }

  private updateSpikes(dt: number) {
    if (this.spikes.some((k) => k.done)) this.spikes = this.spikes.filter((k) => !k.done);
    const s = this.scene;
    for (const k of this.spikes) {
      k.t += dt;
      if (k.t < 0) continue;
      if (k.t < C.eruptWarn) {
        // a rachadura acende antes do cristal sair
        if (Math.random() < dt * 40) s.mine?.amberBurst(k.x + (Math.random() - 0.5) * 8, this.floorY - 1, 1);
        continue;
      }
      if (!k.img) {
        const key = (Math.floor(k.x / 7) % 2 === 0 ? 'deco-crystal-0' : 'deco-crystal-1');
        k.img = hd(s.add.image(k.x, this.floorY + 2, key).setOrigin(0.5, 1).setDepth(DEPTH.enemy + 0.4));
        k.img.setScale(k.img.scaleX * 1.15, 0.01);
        k.glow = s.add.image(k.x, this.floorY - 12, 'glow').setTint(0xffa63c).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy + 0.3).setScale(0.8, 1.1).setAlpha(0.45);
        s.dustBurst(k.x, this.floorY, 3);
        if (Math.random() < 0.5) s.sfx('glass', 0.35, 1.1 + Math.random() * 0.4);
      }
      const u = k.t - C.eruptWarn;
      const full = hdScaleY(k.img) * 1.2;
      let sy: number;
      if (u < 0.06) sy = full * (u / 0.06);
      else if (u < C.eruptUp) sy = full;
      else sy = full * Math.max(0, 1 - (u - C.eruptUp) / C.eruptDown);
      k.img.setScale(k.img.scaleX, Math.max(0.01, sy));
      k.h = k.img.displayHeight;
      k.glow?.setAlpha(0.45 * (sy / full));
      if (u > C.eruptUp + C.eruptDown) {
        k.done = true;
        k.img.destroy();
        k.glow?.destroy();
      }
    }
  }

  private spikeRect(k: Spike) {
    return new Phaser.Geom.Rectangle(k.x - 8, this.floorY - k.h + 4, 16, Math.max(0, k.h - 4));
  }

  // ---------- lascas em arco ----------
  private shardTexture() {
    const s = this.scene;
    if (!s.textures.exists('amber-shard')) {
      const g = s.add.graphics();
      g.fillStyle(0x9a4c12).fillTriangle(0, 3, 6, 0, 12, 3).fillTriangle(0, 3, 12, 3, 6, 6);
      g.fillStyle(0xffa63c).fillTriangle(2, 3, 6, 1, 10, 3);
      g.fillStyle(0xffe6a6).fillRect(5, 2, 3, 1);
      g.generateTexture('amber-shard', 12, 6);
      g.destroy();
    }
    return 'amber-shard';
  }

  private throwShards() {
    const s = this.scene;
    const p = s.player;
    const from = this.point('tip');
    const n = this.phase2 ? 5 : 3;
    const g = 900;
    for (let i = 0; i < n; i++) {
      // mira em volta de onde o cavaleiro está, espalhando para os dois lados
      const spread = (i - (n - 1) / 2) * 46;
      const tx = Phaser.Math.Clamp(p.x + spread + p.body.velocity.x * 0.3, this.x0 - 30, this.x1 + 30);
      const ty = this.floorY - 6;
      const T = 0.85 + Math.abs(i - (n - 1) / 2) * 0.08;
      const vx = (tx - from.x) / T;
      const vy = (ty - from.y - 0.5 * g * T * T) / T;
      const img = s.add.image(from.x, from.y, this.shardTexture()).setDepth(DEPTH.enemy + 0.5);
      const glow = s.add.image(from.x, from.y, 'glow').setTint(0xffa63c).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy + 0.45).setScale(0.45).setAlpha(0.55);
      this.shards.push({ x: from.x, y: from.y, vx, vy, img, glow, back: false, dead: false });
    }
    s.sfx('glass', 0.7, 1.2);
    s.mine?.amberBurst(from.x, from.y, 6);
  }

  private shardRect(q: Shard) {
    return new Phaser.Geom.Rectangle(q.x - 5, q.y - 4, 10, 8);
  }

  private updateShards(dt: number) {
    if (this.shards.some((q) => q.dead)) this.shards = this.shards.filter((q) => !q.dead);
    const s = this.scene;
    for (const q of this.shards) {
      if (q.back) {
        // rebatida: volta reta para o peito dele
        const tx = this.zone.x;
        const ty = this.body.center.y - 10;
        const d = Math.hypot(tx - q.x, ty - q.y) || 1;
        q.vx = ((tx - q.x) / d) * 560;
        q.vy = ((ty - q.y) / d) * 560;
        if (d < 24 && this.alive) {
          this.shatter(q);
          this.takeHit(4, true);
          continue;
        }
      } else q.vy += 900 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.img.setPosition(q.x, q.y).setRotation(Math.atan2(q.vy, q.vx));
      q.glow.setPosition(q.x, q.y);
      if (!q.back && (q.y >= this.floorY - 2 || isSolid(s.level.tileAt(q.x, q.y)))) this.shatter(q);
      else if (q.y > this.floorY + 60 || q.x < -50 || q.x > s.level.widthPx + 50) this.shatter(q);
    }
  }

  private shatter(q: Shard) {
    q.dead = true;
    q.img.destroy();
    q.glow.destroy();
    this.scene.mine?.amberBurst(q.x, Math.min(q.y, this.floorY - 2), 5);
    this.scene.sfx('glass', 0.35, 1.4 + Math.random() * 0.3);
  }

  // ---------- investida até a parede ----------
  private hitWall() {
    const s = this.scene;
    const b = this.body;
    b.velocity.x = -this.facing * 90;
    this.go('stun', 'stun');
    s.sfx('thud', 1.2, 0.45);
    s.sfx('clang', 0.7, 0.5);
    s.cameras.main.shake(420, 0.012);
    s.dustBurst(this.zone.x + this.facing * 22, this.floorY - 30, 14);
    s.mine?.amberBurst(this.zone.x + this.facing * 16, this.body.top + 30, 10);
    // o teto sente a pancada: pedras soltam em volta do cavaleiro
    const p = s.player;
    const n = this.phase2 ? 6 : 4;
    const xs: number[] = [];
    for (let i = 0; i < n * 3 && xs.length < n; i++) {
      const x = Phaser.Math.Clamp(p.x + (Math.random() - 0.5) * 360, this.x0, this.x1);
      if (xs.every((o) => Math.abs(o - x) > 48) && Math.abs(x - this.zone.x) > 50) xs.push(x);
    }
    if (!xs.some((x) => Math.abs(x - p.x) < 30)) xs[0] = Phaser.Math.Clamp(p.x, this.x0, this.x1);
    xs.forEach((x, i) => this.scene.time.delayedCall(i * 140, () => this.dropRock(x)));
  }

  private rockTexture() {
    const s = this.scene;
    if (!s.textures.exists('mine-rock')) {
      const g = s.add.graphics();
      g.fillStyle(0x221b17).fillEllipse(8, 7, 16, 13);
      g.fillStyle(0x372c25).fillEllipse(7, 6, 13, 10);
      g.fillStyle(0x514338).fillEllipse(6, 4.5, 7, 5);
      g.fillStyle(0x110d0b).fillRect(3, 11, 10, 2);
      g.generateTexture('mine-rock', 16, 14);
      g.destroy();
    }
    return 'mine-rock';
  }

  private dropRock(x: number) {
    if (this.state === 'dead') return;
    const s = this.scene;
    let top = this.floorY - 40;
    while (top > 0 && !isSolid(s.level.tileAt(x, top - 2))) top -= TILE;
    const img = s.add.image(x, top + 6, this.rockTexture()).setDepth(DEPTH.enemy + 0.5).setVisible(false);
    const shadow = s.add.ellipse(x, this.floorY - 1, 20, 6, 0x050403, 0).setStrokeStyle(1, 0xd8c0a0, 0).setDepth(DEPTH.enemy - 0.4);
    s.tweens.add({ targets: shadow, fillAlpha: 0.7, strokeAlpha: 0.55, duration: 550 });
    this.rocks.push({ x, y: top + 6, land: this.floorY - 6, vy: 0, t: 0, falling: false, img, shadow, done: false });
  }

  private updateRocks(dt: number) {
    if (this.rocks.some((r) => r.done)) this.rocks = this.rocks.filter((r) => !r.done);
    const s = this.scene;
    for (const r of this.rocks) {
      r.t += dt;
      if (!r.falling) {
        if (Math.random() < dt * 16) s.grit(r.x + (Math.random() - 0.5) * 14, s.cameras.main.worldView.y + 2);
        if (r.t > 0.6) {
          r.falling = true;
          r.img.setVisible(true);
        }
        continue;
      }
      r.vy += 1500 * dt;
      r.y = Math.min(r.land, r.y + r.vy * dt);
      r.img.setPosition(r.x, r.y).setRotation(r.t * 4);
      if (r.y >= r.land) {
        r.done = true;
        s.sfx('thud', 0.6, 1.1);
        s.dustBurst(r.x, this.floorY, 8);
        r.shadow.destroy();
        s.tweens.add({ targets: r.img, alpha: 0, delay: 400, duration: 400, onComplete: () => r.img.destroy() });
      }
    }
  }

  private rockRect(r: Rock) {
    return new Phaser.Geom.Rectangle(r.x - 7, r.y - 6, 14, 12);
  }

  // ---------- segunda fase: a fragmentação ----------
  private fragment() {
    const s = this.scene;
    s.sfx('veil', 1, 0.7);
    s.sfx('glass', 1, 0.5);
    s.cameras.main.shake(900, 0.008);
    s.cameras.main.flash(220, 190, 120, 255);
    s.fragmentWave(this.zone.x, this.body.center.y);
    this.lowT = C.lowGravT;
    s.player.gravMul = C.lowGrav;
    this.wispT = 0.4;
    this.drawCrack();
    s.thinkOnce('capataz:fragment', 'A lembrança dele está rachando. O chão ficou leve.');
  }

  // a tela racha: linhas finas saindo do centro, que somem devagar
  private drawCrack() {
    const s = this.scene;
    const cam = s.cameras.main;
    const g = s.add.graphics().setScrollFactor(0).setDepth(200);
    const cx = cam.width / 2 + (Math.random() - 0.5) * 80;
    const cy = cam.height / 2 + (Math.random() - 0.5) * 40;
    for (let k = 0; k < 9; k++) {
      let a = (k / 9) * Math.PI * 2 + Math.random() * 0.4;
      let x = cx;
      let y = cy;
      g.lineStyle(1, k % 2 ? 0xffe6a6 : 0xbca4ff, 0.9);
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 7; j++) {
        a += (Math.random() - 0.5) * 0.7;
        const L = 14 + Math.random() * 26;
        x += Math.cos(a) * L;
        y += Math.sin(a) * L;
        g.lineTo(x, y);
      }
      g.strokePath();
    }
    this.crack = g;
    s.tweens.add({ targets: g, alpha: 0, delay: 900, duration: 1600, onComplete: () => g.destroy() });
  }

  private updateFragment(dt: number) {
    if (this.lowT > 0) {
      this.lowT -= dt;
      const p = this.scene.player;
      if (this.lowT <= 0 || this.state === 'dead') {
        this.lowT = 0;
        p.gravMul = 1;
      } else if (Math.random() < dt * 10) this.scene.echoMotes(p.x + (Math.random() - 0.5) * 300, this.floorY - Math.random() * 10, false);
    }
    if (this.wispT > 0 && this.state !== 'dead') {
      this.wispT -= dt;
      if (this.wispT <= 0) {
        // três fiapos de tinta sobem das rachaduras, longe do cavaleiro
        const p = this.scene.player;
        const spots = [this.x0 + 60, (this.x0 + this.x1) / 2, this.x1 - 60].filter((x) => Math.abs(x - p.x) > 90);
        for (const x of spots) this.scene.summon('k', x, this.floorY - 30);
      }
    }
  }

  // ---------- dano ----------
  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    this.harmFrom = undefined;
    const from = (x: number) => {
      this.harmFrom = x;
      return true;
    };
    for (const k of this.spikes) if (k.img && k.h > 8 && overlap(pr, this.spikeRect(k))) return from(k.x - this.facing * 10);
    for (const q of this.shards) if (!q.back && overlap(pr, this.shardRect(q))) return from(q.x - Math.sign(q.vx) * 10);
    for (const r of this.rocks) if (r.falling && !r.done && overlap(pr, this.rockRect(r))) return from(r.x);
    if (!this.present) return false;
    if (sliding || this.state === 'stagger' || this.state === 'stun') return false;
    return overlap(pr, this.rect);
  }

  // aparar: a picareta no fim da preparação da pancada, ou rebater uma lasca no ar
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive) return false;
    for (const q of this.shards) {
      if (!q.back && overlap(box, this.shardRect(q))) {
        q.back = true;
        this.scene.sfx('glass', 0.8, 1.6);
        return true;
      }
    }
    const late = this.state === 'slamwind' && this.t > C.slamWind * this.speedMul - PARRY.early;
    if (!late) return false;
    if ((Math.sign(fromX - this.zone.x) || this.facing) !== this.facing) return false;
    if (!overlap(box, this.rect)) return false;
    this.go('stagger', 'stagger');
    this.body.velocity.x = -this.facing * 70;
    return true;
  }

  private flash() {
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
  }

  hit(_fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive || !this.present) return 'ignored';
    return this.takeHit(dmg, false);
  }

  private takeHit(dmg: number, own: boolean): HitResult {
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    // tonto na parede, o Âmbar das costas fica exposto
    else if (this.state === 'stun') dmg *= 1.3;
    this.hp -= dmg;
    this.flash();
    if (own) {
      this.go('stagger', 'stagger');
      this.body.velocity.x = -this.facing * 60;
    }
    if (!this.phase2 && this.hp <= this.maxHp * C.phase2 && this.hp > 0) {
      this.phase2 = true;
      this.go('rage', 'roar');
      this.scene.sfx('roar', 1.1, 0.75);
      this.scene.cameras.main.shake(600, 0.006);
    }
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  private clearHazards() {
    for (const k of this.spikes) {
      k.img?.destroy();
      k.glow?.destroy();
    }
    for (const q of this.shards) {
      q.img.destroy();
      q.glow.destroy();
    }
    for (const r of this.rocks) {
      r.img.destroy();
      r.shadow.destroy();
    }
    this.spikes = [];
    this.shards = [];
    this.rocks = [];
    this.pressQueue = 0;
    this.wispT = 0;
  }

  private die() {
    const s = this.scene;
    this.alive = false;
    this.hp = 0;
    this.go('dead');
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.clearHazards();
    this.lowT = 0;
    s.player.gravMul = 1;
    s.time.delayedCall(80, () => this.sprite.clearTint());
    this.anim = 'death';
    this.sprite.setVisible(true).setAlpha(1).play('capataz-death');
    s.deathBurst(this.zone.x, this.zone.y);
    s.mine?.amberBurst(this.zone.x - this.facing * 12, this.body.top + 30, 30);
    s.sfx('glass', 1.2, 0.5);
    s.sfx('thud', 1, 0.5);
    s.hitstop(0.25);
    s.cameras.main.flash(300, 255, 214, 150);
    s.cameras.main.shake(700, 0.01);
    s.tweens.add({ targets: [this.eye, this.aura], alpha: 0, duration: 900 });
    this.onDefeat?.();
  }

  destroy() {
    this.clearHazards();
    this.eye.destroy();
    this.aura.destroy();
    this.crack?.destroy();
    this.scene.player.gravMul = 1;
  }
}

// a escala vertical "cheia" de uma imagem no traço liso (ela nasce achatada e cresce até essa)
function hdScaleY(img: Phaser.GameObjects.Image) {
  return (img.scene.registry.get(`${img.texture.key}-scale`) as number | undefined) ?? 1;
}

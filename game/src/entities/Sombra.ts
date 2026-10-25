import Phaser from 'phaser';
import { PARRY, SOMBRA as C, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isSolid } from '../world/Level';
import { DEPTH } from '../world/Decor';
import { overlap, type BossFoe, type HitDir, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';
import { ABYSS } from '../gfx/veil';

type State =
  | 'sleep' | 'rise' | 'roar' | 'idle' | 'glide'
  | 'cleavewind' | 'cleave' | 'cleaverec'
  | 'sink' | 'dive' | 'well' | 'geyser' | 'emerge'
  | 'rushwind' | 'rush' | 'rushrec'
  | 'summon' | 'throw'
  | 'stagger' | 'rage'
  | 'dead';

type Attack = 'cleave' | 'dive' | 'rush' | 'tentacles' | 'throw';

interface FramePoints {
  hand: [number, number];
  blade: [number, number];
}

// tentáculo que sobe do chão: antes, bolhas e um anel lilás no lugar; depois sobe, fica e volta
interface Tentacle {
  x: number;
  t: number;
  delay: number;
  h: number;
  seed: number;
  rose: boolean;
  done: boolean;
}

// gota de tinta arremessada em arco: estoura no chão ou num golpe bem na hora
interface Glob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  img: Phaser.GameObjects.Image;
  done: boolean;
}

// onda rasa que a machadada solta pelo chão (segunda fase)
interface Wave {
  x: number;
  dir: 1 | -1;
  dist: number;
}

const ease = Phaser.Math.Easing;

// A Sombra do Carrasco: tudo o que ele não quis lembrar, numa tinta preta viva com a forma dele de
// antes (capuz pontudo, machado). Dorme como uma poça no meio do Leito do Abismo. Desce o machado
// na frente (dá para aparar no fim da preparação), afunda na poça e persegue o cavaleiro por baixo
// do chão até explodir num gêiser embaixo dele (as bolhas avisam; ao se refazer fica aberta), vira
// uma massa comprida e atravessa a arena rente ao chão (pule), chama tentáculos que sobem onde o
// chão borbulha e arremessa gotas em arco em quem foge para as tábuas. Com metade da vida a poça
// transborda: a machadada solta uma onda, o mergulho e a investida vêm em dobro, mais tentáculos.
export class Sombra implements BossFoe {
  readonly kind = 'boss' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly maxHp = C.hp;
  hp = C.hp;
  alive = true;
  facing: 1 | -1 = -1;
  state: State = 'sleep';
  onDefeat: (() => void) | null = null;
  harmFrom: number | undefined;
  tentacles: Tentacle[] = [];
  globs: Glob[] = [];
  waves: Wave[] = [];
  private t = 0;
  private age = 0;
  private thinkT = 0;
  private phase2 = false;
  private flashT = 0;
  private anim = '';
  private last: Attack[] = [];
  // quantos mergulhos e investidas ainda faltam nesta série (na segunda fase vêm dois)
  private dives = 0;
  private rushes = 0;
  private rushDir: 1 | -1 = 1;
  private struck = false;
  private dripT = 0;
  private moteT = 0;
  private bubbleT = 0;
  private hist: { x: number; y: number; t: number }[] = [];
  private readonly aura: Phaser.GameObjects.Image;
  private readonly fx: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly floorY: number;
  private readonly x0: number;
  private readonly x1: number;
  private readonly dropK: number;
  private readonly baseScale: number;
  private readonly points: Record<string, FramePoints[]> | null;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.floorY = feetY;
    this.x0 = 9 * TILE;
    // a parede da direita da arena (a membrana no fundo conta como parede)
    const row = Math.floor((feetY - 8) / TILE);
    let c = Math.floor(x / TILE);
    while (c < scene.level.w - 1 && !isSolid(scene.level.tileAt(c * TILE + 8, row * TILE + 8))) c++;
    this.x1 = c * TILE - 26;
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(700, 700);
    const o = scene.registry.get('sombra-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'sombra', 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy));
    this.baseScale = this.sprite.scaleX;
    // contorno roxo: sem ele a silhueta preta se perde no fundo do abismo (só com placa de vídeo)
    this.sprite.preFX?.addGlow(ABYSS.purple, 2.6, 0, false, 0.1, 10);
    this.points = (scene.cache.json.get('sombra-meta') as { points?: Record<string, FramePoints[]> } | undefined)?.points ?? null;
    this.dropK = (scene.registry.get('veil-drop-scale') as number) ?? 1;
    // a aura roxa: sem ela a tinta preta some no escuro do abismo
    this.aura = scene.add.image(x, feetY - 50, 'glow').setTint(ABYSS.purple).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy - 0.2).setAlpha(0).setScale(3.6);
    this.fx = scene.add.graphics().setDepth(DEPTH.enemy + 0.25);
    this.glow = scene.add.graphics().setDepth(DEPTH.enemy + 0.3).setBlendMode(Phaser.BlendModes.ADD);
    this.play('pool');
    this.sync();
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  get sleeping() {
    return this.state === 'sleep';
  }

  // dá para acertar? (afundada, correndo como tinta ou ainda saindo do chão, não)
  get tangible() {
    switch (this.state) {
      case 'sleep':
      case 'rise':
      case 'dead':
      case 'dive':
      case 'well':
      case 'rush':
        return false;
      case 'sink':
        return this.t < 0.14;
      case 'geyser':
        return this.t > 0.12;
      default:
        return true;
    }
  }

  private get speedMul() {
    return this.phase2 ? 0.8 : 1;
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`sombra-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  private face() {
    this.facing = this.scene.player.x >= this.zone.x ? 1 : -1;
  }

  private point(key: keyof FramePoints) {
    const pts = this.points?.[this.anim];
    const i = (this.sprite.anims.currentFrame?.index ?? 1) - 1;
    const pt = pts?.[Math.min(i, pts.length - 1)]?.[key] ?? [70, -8];
    return { x: this.zone.x + this.facing * pt[0], y: this.body.bottom + pt[1] };
  }

  wake() {
    if (this.state !== 'sleep') return;
    const s = this.scene;
    this.go('rise', 'rise');
    s.sfx('veil', 1, 0.55);
    s.sfx('splash', 0.8, 0.6);
    s.cameras.main.shake(400, 0.003);
    for (let i = 0; i < 4; i++) s.time.delayedCall(i * 120, () => s.echoMotes(this.zone.x + (Math.random() - 0.5) * 50, this.floorY - 4, true, 4));
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.face();
      this.go('roar', 'roar');
      s.sfx('roar', 0.9, 0.75);
      s.sfx('veil-form', 0.8, 0.6);
      s.cameras.main.shake(800, 0.005);
    });
  }

  // ---------- áreas dos golpes ----------
  // machadada: tudo na frente, do alto ao chão, até a ponta do machado
  private get cleaveBox() {
    const b = this.body;
    const w = C.cleaveReach;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x : b.center.x - w, this.floorY - 100, w, 100);
  }

  // a massa comprida da investida: baixa, dá para pular por cima
  private get rushBox() {
    return new Phaser.Geom.Rectangle(this.zone.x - 40, this.floorY - 38, 80, 38);
  }

  private get geyserBox() {
    return new Phaser.Geom.Rectangle(this.zone.x - 24, this.floorY - C.geyserH, 48, C.geyserH);
  }

  private tentHeight(k: Tentacle) {
    const up = k.t - k.delay - C.tentWarn;
    if (up <= 0) return 0;
    if (up < 0.12) return k.h * ease.Back.Out(up / 0.12, 1.6);
    if (up < C.tentUp) return k.h;
    return k.h * Math.max(0, 1 - (up - C.tentUp) / 0.18);
  }

  private tentRect(k: Tentacle) {
    const h = this.tentHeight(k);
    return new Phaser.Geom.Rectangle(k.x - 9, this.floorY - h, 18, h);
  }

  private globRect(g: Glob) {
    return new Phaser.Geom.Rectangle(g.x - 6, g.y - 6, 12, 12);
  }

  private waveRect(w: Wave) {
    return new Phaser.Geom.Rectangle(w.x - 12, this.floorY - 16, 24, 16);
  }

  private choose(): Attack {
    const p = this.scene.player;
    const dist = Math.abs(p.x - this.zone.x);
    const high = this.floorY - p.body.bottom > 40;
    let opts: [Attack, number][];
    if (high) opts = [['throw', 0.45], ['tentacles', 0.3], ['dive', 0.25]];
    else if (dist < C.cleaveReach) opts = [['cleave', 0.5], ['dive', 0.2], ['tentacles', 0.15], ['rush', 0.15]];
    else opts = [['rush', 0.32], ['dive', 0.28], ['tentacles', 0.2], ['throw', 0.2]];
    if (this.last.length >= 2 && this.last[0] === this.last[1]) opts = opts.filter(([a]) => a !== this.last[0]);
    if (!opts.length) opts = [['dive', 1]];
    const total = opts.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [a, w] of opts) {
      r -= w;
      if (r <= 0) return a;
    }
    return opts[0][0];
  }

  update(dt: number) {
    this.age += dt;
    this.updateTentacles(dt);
    this.updateGlobs(dt);
    this.updateWaves(dt);
    if (this.state === 'dead') {
      this.body.velocity.x = 0;
      this.drawFx(dt);
      this.sync();
      return;
    }
    const s = this.scene;
    if (this.state === 'sleep') {
      // a poça respira: bolhas de vez em quando
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) {
        this.bubbleT = 0.35 + Math.random() * 0.4;
        s.echoMotes(this.zone.x + (Math.random() - 0.5) * 44, this.floorY - 3, false);
      }
      this.sync();
      return;
    }
    const b = this.body;
    const p = s.player;
    this.t += dt;
    const dx = p.x - this.zone.x;
    switch (this.state) {
      case 'rise':
        b.velocity.x = 0;
        break;
      case 'roar':
        b.velocity.x = 0;
        if (this.t > 1.4) this.toIdle(0.4);
        break;
      case 'rage':
        // a poça transborda: dois tentáculos nas pontas da arena e a tinta treme
        b.velocity.x = 0;
        if (this.t - dt < 0.7 && this.t >= 0.7) {
          for (const x of [this.x0 + 30, this.x1 - 30]) if (Math.abs(x - p.x) > 90) this.addTentacle(x, 0, 1.1);
          s.sfx('splash', 1, 0.5);
        }
        if (this.t > 1.9) this.toIdle(0.3);
        break;
      case 'idle': {
        b.velocity.x = 0;
        this.face();
        this.thinkT -= dt;
        if (this.thinkT > 0) break;
        if (Math.abs(dx) > C.cleaveReach + 40 && Math.random() < 0.4) {
          this.go('glide', 'glide');
          break;
        }
        this.startAttack(this.choose());
        break;
      }
      case 'glide':
        this.face();
        b.velocity.x = this.facing * C.glide * (this.phase2 ? 1.25 : 1);
        if (Math.abs(dx) < C.cleaveReach - 14 || this.t > 1.3) {
          b.velocity.x = 0;
          this.startAttack(Math.abs(dx) < C.cleaveReach - 14 ? 'cleave' : this.choose());
        }
        break;
      case 'cleavewind':
        b.velocity.x = 0;
        if (this.t > C.cleaveWind * this.speedMul) {
          this.go('cleave', 'cleave');
          this.struck = false;
          s.sfx('swoosh', 1, 0.45);
        }
        break;
      case 'cleave':
        b.velocity.x = 0;
        if (!this.struck && this.t > 0.07) {
          this.struck = true;
          this.chop();
        }
        if (this.t > C.cleaveActive) this.go('cleaverec', 'cleaverec');
        break;
      case 'cleaverec':
        b.velocity.x = 0;
        if (this.t > C.cleaveRec * this.speedMul) this.toIdle();
        break;
      case 'sink':
        b.velocity.x = 0;
        if (this.t > C.sink) {
          this.go('dive');
          this.sprite.setVisible(false);
          s.sfx('veil', 0.7, 0.7);
        }
        break;
      case 'dive': {
        // por baixo do chão, atrás do cavaleiro (só a poça e os olhos aparecem)
        const tx = Phaser.Math.Clamp(p.x, this.x0 + 16, this.x1 - 16);
        const d = tx - this.zone.x;
        b.velocity.x = Math.abs(d) < 6 ? 0 : Math.sign(d) * C.diveSpeed * (this.phase2 ? 1.15 : 1);
        if (Math.abs(d) < 8 || this.t > C.diveTime) {
          b.velocity.x = 0;
          this.go('well');
          s.sfx('quake', 0.5, 1.4);
        }
        break;
      }
      case 'well':
        // o chão borbulha onde ela vai sair
        b.velocity.x = 0;
        if (this.t > C.geyserWarn * this.speedMul) this.erupt();
        break;
      case 'geyser':
        b.velocity.x = 0;
        if (this.t > C.geyserActive + 0.1) {
          if (this.dives > 0) {
            // segunda fase: afunda de novo logo depois do primeiro gêiser
            this.dives--;
            this.go('sink', 'sink');
            this.t = C.sink * 0.45;
          } else this.go('emerge', 'emerge');
        }
        break;
      case 'emerge':
        b.velocity.x = 0;
        if (this.t > C.emerge * this.speedMul) this.toIdle(0.1);
        break;
      case 'rushwind':
        b.velocity.x = 0;
        if (this.t > C.rushWind * this.speedMul) {
          this.go('rush', 'rush');
          this.hist.length = 0;
          s.sfx('veil', 1, 0.8);
          s.sfx('swoosh', 0.8, 0.5);
        }
        break;
      case 'rush': {
        b.velocity.x = this.rushDir * C.rushSpeed;
        const end = this.rushDir > 0 ? this.zone.x >= this.x1 - 6 : this.zone.x <= this.x0 + 6;
        if (end || b.blocked.left || b.blocked.right || this.t > 2.4) {
          b.velocity.x = 0;
          s.sfx('splash', 0.9, 0.6);
          s.echoMotes(this.zone.x + this.rushDir * 20, this.floorY - 20, true, 10);
          if (this.rushes > 0) {
            // segunda fase: vira e volta
            this.rushes--;
            this.rushDir = this.rushDir > 0 ? -1 : 1;
            this.facing = this.rushDir;
            this.go('rushwind', 'rushwind');
            this.t = C.rushWind * this.speedMul * 0.45;
          } else this.go('rushrec', 'emerge');
        }
        break;
      }
      case 'rushrec':
        b.velocity.x = 0;
        if (this.t > C.rushRec * this.speedMul) this.toIdle();
        break;
      case 'summon':
        b.velocity.x = 0;
        if (this.t - dt < 0.3 && this.t >= 0.3) this.callTentacles();
        if (this.t > 1.25) this.toIdle(0.2);
        break;
      case 'throw':
        b.velocity.x = 0;
        if (this.t - dt < C.throwWind && this.t >= C.throwWind) this.fling();
        if (this.t > 0.95) this.toIdle();
        break;
      case 'stagger':
        b.velocity.x *= Math.pow(0.86, dt * 60);
        if (this.t > C.stagger) this.toIdle(0.3);
        break;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.ambient(dt);
    this.drawFx(dt);
    this.sync();
  }

  private sync() {
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(this.body.bottom));
    face(this.sprite, this.facing < 0);
    const hidden = this.state === 'dive' || this.state === 'well';
    const awake = this.state !== 'sleep' && this.alive;
    const pulse = 0.18 + Math.sin(this.age * 3.1) * 0.04 + (this.phase2 ? 0.05 : 0);
    this.aura
      .setPosition(this.zone.x, this.floorY - (hidden || this.state === 'rush' ? 12 : 54))
      .setScale(hidden ? 2.2 : this.state === 'rush' ? 3 : 3.6, hidden ? 1.1 : this.state === 'rush' ? 1.6 : 3.6)
      .setAlpha(awake ? pulse * (hidden ? 0.8 : 1) : 0);
  }

  private toIdle(extra = 0) {
    this.thinkT = (C.think + Math.random() * 0.3) * this.speedMul + extra;
    this.go('idle', 'idle');
  }

  private startAttack(a: Attack) {
    this.face();
    this.last = [a, ...this.last].slice(0, 2);
    const s = this.scene;
    if (a === 'cleave') {
      this.go('cleavewind', 'cleavewind');
      s.sfx('censer', 1, 0.5);
    } else if (a === 'dive') {
      this.dives = this.phase2 ? 1 : 0;
      this.go('sink', 'sink');
      s.sfx('splash', 0.8, 0.7);
    } else if (a === 'rush') {
      this.rushes = this.phase2 ? 1 : 0;
      this.rushDir = this.facing;
      this.go('rushwind', 'rushwind');
      s.sfx('censer', 0.9, 0.45);
    } else if (a === 'tentacles') {
      this.go('summon', 'summon');
      s.sfx('roar', 0.45, 1.3);
    } else {
      this.go('throw', 'throw');
      s.sfx('censer', 0.8, 0.9);
    }
  }

  // ---------- machadada ----------
  private chop() {
    const s = this.scene;
    const bl = this.point('blade');
    const x = Phaser.Math.Clamp(bl.x, this.x0, this.x1 + 20);
    s.sfx('thud', 1, 0.7);
    s.sfx('splash', 0.8, 0.8);
    s.cameras.main.shake(160, 0.006);
    s.dustBurst(x, this.floorY, 8);
    s.echoMotes(x, this.floorY - 6, true, 12);
    s.echoMotes(x, this.floorY - 10, false, 5);
    if (this.phase2) this.waves.push({ x, dir: this.facing, dist: 0 });
  }

  // ---------- mergulho e gêiser ----------
  private erupt() {
    const s = this.scene;
    this.face();
    this.go('geyser', 'geyser');
    this.sprite.setVisible(true);
    s.sfx('splash', 1.1, 0.5);
    s.sfx('veil-form', 1, 0.5);
    s.sfx('roar', 0.5, 1.2);
    s.cameras.main.shake(260, 0.007);
    for (let i = 0; i < 3; i++) s.time.delayedCall(i * 50, () => s.echoMotes(this.zone.x + (Math.random() - 0.5) * 30, this.floorY - 40 - i * 40, true, 8));
    s.echoMotes(this.zone.x, this.floorY - 20, false, 8);
  }

  // ---------- tentáculos ----------
  private addTentacle(x: number, delay: number, k = 1) {
    this.tentacles.push({ x, t: 0, delay, h: C.tentH * k * (0.9 + Math.random() * 0.2), seed: Math.random() * 10, rose: false, done: false });
  }

  private callTentacles() {
    const s = this.scene;
    const p = s.player;
    const n = this.phase2 ? 5 : 3;
    const gap = this.phase2 ? 64 : 76;
    const order = this.phase2 ? [0, -1, 1, -2, 2] : [0, -1, 1];
    for (let i = 0; i < n; i++) {
      const x = Phaser.Math.Clamp(p.x + order[i] * gap, this.x0 + 12, this.x1 + 10);
      if (this.tentacles.some((k) => !k.done && Math.abs(k.x - x) < 30)) continue;
      this.addTentacle(x, i * (this.phase2 ? 0.16 : 0.24));
    }
    s.sfx('quake', 0.6, 1.2);
  }

  private updateTentacles(dt: number) {
    const s = this.scene;
    for (const k of this.tentacles) {
      k.t += dt;
      const up = k.t - k.delay - C.tentWarn;
      if (up < 0 && k.t > k.delay && Math.random() < dt * 14) s.echoMotes(k.x + (Math.random() - 0.5) * 18, this.floorY - 2, false);
      if (up >= 0 && !k.rose) {
        k.rose = true;
        s.sfx('splash', 0.7, 0.9 + Math.random() * 0.2);
        s.echoMotes(k.x, this.floorY - 8, true, 8);
      }
      if (up > C.tentUp + 0.2) k.done = true;
    }
    if (this.tentacles.some((k) => k.done)) this.tentacles = this.tentacles.filter((k) => !k.done);
  }

  // ---------- gotas arremessadas ----------
  private fling() {
    const s = this.scene;
    const p = s.player;
    const from = { x: this.zone.x - this.facing * 6, y: this.floorY - 112 };
    const n = this.phase2 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      // mira no cavaleiro, com as outras espalhadas em volta
      const off = (i - (n - 1) / 2) * 46;
      const tx = Phaser.Math.Clamp(p.x + off, this.x0, this.x1 + 20);
      const ty = p.body.center.y;
      const T = 0.75 + Math.abs(tx - from.x) / 900 + i * 0.04;
      const g = 760;
      const vx = (tx - from.x) / T;
      const vy = (ty - from.y - 0.5 * g * T * T) / T;
      const img = s.add.image(from.x, from.y, 'veil-drop').setDepth(DEPTH.enemy + 0.4).setScale(this.dropK * 2.6);
      this.globs.push({ x: from.x, y: from.y, vx, vy, t: 0, img, done: false });
    }
    s.sfx('swoosh', 0.9, 0.8);
    s.echoMotes(from.x, from.y, false, 6);
  }

  private burst(g: Glob, parried = false) {
    if (g.done) return;
    g.done = true;
    const s = this.scene;
    s.echoMotes(g.x, g.y, true, parried ? 8 : 6);
    s.echoMotes(g.x, g.y, false, parried ? 6 : 3);
    s.sfx('splash', parried ? 0.8 : 0.55, 1.2 + Math.random() * 0.2);
    if (parried) s.glowBurst(g.x, g.y, ABYSS.lilac, 1.2);
    g.img.destroy();
  }

  private updateGlobs(dt: number) {
    const L = this.scene.level;
    for (const g of this.globs) {
      if (g.done) continue;
      g.t += dt;
      g.vy += 760 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.img.setPosition(g.x, g.y).setRotation(Math.atan2(g.vy, g.vx));
      const sp = Math.hypot(g.vx, g.vy);
      g.img.setScale(this.dropK * 2.6 * Math.min(1.7, 1 + sp / 700), this.dropK * 2.6);
      if (Math.random() < dt * 20) this.scene.echoMotes(g.x, g.y, true);
      if (g.y >= this.floorY - 3 || isSolid(L.tileAt(g.x, g.y)) || g.t > 2.5) this.burst(g);
    }
    if (this.globs.some((g) => g.done)) this.globs = this.globs.filter((g) => !g.done);
  }

  // ---------- onda da machadada ----------
  private updateWaves(dt: number) {
    for (const w of this.waves) {
      const d = C.waveSpeed * dt;
      w.x += w.dir * d;
      w.dist += d;
      if (Math.random() < dt * 24) this.scene.echoMotes(w.x, this.floorY - 10, true);
    }
    this.waves = this.waves.filter((w) => w.dist < C.waveRange && w.x > this.x0 - 10 && w.x < this.x1 + 30);
  }

  // gotas que pingam do corpo e luzes lilás que sobem dele
  private ambient(dt: number) {
    const s = this.scene;
    const visible = this.sprite.visible && this.state !== 'rush';
    this.dripT -= dt;
    if (visible && this.dripT <= 0) {
      this.dripT = 0.1 + Math.random() * 0.08;
      s.echoMotes(this.zone.x + (Math.random() - 0.5) * 46, this.floorY - 30 - Math.random() * 64, true);
    }
    this.moteT -= dt;
    if (this.moteT <= 0) {
      this.moteT = this.phase2 ? 0.12 : 0.2;
      const y = visible ? this.floorY - 20 - Math.random() * 90 : this.floorY - 4;
      s.echoMotes(this.zone.x + (Math.random() - 0.5) * (visible ? 40 : 30), y, false);
    }
    if (this.state === 'rush') {
      this.hist.unshift({ x: this.zone.x - this.rushDir * 26, y: this.floorY - 14, t: 0 });
      if (Math.random() < dt * 30) s.echoMotes(this.zone.x - this.rushDir * 20, this.floorY - 18, true, 2);
    }
  }

  // ---------- desenho do que não está na folha ----------
  private drawFx(dt: number) {
    const g = this.fx;
    const h = this.glow;
    g.clear();
    h.clear();
    const fy = this.floorY;
    // a poça que persegue o cavaleiro por baixo do chão, com os dois olhos espiando
    if (this.state === 'dive' || this.state === 'well') {
      const well = this.state === 'well' ? Math.min(1, this.t / (C.geyserWarn * this.speedMul)) : 0;
      const x = this.zone.x;
      const w = 50 + 26 * well + Math.sin(this.age * 9) * 3;
      g.fillStyle(ABYSS.ink, 0.95).fillEllipse(x, fy - 1.5, w, 7 + 3 * well);
      g.lineStyle(1.2, ABYSS.purple, 0.9).strokeEllipse(x, fy - 1.8, w, 7 + 3 * well);
      // a corcova que anda na frente, rasgando a tinta
      const hump = 9 + 4 * well + Math.sin(this.age * 14) * 1.2;
      const dir = Math.sign(this.body.velocity.x) || this.facing;
      g.fillStyle(ABYSS.ink, 1).fillEllipse(x + dir * 4, fy - 3, 26, hump * 2);
      g.lineStyle(1, ABYSS.purple, 0.8).beginPath();
      g.arc(x + dir * 4, fy - 3, 13, Math.PI * 1.08, Math.PI * 1.92);
      g.strokePath();
      h.fillStyle(ABYSS.lilac, 0.9);
      h.fillEllipse(x + dir * 7, fy - 3 - hump * 0.45, 3.4, 1.4);
      h.fillEllipse(x + dir * 12, fy - 3 - hump * 0.4, 3, 1.3);
      if (well > 0) {
        // uma coluna de luz roxa sobe de onde o gêiser vai sair (lê de longe, até no escuro)
        for (let i = 0; i < 3; i++) h.fillStyle(ABYSS.purple, (0.16 - i * 0.04) * well).fillEllipse(x, fy - 14 - i * 16, 34 - i * 6, 30 + i * 12);
        // anéis que sobem e espirros: o gêiser vem aí
        for (let i = 0; i < 3; i++) {
          const k = (this.age * 2.4 + i / 3) % 1;
          h.lineStyle(1.4 * (1 - k) + 0.4, ABYSS.lilac, 0.55 * (1 - k) * well);
          h.strokeEllipse(x, fy - 2, 14 + k * 60, 4 + k * 10);
        }
        if (Math.random() < 0.5) this.scene.echoMotes(x + (Math.random() - 0.5) * 30, fy - 4, true, 1);
      }
    }
    // o jato do gêiser
    if (this.state === 'geyser' && this.t < C.geyserActive + 0.1) {
      const k = this.t / (C.geyserActive + 0.1);
      const top = fy - C.geyserH * (k < 0.3 ? ease.Cubic.Out(k / 0.3) : 1 - ease.Quadratic.In((k - 0.3) / 0.7) * 0.5);
      const x = this.zone.x;
      const wob = Math.sin(this.age * 40) * 2;
      const pts = [
        new Phaser.Math.Vector2(x - 26, fy),
        new Phaser.Math.Vector2(x - 12 + wob, (fy + top) / 2),
        new Phaser.Math.Vector2(x - 6 - wob, top + 10),
        new Phaser.Math.Vector2(x + wob, top),
        new Phaser.Math.Vector2(x + 7 + wob, top + 12),
        new Phaser.Math.Vector2(x + 13 - wob, (fy + top) / 2),
        new Phaser.Math.Vector2(x + 26, fy),
      ];
      g.fillStyle(ABYSS.ink, 0.9 * (1 - k * 0.6)).fillPoints(pts, true);
      g.lineStyle(1.4, ABYSS.purple, 0.85 * (1 - k)).strokePoints(pts, false);
      h.lineStyle(0.8, ABYSS.lilac, 0.5 * (1 - k)).lineBetween(x - 3, fy - 6, x - 1 + wob, top + 6);
      if (Math.random() < 0.7) this.scene.echoMotes(x + (Math.random() - 0.5) * 20, top + 6, true, 2);
    }
    // aviso da investida: uma linha lilás no chão até a parede, com setas andando
    if (this.state === 'rushwind') {
      const k = Math.min(1, this.t / (C.rushWind * this.speedMul));
      const x0 = this.zone.x + this.rushDir * 24;
      const x1 = this.rushDir > 0 ? this.x1 + 10 : this.x0 - 10;
      h.lineStyle(1.6, ABYSS.lilac, 0.18 + 0.3 * k + Math.sin(this.age * 30) * 0.08).lineBetween(x0, fy - 2, x1, fy - 2);
      h.lineStyle(1, ABYSS.magenta, 0.4 * k);
      for (let i = 0; i < 6; i++) {
        const cx = x0 + (x1 - x0) * ((i / 6 + this.age * 1.6) % 1);
        h.lineBetween(cx, fy - 8, cx + this.rushDir * 5, fy - 4);
        h.lineBetween(cx + this.rushDir * 5, fy - 4, cx, fy);
      }
    }
    // o rastro que a investida deixa
    for (const q of this.hist) q.t += dt;
    this.hist = this.hist.filter((q) => q.t < 0.22);
    if (this.hist.length >= 2) {
      const top: Phaser.Math.Vector2[] = [];
      const bot: Phaser.Math.Vector2[] = [];
      this.hist.forEach((q, i) => {
        const a = q.t / 0.22;
        const wv = Math.sin(this.age * 26 - i * 0.6) * 1.6;
        const w = (1 - a) ** 1.2 * 13;
        top.push(new Phaser.Math.Vector2(q.x, q.y - w + wv));
        bot.push(new Phaser.Math.Vector2(q.x, Math.min(fy, q.y + w * 0.8 + wv * 0.5)));
      });
      g.fillStyle(ABYSS.ink, 0.9).fillPoints([...top, ...[...bot].reverse()], true);
      g.lineStyle(1.3, ABYSS.purple, 0.85).strokePoints(top, false);
      g.lineStyle(0.9, ABYSS.magenta, 0.5).strokePoints(bot, false);
    }
    // tentáculos: a poça e o anel antes, depois o braço de tinta que sobe balançando
    for (const k of this.tentacles) {
      if (k.t < k.delay) continue;
      const warn = Math.min(1, (k.t - k.delay) / C.tentWarn);
      const hgt = this.tentHeight(k);
      const pw = 8 + 22 * ease.Cubic.Out(warn);
      g.fillStyle(ABYSS.ink, 0.95).fillEllipse(k.x, fy - 1.5, pw, 5);
      g.lineStyle(1, ABYSS.purple, 0.8).strokeEllipse(k.x, fy - 1.7, pw, 5);
      if (hgt <= 0) {
        h.fillStyle(ABYSS.purple, 0.13 * warn).fillEllipse(k.x, fy - 12, 26, 26);
        h.fillStyle(ABYSS.purple, 0.07 * warn).fillEllipse(k.x, fy - 30, 18, 34);
        const r = (this.age * 3 + k.seed) % 1;
        h.lineStyle(1.3 * (1 - r) + 0.3, ABYSS.lilac, 0.6 * warn * (1 - r));
        h.strokeEllipse(k.x, fy - 2, 10 + r * 36, 3 + r * 8);
        continue;
      }
      const n = 10;
      let px = k.x;
      let py = fy - 1;
      for (let j = 1; j <= n; j++) {
        const sj = j / n;
        const nx = k.x + Math.sin(this.age * 7 + k.seed + sj * 3.2) * 7 * sj;
        const ny = fy - 1 - hgt * sj;
        const wd = 10 * (1 - sj) + 1.4;
        g.lineStyle(wd + 2.2, ABYSS.purple, 0.55).lineBetween(px, py, nx, ny);
        g.lineStyle(wd, ABYSS.ink, 1).lineBetween(px, py, nx, ny);
        if (j % 2 === 0 && j < n) h.fillStyle(ABYSS.lilac, 0.55).fillCircle(nx + wd * 0.3, ny, 0.9);
        px = nx;
        py = ny;
      }
      h.fillStyle(ABYSS.lilac, 0.9).fillCircle(px, py, 1.4);
    }
    // a onda rasa da segunda fase
    for (const w of this.waves) {
      const x = w.x;
      const d = w.dir;
      const k = 1 - w.dist / C.waveRange;
      const crest = [
        new Phaser.Math.Vector2(x - d * 16, fy),
        new Phaser.Math.Vector2(x - d * 6, fy - 9 * k - 4),
        new Phaser.Math.Vector2(x + d * 4, fy - 16 * k - 2),
        new Phaser.Math.Vector2(x + d * 10, fy - 8 * k),
        new Phaser.Math.Vector2(x + d * 12, fy),
      ];
      g.fillStyle(ABYSS.ink, 0.95).fillPoints(crest, true);
      g.lineStyle(1.2, ABYSS.purple, 0.9).strokePoints(crest.slice(0, 4), false);
      h.lineStyle(0.8, ABYSS.lilac, 0.6 * k).lineBetween(x - d * 4, fy - 10 * k - 3, x + d * 4, fy - 16 * k - 2);
    }
  }

  // ---------- dano ----------
  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    this.harmFrom = undefined;
    const from = (x: number) => {
      this.harmFrom = x;
      return true;
    };
    for (const g of this.globs) {
      if (!g.done && overlap(pr, this.globRect(g))) {
        const x = g.x;
        this.burst(g);
        return from(x - Math.sign(g.vx) * 6);
      }
    }
    for (const k of this.tentacles) if (this.tentHeight(k) > 16 && overlap(pr, this.tentRect(k))) return from(k.x);
    for (const w of this.waves) if (overlap(pr, this.waveRect(w))) return from(w.x - w.dir * 12);
    if (this.state === 'geyser' && this.t < C.geyserActive && overlap(pr, this.geyserBox)) return from(this.zone.x);
    if (this.state === 'rush') return overlap(pr, this.rushBox) ? from(this.zone.x - this.rushDir * 30) : false;
    if (this.state === 'cleave' && overlap(pr, this.cleaveBox)) return true;
    if (!this.tangible || this.state === 'stagger' || sliding) return false;
    return overlap(pr, this.rect);
  }

  // aparar: a machadada no fim da preparação ou descendo, ou uma gota em voo (estoura)
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive) return false;
    for (const g of this.globs) {
      if (!g.done && overlap(box, this.globRect(g))) {
        this.burst(g, true);
        return true;
      }
    }
    const late = this.state === 'cleavewind' && this.t > C.cleaveWind * this.speedMul - PARRY.early;
    const swing = this.state === 'cleave';
    if (!late && !swing) return false;
    if ((Math.sign(fromX - this.zone.x) || this.facing) !== this.facing) return false;
    if (!overlap(box, this.cleaveBox) && !overlap(box, this.rect)) return false;
    this.waves = [];
    this.go('stagger', 'stagger');
    this.body.velocity.x = -this.facing * 70;
    this.scene.echoMotes(this.zone.x, this.floorY - 60, true, 10);
    return true;
  }

  private flash() {
    this.flashT = 0.07;
    this.sprite.setTintFill(ABYSS.lilac);
  }

  hit(fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive || !this.tangible) return 'ignored';
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    this.hp -= dmg;
    this.flash();
    // a tinta espirra do lado do golpe
    this.scene.echoMotes(this.zone.x + Math.sign(fromX - this.zone.x) * 12, this.floorY - 60, true, 5);
    if (!this.phase2 && this.hp <= this.maxHp * C.phase2 && this.hp > 0) {
      this.phase2 = true;
      this.waves = [];
      this.dives = 0;
      this.rushes = 0;
      this.sprite.setVisible(true);
      this.go('rage', 'roar');
      this.scene.sfx('roar', 1, 0.7);
      this.scene.sfx('veil', 1, 0.5);
      this.scene.cameras.main.shake(900, 0.006);
    }
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  private clearHazards() {
    for (const g of this.globs) g.img.destroy();
    this.globs = [];
    this.tentacles = [];
    this.waves = [];
    this.hist = [];
    this.fx.clear();
    this.glow.clear();
  }

  private die() {
    const s = this.scene;
    this.alive = false;
    this.hp = 0;
    this.go('dead');
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.clearHazards();
    s.time.delayedCall(80, () => this.sprite.clearTint());
    this.anim = 'death';
    this.sprite.setVisible(true).setAlpha(1).setScale(this.baseScale).play('sombra-death');
    s.echoMotes(this.zone.x, this.zone.y, true, 26);
    s.echoMotes(this.zone.x, this.zone.y, false, 20);
    s.sfx('roar', 0.8, 0.6);
    s.sfx('splash', 1.2, 0.5);
    s.hitstop(0.25);
    s.cameras.main.flash(300, 200, 170, 240);
    s.cameras.main.shake(700, 0.01);
    this.onDefeat?.();
  }

  // onde a poça ficou (a tinta sai daqui para o cavaleiro)
  get puddle() {
    return { x: this.zone.x, y: this.floorY };
  }

  // a poça vai encolhendo enquanto a tinta escorre para o cavaleiro (k de 0 a 1)
  drain(k: number) {
    this.sprite.setScale(this.baseScale * (1 - 0.6 * k), this.baseScale * (1 - 0.3 * k));
    if (Math.random() < 0.3) this.scene.echoMotes(this.zone.x + (Math.random() - 0.5) * 40 * (1 - k), this.floorY - 3, false);
  }

  // a tinta toda voltou para ele: fica só o machado caído
  absorbed() {
    this.sprite.setScale(this.baseScale).play('sombra-gone');
    this.sprite.preFX?.clear();
    this.anim = 'gone';
    this.aura.setAlpha(0);
  }

  destroy() {
    this.clearHazards();
    this.fx.destroy();
    this.glow.destroy();
    this.aura.destroy();
  }
}

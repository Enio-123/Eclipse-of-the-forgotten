import Phaser from 'phaser';
import { BARQUEIRO as C, PARRY, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isSolid } from '../world/Level';
import { DEPTH } from '../world/Decor';
import { overlap, type BossFoe, type HitDir, type HitResult } from './Enemy';
import { face, hd, hdScale } from '../gfx/flip';
import { ui } from '../ui/ui';

type State =
  | 'sleep' | 'wake' | 'idle' | 'pole'
  | 'sweepwind' | 'sweep' | 'sweeprec'
  | 'slamwind' | 'slam' | 'slamrec'
  | 'ropewind' | 'rope' | 'pull' | 'ropeback'
  | 'jabwind' | 'jab' | 'jabrec'
  | 'stagger'
  | 'sink' | 'under' | 'bubbles' | 'surge'
  | 'dead';

type Attack = 'sweep' | 'slam' | 'rope' | 'jab' | 'close';

// pontos de cada quadro (art/barqueiro.py points): em px do mundo, a partir da linha d'água embaixo dele,
// para quem olha para a direita. pole: [ângulo na tela, encurtamento, do pé da vara até a mão] ou null
interface FramePoints {
  grip: [number, number];
  pole: [number, number, number] | null;
  rope: [number, number];
  head: [number, number];
  hat: [number, number];
  lamp: [number, number];
}

const FALLBACK: FramePoints = { grip: [27, -54], pole: [78, 1, 46], rope: [24, -66], head: [21, -74], hat: [25, -90], lamp: [73, -35] };

// a vara inteira (px do mundo) e onde o pé dela fica na imagem solta (barqueiro-pole)
const POLE = 172;
const POLE_ORIGIN = 2 / 178;
// o casco: para trás e para a frente do pé dele (px)
const STERN = 48;
const BOW = 67;
// as algas penduradas no fundo do casco: [x para a frente do pé dele, y da raiz embaixo da linha d'água,
// comprimento] (o fundo do casco em art/barqueiro.py KEEL)
const WEED: [number, number, number][] = [
  [-40, 2, 8], [-35, 4.5, 11.5], [-28, 6.1, 7], [-21, 7.6, 12.5], [-12, 7.8, 9], [-5, 8, 6],
  [5, 8, 11], [13, 7.7, 13.5], [22, 7, 8.5], [30, 5.5, 10.5], [39, 3.5, 7.5], [46, 0, 5.5],
];

// a vara em pé ao lado dele, do lado de lá do barco (dormindo, pedindo a passagem, mexendo a corda): atrás
// do corpo, só a mão por cima
const POLE_BEHIND = new Set(['sleep', 'wake', 'ropewind', 'rope', 'pull']);

// a vara num quadro da folha, para quem desenha o Barqueiro fora da luta (o eco do Grimório): o pé da
// vara, a rotação, o encurtamento e se fica atrás do corpo (x e wy: o pé dele na linha d'água)
export function poleFrame(scene: Phaser.Scene, anim: string, frame: number, x: number, wy: number, facing: 1 | -1) {
  const pts = (scene.cache.json.get('barqueiro-meta') as { points?: Record<string, FramePoints[]> } | undefined)?.points?.[anim];
  const f = pts?.[Math.min(frame, pts.length - 1)] ?? FALLBACK;
  if (!f.pole) return null;
  const [ang, pf, along] = f.pole;
  const a = Phaser.Math.DegToRad(ang);
  const dx = Math.cos(a) * facing;
  const dy = Math.sin(a);
  const gx = x + facing * f.grip[0];
  const gy = wy + f.grip[1];
  return { x: gx - dx * along * pf, y: gy - dy * along * pf, rot: Math.atan2(dy, dx), pf, behind: Math.cos(a) < -0.2 || POLE_BEHIND.has(anim) };
}

// a onda que corre pela linha d'água depois da pancada
interface Wave {
  x: number;
  dir: 1 | -1;
  t: number;
  speed: number;
}

// o gancho da corda: voando, preso no cavaleiro ou voltando
interface Hook {
  x: number;
  y: number;
  vx: number;
  vy: number;
  d: number;
}

// O Barqueiro: o barqueiro do vale, que levava rio abaixo quem fugia de Vespera com a memória inteira. A
// Casa Vhalor o pegou e cobrou a memória dele; ele continua no lago, empurrando o barco em roda, esperando
// passageiros. De pé no barco estreito (o barco é o corpo dele), a vara comprida solta nas mãos: o jogo
// desenha a vara por cima da folha, no ângulo de cada quadro, e na varrida mira a altura de onde o
// cavaleiro pisa. Acordado: a varrida baixa (pule) e alta (agache; nadando ela passa rente à água:
// mergulhe), a pancada que solta uma onda para cada lado pela linha d'água, e a corda com o gancho, que
// puxa o cavaleiro até a ponta da vara para a estocada (dois golpes na corda arrebentam). O casco afunda
// os troncos por onde passa. Na metade, afunda com o barco: as bolhas seguem o cavaleiro, avisam, e o
// barco sobe por baixo dele; a cachoeira do fundo vira Âmbar e puxa o lago para o pé dela. Vencido, larga
// a vara, senta, a lanterna da proa acende e o barco vem sozinho até o cais.
export class Barqueiro implements BossFoe {
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
  // onde ele para depois de vencido (o casco encostado no cais)
  readonly moorX: number;
  private t = 0;
  private time = 0;
  private thinkT = 0;
  private phase2 = false;
  private flashT = 0;
  private anim = '';
  private last: Attack[] = [];
  private streak = 0;
  // o pé dele (px) e o barco andando (px/s); afundado (px abaixo da linha d'água)
  private x: number;
  private vx = 0;
  private goal: number | null = null;
  private sinkY = 0;
  private sinkFrom = 0;
  private readonly S: number;
  private readonly xMin: number;
  private readonly xMax: number;
  private readonly home: number;
  // onde o cavaleiro pisou por último (a varrida mira na altura disso) e se estava nadando
  private support: 'ground' | 'water' = 'ground';
  private groundY: number;
  // a varrida desta vez: a faixa e a correção do ângulo da vara para passar na altura certa (graus)
  private band: 'lo' | 'hi' = 'lo';
  private aim = 0;
  private waves: Wave[] = [];
  private hook: Hook | null = null;
  private towT = 0;
  // fase 2: quanto falta para afundar de novo (lutando em cima)
  private upT = 0;
  private bubT = 0;
  private poleT = 0;
  private readonly points: Record<string, FramePoints[]> | null;
  private readonly pole: Phaser.GameObjects.Image;
  private readonly fist: Phaser.GameObjects.Image;
  private readonly ripple: Phaser.GameObjects.Image;
  private readonly lamp: Phaser.GameObjects.Image;
  private readonly under: Phaser.GameObjects.Image;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly weed: Phaser.GameObjects.Graphics;
  private readonly spray: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly foam: Phaser.GameObjects.Particles.ParticleEmitter;
  private poleLoose = false;

  constructor(private scene: GameScene, x: number, feetY: number) {
    const L = scene.level;
    this.S = L.waterAt(x, feetY + 8)?.surface ?? feetY + 3;
    // até onde o barco vai: a margem da esquerda e o que fica por cima da água na altura dele (o cais)
    const row0 = Math.floor((this.S - C.bodyH) / TILE);
    const row1 = Math.floor((this.S - 4) / TILE);
    const blocked = (tx: number) => {
      for (let ty = row0; ty <= row1; ty++) {
        const c = L.ch(tx, ty);
        if (c === '-' || isSolid(L.tileAt(tx * TILE + 8, ty * TILE + 8))) return true;
      }
      return false;
    };
    let l = Math.floor(x / TILE);
    while (l > 0 && !blocked(l - 1)) l--;
    let r = Math.floor(x / TILE);
    while (r < L.w - 1 && !blocked(r + 1)) r++;
    this.xMin = l * TILE + BOW + 2;
    this.xMax = (r + 1) * TILE - BOW - 2;
    this.moorX = (r + 1) * TILE - BOW - 3;
    this.x = this.home = Phaser.Math.Clamp(x, this.xMin, this.xMax);
    this.groundY = this.S;
    this.zone = scene.add.zone(this.x, this.S - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    const o = scene.registry.get('barqueiro-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(this.x, this.S, 'barqueiro', 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy));
    this.points = (scene.cache.json.get('barqueiro-meta') as { points?: Record<string, FramePoints[]> } | undefined)?.points ?? null;
    // a vara solta e a mão fechada por cima dela
    this.pole = scene.add.image(this.x, this.S, 'barqueiro-pole').setOrigin(POLE_ORIGIN, 0.5).setDepth(DEPTH.enemy + 0.02);
    this.fist = hd(scene.add.image(this.x, this.S, 'barqueiro-fist').setDepth(DEPTH.enemy + 0.03));
    // o anel de água em volta do casco, a lanterna da proa e a luz de Âmbar subindo por baixo d'água
    this.ripple = scene.add.image(this.x, this.S + 1, 'vale-ripple').setScale(1.3, 1.2).setAlpha(0.5).setDepth(DEPTH.water + 0.2);
    this.lamp = scene.add.image(this.x, this.S, 'glow').setTint(0xffb050).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy + 0.05).setScale(0.55).setAlpha(0);
    this.under = scene.add.image(this.x, this.S + 30, 'glow').setTint(0xffa040).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.water - 0.2).setScale(1.6).setAlpha(0);
    this.g = scene.add.graphics().setDepth(DEPTH.enemy + 0.04);
    this.weed = scene.add.graphics().setDepth(DEPTH.enemy - 0.05);
    this.spray = scene.add.particles(0, 0, 'px', {
      lifespan: { min: 280, max: 650 },
      speedX: { min: -100, max: 100 },
      speedY: { min: -200, max: -70 },
      gravityY: 560,
      scale: { start: 1.3, end: 0.5 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffffff, 0xd9f5ea],
      emitting: false,
    }).setDepth(DEPTH.water + 0.6);
    this.foam = scene.add.particles(0, 0, 'glow', {
      lifespan: { min: 400, max: 900 },
      speedX: { min: -40, max: 40 },
      speedY: { min: -50, max: -10 },
      scale: { start: 0.16, end: 0.45 },
      alpha: { start: 0.45, end: 0 },
      tint: [0xffffff, 0xe6fbf2],
      emitting: false,
    }).setDepth(DEPTH.water + 0.5);
    this.play('sleep');
    this.sync();
  }

  get rect() {
    const y = this.wy;
    return new Phaser.Geom.Rectangle(this.x - 18, y - 92, 36, 101);
  }

  get sleeping() {
    return this.state === 'sleep';
  }

  // a linha d'água embaixo do barco (a base dele, parado)
  get base() {
    return this.S;
  }

  // à vista e de pé no barco (dá para acertar)
  private get present() {
    if (this.state === 'sleep' || this.state === 'wake' || this.state === 'dead' || this.state === 'under' || this.state === 'bubbles') return false;
    return this.sinkY < 40;
  }

  private get speedMul() {
    return this.phase2 ? 0.86 : 1;
  }

  // a linha d'água embaixo dele, com o balanço do barco e o quanto afundou
  private get wy() {
    return this.S + this.sinkY + Math.sin(this.time * 1.4) * 1.2;
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`barqueiro-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  private fp(): FramePoints {
    const pts = this.points?.[this.anim];
    const i = (this.sprite.anims.currentFrame?.index ?? 1) - 1;
    return pts?.[Math.min(i, pts.length - 1)] ?? FALLBACK;
  }

  private at(p: [number, number]) {
    return { x: this.x + this.facing * p[0], y: this.wy + p[1] };
  }

  // a vara agora, no mundo: a mão da frente, o pé e a ponta (null: largou)
  private geo() {
    const f = this.fp();
    if (!f.pole) return null;
    const [ang0, pf, along] = f.pole;
    // a varrida mira: quanto mais de lado a vara está (menos encurtada), mais ela segue a mira
    let ang = ang0;
    if (this.state === 'sweep' && Math.cos(Phaser.Math.DegToRad(ang0)) > 0) ang += this.aim * Phaser.Math.Clamp((pf - 0.35) / 0.5, 0, 1);
    const a = Phaser.Math.DegToRad(ang);
    const dx = Math.cos(a) * this.facing;
    const dy = Math.sin(a);
    const g = this.at(f.grip);
    const bx = g.x - dx * along * pf;
    const by = g.y - dy * along * pf;
    const len = POLE * pf;
    const back = Math.cos(Phaser.Math.DegToRad(ang0)) < -0.2;
    return { gx: g.x, gy: g.y, bx, by, tx: bx + dx * len, ty: by + dy * len, a, pf, back, behind: back || POLE_BEHIND.has(this.anim) };
  }

  // a vara (da mão até a ponta, ou inteira) passa pelo retângulo?
  private poleHits(r: Phaser.Geom.Rectangle, pad: number, fromGrip = true) {
    const v = this.geo();
    if (!v) return false;
    const x0 = fromGrip ? v.gx : v.bx;
    const y0 = fromGrip ? v.gy : v.by;
    const n = Math.max(2, Math.ceil(Math.hypot(v.tx - x0, v.ty - y0) / 5));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((v.tx - x0) * i) / n;
      const y = y0 + ((v.ty - y0) * i) / n;
      if (x > r.x - pad && x < r.right + pad && y > r.y - pad && y < r.bottom + pad) return true;
    }
    return false;
  }

  wake() {
    if (this.state !== 'sleep') return;
    const s = this.scene;
    this.go('wake', 'wake');
    this.face(true);
    s.sfx('creak', 0.9, 0.8);
    s.sfx('splash', 0.4, 0.7);
    // levanta a cabeça, os olhos acendem e a mão pede a passagem
    s.time.delayedCall(700, () => s.thinkOnce('barqueiro:fare', 'Ele estende a mão, a palma para cima. Quer a passagem. Não tenho nada para pagar.'));
  }

  // vira para o cavaleiro (o casco fica no lugar: quem gira é ele em cima do barco)
  private face(force = false) {
    const p = this.scene.player;
    const d = p.x - this.x;
    if (!force && Math.abs(d) < 26) return;
    const want: 1 | -1 = d >= 0 ? 1 : -1;
    if (want === this.facing) return;
    this.x = Phaser.Math.Clamp(this.x + this.facing * (BOW - STERN), this.xMin, this.xMax);
    this.facing = want;
  }

  // ---------- escolha ----------
  private choose(): Attack {
    const p = this.scene.player;
    const dx = Math.abs(p.x - this.x);
    // na água ou de pé num tronco: a onda pega
    const wet = this.support === 'water' || this.groundY > this.S - 16;
    let opts: [Attack, number][];
    if (dx < 66) opts = [['jab', 0.5], ['sweep', 0.5]];
    else if (dx < C.reach) opts = [['sweep', 0.6], ['slam', wet ? 0.4 : 0.08], ['rope', 0.1]];
    else if (dx < C.ropeRange) opts = [['rope', 0.48], ['slam', wet ? 0.42 : 0], ['close', 0.32]];
    else opts = [['close', 0.75], ['rope', 0.25]];
    if (this.last.length >= 2 && this.last[0] === this.last[1]) opts = opts.filter(([a]) => a !== this.last[0]);
    opts = opts.filter(([, w]) => w > 0);
    if (!opts.length) opts = [['close', 1]];
    const total = opts.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [a, w] of opts) {
      r -= w;
      if (r <= 0) return a;
    }
    return opts[0][0];
  }

  private toIdle(extra = 0) {
    this.thinkT = (C.think + Math.random() * 0.3) * this.speedMul + extra;
    this.go('idle', 'idle');
  }

  private startAttack(a: Attack) {
    const s = this.scene;
    const p = s.player;
    this.face(true);
    this.last = [a, ...this.last].slice(0, 2);
    if (a === 'close') {
      // empurra o barco até ficar a um comprimento de vara dele
      const dir = Math.sign(p.x - this.x) || this.facing;
      this.goal = Phaser.Math.Clamp(p.x - dir * C.keep, this.xMin, this.xMax);
      if (Math.abs(this.goal - this.x) < 18) {
        this.goal = null;
        this.startAttack(Math.abs(p.x - this.x) < C.reach ? 'sweep' : 'rope');
        return;
      }
      this.go('pole', 'pole');
      return;
    }
    this.streak++;
    if (a === 'sweep') {
      // nadando, rente à água; de pé, alta ou baixa (agachado não salva da baixa)
      this.band = this.support === 'water' || p.crouched ? 'lo' : Math.random() < 0.55 ? 'hi' : 'lo';
      this.go('sweepwind', `sweepwind-${this.band}`);
      s.sfx('creak', 0.7, 1.1);
      s.sfx('heavy', 0.35, 0.7);
    } else if (a === 'slam') {
      this.go('slamwind', 'slamwind');
      s.sfx('creak', 0.8, 0.9);
    } else if (a === 'rope') {
      this.go('ropewind', 'ropewind');
      this.poleT = 0;
    } else {
      this.jabWind();
    }
  }

  private jabWind() {
    this.go('jabwind', 'jab');
    this.sprite.anims.pause();
    this.scene.sfx('creak', 0.6, 1.3);
  }

  // ---------- quadro a quadro ----------
  update(dt: number) {
    this.time += dt;
    this.trackSupport();
    this.updateWaves(dt);
    if (this.state === 'dead') {
      this.drift(dt);
      this.sync(dt);
      return;
    }
    if (this.state === 'sleep') {
      // esperando passageiro: o barco rodando devagar no lugar
      this.x = Phaser.Math.Clamp(this.home + Math.sin(this.time * 0.35) * 14, this.xMin, this.xMax);
      this.sync(dt);
      return;
    }
    const s = this.scene;
    const p = s.player;
    this.t += dt;
    const dx = p.x - this.x;
    switch (this.state) {
      case 'wake':
        if (this.t > 1.5) this.toIdle(0.2);
        break;
      case 'idle':
        this.face();
        this.thinkT -= dt;
        if (this.thinkT > 0) break;
        // na segunda fase, depois de um tempo em cima, afunda de novo
        if (this.phase2 && this.upT <= 0) {
          this.dive();
          break;
        }
        // muito perto ou já atacou demais do mesmo lugar: sai de perto empurrando o barco
        if ((Math.abs(dx) < 40 && Math.random() < 0.4) || (this.streak >= 3 && Math.random() < 0.6)) {
          this.streak = 0;
          const dir = Math.sign(this.x - p.x) || -this.facing;
          let goal = this.x + dir * (70 + Math.random() * 60);
          if (goal < this.xMin + 10 || goal > this.xMax - 10) goal = this.x - dir * (90 + Math.random() * 60);
          this.goal = Phaser.Math.Clamp(goal, this.xMin, this.xMax);
          this.go('pole', 'pole');
          break;
        }
        this.startAttack(this.choose());
        break;
      case 'pole': {
        this.face();
        const goal = this.goal ?? this.x;
        const d = goal - this.x;
        const want = Math.abs(d) < 6 ? 0 : Math.sign(d) * Math.min(C.pole * (this.phase2 ? 1.2 : 1), Math.abs(d) * 2.4);
        this.vx += Phaser.Math.Clamp(want - this.vx, -C.accel * dt, C.accel * dt);
        // cada empurrão: a vara range e a água bate onde ela entra
        this.poleT -= dt;
        if (this.poleT <= 0) {
          this.poleT = 0.75;
          s.sfx('creak', 0.45, 0.9 + Math.random() * 0.2);
          const v = this.geo();
          if (v) this.splashAt(v.bx + (v.tx - v.bx) * 0.7, 3);
        }
        if (Math.abs(d) < 8 || this.t > 2.4) {
          this.goal = null;
          const near = Math.abs(p.x - this.x);
          if (near < C.ropeRange) this.startAttack(this.choose());
          else this.toIdle(0.1);
        }
        break;
      }
      case 'sweepwind':
        if (this.t > C.sweepWind * this.speedMul) this.sweep();
        break;
      case 'sweep':
        if (this.t > C.sweepActive) this.go('sweeprec', 'sweeprec');
        break;
      case 'sweeprec':
        if (this.t > C.sweepRec * this.speedMul) this.toIdle();
        break;
      case 'slamwind':
        if (this.t > C.slamWind * this.speedMul) {
          this.go('slam', 'slam');
          s.sfx('swoosh', 1, 0.55);
        }
        break;
      case 'slam':
        if (this.t > 0.2) this.impact();
        break;
      case 'slamrec':
        if (this.t > C.slamRec * this.speedMul) this.toIdle();
        break;
      case 'ropewind':
        // a laçada girando por cima da cabeça
        this.poleT -= dt;
        if (this.poleT <= 0) {
          this.poleT = 0.3;
          s.sfx('swoosh', 0.4, 0.7);
        }
        this.face();
        if (this.t > C.ropeWind * this.speedMul) this.throwRope();
        break;
      case 'rope':
        this.flyHook(dt);
        break;
      case 'pull':
        this.towing(dt);
        break;
      case 'ropeback':
        this.reel(dt);
        break;
      case 'jabwind': {
        // trazido pela corda: segue preso na frente dele até a estocada (ainda dá para arrebentar)
        const tw = p.tow;
        if (tw && this.hook) {
          if (tw.cuts >= C.cuts) {
            this.snap();
            break;
          }
          tw.x = this.x + this.facing * 44;
          tw.y = this.wy - 36;
          this.hook.x = p.x;
          this.hook.y = p.body.center.y;
        }
        if (this.t > C.jabWind * this.speedMul) {
          if (tw) p.tow = null;
          this.hook = null;
          this.go('jab');
          this.sprite.anims.resume();
          s.sfx('stab', 1, 0.75);
          s.sfx('swoosh', 0.7, 0.9);
        }
        break;
      }
      case 'jab':
        if (this.t > 0.14) this.go('jabrec');
        break;
      case 'jabrec':
        if (this.t > C.jabRec * this.speedMul) this.toIdle();
        break;
      case 'stagger':
        if (this.t > C.stagger) this.toIdle(0.15);
        break;
      case 'sink':
        this.sinkY = this.sinkFrom + (112 - this.sinkFrom) * Phaser.Math.Easing.Quadratic.In(Math.min(1, this.t / C.sink));
        if (Math.random() < dt * 20) s.bubbles(this.x + (Math.random() - 0.5) * 60, this.S + 10, 2);
        if (this.t > C.sink) {
          this.go('under');
          this.bubT = 0;
        }
        break;
      case 'under': {
        // as bolhas seguem o cavaleiro por baixo d'água
        const tx = Phaser.Math.Clamp(p.x, this.xMin, this.xMax);
        this.x += Phaser.Math.Clamp(tx - this.x, -C.underSpeed * dt, C.underSpeed * dt);
        this.bubbleTrail(dt, 0.12, 2);
        if (this.t > C.under) {
          this.go('bubbles');
          s.sfx('gurgle', 1, 0.9);
        }
        break;
      }
      case 'bubbles':
        // o aviso: a água ferve em cima dele e a luz de Âmbar sobe
        this.bubbleTrail(dt, 0.05, 4);
        s.vale?.rockLogs(this.x, 0.5);
        if (this.t > C.warn) this.surge();
        break;
      case 'surge':
        // sobe passando da linha d'água e assenta
        if (this.t < 0.22) this.sinkY = 112 + (-18 - 112) * Phaser.Math.Easing.Quadratic.Out(this.t / 0.22);
        else this.sinkY = -18 * (1 - Phaser.Math.Easing.Sine.InOut(Math.min(1, (this.t - 0.22) / 0.45)));
        if (this.t > 0.75) {
          this.sinkY = 0;
          this.upT = C.up;
          this.toIdle(0.15);
        }
        break;
    }
    if (this.phase2 && this.state !== 'under' && this.state !== 'bubbles' && this.state !== 'sink' && this.state !== 'surge') this.upT -= dt;
    // o barco desliza na água e para devagar quando ninguém empurra
    if (this.state !== 'pole') this.vx *= Math.pow(0.35, dt);
    if (this.state !== 'under' && this.state !== 'bubbles') this.x += this.vx * dt;
    if (this.x < this.xMin) {
      this.x = this.xMin;
      this.vx = 0;
    } else if (this.x > this.xMax) {
      this.x = this.xMax;
      this.vx = 0;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sync(dt);
  }

  // onde o cavaleiro pisou por último: a varrida mira nessa altura
  private trackSupport() {
    const p = this.scene.player;
    if (p.swim) {
      this.support = 'water';
      this.groundY = this.S;
    } else if (p.onGround) {
      this.support = 'ground';
      this.groundY = p.body.bottom;
    }
  }

  // ---------- varrida ----------
  private sweep() {
    const s = this.scene;
    const p = s.player;
    this.go('sweep', `sweep-${this.band}`);
    // a altura que a vara tem que passar onde ele está
    const y = this.support === 'water' ? this.S - C.swimY : this.groundY - (this.band === 'lo' ? C.lowY : C.highY);
    const pts = this.points?.[`sweep-${this.band}`];
    const end = pts?.[pts.length - 1] ?? FALLBACK;
    const g = this.at(end.grip);
    const dist = Math.max(40, Math.abs(p.x - g.x));
    const want = Phaser.Math.RadToDeg(Math.atan2(y - g.y, dist));
    const art = end.pole?.[0] ?? 0;
    this.aim = Phaser.Math.Clamp(want, -36, 34) - art;
    s.sfx('swoosh', 1, 0.5);
    s.sfx('heavy', 0.6, 0.6);
    // rente à água: a ponta abre um risco de espuma
    if (this.support === 'water' || this.band === 'lo') {
      s.time.delayedCall(140, () => {
        const v = this.state === 'sweep' ? this.geo() : null;
        if (v && Math.abs(v.ty - this.S) < 24) this.splashAt(v.tx, 6);
      });
    }
  }

  // ---------- pancada e onda ----------
  private impact() {
    const s = this.scene;
    this.go('slamrec', 'slamrec');
    // onde a vara entra na água
    const v = this.geo();
    let x = this.x + this.facing * 120;
    if (v && Math.abs(v.ty - v.by) > 1) {
      const k = Phaser.Math.Clamp((this.S - v.by) / (v.ty - v.by), 0, 1);
      x = v.bx + (v.tx - v.bx) * k;
    }
    const lk = s.vale?.lake;
    if (lk) x = Phaser.Math.Clamp(x, lk.x0 + 10, lk.x1 - 10);
    s.sfx('thud', 1.1, 0.6);
    s.sfx('splash', 1, 0.6);
    s.cameras.main.shake(240, 0.007);
    this.splashAt(x, 18);
    for (let i = 0; i < 6; i++) this.foam.explode(1, x + (Math.random() - 0.5) * 30, this.S - 3);
    const speed = C.waveSpeed * (this.phase2 ? 1.15 : 1);
    this.waves.push({ x: x - 8, dir: -1, t: 0, speed }, { x: x + 8, dir: 1, t: 0, speed });
  }

  private updateWaves(dt: number) {
    if (!this.waves.length) return;
    const lk = this.scene.vale?.lake;
    for (const w of this.waves) {
      w.t += dt;
      w.x += w.dir * w.speed * dt;
      // a crista espirra e balança os troncos por onde passa
      if (Math.random() < dt * 22) this.spray.explode(1, w.x + (Math.random() - 0.5) * 10, this.S - 6);
      if (Math.random() < dt * 12) this.foam.explode(1, w.x - w.dir * 8, this.S - 2);
      this.scene.vale?.rockLogs(w.x, 1);
    }
    this.waves = this.waves.filter((w) => w.t < C.waveLife && (!lk || (w.x > lk.x0 + 4 && w.x < lk.x1 - 4)));
  }

  private waveRect(w: Wave) {
    // a altura da onda cai no fim
    const k = 1 - Math.max(0, (w.t - C.waveLife * 0.6) / (C.waveLife * 0.4));
    const h = 8 + 12 * k;
    return new Phaser.Geom.Rectangle(w.x - 13, this.S - h, 26, h + 10);
  }

  // ---------- corda ----------
  private throwRope() {
    const s = this.scene;
    const p = s.player;
    this.go('rope', 'rope');
    const h = this.at(this.fp().rope);
    const tx = p.x + p.body.velocity.x * 0.12;
    const ty = p.body.center.y + Math.min(0, p.body.velocity.y) * 0.05;
    const d = Math.hypot(tx - h.x, ty - h.y) || 1;
    this.hook = { x: h.x, y: h.y, vx: ((tx - h.x) / d) * C.hookSpeed, vy: ((ty - h.y) / d) * C.hookSpeed, d: 0 };
    s.sfx('swoosh', 1, 0.8);
  }

  private flyHook(dt: number) {
    const h = this.hook;
    if (!h) {
      this.toIdle();
      return;
    }
    const s = this.scene;
    const p = s.player;
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    h.d += C.hookSpeed * dt;
    // pegou: o cavaleiro vem rebocado (o dash atravessa; machucado há pouco, o gancho escorrega)
    const pr = p.rect;
    if (!p.dead && !p.ghost && p.invuln <= 0 && h.x > pr.x - 5 && h.x < pr.right + 5 && h.y > pr.y - 5 && h.y < pr.bottom + 5) {
      p.tow = { x: p.x, y: p.body.center.y, speed: C.tow, cuts: 0 };
      this.go('pull', 'pull');
      this.towT = 0;
      s.sfx('rope', 0.9, 0.9);
      s.sfx('hurt', 0.25, 1.4);
      s.thinkOnce('barqueiro:rope', 'O gancho prendeu. Dois golpes na corda e ela arrebenta.');
      return;
    }
    const L = s.level;
    if (h.d > C.ropeRange || isSolid(L.tileAt(h.x, h.y)) || L.ch(Math.floor(h.x / TILE), Math.floor(h.y / TILE)) === '|') {
      if (isSolid(L.tileAt(h.x, h.y))) s.sfx('thunk', 0.5, 1.2);
      this.go('ropeback', 'pull');
    }
  }

  // puxando o cavaleiro até a ponta da vara
  private towing(dt: number) {
    const s = this.scene;
    const p = s.player;
    const t = p.tow;
    this.towT += dt;
    if (!t || p.dead) {
      // soltou (ele apanhou de outra coisa): a corda volta
      this.go('ropeback', 'pull');
      return;
    }
    const h = this.hook!;
    h.x = p.x;
    h.y = p.body.center.y;
    if (t.cuts >= C.cuts) {
      this.snap();
      return;
    }
    t.x = this.x + this.facing * 44;
    t.y = this.wy - 36;
    // chegou na ponta da vara: fica preso na corda enquanto ele prepara a estocada
    if (Math.hypot(t.x - p.x, t.y - p.body.center.y) < 24 || this.towT > 2.4) this.jabWind();
  }

  // arrebentou: dois golpes na corda; ele perde o equilíbrio no barco
  private snap() {
    const s = this.scene;
    s.player.tow = null;
    this.hook = null;
    s.sfx('crack', 0.9, 0.8);
    s.sfx('creak', 0.8, 1.4);
    this.go('stagger', 'stagger');
    this.vx = -this.facing * 40;
  }

  private reel(dt: number) {
    const h = this.hook;
    const r = this.at(this.fp().rope);
    if (!h) {
      this.toIdle(0.1);
      return;
    }
    const dx = r.x - h.x;
    const dy = r.y - h.y;
    const d = Math.hypot(dx, dy);
    const step = 620 * dt;
    if (d <= step) {
      this.hook = null;
      this.toIdle(0.15);
      return;
    }
    h.x += (dx / d) * step;
    h.y += (dy / d) * step;
  }

  // ---------- segunda fase: embaixo d'água ----------
  private dive() {
    const s = this.scene;
    this.hook = null;
    if (s.player.tow) s.player.tow = null;
    this.goal = null;
    this.vx = 0;
    this.sinkFrom = this.sinkY;
    this.go('sink', 'sink');
    s.sfx('gurgle', 1, 0.7);
    s.sfx('creak', 0.9, 0.7);
    this.splashAt(this.x, 10);
  }

  private bubbleTrail(dt: number, every: number, n: number) {
    const s = this.scene;
    this.bubT -= dt;
    if (this.bubT > 0) return;
    this.bubT = every;
    s.bubbles(this.x + (Math.random() - 0.5) * 26, this.S + 14, n);
    if (Math.random() < 0.5) this.foam.explode(1, this.x + (Math.random() - 0.5) * 30, this.S - 2);
  }

  private surge() {
    const s = this.scene;
    this.go('surge', 'surge');
    s.sfx('leap', 1.2, 0.55);
    s.sfx('splash', 1, 0.5);
    s.sfx('creak', 1, 0.6);
    s.cameras.main.shake(300, 0.009);
    this.splashAt(this.x, 26);
    for (let i = 0; i < 10; i++) this.foam.explode(1, this.x + (Math.random() - 0.5) * 70, this.S - 3);
    s.vale?.rockLogs(this.x, 2);
    const speed = C.waveSpeed * 0.9;
    this.waves.push({ x: this.x - BOW, dir: -1, t: 0.5, speed }, { x: this.x + BOW, dir: 1, t: 0.5, speed });
  }

  private surgeRect() {
    return new Phaser.Geom.Rectangle(this.x - C.surgeW, this.S - 110, C.surgeW * 2, 150);
  }

  private splashAt(x: number, n: number) {
    this.spray.explode(n, x, this.S - 1);
    this.scene.bubbles(x, this.S + 8, Math.ceil(n / 4));
  }

  // ---------- desenho ----------
  private sync(dt = 0) {
    const s = this.scene;
    const y = this.wy;
    const hidden = this.state === 'under' || this.state === 'bubbles';
    this.zone.setPosition(this.x, y - C.bodyH / 2);
    this.body.reset(this.x, y - C.bodyH / 2);
    this.sprite.setVisible(!hidden).setPosition(Math.round(this.x), Math.round(y));
    face(this.sprite, this.facing < 0);
    // o anel na água em volta do casco (no meio do barco, não dos pés dele)
    const mid = this.x + (this.facing * (BOW - STERN)) / 2;
    const afloat = !hidden && this.sinkY < 30;
    this.ripple.setPosition(hidden ? this.x : mid, this.S + 1).setScale(hidden ? 0.5 : 1.3, hidden ? 0.8 : 1.2)
      .setAlpha(hidden ? 0.5 + 0.2 * Math.sin(this.time * 9) : afloat ? 0.35 + 0.12 * Math.sin(this.time * 2) + Math.min(0.3, Math.abs(this.vx) / 200) : 0);
    // o casco por cima dos troncos afunda eles
    if (afloat && this.state !== 'dead') s.vale?.pressLogs(mid - (BOW + STERN) / 2, mid + (BOW + STERN) / 2);
    // a proa abre espuma andando
    if (afloat && Math.abs(this.vx) > 30 && Math.random() < dt * 14) this.foam.explode(1, this.x + Math.sign(this.vx) * (this.facing === Math.sign(this.vx) ? BOW : STERN), this.S - 2);
    // a luz de Âmbar subindo por baixo antes de ele sair
    const glowA = this.state === 'bubbles' ? Math.min(1, this.t / C.warn) * 0.75 : this.state === 'under' ? 0.12 : 0;
    this.under.setPosition(this.x, this.S + 26 - (this.state === 'bubbles' ? this.t * 16 : 0)).setAlpha(glowA * (0.85 + 0.15 * Math.sin(this.time * 14)));
    this.drawPole(hidden);
    this.drawWeed(hidden);
    this.drawRope();
    this.drawWaves();
    // a lanterna da proa: apagada até ele sentar, vencido
    const lp = this.at(this.fp().lamp);
    this.lamp.setPosition(lp.x, lp.y + 2);
  }

  private drawPole(hidden: boolean) {
    if (this.poleLoose) return;
    const v = hidden ? null : this.geo();
    if (!v) {
      this.pole.setVisible(false);
      this.fist.setVisible(false);
      return;
    }
    const k = hdScale(this.scene, 'barqueiro-pole');
    const rot = Math.atan2(Math.sin(v.a), Math.cos(v.a) * this.facing);
    this.pole.setVisible(true).setPosition(v.bx, v.by).setRotation(rot).setScale(v.pf * k, k).setFlipY(this.facing < 0)
      .setDepth(v.behind ? DEPTH.enemy - 0.02 : DEPTH.enemy + 0.02);
    this.fist.setVisible(!v.back).setPosition(v.gx, v.gy).setRotation(rot).setFlipY(this.facing < 0);
  }

  // as algas do fundo: fios finos balançando na água, puxados para trás quando o barco anda
  private drawWeed(hidden: boolean) {
    const g = this.weed;
    g.clear();
    if (hidden) return;
    const y0 = this.wy;
    const drag = Phaser.Math.Clamp(-this.vx * 0.05, -6, 6);
    WEED.forEach(([lx, root, len], i) => {
      let px = this.x + this.facing * lx;
      let py = y0 + root;
      const n = 5;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const x = this.x + this.facing * (lx - 3 * t) + (Math.sin(this.time * 1.7 + i * 1.9 + t * 2.4) * 1.8 + drag) * t;
        const y = y0 + root + len * t * (1 - Math.abs(drag) * 0.02);
        g.lineStyle(1.7 - t, i % 3 === 1 ? 0x24402b : 0x1a3020, 0.9);
        g.lineBetween(px, py, x, y);
        if (i % 2 === 0 && k < n) g.lineStyle(0.6, 0x4f7f58, 0.55).lineBetween(px + 0.4, py, x + 0.4, y);
        px = x;
        py = y;
      }
    });
  }

  private drawRope() {
    const g = this.g;
    g.clear();
    if (this.state === 'dead') return;
    const hand = this.at(this.fp().rope);
    if (this.state === 'ropewind') {
      // a laçada girando por cima da cabeça, com o gancho na ponta
      const a = this.time * 15;
      const hx = hand.x + Math.cos(a) * 15;
      const hy = hand.y - 6 + Math.sin(a) * 6;
      this.ropeLine(hand.x, hand.y, hx, hy, 3);
      this.hookAt(hx, hy, a);
      return;
    }
    const h = this.hook;
    if (!h) return;
    const taut = this.state === 'pull' || this.state === 'jabwind';
    this.ropeLine(hand.x, hand.y, h.x, h.y, taut ? 0 : 10 + Math.hypot(h.x - hand.x, h.y - hand.y) * 0.06);
    if (!taut) this.hookAt(h.x, h.y, Math.atan2(h.vy, h.vx));
  }

  private ropeLine(x0: number, y0: number, x1: number, y1: number, sag: number) {
    const g = this.g;
    const n = 14;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      pts.push({ x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * sag });
    }
    g.lineStyle(2.2, 0x2b2113, 1).strokePoints(pts);
    g.lineStyle(1, 0x8a7349, 1).strokePoints(pts);
  }

  private hookAt(x: number, y: number, a: number) {
    const g = this.g;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    g.lineStyle(1.6, 0x24262c, 1);
    g.beginPath();
    g.moveTo(x - c * 4, y - sn * 4);
    g.lineTo(x + c * 3, y + sn * 3);
    g.strokePath();
    g.beginPath();
    g.arc(x + c * 1 - sn * 2.2, y + sn * 1 + c * 2.2, 2.4, a - Math.PI / 2, a + Math.PI * 0.8, false);
    g.strokePath();
    g.fillStyle(0x777c87, 1).fillRect(x + c * 3 - 0.5, y + sn * 3 - 0.5, 1, 1);
  }

  private drawWaves() {
    const g = this.g;
    for (const w of this.waves) {
      const r = this.waveRect(w);
      const h = r.height - 10;
      // o perfil da onda: a frente mais em pé (para onde ela corre) e as costas compridas
      const pts: { x: number; y: number }[] = [];
      for (let i = -34; i <= 34; i += 2) {
        const u = i * w.dir;
        const sg = u > 0 ? 8 : 15;
        pts.push({ x: w.x + i, y: this.S - h * Math.exp(-(u * u) / (2 * sg * sg)) });
      }
      g.fillStyle(0x5aa896, 0.96);
      g.beginPath();
      g.moveTo(pts[0].x, this.S + 3);
      for (const q of pts) g.lineTo(q.x, q.y);
      g.lineTo(pts[pts.length - 1].x, this.S + 3);
      g.closePath();
      g.fillPath();
      // a luz nas costas da onda e a espuma na crista
      g.lineStyle(1, 0xa8e2d2, 0.85).strokePoints(pts.filter((q) => (q.x - w.x) * w.dir < -2 && (q.x - w.x) * w.dir > -26));
      g.lineStyle(2, 0xf4fffb, 0.95).strokePoints(pts.filter((q) => Math.abs(q.x - w.x - w.dir * 2) < 7));
    }
  }

  // vencido: o barco vem sozinho até o cais e a vara boia para longe
  private drift(dt: number) {
    if (this.sinkY !== 0) this.sinkY += (0 - this.sinkY) * Math.min(1, dt * 3);
    if (Math.abs(this.sinkY) < 0.3) this.sinkY = 0;
  }

  // ---------- dano ----------
  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    this.harmFrom = undefined;
    const from = (x: number) => {
      this.harmFrom = x;
      return true;
    };
    for (const w of this.waves) if (overlap(pr, this.waveRect(w))) return from(w.x - w.dir * 12);
    const ch = this.scene.vale?.churn();
    if (ch && overlap(pr, ch)) return from(ch.centerX);
    if (this.state === 'surge' && this.t < 0.34 && overlap(pr, this.surgeRect())) return from(this.x);
    if (!this.present) return false;
    if (this.state === 'sweep') {
      const v = this.geo();
      if (v && v.pf > 0.45 && this.poleHits(pr, 3)) return from(this.x);
    }
    if ((this.state === 'slam' || this.state === 'jab') && this.poleHits(pr, 4)) return from(this.x);
    if (sliding || this.state === 'stagger') return false;
    const man = new Phaser.Geom.Rectangle(this.x - 13, this.wy - 90, 26, 74);
    return overlap(pr, man);
  }

  // aparar: a estocada no fim da preparação ou saindo, e a vara da varrida chegando, sempre pela frente
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive || !this.present) return false;
    const jab = (this.state === 'jabwind' && this.t > C.jabWind * this.speedMul - PARRY.early) || (this.state === 'jab' && this.t < 0.08);
    const sweep = this.state === 'sweep' && this.t < 0.12;
    if (!jab && !sweep) return false;
    if ((Math.sign(fromX - this.x) || this.facing) !== this.facing) return false;
    if (!this.poleHits(box, 4) && !(jab && overlap(box, this.rect))) return false;
    this.go('stagger', 'stagger');
    this.vx = -this.facing * 60;
    return true;
  }

  private flash() {
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
  }

  hit(_fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive || !this.present) return 'ignored';
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    this.hp -= dmg;
    this.flash();
    this.spray.explode(4, this.x, this.wy - 50);
    if (!this.phase2 && this.hp <= this.maxHp * C.phase2 && this.hp > 0) {
      this.phase2 = true;
      const s = this.scene;
      this.waves = [];
      s.vale?.amber(1);
      s.vale?.setPull(C.pull);
      s.cameras.main.shake(700, 0.004);
      s.thinkOnce('barqueiro:sink', 'Afundou com o barco. A cachoeira do fundo ficou cor de Âmbar e o lago corre para ela.');
      this.dive();
    }
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  private die() {
    const s = this.scene;
    this.alive = false;
    this.hp = 0;
    this.go('dead');
    this.waves = [];
    this.hook = null;
    if (s.player.tow) s.player.tow = null;
    this.body.enable = false;
    s.time.delayedCall(80, () => this.sprite.clearTint());
    // vira para o cais e senta; a vara escapa
    if (this.facing < 0) {
      this.x = Phaser.Math.Clamp(this.x - (BOW - STERN), this.xMin, this.xMax);
      this.facing = 1;
    }
    this.vx = 0;
    this.anim = 'death';
    this.sprite.setVisible(true).play('barqueiro-death');
    s.deathBurst(this.x, this.wy - 50);
    s.sfx('creak', 1, 0.6);
    s.sfx('splash', 0.8, 0.6);
    s.hitstop(0.25);
    s.cameras.main.flash(300, 255, 236, 210);
    s.cameras.main.shake(500, 0.006);
    s.vale?.amber(0);
    s.vale?.setPull(0);
    s.time.delayedCall(260, () => this.dropPole());
    // a lanterna da proa acende quando ele senta
    s.time.delayedCall(700, () => {
      s.sfx('lantern', 0.7, 0.8);
      s.tweens.add({ targets: this.lamp, alpha: 0.9, duration: 900 });
    });
    // o barco vem sozinho até o cais
    const dur = Phaser.Math.Clamp(Math.abs(this.moorX - this.x) / 85, 1.2, 4.2) * 1000;
    s.time.delayedCall(1100, () => s.tweens.add({ targets: this, x: this.moorX, duration: dur, ease: 'Sine.easeInOut', onUpdate: () => this.sync() }));
    if (s.once('barqueiro:words')) s.time.delayedCall(1800, () => ui.say('O Barqueiro', 'Ela pagou as duas passagens.', 5600));
    this.onDefeat?.();
  }

  // a vara larga das mãos, cai deitada na água e vai boiando para longe
  private dropPole() {
    const s = this.scene;
    const v = this.geo() ?? { bx: this.x - 60, by: this.S - 40, a: 0 };
    this.poleLoose = true;
    this.fist.setVisible(false);
    const k = hdScale(s, 'barqueiro-pole');
    this.pole.setVisible(true).setFlipY(false).setScale(k, k).setDepth(DEPTH.enemy - 0.4);
    const x0 = Math.min(v.bx, this.x - 70);
    s.tweens.add({ targets: this.pole, x: x0 - 10, y: this.S - 1, rotation: 0.03, duration: 700, ease: 'Quad.easeIn', onComplete: () => {
      this.splashAt(x0 + 60, 12);
      s.sfx('splash', 0.7, 0.8);
      s.tweens.add({ targets: this.pole, x: x0 - 70, duration: 9000, ease: 'Sine.easeOut' });
      s.tweens.add({ targets: this.pole, y: this.S + 1, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } });
  }

  destroy() {
    this.pole.destroy();
    this.fist.destroy();
    this.ripple.destroy();
    this.lamp.destroy();
    this.under.destroy();
    this.g.destroy();
    this.weed.destroy();
    this.spray.destroy();
    this.foam.destroy();
    this.scene.player.tow = null;
  }
}

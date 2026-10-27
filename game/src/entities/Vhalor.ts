import Phaser from 'phaser';
import { PAL, PARRY, TILE, VHALOR as C } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { ThroneHall } from '../world/Torres';
import { DEPTH } from '../world/Decor';
import { PLANK_H } from '../gfx/textures';
import { overlap, type BossFoe, type HitDir, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';
import { canvasRaster, mix } from '../gfx/raster';
import { ui } from '../ui/ui';

type State =
  | 'sleep' | 'wake' | 'idle'
  | 'lashwind' | 'lash'
  | 'sweepwind' | 'sweep'
  | 'runewind' | 'rune'
  | 'summon'
  | 'boltaim' | 'boltlock' | 'bolt'
  | 'bashwind' | 'bash' | 'bashrec'
  | 'stagger'
  | 'rise' | 'cage' | 'fallwarn' | 'fall'
  | 'dead';

type Attack = 'lash' | 'sweep' | 'rune' | 'summon' | 'bolt' | 'bash' | 'cage';

// pontos de cada quadro (art/vhalor.py points), em px do mundo a partir dos pés, para quem olha para a
// direita: a cabeça do Cetro (null: largou), o meio da coroa, o olho e os dois pontos das costas de onde os
// cabos sobem para os bocais do encosto
interface FramePoints {
  crown: [number, number];
  eye: [number, number];
  cabos: [number, number][];
  cetro: [number, number] | null;
}

const FALLBACK: FramePoints = { crown: [-14, -65], eye: [-13, -59], cabos: [[-23, -52], [-25, -50]], cetro: [-7, -46] };

// o assento do trono, para trás dos pés (px): o pistão sobe embaixo do meio dele; os dois cabos de baixo
// do assento entram no estrado na frente dele
const SEAT: [number, number] = [6, 32];
const FLOOR_CABLES = [3.5, 9];
const PISTON_W = 22;
// a caixa do corpo (px a partir dos pés, para trás) e a altura
const BODY: [number, number] = [-6, 30];
const BODY_H = 62;

const BRZ = [0x2e1f10, 0x4a3015, 0x7a5a2e, 0xb98a3e, 0xe4bd72];

// um cabo descendo da calha do teto: aviso (o bocal acende), descendo, no chão, voltando
interface Lash {
  x: number;
  t: number;
  warn: number;
  stage: 0 | 1 | 2 | 3;
  len: number;
  glow: Phaser.GameObjects.Image;
  pulse: Phaser.GameObjects.Image;
}

// o cabo do chão varrendo: sai da grade (ou de baixo do assento), a ponta corre rente ao chão e volta
interface Whip {
  x0: number;
  y: number;
  head: number;
  end: number;
  back: boolean;
}

// uma runa do chão acesa: o número dela na sala, o tempo, quando explode
interface Burst {
  i: number;
  t: number;
  warn: number;
}

// um pilar de cabo da segunda fase: desce da calha e corre por ela na direção do outro
interface Pillar {
  x: number;
  dir: 1 | -1;
  drop: number;
  back: boolean;
}

// a onda que corre pelo chão depois que o trono cai
interface Wave {
  x: number;
  y: number;
  dir: 1 | -1;
  t: number;
  lo: number;
  hi: number;
  glow: Phaser.GameObjects.Image;
}

// pedra que solta em volta da calha quando o trono cai (a sombra no chão avisa)
interface Rock {
  x: number;
  y: number;
  vy: number;
  t: number;
  land: number;
  falling: boolean;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  done: boolean;
}

// O Senhor de Vhalor: o chefe da Casa Vhalor, que pediu a Coroação. Na noite ele estava no trono, esperando
// o núcleo ligar; o Eclipse fez crescer nele o Âmbar dos cabos que ligavam o trono ao núcleo, e ele ficou
// preso ali. Não levanta: luta com os cabos. De longe, o cabo desce da calha de bronze do teto em cima do
// cavaleiro (a luz corre pela calha e o bocal acende antes), o cabo de baixo do estrado sai da grade e varre
// o chão (pule a ponta), as runas embutidas no chão acendem e explodem em colunas de luz (fique nas
// apagadas) e ele chama os ecos de dois guardas. Perto, no estrado, a pancada do Cetro (dá para aparar). Na
// metade, o pistão do estrado ergue o trono: lá de cima os cabos descem como pilares que correm pela calha
// um contra o outro (passe por dentro de um com o dash) e depois o trono cai, sacudindo a sala: a onda corre
// pelo estrado e pelo chão e soltam pedras em volta da calha. Vencido, o Âmbar toma o corpo inteiro, a
// estátua se desfaz em pó e o trono fica vazio, com a coroa no assento.
export class Vhalor implements BossFoe {
  readonly kind = 'boss' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly maxHp = C.hp;
  hp = C.hp;
  alive = true;
  readonly facing: 1 | -1;
  state: State = 'sleep';
  onDefeat: (() => void) | null = null;
  harmFrom: number | undefined;
  private t = 0;
  private time = 0;
  private thinkT = 0;
  private flashT = 0;
  private anim = '';
  private phase2 = false;
  private last: Attack[] = [];
  // os pés dele e o chão do estrado; quanto o pistão ergueu o trono (px)
  private readonly x: number;
  private readonly y0: number;
  private lift = 0;
  private liftFrom = 0;
  // na segunda fase: quanto falta para subir de novo, quanto falta lá em cima, se o cerco já veio nesta subida
  private groundT = 0;
  private hangT = 0;
  private caged = false;
  // quanto os cabos estão acesos (sobe no comando) e quando ele chamou os ecos pela última vez
  private lit = 0;
  private echoT = -99;
  private lashes: Lash[] = [];
  private whip: Whip | null = null;
  private bursts: Burst[] = [];
  private pillars: Pillar[] = [];
  private waves: Wave[] = [];
  private rocks: Rock[] = [];
  private runeSet = 0;
  private shake = 0;
  // a runa do Cetro apontada: para onde a mira olha e até onde o feixe vai (a primeira pedra ou tábua)
  private aimDir = { x: -1, y: 0 };
  private aimEnd = { x: 0, y: 0 };
  // morto: quanto tempo desde a queda e se a estátua já se desfez
  private deadT = 0;
  private crumbled = false;
  private readonly hall: ThroneHall;
  private readonly points: Record<string, FramePoints[]> | null;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly ga: Phaser.GameObjects.Graphics;
  private readonly gb: Phaser.GameObjects.Graphics;
  private readonly gp: Phaser.GameObjects.Graphics;
  private readonly cetroGlow: Phaser.GameObjects.Image;
  private readonly glyphs: Phaser.GameObjects.Image[];
  private readonly aimLine: Phaser.GameObjects.Image;
  private readonly beam: Phaser.GameObjects.Image;
  private readonly beamHalo: Phaser.GameObjects.Image;
  private readonly beamSpot: Phaser.GameObjects.Image;
  private readonly amberDust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly steam: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.hall = scene.torres?.throne ?? Vhalor.fallbackHall(scene, x, feetY);
    this.x = x;
    this.y0 = feetY;
    this.facing = this.hall.wallX > x ? -1 : 1;
    this.zone = scene.add.zone(x, feetY - BODY_H / 2, BODY[1] - BODY[0], BODY_H);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    const o = scene.registry.get('vhalor-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'vhalor', 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy));
    face(this.sprite, this.facing < 0);
    this.points = (scene.cache.json.get('vhalor-meta') as { points?: Record<string, FramePoints[]> } | undefined)?.points ?? null;
    this.gb = scene.add.graphics().setDepth(DEPTH.enemy - 0.1);
    this.gp = scene.add.graphics().setDepth(DEPTH.enemy - 0.05);
    this.g = scene.add.graphics().setDepth(DEPTH.enemy + 0.2);
    this.ga = scene.add.graphics().setDepth(DEPTH.enemy + 0.25).setBlendMode(Phaser.BlendModes.ADD);
    this.cetroGlow = scene.add.image(x, feetY - 46, 'glow').setTint(0xffb050).setBlendMode(Phaser.BlendModes.ADD).setScale(0.4).setAlpha(0).setDepth(DEPTH.enemy + 0.1);
    // o desenho da runa subindo da pedra quando ela acende (o mesmo das pedras rúnicas das Torres)
    this.glyphs = this.hall.runes.map((r, i) => scene.add.image(r.x, r.y - 16, scene.textures.exists(`rune-glyph-${i % 4}`) ? `rune-glyph-${i % 4}` : 'glow')
      .setBlendMode(Phaser.BlendModes.ADD).setScale(1.4).setAlpha(0).setDepth(DEPTH.enemy + 0.26));
    const shaft = () => scene.add.image(x, feetY, 'shaft').setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd27a).setAlpha(0).setDepth(DEPTH.enemy + 0.27);
    this.aimLine = shaft();
    this.beamHalo = shaft().setDepth(DEPTH.enemy + 0.26);
    this.beam = shaft();
    this.beamSpot = scene.add.image(x, feetY, 'glow').setTint(0xffd98a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(DEPTH.enemy + 0.27);
    this.amberDust = scene.add.particles(0, 0, 'px', {
      lifespan: { min: 700, max: 1500 },
      speedX: { min: -40, max: 40 },
      speedY: { min: -60, max: 10 },
      gravityY: 160,
      scale: { start: 1.2, end: 0.4 },
      alpha: { start: 1, end: 0 },
      tint: [0xffc46a, 0xd27a26, 0xffe6a6, 0x9a4c12],
      emitting: false,
    }).setDepth(DEPTH.enemy + 0.3);
    this.steam = scene.add.particles(0, 0, 'glow', {
      lifespan: { min: 500, max: 1000 },
      speedX: { min: -50, max: 50 },
      speedY: { min: -40, max: -10 },
      scale: { start: 0.2, end: 0.6 },
      alpha: { start: 0.45, end: 0 },
      tint: [0xe8e4dc, 0xcfc8bc],
      emitting: false,
    }).setDepth(DEPTH.enemy - 0.04);
    Vhalor.textures(scene);
    this.play('sleep');
    this.sync();
  }

  // sem o salão das Torres (não acontece no jogo, só por segurança): o chão é o dos pés dele
  private static fallbackHall(scene: GameScene, x: number, y: number): ThroneHall {
    const glow = scene.add.tileSprite(0, 0, 1, 1, 'px').setVisible(false);
    return {
      floorY: y, daisY: y, daisX: x - 200, wallX: x + 38, ceilY: y - 300,
      rail: { x0: x - 600, x1: x - 220, y: y - 300 }, railGlow: glow, anchors: [], grate: { x: x - 200, y }, runes: [], lustre: null,
    };
  }

  // a pedra que solta em volta da calha
  private static textures(scene: Phaser.Scene) {
    if (scene.textures.exists('torres-rock')) return;
    const { canvas, r, commit } = canvasRaster(14, 12);
    r.poly([[2, 3], [6, 0], [12, 2], [14, 7], [10, 12], [3, 11], [0, 7]], 0x2c2f3a);
    r.poly([[2, 3], [6, 0], [9, 1], [5, 4], [2, 7]], 0x454a58);
    r.poly([[10, 12], [14, 7], [12, 9], [8, 11]], 0x1f2129);
    r.set(6, 2, 0x5c6272);
    r.outline(0x0c0d12);
    commit();
    scene.textures.addCanvas('torres-rock', canvas);
  }

  get rect() {
    const y = this.y;
    const a = this.x + this.facing * -BODY[0];
    const b = this.x - this.facing * BODY[1];
    return new Phaser.Geom.Rectangle(Math.min(a, b), y - BODY_H - 4, Math.abs(b - a), BODY_H);
  }

  get sleeping() {
    return this.state === 'sleep';
  }

  // o estrado: vencido lá em cima, o trono desce até ele antes da memória sair
  get restY() {
    return this.y0;
  }

  // o chão embaixo do trono agora (os pés dele)
  private get y() {
    return this.y0 - this.lift;
  }

  // dá para acertar (acordado e ainda inteiro)
  private get present() {
    return this.state !== 'sleep' && this.state !== 'wake' && this.state !== 'dead';
  }

  private get speedMul() {
    return this.phase2 ? 0.85 : 1;
  }

  // quanto o cavaleiro está na frente dele (px; negativo: atrás)
  private front(px: number) {
    return (px - this.x) * this.facing;
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`vhalor-${name}`);
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
    return { x: this.x + this.facing * p[0], y: this.y + p[1] };
  }

  wake() {
    if (this.state !== 'sleep') return;
    const s = this.scene;
    this.go('wake', 'wake');
    s.sfx('creak', 0.8, 0.6);
    s.time.delayedCall(260, () => s.sfx('bell', 0.35, 0.5));
    // o Cetro bate uma vez no estrado: as runas do chão piscam e a calha acende
    s.time.delayedCall(560, () => {
      if (!this.alive) return;
      s.sfx('thud', 0.7, 0.7);
      s.cameras.main.shake(160, 0.004);
      for (const r of this.hall.runes) r.line.setAlpha(0.8);
      s.tweens.add({ targets: this.hall.runes.map((r) => r.line), alpha: 0, duration: 900, ease: 'Sine.easeOut' });
    });
    s.time.delayedCall(900, () => s.thinkOnce('vhalor:wake', 'Ele levantou a cabeça. A coroa acendeu, e os cabos do teto acenderam junto.'));
  }

  // ---------- escolha ----------
  private onDais() {
    return this.scene.player.x >= this.hall.daisX - 4;
  }

  private echoesAlive() {
    return this.scene.enemies.some((e) => e.kind === 'echo' && e.alive);
  }

  private choose(): Attack {
    const p = this.scene.player;
    const dais = this.onDais();
    const near = dais && this.front(p.x) < C.bashRange && this.front(p.x) > -10 && Math.abs(p.body.bottom - this.y) < 48;
    // no alto, na frente dele (no lustre): só a runa do Cetro alcança
    const high = dais && p.body.bottom < this.y0 - 30 && this.front(p.x) > 20;
    let opts: [Attack, number][];
    if (this.lift > 0) opts = dais ? (high ? [['bolt', 0.75], ['rune', 0.25]] : [['rune', 0.75], ['bolt', 0.25]]) : [['cage', this.caged ? 0 : 0.7], ['lash', 0.45], ['rune', 0.3]];
    else if (high) opts = [['bolt', 0.8], ['rune', 0.2]];
    else if (near) opts = [['bash', 0.72], ['rune', 0.16], ['sweep', 0.12]];
    else if (dais) opts = [['sweep', 0.45], ['rune', 0.4], ['bolt', 0.15]];
    else {
      const echo = this.time - this.echoT > C.echoCd && !this.echoesAlive() && this.hp < this.maxHp * 0.85;
      opts = [['lash', 0.38], ['sweep', 0.24], ['rune', 0.2], ['bolt', 0.12], ['summon', echo ? 0.3 : 0]];
    }
    if (this.last.length >= 2 && this.last[0] === this.last[1]) opts = opts.filter(([a]) => a !== this.last[0]);
    opts = opts.filter(([, w]) => w > 0);
    if (!opts.length) opts = [[dais ? 'rune' : 'lash', 1]];
    const total = opts.reduce((n, [, w]) => n + w, 0);
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
    this.last = [a, ...this.last].slice(0, 2);
    switch (a) {
      case 'lash': {
        // de cima: um cabo, dois depois de um quarto da vida, três lá do alto
        const n = this.lift > 0 ? 3 : this.phase2 || this.hp < this.maxHp * 0.75 ? 2 : 1;
        this.go('lashwind', 'lashwind');
        for (let i = 0; i < n; i++) this.queueLash(C.lashWind * this.speedMul + i * C.lashGap);
        s.sfx('creak', 0.6, 1.2);
        break;
      }
      case 'sweep':
        this.go('sweepwind', 'sweepwind');
        s.sfx('creak', 0.7, 0.8);
        s.sfx('rope', 0.4, 0.8);
        break;
      case 'rune':
        this.go('runewind', 'runewind');
        s.sfx('chime', 0.25, 0.6);
        break;
      case 'summon':
        this.go('summon', 'summon');
        this.echoT = this.time;
        s.sfx('bell', 0.4, 0.7);
        s.sfx('ghost', 0.4, 0.8);
        break;
      case 'bolt': {
        // aponta o Cetro: a mira sai da cabeça dele já na direção do cavaleiro
        this.go('boltaim', 'summon');
        const h = this.boltHead();
        const d = Math.hypot(s.player.x - h.x, s.player.body.center.y - h.y) || 1;
        this.aimDir = this.forward({ x: (s.player.x - h.x) / d, y: (s.player.body.center.y - h.y) / d });
        this.aimPose();
        s.sfx('chime', 0.3, 1.2);
        break;
      }
      case 'bash':
        this.go('bashwind', 'bashwind');
        s.sfx('creak', 0.6, 1.4);
        s.sfx('swoosh', 0.3, 0.5);
        break;
      case 'cage':
        this.cage();
        break;
    }
  }

  // ---------- quadro a quadro ----------
  update(dt: number) {
    this.time += dt;
    this.updateHazards(dt);
    if (this.state === 'dead') {
      this.updateDead(dt);
      this.sync(dt);
      return;
    }
    if (this.state === 'sleep') {
      this.sync(dt);
      return;
    }
    const s = this.scene;
    this.t += dt;
    if (this.phase2 && this.lift === 0 && this.state !== 'fall') this.groundT -= dt;
    if (this.lift > 0 && this.state !== 'rise' && this.state !== 'fallwarn' && this.state !== 'fall') this.hangT -= dt;
    switch (this.state) {
      case 'wake':
        if (this.t > 1.6) this.toIdle(0.2);
        break;
      case 'idle':
        this.thinkT -= dt;
        if (this.thinkT > 0) break;
        // na segunda fase: sobe no pistão; lá em cima, depois de um tempo, cai
        if (this.phase2 && this.lift === 0 && this.groundT <= 0) {
          this.rise();
          break;
        }
        if (this.lift > 0 && this.hangT <= 0) {
          this.go('fallwarn', 'grip');
          s.sfx('smoke', 0.8, 0.6);
          s.sfx('creak', 0.8, 0.5);
          break;
        }
        this.startAttack(this.choose());
        break;
      case 'lashwind':
        // a sequência corre sozinha (Lash); o gesto do Cetro desce quando o primeiro cabo cai
        if (this.lashes.some((l) => l.stage > 0)) this.go('lash', 'lash');
        break;
      case 'lash':
        if (!this.lashes.length) this.toIdle();
        break;
      case 'sweepwind':
        if (this.t > C.sweepWind * this.speedMul) this.sweep();
        break;
      case 'sweep':
        if (!this.whip && this.t > 0.2) this.toIdle(C.sweepRec * this.speedMul - C.think);
        break;
      case 'runewind':
        if (this.t > C.runeWind * this.speedMul) this.runes();
        break;
      case 'rune':
        if (this.t > 0.5) this.toIdle(this.phase2 ? 0.6 : 0.2);
        break;
      case 'summon':
        if (this.t > 0.55 && this.t - dt <= 0.55) this.summon();
        if (this.t > 1.2) this.toIdle(0.3);
        break;
      case 'boltaim':
        this.aim(dt);
        if (this.t > C.boltAim * this.speedMul) {
          this.go('boltlock');
          s.sfx('chime', 0.4, 1.8);
        }
        break;
      case 'boltlock':
        if (this.t > C.boltLock) {
          this.go('bolt');
          s.sfx('beam', 0.9, 0.75);
          s.cameras.main.shake(100, 0.003);
        }
        break;
      case 'bolt':
        if (this.t > C.boltFire) this.toIdle(0.15);
        break;
      case 'bashwind':
        if (this.t > C.bashWind * this.speedMul) {
          this.go('bash', 'bash');
          s.sfx('swoosh', 1, 0.6);
          s.sfx('heavy', 0.8, 0.7);
        }
        break;
      case 'bash':
        if (this.t > 0.14 && this.t - dt <= 0.14) this.bashImpact();
        if (this.t > C.bashActive + 0.06) this.go('bashrec');
        break;
      case 'bashrec':
        if (this.t > C.bashRec * this.speedMul) this.toIdle(-0.2);
        break;
      case 'stagger':
        if (this.t > C.stagger) this.toIdle(0.1);
        break;
      case 'rise': {
        const k = Math.min(1, this.t / C.rise);
        this.lift = C.lift * Phaser.Math.Easing.Sine.InOut(k);
        if (Math.random() < dt * 14) this.steam.explode(1, this.pistonX + (Math.random() - 0.5) * 30, this.y0 - 2);
        if (k >= 1) {
          this.lift = C.lift;
          this.hangT = C.hang;
          this.caged = false;
          s.sfx('clang', 0.7, 0.6);
          this.toIdle(-0.2);
        }
        break;
      }
      case 'cage':
        if (!this.pillars.length && this.t > 0.4) this.toIdle(0.2);
        break;
      case 'fallwarn':
        // o pistão chia e o trono treme antes de cair
        this.shake = 1;
        if (Math.random() < dt * 30) this.steam.explode(1, this.pistonX + (Math.random() - 0.5) * 26, this.y0 - 4);
        if (this.t > C.fallWarn) {
          this.shake = 0;
          this.liftFrom = this.lift;
          this.go('fall', 'grip');
          s.sfx('smoke', 1, 0.5);
        }
        break;
      case 'fall': {
        const k = Math.min(1, this.t / C.fall);
        this.lift = this.liftFrom * (1 - k * k);
        if (k >= 1) this.slam();
        break;
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sync(dt);
  }

  // o meio do pistão, embaixo do assento
  private get pistonX() {
    return this.x - this.facing * (SEAT[0] + SEAT[1]) / 2;
  }

  // ---------- o chicote do teto ----------
  private lashTarget() {
    const p = this.scene.player;
    const r = this.hall.rail;
    // um pouco à frente de para onde ele está indo; longe da ponta da calha (o lustre fica ali)
    return Phaser.Math.Clamp(p.x + p.body.velocity.x * 0.18, r.x0 + 10, r.x1 - 26);
  }

  private queueLash(warn: number) {
    const s = this.scene;
    const r = this.hall.rail;
    const x = this.lashTarget();
    const glow = s.add.image(x, r.y + 10, 'glow').setTint(0xffb050).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setAlpha(0).setDepth(DEPTH.enemy + 0.3);
    const pulse = s.add.image(r.x1, r.y + 10, 'glow').setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5, 0.22).setAlpha(0).setDepth(DEPTH.enemy + 0.3);
    this.lashes.push({ x, t: 0, warn, stage: 0, len: 0, glow, pulse });
  }

  private updateLashes(dt: number) {
    const s = this.scene;
    const r = this.hall.rail;
    const full = this.hall.floorY - (r.y + 12);
    for (const l of this.lashes) {
      l.t += dt;
      if (l.stage === 0) {
        // a luz corre pela calha até o bocal, que acende; o pó cai da calha em cima de onde o cabo vai bater
        const k = Math.min(1, l.t / l.warn);
        const run = Math.min(1, l.t / (l.warn * 0.55));
        // os da sequência miram onde o cavaleiro está até o último quarto do aviso
        if (k < 0.75 && l.t > 0.05) l.x += Phaser.Math.Clamp(this.lashTarget() - l.x, -260 * dt, 260 * dt);
        l.pulse.setPosition(r.x1 + (l.x - r.x1) * run, r.y + 10).setAlpha(run < 1 ? 0.85 : 0);
        l.glow.setPosition(l.x, r.y + 10).setAlpha(run < 1 ? 0 : 0.5 + 0.5 * k).setScale(0.2 + 0.35 * k);
        if (run >= 1 && Math.random() < dt * 22) s.grit(l.x + (Math.random() - 0.5) * 10, r.y + 14);
        if (l.t >= l.warn) {
          l.stage = 1;
          l.t = 0;
          s.sfx('swoosh', 0.9, 0.7);
        }
      } else if (l.stage === 1) {
        l.len = full * Phaser.Math.Easing.Quadratic.In(Math.min(1, l.t / C.lashDrop));
        if (l.t >= C.lashDrop) {
          l.stage = 2;
          l.t = 0;
          l.len = full;
          // bateu: faísca, poeira e o estalo
          const y = this.hall.floorY;
          s.sparkAt(l.x, y - 2, 10);
          s.dustBurst(l.x, y, 10);
          s.sfx('crack', 0.7, 1.15);
          s.sfx('thud', 0.6, 1.0);
          s.cameras.main.shake(90, 0.004);
        }
      } else if (l.stage === 2) {
        if (l.t >= C.lashHold) {
          l.stage = 3;
          l.t = 0;
          s.sfx('swoosh', 0.4, 1.3);
        }
      } else {
        l.len = full * (1 - Math.min(1, l.t / C.lashBack));
        l.glow.setAlpha(Math.max(0, 1 - l.t / C.lashBack) * 0.8);
      }
    }
    for (const l of this.lashes) {
      if (l.stage === 3 && l.t >= C.lashBack) {
        l.glow.destroy();
        l.pulse.destroy();
      }
    }
    this.lashes = this.lashes.filter((l) => l.glow.active);
  }

  private lashRect(l: Lash) {
    const r = this.hall.rail;
    return new Phaser.Geom.Rectangle(l.x - C.lashHalf, r.y + 12, C.lashHalf * 2, l.len);
  }

  // ---------- a varrida rente ao chão ----------
  private sweep() {
    const s = this.scene;
    const h = this.hall;
    this.go('sweep', 'sweep');
    s.sfx('swoosh', 1, 0.5);
    s.sfx('rope', 0.7, 0.7);
    if (this.onDais()) {
      // no estrado: sai de baixo do assento e corre até a beirada
      const x0 = this.x + this.facing * 4;
      this.whip = { x0, y: this.y0, head: x0, end: h.daisX + 4, back: false };
    } else {
      // no salão: sai pela grade do pé do estrado e corre pelo chão
      const x0 = h.grate.x - 2;
      this.whip = { x0, y: h.floorY, head: x0, end: Math.max(h.rail.x0 - 16, x0 - C.sweepReach), back: false };
    }
    s.dustBurst(this.whip.x0, this.whip.y, 8);
  }

  private updateWhip(dt: number) {
    const w = this.whip;
    if (!w) return;
    const s = this.scene;
    const dir = Math.sign(w.end - w.x0) || -1;
    if (!w.back) {
      w.head += dir * C.sweepSpeed * dt;
      if (Math.random() < dt * 30) s.dustBurst(w.head, w.y, 1);
      if ((w.head - w.end) * dir >= 0) {
        w.head = w.end;
        w.back = true;
        s.sfx('crack', 0.5, 1.3);
      }
    } else {
      w.head -= dir * C.sweepSpeed * 1.4 * dt;
      if ((w.head - w.x0) * dir <= 0) this.whip = null;
    }
  }

  // a crista do cabo, onde ele levanta do chão (é o que machuca)
  private whipRect(w: Whip) {
    const dir = Math.sign(w.end - w.x0) || -1;
    const x = dir < 0 ? w.head - 4 : w.head - 34;
    return new Phaser.Geom.Rectangle(x, w.y - C.sweepH, 38, C.sweepH);
  }

  // ---------- as runas do chão ----------
  private runes() {
    const s = this.scene;
    this.go('rune', 'rune');
    s.sfx('thud', 0.8, 0.8);
    s.sfx('chime', 0.4, 0.7);
    s.cameras.main.shake(140, 0.004);
    const n = this.hall.runes.length;
    const set = this.runeSet;
    this.runeSet ^= 1;
    for (let i = 0; i < n; i++) if (i % 2 === set) this.bursts.push({ i, t: 0, warn: C.runeWarn });
    // na segunda fase, as outras explodem logo depois (quem ficou na apagada tem que trocar de pedra)
    if (this.phase2) for (let i = 0; i < n; i++) if (i % 2 !== set) this.bursts.push({ i, t: 0, warn: C.runeWarn * 2 });
  }

  private updateBursts(dt: number) {
    const s = this.scene;
    const R = this.hall.runes;
    const k = new Array<number>(R.length).fill(0);
    for (const b of this.bursts) {
      b.t += dt;
      const r = R[b.i];
      if (!r) continue;
      if (b.t < b.warn) {
        // o aviso: a placa acende devagar e o desenho da runa sobe da pedra
        const w = Math.max(0, (b.t - (b.warn - C.runeWarn)) / C.runeWarn);
        k[b.i] = Math.max(k[b.i], w * 0.9);
      } else if (b.t < b.warn + C.runeBurst) {
        if (b.t - dt < b.warn) {
          s.sfx('beam', 0.5, 0.8);
          s.gold.explode(5, r.x, r.y - 6);
          s.sparkAt(r.x, r.y - 4, 4);
        }
        k[b.i] = 1;
      }
    }
    R.forEach((r, i) => {
      r.line.setAlpha(k[i]);
      r.glow.setAlpha(k[i] * 0.6);
      this.glyphs[i]?.setAlpha(Math.min(1, k[i] * 1.1)).setY(r.y - 14 - k[i] * 6);
    });
    this.bursts = this.bursts.filter((b) => b.t < b.warn + C.runeBurst);
  }

  private burstRect(b: Burst) {
    const r = this.hall.runes[b.i];
    return new Phaser.Geom.Rectangle(r.x - C.runeHalf, r.y - r.h, C.runeHalf * 2, r.h);
  }

  private burstOn(b: Burst) {
    return b.t >= b.warn && b.t < b.warn + C.runeBurst;
  }

  // ---------- os ecos dos guardas ----------
  private summon() {
    const s = this.scene;
    const p = s.player;
    const h = this.hall;
    const lo = h.rail.x0 + 20;
    const hi = h.daisX - 30;
    const xs = [p.x - 116, p.x + 116].map((x) => Phaser.Math.Clamp(x, lo, hi));
    if (Math.abs(xs[0] - xs[1]) < 60) xs[xs[0] - lo < hi - xs[1] ? 1 : 0] += xs[0] - lo < hi - xs[1] ? 120 : -120;
    xs.forEach((x, i) => {
      s.time.delayedCall(i * 180, () => {
        if (!this.alive) return;
        // a luz desce da coroa até onde ele vai aparecer
        const c = this.at(this.fp().crown);
        s.lightThread(c.x, c.y, x, h.floorY - 30, 8, 520, PAL.gold, () => s.summonEcho(x, h.floorY));
      });
    });
    s.thinkOnce('vhalor:echo', 'Guardas de luz. São os da noite da Coroação, do jeito que ele lembra deles.');
  }

  // ---------- a runa do Cetro apontada ----------
  private boltHead() {
    const c = this.fp().cetro;
    return c ? this.at(c) : { x: this.x + this.facing * 50, y: this.y - 64 };
  }

  // ele não vira para trás (está sentado): a mira fica sempre para a frente, do chão até bem para cima
  private forward(d: { x: number; y: number }) {
    let x = d.x * this.facing;
    let y = d.y;
    if (x < 0.25) {
      x = 0.25;
      y = (Math.sign(y) || -1) * Math.sqrt(1 - x * x);
    }
    const n = Math.hypot(x, y) || 1;
    return { x: (x / n) * this.facing, y: y / n };
  }

  // o braço acompanha a mira: apontando para a frente (os quadros do chamado, do mais alto ao reto) ou, com o
  // cavaleiro acima da cabeça dele (no lustre), o Cetro erguido, para a luz passar por cima da tábua
  private aimPose() {
    const high = this.scene.player.body.center.y < this.y - 70;
    this.play(high ? 'lashwind' : 'summon');
    const frames = this.sprite.anims.currentAnim?.frames ?? [];
    const up = -this.aimDir.y;
    const f = frames[high ? frames.length - 1 : up > 0.42 ? 0 : up > 0.16 ? 1 : 2];
    if (f && this.sprite.anims.currentFrame !== f) this.sprite.anims.pause(f);
  }

  private aim(dt: number) {
    const p = this.scene.player;
    const h = this.boltHead();
    const dx = p.x - h.x;
    const dy = p.body.center.y - h.y;
    const d = Math.hypot(dx, dy) || 1;
    // a mira vira devagar (quem corre escapa dela)
    const k = Math.min(1, dt * C.boltTurn);
    this.aimDir = this.forward({ x: this.aimDir.x + (dx / d - this.aimDir.x) * k, y: this.aimDir.y + (dy / d - this.aimDir.y) * k });
    this.aimPose();
  }

  // até onde a luz vai: a primeira pedra ou a primeira tábua (o lustre, um degrau), ou o alcance
  private cast(h: { x: number; y: number }) {
    const L = this.scene.level;
    for (let k = 4; k < C.boltRange; k += 3) {
      const x = h.x + this.aimDir.x * k;
      const y = h.y + this.aimDir.y * k;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (L.solidCell(tx, ty)) return { x, y };
      const c = L.ch(tx, ty);
      if ((c === '-' || c === '"') && L.layer.getTileAt(tx, ty) && y - ty * TILE < PLANK_H) return { x, y };
    }
    return { x: h.x + this.aimDir.x * C.boltRange, y: h.y + this.aimDir.y * C.boltRange };
  }

  // o feixe passa pelo cavaleiro? (a distância da linha até o meio dele, nas três alturas do corpo)
  private boltHits(pr: Phaser.Geom.Rectangle) {
    if (this.state !== 'bolt' || this.t > C.boltFire * 0.85) return false;
    const h = this.boltHead();
    const vx = this.aimEnd.x - h.x;
    const vy = this.aimEnd.y - h.y;
    const L2 = vx * vx + vy * vy || 1;
    for (const py of [pr.y + 4, pr.centerY, pr.bottom - 4]) {
      const px = pr.centerX;
      const t = Phaser.Math.Clamp(((px - h.x) * vx + (py - h.y) * vy) / L2, 0, 1);
      if (Math.hypot(px - (h.x + vx * t), py - (h.y + vy * t)) < C.boltHalf + pr.width / 2) return true;
    }
    return false;
  }

  private drawBolt() {
    const st = this.state;
    const aiming = st === 'boltaim' || st === 'boltlock';
    if (!aiming && st !== 'bolt') {
      this.aimLine.setAlpha(0);
      this.beam.setAlpha(0);
      this.beamHalo.setAlpha(0);
      this.beamSpot.setAlpha(0);
      return;
    }
    const h = this.boltHead();
    this.aimEnd = this.cast(h);
    const len = Math.hypot(this.aimEnd.x - h.x, this.aimEnd.y - h.y);
    const rot = Math.atan2(-(this.aimEnd.x - h.x), this.aimEnd.y - h.y);
    if (aiming) {
      const blink = st === 'boltlock' ? (Math.floor(this.t * 18) % 2 ? 0.8 : 0.25) : 0.12 + 0.3 * Math.min(1, this.t / C.boltAim);
      this.aimLine.setPosition(h.x, h.y).setRotation(rot).setDisplaySize(st === 'boltlock' ? 2 : 1, len).setAlpha(blink);
      this.cetroGlow.setPosition(h.x, h.y).setAlpha(0.5 + 0.4 * Math.min(1, this.t / C.boltAim)).setScale(0.5 + 0.3 * Math.min(1, this.t / C.boltAim));
      this.beam.setAlpha(0);
      this.beamHalo.setAlpha(0);
      this.beamSpot.setAlpha(0);
      return;
    }
    this.aimLine.setAlpha(0);
    const f = 1 - Math.max(0, this.t - C.boltFire * 0.6) / (C.boltFire * 0.4);
    const flick = 0.85 + Math.random() * 0.15;
    this.beam.setPosition(h.x, h.y).setRotation(rot).setDisplaySize(C.boltHalf * 2 + 2, len).setAlpha(0.9 * f * flick);
    this.beamHalo.setPosition(h.x, h.y).setRotation(rot).setDisplaySize(C.boltHalf * 8, len).setAlpha(0.28 * f * flick);
    this.beamSpot.setPosition(this.aimEnd.x, this.aimEnd.y).setScale(0.8).setAlpha(0.8 * f);
    this.cetroGlow.setPosition(h.x, h.y).setAlpha(f).setScale(0.8);
    if (Math.random() < 0.6) this.scene.dustBurst(this.aimEnd.x, this.aimEnd.y, 1);
  }

  // ---------- a pancada de perto ----------
  private bashBox() {
    const y = this.y;
    const a = this.x + this.facing * 8;
    const b = this.x + this.facing * 84;
    return new Phaser.Geom.Rectangle(Math.min(a, b), y - 54, Math.abs(b - a), 54);
  }

  // onde a cabeça do Cetro está (para aparar)
  private cetroBox() {
    const c = this.fp().cetro;
    if (!c) return null;
    const q = this.at(c);
    return new Phaser.Geom.Rectangle(q.x - 12, q.y - 12, 24, 24);
  }

  private bashImpact() {
    const s = this.scene;
    const c = this.fp().cetro;
    const q = c ? this.at(c) : { x: this.x + this.facing * 34, y: this.y - 20 };
    s.sfx('thud', 0.9, 0.8);
    s.sfx('clang', 0.4, 0.6);
    s.cameras.main.shake(140, 0.006);
    s.dustBurst(q.x, this.y, 10);
    s.sparkAt(q.x, q.y, 6);
  }

  // ---------- segunda fase ----------
  private rise() {
    const s = this.scene;
    this.go('rise', 'grip');
    s.sfx('gate', 0.8, 0.6);
    s.sfx('creak', 0.9, 0.5);
    s.cameras.main.shake(Math.round(C.rise * 1000), 0.003);
    s.thinkOnce('vhalor:rise', 'O estrado abriu embaixo dele. Um pistão de bronze está erguendo o trono inteiro.');
  }

  private cage() {
    const s = this.scene;
    const p = s.player;
    const r = this.hall.rail;
    this.caged = true;
    const xl = Phaser.Math.Clamp(p.x - 250, r.x0 + 8, r.x1 - 26);
    const xr = Phaser.Math.Clamp(p.x + 250, r.x0 + 8, r.x1 - 26);
    // sem espaço para fechar o cerco: os cabos de cima
    if (xr - xl < C.cageMeet * 3) {
      this.startAttack('lash');
      return;
    }
    this.go('cage', 'lashwind');
    this.pillars.push({ x: xl, dir: 1, drop: 0, back: false }, { x: xr, dir: -1, drop: 0, back: false });
    s.sfx('swoosh', 0.8, 0.5);
    s.sfx('rope', 0.8, 0.6);
    s.thinkOnce('vhalor:cage', 'Os cabos vêm dos dois lados, um contra o outro. Não dá para pular por cima. Dá para passar por dentro, rápido.');
  }

  private updatePillars(dt: number) {
    if (!this.pillars.length) return;
    const s = this.scene;
    const r = this.hall.rail;
    const [a, b] = this.pillars;
    const closing = !!a && !!b && !a.back && Math.abs(b.x - a.x) > C.cageMeet;
    for (const q of this.pillars) {
      if (q.back) {
        q.drop = Math.max(0, q.drop - dt / 0.3);
        continue;
      }
      if (q.drop < 1) {
        q.drop = Math.min(1, q.drop + dt / 0.3);
        if (q.drop >= 1) {
          s.sparkAt(q.x, this.hall.floorY - 2, 8);
          s.sfx('crack', 0.5, 1.1);
        }
        continue;
      }
      if (closing) {
        q.x = Phaser.Math.Clamp(q.x + q.dir * C.cageSpeed * dt, r.x0 + 8, r.x1 - 26);
        // a ponta de baixo arrasta no chão e a de cima corre na calha
        if (Math.random() < dt * 24) s.sparkAt(q.x, this.hall.floorY - 1, 1);
        if (Math.random() < dt * 10) s.grit(q.x, r.y + 13);
      }
    }
    // fechou: os dois sobem de volta
    if (a && b && !a.back && a.drop >= 1 && b.drop >= 1 && !closing) {
      a.back = true;
      b.back = true;
      s.sfx('swoosh', 0.5, 1.2);
    }
    this.pillars = this.pillars.filter((q) => !q.back || q.drop > 0);
  }

  private pillarRect(q: Pillar) {
    const r = this.hall.rail;
    const len = (this.hall.floorY - r.y - 12) * q.drop;
    return new Phaser.Geom.Rectangle(q.x - 5, r.y + 12, 10, len);
  }

  // o trono caiu no estrado: a sala sacode, a onda corre pelo estrado e pelo chão e o teto solta pedras
  private slam() {
    const s = this.scene;
    const h = this.hall;
    this.lift = 0;
    this.groundT = C.ground2;
    this.go('idle', 'slam');
    this.thinkT = C.slamRec;
    s.sfx('thud', 1.2, 0.5);
    s.sfx('crack', 0.9, 0.7);
    s.sfx('clang', 0.7, 0.5);
    s.cameras.main.shake(420, 0.012);
    s.hitstop(0.06);
    s.dustBurst(this.x + this.facing * 10, this.y0, 18);
    s.dustBurst(this.pistonX, this.y0, 12);
    this.steam.explode(8, this.pistonX, this.y0 - 6);
    const dx = this.x + this.facing * 26;
    this.addWave(dx, this.y0, this.facing, Math.min(h.daisX, dx), Math.max(h.daisX, dx));
    const fx = h.daisX + this.facing * 6;
    this.addWave(fx, h.floorY, this.facing, h.rail.x0 - 30, h.daisX);
    // as pedras: em volta do cavaleiro, longe uma da outra (uma sempre em cima dele)
    const p = s.player;
    const xs: number[] = [];
    // (só embaixo da calha: é a pedra em volta dela que solta)
    const lo = h.rail.x0 + 20;
    const hi = h.rail.x1 - 26;
    for (let i = 0; i < C.debris * 4 && xs.length < C.debris; i++) {
      const x = Phaser.Math.Clamp(p.x + (Math.random() - 0.5) * 380, lo, hi);
      if (xs.every((o) => Math.abs(o - x) > 44)) xs.push(x);
    }
    if (p.x < hi + 20 && !xs.some((x) => Math.abs(x - p.x) < 30)) xs[0] = Phaser.Math.Clamp(p.x, lo, hi);
    xs.forEach((x, i) => s.time.delayedCall(i * 120, () => this.dropRock(x)));
  }

  private addWave(x: number, y: number, dir: 1 | -1, lo: number, hi: number) {
    const glow = this.scene.add.image(x, y - 7, 'glow').setScale(1.6, 0.55).setTint(0xffa040).setAlpha(0.85)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy + 0.3);
    this.waves.push({ x, y, dir, t: 0, lo, hi, glow });
  }

  private updateWaves(dt: number) {
    const s = this.scene;
    for (const w of this.waves) {
      w.t += dt;
      w.x += w.dir * C.waveSpeed * dt;
      w.glow.setPosition(w.x, w.y - 7).setAlpha(0.85 * Math.max(0, 1 - w.t / C.waveLife));
      if (Math.random() < 0.5) s.dustBurst(w.x, w.y, 2);
      if (Math.random() < dt * 8) s.debris(w.x, w.y - 4, 'rock', 2);
    }
    for (const w of this.waves) if (w.t > C.waveLife || w.x < w.lo || w.x > w.hi) w.glow.destroy();
    this.waves = this.waves.filter((w) => w.glow.active);
  }

  private waveRect(w: Wave) {
    return new Phaser.Geom.Rectangle(w.x - 9, w.y - 16, 18, 16);
  }

  private dropRock(x: number) {
    if (this.state === 'dead') return;
    const s = this.scene;
    const top = this.hall.rail.y + 14;
    const land = this.hall.floorY - 6;
    const img = s.add.image(x, top, 'torres-rock').setDepth(DEPTH.enemy + 0.5).setVisible(false);
    const shadow = s.add.ellipse(x, this.hall.floorY - 1, 20, 6, 0x050403, 0).setStrokeStyle(1, 0xd8c0a0, 0).setDepth(DEPTH.enemy - 0.4);
    s.tweens.add({ targets: shadow, fillAlpha: 0.7, strokeAlpha: 0.55, duration: C.debrisWarn * 1000 });
    this.rocks.push({ x, y: top, vy: 220, t: 0, land, falling: false, img, shadow, done: false });
  }

  private updateRocks(dt: number) {
    const s = this.scene;
    for (const r of this.rocks) {
      r.t += dt;
      if (!r.falling) {
        if (Math.random() < dt * 16) s.grit(r.x + (Math.random() - 0.5) * 14, Math.max(this.hall.rail.y + 14, s.cameras.main.worldView.y + 2));
        if (r.t > C.debrisWarn) {
          r.falling = true;
          r.img.setVisible(true);
        }
        continue;
      }
      r.vy += 1500 * dt;
      r.y = Math.min(r.land, r.y + r.vy * dt);
      r.img.setPosition(r.x, r.y).setRotation(r.t * 5);
      if (r.y >= r.land) {
        r.done = true;
        s.sfx('thud', 0.6, 1.1);
        s.debris(r.x, this.hall.floorY - 4, 'rock', 6);
        r.shadow.destroy();
        s.tweens.add({ targets: r.img, alpha: 0, delay: 300, duration: 400, onComplete: () => r.img.destroy() });
      }
    }
    this.rocks = this.rocks.filter((r) => !r.done);
  }

  private rockRect(r: Rock) {
    return new Phaser.Geom.Rectangle(r.x - 7, r.y - 6, 14, 12);
  }

  // embaixo do trono caindo
  private crushRect() {
    const a = this.x + this.facing * 16;
    const b = this.x - this.facing * 38;
    return new Phaser.Geom.Rectangle(Math.min(a, b), this.y - 8, Math.abs(b - a), this.lift + 8);
  }

  private updateHazards(dt: number) {
    this.updateLashes(dt);
    this.updateWhip(dt);
    this.updateBursts(dt);
    this.updatePillars(dt);
    this.updateWaves(dt);
    this.updateRocks(dt);
  }

  // ---------- desenho ----------
  private sync(dt = 0) {
    const y = this.y;
    const jx = this.shake ? (Math.random() < 0.5 ? -1 : 1) : 0;
    const box = this.rect;
    this.zone.setPosition(box.centerX, box.centerY);
    this.body.reset(box.centerX, box.centerY);
    this.sprite.setPosition(Math.round(this.x + jx), Math.round(y));
    face(this.sprite, this.facing < 0);
    // os cabos acendem quando ele manda neles e apagam devagar
    const cmd = this.state === 'lashwind' || this.state === 'lash' || this.state === 'sweepwind' || this.state === 'sweep' || this.state === 'cage'
      || this.state === 'runewind' || this.state === 'rune' || this.state === 'boltaim' || this.state === 'boltlock' || this.state === 'bolt'
      || this.lashes.length > 0 || this.pillars.length > 0;
    const want = this.state === 'sleep' ? 0.05 : this.state === 'dead' ? 0 : cmd ? 1 : 0.35;
    this.lit += (want - this.lit) * Math.min(1, dt * (want > this.lit ? 8 : 2));
    const rg = this.hall.railGlow;
    if (rg.visible) rg.setAlpha(this.state === 'dead' ? Math.max(0, rg.alpha - dt * 0.4) : 0.16 + this.lit * 0.5 + 0.06 * Math.sin(this.time * 3));
    // a runa do Cetro acesa no comando
    const c = this.fp().cetro;
    if (c && this.state !== 'dead') {
      const q = this.at(c);
      this.cetroGlow.setPosition(q.x, q.y).setAlpha(this.state === 'sleep' ? 0 : 0.15 + this.lit * 0.45).setScale(0.35 + this.lit * 0.2);
    } else this.cetroGlow.setAlpha(Math.max(0, this.cetroGlow.alpha - dt * 2));
    this.drawBolt();
    this.drawBack();
    this.drawPiston();
    this.drawHazards();
    if (this.state === 'sleep' && Math.random() < dt * 0.6) this.amberDust.explode(1, this.x - this.facing * 12, y - 40);
  }

  // um cabo de Âmbar por uma lista de pontos: a alma escura, o lado aceso e as luvas de bronze
  private cable(g: Phaser.GameObjects.Graphics, pts: Phaser.Types.Math.Vector2Like[], lit: number, width = 3, rings = 24) {
    if (pts.length < 2) return;
    g.lineStyle(width + 2, 0x24110a, 1).strokePoints(pts);
    g.lineStyle(width, mix(0x5a2a08, 0xd27a26, lit), 1).strokePoints(pts);
    g.lineStyle(1, mix(0x8a4a14, 0xffe6a6, lit), 0.9).strokePoints(pts.map((q) => ({ x: q.x - 0.6, y: q.y - 0.6 })));
    if (lit > 0.05) this.ga.lineStyle(width + 5, 0xffa040, 0.16 * lit).strokePoints(pts);
    if (!rings) return;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      acc += d;
      if (acc < rings || d < 0.01) continue;
      acc = 0;
      const nx = -(b.y - a.y) / d;
      const ny = (b.x - a.x) / d;
      const r = width / 2 + 1.5;
      g.lineStyle(2, BRZ[3], 1).lineBetween(b.x - nx * r, b.y - ny * r, b.x + nx * r, b.y + ny * r);
      g.lineStyle(1, BRZ[4], 1).lineBetween(b.x - nx * r, b.y - ny * r, b.x - nx * r * 0.2, b.y - ny * r * 0.2);
    }
  }

  // os cabos dos ombros até os bocais do encosto (atrás do corpo dele)
  private drawBack() {
    const g = this.gb;
    g.clear();
    if (this.crumbled) return;
    const pts = this.fp().cabos;
    this.hall.anchors.forEach((a, i) => {
      const q = this.at(pts[i] ?? pts[0]);
      const line: Phaser.Types.Math.Vector2Like[] = [];
      const sag = 4 + Math.max(0, (q.y - a.y) * 0.04);
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        line.push({ x: a.x - 2 + (q.x - a.x + 2) * t, y: a.y + (q.y - a.y) * t + Math.sin(t * Math.PI) * sag });
      }
      this.cable(g, line, this.state === 'dead' ? Math.max(0, 1 - this.deadT) : this.lit, 3, 20);
    });
  }

  // o pistão de bronze embaixo do assento e os dois cabos de baixo esticados até o estrado
  private drawPiston() {
    const g = this.gp;
    g.clear();
    if (this.lift < 0.5) return;
    const top = this.y;
    const x = this.pistonX;
    const w = PISTON_W;
    // a boca no estrado (o aro do furo de onde ele sai)
    g.fillStyle(BRZ[1], 1).fillRect(x - w / 2 - 4, this.y0 - 3, w + 8, 3);
    g.fillStyle(BRZ[3], 1).fillRect(x - w / 2 - 4, this.y0 - 3, w + 8, 1);
    // o cilindro: a sombra do lado de trás, o bronze, o brilho da frente e os anéis
    g.fillStyle(BRZ[1], 1).fillRect(x - w / 2, top, w, this.y0 - 3 - top);
    g.fillStyle(BRZ[2], 1).fillRect(x - w / 2 + 3, top, w - 8, this.y0 - 3 - top);
    g.fillStyle(BRZ[4], 0.9).fillRect(x - w / 2 + 6, top, 2, this.y0 - 3 - top);
    g.fillStyle(BRZ[0], 1).fillRect(x + w / 2 - 3, top, 3, this.y0 - 3 - top);
    for (let yy = top + 10; yy < this.y0 - 6; yy += 14) {
      g.fillStyle(BRZ[3], 1).fillRect(x - w / 2 - 1, yy, w + 2, 2);
      g.fillStyle(BRZ[0], 1).fillRect(x - w / 2 - 1, yy + 2, w + 2, 1);
    }
    // a flange embaixo do assento
    g.fillStyle(BRZ[2], 1).fillRect(x - w / 2 - 3, top - 2, w + 6, 3);
    g.fillStyle(BRZ[4], 1).fillRect(x - w / 2 - 3, top - 2, w + 6, 1);
    // os cabos de baixo do assento descendo até onde entram no estrado
    for (const dx of FLOOR_CABLES) {
      const cx = this.x - this.facing * dx;
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        pts.push({ x: cx + Math.sin(t * Math.PI) * 2 * this.facing, y: top + (this.y0 - top) * t });
      }
      this.cable(g, pts, this.lit * 0.6, 2, 18);
    }
  }

  private drawHazards() {
    const g = this.g;
    const ga = this.ga;
    g.clear();
    ga.clear();
    const r = this.hall.rail;
    const top = r.y + 12;
    // os cabos que descem da calha: tremendo enquanto descem, a luva pesada de bronze na ponta
    for (const l of this.lashes) {
      if (l.stage === 0 || l.len < 2) continue;
      const amp = l.stage === 1 ? 4 : l.stage === 2 ? 1.2 : 2.5;
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      const n = Math.max(2, Math.ceil(l.len / 10));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        pts.push({ x: l.x + Math.sin(t * 9 + this.time * 26) * amp * t, y: top + l.len * t });
      }
      this.cable(g, pts, 1, 3, 26);
      const tip = pts[pts.length - 1];
      g.fillStyle(BRZ[1], 1).fillRect(tip.x - 3, tip.y - 7, 6, 8);
      g.fillStyle(BRZ[3], 1).fillRect(tip.x - 3, tip.y - 7, 2, 8);
      g.fillStyle(BRZ[4], 1).fillRect(tip.x - 2, tip.y - 7, 4, 1);
      if (l.stage === 2) ga.fillStyle(0xffb050, 0.25).fillEllipse(l.x, this.hall.floorY - 2, 40, 10);
    }
    // o aviso no chão embaixo de cada bocal aceso
    for (const l of this.lashes) {
      if (l.stage !== 0) continue;
      const k = Math.min(1, l.t / l.warn);
      ga.fillStyle(0xffa040, 0.12 + 0.3 * k).fillEllipse(l.x, this.hall.floorY - 1, 16 + 12 * k, 4);
    }
    // o cabo do chão: deitado da grade até a crista, que levanta e corre
    const w = this.whip;
    if (w) {
      const dir = Math.sign(w.end - w.x0) || -1;
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      const len = Math.abs(w.head - w.x0);
      const n = Math.max(2, Math.ceil(len / 8));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = w.x0 + dir * len * t;
        // perto da ponta o cabo levanta numa onda (a crista)
        const near = Math.max(0, 1 - Math.abs(w.head - x) / 30);
        const lift = w.back ? 0 : near * (C.sweepH - 3) * Math.abs(Math.sin(this.time * 18 + t * 4)) + near * 3;
        pts.push({ x, y: w.y - 3 - lift });
      }
      this.cable(g, pts, 1, 3, 24);
    }
    // as colunas de luz das runas
    for (const b of this.bursts) {
      if (!this.burstOn(b)) continue;
      const q = this.hall.runes[b.i];
      const a = 1 - (b.t - b.warn) / C.runeBurst;
      // (a coluna que para embaixo do lustre fica do mesmo tamanho em cima: a luz bate e espalha)
      const top = q.h < C.runeH ? 0 : 0.12;
      for (let k = 0; k < 5; k++) {
        const h = q.h * (1 - k * top);
        const hw = C.runeHalf - k * 2;
        ga.fillStyle(0xffa040, 0.13 * a).fillRect(q.x - hw, q.y - h, hw * 2, h);
      }
      ga.fillStyle(0xffe6a6, 0.55 * a).fillRect(q.x - 2, q.y - q.h, 4, q.h);
      if (q.h < C.runeH) ga.fillStyle(0xffd27a, 0.4 * a).fillEllipse(q.x, q.y - q.h + 1, C.runeHalf * 3, 6);
    }
    // os pilares do cerco: três cabos trançados descendo da calha
    for (const q of this.pillars) {
      const len = (this.hall.floorY - top) * q.drop;
      if (len < 2) continue;
      for (const off of [-3, 0, 3]) {
        const pts: Phaser.Types.Math.Vector2Like[] = [];
        const n = Math.max(2, Math.ceil(len / 12));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          pts.push({ x: q.x + off * Math.cos(t * 14 + this.time * 6 + off), y: top + len * t });
        }
        this.cable(g, pts, 1, 2, off === 0 ? 30 : 0);
      }
      ga.fillStyle(0xffa040, 0.1).fillRect(q.x - 8, top, 16, len);
    }
    // os cabos do teto e do cerco também acendem a calha por dentro
    for (const l of this.lashes) if (l.stage > 0) ga.fillStyle(0xffd27a, 0.5).fillEllipse(l.x, r.y + 10, 18, 5);
    for (const q of this.pillars) ga.fillStyle(0xffd27a, 0.45).fillEllipse(q.x, r.y + 10, 18, 5);
  }

  // ---------- dano ----------
  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    this.harmFrom = undefined;
    const from = (x: number) => {
      this.harmFrom = x;
      return true;
    };
    for (const l of this.lashes) if ((l.stage === 1 || l.stage === 2) && l.len > 30 && overlap(pr, this.lashRect(l))) return from(l.x);
    const w = this.whip;
    if (w && !w.back && overlap(pr, this.whipRect(w))) return from(w.head - (Math.sign(w.end - w.x0) || -1) * 30);
    for (const b of this.bursts) if (this.burstOn(b) && overlap(pr, this.burstRect(b))) return from(this.hall.runes[b.i].x);
    for (const q of this.pillars) if (!q.back && q.drop > 0.6 && overlap(pr, this.pillarRect(q))) return from(q.x);
    for (const v of this.waves) if (overlap(pr, this.waveRect(v))) return from(v.x - v.dir * 12);
    for (const r of this.rocks) if (r.falling && !r.done && overlap(pr, this.rockRect(r))) return from(r.x);
    if (this.boltHits(pr)) return from(pr.centerX - this.aimDir.x * 20);
    if (this.state === 'fall' && overlap(pr, this.crushRect())) return from(this.x);
    if (!this.present) return false;
    if (this.state === 'bash' && this.t < C.bashActive && overlap(pr, this.bashBox())) return from(this.x);
    if (sliding || this.state === 'stagger') return false;
    // o corpo dele e o trono: quem encosta é empurrado para a frente
    return overlap(pr, this.rect) ? from(this.x - this.facing * 30) : false;
  }

  // aparar: a cabeça do Cetro no fim da preparação da pancada ou saindo, pela frente
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive || !this.present) return false;
    const late = this.state === 'bashwind' && this.t > C.bashWind * this.speedMul - PARRY.early;
    const going = this.state === 'bash' && this.t < 0.09;
    if (!late && !going) return false;
    if (this.front(fromX) < -6) return false;
    const cb = this.cetroBox();
    if (!(cb && overlap(box, cb)) && !overlap(box, this.bashBox())) return false;
    this.go('stagger', 'stagger');
    this.scene.sfx('clang', 0.9, 0.7);
    return true;
  }

  hit(fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive || !this.present) return 'ignored';
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    const r = this.rect;
    this.amberDust.explode(3, Phaser.Math.Clamp(fromX, r.x, r.right), r.centerY - 6);
    if (!this.phase2 && this.hp <= this.maxHp * C.phase2 && this.hp > 0) {
      this.phase2 = true;
      this.groundT = 0;
      if (this.state === 'idle') this.thinkT = Math.min(this.thinkT, 0.35);
      this.scene.cameras.main.shake(500, 0.004);
      this.scene.sfx('roar', 0.3, 0.5);
    }
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  // ---------- vencido ----------
  private die() {
    const s = this.scene;
    this.alive = false;
    this.hp = 0;
    this.shake = 0;
    this.body.enable = false;
    this.clearHazards();
    this.go('dead');
    this.deadT = 0;
    s.time.delayedCall(80, () => this.sprite.clearTint());
    s.hitstop(0.25);
    s.cameras.main.flash(300, 255, 214, 150);
    s.cameras.main.shake(500, 0.006);
    s.deathBurst(this.x - this.facing * 12, this.y - 40);
    s.sfx('roar', 0.4, 0.45);
    s.sfx('crack', 0.8, 0.6);
    // lá em cima: o pistão solta e o trono desce até o estrado antes do Âmbar tomar o corpo
    if (this.lift > 0) {
      const from = this.lift;
      s.tweens.addCounter({ from: 0, to: 1, duration: 260, ease: 'Quad.easeIn', onUpdate: (tw) => {
        this.lift = from * (1 - (tw.getValue() ?? 0));
      }, onComplete: () => {
        this.lift = 0;
        s.sfx('thud', 1, 0.5);
        s.dustBurst(this.x, this.y0, 14);
      } });
    }
    this.anim = 'death';
    this.sprite.play('vhalor-death');
    if (s.once('vhalor:words')) s.time.delayedCall(1300, () => ui.say('O Senhor de Vhalor', 'Eu só queria que ninguém mais chorasse. Para isso, ninguém podia lembrar.', 6200));
    this.onDefeat?.();
  }

  private clearHazards() {
    for (const l of this.lashes) {
      l.glow.destroy();
      l.pulse.destroy();
    }
    this.lashes = [];
    this.whip = null;
    this.bursts = [];
    this.pillars = [];
    for (const w of this.waves) w.glow.destroy();
    this.waves = [];
    for (const r of this.rocks) {
      r.img.destroy();
      r.shadow.destroy();
    }
    this.rocks = [];
    for (const r of this.hall.runes) {
      r.line.setAlpha(0);
      r.glow.setAlpha(0);
    }
    for (const gl of this.glyphs) gl.setAlpha(0);
  }

  // a estátua de Âmbar: estala, solta pó e se desfaz; fica o trono vazio com a coroa no assento
  private updateDead(dt: number) {
    const s = this.scene;
    const t0 = this.deadT;
    this.deadT += dt;
    const t = this.deadT;
    if (this.crumbled) return;
    const cx = this.x - this.facing * 12;
    const cy = this.y0 - 40;
    if (t > 1.1 && Math.random() < dt * 10) this.amberDust.explode(1, cx + (Math.random() - 0.5) * 30, cy + (Math.random() - 0.5) * 40);
    for (const at of [1.7, 2.4]) {
      if (t0 < at && t >= at) {
        s.sfx('crack', 0.6, 1.2 + at * 0.1);
        s.glowBurst(cx, cy, 0xffb050, 1.2);
        this.amberDust.explode(10, cx, cy);
      }
    }
    if (t >= 3.1) {
      this.crumbled = true;
      this.sprite.play('vhalor-empty');
      this.anim = 'empty';
      s.sfx('glass', 0.9, 0.6);
      s.sfx('crack', 1, 0.5);
      s.sfx('ash', 0.7, 0.8);
      s.cameras.main.shake(260, 0.005);
      s.glowBurst(cx, cy, 0xffb050, 3);
      this.amberDust.explode(60, cx, cy);
      s.dustBurst(cx, this.y0, 16);
      // os cabos dos ombros soltam dos bocais e caem por cima do encosto (o salão desenha daqui em diante)
      this.drawFallenCables();
    }
  }

  private drawFallenCables() {
    const g = this.scene.add.graphics().setDepth(DEPTH.enemy - 0.2);
    this.hall.anchors.forEach((a, i) => {
      const end = { x: this.hall.wallX - 14 - i * 5, y: this.y0 - 70 + i * 4 };
      const pts: Phaser.Math.Vector2[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        pts.push(new Phaser.Math.Vector2(a.x - 3 + (end.x - a.x + 3) * t, a.y + (end.y - a.y) * t + Math.sin(t * Math.PI) * 9));
      }
      g.lineStyle(3, 0x2a170b, 1).strokePoints(pts);
      g.lineStyle(1, 0x683c17, 1).strokePoints(pts);
    });
  }

  destroy() {
    this.clearHazards();
    this.g.destroy();
    this.ga.destroy();
    this.gb.destroy();
    this.gp.destroy();
    this.cetroGlow.destroy();
    for (const o of [this.aimLine, this.beam, this.beamHalo, this.beamSpot]) o.destroy();
    for (const gl of this.glyphs) gl.destroy();
    this.amberDust.destroy();
    this.steam.destroy();
  }
}


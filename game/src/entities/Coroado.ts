import Phaser from 'phaser';
import { COROADO as C, PARRY, PLAYER } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { DEPTH } from '../world/Decor';
import { CORE_DEPTH } from '../world/Torres';
import { hd } from '../gfx/flip';
import { drawLash, type LashLook, type LashPose } from '../gfx/lash';
import { audio } from '../systems/Audio';
import { progress } from '../systems/Save';
import { ui } from '../ui/ui';
import { overlap, type BossFoe, type Enemy, type HitDir, type HitResult } from './Enemy';

type State =
  | 'sleep' | 'rise' | 'idle'
  | 'slam'
  | 'sweepwarn' | 'sweep' | 'sweeprec'
  | 'beadwind' | 'beads'
  | 'leanwind' | 'leandrop' | 'leanrest' | 'leanrise'
  | 'crumble' | 'form'
  | 'mirror' | 'lungewind' | 'lunge' | 'lungeback' | 'stagger'
  | 'kneel' | 'offer';

type Attack = 'slam' | 'sweepU' | 'sweepN' | 'beads' | 'lean';
type Box = [number, number, number, number];
type P = [number, number];

// As partes da folha (art2/coroado.py, os mesmos números), em px do mundo a partir do canto de cima à esquerda
// de cada uma: onde ela gira e os pontos que a luta usa. O ombro é o da esquerda (o da direita é o espelho em
// volta do pescoço); o braço e o antebraço descem a partir do ponto de cima e o punho fica no fim do antebraço
// (len), girando com ele. Agarrado na agulha, a mão é outra (grip): fechada em volta da pedra, com o meio da
// agulha em `pole`. A ombreira fica presa no ombro (joint), por cima do braço
const PART = {
  chest: { w: 400, h: 150, neck: [200, 26] as P, shoulder: [80, 54] as P },
  pauldron: { w: 112, h: 100, joint: [66, 46] as P },
  head: { w: 120, h: 132, neck: [60, 128] as P, crown: [60, 24] as P, mask: [34, 46, 52, 64] as Box, eyes: [[47, 70], [73, 70]] as P[] },
  crown: { w: 96, h: 50, base: [48, 46] as P },
  arm: { w: 60, h: 130, top: [30, 12] as P, len: 112 },
  fore: { w: 64, h: 120, top: [32, 10] as P, len: 118 },
  fist: { w: 56, h: 52, c: [28, 26] as P },
  grip: { w: 68, h: 72, pole: [26, 44] as P },
  blade: { w: 200, h: 64, root: [14, 44] as P },
  crownS: { w: 20, h: 12, base: [10, 11] as P },
};
// o pescoço fica esta altura acima do chão do terraço; o punho apoiado fica com o meio a FIST_REST do chão; nas
// agulhas, o punho segura GRIP acima do chão
const NECK_H = 104;
const FIST_REST = 22;
const GRIP = 116;
// o punho: meia largura e meia altura da caixa (px)
const FIST_HW = 24;
const FIST_HH = 23;

// a cor dos golpes do carrasco dourado (o chicote e a corrente feitos de ouro)
const LASH_LOOK: LashLook = { body: 0x9a6a1c, edge: 0xffe6a6, tip: 0xfff4dc, hook: 0x8a5a14 };
const GOLD = 0xffc85a;

// as acusações que as contas dizem quando acertam (as memórias que ele rejeitou, em voz baixa)
const ACCUSE = [
  'Trezentos e doze.',
  'Você não lia as ordens.',
  'Ela chamou. Você não se virou.',
  'A ordem estava no outro bolso.',
  'Você subiu por último.',
  'O machado nunca falhou no tablado.',
];
// o que o carrasco dourado diz quando investe (as justificativas)
const JUSTIFY = [
  'Eles sabiam demais.',
  'Ela ia destruir o reino.',
  'Você só cumpriu a ordem.',
  'Alguém tinha de descer o machado.',
  'Sem a Coroação, ninguém dormiria em paz.',
];

const rectOf = (b: Box) => new Phaser.Geom.Rectangle(b[0], b[1], b[2], b[3]);
const NOWHERE = new Phaser.Geom.Rectangle(-9999, -9999, 0, 0);
const ease = (k: number) => k * k * (3 - 2 * k);

// uma parte do colosso que leva golpe (os dois punhos e a máscara): só um alvo, quem leva o dano é o chefe
class Part implements Enemy {
  readonly kind = 'boss' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  // onde ela está agora (fora da tela quando não dá para bater)
  area: Phaser.Geom.Rectangle = NOWHERE;

  constructor(scene: Phaser.Scene, private readonly boss: Coroado, readonly name: 'fistL' | 'fistR' | 'mask') {
    this.zone = scene.add.zone(-9999, -9999, 4, 4);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.body.checkCollision.none = true;
    this.body.moves = false;
  }

  get alive() {
    return this.boss.alive;
  }

  get rect() {
    return this.area;
  }

  place(r: Phaser.Geom.Rectangle | null) {
    this.area = r ?? NOWHERE;
    if (r) this.zone.setPosition(r.centerX, r.centerY);
  }

  update() {}

  hit(fromX: number, dmg: number, dir: HitDir): HitResult {
    return this.boss.partHit(this, fromX, dmg, dir);
  }

  harms() {
    return false;
  }

  vanish() {
    return null;
  }
}

// um braço: a parte de cima e o antebraço com o punho. O punho anda (x, y é o meio dele) e o cotovelo sai da
// conta dos dois ossos
type ArmState = 'grip' | 'up' | 'drop' | 'rest' | 'back' | 'raise' | 'low' | 'brace' | 'lift';
interface Arm {
  side: -1 | 1;
  upper: Phaser.GameObjects.Image;
  fore: Phaser.GameObjects.Image;
  fist: Phaser.GameObjects.Image;
  grip: Phaser.GameObjects.Image;
  pauldron: Phaser.GameObjects.Image;
  part: Part;
  st: ArmState;
  t: number;
  x: number;
  y: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  // quanto tempo o movimento dura
  dur: number;
  // na frente do chão (descendo no terraço) ou atrás (nas agulhas, levantado ou embaixo da borda)
  front: boolean;
  // caindo: machuca
  hot: boolean;
  shadow: Phaser.GameObjects.Ellipse;
  flash: number;
}

// a onda que corre rente ao chão a partir de um impacto
interface Shock {
  x: number;
  dir: 1 | -1;
  t: number;
  glow: Phaser.GameObjects.Image;
}

// a foice: o arco por cima (u: o pivô fica acima, o mais baixo no meio) ou por baixo (n), o lado de onde ela
// vem, o tempo e o ângulo da haste agora (0 aponta para o meio da arena)
interface Sweep {
  kind: 'u' | 'n';
  dir: 1 | -1;
  t: number;
  px: number;
  py: number;
  rIn: number;
  rOut: number;
  span: number;
  ang: number;
  on: boolean;
}

// uma conta de Âmbar: o brilho no chão avisa, depois ela cai de cima da tela
interface Bead {
  x: number;
  y: number;
  // a altura no quadro anterior: o golpe confere o caminho todo do quadro (no fim da queda ela anda mais que a altura
  // do cavaleiro num quadro de 30 por segundo, e passaria por ele)
  py: number;
  t: number;
  warn: number;
  falling: boolean;
  // chegou ao chão: quebra no quadro seguinte, depois de o golpe conferir o último pedaço da queda
  landed: boolean;
  img: Phaser.GameObjects.Image;
  glint: Phaser.GameObjects.Image;
  done: boolean;
}

// o que o espelho guardou do cavaleiro em cada quadro (como no Reflexo)
interface Rec {
  t: number;
  x: number;
  y: number;
  tex: string;
  frame: string | number;
  flip: boolean;
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  body: Box;
  atk: Box | null;
  slash: { tex: string; frame: string | number; x: number; y: number; ang: number; fx: boolean; fy: boolean; ox: number; oy: number; sx: number; sy: number } | null;
  lash: LashPose | null;
}

// O Carrasco Coroado (lore/torres.md): a versão dele que continua achando que todos os crimes foram necessários,
// feita das memórias que ele rejeitou, com a coroa da Coroação. Dorme embaixo das nuvens, atrás da torre. Quando
// o cavaleiro chega ao meio do terraço, o alçapão fecha, a torre treme e o colosso sobe: a cabeça logo embaixo
// do núcleo e as mãos agarradas nas agulhas. Primeira fase, o colosso (golpes em DEPTH.enemy, o corpo atrás do
// chão): o punho, a foice por cima e por baixo, a chuva de contas e a cabeça que desce. Segunda, o carrasco
// dourado do tamanho do cavaleiro, espelhado no meio da arena, que de tempos em tempos sai do espelho e investe.
// Vencido, ajoelha e oferece a coroa (quem abre a escolha é a cena).
export class Coroado implements BossFoe {
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
  // quanto a faixa do nome espera depois que ele acorda (a subida da primeira vez é mais longa)
  intro = 0;
  // o meio do terraço e o chão
  readonly c: number;
  readonly floorY: number;
  private readonly x0: number;
  private readonly x1: number;
  private readonly spires: [number, number];
  private t = 0;
  private time = 0;
  private thinkT = 0;
  private rage = false;
  private last: Attack[] = [];
  private queue: Attack[] = [];
  // o colosso: quanto ele está abaixo do lugar (a subida), o balanço do corpo, a cabeça (deslocamento, quanto
  // desceu na direção do chão e a escala) e a luz dos olhos
  private sink = 360;
  private headDX = 0;
  private headDrop = 0;
  private headScale = 1;
  private headTilt = 0;
  private chestDrop = 0;
  private eyes = 0;
  private headHot = false;
  private headFlash = 0;
  private gone = false;
  private readonly chest: Phaser.GameObjects.Image;
  private readonly head: Phaser.GameObjects.Image;
  private readonly crown: Phaser.GameObjects.Image;
  private readonly eyeGlow: Phaser.GameObjects.Image[];
  private readonly arms: Arm[];
  private readonly mask: Part;
  private shocks: Shock[] = [];
  private sweep: Sweep | null = null;
  private beads: Bead[] = [];
  private readonly blade: Phaser.GameObjects.Image;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly ga: Phaser.GameObjects.Graphics;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly beadFx: Phaser.GameObjects.Particles.ParticleEmitter;
  // a coroa caída (entre o colosso e o carrasco dourado)
  private fallen: { x: number; y: number; vy: number; rest: boolean } | null = null;
  // o carrasco dourado
  private recs: Rec[] = [];
  private shots: { t: number; x: number; y: number; dx: number; dy: number; orb: boolean }[] = [];
  private now = 0;
  private lag: number = C.delay;
  private target: number = C.delay;
  private freeze = 0;
  private cur: Rec | null = null;
  private mirror2 = false;
  private lungeT = 0;
  private lunge = { x: 0, from: 0, dir: 1 as 1 | -1, line: 0 };
  private lastSlash = false;
  private flashT = 0;
  private readonly slash: Phaser.GameObjects.Sprite;
  private readonly lashG: Phaser.GameObjects.Graphics;
  private readonly aura: Phaser.GameObjects.Image;
  private readonly crownS: Phaser.GameObjects.Image;
  private accused = 0;

  constructor(private scene: GameScene, x: number, feetY: number) {
    const a = scene.torres?.core ?? null;
    this.c = a?.c ?? x;
    this.floorY = a?.floorY ?? feetY;
    this.x0 = a?.x0 ?? x - 288;
    this.x1 = a?.x1 ?? x + 288;
    this.spires = a?.spires ?? [this.x0 + 12, this.x1 - 12];
    this.zone = scene.add.zone(this.c, this.floorY - PLAYER.bodyH / 2, PLAYER.bodyW, PLAYER.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.body.checkCollision.none = true;
    const D = CORE_DEPTH.colossus;
    this.chest = hd(scene.add.image(this.c, this.floorY, 'coroado', 'chest')).setOrigin(PART.chest.neck[0] / PART.chest.w, PART.chest.neck[1] / PART.chest.h).setDepth(D);
    this.head = hd(scene.add.image(this.c, this.floorY, 'coroado', 'head')).setOrigin(PART.head.neck[0] / PART.head.w, PART.head.neck[1] / PART.head.h).setDepth(D + 0.2);
    this.crown = hd(scene.add.image(this.c, this.floorY, 'coroado', 'crown')).setOrigin(PART.crown.base[0] / PART.crown.w, PART.crown.base[1] / PART.crown.h).setDepth(D + 0.25);
    this.eyeGlow = PART.head.eyes.map(() => scene.add.image(0, 0, 'glow').setTint(0xffb040).setBlendMode(Phaser.BlendModes.ADD).setScale(0.32, 0.22).setAlpha(0).setDepth(D + 0.3));
    this.arms = ([-1, 1] as const).map((side) => {
      const upper = hd(scene.add.image(0, 0, 'coroado', 'arm')).setOrigin(PART.arm.top[0] / PART.arm.w, PART.arm.top[1] / PART.arm.h).setFlipX(side > 0).setDepth(D + 0.1);
      const fore = hd(scene.add.image(0, 0, 'coroado', 'fore')).setOrigin(PART.fore.top[0] / PART.fore.w, PART.fore.top[1] / PART.fore.h).setFlipX(side > 0).setDepth(D + 0.5);
      const fist = hd(scene.add.image(0, 0, 'coroado', 'fist')).setOrigin(PART.fist.c[0] / PART.fist.w, PART.fist.c[1] / PART.fist.h).setFlipX(side > 0).setDepth(D + 0.52);
      // o espelho guarda a origem no mesmo lugar da imagem virada: do lado direito, a origem vira também
      const gx = PART.grip.pole[0] / PART.grip.w;
      const grip = hd(scene.add.image(0, 0, 'coroado', 'grip')).setOrigin(side > 0 ? 1 - gx : gx, PART.grip.pole[1] / PART.grip.h).setFlipX(side > 0).setDepth(CORE_DEPTH.spire + 0.05).setVisible(false);
      const jx = PART.pauldron.joint[0] / PART.pauldron.w;
      const pauldron = hd(scene.add.image(0, 0, 'coroado', 'pauldron')).setOrigin(side > 0 ? 1 - jx : jx, PART.pauldron.joint[1] / PART.pauldron.h).setFlipX(side > 0).setDepth(D + 0.15);
      const part = new Part(scene, this, side < 0 ? 'fistL' : 'fistR');
      const shadow = scene.add.ellipse(0, this.floorY + 1, 60, 10, 0x000000, 0.5).setDepth(DEPTH.prop + 0.4).setVisible(false);
      const g = this.gripAt(side);
      return { side, upper, fore, fist, grip, pauldron, part, st: 'grip', t: 0, x: g.x, y: g.y + 300, fx: g.x, fy: g.y, tx: g.x, ty: g.y, dur: 1, front: false, hot: false, shadow, flash: 0 } as Arm;
    });
    this.mask = new Part(scene, this, 'mask');
    this.blade = hd(scene.add.image(0, 0, 'coroado', 'blade')).setOrigin(PART.blade.root[0] / PART.blade.w, PART.blade.root[1] / PART.blade.h).setDepth(DEPTH.enemy - 0.3).setVisible(false);
    // a haste da foice fica atrás do chão do terraço (por baixo ela sobe de trás da borda), entre o antebraço e o punho
    this.g = scene.add.graphics().setDepth(CORE_DEPTH.colossus + 0.91);
    this.ga = scene.add.graphics().setDepth(DEPTH.enemy + 0.25).setBlendMode(Phaser.BlendModes.ADD);
    this.dust = scene.add.particles(0, 0, 'px', {
      lifespan: { min: 900, max: 2200 },
      speedX: { min: -50, max: 50 },
      speedY: { min: -70, max: -10 },
      gravityY: -10,
      scale: { start: 1.4, end: 0.2 },
      alpha: { start: 1, end: 0 },
      tint: [0xffd27a, 0xffe6a6, 0xd8a040, 0xfff4dc],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(DEPTH.enemy + 0.3);
    this.beadFx = scene.add.particles(0, 0, 'px', {
      lifespan: { min: 300, max: 700 },
      speed: { min: 40, max: 150 },
      angle: { min: 200, max: 340 },
      gravityY: 500,
      scale: { start: 1.2, end: 0.3 },
      alpha: { start: 1, end: 0 },
      tint: [0xffb040, 0xffd27a, 0xc8641c],
      emitting: false,
    }).setDepth(DEPTH.enemy + 0.3);
    // o carrasco dourado (escondido até o colosso cair)
    const tex = scene.player?.sprite.texture.key ?? 'knight-scythe';
    this.sprite = hd(scene.add.sprite(this.c, this.floorY, tex, 0).setDepth(DEPTH.enemy)).setVisible(false);
    this.slash = scene.add.sprite(0, 0, 'slash', 0).setDepth(DEPTH.slash).setVisible(false);
    this.lashG = scene.add.graphics().setDepth(DEPTH.slash);
    this.aura = scene.add.image(this.c, this.floorY - 22, 'glow').setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy - 0.2).setAlpha(0).setScale(1.3, 1.7);
    this.crownS = hd(scene.add.image(0, 0, 'coroado', 'crown-s')).setOrigin(PART.crownS.base[0] / PART.crownS.w, PART.crownS.base[1] / PART.crownS.h).setDepth(DEPTH.enemy + 0.1).setVisible(false);
    // as partes que levam golpe entram na lista da cena junto com ele
    scene.enemies.push(this.mask, ...this.arms.map((a) => a.part));
    this.layout();
  }

  // ---------- o que a cena lê ----------
  get rect() {
    if (this.inMirror && this.cur) return rectOf(this.cur.body);
    return NOWHERE;
  }

  get sleeping() {
    return this.state === 'sleep';
  }

  // o carrasco dourado está na arena (do fim do pó até ajoelhar)
  private get inMirror() {
    return this.state === 'mirror' || this.state === 'lungewind' || this.state === 'lunge' || this.state === 'lungeback' || this.state === 'stagger';
  }

  private get colossus() {
    return !this.gone && this.state !== 'crumble' && this.state !== 'form' && !this.inMirror && this.state !== 'kneel' && this.state !== 'offer';
  }

  // onde o punho segura cada agulha
  private gripAt(side: -1 | 1) {
    return { x: this.spires[side < 0 ? 0 : 1] - side * 4, y: this.floorY - GRIP };
  }

  // o ombro de cada lado, no mundo
  private shoulder(side: -1 | 1) {
    const n = this.neck();
    return { x: n.x + side * (PART.chest.neck[0] - PART.chest.shoulder[0]), y: n.y + (PART.chest.shoulder[1] - PART.chest.neck[1]) };
  }

  private neck() {
    return { x: this.c, y: this.floorY - NECK_H + this.sink + this.chestDrop + Math.sin(this.time * 1.9) * 1.5 };
  }

  // ---------- acordar e a subida ----------
  wake() {
    if (this.state !== 'sleep') return;
    const s = this.scene;
    const again = progress.seen.has('coroado:met');
    progress.seen.add('coroado:met');
    s.markDirty();
    const dur = again ? C.riseAgain : C.rise;
    this.intro = Math.round((dur - 0.5) * 1000);
    this.go('rise');
    this.riseDur = dur;
    // o alçapão bate, a torre treme e a câmera para onde mostra o terraço inteiro
    s.fixtures.closeTrapdoors('boss:coroado');
    s.lockCamera(this.c, this.floorY - 333 + 180);
    s.cinematic = true;
    const p = s.player;
    p.frozen = true;
    p.body.setVelocity(0, 0);
    s.sfx('quake', 1, 0.6);
    s.cameras.main.shake(dur * 1000 * 0.75, 0.004);
  }

  private riseDur: number = C.rise;

  private go(st: State) {
    this.state = st;
    this.t = 0;
  }

  // ---------- quadro a quadro ----------
  update(dt: number) {
    this.time += dt;
    this.t += dt;
    if (this.state === 'sleep') {
      this.layout();
      return;
    }
    switch (this.state) {
      case 'rise':
        this.updateRise(dt);
        break;
      case 'idle':
        this.thinkT -= dt;
        if (this.thinkT <= 0) this.choose();
        break;
      case 'slam':
        if (this.arms.every((a) => a.st === 'grip')) this.toIdle();
        break;
      case 'sweepwarn':
        if (this.t >= C.sweepWarn) this.startSweep();
        break;
      case 'sweep':
        this.updateSweep();
        break;
      case 'sweeprec':
        if (this.t >= C.sweepRec) this.toIdle();
        break;
      case 'beadwind':
        this.headTilt = -0.12 * ease(Math.min(1, this.t / 0.5));
        if (this.t >= 0.55) this.rain();
        break;
      case 'beads':
        this.headTilt *= 1 - Math.min(1, dt * 4);
        if (this.beads.every((b) => b.done)) this.toIdle();
        break;
      case 'leanwind':
        this.headDrop = -10 * ease(Math.min(1, this.t / C.leanWind));
        this.eyes = 1;
        if (this.t >= C.leanWind) this.leanDown();
        break;
      case 'leandrop': {
        const k = Math.min(1, this.t / C.leanDrop);
        this.headDrop = -10 + (this.leanDepth() + 10) * k * k;
        this.headScale = 1 + 0.18 * k;
        this.chestDrop = 48 * k;
        if (k >= 1) this.leanLand();
        break;
      }
      case 'leanrest':
        // o impacto ainda machuca um instante: no quadro em que ela chega ao chão o golpe confere a cabeça lá embaixo
        // (a 30 quadros por segundo o último pedaço da descida passaria por cima do cavaleiro)
        if (this.headHot && this.t >= 0.1) this.headHot = false;
        if (this.t >= (this.rage ? C.leanRest2 : C.leanRest)) this.leanUp();
        break;
      case 'leanrise': {
        const k = ease(Math.min(1, this.t / C.leanRise));
        this.headDrop = this.leanDepth() * (1 - k);
        this.headScale = 1.18 - 0.18 * k;
        this.chestDrop = 48 * (1 - k);
        if (this.t > C.leanRise * 0.5) this.setHeadFront(false);
        if (k >= 1 && this.arms.every((a) => a.st === 'grip')) this.toIdle();
        break;
      }
      case 'crumble':
        this.updateCrumble(dt);
        break;
      case 'form':
        this.updateForm(dt);
        break;
      case 'mirror':
      case 'lungewind':
      case 'lunge':
      case 'lungeback':
      case 'stagger':
        this.updateMirror(dt);
        break;
      case 'kneel':
      case 'offer':
        break;
    }
    if (this.colossus) {
      // a cabeça acompanha o cavaleiro devagar
      const p = this.scene.player;
      const want = this.state === 'leanrest' || this.state === 'leandrop' ? 0 : Phaser.Math.Clamp((p.x - this.c) * 0.03, -7, 7);
      this.headDX += (want - this.headDX) * Math.min(1, dt * 2);
      const lit = this.state === 'idle' ? 0.55 + 0.15 * Math.sin(this.time * 3) : 1;
      this.eyes += (lit - this.eyes) * Math.min(1, dt * 5);
      for (const a of this.arms) this.updateArm(a, dt);
    }
    this.updateShocks(dt);
    this.updateBeads(dt);
    this.updateFallen(dt);
    if (this.headFlash > 0) {
      this.headFlash -= dt;
      if (this.headFlash <= 0) this.head.clearTint();
    }
    this.layout();
    this.drawFx();
  }

  private updateRise(_dt: number) {
    const D = this.riseDur;
    const s = this.scene;
    // do fundo das nuvens até o lugar (a cabeça primeiro), as mãos sobem e agarram as agulhas no fim
    const k = ease(Phaser.Math.Clamp((this.t - D * 0.12) / (D * 0.6), 0, 1));
    this.sink = 360 * (1 - k);
    if (Math.random() < 0.5 && this.t < D * 0.75) this.dust.emitParticle(2, this.c + (Math.random() - 0.5) * 400, this.floorY - 4);
    const grab = (this.t - D * 0.68) / (D * 0.16);
    for (const a of this.arms) {
      const g = this.gripAt(a.side);
      const kk = ease(Phaser.Math.Clamp(grab, 0, 1));
      a.x = g.x;
      a.y = g.y + 260 * (1 - kk);
      if (grab >= 1 && a.st !== 'grip') {
        a.st = 'grip';
        s.sfx('clang', 0.9, 0.55);
        s.sfx('thud', 0.8, 0.6);
        s.cameras.main.shake(260, 0.006);
        this.dust.emitParticle(10, g.x, g.y);
      } else if (grab < 1) a.st = 'lift';
    }
    this.eyes = Phaser.Math.Clamp((this.t - D * 0.82) / (D * 0.12), 0, 1);
    if (this.t >= D * 0.82 && !this.roared) {
      this.roared = true;
      s.sfx('roar', 0.8, 0.5);
      s.sfx('bell', 0.6, 0.45);
    }
    if (this.t >= D) {
      for (const a of this.arms) a.st = 'grip';
      this.sink = 0;
      s.cinematic = false;
      s.player.frozen = false;
      this.toIdle(0.6);
    }
  }

  private roared = false;

  private toIdle(think?: number) {
    this.go('idle');
    this.thinkT = think ?? (this.rage ? C.think2 : C.think);
  }

  // ---------- a escolha do golpe ----------
  private choose() {
    const next = this.queue.shift();
    if (next) {
      this.start(next);
      return;
    }
    const p = this.scene.player;
    const opts: Attack[] = ['slam', 'slam', 'sweepU', 'sweepN', 'beads', 'lean'];
    // a cabeça desce de vez em quando (pelo menos uma vez a cada quatro golpes)
    const sinceLean = this.last.indexOf('lean');
    let pick: Attack;
    if (this.last.length >= 4 && (sinceLean < 0 || sinceLean >= 3)) pick = 'lean';
    else {
      const pool = opts.filter((o) => o !== this.last[0] && !(o.startsWith('sweep') && this.last[0]?.startsWith('sweep')));
      // a foice escolhe o arco que pega o cavaleiro onde ele está (no meio, a de cima; nas pontas, a de baixo)
      const near = Math.abs(p.x - this.c) < 150;
      pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick === 'sweepU' || pick === 'sweepN') pick = near ? 'sweepU' : 'sweepN';
    }
    this.last.unshift(pick);
    this.last.length = Math.min(this.last.length, 6);
    // na metade do colosso os golpes emendam
    if (this.rage) {
      if (pick === 'slam') this.queue.push('slam');
      else if (pick === 'sweepU' || pick === 'sweepN') this.queue.push('beads');
    }
    this.start(pick);
  }

  private start(a: Attack) {
    switch (a) {
      case 'slam':
        this.slam();
        break;
      case 'sweepU':
      case 'sweepN':
        this.warnSweep(a === 'sweepU' ? 'u' : 'n');
        break;
      case 'beads':
        this.go('beadwind');
        this.scene.sfx('glass', 0.5, 0.5);
        break;
      case 'lean':
        this.go('leanwind');
        this.scene.sfx('roar', 0.6, 0.65);
        for (const arm of this.arms) this.moveArm(arm, 'lift', arm.x, arm.y - 40, C.leanWind);
        break;
    }
  }

  // ---------- o punho ----------
  private slam() {
    const p = this.scene.player;
    // o braço do lado do cavaleiro (na emenda, o outro)
    let side: -1 | 1 = p.x < this.c ? -1 : 1;
    const busy = this.arms.find((a) => a.st !== 'grip');
    if (busy) side = (-busy.side) as -1 | 1;
    const arm = this.arms[side < 0 ? 0 : 1];
    if (arm.st !== 'grip') return;
    this.go('slam');
    this.moveArm(arm, 'up', p.x, this.floorY - C.slamHover, C.slamUp);
    arm.front = true;
    arm.shadow.setVisible(true);
    this.scene.sfx('swoosh', 0.6, 0.45);
  }

  private moveArm(a: Arm, st: ArmState, tx: number, ty: number, dur: number) {
    a.st = st;
    a.t = 0;
    a.fx = a.x;
    a.fy = a.y;
    a.tx = tx;
    a.ty = ty;
    a.dur = dur;
  }

  private updateArm(a: Arm, dt: number) {
    a.t += dt;
    const s = this.scene;
    const p = s.player;
    const k = Math.min(1, a.t / a.dur);
    a.hot = false;
    switch (a.st) {
      case 'grip': {
        const g = this.gripAt(a.side);
        a.x = g.x;
        a.y = g.y + Math.sin(this.time * 1.9 + a.side) * 1.2;
        a.front = false;
        break;
      }
      case 'up': {
        // sobe por cima e segue o cavaleiro; no fim trava
        if (a.t < a.dur - C.slamLock) a.tx += (Phaser.Math.Clamp(p.x, this.x0 + FIST_HW, this.x1 - FIST_HW) - a.tx) * Math.min(1, dt * 6);
        const e = ease(k);
        a.x = Phaser.Math.Linear(a.fx, a.tx, e);
        a.y = Phaser.Math.Linear(a.fy, a.ty, e) - Math.sin(Math.PI * k) * 40;
        a.shadow.setPosition(a.x, this.floorY + 1).setSize(30 + 40 * k, 6 + 5 * k).setAlpha(0.15 + 0.4 * k);
        if (k >= 1) {
          this.moveArm(a, 'drop', a.x, this.floorY - FIST_REST, C.slamDrop);
          s.sfx('swoosh', 0.8, 0.6);
        }
        break;
      }
      case 'drop': {
        a.x = a.fx;
        a.y = Phaser.Math.Linear(a.fy, a.ty, k * k);
        a.hot = true;
        if (k >= 1) this.slamLand(a);
        break;
      }
      case 'rest':
        a.x = a.tx;
        a.y = a.ty;
        if (a.t >= a.dur) this.moveArm(a, 'back', this.gripAt(a.side).x, this.gripAt(a.side).y, C.slamBack);
        break;
      case 'back': {
        const e = ease(k);
        const g = this.gripAt(a.side);
        a.tx = g.x;
        a.ty = g.y;
        a.x = Phaser.Math.Linear(a.fx, a.tx, e);
        a.y = Phaser.Math.Linear(a.fy, a.ty, e) - Math.sin(Math.PI * k) * 60;
        a.shadow.setVisible(false);
        if (k > 0.4) a.front = false;
        if (k >= 1) a.st = 'grip';
        break;
      }
      case 'raise':
      case 'low':
      case 'lift': {
        const e = ease(k);
        a.x = Phaser.Math.Linear(a.fx, a.tx, e);
        a.y = Phaser.Math.Linear(a.fy, a.ty, e);
        break;
      }
      case 'brace':
        a.x = a.tx;
        a.y = a.ty;
        break;
    }
    if (a.flash > 0) {
      a.flash -= dt;
      if (a.flash <= 0) for (const img of [a.upper, a.fore, a.fist]) img.clearTint();
    }
    // dá para bater no punho apoiado no chão (depois do golpe e com a cabeça embaixo)
    const open = a.st === 'rest' || (a.st === 'brace' && this.state === 'leanrest');
    a.part.place(open ? this.fistBox(a) : null);
  }

  private fistBox(a: Arm) {
    return new Phaser.Geom.Rectangle(a.x - FIST_HW, a.y - FIST_HH, FIST_HW * 2, FIST_HH * 2);
  }

  private slamLand(a: Arm) {
    const s = this.scene;
    this.moveArm(a, 'rest', a.x, this.floorY - FIST_REST, this.rage ? C.slamRest2 : C.slamRest);
    a.shadow.setVisible(false);
    s.sfx('quake', 0.9, 0.8);
    s.sfx('thud', 1, 0.5);
    s.cameras.main.shake(240, 0.008);
    s.dustBurst(a.x, this.floorY, 18);
    this.dust.emitParticle(8, a.x, this.floorY - 6);
    this.shock(a.x - FIST_HW, -1);
    this.shock(a.x + FIST_HW, 1);
    // na emenda, o outro punho já sobe
    if (this.queue[0] === 'slam' && this.state === 'slam') {
      this.queue.shift();
      const other = this.arms[a.side < 0 ? 1 : 0];
      if (other.st === 'grip') {
        const p = s.player;
        this.moveArm(other, 'up', p.x, this.floorY - C.slamHover, C.slamUp * 0.8);
        other.front = true;
        other.shadow.setVisible(true);
      }
    }
  }

  private shock(x: number, dir: 1 | -1) {
    const glow = this.scene.add.image(x, this.floorY - 4, 'glow').setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.7, 0.3).setAlpha(0.8).setDepth(DEPTH.enemy + 0.2);
    this.shocks.push({ x, dir, t: 0, glow });
  }

  private updateShocks(dt: number) {
    for (const w of this.shocks) {
      w.t += dt;
      w.x += w.dir * C.shockSpeed * dt;
      const k = w.t / C.shockLife;
      w.glow.setPosition(w.x, this.floorY - 5).setAlpha(0.85 * (1 - k)).setScale(0.7 - 0.2 * k, 0.32);
      if (Math.random() < 0.6) this.scene.dustBurst(w.x, this.floorY, 1);
      // a onda para nas pontas do chão
      if (w.x < this.x0 || w.x > this.x1) w.t = C.shockLife;
    }
    this.shocks = this.shocks.filter((w) => {
      if (w.t < C.shockLife) return true;
      w.glow.destroy();
      return false;
    });
  }

  // ---------- a foice ----------
  private warnSweep(kind: 'u' | 'n') {
    const p = this.scene.player;
    // vem do lado oposto ao do cavaleiro (dá tempo de ver o rastro inteiro)
    const dir: 1 | -1 = p.x > this.c ? -1 : 1;
    const u = kind === 'u';
    const rOut = u ? C.sweepR : C.sweepR2 + C.bladeT;
    const rIn = rOut - C.bladeT;
    // o braço do lado de onde ela vem: por cima, o punho sobe e a foice fica pendurada nele (o pivô); por baixo,
    // a mão desce atrás da borda do terraço e a haste sobe de lá
    const arm = this.arms[dir > 0 ? 0 : 1];
    const px = u ? this.c + arm.side * C.sweepX : this.c;
    const py = u ? this.floorY - C.sweepR : this.floorY - C.sweepLift + C.sweepR2;
    this.sweep = { kind, dir, t: 0, px, py, rIn, rOut, span: u ? C.sweepSpan : C.sweepSpan2, ang: -dir * (u ? C.sweepSpan : C.sweepSpan2), on: false };
    this.go('sweepwarn');
    if (arm.st === 'grip') {
      const sh = this.shoulder(arm.side);
      if (u) this.moveArm(arm, 'raise', px, py, C.sweepWarn * 0.8);
      else this.moveArm(arm, 'low', sh.x + arm.side * 90, this.floorY + 90, C.sweepWarn);
    }
    this.scene.sfx('beam', 0.5, 0.6);
  }

  private startSweep() {
    const sw = this.sweep!;
    sw.on = true;
    sw.t = 0;
    this.go('sweep');
    this.showBlade(sw);
    this.blade.setAlpha(1);
    this.scene.sfx('swoosh', 1, 0.4);
    this.scene.sfx('glass', 0.4, 0.5);
  }

  // a lâmina na ponta da haste (a virada guarda a origem no mesmo lugar da imagem: a raiz vira junto)
  private showBlade(sw: Sweep) {
    const ox = PART.blade.root[0] / PART.blade.w;
    const oy = PART.blade.root[1] / PART.blade.h;
    this.blade.setVisible(true).setFlipX(sw.dir < 0).setFlipY(sw.kind === 'n').setOrigin(sw.dir < 0 ? 1 - ox : ox, sw.kind === 'n' ? 1 - oy : oy);
  }

  private updateSweep() {
    const sw = this.sweep!;
    const k = Math.min(1, this.t / C.sweepTime);
    // pêndulo: devagar nas pontas, rápida no meio
    sw.ang = -sw.dir * sw.span * Math.cos(Math.PI * k);
    if (k > 0.45 && k < 0.47) this.scene.sfx('swoosh', 0.7, 0.55);
    if (k >= 1) {
      sw.on = false;
      this.blade.setVisible(false);
      this.sweep = null;
      this.go('sweeprec');
      for (const a of this.arms) if (a.st === 'raise' || a.st === 'low') this.moveArm(a, 'back', a.x, a.y, C.sweepRec + 0.2);
    }
  }

  // o ponto do arco no ângulo dado (0 aponta para o meio da arena: para baixo no arco de cima, para cima no de baixo)
  private arcPoint(sw: Sweep, ang: number, r: number) {
    const down = sw.kind === 'u' ? 1 : -1;
    return { x: sw.px + Math.sin(ang) * r, y: sw.py + Math.cos(ang) * r * down };
  }

  // a lâmina pega o retângulo? O retângulo vira um pedaço de anel (o raio mais perto e o mais longe, os ângulos
  // dos cantos) e confere com o pedaço da lâmina (da haste para a frente, na direção em que ela vai)
  private bladeHits(pr: Phaser.Geom.Rectangle) {
    const sw = this.sweep;
    if (!sw || !sw.on) return false;
    const down = sw.kind === 'u' ? 1 : -1;
    const cx = Phaser.Math.Clamp(sw.px, pr.x, pr.right);
    const cy = Phaser.Math.Clamp(sw.py, pr.y, pr.bottom);
    const rMin = Math.hypot(cx - sw.px, cy - sw.py);
    let rMax = 0;
    let aMin = Infinity;
    let aMax = -Infinity;
    for (const [x, y] of [[pr.x, pr.y], [pr.right, pr.y], [pr.x, pr.bottom], [pr.right, pr.bottom]]) {
      rMax = Math.max(rMax, Math.hypot(x - sw.px, y - sw.py));
      const a = Math.atan2(x - sw.px, (y - sw.py) * down);
      aMin = Math.min(aMin, a);
      aMax = Math.max(aMax, a);
    }
    if (rMax < sw.rIn || rMin > sw.rOut) return false;
    const reach = C.bladeLen / sw.rOut;
    const b0 = Math.min(sw.ang, sw.ang + sw.dir * reach);
    const b1 = Math.max(sw.ang, sw.ang + sw.dir * reach);
    return aMax >= b0 && aMin <= b1;
  }

  // ---------- as contas ----------
  private rain() {
    const s = this.scene;
    this.go('beads');
    s.sfx('glass', 0.9, 0.7);
    s.sfx('coinrain', 0.5, 0.6);
    const n = this.rage ? C.beads2 : C.beads;
    // as contas caem espalhadas pelo terraço, numa ordem que corre de um lado para o outro e volta; sobra
    // sempre um vão sem nenhuma (perto de onde o cavaleiro não está)
    const p = s.player;
    const w = this.x1 - this.x0 - 24;
    const slots = Math.floor(w / 30);
    const free = new Set<number>();
    let gap = Math.floor(Math.random() * (slots - 2));
    if (Math.abs(this.x0 + 12 + gap * 30 - p.x) < 60) gap = (gap + Math.floor(slots / 2)) % (slots - 2);
    free.add(gap).add(gap + 1);
    const pool = [...Array(slots).keys()].filter((i) => !free.has(i));
    Phaser.Utils.Array.Shuffle(pool);
    // a primeira cai em cima de onde o cavaleiro está
    const mine = Phaser.Math.Clamp(Math.floor((p.x - this.x0 - 12) / 30), 0, slots - 1);
    if (!free.has(mine)) pool.unshift(mine);
    const picked = [...new Set(pool)].slice(0, n);
    const hx = this.head.x;
    const hy = this.head.y - 60;
    picked.forEach((slot, i) => {
      // a primeira mira o cavaleiro mesmo (não o meio do pedaço onde ele está)
      const aim = i === 0 && slot === mine;
      const x = aim ? Phaser.Math.Clamp(p.x, this.x0 + 12, this.x1 - 12) : this.x0 + 12 + slot * 30 + 15 + (Math.random() - 0.5) * 10;
      const glint = s.add.image(x, this.floorY - 2, 'glow').setTint(0xffb040).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2, 0.1).setAlpha(0).setDepth(DEPTH.enemy + 0.3);
      const img = hd(s.add.image(hx, hy, 'coroado', 'bead')).setDepth(DEPTH.enemy + 0.2).setVisible(false);
      this.beads.push({ x, y: hy, py: hy, t: -i * C.beadStep, warn: C.beadWarn, falling: false, landed: false, img, glint, done: false });
    });
    // as contas saltam do capuz para o alto antes de cair
    for (let i = 0; i < 14; i++) {
      const b = hd(s.add.image(hx + (Math.random() - 0.5) * 50, hy, 'coroado', 'bead')).setDepth(CORE_DEPTH.colossus + 0.4);
      s.tweens.add({ targets: b, y: s.cameras.main.worldView.y - 20, x: b.x + (Math.random() - 0.5) * 160, duration: 380 + Math.random() * 200, ease: 'Quad.easeOut', onComplete: () => b.destroy() });
    }
  }

  private updateBeads(dt: number) {
    const s = this.scene;
    const top = s.cameras.main.worldView.y - 16;
    for (const b of this.beads) {
      if (b.done) continue;
      b.t += dt;
      if (b.t < 0) continue;
      if (b.t < b.warn) {
        // o brilho no chão cresce até a conta cair
        const k = b.t / b.warn;
        b.glint.setAlpha(0.4 + 0.55 * k + Math.sin(this.time * 30) * 0.1).setScale(0.26 + 0.3 * k, 0.1 + 0.08 * k);
        continue;
      }
      if (b.landed) {
        this.breakBead(b, false);
        continue;
      }
      const k = Math.min(1, (b.t - b.warn) / C.beadFall);
      const y = Phaser.Math.Linear(top, this.floorY - 5, k * k);
      b.py = b.falling ? b.y : y;
      if (!b.falling) {
        b.falling = true;
        b.img.setVisible(true);
      }
      b.y = y;
      b.img.setPosition(b.x, b.y).setRotation(this.time * 8);
      if (k >= 1) b.landed = true;
    }
    this.beads = this.beads.filter((b) => !b.done || b.img.active);
  }

  private beadBox(b: Bead) {
    const y0 = Math.min(b.py, b.y);
    return new Phaser.Geom.Rectangle(b.x - 5, y0 - 5, 10, Math.abs(b.y - b.py) + 10);
  }

  private breakBead(b: Bead, onPlayer: boolean) {
    const s = this.scene;
    b.done = true;
    b.falling = false;
    this.beadFx.explode(onPlayer ? 10 : 6, b.x, b.y);
    s.sfx('tink', onPlayer ? 0.7 : 0.4, 0.8 + Math.random() * 0.4);
    if (!onPlayer) s.sfx('glass', 0.18, 1.6 + Math.random() * 0.4);
    b.img.destroy();
    s.tweens.add({ targets: b.glint, alpha: 0, duration: 200, onComplete: () => b.glint.destroy() });
  }

  // ---------- a cabeça desce ----------
  // quanto a cabeça desce para a beira do capuz encostar no chão do terraço
  private leanDepth() {
    return NECK_H - 4 * 1.18;
  }

  private setHeadFront(on: boolean) {
    const d = on ? DEPTH.enemy - 0.5 : CORE_DEPTH.colossus + 0.2;
    this.head.setDepth(d);
    this.crown.setDepth(d + 0.05);
    for (const e of this.eyeGlow) e.setDepth(d + 0.1);
  }

  private leanDown() {
    const s = this.scene;
    this.go('leandrop');
    this.setHeadFront(true);
    this.headHot = true;
    // as mãos descem ao mesmo tempo e se apoiam nas pontas do terraço
    for (const a of this.arms) {
      a.front = true;
      this.moveArm(a, 'brace', this.c + a.side * 230, this.floorY - FIST_REST, C.leanDrop);
      a.st = 'lift';
    }
    s.sfx('swoosh', 1, 0.35);
  }

  private leanLand() {
    const s = this.scene;
    this.go('leanrest');
    for (const a of this.arms) {
      a.st = 'brace';
      a.x = a.tx;
      a.y = a.ty;
    }
    s.sfx('quake', 1, 0.6);
    s.sfx('thud', 1, 0.4);
    s.cameras.main.shake(360, 0.01);
    s.dustBurst(this.c, this.floorY, 24);
    for (const a of this.arms) s.dustBurst(a.x, this.floorY, 10);
    this.shock(this.c - 50, -1);
    this.shock(this.c + 50, 1);
    s.thinkOnce('coroado:lean', 'A máscara desceu até o chão. De perto, as rachaduras dela são as minhas.');
  }

  private leanUp() {
    this.go('leanrise');
    for (const a of this.arms) {
      const g = this.gripAt(a.side);
      this.moveArm(a, 'back', g.x, g.y, C.leanRise);
    }
  }

  private headBox() {
    const m = PART.head.mask;
    const k = this.headScale;
    const nx = this.head.x;
    const ny = this.head.y;
    return new Phaser.Geom.Rectangle(nx + (m[0] - PART.head.neck[0]) * k, ny + (m[1] - PART.head.neck[1]) * k, m[2] * k, m[3] * k);
  }

  // ---------- golpes que ele leva ----------
  partHit(part: Part, fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive || !this.colossus) return 'ignored';
    const s = this.scene;
    let mul = 1;
    if (part === this.mask) mul = this.state === 'leanrest' ? C.maskMul : 1;
    else mul = C.fistMul;
    this.damage(dmg * mul);
    if (part === this.mask) {
      this.head.setTintFill(0xfff4dc);
      this.headFlash = 0.07;
      s.sfx('glass', 0.45, 1.1 + Math.random() * 0.3);
    } else {
      const a = this.arms.find((q) => q.part === part)!;
      a.fore.setTintFill(0xfff4dc);
      a.fist.setTintFill(0xfff4dc);
      a.flash = 0.07;
      s.sfx('clang', 0.35, 1.3);
    }
    const r = part.rect;
    this.dust.emitParticle(5, Phaser.Math.Clamp(fromX, r.x, r.right), r.centerY);
    return 'hit';
  }

  hit(_fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive || !this.inMirror) return 'ignored';
    const s = this.scene;
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    this.damage(dmg);
    this.flashT = 0.08;
    this.sprite.setTintFill(0xfff4dc);
    // o golpe trava a imagem um instante
    if (this.state === 'mirror') this.freeze = C.stutter;
    this.dust.emitParticle(6, this.sprite.x, this.sprite.y - 24);
    s.sfx('glass', 0.35, 1.3 + Math.random() * 0.3);
    return 'hit';
  }

  private damage(n: number) {
    const s = this.scene;
    if (this.colossus) {
      this.hp = Math.max(C.mirrorHp, this.hp - n);
      if (!this.rage && this.hp <= C.rage) {
        this.rage = true;
        s.cameras.main.shake(500, 0.005);
        s.sfx('roar', 0.7, 0.55);
        s.thinkOnce('coroado:rage', 'Ele não sente o golpe. Sente cada memória que eu tiro dele.');
      }
      if (this.hp <= C.mirrorHp) this.crumble();
      return;
    }
    this.hp = Math.max(0, this.hp - n);
    if (!this.mirror2 && this.hp <= C.mirrorHp / 2) {
      this.mirror2 = true;
      this.target = C.delay2;
      s.cameras.main.flash(180, 255, 210, 140);
      s.thinkOnce('coroado:half', 'Ele está me alcançando. Cada vez mais perto do que eu acabei de fazer.');
    }
    if (this.hp <= 0) this.kneel();
  }

  // ---------- o colosso cai ----------
  private crumble() {
    const s = this.scene;
    this.go('crumble');
    this.queue = [];
    this.headHot = false;
    this.sweep = null;
    this.blade.setVisible(false);
    for (const b of this.beads) if (!b.done) this.breakBead(b, false);
    for (const a of this.arms) {
      a.hot = false;
      a.shadow.setVisible(false);
      a.part.place(null);
    }
    this.mask.place(null);
    s.cameras.main.flash(300, 255, 220, 150);
    s.cameras.main.shake(2200, 0.006);
    s.sfx('break', 1, 0.5);
    s.sfx('glass', 1, 0.45);
    s.hitstop(0.2);
    audio.music('none', 1.6);
    // a coroa solta da cabeça e cai no meio do terraço
    this.fallen = { x: this.crown.x, y: this.crown.y, vy: -120, rest: false };
  }

  private readonly burst = new Set<number>();

  private updateCrumble(dt: number) {
    const k = Math.min(1, this.t / C.crumble);
    // vira pó de ouro de cima para baixo: a cabeça primeiro, depois os ombros e os braços, o peito por último;
    // cada parte some soltando o pó e um clarão quando começa
    const groups: [Phaser.GameObjects.Image[], number][] = [
      [[this.head], 0],
      [this.arms.flatMap((q) => [q.pauldron, q.upper]), 0.16],
      [this.arms.flatMap((q) => [q.fore, q.fist, q.grip]), 0.28],
      [[this.chest], 0.42],
    ];
    for (const [i, [imgs, at]] of groups.entries()) {
      const q = Phaser.Math.Clamp((k - at) / 0.55, 0, 1);
      if (q > 0 && !this.burst.has(i)) {
        this.burst.add(i);
        for (const img of imgs) if (img.visible) this.scene.glowBurst(img.getBounds().centerX, img.getBounds().centerY, GOLD, 2);
        this.scene.sfx('glass', 0.5, 0.7 + i * 0.1);
      }
      for (const img of imgs) {
        img.setAlpha(1 - ease(q));
        if (q > 0 && q < 1 && img.visible && Math.random() < 0.7) {
          const b = img.getBounds();
          this.dust.emitParticle(3, b.x + Math.random() * b.width, b.y + Math.random() * b.height * (1 - q * 0.6));
        }
      }
    }
    this.eyes = 1 - ease(Math.min(1, k / 0.4));
    this.sink += dt * 20 * k;
    if (k >= 1) {
      this.gone = true;
      for (const img of this.bodyImgs()) img.setVisible(false);
      for (const e of this.eyeGlow) e.setVisible(false);
      this.go('form');
    }
  }

  private updateFallen(dt: number) {
    const f = this.fallen;
    if (!f || f.rest) return;
    f.vy += 900 * dt;
    f.y += f.vy * dt;
    f.x += (this.c - f.x) * Math.min(1, dt * 2);
    const ground = this.floorY - 1;
    if (f.y >= ground) {
      f.y = ground;
      if (f.vy > 160) {
        f.vy = -f.vy * 0.3;
        this.scene.sfx('clang', 0.8, 0.9);
        this.scene.dustBurst(f.x, this.floorY, 8);
      } else {
        f.vy = 0;
        f.rest = true;
      }
    }
    this.crown.setPosition(f.x, f.y).setRotation(Math.sin(this.time * 9) * (f.rest ? 0 : 0.2)).setDepth(DEPTH.enemy - 0.1);
  }

  // o pó volta para a coroa e vira o carrasco dourado, do tamanho do cavaleiro
  private updateForm(_dt: number) {
    const s = this.scene;
    const k = Math.min(1, this.t / C.form);
    const f = this.fallen;
    const x = f?.x ?? this.c;
    if (k < 0.7 && Math.random() < 0.8) {
      // o pó corre para a coroa
      const a = Math.random() * Math.PI * 2;
      const r = 80 + Math.random() * 120;
      const px = x + Math.cos(a) * r;
      const py = this.floorY - 30 + Math.sin(a) * r * 0.6;
      const d = s.add.image(px, py, 'px').setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy + 0.3).setScale(1.4);
      s.tweens.add({ targets: d, x, y: this.floorY - 24, alpha: 0.2, duration: 500, ease: 'Quad.easeIn', onComplete: () => d.destroy() });
    }
    if (k >= 0.55 && !this.sprite.visible) {
      this.recordNow();
      this.sprite.setVisible(true).setAlpha(0);
      this.look();
      this.sprite.setPosition(x, this.floorY);
      s.glowBurst(x, this.floorY - 24, GOLD, 4);
      s.sfx('veil-form', 0.8, 1.2);
      s.sfx('bell', 0.6, 0.7);
    }
    if (this.sprite.visible) this.sprite.setAlpha(Math.min(1, (k - 0.55) / 0.3));
    if (k >= 1) {
      this.crown.setVisible(false);
      this.crownS.setVisible(true);
      this.aura.setAlpha(0.3);
      this.lag = C.delay + 0.4;
      this.lungeT = Phaser.Math.FloatBetween(C.lungeEvery[0], C.lungeEvery[1]);
      this.go('mirror');
      audio.music('boss9', 0.6);
      ui.say('O Carrasco Coroado', 'Tudo o que eu fiz, você fez. Só que eu não esqueci.', 5200);
    }
  }

  // o dourado do carrasco: as cores do cavaleiro viram ouro pela claridade (a máscara clara, a capa e a armadura
  // em tons de ouro velho), com o brilho em volta; o golpe pinta de branco por um instante
  private look() {
    const s = this.sprite;
    if (!this.gilded && s.preFX) {
      this.gilded = true;
      s.preFX.addColorMatrix().set([0.39, 0.77, 0.14, 0, 34, 0.3, 0.59, 0.11, 0, 16, 0.12, 0.24, 0.05, 0, 0, 0, 0, 0, 1, 0]);
      s.preFX.addGlow(GOLD, 2, 0, false, 0.1, 8);
    }
    s.setTint(0xffffff, 0xffffff, 0xf0dcb0, 0xe0c890).setAlpha(1);
    this.slash.setTint(0xfff4dc, 0xfff4dc, 0xffd27a, 0xffd27a);
  }

  private gilded = false;

  // ---------- o espelho ----------
  // o cavaleiro atirou (o arco ou a bolinha do mago): ele atira do lado espelhado, depois do atraso
  noteShot(x: number, y: number, dx: number, dy: number, orb = false) {
    if (!this.inMirror) return;
    this.shots.push({ t: this.now, x: 2 * this.c - x, y, dx: -dx, dy, orb });
  }

  private recordNow() {
    const p = this.scene.player;
    const s = p.sprite;
    const sl = p.slash;
    const c2 = 2 * this.c;
    const mb = (r: Phaser.Geom.Rectangle): Box => [c2 - r.right, r.y, r.width, r.height];
    const lp = p.lashPose && !p.dead ? { ...p.lashPose, ax: c2 - p.lashPose.ax, bx: c2 - p.lashPose.bx } : null;
    this.recs.push({
      t: this.now,
      x: c2 - s.x,
      y: s.y,
      tex: s.texture.key,
      frame: s.frame.name,
      flip: !s.flipX,
      ox: 1 - s.originX,
      oy: s.originY,
      sx: s.scaleX,
      sy: s.scaleY,
      body: mb(p.rect),
      atk: p.attacking && !p.dead ? mb(p.attackBox()) : null,
      slash: sl.visible
        ? { tex: sl.texture.key, frame: sl.frame.name, x: c2 - sl.x, y: sl.y, ang: -sl.angle, fx: !sl.flipX, fy: sl.flipY, ox: 1 - sl.originX, oy: sl.originY, sx: sl.scaleX, sy: sl.scaleY }
        : null,
      lash: lp,
    });
    while (this.recs.length > 2 && this.recs[1].t < this.now - 3) this.recs.shift();
  }

  private at(t: number) {
    const r = this.recs;
    if (!r.length) return null;
    if (r[0].t > t) return r[0];
    let lo = 0;
    let hi = r.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (r[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return r[lo];
  }

  private show(r: Rec, dx = 0) {
    const s = this.sprite;
    if (s.texture.key !== r.tex) hd(s.setTexture(r.tex, r.frame));
    else s.setFrame(r.frame);
    s.setFlipX(r.flip).setOrigin(r.ox, r.oy).setScale(r.sx, r.sy).setPosition(r.x + dx, r.y);
    this.facing = r.flip ? -1 : 1;
    const b = r.body;
    this.body.reset(b[0] + b[2] / 2 + dx, b[1] + b[3] / 2);
    const sl = r.slash;
    if (sl && dx === 0) {
      if (this.slash.texture.key !== sl.tex) this.slash.setTexture(sl.tex, sl.frame);
      else this.slash.setFrame(sl.frame);
      this.slash.setVisible(true).setPosition(sl.x, sl.y).setAngle(sl.ang).setFlip(sl.fx, sl.fy).setOrigin(sl.ox, sl.oy).setScale(sl.sx, sl.sy);
      if (!this.lastSlash) this.scene.sfx('slash', 0.45, 1.15);
    } else this.slash.setVisible(false);
    this.lastSlash = !!sl && dx === 0;
    this.lashG.clear();
    if (r.lash && dx === 0) drawLash(this.lashG, r.lash, LASH_LOOK);
  }

  private updateMirror(dt: number) {
    const s = this.scene;
    this.now += dt;
    this.recordNow();
    if (this.freeze > 0) {
      this.freeze -= dt;
      this.lag += dt;
    } else if (this.lag > this.target) this.lag = Math.max(this.target, this.lag - C.catchup * dt);
    else this.lag = this.target;
    const r = this.at(this.now - this.lag);
    if (!r) return;
    switch (this.state) {
      case 'mirror':
        this.cur = r;
        this.show(r);
        this.fireShots();
        this.lungeT -= dt;
        if (this.lungeT <= 0 && !s.player.dead) this.windLunge();
        break;
      case 'lungewind': {
        // para no lugar, se encolhe e acende; fala a justificativa
        const k = Math.min(1, this.t / C.lungeWind);
        this.sprite.setPosition(this.lunge.from + Math.sin(this.time * 60) * k * 1.2, this.floorY);
        this.aura.setAlpha(0.3 + 0.5 * k);
        if (k >= 1) this.goLunge();
        break;
      }
      case 'lunge': {
        const step = this.lunge.dir * C.lungeSpeed * dt;
        this.lunge.x += step;
        const done = Math.abs(this.lunge.x - this.lunge.from) >= C.lungeReach || this.lunge.x < this.x0 + 10 || this.lunge.x > this.x1 - 10;
        this.sprite.setPosition(this.lunge.x, this.floorY);
        this.body.reset(this.lunge.x, this.floorY - PLAYER.bodyH / 2);
        if (Math.random() < 0.6) this.dust.emitParticle(1, this.lunge.x - this.lunge.dir * 10, this.floorY - 20);
        if (done) {
          this.go('lungeback');
          this.sprite.anims.stop();
          this.aura.setAlpha(0.3);
        }
        break;
      }
      case 'lungeback': {
        // volta escorregando até onde o espelho manda
        const k = ease(Math.min(1, this.t / C.lungeBack));
        this.cur = r;
        this.show(r, (this.lunge.x - r.x) * (1 - k));
        if (k >= 1) {
          this.go('mirror');
          this.lungeT = Phaser.Math.FloatBetween(C.lungeEvery[0], C.lungeEvery[1]) * (this.mirror2 ? 0.75 : 1);
        }
        break;
      }
      case 'stagger':
        this.sprite.setPosition(this.lunge.x + Math.sin(this.time * 40) * 1.5, this.floorY);
        this.body.reset(this.lunge.x, this.floorY - PLAYER.bodyH / 2);
        if (this.t >= C.stagger) {
          this.sprite.anims.stop();
          this.look();
          this.go('lungeback');
        }
        break;
    }
    // a coroa pequena na cabeça dele
    const hb = this.state === 'mirror' || this.state === 'lungeback' ? this.cur?.body : null;
    const top = hb ? hb[1] : this.floorY - PLAYER.bodyH;
    const cx = hb ? hb[0] + hb[2] / 2 : this.sprite.x;
    this.crownS.setPosition(cx + this.facing * 2, top - 6);
    this.aura.setPosition(this.sprite.x, this.sprite.y - 22);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.look();
    }
  }

  private fireShots() {
    const t = this.now - this.lag;
    while (this.shots.length && this.shots[0].t <= t) {
      const q = this.shots.shift()!;
      if (q.orb) this.scene.spawnEnemyOrb(q.x, q.y, q.dx, q.dy);
      else this.scene.spawnEnemyArrow(q.x, q.y, q.dx, q.dy);
    }
  }

  private windLunge() {
    const s = this.scene;
    const p = s.player;
    const x = this.sprite.x;
    this.lunge = { x, from: x, dir: p.x >= x ? 1 : -1, line: (this.lunge.line + 1) % JUSTIFY.length };
    this.facing = this.lunge.dir;
    this.slash.setVisible(false);
    this.lashG.clear();
    const tex = this.sprite.texture.key;
    if (s.anims.exists(`${tex}-crouch`)) this.sprite.play(`${tex}-crouch`);
    this.sprite.setFlipX(this.lunge.dir < 0);
    this.go('lungewind');
    ui.say('O Carrasco Coroado', JUSTIFY[this.lunge.line], 2600);
    s.sfx('veil', 0.5, 1.5);
  }

  private goLunge() {
    const s = this.scene;
    const tex = this.sprite.texture.key;
    if (s.anims.exists(`${tex}-attack`)) this.sprite.play(`${tex}-attack`);
    this.go('lunge');
    s.sfx('dash', 0.8, 0.8);
    s.sfx('slash', 0.7, 0.8);
  }

  // a ponta da investida (a arma na frente dele)
  private lungeBox() {
    const x = this.lunge.x;
    return new Phaser.Geom.Rectangle(this.lunge.dir > 0 ? x - 6 : x - 46, this.floorY - 40, 52, 34);
  }

  parry(pbox: Phaser.Geom.Rectangle, _fromX: number) {
    if (!this.alive) return false;
    const late = this.state === 'lungewind' && this.t > C.lungeWind - PARRY.early;
    const going = this.state === 'lunge';
    if (!late && !going) return false;
    if (!overlap(pbox, this.lungeBox()) && !overlap(pbox, new Phaser.Geom.Rectangle(this.lunge.x - 8, this.floorY - 42, 16, 42))) return false;
    this.go('stagger');
    this.aura.setAlpha(0.15);
    const tex = this.sprite.texture.key;
    if (this.scene.anims.exists(`${tex}-hurt`)) this.sprite.play(`${tex}-hurt`);
    this.scene.sfx('clang', 0.9, 0.7);
    return true;
  }

  // ---------- vencido: ajoelha e oferece a coroa ----------
  private kneel() {
    const s = this.scene;
    this.alive = false;
    this.hp = 0;
    this.go('kneel');
    this.body.enable = false;
    this.slash.setVisible(false);
    this.lashG.clear();
    s.hitstop(0.2);
    s.cameras.main.flash(260, 255, 220, 160);
    s.cameras.main.shake(400, 0.006);
    s.sfx('glass', 1, 0.6);
    s.sfx('bell', 0.8, 0.5);
    this.placeKneel(false);
    this.onDefeat?.();
  }

  // ele de joelhos no meio do terraço, com a coroa nas mãos (de volta à sala depois de "Ainda não", já está assim)
  placeKneel(still: boolean) {
    const s = this.scene;
    const tex = s.player?.sprite.texture.key ?? 'knight-scythe';
    if (this.sprite.texture.key !== tex) hd(this.sprite.setTexture(tex, 0));
    this.sprite.setVisible(true);
    this.look();
    const x = this.c;
    const facing = s.player ? (s.player.x >= x ? 1 : -1) : -1;
    this.facing = facing as 1 | -1;
    // os pés no chão: a mesma origem da folha do cavaleiro (de volta à sala, o espelho não passou por aqui)
    const o = s.registry.get(`${tex}-origin`) as { x: number; y: number } | undefined;
    this.sprite.setFlipX(facing < 0).setOrigin(o?.x ?? 0.5, o?.y ?? this.sprite.originY);
    const slide = () => {
      if (s.anims.exists(`${tex}-kneel`)) this.sprite.play(`${tex}-kneel`);
      this.crownS.setVisible(true);
      // a coroa sai da cabeça e vai para as mãos, estendida para o cavaleiro
      s.tweens.add({ targets: this.crownS, x: x + facing * 12, y: this.floorY - 16, duration: still ? 0 : 900, delay: still ? 0 : 700, ease: 'Sine.easeInOut' });
      this.go('offer');
    };
    this.aura.setPosition(x, this.floorY - 18).setAlpha(0.22);
    if (still) {
      this.gone = true;
      this.hideColossus();
      this.sprite.setPosition(x, this.floorY);
      this.crownS.setPosition(x + facing * 12, this.floorY - 16);
      slide();
      this.sprite.anims.stop();
      const a = s.anims.get(`${tex}-kneel`);
      if (a) this.sprite.setFrame(a.frames[a.frames.length - 1].textureFrame);
      return;
    }
    s.tweens.add({ targets: this.sprite, x, y: this.floorY, duration: 600, ease: 'Quad.easeOut', onComplete: slide });
  }

  // de volta à sala depois da luta (e antes da escolha): já de joelhos, com a coroa estendida
  kneelStill() {
    this.alive = false;
    this.hp = 0;
    this.body.enable = false;
    this.placeKneel(true);
  }

  private hideColossus() {
    for (const img of [this.crown, ...this.bodyImgs()]) img.setVisible(false);
    for (const e of this.eyeGlow) e.setVisible(false);
  }

  // as imagens do corpo do colosso (sem a coroa, que cai e fica)
  private bodyImgs() {
    return [this.chest, this.head, ...this.arms.flatMap((q) => [q.upper, q.fore, q.fist, q.grip, q.pauldron])];
  }

  // o cavaleiro perto o bastante para pegar a coroa
  near(x: number) {
    return this.state === 'offer' && Math.abs(x - this.c) < 40;
  }

  // ---------- o fim (world/Finale.ts) ----------
  // a coroa que ele estende (o cavaleiro deixa no chão ou põe na cabeça)
  get crownImg() {
    return this.crownS;
  }

  // onde ele está ajoelhado (o x) e para que lado olha
  get kneelAt() {
    return { x: this.sprite.x, facing: this.facing };
  }

  // a coroa sai das mãos dele e vai até (x, y)
  crownTo(x: number, y: number, dur: number, done?: () => void) {
    this.scene.tweens.add({ targets: this.crownS, x, y, duration: dur, ease: 'Sine.easeInOut', onComplete: () => done?.() });
  }

  // ele se desfaz em pó de ouro, de cima para baixo; com `to`, o pó corre para lá (para dentro do cavaleiro)
  dissolve(dur: number, to?: () => { x: number; y: number }, done?: () => void) {
    const s = this.scene;
    this.go('kneel');
    const spr = this.sprite;
    const k = { v: 0 };
    s.sfx('glass', 0.6, 0.6);
    s.glowBurst(spr.x, this.floorY - 20, GOLD, 2.4);
    s.tweens.add({
      targets: k,
      v: 1,
      duration: dur,
      ease: 'Sine.easeIn',
      onUpdate: () => {
        spr.setAlpha(1 - k.v);
        this.aura.setAlpha(0.22 * (1 - k.v));
        const b = spr.getBounds();
        if (Math.random() < 0.9) this.dust.emitParticle(2, b.x + Math.random() * b.width, b.y + b.height * (0.15 + 0.85 * Math.random() * (1 - k.v * 0.5)));
        if (to && Math.random() < 0.55) {
          const t = to();
          const d = s.add.image(b.x + Math.random() * b.width, b.y + Math.random() * b.height, 'px').setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy + 0.3).setScale(1.4);
          s.tweens.add({ targets: d, x: t.x, y: t.y, alpha: 0.3, duration: 520 + Math.random() * 300, ease: 'Quad.easeIn', onComplete: () => d.destroy() });
        }
      },
      onComplete: () => {
        spr.setVisible(false);
        this.aura.setAlpha(0);
        done?.();
      },
    });
  }

  // ---------- o que machuca ----------
  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    this.harmFrom = undefined;
    if (!this.alive) return false;
    for (const a of this.arms) {
      if (a.hot && overlap(pr, this.fistBox(a))) {
        this.harmFrom = a.x;
        return true;
      }
    }
    if (this.headHot && overlap(pr, this.headBox())) {
      this.harmFrom = this.c;
      return true;
    }
    for (const w of this.shocks) {
      if (overlap(pr, new Phaser.Geom.Rectangle(w.x - 8, this.floorY - C.shockH, 16, C.shockH))) {
        this.harmFrom = w.x - w.dir * 20;
        return true;
      }
    }
    if (this.bladeHits(pr)) {
      this.harmFrom = this.sweep!.px - this.sweep!.dir * 400;
      return true;
    }
    const p = this.scene.player;
    for (const b of this.beads) {
      if (!b.falling || b.done || !overlap(pr, this.beadBox(b))) continue;
      if (p.invuln > 0) continue;
      this.breakBead(b, true);
      ui.whisper(ACCUSE[this.accused++ % ACCUSE.length]);
      this.harmFrom = b.x;
      return true;
    }
    if (this.state === 'lunge' && overlap(pr, this.lungeBox())) {
      this.harmFrom = this.lunge.x;
      return true;
    }
    if ((this.state === 'mirror' || this.state === 'lungeback') && this.cur) {
      const r = this.cur;
      if (r.atk && overlap(pr, rectOf(r.atk))) {
        this.harmFrom = r.body[0] + r.body[2] / 2;
        return true;
      }
      if (!sliding && overlap(pr, rectOf(r.body))) {
        this.harmFrom = r.body[0] + r.body[2] / 2;
        return true;
      }
    }
    return false;
  }

  vanish() {
    return null;
  }

  // ---------- desenho ----------
  // põe cada parte do colosso no lugar: o peito no pescoço, a cabeça em cima, a coroa nela e os braços pelos
  // dois ossos até o punho
  private layout() {
    if (this.gone) return;
    const n = this.neck();
    this.chest.setPosition(n.x, n.y);
    const hx = n.x + this.headDX;
    const hy = n.y + this.headDrop - (this.state === 'leandrop' || this.state === 'leanrest' || this.state === 'leanrise' ? this.chestDrop : 0);
    this.head.setPosition(hx, hy).setRotation(this.headTilt + this.headDX * 0.004);
    hd(this.head, this.headScale);
    const rot = this.head.rotation;
    const k = this.headScale;
    const rel = (p: P) => {
      const dx = (p[0] - PART.head.neck[0]) * k;
      const dy = (p[1] - PART.head.neck[1]) * k;
      return { x: hx + dx * Math.cos(rot) - dy * Math.sin(rot), y: hy + dx * Math.sin(rot) + dy * Math.cos(rot) };
    };
    if (!this.fallen) {
      const cp = rel(PART.head.crown);
      this.crown.setPosition(cp.x, cp.y).setRotation(rot);
      hd(this.crown, k);
    }
    PART.head.eyes.forEach((e, i) => {
      const q = rel(e);
      this.eyeGlow[i].setPosition(q.x, q.y).setAlpha(this.eyes * (0.75 + 0.25 * Math.sin(this.time * 7 + i)));
    });
    this.mask.place(this.colossus && this.state !== 'rise' ? this.headBox() : null);
    for (const a of this.arms) this.placeArm(a);
  }

  private placeArm(a: Arm) {
    const S = this.shoulder(a.side);
    const L1 = PART.arm.len;
    const L2 = PART.fore.len;
    let tx = a.x;
    let ty = a.y;
    let d = Math.hypot(tx - S.x, ty - S.y);
    // longe demais: o braço estica até onde dá
    if (d > L1 + L2 - 1) {
      const k = (L1 + L2 - 1) / d;
      tx = S.x + (tx - S.x) * k;
      ty = S.y + (ty - S.y) * k;
      d = L1 + L2 - 1;
    }
    d = Math.max(d, Math.abs(L1 - L2) + 1);
    const base = Math.atan2(ty - S.y, tx - S.x);
    const A = Math.acos(Phaser.Math.Clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    // o cotovelo vai para fora e um pouco para baixo; com o punho no terraço, ele não entra no chão (o braço
    // vem de trás da borda, por cima dela)
    const c1 = base + A;
    const c2 = base - A;
    const score = (ang: number) => Math.cos(ang) * a.side + Math.sin(ang) * 0.5;
    const [best, other] = score(c1) >= score(c2) ? [c1, c2] : [c2, c1];
    const sunk = (q: number) => S.y + Math.sin(q) * L1 > this.floorY - 10;
    const ang = a.front && sunk(best) && !sunk(other) ? other : best;
    const ex = S.x + Math.cos(ang) * L1;
    const ey = S.y + Math.sin(ang) * L1;
    // as imagens apontam para baixo: o ângulo da imagem é o do osso menos 90°
    const foreAng = Math.atan2(ty - ey, tx - ex) - Math.PI / 2;
    a.upper.setPosition(S.x, S.y).setRotation(ang - Math.PI / 2);
    a.fore.setPosition(ex, ey).setRotation(foreAng);
    a.fist.setPosition(tx, ty).setRotation(foreAng);
    // agarrado na agulha (a mão no lugar da pegada): a mão fechada em volta da pedra, por cima dela
    const g = this.gripAt(a.side);
    const holding = a.st === 'grip' && Math.abs(a.x - g.x) < 3 && Math.abs(a.y - g.y) < 3;
    a.grip.setVisible(holding && !this.gone).setPosition(this.spires[a.side < 0 ? 0 : 1], g.y);
    a.fist.setVisible(!holding && !this.gone);
    a.pauldron.setPosition(S.x, S.y);
    // o ombro e o braço ficam sempre atrás do terraço; quando ele bate, o antebraço e o punho vêm para a frente
    const D = CORE_DEPTH.colossus;
    a.upper.setDepth(D + 0.1);
    a.fore.setDepth(a.front ? DEPTH.enemy - 0.6 : D + 0.9);
    a.fist.setDepth(a.front ? DEPTH.enemy - 0.58 : D + 0.92);
    a.pauldron.setDepth(D + 0.15);
  }

  // o rastro de luz da foice e a haste dela, o brilho das ondas
  private drawFx() {
    const g = this.g;
    const ga = this.ga;
    g.clear();
    ga.clear();
    // o rastro de luz de cada conta caindo (dá para ver onde ela vai bater)
    for (const b of this.beads) {
      if (!b.falling) continue;
      for (let i = 0; i < 4; i++) ga.lineStyle(5 - i, 0xffb040, 0.16 + i * 0.1).lineBetween(b.x, b.y - 30 + i * 6, b.x, b.y);
    }
    const sw = this.sweep;
    if (!sw) return;
    const mid = (sw.rIn + sw.rOut) / 2;
    const warn = this.state === 'sweepwarn';
    if (warn) {
      // o caminho inteiro da lâmina, aceso de onde ela vem para onde vai
      const k = Math.min(1, this.t / C.sweepWarn);
      const n = 48;
      for (let i = 0; i < n; i++) {
        const u0 = i / n;
        if (u0 > k * 1.2) break;
        const a0 = -sw.dir * sw.span + sw.dir * 2 * sw.span * u0;
        const a1 = -sw.dir * sw.span + sw.dir * 2 * sw.span * ((i + 1) / n);
        const p0 = this.arcPoint(sw, a0, mid);
        const p1 = this.arcPoint(sw, a1, mid);
        const al = 0.25 + 0.35 * Math.sin(this.time * 14 + i * 0.4) ** 2;
        ga.lineStyle(C.bladeT, 0xffb040, al * 0.25).lineBetween(p0.x, p0.y, p1.x, p1.y);
        ga.lineStyle(2, 0xffe6a6, al).lineBetween(p0.x, p0.y, p1.x, p1.y);
      }
    } else if (!sw.on) return;
    // a foice: no fim do preparo ela se forma em pó de ouro na mão dele e fica até o fim da varrida
    const vis = warn ? Phaser.Math.Clamp((this.t / C.sweepWarn - 0.55) / 0.35, 0, 1) : 1;
    if (vis <= 0) return;
    if (!this.blade.visible) this.showBlade(sw);
    const root = this.arcPoint(sw, sw.ang, mid);
    const t0 = this.arcPoint(sw, sw.ang + sw.dir * 0.01, mid);
    const dirAng = Math.atan2(t0.y - root.y, t0.x - root.x);
    this.blade.setPosition(root.x, root.y).setRotation(sw.dir > 0 ? dirAng : dirAng + Math.PI).setAlpha(vis);
    // a haste: por cima, do punho erguido (o pivô) até a lâmina; por baixo, da lâmina para trás da borda do
    // terraço (o chão tapa o resto, ela vem da mão escondida lá atrás)
    const top = sw.kind === 'u' ? { x: sw.px, y: sw.py } : this.arcPoint(sw, sw.ang, mid - 360);
    const nx = (top.y - root.y) / Math.max(1, Math.hypot(top.x - root.x, top.y - root.y));
    g.lineStyle(7, 0x3a2410, vis).lineBetween(top.x, top.y, root.x, root.y);
    g.lineStyle(2, 0xd8a040, vis).lineBetween(top.x - 2 * Math.abs(nx), top.y, root.x - 2 * Math.abs(nx), root.y);
    if (warn) {
      // o pó de ouro juntando na haste
      if (Math.random() < 0.6) {
        const q = Math.random();
        this.dust.emitParticle(1, Phaser.Math.Linear(top.x, root.x, q), Phaser.Math.Linear(top.y, root.y, q));
      }
      return;
    }
    // o rastro da lâmina
    for (let i = 1; i <= 6; i++) {
      const a0 = sw.ang - sw.dir * i * 0.03;
      const a1 = sw.ang - sw.dir * (i - 1) * 0.03;
      const p0 = this.arcPoint(sw, a0, mid);
      const p1 = this.arcPoint(sw, a1, mid);
      ga.lineStyle(C.bladeT * 0.8, 0xffd27a, 0.3 * (1 - i / 7)).lineBetween(p0.x, p0.y, p1.x, p1.y);
    }
  }

  destroy() {
    for (const img of [...this.bodyImgs(), this.crown, this.blade, this.crownS, this.aura, ...this.eyeGlow, ...this.arms.map((a) => a.shadow)]) img.destroy();
    for (const w of this.shocks) w.glow.destroy();
    for (const b of this.beads) {
      b.img.destroy();
      b.glint.destroy();
    }
    this.g.destroy();
    this.ga.destroy();
    this.slash.destroy();
    this.lashG.destroy();
    this.dust.destroy();
    this.beadFx.destroy();
  }
}


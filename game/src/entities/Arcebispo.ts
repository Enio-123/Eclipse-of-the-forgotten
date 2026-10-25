import Phaser from 'phaser';
import { ARCEBISPO as C, PARRY, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { DEPTH } from '../world/Decor';
import { overlap, type BossFoe, type HitDir, type HitResult } from './Enemy';
import { SmokeField } from './Smoke';
import { face, hd } from '../gfx/flip';

type State =
  | 'sleep' | 'rise' | 'roar' | 'idle' | 'glide'
  | 'swingwind' | 'swing' | 'swingrec'
  | 'tosswind' | 'toss'
  | 'tithe'
  | 'vanish' | 'hidden' | 'appear'
  | 'stagger' | 'shatter'
  | 'dead';

type Attack = 'swing' | 'toss' | 'tithe' | 'vanish';

interface FramePoints {
  censer: [number, number];
  hand: [number, number];
}

// moeda do dízimo caindo do teto: sombra dourada no chão (ou no tablado) antes da queda
interface Coin {
  x: number;
  y: number;
  // onde estava no quadro anterior (a moeda cai rápido: o dano vale o trecho inteiro do quadro)
  py: number;
  land: number;
  vy: number;
  t: number;
  falling: boolean;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  done: boolean;
}

// facho de luz do vitral quebrado: varre o chão de um lado ao outro (os tablados fazem sombra)
interface Beam {
  fx: number;
  dir: 1 | -1;
  t: number;
  end: { x: number; y: number };
  core: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  foot: Phaser.GameObjects.Image;
  fading: number;
}

// incensário lançado rente ao chão, preso na corrente
interface Toss {
  x: number;
  y: number;
  dir: 1 | -1;
  dist: number;
  phase: 'out' | 'back' | 'parried';
  sprite: Phaser.GameObjects.Image;
}

// O Arcebispo do Dízimo: ajoelhado diante do altar de moedas, contando. Golpeia com o incensário
// por cima da cabeça (dá para aparar), lança o incensário rente ao chão, ergue o báculo e faz chover
// o dízimo do teto, e some na fumaça para reaparecer atrás do cavaleiro. Com metade da vida quebra a
// rosácea: a luz entra em fachos que varrem a arena e dois penitentes vêm ajudar.
export class Arcebispo implements BossFoe {
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
  readonly smoke: SmokeField;
  coins: Coin[] = [];
  beams: Beam[] = [];
  toss: Toss | null = null;
  harmFrom: number | undefined;
  private t = 0;
  private thinkT = 0;
  private titheCd = 0;
  private waves = 0;
  private waveT = 0;
  private beamT = 0;
  private puffT = 0;
  private phase2 = false;
  private summoned = false;
  private shattered = false;
  private quick = false;
  private flashT = 0;
  private anim = '';
  private last: Attack[] = [];
  private target = 0;
  private chain: Phaser.GameObjects.Graphics;
  private readonly floorY: number;
  private readonly x0: number;
  private readonly x1: number;
  private readonly points: Record<string, FramePoints[]>;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.floorY = feetY;
    this.x0 = 2 * TILE + 24;
    this.x1 = (scene.level.w - 2) * TILE - 24;
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(600, 700);
    const o = scene.registry.get('arcebispo-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'arcebispo', 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy));
    this.points = (scene.cache.json.get('arcebispo-meta') as { points: Record<string, FramePoints[]> }).points;
    this.smoke = new SmokeField(scene, [0x6e6678, 0x8e889a]);
    this.chain = scene.add.graphics().setDepth(DEPTH.enemy + 0.2);
    // de costas para quem entra, ajoelhado diante do altar
    this.facing = 1;
    this.play('kneel');
    this.sync();
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  get sleeping() {
    return this.state === 'sleep';
  }

  // no ar, na fumaça ou ainda acordando ele não apanha nem machuca de encostar
  private get present() {
    return this.state !== 'sleep' && this.state !== 'rise' && this.state !== 'vanish' && this.state !== 'hidden' && this.state !== 'dead';
  }

  private get speedMul() {
    return this.phase2 ? 0.85 : 1;
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`arcebispo-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  private face() {
    this.facing = this.scene.player.x >= this.zone.x ? 1 : -1;
  }

  // ponto do desenho no quadro atual (o incensário ou a mão da corrente)
  private at(which: keyof FramePoints) {
    const pts = this.points[this.anim];
    const i = (this.sprite.anims.currentFrame?.index ?? 1) - 1;
    const pt = pts?.[Math.min(i, pts.length - 1)]?.[which] ?? [this.facing * 20, -60];
    return { x: this.zone.x + this.facing * pt[0], y: this.body.bottom + pt[1] };
  }

  // acorda quando o cavaleiro entra: levanta, vira e anuncia a cobrança
  wake() {
    if (this.state !== 'sleep') return;
    this.go('rise', 'rise');
    this.scene.sfx('bell', 0.7, 0.8);
    this.scene.cameras.main.shake(400, 0.003);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.face();
      this.go('roar', 'roar');
      this.scene.sfx('roar', 0.7, 1.3);
      this.scene.sfx('coinrain', 0.6);
      this.scene.cameras.main.shake(800, 0.004);
    });
  }

  // ---------- áreas dos golpes ----------
  // o arco do incensário: de cima da cabeça até o chão na frente
  get swingBox() {
    const b = this.body;
    const w = C.swingReach;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x : b.center.x - w, b.bottom - 96, w, 96);
  }

  private tossRect(k: Toss) {
    return new Phaser.Geom.Rectangle(k.x - 9, k.y - 9, 18, 18);
  }

  private coinRect(c: Coin) {
    const top = Math.min(c.py, c.y) - 14;
    return new Phaser.Geom.Rectangle(c.x - 8, top, 16, Math.abs(c.y - c.py) + 14);
  }

  private choose(): Attack {
    const p = this.scene.player;
    const dist = Math.abs(p.x - this.zone.x);
    const high = this.floorY - p.body.bottom > 40;
    let opts: [Attack, number][];
    if (high) opts = [['tithe', 0.6], ['vanish', 0.4]];
    else if (dist < 130) opts = [['swing', 0.6], ['tithe', 0.22], ['vanish', 0.18]];
    else if (dist < 270) opts = [['toss', 0.45], ['tithe', 0.3], ['vanish', 0.25]];
    else opts = [['toss', 0.42], ['tithe', 0.33], ['vanish', 0.25]];
    if (this.titheCd > 0) opts = opts.filter(([a]) => a !== 'tithe');
    // não repete o mesmo golpe três vezes seguidas
    if (this.last.length >= 2 && this.last[0] === this.last[1]) opts = opts.filter(([a]) => a !== this.last[0]);
    if (!opts.length) opts = [['vanish', 1]];
    const total = opts.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [a, w] of opts) {
      r -= w;
      if (r <= 0) return a;
    }
    return opts[0][0];
  }

  update(dt: number) {
    this.smoke.update(dt);
    this.updateCoins(dt);
    this.updateBeams(dt);
    this.updateToss(dt);
    if (this.state === 'dead' || this.state === 'sleep') {
      // o incenso sobe do incensário no chão enquanto ele reza
      if (this.state === 'sleep') this.puff(dt, 0.3);
      this.sync();
      return;
    }
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    this.titheCd -= dt;
    const dx = p.x - this.zone.x;
    switch (this.state) {
      case 'rise':
        b.velocity.x = 0;
        break;
      case 'roar':
        b.velocity.x = 0;
        if (this.t > 1.5) {
          this.thinkT = 0.5;
          this.go('idle', 'idle');
        }
        break;
      case 'shatter':
        // segunda fase: ergue os braços, a rosácea estoura e os penitentes chegam
        b.velocity.x = 0;
        if (!this.shattered && this.t > 0.45) {
          this.shattered = true;
          this.scene.shatterRose();
          this.beamT = 2.2;
        }
        if (!this.summoned && this.t > 1.1) {
          this.summoned = true;
          this.summon();
        }
        if (this.t > 1.9) this.toIdle();
        break;
      case 'idle': {
        b.velocity.x = 0;
        this.face();
        this.thinkT -= dt;
        if (this.thinkT > 0) break;
        const dist = Math.abs(dx);
        if (dist > 140 && dist < 320 && Math.random() < 0.3) {
          this.go('glide', 'walk');
          break;
        }
        this.startAttack(this.choose());
        break;
      }
      case 'glide':
        this.face();
        b.velocity.x = this.facing * C.glide * (this.phase2 ? 1.25 : 1);
        if (Math.random() < 0.2) this.scene.incense(this.zone.x - this.facing * 10, b.bottom - 4, 1);
        if (Math.abs(dx) < 110 || this.t > 1.3) {
          b.velocity.x = 0;
          this.startAttack(Math.abs(dx) < 110 ? 'swing' : this.choose());
        }
        break;
      case 'swingwind':
        b.velocity.x = 0;
        if (this.t > (this.quick ? 0.5 : C.swingWind) * this.speedMul) {
          this.quick = false;
          this.go('swing', 'swing');
          this.scene.sfx('heavy', 1, 0.7);
          this.scene.sfx('swoosh', 0.9, 0.8);
          b.velocity.x = this.facing * 70;
        }
        break;
      case 'swing':
        b.velocity.x *= Math.pow(0.85, dt * 60);
        if (this.t > C.swingActive) this.slam();
        break;
      case 'swingrec':
        b.velocity.x = 0;
        if (this.t > C.swingRec * this.speedMul) {
          if (this.phase2 && Math.random() < 0.4) this.startAttack('vanish');
          else this.toIdle();
        }
        break;
      case 'tosswind':
        b.velocity.x = 0;
        if (this.t > C.tossWind * this.speedMul) this.launch();
        break;
      case 'toss':
        b.velocity.x = 0;
        // a corrente volta para a mão: fim do arremesso
        if (!this.toss) this.toIdle();
        break;
      case 'tithe':
        b.velocity.x = 0;
        if (this.t > C.titheWind && this.waves > 0) {
          this.waveT -= dt;
          if (this.waveT <= 0) {
            this.rainWave();
            this.waves--;
            this.waveT = C.titheGap;
          }
        }
        if (this.waves <= 0 && this.waveT <= -0.5) this.toIdle();
        else if (this.waves <= 0) this.waveT -= dt;
        break;
      case 'vanish':
        b.velocity.x = 0;
        if (this.t > C.vanish) {
          this.go('hidden');
          this.body.enable = false;
          this.sprite.setVisible(false);
        }
        break;
      case 'hidden':
        // a coluna de fumaça avisa onde ele vai aparecer
        if (Math.random() < 0.7) this.scene.incense(this.target + (Math.random() - 0.5) * 18, this.floorY - Math.random() * 50, 2);
        if (this.t > C.hidden * this.speedMul) this.reappear();
        break;
      case 'appear':
        b.velocity.x = 0;
        if (this.t > 0.2) {
          this.face();
          this.quick = true;
          this.go('swingwind', 'swingwind');
          this.scene.sfx('censer', 0.9, 0.9);
        }
        break;
      case 'stagger':
        b.velocity.x *= Math.pow(0.86, dt * 60);
        if (this.t > C.stagger) this.toIdle();
        break;
    }
    // segunda fase: os fachos de luz da rosácea (a pausa conta depois que o último some)
    if (this.phase2 && this.shattered && this.state !== 'shatter' && !this.beams.length) {
      this.beamT -= dt;
      if (this.beamT <= 0) {
        this.beamT = C.beamEvery + Math.random() * 1.5;
        this.spawnBeam();
      }
    }
    if (this.present && this.state !== 'stagger') this.puff(dt, this.state === 'swingwind' || this.state === 'tosswind' ? 0.05 : 0.18);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sync();
  }

  private puff(dt: number, every: number) {
    this.puffT -= dt;
    if (this.puffT > 0 || this.state === 'toss') return;
    this.puffT = every;
    const c = this.at('censer');
    this.scene.incense(c.x, c.y - 6, every < 0.1 ? 2 : 1);
  }

  private sync() {
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(this.body.bottom));
    face(this.sprite, this.facing < 0);
  }

  private toIdle() {
    this.thinkT = (C.think + Math.random() * 0.35) * this.speedMul;
    this.go('idle', 'idle');
  }

  private startAttack(a: Attack) {
    this.face();
    this.last = [a, ...this.last].slice(0, 2);
    if (a === 'swing') {
      this.go('swingwind', 'swingwind');
      this.scene.sfx('censer', 1, 0.8);
    } else if (a === 'toss') {
      this.go('tosswind', 'tosswind');
      this.scene.sfx('censer', 0.9, 1.1);
    } else if (a === 'tithe') {
      this.go('tithe', 'tithe');
      this.titheCd = 7;
      this.waves = this.phase2 ? 3 : 2;
      this.waveT = 0;
      this.scene.sfx('bell', 0.6, 1.4);
      this.scene.glowBurst(this.zone.x - this.facing * 2, this.body.bottom - 200, 0xffd98a, 2);
    } else {
      this.go('vanish', 'idle');
      this.scene.sfx('smoke', 1, 0.8);
      this.scene.tweens.add({ targets: this.sprite, alpha: 0, duration: C.vanish * 1000 });
      for (let i = 0; i < 14; i++) this.scene.incense(this.zone.x + (Math.random() - 0.5) * 40, this.body.bottom - Math.random() * 110, 2);
      // atrás do cavaleiro; sem espaço atrás, na frente dele
      const p = this.scene.player;
      let tx = p.x - p.facing * 84;
      if (tx < this.x0 || tx > this.x1) tx = p.x + p.facing * 84;
      this.target = Phaser.Math.Clamp(tx, this.x0, this.x1);
    }
  }

  // o incensário bate no chão na frente e deixa a nuvem
  private slam() {
    const s = this.scene;
    const x = this.zone.x + this.facing * 94;
    this.go('swingrec', 'swingrec');
    s.sfx('thud', 1);
    s.sfx('smoke', 1);
    s.dustBurst(x, this.floorY, 14);
    s.cameras.main.shake(160, 0.007);
    if (isGround(s.level.tileAt(x, this.floorY + 4)) && !isSolid(s.level.tileAt(x, this.floorY - 8))) this.smoke.spawn(x, this.floorY, C.cloudW, C.cloudH, C.cloud);
  }

  // ---------- arremesso ----------
  private launch() {
    const h = this.at('hand');
    this.go('toss', 'toss');
    const sprite = hd(this.scene.add.image(h.x, this.floorY - 12, 'arcebispo-censer').setOrigin(0.5, 22 / 40).setDepth(DEPTH.enemy + 0.4));
    this.toss = { x: h.x, y: this.floorY - 12, dir: this.facing, dist: 0, phase: 'out', sprite };
    this.scene.sfx('swoosh', 1, 0.6);
  }

  private updateToss(dt: number) {
    const k = this.toss;
    const g = this.chain;
    g.clear();
    if (!k) return;
    const s = this.scene;
    if (k.phase === 'out') {
      const step = C.tossOut * dt;
      k.x += k.dir * step;
      k.dist += step;
      const wall = isSolid(s.level.tileAt(k.x + k.dir * 9, k.y));
      if (k.dist >= C.tossRange || wall) {
        // bate e solta a nuvem onde parou
        k.phase = 'back';
        s.sfx('thud', 0.8);
        s.sfx('smoke', 0.8);
        s.dustBurst(k.x, this.floorY, 8);
        if (isGround(s.level.tileAt(k.x, this.floorY + 4))) this.smoke.spawn(k.x, this.floorY, C.cloudW * 0.8, C.cloudH, C.cloud * 0.8);
        this.play('toss');
      }
      if (Math.random() < 0.6) s.incense(k.x, k.y - 4, 1);
    } else {
      // volta pela corrente; rebatido, volta mais rápido e acerta o dono
      const home = this.at('hand');
      const sp = k.phase === 'parried' ? 620 : C.tossBack;
      const d = home.x - k.x;
      k.x += Math.sign(d) * Math.min(Math.abs(d), sp * dt);
      if (Math.abs(home.x - k.x) < 6) {
        k.sprite.destroy();
        this.toss = null;
        if (k.phase === 'parried' && this.alive) {
          // o próprio incensário acerta ele: fica tonto
          s.sfx('clang', 1, 0.7);
          s.sfx('bell', 0.6, 1.6);
          this.flash();
          this.go('stagger', 'stagger');
          this.body.velocity.x = -this.facing * 60;
        }
        return;
      }
    }
    k.sprite.setPosition(Math.round(k.x), Math.round(k.y)).setAngle(k.sprite.angle + k.dir * dt * (k.phase === 'out' ? 900 : -500));
    // a corrente: da mão até a argola, com barriga
    const h = this.at('hand');
    const ax = h.x;
    const ay = h.y;
    const bx = k.x;
    const by = k.y - 12;
    const sag = Math.min(18, Math.abs(bx - ax) * 0.08);
    g.lineStyle(2, 0x272c3a, 1);
    g.beginPath();
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t + Math.sin(Math.PI * t) * sag;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();
    g.fillStyle(0x6a7590, 1);
    const n = Math.max(2, Math.floor(Math.hypot(bx - ax, by - ay) / 5));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      g.fillRect(Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t + Math.sin(Math.PI * t) * sag) - 1, 1, 1);
    }
  }

  // ---------- chuva do dízimo ----------
  private rainWave() {
    const s = this.scene;
    const L = s.level;
    const p = s.player;
    const gap = this.phase2 ? 80 : 96;
    // as ondas se alternam: a segunda cai nos vãos da primeira
    const off = (this.waves % 2) * gap * 0.5 + Math.random() * 14;
    const xs: number[] = [];
    for (let x = this.x0 + off; x <= this.x1; x += gap) xs.push(x + (Math.random() - 0.5) * 12);
    // uma delas sempre em cima do cavaleiro
    let near = 0;
    xs.forEach((x, i) => {
      if (Math.abs(x - p.x) < Math.abs(xs[near] - p.x)) near = i;
    });
    if (xs.length) xs[near] = Phaser.Math.Clamp(p.x, this.x0, this.x1);
    for (const x of xs) {
      // cai no primeiro chão de cima para baixo: os tablados seguram as moedas
      let land = this.floorY;
      for (let ty = 4; ty < L.h; ty++) {
        if (isGround(L.tileAt(x, ty * TILE + 2))) {
          land = ty * TILE;
          break;
        }
      }
      const sprite = s.add.sprite(x, 3 * TILE + 6, 'coin-big').setDepth(DEPTH.enemy + 0.6).setScale(1.5).setVisible(false);
      sprite.play({ key: 'coin-big-spin', startFrame: Math.floor(Math.random() * 4) });
      const shadow = s.add.ellipse(x, land - 1, 22, 6, 0xffc85a, 0).setDepth(DEPTH.enemy - 0.4).setBlendMode(Phaser.BlendModes.ADD);
      s.tweens.add({ targets: shadow, fillAlpha: 0.55, duration: C.titheWarn * 1000 });
      this.coins.push({ x, y: 3 * TILE + 6, py: 3 * TILE + 6, land, vy: 0, t: 0, falling: false, sprite, shadow, done: false });
    }
    s.sfx('tink', 0.4, 0.7);
  }

  private updateCoins(dt: number) {
    // as que bateram no chão no quadro passado já contaram para o dano: saem agora
    if (this.coins.some((c) => c.done)) this.coins = this.coins.filter((c) => !c.done);
    if (!this.coins.length) return;
    const s = this.scene;
    let landed = false;
    for (const c of this.coins) {
      c.t += dt;
      if (!c.falling) {
        c.shadow.setScale(0.7 + 0.3 * Math.min(1, c.t / C.titheWarn), 1);
        if (c.t > C.titheWarn) {
          c.falling = true;
          c.sprite.setVisible(true);
        }
        continue;
      }
      c.py = c.y;
      c.vy += 1500 * dt;
      c.y = Math.min(c.land, c.y + c.vy * dt);
      c.sprite.setPosition(c.x, Math.round(c.y));
      if (c.y >= c.land) {
        c.done = true;
        landed = true;
        s.coinSplash(c.x, c.land);
        c.sprite.destroy();
        c.shadow.destroy();
      }
    }
    if (landed) s.sfx('coinrain', 0.5, 1.1);
  }

  // ---------- fachos de luz ----------
  private spawnBeam() {
    const rose = this.scene.rose;
    if (!rose) return;
    // começa do lado oposto ao cavaleiro e varre a arena inteira passando por ele
    const p = this.scene.player;
    const dir: 1 | -1 = p.x < (this.x0 + this.x1) / 2 ? -1 : 1;
    const fx = dir < 0 ? this.x1 : this.x0;
    const mk = (w: number, a: number) =>
      this.scene.add.image(rose.x, rose.y, 'shaft').setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe6b0).setAlpha(a).setDisplaySize(w, 10);
    const beam: Beam = {
      fx,
      dir,
      t: 0,
      end: { x: fx, y: this.floorY },
      halo: mk(40, 0).setDepth(DEPTH.enemy - 0.6),
      core: mk(3, 0.3).setDepth(DEPTH.enemy - 0.5),
      foot: this.scene.add.image(fx, this.floorY, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd98a).setAlpha(0).setScale(1.4, 0.45).setDepth(DEPTH.enemy - 0.4),
      fading: 0,
    };
    this.beams.push(beam);
    this.scene.sfx('chime', 0.5, 0.6);
  }

  // onde a luz bate: o primeiro chão entre o vitral e o ponto do chão
  private beamEnd(fx: number) {
    const rose = this.scene.rose!;
    const L = this.scene.level;
    const dx = fx - rose.x;
    const dy = this.floorY - rose.y;
    const n = Math.ceil(Math.hypot(dx, dy) / 4);
    for (let i = 1; i <= n; i++) {
      const x = rose.x + (dx * i) / n;
      const y = rose.y + (dy * i) / n;
      // a luz passa pela pedra da moldura do vitral: só conta o chão de baixo
      if (y > rose.y + 70 && isGround(L.tileAt(x, y))) return { x, y: Math.floor(y / TILE) * TILE };
    }
    return { x: fx, y: this.floorY };
  }

  private updateBeams(dt: number) {
    if (!this.beams.length) return;
    const rose = this.scene.rose;
    for (const b of this.beams) {
      b.t += dt;
      const warn = b.t < C.beamWarn;
      if (!warn && !b.fading) {
        b.fx += b.dir * C.beamSpeed * dt;
        if ((b.dir < 0 && b.fx < this.x0 - 10) || (b.dir > 0 && b.fx > this.x1 + 10)) b.fading = 0.001;
      }
      if (b.fading) b.fading += dt;
      b.end = this.beamEnd(b.fx);
      if (!rose) continue;
      const dx = b.end.x - rose.x;
      const dy = b.end.y - rose.y;
      const len = Math.hypot(dx, dy);
      const rot = Math.atan2(-dx, dy);
      const flick = 0.9 + Math.random() * 0.1;
      const fade = b.fading ? Math.max(0, 1 - b.fading / 0.35) : 1;
      // aviso: um fio fino de luz; depois o facho inteiro
      const k = warn ? Math.min(1, b.t / C.beamWarn) : 1;
      b.core.setRotation(rot).setDisplaySize(warn ? 2 + 3 * k : C.beamHalf * 2 + 4, len).setAlpha((warn ? 0.25 + 0.2 * k : 0.62 * flick) * fade);
      b.halo.setRotation(rot).setDisplaySize(warn ? 10 : 46, len).setAlpha((warn ? 0.06 * k : 0.2 * flick) * fade);
      b.foot.setPosition(b.end.x, b.end.y).setAlpha((warn ? 0.25 * k : 0.75 * flick) * fade);
      if (!warn && Math.random() < 0.5) this.scene.dustBurst(b.end.x + (Math.random() - 0.5) * 14, b.end.y, 1);
    }
    for (const b of this.beams) {
      if (b.fading < 0.35) continue;
      b.core.destroy();
      b.halo.destroy();
      b.foot.destroy();
    }
    this.beams = this.beams.filter((b) => b.fading < 0.35);
  }

  private beamHits(b: Beam, pr: Phaser.Geom.Rectangle) {
    const rose = this.scene.rose;
    if (!rose || b.t < C.beamWarn || b.fading) return false;
    const ax = rose.x;
    const ay = rose.y;
    const vx = b.end.x - ax;
    const vy = b.end.y - ay;
    const L2 = vx * vx + vy * vy || 1;
    for (const py of [pr.y + 4, pr.centerY, pr.bottom - 3]) {
      const px = pr.centerX;
      const t = Phaser.Math.Clamp(((px - ax) * vx + (py - ay) * vy) / L2, 0, 1);
      if (Math.hypot(px - (ax + vx * t), py - (ay + vy * t)) < C.beamHalf + pr.width / 2) return true;
    }
    return false;
  }

  // os dois penitentes saem da fumaça, longe do cavaleiro
  private summon() {
    const p = this.scene.player;
    const spots = [this.x0 + 60, (this.x0 + this.x1) / 2, this.x1 - 60].filter((x) => Math.abs(x - p.x) > 140);
    for (const x of spots.slice(0, 2)) {
      for (let i = 0; i < 10; i++) this.scene.incense(x + (Math.random() - 0.5) * 30, this.floorY - Math.random() * 60, 2);
      this.scene.time.delayedCall(350, () => this.scene.summon('i', x, this.floorY));
    }
    this.scene.sfx('smoke', 1, 0.7);
  }

  private reappear() {
    this.go('appear', 'idle');
    this.body.enable = true;
    this.body.reset(this.target, this.floorY - C.bodyH / 2);
    this.face();
    this.sprite.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 180 });
    this.scene.sfx('smoke', 0.9, 1.2);
    for (let i = 0; i < 12; i++) this.scene.incense(this.target + (Math.random() - 0.5) * 36, this.floorY - Math.random() * 100, 2);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    // o empurrão sai de onde veio o dano; o facho empurra para trás de quem ele já passou
    this.harmFrom = undefined;
    const from = (x: number) => {
      this.harmFrom = x;
      return true;
    };
    const cloud = this.smoke.at(pr);
    if (cloud) return from(cloud.x);
    for (const c of this.coins) if (c.falling && overlap(pr, this.coinRect(c))) return from(c.x);
    for (const b of this.beams) if (this.beamHits(b, pr)) return from(pr.centerX + b.dir * 12);
    if (this.toss && this.toss.phase !== 'parried' && overlap(pr, this.tossRect(this.toss))) return from(this.toss.x);
    if (!this.present) return false;
    if (this.state === 'swing' && this.t <= C.swingActive && overlap(pr, this.swingBox)) return true;
    // deslizando, o cavaleiro passa por baixo da túnica; tonto, ele não empurra ninguém
    if (sliding || this.state === 'stagger' || this.state === 'appear') return false;
    return overlap(pr, this.rect);
  }

  // aparar: no fim da preparação ou com o incensário descendo; ou golpear o incensário lançado
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive) return false;
    const k = this.toss;
    if (k && k.phase === 'out' && overlap(box, this.tossRect(k))) {
      k.phase = 'parried';
      return true;
    }
    const wind = (this.quick ? 0.5 : C.swingWind) * this.speedMul;
    const late = this.state === 'swingwind' && this.t > wind - PARRY.early;
    const swing = this.state === 'swing' && this.t <= C.swingActive;
    if (!late && !swing) return false;
    if ((Math.sign(fromX - this.zone.x) || this.facing) !== this.facing) return false;
    if (!overlap(box, this.swingBox)) return false;
    this.quick = false;
    this.go('stagger', 'stagger');
    this.body.velocity.x = -this.facing * 60;
    return true;
  }

  private flash() {
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
  }

  hit(_fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive || !this.present || this.state === 'appear') return 'ignored';
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    this.hp -= dmg;
    this.flash();
    if (!this.phase2 && this.hp <= this.maxHp * C.phase2 && this.hp > 0) {
      this.phase2 = true;
      this.quick = false;
      this.toss?.sprite.destroy();
      this.toss = null;
      this.go('shatter', 'roar');
      this.scene.sfx('roar', 1, 1.2);
      this.scene.sfx('bell', 1, 0.7);
      this.scene.cameras.main.shake(900, 0.006);
    }
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  private clearHazards() {
    this.smoke.clear();
    for (const c of this.coins) {
      c.sprite.destroy();
      c.shadow.destroy();
    }
    this.coins = [];
    for (const b of this.beams) {
      b.core.destroy();
      b.halo.destroy();
      b.foot.destroy();
    }
    this.beams = [];
    this.toss?.sprite.destroy();
    this.toss = null;
    this.chain.clear();
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
    this.sprite.setVisible(true).setAlpha(1).play('arcebispo-death');
    s.deathBurst(this.zone.x, this.zone.y);
    s.sfx('bell', 1.2, 0.7);
    s.sfx('coinrain', 1, 0.8);
    s.hitstop(0.25);
    s.cameras.main.flash(300, 255, 236, 200);
    s.cameras.main.shake(700, 0.01);
    this.onDefeat?.();
  }

  destroy() {
    this.clearHazards();
    this.chain.destroy();
  }
}

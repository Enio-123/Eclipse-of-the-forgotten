import Phaser from 'phaser';
import { CACADOR as C, PARRY, PLAYER, TILE, VIEW_H, VIEW_W } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isSolid } from '../world/Level';
import { DEPTH } from '../world/Decor';
import { overlap, type BossFoe, type HitDir, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';
import { Wolf } from './Wolf';
import { ui } from '../ui/ui';

type State =
  | 'sleep' | 'rise' | 'call' | 'idle' | 'walk'
  | 'thrustwind' | 'thrust' | 'thrustrec'
  | 'leapwind' | 'leap' | 'land'
  | 'horn'
  | 'stagger' | 'rage'
  | 'stalk' | 'blink' | 'rush' | 'rushrec'
  | 'dead';

type Attack = 'thrust' | 'leap' | 'horn';

interface FramePoints {
  tip: [number, number];
  lantern: [number, number];
  hand: [number, number];
}

// a onda de neve que corre pelo chão quando a lança crava (pule)
interface Shock {
  x: number;
  t: number;
  done: boolean;
}

// O Mestre da Caça: o caçador-mor da Casa Vhalor. Trazia os fugitivos de volta pela neve e os
// entregava ao carrasco no fim da trilha. Congelou esperando uma presa que nunca voltou (ela passou a
// serra): está de pé no meio da clareira, coberto de geada, apoiado na lança, olhando para a trilha.
// Alto, casaco de peles de lobo, capuz com a barba congelada, a lança longa com a lanterna de Âmbar
// pendurada perto da ponta e a trompa no cinto. Acordado: estocadas longas (a alta passa por cima do
// cavaleiro agachado; a baixa, pule), o salto com a lança para baixo (saia de baixo; onde ela crava,
// a neve corre pelo chão para os dois lados) e a trompa, que chama dois lobos (uma vez por fase). Na
// metade, a nevasca: a tela embranquece, ele some na neve e só a lanterna anda pela arena; a lanterna
// pisca duas vezes antes de ele sair correndo da neve com a lança na frente. Entre uma nevasca e outra
// a neve abre e ele luta à vista.
export class Cacador implements BossFoe {
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
  private t = 0;
  private thinkT = 0;
  private phase2 = false;
  private flashT = 0;
  private anim = '';
  private last: Attack[] = [];
  // a estocada desta vez: alta (agache) ou baixa (pule)
  private high = true;
  private hornUsed = [false, false];
  private shocks: Shock[] = [];
  // a nevasca: ligada, quanto falta para mudar e quanto falta para a próxima investida
  private storm = false;
  private stormT = 0;
  private rushCd = 0;
  private rushDir: 1 | -1 = 1;
  private vis = 1;
  private frostT = 0;
  private readonly floorY: number;
  private readonly x0: number;
  private readonly x1: number;
  private readonly points: Record<string, FramePoints[]> | null;
  private readonly lantern: Phaser.GameObjects.Image;
  private readonly halo: Phaser.GameObjects.Image;
  private readonly white: Phaser.GameObjects.Rectangle;
  private readonly frost: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.floorY = feetY;
    // a arena: da grade da esquerda até a encosta de neve da direita
    let left = 2;
    for (let tx = Math.floor(x / TILE); tx > 0; tx--) {
      if (isSolid(scene.level.tileAt(tx * TILE + 8, feetY - 24))) {
        left = tx + 1;
        break;
      }
    }
    let right = scene.level.w - 3;
    for (let tx = Math.floor(x / TILE); tx < scene.level.w; tx++) {
      if (isSolid(scene.level.tileAt(tx * TILE + 8, feetY - 8))) {
        right = tx;
        break;
      }
    }
    this.x0 = Math.max(left, 7) * TILE + C.bodyW / 2 + 4;
    this.x1 = right * TILE - C.bodyW / 2 - 4;
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(620, 1000);
    const o = scene.registry.get('cacador-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'cacador', 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy));
    this.points = (scene.cache.json.get('cacador-meta') as { points?: Record<string, FramePoints[]> } | undefined)?.points ?? null;
    // a lanterna de Âmbar: apagada enquanto ele dorme; acesa, é o que se vê dele na nevasca
    this.lantern = scene.add.image(x, feetY - 90, 'glow').setTint(0xffb050).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.player + 0.6).setScale(0.5).setAlpha(0);
    this.halo = scene.add.image(x, feetY - 90, 'glow').setTint(0xff9a3c).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.player + 0.55).setScale(2.2).setAlpha(0);
    // o branco da nevasca: cobre a arena e os inimigos, fica atrás do cavaleiro
    this.white = scene.add.rectangle(0, 0, VIEW_W + 40, VIEW_H + 40, 0xeef3fa, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.player - 0.5).setAlpha(0);
    this.frost = scene.add.particles(0, 0, 'px', {
      lifespan: { min: 500, max: 1100 },
      speed: { min: 10, max: 60 },
      angle: { min: 200, max: 340 },
      gravityY: 60,
      scale: { start: 1.2, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: [0xffffff, 0xdcebfa],
      emitting: false,
    }).setDepth(DEPTH.enemy + 0.3);
    this.facing = -1;
    this.play('sleep');
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
    return this.phase2 ? 0.85 : 1;
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`cacador-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  private face() {
    this.facing = this.scene.player.x >= this.zone.x ? 1 : -1;
  }

  // ponto marcado no desenho (ponta da lança, lanterna, mão) no quadro atual
  private point(k: keyof FramePoints) {
    const pts = this.points?.[this.anim];
    const i = (this.sprite.anims.currentFrame?.index ?? 1) - 1;
    const pt = pts?.[Math.min(i, pts.length - 1)]?.[k] ?? (k === 'lantern' ? [30, -96] : k === 'tip' ? [60, -40] : [14, -44]);
    return { x: this.zone.x + this.facing * pt[0], y: this.body.bottom + pt[1] };
  }

  wake() {
    if (this.state !== 'sleep') return;
    const s = this.scene;
    this.go('rise', 'rise');
    s.sfx('ice-break', 0.9, 0.7);
    s.frostBurst(this.zone.x, this.body.top + 20, 24);
    for (let k = 0; k < 6; k++) this.frost.explode(4, this.zone.x + (Math.random() - 0.5) * 30, this.body.top + Math.random() * C.bodyH);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.face();
      // a trompa: o começo da caçada (ainda sem lobos)
      this.go('call', 'horn');
      s.sfx('horn', 0.9, 1);
      s.cameras.main.shake(900, 0.003);
    });
  }

  // ---------- escolha ----------
  private choose(): Attack {
    const p = this.scene.player;
    const dist = Math.abs(p.x - this.zone.x);
    const high = this.floorY - p.body.bottom > 40;
    const ph = this.phase2 ? 1 : 0;
    // a trompa chama os lobos uma vez por fase, quando ele já apanhou um pouco
    const hornOk = !this.hornUsed[ph] && this.hp < this.maxHp * (this.phase2 ? 0.4 : 0.82) && this.scene.enemies.filter((e) => e.kind === 'wolf' && e.alive).length === 0;
    let opts: [Attack, number][];
    if (high) opts = [['leap', 0.75], ['thrust', 0.25]];
    else if (dist < 120) opts = [['thrust', 0.7], ['leap', 0.3]];
    else if (dist < 270) opts = [['thrust', 0.55], ['leap', 0.45]];
    else opts = [['leap', 0.7], ['thrust', 0.3]];
    if (hornOk) opts.push(['horn', 0.9]);
    if (this.last.length >= 2 && this.last[0] === this.last[1]) opts = opts.filter(([a]) => a !== this.last[0]);
    if (!opts.length) opts = [['thrust', 1]];
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
    this.face();
    this.last = [a, ...this.last].slice(0, 2);
    const s = this.scene;
    if (a === 'thrust') {
      // mais baixa quando ele está agachado (agachar não salva), mais alta quando está em pé
      const p = s.player;
      this.high = p.crouched ? false : Math.random() < 0.55;
      this.go('thrustwind', this.high ? 'thrustwind-hi' : 'thrustwind-lo');
      s.sfx('lantern', 0.7, 1);
      s.sfx('heavy', 0.4, 0.8);
    } else if (a === 'leap') {
      this.go('leapwind', 'leapwind');
      s.sfx('heavy', 0.5, 0.65);
    } else {
      this.hornUsed[this.phase2 ? 1 : 0] = true;
      this.go('horn', 'horn');
    }
  }

  // ---------- quadro a quadro ----------
  update(dt: number) {
    this.updateShocks(dt);
    this.updateStorm(dt);
    if (this.state === 'dead') {
      this.sync(dt);
      return;
    }
    if (this.state === 'sleep') {
      // a geada se soltando dele com o vento
      this.frostT -= dt;
      if (this.frostT <= 0) {
        this.frostT = 0.25 + Math.random() * 0.4;
        this.frost.explode(1, this.zone.x + (Math.random() - 0.5) * 24, this.body.top + Math.random() * 40);
      }
      this.sync(dt);
      return;
    }
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    const dx = p.x - this.zone.x;
    switch (this.state) {
      case 'rise':
        b.velocity.x = 0;
        break;
      case 'call':
        b.velocity.x = 0;
        if (this.t > C.horn + 0.4) this.toIdle(0.2);
        break;
      case 'rage':
        b.velocity.x = 0;
        if (this.t > 0.6 && this.t - dt <= 0.6) this.startStorm();
        if (this.t > 1.8) this.stalk();
        break;
      case 'idle': {
        b.velocity.x = 0;
        this.face();
        this.thinkT -= dt;
        if (this.thinkT > 0) break;
        if (Math.abs(dx) > 300 && Math.random() < 0.4) {
          this.go('walk', 'walk');
          break;
        }
        this.startAttack(this.choose());
        break;
      }
      case 'walk':
        this.face();
        b.velocity.x = this.facing * C.walk * (this.phase2 ? 1.3 : 1);
        if (Math.abs(dx) < 220 || this.t > 1.4) {
          b.velocity.x = 0;
          this.startAttack(this.choose());
        }
        break;
      case 'thrustwind':
        b.velocity.x = 0;
        if (this.t > C.thrustWind * this.speedMul) {
          this.go('thrust', this.high ? 'thrust-hi' : 'thrust-lo');
          this.scene.sfx('stab', 1, 0.7);
          this.scene.sfx('swoosh', 0.8, 0.75);
          // a estocada leva o corpo junto: avança na direção do cavaleiro
          b.velocity.x = this.facing * C.thrustLunge / C.thrustActive * 0.55;
        }
        break;
      case 'thrust':
        b.velocity.x *= Math.pow(0.82, dt * 60);
        if (Math.random() < dt * 30) this.scene.dustBurst(this.zone.x - this.facing * 10, this.floorY, 1);
        if (this.t > C.thrustActive) this.go('thrustrec', 'thrustrec');
        break;
      case 'thrustrec':
        b.velocity.x *= Math.pow(0.8, dt * 60);
        if (this.t > C.thrustRec * this.speedMul) this.afterAttack();
        break;
      case 'leapwind':
        b.velocity.x = 0;
        if (this.t > C.leapWind * this.speedMul) this.leap();
        break;
      case 'leap':
        if (b.blocked.left || b.blocked.right) b.velocity.x = 0;
        if (b.blocked.up && b.velocity.y < 0) b.velocity.y = 0;
        if (this.t > 0.1 && b.blocked.down) this.land();
        else if (this.t > 2.4) this.toIdle();
        break;
      case 'land':
        b.velocity.x = 0;
        if (this.t > C.leapRec * this.speedMul) this.afterAttack();
        break;
      case 'horn':
        b.velocity.x = 0;
        if (this.t > C.hornWind && this.t - dt <= C.hornWind) this.blowHorn();
        if (this.t > C.hornWind + C.horn) this.afterAttack(0.2);
        break;
      case 'stagger':
        b.velocity.x *= Math.pow(0.86, dt * 60);
        if (this.t > C.stagger) this.afterAttack(0.2);
        break;
      case 'stalk': {
        // na nevasca: anda em volta do cavaleiro sem chegar perto, só a lanterna aparece
        const want = p.x - this.rushDir * 250;
        const tx = Phaser.Math.Clamp(want, this.x0, this.x1);
        const d = tx - this.zone.x;
        this.facing = dx >= 0 ? 1 : -1;
        b.velocity.x = Math.abs(d) > 12 ? Math.sign(d) * C.walk * 1.6 : 0;
        this.play(Math.abs(b.velocity.x) > 0 ? 'walk' : 'idle');
        this.rushCd -= dt;
        if (this.rushCd <= 0 && Math.abs(d) < 60 && Math.abs(dx) > 120) {
          b.velocity.x = 0;
          this.facing = dx >= 0 ? 1 : -1;
          this.high = Math.random() < 0.5;
          this.go('blink', this.high ? 'thrustwind-hi' : 'thrustwind-lo');
          this.scene.sfx('lantern', 1, 1.1);
        }
        break;
      }
      case 'blink':
        b.velocity.x = 0;
        this.face();
        if (this.t > C.blink * 0.5 && this.t - dt <= C.blink * 0.5) this.scene.sfx('lantern', 1, 1.25);
        if (this.t > C.blink) {
          this.go('rush', this.high ? 'rush-hi' : 'rush-lo');
          this.scene.sfx('swoosh', 1, 0.6);
          this.scene.sfx('growl', 0.6, 0.6);
        }
        break;
      case 'rush': {
        b.velocity.x = this.facing * C.rushSpeed;
        if (Math.random() < dt * 40) this.scene.frostBurst(this.zone.x - this.facing * 12, this.floorY, 1);
        const passed = (this.facing > 0 && this.zone.x > p.x + 110) || (this.facing < 0 && this.zone.x < p.x - 110);
        const wall = (this.facing > 0 && this.zone.x >= this.x1) || (this.facing < 0 && this.zone.x <= this.x0);
        if (passed || wall || this.t > 1.6) {
          this.go('rushrec', 'thrustrec');
          this.rushDir = (this.facing * -1) as 1 | -1;
        }
        break;
      }
      case 'rushrec':
        b.velocity.x *= Math.pow(0.9, dt * 60);
        if (this.t > 0.7) {
          if (this.storm) this.stalk();
          else this.toIdle(0.1);
        }
        break;
    }
    // não sai da arena
    if (this.zone.x < this.x0 && b.velocity.x < 0) b.velocity.x = 0;
    if (this.zone.x > this.x1 && b.velocity.x > 0) b.velocity.x = 0;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    this.sync(dt);
  }

  // depois de cada golpe: na nevasca ele volta a sumir na neve
  private afterAttack(extra = 0) {
    if (this.storm) this.stalk();
    else this.toIdle(extra);
  }

  private stalk() {
    this.rushCd = 1.4 + Math.random() * 0.8;
    this.rushDir = this.scene.player.x >= this.zone.x ? 1 : -1;
    this.go('stalk', 'walk');
  }

  private sync(dt = 0) {
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(this.body.bottom));
    face(this.sprite, this.facing < 0);
    // some na nevasca (mais à vista quando sai correndo ou quando apanha)
    const s = this.scene;
    const hidden = this.storm && (this.state === 'stalk' || this.state === 'blink' || this.state === 'rushrec');
    const want = this.state === 'dead' ? 1 : hidden ? 0.1 : this.state === 'rush' ? 0.75 : 1;
    this.vis += (want - this.vis) * Math.min(1, dt * 5);
    if (this.flashT <= 0) this.sprite.setAlpha(this.vis);
    const l = this.point('lantern');
    const lit = this.state === 'sleep' || this.state === 'rise' ? 0 : this.state === 'dead' ? this.lantern.alpha : 1;
    // a lanterna pisca antes da investida
    const blink = this.state === 'blink' ? (Math.floor(this.t / (C.blink / 4)) % 2 === 0 ? 1.6 : 0.25) : 1;
    const flick = 0.92 + Math.sin(s.clock * 13) * 0.05 + Math.sin(s.clock * 31) * 0.03;
    if (this.state !== 'dead') {
      this.lantern.setPosition(l.x, l.y).setAlpha(Math.min(1, lit * 0.85 * flick * blink)).setScale(0.42 + 0.12 * blink);
      this.halo.setPosition(l.x, l.y).setAlpha(lit * (0.12 + s.whiteout * 0.2) * flick * Math.min(1.4, blink)).setScale(2 + s.whiteout * 1.6);
    } else this.lantern.setPosition(l.x, l.y);
  }

  // ---------- estocada ----------
  private thrustBox() {
    const tip = this.point('tip');
    const [y0, y1] = this.high ? C.highY : C.lowY;
    const from = this.zone.x + this.facing * 6;
    const x0 = Math.min(from, tip.x);
    const x1 = Math.max(from, tip.x);
    return new Phaser.Geom.Rectangle(x0, this.floorY - y1, Math.max(8, x1 - x0), y1 - y0);
  }

  // ---------- salto com a lança para baixo ----------
  private leap() {
    const p = this.scene.player;
    const b = this.body;
    const g = PLAYER.gravity;
    const lead = Phaser.Math.Clamp(p.body.velocity.x * 0.25, -60, 60);
    const tx = Phaser.Math.Clamp(p.x + lead, this.x0, this.x1);
    const vy = Math.sqrt(2 * g * C.leapApex);
    const T = (2 * vy) / g;
    b.setVelocity((tx - this.zone.x) / T, -vy);
    this.facing = tx >= this.zone.x ? 1 : -1;
    this.go('leap', 'leap');
    this.scene.sfx('swoosh', 1, 0.55);
    this.scene.frostBurst(this.zone.x, this.floorY, 10);
  }

  private land() {
    const s = this.scene;
    this.body.velocity.x = 0;
    this.go('land', 'land');
    s.sfx('thud', 1.2, 0.55);
    s.sfx('ice-crack', 0.8, 0.7);
    s.frostBurst(this.zone.x, this.floorY, 22);
    s.cameras.main.shake(260, 0.009);
    // a neve corre pelo chão para os dois lados a partir da lança
    const n = this.phase2 ? C.shockN + 1 : C.shockN;
    for (const dir of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const x = this.zone.x + dir * (26 + i * C.shockGap);
        if (x < this.x0 - 24 || x > this.x1 + 24) break;
        this.shocks.push({ x, t: -i * 0.07, done: false });
      }
    }
  }

  private updateShocks(dt: number) {
    if (this.shocks.some((k) => k.done)) this.shocks = this.shocks.filter((k) => !k.done);
    for (const k of this.shocks) {
      const was = k.t;
      k.t += dt;
      if (was < 0 && k.t >= 0) {
        this.scene.frostBurst(k.x, this.floorY, 6);
        this.frost.explode(3, k.x, this.floorY - 4);
      }
      if (k.t > 0.22) k.done = true;
    }
  }

  private shockRect(k: Shock) {
    return new Phaser.Geom.Rectangle(k.x - 12, this.floorY - 20, 24, 20);
  }

  // ---------- a trompa: dois lobos entram pelos lados da arena ----------
  private blowHorn() {
    const s = this.scene;
    s.sfx('horn', 1, this.phase2 ? 0.94 : 1);
    s.cameras.main.shake(800, 0.004);
    s.thinkOnce('cacador:horn', 'A trompa. Eles ainda obedecem a ela.');
    const p = s.player;
    const xs = [this.x0 + 30, this.x1 - 30].sort((a, b) => Math.abs(b - p.x) - Math.abs(a - p.x));
    xs.forEach((x, i) => {
      s.time.delayedCall(700 + i * 600, () => {
        if (this.state === 'dead') return;
        const w = s.summon('d', x, this.floorY);
        if (w instanceof Wolf) w.hunt(p.x);
        s.frostBurst(x, this.floorY, 12);
      });
    });
  }

  // ---------- a nevasca ----------
  private startStorm() {
    const s = this.scene;
    this.storm = true;
    this.stormT = C.blizzard;
    s.sfx('gust', 1.2, 0.7);
    s.sfx('gust', 0.9, 0.9);
    s.thinkOnce('cacador:storm', 'A neve fechou. Só a lanterna. Ele enxerga no branco, eu não.');
  }

  private updateStorm(dt: number) {
    const s = this.scene;
    if (this.state === 'dead') {
      s.whiteout = Math.max(0, s.whiteout - dt * 0.8);
      this.white.setAlpha(s.whiteout * C.whiteout);
      return;
    }
    if (this.phase2 && this.present && this.state !== 'rage') {
      this.stormT -= dt;
      if (this.stormT <= 0) {
        this.storm = !this.storm;
        this.stormT = this.storm ? C.blizzard : C.clear;
        if (this.storm) {
          s.sfx('gust', 1.1, 0.7);
          if (this.state === 'idle' || this.state === 'walk') this.stalk();
        } else {
          s.sfx('gust', 0.6, 1.2);
          if (this.state === 'stalk') this.toIdle(0.3);
        }
      }
    }
    const want = this.storm ? 1 : 0;
    s.whiteout += (want - s.whiteout) * Math.min(1, dt * (this.storm ? 0.9 : 1.6));
    if (s.whiteout < 0.002) s.whiteout = 0;
    // o branco respira com as rajadas
    const gust = 0.9 + Math.sin(s.clock * 0.9) * 0.06 + Math.sin(s.clock * 2.3) * 0.04;
    this.white.setAlpha(s.whiteout * C.whiteout * gust);
  }

  // ---------- dano ----------
  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    this.harmFrom = undefined;
    const from = (x: number) => {
      this.harmFrom = x;
      return true;
    };
    for (const k of this.shocks) if (k.t >= 0 && !k.done && overlap(pr, this.shockRect(k))) return from(k.x - Math.sign(k.x - this.zone.x) * 10);
    if (!this.present) return false;
    if ((this.state === 'thrust' || this.state === 'rush') && overlap(pr, this.thrustBox())) return from(this.zone.x);
    // caindo com a lança para baixo: a ponta embaixo dele
    if (this.state === 'leap' && this.body.velocity.y > 0) {
      const tip = new Phaser.Geom.Rectangle(this.zone.x - 14, this.body.bottom - 20, 28, 30);
      if (overlap(pr, tip)) return from(this.zone.x);
    }
    if (sliding || this.state === 'stagger' || this.state === 'stalk' || this.state === 'blink' || this.state === 'land') return false;
    return overlap(pr, this.rect);
  }

  // aparar: a lança no fim da preparação da estocada, ou a investida que sai da neve, pela frente
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive || !this.present) return false;
    const late = this.state === 'thrustwind' && this.t > C.thrustWind * this.speedMul - PARRY.early;
    const rushing = this.state === 'rush';
    if (!late && !rushing) return false;
    if ((Math.sign(fromX - this.zone.x) || this.facing) !== this.facing) return false;
    if (!overlap(box, this.rect) && !(rushing && overlap(box, this.thrustBox()))) return false;
    this.go('stagger', 'stagger');
    this.body.velocity.x = -this.facing * (rushing ? 160 : 70);
    // aparado no meio da neve, ele aparece inteiro
    this.vis = 1;
    return true;
  }

  private flash() {
    this.flashT = 0.07;
    this.sprite.setAlpha(1).setTintFill(0xffffff);
  }

  hit(_fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive || !this.present) return 'ignored';
    if (this.state === 'stagger') dmg *= PARRY.bonus;
    // cravado depois do salto, a lança presa no chão
    else if (this.state === 'land') dmg *= 1.25;
    this.hp -= dmg;
    this.flash();
    this.frost.explode(4, this.zone.x, this.body.top + 30);
    if (!this.phase2 && this.hp <= this.maxHp * C.phase2 && this.hp > 0) {
      this.phase2 = true;
      this.shocks = [];
      this.go('rage', 'horn');
      this.scene.sfx('horn', 1.1, 0.85);
      this.scene.cameras.main.shake(700, 0.005);
    }
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  private die() {
    const s = this.scene;
    this.alive = false;
    this.hp = 0;
    this.go('dead');
    this.storm = false;
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.shocks = [];
    s.time.delayedCall(80, () => this.sprite.clearTint());
    this.anim = 'death';
    this.sprite.setVisible(true).setAlpha(1).play('cacador-death');
    s.deathBurst(this.zone.x, this.zone.y);
    s.frostBurst(this.zone.x, this.body.top + 30, 30);
    s.sfx('ice-break', 1, 0.6);
    s.sfx('thud', 1, 0.5);
    s.hitstop(0.25);
    s.cameras.main.flash(300, 255, 236, 210);
    s.cameras.main.shake(600, 0.008);
    // de joelhos, a lanterna apaga devagar
    s.tweens.add({ targets: [this.lantern, this.halo], alpha: 0, delay: 1200, duration: 1600 });
    s.time.delayedCall(1300, () => s.sfx('lantern', 0.6, 0.7));
    if (s.once('cacador:words')) s.time.delayedCall(1700, () => ui.say('O Mestre da Caça', 'Você também caçava. Só esperava no fim da trilha.', 5600));
    this.onDefeat?.();
  }

  destroy() {
    this.lantern.destroy();
    this.halo.destroy();
    this.white.destroy();
    this.frost.destroy();
    this.scene.whiteout = 0;
  }
}

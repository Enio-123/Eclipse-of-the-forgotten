import Phaser from 'phaser';
import { CARCEREIRA as C, PARRY, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { DEPTH } from '../world/Decor';
import { overlap, type BossFoe, type HitDir, type HitResult } from './Enemy';
import { face, hd } from '../gfx/flip';

type State =
  | 'sleep' | 'rise' | 'roar' | 'idle' | 'walk'
  | 'lashwind' | 'lash' | 'lashrec'
  | 'sweepwind' | 'sweep' | 'sweeprec'
  | 'hookwind' | 'hook'
  | 'yank'
  | 'stagger' | 'rage'
  | 'dead';

type Attack = 'lash' | 'sweep' | 'hook' | 'yank';

interface FramePoints {
  hand: [number, number];
}

// gaiola que cai do teto: sombra no chão antes, e o ferro batendo
interface Cage {
  x: number;
  y: number;
  land: number;
  vy: number;
  t: number;
  falling: boolean;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  done: boolean;
  gritT: number;
}

// o gancho lançado em linha reta na direção do cavaleiro, preso na corrente
interface Hook {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dist: number;
  phase: 'out' | 'back' | 'parried';
}

// A Carcereira: martela máscaras na bigorna, de costas para quem entra. Estala a corrente longa na
// altura do peito (agache ou deslize; dá para aparar), varre o chão com ela (pule), lança o gancho
// em linha reta (saia da linha ou apare a ponta: ele volta e acerta ela) e puxa as correntes do teto
// para soltar gaiolas em cima do cavaleiro. Com metade da vida arranca a máscara da bigorna, chama
// dois carcereiros e emenda os golpes.
export class Carcereira implements BossFoe {
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
  cages: Cage[] = [];
  hook: Hook | null = null;
  private t = 0;
  private thinkT = 0;
  private yankCd = 0;
  private phase2 = false;
  private summoned = false;
  // segunda fase: depois da corrente alta, a varrida baixa sem pausa
  private combo = false;
  private flashT = 0;
  private anim = '';
  private last: Attack[] = [];
  private workT = 0;
  private readonly chain: Phaser.GameObjects.Graphics;
  private readonly floorY: number;
  private readonly x0: number;
  private readonly x1: number;
  private readonly points: Record<string, FramePoints[]> | null;

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.floorY = feetY;
    this.x0 = 9 * TILE;
    this.x1 = (scene.level.w - 3) * TILE - 16;
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(600, 700);
    const o = scene.registry.get('carcereira-origin') as { x: number; y: number };
    this.sprite = hd(scene.add.sprite(x, feetY, 'carcereira', 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy));
    this.points = (scene.cache.json.get('carcereira-meta') as { points?: Record<string, FramePoints[]> } | undefined)?.points ?? null;
    this.chain = scene.add.graphics().setDepth(DEPTH.enemy + 0.3);
    // de costas para a porta, martelando na bigorna
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
    return this.phase2 ? 0.82 : 1;
  }

  private play(name: string) {
    if (this.anim === name) return;
    this.anim = name;
    this.sprite.play(`carcereira-${name}`);
  }

  private go(s: State, anim?: string) {
    this.state = s;
    this.t = 0;
    if (anim) this.play(anim);
  }

  private face() {
    this.facing = this.scene.player.x >= this.zone.x ? 1 : -1;
  }

  private hand() {
    const pts = this.points?.[this.anim];
    const i = (this.sprite.anims.currentFrame?.index ?? 1) - 1;
    const pt = pts?.[Math.min(i, pts.length - 1)]?.hand ?? [16, -64];
    return { x: this.zone.x + this.facing * pt[0], y: this.body.bottom + pt[1] };
  }

  wake() {
    if (this.state !== 'sleep') return;
    this.go('rise', 'rise');
    this.scene.sfx('anvil', 0.9, 0.7);
    this.scene.cameras.main.shake(300, 0.003);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.face();
      this.go('roar', 'roar');
      this.scene.sfx('roar', 0.8, 1.1);
      this.scene.sfx('gate', 0.7, 0.8);
      this.scene.cameras.main.shake(700, 0.004);
    });
  }

  // ---------- áreas dos golpes ----------
  // corrente alta: faixa na altura do peito (agachado ou deslizando passa por baixo)
  private get lashBox() {
    const b = this.body;
    const w = C.lashReach;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x : b.center.x - w, b.bottom - 58, w, 26);
  }

  // varrida: rente ao chão (só pulando)
  private get sweepBox() {
    const b = this.body;
    const w = C.sweepReach;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x : b.center.x - w, b.bottom - 18, w, 18);
  }

  private hookRect(h: Hook) {
    return new Phaser.Geom.Rectangle(h.x - 8, h.y - 8, 16, 16);
  }

  private cageRect(c: Cage) {
    return new Phaser.Geom.Rectangle(c.x - 15, c.y - 34, 30, 34);
  }

  private choose(): Attack {
    const p = this.scene.player;
    const dist = Math.abs(p.x - this.zone.x);
    const high = this.floorY - p.body.bottom > 40;
    let opts: [Attack, number][];
    if (high) opts = [['hook', 0.55], ['yank', 0.45]];
    else if (dist < C.lashReach - 20) opts = [['lash', 0.45], ['sweep', 0.35], ['yank', 0.2]];
    else opts = [['hook', 0.5], ['yank', 0.3], ['lash', 0.2]];
    if (this.yankCd > 0) opts = opts.filter(([a]) => a !== 'yank');
    if (this.last.length >= 2 && this.last[0] === this.last[1]) opts = opts.filter(([a]) => a !== this.last[0]);
    if (!opts.length) opts = [['hook', 1]];
    const total = opts.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [a, w] of opts) {
      r -= w;
      if (r <= 0) return a;
    }
    return opts[0][0];
  }

  update(dt: number) {
    this.updateCages(dt);
    this.updateHook(dt);
    if (this.state === 'dead') {
      this.chain.clear();
      this.sync();
      return;
    }
    if (this.state === 'sleep') {
      // a martelada na bigorna, a cada golpe do martelo
      this.workT -= dt;
      if (this.workT <= 0) {
        this.workT = 0.9;
        const d = Math.abs(this.scene.player.x - this.zone.x);
        if (d < 420) this.scene.sfx('anvil', 0.55 * (1 - d / 420));
        this.scene.forgeSpark(this.zone.x + 30, this.floorY - 22);
      }
      this.sync();
      return;
    }
    const b = this.body;
    const p = this.scene.player;
    this.t += dt;
    this.yankCd -= dt;
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
        // segunda fase: arranca a corrente da bigorna e chama os carcereiros
        b.velocity.x = 0;
        if (!this.summoned && this.t > 0.9) {
          this.summoned = true;
          this.summon();
        }
        if (this.t > 1.8) this.toIdle(0.3);
        break;
      case 'idle': {
        b.velocity.x = 0;
        this.face();
        this.thinkT -= dt;
        if (this.thinkT > 0) break;
        const dist = Math.abs(dx);
        if (dist > C.lashReach && Math.random() < 0.45) {
          this.go('walk', 'walk');
          break;
        }
        this.startAttack(this.choose());
        break;
      }
      case 'walk':
        this.face();
        b.velocity.x = this.facing * C.walk * (this.phase2 ? 1.3 : 1);
        if (Math.abs(dx) < C.lashReach - 30 || this.t > 1.4) {
          b.velocity.x = 0;
          this.startAttack(Math.abs(dx) < C.lashReach - 30 ? (Math.random() < 0.55 ? 'lash' : 'sweep') : this.choose());
        }
        break;
      case 'lashwind':
        b.velocity.x = 0;
        if (this.t > C.lashWind * this.speedMul) {
          this.go('lash', 'lash');
          this.scene.sfx('swoosh', 1, 0.6);
          this.scene.sfx('clang', 0.5, 1.4);
        }
        break;
      case 'lash':
        b.velocity.x = 0;
        if (this.t > C.lashActive) this.go('lashrec', 'lashrec');
        break;
      case 'lashrec':
        b.velocity.x = 0;
        if (this.combo && this.t > 0.18) {
          this.combo = false;
          this.startAttack('sweep', true);
        } else if (this.t > C.lashRec * this.speedMul) this.toIdle();
        break;
      case 'sweepwind':
        b.velocity.x = 0;
        if (this.t > C.sweepWind * this.speedMul) {
          this.go('sweep', 'sweep');
          this.scene.sfx('swoosh', 1, 0.5);
          this.scene.dustBurst(this.zone.x + this.facing * 60, this.floorY, 10);
        }
        break;
      case 'sweep':
        b.velocity.x = 0;
        if (Math.random() < 0.6) this.scene.dustBurst(this.zone.x + this.facing * (40 + Math.random() * (C.sweepReach - 40)), this.floorY, 1);
        if (this.t > C.sweepActive) this.go('sweeprec', 'sweeprec');
        break;
      case 'sweeprec':
        b.velocity.x = 0;
        if (this.t > C.sweepRec * this.speedMul) this.toIdle();
        break;
      case 'hookwind':
        b.velocity.x = 0;
        this.face();
        if (this.t > C.hookWind * this.speedMul) this.launch();
        break;
      case 'hook':
        b.velocity.x = 0;
        if (!this.hook) this.toIdle(0.2);
        break;
      case 'yank':
        b.velocity.x = 0;
        if (this.t > C.yankWind && this.t - dt <= C.yankWind) this.dropCages();
        if (this.t > C.yankWind + 1.2) this.toIdle();
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
    this.sync();
    this.drawChain();
  }

  private sync() {
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(this.body.bottom));
    face(this.sprite, this.facing < 0);
  }

  private toIdle(extra = 0) {
    this.thinkT = (C.think + Math.random() * 0.3) * this.speedMul + extra;
    this.go('idle', 'idle');
  }

  private startAttack(a: Attack, quick = false) {
    this.face();
    this.last = [a, ...this.last].slice(0, 2);
    const s = this.scene;
    if (a === 'lash') {
      this.go('lashwind', 'lashwind');
      s.sfx('censer', 1, 0.7);
      this.combo = this.phase2 && Math.random() < 0.55;
    } else if (a === 'sweep') {
      this.go('sweepwind', 'sweepwind');
      s.sfx('censer', 1, 0.55);
      if (quick) this.t = C.sweepWind * 0.35;
    } else if (a === 'hook') {
      this.go('hookwind', 'hookwind');
      s.sfx('censer', 0.9, 1.2);
      s.glowBurst(this.hand().x, this.hand().y, 0xbcd4ff, 1.2);
    } else {
      this.go('yank', 'yank');
      this.yankCd = C.yankCd;
      s.sfx('gate', 0.9, 0.7);
      s.cameras.main.shake(300, 0.003);
    }
  }

  // ---------- corrente ----------
  // a corrente que estala ou varre: sai da mão e estica até o alcance, na altura do golpe
  private drawChain() {
    const g = this.chain;
    g.clear();
    let k = 0;
    let y = this.body.bottom - 46;
    let reach = C.lashReach;
    if (this.state === 'lash') k = Math.min(1, this.t / 0.07);
    else if (this.state === 'lashrec') k = Math.max(0, 1 - this.t / 0.3);
    else if (this.state === 'sweep' || this.state === 'sweeprec') {
      y = this.body.bottom - 6;
      reach = C.sweepReach;
      k = this.state === 'sweep' ? Math.min(1, this.t / 0.08) : Math.max(0, 1 - this.t / 0.3);
    }
    const h = this.hand();
    if (this.hook) {
      this.links(g, h.x, h.y, this.hook.x, this.hook.y, 0.06);
      this.tip(g, this.hook.x, this.hook.y, Math.atan2(this.hook.vy, this.hook.vx));
      return;
    }
    if (this.state === 'yank') {
      // a corrente do teto que ela agarra e puxa: da mão até a pedra lá em cima
      let top = h.y;
      while (top > 0 && !isSolid(this.scene.level.tileAt(h.x, top - 2))) top -= TILE;
      top = Math.floor(top / TILE) * TILE;
      this.links(g, h.x, h.y, h.x, top, 0);
      return;
    }
    if (k <= 0) return;
    const len = (reach - 6) * k;
    const ex = h.x + this.facing * len;
    this.links(g, h.x, h.y, ex, y, 0.03);
    this.tip(g, ex, y, this.facing > 0 ? 0 : Math.PI);
  }

  private links(g: Phaser.GameObjects.Graphics, ax: number, ay: number, bx: number, by: number, sagK: number) {
    const sag = Math.min(14, Math.abs(bx - ax) * sagK);
    const n = 18;
    g.lineStyle(2.5, 0x1f2129, 1);
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t + Math.sin(Math.PI * t) * sag;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();
    g.fillStyle(0x8f97aa, 1);
    for (let i = 1; i < n; i += 2) {
      const t = i / n;
      g.fillRect(Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t + Math.sin(Math.PI * t) * sag) - 1, 2, 2);
    }
  }

  // o gancho na ponta, virado para trás
  private tip(g: Phaser.GameObjects.Graphics, x: number, y: number, ang: number) {
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const px = -uy;
    const py = ux;
    g.fillStyle(0x30343f, 1).fillTriangle(x + ux * 7, y + uy * 7, x - ux * 4 + px * 6, y - uy * 4 + py * 6, x - ux * 4 - px * 2, y - uy * 4 - py * 2);
    g.fillStyle(0xbcc6da, 1).fillRect(Math.round(x + ux * 3), Math.round(y + uy * 3), 2, 1);
  }

  // ---------- gancho ----------
  private launch() {
    const h = this.hand();
    const p = this.scene.player;
    const tx = p.x;
    const ty = p.body.center.y;
    const d = Math.hypot(tx - h.x, ty - h.y) || 1;
    this.go('hook', 'hook');
    this.hook = { x: h.x, y: h.y, vx: ((tx - h.x) / d) * C.hookSpeed, vy: ((ty - h.y) / d) * C.hookSpeed, dist: 0, phase: 'out' };
    this.scene.sfx('swoosh', 1, 0.8);
  }

  private updateHook(dt: number) {
    const k = this.hook;
    if (!k) return;
    const s = this.scene;
    if (k.phase === 'out') {
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.dist += Math.hypot(k.vx, k.vy) * dt;
      if (k.dist >= C.hookRange || isSolid(s.level.tileAt(k.x, k.y))) {
        k.phase = 'back';
        s.sfx('clang', 0.6, 1.2);
        s.dustBurst(k.x, k.y, 4);
      }
      return;
    }
    // volta pela corrente; rebatido, volta mais rápido e acerta a dona
    const home = this.hand();
    const sp = k.phase === 'parried' ? 720 : C.hookBack;
    const dx = home.x - k.x;
    const dy = home.y - k.y;
    const d = Math.hypot(dx, dy);
    if (d < sp * dt + 4) {
      this.hook = null;
      if (k.phase === 'parried' && this.alive) {
        s.sfx('clang', 1, 0.7);
        s.sfx('anvil', 0.7, 1.3);
        this.flash();
        this.go('stagger', 'stagger');
        this.body.velocity.x = -this.facing * 60;
      }
      return;
    }
    k.vx = (dx / d) * sp;
    k.vy = (dy / d) * sp;
    k.x += k.vx * dt;
    k.y += k.vy * dt;
  }

  // ---------- gaiolas ----------
  private dropCages() {
    const s = this.scene;
    const p = s.player;
    const gap = this.phase2 ? 96 : 120;
    const xs = [Phaser.Math.Clamp(p.x, this.x0, this.x1)];
    for (const k of [-1, 1, 2]) {
      const x = p.x + k * gap * (k === 2 ? -1 : 1);
      if (x > this.x0 && x < this.x1 && xs.every((o) => Math.abs(o - x) > 60)) xs.push(x);
    }
    const key = this.cageTexture();
    for (const x of xs.slice(0, this.phase2 ? 4 : 3)) {
      let land = this.floorY;
      for (let ty = 4; ty < s.level.h; ty++) {
        if (isGround(s.level.tileAt(x, ty * TILE + 2))) {
          land = ty * TILE;
          break;
        }
      }
      const sprite = hd(s.add.image(x, 2 * TILE, key).setOrigin(0.5, 1).setDepth(DEPTH.enemy + 0.6).setVisible(false));
      // sombra escura com a borda clara (no chão escuro da prisão a sombra sozinha some)
      const shadow = s.add.ellipse(x, land - 1, 30, 7, 0x0a0a10, 0).setStrokeStyle(1, 0xaeb8cf, 0).setDepth(DEPTH.enemy - 0.4);
      s.tweens.add({ targets: shadow, fillAlpha: 0.7, strokeAlpha: 0.65, duration: C.cageWarn * 1000 });
      this.cages.push({ x, y: 2 * TILE, land, vy: 0, t: 0, falling: false, sprite, shadow, done: false, gritT: 0 });
      for (let i = 0; i < 3; i++) s.time.delayedCall(i * 160, () => s.dustBurst(x + (Math.random() - 0.5) * 20, 3 * TILE + 4, 2));
    }
    s.sfx('gate', 0.8, 1.3);
  }

  private cageTexture() {
    const s = this.scene;
    if (!s.textures.exists('cage')) {
      const g = s.add.graphics();
      g.fillStyle(0x1c1d24).fillRect(0, 0, 30, 4).fillRect(0, 30, 30, 4);
      g.fillStyle(0x2a2d36);
      for (let x = 1; x < 30; x += 6) g.fillRect(x, 4, 3, 26);
      g.fillStyle(0x6b6f7c);
      for (let x = 1; x < 30; x += 6) g.fillRect(x, 4, 1, 26);
      g.fillStyle(0x3a3d48).fillRect(13, -6, 4, 6);
      g.generateTexture('cage', 30, 34);
      g.destroy();
    }
    return 'cage';
  }

  private updateCages(dt: number) {
    if (this.cages.some((c) => c.done)) this.cages = this.cages.filter((c) => !c.done);
    const s = this.scene;
    for (const c of this.cages) {
      c.t += dt;
      if (!c.falling) {
        c.shadow.setScale(0.6 + 0.4 * Math.min(1, c.t / C.cageWarn), 1);
        // poeira e ferrugem caindo do teto onde a gaiola vai soltar
        c.gritT -= dt;
        if (c.gritT <= 0) {
          c.gritT = 0.07;
          s.grit(c.x + (Math.random() - 0.5) * 20, s.cameras.main.worldView.y + 2);
        }
        if (c.t > C.cageWarn) {
          c.falling = true;
          c.sprite.setVisible(true);
        }
        continue;
      }
      c.vy += 1700 * dt;
      c.y = Math.min(c.land, c.y + c.vy * dt);
      c.sprite.setPosition(c.x, Math.round(c.y));
      if (c.y >= c.land) {
        c.done = true;
        s.sfx('clang', 0.9, 0.6);
        s.sfx('thud', 0.8);
        s.dustBurst(c.x, c.land, 12);
        s.cameras.main.shake(120, 0.006);
        s.tweens.add({ targets: c.sprite, alpha: 0, delay: 700, duration: 500, onComplete: () => c.sprite.destroy() });
        c.shadow.destroy();
      }
    }
  }

  // ---------- segunda fase ----------
  private summon() {
    const p = this.scene.player;
    const spots = [this.x0 + 40, this.x1 - 40].filter((x) => Math.abs(x - p.x) > 120);
    for (const x of spots) {
      this.scene.dustBurst(x, this.floorY, 14);
      this.scene.time.delayedCall(300, () => this.scene.summon('W', x, this.floorY));
    }
    this.scene.sfx('gate', 1, 0.6);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    this.harmFrom = undefined;
    const from = (x: number) => {
      this.harmFrom = x;
      return true;
    };
    for (const c of this.cages) if (c.falling && !c.done && overlap(pr, this.cageRect(c))) return from(c.x);
    if (this.hook && this.hook.phase !== 'parried' && overlap(pr, this.hookRect(this.hook))) return from(this.hook.x - Math.sign(this.hook.vx) * 10);
    if (!this.present) return false;
    if (this.state === 'lash' && overlap(pr, this.lashBox)) return true;
    if (this.state === 'sweep' && overlap(pr, this.sweepBox)) return true;
    if (sliding || this.state === 'stagger') return false;
    return overlap(pr, this.rect);
  }

  // aparar: a corrente alta no fim da preparação ou esticando, ou a ponta do gancho voando
  parry(box: Phaser.Geom.Rectangle, fromX: number) {
    if (!this.alive) return false;
    const k = this.hook;
    if (k && k.phase === 'out' && overlap(box, this.hookRect(k))) {
      k.phase = 'parried';
      return true;
    }
    const late = this.state === 'lashwind' && this.t > C.lashWind * this.speedMul - PARRY.early;
    const swing = this.state === 'lash';
    if (!late && !swing) return false;
    if ((Math.sign(fromX - this.zone.x) || this.facing) !== this.facing) return false;
    if (!overlap(box, this.lashBox) && !overlap(box, this.rect)) return false;
    this.combo = false;
    this.go('stagger', 'stagger');
    this.body.velocity.x = -this.facing * 60;
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
    if (!this.phase2 && this.hp <= this.maxHp * C.phase2 && this.hp > 0) {
      this.phase2 = true;
      this.combo = false;
      this.hook = null;
      this.go('rage', 'roar');
      this.scene.sfx('roar', 1, 1);
      this.scene.sfx('anvil', 1, 0.6);
      this.scene.cameras.main.shake(800, 0.006);
    }
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  private clearHazards() {
    for (const c of this.cages) {
      c.sprite.destroy();
      c.shadow.destroy();
    }
    this.cages = [];
    this.hook = null;
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
    this.sprite.setVisible(true).setAlpha(1).play('carcereira-death');
    s.deathBurst(this.zone.x, this.zone.y);
    s.sfx('anvil', 1.2, 0.5);
    s.sfx('gate', 1, 0.6);
    s.hitstop(0.25);
    s.cameras.main.flash(300, 230, 230, 240);
    s.cameras.main.shake(700, 0.01);
    this.onDefeat?.();
  }

  destroy() {
    this.clearHazards();
    this.chain.destroy();
  }
}

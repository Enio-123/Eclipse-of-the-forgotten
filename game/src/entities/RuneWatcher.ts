import Phaser from 'phaser';
import { WATCHER as C, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { overlap, type Enemy, type HitDir, type HitResult } from './Enemy';
import { DEPTH } from '../world/Decor';
import { canvasRaster, mix } from '../gfx/raster';

type State = 'idle' | 'aim' | 'lock' | 'fire' | 'cool' | 'fall' | 'down' | 'rise';

const GOLD = 0xffc85a;
// a runa do meio (7 x 9): um traço de cima a baixo com dois ramos, como as da Casa
const GLYPH = ['...#...', '..###..', '.#.#.#.', '#..#..#', '...#...', '..#.#..', '.#...#.', '#.....#', '.......'];

// Vigia Rúnica (Torres Rúnicas): um aro de bronze com uma runa no meio, parado no ar e preso a nada (é Âmbar
// vivo). Vendo o cavaleiro, mira: um fio fino de luz sai da runa e segue ele. Depois trava (o fio pisca e
// para de seguir) e dispara um feixe reto que vai até a primeira pedra. Um golpe enquanto ela mira ou trava
// apaga o feixe e derruba a vigia no chão por um instante; caída, ela não machuca e apanha mais.
export class RuneWatcher implements Enemy {
  readonly kind = 'watcher' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  hp = C.hp;
  alive = true;
  private state: State = 'idle';
  private t = 0;
  private cd = 0.6 + Math.random() * 0.8;
  private flashT = 0;
  private ph = Math.random() * Math.PI * 2;
  private readonly home: { x: number; y: number };
  private pos: { x: number; y: number };
  // o empurrão de um golpe (some aos poucos)
  private kick = { x: 0, y: 0 };
  // para onde ela mira (unitário) e onde o feixe bate
  private dir = { x: 1, y: 0 };
  private end = { x: 0, y: 0 };
  private floor = 0;
  // caindo: a velocidade; subindo de volta: quanto tempo leva (depende da altura)
  private vy = 0;
  private riseT = 0.7;
  // o aro visto de lado: 1 de pé no ar, achatado quando deita no chão (e girando enquanto cai)
  private squash = 1;
  private tumble = 0;
  private readonly rune: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly line: Phaser.GameObjects.Image;
  private readonly beam: Phaser.GameObjects.Image;
  private readonly halo: Phaser.GameObjects.Image;
  private readonly spot: Phaser.GameObjects.Image;

  constructor(private scene: GameScene, x: number, y: number) {
    RuneWatcher.textures(scene);
    this.home = { x, y };
    this.pos = { x, y };
    this.zone = scene.add.zone(x, y, C.r * 2, C.r * 2);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.floor = this.floorBelow(x, y);
    // o aro é um sprite de um quadro só (o jogo gira e acende)
    this.sprite = scene.add.sprite(x, y, 'watcher-ring').setDepth(DEPTH.enemy);
    this.rune = scene.add.image(x, y, 'watcher-rune').setDepth(DEPTH.enemy + 0.1).setBlendMode(Phaser.BlendModes.ADD);
    this.glow = scene.add.image(x, y, 'glow').setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy - 0.5).setScale(0.55).setAlpha(0.5);
    const mk = () => scene.add.image(x, y, 'shaft').setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe2a0).setAlpha(0).setDepth(DEPTH.enemy + 0.2);
    this.line = mk();
    this.halo = mk().setDepth(DEPTH.enemy - 0.4);
    this.beam = mk();
    this.spot = scene.add.image(x, y, 'glow').setTint(0xffd98a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(DEPTH.enemy - 0.3);
  }

  // o aro de bronze (24 x 24, quatro cravos) e a runa
  private static textures(scene: Phaser.Scene) {
    const T = scene.textures;
    if (T.exists('watcher-ring')) return;
    const N = 26;
    const { canvas, r, commit } = canvasRaster(N, N);
    const R0 = 11.5;
    const R1 = 7.2;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = x + 0.5 - N / 2;
        const dy = y + 0.5 - N / 2;
        const d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        const stud = Math.abs(((a / (Math.PI / 2)) % 1 + 1) % 1 - 0.5) < 0.09 && d > R0 - 1.2 && d < R0 + 1.6;
        if ((d > R0 || d < R1) && !stud) continue;
        // o meio do aro mais alto (a luz de cima e da esquerda), as bordas mais escuras
        const mid = 1 - Math.abs(d - (R0 + R1) / 2) / ((R0 - R1) / 2);
        const lit = -(dx + dy) / ((d || 1) * 1.414);
        let c = mix(0x5a3a18, 0xb98a3e, Math.max(0, Math.min(1, 0.35 + mid * 0.4 + lit * 0.35)));
        if (stud) c = mix(0x8a5c26, 0xe4bd72, Math.max(0, lit) * 0.8 + 0.2);
        // as marcas gravadas no aro
        if (!stud && Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) < 0.05 && mid > 0.3) c = 0x2e1f10;
        r.set(x, y, c);
      }
    }
    r.outline(0x1a1109);
    commit();
    T.addCanvas('watcher-ring', canvas);
    const g = canvasRaster(9, 11);
    GLYPH.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && g.r.set(x + 1, y + 1, 0xffe6a8)));
    g.commit();
    T.addCanvas('watcher-rune', g.canvas);
  }

  get rect() {
    return new Phaser.Geom.Rectangle(this.pos.x - C.r, this.pos.y - C.r, C.r * 2, C.r * 2);
  }

  // o chão embaixo dela (para onde ela cai quando é derrubada): a primeira pedra ou tábua
  private floorBelow(x: number, y: number) {
    const L = this.scene.level;
    for (let ty = Math.floor(y / TILE) + 1; ty < L.h; ty++) if (isGround(L.tileAt(x, ty * TILE + 1))) return ty * TILE;
    return y + 120;
  }

  private sees(x: number, y: number) {
    const L = this.scene.level;
    const dx = x - this.pos.x;
    const dy = y - this.pos.y;
    const n = Math.ceil(Math.hypot(dx, dy) / (TILE / 2));
    for (let i = 1; i < n; i++) if (isSolid(L.tileAt(this.pos.x + (dx * i) / n, this.pos.y + (dy * i) / n))) return false;
    return true;
  }

  // até onde o feixe vai na direção dela: a primeira pedra (ou o alcance)
  private cast() {
    const L = this.scene.level;
    const max = C.range;
    for (let s = C.r; s < max; s += 3) {
      const x = this.pos.x + this.dir.x * s;
      const y = this.pos.y + this.dir.y * s;
      if (isSolid(L.tileAt(x, y))) return { x, y };
    }
    return { x: this.pos.x + this.dir.x * max, y: this.pos.y + this.dir.y * max };
  }

  private aimAt(x: number, y: number, k: number) {
    const dx = x - this.pos.x;
    const dy = y - this.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    // ela vira a mira devagar (não acerta quem se mexe rápido)
    const tx = dx / d;
    const ty = dy / d;
    const nx = this.dir.x + (tx - this.dir.x) * k;
    const ny = this.dir.y + (ty - this.dir.y) * k;
    const n = Math.hypot(nx, ny) || 1;
    this.dir = { x: nx / n, y: ny / n };
  }

  private go(s: State) {
    this.state = s;
    this.t = 0;
  }

  update(dt: number) {
    if (!this.alive) return;
    const p = this.scene.player;
    this.t += dt;
    this.cd -= dt;
    this.ph += dt;
    const px = p.x;
    const py = p.body.center.y;
    const dist = Math.hypot(px - this.pos.x, py - this.pos.y);
    const seen = !p.dead && dist < C.sight && this.sees(px, py);
    switch (this.state) {
      case 'idle':
        if (seen && this.cd <= 0) {
          this.go('aim');
          this.aimAt(px, py, 1);
          this.scene.sfx('chime', 0.18, 1.3);
        }
        break;
      case 'aim':
        this.aimAt(px, py, Math.min(1, dt * 5));
        if (!seen && this.t > 0.3) {
          this.cd = 0.5;
          this.go('idle');
        } else if (this.t > C.aim) {
          this.go('lock');
          this.scene.sfx('chime', 0.3, 1.9);
        }
        break;
      case 'lock':
        if (this.t > C.lock) {
          this.go('fire');
          this.scene.sfx('beam', 0.7, 1);
          this.scene.cameras.main.shake(80, 0.002);
        }
        break;
      case 'fire':
        if (this.t > C.fire) {
          this.cd = C.cooldown * (0.85 + Math.random() * 0.3);
          this.go('cool');
        }
        break;
      case 'cool':
        if (this.t > 0.3) this.go('idle');
        break;
      case 'down':
        // caída no chão, a runa quase apagada
        if (this.t > C.down) {
          this.go('rise');
          this.riseT = Math.max(0.7, Math.min(3, (this.floor - this.home.y) / 120));
          this.scene.sfx('chime', 0.2, 0.9);
        }
        break;
      case 'rise':
        if (this.t > this.riseT) {
          this.cd = 0.8;
          this.go('idle');
        }
        break;
    }
    // onde ela fica: flutuando em casa (com o empurrão do golpe), caída no chão ou subindo de volta
    this.kick.x *= Math.pow(0.04, dt);
    this.kick.y *= Math.pow(0.04, dt);
    const bob = Math.sin(this.ph * 1.7) * C.bob;
    const air = { x: this.home.x + this.kick.x, y: this.home.y + bob + this.kick.y };
    const ground = { x: this.home.x + this.kick.x * 0.3, y: this.floor - 4 };
    if (this.state === 'fall') {
      // apagada, ela cai como o bronze que é, quica uma vez no chão e fica
      this.vy += 900 * dt;
      let y = this.pos.y + this.vy * dt;
      if (y >= ground.y) {
        y = ground.y;
        if (this.vy > 160) {
          this.scene.sfx('clang', Math.min(0.6, this.vy / 900), 1.5);
          this.scene.dustBurst(this.pos.x, this.floor, 3);
          this.vy = -this.vy * 0.25;
        } else {
          this.vy = 0;
          this.go('down');
        }
      }
      this.pos = { x: this.pos.x + (ground.x - this.pos.x) * Math.min(1, dt * 4), y };
      this.tumble += dt * 11;
      this.squash = 0.2 + 0.8 * Math.abs(Math.cos(this.tumble));
    } else if (this.state === 'down') {
      this.pos = { x: ground.x, y: ground.y };
      this.squash += (0.3 - this.squash) * Math.min(1, dt * 14);
    } else if (this.state === 'rise') {
      this.squash += (1 - this.squash) * Math.min(1, dt * 5);
      const k = Math.min(1, this.t / this.riseT);
      const e = k * k * (3 - 2 * k);
      this.pos = { x: ground.x + (air.x - ground.x) * e, y: ground.y + (air.y - ground.y) * e };
    } else {
      this.pos = air;
      this.squash = 1;
    }
    this.body.reset(this.pos.x, this.pos.y);
    this.draw(dt);
  }

  private draw(dt: number) {
    const { x, y } = this.pos;
    const st = this.state;
    const charging = st === 'aim' || st === 'lock';
    const down = st === 'down' || st === 'fall';
    // o aro gira devagar; mirando, cada vez mais rápido
    if (down) this.sprite.setAngle(0);
    else this.sprite.rotation += dt * (charging ? 1.2 + this.t * 4 : 0.5);
    this.sprite.setPosition(x, y).setScale(1, this.squash);
    const pulse = 0.5 + 0.5 * Math.sin(this.ph * 3);
    const k = st === 'aim' ? Math.min(1, this.t / C.aim) : st === 'lock' || st === 'fire' ? 1 : down ? 0.08 : st === 'rise' ? (this.t / this.riseT) * 0.5 : 0.35 + pulse * 0.15;
    const sc = 1 + (st === 'lock' ? 0.15 * Math.sin(this.t * 40) : 0);
    this.rune.setPosition(x, y).setAlpha(down ? 0.1 : 0.35 + k * 0.65).setScale(sc, sc * this.squash);
    this.glow.setPosition(x, y).setAlpha(0.18 + k * 0.6).setScale(0.45 + k * 0.5);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.sprite.clearTint();
    }
    // a mira, a trava e o feixe
    const aimLine = st === 'aim' || st === 'lock';
    if (aimLine || st === 'fire') this.end = this.cast();
    const len = Math.hypot(this.end.x - x, this.end.y - y);
    const rot = Math.atan2(-(this.end.x - x), this.end.y - y);
    if (aimLine) {
      const blink = st === 'lock' ? (Math.floor(this.t * 18) % 2 ? 0.75 : 0.2) : 0.12 + 0.25 * Math.min(1, this.t / C.aim);
      this.line.setPosition(x, y).setRotation(rot).setDisplaySize(st === 'lock' ? 2 : 1, len).setAlpha(blink);
    } else this.line.setAlpha(0);
    if (st === 'fire') {
      const f = 1 - Math.max(0, this.t - C.fire * 0.6) / (C.fire * 0.4);
      const flick = 0.85 + Math.random() * 0.15;
      this.beam.setPosition(x, y).setRotation(rot).setDisplaySize(C.half * 2 + 2, len).setAlpha(0.85 * f * flick);
      this.halo.setPosition(x, y).setRotation(rot).setDisplaySize(C.half * 8, len).setAlpha(0.25 * f * flick);
      this.spot.setPosition(this.end.x, this.end.y).setScale(0.8).setAlpha(0.8 * f);
      if (Math.random() < 0.6) this.scene.dustBurst(this.end.x, this.end.y, 1);
    } else {
      this.beam.setAlpha(0);
      this.halo.setAlpha(0);
      this.spot.setAlpha(0);
    }
  }

  // o feixe passa pelo cavaleiro? (distância da linha até o meio dele, nas três alturas do corpo)
  private beamHits(pr: Phaser.Geom.Rectangle) {
    if (this.state !== 'fire' || this.t > C.fire * 0.85) return false;
    const ax = this.pos.x;
    const ay = this.pos.y;
    const vx = this.end.x - ax;
    const vy = this.end.y - ay;
    const L2 = vx * vx + vy * vy || 1;
    for (const py of [pr.y + 4, pr.centerY, pr.bottom - 4]) {
      const px = pr.centerX;
      const t = Phaser.Math.Clamp(((px - ax) * vx + (py - ay) * vy) / L2, 0, 1);
      if (Math.hypot(px - (ax + vx * t), py - (ay + vy * t)) < C.half + pr.width / 2) return true;
    }
    return false;
  }

  harmFrom?: number;

  harms(pr: Phaser.Geom.Rectangle) {
    this.harmFrom = undefined;
    if (!this.alive) return false;
    if (this.beamHits(pr)) {
      this.harmFrom = pr.centerX - this.dir.x * 20;
      return true;
    }
    if (this.state === 'down' || this.state === 'fall' || this.state === 'rise') return false;
    return overlap(pr, this.rect);
  }

  hit(fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive) return 'ignored';
    const charging = this.state === 'aim' || this.state === 'lock';
    if (this.state === 'down' || this.state === 'fall') dmg *= 1.5;
    this.hp -= dmg;
    this.flashT = 0.07;
    this.sprite.setTintFill(0xffffff);
    this.scene.sparkAt(this.pos.x, this.pos.y, 8);
    if (this.hp <= 0) {
      this.die();
      return 'hit';
    }
    // mirando: a runa apaga e ela cai
    if (charging) {
      this.go('fall');
      this.vy = -40;
      this.scene.sfx('glass', 0.5, 1.4);
      this.scene.sfx('thud', 0.4, 1.4);
      this.line.setAlpha(0);
    } else if (this.state !== 'down' && this.state !== 'fall' && this.state !== 'rise') {
      this.kick = { x: -Math.sign(fromX - this.pos.x) * 22 || 22, y: -6 };
    }
    return 'hit';
  }

  vanish() {
    if (!this.alive) return null;
    this.alive = false;
    this.body.enable = false;
    this.clearFx();
    return this.sprite;
  }

  destroy() {
    this.clearFx();
  }

  private clearFx() {
    for (const o of [this.rune, this.glow, this.line, this.beam, this.halo, this.spot]) o.destroy();
  }

  private die() {
    this.alive = false;
    this.body.enable = false;
    const s = this.scene;
    s.deathBurst(this.pos.x, this.pos.y);
    s.glowBurst(this.pos.x, this.pos.y, GOLD, 2.4);
    s.sfx('glass', 0.8, 0.9);
    s.sfx('chime', 0.4, 0.7);
    this.clearFx();
    s.time.delayedCall(80, () => this.sprite.clearTint());
    // o aro cai apagado e some
    const floor = this.floorBelow(this.pos.x, this.pos.y) - 5;
    s.tweens.add({ targets: this.sprite, y: floor, angle: this.sprite.angle + 200, duration: Math.max(200, (floor - this.pos.y) * 3), ease: 'Quad.easeIn',
      onComplete: () => s.sfx('clang', 0.4, 1.3) });
    s.tweens.add({ targets: this.sprite, alpha: 0, delay: 1500, duration: 800, onComplete: () => this.sprite.destroy() });
    this.sprite.setTint(mix(0xffffff, 0x6a5a48, 0.5));
  }
}

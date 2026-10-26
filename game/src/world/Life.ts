import Phaser from 'phaser';
import { TILE } from '../config';
import type { Level3 } from '../systems/Graphics';
import { BG } from './Backdrop';
import { DEPTH } from './Decor';
import type { Level, Theme } from './Level';

// Vida no cenário do High e do EXTREME (no Performance nada disso existe):
// - mariposas rodando em volta das chamas e brasas subindo das tochas e velas;
// - teias nos cantos do teto que tremem com o ar;
// - no EXTREME, ainda: ratos que atravessam o chão e fogem do cavaleiro, morcegos cruzando o fundo,
//   pássaros longe no céu, vaga-lumes no jardim e na cidade, borboletas no vale e folhas secas caindo.
// Tudo pequeno, sem física e sem tocar no jogador: enfeite que mexe, nunca obstáculo.

type V = { x: number; y: number };

interface Moth {
  img: Phaser.GameObjects.Image;
  light: V;
  a: number;
  speed: number;
  rx: number;
  ry: number;
}

interface Critter {
  img: Phaser.GameObjects.Image;
  kind: 'rat' | 'bat' | 'bird' | 'fly' | 'butterfly' | 'leaf';
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  frame: number;
  base: number;
  // rato: o trecho de chão onde ele corre
  x0?: number;
  x1?: number;
}

interface Web {
  img: Phaser.GameObjects.Image;
  phase: number;
}

const has = (theme: Theme, list: Theme[]) => list.includes(theme);

// desenha uma textura pequena uma vez (pixels de 1 px do mundo)
function sprite(scene: Phaser.Scene, key: string, w: number, h: number, rows: string[], pal: Record<string, number>) {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const c = pal[r[x]];
      if (c === undefined) continue;
      g.fillStyle(c, 1).fillRect(x, y, 1, 1);
    }
  });
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

function textures(scene: Phaser.Scene) {
  const k = { a: 0x231f24, b: 0x3a3438, c: 0x5a5056, e: 0xc9a46a };
  sprite(scene, 'life-rat-0', 10, 5, ['..........', '...bbbb.c.', 'aabbbbbbbe', '..bbbbbbb.', '...b..b...'], k);
  sprite(scene, 'life-rat-1', 10, 5, ['..........', '...bbbb.c.', 'aabbbbbbbe', '..bbbbbbb.', '..b....b..'], k);
  const bat = { a: 0x0d0b10, b: 0x1c1820 };
  sprite(scene, 'life-bat-0', 11, 5, ['a.........a', 'aa..b.b..aa', '.aaabbbaaa.', '...abbba...', '....a.a....'], bat);
  sprite(scene, 'life-bat-1', 11, 5, ['...........', '....b.b....', '..aabbbaa..', '.aa.bbb.aa.', 'a...a.a...a'], bat);
  const bird = { a: 0x17141b };
  sprite(scene, 'life-bird-0', 7, 3, ['a.....a', '.a...a.', '..aaa..'], bird);
  sprite(scene, 'life-bird-1', 7, 3, ['.......', 'aaa.aaa', '...a...'], bird);
  const fly = { a: 0xf3e6a8, b: 0xc8b27a };
  sprite(scene, 'life-moth', 3, 2, ['bab', '.a.'], fly);
  const bf = { a: 0xffffff, b: 0xe9d9f2, c: 0x5a4a60 };
  sprite(scene, 'life-bfly-0', 5, 4, ['aa.aa', 'abcba', '.bcb.', '..c..'], bf);
  sprite(scene, 'life-bfly-1', 5, 4, ['.a.a.', '.aca.', '.bcb.', '..c..'], bf);
  const leaf = { a: 0x8a5a2a, b: 0xb07a38, c: 0x5e3d1e };
  sprite(scene, 'life-leaf', 4, 3, ['.ab.', 'abbc', '.cc.'], leaf);
  // teia de aranha: fios saindo do canto e arcos entre eles
  if (!scene.textures.exists('life-web')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(1, 0xd8dce6, 0.55);
    const R = 22;
    const angs = [0.05, 0.42, 0.8, 1.15, 1.52];
    for (const a of angs) g.lineBetween(0, 0, Math.cos(a) * R, Math.sin(a) * R);
    g.lineStyle(1, 0xd8dce6, 0.32);
    for (const r of [6, 11, 16, 21]) {
      g.beginPath();
      angs.forEach((a, i) => {
        const rr = r * (0.92 + 0.08 * Math.sin(i * 2.1 + r));
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.strokePath();
    }
    g.generateTexture('life-web', R + 1, R + 1);
    g.destroy();
  }
}

export class Life {
  private moths: Moth[] = [];
  private critters: Critter[] = [];
  private webs: Web[] = [];
  private embers: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private flames: V[] = [];
  private floors: { x0: number; x1: number; y: number }[] = [];
  private t = 0;
  private nextRat = 4;
  private nextBat = 6;
  private nextBird = 3;
  private nextLeaf = 0.5;

  constructor(private scene: Phaser.Scene, private level: Level, private life: Level3, private particles: Level3) {
    if (life <= 0) return;
    textures(scene);
    const theme = level.theme;
    // chamas da sala: brilhos pequenos e fortes que já existem (velas, tochas, lampiões, forja)
    for (const o of scene.children.list) {
      if (!(o instanceof Phaser.GameObjects.Image) || o.texture.key !== 'glow' || o.scrollFactorX !== 1) continue;
      if (o.depth > 1.01 || o.alpha < 0.3 || Math.max(o.scaleX, o.scaleY) > 1.7) continue;
      if (this.flames.some((f) => Math.abs(f.x - o.x) < 12 && Math.abs(f.y - o.y) < 12)) continue;
      this.flames.push({ x: o.x, y: o.y });
    }
    const warm = has(theme, ['catacomb', 'prison', 'nave', 'city', 'bridge']);
    if (warm) this.makeMoths();
    if (warm && particles > 0) this.makeEmbers();
    if (has(theme, ['catacomb', 'prison', 'nave'])) this.makeWebs();
    const L = level;
    this.floors = L.spans((x, y) => L.floorCell(x, y)).filter((s) => s.x1 - s.x0 >= 5).map((s) => ({ x0: s.x0 * TILE, x1: (s.x1 + 1) * TILE, y: s.y * TILE }));
    if (life >= 2 && has(theme, ['city', 'memory'])) this.spawnFlies();
  }

  // ---------- mariposas em volta das chamas ----------
  private makeMoths() {
    const n = this.life >= 2 ? 3 : 1;
    for (const f of this.flames) {
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.35) continue;
        const img = this.scene.add.image(f.x, f.y, 'life-moth').setDepth(DEPTH.front + 0.2).setAlpha(0.9);
        this.moths.push({ img, light: f, a: Math.random() * 6.28, speed: 2.2 + Math.random() * 2.6, rx: 7 + Math.random() * 12, ry: 5 + Math.random() * 9 });
      }
    }
  }

  private makeEmbers() {
    if (!this.flames.length) return;
    this.embers = this.scene.add.particles(0, 0, 'px', {
      lifespan: { min: 900, max: 2000 },
      speedX: { min: -8, max: 8 },
      speedY: { min: -34, max: -12 },
      gravityY: -4,
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.95, end: 0 },
      tint: [0xffb04a, 0xff8a3a, 0xffe0a0],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(DEPTH.front + 0.3);
  }

  // ---------- teias nos cantos do teto ----------
  private makeWebs() {
    const L = this.level;
    const p = this.life >= 2 ? 0.55 : 0.3;
    for (let y = 1; y < L.h - 1; y++) {
      for (let x = 1; x < L.w - 1; x++) {
        if (!L.openCell(x, y) || !L.solidCell(x, y - 1)) continue;
        const left = L.solidCell(x - 1, y);
        const right = L.solidCell(x + 1, y);
        if (left === right) continue;
        if (((x * 928371 + y * 1237) % 100) / 100 > p) continue;
        const img = this.scene.add.image(left ? x * TILE : (x + 1) * TILE, y * TILE, 'life-web').setOrigin(0, 0).setDepth(DEPTH.support + 0.5).setAlpha(0.7);
        if (right) img.setFlipX(true).setOrigin(1, 0);
        img.setScale(0.7 + ((x * 31 + y * 17) % 5) * 0.1);
        this.webs.push({ img, phase: x * 0.7 + y });
      }
    }
  }

  // ---------- bichos ----------
  private spawnFlies() {
    const v = this.scene.cameras.main.worldView;
    const n = this.level.theme === 'memory' ? 7 : 9;
    for (let i = 0; i < n; i++) this.addFly(v.x + Math.random() * v.width, v.y + 40 + Math.random() * (v.height - 80));
  }

  private addFly(x: number, y: number) {
    const memory = this.level.theme === 'memory';
    if (memory) {
      const img = this.scene.add.image(x, y, 'life-bfly-0').setDepth(DEPTH.front + 0.4).setTint([0xffffff, 0xffd6e8, 0xfff0a0, 0xd6c4ff][Math.floor(Math.random() * 4)]);
      this.critters.push({ img, kind: 'butterfly', x, y, vx: 0, vy: 0, t: Math.random() * 10, life: 1e9, frame: 0, base: y });
    } else {
      // vaga-lume: um ponto quente que acende e apaga devagar
      const img = this.scene.add.image(x, y, 'glow').setScale(0.09).setTint(0xfff0a0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front + 0.4);
      this.critters.push({ img, kind: 'fly', x, y, vx: 0, vy: 0, t: Math.random() * 10, life: 1e9, frame: 0, base: y });
    }
  }

  private spawnRat(player: V) {
    const v = this.scene.cameras.main.worldView;
    const spans = this.floors.filter((f) => f.y > v.y + 20 && f.y < v.bottom && f.x1 > v.x && f.x0 < v.right);
    if (!spans.length) return;
    const f = spans[Math.floor(Math.random() * spans.length)];
    // nasce numa ponta do chão, longe do cavaleiro, e corre para a outra
    const fromLeft = Math.abs(player.x - f.x0) > Math.abs(player.x - f.x1);
    const x = fromLeft ? Math.max(f.x0 + 4, v.x - 10) : Math.min(f.x1 - 4, v.right + 10);
    const img = this.scene.add.image(x, f.y + 1, 'life-rat-0').setOrigin(0.5, 1).setDepth(DEPTH.front + 0.1).setFlipX(!fromLeft);
    this.critters.push({ img, kind: 'rat', x, y: f.y + 1, vx: (fromLeft ? 1 : -1) * (55 + Math.random() * 30), vy: 0, t: 0, life: 12, frame: 0, base: f.y + 1, x0: f.x0, x1: f.x1 });
  }

  private spawnBat() {
    // atravessa a tela no fundo (anda menos que o mundo), batendo asa
    const cam = this.scene.cameras.main;
    const left = Math.random() < 0.5;
    const sf = 0.55;
    const img = this.scene.add.image(0, 0, 'life-bat-0').setDepth(BG.beams + 0.5).setScrollFactor(sf).setAlpha(0.85);
    const x = cam.scrollX * sf + (left ? -20 : cam.width / cam.zoom + 20) + cam.width * (1 - 1 / cam.zoom) * 0.5;
    const y = cam.scrollY * sf + 40 + Math.random() * 110 + cam.height * (1 - 1 / cam.zoom) * 0.5;
    this.critters.push({ img, kind: 'bat', x, y, vx: (left ? 1 : -1) * (90 + Math.random() * 50), vy: 0, t: Math.random() * 3, life: 9, frame: 0, base: y });
  }

  private spawnBirds() {
    const cam = this.scene.cameras.main;
    const left = Math.random() < 0.5;
    const sf = 0.15;
    const n = 1 + Math.floor(Math.random() * 4);
    const x0 = cam.scrollX * sf + (left ? -20 : cam.width / cam.zoom + 20) + cam.width * (1 - 1 / cam.zoom) * 0.5;
    const y0 = cam.scrollY * sf + 25 + Math.random() * 70 + cam.height * (1 - 1 / cam.zoom) * 0.5;
    for (let i = 0; i < n; i++) {
      const img = this.scene.add.image(0, 0, 'life-bird-0').setDepth(BG.cloudsNear + 0.2).setScrollFactor(sf).setAlpha(0.75);
      const y = y0 + i * 5 - n * 2;
      this.critters.push({ img, kind: 'bird', x: x0 - (left ? i * 9 : -i * 9), y, vx: (left ? 1 : -1) * (26 + Math.random() * 6), vy: 0, t: Math.random() * 2, life: 40, frame: 0, base: y });
    }
  }

  private spawnLeaf() {
    const v = this.scene.cameras.main.worldView;
    const x = v.x + Math.random() * v.width;
    const img = this.scene.add.image(x, v.y - 6, 'life-leaf').setDepth(DEPTH.front + 0.5).setAlpha(0.95).setTint([0xffffff, 0xe8c890, 0xc89a60][Math.floor(Math.random() * 3)]);
    this.critters.push({ img, kind: 'leaf', x, y: v.y - 6, vx: 6 + Math.random() * 10, vy: 16 + Math.random() * 10, t: Math.random() * 6, life: 14, frame: 0, base: x });
  }

  destroy() {
    for (const m of this.moths) m.img.destroy();
    for (const c of this.critters) c.img.destroy();
    for (const w of this.webs) w.img.destroy();
    this.embers?.destroy();
    this.moths = [];
    this.critters = [];
    this.webs = [];
    this.embers = null;
  }

  update(dt: number, player: { x: number; body: Phaser.Physics.Arcade.Body } | null) {
    if (this.life <= 0) return;
    this.t += dt;
    const v = this.scene.cameras.main.worldView;
    const theme = this.level.theme;
    const near = (p: V, m: number) => p.x > v.x - m && p.x < v.right + m && p.y > v.y - m && p.y < v.bottom + m;

    for (const m of this.moths) {
      const on = near(m.light, 30);
      m.img.setVisible(on);
      if (!on) continue;
      m.a += dt * m.speed * (0.8 + 0.4 * Math.sin(this.t * 1.7 + m.rx));
      m.img.x = m.light.x + Math.cos(m.a) * m.rx + Math.sin(this.t * 7 + m.ry) * 1.5;
      m.img.y = m.light.y + Math.sin(m.a * 1.6) * m.ry - 3;
    }
    if (this.embers) {
      const rate = this.particles >= 2 ? 1.6 : 0.7;
      for (const f of this.flames) if (near(f, 10) && Math.random() < rate * dt) this.embers.emitParticleAt(f.x + (Math.random() - 0.5) * 4, f.y - 4);
    }
    for (const w of this.webs) {
      if (!near(w.img, 30)) continue;
      w.img.rotation = Math.sin(this.t * 1.3 + w.phase) * 0.025;
    }

    if (this.life >= 2 && player) {
      const pv = { x: player.x, y: player.body.bottom };
      if (has(theme, ['catacomb', 'prison']) && (this.nextRat -= dt) <= 0) {
        this.nextRat = 9 + Math.random() * 12;
        this.spawnRat(pv);
      }
      if (has(theme, ['catacomb', 'prison', 'nave']) && (this.nextBat -= dt) <= 0) {
        this.nextBat = 14 + Math.random() * 16;
        this.spawnBat();
      }
      if (has(theme, ['bridge', 'city', 'memory']) && (this.nextBird -= dt) <= 0) {
        this.nextBird = 16 + Math.random() * 18;
        this.spawnBirds();
      }
      if (has(theme, ['city']) && (this.nextLeaf -= dt) <= 0) {
        this.nextLeaf = (this.particles >= 2 ? 1.2 : 2.6) + Math.random() * 2;
        this.spawnLeaf();
      }
    }

    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i];
      c.t += dt;
      c.life -= dt;
      switch (c.kind) {
        case 'rat': {
          // corre aos trancos; se o cavaleiro chega perto, dispara para longe dele
          if (player && Math.abs(player.x - c.x) < 70 && Math.abs(player.body.bottom - c.y) < 24) {
            const away = Math.sign(c.x - player.x) || 1;
            c.vx = away * 150;
            c.img.setFlipX(away < 0);
          }
          const go = Math.sin(c.t * 9) > -0.6 ? 1 : 0.15;
          c.x += c.vx * dt * go;
          c.frame = Math.floor(c.t * 14) % 2;
          c.img.setTexture(`life-rat-${c.frame}`);
          if (c.x < (c.x0 ?? 0) - 2 || c.x > (c.x1 ?? 1e9) + 2) c.life = 0;
          c.img.x = c.x;
          break;
        }
        case 'bat':
          c.x += c.vx * dt;
          c.y = c.base + Math.sin(c.t * 5) * 8 + Math.sin(c.t * 1.3) * 14;
          c.img.setTexture(`life-bat-${Math.floor(c.t * 12) % 2}`).setPosition(c.x, c.y);
          break;
        case 'bird':
          c.x += c.vx * dt;
          c.y = c.base + Math.sin(c.t * 0.8) * 3;
          c.img.setTexture(`life-bird-${Math.floor(c.t * 5) % 2}`).setPosition(c.x, c.y);
          break;
        case 'fly': {
          // vaga-lume vagando devagar, sem sair da tela
          c.vx += (Math.sin(c.t * 0.9 + c.base) * 14 - c.vx) * dt;
          c.vy += (Math.cos(c.t * 0.7 + c.base * 0.3) * 9 - c.vy) * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          if (c.x < v.x - 20) c.x = v.right + 10;
          if (c.x > v.right + 20) c.x = v.x - 10;
          c.y = Phaser.Math.Clamp(c.y, v.y + 20, v.bottom - 30);
          c.img.setPosition(c.x, c.y).setAlpha(0.25 + 0.75 * Math.max(0, Math.sin(c.t * 1.4 + c.base)));
          break;
        }
        case 'butterfly':
          c.vx += (Math.sin(c.t * 0.6 + c.base) * 22 - c.vx) * dt * 1.5;
          c.x += c.vx * dt;
          c.y = c.base + Math.sin(c.t * 2.3) * 10 + Math.sin(c.t * 7) * 2;
          if (c.x < v.x - 20) c.x = v.right + 10;
          if (c.x > v.right + 20) c.x = v.x - 10;
          c.img.setTexture(`life-bfly-${Math.floor(c.t * 10) % 2}`).setPosition(c.x, c.y).setFlipX(c.vx < 0);
          break;
        case 'leaf':
          c.x += (c.vx + Math.sin(c.t * 2.2) * 16) * dt;
          c.y += c.vy * dt;
          c.img.setPosition(c.x, c.y).setRotation(Math.sin(c.t * 2.2) * 0.9);
          if (c.y > v.bottom + 10) c.life = 0;
          break;
      }
      if (c.life <= 0) {
        c.img.destroy();
        this.critters.splice(i, 1);
      }
    }
  }
}

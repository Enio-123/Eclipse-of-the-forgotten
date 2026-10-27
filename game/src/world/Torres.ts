import Phaser from 'phaser';
import { TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import { overlap } from '../entities/Enemy';
import { progress } from '../systems/Save';
import { ui } from '../ui/ui';
import { JAR_ECHOES } from './lore';
import { BG } from './Backdrop';
import { DEPTH } from './Decor';
import { canvasRaster, mix, rng } from '../gfx/raster';

// quanto tempo o lume fica apagado depois de dar a luz dele (s), o raio em que ele encosta no cavaleiro
// (px) e a cor da luz das nuvens
const RELIGHT = 3.5;
const REACH = 11;
const GOLD = 0xffc85a;
// apagado, sobra só uma brasa escura no lugar
const EMBER = 0x7a6450;
// quanto tempo uma runa fica acesa depois do golpe (s) e quando ela começa a apagar e a piscar
const RUNE_T = 14;
const RUNE_WARN = 4;
const RUNE_BLINK = 1.5;
// a corrente dos baldes (px/s) e o espaço entre dois baldes (px)
const CHAIN_V = 26;
const BUCKET_GAP = 72;
// as rodas dentadas: o passo dos dentes na circunferência primitiva (px, o mesmo em todas, para engrenarem),
// a fase do centro do dente e do centro do vão e quantos dentes passam por segundo no ponto de contato
const TOOTH = 14;
const TOOTH_C = 0.34;
const GAP_C = 0.84;
const GEAR_RATE = 0.8;
// o raio da circunferência primitiva de uma roda de n dentes (px): duas rodas engrenadas ficam com os
// centros à soma dos dois
const pitch = (n: number) => (n * TOOTH) / (Math.PI * 2);
const frac = (v: number) => ((v % 1) + 1) % 1;
// as runas da Casa: 7 colunas por 9 linhas, uma por pedra (a pedra gravada e a luz dela usam o mesmo
// desenho)
const GLYPHS = [
  ['..#.#..', '..#.#..', '...#...', '..###..', '.#.#.#.', '#..#..#', '...#...', '..#.#..', '.#...#.'],
  ['#######', '...#...', '..#.#..', '.#...#.', '#..#..#', '...#...', '...#...', '..###..', '...#...'],
  ['...#...', '..#.#..', '.#...#.', '#.....#', '.#...#.', '..#.#..', '...#...', '...#...', '#######'],
  ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#..#..#', '...#...', '...#...'],
];

interface Lume {
  x: number;
  y: number;
  core: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  // quanto falta para acender de novo (s), o quanto está aceso (0 a 1, sobe devagar ao voltar) e a fase
  // do balanço (cada um no seu ritmo)
  off: number;
  k: number;
  ph: number;
}

interface Jar {
  x: number;
  y: number;
  i: number;
  light: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  // o clarão de quando o eco toca (decai) e a fase do brilho
  flare: number;
  ph: number;
}

interface Rune {
  x: number;
  // o chão onde a pedra assenta
  y: number;
  rect: Phaser.Geom.Rectangle;
  glyph: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  // quanto tempo acesa ainda (s; Infinity: o conjunto já abriu e ela fica acesa de vez), o brilho
  // mostrado e o intervalo entre dois toques da magia (s)
  t: number;
  k: number;
  cd: number;
}

// As Torres Rúnicas (capítulo final, lore/torres.md): o que é só delas.
// - Os lumes ('0'): a luz das nuvens parada no ar, perto delas. Com a Capa de Luz, encostar num lume
//   enche as luzes da capa (e devolve o pulo duplo e o dash do ar); ele apaga e acende de novo pouco
//   depois. Com tudo cheio, o cavaleiro passa por ele e o lume fica.
// - As runas (']'): pedras gravadas da Casa. Um golpe (ou uma flecha, ou a magia) acende a runa por
//   alguns segundos; acesas todas juntas, a marca da sala (RoomDef.runes) entra no progresso, a luz corre
//   delas até a porta que tem essa chave e elas ficam acesas de vez.
// - O mar de nuvens: embaixo das salas abertas (RoomDef.pit), uma faixa de nuvem atrás dos pilares e
//   outra na frente, no pé da sala, onde quem cai some (e volta ao último chão firme).
// - Os frascos de Âmbar que brilham (','): nas estantes do Arquivo. De perto, {up} escuta o eco da
//   pessoa cuja memória está ali (lore.ts, JAR_ECHOES).
// - A máquina da Torre das Engrenagens (RoomDef.gears, buckets, vents), atrás de tudo: o trem de rodas
//   dentadas presas na parede do fundo, cada uma movendo a de baixo, a corrente dos baldes que sobe
//   cheia do poço do fundo e desce vazia, e o vapor dos canos.
export class Torres {
  private lumes: Lume[] = [];
  private runes: Rune[] = [];
  private jars: Jar[] = [];
  // as runas gravadas no batente da porta que o conjunto abre (acendem junto)
  private doorGlyphs: Phaser.GameObjects.Image[] = [];
  private clouds: { sprite: Phaser.GameObjects.TileSprite; vx: number; x0: number }[] = [];
  private gears: { img: Phaser.GameObjects.Image; w: number }[] = [];
  // a corrente: os dois lados (subindo e descendo), as duas rodas, o caminho em volta delas (px) e os baldes
  private chain: {
    up: Phaser.GameObjects.TileSprite;
    down: Phaser.GameObjects.TileSprite;
    wheels: Phaser.GameObjects.Image[];
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    r: number;
    len: number;
    buckets: { img: Phaser.GameObjects.Image; s: number; full: boolean }[];
  } | null = null;
  private vents: { x: number; y: number; dir: 1 | -1; t: number; on: number }[] = [];
  private steam: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private drops: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private time = 0;
  private motes: Phaser.GameObjects.Particles.ParticleEmitter;
  private puffs: Phaser.GameObjects.Particles.ParticleEmitter;
  private moteAcc = 0;

  constructor(private s: GameScene) {
    this.makeTextures();
    // poeira de luz subindo devagar dos lumes acesos
    this.motes = s.add.particles(0, 0, 'px', {
      lifespan: { min: 900, max: 1700 },
      speedY: { min: -34, max: -12 },
      speedX: { min: -10, max: 10 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [GOLD, 0xffe6a6, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(DEPTH.enemy - 0.4);
    // a nuvem que se abre quando alguém cai nela
    this.puffs = s.add.particles(0, 0, 'glow', {
      lifespan: { min: 600, max: 1100 },
      speedX: { min: -60, max: 60 },
      speedY: { min: -90, max: -30 },
      scale: { start: 0.35, end: 0.9 },
      alpha: { start: 0.55, end: 0 },
      tint: [0xfff1d6, 0xf8d3a0],
      emitting: false,
    }).setDepth(DEPTH.water + 0.7);
    let i = 0;
    for (const sp of s.level.spawns) {
      if (sp.kind !== '0') continue;
      const x = sp.x;
      const y = sp.y - TILE / 2;
      // o halo fica parado no lugar (ilumina a sala em volta) e só a bola balança
      const halo = s.add.image(x, y, 'glow').setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD).setScale(1.15).setAlpha(0.5).setDepth(DEPTH.enemy - 0.5);
      const core = s.add.image(x, y, 'lume').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy - 0.3);
      this.lumes.push({ x, y, core, halo, off: 0, k: 1, ph: i++ * 1.7 });
    }
    const set = s.room.runes;
    const open = !!set && progress.seen.has(set);
    let gi = 0;
    for (const sp of s.level.spawns) if (sp.kind === ']') this.addRune(sp.x, sp.y, gi++ % GLYPHS.length, open);
    if (set) {
      const d = s.fixtures.doors.find((d) => d.def.key === set);
      if (d) this.addDoorGlyphs(d.x, d.y, open);
    }
    if (s.room.pit) this.addCloudSea();
    let ji = 0;
    for (const sp of s.level.spawns) if (sp.kind === ',') this.addJar(sp.x, sp.y, ji++);
    this.addMachine();
  }

  // ---------- texturas ----------
  private makeTextures() {
    const T = this.s.textures;
    GLYPHS.forEach((rows, n) => {
      // a pedra: uma laje de pedra escura de topo arredondado, a borda da esquerda pegando luz, o pé de
      // bronze e a runa gravada (sulcos escuros)
      if (!T.exists(`rune-stone-${n}`)) {
        const { canvas, r, commit } = canvasRaster(16, 26);
        r.poly([[1, 4], [4, 1], [12, 1], [15, 4], [15, 23], [1, 23]], 0x2c2f3a);
        r.poly([[1, 4], [4, 1], [6, 1], [3, 4], [3, 23], [1, 23]], 0x454a58);
        r.rect(13, 4, 2, 19, 0x1f2129);
        r.rect(0, 22, 16, 4, 0x6e5530);
        r.rect(0, 22, 16, 1, 0xa88a52);
        rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && r.set(4 + x, 8 + y, 0x14151b)));
        r.outline(0x0c0d12);
        commit();
        T.addCanvas(`rune-stone-${n}`, canvas);
      }
      // a luz da runa: o mesmo desenho em ouro, com uma borda de brilho em volta (somada na tela)
      if (!T.exists(`rune-glyph-${n}`)) {
        const { canvas, r, commit } = canvasRaster(9, 11);
        rows.forEach((row, y) => [...row].forEach((c, x) => {
          if (c !== '#') return;
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) r.set(1 + x + dx, 1 + y + dy, 0x9a5a18, 120);
        }));
        rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && r.set(1 + x, 1 + y, 0xffd27a)));
        commit();
        T.addCanvas(`rune-glyph-${n}`, canvas);
      }
    });
    // o frasco: vidro escuro com rolha, o Âmbar até perto do gargalo e o reflexo do vidro na esquerda
    if (!T.exists('amber-jar')) {
      const { canvas, r, commit } = canvasRaster(10, 15);
      r.rect(3, 0, 4, 2, 0x8a6a40);
      r.rect(3, 0, 4, 1, 0xb08a58);
      r.rect(2, 2, 6, 2, 0x4c5560, 220);
      r.poly([[1, 4], [9, 4], [9, 14], [1, 14]], 0x4c5560, 200);
      r.poly([[1, 7], [9, 7], [9, 14], [1, 14]], 0xc27a22);
      r.rect(2, 8, 6, 5, 0xe39a34);
      r.rect(3, 9, 3, 3, 0xffc24a);
      r.rect(2, 5, 1, 7, 0xd8e4ec, 200);
      r.outline(0x1a1410);
      commit();
      T.addCanvas('amber-jar', canvas);
    }
    // os elos da corrente, de frente e de lado (repete na vertical)
    if (!T.exists('chain-v')) {
      const { canvas, r, commit } = canvasRaster(6, 16);
      for (let y = 0; y < 9; y++) {
        for (let x = 0; x < 6; x++) {
          const d = ((x + 0.5 - 3) / 2.8) ** 2 + ((y + 0.5 - 4.5) / 4.5) ** 2;
          if (d <= 1 && d > 0.38) r.set(x, y, x < 3 ? 0x7a7e88 : 0x4e525c);
        }
      }
      r.rect(2, 8, 2, 9, 0x3e424c);
      r.rect(2, 8, 1, 9, 0x5a5e68);
      commit();
      T.addCanvas('chain-v', canvas);
    }
    // os baldes: madeira com dois aros de ferro e a alça; o cheio leva a água até a borda
    for (const full of [true, false]) {
      const key = full ? 'bucket-full' : 'bucket-empty';
      if (T.exists(key)) continue;
      const { canvas, r, commit } = canvasRaster(14, 15);
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        r.set(7 + Math.cos(a) * 5, 5 - Math.sin(a) * 4.5, 0x3a3e46);
      }
      r.poly([[1, 5], [13, 5], [12, 14], [2, 14]], 0x6b4a2a);
      r.rect(5, 6, 1, 8, 0x4e341c);
      r.rect(9, 6, 1, 8, 0x4e341c);
      r.rect(1, 7, 12, 1, 0x4a4e58);
      r.rect(2, 12, 10, 1, 0x4a4e58);
      if (full) {
        r.rect(2, 5, 10, 2, 0x4f8296);
        r.rect(3, 5, 6, 1, 0x9ccbe0);
      }
      r.outline(0x1a1410);
      commit();
      T.addCanvas(key, canvas);
    }
    // a boca do cano de vapor saindo da parede, com a flange de bronze
    if (!T.exists('steam-pipe')) {
      const { canvas, r, commit } = canvasRaster(12, 10);
      r.rect(0, 2, 9, 6, 0x6e5530);
      r.rect(0, 2, 9, 2, 0xa88a52);
      r.rect(8, 0, 3, 10, 0x8a6a3a);
      r.rect(8, 0, 1, 10, 0xb89a62);
      r.rect(10, 3, 1, 4, 0x1a1410);
      r.outline(0x1a1410);
      commit();
      T.addCanvas('steam-pipe', canvas);
    }
    this.cloudTexture('cloud-sea-front', 512, 128, 7, 22, 0xfff1d6, 0xeeaa62);
    this.cloudTexture('cloud-sea-back', 512, 128, 13, 30, 0xf3d2aa, 0xc2805a);
  }

  // uma faixa de nuvem que repete na horizontal: a borda de cima em bolos (as nuvens grandes, cada uma
  // clara em cima e mais quente embaixo) e, abaixo deles, o miolo cheio, cada vez mais fundo
  private cloudTexture(key: string, W: number, H: number, seed: number, top: number, light: number, deep: number) {
    const T = this.s.textures;
    if (T.exists(key)) return;
    const tex = T.createCanvas(key, W, H);
    if (!tex) return;
    const ctx = tex.getContext();
    const img = ctx.createImageData(W, H);
    const rand = rng(seed);
    const puffs: { x: number; y: number; r: number }[] = [];
    for (let x = 0; x < W; ) {
      const r = 14 + rand() * 24;
      puffs.push({ x, y: top + r * 0.75 + rand() * 12, r });
      x += r * (0.8 + rand() * 0.6);
    }
    const solid = top + 34;
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        let inside = py - solid;
        let shade = Phaser.Math.Clamp((py - solid) / (H - solid), 0, 1) * 0.5 + 0.5;
        for (const p of puffs) {
          for (const dx of [px - p.x, px - p.x - W, px - p.x + W]) {
            if (Math.abs(dx) > p.r) continue;
            const v = p.r - Math.hypot(dx, py - p.y);
            if (v <= inside) continue;
            inside = v;
            // clara no alto e na esquerda do bolo (a luz vem de cima), mais quente embaixo
            shade = Phaser.Math.Clamp((py - (p.y - p.r)) / (p.r * 2.2) + dx / (p.r * 6), 0, 1);
          }
        }
        if (inside <= -1) continue;
        const a = Phaser.Math.Clamp((inside + 1) / 4, 0, 1);
        const depth = Phaser.Math.Clamp(py / H, 0, 1);
        const c = mix(light, deep, Phaser.Math.Clamp(shade * 0.65 + depth * 0.45, 0, 1));
        const i = (py * W + px) * 4;
        img.data[i] = (c >> 16) & 255;
        img.data[i + 1] = (c >> 8) & 255;
        img.data[i + 2] = c & 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  // ---------- os lumes ----------
  private updateLumes(dt: number, p: Player | undefined, puff: boolean) {
    for (const l of this.lumes) {
      if (l.off > 0) {
        l.off -= dt;
        if (l.off <= 0) this.relight(l);
      } else l.k = Math.min(1, l.k + dt * 2.6);
      const bob = Math.sin(this.time * 1.6 + l.ph) * 2.5;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 3.1 + l.ph);
      const cy = l.y + bob;
      l.core.setPosition(l.x, cy).setScale((0.55 + 0.45 * l.k) * (0.92 + pulse * 0.16)).setAlpha(0.22 + 0.78 * l.k).setTint(mix(EMBER, 0xffffff, l.k));
      l.halo.setAlpha(l.k * (0.42 + pulse * 0.14));
      if (l.off > 0) continue;
      if (puff && Math.random() < 0.5) this.motes.emitParticle(1, l.x + (Math.random() - 0.5) * 10, cy + (Math.random() - 0.5) * 8);
      if (!p || p.dead || !p.canFly || !p.spent) continue;
      const b = p.body;
      if (l.x + REACH > b.left && l.x - REACH < b.right && cy + REACH > b.top && cy - REACH < b.bottom) this.take(l);
    }
  }

  // o cavaleiro bebe o lume: as luzes enchem, a bola estoura em ouro e apaga
  private take(l: Lume) {
    const s = this.s;
    s.player.refill();
    l.off = RELIGHT;
    l.k = 0;
    const flash = s.add.image(l.x, l.core.y, 'glow').setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front).setScale(0.6).setAlpha(0.9);
    s.tweens.add({ targets: flash, scale: 2.4, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => flash.destroy() });
    s.gold.explode(14, l.x, l.core.y);
    s.sfx('chime', 0.3, 1.6);
  }

  // volta a acender (o som só perto da tela)
  private relight(l: Lume) {
    const s = this.s;
    s.gold.explode(6, l.x, l.y);
    if (this.onScreen(l.x, l.y)) s.sfx('chime', 0.12, 2.1);
  }

  private onScreen(x: number, y: number) {
    const v = this.s.cameras.main.worldView;
    return x > v.x - 40 && x < v.right + 40 && y > v.y - 40 && y < v.bottom + 40;
  }

  // ---------- as runas ----------
  private addRune(x: number, y: number, n: number, open: boolean) {
    const s = this.s;
    s.add.image(x, y, `rune-stone-${n}`).setOrigin(0.5, 1).setDepth(DEPTH.prop + 0.5);
    // a luz cobre a runa gravada (a pedra tem 26 de altura; a runa começa 8 abaixo do topo)
    const glyph = s.add.image(x - 5, y - 19, `rune-glyph-${n}`).setOrigin(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.prop + 0.6).setAlpha(open ? 1 : 0);
    const halo = s.add.image(x, y - 14, 'glow').setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD).setScale(0.85).setAlpha(0).setDepth(DEPTH.enemy - 0.5);
    this.runes.push({ x, y, rect: new Phaser.Geom.Rectangle(x - 8, y - 26, 16, 26), glyph, halo, t: open ? Infinity : 0, k: open ? 1 : 0, cd: 0 });
  }

  // as runas do batente da porta: cinco gravadas em volta dela (apagadas até o conjunto abrir)
  private addDoorGlyphs(x: number, y: number, open: boolean) {
    const s = this.s;
    const spots: [number, number][] = [[-21, -50], [-21, -26], [13, -50], [13, -26], [-4, -70]];
    spots.forEach(([dx, dy], i) => {
      const n = (i + 1) % GLYPHS.length;
      s.add.image(x + dx, y + dy, `rune-stone-${n}`).setOrigin(0).setCrop(3, 7, 9, 11).setDepth(DEPTH.prop + 0.4).setAlpha(0.9);
      const g = s.add.image(x + dx + 3, y + dy + 7, `rune-glyph-${n}`).setOrigin(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.prop + 0.6).setAlpha(open ? 0.9 : 0);
      this.doorGlyphs.push(g);
    });
  }

  private updateRunes(dt: number) {
    for (const r of this.runes) {
      r.cd -= dt;
      if (r.t !== Infinity && r.t > 0) {
        r.t -= dt;
        if (r.t <= 0) this.fade(r);
      }
      // o brilho: cheio enquanto há tempo, apagando nos últimos segundos e piscando no fim
      let goal = r.t === Infinity ? 1 : r.t > 0 ? Math.min(1, r.t / RUNE_WARN) : 0;
      if (r.t !== Infinity && r.t > 0 && r.t < RUNE_BLINK) goal *= 0.55 + 0.45 * Math.sin(r.t * 38);
      r.k += (goal - r.k) * Math.min(1, dt * 14);
      const pulse = r.t === Infinity ? 0.85 + 0.15 * Math.sin(this.time * 2 + r.x) : 1;
      r.glyph.setAlpha(r.k * pulse);
      r.halo.setAlpha(r.k * 0.5 * pulse);
    }
  }

  // o golpe acende a runa (de novo, enche o tempo dela); acesas todas juntas, o conjunto abre
  strike(box: Phaser.Geom.Rectangle, p: Player) {
    let hit = false;
    for (const r of this.runes) {
      if (p.hitSet.has(r) || !overlap(box, r.rect)) continue;
      p.hitSet.add(r);
      this.light(r);
      hit = true;
    }
    return hit;
  }

  // a magia e as flechas também acendem (a magia que fica tocando acende uma vez a cada instante)
  magicHit(box: Phaser.Geom.Rectangle) {
    let hit = false;
    for (const r of this.runes) {
      if (!overlap(box, r.rect)) continue;
      hit = true;
      if (r.cd > 0) continue;
      r.cd = 0.4;
      this.light(r);
    }
    return hit;
  }

  private light(r: Rune) {
    const s = this.s;
    if (r.t === Infinity) {
      s.sfx('tink', 0.5, 1.3);
      return;
    }
    const fresh = r.t <= 0;
    r.t = RUNE_T;
    const lit = this.runes.filter((q) => q.t > 0).length;
    // cada runa acesa soa um pouco mais alto que a anterior
    s.sfx('chime', fresh ? 0.5 : 0.25, 0.9 + lit * 0.14);
    s.sfx('tink', 0.6, 0.8);
    s.gold.explode(fresh ? 10 : 4, r.x, r.y - 14);
    const flash = s.add.image(r.x, r.y - 14, 'glow').setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front).setScale(0.4).setAlpha(0.85);
    s.tweens.add({ targets: flash, scale: 1.6, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => flash.destroy() });
    if (this.runes.every((q) => q.t > 0)) this.open();
    else if (fresh) s.thinkOnce('runa:acesa', 'A runa acendeu com o golpe. E já começa a apagar.');
  }

  // apagou antes das outras
  private fade(r: Rune) {
    const s = this.s;
    r.t = 0;
    if (this.onScreen(r.x, r.y)) s.sfx('ash', 0.35, 1.2);
    s.dustBurst(r.x, r.y - 10, 3);
    if (this.runes.some((q) => q.t > 0) || this.runes.length > 1) s.thinkOnce('runa:apagou', 'Apagou antes das outras. Elas têm que estar acesas juntas.');
  }

  // as runas acesas juntas: a marca entra no progresso, a luz corre de cada uma até a porta e as do
  // batente acendem
  private open() {
    const s = this.s;
    const key = s.room.runes;
    if (!key) return;
    progress.seen.add(key);
    progress.save();
    for (const r of this.runes) r.t = Infinity;
    s.sfx('bell', 0.7, 1.15);
    const d = s.fixtures.doors.find((d) => d.def.key === key);
    if (!d) return;
    const to = { x: d.x, y: d.y - 40 };
    this.runes.forEach((r, i) => {
      const spark = s.add.image(r.x, r.y - 14, 'glow').setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front).setScale(0.5).setAlpha(0.95);
      s.tweens.add({
        targets: spark,
        x: to.x,
        y: to.y,
        delay: 300 + i * 160,
        duration: 1100,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          if (Math.random() < 0.5) s.gold.explode(1, spark.x, spark.y);
        },
        onComplete: () => spark.destroy(),
      });
    });
    const done = 300 + (this.runes.length - 1) * 160 + 1100;
    s.time.delayedCall(done, () => {
      s.glowBurst(to.x, to.y, GOLD, 4);
      s.sfx('door', 0.8, 0.9);
      s.cameras.main.shake(160, 0.003);
      for (const g of this.doorGlyphs) s.tweens.add({ targets: g, alpha: 0.9, duration: 500 });
      ui.thought('As runas acesas juntas. No batente da porta do terraço, as runas acenderam também.', 4400);
    });
  }

  // uma roda dentada de bronze com n dentes: os dentes em volta, o aro, seis raios vazados entre eles e o
  // cubo com o furo do eixo; a luz vem do alto e da esquerda. O dente ocupa a fase 0.08..0.60 do passo no
  // pé e 0.15..0.53 na ponta (o centro em TOOTH_C), menos da metade: o de uma roda cabe no vão da outra
  private gearTexture(key: string, n: number) {
    const T = this.s.textures;
    if (T.exists(key)) return;
    const rad = pitch(n) - 2.5;
    const R = Math.ceil(rad + 6);
    const teeth = n;
    const { canvas, r, commit } = canvasRaster(R * 2, R * 2);
    const shade = (c: number, k: number) => (k >= 0 ? mix(c, 0xffe0a8, k) : mix(c, 0x000000, -k));
    for (let y = 0; y < R * 2; y++) {
      for (let x = 0; x < R * 2; x++) {
        const dx = x + 0.5 - R;
        const dy = y + 0.5 - R;
        const d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        const ph = ((((a / (Math.PI * 2)) * teeth) % 1) + 1) % 1;
        // o dente: trapézio (mais largo no pé)
        const tip = ph > 0.15 && ph < 0.53 ? rad + 5 : ph > 0.08 && ph < 0.6 ? rad + 2 : rad;
        if (d > tip) continue;
        const lit = d > 0 ? -(dx + dy) / (d * 1.414) : 0;
        let c: number;
        if (d > rad - 7) c = d > rad - 1 ? 0x9a7a48 : 0x8a6a3a;
        else if (d > rad - 8.5) c = 0x4a3820;
        else if (d < 11) c = d < 4.5 ? 0x15110c : d < 6 ? 0x3a2c1a : 0x9a7a48;
        else {
          const sa = ((((a / (Math.PI * 2)) * 6) % 1) + 1) % 1;
          const off = Math.min(sa, 1 - sa) * ((Math.PI * 2) / 6) * d;
          if (off > 4) continue;
          c = off > 2.6 ? 0x5a4428 : 0x7a5c32;
        }
        r.set(x, y, shade(c, lit * 0.22));
      }
    }
    r.outline(0x1e160e);
    commit();
    T.addCanvas(key, canvas);
  }

  // ---------- a máquina das engrenagens ----------
  private addMachine() {
    const s = this.s;
    const room = s.room;
    const back = DEPTH.rail - 0.6;
    const gt = room.gears;
    if (gt) {
      const x = gt.x * TILE;
      let y = gt.y * TILE;
      let rot = Math.random() * Math.PI * 2;
      let dir = 1;
      gt.teeth.forEach((n, i) => {
        if (i) {
          // a de baixo encosta na de cima (as duas circunferências primitivas se tocam), gira ao contrário e
          // começa com um vão onde a de cima tem um dente
          const m = gt.teeth[i - 1];
          y += pitch(m) + pitch(n);
          const above = frac(((Math.PI / 2 - rot) * m) / (Math.PI * 2));
          rot = -Math.PI / 2 - ((Math.PI * 2) / n) * (TOOTH_C + GAP_C - above);
          dir = -dir;
        }
        this.gearTexture(`gear-${n}`, n);
        const img = s.add.image(x, y, `gear-${n}`).setDepth(back).setRotation(rot);
        // todas passam o mesmo número de dentes por segundo: as grandes giram mais devagar e nenhuma escapa
        this.gears.push({ img, w: (dir * GEAR_RATE * Math.PI * 2) / n });
      });
    }
    const b = room.buckets;
    if (b) {
      const x0 = b.x0 * TILE + TILE / 2;
      const x1 = b.x1 * TILE + TILE / 2;
      const y0 = b.y0 * TILE;
      const y1 = b.y1 * TILE;
      const rad = (x1 - x0) / 2;
      const n = Math.round((Math.PI * 2 * (rad + 2.5)) / TOOTH);
      this.gearTexture(`gear-${n}`, n);
      const wheels = [y0, y1].map((y) => s.add.image((x0 + x1) / 2, y, `gear-${n}`).setDepth(back + 0.1));
      const up = s.add.tileSprite(x1, y0, 6, y1 - y0, 'chain-v').setOrigin(0.5, 0).setDepth(back + 0.2);
      const down = s.add.tileSprite(x0, y0, 6, y1 - y0, 'chain-v').setOrigin(0.5, 0).setDepth(back + 0.2);
      const len = 2 * (y1 - y0) + 2 * Math.PI * rad;
      const buckets = [];
      for (let p = 0; p < len; p += BUCKET_GAP) buckets.push({ img: s.add.image(0, 0, 'bucket-full').setOrigin(0.5, 0.1).setDepth(back + 0.3), s: p, full: true });
      this.chain = { up, down, wheels, x0, x1, y0, y1, r: rad, len, buckets };
      this.drops = s.add.particles(0, 0, 'px', {
        lifespan: { min: 500, max: 900 },
        speedY: { min: 20, max: 60 },
        gravityY: 700,
        scale: { start: 1, end: 0.6 },
        alpha: { start: 0.8, end: 0 },
        tint: [0xbfe3f0, 0x7fb8cc],
        emitting: false,
      }).setDepth(back + 0.35);
    }
    if (room.vents?.length) {
      for (const v of room.vents) {
        const x = v.dir > 0 ? v.x * TILE : (v.x + 1) * TILE;
        const y = v.y * TILE + TILE / 2;
        s.add.image(x, y, 'steam-pipe').setOrigin(0, 0.5).setFlipX(v.dir < 0).setX(v.dir > 0 ? x : x - 12).setDepth(DEPTH.prop + 0.5);
        this.vents.push({ x: x + v.dir * 12, y, dir: v.dir, t: Math.random() * 3, on: 0 });
      }
      this.steam = s.add.particles(0, 0, 'glow', {
        lifespan: { min: 900, max: 1600 },
        speedY: { min: -40, max: -10 },
        scale: { start: 0.18, end: 0.9 },
        alpha: { start: 0.3, end: 0 },
        tint: [0xf0ece4, 0xd8d4cc],
        emitting: false,
      }).setDepth(DEPTH.front + 0.4);
    }
  }

  // a posição de um balde no caminho da corrente: sobe cheio pela direita, vira na roda de cima, desce
  // vazio pela esquerda e enche ao passar pela roda de baixo (dentro do poço)
  private bucketAt(p: number) {
    const c = this.chain!;
    const h = c.y1 - c.y0;
    const arc = Math.PI * c.r;
    const cx = (c.x0 + c.x1) / 2;
    if (p < h) return { x: c.x1, y: c.y1 - p, full: true };
    p -= h;
    if (p < arc) {
      const a = p / c.r;
      return { x: cx + Math.cos(a) * c.r, y: c.y0 - Math.sin(a) * c.r, full: a < Math.PI / 2 };
    }
    p -= arc;
    if (p < h) return { x: c.x0, y: c.y0 + p, full: false };
    p -= h;
    const a = Math.PI + p / c.r;
    return { x: cx + Math.cos(a) * c.r, y: c.y1 - Math.sin(a) * c.r, full: a > Math.PI * 1.5 };
  }

  private updateMachine(dt: number) {
    for (const g of this.gears) g.img.rotation += g.w * dt;
    const c = this.chain;
    if (c) {
      c.up.tilePositionY += CHAIN_V * dt;
      c.down.tilePositionY -= CHAIN_V * dt;
      for (const w of c.wheels) w.rotation -= (CHAIN_V / c.r) * dt;
      const v = this.s.cameras.main.worldView;
      for (const bk of c.buckets) {
        bk.s = (bk.s + CHAIN_V * dt) % c.len;
        const at = this.bucketAt(bk.s);
        bk.img.setPosition(at.x, at.y);
        if (at.full !== bk.full) {
          bk.full = at.full;
          bk.img.setTexture(at.full ? 'bucket-full' : 'bucket-empty');
          // no alto ele vira e despeja a água na calha do núcleo
          if (!at.full && this.drops && at.y < v.bottom && at.y > v.y - 20) this.drops.explode(8, at.x, at.y + 4);
        }
        if (bk.full && this.drops && Math.random() < dt * 0.8 && at.y > v.y && at.y < v.bottom) this.drops.emitParticle(1, at.x + (Math.random() - 0.5) * 8, at.y + 12);
      }
    }
    if (this.steam) {
      const v = this.s.cameras.main.worldView;
      for (const vt of this.vents) {
        // de tempos em tempos o cano solta um jato; no meio, só um fio
        vt.t -= dt;
        if (vt.t <= 0) {
          vt.t = 2.6 + Math.random() * 2.4;
          vt.on = 1.1;
          if (this.onScreen(vt.x, vt.y)) this.s.sfx('smoke', 0.25, 1.4);
        }
        vt.on -= dt;
        if (vt.y < v.y - 60 || vt.y > v.bottom + 60) continue;
        const rate = vt.on > 0 ? 26 : 2.5;
        if (Math.random() < dt * rate) {
          this.steam.setParticleSpeed(vt.dir * (vt.on > 0 ? 90 + Math.random() * 70 : 20 + Math.random() * 20), -10 - Math.random() * 30);
          this.steam.emitParticle(1, vt.x, vt.y + (Math.random() - 0.5) * 4);
        }
      }
    }
  }

  // ---------- os frascos ----------
  private addJar(x: number, y: number, i: number) {
    const s = this.s;
    s.add.image(x, y, 'amber-jar').setOrigin(0.5, 1).setDepth(DEPTH.prop + 0.5);
    // a luz de dentro do Âmbar (somada) e o halo em volta, que ilumina a estante
    const light = s.add.image(x, y - 5, 'glow').setTint(0xffa63c).setBlendMode(Phaser.BlendModes.ADD).setScale(0.22).setAlpha(0.7).setDepth(DEPTH.prop + 0.6);
    const halo = s.add.image(x, y - 6, 'glow').setTint(0xffa63c).setBlendMode(Phaser.BlendModes.ADD).setScale(0.75).setAlpha(0.32).setDepth(DEPTH.enemy - 0.5);
    this.jars.push({ x, y, i, light, halo, flare: 0, ph: i * 2.3 });
  }

  private updateJars(dt: number) {
    for (const j of this.jars) {
      j.flare = Math.max(0, j.flare - dt * 0.5);
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 1.3 + j.ph);
      j.light.setAlpha(0.55 + pulse * 0.2 + j.flare * 0.3).setScale(0.22 + j.flare * 0.12);
      j.halo.setAlpha(0.26 + pulse * 0.08 + j.flare * 0.4).setScale(0.75 + j.flare * 0.5);
      if (j.flare > 0.2 && Math.random() < dt * 14) this.s.gold.explode(1, j.x + (Math.random() - 0.5) * 8, j.y - 8);
    }
  }

  // de pé perto de um frasco: {up} escuta o eco
  nearby(p: Player): { hint: string; act: () => void } | null {
    if (!p.onGround) return null;
    for (const j of this.jars) {
      if (Math.abs(p.x - j.x) > 18 || Math.abs(p.body.bottom - j.y) > 10) continue;
      return { hint: '{up} escutar o frasco', act: () => this.listen(j) };
    }
    return null;
  }

  private listen(j: Jar) {
    const s = this.s;
    const line = JAR_ECHOES[s.room.id]?.[j.i];
    if (!line) return;
    j.flare = 1;
    s.sfx('echo', 0.5, 0.9);
    s.sfx('chime', 0.18, 0.7);
    ui.say('Uma voz no frasco', line, 5600);
    progress.seen.add(`jar:${s.room.id}:${j.i}`);
    s.time.delayedCall(6000, () => s.thinkOnce('arquivo:frascos', 'Cada frasco é a memória de alguém. A Casa não guardava papéis aqui. Guardava as pessoas.'));
  }

  // ---------- o mar de nuvens ----------
  // embaixo das salas abertas: nos trechos onde a última linha da sala é vazio (menos os buracos que são
  // saída para baixo), uma faixa atrás dos pilares e outra na frente, cobrindo o pé deles
  private addCloudSea() {
    const s = this.s;
    const L = s.level;
    const rows = L.grid;
    const H = rows.length;
    const W = rows[0].length;
    const downs = s.room.exits.filter((e) => e.side === 'down');
    const open = (x: number) => {
      const c = rows[H - 1][x];
      if (c === '#' || c === '+') return false;
      return !downs.some((e) => !e.range || (x >= e.range[0] && x <= e.range[1]));
    };
    // os trechos abertos, juntando os pilares que ficam no meio deles (até o da torre da comporta)
    const segs: [number, number][] = [];
    for (let x = 0; x < W; x++) {
      if (!open(x)) continue;
      const last = segs[segs.length - 1];
      if (last && x - last[1] <= 12) last[1] = x;
      else segs.push([x, x]);
    }
    const hpx = H * TILE;
    for (const [x0, x1] of segs) {
      const px0 = Math.max(0, x0 - 2) * TILE;
      const px1 = Math.min(W, x1 + 3) * TILE;
      const back = s.add.tileSprite(px0, hpx - 176, px1 - px0, 128, 'cloud-sea-back').setOrigin(0).setDepth(BG.beams + 0.5).setAlpha(0.95);
      const front = s.add.tileSprite(px0, hpx - 104, px1 - px0, 128, 'cloud-sea-front').setOrigin(0).setDepth(DEPTH.water + 0.6);
      this.clouds.push({ sprite: back, vx: 4, x0: px0 }, { sprite: front, vx: 9, x0: px0 });
    }
  }

  // alguém caiu nas nuvens (a cena chama antes de devolver ao chão firme)
  fallInto(x: number) {
    if (!this.clouds.length) return;
    const y = this.s.level.heightPx - 40;
    this.puffs.explode(10, x, y);
    this.s.sfx('gust', 0.35, 1.3);
  }

  update(dt: number) {
    this.time += dt;
    const p = this.s.player;
    this.moteAcc += dt;
    const puff = this.moteAcc > 0.12;
    if (puff) this.moteAcc = 0;
    this.updateLumes(dt, p, puff);
    this.updateRunes(dt);
    this.updateJars(dt);
    this.updateMachine(dt);
    // as nuvens andam devagar (a de trás mais devagar), na posição certa de cada trecho
    for (const c of this.clouds) c.sprite.tilePositionX = c.x0 + this.time * c.vx;
  }
}

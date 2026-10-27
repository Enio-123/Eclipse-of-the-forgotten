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
import { isSolid } from './Level';
import { canvasRaster, mix, rng } from '../gfx/raster';
import { PLANK_H } from '../gfx/textures';

// o bronze das luvas dos cabos da Sala das Experiências
const BRZ_MID = 0x7a5a2e;
const BRZ_HI = 0xe4bd72;
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

// uma cadeira da Sala das Experiências: onde fica, para que lado está virada, a coroa e a luz dela, se quem
// estava sentado já levantou e há quanto tempo (a coroa balança no braço até parar)
interface Chair {
  x: number;
  y: number;
  facing: 1 | -1;
  crown: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  free: boolean;
  dim: number;
  ph: number;
  swing: number;
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

// O salão do trono (o Senhor de Vhalor): o que fica na sala com ou sem ele. O chão do salão e o do estrado
// (y), a frente do estrado e a parede do encosto alto (x), a calha de bronze embaixo do teto (os cabos de
// Âmbar correm dentro dela; a luz deles é a faixa somada em cima da fenda), os dois bocais no encosto de
// onde saem os cabos dos ombros dele, a grade no pé do estrado (por onde sai o cabo do chão), as runas
// embutidas no chão, da esquerda para a direita (cada uma com a luz dela, apagada até ele acender, e a altura
// da coluna de luz quando explode: embaixo do lustre ela para nas lâmpadas) e o lustre (px)
export interface ThroneHall {
  floorY: number;
  daisY: number;
  daisX: number;
  wallX: number;
  ceilY: number;
  rail: { x0: number; x1: number; y: number };
  railGlow: Phaser.GameObjects.TileSprite;
  anchors: { x: number; y: number }[];
  grate: { x: number; y: number };
  runes: { x: number; y: number; h: number; glow: Phaser.GameObjects.Image; line: Phaser.GameObjects.Image }[];
  lustre: { x0: number; x1: number; y: number; bottom: number } | null;
}

// um degrau dobrável do encosto do Trono: a chapa de ferro na dobradiça rente à pedra, pendurada enquanto o
// Senhor de Vhalor vive e de pé depois, deitada na mão-francesa chumbada embaixo da dobradiça (o eixo da
// dobradiça entra no encosto: quem gira é a mesma máquina que abre o alçapão)
interface FoldStep {
  x0: number;
  x1: number;
  y: number;
  w: number;
  hinge: { x: number; y: number };
  plate: Phaser.GameObjects.Image;
  up: boolean;
}

const LUSTRE_H = 18;

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
// - O salão do trono (ThroneHall): a calha dos cabos no teto, os bocais do encosto, a grade do estrado e
//   as runas do chão (quem acende tudo é o Senhor de Vhalor; vencido, fica tudo apagado e os cabos dos
//   ombros caídos por cima do encosto do trono vazio).
export class Torres {
  throne: ThroneHall | null = null;
  private steps: FoldStep[] = [];
  private lumes: Lume[] = [];
  private runes: Rune[] = [];
  private jars: Jar[] = [];
  private chairs: Chair[] = [];
  // o tanque do fim da fila: onde fica, a luz do Âmbar dele (e o clarão de quando uma luz volta) e as bolhas
  private tank: { x: number; y: number; glow: Phaser.GameObjects.Image; flare: number; bub: number } | null = null;
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
    this.addExperiment();
    this.addMachine();
    if (s.room.boss === 'vhalor') this.addThrone();
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
    this.makeExperimentTextures();
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

  // para onde volta a luz de um Arquivado vencido: o frasco mais perto à vista (até max px, sem pedra no
  // meio) ou, nas Experiências, o tanque. flare acende ele quando a luz chega
  lightHome(x: number, y: number, max = 420) {
    const L = this.s.level;
    const clear = (tx: number, ty: number) => {
      const dx = tx - x;
      const dy = ty - y;
      const n = Math.ceil(Math.hypot(dx, dy) / 6);
      for (let i = 1; i < n; i++) if (isSolid(L.tileAt(x + (dx * i) / n, y + (dy * i) / n))) return false;
      return true;
    };
    const j = this.jars
      .map((q) => ({ q, d: Math.hypot(q.x - x, q.y - 6 - y) }))
      .filter((o) => o.d < max)
      .sort((a, b) => a.d - b.d)
      .find((o) => clear(o.q.x, o.q.y - 6))?.q;
    if (j) {
      return { x: j.x, y: j.y - 6, flare: () => {
        j.flare = 1;
        this.s.sfx('glass', 0.25, 1.6);
      } };
    }
    const t = this.tank;
    if (t && Math.abs(t.x - x) < max * 1.5 && clear(t.x, t.y - 30)) {
      return { x: t.x, y: t.y - 30, flare: () => {
        t.flare = 1;
        this.s.sfx('glass', 0.3, 1.2);
        this.s.sfx('gurgle', 0.25, 1.3);
      } };
    }
    return null;
  }

  // ---------- a Sala das Experiências ----------
  // O encosto alto de madeira escura com os aros de bronze, o assento, as pernas e a travessa, o braço com a
  // correia de couro e, saindo do alto do encosto, o braço de bronze que vem por cima e segura a coroa em cima
  // da cabeça de quem está sentado (desenhada virada para a direita; os pés de quem senta ficam na coluna 19)
  private makeExperimentTextures() {
    const T = this.s.textures;
    const WOOD = [0x1c130c, 0x34241a, 0x4e3826, 0x6e5034];
    const BRZ = [0x4a3015, 0x7a5a2e, 0xb98a3e, 0xe4bd72];
    if (!T.exists('exp-chair')) {
      const { canvas, r, commit } = canvasRaster(24, 46);
      const X = (rx: number) => rx + 19;
      const Y = (ry: number) => ry + 46;
      const px = (rx: number, ry: number, c: number) => r.set(X(rx), Y(ry), c);
      const run = (x0: number, x1: number, y0: number, y1: number, c: number) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, c);
      };
      // as pernas (a de trás e a da frente), com o pé de bronze, e a travessa
      run(-16, -15, -7, -1, WOOD[2]);
      px(-16, -4, WOOD[3]);
      run(0, 1, -7, -1, WOOD[1]);
      run(-16, -15, -1, -1, BRZ[1]);
      run(0, 1, -1, -1, BRZ[1]);
      run(-14, -1, -4, -4, WOOD[0]);
      // o assento: a borda de cima pegando luz, a de baixo na sombra
      run(-17, 2, -9, -9, WOOD[3]);
      run(-17, 2, -8, -8, WOOD[2]);
      run(-16, 1, -7, -7, WOOD[0]);
      // o encosto alto: três tons, os dois aros de bronze e o pomo em cima
      run(-18, -18, -31, -10, WOOD[3]);
      run(-17, -17, -31, -10, WOOD[2]);
      run(-16, -16, -31, -10, WOOD[1]);
      for (const y of [-28, -14]) {
        run(-18, -16, y, y, BRZ[2]);
        px(-18, y, BRZ[3]);
      }
      run(-18, -16, -32, -32, BRZ[1]);
      px(-17, -33, BRZ[2]);
      // a tomada do cabo, nas costas do encosto
      run(-19, -19, -23, -21, BRZ[1]);
      px(-19, -22, BRZ[3]);
      // o braço da cadeira, o pé dele e a correia de couro com a fivela
      run(-15, -3, -17, -17, WOOD[3]);
      run(-15, -3, -16, -16, WOOD[1]);
      run(-4, -4, -15, -10, WOOD[1]);
      px(-3, -17, BRZ[2]);
      px(-3, -16, BRZ[1]);
      run(-9, -8, -18, -15, 0x2a1a14);
      px(-8, -17, BRZ[2]);
      // o braço de bronze da coroa: sobe do pomo, faz a curva por cima e desce até o alto da coroa
      run(-17, -17, -39, -34, BRZ[1]);
      run(-18, -16, -36, -36, BRZ[2]);
      const arm: [number, number][] = [[-16, -40], [-15, -41], [-14, -42], [-13, -42], [-12, -43], [-11, -43], [-10, -43], [-9, -43], [-8, -43],
        [-7, -43], [-6, -43], [-5, -43], [-4, -42], [-3, -42], [-2, -42], [-1, -41], [0, -40]];
      for (const [x, y] of arm) {
        px(x, y, BRZ[1]);
        if (y <= -42) px(x, y - 1, BRZ[3]);
      }
      run(0, 0, -39, -35, BRZ[1]);
      px(-1, -36, BRZ[2]);
      px(1, -36, BRZ[0]);
      r.outline(0x120c08);
      commit();
      T.addCanvas('exp-chair', canvas);
    }
    // a coroa: o aro de bronze com três pontas, o encaixe do braço no alto e as pedras de Âmbar (o meio do aro
    // na linha 5, coluna 6)
    if (!T.exists('exp-crown')) {
      const { canvas, r, commit } = canvasRaster(12, 8);
      r.rect(1, 4, 10, 1, BRZ[3]);
      r.rect(1, 5, 10, 1, BRZ[1]);
      r.set(1, 4, BRZ[1]);
      r.set(10, 5, BRZ[0]);
      for (const x of [2, 9]) r.rect(x, 2, 1, 2, BRZ[2]);
      r.rect(5, 1, 2, 3, BRZ[2]);
      r.rect(5, 0, 2, 1, BRZ[1]);
      r.set(2, 2, 0xffa63c);
      r.set(9, 2, 0xffa63c);
      r.rect(5, 2, 2, 1, 0xffd27a);
      r.set(3, 5, 0xc27a22);
      r.set(8, 5, 0xc27a22);
      r.outline(0x1a1109);
      commit();
      T.addCanvas('exp-crown', canvas);
    }
    // o tanque: o pé de bronze, o vidro com o Âmbar quase cheio (mais claro no meio, com os fios escuros das
    // memórias misturadas boiando), os aros, a tampa em cúpula, o cano em cima e as tomadas dos cabos embaixo
    if (!T.exists('exp-tank')) {
      const { canvas, r, commit } = canvasRaster(34, 64);
      r.rect(1, 56, 32, 1, BRZ[3]);
      r.rect(1, 57, 32, 4, BRZ[1]);
      r.rect(1, 61, 32, 1, BRZ[0]);
      r.rect(2, 62, 4, 2, BRZ[0]);
      r.rect(28, 62, 4, 2, BRZ[0]);
      for (const y of [57, 59]) r.rect(0, y, 2, 1, BRZ[2]);
      r.rect(4, 12, 26, 44, 0x161d24, 230);
      for (let y = 20; y < 56; y++) {
        const k = (y - 20) / 36;
        r.rect(6, y, 22, 1, mix(0xe39a34, 0x8a4210, k));
        r.rect(11, y, 12, 1, mix(0xffbe54, 0xb0581a, k));
      }
      r.rect(6, 20, 22, 1, 0xffd27a);
      for (const [x, y] of [[13, 30], [14, 31], [15, 31], [16, 32], [19, 40], [20, 41], [20, 42], [19, 43], [10, 46], [11, 47], [12, 47], [22, 50], [23, 49]] as [number, number][]) r.set(x, y, 0x7a3410);
      r.rect(4, 12, 2, 44, 0x2e3a46);
      r.rect(28, 12, 2, 44, 0x24303a);
      r.rect(7, 14, 1, 40, 0xd8e4ec, 120);
      r.rect(8, 16, 1, 14, 0xd8e4ec, 70);
      for (const y of [22, 40]) {
        r.rect(3, y, 28, 1, BRZ[2]);
        r.rect(3, y + 1, 28, 1, BRZ[1]);
      }
      r.rect(2, 6, 30, 1, BRZ[3]);
      r.rect(2, 7, 30, 3, BRZ[1]);
      r.rect(2, 10, 30, 2, BRZ[0]);
      r.rect(8, 3, 18, 3, BRZ[1]);
      r.rect(9, 3, 16, 1, BRZ[2]);
      r.rect(14, 0, 6, 3, BRZ[1]);
      r.rect(15, 0, 1, 3, BRZ[3]);
      r.outline(0x0f0c0a);
      commit();
      T.addCanvas('exp-tank', canvas);
    }
    // o cano de bronze que sobe do tanque até o teto (repete na vertical), com uma junta a cada 16 px
    if (!T.exists('exp-pipe')) {
      const { canvas, r, commit } = canvasRaster(8, 16);
      r.rect(1, 0, 6, 16, BRZ[1]);
      r.rect(2, 0, 1, 16, BRZ[3]);
      r.rect(5, 0, 1, 16, BRZ[0]);
      r.rect(0, 0, 8, 2, BRZ[2]);
      r.rect(0, 1, 8, 1, BRZ[0]);
      commit();
      T.addCanvas('exp-pipe', canvas);
    }
  }

  // as cadeiras em fila, a coroa de cada uma (na frente de quem senta) e os cabos que saem das costas e correm
  // pelo chão até o tanque
  private addExperiment() {
    const s = this.s;
    const st = s.room.seated;
    if (!st) return;
    const seats = s.level.spawns.filter((sp) => sp.kind === 'u');
    if (!seats.length) return;
    const floor = seats[0].y;
    const tx = st.tank * TILE + TILE / 2;
    // o tanque e o cano até o teto
    s.add.image(tx, floor, 'exp-tank').setOrigin(0.5, 1).setDepth(DEPTH.prop + 0.6);
    const L = s.level;
    let top = floor - 64;
    while (top > 0 && !isSolid(L.tileAt(tx, top - 1))) top -= 1;
    if (floor - 64 - top > 4) s.add.tileSprite(tx, top, 8, floor - 64 - top, 'exp-pipe').setOrigin(0.5, 0).setDepth(DEPTH.prop + 0.55);
    const glow = s.add.image(tx, floor - 30, 'glow').setTint(0xffa63c).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setAlpha(0.4).setDepth(DEPTH.enemy - 0.5);
    this.tank = { x: tx, y: floor, glow, flare: 0, bub: 0 };
    // os cabos: das costas de cada cadeira, descendo em curva até o chão e correndo até as tomadas do tanque
    const f = st.facing;
    const plugs = seats.map((sp) => ({ x: sp.x - f * 19, y: sp.y - 22 }));
    const x0 = Math.floor(Math.min(tx - 18, ...plugs.map((q) => q.x)) - 4);
    const x1 = Math.ceil(Math.max(tx + 18, ...plugs.map((q) => q.x)) + 4);
    const y0 = floor - 26;
    const { canvas, r, commit } = canvasRaster(x1 - x0, floor - y0);
    const side = Math.sign(tx - plugs[0].x) || 1;
    plugs.forEach((q, i) => {
      const fy = floor - 2 - i;
      const end = { x: tx - side * 16, y: floor - 7 + (i % 4) };
      const drop = { x: q.x + side * 9, y: fy };
      const pts: [number, number][] = [];
      // a curva da tomada até o chão, o trecho no chão e a subida até a tomada do tanque
      for (let k = 0; k <= 1; k += 0.02) {
        const a = (1 - k) * (1 - k);
        const b = 2 * (1 - k) * k;
        const c = k * k;
        pts.push([a * q.x + b * (q.x + side * 4) + c * drop.x, a * q.y + b * fy + c * drop.y]);
      }
      for (let x = drop.x; side > 0 ? x < end.x - 6 : x > end.x + 6; x += side) pts.push([x, fy]);
      for (let k = 0; k <= 1; k += 0.1) pts.push([end.x - side * 6 * (1 - k), fy + (end.y - fy) * k * k]);
      for (const [x, y] of pts) {
        const ix = Math.round(x - x0);
        const iy = Math.round(y - y0);
        r.set(ix, iy - 1, 0x3a2c24);
        r.set(ix, iy, 0x1c1512);
        r.set(ix, iy + 1, 0x120d0b);
      }
      // as luvas de bronze do cabo, de tanto em tanto
      for (let x = drop.x + side * 14; side > 0 ? x < end.x - 10 : x > end.x + 10; x += side * 26) {
        const ix = Math.round(x - x0);
        const iy = Math.round(fy - y0);
        r.rect(ix, iy - 2, 2, 4, BRZ_MID);
        r.set(ix, iy - 2, BRZ_HI);
      }
    });
    commit();
    const key = `exp-cables-${s.room.id}`;
    if (s.textures.exists(key)) s.textures.remove(key);
    s.textures.addCanvas(key, canvas);
    s.add.image(x0, y0, key).setOrigin(0, 0).setDepth(DEPTH.prop + 0.4);
    // as cadeiras e as coroas: a coroa vai na frente da cabeça de quem senta, inclinada com ela, presa pelo
    // encaixe do alto na ponta da haste do braço (é em volta desse encaixe que ela gira)
    seats.forEach((sp, i) => {
      s.add.image(sp.x, sp.y, 'exp-chair').setOrigin((f > 0 ? 19 : 5) / 24, 1).setFlipX(f < 0).setDepth(DEPTH.prop + 0.5);
      const crown = s.add.image(sp.x + f * 0.76, sp.y - 35.75, 'exp-crown').setOrigin(6 / 12, 0.5 / 8).setFlipX(f < 0).setRotation(f * 0.45).setDepth(DEPTH.enemy + 0.3);
      const cg = s.add.image(sp.x + f * 0.2, sp.y - 33.6, 'glow').setTint(0xffa63c).setBlendMode(Phaser.BlendModes.ADD).setScale(0.24).setAlpha(0.5).setDepth(DEPTH.enemy + 0.25);
      this.chairs.push({ x: sp.x, y: sp.y, facing: f, crown, glow: cg, free: false, dim: 0, ph: i * 1.7, swing: 0 });
    });
  }

  // a cadeira embaixo de quem nasce em (x, pés y), se houver: o número dela e para que lado ela está virada
  chairAt(x: number, y: number) {
    const i = this.chairs.findIndex((c) => Math.abs(c.x - x) < 2 && Math.abs(c.y - y) < 2);
    return i < 0 ? null : { i, facing: this.chairs[i].facing };
  }

  // quem estava sentado levantou: a cabeça sai da coroa (que passa para trás do corpo), ela fica pendurada na
  // haste do braço, balança até parar de pé e vai apagando
  chairFree(i: number) {
    const c = this.chairs[i];
    if (!c || c.free) return;
    c.free = true;
    c.crown.setDepth(DEPTH.enemy - 0.3);
    c.glow.setDepth(DEPTH.enemy - 0.35);
    this.s.sfx('creak', 0.35, 1.4);
    this.s.sfx('tink', 0.3, 0.8);
  }

  private updateExperiment(dt: number) {
    for (const c of this.chairs) {
      if (c.free) {
        c.dim = Math.min(1, c.dim + dt * 0.6);
        // solta da cabeça inclinada, ela pende para a vertical como um pêndulo que vai perdendo o balanço
        c.swing += dt;
        c.crown.setRotation(c.facing * 0.45 * Math.exp(-c.swing * 1.8) * Math.cos(c.swing * 7.5));
      }
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 1.6 + c.ph);
      c.glow.setAlpha((0.32 + pulse * 0.25) * (1 - c.dim * 0.85));
      if (c.dim > 0) c.crown.setTint(mix(0xffffff, 0x7a6a58, c.dim * 0.7));
    }
    const t = this.tank;
    if (!t) return;
    t.flare = Math.max(0, t.flare - dt * 0.5);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.9);
    t.glow.setAlpha(0.34 + pulse * 0.1 + t.flare * 0.4).setScale(1.1 + t.flare * 0.5);
    // as bolhas subindo no Âmbar
    t.bub -= dt;
    if (t.bub <= 0) {
      t.bub = 0.25 + Math.random() * 0.35 - t.flare * 0.2;
      const b = this.s.add.image(t.x - 10 + Math.random() * 20, t.y - 10, 'px').setTint(0xffe6a6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8).setDepth(DEPTH.prop + 0.7);
      this.s.tweens.add({ targets: b, y: t.y - 43 - Math.random() * 1, x: b.x + (Math.random() - 0.5) * 4, alpha: 0.2, duration: 1800 + Math.random() * 900, ease: 'Sine.easeIn', onComplete: () => b.destroy() });
    }
  }

  // ---------- o salão do trono ----------
  private throneTextures() {
    const T = this.s.textures;
    const BRZ = [0x2e1f10, 0x4a3015, 0x7a5a2e, 0xb98a3e, 0xe4bd72];
    // a calha: um trecho de 96 px visto de lado. A aba de cima presa no teto, a face do cocho com os rebites,
    // o lábio de baixo e a fenda por onde se vê o cabo de Âmbar; a cinta que segura a calha no teto a cada trecho
    if (!T.exists('throne-rail')) {
      const { canvas, r, commit } = canvasRaster(96, 13);
      r.rect(0, 0, 96, 1, 0x120d08);
      r.rect(0, 1, 96, 1, BRZ[3]);
      r.rect(0, 2, 96, 1, BRZ[2]);
      r.rect(0, 3, 96, 5, BRZ[1]);
      r.rect(0, 3, 96, 1, BRZ[2]);
      for (let x = 6; x < 96; x += 12) {
        r.set(x, 5, BRZ[4]);
        r.set(x + 1, 6, BRZ[0]);
      }
      r.rect(0, 8, 96, 1, BRZ[3]);
      r.rect(0, 9, 96, 2, 0x1a0e06);
      // o cabo dentro da fenda, com as luvas de bronze
      r.rect(0, 9, 96, 1, 0x6a3410);
      for (let x = 20; x < 96; x += 32) r.rect(x, 9, 2, 2, BRZ[2]);
      r.rect(0, 11, 96, 1, BRZ[2]);
      r.rect(0, 12, 96, 1, 0x120d08);
      // a cinta: sobe do teto, abraça a calha e tem um parafuso no meio
      r.rect(44, 0, 4, 13, BRZ[1]);
      r.rect(44, 0, 1, 13, BRZ[3]);
      r.rect(47, 0, 1, 13, BRZ[0]);
      r.set(46, 6, BRZ[4]);
      commit();
      T.addCanvas('throne-rail', canvas);
    }
    // a ponta da calha: a curva que entra no teto (o cabo sobe por dentro da pedra até o núcleo)
    if (!T.exists('throne-rail-end')) {
      const { canvas, r, commit } = canvasRaster(8, 15);
      r.rect(0, 0, 8, 13, BRZ[1]);
      r.rect(0, 0, 1, 13, BRZ[3]);
      r.rect(7, 0, 1, 13, BRZ[0]);
      r.rect(0, 3, 8, 1, BRZ[2]);
      r.rect(0, 9, 8, 2, BRZ[2]);
      r.rect(1, 13, 6, 2, BRZ[0]);
      r.set(4, 6, BRZ[4]);
      commit();
      T.addCanvas('throne-rail-end', canvas);
    }
    // a luz do cabo na fenda (somada na tela)
    if (!T.exists('throne-rail-glow')) {
      const { canvas, r, commit } = canvasRaster(16, 5);
      r.rect(0, 0, 16, 1, 0xffa040, 70);
      r.rect(0, 1, 16, 2, 0xffc46a);
      r.rect(0, 3, 16, 1, 0xff9a30, 110);
      r.rect(0, 4, 16, 1, 0xff8a20, 40);
      commit();
      T.addCanvas('throne-rail-glow', canvas);
    }
    // o bocal no encosto: a meia argola de bronze com o furo escuro de onde o cabo sai
    if (!T.exists('throne-socket')) {
      const { canvas, r, commit } = canvasRaster(6, 9);
      r.rect(1, 0, 5, 9, BRZ[1]);
      r.rect(1, 0, 5, 1, BRZ[3]);
      r.rect(0, 2, 2, 5, BRZ[2]);
      r.rect(2, 3, 3, 3, 0x0e0905);
      r.set(1, 1, BRZ[4]);
      commit();
      T.addCanvas('throne-socket', canvas);
    }
    // a grade no pé do estrado: a moldura de bronze e as barras, com o escuro de dentro
    if (!T.exists('throne-grate')) {
      const { canvas, r, commit } = canvasRaster(6, 15);
      r.rect(0, 0, 6, 15, 0x0b0805);
      r.rect(0, 0, 6, 1, BRZ[3]);
      r.rect(0, 1, 1, 14, BRZ[2]);
      for (const y of [4, 8, 12]) r.rect(0, y, 6, 1, BRZ[1]);
      r.rect(5, 1, 1, 14, BRZ[0]);
      commit();
      T.addCanvas('throne-grate', canvas);
    }
    // a runa embutida no chão: a placa de bronze rasa (o risco da runa em pontos)
    if (!T.exists('throne-inlay')) {
      const { canvas, r, commit } = canvasRaster(22, 2);
      r.rect(0, 0, 22, 1, BRZ[2]);
      r.rect(0, 1, 22, 1, BRZ[0]);
      for (const x of [3, 6, 7, 10, 14, 15, 18]) r.set(x, 0, 0x2a1a0c);
      r.set(0, 0, BRZ[3]);
      commit();
      T.addCanvas('throne-inlay', canvas);
    }
    // a luz de uma runa do chão acesa: a faixa rente ao chão (somada na tela)
    if (!T.exists('throne-inlay-glow')) {
      const { canvas, r, commit } = canvasRaster(28, 4);
      r.rect(3, 0, 22, 1, 0xffd27a);
      r.rect(1, 1, 26, 1, 0xffb050, 200);
      r.rect(0, 2, 28, 1, 0xff9030, 110);
      r.rect(2, 3, 24, 1, 0xff8020, 50);
      commit();
      T.addCanvas('throne-inlay-glow', canvas);
    }
  }

  // o lustre de roda visto de lado (w px): o aro de bronze por cima (é nele que se pisa), a meia roda de
  // baixo presa por hastes, as lâmpadas de Âmbar nas gaiolas e o pingente do meio
  private lustreTexture(w: number) {
    const T = this.s.textures;
    const key = `throne-lustre-${w}`;
    if (T.exists(key)) return key;
    const BRZ = [0x2e1f10, 0x4a3015, 0x7a5a2e, 0xb98a3e, 0xe4bd72];
    const { canvas, r, commit } = canvasRaster(w, LUSTRE_H);
    r.rect(1, 0, w - 2, 1, BRZ[4]);
    r.rect(0, 1, w, 2, BRZ[3]);
    r.rect(0, 3, w, 2, BRZ[2]);
    r.rect(1, 5, w - 2, 1, BRZ[0]);
    for (let x = 5; x < w - 2; x += 10) {
      r.set(x, 3, BRZ[4]);
      r.set(x + 1, 4, BRZ[1]);
    }
    // a meia roda de baixo: do aro nas pontas até o fundo, no meio
    for (let x = 3; x < w - 3; x++) {
      const t = (x + 0.5 - w / 2) / (w / 2 - 3);
      const y = 6 + Math.round(4 * (1 - t * t));
      r.set(x, y, BRZ[2]);
      r.set(x, y + 1, BRZ[0]);
    }
    const lamps = this.lustreLamps(w);
    for (const lx of lamps) {
      const t = (lx + 0.5 - w / 2) / (w / 2 - 3);
      const ring = 6 + Math.round(4 * (1 - t * t));
      // a haste até a meia roda, a gaiola de bronze e o vidro aceso
      r.rect(lx, 6, 1, ring - 6, BRZ[1]);
      r.rect(lx - 2, ring + 2, 5, 5, BRZ[1]);
      r.rect(lx - 2, ring + 2, 5, 1, BRZ[3]);
      r.rect(lx - 1, ring + 3, 3, 3, 0xd27a26);
      r.set(lx, ring + 4, 0xffe6a6);
      r.set(lx - 1, ring + 3, 0xffc46a);
      r.rect(lx - 1, ring + 7, 3, 1, BRZ[0]);
    }
    // o pingente do meio, embaixo da roda
    const m = Math.floor(w / 2);
    r.rect(m - 1, 6, 3, 5, BRZ[1]);
    r.rect(m - 2, 11, 5, 3, BRZ[2]);
    r.rect(m - 2, 11, 5, 1, BRZ[3]);
    r.rect(m - 1, 14, 3, 2, BRZ[1]);
    r.set(m, 16, BRZ[3]);
    r.outline(0x120d08);
    commit();
    T.addCanvas(key, canvas);
    return key;
  }

  // onde ficam as lâmpadas no lustre (px a partir da ponta esquerda)
  private lustreLamps(w: number) {
    return [0.11, 0.31, 0.69, 0.89].map((k) => Math.round(w * k));
  }

  // a chapa de um degrau dobrável (w px): o ferro com os rebites, o olho da corrente na ponta de fora e o
  // nó da dobradiça na ponta da parede
  private stepTexture(w: number) {
    const T = this.s.textures;
    const key = `throne-step-${w}`;
    if (T.exists(key)) return key;
    const { canvas, r, commit } = canvasRaster(w, PLANK_H);
    r.rect(0, 0, w, 1, 0x9aa0ac);
    r.rect(0, 1, w, 3, 0x4c505c);
    r.rect(0, 4, w, 1, 0x34363f);
    r.rect(0, 5, w, 1, 0x1c1d23);
    for (let x = 9; x < w - 6; x += 16) {
      r.set(x, 2, 0x8a8e9a);
      r.set(x + 1, 3, 0x24262e);
    }
    r.rect(0, 1, 4, 4, 0x34363f);
    r.set(1, 2, 0x0e0f12);
    r.set(2, 2, 0x0e0f12);
    r.rect(w - 4, 1, 4, 5, 0x5a5e6a);
    r.set(w - 3, 2, 0x9aa0ac);
    r.set(w - 2, 4, 0x24262e);
    commit();
    T.addCanvas(key, canvas);
    return key;
  }

  private addThrone() {
    const s = this.s;
    const L = s.level;
    const sp = L.spawns.find((q) => q.kind === 'X');
    if (!sp) return;
    this.throneTextures();
    const done = progress.seen.has('boss:vhalor');
    const row = sp.ty + 1;
    // a frente do estrado, o chão do salão, a parede do encosto (atrás dele) e o começo do salão (a grade)
    let dx = sp.tx;
    while (dx > 0 && L.solidCell(dx - 1, row)) dx--;
    const floorRow = L.groundBelow(dx - 1, row);
    let wx = sp.tx;
    while (wx < L.w - 1 && !L.solidCell(wx + 1, sp.ty)) wx++;
    let hx = dx - 1;
    while (hx > 0 && !L.solidCell(hx - 1, floorRow - 1) && L.ch(hx - 1, floorRow - 1) !== '|') hx--;
    const ceil = L.ceilingAbove(Math.floor((hx + dx) / 2), floorRow - 1);
    const floorY = floorRow * TILE;
    const daisY = row * TILE;
    const daisX = dx * TILE;
    const wallX = (wx + 1) * TILE;
    const ceilY = (ceil + 1) * TILE;
    // a calha: do começo do salão até perto do estrado (a ponta para antes das correntes do lustre), com uma
    // ponta entrando no teto de cada lado
    const x0 = hx * TILE + 40;
    const x1 = daisX - 40;
    s.add.tileSprite(x0, ceilY, x1 - x0, 13, 'throne-rail').setOrigin(0, 0).setDepth(DEPTH.support);
    s.add.image(x0, ceilY, 'throne-rail-end').setOrigin(1, 0).setDepth(DEPTH.support);
    s.add.image(x1, ceilY, 'throne-rail-end').setOrigin(0, 0).setFlipX(true).setDepth(DEPTH.support);
    const railGlow = s.add.tileSprite(x0, ceilY + 8, x1 - x0, 5, 'throne-rail-glow').setOrigin(0, 0)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.support + 0.1).setAlpha(done ? 0 : 0.18);
    // os bocais dos cabos dos ombros, no encosto logo acima do espaldar do trono (embaixo do degrau dobrado)
    const anchors = [{ x: wallX, y: daisY - 92 }, { x: wallX, y: daisY - 100 }];
    for (const a of anchors) s.add.image(a.x, a.y, 'throne-socket').setOrigin(1, 0.5).setDepth(DEPTH.enemy - 0.15);
    // a grade no pé do estrado
    const grate = { x: daisX, y: floorY };
    s.add.image(daisX, floorY, 'throne-grate').setOrigin(1, 1).setDepth(DEPTH.prop + 0.4);
    // o lustre e os degraus do encosto ('"': o salão desenha os dois)
    let lustre: ThroneHall['lustre'] = null;
    for (const r of L.spans((x, y) => L.ch(x, y) === '"')) {
      if (L.solidCell(r.x1 + 1, r.y)) this.addFoldStep(r, done);
      else lustre = this.hangLustre(r);
    }
    // as runas embutidas: pelo chão do salão e pelo estrado, na frente do trono. A coluna de luz de cada uma
    // sobe até a altura dela ou até a primeira coisa em cima (embaixo do lustre, até as lâmpadas)
    const runes: ThroneHall['runes'] = [];
    const RUNE_H = 74;
    const add = (x: number, y: number) => {
      s.add.image(x, y, 'throne-inlay').setOrigin(0.5, 0).setDepth(DEPTH.tiles + 0.4);
      const line = s.add.image(x, y - 2, 'throne-inlay-glow').setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front).setAlpha(0);
      const glow = s.add.image(x, y - 10, 'glow').setTint(0xffa040).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9, 0.55).setDepth(DEPTH.enemy - 0.6).setAlpha(0);
      let top = y - RUNE_H;
      if (lustre && x + 13 > lustre.x0 && x - 13 < lustre.x1 && lustre.bottom < y) top = Math.max(top, lustre.bottom + 1);
      for (const cx of [x - 11, x, x + 11]) {
        const c = L.ceilingAbove(Math.floor(cx / TILE), Math.floor(y / TILE) - 1);
        if (c >= 0) top = Math.max(top, (c + 1) * TILE);
      }
      runes.push({ x, y, h: y - top, glow, line });
    };
    for (let x = hx * TILE + 56; x < daisX - 20; x += 48) add(x, floorY);
    // (no estrado: uma inteira embaixo do lustre e outra fora dele, sem nenhuma pela metade)
    for (let x = daisX + 48; x < sp.x - 40; x += 48) add(x, daisY);
    this.throne = { floorY, daisY, daisX, wallX, ceilY, rail: { x0, x1, y: ceilY }, railGlow, anchors, grate, runes, lustre };
    // vencido: os cabos dos ombros soltos dos bocais, caídos por cima do espaldar do trono vazio
    if (done) {
      const g = s.add.graphics().setDepth(DEPTH.enemy - 0.2);
      anchors.forEach((a, i) => {
        const end = { x: wallX - 14 - i * 5, y: daisY - 70 + i * 4 };
        const pts: Phaser.Math.Vector2[] = [];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          pts.push(new Phaser.Math.Vector2(a.x - 3 + (end.x - a.x + 3) * t, a.y + (end.y - a.y) * t + Math.sin(t * Math.PI) * 9));
        }
        g.lineStyle(3, 0x2a170b, 1).strokePoints(pts);
        g.lineStyle(1, 0x683c17, 1).strokePoints(pts);
      });
    }
  }

  // o lustre de roda na frente do estrado: as duas correntes até o teto e a luz das lâmpadas (a física é a
  // prancha '"' do mapa, sem tábua desenhada)
  private hangLustre(r: { x0: number; x1: number; y: number }) {
    const s = this.s;
    const L = s.level;
    const w = (r.x1 - r.x0 + 1) * TILE;
    const x = r.x0 * TILE;
    const y = r.y * TILE;
    for (let tx = r.x0; tx <= r.x1; tx++) L.layer.getTileAt(tx, r.y)?.setVisible(false);
    s.add.image(x, y, this.lustreTexture(w)).setOrigin(0, 0).setDepth(DEPTH.tiles + 0.3);
    for (const cx of [x + 3, x + w - 3]) {
      const c = L.ceilingAbove(Math.floor(cx / TILE), r.y - 1);
      if (c < 0) continue;
      const y0 = (c + 1) * TILE;
      s.add.tileSprite(cx, y0, 5, y + 2 - y0, 'deco-chain').setOrigin(0.5, 0).setDepth(DEPTH.support);
      s.add.image(cx, y0, 'deco-anchor').setOrigin(0.5, 0).setDepth(DEPTH.support);
    }
    for (const lx of this.lustreLamps(w)) {
      const t = (lx + 0.5 - w / 2) / (w / 2 - 3);
      const ly = y + 6 + Math.round(4 * (1 - t * t)) + 4;
      const glow = s.add.image(x + lx, ly, 'glow').setTint(0xffb050).setBlendMode(Phaser.BlendModes.ADD).setScale(0.42).setAlpha(0.5).setDepth(DEPTH.front);
      s.tweens.add({ targets: glow, alpha: 0.32, scale: 0.38, duration: 420 + Math.random() * 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    return { x0: x, x1: x + w, y, bottom: y + LUSTRE_H };
  }

  // um degrau do encosto: a chapa na dobradiça (pendurada rente à pedra até a luta acabar; sem física
  // enquanto isso) e a mão-francesa embaixo, onde ela deita de pé
  private addFoldStep(r: { x0: number; x1: number; y: number }, up: boolean) {
    const s = this.s;
    const L = s.level;
    const w = (r.x1 - r.x0 + 1) * TILE;
    const wallX = (r.x1 + 1) * TILE;
    const hinge = { x: wallX, y: r.y * TILE + PLANK_H };
    s.add.image(wallX, hinge.y, 'deco-bracket').setOrigin(1, 0).setFlipX(true).setDepth(DEPTH.support);
    const plate = s.add.image(hinge.x, hinge.y, this.stepTexture(w)).setOrigin(1, 1).setDepth(DEPTH.tiles + 0.3).setAngle(up ? 0 : -90);
    this.steps.push({ x0: r.x0, x1: r.x1, y: r.y, w, hinge, plate, up });
    for (let x = r.x0; x <= r.x1; x++) {
      if (up) L.layer.getTileAt(x, r.y)?.setVisible(false);
      else L.setPlank(x, r.y, false);
    }
  }

  // o Senhor de Vhalor caiu: os degraus do encosto sobem um depois do outro, de baixo para cima (o eixo gira
  // cada chapa até ela deitar na mão-francesa; a física volta quando ela trava)
  raiseSteps() {
    const s = this.s;
    const order = [...this.steps].filter((st) => !st.up).sort((a, b) => b.y - a.y);
    order.forEach((st, i) => {
      st.up = true;
      s.tweens.add({
        targets: st.plate,
        angle: 0,
        delay: i * 520,
        duration: 760,
        ease: 'Sine.easeInOut',
        onStart: () => {
          s.sfx('creak', 0.6, 0.8 + i * 0.08);
          s.sfx('gate', 0.3, 1.3);
        },
        onComplete: () => {
          for (let x = st.x0; x <= st.x1; x++) s.level.setPlank(x, st.y, true);
          s.sfx('clang', 0.7, 0.8 + i * 0.1);
          s.dustBurst(st.hinge.x - st.w / 2, st.hinge.y - PLANK_H, 6);
          s.cameras.main.shake(90, 0.002);
        },
      });
    });
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
    this.updateExperiment(dt);
    this.updateMachine(dt);
    // as nuvens andam devagar (a de trás mais devagar), na posição certa de cada trecho
    for (const c of this.clouds) c.sprite.tilePositionX = c.x0 + this.time * c.vx;
  }
}

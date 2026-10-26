import Phaser from 'phaser';
import { TILE, VIEW_H, VIEW_W } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import { DEPTH } from './Decor';
import { progress } from '../systems/Save';
import { audio } from '../systems/Audio';
import { RECORDS } from './lore';
import { screenOrigin } from '../gfx/view';
import { hd } from '../gfx/flip';
import { rng } from '../gfx/raster';
import type { DraftDef, GustDef } from './rooms';

// floco de neve na tela (px da tela); far: 0 lá atrás, 1 no meio, 2 na frente
interface Flake {
  x: number;
  y: number;
  vy: number;
  r: number;
  ph: number;
  far: 0 | 1 | 2;
}

interface Gust {
  d: GustDef;
  rect: Phaser.Geom.Rectangle;
  t: number;
  // força agora (0 a 1) e se o aviso desta volta já tocou
  k: number;
  warned: boolean;
}

interface Draft {
  d: DraftDef;
  rect: Phaser.Geom.Rectangle;
  acc: number;
}

interface ThinCell {
  x: number;
  y: number;
  stress: number;
  stage: number;
  g: Phaser.GameObjects.Graphics;
  // a laje de gelo fino (a pintura do terreno não tem: ela some quando quebra)
  img: Phaser.GameObjects.Image | null;
}

// registros que ficam em cima de um móvel (a pintura da cabana tem a prateleira e a mesa)
const NOTE_LIFT: Record<string, number> = { 'cabana:0': 0, 'cabana:1': 24 };

interface Print {
  img: Phaser.GameObjects.Image;
  t: number;
}

// pegada dela: acende quando ele chega perto, uma depois da outra
interface HerPrint {
  img: Phaser.GameObjects.Image;
  x: number;
  on: number;
  lit: boolean;
}

interface Note {
  id: string;
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}

// o vento leve de sempre (px/s para a direita) e quanto a rajada empurra o cavaleiro
const BREEZE = 9;
const GUST_PUSH = 95;
// quanto antes da rajada a neve avisa (s)
const WARN = 0.8;
// a subida na corrente de ar da serra e no vapor da fonte quente (px/s)
const RISE = 210;
const STEAM_RISE = 235;
// gelo fino: parado em cima racha rápido, andando devagar; a queda pesa conforme a velocidade
const THIN_STILL = 1;
const THIN_WALK = 0.45;
const THIN_STAGES = [0.35, 0.75, 1.1];

// Floresta Nevada: a neve caindo, as rajadas de vento, as correntes de ar (e o vapor da fonte quente),
// o gelo (escorrega), o gelo fino (racha e quebra), as pegadas na neve (as dele e as pequenas, de luz,
// que são dela), as fitas vermelhas nos troncos e os registros da floresta
export class Forest {
  private flakes: Flake[] = [];
  private snowG: Phaser.GameObjects.Graphics[] = [];
  // a primeira linha sólida de cada coluna vinda do céu (abaixo dela a neve não cai: teto, telhado)
  private skyRow: number[] = [];
  private gusts: Gust[] = [];
  private drafts: Draft[] = [];
  private thin: ThinCell[] = [];
  private prints: Print[] = [];
  private her: HerPrint[] = [];
  private notes: Note[] = [];
  private ribbons: { x: number; y: number; ph: number }[] = [];
  private ribbonG: Phaser.GameObjects.Graphics | null = null;
  private streaks: Phaser.GameObjects.Particles.ParticleEmitter;
  private rising: Phaser.GameObjects.Particles.ParticleEmitter;
  private steam: Phaser.GameObjects.Particles.ParticleEmitter;
  private chips: Phaser.GameObjects.Particles.ParticleEmitter;
  private puffs: Phaser.GameObjects.Particles.ParticleEmitter;
  private breath: Phaser.GameObjects.Particles.ParticleEmitter;
  private so: { x: number; y: number };
  private lastSX = 0;
  private lastSY = 0;
  private time = 0;
  private wasGround = true;
  private airVy = 0;
  private stepX = 0;
  private stepSide = 1;
  private breathT = 1.5;
  private herT = 0;
  private iceT = 0;
  private streakVx = 0;
  private thinGround = true;
  private airVyThin = 0;
  readonly wind = { x: 0 };

  constructor(private s: GameScene) {
    const L = s.level;
    const room = s.room;
    const cam = s.cameras.main;
    this.so = screenOrigin(cam);
    this.lastSX = cam.scrollX;
    this.lastSY = cam.scrollY;
    this.makeTextures();
    for (let x = 0; x < L.w; x++) {
      let y = 0;
      while (y < L.h && !L.solidCell(x, y) && L.ch(x, y) !== ';') y++;
      this.skyRow.push(y);
    }
    // três camadas de neve: lá atrás (atrás do terreno), no meio e na frente (flocos grandes e poucos)
    const n = room.snow ?? 0;
    const depths = [-9, 19, 21];
    for (let k = 0; k < 3; k++) this.snowG.push(s.add.graphics().setScrollFactor(0).setPosition(this.so.x, this.so.y).setDepth(depths[k]));
    for (let i = 0; i < n; i++) {
      const far = (i % 7 === 0 ? 2 : i % 2 ? 1 : 0) as 0 | 1 | 2;
      this.flakes.push({
        x: Math.random() * VIEW_W,
        y: Math.random() * VIEW_H,
        vy: [14, 24, 38][far] + Math.random() * 10,
        r: far === 2 ? 2 : far === 1 && Math.random() < 0.3 ? 2 : 1,
        ph: Math.random() * 10,
        far,
      });
    }
    for (const d of room.gusts ?? []) {
      this.gusts.push({ d, rect: new Phaser.Geom.Rectangle(d.x0 * TILE, d.y0 * TILE, (d.x1 - d.x0 + 1) * TILE, (d.y1 - d.y0 + 1) * TILE), t: d.phase ?? 0, k: 0, warned: false });
    }
    for (const d of room.drafts ?? []) {
      this.drafts.push({ d, rect: new Phaser.Geom.Rectangle(d.x0 * TILE, d.y0 * TILE, (d.x1 - d.x0 + 1) * TILE, (d.y1 - d.y0 + 1) * TILE), acc: 0 });
    }
    const painted = s.textures.exists(`terrain-${room.id}`);
    for (const c of L.thin) {
      const img = painted ? s.add.image(c.x * TILE, c.y * TILE, 'thin-ice').setOrigin(0).setDepth(DEPTH.tiles + 0.5).setFlipX((c.x * 7 + c.y) % 2 === 0) : null;
      this.thin.push({ x: c.x, y: c.y, stress: 0, stage: 0, g: s.add.graphics().setDepth(DEPTH.tiles + 0.6), img });
    }

    // a neve que a rajada levanta e o vento que corre (riscos finos)
    this.streaks = s.add.particles(0, 0, 'px', {
      lifespan: { min: 260, max: 520 },
      speedX: { onEmit: () => this.streakVx * (0.8 + Math.random() * 0.4) },
      speedY: { min: -12, max: 12 },
      scaleX: { min: 5, max: 14 },
      scaleY: 0.6,
      alpha: { start: 0.55, end: 0 },
      tint: [0xffffff, 0xdfe9f7],
      emitting: false,
    }).setDepth(20);
    // o que sobe na corrente de ar da serra: neve fina rodando
    this.rising = s.add.particles(0, 0, 'px', {
      lifespan: { min: 900, max: 1500 },
      speedY: { min: -300, max: -190 },
      speedX: { min: -18, max: 18 },
      scale: { start: 1, end: 0.4 },
      alpha: { start: 0.7, end: 0 },
      tint: [0xffffff, 0xd6e4f5],
      emitting: false,
    }).setDepth(19);
    // o vapor da fonte quente: nuvens brancas e moles que sobem abrindo
    this.steam = s.add.particles(0, 0, 'glow', {
      lifespan: { min: 1800, max: 2800 },
      speedY: { min: -150, max: -95 },
      speedX: { min: -12, max: 12 },
      scale: { start: 0.5, end: 2.4 },
      alpha: { start: 0.22, end: 0 },
      tint: 0xf2f6ff,
      emitting: false,
    }).setDepth(DEPTH.front + 0.5);
    // lascas de gelo do gelo fino
    this.chips = s.add.particles(0, 0, 'px', {
      lifespan: { min: 300, max: 700 },
      speed: { min: 40, max: 150 },
      angle: { min: 200, max: 340 },
      gravityY: 600,
      scale: { start: 1.3, end: 0.4 },
      tint: [0xffffff, 0xcfe6ff, 0x9cc4ec],
      emitting: false,
    }).setDepth(DEPTH.front);
    // a neve que espirra quando ele cai ou quando sacode um galho
    this.puffs = s.add.particles(0, 0, 'px', {
      lifespan: { min: 300, max: 700 },
      speed: { min: 15, max: 70 },
      angle: { min: 190, max: 350 },
      gravityY: 90,
      scale: { start: 1.4, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [0xffffff, 0xe8f0fb],
      emitting: false,
    }).setDepth(DEPTH.front);
    // o bafo no frio
    this.breath = s.add.particles(0, 0, 'glow', {
      lifespan: { min: 700, max: 1000 },
      speedY: { min: -14, max: -6 },
      scale: { start: 0.12, end: 0.42 },
      alpha: { start: 0.2, end: 0 },
      tint: 0xf4f8ff,
      emitting: false,
    }).setDepth(DEPTH.player + 0.3);

    if (!s.textures.exists(`pinhos-${room.id}`)) this.drawPines();
    this.makeTrail();
    this.ribbons = (room.ribbons ?? []).map(([x, y], i) => ({ x: x * TILE + 8, y: y * TILE + 8, ph: i * 1.7 }));
    if (this.ribbons.length) this.ribbonG = s.add.graphics().setDepth(DEPTH.tiles + 0.4);
    // os registros da floresta (cada 'r' na ordem do mapa)
    let ri = 0;
    for (const sp of L.spawns) {
      if (sp.kind !== 'r') continue;
      const id = `${room.id}:${ri++}`;
      this.addNote(id, sp.x, sp.y);
    }
  }

  // ---------- desenhos feitos aqui (pegadas, o brilho das dela) ----------
  private makeTextures() {
    const s = this.s;
    if (!s.textures.exists('print')) {
      const g = s.add.graphics();
      g.fillStyle(0x6f86a8, 0.55).fillEllipse(3, 1.5, 6, 3);
      g.fillStyle(0x52668a, 0.5).fillEllipse(3, 1.8, 4, 2);
      g.generateTexture('print', 6, 3);
      g.destroy();
    }
    if (!s.textures.exists('thin-ice')) {
      // gelo fino: uma laje clara e translúcida, a geada em cima e a água escura aparecendo por baixo
      const g = s.add.graphics();
      g.fillStyle(0x6f93b5, 0.55).fillRect(0, 2, 16, 6);
      g.fillStyle(0xa9c8e2, 0.75).fillRect(0, 0, 16, 3);
      g.fillStyle(0xeaf5fc, 0.95).fillRect(0, 0, 16, 1);
      g.fillStyle(0xd7e9f7, 0.6).fillRect(3, 4, 4, 1).fillRect(10, 5, 3, 1);
      g.fillStyle(0x3d5f80, 0.45).fillRect(0, 8, 16, 2);
      g.generateTexture('thin-ice', 16, 10);
      g.destroy();
    }
    if (!s.textures.exists('print-her')) {
      const g = s.add.graphics();
      g.fillStyle(0xffe9b8, 0.35).fillEllipse(3, 2, 6, 4);
      g.fillStyle(0xfff6dc, 0.9).fillEllipse(3, 2, 3, 2);
      g.generateTexture('print-her', 6, 4);
      g.destroy();
    }
  }

  // enquanto a pintura da sala não chega: os troncos dos pinheiros (do pé até o alto), com neve nos
  // galhos que seguram o peso, e os pinheiros novos
  private drawPines() {
    const s = this.s;
    const L = s.level;
    const g = s.add.graphics().setDepth(DEPTH.prop);
    for (const sp of L.spawns) {
      if (sp.kind === 'T' || sp.kind === 's') {
        const dead = sp.kind === 's';
        const w = dead ? 14 : 22;
        g.fillStyle(dead ? 0x6d6a66 : 0x2c3442, 1).fillRect(sp.x - w / 2, 0, w, sp.y + 2);
        g.fillStyle(dead ? 0x9a958d : 0x46526a, 1).fillRect(sp.x - w / 2, 0, 3, sp.y + 2);
      } else if (sp.kind === 't') {
        g.fillStyle(0x2f4a46, 1).fillTriangle(sp.x, sp.y - 40, sp.x - 13, sp.y, sp.x + 13, sp.y);
        g.fillStyle(0xeef3fa, 1).fillTriangle(sp.x, sp.y - 40, sp.x - 6, sp.y - 22, sp.x + 6, sp.y - 22);
      }
    }
    for (const r of L.spans((x, y) => L.ch(x, y) === '-')) {
      g.fillStyle(0xf4f8ff, 1).fillRect(r.x0 * TILE, r.y * TILE - 2, (r.x1 - r.x0 + 1) * TILE, 3);
    }
  }

  // as pegadas pequenas dela, nos trechos da sala (chão ou galho)
  private makeTrail() {
    const s = this.s;
    const L = s.level;
    const rand = rng(s.room.id.length * 131 + 7);
    for (const [x0, x1, row] of s.room.trail ?? []) {
      let side = 1;
      for (let px = x0 * TILE + 4; px <= x1 * TILE + 12; px += 11 + rand() * 3) {
        const tx = Math.floor(px / TILE);
        const top = row ?? L.groundBelow(tx, 0);
        if (top < 0) continue;
        const img = s.add.image(px, top * TILE + 1 + side * 0.5, 'print-her').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.tiles + 0.5).setAlpha(0);
        side = -side;
        this.her.push({ img, x: px, on: 0, lit: false });
      }
    }
  }

  // drop: o registro cai de quem o carregava (o livro da caça sai do Mestre vencido) e assenta no chão
  addNote(id: string, x: number, y: number, drop = false) {
    const s = this.s;
    if (!RECORDS[id] || this.notes.some((n) => n.id === id)) return;
    const key = s.textures.exists(`deco-note-${id.replace(':', '-')}`) ? `deco-note-${id.replace(':', '-')}` : this.noteFallback();
    const img = hd(s.add.image(x, y + 1 - (NOTE_LIFT[id] ?? 0), key).setOrigin(0.5, 1).setDepth(DEPTH.prop + 0.5));
    const seen = progress.seen.has(`record:${id}`);
    const glow = s.add.image(x, y - img.displayHeight * 0.6, 'glow').setScale(1.3).setTint(0xffe2b0).setAlpha(seen ? 0.18 : 0.45).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front);
    this.notes.push({ id, x, y, img, glow });
    if (!drop) return;
    // sobe um pouco, vira no ar e bate na neve levantando pó
    const y0 = img.y;
    img.setY(y0 - 34).setAngle(-30);
    glow.setAlpha(0);
    s.tweens.add({ targets: img, y: y0, angle: 0, duration: 620, ease: 'Bounce.easeOut' });
    s.tweens.add({ targets: glow, alpha: 0.45, duration: 500, delay: 500 });
    s.time.delayedCall(260, () => {
      this.frost(x, y, 8);
      s.sfx('page', 0.7);
    });
  }

  // enquanto a pintura do registro não chega: um papel dobrado com marcas vermelhas
  private noteFallback() {
    const s = this.s;
    if (!s.textures.exists('deco-note')) {
      const g = s.add.graphics();
      g.fillStyle(0x2a1c14).fillRect(0, 2, 12, 9);
      g.fillStyle(0xe8dcc0).fillRect(1, 3, 10, 7);
      g.fillStyle(0xa3242a).fillRect(3, 5, 6, 1).fillRect(3, 7, 4, 1);
      g.generateTexture('deco-note', 12, 11);
      g.destroy();
    }
    return 'deco-note';
  }

  nearby(p: Player): { hint: string; act: () => void } | null {
    if (!p.onGround) return null;
    for (const n of this.notes) {
      if (Math.abs(p.x - n.x) > 20 || Math.abs(p.body.bottom - n.y) > 12) continue;
      return {
        hint: '{up} ler',
        act: () => {
          this.s.readRecord(n.id);
          n.glow.setAlpha(0.18);
        },
      };
    }
    return null;
  }

  // ---------- quadro a quadro ----------
  update(dt: number) {
    const s = this.s;
    const p = s.player;
    this.time += dt;
    const cam = s.cameras.main;
    const dx = cam.scrollX - this.lastSX;
    const dy = cam.scrollY - this.lastSY;
    this.lastSX = cam.scrollX;
    this.lastSY = cam.scrollY;
    this.updateGusts(dt, p);
    this.updateDrafts(dt, p);
    this.updateGround(dt, p);
    this.updateThin(dt, p);
    this.drownEnemies();
    this.updateSnow(dt, dx, dy);
    this.updatePrints(dt, p);
    this.updateHer(dt, p);
    this.updateRibbons();
    this.updateBreath(dt, p);
    for (const n of this.notes) n.glow.setScale(1.3 + Math.sin(this.time * 2 + n.x) * 0.08);
  }

  // ---------- vento ----------
  private updateGusts(dt: number, p: Player) {
    const s = this.s;
    const view = s.cameras.main.worldView;
    let push = 0;
    for (const g of this.gusts) {
      const { every, len } = g.d;
      g.t = (g.t + dt) % every;
      // a rajada sopra de 0 a len; a neve avisa nos WARN segundos antes da volta acabar
      const blowing = g.t < len;
      const warning = g.t >= every - WARN;
      const target = blowing ? 1 : 0;
      g.k += (target - g.k) * Math.min(1, dt * (blowing ? 7 : 4));
      const inView = Phaser.Geom.Rectangle.Overlaps(g.rect, view);
      if (warning && !g.warned) {
        g.warned = true;
        const d = Math.hypot(p.x - g.rect.centerX, p.body.center.y - g.rect.centerY);
        if (inView || d < 520) s.sfx('gust', Phaser.Math.Clamp(1 - d / 700, 0.25, 0.9), 0.9 + Math.random() * 0.2);
      }
      if (!warning) g.warned = false;
      if (inView && (warning || g.k > 0.05)) {
        // riscos de vento e neve levantada, dentro do trecho que aparece na tela
        const rate = warning ? 22 : 70 * g.k;
        const n = Math.floor(rate * dt + Math.random());
        const r = Phaser.Geom.Rectangle.Intersection(g.rect, view);
        this.streakVx = g.d.dir * (warning ? 260 : 420);
        for (let i = 0; i < n; i++) this.streaks.explode(1, r.x + Math.random() * r.width, r.y + Math.random() * r.height);
      }
      if (g.k > 0.02 && Phaser.Geom.Rectangle.Contains(g.rect, p.x, p.body.center.y)) push += g.d.dir * GUST_PUSH * g.k;
    }
    p.windX = push;
    this.wind.x = BREEZE + push * 2.2;
  }

  // ---------- correntes de ar e o vapor ----------
  private updateDrafts(dt: number, p: Player) {
    const view = this.s.cameras.main.worldView;
    let rise = 0;
    for (const d of this.drafts) {
      if (Phaser.Geom.Rectangle.Contains(d.rect, p.x, p.body.center.y)) rise = Math.max(rise, d.d.steam ? STEAM_RISE : RISE);
      if (!Phaser.Geom.Rectangle.Overlaps(d.rect, view)) continue;
      const r = Phaser.Geom.Rectangle.Intersection(d.rect, view);
      if (d.d.steam) {
        // o vapor nasce da água aberta (o fundo do trecho) e sobe abrindo
        d.acc += dt * 9;
        while (d.acc >= 1) {
          d.acc -= 1;
          this.steam.explode(1, d.rect.x + 6 + Math.random() * (d.rect.width - 12), d.rect.bottom - 4);
        }
        if (Math.random() < dt * 3) this.chips.explode(1, d.rect.x + Math.random() * d.rect.width, d.rect.bottom - 2);
      } else {
        d.acc += dt * 36 * (r.height / VIEW_H + 0.3);
        while (d.acc >= 1) {
          d.acc -= 1;
          this.rising.explode(1, r.x + Math.random() * r.width, r.y + Math.random() * r.height);
        }
      }
    }
    p.draft = rise;
  }

  // ---------- chão: gelo, neve, madeira ----------
  private updateGround(dt: number, p: Player) {
    const s = this.s;
    const L = s.level;
    const b = p.body;
    const onGround = b.blocked.down;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor((b.bottom + 2) / TILE);
    p.ice = onGround && L.iceCell(tx, ty);
    if (onGround) {
      audio.stepKind = p.ice ? 'ice' : this.snowy(tx, ty) ? 'snow' : 'wood';
      if (!this.wasGround && this.airVy > 160) {
        // aterrissou: a neve espirra (no gelo, só um risco de gelo)
        if (!p.ice && this.snowy(tx, ty)) {
          this.puffs.explode(Math.min(14, 4 + Math.floor(this.airVy / 40)), p.x, b.bottom - 1);
          if (this.airVy > 300) s.sfx('crunch', Math.min(1, this.airVy / 500), 0.9 + Math.random() * 0.2);
        }
        // num galho, a neve de cima cai pelos lados
        if (L.ch(tx, ty) === '-') {
          for (let k = 0; k < 6; k++) this.puffs.explode(1, p.x + (Math.random() - 0.5) * 40, b.bottom + 4);
        }
      }
      // no gelo correndo rápido, raspa
      if (p.ice && Math.abs(b.velocity.x) > 120) {
        this.iceT -= dt;
        if (this.iceT <= 0) {
          this.iceT = 0.05;
          this.chips.explode(1, p.x - Math.sign(b.velocity.x) * 5, b.bottom - 1);
        }
      }
    } else this.airVy = b.velocity.y;
    this.wasGround = onGround;
  }

  // a superfície (x, linha) está ao ar livre (cai neve nela)?
  private snowy(x: number, row: number) {
    return row <= (this.skyRow[x] ?? 0);
  }

  // ---------- gelo fino ----------
  private updateThin(dt: number, p: Player) {
    if (!this.thin.length) return;
    const s = this.s;
    const loads: { x0: number; x1: number; foot: number; still: boolean; land: number }[] = [];
    const b = p.body;
    if (b.blocked.down && !p.dead) {
      const landed = !this.thinGround && this.airVyThin > 250 ? (this.airVyThin - 250) / 380 : 0;
      loads.push({ x0: b.left, x1: b.right, foot: b.bottom, still: Math.abs(b.velocity.x) < 30, land: landed });
      this.thinGround = true;
    } else {
      this.thinGround = false;
      this.airVyThin = b.velocity.y;
    }
    // os inimigos também pesam (o lobo correndo atrás dele pode quebrar o gelo)
    for (const e of s.enemies) {
      if (!e.alive || !e.body.blocked.down) continue;
      loads.push({ x0: e.body.left, x1: e.body.right, foot: e.body.bottom, still: Math.abs(e.body.velocity.x) < 20, land: 0 });
    }
    for (const c of [...this.thin]) {
      const cx0 = c.x * TILE;
      const cx1 = cx0 + TILE;
      const top = c.y * TILE;
      let load = 0;
      for (const l of loads) {
        if (l.x1 <= cx0 || l.x0 >= cx1 || Math.abs(l.foot - top) > 3) continue;
        load += (l.still ? THIN_STILL : THIN_WALK) * dt + l.land;
      }
      if (load > 0) c.stress += load;
      else c.stress = Math.max(0, c.stress - dt * 0.05);
      while (c.stage < 3 && c.stress >= THIN_STAGES[c.stage]) {
        c.stage++;
        if (c.stage < 3) {
          this.drawCracks(c);
          s.sfx('ice-crack', c.stage === 1 ? 0.6 : 0.9, 0.9 + Math.random() * 0.2);
          this.chips.explode(3 * c.stage, cx0 + 8, top + 1);
        }
      }
      if (c.stage >= 3) this.breakThin(c);
    }
  }

  private drawCracks(c: ThinCell) {
    const g = c.g;
    const rand = rng(c.x * 977 + c.y * 31 + c.stage * 7);
    const x0 = c.x * TILE;
    const y0 = c.y * TILE;
    const n = c.stage === 1 ? 2 : 5;
    for (let k = 0; k < n; k++) {
      let x = x0 + 4 + rand() * 8;
      let y = y0 + 1;
      const pts: [number, number][] = [[x, y]];
      for (let j = 0; j < 4; j++) {
        x += (rand() - 0.5) * 9;
        y += 1.5 + rand() * 3;
        pts.push([Phaser.Math.Clamp(x, x0, x0 + TILE), Math.min(y, y0 + TILE - 1)]);
      }
      g.lineStyle(1.4, 0x1c3550, 0.5);
      for (let j = 0; j < pts.length - 1; j++) g.lineBetween(pts[j][0], pts[j][1] + 0.6, pts[j + 1][0], pts[j + 1][1] + 0.6);
      g.lineStyle(0.8, 0xf2f8ff, 0.95);
      for (let j = 0; j < pts.length - 1; j++) g.lineBetween(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1]);
    }
  }

  // geada que estoura: lascas de gelo e um sopro de neve
  frost(x: number, y: number, n: number) {
    this.chips.explode(Math.ceil(n * 0.6), x, y);
    this.puffs.explode(Math.ceil(n * 0.5), x, y);
  }

  // inimigo que cai na água gelada não sai mais (o lobo tem a dele; os outros afundam aqui)
  private drownEnemies() {
    const s = this.s;
    for (const e of s.enemies) {
      if (!e.alive || !e.body.enable || e.kind === 'wolf' || e.kind === 'boss' || !e.body.allowGravity) continue;
      if (!s.level.inWater(e.body.center.x, e.body.bottom - 3)) continue;
      s.splash(e.body.center.x, Math.floor((e.body.bottom - 3) / TILE) * TILE + 3);
      s.sfx('freeze', 0.6, 1.1);
      e.hit(e.body.center.x, 999, 'smoke');
      if (!e.alive) s.killed(e);
    }
  }

  private breakThin(c: ThinCell) {
    const s = this.s;
    s.level.breakThin(c.x, c.y);
    c.g.destroy();
    c.img?.destroy();
    this.thin.splice(this.thin.indexOf(c), 1);
    const x = c.x * TILE + 8;
    const y = c.y * TILE + 2;
    this.chips.explode(14, x, y);
    s.sfx('ice-break', 0.9, 0.9 + Math.random() * 0.2);
    s.cameras.main.shake(90, 0.003);
    // o vizinho de gelo fino sente o tranco
    for (const n of this.thin) if (n.y === c.y && Math.abs(n.x - c.x) === 1) n.stress += 0.45;
  }

  // ---------- neve caindo ----------
  private updateSnow(dt: number, dx: number, dy: number) {
    if (!this.flakes.length) return;
    const view = this.s.cameras.main.worldView;
    const t = this.time;
    for (const g of this.snowG) g.clear();
    const par = [0.45, 1, 1.35];
    const alpha = [0.45, 0.8, 0.9];
    const L = this.s.level;
    for (const f of this.flakes) {
      const k = par[f.far];
      // no trecho da rajada o floco corre junto (o aviso vem antes: a neve já corre de lado)
      const wx = view.x + f.x;
      const wy = view.y + f.y;
      let gx = 0;
      for (const g of this.gusts) {
        if (!Phaser.Geom.Rectangle.Contains(g.rect, wx, wy)) continue;
        const warn = g.t >= g.d.every - WARN;
        gx += g.d.dir * (warn ? 120 : 0) + g.d.dir * 330 * g.k;
      }
      let up = 0;
      for (const d of this.drafts) if (!d.d.steam && Phaser.Geom.Rectangle.Contains(d.rect, wx, wy)) up = 1;
      f.x += ((BREEZE + gx) * (0.5 + 0.5 * k) + Math.sin(t * 1.3 + f.ph) * 7) * dt - dx * k;
      f.y += (up ? -f.vy * 3.5 : f.vy) * dt - dy * k;
      if (f.x > VIEW_W + 4) f.x -= VIEW_W + 8;
      if (f.x < -4) f.x += VIEW_W + 8;
      if (f.y > VIEW_H + 4) f.y -= VIEW_H + 8;
      if (f.y < -4) f.y += VIEW_H + 8;
      // só no ar livre: embaixo de teto, de telhado ou dentro da pedra, não aparece
      const col = Math.floor((view.x + f.x) / TILE);
      if (col >= 0 && col < L.w && view.y + f.y >= this.skyRow[col] * TILE) continue;
      const g = this.snowG[f.far];
      g.fillStyle(0xffffff, alpha[f.far]);
      g.fillRect(f.x, f.y, f.r, f.r);
    }
  }

  // ---------- pegadas ----------
  private updatePrints(dt: number, p: Player) {
    const s = this.s;
    const b = p.body;
    for (const pr of [...this.prints]) {
      pr.t -= dt;
      if (pr.t < 3) pr.img.setAlpha(Math.max(0, pr.t / 3) * 0.9);
      if (pr.t <= 0) {
        pr.img.destroy();
        this.prints.splice(this.prints.indexOf(pr), 1);
      }
    }
    if (!b.blocked.down || p.ice || p.dead) {
      this.stepX = p.x;
      return;
    }
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor((b.bottom + 2) / TILE);
    if (!this.snowy(tx, ty)) return;
    if (Math.abs(p.x - this.stepX) < 13) return;
    this.stepX = p.x;
    this.stepSide = -this.stepSide;
    const img = s.add.image(p.x + this.stepSide * 2, b.bottom + 1 + this.stepSide * 0.4, 'print').setDepth(DEPTH.tiles + 0.5).setAlpha(0.9).setFlipX(p.facing < 0);
    this.prints.push({ img, t: 14 });
    if (this.prints.length > 70) this.prints.shift()!.img.destroy();
  }

  // as pegadas dela acendem uma depois da outra quando ele chega perto (e apagam quando ele vai embora)
  private updateHer(dt: number, p: Player) {
    if (!this.her.length) return;
    this.herT -= dt;
    // a lanterna da lança mostra o rastro de quem lembra demais: com ela, as pegadas acendem de mais longe
    const reach = p.weapon.lantern ? 320 : 170;
    const near = (h: HerPrint) => Math.abs(h.x - p.x) < reach;
    if (this.herT <= 0) {
      this.herT = 0.12;
      // a próxima apagada que está perto, a partir do lado do cavaleiro
      const next = this.her.filter((h) => !h.lit && near(h)).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (next) {
        next.lit = true;
        if (!progress.seen.has('forest:her')) {
          progress.seen.add('forest:her');
          this.s.time.delayedCall(600, () => this.s.thinkOnce('forest:her-prints', 'Pegadas pequenas, de luz. Vão na frente, como se alguém tivesse acabado de passar.'));
        }
      }
    }
    for (const h of this.her) {
      if (h.lit && !near(h) && Math.abs(h.x - p.x) > reach + 90) h.lit = false;
      h.on += ((h.lit ? 1 : 0) - h.on) * Math.min(1, dt * 3);
      h.img.setAlpha(h.on * (0.6 + 0.25 * Math.sin(this.time * 2.4 + h.x * 0.05)));
    }
  }

  // ---------- fitas vermelhas nos troncos ----------
  private updateRibbons() {
    const g = this.ribbonG;
    if (!g) return;
    g.clear();
    const w = this.wind.x;
    for (const r of this.ribbons) {
      // o nó no tronco e as duas pontas soltas, batendo no vento
      g.fillStyle(0x6a1016).fillRect(r.x - 2, r.y - 1, 4, 3);
      g.fillStyle(0xb3222b).fillRect(r.x - 2, r.y - 1, 4, 2);
      for (const [len, off] of [[9, 0], [7, 2.2]] as const) {
        let x = r.x + 1;
        let y = r.y;
        for (let i = 0; i < 4; i++) {
          const k = (i + 1) / 4;
          const nx = x + (2 + w * 0.06) * (len / 9) + Math.sin(this.time * 6 + r.ph + off + i) * 0.8 * k;
          const ny = y + 1.2 + Math.cos(this.time * 5 + r.ph + off + i * 1.3) * 0.9 * k;
          g.lineStyle(2 - k, i < 2 ? 0xc0262f : 0x9a1a22, 1).lineBetween(x, y, nx, ny);
          x = nx;
          y = ny;
        }
      }
    }
  }

  // ---------- o bafo no frio ----------
  private updateBreath(dt: number, p: Player) {
    if (p.dead || !p.sprite.visible) return;
    this.breathT -= dt;
    if (this.breathT > 0) return;
    // mais rápido correndo ou depois de lutar
    this.breathT = Math.abs(p.body.velocity.x) > 100 ? 1.1 : 2.2 + Math.random();
    const top = this.skyRow[Math.floor(p.x / TILE)] ?? 0;
    // dentro da cabana, perto do fogo, o bafo não aparece
    if (p.body.top > top * TILE + 4) return;
    for (let k = 0; k < 3; k++) this.s.time.delayedCall(k * 90, () => this.breath.explode(1, p.x + p.facing * (7 + k * 2), p.body.top + 9));
  }

  destroy() {
    for (const c of this.thin) {
      c.g.destroy();
      c.img?.destroy();
    }
    for (const pr of this.prints) pr.img.destroy();
  }
}

import Phaser from 'phaser';
import { PLAYER as C, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import { DEPTH, WATER_LOOKS, paintWater } from './Decor';
import type { Span } from './Level';
import type { Rect } from './rooms';
import { rng } from '../gfx/raster';

// a subida na névoa do lado das quedas (px/s), como a corrente de ar da serra
const RISE = 200;

interface Fall {
  r: Rect;
  x: number;
  y: number;
  w: number;
  h: number;
  back: Phaser.GameObjects.TileSprite;
  front: Phaser.GameObjects.TileSprite;
  mist: Phaser.GameObjects.Image[];
  // onde a água bate (a linha d'água do poço embaixo, ou o chão)
  foot: number;
  acc: number;
}

interface Draft {
  rect: Phaser.Geom.Rectangle;
  acc: number;
}

interface Log {
  zone: Phaser.GameObjects.Zone;
  body: Phaser.Physics.Arcade.Body;
  img: Phaser.GameObjects.Image;
  ripple: Phaser.GameObjects.Image;
  // o trecho que ele desce (px) ou null (boia no lugar), o lugar de origem e a linha d'água
  seg: [number, number] | null;
  home: number;
  surface: number;
  // o peso dele em cima (0 a 1, com mola), afundando no fim do trecho (0 a 1) e voltando (0 a 1)
  load: number;
  sink: number;
  rise: number;
  ph: number;
}

// O Vale das Cachoeiras (capítulo 6, lore/vale.md): o vale da Lembrança do prólogo, agora no presente.
// Aqui fica o que é só do vale: a água funda pintada pela profundidade (a linha d'água, o verde que
// escurece para baixo, as cáusticas), as quedas d'água (empurram para baixo; do lado delas a névoa sobe e a
// capa pega), a correnteza do rio (leva quem nada e os troncos), os troncos boiando (servem de chão e
// afundam um pouco com o peso) e as árvores de flor enquanto a pintura da sala não chega.
export class Vale {
  private falls: Fall[] = [];
  private drafts: Draft[] = [];
  private currents: { rect: Phaser.Geom.Rectangle; vx: number }[] = [];
  private logs: Log[] = [];
  private surfaces: { sprite: Phaser.GameObjects.TileSprite; vx: number }[] = [];
  private caustics: { sprite: Phaser.GameObjects.TileSprite; vx: number }[] = [];
  private foam: Phaser.GameObjects.Particles.ParticleEmitter;
  private spray: Phaser.GameObjects.Particles.ParticleEmitter;
  private rising: Phaser.GameObjects.Particles.ParticleEmitter;
  private drift: Phaser.GameObjects.Particles.ParticleEmitter;
  private time = 0;
  private driftAcc = 0;
  // os troncos só seguram o cavaleiro depois que ele existe (o Vale nasce antes dele)
  private linked = false;
  // o presente cinzento (lore/vale.md): os trechos onde a lembrança falha, o círculo cinza em volta dele
  // (centro, raio e força; o filtro do EXTREME e do Alto pinta), as copas de flor desses trechos (caem
  // quando o cinza chega) e a cinza seca no ar
  private present: Phaser.Geom.Rectangle[] = [];
  private pres = { x: 0, y: 0, r: 0, k: 0 };
  private blooms: { x: number; y: number; gs: Phaser.GameObjects.Graphics[]; bare: number }[] = [];
  private ash: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private ashAcc = 0;
  // sem o filtro do Alto e do EXTREME (Performance): a tela inteira desbota enquanto o cinza dura
  private greyFx: Phaser.FX.ColorMatrix | null = null;

  constructor(private s: GameScene) {
    const room = s.room;
    for (const r of room.present ?? []) this.present.push(new Phaser.Geom.Rectangle(r.x0 * TILE, r.y0 * TILE, (r.x1 - r.x0 + 1) * TILE, (r.y1 - r.y0 + 1) * TILE));
    this.makeTextures();
    if (!s.textures.exists(`arvores-${s.room.id}`)) this.drawTrees();
    this.drawWater();
    // a espuma onde a queda bate, os respingos e a névoa que sobe do lado
    this.foam = s.add.particles(0, 0, 'glow', {
      lifespan: { min: 500, max: 1100 },
      speedX: { min: -50, max: 50 },
      speedY: { min: -70, max: -20 },
      scale: { start: 0.18, end: 0.55 },
      alpha: { start: 0.42, end: 0 },
      tint: [0xffffff, 0xe6fbf2],
      emitting: false,
    }).setDepth(DEPTH.water + 0.5);
    this.spray = s.add.particles(0, 0, 'px', {
      lifespan: { min: 260, max: 620 },
      speedX: { min: -90, max: 90 },
      speedY: { min: -170, max: -60 },
      gravityY: 520,
      scale: { start: 1.2, end: 0.5 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffffff, 0xd9f5ea],
      emitting: false,
    }).setDepth(DEPTH.water + 0.6);
    this.rising = s.add.particles(0, 0, 'px', {
      lifespan: { min: 1100, max: 1900 },
      speedY: { min: -260, max: -160 },
      speedX: { min: -14, max: 14 },
      scale: { start: 1.1, end: 0.4 },
      alpha: { start: 0.55, end: 0 },
      tint: [0xffffff, 0xe1f7ee],
      emitting: false,
    }).setDepth(19);
    // pétalas e folhas descendo o rio na linha d'água
    this.drift = s.add.particles(0, 0, 'px', {
      lifespan: { min: 2600, max: 4200 },
      scaleX: { min: 1.6, max: 2.6 },
      scaleY: { min: 0.9, max: 1.3 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xf6b3cc, 0xfbd0de, 0x8fbf6a, 0xc9e39a],
      emitting: false,
    }).setDepth(DEPTH.water + 0.4);
    for (const r of room.falls ?? []) this.addFall(r);
    for (const d of room.drafts ?? []) {
      this.drafts.push({ rect: new Phaser.Geom.Rectangle(d.x0 * TILE, d.y0 * TILE, (d.x1 - d.x0 + 1) * TILE, (d.y1 - d.y0 + 1) * TILE), acc: 0 });
    }
    for (const c of room.currents ?? []) {
      this.currents.push({ rect: new Phaser.Geom.Rectangle(c.x0 * TILE, c.y0 * TILE, (c.x1 - c.x0 + 1) * TILE, (c.y1 - c.y0 + 1) * TILE), vx: c.vx });
    }
    // a linha d'água corre com a correnteza do trecho
    for (const w of this.surfaces) w.vx = this.flowAt(w.sprite.x + w.sprite.width / 2, w.sprite.y + 4);
    // a cáustica anda com a linha d'água de cima (trechos vizinhos no mesmo ritmo, sem costura)
    for (const w of this.caustics) {
      const top = this.surfaces.find((sf) => w.sprite.x >= sf.sprite.x - 1 && w.sprite.x < sf.sprite.x + sf.sprite.width && Math.abs(sf.sprite.y + 2 - w.sprite.y) < 4);
      w.vx = top ? top.vx : this.flowAt(w.sprite.x + w.sprite.width / 2, w.sprite.y + 4);
    }
    const logs = s.level.spawns.filter((sp) => sp.kind === '[');
    logs.forEach((sp, i) => this.addLog(sp.x, sp.ty, room.logs?.[i] ?? null, i));
    if (this.present.length) {
      // flocos de cinza e pétala seca, caindo devagar e rodando no ar parado
      this.ash = s.add.particles(0, 0, 'px', {
        lifespan: { min: 1800, max: 3200 },
        speedX: { min: -16, max: 16 },
        speedY: { min: 14, max: 38 },
        scaleX: { min: 1.2, max: 2.4 },
        scaleY: { min: 0.8, max: 1.4 },
        rotate: { min: 0, max: 360 },
        alpha: { start: 0.85, end: 0 },
        tint: [0x8d8a84, 0xa7a39b, 0x6f6c67, 0xb9b2a6, 0x9c8f86],
        emitting: false,
      }).setDepth(DEPTH.front + 0.3);
    }
  }

  // ---------- texturas ----------
  private canvas(key: string, w: number, h: number, draw: (d: Uint8ClampedArray) => void) {
    const T = this.s.textures;
    if (T.exists(key)) return;
    const tex = T.createCanvas(key, w, h);
    if (!tex) return;
    const ctx = tex.getContext();
    const img = ctx.createImageData(w, h);
    draw(img.data);
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }

  private makeTextures() {
    // a cortina da queda: fios de água compridos, cada coluna no seu ritmo (o desenho emenda em cima e
    // embaixo, para correr sem costura)
    const sheet = (key: string, seed: number, dense: number) =>
      this.canvas(key, 48, 256, (d) => {
        const rand = rng(seed);
        const W = 48;
        const H = 256;
        const cols: { a: number; k1: number; k2: number; p1: number; p2: number }[] = [];
        for (let x = 0; x < W; x++) cols.push({ a: 0.35 + 0.65 * rand(), k1: 1 + Math.floor(rand() * 3), k2: 4 + Math.floor(rand() * 7), p1: rand() * 6.3, p2: rand() * 6.3 });
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            let a = 0;
            for (let dx = -1; dx <= 1; dx++) {
              const c = cols[(x + dx + W) % W];
              const v = 0.5 + 0.5 * Math.sin((Math.PI * 2 * c.k1 * y) / H + c.p1);
              const w = 0.5 + 0.5 * Math.sin((Math.PI * 2 * c.k2 * y) / H + c.p2);
              a += (dx === 0 ? 0.5 : 0.25) * c.a * (0.2 + 0.8 * Math.pow(v * w, 1.4));
            }
            const i = (y * W + x) * 4;
            const white = Math.min(1, a * 1.25);
            d[i] = 200 + 55 * white;
            d[i + 1] = 232 + 23 * white;
            d[i + 2] = 224 + 31 * white;
            d[i + 3] = Math.round(255 * Math.min(1, a * dense));
          }
        }
      });
    sheet('fall-back', 61, 0.9);
    sheet('fall-front', 67, 0.75);
    // o tronco boiando (desenhado em 2x): casca escura com sulcos, o topo molhado de luz, musgo e as
    // pontas cortadas com os anéis
    this.canvas('vale-log', 152, 40, (d) => {
      const rand = rng(43);
      const W = 152;
      const H = 40;
      const cy = 20;
      const R = 15;
      const grooves: number[] = [];
      for (let i = 0; i < 9; i++) grooves.push(rand() * 2 - 1);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const ey = (y - cy) / R;
          // as pontas: elipses de anéis
          const capL = Math.hypot((x - 10) / 6.5, ey);
          const capR = Math.hypot((x - (W - 10)) / 6.5, ey);
          const inBody = x >= 10 && x <= W - 10 && Math.abs(ey) <= 1;
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          if (capR <= 1) {
            const ring = 0.5 + 0.5 * Math.sin(capR * 22);
            r = 150 + 40 * ring;
            g = 112 + 30 * ring;
            b = 72 + 16 * ring;
            a = 1;
            if (capR > 0.86) {
              r = 74;
              g = 52;
              b = 36;
            }
          } else if (inBody || capL <= 1) {
            const lit = Math.max(0, -ey);
            let groove = 0;
            for (const gy of grooves) groove = Math.max(groove, Math.max(0, 1 - Math.abs(ey - gy * 0.9) * 9) * (0.5 + 0.5 * Math.sin(x * 0.11 + gy * 7)));
            const n = rand();
            r = 66 + 50 * lit - 30 * groove + n * 8;
            g = 46 + 36 * lit - 22 * groove + n * 6;
            b = 32 + 24 * lit - 16 * groove + n * 5;
            // musgo por cima, em manchas
            const moss = Math.max(0, Math.sin(x * 0.07 + 1) * Math.sin(x * 0.023) - 0.35) * Math.max(0, -ey - 0.2) * 2.2;
            r = r * (1 - moss) + 86 * moss;
            g = g * (1 - moss) + 118 * moss;
            b = b * (1 - moss) + 54 * moss;
            // o brilho molhado no alto
            if (ey < -0.62 && ey > -0.82) {
              r += 40;
              g += 40;
              b += 34;
            }
            // a sombra embaixo (a parte dentro d'água fica mais escura)
            if (ey > 0.25) {
              const k = Math.min(1, (ey - 0.25) * 1.6);
              r *= 1 - 0.55 * k;
              g *= 1 - 0.45 * k;
              b *= 1 - 0.35 * k;
            }
            a = 1;
          }
          d[i] = Math.max(0, Math.min(255, r));
          d[i + 1] = Math.max(0, Math.min(255, g));
          d[i + 2] = Math.max(0, Math.min(255, b));
          d[i + 3] = Math.round(255 * a);
        }
      }
    });
    // o anel de água em volta do tronco
    this.canvas('vale-ripple', 96, 12, (d) => {
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 96; x++) {
          const e = Math.hypot((x - 48) / 48, (y - 6) / 6);
          const ring = Math.max(0, 1 - Math.abs(e - 0.82) * 7);
          const i = (y * 96 + x) * 4;
          d[i] = 230;
          d[i + 1] = 255;
          d[i + 2] = 244;
          d[i + 3] = Math.round(200 * ring);
        }
      }
    });
  }

  // ---------- a água funda ----------
  // pintada pela profundidade (Decor.paintWater); na gruta escura, quase preta, só com a luz que entra pela
  // cortina d'água
  private drawWater() {
    const s = this.s;
    const w = paintWater(s, s.level, WATER_LOOKS.vale!, s.room.id === 'gruta' ? 0.45 : 1);
    for (const sprite of w.surfaces) this.surfaces.push({ sprite, vx: 0 });
    for (const sprite of w.caustics) this.caustics.push({ sprite, vx: 0 });
  }

  // ---------- quedas d'água ----------
  private addFall(r: Rect) {
    const s = this.s;
    const L = s.level;
    const x = r.x0 * TILE;
    const w = (r.x1 - r.x0 + 1) * TILE;
    const y = r.y0 * TILE;
    const h = (r.y1 + 1 - r.y0) * TILE;
    // onde a água bate: a linha d'água do poço (ou o chão)
    const cx = Math.floor((x + w / 2) / TILE);
    const below = L.waterAt(cx * TILE + 8, (r.y1 + 1) * TILE + 4);
    const foot = below ? below.surface : (r.y1 + 1) * TILE;
    // atrás do cavaleiro a cortina cheia; na frente, fios mais ralos (ele aparece dentro da água)
    const back = s.add.tileSprite(x, y, w, foot - y, 'fall-back').setOrigin(0).setAlpha(0.82).setDepth(DEPTH.front + 0.3);
    const front = s.add.tileSprite(x - 2, y, w + 4, foot - y, 'fall-front').setOrigin(0).setAlpha(0.42).setDepth(DEPTH.water - 0.4);
    front.tilePositionX = 17;
    // a névoa do pé da queda: nuvens brancas e moles, que respiram
    const mist: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < 3; i++) {
      mist.push(s.add.image(x + w / 2 + (i - 1) * w * 0.7, foot - 6 - i * 4, 'glow').setScale(2.2 + i * 0.6, 1.4).setTint(0xf2fff8)
        .setAlpha(0.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.water + 0.3));
    }
    this.falls.push({ r, x, y, w, h, back, front, mist, foot, acc: 0 });
  }

  // ---------- troncos boiando ----------
  private addLog(x: number, ty: number, seg: [number, number] | null, i: number) {
    const s = this.s;
    const L = s.level;
    const surface = L.waterAt(x, ty * TILE + 8)?.surface ?? ty * TILE + 3;
    const zone = s.add.zone(x, surface - 3, 64, 8);
    s.physics.add.existing(zone);
    const body = zone.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    // só o alto segura: por baixo e pelos lados ele atravessa (nada por baixo dele, pula de lado)
    body.checkCollision.down = false;
    body.checkCollision.left = false;
    body.checkCollision.right = false;
    const img = s.add.image(x, surface, 'vale-log').setScale(0.5).setOrigin(0.5, 0.42).setDepth(DEPTH.enemy - 0.5);
    const ripple = s.add.image(x, surface + 1, 'vale-ripple').setScale(0.9, 1).setAlpha(0.5).setDepth(DEPTH.water + 0.2);
    this.logs.push({ zone, body, img, ripple, seg: seg ? [seg[0] * TILE, (seg[1] + 1) * TILE] : null, home: x, surface, load: 0, sink: 0, rise: 1, ph: i * 1.7 });
  }

  // a correnteza num ponto (px/s para o lado)
  flowAt(x: number, y: number) {
    for (const c of this.currents) if (c.rect.contains(x, y)) return c.vx;
    return 0;
  }

  update(dt: number) {
    const s = this.s;
    const p = s.player;
    this.time += dt;
    if (!this.linked) {
      this.linked = true;
      for (const l of this.logs) s.physics.add.collider(p.zone, l.zone);
    }
    const view = s.cameras.main.worldView;
    this.updateFalls(dt, p, view);
    this.updateDrafts(dt, p, view);
    // a correnteza leva quem está na água (nadando ou andando no raso)
    p.current = p.swim || p.inWater ? this.flowAt(p.x, p.body.center.y) : 0;
    this.updateLogs(dt, p);
    this.updatePresent(dt, p);
    for (const w of this.surfaces) w.sprite.tilePositionX -= (w.vx * 0.9 + 6) * dt;
    this.caustics.forEach((w, i) => {
      w.sprite.tilePositionX -= (w.vx * 0.6 + (i % 2 ? -7 : 5)) * dt;
      w.sprite.tilePositionY = Math.sin(this.time * 0.6 + (i % 2)) * 6;
    });
    // pétalas e folhas descendo o rio, só no trecho que aparece
    if (this.currents.length) {
      this.driftAcc += dt * 1.6;
      while (this.driftAcc >= 1) {
        this.driftAcc -= 1;
        const sp = this.surfaces[Math.floor(Math.random() * this.surfaces.length)];
        if (!sp || !Phaser.Geom.Rectangle.Overlaps(sp.sprite.getBounds(), view) || Math.abs(sp.vx) < 1) continue;
        const x = Math.max(sp.sprite.x, view.x) + Math.random() * Math.min(sp.sprite.width, view.width);
        this.drift.emitParticleAt(x, sp.sprite.y + 1);
      }
      this.drift.forEachAlive((pt) => {
        pt.velocityX = this.flowAt(pt.x, pt.y + 6) * 0.9;
        pt.velocityY = 0;
      }, this);
    }
  }

  private updateFalls(dt: number, p: Player, view: Phaser.Geom.Rectangle) {
    const b = p.body;
    let push = 0;
    for (const f of this.falls) {
      f.back.tilePositionY -= 330 * dt;
      f.front.tilePositionY -= 470 * dt;
      // o cavaleiro dentro da queda: a água empurra para baixo e espirra nos ombros
      const inside = p.x > f.x - 3 && p.x < f.x + f.w + 3 && b.bottom > f.y && b.top < f.foot;
      if (inside) {
        push = C.fallPush;
        if (Math.random() < dt * 30) this.spray.explode(1, p.x + (Math.random() - 0.5) * 14, b.top + 2);
      }
      const show = f.x + f.w > view.x - 40 && f.x < view.right + 40 && f.foot > view.y - 40 && f.y < view.bottom + 40;
      if (!show) continue;
      const t = this.time;
      f.mist.forEach((m, i) => m.setAlpha(0.16 + 0.06 * Math.sin(t * 1.3 + i * 2)).setScale(2.2 + i * 0.6 + 0.2 * Math.sin(t * 0.9 + i), 1.4));
      // a espuma e os respingos no pé
      f.acc += dt * (14 + f.w * 0.3);
      while (f.acc >= 1) {
        f.acc -= 1;
        this.foam.explode(1, f.x + Math.random() * f.w, f.foot - 2);
        if (Math.random() < 0.6) this.spray.explode(1, f.x + Math.random() * f.w, f.foot - 1);
      }
    }
    p.fall = push;
  }

  // a névoa do lado das quedas sobe: com a capa aberta, ele sobe junto
  private updateDrafts(dt: number, p: Player, view: Phaser.Geom.Rectangle) {
    let rise = 0;
    for (const d of this.drafts) {
      if (d.rect.contains(p.x, p.body.center.y)) rise = RISE;
      if (!Phaser.Geom.Rectangle.Overlaps(d.rect, view)) continue;
      const r = Phaser.Geom.Rectangle.Intersection(d.rect, view);
      d.acc += dt * 30 * (r.height / 300 + 0.3);
      while (d.acc >= 1) {
        d.acc -= 1;
        this.rising.explode(1, r.x + Math.random() * r.width, r.y + Math.random() * r.height);
      }
    }
    p.draft = rise;
  }

  private updateLogs(dt: number, p: Player) {
    const pb = p.body;
    for (const l of this.logs) {
      const b = l.body;
      // ele está de pé em cima?
      const on = pb.blocked.down && Math.abs(pb.bottom - b.top) < 3 && pb.right > b.left && pb.left < b.right;
      l.load += ((on ? 1 : 0) - l.load) * Math.min(1, dt * (on ? 9 : 4));
      let tx = b.center.x;
      let vx = 0;
      if (l.seg) {
        if (l.sink > 0) {
          // afundando no fim do trecho: some e volta no começo
          l.sink += dt / 1.1;
          if (l.sink >= 1) {
            l.sink = 0;
            l.rise = 0;
            b.reset(l.seg[0] + 36, l.surface - 3);
          }
        } else {
          vx = this.flowAt(b.center.x, l.surface + 6) * 0.72 || 30;
          if (b.right >= l.seg[1] - 2) {
            l.sink = 0.001;
            this.s.splash(b.center.x, l.surface);
          }
        }
        l.rise = Math.min(1, l.rise + dt / 0.8);
      } else {
        // no lago: boia no lugar, rodando devagar
        tx = l.home + Math.sin(this.time * 0.32 + l.ph) * 20;
        vx = (tx - b.center.x) * 2;
      }
      const sinking = l.sink > 0 ? l.sink : 1 - l.rise;
      const ty = l.surface - 3 + Math.sin(this.time * 1.7 + l.ph) * 1.4 + l.load * 4 + sinking * 16;
      b.setVelocity(vx, (ty - b.center.y) * 9);
      // afundando (ou voltando) o tronco não segura ninguém
      b.checkCollision.up = sinking < 0.4;
      l.img.setPosition(b.center.x, b.center.y + 3).setAlpha(1 - sinking).setRotation(Math.sin(this.time * 1.1 + l.ph) * 0.015 - l.load * 0.01);
      l.ripple.setPosition(b.center.x, l.surface + 1).setAlpha((0.35 + 0.15 * Math.sin(this.time * 2 + l.ph)) * (1 - sinking));
    }
  }

  // O presente cinzento: dentro de um trecho onde a lembrança falha, o cinza abre em volta dele e o segue;
  // fora, fecha devagar onde ele deixou. As copas de flor que o cinza alcança caem (a árvore fica seca) e
  // a cinza fica no ar enquanto ele está lá dentro
  private updatePresent(dt: number, p: Player) {
    if (!this.present.length) return;
    const P = this.pres;
    const cy = p.body.center.y;
    const inside = !p.dead && this.present.some((r) => r.contains(p.x, cy));
    if (inside) {
      if (P.k < 0.05) P.r = 50;
      P.x = p.x;
      P.y = cy;
      P.k = Math.min(1, P.k + dt / 0.45);
      P.r = Math.min(210, P.r + dt * 380);
      this.s.thinkOnce('vale:presente', 'Por um instante o vale ficou cinza e seco. É assim que ele está agora, fora da lembrança.');
    } else P.k = Math.max(0, P.k - dt / 1.3);
    const f = this.s.xp?.feed;
    if (f) {
      f.pres[0] = P.x;
      f.pres[1] = P.y;
      f.pres[2] = P.r;
      f.pres[3] = P.k;
    } else if (this.s.game.renderer.type === Phaser.WEBGL) {
      const cam = this.s.cameras.main;
      if (P.k > 0 && !this.greyFx) this.greyFx = cam.postFX.addColorMatrix();
      if (this.greyFx) {
        this.greyFx.grayscale(0.92);
        this.greyFx.alpha = P.k * 0.75;
        if (P.k <= 0) {
          cam.postFX.remove(this.greyFx as unknown as Phaser.FX.Controller);
          this.greyFx = null;
        }
      }
    }
    for (const b of this.blooms) {
      const d = Math.hypot(b.x - P.x, (b.y - P.y) * 0.7);
      const a = P.k * (1 - Phaser.Math.Clamp((d - (P.r - 40)) / 80, 0, 1));
      // a flor cai quando o cinza chega nela
      if (a > b.bare + 0.12 && this.ash) this.ash.emitParticleAt(b.x + (Math.random() - 0.5) * 60, b.y + (Math.random() - 0.5) * 36, 4);
      b.bare = a;
      for (const g of b.gs) g.setAlpha(1 - a);
    }
    if (this.ash && P.k > 0.3) {
      this.ashAcc += dt * 18 * P.k;
      while (this.ashAcc >= 1) {
        this.ashAcc -= 1;
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * P.r * 0.9;
        this.ash.emitParticleAt(P.x + Math.cos(ang) * rr, P.y + Math.sin(ang) * rr * 0.8 - 30);
      }
    }
  }

  // cada árvore 'T': o tronco do pé até acima do galho mais alto, os galhos do mapa saindo dele (o pé de
  // cada galho é grosso e afina para a ponta) e a copa de flor rosa em volta das pontas e no alto. As
  // árvores dos trechos do presente têm a copa à parte, para cair quando o cinza chega
  private drawTrees() {
    const s = this.s;
    const L = s.level;
    const rand = rng(s.room.id.length * 977 + L.w);
    const trunks = L.spawns.filter((sp) => sp.kind === 'T');
    if (!trunks.length) return;
    const branches: Span[] = L.spans((x, y) => L.ch(x, y) === '-');
    const wood = s.add.graphics().setDepth(DEPTH.prop);
    const limbs = s.add.graphics().setDepth(DEPTH.tiles + 0.2);
    const sharedBack = s.add.graphics().setDepth(DEPTH.prop - 0.1);
    const sharedFront = s.add.graphics().setDepth(DEPTH.front + 0.2);
    const pinks = [0xf6b3cc, 0xf29bbb, 0xfbd0de, 0xe98aae, 0xffe3ec];
    const blossom = (g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number) => {
      for (let k = 0; k < 14; k++) {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * r;
        const rr = 3 + rand() * r * 0.35;
        g.fillStyle(pinks[Math.floor(rand() * pinks.length)], 0.9).fillCircle(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, rr);
      }
      g.fillStyle(0xffffff, 0.7).fillCircle(cx - r * 0.25, cy - r * 0.3, 2.5);
    };
    for (const t of trunks) {
      const own = branches.filter((b) => b.y < t.ty && (b.x1 + 1 === t.tx || b.x0 - 1 === t.tx));
      const top = own.length ? Math.min(...own.map((b) => b.y)) - 2 : t.ty - 5;
      const x = t.x;
      const base = t.y + 2;
      const yTop = top * TILE;
      let bloomBack = sharedBack;
      let bloomFront = sharedFront;
      if (this.present.some((r) => r.contains(x, t.y - 8))) {
        bloomBack = s.add.graphics().setDepth(DEPTH.prop - 0.1);
        bloomFront = s.add.graphics().setDepth(DEPTH.front + 0.2);
        this.blooms.push({ x, y: (yTop + base) / 2, gs: [bloomBack, bloomFront], bare: 0 });
      }
      // o tronco afina para cima, com a casca escura e a luz do lado do sol
      const w0 = 18;
      const w1 = 9;
      for (let y = yTop; y < base; y++) {
        const k = (y - yTop) / Math.max(1, base - yTop);
        const w = w1 + (w0 - w1) * k;
        wood.fillStyle(0x4a3226, 1).fillRect(x - w / 2, y, w, 1);
        wood.fillStyle(0x7a5640, 1).fillRect(x - w / 2, y, 2, 1);
        wood.fillStyle(0x2e1f18, 1).fillRect(x + w / 2 - 2, y, 2, 1);
      }
      // a raiz alarga no chão
      wood.fillStyle(0x4a3226, 1).fillTriangle(x - 16, base, x - 5, base - 12, x - 2, base).fillTriangle(x + 16, base, x + 5, base - 12, x + 2, base);
      // os galhos do mapa: saem do tronco e afinam até a ponta (a tábua de pisar fica embaixo do traço)
      for (const b of own) {
        const right = b.x0 - 1 === t.tx;
        const y = b.y * TILE;
        const xa = right ? x + 3 : x - 3;
        const xb = right ? (b.x1 + 1) * TILE + 4 : b.x0 * TILE - 4;
        const n = Math.abs(xb - xa);
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          const px = xa + (right ? i : -i);
          const th = 7 - 4 * k;
          limbs.fillStyle(0x4a3226, 1).fillRect(px, y - 1 - Math.sin(k * Math.PI) * 1.5, 1, th);
          limbs.fillStyle(0x7a5640, 1).fillRect(px, y - 1 - Math.sin(k * Math.PI) * 1.5, 1, 1);
        }
        // flor na ponta e no meio do galho (atrás e um pouco na frente)
        blossom(bloomBack, xb, y - 10, 22);
        blossom(bloomBack, (xa + xb) / 2, y - 12, 16);
        blossom(bloomFront, xb + (right ? 6 : -6), y - 4, 8);
      }
      // a copa no alto
      blossom(bloomBack, x, yTop - 4, 34);
      blossom(bloomBack, x - 18, yTop + 8, 22);
      blossom(bloomBack, x + 18, yTop + 6, 22);
      blossom(bloomFront, x + 10, yTop + 14, 9);
    }
  }
}

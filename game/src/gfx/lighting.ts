import Phaser from 'phaser';
import { TILE } from '../config';
import type { GfxFlags } from '../systems/Graphics';
import type { Level } from '../world/Level';
import { LIGHT_SCALE, MAX_LIGHTS, MAX_WATER, type ExtremeFeed, type Look } from './extreme';

// Luz de cada sala no High e no EXTREME.
// - Máscara (1 texel a cada 4 px do mundo): R = rocha (vem da transparência do terreno pintado),
//   G = quanto o lugar é aberto (escurece perto das paredes e nos cantos), B = água.
// - Mapa de luz (1 texel a cada 8 px): as luzes fixas da sala (lampiões, velas, tochas, altares,
//   forja) com sombra suave nas paredes, a luz do céu nas partes abertas para cima e a luz que bate
//   na pedra e volta. Feito uma vez quando a sala abre, e de novo só se uma dessas luzes some ou anda.
// - Luzes que se mexem: os brilhos que aparecem durante o jogo (golpes, memórias, a sombra, armas
//   caídas) e uma luz fraca em volta do cavaleiro; as mais fortes perto da tela vão para o filtro.
// As luzes são lidas dos próprios brilhos do jogo (a imagem 'glow' somada na tela), então tudo o que
// já brilhava passa a iluminar em volta, sem lista à parte para manter.

const MASK = 4;
const CELL = 8;
// imagem do brilho: 64x64, raio 32
const GLOW_R = 32;

type RGB = [number, number, number];

interface Src {
  x: number;
  y: number;
  r: number;
  i: number;
  c: RGB;
}

interface Baked {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  a: number;
}

interface WaterRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  k: number;
}

// fonte de terreno para a máscara: imagem e o retângulo do mundo que ela cobre
export interface TerrainPiece {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function rgbOf(t: number): RGB {
  const r = ((t >> 16) & 255) / 255;
  const g = ((t >> 8) & 255) / 255;
  const b = (t & 255) / 255;
  const m = Math.max(r, g, b, 0.001);
  return [r / m, g / m, b / m];
}

// borrão de caixa separável (raio r, n passadas ~ gaussiana), no próprio array
function blur(a: Float32Array, w: number, h: number, r: number, passes = 2) {
  if (r < 1) return;
  const tmp = new Float32Array(a.length);
  const n = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += a[row + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / n;
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / n;
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
}

const isGlow = (o: Phaser.GameObjects.GameObject): o is Phaser.GameObjects.Image =>
  o instanceof Phaser.GameObjects.Image && o.texture?.key === 'glow' && o.blendMode === Phaser.BlendModes.ADD && o.scrollFactorX === 1;

export class RoomLighting {
  readonly feed: ExtremeFeed;
  private readonly W: number;
  private readonly H: number;
  private readonly mw: number;
  private readonly mh: number;
  private readonly lw: number;
  private readonly lh: number;
  private solid: Float32Array;
  private occ: Uint8Array;
  private baked: Baked[] = [];
  private bakedSet = new Set<Phaser.GameObjects.Image>();
  private glows: Phaser.GameObjects.Image[] = [];
  private scanT = 0;
  private dirtyT = -1;
  ready = false;
  private waters: WaterRect[] = [];
  // quanto o último mapa de luz levou (ms)
  bakeMs = 0;
  private rays = [
    { x: 0, y: 0, s: 0, id: null as Phaser.GameObjects.Image | null },
    { x: 0, y: 0, s: 0, id: null as Phaser.GameObjects.Image | null },
  ];

  constructor(
    private scene: Phaser.Scene,
    private level: Level,
    look: Look,
    private flags: GfxFlags,
    private terrain: () => TerrainPiece[],
  ) {
    this.W = level.widthPx;
    this.H = level.heightPx;
    this.mw = Math.ceil(this.W / MASK);
    this.mh = Math.ceil(this.H / MASK);
    this.lw = Math.ceil(this.W / CELL);
    this.lh = Math.ceil(this.H / CELL);
    this.solid = new Float32Array(this.mw * this.mh);
    this.occ = new Uint8Array(this.lw * this.lh);
    this.feed = {
      look,
      room: { w: this.W, h: this.H },
      lightTex: null,
      maskTex: null,
      light: flags.light,
      fog: flags.fog,
      reflections: flags.reflections,
      post: flags.post,
      lights: new Float32Array(MAX_LIGHTS * 4),
      lightColors: new Float32Array(MAX_LIGHTS * 3),
      lightCount: 0,
      rays: new Float32Array(8),
      water: new Float32Array(MAX_WATER * 4),
      waterK: new Float32Array(MAX_WATER),
      waterCount: 0,
      mem: new Float32Array(4),
      memMode: 0,
      pres: new Float32Array(4),
    };
    this.findWater(look);
    this.buildMask();
  }

  // ajustes trocados com a sala aberta
  setFlags(f: GfxFlags) {
    const rebake = f.shadows !== this.flags.shadows || f.light !== this.flags.light;
    this.flags = f;
    this.feed.light = f.light;
    this.feed.fog = f.fog;
    this.feed.reflections = f.reflections;
    this.feed.post = f.post;
    if (rebake) this.ready = false;
  }

  // o terreno mudou (parede falsa caiu, terreno em alta resolução chegou)
  refreshMask() {
    this.buildMask();
    this.ready = false;
  }

  // ---------- máscara ----------
  private buildMask() {
    const { mw, mh, level: L } = this;
    const solid = this.solid;
    solid.fill(0);
    let painted = false;
    try {
      const c = document.createElement('canvas');
      c.width = mw;
      c.height = mh;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        for (const p of this.terrain()) {
          if (!this.scene.textures.exists(p.key)) continue;
          const img = this.scene.textures.get(p.key).getSourceImage() as CanvasImageSource;
          ctx.drawImage(img, p.x / MASK, p.y / MASK, p.w / MASK, p.h / MASK);
          painted = true;
        }
        if (painted) {
          const d = ctx.getImageData(0, 0, mw, mh).data;
          for (let i = 0; i < mw * mh; i++) solid[i] = d[i * 4 + 3] / 255;
        }
      }
    } catch {
      painted = false;
    }
    // sem terreno pintado (ou sem poder ler a imagem): os tiles dizem onde é rocha
    if (!painted) {
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) solid[y * mw + x] = L.solidCell(Math.floor((x * MASK) / TILE), Math.floor((y * MASK) / TILE)) ? 1 : 0;
      }
    }
    // paredes falsas ainda de pé contam como rocha
    for (const b of L.breakables) {
      for (const [tx, ty] of b.cells) this.fillCells(tx, ty, 1);
    }
    // quanto o lugar é aberto: média do vazio em volta (uns 24 px)
    const open = new Float32Array(mw * mh);
    for (let i = 0; i < open.length; i++) open[i] = 1 - solid[i];
    blur(open, mw, mh, 5, 2);
    // obstáculos para as sombras, na grade do mapa de luz
    const { lw, lh } = this;
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        let s = 0;
        for (let k = 0; k < 4; k++) {
          const mx = Math.min(mw - 1, x * 2 + (k & 1));
          const my = Math.min(mh - 1, y * 2 + (k >> 1));
          s += solid[my * mw + mx];
        }
        this.occ[y * lw + x] = s > 2 ? 1 : 0;
      }
    }

    const tex = this.canvasTex('x-mask', mw, mh);
    if (!tex) return;
    const ctx = tex.getContext();
    const img = ctx.createImageData(mw, mh);
    const d = img.data;
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const i = y * mw + x;
        const g = Math.pow(Math.min(1, Math.max(0, (open[i] - 0.18) / 0.6)), 0.8);
        const water = L.ch(Math.floor((x * MASK) / TILE), Math.floor((y * MASK) / TILE)) === '~';
        d[i * 4] = Math.round(solid[i] * 255);
        d[i * 4 + 1] = Math.round(g * 255);
        d[i * 4 + 2] = water ? 255 : 0;
        d[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    this.feed.maskTex = tex;
  }

  private fillCells(tx: number, ty: number, v: number) {
    const k = TILE / MASK;
    for (let y = ty * k; y < (ty + 1) * k && y < this.mh; y++) {
      for (let x = tx * k; x < (tx + 1) * k && x < this.mw; x++) this.solid[y * this.mw + x] = v;
    }
  }

  private canvasTex(key: string, w: number, h: number) {
    const T = this.scene.textures;
    if (T.exists(key)) T.remove(key);
    const tex = T.createCanvas(key, w, h);
    tex?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return tex;
  }

  // ---------- água e chão molhado ----------
  private findWater(look: Look) {
    const L = this.level;
    for (const s of L.spans((x, y) => L.ch(x, y) === '~')) {
      const g = L.groundBelow(s.x0, s.y + 1);
      const y0 = s.y * TILE + 3;
      this.waters.push({ x0: s.x0 * TILE, x1: (s.x1 + 1) * TILE, y0, y1: Math.max(y0 + 10, (g < 0 ? s.y + 1 : g) * TILE), k: look.water });
    }
    if (look.wet > 0) {
      // chão de pedra debaixo da chuva: o primeiro chão de cada coluna vindo do céu
      const floors = L.skyFloors().filter((f) => L.solidCell(f.x, f.y));
      let run: { x0: number; x1: number; y: number } | null = null;
      const flush = () => {
        if (run && run.x1 - run.x0 >= 2) this.waters.push({ x0: run.x0 * TILE, x1: (run.x1 + 1) * TILE, y0: run.y * TILE, y1: run.y * TILE + 7, k: look.wet });
        run = null;
      };
      for (const f of floors) {
        if (run && f.y === run.y && f.x === run.x1 + 1) run.x1 = f.x;
        else {
          flush();
          run = { x0: f.x, x1: f.x, y: f.y };
        }
      }
      flush();
    }
  }

  // ---------- luzes ----------
  private srcOf(img: Phaser.GameObjects.Image): Src {
    const sc = Math.max(Math.abs(img.scaleX), Math.abs(img.scaleY));
    const rad = GLOW_R * sc;
    return { x: img.x, y: img.y, r: (rad * 1.35 + 10) * this.feed.look.reach, i: img.alpha * (img.visible ? 1 : 0), c: rgbOf(img.tintTopLeft) };
  }

  private scan() {
    this.glows = (this.scene.children.list as Phaser.GameObjects.GameObject[]).filter(isGlow);
  }

  // luzes paradas viram mapa de luz (com sombra); o resto fica para cada quadro
  private bake() {
    const t0 = performance.now();
    this.scan();
    this.baked = [];
    this.bakedSet.clear();
    const look = this.feed.look;
    const { lw, lh } = this;
    const R = new Float32Array(lw * lh);
    const G = new Float32Array(lw * lh);
    const B = new Float32Array(lw * lh);
    if (this.flags.light) {
      // brilho pequeno forte e halo largo fraco no mesmo ponto viram uma luz só
      const srcs: Src[] = [];
      for (const img of this.glows) {
        if (!img.visible || img.alpha < 0.05 || img.depth > 1.01) continue;
        const s = this.srcOf(img);
        this.baked.push({ img, x: img.x, y: img.y, a: img.alpha });
        this.bakedSet.add(img);
        const near = srcs.find((o) => Math.abs(o.x - s.x) < 10 && Math.abs(o.y - s.y) < 10);
        if (near) {
          near.r = Math.max(near.r, s.r);
          near.i = Math.min(1.3, near.i + s.i * 0.6);
        } else srcs.push(s);
      }
      for (const s of srcs) this.splat(s, R, G, B);
      if (look.bounce > 0 && this.flags.shadows) {
        // luz rebatida: a direta bem borrada, um pouco mais quente (pedra)
        const r2 = Float32Array.from(R);
        const g2 = Float32Array.from(G);
        const b2 = Float32Array.from(B);
        for (const a of [r2, g2, b2]) blur(a, lw, lh, 5, 2);
        const k = look.bounce;
        for (let i = 0; i < R.length; i++) {
          R[i] += r2[i] * k;
          G[i] += g2[i] * k * 0.92;
          B[i] += b2[i] * k * 0.82;
        }
      }
      // penumbra
      if (this.flags.shadows) for (const a of [R, G, B]) blur(a, lw, lh, 1, 2);
    }
    // luz do céu: desce reta até a primeira rocha (sumindo aos poucos num poço fundo) e espalha um pouco
    // nas beiradas
    const sk = look.sky;
    if (sk[0] + sk[1] + sk[2] > 0) {
      const S = new Float32Array(lw * lh);
      const fall = look.skyDepth;
      for (let x = 0; x < lw; x++) {
        for (let y = 0; y < lh; y++) {
          if (this.occ[y * lw + x]) break;
          S[y * lw + x] = fall > 0 ? 1 / (1 + y / fall) : 1;
        }
      }
      blur(S, lw, lh, 3, 2);
      for (let i = 0; i < S.length; i++) {
        R[i] += S[i] * sk[0];
        G[i] += S[i] * sk[1];
        B[i] += S[i] * sk[2];
      }
    }
    const tex = this.canvasTex('x-light', lw, lh);
    if (tex) {
      const ctx = tex.getContext();
      const img = ctx.createImageData(lw, lh);
      const d = img.data;
      const k = 255 / LIGHT_SCALE;
      for (let i = 0; i < R.length; i++) {
        d[i * 4] = Math.min(255, Math.round(R[i] * k));
        d[i * 4 + 1] = Math.min(255, Math.round(G[i] * k));
        d[i * 4 + 2] = Math.min(255, Math.round(B[i] * k));
        d[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      tex.refresh();
      this.feed.lightTex = tex;
    }
    this.ready = true;
    this.dirtyT = -1;
    this.bakeMs = performance.now() - t0;
  }

  // uma luz no mapa: forte no meio e caindo rápido, parada na rocha se as sombras estão ligadas
  private splat(s: Src, R: Float32Array, G: Float32Array, B: Float32Array) {
    const { lw, lh } = this;
    const cx = s.x / CELL;
    const cy = s.y / CELL;
    const rr = s.r / CELL;
    const x0 = Math.max(0, Math.floor(cx - rr));
    const x1 = Math.min(lw - 1, Math.ceil(cx + rr));
    const y0 = Math.max(0, Math.floor(cy - rr));
    const y1 = Math.min(lh - 1, Math.ceil(cy + rr));
    const shadows = this.flags.shadows;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d2 = (dx * dx + dy * dy) / (rr * rr);
        if (d2 >= 1) continue;
        let f = 1 - d2;
        f = (f * f) / (1 + 6 * d2);
        if (shadows && !this.visible(cx, cy, x + 0.5, y + 0.5)) continue;
        const k = f * s.i;
        const i = y * lw + x;
        R[i] += k * s.c[0];
        G[i] += k * s.c[1];
        B[i] += k * s.c[2];
      }
    }
  }

  // a luz chega neste texel? A rocha logo no começo (luz presa na parede) não conta, e o último
  // texel também não: a face da parede recebe a luz
  private visible(ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax;
    const dy = by - ay;
    const n = Math.ceil(Math.hypot(dx, dy) * 2);
    if (n <= 2) return true;
    const { lw, occ } = this;
    let start = true;
    for (let k = 1; k < n - 1; k++) {
      const t = k / n;
      const o = occ[Math.floor(ay + dy * t) * lw + Math.floor(ax + dx * t)];
      if (start) {
        if (!o) start = false;
        continue;
      }
      if (o) return false;
    }
    return true;
  }

  // ---------- a cada quadro ----------
  update(cam: Phaser.Cameras.Scene2D.Camera, player: { x: number; y: number } | null, dt: number) {
    if (!this.ready) this.bake();
    const f = this.feed;
    const v = cam.worldView;
    // luzes do mapa que sumiram ou andaram: refaz o mapa (um instante depois, uma vez só)
    if (this.dirtyT < 0) {
      for (const b of this.baked) {
        const img = b.img;
        if (!img.active || !img.visible || img.alpha < b.a * 0.35 || Math.abs(img.x - b.x) > 6 || Math.abs(img.y - b.y) > 6) {
          this.dirtyT = 0.25;
          break;
        }
      }
    } else if ((this.dirtyT -= dt) <= 0) this.ready = false;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scan();
      this.scanT = 0.2;
    }

    // luzes que se mexem perto da tela, as mais fortes primeiro
    const cand: (Src & { img: Phaser.GameObjects.Image | null })[] = [];
    if (f.light) {
      for (const img of this.glows) {
        if (!img.active || this.bakedSet.has(img) || !img.visible || img.alpha < 0.03) continue;
        const s = this.srcOf(img);
        if (s.x + s.r < v.x || s.x - s.r > v.right || s.y + s.r < v.y || s.y - s.r > v.bottom) continue;
        cand.push({ ...s, img });
      }
      cand.sort((a, b) => b.i * b.r - a.i * a.r);
    }
    let n = 0;
    const put = (s: Src) => {
      const o = n * 4;
      f.lights[o] = s.x;
      f.lights[o + 1] = s.y;
      f.lights[o + 2] = s.r;
      f.lights[o + 3] = s.i;
      f.lightColors[n * 3] = s.c[0];
      f.lightColors[n * 3 + 1] = s.c[1];
      f.lightColors[n * 3 + 2] = s.c[2];
      n++;
    };
    const look = f.look;
    if (f.light && player && look.knight > 0) {
      put({ x: player.x, y: player.y, r: look.knightR, i: look.knight, c: [1, 0.94, 0.84] });
      // nas salas escuras, um núcleo pequeno a mais: o próprio cavaleiro continua legível no breu
      const a = look.ambient;
      const dark = 1 - (a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11);
      if (dark > 0.2) put({ x: player.x, y: player.y - 3, r: 42, i: Math.min(0.48, dark * 0.75), c: [1, 0.97, 0.92] });
    }
    for (const s of cand) {
      if (n >= MAX_LIGHTS) break;
      put(s);
    }
    f.lightCount = n;

    this.updateRays(v, cand, dt);

    // água e chão molhado na tela
    let w = 0;
    if (f.reflections) {
      for (const r of this.waters) {
        if (w >= MAX_WATER) break;
        if (r.x1 < v.x || r.x0 > v.right || r.y1 < v.y || r.y0 > v.bottom) continue;
        f.water[w * 4] = r.x0;
        f.water[w * 4 + 1] = r.x1;
        f.water[w * 4 + 2] = r.y0;
        f.water[w * 4 + 3] = r.y1;
        f.waterK[w] = r.k;
        w++;
      }
    }
    f.waterCount = w;
  }

  // fachos de luz: das duas luzes mais fortes na tela, entrando e saindo devagar
  private updateRays(v: Phaser.Geom.Rectangle, cand: (Src & { img: Phaser.GameObjects.Image | null })[], dt: number) {
    const f = this.feed;
    const look = f.look;
    const pool: (Src & { img: Phaser.GameObjects.Image | null })[] = [];
    if (f.post && look.rays > 0) {
      for (const b of this.baked) {
        const img = b.img;
        if (!img.active || !img.visible) continue;
        const s = this.srcOf(img);
        pool.push({ ...s, img });
      }
      pool.push(...cand);
    }
    const inside = (s: Src) => {
      const m = Math.min(s.x - v.x, v.right - s.x, s.y - v.y, v.bottom - s.y);
      return Math.max(0, Math.min(1, (m + 30) / 90));
    };
    const scored = pool
      .map((s) => ({ s, k: s.i * Math.min(1, s.r / 120) * inside(s) }))
      .filter((o) => o.k > 0.05)
      .sort((a, b) => b.k - a.k);
    const picks: typeof scored = [];
    for (const o of scored) {
      if (picks.length >= 2) break;
      if (picks.some((p) => Math.abs(p.s.x - o.s.x) < 60 && Math.abs(p.s.y - o.s.y) < 60)) continue;
      picks.push(o);
    }
    const rate = Math.min(1, dt * 4);
    for (const slot of this.rays) {
      // a luz que este facho já segue continua com ele; senão ele apaga e vai para outra
      let mine = picks.find((p) => p.s.img === slot.id) ?? null;
      if (!mine && slot.s < 0.02) {
        mine = picks.find((p) => !this.rays.some((r) => r.id === p.s.img)) ?? null;
        if (mine) {
          slot.id = mine.s.img;
          slot.x = mine.s.x;
          slot.y = mine.s.y;
        }
      }
      const target = mine ? look.rays * Math.min(1, mine.k * 1.5) : 0;
      if (mine) {
        slot.x = mine.s.x;
        slot.y = mine.s.y;
      }
      slot.s += (target - slot.s) * rate;
      if (!mine && slot.s < 0.02) slot.id = null;
    }
    for (let r = 0; r < 2; r++) {
      f.rays[r * 4] = this.rays[r].x;
      f.rays[r * 4 + 1] = this.rays[r].y;
      f.rays[r * 4 + 2] = this.rays[r].s;
    }
  }
}

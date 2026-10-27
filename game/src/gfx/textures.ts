import Phaser from 'phaser';
import { PAL, VIEW_H, VIEW_W } from '../config';
import { canvasRaster, dither, rng, type Raster } from './raster';

// Índices do tileset gerado por arte/tiles.py (uma linha de 50 tiles de 16px)
export const TILE_ONEWAY = 0;
export const TILE_SPIKE = 1;
export const TILE_SOLID = 2;
export const SOLID_VARIANTS = 3;
export const TILE_COUNT = TILE_SOLID + 16 * SOLID_VARIANTS;
// espessura da tábua da plataforma atravessável, em pixels
export const PLANK_H = 6;

// Texturas pequenas geradas em tempo de execução (efeitos e interface)
export function buildTextures(scene: Phaser.Scene) {
  const tex = scene.textures;
  add(tex, 'px', makePixel());
  add(tex, 'fog', makeFog());
  add(tex, 'shard', makeShard(false));
  add(tex, 'shard-empty', makeShard(true));
  add(tex, 'rain-far', makeRain(256, 256, 170, 5, 9, 0.2, 0.42, 11));
  add(tex, 'rain-near', makeRain(256, 256, 44, 13, 22, 0.32, 0.62, 12));
  add(tex, 'glow', makeGlow(64));
  add(tex, 'smoke', makeSmoke(32));
  add(tex, 'ripple', makeRipple());
  add(tex, 'petal-a', makePetal(0xf2a7c3, 0xffd9e6));
  add(tex, 'petal-b', makePetal(0xe58bb0, 0xf7c4d8));
  add(tex, 'vignette', makeVignette(VIEW_W, VIEW_H));
  add(tex, 'grain', makeGrain(128));
  add(tex, 'drop', makeDrop());
  add(tex, 'puddle', makePuddle());
  add(tex, 'beam', makeBeam());
  add(tex, 'shaft', makeShaft());
  add(tex, 'water', makeWater());
  for (let n = 0; n <= 3; n++) add(tex, `mask-icon-${n}`, makeMaskIcon(n));
  add(tex, 'amber-bead', makeBead(false));
  add(tex, 'amber-bead-empty', makeBead(true));
  add(tex, 'light-pip', makeLightPip(false));
  add(tex, 'light-pip-empty', makeLightPip(true));
  add(tex, 'relic-light', makeLightRelic());
  add(tex, 'lume', makeLume());
  add(tex, 'light-ring', makeLightRing());
  add(tex, 'shard-drop', makeShardDrop());
  // moedas: quatro quadros do giro lado a lado
  for (const [key, c] of [['coin', COIN_SMALL], ['coin-big', COIN_BIG]] as const) {
    const canvas = makeCoin(c);
    add(tex, key, canvas);
    const s = c.frames[0].length;
    const t = tex.get(key);
    for (let i = 0; i < 4; i++) t.add(i, 0, i * s, 0, s, s);
  }
}

// ícone da moeda grande para a interface em HTML (contador e preços do Cobrador)
export function coinIconUrl() {
  const s = COIN_BIG.frames[0].length;
  const src = makeCoin(COIN_BIG);
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  c.getContext('2d')!.drawImage(src, 0, 0, s, s, 0, 0, s, s);
  return c.toDataURL();
}

function add(tex: Phaser.Textures.TextureManager, key: string, canvas: HTMLCanvasElement) {
  if (tex.exists(key)) tex.remove(key);
  tex.addCanvas(key, canvas);
}

// Moedas do dízimo, desenhadas à mão: de frente, inclinada, de lado e inclinada para o outro lado.
// '#' borda, 'g' ouro, 'h' brilho, 's' sombra, 'd' marca cunhada, '.' vazio
interface CoinArt {
  frames: string[][];
  pal: Record<string, number>;
}

const mirror = (rows: string[]) => rows.map((r) => [...r].reverse().join('').replace(/h/g, 'S').replace(/s/g, 'h').replace(/S/g, 's'));

const SMALL_TILT = ['..###..', '.#hgs#.', '.#hgs#.', '.#gds#.', '.#ggs#.', '.#gss#.', '..###..'];
const COIN_SMALL: CoinArt = {
  frames: [
    ['..###..', '.#hgg#.', '#hgggs#', '#ggdgs#', '#gggss#', '.#gss#.', '..###..'],
    SMALL_TILT,
    ['...#...', '..#h#..', '..#g#..', '..#g#..', '..#g#..', '..#s#..', '...#...'],
    mirror(SMALL_TILT),
  ],
  pal: { '#': 0x5a3a12, g: 0xd9a548, h: 0xffe6a8, s: 0xa8752a, d: 0x7a5418 },
};

// a moeda grande (vale cinco) tem um furo no meio
const BIG_TILT = ['...###...', '..#hgs#..', '.#hggss#.', '.#ggdss#.', '.#ggdss#.', '.#ggdss#.', '.#ggsss#.', '..#gss#..', '...###...'];
const COIN_BIG: CoinArt = {
  frames: [
    ['...###...', '.##hgg##.', '.#hgggs#.', '#hggdgss#', '#ggd.dgs#', '#gggdgss#', '.#ggsss#.', '.##gss##.', '...###...'],
    BIG_TILT,
    ['....#....', '...#h#...', '...#g#...', '...#g#...', '...#g#...', '...#g#...', '...#g#...', '...#s#...', '....#....'],
    mirror(BIG_TILT),
  ],
  pal: { '#': 0x5c3a0e, g: PAL.gold, h: 0xfff4d2, s: 0xc28a36, d: 0x5c3a0e },
};

function makeCoin(art: CoinArt) {
  const s = art.frames[0].length;
  const { canvas, r, commit } = canvasRaster(s * 4, s);
  art.frames.forEach((rows, f) => {
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const c = art.pal[ch];
        if (c !== undefined) r.set(f * s + x, y, c);
      });
    });
  });
  commit();
  return canvas;
}

// Caco de porcelana que cai dos inimigos (cura um fragmento de vida)
function makeShardDrop() {
  const { canvas, r, commit } = canvasRaster(11, 14);
  r.poly([[5, 1], [9.5, 5], [6, 13], [1.5, 8]], PAL.mask);
  r.poly([[5, 1], [9.5, 5], [6, 13], [5.5, 5]], PAL.maskShade);
  r.set(4, 4, 0xffffff);
  r.set(5, 3, 0xffffff);
  // a rachadura selada com ouro, como na máscara
  r.set(6, 7, PAL.gold);
  r.set(7, 8, PAL.gold);
  r.outline(PAL.ink);
  commit();
  return canvas;
}

function makePixel() {
  const { canvas, r, commit } = canvasRaster(2, 2);
  r.rect(0, 0, 2, 2, 0xffffff);
  commit();
  return canvas;
}

// Gotas de chuva inclinadas pelo vento; a textura repete nas duas direções
function makeRain(w: number, h: number, n: number, lmin: number, lmax: number, amin: number, amax: number, seed: number) {
  const { canvas, r, commit } = canvasRaster(w, h);
  const rand = rng(seed);
  for (let k = 0; k < n; k++) {
    const x0 = rand() * w;
    const y0 = rand() * h;
    const len = lmin + Math.floor(rand() * (lmax - lmin + 1));
    const a = amin + rand() * (amax - amin);
    for (let i = 0; i < len; i++) {
      const t = i / (len - 1);
      const x = Math.round(x0 - i * 0.25);
      const y = Math.round(y0 + i);
      r.set(((x % w) + w) % w, y % h, t > 0.8 ? 0xd7e2ff : 0xa9b8e2, Math.round(255 * a * (0.35 + 0.65 * t)));
    }
  }
  commit();
  return canvas;
}

// Brilho radial em degraus pontilhados (usado com mistura aditiva)
// smooth: degradê liso (High e EXTREME, onde a luz é de verdade e o pontilhado aumentado vira
// xadrez); sem ele, os seis degraus pontilhados do visual original
function makeGlow(s: number, smooth = false) {
  const { canvas, r, commit } = canvasRaster(s, s);
  const c = s / 2;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
      if (d >= 1) continue;
      const v = (1 - d) ** 1.8;
      if (smooth) {
        r.set(x, y, 0xffffff, Math.round(255 * v));
        continue;
      }
      const steps = 6;
      const lv = v * steps;
      const lo = Math.floor(lv);
      const q = (lo + (dither(x, y, lv - lo) ? 1 : 0)) / steps;
      if (q > 0) r.set(x, y, 0xffffff, Math.round(255 * q));
    }
  }
  commit();
  return canvas;
}

// troca o desenho do brilho de todas as luzes na hora (a mesma textura, então nada precisa ser refeito)
let glowSmooth = false;
export function smoothGlow(scene: Phaser.Scene, on: boolean) {
  if (on === glowSmooth) return;
  const t = scene.textures.get('glow') as Phaser.Textures.CanvasTexture;
  if (!t || !t.context) return;
  glowSmooth = on;
  const src = makeGlow(t.width, on);
  t.context.clearRect(0, 0, t.width, t.height);
  t.context.drawImage(src, 0, 0);
  t.refresh();
}

// Bolo de fumaça (incenso): bolhas que se juntam, claras em cima e escuras embaixo, com a borda
// pontilhada. Fica branco para ser tingido.
function makeSmoke(s: number) {
  const { canvas, r, commit } = canvasRaster(s, s);
  const c = s / 2;
  const blobs: [number, number, number][] = [
    [c, c + 1, s * 0.3],
    [c - s * 0.17, c + s * 0.06, s * 0.22],
    [c + s * 0.18, c + s * 0.08, s * 0.2],
    [c - s * 0.04, c - s * 0.16, s * 0.21],
    [c + s * 0.1, c - s * 0.08, s * 0.17],
  ];
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let v = 0;
      for (const [bx, by, br] of blobs) {
        const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by) / br;
        if (d < 1) v = Math.max(v, 1 - d * d);
      }
      if (v <= 0) continue;
      const a = Math.min(1, v * 1.6);
      const steps = 4;
      const lv = a * steps;
      const lo = Math.floor(lv);
      const q = (lo + (dither(x, y, lv - lo) ? 1 : 0)) / steps;
      if (q <= 0) continue;
      // luz de cima e da esquerda
      const lit = (c - y) * 0.7 + (c - x) * 0.4 > s * 0.06 ? 0xffffff : (c - y) * 0.7 + (c - x) * 0.4 < -s * 0.14 ? 0xb8b8c0 : 0xdcdce2;
      r.set(x, y, lit, Math.round(255 * q * 0.9));
    }
  }
  commit();
  return canvas;
}

function makeRipple() {
  const { canvas, r, commit } = canvasRaster(11, 3);
  for (let x = 1; x < 10; x++) r.set(x, 0, 0xc8d6f5, 150);
  r.set(0, 1, 0xc8d6f5, 200);
  r.set(10, 1, 0xc8d6f5, 200);
  for (let x = 2; x < 9; x++) r.set(x, 2, 0xc8d6f5, 110);
  commit();
  return canvas;
}

function makePetal(c: number, hi: number) {
  const { canvas, r, commit } = canvasRaster(4, 3);
  r.rect(1, 0, 2, 1, c);
  r.rect(0, 1, 4, 1, c);
  r.rect(1, 2, 2, 1, c);
  r.set(1, 1, hi);
  commit();
  return canvas;
}

// Escurece as bordas da tela (catacumbas)
// Vinheta lisa (sem degraus): escurece as bordas como numa lente antiga
function makeVignette(w: number, h: number) {
  const { canvas, r, commit } = canvasRaster(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2);
      const dy = (y + 0.5 - h / 2) / (h / 2);
      const d = Math.hypot(dx * 0.92, dy);
      const v = Math.max(0, Math.min(1, (d - 0.5) / 0.68)) ** 1.6;
      if (v > 0) r.set(x, y, 0x020205, Math.round(235 * v));
    }
  }
  commit();
  return canvas;
}

// Grão de filme: pontos claros e escuros com transparência baixa, sorteados uma vez
function makeGrain(s: number) {
  const { canvas, r, commit } = canvasRaster(s, s);
  const rand = rng(77);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const v = (rand() + rand() + rand() - 1.5) * 1.6;
      if (Math.abs(v) < 0.15) continue;
      r.set(x, y, v > 0 ? 0xffffff : 0x000000, Math.round(255 * Math.min(1, Math.abs(v) * 0.55)));
    }
  }
  commit();
  return canvas;
}

function makeDrop() {
  const { canvas, r, commit } = canvasRaster(3, 5);
  r.set(1, 0, 0xbcd4f0, 180);
  r.rect(1, 1, 1, 2, 0xd6e6ff);
  r.rect(0, 2, 3, 2, 0x9fbde0);
  r.set(1, 3, 0xf0f6ff);
  r.set(1, 4, 0x7d9cc4);
  commit();
  return canvas;
}

function makePuddle() {
  const { canvas, r, commit } = canvasRaster(28, 3);
  r.ellipse(14, 1.5, 14, 1.6, 0x1b2236, 220);
  for (let x = 4; x < 24; x++) if ((x * 7) % 5 !== 0) r.set(x, 0, 0x5c6a90, 200);
  r.rect(9, 1, 6, 1, 0x8b9ac2, 160);
  commit();
  return canvas;
}

// Facho de luz vindo do alto (catacumbas)
function makeBeam() {
  const W = 40, H = 220;
  const { canvas, r, commit } = canvasRaster(W, H);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const fall = (1 - t) ** 1.3;
    for (let x = 0; x < W; x++) {
      const e = 1 - Math.abs(x + 0.5 - W / 2) / (W / 2);
      const v = fall * Math.min(1, e * 2.2) * 0.55;
      const lv = v * 5;
      const lo = Math.floor(lv);
      const q = (lo + (dither(x, y, lv - lo) ? 1 : 0)) / 5;
      if (q > 0) r.set(x, y, 0xffffff, Math.round(255 * q));
    }
  }
  commit();
  return canvas;
}

// Facho do vitral quebrado: claro no meio e esmaecendo nas bordas, igual em toda a altura
// (é esticado do vitral até o chão e girado)
function makeShaft() {
  const W = 48;
  const { canvas, r, commit } = canvasRaster(W, 1);
  // sem pontilhado: esticado e girado, o pontilhado viraria listras tremendo
  for (let x = 0; x < W; x++) {
    const e = 1 - Math.abs(x + 0.5 - W / 2) / (W / 2);
    const v = Math.round(Math.min(1, e * 1.6) ** 1.4 * 12) / 12;
    if (v > 0) r.set(x, 0, 0xffffff, Math.round(255 * v));
  }
  commit();
  return canvas;
}

// Superfície da água do riacho (repete na horizontal)
function makeWater() {
  const W = 32, H = 16;
  const { canvas, r, commit } = canvasRaster(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = y / H;
      r.set(x, y, dither(x, y, t) ? 0x3b86b8 : 0x5aa9d6, 190);
    }
  }
  for (let x = 0; x < W; x++) r.set(x, 0, (x % 8) < 5 ? 0xd9f2ff : 0x9fd6f2, 235);
  for (const [x, y] of [[4, 4], [5, 4], [18, 7], [19, 7], [27, 3], [11, 10], [12, 10]]) r.set(x, y, 0xbfe6fb, 210);
  commit();
  return canvas;
}

function makeFog() {
  const W = 512, H = 140;
  const { canvas, r, commit } = canvasRaster(W, H);
  const rand = rng(5);
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < 26; i++) blobs.push([rand() * W, 40 + rand() * 70, 30 + rand() * 60]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (const [bx, by, br] of blobs) {
        for (const off of [-W, 0, W]) {
          const d = Math.hypot(x - bx - off, (y - by) * 1.8);
          if (d < br) v += (1 - d / br) * 0.5;
        }
      }
      v *= Math.min(1, y / 40);
      if (dither(x, y, Math.min(1, v) * 0.55)) r.set(x, y, 0x8a93ad, 40);
    }
  }
  commit();
  return canvas;
}

// Vida: fragmentos de porcelana
function makeShard(empty: boolean) {
  const { canvas, r, commit } = canvasRaster(12, 16);
  const pts: [number, number][] = [[6, 0], [11, 6], [7, 15], [1, 9]];
  if (empty) {
    r.poly(pts, 0x1a1c26);
  } else {
    r.poly(pts, PAL.mask);
    r.poly([[6, 0], [11, 6], [7, 15], [7, 6]], PAL.maskShade);
    r.set(6, 3, 0xffffff);
  }
  r.outline(empty ? 0x3a3e52 : PAL.ink);
  commit();
  return canvas;
}

// Conta de Âmbar dos poderes de memória: uma gota redonda de resina presa num aro de ouro.
// Vazia, fica só o encaixe escuro com o aro apagado
function makeBead(empty: boolean) {
  const { canvas, r, commit } = canvasRaster(9, 12);
  if (empty) {
    r.ellipse(4.5, 6.8, 3.6, 4.2, 0x1a1c26);
    r.set(3, 5, 0x2a2430);
  } else {
    r.ellipse(4.5, 6.8, 3.6, 4.2, 0xd27a26);
    // embaixo a resina é mais funda; no meio, a luz presa dentro dela
    r.poly([[1, 7.5], [8, 7.5], [7, 10.5], [4.5, 11.5], [2, 10.5]], 0x9a4c12);
    r.ellipse(4.8, 7.4, 1.6, 2, 0xffa63c);
    r.set(3, 4, 0xffe6a6);
    r.set(3, 5, 0xffe6a6);
    r.set(2, 6, 0xffd08a);
  }
  // o aro que prende a conta
  r.rect(3, 1, 3, 2, empty ? 0x3a3e52 : PAL.gold);
  r.set(4, 1, empty ? 0x4a4e62 : 0xfff4d2);
  r.outline(empty ? 0x3a3e52 : PAL.ink);
  commit();
  return canvas;
}

// Luz da Capa de Luz na interface: uma chama dourada pequena por voo que ainda resta. Gasta, fica só o
// contorno apagado
function makeLightPip(empty: boolean) {
  const { canvas, r, commit } = canvasRaster(8, 12);
  const pts: [number, number][] = [[4, 0], [6.5, 4.5], [7, 8], [5.5, 11], [2.5, 11], [1, 8], [1.5, 4.5]];
  if (empty) {
    r.poly(pts, 0x1a1c26);
  } else {
    r.poly(pts, 0xe0962e);
    r.poly([[4, 2.5], [5.8, 6], [5.8, 9], [4, 10.4], [2.2, 9], [2.2, 6]], 0xffc24a);
    r.ellipse(4, 8.2, 1.3, 1.7, 0xfff0b8);
  }
  r.outline(empty ? 0x3a3e52 : PAL.ink);
  commit();
  return canvas;
}

// A luz das nuvens que o retalho bebe nas Torres (a Capa de Luz): uma chama dourada parada no ar, com o
// miolo branco
function makeLightRelic() {
  const { canvas, r, commit } = canvasRaster(14, 22);
  r.poly([[7, 0], [11, 7], [12.5, 13], [10, 19], [7, 21], [4, 19], [1.5, 13], [3, 7]], 0xd9902e);
  r.poly([[7, 3], [10, 9], [10.5, 14], [8.5, 18.5], [7, 19.5], [5.5, 18.5], [3.5, 14], [4, 9]], 0xffc24a);
  r.ellipse(7, 14, 2.4, 3.6, 0xffeaa0);
  r.ellipse(7, 15, 1.2, 1.8, 0xffffff);
  r.outline(0x6b3a10);
  commit();
  return canvas;
}

// Lume das Torres: a luz das nuvens parada no ar, uma bola dourada de borda mole e miolo branco (o halo
// em volta é a imagem 'glow' somada por cima, que também ilumina a sala)
function makeLume() {
  const { canvas, r, commit } = canvasRaster(16, 16);
  r.ellipse(8, 8, 7.5, 7.5, 0xd9902e, 70);
  r.ellipse(8, 8, 6, 6, 0xffaa36, 170);
  r.ellipse(8, 8, 4.4, 4.4, 0xffcf62);
  r.ellipse(8, 8, 2.9, 2.9, 0xffecb0);
  r.ellipse(8, 8, 1.5, 1.5, 0xffffff);
  commit();
  return canvas;
}

// o voo da Capa de Luz: um anel de luz achatado que se abre embaixo dos pés (mais forte um pouco para
// dentro da borda, apagando para os dois lados)
function makeLightRing() {
  const { canvas, r, commit } = canvasRaster(40, 14);
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 40; x++) {
      const dx = (x + 0.5 - 20) / 19.5;
      const dy = (y + 0.5 - 7) / 6.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1 || d < 0.6) continue;
      r.set(x, y, d > 0.86 ? 0xffc24a : 0xfff0b8, Math.round(255 * Math.max(0, 1 - Math.abs(d - 0.82) / 0.22)));
    }
  }
  commit();
  return canvas;
}

// Ícone da máscara: cada memória recuperada sela uma rachadura com ouro
const CRACKS: [number, number][][] = [
  [[9, 2], [8, 6], [10, 9], [9, 12]],
  [[4, 15], [6, 18], [5, 21], [7, 24]],
  [[15, 14], [13, 17], [15, 20], [14, 23]],
];

function line(r: Raster, pts: [number, number][], c: number) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) r.set(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), c);
  }
}

function makeMaskIcon(n: number) {
  const W = 20, H = 27;
  const { canvas, r, commit } = canvasRaster(W, H);
  // rosto de porcelana: topo arredondado e queixo estreito
  r.ellipse(10, 10, 9, 10, PAL.mask);
  r.poly([[1.5, 11], [18.5, 11], [15, 22], [10, 26], [5, 22]], PAL.mask);
  // sombra do lado direito
  r.poly([[12, 1], [19, 9], [18, 13], [15, 22], [10, 26], [13, 14]], PAL.maskShade);
  // pedaço que falta (canto superior direito), com a borda quebrada em degraus
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < W; x++) {
      if (x > 12 + y * 0.85 + (y % 3 === 1 ? 1 : 0)) r.data[(y * W + x) * 4 + 3] = 0;
    }
  }
  // olhos
  r.rect(5, 11, 3, 2, PAL.ink);
  r.rect(12, 11, 3, 2, PAL.ink);
  r.set(5, 13, 0x5b5f73);
  r.set(14, 13, 0x5b5f73);
  CRACKS.forEach((pts, i) => line(r, pts, i < n ? PAL.gold : 0x8d8a85));
  r.outline(PAL.ink);
  commit();
  return canvas;
}

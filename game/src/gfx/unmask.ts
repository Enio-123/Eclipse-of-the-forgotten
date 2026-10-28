import Phaser from 'phaser';
import { cloneSheet } from './sheets';

// Final I: ele tirou a máscara no terraço. Sem uma folha nova para cada arma, o rosto sai da própria folha
// do cavaleiro, quadro a quadro: a porcelana (o cinza quente e claro, as duas metades e o ouro da rachadura
// entre elas) vira pele com a mesma luz, a rachadura some na pele em volta, os buracos dos olhos viram olhos
// na sombra do capuz e o alto vira cabelo. A folha nova (`<folha>-rosto`) tem os mesmos quadros e animações.

// a pele, da sombra do capuz à luz
const SKIN: [number, number, number][] = [[58, 38, 36], [104, 70, 60], [156, 110, 90], [196, 150, 122], [222, 184, 156]];
const HAIR: [number, number, number] = [46, 32, 28];
const PUPIL: [number, number, number] = [24, 16, 18];

function skin(t: number): [number, number, number] {
  const k = Math.min(1, Math.max(0, t)) * (SKIN.length - 1);
  const i = Math.min(SKIN.length - 2, Math.floor(k));
  const f = k - i;
  const a = SKIN[i];
  const b = SKIN[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

// vizinhos em cruz: crescer, encolher e tapar os buracos de uma máscara de pixels (fora do quadro conta como vazio)
function dilate(a: Uint8Array, w: number, h: number) {
  const o = new Uint8Array(a.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      o[i] = a[i] | (x > 0 ? a[i - 1] : 0) | (x < w - 1 ? a[i + 1] : 0) | (y > 0 ? a[i - w] : 0) | (y < h - 1 ? a[i + w] : 0);
    }
  }
  return o;
}

function erode(a: Uint8Array, w: number, h: number) {
  const o = new Uint8Array(a.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      o[i] = a[i] & (x > 0 ? a[i - 1] : 0) & (x < w - 1 ? a[i + 1] : 0) & (y > 0 ? a[i - w] : 0) & (y < h - 1 ? a[i + w] : 0);
    }
  }
  return o;
}

function fillHoles(a: Uint8Array, w: number, h: number) {
  const out = new Uint8Array(a.length).fill(1);
  const stack = new Int32Array(a.length);
  let sp = 0;
  const push = (i: number) => {
    if (a[i] || !out[i]) return;
    out[i] = 0;
    stack[sp++] = i;
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (sp) {
    const i = stack[--sp];
    const y = (i / w) | 0;
    const x = i - y * w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  return out;
}

// a máscara num quadro da folha (o retângulo dele na imagem): as cores de cada pixel, o que é opaco, a porcelana,
// o ouro e a peça da máscara (comp). Sem máscara no quadro, null
export interface MaskHit {
  R: Float32Array;
  G: Float32Array;
  B: Float32Array;
  L: Float32Array;
  op: Uint8Array;
  por: Uint8Array;
  goldAll: Uint8Array;
  comp: Uint8Array;
}

export function findMask(d: Uint8ClampedArray, W: number, x0: number, y0: number, w: number, h: number): MaskHit | null {
  const n = w * h;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  const L = new Float32Array(n);
  const op = new Uint8Array(n);
  const por = new Uint8Array(n);
  const goldAll = new Uint8Array(n);
  const cand = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const j = ((y0 + y) * W + x0 + x) * 4;
      const r = d[j];
      const g = d[j + 1];
      const b = d[j + 2];
      R[i] = r;
      G[i] = g;
      B[i] = b;
      L[i] = (r + g + b) / 3;
      op[i] = d[j + 3] > 160 ? 1 : 0;
      if (!op[i]) continue;
      // a porcelana: cinza quente e claro, pouco saturado (nem o vermelho do capuz, nem o aço frio)
      por[i] = r > 100 && r - b >= 4 && r - b <= 42 && r - g <= 18 && g - b >= -2 ? 1 : 0;
      // o ouro da rachadura (o vermelho do capuz tem pouco verde; o ouro, muito)
      goldAll[i] = r > 140 && g > 100 && r - b > 70 ? 1 : 0;
      cand[i] = por[i] | goldAll[i];
    }
  }
  // a rachadura corta a máscara em duas: as duas metades e o ouro entre elas são uma peça só; a maior peça no
  // alto do quadro é a máscara
  const lab = new Int32Array(n);
  const stack = new Int32Array(n);
  let id = 0;
  let best = 0;
  let bestScore = 0;
  for (let s = 0; s < n; s++) {
    if (!cand[s] || lab[s]) continue;
    id++;
    let sp = 0;
    stack[sp++] = s;
    lab[s] = id;
    let size = 0;
    let sy = 0;
    while (sp) {
      const i = stack[--sp];
      const y = (i / w) | 0;
      const x = i - y * w;
      size++;
      sy += y;
      if (x > 0 && cand[i - 1] && !lab[i - 1]) (lab[i - 1] = id), (stack[sp++] = i - 1);
      if (x < w - 1 && cand[i + 1] && !lab[i + 1]) (lab[i + 1] = id), (stack[sp++] = i + 1);
      if (y > 0 && cand[i - w] && !lab[i - w]) (lab[i - w] = id), (stack[sp++] = i - w);
      if (y < h - 1 && cand[i + w] && !lab[i + w]) (lab[i + w] = id), (stack[sp++] = i + w);
    }
    if (size < 25) continue;
    const score = size * (1.5 - sy / size / h);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  if (!best) return null;
  const comp = new Uint8Array(n);
  for (let i = 0; i < n; i++) comp[i] = lab[i] === best ? 1 : 0;
  return { R, G, B, L, op, por, goldAll, comp };
}

// um quadro da folha: devolve se achou a máscara
function unmaskRect(d: Uint8ClampedArray, W: number, x0: number, y0: number, w: number, h: number) {
  const hit = findMask(d, W, x0, y0, w, h);
  if (!hit) return false;
  const { R, G, B, L, op, por, goldAll, comp } = hit;
  const n = w * h;
  // o contorno cheio da máscara (com os olhos e a rachadura dentro)
  let full = erode(erode(dilate(dilate(comp, w, h), w, h), w, h), w, h);
  full = fillHoles(full, w, h);
  const m = new Uint8Array(n);
  const gold = new Uint8Array(n);
  const dark = new Uint8Array(n);
  let top = h;
  let bot = -1;
  for (let i = 0; i < n; i++) {
    m[i] = comp[i] & por[i];
    full[i] &= op[i];
    if (!full[i]) continue;
    const y = (i / w) | 0;
    if (y < top) top = y;
    if (y > bot) bot = y;
    gold[i] = goldAll[i];
    if (!m[i] && !gold[i] && L[i] < 90) dark[i] = 1;
  }
  const cr = new Float32Array(n);
  const cg = new Float32Array(n);
  const cb = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    cr[i] = R[i];
    cg[i] = G[i];
    cb[i] = B[i];
    if (!m[i]) continue;
    // a luz da porcelana vira a luz da pele (a sombra do capuz puxa para baixo)
    const c = skin(Math.min(1, Math.max(0, (L[i] - 120) / 110)) * 0.82 + 0.08);
    cr[i] = c[0];
    cg[i] = c[1];
    cb[i] = c[2];
  }
  // a rachadura some: cada pixel dela (e a beira meio dourada em volta) pega a média da pele vizinha
  const gd = dilate(gold, w, h);
  const hole = new Uint8Array(n);
  const known = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    hole[i] = gold[i] | (gd[i] & m[i] & (R[i] - B[i] > 30 ? 1 : 0));
    known[i] = m[i] & (hole[i] ^ 1);
  }
  const fill = new Uint8Array(n);
  for (let it = 0; it < 6; it++) {
    let left = 0;
    fill.fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!hole[i]) continue;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if ((!dx && !dy) || xx < 0 || xx >= w) continue;
            const q = yy * w + xx;
            if (!known[q]) continue;
            sr += cr[q];
            sg += cg[q];
            sb += cb[q];
            k++;
          }
        }
        if (!k) {
          left++;
          continue;
        }
        cr[i] = sr / k;
        cg[i] = sg / k;
        cb[i] = sb / k;
        fill[i] = 1;
      }
    }
    for (let i = 0; i < n; i++) {
      if (!fill[i]) continue;
      known[i] = 1;
      hole[i] = 0;
    }
    if (!left) break;
  }
  // os olhos: a sombra em volta e o escuro no meio
  const inEye = erode(dark, w, h);
  const ring = skin(0.14);
  for (let i = 0; i < n; i++) {
    if (!dark[i]) continue;
    const c = inEye[i] ? PUPIL : ring;
    cr[i] = c[0];
    cg[i] = c[1];
    cb[i] = c[2];
  }
  // o cabelo: a faixa de cima, escura, com a beira de baixo irregular
  const hh = Math.max(1, bot - top);
  for (let i = 0; i < n; i++) {
    if (!full[i]) continue;
    const y = (i / w) | 0;
    const x = i - y * w;
    if (y >= top + hh * (0.2 + 0.06 * Math.sin(x * 1.7))) continue;
    const k = 0.8 + 0.4 * Math.min(1, Math.max(0, (L[i] - 120) / 110));
    cr[i] = HAIR[0] * k;
    cg[i] = HAIR[1] * k;
    cb[i] = HAIR[2] * k;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!full[i] && !m[i]) continue;
      const j = ((y0 + y) * W + x0 + x) * 4;
      d[j] = cr[i];
      d[j + 1] = cg[i];
      d[j + 2] = cb[i];
    }
  }
  return true;
}

// os pixels da imagem de uma folha, num canvas que dá para ler e escrever
export function sheetPixels(tex: Phaser.Textures.Texture) {
  const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0);
  return { canvas, ctx, img: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

// a folha do cavaleiro sem a máscara (feita uma vez; depois vem pronta do gerenciador de texturas). Sem a folha
// carregada, ou sem como ler os pixels, devolve a de sempre
export function unmasked(scene: Phaser.Scene, key: string): string {
  const out = `${key}-rosto`;
  const tm = scene.textures;
  if (tm.exists(out)) return out;
  if (!tm.exists(key)) return key;
  const tex = tm.get(key);
  const px = sheetPixels(tex);
  if (!px) return key;
  const { canvas, ctx, img } = px;
  const names = tex.getFrameNames();
  for (const name of names) {
    const f = tex.get(name);
    unmaskRect(img.data, canvas.width, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
  }
  ctx.putImageData(img, 0, 0);
  const t = tm.addCanvas(out, canvas);
  if (!t) return key;
  for (const name of names) {
    const f = tex.get(name);
    const nf = t.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
    if (!nf || !f.trimmed) continue;
    const ss = (f as unknown as { data: { spriteSourceSize: { x: number; y: number; w: number; h: number } } }).data.spriteSourceSize;
    nf.setTrim(f.realWidth, f.realHeight, ss.x, ss.y, ss.w, ss.h);
  }
  cloneSheet(scene, key, out);
  return out;
}

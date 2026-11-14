import Phaser from 'phaser';

// Pintura em alta resolução do EXTREME (terreno de cada sala e fundos em 2x, em WebP), baixada só
// quando precisa. Os arquivos comprimidos ficam guardados na memória (são pequenos) e as vizinhas da
// sala atual já vêm antes de o cavaleiro chegar; na placa de vídeo só fica o que a sala usa agora.
// Se algo não baixar, ou a placa não aguentar o tamanho, fica a pintura normal.
//
// ECLIPSE: o terreno repintado em 3x (art2/eclipse.py). São muitas imagens, e o Artifact guarda no
// máximo 511 arquivos, então elas vêm juntas em poucos pacotes (assets/hd3/<pacote>.json, cada pedaço
// em WebP escrito em base64); um pacote baixa quando o cavaleiro chega perto de uma sala dele. Aqui
// dentro um pedaço desses tem nome "3:<pacote>/<id>" e segue o mesmo caminho dos outros. Se o pacote
// não baixar, a sala fica com a pintura 2x do EXTREME.
// Os fundos repintados em 3x (art2/ecl_*.py) vêm do mesmo jeito, um pacote por área (f-<área>).

export interface HdPiece {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Manifest {
  terrain: Record<string, { scale: number; pieces: HdPiece[] }>;
  backdrop: Record<string, { file: string; scale: number }>;
  // ECLIPSE: o pacote de cada sala e os pedaços dela (id dentro do pacote)
  terrain3?: Record<string, { scale: number; pack: string; pieces: { id: string; x: number; y: number; w: number; h: number }[] }>;
  // ECLIPSE: os fundos repintados em 3x (pacote e id dentro dele)
  backdrop3?: Record<string, { pack: string; id: string; scale: number }>;
  // ECLIPSE: os enfeites antigos (pixel art) repintados em 3x: pixels da pintura por pixel do mundo em
  // cada eixo e, nas folhas, o tamanho de um quadro na pintura
  props3?: Record<string, { pack: string; id: string; sx: number; sy: number; frame?: [number, number] }>;
}

export interface Prop3 {
  file: string;
  sx: number;
  sy: number;
  frame?: [number, number];
}

const BASE = 'assets/hd/';
const BASE3 = 'assets/hd3/';
let manifest: Manifest | null = null;
const terrain3 = new Map<string, { scale: number; pieces: HdPiece[] }>();
const backdrop3 = new Map<string, { file: string; scale: number }>();
const props3 = new Map<string, Prop3>();
const blobs = new Map<string, Promise<Blob | null>>();
const packs = new Map<string, Promise<Map<string, Blob> | null>>();
const uploads = new Map<string, Promise<boolean>>();

export const hdKey = (file: string) => `hd:${file}`;

export function setHdManifest(m: unknown) {
  const v = m as Partial<Manifest> | null;
  if (!v || typeof v !== 'object' || !v.terrain || !v.backdrop) return;
  manifest = v as Manifest;
  terrain3.clear();
  for (const [id, t] of Object.entries(manifest.terrain3 ?? {})) {
    if (!t || !t.pack || !Array.isArray(t.pieces) || !t.pieces.length) continue;
    terrain3.set(id, { scale: t.scale, pieces: t.pieces.map((p) => ({ file: `3:${t.pack}/${p.id}`, x: p.x, y: p.y, w: p.w, h: p.h })) });
  }
  backdrop3.clear();
  for (const [key, b] of Object.entries(manifest.backdrop3 ?? {})) {
    if (!b || !b.pack || !b.id || !(b.scale > 0)) continue;
    backdrop3.set(key, { file: `3:${b.pack}/${b.id}`, scale: b.scale });
  }
  props3.clear();
  for (const [key, q] of Object.entries(manifest.props3 ?? {})) {
    if (!q || !q.pack || !q.id || !(q.sx > 0) || !(q.sy > 0)) continue;
    const frame = Array.isArray(q.frame) && q.frame[0] > 0 && q.frame[1] > 0 ? ([q.frame[0], q.frame[1]] as [number, number]) : undefined;
    props3.set(key, { file: `3:${q.pack}/${q.id}`, sx: q.sx, sy: q.sy, frame });
  }
}

export function hdTerrain(id: string) {
  return manifest?.terrain[id] ?? null;
}

// ECLIPSE: o terreno da sala repintado em 3x (null se esta sala não tem)
export function hdTerrain3(id: string) {
  return terrain3.get(id) ?? null;
}

export function hdBackdrop(key: string) {
  return manifest?.backdrop[key] ?? null;
}

// ECLIPSE: o fundo repintado em 3x (null se esta camada não tem)
export function hdBackdrop3(key: string) {
  return backdrop3.get(key) ?? null;
}

// ECLIPSE: o enfeite repintado em 3x (null se este não tem)
export function hdProp3(key: string) {
  return props3.get(key) ?? null;
}

// arquivos de uma sala (terreno, parede falsa, pinheiros da floresta e os fundos que ela usa);
// com eclipse, o terreno e os fundos são os de 3x quando existem (os véus, os pinheiros e a parede
// continuam em 2x)
export function roomFiles(room: string, backdrops: string[], eclipse = false) {
  const files: string[] = [];
  const t3 = eclipse ? hdTerrain3(room) : null;
  for (const p of (t3 ?? hdTerrain(room))?.pieces ?? []) files.push(p.file);
  for (const id of [`${room}-secret`, `${room}-pinhos`, `${room}-parede`]) for (const p of hdTerrain(id)?.pieces ?? []) files.push(p.file);
  for (const k of backdrops) {
    const b = (eclipse ? hdBackdrop3(k) : null) ?? hdBackdrop(k);
    if (b) files.push(b.file);
  }
  return files;
}

// um pacote do ECLIPSE: baixa uma vez e vira os pedaços em WebP (aos poucos, para não travar um quadro)
function pack(name: string) {
  let p = packs.get(name);
  if (!p) {
    p = fetch(`${BASE3}${name}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : null))
      .then(async (data) => {
        if (!data || typeof data !== 'object') return null;
        const out = new Map<string, Blob>();
        for (const [id, b64] of Object.entries(data)) {
          if (typeof b64 !== 'string') continue;
          const bin = atob(b64);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          out.set(id, new Blob([u8], { type: 'image/webp' }));
          await new Promise((res) => setTimeout(res, 0));
        }
        return out;
      })
      .catch(() => null);
    packs.set(name, p);
    // falhou: tenta de novo da próxima vez
    p.then((m) => {
      if (!m) packs.delete(name);
    });
  }
  return p;
}

function blob(file: string) {
  let p = blobs.get(file);
  if (!p) {
    if (file.startsWith('3:')) {
      const cut = file.indexOf('/');
      p = pack(file.slice(2, cut)).then((m) => m?.get(file.slice(cut + 1)) ?? null);
    } else
      p = fetch(BASE + file)
        .then((r) => (r.ok ? r.blob() : null))
        .catch(() => null);
    blobs.set(file, p);
    // falhou: tenta de novo da próxima vez
    p.then((b) => {
      if (!b) blobs.delete(file);
    });
  }
  return p;
}

// baixa sem mandar para a placa (para as salas vizinhas)
export function prefetch(files: string[]) {
  for (const f of files) void blob(f);
}

async function upload(game: Phaser.Game, file: string): Promise<boolean> {
  const key = hdKey(file);
  if (game.textures.exists(key)) return true;
  const b = await blob(file);
  if (!b) return false;
  const url = URL.createObjectURL(b);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const max = (game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).getMaxTextureSize?.() ?? 4096;
    if (img.width > max || img.height > max) return false;
    if (!game.textures.exists(key)) game.textures.addImage(key, img);
    game.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    return true;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// garante as texturas na placa; devolve quais ficaram prontas
export async function ensure(game: Phaser.Game, files: string[]) {
  const ok = new Set<string>();
  // uma por vez: a subida para a placa não trava o quadro de uma vez só
  for (const f of files) {
    let p = uploads.get(f);
    if (!p) {
      p = upload(game, f);
      uploads.set(f, p);
    }
    if (await p) ok.add(f);
    else uploads.delete(f);
  }
  return ok;
}

// solta da placa o que a sala atual não usa (os arquivos comprimidos continuam guardados)
export function release(game: Phaser.Game, keep: string[]) {
  const k = new Set(keep.map(hdKey));
  for (const key of game.textures.getTextureKeys()) {
    if (!key.startsWith('hd:') || k.has(key)) continue;
    game.textures.remove(key);
    uploads.delete(key.slice(3));
  }
}

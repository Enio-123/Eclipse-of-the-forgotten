import Phaser from 'phaser';

// Pintura em alta resolução do EXTREME (terreno de cada sala e fundos em 2x, em WebP), baixada só
// quando precisa. Os arquivos comprimidos ficam guardados na memória (são pequenos) e as vizinhas da
// sala atual já vêm antes de o cavaleiro chegar; na placa de vídeo só fica o que a sala usa agora.
// Se algo não baixar, ou a placa não aguentar o tamanho, fica a pintura normal.

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
}

const BASE = 'assets/hd/';
let manifest: Manifest | null = null;
const blobs = new Map<string, Promise<Blob | null>>();
const uploads = new Map<string, Promise<boolean>>();

export const hdKey = (file: string) => `hd:${file}`;

export function setHdManifest(m: unknown) {
  const v = m as Partial<Manifest> | null;
  if (v && typeof v === 'object' && v.terrain && v.backdrop) manifest = v as Manifest;
}

export function hdTerrain(id: string) {
  return manifest?.terrain[id] ?? null;
}

export function hdBackdrop(key: string) {
  return manifest?.backdrop[key] ?? null;
}

// arquivos de uma sala (terreno, parede falsa e os fundos que ela usa)
export function roomFiles(room: string, backdrops: string[]) {
  const files: string[] = [];
  for (const id of [room, `${room}-secret`]) for (const p of hdTerrain(id)?.pieces ?? []) files.push(p.file);
  for (const k of backdrops) {
    const b = hdBackdrop(k);
    if (b) files.push(b.file);
  }
  return files;
}

function blob(file: string) {
  let p = blobs.get(file);
  if (!p) {
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

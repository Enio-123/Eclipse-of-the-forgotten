import Phaser from 'phaser';
import type { RoomDef } from '../world/rooms';
import { backdropKeys } from '../world/Backdrop';
import { dropSheet, loadSheet, setupSheet, sheetMeta } from './sheets';

// O que só a sala usa vem quando ela abre e sai da placa de vídeo quando ela fecha: o terreno pintado,
// a pedra das passagens secretas, a camada dos pinheiros, os fundos do tema e a folha do chefe. Antes
// tudo carregava na abertura do jogo (mais de 500 MB na placa); assim fica o que a sala atual precisa,
// e cada sala nova não pesa nas outras. O que não chegar (arquivo faltando) deixa a sala com os tiles,
// como antes de a pintura existir.

// as imagens que existem (as salas sem parede falsa ou sem pinheiros não têm o arquivo)
const ROOM_IMAGES = new Set([
  'terrain-ponte', 'terrain-catacumbas', 'terrain-nichos', 'terrain-memoria', 'terrain-sinos', 'terrain-cripta',
  'terrain-escadaria', 'terrain-praca', 'terrain-mercado', 'terrain-rua', 'terrain-telhados', 'terrain-nave', 'terrain-claustro', 'terrain-galeria', 'terrain-altar',
  'terrain-rua-secret', 'terrain-mercado-secret', 'terrain-telhados-secret', 'terrain-nave-secret', 'terrain-claustro-secret', 'terrain-galeria-secret',
  'terrain-poco', 'terrain-solitarias', 'terrain-celas', 'terrain-correntes', 'terrain-guarita', 'terrain-fuga', 'terrain-arena', 'terrain-mascara', 'terrain-celas-secret',
  'terrain-fosso', 'terrain-margem', 'terrain-abismo',
  'terrain-boca', 'terrain-trilhos', 'terrain-alagada', 'terrain-prensas', 'terrain-veio', 'terrain-espelhos', 'terrain-capataz',
  'terrain-encosta', 'terrain-pinhal', 'terrain-lago', 'terrain-mata', 'terrain-cabana', 'terrain-serra', 'terrain-clareira',
  'pinhos-encosta', 'pinhos-pinhal', 'pinhos-lago', 'pinhos-mata', 'pinhos-cabana', 'pinhos-serra', 'pinhos-clareira',
  'bridge-sky', 'bridge-far', 'bridge-far-rim', 'bridge-mid', 'bridge-mid-rim', 'bridge-fg', 'cat-far', 'cat-mid', 'mem-sky', 'mem-far', 'mem-mid',
  'city-sky', 'city-far', 'city-mid', 'claustro-mid', 'nave-far', 'nave-mid', 'prison-far', 'prison-mid', 'fosso-far', 'fosso-mid',
  'mine-far', 'mine-mid', 'snow-sky', 'snow-far', 'snow-mid', 'mata-far', 'mata-mid', 'serra-far', 'serra-mid',
]);

// as folhas dos chefes (grandes e cada uma usada numa sala só)
export const ROOM_SHEETS = new Set(['sineiro', 'arcebispo', 'carcereira', 'sombra', 'capataz', 'cacador', 'barqueiro']);

export function roomImages(room: RoomDef) {
  const keys = [`terrain-${room.id}`, `terrain-${room.id}-secret`, `pinhos-${room.id}`, ...backdropKeys(room.theme, room.id)];
  return keys.filter((k) => ROOM_IMAGES.has(k));
}

// sheets: as folhas que a sala usa (o chefe dela e, para o Necromante, os ecos que ele pode chamar)
export function queueRoom(scene: Phaser.Scene, room: RoomDef, sheets: string[]) {
  for (const key of roomImages(room)) if (!scene.textures.exists(key)) scene.load.image(key, `assets/${key}.png`);
  for (const key of sheets) {
    const meta = sheetMeta(scene, key);
    if (ROOM_SHEETS.has(key) && meta && !scene.textures.exists(key)) loadSheet(scene.load, key, meta);
  }
}

// com a sala carregada: monta o que chegou e solta o que ela não usa
export function settleRoom(scene: Phaser.Scene, room: RoomDef, sheets: string[]) {
  const imgs = roomImages(room);
  const hd = (scene.cache.json.get('hd') ?? {}) as Record<string, number>;
  for (const key of imgs) if (hd[key] && scene.textures.exists(key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  for (const key of sheets) setupSheet(scene, key);
  const keepImg = new Set(imgs);
  const keepSheet = new Set(sheets);
  for (const key of scene.textures.getTextureKeys()) {
    if (ROOM_IMAGES.has(key) && !keepImg.has(key)) scene.textures.remove(key);
    else if (ROOM_SHEETS.has(key) && !keepSheet.has(key)) dropSheet(scene, key);
  }
}

import Phaser from 'phaser';

// Folhas de personagens geradas pelas ferramentas de arte: como carregar e como montar as animações.
// A maioria carrega na abertura; as dos chefes só quando a sala deles abre (gfx/roomAssets.ts).

export interface SheetMeta {
  frameWidth: number;
  frameHeight: number;
  originX: number;
  originY: number;
  anims: Record<string, { start: number; count: number; fps: number; loop: boolean }>;
  // folha no traço liso: atlas com os quadros recortados (nomeados pelo número) e `scale` pixels por pixel do mundo
  frames?: Record<string, unknown>;
  scale?: number;
  // animações que param: quanto o último quadro segura a mais (s), para durar o mesmo depois das poses
  // de passagem
  holds?: Record<string, number>;
}

export const sheetMeta = (scene: Phaser.Scene, key: string) => scene.cache.json.get(`${key}-meta`) as SheetMeta | undefined;

export function loadSheet(load: Phaser.Loader.LoaderPlugin, key: string, meta: SheetMeta) {
  if (meta.frames) load.atlas(key, `assets/${key}.png`, `assets/${key}.json`);
  else load.spritesheet(key, `assets/${key}.png`, { frameWidth: meta.frameWidth, frameHeight: meta.frameHeight });
}

// a origem e a escala valem mesmo antes de a imagem chegar (os chefes leem ao nascer)
export function sheetInfo(scene: Phaser.Scene, key: string) {
  const meta = sheetMeta(scene, key);
  if (!meta) return;
  scene.registry.set(`${key}-origin`, { x: meta.originX, y: meta.originY });
  if (meta.frames) scene.registry.set(`${key}-scale`, 1 / (meta.scale ?? 1));
}

// as animações da folha (as que já existem ficam), com a imagem já carregada
export function setupSheet(scene: Phaser.Scene, key: string) {
  const meta = sheetMeta(scene, key);
  if (!meta || !scene.textures.exists(key)) return;
  for (const [name, a] of Object.entries(meta.anims)) {
    const k = `${key}-${name}`;
    if (scene.anims.exists(k)) continue;
    const frames = scene.anims.generateFrameNumbers(key, { start: a.start, end: a.start + a.count - 1 });
    const hold = meta.holds?.[name];
    if (hold && frames.length) frames[frames.length - 1] = { ...frames[frames.length - 1], duration: hold * 1000 };
    scene.anims.create({ key: k, frames, frameRate: a.fps, repeat: a.loop ? -1 : 0 });
  }
  sheetInfo(scene, key);
  // traço liso: filtro suave (a tela pode ter mais pixels que a folha)
  if (meta.frames) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
}

// uma cópia da folha com outra imagem e os mesmos quadros (o cavaleiro sem a máscara, gfx/unmask.ts): a mesma
// origem, a mesma escala e as mesmas animações, com o nome da cópia
export function cloneSheet(scene: Phaser.Scene, key: string, out: string) {
  const meta = sheetMeta(scene, key);
  if (!meta || !scene.textures.exists(out)) return;
  for (const [name, a] of Object.entries(meta.anims)) {
    const k = `${out}-${name}`;
    if (scene.anims.exists(k)) continue;
    const frames = scene.anims.generateFrameNumbers(out, { start: a.start, end: a.start + a.count - 1 });
    const hold = meta.holds?.[name];
    if (hold && frames.length) frames[frames.length - 1] = { ...frames[frames.length - 1], duration: hold * 1000 };
    scene.anims.create({ key: k, frames, frameRate: a.fps, repeat: a.loop ? -1 : 0 });
  }
  scene.registry.set(`${out}-origin`, { x: meta.originX, y: meta.originY });
  if (meta.frames) {
    scene.registry.set(`${out}-scale`, 1 / (meta.scale ?? 1));
    scene.textures.get(out).setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}

// tira a folha da placa de vídeo, com as animações dela
export function dropSheet(scene: Phaser.Scene, key: string) {
  const meta = sheetMeta(scene, key);
  for (const name of Object.keys(meta?.anims ?? {})) scene.anims.remove(`${key}-${name}`);
  if (scene.textures.exists(key)) scene.textures.remove(key);
}

// carrega uma folha fora da abertura da sala (o eco de chefe do Necromante); devolve se ficou pronta
export function ensureSheet(scene: Phaser.Scene, key: string): Promise<boolean> {
  if (scene.textures.exists(key)) {
    setupSheet(scene, key);
    return Promise.resolve(true);
  }
  const meta = sheetMeta(scene, key);
  if (!meta) return Promise.resolve(false);
  return new Promise((res) => {
    const done = () => {
      const ok = scene.textures.exists(key);
      if (ok) setupSheet(scene, key);
      res(ok);
    };
    scene.load.once(Phaser.Loader.Events.COMPLETE, done);
    loadSheet(scene.load, key, meta);
    scene.load.start();
  });
}

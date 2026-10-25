import Phaser from 'phaser';
import { buildTextures, coinIconUrl } from '../gfx/textures';
import { ui } from '../ui/ui';

interface SheetMeta {
  frameWidth: number;
  frameHeight: number;
  originX: number;
  originY: number;
  anims: Record<string, { start: number; count: number; fps: number; loop: boolean }>;
}

interface SlashMeta {
  w: number;
  h: number;
  ox: number;
  frames: number;
  fps: number;
}

// Folhas de personagens geradas pelas ferramentas de arte (arte/gerador)
const SHEETS = ['knight-scythe', 'knight-sword', 'knight-daggers', 'knight-bow', 'knight-badalo', 'penitent', 'figure', 'guard', 'crow', 'cobrador', 'sineiro'];
const IMAGES = [
  'title-sky', 'title-land', 'title-rim', 'clouds-far', 'clouds-near',
  'bridge-sky', 'bridge-far', 'bridge-far-rim', 'bridge-mid', 'bridge-mid-rim', 'bridge-fg', 'cat-far', 'cat-mid', 'mem-sky', 'mem-far', 'mem-mid',
  'tiles-bridge', 'tiles-catacomb', 'tiles-memory', 'terrain-ponte', 'terrain-catacumbas', 'terrain-memoria', 'terrain-sinos', 'terrain-cripta', 'arrow',
  'intro-back', 'intro-near', 'intro-fore', 'intro-beams',
  'deco-anchor', 'deco-balustrade', 'deco-balustrade-broken', 'deco-bracket', 'deco-chain', 'deco-gate', 'deco-lamp',
  'deco-lamp-off', 'deco-mirror', 'deco-post', 'deco-scaffold', 'deco-statue', 'deco-tree-big', 'deco-tree-green', 'deco-tree-pink',
  'deco-shrine', 'deco-pedestal', 'deco-portcullis', 'relic-wall', 'relic-double', 'memory', 'bell-drop', 'item-badalo',
];
// tiras de quadros pequenos: [largura, altura] de cada quadro
const STRIPS: Record<string, [number, number]> = {
  'deco-candles': [16, 14],
  'deco-moss': [4, 30],
  'deco-tufts-bridge': [12, 8],
  'deco-tufts-catacomb': [12, 8],
  'deco-tufts-memory': [12, 8],
  flame: [5, 9],
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    this.load.on('progress', (p: number) => ui.loading(p));
    for (const key of SHEETS) {
      this.load.json(`${key}-meta`, `assets/${key}.json`);
      this.load.once(`filecomplete-json-${key}-meta`, (_k: string, _t: string, meta: SheetMeta) => {
        this.load.spritesheet(key, `assets/${key}.png`, { frameWidth: meta.frameWidth, frameHeight: meta.frameHeight });
      });
    }
    this.load.json('slashes', 'assets/slashes.json');
    this.load.once('filecomplete-json-slashes', (_k: string, _t: string, meta: Record<string, SlashMeta>) => {
      for (const [key, m] of Object.entries(meta)) this.load.spritesheet(key, `assets/${key}.png`, { frameWidth: m.w, frameHeight: m.h });
    });
    for (const key of IMAGES) this.load.image(key, `assets/${key}.png`);
    for (const [key, [w, h]] of Object.entries(STRIPS)) this.load.spritesheet(key, `assets/${key}.png`, { frameWidth: w, frameHeight: h });
  }

  create() {
    buildTextures(this);
    for (const key of SHEETS) {
      const meta = this.cache.json.get(`${key}-meta`) as SheetMeta;
      for (const [name, a] of Object.entries(meta.anims)) {
        this.anims.create({
          key: `${key}-${name}`,
          frames: this.anims.generateFrameNumbers(key, { start: a.start, end: a.start + a.count - 1 }),
          frameRate: a.fps,
          repeat: a.loop ? -1 : 0,
        });
      }
      this.registry.set(`${key}-origin`, { x: meta.originX, y: meta.originY });
    }
    const slashes = this.cache.json.get('slashes') as Record<string, SlashMeta>;
    for (const [key, m] of Object.entries(slashes)) {
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(key, { start: 0, end: m.frames - 1 }), frameRate: m.fps, repeat: 0 });
    }
    this.registry.set('slashes', slashes);
    this.anims.create({ key: 'candles', frames: this.anims.generateFrameNumbers('deco-candles', { start: 0, end: 1 }), frameRate: 5, repeat: -1 });
    this.anims.create({ key: 'flame', frames: this.anims.generateFrameNumbers('flame', { start: 0, end: 3 }), frameRate: 9, repeat: -1 });
    for (const key of ['coin', 'coin-big']) {
      this.anims.create({ key: `${key}-spin`, frames: [0, 1, 2, 3].map((frame) => ({ key, frame })), frameRate: 12, repeat: -1 });
    }
    document.documentElement.style.setProperty('--coin-icon', `url(${coinIconUrl()})`);
    ui.loaded();
    this.scene.launch('fx');
    this.scene.start('title');
  }
}

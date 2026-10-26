import Phaser from 'phaser';
import { setHdManifest } from '../gfx/hdAssets';
import { buildTextures, coinIconUrl } from '../gfx/textures';
import { buildVeilTextures } from '../gfx/veil';
import { ui } from '../ui/ui';

interface SheetMeta {
  frameWidth: number;
  frameHeight: number;
  originX: number;
  originY: number;
  anims: Record<string, { start: number; count: number; fps: number; loop: boolean }>;
  // folha no traço liso: atlas com os quadros recortados (nomeados pelo número) e `scale` pixels por pixel do mundo
  frames?: Record<string, unknown>;
  scale?: number;
}

interface SlashMeta {
  w: number;
  h: number;
  ox: number;
  frames: number;
  fps: number;
  // corte no traço liso: pixels da folha por pixel do mundo
  scale?: number;
}

// Folhas de personagens geradas pelas ferramentas de arte (arte/gerador)
const SHEETS = ['knight-scythe', 'knight-sword', 'knight-daggers', 'knight-bow', 'knight-badalo', 'knight-incensario', 'knight-corrente', 'penitent', 'figure', 'guard', 'crow', 'cobrador', 'sineiro', 'archer', 'censer', 'nun', 'smith', 'folk', 'arcebispo', 'jailer', 'carcereira', 'prisoner', 'sombra'];
const IMAGES = [
  'title-sky', 'title-land', 'title-rim', 'clouds-far', 'clouds-near',
  'bridge-sky', 'bridge-far', 'bridge-far-rim', 'bridge-mid', 'bridge-mid-rim', 'bridge-fg', 'cat-far', 'cat-mid', 'mem-sky', 'mem-far', 'mem-mid',
  'city-sky', 'city-far', 'city-mid', 'claustro-mid', 'nave-far', 'nave-mid',
  'tiles-bridge', 'tiles-catacomb', 'tiles-memory', 'terrain-ponte', 'terrain-catacumbas', 'terrain-memoria', 'terrain-sinos', 'terrain-cripta', 'arrow',
  'terrain-escadaria', 'terrain-praca', 'terrain-rua', 'terrain-telhados', 'terrain-nave', 'terrain-claustro', 'terrain-galeria', 'terrain-altar',
  // pedra que cobre as passagens secretas até o golpe quebrar (Fixtures.addWall)
  'terrain-rua-secret', 'terrain-telhados-secret', 'terrain-nave-secret', 'terrain-claustro-secret', 'terrain-galeria-secret',
  'intro-back', 'intro-near', 'intro-fore', 'intro-beams',
  'deco-anchor', 'deco-balustrade', 'deco-balustrade-broken', 'deco-bracket', 'deco-chain', 'deco-gate', 'deco-lamp',
  'deco-lamp-off', 'deco-mirror', 'deco-post', 'deco-scaffold', 'deco-statue', 'deco-tree-big', 'deco-tree-green', 'deco-tree-pink',
  'deco-shrine', 'deco-pedestal', 'deco-portcullis', 'relic-wall', 'relic-double', 'memory', 'bell-drop', 'item-badalo',
  'item-incensario', 'arcebispo-censer', 'deco-rose', 'deco-rose-broken',
  'deco-door', 'deco-bell', 'deco-cache', 'deco-cache-open', 'deco-page', 'deco-gallows', 'deco-fountain', 'deco-altar',
  // as paredes em volta das portas e a porta da máscara (art/portals.py)
  'deco-portal-cathedral', 'deco-portal-nave', 'deco-portal-prison', 'deco-door-mask',
  // Prisão Subterrânea
  'deco-lever-base', 'deco-lever-handle', 'deco-trapdoor', 'deco-cellbars', 'deco-ring', 'item-keys', 'deco-anvil', 'cage',
  'relic-hook', 'item-corrente', 'item-elo', 'prison-far', 'prison-mid',
  'terrain-poco', 'terrain-celas', 'terrain-correntes', 'terrain-guarita', 'terrain-fuga', 'terrain-arena', 'terrain-mascara', 'terrain-celas-secret',
  // o Fosso e o Leito do Abismo
  'fosso-far', 'fosso-mid', 'terrain-fosso', 'terrain-abismo',
  // as lanternas dos esquecidos e os cogumelos da tinta (art/abyss_props.py)
  'deco-soul-lantern', 'deco-fungus-0', 'deco-fungus-1', 'deco-fungus-2',
  // relevo das pinceladas da pintura a óleo do EXTREME (gfx/extreme.ts)
  'paint-strokes',
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
        if (meta.frames) this.load.atlas(key, `assets/${key}.png`, `assets/${key}.json`);
        else this.load.spritesheet(key, `assets/${key}.png`, { frameWidth: meta.frameWidth, frameHeight: meta.frameHeight });
      });
    }
    this.load.json('hd', 'assets/hd.json');
    this.load.json('portal-lights', 'assets/portal-lights.json');
    // lista da pintura em 2x do EXTREME (as imagens só baixam quando a sala abre)
    this.load.json('hd-manifest', 'assets/hd/manifest.json');
    this.load.json('slashes', 'assets/slashes.json');
    this.load.once('filecomplete-json-slashes', (_k: string, _t: string, meta: Record<string, SlashMeta>) => {
      for (const [key, m] of Object.entries(meta)) this.load.spritesheet(key, `assets/${key}.png`, { frameWidth: m.w, frameHeight: m.h });
    });
    for (const key of IMAGES) this.load.image(key, `assets/${key}.png`);
    for (const [key, [w, h]] of Object.entries(STRIPS)) this.load.spritesheet(key, `assets/${key}.png`, { frameWidth: w, frameHeight: h });
  }

  create() {
    buildTextures(this);
    buildVeilTextures(this);
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
      if (meta.frames) {
        // traço liso: filtro suave (a tela pode ter mais pixels que a folha) e escala para o mundo
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
        this.registry.set(`${key}-scale`, 1 / (meta.scale ?? 1));
      }
    }
    // imagens soltas desenhadas com mais pixels que o mundo: filtro suave e a escala de redução
    for (const [key, s] of Object.entries((this.cache.json.get('hd') ?? {}) as Record<string, number>)) {
      if (!this.textures.exists(key)) continue;
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.registry.set(`${key}-scale`, 1 / s);
    }
    setHdManifest(this.cache.json.get('hd-manifest'));
    // o relevo da tinta é lido entre os texels (repete sozinho: a imagem tem lado potência de 2)
    if (this.textures.exists('paint-strokes')) this.textures.get('paint-strokes').setFilter(Phaser.Textures.FilterMode.LINEAR);
    const slashes = this.cache.json.get('slashes') as Record<string, SlashMeta>;
    for (const [key, m] of Object.entries(slashes)) {
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(key, { start: 0, end: m.frames - 1 }), frameRate: m.fps, repeat: 0 });
      if (m.scale) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
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

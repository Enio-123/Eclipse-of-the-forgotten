import Phaser from 'phaser';
import { setHdManifest } from '../gfx/hdAssets';
import { buildTextures, coinIconUrl } from '../gfx/textures';
import { buildVeilTextures } from '../gfx/veil';
import { buildMagicTextures } from '../gfx/magicTextures';
import { ui } from '../ui/ui';
import { loadSheet, setupSheet, sheetInfo, type SheetMeta } from '../gfx/sheets';
import { ROOM_SHEETS } from '../gfx/roomAssets';

interface SlashMeta {
  w: number;
  h: number;
  ox: number;
  frames: number;
  fps: number;
  // corte no traço liso: pixels da folha por pixel do mundo
  scale?: number;
}

// Folhas de personagens geradas pelas ferramentas de arte (arte/gerador). As dos chefes (ROOM_SHEETS) só
// têm a descrição lida aqui: a imagem vem quando a sala do chefe abre.
const SHEETS = ['knight-scythe', 'knight-sword', 'knight-daggers', 'knight-bow', 'knight-badalo', 'knight-incensario', 'knight-corrente', 'penitent', 'figure', 'guard', 'crow', 'cobrador', 'sineiro', 'archer', 'censer', 'nun', 'smith', 'folk', 'arcebispo', 'jailer', 'carcereira', 'prisoner', 'sombra',
  // Minas Abandonadas
  'knight-picareta', 'miner', 'ambat', 'oldminer', 'capataz',
  // o caminho do Mago: o personagem com cada um dos quatro cajados
  'knight-eclipse', 'knight-necro', 'knight-veu', 'knight-espaco',
  // Floresta Nevada: a matilha, as corujas, o Mestre da Caça e o cavaleiro com a lança dele
  'wolf', 'owl', 'cacador', 'knight-lanca', 'knight-remo', 'knight-cetro',
  // o Agrimensor, que vende as folhas do mapa
  'surveyor',
  // Vale das Cachoeiras: a Truta de Âmbar, a Garça Cinzenta e o Barqueiro
  'trout', 'heron', 'barqueiro',
  // Torres Rúnicas: o Guarda da Coroação, os Arquivados e o Senhor de Vhalor (a Vigia Rúnica o jogo desenha)
  'crownguard', 'archived', 'vhalor'];
// (o terreno pintado, os pinheiros e os fundos de cada sala vêm quando ela abre: gfx/roomAssets.ts)
const IMAGES = [
  'title-sky', 'title-land', 'title-rim', 'clouds-far', 'clouds-near',
  'tiles-bridge', 'tiles-catacomb', 'tiles-memory', 'arrow',
  'intro-back', 'intro-near', 'intro-fore', 'intro-beams',
  'deco-anchor', 'deco-balustrade', 'deco-balustrade-broken', 'deco-bracket', 'deco-chain', 'deco-gate', 'deco-lamp',
  'deco-lamp-off', 'deco-mirror', 'deco-post', 'deco-scaffold', 'deco-statue', 'deco-tree-big', 'deco-tree-green', 'deco-tree-pink',
  'deco-shrine', 'deco-pedestal', 'deco-portcullis', 'relic-wall', 'relic-double', 'memory', 'bell-drop', 'item-badalo',
  'item-incensario', 'arcebispo-censer', 'deco-rose', 'deco-rose-broken', 'deco-groma',
  'deco-door', 'deco-bell', 'deco-cache', 'deco-cache-open', 'deco-page', 'deco-gallows', 'deco-fountain', 'deco-altar',
  // as paredes em volta das portas e a porta da máscara (art/portals.py)
  'deco-portal-cathedral', 'deco-portal-nave', 'deco-portal-prison', 'deco-door-mask',
  // Prisão Subterrânea
  'deco-lever-base', 'deco-lever-handle', 'deco-trapdoor', 'deco-cellbars', 'deco-ring', 'item-keys', 'deco-anvil', 'cage',
  'relic-hook', 'relic-dash', 'item-corrente', 'item-elo',
  // as lanternas dos esquecidos e os cogumelos da tinta (art/abyss_props.py)
  'deco-soul-lantern', 'deco-fungus-0', 'deco-fungus-1', 'deco-fungus-2',
  // relevo das pinceladas da pintura a óleo do EXTREME (gfx/extreme.ts)
  'paint-strokes',
  // as Minas Abandonadas: os objetos (art/mine_props.py)
  'deco-crystal-0', 'deco-crystal-1', 'deco-crystal-2', 'deco-mine-lamp', 'deco-cart', 'deco-cart-wheel', 'deco-rail',
  'deco-press', 'deco-press-plate', 'deco-press-screw', 'deco-press-bar', 'deco-press-bed', 'deco-timber', 'deco-timber-knee',
  'deco-ledger', 'deco-amber-block-0', 'deco-amber-block-1', 'deco-amber-block-2', 'deco-rubble', 'item-picareta',
  'deco-amber-mirror', 'deco-amber-mirror-broken', 'deco-ceiling-beam', 'deco-trolley',
  // os achados das Minas (art/mine_items.py): os seis itens e os dois espaços do inventário
  'item-flower', 'item-helmet', 'item-rawamber', 'item-watch', 'item-whistle', 'item-mirror', 'item-bornal', 'item-cinto',
  // a Floresta Nevada: os objetos (art/forest_props.py)
  'relic-cape', 'deco-palisade', 'deco-note-pinhal-0', 'deco-note-cabana-0', 'deco-note-cabana-1', 'deco-note-clareira-0', 'item-lanca', 'item-remo', 'item-cetro', 'deco-record-cais-0', 'deco-record-gruta-0', 'deco-record-prainha-0', 'deco-record-rio-0', 'deco-record-trono-0',
  'deco-record-nichos-0', 'deco-record-nichos-1', 'deco-record-mercado-0', 'deco-record-mercado-1', 'deco-record-solitarias-0', 'deco-record-solitarias-1', 'deco-record-margem-0', 'deco-record-margem-1', 'deco-record-alagada-0', 'deco-record-alagada-1', 'deco-balanca', 'deco-toldo',
  // o Vale das Cachoeiras (art/vale_props.py); a vara solta do Barqueiro e a mão por cima dela
  'relic-swim', 'barqueiro-pole', 'barqueiro-fist',
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
      if (ROOM_SHEETS.has(key)) continue;
      this.load.once(`filecomplete-json-${key}-meta`, (_k: string, _t: string, meta: SheetMeta) => loadSheet(this.load, key, meta));
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
    buildMagicTextures(this);
    for (const key of SHEETS) {
      if (ROOM_SHEETS.has(key)) sheetInfo(this, key);
      else setupSheet(this, key);
    }
    // imagens soltas desenhadas com mais pixels que o mundo: filtro suave e a escala de redução (a escala
    // vale também para as imagens das salas, que chegam depois e ganham o filtro em roomAssets)
    for (const [key, s] of Object.entries((this.cache.json.get('hd') ?? {}) as Record<string, number>)) {
      this.registry.set(`${key}-scale`, 1 / s);
      if (this.textures.exists(key)) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
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

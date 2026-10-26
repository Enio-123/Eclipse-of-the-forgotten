import Phaser from 'phaser';
import { AMBER_BAR, ARCHER, FRAGMENT, INCENSE, MINE_ITEMS, PAL, PARRY, PLAYER, POWERS, QUAKE, TILE, VIEW_H, VIEW_W, WEAPONS, WEAPON_IDS, type PowerId, type WeaponId } from '../config';
import { Player, type AttackDir, type PlayerAction } from '../entities/Player';
import { MemoryEcho } from '../entities/MemoryEcho';
import { Crawler } from '../entities/Crawler';
import { Guard } from '../entities/Guard';
import { Crow } from '../entities/Crow';
import { Archer } from '../entities/Archer';
import { Censer } from '../entities/Censer';
import { Boss } from '../entities/Boss';
import { Arcebispo } from '../entities/Arcebispo';
import { Jailer } from '../entities/Jailer';
import { Carcereira } from '../entities/Carcereira';
import { Sombra } from '../entities/Sombra';
import { Miner } from '../entities/Miner';
import { AmberBat } from '../entities/AmberBat';
import { Reflexo } from '../entities/Reflexo';
import { Capataz } from '../entities/Capataz';
import { InkWisp } from '../entities/InkWisp';
import { ABYSS, Echo } from '../entities/Echo';
import { overlap, type BossFoe, type Enemy } from '../entities/Enemy';
import { SmokeField } from '../entities/Smoke';
import { Arrow } from '../entities/Arrow';
import { Controls } from '../systems/Controls';
import { audio, type SfxName, type TrackId } from '../systems/Audio';
import { gfx, settings } from '../systems/Settings';
import { MAX_LEVEL, progress, type Upgrade } from '../systems/Save';
import { Level, isGround, isSolid } from '../world/Level';
import { Decor, DEPTH } from '../world/Decor';
import { Backdrop } from '../world/Backdrop';
import { Weather } from '../world/Weather';
import { MAP_POS, ROOMS, type Ability, type BossId, type Exit, type RoomDef, type RoomId, type Side } from '../world/rooms';
import { Props, type MemoryOrb, type Relic, type Shrine } from '../world/Props';
import { Fixtures, type Door, type Ring } from '../world/Fixtures';
import { Npcs, type Npc } from '../world/Npcs';
import { Mine } from '../world/Mine';
import { Finds, hasFind, isSlotFind, type FindId } from '../world/Finds';
import type { Breakable } from '../world/secrets';
import { Loot } from '../world/Loot';
import { ARENA_WAVES, BELLS, ELO, FORGE, FOUND_THOUGHTS, LEVERS, MATERIALS, MEMORIES, MEMORY_ECHO, NUN, OFFERS, OLD_MINER, PAGES, PRISONER, RECORDS, RELICS, SLOT_FINDS, SMITH } from '../world/lore';
import { TILE_ONEWAY, smoothGlow } from '../gfx/textures';
import { ui } from '../ui/ui';
import { pad } from '../systems/Pad';
import type { FxScene } from './FxScene';
import { face, hd } from '../gfx/flip';
import { RES, screenOrigin } from '../gfx/view';
import { extremeCamera, type ExtremePipeline, type Look } from '../gfx/extreme';
import { RoomLighting, type TerrainPiece } from '../gfx/lighting';
import { lookFor } from '../gfx/looks';
import { ensure, hdKey, hdTerrain, prefetch, release, roomFiles } from '../gfx/hdAssets';
import { HD_LAYERS } from '../world/Backdrop';
import { Life } from '../world/Life';
import { Mist } from '../world/Mist';
import { Shafts } from '../world/Shafts';
import { MemoryWave } from '../gfx/memoryWave';
import type { GfxFlags } from '../systems/Graphics';
import type { Theme } from '../world/Level';

export type Arrival = 'new' | 'continue' | 'door' | 'mirror' | 'memory' | 'death';

export interface GameInit {
  room: RoomId;
  entry: string;
  from: Arrival;
  // por qual borda saiu da sala anterior (quem cai por um buraco chega caindo)
  via?: Side;
}

// inimigo do mapa e por onde o cavaleiro já passou dele (bits: 1 esquerda, 2 direita, 4 acima, 8 abaixo;
// 15 = vencido). No próximo descanso numa vela, o que foi vencido vira cinza e não volta mais.
interface Track {
  key: string;
  e: Enemy;
  hx: number;
  hy: number;
  f: number;
}

// onda do badalo correndo rente ao chão
interface Quake {
  x: number;
  y: number;
  dir: number;
  t: number;
  dustT: number;
  hit: Set<Enemy>;
  glow: Phaser.GameObjects.Image;
}

// arma de chefe caída, esperando o cavaleiro encostar
interface WeaponDrop {
  id: WeaponId;
  x: number;
  y: number;
  t: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  ready: boolean;
}

const PASSED = 15;

// fuga com alarme: quando cada grade cai (segundos depois da queda na galeria, da direita para a
// esquerda) e quando o alarme acaba sozinho
const ALARM_AT = [3.5, 6.5, 10, 13.5, 17, 21];
const ALARM_END = 40;
// a corrente puxa só os leves
const LIGHT = new Set(['crawler', 'crow', 'archer', 'censer']);

// cada chefe: a luta, a memória que deixa, onde caem a memória e a arma (pela frente dele, a partir
// dos pés) e o que o cavaleiro pensa quando acaba
interface BossInfo {
  make: (s: GameScene, x: number, y: number) => BossFoe;
  sheet: string;
  name: string;
  title: string;
  music: TrackId;
  memory: string;
  // passou desta coluna: a grade fecha e ele acorda
  wakeX: number;
  orb: number;
  drop: number;
  // o corpo que fica na sala depois (quadro e para onde olha)
  corpse: string;
  corpseFacing: 1 | -1;
  after: [string, string];
  // o achado que cai dele (dx: pela frente dele, a partir dos pés)
  item?: { id: Upgrade; dx: number };
  // o que ele devolve ao cavaleiro além da memória (a Sombra vira o Véu Abissal)
  relic?: Ability;
}

const BOSSES: Record<BossId, BossInfo> = {
  sineiro: {
    make: (s, x, y) => new Boss(s, x, y),
    sheet: 'sineiro',
    name: 'O Sineiro',
    title: 'Guardião do último sino',
    music: 'boss',
    memory: 'cripta:boss',
    wakeX: 10,
    orb: 12,
    drop: -40,
    corpse: 'death',
    corpseFacing: -1,
    after: ['O sino parou. Pela primeira vez, silêncio.', 'Atrás dele, outra grade subiu. Há degraus que sobem.'],
  },
  arcebispo: {
    make: (s, x, y) => new Arcebispo(s, x, y),
    sheet: 'arcebispo',
    name: 'O Arcebispo do Dízimo',
    title: 'Ele não erra a conta',
    music: 'boss2',
    memory: 'altar:boss',
    wakeX: 10,
    orb: -30,
    drop: 114,
    corpse: 'corpse',
    corpseFacing: -1,
    after: ['As moedas pararam de cair. Pela primeira vez, ninguém conta.', 'O que ele cobrou não ficou aqui. Desceu para algum lugar embaixo da cidade.'],
  },
  carcereira: {
    make: (s, x, y) => new Carcereira(s, x, y),
    sheet: 'carcereira',
    name: 'A Carcereira',
    title: 'Ela guarda as chaves de todos',
    music: 'boss3',
    memory: 'mascara:boss',
    wakeX: 12,
    orb: -40,
    drop: 70,
    corpse: 'death',
    corpseFacing: -1,
    after: ['As correntes caíram no chão. Pela primeira vez, ninguém vigia.', 'Embaixo da bigorna, a pedra rachou. Lá de baixo vem um eco.'],
  },
  sombra: {
    make: (s, x, y) => new Sombra(s, x, y),
    sheet: 'sombra',
    name: 'A Sombra do Carrasco',
    title: 'Tudo o que ele não quis lembrar',
    music: 'shadow',
    memory: 'abismo:boss',
    wakeX: 12,
    orb: 30,
    drop: 0,
    corpse: 'gone',
    corpseFacing: -1,
    after: ['A tinta voltou para dentro de mim. Pesa como pano molhado, e é minha.', 'Agora ela passa onde a pedra não deixa: grade de cela, pele de tinta.'],
    relic: 'veil',
  },
  reflexo: {
    make: (s, x, y) => new Reflexo(s, x, y),
    sheet: 'knight-scythe',
    name: 'O Reflexo',
    title: 'Ele repete tudo o que você fez',
    music: 'mirror',
    memory: 'espelhos:boss',
    // acorda depois que o cavaleiro passa na frente do espelho (antes disso a imagem fica na pedra)
    wakeX: 36,
    orb: 0,
    drop: 0,
    corpse: 'none',
    corpseFacing: -1,
    after: ['Era eu, do jeito que o Âmbar me guardou. Um instante atrasado, mas inteiro.', 'O espelho rachou de cima a baixo. Do outro lado da câmara, alguém ainda pica a pedra.'],
  },
  capataz: {
    make: (s, x, y) => new Capataz(s, x, y),
    sheet: 'capataz',
    name: 'O Capataz de Âmbar',
    title: 'O último turno nunca acabou',
    music: 'boss4',
    memory: 'capataz:boss',
    wakeX: 12,
    orb: -40,
    drop: 60,
    corpse: 'death',
    corpseFacing: 1,
    after: ['O apito caiu do pescoço dele. Pela primeira vez, ninguém chama o turno.', 'A picareta dele quebra o Âmbar. O bloco do túnel não vai segurar.'],
    item: { id: 'whistle', dx: 22 },
  },
};

// fim de cada capítulo (a memória do chefe fecha o capítulo)
const CHAPTERS: Record<string, { title: string; text: string }> = {
  'cripta:boss': {
    title: 'Fim do primeiro capítulo',
    text: 'O último sino das catacumbas ficou em silêncio. Ele lembrou de um altar e de alguém esperando. Ainda falta lembrar quem.',
  },
  'altar:boss': {
    title: 'Fim do segundo capítulo',
    text: 'A conta do Arcebispo fechou. Ele cobrou a memória dela antes da cerimônia, e ela o esqueceu no caminho do altar. O que foi cobrado desceu para a prisão, embaixo da cidade.',
  },
  'capataz:boss': {
    title: 'Fim do quarto capítulo',
    text: 'As luzes douradas que ele junta desde a ponte são Âmbar: memória de gente, tirada nas minas e espremida nas prensas da Casa Vhalor. O que a Casa cobrava não era dízimo. Eram lembranças. E uma delas era dela, fugindo pelo túnel.',
  },
  'abismo:boss': {
    title: 'Fim do terceiro capítulo',
    text: 'No fundo da prisão, a sombra dele esperava com o machado. Ela voltou para o corpo, e com ela o peso de uma sentença. Ainda há duas versões da mesma manhã. Mais fundo, nas minas, alguém cava atrás da verdadeira.',
  },
};

// como usar cada poder de memória, logo depois de lembrar dele
const POWER_TIPS: Record<PowerId, string> = {
  lembranca: '{memory} gasta duas contas de Âmbar e para o mundo por um instante. Cada golpe que entra enche as contas de novo.',
  eco: 'Escolha o Eco no inventário. {memory} gasta uma conta: a cópia repete os golpes por alguns segundos.',
  remendo: 'Escolha o Remendo no inventário. Parado no chão, {memory} gasta as três contas e fecha uma ferida.',
};

// a rosácea atrás do altar (quebra na segunda fase do Arcebispo)
export interface Rose {
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}

// pintura a óleo de cada tema quando a sala não diz (depois do Arcebispo ela vai crescendo)
const PAINT: Partial<Record<Theme, number>> = { prison: 0.15 };

// quem nasce de cada letra do mapa
const SPAWNERS: Record<string, (s: GameScene, x: number, y: number) => Enemy> = {
  c: (s, x, y) => new Crawler(s, x, y),
  g: (s, x, y) => new Guard(s, x, y),
  v: (s, x, y) => new Crow(s, x, y - 10),
  a: (s, x, y) => new Archer(s, x, y),
  i: (s, x, y) => new Censer(s, x, y),
  W: (s, x, y) => new Jailer(s, x, y),
  u: (s, x, y) => new Miner(s, x, y),
  z: (s, x, y) => new AmberBat(s, x, y - 10),
  // fiapo de tinta da fragmentação: só o Capataz chama, na segunda fase (nome comprido de propósito,
  // nenhuma letra do mapa cai aqui; o 'k' é das chaves da guarita)
  wisp: (s, x, y) => new InkWisp(s, x, y),
};

export class GameScene extends Phaser.Scene {
  controls!: Controls;
  level!: Level;
  player!: Player;
  room!: RoomDef;
  decor!: Decor;
  enemies: Enemy[] = [];
  arrows: Arrow[] = [];
  props!: Props;
  fixtures!: Fixtures;
  npcs!: Npcs;
  // as Minas: cristais, escoras, trilhos e vagonete, prensas, registros e blocos de Âmbar
  mine: Mine | null = null;
  // os achados no chão da sala (itens e espaços do inventário)
  finds!: Finds;
  loot!: Loot;
  boss: BossFoe | null = null;
  private bossFrac = -1;
  rose: Rose | null = null;
  // quem o chefe chamou para a luta (viram cinza quando ele cai)
  private summons: Enemy[] = [];
  // nuvens que o incensário do cavaleiro deixa (queimam cada inimigo uma vez)
  private censerClouds!: SmokeField;
  private backdrop!: Backdrop;
  private weather!: Weather;
  // High e EXTREME: o filtro da câmera e a luz da sala (null no Performance ou fora do WebGL)
  xp: ExtremePipeline | null = null;
  lighting: RoomLighting | null = null;
  look!: Look;
  private gfxOn: GfxFlags | null = null;
  // terreno pintado normal e os pedaços em 2x do EXTREME por cima dele
  private terrainImg: Phaser.GameObjects.Image | null = null;
  private hdImgs: Phaser.GameObjects.Image[] = [];
  private hdGen = 0;
  // bichos, teias e brasas do High e do EXTREME
  private life: Life | null = null;
  private mist: Mist | null = null;
  private shafts: Shafts | null = null;
  private memWave: MemoryWave | null = null;
  private figure: Phaser.GameObjects.Sprite | null = null;
  private figureState: 'idle' | 'turned' | 'done' = 'idle';
  private hitstopT = 0;
  // tempo de jogo acumulado (os testes esperam por ele, não pelo relógio da máquina)
  clock = 0;
  private respawning = false;
  transitioning = false;
  // o jogo rodando de verdade, sem troca de sala (a resolução automática só mede aqui)
  get live() {
    return !!this.player && !this.transitioning && !this.respawning;
  }
  // cena parada (relíquia, morte de chefe, fim de capítulo): o jogo espera e as armadilhas não mexem
  cinematic = false;
  private lookX = 36;
  // quanto a câmera fica acima do cavaleiro (no vale, mais céu e menos terra)
  private camY = 26;
  private wasInWater = false;
  // mapa: de quanto em quanto tempo marca o que a câmera viu e grava (junto com as moedas pegas)
  private visitT = 0;
  private saveT = 0;
  private dirty = false;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private clangs!: Phaser.GameObjects.Particles.ParticleEmitter;
  private rubble!: Phaser.GameObjects.Particles.ParticleEmitter;
  private gritFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private glassFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private feathers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shards!: Phaser.GameObjects.Particles.ParticleEmitter;
  gold!: Phaser.GameObjects.Particles.ParticleEmitter;
  private waterFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private wisps!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  // inimigos já atravessados no dash atual (um sopro por inimigo) e os que já deixaram moedas
  private passed = new Set<Enemy>();
  private passDash = -1;
  private cartHits = new Set<Enemy>();
  private pressHits = new Set<Enemy>();
  private looted = new WeakSet<Enemy>();
  private tracks: Track[] = [];
  private quakes: Quake[] = [];
  private ash!: Phaser.GameObjects.Particles.ParticleEmitter;
  // gotas e luzes da sombra (o Eco)
  private abyssDrips!: Phaser.GameObjects.Particles.ParticleEmitter;
  private abyssMotes!: Phaser.GameObjects.Particles.ParticleEmitter;
  private weaponDrop: WeaponDrop | null = null;
  // a sombra que guarda as moedas da última morte, se ela ficou nesta sala
  echo: Echo | null = null;
  // fuga com alarme: tempo desde a queda (-1 sem alarme) e os carcereiros que ele acordou
  private alarmT = -1;
  private alarmFoes: Enemy[] = [];
  private alarmBellT = 0;
  private alarmClean = false;
  // arena dos condenados: a leva atual, quem nasceu nela e quantos ainda vão nascer
  private arena: { wave: number; foes: Enemy[]; pending: number; wait: number; started: boolean } | null = null;
  private elo: { x: number; y: number; sprite: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image } | null = null;
  // inimigos leves sendo puxados pelo gancho da corrente
  private pulls: { e: Enemy; dir: number; t: number }[] = [];
  // poderes de memória: quanto falta da Lembrança (o resto do mundo parado), o véu cor de Âmbar dela,
  // quem ela está segurando (e se o corpo dele andava antes), a cópia do Eco e o Remendo de joelhos
  private stopT = 0;
  // quanto durava a parada que está valendo (a da Lembrança ou a curta do Apito do Capataz)
  private stopLen = 0;
  private stopFx: Phaser.GameObjects.GameObject[] = [];
  private held = new Map<Enemy, boolean>();
  memEcho: MemoryEcho | null = null;
  private mendT = 0;
  private mendHp = 0;
  // fragmentação com 1 de vida nas Minas: quanto falta da gravidade leve e quando pode rachar de novo
  private fragLowT = 0;
  private fragNext = 0;

  constructor() {
    super('game');
  }

  get fx() {
    return this.scene.get('fx') as FxScene;
  }

  // muda a força da pintura agora (fotos de teste)
  setPaint(strength: number) {
    if (this.look) this.look.oil = strength;
  }

  // pedaços do terreno pintado da sala (a luz lê onde é rocha)
  terrainPieces(): TerrainPiece[] {
    const key = `terrain-${this.room.id}`;
    return this.textures.exists(key) ? [{ key, x: 0, y: 0, w: this.level.widthPx, h: this.level.heightPx }] : [];
  }

  // liga, desliga ou ajusta o filtro e a luz conforme os ajustes de imagem (vale na hora)
  applyGraphics() {
    const f = { ...gfx() };
    const prev = this.gfxOn;
    this.gfxOn = f;
    const cam = this.cameras.main;
    if (!prev || prev.life !== f.life || prev.particles !== f.particles) {
      this.life?.destroy();
      this.life = new Life(this, this.level, f.life, f.particles);
    }
    if (!prev || prev.fog !== f.fog) {
      this.mist?.destroy();
      this.mist = f.fog ? new Mist(this, this.look.mistColor, this.look.mist, this.look.mistFront) : null;
    }
    let reLight = false;
    if (!prev || prev.hd !== f.hd || prev.particles !== f.particles) {
      this.shafts?.destroy();
      this.shafts = f.hd ? new Shafts(this, this.level, this.room.id, f.particles) : null;
      // as poças de luz dos fachos entram no mapa de luz
      reLight = !!prev;
    }
    const want = f.light || f.fog || f.reflections || f.post;
    smoothGlow(this, f.light || f.post);
    if (!want) {
      if (this.xp) extremeCamera(cam, false);
      this.xp = null;
      this.lighting = null;
      return;
    }
    if (!this.xp) this.xp = extremeCamera(cam, true);
    // sem WebGL não há filtro: fica o visual original
    if (!this.xp) {
      this.lighting = null;
      return;
    }
    if (!this.lighting) this.lighting = new RoomLighting(this, this.level, this.look, f, () => this.terrainPieces());
    else if (prev) this.lighting.setFlags(f);
    if (reLight) this.lighting.ready = false;
    this.xp.feed = this.lighting.feed;
  }

  // EXTREME: troca o terreno, os fundos e os véus das paredes falsas pela pintura em 2x quando ela
  // chega (até lá fica a normal); as salas vizinhas já começam a baixar
  private hdRoom() {
    const gen = ++this.hdGen;
    if (!gfx().hd) {
      this.hdOff();
      return;
    }
    const room = this.room;
    const files = roomFiles(room.id, this.backdrop.hdKeys());
    const near = new Set([...room.exits.map((e) => e.to), ...(room.doors ?? []).map((d) => d.to)]);
    void ensure(this.game, files).then((ok) => {
      if (gen !== this.hdGen || !this.sys.isActive() || this.room !== room) return;
      this.hdOn(ok);
      release(this.game, files);
      for (const id of near) prefetch(roomFiles(id, HD_LAYERS[ROOMS[id].theme] ?? []));
    });
  }

  private hdOn(ok: Set<string>) {
    const t = hdTerrain(this.room.id);
    if (t && this.terrainImg && !this.hdImgs.length && t.pieces.every((p) => ok.has(p.file))) {
      for (const p of t.pieces) this.hdImgs.push(this.add.image(p.x, p.y, hdKey(p.file)).setOrigin(0).setScale(1 / t.scale).setDepth(DEPTH.tiles));
      this.terrainImg.setVisible(false);
    }
    this.backdrop.useHd(true);
    const sec = hdTerrain(`${this.room.id}-secret`);
    if (sec && sec.pieces.every((p) => ok.has(p.file))) this.fixtures.useHdVeils(sec.pieces, sec.scale);
  }

  private hdOff() {
    for (const i of this.hdImgs) i.destroy();
    this.hdImgs = [];
    this.terrainImg?.setVisible(true);
    this.backdrop?.useHd(false);
    this.fixtures?.useHdVeils(null, 1);
  }

  create(data: GameInit) {
    this.enemies = [];
    this.arrows = [];
    this.tracks = [];
    this.quakes = [];
    this.weaponDrop = null;
    this.echo = null;
    this.alarmT = -1;
    this.alarmFoes = [];
    this.alarmClean = false;
    this.arena = null;
    this.elo = null;
    this.pulls = [];
    this.boss = null;
    this.bossFrac = -1;
    this.rose = null;
    this.summons = [];
    this.figure = null;
    this.figureState = 'idle';
    this.respawning = false;
    this.transitioning = false;
    this.cinematic = false;
    this.hitstopT = 0;
    this.stopT = 0;
    this.stopFx = [];
    this.held = new Map();
    this.memEcho = null;
    this.mendT = 0;
    this.fragLowT = 0;
    this.room = ROOMS[data.room];
    this.controls = new Controls(this);
    document.body.classList.add('playing');

    const room = this.room;
    // a tela tem RES pixels por pixel do mundo; o zoom vem antes de tudo o que fica preso na tela
    this.cameras.main.setZoom(RES);
    this.level = new Level(this, room.map, room.theme, room.id, (id) => progress.seen.has(id));
    this.level.layer.setDepth(DEPTH.tiles);
    // terreno pintado da sala: os tiles continuam só para a física
    const terrain = `terrain-${room.id}`;
    this.terrainImg = null;
    this.hdImgs = [];
    if (this.textures.exists(terrain)) {
      this.terrainImg = this.add.image(0, 0, terrain).setOrigin(0).setDepth(DEPTH.tiles);
      this.level.layer.setVisible(false);
    }
    this.backdrop = new Backdrop(this, this.level, room.id);
    this.decor = new Decor(this, this.level, room);
    // na volta da memória o ouro novo só aparece depois do efeito (e a grade abre na frente do jogador)
    const fresh = data.from === 'memory' && !progress.seen.has('memory:vale');
    this.props = new Props(this, room.id !== 'catacumbas' || (progress.seen.has('memory:vale') && !fresh));
    this.fixtures = new Fixtures(this);
    this.npcs = new Npcs(this);
    this.mine = room.theme === 'mine' ? new Mine(this) : null;
    this.finds = new Finds(this);
    // começou de uma vela (jogo novo, continuar ou depois de morrer): a Flor prensada volta a valer
    if (data.from === 'new' || data.from === 'continue' || data.from === 'death') progress.seen.delete('flower:spent');

    // as laterais com saída e o fundo do abismo (ou do buraco que leva para baixo) não seguram o jogador
    const W = this.level.widthPx;
    const H = this.level.heightPx;
    const exitL = room.exits.some((e) => e.side === 'left');
    const exitR = room.exits.some((e) => e.side === 'right');
    const exitD = room.exits.some((e) => e.side === 'down');
    this.physics.world.setBounds(0, 0, W, H + (room.pit || exitD ? 400 : 0));
    this.physics.world.setBoundsCollision(!exitL, !exitR, false, !room.pit && !exitD);

    const spawn = this.level.spawn(data.entry) ?? this.level.spawn('P') ?? this.level.spawns[0];
    // chegou por trás de uma parede ainda de pé (só acontece fora do caminho normal): ela já caiu
    const hidden = this.fixtures.veiled(spawn.tx, spawn.ty);
    if (hidden) this.fixtures.breakWall(hidden, false);
    // uma arma de chefe só vale se já foi ganha neste progresso; de começo, só a escolhida
    if (!progress.hasWeapon(settings.data.weapon)) {
      settings.data.weapon = progress.starter ?? 'scythe';
      settings.save();
    }
    this.player = new Player(this, spawn.x, spawn.y, settings.data.weapon);
    this.player.facing = spawn.x < W / 2 ? 1 : -1;
    this.player.canAttack = !room.noAttack;
    if (data.via === 'down') this.player.body.setVelocityY(220);
    this.applyProgress();
    const keepHp = data.from === 'door' ? (this.registry.get('hp') as number | undefined) : undefined;
    this.player.hp = keepHp && keepHp > 0 ? Math.min(keepHp, progress.maxHp) : progress.maxHp;
    this.registry.set('hp', this.player.hp);
    this.registry.set('kintsugi', fresh ? progress.kintsugi - 1 : progress.kintsugi);
    this.registry.set('hud-hidden', room.id === 'memoria');
    this.registry.set('coins', progress.coins);

    for (const s of this.level.spawns) {
      if (s.kind === 'X') {
        if (room.boss) this.placeBoss(room.boss, s.x, s.y);
        continue;
      }
      const make = SPAWNERS[s.kind];
      if (!make) continue;
      // trecho vencido e já descansado: as criaturas dali viraram cinza
      const key = `${room.id}:${s.tx}:${s.ty}`;
      if (progress.seen.has(`clear:${key}`)) continue;
      const e = make(this, s.x, s.y);
      this.enemies.push(e);
      this.tracks.push({ key, e, hx: s.x, hy: s.y - 16, f: progress.seen.has(`pass:${key}`) ? PASSED : 0 });
    }
    const f = this.decor.figureSpawn;
    if (f) {
      const o = this.registry.get('figure-origin') as { x: number; y: number };
      this.figure = hd(this.add.sprite(f.x, f.y, 'figure', 0)).setOrigin(o.x, o.y).setDepth(DEPTH.enemy).play('figure-idle');
    }
    this.physics.add.collider(this.player.zone, this.level.layer, undefined, this.oneWayFilter, this);
    for (const e of this.enemies) this.physics.add.collider(e.zone, this.level.layer);
    // prisão: a queda com as chaves dispara o alarme; a arena espera o cavaleiro passar da grade
    if (room.id === 'fuga' && progress.seen.has('item:chaves') && !progress.seen.has('alarm:fuga')) this.startAlarm();
    if (room.id === 'arena') {
      if (!progress.seen.has('arena:done')) this.arena = { wave: -1, foes: [], pending: 0, wait: 0, started: false };
      else if (!progress.seen.has('item:elo')) this.placeElo(false);
    }
    this.placeFinds();

    this.makeParticles();
    this.placeEcho();
    this.censerClouds = new SmokeField(this, [0xa8906e, 0xcab58f], DEPTH.player - 0.5);
    this.loot = new Loot(this);
    this.passed.clear();
    this.weather = new Weather(this, this.level, {
      rain: room.rain,
      lightning: room.lightning,
      drips: room.drips,
      petals: room.petals,
      motes: room.motes,
      rims: this.backdrop.rims,
      puddles: this.decor.puddles,
      floorAt: this.rainFloor(),
      listener: () => ({ x: this.player.x, y: this.player.body.bottom }),
    });
    const so = screenOrigin(this.cameras.main);
    if (room.theme !== 'memory') {
      const dark = { bridge: 0.5, catacomb: 0.9, city: 0.55, nave: 0.8, prison: 0.85, mine: 0.85 }[room.theme];
      this.add.image(so.x, so.y, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(29).setAlpha(dark);
    }
    if (room.theme === 'bridge') {
      this.add.tileSprite(so.x, so.y + VIEW_H - 120, 640, 140, 'fog').setOrigin(0).setScrollFactor(0).setDepth(30).setAlpha(0.35).setName('fog-front');
    }

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.setBackgroundColor(this.backdrop.bg);
    cam.startFollow(this.player.zone, true, 0.11, 0.13);
    this.lookX = this.player.facing * 36;
    this.camY = room.theme === 'memory' ? 72 : 26;
    document.body.classList.toggle('bright', room.theme === 'memory');
    // nos fundos lisos da Cidade-Catedral o grão é mais leve (o traço não some no ruído)
    this.fx.setGrain({ bridge: 0.09, catacomb: 0.09, memory: 0.035, city: 0.07, nave: 0.07, prison: 0.08, mine: 0.08 }[room.theme]);
    cam.setFollowOffset(-this.lookX, this.camY);
    this.look = lookFor(room.theme, room.id, room.paint ?? PAINT[room.theme]);
    this.xp = null;
    this.lighting = null;
    this.life = null;
    this.mist = null;
    this.shafts = null;
    this.memWave = new MemoryWave(this, this.level);
    this.gfxOn = null;
    this.applyGraphics();
    this.hdRoom();
    const offGfx = settings.onChange(() => {
      const f = gfx();
      if (this.gfxOn && Object.keys(f).every((k) => f[k as keyof GfxFlags] === this.gfxOn![k as keyof GfxFlags])) return;
      const hdChanged = !this.gfxOn || this.gfxOn.hd !== f.hd;
      this.applyGraphics();
      if (hdChanged) this.hdRoom();
    });

    if (!this.scene.isActive('hud')) this.scene.launch('hud');

    audio.music(room.music);
    audio.ambience(room.ambience);
    audio.stepKind = room.theme === 'bridge' ? 'wet' : room.theme === 'memory' ? 'grass' : 'stone';
    // a nave ecoa mais que tudo; a cidade aberta quase nada
    audio.space = { bridge: 0.12, catacomb: 0.45, memory: 0.12, city: 0.16, nave: 0.62, prison: 0.5, mine: 0.55 }[room.theme];

    // o ponto de retorno é a última vela acesa (no começo, a ponte); da memória volta-se para a vela do espelho
    if (data.from === 'new') progress.checkpoint(room.id, data.entry, settings.data.weapon);
    else if (room.id === 'memoria' && !progress.seen.has('rest:catacumbas:1')) {
      progress.seen.add('rest:catacumbas:1');
      progress.checkpoint('catacumbas', 'R1', settings.data.weapon);
    }
    this.visitT = 0;
    this.saveT = 0;
    this.dirty = false;

    this.arrive(data.from);
    if (this.room.theme === 'mine') this.time.delayedCall(2200, () => this.catchUpPowers());

    ui.onStackChange = (open) => {
      if (!open) this.controls.reset();
    };
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.onclick = () => this.openPause();
    this.events.once('shutdown', () => {
      offGfx();
      ui.hint(null);
      ui.bossBar(null);
      ui.onStackChange = null;
      if (pauseBtn) pauseBtn.onclick = null;
      document.body.classList.remove('playing', 'bright');
    });
    (window as unknown as { __scene: GameScene }).__scene = this;
  }

  // como o jogador chega na sala: abertura, porta, espelho, volta da memória...
  private arrive(from: Arrival) {
    const cam = this.cameras.main;
    const room = this.room;
    const bannerKey = `banner:${room.id}`;
    const showBanner = () => {
      if (from === 'death' || (progress.seen.has(bannerKey) && from === 'door')) return;
      progress.seen.add(bannerKey);
      ui.banner(room.title, room.subtitle);
    };
    if (from === 'new') {
      // abertura: a câmera vem da ponte iluminada até o cavaleiro ajoelhado
      this.cinematic = true;
      this.player.kneel();
      cam.stopFollow();
      cam.centerOn(this.player.x + 560, this.player.zone.y - this.camY);
      cam.fadeIn(1800, 0, 0, 0);
      this.time.delayedCall(900, showBanner);
      cam.pan(this.player.x + this.lookX, this.player.zone.y - this.camY, 5200, 'Sine.easeInOut', true, (_c, p) => {
        if (p < 1) return;
        cam.startFollow(this.player.zone, true, 0.11, 0.13);
        this.time.delayedCall(700, () => this.player.getUp(() => (this.cinematic = false)));
      });
    } else if (from === 'mirror') {
      this.time.delayedCall(1600, showBanner);
    } else if (from === 'memory') {
      this.cinematic = true;
      this.player.frozen = true;
      this.fx.heal(this.player.x - cam.worldView.x, this.player.body.center.y - cam.worldView.y);
      const first = !progress.seen.has('memory:vale');
      progress.seen.add('memory:vale');
      // o prólogo concluído fica gravado mesmo se o jogo fechar no cartão do fim
      progress.save();
      this.time.delayedCall(1300, () => {
        if (first) {
          this.registry.set('kintsugi', progress.kintsugi);
          ui.banner('Memória recuperada', 'O vale, antes do eclipse', 3600);
        }
        this.player.frozen = false;
        this.cinematic = false;
      });
      if (first) {
        this.time.delayedCall(5600, () => {
          this.scene.pause();
          ui.end({
            onExplore: () => {
              ui.closeAll();
              this.scene.resume();
              this.openFarGate();
            },
            onTitle: () => {
              ui.closeAll();
              this.scene.resume();
              this.toTitle();
            },
          });
        });
      }
    } else {
      cam.fadeIn(from === 'death' ? 700 : 380, 7, 8, 13);
      if (from === 'continue' || from === 'door') this.time.delayedCall(350, showBanner);
      if (from === 'death') this.deathNews();
    }
  }

  // de volta na vela: conta o que ficou com a sombra e o que se perdeu de vez
  private deathNews() {
    const news = this.registry.get('echo-news') as { lost: number; gone: number } | undefined;
    this.registry.remove('echo-news');
    if (!news) return;
    let text = '';
    if (news.gone > 0) text = `A sombra antiga se desfez com as ${news.gone} moedas dela. `;
    if (news.lost > 0 && !progress.seen.has('echo:first')) {
      progress.seen.add('echo:first');
      text += 'A maior parte das moedas ficou com a minha sombra, onde eu caí. Se eu a vencer, elas voltam.';
    } else if (news.lost > 0) text += `${news.lost} moedas ficaram com a minha sombra.`;
    if (text) this.time.delayedCall(900, () => ui.thought(text.trim(), 5200));
  }

  private rainFloor() {
    if (!this.room.rain) return undefined;
    const ys = this.level.skyFloors();
    const col = new Map(ys.map((s) => [s.x, s.y * TILE]));
    return (x: number) => col.get(Math.floor(x / TILE)) ?? null;
  }

  private makeParticles() {
    this.dust = this.add.particles(0, 0, 'px', {
      lifespan: { min: 250, max: 500 },
      speed: { min: 10, max: 55 },
      angle: { min: 200, max: 340 },
      gravityY: -20,
      scale: { start: 1, end: 0 },
      alpha: { start: 0.55, end: 0 },
      tint: this.room.theme === 'memory' ? 0xb7c98f : 0x7a819a,
      emitting: false,
    }).setDepth(9);
    this.sparks = this.add.particles(0, 0, 'px', {
      lifespan: { min: 120, max: 300 },
      speed: { min: 90, max: 240 },
      scale: { start: 1.4, end: 0 },
      tint: [0xffffff, PAL.gold, 0xf3ecd9],
      emitting: false,
    }).setDepth(12);
    this.feathers = this.add.particles(0, 0, 'px', {
      lifespan: { min: 400, max: 800 },
      speedX: { min: -70, max: 70 },
      speedY: { min: 10, max: 80 },
      gravityY: 60,
      scale: { start: 1.3, end: 0.2 },
      alpha: { start: 0.85, end: 0 },
      tint: this.room.theme === 'memory' ? [0xffffff, 0xf2e8d0] : [0xd8d2c6, 0x8a8478, 0x2b2730],
      emitting: false,
    }).setDepth(9);
    this.clangs = this.add.particles(0, 0, 'px', {
      lifespan: { min: 100, max: 260 },
      speed: { min: 120, max: 300 },
      scale: { start: 1.2, end: 0 },
      tint: [0xffffff, 0xbcd4ff, 0x8fb0e8],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(12);
    // poeira e ferrugem que caem do teto antes das gaiolas da Carcereira
    this.gritFx = this.add.particles(0, 0, 'px', {
      lifespan: { min: 900, max: 1400 },
      speedY: { min: 20, max: 60 },
      speedX: { min: -8, max: 8 },
      gravityY: 260,
      scale: { start: 1.3, end: 0.7 },
      alpha: { start: 0.85, end: 0.3 },
      tint: [0x8a8f9e, 0x6b7080, 0xb3b8c4, 0x7a5a44],
      emitting: false,
    }).setDepth(DEPTH.enemy + 2);
    // pedra da parede falsa e cacos do vitral
    this.rubble = this.add.particles(0, 0, 'px', {
      lifespan: { min: 500, max: 1100 },
      speed: { min: 50, max: 190 },
      angle: { min: 190, max: 350 },
      gravityY: 700,
      scale: { start: 2, end: 0.8 },
      tint: [0x3a3e50, 0x2a2e3d, 0x535a70, 0x1b1e29],
      emitting: false,
    }).setDepth(DEPTH.enemy + 2);
    this.glassFx = this.add.particles(0, 0, 'px', {
      lifespan: { min: 500, max: 1200 },
      speed: { min: 60, max: 220 },
      angle: { min: 180, max: 360 },
      gravityY: 620,
      rotate: { min: 0, max: 360 },
      scale: { start: 1.6, end: 0.6 },
      tint: [0xc9443c, 0x3f6fc9, 0xe0b04a, 0x4ea86a, 0xe8e0cc],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(DEPTH.enemy + 2);
    this.shards = this.add.particles(0, 0, 'px', {
      lifespan: { min: 400, max: 800 },
      speed: { min: 40, max: 160 },
      angle: { min: 200, max: 340 },
      gravityY: 500,
      scale: { start: 1.5, end: 0.5 },
      tint: [PAL.mask, 0x1e2130, 0x2c3044],
      emitting: false,
    }).setDepth(12);
    this.gold = this.add.particles(0, 0, 'px', {
      lifespan: { min: 900, max: 1800 },
      speedY: { min: -26, max: -8 },
      speedX: { min: -8, max: 8 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [PAL.gold, 0xffe6a6],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(DEPTH.front);
    this.wisps = this.add.particles(0, 0, 'px', {
      lifespan: { min: 280, max: 620 },
      speed: { min: 18, max: 80 },
      gravityY: -40,
      scale: { start: 1.7, end: 0 },
      alpha: { start: 0.7, end: 0 },
      tint: this.room.theme === 'memory' ? [0xffffff, 0xf2ecdf] : [0xc8d4f0, 0x8a9cc8, 0x4a5678],
      emitting: false,
    }).setDepth(DEPTH.slash);
    // incenso: fumaça cinza que sobe devagar e se espalha
    this.smoke = this.add.particles(0, 0, 'smoke', {
      lifespan: { min: 900, max: 1700 },
      speedX: { min: -7, max: 7 },
      speedY: { min: -16, max: -5 },
      rotate: { min: 0, max: 360 },
      scale: { start: 0.16, end: 0.5 },
      alpha: { start: 0.5, end: 0 },
      tint: [0x9c96a4, 0x7e7888, 0xb6b0bc],
      emitting: false,
    }).setDepth(DEPTH.enemy + 0.5);
    // cinza das criaturas que se desfazem no descanso
    this.ash = this.add.particles(0, 0, 'px', {
      lifespan: { min: 700, max: 1500 },
      speedX: { min: -10, max: 38 },
      speedY: { min: -50, max: -12 },
      gravityY: -8,
      scale: { start: 1.3, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: this.room.theme === 'memory' ? [0xffffff, 0xe8e0cc] : [0xa49e94, 0x77726c, 0x4a474c, 0xd9c7a2],
      emitting: false,
    }).setDepth(DEPTH.enemy + 1);
    // a sombra pinga gotas escuras e solta luzes lilás que sobem
    this.abyssDrips = this.add.particles(0, 0, 'px', {
      lifespan: { min: 380, max: 760 },
      speedX: { min: -12, max: 12 },
      speedY: { min: 10, max: 40 },
      gravityY: 380,
      scale: { start: 1.3, end: 0.5 },
      alpha: { start: 0.95, end: 0.2 },
      tint: [ABYSS.ink, 0x2a1240, ABYSS.purple, ABYSS.magenta],
      emitting: false,
    }).setDepth(DEPTH.enemy - 0.1);
    this.abyssMotes = this.add.particles(0, 0, 'px', {
      lifespan: { min: 500, max: 1100 },
      speedX: { min: -14, max: 14 },
      speedY: { min: -46, max: -14 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [ABYSS.lilac, 0xb58cf0, ABYSS.magenta],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(DEPTH.enemy + 0.2);
    this.waterFx = this.add.particles(0, 0, 'px', {
      lifespan: { min: 200, max: 420 },
      speedX: { min: -60, max: 60 },
      speedY: { min: -150, max: -50 },
      gravityY: 600,
      scale: { start: 0.8, end: 0.3 },
      tint: [0xd9f2ff, 0x8ccbef],
      emitting: false,
    }).setDepth(DEPTH.water + 1);
  }

  private oneWayFilter(_obj: unknown, tile: unknown) {
    const t = tile as Phaser.Tilemaps.Tile;
    // no Véu a tinta escorre por entre as barras da cela e atravessa a membrana abissal
    if (this.player.veiling && this.level.veilCell(t.x, t.y)) return false;
    if (t.index !== TILE_ONEWAY) return true;
    if (this.player.dropT > 0) return false;
    const b = this.player.body;
    return b.prev.y + b.height <= t.pixelY + 3;
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta, 50) / 1000;
    this.clock += dt;
    this.controls.update(this.cameras.main);
    if (this.controls.pausePressed && !ui.open && !this.transitioning) {
      this.openPause();
      return;
    }
    this.backdrop.update(time);
    const pl = this.player;
    const reacts = (this.gfxOn?.life ?? 0) > 0 && !!pl;
    this.decor.update(time, dt, reacts ? { x: pl.x, top: pl.body.top, bottom: pl.body.bottom, vx: pl.body.velocity.x } : null);
    this.life?.update(dt, pl);
    this.mist?.update(time, this.level.heightPx);
    this.shafts?.update(time);
    this.memWave?.update(dt, this.xp?.feed ?? null);
    if (pl) this.backdrop.fgFade((pl.body.bottom - this.cameras.main.worldView.y) / VIEW_H > 0.74, dt);
    this.weather.update(dt);
    const fogFront = this.children.getByName('fog-front') as Phaser.GameObjects.TileSprite | null;
    if (fogFront) fogFront.tilePositionX = this.cameras.main.scrollX * 1.3 + time * 0.01;

    if (this.hitstopT > 0) {
      // um dash ou pulo apertado na pausa do impacto não se perde
      this.hitstopT -= dt;
      this.controls.stash();
      if (this.hitstopT > 0) return;
      this.physics.world.resume();
      this.controls.unstash();
    }
    if (this.controls.mapPressed && !ui.open && !this.transitioning && !this.cinematic && MAP_POS[this.room.id]) {
      this.openMap(false);
      return;
    }
    const p = this.player;
    if (this.controls.pressed.memory) this.usePower();
    // o vagonete anda antes do cavaleiro (ele vai sentado no assento já no lugar novo)
    this.mine?.update(time, dt, this.stopT > 0);
    p.update(dt, this.controls);
    this.hookHits();
    if (p.canHook) this.fixtures.markRing(p.hook || p.dead ? null : this.hookTarget(p));
    for (const e of this.enemies) if (!this.hold(e)) e.update(dt);
    this.updatePowers(dt);
    this.updateFragment(dt);
    this.trackPasses();
    this.updateQuakes(dt);
    this.updateCenserClouds(dt);
    this.updateWeaponDrop(dt);
    this.finds.update(dt);
    this.props.update(time, p);
    this.fixtures.update(time, dt);
    this.npcs.update(dt);
    this.trackVisit(dt);
    this.bossFight();
    this.updateAlarm(dt);
    this.updateArena(dt);
    this.updateElo(time);
    this.updatePulls(dt);
    this.updateArrows(dt);
    this.combat();
    this.loot.update(dt);
    this.hazards();
    this.veilThoughts();
    this.water();
    this.story();
    this.exits();
    this.follow(dt);
    this.lighting?.update(this.cameras.main, { x: p.x, y: p.body.center.y }, dt);
    if (this.room.rain && this.level.ceilingAbove(Math.floor(p.x / TILE), Math.floor(p.body.top / TILE)) < 0) {
      this.weather.splashOn(p.x, p.body.top - 6, dt);
    }
  }

  // ---------- combate ----------
  private combat() {
    const p = this.player;
    if (p.attacking) {
      const box = p.attackBox();
      let hit = false;
      let blocked = false;
      // aparar vem antes do dano: o golpe que encontra o ataque do inimigo na hora só rebate
      let parried: { x: number; y: number } | null = null;
      for (const e of this.enemies) {
        if (!e.alive || p.hitSet.has(e) || !e.parry?.(box, p.x)) continue;
        p.hitSet.add(e);
        const c = Phaser.Geom.Rectangle.Intersection(box, e.rect);
        parried = c.width > 0 ? { x: c.centerX, y: c.centerY } : { x: (p.x + e.zone.x) / 2, y: box.centerY };
      }
      for (const e of this.enemies) {
        if (!e.alive || p.hitSet.has(e)) continue;
        if (!overlap(box, e.rect)) continue;
        p.hitSet.add(e);
        const r = e.hit(p.x, p.weapon.dmg * progress.dmgFor(p.weapon.id), p.atkDir);
        const c = Phaser.Geom.Rectangle.Intersection(box, e.rect);
        if (r === 'blocked') {
          // escudo: faíscas frias, o golpe volta e empurra o cavaleiro
          blocked = true;
          this.clangs.explode(12, c.centerX, c.centerY);
          this.sfx('clang');
          continue;
        }
        if (r !== 'hit') continue;
        hit = true;
        this.sparks.explode(10, c.centerX, c.centerY);
        this.sfx(e.alive ? 'hit' : 'kill');
        this.gainAmber(e);
        if (!e.alive) this.onKill(e);
        // o gancho da corrente traz os leves para perto
        else if (p.weapon.pull && LIGHT.has(e.kind) && (p.atkDir === 'side' || p.atkDir === 'low')) this.pulls.push({ e, dir: Math.sign(p.x - e.zone.x) || 1, t: 0.16 });
      }
      if (parried) {
        this.onParry(parried.x, parried.y, true);
        hit = false;
        blocked = false;
      }
      if (blocked && !hit) {
        p.onBlocked();
        this.hitstop(0.06);
        this.cameras.main.shake(60, 0.003);
        pad.rumble(0.2, 0.3, 60);
      }
      if (this.fixtures.strike(box, p)) hit = true;
      if (this.mine?.strike(box, p)) hit = true;
      if (p.atkDir === 'down' && !p.hitSet.has('spikes') && this.level.touchesSpikes(box.x, box.y, box.width, box.height)) {
        p.hitSet.add('spikes');
        hit = true;
        this.sparks.explode(6, p.x, box.bottom - 8);
        this.sfx('hit');
      }
      if (hit) {
        // quanto mais pesada a arma, mais o impacto segura e treme
        const w = p.weapon;
        const heavy = w.quake || w.pick ? 2 : w.id === 'scythe' ? 1 : 0;
        p.onAttackHit();
        this.hitstop([0.05, 0.07, 0.09][heavy]);
        this.cameras.main.shake([70, 70, 100][heavy], [0.003, 0.005, 0.007][heavy]);
        pad.rumble([0.1, 0.3, 0.45][heavy], 0.45, [70, 110, 150][heavy]);
      }
    }
    if (p.dead || this.respawning || this.transitioning) return;
    const pr = p.rect;
    // dash fantasma: atravessa os inimigos e os golpes deles sem levar dano
    if (p.ghost) {
      this.ghostThrough(pr);
      return;
    }
    // deslizando, o cavaleiro passa por baixo; nas pernas do guarda ele derruba
    if (p.sliding) for (const e of this.enemies) if (e.alive) e.slideInto?.(pr, p.x);
    for (const e of this.enemies) {
      // parado pela Lembrança, o golpe dele fica no ar sem chegar
      if (this.held.has(e)) continue;
      if (e.alive && e.harms(pr, p.untouchable) && p.hurt(e.harmFrom ?? e.zone.x)) {
        this.onHurt();
        break;
      }
    }
  }

  private ghostThrough(pr: Phaser.Geom.Rectangle) {
    const p = this.player;
    if (this.passDash !== p.dashCount) {
      this.passDash = p.dashCount;
      this.passed.clear();
    }
    for (const e of this.enemies) {
      if (!e.alive || this.passed.has(e) || !overlap(pr, e.rect)) continue;
      this.passed.add(e);
      const c = Phaser.Geom.Rectangle.Intersection(pr, e.rect);
      if (p.veiling) {
        // a tinta passa por dentro do inimigo e respinga do outro lado
        this.abyssDrips.explode(7, c.centerX, c.centerY);
        this.abyssMotes.explode(4, c.centerX, c.centerY);
      } else this.wisps.explode(12, c.centerX, c.centerY);
      this.sfx('ghost', 0.55, 0.9 + Math.random() * 0.2);
      if (!progress.seen.has('ghost:first')) {
        progress.seen.add('ghost:first');
        ui.thought('Por um instante, nada me toca.', 3600);
      }
    }
  }

  // inimigo derrotado: deixa moedas e, de vez em quando, um caco de vida
  private onKill(e: Enemy) {
    // a sombra não deixa moedas no chão: devolve as dela direto na bolsa (echoDefeated)
    if (this.looted.has(e) || e.kind === 'echo') return;
    this.looted.add(e);
    this.loot.drop(e.kind, e.zone.x, e.zone.y);
    progress.kill(e.kind);
    const t = this.tracks.find((k) => k.e === e);
    if (t && t.f !== PASSED) this.markPassed(t);
  }

  // ---------- poderes de memória ----------
  // o golpe que entra enche as contas de Âmbar (mais um pouco se derrubou). O primeiro golpe numa
  // criatura das Minas é quando ele lembra da Lembrança: o Âmbar dela gruda na arma
  private gainAmber(e: Enemy) {
    if (!progress.powers.size) {
      if (e.kind === 'miner' || e.kind === 'ambat') this.learnPower('lembranca');
      return;
    }
    const k = progress.on('rawamber') ? MINE_ITEMS.rawAmber : 1;
    if (progress.gainAmber((AMBER_BAR.hit + (e.alive ? 0 : AMBER_BAR.kill)) * k) > 0) this.registry.set('amber', progress.amber);
  }

  // quanto do golpe do cavaleiro o Eco tira (a Lasca do espelho devolve a força inteira)
  get echoMul() {
    return progress.on('mirror') ? MINE_ITEMS.mirrorDmg : AMBER_BAR.echoDmg;
  }

  learnPower(id: PowerId) {
    if (!progress.learn(id)) return false;
    const p = this.player;
    const info = POWERS[id];
    // o primeiro Âmbar enche as três contas de uma vez, para ele experimentar ali mesmo
    if (progress.powers.size === 1) progress.amber = AMBER_BAR.max;
    progress.save();
    this.applyProgress();
    this.sfx('chime');
    this.sfx('glass', 0.6, 0.8);
    this.gold.explode(18, p.x, p.body.center.y);
    this.glowBurst(p.x, p.body.center.y, PAL.gold, 5);
    ui.banner(info.name, `Poder de memória · ${info.text}`, 4200);
    this.time.delayedCall(4400, () => ui.thought(ui.format(POWER_TIPS[id]), 6400, true));
    return true;
  }

  // progresso de antes dos poderes: o que ele já passou vale o poder daquele ponto
  private catchUpPowers() {
    if (this.room.theme !== 'mine' || this.cinematic) return;
    if (!progress.powers.has('lembranca') && (progress.seen.has('boss:reflexo') || progress.seen.has('boss:capataz'))) this.learnPower('lembranca');
    else if (!progress.powers.has('eco') && progress.memories.has(BOSSES.reflexo.memory)) this.learnPower('eco');
  }

  private usePower() {
    const p = this.player;
    const id = progress.power;
    if (!id || !progress.powers.has(id) || this.cinematic || this.transitioning || this.respawning || ui.open || p.dead || p.frozen) return;
    if (id === 'lembranca' && this.stopT > 0) return;
    if (id === 'remendo') {
      if (p.hp >= progress.maxHp) return this.powerDeny('Nenhuma rachadura aberta. O ouro fica guardado.');
      if (!p.onGround || p.ride || p.hook || p.inWater) return this.powerDeny('Preciso de chão firme para me ajoelhar.');
    }
    if (!progress.spendAmber(POWERS[id].cost)) return this.powerDeny(null);
    this.registry.set('amber', progress.amber);
    progress.seen.add('used:memory');
    if (id === 'lembranca') this.startStop();
    else if (id === 'eco') this.startEcho();
    else this.startMend();
  }

  // sem Âmbar que chegue (ou sem como usar agora): as contas tremem no canto, com um som abafado
  private powerDeny(why: string | null) {
    this.sfx('locked', 0.45, 1.3);
    this.registry.set('amber-deny', ((this.registry.get('amber-deny') as number | undefined) ?? 0) + 1);
    if (why) ui.thought(why, 2600);
  }

  // Lembrança: o resto do mundo para e só o cavaleiro anda. A sala fica cor de Âmbar velho (tudo
  // embaixo dele; ele mesmo continua com a cor dele), uma onda de ouro sai do corpo e a poeira para no ar
  // O Apito do Capataz chama uma parada curta (whistle): o mesmo véu, mais leve, com o apito do turno
  private startStop(whistle = false) {
    const p = this.player;
    const cam = this.cameras.main;
    const len = whistle ? MINE_ITEMS.whistleStop : AMBER_BAR.stopTime + (progress.on('watch') ? MINE_ITEMS.watchStop : 0);
    this.stopT = len;
    this.stopLen = len;
    if (whistle) {
      this.sfx('chime', 0.8, 1.9);
      this.sfx('chime', 0.5, 2.3);
    } else {
      this.sfx('veil', 0.9, 0.42);
      this.sfx('chime', 0.55, 0.55);
    }
    pad.rumble(0.25, 0.5, 200);
    for (const o of this.stopFx) o.destroy();
    this.stopFx = [];
    const so = screenOrigin(cam);
    const tint = this.add.rectangle(so.x, so.y, VIEW_W, VIEW_H, 0xffd29a).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.enemy + 1.5).setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(0);
    const warm = this.add.rectangle(so.x, so.y, VIEW_W, VIEW_H, 0x3a2208).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.enemy + 1.6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.tweens.add({ targets: tint, alpha: 1, duration: 160 });
    this.tweens.add({ targets: warm, alpha: 0.4, duration: 160 });
    this.stopFx.push(tint, warm);
    const ring = this.add.graphics().setDepth(DEPTH.enemy + 1.7);
    const cx = p.x;
    const cy = p.body.center.y;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 560,
      ease: 'Quad.easeOut',
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        ring.clear().lineStyle(2, PAL.gold, 0.85 * (1 - k)).strokeCircle(cx, cy, 8 + k * 420);
      },
      onComplete: () => ring.destroy(),
    });
    const v = cam.worldView;
    for (let i = 0; i < (whistle ? 12 : 28); i++) {
      const m = this.add.image(v.x + Math.random() * v.width, v.y + Math.random() * v.height, 'px')
        .setTint(i % 3 ? PAL.gold : 0xffe6a6).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy + 1.8).setScale(0.5 + Math.random() * 0.8).setAlpha(0);
      this.tweens.add({ targets: m, alpha: 0.45 + Math.random() * 0.4, duration: 200, delay: Math.random() * 220 });
      this.stopFx.push(m);
    }
    if (whistle) this.thinkOnce('item:whistle:stop', 'O apito do fim do turno. Por um instante, até eles obedecem.');
    else this.thinkOnce('power:stop', 'Tudo parou. A poeira, a pedra, eles. Só eu ando.');
  }

  private endStop() {
    this.stopT = 0;
    this.sfx('veil', 0.55, 0.75);
    for (const o of this.stopFx) {
      const g = o as Phaser.GameObjects.Image;
      // a poeira volta a cair e a cor volta
      if (g.type === 'Image') this.tweens.add({ targets: g, y: g.y + 16 + Math.random() * 24, alpha: 0, duration: 500 + Math.random() * 500, onComplete: () => g.destroy() });
      else this.tweens.add({ targets: g, alpha: 0, duration: 320, onComplete: () => g.destroy() });
    }
    this.stopFx = [];
  }

  // a Lembrança segura o inimigo: o corpo para (guardando se ele andava), a animação para e ele não
  // pensa. Os chefes se soltam antes do fim
  private hold(e: Enemy) {
    const on = this.stopT > 0 && e.alive && (e.kind !== 'boss' || this.stopT > this.stopLen * (1 - AMBER_BAR.bossStop));
    const was = this.held.has(e);
    const spr = (e as unknown as { sprite?: Phaser.GameObjects.Sprite }).sprite;
    if (on && !was) {
      this.held.set(e, e.body.moves);
      e.body.moves = false;
      spr?.anims?.pause();
    } else if (!on && was) {
      e.body.moves = this.held.get(e)!;
      this.held.delete(e);
      spr?.anims?.resume();
    }
    return on;
  }

  // Eco: a cópia de tinta sai do cavaleiro e passa a repetir tudo um instante depois
  private startEcho() {
    const p = this.player;
    const len = AMBER_BAR.echoTime + (progress.on('watch') ? MINE_ITEMS.watchEcho : 0);
    if (this.memEcho && !this.memEcho.done) this.memEcho.renew(len);
    else this.memEcho = new MemoryEcho(this, len);
    this.sfx('veil-form', 0.7, 1.2);
    this.sfx('glass', 0.4, 1.5);
    this.glowBurst(p.x, p.body.center.y, PAL.gold, 3);
    this.thinkOnce('power:echo', 'A imagem do espelho veio comigo. Agora ela bate do meu lado.');
  }

  // o golpe do Eco: a mesma área do golpe do cavaleiro, um instante depois e mais fraco. Não enche o
  // Âmbar nem segura o jogo no impacto
  echoStrike(box: Phaser.Geom.Rectangle, fromX: number, dir: AttackDir, done: Set<unknown>) {
    const p = this.player;
    const dmg = p.weapon.dmg * progress.dmgFor(p.weapon.id) * this.echoMul;
    for (const e of this.enemies) {
      if (!e.alive || done.has(e) || !overlap(box, e.rect)) continue;
      done.add(e);
      const r = e.hit(fromX, dmg, dir);
      const c = Phaser.Geom.Rectangle.Intersection(box, e.rect);
      if (r === 'blocked') {
        this.clangs.explode(6, c.centerX, c.centerY);
        this.sfx('clang', 0.5, 1.1);
        continue;
      }
      if (r !== 'hit') continue;
      this.abyssDrips.explode(6, c.centerX, c.centerY);
      this.gold.explode(4, c.centerX, c.centerY);
      this.sfx(e.alive ? 'hit' : 'kill', 0.55, 0.85);
      if (!e.alive) this.onKill(e);
    }
  }

  // Remendo: ajoelha e o ouro escorre da máscara até a ferida. Machucado no meio, não fecha
  private startMend() {
    const p = this.player;
    this.mendT = AMBER_BAR.mendTime;
    this.mendHp = p.hp;
    p.body.setVelocity(0, 0);
    p.kneel();
    this.sfx('mend', 0.9);
    this.gold.explode(10, p.x, p.body.top + 8);
  }

  private cancelMend() {
    this.mendT = 0;
    const p = this.player;
    this.gold.explode(6, p.x, p.body.bottom - 4);
    if (p.pose === 'kneel' && !p.dead) p.getUp(() => {});
  }

  private updatePowers(dt: number) {
    if (this.stopT > 0) {
      this.stopT -= dt;
      if (this.stopT <= 0) this.endStop();
    }
    if (this.memEcho) {
      this.memEcho.update(dt);
      if (this.memEcho.done) this.memEcho = null;
    }
    if (this.mendT > 0) {
      const p = this.player;
      this.mendT -= dt;
      if (Math.random() < dt * 30) this.gold.emitParticle(1, p.x + (Math.random() - 0.5) * 8, p.body.top + 6);
      if (this.mendT <= 0) {
        this.mendT = 0;
        if (!p.dead && p.hp >= this.mendHp) {
          p.hp = Math.min(progress.maxHp, p.hp + 1);
          this.registry.set('hp', p.hp);
          this.sfx('chime', 0.7, 1.25);
          this.glowBurst(p.x, p.body.center.y, PAL.gold, 3);
          this.thinkOnce('power:mend', 'O ouro fecha a rachadura. Dói menos do que lembrar.');
        }
        if (p.pose === 'kneel' && !p.dead) p.getUp(() => {});
      }
    }
  }

  // ---------- fragmentação ----------
  // a tela racha: linhas finas saindo de perto do meio, que somem devagar (devolve o desenho)
  crackScreen() {
    const cam = this.cameras.main;
    const so = screenOrigin(cam);
    const g = this.add.graphics().setScrollFactor(0).setDepth(200);
    const cx = so.x + VIEW_W / 2 + (Math.random() - 0.5) * 80;
    const cy = so.y + VIEW_H / 2 + (Math.random() - 0.5) * 40;
    for (let k = 0; k < 9; k++) {
      let a = (k / 9) * Math.PI * 2 + Math.random() * 0.4;
      let x = cx;
      let y = cy;
      g.lineStyle(1, k % 2 ? 0xffe6a6 : 0xbca4ff, 0.9);
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 7; j++) {
        a += (Math.random() - 0.5) * 0.7;
        const L = 14 + Math.random() * 26;
        x += Math.cos(a) * L;
        y += Math.sin(a) * L;
        g.lineTo(x, y);
      }
      g.strokePath();
    }
    this.tweens.add({ targets: g, alpha: 0, delay: 900, duration: 1600, onComplete: () => g.destroy() });
    return g;
  }

  // por um fio nas Minas (sem chefe na sala): a lembrança dele racha. A onda roxa passa, o chão
  // fica leve e sobem fiapos de tinta longe dele, que caem com um golpe e dão Âmbar
  private fragmentSelf() {
    const p = this.player;
    if (this.room.theme !== 'mine' || this.boss?.alive || this.clock < this.fragNext || this.cinematic) return;
    this.fragNext = this.clock + FRAGMENT.every;
    this.fragLowT = FRAGMENT.lowT;
    p.gravMul = FRAGMENT.lowGrav;
    this.sfx('veil', 0.9, 0.7);
    this.sfx('glass', 0.9, 0.5);
    this.cameras.main.shake(700, 0.006);
    this.fragmentWave(p.x, p.body.center.y);
    this.crackScreen();
    const v = this.cameras.main.worldView;
    const spots = [-150, 150, -230, 230].map((dx) => p.x + dx).filter((x) => x > v.x + 20 && x < v.right - 20);
    for (const x of spots.slice(0, FRAGMENT.wisps)) {
      const e = new InkWisp(this, x, p.body.bottom - 30 - Math.random() * 40);
      this.enemies.push(e);
    }
    this.thinkOnce('fragment:self', 'Por um fio. A lembrança racha e o chão fica leve. Os fiapos têm Âmbar.');
  }

  private updateFragment(dt: number) {
    if (this.fragLowT <= 0) return;
    this.fragLowT -= dt;
    const p = this.player;
    if (this.fragLowT <= 0 || p.dead) {
      this.fragLowT = 0;
      p.gravMul = 1;
    } else if (Math.random() < dt * 8) this.echoMotes(p.x + (Math.random() - 0.5) * 300, p.body.bottom - Math.random() * 10, false);
  }

  // ---------- trechos vencidos ----------
  // o inimigo fica vencido quando o cavaleiro passa por ele (de um lado ao outro, ou por cima e
  // por baixo) ou o derrota
  private trackPasses() {
    const p = this.player;
    if (p.dead || this.respawning) return;
    const px = p.x;
    const py = p.body.center.y;
    for (const t of this.tracks) {
      if (t.f === PASSED) continue;
      const dx = px - t.hx;
      const dy = py - t.hy;
      if (Math.abs(dy) < 112) {
        if (dx < -24) t.f |= 1;
        else if (dx > 24) t.f |= 2;
      }
      if (Math.abs(dx) < 96) {
        if (dy < -32) t.f |= 4;
        else if (dy > 32) t.f |= 8;
      }
      if ((t.f & 3) === 3 || (t.f & 12) === 12) this.markPassed(t);
    }
  }

  private markPassed(t: Track) {
    t.f = PASSED;
    progress.seen.add(`pass:${t.key}`);
    this.dirty = true;
  }

  // descanso: todo inimigo vencido, em qualquer sala, vira cinza e não volta mais.
  // Os desta sala se desfazem na frente do jogador, primeiro os mais perto.
  private clearPassed() {
    let n = 0;
    for (const k of [...progress.seen]) {
      if (!k.startsWith('pass:')) continue;
      progress.seen.delete(k);
      progress.seen.add(`clear:${k.slice(5)}`);
      n++;
    }
    const p = this.player;
    const here = this.tracks.filter((t) => t.f === PASSED);
    this.tracks = this.tracks.filter((t) => t.f !== PASSED);
    let first = true;
    for (const t of here) {
      if (!t.e.alive) continue;
      const rect = Phaser.Geom.Rectangle.Clone(t.e.rect);
      const spr = t.e.vanish?.();
      if (!spr) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.body.center.y, rect.centerX, rect.centerY);
      this.toAsh(spr, rect, 500 + Math.min(1400, d * 1.6), first);
      first = false;
    }
    return n;
  }

  // a criatura acinzenta e esfarela de cima para baixo, soltando cinza
  private toAsh(spr: Phaser.GameObjects.Sprite, rect: Phaser.Geom.Rectangle, delay: number, sound: boolean) {
    spr.anims.stop();
    this.time.delayedCall(delay, () => {
      if (!spr.active) return;
      if (sound) this.sfx('ash', 0.8);
      spr.setTintFill(0xfff1d6);
      this.time.delayedCall(70, () => spr.active && spr.setTint(0x8f8a84));
      // o recorte conta pixels da folha; nas folhas no traço liso há mais deles que no mundo
      const k = 1 / spr.scaleY;
      const fw = spr.frame.realWidth;
      const fh = spr.frame.realHeight;
      const top0 = spr.y - spr.displayOriginY / k;
      const from = Phaser.Math.Clamp((rect.y - top0 - 8) * k, 0, fh);
      const to = Phaser.Math.Clamp((rect.bottom - top0 + 4) * k, 0, fh);
      const cut = { v: from };
      this.tweens.add({
        targets: cut,
        v: to,
        delay: 140,
        duration: 900,
        ease: 'Sine.easeIn',
        onUpdate: () => {
          const c = Math.floor(cut.v);
          spr.setCrop(0, c, fw, fh - c);
          for (let i = 0; i < 3; i++) this.ash.emitParticle(1, rect.x + Math.random() * rect.width, top0 + c / k);
        },
        onComplete: () => spr.destroy(),
      });
    });
  }

  // ---------- onda do badalo ----------
  quake(x: number, floorY: number, dir: number) {
    const cam = this.cameras.main;
    this.sfx('quake');
    this.sfx('bell', 0.22, 1.9);
    cam.shake(150, 0.006);
    pad.rumble(0.5, 0.7, 170);
    this.dustBurst(x, floorY, 10);
    const glow = this.add.image(x, floorY - 3, 'glow').setTint(0xffcf7a).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.slash).setScale(1.6, 0.55).setAlpha(0.8);
    this.quakes.push({ x, y: floorY, dir, t: 0, dustT: 0, hit: new Set(), glow });
  }

  private updateQuakes(dt: number) {
    if (!this.quakes.length) return;
    for (const q of this.quakes) {
      q.t += dt;
      q.x += q.dir * QUAKE.speed * dt;
      // corre enquanto houver chão embaixo e nada na frente
      const floor = isGround(this.level.tileAt(q.x, q.y + 2));
      const blocked = isSolid(this.level.tileAt(q.x, q.y - 6));
      if (q.t >= QUAKE.life || !floor || blocked) {
        this.dustBurst(q.x - q.dir * 6, q.y, 6);
        q.t = QUAKE.life + 1;
        this.tweens.add({ targets: q.glow, alpha: 0, scaleX: 0.4, duration: 160, onComplete: () => q.glow.destroy() });
        continue;
      }
      const k = 1 - q.t / QUAKE.life;
      q.glow.setPosition(q.x, q.y - 3).setAlpha(0.25 + 0.6 * k).setScale(1.1 + 0.7 * k, 0.5);
      q.dustT -= dt;
      if (q.dustT <= 0) {
        q.dustT = 0.025;
        this.dustBurst(q.x, q.y, 2);
      }
      const box = new Phaser.Geom.Rectangle(q.x - 10, q.y - QUAKE.height, 20, QUAKE.height);
      for (const e of this.enemies) {
        if (!e.alive || q.hit.has(e) || !overlap(box, e.rect)) continue;
        q.hit.add(e);
        const r = e.hit(q.x - q.dir * 20, QUAKE.dmg * progress.dmgFor('badalo'), 'quake');
        if (r !== 'hit') continue;
        this.sparks.explode(8, q.x, q.y - 6);
        this.sfx(e.alive ? 'hit' : 'kill', 0.8, 0.8);
        this.hitstop(0.04);
        if (!e.alive) this.onKill(e);
      }
    }
    this.quakes = this.quakes.filter((q) => q.t <= QUAKE.life);
  }

  // ---------- incensário do cavaleiro ----------
  incenseCloud(x: number, y: number) {
    this.censerClouds.spawn(x, y, INCENSE.w, INCENSE.h, INCENSE.life);
    this.sfx('smoke', 0.45, 1.25);
  }

  private updateCenserClouds(dt: number) {
    const f = this.censerClouds;
    f.update(dt);
    for (const c of f.list) {
      // queima um instante depois do golpe (o dano do golpe e o da brasa não se confundem)
      if (c.t < 0.22 || !f.burning(c)) continue;
      const r = f.rect(c);
      for (const e of this.enemies) {
        if (!e.alive || c.hit.has(e) || !overlap(r, e.rect)) continue;
        c.hit.add(e);
        if (e.hit(c.x, INCENSE.dmg * progress.dmgFor('incensario'), 'smoke') !== 'hit') continue;
        const hx = Phaser.Math.Clamp(c.x, e.rect.x, e.rect.right);
        this.sparks.explode(5, hx, Math.max(r.y + 6, e.rect.y + 8));
        this.incense(hx, e.rect.centerY, 3);
        this.sfx(e.alive ? 'hit' : 'kill', 0.45, 1.3);
        if (!e.alive) this.onKill(e);
      }
    }
  }

  markDirty() {
    this.dirty = true;
  }

  spawnArrow(x: number, y: number, dx: number, dy: number, dmg: number) {
    this.arrows.push(new Arrow(this, x, y, dx, dy, dmg * progress.dmgFor('bow')));
    // o espelho guarda a flechada também (e o Eco repete)
    if (this.boss instanceof Reflexo && this.boss.alive) this.boss.noteShot(x, y, dx, dy);
    this.memEcho?.noteShot(x, y, dx, dy, dmg * progress.dmgFor('bow'));
  }

  // a flecha repetida pelo Eco, do lugar de onde o cavaleiro atirou
  echoArrow(x: number, y: number, dx: number, dy: number, dmg: number) {
    this.arrows.push(new Arrow(this, x, y, dx, dy, dmg, { echo: true }));
    this.sfx('bow', 0.4, 1.2);
  }

  // a fragmentação: a onda roxa passa pela sala inteira e a cor some por um instante
  fragmentWave(x: number, y: number) {
    this.memWave?.start(x, y, 'corrupt', { radius: 900, hold: 1.4 });
  }

  // flecha do arqueiro da sacada (machuca o cavaleiro até ser rebatida)
  spawnEnemyArrow(x: number, y: number, dx: number, dy: number) {
    this.arrows.push(new Arrow(this, x, y, dx, dy, 1, { hostile: true, speed: ARCHER.arrowSpeed, life: ARCHER.arrowLife }));
    this.sfx('bow', 0.75, 0.8);
  }

  // incenso subindo (do incensário e das nuvens no chão)
  incense(x: number, y: number, n: number) {
    this.smoke.emitParticle(n, x, y);
  }

  // aparou: tinido, clarão e um instante parado. Rebater uma flecha é mais leve
  onParry(x: number, y: number, stun: boolean) {
    this.sfx('parry', stun ? 1 : 0.8);
    this.sparks.explode(stun ? 22 : 12, x, y);
    this.clangs.explode(stun ? 14 : 8, x, y);
    const g = this.add.image(x, y, 'glow').setTint(0xfff1d0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.slash + 1).setScale(0.4).setAlpha(1);
    this.tweens.add({ targets: g, scale: stun ? 3 : 1.8, alpha: 0, duration: 280, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
    this.hitstop(stun ? PARRY.hitstop : 0.06);
    this.cameras.main.shake(stun ? 140 : 80, stun ? 0.006 : 0.003);
    if (stun) this.cameras.main.flash(70, 60, 54, 40);
    pad.rumble(0.35, 0.8, stun ? 140 : 80);
    this.player.onAttackHit();
    this.onPlayerAction('parry');
    // o Apito do Capataz: aparar apita o fim do turno e o mundo para um instante, sem gastar Âmbar
    // (uma Lembrança mais longa que ainda esteja valendo não encurta)
    if (stun && progress.on('whistle') && this.stopT < MINE_ITEMS.whistleStop && !this.transitioning) this.startStop(true);
    if (!progress.seen.has('parry:first')) {
      progress.seen.add('parry:first');
      this.time.delayedCall(500, () => ui.thought(stun ? 'Bem na hora. O golpe voltou e ele ficou aberto.' : 'A flecha voltou para quem atirou.', 4200));
    }
  }

  private updateArrows(dt: number) {
    const p = this.player;
    for (const a of this.arrows) {
      if (a.dead) continue;
      // a Lembrança segura a flecha inimiga no ar
      if (a.hostile && this.stopT > 0) continue;
      if (a.update(dt, this.level) === 'wall') {
        this.sparks.explode(4, a.tip.x, a.tip.y);
        this.sfx('thunk', a.hostile ? 0.6 : 1);
        if (!a.hostile) this.fixtures.arrow(a.rect, a.tip, a.x - a.dx * 20);
        continue;
      }
      if (a.dead || a.stuck) continue;
      if (a.hostile) {
        // golpe na flecha: rebate de volta pelo mesmo caminho
        if (p.attacking && overlap(a.rect, p.attackBox())) {
          a.deflect(-a.dx, -a.dy, ARCHER.backSpeed, ARCHER.backDmg * progress.dmgFor(p.weapon.id));
          this.onParry(a.x, a.y, false);
          continue;
        }
        // o dash fantasma atravessa a flecha
        if (p.dead || p.ghost || this.respawning || this.transitioning || !overlap(a.rect, p.rect)) continue;
        if (p.hurt(a.x - a.dx * 20)) {
          a.destroy();
          this.onHurt();
        }
        continue;
      }
      if (this.fixtures.arrow(a.rect, a.tip, a.x - a.dx * 20)) {
        a.destroy();
        continue;
      }
      for (const e of this.enemies) {
        if (!e.alive || !overlap(a.rect, e.rect)) continue;
        const r = e.hit(a.x - a.dx * 20, a.dmg, 'arrow');
        if (r === 'blocked') {
          this.clangs.explode(8, a.tip.x, a.tip.y);
          this.sfx('clang', 0.7);
        } else {
          this.sparks.explode(8, a.tip.x, a.tip.y);
          this.sfx(e.alive ? 'hit' : 'kill', a.echo ? 0.55 : 1);
          if (!a.echo) this.gainAmber(e);
          if (!e.alive) this.onKill(e);
          if (!a.echo) this.hitstop(0.035);
        }
        a.destroy();
        break;
      }
    }
    this.arrows = this.arrows.filter((a) => !a.dead);
  }

  private hazards() {
    const p = this.player;
    // no Véu nem os espinhos tocam o corpo (só na janela do dash)
    if (this.respawning || p.dead || this.transitioning || p.veiling) return;
    const b = p.body;
    const spiked = this.level.touchesSpikes(b.x + 1, b.y, b.width - 2, b.height);
    const fell = this.room.pit && b.top > this.level.heightPx + 8;
    if (!spiked && !fell) return;
    this.respawning = true;
    if (p.hurt(b.center.x)) this.onHurt();
    if (p.dead) return;
    p.frozen = true;
    const cam = this.cameras.main;
    this.time.delayedCall(fell ? 60 : 220, () => {
      cam.fadeOut(160, 7, 8, 13);
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        p.teleport(p.lastSafe.x, p.lastSafe.y);
        p.body.setVelocity(0, 0);
        cam.fadeIn(220, 7, 8, 13);
        this.time.delayedCall(180, () => {
          p.frozen = false;
          this.respawning = false;
        });
      });
    });
  }

  private water() {
    const p = this.player;
    const inWater = this.level.inWater(p.x, p.body.bottom - 2);
    p.inWater = inWater;
    if (inWater && !this.wasInWater) {
      const surface = Math.floor((p.body.bottom - 2) / TILE) * TILE + 3;
      this.waterFx.explode(12, p.x, surface);
      this.sfx('splash');
    }
    if (inWater && Math.abs(p.body.velocity.x) > 30 && Math.random() < 0.25) {
      const surface = Math.floor((p.body.bottom - 2) / TILE) * TILE + 3;
      this.waterFx.explode(1, p.x - p.facing * 4, surface);
    }
    this.wasInWater = inWater;
  }

  private onHurt() {
    const p = this.player;
    // machucado de joelhos: o ouro escorre e a ferida não fecha
    if (this.mendT > 0) this.cancelMend();
    this.registry.set('hp', p.hp);
    // por um fio: a Flor prensada vale antes (uma vez por descanso); sem ela, nas Minas, a lembrança racha
    if (p.hp === 1 && !p.dead) {
      if (progress.on('flower') && !progress.seen.has('flower:spent')) this.flowerHeal();
      else this.fragmentSelf();
    }
    this.sfx('hurt');
    pad.rumble(0.75, 0.5, 230);
    this.hitstop(0.14);
    this.cameras.main.shake(180, 0.009);
    this.cameras.main.flash(110, 120, 132, 160);
    this.shards.explode(8, p.x, p.body.top + 10);
    if (p.dead) this.onDeath();
  }

  private onDeath() {
    const cam = this.cameras.main;
    this.transitioning = true;
    ui.hint(null);
    // 70% das moedas ficam com a sombra, onde ele caiu (a sombra antiga, se havia, some com as
    // dela). Grava junto o que mudou até aqui, sem mudar o ponto de retorno
    const spot = this.echoSpot();
    progress.seen.delete('flower:spent');
    const { lost, gone } = progress.die(this.room.id, spot.x, spot.y);
    this.dirty = false;
    this.registry.set('echo-news', { lost, gone });
    if (lost > 0) {
      this.registry.set('coins-loss', true);
      this.registry.set('coins', progress.coins);
      const p = this.player;
      for (let i = 0; i < 4; i++) this.time.delayedCall(i * 90, () => this.echoMotes(p.x, p.body.center.y, false, 8));
    }
    this.sfx('crack');
    pad.rumble(1, 0.8, 560);
    this.time.delayedCall(600, () => {
      cam.fadeOut(900, 0, 0, 0);
      // volta para a última vela acesa
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart({ room: progress.room, entry: progress.entry, from: 'death' } satisfies GameInit));
    });
  }

  hitstop(s: number) {
    this.hitstopT = Math.max(this.hitstopT, s);
    this.physics.world.pause();
  }

  // ---------- história, dicas e portas ----------
  onPlayerAction(a: PlayerAction) {
    progress.seen.add(`used:${a}`);
  }

  private story() {
    const p = this.player;
    const tx = p.x / TILE;
    if (!this.cinematic && !this.transitioning) {
      const ty = p.body.bottom / TILE - 1;
      this.room.thoughts.forEach((t, i) => {
        const key = `thought:${this.room.id}:${i}`;
        if (progress.seen.has(key) || Math.abs(tx - t.x) > 1.5) return;
        if (t.y !== undefined && Math.abs(ty - t.y) > 3) return;
        progress.seen.add(key);
        ui.thought(t.text);
      });
    }
    // dica: perto do espelho ela vira um convite; no resto, a dica do trecho
    let hint: string | null = null;
    const m = this.decor.mirror;
    if (m && !this.transitioning && !this.cinematic) {
      const near = Math.abs(p.x - m.x) < 30 && Math.abs(p.body.bottom - m.y) < 10 && p.onGround;
      if (near) {
        hint = '{up} tocar o espelho';
        this.gold.explode(1, m.x - 16 + Math.random() * 32, m.y - 10 - Math.random() * 60);
        if (this.controls.pressed.up) {
          this.enterMirror();
          hint = null;
        }
      } else if (Math.random() < 0.08) this.gold.explode(1, m.x - 16 + Math.random() * 32, m.y - 10 - Math.random() * 60);
    }
    if (!hint && !this.cinematic && !this.transitioning && !p.dead) {
      this.props.touch(p);
      this.fixtures.touch(p);
      const near = this.mine?.nearby(p) ?? this.props.nearby(p) ?? this.fixtures.nearby(p) ?? this.npcs.nearby(p);
      if (near) {
        hint = near.hint;
        if (this.controls.pressed.up) {
          hint = null;
          near.act();
        }
      }
    }
    if (!hint && !this.cinematic && !this.transitioning) {
      for (const h of this.room.hints) {
        if (tx < h.x0 || tx > h.x1) continue;
        if (h.needs && !progress.abilities.has(h.needs)) continue;
        if (h.until && progress.seen.has(`used:${h.until}`)) continue;
        hint = h.text;
        break;
      }
    }
    ui.hint(hint);
    if (this.figure && this.figureState !== 'done') this.updateFigure();
  }

  private updateFigure() {
    const fig = this.figure!;
    const dx = fig.x - this.player.x;
    if (this.figureState === 'idle' && Math.abs(dx) < 150) {
      this.figureState = 'turned';
      fig.play('figure-turn');
      fig.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fig.play('figure-wave'));
    }
    if (this.figureState === 'turned' && Math.abs(dx) < 46 && !this.transitioning) {
      this.figureState = 'done';
      this.leaveMemory();
    }
  }

  private enterMirror() {
    const m = this.decor.mirror!;
    this.transitioning = true;
    this.player.frozen = true;
    ui.hint(null);
    audio.music('none', 1.2);
    const cam = this.cameras.main;
    cam.shake(1100, 0.0035);
    pad.rumble(0.35, 0.8, 1000);
    this.fx.shatter(m.x - cam.worldView.x, m.y - 42 - cam.worldView.y, () => {
      this.scene.restart({ room: 'memoria', entry: '1', from: 'mirror' } satisfies GameInit);
    });
  }

  private leaveMemory() {
    this.transitioning = true;
    this.player.frozen = true;
    audio.music('none', 2.5);
    if (!progress.seen.has('memory:vale')) {
      progress.kintsugi = Math.min(3, progress.kintsugi + 1);
      progress.prologueDone = true;
    }
    this.time.delayedCall(500, () => {
      this.fx.fadeWhite(1, 1800, () => this.scene.restart({ room: 'catacumbas', entry: '2', from: 'memory' } satisfies GameInit));
    });
  }

  private exits() {
    if (this.transitioning || this.player.dead) return;
    const b = this.player.body;
    const W = this.level.widthPx;
    const H = this.level.heightPx;
    const col = b.center.x / TILE;
    // nas saídas de cima e de baixo só vale o trecho do buraco (fora dele o cavaleiro volta a cair)
    const inRange = (e: Exit) => !e.range || (col >= e.range[0] && col <= e.range[1] + 1);
    // nas de lado, as linhas (uma sala pode ter duas saídas do mesmo lado, em alturas diferentes)
    const row = b.center.y / TILE;
    const inRows = (e: Exit) => !e.range || (row >= e.range[0] - 1 && row <= e.range[1] + 1);
    const ex = this.room.exits.find(
      (e) =>
        (e.side === 'right' && b.center.x > W + 2 && inRows(e)) ||
        (e.side === 'left' && b.center.x < -2 && inRows(e)) ||
        // por cima basta a cabeça passar da borda (subindo pelo gancho ou pela parede)
        (e.side === 'up' && b.top < -6 && inRange(e)) ||
        (e.side === 'down' && b.center.y > H + 2 && inRange(e)),
    );
    if (ex) this.goTo(ex);
  }

  private goTo(ex: { to: RoomId; entry: string; side?: Side }) {
    this.transitioning = true;
    ui.hint(null);
    if (this.dirty) progress.save();
    this.registry.set('hp', this.player.hp);
    const cam = this.cameras.main;
    cam.fadeOut(260, 7, 8, 13);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.restart({ room: ex.to, entry: ex.entry, from: 'door', via: ex.side } satisfies GameInit),
    );
  }

  // ---------- Gancho de Corrente ----------
  // a argola que o gancho alcança: à vista e dentro do alcance; a da frente e a de cima valem mais
  hookTarget(p: Player): Ring | null {
    const b = p.body;
    const cx = b.center.x;
    const cy = b.top + 14;
    let best: Ring | null = null;
    let score = Infinity;
    for (const r of this.fixtures.rings) {
      const dx = r.x - cx;
      const dy = r.y - cy;
      const d = Math.hypot(dx, dy);
      if (d > PLAYER.hookRange || d < 14 || !this.clearLine(cx, cy, r.x, r.y)) continue;
      // a argola de onde ele acabou de sair não conta: o gancho segue para a próxima
      if (p.lastRingT > 0 && p.lastRing && Math.abs(p.lastRing.x - r.x) < 1 && Math.abs(p.lastRing.y - r.y) < 1) continue;
      const behind = Math.sign(dx) === -p.facing && Math.abs(dx) > 24;
      const sc = d * (behind ? 1.8 : 1) + (dy > 0 ? 50 : 0);
      if (sc < score) {
        score = sc;
        best = r;
      }
    }
    return best;
  }

  // nada sólido entre os dois pontos
  private clearLine(ax: number, ay: number, bx: number, by: number) {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 6);
    for (let i = 1; i < n; i++) {
      if (isSolid(this.level.tileAt(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n))) return false;
    }
    return true;
  }

  // a ponta do gancho bate em quem estiver no caminho e volta
  private hookHits() {
    const p = this.player;
    const h = p.hook;
    if (!h || h.phase !== 'throw') return;
    for (const e of this.enemies) {
      if (!e.alive || !Phaser.Geom.Rectangle.Contains(e.rect, h.x, h.y)) continue;
      const r = e.hit(p.x, PLAYER.hookDmg, 'side');
      if (r === 'ignored') continue;
      if (r === 'blocked') {
        this.clangs.explode(8, h.x, h.y);
        this.sfx('clang');
      } else {
        this.sparks.explode(8, h.x, h.y);
        this.sfx(e.alive ? 'hit' : 'kill');
        if (!e.alive) this.onKill(e);
      }
      p.hookBounce();
      break;
    }
  }

  // membranas abissais e grades de cela: o primeiro encontro vira pensamento, com e sem o Véu
  private veilThoughts() {
    const p = this.player;
    const L = this.level;
    if (!L.membranes.length && !L.bars.length) return;
    const b = p.body;
    if (p.veiling) {
      if (!progress.seen.has('veil:pass') && L.overlapsVeil(b.x, b.y, b.width, b.height)) {
        progress.seen.add('veil:pass');
        this.markDirty();
        ui.thought('A tinta passou por onde a pedra não deixa. Do outro lado, eu de novo.', 4200);
      }
      return;
    }
    if (!L.membranes.length || progress.seen.has('membrane:first') || p.canVeil) return;
    // encostado numa membrana sem o Véu
    if (L.overlapsVeil(b.x - 3, b.y + 4, b.width + 6, b.height - 8)) {
      progress.seen.add('membrane:first');
      this.markDirty();
      ui.thought('Uma pele de tinta preta, quente como gente. Cede um pouco e volta. Não é para mim. Ainda.', 4600);
    }
  }

  // garras escorregando no ferro liso
  onSlick(x: number, y: number) {
    if (Math.random() < 0.25) this.sparks.explode(1, x, y);
    if (!progress.seen.has('slick:first')) {
      progress.seen.add('slick:first');
      ui.thought('Ferro liso. As garras não seguram.', 3400);
    }
  }

  // ---------- prisão ----------
  onLever(key: string) {
    progress.seen.add(key);
    progress.save();
    this.fixtures.unlock(key);
    const text = LEVERS[key];
    if (text) this.time.delayedCall(800, () => ui.thought(text, 4200));
  }

  thoughtNow(text: string) {
    ui.thought(text, 4200);
  }

  // as chaves da guarita: o alarme toca e o alçapão embaixo cede
  takeKeys(x: number, y: number) {
    progress.seen.add('item:chaves');
    progress.save();
    this.sfx('chime');
    this.sfx('tink', 0.8, 0.8);
    this.gold.explode(12, x, y);
    ui.banner('As chaves da prisão', 'Pesam como uma sentença', 3000);
    this.time.delayedCall(1100, () => {
      this.sfx('bell', 0.9, 0.55);
      this.cameras.main.shake(300, 0.004);
      this.fixtures.unlock('item:chaves');
    });
    this.time.delayedCall(1700, () => this.sfx('bell', 0.7, 0.55));
  }

  private startAlarm() {
    progress.seen.add('alarm:fuga');
    progress.save();
    this.alarmT = 0;
    this.alarmBellT = 0.4;
    for (const s of this.level.spawns) {
      if (s.kind !== 'q') continue;
      const e = new Jailer(this, s.x, s.y, true);
      this.enemies.push(e);
      this.alarmFoes.push(e);
      this.physics.add.collider(e.zone, this.level.layer);
    }
    this.time.delayedCall(1000, () => ui.thought('O alarme. As grades vão descer uma a uma. Corre.', 3200));
  }

  private updateAlarm(dt: number) {
    if (this.alarmT < 0) return;
    this.alarmT += dt;
    const t = this.alarmT;
    const gates = this.fixtures.alarms;
    gates.forEach((a, i) => {
      if (!a.down && t > (ALARM_AT[i] ?? ALARM_END)) this.fixtures.dropAlarm(a);
    });
    // o sino de ferro tocando lá em cima
    this.alarmBellT -= dt;
    if (this.alarmBellT <= 0) {
      this.alarmBellT = 1.5;
      this.sfx('bell', 0.3, 0.55);
    }
    const p = this.player;
    const last = gates[gates.length - 1];
    if (last && !last.down && !this.alarmClean && !p.dead && p.x < last.x * TILE - 6) {
      this.alarmClean = true;
      this.sfx('chime', 0.7, 1.2);
      this.loot.coins(15, p.x, p.body.top - 6);
      ui.thought('Passei antes da última grade. Ninguém tinha escapado por aqui.', 4200);
    }
    const quiet = this.alarmFoes.every((e) => !e.alive);
    if (t > ALARM_END || (quiet && t > (ALARM_AT[ALARM_AT.length - 1] ?? 0) + 2)) this.endAlarm();
  }

  private endAlarm() {
    this.alarmT = -1;
    for (const a of this.fixtures.alarms) this.fixtures.raiseAlarm(a);
    this.sfx('gate', 0.8);
    if (!this.player.dead) ui.thought('O sino parou. As grades sobem devagar.', 3600);
  }

  // Tomé: pede as chaves; com elas, conta a versão dele e vai abrir a porta das máscaras
  private talkPrisoner(n: Npc) {
    const P = PRISONER;
    if (this.room.id !== 'celas') {
      this.talk(P.name, [P.after[n.line++ % P.after.length]], n);
      return;
    }
    if (progress.seen.has('item:chaves')) {
      this.talk(P.name, P.freed, n, () => {
        progress.seen.add('preso:livre');
        progress.save();
        this.sfx('locked', 0.8);
        this.time.delayedCall(260, () => this.sfx('door', 0.8, 1.2));
        this.npcs.release(n);
        this.time.delayedCall(3000, () => ui.thought('Ele foi na frente. A porta das máscaras fica no fim da galeria, embaixo das celas.', 4800));
      });
    } else if (!progress.seen.has('preso:met')) {
      this.talk(P.name, P.first, n, () => {
        progress.seen.add('preso:met');
        progress.save();
      });
    } else this.talk(P.name, [P.waiting[n.line++ % P.waiting.length]], n);
  }

  // ---------- arena dos condenados ----------
  private updateArena(dt: number) {
    const a = this.arena;
    if (!a) return;
    const p = this.player;
    if (!a.started) {
      if (p.dead || this.transitioning || p.x < 11 * TILE) return;
      a.started = true;
      this.props.setGates(false, true);
      this.sfx('clang', 1);
      audio.music('boss', 0.6);
      ui.banner('Arena dos Condenados', 'Quatro levas. Quem ganha, luta de novo amanhã.', 2800);
      a.wait = 2.4;
      return;
    }
    if (a.wave >= ARENA_WAVES.length || p.dead) return;
    if (a.pending > 0 || a.foes.some((e) => e.alive)) return;
    a.wait -= dt;
    if (a.wait > 0) return;
    a.wave++;
    if (a.wave >= ARENA_WAVES.length) {
      this.arenaDone();
      return;
    }
    this.spawnWave(ARENA_WAVES[a.wave]);
    a.wait = 1.6;
  }

  private spawnWave(kinds: string[]) {
    const a = this.arena!;
    const pts = this.level.spawns.filter((s) => s.kind === '*');
    const p = this.player;
    const far = (high: boolean) => pts.filter((s) => (s.ty < 20) === high).sort((m, n) => Math.abs(n.x - p.x) - Math.abs(m.x - p.x));
    const used = { true: 0, false: 0 };
    a.pending += kinds.length;
    kinds.forEach((k, i) => {
      const high = k === 'a' || k === 'v';
      const list = far(high);
      const sp = list[used[`${high}`]++ % list.length];
      this.time.delayedCall(300 + i * 380, () => {
        a.pending--;
        if (this.transitioning) return;
        for (let j = 0; j < 8; j++) this.incense(sp.x + (Math.random() - 0.5) * 26, sp.y - Math.random() * 44, 2);
        const e = SPAWNERS[k](this, sp.x, sp.y);
        this.enemies.push(e);
        a.foes.push(e);
        this.physics.add.collider(e.zone, this.level.layer);
        this.sfx('smoke', 0.6, 1.1);
      });
    });
    this.sfx('gate', 0.6, 1.3);
  }

  private arenaDone() {
    progress.seen.add('arena:done');
    progress.save();
    this.props.setGates(true, true);
    audio.music(this.room.music, 2);
    this.sfx('chime');
    ui.thought('Ninguém mais desce na arena. No chão, um elo partido.', 4200);
    this.placeElo(true);
  }

  private placeElo(animate: boolean) {
    if (!this.textures.exists('item-elo')) {
      const g = this.add.graphics();
      g.lineStyle(3, 0x4a4e5c, 1).strokeEllipse(10, 12, 12, 18);
      g.lineStyle(1, 0xa8b0c4, 1).strokeEllipse(10, 12, 12, 18);
      g.fillStyle(0x07080d).fillRect(14, 4, 4, 5);
      g.generateTexture('item-elo', 20, 24);
      g.destroy();
    }
    const x = this.level.widthPx / 2;
    const y = 23 * TILE - 22;
    const glow = this.add.image(x, y, 'glow').setScale(1.8).setTint(0xbcd4ff).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front);
    const sprite = hd(this.add.image(x, y, 'item-elo').setDepth(DEPTH.enemy + 0.5));
    if (animate) {
      sprite.setAlpha(0).setScale(sprite.scale * 0.4);
      this.tweens.add({ targets: sprite, alpha: 1, scale: sprite.scale / 0.4, duration: 700, ease: 'Back.easeOut' });
    }
    this.elo = { x, y, sprite, glow };
  }

  private updateElo(time: number) {
    const e = this.elo;
    if (!e) return;
    const y = e.y + Math.sin(time * 0.0026) * 2.5;
    e.sprite.y = y;
    e.glow.y = y;
    e.glow.alpha = 0.42 + Math.sin(time * 0.004) * 0.1;
    const p = this.player;
    if (p.dead || Math.abs(p.x - e.x) > 14 || y < p.body.top - 8 || y > p.body.bottom + 6) return;
    this.elo = null;
    progress.seen.add('item:elo');
    progress.save();
    this.tweens.add({ targets: e.sprite, scale: e.sprite.scale * 1.8, alpha: 0, duration: 380, onComplete: () => e.sprite.destroy() });
    this.tweens.add({ targets: e.glow, scale: 5, alpha: 0, duration: 520, onComplete: () => e.glow.destroy() });
    this.sfx('chime');
    this.sfx('equip', 0.8);
    this.glowBurst(e.x, y, 0xbcd4ff, 4);
    ui.banner(ELO.name, ELO.text, 4200);
  }

  // inimigo leve preso no gancho da corrente: vem arrastado até perto do cavaleiro
  private updatePulls(dt: number) {
    if (!this.pulls.length) return;
    const p = this.player;
    for (const pl of this.pulls) {
      pl.t -= dt;
      const e = pl.e;
      if (!e.alive || Math.abs(e.zone.x - p.x) < 34) {
        pl.t = 0;
        continue;
      }
      const b = e.body;
      const step = pl.dir * 320 * dt;
      const lead = pl.dir > 0 ? b.right + step + 1 : b.left + step - 1;
      if (isSolid(this.level.tileAt(lead, b.center.y)) || isSolid(this.level.tileAt(lead, b.bottom - 4))) {
        pl.t = 0;
        continue;
      }
      b.x += step;
    }
    this.pulls = this.pulls.filter((pl) => pl.t > 0);
  }

  // ---------- portas, paredes falsas, sinos e páginas ----------
  useDoor(d: Door) {
    const key = d.def.key;
    if (key && !progress.seen.has(key)) {
      this.sfx('locked');
      ui.thought(d.def.locked ?? 'Trancada.', 3600);
      return;
    }
    this.sfx('door');
    this.player.frozen = true;
    this.player.body.setVelocity(0, 0);
    this.goTo({ to: d.def.to, entry: d.def.entry });
  }

  // tirar a tranca por dentro: o atalho fica aberto para sempre
  unbar(d: Door) {
    const key = d.def.key;
    if (!key) return;
    progress.seen.add(key);
    progress.save();
    this.sfx('locked', 0.7);
    this.time.delayedCall(240, () => this.sfx('door', 0.8, 1.1));
    this.cameras.main.shake(120, 0.003);
    ui.thought('A tranca cedeu. A porta da praça fica aberta daqui para frente.', 4200);
  }

  debris(x: number, y: number, kind: 'rock' | 'glass', n: number) {
    (kind === 'glass' ? this.glassFx : this.rubble).explode(n, x, y);
    if (kind === 'rock') this.dust.explode(Math.ceil(n / 2), x, y);
  }

  // parede falsa ou vitral caiu: o esconderijo aparece
  onSecret(b: Breakable) {
    if (!progress.seen.has('secret:first')) {
      progress.seen.add('secret:first');
      this.time.delayedCall(700, () => ui.thought(b.ch === 'V' ? 'Vidro antigo. Do outro lado, passagem.' : 'Parede oca. Esta cidade esconde coisas atrás das paredes.', 4200));
    }
  }

  // sino da cidade tocado (os três da freira contam para a missão dela)
  onBell(key: string, first: boolean) {
    if (!first) return;
    progress.seen.add(key);
    progress.save();
    const rung = BELLS.filter((k) => progress.seen.has(k)).length;
    if (progress.seen.has('quest:sinos') && !progress.seen.has('quest:sinos:done')) {
      this.time.delayedCall(1200, () =>
        ui.thought(rung >= BELLS.length ? 'Os três sinos tocaram. A irmã Luzia deve ter ouvido.' : `O sino ecoa pela cidade. Faltam ${BELLS.length - rung}.`, 4200),
      );
    } else this.time.delayedCall(1200, () => ui.thought('O som corre por toda a cidade. Alguém lá embaixo parou para ouvir.', 4200));
  }

  takePage(id: string, x: number, y: number) {
    progress.seen.add(`page:${id}`);
    progress.save();
    this.sfx('page');
    this.gold.explode(10, x, y);
    const info = PAGES[id];
    const has = progress.seen.has('journal');
    ui.banner(info?.title ?? 'Página solta', has ? 'Página do diário · veja na pausa' : 'Uma página solta, escrita à mão', 3800);
    if (!has && !progress.seen.has('page:first')) {
      progress.seen.add('page:first');
      this.time.delayedCall(4000, () => ui.thought('Alguém escrevia sobre esta cidade. Guardo comigo.', 3800));
    }
  }

  // ---------- gente da cidade ----------
  // ---------- Minas ----------
  // o que machuca sem ser inimigo nem espinho (a prensa, a viga baixa no vagonete)
  hazardHit(fromX: number, crush = false) {
    const p = this.player;
    if (this.respawning || p.dead || this.transitioning) return;
    if (p.hurt(fromX)) {
      this.onHurt();
      if (crush) {
        this.dustBurst(p.x, p.body.bottom, 10);
        this.cameras.main.shake(220, 0.01);
      }
    }
  }

  // o vagonete atropela (uma vez por passada; a Mine controla)
  hitByCart(e: Enemy, fromX: number) {
    if (this.cartHits.has(e)) return false;
    this.cartHits.add(e);
    const r = e.hit(fromX, 4, 'side');
    if (r !== 'hit') return false;
    this.sparks.explode(10, e.zone.x, e.zone.y);
    this.sfx(e.alive ? 'hit' : 'kill');
    if (!e.alive) this.onKill(e);
    return true;
  }

  // a prensa esmaga quem estiver embaixo (uma vez por descida)
  hitByPress(e: Enemy, x: number) {
    if (this.pressHits.has(e)) return;
    this.pressHits.add(e);
    this.time.delayedCall(700, () => this.pressHits.delete(e));
    const r = e.hit(x, 6, 'quake');
    if (r !== 'hit') return;
    this.sfx(e.alive ? 'hit' : 'kill');
    if (!e.alive) this.onKill(e);
  }

  clearCartHits() {
    this.cartHits.clear();
  }

  // pensamento que só aparece uma vez no jogo
  thinkOnce(key: string, text: string) {
    if (progress.seen.has(`thought:${key}`)) return;
    progress.seen.add(`thought:${key}`);
    progress.save();
    ui.thought(text, 4200);
  }

  // os registros das Minas: o livro em cima do caixote (fica guardado no Diário, aba Registros)
  readRecord(id: string) {
    const r = RECORDS[id];
    if (!r) return;
    const first = !progress.seen.has(`record:${id}`);
    this.talk(r.title, r.lines, null, () => {
      // a flor seca que estava entre as folhas da ficha de A. fica com ele
      if (id === 'veio:1' && !progress.upgrades.has('flower')) {
        this.time.delayedCall(first ? 3800 : 150, () => {
          const p = this.player;
          this.grantFind('flower', p.x, p.body.center.y);
        });
      }
      if (!first) return;
      progress.seen.add(`record:${id}`);
      progress.save();
      this.sfx('page');
      ui.banner('Registro guardado no Diário', r.title, 3600);
    });
  }

  // ---------- achados ----------
  // os achados da sala que já estão lá, e os dos baús que um save de antes dos itens já abriu
  private placeFinds() {
    for (const d of this.room.finds ?? []) {
      if (d.needs && !progress.seen.has(d.needs)) continue;
      const { x, floor } = Finds.at(d.x, d.y);
      this.finds.add(d.id, x, floor);
    }
    this.room.cacheItems?.forEach((id, i) => {
      const c = this.fixtures.caches.find((k) => k.i === i);
      if (id && c?.open && !hasFind(id)) this.finds.add(id, c.x + 22, c.y);
    });
  }

  // a marca aconteceu agora, nesta sala: o que esperava por ela pula de onde sai
  private unlockFinds(mark: string) {
    if (this.transitioning) return;
    for (const d of this.room.finds ?? []) {
      if (d.needs !== mark) continue;
      const { x, floor } = Finds.at(d.x, d.y);
      this.finds.add(d.id, x, floor, d.from ? { x: x + d.from[0], y: floor + d.from[1] } : undefined);
    }
  }

  // um baú abriu: além das moedas, o item que estava dentro pula para o lado do cavaleiro
  cacheOpened(i: number, x: number, y: number) {
    const id = this.room.cacheItems?.[i];
    if (!id || hasFind(id)) return;
    const side = this.player.x < x ? -1 : 1;
    this.finds.add(id, x + side * 22, y, { x, y: y - 12 });
  }

  // pegou um achado: item novo (entra equipado se couber, senão fica guardado) ou um espaço a mais
  grantFind(id: FindId, x: number, y: number) {
    let thought: string | undefined;
    if (isSlotFind(id)) {
      if (progress.seen.has(`item:${id}`)) return;
      progress.seen.add(`item:${id}`);
      progress.save();
      const info = SLOT_FINDS[id];
      ui.banner(info.name, info.text, 4400);
      thought = info.thought;
    } else {
      const r = progress.grant(id);
      if (!r) return;
      this.applyProgress();
      const off = OFFERS.find((o) => o.id === id)!;
      ui.banner(off.name, r === 'on' ? off.text : 'Guardado no inventário: não coube agora. Equipe na pausa.', 4400);
      thought = FOUND_THOUGHTS[id];
    }
    this.sfx('chime');
    this.sfx('equip', 0.8);
    this.glowBurst(x, y, 0xffd8a0, 4);
    pad.rumble(0.25, 0.5, 160);
    if (thought) {
      const t = thought;
      this.time.delayedCall(4700, () => ui.thought(t, 4600));
    }
  }

  // a Flor prensada: com 1 de vida, o cheiro traz uma lembrança boa e fecha uma rachadura (uma vez
  // por descanso). As pétalas secas soltam um pó claro que sobe devagar
  private flowerHeal() {
    progress.seen.add('flower:spent');
    const p = this.player;
    this.time.delayedCall(450, () => {
      if (p.dead || this.transitioning || p.hp >= progress.maxHp) return;
      p.hp = Math.min(progress.maxHp, p.hp + MINE_ITEMS.flowerHeal);
      this.registry.set('hp', p.hp);
      this.sfx('chime', 0.6, 1.5);
      this.glowBurst(p.x, p.body.center.y, 0xf0b8b0, 3);
      for (let i = 0; i < 9; i++) {
        const key = i % 2 ? 'petal-a' : 'petal-b';
        if (!this.textures.exists(key)) break;
        const pe = this.add.image(p.x + (Math.random() - 0.5) * 16, p.body.center.y + (Math.random() - 0.5) * 18, key)
          .setTint(0xb86a62).setDepth(DEPTH.player + 0.5).setAlpha(0.9).setScale(0.8 + Math.random() * 0.4);
        this.tweens.add({
          targets: pe,
          x: pe.x + (Math.random() - 0.5) * 50,
          y: pe.y - 30 - Math.random() * 30,
          angle: (Math.random() - 0.5) * 300,
          alpha: 0,
          duration: 1100 + Math.random() * 700,
          ease: 'Sine.easeOut',
          onComplete: () => pe.destroy(),
        });
      }
      this.thinkOnce('item:flower', 'O cheiro da flor. Uma tarde de sol e alguém rindo do meu lado. A rachadura fecha.');
    });
  }

  // o Capacete de mineiro aguentou uma pancada (pedra do teto ou viga baixa)
  helmetBonk(x: number, y: number) {
    this.sfx('clang', 0.7, 1.4);
    this.sfx('tink', 0.7, 0.9);
    this.sparks.explode(8, x, y);
    this.dustBurst(x, y + 4, 4);
    this.cameras.main.shake(90, 0.003);
    pad.rumble(0.2, 0.3, 80);
    this.thinkOnce('item:helmet', 'Bateu no capacete. Quem deixou ele no baú sabia o que caía aqui.');
  }

  talkTo(n: Npc) {
    if (n.kind === 'smith') this.openForge(n);
    else if (n.kind === 'nun') this.talkNun(n);
    else if (n.kind === 'prisoner') this.talkPrisoner(n);
    else if (n.kind === 'miner') this.talkMiner(n);
    else {
      const lines = this.room.npcs?.[n.i] ?? ['...'];
      const line = lines[n.line % lines.length];
      n.line++;
      this.talk(n.look === 'shawl' ? 'Esquecida' : 'Esquecido', [line], n);
    }
  }

  // conversa: o jogo para e a caixa de fala aparece embaixo (after roda quando ela fecha)
  private talk(name: string, lines: string[], n: Npc | null, after?: () => void) {
    if (ui.open || this.transitioning) return;
    ui.hint(null);
    if (n) this.npcs.talking(n, true);
    this.scene.pause();
    ui.talk({
      name,
      lines,
      onDone: () => {
        if (n) this.npcs.talking(n, false);
        this.resumeGame();
        after?.();
      },
    });
  }

  // o mineiro que ficou: conta da mina na primeira vez, depois uma lembrança por conversa; com o
  // Capataz vencido, fala do silêncio
  private talkMiner(n: Npc) {
    // ele ensina a remendar com o ouro da máscara (na primeira conversa, ou na próxima de um
    // progresso de antes do Remendo)
    if (!progress.seen.has('oldminer:met') || !progress.powers.has('remendo')) {
      const first = !progress.seen.has('oldminer:met');
      this.talk(OLD_MINER.name, first ? [...OLD_MINER.first, ...OLD_MINER.mend] : OLD_MINER.mend, n, () => {
        progress.seen.add('oldminer:met');
        progress.save();
        this.learnPower('remendo');
      });
      return;
    }
    if (progress.seen.has('boss:capataz')) {
      this.talk(OLD_MINER.name, [OLD_MINER.done[n.line++ % OLD_MINER.done.length]], n);
      return;
    }
    this.talk(OLD_MINER.name, [OLD_MINER.after[n.line++ % OLD_MINER.after.length]], n);
  }

  // a irmã Luzia: dá o diário, pede os três sinos e recompensa quando todos tocam
  private talkNun(n: Npc) {
    const rung = BELLS.filter((k) => progress.seen.has(k)).length;
    if (!progress.seen.has('quest:sinos')) {
      this.talk(NUN.name, NUN.first, n, () => {
        progress.seen.add('quest:sinos');
        progress.seen.add('journal');
        progress.save();
        this.sfx('page');
        this.gold.explode(12, this.player.x, this.player.body.center.y);
        ui.banner('Diário da irmã Luzia', 'Páginas, criaturas e lugares · veja na pausa', 4200);
      });
    } else if (progress.seen.has('quest:sinos:done')) {
      this.talk(NUN.name, [NUN.after[n.line++ % NUN.after.length]], n);
    } else if (rung < BELLS.length) {
      this.talk(NUN.name, [NUN.waiting(BELLS.length - rung)], n);
    } else this.talk(NUN.name, NUN.reward, n, () => this.nunReward(n));
  }

  private nunReward(n: Npc) {
    progress.seen.add('quest:sinos:done');
    progress.upgrades.add('beads');
    const on = progress.toggle('beads') === 'on';
    progress.memories.add('praca:freira');
    progress.save();
    this.applyProgress();
    this.sfx('chime');
    this.glowBurst(n.x, n.y - 30, 0xfff0c8, 4);
    // as moedas vão direto para a bolsa (com a chuva de moedas de enfeite)
    progress.coins += 30;
    progress.save();
    this.registry.set('coins', progress.coins);
    this.sfx('coinrain', 0.8);
    const item = OFFERS.find((o) => o.id === 'beads')!;
    ui.banner(item.name, on ? item.text : 'Guardado no inventário: equipe na pausa.', 4400);
    this.time.delayedCall(4800, () => {
      const m = MEMORIES['praca:freira'];
      this.sfx('chime', 0.7, 1.2);
      ui.banner(m.title, m.text, 4600);
    });
  }

  // Brás, o ferreiro: na primeira vez conversa, depois abre a forja
  private openForge(n: Npc) {
    if (!progress.seen.has('smith:met')) {
      this.talk(SMITH.name, SMITH.first, n, () => {
        progress.seen.add('smith:met');
        progress.save();
        this.openForge(n);
      });
      return;
    }
    if (ui.open || this.transitioning) return;
    ui.hint(null);
    this.npcs.talking(n, true);
    this.scene.pause();
    ui.forge({
      first: false,
      quote: SMITH.quotes[Math.floor(Math.random() * SMITH.quotes.length)],
      upgrade: (w) => {
        const lv = progress.level(w);
        if (lv >= MAX_LEVEL) return false;
        const c = FORGE[lv];
        const mat = c.material ? MATERIALS[c.material] : null;
        if (progress.coins < c.coins || (mat && !progress.seen.has(mat.has))) return false;
        progress.coins -= c.coins;
        progress.levels.set(w, lv + 1);
        progress.save();
        this.registry.set('coins', progress.coins);
        audio.sfx('anvil');
        window.setTimeout(() => audio.sfx('anvil', { rate: 1.06 }), 260);
        return SMITH.done[lv % SMITH.done.length];
      },
      onClose: () => {
        this.npcs.talking(n, false);
        this.resumeGame();
      },
    });
  }

  // faísca da bigorna a cada martelada do ferreiro
  forgeSpark(x: number, y: number) {
    this.sparks.explode(6, x, y);
  }

  private follow(dt: number) {
    if (this.cinematic && this.player.pose) return;
    // olha um pouco à frente na direção em que o cavaleiro está virado
    this.lookX += (this.player.facing * 36 - this.lookX) * Math.min(1, dt * 2.2);
    this.cameras.main.setFollowOffset(-this.lookX, this.camY);
  }

  // ---------- progresso: habilidades, melhorias, velas, relíquias e memórias ----------
  applyProgress() {
    const p = this.player;
    p.canWall = progress.abilities.has('wall');
    p.canDouble = progress.abilities.has('double');
    p.canHook = progress.abilities.has('hook');
    p.canVeil = progress.abilities.has('veil');
    document.body.classList.toggle('has-hook', p.canHook);
    p.dashCdMul = progress.on('breath') ? 0.55 : 1;
    this.registry.set('maxhp', progress.maxHp);
    this.registry.set('memories', [...progress.memories].map((m) => (progress.traded.has(m) ? 0 : 1)));
    this.registry.set('coins', progress.coins);
    document.body.classList.toggle('has-memory', progress.powers.size > 0);
    this.registry.set('power', progress.power ?? '');
    this.registry.set('amber', progress.amber);
  }

  // descansar na vela: ajoelha, acende, cura e guarda o ponto de retorno
  rest(sh: Shrine) {
    const p = this.player;
    this.cinematic = true;
    ui.hint(null);
    p.body.setVelocity(0, 0);
    p.facing = sh.x >= p.x ? 1 : -1;
    p.kneel();
    const first = !sh.lit;
    this.props.light(sh, true);
    this.sfx('rest');
    this.memWave?.start(sh.x, sh.y - 12, 'restore', { power: 0.5, radius: 240, hold: 1.0 });
    progress.seen.add(this.props.restKey(sh.i));
    // a Flor prensada volta a valer
    progress.seen.delete('flower:spent');
    // o caminho já vencido vira cinza (grava junto com o ponto de retorno)
    const cleared = this.clearPassed();
    progress.checkpoint(this.room.id, `R${sh.i}`, settings.data.weapon);
    this.dirty = false;
    this.time.delayedCall(450, () => {
      p.hp = progress.maxHp;
      this.registry.set('hp', p.hp);
      this.glowBurst(p.x, p.body.center.y, 0xffb04a, 4);
      ui.banner(first ? 'Vela acesa' : 'Descanso', 'Vida restaurada · progresso salvo', 2400);
    });
    if (cleared) this.time.delayedCall(2500, () => ui.thought('As criaturas do caminho já vencido viraram cinza. Não voltam mais.', 4400));
    this.time.delayedCall(1700, () => p.getUp(() => (this.cinematic = false)));
  }

  takeRelic(r: Relic) {
    const p = this.player;
    const info = RELICS[r.kind];
    this.cinematic = true;
    ui.hint(null);
    p.frozen = true;
    p.body.setVelocity(0, 0);
    progress.abilities.add(r.kind);
    progress.seen.add(`relic:${r.kind}`);
    progress.save();
    this.props.consumeRelic(r, { x: p.x, y: p.body.center.y });
    audio.music('none', 0.6);
    this.sfx('chime');
    this.time.delayedCall(1250, () => {
      const cam = this.cameras.main;
      this.sfx('bell', 0.8);
      this.glowBurst(p.x, p.body.center.y, r.kind === 'wall' || r.kind === 'hook' ? 0xbcd4ff : 0xfff0c8, 7);
      cam.flash(220, 70, 66, 60);
      pad.rumble(0.3, 0.6, 300);
      this.applyProgress();
      ui.banner(info.name, info.text, 4200);
    });
    this.time.delayedCall(4400, () => {
      p.frozen = false;
      this.cinematic = false;
      audio.music(this.room.music);
      ui.thought(ui.format(info.how), 5200, true);
    });
  }

  takeMemory(m: MemoryOrb) {
    const info = MEMORIES[m.id];
    progress.memories.add(m.id);
    progress.save();
    this.props.consumeMemory(m);
    this.gold.explode(16, m.x, m.y);
    this.sfx('chime');
    this.applyProgress();
    // a sala lembra junto: a onda passa pelo cenário e quem estava na lembrança aparece em luz
    const echo = MEMORY_ECHO[m.id];
    if (echo && this.memWave) {
      this.memWave.start(m.x, m.y, echo.mode);
      this.memWave.echoes(m.x, m.y, echo.kind, echo.mode, this.player.sprite);
    }
    if (info) ui.banner(info.title, info.text, 4600);
    if (CHAPTERS[m.id]) this.chapterEnd(m.id);
    // a imagem do espelho vem junto com a memória dela: o Eco
    if (m.id === BOSSES.reflexo.memory) this.time.delayedCall(5000, () => this.learnPower('eco'));
  }

  // ---------- a sombra (Eco) ----------
  // onde a sombra fica ao morrer: no último chão seguro; na sala de um chefe ainda vivo, na entrada
  // (fora da arena, para não ter de lutar com os dois juntos)
  private echoSpot() {
    const id = this.room.boss;
    if (id && !progress.seen.has(`boss:${id}`)) {
      const s = this.level.spawn('1') ?? this.level.spawns[0];
      const inward = s.x < this.level.widthPx / 2 ? 1 : -1;
      return { x: s.x + inward * 3 * TILE, y: s.y };
    }
    return { x: this.player.lastSafe.x, y: this.player.lastSafe.y };
  }

  private placeEcho() {
    const d = progress.echo;
    if (!d || d.room !== this.room.id || this.room.noAttack) return;
    const e = new Echo(this, d.x, d.y, settings.data.weapon);
    this.echo = e;
    this.enemies.push(e);
    // a sombra passa pelas tábuas finas (só a pedra segura)
    this.physics.add.collider(e.zone, this.level.layer, undefined, (_o, t) => (t as Phaser.Tilemaps.Tile).index !== TILE_ONEWAY, this);
  }

  echoMotes(x: number, y: number, drip: boolean, n = 1) {
    (drip ? this.abyssDrips : this.abyssMotes).emitParticle(n, x, y);
  }

  echoWoke(_e: Echo) {
    if (progress.seen.has('echo:met')) return;
    progress.seen.add('echo:met');
    this.markDirty();
    ui.thought('Sou eu, do jeito que o abismo lembra. Ela guarda o que eu perdi.', 4600);
  }

  // a sombra caiu: as moedas dela voam de volta para o cavaleiro
  echoDefeated(x: number, y: number) {
    const before = progress.coins;
    const n = progress.reclaim();
    this.dirty = false;
    this.sfx('echo-die');
    this.cameras.main.shake(160, 0.004);
    pad.rumble(0.35, 0.6, 220);
    this.abyssDrips.explode(26, x, y);
    this.abyssMotes.explode(22, x, y);
    const g = this.add.image(x, y, 'glow').setTint(ABYSS.lilac).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.slash).setScale(0.5).setAlpha(0.9);
    this.tweens.add({ targets: g, scale: 3.4, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
    if (n <= 0) return;
    this.time.delayedCall(320, () => this.sfx('coinrain', 0.7));
    // o contador sobe enquanto as moedas chegam (o progresso já guardou todas)
    const k = Math.min(28, 6 + Math.ceil(n / 8));
    let shown = before;
    for (let i = 0; i < k; i++) {
      const share = i === k - 1 ? before + n : before + Math.round((n * (i + 1)) / k);
      const big = n / k >= 4;
      const c = this.add.sprite(x, y, big ? 'coin-big' : 'coin', 0).setDepth(DEPTH.slash).play(big ? 'coin-big-spin' : 'coin-spin');
      const a = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 30;
      const out = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r - 12 };
      this.tweens.add({
        targets: c,
        x: out.x,
        y: out.y,
        duration: 260,
        ease: 'Quad.easeOut',
        onComplete: () => {
          // depois voa até o cavaleiro, seguindo ele
          const from = { x: c.x, y: c.y };
          const fly = { t: 0 };
          this.tweens.add({
            targets: fly,
            t: 1,
            delay: 120 + i * 45,
            duration: 380,
            ease: 'Quad.easeIn',
            onUpdate: () => {
              const p = this.player;
              c.setPosition(Phaser.Math.Linear(from.x, p.x, fly.t), Phaser.Math.Linear(from.y, p.body.center.y, fly.t));
            },
            onComplete: () => {
              c.destroy();
              if (this.transitioning) return;
              shown = Math.max(shown, share);
              this.registry.set('coins', Math.min(progress.coins, shown));
              this.sparks.explode(2, this.player.x, this.player.body.center.y);
              if (i % 3 === 0 || i === k - 1) this.sfx('tink', 0.35, 1 + Math.random() * 0.3);
            },
          });
        },
      });
    }
    if (!progress.seen.has('echo:won')) {
      progress.seen.add('echo:won');
      this.time.delayedCall(1700, () => ui.thought('As moedas voltaram. Ela era só o que eu tinha perdido.', 4200));
    }
  }

  // ---------- chefes ----------
  private placeBoss(id: BossId, x: number, y: number) {
    const info = BOSSES[id];
    const done = progress.seen.has(`boss:${id}`);
    if (id === 'arcebispo') this.placeRose(done);
    if (!done) {
      const b = info.make(this, x, y);
      b.onDefeat = () => this.onBossDefeat(id);
      this.boss = b;
      this.enemies.push(b);
      return;
    }
    // já vencido: o corpo continua caído onde ele lutava (o Reflexo não deixa corpo, só o espelho rachado)
    const f = info.corpseFacing;
    if (info.corpse === 'none') {
      if (!progress.memories.has(info.memory)) this.props.addMemory(info.memory, this.bossX(x + f * info.orb), y - 26);
      return;
    }
    const a = this.anims.get(`${info.sheet}-${info.corpse}`);
    const o = this.registry.get(`${info.sheet}-origin`) as { x: number; y: number };
    face(hd(this.add.image(x, y, info.sheet, a.frames[a.frames.length - 1].textureFrame)).setOrigin(o.x, o.y).setDepth(DEPTH.prop).setTint(0x9a948c), f < 0);
    if (!progress.memories.has(info.memory)) this.props.addMemory(info.memory, this.bossX(x + f * info.orb), y - 26);
    const w = this.bossWeapon(id);
    if (w) this.dropWeapon(w, this.bossX(x + f * info.drop), y, false);
    if (info.item) this.finds.add(info.item.id, this.bossX(x + f * info.item.dx), y);
  }

  // longe das paredes, para dar para pegar o que o chefe deixa
  private bossX(x: number) {
    return Phaser.Math.Clamp(x, 5 * TILE, (this.level.w - 5) * TILE);
  }

  // arma que um chefe deixa (cada chefe tem a sua)
  private bossWeapon(boss: string): WeaponId | null {
    const id = WEAPON_IDS.find((w) => WEAPONS[w].boss?.id === boss);
    return id && !progress.hasWeapon(id) ? id : null;
  }

  private bossFight() {
    const b = this.boss;
    const id = this.room.boss;
    if (!b || !id) return;
    const info = BOSSES[id];
    const p = this.player;
    if (b.sleeping) {
      if (!p.dead && !this.transitioning && p.x > info.wakeX * TILE) {
        // a grade fecha atrás do cavaleiro e o chefe acorda
        this.props.setGates(false, true);
        this.sfx('clang', 1);
        audio.music(info.music, 0.4);
        b.wake();
        this.time.delayedCall(1600, () => ui.banner(info.name, info.title, 2800));
      }
      return;
    }
    if (!b.alive) return;
    const frac = b.hp / b.maxHp;
    if (frac !== this.bossFrac) {
      this.bossFrac = frac;
      ui.bossBar(info.name, frac);
    }
  }

  private onBossDefeat(id: BossId) {
    const b = this.boss!;
    const info = BOSSES[id];
    progress.seen.add(`boss:${id}`);
    // o que ele devolve já fica gravado (a cena só mostra a tinta voltando para o cavaleiro)
    if (info.relic) {
      progress.abilities.add(info.relic);
      progress.seen.add(`relic:${info.relic}`);
    }
    progress.save();
    audio.music('none', 1.5);
    ui.bossBar(info.name, 0);
    this.time.delayedCall(1400, () => ui.bossBar(null));
    this.releaseSummons();
    const x = b.zone.x;
    const f = b.facing;
    const bottom = b.body.bottom;
    // a sala sente a queda: a cor de antes volta por um instante (a tinta da Sombra se espalha roxa)
    const cy = b.body.center.y;
    this.time.delayedCall(700, () => this.memWave?.start(x, cy, b instanceof Sombra ? 'corrupt' : 'restore', { radius: 760, hold: 2.6 }));
    if (info.relic && b instanceof Sombra) this.time.delayedCall(2400, () => this.absorbShadow(b, info.relic!, () => this.bossAfter(id, x, f, bottom, 5600)));
    else this.time.delayedCall(2600, () => this.bossAfter(id, x, f, bottom));
    // o achado dele cai do corpo, e o que a sala guardava para depois da luta aparece (a lasca do espelho)
    const it = info.item;
    if (it) this.time.delayedCall(1800, () => this.finds.add(it.id, this.bossX(x + f * it.dx), bottom, { x, y: bottom - 40 }));
    this.time.delayedCall(900, () => this.unlockFinds(`boss:${id}`));
    // e a arma dele cai do outro lado (o incensário sai do chão onde rolou)
    const w = this.bossWeapon(id);
    if (w) {
      this.time.delayedCall(3300, () => {
        if (info.corpse !== 'death' && b.sprite.active) b.sprite.play(`${info.sheet}-${info.corpse}`);
        this.dropWeapon(w, this.bossX(x + f * info.drop), b.body.bottom, true);
      });
    }
  }

  // depois da luta: a memória sai do corpo caído, as grades abrem e ele pensa no que aconteceu
  private bossAfter(id: BossId, x: number, f: number, bottom: number, thoughtDelay = 0) {
    const info = BOSSES[id];
    this.props.addMemory(info.memory, this.bossX(x + f * info.orb), bottom - 28, true);
    this.sfx('chime');
    this.props.setGates(true, true);
    this.fixtures.openLocks(`boss:${id}`, true);
    this.time.delayedCall(thoughtDelay, () => ui.thought(info.after[0], 4600));
    this.time.delayedCall(thoughtDelay + 5200, () => ui.thought(info.after[1], 4600));
  }

  // a Sombra vencida: a tinta da poça salta num fio até o cavaleiro e entra nele (vira o Véu)
  private absorbShadow(b: Sombra, kind: Ability, done: () => void) {
    const p = this.player;
    const info = RELICS[kind];
    this.cinematic = true;
    ui.hint(null);
    p.frozen = true;
    p.body.setVelocity(0, 0);
    const src = b.puddle;
    const g = this.add.graphics().setDepth(DEPTH.player - 0.05);
    this.sfx('veil', 1, 0.6);
    this.time.delayedCall(700, () => this.sfx('veil', 0.8, 0.8));
    const st = { k: 0 };
    let dripT = 0;
    this.tweens.add({
      targets: st,
      k: 1,
      duration: 1900,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const k = st.k;
        b.drain(k);
        g.clear();
        // o fio de tinta: curva da poça até os pés do cavaleiro; a ponta corre na frente e o resto vem atrás
        const ax = src.x;
        const ay = src.y - 2;
        const bx = p.x;
        const by = p.body.bottom - 6;
        const cx = (ax + bx) / 2;
        const cy = Math.min(ay, by) - 34 - Math.abs(bx - ax) * 0.12;
        const at = (t: number) => {
          const u = 1 - t;
          return new Phaser.Math.Vector2(u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by);
        };
        const head = Math.min(1, k * 1.35);
        const tail = Math.max(0, k * 1.35 - 0.5);
        if (head - tail < 0.01) return;
        const top: Phaser.Math.Vector2[] = [];
        const bot: Phaser.Math.Vector2[] = [];
        const n = 18;
        for (let i = 0; i <= n; i++) {
          const t = tail + (head - tail) * (i / n);
          const q = at(t);
          const w = 2.2 + 3.4 * Math.sin(Math.PI * (i / n)) + Math.sin(this.clock * 30 + i) * 0.5;
          top.push(new Phaser.Math.Vector2(q.x, q.y - w));
          bot.push(new Phaser.Math.Vector2(q.x, q.y + w * 0.7));
        }
        g.fillStyle(ABYSS.ink, 0.95).fillPoints([...top, ...[...bot].reverse()], true);
        g.lineStyle(1.2, ABYSS.purple, 0.9).strokePoints(top, false);
        g.lineStyle(0.8, ABYSS.magenta, 0.55).strokePoints(bot, false);
        dripT -= 1;
        if (dripT <= 0) {
          dripT = 3;
          const q = at(tail + (head - tail) * Math.random());
          this.echoMotes(q.x, q.y, Math.random() < 0.6);
        }
      },
      onComplete: () => {
        g.destroy();
        b.absorbed();
        // a tinta entra: o cavaleiro escurece e se refaz
        this.sfx('veil-form', 1.1, 0.8);
        this.sfx('bell', 0.7, 0.6);
        this.abyssDrips.explode(18, p.x, p.body.center.y);
        this.abyssMotes.explode(26, p.x, p.body.center.y);
        this.glowBurst(p.x, p.body.center.y, ABYSS.lilac, 6);
        const cam = this.cameras.main;
        cam.flash(260, 112, 41, 184);
        cam.shake(300, 0.004);
        pad.rumble(0.4, 0.7, 320);
        p.sprite.setTint(0x3b2457);
        this.time.delayedCall(900, () => p.sprite.clearTint());
        this.applyProgress();
        this.time.delayedCall(350, () => ui.banner(info.name, info.text, 4200));
        this.time.delayedCall(4400, () => {
          p.frozen = false;
          this.cinematic = false;
          audio.music(this.room.music);
          ui.thought(ui.format(info.how), 5200, true);
          done();
        });
      },
    });
  }

  // ---------- a luta do altar ----------
  private placeRose(broken: boolean) {
    // em cima do altar, alto o bastante para a luz cair em leque
    const altar = this.level.spawns.find((s) => s.kind === 'A');
    const x = altar?.x ?? this.level.widthPx / 2;
    const y = 216;
    const glow = this.add
      .image(x, y, 'glow')
      .setScale(broken ? 3.4 : 2.6)
      .setTint(broken ? 0xffe8c0 : 0xffc890)
      .setAlpha(broken ? 0.32 : 0.16)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.rail - 0.1);
    const img = hd(this.add.image(x, y, broken ? 'deco-rose-broken' : 'deco-rose').setDepth(DEPTH.rail));
    this.rose = { x, y, img, glow };
  }

  // segunda fase: o vitral estoura e a luz entra pelos buracos
  shatterRose() {
    const r = this.rose;
    if (!r) return;
    r.img.setTexture('deco-rose-broken');
    r.glow.setTint(0xffe8c0);
    this.tweens.add({ targets: r.glow, alpha: 0.32, scale: 3.4, duration: 600, ease: 'Quad.easeOut' });
    for (let i = 0; i < 5; i++) {
      this.time.delayedCall(i * 60, () => this.glassFx.explode(16, r.x + (Math.random() - 0.5) * 96, r.y + (Math.random() - 0.5) * 96));
    }
    this.sfx('glass', 1.2, 0.8);
    this.sfx('crack', 0.9, 0.7);
    this.time.delayedCall(700, () => this.sfx('shard', 0.7, 0.8));
    const cam = this.cameras.main;
    cam.flash(260, 255, 236, 200);
    cam.shake(500, 0.008);
    pad.rumble(0.6, 0.8, 400);
  }

  // o chefe chama ajuda: nasce como os do mapa, mas não conta como trecho do caminho
  summon(kind: string, x: number, y: number) {
    const make = SPAWNERS[kind];
    if (!make || this.transitioning || !this.boss?.alive) return null;
    const e = make(this, x, y);
    this.enemies.push(e);
    this.summons.push(e);
    this.physics.add.collider(e.zone, this.level.layer);
    return e;
  }

  private releaseSummons() {
    let first = true;
    for (const e of this.summons) {
      if (!e.alive) continue;
      const rect = Phaser.Geom.Rectangle.Clone(e.rect);
      const spr = e.vanish?.();
      if (!spr) continue;
      this.toAsh(spr, rect, 700, first);
      first = false;
    }
    this.summons = [];
  }

  // grão de poeira caindo do teto (aviso das gaiolas)
  grit(x: number, y: number) {
    this.gritFx.emitParticle(1, x, y);
  }

  // moeda do dízimo batendo no chão
  coinSplash(x: number, y: number) {
    this.sparks.explode(5, x, y - 2);
    this.gold.explode(3, x, y - 4);
    this.dust.explode(2, x, y - 1);
  }

  // ---------- armas de chefe ----------
  private dropWeapon(id: WeaponId, x: number, floorY: number, animate: boolean) {
    if (this.weaponDrop || progress.hasWeapon(id)) return;
    const y = floorY - 16;
    const glow = this.add.image(x, y, 'glow').setScale(2).setTint(0xffc46a).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front);
    const sprite = hd(this.add.image(x, y, `item-${id}`).setDepth(DEPTH.enemy + 0.5));
    const d: WeaponDrop = { id, x, y, t: 0, sprite, glow, ready: !animate };
    this.weaponDrop = d;
    if (!animate) return;
    // pula do corpo, gira e cai no chão com um baque
    sprite.setPosition(x, y - 40).setAngle(-160).setAlpha(0);
    glow.setScale(0.3);
    this.sfx('swoosh', 0.6, 0.7);
    this.tweens.add({ targets: sprite, alpha: 1, duration: 200 });
    this.tweens.add({ targets: glow, scale: 2, duration: 700 });
    this.tweens.add({
      targets: sprite,
      y,
      angle: 0,
      duration: 650,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        d.ready = true;
        this.sfx('thud', 0.7);
        this.dustBurst(x, floorY, 8);
      },
    });
  }

  private updateWeaponDrop(dt: number) {
    const d = this.weaponDrop;
    if (!d || !d.ready) return;
    d.t += dt;
    const y = d.y + Math.sin(d.t * 2.6) * 2;
    d.sprite.y = y;
    d.glow.y = y;
    d.glow.alpha = 0.45 + Math.sin(d.t * 4) * 0.12;
    if (Math.random() < 0.06) this.gold.explode(1, d.x - 10 + Math.random() * 20, y - 6 + Math.random() * 12);
    const p = this.player;
    const b = p.body;
    if (this.cinematic || this.transitioning || p.dead) return;
    if (Math.abs(p.x - d.x) < 18 && b.bottom > d.y - 8 && b.top < d.y + 12) this.takeWeapon(d);
  }

  // pegar a arma do chefe: sobe, vira luz no cavaleiro e fica liberada em Trocar arma
  private takeWeapon(d: WeaponDrop) {
    this.weaponDrop = null;
    const W = WEAPONS[d.id];
    const p = this.player;
    this.cinematic = true;
    ui.hint(null);
    p.frozen = true;
    p.body.setVelocity(0, 0);
    progress.seen.add(`weapon:${d.id}`);
    progress.save();
    this.sfx('chime');
    this.tweens.add({ targets: [d.sprite, d.glow], y: '-=20', duration: 700, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: d.glow, scale: 4, alpha: 0.9, duration: 700 });
    this.tweens.add({
      targets: [d.sprite, d.glow],
      x: p.x,
      y: p.body.center.y,
      alpha: 0,
      delay: 900,
      duration: 380,
      ease: 'Quad.easeIn',
      onComplete: () => {
        d.sprite.destroy();
        d.glow.destroy();
      },
    });
    this.time.delayedCall(1250, () => {
      this.sfx('bell', 0.7, 1.3);
      this.glowBurst(p.x, p.body.center.y, 0xffc46a, 6);
      this.cameras.main.flash(200, 70, 60, 40);
      pad.rumble(0.3, 0.6, 300);
      ui.banner(W.name, 'Arma liberada', 4000);
    });
    this.time.delayedCall(4000, () => {
      p.frozen = false;
      this.cinematic = false;
      if (W.boss) ui.thought(W.boss.found, 5200);
    });
  }

  private chapterEnd(memory: string, wait = 5200) {
    this.time.delayedCall(wait, () => {
      if (this.transitioning) return;
      // não corta a cena de pegar a arma do chefe
      if (this.cinematic || ui.open) {
        this.chapterEnd(memory, 600);
        return;
      }
      this.scene.pause();
      ui.end({
        ...CHAPTERS[memory],
        onExplore: () => {
          ui.closeAll();
          this.controls.reset();
          this.scene.resume();
        },
        onTitle: () => {
          ui.closeAll();
          this.scene.resume();
          this.toTitle();
        },
      });
    });
  }

  // a grade do fundo das catacumbas abre depois da memória do vale
  private openFarGate() {
    if (this.room.id !== 'catacumbas' || progress.seen.has('gate:catacumbas')) return;
    progress.seen.add('gate:catacumbas');
    progress.save();
    this.cinematic = true;
    this.player.frozen = true;
    const cam = this.cameras.main;
    this.time.delayedCall(500, () => {
      this.sfx('roar', 0.35);
      cam.shake(2200, 0.0022);
      pad.rumble(0.25, 0.4, 2000);
      this.props.setGates(true, true, () => {
        this.player.frozen = false;
        this.cinematic = false;
        ui.thought('Uma grade se abriu mais adiante. Os sinos chamam.', 4800);
      });
    });
  }

  // marca no mapa o que a câmera já mostrou (células de 4x4 tiles) e grava de tempos em tempos
  private trackVisit(dt: number) {
    if (!MAP_POS[this.room.id]) return;
    this.visitT -= dt;
    this.saveT -= dt;
    if (this.dirty && this.saveT <= 0) {
      this.saveT = 4;
      this.dirty = false;
      progress.save();
    }
    if (this.visitT > 0) return;
    this.visitT = 0.2;
    const id = this.room.id;
    let set = progress.visited.get(id);
    if (!set) {
      set = new Set();
      progress.visited.set(id, set);
    }
    const v = this.cameras.main.worldView;
    const cw = Math.ceil(this.level.w / 4);
    const ch = Math.ceil(this.level.h / 4);
    const C = TILE * 4;
    const x0 = Math.max(0, Math.floor(v.x / C));
    const x1 = Math.min(cw - 1, Math.floor((v.right - 1) / C));
    const y0 = Math.max(0, Math.floor(v.y / C));
    const y1 = Math.min(ch - 1, Math.floor((v.bottom - 1) / C));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const k = y * cw + x;
        if (set.has(k)) continue;
        set.add(k);
        this.dirty = true;
      }
    }
  }

  openMap(fromPause: boolean) {
    if (!fromPause) {
      if (ui.open || this.transitioning) return;
      this.scene.pause();
      ui.hint(null);
    }
    this.trackVisit(1);
    progress.save();
    this.dirty = false;
    ui.map({
      room: this.room.id,
      x: this.player.x / TILE,
      y: this.player.body.center.y / TILE,
      onClose: () => (fromPause ? ui.pop() : this.resumeGame()),
    });
  }

  openShop() {
    if (ui.open || this.transitioning) return;
    this.scene.pause();
    ui.hint(null);
    this.props.talk(true);
    const first = !progress.seen.has('cobrador:met');
    progress.seen.add('cobrador:met');
    ui.shop({
      first,
      buy: (id) => {
        const offer = OFFERS.find((o) => o.id === id);
        if (!offer || progress.upgrades.has(id)) return false;
        if (offer.pay === 'coin') {
          if (progress.coins < offer.cost) return false;
          progress.coins -= offer.cost;
        } else {
          // as memórias mais antigas vão primeiro
          if (progress.held < offer.cost) return false;
          let n = 0;
          for (const m of progress.memories) {
            if (n >= offer.cost) break;
            if (progress.traded.has(m)) continue;
            progress.traded.add(m);
            n++;
          }
        }
        progress.upgrades.add(id);
        // já entra equipado se couber nos espaços; senão fica guardado no inventário
        const on = progress.toggle(id) === 'on';
        const p = this.player;
        if (on && (id === 'mask' || id === 'shard')) p.hp = Math.min(progress.maxHp, p.hp + 1);
        this.applyProgress();
        this.registry.set('hp', p.hp);
        progress.save();
        audio.sfx('coin');
        return on ? 'on' : 'stored';
      },
      onClose: () => {
        this.props.talk(false);
        this.resumeGame();
      },
    });
  }

  // ---------- pausa ----------
  openPause() {
    if (ui.open || this.transitioning) return;
    this.scene.pause();
    ui.hint(null);
    ui.pause({
      onResume: () => this.resumeGame(),
      onMap: MAP_POS[this.room.id] ? () => this.openMap(true) : undefined,
      onInventory: () =>
        ui.inventory({
          toggle: (id) => this.toggleItem(id),
          choosePower: (id) => {
            if (!progress.choosePower(id)) return false;
            this.registry.set('power', id);
            return true;
          },
          onBack: () => ui.pop(),
        }),
      onJournal: progress.seen.has('journal') ? () => ui.journal({ onBack: () => ui.pop() }) : undefined,
      onWeapon: () =>
        ui.weapons({
          current: settings.data.weapon,
          has: (w) => progress.hasWeapon(w),
          // as de começo que ficaram para trás não aparecem; as de chefe aparecem trancadas
          show: (w) => !!WEAPONS[w].boss || progress.hasWeapon(w),
          title: 'Trocar arma',
          // save de antes da regra, com uma arma de chefe na mão: a primeira arma de começo usada fica
          sub: progress.starter
            ? 'A sua arma do começo e as que os chefes deixaram.'
            : 'Escolha a sua arma do começo: ela fica com você até o fim e as outras três não voltam.',
          confirmLabel: 'Usar esta arma',
          onConfirm: (w) => {
            if (!WEAPONS[w].boss) progress.setStarter(w);
            settings.data.weapon = w;
            settings.save();
            this.player.setWeapon(w);
            this.resumeGame();
          },
          onBack: () => ui.pop(),
        }),
      onTitle: () => {
        ui.closeAll();
        this.scene.resume();
        this.toTitle();
      },
    });
  }

  // liga ou desliga um item do inventário. Ligar um item de vida traz o fragmento vazio
  // (senão daria para curar ligando e desligando); desligar tira o fragmento
  private toggleItem(id: Upgrade) {
    const r = progress.toggle(id);
    if (r !== 'on' && r !== 'off') return r;
    const p = this.player;
    this.applyProgress();
    p.hp = Math.max(1, Math.min(progress.maxHp, p.hp));
    this.registry.set('hp', p.hp);
    progress.save();
    this.sfx('equip', 1, r === 'on' ? 1 : 0.8);
    return r;
  }

  private resumeGame() {
    ui.closeAll();
    this.controls.reset();
    this.scene.resume();
  }

  toTitle() {
    this.transitioning = true;
    ui.clearTexts();
    const cam = this.cameras.main;
    cam.fadeOut(600, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop('hud');
      this.scene.start('title');
    });
  }

  // ---------- efeitos ----------
  spawnGhost(src: Phaser.GameObjects.Sprite) {
    const g = this.add
      .image(src.x, src.y, src.texture.key, src.frame.name)
      .setOrigin(src.originX, src.originY)
      .setScale(src.scaleX, src.scaleY)
      .setFlipX(src.flipX)
      .setDepth(9)
      .setTintFill(this.room.theme === 'memory' ? 0xffffff : 0x7d8fb8)
      .setAlpha(0.45);
    this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
  }

  // clarão de luz que se abre e some, com faíscas douradas subindo
  glowBurst(x: number, y: number, tint: number, size: number) {
    const g = this.add.image(x, y, 'glow').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front).setScale(0.6).setAlpha(0.95);
    this.tweens.add({ targets: g, scale: size, alpha: 0, duration: 1000, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
    for (let i = 0; i < 22; i++) this.gold.explode(1, x + (Math.random() - 0.5) * 28, y + (Math.random() - 0.5) * 40);
  }

  dustBurst(x: number, y: number, n: number) {
    this.dust.explode(n, x, y - 1);
  }

  // cinzas e penas do pulo duplo
  featherBurst(x: number, y: number) {
    this.feathers.explode(14, x, y);
  }

  deathBurst(x: number, y: number) {
    this.shards.explode(16, x, y);
    this.sparks.explode(8, x, y);
  }

  footstep() {
    if (this.player.inWater) this.sfx('splash', 0.35);
    else audio.sfx('step', { rate: 0.9 + Math.random() * 0.2 });
  }

  sfx(name: SfxName, vol = 1, rate = 1) {
    audio.sfx(name, { vol, rate });
  }
}

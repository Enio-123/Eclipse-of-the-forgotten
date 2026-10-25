import Phaser from 'phaser';
import { PAL, QUAKE, TILE, VIEW_H, WEAPONS, WEAPON_IDS, type WeaponId } from '../config';
import { Player, type PlayerAction } from '../entities/Player';
import { Crawler } from '../entities/Crawler';
import { Guard } from '../entities/Guard';
import { Crow } from '../entities/Crow';
import { Boss } from '../entities/Boss';
import { overlap, type Enemy } from '../entities/Enemy';
import { Arrow } from '../entities/Arrow';
import { Controls } from '../systems/Controls';
import { audio, type SfxName } from '../systems/Audio';
import { settings } from '../systems/Settings';
import { progress, type Upgrade } from '../systems/Save';
import { Level, isGround, isSolid } from '../world/Level';
import { Decor, DEPTH } from '../world/Decor';
import { Backdrop } from '../world/Backdrop';
import { Weather } from '../world/Weather';
import { MAP_POS, ROOMS, type Exit, type RoomDef, type RoomId } from '../world/rooms';
import { Props, type MemoryOrb, type Relic, type Shrine } from '../world/Props';
import { Loot } from '../world/Loot';
import { MEMORIES, OFFERS, RELICS } from '../world/lore';
import { TILE_ONEWAY } from '../gfx/textures';
import { ui } from '../ui/ui';
import { pad } from '../systems/Pad';
import type { FxScene } from './FxScene';

export type Arrival = 'new' | 'continue' | 'door' | 'mirror' | 'memory' | 'death';

export interface GameInit {
  room: RoomId;
  entry: string;
  from: Arrival;
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

export class GameScene extends Phaser.Scene {
  controls!: Controls;
  level!: Level;
  player!: Player;
  room!: RoomDef;
  decor!: Decor;
  enemies: Enemy[] = [];
  arrows: Arrow[] = [];
  props!: Props;
  loot!: Loot;
  boss: Boss | null = null;
  private bossFrac = -1;
  private backdrop!: Backdrop;
  private weather!: Weather;
  private figure: Phaser.GameObjects.Sprite | null = null;
  private figureState: 'idle' | 'turned' | 'done' = 'idle';
  private hitstopT = 0;
  // tempo de jogo acumulado (os testes esperam por ele, não pelo relógio da máquina)
  clock = 0;
  private respawning = false;
  private transitioning = false;
  private cinematic = false;
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
  private feathers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shards!: Phaser.GameObjects.Particles.ParticleEmitter;
  private gold!: Phaser.GameObjects.Particles.ParticleEmitter;
  private waterFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private wisps!: Phaser.GameObjects.Particles.ParticleEmitter;
  // inimigos já atravessados no dash atual (um sopro por inimigo) e os que já deixaram moedas
  private passed = new Set<Enemy>();
  private passDash = -1;
  private looted = new WeakSet<Enemy>();
  private tracks: Track[] = [];
  private quakes: Quake[] = [];
  private ash!: Phaser.GameObjects.Particles.ParticleEmitter;
  private weaponDrop: WeaponDrop | null = null;

  constructor() {
    super('game');
  }

  get fx() {
    return this.scene.get('fx') as FxScene;
  }

  create(data: GameInit) {
    this.enemies = [];
    this.arrows = [];
    this.tracks = [];
    this.quakes = [];
    this.weaponDrop = null;
    this.boss = null;
    this.bossFrac = -1;
    this.figure = null;
    this.figureState = 'idle';
    this.respawning = false;
    this.transitioning = false;
    this.cinematic = false;
    this.hitstopT = 0;
    this.room = ROOMS[data.room];
    this.controls = new Controls(this);
    document.body.classList.add('playing');

    const room = this.room;
    this.level = new Level(this, room.map, room.theme);
    this.level.layer.setDepth(DEPTH.tiles);
    // terreno pintado da sala: os tiles continuam só para a física
    const terrain = `terrain-${room.id}`;
    if (this.textures.exists(terrain)) {
      this.add.image(0, 0, terrain).setOrigin(0).setDepth(DEPTH.tiles);
      this.level.layer.setVisible(false);
    }
    this.backdrop = new Backdrop(this, this.level);
    this.decor = new Decor(this, this.level, room);
    // na volta da memória o ouro novo só aparece depois do efeito (e a grade abre na frente do jogador)
    const fresh = data.from === 'memory' && !progress.seen.has('memory:vale');
    this.props = new Props(this, room.id !== 'catacumbas' || (progress.seen.has('memory:vale') && !fresh));

    // as laterais com saída e o fundo do abismo não seguram o jogador
    const W = this.level.widthPx;
    const H = this.level.heightPx;
    const exitL = room.exits.some((e) => e.side === 'left');
    const exitR = room.exits.some((e) => e.side === 'right');
    this.physics.world.setBounds(0, 0, W, H + (room.pit ? 400 : 0));
    this.physics.world.setBoundsCollision(!exitL, !exitR, false, !room.pit);

    const spawn = this.level.spawn(data.entry) ?? this.level.spawn('P') ?? this.level.spawns[0];
    // uma arma de chefe só vale se já foi ganha neste progresso
    if (!progress.hasWeapon(settings.data.weapon)) {
      settings.data.weapon = 'scythe';
      settings.save();
    }
    this.player = new Player(this, spawn.x, spawn.y, settings.data.weapon);
    this.player.facing = spawn.x < W / 2 ? 1 : -1;
    this.player.canAttack = !room.noAttack;
    this.applyProgress();
    const keepHp = data.from === 'door' ? (this.registry.get('hp') as number | undefined) : undefined;
    this.player.hp = keepHp && keepHp > 0 ? Math.min(keepHp, progress.maxHp) : progress.maxHp;
    this.registry.set('hp', this.player.hp);
    this.registry.set('kintsugi', fresh ? progress.kintsugi - 1 : progress.kintsugi);
    this.registry.set('hud-hidden', room.id === 'memoria');
    this.registry.set('coins', progress.coins);

    for (const s of this.level.spawns) {
      if (s.kind === 'X') {
        this.placeBoss(s.x, s.y);
        continue;
      }
      if (s.kind !== 'c' && s.kind !== 'g' && s.kind !== 'v') continue;
      // trecho vencido e já descansado: as criaturas dali viraram cinza
      const key = `${room.id}:${s.tx}:${s.ty}`;
      if (progress.seen.has(`clear:${key}`)) continue;
      const e = s.kind === 'c' ? new Crawler(this, s.x, s.y) : s.kind === 'g' ? new Guard(this, s.x, s.y) : new Crow(this, s.x, s.y - 10);
      this.enemies.push(e);
      this.tracks.push({ key, e, hx: s.x, hy: s.y - 16, f: progress.seen.has(`pass:${key}`) ? PASSED : 0 });
    }
    const f = this.decor.figureSpawn;
    if (f) {
      const o = this.registry.get('figure-origin') as { x: number; y: number };
      this.figure = this.add.sprite(f.x, f.y, 'figure', 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy).play('figure-idle');
    }
    this.physics.add.collider(this.player.zone, this.level.layer, undefined, this.oneWayFilter, this);
    for (const e of this.enemies) this.physics.add.collider(e.zone, this.level.layer);

    this.makeParticles();
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
    if (room.theme !== 'memory') {
      this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(29).setAlpha(room.theme === 'catacomb' ? 0.9 : 0.5);
    }
    if (room.theme === 'bridge') {
      this.add.tileSprite(0, VIEW_H - 120, 640, 140, 'fog').setOrigin(0).setScrollFactor(0).setDepth(30).setAlpha(0.35).setName('fog-front');
    }

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.setBackgroundColor(this.backdrop.bg);
    cam.startFollow(this.player.zone, true, 0.11, 0.13);
    this.lookX = this.player.facing * 36;
    this.camY = room.theme === 'memory' ? 72 : 26;
    document.body.classList.toggle('bright', room.theme === 'memory');
    this.fx.setGrain(room.theme === 'memory' ? 0.035 : 0.09);
    cam.setFollowOffset(-this.lookX, this.camY);

    if (!this.scene.isActive('hud')) this.scene.launch('hud');

    audio.music(room.music);
    audio.ambience(room.ambience);
    audio.stepKind = room.theme === 'bridge' ? 'wet' : room.theme === 'memory' ? 'grass' : 'stone';
    audio.space = room.theme === 'catacomb' ? 0.45 : 0.12;

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

    ui.onStackChange = (open) => {
      if (!open) this.controls.reset();
    };
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.onclick = () => this.openPause();
    this.events.once('shutdown', () => {
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
      cam.setScroll(this.player.x + 560 - 320, this.player.zone.y - this.camY - 180);
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
      this.fx.heal(this.player.x - cam.scrollX, this.player.body.center.y - cam.scrollY);
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
    }
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
    this.decor.update(time, dt);
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
    p.update(dt, this.controls);
    for (const e of this.enemies) e.update(dt);
    this.trackPasses();
    this.updateQuakes(dt);
    this.updateWeaponDrop(dt);
    this.props.update(time, p);
    this.trackVisit(dt);
    this.bossFight();
    this.updateArrows(dt);
    this.combat();
    this.loot.update(dt);
    this.hazards();
    this.water();
    this.story();
    this.exits();
    this.follow(dt);
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
      for (const e of this.enemies) {
        if (!e.alive || p.hitSet.has(e)) continue;
        if (!overlap(box, e.rect)) continue;
        p.hitSet.add(e);
        const r = e.hit(p.x, p.weapon.dmg * progress.dmgMul, p.atkDir);
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
        if (!e.alive) this.onKill(e);
      }
      if (blocked && !hit) {
        p.onBlocked();
        this.hitstop(0.06);
        this.cameras.main.shake(60, 0.003);
        pad.rumble(0.2, 0.3, 60);
      }
      if (p.atkDir === 'down' && !p.hitSet.has('spikes') && this.level.touchesSpikes(box.x, box.y, box.width, box.height)) {
        p.hitSet.add('spikes');
        hit = true;
        this.sparks.explode(6, p.x, box.bottom - 8);
        this.sfx('hit');
      }
      if (hit) {
        // quanto mais pesada a arma, mais o impacto segura e treme
        const w = p.weapon;
        const heavy = w.quake ? 2 : w.id === 'scythe' ? 1 : 0;
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
      if (e.alive && e.harms(pr, p.untouchable) && p.hurt(e.zone.x)) {
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
      this.wisps.explode(12, c.centerX, c.centerY);
      this.sfx('ghost', 0.55, 0.9 + Math.random() * 0.2);
      if (!progress.seen.has('ghost:first')) {
        progress.seen.add('ghost:first');
        ui.thought('Por um instante, nada me toca.', 3600);
      }
    }
  }

  // inimigo derrotado: deixa moedas e, de vez em quando, um caco de vida
  private onKill(e: Enemy) {
    if (this.looted.has(e)) return;
    this.looted.add(e);
    this.loot.drop(e.kind, e.zone.x, e.zone.y);
    const t = this.tracks.find((k) => k.e === e);
    if (t && t.f !== PASSED) this.markPassed(t);
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
      const fw = spr.frame.width;
      const fh = spr.frame.height;
      const top0 = spr.y - spr.displayOriginY;
      const from = Phaser.Math.Clamp(rect.y - top0 - 8, 0, fh);
      const to = Phaser.Math.Clamp(rect.bottom - top0 + 4, 0, fh);
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
          for (let i = 0; i < 3; i++) this.ash.emitParticle(1, rect.x + Math.random() * rect.width, top0 + c);
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
        const r = e.hit(q.x - q.dir * 20, QUAKE.dmg * progress.dmgMul, 'quake');
        if (r !== 'hit') continue;
        this.sparks.explode(8, q.x, q.y - 6);
        this.sfx(e.alive ? 'hit' : 'kill', 0.8, 0.8);
        this.hitstop(0.04);
        if (!e.alive) this.onKill(e);
      }
    }
    this.quakes = this.quakes.filter((q) => q.t <= QUAKE.life);
  }

  markDirty() {
    this.dirty = true;
  }

  spawnArrow(x: number, y: number, dx: number, dy: number, dmg: number) {
    this.arrows.push(new Arrow(this, x, y, dx, dy, dmg * progress.dmgMul));
  }

  private updateArrows(dt: number) {
    for (const a of this.arrows) {
      if (a.dead) continue;
      if (a.update(dt, this.level) === 'wall') {
        this.sparks.explode(4, a.tip.x, a.tip.y);
        this.sfx('thunk');
        continue;
      }
      if (a.dead || a.stuck) continue;
      for (const e of this.enemies) {
        if (!e.alive || !overlap(a.rect, e.rect)) continue;
        const r = e.hit(a.x - a.dx * 20, a.dmg, 'arrow');
        if (r === 'blocked') {
          this.clangs.explode(8, a.tip.x, a.tip.y);
          this.sfx('clang', 0.7);
        } else {
          this.sparks.explode(8, a.tip.x, a.tip.y);
          this.sfx(e.alive ? 'hit' : 'kill');
          if (!e.alive) this.onKill(e);
          this.hitstop(0.035);
        }
        a.destroy();
        break;
      }
    }
    this.arrows = this.arrows.filter((a) => !a.dead);
  }

  private hazards() {
    const p = this.player;
    if (this.respawning || p.dead || this.transitioning) return;
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
    this.registry.set('hp', p.hp);
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
    // as moedas pegas até aqui ficam (grava sem mudar o ponto de retorno)
    if (this.dirty) progress.save();
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
      this.room.thoughts.forEach((t, i) => {
        const key = `thought:${this.room.id}:${i}`;
        if (progress.seen.has(key) || Math.abs(tx - t.x) > 1.5) return;
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
      const near = this.cinematic ? null : this.props.nearby(p);
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
    this.fx.shatter(m.x - cam.scrollX, m.y - 42 - cam.scrollY, () => {
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
    if (this.transitioning) return;
    const b = this.player.body;
    const W = this.level.widthPx;
    const ex = this.room.exits.find((e) => (e.side === 'right' && b.center.x > W + 2) || (e.side === 'left' && b.center.x < -2));
    if (ex) this.goTo(ex);
  }

  private goTo(ex: Exit) {
    this.transitioning = true;
    ui.hint(null);
    if (this.dirty) progress.save();
    this.registry.set('hp', this.player.hp);
    const cam = this.cameras.main;
    cam.fadeOut(260, 7, 8, 13);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart({ room: ex.to, entry: ex.entry, from: 'door' } satisfies GameInit));
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
    p.dashCdMul = progress.on('breath') ? 0.55 : 1;
    this.registry.set('maxhp', progress.maxHp);
    this.registry.set('memories', [...progress.memories].map((m) => (progress.traded.has(m) ? 0 : 1)));
    this.registry.set('coins', progress.coins);
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
    progress.seen.add(this.props.restKey(sh.i));
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
      this.glowBurst(p.x, p.body.center.y, r.kind === 'wall' ? 0xbcd4ff : 0xfff0c8, 7);
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
    if (info) ui.banner(info.title, info.text, 4600);
    if (m.id === 'cripta:boss') this.chapterEnd();
  }

  // ---------- o Sineiro ----------
  private placeBoss(x: number, y: number) {
    if (!progress.seen.has('boss:sineiro')) {
      const b = new Boss(this, x, y);
      b.onDefeat = () => this.onBossDefeat();
      this.boss = b;
      this.enemies.push(b);
      return;
    }
    // já vencido: o corpo continua caído no fundo da cripta
    const a = this.anims.get('sineiro-death');
    const o = this.registry.get('sineiro-origin') as { x: number; y: number };
    this.add.image(x, y, 'sineiro', a.frames[a.frames.length - 1].textureFrame).setOrigin(o.x, o.y).setDepth(DEPTH.prop).setFlipX(true).setTint(0x9a948c);
    if (!progress.memories.has('cripta:boss')) this.props.addMemory('cripta:boss', x - 40, y - 26);
    const w = this.bossWeapon('sineiro');
    if (w) this.dropWeapon(w, x + 44, y, false);
  }

  // arma que um chefe deixa (cada chefe tem a sua)
  private bossWeapon(boss: string): WeaponId | null {
    const id = WEAPON_IDS.find((w) => WEAPONS[w].boss?.id === boss);
    return id && !progress.hasWeapon(id) ? id : null;
  }

  private bossFight() {
    const b = this.boss;
    if (!b) return;
    const p = this.player;
    if (b.state === 'sleep') {
      if (!p.dead && !this.transitioning && p.x > 10 * TILE) {
        // a grade fecha atrás do cavaleiro e o sineiro acorda
        this.props.setGates(false, true);
        this.sfx('clang', 1);
        audio.music('boss', 0.4);
        b.wake();
        this.time.delayedCall(1600, () => ui.banner('O Sineiro', 'Guardião do último sino', 2800));
      }
      return;
    }
    if (!b.alive) return;
    const frac = b.hp / b.maxHp;
    if (frac !== this.bossFrac) {
      this.bossFrac = frac;
      ui.bossBar('O Sineiro', frac);
    }
  }

  private onBossDefeat() {
    const b = this.boss!;
    progress.seen.add('boss:sineiro');
    progress.save();
    audio.music('none', 1.5);
    ui.bossBar('O Sineiro', 0);
    this.time.delayedCall(1400, () => ui.bossBar(null));
    this.time.delayedCall(2600, () => {
      // sai do corpo caído, sempre longe das paredes para dar para pegar
      const x = Phaser.Math.Clamp(b.zone.x + b.facing * 12, 5 * TILE, (this.level.w - 5) * TILE);
      this.props.addMemory('cripta:boss', x, b.body.bottom - 28, true);
      this.sfx('chime');
      this.props.setGates(true, true);
      ui.thought('O sino parou. Pela primeira vez, silêncio.', 4600);
    });
    // e a arma dele cai do outro lado do corpo
    const w = this.bossWeapon('sineiro');
    if (w) {
      this.time.delayedCall(3300, () => {
        const x = Phaser.Math.Clamp(b.zone.x - b.facing * 40, 5 * TILE, (this.level.w - 5) * TILE);
        this.dropWeapon(w, x, b.body.bottom, true);
      });
    }
  }

  // ---------- armas de chefe ----------
  private dropWeapon(id: WeaponId, x: number, floorY: number, animate: boolean) {
    if (this.weaponDrop || progress.hasWeapon(id)) return;
    const y = floorY - 16;
    const glow = this.add.image(x, y, 'glow').setScale(2).setTint(0xffc46a).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front);
    const sprite = this.add.image(x, y, `item-${id}`).setDepth(DEPTH.enemy + 0.5);
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

  private chapterEnd(wait = 5200) {
    this.time.delayedCall(wait, () => {
      if (this.transitioning) return;
      // não corta a cena de pegar a arma do chefe
      if (this.cinematic || ui.open) {
        this.chapterEnd(600);
        return;
      }
      this.scene.pause();
      ui.end({
        title: 'Fim do primeiro capítulo',
        text: 'O último sino das catacumbas ficou em silêncio. Ele lembrou de um altar e de alguém esperando. Ainda falta lembrar quem.',
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
      onInventory: () => ui.inventory({ toggle: (id) => this.toggleItem(id), onBack: () => ui.pop() }),
      onWeapon: () =>
        ui.weapons({
          current: settings.data.weapon,
          has: (w) => progress.hasWeapon(w),
          confirmLabel: 'Usar esta arma',
          onConfirm: (w) => {
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

import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import { DEPTH } from './Decor';
import { face, hd, hdScale } from '../gfx/flip';
import { progress } from '../systems/Save';
import { TILE } from '../config';
import { rng } from '../gfx/raster';
import { surveyorRegion } from './regions';
import { ending } from './story';
import { AFTER_TALK } from './endings';

export type NpcKind = 'nun' | 'smith' | 'folk' | 'prisoner' | 'miner' | 'surveyor';

export interface Npc {
  kind: NpcKind;
  // o n-ésimo esquecido da sala (as falas vêm de RoomDef.npcs[i]; de CROWD em diante, a gente na rua depois do fim)
  i: number;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Sprite;
  // xale ou chapéu (só os esquecidos)
  look: 'shawl' | 'hat';
  // próxima fala
  line: number;
}

// figura da procissão: anda devagar entre as marcas Z da sala, ida e volta
interface Walker {
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  dir: 1 | -1;
  x0: number;
  x1: number;
  puffT: number;
}

const KEY: Record<NpcKind, string> = { nun: 'nun', smith: 'smith', folk: 'folk', prisoner: 'prisoner', miner: 'oldminer', surveyor: 'surveyor' };
// a gente que volta para a rua depois do fim (Npc.i a partir daqui; não tem fala na sala)
export const CROWD = 100;
// as ruas abertas da cidade, onde a gente aparece depois do fim
const STREETS = new Set(['praca', 'mercado', 'rua']);
// a luz do novo Eclipse em quem esqueceu tudo (o final II)
const FORGOT = 0xb8b0cc;

// ela ou ele (o xale dos esquecidos; os outros têm o nome)
export const female = (n: Npc) => (n.kind === 'folk' ? n.look === 'shawl' : n.kind === 'nun');

const NAME: Record<NpcKind, (n: Npc) => string> = {
  nun: () => 'a irmã Luzia',
  smith: () => 'Brás',
  folk: (n) => (n.look === 'shawl' ? 'a esquecida' : 'o esquecido'),
  prisoner: () => 'Tomé',
  miner: () => 'o mineiro que ficou',
  surveyor: () => 'o Agrimensor',
};

// Gente da Cidade-Catedral: a freira cega (N), o ferreiro (B), os esquecidos que falam (E) e a
// procissão de penitentes que passa ao fundo (Z)
export class Npcs {
  readonly list: Npc[] = [];
  private walkers: Walker[] = [];
  private glow: Phaser.GameObjects.Image | null = null;
  // a grade da cela do Tomé (some quando ele sai)
  private cell: Phaser.GameObjects.TileSprite | null = null;
  // a vela acesa no capacete do mineiro que ficou
  private candle: { n: Npc; glow: Phaser.GameObjects.Image } | null = null;
  // a lanterna pendurada na groma do Agrimensor
  private lantern: Phaser.GameObjects.Image | null = null;

  // o final do save: depois do I a gente lembra e sai de casa; depois do II fica parada, sem nome
  private readonly end = ending();

  constructor(private s: GameScene) {
    let folk = 0;
    const route: number[] = [];
    let routeY = 0;
    for (const sp of s.level.spawns) {
      if (sp.kind === 'N') this.add('nun', sp.x, sp.y, 0);
      else if (sp.kind === 'B') this.add('smith', sp.x, sp.y, 0);
      // nas minas, o E é o mineiro que ficou, sentado no caixote com a vela do capacete acesa
      else if (sp.kind === 'E' && s.room.theme === 'mine') this.add('miner', sp.x, sp.y, 0);
      else if (sp.kind === 'E') this.add('folk', sp.x, sp.y, folk++);
      else if (sp.kind === 'I') {
        // Tomé: preso na cela até ganhar as chaves; depois espera na porta das máscaras
        const free = progress.seen.has('preso:livre');
        if ((s.room.id === 'celas') !== free) this.add('prisoner', sp.x, sp.y, 0);
      }
      else if (sp.kind === 'Z') {
        route.push(sp.x);
        routeY = sp.y;
      }
    }
    // a procissão de penitentes: depois do I eles foram para casa; depois do II ficam parados no caminho
    if (route.length >= 2 && this.end !== 'truth') this.procession(Math.min(...route), Math.max(...route), routeY);
    if (this.end && STREETS.has(s.room.id)) this.crowd();
    // o Agrimensor, se esta é a sala onde ele espera agora (ele anda sempre uma região na frente)
    const sv = surveyorRegion(s.room.id, (id) => (progress.visited.get(id)?.size ?? 0) > 0)?.surveyor;
    if (sv && sv.room === s.room.id && s.textures.exists('surveyor')) this.add('surveyor', sv.x * TILE + TILE / 2, (sv.y + 1) * TILE, 0);
  }

  private add(kind: NpcKind, x: number, y: number, i: number) {
    const s = this.s;
    // sem a folha própria do Tomé, ele usa a dos esquecidos, mais escura
    const own = kind !== 'prisoner' || s.textures.exists('prisoner');
    const key = own ? KEY[kind] : 'folk';
    const look = kind === 'prisoner' ? 'hat' : i % 2 ? 'hat' : 'shawl';
    const o = s.registry.get(`${key}-origin`) as { x: number; y: number };
    const idle = this.animKey(kind, look, false);
    const sprite = hd(s.add.sprite(x, y, key, 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy - 0.5));
    if (!own) sprite.setTint(0x8f8a84);
    sprite.play({ key: idle, startFrame: Math.floor(Math.random() * 2) });
    if (this.still(kind)) sprite.anims.pause();
    if (this.end === 'absorb' && kind !== 'nun') sprite.setTint(FORGOT);
    const n: Npc = { kind, i, x, y, sprite, look, line: 0 };
    this.list.push(n);
    if (kind === 'prisoner' && s.room.id === 'celas') {
      const bars = s.textures.exists('deco-cellbars') ? 'deco-cellbars' : 'deco-portcullis';
      const k = hdScale(s, bars);
      this.cell = s.add.tileSprite(x - 24, y - 56, 48, 56, bars).setOrigin(0).setTileScale(k, k).setDepth(DEPTH.enemy - 0.3);
    }
    if (kind === 'surveyor') {
      // a groma fincada do lado dele (fica parada quando ele vira para quem chega) e a lanterna
      // pendurada no braço dela: a luz dele nas catacumbas e nas minas
      const gx = x + 22;
      if (s.textures.exists('deco-groma')) hd(s.add.image(gx, y + 1, 'deco-groma')).setOrigin(0.5, 71 / 72).setDepth(DEPTH.enemy - 0.6);
      this.lantern = s.add.image(gx + 13.5, y - 53, 'glow').setTint(0xffb35a).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy - 0.4).setScale(0.55).setAlpha(0.5);
    }
    if (kind === 'miner') {
      // a vela do capacete: a única luz dele
      this.candle = { n, glow: s.add.image(x, y - 50, 'glow').setTint(0xffb35a).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy - 0.4).setScale(0.5).setAlpha(0.5) };
    }
    if (kind === 'smith') {
      // a forja: brilho da brasa na bigorna e faísca a cada martelada
      this.glow = s.add.image(x + 34, y - 20, 'glow').setTint(0xff8a3a).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front).setAlpha(0.4).setScale(1.3);
      sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_a: Phaser.Animations.Animation, f: Phaser.Animations.AnimationFrame) => {
        if (sprite.anims.currentAnim?.key !== 'smith-work' || f.index !== 3) return;
        s.forgeSpark(x + 34, y - 22);
        const d = Math.abs(s.player.x - x);
        if (d < 300) s.sfx('anvil', 0.5 * (1 - d / 300));
      });
    }
  }

  private procession(x0: number, x1: number, y: number) {
    const s = this.s;
    const o = s.registry.get('censer-origin') as { x: number; y: number };
    for (let k = 0; k < 4; k++) {
      const x = x0 + k * 26;
      const sprite = hd(s.add.sprite(x, y - 4, 'censer', 0), 0.86)
        .setOrigin(o.x, o.y)
        .setDepth(DEPTH.prop - 0.5)
        .setTint(0x45404e)
        .setAlpha(0.9);
      sprite.play({ key: 'censer-walk', startFrame: k % 6 });
      sprite.anims.timeScale = 0.55;
      if (this.end === 'absorb') {
        sprite.anims.pause();
        continue;
      }
      this.walkers.push({ sprite, x, dir: 1, x0, x1: x1 + k * 26, puffT: Math.random() });
    }
  }

  // a gente na rua depois do fim: no I quem voltou a lembrar saiu de casa; no II as pessoas ficaram paradas onde
  // estavam. Em pé no chão da rua (o chão de pedra que mais aparece embaixo do céu), longe das saídas, das marcas
  // do mapa e de quem já está ali
  private crowd() {
    const s = this.s;
    const L = s.level;
    const floors = L.skyFloors().filter((f) => L.ch(f.x, f.y) === '#');
    const count = new Map<number, number>();
    for (const f of floors) count.set(f.y, (count.get(f.y) ?? 0) + 1);
    let street = -1;
    let most = 0;
    for (const [y, c] of count) {
      if (c <= most) continue;
      most = c;
      street = y;
    }
    if (street < 0) return;
    const marks = L.spawns.filter((p) => p.ty === street - 1).map((p) => p.tx);
    const free = floors.filter((f) => f.y === street && f.x >= 6 && f.x < L.w - 6 && marks.every((m) => Math.abs(m - f.x) > 2)).map((f) => f.x);
    const used = this.list.map((n) => Math.floor(n.x / TILE));
    const rand = rng(s.room.id.length * 131 + L.w);
    const want = Phaser.Math.Clamp(Math.round(free.length / 18), 3, 6);
    let k = 0;
    for (let tries = 0; tries < 60 && k < want && free.length; tries++) {
      const x = free[Math.floor(rand() * free.length)];
      if (used.some((u) => Math.abs(u - x) < 5)) continue;
      used.push(x);
      this.add('folk', x * TILE + TILE / 2, street * TILE, CROWD + k);
      const n = this.list[this.list.length - 1];
      face(n.sprite, rand() < 0.5);
      k++;
    }
  }

  // quem fica parado, sem mexer (o final II): todos menos a irmã Luzia e o Brás, que martela de costume
  private still(kind: NpcKind) {
    return this.end === 'absorb' && kind !== 'nun' && kind !== 'smith';
  }

  update(dt: number) {
    const p = this.s.player;
    for (const n of this.list) {
      if (n.kind === 'smith' || this.still(n.kind)) continue;
      // vira para quem chega perto (a freira pelo som dos passos)
      if (Math.abs(p.x - n.x) < 140) face(n.sprite, p.x < n.x);
    }
    if (this.glow) this.glow.setAlpha(0.32 + Math.random() * 0.12);
    if (this.lantern) this.lantern.setAlpha(0.44 + Math.random() * 0.08);
    if (this.candle) {
      const n = this.candle.n;
      const f = n.sprite.flipX ? -1 : 1;
      this.candle.glow.setPosition(n.x + f * 9, n.y - 51).setAlpha(0.42 + Math.random() * 0.1);
    }
    for (const w of this.walkers) {
      w.x += w.dir * 16 * dt;
      if (w.x > w.x1) w.dir = -1;
      else if (w.x < w.x0) w.dir = 1;
      face(w.sprite.setPosition(Math.round(w.x), w.sprite.y), w.dir < 0);
      w.puffT -= dt;
      if (w.puffT <= 0) {
        w.puffT = 0.35 + Math.random() * 0.3;
        this.s.incense(w.x + w.dir * 16, w.sprite.y - 28, 1);
      }
    }
  }

  private animKey(kind: NpcKind, look: 'shawl' | 'hat', talk: boolean) {
    if (kind === 'prisoner') {
      if (this.s.textures.exists('prisoner')) return `prisoner-${talk ? 'talk' : 'idle'}`;
      return `folk-${talk ? 'talk' : 'idle'}-hat`;
    }
    if (kind === 'folk') return `folk-${talk ? 'talk' : 'idle'}-${look}`;
    if (kind === 'miner') return `oldminer-${talk ? 'talk' : 'idle'}`;
    if (kind === 'smith') return talk ? 'smith-talk' : 'smith-work';
    if (kind === 'surveyor') return `surveyor-${talk ? 'talk' : 'idle'}`;
    return `nun-${talk ? 'talk' : 'idle'}`;
  }

  talking(n: Npc, on: boolean) {
    n.sprite.play(this.animKey(n.kind, n.look, on), true);
  }

  // Tomé sai da cela: a grade sobe e ele vai embora pelo corredor
  release(n: Npc) {
    const s = this.s;
    if (this.cell) {
      s.tweens.add({ targets: this.cell, y: this.cell.y - 60, alpha: 0, duration: 1400, ease: 'Sine.easeInOut' });
      s.sfx('gate', 0.8, 1.1);
    }
    s.tweens.add({ targets: n.sprite, alpha: 0, x: n.x + 90, delay: 1200, duration: 2200, onComplete: () => n.sprite.destroy() });
    this.list.splice(this.list.indexOf(n), 1);
  }

  // o nome na dica de falar: depois do I os esquecidos que falavam têm nome de novo; depois do II ninguém tem
  // (só a irmã Luzia, que lembra)
  label(n: Npc) {
    if (this.end === 'absorb' && n.kind !== 'nun') return female(n) ? 'a esquecida' : 'o esquecido';
    const f = this.end === 'truth' && n.kind === 'folk' ? AFTER_TALK.truth.folk[`${this.s.room.id}:${n.i}`] : undefined;
    if (f) return f.name;
    if (n.kind === 'folk' && n.i >= CROWD) return female(n) ? 'a moradora' : 'o morador';
    return NAME[n.kind](n);
  }

  nearby(p: Player): { hint: string; act: () => void } | null {
    if (!p.onGround) return null;
    for (const n of this.list) {
      const reach = n.kind === 'smith' ? 46 : 30;
      if (Math.abs(p.x - n.x) > reach || Math.abs(p.body.bottom - n.y) > 12) continue;
      return { hint: `{up} falar com ${this.label(n)}`, act: () => this.s.talkTo(n) };
    }
    return null;
  }
}

import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import { DEPTH } from './Decor';
import { face, hd, hdScale } from '../gfx/flip';
import { progress } from '../systems/Save';

export type NpcKind = 'nun' | 'smith' | 'folk' | 'prisoner';

export interface Npc {
  kind: NpcKind;
  // o n-ésimo esquecido da sala (as falas vêm de RoomDef.npcs[i])
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

const KEY: Record<NpcKind, string> = { nun: 'nun', smith: 'smith', folk: 'folk', prisoner: 'prisoner' };
const NAME: Record<NpcKind, (n: Npc) => string> = {
  nun: () => 'a irmã Luzia',
  smith: () => 'Brás',
  folk: (n) => (n.look === 'shawl' ? 'a esquecida' : 'o esquecido'),
  prisoner: () => 'Tomé',
};

// Gente da Cidade-Catedral: a freira cega (N), o ferreiro (B), os esquecidos que falam (E) e a
// procissão de penitentes que passa ao fundo (Z)
export class Npcs {
  readonly list: Npc[] = [];
  private walkers: Walker[] = [];
  private glow: Phaser.GameObjects.Image | null = null;
  // a grade da cela do Tomé (some quando ele sai)
  private cell: Phaser.GameObjects.TileSprite | null = null;

  constructor(private s: GameScene) {
    let folk = 0;
    const route: number[] = [];
    let routeY = 0;
    for (const sp of s.level.spawns) {
      if (sp.kind === 'N') this.add('nun', sp.x, sp.y, 0);
      else if (sp.kind === 'B') this.add('smith', sp.x, sp.y, 0);
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
    if (route.length >= 2) this.procession(Math.min(...route), Math.max(...route), routeY);
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
    const n: Npc = { kind, i, x, y, sprite, look, line: 0 };
    this.list.push(n);
    if (kind === 'prisoner' && s.room.id === 'celas') {
      const bars = s.textures.exists('deco-cellbars') ? 'deco-cellbars' : 'deco-portcullis';
      const k = hdScale(s, bars);
      this.cell = s.add.tileSprite(x - 24, y - 56, 48, 56, bars).setOrigin(0).setTileScale(k, k).setDepth(DEPTH.enemy - 0.3);
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
      this.walkers.push({ sprite, x, dir: 1, x0, x1: x1 + k * 26, puffT: Math.random() });
    }
  }

  update(dt: number) {
    const p = this.s.player;
    for (const n of this.list) {
      if (n.kind === 'smith') continue;
      // vira para quem chega perto (a freira pelo som dos passos)
      if (Math.abs(p.x - n.x) < 140) face(n.sprite, p.x < n.x);
    }
    if (this.glow) this.glow.setAlpha(0.32 + Math.random() * 0.12);
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
    if (kind === 'smith') return talk ? 'smith-talk' : 'smith-work';
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

  nearby(p: Player): { hint: string; act: () => void } | null {
    if (!p.onGround) return null;
    for (const n of this.list) {
      const reach = n.kind === 'smith' ? 46 : 30;
      if (Math.abs(p.x - n.x) > reach || Math.abs(p.body.bottom - n.y) > 12) continue;
      return { hint: `{up} falar com ${NAME[n.kind](n)}`, act: () => this.s.talkTo(n) };
    }
    return null;
  }
}

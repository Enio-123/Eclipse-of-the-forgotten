import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import { DEPTH } from './Decor';
import { face, hd } from '../gfx/flip';

export type NpcKind = 'nun' | 'smith' | 'folk';

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

const KEY: Record<NpcKind, string> = { nun: 'nun', smith: 'smith', folk: 'folk' };
const NAME: Record<NpcKind, (n: Npc) => string> = {
  nun: () => 'a irmã Luzia',
  smith: () => 'Brás',
  folk: (n) => (n.look === 'shawl' ? 'a esquecida' : 'o esquecido'),
};

// Gente da Cidade-Catedral: a freira cega (N), o ferreiro (B), os esquecidos que falam (E) e a
// procissão de penitentes que passa ao fundo (Z)
export class Npcs {
  readonly list: Npc[] = [];
  private walkers: Walker[] = [];
  private glow: Phaser.GameObjects.Image | null = null;

  constructor(private s: GameScene) {
    let folk = 0;
    const route: number[] = [];
    let routeY = 0;
    for (const sp of s.level.spawns) {
      if (sp.kind === 'N') this.add('nun', sp.x, sp.y, 0);
      else if (sp.kind === 'B') this.add('smith', sp.x, sp.y, 0);
      else if (sp.kind === 'E') this.add('folk', sp.x, sp.y, folk++);
      else if (sp.kind === 'Z') {
        route.push(sp.x);
        routeY = sp.y;
      }
    }
    if (route.length >= 2) this.procession(Math.min(...route), Math.max(...route), routeY);
  }

  private add(kind: NpcKind, x: number, y: number, i: number) {
    const s = this.s;
    const key = KEY[kind];
    const look = i % 2 ? 'hat' : 'shawl';
    const o = s.registry.get(`${key}-origin`) as { x: number; y: number };
    const idle = kind === 'folk' ? `folk-idle-${look}` : kind === 'smith' ? 'smith-work' : 'nun-idle';
    const sprite = hd(s.add.sprite(x, y, key, 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy - 0.5));
    sprite.play({ key: idle, startFrame: Math.floor(Math.random() * 2) });
    const n: Npc = { kind, i, x, y, sprite, look, line: 0 };
    this.list.push(n);
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

  talking(n: Npc, on: boolean) {
    const key = n.kind === 'folk' ? `folk-${on ? 'talk' : 'idle'}-${n.look}` : n.kind === 'smith' ? (on ? 'smith-talk' : 'smith-work') : `nun-${on ? 'talk' : 'idle'}`;
    n.sprite.play(key, true);
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

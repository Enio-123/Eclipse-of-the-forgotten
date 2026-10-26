import Phaser from 'phaser';
import { TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { progress, SLOT_IDS, type SlotFind, type Upgrade } from '../systems/Save';
import { DEPTH } from './Decor';
import { isGround } from './Level';
import { hd } from '../gfx/flip';

// o que dá para achar pelo caminho: um item (melhoria) ou um espaço a mais no inventário
export type FindId = Upgrade | Exclude<SlotFind, 'elo'>;

export const isSlotFind = (id: FindId): id is Exclude<SlotFind, 'elo'> => (SLOT_IDS as string[]).includes(id);
export const hasFind = (id: FindId) => (isSlotFind(id) ? progress.seen.has(`item:${id}`) : progress.upgrades.has(id));

// cor do brilho de cada achado (a luz que ele faz no chão)
const GLOW: Partial<Record<FindId, number>> = {
  flower: 0xf0b8b0,
  helmet: 0xffd27a,
  rawamber: 0xffa63c,
  watch: 0xf2cd78,
  whistle: 0xd8dce8,
  mirror: 0xffc46a,
  bornal: 0xffd8a0,
  cinto: 0xffd8a0,
};

interface Find {
  id: FindId;
  x: number;
  y: number;
  t: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  ready: boolean;
}

// Os achados no chão: brilham, sobem e descem devagar e são pegos encostando (como o Elo e as armas
// de chefe). Os que nascem na hora (baú aberto, chefe vencido, espelho rachado) pulam de onde saíram
// e caem no chão com um tinido.
export class Finds {
  private list: Find[] = [];

  constructor(private s: GameScene) {}

  has(id: FindId) {
    return this.list.some((f) => f.id === id);
  }

  // x, floor: em pixels, o chão onde ele fica; from: de onde ele pula (sem from, já está lá)
  add(id: FindId, x: number, floor: number, from?: { x: number; y: number }) {
    const s = this.s;
    if (hasFind(id) || this.has(id)) return;
    const key = `item-${id}`;
    if (!s.textures.exists(key)) return;
    // não cai no vão: procura o chão mais perto embaixo e dos lados
    const L = s.level;
    const ground = (gx: number) => isGround(L.tileAt(gx, floor + 2));
    if (!ground(x)) x = [x - 12, x + 12, x - 24, x + 24].find(ground) ?? x;
    const y = floor - 13;
    const glow = s.add.image(x, y, 'glow').setScale(1.5).setTint(GLOW[id] ?? 0xfff1d6).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front);
    const sprite = hd(s.add.image(x, y, key).setDepth(DEPTH.enemy + 0.5));
    const f: Find = { id, x, y, t: Math.random() * 6, sprite, glow, ready: !from };
    this.list.push(f);
    if (!from) return;
    // pula de onde saiu, gira e cai no chão
    const sc = sprite.scale;
    sprite.setPosition(from.x, from.y).setAlpha(0).setScale(sc * 0.6);
    glow.setPosition(from.x, from.y).setScale(0.4);
    s.tweens.add({ targets: sprite, alpha: 1, scale: sc, duration: 220 });
    s.tweens.add({ targets: glow, scale: 1.5, duration: 700 });
    const top = Math.min(from.y, y) - 26;
    s.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 760,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        // arco: sobe até top e desce até o chão (parábola em k)
        const px = from.x + (x - from.x) * k;
        const a = from.y;
        const py = (1 - k) * (1 - k) * a + 2 * (1 - k) * k * top + k * k * y;
        sprite.setPosition(px, py).setAngle((1 - k) * -220);
        glow.setPosition(px, py);
      },
      onComplete: () => {
        f.ready = true;
        sprite.setAngle(0);
        s.sfx('tink', 0.8, 1.2);
        s.dustBurst(x, floor, 5);
      },
    });
  }

  update(dt: number) {
    const s = this.s;
    const p = s.player;
    for (const f of [...this.list]) {
      if (!f.ready) continue;
      f.t += dt;
      const y = f.y + Math.sin(f.t * 2.4) * 2;
      f.sprite.y = y;
      f.glow.y = y;
      f.glow.alpha = 0.4 + Math.sin(f.t * 3.6) * 0.1;
      if (Math.random() < dt * 2.4) s.gold.emitParticle(1, f.x - 8 + Math.random() * 16, y - 6 + Math.random() * 12);
      if (s.cinematic || s.transitioning || p.dead) continue;
      const b = p.body;
      if (Math.abs(p.x - f.x) < 16 && b.bottom > y - 8 && b.top < y + 12) this.take(f);
    }
  }

  private take(f: Find) {
    const s = this.s;
    this.list.splice(this.list.indexOf(f), 1);
    s.tweens.add({ targets: f.sprite, scale: f.sprite.scale * 1.8, alpha: 0, duration: 380, onComplete: () => f.sprite.destroy() });
    s.tweens.add({ targets: f.glow, scale: 5, alpha: 0, duration: 520, onComplete: () => f.glow.destroy() });
    s.grantFind(f.id, f.x, f.sprite.y);
  }

  // quem está perto do ponto (os testes e o mapa usam)
  get placed() {
    return this.list.map((f) => ({ id: f.id, x: f.x, y: f.y, ready: f.ready }));
  }

  // tamanho de um tile, para quem posiciona em tiles
  static at(tx: number, ty: number) {
    return { x: tx * TILE + TILE / 2, floor: (ty + 1) * TILE };
  }
}

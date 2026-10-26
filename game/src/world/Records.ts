import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import { DEPTH } from './Decor';
import { progress } from '../systems/Save';
import { RECORDS } from './lore';
import { hd } from '../gfx/flip';

// Os registros das salas que não são das Minas nem da Floresta (essas têm os seus, no Mine e no
// Forest): cada 'r' do mapa, da esquerda para a direita, é o registro <sala>:<n>, pintado em
// deco-record-<sala>-<n>
// (uma lápide, um livro numa estante, um édito pregado), em pé no chão, com um brilho fraco por cima
// enquanto ele ainda não leu.
interface Rec {
  id: string;
  x: number;
  y: number;
  glow: Phaser.GameObjects.Image;
}

export class Records {
  readonly list: Rec[] = [];

  constructor(private s: GameScene) {
    const room = s.room;
    if (room.theme === 'mine' || room.theme === 'snow') return;
    // da esquerda para a direita, que é a ordem em que ele passa por eles (não a ordem das linhas
    // do mapa, que põe o registro de um andar de cima na frente do que está na rua)
    const spots = s.level.spawns.filter((sp) => sp.kind === 'r').sort((a, b) => a.x - b.x);
    spots.forEach((sp, i) => this.add(`${room.id}:${i}`, sp.x, sp.y));
  }

  private add(id: string, x: number, y: number) {
    const s = this.s;
    const key = `deco-record-${id.replace(':', '-')}`;
    if (!RECORDS[id] || !s.textures.exists(key)) return;
    const img = hd(s.add.image(x, y + 1, key).setOrigin(0.5, 1).setDepth(DEPTH.prop + 0.5));
    const seen = progress.seen.has(`record:${id}`);
    const glow = s.add
      .image(x, y - img.displayHeight * 0.6, 'glow')
      .setScale(1.3)
      .setTint(0xffe2b0)
      .setAlpha(seen ? 0.18 : 0.45)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.front);
    this.list.push({ id, x, y, glow });
  }

  // o registro que um chefe deixa cair (o livro de bordo do Barqueiro), em pé no chão; drop: pula do
  // corpo e bate no chão. Enquanto a pintura dele não chega, um livro fechado de capa escura
  addNote(id: string, x: number, y: number, drop = false) {
    const s = this.s;
    if (!RECORDS[id] || this.list.some((r) => r.id === id)) return;
    const key = `deco-record-${id.replace(':', '-')}`;
    const img = hd(s.add.image(x, y + 1, s.textures.exists(key) ? key : this.fallback()).setOrigin(0.5, 1).setDepth(DEPTH.prop + 0.5));
    const seen = progress.seen.has(`record:${id}`);
    const glow = s.add
      .image(x, y - img.displayHeight * 0.6, 'glow')
      .setScale(1.3)
      .setTint(0xffe2b0)
      .setAlpha(seen ? 0.18 : 0.45)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.front);
    this.list.push({ id, x, y, glow });
    if (!drop) return;
    const y0 = img.y;
    img.setY(y0 - 34).setAngle(-30);
    glow.setAlpha(0);
    s.tweens.add({ targets: img, y: y0, angle: 0, duration: 620, ease: 'Bounce.easeOut' });
    s.tweens.add({ targets: glow, alpha: seen ? 0.18 : 0.45, duration: 500, delay: 500 });
    s.time.delayedCall(260, () => {
      s.dustBurst(x, y, 6);
      s.sfx('page', 0.7);
    });
  }

  private fallback() {
    const s = this.s;
    if (!s.textures.exists('deco-logbook')) {
      const g = s.add.graphics();
      g.fillStyle(0x1c120b).fillRect(0, 1, 15, 11);
      g.fillStyle(0x4a2e1a).fillRect(1, 2, 12, 9);
      g.fillStyle(0xe6dcc2).fillRect(13, 3, 2, 7);
      g.fillStyle(0x2a1a10).fillRect(6, 2, 2, 9);
      g.fillStyle(0x8a6a3a).fillRect(9, 5, 3, 2);
      g.generateTexture('deco-logbook', 16, 13);
      g.destroy();
    }
    return 'deco-logbook';
  }

  nearby(p: Player): { hint: string; act: () => void } | null {
    if (!p.onGround) return null;
    for (const r of this.list) {
      if (Math.abs(p.x - r.x) > 20 || Math.abs(p.body.bottom - r.y) > 12) continue;
      return {
        hint: '{up} ler',
        act: () => {
          this.s.readRecord(r.id);
          r.glow.setAlpha(0.18);
        },
      };
    }
    return null;
  }
}

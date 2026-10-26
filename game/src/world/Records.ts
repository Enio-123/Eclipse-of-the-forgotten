import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import { DEPTH } from './Decor';
import { progress } from '../systems/Save';
import { RECORDS } from './lore';
import { hd } from '../gfx/flip';

// Os registros das salas que não são das Minas nem da Floresta (essas têm os seus, no Mine e no
// Forest): cada 'r' do mapa, na ordem, é o registro <sala>:<n>, pintado em deco-record-<sala>-<n>
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
    let i = 0;
    for (const sp of s.level.spawns) {
      if (sp.kind !== 'r') continue;
      this.add(`${room.id}:${i++}`, sp.x, sp.y);
    }
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

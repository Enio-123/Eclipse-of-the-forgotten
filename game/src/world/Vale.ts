import Phaser from 'phaser';
import { TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { DEPTH } from './Decor';
import type { Span } from './Level';
import { rng } from '../gfx/raster';

// O Vale das Cachoeiras (capítulo 6, lore/vale.md): o vale da Lembrança do prólogo, agora no presente.
// Aqui fica o que é só do vale: as árvores de flor (cujos galhos são as plataformas '-' que saem do
// tronco, como os pinheiros da floresta) enquanto a pintura da sala não chega.
export class Vale {
  constructor(private s: GameScene) {
    if (!s.textures.exists(`arvores-${s.room.id}`)) this.drawTrees();
  }

  // cada árvore 'T': o tronco do pé até acima do galho mais alto, os galhos do mapa saindo dele (o pé de
  // cada galho é grosso e afina para a ponta) e a copa de flor rosa em volta das pontas e no alto
  private drawTrees() {
    const s = this.s;
    const L = s.level;
    const rand = rng(s.room.id.length * 977 + L.w);
    const trunks = L.spawns.filter((sp) => sp.kind === 'T');
    if (!trunks.length) return;
    const branches: Span[] = L.spans((x, y) => L.ch(x, y) === '-');
    const wood = s.add.graphics().setDepth(DEPTH.prop);
    const limbs = s.add.graphics().setDepth(DEPTH.tiles + 0.2);
    const bloomBack = s.add.graphics().setDepth(DEPTH.prop - 0.1);
    const bloomFront = s.add.graphics().setDepth(DEPTH.front + 0.2);
    const pinks = [0xf6b3cc, 0xf29bbb, 0xfbd0de, 0xe98aae, 0xffe3ec];
    const blossom = (g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number) => {
      for (let k = 0; k < 14; k++) {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * r;
        const rr = 3 + rand() * r * 0.35;
        g.fillStyle(pinks[Math.floor(rand() * pinks.length)], 0.9).fillCircle(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, rr);
      }
      g.fillStyle(0xffffff, 0.7).fillCircle(cx - r * 0.25, cy - r * 0.3, 2.5);
    };
    for (const t of trunks) {
      const own = branches.filter((b) => b.y < t.ty && (b.x1 + 1 === t.tx || b.x0 - 1 === t.tx));
      const top = own.length ? Math.min(...own.map((b) => b.y)) - 2 : t.ty - 5;
      const x = t.x;
      const base = t.y + 2;
      const yTop = top * TILE;
      // o tronco afina para cima, com a casca escura e a luz do lado do sol
      const w0 = 18;
      const w1 = 9;
      for (let y = yTop; y < base; y++) {
        const k = (y - yTop) / Math.max(1, base - yTop);
        const w = w1 + (w0 - w1) * k;
        wood.fillStyle(0x4a3226, 1).fillRect(x - w / 2, y, w, 1);
        wood.fillStyle(0x7a5640, 1).fillRect(x - w / 2, y, 2, 1);
        wood.fillStyle(0x2e1f18, 1).fillRect(x + w / 2 - 2, y, 2, 1);
      }
      // a raiz alarga no chão
      wood.fillStyle(0x4a3226, 1).fillTriangle(x - 16, base, x - 5, base - 12, x - 2, base).fillTriangle(x + 16, base, x + 5, base - 12, x + 2, base);
      // os galhos do mapa: saem do tronco e afinam até a ponta (a tábua de pisar fica embaixo do traço)
      for (const b of own) {
        const right = b.x0 - 1 === t.tx;
        const y = b.y * TILE;
        const xa = right ? x + 3 : x - 3;
        const xb = right ? (b.x1 + 1) * TILE + 4 : b.x0 * TILE - 4;
        const n = Math.abs(xb - xa);
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          const px = xa + (right ? i : -i);
          const th = 7 - 4 * k;
          limbs.fillStyle(0x4a3226, 1).fillRect(px, y - 1 - Math.sin(k * Math.PI) * 1.5, 1, th);
          limbs.fillStyle(0x7a5640, 1).fillRect(px, y - 1 - Math.sin(k * Math.PI) * 1.5, 1, 1);
        }
        // flor na ponta e no meio do galho (atrás e um pouco na frente)
        blossom(bloomBack, xb, y - 10, 22);
        blossom(bloomBack, (xa + xb) / 2, y - 12, 16);
        blossom(bloomFront, xb + (right ? 6 : -6), y - 4, 8);
      }
      // a copa no alto
      blossom(bloomBack, x, yTop - 4, 34);
      blossom(bloomBack, x - 18, yTop + 8, 22);
      blossom(bloomBack, x + 18, yTop + 6, 22);
      blossom(bloomFront, x + 10, yTop + 14, 9);
    }
  }

  update(_dt: number) {}
}

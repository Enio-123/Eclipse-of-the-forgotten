import Phaser from 'phaser';
import { TILE } from '../config';
import type { Level } from '../world/Level';
import type { ExtremeFeed } from './extreme';
import { face, hd } from './flip';

// Transformação de memória no cenário (High e EXTREME): uma onda sai de onde a memória voltou e
// passa pela sala. Por dentro dela, por alguns segundos, a sala volta à cor de antes do eclipse, com
// veios de ouro na pedra; a memória corrompida faz o contrário, drena a cor e acende veios roxos.
// Junto, figuras de luz (ecos) aparecem no chão e somem: quem estava ali naquela lembrança.

export type WaveMode = 'restore' | 'corrupt';
export type EchoKind = 'ela' | 'povo' | 'carrasco';

interface Wave {
  x: number;
  y: number;
  mode: WaveMode;
  power: number;
  maxR: number;
  grow: number;
  hold: number;
  fade: number;
  t: number;
}

export class MemoryWave {
  private w: Wave | null = null;

  constructor(private scene: Phaser.Scene, private level: Level) {}

  get active() {
    return this.w !== null;
  }

  start(x: number, y: number, mode: WaveMode, o: { power?: number; radius?: number; hold?: number } = {}) {
    this.w = { x, y, mode, power: o.power ?? 1, maxR: o.radius ?? 520, grow: 1.7, hold: o.hold ?? 2.4, fade: 1.6, t: 0 };
  }

  update(dt: number, feed: ExtremeFeed | null) {
    const w = this.w;
    if (!w) {
      if (feed) feed.mem[3] = 0;
      return;
    }
    w.t += dt;
    const g = Math.min(1, w.t / w.grow);
    const r = w.maxR * (1 - Math.pow(1 - g, 3));
    let k = w.power;
    const after = w.t - w.grow - w.hold;
    if (after > 0) k *= Math.max(0, 1 - after / w.fade);
    if (after > w.fade) {
      this.w = null;
      k = 0;
    }
    if (!feed) return;
    feed.mem[0] = w.x;
    feed.mem[1] = w.y;
    feed.mem[2] = r;
    feed.mem[3] = k;
    feed.memMode = w.mode === 'corrupt' ? 1 : 0;
  }

  // figuras de luz paradas no chão perto do ponto (somem sozinhas)
  echoes(x: number, y: number, kind: EchoKind, mode: WaveMode, from?: Phaser.GameObjects.Sprite) {
    const s = this.scene;
    const L = this.level;
    const tint = mode === 'corrupt' ? 0xb68cff : 0xffd68a;
    // o desenho por cima quase sem tinta: dá para reconhecer a roupa e o rosto de quem era
    const soft = mode === 'corrupt' ? 0xd2c0ff : 0xfff0d6;
    const spots = kind === 'carrasco' ? [-30, 30] : [-34, 40];
    spots.forEach((dx, i) => {
      const gx = x + dx;
      const tx = Math.floor(gx / TILE);
      const g = L.groundBelow(tx, Math.max(0, Math.floor(y / TILE)));
      if (g < 0) return;
      const gy = g * TILE;
      if (Math.abs(gy - y) > 120) return;
      let spr: Phaser.GameObjects.Sprite | null = null;
      if (kind === 'ela' && i === 0 && s.textures.exists('figure')) {
        const o = s.registry.get('figure-origin') as { x: number; y: number } | undefined;
        spr = hd(s.add.sprite(gx, gy, 'figure', 0)).setOrigin(o?.x ?? 0.5, o?.y ?? 1);
        if (s.anims.exists('figure-idle')) spr.play('figure-idle');
      } else if ((kind === 'carrasco' || kind === 'ela') && from) {
        // ele mesmo, no ponto em que a lembrança aconteceu
        spr = s.add.sprite(gx, gy, from.texture.key, from.frame.name).setOrigin(from.originX, from.originY).setScale(from.scaleX, from.scaleY);
      } else if (s.textures.exists('folk')) {
        const o = s.registry.get('folk-origin') as { x: number; y: number } | undefined;
        spr = hd(s.add.sprite(gx, gy, 'folk', 0)).setOrigin(o?.x ?? 0.5, o?.y ?? 1);
        const anim = i % 2 ? 'folk-idle-hat' : 'folk-idle-shawl';
        if (s.anims.exists(anim)) spr.play(anim);
      }
      if (!spr) return;
      // um de frente para o outro; a silhueta de luz é a cor cheia e por cima vai o desenho tingido,
      // para a figura ter rosto e roupa mas continuar sendo luz (não a pessoa de verdade)
      face(spr, dx > 0).setTintFill(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(-0.5).setAlpha(0);
      // a borda acesa em volta (só no WebGL; no Canvas fica a silhueta)
      spr.preFX?.addGlow(tint, 2, 0, true, 0.1, 6);
      const detail = s.add
        .sprite(spr.x, spr.y, spr.texture.key, spr.frame.name)
        .setOrigin(spr.originX, spr.originY)
        .setScale(spr.scaleX, spr.scaleY)
        .setFlipX(spr.flipX)
        .setTint(soft)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(-0.49)
        .setAlpha(0);
      if (spr.anims.currentAnim) detail.play(spr.anims.currentAnim.key);
      const both = [spr, detail];
      s.tweens.add({
        targets: spr,
        alpha: { from: 0, to: 0.5 },
        duration: 900,
        delay: 500 + i * 350,
        yoyo: true,
        hold: 2200,
        ease: 'Sine.easeInOut',
        onComplete: () => both.forEach((o) => o.destroy()),
      });
      s.tweens.add({
        targets: detail,
        alpha: { from: 0, to: 0.62 },
        duration: 900,
        delay: 500 + i * 350,
        yoyo: true,
        hold: 2200,
        ease: 'Sine.easeInOut',
      });
      // sobe devagar enquanto aparece, como poeira de luz
      s.tweens.add({ targets: both, y: '-=3', duration: 4000, delay: 500 + i * 350, ease: 'Sine.easeInOut' });
    });
  }
}

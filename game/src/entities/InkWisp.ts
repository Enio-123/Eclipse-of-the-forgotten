import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { overlap, type Enemy, type HitResult } from './Enemy';
import { ABYSS } from '../gfx/veil';
import { DEPTH } from '../world/Decor';

// Fiapo de tinta: o que sobe das rachaduras quando a lembrança fragmenta (segunda fase do Capataz).
// Uma gota de tinta com dois olhos lilases que flutua devagar atrás do cavaleiro. Some com um golpe
// e se desfaz sozinho depois de um tempo.
export class InkWisp implements Enemy {
  readonly kind = 'wisp' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  alive = true;
  private t = 0;
  private readonly ph = Math.random() * 10;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Image;

  constructor(private scene: GameScene, x: number, y: number) {
    this.zone = scene.add.zone(x, y - 20, 14, 14);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.body.checkCollision.none = true;
    // o desenho é feito à mão a cada quadro; o sprite fica só para a cinza do descanso
    this.sprite = scene.add.sprite(x, y, 'px').setVisible(false);
    this.g = scene.add.graphics().setDepth(DEPTH.enemy);
    this.glow = scene.add.image(x, y, 'glow').setTint(ABYSS.purple).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy - 0.1).setScale(0.7).setAlpha(0);
    scene.tweens.add({ targets: this.glow, alpha: 0.4, duration: 400 });
    scene.echoMotes(x, y - 20, true, 6);
  }

  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x - 1, b.y - 1, b.width + 2, b.height + 2);
  }

  update(dt: number) {
    if (!this.alive) return;
    this.t += dt;
    const p = this.scene.player;
    const dx = p.x - this.zone.x;
    const dy = p.body.center.y - 6 - this.zone.y;
    const d = Math.hypot(dx, dy) || 1;
    // devagar, ondulando, atrás do cavaleiro
    const sp = Math.min(62, 20 + this.t * 30);
    this.body.velocity.set((dx / d) * sp + Math.sin(this.t * 2.3 + this.ph) * 24, (dy / d) * sp + Math.cos(this.t * 3.1 + this.ph) * 18);
    if (Math.random() < dt * 8) this.scene.echoMotes(this.zone.x, this.zone.y + 4, true);
    this.draw();
    if (this.t > 12) this.pop(false);
  }

  private draw() {
    const g = this.g;
    const x = this.zone.x;
    const y = this.zone.y;
    const w = Math.sin(this.t * 6 + this.ph);
    g.clear();
    g.fillStyle(ABYSS.ink, 0.95);
    g.fillEllipse(x, y, 14 + w * 1.2, 15 - w * 1.2);
    // a cauda que escorre para baixo
    g.fillTriangle(x - 5, y + 3, x + 5, y + 3, x + Math.sin(this.t * 4) * 3, y + 12 + w * 2);
    g.lineStyle(1, ABYSS.purple, 0.85).strokeEllipse(x, y, 14 + w * 1.2, 15 - w * 1.2);
    g.fillStyle(ABYSS.lilac, 1);
    const f = this.scene.player.x >= x ? 1 : -1;
    g.fillRect(Math.round(x + f * 1 - 3), Math.round(y - 2), 2, 2);
    g.fillRect(Math.round(x + f * 1 + 2), Math.round(y - 2), 2, 2);
    this.glow.setPosition(x, y);
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    return this.alive && !sliding && this.t > 0.6 && overlap(pr, this.rect);
  }

  hit(): HitResult {
    if (!this.alive) return 'ignored';
    this.pop(true);
    return 'hit';
  }

  private pop(hit: boolean) {
    if (!this.alive) return;
    this.alive = false;
    this.body.enable = false;
    const s = this.scene;
    s.echoMotes(this.zone.x, this.zone.y, true, hit ? 12 : 6);
    s.echoMotes(this.zone.x, this.zone.y, false, hit ? 8 : 4);
    if (hit) s.sfx('veil', 0.4, 1.6);
    s.tweens.add({ targets: [this.glow], alpha: 0, duration: 300 });
    s.tweens.add({ targets: this.g, alpha: 0, duration: 260, onComplete: () => this.g.clear() });
  }

  vanish() {
    this.pop(false);
    return null;
  }

  destroy() {
    this.g.destroy();
    this.glow.destroy();
    this.sprite.destroy();
  }
}

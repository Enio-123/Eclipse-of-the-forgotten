import Phaser from 'phaser';
import { MOTES as C } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { isSolid } from '../world/Level';
import { overlap, type Enemy, type HitResult } from './Enemy';
import { DEPTH } from '../world/Decor';

type State = 'drift' | 'chase' | 'home';

interface Mote {
  img: Phaser.GameObjects.Image;
  // em volta do meio do enxame: o ângulo, a distância, a volta por segundo e a fase da respiração
  a: number;
  r: number;
  w: number;
  ph: number;
  k: number;
}

// os pontos escuros (com a borda roxa) e a sombra em volta do enxame, desenhados uma vez
function textures(scene: Phaser.Scene) {
  if (!scene.textures.exists('mote')) {
    const g = scene.add.graphics();
    g.fillStyle(0x8a5cd6, 0.55).fillCircle(6, 6, 5.5);
    g.fillStyle(0x0b0713, 1).fillCircle(6, 6, 4.2);
    g.fillStyle(0x1d1230, 1).fillCircle(5, 5, 1.4);
    g.generateTexture('mote', 12, 12);
    g.destroy();
  }
  if (!scene.textures.exists('umbra')) {
    const t = scene.textures.createCanvas('umbra', 64, 64)!;
    const ctx = t.getContext();
    const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(10, 6, 20, 0.62)');
    grd.addColorStop(0.45, 'rgba(12, 7, 24, 0.34)');
    grd.addColorStop(1, 'rgba(14, 8, 28, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 64, 64);
    t.refresh();
  }
}

// Vaga-lumes do Eclipse (Vale das Cachoeiras): onde a lembrança está sendo esquecida, a luz se junta em
// bolos escuros. Um enxame de pontos pretos de borda roxa que não brilham: apagam a luz em volta (no
// EXTREME é uma luz ao contrário; nos outros, a sombra desenhada). Flutuam em volta de onde nasceram; com
// o cavaleiro perto vão atrás dele, devagar, e voltam se ele for longe demais. Encostar no miolo machuca;
// um golpe espalha o enxame.
export class Motes implements Enemy {
  readonly kind = 'motes' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  alive = true;
  private state: State = 'drift';
  private t = 0;
  private humT = 0;
  private readonly home: { x: number; y: number };
  private readonly vel = new Phaser.Math.Vector2();
  private readonly motes: Mote[] = [];
  private readonly aura: Phaser.GameObjects.Image;
  private readonly seed = Math.random() * 10;

  constructor(private scene: GameScene, x: number, y: number) {
    textures(scene);
    this.home = { x, y: y - 12 };
    this.zone = scene.add.zone(x, this.home.y, C.core * 2, C.core * 2);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.aura = scene.add.image(x, this.home.y, 'umbra').setDepth(DEPTH.enemy - 0.2).setScale(1.5).setAlpha(0.85);
    for (let i = 0; i < C.n; i++) {
      const k = 0.36 + Math.random() * 0.22;
      const img = scene.add.image(x, this.home.y, 'mote').setDepth(DEPTH.enemy + Math.random() * 0.05).setScale(k);
      this.motes.push({ img, a: Math.random() * Math.PI * 2, r: 5 + Math.random() * 10, w: (Math.random() < 0.5 ? -1 : 1) * (1.4 + Math.random() * 1.6), ph: Math.random() * 6.3, k });
    }
  }

  get rect() {
    return new Phaser.Geom.Rectangle(this.zone.x - C.core, this.zone.y - C.core, C.core * 2, C.core * 2);
  }

  private sees(x: number, y: number) {
    const L = this.scene.level;
    const dx = x - this.zone.x;
    const dy = y - this.zone.y;
    const n = Math.ceil(Math.hypot(dx, dy) / 8);
    for (let i = 1; i < n; i++) if (isSolid(L.tileAt(this.zone.x + (dx * i) / n, this.zone.y + (dy * i) / n))) return false;
    return true;
  }

  update(dt: number) {
    if (!this.alive) return;
    const p = this.scene.player;
    const b = this.body;
    this.t += dt;
    const x = this.zone.x;
    const y = this.zone.y;
    const py = p.body.center.y;
    const d = Math.hypot(p.x - x, py - y);
    const away = Math.hypot(x - this.home.x, y - this.home.y);
    let tx = this.home.x + Math.sin(this.t * 0.4 + this.seed) * 26;
    let ty = this.home.y + Math.sin(this.t * 0.63 + this.seed * 2) * 10;
    let sp = C.drift;
    switch (this.state) {
      case 'drift':
        if (!p.dead && d < C.sight && this.sees(p.x, py)) {
          this.state = 'chase';
          this.scene.sfx('buzz', 0.55, 0.9 + Math.random() * 0.2);
          this.humT = 2;
        }
        break;
      case 'chase':
        tx = p.x;
        ty = py - 4;
        sp = C.speed;
        if ((this.humT -= dt) <= 0) {
          this.humT = 2.2 + Math.random();
          this.scene.sfx('buzz', 0.3, 0.85 + Math.random() * 0.3);
        }
        if (p.dead || away > C.leash || d > C.sight * 1.8) this.state = 'home';
        break;
      case 'home':
        tx = this.home.x;
        ty = this.home.y;
        sp = C.speed * 0.8;
        if (away < 12) this.state = 'drift';
        break;
    }
    // vão devagar, com embalo (o enxame não vira de uma vez)
    const hx = tx - x;
    const hy = ty - y;
    const hd = Math.hypot(hx, hy) || 1;
    const want = Math.min(sp, hd * 2);
    this.vel.x += ((hx / hd) * want - this.vel.x) * Math.min(1, dt * 1.6);
    this.vel.y += ((hy / hd) * want - this.vel.y) * Math.min(1, dt * 1.6);
    b.velocity.set(this.vel.x, this.vel.y);
    if (b.blocked.left || b.blocked.right) this.vel.x *= -0.3;
    if (b.blocked.up || b.blocked.down) this.vel.y *= -0.3;
    // cada ponto dá voltas em volta do meio; perto dele o enxame aperta
    const tight = this.state === 'chase' ? 0.75 : 1;
    for (const m of this.motes) {
      m.a += m.w * dt;
      const r = m.r * tight * (0.85 + 0.15 * Math.sin(this.t * 2.1 + m.ph));
      const jx = Math.sin(this.t * 7.3 + m.ph * 3) * 0.8;
      const jy = Math.cos(this.t * 6.1 + m.ph * 2) * 0.8;
      m.img.setPosition(this.zone.x + Math.cos(m.a) * r + jx, this.zone.y + Math.sin(m.a) * r * 0.7 + jy);
      m.img.setScale(m.k * (0.9 + 0.1 * Math.sin(this.t * 3 + m.ph)));
    }
    this.aura.setPosition(this.zone.x, this.zone.y).setScale(1.45 + 0.08 * Math.sin(this.t * 1.7));
  }

  harms(pr: Phaser.Geom.Rectangle) {
    return this.alive && overlap(pr, this.rect);
  }

  hit(fromX: number): HitResult {
    if (!this.alive) return 'ignored';
    this.die(fromX);
    return 'hit';
  }

  // descanso na vela: o enxame só some (não vira cinza: não tem corpo)
  vanish() {
    if (!this.alive) return null;
    this.alive = false;
    this.body.enable = false;
    for (const m of this.motes) m.img.setVisible(false);
    this.aura.setVisible(false);
    return null;
  }

  // um golpe espalha o enxame: cada ponto voa para longe do golpe e apaga
  private die(fromX: number) {
    this.alive = false;
    this.body.enable = false;
    const s = this.scene;
    const dir = Math.sign(this.zone.x - fromX) || 1;
    for (const m of this.motes) {
      const a = Math.atan2(m.img.y - this.zone.y, m.img.x - this.zone.x);
      const v = 30 + Math.random() * 40;
      s.tweens.add({
        targets: m.img,
        x: m.img.x + Math.cos(a) * v + dir * 22,
        y: m.img.y + Math.sin(a) * v - 8,
        alpha: 0,
        scale: m.k * 0.4,
        duration: 600 + Math.random() * 500,
        ease: 'Quad.easeOut',
        onComplete: () => m.img.destroy(),
      });
    }
    s.tweens.add({ targets: this.aura, alpha: 0, scale: 2.4, duration: 700, ease: 'Quad.easeOut', onComplete: () => this.aura.destroy() });
    s.sfx('buzz', 0.5, 1.6);
    s.sfx('erase', 0.35, 1.2);
  }

  destroy() {
    for (const m of this.motes) m.img.destroy();
    this.aura.destroy();
  }
}

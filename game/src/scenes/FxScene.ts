import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { audio } from '../systems/Audio';
import { RES, fixedCamera } from '../gfx/view';
import { gfx } from '../systems/Settings';

type V = Phaser.Math.Vector2;
const v = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

interface Crack {
  pts: V[];
  len: number;
  // fração do tempo em que a rachadura começa a aparecer
  t0: number;
}

// Rede de rachaduras saindo de um ponto: raios tortos, galhos e anéis
function crackNet(cx: number, cy: number) {
  const cracks: Crack[] = [];
  const n = 9 + Math.floor(Math.random() * 4);
  const angles: number[] = [];
  const measure = (pts: V[]) => pts.reduce((s, p, i) => (i ? s + p.distance(pts[i - 1]) : 0), 0);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
    angles.push(a0);
    let a = a0;
    let x = cx;
    let y = cy;
    const pts = [v(x, y)];
    const total = 300 + Math.random() * 420;
    for (let len = 0; len < total; ) {
      const step = 9 + Math.random() * 15;
      a += (Math.random() - 0.5) * 0.45;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      pts.push(v(x, y));
      len += step;
      if (Math.random() < 0.2) {
        const bp = [v(x, y)];
        let ba = a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6);
        let bx = x;
        let by = y;
        for (let k = 0; k < 3 + Math.random() * 3; k++) {
          ba += (Math.random() - 0.5) * 0.5;
          bx += Math.cos(ba) * (7 + Math.random() * 10);
          by += Math.sin(ba) * (7 + Math.random() * 10);
          bp.push(v(bx, by));
        }
        cracks.push({ pts: bp, len: measure(bp), t0: Math.min(0.85, len / total) });
      }
    }
    cracks.push({ pts, len: measure(pts), t0: Math.random() * 0.12 });
  }
  angles.sort((p, q) => p - q);
  // anéis que ligam os raios, como num vidro quebrado
  for (const r of [34 + Math.random() * 16, 96 + Math.random() * 30]) {
    for (let i = 0; i < angles.length; i++) {
      if (Math.random() < 0.3) continue;
      const a0 = angles[i];
      const a1 = angles[(i + 1) % angles.length] + (i + 1 === angles.length ? Math.PI * 2 : 0);
      const pts: V[] = [];
      for (let k = 0; k <= 4; k++) {
        const a = a0 + ((a1 - a0) * k) / 4;
        const rr = r * (0.9 + Math.random() * 0.2);
        pts.push(v(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
      }
      cracks.push({ pts, len: measure(pts), t0: 0.3 + Math.random() * 0.4 });
    }
  }
  return { cracks, angles };
}

function drawCracks(g: Phaser.GameObjects.Graphics, cracks: Crack[], k: number, glow: number, core: number) {
  g.clear();
  for (const pass of [0, 1]) {
    if (pass === 0) g.lineStyle(3, glow, 0.35);
    else g.lineStyle(1, core, 1);
    for (const c of cracks) {
      if (k <= c.t0) continue;
      const f = Math.min(1, (k - c.t0) / Math.max(0.05, 1 - c.t0));
      let left = c.len * f;
      g.beginPath();
      g.moveTo(c.pts[0].x, c.pts[0].y);
      for (let i = 1; i < c.pts.length && left > 0; i++) {
        const a = c.pts[i - 1];
        const b = c.pts[i];
        const d = a.distance(b);
        if (d <= left) g.lineTo(b.x, b.y);
        else g.lineTo(a.x + ((b.x - a.x) * left) / d, a.y + ((b.y - a.y) * left) / d);
        left -= d;
      }
      g.strokePath();
    }
  }
}

// Efeitos de tela inteira acima de tudo: o espelho que estilhaça, o branco das
// memórias e as rachaduras que se fecham com ouro.
export class FxScene extends Phaser.Scene {
  private white!: Phaser.GameObjects.Rectangle;
  private black!: Phaser.GameObjects.Rectangle;
  private cracks!: Phaser.GameObjects.Graphics;
  private pieces: Phaser.GameObjects.GameObject[] = [];
  private grain!: Phaser.GameObjects.TileSprite;
  private grainT = 0;
  private grainA = 0.09;
  private grainFine = false;

  constructor() {
    super('fx');
  }

  create() {
    fixedCamera(this);
    // grão de filme por cima de tudo, como no Limbo: muda de lugar a cada poucos quadros
    this.grain = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'grain').setOrigin(0).setAlpha(0.09).setDepth(5);
    this.white = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xfffaf0).setOrigin(0).setAlpha(0).setDepth(10);
    this.black = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000).setOrigin(0).setAlpha(0).setDepth(30);
    this.cracks = this.add.graphics().setDepth(20);
  }

  // o grão pesa nas cenas escuras; no vale claro ele quase some. No EXTREME ele é do tamanho do
  // pixel da tela e mais leve (a pintura em alta resolução não fica coberta de pontos grossos)
  setGrain(alpha: number) {
    this.grainA = alpha;
    this.grainFine = gfx().hd;
    this.grain?.setTileScale(this.grainFine ? 1 / RES : 1).setAlpha(this.grainFine ? alpha * 0.55 : alpha);
  }

  update(_time: number, delta: number) {
    if (gfx().hd !== this.grainFine) this.setGrain(this.grainA);
    this.grainT += delta;
    if (this.grainT < 70) return;
    this.grainT = 0;
    this.grain.tilePositionX = Math.floor(Math.random() * 128);
    this.grain.tilePositionY = Math.floor(Math.random() * 128);
  }

  // rachaduras crescem a partir do ponto e a imagem se parte em cacos
  shatter(cx: number, cy: number, onCovered: () => void) {
    const net = crackNet(cx, cy);
    audio.sfx('crack');
    this.time.delayedCall(380, () => audio.sfx('crack', { vol: 0.8 }));
    this.time.delayedCall(720, () => audio.sfx('crack', { vol: 1.1 }));
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 1000,
      ease: 'Cubic.easeIn',
      onUpdate: (tw) => drawCracks(this.cracks, net.cracks, tw.getValue() ?? 0, 0xbfd6ff, 0xffffff),
      onComplete: () => this.burst(net.angles, cx, cy, onCovered),
    });
  }

  private burst(angles: number[], cx: number, cy: number, onCovered: () => void) {
    this.game.renderer.snapshot((img) => {
      if (this.textures.exists('snap')) this.textures.remove('snap');
      this.textures.addImage('snap', img as HTMLImageElement);
      this.cracks.clear();
      this.white.setAlpha(1);
      audio.sfx('shard');
      const radii = [0, 44, 120, 260, 900];
      const P = (a: number, r: number) => v(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      for (let i = 0; i < angles.length; i++) {
        const a0 = angles[i];
        const a1 = angles[(i + 1) % angles.length] + (i + 1 === angles.length ? Math.PI * 2 : 0);
        for (let k = 0; k + 1 < radii.length; k++) {
          const poly = k === 0 ? [v(cx, cy), P(a0, radii[1]), P(a1, radii[1])] : [P(a0, radii[k]), P(a1, radii[k]), P(a1, radii[k + 1]), P(a0, radii[k + 1])];
          const c = poly.reduce((s, p) => s.add(p), v(0, 0)).scale(1 / poly.length);
          // a foto da tela tem RES pixels por pixel do mundo
          const piece = this.add.image(c.x, c.y, 'snap').setOrigin(c.x / VIEW_W, c.y / VIEW_H).setScale(1 / RES).setDepth(15);
          const g = this.make.graphics({ x: c.x, y: c.y }, false);
          g.fillStyle(0xffffff);
          g.fillPoints(poly.map((p) => v(p.x - c.x, p.y - c.y)), true);
          piece.setMask(g.createGeometryMask());
          const dir = v(c.x - cx, c.y - cy).normalize();
          const dist = 60 + Math.random() * 140 + k * 40;
          const spin = (Math.random() - 0.5) * 1.6;
          this.tweens.add({
            targets: piece,
            x: c.x + dir.x * dist,
            y: c.y + dir.y * dist + 160 + Math.random() * 120,
            rotation: spin,
            scale: 0.9 / RES,
            alpha: 0,
            delay: k * 40 + Math.random() * 60,
            duration: 1100 + Math.random() * 400,
            ease: 'Cubic.easeIn',
            onUpdate: () => {
              g.setPosition(piece.x, piece.y);
              g.setRotation(piece.rotation);
              g.setScale(piece.scaleX * RES, piece.scaleY * RES);
            },
            onComplete: () => {
              piece.destroy();
              g.destroy();
            },
          });
          this.pieces.push(piece);
        }
      }
      onCovered();
      this.time.delayedCall(900, () => this.fadeWhite(0, 1600));
    });
  }

  fadeWhite(to: number, ms: number, done?: () => void) {
    this.tweens.killTweensOf(this.white);
    this.tweens.add({ targets: this.white, alpha: to, duration: ms, ease: 'Sine.easeInOut', onComplete: () => done?.() });
  }

  fadeBlack(to: number, ms: number, done?: () => void) {
    this.tweens.killTweensOf(this.black);
    this.tweens.add({ targets: this.black, alpha: to, duration: ms, ease: 'Sine.easeInOut', onComplete: () => done?.() });
  }

  setWhite(a: number) {
    this.tweens.killTweensOf(this.white);
    this.white.setAlpha(a);
  }

  // a memória volta: rachaduras de ouro cobrem a tela e se apagam devagar
  heal(cx: number, cy: number) {
    const net = crackNet(cx, cy);
    drawCracks(this.cracks, net.cracks, 1, 0xd6a24a, 0xffe6a6);
    this.cracks.setAlpha(1);
    audio.sfx('shard');
    this.fadeWhite(0, 1500);
    this.tweens.add({
      targets: this.cracks,
      alpha: 0,
      delay: 700,
      duration: 1800,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.cracks.clear();
        this.cracks.setAlpha(1);
      },
    });
  }
}

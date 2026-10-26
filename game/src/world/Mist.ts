import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { screenOrigin } from '../gfx/view';
import { BG } from './Backdrop';

// Névoa do High e do EXTREME, em camadas de verdade: duas faixas atrás do cenário jogável (entre o
// fundo pintado e a pedra, para dar distância) e um véu bem leve na frente, só no pé da tela. Nunca
// cobre o cavaleiro, os inimigos ou os golpes com força: a da frente é quase transparente.
// A luz da sala acende a névoa sozinha (o filtro multiplica a luz em tudo o que está na tela).

const KEY = 'mist-hd';

// ruído que repete na horizontal, mais denso embaixo
function makeTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(KEY)) return;
  const W = 512;
  const H = 192;
  const tex = scene.textures.createCanvas(KEY, W, H);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(W, H);
  const rnd = (i: number, j: number, s: number) => {
    const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  // ruído de valor periódico em x (período em células)
  const noise = (x: number, y: number, cells: number, s: number) => {
    const fx = (x / W) * cells;
    const fy = (y / H) * cells * (H / W) * 2;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const a = rnd(i % cells, j, s);
    const b = rnd((i + 1) % cells, j, s);
    const c = rnd(i % cells, j + 1, s);
    const d = rnd((i + 1) % cells, j + 1, s);
    const uu = u * u * (3 - 2 * u);
    const vv = v * v * (3 - 2 * v);
    return a + (b - a) * uu + (c - a) * vv + (a - b - c + d) * uu * vv;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = noise(x, y, 4, 1) * 0.5 + noise(x, y, 8, 2) * 0.3 + noise(x, y, 16, 3) * 0.2;
      // bancos: some no topo e engrossa embaixo
      const fall = Math.pow(y / H, 1.4);
      const bank = Math.min(1, Math.max(0, (n - 0.32) / 0.5));
      const a = bank * fall * (0.55 + 0.45 * fall);
      const i = (y * W + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

interface Band {
  o: Phaser.GameObjects.TileSprite;
  par: number;
  drift: number;
  y: number;
  lift: number;
}

export class Mist {
  private bands: Band[] = [];
  private so: { x: number; y: number };

  constructor(private scene: Phaser.Scene, color: [number, number, number], strength: number, front: number) {
    makeTexture(scene);
    this.so = screenOrigin(scene.cameras.main);
    if (strength <= 0) return;
    const tint = Phaser.Display.Color.GetColor(color[0] * 255, color[1] * 255, color[2] * 255);
    // atrás da pedra: uma faixa longe (anda pouco) e outra mais perto
    this.band(BG.beams + 0.5, 0.18, 0.004, VIEW_H - 190, 190, 1.2, Math.min(0.9, strength), tint, 0.04);
    this.band(BG.beams + 0.6, 0.45, -0.007, VIEW_H - 150, 150, 0.9, Math.min(0.8, strength * 0.75), tint, 0.1);
    // na frente: um véu leve no pé da tela (só onde o ar é aberto)
    if (front > 0) this.band(22, 1.25, 0.012, VIEW_H - 90, 90, 1.6, Math.min(0.14, front), tint, 0.25);
  }

  private band(depth: number, par: number, drift: number, y: number, h: number, scale: number, alpha: number, tint: number, lift: number) {
    const o = this.scene.add
      .tileSprite(this.so.x, this.so.y + y, VIEW_W, h, KEY)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setTileScale(scale, (h / 192) * 1.0)
      .setTint(tint)
      .setAlpha(alpha);
    this.bands.push({ o, par, drift, y, lift });
  }

  update(time: number, roomH: number) {
    const cam = this.scene.cameras.main;
    const sx = cam.scrollX + this.so.x;
    const sy = cam.scrollY + this.so.y;
    // quanto a câmera está acima do fundo da sala: a névoa fica no chão e desce de vista quando ela sobe
    const above = Math.max(0, roomH - VIEW_H - sy);
    for (const b of this.bands) {
      b.o.tilePositionX = (sx * b.par + time * b.drift) / b.o.tileScaleX;
      b.o.y = this.so.y + b.y + Math.min(260, above * b.lift);
    }
  }

  destroy() {
    for (const b of this.bands) b.o.destroy();
    this.bands = [];
  }
}

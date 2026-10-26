import Phaser from 'phaser';
import type { FxScene } from './FxScene';
import { VIEW_H, VIEW_W } from '../config';
import { audio } from '../systems/Audio';
import { ui } from '../ui/ui';
import { fixedCamera } from '../gfx/view';
import type { GameInit } from './GameScene';

// Texto da abertura, uma frase por vez embaixo da cena
export const STORY = [
  'Em Vespera, as memórias pagam impostos.',
  'Quem paga demais esquece o próprio nome.',
  'O carrasco do rei pagou tudo.',
];

const DURATION = 15000;

interface Drift {
  img: Phaser.GameObjects.Image;
  s0: number;
  s1: number;
  dx: number;
}

// Abertura na floresta de neve: a figura de capa vermelha e os lobos, com neve caindo,
// névoa e a câmera se aproximando devagar enquanto a história passa embaixo.
export class IntroScene extends Phaser.Scene {
  private drift: Drift[] = [];
  private beams!: Phaser.GameObjects.Image;
  private mist!: Phaser.GameObjects.TileSprite;
  private start = 0;
  private leaving = false;

  constructor() {
    super('intro');
  }

  create() {
    fixedCamera(this);
    this.leaving = false;
    (this.scene.get('fx') as FxScene | null)?.setGrain(0.09);
    this.drift = [];
    this.start = this.time.now;
    const cam = this.cameras.main;
    cam.setRoundPixels(false);
    cam.setBackgroundColor(0x0b1424);
    // cada camada se aproxima num ritmo: o fundo quase parado, as silhuetas da frente mais rápidas
    const layers: [string, number, number, number, number][] = [
      ['intro-back', 0, 1.0, 1.04, -4],
      ['intro-near', 4, 1.02, 1.09, -12],
      ['intro-fore', 8, 1.05, 1.16, -22],
    ];
    for (const [key, depth, s0, s1, dx] of layers) {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
      const img = this.add.image(VIEW_W / 2, VIEW_H / 2, key).setDepth(depth).setScale(s0);
      this.drift.push({ img, s0, s1, dx });
    }
    this.textures.get('intro-beams').setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.beams = this.add.image(VIEW_W / 2, VIEW_H / 2, 'intro-beams').setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    this.mist = this.add.tileSprite(0, VIEW_H - 150, VIEW_W, 140, 'fog').setOrigin(0).setDepth(3).setAlpha(0.28).setTint(0xc8dae6);
    // neve: flocos pequenos atrás das árvores próximas e flocos maiores na frente
    this.add.particles(0, -8, 'px', {
      x: { min: -40, max: VIEW_W + 20 },
      lifespan: 12000,
      speedY: { min: 14, max: 30 },
      speedX: { min: -10, max: 6 },
      scale: { min: 0.5, max: 1 },
      alpha: { min: 0.45, max: 0.85 },
      tint: 0xe6eef6,
      frequency: 36,
      advance: 12000,
    }).setDepth(3.5);
    this.add.particles(0, -16, 'glow', {
      x: { min: -60, max: VIEW_W + 40 },
      lifespan: 7000,
      speedY: { min: 40, max: 70 },
      speedX: { min: -22, max: 2 },
      scale: { min: 0.05, max: 0.09 },
      alpha: { min: 0.5, max: 0.9 },
      tint: 0xf4f8fb,
      frequency: 140,
      advance: 7000,
    }).setDepth(9);
    this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(12).setAlpha(0.6);
    cam.fadeIn(1800, 0, 0, 0);
    audio.ambience('wind');
    ui.story(STORY, () => this.finish(), { scene: true });
  }

  private finish() {
    // a cena já saiu (os textos podem terminar depois)
    if (this.leaving || !this.scene.isActive()) return;
    this.leaving = true;
    const cam = this.cameras.main;
    cam.fadeOut(1300, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.start('game', { room: 'ponte', entry: 'P', from: 'new' } satisfies GameInit),
    );
  }

  update(time: number) {
    const t = Math.min(1, (time - this.start) / DURATION);
    const e = t * t * (3 - 2 * t);
    for (const d of this.drift) {
      d.img.setScale(d.s0 + (d.s1 - d.s0) * e);
      d.img.x = VIEW_W / 2 + d.dx * e;
    }
    this.beams.alpha = 0.75 + 0.25 * Math.sin(time * 0.0009);
    this.mist.tilePositionX = time * 0.01;
  }
}

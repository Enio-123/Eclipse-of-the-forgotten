import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import type { Level } from './Level';

type Layer = Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite;

// Profundidades do fundo (tudo atrás dos tiles)
export const BG = { sky: -20, bolt: -19, cloudsFar: -18, far: -17, cloudsNear: -16.5, mid: -16, fog: -15, beams: -14 } as const;
// silhuetas pretas na frente de tudo (menos névoa, vinheta e interface)
export const FG_DEPTH = 21;

// Camadas de fundo com parallax para cada tema. As camadas "rim" acendem nos relâmpagos.
export class Backdrop {
  readonly rims: Layer[] = [];
  readonly bg: number;
  private layers: { o: Layer; update: (sx: number, sy: number, t: number) => void }[] = [];

  constructor(private scene: Phaser.Scene, private level: Level) {
    const theme = level.theme;
    if (theme === 'bridge') this.bridge();
    else if (theme === 'catacomb') this.catacomb();
    else this.memory();
    this.bg = theme === 'bridge' ? 0x161a2b : theme === 'catacomb' ? 0x07080d : 0x5c9a3e;
  }

  private img(key: string, depth: number) {
    return this.scene.add.image(0, 0, key).setOrigin(0).setScrollFactor(0).setDepth(depth);
  }

  private tile(key: string, depth: number, h = VIEW_H, y = 0) {
    return this.scene.add.tileSprite(0, y, VIEW_W, h, key).setOrigin(0).setScrollFactor(0).setDepth(depth);
  }

  private get maxX() {
    return Math.max(1, this.level.widthPx - VIEW_W);
  }

  private bridge() {
    const baseY = 125;
    const sky = this.img('bridge-sky', BG.sky);
    const cf = this.tile('clouds-far', BG.cloudsFar, 200, 110);
    const far = this.img('bridge-far', BG.far);
    const farRim = this.img('bridge-far-rim', BG.far + 0.1).setAlpha(0);
    const cn = this.tile('clouds-near', BG.cloudsNear, 170, -30);
    const mid = this.tile('bridge-mid', BG.mid, 420);
    const midRim = this.tile('bridge-mid-rim', BG.mid + 0.1, 420).setAlpha(0);
    const fog = this.tile('fog', BG.fog, 140, 236).setAlpha(0.55);
    const fg = this.tile('bridge-fg', FG_DEPTH, 420);
    this.rims.push(farRim, midRim);
    this.layers.push(
      { o: cf, update: (sx, _sy, t) => void ((cf as Phaser.GameObjects.TileSprite).tilePositionX = sx * 0.04 + t * 0.003) },
      { o: cn, update: (sx, _sy, t) => void ((cn as Phaser.GameObjects.TileSprite).tilePositionX = sx * 0.08 + t * 0.006) },
      {
        o: far,
        update: (sx, sy) => {
          // o castelo distante anda pouco: começa à direita e termina no centro
          const x = Math.round(-310 - (sx / this.maxX) * 150);
          const y = Math.round(-10 - (sy - baseY) * 0.08);
          sky.setPosition(x, y);
          far.setPosition(x, y);
          farRim.setPosition(x, y);
        },
      },
      {
        o: mid,
        update: (sx, sy) => {
          mid.tilePositionX = midRim.tilePositionX = sx * 0.3;
          mid.y = midRim.y = Math.round(-30 - (sy - baseY) * 0.22);
        },
      },
      {
        o: fog,
        update: (sx, sy, t) => {
          fog.tilePositionX = sx * 0.5 + t * 0.008;
          fog.y = Math.round(236 - (sy - baseY) * 0.4);
        },
      },
      {
        // silhuetas da frente passam mais rápido que o cenário
        o: fg,
        update: (sx, sy) => {
          fg.tilePositionX = sx * 1.3;
          fg.y = Math.round(-30 - (sy - baseY) * 0.4);
        },
      },
    );
  }

  private catacomb() {
    const far = this.tile('cat-far', BG.far);
    const mid = this.tile('cat-mid', BG.mid);
    this.layers.push(
      { o: far, update: (sx) => void (far.tilePositionX = sx * 0.15) },
      { o: mid, update: (sx) => void (mid.tilePositionX = sx * 0.4) },
    );
    // fachos de luz que descem das frestas do teto
    const add = Phaser.BlendModes.ADD;
    for (const [x, a, rot] of [[90, 0.11, 0.08], [340, 0.08, -0.05], [560, 0.1, 0.12]] as const) {
      const beam = this.scene.add.image(x, -10, 'beam').setOrigin(0.5, 0).setScale(1.6, 1.8).setRotation(rot).setAlpha(a)
        .setTint(0xd9d2b8).setBlendMode(add).setScrollFactor(0.25, 0.1).setDepth(BG.beams);
      this.layers.push({ o: beam, update: (_sx, _sy, t) => void (beam.alpha = a * (0.75 + 0.25 * Math.sin(t * 0.0007 + x))) });
    }
  }

  private memory() {
    // altura de câmera típica no vale: as colinas aparecem logo acima do chão
    const baseY = 87;
    this.img('mem-sky', BG.sky);
    const far = this.tile('mem-far', BG.far);
    const mid = this.tile('mem-mid', BG.mid);
    this.layers.push(
      {
        o: far,
        update: (sx, sy) => {
          far.tilePositionX = sx * 0.1;
          far.y = Math.round(-26 - (sy - baseY) * 0.05);
        },
      },
      {
        o: mid,
        update: (sx, sy) => {
          mid.tilePositionX = sx * 0.3;
          mid.y = Math.round(-42 - (sy - baseY) * 0.15);
        },
      },
    );
  }

  update(time: number) {
    const cam = this.scene.cameras.main;
    for (const l of this.layers) l.update(cam.scrollX, cam.scrollY, time);
  }
}

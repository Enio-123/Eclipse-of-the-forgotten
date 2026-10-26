import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import type { Level } from './Level';
import { screenOrigin } from '../gfx/view';
import { hd, hdScale } from '../gfx/flip';
import { hdBackdrop, hdKey } from '../gfx/hdAssets';

type Layer = Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite;

// Profundidades do fundo (tudo atrás dos tiles)
export const BG = { sky: -20, bolt: -19, cloudsFar: -18, far: -17, cloudsNear: -16.5, mid: -16, fog: -15, beams: -14 } as const;
// silhuetas pretas na frente de tudo (menos névoa, vinheta e interface)
export const FG_DEPTH = 21;
// camadas de cada tema que têm pintura em 2x à parte (as outras já são em 2x no jogo)
export const HD_LAYERS: Record<string, string[]> = {
  bridge: ['bridge-sky', 'bridge-far', 'bridge-far-rim', 'clouds-far', 'clouds-near', 'bridge-mid', 'bridge-mid-rim', 'bridge-fg'],
  catacomb: ['cat-far', 'cat-mid'],
  memory: ['mem-sky', 'mem-far', 'mem-mid'],
};

// Camadas de fundo com parallax para cada tema. As camadas "rim" acendem nos relâmpagos.
export class Backdrop {
  readonly rims: Layer[] = [];
  readonly bg: number;
  private layers: { o: Layer; update: (sx: number, sy: number, t: number) => void }[] = [];
  // camadas pintadas e a imagem de cada uma (o EXTREME troca pela pintura em 2x)
  private parts: { o: Layer; key: string }[] = [];
  // EXTREME: primeiro plano fora de foco nas bordas da tela (só existe em 2x)
  private fgKey: string | null;
  private fg: Phaser.GameObjects.TileSprite | null = null;
  private fgA = 0.92;
  // canto da tela na câmera com zoom: as camadas presas à tela começam aqui
  private so: { x: number; y: number };

  constructor(private scene: Phaser.Scene, private level: Level, private room = '') {
    this.so = screenOrigin(scene.cameras.main);
    const theme = level.theme;
    const abyss = room === 'fosso' || room === 'abismo';
    this.fgKey = abyss ? 'xfg-abyss' : theme === 'bridge' ? null : `xfg-${theme}`;
    if (theme === 'bridge') this.bridge();
    else if (theme === 'catacomb') this.catacomb();
    else if (theme === 'city') this.city();
    else if (theme === 'nave') this.nave();
    else if (theme === 'prison') this.prison();
    else this.memory();
    this.bg = { bridge: 0x161a2b, catacomb: 0x07080d, city: 0x0b1020, nave: 0x07080d, memory: 0x5c9a3e, prison: 0x08070b }[theme];
  }

  private img(key: string, depth: number) {
    const o = this.scene.add.image(this.so.x, this.so.y, key).setOrigin(0).setScrollFactor(0).setDepth(depth);
    this.parts.push({ o, key });
    return o;
  }

  private tile(key: string, depth: number, h = VIEW_H, y = 0) {
    const o = this.scene.add.tileSprite(this.so.x, this.so.y + y, VIEW_W, h, key).setOrigin(0).setScrollFactor(0).setDepth(depth);
    this.parts.push({ o, key });
    return o;
  }

  // rolagem de uma camada que repete, em pixels do mundo (a pintura em 2x anda o dobro na imagem)
  private tx(t: Phaser.GameObjects.TileSprite, v: number) {
    t.tilePositionX = v / t.tileScaleX;
  }

  // imagens das camadas que têm pintura em 2x
  hdKeys() {
    const keys = this.parts.map((p) => p.key).filter((k) => hdBackdrop(k));
    if (this.fgKey && hdBackdrop(this.fgKey)) keys.push(this.fgKey);
    return [...new Set(keys)];
  }

  // o primeiro plano some quase todo quando o cavaleiro desce para o pé da tela (não esconde o chão)
  fgFade(low: boolean, dt: number) {
    if (!this.fg) return;
    const target = low ? 0.25 : 0.92;
    this.fgA += (target - this.fgA) * Math.min(1, dt * 5);
    this.fg.setAlpha(this.fgA);
  }

  // troca para a pintura em 2x as camadas que já chegaram (ou volta para a normal)
  useHd(on: boolean) {
    const fb = this.fgKey ? hdBackdrop(this.fgKey) : null;
    if (on && fb && !this.fg && this.scene.textures.exists(hdKey(fb.file))) {
      const fg = this.scene.add.tileSprite(this.so.x, this.so.y, VIEW_W, VIEW_H, hdKey(fb.file)).setOrigin(0).setScrollFactor(0).setDepth(FG_DEPTH - 0.2);
      fg.setTileScale(1 / fb.scale, 1 / fb.scale).setAlpha(this.fgA);
      this.fg = fg;
      this.layers.push({ o: fg, update: (sx) => this.tx(fg, sx * 1.25) });
    } else if (!on && this.fg) {
      const fg = this.fg;
      this.layers = this.layers.filter((l) => l.o !== fg);
      fg.destroy();
      this.fg = null;
    }
    for (const p of this.parts) {
      const b = hdBackdrop(p.key);
      if (!b) continue;
      const key = on && this.scene.textures.exists(hdKey(b.file)) ? hdKey(b.file) : p.key;
      if (p.o.texture.key === key) continue;
      const k = key === p.key ? 1 : 1 / b.scale;
      if (p.o instanceof Phaser.GameObjects.TileSprite) {
        const x = p.o.tilePositionX * p.o.tileScaleX;
        p.o.setTexture(key).setTileScale(k, k);
        p.o.tilePositionX = x / k;
      } else p.o.setTexture(key).setScale(k);
    }
  }

  // camada no traço liso que repete: a imagem tem mais pixels que o mundo (hd.json), então o
  // tileScale reduz e o tilePosition anda em pixels da imagem
  private hdTile(key: string, depth: number, h: number) {
    const k = hdScale(this.scene, key);
    return this.tile(key, depth, h).setTileScale(k, k);
  }

  private scrollHd(t: Phaser.GameObjects.TileSprite, shift: number) {
    t.tilePositionX = shift / t.tileScaleX;
  }

  // quanto a câmera está acima do ponto mais baixo da sala (as camadas descem quando ela sobe)
  private lift(sy: number) {
    return Math.max(0, this.level.heightPx - VIEW_H - sy);
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
      { o: cf, update: (sx, _sy, t) => this.tx(cf, sx * 0.04 + t * 0.003) },
      { o: cn, update: (sx, _sy, t) => this.tx(cn, sx * 0.08 + t * 0.006) },
      {
        o: far,
        update: (sx, sy) => {
          // o castelo distante anda pouco: começa à direita e termina no centro
          const x = this.so.x + Math.round(-310 - (sx / this.maxX) * 150);
          const y = this.so.y + Math.round(-10 - (sy - baseY) * 0.08);
          sky.setPosition(x, y);
          far.setPosition(x, y);
          farRim.setPosition(x, y);
        },
      },
      {
        o: mid,
        update: (sx, sy) => {
          this.tx(mid, sx * 0.3);
          this.tx(midRim, sx * 0.3);
          mid.y = midRim.y = this.so.y + Math.round(-30 - (sy - baseY) * 0.22);
        },
      },
      {
        o: fog,
        update: (sx, sy, t) => {
          this.tx(fog, sx * 0.5 + t * 0.008);
          fog.y = this.so.y + Math.round(236 - (sy - baseY) * 0.4);
        },
      },
      {
        // silhuetas da frente passam mais rápido que o cenário
        o: fg,
        update: (sx, sy) => {
          this.tx(fg, sx * 1.3);
          fg.y = this.so.y + Math.round(-30 - (sy - baseY) * 0.4);
        },
      },
    );
  }

  private catacomb() {
    const far = this.tile('cat-far', BG.far);
    const mid = this.tile('cat-mid', BG.mid);
    this.layers.push(
      { o: far, update: (sx) => this.tx(far, sx * 0.15) },
      { o: mid, update: (sx) => this.tx(mid, sx * 0.4) },
    );
    // fachos de luz que descem das frestas do teto
    const add = Phaser.BlendModes.ADD;
    for (const [x, a, rot] of [[90, 0.11, 0.08], [340, 0.08, -0.05], [560, 0.1, 0.12]] as const) {
      // fator de rolagem 0,25 x 0,1: com o zoom em volta do meio, a posição anda (1 - fator) do canto
      const beam = this.scene.add.image(x + this.so.x * 0.75, -10 + this.so.y * 0.9, 'beam').setOrigin(0.5, 0).setScale(1.6, 1.8).setRotation(rot).setAlpha(a)
        .setTint(0xd9d2b8).setBlendMode(add).setScrollFactor(0.25, 0.1).setDepth(BG.beams);
      this.layers.push({ o: beam, update: (_sx, _sy, t) => void (beam.alpha = a * (0.75 + 0.25 * Math.sin(t * 0.0007 + x))) });
    }
  }

  // Cidade-Catedral, de fora: céu do eclipse preso na tela, a cidade alta e a catedral ao longe,
  // casas mais perto e névoa na altura da rua (fundos no traço liso, terreno em pixel)
  private city() {
    hd(this.img('city-sky', BG.sky));
    const far = this.hdTile('city-far', BG.far, 400);
    // no claustro, a arcada do outro lado do jardim no lugar das casas
    const mid = this.hdTile(this.room === 'claustro' ? 'claustro-mid' : 'city-mid', BG.mid, 420);
    const fog = this.tile('fog', BG.fog, 140, 230).setAlpha(0.22);
    this.layers.push(
      {
        o: far,
        update: (sx, sy) => {
          this.scrollHd(far, sx * 0.1);
          far.y = this.so.y + VIEW_H - 400 + Math.round(this.lift(sy) * 0.05);
        },
      },
      {
        o: mid,
        update: (sx, sy) => {
          this.scrollHd(mid, sx * 0.3);
          mid.y = this.so.y + VIEW_H - 420 + Math.round(this.lift(sy) * 0.15);
        },
      },
      {
        o: fog,
        update: (sx, sy, t) => {
          fog.tilePositionX = sx * 0.45 + t * 0.006;
          fog.y = this.so.y + 230 + Math.round(this.lift(sy) * 0.3);
        },
      },
    );
  }

  // Catedral por dentro: a parede do fundo com arcadas e vitrais, pilares mais perto e fachos de
  // luz fria descendo dos vitrais altos
  private nave() {
    const far = this.hdTile('nave-far', BG.far, 400);
    const mid = this.hdTile('nave-mid', BG.mid, 420);
    this.layers.push(
      {
        o: far,
        update: (sx, sy) => {
          this.scrollHd(far, sx * 0.12);
          far.y = this.so.y + VIEW_H - 400 + Math.round(this.lift(sy) * 0.06);
        },
      },
      {
        o: mid,
        update: (sx, sy) => {
          this.scrollHd(mid, sx * 0.35);
          mid.y = this.so.y + VIEW_H - 420 + Math.round(this.lift(sy) * 0.18);
        },
      },
    );
    const add = Phaser.BlendModes.ADD;
    for (const [x, a, rot] of [[150, 0.07, 0.42], [420, 0.05, 0.36], [610, 0.065, 0.45]] as const) {
      const beam = this.scene.add.image(x + this.so.x * 0.7, -20 + this.so.y * 0.9, 'beam').setOrigin(0.5, 0).setScale(2.2, 2.4).setRotation(rot).setAlpha(a)
        .setTint(0xaebde8).setBlendMode(add).setScrollFactor(0.3, 0.1).setDepth(BG.beams);
      this.layers.push({ o: beam, update: (_sx, _sy, t) => void (beam.alpha = a * (0.7 + 0.3 * Math.sin(t * 0.0005 + x))) });
    }
  }

  // Prisão Subterrânea: a parede do fundo com celas e arcos de tijolo, pilares e correntes mais
  // perto e a luz das tochas respirando nas pedras
  private prison() {
    if ((this.room === 'fosso' || this.room === 'abismo') && this.scene.textures.exists('fosso-far')) {
      this.abyss();
      return;
    }
    if (!this.scene.textures.exists('prison-far')) {
      this.catacomb();
      return;
    }
    const far = this.hdTile('prison-far', BG.far, 400);
    const mid = this.hdTile('prison-mid', BG.mid, 420);
    this.layers.push(
      {
        o: far,
        update: (sx, sy) => {
          this.scrollHd(far, sx * 0.12);
          far.y = this.so.y + VIEW_H - 400 + Math.round(this.lift(sy) * 0.06);
        },
      },
      {
        o: mid,
        update: (sx, sy) => {
          this.scrollHd(mid, sx * 0.35);
          mid.y = this.so.y + VIEW_H - 420 + Math.round(this.lift(sy) * 0.18);
        },
      },
    );
    const add = Phaser.BlendModes.ADD;
    for (const [x, a, rot] of [[120, 0.05, 0.1], [470, 0.04, -0.08]] as const) {
      const beam = this.scene.add.image(x + this.so.x * 0.75, -10 + this.so.y * 0.9, 'beam').setOrigin(0.5, 0).setScale(1.4, 1.7).setRotation(rot).setAlpha(a)
        .setTint(0xc9b8a0).setBlendMode(add).setScrollFactor(0.25, 0.1).setDepth(BG.beams);
      this.layers.push({ o: beam, update: (_sx, _sy, t) => void (beam.alpha = a * (0.75 + 0.25 * Math.sin(t * 0.0006 + x))) });
    }
  }

  // Fosso dos Esquecidos: o outro lado do abismo (rocha roxa, fios de tinta, montes de máscaras) e,
  // mais perto, paredões que pingam e correntes com máscaras; as duas camadas repetem na vertical,
  // porque o fosso é um poço fundo, e andam devagar quando a câmera desce
  private abyss() {
    const far = this.hdTile('fosso-far', BG.far, VIEW_H);
    const mid = this.hdTile('fosso-mid', BG.mid, VIEW_H);
    this.layers.push(
      {
        o: far,
        update: (sx, sy) => {
          far.tilePositionX = (sx * 0.12) / far.tileScaleX;
          far.tilePositionY = (sy * 0.1) / far.tileScaleY;
        },
      },
      {
        o: mid,
        update: (sx, sy) => {
          mid.tilePositionX = (sx * 0.34) / mid.tileScaleX;
          mid.tilePositionY = (sy * 0.3) / mid.tileScaleY;
        },
      },
    );
    // a luz roxa que sobe do fundo
    const add = Phaser.BlendModes.ADD;
    const glow = this.scene.add.image(this.so.x + VIEW_W / 2, this.so.y + VIEW_H + 30, 'glow').setScale(14, 5).setTint(0x7029b8).setAlpha(0.1)
      .setBlendMode(add).setScrollFactor(0).setDepth(BG.fog);
    this.layers.push({ o: glow, update: (_sx, _sy, t) => void (glow.alpha = 0.08 + 0.03 * Math.sin(t * 0.0007)) });
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
          this.tx(far, sx * 0.1);
          far.y = this.so.y + Math.round(-26 - (sy - baseY) * 0.05);
        },
      },
      {
        o: mid,
        update: (sx, sy) => {
          this.tx(mid, sx * 0.3);
          mid.y = this.so.y + Math.round(-42 - (sy - baseY) * 0.15);
        },
      },
    );
  }

  update(time: number) {
    // as contas usam o canto de cima da vista (com zoom, o scrollX da câmera fica antes dele)
    const cam = this.scene.cameras.main;
    for (const l of this.layers) l.update(cam.scrollX + this.so.x, cam.scrollY + this.so.y, time);
  }
}

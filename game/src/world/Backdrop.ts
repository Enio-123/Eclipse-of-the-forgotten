import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import type { Level } from './Level';
import { RES, screenOrigin } from '../gfx/view';
import { hd, hdScale } from '../gfx/flip';
import { hdBackdrop, hdBackdrop3, hdKey } from '../gfx/hdAssets';
import { LivingEclipse, SKY_ECLIPSE, bigEclipse, type SkyEclipse } from '../gfx/eclipse';
import { ending } from './story';

type Layer = Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite;
// uma camada pintada: a imagem normal dela, a medida com essa imagem (k0) e, no ECLIPSE, as imagens em 3x
// que ficam no lugar de uma camada que repete (m)
interface Part {
  o: Layer;
  key: string;
  k0?: number;
  m?: Phaser.GameObjects.Image[];
  // quantas dessas imagens por linha e a pintura que elas mostram
  mc?: number;
  mk?: string;
}
// a pintura de uma camada que repete (a textura do TileSprite em si é a tela interna do Phaser)
const painted = (t: Phaser.GameObjects.TileSprite) => t as unknown as { displayFrame: Phaser.Textures.Frame; displayTexture: Phaser.Textures.Texture };

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

// as salas das Torres que ficam dentro de uma torre (sem céu; a das Experiências tem a ponte coberta do lado de
// fora, e o céu aparece só lá: a parede do fundo cobre o resto)
export const TORRES_INSIDE = new Set(['arquivo', 'engrenagens', 'trono', 'coroacao']);

// depois do final I o eclipse acabou: os céus que mostravam ele amanhecem (o mesmo céu pintado, com o sol no
// lugar do eclipse e sem as estrelas; art2/aurora.py). O do cais é a noite da lembrança e fica
const DAWN = new Set(['bridge-sky', 'city-sky', 'vale-sky', 'torres-sky']);
export const skyKey = (k: string) => (ending() === 'truth' && DAWN.has(k) ? `${k}-aurora` : k);
// a cor do fundo da câmera quando a sala amanhece (a do pé de cada céu da manhã)
const DAWN_BG: Record<string, number> = { bridge: 0xaab6c8, city: 0xa9b0c4, vale: 0xf3e4d4, torres: 0xf3e4d4 };

// as imagens de fundo que a sala usa (vêm quando ela abre: gfx/roomAssets.ts); as nuvens ficam sempre,
// a tela de título usa também
export function backdropKeys(theme: string, room: string): string[] {
  switch (theme) {
    case 'bridge':
      return [skyKey('bridge-sky'), 'bridge-far', 'bridge-far-rim', 'bridge-mid', 'bridge-mid-rim', 'bridge-fg'];
    case 'catacomb':
      return ['cat-far', 'cat-mid'];
    case 'city':
      return [skyKey('city-sky'), 'city-far', room === 'claustro' ? 'claustro-mid' : 'city-mid'];
    case 'nave':
      return ['nave-far', 'nave-mid'];
    case 'prison':
      return room === 'fosso' || room === 'abismo' ? ['fosso-far', 'fosso-mid'] : ['prison-far', 'prison-mid'];
    case 'mine':
      return ['mine-far', 'mine-mid'];
    case 'snow':
      if (room === 'serra') return ['snow-sky', 'serra-far', 'serra-mid'];
      // a Mata Fechada tem o pinhal dela, junto e escuro, no lugar das montanhas
      return room === 'mata' ? ['snow-sky', 'mata-far', 'mata-mid'] : ['snow-sky', 'snow-far', 'snow-mid'];
    case 'vale':
      // as Cachoeiras são uma garganta (o paredão molhado dos dois lados), a gruta é pedra por todo lado e
      // o cais é a noite de lua cheia da lembrança
      if (room === 'cachoeiras') return [skyKey('vale-sky'), 'cascata-far', 'cascata-mid'];
      if (room === 'gruta') return ['gruta-far', 'gruta-mid'];
      if (room === 'cais') return ['cais-sky', 'cais-far', 'cais-mid'];
      return [skyKey('vale-sky'), 'vale-far', 'vale-mid'];
    case 'torres':
      // ao ar livre, o céu do eclipse por cima do mar de nuvens e as outras torres da Casa; por dentro das
      // torres, só a pedra
      return TORRES_INSIDE.has(room) ? [] : [skyKey('torres-sky'), 'torres-far'];
    default:
      return ['mem-sky', 'mem-far', 'mem-mid'];
  }
}

// Camadas de fundo com parallax para cada tema. As camadas "rim" acendem nos relâmpagos.
export class Backdrop {
  readonly rims: Layer[] = [];
  readonly bg: number;
  private layers: { o: Layer; update: (sx: number, sy: number, t: number) => void }[] = [];
  // camadas pintadas e a imagem de cada uma (o EXTREME troca pela pintura em 2x)
  private parts: Part[] = [];
  // EXTREME: primeiro plano fora de foco nas bordas da tela (só existe em 2x)
  private fgKey: string | null;
  private fg: Phaser.GameObjects.TileSprite | null = null;
  private fgA = 0.92;
  // a sala amanheceu (final I): o céu dela é o da manhã
  private dawn = false;
  // o eclipse pintado no céu desta sala (null: sala sem céu, ou de manhã) e o centro dele na tela
  private skyE: SkyEclipse | null = null;
  private skyAt = { x: 0, y: 0 };
  // ECLIPSE: a luz viva por cima dele
  private live: LivingEclipse | null = null;
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
    else if (theme === 'mine') this.mine();
    else if (theme === 'snow') this.snow();
    else if (theme === 'vale') this.vale();
    else if (theme === 'torres') this.torres();
    else this.memory();
    const valeBg = room === 'gruta' ? 0x070b0d : room === 'cais' ? 0x0f1a36 : 0x8a7f9c;
    const torresBg = TORRES_INSIDE.has(room) ? 0x0b0908 : 0x6b4a32;
    const dawn = this.dawn ? DAWN_BG[theme] : undefined;
    this.bg = dawn ?? { bridge: 0x161a2b, catacomb: 0x07080d, city: 0x0b1020, nave: 0x07080d, memory: 0x5c9a3e, prison: 0x08070b, mine: 0x0a0807, snow: 0x9fb3c8, vale: valeBg, torres: torresBg }[theme];
  }

  // o céu da sala: o da manhã depois do final I (se ele veio), senão o de sempre
  private sky(key: string) {
    const k = skyKey(key);
    const tm = this.scene.textures;
    if (k !== key && tm.exists(k)) {
      this.dawn = true;
      return k;
    }
    return tm.exists(key) ? key : null;
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

  // imagens das camadas que têm pintura em 2x (ou, no ECLIPSE, em 3x)
  hdKeys(eclipse = false) {
    const keys = this.parts.map((p) => p.key).filter((k) => hdBackdrop(k) || (eclipse && hdBackdrop3(k)));
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

  // troca para a pintura em 2x as camadas que já chegaram (ou volta para a normal). ECLIPSE: as camadas
  // repintadas em 3x usam essa pintura
  useHd(on: boolean, eclipse = false) {
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
    const tm = this.scene.textures;
    for (const p of this.parts) {
      const b2 = hdBackdrop(p.key);
      const b3 = hdBackdrop3(p.key);
      const tile = p.o instanceof Phaser.GameObjects.TileSprite ? p.o : null;
      // a medida da camada com a pintura normal (antes de qualquer troca)
      p.k0 ??= tile ? tile.tileScaleX : p.o.scaleX;
      const use3 = on && eclipse && b3 && tm.exists(hdKey(b3.file)) ? b3 : null;
      const b = use3 ?? (on && b2 && tm.exists(hdKey(b2.file)) ? b2 : null);
      if (tile) {
        // ECLIPSE: a camada que repete sai direto da melhor pintura que ela tem (a de 3x, a de 2x do EXTREME
        // ou a de sempre, quando essa já tem mais pixels que o mundo)
        const exact = !(on && eclipse) ? null : b ? { key: hdKey(b.file), scale: b.scale } : p.k0 < 1 ? { key: p.key, scale: 1 / p.k0 } : null;
        if (this.mirror(p, tile, exact)) continue;
      }
      if (!b2 && !b3) continue;
      const key = b ? hdKey(b.file) : p.key;
      if ((tile ? painted(tile).displayTexture.key : p.o.texture.key) === key) continue;
      const k = b ? 1 / b.scale : p.k0;
      if (tile) {
        const x = tile.tilePositionX * tile.tileScaleX;
        const y = tile.tilePositionY * tile.tileScaleY;
        tile.setTexture(key).setTileScale(k, k);
        tile.tilePositionX = x / k;
        tile.tilePositionY = y / k;
      } else p.o.setTexture(key).setScale(k);
    }
  }

  // ECLIPSE: uma camada que repete mostrada direto da pintura dela (a de 3x; onde não tem, a de 2x). O
  // TileSprite do Phaser estica a imagem para uma potência de 2 e lê sem filtro, o que borra e serrilha a
  // pintura; aqui a camada some e, no lugar dela, ficam imagens inteiras lado a lado (na de 3x, cada pixel
  // da pintura num pixel da tela; na de 2x, lida com filtro, sem serrilhado): quantas forem precisas
  // para cobrir a camada em qualquer rolagem (duas quando a pintura é mais larga que a tela; nos poços,
  // onde ela tem 512 px e repete também na vertical, três colunas por duas linhas). A camada continua
  // recebendo a rolagem de sempre e as imagens copiam dela
  private mirror(p: Part, t: Phaser.GameObjects.TileSprite, ex: { key: string; scale: number } | null) {
    if (!ex) {
      if (p.m) {
        for (const i of p.m) i.destroy();
        p.m = undefined;
        p.mk = undefined;
        t.setVisible(true);
      }
      return false;
    }
    if (p.m) {
      // chegou uma pintura melhor (ou a de 3x saiu): as mesmas imagens passam a mostrar a de agora
      if (p.mk !== ex.key) {
        for (const i of p.m) i.setTexture(ex.key).setScale(1 / ex.scale);
        p.mk = ex.key;
      }
      return true;
    }
    const px = painted(t).displayFrame.width * t.tileScaleX;
    const py = painted(t).displayFrame.height * t.tileScaleY;
    // a pintura tem que caber na altura da camada, ou a camada cobrir a tela toda (o resto fica fora dela)
    const fits = py <= t.height + 0.5;
    if (!fits && t.height < VIEW_H) return false;
    const cols = Math.ceil(t.width / px) + 1;
    const rows = fits ? 1 : Math.ceil(t.height / py) + 1;
    p.m = [];
    p.mc = cols;
    p.mk = ex.key;
    for (let i = 0; i < cols * rows; i++) p.m.push(this.scene.add.image(0, 0, ex.key).setOrigin(0).setScrollFactor(0).setScale(1 / ex.scale).setDepth(t.depth));
    t.setVisible(false);
    this.sync(t, p.m, cols);
    return true;
  }

  private sync(t: Phaser.GameObjects.TileSprite, m: Phaser.GameObjects.Image[], cols: number) {
    const px = painted(t).displayFrame.width * t.tileScaleX;
    const py = painted(t).displayFrame.height * t.tileScaleY;
    let ox = (t.tilePositionX * t.tileScaleX) % px;
    if (ox < 0) ox += px;
    let oy = (t.tilePositionY * t.tileScaleY) % py;
    if (oy < 0) oy += py;
    // no pixel da tela: a pintura não é lida entre um pixel e outro
    const x0 = Math.round((t.x - ox) * RES) / RES;
    const y0 = Math.round((t.y - oy) * RES) / RES;
    for (let i = 0; i < m.length; i++) {
      const im = m[i];
      im.setPosition(x0 + (i % cols) * px, y0 + Math.floor(i / cols) * py).setAlpha(t.alpha);
      if (t.isTinted) im.setTint(t.tintTopLeft);
      else if (im.isTinted) im.clearTint();
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
    const sky = this.img(this.sky('bridge-sky') ?? 'bridge-sky', BG.sky);
    const dawn = this.dawn;
    // o novo Eclipse do final II, maior que o pintado (anda junto com o céu)
    const E = SKY_ECLIPSE.bridge;
    const ecl = ending() === 'absorb' ? bigEclipse(this.scene, 0, 0, E.r, BG.sky + 0.05).setScrollFactor(0) : null;
    if (!dawn) {
      this.skyE = E;
      this.skyAt = { x: this.so.x - 310 + E.x, y: this.so.y - 10 + E.y };
    }
    const cf = this.tile('clouds-far', BG.cloudsFar, 200, 110);
    const far = this.img('bridge-far', BG.far);
    const farRim = this.img('bridge-far-rim', BG.far + 0.1).setAlpha(0);
    const cn = this.tile('clouds-near', BG.cloudsNear, 170, -30);
    const mid = this.tile('bridge-mid', BG.mid, 420);
    const midRim = this.tile('bridge-mid-rim', BG.mid + 0.1, 420).setAlpha(0);
    const fog = this.tile('fog', BG.fog, 140, 236).setAlpha(0.55);
    const fg = this.tile('bridge-fg', FG_DEPTH, 420);
    if (dawn) {
      // a manhã: as nuvens e a névoa pegam a luz quente do sol (como na tela de título)
      cf.setTint(0xffe2c6).setAlpha(0.6);
      cn.setTint(0xf0d8c4).setAlpha(0.5);
      fog.setTint(0xffe6d2);
    }
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
          ecl?.setPosition(x + E.x, y + E.y);
          this.skyAt.x = x + E.x;
          this.skyAt.y = y + E.y;
          this.placeLive();
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

  // o eclipse de um céu preso na tela (e: o centro e o raio dele na pintura): fica guardado para a luz viva
  // do ECLIPSE e, depois do final II, ganha por cima o novo Eclipse, maior. De manhã não tem eclipse
  private newEclipse(e: SkyEclipse) {
    if (this.dawn) return;
    this.skyE = e;
    this.skyAt = { x: this.so.x + e.x, y: this.so.y + e.y };
    if (ending() !== 'absorb') return;
    bigEclipse(this.scene, this.skyAt.x, this.skyAt.y, e.r, BG.sky + 0.05).setScrollFactor(0);
  }

  // ECLIPSE: liga ou desliga a luz viva do eclipse (só existe nas salas em que o céu mostra ele)
  liveSky(on: boolean) {
    if (on && this.skyE && !this.live) {
      this.live = new LivingEclipse(this.scene, this.skyE, BG.sky + 0.06, ending() === 'absorb');
      this.placeLive();
    } else if (!on && this.live) {
      this.live.destroy();
      this.live = null;
    }
  }

  // o novo Eclipse é uma imagem solta, desenhada no pixel inteiro do mundo: com ele, a luz viva vai junto
  private placeLive() {
    if (!this.live) return;
    const snap = ending() === 'absorb';
    this.live.setPosition(snap ? Math.floor(this.skyAt.x) : this.skyAt.x, snap ? Math.floor(this.skyAt.y) : this.skyAt.y);
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
    const key = this.sky('city-sky');
    if (key) {
      hd(this.img(key, BG.sky));
      this.newEclipse(SKY_ECLIPSE.city);
    }
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

  // Minas Abandonadas: a parede do outro lado da caverna (rocha em camadas, torres de madeira e
  // passarelas com lampiões) e, mais perto, as escoras do poço com a polia e os cristais acesos. As
  // duas camadas repetem nas duas direções: o Veio é um poço fundo e as galerias são compridas
  private mine() {
    const far = this.hdTile('mine-far', BG.far, VIEW_H);
    const mid = this.hdTile('mine-mid', BG.mid, VIEW_H);
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
    // a poeira quente no ar, acesa de baixo pelo Âmbar
    const add = Phaser.BlendModes.ADD;
    const glow = this.scene.add.image(this.so.x + VIEW_W / 2, this.so.y + VIEW_H + 40, 'glow').setScale(15, 5).setTint(0xb8641c).setAlpha(0.09)
      .setBlendMode(add).setScrollFactor(0).setDepth(BG.fog);
    this.layers.push({ o: glow, update: (_sx, _sy, t) => void (glow.alpha = 0.075 + 0.025 * Math.sin(t * 0.0005)) });
  }

  // Floresta Nevada: o céu branco de neve preso na tela, os pinheiros distantes sumindo na névoa e os
  // mais perto, escuros e grossos; a névoa na altura do chão e os fachos de luz fria entre as copas,
  // como na abertura. Na serra, a fenda: paredes de rocha com gelo dos dois lados (repetem na vertical)
  private snow() {
    this.snowFallback();
    const shaft = this.room === 'serra';
    // a Mata Fechada: as mesmas camadas, mas pintadas juntas e escuras (a copa fecha por cima)
    const dense = this.room === 'mata';
    hd(this.img('snow-sky', BG.sky));
    const far = this.hdTile(shaft ? 'serra-far' : dense ? 'mata-far' : 'snow-far', BG.far, VIEW_H);
    const mid = this.hdTile(shaft ? 'serra-mid' : dense ? 'mata-mid' : 'snow-mid', BG.mid, VIEW_H);
    const fog = this.tile('fog', BG.fog, 140, 236).setAlpha(0.32).setTint(0xe4ecf6);
    // na fenda as duas camadas repetem na vertical e andam com a câmera; no resto elas ficam presas
    // embaixo, no chão da sala, e descem quando a câmera sobe (aparece o céu por cima das copas)
    this.layers.push(
      {
        o: far,
        update: (sx, sy) => {
          far.tilePositionX = (sx * 0.12) / far.tileScaleX;
          if (shaft) far.tilePositionY = (sy * 0.1) / far.tileScaleY;
          else far.y = this.so.y + Math.round(this.lift(sy) * 0.06);
        },
      },
      {
        o: mid,
        update: (sx, sy) => {
          mid.tilePositionX = (sx * 0.34) / mid.tileScaleX;
          if (shaft) mid.tilePositionY = (sy * 0.3) / mid.tileScaleY;
          else mid.y = this.so.y + Math.round(this.lift(sy) * 0.18);
        },
      },
      {
        o: fog,
        update: (sx, sy, t) => {
          fog.tilePositionX = sx * 0.5 + t * 0.006;
          fog.y = this.so.y + 236 + Math.round(this.lift(sy) * 0.4);
        },
      },
    );
    const add = Phaser.BlendModes.ADD;
    // na Mata os fachos são o que sobra do dia: poucos, duros, e bem mais fortes que no resto
    const beams: readonly (readonly [number, number, number])[] = dense
      ? [[90, 0.26, 0.2], [300, 0.19, 0.14], [470, 0.3, 0.24], [640, 0.17, 0.12]]
      : [[110, 0.1, 0.32], [330, 0.07, 0.28], [540, 0.09, 0.36]];
    for (const [x, a, rot] of beams) {
      const beam = this.scene.add.image(x + this.so.x * 0.7, -30 + this.so.y * 0.9, 'beam').setOrigin(0.5, 0).setScale(dense ? 1.5 : 2.4, 3.2).setRotation(rot).setAlpha(a)
        .setTint(0xeaf2ff).setBlendMode(add).setScrollFactor(0.3, 0.1).setDepth(BG.beams);
      this.layers.push({ o: beam, update: (_sx, _sy, t) => void (beam.alpha = a * (0.7 + 0.3 * Math.sin(t * 0.0004 + x))) });
    }
  }

  // Vale das Cachoeiras: o céu do eclipse preso na tela (a luz dourada da memória embaixo, as nuvens
  // luminosas), os platôs com as cachoeiras e o campo com as árvores de flor mais perto; as duas camadas
  // ficam presas no chão da sala e descem quando a câmera sobe. Nas Cachoeiras o paredão de colunas de
  // basalto molhado repete na vertical (a garganta); na gruta, a pedra escura atrás da água com as
  // colunas e a luz verde; no cais, a noite de lua cheia com o aqueduto recortado lá no fundo
  private vale() {
    const room = this.room;
    const has = (k: string) => this.scene.textures.exists(k);
    const cave = room === 'gruta';
    const shaft = room === 'cachoeiras' || cave;
    const night = room === 'cais';
    // a gruta não tem céu: só as duas camadas de pedra
    const keys = backdropKeys('vale', room);
    const [farKey, midKey] = keys.slice(-2);
    const skyImg = keys.length === 3 ? this.sky(keys[0].replace(/-aurora$/, '')) : null;
    if (skyImg) hd(this.img(skyImg, BG.sky));
    if (skyImg === 'vale-sky') this.newEclipse(SKY_ECLIPSE.vale);
    const far = has(farKey) ? this.hdTile(farKey, BG.far, VIEW_H) : null;
    const mid = has(midKey) ? this.hdTile(midKey, BG.mid, VIEW_H) : null;
    if (far) {
      this.layers.push({
        o: far,
        update: (sx, sy) => {
          far.tilePositionX = (sx * 0.12) / far.tileScaleX;
          if (shaft) far.tilePositionY = (sy * 0.1) / far.tileScaleY;
          else far.y = this.so.y + Math.round(this.lift(sy) * 0.06);
        },
      });
    }
    if (mid) {
      this.layers.push({
        o: mid,
        update: (sx, sy) => {
          mid.tilePositionX = (sx * 0.34) / mid.tileScaleX;
          if (shaft) mid.tilePositionY = (sy * 0.3) / mid.tileScaleY;
          else mid.y = this.so.y + Math.round(this.lift(sy) * 0.18);
        },
      });
    }
    const add = Phaser.BlendModes.ADD;
    if (cave) {
      // a luz verde que atravessa a cachoeira da boca da gruta, vinda da esquerda
      const glow = this.scene.add.image(this.so.x - 40, this.so.y + VIEW_H * 0.45, 'glow').setScale(9, 7).setTint(0x7fd3b8).setAlpha(0.1)
        .setBlendMode(add).setScrollFactor(0).setDepth(BG.fog);
      this.layers.push({ o: glow, update: (_sx, _sy, t) => void (glow.alpha = 0.08 + 0.03 * Math.sin(t * 0.0011) + 0.015 * Math.sin(t * 0.0037)) });
      return;
    }
    const fog = this.tile('fog', BG.fog, 140, 236).setAlpha(night ? 0.2 : 0.26).setTint(night ? 0x8fa4cc : this.dawn ? 0xfff4e6 : 0xffe6c4);
    this.layers.push({
      o: fog,
      update: (sx, sy, t) => {
        fog.tilePositionX = sx * 0.5 + t * 0.006;
        fog.y = this.so.y + 236 + Math.round(this.lift(sy) * 0.4);
      },
    });
    // a luz baixa entra de lado, em fachos dourados compridos (no cais, o luar fraco e frio; de manhã, o sol,
    // mais branco)
    const beams: readonly (readonly [number, number, number])[] = night
      ? [[140, 0.05, -0.32], [300, 0.035, -0.2]]
      : room === 'cachoeiras'
        ? [[120, 0.12, -0.5], [360, 0.09, -0.42], [560, 0.1, -0.56]]
        : [[60, 0.12, -0.62], [260, 0.08, -0.55], [470, 0.1, -0.68]];
    for (const [x, a, rot] of beams) {
      const beam = this.scene.add.image(x + this.so.x * 0.7, -40 + this.so.y * 0.9, 'beam').setOrigin(0.5, 0).setScale(night ? 2.0 : 2.6, 3.4).setRotation(rot).setAlpha(a)
        .setTint(night ? 0xc8d8ff : this.dawn ? 0xfff0d2 : 0xffd79a).setBlendMode(add).setScrollFactor(0.3, 0.1).setDepth(BG.beams);
      this.layers.push({ o: beam, update: (_sx, _sy, t) => void (beam.alpha = a * (0.7 + 0.3 * Math.sin(t * 0.0004 + x))) });
    }
  }
  // Torres Rúnicas, de fora: o céu do eclipse (o mesmo do vale, visto de mais alto: o mar de nuvens até o
  // horizonte) e, mais perto, as outras torres da Casa em penhascos saindo das nuvens (art2/fundos_torres.py);
  // o brilho dourado do mar de nuvens sobe de baixo. Por dentro das torres, só a escuridão da pedra (a parede
  // do fundo de cada sala cobre o resto)
  private torres() {
    const room = this.room;
    if (TORRES_INSIDE.has(room)) return;
    const skyImg = this.sky('torres-sky');
    if (skyImg) {
      hd(this.img(skyImg, BG.sky));
      this.newEclipse(SKY_ECLIPSE.vale);
    }
    if (this.scene.textures.exists('torres-far')) {
      // de manhã as torres de longe esfriam um pouco (a luz é a do sol, não a do mar de nuvens)
      const far = this.hdTile('torres-far', BG.far, VIEW_H);
      if (this.dawn) far.setTint(0xf2eef4);
      this.layers.push({
        o: far,
        update: (sx, sy) => {
          far.tilePositionX = (sx * 0.1) / far.tileScaleX;
          far.y = this.so.y + Math.round(this.lift(sy) * 0.05);
        },
      });
    }
    const add = Phaser.BlendModes.ADD;
    // o mar de nuvens devolve a luz (pouca: a pintura já traz o brilho dele): de manhã ela é a do sol, mais branca
    const glow = this.scene.add.image(this.so.x + VIEW_W / 2, this.so.y + VIEW_H + 40, 'glow').setScale(26, 6).setTint(this.dawn ? 0xfff0d6 : 0xffc46a).setAlpha(0.1)
      .setBlendMode(add).setScrollFactor(0).setDepth(BG.fog);
    this.layers.push({ o: glow, update: (_sx, sy, t) => {
      glow.alpha = 0.09 + 0.02 * Math.sin(t * 0.0008);
      glow.y = this.so.y + VIEW_H + 40 + Math.round(this.lift(sy) * 0.3);
    } });
    const fog = this.tile('fog', BG.fog, 160, 220).setAlpha(0.14).setTint(this.dawn ? 0xfff2e2 : 0xffd9a0);
    this.layers.push({
      o: fog,
      update: (sx, sy, t) => {
        fog.tilePositionX = sx * 0.5 + t * 0.004;
        fog.y = this.so.y + 220 + Math.round(this.lift(sy) * 0.4);
      },
    });
  }


  // enquanto a pintura dos fundos da floresta não chega: o céu em degradê e troncos lisos em duas
  // distâncias (os de longe claros, quase sumindo; os de perto mais escuros)
  private snowFallback() {
    const sc = this.scene;
    const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      if (sc.textures.exists(key)) return;
      const g = sc.add.graphics();
      draw(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };
    make('snow-sky', VIEW_W, VIEW_H, (g) => {
      for (let y = 0; y < VIEW_H; y += 4) {
        const k = y / VIEW_H;
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0x8fa6c0), Phaser.Display.Color.ValueToColor(0xdfe8f2), 100, k * 100);
        g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b)).fillRect(0, y, VIEW_W, 4);
      }
    });
    const trunks = (key: string, color: number, alpha: number, wMin: number, wMax: number, gap: number, seed: number) =>
      make(key, 640, VIEW_H, (g) => {
        let r = seed;
        const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
        for (let x = 10; x < 640; x += gap + rand() * gap) {
          const w = wMin + rand() * (wMax - wMin);
          g.fillStyle(color, alpha).fillRect(Math.round(x), 0, Math.round(w), VIEW_H);
          g.fillStyle(0xffffff, alpha * 0.25).fillRect(Math.round(x), 0, 1, VIEW_H);
        }
      });
    trunks('snow-far', 0x9fb1c6, 0.55, 6, 12, 34, 7);
    trunks('snow-mid', 0x51647e, 0.75, 12, 22, 70, 13);
    trunks('serra-far', 0x8a9db3, 0.5, 30, 60, 120, 5);
    trunks('serra-mid', 0x46566c, 0.7, 20, 40, 160, 11);
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
    this.live?.update(time);
    for (const p of this.parts) if (p.m) this.sync(p.o as Phaser.GameObjects.TileSprite, p.m, p.mc ?? 2);
  }
}

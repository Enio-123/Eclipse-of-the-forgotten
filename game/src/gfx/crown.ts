import Phaser from 'phaser';
import { findMask, sheetPixels } from './unmask';
import { hd, hdScale } from './flip';

// Final II: ele pôs a coroa. É a coroa pequena que o Carrasco Coroado estendia (art2/coroa_rei.py tira ela da
// folha dele, que só vem no terraço), presa na cabeça quadro a quadro: o lugar sai da máscara de cada quadro
// da folha (o alto dela, um pouco para trás, onde o capuz cerca a cabeça), então ela acompanha o corpo em
// todas as animações e em todas as armas.

export const CROWN = 'crown-rei';
// do tamanho da coroa do terraço para o tamanho da cabeça dele
export const CROWN_K = 0.72;
// o ouro que tomou o corpo dele no terraço (a cor em que o terraço termina e a que fica depois)
export const KING_TINT = 0xffdca0;
// a base da faixa na imagem (40 x 24), a mesma da coroa do Coroado
const BASE_X = 0.5;
const BASE_Y = 22 / 24;
// da beira de cima da máscara até a base da coroa, e para trás (as folhas olham para a direita), em pixels da folha
const DOWN = 3;
const BACK = 3;

type Anchors = Map<string, [number, number]>;
const cache = new Map<string, Anchors>();

// a base da coroa em cada quadro da folha, em pixels do quadro inteiro (antes do recorte). Os quadros sem a
// máscara à vista ficam de fora (a coroa fica no último lugar que teve)
export function crownAnchors(scene: Phaser.Scene, key: string): Anchors {
  let at = cache.get(key);
  if (at) return at;
  at = new Map();
  const tm = scene.textures;
  if (!tm.exists(key)) return at;
  cache.set(key, at);
  const tex = tm.get(key);
  const px = sheetPixels(tex);
  if (!px) return at;
  const { img } = px;
  for (const name of tex.getFrameNames()) {
    const f = tex.get(name);
    const w = f.cutWidth;
    const h = f.cutHeight;
    const hit = findMask(img.data, img.width, f.cutX, f.cutY, w, h);
    if (!hit) continue;
    let top = h;
    let l = w;
    let r = -1;
    for (let i = 0; i < w * h; i++) {
      if (!hit.comp[i]) continue;
      const y = (i / w) | 0;
      const x = i - y * w;
      if (y < top) top = y;
      if (x < l) l = x;
      if (x > r) r = x;
    }
    // (x e y do quadro: onde o recorte começa dentro do quadro inteiro)
    at.set(name, [f.x + (l + r) / 2 - BACK, f.y + top + DOWN]);
  }
  return at;
}

// a coroa na cabeça de um desenho do cavaleiro (o do jogo, o da tela de título). Ela anda depois que o quadro e
// o lugar do desenho já estão certos (no fim de cada passo da cena) e copia a virada, o giro, o achatado do
// pouso e a transparência dele
export class HeadCrown {
  readonly img: Phaser.GameObjects.Image;
  // escondida até chegar na cabeça (no terraço ela vem voando das mãos do carrasco)
  shown: boolean;
  private last: [number, number] | null = null;

  constructor(
    private scene: Phaser.Scene,
    private sprite: Phaser.GameObjects.Sprite,
    depth: number,
    shown = true,
  ) {
    this.shown = shown;
    this.img = hd(scene.add.image(0, 0, CROWN), CROWN_K).setOrigin(BASE_X, BASE_Y).setDepth(depth).setVisible(false);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.follow, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.follow();
  }

  // onde fica a base da coroa agora, no mundo (null: o desenho ainda não mostrou a máscara)
  where(): { x: number; y: number } | null {
    const s = this.sprite;
    const a = crownAnchors(this.scene, s.texture.key).get(String(s.frame.name)) ?? this.last;
    if (!a) return null;
    this.last = a;
    // o Phaser vira o desenho dentro do quadro inteiro (a origem das folhas do cavaleiro fica no meio)
    const lx = (s.flipX ? s.frame.realWidth - s.displayOriginX - a[0] : a[0] - s.displayOriginX) * s.scaleX;
    const ly = (a[1] - s.displayOriginY) * s.scaleY;
    const c = Math.cos(s.rotation);
    const sn = Math.sin(s.rotation);
    return { x: s.x + lx * c - ly * sn, y: s.y + lx * sn + ly * c };
  }

  private follow() {
    const s = this.sprite;
    const p = s.active && this.shown ? this.where() : null;
    if (!p) {
      this.img.setVisible(false);
      return;
    }
    // o achatado do pouso: a escala do desenho sobre a de sempre da folha
    const base = hdScale(this.scene, s.texture.key);
    const k = hdScale(this.scene, CROWN) * CROWN_K;
    this.img
      .setPosition(p.x, p.y)
      .setRotation(s.rotation)
      .setFlipX(s.flipX)
      .setScale((k * Math.abs(s.scaleX)) / base, (k * s.scaleY) / base)
      .setAlpha(s.alpha)
      .setVisible(s.visible);
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.follow, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.img.destroy();
  }
}

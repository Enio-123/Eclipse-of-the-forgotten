import Phaser from 'phaser';
import { hdKey, hdProp3, type Prop3 } from './hdAssets';

// ECLIPSE: os enfeites antigos da primeira área (pixel art em 1x: o portão e as estátuas da Ponte, os
// lampiões, a balaustrada, o andaime, o santuário das Catacumbas, o musgo, o capim) mostrados com a
// pintura em 3x. A troca é feita em cima do que a sala já montou: cada imagem passa a usar a pintura
// grande e encolhe na mesma medida, então a posição, o tamanho, o corte e o balanço continuam os de
// sempre. Saindo do ECLIPSE (ou se a pintura não chegar), volta tudo para a imagem de antes.

type Img = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
// onde fica guardado o nome da imagem de sempre de um objeto trocado
const WAS = 'p3';
const shown = (t: Phaser.GameObjects.TileSprite) => (t as unknown as { displayTexture: Phaser.Textures.Texture }).displayTexture.key;
const cropOf = (o: Img) => (o as unknown as { _crop: { x: number; y: number; width: number; height: number } })._crop;

// a imagem de sempre (1x) de um objeto, esteja ele trocado ou não
function small(o: Phaser.GameObjects.GameObject): string | null {
  const was = o.data?.get(WAS) as string | undefined;
  if (was) return was;
  if (o instanceof Phaser.GameObjects.TileSprite) return shown(o);
  if (o instanceof Phaser.GameObjects.Image || o instanceof Phaser.GameObjects.Sprite) return o.texture.key;
  return null;
}

// os arquivos dos enfeites que a sala montada usa (baixam junto com a pintura dela)
export function props3Files(scene: Phaser.Scene) {
  const files = new Set<string>();
  for (const o of scene.children.list) {
    const k = small(o);
    const p = k ? hdProp3(k) : null;
    if (p) files.add(p.file);
  }
  return [...files];
}

// as folhas (musgo, capim, velas) chegam como uma imagem só: marca nela os quadros, com os números de sempre
function frames(scene: Phaser.Scene, key: string, p: Prop3) {
  const tex = scene.textures.get(key);
  if (!p.frame || tex.has('0')) return;
  const [fw, fh] = p.frame;
  const src = tex.source[0];
  let n = 0;
  for (let y = 0; y + fh <= src.height; y += fh) for (let x = 0; x + fw <= src.width; x += fw) tex.add(n++, 0, x, y, fw, fh);
}

// a animação de uma folha (as velas) com os quadros da pintura grande
function bigAnim(scene: Phaser.Scene, base: string, big: string) {
  const key = `${base}@3`;
  const from = scene.anims.get(base) as Phaser.Animations.Animation | undefined;
  if (!from) return null;
  const cur = scene.anims.get(key) as Phaser.Animations.Animation | undefined;
  // a pintura saiu da placa e voltou: a animação antiga aponta para a textura que não existe mais
  if (cur && cur.frames[0]?.frame.texture === scene.textures.get(big)) return key;
  if (cur) scene.anims.remove(key);
  scene.anims.create({ key, frames: from.frames.map((f) => ({ key: big, frame: f.textureFrame })), frameRate: from.frameRate, repeat: from.repeat, yoyo: from.yoyo });
  return key;
}

// troca (ok = as pinturas que chegaram) ou destroca (ok = null) os enfeites da sala; devolve quantos ficaram em 3x
export function props3(scene: Phaser.Scene, ok: Set<string> | null) {
  let n = 0;
  for (const o of scene.children.list) {
    const k = small(o);
    const p = k ? hdProp3(k) : null;
    if (!k || !p) continue;
    const big = hdKey(p.file);
    const on = !!ok && ok.has(p.file) && scene.textures.exists(big);
    const is = !!o.data?.get(WAS);
    if (on) n++;
    if (on === is) continue;
    if (on) frames(scene, big, p);
    const kx = on ? 1 / p.sx : p.sx;
    const ky = on ? 1 / p.sy : p.sy;
    if (o instanceof Phaser.GameObjects.TileSprite) {
      o.setTexture(on ? big : k);
      o.setTileScale(o.tileScaleX * kx, o.tileScaleY * ky);
    } else {
      const img = o as Img;
      const c = img.isCropped ? { ...cropOf(img) } : null;
      const anim = img instanceof Phaser.GameObjects.Sprite ? img.anims.currentAnim : null;
      const to = anim ? (on ? bigAnim(scene, anim.key.replace(/@3$/, ''), big) : anim.key.replace(/@3$/, '')) : null;
      if (img instanceof Phaser.GameObjects.Sprite && anim && to) {
        const at = img.anims.currentFrame ? img.anims.currentFrame.index - 1 : 0;
        img.play({ key: to, startFrame: at });
      } else img.setTexture(on ? big : k, img.frame.name);
      img.setScale(img.scaleX * kx, img.scaleY * ky);
      if (c) img.setCrop(c.x / kx, c.y / ky, c.width / kx, c.height / ky);
    }
    if (on) o.setData(WAS, k);
    else o.data?.remove(WAS);
  }
  return n;
}

import type Phaser from 'phaser';

type Flippable = Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;

// Vira o desenho em volta da origem (os pés), lida da folha de cada personagem. O Phaser espelha
// em volta do meio do quadro: com a origem fora do meio, o desenho escorregaria para trás ao virar.
// Folhas no traço liso têm mais pixels que o mundo (scale no JSON da folha): o desenho é reduzido
// para o tamanho do mundo e a câmera com zoom mostra os pixels a mais. `k` multiplica (cortejo menor).
export function hd<T extends Flippable>(img: T, k = 1): T {
  const s = img.scene.registry.get(`${img.texture.key}-scale`) as number | undefined;
  img.setScale((s ?? 1) * k);
  return img;
}

// pixels do mundo por pixel da imagem (1 nas imagens em pixel art)
export function hdScale(scene: Phaser.Scene, key: string) {
  return (scene.registry.get(`${key}-scale`) as number | undefined) ?? 1;
}

export function face<T extends Flippable>(img: T, left: boolean): T {
  const o = img.scene.registry.get(`${img.texture.key}-origin`) as { x: number; y: number } | undefined;
  img.setFlipX(left);
  if (o) img.setOrigin(left ? 1 - o.x : o.x, o.y);
  return img;
}

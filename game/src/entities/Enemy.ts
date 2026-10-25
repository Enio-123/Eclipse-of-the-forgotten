import type Phaser from 'phaser';

// de onde veio o golpe do jogador (o guarda só bloqueia o que vem pela frente; a onda do badalo
// corre pelo chão e passa por baixo do escudo; o incenso contorna o escudo)
export type HitDir = 'side' | 'up' | 'down' | 'low' | 'arrow' | 'quake' | 'smoke';
export type HitResult = 'hit' | 'blocked' | 'ignored';
// quem é (decide as moedas e a vida que deixa ao morrer)
export type EnemyKind = 'crawler' | 'crow' | 'guard' | 'archer' | 'censer' | 'boss';

// O que a cena precisa saber de qualquer inimigo
export interface Enemy {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly kind: EnemyKind;
  readonly alive: boolean;
  // área que recebe golpes
  readonly rect: Phaser.Geom.Rectangle;
  update(dt: number): void;
  hit(fromX: number, dmg: number, dir: HitDir): HitResult;
  // encostar machuca? (o corpo e, nos que atacam, a área do golpe naquele instante)
  harms(pr: Phaser.Geom.Rectangle, sliding: boolean): boolean;
  // de onde veio o que acabou de machucar, se não foi o corpo (o empurrão vai para o outro lado)
  readonly harmFrom?: number;
  // o cavaleiro deslizando por baixo dele
  slideInto?(pr: Phaser.Geom.Rectangle, fromX: number): void;
  // aparar: o golpe do cavaleiro encontrou o ataque dele bem na hora (fica tonto e devolve true)
  parry?(box: Phaser.Geom.Rectangle, fromX: number): boolean;
  // descanso na vela: some do trecho já vencido (devolve o desenho para virar cinza)
  vanish?(): Phaser.GameObjects.Sprite | null;
  destroy?(): void;
}

// chefe: dorme até o cavaleiro entrar na arena e tem barra de vida
export interface BossFoe extends Enemy {
  readonly maxHp: number;
  readonly hp: number;
  readonly sleeping: boolean;
  readonly facing: 1 | -1;
  readonly sprite: Phaser.GameObjects.Sprite;
  onDefeat: (() => void) | null;
  wake(): void;
}

export const overlap = (a: Phaser.Geom.Rectangle, b: Phaser.Geom.Rectangle) =>
  a.right > b.x && a.x < b.right && a.bottom > b.y && a.y < b.bottom;

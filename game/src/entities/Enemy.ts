import type Phaser from 'phaser';

// de onde veio o golpe do jogador (o guarda só bloqueia o que vem pela frente; a onda do badalo
// corre pelo chão e passa por baixo do escudo)
export type HitDir = 'side' | 'up' | 'down' | 'low' | 'arrow' | 'quake';
export type HitResult = 'hit' | 'blocked' | 'ignored';
// quem é (decide as moedas e a vida que deixa ao morrer)
export type EnemyKind = 'crawler' | 'crow' | 'guard' | 'boss';

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
  // o cavaleiro deslizando por baixo dele
  slideInto?(pr: Phaser.Geom.Rectangle, fromX: number): void;
  // descanso na vela: some do trecho já vencido (devolve o desenho para virar cinza)
  vanish?(): Phaser.GameObjects.Sprite | null;
  destroy?(): void;
}

export const overlap = (a: Phaser.Geom.Rectangle, b: Phaser.Geom.Rectangle) =>
  a.right > b.x && a.x < b.right && a.bottom > b.y && a.y < b.bottom;

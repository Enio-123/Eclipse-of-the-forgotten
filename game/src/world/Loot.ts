import Phaser from 'phaser';
import { LOOT, TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { EnemyKind } from '../entities/Enemy';
import { progress } from '../systems/Save';
import { TILE_ONEWAY, TILE_SPIKE } from '../gfx/textures';
import { ui } from '../ui/ui';
import { isSolid } from './Level';
import { DEPTH } from './Decor';

// moeda (vale 1 ou 5) ou caco de porcelana (cura um fragmento de vida)
interface Drop {
  kind: 'coin' | 'life';
  value: number;
  sprite: Phaser.GameObjects.Sprite;
  glow: Phaser.GameObjects.Image;
  // x no centro, y na base do objeto
  x: number;
  y: number;
  vx: number;
  vy: number;
  half: number;
  h: number;
  age: number;
  resting: boolean;
  pulled: boolean;
  pullV: number;
  bounced: boolean;
  gone: boolean;
}

const GRAVITY = { coin: 980, life: 520 };
const MAX_FALL = { coin: 430, life: 150 };

const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

// O que os inimigos deixam ao morrer: moedas que pulam e quicam no chão e, a cada tantos
// inimigos, um caco de porcelana que devolve um fragmento de vida (só cai se o cavaleiro estiver ferido)
export class Loot {
  private drops: Drop[] = [];
  private readonly glints: Phaser.GameObjects.Particles.ParticleEmitter;
  private tinkT = 0;

  constructor(private scene: GameScene) {
    this.glints = scene.add.particles(0, 0, 'px', {
      lifespan: { min: 180, max: 420 },
      speed: { min: 20, max: 70 },
      scale: { start: 0.9, end: 0 },
      tint: [0xffffff, 0xffe6a6, 0xf0c468],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(DEPTH.slash);
  }

  get coinsOnFloor() {
    return this.drops.filter((d) => !d.gone && d.kind === 'coin').length;
  }

  get lifeOnFloor() {
    return this.drops.filter((d) => !d.gone && d.kind === 'life').length;
  }

  drop(kind: EnemyKind, x: number, y: number) {
    const t = LOOT[kind];
    const purse = progress.on('purse');
    let n = Phaser.Math.Between(t.coins[0], t.coins[1]);
    if (purse) n = Math.round(n * 1.5);
    // algumas moedas grandes quando é muito, sempre com umas pequenas junto
    const big = n >= 7 ? Math.floor((n - 2) / 5) : 0;
    const wide = kind === 'boss';
    for (let i = 0; i < big; i++) this.spawn('coin', 5, x, y, wide);
    for (let i = 0; i < n - big * 5; i++) this.spawn('coin', 1, x, y, wide);

    // vida: cada inimigo enche um pouco; a cada 1 completo cai um caco, se faltar vida para ele curar
    progress.lifeAcc += t.life * (purse ? 2 : 1);
    const p = this.scene.player;
    let missing = progress.maxHp - p.hp - this.lifeOnFloor;
    while (progress.lifeAcc >= 1) {
      if (missing <= 0) {
        // com a vida cheia guarda só um, que cai no próximo inimigo depois de se ferir
        progress.lifeAcc = Math.min(progress.lifeAcc, 1);
        break;
      }
      progress.lifeAcc -= 1;
      missing--;
      this.spawn('life', 1, x, y, wide);
    }
  }

  private spawn(kind: 'coin' | 'life', value: number, x: number, y: number, wide: boolean) {
    const s = this.scene;
    const L = s.level;
    // nunca nasce dentro da pedra (o inimigo pode morrer encostado na parede)
    for (let k = 0; k < 3 && isSolid(L.tileAt(x, y)); k++) y -= TILE;
    const key = kind === 'life' ? 'shard-drop' : value > 1 ? 'coin-big' : 'coin';
    const sprite = s.add.sprite(x, y, key, 0).setOrigin(0.5, 1).setDepth(DEPTH.enemy + 0.6);
    if (kind === 'coin') sprite.play({ key: `${key}-spin`, startFrame: Phaser.Math.Between(0, 3) });
    // um brilho quente embaixo de cada moeda (e claro no caco) para achar no escuro
    const glow = s.add
      .image(x, y, 'glow')
      .setScale(kind === 'life' ? 0.6 : value > 1 ? 0.42 : 0.32)
      .setTint(kind === 'life' ? 0xfff1d6 : 0xffc86a)
      .setAlpha(kind === 'life' ? 0.45 : 0.3)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.front);
    const h = sprite.height;
    const spread = kind === 'life' ? 45 : wide ? 190 : 105;
    const lift = kind === 'life' ? 230 : wide ? 230 + Math.random() * 260 : 150 + Math.random() * 170;
    this.drops.push({
      kind, value, sprite, glow, x, y: y + h / 2,
      vx: (Math.random() * 2 - 1) * spread, vy: -lift,
      half: Math.ceil(sprite.width / 2) - 1, h,
      age: 0, resting: false, pulled: false, pullV: 140, bounced: false, gone: false,
    });
  }

  update(dt: number) {
    const s = this.scene;
    const p = s.player;
    const L = s.level;
    this.tinkT -= dt;
    const cx = p.x;
    const cy = p.body.center.y;
    const pr = p.rect;
    pr.setTo(pr.x - 5, pr.y - 4, pr.width + 10, pr.height + 6);
    const hurt = p.hp < progress.maxHp;
    for (const d of this.drops) {
      if (d.gone) continue;
      d.age += dt;
      // o caco só vem para quem precisa de vida
      const wanted = d.kind === 'coin' || hurt;
      const ready = d.age > LOOT.pickupDelay && wanted && !p.dead;
      const my = d.y - d.h / 2;
      if (ready && !d.pulled && Math.hypot(cx - d.x, cy - my) < LOOT.magnet) d.pulled = true;
      if (d.pulled && !ready) {
        d.pulled = false;
        d.vx = 0;
        d.vy = 0;
      }
      if (d.pulled) {
        // ímã curto: voa até o cavaleiro, cada vez mais rápido (atravessa o que tiver no caminho)
        const dx = cx - d.x;
        const dy = cy - my;
        const dist = Math.hypot(dx, dy) || 1;
        d.pullV = Math.min(620, d.pullV + 1500 * dt);
        const step = Math.min(dist, d.pullV * dt);
        d.x += (dx / dist) * step;
        d.y += (dy / dist) * step;
        d.resting = false;
      } else this.move(d, dt);

      if (ready && d.x + d.half > pr.x && d.x - d.half < pr.right && d.y > pr.y && d.y - d.h < pr.bottom) {
        this.collect(d);
        continue;
      }
      if (d.y > L.heightPx + 48) {
        this.remove(d);
        continue;
      }
      // o caco se desfaz depois de um tempo, piscando antes
      if (d.kind === 'life') {
        const left = LOOT.lifeTime - d.age;
        if (left <= 0) {
          this.glints.explode(5, d.x, my);
          this.remove(d);
          continue;
        }
        const blink = left < 3 && Math.floor(d.age * (left < 1.2 ? 14 : 7)) % 2 === 0;
        const bob = d.resting ? Math.sin(d.age * 3.2) * 1.5 - 2 : 0;
        d.sprite.setAlpha(blink ? 0.25 : 1).setPosition(Math.round(d.x), Math.round(d.y + bob));
        d.glow.setPosition(d.x, my + bob).setAlpha((blink ? 0.12 : 0.38) + Math.sin(d.age * 4) * 0.08);
      } else {
        d.sprite.setPosition(Math.round(d.x), Math.round(d.y));
        d.glow.setPosition(d.x, my);
        // parada no chão: fica de frente e brilha de vez em quando
        if (d.resting && Math.random() < dt * 0.6) this.glints.explode(1, d.x + (Math.random() - 0.5) * d.half * 2, d.y - d.h * Math.random());
      }
    }
    this.drops = this.drops.filter((d) => !d.gone);
  }

  // queda com quique, parede e teto, em passos curtos para não atravessar tábuas finas
  private move(d: Drop, dt: number) {
    const L = this.scene.level;
    if (d.resting) {
      if (this.supported(d.x, d.y)) {
        d.vx = approach(d.vx, 0, 900 * dt);
        if (d.vx !== 0) this.stepX(d, d.vx * dt);
        if (d.vx === 0 && d.kind === 'coin' && d.sprite.anims.isPlaying) d.sprite.stop().setFrame(0);
        return;
      }
      // o chão sumiu (grade abrindo): volta a girar e cai
      d.resting = false;
      if (d.kind === 'coin') d.sprite.play(`${d.sprite.texture.key}-spin`);
    }
    d.vy = Math.min(MAX_FALL[d.kind], d.vy + GRAVITY[d.kind] * dt);
    // o caco cai balançando de um lado para o outro
    if (d.kind === 'life') d.vx = approach(d.vx, Math.sin(d.age * 7) * 30, 200 * dt);
    const steps = Math.max(1, Math.ceil(((Math.abs(d.vx) + Math.abs(d.vy)) * dt) / 4));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.stepX(d, d.vx * h);
      const ny = d.y + d.vy * h;
      if (d.vy < 0) {
        if (isSolid(L.tileAt(d.x, ny - d.h))) d.vy = 0;
        else d.y = ny;
        continue;
      }
      const top = this.floorBetween(d.x, d.y, ny);
      if (top === null) {
        d.y = ny;
        continue;
      }
      d.y = top;
      if (d.kind === 'coin' && d.vy > 120) {
        d.vy = -d.vy * 0.38;
        d.vx *= 0.7;
        if (!d.bounced) {
          d.bounced = true;
          this.tink(0.22, d.value > 1 ? 0.8 : 1.15);
        }
      } else {
        d.vy = 0;
        d.resting = true;
        if (d.kind === 'life') d.vx = 0;
        break;
      }
    }
  }

  private stepX(d: Drop, dx: number) {
    if (dx === 0) return;
    const L = this.scene.level;
    const nx = d.x + dx;
    const side = nx + Math.sign(dx) * d.half;
    if (isSolid(L.tileAt(side, d.y - 1)) || isSolid(L.tileAt(side, d.y - d.h + 1))) d.vx = -d.vx * 0.45;
    else d.x = nx;
  }

  // onde o objeto pousa ao descer de y0 para y1: pedra, tábua atravessável ou a ponta dos espinhos
  private floorBetween(x: number, y0: number, y1: number): number | null {
    const idx = this.scene.level.tileAt(x, y1);
    const row = Math.floor(y1 / TILE) * TILE;
    if (isSolid(idx)) return row;
    const top = idx === TILE_ONEWAY ? row : idx === TILE_SPIKE ? row + 6 : null;
    return top !== null && y0 <= top + 0.5 && y1 >= top ? top : null;
  }

  private supported(x: number, y: number) {
    const idx = this.scene.level.tileAt(x, y + 1);
    const row = Math.floor((y + 1) / TILE) * TILE;
    if (isSolid(idx) || idx === TILE_ONEWAY) return Math.abs(y - row) < 1.5;
    if (idx === TILE_SPIKE) return Math.abs(y - (row + 6)) < 1.5;
    return false;
  }

  private collect(d: Drop) {
    const s = this.scene;
    this.remove(d);
    const my = d.y - d.h / 2;
    if (d.kind === 'coin') {
      progress.coins += d.value;
      s.registry.set('coins', progress.coins);
      s.markDirty();
      this.glints.explode(d.value > 1 ? 7 : 3, d.x, my);
      this.tink(d.value > 1 ? 0.55 : 0.4, d.value > 1 ? 0.85 : 1 + Math.random() * 0.25);
      if (!progress.seen.has('coin:first')) {
        progress.seen.add('coin:first');
        ui.thought('Moedas do dízimo. Ainda há quem cobre por aqui.', 4200);
      }
      return;
    }
    const p = s.player;
    p.hp = Math.min(progress.maxHp, p.hp + 1);
    s.registry.set('hp', p.hp);
    s.sfx('mend');
    s.glowBurst(p.x, p.body.center.y, 0xfff1d6, 2);
    if (!progress.seen.has('life:first')) {
      progress.seen.add('life:first');
      s.markDirty();
      ui.thought('Um caco de porcelana. A máscara aceitou de volta.', 4200);
    }
  }

  private tink(vol: number, rate: number) {
    if (this.tinkT > 0) return;
    this.tinkT = 0.035;
    this.scene.sfx('tink', vol, rate);
  }

  private remove(d: Drop) {
    d.gone = true;
    d.sprite.destroy();
    d.glow.destroy();
  }
}

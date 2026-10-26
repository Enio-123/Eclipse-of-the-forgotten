import Phaser from 'phaser';
import { MAGES, MAGIC, TILE, type MageId } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Controls } from './Controls';
import { progress } from './Save';
import { overlap, type Enemy, type HitDir } from '../entities/Enemy';
import { DEPTH } from '../world/Decor';
import { isGround, isSolid } from '../world/Level';
import { BESTIARY } from '../world/lore';
import { face, hd, hdScale } from '../gfx/flip';
import { poleFrame } from '../entities/Barqueiro';
import { ensureSheet } from '../gfx/sheets';

// uma escolha da habilidade forte: a versão (Eclipse, Véu, Espaço) ou quem volta do Grimório
export interface Choice {
  id: string;
  name: string;
  cd: number;
  kind?: string;
  boss?: string;
}

// quem pode voltar do Grimório como eco: a folha, as animações de andar, preparar e bater, o alcance
// do golpe e o tamanho do corpo (os que voam não caem; o arqueiro atira de longe)
interface RevKind {
  sheet: string;
  move: string;
  idle: string;
  wind: string | null;
  strike: string | null;
  range: number;
  w: number;
  h: number;
  fly?: boolean;
  ranged?: boolean;
}

const REV: Record<string, RevKind> = {
  crawler: { sheet: 'penitent', move: 'crawl', idle: 'crawl', wind: null, strike: null, range: 6, w: 22, h: 14 },
  guard: { sheet: 'guard', move: 'walk', idle: 'idle', wind: 'windup', strike: 'strike', range: 30, w: 14, h: 30 },
  crow: { sheet: 'crow', move: 'fly', idle: 'fly', wind: 'windup', strike: 'dive', range: 8, w: 16, h: 12, fly: true },
  archer: { sheet: 'archer', move: 'idle', idle: 'idle', wind: 'draw', strike: 'shoot', range: 210, w: 14, h: 30, ranged: true },
  censer: { sheet: 'censer', move: 'walk', idle: 'idle', wind: 'windup', strike: 'swing', range: 34, w: 14, h: 30 },
  jailer: { sheet: 'jailer', move: 'walk', idle: 'idle', wind: 'lashwind', strike: 'lash', range: 60, w: 16, h: 32 },
  miner: { sheet: 'miner', move: 'walk', idle: 'idle', wind: 'windup', strike: 'strike', range: 30, w: 14, h: 30 },
  ambat: { sheet: 'ambat', move: 'fly', idle: 'fly', wind: 'windup', strike: 'dive', range: 8, w: 16, h: 12, fly: true },
  wolf: { sheet: 'wolf', move: 'run', idle: 'idle', wind: 'crouch', strike: 'pounce', range: 34, w: 26, h: 18 },
  owl: { sheet: 'owl', move: 'fly', idle: 'fly', wind: 'alert', strike: 'dive', range: 8, w: 16, h: 14, fly: true },
};

// os chefes vencidos que voltam por um instante: a folha, o golpe (preparo e batida) e o nome
// pole: a vara solta do Barqueiro, desenhada por cima da folha como na luta
const BOSS_ECHO: Record<string, { sheet: string; name: string; wind: string | null; strike: string; pole?: boolean }> = {
  sineiro: { sheet: 'sineiro', name: 'O Sineiro', wind: 'slamwind', strike: 'slam' },
  arcebispo: { sheet: 'arcebispo', name: 'O Arcebispo', wind: 'swingwind', strike: 'swing' },
  carcereira: { sheet: 'carcereira', name: 'A Carcereira', wind: 'lashwind', strike: 'lash' },
  sombra: { sheet: 'sombra', name: 'A Sombra do Carrasco', wind: 'cleavewind', strike: 'cleave' },
  reflexo: { sheet: 'knight-scythe', name: 'O Reflexo', wind: null, strike: 'attack' },
  capataz: { sheet: 'capataz', name: 'O Capataz de Âmbar', wind: 'slamwind', strike: 'slam' },
  cacador: { sheet: 'cacador', name: 'O Mestre da Caça', wind: 'thrustwind-lo', strike: 'thrust-lo' },
  barqueiro: { sheet: 'barqueiro', name: 'O Barqueiro', wind: 'slamwind', strike: 'slam', pole: true },
};

const NECRO = 0x7fe0c8;
const INK = 0x140c1e;
const SPACE = 0x8fb4ff;
const EMBER = 0xf28c22;

// a versão escolhida de cada mago fica lembrada entre as salas
const lastChoice: Partial<Record<MageId, string>> = {};

// chão de verdade (pedra ou tábua) com vão em cima, na coluna x, perto da altura dos pés
function floorNear(s: GameScene, x: number, feet: number) {
  const L = s.level;
  const row = Math.floor((feet - 2) / TILE);
  for (let ty = row - 3; ty <= row + 6; ty++) {
    if (ty < 1 || ty >= L.h) continue;
    if (isGround(L.tileAt(x, ty * TILE + 2)) && !isSolid(L.tileAt(x, ty * TILE - 6))) return ty * TILE;
  }
  return null;
}

// nada de pedra entre os dois pontos
function clear(s: GameScene, ax: number, ay: number, bx: number, by: number) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 5);
  for (let i = 1; i < n; i++) if (isSolid(s.level.tileAt(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n))) return false;
  return true;
}

// ---------- os ecos do Grimório ----------
class Revenant {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  private collider: Phaser.Physics.Arcade.Collider | null = null;
  private state: 'rise' | 'move' | 'wind' | 'strike' | 'fade' = 'rise';
  private t = 0;
  private age = 0;
  private atkCd = 0.3;
  private touchCd = 0;
  private anim = '';
  facing: 1 | -1;
  done = false;

  constructor(private m: Magic, private s: GameScene, readonly k: RevKind, x: number, floor: number, private life: number) {
    this.zone = s.add.zone(x, floor - k.h / 2 - (k.fly ? 18 : 0), k.w, k.h);
    s.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(400, 900);
    if (k.fly) this.body.setAllowGravity(false);
    else this.collider = s.physics.add.collider(this.zone, s.level.layer);
    const o = s.registry.get(`${k.sheet}-origin`) as { x: number; y: number };
    this.sprite = hd(s.add.sprite(x, floor, k.sheet, 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy - 0.3));
    this.sprite.setTint(0xd8fff4, 0xd8fff4, 0x2f8f7a, 0x2f8f7a).setAlpha(0);
    this.sprite.preFX?.addGlow(NECRO, 2, 0, false, 0.1, 8);
    this.glow = s.add.image(x, floor - 12, 'glow').setTint(NECRO).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy - 0.4).setAlpha(0).setScale(1.1, 1.4);
    const p = s.player;
    this.facing = p.x <= x ? 1 : -1;
    this.play(k.idle);
  }

  private play(name: string) {
    const key = `${this.k.sheet}-${name}`;
    if (this.anim === key || !this.s.anims.exists(key)) return;
    this.anim = key;
    this.sprite.play(key);
  }

  private go(st: Revenant['state'], anim?: string | null) {
    this.state = st;
    this.t = 0;
    if (anim) this.play(anim);
  }

  // o inimigo vivo mais perto, na mesma faixa de altura
  private target(): Enemy | null {
    let best: Enemy | null = null;
    let d = 260;
    for (const e of this.s.enemies) {
      if (!e.alive) continue;
      const dx = Math.abs(e.zone.x - this.zone.x);
      const dy = Math.abs(e.body.center.y - this.body.center.y);
      if (dy > (this.k.fly ? 140 : 70) || dx > d) continue;
      d = dx;
      best = e;
    }
    return best;
  }

  get frontBox() {
    const b = this.body;
    const r = Math.max(24, this.k.range);
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x : b.center.x - r, b.bottom - 34, r, 34);
  }

  fade() {
    if (this.state === 'fade') return;
    this.go('fade');
    this.body.setVelocity(0, 0);
  }

  update(dt: number) {
    const b = this.body;
    this.t += dt;
    this.age += dt;
    this.atkCd -= dt;
    this.touchCd -= dt;
    if (this.state !== 'fade' && this.age >= this.life) this.fade();
    const tgt = this.state === 'fade' ? null : this.target();
    if (this.state === 'rise') {
      const k = Math.min(1, this.t / 0.4);
      this.sprite.setAlpha(0.85 * k);
      this.glow.setAlpha(0.45 * k);
      if (Math.random() < dt * 30) this.m.motes(this.zone.x + (Math.random() - 0.5) * 14, b.bottom - Math.random() * 20, NECRO);
      if (k >= 1) this.go('move', this.k.move);
    } else if (this.state === 'move') {
      if (this.k.fly) this.flyTo(tgt, dt);
      else this.walkTo(tgt);
    } else if (this.state === 'wind') {
      b.velocity.x = 0;
      if (this.t >= (this.k.ranged ? 0.4 : 0.26)) {
        this.go('strike', this.k.strike);
        this.strike();
      }
    } else if (this.state === 'strike') {
      b.velocity.x = 0;
      if (this.t >= 0.3) {
        this.atkCd = MAGIC.revive.cd;
        this.go('move', this.k.move);
      }
    } else {
      const k = Math.max(0, 1 - this.t / 0.5);
      this.sprite.setAlpha(0.85 * k);
      this.glow.setAlpha(0.45 * k);
      if (Math.random() < dt * 40) this.m.motes(this.zone.x + (Math.random() - 0.5) * 16, b.bottom - Math.random() * 30, NECRO);
      if (k <= 0) this.destroy();
    }
    // os que encostam (o rastejante, os que voam) machucam de perto
    if (!this.k.strike || this.k.fly) {
      if (tgt && this.touchCd <= 0 && this.state === 'move' && overlap(this.hitRect, tgt.rect)) {
        this.touchCd = 0.65;
        this.m.strikeOne(tgt, this.zone.x, MAGIC.revive.dmg * progress.dmgFor('necro'), 'side', NECRO);
      }
    }
    if (this.done) return;
    this.sprite.setPosition(Math.round(this.zone.x), Math.round(b.bottom));
    face(this.sprite, this.facing < 0);
    this.glow.setPosition(this.zone.x, b.bottom - 12);
  }

  private get hitRect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x - 3, b.y - 3, b.width + 6, b.height + 6);
  }

  private walkTo(tgt: Enemy | null) {
    const b = this.body;
    const p = this.s.player;
    const speed = this.k.ranged ? 0 : MAGIC.revive.speed;
    if (!tgt) {
      // ninguém por perto: fica do lado do mago
      const dx = p.x - this.facing * 26 - this.zone.x;
      if (Math.abs(dx) > 20 && speed > 0) {
        b.velocity.x = Math.sign(dx) * speed * 0.8;
        this.facing = dx > 0 ? 1 : -1;
        this.play(this.k.move);
      } else {
        b.velocity.x = 0;
        this.play(this.k.idle);
      }
      return;
    }
    const dx = tgt.zone.x - this.zone.x;
    this.facing = dx >= 0 ? 1 : -1;
    const reach = this.k.range + tgt.rect.width / 2;
    if (Math.abs(dx) > reach * 0.9 && speed > 0) {
      b.velocity.x = Math.sign(dx) * speed;
      this.play(this.k.move);
    } else {
      b.velocity.x = 0;
      if (this.k.strike && this.atkCd <= 0 && Math.abs(dx) <= reach + 4) this.go('wind', this.k.wind);
      else this.play(this.k.idle);
    }
  }

  private flyTo(tgt: Enemy | null, dt: number) {
    const b = this.body;
    const p = this.s.player;
    const tx = tgt ? tgt.zone.x : p.x - this.facing * 22;
    const ty = tgt ? tgt.body.center.y : p.body.top - 18;
    const dx = tx - this.zone.x;
    const dy = ty - this.body.center.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = MAGIC.revive.speed * (tgt ? 1.5 : 1);
    const want = d > 6 ? sp : 0;
    b.velocity.x += ((dx / d) * want - b.velocity.x) * Math.min(1, dt * 6);
    b.velocity.y += ((dy / d) * want - b.velocity.y) * Math.min(1, dt * 6);
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
    this.play(tgt && d < 40 ? (this.k.strike ?? this.k.move) : this.k.move);
  }

  // o golpe dele (ou a flecha do arqueiro)
  private strike() {
    const s = this.s;
    const dmg = MAGIC.revive.dmg * progress.dmgFor('necro');
    if (this.k.ranged) {
      const b = this.body;
      s.allyArrow(b.center.x + this.facing * 8, b.top + 10, this.facing, dmg);
      return;
    }
    this.m.strikeArea(this.frontBox, this.zone.x, dmg, 'side', NECRO, { once: true });
    s.sfx('slash', 0.5, 0.8);
  }

  destroy() {
    if (this.done) return;
    this.done = true;
    this.collider?.destroy();
    this.sprite.destroy();
    this.glow.destroy();
    this.zone.destroy();
  }
}

// o chefe vencido que volta um instante pelo Grimório: aparece, faz o golpe dele e some
class BossEcho {
  private sprite: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  private pole: Phaser.GameObjects.Image | null = null;
  private t = 0;
  private struck = false;
  done = false;

  constructor(private m: Magic, private s: GameScene, private info: (typeof BOSS_ECHO)[string], private x: number, private floor: number, private facing: 1 | -1) {
    const o = s.registry.get(`${info.sheet}-origin`) as { x: number; y: number };
    this.sprite = hd(s.add.sprite(x, floor, info.sheet, 0).setOrigin(o.x, o.y).setDepth(DEPTH.enemy - 0.3));
    this.sprite.setTint(0xe6fff8, 0xe6fff8, 0x2a7f6c, 0x2a7f6c).setAlpha(0);
    this.sprite.preFX?.addGlow(NECRO, 3, 0, false, 0.1, 10);
    face(this.sprite, facing < 0);
    this.glow = s.add.image(x, floor - 30, 'glow').setTint(NECRO).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy - 0.4).setAlpha(0).setScale(2.4, 3);
    const idle = `${info.sheet}-idle`;
    if (s.anims.exists(idle)) this.sprite.play(idle);
    if (info.pole && s.textures.exists('barqueiro-pole')) {
      this.pole = s.add.image(x, floor, 'barqueiro-pole').setOrigin(2 / 178, 0.5).setAlpha(0).setTint(0xe6fff8, 0xe6fff8, 0x2a7f6c, 0x2a7f6c);
      this.pole.preFX?.addGlow(NECRO, 2, 0, false, 0.1, 8);
    }
  }

  // a vara do Barqueiro no ângulo do quadro de agora
  private syncPole(alpha: number) {
    const v = this.pole;
    if (!v) return;
    const key = this.sprite.anims.currentAnim?.key.replace(`${this.info.sheet}-`, '') ?? 'idle';
    const fr = poleFrame(this.s, key, (this.sprite.anims.currentFrame?.index ?? 1) - 1, this.x, this.floor, this.facing);
    if (!fr) {
      v.setVisible(false);
      return;
    }
    const k = hdScale(this.s, 'barqueiro-pole');
    v.setVisible(true).setPosition(fr.x, fr.y).setRotation(fr.rot).setScale(fr.pf * k, k).setFlipY(this.facing < 0)
      .setDepth(DEPTH.enemy - 0.3 + (fr.behind ? -0.02 : 0.02)).setAlpha(alpha);
  }

  update(dt: number) {
    const s = this.s;
    this.t += dt;
    const life = MAGIC.revive.bossLife;
    const t = this.t;
    const a = t < 0.35 ? t / 0.35 : t > life - 0.5 ? Math.max(0, (life - t) / 0.5) : 1;
    this.sprite.setAlpha(0.9 * a);
    this.glow.setAlpha(0.5 * a);
    this.syncPole(0.9 * a);
    if (Math.random() < dt * 40) this.m.motes(this.x + (Math.random() - 0.5) * 50, this.floor - Math.random() * 70, NECRO);
    const wind = this.info.wind ? `${this.info.sheet}-${this.info.wind}` : null;
    const strike = `${this.info.sheet}-${this.info.strike}`;
    if (t >= 0.35 && this.sprite.anims.currentAnim?.key !== wind && !this.struck && wind && s.anims.exists(wind)) this.sprite.play(wind);
    if (!this.struck && t >= 0.75) {
      this.struck = true;
      if (s.anims.exists(strike)) this.sprite.play(strike);
      const W = MAGIC.revive.bossW;
      const H = MAGIC.revive.bossH;
      const box = new Phaser.Geom.Rectangle(this.facing > 0 ? this.x - 10 : this.x + 10 - W, this.floor - H, W, H);
      // golpe de chefe: escudo de guarda nenhum segura
      this.m.strikeArea(box, this.x, MAGIC.revive.bossDmg * progress.dmgFor('necro'), 'quake', NECRO, { heavy: true });
      s.sfx('heavy', 0.9, 0.8);
      s.cameras.main.shake(140, 0.006);
    }
    if (t >= life) {
      this.done = true;
      this.sprite.destroy();
      this.glow.destroy();
      this.pole?.destroy();
    }
  }
}

// ---------- efeitos das magias ----------
interface Fx {
  t: number;
  update(dt: number): boolean;
  destroy(): void;
}

// uma parede de espaço dobrado: segura golpes e tiros (protege) ou anda e joga longe (empurra)
interface Wall {
  x: number;
  floor: number;
  t: number;
  life: number;
  push: boolean;
  dir: number;
  hit: Set<Enemy>;
  g: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Image;
}

// inimigo jogado para o alto pela Torre: o dano vem quando ele cai
interface Launch {
  e: Enemy;
  t: number;
  up: boolean;
  dmg: number;
}

// empurrão (pulso, leque, parede): o corpo anda de lado sem entrar na pedra
interface Shove {
  e: Enemy;
  dir: number;
  speed: number;
  t: number;
}

// Magia do mago: a mira da habilidade forte, as versões, a recarga, as magias e os ecos do Grimório.
// A cena chama update depois do jogador; o golpe básico de cada cajado fica no Player e na cena
export class Magic {
  readonly mage: MageId;
  private aim: { x: number; floor: number | null; ok: boolean; i: number; mouse: boolean; px: number; t: number } | null = null;
  private markG: Phaser.GameObjects.Graphics;
  private markA: Phaser.GameObjects.Graphics;
  private cd = 0;
  private cdMax = 1;
  private fx: Fx[] = [];
  private revs: Revenant[] = [];
  private bosses: BossEcho[] = [];
  private walls: Wall[] = [];
  private launches: Launch[] = [];
  private shoves: Shove[] = [];
  private embers: Phaser.GameObjects.Particles.ParticleEmitter;
  private dots: Phaser.GameObjects.Particles.ParticleEmitter;
  private ink: Phaser.GameObjects.Particles.ParticleEmitter;
  private rubble: Phaser.GameObjects.Particles.ParticleEmitter;
  private lastHud = '';

  constructor(private s: GameScene, mage: MageId) {
    this.mage = mage;
    this.markG = s.add.graphics().setDepth(DEPTH.slash + 0.5);
    this.markA = s.add.graphics().setDepth(DEPTH.slash + 0.6).setBlendMode(Phaser.BlendModes.ADD);
    this.embers = s.add.particles(0, 0, 'px', {
      lifespan: { min: 300, max: 900 },
      speedX: { min: -30, max: 30 },
      speedY: { min: -150, max: -40 },
      scale: { start: 1.3, end: 0 },
      tint: [0xffe6a6, EMBER, 0xff5a1e],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(DEPTH.slash);
    this.dots = s.add.particles(0, 0, 'px', {
      lifespan: { min: 400, max: 900 },
      speedX: { min: -14, max: 14 },
      speedY: { min: -50, max: -12 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.9, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(DEPTH.slash);
    this.ink = s.add.particles(0, 0, 'px', {
      lifespan: { min: 380, max: 760 },
      speedX: { min: -40, max: 40 },
      speedY: { min: -110, max: -20 },
      gravityY: 420,
      scale: { start: 1.4, end: 0.5 },
      tint: [INK, 0x2a1240, 0x6a3fa0, 0xb27fea],
      emitting: false,
    }).setDepth(DEPTH.slash - 0.1);
    this.rubble = s.add.particles(0, 0, 'px', {
      lifespan: { min: 400, max: 800 },
      speedX: { min: -60, max: 60 },
      speedY: { min: -120, max: -30 },
      gravityY: 520,
      scale: { start: 1.6, end: 0.8 },
      tint: [0x4a4858, 0x3b3a48, 0x6a6880, 0x8fb4ff],
      emitting: false,
    }).setDepth(DEPTH.slash - 0.1);
    this.syncHud(true);
  }

  get aiming() {
    return !!this.aim;
  }

  // a dica embaixo enquanto mira (null fora da mira)
  get aimHint() {
    const a = this.aim;
    if (!a) return null;
    const list = this.choices();
    const c = list[a.i];
    if (!c) return null;
    const more = list.length > 1 ? ' · {up}{down} trocar' : '';
    return `${c.name}${more} · {attack} lançar · {skill} cancelar`;
  }

  // ---------- versões ----------
  choices(): Choice[] {
    const M = MAGES[this.mage];
    if (this.mage !== 'necro') return M.versions.map((v) => ({ id: v.id, name: `${M.skill}: ${v.name}`, cd: v.cd }));
    // o Grimório: quem ele já venceu (de cada tipo), depois os chefes
    const out: Choice[] = [];
    const eco = M.versions.find((v) => v.id === 'eco')!;
    const chefe = M.versions.find((v) => v.id === 'chefe')!;
    for (const b of BESTIARY) {
      if (b.kind.startsWith('boss:') || !REV[b.kind] || !(progress.kills.get(b.kind) ?? 0)) continue;
      out.push({ id: `eco:${b.kind}`, name: `Eco: ${b.name}`, cd: eco.cd, kind: b.kind });
    }
    for (const [id, info] of Object.entries(BOSS_ECHO)) {
      if (!progress.seen.has(`boss:${id}`)) continue;
      out.push({ id: `chefe:${id}`, name: `Eco de chefe: ${info.name}`, cd: chefe.cd, boss: id });
    }
    return out;
  }

  // ---------- a cada quadro ----------
  update(dt: number, input: Controls) {
    this.cd = Math.max(0, this.cd - dt);
    if (this.aim) this.updateAim(dt, input);
    else if (input.pressed.skill) this.tryAim();
    for (const f of [...this.fx]) {
      if (f.update(dt)) continue;
      f.destroy();
      this.fx.splice(this.fx.indexOf(f), 1);
    }
    for (const r of this.revs) r.update(dt);
    this.revs = this.revs.filter((r) => !r.done);
    for (const b of this.bosses) b.update(dt);
    this.bosses = this.bosses.filter((b) => !b.done);
    this.updateWalls(dt);
    this.updateLaunches(dt);
    this.updateShoves(dt);
    this.syncHud();
  }

  private tryAim() {
    const s = this.s;
    const p = s.player;
    if (s.cinematic || s.transitioning || p.dead) return;
    if (this.cd > 0) {
      this.deny();
      return;
    }
    if (!p.canAim) {
      if (!p.onGround) s.thinkOnce('magic:ground', 'Preciso de chão firme para mirar.');
      this.deny();
      return;
    }
    const list = this.choices();
    if (!list.length) {
      s.thinkOnce('magic:grimorio', 'O Grimório ainda está em branco. Quem eu vencer entra nele, e daí pode voltar do meu lado.');
      this.deny();
      return;
    }
    const last = lastChoice[this.mage];
    let i = list.findIndex((c) => c.id === last);
    if (i < 0) i = this.mage === 'necro' ? list.length - 1 : 0;
    p.startAim();
    const x = p.x + p.facing * 56;
    this.aim = { x, floor: null, ok: false, i, mouse: s.controls.scheme === 'click', px: s.controls.pointerScreen.x, t: 0 };
    s.sfx('swoosh', 0.35, 1.6);
    s.thinkOnce('magic:aim', this.mage === 'necro'
      ? 'O Grimório abre. Escolho quem volta e onde.'
      : 'A magia espera onde eu olhar. Mire no chão.');
  }

  private updateAim(dt: number, input: Controls) {
    const s = this.s;
    const p = s.player;
    const a = this.aim!;
    a.t += dt;
    const list = this.choices();
    if (!p.aiming || s.cinematic || s.transitioning || p.dead || !list.length) return this.cancelAim();
    if (input.pressed.skill || input.pressed.jump || input.pressed.dash) {
      s.sfx('swoosh', 0.25, 0.9);
      return this.cancelAim();
    }
    // a mira anda com as setas (ou com o mouse, quando ele mexe na tela: a câmera tremendo não conta)
    const dir = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
    const sx = input.pointerScreen.x;
    if (Math.abs(sx - a.px) > 2) a.mouse = true;
    a.px = sx;
    if (dir !== 0) {
      a.mouse = false;
      a.x += dir * MAGIC.aimSpeed * dt;
    } else if (a.mouse) a.x = input.pointerWorld.x;
    const R = MAGIC.aimRange;
    a.x = Phaser.Math.Clamp(a.x, Math.max(8, p.x - R), Math.min(s.level.widthPx - 8, p.x + R));
    if (Math.abs(a.x - p.x) > 3) p.facing = a.x > p.x ? 1 : -1;
    // troca a versão (no Necromante, quem volta do Grimório)
    let step = 0;
    if (input.pressed.up) step = -1;
    if (input.pressed.down || input.pressed.memory) step = 1;
    if (step) {
      a.i = (a.i + step + list.length) % list.length;
      lastChoice[this.mage] = list[a.i].id;
      s.sfx('ui', 0.6, 1.2);
    }
    a.i = Math.min(a.i, list.length - 1);
    const c = list[a.i];
    a.floor = floorNear(s, a.x, p.body.bottom);
    a.ok = a.floor !== null && clear(s, p.body.center.x, p.body.top + 10, a.x, a.floor - 10);
    // o Mergulho passa por baixo: precisa de um caminho de chão até lá
    if (a.ok && c.id === 'mergulho') a.ok = Math.abs(a.floor! - p.body.bottom) <= 3 * TILE && clear(s, p.x, p.body.bottom - 8, a.x, a.floor! - 8);
    this.drawMark(c);
    if (input.pressed.attack) {
      if (!a.ok) {
        this.deny();
        return;
      }
      lastChoice[this.mage] = c.id;
      this.cast(c, a.x, a.floor!);
    }
  }

  cancelAim() {
    this.aim = null;
    this.markG.clear();
    this.markA.clear();
    const p = this.s.player;
    if (p.aiming) p.stopAim();
  }

  private deny() {
    this.s.sfx('locked', 0.4, 1.4);
    this.s.registry.set('skill-deny', ((this.s.registry.get('skill-deny') as number | undefined) ?? 0) + 1);
  }

  // o marcador no chão e o desenho do que vai sair dali
  private drawMark(c: Choice) {
    const a = this.aim!;
    const g = this.markG.clear();
    const ga = this.markA.clear();
    const col = a.ok ? MAGES[this.mage].color : 0x8a8a96;
    const pulse = 0.6 + Math.sin(a.t * 9) * 0.25;
    const x = a.x;
    const s = this.s;
    const p = s.player;
    const y = a.floor ?? p.body.bottom;
    // o arco pontilhado da ponta do cajado até o chão
    const tip = p.staffTip('cast_aim', 0);
    const peak = Math.min(tip.y, y) - 26;
    for (let k = 0.08; k < 0.96; k += 0.07) {
      const u = 1 - k;
      const px = u * u * tip.x + 2 * u * k * ((tip.x + x) / 2) + k * k * x;
      const py = u * u * tip.y + 2 * u * k * peak + k * k * y;
      ga.fillStyle(col, 0.55 * pulse).fillCircle(px, py, 0.9);
    }
    ga.lineStyle(1.5, col, 0.9 * pulse).strokeEllipse(x, y - 1, 22, 6);
    ga.lineStyle(1, col, 0.5 * pulse).strokeEllipse(x, y - 1, 34, 9);
    if (!a.ok) {
      g.lineStyle(1.5, 0x8a8a96, 0.8).lineBetween(x - 4, y - 8, x + 4, y - 2).lineBetween(x + 4, y - 8, x - 4, y - 2);
      return;
    }
    // a área de cada magia, bem leve
    const area = (rx: number, ry: number, w: number, h: number) => {
      ga.fillStyle(col, 0.08 * pulse).fillRect(rx, ry, w, h);
      ga.lineStyle(1, col, 0.35 * pulse).strokeRect(rx, ry, w, h);
    };
    const id = c.boss ? 'chefe' : c.kind ? 'eco' : c.id;
    const C = MAGIC;
    if (id === 'coluna') area(x - C.coluna.w / 2, y - C.coluna.h, C.coluna.w, C.coluna.h);
    else if (id === 'leque') area(x - C.leque.w / 2, y - C.leque.h, C.leque.w, C.leque.h);
    else if (id === 'tentaculos') for (const k of [-1, 0, 1]) area(x + k * C.tentaculo.gap - 6, y - C.tentaculo.h, 12, C.tentaculo.h);
    else if (id === 'mergulho') area(x - C.mergulho.w / 2, y - C.mergulho.h, C.mergulho.w, C.mergulho.h);
    else if (id === 'torre') area(x - C.torre.w / 2, y - C.torre.h, C.torre.w, C.torre.h);
    else if (id === 'protege' || id === 'empurra') {
      area(x - C.parede.w / 2, y - C.parede.h, C.parede.w, C.parede.h);
      if (id === 'empurra') {
        const d = x >= p.x ? 1 : -1;
        for (let k = 0; k < 3; k++) {
          const cx = x + d * (14 + k * 8);
          ga.lineStyle(1, col, (0.6 - k * 0.15) * pulse).lineBetween(cx - d * 3, y - 34, cx, y - 30).lineBetween(cx, y - 30, cx - d * 3, y - 26);
        }
      }
    } else if (id === 'eco') area(x - 9, y - 30, 18, 30);
    else if (id === 'chefe') area(x - C.revive.bossW / 2, y - C.revive.bossH, C.revive.bossW, C.revive.bossH);
  }

  // ---------- soltar ----------
  private cast(c: Choice, x: number, floor: number) {
    const s = this.s;
    const p = s.player;
    this.aim = null;
    this.markG.clear();
    this.markA.clear();
    this.cdMax = Math.max(0.5, c.cd * progress.skillCdMul);
    this.cd = this.cdMax;
    progress.seen.add('used:skill');
    s.markDirty();
    if (c.id === 'mergulho') {
      this.diveFrom(x, floor);
      return;
    }
    p.castAnim(0.3);
    s.sfx('swoosh', 0.7, 0.8);
    s.time.delayedCall(130, () => {
      if (!s.player || s.transitioning) return;
      if (c.kind) this.revive(c.kind, x, floor);
      else if (c.boss) this.bossEcho(c.boss, x, floor);
      else if (c.id === 'coluna') this.column(x, floor);
      else if (c.id === 'leque') this.fan(x, floor);
      else if (c.id === 'tentaculos') this.tentacles(x, floor);
      else if (c.id === 'torre') this.tower(x, floor);
      else if (c.id === 'protege') this.wall(x, floor, false);
      else if (c.id === 'empurra') this.wall(x, floor, true);
    });
  }

  // ---------- dano ----------
  // bate em todos os vivos dentro da área (uma vez cada); devolve quantos levaram
  strikeArea(box: Phaser.Geom.Rectangle, fromX: number, dmg: number, dir: HitDir, color: number, o: { once?: boolean; heavy?: boolean; push?: number; hitSet?: Set<Enemy>; launch?: number } = {}) {
    const s = this.s;
    let n = 0;
    for (const e of [...s.enemies]) {
      if (!e.alive || o.hitSet?.has(e) || !overlap(box, e.rect)) continue;
      o.hitSet?.add(e);
      if (o.launch && e.kind !== 'boss') {
        this.launch(e, o.launch, dmg);
        n++;
        continue;
      }
      const r = this.strikeOne(e, fromX, dmg, dir, color);
      if (r === 'hit') {
        n++;
        if (o.push && e.alive && e.kind !== 'boss') this.shove(e, Math.sign(e.zone.x - fromX) || 1, o.push, 0.22);
      }
      if (o.once && r !== 'ignored') break;
    }
    // o Âmbar cede à magia depois da Energia do Capataz
    s.mine?.magicHit(box);
    if (n && o.heavy) s.hitstop(0.05);
    return n;
  }

  strikeOne(e: Enemy, fromX: number, dmg: number, dir: HitDir, color: number) {
    const s = this.s;
    const r = e.hit(fromX, dmg, dir);
    const c = e.rect;
    const cx = c.centerX;
    const cy = c.centerY;
    if (r === 'blocked') {
      s.clang(cx, cy);
      return r;
    }
    if (r !== 'hit') return r;
    this.dots.setParticleTint(color);
    this.dots.explode(10, cx, cy);
    s.sparkAt(cx, cy, 6);
    s.sfx(e.alive ? 'hit' : 'kill', 0.8, 0.9);
    s.gainAmberFrom(e);
    if (!e.alive) s.killed(e);
    return r;
  }

  // ---------- Eclipse ----------
  private column(x: number, floor: number) {
    const s = this.s;
    const C = MAGIC.coluna;
    const add = s.add.graphics().setDepth(DEPTH.slash + 0.2).setBlendMode(Phaser.BlendModes.ADD);
    const core = s.add.graphics().setDepth(DEPTH.slash + 0.3);
    const glow = s.add.image(x, floor - 40, 'glow').setTint(EMBER).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.slash).setScale(1.6, 3.4).setAlpha(0);
    const hits = new Set<Enemy>();
    let struck = false;
    s.sfx('quake', 0.8, 1.3);
    s.sfx('censer', 0.6, 0.6);
    s.cameras.main.shake(160, 0.005);
    this.embers.explode(16, x, floor - 2);
    const fx: Fx = {
      t: 0,
      update: (dt) => {
        fx.t += dt;
        const t = fx.t;
        if (t >= 0.78) return false;
        const rise = Math.min(1, t / 0.12);
        const fade = t > 0.5 ? Math.max(0, 1 - (t - 0.5) / 0.28) : 1;
        const h = C.h * (rise * rise * (3 - 2 * rise));
        const w = C.w * (t > 0.5 ? 0.6 + 0.4 * fade : 1);
        add.clear();
        core.clear();
        const fl = Math.sin(t * 60) * 0.1;
        add.fillStyle(0xff5a1e, 0.12 * fade).fillRect(x - w * 0.95, floor - h, w * 1.9, h);
        add.fillStyle(EMBER, (0.32 + fl) * fade).fillRect(x - w * 0.62, floor - h, w * 1.24, h);
        add.fillStyle(0xffb04a, 0.55 * fade).fillRect(x - w * 0.4, floor - h, w * 0.8, h);
        add.fillStyle(0xffe6a6, 0.8 * fade).fillRect(x - w * 0.18, floor - h, w * 0.36, h);
        // línguas de fogo no alto e a base no chão
        for (let k = -2; k <= 2; k++) {
          const tx = x + k * (w * 0.22);
          const th = 10 + Math.abs(Math.sin(t * 30 + k * 2)) * 14;
          add.fillStyle(EMBER, 0.45 * fade).fillTriangle(tx - 4, floor - h + 2, tx + 4, floor - h + 2, tx + Math.sin(t * 20 + k) * 3, floor - h - th);
        }
        add.fillStyle(0xffb04a, 0.5 * fade).fillEllipse(x, floor - 1, w * 3.2, 8);
        // o miolo escuro do eclipse correndo no meio do fogo
        core.fillStyle(0x120806, 0.85 * fade).fillRect(x - 1, floor - h + 6, 2, Math.max(0, h - 10));
        core.fillStyle(0x120806, 0.6 * fade).fillCircle(x, floor - h * 0.62, 3 + Math.sin(t * 18));
        glow.setAlpha(0.8 * fade).setScale(1.6, 0.4 + 3.2 * rise);
        glow.y = floor - h / 2;
        if (Math.random() < dt * 60) this.embers.emitParticle(1, x + (Math.random() - 0.5) * w, floor - Math.random() * h);
        if (!struck && t >= 0.1) {
          struck = true;
          this.strikeArea(new Phaser.Geom.Rectangle(x - C.w / 2, floor - C.h, C.w, C.h), x, C.dmg * progress.dmgFor('eclipse'), 'quake', EMBER, { heavy: true, hitSet: hits });
        }
        return true;
      },
      destroy: () => {
        add.destroy();
        core.destroy();
        glow.destroy();
      },
    };
    this.fx.push(fx);
  }

  private fan(x: number, floor: number) {
    const s = this.s;
    const C = MAGIC.leque;
    const add = s.add.graphics().setDepth(DEPTH.slash + 0.2).setBlendMode(Phaser.BlendModes.ADD);
    const glow = s.add.image(x, floor - 10, 'glow').setTint(EMBER).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.slash).setScale(0.6, 0.6).setAlpha(0.9);
    const hits = new Set<Enemy>();
    s.sfx('quake', 0.7, 1.5);
    s.sfx('swoosh', 0.8, 0.6);
    s.cameras.main.shake(120, 0.004);
    const fx: Fx = {
      t: 0,
      update: (dt) => {
        fx.t += dt;
        const t = fx.t;
        if (t >= 0.62) return false;
        const k = Math.min(1, t / 0.2);
        const reach = (C.w / 2) * (1 - (1 - k) * (1 - k));
        const fade = t > 0.32 ? Math.max(0, 1 - (t - 0.32) / 0.3) : 1;
        add.clear();
        for (const side of [-1, 1]) {
          const x1 = x + side * reach;
          // a frente do fogo: mais alta perto do meio, baixando até a ponta
          const n = 10;
          for (let i = 0; i < n; i++) {
            const u0 = i / n;
            const u1 = (i + 1) / n;
            const hx0 = x + (x1 - x) * u0;
            const hx1 = x + (x1 - x) * u1;
            const hh = C.h * (1 - u0 * 0.55) * (0.8 + Math.abs(Math.sin(t * 34 + i * 1.7)) * 0.2);
            add.fillStyle(EMBER, 0.32 * fade).fillRect(Math.min(hx0, hx1), floor - hh, Math.abs(hx1 - hx0) + 0.5, hh);
            add.fillStyle(0xffd27a, 0.5 * fade).fillRect(Math.min(hx0, hx1), floor - hh * 0.45, Math.abs(hx1 - hx0) + 0.5, hh * 0.45);
          }
          add.fillStyle(0xfff0c8, 0.7 * fade).fillCircle(x1, floor - 6, 4);
          if (Math.random() < dt * 40) this.embers.emitParticle(1, x1, floor - Math.random() * 16);
        }
        glow.setScale(0.6 + (reach / 30), 0.7).setAlpha(0.9 * fade);
        // o fogo bate em quem a frente alcança e empurra para fora
        const box = new Phaser.Geom.Rectangle(x - reach, floor - C.h, reach * 2, C.h);
        this.strikeArea(box, x, C.dmg * progress.dmgFor('eclipse'), 'quake', EMBER, { hitSet: hits, push: C.push });
        return true;
      },
      destroy: () => {
        add.destroy();
        glow.destroy();
      },
    };
    this.fx.push(fx);
  }

  // ---------- Necromante ----------
  private revive(kind: string, x: number, floor: number) {
    const s = this.s;
    const k = REV[kind];
    if (!k) return;
    // no máximo dois: o mais antigo se desfaz
    const live = this.revs.filter((r) => !r.done);
    if (live.length >= MAGIC.revive.max) live[0].fade();
    this.revs.push(new Revenant(this, s, k, x, floor, MAGIC.revive.life));
    this.circle(x, floor, NECRO);
    s.sfx('veil-form', 0.6, 1.3);
    s.sfx('chime', 0.4, 0.7);
    s.thinkOnce('magic:revive', 'Ele volta como lembrança, não como corpo. E luta do meu lado.');
  }

  private bossEcho(id: string, x: number, floor: number) {
    const s = this.s;
    const info = BOSS_ECHO[id];
    if (!info) return;
    // a folha do chefe só fica carregada na sala dele: fora dela, vem agora (um instante) e o eco sai
    // quando chegar
    if (!s.textures.exists(info.sheet)) {
      this.circle(x, floor, NECRO, 2);
      void ensureSheet(s, info.sheet).then((ok) => {
        if (ok && s.scene.isActive() && s.player && !s.player.dead) this.bossEcho(id, x, floor);
      });
      return;
    }
    // vira para o inimigo mais perto (sem ninguém, para onde o mago olha)
    let f: 1 | -1 = s.player.facing;
    let d = Infinity;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const dx = e.zone.x - x;
      if (Math.abs(dx) < d) {
        d = Math.abs(dx);
        f = dx >= 0 ? 1 : -1;
      }
    }
    this.bosses.push(new BossEcho(this, s, info, x, floor, f));
    this.circle(x, floor, NECRO, 2);
    s.sfx('veil-form', 0.8, 0.8);
    s.sfx('bell', 0.3, 0.6);
  }

  // o círculo de chamar no chão (Grimório)
  private circle(x: number, floor: number, color: number, big = 1) {
    const s = this.s;
    const g = s.add.graphics().setDepth(DEPTH.slash).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 700,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        g.clear();
        g.lineStyle(1.5, color, 0.9 * (1 - k)).strokeEllipse(x, floor - 1, (20 + k * 36) * big, (5 + k * 7) * big);
        g.lineStyle(1, color, 0.6 * (1 - k)).strokeEllipse(x, floor - 1, (12 + k * 22) * big, (3 + k * 4) * big);
      },
      onComplete: () => g.destroy(),
    });
    for (let i = 0; i < 14 * big; i++) this.motes(x + (Math.random() - 0.5) * 24 * big, floor - Math.random() * 8, color);
  }

  motes(x: number, y: number, color: number) {
    this.dots.setParticleTint(color);
    this.dots.emitParticle(1, x, y);
  }

  // ---------- Véu Abissal ----------
  private tentacles(x: number, floor: number) {
    const s = this.s;
    const C = MAGIC.tentaculo;
    s.sfx('veil', 0.8, 0.8);
    s.sfx('splash', 0.5, 0.6);
    [-1, 0, 1].forEach((k, i) => {
      const tx = x + k * C.gap;
      if (floorNear(s, tx, floor) !== floor) return;
      s.time.delayedCall(i * 70, () => this.tentacle(tx, floor, i));
    });
  }

  private tentacle(x: number, floor: number, seed: number) {
    const s = this.s;
    const C = MAGIC.tentaculo;
    const g = s.add.graphics().setDepth(DEPTH.slash + 0.1);
    const ga = s.add.graphics().setDepth(DEPTH.slash + 0.15).setBlendMode(Phaser.BlendModes.ADD);
    const glow = s.add.image(x, floor - 10, 'glow').setTint(0xb27fea).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.slash).setAlpha(0);
    const hits = new Set<Enemy>();
    let struck = false;
    this.ink.explode(8, x, floor - 2);
    const bend = seed % 2 ? 1 : -1;
    const fx: Fx = {
      t: 0,
      update: (dt) => {
        fx.t += dt;
        const t = fx.t;
        if (t >= 0.72) return false;
        const up = Math.min(1, t / 0.12);
        const down = t > 0.5 ? Math.min(1, (t - 0.5) / 0.22) : 0;
        const h = C.h * (up * up * (3 - 2 * up)) * (1 - down);
        g.clear();
        ga.clear();
        if (h < 1) return true;
        const n = 12;
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const sway = Math.sin(u * 3.2 + t * 14 + seed) * 4 * u + bend * u * u * 6;
          pts.push({ x: x + sway, y: floor - h * u });
        }
        for (let i = 0; i < n; i++) {
          const w = 7 * (1 - i / n) + 1.4;
          g.lineStyle(w, INK, 1).lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        }
        // ventosas lilás e o brilho da beirada
        for (let i = 2; i < n; i += 2) {
          const w = 7 * (1 - i / n) + 1.4;
          ga.fillStyle(0xb27fea, 0.55).fillCircle(pts[i].x + bend * w * 0.3, pts[i].y, 0.9);
        }
        // a beirada que pega a luz (lilás), para a tinta escura aparecer contra o fundo escuro
        for (let i = 0; i < n; i++) {
          const w = 7 * (1 - i / n) + 1.4;
          ga.lineStyle(1.1, 0x9b6ad8, 0.85).lineBetween(pts[i].x - w * 0.45, pts[i].y, pts[i + 1].x - w * 0.45, pts[i + 1].y);
        }
        glow.setPosition(x, floor - h * 0.4).setScale(0.5, 0.25 + h / 60).setAlpha(0.4 * (1 - down));
        const tip = pts[n];
        g.fillStyle(INK, 1).fillCircle(tip.x, tip.y, 1.6);
        g.fillStyle(INK, 1).fillEllipse(x, floor - 1, 18, 5);
        ga.lineStyle(1, 0xb27fea, 0.5).strokeEllipse(x, floor - 1, 20, 6);
        if (Math.random() < dt * 30) this.ink.emitParticle(1, tip.x, tip.y);
        if (!struck && up >= 1) {
          struck = true;
          this.strikeArea(new Phaser.Geom.Rectangle(x - 7, floor - C.h, 14, C.h), x, C.dmg * progress.dmgFor('veu'), 'quake', 0xb27fea, { hitSet: hits });
          s.sfx('slash', 0.5, 0.6);
        }
        return true;
      },
      destroy: () => {
        g.destroy();
        ga.destroy();
        glow.destroy();
      },
    };
    this.fx.push(fx);
  }

  private diveFrom(x: number, floor: number) {
    const s = this.s;
    const p = s.player;
    const C = MAGIC.mergulho;
    const from = { x: p.x, y: p.body.bottom };
    this.ink.explode(14, from.x, from.y - 2);
    s.sfx('veil', 0.9, 0.7);
    s.sfx('splash', 0.6, 0.7);
    // a poça que corre por baixo do chão
    const g = s.add.graphics().setDepth(DEPTH.slash);
    const fx: Fx = {
      t: 0,
      update: (dt) => {
        fx.t += dt;
        g.clear();
        if (!p.diving) return false;
        const bx = p.x;
        const k = Math.min(1, fx.t / C.travel);
        const y = from.y + (floor - from.y) * k;
        g.fillStyle(INK, 0.9).fillEllipse(bx, y - 1, 16, 4);
        g.lineStyle(1, 0xb27fea, 0.6).strokeEllipse(bx, y - 1, 18, 5);
        if (Math.random() < dt * 40) this.ink.emitParticle(1, bx, y - 2);
        return true;
      },
      destroy: () => g.destroy(),
    };
    this.fx.push(fx);
    p.startDive(x, floor, C.travel, () => {
      // sai do chão batendo para cima
      this.ink.explode(18, x, floor - 2);
      s.sfx('veil-form', 0.9, 0.9);
      s.sfx('heavy', 0.6, 1.2);
      s.cameras.main.shake(110, 0.005);
      this.strikeArea(new Phaser.Geom.Rectangle(x - C.w / 2, floor - C.h, C.w, C.h), x, C.dmg * progress.dmgFor('veu'), 'quake', 0xb27fea, { heavy: true });
      this.splash(x, floor);
    });
  }

  // o respingo de tinta subindo onde ele sai
  private splash(x: number, floor: number) {
    const s = this.s;
    const g = s.add.graphics().setDepth(DEPTH.slash + 0.1);
    s.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 420,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        g.clear();
        const h = 52 * Math.sin(k * Math.PI);
        for (const d of [-1, 1]) {
          g.fillStyle(INK, 0.9 * (1 - k)).fillTriangle(x + d * 3, floor, x + d * 12, floor, x + d * (8 + k * 8), floor - h * 0.7);
        }
        g.fillStyle(INK, 0.95 * (1 - k)).fillTriangle(x - 5, floor, x + 5, floor, x, floor - h);
      },
      onComplete: () => g.destroy(),
    });
  }

  // ---------- Espaço ----------
  private tower(x: number, floor: number) {
    const s = this.s;
    const C = MAGIC.torre;
    const g = s.add.graphics().setDepth(DEPTH.slash - 0.2);
    const ga = s.add.graphics().setDepth(DEPTH.slash - 0.1).setBlendMode(Phaser.BlendModes.ADD);
    const hits = new Set<Enemy>();
    let launched = false;
    s.sfx('quake', 1, 0.8);
    s.sfx('heavy', 0.8, 0.7);
    s.cameras.main.shake(220, 0.008);
    this.rubble.explode(14, x, floor - 2);
    const fx: Fx = {
      t: 0,
      update: (dt) => {
        fx.t += dt;
        const t = fx.t;
        if (t >= 1.5) return false;
        const up = Math.min(1, t / 0.16);
        const down = t > 1.15 ? Math.min(1, (t - 1.15) / 0.35) : 0;
        const h = C.h * (1 - (1 - up) * (1 - up)) * (1 - down);
        g.clear();
        ga.clear();
        if (h < 1) return true;
        const w = C.w;
        const x0 = x - w / 2;
        // pedras empilhadas, cada fileira desencontrada da outra
        const rowH = 8;
        for (let r = 0; r * rowH < h; r++) {
          const y1 = floor - r * rowH;
          const y0 = Math.max(floor - h, y1 - rowH);
          const off = r % 2 ? w / 4 : 0;
          for (let bx = x0 - off; bx < x0 + w; bx += w / 2) {
            const a = Math.max(x0, bx);
            const b = Math.min(x0 + w, bx + w / 2);
            if (b <= a) continue;
            g.fillStyle((r + Math.floor(bx)) % 2 ? 0x3b3a48 : 0x4a4858, 1).fillRect(a, y0, b - a, y1 - y0);
            g.fillStyle(0x1d1c26, 1).fillRect(a, y1 - 1, b - a, 1).fillRect(b - 1, y0, 1, y1 - y0);
            g.fillStyle(0x5d5b70, 1).fillRect(a, y0, b - a, 1);
          }
        }
        g.fillStyle(0x6a6880, 1).fillRect(x0 - 1, floor - h, w + 2, 2);
        // as runas do espaço acesas nas pedras
        for (let r = 1; r * rowH < h; r += 2) {
          const ry = floor - r * rowH - 4;
          ga.fillStyle(SPACE, 0.7).fillRect(x - 1, ry - 2, 2, 4);
          ga.fillStyle(SPACE, 0.35).fillRect(x - 4, ry, 8, 1);
        }
        ga.lineStyle(1, SPACE, 0.45).strokeRect(x0 - 0.5, floor - h, w + 1, h);
        if (!launched && up >= 1) {
          launched = true;
          // quem estava em cima vai para o alto; o dano vem na queda (o chefe só leva a pancada)
          const box = new Phaser.Geom.Rectangle(x0 - 4, floor - C.h - 8, w + 8, C.h + 8);
          for (const e of [...s.enemies]) {
            if (!e.alive || hits.has(e) || !overlap(box, e.rect)) continue;
            hits.add(e);
            if (e.kind === 'boss') this.strikeOne(e, x, C.bossDmg * progress.dmgFor('espaco'), 'quake', SPACE);
            else this.launch(e, C.launch, C.dmg * progress.dmgFor('espaco'));
          }
          s.mine?.magicHit(box);
        }
        if (down > 0 && Math.random() < dt * 30) this.rubble.emitParticle(1, x0 + Math.random() * w, floor - h);
        return true;
      },
      destroy: () => {
        g.destroy();
        ga.destroy();
      },
    };
    this.fx.push(fx);
  }

  private launch(e: Enemy, v: number, dmg: number) {
    const b = e.body;
    // os que voam não caem: levam o golpe na hora
    if (!b.allowGravity) {
      this.strikeOne(e, e.zone.x, dmg, 'quake', SPACE);
      return;
    }
    b.velocity.y = -v;
    b.y -= 4;
    this.launches.push({ e, t: 0, up: true, dmg });
    this.s.sfx('swoosh', 0.7, 0.7);
  }

  private updateLaunches(dt: number) {
    for (const l of this.launches) {
      l.t += dt;
      const b = l.e.body;
      if (l.up && b.velocity.y >= 0) l.up = false;
      // bateu no chão depois de subir (ou passou tempo demais no ar): a queda machuca
      if ((!l.up && b.blocked.down && l.t > 0.2) || l.t > 2.4) {
        l.t = 99;
        if (!l.e.alive) continue;
        this.rubble.explode(8, l.e.zone.x, b.bottom - 2);
        this.s.sfx('thud', 0.9, 0.8);
        this.s.cameras.main.shake(90, 0.004);
        this.strikeOne(l.e, l.e.zone.x, l.dmg, 'quake', SPACE);
      }
    }
    this.launches = this.launches.filter((l) => l.t < 99 && l.e.alive);
  }

  private wall(x: number, floor: number, push: boolean) {
    const s = this.s;
    const P = MAGIC.parede;
    const g = s.add.graphics().setDepth(DEPTH.slash + 0.2).setBlendMode(Phaser.BlendModes.ADD);
    const glow = s.add.image(x, floor - P.h / 2, 'glow').setTint(SPACE).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.slash).setScale(0.8, 2).setAlpha(0);
    const dir = x >= s.player.x ? 1 : -1;
    this.walls.push({ x, floor, t: 0, life: push ? 1.1 : P.life, push, dir, hit: new Set(), g, glow });
    s.sfx('veil', 0.6, 1.6);
    s.sfx('glass', 0.4, 1.4);
  }

  private updateWalls(dt: number) {
    const s = this.s;
    const P = MAGIC.parede;
    for (const w of this.walls) {
      w.t += dt;
      if (w.push && w.t > 0.12) {
        // anda até bater na pedra
        const nx = w.x + w.dir * P.speed * dt;
        if (isSolid(s.level.tileAt(nx + w.dir * P.w / 2, w.floor - 10)) || isSolid(s.level.tileAt(nx + w.dir * P.w / 2, w.floor - P.h + 8))) w.t = Math.max(w.t, w.life - 0.2);
        else w.x = nx;
      }
      const a = w.t < 0.15 ? w.t / 0.15 : w.t > w.life - 0.3 ? Math.max(0, (w.life - w.t) / 0.3) : 1;
      // o fim da proteção pisca para avisar
      const blink = !w.push && w.t > w.life - 1 ? (Math.floor(w.t * 12) % 2 ? 0.5 : 1) : 1;
      const g = w.g.clear();
      const k = a * blink;
      const h = P.h;
      const top = w.floor - h;
      g.fillStyle(SPACE, 0.12 * k).fillEllipse(w.x, top + h / 2, P.w * 2.2, h);
      g.lineStyle(1.5, 0xbcd4ff, 0.85 * k).strokeEllipse(w.x, top + h / 2, P.w * 1.6 + Math.sin(w.t * 9) * 1.5, h);
      for (let i = 0; i < 4; i++) {
        const yy = top + ((w.t * 40 + i * 15) % h);
        const ww = Math.sin(((yy - top) / h) * Math.PI) * P.w * 0.7;
        g.lineStyle(1, SPACE, 0.5 * k).lineBetween(w.x - ww, yy, w.x + ww, yy + Math.sin(w.t * 6 + i) * 2);
      }
      for (let i = 0; i < 5; i++) {
        const yy = top + 6 + ((i * 11 + w.t * 18) % (h - 12));
        g.fillStyle(0xffffff, 0.7 * k).fillRect(w.x + Math.sin(i * 2.3 + w.t * 3) * P.w * 0.4, yy, 1, 1);
      }
      if (w.push) {
        g.lineStyle(2, 0xbcd4ff, 0.7 * k).beginPath();
        g.arc(w.x - w.dir * 8, top + h / 2, h * 0.55, w.dir > 0 ? -0.9 : Math.PI - 0.9, w.dir > 0 ? 0.9 : Math.PI + 0.9);
        g.strokePath();
      }
      w.glow.setPosition(w.x, top + h / 2).setAlpha(0.45 * k);
      const rect = new Phaser.Geom.Rectangle(w.x - P.w / 2, top, P.w, h);
      for (const e of s.enemies) {
        if (!e.alive || !overlap(rect, e.rect)) continue;
        if (w.push) {
          if (!w.hit.has(e)) {
            w.hit.add(e);
            this.strikeOne(e, w.x - w.dir * 20, P.dmg * progress.dmgFor('espaco'), 'smoke', SPACE);
          }
          if (e.alive && e.kind !== 'boss') this.shove(e, w.dir, P.push, 0.3);
        } else if (e.kind !== 'boss') {
          // ninguém atravessa: volta para o lado de onde veio
          const side = e.zone.x < w.x ? -1 : 1;
          const b = e.body;
          b.x = side < 0 ? rect.x - b.width - 1 : rect.right + 1;
          if (Math.sign(b.velocity.x) === -side) b.velocity.x = 0;
        }
      }
    }
    for (const w of this.walls) {
      if (w.t < w.life) continue;
      w.g.destroy();
      w.glow.destroy();
    }
    this.walls = this.walls.filter((w) => w.t < w.life);
  }

  // a parede que protege está entre quem machuca e o mago? (o golpe e o tiro param nela)
  shields(fromX: number, py: number) {
    const p = this.s.player;
    for (const w of this.walls) {
      if (w.push || w.t > w.life - 0.05) continue;
      if (py < w.floor - MAGIC.parede.h - 4 || py > w.floor + 4) continue;
      if ((fromX < w.x && p.x > w.x) || (fromX > w.x && p.x < w.x)) return true;
    }
    return false;
  }

  // flecha inimiga encostou numa parede de espaço: some ali
  blocksShot(r: Phaser.Geom.Rectangle) {
    for (const w of this.walls) {
      if (w.t > w.life - 0.05) continue;
      const rect = new Phaser.Geom.Rectangle(w.x - MAGIC.parede.w / 2 - 2, w.floor - MAGIC.parede.h, MAGIC.parede.w + 4, MAGIC.parede.h);
      if (overlap(r, rect)) {
        this.dots.setParticleTint(SPACE);
        this.dots.explode(8, r.centerX, r.centerY);
        this.s.sfx('glass', 0.5, 1.6);
        return true;
      }
    }
    return false;
  }

  // ---------- empurrões ----------
  shove(e: Enemy, dir: number, speed: number, t: number) {
    const old = this.shoves.find((s) => s.e === e);
    if (old) {
      old.dir = dir;
      old.speed = Math.max(old.speed, speed);
      old.t = Math.max(old.t, t);
      return;
    }
    this.shoves.push({ e, dir, speed, t });
  }

  private updateShoves(dt: number) {
    const L = this.s.level;
    for (const sh of this.shoves) {
      sh.t -= dt;
      const e = sh.e;
      if (!e.alive) {
        sh.t = 0;
        continue;
      }
      const b = e.body;
      const step = sh.dir * sh.speed * dt;
      const lead = sh.dir > 0 ? b.right + step + 1 : b.left + step - 1;
      if (isSolid(L.tileAt(lead, b.center.y)) || isSolid(L.tileAt(lead, b.bottom - 4))) {
        sh.t = 0;
        continue;
      }
      b.x += step;
      sh.speed *= Math.max(0, 1 - dt * 5);
    }
    this.shoves = this.shoves.filter((s) => s.t > 0);
  }

  // ---------- golpe básico do Cajado da Dobra ----------
  // (o espelho e o Eco repetem o pulso com as cores deles)
  pulseFx(box: Phaser.Geom.Rectangle, facing: number, ring = SPACE, core = 0xdce8ff) {
    const s = this.s;
    const g = s.add.graphics().setDepth(DEPTH.slash).setBlendMode(Phaser.BlendModes.ADD);
    const cx = facing > 0 ? box.x + 6 : box.right - 6;
    const cy = box.centerY;
    const R = Math.max(box.width, box.height) * 0.62;
    s.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 240,
      ease: 'Quad.easeOut',
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        g.clear();
        for (let i = 0; i < 3; i++) {
          const kk = Math.max(0, k - i * 0.16);
          if (kk <= 0) continue;
          const r = 4 + kk * R;
          g.lineStyle(2 - i * 0.5, i ? ring : core, 0.85 * (1 - kk));
          g.beginPath();
          g.arc(cx, cy, r, facing > 0 ? -1.1 : Math.PI - 1.1, facing > 0 ? 1.1 : Math.PI + 1.1);
          g.strokePath();
        }
        g.fillStyle(0xffffff, 0.8 * (1 - k)).fillCircle(cx, cy, 2.5 * (1 - k) + 0.5);
      },
      onComplete: () => g.destroy(),
    });
    this.dots.setParticleTint(ring);
    this.dots.explode(5, cx + facing * 10, cy);
  }

  // ---------- HUD ----------
  private syncHud(force = false) {
    const M = MAGES[this.mage];
    const state = {
      mage: this.mage,
      color: M.color,
      cd: Math.round(this.cd * 20) / 20,
      max: this.cdMax,
      aiming: !!this.aim,
      energy: progress.energy,
    };
    const key = `${state.cd}|${state.aiming}|${state.energy}`;
    if (!force && key === this.lastHud) return;
    this.lastHud = key;
    this.s.registry.set('skill', state);
  }

  // sala trocando ou o mago caiu: tudo o que a magia fez some
  destroy() {
    this.cancelAim();
    for (const f of this.fx) f.destroy();
    this.fx = [];
    for (const r of this.revs) r.destroy();
    this.revs = [];
    for (const w of this.walls) {
      w.g.destroy();
      w.glow.destroy();
    }
    this.walls = [];
  }
}

export { REV, BOSS_ECHO };

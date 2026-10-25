import Phaser from 'phaser';
import { TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import { progress } from '../systems/Save';
import { DEPTH } from './Decor';
import type { Ability } from './rooms';
import { face, hd } from '../gfx/flip';

// pavios das cinco velas do altar (em relação ao pé do desenho)
const WICKS: [number, number][] = [[-9, -41], [-4, -46], [1, -50], [6, -44], [11, -40]];

export interface Shrine {
  i: number;
  x: number;
  y: number;
  lit: boolean;
  flames: Phaser.GameObjects.Sprite[];
  glows: Phaser.GameObjects.Image[];
}

export interface Relic {
  kind: Ability;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image | null;
  glow: Phaser.GameObjects.Image | null;
}

export interface MemoryOrb {
  id: string;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  phase: number;
  taken: boolean;
}

export interface Gate {
  x: number;
  y: number;
  h: number;
  sprite: Phaser.GameObjects.Image;
  open: boolean;
}

// Objetos com que o cavaleiro interage: velas de descanso, relíquias, memórias, o Cobrador e as grades
export class Props {
  readonly shrines: Shrine[] = [];
  readonly relics: Relic[] = [];
  readonly memories: MemoryOrb[] = [];
  readonly gates: Gate[] = [];
  cobrador: { x: number; y: number; sprite: Phaser.GameObjects.Sprite; light: Phaser.GameObjects.Image } | null = null;
  private flickers: { img: Phaser.GameObjects.Image; base: number; phase: number }[] = [];

  constructor(private scene: GameScene, gatesOpen: boolean) {
    const L = scene.level;
    const room = scene.room.id;
    let ri = 0;
    let mi = 0;
    for (const s of L.spawns) {
      if (s.kind === 'R') this.addShrine(ri++, s.x, s.y);
      else if (s.kind === 'J') this.addRelic('wall', s.x, s.y);
      else if (s.kind === 'U') this.addRelic('double', s.x, s.y);
      else if (s.kind === 'K') this.addCobrador(s.x, s.y);
      else if (s.kind === 'm') {
        const id = `${room}:${mi++}`;
        if (!progress.memories.has(id)) this.addMemory(id, s.x, s.y - 20);
      }
    }
    // cada coluna de '|' no mapa é uma grade
    const cols = new Map<number, number[]>();
    for (const g of L.gates) cols.set(g.x, [...(cols.get(g.x) ?? []), g.y]);
    for (const [x, ys] of cols) {
      const top = Math.min(...ys);
      const h = (Math.max(...ys) - top + 1) * TILE;
      // atrás da pintura do terreno: ao subir, some dentro da pedra
      const sprite = scene.add.image(x * TILE, top * TILE, 'deco-portcullis').setOrigin(0).setDepth(DEPTH.tiles - 0.5);
      sprite.setDisplaySize(TILE, h);
      this.gates.push({ x: x * TILE, y: top * TILE, h, sprite, open: false });
    }
    this.setGates(gatesOpen, false);
  }

  // ---------- velas de descanso ----------
  private addShrine(i: number, x: number, y: number) {
    const s = this.scene;
    s.add.image(x, y, 'deco-shrine').setOrigin(0.5, 1).setDepth(DEPTH.prop);
    const sh: Shrine = { i, x, y, lit: false, flames: [], glows: [] };
    this.shrines.push(sh);
    // brasa fraca nos pavios antes de acender
    const ember = s.add.image(x + 1, y - 46, 'glow').setScale(0.9).setTint(0xff7a2a).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front);
    sh.glows.push(ember);
    if (progress.seen.has(this.restKey(i))) this.light(sh, false);
  }

  restKey(i: number) {
    return `rest:${this.scene.room.id}:${i}`;
  }

  light(sh: Shrine, animate: boolean) {
    if (sh.lit) return;
    sh.lit = true;
    const s = this.scene;
    WICKS.forEach(([dx, dy], k) => {
      const f = s.add.sprite(sh.x + dx + 0.5, sh.y + dy + 1, 'flame', 0).setOrigin(0.5, 1).setDepth(DEPTH.prop + 0.1);
      f.play({ key: 'flame', startFrame: k % 4 });
      if (animate) {
        f.setScale(0);
        s.tweens.add({ targets: f, scale: 1, delay: 90 * k, duration: 260, ease: 'Back.easeOut' });
      }
      sh.flames.push(f);
    });
    const add = Phaser.BlendModes.ADD;
    const core = s.add.image(sh.x + 1, sh.y - 48, 'glow').setScale(1.3).setTint(0xffb04a).setAlpha(0.8).setBlendMode(add).setDepth(DEPTH.front);
    const wide = s.add.image(sh.x + 1, sh.y - 44, 'glow').setScale(4.2).setTint(0xffa040).setAlpha(0.2).setBlendMode(add).setDepth(DEPTH.front);
    for (const [img, base] of [[core, 0.8], [wide, 0.2]] as const) {
      this.flickers.push({ img, base, phase: Math.random() * 10 });
      if (animate) s.tweens.add({ targets: img, alpha: { from: 0, to: base }, duration: 700 });
    }
    sh.glows[0]?.setVisible(false);
  }

  // ---------- relíquias ----------
  private addRelic(kind: Ability, x: number, y: number) {
    const s = this.scene;
    s.add.image(x, y, 'deco-pedestal').setOrigin(0.5, 1).setDepth(DEPTH.prop);
    const r: Relic = { kind, x, y, sprite: null, glow: null };
    if (!progress.abilities.has(kind)) {
      r.glow = s.add.image(x, y - 50, 'glow').setScale(1.8).setTint(kind === 'wall' ? 0xbcd4ff : 0xfff0c8).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front);
      r.sprite = s.add.image(x, y - 50, `relic-${kind}`).setDepth(DEPTH.enemy);
    }
    this.relics.push(r);
  }

  // ---------- memórias ----------
  // rise: a memória sai de dentro de algo (o corpo do chefe) e sobe até onde flutua
  addMemory(id: string, x: number, y: number, rise = false) {
    const s = this.scene;
    const glow = s.add.image(x, y, 'glow').setScale(1.5).setTint(0xffd98a).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front);
    const sprite = s.add.image(x, y, 'memory').setDepth(DEPTH.enemy + 0.5);
    const m: MemoryOrb = { id, x, y, sprite, glow, phase: Math.random() * 6, taken: false };
    this.memories.push(m);
    if (rise) {
      m.y = y + 22;
      sprite.setAlpha(0).setScale(0.4);
      glow.setScale(0.2);
      s.tweens.add({ targets: m, y, duration: 1400, ease: 'Sine.easeOut' });
      s.tweens.add({ targets: sprite, alpha: 1, scale: 1, duration: 900 });
      s.tweens.add({ targets: glow, scale: 1.5, duration: 1100 });
    }
  }

  // ---------- o Cobrador ----------
  private addCobrador(x: number, y: number) {
    const s = this.scene;
    const o = s.registry.get('cobrador-origin') as { x: number; y: number };
    const sprite = hd(s.add.sprite(x, y, 'cobrador', 0)).setOrigin(o.x, o.y).setDepth(DEPTH.enemy).play('cobrador-idle');
    const light = s.add.image(x + 23, y - 22, 'glow').setScale(1.1).setTint(0xffd98a).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front);
    this.flickers.push({ img: light, base: 0.55, phase: 3 });
    this.cobrador = { x, y, sprite, light };
  }

  talk(on: boolean) {
    const c = this.cobrador;
    if (!c) return;
    c.sprite.play(on ? 'cobrador-talk' : 'cobrador-idle', true);
  }

  // ---------- grades ----------
  setGates(open: boolean, animate: boolean, done?: () => void) {
    const s = this.scene;
    if (!this.gates.length) {
      done?.();
      return;
    }
    // fechada, a grade é sólida na física; aberta, some dentro da pedra de cima
    if (!open) s.level.setGates(false);
    for (const g of this.gates) {
      g.open = open;
      const y = open ? g.y - g.h + 6 : g.y;
      s.tweens.killTweensOf(g.sprite);
      if (!animate) {
        g.sprite.y = y;
        continue;
      }
      s.tweens.add({
        targets: g.sprite,
        y,
        duration: open ? 2200 : 260,
        ease: open ? 'Sine.easeInOut' : 'Quad.easeIn',
        onComplete: () => {
          if (open) s.level.setGates(true);
          else {
            s.cameras.main.shake(140, 0.006);
            s.dustBurst(g.x + 8, g.y + g.h, 12);
          }
          done?.();
        },
      });
    }
    if (open && !animate) s.level.setGates(true);
  }

  // ---------- interação ----------
  // dica do objeto ao alcance e o que fazer se o jogador apertar para cima
  nearby(p: Player): { hint: string; act: () => void } | null {
    const s = this.scene;
    const b = p.body;
    if (p.onGround) {
      for (const sh of this.shrines) {
        if (Math.abs(p.x - sh.x) < 22 && Math.abs(b.bottom - sh.y) < 8) return { hint: '{up} descansar', act: () => s.rest(sh) };
      }
      const c = this.cobrador;
      if (c && Math.abs(p.x - c.x) < 42 && Math.abs(b.bottom - c.y) < 10) return { hint: '{up} falar com o Cobrador', act: () => s.openShop() };
    }
    return null;
  }

  // pega o que o cavaleiro encostar (relíquias e memórias)
  touch(p: Player) {
    const s = this.scene;
    const b = p.body;
    for (const r of this.relics) {
      if (!r.sprite || progress.abilities.has(r.kind)) continue;
      if (Math.abs(p.x - r.x) < 16 && b.top < r.y - 30 && b.bottom > r.y - 66) s.takeRelic(r);
    }
    for (const m of this.memories) {
      if (m.taken) continue;
      if (Math.abs(p.x - m.x) < 14 && m.y > b.top - 8 && m.y < b.bottom + 6) {
        m.taken = true;
        s.takeMemory(m);
      }
    }
  }

  // a relíquia sobe e se desfaz em luz no cavaleiro
  consumeRelic(r: Relic, onto: { x: number; y: number }) {
    const s = this.scene;
    const spr = r.sprite;
    const glow = r.glow;
    r.sprite = null;
    r.glow = null;
    if (!spr || !glow) return;
    s.tweens.add({ targets: [spr, glow], y: '-=18', duration: 700, ease: 'Sine.easeOut' });
    s.tweens.add({ targets: glow, scale: 4, alpha: 0.9, duration: 700 });
    s.tweens.add({
      targets: [spr, glow],
      x: onto.x,
      y: onto.y,
      alpha: 0,
      delay: 900,
      duration: 380,
      ease: 'Quad.easeIn',
      onComplete: () => {
        spr.destroy();
        glow.destroy();
      },
    });
  }

  consumeMemory(m: MemoryOrb) {
    const s = this.scene;
    s.tweens.add({ targets: m.sprite, scale: 1.8, alpha: 0, duration: 420, onComplete: () => m.sprite.destroy() });
    s.tweens.add({ targets: m.glow, scale: 5, alpha: 0, duration: 600, onComplete: () => m.glow.destroy() });
  }

  update(time: number, p: Player) {
    for (const r of this.relics) {
      if (!r.sprite || !r.glow) continue;
      const y = r.y - 50 + Math.sin(time * 0.0024) * 3;
      r.sprite.y = y;
      r.glow.y = y;
      r.glow.alpha = 0.5 + Math.sin(time * 0.004) * 0.12;
    }
    for (const m of this.memories) {
      if (m.taken) continue;
      const y = m.y + Math.sin(time * 0.003 + m.phase) * 2.5;
      m.sprite.y = y;
      m.glow.y = y;
      m.glow.alpha = 0.55 + Math.sin(time * 0.005 + m.phase) * 0.15;
    }
    for (const f of this.flickers) {
      const a = Math.sin(time * 0.012 + f.phase) * 0.6 + Math.sin(time * 0.031 + f.phase * 1.7) * 0.4;
      f.img.alpha = f.base * (0.84 + 0.16 * a);
    }
    const c = this.cobrador;
    if (c) {
      const left = p.x < c.x;
      face(c.sprite, left);
      c.light.x = c.x + (left ? -23 : 23);
    }
  }
}

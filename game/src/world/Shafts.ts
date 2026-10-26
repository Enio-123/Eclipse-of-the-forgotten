import Phaser from 'phaser';
import { TILE } from '../config';
import type { Level3 } from '../systems/Graphics';
import { BG } from './Backdrop';
import type { Level, Theme } from './Level';

// Fachos de luz do EXTREME: a luz que entra pelo alto (vitrais da nave, frestas das catacumbas,
// grades da prisão, o sol da lembrança) e atravessa o ar da sala por trás da pedra jogável, com poeira
// dançando dentro. Onde o facho toca o chão fica uma poça de luz: é um brilho comum, então o mapa de
// luz da sala acende a pedra em volta, com sombra. Tudo atrás do cenário jogável: nunca cobre o
// cavaleiro, os inimigos nem os golpes.

interface Style {
  colors: number[];
  alpha: number;
  // distância média entre fachos (px do mundo)
  every: number;
  // inclinação (radianos); a luz vem sempre do mesmo lado da sala
  angle: number;
  width: [number, number];
  // força da poça de luz no chão (0: sem poça)
  pool: number;
  dust: number;
}

const STYLES: Partial<Record<Theme | 'abyss', Style>> = {
  nave: { colors: [0xffd9a0, 0xff9a7a, 0x9db6ff, 0xffe8bc, 0xc7a4ff], alpha: 0.15, every: 230, angle: 0.3, width: [34, 64], pool: 0.34, dust: 0xffe6c0 },
  catacomb: { colors: [0xc4d2e6, 0xb8c8de], alpha: 0.11, every: 330, angle: 0.16, width: [18, 34], pool: 0.2, dust: 0xd8e2f0 },
  prison: { colors: [0xaec2dc, 0xc2cfe2], alpha: 0.12, every: 280, angle: 0.2, width: [18, 32], pool: 0.22, dust: 0xd0dae8 },
  // fosso e abismo: a pouca luz que desce do poço já chega roxa, quase reta
  abyss: { colors: [0x9c7ed8, 0xb59de6], alpha: 0.09, every: 260, angle: 0.06, width: [16, 30], pool: 0.18, dust: 0xc8b0f0 },
  memory: { colors: [0xfff0c4, 0xffe4a8], alpha: 0.11, every: 260, angle: 0.42, width: [60, 110], pool: 0, dust: 0xfff6d8 },
};

const KEY = 'x-shaft';

// facho branco: borda macia, miolo um pouco mais forte, riscos verticais de poeira e some embaixo
function makeTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(KEY)) return;
  const W = 64;
  const H = 256;
  const tex = scene.textures.createCanvas(KEY, W, H);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(W, H);
  const streak = new Float32Array(W);
  for (let x = 0; x < W; x++) streak[x] = 0.75 + 0.25 * Math.sin(x * 1.7) * Math.sin(x * 0.53 + 1.3);
  for (let y = 0; y < H; y++) {
    const v = y / H;
    // forte até perto do chão e some na ponta (a pedra cobre o que passar dela)
    const end = Math.min(1, Math.max(0, (v - 0.75) / 0.25));
    const fall = Math.min(1, v / 0.06) * (1 - end * end * (3 - 2 * end)) * (1 - 0.35 * v);
    for (let x = 0; x < W; x++) {
      const u = Math.abs(x / (W - 1) - 0.5) * 2;
      const edge = 1 - u * u * (3 - 2 * u);
      const a = edge * (0.7 + 0.3 * edge) * fall * streak[x];
      const i = (y * W + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

interface Shaft {
  img: Phaser.GameObjects.Image;
  a: number;
  rot: number;
  phase: number;
}

function soften(c: number) {
  const a = Phaser.Display.Color.IntegerToRGB(c);
  const k = 0.55;
  return Phaser.Display.Color.GetColor(a.r + (255 - a.r) * k, a.g + (242 - a.g) * k, a.b + (220 - a.b) * k);
}

// sorteio que repete na mesma sala
function seeded(s: number) {
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export class Shafts {
  private list: Shaft[] = [];
  private pools: Phaser.GameObjects.Image[] = [];
  private dust: Phaser.GameObjects.Particles.ParticleEmitter[] = [];

  constructor(private scene: Phaser.Scene, level: Level, room: string, particles: Level3) {
    const st = STYLES[room === 'fosso' || room === 'abismo' ? 'abyss' : level.theme];
    if (!st) return;
    makeTexture(scene);
    const rnd = seeded([...room].reduce((a, c) => a + c.charCodeAt(0), 0) * 97 + 11);
    // a luz entra pelo lado mais aberto: na dúvida, da esquerda
    const dir = rnd() < 0.5 ? 1 : -1;
    const W = level.widthPx;
    for (let x = st.every * (0.35 + rnd() * 0.5); x < W - 40; x += st.every * (0.7 + rnd() * 0.6)) {
      const shaft = this.place(level, x, st, dir, rnd);
      if (!shaft) continue;
      const { top, hit, len, width, color } = shaft;
      const rot = -dir * st.angle;
      const a = st.alpha * (0.7 + rnd() * 0.5);
      const img = scene.add
        .image(top.x, top.y, KEY)
        .setOrigin(0.5, 0)
        .setRotation(rot)
        .setScale(width / 64, (len * 1.08) / 256)
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(BG.beams + 0.7)
        .setAlpha(a);
      this.list.push({ img, a, rot, phase: rnd() * 6.28 });
      if (st.pool > 0 && hit.floor) {
        // poça de luz no chão: o mapa de luz lê os brilhos da sala e acende a pedra em volta. A cor
        // vem puxada para o branco quente: chão colorido demais parece perigo
        const pool = scene.add
          .image(hit.x, hit.y - 2, 'glow')
          .setTint(soften(color))
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(1)
          .setScale(Math.max(1.2, width / 30), 0.55)
          .setAlpha(st.pool);
        this.pools.push(pool);
      }
      if (particles > 0) this.addDust(top, rot, len, width, st.dust, particles);
    }
  }

  // acha o alto (teto ou céu) na coluna e desce inclinado até a primeira pedra
  private place(L: Level, x: number, st: Style, dir: number, rnd: () => number) {
    const tx = Math.floor(x / TILE);
    if (tx < 1 || tx >= L.w - 1) return null;
    // o primeiro vão de cima para baixo nesta coluna
    let ty = 0;
    while (ty < L.h && !L.openCell(tx, ty)) ty++;
    if (ty >= L.h - 4) return null;
    const top = { x: x, y: ty * TILE };
    const sx = Math.sin(st.angle) * dir;
    const sy = Math.cos(st.angle);
    let len = 0;
    let floor = false;
    for (let d = 8; d < 900; d += 4) {
      const cx = Math.floor((top.x + sx * d) / TILE);
      const cy = Math.floor((top.y + sy * d) / TILE);
      if (cx < 0 || cx >= L.w || cy >= L.h) {
        len = d;
        break;
      }
      if (!L.openCell(cx, cy)) {
        len = d;
        floor = L.solidCell(cx, cy) && L.openCell(cx, cy - 1);
        break;
      }
      len = d;
    }
    if (len < 90) return null;
    const width = st.width[0] + rnd() * (st.width[1] - st.width[0]);
    const color = st.colors[Math.floor(rnd() * st.colors.length)];
    return { top, len, width, color, hit: { x: top.x + sx * len, y: top.y + sy * len, floor } };
  }

  private addDust(top: { x: number; y: number }, rot: number, len: number, width: number, tint: number, particles: Level3) {
    const s = Math.sin(-rot);
    const c = Math.cos(-rot);
    // ponto ao acaso dentro do facho (mais denso no meio da altura)
    const zone = {
      getRandomPoint: (p: Phaser.Types.Math.Vector2Like) => {
        const t = 0.08 + Math.random() * 0.72;
        const across = (Math.random() - 0.5) * width * 0.8 * (0.6 + t);
        const d = t * len;
        p.x = top.x + s * d + c * across;
        p.y = top.y + c * d - s * across;
        return p;
      },
    };
    const em = this.scene.add
      .particles(0, 0, 'px', {
        lifespan: { min: 2600, max: 5200 },
        speedX: { min: -5, max: 5 },
        speedY: { min: -4, max: 3 },
        scale: { min: 0.5, max: 1.1 },
        alpha: { values: [0, 0.75, 0.55, 0], interpolation: 'catmull' },
        tint,
        blendMode: Phaser.BlendModes.ADD,
        frequency: particles >= 2 ? 160 : 380,
        emitZone: { type: 'random', source: zone },
      })
      .setDepth(BG.beams + 0.75);
    this.dust.push(em);
  }

  update(time: number) {
    for (const f of this.list) {
      // a luz respira devagar, como nuvem passando lá fora
      const k = 0.78 + 0.22 * Math.sin(time * 0.00042 + f.phase) * Math.sin(time * 0.00017 + f.phase * 1.7);
      f.img.setAlpha(f.a * k);
      f.img.setRotation(f.rot + Math.sin(time * 0.00021 + f.phase) * 0.006);
    }
  }

  destroy() {
    for (const f of this.list) f.img.destroy();
    for (const p of this.pools) p.destroy();
    for (const d of this.dust) d.destroy();
    this.list = [];
    this.pools = [];
    this.dust = [];
  }
}

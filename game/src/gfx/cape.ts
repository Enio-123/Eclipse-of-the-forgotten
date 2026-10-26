import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import { DEPTH } from '../world/Decor';

interface Node {
  x: number;
  y: number;
}

const N = 7;
const RED = 0xb4222b;
const DARK = 0x6c1019;
const LIGHT = 0xe2483f;

// A Capa de Arielle: o retalho vermelho amarrado no pescoço dele. Fechado, é uma faixa de pano que
// bate atrás dele com o vento e o embalo; planando, o retalho abre por cima dos ombros como uma vela
// cheia de ar (e brilha de leve, como as memórias). Três bordas de pontos: a de cima, a do meio e a de
// baixo; cada ponto corre atrás do lugar dele no desenho, a ponta mais solta que o nó
export class CapeFx {
  private g: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Image;
  private edges: Node[][] = [];
  private open = 0;
  private t = 0;
  private side: 1 | -1;
  // onde o nó estava na última vez que o pano andou (para ver um salto: teletransporte, volta ao chão seguro)
  private last: Node | null = null;

  constructor(scene: Phaser.Scene, private p: Player) {
    this.g = scene.add.graphics().setDepth(DEPTH.player - 0.1);
    this.glow = scene.add.image(0, 0, 'glow').setTint(0xff9a80).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(DEPTH.player - 0.15);
    this.side = p.facing;
    const a = this.anchor();
    for (let k = 0; k < 3; k++) {
      const e: Node[] = [];
      for (let i = 0; i < N; i++) e.push({ x: a.x - p.facing * i * 2, y: a.y + i * 1.5 });
      this.edges.push(e);
    }
  }

  // o nó, no pescoço (agachado, mais baixo)
  private anchor() {
    const p = this.p;
    const b = p.body;
    return { x: p.sprite.x + p.facing * 1, y: b.bottom - (b.height < 30 ? 21 : 31) };
  }

  update(dt: number, windX: number) {
    const p = this.p;
    const b = p.body;
    this.t += dt;
    const hidden = p.dead || !p.sprite.visible || p.sprite.alpha < 0.2 || p.veiling || p.diving;
    this.g.setVisible(!hidden);
    this.glow.setVisible(!hidden);
    if (hidden) return;
    this.open += ((p.gliding ? 1 : 0) - this.open) * Math.min(1, dt * (p.gliding ? 9 : 6));
    if (p.facing !== this.side) this.side = p.facing;
    const f = this.side;
    const a = this.anchor();
    // o nó saltou de lugar (ou andou muito escondido, no véu ou mergulhado): o pano vai junto, sem
    // esticar uma faixa vermelha pela tela até alcançar
    if (this.last && Math.hypot(a.x - this.last.x, a.y - this.last.y) > 40) {
      const dx = a.x - this.last.x;
      const dy = a.y - this.last.y;
      for (const e of this.edges) for (const n of e) {
        n.x += dx;
        n.y += dy;
      }
    }
    this.last = { x: a.x, y: a.y };
    const vx = b.velocity.x;
    const vy = b.velocity.y;
    const sp = Math.min(1, Math.abs(vx) / 230);
    const fall = Phaser.Math.Clamp(vy / 420, -1, 1);
    const o = this.open;
    // ângulo de cada borda aberta (a partir de "para trás", negativo é para cima) e o comprimento
    const openAng = [-1.15, -0.62, -0.18];
    for (let k = 0; k < 3; k++) {
      const e = this.edges[k];
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        // fechado: as pontas caem atrás e sobem com a corrida, levantam na queda e descem na subida
        const cx = -f * (2 + u * (9 + 7 * sp + k * 1.2));
        const cy = (1.5 + u * (8 - k * 0.8)) * (1 - 0.75 * sp) - u * 9 * Math.max(0, fall) + u * 5 * Math.max(0, -fall) + k * 1.1;
        // aberto: três raios em leque por cima e atrás dos ombros
        const r = u * (22 + k * 2);
        const ox = -f * Math.cos(openAng[k]) * r;
        const oy = Math.sin(openAng[k]) * r - 2 * u;
        // o pano tremula (mais na ponta e mais aberto) e o vento puxa
        const wave = Math.sin(this.t * (13 + 5 * o) + u * 6 + k * 1.3) * (0.6 + 1.6 * o) * u;
        const tx = a.x + cx + (ox - cx) * o + windX * 0.05 * u - vx * 0.012 * u;
        const ty = a.y + cy + (oy - cy) * o + wave;
        if (i === 0) {
          e[i].x = a.x;
          e[i].y = a.y + k * 0.8;
          continue;
        }
        const rate = Math.min(1, dt * (34 - 22 * u));
        e[i].x += (tx - e[i].x) * rate;
        e[i].y += (ty - e[i].y) * rate;
      }
    }
    this.draw(a, o);
  }

  private draw(a: Node, o: number) {
    const g = this.g;
    g.clear();
    const [top, mid, low] = this.edges;
    // o pano todo: a borda de cima indo, a de baixo voltando
    const poly = (e1: Node[], e2: Node[]) => [...e1.map((n) => new Phaser.Math.Vector2(n.x, n.y)), ...e2.slice().reverse().map((n) => new Phaser.Math.Vector2(n.x, n.y))];
    g.fillStyle(DARK, 1).fillPoints(poly(mid, low), true);
    g.fillStyle(RED, 1).fillPoints(poly(top, mid), true);
    // a borda de cima pega luz; a ponta esfiapada
    g.lineStyle(1, LIGHT, 0.85);
    for (let i = 0; i < N - 1; i++) g.lineBetween(top[i].x, top[i].y, top[i + 1].x, top[i + 1].y);
    const tip = low[N - 1];
    g.lineStyle(1, DARK, 1).lineBetween(tip.x, tip.y, tip.x + (low[N - 1].x - low[N - 2].x) * 0.6, tip.y + 1.5);
    // o nó
    g.fillStyle(DARK, 1).fillRect(a.x - 1.5, a.y - 1, 3, 3);
    g.fillStyle(RED, 1).fillRect(a.x - 1, a.y - 1, 2, 2);
    // aberto, o retalho brilha de leve por trás
    const c = mid[Math.floor(N / 2)];
    this.glow.setPosition(c.x, c.y).setScale(0.8 + o * 1.4).setAlpha(o * 0.22);
  }

  destroy() {
    this.g.destroy();
    this.glow.destroy();
  }
}

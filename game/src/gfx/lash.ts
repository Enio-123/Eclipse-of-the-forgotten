import Phaser from 'phaser';

// O desenho dos golpes que não usam o arco de corte: o chicote de tinta do Mago do Véu e a corrente.
// O cavaleiro guarda a pose de cada quadro para o espelho da Câmara e o Eco repetirem com as cores deles.
export interface LashPose {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  // tempo do golpe e o tamanho da onda que corre do cabo à ponta (só no chicote)
  t: number;
  wave: number;
  whip: boolean;
}

export interface LashLook {
  body: number;
  edge: number;
  tip: number;
  hook?: number;
  alpha?: number;
}

export const WHIP_LOOK: LashLook = { body: 0x140c1e, edge: 0xb27fea, tip: 0xe2c8ff };
export const CHAIN_LOOK: LashLook = { body: 0x272c3a, edge: 0x8a93a8, tip: 0xbcc6da, hook: 0x3a3f4e };

type G = Phaser.GameObjects.Graphics;

export function drawLash(g: G, p: LashPose, look?: LashLook) {
  if (p.whip) drawWhip(g, p, look);
  else drawChain(g, p.ax, p.ay, p.bx, p.by, look);
}

// corpo escuro e grosso perto do cajado, fino na ponta; o brilho por cima
export function drawWhip(g: G, p: LashPose, look: LashLook = WHIP_LOOK) {
  const { ax, ay, bx, by, t, wave } = p;
  const a = look.alpha ?? 1;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const nx = -(by - ay) / len;
  const ny = (bx - ax) / len;
  const n = Math.max(6, Math.floor(len / 4));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const off = Math.sin(u * Math.PI) * (wave + 2 * Math.sin(u * 9 - t * 30));
    pts.push({ x: ax + (bx - ax) * u + nx * off, y: ay + (by - ay) * u + ny * off });
  }
  for (let i = 0; i < n; i++) {
    const w = 3.4 - (i / n) * 2.4;
    g.lineStyle(w, look.body, a).lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
  }
  for (let i = 0; i < n; i += 2) {
    g.lineStyle(1, look.edge, (0.75 * (1 - i / n) + 0.2) * a).lineBetween(pts[i].x, pts[i].y - 0.6, pts[i + 1].x, pts[i + 1].y - 0.6);
  }
  g.fillStyle(look.body, a).fillCircle(bx, by, 2.2);
  g.fillStyle(look.tip, 0.9 * a).fillCircle(bx, by - 0.5, 0.9);
}

// os elos e, na ponta, um gancho de ferro virado para trás
export function drawChain(g: G, ax: number, ay: number, bx: number, by: number, look: LashLook = CHAIN_LOOK) {
  const a = look.alpha ?? 1;
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(2, Math.floor(len / 5));
  const ux = (bx - ax) / (len || 1);
  const uy = (by - ay) / (len || 1);
  g.lineStyle(2, look.body, a).lineBetween(ax, ay, bx, by);
  g.fillStyle(look.edge, a);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    if (i % 2) g.fillRect(Math.round(x - ux), Math.round(y - uy), 2, 2);
    else g.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  const px = -uy;
  const py = ux;
  g.fillStyle(look.hook ?? look.body, a).fillTriangle(bx + ux * 4, by + uy * 4, bx - ux * 3 + px * 4, by - uy * 3 + py * 4, bx - ux * 3 - px * 4, by - uy * 3 - py * 4);
  g.fillStyle(look.tip, a).fillRect(Math.round(bx + ux * 2), Math.round(by + uy * 2), 1, 1);
}

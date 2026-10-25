import Phaser from 'phaser';
import { DEPTH } from '../world/Decor';
import type { GameScene } from '../scenes/GameScene';

// cores do abismo: o Véu Abissal, a sombra que guarda as moedas e a Sombra do Carrasco
export const ABYSS = { ink: 0x09070d, purple: 0x7029b8, magenta: 0xb52a9b, lilac: 0xd8b7ff };

// pixels da imagem por pixel do mundo nas texturas do Véu (traço liso, sem serrilhado)
const K = 4;

function hdCanvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * K);
  c.height = Math.ceil(h * K);
  const g = c.getContext('2d')!;
  g.scale(K, K);
  draw(g);
  scene.textures.addCanvas(key, c);
  scene.registry.set(`${key}-scale`, 1 / K);
}

const rgba = (c: number, a: number) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

// a massa líquida, de lado, com a cabeça (mais grossa) para a direita
function blobPath(g: CanvasRenderingContext2D) {
  g.beginPath();
  g.moveTo(1.5, 11);
  g.bezierCurveTo(9, 9.4, 16, 4.2, 26, 3.6);
  g.bezierCurveTo(35, 3, 42.5, 6.2, 42.5, 10.6);
  g.bezierCurveTo(42.5, 15, 36, 17.6, 27, 17.4);
  g.bezierCurveTo(17, 17.2, 9, 13.4, 1.5, 11);
  g.closePath();
}

// Texturas do Véu: a massa, a gota, a máscara que segue na frente e a membrana abissal
export function buildVeilTextures(scene: Phaser.Scene) {
  hdCanvas(scene, 'veil-blob', 44, 20, (g) => {
    // aura roxa por fora (a tinta preta some no escuro sem ela)
    g.save();
    g.shadowColor = rgba(ABYSS.purple, 0.8);
    g.shadowBlur = 2.6 * K;
    blobPath(g);
    g.fillStyle = rgba(ABYSS.ink, 1);
    g.fill();
    g.restore();
    g.save();
    blobPath(g);
    g.clip();
    // reflexo roxo por dentro da cabeça e um fundo magenta mais abaixo
    let rg = g.createRadialGradient(31, 7.5, 0.5, 31, 7.5, 13);
    rg.addColorStop(0, rgba(ABYSS.purple, 0.62));
    rg.addColorStop(1, rgba(ABYSS.purple, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, 44, 20);
    rg = g.createRadialGradient(35, 14, 0.2, 35, 14, 5.5);
    rg.addColorStop(0, rgba(ABYSS.magenta, 0.5));
    rg.addColorStop(1, rgba(ABYSS.magenta, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, 44, 20);
    // volume: a barriga mais funda que o dorso
    const lg = g.createLinearGradient(0, 4, 0, 18);
    lg.addColorStop(0.35, rgba(ABYSS.ink, 0));
    lg.addColorStop(1, rgba(ABYSS.ink, 0.7));
    g.fillStyle = lg;
    g.fillRect(0, 0, 44, 20);
    g.restore();
    // borda acesa no dorso, brilho lilás na cabeça e respingos de luz
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(6, 9.6);
    g.bezierCurveTo(14, 6.4, 18, 4.2, 26, 3.6);
    g.bezierCurveTo(35, 3, 42.5, 6.2, 42.5, 10.6);
    g.strokeStyle = rgba(ABYSS.purple, 0.95);
    g.lineWidth = 0.9;
    g.stroke();
    g.beginPath();
    g.moveTo(27, 4.8);
    g.bezierCurveTo(33, 4.4, 38, 5.8, 40.2, 8.4);
    g.strokeStyle = rgba(ABYSS.lilac, 0.85);
    g.lineWidth = 0.55;
    g.stroke();
    g.beginPath();
    g.moveTo(22, 16.6);
    g.bezierCurveTo(28, 17.4, 35, 16.8, 40, 13.6);
    g.strokeStyle = rgba(ABYSS.magenta, 0.55);
    g.lineWidth = 0.5;
    g.stroke();
    g.fillStyle = rgba(ABYSS.lilac, 0.95);
    for (const [x, y, r] of [[37.4, 7.1, 0.75], [30.2, 5.3, 0.42], [16, 8.6, 0.32]] as const) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
  hdCanvas(scene, 'veil-drop', 6, 6, (g) => {
    g.save();
    g.shadowColor = rgba(ABYSS.purple, 0.7);
    g.shadowBlur = 1.2 * K;
    g.beginPath();
    g.arc(3, 3.1, 2, 0, Math.PI * 2);
    g.fillStyle = rgba(ABYSS.ink, 1);
    g.fill();
    g.restore();
    g.beginPath();
    g.arc(3, 3.1, 1.85, Math.PI * 1.05, Math.PI * 1.95);
    g.strokeStyle = rgba(ABYSS.purple, 0.9);
    g.lineWidth = 0.45;
    g.stroke();
    g.beginPath();
    g.arc(2.3, 2.3, 0.5, 0, Math.PI * 2);
    g.fillStyle = rgba(ABYSS.lilac, 0.95);
    g.fill();
  });
  // a máscara de porcelana com a rachadura de ouro: é o que fica reconhecível no meio da tinta
  hdCanvas(scene, 'veil-mask', 11, 13, (g) => {
    g.save();
    g.shadowColor = rgba(ABYSS.purple, 0.7);
    g.shadowBlur = 1.6 * K;
    g.beginPath();
    g.ellipse(5.5, 6.5, 4.1, 5.3, 0, 0, Math.PI * 2);
    g.fillStyle = '#e9e2d0';
    g.fill();
    g.restore();
    const sh = g.createLinearGradient(2, 2, 9, 12);
    sh.addColorStop(0.45, 'rgba(189,180,162,0)');
    sh.addColorStop(1, 'rgba(150,140,128,0.75)');
    g.beginPath();
    g.ellipse(5.5, 6.5, 4.1, 5.3, 0, 0, Math.PI * 2);
    g.fillStyle = sh;
    g.fill();
    g.lineWidth = 0.7;
    g.strokeStyle = rgba(ABYSS.ink, 1);
    g.stroke();
    g.fillStyle = '#120d18';
    for (const [x, r] of [[3.6, 0.42], [7.4, -0.42]] as const) {
      g.beginPath();
      g.ellipse(x, 6, 1.05, 1.6, r, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.moveTo(6.2, 1.4);
    g.lineTo(5.6, 3.6);
    g.lineTo(6.6, 5.2);
    g.lineTo(5.8, 8);
    g.lineTo(6.7, 11.2);
    g.strokeStyle = '#d8a640';
    g.lineWidth = 0.5;
    g.lineJoin = 'round';
    g.stroke();
  });
  // membrana abissal: uma pele de tinta em pé, com veias roxas; repete na vertical a cada 48
  hdCanvas(scene, 'membrane', 16, 48, (g) => {
    const lg = g.createLinearGradient(0, 0, 16, 0);
    lg.addColorStop(0, rgba(ABYSS.purple, 0.5));
    lg.addColorStop(0.16, rgba(ABYSS.ink, 0.9));
    lg.addColorStop(0.5, rgba(ABYSS.ink, 0.96));
    lg.addColorStop(0.84, rgba(ABYSS.ink, 0.9));
    lg.addColorStop(1, rgba(ABYSS.purple, 0.5));
    g.fillStyle = lg;
    g.fillRect(0, 0, 16, 48);
    const wave = (x0: number, amp: number, n: number, ph: number) => (y: number) => x0 + amp * Math.sin((y / 48) * Math.PI * 2 * n + ph);
    const vein = (f: (y: number) => number, c: string, w: number) => {
      g.beginPath();
      for (let y = 0; y <= 48; y += 0.5) {
        if (y === 0) g.moveTo(f(y), y);
        else g.lineTo(f(y), y);
      }
      g.strokeStyle = c;
      g.lineWidth = w;
      g.stroke();
    };
    vein(wave(5, 1.6, 1, 0.4), rgba(ABYSS.purple, 0.6), 0.7);
    vein(wave(10.5, 1.9, 2, 2.1), rgba(ABYSS.purple, 0.45), 0.55);
    vein(wave(8, 1.1, 1, 3.6), rgba(ABYSS.magenta, 0.35), 0.4);
    vein(wave(1.1, 0.5, 2, 0), rgba(ABYSS.lilac, 0.55), 0.4);
    vein(wave(14.9, 0.5, 2, 1.7), rgba(ABYSS.lilac, 0.55), 0.4);
    for (const [x, y, r] of [[5.6, 9, 0.8], [10.9, 30, 0.7], [7.6, 41, 0.5]] as const) {
      const rg = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
      rg.addColorStop(0, rgba(ABYSS.lilac, 0.85));
      rg.addColorStop(0.4, rgba(ABYSS.magenta, 0.5));
      rg.addColorStop(1, rgba(ABYSS.magenta, 0));
      g.fillStyle = rg;
      g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
  });
}

const lerpColor = (a: number, b: number, t: number) => {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.ValueToColor(a),
    Phaser.Display.Color.ValueToColor(b),
    100,
    Math.round(Phaser.Math.Clamp(t, 0, 1) * 100),
  );
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
};

interface Drop {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  // volta para o corpo depois deste tempo; as que não voltam caem e respingam no chão
  back: number;
  falls: boolean;
}

// tempos das três etapas (s): dissolver e recompor são rápidos para não atrapalhar o controle
const DISSOLVE = 0.06;
const FORM = 0.17;
const TRAIL = 0.16;
// cor do cavaleiro no meio da tinta (multiplica a folha)
const INKED = 0x3b2457;

// O Véu Abissal: no dash o cavaleiro vira uma massa de tinta viva que se alonga na direção do
// movimento, com tentáculos, gotas que se soltam e voltam, um rastro que escorre e a máscara na
// frente; no fim a tinta sobe e o cavaleiro se refaz no mesmo lugar. É só aparência: quem move o
// corpo é o dash do Player, que continua igual (direção, velocidade, controle).
export class VeilFx {
  private readonly blob: Phaser.GameObjects.Image;
  private readonly mask: Phaser.GameObjects.Image;
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly haze: Phaser.GameObjects.Graphics;
  private readonly rings: Phaser.GameObjects.Graphics;
  private readonly blobK: number;
  private readonly maskK: number;
  private readonly dropK: number;
  private phase: 'off' | 'flow' | 'form' = 'off';
  private t = 0;
  private age = 0;
  private dir: 1 | -1 = 1;
  private x = 0;
  private y = 0;
  private feet = 0;
  private sx = 1;
  private sy = 1;
  private dropT = 0;
  private moteT = 0;
  private hist: { x: number; y: number; t: number }[] = [];
  private drops: Drop[] = [];
  private ringList: { x: number; y: number; t: number; big: boolean }[] = [];

  constructor(private scene: GameScene) {
    buildVeilTextures(scene);
    const reg = scene.registry;
    this.blobK = (reg.get('veil-blob-scale') as number) ?? 1;
    this.maskK = (reg.get('veil-mask-scale') as number) ?? 1;
    this.dropK = (reg.get('veil-drop-scale') as number) ?? 1;
    this.trail = scene.add.graphics().setDepth(DEPTH.player - 0.06);
    this.haze = scene.add.graphics().setDepth(DEPTH.player + 0.05).setBlendMode(Phaser.BlendModes.ADD);
    this.rings = scene.add.graphics().setDepth(DEPTH.player + 0.06).setBlendMode(Phaser.BlendModes.ADD);
    this.blob = scene.add.image(0, 0, 'veil-blob').setDepth(DEPTH.player - 0.02).setVisible(false);
    this.mask = scene.add.image(0, 0, 'veil-mask').setDepth(DEPTH.player + 0.02).setVisible(false);
  }

  get active() {
    return this.phase !== 'off' || this.drops.length > 0 || this.hist.length > 0 || this.ringList.length > 0;
  }

  // a etapa em que o corpo está (os testes olham)
  get stage() {
    if (this.phase === 'flow') return this.t < DISSOLVE ? 'dissolve' : 'flow';
    return this.phase;
  }

  // começa a dissolver onde o cavaleiro está
  begin(s: Phaser.GameObjects.Sprite, x: number, feet: number, dir: 1 | -1) {
    if (this.phase === 'off') {
      this.sx = s.scaleX;
      this.sy = s.scaleY;
    }
    this.phase = 'flow';
    this.t = 0;
    this.dir = dir;
    this.place(x, feet);
    this.hist.length = 0;
    this.dropT = 0;
    this.moteT = 0;
    this.blob.setVisible(true).setAlpha(1).setFlipX(dir < 0).setScale(this.blobK * 0.35);
    this.mask.setVisible(true).setAlpha(0).setFlipX(dir < 0);
    this.ring(x, feet - 14, false);
    // a tinta espirra para fora e volta logo
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * (0.1 + 0.8 * Math.random());
      const v = 70 + Math.random() * 90;
      this.spawnDrop(x, feet - 12, Math.cos(a) * v, Math.sin(a) * v, 0.07 + Math.random() * 0.05, false);
    }
  }

  // acaba o dash: a tinta sobe e o cavaleiro se refaz
  finish(x: number, feet: number) {
    if (this.phase !== 'flow') return;
    this.place(x, feet);
    this.phase = 'form';
    this.t = 0;
    this.ring(x, feet - 20, true);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * 8;
      this.spawnDrop(x + Math.cos(a) * r, feet - 20 + Math.sin(a) * r * 0.8, -Math.cos(a) * 40, -Math.sin(a) * 40, 0, false);
    }
  }

  private place(x: number, feet: number) {
    this.x = x;
    this.feet = feet;
    this.y = feet - 9;
  }

  private ring(x: number, y: number, big: boolean) {
    this.ringList.push({ x, y, t: 0, big });
  }

  private spawnDrop(x: number, y: number, vx: number, vy: number, back: number, falls: boolean) {
    if (this.drops.length >= 12) return;
    const img = this.scene.add.image(x, y, 'veil-drop').setDepth(DEPTH.player - 0.01).setScale(this.dropK * (0.7 + Math.random() * 0.5));
    this.drops.push({ img, x, y, vx, vy, t: 0, back, falls });
  }

  // chamado todo quadro pelo Player depois de posicionar o sprite (x e pés do corpo)
  update(dt: number, s: Phaser.GameObjects.Sprite, x: number, feet: number) {
    this.age += dt;
    if (this.phase === 'flow') {
      this.t += dt;
      this.place(x, feet);
      this.flow(dt, s);
    } else if (this.phase === 'form') {
      this.t += dt;
      this.form(s);
    }
    this.updateDrops(dt);
    this.drawTrail(dt);
    this.drawRings(dt);
  }

  private flow(dt: number, s: Phaser.GameObjects.Sprite) {
    const d = Phaser.Math.Easing.Cubic.Out(Math.min(1, this.t / DISSOLVE));
    // o corpo derrete para dentro da tinta, preso pelos pés
    s.setScale(this.sx * (1 + 0.45 * d), this.sy * (1 - 0.8 * d));
    s.setTint(lerpColor(0xffffff, INKED, d));
    s.setAlpha(s.alpha * (1 - d));
    const w = Math.sin(this.age * 38);
    const stretch = 0.92 + 0.26 * Math.min(1, this.t / 0.1);
    const grow = 0.35 + 0.65 * d;
    this.blob
      .setPosition(this.x - this.dir * 2, this.y + Math.sin(this.age * 23) * 0.8)
      .setScale(this.blobK * grow * stretch * (1 + 0.1 * w), this.blobK * grow * (1 - 0.09 * w))
      .setFlipX(this.dir < 0)
      .setAlpha(1);
    // a máscara vai na cabeça da tinta, inclinada para a frente
    this.mask
      .setPosition(this.x + this.dir * 13, this.y - 4 + Math.sin(this.age * 30) * 0.7)
      .setRotation(this.dir * 0.32)
      .setScale(this.maskK * 0.92)
      .setFlipX(this.dir < 0)
      .setAlpha(Math.min(1, this.t / (DISSOLVE * 0.8)));
    this.hist.unshift({ x: this.x - this.dir * 14, y: this.y + 1, t: 0 });
    // gotas soltando do corpo: a maioria volta, uma ou outra cai e respinga
    this.dropT -= dt;
    if (this.dropT <= 0 && this.t > DISSOLVE * 0.5) {
      this.dropT = 0.03;
      const falls = Math.random() < 0.3;
      this.spawnDrop(
        this.x - this.dir * (4 + Math.random() * 12),
        this.y + (Math.random() - 0.5) * 10,
        -this.dir * (50 + Math.random() * 90),
        (Math.random() - 0.6) * 140,
        falls ? 99 : 0.06 + Math.random() * 0.06,
        falls,
      );
    }
    this.moteT -= dt;
    if (this.moteT <= 0) {
      this.moteT = 0.05;
      this.scene.echoMotes(this.x - this.dir * 8, this.y - 4, false);
    }
  }

  private form(s: Phaser.GameObjects.Sprite) {
    const f = Math.min(1, this.t / FORM);
    const k = Phaser.Math.Easing.Back.Out(f, 2.2);
    s.setScale(this.sx * (1.35 - 0.35 * k), this.sy * (0.3 + 0.7 * k));
    s.setTint(lerpColor(INKED, 0xffffff, Phaser.Math.Easing.Quadratic.In(f)));
    s.setAlpha(s.alpha * Math.min(1, f * 2.4));
    // a tinta sobe em coluna e entra no corpo
    this.blob
      .setPosition(this.x, this.feet - 8 - 10 * f)
      .setScale(this.blobK * (1 - 0.72 * f), this.blobK * (1 + 0.7 * f))
      .setAlpha(1 - Phaser.Math.Easing.Quadratic.In(f));
    this.mask
      .setPosition(this.x + this.dir * (13 - 11 * f), this.feet - 13 - 21 * f)
      .setRotation(this.dir * 0.32 * (1 - f))
      .setAlpha(Math.max(0, 1 - f * 1.6));
    if (f >= 1) {
      this.phase = 'off';
      s.setScale(this.sx, this.sy);
      s.clearTint();
      this.blob.setVisible(false);
      this.mask.setVisible(false);
    }
  }

  private updateDrops(dt: number) {
    const L = this.scene.level;
    for (const d of this.drops) {
      d.t += dt;
      if (d.falls) {
        d.vy += 620 * dt;
        d.vx *= 1 - 2 * dt;
      } else if (d.t > d.back) {
        // puxada de volta para o corpo, cada vez mais depressa
        const tx = this.phase === 'off' ? d.x : this.x;
        const ty = this.phase === 'form' ? this.feet - 20 : this.y;
        const k = 60 + (d.t - d.back) * 900;
        d.vx += (tx - d.x) * k * dt - d.vx * 8 * dt;
        d.vy += (ty - d.y) * k * dt - d.vy * 8 * dt;
        if (Math.hypot(tx - d.x, ty - d.y) < 3.5 || d.t > d.back + 0.4) d.t = -1;
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.falls && (d.t > 0.7 || L.solidCell(Math.floor(d.x / 16), Math.floor(d.y / 16)))) {
        this.scene.echoMotes(d.x, d.y - 2, true, 2);
        d.t = -1;
      }
      if (d.t < 0) {
        d.img.destroy();
        continue;
      }
      d.img.setPosition(d.x, d.y);
      // esticada na direção em que voa
      const sp = Math.hypot(d.vx, d.vy);
      d.img.setRotation(Math.atan2(d.vy, d.vx)).setScale(d.img.scaleY * Math.min(1.9, 1 + sp / 260), d.img.scaleY);
    }
    this.drops = this.drops.filter((d) => d.t >= 0);
  }

  // o rastro que escorre atrás, os tentáculos e o ar que entorta em volta
  private drawTrail(dt: number) {
    const g = this.trail;
    const h = this.haze;
    g.clear();
    h.clear();
    for (const p of this.hist) p.t += dt;
    this.hist = this.hist.filter((p) => p.t < TRAIL);
    const pts = this.hist;
    if (pts.length >= 2) {
      const top: Phaser.Math.Vector2[] = [];
      const bot: Phaser.Math.Vector2[] = [];
      pts.forEach((p, i) => {
        const a = p.t / TRAIL;
        const wv = Math.sin(this.age * 30 - i * 0.7) * 0.9;
        const w = (1 - a) ** 1.3 * 5.2;
        top.push(new Phaser.Math.Vector2(p.x, p.y - w + wv));
        bot.push(new Phaser.Math.Vector2(p.x, p.y + w * 0.75 + wv * 0.6));
      });
      const poly = [...top, ...bot.reverse()];
      g.fillStyle(ABYSS.ink, 0.92).fillPoints(poly, true);
      g.lineStyle(0.9, ABYSS.purple, 0.85).strokePoints(top, false);
      g.lineStyle(0.6, ABYSS.magenta, 0.5).strokePoints(bot, false);
      // distorção leve: linhas finas que tremem em volta do rastro
      h.lineStyle(0.6, ABYSS.lilac, 0.16);
      for (const off of [-8, 7]) {
        h.beginPath();
        pts.forEach((p, i) => {
          const y = p.y + off + Math.sin(this.age * 44 + i * 0.9 + off) * 1.6;
          if (i === 0) h.moveTo(p.x, y);
          else h.lineTo(p.x, y);
        });
        h.strokePath();
      }
    }
    if (this.phase !== 'flow') return;
    // tentáculos: três para trás e dois curtos tateando à frente
    const d = this.dir;
    const grow = Math.min(1, this.t / (DISSOLVE * 1.5));
    const arms: [number, number, number, number][] = [
      [-15, -3, 20, 0],
      [-14, 2, 25, 1.7],
      [-12, 5, 15, 3.1],
      [14, -4, 8, 0.6],
      [15, 3, 7, 2.4],
    ];
    for (const [ox, oy, len, ph] of arms) {
      const back = Math.sign(ox) < 0;
      const L = len * grow;
      let px = this.x + d * ox;
      let py = this.y + oy;
      for (let j = 1; j <= 6; j++) {
        const s = j / 6;
        const nx = this.x + d * (ox + (back ? -1 : 1) * L * s);
        const ny = this.y + oy + oy * s * 0.5 + Math.sin(this.age * 26 + j * 0.9 + ph) * (0.5 + s * 3.2);
        const wid = 2.6 * (1 - s) + 0.45;
        g.lineStyle(wid + 0.9, ABYSS.purple, 0.45).lineBetween(px, py, nx, ny);
        g.lineStyle(wid, ABYSS.ink, 1).lineBetween(px, py, nx, ny);
        px = nx;
        py = ny;
      }
    }
  }

  private drawRings(dt: number) {
    const g = this.rings;
    g.clear();
    for (const r of this.ringList) {
      r.t += dt;
      const k = r.t / (r.big ? 0.3 : 0.22);
      if (k >= 1) continue;
      const e = Phaser.Math.Easing.Quadratic.Out(k);
      g.lineStyle(1.6 * (1 - k) + 0.3, ABYSS.lilac, 0.55 * (1 - k));
      g.strokeEllipse(r.x, r.y, 8 + e * (r.big ? 44 : 34), 6 + e * (r.big ? 30 : 18));
      g.lineStyle(1, ABYSS.purple, 0.4 * (1 - k));
      g.strokeEllipse(r.x, r.y, 4 + e * (r.big ? 30 : 22), 3 + e * (r.big ? 20 : 12));
    }
    this.ringList = this.ringList.filter((r) => r.t < (r.big ? 0.3 : 0.22));
  }

  destroy() {
    for (const d of this.drops) d.img.destroy();
    this.drops = [];
    this.blob.destroy();
    this.mask.destroy();
    this.trail.destroy();
    this.haze.destroy();
    this.rings.destroy();
  }
}

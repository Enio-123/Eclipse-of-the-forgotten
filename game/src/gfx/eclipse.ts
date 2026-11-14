import Phaser from 'phaser';

// O novo Eclipse do final II ("ele vê um novo Eclipse cobrir Vespera"): maior que o pintado no céu e frio, a
// coroa lilás e branca com os fios finos, como no filme. Fica por cima do antigo: uma sombra da cor do céu em
// volta do disco apaga a coroa laranja da pintura.

const KEY = 'eclipse-new';
const SIZE = 256;
// o raio do disco na textura
const DISC = 40;

// as cores da luz viva por cima de cada coroa pintada (os fios, as plumas largas e o clarão rente ao disco)
export interface LiveTone {
  rays: number;
  plumes: number;
  ring: number;
}
// a coroa laranja, em pinceladas, do título e da Ponte
const EMBER: LiveTone = { rays: 0xffc890, plumes: 0xff9a50, ring: 0xffe0b8 };
// a coroa dourada de fios finos do Vale e das Torres, e a branca e dourada da cidade
const GOLD: LiveTone = { rays: 0xffe2ac, plumes: 0xffc070, ring: 0xfff0d4 };
// o novo Eclipse do final II
const COLD: LiveTone = { rays: 0xe8deff, plumes: 0xb49cf0, ring: 0xf4eeff };

// onde o eclipse está pintado em cada céu (centro e raio do disco, em pixels do mundo)
export const SKY_ECLIPSE = {
  title: { x: 469.8, y: 84.8, r: 25.7, tone: EMBER },
  bridge: { x: 819.8, y: 94.8, r: 25.7, tone: EMBER },
  city: { x: 464.75, y: 74.75, r: 19.9, tone: GOLD },
  vale: { x: 483.75, y: 55.75, r: 14.8, tone: GOLD },
} as const;
export type SkyEclipse = { x: number; y: number; r: number; tone: LiveTone };

// quantas vezes maior que o pintado é o novo Eclipse do final II
export const BIG_K = 1.7;

function texture(scene: Phaser.Scene) {
  if (scene.textures.exists(KEY)) return;
  const c = scene.textures.createCanvas(KEY, SIZE, SIZE);
  if (!c) return;
  const ctx = c.getContext();
  const m = SIZE / 2;
  // a sombra do céu que cobre a coroa antiga
  let g = ctx.createRadialGradient(m, m, DISC, m, m, m);
  g.addColorStop(0, 'rgba(20,16,34,0.96)');
  g.addColorStop(0.45, 'rgba(22,18,38,0.78)');
  g.addColorStop(1, 'rgba(24,20,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // a coroa: lilás claro, forte rente ao disco
  g = ctx.createRadialGradient(m, m, DISC * 0.95, m, m, DISC * 2.6);
  g.addColorStop(0, 'rgba(236,226,255,0.9)');
  g.addColorStop(0.25, 'rgba(198,178,240,0.42)');
  g.addColorStop(1, 'rgba(160,130,220,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(m, m, DISC * 2.6, 0, Math.PI * 2);
  ctx.fill();
  // os fios da coroa, de comprimentos diferentes (sempre os mesmos)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  ctx.lineWidth = 1;
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2 + (rnd() - 0.5) * 0.05;
    const l = DISC * (1.45 + rnd() * 1.1);
    ctx.strokeStyle = `rgba(240,232,255,${(0.12 + rnd() * 0.16).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(m + Math.cos(a) * DISC * 1.02, m + Math.sin(a) * DISC * 1.02);
    ctx.lineTo(m + Math.cos(a) * l, m + Math.sin(a) * l);
    ctx.stroke();
  }
  // o disco e a beira acesa
  ctx.fillStyle = '#06040a';
  ctx.beginPath();
  ctx.arc(m, m, DISC, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(250,246,255,0.95)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(m, m, DISC + 0.5, 0, Math.PI * 2);
  ctx.stroke();
  c.refresh();
}

// o eclipse maior por cima do pintado (r: o raio do pintado; k: quantas vezes maior)
export function bigEclipse(scene: Phaser.Scene, x: number, y: number, r: number, depth: number, k = BIG_K) {
  texture(scene);
  return scene.add.image(x, y, KEY).setScale((r * k) / DISC).setDepth(depth);
}

// ECLIPSE: o eclipse vivo. Por cima da coroa pintada no céu entra luz que se mexe: dois leques de raios
// girando bem devagar um contra o outro (os fios finos e as plumas largas: onde um passa pelo outro a
// coroa acende e apaga, sem nunca repetir igual), o clarão rente ao disco respirando e, de vez em quando,
// uma conta de luz na beira dele (a luz que escapa por um vale da borda). Tudo é somado à pintura e tem
// um furo no lugar do disco, que continua preto; nada aqui muda a claridade do resto do céu.

const FAN_A = 'eclipse-live-a';
const FAN_B = 'eclipse-live-b';
const RING = 'eclipse-live-ring';
const BEAD = 'eclipse-live-bead';
// os leques: o lado da textura e o raio do disco nela (os raios vão até 3 raios depois da beira)
const FAN = 384;
const FAN_DISC = 48;
const REACH = 3;
const RING_SIZE = 192;
const BEAD_SIZE = 64;

interface FanSpec {
  n: number;
  // a largura de cada raio (radianos), o comprimento (raios do disco) e a força
  w: [number, number];
  len: [number, number];
  b: [number, number];
  // quanto o raio afina até a ponta (0 = cunha reta, 1 = agulha)
  taper: number;
}

function white(tex: Phaser.Textures.CanvasTexture, size: number, alpha: (x: number, y: number) => number) {
  const ctx = tex.getContext();
  const img = ctx.createImageData(size, size);
  const m = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.min(1, Math.max(0, alpha(x + 0.5 - m, y + 0.5 - m))) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  // o jogo é pixelArt: sem isto a luz sairia em degraus
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

function fanTexture(scene: Phaser.Scene, key: string, seed: number, spec: FanSpec) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, FAN, FAN);
  if (!tex) return;
  // os raios entram numa tabela de ângulo por distância (cada um só mexe nos ângulos em volta dele); a
  // imagem lê a tabela ponto a ponto
  const NA = 1440;
  const NR = 150;
  const pol = new Float32Array(NA * NR);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < spec.n; i++) {
    const c = rnd() * NA;
    const w = ((spec.w[0] + rnd() * (spec.w[1] - spec.w[0])) * NA) / (Math.PI * 2);
    // quase todos curtos, uns poucos compridos
    const len = spec.len[0] + rnd() * rnd() * (spec.len[1] - spec.len[0]);
    const b = spec.b[0] + rnd() * (spec.b[1] - spec.b[0]);
    const reach = Math.ceil(w * 2.6);
    const c0 = Math.round(c);
    for (let da = -reach; da <= reach; da++) {
      const ia = (((c0 + da) % NA) + NA) % NA;
      const q = (c0 + da - c) / w;
      for (let ir = 0; ir < NR; ir++) {
        const u = ((ir / (NR - 1)) * REACH) / len;
        if (u >= 1) break;
        const ww = 1 - spec.taper * u;
        pol[ia * NR + ir] += b * Math.exp(-(q * q) / (ww * ww)) * (1 - u) * (1 - u);
      }
    }
  }
  white(tex, FAN, (dx, dy) => {
    const d = Math.sqrt(dx * dx + dy * dy);
    const rho = d / FAN_DISC - 1;
    if (rho <= 0 || rho >= REACH) return 0;
    let a = Math.atan2(dy, dx) / (Math.PI * 2);
    if (a < 0) a += 1;
    const fa = a * NA;
    const ia = Math.floor(fa) % NA;
    const ta = fa - Math.floor(fa);
    const fr = (rho / REACH) * (NR - 1);
    const ir = Math.floor(fr);
    const tr = fr - ir;
    const i0 = ia * NR;
    const i1 = ((ia + 1) % NA) * NR;
    const ir1 = Math.min(NR - 1, ir + 1);
    const v = (pol[i0 + ir] * (1 - ta) + pol[i1 + ir] * ta) * (1 - tr) + (pol[i0 + ir1] * (1 - ta) + pol[i1 + ir1] * ta) * tr;
    // entra macio na beira do disco (sem serrilhado, e a beira pintada continua nítida)
    return v * Math.min(1, (d - FAN_DISC) / 2);
  });
}

function liveTextures(scene: Phaser.Scene) {
  // os fios: muitos, finos, de comprimentos bem diferentes
  fanTexture(scene, FAN_A, 11, { n: 104, w: [0.007, 0.02], len: [0.5, 3], b: [0.3, 0.95], taper: 0.7 });
  // as plumas: poucas, largas e fracas
  fanTexture(scene, FAN_B, 29, { n: 30, w: [0.035, 0.085], len: [0.9, 2.7], b: [0.14, 0.42], taper: 0.35 });
  if (!scene.textures.exists(RING)) {
    const tex = scene.textures.createCanvas(RING, RING_SIZE, RING_SIZE);
    if (tex) {
      white(tex, RING_SIZE, (dx, dy) => {
        const d = Math.sqrt(dx * dx + dy * dy);
        const rho = d / FAN_DISC - 1;
        if (rho <= 0 || rho >= 1) return 0;
        // forte rente ao disco e um resto largo e fraco, que some antes da borda da textura
        const edge = Math.min(1, (1 - rho) / 0.3);
        return (0.85 * Math.exp(-rho / 0.09) + 0.15 * Math.exp(-rho / 0.4)) * Math.min(1, (d - FAN_DISC) / 2) * edge;
      });
    }
  }
  if (!scene.textures.exists(BEAD)) {
    const tex = scene.textures.createCanvas(BEAD, BEAD_SIZE, BEAD_SIZE);
    if (tex) {
      white(tex, BEAD_SIZE, (dx, dy) => {
        const d2 = dx * dx + dy * dy;
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        // o miolo, o halo e a estrela de quatro pontas fininha
        const star = 0.55 * (Math.exp(-ay / 1.1) * Math.exp(-ax / 8) + Math.exp(-ax / 1.1) * Math.exp(-ay / 8));
        const rim = Math.min(1, Math.max(0, (BEAD_SIZE / 2 - Math.sqrt(d2)) / 6));
        return (Math.exp(-d2 / 22) + 0.3 * Math.exp(-d2 / 150) + star) * rim;
      });
    }
  }
}

// sorteio fixo (0..1) por número
const hash = (n: number) => {
  const v = Math.sin(n * 12.9898 + 4.1) * 43758.5453;
  return v - Math.floor(v);
};

// as contas de luz: de quanto em quanto tempo cada uma volta, por quanto tempo fica e com que força
const BEADS = [
  { every: 13700, lasts: 3400, peak: 0.85, off: 5200 },
  { every: 19300, lasts: 2800, peak: 0.7, off: 11900 },
  { every: 29100, lasts: 4200, peak: 1, off: 300 },
];

export class LivingEclipse {
  private box: Phaser.GameObjects.Container;
  private a: Phaser.GameObjects.Image;
  private b: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Image;
  private beads: Phaser.GameObjects.Image[];
  // o raio do disco que está na tela (o pintado, ou o do novo Eclipse)
  readonly r: number;

  // e: o eclipse pintado no céu; cold: o novo Eclipse do final II está por cima dele (maior e frio)
  constructor(scene: Phaser.Scene, e: { r: number; tone: LiveTone }, depth: number, cold = false) {
    liveTextures(scene);
    const r = (this.r = e.r * (cold ? BIG_K : 1));
    const tone = cold ? COLD : e.tone;
    const add = Phaser.BlendModes.ADD;
    const img = (key: string, tint: number, scale: number) => scene.add.image(0, 0, key).setTint(tint).setBlendMode(add).setScale(scale);
    this.b = img(FAN_B, tone.plumes, r / FAN_DISC);
    this.a = img(FAN_A, tone.rays, r / FAN_DISC);
    this.ring = img(RING, tone.ring, r / FAN_DISC);
    this.beads = BEADS.map(() => img(BEAD, tone.ring, r * 0.02).setAlpha(0));
    // a caixa fica no ponto exato do centro (uma imagem solta é desenhada no pixel inteiro do mundo, e o
    // furo sairia do lugar do disco)
    this.box = scene.add.container(0, 0, [this.b, this.a, this.ring, ...this.beads]).setScrollFactor(0).setDepth(depth);
    this.update(scene.time.now);
  }

  setPosition(x: number, y: number) {
    this.box.setPosition(x, y);
    return this;
  }

  update(t: number) {
    // uma volta a cada 4 minutos e pouco, e a outra, ao contrário, a cada 6: não dá para ver girar, só
    // os fios trocando de lugar
    this.a.rotation = t * ((Math.PI * 2) / 260000);
    this.b.rotation = 1.3 - t * ((Math.PI * 2) / 380000);
    this.a.setAlpha(0.3 * (0.8 + 0.2 * Math.sin(t * 0.00071)));
    this.b.setAlpha(0.26 * (0.78 + 0.22 * Math.sin(t * 0.00047 + 1.7)));
    // a coroa respira: os fios crescem e encolhem um pouco, fora de compasso com as plumas
    const k = this.r / FAN_DISC;
    this.a.setScale(k * (1 + 0.03 * Math.sin(t * 0.00031)));
    this.b.setScale(k * (1 + 0.04 * Math.sin(t * 0.00023 + 2.4)));
    this.ring.setAlpha(0.3 * (0.76 + 0.17 * Math.sin(t * 0.0009) + 0.07 * Math.sin(t * 0.0041 + 0.6)));
    for (let i = 0; i < BEADS.length; i++) {
      const s = BEADS[i];
      const turn = Math.floor((t + s.off) / s.every);
      const u = (t + s.off - turn * s.every) / s.lasts;
      const o = this.beads[i];
      if (u >= 1) {
        if (o.alpha !== 0) o.setAlpha(0);
        continue;
      }
      // cada volta num ponto diferente da beira
      const ang = hash(i * 31 + turn * 17) * Math.PI * 2;
      const up = Math.sin(u * Math.PI);
      const bx = Math.cos(ang) * this.r;
      const by = Math.sin(ang) * this.r;
      // a imagem é desenhada no pixel inteiro do mundo: o que sobra da conta vai na origem dela
      const fx = Math.floor(bx);
      const fy = Math.floor(by);
      const span = o.scaleX * BEAD_SIZE;
      o.setPosition(fx, fy).setOrigin(0.5 - (bx - fx) / span, 0.5 - (by - fy) / span).setAlpha(s.peak * up * up);
    }
  }

  destroy() {
    this.box.destroy();
  }
}

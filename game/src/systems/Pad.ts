// Controles de videogame pela Gamepad API: PlayStation, Xbox, Nintendo e genéricos.
// No mapeamento padrão do navegador cada índice é uma posição física (o botão de baixo é
// sempre o 0), então a mesma configuração vale para qualquer marca; muda só o nome e o
// desenho do botão mostrado nas dicas.

export type PadBrand = 'playstation' | 'xbox' | 'nintendo' | 'generic';
export type Device = 'keyboard' | 'touch' | 'pad';

export const BTN = {
  south: 0, east: 1, west: 2, north: 3, l1: 4, r1: 5, l2: 6, r2: 7,
  select: 8, start: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15, home: 16,
} as const;

// pausa e botões do sistema não entram na troca de botões
export const RESERVED = new Set<number>([BTN.select, BTN.start, BTN.home]);

const DPAD = ['Direcional para cima', 'Direcional para baixo', 'Direcional para a esquerda', 'Direcional para a direita'];
const NAMES: Record<PadBrand, string[]> = {
  playstation: ['X', 'Bola', 'Quadrado', 'Triângulo', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', ...DPAD, 'PS'],
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', ...DPAD, 'Xbox'],
  nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L3', 'R3', ...DPAD, 'Home'],
  generic: ['Botão de baixo', 'Botão da direita', 'Botão da esquerda', 'Botão de cima', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3', ...DPAD, 'Home'],
};
// texto curto dentro do desenho dos gatilhos e botões de ombro
const SHORT: Record<PadBrand, string[]> = {
  playstation: ['L1', 'R1', 'L2', 'R2'],
  xbox: ['LB', 'RB', 'LT', 'RT'],
  nintendo: ['L', 'R', 'ZL', 'ZR'],
  generic: ['L1', 'R1', 'L2', 'R2'],
};
export const BRAND_LABEL: Record<PadBrand, string> = { playstation: 'PlayStation', xbox: 'Xbox', nintendo: 'Nintendo', generic: 'genérico' };

export function brandOf(id: string): PadBrand {
  const s = id.toLowerCase();
  if (/054c|playstation|dualsense|dualshock/.test(s)) return 'playstation';
  if (/057e|nintendo|pro controller|joy-?con/.test(s)) return 'nintendo';
  if (/045e|xbox|xinput/.test(s)) return 'xbox';
  return 'generic';
}

// "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c ...)" -> "DualSense Wireless Controller"
function cleanName(id: string) {
  const s = id.replace(/\(.*?\)/g, '').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '').trim();
  return s || 'Controle';
}

export function buttonName(i: number, brand: PadBrand) {
  return NAMES[brand][i] ?? `Botão ${i + 1}`;
}

// ---------- desenhos dos botões (SVG, cor do texto) ----------
const svg = (body: string, label: string, wide = false) =>
  `<svg class="pad-g${wide ? ' wide' : ''}" viewBox="0 0 ${wide ? 30 : 24} 24" role="img" aria-label="${label}">${body}</svg>`;
const S = 'fill="none" stroke="currentColor"';
const ring = `<circle cx="12" cy="12" r="10.2" ${S} stroke-width="1.5"/>`;
const letter = (t: string, size = 11.5, x = 12, y = 12 + size * 0.36) =>
  `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="600" fill="currentColor" stroke="none" font-family="Spectral, Georgia, serif">${t}</text>`;
const pill = `<rect x="2.5" y="6" width="25" height="13" rx="6.5" ${S} stroke-width="1.5"/>`;
const PS_SYMBOL = [
  `<path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" ${S} stroke-width="1.8" stroke-linecap="round"/>`,
  `<circle cx="12" cy="12" r="4.6" ${S} stroke-width="1.8"/>`,
  `<rect x="7.9" y="7.9" width="8.2" height="8.2" ${S} stroke-width="1.8"/>`,
  `<path d="M12 7.3l4.9 8.4H7.1z" ${S} stroke-width="1.8" stroke-linejoin="round"/>`,
];
const POS: [number, number][] = [[12, 18], [18, 12], [6, 12], [12, 6]];

function faceGlyph(i: number, brand: PadBrand) {
  const label = buttonName(i, brand);
  if (brand === 'playstation') return svg(ring + PS_SYMBOL[i], label);
  if (brand === 'xbox' || brand === 'nintendo') return svg(ring + letter(NAMES[brand][i]), label);
  // genérico: os quatro botões em losango, com o da vez preenchido
  const dots = POS.map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="3.1" ${k === i ? 'fill="currentColor" stroke="currentColor"' : S} stroke-width="1.3"/>`);
  return svg(dots.join(''), label);
}

function shoulderGlyph(i: number, brand: PadBrand) {
  const t = SHORT[brand][i - 4];
  const trigger = i >= 6;
  const shape = trigger ? `<path d="M5 21V9.5C5 5.5 8.5 3 15 3s10 2.5 10 6.5V21z" ${S} stroke-width="1.5" stroke-linejoin="round"/>` : pill;
  return svg(shape + letter(t, t.length > 1 ? 9 : 10.5, 15, trigger ? 16.6 : 15.8), buttonName(i, brand), true);
}

function dpadGlyph(dir: number) {
  const arms = [
    'M12 3.5l3 3.5H9z', 'M12 20.5l-3-3.5h6z', 'M3.5 12l3.5-3v6z', 'M20.5 12l-3.5 3v-6z',
  ];
  const cross = `<path d="M9 2.5h6v6.5h6.5v6H15v6.5H9V15H2.5V9H9z" ${S} stroke-width="1.4" stroke-linejoin="round"/>`;
  return svg(cross + `<path d="${arms[dir]}" fill="currentColor" stroke="none"/>`, DPAD[dir]);
}

// analógico esquerdo: 'x' = para os lados, 'y' = cima e baixo, 'up' e 'down'
export function stickGlyph(dir: 'x' | 'y' | 'up' | 'down') {
  const knob = `<circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none" opacity="0.4"/>`;
  const arrows = {
    x: 'M2.2 12l3-2.6v5.2zM21.8 12l-3 2.6V9.4z',
    y: 'M12 2.2l2.6 3H9.4zM12 21.8l-2.6-3h5.2z',
    up: 'M12 2.2l2.6 3H9.4z',
    down: 'M12 21.8l-2.6-3h5.2z',
  }[dir];
  const label = { x: 'Analógico esquerdo', y: 'Analógico esquerdo para cima ou para baixo', up: 'Analógico esquerdo para cima', down: 'Analógico esquerdo para baixo' }[dir];
  return svg(`<circle cx="12" cy="12" r="8" ${S} stroke-width="1.5"/>${knob}<path d="${arrows}" fill="currentColor" stroke="none"/>`, label);
}

export function buttonGlyph(i: number, brand: PadBrand) {
  if (i <= 3) return faceGlyph(i, brand);
  if (i <= 7) return shoulderGlyph(i, brand);
  if (i >= 12 && i <= 15) return dpadGlyph(i - 12);
  const t = NAMES[brand][i] ?? String(i + 1);
  return svg(pill + letter(t.length > 3 ? t.slice(0, 3) : t, 8.5, 15, 15.4), buttonName(i, brand), true);
}

type Actuator = { playEffect?: (type: string, params: Record<string, number>) => Promise<unknown> };

class PadInput {
  device: Device = 'keyboard';
  brand: PadBrand = 'generic';
  name = '';
  standard = true;
  connected = false;
  vibration = true;
  capturing: ((btn: number | null) => void) | null = null;
  private captureArmed = false;
  private active: number | null = null;
  private rest = new Map<number, number[]>();
  private listeners = new Set<() => void>();

  constructor() {
    window.addEventListener('gamepadconnected', (e) => {
      this.select(e.gamepad);
      this.emit();
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      this.rest.delete(e.gamepad.index);
      if (e.gamepad.index === this.active) this.active = null;
      this.emit();
    });
    window.addEventListener('keydown', () => this.setDevice('keyboard'), true);
    window.addEventListener('pointerdown', (e) => this.setDevice(e.pointerType === 'touch' ? 'touch' : 'keyboard'), true);
    const loop = () => {
      this.watch();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  onChange(l: () => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private list(): Gamepad[] {
    try {
      return [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p && p.connected);
    } catch {
      return [];
    }
  }

  // o controle em uso: o último que teve um botão apertado
  get pad(): Gamepad | null {
    const list = this.list();
    return list.find((p) => p.index === this.active) ?? list[0] ?? null;
  }

  private select(p: Gamepad) {
    this.active = p.index;
    this.brand = brandOf(p.id);
    this.name = cleanName(p.id);
    this.standard = p.mapping === 'standard';
    if (!this.rest.has(p.index)) this.rest.set(p.index, [...p.axes]);
  }

  // houve uso de verdade? (alguns controles deixam eixos parados fora do zero)
  private used(p: Gamepad) {
    let rest = this.rest.get(p.index);
    if (!rest) this.rest.set(p.index, (rest = [...p.axes]));
    return p.buttons.some((b) => b.pressed) || p.axes.some((a, i) => Math.abs(a - (rest![i] ?? 0)) > 0.5);
  }

  private setDevice(d: Device) {
    if (d === this.device) return;
    this.device = d;
    document.body.classList.toggle('pad', d === 'pad');
    this.emit();
  }

  // a cada quadro: qual controle está sendo usado, troca de aparelho e captura de botão
  private watch() {
    const list = this.list();
    if (list.length > 0 !== this.connected) {
      this.connected = list.length > 0;
      if (!this.connected) {
        this.active = null;
        this.setDevice('keyboard');
      } else if (this.active === null) this.select(list[0]);
      this.emit();
    }
    for (const p of list) {
      if (!this.used(p)) continue;
      if (p.index !== this.active) {
        this.select(p);
        this.emit();
      }
      this.setDevice('pad');
      break;
    }
    if (this.capturing) {
      const p = this.pad;
      if (!p) return;
      const down = p.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i >= 0);
      if (!this.captureArmed) {
        if (!down.length) this.captureArmed = true; // espera soltar o botão que abriu a captura
        return;
      }
      if (!down.length) return;
      const b = down[0];
      if (b === BTN.start) this.finishCapture(null);
      else if (!RESERVED.has(b)) this.finishCapture(b);
    }
  }

  // espera o próximo botão apertado; Start cancela
  capture(cb: (btn: number | null) => void) {
    this.capturing = cb;
    this.captureArmed = false;
  }

  finishCapture(btn: number | null) {
    const cb = this.capturing;
    this.capturing = null;
    cb?.(btn);
  }

  // botões apertados e analógico esquerdo com zona morta
  read(): { buttons: boolean[]; lx: number; ly: number } | null {
    const p = this.pad;
    if (!p) return null;
    const buttons = p.buttons.map((b) => b.pressed || b.value > 0.5);
    let lx = p.axes[0] ?? 0;
    let ly = p.axes[1] ?? 0;
    if (Math.hypot(lx, ly) < 0.28) lx = ly = 0;
    return { buttons, lx, ly };
  }

  rumble(strong: number, weak: number, ms: number) {
    if (!this.vibration || this.device !== 'pad') return;
    const act = (this.pad as unknown as { vibrationActuator?: Actuator } | null)?.vibrationActuator;
    try {
      act?.playEffect?.('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch(() => {});
    } catch {
      /* controle sem vibração */
    }
  }
}

export const pad = new PadInput();

import { WEAPON_IDS, type WeaponId } from '../config';
import { RESERVED } from './Pad';
import { FORCED_PRESET, FPS_LIMITS, PRESETS, cleanFlags, defaultPreset, type FpsLimit, type GfxFlags } from './Graphics';

export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'attack' | 'dash' | 'crouch' | 'hook' | 'memory' | 'skill';
export const ACTIONS: Action[] = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'crouch', 'hook', 'memory', 'skill'];
export type Scheme = 'keyboard' | 'click';
// resolução da tela: automática (nítida, e mais leve sozinha se o jogo ficar lento), nítida ou leve
export type Quality = 'auto' | 'high' | 'low';
export const QUALITIES: Quality[] = ['auto', 'high', 'low'];

export const ACTION_LABEL: Record<Action, string> = {
  left: 'Andar para a esquerda',
  right: 'Andar para a direita',
  up: 'Olhar e atacar para cima',
  down: 'Atacar para baixo (no ar)',
  jump: 'Pular',
  attack: 'Atacar',
  dash: 'Dash',
  crouch: 'Agachar',
  hook: 'Gancho de corrente',
  memory: 'Poder de memória',
  skill: 'Habilidade do mago',
};

export const DEFAULT_BINDS: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space', 'KeyK'],
  attack: ['Mouse0', 'KeyJ'],
  dash: ['KeyF', 'ShiftLeft'],
  crouch: ['ControlLeft', 'KeyC'],
  hook: ['KeyE', 'KeyL'],
  memory: ['KeyQ', 'KeyR'],
  // a habilidade do mago: o clique direito abre a mira (sem mouse, o I, em cima do ataque)
  skill: ['Mouse2', 'KeyI'],
};

// botões do controle (posição no mapeamento padrão: 0 = botão de baixo, 7 = gatilho direito...)
export const DEFAULT_PAD: Record<Action, number[]> = {
  left: [14],
  right: [15],
  up: [12],
  down: [13],
  jump: [0],
  attack: [2],
  dash: [7, 1],
  crouch: [6, 4],
  hook: [3],
  memory: [11],
  skill: [5],
};
// ações que aparecem na troca de botões do controle (andar fica no analógico e no direcional)
export const PAD_ACTIONS: Action[] = ['jump', 'attack', 'dash', 'crouch', 'hook', 'memory', 'skill'];

export interface SettingsData {
  scheme: Scheme;
  binds: Record<Action, string[]>;
  pad: Record<Action, number[]>;
  vibration: boolean;
  volume: number;
  music: number;
  sfx: number;
  weapon: WeaponId;
  quality: Quality;
  // ajustes gráficos (a predefinição é a que bate com eles) e o limite de quadros
  gfx: GfxFlags;
  fps: FpsLimit;
}

const KEY = 'eclipse-ajustes-v1';

function defaults(): SettingsData {
  return {
    scheme: 'keyboard', binds: structuredClone(DEFAULT_BINDS), pad: structuredClone(DEFAULT_PAD), vibration: true, volume: 0.8, music: 0.6, sfx: 0.8,
    weapon: 'scythe', quality: 'auto', gfx: { ...PRESETS[defaultPreset()] }, fps: 0,
  };
}

const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

function load(): SettingsData {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const parsed = JSON.parse(raw) as Partial<SettingsData>;
    const binds = { ...d.binds };
    for (const a of ACTIONS) {
      const b = parsed.binds?.[a];
      if (Array.isArray(b) && b.every((c) => typeof c === 'string')) binds[a] = b.slice(0, 2);
    }
    const padBinds = { ...d.pad };
    for (const a of ACTIONS) {
      const b = parsed.pad?.[a];
      if (Array.isArray(b) && b.every((i) => Number.isInteger(i) && i >= 0 && i < 32 && !RESERVED.has(i))) padBinds[a] = b.slice(0, 2);
    }
    // o R1 era o segundo botão do gancho: num ajuste de antes da habilidade do mago, ele passa para ela
    if (!parsed.pad?.skill && padBinds.hook.length === 2 && padBinds.hook[0] === 3 && padBinds.hook[1] === 5) padBinds.hook = [3];
    // ação nova num ajuste antigo: as teclas padrão dela que outra ação já usa ficam de fora
    for (const a of ACTIONS) {
      if (!parsed.binds?.[a]) binds[a] = binds[a].filter((c) => !ACTIONS.some((o) => o !== a && binds[o].includes(c)));
      if (!parsed.pad?.[a]) padBinds[a] = padBinds[a].filter((i) => !ACTIONS.some((o) => o !== a && padBinds[o].includes(i)));
    }
    return {
      scheme: parsed.scheme === 'click' ? 'click' : 'keyboard',
      binds,
      pad: padBinds,
      vibration: parsed.vibration !== false,
      volume: clamp01(parsed.volume, d.volume),
      music: clamp01(parsed.music, d.music),
      sfx: clamp01(parsed.sfx, d.sfx),
      weapon: WEAPON_IDS.includes(parsed.weapon as WeaponId) ? (parsed.weapon as WeaponId) : d.weapon,
      quality: QUALITIES.includes(parsed.quality as Quality) ? (parsed.quality as Quality) : d.quality,
      gfx: parsed.gfx ? cleanFlags(parsed.gfx, d.gfx) : d.gfx,
      fps: FPS_LIMITS.includes(parsed.fps as FpsLimit) ? (parsed.fps as FpsLimit) : 0,
    };
  } catch {
    return d;
  }
}

type Listener = (s: SettingsData) => void;
const listeners = new Set<Listener>();

export const settings = {
  data: load(),
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* armazenamento indisponível: vale só nesta sessão */
    }
    listeners.forEach((l) => l(this.data));
  },
  resetBinds() {
    this.data.binds = structuredClone(DEFAULT_BINDS);
    this.data.scheme = 'keyboard';
    this.save();
  },
  resetPad() {
    this.data.pad = structuredClone(DEFAULT_PAD);
    this.data.vibration = true;
    this.save();
  },
  // Troca o botão do controle de uma ação; se ele já estava em outra ação, sai de lá
  padBind(a: Action, slot: number, btn: number) {
    for (const other of ACTIONS) {
      if (other !== a) this.data.pad[other] = this.data.pad[other].filter((i) => i !== btn);
    }
    const cur = [...(this.data.pad[a] ?? [])].filter((i) => i !== btn);
    cur.splice(Math.min(slot, cur.length), slot < cur.length ? 1 : 0, btn);
    this.data.pad[a] = cur.slice(0, 2);
    this.save();
  },
  padUnbind(a: Action, slot: number) {
    const cur = [...(this.data.pad[a] ?? [])];
    cur.splice(slot, 1);
    this.data.pad[a] = cur;
    this.save();
  },
  // Troca a tecla de uma ação; se ela já estava em outra ação, sai de lá
  bind(a: Action, slot: number, code: string) {
    for (const other of ACTIONS) {
      if (other === a) continue;
      this.data.binds[other] = this.data.binds[other].filter((c) => c !== code);
    }
    const cur = [...(this.data.binds[a] ?? [])];
    const dup = cur.indexOf(code);
    if (dup >= 0) cur.splice(dup, 1);
    cur[Math.min(slot, cur.length)] = code;
    this.data.binds[a] = cur.filter(Boolean).slice(0, 2);
    this.save();
  },
  unbind(a: Action, slot: number) {
    const cur = [...(this.data.binds[a] ?? [])];
    cur.splice(slot, 1);
    this.data.binds[a] = cur;
    this.save();
  },
  onChange(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  // Teclas efetivas de cada ação, considerando o modo "mover com clique"
  codesFor(a: Action): string[] {
    const codes = this.data.binds[a] ?? [];
    if (this.data.scheme !== 'click') return codes;
    if (a === 'attack') return [...codes.filter((c) => c !== 'Mouse0'), 'Mouse2'];
    // no modo clique o direito já é o ataque: a habilidade vai para o clique do meio
    if (a === 'skill') return [...codes.filter((c) => c !== 'Mouse0' && c !== 'Mouse2'), 'Mouse1'];
    return codes.filter((c) => c !== 'Mouse0');
  },
};

const NAMES: Record<string, string> = {
  Space: 'Espaço', ShiftLeft: 'Shift esq.', ShiftRight: 'Shift dir.', ControlLeft: 'Ctrl esq.', ControlRight: 'Ctrl dir.',
  AltLeft: 'Alt', AltRight: 'Alt Gr', ArrowLeft: 'Seta esq.', ArrowRight: 'Seta dir.', ArrowUp: 'Seta cima', ArrowDown: 'Seta baixo',
  Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', CapsLock: 'Caps Lock', Mouse0: 'Clique esquerdo', Mouse1: 'Clique do meio',
  Mouse2: 'Clique direito', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', Semicolon: 'Ç', Quote: '~', BracketLeft: '´', BracketRight: '[',
  Backslash: ']', Comma: ',', Period: '.', Slash: ';', Minus: '-', Equal: '=', IntlBackslash: '\\',
};

export function codeName(code: string) {
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

// ajustes gráficos em uso (o endereço pode fixar uma predefinição para os testes)
export function gfx(): GfxFlags {
  return FORCED_PRESET ? PRESETS[FORCED_PRESET] : settings.data.gfx;
}

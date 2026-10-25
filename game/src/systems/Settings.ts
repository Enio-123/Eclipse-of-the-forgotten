import { WEAPON_IDS, type WeaponId } from '../config';
import { RESERVED } from './Pad';

export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'attack' | 'dash' | 'crouch';
export const ACTIONS: Action[] = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'crouch'];
export type Scheme = 'keyboard' | 'click';

export const ACTION_LABEL: Record<Action, string> = {
  left: 'Andar para a esquerda',
  right: 'Andar para a direita',
  up: 'Olhar e atacar para cima',
  down: 'Atacar para baixo (no ar)',
  jump: 'Pular',
  attack: 'Atacar',
  dash: 'Dash',
  crouch: 'Agachar',
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
};
// ações que aparecem na troca de botões do controle (andar fica no analógico e no direcional)
export const PAD_ACTIONS: Action[] = ['jump', 'attack', 'dash', 'crouch'];

export interface SettingsData {
  scheme: Scheme;
  binds: Record<Action, string[]>;
  pad: Record<Action, number[]>;
  vibration: boolean;
  volume: number;
  music: number;
  sfx: number;
  weapon: WeaponId;
}

const KEY = 'eclipse-ajustes-v1';

function defaults(): SettingsData {
  return { scheme: 'keyboard', binds: structuredClone(DEFAULT_BINDS), pad: structuredClone(DEFAULT_PAD), vibration: true, volume: 0.8, music: 0.6, sfx: 0.8, weapon: 'scythe' };
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
    return {
      scheme: parsed.scheme === 'click' ? 'click' : 'keyboard',
      binds,
      pad: padBinds,
      vibration: parsed.vibration !== false,
      volume: clamp01(parsed.volume, d.volume),
      music: clamp01(parsed.music, d.music),
      sfx: clamp01(parsed.sfx, d.sfx),
      weapon: WEAPON_IDS.includes(parsed.weapon as WeaponId) ? (parsed.weapon as WeaponId) : d.weapon,
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

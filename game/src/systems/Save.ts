import { AMBER_BAR, PLAYER, POWERS, POWER_IDS, WEAPONS, WEAPON_IDS, type PowerId, type WeaponId } from '../config';

// as quatro armas de começo (as outras vêm dos chefes)
export const STARTERS: WeaponId[] = WEAPON_IDS.filter((w) => !WEAPONS[w].boss);
import type { Ability, RoomId } from '../world/rooms';
import { OFFERS, SLOTS } from '../world/lore';

// Progresso salvo no navegador: sala e entrada do último ponto, arma e memórias
export interface SaveData {
  room: RoomId;
  entry: string;
  weapon: WeaponId;
  // a arma escolhida no começo: vale para o jogo inteiro, as outras três não voltam
  // (null num save de antes dessa regra que estava com uma arma de chefe: escolhe uma vez)
  starter: WeaponId | null;
  kintsugi: number;
  prologueDone: boolean;
  seen: string[];
  abilities: Ability[];
  memories: string[];
  traded: string[];
  upgrades: string[];
  visited: Record<string, number[]>;
  coins: number;
  // itens ligados no inventário (null num save antigo, de antes do inventário)
  equipped: string[] | null;
  // inimigos derrotados por tipo (bestiário do diário) e nível de cada arma no ferreiro
  kills: Record<string, number>;
  levels: Record<string, number>;
  // a sombra que ficou onde o cavaleiro caiu, com as moedas que ele perdeu (null: nenhuma)
  echo: Echo | null;
  // poderes de memória (Minas): os que ele já lembrou, o escolhido e o Âmbar guardado nas contas
  powers: PowerId[];
  power: PowerId | null;
  amber: number;
}

export interface Echo {
  room: RoomId;
  // pé da sombra (px da sala)
  x: number;
  y: number;
  coins: number;
}

// ao morrer, 70% das moedas ficam com a sombra
export const ECHO_SHARE = 0.7;

// dano de cada nível do ferreiro (0 = como veio): +10% por nível, no máximo +30%
export const LEVEL_MUL = [1, 1.1, 1.2, 1.3];
export const MAX_LEVEL = LEVEL_MUL.length - 1;

const counts = (v: unknown) => {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
  return out;
};

// os do Cobrador, o presente da Irmã e os seis achados das Minas (lore.ts, OFFERS)
export type Upgrade =
  | 'mask' | 'blade' | 'breath' | 'purse' | 'shard' | 'whetstone' | 'beads'
  | 'flower' | 'helmet' | 'rawamber' | 'watch' | 'whistle' | 'mirror';
const UPGRADES: Upgrade[] = ['mask', 'blade', 'breath', 'purse', 'shard', 'whetstone', 'beads', 'flower', 'helmet', 'rawamber', 'watch', 'whistle', 'mirror'];
// espaços a mais no inventário, achados pelo caminho (o Elo na arena, o bornal e o cinto nas Minas)
export type SlotFind = 'elo' | 'bornal' | 'cinto';
export const SLOT_IDS: SlotFind[] = ['elo', 'bornal', 'cinto'];
// num save antigo as melhorias eram fixas: entram ligadas, na ordem de quem mais ajuda a sobreviver
const MIGRATE_ORDER: Upgrade[] = ['mask', 'shard', 'breath', 'whetstone', 'blade', 'purse'];
const slotCost = (u: Upgrade) => OFFERS.find((o) => o.id === u)?.slots ?? 1;
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []) as string[];
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const echoOf = (v: unknown): Echo | null => {
  if (!v || typeof v !== 'object') return null;
  const e = v as Partial<Echo>;
  if (!ROOM_IDS.includes(e.room as RoomId) || !num(e.x) || !num(e.y) || !num(e.coins) || e.coins! < 1) return null;
  return { room: e.room as RoomId, x: e.x!, y: e.y!, coins: Math.floor(e.coins!) };
};

// arma do começo: a gravada; num save antigo, a que ele estava usando (se não for de chefe)
const starterOf = (d: Partial<SaveData>): WeaponId | null => {
  if (STARTERS.includes(d.starter as WeaponId)) return d.starter as WeaponId;
  return STARTERS.includes(d.weapon as WeaponId) ? (d.weapon as WeaponId) : null;
};

const KEY = 'eclipse-progresso-v1';
const ROOM_IDS: RoomId[] = [
  'ponte', 'catacumbas', 'memoria', 'sinos', 'cripta',
  'escadaria', 'praca', 'rua', 'telhados', 'nave', 'claustro', 'galeria', 'altar',
  'poco', 'celas', 'correntes', 'guarita', 'fuga', 'arena', 'mascara', 'fosso', 'abismo',
  'boca', 'trilhos', 'prensas', 'veio', 'espelhos', 'capataz',
];
const ABILITIES: Ability[] = ['wall', 'double', 'hook', 'veil'];

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (!d || !ROOM_IDS.includes(d.room as RoomId) || typeof d.entry !== 'string') return null;
    return {
      room: d.room as RoomId,
      entry: d.entry,
      weapon: WEAPON_IDS.includes(d.weapon as WeaponId) ? (d.weapon as WeaponId) : 'scythe',
      starter: starterOf(d),
      kintsugi: typeof d.kintsugi === 'number' ? Math.max(0, Math.min(3, Math.floor(d.kintsugi))) : 0,
      prologueDone: !!d.prologueDone,
      seen: strs(d.seen),
      abilities: strs(d.abilities).filter((a) => ABILITIES.includes(a as Ability)) as Ability[],
      memories: strs(d.memories),
      traded: strs(d.traded),
      upgrades: strs(d.upgrades),
      visited: d.visited && typeof d.visited === 'object' ? (d.visited as Record<string, number[]>) : {},
      coins: typeof d.coins === 'number' && Number.isFinite(d.coins) ? Math.max(0, Math.floor(d.coins)) : 0,
      equipped: Array.isArray(d.equipped) ? strs(d.equipped) : null,
      kills: counts(d.kills),
      levels: counts(d.levels),
      echo: echoOf(d.echo),
      powers: strs(d.powers).filter((w) => POWER_IDS.includes(w as PowerId)) as PowerId[],
      power: POWER_IDS.includes(d.power as PowerId) ? (d.power as PowerId) : null,
      amber: num(d.amber) ? Math.max(0, Math.min(AMBER_BAR.max, d.amber!)) : 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(d: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* sem armazenamento: o progresso vale só nesta sessão */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nada a apagar */
  }
}

// Estado da partida em andamento (compartilhado entre as cenas)
export const progress = {
  kintsugi: 0,
  prologueDone: false,
  seen: new Set<string>(),
  room: 'ponte' as RoomId,
  entry: 'P',
  weapon: 'scythe' as WeaponId,
  starter: null as WeaponId | null,
  abilities: new Set<Ability>(),
  // memórias guardadas e as que foram trocadas com o Cobrador (essas viram "esquecidas")
  memories: new Set<string>(),
  traded: new Set<string>(),
  upgrades: new Set<Upgrade>(),
  // itens do inventário ligados agora (cada um ocupa espaços; só valem ligados)
  equipped: new Set<Upgrade>(),
  // pedaços do mapa já vistos em cada sala (células de 4x4 tiles)
  visited: new Map<string, Set<number>>(),
  coins: 0,
  kills: new Map<string, number>(),
  levels: new Map<WeaponId, number>(),
  echo: null as Echo | null,
  // quanto falta para a próxima lasca de vida cair de um inimigo (não é gravado)
  lifeAcc: 0,
  powers: new Set<PowerId>(),
  power: null as PowerId | null,
  amber: 0,

  reset() {
    this.kintsugi = 0;
    this.prologueDone = false;
    this.seen = new Set();
    this.room = 'ponte';
    this.entry = 'P';
    this.starter = null;
    this.abilities = new Set();
    this.memories = new Set();
    this.traded = new Set();
    this.upgrades = new Set();
    this.equipped = new Set();
    this.visited = new Map();
    this.coins = 0;
    this.kills = new Map();
    this.levels = new Map();
    this.echo = null;
    this.lifeAcc = 0;
    this.powers = new Set();
    this.power = null;
    this.amber = 0;
    clearSave();
  },

  restore(d: SaveData) {
    this.kintsugi = d.kintsugi;
    this.prologueDone = d.prologueDone;
    this.seen = new Set(d.seen);
    this.room = d.room;
    this.entry = d.entry;
    this.weapon = d.weapon;
    this.starter = d.starter;
    this.abilities = new Set(d.abilities);
    this.memories = new Set(d.memories);
    this.traded = new Set(d.traded);
    this.upgrades = new Set(d.upgrades.filter((u) => UPGRADES.includes(u as Upgrade)) as Upgrade[]);
    this.equipped = new Set();
    if (d.equipped) {
      for (const u of d.equipped) if (this.upgrades.has(u as Upgrade) && this.fits(u as Upgrade)) this.equipped.add(u as Upgrade);
    } else {
      for (const u of MIGRATE_ORDER) if (this.upgrades.has(u) && this.fits(u)) this.equipped.add(u);
    }
    this.visited = new Map(Object.entries(d.visited).map(([k, v]) => [k, new Set(Array.isArray(v) ? v : [])]));
    this.coins = d.coins;
    this.kills = new Map(Object.entries(d.kills));
    this.levels = new Map(
      Object.entries(d.levels)
        .filter(([k]) => WEAPON_IDS.includes(k as WeaponId))
        .map(([k, v]) => [k as WeaponId, Math.min(MAX_LEVEL, v)]),
    );
    this.echo = d.echo;
    this.lifeAcc = 0;
    this.powers = new Set(d.powers);
    this.power = d.power && this.powers.has(d.power) ? d.power : (d.powers[0] ?? null);
    this.amber = this.powers.size ? d.amber : 0;
  },

  // ---------- poderes de memória ----------
  // lembrou um poder: o primeiro já fica escolhido. Devolve false se já sabia
  learn(id: PowerId) {
    if (this.powers.has(id)) return false;
    this.powers.add(id);
    if (!this.power) this.power = id;
    this.save();
    return true;
  },

  choosePower(id: PowerId) {
    if (!this.powers.has(id)) return false;
    this.power = id;
    this.save();
    return true;
  },

  // o Âmbar só enche as contas depois do primeiro poder; devolve quanto entrou
  gainAmber(n: number) {
    if (!this.powers.size || n <= 0) return 0;
    const before = this.amber;
    this.amber = Math.min(AMBER_BAR.max, this.amber + n);
    return this.amber - before;
  },

  get powerCost() {
    return this.power ? POWERS[this.power].cost : 0;
  },

  // gasta as contas do poder escolhido (false: não tem Âmbar que chegue)
  spendAmber(n: number) {
    if (this.amber + 1e-6 < n) return false;
    this.amber = Math.max(0, this.amber - n);
    return true;
  },

  // ---------- diário e ferreiro ----------
  kill(kind: string) {
    this.kills.set(kind, (this.kills.get(kind) ?? 0) + 1);
  },

  level(w: WeaponId) {
    return this.levels.get(w) ?? 0;
  },

  // dano de uma arma com as melhorias ligadas e o nível do ferreiro
  dmgFor(w: WeaponId) {
    return this.dmgMul * LEVEL_MUL[this.level(w)];
  },

  // ---------- inventário ----------
  // o item está valendo agora (comprado e ligado)
  on(u: Upgrade) {
    return this.upgrades.has(u) && this.equipped.has(u);
  },

  get slotsUsed() {
    let n = 0;
    for (const u of this.equipped) n += slotCost(u);
    return n;
  },

  // espaços do inventário: o Elo do Condenado (prêmio da arena), o bornal e o cinto das Minas dão mais um cada
  get slots() {
    return SLOTS + SLOT_IDS.filter((id) => this.seen.has(`item:${id}`)).length;
  },

  // ganhou um item achado (não comprado): entra equipado se couber, senão fica guardado
  grant(u: Upgrade): 'on' | 'stored' | false {
    if (this.upgrades.has(u)) return false;
    this.upgrades.add(u);
    const r = this.toggle(u) === 'on' ? 'on' : 'stored';
    this.save();
    return r;
  },

  fits(u: Upgrade) {
    return this.equipped.has(u) || this.slotsUsed + slotCost(u) <= this.slots;
  },

  // liga ou desliga; 'full' quando não cabe (tire outro primeiro)
  toggle(u: Upgrade): 'on' | 'off' | 'full' | 'missing' {
    if (!this.upgrades.has(u)) return 'missing';
    if (this.equipped.delete(u)) return 'off';
    if (!this.fits(u)) return 'full';
    this.equipped.add(u);
    return 'on';
  },

  // ---------- armas ----------
  // de chefe: depois da vitória; de começo: só a escolhida (sem escolha gravada, qualquer uma)
  hasWeapon(id: WeaponId) {
    if (WEAPONS[id].boss) return this.seen.has(`weapon:${id}`);
    return !this.starter || id === this.starter;
  },

  // escolhe a arma do começo de vez (jogo novo, ou a primeira troca num save antigo)
  setStarter(id: WeaponId) {
    if (WEAPONS[id].boss || this.starter) return;
    this.starter = id;
    this.save();
  },

  // memórias que ainda dá para trocar
  get held() {
    return [...this.memories].filter((m) => !this.traded.has(m)).length;
  },

  get maxHp() {
    return PLAYER.maxHp + (this.on('mask') ? 1 : 0) + (this.on('shard') ? 1 : 0);
  },

  get dmgMul() {
    return (this.on('blade') ? 1.3 : 1) * (this.on('whetstone') ? 1.15 : 1);
  },

  // grava sem mudar o ponto de retorno (pegar item, abrir grade, ver o mapa)
  save() {
    const visited: Record<string, number[]> = {};
    for (const [k, v] of this.visited) visited[k] = [...v];
    writeSave({
      room: this.room, entry: this.entry, weapon: this.weapon, starter: this.starter, kintsugi: this.kintsugi, prologueDone: this.prologueDone,
      seen: [...this.seen], abilities: [...this.abilities], memories: [...this.memories], traded: [...this.traded],
      upgrades: [...this.upgrades], visited, coins: this.coins, equipped: [...this.equipped],
      kills: Object.fromEntries(this.kills), levels: Object.fromEntries(this.levels), echo: this.echo,
      powers: [...this.powers], power: this.power, amber: Math.round(this.amber * 100) / 100,
    });
  },

  // morreu: a maior parte das moedas fica com a sombra, onde ele caiu. A sombra antiga (se ainda
  // havia uma) some com o que guardava. Devolve quanto foi para a sombra e quanto se perdeu de vez
  die(room: RoomId, x: number, y: number) {
    const gone = this.echo?.coins ?? 0;
    const keep = Math.floor(this.coins * (1 - ECHO_SHARE));
    const lost = this.coins - keep;
    this.coins = keep;
    this.echo = lost > 0 ? { room, x: Math.round(x), y: Math.round(y), coins: lost } : null;
    this.save();
    return { lost, gone };
  },

  // venceu a sombra: as moedas voltam
  reclaim() {
    const n = this.echo?.coins ?? 0;
    this.coins += n;
    this.echo = null;
    this.save();
    return n;
  },

  // ponto de retorno: onde o jogador volta ao morrer ou ao continuar
  checkpoint(room: RoomId, entry: string, weapon: WeaponId) {
    this.room = room;
    this.entry = entry;
    this.weapon = weapon;
    this.save();
  },
};

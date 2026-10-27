import { AMBER_BAR, MAGE_IDS, MAGIC, PLAYER, POWERS, POWER_IDS, WEAPONS, WEAPON_IDS, type MageId, type PowerId, type WeaponId } from '../config';

// as quatro armas de começo do cavaleiro (as outras vêm dos chefes; os cajados são dos magos)
export const STARTERS: WeaponId[] = WEAPON_IDS.filter((w) => !WEAPONS[w].boss && !WEAPONS[w].mage);
// as armas que os chefes deixam: para o mago, cada uma vira uma Energia
export const BOSS_WEAPONS: WeaponId[] = WEAPON_IDS.filter((w) => !!WEAPONS[w].boss);
import { ROOMS, type Ability, type RoomId } from '../world/rooms';
import { NAME_MEMORY, OFFERS, SLOTS } from '../world/lore';
import { REGIONS, type RegionId } from '../world/regions';

// Progresso salvo no navegador: sala e entrada do último ponto, arma e memórias
export interface SaveData {
  room: RoomId;
  entry: string;
  weapon: WeaponId;
  // a arma escolhida no começo: vale para o jogo inteiro, as outras três não voltam
  // (null num save de antes dessa regra que estava com uma arma de chefe: escolhe uma vez).
  // No caminho do Mago é o cajado dele
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
  // as folhas do mapa compradas do Agrimensor (null num save de antes delas: ganha as das regiões já visitadas)
  maps: RegionId[] | null;
  // as rachaduras de corrupção na máscara (null num save de antes delas: uma por memória trocada)
  corruption: number | null;
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

// a corrupção: sobe ao trocar memória com o Cobrador e ao lembrar como dói menos; desce ao comprar uma
// memória de volta e quando uma prova confirma uma versão. A máscara mostra até CRACKS rachaduras
export const CORRUPTION_MAX = 12;
export const CORRUPTION_CRACKS = 6;
// quanto o Cobrador cobra para devolver uma memória trocada
export const BUYBACK_COST = 45;

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

// arma do começo: a gravada (ou o cajado do mago); num save antigo, a que ele estava usando (se não for de chefe)
const starterOf = (d: Partial<SaveData>): WeaponId | null => {
  if (STARTERS.includes(d.starter as WeaponId) || MAGE_IDS.includes(d.starter as MageId)) return d.starter as WeaponId;
  return STARTERS.includes(d.weapon as WeaponId) ? (d.weapon as WeaponId) : null;
};

const KEY = 'eclipse-progresso-v1';
// as salas que valem num save: todas as do mapa (tirado do próprio mapa, para nunca ficar atrás dele
// quando entra uma sala nova)
const ROOM_IDS = Object.keys(ROOMS) as RoomId[];
export const ABILITIES: Ability[] = ['dash', 'wall', 'double', 'hook', 'veil', 'cape', 'swim', 'light'];

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
      maps: Array.isArray(d.maps) ? (strs(d.maps).filter((m) => REGIONS.some((r) => r.id === m)) as RegionId[]) : null,
      corruption: num(d.corruption) ? Math.max(0, Math.min(CORRUPTION_MAX, Math.floor(d.corruption!))) : null,
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
  // folhas do mapa (uma por região): sem a folha, a região não aparece no mapa
  maps: new Set<RegionId>(),
  // rachaduras de corrupção na máscara (ver CORRUPTION_MAX)
  corruption: 0,

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
    this.maps = new Set();
    this.corruption = 0;
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
    // num save de antes das Esporas, o dash vinha de começo: quem já jogava continua com ele
    if (!d.maps) this.abilities.add('dash');
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
    // num save de antes das folhas, o mapa era de graça: ficam as das regiões que ele já pisou
    this.maps = new Set(d.maps ?? REGIONS.filter((r) => r.rooms.some((id) => this.visited.get(id)?.size)).map((r) => r.id));
    // num save de antes da corrupção, cada memória trocada já rachou a máscara (as provas lidas fecham
    // as delas quando o jogo confere as versões, ao entrar)
    this.corruption = d.corruption ?? Math.min(CORRUPTION_MAX, d.traded.length);
  },

  // ---------- a história ----------
  // a máscara racha (n > 0) ou fecha rachaduras (n < 0)
  corrupt(n: number) {
    this.corruption = Math.max(0, Math.min(CORRUPTION_MAX, this.corruption + n));
  },

  // o Cobrador devolve uma memória trocada, por moedas (false: não foi trocada ou não tem moeda)
  buyBack(id: string) {
    if (!this.traded.has(id) || this.coins < BUYBACK_COST) return false;
    this.coins -= BUYBACK_COST;
    this.traded.delete(id);
    this.corrupt(-1);
    this.save();
    return true;
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

  // dano de uma arma com as melhorias ligadas e o nível do ferreiro (no mago, também a Energia dos chefes)
  dmgFor(w: WeaponId) {
    return this.dmgMul * LEVEL_MUL[this.level(w)] * (this.mage ? 1 + MAGIC.energyDmg * this.energy : 1);
  },

  // ---------- magos ----------
  // o caminho do Mago: o cajado escolhido no começo (null no caminho do Cavaleiro)
  get mage(): MageId | null {
    return (this.starter && WEAPONS[this.starter].mage) || null;
  },

  // quantas Energias de chefe o mago já pegou (a arma de cada chefe vira uma)
  get energy() {
    return Math.min(MAGIC.maxEnergy, BOSS_WEAPONS.filter((w) => this.seen.has(`weapon:${w}`)).length);
  },

  // recarga da habilidade forte com a Energia (cada uma tira 10%)
  get skillCdMul() {
    return 1 - MAGIC.energyCd * this.energy;
  },

  // o que o chefe deixou já foi pego (a arma, ou a Energia no mago)
  claimed(w: WeaponId) {
    return this.seen.has(`weapon:${w}`);
  },

  // a Energia do Capataz faz a magia quebrar o Âmbar (no cavaleiro, quem quebra é a picareta)
  get mageBreaksAmber() {
    return !!this.mage && this.claimed('picareta');
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
  // de chefe: depois da vitória; de começo: só a escolhida (sem escolha gravada, qualquer uma).
  // O mago só tem o cajado dele (o que o chefe deixa vira Energia), e o cavaleiro nunca tem cajado
  hasWeapon(id: WeaponId) {
    if (this.mage) return id === this.starter;
    if (WEAPONS[id].mage) return false;
    if (WEAPONS[id].boss) return this.seen.has(`weapon:${id}`);
    return !this.starter || id === this.starter;
  },

  // escolhe a arma do começo de vez (jogo novo, ou a primeira troca num save antigo)
  setStarter(id: WeaponId) {
    if (WEAPONS[id].boss || WEAPONS[id].mage || this.starter) return;
    this.starter = id;
    this.save();
  },

  // ele lembra o nome dela (achou "O nome dela" e não trocou com o Cobrador)
  get knowsHerName() {
    return this.memories.has(NAME_MEMORY) && !this.traded.has(NAME_MEMORY);
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
      powers: [...this.powers], power: this.power, amber: Math.round(this.amber * 100) / 100, maps: [...this.maps],
      corruption: this.corruption,
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

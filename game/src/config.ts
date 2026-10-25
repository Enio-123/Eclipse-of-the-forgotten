// Resolução interna (escalada para a tela com pixels nítidos)
export const VIEW_W = 640;
export const VIEW_H = 360;
export const TILE = 16;
// Ajustes de movimento e combate do cavaleiro (px, px/s, px/s², segundos)
export const PLAYER = {
  bodyW: 14,
  bodyH: 42,
  crouchH: 26,
  // corrida com a espada (peso médio); as outras armas mudam isso pelo peso (WeaponDef.speed)
  runSpeed: 224,
  crouchSpeed: 70,
  groundAccel: 3000,
  groundDecel: 3600,
  airAccel: 1900,
  airDecel: 1200,
  gravity: 1250,
  maxFall: 470,
  jumpVel: 480,
  fallGravity: 0.08,
  apexHang: 0.55,
  jumpCut: 0.42,
  coyote: 0.1,
  jumpBuffer: 0.12,
  // golpe apertado antes do fim da recarga fica guardado por este tempo
  attackBuffer: 0.14,
  dashSpeed: 460,
  // dash fantasma: atravessa inimigos e golpes sem levar dano (e um respiro logo depois)
  dashTime: 0.204,
  dashCooldown: 0.42,
  ghostGrace: 0.08,
  slideSpeed: 360,
  slideTime: 0.34,
  pogoVel: 400,
  // Garras de Ferro: escorregar e pular da parede
  wallSlide: 95,
  wallJumpVx: 250,
  wallJumpVy: 440,
  wallLock: 0.15,
  // Pena do Eclipse: segundo pulo no ar
  doubleJumpVel: 420,
  // Gancho de Corrente: alcance, voo da ponta, puxada e o impulso no fim (para passar da argola)
  hookRange: 180,
  hookSpeed: 1500,
  hookPull: 540,
  hookPop: 300,
  hookMaxPull: 0.75,
  hookCd: 0.22,
  hookDmg: 0.5,
  maxHp: 5,
  invuln: 1.1,
  hurtLock: 0.22,
  knockX: 230,
  knockY: 230,
};

export type WeaponId = 'sword' | 'scythe' | 'daggers' | 'bow' | 'badalo' | 'incensario' | 'corrente';
export const WEAPON_IDS: WeaponId[] = ['sword', 'scythe', 'daggers', 'bow', 'badalo', 'incensario', 'corrente'];

export interface WeaponDef {
  id: WeaponId;
  name: string;
  summary: string;
  dmg: number;
  cooldown: number; // tempo entre ataques
  windup: number; // atraso até o golpe acertar
  active: number; // janela em que o golpe acerta
  reach: number; // alcance horizontal do golpe
  height: number; // altura da área do golpe
  recoil: number;
  moveMul: number; // velocidade enquanto ataca
  ranged: boolean;
  // peso: multiplica a corrida (pesada é mais lenta, leve é mais rápida)
  speed: number;
  // arma de chefe: só aparece liberada depois de vencer esse chefe (art: artigo do nome, para "vença o"
  // e "arma do"; found: o que o cavaleiro pensa ao pegar)
  boss?: { id: string; name: string; art: 'o' | 'a'; found: string };
  // pancada no chão que solta uma onda (o badalo)
  quake?: boolean;
  // onde o golpe passa fica uma nuvem de incenso que queima os inimigos (o incensário)
  smoke?: boolean;
  // o gancho na ponta puxa os inimigos leves para perto (a corrente)
  pull?: boolean;
  stats: { dano: number; velocidade: number; alcance: number; corrida: number };
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword: {
    id: 'sword', name: 'Espada', summary: 'Equilibrada em tudo. Boa para aprender.',
    dmg: 1, cooldown: 0.32, windup: 0, active: 0.1, reach: 50, height: 40, recoil: 140, moveMul: 1, ranged: false, speed: 1,
    stats: { dano: 3, velocidade: 3, alcance: 3, corrida: 3 },
  },
  scythe: {
    id: 'scythe', name: 'Foice', summary: 'Alcance longo e muito dano, mas lenta.',
    dmg: 2.2, cooldown: 0.66, windup: 0.13, active: 0.13, reach: 84, height: 54, recoil: 70, moveMul: 0.45, ranged: false, speed: 0.94,
    stats: { dano: 5, velocidade: 1, alcance: 5, corrida: 2 },
  },
  daggers: {
    id: 'daggers', name: 'Adagas duplas', summary: 'Muito rápidas, pouco dano e alcance curto.',
    dmg: 0.6, cooldown: 0.15, windup: 0, active: 0.07, reach: 34, height: 32, recoil: 90, moveMul: 1, ranged: false, speed: 1.1,
    stats: { dano: 2, velocidade: 5, alcance: 1, corrida: 5 },
  },
  bow: {
    id: 'bow', name: 'Arco', summary: 'Ataca de longe, dano médio e tiro rápido.',
    dmg: 1, cooldown: 0.36, windup: 0.06, active: 0, reach: 0, height: 0, recoil: 0, moveMul: 0.85, ranged: true, speed: 1.05,
    stats: { dano: 3, velocidade: 4, alcance: 5, corrida: 4 },
  },
  badalo: {
    id: 'badalo', name: 'Badalo do Sineiro', summary: 'Pesadíssimo. No chão, a pancada solta uma onda que derruba.',
    dmg: 3, cooldown: 0.8, windup: 0.19, active: 0.12, reach: 60, height: 50, recoil: 50, moveMul: 0.35, ranged: false, speed: 0.86,
    boss: { id: 'sineiro', name: 'Sineiro', art: 'o', found: 'Pesado como um sino. Dá para usar em Trocar arma, no menu de pausa.' }, quake: true,
    stats: { dano: 5, velocidade: 1, alcance: 4, corrida: 1 },
  },
  incensario: {
    id: 'incensario', name: 'Incensário do Arcebispo', summary: 'Golpe largo pela corrente. Onde passa, fica incenso que queima.',
    dmg: 1.8, cooldown: 0.55, windup: 0.12, active: 0.12, reach: 72, height: 56, recoil: 80, moveMul: 0.55, ranged: false, speed: 0.95,
    boss: { id: 'arcebispo', name: 'Arcebispo', art: 'o', found: 'Ainda quente. Onde ele passa, o incenso fica e queima. Dá para usar em Trocar arma, no menu de pausa.' },
    smoke: true,
    stats: { dano: 4, velocidade: 2, alcance: 4, corrida: 3 },
  },
  corrente: {
    id: 'corrente', name: 'Corrente da Carcereira', summary: 'Alcance enorme e golpe fino. O gancho puxa os inimigos leves para perto.',
    dmg: 1.4, cooldown: 0.5, windup: 0.1, active: 0.12, reach: 112, height: 26, recoil: 60, moveMul: 0.6, ranged: false, speed: 0.98,
    boss: { id: 'carcereira', name: 'Carcereira', art: 'a', found: 'Ainda balança. O gancho puxa quem é leve. Dá para usar em Trocar arma, no menu de pausa.' },
    pull: true,
    stats: { dano: 3, velocidade: 3, alcance: 5, corrida: 3 },
  },
};

// nuvem do incensário: fica onde o golpe passou e queima cada inimigo uma vez
export const INCENSE = { life: 1.3, w: 44, h: 34, dmg: 0.6 };

// onda do badalo: corre rente ao chão para a frente e acerta cada inimigo uma vez
export const QUAKE = { speed: 300, life: 0.4, dmg: 1, height: 16 };

export const ARROW = { speed: 620, life: 0.85, gravity: 0 };

export const CRAWLER = {
  bodyW: 28,
  bodyH: 20,
  speed: 38,
  hp: 3,
  knock: 170,
  knockTime: 0.16,
};

// Guarda do Dízimo: bloqueia tudo que vem pela frente. Corte alto (agache ou deslize por baixo),
// golpe de escudo baixo (pule). Deslizar nas pernas derruba e deixa ele aberto um instante.
export const GUARD = {
  bodyW: 22,
  bodyH: 54,
  hp: 7,
  walk: 46,
  sight: 220,
  keep: 40,
  reach: 62,
  turnDelay: 0.55,
  windup: 0.55,
  strike: 0.2,
  strikeActive: 0.13,
  recover: 0.5,
  bashWind: 0.42,
  bashSpeed: 250,
  bashTime: 0.24,
  atkCd: 0.9,
  downTime: 1.35,
  tripCd: 3.0,
};

// Carcereiro: corrente estalada na altura do peito (agache, deslize ou apare) e o soco de ferro no
// chão de perto (pule). Sem escudo: fica aberto depois de cada golpe.
export const JAILER = {
  bodyW: 24,
  bodyH: 54,
  hp: 6,
  walk: 50,
  sight: 230,
  lashReach: 124,
  lashWind: 0.55,
  lashActive: 0.16,
  lashRec: 0.6,
  slamReach: 58,
  slamWind: 0.62,
  slamActive: 0.12,
  slamRec: 0.75,
  atkCd: 0.95,
};

// A Carcereira: corrente alta (agache), varrida no chão (pule), gancho em linha reta (saia da linha
// ou apare a ponta) e gaiolas que caem do teto. Com metade da vida chama dois carcereiros.
export const CARCEREIRA = {
  bodyW: 30,
  bodyH: 100,
  hp: 54,
  walk: 66,
  phase2: 0.5,
  think: 0.65,
  lashReach: 220,
  lashWind: 0.7,
  lashActive: 0.2,
  lashRec: 0.75,
  sweepReach: 210,
  sweepWind: 0.65,
  sweepActive: 0.22,
  sweepRec: 0.7,
  hookWind: 0.6,
  hookSpeed: 540,
  hookRange: 300,
  hookBack: 420,
  yankWind: 0.55,
  yankCd: 6,
  cageWarn: 0.95,
  stagger: 1.8,
};

// Corvo do Dízimo: paira, avisa com o olho aceso e mergulha em linha reta
export const CROW = {
  bodyW: 18,
  bodyH: 14,
  hp: 2,
  sight: 190,
  windup: 0.5,
  diveSpeed: 320,
  diveTime: 0.9,
  stuckTime: 0.9,
  cooldown: 1.5,
};

// Arqueiro da sacada: fica no balcão, mira devagar (a fenda da máscara acende) e solta uma flecha
// mirada no cavaleiro. Um golpe na flecha bem na hora rebate ela de volta.
export const ARCHER = {
  bodyW: 16,
  bodyH: 46,
  hp: 3,
  sight: 300,
  draw: 0.8,
  cooldown: 1.6,
  arrowSpeed: 270,
  arrowLife: 2.4,
  // flecha rebatida: volta mais rápida e machuca quem atirou
  backSpeed: 560,
  backDmg: 2,
};

// Penitente do incensário: anda devagar, ergue o incensário (os furos acendem) e bate na frente.
// Onde o incensário cai fica uma nuvem de incenso que machuca por um tempo.
export const CENSER = {
  bodyW: 20,
  bodyH: 50,
  hp: 5,
  walk: 40,
  sight: 190,
  keep: 50,
  reach: 70,
  windup: 0.62,
  active: 0.22,
  recover: 0.7,
  atkCd: 1.2,
  smoke: 1.6,
  smokeW: 40,
  smokeH: 24,
};

// O Eco: a sombra do cavaleiro que guarda as moedas perdidas na morte. Paira, segue devagar e
// avança num corte (dá para aparar no fim da preparação). Só machuca no corte.
export const ECHO = {
  bodyW: 14,
  bodyH: 42,
  hp: 5,
  // acorda quando o cavaleiro chega perto (e não nos primeiros instantes da sala)
  sight: 210,
  sightY: 140,
  calm: 1.4,
  speed: 96,
  accel: 430,
  // distância que ela gosta de manter antes de avançar
  keep: 60,
  reach: 150,
  windup: 0.5,
  // avanço curto: para na frente do cavaleiro, o corte cobre o resto
  lunge: 330,
  lungeTime: 0.24,
  active: 0.17,
  recover: 0.62,
  atkCd: [0.9, 1.5] as const,
  hurt: 0.2,
  knock: 170,
  // longe demais de onde ficou: volta para lá e espera
  leash: 320,
};

// Aparar: golpear no fim da preparação ou no golpe do inimigo rebate o ataque e deixa ele tonto.
// Enquanto está tonto, os golpes entram com bônus.
export const PARRY = {
  early: 0.2,
  stagger: 1.4,
  bonus: 1.5,
  hitstop: 0.12,
};

// O que cada inimigo solta ao morrer: moedas (mín, máx) e quanto vale para a próxima lasca de
// vida (a cada 1 completo cai uma, se o cavaleiro estiver ferido)
export const LOOT = {
  crawler: { coins: [2, 4], life: 0.5 },
  crow: { coins: [3, 5], life: 0.5 },
  guard: { coins: [7, 10], life: 1 },
  archer: { coins: [3, 5], life: 0.5 },
  censer: { coins: [4, 7], life: 0.75 },
  jailer: { coins: [6, 9], life: 0.75 },
  boss: { coins: [40, 40], life: 2 },
  // a sombra devolve as moedas dela direto na bolsa
  echo: { coins: [0, 0], life: 0 },
  magnet: 56,
  pickupDelay: 0.35,
  lifeTime: 16,
} as const;

// O Sineiro, primeiro chefe (tempos em segundos)
export const BOSS = {
  bodyW: 46,
  bodyH: 96,
  hp: 30,
  walk: 62,
  // abaixo desta fração da vida ele urra e os sinos começam a cair
  phase2: 0.5,
  think: 0.75,
  slamWind: 0.78,
  slamRec: 0.95,
  waveSpeed: 235,
  waveLife: 1.7,
  sweepWind: 0.6,
  sweepTime: 0.3,
  sweepRec: 0.55,
  chargeWind: 0.62,
  chargeSpeed: 340,
  stunTime: 1.9,
  bellEvery: 2.6,
  bellWarn: 0.85,
};

// O Arcebispo do Dízimo, segundo chefe (tempos em segundos)
export const ARCEBISPO = {
  bodyW: 32,
  bodyH: 108,
  hp: 44,
  glide: 58,
  // abaixo desta fração da vida o vitral quebra
  phase2: 0.5,
  think: 0.7,
  // incensário por cima da cabeça até o chão na frente (dá para aparar)
  swingWind: 0.74,
  swingActive: 0.2,
  swingRec: 0.8,
  swingReach: 112,
  stagger: 1.9,
  // arremesso rente ao chão: vai, deixa a nuvem e volta pela corrente
  tossWind: 0.6,
  tossRange: 236,
  tossOut: 470,
  tossBack: 300,
  // chuva do dízimo: sombras no chão antes das moedas caírem (os tablados protegem)
  titheWind: 0.55,
  titheWarn: 0.9,
  titheGap: 0.7,
  // some na fumaça e reaparece perto do cavaleiro
  vanish: 0.45,
  hidden: 0.65,
  // nuvem que o incensário deixa no chão
  cloud: 2.2,
  cloudW: 52,
  cloudH: 28,
  // fachos de luz do vitral quebrado (beamEvery: pausa depois que um facho some)
  beamEvery: 4.2,
  beamWarn: 0.95,
  beamSpeed: 175,
  beamHalf: 8,
};

// Paleta do mundo presente (dark fantasy frio)
export const PAL = {
  void: 0x07080d,
  skyTop: 0x0b0d15,
  skyBottom: 0x1d2232,
  far: 0x161a27,
  mid: 0x10131c,
  stone: 0x232735,
  stoneDark: 0x181b26,
  stoneLight: 0x323748,
  edge: 0x4a5068,
  mask: 0xe8e4da,
  maskShade: 0xb0aa9e,
  gold: 0xf0c468,
  ink: 0x0e0f17,
};

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
  maxHp: 5,
  invuln: 1.1,
  hurtLock: 0.22,
  knockX: 230,
  knockY: 230,
};

export type WeaponId = 'sword' | 'scythe' | 'daggers' | 'bow' | 'badalo';
export const WEAPON_IDS: WeaponId[] = ['sword', 'scythe', 'daggers', 'bow', 'badalo'];

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
};

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

// O que cada inimigo solta ao morrer: moedas (mín, máx) e quanto vale para a próxima lasca de
// vida (a cada 1 completo cai uma, se o cavaleiro estiver ferido)
export const LOOT = {
  crawler: { coins: [2, 4], life: 0.5 },
  crow: { coins: [3, 5], life: 0.5 },
  guard: { coins: [7, 10], life: 1 },
  boss: { coins: [40, 40], life: 2 },
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

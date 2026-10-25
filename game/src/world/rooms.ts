import type { Theme } from './Level';
import { MAP_CATACUMBAS, MAP_CRIPTA, MAP_MEMORIA, MAP_PONTE, MAP_SINOS } from './maps';
import type { AmbienceId, TrackId } from '../systems/Audio';

export type RoomId = 'ponte' | 'catacumbas' | 'memoria' | 'sinos' | 'cripta';
export type Ability = 'wall' | 'double';
export type Side = 'left' | 'right';

export interface Exit {
  side: Side;
  to: RoomId;
  entry: string;
}

// Dica de controle mostrada quando o cavaleiro passa por um trecho (em tiles)
export interface HintDef {
  x0: number;
  x1: number;
  text: string;
  // só some quando o jogador usar esta ação
  until?: string;
  // só aparece depois de ganhar esta habilidade
  needs?: Ability;
}

// Pensamento do cavaleiro, mostrado uma única vez
export interface ThoughtDef {
  x: number;
  text: string;
}

export interface RoomDef {
  id: RoomId;
  map: string[];
  theme: Theme;
  title: string;
  subtitle: string;
  exits: Exit[];
  pit: boolean;
  rain: boolean;
  lightning: boolean;
  drips: number;
  petals: boolean;
  motes: boolean;
  music: TrackId;
  ambience: AmbienceId;
  noAttack?: boolean;
  hints: HintDef[];
  thoughts: ThoughtDef[];
}

export const ROOMS: Record<RoomId, RoomDef> = {
  ponte: {
    id: 'ponte',
    map: MAP_PONTE,
    theme: 'bridge',
    title: 'Ponte do Castelo',
    subtitle: 'Vespera',
    exits: [{ side: 'right', to: 'catacumbas', entry: '1' }],
    pit: true,
    rain: true,
    lightning: true,
    drips: 14,
    petals: false,
    motes: false,
    music: 'bridge',
    ambience: 'rain',
    hints: [
      { x0: 9, x1: 25, text: '{left} {right} andar', until: 'move' },
      { x0: 27, x1: 44, text: '{attack} atacar', until: 'attack' },
      { x0: 46, x1: 53, text: '{jump} pular · segure para subir mais', until: 'jump' },
      { x0: 78, x1: 86, text: '{dash} dash · também funciona no ar', until: 'dash' },
      { x0: 104, x1: 116, text: 'No ar, {down} + {attack} golpeia para baixo e rebate nos espinhos', until: 'pogo' },
      { x0: 126, x1: 134, text: '{crouch} agachar · agachado + {dash} desliza', until: 'slide' },
      { x0: 144, x1: 150, text: 'O guarda bloqueia de frente. Deslize nas pernas dele ou bata pelas costas', until: 'trip' },
    ],
    thoughts: [
      { x: 16, text: 'A chuva sabe o meu nome. Eu não.' },
      { x: 58, text: 'Corvos do dízimo. Contam o que a gente ainda deve.' },
      { x: 145, text: 'Os guardas do dízimo nunca baixam o escudo. Só caem.' },
      { x: 158, text: 'Já atravessei este portão muitas vezes. Nunca sozinho.' },
    ],
  },
  catacumbas: {
    id: 'catacumbas',
    map: MAP_CATACUMBAS,
    theme: 'catacomb',
    title: 'Catacumbas de Vespera',
    subtitle: 'Onde dormem os que esqueceram',
    exits: [{ side: 'left', to: 'ponte', entry: '2' }, { side: 'right', to: 'sinos', entry: '1' }],
    pit: false,
    rain: false,
    lightning: false,
    drips: 26,
    petals: false,
    motes: true,
    music: 'crypt',
    ambience: 'crypt',
    hints: [
      { x0: 26, x1: 40, text: '{down} + {jump} desce das plataformas finas' },
      { x0: 58, x1: 63, text: 'No ar, encostado na parede, {jump} pula para o outro lado', needs: 'wall', until: 'walljump' },
    ],
    thoughts: [
      { x: 12, text: 'Aqui embaixo ficam os que pagaram demais.' },
      { x: 92, text: 'Há alguém do outro lado do espelho.' },
    ],
  },
  sinos: {
    id: 'sinos',
    map: MAP_SINOS,
    theme: 'catacomb',
    title: 'Galeria dos Sinos',
    subtitle: 'Onde se toca pela última memória',
    exits: [{ side: 'left', to: 'catacumbas', entry: '3' }, { side: 'right', to: 'cripta', entry: '1' }],
    pit: false,
    rain: false,
    lightning: false,
    drips: 30,
    petals: false,
    motes: true,
    music: 'crypt',
    ambience: 'crypt',
    hints: [
      { x0: 46, x1: 52, text: 'No ar, encostado na parede, {jump} pula para o outro lado', needs: 'wall', until: 'walljump' },
      { x0: 66, x1: 70, text: 'No ar, {jump} de novo: pulo duplo', needs: 'double', until: 'doublejump' },
    ],
    thoughts: [
      { x: 9, text: 'Alguém conta moedas no escuro.' },
      { x: 46, text: 'Lá em cima os sinos ainda tocam. Ninguém sobe para tocá-los.' },
    ],
  },
  cripta: {
    id: 'cripta',
    map: MAP_CRIPTA,
    theme: 'catacomb',
    title: 'Cripta do Sineiro',
    subtitle: 'O fim das catacumbas',
    exits: [{ side: 'left', to: 'sinos', entry: '2' }],
    pit: false,
    rain: false,
    lightning: false,
    drips: 18,
    petals: false,
    motes: true,
    music: 'crypt',
    ambience: 'crypt',
    hints: [],
    thoughts: [
      { x: 6, text: 'O sineiro tocava o sino quando alguém pagava a última memória.' },
    ],
  },
  memoria: {
    id: 'memoria',
    map: MAP_MEMORIA,
    theme: 'memory',
    title: 'Lembrança',
    subtitle: 'O vale, antes do eclipse',
    exits: [],
    pit: false,
    rain: false,
    lightning: false,
    drips: 0,
    petals: true,
    motes: false,
    music: 'memory',
    ambience: 'wind',
    noAttack: true,
    hints: [],
    thoughts: [
      { x: 8, text: 'Sol. Eu tinha esquecido o sol.' },
      { x: 104, text: 'Eu conheço essa capa.' },
    ],
  },
};

// Onde cada sala fica no mapa (em tiles). A memória do vale não aparece no mapa.
export const MAP_POS: Partial<Record<RoomId, { x: number; y: number }>> = {
  ponte: { x: 0, y: 0 },
  catacumbas: { x: 180, y: 12 },
  sinos: { x: 290, y: -2 },
  cripta: { x: 386, y: -9 },
};

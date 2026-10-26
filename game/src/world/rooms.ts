import type { Theme } from './Level';
import {
  MAP_ABISMO, MAP_ALTAR, MAP_ARENA, MAP_BOCA, MAP_CAPATAZ, MAP_CATACUMBAS, MAP_CELAS, MAP_CLAUSTRO, MAP_CORRENTES, MAP_CRIPTA,
  MAP_ESCADARIA, MAP_ESPELHOS, MAP_FOSSO, MAP_FUGA, MAP_GALERIA, MAP_GUARITA, MAP_MASCARA, MAP_MEMORIA, MAP_NAVE, MAP_POCO,
  MAP_PONTE, MAP_PRACA, MAP_PRENSAS, MAP_RUA, MAP_SINOS, MAP_TELHADOS, MAP_TRILHOS, MAP_VEIO,
} from './maps';
import type { AmbienceId, TrackId } from '../systems/Audio';
import type { Upgrade } from '../systems/Save';
import type { FindId } from './Finds';

export type RoomId =
  | 'ponte' | 'catacumbas' | 'memoria' | 'sinos' | 'cripta'
  | 'escadaria' | 'praca' | 'rua' | 'telhados' | 'nave' | 'claustro' | 'galeria' | 'altar'
  | 'poco' | 'celas' | 'correntes' | 'guarita' | 'fuga' | 'arena' | 'mascara' | 'fosso' | 'abismo'
  | 'boca' | 'trilhos' | 'prensas' | 'veio' | 'espelhos' | 'capataz';
export type Ability = 'wall' | 'double' | 'hook' | 'veil';
export type Side = 'left' | 'right' | 'up' | 'down';

export interface Exit {
  side: Side;
  to: RoomId;
  entry: string;
  // trecho da borda que é saída, em tiles: linhas (esquerda e direita) ou colunas (cima e baixo)
  range?: [number, number];
}

// porta (cada 'O' do mapa, na ordem): entra apertando para cima
export interface DoorDef {
  to: RoomId;
  entry: string;
  // trancada até esta marca existir no progresso; locked é o que o cavaleiro pensa ao tentar
  key?: string;
  locked?: string;
  // tranca por dentro: deste lado, abrir tira a tranca (grava a marca para sempre)
  bar?: boolean;
}

export type BossId = 'sineiro' | 'arcebispo' | 'carcereira' | 'sombra' | 'reflexo' | 'capataz';

// alçapão (cada grupo de '=' do mapa, de cima para baixo e da esquerda para a direita): sólido até a
// marca existir. auto: com esta outra marca, ele cai sozinho quando o cavaleiro chega perto
// (grava a marca dele e mostra o pensamento)
export interface TrapdoorDef {
  key: string;
  auto?: string;
  thought?: string;
  // 'stone': não é tampa de madeira, é a laje do chão que racha e despenca
  look?: 'stone';
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

// Pensamento do cavaleiro, mostrado uma única vez (y: só perto desta linha)
export interface ThoughtDef {
  x: number;
  y?: number;
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
  doors?: DoorDef[];
  // marca que abre cada coluna de 'Y' (na ordem das colunas)
  locks?: string[];
  // falas de cada esquecido 'E' (na ordem do mapa): ele repete a última
  npcs?: string[][];
  boss?: BossId;
  trapdoors?: TrapdoorDef[];
  // quanto da pintura a óleo cobre a tela (0 a 1); sem isto vale o do tema
  paint?: number;
  // lanternas penduradas (tile do gancho de cima): a corrente, o braço de ferro ou a viga vêm do que
  // estiver perto (Fixtures.hang)
  lanterns?: [number, number][];
  // quantos tufos de cogumelos que brilham, no máximo, no pé das paredes e embaixo das lajes
  fungus?: number;
  // Minas: trilhos no chão (de x0 a x1, na linha do chão) além da linha do vagonete, e lamparinas
  // penduradas (tile do gancho; a corrente ou o braço vêm do que estiver perto)
  rails?: [number, number, number][];
  lamps?: [number, number][];
  // o que sai de cada baú '$' além das moedas (na ordem do mapa; null: só moedas)
  cacheItems?: (Upgrade | null)[];
  // achados no chão (tile da célula onde ficam, o chão logo embaixo). needs: a marca que faz ele
  // aparecer (sem ela ainda não está lá); from: de onde ele pula quando a marca acontece na sala
  // (em pixels, a partir do ponto onde fica)
  finds?: { id: FindId; x: number; y: number; needs?: string; from?: [number, number] }[];
}

// salas do prólogo
const PROLOGUE: Record<'ponte' | 'catacumbas' | 'sinos' | 'cripta' | 'memoria', RoomDef> = {
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
    exits: [{ side: 'left', to: 'sinos', entry: '2' }, { side: 'right', to: 'escadaria', entry: '1', range: [16, 19] }],
    locks: ['boss:sineiro'],
    boss: 'sineiro',
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

// ---------- capítulo 2: a Cidade-Catedral ----------
const CITY: Pick<RoomDef, 'pit' | 'rain' | 'lightning' | 'petals' | 'motes'> = { pit: false, rain: false, lightning: false, petals: false, motes: true };

const CHAPTER2: Record<'escadaria' | 'praca' | 'rua' | 'telhados' | 'nave' | 'claustro' | 'galeria' | 'altar', RoomDef> = {
  escadaria: {
    id: 'escadaria',
    map: MAP_ESCADARIA,
    theme: 'catacomb',
    title: 'Escadaria dos Penitentes',
    subtitle: 'A subida para a cidade',
    exits: [
      { side: 'left', to: 'cripta', entry: '2', range: [32, 35] },
      { side: 'right', to: 'praca', entry: '1', range: [7, 10] },
      { side: 'right', to: 'poco', entry: '2', range: [33, 35] },
    ],
    locks: ['lever:poco:0'],
    ...CITY,
    drips: 16,
    music: 'crypt',
    ambience: 'crypt',
    hints: [],
    thoughts: [
      { x: 6, y: 35, text: 'Degraus gastos de joelhos. Muita gente subiu por aqui e não voltou.' },
      { x: 17, y: 12, text: 'Lá em cima tem luz. E sinos.' },
    ],
  },
  praca: {
    id: 'praca',
    map: MAP_PRACA,
    theme: 'city',
    title: 'Praça do Cadafalso',
    subtitle: 'Cidade-Catedral de Vespera',
    exits: [
      { side: 'left', to: 'escadaria', entry: '2', range: [25, 28] },
      { side: 'right', to: 'rua', entry: '1', range: [25, 28] },
      { side: 'down', to: 'poco', entry: '1', range: [54, 58] },
    ],
    doors: [{ to: 'nave', entry: 'O1', key: 'short:catedral', locked: 'Trancada por dentro. A catedral não abre para quem bate.' }],
    trapdoors: [{ key: 'trap:praca', auto: 'boss:arcebispo', thought: 'O alçapão do cadafalso cedeu. Lá embaixo, correntes.' }],
    npcs: [
      ['Você também veio pagar? A fila anda devagar, mas anda.', 'Eu tinha uma filha. Ou um cachorro. Paguei os dois.', 'O Arcebispo conta tudo. Até o que a gente esqueceu.'],
      ['Não olhe para o cadafalso. Ali penduram quem lembra demais.', 'Dizem que dá para entrar na catedral pelos telhados. Ninguém sobe mais.'],
    ],
    ...CITY,
    drips: 0,
    music: 'city',
    ambience: 'city',
    hints: [],
    thoughts: [
      { x: 8, text: 'Uma cidade inteira acordada. Ninguém lembra por quê.' },
      { x: 56, text: 'Velas acesas no cadafalso. Alguém ainda cuida dele.' },
    ],
  },
  rua: {
    id: 'rua',
    map: MAP_RUA,
    theme: 'city',
    title: 'Rua dos Penitentes',
    subtitle: 'Onde o dízimo se paga de joelhos',
    exits: [{ side: 'left', to: 'praca', entry: '2', range: [31, 34] }, { side: 'up', to: 'telhados', entry: '1', range: [121, 149] }],
    npcs: [['Não pise nos incensários. A fumaça faz esquecer o caminho de casa.', 'Os arqueiros das sacadas atiram em quem anda de cabeça erguida.']],
    ...CITY,
    drips: 0,
    music: 'city',
    ambience: 'city',
    hints: [
      { x0: 22, x1: 34, text: 'Golpeie no instante do ataque inimigo para aparar', until: 'parry' },
    ],
    thoughts: [
      { x: 5, text: 'As janelas estão acesas. Ninguém olha para fora.' },
      { x: 118, text: 'A casa caiu em cima da rua. Só dá para seguir por cima.' },
      { x: 135, y: 6, text: 'Os telhados ficam logo acima. Um pulo e outro no ar.' },
    ],
  },
  telhados: {
    id: 'telhados',
    map: MAP_TELHADOS,
    theme: 'city',
    title: 'Telhados',
    subtitle: 'Acima da cidade que esquece',
    exits: [{ side: 'down', to: 'rua', entry: '3', range: [125, 146] }, { side: 'left', to: 'nave', entry: '1', range: [20, 24] }],
    ...CITY,
    drips: 0,
    music: 'city',
    ambience: 'wind',
    hints: [],
    thoughts: [
      { x: 112, text: 'Daqui se vê a catedral inteira. E ela me vê.' },
      { x: 58, y: 12, text: 'Um sino sem sineiro. Alguém ainda devia tocá-lo.' },
      { x: 12, y: 24, text: 'O vitral está rachado. Do outro lado, a nave.' },
    ],
  },
  nave: {
    id: 'nave',
    map: MAP_NAVE,
    theme: 'nave',
    title: 'Nave da Catedral',
    subtitle: 'Onde o dízimo é contado',
    exits: [{ side: 'right', to: 'telhados', entry: '2', range: [14, 18] }, { side: 'left', to: 'claustro', entry: '1', range: [32, 35] }],
    doors: [
      { to: 'galeria', entry: 'O0' },
      { to: 'praca', entry: 'O0', key: 'short:catedral', bar: true },
    ],
    ...CITY,
    drips: 10,
    music: 'nave',
    ambience: 'nave',
    hints: [],
    thoughts: [
      { x: 110, y: 18, text: 'Bancos vazios. Todos rezam lá fora e ninguém entra.' },
      { x: 60, y: 35, text: 'Um sino pendurado acima do lustre. Mudo há muito tempo.' },
    ],
  },
  claustro: {
    id: 'claustro',
    map: MAP_CLAUSTRO,
    theme: 'city',
    title: 'Claustro',
    subtitle: 'O jardim das irmãs',
    exits: [{ side: 'right', to: 'nave', entry: '2', range: [32, 35] }],
    npcs: [['As irmãs cantavam aqui. Agora só a cega canta, e ela canta lá fora.', 'Atrás da arcada guardavam o que não cabia no dízimo.']],
    ...CITY,
    drips: 0,
    music: 'nave',
    ambience: 'wind',
    hints: [],
    thoughts: [{ x: 45, text: 'A fonte ainda corre. A água não esquece o caminho.' }],
  },
  galeria: {
    id: 'galeria',
    map: MAP_GALERIA,
    theme: 'nave',
    title: 'Galeria dos Vitrais',
    subtitle: 'A luz que sobrou',
    exits: [{ side: 'right', to: 'altar', entry: '1', range: [23, 26] }, { side: 'down', to: 'nave', entry: '4', range: [40, 46] }],
    doors: [{ to: 'nave', entry: 'O0' }],
    ...CITY,
    drips: 6,
    music: 'nave',
    ambience: 'nave',
    hints: [],
    thoughts: [
      { x: 30, text: 'Cada vitral é alguém que pagou tudo. Ainda brilham.' },
      { x: 104, text: 'Lá dentro alguém conta moedas. Alto.' },
    ],
  },
  altar: {
    id: 'altar',
    map: MAP_ALTAR,
    theme: 'nave',
    title: 'Altar do Dízimo',
    subtitle: 'O fim da cidade',
    exits: [{ side: 'left', to: 'galeria', entry: '2', range: [25, 28] }],
    boss: 'arcebispo',
    ...CITY,
    drips: 0,
    music: 'nave',
    ambience: 'nave',
    hints: [],
    thoughts: [{ x: 6, text: 'Um altar feito de moedas. Ele esperava por mim.' }],
  },
};

// ---------- capítulo 3: a Prisão Subterrânea ----------
const PRISON: Pick<RoomDef, 'pit' | 'rain' | 'lightning' | 'petals' | 'motes'> = { pit: false, rain: false, lightning: false, petals: false, motes: true };

const CHAPTER3: Record<'poco' | 'celas' | 'correntes' | 'guarita' | 'fuga' | 'arena' | 'mascara' | 'fosso' | 'abismo', RoomDef> = {
  poco: {
    id: 'poco',
    map: MAP_POCO,
    theme: 'prison',
    title: 'Poço dos Condenados',
    subtitle: 'Prisão Subterrânea',
    exits: [
      { side: 'up', to: 'praca', entry: '3', range: [54, 58] },
      { side: 'left', to: 'escadaria', entry: '3', range: [17, 19] },
      { side: 'right', to: 'celas', entry: '1', range: [37, 40] },
    ],
    locks: ['lever:poco:0'],
    ...PRISON,
    drips: 24,
    music: 'prison',
    ambience: 'prison',
    hints: [{ x0: 4, x1: 9, text: '{attack} na alavanca', until: 'lever' }],
    thoughts: [
      { x: 50, y: 15, text: 'Jogavam os condenados por aqui. Eu sei, porque eu empurrava.' },
      { x: 8, y: 19, text: 'Uma alavanca. Do outro lado da grade, a escadaria dos penitentes.' },
      { x: 30, y: 40, text: 'Ossos com algemas. Ninguém veio buscar.' },
    ],
  },
  celas: {
    id: 'celas',
    map: MAP_CELAS,
    theme: 'prison',
    title: 'Corredor das Celas',
    subtitle: 'Onde se espera a sentença',
    exits: [
      { side: 'left', to: 'poco', entry: '3', range: [33, 40] },
      { side: 'right', to: 'correntes', entry: '1', range: [33, 40] },
      { side: 'down', to: 'fuga', entry: '2', range: [93, 97] },
    ],
    doors: [{ to: 'arena', entry: 'O0' }],
    trapdoors: [{ key: 'lever:fuga:0' }],
    ...PRISON,
    drips: 20,
    music: 'prison',
    ambience: 'prison',
    hints: [],
    thoughts: [
      { x: 8, text: 'Cada porta tem um número riscado. Eu sabia todos de cor.' },
      { x: 95, text: 'Um alçapão no chão, trancado por baixo.' },
      { x: 133, y: 27, text: 'Uma grade que nenhuma chave abre. Um dia alguma coisa vai passar por ela.' },
    ],
  },
  correntes: {
    id: 'correntes',
    map: MAP_CORRENTES,
    theme: 'prison',
    title: 'Sala das Correntes',
    subtitle: 'Onde se pendurava a sentença',
    exits: [
      { side: 'left', to: 'celas', entry: '2', range: [37, 40] },
      { side: 'right', to: 'guarita', entry: '1', range: [4, 7] },
    ],
    ...PRISON,
    drips: 18,
    music: 'prison',
    ambience: 'prison',
    hints: [{ x0: 24, x1: 40, text: '{hook} lança o gancho na argola mais perto', needs: 'hook', until: 'hook' }],
    thoughts: [
      { x: 52, y: 40, text: 'As argolas sobem até a passagem lá em cima.' },
      { x: 50, y: 7, text: 'Do outro lado, a torre dos carcereiros.' },
    ],
  },
  guarita: {
    id: 'guarita',
    map: MAP_GUARITA,
    theme: 'prison',
    title: 'Guarita dos Carcereiros',
    subtitle: 'Onde dormem os que vigiam',
    exits: [
      { side: 'left', to: 'correntes', entry: '2', range: [4, 7] },
      { side: 'down', to: 'fuga', entry: '1', range: [44, 48] },
    ],
    trapdoors: [{ key: 'item:chaves' }],
    ...PRISON,
    drips: 12,
    music: 'prison',
    ambience: 'prison',
    hints: [],
    thoughts: [
      { x: 10, y: 7, text: 'Os carcereiros dormiam aqui em cima. Nunca dormiam de verdade.' },
      { x: 40, y: 40, text: 'As chaves da prisão inteira, penduradas. Pesam como uma sentença.' },
    ],
  },
  fuga: {
    id: 'fuga',
    map: MAP_FUGA,
    theme: 'prison',
    title: 'Galeria da Fuga',
    subtitle: 'Por onde ninguém escapou',
    exits: [
      { side: 'up', to: 'celas', entry: '3', range: [3, 7] },
      { side: 'up', to: 'guarita', entry: '2', range: [164, 168] },
    ],
    doors: [{ to: 'mascara', entry: 'O0', key: 'preso:livre', locked: 'Uma porta com a forma de uma máscara. Não tem fechadura deste lado.' }],
    trapdoors: [{ key: 'lever:fuga:0' }],
    ...PRISON,
    drips: 16,
    music: 'prison',
    ambience: 'prison',
    hints: [],
    thoughts: [
      { x: 12, text: 'A alavanca do alçapão. Lá em cima ficam as celas.' },
      { x: 24, text: 'A porta das máscaras.' },
    ],
  },
  arena: {
    id: 'arena',
    map: MAP_ARENA,
    theme: 'prison',
    title: 'Arena dos Condenados',
    subtitle: 'Onde se lutava por mais um dia',
    exits: [],
    doors: [{ to: 'celas', entry: 'O0' }],
    ...PRISON,
    drips: 10,
    music: 'prison',
    ambience: 'prison',
    hints: [],
    thoughts: [{ x: 7, text: 'Os condenados lutavam aqui entre si. Quem ganhava lutava de novo amanhã.' }],
  },
  mascara: {
    id: 'mascara',
    map: MAP_MASCARA,
    theme: 'prison',
    title: 'Sala da Máscara',
    subtitle: 'Onde lhe deram um rosto novo',
    exits: [{ side: 'down', to: 'fosso', entry: '1', range: [54, 57] }],
    doors: [{ to: 'fuga', entry: 'O0' }],
    boss: 'carcereira',
    // com a Corrente já na mão, a laje ao pé da bigorna cede quando o cavaleiro pisa nela
    trapdoors: [{ key: 'fosso:aberto', auto: 'weapon:corrente', look: 'stone', thought: 'A pedra cedeu ao pé da bigorna. Lá embaixo, alguém respira no escuro.' }],
    ...PRISON,
    drips: 8,
    music: 'prison',
    ambience: 'prison',
    hints: [],
    thoughts: [{ x: 9, text: 'Eu já estive aqui. Do outro lado da bigorna.' }],
  },
  fosso: {
    id: 'fosso',
    map: MAP_FOSSO,
    theme: 'prison',
    title: 'Fosso dos Esquecidos',
    subtitle: 'Onde caía o que a prisão arrancava',
    exits: [
      { side: 'up', to: 'mascara', entry: '2', range: [34, 37] },
      { side: 'right', to: 'abismo', entry: '1', range: [73, 77] },
    ],
    ...PRISON,
    drips: 34,
    music: 'fosso',
    ambience: 'prison',
    paint: 0.2,
    lanterns: [[15, 19], [26, 18], [46, 19], [30, 34], [46, 34], [14, 49], [48, 64], [10, 57], [51, 52], [10, 71]],
    fungus: 14,
    hints: [],
    thoughts: [
      { x: 40, y: 27, text: 'Máscaras quebradas, aos montes. Jogavam aqui o que sobrava de cada condenado.' },
      { x: 30, y: 52, text: 'As luzes que sobem não são vaga-lumes. São lembranças. Algumas são minhas.' },
      { x: 46, y: 77, text: 'Lá adiante, uma luz roxa. E passos iguais aos meus.' },
    ],
  },
  abismo: {
    id: 'abismo',
    map: MAP_ABISMO,
    theme: 'prison',
    title: 'Leito do Abismo',
    subtitle: 'O fundo de tudo o que ele esqueceu',
    exits: [
      { side: 'left', to: 'fosso', entry: '2', range: [23, 27] },
      { side: 'right', to: 'boca', entry: '1', range: [24, 27] },
    ],
    boss: 'sombra',
    ...PRISON,
    drips: 12,
    music: 'fosso',
    ambience: 'prison',
    paint: 0.22,
    lanterns: [[9, 10], [20, 13], [31, 9], [45, 13], [55, 10], [3, 19], [60, 18]],
    fungus: 10,
    hints: [],
    thoughts: [{ x: 4, text: 'Um lago de tinta. Alguma coisa embaixo dele respira no meu ritmo.' }],
  },
};

const MINE: Pick<RoomDef, 'pit' | 'rain' | 'lightning' | 'petals' | 'motes'> = { pit: false, rain: false, lightning: false, petals: false, motes: true };

// capítulo 4: as Minas Abandonadas, atrás da membrana do Leito do Abismo. Onde a Casa Vhalor tirava o
// Âmbar Mnêmico (lore/continuidade.md, seção 8)
const CHAPTER4: Record<'boca' | 'trilhos' | 'prensas' | 'veio' | 'espelhos' | 'capataz', RoomDef> = {
  boca: {
    id: 'boca',
    map: MAP_BOCA,
    theme: 'mine',
    title: 'Boca da Mina',
    subtitle: 'Minas Abandonadas',
    exits: [
      { side: 'left', to: 'abismo', entry: '2', range: [22, 29] },
      { side: 'right', to: 'trilhos', entry: '1', range: [22, 29] },
    ],
    ...MINE,
    drips: 16,
    music: 'mine',
    ambience: 'mine',
    rails: [[56, 99, 30]],
    lamps: [[31, 14], [95, 15], [50, 21]],
    cacheItems: ['helmet'],
    hints: [],
    thoughts: [
      { x: 14, text: 'Trilhos. Escoras. Alguém cavava aqui embaixo, muito antes da prisão.' },
      { x: 52, y: 18, text: 'A pedra brilha por dentro, como brasa debaixo da cinza.' },
    ],
  },
  trilhos: {
    id: 'trilhos',
    map: MAP_TRILHOS,
    theme: 'mine',
    title: 'Galeria dos Trilhos',
    subtitle: 'Por onde o Âmbar subia',
    exits: [
      { side: 'left', to: 'boca', entry: '2', range: [14, 23] },
      { side: 'right', to: 'prensas', entry: '1', range: [14, 23] },
    ],
    ...MINE,
    drips: 20,
    music: 'mine',
    ambience: 'mine',
    // embaixo de cada viga baixa, uma lamparina (quem vinha no vagonete via a viga a tempo)
    lamps: [[61, 21], [99, 21], [133, 21]],
    hints: [],
    thoughts: [
      { x: 12, text: 'Um vagonete ainda nos trilhos. Carregado de pedra que brilha.' },
      { x: 62, text: 'As vigas descem baixo aqui. Quem empurrava os vagonetes andava curvado.' },
    ],
  },
  prensas: {
    id: 'prensas',
    map: MAP_PRENSAS,
    theme: 'mine',
    title: 'Casa das Prensas',
    subtitle: 'Onde espremiam o que as pessoas lembravam',
    exits: [
      { side: 'left', to: 'trilhos', entry: '2', range: [16, 23] },
      { side: 'down', to: 'veio', entry: '1', range: [74, 79] },
    ],
    ...MINE,
    drips: 14,
    music: 'mine',
    ambience: 'mine',
    lamps: [[11, 12], [84, 12], [84, 31]],
    cacheItems: ['rawamber'],
    // o cinto de ferramentas, preso no Âmbar no pé da parede, embaixo da entrada
    finds: [{ id: 'cinto', x: 6.5, y: 39 }],
    hints: [],
    thoughts: [
      { x: 20, text: 'Prensas do tamanho de uma casa. Para espremer pedra não precisava de tanto.' },
      { x: 60, y: 39, text: 'Tem marca de mão no ferro. Muitas. Por dentro.' },
    ],
  },
  veio: {
    id: 'veio',
    map: MAP_VEIO,
    theme: 'mine',
    title: 'Veio de Âmbar',
    subtitle: 'A pedra que bebe lembranças',
    exits: [
      { side: 'up', to: 'prensas', entry: '2', range: [8, 13] },
      { side: 'right', to: 'espelhos', entry: '1', range: [72, 77] },
    ],
    ...MINE,
    drips: 30,
    music: 'mine',
    ambience: 'mine',
    lamps: [[8, 22], [56, 26], [8, 38], [56, 50], [8, 58], [56, 70], [3, 41]],
    cacheItems: ['watch'],
    // o bornal, num nicho da parede da esquerda que o Âmbar cobriu, logo abaixo da entrada
    finds: [{ id: 'bornal', x: 2, y: 17 }],
    hints: [],
    thoughts: [
      { x: 30, y: 17, text: 'Quanto mais perto do veio, mais quieto fica dentro da cabeça.' },
      { x: 48, y: 77, text: 'Lá adiante a pedra é lisa como um espelho. Tem alguém andando do outro lado.' },
    ],
  },
  espelhos: {
    id: 'espelhos',
    map: MAP_ESPELHOS,
    theme: 'mine',
    title: 'Câmara de Âmbar',
    subtitle: 'Quem olha demais fica',
    exits: [
      { side: 'left', to: 'veio', entry: '3', range: [20, 25] },
      { side: 'right', to: 'capataz', entry: '1', range: [20, 25] },
    ],
    boss: 'reflexo',
    ...MINE,
    drips: 8,
    music: 'mine',
    ambience: 'mine',
    // quando o espelho racha, uma lasca do vidro de Âmbar salta do meio dele e cai do lado da base
    finds: [{ id: 'mirror', x: 35, y: 25, needs: 'boss:reflexo', from: [-38, -70] }],
    hints: [],
    thoughts: [{ x: 4, text: 'As paredes me devolvem. Com um pouco de atraso.' }],
  },
  capataz: {
    id: 'capataz',
    map: MAP_CAPATAZ,
    theme: 'mine',
    title: 'Galeria do Capataz',
    subtitle: 'O último turno',
    exits: [{ side: 'left', to: 'espelhos', entry: '2', range: [24, 29] }],
    boss: 'capataz',
    ...MINE,
    drips: 10,
    music: 'mine',
    ambience: 'mine',
    lamps: [[4, 14], [61, 14], [68, 25]],
    hints: [],
    thoughts: [
      { x: 4, text: 'Um apito de turno, enferrujado, ainda pendurado na entrada.' },
      { x: 62, y: 29, text: 'Um bloco de Âmbar tapa o túnel. Do outro lado passa um vento frio.' },
    ],
  },
};

export const ROOMS: Record<RoomId, RoomDef> = { ...PROLOGUE, ...CHAPTER2, ...CHAPTER3, ...CHAPTER4 };

// Onde cada sala fica no mapa (em tiles). A memória do vale não aparece no mapa.
export const MAP_POS: Partial<Record<RoomId, { x: number; y: number }>> = {
  ponte: { x: 0, y: 0 },
  catacumbas: { x: 180, y: 12 },
  sinos: { x: 290, y: -2 },
  cripta: { x: 386, y: -9 },
  escadaria: { x: 434, y: -25 },
  praca: { x: 470, y: -43 },
  rua: { x: 590, y: -49 },
  telhados: { x: 590, y: -89 },
  nave: { x: 470, y: -83 },
  claustro: { x: 380, y: -83 },
  galeria: { x: 470, y: -117 },
  altar: { x: 590, y: -119 },
  poco: { x: 470, y: -9 },
  celas: { x: 530, y: -9 },
  correntes: { x: 680, y: -9 },
  guarita: { x: 740, y: -9 },
  fuga: { x: 620, y: 35 },
  arena: { x: 470, y: 35 },
  mascara: { x: 600, y: 61 },
  fosso: { x: 620, y: 93 },
  abismo: { x: 676, y: 143 },
  boca: { x: 746, y: 141 },
  trilhos: { x: 846, y: 147 },
  prensas: { x: 996, y: 147 },
  veio: { x: 1062, y: 191 },
  espelhos: { x: 1126, y: 243 },
  capataz: { x: 1190, y: 239 },
};

import { settings } from './Settings';

// Todo o som do jogo é sintetizado no navegador (Web Audio): efeitos, chuva,
// ambiências e uma trilha generativa com piano, pads, coro e sinos.
export type SfxName =
  | 'slash' | 'heavy' | 'stab' | 'bow' | 'thunk' | 'dash' | 'jump' | 'land' | 'step'
  | 'hit' | 'hurt' | 'kill' | 'thunder' | 'drip' | 'crack' | 'shard' | 'splash' | 'ui' | 'ui-ok'
  | 'clang' | 'caw' | 'swoosh' | 'thud' | 'chime' | 'bell' | 'rest' | 'coin' | 'roar' | 'tink' | 'mend' | 'ghost'
  | 'ash' | 'quake' | 'equip' | 'erase'
  | 'parry' | 'break' | 'glass' | 'page' | 'anvil' | 'smoke' | 'coinrain' | 'door' | 'locked' | 'censer' | 'draw' | 'gate'
  | 'echo' | 'echo-die' | 'veil' | 'veil-form'
  | 'howl' | 'hoot' | 'horn' | 'gust' | 'flap' | 'crunch' | 'ice-crack' | 'ice-break' | 'freeze' | 'growl' | 'yelp' | 'lantern'
  | 'plop' | 'leap' | 'flop' | 'heron' | 'buzz' | 'gurgle' | 'creak' | 'rope'
  | 'beam' | 'sap';
export type TrackId = 'title' | 'bridge' | 'crypt' | 'memory' | 'boss' | 'city' | 'nave' | 'boss2' | 'boss3' | 'mine' | 'mirror' | 'boss4' | 'forest' | 'cabin' | 'boss5' | 'boss6' | 'boss7' | 'vale' | 'cais' | 'aurora' | 'rei' | 'silencio' | FileTrackId | 'none';
export type AmbienceId = 'rain' | 'crypt' | 'wind' | 'city' | 'nave' | 'prison' | 'mine' | 'snow' | 'hearth' | 'river' | 'falls' | 'night' | 'none';
// faixas gravadas, em arquivo (as trilhas que o Enio escolheu)
type FileTrackId = 'prison' | 'fosso' | 'shadow';
type SynthTrackId = Exclude<TrackId, FileTrackId | 'none'>;
export type StepKind = 'wet' | 'stone' | 'grass' | 'snow' | 'ice' | 'wood';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Playing {
  id: TrackId;
  bus: GainNode;
  step: number;
  next: number;
  stop: (() => void)[];
  alive: boolean;
  // faixa gravada que não carregou: toca esta sintetizada no lugar
  synth?: SynthTrackId;
}

interface TrackDef {
  bpm: number;
  start?: (e: AudioEngine, p: Playing) => void;
  // chamado a cada colcheia (8 por compasso)
  step: (e: AudioEngine, p: Playing, step: number, t: number, dur: number) => void;
}

// Acordes em MIDI (oitava 3) usados pelas faixas
const DM = [50, 53, 57], BB = [46, 50, 53], GM = [43, 46, 50], AM = [45, 49, 52];
const DMAJ = [50, 54, 57], BMIN = [47, 50, 54], GMAJ = [43, 47, 50], AMAJ = [45, 49, 52];
// capítulo 2 (a cidade): mi menor, com o si maior da cadência
const EM = [52, 55, 59], CMAJ = [48, 52, 55], AMIN = [45, 48, 52], BMAJ = [47, 51, 54];

// capítulo 3 (a prisão): dó menor, com o sol maior que puxa de volta
const CMIN = [48, 51, 55], AB = [44, 48, 51], FMIN = [41, 44, 48], GMAJ3 = [43, 47, 50];
// capítulo 4 (as minas): lá menor frígio, com o si bemol que pesa e o mi maior que não resolve
const AMIN4 = [45, 48, 52], BB4 = [46, 50, 53], EMAJ4 = [40, 44, 47], DMIN4 = [50, 53, 57];
// capítulo 5 (a floresta): si menor aberto; o chefe em mi menor, com o si maior da caçada
const BMIN5 = [47, 50, 54], GMAJ5 = [43, 47, 50], DMAJ5 = [50, 54, 57], FSM5 = [42, 45, 49];
const EMIN5 = [40, 43, 47], CMAJ5 = [48, 52, 55], AMIN5 = [45, 48, 52], BMAJ5 = [47, 51, 54];
// Vale das Cachoeiras: fá maior, a luz dourada (o si bemol vira si natural de vez em quando, lídio)
const FMAJ6 = [41, 45, 48], AMIN6 = [45, 48, 52], BBMAJ6 = [46, 50, 53], CMAJ6 = [48, 52, 55], DMIN6 = [50, 53, 57];
// a travessia do Barqueiro (seis colcheias por compasso; 0 é pausa), em ré menor
const BARCAROLA = [
  [69, 0, 0, 67, 0, 65], [64, 0, 0, 65, 0, 0], [70, 0, 0, 69, 0, 67], [65, 0, 0, 0, 0, 0],
  [67, 0, 0, 70, 0, 74], [72, 0, 0, 70, 0, 0], [69, 0, 0, 73, 0, 76], [73, 0, 0, 0, 0, 0],
];
// o Senhor de Vhalor: sol menor, com o lá bemol napolitano que pesa antes da dominante. O hino da
// Coroação (oito compassos de colcheias; 0 é pausa), que ele ainda espera ouvir no trono
const GMIN7 = [43, 46, 50], EBMAJ7 = [39, 43, 46], CMIN7 = [48, 51, 55], ABMAJ7 = [44, 48, 51], DMAJ7 = [50, 54, 57];
const HINO = [
  [67, 0, 0, 0, 70, 0, 74, 0], [79, 0, 0, 0, 77, 0, 75, 0], [74, 0, 0, 0, 75, 0, 70, 0], [72, 0, 0, 0, 0, 0, 0, 0],
  [70, 0, 72, 0, 74, 0, 79, 0], [75, 0, 0, 0, 72, 0, 68, 0], [66, 0, 0, 0, 69, 0, 72, 0], [74, 0, 0, 0, 0, 0, 0, 0],
];
// a cantiga que ela cantarolava na cabana (oito compassos de colcheias; 0 é pausa)
const CANTIGA = [
  [78, 0, 81, 0, 78, 0, 74, 0], [79, 0, 83, 0, 81, 0, 79, 0], [78, 0, 74, 0, 71, 0, 74, 0], [76, 0, 0, 0, 69, 0, 0, 0],
  [78, 0, 81, 0, 86, 0, 81, 0], [83, 0, 81, 0, 79, 0, 76, 0], [78, 0, 76, 0, 74, 0, 71, 0], [73, 0, 76, 0, 74, 0, 0, 0],
];

// Trilha gravada: o arquivo toca uma vez a partir de 'from' e depois repete o trecho [início, fim]
// (em segundos), cruzando 'xf' segundos na emenda. Os dois pontos caem no mesmo tempo do compasso,
// então o cruzamento não se nota. 'vol' iguala o volume ao das faixas sintetizadas.
interface FileDef {
  url: string;
  from: number;
  loop: [number, number];
  xf: number;
  vol: number;
  fallback: SynthTrackId;
}
// Deep Echoes tem 128 BPM e o compasso cai em 0,073 + 1,875 k segundos
const FILES: Record<FileTrackId, FileDef> = {
  // The Unexplored Abyss: as salas da prisão
  prison: { url: 'assets/music-abismo.mp3', from: 0, loop: [6, 226], xf: 5, vol: 0.3, fallback: 'crypt' },
  // Deep Echoes, a parte calma do começo: o Fosso dos Esquecidos
  fosso: { url: 'assets/music-ecos.mp3', from: 0, loop: [3.823, 46.948], xf: 1.875, vol: 0.3, fallback: 'crypt' },
  // Deep Echoes, a parte forte: a luta com a Sombra do Carrasco
  shadow: { url: 'assets/music-ecos.mp3', from: 61.948, loop: [61.948, 180.073], xf: 1.875, vol: 0.32, fallback: 'boss3' },
};
const isFile = (id: TrackId): id is FileTrackId => id in FILES;

const chance = (p: number) => Math.random() < p;
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const TRACKS: Record<SynthTrackId, TrackDef> = {
  // Título: ré menor, piano em arpejo sobre pads, com uma melodia que vai e volta
  title: {
    bpm: 66,
    step(e, p, s, t, d) {
      const prog = [DM, BB, GM, AM];
      const bar = Math.floor(s / 8);
      const ch = prog[Math.floor(bar / 2) % 4];
      const i = s % 8;
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.045);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.13, d * 8);
      const arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24];
      const pat = [0, 1, 2, 1, 3, 1, 2, 1];
      const prob = [1, 0.45, 0.85, 0.35, 0.9, 0.4, 0.75, 0.3];
      if (chance(prob[i])) e.piano(p.bus, t, arp[pat[i]], 0.06 + Math.random() * 0.04, d * 6);
      // melodia nos compassos ímpares do ciclo
      if (bar % 4 === 1 && (i === 0 || i === 3 || i === 6)) {
        const mel = [ch[2] + 24, ch[1] + 24, ch[0] + 24, ch[2] + 12];
        e.piano(p.bus, t, mel[(i / 3 + (bar >> 2)) % 4 | 0], 0.11, d * 10);
      }
    },
  },
  // Ponte: mesma harmonia, mais lenta e rala, quase engolida pela chuva
  bridge: {
    bpm: 54,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 38, 0.03));
    },
    step(e, p, s, t, d) {
      const prog = [DM, BB, GM, AM];
      const bar = Math.floor(s / 8);
      const ch = prog[Math.floor(bar / 2) % 4];
      const i = s % 8;
      if (i === 0 && bar % 2 === 0) {
        e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.04);
        e.choir(p.bus, t, ch[2] + 12, d * 14, 0.018);
      }
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.1, d * 8);
      if ((i === 2 || i === 5) && chance(0.4)) e.piano(p.bus, t, pick([ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24]), 0.07, d * 8);
    },
  },
  // Catacumbas: zumbido grave, sinos dissonantes raros e um coro distante
  crypt: {
    bpm: 50,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 38, 0.045), e.drone(p.bus, 45, 0.025));
    },
    step(e, p, s, t, d) {
      if (chance(0.07)) e.bell(p.bus, t, pick([74, 75, 77, 80, 81, 86]), 0.035);
      if (s % 64 === 0) e.choir(p.bus, t, pick([62, 57]), d * 30, 0.02);
      if (s % 64 === 32) e.choir(p.bus, t, pick([63, 58]), d * 26, 0.016);
      if (chance(0.035)) e.piano(p.bus, t, pick([38, 41, 44]), 0.09, d * 12);
    },
  },
  // Sineiro: ostinato grave no piano, sino a cada compasso e coro por cima
  boss: {
    bpm: 96,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 38, 0.05), e.drone(p.bus, 45, 0.03));
    },
    step(e, p, s, t, d) {
      const bar = Math.floor(s / 8);
      const i = s % 8;
      const roots = [38, 38, 34, 37];
      const r = roots[Math.floor(bar / 2) % 4];
      const pat = [0, 0, 12, 0, 3, 0, 12, 6];
      e.piano(p.bus, t, r + pat[i], i % 2 === 0 ? 0.12 : 0.08, d * 2);
      if (i === 0) e.bell(p.bus, t, [62, 61, 58, 57][bar % 4], 0.05);
      if (i === 0 && bar % 2 === 0) e.choir(p.bus, t, [r + 24, r + 27][bar % 4 === 0 ? 0 : 1], d * 14, 0.025);
      if (i === 4 && chance(0.5)) e.piano(p.bus, t, r + 24 + pick([0, 3, 7]), 0.06, d * 4);
    },
  },
  // Cidade-Catedral: mi menor solene, sino da torre no começo de cada ciclo, coro de procissão
  // ao longe e um piano que pergunta e não termina a frase
  city: {
    bpm: 58,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 40, 0.03));
    },
    step(e, p, s, t, d) {
      const prog = [EM, CMAJ, AMIN, BMAJ];
      const bar = Math.floor(s / 8);
      const ch = prog[Math.floor(bar / 2) % 4];
      const i = s % 8;
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.036, 700);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.1, d * 8);
      if (s % 64 === 0) e.bell(p.bus, t, 64, 0.05);
      if (s % 64 === 4) e.bell(p.bus, t, 59, 0.035);
      // a procissão: duas notas longas do coro, como um canto que passa
      if (bar % 8 === 4 && i === 0) e.choir(p.bus, t, ch[0] + 12, d * 10, 0.02);
      if (bar % 8 === 5 && i === 4) e.choir(p.bus, t, ch[2] + 12, d * 10, 0.018);
      if ((i === 3 || i === 6) && chance(0.35)) e.piano(p.bus, t, pick([ch[0] + 24, ch[1] + 24, ch[2] + 12, ch[1] + 12]), 0.06, d * 8);
      if (bar % 4 === 3 && i === 0) e.piano(p.bus, t, ch[2] + 24, 0.08, d * 12);
    },
  },
  // Nave: órgão (pad aberto e grave), coro de vozes longas e o eco da catedral
  nave: {
    bpm: 46,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 28, 0.035), e.drone(p.bus, 40, 0.02));
    },
    step(e, p, s, t, d) {
      const prog = [EM, AMIN, CMAJ, BMAJ];
      const bar = Math.floor(s / 8);
      const ch = prog[Math.floor(bar / 2) % 4];
      const i = s % 8;
      if (i === 0 && bar % 2 === 0) {
        e.pad(p.bus, t, [ch[0], ...ch.map((n) => n + 12)], d * 16, 0.03, 1500);
        e.choir(p.bus, t, ch[1] + 12, d * 15, 0.02);
      }
      if (i === 4 && bar % 2 === 1) e.choir(p.bus, t, ch[2] + 12, d * 10, 0.014);
      if (chance(0.05)) e.bell(p.bus, t, pick([76, 79, 83, 88]), 0.025);
      if (i === 0 && bar % 4 === 2) e.piano(p.bus, t, ch[0] + 24, 0.05, d * 14);
    },
  },
  // Arcebispo do Dízimo: órgão em ostinato, sino em cada tempo forte e o coro que cresce
  boss2: {
    bpm: 108,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 40, 0.05), e.drone(p.bus, 47, 0.025));
    },
    step(e, p, s, t, d) {
      const bar = Math.floor(s / 8);
      const i = s % 8;
      const roots = [40, 40, 36, 35];
      const r = roots[Math.floor(bar / 2) % 4];
      const pat = [0, 12, 7, 12, 3, 12, 7, 15];
      e.piano(p.bus, t, r + pat[i], i % 2 === 0 ? 0.11 : 0.07, d * 2);
      if (i === 0) e.bell(p.bus, t, [64, 64, 60, 59][bar % 4], 0.05);
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, [r + 12, r + 19, r + 24], d * 16, 0.03, 1600);
      if (i === 0 && bar % 4 === 0) e.choir(p.bus, t, r + 24, d * 14, 0.024);
      if (i === 4 && bar % 4 === 2) e.choir(p.bus, t, r + 27, d * 12, 0.02);
    },
  },
  // Carcereira: ostinato em dó menor no piano grave, ferro batendo nos tempos fortes, correntes
  // arrastando no contratempo e o coro que só entra no fim de cada volta
  boss3: {
    bpm: 112,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 36, 0.05), e.drone(p.bus, 43, 0.022));
    },
    step(e, p, s, t, d) {
      const bar = Math.floor(s / 8);
      const i = s % 8;
      const prog = [CMIN, CMIN, AB, GMAJ3, CMIN, FMIN, AB, GMAJ3];
      const ch = prog[bar % 8];
      const r = ch[0] - 12;
      const pat = [0, 12, 0, 7, 0, 12, 3, 7];
      e.piano(p.bus, t, r + pat[i], i % 2 === 0 ? 0.12 : 0.075, d * 2);
      if (i === 0) e.metal(p.bus, t, 55, bar % 2 === 0 ? 0.05 : 0.035, 0.9);
      if (i === 4) e.metal(p.bus, t, 61, 0.028, 0.5);
      if ((i === 3 || i === 7) && chance(0.6)) e.chain(p.bus, t, 0.03);
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.028, 1100);
      if (i === 0 && bar % 8 === 6) e.choir(p.bus, t, ch[2] + 12, d * 14, 0.024);
      if (i === 4 && bar % 8 === 7) e.choir(p.bus, t, ch[1] + 12, d * 10, 0.02);
    },
  },
  // Minas: zumbido fundo, o piano grave de um canto de trabalho, picaretas ao longe sempre no mesmo
  // lugar do compasso e, de vez em quando, o tilintar do Âmbar
  mine: {
    bpm: 58,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 33, 0.04), e.drone(p.bus, 40, 0.018));
    },
    step(e, p, s, t, d) {
      const prog = [AMIN4, AMIN4, BB4, EMAJ4];
      const bar = Math.floor(s / 8);
      const ch = prog[Math.floor(bar / 2) % 4];
      const i = s % 8;
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.03, 900);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.1, d * 8);
      if ((i === 2 || i === 3) && bar % 2 === 1) e.metal(p.bus, t, i === 2 ? 79 : 80, 0.011, 0.22);
      if (bar % 4 === 1 && (i === 0 || i === 3 || i === 6)) e.piano(p.bus, t, [ch[0], ch[1], ch[0] - 2][(i / 3) | 0], 0.07, d * 6);
      if (bar % 4 === 3 && i === 0) e.piano(p.bus, t, ch[2] + 12, 0.06, d * 10);
      if (chance(0.04)) e.musicbox(p.bus, t, pick([81, 84, 88, 93]), 0.018);
      if (s % 64 === 48) e.choir(p.bus, t, ch[2] + 12, d * 20, 0.015);
    },
  },
  // O Reflexo: o mesmo arpejo de ida e de volta na caixinha, como num espelho, sobre o piano grave
  mirror: {
    bpm: 92,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 45, 0.035), e.drone(p.bus, 52, 0.016));
    },
    step(e, p, s, t, d) {
      const bar = Math.floor(s / 8);
      const i = s % 8;
      const ch = [AMIN4, EMAJ4, AMIN4, BB4][bar % 4];
      const up = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[0] + 36];
      e.musicbox(p.bus, t, [...up, ...up.slice().reverse()][i], 0.045);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.11, d * 8);
      if (i === 4) e.piano(p.bus, t, ch[0] - 12, 0.06, d * 4);
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.026, 1200);
      if (i === 2 && bar % 4 === 3) e.choir(p.bus, t, ch[2] + 12, d * 8, 0.018);
    },
  },
  // O Capataz de Âmbar: a prensa bate no um e no cinco, o piano grave em ostinato frígio, o vapor
  // chiando no contratempo e o coro que só entra no fim de cada volta
  boss4: {
    bpm: 104,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 33, 0.05), e.drone(p.bus, 40, 0.024));
    },
    step(e, p, s, t, d) {
      const bar = Math.floor(s / 8);
      const i = s % 8;
      const ch = [AMIN4, AMIN4, BB4, EMAJ4, AMIN4, DMIN4, BB4, EMAJ4][bar % 8];
      const r = ch[0] - 12;
      const pat = [0, 0, 12, 0, 1, 0, 12, 7];
      e.piano(p.bus, t, r + pat[i], i % 2 === 0 ? 0.12 : 0.07, d * 2);
      if (i === 0) e.metal(p.bus, t, 45, 0.055, 1.2);
      if (i === 4) e.metal(p.bus, t, 52, 0.03, 0.6);
      if (i === 6 && chance(0.5)) e.metal(p.bus, t, pick([76, 79]), 0.014, 0.2);
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.028, 1000);
      if (i === 0 && bar % 8 === 4) e.choir(p.bus, t, ch[2] + 12, d * 14, 0.024);
      if (i === 4 && bar % 8 === 7) e.choir(p.bus, t, ch[1] + 12, d * 10, 0.02);
    },
  },
  // Floresta Nevada: si menor, aberta e fria. O piano agudo cai como neve (notas soltas, sem pressa),
  // a flauta lembra a abertura de oito em oito compassos e o pad respira devagar sobre o si grave
  forest: {
    bpm: 60,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 35, 0.03), e.drone(p.bus, 42, 0.012));
    },
    step(e, p, s, t, d) {
      const prog = [BMIN5, GMAJ5, DMAJ5, FSM5];
      const bar = Math.floor(s / 8);
      const ch = prog[Math.floor(bar / 2) % 4];
      const i = s % 8;
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.028, 1000);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.08, d * 8);
      if (chance([0.5, 0.12, 0.3, 0.1, 0.4, 0.12, 0.25, 0.08][i])) {
        e.piano(p.bus, t, pick([ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[0] + 36]), 0.03 + Math.random() * 0.025, d * 6);
      }
      if (chance(0.05)) e.musicbox(p.bus, t, pick([ch[0] + 36, ch[2] + 36, ch[1] + 36]), 0.014);
      if (bar % 8 === 4 && (i === 0 || i === 3 || i === 6)) e.flute(p.bus, t, [ch[2] + 24, ch[1] + 24, ch[0] + 24][(i / 3) | 0], d * 3.5, 0.028);
      if (bar % 8 === 5 && i === 0) e.flute(p.bus, t, ch[1] + 24, d * 7, 0.026);
      if (s % 64 === 32) e.choir(p.bus, t, ch[2] + 12, d * 16, 0.011);
    },
  },
  // Vale das Cachoeiras: fá maior a 72, quente e aberto. O piano corre em arpejo como a água (sobe e
  // desce os acordes, macio), a flauta canta uma frase pentatônica de quatro em quatro compassos, a
  // caixinha brilha às vezes e o coro abre a cada dezesseis; no compasso 7 de cada volta o si natural
  // (o lídio) dá a luz de fim de tarde
  vale: {
    bpm: 72,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 29, 0.026), e.drone(p.bus, 41, 0.01));
    },
    step(e, p, s, t, d) {
      const prog = [FMAJ6, AMIN6, BBMAJ6, CMAJ6, FMAJ6, DMIN6, BBMAJ6, CMAJ6];
      const bar = Math.floor(s / 8);
      const ch = prog[bar % 8];
      const i = s % 8;
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.024, 1100);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.075, d * 8);
      // o arpejo: 1-3-5-8-10-8-5-3, com uma nota pulada de vez em quando
      const arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24, ch[1] + 24, ch[0] + 24, ch[2] + 12, ch[1] + 12];
      let n = arp[i];
      if (bar % 8 === 6 && n % 12 === 10) n += 1;
      if (chance(0.86)) e.piano(p.bus, t, n, 0.022 + (i === 0 ? 0.012 : 0) + Math.random() * 0.01, d * 3);
      const phrase = [[72, 0, 69, 0, 67, 0, 65, 0], [67, 0, 69, 72, 0, 0, 74, 0], [72, 0, 0, 69, 0, 67, 0, 0], [65, 0, 0, 0, 0, 0, 0, 0]];
      if (bar % 8 >= 4) {
        const m = phrase[bar % 4][i];
        if (m && Math.floor(bar / 8) % 2 === 1) e.flute(p.bus, t, m, d * 2.2, 0.024);
      }
      if (chance(0.04)) e.musicbox(p.bus, t, pick([ch[0] + 36, ch[2] + 36, ch[1] + 36]), 0.012);
      if (s % 128 === 64) e.choir(p.bus, t, ch[2] + 12, d * 16, 0.012);
    },
  },
  // O Cais da Lua: ré menor a 56, noite. Só o piano grave, a caixinha como a lua na água (notas soltas e
  // espaçadas) e o pad bem baixo; a barcarola do Barqueiro aparece de longe, na flauta, de vez em quando
  cais: {
    bpm: 56,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 38, 0.028), e.drone(p.bus, 45, 0.01));
    },
    step(e, p, s, t, d) {
      const prog = [DMIN6, BBMAJ6, FMAJ6, CMAJ6];
      const bar = Math.floor(s / 6);
      const ch = prog[Math.floor(bar / 2) % 4];
      const i = s % 6;
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 12, 0.02, 700);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.07, d * 6);
      if (i === 3 && chance(0.5)) e.piano(p.bus, t, ch[2], 0.03, d * 3);
      if (chance([0.18, 0.04, 0.1, 0.04, 0.12, 0.04][i])) e.musicbox(p.bus, t, pick([ch[0] + 36, ch[1] + 36, ch[2] + 36, ch[0] + 24]), 0.016);
      if (Math.floor(bar / 8) % 3 === 2) {
        const m = BARCAROLA[bar % 8][i];
        if (m) e.flute(p.bus, t, m, d * 2.5, 0.016);
      }
    },
  },
  // A Cabana: ré maior, a cantiga que ela cantarolava, na caixinha de música, com o piano baixo e
  // quente; a cada duas voltas a cantiga descansa e só o piano fica
  cabin: {
    bpm: 70,
    step(e, p, s, t, d) {
      const prog = [DMAJ, GMAJ, BMIN, AMAJ, DMAJ, GMAJ, BMIN, AMAJ];
      const bar = Math.floor(s / 8);
      const ch = prog[bar % 8];
      const i = s % 8;
      if (i === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 8, 0.02, 900);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.08, d * 8);
      if (i === 4) e.piano(p.bus, t, ch[2], 0.045, d * 4);
      const sing = Math.floor(bar / 8) % 2 === 0;
      const m = CANTIGA[bar % 8][i];
      if (sing && m) e.musicbox(p.bus, t, m, 0.05);
      if (!sing && (i === 2 || i === 6) && chance(0.6)) e.piano(p.bus, t, pick([ch[0] + 24, ch[1] + 24, ch[2] + 24]), 0.035, d * 5);
    },
  },
  // O Mestre da Caça: mi menor a galope. O bumbo bate como cascos na neve, a trompa de caça chama em
  // quartas e quintas, as cordas seguram e o coro entra no fim de cada volta
  boss5: {
    bpm: 116,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 40, 0.04), e.drone(p.bus, 47, 0.016));
    },
    step(e, p, s, t, d) {
      const bar = Math.floor(s / 8);
      const i = s % 8;
      const ch = [EMIN5, EMIN5, CMAJ5, BMAJ5, EMIN5, AMIN5, CMAJ5, BMAJ5][bar % 8];
      if (i === 0 || i === 3 || i === 4 || i === 7) e.drum(p.bus, t, i === 0 ? 0.2 : i === 4 ? 0.14 : 0.08);
      e.piano(p.bus, t, ch[0] - 12 + [0, 12, 7, 12, 0, 12, 7, 10][i], i % 2 === 0 ? 0.1 : 0.05, d * 2);
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.03, 1100);
      // a chamada da trompa: quinta, quarta e a tônica comprida
      if (bar % 4 === 1) {
        if (i === 0) e.horn(p.bus, t, ch[0] + 19, d * 1.5, 0.05);
        if (i === 2) e.horn(p.bus, t, ch[0] + 17, d * 1.5, 0.05);
        if (i === 4) e.horn(p.bus, t, ch[0] + 12, d * 4, 0.055);
      }
      if (bar % 8 === 6 && i === 0) e.horn(p.bus, t, ch[2] + 12, d * 8, 0.045);
      if (i === 0 && bar % 8 === 7) e.choir(p.bus, t, ch[2] + 12, d * 10, 0.024);
    },
  },
  // O Barqueiro: ré menor em seis por oito, uma barcarola. O piano embala como o barco (a mão esquerda
  // vai e volta), o bumbo bate como a vara na água, a travessia passa da flauta para o piano a cada volta
  // e o coro chega no fim de cada frase
  boss6: {
    bpm: 76,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 38, 0.035), e.drone(p.bus, 45, 0.014));
    },
    step(e, p, s, t, d) {
      const bar = Math.floor(s / 6);
      const i = s % 6;
      const ch = [DM, DM, BB, BB, GM, GM, AM, AM][bar % 8];
      const r = ch[0];
      if (i === 0 || i === 3) e.drum(p.bus, t, i === 0 ? 0.16 : 0.09);
      e.piano(p.bus, t, [r - 12, ch[2] - 12, r, ch[1], r, ch[2] - 12][i], i === 0 ? 0.1 : 0.05, d * 2.5);
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 12, 0.026, 1000);
      const m = BARCAROLA[bar % 8][i];
      if (m) {
        if (Math.floor(bar / 8) % 2 === 0) e.flute(p.bus, t, m + 12, d * 2.6, 0.032);
        else e.piano(p.bus, t, m + 12, 0.05, d * 3);
      }
      if (i === 0 && bar % 4 === 3) e.choir(p.bus, t, ch[2] + 12, d * 9, 0.022);
    },
  },
  // O Senhor de Vhalor: uma marcha de coroação que virou cortejo. O bumbo marca o passo, os sinos das
  // torres batem no tempo forte, o piano grave anda em oitavas, os cabos rangem no contratempo e o hino
  // da Coroação passa da trompa (na primeira volta) para o coro (na segunda)
  boss7: {
    bpm: 92,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 31, 0.04), e.drone(p.bus, 38, 0.016));
    },
    step(e, p, s, t, d) {
      const bar = Math.floor(s / 8);
      const i = s % 8;
      const ch = [GMIN7, GMIN7, EBMAJ7, CMIN7, GMIN7, ABMAJ7, DMAJ7, DMAJ7][bar % 8];
      const r = ch[0] - 12;
      if (i === 0 || i === 4) e.drum(p.bus, t, i === 0 ? 0.19 : 0.12);
      if (i === 6 && bar % 2 === 1) e.drum(p.bus, t, 0.07);
      if (i === 7 && bar % 2 === 1) e.drum(p.bus, t, 0.09);
      e.piano(p.bus, t, r + [0, 12, 7, 12, 0, 12, 3, 7][i], i % 2 === 0 ? 0.1 : 0.055, d * 2);
      if (i === 0) e.bell(p.bus, t, ch[0] + 24, bar % 4 === 0 ? 0.05 : 0.032);
      // no fim de cada volta, o repique dos sinos descendo pelo acorde
      if (bar % 8 === 7 && i % 2 === 0) e.bell(p.bus, t, [ch[2] + 24, ch[1] + 24, ch[0] + 24, ch[2] + 12][i / 2], 0.03);
      if ((i === 3 || i === 7) && chance(0.45)) e.metal(p.bus, t, 50, 0.016, 0.5);
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.03, 1200);
      const m = HINO[bar % 8][i];
      if (m) {
        if (Math.floor(bar / 8) % 2 === 0) e.horn(p.bus, t, m - 12, d * 3, 0.042);
        else e.choir(p.bus, t, m, d * 3.5, 0.02);
      }
      if (i === 0 && bar % 8 === 3) e.choir(p.bus, t, ch[1] + 12, d * 12, 0.022);
    },
  },
  // Final I, A Aurora das Memórias: ré maior a 64. Primeiro só o piano em arpejo subindo e o pad, como a luz
  // chegando; na segunda volta a cantiga dela na flauta, inteira; na terceira, no coro, com os sinos da cidade
  aurora: {
    bpm: 64,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 38, 0.022));
    },
    step(e, p, s, t, d) {
      const prog = [DMAJ, GMAJ, BMIN, AMAJ, DMAJ, GMAJ, BMIN, AMAJ];
      const bar = Math.floor(s / 8);
      const ch = prog[bar % 8];
      const i = s % 8;
      const round = Math.floor(bar / 8);
      if (i === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 8, 0.024, 900 + Math.min(round, 3) * 200);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.08, d * 8);
      const arp = [ch[0], ch[1], ch[2], ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24, ch[2] + 12];
      if (i % 2 === 0 || chance(0.5)) e.piano(p.bus, t, arp[i] + 12, 0.028 + i * 0.002, d * 3);
      const m = CANTIGA[bar % 8][i];
      if (m && round % 3 === 1) e.flute(p.bus, t, m - 12, d * 2.4, 0.03);
      if (m && round % 3 === 2) e.choir(p.bus, t, m - 12, d * 2.6, 0.018);
      if (round % 3 === 2 && i === 0 && bar % 2 === 0) e.bell(p.bus, t, ch[0] + 24, 0.024);
      if (s % 64 === 56) e.choir(p.bus, t, ch[2] + 12, d * 10, 0.014);
    },
  },
  // Final II, O Rei do Eclipse: o hino da Coroação em sol menor, devagar, no coro grave e na trompa, sobre um
  // bordão que não muda; o sino bate longe e, de vez em quando, a caixinha toca uma nota da cantiga dela meio
  // tom abaixo, e some
  rei: {
    bpm: 54,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 31, 0.045), e.drone(p.bus, 38, 0.02));
    },
    step(e, p, s, t, d) {
      const bar = Math.floor(s / 8);
      const i = s % 8;
      const ch = [GMIN7, GMIN7, EBMAJ7, CMIN7, GMIN7, ABMAJ7, DMAJ7, GMIN7][bar % 8];
      if (i === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 8, 0.032, 700);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.09, d * 8);
      if (i === 0 && bar % 2 === 0) e.drum(p.bus, t, 0.1);
      if (i === 0 && bar % 4 === 0) e.bell(p.bus, t, ch[0] + 12, 0.04);
      const m = HINO[bar % 8][i];
      if (m) {
        if (Math.floor(bar / 8) % 2 === 0) e.choir(p.bus, t, m - 12, d * 3.5, 0.022);
        else e.horn(p.bus, t, m - 24, d * 3, 0.04);
      }
      if (chance(0.03)) e.musicbox(p.bus, t, pick(CANTIGA[bar % 8].filter(Boolean)) - 1, 0.012);
      if ((i === 3 || i === 7) && chance(0.25)) e.metal(p.bus, t, 45, 0.012, 0.6);
    },
  },
  // Final III, O Último Silêncio: quase nada. O bordão grave e o piano em notas soltas, em ré menor; da segunda
  // volta em diante o acorde abre em ré maior (o céu clareando) e a cantiga dela volta na caixinha, devagar
  silencio: {
    bpm: 60,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 38, 0.026));
    },
    step(e, p, s, t, d) {
      const bar = Math.floor(s / 8);
      const i = s % 8;
      const round = Math.floor(bar / 8);
      const ch = round === 0 ? [DM, DM, BB, BB, GM, GM, AM, AM][bar % 8] : [DMAJ, GMAJ, BMIN, AMAJ, DMAJ, GMAJ, BMIN, AMAJ][bar % 8];
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, round === 0 ? 0.016 : 0.022, round === 0 ? 600 : 1000);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.07, d * 8);
      if (round === 0 && (i === 3 || i === 6) && chance(0.5)) e.piano(p.bus, t, pick(ch) + 12, 0.03, d * 4);
      const m = CANTIGA[bar % 8][i];
      if (round >= 1 && m && chance(0.9)) e.musicbox(p.bus, t, m - 12, 0.04);
      if (round >= 2 && i === 0 && bar % 4 === 0) e.choir(p.bus, t, ch[2] + 12, d * 14, 0.014);
    },
  },
  // Memória: ré maior, caixinha de música, pad quente e uma flauta
  memory: {
    bpm: 80,
    step(e, p, s, t, d) {
      const prog = [DMAJ, BMIN, GMAJ, AMAJ];
      const bar = Math.floor(s / 8);
      const ch = prog[Math.floor(bar / 2) % 4];
      const i = s % 8;
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.035, 1300);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.08, d * 8);
      const arp = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[2] + 24, ch[0] + 36, ch[2] + 24, ch[1] + 24, ch[2] + 24];
      if (chance(i % 2 === 0 ? 0.95 : 0.55)) e.musicbox(p.bus, t, arp[i], 0.05);
      if (bar % 4 === 2 && (i === 0 || i === 4)) e.flute(p.bus, t, pick([74, 76, 78, 81, 83]), d * 4, 0.035);
    },
  },
};

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private reverb!: ConvolverNode;
  private wet!: GainNode;
  private noise!: AudioBuffer;
  private playing: Playing[] = [];
  private wantTrack: TrackId = 'none';
  private amb: { id: AmbienceId; bus: GainNode; stop: () => void } | null = null;
  private wantAmb: AmbienceId = 'none';
  stepKind: StepKind = 'stone';
  // quanto de eco os efeitos recebem (catacumbas ecoam mais)
  space = 0.15;

  constructor() {
    const unlock = () => {
      this.init();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true });
    settings.onChange(() => this.applyVolumes());
  }

  private init() {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.3);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.9;
    this.reverb.connect(this.wet).connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = this.noise.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    this.applyVolumes();
    window.setInterval(() => this.schedule(), 50);
    const t = this.wantTrack;
    const a = this.wantAmb;
    this.wantTrack = 'none';
    this.wantAmb = 'none';
    this.music(t);
    this.ambience(a);
    window.setTimeout(() => this.prefetch(), 6000);
  }

  private impulse(sec: number, decay: number) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 400 ? i / 400 : 1);
    }
    return b;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = settings.data;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.volume, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music * 0.9, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(s.sfx * 0.85, t, 0.05);
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // ---------- trilha ----------
  music(id: TrackId, fade = 2.5) {
    if (!this.ctx) {
      this.wantTrack = id;
      return;
    }
    const cur = this.playing.find((p) => p.alive);
    if (cur?.id === id) return;
    const t = this.ctx.currentTime;
    for (const p of this.playing) {
      if (!p.alive) continue;
      p.alive = false;
      p.bus.gain.cancelScheduledValues(t);
      p.bus.gain.setValueAtTime(p.bus.gain.value, t);
      p.bus.gain.linearRampToValueAtTime(0, t + fade);
      window.setTimeout(() => {
        p.stop.forEach((f) => f());
        p.bus.disconnect();
        this.playing = this.playing.filter((q) => q !== p);
      }, fade * 1000 + 6000);
    }
    if (id === 'none') return;
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(1, t + fade);
    bus.connect(this.musicBus);
    const send = this.ctx.createGain();
    send.gain.value = 0.55;
    bus.connect(send).connect(this.reverb);
    const p: Playing = { id, bus, step: 0, next: t + 0.1, stop: [], alive: true };
    if (!isFile(id)) TRACKS[id].start?.(this, p);
    this.playing.push(p);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const ahead = ctx.currentTime + 0.3;
    for (const p of this.playing) {
      if (!p.alive) continue;
      if (isFile(p.id) && !p.synth) {
        const f = FILES[p.id];
        const state = this.fileState(f);
        if (state === 'wait') continue;
        if (state === 'ready') {
          this.scheduleFile(p, f, ctx.currentTime + 1);
          continue;
        }
        // o arquivo não veio: segue com a sintetizada
        p.synth = f.fallback;
        p.next = ctx.currentTime + 0.1;
        TRACKS[p.synth].start?.(this, p);
      }
      const def = TRACKS[p.synth ?? (p.id as SynthTrackId)];
      const dur = 60 / def.bpm / 2;
      if (p.next < ctx.currentTime - 1) p.next = ctx.currentTime + 0.05;
      while (p.next < ahead) {
        def.step(this, p, p.step, p.next, dur);
        p.step++;
        p.next += dur;
      }
    }
  }

  // ---------- faixas gravadas ----------
  // os arquivos comprimidos (poucos MB) baixam cedo; a faixa só é decodificada quando vai tocar,
  // a 32 kHz (um terço menos memória que 48 kHz, e o agudo que sobra basta para música)
  private files = new Map<string, { bytes: Promise<ArrayBuffer | null>; buf: AudioBuffer | null; failed: boolean; decoding: boolean }>();

  private fileEntry(url: string) {
    let e = this.files.get(url);
    if (!e) {
      const bytes = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      e = { bytes, buf: null, failed: false, decoding: false };
      this.files.set(url, e);
    }
    return e;
  }

  private fileState(f: FileDef): 'ready' | 'wait' | 'failed' {
    const e = this.fileEntry(f.url);
    if (e.buf) return 'ready';
    if (e.failed) return 'failed';
    if (!e.decoding) {
      e.decoding = true;
      const entry = e;
      void entry.bytes
        .then((ab) => {
          if (!ab) throw new Error('arquivo não veio');
          const OAC = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
          // decodeAudioData esvazia o buffer que recebe: vai uma cópia, para poder decodificar de novo
          return new OAC(2, 1, 32000).decodeAudioData(ab.slice(0));
        })
        .then((buf) => {
          entry.buf = buf;
          // só uma faixa gravada decodificada por vez, além das que estão tocando
          for (const [url, o] of this.files) {
            if (o !== entry && o.buf && !this.playing.some((q) => isFile(q.id) && FILES[q.id].url === url)) o.buf = null;
          }
        })
        .catch(() => (entry.failed = true))
        .finally(() => (entry.decoding = false));
    }
    return 'wait';
  }

  // agenda as passadas do arquivo: a primeira a partir de 'from', as outras do início do laço
  // (menos o cruzamento), cada uma entrando enquanto a anterior sai
  private scheduleFile(p: Playing, f: FileDef, ahead: number) {
    const ctx = this.ctx!;
    const buf = this.files.get(f.url)!.buf!;
    const [a, b] = f.loop;
    if (p.next < ctx.currentTime) p.next = ctx.currentTime + 0.05;
    while (p.next < ahead) {
      const first = p.step === 0;
      const off = first ? f.from : a - f.xf;
      const len = b - off;
      const t = p.next;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      if (first) g.gain.value = f.vol;
      else {
        g.gain.value = 0;
        g.gain.setValueCurveAtTime(this.fadeCurve(f.vol, true), t, f.xf);
      }
      g.gain.setValueAtTime(f.vol, t + len - f.xf - 0.01);
      g.gain.setValueCurveAtTime(this.fadeCurve(f.vol, false), t + len - f.xf, f.xf);
      src.connect(g).connect(p.bus);
      src.start(t, off);
      src.stop(t + len + 0.05);
      p.stop.push(() => {
        try {
          src.stop();
        } catch {
          // já tinha parado
        }
      });
      p.step++;
      p.next = t + (first ? Math.max(1, b - f.xf - off) : b - a);
    }
  }

  // cruzamento de potência constante (seno para entrar, cosseno para sair)
  private fadeCurve(vol: number, up: boolean) {
    const n = 64;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      c[i] = vol * (up ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2));
    }
    return c;
  }

  // baixa os arquivos das trilhas gravadas sem decodificar (chamado logo depois do áudio abrir)
  prefetch() {
    for (const f of Object.values(FILES)) this.fileEntry(f.url);
  }

  // ---------- instrumentos ----------
  private osc(type: OscillatorType, f: number, t: number, end: number, dest: AudioNode, detune = 0) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end);
    return o;
  }

  private env(t: number, a: number, peak: number, dest: AudioNode) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.connect(dest);
    return g;
  }

  piano(dest: AudioNode, t: number, m: number, vel: number, len: number) {
    const ctx = this.ctx!;
    const f = mtof(m);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(5200, f * 9), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2), t + Math.min(2.5, len * 0.6));
    lp.connect(dest);
    const g = this.env(t, 0.006, vel, lp);
    g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0006, t + len);
    const end = t + len + 0.05;
    this.osc('triangle', f, t, end, g);
    const h = ctx.createGain();
    h.gain.value = 0.22;
    h.connect(g);
    this.osc('sine', f * 2, t, end, h, 3);
  }

  pad(dest: AudioNode, t: number, notes: number[], len: number, vol: number, cutoff = 800) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.Q.value = 0.6;
    lp.connect(dest);
    const g = this.env(t, 1.8, vol, lp);
    g.gain.setValueAtTime(vol, t + Math.max(1.9, len - 1.2));
    g.gain.linearRampToValueAtTime(0, t + len + 1.8);
    const end = t + len + 1.9;
    for (const n of notes) {
      this.osc('sawtooth', mtof(n), t, end, g, -7);
      this.osc('sawtooth', mtof(n), t, end, g, 7);
    }
  }

  choir(dest: AudioNode, t: number, m: number, len: number, vol: number) {
    const ctx = this.ctx!;
    const g = this.env(t, 1.4, vol, dest);
    g.gain.setValueAtTime(vol, t + Math.max(1.5, len - 1.5));
    g.gain.linearRampToValueAtTime(0, t + len + 1.5);
    const end = t + len + 1.6;
    for (const [fc, q, k] of [[700, 7, 1], [1150, 9, 0.6], [2600, 10, 0.25]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fc;
      bp.Q.value = q;
      const kg = ctx.createGain();
      kg.gain.value = k * 3;
      bp.connect(kg).connect(g);
      for (const det of [-9, 0, 9]) {
        const o = this.osc('sawtooth', mtof(m), t, end, bp, det);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 4.6 + Math.random();
        const lg = ctx.createGain();
        lg.gain.value = 3;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(t);
        lfo.stop(end);
      }
    }
  }

  bell(dest: AudioNode, t: number, m: number, vol: number) {
    const f = mtof(m);
    for (const [r, dec, k] of [[1, 3.2, 1], [2.76, 1.8, 0.45], [5.4, 0.9, 0.2]] as const) {
      const g = this.env(t, 0.003, vol * k, dest);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
      this.osc('sine', f * r, t, t + dec + 0.05, g);
    }
  }

  musicbox(dest: AudioNode, t: number, m: number, vol: number) {
    const f = mtof(m);
    const g = this.env(t, 0.002, vol, dest);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9);
    this.osc('sine', f, t, t + 0.95, g);
    const h = this.env(t, 0.002, vol * 0.25, dest);
    h.gain.exponentialRampToValueAtTime(0.0005, t + 0.3);
    this.osc('triangle', f * 4, t, t + 0.35, h);
  }

  // ferro batido: parciais que não se encaixam numa nota só e um estalo seco na frente
  metal(dest: AudioNode, t: number, m: number, vol: number, len = 0.6) {
    const f = mtof(m);
    for (const [r, k, dec] of [[1, 1, 1], [2.32, 0.55, 0.62], [3.87, 0.38, 0.4], [5.21, 0.22, 0.26]] as const) {
      const g = this.env(t, 0.002, vol * k, dest);
      g.gain.exponentialRampToValueAtTime(0.0004, t + len * dec);
      this.osc('sine', f * r, t, t + len * dec + 0.05, g);
    }
    this.nz(dest, t, 0.035, 'highpass', 4200, 2600, vol * 1.6, 1);
  }

  // corrente arrastando: elos curtos que tilintam em sequência
  chain(dest: AudioNode, t: number, vol: number) {
    const n = 3 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const tt = t + k * (0.035 + Math.random() * 0.03);
      this.nz(dest, tt, 0.025, 'bandpass', 3800 + Math.random() * 1600, 2400, vol, 6);
      this.tone(dest, tt, 0.05, 'square', 2600 + Math.random() * 900, 2400, vol * 0.18);
    }
  }

  flute(dest: AudioNode, t: number, m: number, len: number, vol: number) {
    const ctx = this.ctx!;
    const g = this.env(t, 0.09, vol, dest);
    g.gain.setValueAtTime(vol, t + len * 0.7);
    g.gain.linearRampToValueAtTime(0, t + len);
    const o = this.osc('sine', mtof(m), t, t + len + 0.05, g);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = ctx.createGain();
    lg.gain.value = 4;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t + 0.2);
    lfo.stop(t + len + 0.05);
  }

  // trompa de caça: a nota entra um pouco abaixo e sobe (o lábio na boquilha), o filtro abre no ataque
  // e o vibrato só vem no fim
  horn(dest: AudioNode, t: number, m: number, len: number, vol: number) {
    const ctx = this.ctx!;
    const f = mtof(m);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(f * 1.5, t);
    lp.frequency.linearRampToValueAtTime(f * 5, t + 0.08);
    lp.frequency.setTargetAtTime(f * 3, t + 0.1, 0.3);
    lp.connect(dest);
    const g = this.env(t, 0.05, vol, lp);
    g.gain.setValueAtTime(vol, t + len * 0.75);
    g.gain.linearRampToValueAtTime(0, t + len);
    const end = t + len + 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.006, t + len * 0.6);
    lfo.connect(lg);
    for (const det of [-4, 4]) {
      const o = this.osc('sawtooth', f, t, end, g, det);
      o.frequency.setValueAtTime(f * 0.94, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      lg.connect(o.frequency);
    }
    lfo.start(t);
    lfo.stop(end);
  }

  // bumbo abafado (cascos na neve): o seno que despenca e um sopro grave
  drum(dest: AudioNode, t: number, vol: number) {
    this.tone(dest, t, 0.22, 'sine', 120, 42, vol);
    this.nz(dest, t, 0.08, 'lowpass', 500, 120, vol * 0.5, 0.8);
  }

  // nota contínua com filtro respirando; devolve a função que a desliga
  drone(dest: AudioNode, m: number, vol: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = ctx.createGain();
    lg.gain.value = 110;
    lfo.connect(lg).connect(lp.frequency);
    lfo.start(t);
    const g = this.env(t, 3, vol, dest);
    lp.connect(g);
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = b.type = 'sawtooth';
    a.frequency.value = b.frequency.value = mtof(m);
    a.detune.value = -6;
    b.detune.value = 6;
    a.connect(lp);
    b.connect(lp);
    a.start(t);
    b.start(t);
    return () => {
      const now = ctx.currentTime;
      g.gain.setTargetAtTime(0, now, 0.6);
      for (const o of [a, b, lfo]) o.stop(now + 4);
    };
  }

  // ---------- ambiência ----------
  ambience(id: AmbienceId) {
    if (!this.ctx) {
      this.wantAmb = id;
      return;
    }
    if (this.amb?.id === id) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this.amb) {
      const old = this.amb;
      old.bus.gain.setTargetAtTime(0, t, 0.8);
      window.setTimeout(() => {
        old.stop();
        old.bus.disconnect();
      }, 5000);
      this.amb = null;
    }
    if (id === 'none') return;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(1, t + 2);
    bus.connect(this.ambBus);
    const stops: (() => void)[] = [];
    const noise = (filter: BiquadFilterType, f: number, q: number, vol: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bf = ctx.createBiquadFilter();
      bf.type = filter;
      bf.frequency.value = f;
      bf.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(bf).connect(g).connect(bus);
      src.start(t, Math.random() * 1.5);
      stops.push(() => src.stop());
      return { bf, g };
    };
    const lfo = (param: AudioParam, rate: number, depth: number) => {
      const o = ctx.createOscillator();
      o.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(param);
      o.start(t);
      stops.push(() => o.stop());
    };
    if (id === 'rain') {
      const body = noise('lowpass', 1500, 0.4, 0.3);
      lfo(body.g.gain, 0.09, 0.06);
      const patter = noise('bandpass', 4800, 0.7, 0.07);
      lfo(patter.g.gain, 0.23, 0.025);
      const low = noise('lowpass', 220, 0.5, 0.18);
      lfo(low.g.gain, 0.05, 0.06);
    } else if (id === 'crypt') {
      noise('lowpass', 140, 0.6, 0.2);
      const moan = noise('bandpass', 420, 7, 0.05);
      lfo(moan.bf.frequency, 0.045, 160);
      lfo(moan.g.gain, 0.08, 0.03);
    } else if (id === 'falls') {
      // a queda d'água perto: o ronco grave, o chiado da espuma e o vento que ela empurra
      const roar = noise('lowpass', 900, 0.4, 0.28);
      lfo(roar.g.gain, 0.07, 0.05);
      const hiss = noise('bandpass', 2600, 0.5, 0.05);
      lfo(hiss.g.gain, 0.19, 0.015);
      noise('lowpass', 160, 0.6, 0.12);
    } else if (id === 'night') {
      // a noite no cais: a água correndo baixo e os grilos (pulsos agudos em grupos)
      const body = noise('lowpass', 520, 0.5, 0.09);
      lfo(body.g.gain, 0.06, 0.025);
      const lap = noise('bandpass', 1100, 1.4, 0.02);
      lfo(lap.g.gain, 0.4, 0.012);
      let alive = true;
      const cricket = () => {
        if (!alive) return;
        const now = ctx.currentTime;
        const f = 4200 + Math.random() * 900;
        for (let k = 0; k < 3 + Math.floor(Math.random() * 3); k++) {
          const tt = now + k * 0.09;
          const o = ctx.createOscillator();
          o.frequency.value = f;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, tt);
          g.gain.linearRampToValueAtTime(0.006, tt + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0003, tt + 0.05);
          o.connect(g).connect(bus);
          o.start(tt);
          o.stop(tt + 0.06);
        }
        window.setTimeout(cricket, 700 + Math.random() * 1800);
      };
      window.setTimeout(cricket, 900);
      stops.push(() => (alive = false));
    } else if (id === 'wind' || id === 'river') {
      if (id === 'wind') {
        const w = noise('bandpass', 750, 0.8, 0.05);
        lfo(w.bf.frequency, 0.07, 260);
        lfo(w.g.gain, 0.11, 0.025);
        noise('bandpass', 2100, 1.2, 0.008);
      } else {
        // o rio correndo: o corpo grave, o borbulhar no meio (que muda de altura) e o chiado fino
        const body = noise('lowpass', 650, 0.5, 0.11);
        lfo(body.g.gain, 0.05, 0.03);
        const babble = noise('bandpass', 1300, 1.6, 0.045);
        lfo(babble.bf.frequency, 0.37, 380);
        lfo(babble.g.gain, 0.53, 0.018);
        noise('highpass', 3800, 0.7, 0.008);
      }
      // passarinhos de vez em quando
      let alive = true;
      const chirp = () => {
        if (!alive) return;
        const now = ctx.currentTime;
        const n = 2 + Math.floor(Math.random() * 4);
        const base = 2400 + Math.random() * 1400;
        for (let k = 0; k < n; k++) {
          const tt = now + k * (0.07 + Math.random() * 0.05);
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(base, tt);
          o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.3), tt + 0.05);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, tt);
          g.gain.linearRampToValueAtTime(0.025, tt + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0005, tt + 0.07);
          o.connect(g).connect(bus);
          o.start(tt);
          o.stop(tt + 0.08);
        }
        window.setTimeout(chirp, 2500 + Math.random() * 5000);
      };
      window.setTimeout(chirp, 1500);
      stops.push(() => (alive = false));
    }
    if (id === 'city') {
      // vento entre as casas, o murmúrio de uma cidade que reza baixo e um sino distante
      const w = noise('bandpass', 520, 0.7, 0.045);
      lfo(w.bf.frequency, 0.05, 180);
      lfo(w.g.gain, 0.09, 0.02);
      const crowd = noise('bandpass', 380, 3.5, 0.03);
      lfo(crowd.bf.frequency, 0.13, 70);
      lfo(crowd.g.gain, 0.21, 0.015);
      noise('lowpass', 160, 0.6, 0.08);
      let alive = true;
      const toll = () => {
        if (!alive) return;
        this.bell(bus, ctx.currentTime, pick([52, 55, 59]), 0.03);
        window.setTimeout(toll, 18000 + Math.random() * 22000);
      };
      window.setTimeout(toll, 6000 + Math.random() * 6000);
      stops.push(() => (alive = false));
    } else if (id === 'nave') {
      // o ar parado de uma nave enorme: grave fundo, um chiado de velas e vozes que voltam do eco
      noise('lowpass', 120, 0.6, 0.18);
      const air = noise('bandpass', 900, 0.5, 0.012);
      lfo(air.g.gain, 0.07, 0.006);
      let alive = true;
      const voice = () => {
        if (!alive) return;
        this.choir(bus, ctx.currentTime, pick([52, 55, 59, 64]), 4 + Math.random() * 3, 0.01);
        window.setTimeout(voice, 9000 + Math.random() * 12000);
      };
      const crackle = () => {
        if (!alive) return;
        const now = ctx.currentTime;
        for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) this.nz(bus, now + k * 0.03 + Math.random() * 0.02, 0.012, 'highpass', 5200, 4200, 0.03, 1);
        window.setTimeout(crackle, 700 + Math.random() * 2600);
      };
      window.setTimeout(voice, 3000);
      window.setTimeout(crackle, 900);
      stops.push(() => (alive = false));
    }
    if (id === 'prison') {
      // pedra fria e úmida embaixo da cidade: grave abafado, um gemido de ar nos corredores,
      // correntes que balançam sozinhas e, de longe, uma porta de ferro batendo
      noise('lowpass', 110, 0.6, 0.2);
      const moan = noise('bandpass', 330, 6, 0.035);
      lfo(moan.bf.frequency, 0.035, 120);
      lfo(moan.g.gain, 0.06, 0.02);
      const air = noise('bandpass', 1400, 0.6, 0.008);
      lfo(air.g.gain, 0.09, 0.004);
      let alive = true;
      const rattle = () => {
        if (!alive) return;
        this.chain(bus, ctx.currentTime, 0.008 + Math.random() * 0.01);
        window.setTimeout(rattle, 4000 + Math.random() * 9000);
      };
      const door = () => {
        if (!alive) return;
        const now = ctx.currentTime;
        this.metal(bus, now, pick([40, 43, 46]), 0.03, 1.6);
        this.nz(bus, now, 0.6, 'lowpass', 300, 90, 0.08, 0.7);
        window.setTimeout(door, 20000 + Math.random() * 26000);
      };
      window.setTimeout(rattle, 2500);
      window.setTimeout(door, 9000 + Math.random() * 8000);
      stops.push(() => (alive = false));
    }
    if (id === 'mine') {
      // a rocha por cima de tudo: um grave que nunca para, o ar parado com poeira, a madeira das
      // escoras gemendo com o peso, pedrinhas que caem e, bem longe, uma picareta que ninguém segura
      noise('lowpass', 90, 0.6, 0.22);
      const air = noise('bandpass', 620, 0.7, 0.012);
      lfo(air.g.gain, 0.06, 0.006);
      let alive = true;
      const creak = () => {
        if (!alive) return;
        const now = ctx.currentTime;
        this.nz(bus, now, 0.5 + Math.random() * 0.4, 'bandpass', 320 + Math.random() * 120, 170, 0.035, 9);
        window.setTimeout(creak, 7000 + Math.random() * 11000);
      };
      const pebbles = () => {
        if (!alive) return;
        const now = ctx.currentTime;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++) this.nz(bus, now + k * (0.05 + Math.random() * 0.07), 0.02, 'bandpass', 2400 + Math.random() * 1800, 1800, 0.02, 3);
        window.setTimeout(pebbles, 5000 + Math.random() * 9000);
      };
      const strike = () => {
        if (!alive) return;
        const now = ctx.currentTime;
        for (let k = 0; k < 3; k++) this.metal(bus, now + k * 0.62, 82, 0.007, 0.18);
        window.setTimeout(strike, 16000 + Math.random() * 20000);
      };
      window.setTimeout(creak, 3000);
      window.setTimeout(pebbles, 1800);
      window.setTimeout(strike, 8000 + Math.random() * 6000);
      stops.push(() => (alive = false));
    }
    if (id === 'snow') {
      // a floresta na neve: vento frio que sobe e desce entre os troncos, um assobio fino nos galhos,
      // a madeira dos pinheiros rangendo, neve que despenca de um galho e, de longe, uma coruja ou um
      // uivo (nunca perto)
      const w = noise('bandpass', 620, 0.7, 0.05);
      lfo(w.bf.frequency, 0.05, 240);
      lfo(w.g.gain, 0.08, 0.028);
      const whistle = noise('bandpass', 2300, 6, 0.006);
      lfo(whistle.bf.frequency, 0.11, 500);
      lfo(whistle.g.gain, 0.13, 0.004);
      noise('lowpass', 140, 0.6, 0.07);
      let alive = true;
      const creak = () => {
        if (!alive) return;
        const now = ctx.currentTime;
        this.nz(bus, now, 0.7 + Math.random() * 0.5, 'bandpass', 260 + Math.random() * 120, 190, 0.03, 12);
        window.setTimeout(creak, 6000 + Math.random() * 10000);
      };
      const slump = () => {
        if (!alive) return;
        this.nz(bus, ctx.currentTime, 0.5, 'lowpass', 900, 200, 0.05, 0.7);
        window.setTimeout(slump, 9000 + Math.random() * 14000);
      };
      const far = () => {
        if (!alive) return;
        const now = ctx.currentTime;
        if (Math.random() < 0.6) this.hoot(bus, now, 0.012);
        else this.howl(bus, now, 0.01, 0.9);
        window.setTimeout(far, 16000 + Math.random() * 20000);
      };
      window.setTimeout(creak, 2500);
      window.setTimeout(slump, 5000);
      window.setTimeout(far, 7000 + Math.random() * 6000);
      stops.push(() => (alive = false));
    }
    if (id === 'hearth') {
      // dentro da cabana: a lenha estalando, o fogo respirando e o vento lá fora, abafado pelas paredes
      noise('lowpass', 300, 0.5, 0.05);
      const fire = noise('bandpass', 900, 0.8, 0.018);
      lfo(fire.g.gain, 0.6, 0.008);
      const out = noise('bandpass', 420, 0.7, 0.018);
      lfo(out.g.gain, 0.07, 0.01);
      let alive = true;
      const crackle = () => {
        if (!alive) return;
        const now = ctx.currentTime;
        const n = 1 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++) this.nz(bus, now + k * (0.04 + Math.random() * 0.09), 0.015, 'highpass', 3600 + Math.random() * 2400, 3000, 0.035, 1.5);
        window.setTimeout(crackle, 300 + Math.random() * 1500);
      };
      window.setTimeout(crackle, 400);
      stops.push(() => (alive = false));
    }
    this.amb = { id, bus, stop: () => stops.forEach((f) => f()) };
  }

  // a coruja ao longe: duas notas graves e redondas
  hoot(dest: AudioNode, t: number, vol: number) {
    for (const [dt, f0, f1, len] of [[0, 410, 380, 0.22], [0.42, 400, 350, 0.5]] as const) {
      const o = this.ctx!.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t + dt);
      o.frequency.exponentialRampToValueAtTime(f1, t + dt + len);
      const g = this.env(t + dt, 0.04, vol, dest);
      g.gain.setValueAtTime(vol, t + dt + len * 0.6);
      g.gain.linearRampToValueAtTime(0, t + dt + len);
      o.connect(g);
      o.start(t + dt);
      o.stop(t + dt + len + 0.05);
    }
  }

  // uivo: a voz sobe, segura tremendo e cai; um pouco de ar por cima
  howl(dest: AudioNode, t: number, vol: number, rate = 1) {
    const ctx = this.ctx!;
    const len = 2.2 / rate;
    const base = 330 * rate;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 0.7, t);
    o.frequency.linearRampToValueAtTime(base * 1.6, t + len * 0.3);
    o.frequency.setValueAtTime(base * 1.6, t + len * 0.65);
    o.frequency.linearRampToValueAtTime(base * 1.05, t + len);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6;
    const lg = ctx.createGain();
    lg.gain.value = base * 0.02;
    lfo.connect(lg).connect(o.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = base * 2.4;
    bp.Q.value = 3;
    const g = this.env(t, 0.25, vol, dest);
    g.gain.setValueAtTime(vol, t + len * 0.7);
    g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(bp).connect(g);
    o.start(t);
    lfo.start(t);
    o.stop(t + len + 0.05);
    lfo.stop(t + len + 0.05);
    this.nz(dest, t + 0.1, len * 0.8, 'bandpass', 1800, 1200, vol * 0.4, 2);
  }

  // ---------- efeitos ----------
  sfx(name: SfxName, opt: { vol?: number; rate?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const v = opt.vol ?? 1;
    const r = opt.rate ?? 1;
    const out = ctx.createGain();
    out.gain.value = v;
    out.connect(this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = this.space;
    out.connect(send).connect(this.reverb);
    window.setTimeout(() => out.disconnect(), 4500);
    switch (name) {
      case 'slash':
        this.nz(out, t, 0.09, 'bandpass', 2600 * r, 900 * r, 0.5, 2.5);
        break;
      case 'heavy':
        this.nz(out, t, 0.28, 'bandpass', 420 * r, 1700 * r, 0.55, 1.3);
        this.tone(out, t, 0.22, 'sine', 130, 55, 0.22);
        break;
      case 'stab':
        this.nz(out, t, 0.055, 'highpass', 3200 * r, 1500 * r, 0.38, 1);
        break;
      case 'bow':
        this.tone(out, t, 0.13, 'triangle', 230, 140, 0.22);
        this.nz(out, t, 0.06, 'bandpass', 1300, 700, 0.2, 2);
        break;
      case 'thunk':
        this.tone(out, t, 0.07, 'sine', 190, 80, 0.3);
        this.nz(out, t, 0.05, 'lowpass', 1000, 300, 0.28, 0.8);
        break;
      case 'dash':
        this.nz(out, t, 0.16, 'lowpass', 1800, 300, 0.45, 0.8);
        break;
      case 'jump':
        this.nz(out, t, 0.06, 'lowpass', 900, 400, 0.15, 0.7);
        break;
      case 'land':
        this.tone(out, t, 0.09, 'sine', 110, 50, 0.45);
        this.nz(out, t, 0.06, 'lowpass', 700, 200, 0.22, 0.7);
        if (this.stepKind === 'wet') this.nz(out, t, 0.12, 'bandpass', 2400, 900, 0.16, 1.2);
        break;
      case 'step':
        if (this.stepKind === 'grass') this.nz(out, t, 0.05, 'bandpass', 3000 * r, 1800, 0.07, 0.9);
        else if (this.stepKind === 'snow') {
          // neve: o rangido curto da neve fofa sendo pisada
          this.nz(out, t, 0.07, 'bandpass', 1500 * r, 900, 0.09, 1.6);
          this.nz(out, t + 0.02, 0.05, 'highpass', 3800 * r, 2600, 0.03, 1);
        } else if (this.stepKind === 'ice') {
          this.nz(out, t, 0.03, 'highpass', 2600 * r, 1800, 0.06, 1.2);
          this.tone(out, t, 0.05, 'sine', 1900 * r, 1700 * r, 0.012);
        } else if (this.stepKind === 'wood') {
          this.tone(out, t, 0.06, 'triangle', 190 * r, 120, 0.09);
          this.nz(out, t, 0.04, 'bandpass', 900 * r, 500, 0.06, 2);
        } else this.nz(out, t, 0.035, 'lowpass', 520 * r, 180, 0.1, 0.8);
        if (this.stepKind === 'wet') this.nz(out, t + 0.01, 0.06, 'bandpass', 2600 * r, 1100, 0.07, 1.4);
        break;
      case 'hit':
        this.tone(out, t, 0.07, 'square', 240, 120, 0.12);
        this.nz(out, t, 0.08, 'highpass', 2500, 1200, 0.4, 1);
        break;
      case 'hurt':
        this.tone(out, t, 0.2, 'sawtooth', 140, 45, 0.25);
        this.nz(out, t, 0.22, 'highpass', 5000, 2500, 0.35, 4);
        this.tone(out, t + 0.02, 0.18, 'sine', 3100, 2900, 0.05);
        break;
      case 'kill':
        this.tone(out, t, 0.3, 'triangle', 420, 90, 0.25);
        this.nz(out, t, 0.25, 'bandpass', 1400, 300, 0.3, 1.5);
        break;
      case 'thunder': {
        // estalo seco e um ronco longo que rola
        this.nz(out, t, 0.16, 'highpass', 1800, 700, 0.18 * v, 0.7);
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(900, t);
        lp.frequency.exponentialRampToValueAtTime(110, t + 3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.75, t + 0.08);
        g.gain.setTargetAtTime(0.35, t + 0.3, 0.4);
        g.gain.exponentialRampToValueAtTime(0.001, t + 3.6);
        src.connect(lp).connect(g).connect(out);
        src.start(t, Math.random());
        src.stop(t + 3.7);
        break;
      }
      case 'drip':
        this.tone(out, t, 0.06, 'sine', 1500 * r, 700 * r, 0.16);
        this.tone(out, t + 0.035, 0.05, 'sine', 950 * r, 500 * r, 0.08);
        break;
      case 'crack':
        this.nz(out, t, 0.03, 'highpass', 4200, 3000, 0.4, 1);
        this.nz(out, t + 0.05, 0.025, 'highpass', 5200, 3500, 0.28, 1);
        this.nz(out, t + 0.11, 0.04, 'highpass', 3800, 2500, 0.34, 1);
        this.tone(out, t, 0.3, 'sine', 3100, 2800, 0.07);
        break;
      case 'shard':
        [1318.5, 1975.5, 2637].forEach((f, i) => {
          const tt = t + i * 0.12;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, tt);
          g.gain.linearRampToValueAtTime(0.12, tt + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0005, tt + 2.4);
          g.connect(out);
          this.osc('sine', f, tt, tt + 2.5, g);
        });
        break;
      case 'splash':
        this.nz(out, t, 0.2, 'bandpass', 1300, 380, 0.26, 1);
        break;
      case 'ui':
        this.tone(out, t, 0.035, 'sine', 900, 880, 0.07);
        break;
      case 'clang':
        // metal no metal: estalo agudo e duas notas que soam um pouco
        this.nz(out, t, 0.05, 'highpass', 5200, 3000, 0.4, 1.5);
        this.tone(out, t, 0.35, 'triangle', 1480 * r, 1420 * r, 0.12);
        this.tone(out, t, 0.25, 'square', 2210 * r, 2150 * r, 0.035);
        this.tone(out, t, 0.12, 'sine', 300, 160, 0.2);
        break;
      case 'caw': {
        // grasnado: ruído com formante que desce, repetido duas vezes
        for (let k = 0; k < 2; k++) {
          const tt = t + k * 0.16;
          this.nz(out, tt, 0.13, 'bandpass', 1500 * r, 700 * r, 0.32, 6);
          this.tone(out, tt, 0.12, 'sawtooth', 520 * r, 380 * r, 0.06);
        }
        break;
      }
      case 'swoosh':
        this.nz(out, t, 0.24, 'bandpass', 500 * r, 2600 * r, 0.4, 1.6);
        break;
      case 'thud':
        this.tone(out, t, 0.28, 'sine', 95, 38, 0.5);
        this.nz(out, t, 0.14, 'lowpass', 600, 120, 0.4, 0.8);
        this.nz(out, t + 0.03, 0.1, 'highpass', 3000, 1500, 0.08, 1);
        break;
      case 'chime':
        [784, 1175, 1568, 2349].forEach((f, i) => {
          const tt = t + i * 0.09;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, tt);
          g.gain.linearRampToValueAtTime(0.1, tt + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0005, tt + 1.8);
          g.connect(out);
          this.osc('sine', f, tt, tt + 1.9, g);
        });
        break;
      case 'bell': {
        // sino grave: parciais inarmônicos que somem devagar
        [1, 2.4, 2.98, 4.2, 5.4].forEach((m, i) => {
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime([0.22, 0.12, 0.08, 0.05, 0.03][i], t + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0005, t + 3.2 - i * 0.4);
          g.connect(out);
          this.osc('sine', 98 * r * m, t, t + 3.3, g);
        });
        this.nz(out, t, 0.05, 'highpass', 2500, 1200, 0.25, 1);
        break;
      }
      case 'rest':
        this.nz(out, t, 0.5, 'bandpass', 900, 2400, 0.12, 0.8);
        [523, 659, 784].forEach((f, i) => this.tone(out, t + 0.12 * i, 0.9, 'sine', f, f * 0.995, 0.06));
        break;
      case 'coin':
        this.tone(out, t, 0.08, 'square', 1900, 1880, 0.05);
        this.tone(out, t + 0.07, 0.3, 'sine', 2600, 2580, 0.08);
        break;
      case 'tink':
        // moeda: um tilintar curto e brilhante (quicando no chão ou pega)
        this.tone(out, t, 0.04, 'square', 2400 * r, 2350 * r, 0.02);
        this.tone(out, t, 0.2, 'sine', 3150 * r, 3120 * r, 0.07);
        this.tone(out, t + 0.03, 0.15, 'sine', 4720 * r, 4700 * r, 0.03);
        break;
      case 'mend':
        // caco de porcelana voltando para a máscara: duas notas de vidro que sobem
        [1046.5, 1568, 2093].forEach((f, i) => {
          const tt = t + i * 0.07;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, tt);
          g.gain.linearRampToValueAtTime([0.1, 0.08, 0.04][i], tt + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0005, tt + 1.3);
          g.connect(out);
          this.osc('sine', f, tt, tt + 1.4, g);
        });
        this.nz(out, t, 0.08, 'highpass', 6500, 4200, 0.05, 1);
        break;
      case 'ghost':
        // atravessar um inimigo no dash: um sopro oco que passa
        this.nz(out, t, 0.3, 'bandpass', 360 * r, 1500 * r, 0.32, 3);
        this.tone(out, t, 0.26, 'sine', 240 * r, 120 * r, 0.05);
        break;
      case 'roar':
        this.nz(out, t, 0.9, 'bandpass', 240, 160, 0.5, 2.5);
        this.tone(out, t, 0.9, 'sawtooth', 70, 48, 0.2);
        break;
      case 'ui-ok':
        this.tone(out, t, 0.06, 'sine', 660, 650, 0.09);
        this.tone(out, t + 0.06, 0.12, 'sine', 990, 980, 0.08);
        break;
      case 'ash':
        // criaturas virando cinza: um chiado seco que esfarela e um sopro grave por baixo
        this.nz(out, t, 1.1, 'bandpass', 2400 * r, 500 * r, 0.22, 0.9);
        this.nz(out, t + 0.05, 0.8, 'highpass', 6000, 3200, 0.06, 0.7);
        this.tone(out, t, 0.9, 'sine', 160 * r, 70 * r, 0.08);
        break;
      case 'quake':
        // o badalo no chão: pancada funda, terra que rola e um estalo de pedra
        this.tone(out, t, 0.55, 'sine', 70 * r, 34 * r, 0.6);
        this.nz(out, t, 0.45, 'lowpass', 900, 120, 0.45, 0.7);
        this.nz(out, t, 0.03, 'highpass', 3600, 2200, 0.22, 1);
        break;
      case 'equip':
        // item no lugar: fivela de metal e uma nota curta
        this.nz(out, t, 0.04, 'highpass', 4200, 2600, 0.16, 1.2);
        this.tone(out, t + 0.02, 0.16, 'triangle', 740 * r, 720 * r, 0.07);
        this.tone(out, t + 0.07, 0.22, 'sine', 1110 * r, 1100 * r, 0.05);
        break;
      case 'erase':
        // progresso apagado: notas que descem e um sopro que leva tudo
        [784, 587, 440, 330].forEach((f, i) => this.tone(out, t + i * 0.11, 0.5, 'sine', f, f * 0.985, 0.06));
        this.nz(out, t, 1.2, 'bandpass', 1800, 300, 0.12, 0.8);
        break;
      case 'parry':
        // aparar: um tinido limpo e alto que ecoa, diferente do escudo (mais agudo e brilhante)
        this.nz(out, t, 0.04, 'highpass', 7000, 4500, 0.4, 1.2);
        this.tone(out, t, 0.7, 'triangle', 2637 * r, 2600 * r, 0.14);
        this.tone(out, t, 0.5, 'sine', 3951 * r, 3920 * r, 0.07);
        this.tone(out, t + 0.012, 0.9, 'sine', 1318 * r, 1310 * r, 0.08);
        this.tone(out, t, 0.12, 'sine', 220, 110, 0.25);
        break;
      case 'break':
        // parede falsa caindo: pedra que racha, desaba e rola
        this.nz(out, t, 0.04, 'highpass', 3600, 2400, 0.3, 1);
        this.nz(out, t + 0.03, 0.55, 'lowpass', 1400 * r, 160, 0.5, 0.7);
        this.tone(out, t + 0.02, 0.4, 'sine', 90, 40, 0.45);
        for (let k = 0; k < 6; k++) this.nz(out, t + 0.12 + k * 0.07 + Math.random() * 0.05, 0.05, 'bandpass', 900 + Math.random() * 900, 400, 0.12, 2);
        break;
      case 'glass':
        // vitral estilhaçando: estalo e uma chuva de cacos agudos que tilintam
        this.nz(out, t, 0.06, 'highpass', 6000, 3500, 0.45, 1);
        this.nz(out, t, 0.5, 'highpass', 4200, 2600, 0.12, 0.8);
        for (let k = 0; k < 14; k++) {
          const tt = t + 0.02 + Math.random() * 0.6;
          const f = 2800 + Math.random() * 4200;
          this.tone(out, tt, 0.18 + Math.random() * 0.2, 'sine', f * r, f * r * 0.99, 0.02 + Math.random() * 0.025);
        }
        break;
      case 'page':
        // página do diário: papel velho virando
        this.nz(out, t, 0.12, 'bandpass', 2600, 4200, 0.12, 0.9);
        this.nz(out, t + 0.1, 0.16, 'bandpass', 3400, 2100, 0.1, 0.9);
        this.tone(out, t + 0.05, 0.6, 'sine', 1568, 1560, 0.035);
        break;
      case 'anvil':
        // martelo na bigorna: pancada seca e o ferro cantando por um tempo
        this.nz(out, t, 0.03, 'highpass', 5000, 3000, 0.35, 1);
        this.tone(out, t, 1.2, 'triangle', 1190 * r, 1180 * r, 0.1);
        this.tone(out, t, 0.9, 'sine', 2950 * r, 2930 * r, 0.05);
        this.tone(out, t, 0.6, 'sine', 4410 * r, 4400 * r, 0.025);
        this.tone(out, t, 0.08, 'sine', 180, 90, 0.3);
        break;
      case 'smoke':
        // incenso soltando fumaça: um sopro abafado que cresce e some
        {
          const src = ctx.createBufferSource();
          src.buffer = this.noise;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(500 * r, t);
          lp.frequency.exponentialRampToValueAtTime(180, t + 0.8);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.3, t + 0.12);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
          src.connect(lp).connect(g).connect(out);
          src.start(t, Math.random());
          src.stop(t + 0.95);
        }
        break;
      case 'echo': {
        // a sombra: um sopro que cresce ao contrário e duas notas ocas que sobem juntas
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.32);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
        g.connect(out);
        this.nz(g, t, 0.62, 'bandpass', 220 * r, 1100 * r, 0.6, 5);
        [146.8, 220].forEach((f, i) => {
          const o = ctx.createGain();
          o.gain.setValueAtTime(0.0001, t);
          o.gain.exponentialRampToValueAtTime(i ? 0.035 : 0.06, t + 0.3);
          o.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
          o.connect(out);
          const osc = this.osc(i ? 'triangle' : 'sine', f * r, t, t + 0.72, o);
          osc.frequency.exponentialRampToValueAtTime(f * r * 1.5, t + 0.6);
        });
        break;
      }
      case 'veil': {
        // o corpo vira tinta: um gole fundo, o líquido rasgando o ar e bolhas que estalam
        this.tone(out, t, 0.2, 'sine', 150 * r, 55 * r, 0.32);
        this.nz(out, t, 0.24, 'bandpass', 900 * r, 2600 * r, 0.3, 2.4);
        this.nz(out, t + 0.03, 0.18, 'lowpass', 1400, 260, 0.22, 0.9);
        for (let k = 0; k < 4; k++) {
          const tt = t + 0.02 + Math.random() * 0.16;
          const f = (520 + Math.random() * 700) * r;
          this.tone(out, tt, 0.045, 'sine', f, f * 1.9, 0.035);
        }
        break;
      }
      case 'howl':
        this.howl(out, t, 0.32, r);
        break;
      case 'hoot':
        this.hoot(out, t, 0.2);
        break;
      case 'growl':
        // rosnado: um ronco grave que treme, com o ar passando entre os dentes
        this.tone(out, t, 0.42, 'sawtooth', 74 * r, 62 * r, 0.07);
        for (let k = 0; k < 7; k++) this.nz(out, t + k * 0.055, 0.07, 'lowpass', 420 * r, 220 * r, 0.16, 3);
        this.nz(out, t + 0.05, 0.3, 'bandpass', 2400 * r, 1800 * r, 0.03, 2);
        break;
      case 'yelp':
        // ganido: sobe e quebra
        this.tone(out, t, 0.09, 'triangle', 980 * r, 1650 * r, 0.11);
        this.tone(out, t + 0.08, 0.16, 'triangle', 1500 * r, 640 * r, 0.09);
        this.nz(out, t, 0.12, 'bandpass', 2600 * r, 1500 * r, 0.05, 2);
        break;
      case 'plop':
        // um peixe subindo embaixo da linha d'água: bolhas que estouram, ocas
        this.tone(out, t, 0.08, 'sine', 380 * r, 880 * r, 0.11);
        this.tone(out, t + 0.07, 0.07, 'sine', 460 * r, 1020 * r, 0.06);
        this.nz(out, t, 0.06, 'bandpass', 1500 * r, 900 * r, 0.04, 2);
        break;
      case 'leap':
        // o peixe rompe a água: o estouro, a água que sobe e cai, o rabo batendo
        this.nz(out, t, 0.3, 'bandpass', 1500 * r, 520 * r, 0.3, 0.9);
        this.nz(out, t + 0.02, 0.1, 'highpass', 3600 * r, 2400 * r, 0.1, 1);
        this.tone(out, t, 0.1, 'sine', 280 * r, 120 * r, 0.12);
        break;
      case 'flop':
        // o peixe batendo na terra: um tapa molhado
        this.nz(out, t, 0.06, 'bandpass', 900 * r, 520 * r, 0.24, 1.4);
        this.tone(out, t, 0.05, 'sine', 170 * r, 90 * r, 0.12);
        break;
      case 'heron':
        // a garça: o grito rouco e curto, um serrote grave com o ar raspando por cima
        this.tone(out, t, 0.3, 'sawtooth', 236 * r, 148 * r, 0.05);
        this.nz(out, t, 0.28, 'bandpass', 1100 * r, 720 * r, 0.15, 3);
        this.nz(out, t + 0.02, 0.2, 'bandpass', 2300 * r, 1600 * r, 0.06, 4);
        break;
      case 'buzz':
        // os Vaga-lumes do Eclipse: um zumbido grave e escuro que pulsa, como asas pequenas batendo longe
        this.tone(out, t, 0.7, 'sawtooth', 68 * r, 64 * r, 0.035);
        this.tone(out, t, 0.7, 'sawtooth', 71 * r, 67 * r, 0.03);
        for (let k = 0; k < 6; k++) this.nz(out, t + k * 0.1, 0.08, 'bandpass', 420 * r, 360 * r, 0.05, 5);
        break;
      case 'gurgle':
        // o barco subindo por baixo: bolhas grandes e ocas estourando e o ronco da água funda
        this.nz(out, t, 0.9, 'lowpass', 380 * r, 160 * r, 0.16, 0.7);
        for (let k = 0; k < 7; k++) {
          const tt = t + k * 0.09 + Math.random() * 0.05;
          const f = (220 + Math.random() * 180) * r;
          this.tone(out, tt, 0.07, 'sine', f, f * 2.3, 0.07);
        }
        break;
      case 'creak':
        // a madeira molhada do barco e da vara rangendo: um serrote lento e rouco
        this.tone(out, t, 0.32, 'sawtooth', 170 * r, 120 * r, 0.035);
        this.tone(out, t + 0.05, 0.25, 'sawtooth', 240 * r, 205 * r, 0.02);
        this.nz(out, t, 0.3, 'bandpass', 900 * r, 600 * r, 0.06, 8);
        break;
      case 'rope':
        // a corda esticando de uma vez: o estalo e a fibra zunindo
        this.nz(out, t, 0.05, 'bandpass', 1800 * r, 1200 * r, 0.25, 3);
        this.tone(out, t, 0.25, 'triangle', 190 * r, 150 * r, 0.08);
        this.nz(out, t + 0.03, 0.2, 'bandpass', 600 * r, 400 * r, 0.06, 4);
        break;
      case 'beam':
        // o feixe da Vigia Rúnica: o estalo claro de quando solta e o zumbido quente que corta o ar e some
        this.nz(out, t, 0.05, 'highpass', 5200 * r, 3000 * r, 0.16, 1);
        this.tone(out, t, 0.34, 'sawtooth', 880 * r, 800 * r, 0.035);
        this.tone(out, t, 0.36, 'sine', 1760 * r, 1600 * r, 0.06);
        this.nz(out, t + 0.01, 0.32, 'bandpass', 3200 * r, 2000 * r, 0.06, 6);
        break;
      case 'sap':
        // o Âmbar saindo do peito para a mão de um Arquivado: um brilho que desce e some, com um sopro frio
        this.tone(out, t, 0.55, 'sine', 1760 * r, 420 * r, 0.06);
        this.tone(out, t + 0.04, 0.5, 'triangle', 1318 * r, 310 * r, 0.025);
        this.nz(out, t, 0.5, 'bandpass', 2600 * r, 700 * r, 0.05, 3);
        break;
      case 'lantern':
        // a lanterna do caçador balançando na ponta da lança: o rangido da alça e o vidro tocando
        this.nz(out, t, 0.08, 'bandpass', 3200 * r, 2600 * r, 0.05, 6);
        this.tone(out, t + 0.03, 0.5, 'sine', 2093 * r, 2080 * r, 0.03);
        this.tone(out, t + 0.03, 0.4, 'sine', 3136 * r, 3120 * r, 0.015);
        break;
      case 'horn':
        // a trompa do Mestre da Caça: a chamada inteira, longa e rouca
        this.horn(out, t, 52, 0.45, 0.22);
        this.horn(out, t + 0.5, 59, 0.45, 0.22);
        this.horn(out, t + 1, 64, 1.6, 0.26);
        break;
      case 'gust':
        // rajada: o vento que chega, passa e vai embora
        this.nz(out, t, 1.4, 'bandpass', 380 * r, 1400 * r, 0.22, 0.9);
        this.nz(out, t + 0.2, 1.1, 'bandpass', 2200 * r, 900 * r, 0.06, 2);
        break;
      case 'flap':
        this.nz(out, t, 0.12, 'bandpass', 700 * r, 300 * r, 0.22, 1.2);
        this.nz(out, t + 0.14, 0.1, 'bandpass', 650 * r, 280 * r, 0.14, 1.2);
        break;
      case 'crunch':
        // aterrissou na neve: o baque fofo e o rangido
        this.nz(out, t, 0.16, 'lowpass', 900 * r, 200, 0.22, 0.8);
        this.nz(out, t + 0.01, 0.1, 'bandpass', 1700 * r, 1000, 0.12, 1.4);
        break;
      case 'ice-crack':
        // o gelo fino racha: estalos secos que correm e um gemido grave por baixo
        for (let k = 0; k < 4; k++) this.nz(out, t + k * 0.045 + Math.random() * 0.02, 0.025, 'highpass', 3400 + Math.random() * 2400, 2600, 0.28, 1);
        this.tone(out, t, 0.6, 'sine', 210 * r, 120 * r, 0.08);
        break;
      case 'ice-break':
        this.nz(out, t, 0.12, 'highpass', 4200, 2000, 0.45, 1);
        this.nz(out, t + 0.05, 0.5, 'bandpass', 1100, 300, 0.3, 1);
        [1760, 2349, 2960].forEach((f, i) => this.tone(out, t + 0.02 + i * 0.05, 0.4, 'sine', f * r, f * r * 0.97, 0.05));
        this.tone(out, t + 0.08, 0.5, 'sine', 140, 60, 0.2);
        break;
      case 'freeze':
        // a água gelada: o mergulho e o frio que morde
        this.nz(out, t, 0.3, 'bandpass', 1200, 400, 0.3, 1);
        this.tone(out, t + 0.1, 0.5, 'sine', 2600 * r, 3400 * r, 0.04);
        this.nz(out, t + 0.12, 0.5, 'highpass', 6000, 4000, 0.06, 2);
        break;
      case 'veil-form':
        // a tinta volta a ser gente: um respingo que sobe e assenta
        this.nz(out, t, 0.14, 'bandpass', 1700 * r, 600 * r, 0.16, 2);
        this.tone(out, t, 0.12, 'sine', 90 * r, 170 * r, 0.16);
        this.tone(out, t + 0.05, 0.05, 'sine', 980 * r, 1500 * r, 0.025);
        break;
      case 'echo-die':
        // a sombra se desfaz: um respiro que se solta, vidro escuro e um sino pequeno
        this.nz(out, t, 0.8, 'bandpass', 1400 * r, 260 * r, 0.32, 2);
        this.tone(out, t, 0.9, 'sine', 330 * r, 82 * r, 0.12);
        [988, 1480, 1976].forEach((f, i) => this.tone(out, t + 0.16 + i * 0.07, 1.1, 'sine', f * r, f * r * 0.995, 0.05));
        break;
      case 'coinrain':
        // chuva do dízimo: moedas batendo em toda parte
        for (let k = 0; k < 16; k++) {
          const tt = t + Math.random() * 0.9;
          const f = 2300 + Math.random() * 1600;
          this.tone(out, tt, 0.12, 'sine', f, f * 0.99, 0.03);
          this.tone(out, tt, 0.03, 'square', f * 0.75, f * 0.74, 0.008);
        }
        break;
      case 'door':
        // porta pesada de madeira: rangido grave e o baque ao fechar
        this.nz(out, t, 0.5, 'bandpass', 280 * r, 420 * r, 0.16, 6);
        this.tone(out, t, 0.45, 'sawtooth', 92 * r, 70 * r, 0.04);
        this.tone(out, t + 0.42, 0.25, 'sine', 90, 42, 0.4);
        this.nz(out, t + 0.42, 0.12, 'lowpass', 700, 150, 0.25, 0.8);
        break;
      case 'locked':
        // trinco que não cede: três batidas curtas de ferro
        for (let k = 0; k < 3; k++) {
          this.tone(out, t + k * 0.09, 0.06, 'square', 340, 300, 0.05);
          this.nz(out, t + k * 0.09, 0.04, 'bandpass', 1600, 900, 0.16, 3);
        }
        break;
      case 'censer':
        // incensário girando na corrente: elos que chiam e o metal que tilinta
        this.nz(out, t, 0.32, 'bandpass', 700 * r, 2400 * r, 0.22, 1.4);
        for (let k = 0; k < 5; k++) this.tone(out, t + k * 0.05, 0.05, 'square', (2900 + k * 140) * r, 2800 * r, 0.012);
        break;
      case 'draw':
        // corda do arco esticando
        this.tone(out, t, 0.45, 'triangle', 160 * r, 260 * r, 0.05);
        this.nz(out, t, 0.4, 'bandpass', 1800, 2600, 0.04, 4);
        break;
      case 'gate':
        // grade de ferro subindo: corrente que range e roda
        for (let k = 0; k < 10; k++) {
          this.tone(out, t + k * 0.16, 0.08, 'square', 210 + (k % 2) * 30, 180, 0.03);
          this.nz(out, t + k * 0.16, 0.07, 'bandpass', 1300, 700, 0.07, 3);
        }
        this.nz(out, t, 1.7, 'lowpass', 400, 200, 0.12, 0.7);
        break;
    }
  }

  private tone(dest: AudioNode, t: number, dur: number, type: OscillatorType, f0: number, f1: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private nz(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }
}

export const audio = new AudioEngine();

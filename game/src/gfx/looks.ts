import type { Theme } from '../world/Level';
import type { RoomId } from '../world/rooms';
import type { Look } from './extreme';

// Clima de cada área no High e no EXTREME. Ao ar livre o EXTREME não fica mais escuro que o original
// longe das luzes (luz de fundo perto de 1); o que ele traz é luz de verdade em volta das chamas e
// janelas, cantos mais fundos, brilho, fachos e névoa em camadas. Nos lugares fechados (catacumbas,
// prisão, fosso, minas, a catedral por dentro, a cabana) o escuro é de verdade: a luz de fundo cai para
// perto da metade e as chamas ficam mais fortes e chegam mais longe, então cada vela, tocha e cristal
// vira uma ilha de luz no meio do breu. A luz em volta do cavaleiro cresce junto, para o chão perto
// dele continuar legível, e o que já brilha (máscara, olhos, chamas) passa por cima do escuro.
// A direção é escura e melancólica, feita à mão: nada saturado demais. Da prisão em diante a pintura a
// óleo vai crescendo (oil).

const BASE: Look = {
  ambient: [1, 1, 1],
  sky: [0, 0, 0],
  skyDepth: 0,
  knight: 0.22,
  knightR: 96,
  ao: 0.34,
  lightGain: 1.15,
  reach: 1,
  bounce: 0.3,
  relief: 0.28,
  bloomThreshold: 0.62,
  bloom: 0.5,
  rays: 0.35,
  mistColor: [0.5, 0.52, 0.58],
  mist: 0.3,
  mistFront: 0,
  water: 0.5,
  reflTint: [0.78, 0.9, 1.0],
  wet: 0,
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  sat: 1.04,
  shadowTint: [0.98, 0.99, 1.02],
  highTint: [1.03, 1.0, 0.97],
  oil: 0,
  flicker: 0,
};

const THEMES: Record<Theme, Partial<Look>> = {
  // ponte na chuva, de noite: os lampiões fazem poças de luz, o tabuleiro molhado reflete
  bridge: {
    ambient: [0.96, 0.97, 1.0],
    sky: [0.06, 0.07, 0.08],
    knight: 0.2,
    ao: 0.16,
    bounce: 0.18,
    bloomThreshold: 0.58,
    bloom: 0.6,
    rays: 0.45,
    mistColor: [0.52, 0.58, 0.7],
    mist: 0.62,
    mistFront: 0.1,
    wet: 0.26,
  },
  // catacumbas: pedra quente, velas, escuro fundo entre uma luz e outra
  catacomb: {
    ambient: [0.42, 0.41, 0.47],
    knight: 0.5,
    knightR: 118,
    ao: 0.5,
    lightGain: 1.8,
    reach: 1.3,
    bounce: 0.44,
    relief: 0.34,
    bloomThreshold: 0.52,
    bloom: 0.6,
    rays: 0.36,
    mistColor: [0.5, 0.45, 0.42],
    mist: 0.2,
    highTint: [1.05, 1.0, 0.94],
    flicker: 0.14,
  },
  // o vale da memória: dia claro, sol baixo, névoa leve e água que reflete
  memory: {
    sky: [0.05, 0.05, 0.045],
    knight: 0,
    ao: 0.2,
    lightGain: 0.8,
    bounce: 0.2,
    relief: 0.22,
    bloomThreshold: 0.76,
    bloom: 0.42,
    rays: 0.55,
    mistColor: [0.95, 0.97, 1.0],
    mist: 0.4,
    mistFront: 0.08,
    water: 0.55,
    highTint: [1.03, 1.01, 0.97],
    sat: 1.05,
  },
  // Cidade-Catedral: fim de tarde do eclipse sobre pedra cinza, lampiões e janelas acesas
  city: {
    sky: [0.05, 0.045, 0.04],
    knight: 0.18,
    ao: 0.26,
    bounce: 0.24,
    bloomThreshold: 0.62,
    bloom: 0.52,
    rays: 0.45,
    mistColor: [0.62, 0.56, 0.52],
    mist: 0.34,
    mistFront: 0.06,
    flicker: 0.06,
  },
  // a catedral por dentro: vitrais, incenso no ar, fachos de luz (mais clara que a cripta: as janelas)
  nave: {
    ambient: [0.64, 0.62, 0.66],
    knight: 0.34,
    knightR: 108,
    ao: 0.4,
    lightGain: 1.45,
    reach: 1.15,
    bloomThreshold: 0.6,
    bloom: 0.58,
    rays: 0.6,
    mistColor: [0.6, 0.55, 0.5],
    mist: 0.3,
    highTint: [1.04, 1.0, 0.95],
    // chão de pedra polida: reflete de leve as velas e os fachos
    wet: 0.12,
    flicker: 0.1,
  },
  // prisão: ferro frio, tochas, umidade
  prison: {
    ambient: [0.44, 0.46, 0.52],
    knight: 0.5,
    knightR: 118,
    ao: 0.48,
    lightGain: 1.75,
    reach: 1.25,
    bounce: 0.38,
    relief: 0.34,
    bloomThreshold: 0.56,
    bloom: 0.56,
    rays: 0.35,
    mistColor: [0.42, 0.46, 0.52],
    mist: 0.2,
    shadowTint: [0.98, 0.99, 1.03],
    highTint: [1.04, 1.0, 0.95],
    oil: 0.15,
    flicker: 0.12,
  },
  // minas: rocha quente de poeira, só a luz do Âmbar (cristais e veios) e dos lampiões dos mineiros
  mine: {
    ambient: [0.4, 0.38, 0.38],
    // a luz em volta do cavaleiro um pouco maior que na prisão: a rocha é escura e o chão precisa ler
    knight: 0.54,
    knightR: 126,
    ao: 0.48,
    lightGain: 1.8,
    reach: 1.3,
    lift: [0.008, 0.006, 0.004],
    bounce: 0.42,
    relief: 0.36,
    bloomThreshold: 0.55,
    bloom: 0.6,
    rays: 0.3,
    mistColor: [0.56, 0.44, 0.32],
    mist: 0.26,
    shadowTint: [0.99, 0.98, 1.02],
    highTint: [1.05, 1.0, 0.93],
    oil: 0.2,
    flicker: 0.1,
  },
  // Floresta Nevada: dia branco de neve, luz fria entre os troncos (fachos fortes, como na abertura),
  // névoa clara no chão; a neve reflete o céu e as sombras puxam para o azul
  snow: {
    sky: [0.1, 0.11, 0.12],
    knight: 0.12,
    ao: 0.24,
    lightGain: 1.0,
    bounce: 0.3,
    relief: 0.24,
    bloomThreshold: 0.72,
    bloom: 0.46,
    rays: 0.62,
    mistColor: [0.86, 0.9, 0.96],
    mist: 0.46,
    mistFront: 0.08,
    water: 0.4,
    shadowTint: [0.96, 0.99, 1.06],
    highTint: [1.0, 1.0, 1.01],
    sat: 0.98,
    oil: 0.18,
  },
};

// salas com luz própria
const ROOMS: Partial<Record<RoomId, Partial<Look>>> = {
  // a escadaria sobe para a praça: a luz da cidade entra pela boca lá em cima e some descendo
  escadaria: { sky: [0.42, 0.38, 0.34], skyDepth: 26, rays: 0.42 },
  // o poço: a luz da cidade cai lá de cima pela boca estreita e vai sumindo até o fundo
  poco: { sky: [0.5, 0.5, 0.54], skyDepth: 30, rays: 0.5 },
  // fosso e abismo: a tinta da sombra no ar, roxo e preto, o lugar mais escuro até aqui
  fosso: {
    ambient: [0.36, 0.32, 0.43],
    reflTint: [1.0, 0.7, 1.1],
    mistColor: [0.42, 0.28, 0.56],
    mist: 0.42,
    shadowTint: [0.99, 0.96, 1.04],
    highTint: [1.01, 0.98, 1.03],
    oil: 0.2,
  },
  // a Margem da Tinta: a calha entre o Fosso e o Leito do Abismo; a tinta corrente reflete em roxo
  margem: {
    ambient: [0.35, 0.31, 0.43],
    water: 0.4,
    reflTint: [1.0, 0.7, 1.1],
    mistColor: [0.42, 0.28, 0.56],
    mist: 0.4,
    shadowTint: [0.99, 0.96, 1.04],
    highTint: [1.01, 0.98, 1.03],
    oil: 0.2,
  },
  // a cabana: lá fora o dia de neve; debaixo do telhado só a lareira esquenta (e ilumina) por dentro
  cabana: { ambient: [0.46, 0.47, 0.52], sky: [0.58, 0.6, 0.62], knightR: 110, knight: 0.36, lightGain: 1.6, reach: 1.25, highTint: [1.05, 1.0, 0.94], flicker: 0.14 },
  // a fenda da serra: mais fria e mais funda; a luz do céu desce pela fenda e a gruta do lado fica no escuro
  serra: { ambient: [0.5, 0.53, 0.6], sky: [0.5, 0.54, 0.58], skyDepth: 40, knight: 0.4, knightR: 112, lightGain: 1.5, reach: 1.2, mist: 0.36, shadowTint: [0.95, 0.99, 1.08] },
  // o lago congelado reflete
  lago: { wet: 0.14 },
  abismo: {
    ambient: [0.34, 0.3, 0.42],
    reflTint: [1.0, 0.7, 1.1],
    // o lago de tinta reflete
    wet: 0.3,
    mistColor: [0.4, 0.26, 0.54],
    mist: 0.46,
    shadowTint: [0.99, 0.95, 1.05],
    highTint: [1.01, 0.98, 1.04],
    oil: 0.22,
  },
};

export function lookFor(theme: Theme, room: RoomId, paint?: number): Look {
  const l: Look = { ...BASE, ...THEMES[theme], ...ROOMS[room] };
  if (paint !== undefined) l.oil = paint;
  return l;
}

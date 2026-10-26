import type { Theme } from '../world/Level';
import type { RoomId } from '../world/rooms';
import type { Look } from './extreme';

// Clima de cada área no High e no EXTREME. A regra: o EXTREME nunca fica mais escuro que o original
// longe das luzes (luz de fundo perto de 1); o que ele traz é luz de verdade em volta das chamas e
// janelas, cantos mais fundos, brilho, fachos e névoa em camadas. A direção é escura e melancólica,
// feita à mão: nada saturado demais, e o que precisa ser visto (chão, espinhos, inimigos, golpes)
// continua claro. Da prisão em diante a pintura a óleo vai crescendo (oil).

const BASE: Look = {
  ambient: [1, 1, 1],
  sky: [0, 0, 0],
  knight: 0.22,
  ao: 0.34,
  lightGain: 1.15,
  bounce: 0.3,
  relief: 0.28,
  bloomThreshold: 0.62,
  bloom: 0.5,
  rays: 0.35,
  mistColor: [0.5, 0.52, 0.58],
  mist: 0.3,
  mistFront: 0,
  water: 0.5,
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
    knight: 0.36,
    ao: 0.42,
    lightGain: 1.3,
    bounce: 0.34,
    relief: 0.32,
    bloomThreshold: 0.56,
    bloom: 0.55,
    rays: 0.3,
    mistColor: [0.5, 0.45, 0.42],
    mist: 0.22,
    highTint: [1.04, 1.0, 0.95],
    flicker: 0.12,
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
  // a catedral por dentro: vitrais, incenso no ar, fachos de luz
  nave: {
    knight: 0.26,
    ao: 0.36,
    lightGain: 1.2,
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
    knight: 0.36,
    ao: 0.42,
    lightGain: 1.3,
    bounce: 0.3,
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
    // a luz em volta do cavaleiro um pouco maior que na prisão: a rocha é escura e o chão precisa ler
    knight: 0.42,
    ao: 0.44,
    lightGain: 1.32,
    lift: [0.016, 0.012, 0.008],
    bounce: 0.36,
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
};

// salas com luz própria
const ROOMS: Partial<Record<RoomId, Partial<Look>>> = {
  // o poço: a luz da cidade cai lá de cima
  poco: { sky: [0.12, 0.12, 0.13], rays: 0.5 },
  // fosso e abismo: a tinta da sombra no ar, roxo e preto
  fosso: {
    mistColor: [0.42, 0.28, 0.56],
    mist: 0.42,
    shadowTint: [0.99, 0.96, 1.04],
    highTint: [1.01, 0.98, 1.03],
    oil: 0.2,
  },
  abismo: {
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

import type { EndingId } from './story';
import type { TrackId } from '../systems/Audio';

// Os três finais (lore/lore-oficial.md, Os três finais; lore/torres.md, T7). O que acontece no terraço do
// núcleo fica em world/Finale.ts; aqui ficam os planos pintados de cada final (scenes/EndingScene.ts), as
// falas do terraço, a memória da noite e os créditos.

// ela, com o nome só depois de "O nome dela" (antes, "ela" e "dela")
export function names(named: boolean) {
  return { ela: named ? 'Arielle' : 'ela', Ela: named ? 'Arielle' : 'Ela', dela: named ? 'de Arielle' : 'dela' };
}
export const fill = (text: string, named: boolean) => {
  const n = names(named);
  return text.replace(/\{(ela|Ela|dela)\}/g, (_m, k: keyof typeof n) => n[k]);
};

// os efeitos que andam por cima da pintura de um plano
export type FilmFx =
  // luzes douradas soltas no ar (memórias), as que caem sobre a cidade, as que sobem das cabeças
  | 'motes' | 'fall' | 'rise'
  // estrelas presas em volta do trono, fachos de luz, poeira na luz, pétalas no vento
  | 'stars' | 'rays' | 'dust' | 'petals'
  // a rachadura roxa que entorta a lembrança dela; o escuro que cresce
  | 'crack' | 'dark';

// uma camada pintada: o quadro dela no atlas do final (2 pixels da imagem por pixel do jogo), a profundidade e
// o movimento de câmera (escala de s0 a s1 e o deslocamento em px do jogo durante o plano)
export interface FilmLayer {
  frame: string;
  s0: number;
  s1: number;
  dx: number;
  dy: number;
  add?: boolean;
}

export interface FilmShot {
  layers: FilmLayer[];
  fx: FilmFx[];
  lines: string[];
  // vozes baixas que passam por cima (as acusações, as justificativas)
  voices?: string[];
  // a cor do efeito de luz (motes, fall, rise, rays)
  tint?: number;
  // de onde saem os fachos (rays), em px da pintura: o sol que está no quadro; sem isso eles descem do alto
  rayFrom?: [number, number];
}

export interface Film {
  title: string;
  track: TrackId;
  shots: FilmShot[];
  // a última frase, sozinha no escuro, antes do título
  last?: string;
  // a cor da tela entre os planos e no fim (o branco da manhã, o roxo do eclipse, o preto do silêncio)
  fade: [number, number, number];
}

const L = (frame: string, s0: number, s1: number, dx = 0, dy = 0, add = false): FilmLayer => ({ frame, s0, s1, dx, dy, add });

export const FILMS: Record<EndingId, Film> = {
  // Final I: a verdade sem absolvição
  truth: {
    title: 'A Aurora das Memórias',
    track: 'aurora',
    fade: [255, 244, 222],
    shots: [
      {
        layers: [L('mascara', 1.0, 1.06, -8), L('mascara-luz', 1.0, 1.08, -12, 0, true)],
        fx: ['motes', 'rays'],
        lines: ['Ele tirou a máscara e largou a foice no chão do terraço.', 'Pela primeira vez, o rosto dele não se escondia da verdade.'],
      },
      {
        layers: [L('vespera', 1.04, 1.0, 10), L('vespera-perto', 1.06, 1.0, 22)],
        fx: ['fall', 'rays'],
        lines: ['As memórias presas no núcleo desceram sobre Vespera, cada uma para o seu dono.', 'Os primeiros raios de luz atravessaram as ruínas.'],
      },
      {
        layers: [L('povo', 1.0, 1.05, -10)],
        fx: ['motes', 'dust'],
        lines: ['As pessoas voltaram a lembrar.', 'Algumas choraram. Outras se abraçaram. Outras descobriram verdades que doíam.'],
      },
      {
        layers: [L('destrocos', 1.05, 1.0, 12), L('destrocos-perto', 1.08, 1.0, 26)],
        fx: ['dust', 'rays'],
        lines: ['{Ela} não voltou. Ninguém o perdoou, e nada do que ele fez se desfez.', 'Ele desceu para ajudar quem ainda vivia entre os destroços.'],
      },
      {
        layers: [L('flor', 1.0, 1.07, 0, -6)],
        fx: ['motes', 'dust'],
        lines: ['No Arquivo, onde {ela} guardava flores entre as páginas, uma flor pequena nasceu entre as pedras.', 'Ele parou diante dela, lembrou {dela} e seguiu em frente.'],
      },
    ],
  },
  // Final II: ele aceita a própria corrupção
  absorb: {
    title: 'O Rei do Eclipse',
    track: 'rei',
    fade: [16, 8, 24],
    shots: [
      {
        layers: [L('paz', 1.0, 1.05, -6)],
        fx: ['motes'],
        tint: 0xb48cff,
        lines: ['As sombras se ajoelharam. As criaturas deixaram de atacar. As vozes desapareceram.', 'Por um instante, o reino pareceu finalmente em paz.'],
      },
      {
        layers: [L('ruas', 1.06, 1.0, 14), L('ruas-perto', 1.09, 1.0, 28)],
        fx: ['rise'],
        tint: 0xffc070,
        lines: ['Nas ruas, as pessoas ficaram paradas, sem lembrar o próprio nome.', 'Estavam vivas. O que cada uma era ficou em pedaços, nas mãos dele.'],
      },
      {
        layers: [L('trono', 1.0, 1.08, 0, 6)],
        fx: ['stars'],
        tint: 0xffd890,
        lines: [
          'Ele ocupou o trono da Casa Vhalor. A máscara se fundiu ao rosto, e a foice virou parte da sombra dele.',
          'Em volta dele, milhares de memórias brilhavam como estrelas presas numa noite sem fim.',
        ],
      },
      {
        layers: [L('rosto', 1.0, 1.05, 0, -4)],
        fx: ['crack'],
        lines: ['A última lembrança {dela} voltou. Desta vez, ele viu o rosto dela com clareza.', 'E entortou a lembrança mesmo assim, para não carregar o peso inteiro.'],
      },
      {
        layers: [L('eclipse', 1.08, 1.0, 0, 10)],
        fx: ['dark'],
        voices: ['Tudo foi necessário.', 'Eles sabiam demais.', 'Ela ia destruir o reino.', 'Você só cumpriu a ordem.'],
        lines: ['No trono, cercado de vozes que repetem as justificativas dele, ele vê um novo Eclipse cobrir Vespera.'],
      },
    ],
    last: 'Se ninguém se lembrar da dor, ninguém poderá me condenar.',
  },
  // Final III: o sacrifício do carrasco (com sobriedade: sem detalhe, sem glória; o que fica são as pessoas)
  fragments: {
    title: 'O Último Silêncio',
    track: 'silencio',
    fade: [0, 0, 0],
    shots: [
      {
        layers: [L('vozes', 1.0, 1.06), L('vozes-luz', 1.02, 1.1, 0, 0, true)],
        fx: ['motes'],
        voices: ['Trezentos e doze.', 'Você não lia as ordens.', 'Ela chamou. Você não se virou.'],
        lines: [
          'As vozes cresceram. Ele viu as pessoas que executou e os lugares que destruiu.',
          'E viu {ela} como ela era, sem nenhuma versão.',
          'Pediu perdão, sabendo que não podia exigir o perdão dela.',
        ],
      },
      {
        layers: [L('cacos', 1.04, 1.0, 0, 4)],
        fx: ['dust'],
        lines: [
          'Para cortar o fio entre o núcleo e o mundo, quem carregasse os fragmentos não voltaria. Ele sabia.',
          'Não era absolvição. Ele continuava responsável por tudo o que fez.',
          'A máscara se partiu. O núcleo se apagou. As vozes pararam, uma a uma.',
        ],
      },
      {
        layers: [L('ceu', 1.0, 1.05, -8), L('ceu-perto', 1.0, 1.08, -18)],
        fx: ['rays', 'fall'],
        tint: 0xffecc8,
        rayFrom: [812, 128],
        lines: [
          'Pela primeira vez desde o Primeiro Eclipse, o céu de Vespera começou a clarear.',
          'As memórias voltaram para os seus donos. As ruínas continuaram lá, e a verdade também.',
        ],
      },
      {
        layers: [L('campo', 1.0, 1.06, 6), L('campo-perto', 1.0, 1.1, 14)],
        fx: ['petals', 'motes'],
        lines: [
          'Num último fragmento de memória, {ela} aparece num campo tranquilo, olhando para ele.',
          'Não se sabe se é uma lembrança, se é ela mesma, ou só o último desejo de quem enfim entendeu o próprio passado.',
        ],
      },
    ],
    last: 'Que o mundo se lembre. Que o mundo continue.',
  },
};

// os quadros de cada atlas, na ordem em que art2/finais.py pinta (duas colunas de 1280x720)
export const FILM_FRAMES: Record<EndingId, string[]> = {
  truth: FILMS.truth.shots.flatMap((s) => s.layers.map((l) => l.frame)),
  absorb: FILMS.absorb.shots.flatMap((s) => s.layers.map((l) => l.frame)),
  fragments: FILMS.fragments.shots.flatMap((s) => s.layers.map((l) => l.frame)),
};
export const FILM_CELL = { w: 1280, h: 720, cols: 2 };

// O que se fala no terraço, depois da escolha (world/Finale.ts). say: o Carrasco Coroado; think: ele
export const FINALE_LINES = {
  truth: {
    say: 'Sem a coroa, você vai lembrar de tudo. Aceitar a culpa é aceitar que você não merece continuar.',
    think: ['Eu matei aquela gente. Não foi a corrupção, nem o reino. Fui eu.', 'E é por isso que eu continuo.'],
    mechanism: 'A conta na margem da planta: {ela} deixou um jeito de abrir o núcleo sem perder ninguém. Os fragmentos que eu juntei servem para isso.',
  },
  absorb: {
    say: 'Tudo foi necessário. Ponha a coroa, e nada mais vai doer.',
    think: ['Se eu guardar todas as lembranças, ninguém mais vai sofrer com elas.'],
  },
  fragments: {
    say: 'Aceitar a culpa é aceitar que você não merece continuar.',
    think: [
      'Não é por isso.',
      'A conta {dela}, na margem da planta: alguém que carregasse os fragmentos podia cortar o fio que liga o núcleo ao mundo.',
      'O núcleo é feito de gente. Quebrado, ele espalharia o pior de cada um pelo reino. Inteiro, ele nunca para.',
      'Tem que ser eu. Ninguém mais carrega a máscara.',
    ],
  },
} as const;

// A memória da noite (nucleo:boss), a que só volta no fim: inteira nos finais I e III, torta no II
export const NIGHT_MEMORY = {
  title: 'A noite',
  truth:
    'A noite da Coroação. {Ela} sobe a escada com as cópias no peito: descobriu como parar o ritual e quer chegar ao núcleo antes de a Casa ligá-lo. A ordem no meu bolso tem o nome dela. Eu a alcanço no terraço e ataco, achando que salvo o reino. Quando entendo o que fiz, é tarde: o ritual desaba sobre nós dois e parte o que lembrávamos.',
  absorb:
    'A noite da Coroação. {Ela} sobe a escada para destruir o núcleo, e o reino junto. Ela me traiu; todos eles ameaçavam o reino. Eu faço o que precisava ser feito. A lâmina, a mão dela tentando me alcançar, o meu rosto na máscara. A lembrança entorta antes que eu entenda o porquê.',
} as const;

// os créditos: o jogo é do Enio; depois, quem estava em Vespera (o nome dela segue o que ele lembra)
export function credits(named: boolean): { head?: string; big?: boolean; lines: string[]; last?: boolean }[] {
  const n = names(named);
  return [
    { head: 'Eclipse of the Forgotten', big: true, lines: ['Um jogo de Enio Josias'] },
    { head: 'Ideia, história e direção', lines: ['Enio Josias'] },
    { head: 'Desenvolvimento, arte e trilha sintetizada', lines: ['Feito com Claude, junto com o Enio'] },
    { head: 'Trilhas escolhidas pelo Enio', lines: ['The Unexplored Abyss', 'Deep Echoes'] },
    { head: 'Motor', lines: ['Phaser'] },
    {
      head: 'Em Vespera',
      lines: [
        'o último carrasco do rei',
        n.Ela,
        'a irmã Luzia',
        'Brás, o ferreiro',
        'Tomé',
        'o mineiro que ficou',
        'o Agrimensor',
        'o Cobrador',
        'o Sineiro',
        'o Arcebispo do Dízimo',
        'a Carcereira',
        'o Capataz de Âmbar',
        'o Mestre da Caça',
        'o Barqueiro',
        'o Senhor de Vhalor',
        'e todos os que esqueceram',
      ],
    },
    { lines: ['Obrigado por jogar.'], last: true },
  ];
}

// Vespera depois do fim, na volta dos créditos (o III não volta): o que aparece embaixo do nome do lugar e o que
// ele pensa. O que muda nas salas fica em GameScene (afterEndRoom) e no cenário de cada uma
export const AFTER_END = {
  truth: {
    banner: 'A primeira manhã',
    think: ['Não chove. Pela primeira vez, a ponte está seca.', 'A máscara ficou no terraço. Tem gente lá embaixo que ainda precisa de ajuda.'],
  },
  absorb: {
    banner: 'O rei',
    think: ['O trono é meu. Ninguém mais lembra de nada que doa.', 'Ninguém lembra de nada.'],
  },
} as const;

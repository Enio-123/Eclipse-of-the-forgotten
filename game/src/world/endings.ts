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

// o número de cada final: no cartão do fim do filme e no menu do título, junto do nome
export const NUMERAL: Record<EndingId, string> = { truth: 'Final I', absorb: 'Final II', fragments: 'Final III' };

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
// ele pensa. O que muda nas salas fica em GameScene (Vespera depois do fim) e no cenário de cada uma
export const AFTER_END = {
  truth: {
    banner: 'A primeira manhã',
    think: ['Não chove. Pela primeira vez, a ponte está seca.', 'A máscara e a foice ficaram no terraço. Tem gente lá embaixo que ainda precisa de ajuda.'],
    // sem nenhuma arma de chefe ele pegou a foice de volta (não dá para ajudar ninguém de mãos vazias)
    held: 'A máscara ficou no terraço. A foice eu peguei de volta: tem gente lá embaixo que ainda precisa de ajuda.',
  },
  absorb: {
    banner: 'O rei',
    think: ['O trono é meu. Ninguém mais lembra de nada que doa.', 'Ninguém lembra de nada.'],
  },
} as const;

// O que o povo diz depois do fim. No I cada um lembra o que tinha pago: na primeira conversa depois do fim vem
// tudo, depois uma fala por vez. Os esquecidos que falavam ganham o nome de volta (a sala e a ordem deles nela),
// e quem voltou para a rua diz uma coisa só. No II ninguém lembra nem o próprio nome: a conversa é o silêncio e o
// que ele pensa ({P}: Ela ou Ele). Só a irmã Luzia fala, porque nasceu cega e o eclipse não tem o que levar
// dela; o Brás não sabe quem é, mas as mãos dele ainda lembram o ferro, e o Agrimensor ainda tem as medidas
export const AFTER_TALK = {
  truth: {
    nun: [
      'Passos de ferro, mas a voz vem sem nada na frente. Você tirou a máscara.',
      'Os sinos tocaram sozinhos hoje cedo. A cidade inteira lembrou de uma vez. Tem gente chorando na praça, e tem gente rindo.',
      'Aquele casamento em que eu cantei era o seu, sim. Agora você também lembra.',
    ],
    smith: [
      'Então tem um rosto aí embaixo. Eu já estava achando que a máscara era você.',
      'Tirei a minha também. Colei com ouro por anos e nunca perguntei o que ela tapava.',
    ],
    prisoner: [
      'Agora eu lembro como foi aquele dia. As duas coisas: você desceu a foice, e depois cortou a minha corda.',
      'Não vou dizer que está tudo bem. Mas eu estou aqui por causa da segunda.',
    ],
    miner: [
      'Lembrei o meu nome. Otávio. Faz tanto tempo que ninguém chama que parece de outro.',
      'Vou subir. Lá em cima agora alguém vai lembrar de mim.',
    ],
    surveyor: [
      'As medidas fecharam. Pela primeira vez, o que eu desenhei é o que está lá.',
      'O Eclipse apagava um pouco de cada sala toda noite. Esta noite não apagou nada.',
    ],
    folk: {
      'praca:0': { name: 'Marta', lines: ['Marta. Eu me chamo Marta.', 'Eram os dois: uma filha e um cachorro. Ela se chama Lia e mora do outro lado da ponte. Hoje eu vou lá.'] },
      'praca:1': { name: 'Bento', lines: ['Bento. Fui eu que preguei as tábuas do cadafalso. Agora eu lembro de cada uma.', 'Amanhã eu desmonto, tábua por tábua, do jeito que montei.'] },
      'mercado:0': { name: 'Iara', lines: ['Davi. O meu irmão se chama Davi. A lembrança do mar era dele também: a gente ia junto.', 'Voltou tudo, até o sal. Eu sou a Iara. Fazia tempo que eu não precisava dizer.'] },
      'rua:0': { name: 'Célia', lines: ['Lembrei o caminho de casa. São três ruas para lá, e eu passava na porta todo dia.', 'Me chamo Célia. Pode pisar nos incensários agora: apagaram.'] },
      'claustro:0': { name: 'Joana', lines: ['As irmãs voltaram a cantar. A irmã Luzia vem reger à tarde, de olhos fechados como sempre.', 'Eu sou a Joana. Era a voz mais baixa do coro. Ainda sou.'] },
    } as Record<string, { name: string; lines: string[] }>,
    // quem voltou para a rua
    crowd: [
      'Bom dia. Fazia tempo que eu não dizia isso para ninguém.',
      'Você viu a ponte? Está seca.',
      'Lembrei a cara da minha mãe. Fiquei parado aqui o tempo todo, só olhando para ela.',
      'Desculpe, eu estou chorando à toa. É que voltou tudo de uma vez.',
      'Vou abrir a loja de novo. Não sei se alguém ainda tem moeda.',
      'Meu pai morava naquela casa. Eu passava por ela todo dia e não sabia.',
    ],
  },
  absorb: {
    nun: [
      'Passos de ferro, e o ouro de uma coroa batendo. Eu sei quem é.',
      'A cidade esqueceu de novo, de uma vez só. O eclipse não tem o que levar de mim: eu continuo lembrando, por todos.',
      'Pode ir. Alguém tem que lembrar, e vai ser eu.',
    ],
    think: ['Não lembra o próprio nome. Ninguém aqui lembra.', '{P} olha para mim e não vê ninguém.', 'Estão em paz. Era o que eu queria.'],
    smith: 'Ele não sabe quem é. As mãos dele ainda lembram o ferro. Só as mãos.',
    miner: 'Ele olha para a pedra como quem espera que ela diga o nome dele.',
    surveyor: ['Quem é você? Tanto faz. A folha custa moedas.', 'O que tem medida não some. Eu não lembro de onde vim, mas sei quantos passos tem daqui até a parede.'],
  },
};

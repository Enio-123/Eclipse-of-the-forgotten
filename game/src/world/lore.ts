import type { Upgrade } from '../systems/Save';
import type { Ability, RoomId } from './rooms';
import type { EchoKind, WaveMode } from '../gfx/memoryWave';

// Memórias espalhadas pelo mapa. O id é sala:ordem no mapa ("boss" é a do Sineiro).
export const MEMORIES: Record<string, { title: string; text: string }> = {
  'ponte:0': { title: 'A capa dividida', text: 'Uma risada na chuva. Alguém dividindo a capa comigo.' },
  'catacumbas:0': { title: 'Pão no forno', text: 'O cheiro de pão na vila. Minha mãe cantava errado de propósito.' },
  'sinos:0': { title: 'A primeira espada', text: 'A primeira vez que segurei uma espada. Pesava mais que eu.' },
  'sinos:1': { title: 'Um nome na areia', text: 'Um nome escrito na areia do rio. A água levou antes de eu ler.' },
  'cripta:boss': { title: 'O sino do casamento', text: 'O sino tocou no casamento. Eu estava lá. Eu esperava no altar.' },
  'nave:0': { title: 'As alianças', text: 'Duas alianças de ferro. A minha ainda está no dedo. A dela, não sei.' },
  'praca:freira': { title: 'A voz da irmã', text: 'Ela cantou no meu casamento. A noiva nunca chegou ao altar.' },
  'altar:boss': { title: 'O dízimo do casamento', text: 'O Arcebispo cobrou antes da cerimônia: a memória dela. Ela me esqueceu no caminho.' },
  'celas:0': { title: 'O capuz preto', text: 'Eu usava o capuz para não ver os rostos. Um dia vi um rosto mesmo assim, e parei.' },
  'mascara:boss': { title: 'A máscara de ferro', text: 'Ela fechou o ferro no meu rosto e leu a sentença. Não ouvi o crime. Só lembro das minhas mãos: numa versão, limpas. Na outra, não.' },
  'fosso:0': { title: 'Os nomes no bolso', text: 'Me davam o nome de cada condenado num papel. Eu nunca lia. Guardava no bolso, e o bolso foi ficando pesado.' },
  'abismo:boss': { title: 'O machado', text: 'Ergui o machado sobre alguém ajoelhado no tablado. Numa versão, ele desceu. Na outra, caiu da minha mão, e a praça inteira ficou em silêncio.' },
  'espelhos:boss': { title: 'O reflexo', text: 'No Âmbar polido eu me vi de capuz, com a foice na mão. Atrás de mim, alguém de capa vermelha chamava. Numa versão eu me virei para ver. Na outra, segui em frente.' },
  'capataz:boss': { title: 'A fuga pelo túnel', text: 'Uma moça de capa vermelha correndo pelos túneis, com um caderno apertado no peito. Numa versão eu corria atrás dela com a ordem na mão. Na outra, eu segurava a grade para ela passar.' },
  'lago:0': { title: 'O lago congelado', text: 'Ela riu tanto quando eu escorreguei no gelo que caiu também. Ficamos deitados no lago, olhando o céu branco, sem frio nenhum.' },
  // NAME_MEMORY: a primeira vez que o nome dela aparece no jogo
  'cabana:0': { title: 'O nome dela', text: 'Arielle. O nome volta inteiro, com a voz dela dizendo, rindo do nó torto da minha capa. Arielle.' },
  'clareira:boss': { title: 'A trilha na neve', text: 'As pegadas dela na neve e as minhas atrás. Numa versão eu mandei a matilha para o vale e fiquei olhando ela subir a serra. Na outra, eu mostrei o caminho aos cães.' },
};
export const MEMORY_TOTAL = Object.keys(MEMORIES).length;

// O eco de cada memória (High e EXTREME): quem aparece em luz no chão e se a lembrança volta inteira
// (dourada) ou com duas versões (roxa, corrompida). Ver lore/continuidade.md.
export const MEMORY_ECHO: Record<string, { kind: EchoKind; mode: WaveMode }> = {
  'ponte:0': { kind: 'ela', mode: 'restore' },
  'catacumbas:0': { kind: 'povo', mode: 'restore' },
  'sinos:0': { kind: 'povo', mode: 'restore' },
  'sinos:1': { kind: 'ela', mode: 'restore' },
  'cripta:boss': { kind: 'ela', mode: 'restore' },
  'nave:0': { kind: 'ela', mode: 'restore' },
  'altar:boss': { kind: 'ela', mode: 'corrupt' },
  'celas:0': { kind: 'povo', mode: 'restore' },
  'mascara:boss': { kind: 'carrasco', mode: 'corrupt' },
  'fosso:0': { kind: 'povo', mode: 'restore' },
  'abismo:boss': { kind: 'carrasco', mode: 'corrupt' },
  'espelhos:boss': { kind: 'carrasco', mode: 'corrupt' },
  'capataz:boss': { kind: 'ela', mode: 'corrupt' },
  'lago:0': { kind: 'ela', mode: 'restore' },
  'cabana:0': { kind: 'ela', mode: 'restore' },
  'clareira:boss': { kind: 'ela', mode: 'corrupt' },
};

// as provas que cada registro carrega (lore/continuidade.md, 6.1)
export type Proof = 'vhalor' | 'inocentes' | 'ambar' | 'nucleo' | 'arielle';

// Registros: documentos, livros e fichas espalhados pelas salas (sala:ordem no mapa). Ficam no Diário,
// aba Registros. Por enquanto nas Minas e na Floresta; as outras regiões entram com a integração da lore.
// named: como o registro fica depois que ele lembra o nome dela (ver NAME_MEMORY)
export interface RecordInfo {
  title: string;
  region: string;
  lines: string[];
  proofs: Proof[];
  named?: { title?: string; lines: string[] };
}
export const RECORDS: Record<string, RecordInfo> = {
  // Galeria dos Nichos (v18): os nomes raspados das catacumbas
  'nichos:0': {
    title: 'As lápides raspadas',
    region: 'Catacumbas de Vespera',
    lines: [
      'Cada nicho tinha uma lápide com o nome de quem dorme ali. Todas foram raspadas com o mesmo cinzel, no mesmo sentido, como se fosse trabalho de um dia só.',
      'Nesta o cinzel escorregou no fim. Sobrou a data: o mês do Dízimo grande, no ano antes do eclipse.',
    ],
    proofs: ['inocentes'],
  },
  'nichos:1': {
    title: 'O livro do coveiro',
    region: 'Catacumbas de Vespera',
    lines: [
      'Enterrados por ordem da catedral, sem nome, a pedido da Casa Vhalor: duzentos e doze. Ninguém veio reclamar. Ninguém lembrava deles para vir.',
      'Hoje desceram mais três, do cadafalso da praça. O carrasco carregou os corpos ele mesmo, um de cada vez, e ficou parado na frente dos nichos. Não pediu que eu raspasse os nomes. Raspei porque mandaram.',
    ],
    proofs: ['inocentes', 'vhalor'],
  },
  // Mercado do Dízimo (v18): a propaganda da Casa e a conta do que a cidade pagava
  'mercado:0': {
    title: 'O édito da Casa Vhalor',
    region: 'Cidade-Catedral',
    lines: [
      'POR ORDEM DA CASA VHALOR, GUARDIÃ DE VESPERA: a dor não é herança. Quem entrega ao Dízimo a lembrança que pesa dorme em paz. A catedral pesa, conta e guarda. Ninguém perde o que entrega: ganha descanso.',
      'Embaixo, riscado a carvão, numa letra torta: "Descanso de quê? Não lembro mais do que eu estava cansado."',
    ],
    proofs: ['vhalor'],
  },
  'mercado:1': {
    title: 'A tabela do Dízimo',
    region: 'Cidade-Catedral',
    lines: [
      'Afixada por ordem da Casa: um ano de infância paga a lenha do inverno. Um rosto querido paga o perdão de uma dívida. Um nome inteiro dispensa a família do Dízimo por três colheitas.',
      'Na margem, a letra apertada do contador: "A Casa mandou parar de anotar de quem é cada lembrança. Só o peso. Disseram que nome atrapalha a conta. A balança do mercado não desce mais: calçaram o prato."',
    ],
    proofs: ['vhalor'],
  },
  'solitarias:0': {
    title: 'O livro das sentenças',
    region: 'Prisão Subterrânea',
    lines: [
      'Aberto na mesa do carcereiro, a pena ainda atravessada na página. Cada linha é um número, uma data e uma pena: trinta dias de silêncio, noventa dias de silêncio, silêncio até a Casa mandar buscar.',
      'Na coluna do crime, a mesma letra repetida em quase todas as linhas: "lembrou em voz alta". Embaixo do último número, sem data de saída, alguém escreveu com outra tinta: "este não devia nada. Entrou no lugar do irmão."',
    ],
    proofs: ['inocentes', 'vhalor'],
  },
  'solitarias:1': {
    title: 'As marcas da parede',
    region: 'Prisão Subterrânea',
    lines: [
      'Riscos de unha na pedra, de quatro em quatro, contando os dias. Passam de trezentos e param no meio de um grupo, como se a mão tivesse largado ali.',
      'Mais embaixo, fundo na pedra: "enquanto eu contar, eu lembro de quando começou". Depois, um nome que a unha começou e não terminou de riscar, e a mesma mão apagando por cima.',
    ],
    proofs: ['inocentes'],
  },
  'boca:0': {
    title: 'O livro da entrada',
    region: 'Minas Abandonadas',
    lines: [
      'Turno da noite. Desceram vinte e dois. Subiram dezenove.',
      'Os três que ficaram embaixo não fazem falta: ninguém lembra deles para perguntar.',
    ],
    proofs: ['inocentes', 'ambar'],
  },
  'prensas:0': {
    title: 'A ordem da Casa para as prensas',
    region: 'Minas Abandonadas',
    lines: [
      'O veio está secando. A partir desta lua, cada trabalhador senta na prensa ao fim do turno.',
      'A Casa não quer mais o Âmbar da pedra. Quer o da cabeça, que vem mais limpo.',
      'Com o selo da Casa Vhalor.',
    ],
    proofs: ['vhalor', 'ambar'],
  },
  'veio:0': {
    title: 'O livro do Capataz',
    region: 'Minas Abandonadas',
    lines: [
      'Pagamento do mês: duas lembranças a menos por cabeça, em vez de moedas.',
      'Ninguém reclamou. Quem reclamaria de uma coisa que não lembra de ter tido?',
    ],
    proofs: ['ambar', 'inocentes'],
  },
  'veio:1': {
    title: 'A ficha de A.',
    region: 'Minas Abandonadas',
    lines: [
      'Ficha de visita. Motivo: inventário dos registros da mina. Uma flor seca prensada entre as folhas.',
      'Anotei o nome de cada um que ficou aqui embaixo, para que alguém lembre deles.',
      'O Âmbar não nasce sozinho na pedra: alguém espreme das pessoas. Vou mostrar isso a ele. Ele ainda pode escolher. A.',
    ],
    proofs: ['ambar', 'arielle'],
  },
  'capataz:0': {
    title: 'A última página do Capataz',
    region: 'Minas Abandonadas',
    lines: [
      'Mandaram aumentar as prensas. Eu mesmo sentei na última, para mostrar aos homens que não doía.',
      'Não lembro se doeu. Não lembro do meu nome. Lembro do apito do turno.',
    ],
    proofs: ['ambar', 'vhalor'],
  },
  'pinhal:0': {
    title: 'O bilhete na casca',
    region: 'Floresta Nevada',
    lines: [
      'Um papel dobrado, preso na casca com uma fita vermelha. Outras fitas iguais seguem pelos troncos, mata adentro.',
      '"Se a neve apagar a trilha, siga as fitas: elas levam à casa da minha avó. Os cães da Casa não passam do lago. A."',
    ],
    proofs: ['arielle'],
  },
  'cabana:0': {
    title: 'O herbário',
    region: 'Floresta Nevada',
    lines: [
      'Um caderno grosso de capa de couro, cheio de flores prensadas. Embaixo de cada uma, o lugar e o dia, numa letra miúda.',
      'Na capa, um nome bordado em linha vermelha. Ele lê letra por letra, e quando junta as letras a palavra escorrega, como um nome na areia que a água leva.',
    ],
    named: {
      lines: [
        'Um caderno grosso de capa de couro, cheio de flores prensadas. Embaixo de cada uma, o lugar e o dia, numa letra miúda.',
        'Na capa, bordado em linha vermelha: Arielle. A última página guarda uma flor da serra e uma frase: "para lembrar o caminho de volta".',
      ],
    },
    proofs: ['arielle'],
  },
  'cabana:1': {
    title: 'A carta que ficou',
    region: 'Floresta Nevada',
    lines: [
      'Uma carta sem envelope, debaixo da lamparina da mesa. A data é de três dias depois do casamento que não houve.',
      '"Se te disserem que o Arcebispo cobrou a minha memória e que eu te esqueci no caminho do altar, não acredite. Eu lembro de você inteiro, até do nó torto da capa."',
      '"Não cheguei ao altar porque naquela manhã descobri para onde a Casa leva o Âmbar das prensas. Não dava para esperar. Volte pela serra, que eu explico tudo. A."',
    ],
    proofs: ['arielle', 'ambar'],
  },
  'clareira:0': {
    title: 'O livro da caça',
    region: 'Floresta Nevada',
    lines: [
      'Fugitivos trazidos de volta nesta estação: um arquivista, duas testemunhas do tablado, um copista e a filha dele. Entregues ao carrasco no fim da trilha.',
      'Última caçada: o carrasco mandou a matilha para o vale. A trilha era falsa. A arquivista passou a serra.',
      'Avisar a Casa Vhalor: ele não serve para caçar.',
    ],
    proofs: ['vhalor', 'inocentes'],
  },
};
export const RECORD_IDS = Object.keys(RECORDS);

export function recordInfo(id: string, knowsName: boolean) {
  const r = RECORDS[id];
  return knowsName && r.named ? { ...r, title: r.named.title ?? r.title, lines: r.named.lines } : r;
}

// o mineiro que ficou (Veio de Âmbar, no alojamento): esqueceu o próprio nome na mina
// O Agrimensor: mede o que o Eclipse apaga (o que tem medida não some tão fácil), anda sempre uma
// região na frente e vende as folhas do mapa
export const SURVEYOR = {
  name: 'O Agrimensor',
  first: [
    'Pare aí. Três passos para trás. Você está em cima da minha linha.',
    'Sou o Agrimensor. Meço o que o Eclipse apaga: o que tem medida não some tão fácil.',
    'Capuz vermelho... Faz tempo que eu não anoto um desses. Pensei que a ordem tinha acabado.',
    'Desenho cada região, sala por sala. A folha custa moedas: papel e tinta não caem do céu.',
    'Com a folha, o que você pisar fica a tinta e o resto a lápis. Eu vou na frente. Você me acha mais adiante.',
  ],
  // quando ele abre a banca de novo
  again: [
    'Cheguei antes de você, como sempre. Quem mede anda devagar, mas não se perde.',
    'Quarenta e dois passos daqui até a parede. Contei duas vezes.',
    'Não encoste na groma. O prumo leva meia hora para parar.',
    'O que você não pisou fica a lápis. Lápis apaga; tinta não.',
    'Já mediu alguma coisa na vida? Não? Então compre a folha.',
  ],
  broke: 'Moeda curta. Volte com mais; eu não saio daqui até fechar a conta desta região.',
  bought: 'Tinta fresca. Não dobre no meio.',
  done: 'Você já tem todas as folhas que eu fiz até aqui. Mais adiante eu sigo medindo.',
};

export const OLD_MINER = {
  name: 'O mineiro que ficou',
  first: [
    'Uma luz descendo... Faz tempo que ninguém desce sem ser carregado.',
    'Eu cavava aqui. Ou carregava. Uma das duas. O Âmbar bebe devagar: primeiro o nome, depois o caminho de volta.',
    'Fiquei porque lá em cima ninguém ia lembrar de mim. Aqui pelo menos a pedra lembra.',
    'Mais para baixo, depois da câmara dos espelhos, o Capataz ainda toca as prensas. Ele não para nem para morrer.',
  ],
  // o Remendo: ele reconhece o ouro nas rachaduras da máscara
  mend: [
    'Essa máscara... rachada e colada com ouro. Minha mulher remendava as tigelas assim. Dizia que a rachadura também conta a história.',
    'Quando doer, ajoelha e deixa o ouro escorrer até a ferida. Gasta o Âmbar que você juntou, mas fecha.',
  ],
  after: [
    'Uma moça de capa vermelha passou por aqui antes do céu escurecer. Anotava os nossos nomes num caderno. Disse que alguém precisava lembrar.',
    'Siga os cristais. Eles crescem onde alguém lembrou de alguma coisa com muita força.',
    'O Capataz guarda a picareta grande. Com ela o Âmbar cede.',
    'Não olhe muito para as paredes da câmara. Quem olha demais fica lá dentro, andando atrás de si mesmo.',
  ],
  done: [
    'O apito parou. Faz tanto silêncio que eu quase lembro do meu nome.',
    'Leve a picareta. Aqui embaixo ela já quebrou gente demais.',
  ],
};

// Páginas do diário da irmã Luzia (sala:ordem no mapa). Ela é cega: a letra é torta.
export const PAGES: Record<string, { title: string; text: string }> = {
  'ponte:0': { title: 'A ponte de Vespera', text: 'Antes do eclipse a ponte tinha mercado. Vendiam peixe, fitas e promessas. Hoje só a chuva atravessa.' },
  'catacumbas:0': { title: 'Os que dormem', text: 'Quem paga todas as memórias desce para as catacumbas. Não morre. Só deita e esquece de levantar.' },
  'sinos:0': { title: 'O Sineiro', text: 'Ele tocava o sino a cada memória paga. Tocou tanto que esqueceu o próprio nome. Agora só sabe tocar.' },
  'escadaria:0': { title: 'A subida', text: 'Os penitentes sobem de joelhos para a cidade e descem sem nada. A pedra guarda a forma dos joelhos deles.' },
  'praca:0': { title: 'O cadafalso', text: 'Penduram ali quem lembra demais. A vela de cima nunca apaga: o Arcebispo diz que é para ninguém esquecer de ter medo.' },
  'rua:0': { title: 'O dízimo', text: 'Um décimo de tudo: do pão, do sono, do nome. Quem não paga desce para a prisão, embaixo da cidade.' },
  'telhados:0': { title: 'O sino da torre', text: 'O sino da torre chamava as irmãs para cantar. Depois do eclipse ninguém subiu mais para tocá-lo.' },
  'nave:0': { title: 'O Arcebispo', text: 'Ele não era mau. Era só contador. Um dia achou que dava para cobrar o tempo também, e o céu escureceu.' },
  'claustro:0': { title: 'As irmãs', text: 'Éramos doze no claustro. Onze esqueceram a oração e depois o caminho. Eu fiquei, porque nunca vi o eclipse.' },
  'galeria:0': { title: 'Os vitrais', text: 'Cada vitral tem o rosto de alguém que pagou tudo. A luz ainda passa por eles. Eles não sabem.' },
  'poco:0': { title: 'O poço', text: 'Embaixo do cadafalso há um poço. Quem lembra demais desce por ele, e ninguém conta mais deles. Eu conto.' },
  'celas:0': { title: 'As celas', text: 'Cada porta tem um número riscado. Lá embaixo não se usa nome: o nome é a primeira coisa que o Dízimo leva.' },
  'correntes:0': { title: 'A sala das correntes', text: 'Penduravam a sentença em ferro, na sala grande, para o condenado ler toda manhã. Quem não sabia ler, ouvia.' },
  'guarita:0': { title: 'A Carcereira', text: 'Ela não dorme. Guarda as chaves de todos e a máscara de cada um. Dizem que foi ela quem forjou a primeira.' },
};
export const PAGE_IDS = Object.keys(PAGES);

// os três sinos que a irmã Luzia pede para tocar
export const BELLS = ['bell:telhados:0', 'bell:claustro:0', 'bell:nave:0'];

// a memória que devolve o nome dela: antes dela (ou se ele trocar essa memória com o Cobrador), os
// textos não dizem o nome, só "ela", "a moça de capa vermelha" ou "A."
export const NAME_MEMORY = 'cabana:0';

export interface RelicInfo {
  name: string;
  text: string;
  how: string;
  // como fica depois que ele lembra o nome dela
  named?: { name: string; text: string };
}

export const RELICS: Record<Ability, RelicInfo> = {
  dash: {
    name: 'Esporas do Carrasco',
    text: 'Presas nas botas de um carrasco que dorme no ossuário. O ferro lembra do galope antes de você.',
    how: '{dash} dash · também funciona no ar. Agachado, {dash} desliza',
  },
  wall: {
    name: 'Garras de Ferro',
    text: 'Garras de um sineiro antigo. Seguram em qualquer pedra.',
    how: 'Encostado na parede, no ar, {jump} pula para o outro lado',
  },
  double: {
    name: 'Pena do Eclipse',
    text: 'Uma pena que não cai. Pesa menos que o ar.',
    how: 'No ar, {jump} de novo para o pulo duplo',
  },
  hook: {
    name: 'Gancho de Corrente',
    text: 'A corrente de um carcereiro, com um gancho na ponta. Morde o ferro e não solta.',
    how: '{hook} lança o gancho na argola mais perto e puxa você até ela',
  },
  veil: {
    name: 'Véu Abissal',
    text: 'Um pedaço da sombra dele. Pesa como um pano molhado e passa por onde a pedra não deixa.',
    how: 'O {dash} vira tinta: atravessa golpes, grades de cela e membranas abissais',
  },
  cape: {
    name: 'Retalho Vermelho',
    text: 'Um pedaço de capa vermelha, pendurado num prego da porta. O nó ainda está feito, do jeito que ela amarrava.',
    how: 'No ar, segure {jump} para planar. Nas correntes de ar que sobem, o retalho abre e leva você para cima',
    named: {
      name: 'A Capa de Arielle',
      text: 'O retalho da capa de Arielle. Ela amarrava no pescoço dele quando ventava na serra, e ria do nó torto.',
    },
  },
};

export function relicInfo(a: Ability, knowsName: boolean) {
  const r = RELICS[a];
  return knowsName && r.named ? { ...r, ...r.named } : r;
}

// O que o Cobrador aceita: memórias (que o cavaleiro esquece) ou moedas. Cada item ocupa
// espaços no inventário (slots) e só vale enquanto estiver equipado. Os presentes ('gift') não
// estão à venda: alguém dá ao cavaleiro (missing diz onde procurar). Os achados ('found') estão
// pelo caminho, em baús, registros e no que os chefes deixam; os de uma região (region) só aparecem
// no inventário depois que ele pisa lá (a sala de entrada da região).
export const OFFERS: {
  id: Upgrade;
  name: string;
  text: string;
  cost: number;
  pay: 'memory' | 'coin' | 'gift' | 'found';
  slots: number;
  missing?: string;
  region?: RoomId;
}[] = [
  { id: 'breath', name: 'Fôlego', text: 'O dash recarrega quase na metade do tempo.', cost: 1, pay: 'memory', slots: 1 },
  { id: 'mask', name: 'Máscara remendada', text: 'Mais um fragmento de vida.', cost: 2, pay: 'memory', slots: 1 },
  { id: 'blade', name: 'Fio do carrasco', text: 'Todos os golpes ficam 30% mais fortes.', cost: 2, pay: 'memory', slots: 2 },
  { id: 'purse', name: 'Bolsa do dízimo', text: 'Os inimigos deixam mais moedas e o dobro de lascas de vida.', cost: 30, pay: 'coin', slots: 1 },
  { id: 'shard', name: 'Lasca de porcelana', text: 'Mais um fragmento de vida.', cost: 50, pay: 'coin', slots: 1 },
  { id: 'whetstone', name: 'Pedra de amolar', text: 'Todos os golpes ficam 15% mais fortes.', cost: 70, pay: 'coin', slots: 1 },
  {
    id: 'beads', name: 'Contas da Irmã', text: 'Paredes falsas e vitrais rachados brilham de leve, e os esconderijos aparecem no mapa.',
    cost: 0, pay: 'gift', slots: 1, missing: 'Ainda não tem. Alguém na cidade guarda.',
  },
  // as Minas Abandonadas
  {
    id: 'flower', name: 'Flor prensada', text: 'Com 1 de vida, o cheiro da flor traz uma lembrança boa e fecha uma rachadura. Volta a valer depois de um descanso.',
    cost: 0, pay: 'found', slots: 1, region: 'boca', missing: 'Ainda não tem. Alguém guardou uma flor entre as folhas de uma ficha.',
  },
  {
    id: 'helmet', name: 'Capacete de mineiro', text: 'As pedras que caem do teto e as vigas baixas batem no capacete e não machucam.',
    cost: 0, pay: 'found', slots: 1, region: 'boca', missing: 'Ainda não tem. Ficou num baú, logo na entrada da mina.',
  },
  {
    id: 'rawamber', name: 'Âmbar bruto', text: 'Cada golpe que entra junta metade a mais de Âmbar nas contas.',
    cost: 0, pay: 'found', slots: 1, region: 'boca', missing: 'Ainda não tem. Um baú na Casa das Prensas guarda.',
  },
  {
    id: 'watch', name: 'Relógio do turno', text: 'A Lembrança segura o mundo um segundo a mais, e o Eco fica dois segundos a mais.',
    cost: 0, pay: 'found', slots: 1, region: 'boca', missing: 'Ainda não tem. Um baú no Veio de Âmbar guarda.',
  },
  {
    id: 'whistle', name: 'Apito do Capataz', text: 'Aparar um golpe apita o fim do turno: o mundo para por meio segundo, sem gastar Âmbar.',
    cost: 0, pay: 'found', slots: 2, region: 'boca', missing: 'Ainda não tem. Está pendurado no pescoço de quem manda no turno.',
  },
  {
    id: 'mirror', name: 'Lasca do espelho', text: 'O Eco bate com a força inteira do cavaleiro.',
    cost: 0, pay: 'found', slots: 1, region: 'boca', missing: 'Ainda não tem. O espelho da Câmara de Âmbar pode soltar uma lasca.',
  },
];
// o que ele pensa quando pega cada achado (depois do aviso do item)
export const FOUND_THOUGHTS: Partial<Record<Upgrade, string>> = {
  flower: 'Uma flor seca, guardada com cuidado. Quem guarda uma flor numa ficha de inventário?',
  helmet: 'Amassado por dentro. Alguém levou uma pedra na cabeça e voltou para o turno.',
  rawamber: 'Morno na mão, como se ainda lembrasse de alguém.',
  watch: 'Parado na hora do fim do turno. Os ponteiros ainda tremem.',
  whistle: 'O apito que chamava o turno. Ninguém mais vai obedecer.',
  mirror: 'Na lasca, a minha imagem demora um instante para piscar.',
};
// espaços a mais no inventário, achados pelo caminho (o nome e o que diz o aviso)
export const SLOT_FINDS: Record<'bornal' | 'cinto', { name: string; text: string; thought: string; region: RoomId }> = {
  bornal: {
    name: 'Bornal de mineiro',
    text: 'Uma bolsa de lona presa no Âmbar. Mais um espaço no inventário.',
    thought: 'O Âmbar escorreu por cima do bornal e guardou tudo: um pedaço de pão de pedra e um toco de vela.',
    region: 'boca',
  },
  cinto: {
    name: 'Cinto de ferramentas',
    text: 'As argolas ainda seguram o que for preciso. Mais um espaço no inventário.',
    thought: 'Alguém tirou o cinto antes de sentar na prensa. Não voltou para buscar.',
    region: 'boca',
  },
};
// espaços do inventário (o Elo do Condenado dá mais um)
export const SLOTS = 3;

// ---------- gente da Cidade-Catedral ----------
// Irmã Luzia, a freira cega dos degraus da praça: dá o diário e pede para tocar os três sinos
export const NUN = {
  name: 'Irmã Luzia',
  first: [
    'Passos de ferro. Você não é daqui.',
    'Sou a irmã Luzia. Nasci cega, então o eclipse não teve o que levar de mim. Lembro de tudo.',
    'Leve este diário. Eu escrevia o que a cidade esquecia. As páginas se espalharam com o vento.',
    'E me faça um favor: toque os três sinos da cidade. O da torre, nos telhados, o do claustro e o da nave. Quero ouvir a cidade lembrar.',
  ],
  waiting: (left: number) =>
    left === 3
      ? 'Os três sinos ainda dormem. A torre fica nos telhados; o claustro e a nave, dentro da catedral.'
      : `Ouvi um. Faltam ${left === 1 ? 'um' : 'dois'}. Bata com força, o bronze é velho.`,
  reward: [
    'Eu ouvi. Os três. Por um instante a cidade inteira lembrou.',
    'Tome as minhas contas. Com elas a gente sente o que está escondido atrás das paredes.',
    'E isto também. Eu cantei num casamento, há muito tempo. Acho que era o seu.',
  ],
  after: [
    'O Arcebispo conta moedas no altar, lá no alto da galeria. Ele não erra a conta.',
    'Se precisar descansar, a vela do cadafalso nunca apaga.',
    'Embaixo da cidade tem uma prisão. Ouço correntes quando chove.',
  ],
};

// Brás, o ferreiro: melhora as armas em três níveis (moedas e, nos dois últimos, um material raro
// que os chefes deixam; o material não se gasta)
export const SMITH = {
  name: 'Brás, o ferreiro',
  first: [
    'Cuidado com a brasa.',
    'Sou o Brás. Conserto o que o dízimo quebra. Minha máscara rachou e eu colei com ouro. A sua também, pelo visto.',
    'Traga moedas que eu deixo a sua arma mais forte. Para o fim do serviço preciso de material que só os grandes carregam.',
  ],
  quotes: ['Ferro bom não esquece a forma.', 'O Sineiro tinha bronze no peito. O Arcebispo tem ouro no bolso.', 'Bate, esquenta, bate de novo. Igual lembrar.'],
  done: ['Pronto. Sente o peso certo agora?', 'Esse fio corta até lembrança.', 'Mais firme que no dia em que foi feita.'],
};

export const MATERIALS = {
  bronze: { name: 'Bronze do Sineiro', has: 'boss:sineiro', how: 'vença o Sineiro' },
  ouro: { name: 'Ouro do Dízimo', has: 'boss:arcebispo', how: 'vença o Arcebispo' },
} as const;

// custo de cada nível do ferreiro (o índice é o nível atual da arma)
export const FORGE: { coins: number; material?: keyof typeof MATERIALS }[] = [{ coins: 30 }, { coins: 60, material: 'bronze' }, { coins: 100, material: 'ouro' }];

// Bestiário do diário (aparece depois do primeiro derrotado de cada tipo)
export const BESTIARY: { kind: string; name: string; text: string; tip: string }[] = [
  {
    kind: 'crawler', name: 'Penitente rastejante',
    text: 'Pagou o próprio rosto e passou a usar o que a ordem deu. Rasteja pelos caminhos que ninguém usa mais.',
    tip: 'Machuca só de encostar. Pule por cima ou bata de longe.',
  },
  {
    kind: 'crow', name: 'Corvo do Dízimo',
    text: 'Ave da ordem. Vigia as catacumbas e mergulha em quem passa sem pagar.',
    tip: 'O olho acende antes do mergulho. Saia da linha e bata quando ele ficar preso no chão.',
  },
  {
    kind: 'guard', name: 'Guarda do Dízimo',
    text: 'Cobra o tributo com espada e escudo. O escudo para tudo o que vem pela frente.',
    tip: 'Agache no corte alto, pule o golpe de escudo, apare a espada ou derrube deslizando nas pernas.',
  },
  {
    kind: 'archer', name: 'Arqueiro da Sacada',
    text: 'Vigia os balcões da cidade. Atira em quem anda de cabeça erguida.',
    tip: 'A fenda da máscara acende antes do tiro. Golpeie a flecha na hora e ela volta para ele.',
  },
  {
    kind: 'censer', name: 'Penitente do Incensário',
    text: 'Leva o incenso das procissões. O cheiro faz a cidade esquecer o que viu.',
    tip: 'Ele ergue o incensário antes de bater. Apare quando descer; a fumaça no chão queima por um tempo.',
  },
  {
    kind: 'boss:sineiro', name: 'O Sineiro',
    text: 'Tocava o sino a cada memória paga, até esquecer o próprio nome. Guardava o último sino das catacumbas.',
    tip: 'Fuja da onda da pancada pulando e bata nas costas depois da investida.',
  },
  {
    kind: 'boss:arcebispo', name: 'O Arcebispo do Dízimo',
    text: 'Contava tudo o que a cidade pagava. Um dia quis cobrar o tempo, e o céu escureceu.',
    tip: 'O incensário dele também se apara. Quando o vitral cair, fuja dos fachos de luz.',
  },
  {
    kind: 'jailer', name: 'Carcereiro',
    text: 'Vigia as celas embaixo da cidade. Esqueceu por que prende, mas não esqueceu como.',
    tip: 'De longe a corrente vem na altura do peito: agache, deslize ou apare. De perto ele soca o chão: pule.',
  },
  {
    kind: 'miner', name: 'Mineiro esquecido',
    text: 'Cavou tanto tempo perto do Âmbar que a pedra cresceu nas costas dele. Ainda bate a picareta, mesmo sem lembrar por quê.',
    tip: 'Os olhos acendem antes do pulo. Saia de baixo e bata enquanto a picareta está presa no chão.',
  },
  {
    kind: 'ambat', name: 'Morcego de Âmbar',
    text: 'Dorme grudado no veio e acorda com luz. O Âmbar das costas acende inteiro antes do mergulho.',
    tip: 'Quando ele brilhar, saia da linha. Se ele bater na pedra, fica tonto no chão.',
  },
  {
    kind: 'boss:carcereira', name: 'A Carcereira',
    text: 'Guarda as chaves de todos e a máscara de cada um. Foi ela quem fechou o ferro no rosto dele.',
    tip: 'Agache na corrente alta, pule a varrida, apare a ponta do gancho e fuja das sombras das gaiolas.',
  },
  {
    kind: 'boss:sombra', name: 'A Sombra do Carrasco',
    text: 'Tudo o que ele não quis lembrar, numa tinta preta viva com a forma dele de antes: o capuz, o machado. Dormia como uma poça no fundo do abismo.',
    tip: 'Quando o chão borbulhar embaixo de você, saia: ela sobe dali. Pule a investida rente ao chão e apare o machado no fim da preparação.',
  },
  {
    kind: 'boss:reflexo', name: 'O Reflexo',
    text: 'O que o espelho de Âmbar guardou dele: repete o caminho, os pulos e os golpes, sempre um instante atrasado.',
    tip: 'Não fique onde o seu próprio golpe vai cair. Cada acerto trava a imagem; ande sabendo que ela vai passar por onde você passou.',
  },
  {
    kind: 'boss:capataz', name: 'O Capataz de Âmbar',
    text: 'Tocava as prensas da Casa Vhalor e ficou depois do último turno, picando o veio até o Âmbar crescer nele.',
    tip: 'Pule a fileira de cristais, rebata as lascas e deixe a investida bater na parede. Quando o apito tocar, saia da sombra da chapa.',
  },
  {
    kind: 'wolf', name: 'Lobo da Caça',
    text: 'Cão da Casa Vhalor. Congelou correndo atrás de alguém e continua correndo, mesmo sem cheiro para seguir.',
    tip: 'O uivo chama os outros. Pule por cima do salto e bata enquanto ele derrapa; no gelo ele escorrega bem mais longe.',
  },
  {
    kind: 'owl', name: 'Coruja de Geada',
    text: 'Dorme pousada nos galhos da caça. Acorda com passos embaixo e mergulha numa curva, soltando geada das penas.',
    tip: 'Quando ela se solta do galho, saia da curva e bata na volta. Se ela bater na pedra, cai tonta.',
  },
  {
    kind: 'boss:cacador', name: 'O Mestre da Caça',
    text: 'Caçador-mor da Casa Vhalor. Trazia os fugitivos de volta pela neve e entregava ao carrasco no fim da trilha. Congelou esperando uma presa que passou a serra.',
    tip: 'Agache na estocada alta, pule a baixa e saia de baixo do salto. Na nevasca, olhe a lanterna: ela pisca antes do golpe.',
  },
];

// alavancas da prisão: o que o cavaleiro pensa quando ela vira
export const LEVERS: Record<string, string> = {
  'lever:poco:0': 'A grade da escadaria subiu. Um caminho curto de volta para a cidade.',
  'lever:fuga:0': 'Lá em cima, um alçapão destrancou. O poço sobe até as celas.',
};

// Tomé, o preso do corredor das celas: pede as chaves e conta a versão dele daquele dia
export const PRISONER = {
  name: 'Tomé',
  first: [
    'Passos de ferro de novo. Não é carcereiro: carcereiro não para na frente da cela.',
    'Me chamo Tomé. Estou aqui desde antes do eclipse. Ou depois. Aqui embaixo o tempo não passa, só pesa.',
    'As chaves ficam na guarita, depois da sala das correntes. A parede de lá é de ferro liso; as garras não ajudam.',
    'Traz as chaves e eu te mostro a porta das máscaras. Ela só abre por dentro.',
  ],
  waiting: [
    'As chaves ficam na guarita. Sala das correntes, depois sobe.',
    'Lá em cima as argolas aguentam o peso de um homem. Eu vi carcereiro subir por elas.',
  ],
  freed: [
    'O barulho dessas chaves... faz tempo que ninguém gira essa fechadura para abrir.',
    'Eu te devo uma, então escuta: eu estava na fila do cadafalso naquele dia. Vi você lá em cima.',
    'Vi você cortar a corda de alguém. Ou vi você descer a foice? Já não sei. Aqui embaixo, cada um lembra de um jeito.',
    'Vou na frente. A porta das máscaras fica no fim da galeria, embaixo de nós. Abro por dentro e espero lá.',
  ],
  after: [
    'Abri a porta. Ela está lá dentro, na bigorna. Martela máscaras como quem reza.',
    'Se ela perguntar por mim, diga que eu morri. É quase verdade.',
  ],
};

// ondas da Arena dos Condenados (letras do mapa) e o prêmio no fim
export const ARENA_WAVES: string[][] = [['c', 'c', 'c'], ['g', 'W'], ['v', 'v', 'a', 'W'], ['W', 'i', 'W']];
export const ELO = {
  name: 'Elo do Condenado',
  text: 'Um elo de corrente partido. Mais um espaço no inventário.',
};

import type { Upgrade } from '../systems/Save';
import type { Ability } from './rooms';

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
};
export const MEMORY_TOTAL = Object.keys(MEMORIES).length;

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

export const RELICS: Record<Ability, { name: string; text: string; how: string }> = {
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
    how: 'O {dash} atravessa grades e golpes',
  },
};

// O que o Cobrador aceita: memórias (que o cavaleiro esquece) ou moedas. Cada item ocupa
// espaços no inventário (slots) e só vale enquanto estiver equipado. Os presentes ('gift') não
// estão à venda: alguém dá ao cavaleiro (missing diz onde procurar).
export const OFFERS: { id: Upgrade; name: string; text: string; cost: number; pay: 'memory' | 'coin' | 'gift'; slots: number; missing?: string }[] = [
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
];
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
    kind: 'boss:carcereira', name: 'A Carcereira',
    text: 'Guarda as chaves de todos e a máscara de cada um. Foi ela quem fechou o ferro no rosto dele.',
    tip: 'Agache na corrente alta, pule a varrida, apare a ponta do gancho e fuja das sombras das gaiolas.',
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

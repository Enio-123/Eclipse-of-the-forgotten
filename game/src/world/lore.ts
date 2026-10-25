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
// espaços do inventário
export const SLOTS = 3;

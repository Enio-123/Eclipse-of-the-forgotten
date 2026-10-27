import type { Upgrade } from '../systems/Save';
import type { Ability, RoomId } from './rooms';
import type { EchoKind, WaveMode } from '../gfx/memoryWave';

// Memórias espalhadas pelo mapa. O id é sala:ordem no mapa ("boss" é a do Sineiro).
// named: como a memória fica depois que ele lembra o nome dela (ver NAME_MEMORY)
export interface MemoryInfo {
  title: string;
  text: string;
  named?: { title?: string; text: string };
}
export const MEMORIES: Record<string, MemoryInfo> = {
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
  // A Margem da Tinta (v18): a calha onde ele lavava as mãos
  'margem:0': { title: 'A tinta nas mãos', text: 'Eu lavava as mãos nesta calha depois de cada cumprimento. Numa versão a tinta saía toda e eu subia limpo. Na outra, a tinta não saiu nunca, e eu assinei a ordem seguinte com a mão manchada.' },
  'abismo:boss': { title: 'O machado', text: 'Ergui o machado sobre alguém ajoelhado no tablado. Numa versão, ele desceu. Na outra, caiu da minha mão, e a praça inteira ficou em silêncio.' },
  'espelhos:boss': { title: 'O reflexo', text: 'No Âmbar polido eu me vi de capuz, com a foice na mão. Atrás de mim, alguém de capa vermelha chamava. Numa versão eu me virei para ver. Na outra, segui em frente.' },
  'capataz:boss': { title: 'A fuga pelo túnel', text: 'Uma moça de capa vermelha correndo pelos túneis, com um caderno apertado no peito. Numa versão eu corria atrás dela com a ordem na mão. Na outra, eu segurava a grade para ela passar.' },
  // A Mata Fechada (v18): o cercado da espera, onde ele lia a lista antes da caçada
  'mata:0': { title: 'O cercado da espera', text: 'Eu li a lista em pé neste cercado, com a mão no portão. Numa versão eu abri o portão antes da corneta e fiquei de costas, para não ver para onde eles corriam. Na outra, eu esperei a corneta tocar e contei até dez antes de soltar os cães.' },
  'lago:0': { title: 'O lago congelado', text: 'Ela riu tanto quando eu escorreguei no gelo que caiu também. Ficamos deitados no lago, olhando o céu branco, sem frio nenhum.' },
  // NAME_MEMORY: a primeira vez que o nome dela aparece no jogo
  'cabana:0': { title: 'O nome dela', text: 'Arielle. O nome volta inteiro, com a voz dela dizendo, rindo do nó torto da minha capa. Arielle.' },
  'clareira:boss': { title: 'A trilha na neve', text: 'As pegadas dela na neve e as minhas atrás. Numa versão eu mandei a matilha para o vale e fiquei olhando ela subir a serra. Na outra, eu mostrei o caminho aos cães.' },
  // As Cachoeiras (v19): no alto da torre de pedra, entre as duas quedas
  'cachoeiras:0': { title: 'A água fria', text: 'A água fria da cachoeira batendo nas costas. Eu nunca aprendi a nadar, e ela me segurava pela nuca: "solta o corpo, que a água sabe o caminho". Do outro lado do rio, ela disse, ninguém ia me chamar de carrasco.' },
  // A Prainha (v19): o nome dela fica na areia só depois que ele lembra dele; o dele a água sempre leva
  'prainha:0': {
    title: 'O nome na areia',
    text: 'Ela escreveu o nome dela na areia molhada, com um graveto. Eu leio letra por letra, e quando junto as letras a palavra escorrega, como na capa do herbário. Do lado, ela escreveu o meu. A água vem e apaga antes de eu conseguir ler.',
    named: { text: 'Ela escreveu o nome dela na areia molhada, com um graveto: Arielle. As letras ficam paradas, mesmo com a água chegando perto. Do lado, ela escreveu o meu. A água vem e apaga, toda vez, antes de eu conseguir ler.' },
  },
  // O Cais do Barqueiro (v19): a noite das duas passagens
  'cais:boss': { title: 'As duas passagens', text: 'O cais na lua cheia. Ela de pé no barco, a mão estendida para mim, a outra passagem paga. Numa versão eu dei um passo para trás porque ainda tinha nomes no bolso para devolver. Na outra, porque a ordem de levá-la de volta estava no outro bolso.' },
  // O Trono da Casa (Torres): a ordem que o Senhor de Vhalor entregou na noite da Coroação
  'trono:boss': { title: 'A ordem', text: 'O salão aceso, na noite da Coroação. Do trono, o Senhor de Vhalor me estende uma ordem dobrada, com o selo da Casa ainda mole. Numa versão eu fico parado com o papel na mão e pergunto de quem é o nome. Na outra, eu dobro mais uma vez e guardo no bolso sem ler, junto com os outros.' },
  // O Arquivo Proibido (Torres): na mesa dela, entre as fichas
  'arquivo:0': { title: 'As flores do arquivo', text: 'Ela abre um registro na mesa e me mostra as flores prensadas entre as folhas, uma para cada nome. "Para alguém lembrar deles com carinho, e não só pela sentença." Eu fico olhando as mãos dela, e não as flores.' },
  // A Escadaria da Coroação (Torres): a noite, ela subindo na frente
  'coroacao:0': { title: 'A escada', text: 'A escada da Coroação, de noite. Ela sobe na frente, com as cópias dos registros apertadas no peito, e não olha para trás. Numa versão eu subo atrás dela para salvá-la. Na outra, para cumprir a ordem.' },
};
export const MEMORY_TOTAL = Object.keys(MEMORIES).length;

export function memoryInfo(id: string, knowsName: boolean): MemoryInfo | undefined {
  const m = MEMORIES[id];
  if (!m) return undefined;
  return knowsName && m.named ? { ...m, title: m.named.title ?? m.title, text: m.named.text } : m;
}

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
  'margem:0': { kind: 'carrasco', mode: 'corrupt' },
  'abismo:boss': { kind: 'carrasco', mode: 'corrupt' },
  'espelhos:boss': { kind: 'carrasco', mode: 'corrupt' },
  'capataz:boss': { kind: 'ela', mode: 'corrupt' },
  'lago:0': { kind: 'ela', mode: 'restore' },
  'mata:0': { kind: 'povo', mode: 'corrupt' },
  'cabana:0': { kind: 'ela', mode: 'restore' },
  'clareira:boss': { kind: 'ela', mode: 'corrupt' },
  'cachoeiras:0': { kind: 'ela', mode: 'restore' },
  'prainha:0': { kind: 'ela', mode: 'restore' },
  'cais:boss': { kind: 'ela', mode: 'corrupt' },
  'trono:boss': { kind: 'carrasco', mode: 'corrupt' },
  'arquivo:0': { kind: 'ela', mode: 'restore' },
  'coroacao:0': { kind: 'ela', mode: 'corrupt' },
};

// As memórias de duas versões (as roxas). lead é o que as duas contam igual; v, as duas versões na ordem
// do texto; soft, a que dói menos; truth, a que aconteceu; proof, o registro que prova (lore/continuidade.md,
// 6.3). Com a memória guardada e a prova lida, a versão falsa racha no Diário (aba A Noite) e a máscara
// fecha uma rachadura. hidden: ele só lembra de uma versão, e a outra só aparece com a prova
export interface Versions {
  lead: string;
  v: [string, string];
  soft: 0 | 1;
  truth: 0 | 1;
  proof: string;
  hidden?: boolean;
}
export const VERSIONS: Record<string, Versions> = {
  'altar:boss': {
    lead: 'O dia do casamento. O sino tocou, e ela não chegou ao altar.',
    v: ['O Arcebispo cobrou a memória dela antes da cerimônia, e ela me esqueceu no caminho.', 'Ninguém cobrou nada dela. Naquela manhã ela descobriu para onde a Casa levava o Âmbar e foi atrás, lembrando de mim inteiro.'],
    soft: 0, truth: 1, proof: 'cabana:1', hidden: true,
  },
  'mascara:boss': {
    lead: 'Ela fechou o ferro no meu rosto e leu a sentença. Não ouvi o crime.',
    v: ['As minhas mãos estavam limpas.', 'As minhas mãos não estavam limpas.'],
    soft: 0, truth: 1, proof: 'arquivo:1',
  },
  'margem:0': {
    lead: 'Eu lavava as mãos nesta calha depois de cada cumprimento.',
    v: ['A tinta saía toda, e eu subia limpo.', 'A tinta não saiu nunca, e eu assinei a ordem seguinte com a mão manchada.'],
    soft: 0, truth: 1, proof: 'arquivo:1',
  },
  'abismo:boss': {
    lead: 'Ergui o machado sobre alguém ajoelhado no tablado.',
    v: ['O machado desceu.', 'O machado caiu da minha mão, e a praça inteira ficou em silêncio.'],
    soft: 1, truth: 0, proof: 'arquivo:1',
  },
  'espelhos:boss': {
    lead: 'No Âmbar polido eu me vi de capuz, com a foice na mão. Atrás de mim, alguém de capa vermelha chamava.',
    v: ['Eu me virei para ver.', 'Eu segui em frente.'],
    soft: 0, truth: 1, proof: 'arquivo:0',
  },
  'capataz:boss': {
    lead: 'Uma moça de capa vermelha correndo pelos túneis, com um caderno apertado no peito.',
    v: ['Eu corria atrás dela com a ordem na mão.', 'Eu segurava a grade para ela passar.'],
    soft: 1, truth: 0, proof: 'arquivo:0',
  },
  'mata:0': {
    lead: 'Eu li a lista em pé neste cercado, com a mão no portão.',
    v: ['Abri o portão antes da corneta e fiquei de costas, para não ver para onde eles corriam.', 'Esperei a corneta tocar e contei até dez antes de soltar os cães.'],
    soft: 0, truth: 1, proof: 'mata:1',
  },
  'clareira:boss': {
    lead: 'As pegadas dela na neve e as minhas atrás.',
    v: ['Mandei a matilha para o vale e fiquei olhando ela subir a serra.', 'Mostrei o caminho aos cães.'],
    soft: 0, truth: 0, proof: 'clareira:0',
  },
  'cais:boss': {
    lead: 'O cais na lua cheia. Ela de pé no barco, a mão estendida para mim, a outra passagem paga.',
    v: ['Dei um passo para trás porque ainda tinha nomes no bolso para devolver.', 'Dei um passo para trás porque a ordem de levá-la de volta estava no outro bolso.'],
    soft: 0, truth: 1, proof: 'patio:0',
  },
  'trono:boss': {
    lead: 'O salão aceso, na noite da Coroação. Do trono, o Senhor de Vhalor me estende uma ordem dobrada, com o selo da Casa ainda mole.',
    v: ['Fico parado com o papel na mão e pergunto de quem é o nome.', 'Dobro mais uma vez e guardo no bolso sem ler, junto com os outros.'],
    soft: 0, truth: 1, proof: 'arquivo:1',
  },
  'coroacao:0': {
    lead: 'A escada da Coroação, de noite. Ela sobe na frente, com as cópias dos registros apertadas no peito, e não olha para trás.',
    v: ['Eu subo atrás dela para salvá-la.', 'Eu subo atrás dela para cumprir a ordem.'],
    soft: 0, truth: 1, proof: 'patio:0',
  },
};

// As memórias essenciais: as que contam a noite e o caminho até ela, na ordem do caminho (A Noite)
export const ESSENTIAL = ['mascara:boss', 'abismo:boss', 'capataz:boss', 'cabana:0', 'clareira:boss', 'cais:boss', 'arquivo:0', 'trono:boss', 'coroacao:0'];
// As decisivas: as essenciais de duas versões. Na primeira vez que ele acha uma, escolhe como guardar:
// como foi (as duas ficam até a prova) ou como dói menos (fica a mais leve, e a máscara racha)
export const DECISIVE = ESSENTIAL.filter((id) => VERSIONS[id]);
// Os planos da Casa (prova vhalor): os registros que contam a Coroação do começo ao fim
export const PLAN_RECORDS = ['mercado:0', 'prensas:0', 'rio:0', 'trono:0', 'patio:0'];
// a máscara: rachaduras de corrupção que ainda contam como pouca (A Noite e os finais)
export const CORRUPTION_LOW = 2;

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
  // A Margem da Tinta (v18): a calha das sentenças, entre o Fosso e o Leito do Abismo
  'margem:0': {
    title: 'O caderno do copista',
    region: 'Fosso dos Esquecidos',
    lines: [
      'Um caderno de copista, a capa inchada de tinta. Nas primeiras folhas só contas: quanto de tinta gasta cada sentença, quanto rende um frasco, quantas penas se perdem por mês.',
      'No fim, com letra apressada: "a Casa manda copiar as sentenças antes do julgamento. Copiei trinta e duas que ainda não aconteceram. Hoje copiei a minha."',
    ],
    proofs: ['inocentes', 'vhalor'],
  },
  'margem:1': {
    title: 'A ordem em branco',
    region: 'Fosso dos Esquecidos',
    lines: [
      'Na prancha de assinar ainda tem uma ordem presa: número, data, pena. O campo do crime está vazio, e no pé da folha duas assinaturas da Casa esperam a terceira, a do carrasco.',
      'O tinteiro secou com a pena dentro. Quem devia assinar não assinou, e ninguém veio cobrar: a folha ficou aqui em cima, e lá embaixo a pena foi cumprida do mesmo jeito.',
    ],
    proofs: ['inocentes', 'vhalor'],
  },
  // Galeria Alagada (v18): a bacia que a Casa mandou alagar, entre os trilhos e as prensas
  'alagada:0': {
    title: 'O caderno da bomba',
    region: 'Minas Abandonadas',
    lines: [
      'O caderno do homem da bomba, pendurado no prego, inchado de umidade. Todo dia a mesma linha: "nível medido, nível baixado, turno fechado". Anos de linhas iguais.',
      'Nas últimas folhas a letra muda: "mandaram parar a bomba. Perguntei até quando. Responderam que até a galeria de baixo calar."',
    ],
    proofs: ['vhalor', 'inocentes'],
  },
  'alagada:1': {
    title: 'A ordem de alagar',
    region: 'Minas Abandonadas',
    lines: [
      'A ordem está pregada no quadro das bombas, com o selo da Casa: fechar as comportas e deixar a água subir na galeria de baixo, "pelo bem do Âmbar e da cidade".',
      'No verso, com outra letra: "ainda tinha gente lá embaixo. Contei dezessete capacetes na parede e dezessete não voltaram. Quem assinou isto escreveu o nome da cidade, não o próprio."',
    ],
    proofs: ['vhalor', 'inocentes'],
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
  // A Mata Fechada (v18): o caderno no fundo da cova e a lista pregada na espera do guarda
  'mata:0': {
    title: 'O caderno do mateiro',
    region: 'Floresta Nevada',
    lines: [
      'Um caderno de capa de pano no fundo da cova, aberto no meio, com a letra tremida de frio.',
      '"Cavei onze covas para a Casa e cobri todas de galho. Na décima segunda eu parei: eles mediram a cova com a vara, e a medida não era de bicho."',
      '"Deixo o caderno aqui dentro e vou embora. Que nasça o que quiser no fundo desta."',
    ],
    proofs: ['inocentes', 'vhalor'],
  },
  'mata:1': {
    title: 'A lista do cercado',
    region: 'Floresta Nevada',
    lines: [
      'Uma tábua pregada no corrimão da espera, com nomes riscados a canivete e um traço ao lado de cada um.',
      'Vinte e três traços. O último nome não tem traço: alguém raspou a madeira ali até o nome sair dela.',
      'No canto, de outra letra: "cercado desativado. A caça passa para a clareira. Os cães não descem mais do lago."',
    ],
    proofs: ['inocentes'],
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
  // A Gruta Atrás da Água (v19): a caixa que ela escondeu para levar, na laje do bolsão de ar
  'gruta:0': {
    title: 'A lista do que levar',
    region: 'Vale das Cachoeiras',
    lines: [
      'Uma caixa de lata embrulhada em pano encerado, seca por dentro. Em cima de tudo, uma lista dobrada em quatro, na letra miúda do herbário.',
      '"Levar: as cópias dos registros (os da mina e os da prisão), o herbário, sementes do vale, a corda, a capa, pão para três dias, a concha."',
      'No fim, uma palavra riscada e escrita de novo embaixo, com mais força: "ele".',
    ],
    proofs: ['arielle'],
  },
  // A Prainha (v19): na enseada do outro lado do paredão, as primeiras pedras da casa
  'prainha:0': {
    title: 'A planta da casa',
    region: 'Vale das Cachoeiras',
    lines: [
      'Uma tábua lisa encostada nas pedras da soleira, com a planta de uma casa riscada a carvão: dois cômodos, a porta virada para o rio e uma janela para as cachoeiras.',
      'Na parede do fundo, uma prateleira comprida, de ponta a ponta, e a letra dela ao lado: "para os nomes que ninguém mais vai pagar".',
      'No canto, numa letra grossa e torta que não é a dela, a conta das tábuas e dos pregos, refeita três vezes até fechar.',
    ],
    proofs: ['arielle'],
  },
  // O Rio (v19): no poste de aviso ao pé do pilar do aqueduto, onde a lembrança falha
  'rio:0': {
    title: 'A ordem do aqueduto',
    region: 'Vale das Cachoeiras',
    lines: [
      'Pregada no poste ao pé do pilar, com o selo de cera da Casa Vhalor: "Desviar as águas do vale pelo aqueduto até as Torres, de dia e de noite, para esfriar o núcleo da Coroação."',
      '"O barqueiro e quem mora na margem saem até a lua nova. O rio de baixo pode secar: ninguém lá embaixo vai lembrar que ele existia."',
      'Na margem do papel, a lápis, a letra miúda do herbário: "núcleo. Perguntar a ele o que a Casa guarda nas Torres."',
    ],
    proofs: ['vhalor', 'nucleo'],
  },
  // O Cais do Barqueiro (v19): o livro de bordo que ficou no banco do barco
  'cais:0': {
    title: 'O livro de bordo',
    region: 'Vale das Cachoeiras',
    lines: [
      'Um livro de bordo embrulhado em oleado, no banco do barco. Cada linha é uma travessia rio abaixo: a lua, quem subiu e com o que pagou. Ninguém pagou com memória.',
      '"O homem da bomba, das minas: pagou com o relógio." "O mateiro, sem bagagem: uma faca de cabo de osso." "Uma parteira e o filho pequeno: passagem paga por A."',
      '"Duas passagens, lua cheia, pagas por A. Ela veio. Ele veio também, mas não embarcou: ficou no cais olhando a água. Ela soltou a corda e voltou a pé."',
    ],
    named: {
      lines: [
        'Um livro de bordo embrulhado em oleado, no banco do barco. Cada linha é uma travessia rio abaixo: a lua, quem subiu e com o que pagou. Ninguém pagou com memória.',
        '"O homem da bomba, das minas: pagou com o relógio." "O mateiro, sem bagagem: uma faca de cabo de osso." "Uma parteira e o filho pequeno: passagem paga por Arielle."',
        '"Duas passagens, lua cheia, pagas por Arielle. Ela veio. Ele veio também, mas não embarcou: ficou no cais olhando a água. Ela soltou a corda e voltou a pé."',
      ],
    },
    proofs: ['inocentes', 'arielle'],
  },
  // O Trono da Casa (Torres): o decreto que o Senhor de Vhalor guardava no colo
  'trono:0': {
    title: 'O decreto da Coroação',
    region: 'Torres Rúnicas',
    lines: [
      'Um pergaminho grosso com o selo da Casa, enrolado numa fita de bronze. A letra é de escrivão, caprichada, de quem escreve para ser lido em voz alta na praça.',
      '"Na noite da Coroação o núcleo das Torres será ligado. Dali em diante a Casa Vhalor decide o que o povo de Vespera lembra, o que sente e no que acredita, para que ninguém mais sofra pelo que passou."',
      '"O que doer será guardado no Arquivo. O que restar será coroado." Embaixo, a assinatura do Senhor de Vhalor e, do lado, o espaço de mais uma, que ninguém assinou.',
    ],
    proofs: ['vhalor', 'nucleo'],
  },
  // O Pátio das Runas (Torres): a lista pregada no quadro da guarda, na frente da grande porta
  'patio:0': {
    title: 'A ordem de subida',
    region: 'Torres Rúnicas',
    lines: [
      'A lista de quem podia subir às Torres na noite da Coroação, pregada no quadro da guarda: o Senhor de Vhalor, quatro escrivães, a guarda da Coroação e os dois do núcleo.',
      'No fim, em outra letra, mais apressada: "o carrasco, para a guarda do núcleo. Voltou do cais sem a arquivista e com a ordem de trazê-la ainda no bolso. Que suba por último e cumpra lá em cima."',
      'Ao lado, o sinal que ele fazia em toda ordem que ia cumprir.',
    ],
    proofs: ['vhalor'],
  },
  // O Arquivo Proibido (Torres): o caderno na mesa dela e a ficha atrás da estante falsa
  'arquivo:0': {
    title: 'O índice dela',
    region: 'Torres Rúnicas',
    lines: [
      'O caderno de índice do Arquivo, aberto na mesa, na letra miúda do herbário: a estante e o frasco de cada um que a Casa apagou, e ao lado de cada nome a mesma palavra, "devolver".',
      'Na última folha, as minas: "Ele veio atrás de mim pelo túnel inteiro, com a ordem na mão. No salão dos espelhos eu chamei por ele, e ele não se virou."',
      'Embaixo, mais apertado: "A ficha dele está atrás da estante falsa. Ainda não tive coragem de ler."',
    ],
    proofs: ['arielle', 'inocentes'],
  },
  'arquivo:1': {
    title: 'A ficha do carrasco',
    region: 'Torres Rúnicas',
    lines: [
      'Uma ficha grossa com o selo da Casa, amarrada com fita. Cumprimentos: trezentos e doze, um por linha, cada um com a assinatura dele e a mesma mancha de tinta no canto, onde a mão encostava.',
      'Observação da Casa, em letra de escrivão: "Não lê as ordens: dobra, guarda no bolso e cumpre. O machado nunca falhou no tablado."',
      'No verso, na letra miúda do herbário: "ele ainda pode escolher".',
    ],
    proofs: ['inocentes', 'arielle'],
  },
  // A Sala das Experiências (Torres): o caderno no andar do meio e a planta no de cima
  'experiencias:0': {
    title: 'O caderno dos testes',
    region: 'Torres Rúnicas',
    lines: [
      'O caderno de quem tocava as sessões, aberto na bancada. Quatro cadeiras ligadas ao mesmo tanque, uma coroa de Âmbar em cada cabeça. Nas primeiras sessões, cada um lembrava só do que era seu.',
      '"Sétima sessão: as lembranças se misturaram no tanque. O da cadeira dois chorou pela mãe do da cadeira três. Ninguém soube mais de quem era cada uma."',
      '"A Casa achou o resultado excelente. Mandou fazer o tanque do tamanho de uma torre."',
    ],
    proofs: ['nucleo', 'ambar'],
  },
  'experiencias:1': {
    title: 'A planta do núcleo',
    region: 'Torres Rúnicas',
    lines: [
      'A planta do núcleo, presa na prancheta: uma esfera de Âmbar pendurada por correntes no alto da torre maior. Guarda a consciência de milhares e esfria com a água do aqueduto.',
      'Na margem, a lápis, a letra miúda do herbário, numa conta refeita muitas vezes: "Quebrar espalha os pedaços. Se alguém carregar os fragmentos e cortar a ligação por dentro, ninguém mais perde nada."',
      '"Preciso de uma noite com o núcleo ligado. Só uma."',
    ],
    proofs: ['nucleo', 'arielle'],
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
  swim: {
    name: 'A Concha do Rio',
    text: 'Uma concha de rio do tamanho da palma da mão, furada para passar um cordão. Ela disse que, com ela no pescoço, ele não se afogava mais.',
    how: 'Na água funda, {up} {down} {left} {right} nadam, {jump} dá uma braçada e {dash} um impulso. Na linha d\'água, {jump} pula para fora',
    named: {
      name: 'A Concha de Arielle',
      text: 'Arielle achou a concha no rio, no dia em que ele confessou que nunca tinha aprendido a nadar. Furou com um prego e amarrou num cordão.',
    },
  },
  light: {
    name: 'A Capa de Luz',
    text: 'No pilar que sobrou no meio do vazio, o retalho vermelho bebeu a luz dourada que sobe das nuvens. Agora ele brilha por dentro, como brasa.',
    how: 'No ar, depois do pulo duplo, {jump} de novo voa mais um trecho para cima, até três vezes (as luzes ficam ao lado da vida). Elas voltam no chão firme e nos lumes dourados',
    named: {
      name: 'A Luz de Arielle',
      text: 'O retalho da capa de Arielle bebeu a luz das nuvens. Ela dizia que usava vermelho para ele achar ela de longe, em qualquer multidão.',
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
    kind: 'trout', name: 'Truta de Âmbar',
    text: 'Truta grande dos poços do Vale. O Âmbar que desceu das minas pelo rio cresceu nas escamas dela, e os cristais brilham no escuro da água.',
    tip: 'Bolhas e um círculo na água: ela vai saltar ali. Saia de cima e bata quando ela cair. Na terra ela se debate e apanha mais.',
  },
  {
    kind: 'heron', name: 'Garça Cinzenta',
    text: 'A única coisa sem cor dentro da lembrança. Fica parada no raso a vida inteira, esperando o que passa, como se fosse do vale de agora e não do de antes.',
    tip: 'Quando o pescoço encolhe num Z, o bote vem. Apare o bico na hora e ela fica tonta; errou, o bico fica um instante lá na frente.',
  },
  {
    kind: 'motes', name: 'Vaga-lumes do Eclipse',
    text: 'Onde o vale está sendo esquecido, a luz se junta em bolos escuros que comem a cor em volta. Não brilham: apagam.',
    tip: 'Um golpe espalha o enxame. Não deixe o miolo encostar; no escuro, siga a borda roxa dos pontos.',
  },
  {
    kind: 'crownguard', name: 'Guarda da Coroação',
    text: 'Soldado da Casa Vhalor, de bronze e alabarda. Na noite da Coroação subiu as torres atrás dela. Ainda guarda as portas, de escudo alto, para uma festa que acabou.',
    tip: 'O escudo para o que vem pela frente: bata de cima, pelas costas ou logo depois de um golpe dele. A estocada vem na altura do peito (agache, pule ou apare a ponta). Perto demais, o giro passa rente ao chão: pule.',
  },
  {
    kind: 'watcher', name: 'Vigia Rúnica',
    text: 'Um aro de bronze com uma runa no meio, parado no ar e preso a nada: é Âmbar vivo, posto pela Casa para olhar os corredores. O que ela vê, ela marca com luz.',
    tip: 'Quando o fio de luz começa a seguir você, saia da linha: depois que ele pisca, o feixe vai reto até a primeira pedra. Um golpe enquanto ela mira derruba a vigia, e caída ela apanha mais.',
  },
  {
    kind: 'archived', name: 'Os Arquivados',
    text: 'Gente cuja memória a Casa guardou nos frascos do Arquivo. Ficou só o corpo, de olhos fechados, andando entre as estantes atrás de um calor que não lembra de quem era.',
    tip: 'O toque não abre rachadura: leva uma conta de Âmbar (sem Âmbar, aí machuca). Deslize por baixo dos braços. Vencidos, não morrem: a luz deles volta para um frasco.',
  },
  {
    kind: 'boss:cacador', name: 'O Mestre da Caça',
    text: 'Caçador-mor da Casa Vhalor. Trazia os fugitivos de volta pela neve e entregava ao carrasco no fim da trilha. Congelou esperando uma presa que passou a serra.',
    tip: 'Agache na estocada alta, pule a baixa e saia de baixo do salto. Na nevasca, olhe a lanterna: ela pisca antes do golpe.',
  },
  {
    kind: 'boss:barqueiro', name: 'O Barqueiro',
    text: 'Levava rio abaixo quem fugia de Vespera, sem cobrar memória: anotava cada passageiro no livro de bordo. A Casa cobrou a dele, e ele ficou no lago empurrando o barco em roda, esperando a passagem.',
    tip: 'A varrida vem na altura de onde você pisa: alta, agache; baixa, pule; nadando, mergulhe. Dois golpes arrebentam a corda. Quando o barco afundar, saia de cima das bolhas e fique longe da cachoeira.',
  },
  {
    kind: 'boss:vhalor', name: 'O Senhor de Vhalor',
    text: 'O chefe da Casa Vhalor, que pediu a Coroação. Na noite ele esperava no trono o núcleo ligar. O Eclipse fez crescer nele o Âmbar dos cabos que ligavam o trono ao núcleo, e ele ficou preso ali, mandando nos cabos.',
    tip: 'A luz corre pela calha do teto até onde o cabo vai descer. Pule a ponta do cabo do chão, fique nas runas apagadas e saia da linha da runa do Cetro antes de ela piscar. A pancada de perto dá para aparar. Com o trono lá em cima, passe por dentro de um dos pilares com o dash.',
  },
];

// alavancas da prisão: o que o cavaleiro pensa quando ela vira
export const LEVERS: Record<string, string> = {
  'lever:poco:0': 'A grade da escadaria subiu. Um caminho curto de volta para a cidade.',
  'lever:fuga:0': 'Lá em cima, um alçapão destrancou. O poço sobe até as celas.',
};

// os frascos de Âmbar que brilham nas estantes do Arquivo (',' no mapa, na ordem do mapa): cada um guarda
// a memória de alguém, e o eco é uma frase só, na voz de quem ela era
export const JAR_ECHOES: Record<string, string[]> = {
  // na ordem do mapa, de cima para baixo; os de número 0, 3, 4 e 7 ficam ao lado de um Arquivado (o dono)
  arquivo: [
    'Eu cuidava destes livros. Sabia onde estava cada um. Agora quem está numa prateleira sou eu.',
    'Minha mãe cantava para o pão crescer. Eu não lembro a letra. Eu lembrava.',
    'Pediram só o dia do incêndio. Levaram o ano inteiro junto.',
    'Trabalhei nas engrenagens a vida inteira. A mão ainda sabe apertar. Eu é que não sei mais o quê.',
    'Assinei o papel para salvar a casa da minha família. Não lembro da casa. Não lembro da família.',
    'Eu tinha um irmão. Disso eu tenho certeza. O rosto dele ficou aqui.',
    'Se alguém abrir isto: o nome da minha filha é Lis. Diga a ela que eu tentei.',
    'Fui o primeiro a entrar aqui. Disseram que doía menos que lembrar. Mentiram nas duas coisas.',
  ],
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

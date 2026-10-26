import type { RoomId } from './rooms';

// As regiões de Vespera, como o Agrimensor vende os mapas: cada uma é uma folha. Sem a folha, a região
// não aparece no mapa (nem a sala onde o cavaleiro está). Com ela, as salas aparecem a lápis e o que ele
// já pisou fica passado a tinta.
export type RegionId = 'vespera' | 'cidade' | 'prisao' | 'fosso' | 'minas' | 'floresta';

export interface RegionDef {
  id: RegionId;
  name: string;
  rooms: RoomId[];
  // a aguada da região no mapa
  wash: string;
  // o preço da folha em moedas
  price: number;
  // o que o Agrimensor diz da folha
  blurb: string;
  // onde o Agrimensor espera nesta região (a tile dos pés dele)
  surveyor: { room: RoomId; x: number; y: number };
}

export const REGIONS: RegionDef[] = [
  {
    id: 'vespera', name: 'Catacumbas de Vespera', rooms: ['ponte', 'catacumbas', 'nichos', 'sinos', 'cripta'], wash: '#7f93ab', price: 8, surveyor: { room: 'catacumbas', x: 87, y: 43 },
    blurb: 'Da ponte do castelo até a cripta do sino, com a galeria dos nichos no meio. Os ossos não mudam de lugar, então essa é a mais fiel.',
  },
  {
    id: 'cidade', name: 'Cidade-Catedral', rooms: ['escadaria', 'praca', 'mercado', 'rua', 'telhados', 'nave', 'claustro', 'galeria', 'altar'], wash: '#c49a5c', price: 20, surveyor: { room: 'escadaria', x: 7, y: 35 },
    blurb: 'A praça, a rua, os telhados e a catedral inteira, até o altar. Desenhei de cima, do campanário.',
  },
  {
    id: 'prisao', name: 'Prisão Subterrânea', rooms: ['poco', 'solitarias', 'celas', 'correntes', 'guarita', 'fuga', 'arena', 'mascara'], wash: '#a55f4c', price: 30, surveyor: { room: 'poco', x: 50, y: 15 },
    blurb: 'Celas, correntes e a guarita. Contei os passos dos carcereiros para medir os corredores.',
  },
  {
    id: 'fosso', name: 'Fosso dos Esquecidos', rooms: ['fosso', 'abismo'], wash: '#7a64a4', price: 15, surveyor: { room: 'fosso', x: 50, y: 77 },
    blurb: 'Só o que a corda alcançou. Lá embaixo a tinta escorre do papel.',
  },
  {
    id: 'minas', name: 'Minas Abandonadas', rooms: ['boca', 'trilhos', 'prensas', 'veio', 'espelhos', 'capataz'], wash: '#c0843c', price: 35, surveyor: { room: 'boca', x: 13, y: 29 },
    blurb: 'Segui os trilhos até onde o Âmbar deixou. Os túneis que ele fechou eu marquei com cruz.',
  },
  {
    id: 'floresta', name: 'Floresta Nevada', rooms: ['encosta', 'pinhal', 'lago', 'cabana', 'serra', 'clareira'], wash: '#7aa0ad', price: 40, surveyor: { room: 'encosta', x: 14, y: 29 },
    blurb: 'A encosta, o pinhal, o lago e a cabana. Na neve as trilhas somem; os troncos ficam.',
  },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, RegionDef>;

export function regionOf(room: RoomId): RegionDef | null {
  return REGIONS.find((r) => r.rooms.includes(room)) ?? null;
}

// O Agrimensor anda sempre uma região na frente: espera na região mais adiantada que o cavaleiro já
// pisou (ou na de agora, quando ele acaba de chegar nela) e vende a folha dela e as de antes.
export function surveyorRegion(here: RoomId | null, visited: (id: RoomId) => boolean): RegionDef | null {
  let at: RegionDef | null = null;
  for (const r of REGIONS) if (r.rooms.some((id) => id === here || visited(id))) at = r;
  return at;
}

// as folhas que ele vende onde está: a da região dele e as de antes, na ordem do caminho
export function sheetsFor(at: RegionDef): RegionDef[] {
  return REGIONS.slice(0, REGIONS.indexOf(at) + 1);
}

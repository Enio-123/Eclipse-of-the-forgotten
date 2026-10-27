import { progress } from '../systems/Save';
import { CORRUPTION_LOW, ESSENTIAL, MEMORIES, PLAN_RECORDS, RECORDS, VERSIONS } from './lore';
import { regionOf } from './regions';
import type { RoomId } from './rooms';

// O sistema da história (lore/continuidade.md, 6): as memórias de duas versões e as provas que decidem,
// a escolha de como guardar as decisivas e o que ele já sabe da noite (Diário, aba A Noite; os finais
// conferem o mesmo).

// a memória está com ele (achada e não trocada com o Cobrador)
export const holds = (id: string) => progress.memories.has(id) && !progress.traded.has(id);

// leu o registro
export const hasRecord = (id: string) => progress.seen.has(`record:${id}`);

// ele guardou a memória como dói menos
export const softened = (id: string) => progress.seen.has(`soft:${id}`);

// a prova da memória já foi lida e a versão falsa rachou
export const confirmed = (id: string) => progress.seen.has(`confirm:${id}`);

export type VersionState = 'missing' | 'traded' | 'open' | 'soft' | 'confirmed';

export function versionState(id: string): VersionState {
  if (!progress.memories.has(id)) return 'missing';
  if (progress.traded.has(id)) return 'traded';
  if (confirmed(id)) return 'confirmed';
  return softened(id) ? 'soft' : 'open';
}

// memórias guardadas cuja prova já foi lida, mas que ainda não racharam a versão falsa
export function pendingConfirmations() {
  return Object.keys(VERSIONS).filter((id) => holds(id) && hasRecord(VERSIONS[id].proof) && !confirmed(id));
}

// a prova chegou: a versão falsa racha e a máscara fecha uma rachadura
export function confirm(id: string) {
  if (confirmed(id)) return;
  progress.seen.add(`confirm:${id}`);
  progress.corrupt(-1);
}

// escolheu, na primeira vez, como guardar uma memória decisiva
export function choose(id: string, soft: boolean) {
  if (soft) {
    progress.seen.add(`soft:${id}`);
    progress.corrupt(1);
  } else progress.seen.add(`kept:${id}`);
}

// a escolha de uma memória decisiva já foi feita (num save de antes dela, a memória fica como foi)
export const chosen = (id: string) => softened(id) || progress.seen.has(`kept:${id}`);

export type Corruption = 'baixa' | 'média' | 'alta';

export function corruptionLevel(n = progress.corruption): Corruption {
  return n <= CORRUPTION_LOW ? 'baixa' : n <= CORRUPTION_LOW + 2 ? 'média' : 'alta';
}

// a região onde uma memória ou um registro fica (o id é sala:ordem)
export function regionName(id: string) {
  return regionOf(id.split(':')[0] as RoomId)?.name ?? '';
}

// O que ele sabe da noite: as memórias essenciais, as decisivas confirmadas, os planos da Casa, como o
// núcleo foi feito e a máscara. Os finais (T7) leem daqui: o I pede tudo de `truth`, o III pede `whole`
export function night() {
  const essentials = ESSENTIAL.map((id) => ({ id, held: holds(id), traded: progress.traded.has(id) }));
  const decisive = ESSENTIAL.filter((id) => VERSIONS[id]).map((id) => ({ id, state: versionState(id) }));
  const plans = PLAN_RECORDS.map((id) => ({ id, read: hasRecord(id) }));
  const core = Object.keys(RECORDS)
    .filter((id) => RECORDS[id].proofs.includes('nucleo'))
    .map((id) => ({ id, read: hasRecord(id) }));
  // as memórias dele e dela: todas, menos a da noite (que só volta no fim)
  const all = Object.keys(MEMORIES).filter((id) => id !== 'nucleo:boss');
  const truth =
    essentials.every((e) => e.held) && decisive.every((d) => d.state === 'confirmed') && plans.every((p) => p.read) && progress.corruption <= CORRUPTION_LOW;
  const whole = truth && all.every(holds) && core.every((c) => c.read);
  return { essentials, decisive, plans, core, all, corruption: progress.corruption, level: corruptionLevel(), truth, whole };
}

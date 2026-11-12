/**
 * Regulations (legal pools) of a generation, on top of the bundled `regulations.json`
 * (scripts/build-data/regulations.ts). The synthetic "No filter" (`NO_REGULATION`) means every
 * entity the engine knows. Needs the bridge of the generation to be loaded.
 */
import { NO_REGULATION, type RegulationRecord } from '../data/types'
import { getBridge } from './maps'
import type { DataGenId } from './types'

export { NO_REGULATION }

/** What the pickers need of a regulation: id sets plus the learnset changes. */
export interface LegalPool {
  record: RegulationRecord
  species: ReadonlySet<string>
  items: ReadonlySet<string>
  /** `undefined`: the regulation does not restrict moves beyond the learnsets */
  moves: ReadonlySet<string> | undefined
}

const pools = new WeakMap<RegulationRecord, LegalPool>()

export function regulationsOf(gen: DataGenId): readonly RegulationRecord[] {
  return getBridge(gen).data.regulations
}

export function regulationRecord(gen: DataGenId, id: string): RegulationRecord | undefined {
  return regulationsOf(gen).find((r) => r.id === id)
}

/** The regulation selected by default: the one marked `default`, else "No filter". */
export function defaultRegulationId(gen: DataGenId): string {
  return regulationsOf(gen).find((r) => r.default)?.id ?? NO_REGULATION
}

/** `id` when it is "No filter" or a regulation of the generation, else the default. */
export function resolveRegulationId(gen: DataGenId, id: string | undefined): string {
  if (id === NO_REGULATION) return id
  if (id && regulationRecord(gen, id)) return id
  return defaultRegulationId(gen)
}

/** The legal pool, or `undefined` for "No filter" (everything is legal). */
export function legalPool(gen: DataGenId, id: string): LegalPool | undefined {
  const record = regulationRecord(gen, id)
  if (!record) return undefined
  let pool = pools.get(record)
  if (!pool) {
    pool = {
      record,
      species: new Set(record.species),
      items: new Set(record.items),
      moves: record.moves ? new Set(record.moves) : undefined,
    }
    pools.set(record, pool)
  }
  return pool
}

export function regulationLabel(gen: DataGenId, id: string, lang: 'en' | 'de'): string | undefined {
  return regulationRecord(gen, id)?.label[lang]
}

export function isSpeciesLegal(gen: DataGenId, regulation: string, speciesId: string): boolean {
  const pool = legalPool(gen, regulation)
  return !pool || pool.species.has(speciesId)
}

export function isItemLegal(gen: DataGenId, regulation: string, itemId: string): boolean {
  const pool = legalPool(gen, regulation)
  return !pool || pool.items.has(itemId)
}

export interface LegalityProblems {
  species: boolean
  item: boolean
  /** Move ids the species cannot use in this regulation */
  moves: string[]
}

/**
 * What of a build is not legal in `regulation`. Never throws away anything: callers only show it.
 * Moves are checked with `isMoveLegal` (supplied by catalog.ts to avoid an import cycle).
 */
export function legalityProblems(
  gen: DataGenId,
  regulation: string,
  set: { speciesId: string; itemId?: string; moveIds: readonly string[] },
  isMoveLegal: (speciesId: string, moveId: string) => boolean,
): LegalityProblems | undefined {
  if (!legalPool(gen, regulation)) return undefined
  const problems: LegalityProblems = {
    species: !isSpeciesLegal(gen, regulation, set.speciesId),
    item: !!set.itemId && !isItemLegal(gen, regulation, set.itemId),
    moves: set.moveIds.filter((m) => m && !isMoveLegal(set.speciesId, m)),
  }
  return problems.species || problems.item || problems.moves.length ? problems : undefined
}

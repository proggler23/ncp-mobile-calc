/**
 * Curated common sets (sets/curated.json) layered over the generated Smogon-usage sets.
 * Pure functions (unit tested); no network.
 */
import type { CommonSet, EvSpread, SetsFile } from '../../src/data/types'

export const CURATED_SOURCE = 'curated'

/** One hand-written set. Ids are Showdown ids (lowercase alphanumerics), as in generated/<gen>/dex.json. */
export interface CuratedSet {
  ability: string
  item: string
  /** Showdown nature name, e.g. "Timid" */
  nature: string
  /** EVs (Stat Points in the champions gen); missing stats default to 0 */
  evs?: Partial<EvSpread>
  /** 1-4 move ids */
  moves: string[]
  teraType?: string
}
export interface CuratedEntry {
  /** replace (default): only the curated sets; prepend/append: merge with the generated sets */
  mode?: 'replace' | 'prepend' | 'append'
  sets: CuratedSet[]
}
/** gen id -> species id -> entry */
export interface CuratedFile {
  $comment?: string
  gens: Record<string, Record<string, CuratedEntry>>
}

export interface CuratedResolver {
  species: (id: string) => boolean
  moves: (id: string) => boolean
  items: (id: string) => boolean
  abilities: (id: string) => boolean
}

const ZERO: EvSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }

export function validateCurated(
  gen: string,
  entries: Record<string, CuratedEntry>,
  has: CuratedResolver,
): string[] {
  const errors: string[] = []
  for (const [species, entry] of Object.entries(entries)) {
    const where = `curated ${gen}/${species}`
    if (!has.species(species)) errors.push(`${where}: unknown species id`)
    if (entry.mode && !['replace', 'prepend', 'append'].includes(entry.mode))
      errors.push(`${where}: invalid mode "${entry.mode}"`)
    if (!Array.isArray(entry.sets) || !entry.sets.length) errors.push(`${where}: no sets`)
    for (const [i, s] of (entry.sets ?? []).entries()) {
      const w = `${where}[${i}]`
      if (!has.abilities(s.ability)) errors.push(`${w}: unknown ability "${s.ability}"`)
      if (!has.items(s.item)) errors.push(`${w}: unknown item "${s.item}"`)
      if (!s.nature) errors.push(`${w}: nature missing`)
      if (!s.moves?.length || s.moves.length > 4) errors.push(`${w}: needs 1-4 moves`)
      for (const m of s.moves ?? []) if (!has.moves(m)) errors.push(`${w}: unknown move "${m}"`)
    }
  }
  return errors
}

export function curatedToCommon(s: CuratedSet): CommonSet {
  const set: CommonSet = {
    ability: s.ability,
    item: s.item,
    nature: s.nature,
    evs: { ...ZERO, ...s.evs },
    moves: [...s.moves],
    usagePct: 0,
    source: CURATED_SOURCE,
    format: CURATED_SOURCE,
    month: '',
  }
  if (s.teraType) set.teraType = s.teraType
  return set
}

/** Drop curated sets (so a previously merged snapshot can be re-merged idempotently). */
export function stripCurated(sets: SetsFile): SetsFile {
  const out: SetsFile = {}
  for (const [id, list] of Object.entries(sets)) {
    const kept = list.filter((s) => s.source !== CURATED_SOURCE)
    if (kept.length) out[id] = kept
  }
  return out
}

/** Apply curated entries for one gen on top of generated sets (input is not mutated). */
export function mergeCurated(generated: SetsFile, entries: Record<string, CuratedEntry>): SetsFile {
  const out: SetsFile = { ...stripCurated(generated) }
  for (const [species, entry] of Object.entries(entries)) {
    const cur = entry.sets.map(curatedToCommon)
    const gen = out[species] ?? []
    const mode = entry.mode ?? 'replace'
    out[species] =
      mode === 'prepend' ? [...cur, ...gen] : mode === 'append' ? [...gen, ...cur] : cur
  }
  return out
}

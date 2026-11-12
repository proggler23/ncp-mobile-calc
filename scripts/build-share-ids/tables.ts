/**
 * Share-id tables (pure, unit tested). A table lists the Showdown ids of one generation per kind;
 * the position in the list is the number a v2 share link carries. Tables are APPEND-ONLY: an id
 * never moves or disappears, so old links keep meaning the same thing. New ids are appended in the
 * order the dex lists them; ids that left the dex stay (their number is simply never produced).
 */
export const KINDS = ['species', 'moves', 'items', 'abilities', 'regulations'] as const
export type Kind = (typeof KINDS)[number]
export type IdTable = Record<Kind, string[]>

export interface DexIds {
  species: { id: string }[]
  moves: { id: string }[]
  items: { id: string }[]
  abilities: { id: string }[]
}

/** The ids the current data offers, per kind (deduplicated, in data order). */
export function currentIds(dex: DexIds, regulationIds: string[]): IdTable {
  const uniq = (l: string[]) => [...new Set(l)]
  return {
    species: uniq(dex.species.map((r) => r.id)),
    moves: uniq(dex.moves.map((r) => r.id)),
    items: uniq(dex.items.map((r) => r.id)),
    abilities: uniq(dex.abilities.map((r) => r.id)),
    regulations: uniq(regulationIds),
  }
}

/** `previous` extended by whatever `current` has that it lacks. Never reorders or removes. */
export function mergeTable(previous: IdTable | undefined, current: IdTable): IdTable {
  const out = {} as IdTable
  for (const k of KINDS) {
    const list = [...(previous?.[k] ?? [])]
    const have = new Set(list)
    for (const id of current[k]) if (!have.has(id)) list.push(id)
    out[k] = list
  }
  return out
}

/** Problems that would invalidate old links: every `base` entry must still sit at its position. */
export function tableChanges(base: IdTable | undefined, next: IdTable): string[] {
  const problems: string[] = []
  if (!base) return problems
  for (const k of KINDS) {
    const a = base[k] ?? []
    const b = next[k] ?? []
    for (let i = 0; i < a.length; i++) {
      if (b[i] !== a[i]) {
        problems.push(
          `${k}[${i}]: "${a[i]}" became ${b[i] === undefined ? 'missing' : `"${b[i]}"`}`,
        )
        break
      }
    }
  }
  return problems
}

/** Structural problems of one table (duplicates, non-ids). */
export function tableErrors(t: IdTable): string[] {
  const errors: string[] = []
  for (const k of KINDS) {
    const list = t[k]
    if (!Array.isArray(list)) {
      errors.push(`${k}: not a list`)
      continue
    }
    if (new Set(list).size !== list.length) errors.push(`${k}: duplicate ids`)
    if (list.some((id) => typeof id !== 'string' || !/^[a-z0-9]{1,64}$/.test(id)))
      errors.push(`${k}: invalid id`)
    if (list.length > 32000) errors.push(`${k}: too many ids for the v2 code width`)
  }
  return errors
}

/** Ids the data has that the table lacks (the table is stale). */
export function missingIds(table: IdTable, current: IdTable): string[] {
  const out: string[] = []
  for (const k of KINDS) {
    const have = new Set(table[k])
    for (const id of current[k]) if (!have.has(id)) out.push(`${k}:${id}`)
  }
  return out
}

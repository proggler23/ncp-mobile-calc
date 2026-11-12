/**
 * Share-id tables (src/share/generated/ids-<gen>.json, built by `npm run build:share-ids`): per
 * generation and kind the Showdown ids in an append-only order. A v2 link carries the position + 1
 * of an id (0 = "spelled out"). Loaded lazily with the generation, like the data chunks.
 */
import type { DataGenId } from '../bridge/types'

export const ID_KINDS = ['species', 'moves', 'items', 'abilities', 'regulations'] as const
export type IdKind = (typeof ID_KINDS)[number]

export interface IdTables {
  /** Position -> id. */
  list: Record<IdKind, readonly string[]>
  /** Id -> position. */
  index: Record<IdKind, ReadonlyMap<string, number>>
}

const loaders = import.meta.glob<{ default: Record<IdKind, string[]> }>('./generated/ids-*.json')
const cache = new Map<string, Promise<IdTables | undefined>>()

export function makeTables(raw: Record<IdKind, readonly string[]>): IdTables {
  const list = {} as Record<IdKind, readonly string[]>
  const index = {} as Record<IdKind, ReadonlyMap<string, number>>
  for (const k of ID_KINDS) {
    const l = Array.isArray(raw[k]) ? raw[k] : []
    list[k] = l
    index[k] = new Map(l.map((id, i) => [id, i]))
  }
  return { list, index }
}

/** `undefined` when the generation has no table (never expected; links then spell ids out). */
export function loadIdTables(gen: DataGenId): Promise<IdTables | undefined> {
  let p = cache.get(gen)
  if (!p) {
    const loader = loaders[`./generated/ids-${gen}.json`]
    p = loader ? loader().then((m) => makeTables(m.default)) : Promise.resolve(undefined)
    p.catch(() => cache.delete(gen))
    cache.set(gen, p)
  }
  return p.catch(() => undefined)
}

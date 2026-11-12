/** Searchable lists for the pickers (species, moves, items, abilities). */
import { FLAG_ALIAS, FLAG_GMAX, type DataGenId, type EntityKind } from '../bridge/types'
import { normalizeSearch } from '../data/normalize'
import type { MoveRecord } from '../data/types'
import type { Lang } from '../storage/types'
import type { SearchItem } from '../ui/SearchOverlay'
import { getLib } from './lib'

const cache = new Map<string, SearchItem[]>()

function names(en: string, de: string | undefined, lang: Lang) {
  const other = lang === 'de' ? en : de
  const primary = lang === 'de' ? (de ?? en) : en
  return {
    primary,
    secondary: other && other !== primary ? other : undefined,
    keys: [...new Set([normalizeSearch(en), normalizeSearch(de ?? en)])],
  }
}

export function speciesItems(gen: DataGenId, lang: Lang): SearchItem[] {
  const key = `species:${gen}:${lang}`
  let out = cache.get(key)
  if (!out) {
    out = getLib()
      .bridge.engineSpeciesList(gen)
      .map((s) => {
        const n = names(s.en, s.deMissing ? undefined : s.de, lang)
        return {
          id: s.id,
          primary: n.primary,
          ...(n.secondary ? { secondary: n.secondary } : {}),
          keys: [...new Set([...s.search, ...n.keys])],
        }
      })
    cache.set(key, out)
  }
  return out
}

function entityItems(
  gen: DataGenId,
  kind: EntityKind,
  lang: Lang,
  only?: readonly string[],
): SearchItem[] {
  const { bridge } = getLib()
  const b = bridge.getBridge(gen)
  const ids =
    only ?? b.map[kind].filter((e) => (e[2] & (FLAG_ALIAS | FLAG_GMAX)) === 0).map((e) => e[0])
  const out: SearchItem[] = []
  for (const id of ids) {
    const nm = bridge.entityNames(b, kind, id)
    if (!nm) continue
    const n = names(nm.en, nm.de, lang)
    const rec = (kind === 'moves' ? b.records.moves.get(id) : undefined) as MoveRecord | undefined
    const detail = rec?.type
      ? [rec.type, rec.category, rec.bp ? String(rec.bp) : undefined].filter(Boolean).join(' · ')
      : undefined
    out.push({
      id,
      primary: n.primary,
      ...(n.secondary ? { secondary: n.secondary } : {}),
      ...(detail ? { detail } : {}),
      keys: n.keys,
    })
  }
  return out.sort((a, c) => a.primary.localeCompare(c.primary, lang))
}

export function itemItems(gen: DataGenId, lang: Lang): SearchItem[] {
  const key = `items:${gen}:${lang}`
  let out = cache.get(key)
  if (!out) cache.set(key, (out = entityItems(gen, 'items', lang)))
  return out
}

export function abilityItems(gen: DataGenId, lang: Lang, only?: readonly string[]): SearchItem[] {
  if (only) return entityItems(gen, 'abilities', lang, only)
  const key = `abilities:${gen}:${lang}`
  let out = cache.get(key)
  if (!out) cache.set(key, (out = entityItems(gen, 'abilities', lang)))
  return out
}

export function moveItems(
  gen: DataGenId,
  speciesId: string,
  lang: Lang,
): { items: SearchItem[]; reliable: boolean } {
  const pool = getLib().bridge.movesForSpecies(gen, speciesId)
  return { items: entityItems(gen, 'moves', lang, pool.moveIds), reliable: pool.learnsetReliable }
}

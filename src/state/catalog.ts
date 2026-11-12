/** Searchable lists for the pickers (species, moves, items, abilities). */
import { FLAG_ALIAS, FLAG_GMAX, type DataGenId, type EntityKind } from '../bridge/types'
import { normalizeSearch } from '../data/normalize'
import type { MoveRecord } from '../data/types'
import type { Lang } from '../storage/types'
import type { SearchItem } from '../ui/SearchOverlay'
import { NO_REGULATION } from '../data/types'
import { translate, type Key } from '../i18n'
import { getLib } from './lib'
import { NATURES } from './sets'

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

/**
 * The pickers list exactly what is legal in `regulation` ("No filter": everything the engine
 * knows). `regulation` is the id from the app state (see state/regulation.ts).
 */
export function speciesItems(gen: DataGenId, lang: Lang, regulation = NO_REGULATION): SearchItem[] {
  const key = `species:${gen}:${lang}:${regulation}`
  let out = cache.get(key)
  if (!out) {
    out = getLib()
      .bridge.engineSpeciesList(gen, { regulation })
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

export function itemItems(gen: DataGenId, lang: Lang, regulation = NO_REGULATION): SearchItem[] {
  const key = `items:${gen}:${lang}:${regulation}`
  let out = cache.get(key)
  if (!out) {
    const { bridge } = getLib()
    const pool = bridge.legalPool(gen, regulation)
    const b = bridge.getBridge(gen)
    const only = pool && [...pool.items].filter((id) => b.kinds.items.byId.has(id))
    cache.set(key, (out = entityItems(gen, 'items', lang, only)))
  }
  return out
}

/** Abilities of one species (`only`, from `legalAbilities`): there is no full-pool listing. */
export function abilityItems(gen: DataGenId, lang: Lang, only: readonly string[]): SearchItem[] {
  return entityItems(gen, 'abilities', lang, only)
}

export function moveItems(
  gen: DataGenId,
  speciesId: string,
  lang: Lang,
  regulation = NO_REGULATION,
): { items: SearchItem[]; reliable: boolean } {
  const pool = getLib().bridge.movesForSpecies(gen, speciesId, { regulation })
  return { items: entityItems(gen, 'moves', lang, pool.moveIds), reliable: pool.learnsetReliable }
}

/** The 25 natures (id = English name, as stored in sets), alphabetical in `lang`. */
export function natureItems(lang: Lang): SearchItem[] {
  const key = `natures:${lang}`
  let out = cache.get(key)
  if (!out) {
    const stat = (k: string) => translate(lang, `stat.${k}` as Key)
    out = Object.entries(NATURES)
      .map(([id, pm]): SearchItem => {
        const en = translate('en', `nature.${id}` as Key)
        const n = names(en, translate('de', `nature.${id}` as Key), lang)
        return {
          id,
          primary: n.primary,
          ...(n.secondary ? { secondary: n.secondary } : {}),
          ...(pm ? { detail: `+${stat(pm[0])} −${stat(pm[1])}` } : {}),
          keys: n.keys,
        }
      })
      .sort((a, c) => a.primary.localeCompare(c.primary, lang))
    cache.set(key, out)
  }
  return out
}

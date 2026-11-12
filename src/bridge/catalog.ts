/** Picker / display helpers on top of the bridge maps and Showdown data. */
import type { Lang } from '../data/types'
import { normalizeSearch } from '../data'
import { entityNames, getBridge, isNatDexOnly, isNcpOnly, isPrimary, type Bridge } from './maps'
import type { DataGenId, EntityKind } from './types'
import { hiddenPowerTypeOfMove } from './hidden-power'

/** Display name of an entity; falls back to the NCP English name (and English for `de`). */
export function displayName(gen: DataGenId, kind: EntityKind, id: string, lang: Lang): string {
  const names = entityNames(getBridge(gen), kind, id)
  if (!names) return id
  return lang === 'de' ? (names.de ?? names.en) : names.en
}

export function speciesDisplayName(gen: DataGenId, id: string, lang: Lang): string {
  return displayName(gen, 'species', id, lang)
}

export interface EngineSpecies {
  /** Showdown id (for NCP-only species: the normalized NCP name). */
  id: string
  /** The NCP dex key the engine uses. */
  ncpName: string
  en: string
  /** Equals `en` when no German name is known (`deMissing`). */
  de: string
  deMissing: boolean
  /** Normalized names (en, de, NCP) for search. */
  search: string[]
  natDexOnly: boolean
  /** No Showdown record matched: only NCP knows this entity. */
  ncpOnly: boolean
  num: number | undefined
}

/**
 * Species the engine knows (one row per NCP dex entry; Showdown-only cosmetic aliases and
 * Gigantamax ids are not listed but still resolve in `toEngineInput`). Sorted by dex number.
 */
export function engineSpeciesList(
  gen: DataGenId,
  opts: { includeNatDexOnly?: boolean } = {},
): EngineSpecies[] {
  const b = getBridge(gen)
  const nums = new Map(b.data.species.map((r) => [r.id, r.num]))
  const out: EngineSpecies[] = []
  for (const e of b.map.species) {
    if (!isPrimary(e)) continue
    if (opts.includeNatDexOnly === false && isNatDexOnly(e)) continue
    const names = entityNames(b, 'species', e[0]) ?? { en: e[1], de: undefined }
    const de = names.de ?? names.en
    out.push({
      id: e[0],
      ncpName: e[1],
      en: names.en,
      de,
      deMissing: names.de === undefined,
      search: [...new Set([normalizeSearch(names.en), normalizeSearch(de), normalizeSearch(e[1])])],
      natDexOnly: isNatDexOnly(e),
      ncpOnly: isNcpOnly(e),
      num: nums.get(e[0]),
    })
  }
  return out.sort((x, y) => (x.num ?? 99999) - (y.num ?? 99999) || x.en.localeCompare(y.en))
}

export interface MovePool {
  moveIds: string[]
  /**
   * False when the learnset cannot be trusted: Z-A (learnsets are inherited from SV), or the
   * species has no learnset in this generation's data (e.g. National Dex-only species). Then
   * `moveIds` lists learnset hits first and every other engine move after them.
   */
  learnsetReliable: boolean
}

function engineMoveIds(b: Bridge, natDex: boolean): string[] {
  return b.map.moves.filter((e) => isPrimary(e) && (natDex || !isNatDexOnly(e))).map((e) => e[0])
}

/**
 * Moves a species can use in this generation: its learnset intersected with the moves the engine
 * knows (typed Hidden Power ids are added when the species learns Hidden Power). `natDex` defaults
 * to whether the species itself is National Dex-only.
 */
export function movesForSpecies(
  gen: DataGenId,
  speciesId: string,
  opts: { natDex?: boolean } = {},
): MovePool {
  const b = getBridge(gen)
  const entry = b.kinds.species.byId.get(speciesId)
  const natDex = opts.natDex ?? (entry !== undefined && isNatDexOnly(entry))
  const known = engineMoveIds(b, natDex)
  const knownSet = new Set(known)

  const rec = b.data.species.find((r) => r.id === speciesId)
  const learnset =
    b.data.learnsets[speciesId] ?? (rec?.base ? b.data.learnsets[rec.base] : undefined)
  const hits: string[] = []
  if (learnset) {
    for (const id of learnset) if (knownSet.has(id)) hits.push(id)
    if (learnset.includes('hiddenpower')) {
      for (const e of b.map.moves) {
        if (hiddenPowerTypeOfMove(e[1]) && knownSet.has(e[0])) hits.push(e[0])
      }
    }
  }
  const reliable = gen !== 'za' && learnset !== undefined
  if (reliable) return { moveIds: hits, learnsetReliable: true }
  const rest = known.filter((id) => !hits.includes(id))
  return { moveIds: [...hits, ...rest], learnsetReliable: false }
}

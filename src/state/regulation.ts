/** UI helpers around regulations (the data lives in src/bridge/regulations.ts). */
import type { DataGenId } from '../bridge/types'
import type { Lang } from '../storage/types'
import type { Team } from '../storage/types'
import { NO_REGULATION } from '../data/types'
import { translate } from '../i18n'
import { getLib } from './lib'

/**
 * Regulation a team is edited under: its own (when it still exists in the generation's data),
 * else the active regulation of the generation.
 */
export function teamRegulation(team: Team, activeRegulation: string): string {
  const id = team.regulation
  if (!id) return activeRegulation
  return getLib().bridge.resolveRegulationId(team.gen, id) === id ? id : activeRegulation
}

/** Display name of a regulation id ("No filter" for `none`). */
export function regulationName(gen: DataGenId, id: string, lang: Lang): string {
  if (id === NO_REGULATION) return translate(lang, 'reg.none')
  try {
    return getLib().bridge.regulationLabel(gen, id, lang) ?? id
  } catch {
    return id // data not loaded (yet)
  }
}

/** The regulation ids offered for a generation (regulations first, "No filter" last). */
export function regulationChoices(gen: DataGenId): string[] {
  return [
    ...getLib()
      .bridge.regulationsOf(gen)
      .map((r) => r.id),
    NO_REGULATION,
  ]
}

export interface BuildProblemInfo {
  species: boolean
  item: boolean
  moves: string[]
}

/** What of a build is not legal in `regulation` (undefined: legal, or no filter). */
export function buildProblemsOf(
  gen: DataGenId,
  regulation: string,
  set: { speciesId: string; itemId?: string; moveIds: readonly string[] },
): BuildProblemInfo | undefined {
  return getLib().bridge.buildProblems(gen, regulation, set)
}

/** "Pokémon, item Rocky Helmet, moves Slash": the illegal parts of a build, in `lang`. */
export function problemText(
  gen: DataGenId,
  p: BuildProblemInfo,
  set: { itemId?: string },
  lang: Lang,
): string {
  const { bridge } = getLib()
  const n = (kind: 'items' | 'moves', id: string) => bridge.displayName(gen, kind, id, lang)
  return [
    p.species ? translate(lang, 'reg.whatSpecies') : undefined,
    p.item && set.itemId
      ? translate(lang, 'reg.whatItem', { item: n('items', set.itemId) })
      : undefined,
    p.moves.length
      ? translate(lang, 'reg.whatMoves', { moves: p.moves.map((m) => n('moves', m)).join(', ') })
      : undefined,
  ]
    .filter(Boolean)
    .join(', ')
}

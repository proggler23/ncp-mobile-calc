/**
 * Spread presets.
 *
 *  - neutral : Serious, no investment
 *  - physDef : 252 HP / 252 Def, Bold (+Def -Atk)            [Champions: 32 HP / 32 Def SP]
 *  - specDef : 252 HP / 252 SpD, Calm (+SpD -Atk)            [Champions: 32 HP / 32 SpD SP]
 *  - physAtk : 252 Atk / 252 Spe, Adamant (+Atk -SpA)        [Champions: 32 Atk / 32 Spe SP]
 *  - specAtk : 252 SpA / 252 Spe, Modest (+SpA -Atk)         [Champions: 32 SpA / 32 Spe SP]
 *  - common  : the species' top usage set (needs the species' common sets), else undefined
 *
 * Gens 1-2 have no natures and are not EV based: NCP always computes with full stat experience
 * and the DVs, so every preset except `common` becomes "max stat exp": all six EVs 252 and
 * all IVs/DVs 31 (15), nature Serious. Let's Go (7.5) uses Awakening Values, stored in `evs`
 * (max 200 each): AV 200 instead of 252, natures apply as in later gens. Presets never touch
 * species, ability, item, moves or Tera type, and keep IVs (gens 3+) except in gens 1-2.
 */
import type { CommonSet } from '../data/types'
import { loadSets } from '../data'
import type { StatSpread } from '../storage/types'
import { emptySpread } from '../storage/types'
import { commonSetToSet } from './convert'
import { genMeta } from './gens'
import type { DataGenId, PresetId, SavedSetLike } from './types'

type StatKey = keyof StatSpread

interface Spec {
  nature: string
  stats: StatKey[]
}

const SPECS: Record<Exclude<PresetId, 'common'>, Spec> = {
  neutral: { nature: 'Serious', stats: [] },
  physDef: { nature: 'Bold', stats: ['hp', 'def'] },
  specDef: { nature: 'Calm', stats: ['hp', 'spd'] },
  physAtk: { nature: 'Adamant', stats: ['atk', 'spe'] },
  specAtk: { nature: 'Modest', stats: ['spa', 'spe'] },
}

export function applyPreset<T extends SavedSetLike>(
  gen: DataGenId,
  set: T,
  preset: Exclude<PresetId, 'common'>,
): T
export function applyPreset<T extends SavedSetLike>(
  gen: DataGenId,
  set: T,
  preset: 'common',
  commonSets: readonly CommonSet[] | undefined,
): SavedSetLike | undefined
export function applyPreset<T extends SavedSetLike>(
  gen: DataGenId,
  set: T,
  preset: PresetId,
  commonSets?: readonly CommonSet[],
): T | SavedSetLike | undefined {
  const meta = genMeta(gen)
  if (preset === 'common') {
    const top = commonSets?.[0]
    if (!top) return undefined
    return { ...set, ...commonSetToSet(gen, set.speciesId, top) }
  }
  const spec = SPECS[preset]
  if (meta.engineGen <= 2) {
    return { ...set, nature: 'Serious', evs: emptySpread(252), ivs: emptySpread(31) }
  }
  const amount = meta.usesStatPoints ? 32 : meta.engineGen === 7.5 ? 200 : 252
  const spread = emptySpread(0)
  for (const s of spec.stats) spread[s] = amount
  if (meta.usesStatPoints) {
    return { ...set, nature: spec.nature, evs: emptySpread(0), statPoints: spread }
  }
  const out = { ...set, nature: spec.nature, evs: spread }
  delete out.statPoints
  return out
}

/** Loads the species' common sets (sorted by usage) for the 'common' preset. */
export async function loadCommonSets(
  gen: DataGenId,
  speciesId: string,
): Promise<CommonSet[] | undefined> {
  const sets = await loadSets(gen)
  return sets[speciesId]
}

/** `applyPreset` that loads the common sets itself for 'common'. */
export async function applyPresetAsync<T extends SavedSetLike>(
  gen: DataGenId,
  set: T,
  preset: PresetId,
): Promise<T | SavedSetLike | undefined> {
  if (preset !== 'common') return applyPreset(gen, set, preset)
  return applyPreset(gen, set, 'common', await loadCommonSets(gen, set.speciesId))
}

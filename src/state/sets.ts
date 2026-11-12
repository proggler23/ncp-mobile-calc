/** Pure helpers on `SavedSetLike` builds (need the bridge of the generation to be loaded). */
import type { BridgeGenMeta } from '../bridge/gens'
import type { DataGenId, MoveOverride, SavedSetLike } from '../bridge/types'
import type { FinalStats } from '../engine/types'
import type { SpeciesRecord, StatTuple } from '../data/types'
import { LIMITS, emptySpread, type StatKey, type StatSpread } from '../storage/types'
import { getLib } from './lib'
import { own } from '../own'

export const STAT_ORDER: readonly StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']

export function speciesRecord(gen: DataGenId, id: string): SpeciesRecord | undefined {
  return getLib()
    .bridge.getBridge(gen)
    .data.species.find((r) => r.id === id)
}

/** Abilities the species can have, as far as the data knows them and the engine supports them. */
export function legalAbilities(gen: DataGenId, speciesId: string): string[] {
  const { bridge } = getLib()
  const b = bridge.getBridge(gen)
  if (!b.meta.hasAbilities) return []
  const rec = speciesRecord(gen, speciesId)
  if (!rec) return []
  const all = [...rec.abilities, ...(rec.hiddenAbility ? [rec.hiddenAbility] : [])]
  return [...new Set(all)].filter((id) => id && b.kinds.abilities.byId.has(id))
}

export function blankSet(gen: DataGenId, speciesId: string): SavedSetLike {
  const meta = getLib().bridge.GEN_META[gen]
  const abilityId = legalAbilities(gen, speciesId)[0]
  return {
    speciesId,
    level: 50,
    nature: 'Serious',
    moveIds: [],
    evs: emptySpread(0),
    ivs: emptySpread(31),
    ...(meta.usesStatPoints ? { statPoints: emptySpread(0) } : {}),
    ...(abilityId ? { abilityId } : {}),
  }
}

/** Keep the move overrides aligned with the move list after the list was filtered. */
function filterMoves(
  set: SavedSetLike,
  keep: (id: string) => boolean,
): Pick<SavedSetLike, 'moveIds' | 'moveOverrides'> {
  const moveIds: string[] = []
  const overrides: (MoveOverride | undefined)[] = []
  set.moveIds.forEach((id, i) => {
    if (!keep(id)) return
    moveIds.push(id)
    overrides.push(set.moveOverrides?.[i])
  })
  return { moveIds, moveOverrides: overrides.some(Boolean) ? overrides : [] }
}

/** Switch species keeping what stays meaningful (spread, nature, item, learnable moves). */
export function changeSpecies(gen: DataGenId, set: SavedSetLike, speciesId: string): SavedSetLike {
  const { bridge } = getLib()
  const pool = bridge.movesForSpecies(gen, speciesId)
  const legal = new Set(pool.moveIds)
  const abilities = legalAbilities(gen, speciesId)
  const next: SavedSetLike = {
    ...set,
    ...filterMoves(set, (id) => !pool.learnsetReliable || legal.has(id)),
    speciesId,
  }
  const ability = abilities.includes(set.abilityId ?? '') ? set.abilityId : abilities[0]
  if (ability) next.abilityId = ability
  else delete next.abilityId
  if (!bridge.GEN_META[gen].hasDynamax) {
    delete next.dynamax
    delete next.gmax
  }
  return next
}

/** Adapt a build to another generation; `undefined` when the species does not exist there. */
export function sanitizeSet(
  from: BridgeGenMeta,
  to: DataGenId,
  set: SavedSetLike,
): SavedSetLike | undefined {
  const { bridge } = getLib()
  const b = bridge.getBridge(to)
  const meta = b.meta
  if (!b.kinds.species.byId.has(set.speciesId)) return undefined
  const pool = bridge.movesForSpecies(to, set.speciesId)
  const legalMoves = new Set(pool.moveIds)
  const next: SavedSetLike = {
    ...set,
    ...filterMoves(set, (id) => b.kinds.moves.byId.has(id) && legalMoves.has(id)),
  }
  next.moveOverrides = (next.moveOverrides ?? []).map((o) => {
    if (!o) return o
    const copy = { ...o }
    if (!meta.hasZMoves) delete copy.z
    if (to !== 'za') delete copy.plus
    return copy
  })

  const abilities = legalAbilities(to, set.speciesId)
  if (meta.hasAbilities && abilities.length) {
    next.abilityId = abilities.includes(set.abilityId ?? '') ? set.abilityId! : abilities[0]!
  } else delete next.abilityId
  if (!meta.hasItems || (set.itemId && !b.kinds.items.byId.has(set.itemId))) delete next.itemId
  if (!meta.hasTera) {
    delete next.teraType
    delete next.terastallized
  }
  if (!meta.hasDynamax) {
    delete next.dynamax
    delete next.gmax
  }
  if (meta.engineGen < 3) next.nature = 'Serious'

  // Investment is not comparable across systems, so it is reset (the nature is kept):
  //  - Champions Stat Points <-> EVs: both start from 0.
  //  - Let's Go Awakening Values <-> EVs: an AV is not an EV (no /4, no 510 cap), so EVs/AVs are
  //    reset instead of being reinterpreted. The AV cap (200) is enforced for same-system builds.
  //  - Leaving gen 1-2: DVs are stored as IV = 2 * DV; they would otherwise become odd low IVs,
  //    so the IVs go back to 31.
  const awakening = meta.engineGen === 7.5
  if (
    from.usesStatPoints !== meta.usesStatPoints ||
    (from.engineGen === 7.5) !== awakening ||
    meta.engineGen <= 2
  ) {
    next.evs = emptySpread(0)
  }
  if (from.usesStatPoints !== meta.usesStatPoints) {
    if (meta.usesStatPoints) next.statPoints = emptySpread(0)
    else delete next.statPoints
  }
  if (from.engineGen <= 2 && meta.engineGen > 2) next.ivs = emptySpread(31)
  if (awakening) {
    next.evs = Object.fromEntries(
      Object.entries(next.evs ?? {}).map(([k, v]) => [k, Math.min(LIMITS.maxAv, v)]),
    ) as StatSpread
  }
  return next
}

// ---------------------------------------------------------------------------------------------
// Stat investment
// ---------------------------------------------------------------------------------------------

export interface StatLimits {
  system: 'dvs' | 'evs-ivs' | 'avs' | 'stat-points'
  /** Per stat maximum of the investment value (DV 15, EV 252, AV 200, SP 32). */
  max: number
  /** Total cap of the investment, when the generation has one. */
  total?: number
  step: number
}

export function statLimits(meta: BridgeGenMeta): StatLimits {
  if (meta.usesStatPoints) return { system: 'stat-points', max: 32, total: 66, step: 1 }
  if (meta.engineGen <= 2) return { system: 'dvs', max: 15, step: 1 }
  if (meta.engineGen === 7.5) return { system: 'avs', max: 200, step: 1 }
  return { system: 'evs-ivs', max: 252, total: 510, step: 4 }
}

export function investmentOf(meta: BridgeGenMeta, set: SavedSetLike): StatSpread {
  if (meta.usesStatPoints) return set.statPoints ?? emptySpread(0)
  if (meta.engineGen <= 2) {
    const iv = { ...emptySpread(31), ...set.ivs }
    return Object.fromEntries(
      STAT_ORDER.map((k) => [k, Math.floor((iv[k] ?? 31) / 2)]),
    ) as StatSpread
  }
  return { ...emptySpread(0), ...set.evs }
}

export function investmentTotal(spread: StatSpread): number {
  return STAT_ORDER.reduce((n, k) => n + spread[k], 0)
}

/** Sets one stat's investment, enforcing the per-stat and total limits. */
export function setInvestment(
  meta: BridgeGenMeta,
  set: SavedSetLike,
  stat: StatKey,
  value: number,
): SavedSetLike {
  const lim = statLimits(meta)
  const cur = investmentOf(meta, set)
  let v = Math.max(0, Math.min(lim.max, Math.round(Number.isFinite(value) ? value : 0)))
  if (lim.total !== undefined) {
    const others = investmentTotal(cur) - cur[stat]
    v = Math.min(v, Math.max(0, lim.total - others))
  }
  if (lim.system === 'stat-points') return { ...set, statPoints: { ...cur, [stat]: v } }
  if (lim.system === 'dvs') {
    // DVs live in the IV fields (iv = 2 * dv; the bridge derives dv = floor(iv / 2)).
    return { ...set, ivs: { ...emptySpread(31), ...set.ivs, [stat]: v * 2 } }
  }
  return { ...set, evs: { ...cur, [stat]: v } }
}

export function setIv(set: SavedSetLike, stat: StatKey, value: number): SavedSetLike {
  const v = Math.max(0, Math.min(31, Math.round(Number.isFinite(value) ? value : 0)))
  return { ...set, ivs: { ...emptySpread(31), ...set.ivs, [stat]: v } }
}

/** Standard 25 natures: [plus, minus] (neutral natures have none). */
export const NATURES: Record<string, [StatKey, StatKey] | undefined> = {
  Hardy: undefined,
  Lonely: ['atk', 'def'],
  Brave: ['atk', 'spe'],
  Adamant: ['atk', 'spa'],
  Naughty: ['atk', 'spd'],
  Bold: ['def', 'atk'],
  Docile: undefined,
  Relaxed: ['def', 'spe'],
  Impish: ['def', 'spa'],
  Lax: ['def', 'spd'],
  Timid: ['spe', 'atk'],
  Hasty: ['spe', 'def'],
  Serious: undefined,
  Jolly: ['spe', 'spa'],
  Naive: ['spe', 'spd'],
  Modest: ['spa', 'atk'],
  Mild: ['spa', 'def'],
  Quiet: ['spa', 'spe'],
  Bashful: undefined,
  Rash: ['spa', 'spd'],
  Calm: ['spd', 'atk'],
  Gentle: ['spd', 'def'],
  Sassy: ['spd', 'spe'],
  Careful: ['spd', 'spa'],
  Quirky: undefined,
}

/**
 * Final stats as computed by the engine itself (Hidden Power IV rewriting, Dynamax HP, gen 1-2
 * rounding included). `undefined` while the engine of the generation is not loaded.
 */
export function engineStats(gen: DataGenId, set: SavedSetLike): FinalStats | undefined {
  try {
    const { bridge, engine } = getLib()
    const { input } = bridge.toEngineInputDetailed(gen, set, {
      speciesId: set.speciesId,
      moveIds: [],
    })
    return engine.calculate(input).attackerStats
  } catch {
    return undefined
  }
}

/** Fallback estimate of the final stats like NCP's calcHP/calcStat of the generation (stat_data.js). */
export function computeStats(
  meta: BridgeGenMeta,
  base: StatTuple,
  set: SavedSetLike,
): Record<StatKey, number> {
  const g = meta.engineGen
  const level = meta.usesStatPoints ? 50 : (set.level ?? 50)
  const inv = investmentOf(meta, set)
  const iv = { ...emptySpread(31), ...set.ivs }
  const [bhp, batk, bdef, bspa, bspd, bspe] = base
  const bases: Record<StatKey, number> = {
    hp: bhp,
    atk: batk,
    def: bdef,
    spa: bspa,
    spd: g === 1 ? bspa : bspd,
    spe: bspe,
  }
  const out = {} as Record<StatKey, number>
  const nat = g >= 3 ? own(NATURES, set.nature ?? 'Serious') : undefined
  const natMod = (s: StatKey) => (nat?.[0] === s ? 1.1 : nat?.[1] === s ? 0.9 : 1)

  if (g <= 2) {
    const dv = (k: StatKey) => inv[k]
    const hpDv =
      ((dv('atk') & 1) << 3) | ((dv('def') & 1) << 2) | ((dv('spe') & 1) << 1) | (dv('spa') & 1)
    for (const s of STAT_ORDER) {
      const d = s === 'hp' ? hpDv : s === 'spd' ? dv('spa') : dv(s)
      const core = Math.floor((((bases[s] ?? 0) + d) * 2 + 63) * (level / 100))
      out[s] = s === 'hp' ? core + level + 10 : core + 5
    }
    return out
  }
  for (const s of STAT_ORDER) {
    const b = bases[s]
    const n = inv[s]
    if (s === 'hp') {
      if (b === 1) out.hp = 1
      else if (meta.usesStatPoints) out.hp = Math.floor((b * 2 + 31) * 0.5) + 60 + n
      else if (g === 7.5) out.hp = Math.floor(((b * 2 + iv.hp) * level) / 100) + level + 10 + n
      else out.hp = Math.floor(((b * 2 + iv.hp + Math.floor(n / 4)) * level) / 100) + level + 10
      continue
    }
    const m = natMod(s)
    if (meta.usesStatPoints) {
      out[s] = Math.floor((Math.floor((b * 2 + 31) * 0.5) + 5 + n) * m)
    } else if (g === 7.5) {
      const friend = 1 + Math.floor((10 * 70) / 255) / 100
      out[s] = Math.floor((Math.floor(((b * 2 + iv[s]) * level) / 100) + 5) * m * friend) + n
    } else {
      out[s] = Math.floor((Math.floor(((b * 2 + iv[s] + Math.floor(n / 4)) * level) / 100) + 5) * m)
    }
  }
  return out
}

/** Max hits of multi-hit moves (Showdown ids); the engine offers 2..max. */
export const MULTI_HIT_MAX: Record<string, number> = {
  doublehit: 2,
  doublekick: 2,
  doubleironbash: 2,
  doubleslap: 5,
  dualchop: 2,
  dualwingbeat: 2,
  dragondarts: 2,
  twinbeam: 2,
  geargrind: 2,
  bonemerang: 2,
  twineedle: 2,
  armthrust: 5,
  barrage: 5,
  bonerush: 5,
  bulletseed: 5,
  cometpunch: 5,
  furyattack: 5,
  furyswipes: 5,
  iciclespear: 5,
  pinmissile: 5,
  rockblast: 5,
  scaleshot: 5,
  spikecannon: 5,
  tailslap: 5,
  watershuriken: 5,
  tripleaxel: 3,
  triplekick: 3,
  tripledive: 3,
  surgingstrikes: 3,
  populationbomb: 10,
}

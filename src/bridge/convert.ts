/**
 * SavedSet-like (Showdown ids) -> engine CalcInput, and common set -> SavedSet-like.
 *
 * natDex decision: `natDex` is false unless something the calculation uses (species, move, item
 * or ability of either Pokemon) exists only in NCP's National Dex tables of gens 8/9/10; then it
 * is true. This keeps the default (restricted) dex's data whenever possible and still never
 * fails on e.g. a Mega or old Pokemon in SV/Champions. `opts.natDex` overrides.
 */
import type { CommonSet } from '../data/types'
import type { BoostMap, CalcInput, MoveInput, PokemonInput, StatMap } from '../engine/types'
import type { SetBody, StatSpread } from '../storage/types'
import { emptySpread } from '../storage/types'
import { fieldFromAbilities, statusFromItem, typeFromItem } from './auto'
import {
  hiddenPowerDvs,
  hiddenPowerIvs,
  hiddenPowerTypeOfDvs,
  hiddenPowerTypeOfIvs,
  hiddenPowerTypeOfMove,
} from './hidden-power'
import { getBridge, isAlias, isGmax, isNatDexOnly, type Bridge } from './maps'
import {
  BridgeError,
  type DataGenId,
  type EntityKind,
  type FieldInput,
  type MapEntry,
  type MoveOverride,
  type SavedSetLike,
  type ToEngineOptions,
} from './types'

const STAT_KEYS = [
  ['hp', 'hp'],
  ['atk', 'at'],
  ['def', 'df'],
  ['spa', 'sa'],
  ['spd', 'sd'],
  ['spe', 'sp'],
] as const

/** Gen 1 has a single Special stat (`sl`), taken from `spa`. */
function toStatMap(
  spread: Partial<StatSpread> | undefined,
  engineGen: number,
  transform: (n: number) => number = (n) => n,
): StatMap | undefined {
  if (!spread) return undefined
  const out: StatMap = {}
  for (const [sd, ncp] of STAT_KEYS) {
    const v = spread[sd]
    if (v !== undefined) out[ncp] = transform(v)
  }
  if (engineGen === 1 && spread.spa !== undefined) out.sl = transform(spread.spa)
  return out
}

function toBoosts(boosts: SavedSetLike['boosts'], engineGen: number): BoostMap | undefined {
  if (!boosts) return undefined
  const out: BoostMap = {}
  if (boosts.atk !== undefined) out.at = boosts.atk
  if (boosts.def !== undefined) out.df = boosts.def
  if (boosts.spa !== undefined) out.sa = boosts.spa
  if (boosts.spd !== undefined) out.sd = boosts.spd
  if (boosts.spe !== undefined) out.sp = boosts.spe
  if (engineGen === 1 && boosts.spa !== undefined) out.sl = boosts.spa
  return out
}

const dvOf = (iv: number) => Math.max(0, Math.min(15, Math.floor(iv / 2)))
const MAX_AV = 200

interface Resolved {
  entry: MapEntry
  name: string
}

function resolve(
  b: Bridge,
  kind: EntityKind,
  id: string | undefined,
  warnings: string[],
  label: string,
): Resolved | undefined {
  if (!id) return undefined
  const entry = b.kinds[kind].byId.get(id)
  if (!entry) {
    warnings.push(`${label}: "${id}" is unknown to the NCP engine in ${b.gen}`)
    return undefined
  }
  return { entry, name: entry[1] }
}

export interface ToEngineResult {
  input: CalcInput
  /** Non-fatal problems (unknown move/item/ability dropped). */
  warnings: string[]
  /** The natDex value that was used. */
  natDex: boolean
}

interface Built {
  poke: PokemonInput
  speciesName: string
  abilityId: string | undefined
  itemId: string | undefined
  usesNatDex: boolean
}

function buildPokemon(
  b: Bridge,
  set: SavedSetLike,
  opts: ToEngineOptions,
  warnings: string[],
  label: string,
): Built {
  const { meta } = b
  const engineGen = meta.engineGen
  const species = resolve(b, 'species', set.speciesId, [], label)
  if (!species) {
    throw new BridgeError(
      `${label}: species "${set.speciesId}" is unknown to the NCP engine in ${b.gen}`,
    )
  }
  let usesNatDex = isNatDexOnly(species.entry)
  const poke: PokemonInput = { species: species.name, moves: [] }

  // Formes NCP folds into another entry: keep the Showdown forme's types; Gigantamax species
  // are the base species with the gmax toggle.
  if (isAlias(species.entry)) {
    const rec = b.data.species.find((r) => r.id === set.speciesId)
    if (rec)
      poke.types = [rec.types[0] ?? 'Normal', ...(rec.types[1] ? [rec.types[1]] : [])] as [
        string,
        string?,
      ]
  }
  if (isGmax(species.entry)) {
    poke.gmax = true
    poke.dynamax = true
  }

  if (!meta.usesStatPoints) poke.level = set.level ?? 50
  if (set.nature && engineGen >= 3) poke.nature = set.nature

  // ability
  let abilityId: string | undefined
  if (meta.hasAbilities && set.abilityId) {
    const ab = resolve(b, 'abilities', set.abilityId, warnings, `${label} ability`)
    if (ab) {
      poke.ability = ab.name
      abilityId = set.abilityId
      if (isNatDexOnly(ab.entry)) usesNatDex = true
    }
  }
  // item
  let itemId: string | undefined
  if (meta.hasItems && set.itemId) {
    const it = resolve(b, 'items', set.itemId, warnings, `${label} item`)
    if (it) {
      poke.item = it.name
      itemId = set.itemId
      if (isNatDexOnly(it.entry)) usesNatDex = true
    }
  }

  // moves
  const hasOverrides = set.moveOverrides ?? []
  const moves: (string | MoveInput)[] = []
  const moveNames: string[] = []
  set.moveIds.slice(0, 4).forEach((id, i) => {
    const m = resolve(b, 'moves', id, warnings, `${label} move`)
    if (!m) return
    if (isNatDexOnly(m.entry)) usesNatDex = true
    moveNames.push(m.name)
    const ov: MoveOverride | undefined = hasOverrides[i]
    moves.push(ov ? { name: m.name, ...ov } : m.name)
  })
  poke.moves = moves

  // stats
  if (meta.usesStatPoints) {
    const sp = set.statPoints ?? (looksLikeStatPoints(set.evs) ? set.evs : undefined)
    const map = toStatMap(sp, engineGen)
    if (map) poke.statPoints = map
  } else if (engineGen <= 2) {
    const dvs = toStatMap(set.ivs, engineGen, dvOf)
    if (dvs) poke.dvs = dvs
  } else if (engineGen === 7.5) {
    const avs = toStatMap(set.evs, engineGen, (n) => Math.min(MAX_AV, n))
    if (avs) poke.avs = avs
    const ivs = toStatMap(set.ivs, engineGen)
    if (ivs) poke.ivs = ivs
  } else {
    const evs = toStatMap(set.evs, engineGen)
    if (evs) poke.evs = evs
    const ivs = toStatMap(set.ivs, engineGen)
    if (ivs) poke.ivs = ivs
  }

  // Hidden Power IVs / DVs (gens 2-6)
  if (opts.autoHiddenPower !== false && engineGen >= 2 && engineGen <= 6) {
    const hp = moveNames.map(hiddenPowerTypeOfMove).find((t) => t !== undefined)
    if (hp) {
      if (engineGen === 2) {
        const cur = poke.dvs ?? {}
        const atk = cur.at ?? 15
        const def = cur.df ?? 15
        if (hiddenPowerTypeOfDvs(atk, def) !== hp) {
          const dv = hiddenPowerDvs(hp)
          poke.dvs = { ...cur, at: dv.atk, df: dv.def }
        }
      } else {
        const ivs: StatSpread = { ...emptySpread(31), ...set.ivs }
        if (hiddenPowerTypeOfIvs(ivs) !== hp) {
          poke.ivs = toStatMap(hiddenPowerIvs(hp), engineGen) as StatMap
        }
      }
    }
  }

  // state
  const status = opts.autoStatus !== false ? (statusFromItem(itemId) ?? set.status) : set.status
  if (status !== undefined) poke.status = status
  const boosts = toBoosts(set.boosts, engineGen)
  if (boosts) poke.boosts = boosts
  if (set.percentHP !== undefined) poke.percentHP = set.percentHP
  if (set.curHP !== undefined) poke.curHP = set.curHP
  if (set.abilityOn !== undefined) poke.abilityOn = set.abilityOn
  if (meta.hasTera && set.teraType) poke.teraType = set.teraType
  if (set.terastallized !== undefined) poke.terastallized = set.terastallized
  if (set.dynamax !== undefined) poke.dynamax = set.dynamax
  if (set.gmax !== undefined) poke.gmax = set.gmax

  // Arceus / Silvally types. Showdown type formes (Arceus-Fire) keep their forme type unless the
  // item (plate / memory / Z crystal) says otherwise, like NCP's item change handler.
  if (opts.autoTypes !== false) {
    const t = typeFromItem(species.name, abilityId, itemId)
    const itemGivesType = /(plate|memory|iumz)$/.test(itemId ?? '')
    if (t && (poke.types === undefined || itemGivesType)) poke.types = [t]
  }

  return { poke, speciesName: species.name, abilityId, itemId, usesNatDex }
}

/** SavedSet.evs of champions common sets may hold Stat Points (<= 32 each, <= 66 total). */
function looksLikeStatPoints(evs: Partial<StatSpread> | undefined): boolean {
  if (!evs) return false
  const v = Object.values(evs)
  return v.every((n) => n <= 32) && v.reduce((a, n) => a + n, 0) <= 66
}

/**
 * Convert two sets (Showdown ids) plus a field to an engine `CalcInput`. Requires
 * `await prepareBridge(gen)` once. Throws `BridgeError` for unknown species.
 */
export function toEngineInputDetailed(
  gen: DataGenId,
  attacker: SavedSetLike,
  defender: SavedSetLike,
  field: FieldInput = {},
  opts: ToEngineOptions = {},
): ToEngineResult {
  const b = getBridge(gen)
  const warnings: string[] = []
  const a = buildPokemon(b, attacker, opts, warnings, 'attacker')
  const d = buildPokemon(b, defender, opts, warnings, 'defender')

  const f: FieldInput = { ...field }
  f.format ??= b.meta.defaultFormat === 'singles' ? 'Singles' : 'Doubles'
  if (opts.autoField !== false && b.meta.hasAbilities) {
    const auto = fieldFromAbilities(
      b.meta.engineGen,
      { abilityId: a.abilityId, abilityOn: a.poke.abilityOn },
      { abilityId: d.abilityId, abilityOn: d.poke.abilityOn },
      opts.abilityPriority,
    )
    if (f.weather === undefined && auto.weather !== undefined) f.weather = auto.weather
    if (f.terrain === undefined && auto.terrain !== undefined) f.terrain = auto.terrain
  }

  const natDex =
    b.meta.hasNatDex &&
    (opts.natDex === undefined || opts.natDex === 'auto'
      ? a.usesNatDex || d.usesNatDex
      : opts.natDex)

  const input: CalcInput = {
    gen: b.meta.engineGen,
    attacker: a.poke,
    defender: d.poke,
    field: f,
  }
  if (natDex) input.natDex = true
  if (opts.vgcLevels !== undefined) input.vgcLevels = opts.vgcLevels
  if (opts.resultDisplay !== undefined) input.resultDisplay = opts.resultDisplay
  return { input, warnings, natDex }
}

/** Like `toEngineInputDetailed` but returns only the `CalcInput`. */
export function toEngineInput(
  gen: DataGenId,
  attacker: SavedSetLike,
  defender: SavedSetLike,
  field: FieldInput = {},
  opts: ToEngineOptions = {},
): CalcInput {
  return toEngineInputDetailed(gen, attacker, defender, field, opts).input
}

/**
 * Showdown-id common set (src/data sets) -> set body. Champions: the common set stores Stat Points
 * in `evs`; they move to `statPoints` and `evs` becomes all zeros (the SavedSet convention).
 */
export function fromCommonSet(gen: DataGenId, cs: CommonSet): SetBody {
  const champions = gen === 'champions'
  const body: SetBody = {
    level: 50,
    nature: cs.nature,
    abilityId: cs.ability,
    itemId: cs.item,
    moveIds: [...cs.moves],
    evs: champions ? emptySpread(0) : { ...cs.evs },
    ivs: emptySpread(31),
  }
  if (champions) body.statPoints = { ...cs.evs }
  if (cs.teraType) body.teraType = cs.teraType
  return body
}

/** `fromCommonSet` plus the species: a complete `SavedSetLike`. */
export function commonSetToSet(gen: DataGenId, speciesId: string, cs: CommonSet): SavedSetLike {
  return { speciesId, ...fromCommonSet(gen, cs) }
}

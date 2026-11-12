import type { BridgeGenMeta } from '../bridge/gens'
import type { FieldInput, SideInput, Terrain, Weather } from '../engine/types'
import type { Format } from '../storage/types'

/**
 * Field as edited in the UI. `weather`/`terrain` are `undefined` for "auto" (derived from the
 * Pokemon's abilities like the original calculator), `''` for "none".
 */
export interface UiField {
  weather?: Weather
  terrain?: Terrain
  gravity: boolean
  neutralizingGas: boolean
  auras: { fairy: boolean; dark: boolean; break: boolean }
  ruin: { tablets: boolean; vessel: boolean; sword: boolean; beads: boolean }
  mine: SideInput
  opp: SideInput
}

export const emptyField = (): UiField => ({
  gravity: false,
  neutralizingGas: false,
  auras: { fairy: false, dark: false, break: false },
  ruin: { tablets: false, vessel: false, sword: false, beads: false },
  mine: {},
  opp: {},
})

export type SideFlag = Exclude<keyof SideInput, 'spikes'>

export interface SideOption {
  key: SideFlag
  /** First engine generation that has it. */
  min: number
  /** Last engine generation that has it. */
  max?: number
  doublesOnly?: boolean
  needsAbilities?: boolean
  group: 'common' | 'more'
}

export const SIDE_OPTIONS: readonly SideOption[] = [
  { key: 'reflect', min: 1, group: 'common' },
  { key: 'lightScreen', min: 1, group: 'common' },
  { key: 'auroraVeil', min: 7, group: 'common' },
  { key: 'helpingHand', min: 3, doublesOnly: true, group: 'common' },
  { key: 'friendGuard', min: 5, doublesOnly: true, needsAbilities: true, group: 'common' },
  { key: 'tailwind', min: 4, group: 'common' },
  { key: 'protect', min: 2, group: 'common' },
  { key: 'stealthRock', min: 4, group: 'common' },
  { key: 'battery', min: 7, doublesOnly: true, needsAbilities: true, group: 'common' },
  { key: 'powerSpot', min: 8, doublesOnly: true, needsAbilities: true, group: 'common' },
  { key: 'steelySpirit', min: 8, doublesOnly: true, needsAbilities: true, group: 'common' },
  { key: 'flowerGift', min: 4, doublesOnly: true, needsAbilities: true, group: 'common' },
  { key: 'foresight', min: 2, group: 'more' },
  { key: 'gMaxField', min: 8, max: 8, group: 'more' },
  { key: 'saltCure', min: 9, group: 'more' },
  { key: 'swamp', min: 5, doublesOnly: true, group: 'more' },
  { key: 'seaFire', min: 5, doublesOnly: true, group: 'more' },
  { key: 'charge', min: 3, group: 'more' },
  { key: 'leechSeed', min: 1, group: 'more' },
  { key: 'ingrain', min: 3, group: 'more' },
  { key: 'curse', min: 2, group: 'more' },
  { key: 'binding', min: 1, group: 'more' },
  { key: 'aquaRing', min: 4, group: 'more' },
  { key: 'nightmare', min: 2, group: 'more' },
  { key: 'weaknessPolicy', min: 5, needsAbilities: true, group: 'more' },
  { key: 'evoboost', min: 7, max: 7, group: 'more' },
  { key: 'geomancy', min: 6, max: 7, group: 'more' },
  { key: 'commander', min: 9, doublesOnly: true, needsAbilities: true, group: 'more' },
  { key: 'redItem', min: 9.5, max: 9.5, group: 'more' },
  { key: 'blueItem', min: 9.5, max: 9.5, group: 'more' },
]

function available(o: SideOption, meta: BridgeGenMeta, format: Format): boolean {
  const g = meta.engineGen
  if (g < o.min || (o.max !== undefined && g > o.max)) return false
  if (o.doublesOnly && format !== 'doubles') return false
  if (o.needsAbilities && !meta.hasAbilities) return false
  return true
}

export function sideOptions(meta: BridgeGenMeta, format: Format) {
  const list = SIDE_OPTIONS.filter((o) => available(o, meta, format))
  return {
    common: list.filter((o) => o.group === 'common'),
    more: list.filter((o) => o.group === 'more'),
    spikes: meta.engineGen >= 2,
    /** Gen 2 and Z-A know only a single "Spikes" toggle. */
    spikesToggleOnly: meta.engineGen === 2 || meta.engineGen === 9.5,
  }
}

export function weatherOptions(meta: BridgeGenMeta): Weather[] {
  const g = meta.engineGen
  if (g < 2) return []
  const out: Weather[] = ['Sun', 'Rain', 'Sand']
  if (g >= 3 && g <= 8) out.push('Hail')
  if (g >= 9) out.push('Snow')
  if (g >= 6) out.push('Harsh Sun', 'Heavy Rain', 'Strong Winds')
  return out
}

export function terrainOptions(meta: BridgeGenMeta): Terrain[] {
  const g = meta.engineGen
  if (g < 6) return []
  return g >= 7 ? ['Electric', 'Grassy', 'Misty', 'Psychic'] : ['Electric', 'Grassy', 'Misty']
}

export function fieldSupport(meta: BridgeGenMeta) {
  const g = meta.engineGen
  return {
    gravity: g >= 4,
    neutralizingGas: g >= 8 && meta.hasAbilities,
    auras: g >= 6 && meta.hasAbilities,
    ruin: g >= 9 && meta.hasAbilities,
  }
}

/** Drops everything the generation does not know (used after a generation switch). */
export function sanitizeField(meta: BridgeGenMeta, f: UiField, format: Format): UiField {
  const sup = fieldSupport(meta)
  const side = (s: SideInput): SideInput => {
    const out: SideInput = {}
    const o = sideOptions(meta, format)
    for (const opt of [...o.common, ...o.more]) if (s[opt.key]) out[opt.key] = true
    if (o.spikes && s.spikes) out.spikes = o.spikesToggleOnly ? 1 : s.spikes
    return out
  }
  const next = emptyField()
  if (f.weather !== undefined && (f.weather === '' || weatherOptions(meta).includes(f.weather)))
    next.weather = f.weather
  if (f.terrain !== undefined && (f.terrain === '' || terrainOptions(meta).includes(f.terrain)))
    next.terrain = f.terrain
  if (sup.gravity) next.gravity = f.gravity
  if (sup.neutralizingGas) next.neutralizingGas = f.neutralizingGas
  if (sup.auras) next.auras = { ...f.auras }
  if (sup.ruin) next.ruin = { ...f.ruin }
  next.mine = side(f.mine)
  next.opp = side(f.opp)
  return next
}

const compact = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as Partial<T>

export function toFieldInput(f: UiField, format: Format): FieldInput {
  const out: FieldInput = {
    format: format === 'singles' ? 'Singles' : 'Doubles',
    attackerSide: compact(f.mine),
    defenderSide: compact(f.opp),
  }
  if (f.weather !== undefined) out.weather = f.weather
  if (f.terrain !== undefined) out.terrain = f.terrain
  if (f.gravity) out.gravity = true
  if (f.neutralizingGas) out.neutralizingGas = true
  const auras = compact(f.auras)
  if (Object.keys(auras).length) out.auras = auras
  const ruin = compact(f.ruin)
  if (Object.keys(ruin).length) out.ruin = ruin
  return out
}

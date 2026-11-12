/**
 * Hidden Power IV handling. NCP (ap_calc.js `hiddenPowerCheck`) rewrites the IV fields when a
 * typed `Hidden Power <Type>` move is selected in gens 2-6 and the current IVs do not already
 * produce that type. The engine leaves that to the caller; these helpers replicate it.
 *
 * The replacement IVs are the standard Smogon/Showdown "max stats" Hidden Power spreads (NCP's
 * `defaultHiddenPowerSD` table lives in an unvendored file). Every value is 30 or 31, so the
 * second-least-significant bit used for the gen 3-5 base power (70) is set.
 */
import type { StatSpread } from '../storage/types'

/** Type order of Hidden Power (index = floor(sum * 15 / 63)). */
export const HP_TYPE_ORDER = [
  'Fighting',
  'Flying',
  'Poison',
  'Ground',
  'Rock',
  'Bug',
  'Ghost',
  'Steel',
  'Fire',
  'Water',
  'Grass',
  'Electric',
  'Psychic',
  'Ice',
  'Dragon',
  'Dark',
] as const
export type HiddenPowerType = (typeof HP_TYPE_ORDER)[number]

type StatKey = keyof StatSpread

/** Stats that are 30 instead of 31 for each type (standard spreads). */
const THIRTY: Record<HiddenPowerType, StatKey[]> = {
  Fighting: ['def', 'spa', 'spd', 'spe'],
  Flying: ['hp', 'atk', 'def', 'spa', 'spd'],
  Poison: ['def', 'spa', 'spd'],
  Ground: ['spa', 'spd'],
  Rock: ['def', 'spd', 'spe'],
  Bug: ['atk', 'def', 'spd'],
  Ghost: ['def', 'spd'],
  Steel: ['spd'],
  Fire: ['atk', 'spa', 'spe'],
  Water: ['atk', 'def', 'spa'],
  Grass: ['atk', 'spa'],
  Electric: ['spa'],
  Psychic: ['atk', 'spe'],
  Ice: ['atk', 'def'],
  Dragon: ['atk'],
  Dark: [],
}

export function isHiddenPowerType(t: string): t is HiddenPowerType {
  return (HP_TYPE_ORDER as readonly string[]).includes(t)
}

/** Standard IVs for a Hidden Power type (gens 3-6). */
export function hiddenPowerIvs(type: HiddenPowerType): StatSpread {
  const ivs: StatSpread = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }
  for (const s of THIRTY[type]) ivs[s] = 30
  return ivs
}

/** Hidden Power type produced by a set of IVs (gens 3-6 formula, as NCP's customHiddenPower). */
export function hiddenPowerTypeOfIvs(ivs: StatSpread): HiddenPowerType {
  const sum =
    (ivs.hp & 1) +
    (ivs.atk & 1) * 2 +
    (ivs.def & 1) * 4 +
    (ivs.spe & 1) * 8 +
    (ivs.spa & 1) * 16 +
    (ivs.spd & 1) * 32
  return HP_TYPE_ORDER[Math.floor((sum * 15) / 63)] as HiddenPowerType
}

/** Gen 2: type from the Attack and Defense DVs. */
export function hiddenPowerTypeOfDvs(atk: number, def: number): HiddenPowerType {
  return HP_TYPE_ORDER[4 * (atk % 4) + (def % 4)] as HiddenPowerType
}

/** Gen 2 DVs (Attack, Defense) producing `type` with the highest possible Attack. */
export function hiddenPowerDvs(type: HiddenPowerType): { atk: number; def: number } {
  const i = HP_TYPE_ORDER.indexOf(type)
  return { atk: 12 + Math.floor(i / 4), def: 12 + (i % 4) }
}

/** `Hidden Power Fire` -> `Fire` (NCP names), undefined for other moves and the untyped move. */
export function hiddenPowerTypeOfMove(ncpMoveName: string): HiddenPowerType | undefined {
  const m = /^Hidden Power (\w+)$/.exec(ncpMoveName)
  const t = m?.[1]
  return t && isHiddenPowerType(t) ? t : undefined
}

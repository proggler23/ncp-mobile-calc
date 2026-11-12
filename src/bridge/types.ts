import type { GenId as EngineGenId } from '../engine/types'
import type { GenId as DataGenId } from '../data/types'
import type { FieldInput, Status } from '../engine/types'
import type { StatSpread, SavedSet } from '../storage/types'

export type { EngineGenId, DataGenId }

/** Entity kinds that have an NCP <-> Showdown name map. */
export type EntityKind = 'species' | 'moves' | 'items' | 'abilities'

/** Entry flags (bit set). */
export const FLAG_NATDEX_ONLY = 1
/** NCP knows the entity but no Showdown record matched; `id` is the normalized NCP name. */
export const FLAG_NCP_ONLY = 2
/** Showdown Gigantamax species id that maps to the NCP base species + `gmax` flag. */
export const FLAG_GMAX = 4

/** One-way Showdown id -> NCP name alias (several Showdown ids share one NCP entity). */
export const FLAG_ALIAS = 16

/**
 * NCP entity known to Showdown only through another generation's data (typical for National Dex
 * entries). The entry then carries its own English / German display names.
 */
export const FLAG_FOREIGN = 8

/** `[bridgeId, ncpName, flags]`, plus `[en, de]` display names when `FLAG_FOREIGN` is set. */
export type MapEntry =
  | [id: string, ncp: string, flags: number]
  | [id: string, ncp: string, flags: number, en: string, de: string]

/** Content of `src/bridge/generated/<gen>.json`. */
export interface BridgeMapFile {
  gen: DataGenId
  engineGen: EngineGenId
  /** True when NCP offers a separate National Dex data set for this generation. */
  hasNatDex: boolean
  species: MapEntry[]
  moves: MapEntry[]
  items: MapEntry[]
  abilities: MapEntry[]
}

// ---------------------------------------------------------------------------------------------
// Set / option types of the runtime API
// ---------------------------------------------------------------------------------------------

export type BoostKey = 'atk' | 'def' | 'spa' | 'spd' | 'spe'

/** Per-move overrides applied on top of the move id (see engine `MoveInput`). */
export interface MoveOverride {
  bp?: number
  type?: string
  category?: 'Physical' | 'Special' | 'Status'
  crit?: boolean
  hits?: number
  double?: boolean
  /** Use the Z-Move version (gen 7). */
  z?: boolean
  plus?: boolean
  stellar?: boolean
  pledge?: string
  timesAffected?: number
  opponentMoveIndex?: number
}

/** Battle state that is not part of a saved build but needed for a calculation. */
export interface SetState {
  status?: Status
  boosts?: Partial<Record<BoostKey, number>>
  percentHP?: number
  curHP?: number
  abilityOn?: boolean
  terastallized?: boolean
  dynamax?: boolean
  gmax?: boolean
  /** Index-aligned with `moveIds`. */
  moveOverrides?: (MoveOverride | undefined)[]
}

/**
 * What the bridge needs of a build. A `SavedSet` satisfies it (Showdown ids); everything but
 * species and moves is optional.
 */
export type SavedSetLike = Pick<SavedSet, 'speciesId' | 'moveIds'> &
  Partial<Omit<SavedSet, 'uid' | 'gen' | 'speciesId' | 'moveIds'>> &
  SetState

export type { StatSpread, FieldInput }

export interface ToEngineOptions {
  /**
   * Use NCP's National Dex data set (gens 8, 9, 10). Default `'auto'`: false unless the species,
   * a move, the item or the ability of either set exists only in NCP's National Dex tables.
   */
  natDex?: boolean | 'auto'
  /** Derive weather/terrain from abilities when `field.weather`/`field.terrain` are undefined. Default true. */
  autoField?: boolean
  /** Flame Orb -> Burned, Toxic Orb -> Badly Poisoned. Default true. */
  autoStatus?: boolean
  /** Arceus plates / Z crystals and Silvally memories set the type. Default true. */
  autoTypes?: boolean
  /** Rewrite IVs/DVs for `Hidden Power <Type>` in gens 2-6. Default true. */
  autoHiddenPower?: boolean
  /** Whose ability wins when both set the same field kind. Default `'defender'`. */
  abilityPriority?: 'attacker' | 'defender'
  vgcLevels?: boolean
  resultDisplay?: 'SPs' | 'EVs' | 'raw'
}

export type PresetId = 'neutral' | 'physDef' | 'specDef' | 'physAtk' | 'specAtk' | 'common'

export class BridgeError extends Error {
  override name = 'BridgeError'
}

import type { GenId, Lang } from '../data/types'

export type { GenId, Lang }

export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const
export type StatKey = (typeof STAT_KEYS)[number]
export type StatSpread = Record<StatKey, number>

/** The 25 canonical (English) nature names; the only values the schema accepts. */
export const NATURE_NAMES = [
  'Hardy',
  'Lonely',
  'Brave',
  'Adamant',
  'Naughty',
  'Bold',
  'Docile',
  'Relaxed',
  'Impish',
  'Lax',
  'Timid',
  'Hasty',
  'Serious',
  'Jolly',
  'Naive',
  'Modest',
  'Mild',
  'Quiet',
  'Bashful',
  'Rash',
  'Calm',
  'Gentle',
  'Sassy',
  'Careful',
  'Quirky',
] as const

export type Gender = 'M' | 'F'
export type Format = 'singles' | 'doubles'

/** Hard limits applied to everything loaded from storage or imported. */
export const LIMITS = {
  maxTeams: 50,
  maxMembers: 6,
  maxMoves: 4,
  maxCustomSets: 1000,
  maxCustomSetsPerSpecies: 20,
  maxIdLength: 64,
  maxNameLength: 100,
  maxNotesLength: 2000,
  maxPasteBytes: 50 * 1024,
  maxBackupBytes: 5 * 1024 * 1024,
  maxEv: 252,
  maxEvTotal: 510,
  /** Let's Go (gen 7.5) Awakening Values: <= 200 per stat, no total cap. */
  maxAv: 200,
  maxStatPoint: 32,
  maxStatPointTotal: 66,
} as const

/**
 * One Pokemon build. Species/ability/item/move values are Showdown ids (see src/data).
 *
 * Champions (gen === 'champions'): `statPoints` is the authoritative spread (<=32 per stat, <=66
 * total) and `evs` is all zeros. For every other gen `statPoints` is absent and `evs` is used.
 */
export interface SavedSet {
  uid: string
  gen: GenId
  speciesId: string
  nickname?: string
  level: number
  /** English nature name, e.g. "Adamant" */
  nature: string
  abilityId?: string
  itemId?: string
  moveIds: string[]
  evs: StatSpread
  ivs: StatSpread
  statPoints?: StatSpread
  /** English type name, e.g. "Fire" or "Stellar" */
  teraType?: string
  gender?: Gender
  notes?: string
}

export interface Team {
  uid: string
  name: string
  gen: GenId
  members: SavedSet[]
  createdAt: number
  updatedAt: number
}

/** Set body of a custom set: a SavedSet without identity fields (those live on the CustomSet). */
export type SetBody = Omit<SavedSet, 'uid' | 'gen' | 'speciesId'>

/** A named, reusable set for one species in one gen. */
export interface CustomSet {
  uid: string
  name: string
  gen: GenId
  speciesId: string
  set: SetBody
  createdAt: number
  updatedAt: number
}

export interface Settings {
  lang: Lang
  gen: GenId
  activeTeamUid?: string
  format: Format
}

export const DEFAULT_SETTINGS: Settings = { lang: 'en', gen: 'champions', format: 'doubles' }

export function emptySpread(value: number): StatSpread {
  return { hp: value, atk: value, def: value, spa: value, spd: value, spe: value }
}

/** Persisted calculator state of one generation (both builds incl. battle state, and the field). */
export interface StoredMatchup {
  mine?: Record<string, unknown>
  opp?: Record<string, unknown>
  field?: Record<string, unknown>
  oppPreset?: string | null
  /** Team chip the `mine` build came from (only restored while that team is still active). */
  teamUid?: string
  mineTeamIndex?: number
  savedAt: number
}

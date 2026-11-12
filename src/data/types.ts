/** Stable generation / format ids. Each maps to one folder under src/data/generated/. */
export const GEN_IDS = [
  'rby',
  'gsc',
  'adv',
  'dpp',
  'bw',
  'xy',
  'sm',
  'lgpe',
  'swsh',
  'sv',
  'za',
  'champions',
] as const

export type GenId = (typeof GEN_IDS)[number]
export type Lang = 'en' | 'de'
export type StatTuple = [
  hp: number,
  atk: number,
  def: number,
  spa: number,
  spd: number,
  spe: number,
]
export type MoveCategory = 'Physical' | 'Special' | 'Status'

export interface SpeciesRecord {
  /** Showdown id (toID of the Showdown name, diacritics stripped) */
  id: string
  /** Showdown English display name */
  en: string
  de: string
  num: number
  types: string[]
  /** hp, atk, def, spa, spd, spe */
  bs: StatTuple
  /** Regular ability ids (slot 0, 1, special) */
  abilities: string[]
  hiddenAbility?: string
  /** Base species id when this is an alternate forme */
  base?: string
  /** Forme suffix as Showdown names it (e.g. "Wash", "Mega-X") */
  forme?: string
  /** Other forme ids of a base species that exist in this gen */
  formes?: string[]
  prevo?: string
  evos?: string[]
  /** Item id needed to hold for this forme (Mega stones, plates, ...) */
  requiredItem?: string
  isMega?: boolean
}

export interface MoveRecord {
  id: string
  en: string
  de: string
  type: string
  category: MoveCategory
  bp: number
}

export interface NamedRecord {
  id: string
  en: string
  de: string
}

/** [id, normalizedEn, normalizedDe]; normalizedDe is '' when identical to normalizedEn. */
export type SearchEntry = [id: string, en: string, de: string]

export interface SearchIndex {
  species: SearchEntry[]
  moves: SearchEntry[]
  items: SearchEntry[]
  abilities: SearchEntry[]
}

export interface GenMeta {
  gen: GenId
  label: string
  /** Where the entity data came from, e.g. "pokemon-showdown Dex.forGen(7)" or "pokemon-showdown npm mod \"gen7letsgo\"" */
  source: string
  /** Human-readable data gaps for this gen */
  gaps: string[]
  /** true when evs in sets/calcs are Champions Stat Points (66 total, max 32 per stat) */
  statPoints?: boolean
}

export interface DexFile {
  meta: GenMeta
  species: SpeciesRecord[]
  moves: MoveRecord[]
  items: NamedRecord[]
  abilities: NamedRecord[]
  search: SearchIndex
}

/** species id -> sorted move ids */
export type Learnsets = Record<string, string[]>

export interface EvSpread {
  hp: number
  atk: number
  def: number
  spa: number
  spd: number
  spe: number
}

export interface CommonSet {
  ability: string
  item: string
  nature: string
  /** EVs, or Stat Points when the gen is Champions */
  evs: EvSpread
  moves: string[]
  teraType?: string
  /** Share (percent) of this species' weighted spreads that used this exact spread */
  usagePct: number
  /** Percent of teams/players using the species in the source format (when known) */
  speciesUsagePct?: number
  source: string
  format: string
  /** Stats month, YYYY-MM */
  month: string
}

/** species id -> up to 3 sets */
export type SetsFile = Record<string, CommonSet[]>

/** Per-regulation changes to the generation's learnsets (species id -> move ids). */
export interface LearnsetDelta {
  add?: Record<string, string[]>
  remove?: Record<string, string[]>
}

/**
 * One regulation (legal pool) of a generation, see scripts/build-data/regulations.ts. 'No filter'
 * (`NO_REGULATION`) is synthetic and not part of the file.
 */
export interface RegulationRecord {
  id: string
  label: { en: string; de: string }
  /** Showdown format the pool was derived from (informational for manual entries) */
  showdownFormat?: string
  /** The regulation selected by default (exactly one per file) */
  default?: true
  /** 'showdown': derived from the pinned package; 'manual': hand-maintained manual.json */
  source: 'showdown' | 'manual'
  /** manual entries only: false = could not be verified against an authoritative source */
  verified?: boolean
  /** Legal species (incl. formes/Megas) as ids of this generation's dex */
  species: string[]
  items: string[]
  /** Only present when the regulation restricts moves beyond the learnsets (subset of the dex) */
  moves?: string[]
  learnsets?: LearnsetDelta
}

export interface RegulationsFile {
  gen: GenId
  regulations: RegulationRecord[]
}

/** Id of the synthetic "No filter" regulation (available for every generation). */
export const NO_REGULATION = 'none'

export interface GenData extends DexFile {
  learnsets: Learnsets
  /** Regulations of this generation (empty when it has none: only "No filter" exists). */
  regulations: RegulationRecord[]
  /** Lazily loaded (separate chunk). */
  loadSets: () => Promise<SetsFile>
}

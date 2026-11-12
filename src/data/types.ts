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

export interface GenData extends DexFile {
  learnsets: Learnsets
  /** Lazily loaded (separate chunk). */
  loadSets: () => Promise<SetsFile>
}

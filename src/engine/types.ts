/**
 * Public, typed API of the NCP damage engine.
 *
 * All names (species, moves, items, abilities, natures, types, statuses) are NCP's English display
 * names, exactly as they appear as keys in the vendored NCP data files. A later phase maps them to
 * Showdown ids.
 */

/**
 * NCP generation ids. 1-10 are the numbered generations (10 = Pokemon Champions, which uses Stat
 * Points instead of EVs/IVs), 7.5 = Let's Go Pikachu/Eevee, 9.5 = Legends Z-A.
 */
export type GenId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 7.5 | 8 | 9 | 9.5 | 10

export const GEN_IDS: readonly GenId[] = [1, 2, 3, 4, 5, 6, 7, 7.5, 8, 9, 9.5, 10]

export interface GenInfo {
  id: GenId
  /** Short label as shown on the original NCP page. */
  label: string
  /** Which original NCP page this configuration comes from. */
  page: 'index' | 'lgpe' | 'za'
  /** Stat keys used by this generation (RBY has a single Special `sl`). */
  stats: readonly StatKey[]
  /** True when stats are built from EVs/IVs (gen 3-9), false for DVs (1-2), SPs (10) or AVs (7.5). */
  statSystem: 'dvs' | 'evs-ivs' | 'avs' | 'stat-points'
  hasAbilities: boolean
  hasItems: boolean
  /** Gens where NCP offers a separate "National Dex" data set (8, 9, 10). */
  hasNatDex: boolean
  /** The original page only offers Singles for this generation. */
  singlesOnly: boolean
}

export type StatKey = 'at' | 'df' | 'sa' | 'sd' | 'sp' | 'sl'
export type StatKeyWithHp = StatKey | 'hp'
export type StatMap = Partial<Record<StatKeyWithHp, number>>
export type BoostMap = Partial<Record<StatKey, number>>

export type Status =
  | 'Healthy'
  | 'Poisoned'
  | 'Badly Poisoned'
  | 'Burned'
  | 'Paralyzed'
  | 'Asleep'
  | 'Drowsy'
  | 'Frozen'

export interface MoveInput {
  name: string
  /** Overrides the move's default base power. */
  bp?: number
  type?: string
  category?: 'Physical' | 'Special' | 'Status'
  /** Force a critical hit (default: true only for moves that always crit). */
  crit?: boolean
  /** Number of hits for multi-hit moves (default: NCP's UI default). */
  hits?: number
  /** "Double" variant of moves such as Fling/Facade-like doubling toggles (NCP `canDouble`). */
  double?: boolean
  /** Use the corresponding Z-Move (gen 7). */
  z?: boolean
  /** Z-A "plus" (Mega-boosted) move. Defaults to true for Mega formes in gen 9.5. */
  plus?: boolean
  /** Stellar Tera first-use boost. Defaults to true when Stellar-Terastallized. */
  stellar?: boolean
  /** Pledge move combination partner (NCP `.move-pledge`). */
  pledge?: string
  /** Number of times Rage Fist-like (`linearAddBP`) moves were affected. */
  timesAffected?: number
  /** Index (0-3) into the opposing Pokemon's move list for moves that copy it (Me First...). */
  opponentMoveIndex?: number
}

export interface PokemonInput {
  /** NCP dex key, including formes (e.g. `Mega Charizard X`, `Ogerpon-Wellspring`). */
  species: string
  /** Level. Default 50 (always 50 in gen 10). */
  level?: number
  /** Default `Serious`. */
  nature?: string
  /** Default: the species' default ability. `''` = "(other)". Ignored in gens without abilities. */
  ability?: string
  /** State of the ability toggle (Intimidate, Flash Fire...). Default follows NCP's UI defaults. */
  abilityOn?: boolean
  /** Default `''` (none). */
  item?: string
  /** Default `Healthy`. */
  status?: Status
  boosts?: BoostMap
  /** Gen 3-9. Default 0. */
  evs?: StatMap
  /** Gen 3-9 and LGPE. Default 31. */
  ivs?: StatMap
  /** Gen 1-2 only. Default 15. HP/Special-Defense DVs are derived like the original UI. */
  dvs?: StatMap
  /** Gen 7.5 (LGPE) awakening values. Default 0. */
  avs?: StatMap
  /** Gen 10 (Champions) stat points. Default 0. */
  statPoints?: StatMap
  /** Current HP as a percentage of max HP (default 100). Mutually exclusive with `curHP`. */
  percentHP?: number
  /** Absolute current HP. */
  curHP?: number
  /** Override the dex types. */
  types?: [string, string?]
  teraType?: string
  terastallized?: boolean
  dynamax?: boolean
  gmax?: boolean
  /** Fainted allies for Supreme Overlord (0-5). */
  supremeOverlord?: number
  rivalry?: '' | 'Same' | 'Opposite'
  /** Protosynthesis / Quark Drive manual highest-stat override: 0=Atk 1=Def 2=SpA 3=SpD 4=Spe. */
  highestStat?: number
  toxicCounter?: number
  glaiveRush?: boolean
  /** Override weight in kg (default: dex weight). */
  weight?: number
  /** Gen 7.5 friendship (default 70). */
  friendship?: number
  /** Up to four moves; remaining slots are `(No Move)`. */
  moves: (string | MoveInput)[]
}

/** Field conditions of one side. `attackerSide` is the side of the attacker (column "L" in NCP). */
export interface SideInput {
  reflect?: boolean
  lightScreen?: boolean
  auroraVeil?: boolean
  /** Helping Hand received by this side's Pokemon. */
  helpingHand?: boolean
  friendGuard?: boolean
  tailwind?: boolean
  protect?: boolean
  stealthRock?: boolean
  /** Spikes layers 0-3 (gen 2 and Z-A treat any value > 0 as the single "Spikes" toggle). */
  spikes?: 0 | 1 | 2 | 3
  foresight?: boolean
  gMaxField?: boolean
  flowerGift?: boolean
  steelySpirit?: boolean
  powerSpot?: boolean
  battery?: boolean
  saltCure?: boolean
  swamp?: boolean
  seaFire?: boolean
  redItem?: boolean
  blueItem?: boolean
  charge?: boolean
  leechSeed?: boolean
  ingrain?: boolean
  curse?: boolean
  binding?: boolean
  aquaRing?: boolean
  nightmare?: boolean
  /** Weakness Policy already activated (+2 Atk/SpA). */
  weaknessPolicy?: boolean
  /** Extreme Evoboost used (gen 7). */
  evoboost?: boolean
  /** Geomancy used (gen 6-7). */
  geomancy?: boolean
  /** Commander (Tatsugiri) active. */
  commander?: boolean
}

export type Weather =
  '' | 'Sun' | 'Rain' | 'Sand' | 'Hail' | 'Snow' | 'Harsh Sun' | 'Heavy Rain' | 'Strong Winds'
export type Terrain = '' | 'Electric' | 'Grassy' | 'Misty' | 'Psychic'

export interface FieldInput {
  /** Default `Doubles` (`Singles` in LGPE and Z-A, whose pages only offer Singles). */
  format?: 'Singles' | 'Doubles'
  weather?: Weather
  terrain?: Terrain
  gravity?: boolean
  neutralizingGas?: boolean
  auras?: { fairy?: boolean; dark?: boolean; break?: boolean }
  ruin?: { tablets?: boolean; vessel?: boolean; sword?: boolean; beads?: boolean }
  attackerSide?: SideInput
  defenderSide?: SideInput
}

export interface CalcInput {
  gen: GenId
  /** Use NCP's "National Dex" data set (gens 8, 9 and 10 only). */
  natDex?: boolean
  attacker: PokemonInput
  defender: PokemonInput
  field?: FieldInput
  /**
   * Mirrors NCP's "level mode" switch. `true` (default): level 50 is the default and only other
   * levels are mentioned in descriptions; `false`: level 100 is the default. Gen 10 is always 50.
   */
  vgcLevels?: boolean
  /**
   * Gen 10 only: how investment is shown in descriptions (NCP's "SPs / Actual Stats / EVs"
   * switch). Default `SPs`.
   */
  resultDisplay?: 'SPs' | 'EVs' | 'raw'
}

export interface MoveResult {
  /** Move name as resolved (`(No Move)` for empty slots). */
  move: string
  /**
   * Damage rolls. A flat array of 16 rolls (or fewer/one value for fixed damage); for multi-hit
   * moves whose hits differ (e.g. Parental Bond) an array of per-hit roll arrays.
   */
  damage: number[] | number[][]
  /** Number of hits used for the percent range / KO text. */
  hits: number
  /** NCP's description text, e.g. `0 SpA Flutter Mane Moonblast vs. 0 HP / 0 SpD Incineroar`. */
  description: string
  /** NCP's KO chance text (may contain HTML for joke/status results, exactly as NCP emits it). */
  koChance: string
  /** NCP's damage text, e.g. `76-90 (44.7 - 52.9%)`. */
  damageText: string
  /** `[min%, max%]` of the defender's max HP, floored to 1 decimal like NCP. */
  percentRange: [number, number]
  /** Total min/max damage over all hits. */
  minMax: [number, number]
  /** Z-A only: cooldown text. */
  cooldown?: string
}

export interface CalcResult {
  gen: GenId
  /** Results for the attacker's four move slots (attacker -> defender). */
  moves: MoveResult[]
  /** Results for the defender's four move slots (defender -> attacker). */
  reverseMoves: MoveResult[]
  attackerMaxHP: number
  defenderMaxHP: number
  /** Non-fatal input problems that were auto-corrected (unknown item/ability etc.). */
  warnings: string[]
}

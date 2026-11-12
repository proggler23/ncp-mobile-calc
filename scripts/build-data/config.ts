import type { GenId } from '../../src/data/types'

/** Showdown `Dex.forGen(n)` (the mainline generation data, learnsets restricted to gen n) */
export interface GenSource {
  kind: 'gen'
  gen: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
}
export interface PsModSource {
  kind: 'ps'
  /** Showdown data mod id (from the pokemon-showdown npm package) */
  mod: string
  /** Learnset source prefix (generation digit) to accept */
  learnGen: string
}

export interface VgcFormat {
  /** Smogon stats format id, e.g. gen9vgc2026regi */
  id: string
  /** Candidate months (YYYY-MM), tried in order; peak/healthy months for finished formats */
  months: string[]
}

export interface GenConfig {
  id: GenId
  label: string
  source: GenSource | PsModSource
  /** In priority order. First format that has a species supplies that species' sets. */
  vgc: VgcFormat[]
  gaps: string[]
  statPoints?: boolean
}

/**
 * Generations that `npm run build:data` regenerates by default (and that the scheduled refresh
 * touches). Every other generation is a FROZEN, committed snapshot: its files under
 * src/data/generated/<gen>/ are never rewritten unless you pass `--all` or `--gen <id>`.
 *
 * Freeze a finished format by removing it from this list; thaw a new one by adding it.
 * Optional entries (kept out by default because their games/formats are finished):
 *   'sv'  - Scarlet/Violet / VGC regulations; add it while a Reg is still being played.
 *   'za'  - Legends Z-A; add it if Showdown's `gen9legends` mod is still changing.
 * See docs/MAINTENANCE.md ("Adding a format / generation").
 */
export const ACTIVE_FORMATS: GenId[] = ['champions']

/** Resolve CLI flags to the list of generations to (re)build. */
export function selectGens(argv: string[], all: GenConfig[] = GENS): GenConfig[] {
  const known = new Set(all.map((g) => g.id as string))
  const i = argv.indexOf('--gen')
  if (argv.includes('--all')) return all
  if (i >= 0) {
    const ids = (argv[i + 1] ?? '').split(',').filter(Boolean)
    const bad = ids.filter((id) => !known.has(id))
    if (!ids.length || bad.length)
      throw new Error(`--gen: unknown generation(s) ${bad.join(', ') || '(none given)'}`)
    return all.filter((g) => ids.includes(g.id))
  }
  return all.filter((g) => ACTIVE_FORMATS.includes(g.id))
}

const NO_VGC = 'No VGC usage statistics exist on smogon.com/stats for this generation.'

export const GENS: GenConfig[] = [
  {
    id: 'rby',
    label: 'Gen 1 (RBY)',
    source: { kind: 'gen', gen: 1 },
    vgc: [],
    gaps: [NO_VGC, 'No Doubles/VGC format existed; sets are empty.'],
  },
  {
    id: 'gsc',
    label: 'Gen 2 (GSC)',
    source: { kind: 'gen', gen: 2 },
    vgc: [],
    gaps: [NO_VGC],
  },
  {
    id: 'adv',
    label: 'Gen 3 (RSE/FRLG)',
    source: { kind: 'gen', gen: 3 },
    vgc: [],
    gaps: [NO_VGC],
  },
  {
    id: 'dpp',
    label: 'Gen 4 (DPP/HGSS)',
    source: { kind: 'gen', gen: 4 },
    vgc: [
      { id: 'gen4vgc2010', months: ['2026-07', '2026-06'] },
      { id: 'gen4vgc2009', months: ['2026-05', '2026-04', '2026-03'] },
    ],
    gaps: [
      'Gen 4 VGC stats only exist as low-volume recent ladder months (the original 2009-2010 ladders were not archived); sets are sparse.',
    ],
  },
  {
    id: 'bw',
    label: 'Gen 5 (BW/B2W2)',
    source: { kind: 'gen', gen: 5 },
    vgc: [
      { id: 'gen5vgc2013', months: ['2025-11', '2025-10', '2025-05', '2025-02', '2025-01'] },
      { id: 'gen5vgc2011', months: ['2025-05', '2025-04'] },
    ],
    gaps: ['Gen 5 VGC stats only exist as low-volume recent ladder months; sets are sparse.'],
  },
  {
    id: 'xy',
    label: 'Gen 6 (XY/ORAS)',
    source: { kind: 'gen', gen: 6 },
    vgc: [
      { id: 'vgc2016', months: ['2016-04', '2016-03', '2016-05', '2016-06'] },
      { id: 'vgc2015', months: ['2015-04', '2015-05', '2015-06', '2015-03'] },
      { id: 'vgc2014', months: ['2014-12', '2014-11'] },
    ],
    gaps: [
      'Showdown gen6 data is the ORAS ruleset; XY-only differences (gen6xy mod) are not applied.',
    ],
  },
  {
    id: 'sm',
    label: 'Gen 7 (SM/USUM)',
    source: { kind: 'gen', gen: 7 },
    vgc: [
      { id: 'gen7vgc2019ultraseries', months: ['2019-03', '2019-02', '2019-04', '2019-05'] },
      { id: 'gen7vgc2018', months: ['2018-04', '2018-03', '2018-05'] },
      { id: 'gen7vgc2017', months: ['2017-04', '2017-03', '2017-05'] },
    ],
    gaps: ['Showdown gen7 data is the USUM ruleset (gen7sm mod not applied).'],
  },
  {
    id: 'lgpe',
    label: "Let's Go Pikachu/Eevee",
    source: { kind: 'ps', mod: 'gen7letsgo', learnGen: '7' },
    vgc: [],
    gaps: [
      NO_VGC,
      "Species/learnsets come from the pokemon-showdown 'gen7letsgo' mod (Kanto 151 + Meltan/Melmetal + Alolan forms + Megas). No abilities exist in LGPE ('No Ability' only).",
      "Items and moves are inherited from the gen7 pool by the Showdown mod; moves are pruned to those in some learnset, items are not pruned (TODO: restrict to LGPE's actual item list).",
    ],
  },
  {
    id: 'swsh',
    label: 'Gen 8 (Sw/Sh)',
    source: { kind: 'gen', gen: 8 },
    vgc: [
      { id: 'gen8vgc2022', months: ['2022-05', '2022-04', '2022-06', '2022-03'] },
      { id: 'gen8vgc2021series11', months: ['2021-12', '2021-11', '2022-01'] },
      { id: 'gen8vgc2020', months: ['2020-03', '2020-04', '2020-02'] },
    ],
    gaps: [],
  },
  {
    id: 'sv',
    label: 'Gen 9 (Scarlet/Violet)',
    source: { kind: 'gen', gen: 9 },
    vgc: [
      { id: 'gen9vgc2026regi', months: ['2026-05', '2026-04', '2026-03'] },
      { id: 'gen9vgc2026regf', months: ['2026-03', '2026-02', '2026-01'] },
      { id: 'gen9vgc2025regj', months: ['2025-11', '2025-10', '2025-09'] },
      { id: 'gen9vgc2025regh', months: ['2025-10', '2025-09'] },
      { id: 'gen9vgc2024regg', months: ['2024-06', '2024-07', '2024-05'] },
    ],
    gaps: [
      'Data is the base Showdown gen9 ruleset (latest DLC); individual VGC regulations restrict the legal pool further.',
    ],
  },
  {
    id: 'za',
    label: 'Legends: Z-A',
    source: { kind: 'ps', mod: 'gen9legends', learnGen: '9' },
    vgc: [],
    gaps: [
      NO_VGC + ' (Legends Z-A has no competitive ladder format.)',
      "Species list comes from the pokemon-showdown 'gen9legends' mod (isNonstandard filter). The mod inherits moves, items and abilities from gen9 (SV) and its learnsets still carry SV-era sources, so Z-A-specific movepools, new moves, Mega Stones and Z-A balance changes are NOT reflected.",
      'TODO: replace with real Z-A data when Showdown ships it.',
    ],
  },
  {
    id: 'champions',
    label: 'Pokemon Champions',
    source: { kind: 'ps', mod: 'champions', learnGen: '9' },
    vgc: [
      { id: 'gen9championsvgc2026regmc', months: ['2026-10', '2026-09'] },
      { id: 'gen9championsvgc2026regmb', months: ['2026-08', '2026-07', '2026-06'] },
      { id: 'gen9championsvgc2026regma', months: ['2026-05', '2026-06', '2026-04'] },
    ],
    statPoints: true,
    gaps: [
      "Source is the pokemon-showdown 'champions' mod (legal dex = isNonstandard null, Megas included, 20 PP cap, Mega Stones in items).",
      'Champions uses Stat Points instead of EVs: each point adds +1 to the stat (HP +1 too), 66 points total, max 32 per stat, IVs fixed at 31. In this data the "evs" fields of sets hold Stat Points. Verify limits against the Showdown validator when it lands (stat formula is stat + SP + 20; HP +75).',
      "Regulation-specific legal pools (Reg M-A/M-B/M-C) are not separated; the base 'champions' mod is used.",
    ],
  },
]

export const POKEAPI_CSV_BASE =
  'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
export const CSV_FILES = [
  'pokemon_species_names.csv',
  'move_names.csv',
  'ability_names.csv',
  'item_names.csv',
] as const

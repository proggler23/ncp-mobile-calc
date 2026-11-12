/**
 * Translates a typed `CalcInput` into the "form state" the vendored NCP scripts read through
 * their jQuery calls, replicating the derived values the original UI computes when a user picks a
 * Pokemon / move / ability (types, base stats, move defaults, stat totals, current HP, ...).
 */
import { getGenInfo } from './gens'
import type { Cell } from './sandbox/jquery-stub'
import type { DexEntry, GenData, MoveData, Runtime, StubNode } from './sandbox/loader'
import type {
  CalcInput,
  FieldInput,
  FinalStats,
  GenId,
  MoveInput,
  PokemonInput,
  SideInput,
  StatKeyWithHp,
} from './types'

type Scope = 'p1' | 'p2'

const ABILITY_TOGGLE_ON_DEFAULT = ['Intimidate', 'Slow Start']
const ABILITY_TOGGLE_ON_GEN9 = [
  'Intimidate',
  'Slow Start',
  'Protean',
  'Libero',
  'Intrepid Sword',
  'Dauntless Shield',
  'Supersweet Syrup',
]

/** `SideInput` key -> NCP element id prefix (suffix `L` = attacker side, `R` = defender side). */
const SIDE_CHECKBOXES: Record<Exclude<keyof SideInput, 'spikes'>, string> = {
  reflect: 'reflect',
  lightScreen: 'lightScreen',
  auroraVeil: 'auroraVeil',
  helpingHand: 'helpingHand',
  friendGuard: 'friendGuard',
  tailwind: 'tailwind',
  protect: 'protect',
  stealthRock: 'sr',
  foresight: 'foresight',
  gMaxField: 'gMaxField',
  flowerGift: 'flowerGift',
  steelySpirit: 'steelySpirit',
  powerSpot: 'powerSpot',
  battery: 'battery',
  saltCure: 'saltCure',
  swamp: 'swamp',
  seaFire: 'seaFire',
  redItem: 'redItem',
  blueItem: 'blueItem',
  charge: 'charge',
  leechSeed: 'leechSeed',
  ingrain: 'ingrain',
  curse: 'curse',
  binding: 'binding',
  aquaRing: 'aquaRing',
  nightmare: 'nightmare',
  weaknessPolicy: 'weak',
  evoboost: 'evo',
  geomancy: 'clang',
  commander: 'tatsu',
}

const WEATHER_ALLOWED = new Set([
  '',
  'Sun',
  'Rain',
  'Sand',
  'Hail',
  'Snow',
  'Harsh Sun',
  'Heavy Rain',
  'Strong Winds',
])

export class InputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InputError'
  }
}

export interface FillResult {
  attackerMoves: string[]
  defenderMoves: string[]
  attackerMaxHP: number
  defenderMaxHP: number
  attackerStats: FinalStats
  defenderStats: FinalStats
  warnings: string[]
}

/** NCP stat-row key -> our key (gen 1 has the single Special row `sl`). */
const STAT_ROWS: [string, 'atk' | 'def' | 'spa' | 'spd' | 'spe'][] = [
  ['at', 'atk'],
  ['df', 'def'],
  ['sa', 'spa'],
  ['sd', 'spd'],
  ['sp', 'spe'],
]

/** Reads the `.total` cells NCP's calcHP / calcStat filled (after `fillPokemon`). */
function readStats(rt: Runtime, scope: Scope): FinalStats {
  const total = (row: string): number | undefined => {
    const t = rt.state.cell(scope, `.${row} .total`).text
    return t === undefined || t === '' ? undefined : Number(t)
  }
  const out: FinalStats = { hp: total('hp') ?? 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  for (const [row, key] of STAT_ROWS) out[key] = total(row) ?? 0
  const special = total('sl')
  if (special !== undefined) {
    out.spa = special
    out.spd = special
  }
  return out
}

/** Find the dex entry that owns `species` as one of its formes (the UI's base species). */
function findBase(dex: Record<string, DexEntry>, species: string): string {
  const own = dex[species]
  if (own?.formes?.includes(species)) return species
  for (const [key, entry] of Object.entries(dex)) {
    if (entry.formes?.includes(species)) return key
  }
  return species
}

const HP_TYPE_ORDER = [
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

/** Type and (pre-gen 6) base power of the generic `Hidden Power` move from IVs (customHiddenPower). */
function hiddenPowerFromIvs(
  iv: (s: 'hp' | 'at' | 'df' | 'sa' | 'sd' | 'sp') => number,
  gen: GenId,
): { type: string; bp?: number } {
  const bit = (v: number) => v & 1
  const bit2 = (v: number) => (v & 2 ? 1 : 0)
  const idx = Math.floor(
    ((bit(iv('hp')) +
      bit(iv('at')) * 2 +
      bit(iv('df')) * 4 +
      bit(iv('sp')) * 8 +
      bit(iv('sa')) * 16 +
      bit(iv('sd')) * 32) *
      15) /
      63,
  )
  const type = HP_TYPE_ORDER[idx] ?? 'Dark'
  if (gen >= 6) return { type }
  const bp =
    Math.floor(
      ((bit2(iv('hp')) +
        bit2(iv('at')) * 2 +
        bit2(iv('df')) * 4 +
        bit2(iv('sp')) * 8 +
        bit2(iv('sa')) * 16 +
        bit2(iv('sd')) * 32) *
        40) /
        63,
    ) + 30
  return { type, bp }
}

/** Default value of the `.move-hits` select (`showHits` / `setHitsVal` in ap_calc.js). */
function defaultHits(range: [number, number], ability: string, item: string, gen: GenId): number {
  const [lo, hi] = range
  if (lo === 2 && hi === 5) return ability === 'Skill Link' ? 5 : item === 'Loaded Dice' ? 4 : 3
  if (lo === 1 && hi === 2) return 1
  if (lo === 1 && hi === 6 && gen !== 9.5) return 4
  return hi
}

function isPair(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2
}

export function fillState(rt: Runtime, input: CalcInput): FillResult {
  const { state, api } = rt
  const info = getGenInfo(input.gen)
  state.clear()
  api.configureGen(input.gen, !!input.natDex)
  api.setResultDisplay(input.resultDisplay ?? 'SPs')
  const data = api.data()
  const warnings: string[] = []
  const gen = input.gen

  const vgcLevels = input.vgcLevels !== false
  state.cell(null, '#douswitch').checked = vgcLevels

  const result: FillResult = {
    attackerMoves: [],
    defenderMoves: [],
    attackerMaxHP: 0,
    defenderMaxHP: 0,
    attackerStats: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    defenderStats: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    warnings,
  }

  const attackerMoves = fillPokemon(rt, data, 'p1', input.attacker, gen, vgcLevels, warnings)
  const defenderMoves = fillPokemon(rt, data, 'p2', input.defender, gen, vgcLevels, warnings)
  result.attackerMoves = attackerMoves
  result.defenderMoves = defenderMoves
  result.attackerMaxHP = Number(state.cell('p1', '.hp .total').text ?? 0)
  result.defenderMaxHP = Number(state.cell('p2', '.hp .total').text ?? 0)
  result.attackerStats = readStats(rt, 'p1')
  result.defenderStats = readStats(rt, 'p2')

  fillField(rt, input.field ?? {}, gen, info.singlesOnly || gen === 7.5)
  return result
}

function fillField(rt: Runtime, f: FieldInput, gen: GenId, defaultSingles: boolean): void {
  const { state } = rt
  const check = (id: string, v: boolean | undefined) => {
    state.cell(null, `#${id}`).checked = !!v
  }
  state.radios.set('format', f.format ?? (defaultSingles ? 'Singles' : 'Doubles'))
  const weather = f.weather ?? ''
  if (!WEATHER_ALLOWED.has(weather)) throw new InputError(`Unknown weather "${weather}"`)
  state.radios.set(gen === 2 ? 'gscWeather' : 'weather', weather)
  state.radios.set('terrain', f.terrain ?? '')
  check('gravity', f.gravity)
  check('neutralizingGas', f.neutralizingGas)
  check('fairy-aura', f.auras?.fairy)
  check('dark-aura', f.auras?.dark)
  check('aura-break', f.auras?.break)
  check('tablets-of-ruin', f.ruin?.tablets)
  check('vessel-of-ruin', f.ruin?.vessel)
  check('sword-of-ruin', f.ruin?.sword)
  check('beads-of-ruin', f.ruin?.beads)
  const sides: [SideInput, 'L' | 'R'][] = [
    [f.attackerSide ?? {}, 'L'],
    [f.defenderSide ?? {}, 'R'],
  ]
  for (const [side, suffix] of sides) {
    for (const [key, idBase] of Object.entries(SIDE_CHECKBOXES)) {
      check(idBase + suffix, side[key as keyof typeof SIDE_CHECKBOXES])
    }
    const layers = side.spikes ?? 0
    if (gen === 2 || gen === 9.5) check(`gscSpikes${suffix}`, layers > 0)
    else state.radios.set(`spikes${suffix}`, String(layers))
  }
}

function fillPokemon(
  rt: Runtime,
  data: GenData,
  scope: Scope,
  p: PokemonInput,
  gen: GenId,
  vgcLevels: boolean,
  warnings: string[],
): string[] {
  const { state, api, stub } = rt
  const set = (path: string, patch: Cell): Cell => Object.assign(state.cell(scope, path), patch)
  const val = (path: string, v: unknown) => set(path, { val: v })
  const dex = data.pokedex
  const entry = Object.hasOwn(dex, p.species) ? dex[p.species] : undefined
  if (!entry) throw new InputError(`Unknown species "${p.species}" in gen ${gen}`)
  const base = findBase(dex, p.species)
  const baseEntry = dex[base] ?? entry
  const statKeys = data.STATS

  // species / forme
  val('.set-selector', `${base} (Blank Set)`)
  if (baseEntry.formes) val('.forme', p.species)

  // types, weight
  val('.type1', p.types?.[0] ?? entry.t1)
  val('.type2', p.types ? (p.types[1] ?? '') : (entry.t2 ?? ''))
  val('.weight', p.weight ?? entry.w)
  val('.hp .base', entry.bs.hp)
  for (const s of statKeys) val(`.${s} .base`, entry.bs[s])

  // level
  const level = p.level ?? (vgcLevels ? 50 : 100)
  val('.level', level)

  // stats
  const isDV = gen <= 2
  const allStats: StatKeyWithHp[] = ['hp', ...(statKeys as StatKeyWithHp[])]
  for (const s of allStats) {
    val(`.${s} .evs`, p.evs?.[s] ?? 0)
    val(`.${s} .ivs`, p.ivs?.[s] ?? 31)
    val(`.${s} .avs`, p.avs?.[s] ?? 0)
    val(`.${s} .sps`, p.statPoints?.[s] ?? 0)
    val(`.${s} .dvs`, p.dvs?.[s] ?? 15)
    if (s !== 'hp') val(`.${s} .boost`, p.boosts?.[s] ?? 0)
  }
  const nature = p.nature ?? 'Serious'
  if (!Object.hasOwn(data.natures, nature)) throw new InputError(`Unknown nature "${nature}"`)
  val('.nature', nature)
  val('.friendship', p.friendship ?? 70)
  const poke = stub.$(`#${scope}`) as StubNode
  if (isDV) {
    // The original UI derives HP DVs from the others and mirrors Special DVs (gen 2).
    if (gen === 2) val('.sd .dvs', state.cell(scope, '.sa .dvs').val)
    val('.hp .dvs', api.getHPDVs(poke))
  }

  // ability
  let ability: string
  if (!getGenInfo(gen).hasAbilities) {
    ability = ''
  } else {
    ability = p.ability ?? entry.ab ?? ''
    if (p.species.includes('Ogerpon') && p.ability === undefined) {
      ability = p.terastallized ? 'Embody Aspect' : (entry.ab ?? '')
    }
    if (ability !== '' && !data.abilities.includes(ability)) {
      warnings.push(
        `${scope}: ability "${ability}" is not available in this generation; using (other)`,
      )
      ability = ''
    }
  }
  val('.ability', ability)
  const toggleOn = (gen >= 9 ? ABILITY_TOGGLE_ON_GEN9 : ABILITY_TOGGLE_ON_DEFAULT).includes(ability)
  set('.abilityToggle', { checked: p.abilityOn ?? toggleOn })
  val('.ability-supreme', p.supremeOverlord ?? 0)
  val('.ability-rivalry', p.rivalry ?? '')
  set('.ability-advanced', { checked: p.highestStat !== undefined })
  val('.ability-proto-quark', p.highestStat ?? 0)

  // item
  let item = p.item ?? ''
  if (!getGenInfo(gen).hasItems) item = ''
  else if (item !== '' && !data.items.includes(item)) {
    warnings.push(`${scope}: item "${item}" is not available in this generation; using none`)
    item = ''
  }
  val('.item', item)

  // status
  const status = p.status ?? 'Healthy'
  val('.status', status)
  val('.toxic-counter', p.toxicCounter ?? 1)

  // tera / dynamax
  val('.tera-type', p.teraType ?? baseEntry.t1)
  let tera = p.terastallized ?? false
  if (p.species === 'Terapagos-Stellar' && p.terastallized === undefined) tera = true
  set('.tera', { checked: tera })
  set('.max', { checked: !!p.dynamax })
  // Like the UI, species that have a Gigantamax form default to the G-Max factor being on.
  set('.gmax', { checked: p.gmax ?? data.gmaxDefaults.includes(base) })
  set('.glaive-rush', { checked: !!p.glaiveRush })
  set('.transform', { checked: false })
  const stellar = tera && (p.teraType ?? '') === 'Stellar' && !p.species.includes('Terapagos')

  // moves
  const names: string[] = []
  const isMega = p.species.includes('Mega ')
  for (let i = 0; i < 4; i++) {
    const raw = p.moves[i]
    const mv: MoveInput = typeof raw === 'string' ? { name: raw } : (raw ?? { name: '(No Move)' })
    const move: MoveData | undefined = Object.hasOwn(data.moves, mv.name)
      ? data.moves[mv.name]
      : undefined
    if (!move) throw new InputError(`Unknown move "${mv.name}" in gen ${gen}`)
    names.push(mv.name)
    const g = `.move${i + 1}`
    val(`${g} .move-selector`, mv.name)

    const plusFlag = mv.plus ?? (gen === 9.5 && isMega)
    const plusEffects = move.plusEffects
    let bp = move.bp
    let crit = move.alwaysCrit === true
    let hitsVal: number | undefined
    const range = move.hitRange
    if (isPair(range)) hitsVal = defaultHits(range, ability, item, gen)
    if (plusFlag && plusEffects) {
      if (plusEffects.bp !== undefined) bp = plusEffects.bp
      if (plusEffects.alwaysCrit !== undefined) crit = plusEffects.alwaysCrit
      if (isPair(plusEffects.hitRange))
        hitsVal = defaultHits(plusEffects.hitRange, ability, item, gen)
    }
    let moveType = move.type
    if (mv.name === 'Hidden Power') {
      const hp = hiddenPowerFromIvs((st) => p.ivs?.[st] ?? 31, gen)
      moveType = hp.type
      if (hp.bp !== undefined) bp = hp.bp
    }
    val(`${g} .move-bp`, mv.bp ?? bp)
    val(`${g} .move-type`, mv.type ?? moveType)
    val(`${g} .move-cat`, mv.category ?? move.category)
    set(`${g} .move-crit`, { checked: mv.crit ?? crit })
    if (mv.hits !== undefined) hitsVal = mv.hits
    val(`${g} .move-hits`, hitsVal ?? 1)
    set(`${g} .move-z`, { checked: !!mv.z })
    set(`${g} .move-double`, { checked: !!mv.double })
    val(`${g} .move-pledge`, mv.pledge ?? mv.name)
    val(`${g} .move-linearAddedBP`, mv.timesAffected ?? 0)
    set(`${g} .move-opponent`, { selectedIndex: mv.opponentMoveIndex ?? 0 })
    set(`${g} .move-stellar`, { checked: mv.stellar ?? stellar })
    set(`${g} .move-plus`, { checked: plusFlag })
  }

  // derived totals (the vendored calcHP/calcStats do exactly what the UI does)
  val('.percent-hp', p.percentHP ?? 100)
  api.calcHP(poke)
  api.calcStats(poke)
  if (p.curHP !== undefined) {
    const max = Number(state.cell(scope, '.hp .total').text)
    val('.current-hp', Math.max(0, Math.min(max, Math.trunc(p.curHP))))
  }
  return names
}

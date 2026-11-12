/**
 * "Auto" conveniences of the original NCP UI that the engine leaves to the caller. All of them
 * mirror vendor/ncp/script_res/ap_calc.js (`setField`, `autosetStatus`, `autoSetType`).
 *
 *  - Weather / terrain from abilities (`setField`): Drought, Drizzle, Sand Stream, Snow Warning
 *    (Hail before gen 9, Snow from gen 9 on), Desolate Land, Primordial Sea, Delta Stream,
 *    Orichalcum Pulse (Sun), Sand Spit (Sand, only with the ability toggle on); Grassy / Misty /
 *    Electric / Psychic Surge, Hadron Engine (Electric), Seed Sower (Grassy, toggle on).
 *    Teraform Zero clears weather and terrain. If both Pokemon set the same kind of field the
 *    primal weather wins (NCP: a primal weather is not replaced by a normal one), otherwise the
 *    side given by `priority` (NCP: the ability changed last; there is no "last" in a pure
 *    function, default is the defender).
 *  - Flame Orb -> Burned, Toxic Orb -> Badly Poisoned (`autosetStatus`).
 *  - Arceus (Multitype) + plate / Z crystal and Silvally (RKS System) + memory change the type
 *    (`autoSetType`); without such an item the type is Normal.
 */
import type { Status, Terrain, Weather } from '../engine/types'
import { own } from '../own'

export interface AbilityState {
  abilityId?: string | undefined
  abilityOn?: boolean | undefined
}

const WEATHER: Record<string, Weather> = {
  drought: 'Sun',
  drizzle: 'Rain',
  sandstream: 'Sand',
  desolateland: 'Harsh Sun',
  primordialsea: 'Heavy Rain',
  deltastream: 'Strong Winds',
  orichalcumpulse: 'Sun',
}
const TERRAIN: Record<string, Terrain> = {
  grassysurge: 'Grassy',
  mistysurge: 'Misty',
  electricsurge: 'Electric',
  psychicsurge: 'Psychic',
  hadronengine: 'Electric',
}
const PRIMAL: readonly Weather[] = ['Harsh Sun', 'Heavy Rain', 'Strong Winds']

function abilityWeather(engineGen: number, a: AbilityState): Weather | undefined {
  const id = a.abilityId
  if (!id) return undefined
  if (id === 'snowwarning') return engineGen >= 9 ? 'Snow' : 'Hail'
  if (id === 'sandspit') return a.abilityOn ? 'Sand' : undefined
  return own(WEATHER, id)
}

function abilityTerrain(a: AbilityState): Terrain | undefined {
  const id = a.abilityId
  if (!id) return undefined
  if (id === 'seedsower') return a.abilityOn ? 'Grassy' : undefined
  return own(TERRAIN, id)
}

export interface AutoField {
  /** Undefined: no ability decides, keep the caller's / default value. */
  weather?: Weather
  terrain?: Terrain
}

export function fieldFromAbilities(
  engineGen: number,
  attacker: AbilityState,
  defender: AbilityState,
  priority: 'attacker' | 'defender' = 'defender',
): AutoField {
  if (attacker.abilityId === 'teraformzero' || defender.abilityId === 'teraformzero') {
    return { weather: '', terrain: '' }
  }
  const out: AutoField = {}
  const order = priority === 'attacker' ? [defender, attacker] : [attacker, defender]
  // later entries win
  for (const side of order) {
    const w = abilityWeather(engineGen, side)
    if (w !== undefined) {
      if (out.weather === undefined || !PRIMAL.includes(out.weather) || PRIMAL.includes(w)) {
        out.weather = w
      }
    }
    const t = abilityTerrain(side)
    if (t !== undefined) out.terrain = t
  }
  return out
}

/** Flame Orb / Toxic Orb status, undefined for any other item. */
export function statusFromItem(itemId: string | undefined): Status | undefined {
  if (itemId === 'flameorb') return 'Burned'
  if (itemId === 'toxicorb') return 'Badly Poisoned'
  return undefined
}

const PLATES: Record<string, string> = {
  flameplate: 'Fire',
  splashplate: 'Water',
  zapplate: 'Electric',
  meadowplate: 'Grass',
  icicleplate: 'Ice',
  fistplate: 'Fighting',
  toxicplate: 'Poison',
  earthplate: 'Ground',
  skyplate: 'Flying',
  mindplate: 'Psychic',
  insectplate: 'Bug',
  stoneplate: 'Rock',
  spookyplate: 'Ghost',
  dracoplate: 'Dragon',
  dreadplate: 'Dark',
  ironplate: 'Steel',
  pixieplate: 'Fairy',
}
const Z_CRYSTALS: Record<string, string> = {
  buginiumz: 'Bug',
  darkiniumz: 'Dark',
  dragoniumz: 'Dragon',
  electriumz: 'Electric',
  fairiumz: 'Fairy',
  fightiniumz: 'Fighting',
  firiumz: 'Fire',
  flyiniumz: 'Flying',
  ghostiumz: 'Ghost',
  grassiumz: 'Grass',
  groundiumz: 'Ground',
  iciumz: 'Ice',
  poisoniumz: 'Poison',
  psychiumz: 'Psychic',
  rockiumz: 'Rock',
  steeliumz: 'Steel',
  wateriumz: 'Water',
}

/**
 * New primary type for Arceus / Silvally, undefined when the species/ability does not qualify.
 * `ncpSpecies` is the NCP species name; `abilityId` defaults to the species' own ability.
 */
export function typeFromItem(
  ncpSpecies: string,
  abilityId: string | undefined,
  itemId: string | undefined,
): string | undefined {
  const item = itemId ?? ''
  if (ncpSpecies === 'Silvally' && (abilityId ?? 'rkssystem') === 'rkssystem') {
    const m = /^(\w+)memory$/.exec(item)
    const t = m?.[1]
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Normal'
  }
  if (ncpSpecies === 'Arceus' && (abilityId ?? 'multitype') === 'multitype') {
    return own(PLATES, item) ?? own(Z_CRYSTALS, item) ?? 'Normal'
  }
  return undefined
}

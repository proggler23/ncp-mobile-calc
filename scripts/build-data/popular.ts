/**
 * "Popular" lists (top moves / items / abilities / natures per species and regulation) from the
 * Smogon chaos usage stats. Pure over an already downloaded chaos file (unit tested); the download
 * and the choice of month / cutoff are shared with the common sets (sets.ts `chooseChaos`).
 */
import type {
  PopularEntry,
  PopularFile,
  PopularRegulation,
  PopularSpecies,
} from '../../src/data/types'
import type { RegConfig } from './config'
import { chooseChaos } from './sets'
import type { ChaosSpeciesLike, ChosenFormat } from './sets'
import type { RawGen } from './dex-sources'

export const POPULAR_TOP = 10

const round1 = (n: number) => Math.round(n * 10) / 10
const sum = (m: Record<string, number> | undefined) =>
  Object.values(m ?? {}).reduce((a, b) => a + (Number.isFinite(b) && b > 0 ? b : 0), 0)

/** Ids of the Showdown dex are lowercase alphanumerics; Smogon uses display names. */
type Resolve = RawGen['resolve']

/**
 * Highest-weight entries as [id, % of `total`]. Names that do not resolve to an id of the gen's dex
 * (Other, Nothing, empty, unknown) are dropped BEFORE the top-N cut, ids that resolve to the same
 * entity are summed, entries that round to 0 are dropped.
 */
export function topUsage(
  map: Record<string, number> | undefined,
  total: number,
  resolve: (name: string) => string | undefined,
  n = POPULAR_TOP,
): PopularEntry[] {
  if (total <= 0) return []
  const byId = new Map<string, number>()
  for (const [name, w] of Object.entries(map ?? {})) {
    if (!(w > 0)) continue
    const id = resolve(name)
    if (id) byId.set(id, (byId.get(id) ?? 0) + w)
  }
  return [...byId.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, n)
    .map(([id, w]): PopularEntry => [id, round1(Math.min(100, (w / total) * 100))])
    .filter(([, pct]) => pct > 0)
}

/**
 * Nature usage: spread keys look like "Adamant:0/252/0/0/4/252" (EVs, or Stat Points in Champions);
 * only the prefix matters. Natures are the canonical Showdown names ("Adamant").
 */
export function natureUsage(
  spreads: Record<string, number> | undefined,
  isNature: (name: string) => boolean,
  n = POPULAR_TOP,
): PopularEntry[] {
  const total = sum(spreads)
  const by: Record<string, number> = {}
  for (const [key, w] of Object.entries(spreads ?? {})) {
    const name = key.split(':')[0] ?? ''
    if (!(w > 0) || !isNature(name)) continue
    by[name] = (by[name] ?? 0) + w
  }
  return topUsage(by, total, (x) => x, n)
}

const NATURE_NAMES = new Set([
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
])

export function popularForSpecies(sp: ChaosSpeciesLike, resolve: Resolve): PopularSpecies {
  // Every battler has exactly one ability / item / spread, so each of these sums to the species'
  // total weight; moves are counted per battler (usage of the move among users of the species).
  const total = Math.max(sum(sp.Abilities), sum(sp.Items), sum(sp.Spreads))
  return {
    moves: topUsage(sp.Moves, total, resolve.moves),
    items: topUsage(sp.Items, total, resolve.items),
    abilities: topUsage(sp.Abilities, total, resolve.abilities),
    natures: natureUsage(sp.Spreads, (n) => NATURE_NAMES.has(n)),
  }
}

export function buildPopularRegulation(raw: RawGen, chosen: ChosenFormat): PopularRegulation {
  const species: Record<string, PopularSpecies> = {}
  for (const name of Object.keys(chosen.chaos.data).sort()) {
    const sid = raw.resolve.species(name)
    if (!sid || species[sid]) continue
    const p = popularForSpecies(chosen.chaos.data[name]!, raw.resolve)
    if (p.moves.length || p.items.length || p.abilities.length || p.natures.length) species[sid] = p
  }
  return {
    format: chosen.format,
    month: chosen.month,
    cutoff: chosen.cutoff,
    battles: chosen.battles,
    species,
  }
}

export interface PopularBuild {
  file: PopularFile | undefined
  /** regulation ids whose data could not be refreshed (previous snapshot kept) */
  kept: string[]
  /** regulation ids with no data at all */
  missing: string[]
}

/**
 * Popular data of every regulation that has `usage` configured. Per regulation: chosen month /
 * cutoff as for the sets (cutoff 1760, then 1630, 1500; newest candidate month with a usable
 * file). When the download fails or nothing usable exists, the regulation's entry of the
 * previously committed file is kept.
 */
export async function buildPopular(
  raw: RawGen,
  regs: readonly RegConfig[],
  previous: PopularFile | undefined,
  choose: (f: NonNullable<RegConfig['usage']>) => Promise<ChosenFormat | null> = chooseChaos,
): Promise<PopularBuild> {
  const out: PopularFile = { source: 'smogon', regs: {} }
  const kept: string[] = []
  const missing: string[] = []
  for (const reg of regs) {
    if (!reg.usage) continue
    try {
      const chosen = await choose(reg.usage)
      if (!chosen) throw new Error(`no usable stats for ${reg.usage.id}`)
      const built = buildPopularRegulation(raw, chosen)
      if (!Object.keys(built.species).length) throw new Error('no species with popular data')
      out.regs[reg.id] = built
    } catch (e) {
      const old = previous?.regs[reg.id]
      console.warn(
        `  [popular] ${reg.id}: ${e instanceof Error ? e.message : String(e)}${old ? '; keeping committed data' : ''}`,
      )
      if (old) {
        out.regs[reg.id] = old
        kept.push(reg.id)
      } else missing.push(reg.id)
    }
  }
  return { file: Object.keys(out.regs).length ? out : undefined, kept, missing }
}

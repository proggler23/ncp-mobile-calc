import type { CommonSet, EvSpread, SetsFile } from '../../src/data/types'
import type { VgcFormat } from './config'
import { cachedJson, cachedText } from './fetch'
import type { RawGen } from './dex-sources'

const STATS_BASE = 'https://www.smogon.com/stats'
const CUTOFFS = [1760, 1630, 1500, 0]

export interface ChaosSpeciesLike {
  'Raw count'?: number
  usage?: number
  Abilities?: Record<string, number>
  Items?: Record<string, number>
  Spreads?: Record<string, number>
  Moves?: Record<string, number>
  'Tera Types'?: Record<string, number>
}
export interface Chaos {
  info: { metagame: string; cutoff: number; 'number of battles': number }
  data: Record<string, ChaosSpeciesLike>
}

export interface ChosenFormat {
  format: string
  month: string
  cutoff: number
  battles: number
  url: string
  chaos: Chaos
}

/** Find the best (month, cutoff) for a format from its candidate months. */
export async function chooseChaos(fmt: VgcFormat): Promise<ChosenFormat | null> {
  let best: ChosenFormat | null = null
  for (const month of fmt.months.slice(0, 4)) {
    for (const cutoff of CUTOFFS) {
      const url = `${STATS_BASE}/${month}/chaos/${fmt.id}-${cutoff}.json`
      const chaos = await cachedJson<Chaos>(url, `smogon/${month}/${fmt.id}-${cutoff}.json`)
      if (!chaos) continue
      if (Object.keys(chaos.data).length < 20) continue
      const cand: ChosenFormat = {
        format: fmt.id,
        month,
        cutoff,
        battles: chaos.info['number of battles'] ?? 0,
        url,
        chaos,
      }
      if (!best || cand.battles > best.battles) best = cand
      break // first usable cutoff for this month
    }
    if (best && best.battles >= 5000) break
  }
  return best
}

function top(map: Record<string, number> | undefined, n: number): [string, number][] {
  return Object.entries(map ?? {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
}

const STAT_KEYS: (keyof EvSpread)[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']

function parseSpread(key: string): { nature: string; evs: EvSpread } | null {
  const [nature, evStr] = key.split(':')
  if (!nature || !evStr) return null
  const parts = evStr.split('/').map(Number)
  if (parts.length !== 6 || parts.some((n) => !Number.isFinite(n))) return null
  const evs = {} as EvSpread
  STAT_KEYS.forEach((k, i) => (evs[k] = parts[i]!))
  return { nature, evs }
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function buildSets(raw: RawGen, formats: ChosenFormat[]): SetsFile {
  const out: SetsFile = {}
  for (const f of formats) {
    for (const [name, sp] of Object.entries(f.chaos.data)) {
      const sid = raw.resolve.species(name)
      if (!sid || out[sid]) continue // earlier (higher priority) format wins per species
      const spreads = top(sp.Spreads, 40)
      if (!spreads.length) continue
      const spreadTotal = Object.values(sp.Spreads ?? {}).reduce((a, b) => a + b, 0)
      if (spreadTotal <= 0) continue
      // distinct top-3 spreads (skip unparsable / "Other")
      const picked: { nature: string; evs: EvSpread; w: number }[] = []
      for (const [key, w] of spreads) {
        const p = parseSpread(key)
        if (p && picked.length < 3) picked.push({ ...p, w })
      }
      const items = top(sp.Items, 10).filter(([n]) => raw.resolve.items(n))
      const abilities = top(sp.Abilities, 5).filter(([n]) => raw.resolve.abilities(n))
      const abilTotal = Object.values(sp.Abilities ?? {}).reduce((a, b) => a + b, 0)
      const itemTotal = Object.values(sp.Items ?? {}).reduce((a, b) => a + b, 0)
      const moves = top(sp.Moves, 12)
        .map(([n]) => raw.resolve.moves(n))
        .filter((m): m is string => !!m)
        .slice(0, 4)
      const tera = top(sp['Tera Types'], 1)[0]
      if (!moves.length || !items.length || !abilities.length) continue
      const sets: CommonSet[] = picked.map((p, i) => {
        // i-th most used item/ability when it holds >= 10% share, else the most used one.
        const itemPick = items[i] && items[i][1] / itemTotal >= 0.1 ? items[i] : items[0]!
        const abilPick =
          abilities[i] && abilities[i][1] / abilTotal >= 0.1 ? abilities[i] : abilities[0]!
        const set: CommonSet = {
          ability: raw.resolve.abilities(abilPick![0])!,
          item: raw.resolve.items(itemPick[0])!,
          nature: p.nature,
          evs: p.evs,
          moves,
          usagePct: round1((p.w / spreadTotal) * 100),
          source: 'smogon.com/stats chaos',
          format: f.format,
          month: f.month,
        }
        if (typeof sp.usage === 'number') set.speciesUsagePct = round1(sp.usage * 100)
        if (tera?.[0] && tera[0] !== 'nothing')
          set.teraType = tera[0][0]!.toUpperCase() + tera[0].slice(1)
        return set
      })
      if (sets.length) out[sid] = sets
    }
  }
  return out
}

export async function listStatsMonths(): Promise<string[]> {
  const html = await cachedText(`${STATS_BASE}/`, 'smogon/index.html', 12 * 3600_000)
  return [...(html ?? '').matchAll(/href="(20\d\d-\d\d)\/"/g)].map((m) => m[1]!)
}

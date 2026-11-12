/**
 * Build NCP <-> Showdown name maps per generation into src/bridge/generated/.
 * Run: npm run build:bridge  (after `npm run build:data`, which produces src/data/generated)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeSearch as toID } from '../../src/data/normalize'
import type { DexFile, GenId as DataGenId } from '../../src/data/types'
import {
  FLAG_ALIAS,
  FLAG_FOREIGN,
  FLAG_GMAX,
  FLAG_NATDEX_ONLY,
  FLAG_NCP_ONLY,
  type BridgeMapFile,
  type EngineGenId,
  type EntityKind,
  type MapEntry,
} from '../../src/bridge/types'
import { loadNcpTables, type NcpTable } from './ncp-tables'
import {
  ABILITY_ALIASES,
  ABILITY_OVERRIDES,
  ITEM_OVERRIDES,
  MOVE_OVERRIDES,
  SPECIES_OVERRIDES,
} from './overrides'

const OUT = path.resolve(import.meta.dirname, '../../src/bridge/generated')
const DATA = path.resolve(import.meta.dirname, '../../src/data/generated')

const GENS: { id: DataGenId; engine: EngineGenId; natdex: boolean }[] = [
  { id: 'rby', engine: 1, natdex: false },
  { id: 'gsc', engine: 2, natdex: false },
  { id: 'adv', engine: 3, natdex: false },
  { id: 'dpp', engine: 4, natdex: false },
  { id: 'bw', engine: 5, natdex: false },
  { id: 'xy', engine: 6, natdex: false },
  { id: 'sm', engine: 7, natdex: false },
  { id: 'lgpe', engine: 7.5, natdex: false },
  { id: 'swsh', engine: 8, natdex: true },
  { id: 'sv', engine: 9, natdex: true },
  { id: 'za', engine: 9.5, natdex: false },
  { id: 'champions', engine: 10, natdex: true },
]

interface Rec {
  id: string
  en: string
  de?: string
}

const OVERRIDES: Record<EntityKind, Record<string, string>> = {
  species: SPECIES_OVERRIDES,
  moves: MOVE_OVERRIDES,
  items: ITEM_OVERRIDES,
  abilities: ABILITY_OVERRIDES,
}

/** Candidate Showdown ids for an NCP name, most specific first. */
function candidates(kind: EntityKind, ncp: string): string[] {
  const out: string[] = []
  const ov = OVERRIDES[kind][ncp]
  if (ov) out.push(ov)
  out.push(toID(ncp))
  if (kind === 'species') {
    const mega = /^Mega (.+?)(?: ([XYZ]))?$/.exec(ncp)
    if (mega) out.push(toID(mega[1] ?? '') + 'mega' + (mega[2] ?? '').toLowerCase())
    const primal = /^Primal (.+)$/.exec(ncp)
    if (primal) out.push(toID(primal[1] ?? '') + 'primal')
  }
  return out
}

interface KindResult {
  entries: MapEntry[]
  ncpTotal: number
  ncpMatched: number
  ncpOnly: string[]
  foreign: number
  sdTotal: number
  sdMatched: number
  sdOnly: string[]
}

/** Showdown records indexed by id and by id of their English name (typed Hidden Power records
 * share the id "hiddenpower" in the data files, but their names differ). */
function indexRecords(records: Rec[]): Map<string, Rec> {
  const byKey = new Map<string, Rec>()
  for (const r of records) {
    const nameKey = toID(r.en)
    if (!byKey.has(nameKey)) byKey.set(nameKey, r)
  }
  for (const r of records) if (!byKey.has(r.id)) byKey.set(r.id, r)
  return byKey
}

function findCandidate(
  kind: EntityKind,
  ncp: string,
  byKey: Map<string, Rec>,
  claimed: Set<string>,
): Rec | undefined {
  for (const c of candidates(kind, ncp)) {
    const rec = byKey.get(c)
    if (rec && !claimed.has(rec.en)) return rec
  }
  return undefined
}

function entryId(kind: EntityKind, rec: Rec): string {
  return toID(rec.en) === rec.id || kind !== 'moves' ? rec.id : toID(rec.en)
}

function mapKind(
  kind: EntityKind,
  records: Rec[],
  ncpAll: string[],
  ncpDefault: Set<string>,
  hasNatDex: boolean,
  foreignRecords: Rec[],
): KindResult {
  const byKey = indexRecords(records)
  const foreignByKey = indexRecords(foreignRecords)
  let foreign = 0
  const entries: MapEntry[] = []
  const used = new Set<Rec>()
  const ncpOnly: string[] = []
  const claimed = new Set<string>()
  for (const ncp of ncpAll) {
    let flags = hasNatDex && !ncpDefault.has(ncp) ? FLAG_NATDEX_ONLY : 0
    let rec = findCandidate(kind, ncp, byKey, claimed)
    if (rec) {
      claimed.add(rec.en)
      used.add(rec)
      entries.push([entryId(kind, rec), ncp, flags])
    } else if ((rec = findCandidate(kind, ncp, foreignByKey, claimed))) {
      foreign++
      claimed.add(rec.en)
      entries.push([entryId(kind, rec), ncp, flags | FLAG_FOREIGN, rec.en, rec.de ?? rec.en])
    } else {
      flags |= FLAG_NCP_ONLY
      ncpOnly.push(ncp)
      entries.push([toID(ncp), ncp, flags])
    }
  }
  const sdOnly: string[] = []
  if (kind === 'species') {
    const ncpByEntryId = new Map(
      entries.filter((e) => !(e[2] & FLAG_NCP_ONLY)).map((e) => [e[0], e] as const),
    )
    for (const r of records) {
      if (used.has(r)) continue
      // Gigantamax species: NCP has the base species plus a gmax toggle.
      const gm = /^(.+)gmax$/.exec(r.id)
      const gmBase = gm ? ncpByEntryId.get(gm[1] ?? '') : undefined
      if (gmBase) {
        used.add(r)
        entries.push([r.id, gmBase[1], (gmBase[2] & FLAG_NATDEX_ONLY) | FLAG_GMAX])
        continue
      }
      // Cosmetic / battle-only formes that NCP folds into another entry: the same entry with the
      // "-Tera" suffix removed (Ogerpon-Wellspring-Tera), else the base species. Arceus/Silvally
      // type formes are re-typed by the runtime.
      const bases = [r.id.replace(/tera$/, ''), (r as { base?: string }).base ?? '']
      const target = bases.map((b) => ncpByEntryId.get(b)).find((e) => e !== undefined)
      if (target) {
        used.add(r)
        entries.push([r.id, target[1], (target[2] & FLAG_NATDEX_ONLY) | FLAG_ALIAS])
      }
    }
  }
  if (kind === 'abilities') {
    const byId = new Map(records.map((r) => [r.id, r]))
    for (const [ncp, aliases] of Object.entries(ABILITY_ALIASES)) {
      const primary = entries.find((e) => e[1] === ncp && !(e[2] & FLAG_NCP_ONLY))
      if (!primary) continue
      for (const id of aliases) {
        const r = byId.get(id)
        if (r && !used.has(r)) {
          used.add(r)
          entries.push([id, ncp, primary[2] | FLAG_ALIAS])
        }
      }
    }
  }
  for (const r of records) if (!used.has(r)) sdOnly.push(r.en)
  return {
    entries,
    ncpTotal: ncpAll.length,
    ncpMatched: ncpAll.length - ncpOnly.length,
    ncpOnly,
    foreign,
    sdTotal: records.length,
    sdMatched: used.size,
    sdOnly,
  }
}

async function main() {
  const tables = loadNcpTables()
  await mkdir(OUT, { recursive: true })
  const dexes = new Map<DataGenId, DexFile>()
  for (const g of GENS) {
    dexes.set(
      g.id,
      JSON.parse(await readFile(path.join(DATA, g.id, 'dex.json'), 'utf8')) as DexFile,
    )
  }
  const summary: string[] = [
    '| gen | kind | NCP total | own-gen match | other-gen match | NCP-only (default dex) | NCP-only (National Dex only) | Showdown total | Showdown matched | Showdown-only |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ]
  const details: string[] = []
  const kinds: EntityKind[] = ['species', 'moves', 'items', 'abilities']
  for (const g of GENS) {
    const dex = dexes.get(g.id) as DexFile
    const key = String(g.engine)
    const def = tables.get(key) as NcpTable
    const full = (g.natdex ? tables.get(`${key}:nd`) : def) as NcpTable
    const file: BridgeMapFile = {
      gen: g.id,
      engineGen: g.engine,
      hasNatDex: g.natdex,
      species: [],
      moves: [],
      items: [],
      abilities: [],
    }
    details.push(`## ${g.id} (engine gen ${g.engine}${g.natdex ? ', incl. National Dex' : ''})`, '')
    for (const kind of kinds) {
      // Pool of other generations' records, newest first, for National Dex-only entities.
      const pool: Rec[] = []
      for (const o of [...GENS].reverse()) {
        if (o.id !== g.id) pool.push(...(dexes.get(o.id) as DexFile)[kind])
      }
      const res = mapKind(kind, dex[kind], full[kind], new Set(def[kind]), g.natdex, pool)
      file[kind] = res.entries
      const defSet = new Set(def[kind])
      const onlyDef = res.ncpOnly.filter((n) => defSet.has(n))
      const onlyNd = res.ncpOnly.filter((n) => !defSet.has(n))
      summary.push(
        `| ${g.id} | ${kind} | ${res.ncpTotal} | ${res.ncpMatched - res.foreign} | ${res.foreign} | ${onlyDef.length} | ${onlyNd.length} | ${res.sdTotal} | ${res.sdMatched} | ${res.sdOnly.length} |`,
      )
      details.push(
        `### ${kind}`,
        '',
        `NCP-only, default dex (${onlyDef.length}): ${onlyDef.join(', ') || '-'}`,
        '',
        `NCP-only, National Dex only (${onlyNd.length}): ${onlyNd.join(', ') || '-'}`,
        '',
        `Showdown-only (${res.sdOnly.length}): ${res.sdOnly.join(', ') || '-'}`,
        '',
      )
    }
    await writeFile(path.join(OUT, `${g.id}.json`), JSON.stringify(file))
  }
  const report = [
    '# NCP <-> Showdown mapping coverage',
    '',
    'Generated by `npm run build:bridge`. "NCP-only" entities stay usable with a plain id',
    '(the normalized NCP name) and the NCP English name as display fallback (no German name). "Other-gen match"',
    "entities (National Dex entries missing from the generation's own Showdown data) take their id and",
    'names from another generation. "Showdown-only" entities are unknown to the NCP engine and',
    'cannot be calculated.',
    '',
  ]
  await writeFile(path.join(OUT, 'COVERAGE.md'), [...report, ...summary, '', ...details].join('\n'))
  console.log(summary.join('\n'))
}

await main()

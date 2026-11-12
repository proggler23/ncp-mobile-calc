/**
 * Build per-generation JSON assets into src/data/generated/<gen>/.
 *
 *   npm run build:data                  active gens only (config.ts ACTIVE_FORMATS)
 *   npm run build:data -- --refresh     same, ignoring the download cache (re-fetch usage stats)
 *   npm run build:data -- --all         every gen (manual; frozen gens are normally untouched)
 *   npm run build:data -- --gen sv,za   specific gens
 *   npm run build:data -- --update-names  re-download PokeAPI and rewrite names/de.json
 *
 * Frozen gens' files are committed snapshots and are never written unless selected explicitly.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { ACTIVE_FORMATS, GENS, selectGens } from './config'
import type { GenConfig } from './config'
import { loadRawGen } from './dex-sources'
import { loadDeTables, lookupDe, speciesDe } from './names'
import type { DeResult, DeTables } from './names'
import { buildSets, chooseChaos } from './sets'
import type { ChosenFormat } from './sets'
import { mergeCurated, stripCurated, validateCurated } from './sets-merge'
import type { CuratedFile } from './sets-merge'
import { showdownVersion, usageMonthsOf, writeVersionJson } from './version'
import { normalizeSearch } from '../../src/data/normalize'
import type {
  DexFile,
  MoveRecord,
  NamedRecord,
  SearchEntry,
  SetsFile,
  SpeciesRecord,
} from '../../src/data/types'

const OUT = path.resolve(import.meta.dirname, '../../src/data/generated')

const json = (v: unknown) => JSON.stringify(v)

function searchEntries(rows: { id: string; en: string; de: string }[]): SearchEntry[] {
  return rows.map((r) => {
    const en = normalizeSearch(r.en)
    const de = normalizeSearch(r.de)
    return [r.id, en, de === en ? '' : de]
  })
}

interface Tally {
  total: number
  native: number
  override: number
  derived: number
  fallback: number
}
const newTally = (): Tally => ({ total: 0, native: 0, override: 0, derived: 0, fallback: 0 })
function tally(t: Tally, r: DeResult) {
  t.total++
  t[r.how]++
}

async function readJsonIfExists<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return undefined
  }
}

const CURATED_FILE = path.resolve(import.meta.dirname, 'sets/curated.json')

/** Distinct (format, month) pairs recorded in a sets file. */
function formatsOf(sets: SetsFile) {
  const seen = new Map<string, { format: string; month: string }>()
  for (const list of Object.values(sets))
    for (const s of list)
      if (s.format !== 'curated')
        seen.set(`${s.format}:${s.month}`, { format: s.format, month: s.month })
  return [...seen.values()].sort((a, b) => (a.month + a.format < b.month + b.format ? -1 : 1))
}

async function buildGen(cfg: GenConfig, de: DeTables, curated: CuratedFile) {
  const raw = await loadRawGen(cfg)
  const tallies = {
    species: newTally(),
    moves: newTally(),
    items: newTally(),
    abilities: newTally(),
  }
  const missing: Record<string, string[]> = { species: [], moves: [], items: [], abilities: [] }

  const track = (kind: keyof typeof tallies, en: string, r: DeResult) => {
    tally(tallies[kind], r)
    if (r.how === 'fallback') missing[kind]!.push(en)
  }

  const species: SpeciesRecord[] = raw.species.map((s) => {
    const r = speciesDe(de, s.name, s.baseName, s.formeName)
    track('species', s.name, r)
    const rec: SpeciesRecord = {
      id: s.id,
      en: s.name,
      de: r.de,
      num: s.num,
      types: s.types,
      bs: s.bs,
      abilities: s.abilities,
    }
    if (s.hiddenAbility) rec.hiddenAbility = s.hiddenAbility
    if (s.base) rec.base = s.base
    if (s.forme) rec.forme = s.forme
    if (s.prevo) rec.prevo = s.prevo
    if (s.evos.length) rec.evos = s.evos
    if (s.requiredItem) rec.requiredItem = s.requiredItem
    if (s.isMega) rec.isMega = true
    return rec
  })
  // base species -> forme ids present in this gen
  const byId = new Map(species.map((s) => [s.id, s]))
  for (const s of species) {
    if (!s.base) continue
    const b = byId.get(s.base)
    if (b) (b.formes ??= []).push(s.id)
  }

  const named = (kind: 'items' | 'abilities', rows: { id: string; name: string }[]) =>
    rows.map((r): NamedRecord => {
      const d = lookupDe(de, kind, r.name)
      track(kind, r.name, d)
      return { id: r.id, en: r.name, de: d.de }
    })
  const moves: MoveRecord[] = raw.moves.map((m) => {
    const d = lookupDe(de, 'moves', m.name)
    track('moves', m.name, d)
    return { id: m.id, en: m.name, de: d.de, type: m.type, category: m.category, bp: m.bp }
  })
  const items = named('items', raw.items)
  const abilities = named('abilities', raw.abilities)

  const dex: DexFile = {
    meta: {
      gen: cfg.id,
      label: cfg.label,
      source: raw.source,
      gaps: cfg.gaps,
      ...(cfg.statPoints ? { statPoints: true } : {}),
    },
    species,
    moves,
    items,
    abilities,
    search: {
      species: searchEntries(species),
      moves: searchEntries(moves),
      items: searchEntries(items),
      abilities: searchEntries(abilities),
    },
  }

  // Common sets (Smogon VGC usage stats). Usage is optional: when the download fails or no usable
  // stats exist any more (format renamed/retired), keep the last committed snapshot.
  const dir = path.join(OUT, cfg.id)
  const previous = await readJsonIfExists<SetsFile>(path.join(dir, 'sets.json'))
  const chosen: ChosenFormat[] = []
  let usage: { fallback: boolean; reason?: string } = { fallback: false }
  let generated: SetsFile = {}
  if (cfg.vgc.length) {
    try {
      for (const f of cfg.vgc) {
        const c = await chooseChaos(f)
        if (c) chosen.push(c)
        else console.warn(`  [${cfg.id}] no usable stats for ${f.id}`)
      }
      if (!chosen.length) throw new Error('no usable usage stats for any configured format')
      generated = buildSets(raw, chosen)
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      console.warn(`  [${cfg.id}] usage stats unavailable (${reason}); keeping committed sets`)
      usage = { fallback: true, reason }
      chosen.length = 0
      generated = previous ? stripCurated(previous) : {}
    }
  }
  const curatedEntries = curated.gens[cfg.id] ?? {}
  const errors = validateCurated(cfg.id, curatedEntries, {
    species: (id) => !!raw.resolve.species(id),
    moves: (id) => !!raw.resolve.moves(id),
    items: (id) => !!raw.resolve.items(id),
    abilities: (id) => !!raw.resolve.abilities(id),
  })
  if (errors.length) throw new Error(errors.join('\n'))
  const sets = mergeCurated(generated, curatedEntries)

  await mkdir(dir, { recursive: true })
  const files = {
    'dex.json': json(dex),
    'learnsets.json': json(raw.learnsets),
    'sets.json': json(sets),
  }
  const sizes: Record<string, { raw: number; gzip: number }> = {}
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(dir, name), content)
    sizes[name] = { raw: Buffer.byteLength(content), gzip: gzipSync(content).length }
  }
  const counts = {
    species: species.length,
    moves: moves.length,
    items: items.length,
    abilities: abilities.length,
    learnsets: Object.keys(raw.learnsets).length,
    sets: Object.keys(sets).length,
  }
  return {
    cfg,
    counts,
    tallies,
    missing,
    sizes,
    chosen,
    usage,
    months: usageMonthsOf(sets),
    formats: formatsOf(sets),
    source: raw.source,
  }
}

async function main() {
  const selected = selectGens(process.argv.slice(2))
  const frozen = GENS.filter((g) => !selected.includes(g))
  console.log(
    `Active formats (config): ${ACTIVE_FORMATS.join(', ')}. Building: ${selected.map((g) => g.id).join(', ')}` +
      (frozen.length ? `. Frozen (untouched): ${frozen.map((g) => g.id).join(', ')}` : ''),
  )
  const de = await loadDeTables()
  const curated =
    (await readJsonIfExists<CuratedFile>(CURATED_FILE)) ?? ({ gens: {} } as CuratedFile)
  const results = []
  for (const cfg of selected) {
    console.log(`Building ${cfg.id} ...`)
    results.push(await buildGen(cfg, de, curated))
  }

  // sources.json keeps the entries of frozen gens (they are not rebuilt)
  const sourcesFile = path.join(OUT, 'sources.json')
  const old = await readJsonIfExists<{ gens?: Record<string, unknown> }>(sourcesFile)
  const pkg = JSON.parse(
    await readFile(path.resolve(import.meta.dirname, '../../package.json'), 'utf8'),
  ) as { devDependencies: Record<string, string> }
  const sources = {
    generatedBy: 'scripts/build-data (npm run build:data)',
    packages: {
      'pokemon-showdown': await showdownVersion(),
      pinned: pkg.devDependencies['pokemon-showdown'],
    },
    germanNames: {
      source:
        'PokeAPI/pokeapi data/v2/csv (pokemon_species_names, move_names, ability_names, item_names), committed snapshot scripts/build-data/names/de.json + overrides.de.json',
      snapshotDate: de.snapshotDate,
      url: 'https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv',
      license: 'PokeAPI data: BSD-3-Clause',
      note: 'Names are Nintendo/Game Freak property; used only as display labels.',
    },
    usageStats: {
      source: 'Smogon usage statistics (chaos JSON): https://www.smogon.com/stats/',
      note: 'Only aggregated usage numbers are used (spreads, items, abilities, moves, tera). No Smogon prose or analysis text is stored. Optional: on fetch failure the last committed sets are kept (gens.<gen>.usageFallback).',
    },
    entityData: 'Pokemon Showdown data (MIT) via the pinned official pokemon-showdown npm package',
    gens: {
      ...(old?.gens ?? {}),
      ...Object.fromEntries(
        results.map((r) => [
          r.cfg.id,
          {
            entitySource: r.source,
            vgcFormats: r.chosen.length
              ? r.chosen.map((c) => ({
                  format: c.format,
                  month: c.month,
                  cutoff: c.cutoff,
                  battles: c.battles,
                  url: c.url,
                }))
              : r.formats,
            ...(r.usage.fallback ? { usageFallback: r.usage.reason } : {}),
            gaps: r.cfg.gaps,
          },
        ]),
      ),
    },
  }
  await mkdir(OUT, { recursive: true })
  await writeFile(sourcesFile, JSON.stringify(sources, null, 2) + '\n')
  console.log((await writeVersionJson()) ? 'version.json updated' : 'version.json unchanged')

  // Report
  console.log(
    '\nGen        species moves items abil learn sets | DE missing (sp/mv/it/ab) | gzip KB dex/learn/sets',
  )
  for (const r of results) {
    const c = r.counts
    const t = r.tallies
    const miss = [t.species, t.moves, t.items, t.abilities].map((x) => x.fallback).join('/')
    const gz = Object.values(r.sizes)
      .map((s) => (s.gzip / 1024).toFixed(1))
      .join('/')
    console.log(
      `${r.cfg.id.padEnd(10)} ${String(c.species).padStart(5)} ${String(c.moves).padStart(5)} ${String(c.items).padStart(5)} ${String(c.abilities).padStart(4)} ${String(c.learnsets).padStart(5)} ${String(c.sets).padStart(4)} | ${miss.padEnd(24)} | ${gz}`,
    )
  }
  const reportPath = path.resolve(import.meta.dirname, '../../.cache/build-data/report.json')
  const prevReport = (await readJsonIfExists<Record<string, unknown>>(reportPath)) ?? {}
  const report = {
    ...prevReport,
    ...Object.fromEntries(
      results.map((r) => [
        r.cfg.id,
        {
          counts: r.counts,
          de: r.tallies,
          sizes: r.sizes,
          missing: r.missing,
          usage: r.usage,
        },
      ]),
    ),
  }
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, JSON.stringify(report, null, 2))
  console.log(`\nDetailed report (missing German names, raw/gzip sizes): ${reportPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

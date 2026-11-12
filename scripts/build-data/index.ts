/**
 * Build per-generation JSON assets into src/data/generated/<gen>/.
 * Run: npm run build:data  (add --refresh to ignore the download cache)
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { GENS } from './config'
import type { GenConfig } from './config'
import { loadRawGen } from './dex-sources'
import { ensurePokemonShowdown, PS_VERSION } from './install-ps'
import { loadDeTables, lookupDe, speciesDe } from './names'
import type { DeResult, DeTables } from './names'
import { buildSets, chooseChaos } from './sets'
import type { ChosenFormat } from './sets'
import { normalizeSearch } from '../../src/data/normalize'
import type {
  DexFile,
  MoveRecord,
  NamedRecord,
  SearchEntry,
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

async function pkgVersion(name: string, from: string): Promise<string> {
  const p = path.resolve(from, name, 'package.json')
  return (JSON.parse(await readFile(p, 'utf8')) as { version: string }).version
}

async function buildGen(cfg: GenConfig, de: DeTables) {
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

  // Common sets (VGC usage stats)
  const chosen: ChosenFormat[] = []
  for (const f of cfg.vgc) {
    const c = await chooseChaos(f)
    if (c) chosen.push(c)
    else console.warn(`  [${cfg.id}] no usable stats for ${f.id}`)
  }
  const sets = buildSets(raw, chosen)

  const dir = path.join(OUT, cfg.id)
  await rm(dir, { recursive: true, force: true })
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
  return { cfg, counts, tallies, missing, sizes, chosen, source: raw.source }
}

async function main() {
  await ensurePokemonShowdown()
  const de = await loadDeTables()
  const results = []
  for (const cfg of GENS) {
    console.log(`Building ${cfg.id} ...`)
    results.push(await buildGen(cfg, de))
  }

  const psDir = path.resolve(import.meta.dirname, '../../.cache/build-data/ps/node_modules')
  const sources = {
    generatedBy: 'scripts/build-data (npm run build:data)',
    packages: {
      '@pkmn/dex': await pkgVersion(
        '@pkmn/dex',
        path.resolve(import.meta.dirname, '../../node_modules'),
      ),
      '@pkmn/data': await pkgVersion(
        '@pkmn/data',
        path.resolve(import.meta.dirname, '../../node_modules'),
      ),
      'pokemon-showdown': await pkgVersion('pokemon-showdown', psDir),
      requested: PS_VERSION,
    },
    germanNames: {
      source:
        'PokeAPI/pokeapi data/v2/csv (pokemon_species_names, move_names, ability_names, item_names)',
      url: 'https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv',
      license: 'PokeAPI data: BSD-3-Clause',
      note: 'Names are Nintendo/Game Freak property; used only as display labels.',
    },
    usageStats: {
      source: 'Smogon usage statistics (chaos JSON): https://www.smogon.com/stats/',
      note: 'Only aggregated usage numbers are used (spreads, items, abilities, moves, tera). No Smogon prose or analysis text is stored.',
    },
    entityData: 'Pokemon Showdown data (MIT) via @pkmn/dex and the pokemon-showdown npm package',
    gens: Object.fromEntries(
      results.map((r) => [
        r.cfg.id,
        {
          entitySource: r.source,
          vgcFormats: r.chosen.map((c) => ({
            format: c.format,
            month: c.month,
            cutoff: c.cutoff,
            battles: c.battles,
            url: c.url,
          })),
          gaps: r.cfg.gaps,
        },
      ]),
    ),
  }
  await mkdir(OUT, { recursive: true })
  await writeFile(path.join(OUT, 'sources.json'), JSON.stringify(sources, null, 2) + '\n')

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
  const report = Object.fromEntries(
    results.map((r) => [
      r.cfg.id,
      { counts: r.counts, de: r.tallies, sizes: r.sizes, missing: r.missing },
    ]),
  )
  const reportPath = path.resolve(import.meta.dirname, '../../.cache/build-data/report.json')
  await writeFile(reportPath, JSON.stringify(report, null, 2))
  console.log(`\nDetailed report (missing German names, raw/gzip sizes): ${reportPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

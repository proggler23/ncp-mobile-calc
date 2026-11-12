import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { CSV_FILES, POKEAPI_CSV_BASE } from './config'
import { cachedText } from './fetch'

/** Normalize a display name to a join key: strip diacritics, gender symbols, non-alphanumerics. */
export function nameKey(s: string): string {
  return s
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export type Kind = 'species' | 'moves' | 'abilities' | 'items'
export const KINDS: Kind[] = ['species', 'moves', 'abilities', 'items']
/** Showdown id of the English name (nameKey) -> German name */
export type DeTable = Map<string, string>
export interface DeTables {
  species: DeTable
  moves: DeTable
  abilities: DeTable
  items: DeTable
  /** Hand-maintained overrides (names/overrides.de.json), same keying, win over the snapshot */
  overrides: Record<Kind, Record<string, string>>
  /** ISO date (YYYY-MM-DD) the committed snapshot was built from PokeAPI */
  snapshotDate: string
}

export const NAMES_DIR = path.resolve(import.meta.dirname, 'names')
export const SNAPSHOT_FILE = path.join(NAMES_DIR, 'de.json')
export const OVERRIDES_FILE = path.join(NAMES_DIR, 'overrides.de.json')

/** On-disk format of names/de.json and names/overrides.de.json (kind -> id -> German name). */
export interface NamesFile {
  meta?: { source: string; date: string }
  species: Record<string, string>
  moves: Record<string, string>
  abilities: Record<string, string>
  items: Record<string, string>
}

const FILE_FOR: Record<Kind, (typeof CSV_FILES)[number]> = {
  species: 'pokemon_species_names.csv',
  moves: 'move_names.csv',
  abilities: 'ability_names.csv',
  items: 'item_names.csv',
}

/** Key aliases: Showdown key -> PokeAPI English key (when English names differ). Used only when
 * building the snapshot (`--update-names`); the result is baked into names/de.json. */
export const KEY_ALIASES: Record<Kind, Record<string, string>> = {
  species: {},
  moves: {},
  abilities: {},
  // Showdown "Stick" is PokeAPI "Leek"
  items: { stick: 'leek' },
}

/** PokeAPI CSV text -> { english name key -> German name } (pure). */
export function tableFromCsv(text: string, aliases: Record<string, string> = {}): DeTable {
  const rows = parseCsv(text)
  const en = new Map<string, string>()
  const de = new Map<string, string>()
  for (const [id, lang, name] of rows.slice(1)) {
    if (!id || !name) continue
    if (lang === '9') en.set(id, name)
    else if (lang === '6') de.set(id, name)
  }
  const table: DeTable = new Map()
  for (const [id, enName] of en) {
    const deName = de.get(id)
    if (deName) table.set(nameKey(enName), deName)
  }
  for (const [from, to] of Object.entries(aliases)) {
    const hit = table.get(to)
    if (hit && !table.has(from)) table.set(from, hit)
  }
  return table
}

const sortedObject = (m: Iterable<[string, string]>) =>
  Object.fromEntries([...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

/** Download PokeAPI CSVs (network, only for --update-names) and build a snapshot file. */
export async function buildSnapshotFromPokeApi(date: string): Promise<NamesFile> {
  const out: NamesFile = {
    meta: {
      source:
        'PokeAPI/pokeapi data/v2/csv (language 6 = de), keyed by Showdown id of the English name',
      date,
    },
    species: {},
    moves: {},
    abilities: {},
    items: {},
  }
  for (const kind of KINDS) {
    const file = FILE_FOR[kind]
    const text = await cachedText(POKEAPI_CSV_BASE + file, `pokeapi/${file}`, 7 * 24 * 3600_000)
    if (text === null) throw new Error(`PokeAPI CSV missing: ${file}`)
    out[kind] = sortedObject(tableFromCsv(text, KEY_ALIASES[kind]))
  }
  return out
}

/** Merge a committed snapshot and the hand-maintained overrides into lookup tables (pure). */
export function mergeNames(snapshot: NamesFile, overrides?: Partial<NamesFile>): DeTables {
  const tables = {
    snapshotDate: snapshot.meta?.date ?? '',
    overrides: { species: {}, moves: {}, abilities: {}, items: {} },
  } as DeTables
  for (const kind of KINDS) {
    tables[kind] = new Map(Object.entries(snapshot[kind] ?? {}))
    tables.overrides[kind] = { ...(overrides?.[kind] ?? {}) }
  }
  return tables
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return undefined
  }
}

/**
 * Load German names: the committed snapshot + overrides. PokeAPI is contacted ONLY when
 * `update` is true (`npm run build:data -- --update-names`), which rewrites the snapshot.
 */
export async function loadDeTables(
  update = process.argv.includes('--update-names'),
): Promise<DeTables> {
  if (update) {
    const snap = await buildSnapshotFromPokeApi(new Date().toISOString().slice(0, 10))
    await mkdir(NAMES_DIR, { recursive: true })
    await writeFile(SNAPSHOT_FILE, JSON.stringify(snap, null, 1) + '\n')
    console.log(`Names snapshot rewritten: ${SNAPSHOT_FILE}`)
  }
  const snapshot = await readJson<NamesFile>(SNAPSHOT_FILE)
  if (!snapshot) {
    throw new Error(`Missing ${SNAPSHOT_FILE}. Run: npm run build:data -- --update-names`)
  }
  return mergeNames(snapshot, await readJson<Partial<NamesFile>>(OVERRIDES_FILE))
}

export interface DeResult {
  de: string
  /** native = found in PokéAPI; derived = built from base species name; fallback = English */
  how: 'native' | 'override' | 'derived' | 'fallback'
}

export function lookupDe(tables: DeTables, kind: Kind, en: string): DeResult {
  const key = nameKey(en)
  const override = tables.overrides[kind][key]
  if (override) return { de: override, how: 'override' }
  const hit = tables[kind].get(key)
  if (hit) return { de: hit, how: 'native' }
  if (kind === 'moves' && key.startsWith('hiddenpower') && key.length > 11) {
    // "Hidden Power Fire" -> "Kraftreserve (Fire)"
    const base = tables.moves.get('hiddenpower')
    if (base) return { de: `${base} (${en.slice('Hidden Power '.length)})`, how: 'derived' }
  }
  if (kind === 'abilities' && en.includes('(')) {
    // "As One (Glastrier)", "Embody Aspect (Teal)" share the parent ability's name
    const parent = tables.abilities.get(nameKey(en.slice(0, en.indexOf('('))))
    if (parent) return { de: parent, how: 'derived' }
  }
  return { de: en, how: 'fallback' }
}

const REGIONAL = new Set(['Alola', 'Galar', 'Hisui', 'Paldea'])

/** German name for a species or forme; formes derive from the base species' German name. */
export function speciesDe(
  tables: DeTables,
  en: string,
  baseEn: string,
  forme: string | undefined,
): DeResult {
  const direct = lookupDe(tables, 'species', en)
  if (direct.how !== 'fallback' || !forme) return direct
  const base = lookupDe(tables, 'species', baseEn)
  if (base.how === 'fallback') return direct
  const parts = forme.split('-')
  if (parts[0] === 'Mega') {
    const rest = parts.slice(1).join(' ')
    return { de: `Mega-${base.de}${rest ? ' ' + rest : ''}`, how: 'derived' }
  }
  if (parts[0] === 'Primal') return { de: `Proto-${base.de}`, how: 'derived' }
  if (REGIONAL.has(parts[0] ?? '') && parts.length === 1) {
    return { de: `${parts[0]}-${base.de}`, how: 'derived' }
  }
  return { de: `${base.de}-${forme}`, how: 'derived' }
}

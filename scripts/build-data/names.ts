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
/** English-name key -> German name */
export type DeTable = Map<string, string>
export type DeTables = Record<Kind, DeTable>

const FILE_FOR: Record<Kind, (typeof CSV_FILES)[number]> = {
  species: 'pokemon_species_names.csv',
  moves: 'move_names.csv',
  abilities: 'ability_names.csv',
  items: 'item_names.csv',
}

/**
 * Explicit overrides: Showdown/English key -> German name, for entities whose English name in
 * PokéAPI does not normalize to the same key as the Showdown name.
 */
export const DE_OVERRIDES: Record<Kind, Record<string, string>> = {
  species: {},
  moves: {},
  abilities: {},
  items: {},
}

/** Key aliases: Showdown key -> PokéAPI English key (when English names differ). */
export const KEY_ALIASES: Record<Kind, Record<string, string>> = {
  species: {
    // Showdown "Nidoran-F"/"Nidoran-M" vs PokéAPI "Nidoran♀"/"Nidoran♂" (handled by nameKey too)
  },
  moves: {},
  abilities: {},
  // Showdown "Stick" is PokéAPI "Leek"
  items: { stick: 'leek' },
}

async function loadTable(kind: Kind): Promise<DeTable> {
  const file = FILE_FOR[kind]
  const text = await cachedText(POKEAPI_CSV_BASE + file, `pokeapi/${file}`, 7 * 24 * 3600_000)
  if (text === null) throw new Error(`PokéAPI CSV missing: ${file}`)
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
  return table
}

export async function loadDeTables(): Promise<DeTables> {
  const [species, moves, abilities, items] = await Promise.all(
    (['species', 'moves', 'abilities', 'items'] as const).map(loadTable),
  )
  return { species: species!, moves: moves!, abilities: abilities!, items: items! }
}

export interface DeResult {
  de: string
  /** native = found in PokéAPI; derived = built from base species name; fallback = English */
  how: 'native' | 'override' | 'derived' | 'fallback'
}

export function lookupDe(tables: DeTables, kind: Kind, en: string): DeResult {
  const key = nameKey(en)
  const override = DE_OVERRIDES[kind][key]
  if (override) return { de: override, how: 'override' }
  const hit = tables[kind].get(KEY_ALIASES[kind][key] ?? key)
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

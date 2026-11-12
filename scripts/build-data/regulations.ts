/**
 * Per-regulation legal pools (species, items, moves) written to
 * src/data/generated/<gen>/regulations.json.
 *
 * Two sources:
 *  - 'showdown': derived from a Showdown format with Showdown's own machinery
 *    (Dex.formats.get -> TeamValidator rule table: checkSpecies / checkItem / checkMove, i.e.
 *    isNonstandard, tag bans such as Restricted Legendary / Mythical, explicit banlists).
 *  - 'manual': regulations/manual.json (schema below), for a regulation the pinned Showdown does
 *    not know yet, or to override a derived list.
 *
 * Ability legality is species-own (the dex record of the species) and therefore not stored here.
 * `moves` is only emitted when the regulation allows fewer moves than the dex lists; a regulation's
 * `learnsets` field holds changes relative to the dex learnsets (Showdown has no per-regulation
 * learnsets for most formats).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { RegConfig } from './config'
import { showdownApi } from './dex-sources'
import type { Extras, RawGen } from './dex-sources'
import type { LearnsetDelta, RegulationRecord, RegulationsFile } from '../../src/data/types'

export const MANUAL_FILE = path.resolve(import.meta.dirname, 'regulations/manual.json')

/**
 * regulations/manual.json:
 * {
 *   "gens": { "<gen>": { "<regulation id>": ManualRegulation } }
 * }
 * (keys starting with "_" are comments). Ids are Showdown ids (lowercase alphanumerics). Every
 * regulation that is listed here must also be listed in `GenConfig.regulations` (config.ts), which
 * owns label, order and default.
 */
export interface ManualRegulation {
  /** Start from another regulation of the same gen (listed earlier in config.ts) */
  base?: string
  /** Complete replacement of a list; otherwise base/derived list + add - remove */
  species?: string[]
  items?: string[]
  moves?: string[]
  addSpecies?: string[]
  removeSpecies?: string[]
  addItems?: string[]
  removeItems?: string[]
  addMoves?: string[]
  removeMoves?: string[]
  /** Changes to the dex learnsets, e.g. {"add": {"charizard": ["slash"]}, "remove": {...}} */
  learnsets?: LearnsetDelta
  /** false: could not be checked against an authoritative public source */
  verified: boolean
  /** Where the data comes from (shown in the gate report / docs, not in the app) */
  source: string
  note?: string
}
export interface ManualFile {
  gens: Record<string, Record<string, ManualRegulation>>
}

const LIST_KEYS = [
  'species',
  'items',
  'moves',
  'addSpecies',
  'removeSpecies',
  'addItems',
  'removeItems',
  'addMoves',
  'removeMoves',
] as const
const ID = /^[a-z0-9]+$/

export function parseManual(raw: unknown): ManualFile {
  const fail = (m: string): never => {
    throw new Error(`regulations/manual.json: ${m}`)
  }
  if (!raw || typeof raw !== 'object' || !('gens' in raw)) return fail('missing "gens"')
  const gens = (raw as { gens: Record<string, Record<string, unknown>> }).gens
  const out: ManualFile = { gens: {} }
  for (const [gen, regs] of Object.entries(gens)) {
    if (gen.startsWith('_')) continue
    for (const [id, v] of Object.entries(regs)) {
      if (id.startsWith('_')) continue
      const where = `${gen}/${id}`
      if (!ID.test(id)) fail(`${where}: bad regulation id`)
      const m = v as Record<string, unknown>
      if (typeof m.verified !== 'boolean') fail(`${where}: "verified" (boolean) is required`)
      if (typeof m.source !== 'string' || !m.source) fail(`${where}: "source" is required`)
      for (const k of LIST_KEYS) {
        const l = m[k]
        if (l === undefined) continue
        if (!Array.isArray(l) || l.some((x) => typeof x !== 'string' || !ID.test(x)))
          fail(`${where}: "${k}" must be an array of ids`)
      }
      for (const d of ['add', 'remove'] as const) {
        for (const [sp, moves] of Object.entries(
          (m.learnsets as LearnsetDelta | undefined)?.[d] ?? {},
        )) {
          if (!ID.test(sp) || !Array.isArray(moves) || moves.some((x) => !ID.test(String(x))))
            fail(`${where}: learnsets.${d}.${sp} is malformed`)
        }
      }
      ;(out.gens[gen] ??= {})[id] = m as unknown as ManualRegulation
    }
  }
  return out
}

export async function loadManual(file = MANUAL_FILE): Promise<ManualFile> {
  try {
    return parseManual(JSON.parse(await readFile(file, 'utf8')))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { gens: {} }
    throw e
  }
}

/** Entities the manual regulations of `gen` need in the dex (see dex-sources `Extras`). */
export function manualExtras(manual: ManualFile, gen: string): Extras {
  const regs = Object.values(manual.gens[gen] ?? {})
  const uniq = (f: (r: ManualRegulation) => (string[] | undefined)[]) => [
    ...new Set(regs.flatMap((r) => f(r).flatMap((l) => l ?? []))),
  ]
  const deltaMoves = regs.flatMap((r) => Object.values(r.learnsets?.add ?? {}).flat())
  return {
    species: uniq((r) => [r.species, r.addSpecies]),
    items: uniq((r) => [r.items, r.addItems]),
    moves: [...new Set([...uniq((r) => [r.moves, r.addMoves]), ...deltaMoves])],
  }
}

interface Lists {
  species: string[]
  items: string[]
  moves: string[]
}

const sortedUnique = (ids: Iterable<string>) => [...new Set(ids)].sort()

/** Legal ids of a Showdown format, intersected with what the dex of the generation contains. */
export function deriveFromShowdown(format: string, raw: RawGen): Lists & { missing: Lists } {
  const { Dex, TeamValidator } = showdownApi()
  const fmt = Dex.formats.get(format)
  if (!fmt.exists) throw new Error(`Showdown format "${format}" does not exist`)
  const v = new TeamValidator(format)
  const dex = v.dex
  const set = { name: 'x', species: 'x' }
  const species = dex.species
    .all()
    .filter((s) => s.exists && !s.isCosmeticForme && v.checkSpecies(set, s, s, {}) === null)
    .map((s) => s.id)
  const items = dex.items
    .all()
    .filter((i) => i.exists && i.id && v.checkItem(set, i, {}) === null)
    .map((i) => i.id)
  const moves = dex.moves
    .all()
    .filter((m) => m.exists && v.checkMove(set, m, {}) === null)
    .map((m) => m.id)
  const inDex = {
    species: new Set(raw.species.map((s) => s.id)),
    items: new Set(raw.items.map((i) => i.id)),
    moves: new Set(raw.moves.map((m) => m.id)),
  }
  const split = (ids: string[], known: Set<string>) => ({
    kept: sortedUnique(ids.filter((id) => known.has(id))),
    missing: sortedUnique(ids.filter((id) => !known.has(id))),
  })
  const s = split(species, inDex.species)
  const i = split(items, inDex.items)
  const m = split(moves, inDex.moves)
  return {
    species: s.kept,
    items: i.kept,
    moves: m.kept,
    missing: { species: s.missing, items: i.missing, moves: m.missing },
  }
}

function applyList(
  base: string[] | undefined,
  full: string[] | undefined,
  add: string[] | undefined,
  remove: string[] | undefined,
  known: Set<string>,
  what: string,
): string[] {
  const ids = new Set(full ?? base ?? [])
  for (const id of add ?? []) ids.add(id)
  for (const id of remove ?? []) ids.delete(id)
  const unknown = [...ids].filter((id) => !known.has(id))
  if (unknown.length)
    throw new Error(`${what}: ids not in the dex: ${unknown.slice(0, 8).join(', ')}`)
  return sortedUnique(ids)
}

/** Apply a manual regulation on top of the (already derived) base lists. Pure. */
export function applyManual(
  base: Lists | undefined,
  m: ManualRegulation,
  known: { species: Set<string>; items: Set<string>; moves: Set<string> },
  what: string,
): Lists {
  return {
    species: applyList(
      base?.species,
      m.species,
      m.addSpecies,
      m.removeSpecies,
      known.species,
      `${what} species`,
    ),
    items: applyList(base?.items, m.items, m.addItems, m.removeItems, known.items, `${what} items`),
    moves: applyList(
      base?.moves ?? [...known.moves],
      m.moves,
      m.addMoves,
      m.removeMoves,
      known.moves,
      `${what} moves`,
    ),
  }
}

export interface RegulationsResult {
  file: RegulationsFile
  /** Build notes (ids Showdown considers legal that the dex lacks, unverified lists, ...) */
  notes: string[]
}

/** Build regulations.json content for one generation; undefined when the gen has none. */
export function buildRegulations(
  gen: string,
  configs: RegConfig[] | undefined,
  raw: RawGen,
  manual: ManualFile,
): RegulationsResult | undefined {
  if (!configs?.length) {
    if (Object.keys(manual.gens[gen] ?? {}).length)
      throw new Error(`${gen}: manual regulations exist but config.ts lists none`)
    return undefined
  }
  const notes: string[] = []
  const manualRegs = manual.gens[gen] ?? {}
  for (const id of Object.keys(manualRegs)) {
    if (!configs.some((c) => c.id === id))
      throw new Error(`${gen}: manual regulation "${id}" is not listed in config.ts`)
  }
  if (configs.filter((c) => c.default).length !== 1)
    throw new Error(`${gen}: exactly one regulation must be the default`)
  const known = {
    species: new Set(raw.species.map((s) => s.id)),
    items: new Set(raw.items.map((i) => i.id)),
    moves: new Set(raw.moves.map((m) => m.id)),
  }
  // Process in dependency order (a manual `base` may be listed after the regulation in config.ts)
  const lists = new Map<string, Lists>()
  const derived = new Map<string, Lists>()
  const resolve = (c: RegConfig, stack: string[] = []): Lists => {
    const cached = lists.get(c.id)
    if (cached) return cached
    if (stack.includes(c.id)) throw new Error(`${gen}: regulation base cycle at ${c.id}`)
    const man = manualRegs[c.id]
    let base: Lists | undefined
    if (man?.base) {
      const bc = configs.find((x) => x.id === man.base)
      if (!bc) throw new Error(`${gen}/${c.id}: unknown base "${man.base}"`)
      base = resolve(bc, [...stack, c.id])
    } else if (c.format && !(man && hasFullLists(man))) {
      const d = deriveFromShowdown(c.format, raw)
      for (const [k, ids] of Object.entries(d.missing))
        if (ids.length)
          notes.push(
            `${gen}/${c.id}: Showdown lists ${ids.length} legal ${k} that the dex lacks (${ids.slice(0, 6).join(', ')}${ids.length > 6 ? ', ...' : ''})`,
          )
      base = { species: d.species, items: d.items, moves: d.moves }
      derived.set(c.id, base)
    } else if (!man) {
      throw new Error(`${gen}/${c.id}: no Showdown format and no manual entry`)
    }
    const out = man ? applyManual(base, man, known, `${gen}/${c.id}`) : base!
    lists.set(c.id, out)
    return out
  }
  const regulations: RegulationRecord[] = configs.map((c) => {
    const l = resolve(c)
    const man = manualRegs[c.id]
    const rec: RegulationRecord = {
      id: c.id,
      label: c.label,
      ...(c.format ? { showdownFormat: c.format } : {}),
      ...(c.default ? { default: true as const } : {}),
      source: man ? 'manual' : 'showdown',
      ...(man ? { verified: man.verified } : {}),
      species: l.species,
      items: l.items,
    }
    if (l.moves.length < known.moves.size) rec.moves = l.moves
    if (man?.learnsets && (man.learnsets.add || man.learnsets.remove)) {
      for (const d of ['add', 'remove'] as const)
        for (const [sp, mv] of Object.entries(man.learnsets[d] ?? {})) {
          if (!known.species.has(sp)) throw new Error(`${gen}/${c.id}: learnset species ${sp}`)
          const bad = mv.filter((x) => !known.moves.has(x))
          if (bad.length) throw new Error(`${gen}/${c.id}: learnset moves not in dex: ${bad}`)
        }
      rec.learnsets = man.learnsets
    }
    if (man && !man.verified) notes.push(`${gen}/${c.id}: manual regulation is NOT verified`)
    return rec
  })
  return { file: { gen: gen as RegulationsFile['gen'], regulations }, notes }
}

const hasFullLists = (m: ManualRegulation) => !!(m.species && m.items)

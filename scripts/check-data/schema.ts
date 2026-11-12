/** Schema + referential validation of src/data/generated (zod). Pure over already-parsed JSON. */
import { z } from 'zod'
import { GEN_IDS } from '../../src/data/types'

const id = z.string().regex(/^[a-z0-9]+$/)
const stat = z.number().int().min(1).max(255)
const named = z.object({ id, en: z.string().min(1), de: z.string().min(1) }).strict()

const species = z
  .object({
    id,
    en: z.string().min(1),
    de: z.string().min(1),
    num: z.number().int(),
    types: z.array(z.string()).min(1).max(2),
    bs: z.tuple([stat, stat, stat, stat, stat, stat]),
    abilities: z.array(id),
    hiddenAbility: id.optional(),
    base: id.optional(),
    forme: z.string().optional(),
    formes: z.array(id).optional(),
    prevo: id.optional(),
    evos: z.array(id).optional(),
    requiredItem: id.optional(),
    isMega: z.literal(true).optional(),
  })
  .strict()

const move = z
  .object({
    id,
    en: z.string().min(1),
    de: z.string().min(1),
    type: z.string().min(1),
    category: z.enum(['Physical', 'Special', 'Status']),
    bp: z.number().min(0),
  })
  .strict()

const searchEntries = z.array(z.tuple([id, z.string(), z.string()]))

export const DexSchema = z
  .object({
    meta: z
      .object({
        gen: z.enum(GEN_IDS),
        label: z.string().min(1),
        source: z.string().min(1),
        gaps: z.array(z.string()),
        statPoints: z.literal(true).optional(),
      })
      .strict(),
    species: z.array(species).min(1),
    moves: z.array(move).min(1),
    items: z.array(named),
    abilities: z.array(named),
    search: z
      .object({
        species: searchEntries,
        moves: searchEntries,
        items: searchEntries,
        abilities: searchEntries,
      })
      .strict(),
  })
  .strict()

export const LearnsetsSchema = z.record(id, z.array(id).min(1))

const evs = z
  .object({
    hp: z.number().int().min(0),
    atk: z.number().int().min(0),
    def: z.number().int().min(0),
    spa: z.number().int().min(0),
    spd: z.number().int().min(0),
    spe: z.number().int().min(0),
  })
  .strict()

const commonSet = z
  .object({
    ability: id,
    item: id,
    nature: z.string().min(1),
    evs,
    moves: z.array(id).min(1).max(4),
    teraType: z.string().optional(),
    usagePct: z.number().min(0).max(100),
    speciesUsagePct: z.number().min(0).max(100).optional(),
    source: z.string().min(1),
    format: z.string().min(1),
    /** YYYY-MM for usage sets, '' for curated sets */
    month: z.union([z.string().regex(/^\d{4}-\d{2}$/), z.literal('')]),
  })
  .strict()
export const SetsSchema = z.record(id, z.array(commonSet).min(1))

export const VersionSchema = z
  .object({
    ncpSha: z.string().regex(/^[0-9a-f]{40}$/),
    ncpSyncedAt: z.string().min(1),
    showdownVersion: z.string().regex(/^\d+\.\d+\.\d+/),
    usageMonths: z.record(z.string(), z.array(z.string().regex(/^\d{4}-\d{2}$/))),
    namesSnapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    builtAt: z.string().min(1),
  })
  .strict()

export type Files = {
  dex: unknown
  learnsets: unknown
  sets: unknown
}

const fmt = (e: z.ZodError) =>
  e.issues
    .slice(0, 5)
    .map((i) => `${i.path.slice(0, 4).join('.')}: ${i.message}`)
    .join('; ')

/**
 * Validate one generation's three files. `errors` fail the gate; `warnings` are known data quirks
 * (e.g. Z-A Mega abilities that Showdown still flags non-standard) reported as notes only.
 */
export function validateGen(gen: string, f: Files): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const dex = DexSchema.safeParse(f.dex)
  if (!dex.success) errors.push(`${gen}/dex.json: ${fmt(dex.error)}`)
  const ls = LearnsetsSchema.safeParse(f.learnsets)
  if (!ls.success) errors.push(`${gen}/learnsets.json: ${fmt(ls.error)}`)
  const sets = SetsSchema.safeParse(f.sets)
  if (!sets.success) errors.push(`${gen}/sets.json: ${fmt(sets.error)}`)
  if (!dex.success || !ls.success || !sets.success) return { errors, warnings }
  if (dex.data.meta.gen !== gen) errors.push(`${gen}/dex.json: meta.gen is "${dex.data.meta.gen}"`)

  // referential integrity
  const ids = {
    species: new Set(dex.data.species.map((s) => s.id)),
    moves: new Set(dex.data.moves.map((m) => m.id)),
    items: new Set(dex.data.items.map((i) => i.id)),
    abilities: new Set(dex.data.abilities.map((a) => a.id)),
  }
  const dup = (kind: keyof typeof ids, n: number, tolerated = 0) => {
    if (ids[kind].size + tolerated < n) errors.push(`${gen}/dex.json: duplicate ${kind} ids`)
  }
  // typed Hidden Power variants share the id "hiddenpower" in the data files
  const hp = dex.data.moves.filter((m) => m.id === 'hiddenpower').length
  dup('species', dex.data.species.length)
  dup('moves', dex.data.moves.length, Math.max(0, hp - 1))
  dup('items', dex.data.items.length)
  dup('abilities', dex.data.abilities.length)
  for (const k of ['species', 'moves', 'items', 'abilities'] as const) {
    if (dex.data.search[k].length !== dex.data[k].length)
      errors.push(`${gen}/dex.json: search.${k} length differs from ${k}`)
  }
  const bad: string[] = []
  const soft: string[] = []
  const need = (set: Set<string>, v: string | undefined, what: string, into = bad) => {
    if (v && !set.has(v)) into.push(`${what} -> ${v}`)
  }
  for (const s of dex.data.species) {
    for (const a of s.abilities) need(ids.abilities, a, `species ${s.id} ability`, soft)
    need(ids.abilities, s.hiddenAbility, `species ${s.id} hiddenAbility`, soft)
    need(ids.species, s.base, `species ${s.id} base`)
    need(ids.species, s.prevo, `species ${s.id} prevo`)
    for (const e of s.evos ?? []) need(ids.species, e, `species ${s.id} evo`)
    // requiredItem is intentionally not checked: forme-only items (e.g. Ogerpon masks) need not be
    // legal items of the gen
  }
  for (const [sid, list] of Object.entries(ls.data)) {
    need(ids.species, sid, 'learnset species')
    for (const m of list) need(ids.moves, m, `learnset ${sid} move`)
  }
  for (const [sid, list] of Object.entries(sets.data)) {
    need(ids.species, sid, 'sets species')
    for (const s of list) {
      need(ids.abilities, s.ability, `set ${sid} ability`)
      need(ids.items, s.item, `set ${sid} item`)
      for (const m of s.moves) need(ids.moves, m, `set ${sid} move`)
    }
  }
  if (bad.length)
    errors.push(`${gen}: ${bad.length} dangling reference(s), e.g. ${bad.slice(0, 5).join('; ')}`)
  if (soft.length)
    warnings.push(
      `${gen}: ${soft.length} species ability reference(s) missing from the abilities list, e.g. ${soft.slice(0, 3).join('; ')}`,
    )
  return { errors, warnings }
}

export function countsOf(f: Files) {
  const dex = f.dex as {
    species?: unknown[]
    moves?: unknown[]
    items?: unknown[]
    abilities?: unknown[]
  }
  const n = (a: unknown) => (Array.isArray(a) ? a.length : 0)
  const o = (a: unknown) => (a && typeof a === 'object' ? Object.keys(a).length : 0)
  return {
    species: n(dex?.species),
    moves: n(dex?.moves),
    items: n(dex?.items),
    abilities: n(dex?.abilities),
    learnsets: o(f.learnsets),
    sets: o(f.sets),
  }
}
export type Counts = ReturnType<typeof countsOf>

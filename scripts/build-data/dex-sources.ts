import { createRequire } from 'node:module'
import path from 'node:path'
import { Dex as PkmnDex } from '@pkmn/dex'
import { Generations } from '@pkmn/data'
import type { GenConfig } from './config'
import { CACHE_DIR } from './fetch'
import { nameKey } from './names'

/** Language-free intermediate entity data. */
export interface RawSpecies {
  id: string
  name: string
  num: number
  types: string[]
  bs: [number, number, number, number, number, number]
  abilities: string[]
  hiddenAbility?: string
  base?: string
  baseName: string
  forme?: string
  /** forme suffix kept even when the base species is not in this dex */
  formeName?: string
  prevo?: string
  evos: string[]
  requiredItem?: string
  isMega?: boolean
}
export interface RawMove {
  id: string
  name: string
  type: string
  category: 'Physical' | 'Special' | 'Status'
  bp: number
}
export interface RawNamed {
  id: string
  name: string
}
export interface RawGen {
  source: string
  species: RawSpecies[]
  moves: RawMove[]
  items: RawNamed[]
  abilities: RawNamed[]
  learnsets: Record<string, string[]>
  /** Resolve any display name (e.g. from smogon stats) to an id in this gen, or undefined */
  resolve: {
    species: (name: string) => string | undefined
    moves: (name: string) => string | undefined
    items: (name: string) => string | undefined
    abilities: (name: string) => string | undefined
  }
}

// Minimal structural types for the parts of the Dex API we use (shared by @pkmn/dex and Showdown).
interface DexEntity {
  id: string
  name: string
  exists: boolean
  isNonstandard?: string | null
}
interface DexSpecies extends DexEntity {
  num: number
  types: string[]
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }
  abilities: Record<string, string>
  baseSpecies: string
  forme: string
  prevo: string
  evos: string[]
  requiredItem?: string
  isMega?: boolean
  isCosmeticForme?: boolean
  changesFrom?: string
}
interface DexMove extends DexEntity {
  type: string
  category: 'Physical' | 'Special' | 'Status'
  basePower: number
}
interface DexLike {
  species: { get(n: string): DexSpecies }
  moves: { get(n: string): DexMove }
  items: { get(n: string): DexEntity }
  abilities: { get(n: string): DexEntity }
}

function toRawSpecies(s: DexSpecies, dex: DexLike): RawSpecies {
  const isForme = s.baseSpecies && s.baseSpecies !== s.name
  const a = s.abilities
  const regular = [a['0'], a['1'], a['S']].filter((x): x is string => !!x)
  const raw: RawSpecies = {
    id: s.id,
    name: s.name,
    num: s.num,
    types: [...s.types],
    bs: [
      s.baseStats.hp,
      s.baseStats.atk,
      s.baseStats.def,
      s.baseStats.spa,
      s.baseStats.spd,
      s.baseStats.spe,
    ],
    abilities: regular.map((n) => dex.abilities.get(n).id),
    baseName: s.baseSpecies || s.name,
    evos: (s.evos ?? []).map((n) => dex.species.get(n).id),
  }
  if (a['H']) raw.hiddenAbility = dex.abilities.get(a['H']).id
  if (isForme) {
    raw.base = dex.species.get(s.baseSpecies).id
    raw.forme = s.forme || s.name.slice(s.baseSpecies.length + 1)
    raw.formeName = raw.forme
  }
  if (s.prevo) raw.prevo = dex.species.get(s.prevo).id
  if (s.requiredItem) raw.requiredItem = dex.items.get(s.requiredItem).id
  if (s.isMega) raw.isMega = true
  return raw
}

function resolvers(dex: DexLike): RawGen['resolve'] {
  const mk = (get: (n: string) => DexEntity, ok: (id: string) => boolean) => (name: string) => {
    const e = get(name)
    return e.exists && ok(e.id) ? e.id : undefined
  }
  return {
    species: mk(
      (n) => dex.species.get(n),
      () => true,
    ),
    moves: mk(
      (n) => dex.moves.get(n),
      () => true,
    ),
    items: mk(
      (n) => dex.items.get(n),
      () => true,
    ),
    abilities: mk(
      (n) => dex.abilities.get(n),
      () => true,
    ),
  }
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// ---------------------------------------------------------------- @pkmn path

async function loadPkmn(cfg: GenConfig & { source: { kind: 'pkmn' } }): Promise<RawGen> {
  const gens = new Generations(PkmnDex)
  const gen = gens.get(cfg.source.gen)
  const dex = gen.dex as unknown as DexLike
  const species: RawSpecies[] = []
  for (const s of gen.species) {
    if ((s as unknown as DexSpecies).isCosmeticForme) continue
    species.push(toRawSpecies(s as unknown as DexSpecies, dex))
  }
  const moves: RawMove[] = []
  for (const m of gen.moves) {
    moves.push({
      id: m.id,
      name: m.name,
      type: m.type,
      category: m.category,
      bp: m.basePower,
    })
  }
  const items: RawNamed[] = []
  for (const i of gen.items) items.push({ id: i.id, name: i.name })
  const abilities: RawNamed[] = []
  for (const a of gen.abilities) abilities.push({ id: a.id, name: a.name })

  const moveIds = new Set(moves.map((m) => m.id))
  const learnsets: Record<string, string[]> = {}
  if (cfg.source.gen >= 1) {
    for (const s of species) {
      const learnable = await gen.learnsets.learnable(s.id)
      if (!learnable) continue
      const ids = Object.keys(learnable).filter((m) => moveIds.has(m))
      if (ids.length) learnsets[s.id] = ids.sort()
    }
  }
  const sets = {
    species: new Set(species.map((s) => s.id)),
    moves: moveIds,
    items: new Set(items.map((i) => i.id)),
    abilities: new Set(abilities.map((a) => a.id)),
  }
  const r = resolvers(dex)
  const guard =
    (k: keyof typeof sets) =>
    (n: string): string | undefined => {
      const id = r[k](n)
      return id && sets[k].has(id) ? id : undefined
    }
  return {
    source: `@pkmn/dex + @pkmn/data Generations gen${cfg.source.gen}`,
    species: species.sort(byId),
    moves: moves.sort(byId),
    items: items.sort(byId),
    abilities: abilities.sort(byId),
    learnsets,
    resolve: {
      species: guard('species'),
      moves: guard('moves'),
      items: guard('items'),
      abilities: guard('abilities'),
    },
  }
}

// --------------------------------------------------- Showdown data-mod path

interface PsDex extends DexLike {
  species: DexLike['species'] & {
    all(): DexSpecies[]
    getLearnsetData(id: string): { learnset?: Record<string, string[]> }
  }
  moves: DexLike['moves'] & { all(): DexMove[] }
  items: DexLike['items'] & { all(): DexEntity[] }
  abilities: DexLike['abilities'] & { all(): DexEntity[] }
}

let psDexModule: { Dex: { mod(id: string): PsDex } } | undefined
function loadPsDex() {
  if (!psDexModule) {
    // pokemon-showdown is installed into the (untrusted-data-only) cache dir by install-ps.ts
    const req = createRequire(path.join(CACHE_DIR, 'ps', 'package.json'))
    psDexModule = req('pokemon-showdown') as typeof psDexModule
  }
  return psDexModule!.Dex
}

async function loadPsMod(cfg: GenConfig & { source: { kind: 'ps' } }): Promise<RawGen> {
  const { mod, learnGen } = cfg.source
  const dex = loadPsDex().mod(mod)
  const legal = (e: DexEntity) => e.exists && !e.isNonstandard
  const speciesAll = dex.species.all().filter((s) => legal(s) && !s.isCosmeticForme && s.num > 0)
  const species = speciesAll.map((s) => toRawSpecies(s, dex))
  const speciesIds = new Set(species.map((s) => s.id))
  // Drop prevo/evo/base links to species that are not in this mod's dex.
  for (const s of species) {
    if (s.prevo && !speciesIds.has(s.prevo)) delete s.prevo
    s.evos = s.evos.filter((e) => speciesIds.has(e))
    if (s.base && !speciesIds.has(s.base)) {
      delete s.base
      delete s.forme
    }
  }

  const learnOf = (id: string): Set<string> => {
    const out = new Set<string>()
    let cur: DexSpecies | undefined = dex.species.get(id)
    let first = true
    const seen = new Set<string>()
    while (cur && cur.exists && !seen.has(cur.id)) {
      seen.add(cur.id)
      let data = dex.species.getLearnsetData(cur.id)?.learnset
      if (!data && first && cur.baseSpecies && cur.baseSpecies !== cur.name) {
        const base = dex.species.get(cur.baseSpecies)
        data = dex.species.getLearnsetData(base.id)?.learnset
        if (data) cur = base
      }
      for (const [mv, sources] of Object.entries(data ?? {})) {
        if (sources.some((src) => src.startsWith(learnGen))) out.add(mv)
      }
      first = false
      cur = cur.prevo ? dex.species.get(cur.prevo) : undefined
    }
    return out
  }
  const rawLearn: Record<string, Set<string>> = {}
  const usedMoves = new Set<string>()
  for (const s of species) {
    const set = learnOf(s.id)
    rawLearn[s.id] = set
    for (const m of set) usedMoves.add(m)
  }
  const moves: RawMove[] = dex.moves
    .all()
    .filter((m) => legal(m) && usedMoves.has(m.id))
    .map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      category: m.category,
      bp: m.basePower,
    }))
  const moveIds = new Set(moves.map((m) => m.id))
  const learnsets: Record<string, string[]> = {}
  for (const [sid, set] of Object.entries(rawLearn)) {
    const ids = [...set].filter((m) => moveIds.has(m)).sort()
    if (ids.length) learnsets[sid] = ids
  }
  const usedAbilities = new Set(species.flatMap((s) => [...s.abilities, s.hiddenAbility ?? '']))
  const abilities: RawNamed[] = dex.abilities
    .all()
    .filter((a) => legal(a) && usedAbilities.has(a.id))
    .map((a) => ({ id: a.id, name: a.name }))
  const items: RawNamed[] = dex.items
    .all()
    .filter(legal)
    .map((i) => ({ id: i.id, name: i.name }))

  const sets = {
    species: speciesIds,
    moves: moveIds,
    items: new Set(items.map((i) => i.id)),
    abilities: new Set(abilities.map((a) => a.id)),
  }
  const r = resolvers(dex)
  const guard =
    (k: keyof typeof sets) =>
    (n: string): string | undefined => {
      const id = r[k](n)
      return id && sets[k].has(id) ? id : undefined
    }
  return {
    source: `pokemon-showdown npm mod "${mod}"`,
    species: species.sort(byId),
    moves: moves.sort(byId),
    items: items.sort(byId),
    abilities: abilities.sort(byId),
    learnsets,
    resolve: {
      species: guard('species'),
      moves: guard('moves'),
      items: guard('items'),
      abilities: guard('abilities'),
    },
  }
}

export async function loadRawGen(cfg: GenConfig): Promise<RawGen> {
  if (cfg.source.kind === 'pkmn') {
    return loadPkmn(cfg as GenConfig & { source: { kind: 'pkmn' } })
  }
  return loadPsMod(cfg as GenConfig & { source: { kind: 'ps' } })
}

export { nameKey }

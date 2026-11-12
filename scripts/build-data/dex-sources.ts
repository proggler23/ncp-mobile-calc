import { createRequire } from 'node:module'
import path from 'node:path'
import type { GenConfig } from './config'
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

// Minimal structural types for the parts of the Dex API we use (Showdown Dex API).
interface DexEntity {
  id: string
  name: string
  exists: boolean
  isNonstandard?: string | null
  gen?: number
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
  battleOnly?: string | string[]
}
interface DexMove extends DexEntity {
  type: string
  category: 'Physical' | 'Special' | 'Status'
  basePower: number
  /** true for generic Max moves, the species name for G-Max signature moves */
  isMax?: boolean | string
}
interface DexLike {
  species: {
    get(n: string): DexSpecies
    all(): DexSpecies[]
    getLearnsetData(id: string): { exists?: boolean; learnset?: Record<string, string[]> }
  }
  moves: { get(n: string): DexMove; all(): DexMove[] }
  items: { get(n: string): DexEntity; all(): DexEntity[] }
  abilities: { get(n: string): DexEntity; all(): DexEntity[] }
}

const toID = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

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

// ------------------------------------------------------- mainline generations (Dex.forGen)

// Existence rules for the mainline generations, (same rules the previous @pkmn/data layer applied):
// the entity exists in the gen's data, is not flagged non-standard, and is not Illegal/Unreleased.
function genExists(d: DexEntity & { tier?: string }): boolean {
  if (!d.exists) return false
  if (d.isNonstandard) return false
  return !(d.tier && ['Illegal', 'Unreleased'].includes(d.tier))
}

const GEN3_HMS = new Set([
  'cut',
  'fly',
  'surf',
  'strength',
  'flash',
  'rocksmash',
  'waterfall',
  'dive',
])
const GEN4_HMS = new Set(['cut', 'fly', 'surf', 'strength', 'rocksmash', 'waterfall', 'rockclimb'])

/** Is a move with these learnset sources available in generation `genNum`? */
export function isLearnLegal(moveId: string, sources: string[] | undefined, genNum: number) {
  if (!sources) return false
  const gens = sources.map((x) => Number(x[0]))
  const minGen = Math.min(...gens)
  if (genNum >= 3 && minGen <= 4 && (GEN3_HMS.has(moveId) || GEN4_HMS.has(moveId))) {
    let legalGens = ''
    let available = false
    if (minGen === 3) {
      legalGens += '3'
      available = true
    }
    if (available) available = !GEN3_HMS.has(moveId)
    if (available || gens.includes(4)) {
      legalGens += '4'
      available = true
    }
    if (available) available = !GEN4_HMS.has(moveId)
    const minUpperGen = available ? 5 : Math.min(...gens.filter((g) => g > 4))
    legalGens += '0123456789'.slice(minUpperGen)
    return legalGens.includes(`${genNum}`)
  }
  return '0123456789'.slice(minGen).includes(`${genNum}`)
}

function loadGenSource(cfg: GenConfig & { source: { kind: 'gen' } }): RawGen {
  const genNum = cfg.source.gen
  const dex = loadPsDex().forGen(genNum)
  const exists = (e: DexEntity) => genExists(e)
  const speciesAll = dex.species.all().filter((s) => exists(s) && !s.isCosmeticForme)
  const speciesExists = (n: string) => !!n && exists(dex.species.get(n))
  const species: RawSpecies[] = speciesAll.map((s) => {
    // Gen-specific view of the species (abilities by generation, evolutions restricted to
    // species that exist in this gen).
    const a: Record<string, string> = {}
    if (genNum >= 3) {
      if (s.abilities['0']) a['0'] = s.abilities['0']
      const a1 = s.abilities['1']
      if (a1 && (dex.abilities.get(a1).gen ?? 0) <= genNum) a['1'] = a1
      if (genNum >= 5 && s.abilities['H']) a['H'] = s.abilities['H']
      if (genNum >= 7 && s.abilities['S']) a['S'] = s.abilities['S']
    }
    return toRawSpecies(
      {
        ...s,
        abilities: a,
        evos: (s.evos ?? []).filter(speciesExists),
        prevo: s.prevo && speciesExists(s.prevo) ? s.prevo : '',
      },
      dex,
    )
  })
  const moves: RawMove[] = dex.moves
    .all()
    // G-Max signature moves are not selectable moves (the previous @pkmn/data layer flagged
    // them 'Gmax'; current Showdown data leaves them standard in gen 8)
    .filter((m) => exists(m) && typeof m.isMax !== 'string')
    .map((m) => ({ id: m.id, name: m.name, type: m.type, category: m.category, bp: m.basePower }))
  const items: RawNamed[] = dex.items
    .all()
    .filter(exists)
    .map((i) => ({ id: i.id, name: i.name }))
  const abilities: RawNamed[] = dex.abilities
    .all()
    .filter((a) => exists(a) && a.id !== 'noability')
    .map((a) => ({ id: a.id, name: a.name }))

  const moveIds = new Set(moves.map((m) => m.id))
  const speciesById = new Map(speciesAll.map((s) => [s.id, s]))
  /** Learnset walk: species (or its battle-only/changesFrom base) then prevolutions. */
  const learnable = (start: DexSpecies): Record<string, string[]> => {
    const out: Record<string, string[]> = {}
    let sp: DexSpecies | undefined = start
    let id = sp.id
    let ld = dex.species.getLearnsetData(id)
    // entries without a learnset (cosmetic/battle formes) fall through to the battle-only /
    // base species
    if (!ld.exists || !ld.learnset) {
      const candidates = [
        typeof sp.battleOnly === 'string' && sp.battleOnly !== sp.baseSpecies
          ? toID(sp.battleOnly)
          : '',
        toID(sp.baseSpecies),
      ].filter(Boolean)
      for (const c of candidates) {
        const cand = dex.species.getLearnsetData(c)
        if (cand.exists && cand.learnset) {
          id = c
          ld = cand
          break
        }
      }
    }
    // The same learnset may be visited twice for formes (harmless: sources are de-duplicated).
    for (let hops = 0; ld.exists && ld.learnset && hops < 12; hops++) {
      for (const [mv, sources] of Object.entries(ld.learnset ?? {})) {
        if (!moveIds.has(mv) || !isLearnLegal(mv, sources, genNum)) continue
        const filtered = sources.filter((x) => +x.charAt(0) <= genNum)
        if (!filtered.length) continue
        const prev = out[mv]
        if (prev) {
          for (const src of filtered) {
            const prefix = src.slice(0, 2)
            if (!prev.some((x) => x.startsWith(prefix))) prev.push(src)
          }
        } else out[mv] = filtered
      }
      if (id === 'lycanrocdusk' || (sp.id === 'rockruff' && id === 'rockruff')) id = 'rockruffdusk'
      else if (sp.id === 'gastrodoneast') id = 'gastrodon'
      else if (sp.id === 'pumpkaboosuper') id = 'pumpkaboo'
      else id = toID(String(sp.battleOnly || sp.changesFrom || sp.prevo || ''))
      if (!id) break
      const next = speciesById.get(id)
      if (!next) break
      sp = next
      ld = dex.species.getLearnsetData(id)
    }
    return out
  }
  const learnsets: Record<string, string[]> = {}
  for (const s of species) {
    const ids = Object.keys(learnable(speciesById.get(s.id)!))
    if (ids.length) learnsets[s.id] = ids.sort()
  }
  return finish(
    `pokemon-showdown Dex.forGen(${genNum})`,
    dex,
    species,
    moves,
    items,
    abilities,
    learnsets,
  )
}

function finish(
  source: string,
  dex: DexLike,
  species: RawSpecies[],
  moves: RawMove[],
  items: RawNamed[],
  abilities: RawNamed[],
  learnsets: Record<string, string[]>,
): RawGen {
  const sets = {
    species: new Set(species.map((s) => s.id)),
    moves: new Set(moves.map((m) => m.id)),
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
    source,
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

interface PsDexModule {
  Dex: { mod(id: string): DexLike; forGen(gen: number): DexLike }
}
let psDexModule: PsDexModule | undefined
function loadPsDex() {
  if (!psDexModule) {
    // Official `pokemon-showdown` package, pinned (exact version) in package.json devDependencies.
    const req = createRequire(path.resolve(import.meta.dirname, '../../package.json'))
    psDexModule = req('pokemon-showdown') as PsDexModule
  }
  return psDexModule.Dex
}

function loadPsMod(cfg: GenConfig & { source: { kind: 'ps' } }): RawGen {
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

  return finish(
    `pokemon-showdown npm mod "${mod}"`,
    dex,
    species,
    moves,
    items,
    abilities,
    learnsets,
  )
}

export async function loadRawGen(cfg: GenConfig): Promise<RawGen> {
  if (cfg.source.kind === 'gen') {
    return loadGenSource(cfg as GenConfig & { source: { kind: 'gen' } })
  }
  return loadPsMod(cfg as GenConfig & { source: { kind: 'ps' } })
}

export { nameKey }

import { normalizeSearch } from '../data/normalize'
import type { GenData, GenId } from '../data/types'
import { newUid } from './ids'
import { LIMITS, STAT_KEYS, emptySpread } from './types'
import type { Gender, SavedSet, StatKey, StatSpread } from './types'

/**
 * Showdown paste import/export.
 *
 * Champions (Stat Points) representation: Showdown's own champions export (`useStatPoints`) prints
 * Stat Points on the normal "EVs:" line and omits "Tera Type:". We follow that: for
 * gen === 'champions' an "EVs:" line (also "SPs:" / "Stat Points:") is read as Stat Points when
 * every value is <= 32 and the total is <= 66; the result goes to `SavedSet.statPoints` (with `evs`
 * all zero). Otherwise a warning is emitted and the spread is dropped (no guessing EV -> SP).
 * Export of a champions set writes `statPoints` on the "EVs:" line and no "Tera Type:".
 */

export interface ImportResult {
  members: SavedSet[]
  warnings: string[]
}

type Names = Pick<GenData, 'species' | 'moves' | 'items' | 'abilities'>
interface Lookup {
  species: Map<string, string>
  moves: Map<string, string>
  items: Map<string, string>
  abilities: Map<string, string>
  en: {
    species: Map<string, string>
    moves: Map<string, string>
    items: Map<string, string>
    abilities: Map<string, string>
  }
}

const lookups = new WeakMap<object, Lookup>()

function build(records: { id: string; en: string; de: string }[]) {
  const byName = new Map<string, string>()
  const en = new Map<string, string>()
  // English first so an English name always wins over a clashing German one.
  for (const r of records) {
    byName.set(normalizeSearch(r.en), r.id)
    en.set(r.id, r.en)
  }
  for (const r of records) {
    const k = normalizeSearch(r.de)
    if (k && !byName.has(k)) byName.set(k, r.id)
  }
  return { byName, en }
}

function lookup(data: Names): Lookup {
  let l = lookups.get(data)
  if (!l) {
    const s = build(data.species)
    const m = build(data.moves)
    const i = build(data.items)
    const a = build(data.abilities)
    l = {
      species: s.byName,
      moves: m.byName,
      items: i.byName,
      abilities: a.byName,
      en: { species: s.en, moves: m.en, items: i.en, abilities: a.en },
    }
    lookups.set(data, l)
  }
  return l
}

const NATURES = [
  'Hardy',
  'Lonely',
  'Brave',
  'Adamant',
  'Naughty',
  'Bold',
  'Docile',
  'Relaxed',
  'Impish',
  'Lax',
  'Timid',
  'Hasty',
  'Serious',
  'Jolly',
  'Naive',
  'Modest',
  'Mild',
  'Quiet',
  'Bashful',
  'Rash',
  'Calm',
  'Gentle',
  'Sassy',
  'Careful',
  'Quirky',
] as const
const TYPES = [
  'Normal',
  'Fire',
  'Water',
  'Electric',
  'Grass',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dragon',
  'Dark',
  'Steel',
  'Fairy',
  'Stellar',
] as const

const GERMAN_NATURES: Record<string, string> = {
  robust: 'Hardy',
  solo: 'Lonely',
  mutig: 'Brave',
  hart: 'Adamant',
  frech: 'Naughty',
  kuehn: 'Bold',
  sanft: 'Docile',
  locker: 'Relaxed',
  pfiffig: 'Impish',
  lasch: 'Lax',
  scheu: 'Timid',
  hastig: 'Hasty',
  ernst: 'Serious',
  froh: 'Jolly',
  naiv: 'Naive',
  maessig: 'Modest',
  mild: 'Mild',
  ruhig: 'Quiet',
  zaghaft: 'Bashful',
  hitzig: 'Rash',
  still: 'Calm',
  zart: 'Gentle',
  forsch: 'Sassy',
  sacht: 'Careful',
  kauzig: 'Quirky',
}

const natureByKey = new Map<string, string>([
  ...NATURES.map((n): [string, string] => [n.toLowerCase(), n]),
  ...Object.entries(GERMAN_NATURES),
])
const typeByKey = new Map<string, string>(TYPES.map((t) => [t.toLowerCase(), t]))

const STAT_ALIASES: Record<string, StatKey> = {
  hp: 'hp',
  atk: 'atk',
  attack: 'atk',
  def: 'def',
  defense: 'def',
  spa: 'spa',
  satk: 'spa',
  spatk: 'spa',
  spc: 'spa',
  spd: 'spd',
  sdef: 'spd',
  spdef: 'spd',
  spe: 'spe',
  speed: 'spe',
  spds: 'spd',
}
const STAT_LABEL: Record<StatKey, string> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
}

const IGNORED_PREFIXES = [
  'shiny:',
  'happiness:',
  'pokeball:',
  'hidden power:',
  'dynamax level:',
  'gigantamax:',
  'teratype:',
]

function parseSpread(
  body: string,
  base: StatSpread,
  max: number,
  label: string,
  warn: (m: string) => void,
): StatSpread {
  const out = { ...base }
  for (const part of body.split('/')) {
    const m = /^\s*(\d+)\s+([A-Za-z]+)\s*$/.exec(part)
    const key = m ? STAT_ALIASES[(m[2] as string).toLowerCase()] : undefined
    if (!m || !key) {
      if (part.trim()) warn(`Ignored unreadable ${label} entry "${part.trim().slice(0, 30)}"`)
      continue
    }
    const v = Number(m[1])
    if (v > max) warn(`${label} ${STAT_LABEL[key]} ${v} exceeds ${max}; clamped`)
    out[key] = Math.min(v, max)
  }
  return out
}

const sum = (s: StatSpread) => STAT_KEYS.reduce((a, k) => a + s[k], 0)

/** Parse the first line: `[Nick (]Species[)] [(M|F)] [@ Item]`. */
function parseHeader(line: string, species: Map<string, string>) {
  let rest = line
  let item: string | undefined
  const at = rest.indexOf(' @ ')
  if (at >= 0) {
    item = rest.slice(at + 3).trim()
    rest = rest.slice(0, at)
  }
  rest = rest.trim()
  let gender: Gender | undefined
  const g = /\s\((M|F)\)$/.exec(rest)
  if (g) {
    gender = g[1] as Gender
    rest = rest.slice(0, g.index).trim()
  }
  let nickname: string | undefined
  let speciesName = rest
  if (rest.endsWith(')') && !species.has(normalizeSearch(rest))) {
    const open = rest.lastIndexOf(' (')
    if (open > 0) {
      nickname = rest.slice(0, open).trim()
      speciesName = rest.slice(open + 2, -1).trim()
    }
  }
  return { nickname, speciesName, gender, item }
}

export function importPaste(text: string, gen: GenId, genData: Names): ImportResult {
  const warnings: string[] = []
  const members: SavedSet[] = []
  if (new TextEncoder().encode(text).length > LIMITS.maxPasteBytes) {
    return {
      members,
      warnings: [`Paste is larger than ${LIMITS.maxPasteBytes / 1024} KB; ignored`],
    }
  }
  const champions = gen === 'champions'
  const lk = lookup(genData)
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) =>
      b
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .filter((b) => b.length > 0)

  let n = 0
  for (const lines of blocks) {
    n++
    if (members.length >= LIMITS.maxMembers) {
      warnings.push(`Only the first ${LIMITS.maxMembers} Pokemon were imported`)
      break
    }
    const [first, ...rest] = lines as [string, ...string[]]
    const hdr = parseHeader(first, lk.species)
    const label = `#${n} ${hdr.speciesName.slice(0, 40)}`
    const warn = (m: string) => warnings.push(`${label}: ${m}`)

    const speciesId = lk.species.get(normalizeSearch(hdr.speciesName))
    if (!speciesId) {
      warn('unknown species, skipped')
      continue
    }
    const set: SavedSet = {
      uid: newUid(),
      gen,
      speciesId,
      level: 100,
      nature: 'Serious',
      moveIds: [],
      evs: emptySpread(0),
      ivs: emptySpread(31),
    }
    if (hdr.nickname) set.nickname = hdr.nickname.slice(0, LIMITS.maxNameLength)
    if (hdr.gender) set.gender = hdr.gender
    if (hdr.item && normalizeSearch(hdr.item) !== 'noitem') {
      const id = lk.items.get(normalizeSearch(hdr.item))
      if (id) set.itemId = id
      else warn(`unknown item "${hdr.item.slice(0, 40)}"`)
    }

    for (const line of rest) {
      const lower = line.toLowerCase()
      if (line.startsWith('-') && !/^-\s*-/.test(line)) {
        const name = line.replace(/^-\s*/, '').trim()
        if (!name) continue
        const id = lk.moves.get(normalizeSearch(name))
        if (!id) warn(`unknown move "${name.slice(0, 40)}"`)
        else if (set.moveIds.includes(id)) continue
        else if (set.moveIds.length >= LIMITS.maxMoves) warn(`more than 4 moves; "${name}" dropped`)
        else set.moveIds.push(id)
      } else if (lower.startsWith('ability:')) {
        const name = line.slice(8).trim()
        const id = lk.abilities.get(normalizeSearch(name))
        if (id) set.abilityId = id
        else if (name) warn(`unknown ability "${name.slice(0, 40)}"`)
      } else if (lower.startsWith('level:')) {
        const v = Number.parseInt(line.slice(6), 10)
        if (Number.isInteger(v) && v >= 1 && v <= 100) set.level = v
        else warn(`invalid level "${line.slice(6).trim().slice(0, 10)}"`)
      } else if (lower.startsWith('tera type:')) {
        const name = line.slice(10).trim()
        const t = typeByKey.get(name.toLowerCase())
        if (t) set.teraType = t
        else warn(`unknown Tera type "${name.slice(0, 20)}"`)
      } else if (/^(evs|sps|stat points):/i.test(line)) {
        const body = line.slice(line.indexOf(':') + 1)
        if (champions) {
          const sp = parseSpread(
            body,
            emptySpread(0),
            Number.POSITIVE_INFINITY,
            'Stat Points',
            warn,
          )
          if (
            STAT_KEYS.some((k) => sp[k] > LIMITS.maxStatPoint) ||
            sum(sp) > LIMITS.maxStatPointTotal
          ) {
            warn(
              `Stat Points must be <=${LIMITS.maxStatPoint} per stat and <=${LIMITS.maxStatPointTotal} total (these look like EVs); spread dropped`,
            )
          } else set.statPoints = sp
        } else {
          const evs = parseSpread(body, emptySpread(0), LIMITS.maxEv, 'EV', warn)
          if (sum(evs) > LIMITS.maxEvTotal) {
            warn(`EV total ${sum(evs)} exceeds ${LIMITS.maxEvTotal}; spread dropped`)
          } else set.evs = evs
        }
      } else if (lower.startsWith('ivs:')) {
        set.ivs = parseSpread(line.slice(4), emptySpread(31), 31, 'IV', warn)
      } else if (/\bnature$/i.test(line)) {
        const raw = line.replace(/\s*nature$/i, '').trim()
        const nat = natureByKey.get(normalizeSearch(raw))
        if (nat) set.nature = nat
        else warn(`unknown nature "${raw.slice(0, 20)}"`)
      } else if (IGNORED_PREFIXES.some((p) => lower.startsWith(p))) {
        // fields we do not model
      } else {
        warn(`ignored line "${line.slice(0, 40)}"`)
      }
    }
    if (champions) {
      set.statPoints ??= emptySpread(0)
      delete set.teraType
    }
    members.push(set)
  }
  if (members.length === 0 && warnings.length === 0) warnings.push('No Pokemon found in paste')
  return { members, warnings }
}

function spreadLine(s: StatSpread, skip: number): string {
  return STAT_KEYS.filter((k) => s[k] !== skip)
    .map((k) => `${s[k]} ${STAT_LABEL[k]}`)
    .join(' / ')
}

/** Standard Showdown text with English names. Unknown ids fall back to the raw id. */
export function exportPaste(members: SavedSet[], genData: Names): string {
  const lk = lookup(genData)
  return members
    .map((m) => {
      const species = lk.en.species.get(m.speciesId) ?? m.speciesId
      let head = m.nickname && m.nickname !== species ? `${m.nickname} (${species})` : species
      if (m.gender) head += ` (${m.gender})`
      if (m.itemId) head += ` @ ${lk.en.items.get(m.itemId) ?? m.itemId}`
      const out = [head]
      if (m.abilityId) out.push(`Ability: ${lk.en.abilities.get(m.abilityId) ?? m.abilityId}`)
      if (m.level !== 100) out.push(`Level: ${m.level}`)
      const champions = m.gen === 'champions'
      if (m.teraType && !champions) out.push(`Tera Type: ${m.teraType}`)
      const points = champions ? (m.statPoints ?? emptySpread(0)) : m.evs
      const pl = spreadLine(points, 0)
      if (pl) out.push(`EVs: ${pl}`)
      if (m.nature) out.push(`${m.nature} Nature`)
      const il = spreadLine(m.ivs, 31)
      if (il) out.push(`IVs: ${il}`)
      for (const id of m.moveIds) out.push(`- ${lk.en.moves.get(id) ?? id}`)
      return out.join('\n')
    })
    .join('\n\n')
}

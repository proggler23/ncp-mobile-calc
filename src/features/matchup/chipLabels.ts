import type { Lang, SpeciesRecord } from '../../data/types'

/** Characters of the base species name shown on a team chip. */
export const CHIP_CHARS = 4

export interface ChipLabel {
  /** Short visible text (base species name, possibly extended to tell formes apart). */
  label: string
  /** Corner badge for Mega / regional formes ("" when none). */
  badge: string
  /** Full localized species name (aria-label / title). */
  full: string
}

type SpeciesInfo = Pick<SpeciesRecord, 'id' | 'en' | 'de'> &
  Partial<Pick<SpeciesRecord, 'base' | 'forme' | 'isMega'>>

/** Looks a species record up by Showdown id (`undefined` when unknown). */
export type SpeciesLookup = (id: string) => SpeciesInfo | undefined

const REGIONAL: Record<string, string> = { Alola: 'A', Galar: 'G', Hisui: 'H', Paldea: 'P' }
const NAME_PREFIXES = ['Mega-', 'Alola-', 'Galar-', 'Hisui-', 'Paldea-', 'Gmax-', 'Gmax ']
const NAME_SUFFIXES = [
  '-Mega-X',
  '-Mega-Y',
  '-Mega-Z',
  '-Mega',
  '-Alola',
  '-Galar',
  '-Hisui',
  '-Gmax',
]

const chars = (s: string, n: number) => Array.from(s).slice(0, n).join('')

/** Badge from the Showdown forme suffix ("Mega-X" -> "MX", "Galar-Zen" -> "G"). */
export function formeBadge(forme: string | undefined, isMega?: boolean): string {
  const parts = (forme ?? '').split('-')
  if (parts[0] === 'Mega' || (!forme && isMega)) {
    const v = parts[1]
    return v === 'X' || v === 'Y' || v === 'Z' ? `M${v}` : 'M'
  }
  return REGIONAL[parts[0] ?? ''] ?? ''
}

/** Fallback when no structured base species exists: strip known forme affixes from the name. */
function stripFormeAffixes(name: string): string {
  for (const p of NAME_PREFIXES)
    if (name.startsWith(p)) return name.slice(p.length).replace(/^[A-Z]-/, '')
  for (const s of NAME_SUFFIXES) if (name.endsWith(s)) return name.slice(0, -s.length)
  return name
}

function baseName(rec: SpeciesInfo, lang: Lang, data: SpeciesLookup): string {
  const base = rec.base ? data(rec.base) : undefined
  if (base) return base[lang] || base.en
  const own = rec[lang] || rec.en
  return rec.base || rec.isMega || rec.forme ? stripFormeAffixes(own) : own
}

interface Entry {
  id: string
  full: string
  base: string
  forme: string
  badge: string
}

/** Candidate (base chars, forme chars) splits tried, in order, when labels collide. */
const EXTENSIONS: [number, number][] = [
  [3, 1],
  [3, 2],
  [2, 3],
  [1, 4],
]

/**
 * Short chip labels for a team: the first 4 characters of the BASE species' localized name plus a
 * corner badge for Mega / regional formes. Members that would still look identical (different
 * formes of one species: Rotom, Ogerpon, Urshifu, ...) get a forme character in the label.
 */
export function chipLabels(
  members: readonly { speciesId: string }[],
  lang: Lang,
  data: SpeciesLookup,
): ChipLabel[] {
  const entries: Entry[] = members.map((m) => {
    const rec = data(m.speciesId)
    if (!rec) return { id: m.speciesId, full: m.speciesId, base: m.speciesId, forme: '', badge: '' }
    return {
      id: rec.id,
      full: rec[lang] || rec.en,
      base: baseName(rec, lang, data),
      forme: rec.forme ?? '',
      badge: formeBadge(rec.forme, rec.isMega),
    }
  })
  const labels = entries.map((e) => chars(e.base, CHIP_CHARS))
  const key = (i: number) => `${labels[i]}|${entries[i]!.badge}`
  const colliding = () => {
    const seen = new Map<string, Set<string>>()
    for (let i = 0; i < entries.length; i++) {
      const s = seen.get(key(i)) ?? new Set<string>()
      s.add(entries[i]!.id)
      seen.set(key(i), s)
    }
    return entries.map((_, i) => (seen.get(key(i))?.size ?? 0) > 1)
  }
  for (const [b, f] of EXTENSIONS) {
    const bad = colliding()
    if (!bad.some(Boolean)) break
    bad.forEach((isBad, i) => {
      const e = entries[i]!
      if (isBad && e.forme)
        labels[i] =
          chars(e.base, b) +
          chars(e.forme.replace(/^(Mega|Alola|Galar|Hisui|Paldea)-?/, '') || e.forme, f)
    })
  }
  return entries.map((e, i) => ({ label: labels[i]!, badge: e.badge, full: e.full }))
}

import type { GenData, Lang, SearchEntry } from './types'

/**
 * Normalize text for search: lowercase, strip diacritics, ß -> ss, and drop everything that is
 * not a-z / 0-9 (spaces, hyphens, apostrophes, dots). "Flabébé" -> "flabebe", "Kapu-Riki" -> "kapuriki".
 */
export function normalizeSearch(s: string): string {
  return s
    .replace(/ß/g, 'ss')
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export interface SearchHit {
  id: string
  /** 0 = exact, 1 = prefix, 2 = substring */
  rank: number
  lang: Lang
}

function score(entry: SearchEntry, q: string, lang: Lang | undefined): SearchHit | null {
  const [id, en, de] = entry
  const candidates: [Lang, string][] = []
  if (lang !== 'de') candidates.push(['en', en])
  if (lang !== 'en') candidates.push(['de', de === '' ? en : de])
  let best: SearchHit | null = null
  for (const [l, name] of candidates) {
    let rank = -1
    if (name === q) rank = 0
    else if (name.startsWith(q)) rank = 1
    else if (name.includes(q)) rank = 2
    if (rank >= 0 && (best === null || rank < best.rank)) best = { id, rank, lang: l }
  }
  return best
}

function searchEntries(entries: SearchEntry[], query: string, lang?: Lang): SearchHit[] {
  const q = normalizeSearch(query)
  if (q === '') return []
  const hits: { hit: SearchHit; len: number }[] = []
  for (const entry of entries) {
    const hit = score(entry, q, lang)
    if (hit) hits.push({ hit, len: (hit.lang === 'de' ? entry[2] || entry[1] : entry[1]).length })
  }
  hits.sort((a, b) => a.hit.rank - b.hit.rank || a.len - b.len || a.hit.id.localeCompare(b.hit.id))
  return hits.map((h) => h.hit)
}

type SearchSource = Pick<GenData, 'search'>

/** Rank prefix matches over substring matches; searches English and German unless `lang` given. */
export function searchSpecies(genData: SearchSource, query: string, lang?: Lang): SearchHit[] {
  return searchEntries(genData.search.species, query, lang)
}

export function searchMoves(genData: SearchSource, query: string, lang?: Lang): SearchHit[] {
  return searchEntries(genData.search.moves, query, lang)
}

export function searchItems(genData: SearchSource, query: string, lang?: Lang): SearchHit[] {
  return searchEntries(genData.search.items, query, lang)
}

export function searchAbilities(genData: SearchSource, query: string, lang?: Lang): SearchHit[] {
  return searchEntries(genData.search.abilities, query, lang)
}

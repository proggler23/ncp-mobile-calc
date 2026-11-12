import { useMemo, useState } from 'react'
import { normalizeSearch } from '../data/normalize'
import { useT } from '../state/hooks'
import { Dialog } from './Dialog'

export interface SearchItem {
  id: string
  primary: string
  secondary?: string
  /** Small third line (type, category, ...). */
  detail?: string
  /** Normalized search keys (see `normalizeSearch`). */
  keys: string[]
}

const LIMIT = 100

/** Most used entries of the list (Smogon usage), shown first with their share. */
export interface PopularSection {
  /** "Popular in Reg M-C" */
  title: string
  /** Header of the full list below it, "All legal moves" */
  allTitle: string
  /** Attribution line at the top of the section */
  caption: string
  /** [id, usage percent]; ids that are not in `items` (not allowed right now) are ignored */
  entries: readonly (readonly [id: string, pct: number])[]
}

export function filterItems(items: readonly SearchItem[], query: string): SearchItem[] {
  const q = normalizeSearch(query)
  if (!q) return items.slice(0, LIMIT)
  const ranked: [number, SearchItem][] = []
  for (const it of items) {
    let best = 9
    for (const k of it.keys) {
      const r = k === q ? 0 : k.startsWith(q) ? 1 : k.includes(q) ? 2 : 9
      if (r < best) best = r
    }
    if (best < 9) ranked.push([best, it])
  }
  // Array.sort is stable: equal ranks keep the catalogue order.
  return ranked.sort((a, b) => a[0] - b[0]).map((r) => r[1])
}

interface Props {
  title: string
  placeholder: string
  items: readonly SearchItem[]
  onPick: (id: string) => void
  onClose: () => void
  /** Pinned row above the results, e.g. "No item". */
  clearLabel?: string
  notice?: string
  /**
   * Without a query: this section (sorted by usage) followed by the full list. With a query: the
   * matching popular entries come first (with their %), then the other matches, no duplicates.
   */
  popular?: PopularSection
}

/** Full-screen search list: autofocused input (16px, no iOS zoom), big tap rows. */
export function SearchOverlay({
  title,
  placeholder,
  items,
  onPick,
  onClose,
  clearLabel,
  notice,
  popular,
}: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const hits = useMemo(() => filterItems(items, query), [items, query])
  // Popular entries that are in the list (i.e. currently allowed), highest usage first.
  const pops = useMemo(() => {
    const byId = new Map(items.map((it) => [it.id, it]))
    const seen = new Set<string>()
    const out: { item: SearchItem; pct: number }[] = []
    for (const [id, pct] of popular?.entries ?? []) {
      const item = byId.get(id)
      if (item && !seen.has(id)) {
        seen.add(id)
        out.push({ item, pct })
      }
    }
    return out.sort((a, b) => b.pct - a.pct)
  }, [items, popular])
  const searching = query.trim() !== ''
  const popularRows = useMemo(() => {
    if (!searching) return pops
    const hit = new Set(hits.map((h) => h.id))
    return pops.filter((p) => hit.has(p.item.id))
  }, [pops, hits, searching])
  const pctOf = useMemo(() => new Map(popularRows.map((p) => [p.item.id, p.pct])), [popularRows])
  // While searching the matches that are popular lead the list and are not repeated below.
  const rest = searching ? hits.filter((h) => !pctOf.has(h.id)) : hits
  const shown = rest.slice(0, LIMIT)
  const first = popularRows[0]?.item ?? shown[0]
  const hasPopular = popularRows.length > 0
  const row = (it: SearchItem, pct?: number) => (
    <li key={it.id}>
      <button
        type="button"
        className={pct === undefined ? 'row' : 'row row--pop'}
        onClick={() => onPick(it.id)}
      >
        <span className="row__primary">{it.primary}</span>
        {it.secondary && <span className="row__secondary">{it.secondary}</span>}
        {pct !== undefined && <span className="row__pct">{pct.toFixed(1)} %</span>}
        {it.detail && <span className="row__detail">{it.detail}</span>}
      </button>
    </li>
  )

  return (
    <Dialog
      variant="full"
      title={title}
      onClose={onClose}
      closeLabel={t('common.close')}
      autoFocusFirst
      header={
        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            if (first) onPick(first.id)
          }}
        >
          <input
            className="search__input"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={placeholder}
            aria-label={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
      }
    >
      {notice && (
        <p className="notice" role="note">
          {notice}
        </p>
      )}
      {clearLabel && (
        <button type="button" className="row row--clear" onClick={() => onPick('')}>
          {clearLabel}
        </button>
      )}
      {!first ? (
        <p className="muted pad">{t('search.empty')}</p>
      ) : (
        <>
          {hasPopular && popular && (
            <div>
              {!searching && <h3 className="list__head">{popular.title}</h3>}
              <p className="list__caption">{popular.caption}</p>
              <ul className="list" aria-label={popular.title}>
                {popularRows.map((p) => row(p.item, p.pct))}
              </ul>
            </div>
          )}
          {shown.length > 0 && (
            <div>
              {hasPopular && !searching && popular && (
                <h3 className="list__head">{popular.allTitle}</h3>
              )}
              <ul
                className="list"
                aria-label={hasPopular && !searching ? popular?.allTitle : title}
              >
                {shown.map((it) => row(it))}
              </ul>
            </div>
          )}
        </>
      )}
      {rest.length > LIMIT && (
        <p className="muted pad">{t('search.more', { n: rest.length - LIMIT })}</p>
      )}
    </Dialog>
  )
}

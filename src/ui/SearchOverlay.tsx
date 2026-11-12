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
}: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const hits = useMemo(() => filterItems(items, query), [items, query])
  const shown = hits.slice(0, LIMIT)

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
            const first = shown[0]
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
      {shown.length === 0 ? (
        <p className="muted pad">{t('search.empty')}</p>
      ) : (
        <ul className="list" aria-label={title}>
          {shown.map((it) => (
            <li key={it.id}>
              <button type="button" className="row" onClick={() => onPick(it.id)}>
                <span className="row__primary">{it.primary}</span>
                {it.secondary && <span className="row__secondary">{it.secondary}</span>}
                {it.detail && <span className="row__detail">{it.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {hits.length > LIMIT && (
        <p className="muted pad">{t('search.more', { n: hits.length - LIMIT })}</p>
      )}
    </Dialog>
  )
}

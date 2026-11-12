import { useMemo } from 'react'
import { GEN_META } from '../../bridge/gens'
import type { DataGenId, SavedSetLike } from '../../bridge/types'
import type { Key, Lang } from '../../i18n'
import { applyCustomSet, type Side } from '../../state/app'
import { useApp, useT } from '../../state/hooks'
import { getLib } from '../../state/lib'
import { STAT_ORDER, investmentOf } from '../../state/sets'
import { deleteCustomSet } from '../../state/teams'
import type { CustomSet } from '../../storage/types'
import { Dialog } from '../../ui/Dialog'
import { legalText } from '../regulation/LegalBadge'

type TFn = ReturnType<typeof useT>

/** The user's saved sets for the species (and forme) currently on a side, in the current gen. */
export function useSavedSets(side: Side): CustomSet[] {
  const gen = useApp((s) => s.gen)
  const all = useApp((s) => s.customSets)
  const speciesId = useApp((s) => s[side]?.speciesId)
  return useMemo(
    () => (speciesId ? all.filter((c) => c.gen === gen && c.speciesId === speciesId) : []),
    [all, gen, speciesId],
  )
}

/**
 * "Hart · 32/14/10/0/10/0 · Schlohkraut · Mogelhieb, Feuerodem, …": nature, spread (stat points for
 * Champions, EVs otherwise), item and the first moves. `all` lists every move (aria-label).
 */
export function setSummary(gen: DataGenId, c: CustomSet, lang: Lang, t: TFn, all = false): string {
  const meta = GEN_META[gen]
  const { bridge } = getLib()
  const like: SavedSetLike = { speciesId: c.speciesId, ...c.set }
  const inv = investmentOf(meta, like)
  const spread = STAT_ORDER.map((k) => inv[k]).join('/')
  const nature = meta.engineGen >= 3 ? t(`nature.${c.set.nature || 'Serious'}` as Key) : undefined
  const item =
    meta.hasItems && c.set.itemId ? bridge.displayName(gen, 'items', c.set.itemId, lang) : undefined
  const moves = c.set.moveIds.map((id) => bridge.displayName(gen, 'moves', id, lang))
  const shown = all || moves.length <= 2 ? moves.join(', ') : `${moves.slice(0, 2).join(', ')}, …`
  return [nature, spread, item, shown].filter(Boolean).join(' · ')
}

export function SavedSetsSheet({ side, onClose }: { side: Side; onClose: () => void }) {
  const t = useT()
  const gen = useApp((s) => s.gen)
  const lang = useApp((s) => s.lang)
  const regulation = useApp((s) => s.regulation)
  const speciesId = useApp((s) => s[side]?.speciesId)
  const sets = useSavedSets(side)
  const { bridge } = getLib()
  const species = speciesId ? bridge.speciesDisplayName(gen, speciesId, lang) : ''
  return (
    <Dialog
      title={t('preset.savedTitle', { species })}
      onClose={onClose}
      closeLabel={t('common.close')}
    >
      {sets.length === 0 ? (
        <p className="muted pad">{t('search.empty')}</p>
      ) : (
        <ul className="list" aria-label={t('preset.savedHint')}>
          {sets.map((c) => {
            const legal = legalText(gen, regulation, { speciesId: c.speciesId, ...c.set }, lang, t)
            return (
              <li key={c.uid} className="saved-row">
                <button
                  type="button"
                  className="row"
                  aria-label={`${c.name}: ${setSummary(gen, c, lang, t, true)}${legal ? ` (${legal.short})` : ''}`}
                  onClick={() => {
                    applyCustomSet(side, c)
                    onClose()
                  }}
                >
                  <span className="row__primary">
                    {legal && (
                      <span className="saved-row__warn" title={legal.full} aria-hidden="true">
                        ⚠{' '}
                      </span>
                    )}
                    {c.name}
                  </span>
                  <span className="row__detail saved-row__summary">
                    {setSummary(gen, c, lang, t)}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn--icon"
                  aria-label={t('preset.deleteSet', { name: c.name })}
                  onClick={() => void deleteCustomSet(c.uid)}
                >
                  🗑
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}

/** "★ Saved (n)": only rendered when the side's species has at least one saved set. */
export function SavedSetsButton({
  side,
  onOpen,
  className = '',
}: {
  side: Side
  onOpen: () => void
  className?: string
}) {
  const t = useT()
  const n = useSavedSets(side).length
  if (n === 0) return null
  return (
    <button
      type="button"
      className={`btn saved-btn ${className}`.trim()}
      data-side={side}
      title={t('preset.savedHint')}
      onClick={onOpen}
    >
      ★ {t('preset.saved')} ({n})
    </button>
  )
}

import { useEffect, useRef, useState } from 'react'
import { GEN_META } from '../../bridge/gens'
import type { DataGenId, SavedSetLike } from '../../bridge/types'
import type { Key } from '../../i18n'
import { useApp, useT } from '../../state/hooks'
import { getLib } from '../../state/lib'
import { statusOptions } from '../../state/status'
import type { Status } from '../../engine/types'
import { setCardCollapsed, updateSet } from '../../state/app'
import { investmentOf, STAT_ORDER, statLimits } from '../../state/sets'
import type { Side } from '../../state/app'
import { LegalIcon, legalText } from '../regulation/LegalBadge'
import { SavedSetsButton, SavedSetsSheet } from './SavedSets'

interface Props {
  side: Side
  gen: DataGenId
  set: SavedSetLike | undefined
  onSearch: () => void
  onEdit: () => void
}

function spreadSummary(gen: DataGenId, set: SavedSetLike, t: ReturnType<typeof useT>): string {
  const meta = GEN_META[gen]
  const lim = statLimits(meta)
  const inv = investmentOf(meta, set)
  const parts = STAT_ORDER.filter((s) => inv[s] > 0).map(
    (s) => `${inv[s]} ${t(`stat.${s === 'spa' && meta.engineGen === 1 ? 'sp' : s}` as Key)}`,
  )
  const nature = meta.engineGen >= 3 ? t(`nature.${set.nature ?? 'Serious'}` as Key) : undefined
  const spread = parts.length
    ? parts.join(' / ')
    : lim.system === 'dvs'
      ? ''
      : t('card.noInvestment')
  return [nature, spread].filter(Boolean).join(' · ')
}

/**
 * One-tap status: the chip shows the current status, tapping it expands an inline strip of the
 * generation's options inside the card. Inline (no overlay, no history entry): outside tap, Escape
 * or the chip itself close it.
 */
function StatusChip({
  side,
  gen,
  status,
  role,
}: {
  side: Side
  gen: DataGenId
  status: Status
  role: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const code = (s: Status) => t(`status.code.${s}` as Key)
  const pick = (s: Status) => {
    updateSet(side, (cur) => ({ ...cur, status: s }))
    setOpen(false)
  }
  return (
    <span className="status" ref={ref}>
      <button
        type="button"
        className={`status__chip status--${status.replace(' ', '')}`}
        aria-expanded={open}
        aria-label={t('card.statusChange', { status: t(`status.${status}` as Key) })}
        onClick={() => setOpen(!open)}
      >
        {code(status)}
      </button>
      {open && (
        <span className="status__strip" role="group" aria-label={t('card.statusOptions', { role })}>
          {statusOptions(gen).map((s) => (
            <button
              type="button"
              key={s}
              className={`status__opt status--${s.replace(' ', '')}`}
              aria-pressed={s === status}
              aria-label={t(`status.${s}` as Key)}
              onClick={() => pick(s)}
            >
              {code(s)}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

export function PokemonCard({ side, gen, set, onSearch, onEdit }: Props) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const regulation = useApp((s) => s.regulation)
  const collapsed = useApp((s) => s.layout.cardsCollapsed[side])
  const [legalOpen, setLegalOpen] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  const role = t(side === 'mine' ? 'card.mine' : 'card.opp')

  if (!set) {
    return (
      <button type="button" className={`card card--empty card--${side}`} onClick={onSearch}>
        <span className="card__role">{role}</span>
        <span className="card__empty">
          🔍 {t(side === 'mine' ? 'card.chooseMine' : 'card.chooseOpp')}
        </span>
      </button>
    )
  }

  const { bridge } = getLib()
  const meta = GEN_META[gen]
  const name = (kind: 'species' | 'items' | 'abilities', id: string) =>
    bridge.displayName(gen, kind, id, lang)
  const species = name('species', set.speciesId)
  const pct = Math.max(0, Math.min(100, set.percentHP ?? 100))
  const hpClass = pct > 50 ? 'hp--ok' : pct > 20 ? 'hp--mid' : 'hp--low'
  const boosts = (Object.entries(set.boosts ?? {}) as [string, number][])
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${t(`stat.${k}` as Key)}`)
  const status: Status = set.status ?? 'Healthy'
  const item = meta.hasItems && set.itemId ? name('items', set.itemId) : undefined
  const itemAbility = [
    meta.hasAbilities && set.abilityId ? name('abilities', set.abilityId) : undefined,
    item,
  ].filter(Boolean)
  const legal = legalText(gen, regulation, set, lang, t)
  const expand = () => setCardCollapsed(side, false)

  return (
    <article
      className={`card card--${side}${collapsed ? ' card--collapsed' : ''}`}
      aria-label={`${role}: ${species}`}
    >
      <div className="card__top">
        <button
          type="button"
          className="card__toggle"
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? 'card.expand' : 'card.collapse', { role })}
          onClick={() => setCardCollapsed(side, !collapsed)}
        >
          <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        </button>
        <h3 className="card__name">
          {collapsed ? (
            <button type="button" className="card__summary" onClick={expand}>
              <span className="card__summary-main">
                {[species, item].filter(Boolean).join(' · ')}
              </span>{' '}
              <span className="card__summary-pct">· {pct}%</span>
            </button>
          ) : (
            species
          )}
        </h3>
        <StatusChip side={side} gen={gen} status={status} role={role} />
        {legal && (
          <LegalIcon
            label={legal.short}
            open={legalOpen}
            onToggle={() => setLegalOpen(!legalOpen)}
          />
        )}
        <button
          type="button"
          className="btn btn--icon"
          aria-label={t('card.search', { role })}
          onClick={onSearch}
        >
          🔍
        </button>
        <button
          type="button"
          className="btn btn--icon"
          aria-label={t('card.edit', { role })}
          onClick={onEdit}
        >
          ✎
        </button>
      </div>
      {legal && legalOpen && (
        <p className="card__legal" role="note">
          ⚠ {legal.full}
        </p>
      )}
      {!collapsed && (
        <>
          <p className="card__line">
            <span className="card__role">{role}</span> {itemAbility.join(' · ')}
          </p>
          <p className="card__line card__line--muted card__spread">
            <span>{spreadSummary(gen, set, t)}</span>
            <span className="card__pct">{pct}%</span>
          </p>
          <div
            className="hp"
            role="progressbar"
            aria-label={t('ed.hp')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className={`hp__fill ${hpClass}`} style={{ width: `${pct}%` }} />
          </div>
          {(set.teraType || set.dynamax || boosts.length > 0) && (
            <p className="card__badges">
              {set.teraType && (
                <span className={`badge${set.terastallized ? ' badge--on' : ''}`}>
                  {set.terastallized ? '✦ ' : ''}
                  {t('card.tera')} {t(`type.${set.teraType}` as Key)}
                </span>
              )}
              {set.dynamax && (
                <span className="badge badge--on">{set.gmax ? 'G-Max' : 'Dynamax'}</span>
              )}
              {boosts.map((b) => (
                <span className="badge" key={b}>
                  {b}
                </span>
              ))}
            </p>
          )}
        </>
      )}
      {side === 'mine' && (
        <>
          <SavedSetsButton side="mine" className="card__saved" onOpen={() => setSavedOpen(true)} />
          {savedOpen && <SavedSetsSheet side="mine" onClose={() => setSavedOpen(false)} />}
        </>
      )}
    </article>
  )
}

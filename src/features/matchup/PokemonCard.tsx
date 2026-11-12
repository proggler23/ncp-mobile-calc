import { useEffect, useRef, useState } from 'react'
import { GEN_META } from '../../bridge/gens'
import type { DataGenId, SavedSetLike } from '../../bridge/types'
import type { Key } from '../../i18n'
import { useApp, useT } from '../../state/hooks'
import { getLib } from '../../state/lib'
import { statusOptions } from '../../state/status'
import type { Status } from '../../engine/types'
import { updateSet } from '../../state/app'
import { investmentOf, STAT_ORDER, statLimits } from '../../state/sets'
import type { Side } from '../../state/app'
import { LegalBadge } from '../regulation/LegalBadge'

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
        {status === 'Healthy' ? t('card.status', { status: code(status) }) : code(status)}
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
  const pct = Math.max(0, Math.min(100, set.percentHP ?? 100))
  const hpClass = pct > 50 ? 'hp--ok' : pct > 20 ? 'hp--mid' : 'hp--low'
  const boosts = (Object.entries(set.boosts ?? {}) as [string, number][])
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${t(`stat.${k}` as Key)}`)
  const status: Status = set.status ?? 'Healthy'
  const itemAbility = [
    meta.hasAbilities && set.abilityId ? name('abilities', set.abilityId) : undefined,
    meta.hasItems && set.itemId ? name('items', set.itemId) : undefined,
  ].filter(Boolean)

  return (
    <article
      className={`card card--${side}`}
      aria-label={`${role}: ${name('species', set.speciesId)}`}
    >
      <div className="card__top">
        <span className="card__role">{role}</span>
        <h3 className="card__name">{name('species', set.speciesId)}</h3>
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
      <LegalBadge gen={gen} regulation={regulation} set={set} />
      {itemAbility.length > 0 && <p className="card__line">{itemAbility.join(' · ')}</p>}
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
      <p className="card__badges">
        <StatusChip side={side} gen={gen} status={status} role={role} />
        {set.teraType && (
          <span className={`badge${set.terastallized ? ' badge--on' : ''}`}>
            {set.terastallized ? '✦ ' : ''}
            {t('card.tera')} {t(`type.${set.teraType}` as Key)}
          </span>
        )}
        {set.dynamax && <span className="badge badge--on">{set.gmax ? 'G-Max' : 'Dynamax'}</span>}
        {boosts.map((b) => (
          <span className="badge" key={b}>
            {b}
          </span>
        ))}
      </p>
    </article>
  )
}

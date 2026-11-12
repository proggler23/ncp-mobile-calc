import { useEffect, useRef, useState } from 'react'
import type { MoveResult } from '../../engine/types'
import { setDirection, setResultsCollapsed } from '../../state/app'
import { useApp, useT } from '../../state/hooks'
import { getLib } from '../../state/lib'
import { Segmented } from '../../ui/controls'
import { useLongPress } from '../../ui/useLongPress'
import { useSwipe } from '../../ui/useSwipe'
import { koLevel, moveLine, percentText, plainText } from './ko'
import { ShareSheet } from './ShareSheet'
import { bestMove, summaryText } from './summary'

interface RowProps {
  r: MoveResult
  name: string
  reverse: boolean
  /** Start expanded (the row a shared link pointed at). */
  initiallyOpen: boolean
  onShare: () => void
}

function Row({ r, name, reverse, initiallyOpen, onShare }: RowProps) {
  const t = useT()
  const [open, setOpen] = useState(initiallyOpen)
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (initiallyOpen) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [initiallyOpen])
  const press = useLongPress(onShare)
  const ko = plainText(r.koChance)
  const level = koLevel(ko)
  const rolls = (Array.isArray(r.damage[0]) ? (r.damage as number[][]) : [r.damage as number[]])
    .map((h) => h.join(', '))
    .join(' | ')
  return (
    <li
      ref={ref}
      className={`result result--${level}${reverse ? ' result--rev' : ''}`}
      onContextMenu={press.onContextMenu}
    >
      <button
        type="button"
        className="result__btn"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        {...press}
      >
        <span className="result__name">{name}</span>
        <span className="result__pct">
          {r.minMax[1] === 0 ? '–' : percentText(r.damageText, r.percentRange)}
        </span>
        <span className="result__ko">{ko || '–'}</span>
        <span className="result__chev" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="result__detail">
          <p className="result__desc">{moveLine(r)}</p>
          <p className="result__rolls">
            <strong>{t('res.rolls')}</strong> {rolls}
          </p>
          <button
            type="button"
            className="btn result__share"
            aria-label={t('share.buttonLabel', { move: name })}
            onClick={onShare}
          >
            <span aria-hidden="true">📤</span> {t('share.button')}
          </button>
        </div>
      )}
    </li>
  )
}

export function MoveResults() {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const gen = useApp((s) => s.gen)
  const direction = useApp((s) => s.direction)
  const calc = useApp((s) => s.calc)
  const calcError = useApp((s) => s.calcError)
  const mine = useApp((s) => s.mine)
  const opp = useApp((s) => s.opp)
  const focus = useApp((s) => s.focusMove)
  const collapsed = useApp((s) => s.layout.resultsCollapsed)
  const [sharing, setSharing] = useState<number | null>(null)
  const hasBoth = !!mine && !!opp

  const forward = direction === 'forward'
  const rows = calc ? (forward ? calc.result.moves : calc.result.reverseMoves) : []
  // `slot` = index in the engine's rows (what a share link refers to).
  const shown = rows.flatMap((r, slot) => (r.move === '(No Move)' ? [] : [{ r, slot }]))
  const { bridge } = getLib()
  const label = (ncp: string) => {
    const id = bridge.showdownId(gen, 'moves', ncp)
    return id ? bridge.displayName(gen, 'moves', id, lang) : ncp
  }

  const defender = forward ? opp : mine
  const swipe = useSwipe({
    onSwipeDown: () => setResultsCollapsed(true),
    onSwipeUp: () => setResultsCollapsed(false),
  })
  const best = bestMove(shown.map(({ r }) => ({ r, name: label(r.move) })))
  const summary = !hasBoth
    ? t('res.pickBoth')
    : calcError
      ? calcError
      : best
        ? summaryText(best)
        : t('res.summaryNone')
  const sharedRow = sharing === null ? undefined : rows[sharing]

  return (
    <section className="results" aria-label={t('res.title')} aria-live="polite">
      <button
        type="button"
        className={`results__handle${collapsed ? ' results__handle--collapsed' : ''}`}
        aria-expanded={!collapsed}
        aria-controls="results-body"
        aria-label={collapsed ? `${t('res.toggle')}: ${summary}` : t('res.toggle')}
        title={t('res.toggle')}
        onClick={() => setResultsCollapsed(!collapsed)}
        {...swipe}
      >
        {collapsed ? (
          <span className="results__summary">
            <span aria-hidden="true">▲ </span>
            {summary}
          </span>
        ) : (
          <span className="results__grip" aria-hidden="true" />
        )}
      </button>
      <div className={`results__collapse${collapsed ? ' results__collapse--closed' : ''}`}>
        <div className="results__body" id="results-body" inert={collapsed}>
          <Segmented
            label={t('res.direction')}
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'forward', label: t('res.mine') },
              { value: 'reverse', label: t('res.opp') },
            ]}
          />
          {!hasBoth && <p className="muted pad">{t('res.pickBoth')}</p>}
          {calcError && (
            <p className="notice notice--error" role="alert">
              {calcError}
            </p>
          )}
          {hasBoth && !calcError && shown.length === 0 && (
            <p className="muted pad">{t(forward ? 'res.noMovesMine' : 'res.noMovesOpp')}</p>
          )}
          {shown.length > 0 && (
            <ul className="results__list" key={`${direction}-${focus?.nonce ?? 0}`}>
              {shown.map(({ r, slot }) => (
                <Row
                  key={`${slot}-${r.move}`}
                  r={r}
                  name={label(r.move)}
                  reverse={!forward}
                  initiallyOpen={focus?.direction === direction && focus.index === slot}
                  onShare={() => setSharing(slot)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
      {sharing !== null && sharedRow && sharedRow.move !== '(No Move)' && (
        <ShareSheet
          row={sharedRow}
          move={{ direction, index: sharing }}
          moveName={label(sharedRow.move)}
          defenderName={
            defender ? bridge.displayName(gen, 'species', defender.speciesId, lang) : ''
          }
          onClose={() => setSharing(null)}
        />
      )}
    </section>
  )
}

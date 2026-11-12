import { useState } from 'react'
import type { MoveResult } from '../../engine/types'
import { setDirection } from '../../state/app'
import { useApp, useT } from '../../state/hooks'
import { getLib } from '../../state/lib'
import { Segmented } from '../../ui/controls'
import { koLevel, percentText, plainText } from './ko'

function Row({ r, name, reverse }: { r: MoveResult; name: string; reverse: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ko = plainText(r.koChance)
  const level = koLevel(ko)
  const rolls = (Array.isArray(r.damage[0]) ? (r.damage as number[][]) : [r.damage as number[]])
    .map((h) => h.join(', '))
    .join(' | ')
  return (
    <li className={`result result--${level}${reverse ? ' result--rev' : ''}`}>
      <button
        type="button"
        className="result__btn"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
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
          <p className="result__desc">
            {plainText(r.description)}: {plainText(r.damageText)} -- {ko}
          </p>
          <p className="result__rolls">
            <strong>{t('res.rolls')}</strong> {rolls}
          </p>
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
  const hasBoth = !!mine && !!opp

  const forward = direction === 'forward'
  const rows = calc ? (forward ? calc.result.moves : calc.result.reverseMoves) : []
  const shown = rows.filter((r) => r.move !== '(No Move)')
  const { bridge } = getLib()
  const label = (ncp: string) => {
    const id = bridge.showdownId(gen, 'moves', ncp)
    return id ? bridge.displayName(gen, 'moves', id, lang) : ncp
  }

  return (
    <section className="results" aria-label={t('res.title')} aria-live="polite">
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
        <ul className="results__list" key={direction}>
          {shown.map((r, i) => (
            <Row key={`${i}-${r.move}`} r={r} name={label(r.move)} reverse={!forward} />
          ))}
        </ul>
      )}
    </section>
  )
}

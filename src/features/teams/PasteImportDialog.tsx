import { useState } from 'react'
import { GEN_META } from '../../bridge/gens'
import type { DataGenId } from '../../bridge/types'
import { useT } from '../../state/hooks'
import { importPasteAsTeam, type PasteOutcome } from '../../state/teams'
import type { Team } from '../../storage/types'
import { Dialog } from '../../ui/Dialog'
import { useRunner } from './useRunner'

/** Paste a Showdown team: creates a new team, or replaces the members of `target`. */
export function PasteImportDialog({
  gen,
  target,
  onClose,
  onOpen,
}: {
  gen: DataGenId
  target?: Team
  onClose: () => void
  onOpen?: (team: Team) => void
}) {
  const t = useT()
  const [text, setText] = useState('')
  const [name, setName] = useState(t('teams.defaultName'))
  const [outcome, setOutcome] = useState<PasteOutcome>()
  const { error, run } = useRunner()

  const submit = async () => {
    const r = await run(() =>
      importPasteAsTeam(gen, text, {
        name: name.trim() || t('teams.defaultName'),
        target: target?.uid,
      }),
    )
    if (r) setOutcome(r)
  }

  return (
    <Dialog title={t('teams.importTitle')} onClose={onClose} closeLabel={t('common.close')}>
      <div className="stack pad">
        {!outcome || outcome.imported === 0 ? (
          <>
            {!target && (
              <label className="field">
                <span className="field__label">{t('teams.nameLabel')}</span>
                <input
                  className="text-input"
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            <label className="field">
              <span className="field__label">{t('teams.pasteLabel')}</span>
              <textarea
                className="text-input"
                value={text}
                placeholder={t('teams.pastePlaceholder')}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <p className="hint">
              {target
                ? t('teams.importReplace')
                : t('teams.importGen', { gen: GEN_META[gen].label })}
            </p>
          </>
        ) : (
          <p className="toast" role="status">
            {t('teams.importDone', { n: outcome.imported })}
          </p>
        )}
        {outcome?.imported === 0 && (
          <p className="notice notice--error" role="alert">
            {t('teams.importNone')}
          </p>
        )}
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        {outcome && outcome.warnings.length > 0 && (
          <div className="notice" role="region" aria-label={t('teams.warnings')}>
            <strong>{t('teams.warnings')}</strong>
            <ul className="warnings">
              {outcome.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="sheet-actions">
          {outcome?.team && outcome.imported > 0 ? (
            <>
              {onOpen && (
                <button type="button" className="btn" onClick={() => onOpen(outcome.team!)}>
                  {t('teams.openTeam')}
                </button>
              )}
              <button type="button" className="btn btn--primary" onClick={onClose}>
                {t('common.done')}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!text.trim()}
                onClick={() => void submit()}
              >
                {t('teams.importDo')}
              </button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}

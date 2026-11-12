import { useState, type FormEvent } from 'react'
import { useT } from '../state/hooks'
import { Dialog } from './Dialog'

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const t = useT()
  return (
    <Dialog title={title} onClose={onClose} closeLabel={t('common.close')}>
      <p className="pad">{message}</p>
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}

/** One text field + submit; used for team and set names. */
export function NameDialog({
  title,
  label,
  initial,
  confirmLabel,
  maxLength = 100,
  onSubmit,
  onClose,
}: {
  title: string
  label: string
  initial: string
  confirmLabel: string
  maxLength?: number
  onSubmit: (name: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [name, setName] = useState(initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit(name.trim())
    onClose()
  }
  return (
    <Dialog title={title} onClose={onClose} closeLabel={t('common.close')} autoFocusFirst>
      <form className="pad name-form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">{label}</span>
          <input
            className="text-input"
            value={name}
            maxLength={maxLength}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={!name.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

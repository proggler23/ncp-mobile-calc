import { useRef, useState } from 'react'
import { useT } from '../../state/hooks'
import { Dialog } from '../../ui/Dialog'

/** Shows a Showdown paste; copy to clipboard and (when available) the native share sheet. */
export function ExportDialog({
  title,
  text,
  onClose,
}: {
  title: string
  text: string
  onClose: () => void
}) {
  const t = useT()
  const area = useRef<HTMLTextAreaElement>(null)
  const [msg, setMsg] = useState<string>()
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setMsg(t('teams.copied'))
    } catch {
      area.current?.select()
      setMsg(t('teams.copyFailed'))
    }
  }
  const share = async () => {
    try {
      await navigator.share({ title, text })
    } catch {
      /* cancelled by the user */
    }
  }

  return (
    <Dialog title={title} onClose={onClose} closeLabel={t('common.close')}>
      <div className="stack pad">
        <textarea
          ref={area}
          className="text-input"
          readOnly
          value={text}
          aria-label={title}
          rows={12}
          onFocus={(e) => e.currentTarget.select()}
        />
        {msg && (
          <p className="toast" role="status">
            {msg}
          </p>
        )}
        <div className="sheet-actions">
          {canShare && (
            <button type="button" className="btn" onClick={() => void share()}>
              {t('teams.share')}
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => void copy()}>
            {t('teams.copy')}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

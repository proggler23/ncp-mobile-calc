import { useEffect, useState } from 'react'
import type { MoveResult } from '../../engine/types'
import { copyToClipboard, shareMessage } from '../../share/actions'
import { useT } from '../../state/hooks'
import { prepareShare, type MoveRef, type ShareContent } from '../../state/share'
import { Dialog } from '../../ui/Dialog'
import { showToast } from '../../ui/Toast'

interface Props {
  row: MoveResult
  move: MoveRef
  /** Localized move name and defender name for the title. */
  moveName: string
  defenderName: string
  onClose: () => void
}

/** Action sheet of one result row: share (system sheet / clipboard), copy text, copy link. */
export function ShareSheet({ row, move, moveName, defenderName, onClose }: Props) {
  const t = useT()
  const [content, setContent] = useState<ShareContent>()
  useEffect(() => {
    let stale = false
    // Built up front, so the share call itself runs synchronously inside the tap (Safari only
    // accepts navigator.share() close to the user gesture).
    void prepareShare(row, move).then((c) => {
      if (!stale) setContent(c)
    })
    return () => {
      stale = true
    }
  }, [row, move])

  const done = (ok: boolean) => showToast(t(ok ? 'share.copied' : 'share.copyFailed'))
  const share = () => {
    if (!content) return
    const pending = shareMessage(content)
    onClose()
    void pending.then((outcome) => {
      if (outcome === 'copied') done(true)
      else if (outcome === 'failed') done(false)
    })
  }
  const copy = (text: string | undefined) => {
    if (text === undefined) return
    const pending = copyToClipboard(text)
    onClose()
    void pending.then(done)
  }

  return (
    <Dialog
      title={t('share.title', { move: moveName, defender: defenderName })}
      onClose={onClose}
      closeLabel={t('common.close')}
    >
      <div className="share-actions" role="group" aria-label={t('share.actions')}>
        <button type="button" className="btn" disabled={!content} onClick={share}>
          <span aria-hidden="true">📤</span> {t('share.share')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!content}
          onClick={() => copy(content?.full)}
        >
          <span aria-hidden="true">📋</span> {t('share.copyText')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!content}
          onClick={() => copy(content?.url)}
        >
          <span aria-hidden="true">🔗</span> {t('share.copyLink')}
        </button>
        {!content && (
          <p className="muted" role="status">
            {t('share.preparing')}
          </p>
        )}
      </div>
    </Dialog>
  )
}

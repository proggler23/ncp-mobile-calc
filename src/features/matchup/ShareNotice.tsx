import { useEffect } from 'react'
import type { Key } from '../../i18n'
import { setShareNotice } from '../../state/app'
import { useApp, useT } from '../../state/hooks'
import { safeDetail } from '../../share/detail'
import { undoSharedLoad } from '../../state/share'

/** Error notices hide themselves; the loaded notice stays (Undo) until dismissed or the next edit. */
export const SHARE_NOTICE_MS = 8000

/** Non-blocking notice after opening a shared link: loaded + Undo (+ what was skipped), or error. */
export function ShareNotice() {
  const t = useT()
  const notice = useApp((s) => s.shareNotice)
  const error = notice?.kind === 'error' ? notice : undefined
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setShareNotice(undefined), SHARE_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [error])
  if (!notice) return null
  const dismiss = () => setShareNotice(undefined)

  if (notice.kind === 'error') {
    const key: Key =
      notice.reason === 'offline'
        ? 'share.err.offline'
        : notice.reason === 'unsupported'
          ? 'share.err.unsupported'
          : 'share.err.invalid'
    return (
      <div className="notice notice--error share-notice" role="alert">
        <p>{t(key)}</p>
        <button type="button" className="btn" onClick={dismiss}>
          {t('common.dismiss')}
        </button>
      </div>
    )
  }
  return (
    <div className="notice share-notice" role="status">
      <p>{t('share.loaded')}</p>
      {notice.warnings.length > 0 && (
        <div className="share-notice__warn">
          <p>{t('share.skipped')}</p>
          <ul>
            {notice.warnings.slice(0, 8).map((w, i) => (
              <li key={i}>
                {t(`share.warn.${w.key}` as Key, { detail: safeDetail(w.detail ?? '') }).replace(
                  /\s*\(\)$/,
                  '',
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="share-notice__btns">
        <button type="button" className="btn" onClick={() => void undoSharedLoad()}>
          ↶ {t('share.undo')}
        </button>
        <button type="button" className="btn" onClick={dismiss}>
          {t('common.dismiss')}
        </button>
      </div>
    </div>
  )
}

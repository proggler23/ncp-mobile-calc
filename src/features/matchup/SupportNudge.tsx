import { useSyncExternalStore } from 'react'
import { useT } from '../../state/hooks'
import { dismissSupportForever, snoozeSupport, useSupport } from '../../state/supportNudge'
import { overlayDepth, subscribeOverlays } from '../../ui/overlayStack'
import { SupportButton } from '../../ui/SupportButton'

/**
 * One-time, non-modal support hint docked above the footer. It never covers the results (the cards
 * area shrinks instead) and stays hidden while any sheet / search / dialog is open.
 */
export function SupportNudge() {
  const t = useT()
  const due = useSupport((s) => s.due)
  const overlays = useSyncExternalStore(subscribeOverlays, overlayDepth)
  if (!due || overlays > 0) return null
  return (
    <section className="nudge" role="region" aria-label={t('support.nudgeLabel')}>
      <p className="nudge__text">{t('support.nudgeText')}</p>
      <div className="nudge__btns">
        {/* The anchor must stay in the DOM until the browser followed it. */}
        <SupportButton onClick={() => setTimeout(dismissSupportForever, 300)}>
          {t('support.buy')}
        </SupportButton>
        <button type="button" className="btn" onClick={snoozeSupport}>
          {t('support.later')}
        </button>
        <button type="button" className="btn" onClick={dismissSupportForever}>
          {t('support.never')}
        </button>
      </div>
    </section>
  )
}

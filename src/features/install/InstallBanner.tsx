import { useEffect, useState, useSyncExternalStore } from 'react'
import { useT } from '../../state/hooks'
import {
  bannerEligible,
  dismissBanner,
  markBannerShown,
  promptInstall,
  useInstall,
} from '../../state/install'
import { overlayDepth, subscribeOverlays } from '../../ui/overlayStack'
import { InstallHowTo } from './InstallHowTo'
import './install.css'

/** Whether the banner is on screen; App uses it to hand the top safe-area inset over to it. */
export function useInstallBanner(): boolean {
  const eligible = useInstall((s) => bannerEligible(s, Date.now()))
  const shown = useInstall((s) => s.bannerShown)
  const overlays = useSyncExternalStore(subscribeOverlays, overlayDepth)
  // Not shown for the first time while a sheet is open; once shown it stays (it is not modal).
  const visible = eligible && (shown || overlays === 0)
  useEffect(() => {
    if (visible) markBannerShown()
  }, [visible])
  return visible
}

/** Non-modal strip above the top bar (in the flow, so it pushes content down). */
export function InstallBanner() {
  const t = useT()
  const visible = useInstallBanner()
  const kind = useInstall((s) => s.kind)
  const [how, setHow] = useState(false)
  if (!visible) return how ? <InstallHowTo onClose={() => setHow(false)} /> : null
  return (
    <>
      <section className="install-banner" role="region" aria-label={t('install.label')}>
        <p className="install-banner__text">{t('install.text')}</p>
        {kind === 'ios' ? (
          <button type="button" className="btn btn--primary" onClick={() => setHow(true)}>
            {t('install.how')}
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => void promptInstall()}>
            {t('install.button')}
          </button>
        )}
        <button
          type="button"
          className="btn btn--icon"
          aria-label={t('install.dismiss')}
          onClick={() => dismissBanner()}
        >
          ✕
        </button>
      </section>
      {how && <InstallHowTo onClose={() => setHow(false)} />}
    </>
  )
}

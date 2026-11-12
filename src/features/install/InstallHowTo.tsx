import { useT } from '../../state/hooks'
import { Dialog } from '../../ui/Dialog'
import './install.css'

/** iOS has no install prompt: the only way is the share sheet. Opened by the user only. */
export function InstallHowTo({ onClose }: { onClose: () => void }) {
  const t = useT()
  return (
    <Dialog title={t('install.howTitle')} onClose={onClose} closeLabel={t('common.close')}>
      <div className="howto">
        <svg
          className="howto__art"
          viewBox="0 0 160 64"
          role="img"
          aria-label={t('install.howArt')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="6" y="8" width="44" height="48" rx="8" />
          <path d="M28 40V16M20 24l8-8 8 8M20 32v12h16V32" />
          <rect x="64" y="8" width="44" height="48" rx="8" />
          <rect x="76" y="20" width="20" height="20" rx="4" />
          <path d="M86 26v8M82 30h8" />
          <rect x="122" y="8" width="32" height="48" rx="8" />
          <path d="M130 32l6 6 10-12" />
        </svg>
        <ol className="howto__steps">
          <li>{t('install.step1')}</li>
          <li>{t('install.step2')}</li>
          <li>{t('install.step3')}</li>
        </ol>
        <button type="button" className="btn btn--primary" onClick={onClose}>
          {t('common.done')}
        </button>
      </div>
    </Dialog>
  )
}

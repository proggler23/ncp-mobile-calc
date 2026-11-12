import { lazy, Suspense, useEffect, useState } from 'react'
import { GEN_DATA_IDS, GEN_META } from './bridge/gens'
import type { DataGenId } from './bridge/types'
import {
  dismissGenNotice,
  dismissStorageNotice,
  flushMatchup,
  initApp,
  setFormat,
  setGenAndRegulation,
} from './state/app'
import { refreshStaleDownloads } from './pwa'
import { useApp, useT } from './state/hooks'
import { genSelectGroups, genSelectValue, parseGenSelectValue } from './state/genRegulations'
import { InstallBanner, useInstallBanner } from './features/install/InstallBanner'
import { initInstall } from './state/install'
import { initSupportNudge, markMenuSeen, useSupport } from './state/supportNudge'
import { openSharedLink } from './state/share'
import { currentRoute, useRoute } from './state/route'
import { Segmented } from './ui/controls'
import { ToastHost } from './ui/Toast'
import { ShareNotice } from './features/matchup/ShareNotice'

// The matchup screen pulls in the bridge, the engine glue and all pickers; keep it out of the
// first paint. The data tables and NCP scripts load on top of it (see state/lib.ts).
const loadMatchup = () => import('./features/matchup/MatchupScreen')
const MatchupScreen = lazy(loadMatchup)
const TeamsScreen = lazy(() => import('./features/teams/TeamsScreen'))
const MenuSheet = lazy(() =>
  import('./features/menu/MenuSheet').then((m) => ({ default: m.MenuSheet })),
)

function Skeleton() {
  const t = useT()
  return (
    <div className="skeleton" role="status" aria-label={t('loading.app')}>
      <div className="skeleton__block skeleton__block--chips" />
      <div className="skeleton__block" />
      <div className="skeleton__block" />
      <div className="skeleton__block skeleton__block--results" />
    </div>
  )
}

function TopBar() {
  const t = useT()
  const gen = useApp((s) => s.gen)
  const format = useApp((s) => s.format)
  const status = useApp((s) => s.status)
  const lang = useApp((s) => s.lang)
  const regulation = useApp((s) => s.regulation)
  const meta = GEN_META[gen]
  const [menu, setMenu] = useState(false)
  const unseen = useSupport((s) => s.loaded && !s.menuSeen)
  return (
    <header className="topbar">
      <h1 className="topbar__title">{t('app.title')}</h1>
      <select
        className="select topbar__gen"
        aria-label={t('top.gen')}
        value={genSelectValue(gen, regulation)}
        disabled={status === 'loading' || status === 'booting'}
        onChange={(e) => {
          const v = parseGenSelectValue(e.target.value)
          void setGenAndRegulation(v.gen, v.regulation)
        }}
      >
        {genSelectGroups(lang).map((g) => {
          const [first] = g.options
          return g.options.length === 1 && first && !first.regulation ? (
            <option key={g.label} value={first.value}>
              {first.text}
            </option>
          ) : (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.text}
                </option>
              ))}
            </optgroup>
          )
        })}
      </select>
      {meta.formats.length > 1 && (
        <Segmented
          label={t('top.format')}
          value={format}
          onChange={setFormat}
          options={[
            { value: 'singles', label: '1v1', title: t('field.singles') },
            { value: 'doubles', label: '2v2', title: t('field.doubles') },
          ]}
        />
      )}
      <button
        type="button"
        className="btn btn--icon topbar__menu"
        aria-label={unseen ? t('top.menuNew') : t('top.menu')}
        aria-haspopup="dialog"
        onClick={() => {
          markMenuSeen()
          setMenu(true)
        }}
      >
        ⋮{unseen && <span className="topbar__dot" aria-hidden="true" />}
      </button>
      {menu && (
        <Suspense fallback={null}>
          <MenuSheet onClose={() => setMenu(false)} />
        </Suspense>
      )}
    </header>
  )
}

export default function App() {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const status = useApp((s) => s.status)
  const booted = useApp((s) => s.booted)
  const error = useApp((s) => s.error)
  const route = useRoute()
  const genNotice = useApp((s) => s.genNotice)
  const storageNotice = useApp((s) => s.storageNotice)

  useEffect(() => {
    void initApp().then(async () => {
      void initSupportNudge()
      void initInstall()
      // After an app update, re-download the generations the user had saved for offline use.
      const { prefetchGen } = await import('./bridge/maps')
      await refreshStaleDownloads(GEN_DATA_IDS, (g) => prefetchGen(g as DataGenId))
    })
    void loadMatchup() // start fetching the screen chunk while settings/data load
    return () => void flushMatchup()
  }, [])
  // `#/c/<token>`: a shared calc (at start and when a link is opened in the running app).
  useEffect(() => {
    const now = currentRoute()
    if (now.startsWith('c/')) void openSharedLink(now.slice(2))
  }, [route])
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const banner = useInstallBanner()

  return (
    <div className={banner ? 'app app--banner' : 'app'}>
      <InstallBanner />
      <TopBar />
      <main className="app__main">
        {genNotice && (
          <div className="notice" role="alert">
            <p>
              {t(genNotice.offline ? 'gen.offline' : 'gen.failed', {
                gen: GEN_META[genNotice.gen].label,
              })}
              {genNotice.offline && ` ${t('gen.redownloadHint')}`}
            </p>
            <button type="button" className="btn" onClick={dismissGenNotice}>
              {t('common.dismiss')}
            </button>
          </div>
        )}
        <ShareNotice />
        {storageNotice && (
          <div className="notice" role="status">
            <p>{t('err.storage')}</p>
            <button type="button" className="btn" onClick={dismissStorageNotice}>
              {t('common.dismiss')}
            </button>
          </div>
        )}
        {status === 'error' && !booted ? (
          <p className="notice notice--error" role="alert">
            {t('error.load')} {error}
          </p>
        ) : booted ? (
          <Suspense fallback={<Skeleton />}>
            {route.startsWith('teams') ? <TeamsScreen /> : <MatchupScreen />}
          </Suspense>
        ) : (
          <Skeleton />
        )}
        {status === 'error' && booted && (
          <p className="notice notice--error" role="alert">
            {t('error.load')} {error}
          </p>
        )}
      </main>
      <ToastHost />
    </div>
  )
}

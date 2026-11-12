import { lazy, Suspense, useEffect, useState } from 'react'
import { GEN_DATA_IDS, GEN_META } from './bridge/gens'
import type { DataGenId } from './bridge/types'
import { initApp, setFormat, setGen, setLang } from './state/app'
import { useApp, useT } from './state/hooks'
import { Segmented } from './ui/controls'

// The matchup screen pulls in the bridge, the engine glue and all pickers; keep it out of the
// first paint. The data tables and NCP scripts load on top of it (see state/lib.ts).
const loadMatchup = () => import('./features/matchup/MatchupScreen')
const MatchupScreen = lazy(loadMatchup)

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
  const lang = useApp((s) => s.lang)
  const gen = useApp((s) => s.gen)
  const format = useApp((s) => s.format)
  const status = useApp((s) => s.status)
  const meta = GEN_META[gen]
  return (
    <header className="topbar">
      <h1 className="topbar__title">{t('app.title')}</h1>
      <select
        className="select topbar__gen"
        aria-label={t('top.gen')}
        value={gen}
        disabled={status === 'loading' || status === 'booting'}
        onChange={(e) => void setGen(e.target.value as DataGenId)}
      >
        {GEN_DATA_IDS.map((g) => (
          <option key={g} value={g}>
            {GEN_META[g].label}
          </option>
        ))}
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
        className="btn topbar__lang"
        aria-label={t('top.lang')}
        onClick={() => setLang(lang === 'de' ? 'en' : 'de')}
      >
        {lang === 'de' ? 'DE' : 'EN'}
      </button>
    </header>
  )
}

function TeamsPlaceholder() {
  const t = useT()
  return (
    <section className="placeholder">
      <h2>{t('team.placeholderTitle')}</h2>
      {/* TODO(Phase 5b): team list and team editor. */}
      <p>{t('team.placeholderText')}</p>
      <a className="btn btn--primary" href="#/">
        {t('common.back')}
      </a>
    </section>
  )
}

function useHashRoute(): string {
  const [hash, setHash] = useState(() => globalThis.location?.hash ?? '')
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash.replace(/^#\/?/, '')
}

export default function App() {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const status = useApp((s) => s.status)
  const booted = useApp((s) => s.booted)
  const error = useApp((s) => s.error)
  const route = useHashRoute()

  useEffect(() => {
    void initApp()
    void loadMatchup() // start fetching the screen chunk while settings/data load
  }, [])
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return (
    <div className="app">
      <TopBar />
      <main className="app__main">
        {route.startsWith('teams') ? (
          <TeamsPlaceholder />
        ) : status === 'error' && !booted ? (
          <p className="notice notice--error" role="alert">
            {t('error.load')} {error}
          </p>
        ) : booted ? (
          <Suspense fallback={<Skeleton />}>
            <MatchupScreen />
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
    </div>
  )
}

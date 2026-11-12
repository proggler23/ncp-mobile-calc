import { useRef, useState } from 'react'
import { GEN_DATA_IDS } from '../../bridge/gens'
import { prefetchGen } from '../../bridge/maps'
import { SUPPORT_URL } from '../../config'
import { markAllDownloaded } from '../../pwa'
import { getRepository, reloadLibrary, setLang, store } from '../../state/app'
import { useApp, useT } from '../../state/hooks'
import { StorageError, errorKey } from '../../state/teams'
import { Dialog } from '../../ui/Dialog'
import { Segmented } from '../../ui/controls'
import { DataVersionInfo } from './DataVersionInfo'
import './menu.css'

type Msg = { kind: 'ok' | 'error'; text: string }

export function MenuSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const fileInput = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<Msg>()
  const [file, setFile] = useState<{ name: string; text: string }>()
  const [progress, setProgress] = useState<{ done: number; total: number }>()

  const exportBackup = async () => {
    try {
      const text = await (await getRepository()).exportBackup()
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `ncp-calc-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setMsg({ kind: 'ok', text: t('menu.exported') })
    } catch (e) {
      setMsg({ kind: 'error', text: t(errorKey(e)) })
    }
  }

  const pickFile = async (f: File | undefined) => {
    if (!f) return
    setMsg(undefined)
    setFile({ name: f.name, text: await f.text() })
  }

  const doImport = async (mode: 'merge' | 'replace') => {
    if (!file) return
    try {
      const repo = await getRepository()
      const r = await repo.importBackup(file.text, mode)
      // Keep the stored settings in line with what is on screen (the backup may carry others).
      const s = store.get()
      await repo.setSettings({ lang: s.lang, gen: s.gen, format: s.format })
      await reloadLibrary()
      setMsg({
        kind: 'ok',
        text: t('menu.importDone', { teams: r.teams, sets: r.customSets, skipped: r.skipped }),
      })
    } catch (e) {
      setMsg({
        kind: 'error',
        text:
          e instanceof StorageError && e.code === 'invalid'
            ? t('menu.importFailed')
            : t(errorKey(e)),
      })
    }
    setFile(undefined)
    if (fileInput.current) fileInput.current.value = ''
  }

  const downloadAll = async () => {
    setMsg(undefined)
    setProgress({ done: 0, total: GEN_DATA_IDS.length })
    try {
      for (const [i, g] of GEN_DATA_IDS.entries()) {
        await prefetchGen(g)
        setProgress({ done: i + 1, total: GEN_DATA_IDS.length })
      }
      markAllDownloaded()
      setMsg({ kind: 'ok', text: t('menu.downloaded') })
    } catch {
      setMsg({ kind: 'error', text: t('menu.downloadFailed') })
    }
    setProgress(undefined)
  }

  return (
    <Dialog title={t('menu.title')} onClose={onClose} closeLabel={t('common.close')}>
      <div className="menu">
        <section className="menu__section" aria-labelledby="menu-lang">
          <h3 id="menu-lang">{t('menu.language')}</h3>
          <Segmented
            label={t('menu.language')}
            value={lang}
            onChange={setLang}
            options={[
              { value: 'en', label: 'English' },
              { value: 'de', label: 'Deutsch' },
            ]}
          />
        </section>

        <section className="menu__section" aria-labelledby="menu-backup">
          <h3 id="menu-backup">{t('menu.backup')}</h3>
          <p className="hint">{t('menu.backupHint')}</p>
          <div className="menu__row">
            <button type="button" className="btn" onClick={() => void exportBackup()}>
              {t('menu.export')}
            </button>
            <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
              {t('menu.import')}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-label={t('menu.import')}
              data-testid="backup-file"
              onChange={(e) => void pickFile(e.target.files?.[0])}
            />
          </div>
          {file && (
            <div
              className="notice"
              role="group"
              aria-label={t('menu.importChoose', { file: file.name })}
            >
              <p>{t('menu.importChoose', { file: file.name })}</p>
              <div className="menu__row">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void doImport('merge')}
                >
                  {t('menu.merge')}
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => void doImport('replace')}
                >
                  {t('menu.replace')}
                </button>
                <button type="button" className="btn" onClick={() => setFile(undefined)}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="menu__section" aria-labelledby="menu-offline">
          <h3 id="menu-offline">{t('menu.offline')}</h3>
          <p className="hint">{t('menu.offlineHint')}</p>
          <button
            type="button"
            className="btn"
            disabled={!!progress}
            onClick={() => void downloadAll()}
          >
            {progress
              ? t('menu.downloading', { done: progress.done, total: progress.total })
              : t('menu.downloadAll')}
          </button>
        </section>

        {msg && (
          <p
            className={msg.kind === 'ok' ? 'toast' : 'notice notice--error'}
            role={msg.kind === 'ok' ? 'status' : 'alert'}
          >
            {msg.text}
          </p>
        )}

        <section className="menu__section">
          <a
            className="btn menu__support"
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('menu.support')}
          </a>
          <p className="hint">{t('menu.supportHint')}</p>
        </section>

        <section className="menu__section" aria-labelledby="menu-about">
          <h3 id="menu-about">{t('menu.about')}</h3>
          <p className="muted">{t('menu.version', { version: __APP_VERSION__ })}</p>
          <DataVersionInfo />
        </section>
      </div>
    </Dialog>
  )
}

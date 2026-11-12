import { useState } from 'react'
import { GEN_META } from '../../bridge/gens'
import { useApp, useT } from '../../state/hooks'
import { goBack, navigate, useRoute } from '../../state/route'
import { createTeam, deleteTeam, duplicateTeam, switchActiveTeam } from '../../state/teams'
import type { Team } from '../../storage/types'
import { ConfirmDialog, NameDialog } from '../../ui/prompts'
import { SupportButton } from '../../ui/SupportButton'
import { PasteImportDialog } from './PasteImportDialog'
import { TeamDetail } from './TeamDetail'
import { useRunner } from './useRunner'
import './teams.css'

type Modal = 'new' | 'import' | { del: Team } | null

function TeamList() {
  const t = useT()
  const gen = useApp((s) => s.gen)
  const teams = useApp((s) => s.teams)
  const activeUid = useApp((s) => s.team?.uid)
  const [filter, setFilter] = useState<'current' | 'all'>('current')
  const [modal, setModal] = useState<Modal>(null)
  const { error, run } = useRunner()
  const close = () => setModal(null)
  const shown = filter === 'all' ? teams : teams.filter((x) => x.gen === gen)
  const hidden = teams.length - teams.filter((x) => x.gen === gen).length
  const open = (uid: string) => navigate(`/teams/${uid}`)

  return (
    <section className="teams" aria-labelledby="teams-title">
      <div className="teams__bar">
        <button type="button" className="btn" onClick={() => goBack('/')}>
          ← {t('teams.back')}
        </button>
      </div>
      <h2 id="teams-title" className="teams__title">
        {t('teams.title')}
      </h2>

      <div className="teams__actions">
        <button type="button" className="btn btn--primary" onClick={() => setModal('new')}>
          + {t('teams.new')}
        </button>
        <button type="button" className="btn" onClick={() => setModal('import')}>
          {t('teams.import')}
        </button>
      </div>

      <label className="field">
        <span className="field__label">{t('teams.filter')}</span>
        <select
          className="select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'current' | 'all')}
        >
          <option value="current">{t('teams.filterCurrent', { gen: GEN_META[gen].label })}</option>
          <option value="all">{t('teams.filterAll')}</option>
        </select>
      </label>

      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="muted pad">
          {t('teams.empty')}
          {filter === 'current' && hidden > 0 && ` (+${hidden} ${t('teams.filterAll')})`}
        </p>
      ) : (
        <ul className="team-list">
          {shown.map((tm) => (
            <li key={tm.uid} className="team-card">
              <button
                type="button"
                className="team-card__main"
                aria-label={t('teams.open', { name: tm.name })}
                onClick={() => open(tm.uid)}
              >
                <span className="team-card__name">{tm.name}</span>
                <span className="team-card__meta">
                  {GEN_META[tm.gen].label} · {t('teams.count', { n: tm.members.length })}
                  {tm.uid === activeUid && (
                    <span className="badge badge--on">{t('teams.active')}</span>
                  )}
                </span>
              </button>
              <div className="team-card__btns">
                <button
                  type="button"
                  className="btn"
                  disabled={tm.uid === activeUid}
                  onClick={() => void run(() => switchActiveTeam(tm.uid))}
                >
                  {tm.uid === activeUid ? `✓ ${t('teams.active')}` : t('teams.setActive')}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void run(() => duplicateTeam(tm.uid, t('teams.copySuffix')))}
                >
                  {t('teams.duplicate')}
                </button>
                <button
                  type="button"
                  className="btn btn--icon"
                  aria-label={`${t('teams.delete')}: ${tm.name}`}
                  onClick={() => setModal({ del: tm })}
                >
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SupportButton className="support-card">{t('support.card')}</SupportButton>

      {modal === 'new' && (
        <NameDialog
          title={t('teams.newTitle')}
          label={t('teams.nameLabel')}
          initial={t('teams.defaultName')}
          confirmLabel={t('common.create')}
          onSubmit={(name) =>
            void run(async () => {
              const created = await createTeam(name, gen)
              open(created.uid)
            })
          }
          onClose={close}
        />
      )}
      {modal === 'import' && (
        <PasteImportDialog
          gen={gen}
          onClose={close}
          onOpen={(tm) => {
            close()
            open(tm.uid)
          }}
        />
      )}
      {typeof modal === 'object' && modal && (
        <ConfirmDialog
          title={t('teams.deleteTitle')}
          message={t('teams.deleteText', { name: modal.del.name })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => void run(() => deleteTeam(modal.del.uid))}
          onClose={close}
        />
      )}
    </section>
  )
}

/** `#/teams` (list) and `#/teams/<uid>` (detail). */
export default function TeamsScreen() {
  const t = useT()
  const route = useRoute()
  const teams = useApp((s) => s.teams)
  const uid = /^teams\/([^/]+)/.exec(route)?.[1]
  if (!uid) return <TeamList />
  const team = teams.find((x) => x.uid === uid)
  if (!team) {
    return (
      <section className="teams">
        <p className="notice" role="note">
          {t('teams.notFound')}
        </p>
        <button type="button" className="btn" onClick={() => goBack('/teams')}>
          ← {t('teams.title')}
        </button>
      </section>
    )
  }
  return <TeamDetail team={team} />
}

import { useState } from 'react'
import { GEN_META } from '../../bridge/gens'
import { setGen } from '../../state/app'
import { speciesItems } from '../../state/catalog'
import { useApp, useT } from '../../state/hooks'
import { getLib } from '../../state/lib'
import { goBack, navigate } from '../../state/route'
import { savedToSet } from '../../state/app'
import {
  addMember,
  deleteTeam,
  moveMember,
  removeMember,
  renameTeam,
  switchActiveTeam,
  teamPaste,
  updateMember,
} from '../../state/teams'
import { LIMITS, type SavedSet, type Team } from '../../storage/types'
import { SearchOverlay } from '../../ui/SearchOverlay'
import { ConfirmDialog, NameDialog } from '../../ui/prompts'
import { ExportDialog } from './ExportDialog'
import { MemberEditorSheet } from './MemberEditorSheet'
import { PasteImportDialog } from './PasteImportDialog'
import { useRunner } from './useRunner'

type Modal = 'rename' | 'delete' | 'add' | 'import' | 'export' | { edit: SavedSet } | null

function memberSummary(gen: Team['gen'], m: SavedSet, lang: 'de' | 'en'): string {
  const { bridge } = getLib()
  const meta = GEN_META[gen]
  const n = (kind: 'items' | 'abilities' | 'moves', id: string) =>
    bridge.displayName(gen, kind, id, lang)
  const first = [
    meta.hasItems && m.itemId ? n('items', m.itemId) : undefined,
    meta.hasAbilities && m.abilityId ? n('abilities', m.abilityId) : undefined,
  ].filter(Boolean)
  return [first.join(' · '), m.moveIds.map((id) => n('moves', id)).join(', ')]
    .filter(Boolean)
    .join(' — ')
}

export function TeamDetail({ team }: { team: Team }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const gen = useApp((s) => s.gen)
  const active = useApp((s) => s.team?.uid === team.uid)
  const busy = useApp((s) => s.status === 'loading')
  const [modal, setModal] = useState<Modal>(null)
  const { error, run } = useRunner()
  const close = () => setModal(null)
  const sameGen = team.gen === gen
  const full = team.members.length >= LIMITS.maxMembers
  const name = (id: string) => (sameGen ? getLib().bridge.speciesDisplayName(gen, id, lang) : id)

  return (
    <section className="teams" aria-labelledby="team-title">
      <div className="teams__bar">
        <button type="button" className="btn" onClick={() => goBack('/teams')}>
          ← {t('teams.title')}
        </button>
        <h2 id="team-title" className="teams__title">
          {team.name}
        </h2>
        <button
          type="button"
          className="btn btn--icon"
          aria-label={t('teams.rename')}
          onClick={() => setModal('rename')}
        >
          ✎
        </button>
      </div>
      <p className="muted">
        {GEN_META[team.gen].label} · {t('teams.count', { n: team.members.length })}
      </p>

      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {!sameGen && (
        <div className="notice" role="note">
          <p>{t('teams.otherGen', { gen: GEN_META[team.gen].label })}</p>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void setGen(team.gen)}
          >
            {t('teams.switch', { gen: GEN_META[team.gen].label })}
          </button>
        </div>
      )}

      <div className="teams__actions">
        <button
          type="button"
          className={`btn ${active ? '' : 'btn--primary'}`}
          disabled={active}
          onClick={() => void run(() => switchActiveTeam(team.uid))}
        >
          {active ? `✓ ${t('teams.active')}` : t('teams.setActive')}
        </button>
        <button type="button" className="btn" onClick={() => navigate('/')}>
          {t('teams.back')}
        </button>
      </div>

      {team.members.length === 0 ? (
        <p className="muted pad">{t('teams.noMembers')}</p>
      ) : (
        <ol className="members">
          {team.members.map((m, i) => {
            const label = name(m.speciesId)
            return (
              <li key={m.uid} className="member">
                <button
                  type="button"
                  className="member__main"
                  disabled={!sameGen}
                  aria-label={t('teams.edit', { name: label })}
                  onClick={() => setModal({ edit: m })}
                >
                  <span className="member__name">{label}</span>
                  {sameGen && <span className="member__sub">{memberSummary(gen, m, lang)}</span>}
                </button>
                <div className="member__btns">
                  <button
                    type="button"
                    className="btn btn--icon"
                    aria-label={t('teams.up', { name: label })}
                    disabled={i === 0}
                    onClick={() => void run(() => moveMember(team.uid, i, -1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn--icon"
                    aria-label={t('teams.down', { name: label })}
                    disabled={i === team.members.length - 1}
                    onClick={() => void run(() => moveMember(team.uid, i, 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn--icon"
                    aria-label={t('teams.remove', { name: label })}
                    onClick={() => void run(() => removeMember(team.uid, m.uid))}
                  >
                    ✕
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <button
        type="button"
        className="btn btn--primary"
        disabled={!sameGen || full}
        onClick={() => setModal('add')}
      >
        + {t('teams.addMember')}
      </button>
      {full && <p className="hint">{t('teams.full')}</p>}

      <div className="teams__actions">
        <button
          type="button"
          className="btn"
          disabled={!sameGen}
          onClick={() => setModal('import')}
        >
          {t('teams.import')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!sameGen || team.members.length === 0}
          onClick={() => setModal('export')}
        >
          {t('teams.export')}
        </button>
        <button type="button" className="btn btn--danger" onClick={() => setModal('delete')}>
          {t('teams.delete')}
        </button>
      </div>

      {modal === 'rename' && (
        <NameDialog
          title={t('teams.rename')}
          label={t('teams.nameLabel')}
          initial={team.name}
          confirmLabel={t('common.save')}
          onSubmit={(n) => void run(() => renameTeam(team.uid, n))}
          onClose={close}
        />
      )}
      {modal === 'delete' && (
        <ConfirmDialog
          title={t('teams.deleteTitle')}
          message={t('teams.deleteText', { name: team.name })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() =>
            void run(async () => {
              await deleteTeam(team.uid)
              goBack('/teams')
            })
          }
          onClose={close}
        />
      )}
      {modal === 'add' && (
        <SearchOverlay
          title={t('teams.addTitle')}
          placeholder={t('search.species')}
          items={speciesItems(team.gen, lang)}
          onClose={close}
          onPick={(id) => {
            close()
            void run(() => addMember(team.uid, id))
          }}
        />
      )}
      {modal === 'import' && <PasteImportDialog gen={team.gen} target={team} onClose={close} />}
      {modal === 'export' && (
        <ExportDialog title={t('teams.exportTitle')} text={teamPaste(team)} onClose={close} />
      )}
      {typeof modal === 'object' && modal && (
        <MemberEditorSheet
          gen={team.gen}
          initial={savedToSet(modal.edit)}
          onSave={(set) => void run(() => updateMember(team.uid, modal.edit.uid, set))}
          onClose={close}
        />
      )}
    </section>
  )
}

import { useState } from 'react'
import { GEN_META } from '../../bridge/gens'
import { store, updateSet, type Side } from '../../state/app'
import { useApp, useT } from '../../state/hooks'
import { getLib } from '../../state/lib'
import { createTeam, errorKey, saveCustomSet, saveToTeam } from '../../state/teams'
import { LIMITS, type Team } from '../../storage/types'
import { Dialog } from '../../ui/Dialog'
import { NameDialog } from '../../ui/prompts'
import { PokemonEditor } from '../editor/PokemonEditor'

type Msg = { kind: 'ok' | 'error'; text: string }
type Sub = 'team' | 'newTeam' | 'set' | null

/** Chooser for "Save to team" when the build did not come from a team slot. */
function TeamChooser({
  teams,
  onPick,
  onNew,
  onClose,
}: {
  teams: Team[]
  onPick: (t: Team) => void
  onNew: () => void
  onClose: () => void
}) {
  const t = useT()
  const gen = useApp((s) => s.gen)
  return (
    <Dialog title={t('ed.chooseTeam')} onClose={onClose} closeLabel={t('common.close')}>
      {teams.length === 0 && (
        <p className="muted pad">{t('ed.noTeamForGen', { gen: GEN_META[gen].label })}</p>
      )}
      <ul className="list">
        {teams.map((tm) => (
          <li key={tm.uid}>
            <button type="button" className="row" onClick={() => onPick(tm)}>
              <span className="row__primary">{tm.name}</span>
              <span className="row__secondary">{t('teams.count', { n: tm.members.length })}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="sheet-actions">
        <button type="button" className="btn btn--primary" onClick={onNew}>
          + {t('ed.newTeam')}
        </button>
      </div>
    </Dialog>
  )
}

export function EditorSheet({ side, onClose }: { side: Side; onClose: () => void }) {
  const t = useT()
  const gen = useApp((s) => s.gen)
  const lang = useApp((s) => s.lang)
  const set = useApp((s) => s[side])
  const team = useApp((s) => s.team)
  const teams = useApp((s) => s.teams)
  const index = useApp((s) => s.mineTeamIndex)
  const [sub, setSub] = useState<Sub>(null)
  const [msg, setMsg] = useState<Msg>()
  const calcResult = useApp((s) => s.calc?.result)
  const sideStats = side === 'mine' ? calcResult?.attackerStats : calcResult?.defenderStats
  if (!set) return null

  const origin = side === 'mine' && team?.gen === gen && index !== undefined ? team : undefined
  const member = origin && index !== undefined ? origin.members[index] : undefined
  // Active team first, then the others of this generation that still have a free slot.
  const choices = [...teams]
    .filter((x) => x.gen === gen && x.members.length < LIMITS.maxMembers)
    .sort((a, b) => Number(b.uid === team?.uid) - Number(a.uid === team?.uid))

  const attempt = async (fn: () => Promise<string>) => {
    try {
      setMsg({ kind: 'ok', text: await fn() })
    } catch (e) {
      setMsg({ kind: 'error', text: t(errorKey(e)) })
    }
  }
  const current = () => store.get()[side] ?? set

  const saveInto = (tm: Team, memberUid?: string) =>
    attempt(async () => {
      const build = current()
      await saveToTeam(tm.uid, build, memberUid)
      // Appended to the active team: the build now belongs to that slot (later saves update it).
      if (!memberUid && store.get().team?.uid === tm.uid) {
        store.set({ mineTeamIndex: tm.members.length })
      }
      return t(memberUid ? 'ed.savedToTeam' : 'ed.addedToTeam', { team: tm.name })
    })

  const speciesName = getLib().bridge.speciesDisplayName(gen, set.speciesId, lang)

  return (
    <Dialog
      title={t(side === 'mine' ? 'ed.titleMine' : 'ed.titleOpp')}
      onClose={onClose}
      closeLabel={t('common.close')}
    >
      <PokemonEditor
        gen={gen}
        value={set}
        stats={sideStats}
        onChange={(next) => updateSet(side, () => next)}
      />
      {msg && (
        <p className={msg.kind === 'ok' ? 'toast' : 'notice notice--error'} role="status">
          {msg.text}
        </p>
      )}
      <p className="hint">{t('ed.battleNote')}</p>
      <div className="sheet-actions">
        {side === 'mine' && (
          <button
            type="button"
            className="btn"
            onClick={() => (origin && member ? void saveInto(origin, member.uid) : setSub('team'))}
          >
            {t('ed.save')}
          </button>
        )}
        <button type="button" className="btn" onClick={() => setSub('set')}>
          {t('ed.saveSet')}
        </button>
        <button type="button" className="btn btn--primary" onClick={onClose}>
          {t('common.done')}
        </button>
      </div>

      {sub === 'team' && (
        <TeamChooser
          teams={choices}
          onClose={() => setSub(null)}
          onNew={() => setSub('newTeam')}
          onPick={(tm) => {
            setSub(null)
            void saveInto(tm)
          }}
        />
      )}
      {sub === 'newTeam' && (
        <NameDialog
          title={t('teams.newTitle')}
          label={t('teams.nameLabel')}
          initial={t('teams.defaultName')}
          confirmLabel={t('common.create')}
          onSubmit={(name) =>
            void attempt(async () => {
              const tm = await createTeam(name, gen)
              await saveToTeam(tm.uid, current())
              if (store.get().team?.uid === tm.uid) store.set({ mineTeamIndex: 0 })
              return t('ed.addedToTeam', { team: tm.name })
            })
          }
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'set' && (
        <NameDialog
          title={t('ed.setTitle')}
          label={t('ed.setName')}
          initial={speciesName}
          confirmLabel={t('common.save')}
          onSubmit={(name) =>
            void attempt(async () => {
              const cs = await saveCustomSet(gen, name, current())
              return t('ed.setSaved', { name: cs.name })
            })
          }
          onClose={() => setSub(null)}
        />
      )}
    </Dialog>
  )
}

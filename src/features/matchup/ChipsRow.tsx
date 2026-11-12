import { useEffect, useRef, useState } from 'react'
import { GEN_META } from '../../bridge/gens'
import { selectTeamMember, setGen } from '../../state/app'
import { useApp, useT } from '../../state/hooks'
import { getLib } from '../../state/lib'
import { buildProblemsOf, regulationName } from '../../state/regulation'
import { switchActiveTeam } from '../../state/teams'
import { NavLink } from '../../ui/NavLink'
import '../regulation/legal.css'
import { chipLabels } from './chipLabels'

function TeamSwitcher({ onDone }: { onDone: () => void }) {
  const t = useT()
  const teams = useApp((s) => s.teams)
  const team = useApp((s) => s.team)
  const gen = useApp((s) => s.gen)
  // Teams of the current generation first, then the others (labelled with their generation).
  const sorted = [...teams.filter((x) => x.gen === gen), ...teams.filter((x) => x.gen !== gen)]
  return (
    <div className="team-bar">
      <select
        className="select"
        aria-label={t('team.switcher')}
        value={team?.uid ?? ''}
        onChange={(e) => {
          if (!e.target.value) return
          void switchActiveTeam(e.target.value)
          onDone()
        }}
      >
        {!team && (
          <option value="" disabled>
            {t('team.noneActive')}
          </option>
        )}
        {sorted.map((x) => (
          <option key={x.uid} value={x.uid}>
            {x.gen === gen
              ? x.name
              : t('team.optionOtherGen', { name: x.name, gen: GEN_META[x.gen].label })}
          </option>
        ))}
      </select>
      <NavLink to="/teams" className="btn">
        {t('team.manage')}
      </NavLink>
    </div>
  )
}

/** Compact ▾ button that opens the team switcher (select + "Manage teams") below the chips. */
function SwitcherButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      className="chip chip--switcher"
      aria-label={t('team.switcherShort')}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span aria-hidden="true">{open ? '▴' : '▾'}</span>
    </button>
  )
}

export function ChipsRow() {
  const t = useT()
  const team = useApp((s) => s.team)
  const teams = useApp((s) => s.teams)
  const gen = useApp((s) => s.gen)
  const lang = useApp((s) => s.lang)
  const selected = useApp((s) => s.mineTeamIndex)
  const regulation = useApp((s) => s.regulation)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  if (teams.length === 0) {
    return (
      <div className="chips-row chips-row--single">
        <NavLink to="/teams" className="chip chip--add" title={t('team.create')}>
          {t('team.chipsEmpty')}
        </NavLink>
      </div>
    )
  }
  const toggle = <SwitcherButton open={open} onToggle={() => setOpen(!open)} />
  let body
  if (!team) {
    body = <span className="muted chips-row__note">{t('team.noneActive')}</span>
  } else if (team.gen !== gen) {
    body = (
      <>
        <span className="muted chips-row__note">
          {t('team.otherGen', { team: team.name, gen: GEN_META[team.gen].label })}
        </span>
        <button type="button" className="btn" onClick={() => void setGen(team.gen)}>
          {t('team.switchGen', { gen: GEN_META[team.gen].label })}
        </button>
      </>
    )
  } else if (team.members.length === 0) {
    body = <span className="muted chips-row__note">{t('teams.noMembers')}</span>
  } else {
    const { bridge } = getLib()
    const shown = chipLabels(team.members, lang, (id) => bridge.speciesRecord(gen, id))
    body = (
      <div
        className="chips-row__members"
        role="group"
        aria-label={t('team.members', { team: team.name })}
      >
        {team.members.map((m, i) => {
          const full = bridge.speciesDisplayName(gen, m.speciesId, lang)
          const { label: text, badge } = shown[i]!
          const illegal = !!buildProblemsOf(gen, regulation, m)
          const warn = t('reg.notLegal', { reg: regulationName(gen, regulation, lang) })
          const label = illegal ? `${full}. ${warn}` : full
          return (
            <button
              key={m.uid}
              type="button"
              className="chip"
              aria-pressed={selected === i}
              aria-label={label}
              title={label}
              onClick={() => selectTeamMember(i)}
            >
              {text}
              {badge && (
                <span className="chip__forme" aria-hidden="true">
                  {badge}
                </span>
              )}
              {illegal && (
                <span className="chip__warn" aria-hidden="true">
                  ⚠
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="chips-wrap" ref={ref}>
      <div className="chips-row">
        {toggle}
        {body}
      </div>
      {open && <TeamSwitcher onDone={() => setOpen(false)} />}
    </div>
  )
}

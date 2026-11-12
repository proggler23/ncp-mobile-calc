import { GEN_META } from '../../bridge/gens'
import { selectTeamMember, setGen } from '../../state/app'
import { useApp, useT } from '../../state/hooks'
import { getLib } from '../../state/lib'
import { switchActiveTeam } from '../../state/teams'
import { NavLink } from '../../ui/NavLink'

function TeamSwitcher() {
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
        onChange={(e) => e.target.value && void switchActiveTeam(e.target.value)}
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

export function ChipsRow() {
  const t = useT()
  const team = useApp((s) => s.team)
  const teams = useApp((s) => s.teams)
  const gen = useApp((s) => s.gen)
  const lang = useApp((s) => s.lang)
  const selected = useApp((s) => s.mineTeamIndex)

  if (teams.length === 0) {
    return (
      <div className="chips-row">
        <NavLink to="/teams" className="btn btn--cta">
          + {t('team.create')}
        </NavLink>
      </div>
    )
  }
  let body
  if (!team) {
    body = null
  } else if (team.gen !== gen) {
    body = (
      <div className="chips-row">
        <span className="muted">
          {t('team.otherGen', { team: team.name, gen: GEN_META[team.gen].label })}
        </span>
        <button type="button" className="btn" onClick={() => void setGen(team.gen)}>
          {t('team.switchGen', { gen: GEN_META[team.gen].label })}
        </button>
      </div>
    )
  } else if (team.members.length === 0) {
    body = (
      <div className="chips-row">
        <span className="muted">{t('teams.noMembers')}</span>
      </div>
    )
  } else {
    const { bridge } = getLib()
    body = (
      <div className="chips-row" role="group" aria-label={t('team.members', { team: team.name })}>
        {team.members.map((m, i) => (
          <button
            key={m.uid}
            type="button"
            className="chip"
            aria-pressed={selected === i}
            onClick={() => selectTeamMember(i)}
          >
            {bridge.speciesDisplayName(gen, m.speciesId, lang)}
          </button>
        ))}
      </div>
    )
  }
  return (
    <>
      <TeamSwitcher />
      {body}
    </>
  )
}

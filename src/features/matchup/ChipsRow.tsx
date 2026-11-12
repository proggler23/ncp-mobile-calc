import { GEN_META } from '../../bridge/gens'
import { selectTeamMember, setGen } from '../../state/app'
import { useApp, useT } from '../../state/hooks'
import { getLib } from '../../state/lib'

export function ChipsRow() {
  const t = useT()
  const team = useApp((s) => s.team)
  const gen = useApp((s) => s.gen)
  const lang = useApp((s) => s.lang)
  const selected = useApp((s) => s.mineTeamIndex)

  if (!team) {
    return (
      <div className="chips-row">
        <a className="btn btn--cta" href="#/teams">
          + {t('team.create')}
        </a>
      </div>
    )
  }
  if (team.gen !== gen) {
    return (
      <div className="chips-row">
        <span className="muted">
          {t('team.otherGen', { team: team.name, gen: GEN_META[team.gen].label })}
        </span>
        <button type="button" className="btn" onClick={() => void setGen(team.gen)}>
          {t('team.switchGen', { gen: GEN_META[team.gen].label })}
        </button>
      </div>
    )
  }
  const { bridge } = getLib()
  return (
    <div className="chips-row" role="group" aria-label={t('team.members', { team: team.name })}>
      {team.members.map((m, i) => {
        const label = bridge.speciesDisplayName(gen, m.speciesId, lang)
        return (
          <button
            key={m.uid}
            type="button"
            className="chip"
            aria-pressed={selected === i}
            onClick={() => selectTeamMember(i)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

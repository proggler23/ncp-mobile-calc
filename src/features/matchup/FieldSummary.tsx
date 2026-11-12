import { toFieldInput } from '../../state/field'
import { fieldSummary } from '../../state/fieldSummary'
import { useApp, useT } from '../../state/hooks'

export function FieldSummary() {
  const t = useT()
  const gen = useApp((s) => s.gen)
  const format = useApp((s) => s.format)
  const field = useApp((s) => s.field)
  const calc = useApp((s) => s.calc)
  // The calculation's field has the weather/terrain derived from abilities filled in.
  const f = calc?.input.field ?? toFieldInput(field, format)
  const { effects, format: fmt, mine, opp } = fieldSummary(t, gen, format, field, f)
  const parts = fmt ? [...effects, fmt] : effects
  return (
    <p className="fieldsum">
      <span>
        {t('field.label')}: {parts.join(' · ')}
      </span>
      {mine && (
        <span>
          {t('card.mine')}: {mine}
        </span>
      )}
      {opp && (
        <span>
          {t('card.opp')}: {opp}
        </span>
      )}
    </p>
  )
}

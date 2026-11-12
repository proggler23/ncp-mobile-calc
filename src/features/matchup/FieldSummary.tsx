import { GEN_META } from '../../bridge/gens'
import type { Key } from '../../i18n'
import { toFieldInput, type SideFlag } from '../../state/field'
import { useApp, useT } from '../../state/hooks'

const WEATHER_ICON: Record<string, string> = {
  Sun: '☀',
  'Harsh Sun': '☀☀',
  Rain: '🌧',
  'Heavy Rain': '🌧🌧',
  Sand: '🏜',
  Hail: '❄',
  Snow: '❄',
  'Strong Winds': '🌬',
}

export function FieldSummary() {
  const t = useT()
  const gen = useApp((s) => s.gen)
  const format = useApp((s) => s.format)
  const field = useApp((s) => s.field)
  const calc = useApp((s) => s.calc)
  const meta = GEN_META[gen]
  // The calculation's field has the weather/terrain derived from abilities filled in.
  const f = calc?.input.field ?? toFieldInput(field, format)
  const parts: string[] = []
  if (f.weather)
    parts.push(`${WEATHER_ICON[f.weather] ?? ''} ${t(`weather.${f.weather}` as Key)}`.trim())
  if (f.terrain) parts.push(t(`terrain.${f.terrain}` as Key))
  if (f.gravity) parts.push(t('field.gravity'))
  if (f.neutralizingGas) parts.push(t('field.neutralizingGas'))
  for (const k of ['fairy', 'dark', 'break'] as const)
    if (f.auras?.[k]) parts.push(t(`field.aura.${k}` as Key))
  for (const k of ['tablets', 'vessel', 'sword', 'beads'] as const)
    if (f.ruin?.[k]) parts.push(t(`field.ruin.${k}` as Key))
  parts.push(t(format === 'doubles' ? 'field.doubles' : 'field.singles'))
  if (meta.formats.length === 1) parts.pop()

  const side = (s: typeof field.mine) =>
    [
      ...(Object.keys(s) as (SideFlag | 'spikes')[])
        .filter((k) => k !== 'spikes' && s[k])
        .map((k) => t(`side.${k}` as Key)),
      ...(s.spikes ? [`${t('side.spikes')} ${s.spikes}`] : []),
    ].join(', ')
  const mine = side(field.mine)
  const opp = side(field.opp)
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

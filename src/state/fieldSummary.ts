import { GEN_META } from '../bridge/gens'
import type { DataGenId } from '../bridge/types'
import type { FieldInput } from '../engine/types'
import type { TFn, Key } from '../i18n'
import type { Format } from '../storage/types'
import { toFieldInput, type SideFlag, type UiField } from './field'

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

export interface FieldSummaryParts {
  /** Weather, terrain, gravity, ... (without the battle format). */
  effects: string[]
  /** "Singles" / "Doubles"; undefined for generations with a single format. */
  format?: string
  mine: string
  opp: string
}

/**
 * Plain-text summary of the field (shown under the results and in shared calcs). `calcField` is
 * the calculation's field with weather/terrain derived from abilities filled in.
 */
export function fieldSummary(
  t: TFn,
  gen: DataGenId,
  format: Format,
  field: UiField,
  calcField?: FieldInput,
): FieldSummaryParts {
  const f = calcField ?? toFieldInput(field, format)
  const effects: string[] = []
  if (f.weather)
    effects.push(`${WEATHER_ICON[f.weather] ?? ''} ${t(`weather.${f.weather}` as Key)}`.trim())
  if (f.terrain) effects.push(t(`terrain.${f.terrain}` as Key))
  if (f.gravity) effects.push(t('field.gravity'))
  if (f.neutralizingGas) effects.push(t('field.neutralizingGas'))
  for (const k of ['fairy', 'dark', 'break'] as const)
    if (f.auras?.[k]) effects.push(t(`field.aura.${k}` as Key))
  for (const k of ['tablets', 'vessel', 'sword', 'beads'] as const)
    if (f.ruin?.[k]) effects.push(t(`field.ruin.${k}` as Key))

  const side = (s: typeof field.mine) =>
    [
      ...(Object.keys(s) as (SideFlag | 'spikes')[])
        .filter((k) => k !== 'spikes' && s[k])
        .map((k) => t(`side.${k}` as Key)),
      ...(s.spikes ? [`${t('side.spikes')} ${s.spikes}`] : []),
    ].join(', ')
  return {
    effects,
    format:
      GEN_META[gen].formats.length > 1
        ? t(format === 'doubles' ? 'field.doubles' : 'field.singles')
        : undefined,
    mine: side(field.mine),
    opp: side(field.opp),
  }
}

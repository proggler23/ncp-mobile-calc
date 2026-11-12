import type { PresetId } from '../../bridge/types'
import type { Key } from '../../i18n'
import { applyOppPreset } from '../../state/app'
import { useApp, useT } from '../../state/hooks'
import { Segmented } from '../../ui/controls'

const PRESETS: PresetId[] = ['neutral', 'physDef', 'specDef', 'physAtk', 'specAtk', 'common']

export function PresetRow() {
  const t = useT()
  const opp = useApp((s) => s.opp)
  const preset = useApp((s) => s.oppPreset)
  const hasCommon = useApp((s) => s.oppHasCommon)
  return (
    <Segmented
      label={t('preset.label')}
      value={preset ?? undefined}
      onChange={(p) => void applyOppPreset(p)}
      options={PRESETS.map((p) => ({
        value: p,
        label: t(`preset.${p}` as Key),
        title: t(`preset.${p}.hint` as Key),
        disabled: !opp || (p === 'common' && !hasCommon),
      }))}
    />
  )
}

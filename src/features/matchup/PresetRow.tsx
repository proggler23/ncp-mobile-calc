import { useMemo, useState } from 'react'
import type { PresetId } from '../../bridge/types'
import type { Key } from '../../i18n'
import { applyCustomSet, applyOppPreset } from '../../state/app'
import { useApp, useT } from '../../state/hooks'
import { getLib } from '../../state/lib'
import { deleteCustomSet } from '../../state/teams'
import { Dialog } from '../../ui/Dialog'
import { Segmented } from '../../ui/controls'

const PRESETS: PresetId[] = ['neutral', 'physDef', 'specDef', 'physAtk', 'specAtk', 'common']

function SavedSets({ onClose }: { onClose: () => void }) {
  const t = useT()
  const gen = useApp((s) => s.gen)
  const lang = useApp((s) => s.lang)
  const opp = useApp((s) => s.opp)
  const all = useApp((s) => s.customSets)
  const sets = useMemo(
    () => all.filter((c) => c.gen === gen && c.speciesId === opp?.speciesId),
    [all, gen, opp?.speciesId],
  )
  const { bridge } = getLib()
  const species = opp ? bridge.speciesDisplayName(gen, opp.speciesId, lang) : ''
  return (
    <Dialog
      title={t('preset.savedTitle', { species })}
      onClose={onClose}
      closeLabel={t('common.close')}
    >
      {sets.length === 0 ? (
        <p className="muted pad">{t('search.empty')}</p>
      ) : (
        <ul className="list" aria-label={t('preset.savedHint')}>
          {sets.map((c) => (
            <li key={c.uid} className="saved-row">
              <button
                type="button"
                className="row"
                onClick={() => {
                  applyCustomSet(c)
                  onClose()
                }}
              >
                <span className="row__primary">{c.name}</span>
                <span className="row__detail">
                  {c.set.moveIds.map((id) => bridge.displayName(gen, 'moves', id, lang)).join(', ')}
                </span>
              </button>
              <button
                type="button"
                className="btn btn--icon"
                aria-label={t('preset.deleteSet', { name: c.name })}
                onClick={() => void deleteCustomSet(c.uid)}
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}

export function PresetRow() {
  const t = useT()
  const gen = useApp((s) => s.gen)
  const opp = useApp((s) => s.opp)
  const preset = useApp((s) => s.oppPreset)
  const hasCommon = useApp((s) => s.oppHasCommon)
  const savedCount = useApp(
    (s) => s.customSets.filter((c) => c.gen === gen && c.speciesId === s.opp?.speciesId).length,
  )
  const [open, setOpen] = useState(false)
  return (
    <>
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
      {opp && savedCount > 0 && (
        <button
          type="button"
          className="btn saved-btn"
          title={t('preset.savedHint')}
          onClick={() => setOpen(true)}
        >
          ★ {t('preset.saved')} ({savedCount})
        </button>
      )}
      {open && <SavedSets onClose={() => setOpen(false)} />}
    </>
  )
}

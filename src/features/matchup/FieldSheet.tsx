import { GEN_META } from '../../bridge/gens'
import type { Key } from '../../i18n'
import {
  patchField,
  resetField,
  setFormat,
  setSideFlag,
  setSpikes,
  type Side,
} from '../../state/app'
import {
  fieldSupport,
  sideOptions,
  terrainOptions,
  weatherOptions,
  type UiField,
} from '../../state/field'
import { useApp, useT } from '../../state/hooks'
import { Segmented, Toggle } from '../../ui/controls'
import { Dialog } from '../../ui/Dialog'

function SideSection({ side }: { side: Side }) {
  const t = useT()
  const gen = useApp((s) => s.gen)
  const format = useApp((s) => s.format)
  const field = useApp((s) => s.field)
  const meta = GEN_META[gen]
  const o = sideOptions(meta, format)
  const state = field[side]
  const title = t(side === 'mine' ? 'field.mySide' : 'field.oppSide')
  const toggle = (key: (typeof o.common)[number]['key']) => (
    <Toggle
      key={key}
      label={t(`side.${key}` as Key)}
      checked={!!state[key]}
      onChange={(on) => setSideFlag(side, key, on)}
    />
  )
  return (
    <section className="sheet-section" aria-label={title}>
      <h3>{title}</h3>
      <div className="toggles">
        {o.common.map((opt) => toggle(opt.key))}
        {o.spikes &&
          (o.spikesToggleOnly ? (
            <Toggle
              label={t('side.spikes')}
              checked={!!state.spikes}
              onChange={(on) => setSpikes(side, on ? 1 : 0)}
            />
          ) : (
            <div className="spikes">
              <span>{t('side.spikes')}</span>
              <Segmented
                label={`${title}: ${t('side.spikes')}`}
                value={state.spikes ?? 0}
                onChange={(n) => setSpikes(side, n)}
                options={([0, 1, 2, 3] as const).map((n) => ({ value: n, label: String(n) }))}
              />
            </div>
          ))}
      </div>
      {o.more.length > 0 && (
        <details className="more">
          <summary>{t('field.more')}</summary>
          <div className="toggles">{o.more.map((opt) => toggle(opt.key))}</div>
        </details>
      )}
    </section>
  )
}

export function FieldSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const gen = useApp((s) => s.gen)
  const format = useApp((s) => s.format)
  const field = useApp((s) => s.field)
  const meta = GEN_META[gen]
  const sup = fieldSupport(meta)
  const weathers = weatherOptions(meta)
  const terrains = terrainOptions(meta)
  const setF = (p: Partial<UiField>) => patchField((f) => ({ ...f, ...p }))

  return (
    <Dialog title={t('field.title')} onClose={onClose} closeLabel={t('common.close')}>
      {meta.formats.length > 1 && (
        <section className="sheet-section">
          <h3>{t('field.format')}</h3>
          <Segmented
            label={t('field.format')}
            value={format}
            onChange={setFormat}
            options={[
              { value: 'singles', label: t('field.singles') },
              { value: 'doubles', label: t('field.doubles') },
            ]}
          />
          <p className="hint">
            {t(format === 'doubles' ? 'field.doublesHint' : 'field.singlesHint')}
          </p>
        </section>
      )}
      {weathers.length > 0 && (
        <section className="sheet-section">
          <h3>{t('field.weather')}</h3>
          <Segmented
            wrap
            label={t('field.weather')}
            value={field.weather ?? 'auto'}
            onChange={(v) =>
              setF({ weather: v === 'auto' ? undefined : (v as UiField['weather']) })
            }
            options={[
              { value: 'auto', label: t('field.auto'), title: t('field.autoHint') },
              { value: '', label: t('field.none') },
              ...weathers.map((w) => ({ value: w, label: t(`weather.${w}` as Key) })),
            ]}
          />
        </section>
      )}
      {terrains.length > 0 && (
        <section className="sheet-section">
          <h3>{t('field.terrain')}</h3>
          <Segmented
            wrap
            label={t('field.terrain')}
            value={field.terrain ?? 'auto'}
            onChange={(v) =>
              setF({ terrain: v === 'auto' ? undefined : (v as UiField['terrain']) })
            }
            options={[
              { value: 'auto', label: t('field.auto'), title: t('field.autoHint') },
              { value: '', label: t('field.none') },
              ...terrains.map((w) => ({ value: w, label: t(`terrain.${w}` as Key) })),
            ]}
          />
        </section>
      )}
      {(sup.gravity || sup.neutralizingGas || sup.auras || sup.ruin) && (
        <section className="sheet-section">
          <h3>{t('field.global')}</h3>
          <div className="toggles">
            {sup.gravity && (
              <Toggle
                label={t('field.gravity')}
                checked={field.gravity}
                onChange={(gravity) => setF({ gravity })}
              />
            )}
            {sup.neutralizingGas && (
              <Toggle
                label={t('field.neutralizingGas')}
                checked={field.neutralizingGas}
                onChange={(neutralizingGas) => setF({ neutralizingGas })}
              />
            )}
            {sup.auras &&
              (['fairy', 'dark', 'break'] as const).map((k) => (
                <Toggle
                  key={k}
                  label={t(`field.aura.${k}` as Key)}
                  checked={field.auras[k]}
                  onChange={(on) => setF({ auras: { ...field.auras, [k]: on } })}
                />
              ))}
            {sup.ruin &&
              (['tablets', 'vessel', 'sword', 'beads'] as const).map((k) => (
                <Toggle
                  key={k}
                  label={t(`field.ruin.${k}` as Key)}
                  checked={field.ruin[k]}
                  onChange={(on) => setF({ ruin: { ...field.ruin, [k]: on } })}
                />
              ))}
          </div>
        </section>
      )}
      <SideSection side="mine" />
      <SideSection side="opp" />
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={resetField}>
          {t('field.reset')}
        </button>
        <button type="button" className="btn btn--primary" onClick={onClose}>
          {t('common.done')}
        </button>
      </div>
    </Dialog>
  )
}

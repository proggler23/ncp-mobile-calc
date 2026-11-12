import { useMemo, useState } from 'react'
import { GEN_META } from '../../bridge/gens'
import type { BoostKey, DataGenId, MoveOverride, SavedSetLike } from '../../bridge/types'
import type { FinalStats, Status } from '../../engine/types'
import type { Key } from '../../i18n'
import { abilityItems, itemItems, moveItems, speciesItems } from '../../state/catalog'
import { useApp, useT } from '../../state/hooks'
import { getLib } from '../../state/lib'
import { statusOptions } from '../../state/status'
import {
  MULTI_HIT_MAX,
  NATURES,
  STAT_ORDER,
  changeSpecies,
  computeStats,
  engineStats,
  investmentOf,
  investmentTotal,
  legalAbilities,
  setInvestment,
  setIv,
  speciesRecord,
  statLimits,
} from '../../state/sets'
import type { StatKey } from '../../storage/types'
import { emptySpread } from '../../storage/types'
import { Field, Segmented, Stepper, Toggle } from '../../ui/controls'
import { SearchOverlay } from '../../ui/SearchOverlay'
import { LegalBadge } from '../regulation/LegalBadge'
import './editor.css'
import { own } from '../../own'

export const TYPES = [
  'Normal',
  'Fire',
  'Water',
  'Electric',
  'Grass',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dragon',
  'Dark',
  'Steel',
  'Fairy',
] as const

const BOOST_KEYS: BoostKey[] = ['atk', 'def', 'spa', 'spd', 'spe']

type Picker = { kind: 'species' | 'item' | 'ability' } | { kind: 'move'; slot: number } | null

export interface PokemonEditorProps {
  gen: DataGenId
  value: SavedSetLike
  onChange: (next: SavedSetLike) => void
  /**
   * Show the per-battle state (status, current HP, boosts, Terastallized/Dynamax toggles).
   * Team editing (Phase 5b) can hide it.
   */
  battleState?: boolean
  /** Final stats the engine computed for this build (matchup screen); computed on demand if absent. */
  stats?: FinalStats
  /** Regulation whose legal pool the pickers offer; defaults to the app's active regulation. */
  regulation?: string
}

/**
 * Controlled editor of one build. Reusable: the matchup screen wraps it in a bottom sheet, the
 * team editor (Phase 5b) can render it directly.
 */
export function PokemonEditor({
  gen,
  value: set,
  onChange,
  battleState = true,
  stats,
  regulation: regulationProp,
}: PokemonEditorProps) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const activeRegulation = useApp((s) => s.regulation)
  const regulation = regulationProp ?? activeRegulation
  const [picker, setPicker] = useState<Picker>(null)
  const { bridge } = getLib()
  const meta = GEN_META[gen]
  const lim = statLimits(meta)
  const name = (kind: 'species' | 'moves' | 'items' | 'abilities', id: string) =>
    bridge.displayName(gen, kind, id, lang)
  const statLabel = (s: StatKey) => t(`stat.${s}` as Key)
  const rec = speciesRecord(gen, set.speciesId)
  const abilities = legalAbilities(gen, set.speciesId)
  const patch = (p: Partial<SavedSetLike>) => onChange({ ...set, ...p })

  const closePicker = () => setPicker(null)

  // ----- moves ---------------------------------------------------------------------------------
  const setOverride = (i: number, p: Partial<MoveOverride>) => {
    const ov = Array.from({ length: set.moveIds.length }, (_, k) => set.moveOverrides?.[k])
    const merged = Object.fromEntries(
      Object.entries({ ...ov[i], ...p }).filter(([, v]) => v !== undefined && v !== false),
    ) as MoveOverride
    ov[i] = Object.keys(merged).length ? merged : undefined
    patch({ moveOverrides: ov })
  }
  const pickMove = (slot: number, id: string) => {
    const moveIds = [...set.moveIds]
    const ov = Array.from({ length: moveIds.length }, (_, k) => set.moveOverrides?.[k])
    moveIds[slot] = id
    ov[slot] = undefined
    patch({ moveIds, moveOverrides: ov })
    closePicker()
  }
  const removeMove = (slot: number) =>
    patch({
      moveIds: set.moveIds.filter((_, k) => k !== slot),
      moveOverrides: (set.moveOverrides ?? []).filter((_, k) => k !== slot),
    })

  // ----- stats ---------------------------------------------------------------------------------
  const inv = investmentOf(meta, set)
  const total = investmentTotal(inv)
  const engineFinals = useMemo(() => stats ?? engineStats(gen, set), [stats, gen, set])
  const finals = engineFinals ?? (rec ? computeStats(meta, rec.bs, set) : undefined)
  const unit = t(`unit.${lim.system}` as Key)
  const iv = { ...emptySpread(31), ...set.ivs }
  // Gens 1-2: HP DVs are derived from the others and Special DVs are shared (SpD mirrors SpA).
  const statRows = STAT_ORDER.filter((s) => meta.engineGen > 2 || (s !== 'hp' && s !== 'spd'))
  const sysLabel = (s: StatKey) =>
    meta.engineGen <= 2 && s === 'spa' ? t('stat.sp') : statLabel(s)

  // Formes are offered only when legal in the regulation (strict, like the species picker).
  const formeLegal = (id: string) => bridge.isSpeciesLegal(gen, regulation, id)
  const megaForms = (rec?.formes ?? [])
    .map((id) => speciesRecord(gen, id))
    .filter((r) => r?.isMega && formeLegal(r.id))
  const baseRec =
    rec?.isMega && rec.base && formeLegal(rec.base) ? speciesRecord(gen, rec.base) : undefined
  const switchForme = (id: string, requiredItem?: string) => {
    const next = changeSpecies(gen, set, id)
    if (requiredItem && meta.hasItems) next.itemId = requiredItem
    onChange(next)
  }

  const boosts = set.boosts ?? {}

  return (
    <div className="editor">
      <section className="editor__section" aria-labelledby="ed-basic">
        <h3 id="ed-basic">{t('ed.basics')}</h3>
        <LegalBadge gen={gen} regulation={regulation} set={set} detail />
        <button type="button" className="picker" onClick={() => setPicker({ kind: 'species' })}>
          <span className="picker__label">{t('ed.species')}</span>
          <span className="picker__value">{name('species', set.speciesId)}</span>
          <span aria-hidden="true">🔍</span>
        </button>
        {(megaForms.length > 0 || baseRec) && (
          <div className="chips" role="group" aria-label={t('ed.formes')}>
            {baseRec && (
              <button type="button" className="chip" onClick={() => switchForme(baseRec.id)}>
                {name('species', baseRec.id)}
              </button>
            )}
            {megaForms.map(
              (r) =>
                r && (
                  <button
                    type="button"
                    key={r.id}
                    className="chip"
                    aria-pressed={r.id === set.speciesId}
                    onClick={() => switchForme(r.id, r.requiredItem)}
                  >
                    {name('species', r.id)}
                  </button>
                ),
            )}
          </div>
        )}
        <div className="editor__grid">
          {!meta.usesStatPoints && (
            <div className="field">
              <span className="field__label">{t('ed.level')}</span>
              <Stepper
                label={t('ed.level')}
                value={set.level ?? 50}
                min={1}
                max={100}
                onChange={(level) => patch({ level })}
                decLabel={t('common.decrease', { what: t('ed.level') })}
                incLabel={t('common.increase', { what: t('ed.level') })}
              />
            </div>
          )}
          {meta.engineGen >= 3 && (
            <Field label={t('ed.nature')}>
              <select
                className="select"
                value={set.nature ?? 'Serious'}
                onChange={(e) => patch({ nature: e.target.value })}
              >
                {Object.entries(NATURES).map(([n, pm]) => (
                  <option key={n} value={n}>
                    {t(`nature.${n}` as Key)}
                    {pm ? ` (+${statLabel(pm[0])} −${statLabel(pm[1])})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {meta.hasAbilities &&
          (abilities.length ? (
            <button type="button" className="picker" onClick={() => setPicker({ kind: 'ability' })}>
              <span className="picker__label">{t('ed.ability')}</span>
              <span className="picker__value">
                {set.abilityId ? name('abilities', set.abilityId) : t('ed.none')}
              </span>
              <span aria-hidden="true">🔍</span>
            </button>
          ) : (
            // No ability data for this species: the calculator's own default ability applies.
            <div className="picker picker--static" aria-disabled="true">
              <span className="picker__label">{t('ed.ability')}</span>
              <span className="picker__value">{t('ed.abilityDefault')}</span>
            </div>
          ))}
        {meta.hasItems && (
          <button type="button" className="picker" onClick={() => setPicker({ kind: 'item' })}>
            <span className="picker__label">{t('ed.item')}</span>
            <span className="picker__value">
              {set.itemId ? name('items', set.itemId) : t('ed.noItem')}
            </span>
            <span aria-hidden="true">🔍</span>
          </button>
        )}
      </section>

      <section className="editor__section" aria-labelledby="ed-moves">
        <h3 id="ed-moves">{t('ed.moves')}</h3>
        {Array.from({ length: Math.min(4, set.moveIds.length + 1) }, (_, i) => {
          const id = set.moveIds[i]
          if (id === undefined) {
            return (
              <button
                key={i}
                type="button"
                className="picker picker--add"
                onClick={() => setPicker({ kind: 'move', slot: i })}
              >
                + {t('ed.addMove')}
              </button>
            )
          }
          const ov = set.moveOverrides?.[i]
          const maxHits = own(MULTI_HIT_MAX, id)
          const mrec = bridge.getBridge(gen).records.moves.get(id)
          const cat = mrec && 'category' in mrec ? mrec.category : undefined
          return (
            <div className="moveslot" key={`${i}-${id}`}>
              <div className="moveslot__head">
                <button
                  type="button"
                  className="picker"
                  onClick={() => setPicker({ kind: 'move', slot: i })}
                  aria-label={`${t('ed.move', { n: i + 1 })}: ${name('moves', id)}`}
                >
                  <span className="picker__label">{t('ed.move', { n: i + 1 })}</span>
                  <span className="picker__value">{name('moves', id)}</span>
                  <span aria-hidden="true">🔍</span>
                </button>
                <button
                  type="button"
                  className="btn btn--icon"
                  aria-label={t('ed.removeMove', { move: name('moves', id) })}
                  onClick={() => removeMove(i)}
                >
                  ✕
                </button>
              </div>
              <div className="moveslot__opts">
                <Toggle
                  label={t('ed.crit')}
                  checked={!!ov?.crit}
                  onChange={(crit) => setOverride(i, { crit })}
                />
                {meta.hasZMoves && cat !== 'Status' && (
                  <Toggle
                    label={t('ed.zmove')}
                    checked={!!ov?.z}
                    onChange={(z) => setOverride(i, { z })}
                  />
                )}
                {gen === 'za' && (
                  <Toggle
                    label={t('ed.plus')}
                    checked={!!ov?.plus}
                    onChange={(plus) => setOverride(i, { plus })}
                  />
                )}
              </div>
              {maxHits && (
                <Segmented
                  wrap
                  label={t('ed.hits')}
                  value={ov?.hits ?? 0}
                  onChange={(h) => setOverride(i, { hits: h === 0 ? undefined : h })}
                  options={[
                    { value: 0, label: t('ed.hitsAuto') },
                    ...Array.from({ length: maxHits - 1 }, (_, k) => ({
                      value: k + 2,
                      label: `${k + 2}×`,
                    })),
                  ]}
                />
              )}
            </div>
          )
        })}
        {!bridge.movesForSpecies(gen, set.speciesId).learnsetReliable && (
          <p className="notice" role="note">
            {t('ed.learnsetUnreliable')}
          </p>
        )}
      </section>

      <section className="editor__section" aria-labelledby="ed-stats">
        <h3 id="ed-stats">{t(`ed.stats.${lim.system}` as Key)}</h3>
        {lim.total !== undefined && (
          <p className={`counter${total > lim.total ? ' counter--over' : ''}`} role="status">
            {t('ed.remaining', { left: lim.total - total, total: lim.total })}
          </p>
        )}
        {statRows.map((s) => {
          const label = sysLabel(s)
          return (
            <div className="statrow" key={s}>
              <span className="statrow__name">{label}</span>
              <span className="statrow__final" aria-label={t('ed.finalStat', { stat: label })}>
                {finals ? finals[s] : '–'}
              </span>
              <>
                <input
                  className="statrow__slider"
                  type="range"
                  min={0}
                  max={lim.max}
                  step={lim.step}
                  value={inv[s]}
                  aria-label={`${label} ${unit}`}
                  onChange={(e) => onChange(setInvestment(meta, set, s, Number(e.target.value)))}
                />
                <Stepper
                  label={`${label} ${unit}`}
                  value={inv[s]}
                  min={0}
                  max={lim.max}
                  step={lim.step}
                  onChange={(v) => onChange(setInvestment(meta, set, s, v))}
                  decLabel={t('common.decrease', { what: label })}
                  incLabel={t('common.increase', { what: label })}
                />
                <span className="statrow__quick">
                  <button
                    type="button"
                    className="btn"
                    aria-label={`${label} 0`}
                    onClick={() => onChange(setInvestment(meta, set, s, 0))}
                  >
                    0
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-label={`${label} ${lim.max}`}
                    onClick={() => onChange(setInvestment(meta, set, s, lim.max))}
                  >
                    {lim.max}
                  </button>
                </span>
              </>
            </div>
          )
        })}
        {(lim.system === 'evs-ivs' || lim.system === 'avs') && (
          <details className="more">
            <summary>{t('ed.ivs')}</summary>
            {statRows.map((s) => (
              <div className="ivrow" key={s}>
                <span>{sysLabel(s)}</span>
                <Stepper
                  label={`${sysLabel(s)} IV`}
                  value={iv[s]}
                  min={0}
                  max={31}
                  onChange={(v) => onChange(setIv(set, s, v))}
                  decLabel={t('common.decrease', { what: `${sysLabel(s)} IV` })}
                  incLabel={t('common.increase', { what: `${sysLabel(s)} IV` })}
                />
              </div>
            ))}
          </details>
        )}
      </section>

      {battleState && (
        <section className="editor__section" aria-labelledby="ed-battle">
          <h3 id="ed-battle">{t('ed.battle')}</h3>
          <div className="editor__grid">
            <Field label={t('ed.status')}>
              <select
                className="select"
                value={set.status ?? 'Healthy'}
                onChange={(e) => patch({ status: e.target.value as Status })}
              >
                {statusOptions(gen).map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}` as Key)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="field">
              <span className="field__label">{t('ed.hp')}</span>
              <Stepper
                label={t('ed.hp')}
                value={set.percentHP ?? 100}
                min={1}
                max={100}
                step={5}
                format={(v) => `${v}%`}
                onChange={(percentHP) => patch({ percentHP })}
                decLabel={t('common.decrease', { what: t('ed.hp') })}
                incLabel={t('common.increase', { what: t('ed.hp') })}
              />
            </div>
          </div>
          <input
            className="statrow__slider statrow__slider--wide"
            type="range"
            min={1}
            max={100}
            value={set.percentHP ?? 100}
            aria-label={t('ed.hp')}
            onChange={(e) => patch({ percentHP: Number(e.target.value) })}
          />
          {meta.hasTera && (
            <div className="editor__grid">
              <Field label={t('ed.teraType')}>
                <select
                  className="select"
                  value={set.teraType ?? ''}
                  onChange={(e) => patch({ teraType: e.target.value || undefined })}
                >
                  <option value="">{t('ed.none')}</option>
                  {[...TYPES, 'Stellar'].map((ty) => (
                    <option key={ty} value={ty}>
                      {t(`type.${ty}` as Key)}
                    </option>
                  ))}
                </select>
              </Field>
              <Toggle
                label={t('ed.terastallized')}
                checked={!!set.terastallized}
                disabled={!set.teraType}
                onChange={(terastallized) => patch({ terastallized })}
              />
            </div>
          )}
          {meta.hasDynamax && (
            <>
              <Toggle
                label={t('ed.dynamax')}
                checked={!!set.dynamax}
                onChange={(dynamax) => patch({ dynamax, ...(dynamax ? {} : { gmax: false }) })}
              />
              {set.dynamax && (
                <Toggle
                  label={t('ed.gmax')}
                  checked={!!set.gmax}
                  onChange={(gmax) => patch({ gmax })}
                />
              )}
            </>
          )}
          <h4>{t('ed.boosts')}</h4>
          {BOOST_KEYS.filter((k) => !(meta.engineGen === 1 && k === 'spd')).map((k) => {
            const label = meta.engineGen === 1 && k === 'spa' ? t('stat.sp') : statLabel(k)
            return (
              <div className="ivrow" key={k}>
                <span>{label}</span>
                <Stepper
                  label={`${label} ${t('ed.boost')}`}
                  value={boosts[k] ?? 0}
                  min={-6}
                  max={6}
                  format={(v) => (v > 0 ? `+${v}` : String(v))}
                  onChange={(v) => patch({ boosts: { ...boosts, [k]: v } })}
                  decLabel={t('common.decrease', { what: `${label} ${t('ed.boost')}` })}
                  incLabel={t('common.increase', { what: `${label} ${t('ed.boost')}` })}
                />
              </div>
            )
          })}
        </section>
      )}

      {picker?.kind === 'species' && (
        <SearchOverlay
          title={t('ed.species')}
          placeholder={t('search.species')}
          items={speciesItems(gen, lang, regulation)}
          onClose={closePicker}
          onPick={(id) => {
            onChange(changeSpecies(gen, set, id))
            closePicker()
          }}
        />
      )}
      {picker?.kind === 'ability' && (
        <SearchOverlay
          title={t('ed.ability')}
          placeholder={t('search.ability')}
          items={abilityItems(gen, lang, abilities)}
          onClose={closePicker}
          onPick={(id) => {
            patch({ abilityId: id })
            closePicker()
          }}
        />
      )}
      {picker?.kind === 'item' && (
        <SearchOverlay
          title={t('ed.item')}
          placeholder={t('search.item')}
          items={itemItems(gen, lang, regulation)}
          clearLabel={t('ed.noItem')}
          onClose={closePicker}
          onPick={(id) => {
            const next = { ...set }
            if (id) next.itemId = id
            else delete next.itemId
            onChange(next)
            closePicker()
          }}
        />
      )}
      {picker?.kind === 'move' &&
        (() => {
          const { items, reliable } = moveItems(gen, set.speciesId, lang, regulation)
          return (
            <SearchOverlay
              title={t('ed.move', { n: picker.slot + 1 })}
              placeholder={t('search.move')}
              items={items}
              notice={reliable ? undefined : t('ed.learnsetUnreliable')}
              onClose={closePicker}
              onPick={(id) => pickMove(picker.slot, id)}
            />
          )
        })()}
    </div>
  )
}

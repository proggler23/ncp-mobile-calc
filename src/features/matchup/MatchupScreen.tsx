import { useState } from 'react'
import { pickSpecies, swapSides, type Side } from '../../state/app'
import { speciesItems } from '../../state/catalog'
import { useApp, useT } from '../../state/hooks'
import { SearchOverlay } from '../../ui/SearchOverlay'
import { ChipsRow } from './ChipsRow'
import { EditorSheet } from './EditorSheet'
import { FieldSheet } from './FieldSheet'
import { FieldSummary } from './FieldSummary'
import { MoveResults } from './MoveResults'
import { PokemonCard } from './PokemonCard'
import { PresetRow } from './PresetRow'
import { SupportNudge } from './SupportNudge'
import './matchup.css'

type Sheet = 'field' | Side | null

/** The main "stacked matchup" screen. Loaded lazily together with the bridge/engine. */
export default function MatchupScreen() {
  const t = useT()
  const gen = useApp((s) => s.gen)
  const lang = useApp((s) => s.lang)
  const mine = useApp((s) => s.mine)
  const opp = useApp((s) => s.opp)
  const busy = useApp((s) => s.status === 'loading')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [search, setSearch] = useState<Side | null>(null)

  const sides: Record<Side, typeof mine> = { mine, opp }
  return (
    <div className="matchup" aria-busy={busy}>
      <div className="matchup__top">
        <ChipsRow />
        <PokemonCard
          side="mine"
          gen={gen}
          set={mine}
          onSearch={() => setSearch('mine')}
          onEdit={() => setSheet('mine')}
        />
        <button type="button" className="swap" onClick={swapSides} disabled={!mine && !opp}>
          ⇅ {t('swap')}
        </button>
        <PokemonCard
          side="opp"
          gen={gen}
          set={opp}
          onSearch={() => setSearch('opp')}
          onEdit={() => setSheet('opp')}
        />
        <PresetRow />
      </div>
      <MoveResults />
      <SupportNudge />
      <footer className="footer">
        <FieldSummary />
        <div className="footer__btns">
          <button type="button" className="btn" onClick={() => setSheet('field')}>
            ⚙ {t('field.button')}
          </button>
          <button type="button" className="btn" disabled={!mine} onClick={() => setSheet('mine')}>
            ✎ {t('card.mine')}
          </button>
          <button type="button" className="btn" disabled={!opp} onClick={() => setSheet('opp')}>
            ✎ {t('card.opp')}
          </button>
        </div>
      </footer>

      {sheet === 'field' && <FieldSheet onClose={() => setSheet(null)} />}
      {(sheet === 'mine' || sheet === 'opp') && sides[sheet] && (
        <EditorSheet side={sheet} onClose={() => setSheet(null)} />
      )}
      {search && (
        <SearchOverlay
          title={t(search === 'mine' ? 'search.titleMine' : 'search.titleOpp')}
          placeholder={t('search.species')}
          items={speciesItems(gen, lang)}
          onClose={() => setSearch(null)}
          onPick={(id) => {
            const side = search
            setSearch(null)
            void pickSpecies(side, id)
          }}
        />
      )}
      {busy && (
        <div className="busy" role="status">
          {t('loading.gen')}
        </div>
      )}
    </div>
  )
}

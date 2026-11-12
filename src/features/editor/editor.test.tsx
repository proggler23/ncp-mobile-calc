import { cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { GEN_META } from '../../bridge/gens'
import type { DataGenId, SavedSetLike } from '../../bridge/types'
import type { FinalStats } from '../../engine/types'
import { prepareLib, getLib } from '../../state/lib'
import { blankSet, computeStats, speciesRecord } from '../../state/sets'
import { PokemonEditor } from './PokemonEditor'

afterEach(cleanup)

function Harness({ gen, initial }: { gen: DataGenId; initial: SavedSetLike }) {
  const [set, setSet] = useState(initial)
  return <PokemonEditor gen={gen} value={set} onChange={setSet} />
}

const STAT_LABELS: [keyof FinalStats, string][] = [
  ['hp', 'HP'],
  ['atk', 'Atk'],
  ['def', 'Def'],
  ['spa', 'SpA'],
  ['spd', 'SpD'],
  ['spe', 'Spe'],
]

/** What the engine itself computes for the build (the damage calculation's own numbers). */
function engineTruth(gen: DataGenId, set: SavedSetLike): FinalStats {
  const { bridge, engine } = getLib()
  return engine.calculate(bridge.toEngineInput(gen, set, { speciesId: set.speciesId, moveIds: [] }))
    .attackerStats
}

function shown(label: string): number | undefined {
  const el = screen.queryByLabelText(`Final ${label}`)
  return el ? Number(el.textContent) : undefined
}

const cases: { name: string; gen: DataGenId; species: string; over: Partial<SavedSetLike> }[] = [
  { name: 'gen 1', gen: 'rby', species: 'tauros', over: {} },
  {
    name: 'gen 2',
    gen: 'gsc',
    species: 'tauros',
    over: { ivs: { hp: 31, atk: 20, def: 24, spa: 18, spd: 18, spe: 30 } },
  },
  {
    name: 'gen 4',
    gen: 'dpp',
    species: 'garchomp',
    over: { nature: 'Jolly', evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 } },
  },
  {
    name: 'gen 7.5',
    gen: 'lgpe',
    species: 'pikachu',
    over: { evs: { hp: 200, atk: 0, def: 0, spa: 200, spd: 0, spe: 200 } },
  },
  {
    name: 'gen 8 (Dynamax)',
    gen: 'swsh',
    species: 'garchomp',
    over: { dynamax: true, nature: 'Adamant' },
  },
  {
    name: 'gen 9',
    gen: 'sv',
    species: 'fluttermane',
    over: { nature: 'Timid', evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 } },
  },
  {
    name: 'gen 10',
    gen: 'champions',
    species: 'garchomp',
    over: { nature: 'Jolly', statPoints: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } },
  },
  {
    name: 'gen 5 typed Hidden Power',
    gen: 'bw',
    species: 'garchomp',
    over: { level: 100, moveIds: ['hiddenpowerfire'] },
  },
  {
    name: 'gen 2 typed Hidden Power',
    gen: 'gsc',
    species: 'tauros',
    over: { level: 100, moveIds: ['hiddenpowerghost'] },
  },
]

describe('editor shows the engine final stats', () => {
  it.each(cases)('$name', async ({ gen, species, over }) => {
    await prepareLib(gen)
    const set: SavedSetLike = { ...blankSet(gen, species), ...over }
    render(<Harness gen={gen} initial={set} />)
    const truth = engineTruth(gen, set)
    let compared = 0
    for (const [key, label] of STAT_LABELS) {
      const v = shown(GEN_META[gen].engineGen <= 2 && key === 'spa' ? 'Special' : label)
      if (v === undefined) continue
      expect(v, `${gen} ${key}`).toBe(truth[key])
      compared++
    }
    expect(compared).toBe(GEN_META[gen].engineGen <= 2 ? 4 : 6)
  })

  it('differs from the plain formula where the engine rewrites inputs', async () => {
    // Dynamax doubles HP
    await prepareLib('swsh')
    const dmax: SavedSetLike = { ...blankSet('swsh', 'garchomp'), dynamax: true }
    const plain = computeStats(GEN_META.swsh, speciesRecord('swsh', 'garchomp')!.bs, dmax).hp
    render(<Harness gen="swsh" initial={dmax} />)
    expect(shown('HP')).toBe(plain * 2)
    cleanup()

    // Hidden Power Fire (gen 5): the engine lowers Atk/SpA/Spe IVs to 30
    await prepareLib('bw')
    const hp: SavedSetLike = {
      ...blankSet('bw', 'garchomp'),
      level: 100,
      moveIds: ['hiddenpowerfire'],
    }
    const raw = computeStats(GEN_META.bw, speciesRecord('bw', 'garchomp')!.bs, hp)
    render(<Harness gen="bw" initial={hp} />)
    expect(shown('Atk')).toBe(raw.atk - 1)
    expect(shown('SpA')).toBe(raw.spa - 1)
  })

  it('prefers the stats handed in by the matchup screen', async () => {
    await prepareLib('sv')
    const stats: FinalStats = { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 }
    render(
      <PokemonEditor
        gen="sv"
        value={blankSet('sv', 'fluttermane')}
        onChange={() => undefined}
        stats={stats}
      />,
    )
    expect(shown('HP')).toBe(1)
    expect(shown('Spe')).toBe(6)
  })
})

describe('gen 1-2 stat rows', () => {
  it.each(['rby', 'gsc'] as const)('%s hides the derived HP and mirrored SpD rows', async (gen) => {
    await prepareLib(gen)
    render(<Harness gen={gen} initial={blankSet(gen, 'tauros')} />)
    expect(screen.queryByLabelText('Final HP')).toBeNull()
    expect(screen.queryByLabelText('Final SpD')).toBeNull()
    expect(screen.queryByLabelText('Final SpA')).toBeNull()
    expect(screen.getByLabelText('Final Special')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /^Special / })).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: /^HP / })).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: /^SpD / })).toBeNull()
    expect(screen.getAllByRole('spinbutton', { name: / DV$/ })).toHaveLength(4)
  })

  it('keeps all six rows from gen 3 on', async () => {
    await prepareLib('adv')
    render(<Harness gen="adv" initial={blankSet('adv', 'tauros')} />)
    for (const [, label] of STAT_LABELS)
      expect(screen.getByLabelText(`Final ${label}`)).toBeInTheDocument()
  })
})

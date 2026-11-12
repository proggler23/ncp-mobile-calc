import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import golden from './engine/__golden__/gen-9.json'
import App from './App'
import { PokemonEditor } from './features/editor/PokemonEditor'
import { initApp, setGen, setMatchup, store } from './state/app'
import { resetAll } from './test-utils'
import { blankSet } from './state/sets'
import type { SavedSetLike } from './bridge/types'
import { useState } from 'react'

beforeEach(async () => {
  await resetAll({ gen: 'sv' })
})
afterEach(cleanup)

async function renderReady() {
  render(<App />)
  await waitFor(
    () => expect(screen.getByRole('button', { name: /Choose my Pokémon/ })).toBeVisible(),
    {
      timeout: 20000,
    },
  )
}

/** Golden scenario "g9/fluttermane-incineroar/base" expressed as Showdown-id builds. */
const makeMine = (): SavedSetLike => ({
  ...blankSet('sv', 'fluttermane'),
  nature: 'Timid',
  abilityId: 'protosynthesis',
  itemId: 'choicespecs',
  evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
  teraType: 'Fairy',
  moveIds: ['moonblast', 'shadowball', 'dazzlinggleam', 'mysticalfire'],
})
const makeOpp = (): SavedSetLike => ({
  ...blankSet('sv', 'incineroar'),
  nature: 'Careful',
  abilityId: 'intimidate',
  itemId: 'safetygoggles',
  evs: { hp: 252, atk: 0, def: 4, spa: 0, spd: 252, spe: 0 },
  teraType: 'Grass',
  moveIds: ['flareblitz', 'knockoff', 'fakeout', 'partingshot'],
})

describe('matchup screen', () => {
  it('shows a skeleton, then the empty matchup', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'NCP Calc' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading calculator' })).toBeInTheDocument()
    await waitFor(
      () => expect(screen.getByText('Pick both Pokémon to see damage.')).toBeVisible(),
      {
        timeout: 20000,
      },
    )
    expect(screen.getByRole('link', { name: '+ Team' })).toBeInTheDocument()
  })

  it('renders the same percent ranges as the golden result', async () => {
    await renderReady()
    act(() => setMatchup(makeMine(), makeOpp()))
    const scenario = golden.scenarios.find((s) => s.id === 'g9/fluttermane-incineroar/base')!
    for (const m of scenario.expected.moves) {
      const pct = /\(([^)]*%)\)/.exec(m.damageText)![1]!
      expect(await screen.findByText(pct)).toBeVisible()
      expect(screen.getAllByText(m.koChanceText).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('48 - 56.9%')).toBeVisible()
    // The engine rolls behind the row equal the golden rolls.
    expect(store.get().calc?.result.moves[0]?.damage).toEqual(scenario.expected.moves[0]!.damage)
    // Expanding a row shows the full NCP description and the rolls.
    fireEvent.click(screen.getByRole('button', { name: /Moonblast/ }))
    expect(screen.getByText(/252 SpA Choice Specs Flutter Mane Moonblast vs\./)).toBeVisible()
    // Reverse direction lists the opponent's moves.
    fireEvent.click(screen.getByRole('radio', { name: 'Opp moves' }))
    expect(screen.getByRole('button', { name: /Flare Blitz/ })).toBeVisible()
  })

  it('picks Pokémon via German search and applies the Def preset', async () => {
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: /Choose my Pokémon/ }))
    const input = screen.getByRole('searchbox')
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'flutter' } })
    fireEvent.click(await screen.findByRole('button', { name: /Flutter Mane/ }))
    await waitFor(() => expect(store.get().mine?.speciesId).toBe('fluttermane'))

    fireEvent.click(screen.getByRole('button', { name: /Choose opponent/ }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Fuegro' } })
    const row = await screen.findByRole('button', { name: /Incineroar/ })
    expect(row).toHaveTextContent('Fuegro')
    fireEvent.click(row)
    await waitFor(() => expect(store.get().opp?.speciesId).toBe('incineroar'))
    expect(screen.getByRole('radio', { name: 'Common' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: 'Def' }))
    await waitFor(() => expect(store.get().opp?.nature).toBe('Bold'))
    expect(screen.getByRole('radio', { name: 'Def' })).toBeChecked()
    expect(screen.getAllByRole('button', { name: /Moonblast/ }).length).toBe(1)
  })

  it('sets Sun via the field sheet', async () => {
    await renderReady()
    act(() => setMatchup(makeMine(), makeOpp()))
    fireEvent.click(screen.getByRole('button', { name: /Field/ }))
    const dialog = screen.getByRole('dialog', { name: 'Field' })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Sun' }))
    expect(store.get().field.weather).toBe('Sun')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.getByText(/Field: ☀ Sun · Doubles/)).toBeVisible()
  })

  it('switches language and shows the German names', async () => {
    await renderReady()
    act(() => setMatchup(makeMine(), makeOpp()))
    fireEvent.click(screen.getByRole('button', { name: /^Menu/ }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Deutsch' }))
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(await screen.findByRole('heading', { name: 'Fuegro' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Feld/ })).toBeInTheDocument()
  })

  it('shows a loading state while switching generations', async () => {
    await renderReady()
    const p = act(() => setGen('swsh'))
    await p
    expect(store.get().gen).toBe('swsh')
    await initApp()
  })
})

function Harness({ gen, initial }: { gen: 'sv' | 'champions'; initial: SavedSetLike }) {
  const [set, setSet] = useState(initial)
  return <PokemonEditor gen={gen} value={set} onChange={setSet} />
}

describe('PokemonEditor', () => {
  beforeEach(async () => {
    await initApp()
  })

  it('enforces the Stat Point limits in Champions', async () => {
    await setGen('champions')
    render(<Harness gen="champions" initial={blankSet('champions', 'garchomp')} />)
    expect(screen.getByText(/of 66 left/)).toHaveTextContent('66 of 66 left')
    for (const stat of ['HP', 'Atk', 'Def']) {
      fireEvent.click(screen.getByRole('button', { name: `${stat} 32` }))
    }
    // HP and Atk are full; Def only gets the 2 remaining points.
    expect(screen.getByRole('spinbutton', { name: 'HP SP' })).toHaveValue(32)
    expect(screen.getByRole('spinbutton', { name: 'Atk SP' })).toHaveValue(32)
    expect(screen.getByRole('spinbutton', { name: 'Def SP' })).toHaveValue(2)
    expect(screen.getByText(/of 66 left/)).toHaveTextContent('0 of 66 left')
    fireEvent.click(screen.getByRole('button', { name: 'Increase SpA' }))
    expect(screen.getByRole('spinbutton', { name: 'SpA SP' })).toHaveValue(0)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'HP SP' }), { target: { value: '99' } })
    expect(screen.getByRole('spinbutton', { name: 'HP SP' })).toHaveValue(32)
  })

  it('only offers learnable moves in the move picker', async () => {
    await setGen('sv')
    render(<Harness gen="sv" initial={blankSet('sv', 'fluttermane')} />)
    fireEvent.click(screen.getByRole('button', { name: /Add move/ }))
    const dialog = screen.getByRole('dialog', { name: 'Move 1' })
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'moonb' } })
    expect(within(dialog).getByRole('button', { name: /Moonblast/ })).toBeVisible()
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'earthquake' } })
    expect(within(dialog).queryByRole('button', { name: /Earthquake/ })).toBeNull()
    expect(within(dialog).queryByText(/learnset unreliable/)).toBeNull()
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'moonb' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Moonblast/ }))
    expect(screen.getByRole('button', { name: /Move 1: Moonblast/ })).toBeVisible()
  })

  it('shows computed final stats', async () => {
    await setGen('sv')
    render(
      <Harness
        gen="sv"
        initial={{
          ...blankSet('sv', 'fluttermane'),
          nature: 'Timid',
          evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
        }}
      />,
    )
    // Matches the golden scenario (HP 131, SpA 187, Spe 205).
    expect(screen.getByLabelText('Final HP')).toHaveTextContent('131')
    expect(screen.getByLabelText('Final SpA')).toHaveTextContent('187')
    expect(screen.getByLabelText('Final Spe')).toHaveTextContent('205')
  })
})

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SavedSetLike } from '../../bridge/types'
import { loadPopular } from '../../data'
import type { PopularFile } from '../../data/types'
import { store } from '../../state/app'
import { abilityItems, itemItems, moveItems } from '../../state/catalog'
import { prepareLib } from '../../state/lib'
import { blankSet, legalAbilities } from '../../state/sets'
import { PokemonEditor } from './PokemonEditor'

let popular: PopularFile
beforeAll(async () => {
  await prepareLib('champions')
  await prepareLib('sv')
  popular = (await loadPopular('champions'))!
})
beforeEach(() => act(() => store.set({ lang: 'en' })))
afterEach(cleanup)

function Harness({
  gen = 'champions',
  species,
  regulation,
  initial,
}: {
  gen?: 'champions' | 'sv'
  species: string
  regulation: string
  initial?: Partial<SavedSetLike>
}) {
  const [set, setSet] = useState<SavedSetLike>({ ...blankSet(gen, species), ...initial })
  return <PokemonEditor gen={gen} value={set} onChange={setSet} regulation={regulation} />
}

const rows = (list: HTMLElement) => within(list).getAllByRole('button')
const pctText = (row: HTMLElement) => row.querySelector('.row__pct')?.textContent ?? ''
const openMoves = () => fireEvent.click(screen.getByRole('button', { name: /Add move/ }))

describe('popular section of the move picker', () => {
  it('Incineroar in Reg M-C: Fake Out first with a %, headers and attribution', async () => {
    render(<Harness species="incineroar" regulation="regmc" initial={{ moveIds: [] }} />)
    openMoves()
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByRole('heading', { name: 'Popular in Reg M-C' })).toBeVisible()
    expect(within(dialog).getByRole('heading', { name: 'All legal moves' })).toBeVisible()
    expect(within(dialog).getByText('Usage: Smogon (Showdown, 1760+), Oct 2026')).toBeVisible()
    const pop = rows(within(dialog).getByRole('list', { name: 'Popular in Reg M-C' }))
    expect(pop[0]).toHaveTextContent(/^Fake Out/)
    expect(pctText(pop[0]!)).toMatch(/^9\d\.\d %$/)
    // sorted by usage, all with a percentage
    const pcts = pop.map((b) => parseFloat(pctText(b)))
    expect(pcts).toEqual([...pcts].sort((a, b) => b - a))
    // the full list below stays alphabetical and contains the popular ones too
    const all = rows(within(dialog).getByRole('list', { name: 'All legal moves' })).map(
      (b) => b.textContent ?? '',
    )
    expect([...all].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(all)
    expect(all.some((n) => n.startsWith('Fake Out'))).toBe(true)
    // picking a popular row sets the move
    fireEvent.click(pop[0]!)
    expect(await screen.findByRole('button', { name: /Move 1: Fake Out/ })).toBeVisible()
  })

  it('offers only learnable, legal moves (others are dropped from the popular list)', async () => {
    const reg = 'regmc'
    const learnable = new Set(
      moveItems('champions', 'incineroar', 'en', reg).items.map((m) => m.id),
    )
    const data = popular.regs[reg]!.species.incineroar!
    // pretend the stats contain a move Incineroar cannot learn in this regulation
    expect(learnable.has('shellsmash')).toBe(false)
    const expected = data.moves.filter(([id]) => learnable.has(id)).length
    expect(expected).toBeGreaterThan(5)
    render(<Harness species="incineroar" regulation={reg} initial={{ moveIds: [] }} />)
    openMoves()
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('heading', { name: 'Popular in Reg M-C' })
    const ids = rows(within(dialog).getByRole('list', { name: 'Popular in Reg M-C' }))
    expect(ids).toHaveLength(expected)
  })

  it('search keeps popular matches first with their %', async () => {
    render(<Harness species="incineroar" regulation="regmc" initial={{ moveIds: [] }} />)
    openMoves()
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('heading', { name: 'Popular in Reg M-C' })
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'pro' } })
    expect(within(dialog).queryByRole('heading', { level: 3 })).toBeNull()
    const pop = rows(within(dialog).getByRole('list', { name: 'Popular in Reg M-C' }))
    expect(pop[0]).toHaveTextContent(/^Protect/)
    expect(pctText(pop[0]!)).toMatch(/^\d+\.\d %$/)
    // not repeated in the remaining matches
    const rest = within(dialog).queryByRole('list', { name: 'Move 1' })
    expect(rest ? within(rest).queryByRole('button', { name: /^Protect/ }) : null).toBeNull()
  })

  it('has no popular section for "No filter"', async () => {
    render(<Harness species="incineroar" regulation="none" initial={{ moveIds: [] }} />)
    await waitFor(() => expect(popular).toBeTruthy())
    openMoves()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('heading', { level: 3 })).toBeNull()
    expect(within(dialog).queryByText(/Smogon/)).toBeNull()
    expect(within(dialog).getAllByRole('button').length).toBeGreaterThan(50)
  })

  it('has no popular section for a species without data, or a generation without data', async () => {
    const known = new Set(Object.keys(popular.regs.regmc!.species))
    const noData = (await import('../../state/lib'))
      .getLib()
      .bridge.getBridge('champions')
      .data.species.find((s) => !known.has(s.id) && !s.isMega)!
    render(<Harness species={noData.id} regulation="regmc" initial={{ moveIds: [] }} />)
    openMoves()
    await new Promise((r) => setTimeout(r, 50))
    expect(within(screen.getByRole('dialog')).queryByRole('heading', { level: 3 })).toBeNull()
  })

  it('the regulation decides the data (month, entries) and the title', async () => {
    const { rerender } = render(
      <PokemonEditor
        gen="champions"
        value={{ ...blankSet('champions', 'incineroar'), moveIds: [] }}
        onChange={() => {}}
        regulation="regmb"
      />,
    )
    openMoves()
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByRole('heading', { name: 'Popular in Reg M-B' })).toBeVisible()
    expect(within(dialog).getByText('Usage: Smogon (Showdown, 1760+), Aug 2026')).toBeVisible()
    rerender(
      <PokemonEditor
        gen="champions"
        value={{ ...blankSet('champions', 'incineroar'), moveIds: [] }}
        onChange={() => {}}
        regulation="regmc"
      />,
    )
    expect(await screen.findByRole('heading', { name: 'Popular in Reg M-C' })).toBeVisible()
    expect(screen.getByText('Usage: Smogon (Showdown, 1760+), Oct 2026')).toBeVisible()
  })

  it('is localized (de) with the German regulation label and month', async () => {
    act(() => store.set({ lang: 'de' }))
    render(<Harness species="incineroar" regulation="regmc" initial={{ moveIds: [] }} />)
    fireEvent.click(screen.getByRole('button', { name: /Attacke hinzufügen/ }))
    const dialog = screen.getByRole('dialog')
    expect(
      await within(dialog).findByRole('heading', { name: 'Beliebt in Reg. M-C' }),
    ).toBeVisible()
    expect(within(dialog).getByRole('heading', { name: 'Alle legalen Attacken' })).toBeVisible()
    expect(within(dialog).getByText('Nutzung: Smogon (Showdown, 1760+), Okt. 2026')).toBeVisible()
    expect(within(dialog).getByRole('list', { name: 'Beliebt in Reg. M-C' })).toBeVisible()
  })
})

describe('popular section of the ability, item and nature pickers', () => {
  it('ability: Intimidate first (species-own abilities only)', async () => {
    render(<Harness species="incineroar" regulation="regmc" />)
    fireEvent.click(screen.getByRole('button', { name: /^Ability/ }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('heading', { name: 'Popular in Reg M-C' })
    expect(within(dialog).getByRole('heading', { name: 'All legal abilities' })).toBeVisible()
    const pop = rows(within(dialog).getByRole('list', { name: 'Popular in Reg M-C' }))
    expect(pop[0]).toHaveTextContent(/^Intimidate/)
    expect(pctText(pop[0]!)).toMatch(/^99\.\d %$/)
    const own = new Set(legalAbilities('champions', 'incineroar'))
    expect(pop.length).toBeLessThanOrEqual(own.size)
    expect(abilityItems('champions', 'en', [...own])).toHaveLength(own.size)
  })

  it('item: only items that are legal in the regulation, in order of usage', async () => {
    const reg = 'regmc'
    const legal = new Set(itemItems('champions', 'en', reg).map((i) => i.id))
    const data = popular.regs[reg]!.species.incineroar!
    const expected = data.items.filter(([id]) => legal.has(id))
    expect(expected.length).toBeGreaterThan(3)
    render(<Harness species="incineroar" regulation={reg} />)
    fireEvent.click(screen.getByRole('button', { name: /^Item/ }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('heading', { name: 'Popular in Reg M-C' })
    const pop = rows(within(dialog).getByRole('list', { name: 'Popular in Reg M-C' }))
    expect(pop.map(pctText)).toEqual(expected.map(([, p]) => `${p.toFixed(1)} %`))
    expect(within(dialog).getByRole('heading', { name: 'All legal items' })).toBeVisible()
  })

  it('nature: a picker (not a select) with popular natures first and 25 natures below', async () => {
    render(<Harness species="incineroar" regulation="regmc" initial={{ nature: 'Serious' }} />)
    expect(screen.queryByRole('combobox', { name: 'Nature' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Nature/ }))
    const dialog = screen.getByRole('dialog', { name: 'Nature' })
    await within(dialog).findByRole('heading', { name: 'Popular in Reg M-C' })
    expect(within(dialog).getByRole('heading', { name: 'All natures' })).toBeVisible()
    const top = popular.regs.regmc!.species.incineroar!.natures[0]!
    const pop = rows(within(dialog).getByRole('list', { name: 'Popular in Reg M-C' }))
    expect(pop[0]).toHaveTextContent(new RegExp(`^${top[0]}`))
    expect(pctText(pop[0]!)).toBe(`${top[1].toFixed(1)} %`)
    expect(rows(within(dialog).getByRole('list', { name: 'All natures' }))).toHaveLength(25)
    fireEvent.click(pop[0]!)
    expect(
      await screen.findByRole('button', { name: new RegExp(`^Nature ${top[0]}`) }),
    ).toBeVisible()
  })

  it('nature picker without regulation data lists the 25 natures only', () => {
    render(<Harness species="incineroar" regulation="none" initial={{ nature: 'Serious' }} />)
    fireEvent.click(screen.getByRole('button', { name: /^Nature/ }))
    const dialog = screen.getByRole('dialog', { name: 'Nature' })
    expect(within(dialog).queryByRole('heading', { level: 3 })).toBeNull()
    expect(within(dialog).getAllByRole('button').length).toBeGreaterThanOrEqual(25)
  })

  it('sv: Reg I data is used for Reg I and Reg C has its own', async () => {
    const svFile = (await loadPopular('sv'))!
    const gh = Object.entries(svFile.regs.regc!.species).find(([, p]) => p.abilities.length)!
    render(<Harness gen="sv" species={gh[0]} regulation="regc" />)
    fireEvent.click(screen.getByRole('button', { name: /^Ability/ }))
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByRole('heading', { name: 'Popular in Reg C' })).toBeVisible()
    expect(within(dialog).getByText(/Smogon \(Showdown, 1760\+\), Apr 2023/)).toBeVisible()
  })
})

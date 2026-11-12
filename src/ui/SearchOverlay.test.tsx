import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { store } from '../state/app'
import { normalizeSearch } from '../data/normalize'
import { SearchOverlay } from './SearchOverlay'
import type { PopularSection, SearchItem } from './SearchOverlay'

const item = (id: string, name: string): SearchItem => ({
  id,
  primary: name,
  keys: [normalizeSearch(name)],
})
const ITEMS = [
  item('closecombat', 'Close Combat'),
  item('fakeout', 'Fake Out'),
  item('flareblitz', 'Flare Blitz'),
  item('knockoff', 'Knock Off'),
  item('protect', 'Protect'),
  item('snarl', 'Snarl'),
]
const POPULAR: PopularSection = {
  title: 'Popular in Reg M-C',
  allTitle: 'All legal moves',
  caption: 'Usage: Smogon (Showdown, 1760+), Oct 2026',
  entries: [
    ['protect', 13.7],
    ['fakeout', 99.1],
    ['notlegal', 50], // not in the list: must be dropped
    ['flareblitz', 94],
  ],
}

beforeEach(() => act(() => store.set({ lang: 'en' })))
afterEach(cleanup)

function open(popular?: PopularSection, onPick = vi.fn()) {
  render(
    <SearchOverlay
      title="Move 1"
      placeholder="Search moves"
      items={ITEMS}
      popular={popular}
      onPick={onPick}
      onClose={() => {}}
    />,
  )
  return onPick
}
const names = (list: HTMLElement) =>
  within(list)
    .getAllByRole('button')
    .map((b) => b.textContent)

describe('SearchOverlay popular section', () => {
  it('shows the popular entries first (by usage, with %), then all items alphabetically', () => {
    open(POPULAR)
    expect(screen.getByRole('heading', { name: 'Popular in Reg M-C' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'All legal moves' })).toBeVisible()
    expect(screen.getByText('Usage: Smogon (Showdown, 1760+), Oct 2026')).toBeVisible()
    expect(names(screen.getByRole('list', { name: 'Popular in Reg M-C' }))).toEqual([
      'Fake Out99.1 %',
      'Flare Blitz94.0 %',
      'Protect13.7 %',
    ])
    expect(names(screen.getByRole('list', { name: 'All legal moves' }))).toEqual(
      ITEMS.map((i) => i.primary),
    )
  })

  it('has no popular section without data or when none of its entries is offered', () => {
    open(undefined)
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
    expect(screen.queryByText(/Smogon/)).toBeNull()
    expect(names(screen.getByRole('list', { name: 'Move 1' }))).toHaveLength(ITEMS.length)
    cleanup()
    open({ ...POPULAR, entries: [['notlegal', 50]] })
    expect(screen.queryByRole('heading', { name: 'Popular in Reg M-C' })).toBeNull()
    expect(screen.queryByText(/Smogon/)).toBeNull()
  })

  it('while searching: matching popular entries first with their %, no duplicates, no headers', () => {
    open(POPULAR)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'o' } })
    // matches (contain "o"): Close Combat, Fake Out, Flare Blitz? no; Knock Off, Protect, Snarl? no
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
    const popular = names(screen.getByRole('list', { name: 'Popular in Reg M-C' }))
    expect(popular).toEqual(['Fake Out99.1 %', 'Protect13.7 %'])
    expect(names(screen.getByRole('list', { name: 'Move 1' }))).toEqual([
      'Close Combat',
      'Knock Off',
    ])
    // a query that only matches non-popular entries shows no popular rows (and no caption)
    fireEvent.change(input, { target: { value: 'snar' } })
    expect(screen.queryByRole('list', { name: 'Popular in Reg M-C' })).toBeNull()
    expect(screen.queryByText(/Smogon/)).toBeNull()
    expect(names(screen.getByRole('list', { name: 'Move 1' }))).toEqual(['Snarl'])
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('Nothing found.')).toBeVisible()
  })

  it('Enter picks the first popular match, a tap picks the tapped row', () => {
    const onPick = open(POPULAR)
    fireEvent.submit(screen.getByRole('search'))
    expect(onPick).toHaveBeenLastCalledWith('fakeout')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'knock' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(onPick).toHaveBeenLastCalledWith('knockoff')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    fireEvent.click(
      within(screen.getByRole('list', { name: 'All legal moves' })).getByRole('button', {
        name: 'Protect',
      }),
    )
    expect(onPick).toHaveBeenLastCalledWith('protect')
  })
})

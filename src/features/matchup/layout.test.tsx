import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../../App'
import { encodeShare } from '../../share/codec'
import {
  flushMatchup,
  initApp,
  pickSpecies,
  resetStore,
  setCardCollapsed,
  setLang,
  setMatchup,
  setRegulation,
  setResultsCollapsed,
  store,
  updateSet,
} from '../../state/app'
import { blankSet } from '../../state/sets'
import { buildSharePayload, openSharedLink } from '../../state/share'
import { importPasteAsTeam } from '../../state/teams'
import { CHAMPIONS_PASTE } from '../../test-fixtures'
import { getRepository } from '../../storage'
import { resetAll } from '../../test-utils'

afterEach(cleanup)
beforeEach(async () => {
  await resetAll({ gen: 'champions' })
})

async function openApp() {
  history.replaceState(null, '', '#/')
  render(<App />)
  await waitFor(() => expect(store.get().booted).toBe(true), { timeout: 20000 })
}

async function withMatchup() {
  await initApp()
  await pickSpecies('mine', 'incineroar')
  await pickSpecies('opp', 'garchomp')
  updateSet('mine', (s) => ({
    ...s,
    moveIds: ['fakeout', 'flareblitz', 'knockoff', 'partingshot'],
    itemId: 'sitrusberry',
  }))
}

const stored = async () => (await (await getRepository()).getSettings()).layout

describe('collapsible results', () => {
  it('collapses to a summary line of the best move, expands again, and persists', async () => {
    await withMatchup()
    await openApp()
    const handle = await screen.findByRole('button', { name: 'Collapse/expand results' })
    expect(handle).toHaveAttribute('aria-expanded', 'true')
    expect(handle).toHaveAttribute('aria-controls', 'results-body')
    expect(document.getElementById('results-body')).not.toBeNull()
    fireEvent.click(handle)
    const collapsed = screen.getByRole('button', { name: /^Collapse\/expand results: / })
    expect(collapsed).toHaveAttribute('aria-expanded', 'false')
    expect(collapsed.textContent).toMatch(/^▲ .+ \d+(\.\d+)?–\d+(\.\d+)?%/)
    expect(collapsed.textContent).toContain('(+')
    expect(document.getElementById('results-body')).toHaveAttribute('inert')
    await waitFor(async () => expect((await stored())?.resultsCollapsed).toBe(true))

    // a new session restores it
    cleanup()
    resetStore()
    await openApp()
    expect(
      await screen.findByRole('button', { name: /^Collapse\/expand results: / }),
    ).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: /^Collapse\/expand results: / }))
    expect(screen.getByRole('button', { name: 'Collapse/expand results' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await waitFor(async () => expect((await stored())?.resultsCollapsed).toBe(false))
  })

  it('says so when there is no damaging move (de)', async () => {
    await initApp()
    setLang('de')
    await pickSpecies('mine', 'incineroar')
    await pickSpecies('opp', 'garchomp')
    updateSet('mine', (s) => ({ ...s, moveIds: ['protect'] }))
    setResultsCollapsed(true)
    await openApp()
    const handle = await screen.findByRole('button', { name: /^Ergebnisse ein-\/ausklappen: / })
    expect(handle).toHaveTextContent('Keine Schadensattacke')
  })

  it('a shared link expands the panel and focuses its row', async () => {
    await withMatchup()
    const token = await encodeShare(
      buildSharePayload(store.get(), { direction: 'forward', index: 1 }),
    )
    setResultsCollapsed(true)
    expect(store.get().layout.resultsCollapsed).toBe(true)
    await openSharedLink(token)
    expect(store.get().layout.resultsCollapsed).toBe(false)
    await waitFor(async () => expect((await stored())?.resultsCollapsed).toBe(false))
  })

  it('the layout preferences are device-local: not part of a backup', async () => {
    await initApp()
    setResultsCollapsed(true)
    setCardCollapsed('opp', true)
    await waitFor(async () => expect((await stored())?.resultsCollapsed).toBe(true))
    const backup = JSON.parse(await (await getRepository()).exportBackup())
    expect(backup.settings.layout).toBeUndefined()
  })
})

describe('collapsible cards', () => {
  it('collapses each side on its own, keeps the chip/search/edit buttons, and persists', async () => {
    await withMatchup()
    await openApp()
    const opp = await screen.findByRole('article', { name: /Opp: Garchomp/ })
    const mine = screen.getByRole('article', { name: /Mine: Incineroar/ })
    fireEvent.click(within(opp).getByRole('button', { name: 'Collapse Opp card' }))
    expect(store.get().layout.cardsCollapsed).toEqual({ mine: false, opp: true })
    expect(within(opp).queryByRole('progressbar')).toBeNull()
    expect(within(mine).getByRole('progressbar')).toBeVisible()
    // one line: name, 100%, status chip and the two action buttons
    expect(within(opp).getByRole('button', { name: /^Garchomp.* · 100%$/ })).toBeVisible()
    expect(within(opp).getByRole('button', { name: /^Status: Healthy/ })).toBeVisible()
    expect(within(opp).getByRole('button', { name: 'Search Opp Pokémon' })).toBeVisible()
    expect(within(opp).getByRole('button', { name: 'Edit Opp Pokémon' })).toBeVisible()
    // the preset row stays
    expect(screen.getByRole('radiogroup', { name: 'Opponent spread' })).toBeVisible()
    await waitFor(async () =>
      expect((await stored())?.cardsCollapsed).toEqual({ opp: true, mine: false }),
    )

    cleanup()
    resetStore()
    await openApp()
    const opp2 = await screen.findByRole('article', { name: /Opp: Garchomp/ })
    expect(within(opp2).getByRole('button', { name: 'Expand Opp card' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    // tapping the name expands
    fireEvent.click(within(opp2).getByRole('button', { name: /^Garchomp/ }))
    expect(store.get().layout.cardsCollapsed.opp).toBe(false)
    await flushMatchup()
  })

  it('the ⚠ icon names the regulation and a tap shows the full text', async () => {
    await initApp()
    act(() => setRegulation('regmb'))
    act(() => setMatchup(blankSet('champions', 'salamence'), blankSet('champions', 'incineroar')))
    await openApp()
    const mine = await screen.findByRole('article', { name: /Mine: Salamence/ })
    const icon = within(mine).getByRole('button', { name: 'Not legal in Reg M-B' })
    expect(icon).toHaveAttribute('aria-expanded', 'false')
    expect(within(mine).queryByRole('note')).toBeNull()
    fireEvent.click(icon)
    expect(within(mine).getByRole('note')).toHaveTextContent(/Not legal in Reg M-B: Pokémon/)
    fireEvent.click(icon)
    expect(within(mine).queryByRole('note')).toBeNull()
    expect(
      within(screen.getByRole('article', { name: /Opp: Incineroar/ })).queryByRole('button', {
        name: /Not legal/,
      }),
    ).toBeNull()
  })
})

describe('team chips row', () => {
  it('shows six short chips with full names as labels, and the switcher behind ▾', async () => {
    await initApp()
    await importPasteAsTeam('champions', CHAMPIONS_PASTE, { name: 'Six' })
    await openApp()
    const group = await screen.findByRole('group', { name: 'Team Six' })
    const chips = within(group).getAllByRole('button')
    expect(chips).toHaveLength(6)
    expect(chips.map((c) => c.textContent)).toEqual([
      'Inci',
      'Garc',
      'Sini',
      'King',
      'Snea',
      'Whim',
    ])
    expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Incineroar',
      'Garchomp',
      'Sinistcha',
      'Kingambit',
      'Sneasler',
      'Whimsicott',
    ])
    expect(chips.every((c) => c.getAttribute('title') === c.getAttribute('aria-label'))).toBe(true)
    // the switcher is a compact ▾ button in the same row, before the chips
    const toggle = screen.getByRole('button', { name: 'Switch team' })
    expect(toggle).toHaveTextContent('▾')
    expect(toggle.parentElement).toBe(group.parentElement)
    expect(screen.queryByLabelText('Active team')).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Active team')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Manage teams' })).toHaveAttribute('href', '#/teams')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByLabelText('Active team')).toBeNull()
  })

  it('without a team: one "+ Team" chip linking to the teams screen', async () => {
    await openApp()
    const add = await screen.findByRole('link', { name: '+ Team' })
    expect(add).toHaveAttribute('href', '#/teams')
    expect(screen.queryByRole('group', { name: /^Team / })).toBeNull()
  })
})

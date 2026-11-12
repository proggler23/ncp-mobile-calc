import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../../App'
import type { SavedSetLike } from '../../bridge/types'
import { initApp, patchField, pickSpecies, resetStore, store, updateSet } from '../../state/app'
import { blankSet } from '../../state/sets'
import { createTeam, saveCustomSet } from '../../state/teams'
import { getRepository } from '../../storage'
import { CHAMPIONS_PASTE } from '../../test-fixtures'
import { resetAll } from '../../test-utils'
import { flushMatchup } from '../../state/app'

const tick = (ms = 30) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

async function openApp(route = '/') {
  history.replaceState(null, '', `#${route}`)
  render(<App />)
  await waitFor(() => expect(store.get().booted).toBe(true), { timeout: 20000 })
}

beforeEach(async () => {
  await resetAll({ gen: 'champions' })
})
afterEach(cleanup)

async function importTeamViaUi(name = 'Paste team') {
  await openApp('/teams')
  fireEvent.click(await screen.findByRole('button', { name: 'Import paste' }))
  const dialog = screen.getByRole('dialog', { name: 'Import Showdown paste' })
  fireEvent.change(within(dialog).getByLabelText('Team name'), { target: { value: name } })
  fireEvent.change(within(dialog).getByLabelText('Showdown paste'), {
    target: { value: CHAMPIONS_PASTE },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }))
  await within(dialog).findByText('Imported 6 Pokémon.')
  return dialog
}

describe('teams screen support card', () => {
  it.each([
    ['en', '☕ Like this app? Support development & hosting'],
    ['de', '☕ Gefällt dir die App? Unterstütze Entwicklung & Hosting'],
  ] as const)('shows a tappable yellow link card, also without teams (%s)', async (lang, label) => {
    await resetAll({ gen: 'champions', lang })
    await openApp('/teams')
    act(() => store.set({ lang }))
    const link = await screen.findByRole('link', { name: label })
    expect(link).toHaveAttribute('href', 'https://buymeacoffee.com/proggler23')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveClass('btn--support', 'support-card')
  })
})

describe('teams screen', () => {
  it('creates a team, adds a member via search with the Common set, and removes it', async () => {
    await openApp('/teams')
    expect(await screen.findByText(/No teams yet/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /New team/ }))
    const nameDialog = screen.getByRole('dialog', { name: 'Create team' })
    fireEvent.change(within(nameDialog).getByLabelText('Team name'), { target: { value: 'Rain' } })
    fireEvent.click(within(nameDialog).getByRole('button', { name: 'Create' }))
    expect(await screen.findByRole('heading', { name: 'Rain' })).toBeVisible()
    // The first team becomes the active one.
    await waitFor(() => expect(store.get().team?.name).toBe('Rain'))

    fireEvent.click(screen.getByRole('button', { name: /Add Pokémon/ }))
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'Incineroar' } })
    fireEvent.click(await screen.findByRole('button', { name: /Incineroar/ }))
    await screen.findByRole('button', { name: 'Edit Incineroar' })
    const member = store.get().teams[0]!.members[0]!
    expect(member.speciesId).toBe('incineroar')
    expect(member.moveIds.length).toBeGreaterThan(0) // usage ("Common") set, not blank

    fireEvent.click(screen.getByRole('button', { name: 'Remove Incineroar' }))
    await waitFor(() => expect(store.get().teams[0]!.members).toHaveLength(0))
  })

  it('imports a six-Pokémon paste, lists warnings and reorders members', async () => {
    const dialog = await importTeamViaUi()
    expect(within(dialog).queryByRole('region', { name: 'Warnings' })).toBeNull() // clean paste
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open team' }))
    await screen.findByRole('heading', { name: 'Paste team' })
    expect(store.get().teams[0]?.members).toHaveLength(6)
    expect(screen.getByRole('button', { name: /Add Pokémon/ })).toBeDisabled()
    expect(screen.getByText('Team is full (6/6).')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Move Garchomp up' }))
    await waitFor(() =>
      expect(
        store
          .get()
          .teams[0]?.members.map((m) => m.speciesId)
          .slice(0, 2),
      ).toEqual(['garchomp', 'incineroar']),
    )
    expect(screen.getByRole('button', { name: 'Move Garchomp up' })).toBeDisabled()
  })

  it('shows import warnings for unknown lines', async () => {
    await openApp('/teams')
    fireEvent.click(await screen.findByRole('button', { name: 'Import paste' }))
    const dialog = screen.getByRole('dialog', { name: 'Import Showdown paste' })
    fireEvent.change(within(dialog).getByLabelText('Showdown paste'), {
      target: {
        value: 'Incineroar\nAbility: Intimidate\n- Totally Fake Move\n\nNotAMon\n- Protect',
      },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }))
    const warnings = await within(dialog).findByRole('region', { name: 'Warnings' })
    expect(within(warnings).getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  it('edits a member with the editor (no battle state) and saves it', async () => {
    const dialog = await importTeamViaUi()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open team' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Incineroar' }))
    const editor = screen.getByRole('dialog', { name: 'Edit Pokémon' })
    expect(within(editor).queryByText('Battle state')).toBeNull()
    fireEvent.click(within(editor).getByRole('button', { name: /^Nature/ }))
    const natures = screen.getByRole('dialog', { name: 'Nature' })
    fireEvent.click(within(natures).getAllByRole('button', { name: /^Jolly/ })[0]!)
    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(store.get().teams[0]?.members[0]?.nature).toBe('Jolly'))
    const saved = await (await getRepository()).getTeam(store.get().teams[0]!.uid)
    expect(saved?.members[0]?.nature).toBe('Jolly')
  })

  it('filters by generation, duplicates and deletes with confirmation', async () => {
    const repo = await getRepository()
    await repo.createTeam({ name: 'Old gen', gen: 'sv' })
    await repo.createTeam({ name: 'Current', gen: 'champions' })
    await openApp('/teams')
    expect(await screen.findByRole('button', { name: 'Open Current' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Open Old gen' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Show teams of'), { target: { value: 'all' } })
    expect(screen.getByRole('button', { name: 'Open Old gen' })).toBeVisible()

    const card = screen.getByRole('button', { name: 'Open Current' }).closest('li')!
    fireEvent.click(within(card).getByRole('button', { name: 'Duplicate' }))
    expect(await screen.findByRole('button', { name: 'Open Current (copy)' })).toBeVisible()

    fireEvent.click(within(card).getByRole('button', { name: /Delete team: Current$/ }))
    const confirm = screen.getByRole('dialog', { name: 'Delete team?' })
    expect(confirm).toHaveTextContent('Delete “Current” permanently?')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open Current' })).toBeNull())
    expect(
      store
        .get()
        .teams.map((t) => t.name)
        .sort(),
    ).toEqual(['Current (copy)', 'Old gen'])
  })

  it('exports the paste text', async () => {
    const dialog = await importTeamViaUi()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open team' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Export paste' }))
    const exp = screen.getByRole('dialog', { name: 'Showdown paste' })
    expect((within(exp).getByRole('textbox') as HTMLTextAreaElement).value).toContain('Incineroar')
    expect(within(exp).getByRole('button', { name: 'Copy' })).toBeVisible()
  })
})

describe('main screen integration', () => {
  it('shows team chips for the active team; tapping one sets my Pokémon', async () => {
    const dialog = await importTeamViaUi()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    // not yet active (it is the first team, so it is)
    await waitFor(() => expect(store.get().team?.name).toBe('Paste team'))
    fireEvent.click(screen.getByRole('button', { name: /Back to calculator/ }))
    const chips = await screen.findByRole('group', { name: 'Team Paste team' })
    expect(within(chips).getAllByRole('button')).toHaveLength(6)
    fireEvent.click(within(chips).getByRole('button', { name: 'Garchomp' }))
    expect(store.get().mine?.speciesId).toBe('garchomp')
    expect(store.get().mineTeamIndex).toBe(1)
    expect(within(chips).getByRole('button', { name: 'Garchomp' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('switches the active team from the chips row', async () => {
    const repo = await getRepository()
    await initApp()
    await createTeam('A', 'champions')
    await createTeam('B', 'champions')
    resetStore()
    await openApp('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Switch team' }))
    fireEvent.change(await screen.findByLabelText('Active team'), {
      target: { value: store.get().teams.find((t) => t.name === 'B')!.uid },
    })
    await waitFor(async () => expect((await repo.getActiveTeam())?.name).toBe('B'))
  })

  it('does not persist battle state into the team; "Save to team" stores set data only', async () => {
    const dialog = await importTeamViaUi()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: /Back to calculator/ }))
    const chips = await screen.findByRole('group', { name: 'Team Paste team' })
    fireEvent.click(within(chips).getByRole('button', { name: 'Incineroar' }))
    const teamBefore = structuredClone(store.get().team)

    // battle-state edits in the editor sheet ...
    fireEvent.click(screen.getByRole('button', { name: /^✎ Mine/ }))
    const editor = await screen.findByRole('dialog', { name: 'My Pokémon' })
    fireEvent.change(within(editor).getByLabelText('Status'), { target: { value: 'Burned' } })
    act(() =>
      updateSet('mine', (s) => ({ ...s, boosts: { atk: 2 }, percentHP: 40, nature: 'Adamant' })),
    )
    await tick()
    // ... leave storage and the active team untouched
    expect(store.get().team).toEqual(teamBefore)
    const stored = await (await getRepository()).getTeam(teamBefore!.uid)
    expect(stored?.members[0]?.nature).toBe('Careful')

    fireEvent.click(within(editor).getByRole('button', { name: 'Save to team' }))
    expect(await within(editor).findByText('Saved to Paste team.')).toBeVisible()
    const after = (await (await getRepository()).getTeam(teamBefore!.uid))!.members[0]!
    expect(after.nature).toBe('Adamant') // set data is saved
    expect(after.uid).toBe(teamBefore!.members[0]!.uid) // updated in place
    expect(after).not.toHaveProperty('boosts')
    expect(after).not.toHaveProperty('status')
    expect(after).not.toHaveProperty('percentHP')
    expect(store.get().teams[0]?.members).toHaveLength(6)
  })

  it('adds a build that is not from a team to a chosen team', async () => {
    await initApp()
    await createTeam('Solo', 'champions')
    resetStore()
    await openApp('/')
    await act(() => pickSpecies('mine', 'garchomp'))
    fireEvent.click(await screen.findByRole('button', { name: /^✎ Mine/ }))
    const editor = await screen.findByRole('dialog', { name: 'My Pokémon' })
    fireEvent.click(within(editor).getByRole('button', { name: 'Save to team' }))
    const chooser = screen.getByRole('dialog', { name: 'Save to which team?' })
    fireEvent.click(within(chooser).getByRole('button', { name: /Solo/ }))
    expect(await within(editor).findByText('Added to Solo.')).toBeVisible()
    expect(store.get().teams[0]?.members.map((m) => m.speciesId)).toEqual(['garchomp'])
    expect(store.get().mineTeamIndex).toBe(0)
  })

  it('offers saved custom sets next to the presets for the opponent', async () => {
    await openApp('/')
    await act(() => pickSpecies('opp', 'incineroar'))
    const custom: SavedSetLike = {
      ...blankSet('champions', 'incineroar'),
      nature: 'Adamant',
      moveIds: ['fakeout', 'flareblitz'],
      boosts: { atk: 6 },
    }
    expect(screen.queryByRole('button', { name: /Saved/ })).toBeNull()
    await act(() => saveCustomSet('champions', 'Banded Blitz', custom))
    fireEvent.click(await screen.findByRole('button', { name: /★ Saved \(1\)/ }))
    const list = screen.getByRole('dialog', { name: 'Saved sets: Incineroar' })
    fireEvent.click(within(list).getByRole('button', { name: /^Banded Blitz/ }))
    expect(store.get().opp?.nature).toBe('Adamant')
    expect(store.get().opp?.moveIds).toEqual(['fakeout', 'flareblitz'])
    expect(store.get().oppPreset).toBeNull()
    const stored = (await (await getRepository()).listCustomSets('champions', 'incineroar'))[0]!
    expect(stored.set).not.toHaveProperty('boosts')
    // Another species does not show it.
    await act(() => pickSpecies('opp', 'garchomp'))
    expect(screen.queryByRole('button', { name: /★ Saved/ })).toBeNull()
  })

  it('saves a custom set from the editor sheet', async () => {
    await openApp('/')
    await act(() => pickSpecies('opp', 'garchomp'))
    fireEvent.click(await screen.findByRole('button', { name: /^✎ Opp/ }))
    const editor = await screen.findByRole('dialog', { name: 'Opponent' })
    fireEvent.click(within(editor).getByRole('button', { name: 'Save as custom set' }))
    const name = screen.getByRole('dialog', { name: 'Save custom set' })
    fireEvent.change(within(name).getByLabelText('Set name'), { target: { value: 'Mine' } })
    fireEvent.click(within(name).getByRole('button', { name: 'Save' }))
    expect(await within(editor).findByText('Saved set “Mine”.')).toBeVisible()
    expect(store.get().customSets.map((c) => c.name)).toEqual(['Mine'])
  })
})

describe('matchup persistence', () => {
  it('restores both builds and the field per generation after a reload', async () => {
    await initApp()
    act(() => {
      store.set({})
    })
    await act(() => pickSpecies('mine', 'garchomp'))
    await act(() => pickSpecies('opp', 'incineroar'))
    act(() => {
      updateSet('mine', (s) => ({ ...s, boosts: { atk: 1 }, nature: 'Jolly' }))
      patchField((f) => ({ ...f, weather: 'Sun', gravity: true }))
    })
    await flushMatchup()

    resetStore() // "reload"
    await initApp()
    const s = store.get()
    expect(s.mine?.speciesId).toBe('garchomp')
    expect(s.mine?.nature).toBe('Jolly')
    expect(s.mine?.boosts).toEqual({ atk: 1 })
    expect(s.opp?.speciesId).toBe('incineroar')
    expect(s.field.weather).toBe('Sun')
    expect(s.field.gravity).toBe(true)
    expect(s.calc?.result.moves.length).toBeGreaterThan(0)
  })

  it('first run defaults to Champions', async () => {
    localStorage.clear()
    const repo = await getRepository()
    expect((await repo.getSettings()).gen).toBe('champions')
  })
})

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SavedSetLike } from '../../bridge/types'
import {
  applyCustomSet,
  initApp,
  pickSpecies,
  selectTeamMember,
  setLang,
  setMatchup,
  setRegulation,
  store,
  updateSet,
} from '../../state/app'
import { blankSet } from '../../state/sets'
import { createTeam, saveCustomSet, switchActiveTeam } from '../../state/teams'
import type { SavedSet } from '../../storage/types'
import { resetAll } from '../../test-utils'
import { EditorSheet } from './EditorSheet'
import { PokemonCard } from './PokemonCard'
import { PresetRow } from './PresetRow'
import { SavedSetsSheet, setSummary } from './SavedSets'
import { useApp, useT } from '../../state/hooks'
import { getLib } from '../../state/lib'

afterEach(cleanup)
beforeEach(async () => {
  await resetAll({ gen: 'champions' })
  await initApp()
})

const build = (id: string, over: Partial<SavedSetLike> = {}): SavedSetLike => ({
  ...blankSet('champions', id),
  nature: 'Adamant',
  abilityId: 'intimidate',
  itemId: 'sitrusberry',
  moveIds: ['fakeout', 'flareblitz', 'knockoff', 'partingshot'],
  statPoints: { hp: 32, atk: 14, def: 10, spa: 0, spd: 10, spe: 0 },
  ...over,
})

const battle = { percentHP: 40, status: 'Burned' as const, boosts: { atk: 2 } }

function Mine() {
  const set = useApp((s) => s.mine)
  return <PokemonCard side="mine" gen="champions" set={set} onSearch={() => {}} onEdit={() => {}} />
}

function Opp() {
  return <PresetRow />
}

async function saveMineAsSet(name: string) {
  await saveCustomSet('champions', name, store.get().mine!)
  await waitFor(() => expect(store.get().customSets).toHaveLength(1))
}

describe('saved sets on both sides', () => {
  it('button is hidden without sets and shows the count on my side', async () => {
    act(() => setMatchup(build('incineroar'), build('garchomp')))
    render(<Mine />)
    expect(screen.queryByRole('button', { name: /Saved/ })).toBeNull()
    await act(() => saveMineAsSet('Main'))
    expect(screen.getByRole('button', { name: /★ Saved \(1\)/ })).toBeInTheDocument()
  })

  it('stays visible when my card is collapsed', async () => {
    act(() => setMatchup(build('incineroar'), build('garchomp')))
    await act(() => saveMineAsSet('Main'))
    act(() =>
      store.set({ layout: { ...store.get().layout, cardsCollapsed: { mine: true, opp: false } } }),
    )
    render(<Mine />)
    expect(screen.getByRole('button', { name: /★ Saved \(1\)/ })).toBeInTheDocument()
  })

  it('loading on mine replaces set data, keeps HP/status/boosts', async () => {
    act(() => setMatchup(build('incineroar'), build('garchomp')))
    await act(() => saveMineAsSet('Main'))
    act(() =>
      updateSet('mine', (s) => ({
        ...s,
        ...battle,
        nature: 'Jolly',
        itemId: 'leftovers',
        moveIds: ['fakeout'],
      })),
    )
    render(<Mine />)
    fireEvent.click(screen.getByRole('button', { name: /★ Saved \(1\)/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Main:/ }))
    const m = store.get().mine!
    expect(m.nature).toBe('Adamant')
    expect(m.itemId).toBe('sitrusberry')
    expect(m.moveIds).toHaveLength(4)
    expect(m.statPoints?.atk).toBe(14)
    expect(m.percentHP).toBe(40)
    expect(m.status).toBe('Burned')
    expect(m.boosts).toEqual({ atk: 2 })
    expect(store.get().lastChanged).toBe('mine')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('loading on the opponent does the same', async () => {
    act(() => setMatchup(build('garchomp'), build('incineroar')))
    await saveCustomSet('champions', 'Opp set', store.get().opp!)
    await waitFor(() => expect(store.get().customSets).toHaveLength(1))
    act(() => updateSet('opp', (s) => ({ ...s, ...battle, nature: 'Jolly', terastallized: true })))
    render(<Opp />)
    fireEvent.click(screen.getByRole('button', { name: /★ Saved \(1\)/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Opp set:/ }))
    const o = store.get().opp!
    expect(o.nature).toBe('Adamant')
    expect(o.percentHP).toBe(40)
    expect(o.status).toBe('Burned')
    expect(o.boosts).toEqual({ atk: 2 })
    expect(o.terastallized).toBeUndefined() // saved set has no Tera type
    expect(store.get().oppPreset).toBeNull()
  })

  it('drops move overrides unless the same move is in the same slot', async () => {
    act(() => setMatchup(build('incineroar'), build('garchomp')))
    await act(() => saveMineAsSet('Main'))
    act(() =>
      updateSet('mine', (s) => ({
        ...s,
        moveIds: ['fakeout', 'knockoff'],
        moveOverrides: [{ crit: true }, { crit: true }],
      })),
    )
    act(() => applyCustomSet('mine', store.get().customSets[0]!))
    expect(store.get().mine?.moveOverrides).toEqual([
      { crit: true },
      undefined,
      undefined,
      undefined,
    ])
  })

  it('a team-sourced mine stays linked and the team is unchanged', async () => {
    const member: SavedSet = {
      ...(build('incineroar', { nature: 'Jolly' }) as SavedSet),
      uid: 'm1',
      gen: 'champions',
    }
    const team = await createTeam('T', 'champions', [member])
    await switchActiveTeam(team.uid)
    act(() => selectTeamMember(0))
    await pickSpecies('opp', 'garchomp')
    await saveCustomSet('champions', 'Alt', build('incineroar', { nature: 'Adamant' }))
    await waitFor(() => expect(store.get().customSets).toHaveLength(1))
    render(<Mine />)
    fireEvent.click(screen.getByRole('button', { name: /★ Saved \(1\)/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Alt:/ }))
    expect(store.get().mine?.nature).toBe('Adamant')
    expect(store.get().mineTeamIndex).toBe(0)
    expect(store.get().team?.members[0]?.nature).toBe('Jolly')
  })
})

describe('editor "Load set…"', () => {
  it('is disabled without saved sets and loads into the editor otherwise', async () => {
    act(() => setMatchup(build('incineroar'), build('garchomp')))
    render(<EditorSheet side="mine" onClose={() => {}} />)
    const none = screen.getByRole('button', { name: 'No saved sets' })
    expect(none).toBeDisabled()
    await act(() => saveMineAsSet('Main'))
    act(() => updateSet('mine', (s) => ({ ...s, nature: 'Jolly' })))
    expect(document.getElementById('ed-nature-value')).toHaveTextContent('Jolly')
    fireEvent.click(screen.getByRole('button', { name: 'Load set…' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: /Saved sets/ })).getByRole('button', {
        name: /^Main:/,
      }),
    )
    await waitFor(() =>
      expect(document.getElementById('ed-nature-value')).toHaveTextContent('Adamant'),
    )
  })

  it('works on the opponent side and localizes', async () => {
    act(() => setMatchup(build('incineroar'), build('garchomp')))
    await saveCustomSet('champions', 'G', store.get().opp!)
    await waitFor(() => expect(store.get().customSets).toHaveLength(1))
    act(() => setLang('de'))
    render(<EditorSheet side="opp" onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Set laden…' })).toBeEnabled()
  })
})

describe('summary and legality', () => {
  function Summary({ all }: { all?: boolean }) {
    const t = useT()
    const lang = useApp((s) => s.lang)
    return (
      <p data-testid="s">{setSummary('champions', store.get().customSets[0]!, lang, t, all)}</p>
    )
  }

  it('formats stat points (Champions), localized, abbreviated', async () => {
    act(() => setMatchup(build('incineroar'), build('garchomp')))
    await saveCustomSet('champions', 'Main', store.get().mine!)
    await waitFor(() => expect(store.get().customSets).toHaveLength(1))
    const { bridge } = getLib()
    const item = (lang: 'en' | 'de') =>
      bridge.displayName('champions', 'items', 'sitrusberry', lang)
    const mv = (id: string, lang: 'en' | 'de') => bridge.displayName('champions', 'moves', id, lang)
    const { rerender } = render(<Summary />)
    expect(screen.getByTestId('s').textContent).toBe(
      `Adamant · 32/14/10/0/10/0 · ${item('en')} · ${mv('fakeout', 'en')}, ${mv('flareblitz', 'en')}, …`,
    )
    rerender(<Summary all />)
    expect(screen.getByTestId('s').textContent).toContain(mv('partingshot', 'en'))
    act(() => setLang('de'))
    rerender(<Summary />)
    expect(screen.getByTestId('s').textContent).toBe(
      `Hart · 32/14/10/0/10/0 · ${item('de')} · ${mv('fakeout', 'de')}, ${mv('flareblitz', 'de')}, …`,
    )
  })

  it('uses EVs outside Champions', async () => {
    const { prepareLib } = await import('../../state/lib')
    await prepareLib('sv')
    const cs = {
      uid: 'x',
      name: 'x',
      gen: 'sv' as const,
      speciesId: 'garchomp',
      set: {
        level: 50,
        nature: 'Jolly',
        moveIds: ['earthquake'],
        evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      },
      createdAt: 1,
      updatedAt: 1,
    }
    function S() {
      const t = useT()
      return <p data-testid="e">{setSummary('sv', cs, 'en', t)}</p>
    }
    render(<S />)
    expect(screen.getByTestId('e').textContent).toMatch(/^Jolly · 4\/252\/0\/0\/0\/252 · /)
  })

  it('shows the ⚠ marker for sets that are illegal in the regulation but keeps them loadable', async () => {
    act(() => setRegulation('regmb'))
    act(() => setMatchup(build('salamence'), build('garchomp')))
    await saveCustomSet('champions', 'Mence', store.get().mine!)
    await waitFor(() => expect(store.get().customSets).toHaveLength(1))
    render(<SavedSetsSheet side="mine" onClose={() => {}} />)
    const row = screen.getByRole('button', { name: /^Mence:.*Not legal in Reg M-B/ })
    expect(row.textContent).toContain('⚠')
    expect(row).toBeEnabled()
  })
})

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GEN_META } from '../../bridge/gens'
import type { DataGenId, SavedSetLike } from '../../bridge/types'
import { initApp, resetStore, setGen, setLang, setMatchup, store } from '../../state/app'
import { useApp } from '../../state/hooks'
import { getLib } from '../../state/lib'
import { blankSet } from '../../state/sets'
import { statusOptions } from '../../state/status'
import { PokemonCard } from './PokemonCard'

afterEach(cleanup)
beforeEach(async () => {
  localStorage.clear()
  const { getRepository } = await import('../../storage')
  await (await getRepository()).setSettings({ gen: 'sv', format: 'doubles', lang: 'en' })
  resetStore()
  await initApp()
})

const mine = (): SavedSetLike => ({
  ...blankSet('sv', 'incineroar'),
  evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 0 },
  moveIds: ['flareblitz', 'knockoff'],
})
const opp = (): SavedSetLike => ({ ...blankSet('sv', 'fluttermane'), moveIds: ['moonblast'] })

function Card({ side = 'mine' as const, gen = 'sv' as DataGenId }) {
  const set = useApp((s) => s[side])
  return <PokemonCard side={side} gen={gen} set={set} onSearch={() => {}} onEdit={() => {}} />
}

describe('status chip', () => {
  it('shows the current status and opens an inline strip', () => {
    act(() => setMatchup(mine(), opp()))
    render(<Card />)
    const chip = screen.getByRole('button', { name: 'Status: Healthy, change' })
    expect(chip).toHaveTextContent('Status: —')
    fireEvent.click(chip)
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('group')).toBeNull()
    fireEvent.click(chip)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('Burned lowers the physical damage exactly as the engine computes it', () => {
    act(() => setMatchup(mine(), opp()))
    const before = store.get().calc!.result.moves[1]!.damageText
    render(<Card />)
    fireEvent.click(screen.getByRole('button', { name: /Status: Healthy/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Burned' }))
    expect(screen.queryByRole('group')).toBeNull()
    expect(store.get().mine?.status).toBe('Burned')
    expect(screen.getByRole('button', { name: 'Status: Burned, change' })).toHaveTextContent('BRN')
    const after = store.get().calc!
    expect(after.result.moves[1]!.damageText).not.toEqual(before)
    const { bridge, engine } = getLib()
    const direct = engine.calculate(
      bridge.toEngineInput('sv', { ...mine(), status: 'Burned' }, opp()),
    )
    expect(direct.moves[1]!.damageText).toEqual(after.result.moves[1]!.damageText)
    expect(after.input.attacker.status).toBe('Burned')
  })

  it('offers Drowsy instead of Asleep in Z-A, shared with the editor helper', async () => {
    expect(statusOptions('za')).toContain('Drowsy')
    expect(statusOptions('za')).not.toContain('Asleep')
    expect(statusOptions('sv')).toContain('Asleep')
    expect(statusOptions('sv')).not.toContain('Drowsy')
    await act(() => setGen('za'))
    act(() => setMatchup(blankSet('za', 'incineroar'), undefined))
    render(<Card gen="za" />)
    fireEvent.click(screen.getByRole('button', { name: /Status: Healthy/ }))
    expect(screen.getByRole('button', { name: 'Drowsy' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Asleep' })).toBeNull()
    expect(GEN_META.za).toBeDefined()
  })

  it('uses German labels', () => {
    act(() => setLang('de'))
    act(() => setMatchup(mine(), opp()))
    render(<Card />)
    fireEvent.click(screen.getByRole('button', { name: 'Status: Gesund, ändern' }))
    for (const n of ['Verbrennung', 'Paralyse', 'Vergiftung', 'Schwere Vergiftung', 'Schlaf'])
      expect(screen.getByRole('button', { name: n })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Paralyse' }))
    expect(screen.getByRole('button', { name: 'Status: Paralyse, ändern' })).toHaveTextContent(
      'PAR',
    )
  })
})

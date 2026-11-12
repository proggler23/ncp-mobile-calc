import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initApp, pickSpecies, updateSet } from '../../state/app'
import { setShareNotice } from '../../state/app'
import { resetAll } from '../../test-utils'
import { resetOverlays } from '../../ui/overlayStack'
import { mockDesktop } from '../../ui/mockDesktop'
import { MoveResults } from './MoveResults'
import { ShareNotice } from './ShareNotice'

beforeEach(async () => {
  resetOverlays()
  await resetAll({ gen: 'champions' })
  await initApp()
  await pickSpecies('mine', 'incineroar')
  await pickSpecies('opp', 'garchomp')
  updateSet('mine', (s) => ({ ...s, moveIds: ['flareblitz'] }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const row = () => document.querySelector<HTMLElement>('.result')!

describe('mouse sharing on desktop', () => {
  it('right-click opens the share popover and suppresses the browser menu', async () => {
    mockDesktop(true)
    render(<MoveResults />)
    await waitFor(() => expect(document.querySelectorAll('.result').length).toBeGreaterThan(0))
    const notPrevented = fireEvent.contextMenu(row())
    expect(notPrevented).toBe(false)
    const pop = await screen.findByRole('dialog', { name: /→ Garchomp$/ })
    expect(pop).toHaveClass('share-popover')
    expect(within(pop).getAllByRole('button')).toHaveLength(3)
  })

  it('right-click does nothing but suppress the menu with a touch device', async () => {
    mockDesktop(false)
    render(<MoveResults />)
    await waitFor(() => expect(document.querySelectorAll('.result').length).toBeGreaterThan(0))
    expect(fireEvent.contextMenu(row())).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('has a hover share icon only on desktop, which opens the popover', async () => {
    mockDesktop(true)
    render(<MoveResults />)
    await waitFor(() => expect(document.querySelectorAll('.result').length).toBeGreaterThan(0))
    fireEvent.click(within(row()).getByRole('button', { name: 'Share calc' }))
    expect(await screen.findByRole('dialog', { name: /→ Garchomp$/ })).toHaveClass('share-popover')
  })

  it('no hover icon on touch', async () => {
    mockDesktop(false)
    render(<MoveResults />)
    await waitFor(() => expect(document.querySelectorAll('.result').length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: 'Share calc' })).toBeNull()
  })
})

describe('floating share notice', () => {
  it('is fixed-positioned content outside the flow (own class, no layout wrapper)', () => {
    act(() => setShareNotice({ kind: 'loaded', id: 1, warnings: [], undo: {} as never }))
    const { container } = render(<ShareNotice />)
    const n = container.querySelector('.share-notice')!
    expect(n).toHaveAttribute('role', 'status')
    expect(n.parentElement).toBe(container)
    expect(screen.getByRole('button', { name: /Undo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    act(() => setShareNotice(undefined))
  })
})

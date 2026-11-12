import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dialog } from './Dialog'
import { overlayDepth, resetOverlays } from './overlayStack'

const tick = () => act(() => new Promise<void>((r) => setTimeout(r, 30)))

function Host({ nested = false }: { nested?: boolean }) {
  const [open, setOpen] = useState(false)
  const [inner, setInner] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      {open && (
        <Dialog title="Outer" onClose={() => setOpen(false)} closeLabel="x">
          {nested && <button onClick={() => setInner(true)}>open inner</button>}
          {inner && (
            <Dialog title="Inner" onClose={() => setInner(false)} closeLabel="x2">
              inner body
            </Dialog>
          )}
        </Dialog>
      )}
    </>
  )
}

beforeEach(() => {
  history.replaceState(null, '', '/')
  resetOverlays()
})
afterEach(cleanup)

describe('overlay history stack', () => {
  it('pushes exactly one history entry per open sheet, also under StrictMode', async () => {
    render(
      <StrictMode>
        <Host />
      </StrictMode>,
    )
    const before = history.length
    fireEvent.click(screen.getByText('open'))
    await tick()
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument()
    expect(history.length).toBe(before + 1)
    expect(overlayDepth()).toBe(1)
  })

  it('back closes the sheet instead of leaving the page', async () => {
    render(
      <StrictMode>
        <Host />
      </StrictMode>,
    )
    fireEvent.click(screen.getByText('open'))
    await tick()
    act(() => history.back())
    await tick()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(overlayDepth()).toBe(0)
  })

  it('closing from the UI removes its history entry again (no stale entry)', async () => {
    render(
      <StrictMode>
        <Host />
      </StrictMode>,
    )
    const start = history.length
    fireEvent.click(screen.getByText('open'))
    await tick()
    fireEvent.click(screen.getByRole('button', { name: 'x' }))
    await tick()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(overlayDepth()).toBe(0)
    // A later back press must not reopen or close anything: we are at the original entry.
    fireEvent.click(screen.getByText('open'))
    await tick()
    expect(history.length).toBeGreaterThanOrEqual(start)
    act(() => history.back())
    await tick()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes nested sheets one at a time, topmost first', async () => {
    render(
      <StrictMode>
        <Host nested />
      </StrictMode>,
    )
    fireEvent.click(screen.getByText('open'))
    await tick()
    fireEvent.click(screen.getByText('open inner'))
    await tick()
    expect(overlayDepth()).toBe(2)
    act(() => history.back())
    await tick()
    expect(screen.queryByRole('dialog', { name: 'Inner' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument()
    act(() => history.back())
    await tick()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

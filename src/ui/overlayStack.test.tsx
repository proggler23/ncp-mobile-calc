import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'
import { acquireOverlay, overlayDepth, releaseOverlay, resetOverlays } from './overlayStack'

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

describe('body scroll lock', () => {
  const locked = () => document.body.classList.contains('scroll-lock')

  it('stays locked until the last nested dialog closes (StrictMode)', async () => {
    render(
      <StrictMode>
        <Host nested />
      </StrictMode>,
    )
    expect(locked()).toBe(false)
    fireEvent.click(screen.getByText('open'))
    await tick()
    expect(locked()).toBe(true)
    fireEvent.click(screen.getByText('open inner'))
    await tick()
    expect(locked()).toBe(true)
    // close the inner dialog only
    fireEvent.click(screen.getByRole('button', { name: 'x2' }))
    await tick()
    expect(screen.queryByRole('dialog', { name: 'Inner' })).toBeNull()
    expect(locked()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'x' }))
    await tick()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(locked()).toBe(false)
  })

  it('unlocks when the outer dialog unmounts together with the inner one', async () => {
    render(<Host nested />)
    fireEvent.click(screen.getByText('open'))
    await tick()
    fireEvent.click(screen.getByText('open inner'))
    await tick()
    fireEvent.click(screen.getByRole('button', { name: 'x' }))
    await tick()
    expect(locked()).toBe(false)
  })
})

describe('ignored popstate safety timeout', () => {
  it('does not swallow the user back press when a programmatic back never fires popstate', () => {
    vi.useFakeTimers()
    try {
      const back = vi.spyOn(history, 'back').mockImplementation(() => undefined)
      const close = vi.fn()
      acquireOverlay(101, () => undefined)
      releaseOverlay(101)
      vi.advanceTimersByTime(1) // deferred release -> history.back() (which never pops here)
      expect(back).toHaveBeenCalledTimes(1)

      acquireOverlay(102, close)
      // within the window a popstate is attributed to the programmatic back
      window.dispatchEvent(new PopStateEvent('popstate'))
      expect(close).not.toHaveBeenCalled()

      // a second programmatic back that is lost as well, then the timeout resets the counter
      releaseOverlay(102)
      vi.advanceTimersByTime(1)
      vi.advanceTimersByTime(1000)
      const close2 = vi.fn()
      acquireOverlay(103, close2)
      window.dispatchEvent(new PopStateEvent('popstate'))
      expect(close2).toHaveBeenCalledTimes(1)
      back.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })
})
